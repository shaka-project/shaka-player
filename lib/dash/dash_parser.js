/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.dash.DashParser');

goog.require('goog.asserts');
goog.require('shaka.abr.Ewma');
goog.require('shaka.dash.ContentProtection');
goog.require('shaka.dash.MpdUtils');
goog.require('shaka.dash.SegmentBase');
goog.require('shaka.dash.SegmentList');
goog.require('shaka.dash.SegmentTemplate');
goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.ContentSteeringManager');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Networking');
goog.require('shaka.util.OperationManager');
goog.require('shaka.util.PeriodCombiner');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.XmlUtils');


/**
 * Creates a new DASH parser.
 *
 * @implements {shaka.extern.ManifestParser}
 * @export
 */
shaka.dash.DashParser = class {
  /** Creates a new DASH parser. */
  constructor() {
    /** @private {?shaka.extern.ManifestConfiguration} */
    this.config_ = null;

    /** @private {?shaka.extern.ManifestParser.PlayerInterface} */
    this.playerInterface_ = null;

    /** @private {!Array.<string>} */
    this.manifestUris_ = [];

    /** @private {?shaka.extern.Manifest} */
    this.manifest_ = null;

    /** @private {number} */
    this.globalId_ = 1;

    /**
     * A map of IDs to Stream objects.
     * ID: Period@id,AdaptationSet@id,@Representation@id
     * e.g.: '1,5,23'
     * @private {!Object.<string, !shaka.extern.Stream>}
     */
    this.streamMap_ = {};

    /**
     * A map of period ids to their durations
     * @private {!Object.<string, number>}
     */
    this.periodDurations_ = {};

    /** @private {shaka.util.PeriodCombiner} */
    this.periodCombiner_ = new shaka.util.PeriodCombiner();

    /**
     * The update period in seconds, or 0 for no updates.
     * @private {number}
     */
    this.updatePeriod_ = 0;

    /**
     * An ewma that tracks how long updates take.
     * This is to mitigate issues caused by slow parsing on embedded devices.
     * @private {!shaka.abr.Ewma}
     */
    this.averageUpdateDuration_ = new shaka.abr.Ewma(5);

    /** @private {shaka.util.Timer} */
    this.updateTimer_ = new shaka.util.Timer(() => {
      this.onUpdate_();
    });

    /** @private {!shaka.util.OperationManager} */
    this.operationManager_ = new shaka.util.OperationManager();

    /**
     * Largest period start time seen.
     * @private {?number}
     */
    this.largestPeriodStartTime_ = null;

    /**
     * Period IDs seen in previous manifest.
     * @private {!Array.<string>}
     */
    this.lastManifestUpdatePeriodIds_ = [];

    /**
     * The minimum of the availabilityTimeOffset values among the adaptation
     * sets.
     * @private {number}
     */
    this.minTotalAvailabilityTimeOffset_ = Infinity;

    /** @private {boolean} */
    this.lowLatencyMode_ = false;

    /** @private {?shaka.util.ContentSteeringManager} */
    this.contentSteeringManager_ = null;
  }

  /**
   * @override
   * @exportInterface
   */
  configure(config) {
    goog.asserts.assert(config.dash != null,
        'DashManifestConfiguration should not be null!');

    this.config_ = config;

    if (this.contentSteeringManager_) {
      this.contentSteeringManager_.configure(this.config_);
    }
  }

  /**
   * @override
   * @exportInterface
   */
  async start(uri, playerInterface) {
    goog.asserts.assert(this.config_, 'Must call configure() before start()!');
    this.lowLatencyMode_ = playerInterface.isLowLatencyMode();
    this.manifestUris_ = [uri];
    this.playerInterface_ = playerInterface;

    const updateDelay = await this.requestManifest_();

    if (this.playerInterface_) {
      this.setUpdateTimer_(updateDelay);
    }

    // Make sure that the parser has not been destroyed.
    if (!this.playerInterface_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
    }

    goog.asserts.assert(this.manifest_, 'Manifest should be non-null!');
    return this.manifest_;
  }

  /**
   * @override
   * @exportInterface
   */
  stop() {
    // When the parser stops, release all segment indexes, which stops their
    // timers, as well.
    for (const stream of Object.values(this.streamMap_)) {
      if (stream.segmentIndex) {
        stream.segmentIndex.release();
      }
    }

    if (this.periodCombiner_) {
      this.periodCombiner_.release();
    }

    this.playerInterface_ = null;
    this.config_ = null;
    this.manifestUris_ = [];
    this.manifest_ = null;
    this.streamMap_ = {};
    this.periodCombiner_ = null;

    if (this.updateTimer_ != null) {
      this.updateTimer_.stop();
      this.updateTimer_ = null;
    }

    if (this.contentSteeringManager_) {
      this.contentSteeringManager_.destroy();
    }

    return this.operationManager_.destroy();
  }

  /**
   * @override
   * @exportInterface
   */
  async update() {
    try {
      await this.requestManifest_();
    } catch (error) {
      if (!this.playerInterface_ || !error) {
        return;
      }
      goog.asserts.assert(error instanceof shaka.util.Error, 'Bad error type');
      this.playerInterface_.onError(error);
    }
  }

  /**
   * @override
   * @exportInterface
   */
  onExpirationUpdated(sessionId, expiration) {
    // No-op
  }

  /**
   * @override
   * @exportInterface
   */
  onInitialVariantChosen(variant) {
    // For live it is necessary that the first time we update the manifest with
    // a shorter time than indicated to take into account that the last segment
    // added could be halfway, for example
    if (this.manifest_ && this.manifest_.presentationTimeline.isLive()) {
      const stream = variant.video || variant.audio;
      if (stream && stream.segmentIndex) {
        const availabilityEnd =
            this.manifest_.presentationTimeline.getSegmentAvailabilityEnd();
        const position = stream.segmentIndex.find(availabilityEnd);
        if (position == null) {
          return;
        }
        const reference = stream.segmentIndex.get(position);
        if (!reference) {
          return;
        }
        this.updatePeriod_ = reference.endTime - availabilityEnd;
        this.setUpdateTimer_(/* offset= */ 0);
      }
    }
  }

  /**
   * @override
   * @exportInterface
   */
  banLocation(uri) {
    if (this.contentSteeringManager_) {
      this.contentSteeringManager_.banLocation(uri);
    }
  }

  /**
   * Makes a network request for the manifest and parses the resulting data.
   *
   * @return {!Promise.<number>} Resolves with the time it took, in seconds, to
   *   fulfill the request and parse the data.
   * @private
   */
  async requestManifest_() {
    const requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
    const type = shaka.net.NetworkingEngine.AdvancedRequestType.MPD;
    const request = shaka.net.NetworkingEngine.makeRequest(
        this.manifestUris_, this.config_.retryParameters);
    const startTime = Date.now();

    const response = await this.makeNetworkRequest_(
        request, requestType, {type});

    // Detect calls to stop().
    if (!this.playerInterface_) {
      return 0;
    }

    // For redirections add the response uri to the first entry in the
    // Manifest Uris array.
    if (response.uri && !this.manifestUris_.includes(response.uri)) {
      this.manifestUris_.unshift(response.uri);
    }

    // This may throw, but it will result in a failed promise.
    await this.parseManifest_(response.data, response.uri);
    // Keep track of how long the longest manifest update took.
    const endTime = Date.now();
    const updateDuration = (endTime - startTime) / 1000.0;
    this.averageUpdateDuration_.sample(1, updateDuration);

    // Let the caller know how long this update took.
    return updateDuration;
  }

  /**
   * Parses the manifest XML.  This also handles updates and will update the
   * stored manifest.
   *
   * @param {BufferSource} data
   * @param {string} finalManifestUri The final manifest URI, which may
   *   differ from this.manifestUri_ if there has been a redirect.
   * @return {!Promise}
   * @private
   */
  async parseManifest_(data, finalManifestUri) {
    const Error = shaka.util.Error;
    const MpdUtils = shaka.dash.MpdUtils;

    const mpd = shaka.util.XmlUtils.parseXml(data, 'MPD');
    if (!mpd) {
      throw new Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_INVALID_XML, finalManifestUri);
    }
    const disableXlinkProcessing = this.config_.dash.disableXlinkProcessing;
    if (disableXlinkProcessing) {
      return this.processManifest_(mpd, finalManifestUri);
    }

    // Process the mpd to account for xlink connections.
    const failGracefully = this.config_.dash.xlinkFailGracefully;
    const xlinkOperation = MpdUtils.processXlinks(
        mpd, this.config_.retryParameters, failGracefully, finalManifestUri,
        this.playerInterface_.networkingEngine);
    this.operationManager_.manage(xlinkOperation);
    const finalMpd = await xlinkOperation.promise;
    return this.processManifest_(finalMpd, finalManifestUri);
  }


  /**
   * Takes a formatted MPD and converts it into a manifest.
   *
   * @param {!Element} mpd
   * @param {string} finalManifestUri The final manifest URI, which may
   *   differ from this.manifestUri_ if there has been a redirect.
   * @return {!Promise}
   * @private
   */
  async processManifest_(mpd, finalManifestUri) {
    const Functional = shaka.util.Functional;
    const XmlUtils = shaka.util.XmlUtils;

    const manifestPreprocessor = this.config_.dash.manifestPreprocessor;
    if (manifestPreprocessor) {
      manifestPreprocessor(mpd);
    }

    // Get any Location elements.  This will update the manifest location and
    // the base URI.
    /** @type {!Array.<string>} */
    let manifestBaseUris = [finalManifestUri];
    /** @type {!Array.<string>} */
    const locations = XmlUtils.findChildren(mpd, 'Location')
        .map(XmlUtils.getContents)
        .filter(Functional.isNotNull);
    if (locations.length > 0) {
      const absoluteLocations = shaka.util.ManifestParserUtils.resolveUris(
          manifestBaseUris, locations);
      this.manifestUris_ = absoluteLocations;
      manifestBaseUris = absoluteLocations;
    }

    let contentSteeringPromise = Promise.resolve();

    const contentSteering = XmlUtils.findChild(mpd, 'ContentSteering');
    if (contentSteering && this.playerInterface_) {
      const hasPrevContentSteeringManager = !!this.contentSteeringManager_;
      if (!this.contentSteeringManager_) {
        this.contentSteeringManager_ =
            new shaka.util.ContentSteeringManager(this.playerInterface_);
      }
      this.contentSteeringManager_.configure(this.config_);
      this.contentSteeringManager_.setBaseUris(manifestBaseUris);
      this.contentSteeringManager_.setManifestType(
          shaka.media.ManifestParser.DASH);
      const defaultPathwayId =
          contentSteering.getAttribute('defaultServiceLocation');
      this.contentSteeringManager_.setDefaultPathwayId(defaultPathwayId);
      if (!hasPrevContentSteeringManager) {
        const uri = XmlUtils.getContents(contentSteering);
        if (uri) {
          const queryBeforeStart =
            XmlUtils.parseAttr(contentSteering, 'queryBeforeStart',
                XmlUtils.parseBoolean, /* defaultValue= */ false);
          if (queryBeforeStart) {
            contentSteeringPromise =
                this.contentSteeringManager_.requestInfo(uri);
          } else {
            this.contentSteeringManager_.requestInfo(uri);
          }
        }
      }
    }

    const uriObjs = XmlUtils.findChildren(mpd, 'BaseURL');
    let calculatedBaseUris;
    let someLocationValid = false;
    if (this.contentSteeringManager_) {
      this.contentSteeringManager_.clearPreviousLocations();
      for (const uriObj of uriObjs) {
        const serviceLocation = uriObj.getAttribute('serviceLocation');
        const uri = XmlUtils.getContents(uriObj);
        if (serviceLocation && uri) {
          this.contentSteeringManager_.addLocation(
              'BaseURL', serviceLocation, uri);
          someLocationValid = true;
        }
      }
    }
    if (!someLocationValid || !this.contentSteeringManager_) {
      const uris = uriObjs.map(XmlUtils.getContents);
      calculatedBaseUris = shaka.util.ManifestParserUtils.resolveUris(
          manifestBaseUris, uris);
    }

    const getBaseUris = () => {
      if (this.contentSteeringManager_) {
        return this.contentSteeringManager_.getLocations('BaseURL');
      }
      if (calculatedBaseUris) {
        return calculatedBaseUris;
      }
      return [];
    };

    let availabilityTimeOffset = 0;
    if (uriObjs && uriObjs.length) {
      availabilityTimeOffset = XmlUtils.parseAttr(
          uriObjs[0], 'availabilityTimeOffset', XmlUtils.parseFloat) || 0;
    }

    const ignoreMinBufferTime = this.config_.dash.ignoreMinBufferTime;
    let minBufferTime = 0;
    if (!ignoreMinBufferTime) {
      minBufferTime =
          XmlUtils.parseAttr(mpd, 'minBufferTime', XmlUtils.parseDuration) || 0;
    }

    this.updatePeriod_ = /** @type {number} */ (XmlUtils.parseAttr(
        mpd, 'minimumUpdatePeriod', XmlUtils.parseDuration, -1));

    const presentationStartTime = XmlUtils.parseAttr(
        mpd, 'availabilityStartTime', XmlUtils.parseDate);
    let segmentAvailabilityDuration = XmlUtils.parseAttr(
        mpd, 'timeShiftBufferDepth', XmlUtils.parseDuration);

    const ignoreSuggestedPresentationDelay =
      this.config_.dash.ignoreSuggestedPresentationDelay;
    let suggestedPresentationDelay = null;
    if (!ignoreSuggestedPresentationDelay) {
      suggestedPresentationDelay = XmlUtils.parseAttr(
          mpd, 'suggestedPresentationDelay', XmlUtils.parseDuration);
    }

    const ignoreMaxSegmentDuration =
        this.config_.dash.ignoreMaxSegmentDuration;
    let maxSegmentDuration = null;
    if (!ignoreMaxSegmentDuration) {
      maxSegmentDuration = XmlUtils.parseAttr(
          mpd, 'maxSegmentDuration', XmlUtils.parseDuration);
    }
    const mpdType = mpd.getAttribute('type') || 'static';

    /** @type {!shaka.media.PresentationTimeline} */
    let presentationTimeline;
    if (this.manifest_) {
      presentationTimeline = this.manifest_.presentationTimeline;

      // Before processing an update, evict from all segment indexes.  Some of
      // them may not get updated otherwise if their corresponding Period
      // element has been dropped from the manifest since the last update.
      // Without this, playback will still work, but this is necessary to
      // maintain conditions that we assert on for multi-Period content.
      // This gives us confidence that our state is maintained correctly, and
      // that the complex logic of multi-Period eviction and period-flattening
      // is correct.  See also:
      // https://github.com/shaka-project/shaka-player/issues/3169#issuecomment-823580634
      for (const stream of Object.values(this.streamMap_)) {
        if (stream.segmentIndex) {
          stream.segmentIndex.evict(
              presentationTimeline.getSegmentAvailabilityStart());
        }
      }
    } else {
      // DASH IOP v3.0 suggests using a default delay between minBufferTime
      // and timeShiftBufferDepth.  This is literally the range of all
      // feasible choices for the value.  Nothing older than
      // timeShiftBufferDepth is still available, and anything less than
      // minBufferTime will cause buffering issues.
      //
      // We have decided that our default will be the configured value, or
      // 1.5 * minBufferTime if not configured. This is fairly conservative.
      // Content providers should provide a suggestedPresentationDelay whenever
      // possible to optimize the live streaming experience.
      const defaultPresentationDelay =
          this.config_.defaultPresentationDelay || minBufferTime * 1.5;
      const presentationDelay = suggestedPresentationDelay != null ?
          suggestedPresentationDelay : defaultPresentationDelay;
      presentationTimeline = new shaka.media.PresentationTimeline(
          presentationStartTime, presentationDelay,
          this.config_.dash.autoCorrectDrift);
    }

    presentationTimeline.setStatic(mpdType == 'static');

    const isLive = presentationTimeline.isLive();

    // If it's live, we check for an override.
    if (isLive && !isNaN(this.config_.availabilityWindowOverride)) {
      segmentAvailabilityDuration = this.config_.availabilityWindowOverride;
    }

    // If it's null, that means segments are always available.  This is always
    // the case for VOD, and sometimes the case for live.
    if (segmentAvailabilityDuration == null) {
      segmentAvailabilityDuration = Infinity;
    }

    presentationTimeline.setSegmentAvailabilityDuration(
        segmentAvailabilityDuration);

    const profiles = mpd.getAttribute('profiles') || '';

    /** @type {shaka.dash.DashParser.Context} */
    const context = {
      // Don't base on updatePeriod_ since emsg boxes can cause manifest
      // updates.
      dynamic: mpdType != 'static',
      presentationTimeline: presentationTimeline,
      period: null,
      periodInfo: null,
      adaptationSet: null,
      representation: null,
      bandwidth: 0,
      indexRangeWarningGiven: false,
      availabilityTimeOffset: availabilityTimeOffset,
      profiles: profiles.split(','),
    };

    const periodsAndDuration = this.parsePeriods_(context, getBaseUris, mpd);
    const duration = periodsAndDuration.duration;
    const periods = periodsAndDuration.periods;

    if (mpdType == 'static' ||
        !periodsAndDuration.durationDerivedFromPeriods) {
      // Ignore duration calculated from Period lengths if this is dynamic.
      presentationTimeline.setDuration(duration || Infinity);
    }

    // The segments are available earlier than the availability start time.
    // If the stream is low latency and the user has not configured the
    // lowLatencyMode, but if it has been configured to activate the
    // lowLatencyMode if a stream of this type is detected, we automatically
    // activate the lowLatencyMode.
    if (this.minTotalAvailabilityTimeOffset_ && !this.lowLatencyMode_) {
      const autoLowLatencyMode = this.playerInterface_.isAutoLowLatencyMode();
      if (autoLowLatencyMode) {
        this.playerInterface_.enableLowLatencyMode();
        this.lowLatencyMode_ = this.playerInterface_.isLowLatencyMode();
      }
    }

    if (this.lowLatencyMode_) {
      presentationTimeline.setAvailabilityTimeOffset(
          this.minTotalAvailabilityTimeOffset_);
    } else if (this.minTotalAvailabilityTimeOffset_) {
      // If the playlist contains AvailabilityTimeOffset value, the
      // streaming.lowLatencyMode value should be set to true to stream with low
      // latency mode.
      shaka.log.alwaysWarn('Low-latency DASH live stream detected, but ' +
        'low-latency streaming mode is not enabled in Shaka Player. ' +
        'Set streaming.lowLatencyMode configuration to true, and see ' +
        'https://bit.ly/3clctcj for details.');
    }

    // Use @maxSegmentDuration to override smaller, derived values.
    presentationTimeline.notifyMaxSegmentDuration(maxSegmentDuration || 1);
    if (goog.DEBUG) {
      presentationTimeline.assertIsValid();
    }

    await this.periodCombiner_.combinePeriods(periods, context.dynamic);

    await contentSteeringPromise;

    // Set minBufferTime to 0 for low-latency DASH live stream to achieve the
    // best latency
    if (this.lowLatencyMode_) {
      minBufferTime = 0;
    }

    // These steps are not done on manifest update.
    if (!this.manifest_) {
      this.manifest_ = {
        presentationTimeline: presentationTimeline,
        variants: this.periodCombiner_.getVariants(),
        textStreams: this.periodCombiner_.getTextStreams(),
        imageStreams: this.periodCombiner_.getImageStreams(),
        offlineSessionIds: [],
        minBufferTime: minBufferTime || 0,
        sequenceMode: this.config_.dash.sequenceMode,
        ignoreManifestTimestampsInSegmentsMode: false,
        type: shaka.media.ManifestParser.DASH,
        serviceDescription: this.parseServiceDescription_(mpd),
      };

      // We only need to do clock sync when we're using presentation start
      // time. This condition also excludes VOD streams.
      if (presentationTimeline.usingPresentationStartTime()) {
        const XmlUtils = shaka.util.XmlUtils;
        const timingElements = XmlUtils.findChildren(mpd, 'UTCTiming');
        const offset = await this.parseUtcTiming_(getBaseUris, timingElements);
        // Detect calls to stop().
        if (!this.playerInterface_) {
          return;
        }
        presentationTimeline.setClockOffset(offset);
      }

      // This is the first point where we have a meaningful presentation start
      // time, and we need to tell PresentationTimeline that so that it can
      // maintain consistency from here on.
      presentationTimeline.lockStartTime();
    } else {
      // Just update the variants and text streams, which may change as periods
      // are added or removed.
      this.manifest_.variants = this.periodCombiner_.getVariants();
      const textStreams = this.periodCombiner_.getTextStreams();
      if (textStreams.length > 0) {
        this.manifest_.textStreams = textStreams;
      }
      this.manifest_.imageStreams = this.periodCombiner_.getImageStreams();

      // Re-filter the manifest.  This will check any configured restrictions on
      // new variants, and will pass any new init data to DrmEngine to ensure
      // that key rotation works correctly.
      this.playerInterface_.filter(this.manifest_);
    }

    // Add text streams to correspond to closed captions.  This happens right
    // after period combining, while we still have a direct reference, so that
    // any new streams will appear in the period combiner.
    this.playerInterface_.makeTextStreamsForClosedCaptions(this.manifest_);
  }

  /**
   * Reads maxLatency and maxPlaybackRate properties from service
   * description element.
   *
   * @param {!Element} mpd
   * @return {?shaka.extern.ServiceDescription}
   * @private
   */
  parseServiceDescription_(mpd) {
    const XmlUtils = shaka.util.XmlUtils;
    const elem = XmlUtils.findChild(mpd, 'ServiceDescription');

    if (!elem ) {
      return null;
    }

    const latencyNode = XmlUtils.findChild(elem, 'Latency');
    const playbackRateNode = XmlUtils.findChild(elem, 'PlaybackRate');

    if ((latencyNode && latencyNode.getAttribute('max')) || playbackRateNode) {
      const maxLatency = latencyNode && latencyNode.getAttribute('max') ?
        parseInt(latencyNode.getAttribute('max'), 10) / 1000 :
        null;
      const maxPlaybackRate = playbackRateNode ?
        parseFloat(playbackRateNode.getAttribute('max')) :
        null;
      const minLatency = latencyNode && latencyNode.getAttribute('min') ?
        parseInt(latencyNode.getAttribute('min'), 10) / 1000 :
        null;
      const minPlaybackRate = playbackRateNode ?
        parseFloat(playbackRateNode.getAttribute('min')) :
        null;

      return {
        maxLatency,
        maxPlaybackRate,
        minLatency,
        minPlaybackRate,
      };
    }

    return null;
  }

  /**
   * Reads and parses the periods from the manifest.  This first does some
   * partial parsing so the start and duration is available when parsing
   * children.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {function():!Array.<string>} getBaseUris
   * @param {!Element} mpd
   * @return {{
   *   periods: !Array.<shaka.extern.Period>,
   *   duration: ?number,
   *   durationDerivedFromPeriods: boolean
   * }}
   * @private
   */
  parsePeriods_(context, getBaseUris, mpd) {
    const XmlUtils = shaka.util.XmlUtils;
    const presentationDuration = XmlUtils.parseAttr(
        mpd, 'mediaPresentationDuration', XmlUtils.parseDuration);

    const periods = [];
    let prevEnd = 0;
    const periodNodes = XmlUtils.findChildren(mpd, 'Period');
    for (let i = 0; i < periodNodes.length; i++) {
      const elem = periodNodes[i];
      const next = periodNodes[i + 1];
      const start = /** @type {number} */ (
        XmlUtils.parseAttr(elem, 'start', XmlUtils.parseDuration, prevEnd));
      const periodId = elem.id;
      const givenDuration =
          XmlUtils.parseAttr(elem, 'duration', XmlUtils.parseDuration);

      let periodDuration = null;
      if (next) {
        // "The difference between the start time of a Period and the start time
        // of the following Period is the duration of the media content
        // represented by this Period."
        const nextStart =
            XmlUtils.parseAttr(next, 'start', XmlUtils.parseDuration);
        if (nextStart != null) {
          periodDuration = nextStart - start;
        }
      } else if (presentationDuration != null) {
        // "The Period extends until the Period.start of the next Period, or
        // until the end of the Media Presentation in the case of the last
        // Period."
        periodDuration = presentationDuration - start;
      }

      const threshold =
          shaka.util.ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS;
      if (periodDuration && givenDuration &&
          Math.abs(periodDuration - givenDuration) > threshold) {
        shaka.log.warning('There is a gap/overlap between Periods', elem);
      }
      // Only use the @duration in the MPD if we can't calculate it.  We should
      // favor the @start of the following Period.  This ensures that there
      // aren't gaps between Periods.
      if (periodDuration == null) {
        periodDuration = givenDuration;
      }

      /**
       * This is to improve robustness when the player observes manifest with
       * past periods that are inconsistent to previous ones.
       *
       * This may happen when a CDN or proxy server switches its upstream from
       * one encoder to another redundant encoder.
       *
       * Skip periods that match all of the following criteria:
       * - Start time is earlier than latest period start time ever seen
       * - Period ID is never seen in the previous manifest
       * - Not the last period in the manifest
       *
       * Periods that meet the aforementioned criteria are considered invalid
       * and should be safe to discard.
       */

      if (this.largestPeriodStartTime_ !== null &&
        periodId !== null && start !== null &&
        start < this.largestPeriodStartTime_ &&
        !this.lastManifestUpdatePeriodIds_.includes(periodId) &&
        i + 1 != periodNodes.length) {
        shaka.log.debug(
            `Skipping Period with ID ${periodId} as its start time is smaller` +
            ' than the largest period start time that has been seen, and ID ' +
            'is unseen before');
        continue;
      }


      // Save maximum period start time if it is the last period
      if (start !== null &&
        (this.largestPeriodStartTime_ === null ||
          start > this.largestPeriodStartTime_)) {
        this.largestPeriodStartTime_ = start;
      }

      // Parse child nodes.
      const info = {
        start: start,
        duration: periodDuration,
        node: elem,
        isLastPeriod: periodDuration == null || !next,
      };
      const period = this.parsePeriod_(context, getBaseUris, info);
      periods.push(period);

      if (context.period.id && periodDuration) {
        this.periodDurations_[context.period.id] = periodDuration;
      }

      if (periodDuration == null) {
        if (next) {
          // If the duration is still null and we aren't at the end, then we
          // will skip any remaining periods.
          shaka.log.warning(
              'Skipping Period', i + 1, 'and any subsequent Periods:', 'Period',
              i + 1, 'does not have a valid start time.', next);
        }

        // The duration is unknown, so the end is unknown.
        prevEnd = null;
        break;
      }

      prevEnd = start + periodDuration;
    } // end of period parsing loop

    // Replace previous seen periods with the current one.
    this.lastManifestUpdatePeriodIds_ = periods.map((el) => el.id);

    if (presentationDuration != null) {
      if (prevEnd != presentationDuration) {
        shaka.log.warning(
            '@mediaPresentationDuration does not match the total duration of ',
            'all Periods.');
        // Assume @mediaPresentationDuration is correct.
      }
      return {
        periods: periods,
        duration: presentationDuration,
        durationDerivedFromPeriods: false,
      };
    } else {
      return {
        periods: periods,
        duration: prevEnd,
        durationDerivedFromPeriods: true,
      };
    }
  }

  /**
   * Parses a Period XML element.  Unlike the other parse methods, this is not
   * given the Node; it is given a PeriodInfo structure.  Also, partial parsing
   * was done before this was called so start and duration are valid.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {function():!Array.<string>} getBaseUris
   * @param {shaka.dash.DashParser.PeriodInfo} periodInfo
   * @return {shaka.extern.Period}
   * @private
   */
  parsePeriod_(context, getBaseUris, periodInfo) {
    const Functional = shaka.util.Functional;
    const XmlUtils = shaka.util.XmlUtils;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    context.period = this.createFrame_(periodInfo.node, null, getBaseUris);
    context.periodInfo = periodInfo;
    context.period.availabilityTimeOffset = context.availabilityTimeOffset;

    // If the period doesn't have an ID, give it one based on its start time.
    if (!context.period.id) {
      shaka.log.info(
          'No Period ID given for Period with start time ' + periodInfo.start +
          ',  Assigning a default');
      context.period.id = '__shaka_period_' + periodInfo.start;
    }

    const eventStreamNodes =
        XmlUtils.findChildren(periodInfo.node, 'EventStream');
    const availabilityStart =
        context.presentationTimeline.getSegmentAvailabilityStart();

    for (const node of eventStreamNodes) {
      this.parseEventStream_(
          periodInfo.start, periodInfo.duration, node, availabilityStart);
    }

    const adaptationSetNodes =
        XmlUtils.findChildren(periodInfo.node, 'AdaptationSet');
    const adaptationSets = adaptationSetNodes
        .map((node) => this.parseAdaptationSet_(context, node))
        .filter(Functional.isNotNull);

    // For dynamic manifests, we use rep IDs internally, and they must be
    // unique.
    if (context.dynamic) {
      const ids = [];
      for (const set of adaptationSets) {
        for (const id of set.representationIds) {
          ids.push(id);
        }
      }

      const uniqueIds = new Set(ids);

      if (ids.length != uniqueIds.size) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.DASH_DUPLICATE_REPRESENTATION_ID);
      }
    }

    const normalAdaptationSets = adaptationSets
        .filter((as) => { return !as.trickModeFor; });

    const trickModeAdaptationSets = adaptationSets
        .filter((as) => { return as.trickModeFor; });

    // Attach trick mode tracks to normal tracks.
    for (const trickModeSet of trickModeAdaptationSets) {
      const targetIds = trickModeSet.trickModeFor.split(' ');
      for (const normalSet of normalAdaptationSets) {
        if (targetIds.includes(normalSet.id)) {
          for (const stream of normalSet.streams) {
            // There may be multiple trick mode streams, but we do not
            // currently support that.  Just choose one.
            // TODO: https://github.com/shaka-project/shaka-player/issues/1528
            stream.trickModeVideo = trickModeSet.streams.find((trickStream) =>
              shaka.util.MimeUtils.getNormalizedCodec(stream.codecs) ==
              shaka.util.MimeUtils.getNormalizedCodec(trickStream.codecs));
          }
        }
      }
    }

    const audioStreams = this.getStreamsFromSets_(
        this.config_.disableAudio,
        normalAdaptationSets,
        ContentType.AUDIO);
    const videoStreams = this.getStreamsFromSets_(
        this.config_.disableVideo,
        normalAdaptationSets,
        ContentType.VIDEO);
    const textStreams = this.getStreamsFromSets_(
        this.config_.disableText,
        normalAdaptationSets,
        ContentType.TEXT);
    const imageStreams = this.getStreamsFromSets_(
        this.config_.disableThumbnails,
        normalAdaptationSets,
        ContentType.IMAGE);

    if (videoStreams.length === 0 && audioStreams.length === 0) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_EMPTY_PERIOD,
      );
    }

    return {
      id: context.period.id,
      audioStreams,
      videoStreams,
      textStreams,
      imageStreams,
    };
  }

  /**
   * Gets the streams from the given sets or returns an empty array if disabled
   * or no streams are found.
   * @param {boolean} disabled
   * @param {!Array.<!shaka.dash.DashParser.AdaptationInfo>} adaptationSets
   * @param {string} contentType
   @private
  */
  getStreamsFromSets_(disabled, adaptationSets, contentType) {
    if (disabled || !adaptationSets.length) {
      return [];
    }

    return adaptationSets.reduce((all, part) => {
      if (part.contentType != contentType) {
        return all;
      }

      all.push(...part.streams);
      return all;
    }, []);
  }

  /**
   * Parses an AdaptationSet XML element.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {!Element} elem The AdaptationSet element.
   * @return {?shaka.dash.DashParser.AdaptationInfo}
   * @private
   */
  parseAdaptationSet_(context, elem) {
    const XmlUtils = shaka.util.XmlUtils;
    const Functional = shaka.util.Functional;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const ContentType = ManifestParserUtils.ContentType;
    const ContentProtection = shaka.dash.ContentProtection;

    context.adaptationSet = this.createFrame_(elem, context.period, null);

    let main = false;
    const roleElements = XmlUtils.findChildren(elem, 'Role');
    const roleValues = roleElements.map((role) => {
      return role.getAttribute('value');
    }).filter(Functional.isNotNull);

    // Default kind for text streams is 'subtitle' if unspecified in the
    // manifest.
    let kind = undefined;
    const isText = context.adaptationSet.contentType == ContentType.TEXT;
    if (isText) {
      kind = ManifestParserUtils.TextStreamKind.SUBTITLE;
    }

    for (const roleElement of roleElements) {
      const scheme = roleElement.getAttribute('schemeIdUri');
      if (scheme == null || scheme == 'urn:mpeg:dash:role:2011') {
        // These only apply for the given scheme, but allow them to be specified
        // if there is no scheme specified.
        // See: DASH section 5.8.5.5
        const value = roleElement.getAttribute('value');
        switch (value) {
          case 'main':
            main = true;
            break;
          case 'caption':
          case 'subtitle':
            kind = value;
            break;
        }
      }
    }

    // Parallel for HLS VIDEO-RANGE as defined in DASH-IF IOP v4.3 6.2.5.1.
    let videoRange;

    // Ref. https://dashif.org/docs/DASH-IF-IOP-v4.3.pdf
    // If signaled, a Supplemental or Essential Property descriptor
    // shall be used, with the schemeIdUri set to
    // urn:mpeg:mpegB:cicp:<Parameter> as defined in
    // ISO/IEC 23001-8 [49] and <Parameter> one of the
    // following: ColourPrimaries, TransferCharacteristics,
    // or MatrixCoefficients.
    const scheme = 'urn:mpeg:mpegB:cicp';
    const transferCharacteristicsScheme = `${scheme}:TransferCharacteristics`;
    const colourPrimariesScheme = `${scheme}:ColourPrimaries`;
    const matrixCoefficientsScheme = `${scheme}:MatrixCoefficients`;

    const getVideoRangeFromTransferCharacteristicCICP = (cicp) => {
      switch (cicp) {
        case 1:
        case 6:
        case 13:
        case 14:
        case 15:
          return 'SDR';
        case 16:
          return 'PQ';
        case 18:
          return 'HLG';
      }
      return undefined;
    };

    const essentialProperties =
        XmlUtils.findChildren(elem, 'EssentialProperty');
    // ID of real AdaptationSet if this is a trick mode set:
    let trickModeFor = null;
    let isFastSwitching = false;
    let unrecognizedEssentialProperty = false;
    for (const prop of essentialProperties) {
      const schemeId = prop.getAttribute('schemeIdUri');
      if (schemeId == 'http://dashif.org/guidelines/trickmode') {
        trickModeFor = prop.getAttribute('value');
      } else if (schemeId == transferCharacteristicsScheme) {
        videoRange = getVideoRangeFromTransferCharacteristicCICP(
            parseInt(prop.getAttribute('value'), 10),
        );
      } else if (schemeId == colourPrimariesScheme ||
                 schemeId == matrixCoefficientsScheme) {
        continue;
      } else if (schemeId == 'urn:mpeg:dash:ssr:2023') {
        isFastSwitching = true;
      } else {
        unrecognizedEssentialProperty = true;
      }
    }

    const supplementalProperties =
        XmlUtils.findChildren(elem, 'SupplementalProperty');
    for (const prop of supplementalProperties) {
      const schemeId = prop.getAttribute('schemeIdUri');
      if (schemeId == transferCharacteristicsScheme) {
        videoRange = getVideoRangeFromTransferCharacteristicCICP(
            parseInt(prop.getAttribute('value'), 10),
        );
      }
    }

    const accessibilities = XmlUtils.findChildren(elem, 'Accessibility');
    const LanguageUtils = shaka.util.LanguageUtils;
    const closedCaptions = new Map();
    /** @type {?shaka.media.ManifestParser.AccessibilityPurpose} */
    let accessibilityPurpose;
    for (const prop of accessibilities) {
      const schemeId = prop.getAttribute('schemeIdUri');
      const value = prop.getAttribute('value');
      if (schemeId == 'urn:scte:dash:cc:cea-608:2015' ) {
        let channelId = 1;
        if (value != null) {
          const channelAssignments = value.split(';');
          for (const captionStr of channelAssignments) {
            let channel;
            let language;
            // Some closed caption descriptions have channel number and
            // language ("CC1=eng") others may only have language ("eng,spa").
            if (!captionStr.includes('=')) {
              // When the channel assignemnts are not explicitly provided and
              // there are only 2 values provided, it is highly likely that the
              // assignments are CC1 and CC3 (most commonly used CC streams).
              // Otherwise, cycle through all channels arbitrarily (CC1 - CC4)
              // in order of provided langs.
              channel = `CC${channelId}`;
              if (channelAssignments.length == 2) {
                channelId += 2;
              } else {
                channelId ++;
              }
              language = captionStr;
            } else {
              const channelAndLanguage = captionStr.split('=');
              // The channel info can be '1' or 'CC1'.
              // If the channel info only has channel number(like '1'), add 'CC'
              // as prefix so that it can be a full channel id (like 'CC1').
              channel = channelAndLanguage[0].startsWith('CC') ?
                  channelAndLanguage[0] : `CC${channelAndLanguage[0]}`;

              // 3 letters (ISO 639-2).  In b/187442669, we saw a blank string
              // (CC2=;CC3=), so default to "und" (the code for "undetermined").
              language = channelAndLanguage[1] || 'und';
            }
            closedCaptions.set(channel, LanguageUtils.normalize(language));
          }
        } else {
          // If channel and language information has not been provided, assign
          // 'CC1' as channel id and 'und' as language info.
          closedCaptions.set('CC1', 'und');
        }
      } else if (schemeId == 'urn:scte:dash:cc:cea-708:2015') {
        let serviceNumber = 1;
        if (value != null) {
          for (const captionStr of value.split(';')) {
            let service;
            let language;
            // Similar to CEA-608, it is possible that service # assignments
            // are not explicitly provided e.g. "eng;deu;swe" In this case,
            // we just cycle through the services for each language one by one.
            if (!captionStr.includes('=')) {
              service = `svc${serviceNumber}`;
              serviceNumber ++;
              language = captionStr;
            } else {
            // Otherwise, CEA-708 caption values take the form "
            // 1=lang:eng;2=lang:deu" i.e. serviceNumber=lang:threelettercode.
              const serviceAndLanguage = captionStr.split('=');
              service = `svc${serviceAndLanguage[0]}`;

              // The language info can be different formats, lang:eng',
              // or 'lang:eng,war:1,er:1'. Extract the language info.
              language = serviceAndLanguage[1].split(',')[0].split(':').pop();
            }
            closedCaptions.set(service, LanguageUtils.normalize(language));
          }
        } else {
          // If service and language information has not been provided, assign
          // 'svc1' as service number and 'und' as language info.
          closedCaptions.set('svc1', 'und');
        }
      } else if (schemeId == 'urn:mpeg:dash:role:2011') {
        // See DASH IOP 3.9.2 Table 4.
        if (value != null) {
          roleValues.push(value);
          if (value == 'captions') {
            kind = ManifestParserUtils.TextStreamKind.CLOSED_CAPTION;
          }
        }
      } else if (schemeId == 'urn:tva:metadata:cs:AudioPurposeCS:2007') {
        // See DASH DVB Document A168 Rev.6 Table 5.
        if (value == '1') {
          accessibilityPurpose =
              shaka.media.ManifestParser.AccessibilityPurpose.VISUALLY_IMPAIRED;
        } else if (value == '2') {
          accessibilityPurpose =
              shaka.media.ManifestParser.AccessibilityPurpose.HARD_OF_HEARING;
        }
      }
    }

    // According to DASH spec (2014) section 5.8.4.8, "the successful processing
    // of the descriptor is essential to properly use the information in the
    // parent element".  According to DASH IOP v3.3, section 3.3.4, "if the
    // scheme or the value" for EssentialProperty is not recognized, "the DASH
    // client shall ignore the parent element."
    if (unrecognizedEssentialProperty) {
      // Stop parsing this AdaptationSet and let the caller filter out the
      // nulls.
      return null;
    }

    const contentProtectionElems =
        XmlUtils.findChildren(elem, 'ContentProtection');
    const contentProtection = ContentProtection.parseFromAdaptationSet(
        contentProtectionElems,
        this.config_.dash.ignoreDrmInfo,
        this.config_.dash.keySystemsByURI);

    const language = shaka.util.LanguageUtils.normalize(
        context.adaptationSet.language || 'und');

    // This attribute is currently non-standard, but it is supported by Kaltura.
    let label = elem.getAttribute('label');

    // See DASH IOP 4.3 here https://dashif.org/docs/DASH-IF-IOP-v4.3.pdf (page 35)
    const labelElements = XmlUtils.findChildren(elem, 'Label');
    if (labelElements && labelElements.length) {
      // NOTE: Right now only one label field is supported.
      const firstLabelElement = labelElements[0];
      if (firstLabelElement.textContent) {
        label = firstLabelElement.textContent;
      }
    }

    // Parse Representations into Streams.
    const representations = XmlUtils.findChildren(elem, 'Representation');
    const streams = representations.map((representation) => {
      const parsedRepresentation = this.parseRepresentation_(context,
          contentProtection, kind, language, label, main, roleValues,
          closedCaptions, representation, accessibilityPurpose);
      if (parsedRepresentation) {
        parsedRepresentation.hdr = parsedRepresentation.hdr || videoRange;
        parsedRepresentation.fastSwitching = isFastSwitching;
      }
      return parsedRepresentation;
    }).filter((s) => !!s);

    if (streams.length == 0) {
      const isImage = context.adaptationSet.contentType == ContentType.IMAGE;
      // Ignore empty AdaptationSets if ignoreEmptyAdaptationSet is true
      // or they are for text/image content.
      if (this.config_.dash.ignoreEmptyAdaptationSet || isText || isImage) {
        return null;
      }
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_EMPTY_ADAPTATION_SET);
    }

    // If AdaptationSet's type is unknown or is ambiguously "application",
    // guess based on the information in the first stream.  If the attributes
    // mimeType and codecs are split across levels, they will both be inherited
    // down to the stream level by this point, so the stream will have all the
    // necessary information.
    if (!context.adaptationSet.contentType ||
        context.adaptationSet.contentType == ContentType.APPLICATION) {
      const mimeType = streams[0].mimeType;
      const codecs = streams[0].codecs;
      context.adaptationSet.contentType =
          shaka.dash.DashParser.guessContentType_(mimeType, codecs);

      for (const stream of streams) {
        stream.type = context.adaptationSet.contentType;
      }
    }

    const adaptationId = context.adaptationSet.id ||
        ('__fake__' + this.globalId_++);

    for (const stream of streams) {
      // Some DRM license providers require that we have a default
      // key ID from the manifest in the wrapped license request.
      // Thus, it should be put in drmInfo to be accessible to request filters.
      for (const drmInfo of contentProtection.drmInfos) {
        drmInfo.keyIds = drmInfo.keyIds && stream.keyIds ?
            new Set([...drmInfo.keyIds, ...stream.keyIds]) :
            drmInfo.keyIds || stream.keyIds;
      }
      if (this.config_.dash.enableAudioGroups) {
        stream.groupId = adaptationId;
      }
    }

    const repIds = representations
        .map((node) => { return node.getAttribute('id'); })
        .filter(shaka.util.Functional.isNotNull);

    return {
      id: adaptationId,
      contentType: context.adaptationSet.contentType,
      language: language,
      main: main,
      streams: streams,
      drmInfos: contentProtection.drmInfos,
      trickModeFor: trickModeFor,
      representationIds: repIds,
    };
  }

  /**
   * Parses a Representation XML element.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.ContentProtection.Context} contentProtection
   * @param {(string|undefined)} kind
   * @param {string} language
   * @param {string} label
   * @param {boolean} isPrimary
   * @param {!Array.<string>} roles
   * @param {Map.<string, string>} closedCaptions
   * @param {!Element} node
   * @param {?shaka.media.ManifestParser.AccessibilityPurpose}
   *   accessibilityPurpose
   *
   * @return {?shaka.extern.Stream} The Stream, or null when there is a
   *   non-critical parsing error.
   * @private
   */
  parseRepresentation_(context, contentProtection, kind, language, label,
      isPrimary, roles, closedCaptions, node, accessibilityPurpose) {
    const XmlUtils = shaka.util.XmlUtils;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    context.representation =
        this.createFrame_(node, context.adaptationSet, null);

    this.minTotalAvailabilityTimeOffset_ =
        Math.min(this.minTotalAvailabilityTimeOffset_,
            context.representation.availabilityTimeOffset);

    if (!this.verifyRepresentation_(context.representation)) {
      shaka.log.warning('Skipping Representation', context.representation);
      return null;
    }
    const periodStart = context.periodInfo.start;

    // NOTE: bandwidth is a mandatory attribute according to the spec, and zero
    // does not make sense in the DASH spec's bandwidth formulas.
    // In some content, however, the attribute is missing or zero.
    // To avoid NaN at the variant level on broken content, fall back to zero.
    // https://github.com/shaka-project/shaka-player/issues/938#issuecomment-317278180
    context.bandwidth =
        XmlUtils.parseAttr(node, 'bandwidth', XmlUtils.parsePositiveInt) || 0;

    /** @type {?shaka.dash.DashParser.StreamInfo} */
    let streamInfo;

    const contentType = context.representation.contentType;
    const isText = contentType == ContentType.TEXT ||
                   contentType == ContentType.APPLICATION;
    const isImage = contentType == ContentType.IMAGE;

    try {
      /** @type {shaka.extern.aes128Key|undefined} */
      let aes128Key = undefined;
      if (contentProtection.aes128Info) {
        const getBaseUris = context.representation.getBaseUris;
        const uris = shaka.util.ManifestParserUtils.resolveUris(
            getBaseUris(), [contentProtection.aes128Info.keyUri]);
        const requestType = shaka.net.NetworkingEngine.RequestType.KEY;
        const request = shaka.net.NetworkingEngine.makeRequest(
            uris, this.config_.retryParameters);

        aes128Key = {
          method: 'AES-128',
          iv: contentProtection.aes128Info.iv,
          firstMediaSequenceNumber: 0,
        };

        // Don't download the key object until the segment is parsed, to
        // avoid a startup delay for long manifests with lots of keys.
        aes128Key.fetchKey = async () => {
          const keyResponse =
              await this.makeNetworkRequest_(request, requestType);

          // keyResponse.status is undefined when URI is
          // "data:text/plain;base64,"
          if (!keyResponse.data || keyResponse.data.byteLength != 16) {
            throw new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.MANIFEST,
                shaka.util.Error.Code.AES_128_INVALID_KEY_LENGTH);
          }

          const algorithm = {
            name: 'AES-CBC',
          };
          aes128Key.cryptoKey = await window.crypto.subtle.importKey(
              'raw', keyResponse.data, algorithm, true, ['decrypt']);
          aes128Key.fetchKey = undefined; // No longer needed.
        };
      }
      const requestSegment = (uris, startByte, endByte, isInit) => {
        return this.requestSegment_(uris, startByte, endByte, isInit);
      };
      if (context.representation.segmentBase) {
        streamInfo = shaka.dash.SegmentBase.createStreamInfo(
            context, requestSegment, aes128Key);
      } else if (context.representation.segmentList) {
        streamInfo = shaka.dash.SegmentList.createStreamInfo(
            context, this.streamMap_, aes128Key);
      } else if (context.representation.segmentTemplate) {
        const hasManifest = !!this.manifest_;

        streamInfo = shaka.dash.SegmentTemplate.createStreamInfo(
            context, requestSegment, this.streamMap_, hasManifest,
            this.config_.dash.initialSegmentLimit, this.periodDurations_,
            aes128Key);
      } else {
        goog.asserts.assert(isText,
            'Must have Segment* with non-text streams.');

        const duration = context.periodInfo.duration || 0;
        streamInfo = {
          generateSegmentIndex: () => {
            const baseUris = context.representation.getBaseUris();
            return Promise.resolve(shaka.media.SegmentIndex.forSingleSegment(
                periodStart, duration, baseUris));
          },
        };
      }
    } catch (error) {
      if ((isText || isImage) &&
          error.code == shaka.util.Error.Code.DASH_NO_SEGMENT_INFO) {
        // We will ignore any DASH_NO_SEGMENT_INFO errors for text/image
        // streams.
        return null;
      }

      // For anything else, re-throw.
      throw error;
    }

    const contentProtectionElems =
        XmlUtils.findChildren(node, 'ContentProtection');
    const keyId = shaka.dash.ContentProtection.parseFromRepresentation(
        contentProtectionElems, contentProtection,
        this.config_.dash.ignoreDrmInfo,
        this.config_.dash.keySystemsByURI);
    const keyIds = new Set(keyId ? [keyId] : []);

    // Detect the presence of E-AC3 JOC audio content, using DD+JOC signaling.
    // See: ETSI TS 103 420 V1.2.1 (2018-10)
    const supplementalPropertyElems =
        XmlUtils.findChildren(node, 'SupplementalProperty');
    const hasJoc = supplementalPropertyElems.some((element) => {
      const expectedUri = 'tag:dolby.com,2018:dash:EC3_ExtensionType:2018';
      const expectedValue = 'JOC';
      return element.getAttribute('schemeIdUri') == expectedUri &&
          element.getAttribute('value') == expectedValue;
    });
    let spatialAudio = false;
    if (hasJoc) {
      spatialAudio = true;
    }

    let forced = false;
    if (isText) {
      // See: https://github.com/shaka-project/shaka-player/issues/2122 and
      // https://github.com/Dash-Industry-Forum/DASH-IF-IOP/issues/165
      forced = roles.includes('forced_subtitle') ||
          roles.includes('forced-subtitle');
    }

    let tilesLayout;
    if (isImage) {
      const essentialPropertyElems =
          XmlUtils.findChildren(node, 'EssentialProperty');
      const thumbnailTileElem = essentialPropertyElems.find((element) => {
        const expectedUris = [
          'http://dashif.org/thumbnail_tile',
          'http://dashif.org/guidelines/thumbnail_tile',
        ];
        return expectedUris.includes(element.getAttribute('schemeIdUri'));
      });
      if (thumbnailTileElem) {
        tilesLayout = thumbnailTileElem.getAttribute('value');
      }
      // Filter image adaptation sets that has no tilesLayout.
      if (!tilesLayout) {
        return null;
      }
    }

    let hdr;
    const profiles = context.profiles;
    const codecs = context.representation.codecs;

    const hevcHDR = 'http://dashif.org/guidelines/dash-if-uhd#hevc-hdr-pq10';
    if (profiles.includes(hevcHDR) && (codecs.includes('hvc1.2.4.L153.B0') ||
        codecs.includes('hev1.2.4.L153.B0'))) {
      hdr = 'PQ';
    }

    const contextId = context.representation.id ?
        context.period.id + ',' + context.representation.id : '';

    /** @type {shaka.extern.Stream} */
    let stream;

    if (contextId && this.streamMap_[contextId]) {
      stream = this.streamMap_[contextId];
    } else {
      stream = {
        id: this.globalId_++,
        originalId: context.representation.id,
        groupId: null,
        createSegmentIndex: () => Promise.resolve(),
        closeSegmentIndex: () => {
          if (stream.segmentIndex) {
            stream.segmentIndex.release();
            stream.segmentIndex = null;
          }
        },
        segmentIndex: null,
        mimeType: context.representation.mimeType,
        codecs: context.representation.codecs,
        frameRate: context.representation.frameRate,
        pixelAspectRatio: context.representation.pixelAspectRatio,
        bandwidth: context.bandwidth,
        width: context.representation.width,
        height: context.representation.height,
        kind,
        encrypted: contentProtection.drmInfos.length > 0,
        drmInfos: contentProtection.drmInfos,
        keyIds,
        language,
        originalLanguage: context.adaptationSet.language,
        label,
        type: context.adaptationSet.contentType,
        primary: isPrimary,
        trickModeVideo: null,
        emsgSchemeIdUris:
            context.representation.emsgSchemeIdUris,
        roles,
        forced,
        channelsCount: context.representation.numChannels,
        audioSamplingRate: context.representation.audioSamplingRate,
        spatialAudio,
        closedCaptions,
        hdr,
        videoLayout: undefined,
        tilesLayout,
        matchedStreams: [],
        accessibilityPurpose,
        external: false,
        fastSwitching: false,
      };
    }

    stream.createSegmentIndex = async () => {
      if (!stream.segmentIndex) {
        stream.segmentIndex = await streamInfo.generateSegmentIndex();
      }
    };

    if (contextId && context.dynamic && !this.streamMap_[contextId]) {
      this.streamMap_[contextId] = stream;
    }

    return stream;
  }

  /**
   * Called when the update timer ticks.
   *
   * @return {!Promise}
   * @private
   */
  async onUpdate_() {
    goog.asserts.assert(this.updatePeriod_ >= 0,
        'There should be an update period');

    shaka.log.info('Updating manifest...');

    // Default the update delay to 0 seconds so that if there is an error we can
    // try again right away.
    let updateDelay = 0;

    try {
      updateDelay = await this.requestManifest_();
    } catch (error) {
      goog.asserts.assert(error instanceof shaka.util.Error,
          'Should only receive a Shaka error');

      // Try updating again, but ensure we haven't been destroyed.
      if (this.playerInterface_) {
        if (this.config_.raiseFatalErrorOnManifestUpdateRequestFailure) {
          this.playerInterface_.onError(error);
          return;
        }
        // We will retry updating, so override the severity of the error.
        error.severity = shaka.util.Error.Severity.RECOVERABLE;
        this.playerInterface_.onError(error);
      }
    }

    // Detect a call to stop()
    if (!this.playerInterface_) {
      return;
    }

    this.playerInterface_.onManifestUpdated();

    this.setUpdateTimer_(updateDelay);
  }

  /**
   * Sets the update timer.  Does nothing if the manifest does not specify an
   * update period.
   *
   * @param {number} offset An offset, in seconds, to apply to the manifest's
   *   update period.
   * @private
   */
  setUpdateTimer_(offset) {
    // NOTE: An updatePeriod_ of -1 means the attribute was missing.
    // An attribute which is present and set to 0 should still result in
    // periodic updates.  For more, see:
    // https://github.com/Dash-Industry-Forum/Guidelines-TimingModel/issues/48
    if (this.updatePeriod_ <= 0) {
      return;
    }

    const finalDelay = Math.max(
        this.updatePeriod_ - offset,
        this.averageUpdateDuration_.getEstimate());

    // We do not run the timer as repeating because part of update is async and
    // we need schedule the update after it finished.
    this.updateTimer_.tickAfter(/* seconds= */ finalDelay);
  }

  /**
   * Creates a new inheritance frame for the given element.
   *
   * @param {!Element} elem
   * @param {?shaka.dash.DashParser.InheritanceFrame} parent
   * @param {?function():!Array.<string>} getBaseUris
   * @return {shaka.dash.DashParser.InheritanceFrame}
   * @private
   */
  createFrame_(elem, parent, getBaseUris) {
    goog.asserts.assert(parent || getBaseUris,
        'Must provide either parent or getBaseUris');
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const XmlUtils = shaka.util.XmlUtils;
    parent = parent || /** @type {shaka.dash.DashParser.InheritanceFrame} */ ({
      contentType: '',
      mimeType: '',
      codecs: '',
      emsgSchemeIdUris: [],
      frameRate: undefined,
      pixelAspectRatio: undefined,
      numChannels: null,
      audioSamplingRate: null,
      availabilityTimeOffset: 0,
      segmentSequenceCadence: 0,
    });
    getBaseUris = getBaseUris || parent.getBaseUris;

    const parseNumber = XmlUtils.parseNonNegativeInt;
    const evalDivision = XmlUtils.evalDivision;

    const uriObjs = XmlUtils.findChildren(elem, 'BaseURL');
    const uris = uriObjs.map(XmlUtils.getContents);

    let contentType = elem.getAttribute('contentType') || parent.contentType;
    const mimeType = elem.getAttribute('mimeType') || parent.mimeType;
    const codecs = elem.getAttribute('codecs') || parent.codecs;
    const frameRate =
        XmlUtils.parseAttr(elem, 'frameRate', evalDivision) || parent.frameRate;
    const pixelAspectRatio =
        elem.getAttribute('sar') || parent.pixelAspectRatio;
    const emsgSchemeIdUris = this.emsgSchemeIdUris_(
        XmlUtils.findChildren(elem, 'InbandEventStream'),
        parent.emsgSchemeIdUris);
    const audioChannelConfigs =
        XmlUtils.findChildren(elem, 'AudioChannelConfiguration');
    const numChannels =
        this.parseAudioChannels_(audioChannelConfigs) || parent.numChannels;
    const audioSamplingRate =
        XmlUtils.parseAttr(elem, 'audioSamplingRate', parseNumber) ||
        parent.audioSamplingRate;

    if (!contentType) {
      contentType = shaka.dash.DashParser.guessContentType_(mimeType, codecs);
    }

    const segmentBase = XmlUtils.findChild(elem, 'SegmentBase');
    const segmentTemplate = XmlUtils.findChild(elem, 'SegmentTemplate');

    // The availabilityTimeOffset is the sum of all @availabilityTimeOffset
    // values that apply to the adaptation set, via BaseURL, SegmentBase,
    // or SegmentTemplate elements.
    const segmentBaseAto = segmentBase ?
        (XmlUtils.parseAttr(segmentBase, 'availabilityTimeOffset',
            XmlUtils.parseFloat) || 0) : 0;
    const segmentTemplateAto = segmentTemplate ?
        (XmlUtils.parseAttr(segmentTemplate, 'availabilityTimeOffset',
            XmlUtils.parseFloat) || 0) : 0;
    const baseUriAto = uriObjs && uriObjs.length ?
        (XmlUtils.parseAttr(uriObjs[0], 'availabilityTimeOffset',
            XmlUtils.parseFloat) || 0) : 0;

    const availabilityTimeOffset = parent.availabilityTimeOffset + baseUriAto +
        segmentBaseAto + segmentTemplateAto;

    let segmentSequenceCadence = null;
    const segmentSequenceProperties =
        XmlUtils.findChild(elem, 'SegmentSequenceProperties');
    if (segmentSequenceProperties) {
      const sap = XmlUtils.findChild(segmentSequenceProperties, 'SAP');
      if (sap) {
        segmentSequenceCadence = XmlUtils.parseAttr(sap, 'cadence',
            XmlUtils.parseInt);
      }
    }

    return {
      getBaseUris: () => ManifestParserUtils.resolveUris(getBaseUris(), uris),
      segmentBase: segmentBase || parent.segmentBase,
      segmentList:
          XmlUtils.findChild(elem, 'SegmentList') || parent.segmentList,
      segmentTemplate: segmentTemplate || parent.segmentTemplate,
      width: XmlUtils.parseAttr(elem, 'width', parseNumber) || parent.width,
      height: XmlUtils.parseAttr(elem, 'height', parseNumber) || parent.height,
      contentType: contentType,
      mimeType: mimeType,
      codecs: codecs,
      frameRate: frameRate,
      pixelAspectRatio: pixelAspectRatio,
      emsgSchemeIdUris: emsgSchemeIdUris,
      id: elem.getAttribute('id'),
      language: elem.getAttribute('lang'),
      numChannels: numChannels,
      audioSamplingRate: audioSamplingRate,
      availabilityTimeOffset: availabilityTimeOffset,
      segmentSequenceCadence:
          segmentSequenceCadence || parent.segmentSequenceCadence,
    };
  }

  /**
   * Returns a new array of InbandEventStream schemeIdUri containing the union
   * of the ones parsed from inBandEventStreams and the ones provided in
   * emsgSchemeIdUris.
   *
   * @param {!Array.<!Element>} inBandEventStreams Array of InbandEventStream
   *     elements to parse and add to the returned array.
   * @param {!Array.<string>} emsgSchemeIdUris Array of parsed
   *     InbandEventStream schemeIdUri attributes to add to the returned array.
   * @return {!Array.<string>} schemeIdUris Array of parsed
   *     InbandEventStream schemeIdUri attributes.
   * @private
   */
  emsgSchemeIdUris_(inBandEventStreams, emsgSchemeIdUris) {
    const schemeIdUris = emsgSchemeIdUris.slice();
    for (const event of inBandEventStreams) {
      const schemeIdUri = event.getAttribute('schemeIdUri');
      if (!schemeIdUris.includes(schemeIdUri)) {
        schemeIdUris.push(schemeIdUri);
      }
    }
    return schemeIdUris;
  }

  /**
   * @param {!Array.<!Element>} audioChannelConfigs An array of
   *   AudioChannelConfiguration elements.
   * @return {?number} The number of audio channels, or null if unknown.
   * @private
   */
  parseAudioChannels_(audioChannelConfigs) {
    for (const elem of audioChannelConfigs) {
      const scheme = elem.getAttribute('schemeIdUri');
      if (!scheme) {
        continue;
      }

      const value = elem.getAttribute('value');
      if (!value) {
        continue;
      }

      switch (scheme) {
        case 'urn:mpeg:dash:outputChannelPositionList:2012':
          // A space-separated list of speaker positions, so the number of
          // channels is the length of this list.
          return value.trim().split(/ +/).length;

        case 'urn:mpeg:dash:23003:3:audio_channel_configuration:2011':
        case 'urn:dts:dash:audio_channel_configuration:2012': {
          // As far as we can tell, this is a number of channels.
          const intValue = parseInt(value, 10);
          if (!intValue) {  // 0 or NaN
            shaka.log.warning('Channel parsing failure! ' +
                          'Ignoring scheme and value', scheme, value);
            continue;
          }
          return intValue;
        }

        case 'tag:dolby.com,2014:dash:audio_channel_configuration:2011':
        case 'urn:dolby:dash:audio_channel_configuration:2011': {
          // A hex-encoded 16-bit integer, in which each bit represents a
          // channel.
          let hexValue = parseInt(value, 16);
          if (!hexValue) {  // 0 or NaN
            shaka.log.warning('Channel parsing failure! ' +
                          'Ignoring scheme and value', scheme, value);
            continue;
          }
          // Count the 1-bits in hexValue.
          let numBits = 0;
          while (hexValue) {
            if (hexValue & 1) {
              ++numBits;
            }
            hexValue >>= 1;
          }
          return numBits;
        }

        // Defined by https://dashif.org/identifiers/audio_source_metadata/ and clause 8.2, in ISO/IEC 23001-8.
        case 'urn:mpeg:mpegB:cicp:ChannelConfiguration': {
          const noValue = 0;
          const channelCountMapping = [
            noValue, 1, 2, 3, 4, 5, 6, 8, 2, 3, /* 0--9 */
            4, 7, 8, 24, 8, 12, 10, 12, 14, 12, /* 10--19 */
            14, /* 20 */
          ];
          const intValue = parseInt(value, 10);
          if (!intValue) {  // 0 or NaN
            shaka.log.warning('Channel parsing failure! ' +
                          'Ignoring scheme and value', scheme, value);
            continue;
          }
          if (intValue > noValue && intValue < channelCountMapping.length) {
            return channelCountMapping[intValue];
          }
          continue;
        }

        default:
          shaka.log.warning(
              'Unrecognized audio channel scheme:', scheme, value);
          continue;
      }
    }

    return null;
  }

  /**
   * Verifies that a Representation has exactly one Segment* element.  Prints
   * warnings if there is a problem.
   *
   * @param {shaka.dash.DashParser.InheritanceFrame} frame
   * @return {boolean} True if the Representation is usable; otherwise return
   *   false.
   * @private
   */
  verifyRepresentation_(frame) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    let n = 0;
    n += frame.segmentBase ? 1 : 0;
    n += frame.segmentList ? 1 : 0;
    n += frame.segmentTemplate ? 1 : 0;

    if (n == 0) {
      // TODO: Extend with the list of MIME types registered to TextEngine.
      if (frame.contentType == ContentType.TEXT ||
          frame.contentType == ContentType.APPLICATION) {
        return true;
      } else {
        shaka.log.warning(
            'Representation does not contain a segment information source:',
            'the Representation must contain one of SegmentBase, SegmentList,',
            'SegmentTemplate, or explicitly indicate that it is "text".',
            frame);
        return false;
      }
    }

    if (n != 1) {
      shaka.log.warning(
          'Representation contains multiple segment information sources:',
          'the Representation should only contain one of SegmentBase,',
          'SegmentList, or SegmentTemplate.',
          frame);
      if (frame.segmentBase) {
        shaka.log.info('Using SegmentBase by default.');
        frame.segmentList = null;
        frame.segmentTemplate = null;
      } else {
        goog.asserts.assert(frame.segmentList, 'There should be a SegmentList');
        shaka.log.info('Using SegmentList by default.');
        frame.segmentTemplate = null;
      }
    }

    return true;
  }

  /**
   * Makes a request to the given URI and calculates the clock offset.
   *
   * @param {function():!Array.<string>} getBaseUris
   * @param {string} uri
   * @param {string} method
   * @return {!Promise.<number>}
   * @private
   */
  async requestForTiming_(getBaseUris, uri, method) {
    const requestUris =
        shaka.util.ManifestParserUtils.resolveUris(getBaseUris(), [uri]);
    const request = shaka.net.NetworkingEngine.makeRequest(
        requestUris, this.config_.retryParameters);
    request.method = method;
    const type = shaka.net.NetworkingEngine.RequestType.TIMING;

    const operation =
    this.playerInterface_.networkingEngine.request(type, request);
    this.operationManager_.manage(operation);

    const response = await operation.promise;
    let text;
    if (method == 'HEAD') {
      if (!response.headers || !response.headers['date']) {
        shaka.log.warning('UTC timing response is missing',
            'expected date header');
        return 0;
      }
      text = response.headers['date'];
    } else {
      text = shaka.util.StringUtils.fromUTF8(response.data);
    }
    const date = Date.parse(text);
    if (isNaN(date)) {
      shaka.log.warning('Unable to parse date from UTC timing response');
      return 0;
    }
    return (date - Date.now());
  }

  /**
   * Parses an array of UTCTiming elements.
   *
   * @param {function():!Array.<string>} getBaseUris
   * @param {!Array.<!Element>} elems
   * @return {!Promise.<number>}
   * @private
   */
  async parseUtcTiming_(getBaseUris, elems) {
    const schemesAndValues = elems.map((elem) => {
      return {
        scheme: elem.getAttribute('schemeIdUri'),
        value: elem.getAttribute('value'),
      };
    });

    // If there's nothing specified in the manifest, but we have a default from
    // the config, use that.
    const clockSyncUri = this.config_.dash.clockSyncUri;
    if (!schemesAndValues.length && clockSyncUri) {
      schemesAndValues.push({
        scheme: 'urn:mpeg:dash:utc:http-head:2014',
        value: clockSyncUri,
      });
    }

    for (const sv of schemesAndValues) {
      try {
        const scheme = sv.scheme;
        const value = sv.value;
        switch (scheme) {
          // See DASH IOP Guidelines Section 4.7
          // https://bit.ly/DashIop3-2
          // Some old ISO23009-1 drafts used 2012.
          case 'urn:mpeg:dash:utc:http-head:2014':
          case 'urn:mpeg:dash:utc:http-head:2012':
            // eslint-disable-next-line no-await-in-loop
            return await this.requestForTiming_(getBaseUris, value, 'HEAD');
          case 'urn:mpeg:dash:utc:http-xsdate:2014':
          case 'urn:mpeg:dash:utc:http-iso:2014':
          case 'urn:mpeg:dash:utc:http-xsdate:2012':
          case 'urn:mpeg:dash:utc:http-iso:2012':
            // eslint-disable-next-line no-await-in-loop
            return await this.requestForTiming_(getBaseUris, value, 'GET');
          case 'urn:mpeg:dash:utc:direct:2014':
          case 'urn:mpeg:dash:utc:direct:2012': {
            const date = Date.parse(value);
            return isNaN(date) ? 0 : (date - Date.now());
          }

          case 'urn:mpeg:dash:utc:http-ntp:2014':
          case 'urn:mpeg:dash:utc:ntp:2014':
          case 'urn:mpeg:dash:utc:sntp:2014':
            shaka.log.alwaysWarn('NTP UTCTiming scheme is not supported');
            break;
          default:
            shaka.log.alwaysWarn(
                'Unrecognized scheme in UTCTiming element', scheme);
            break;
        }
      } catch (e) {
        shaka.log.warning('Error fetching time from UTCTiming elem', e.message);
      }
    }

    shaka.log.alwaysWarn(
        'A UTCTiming element should always be given in live manifests! ' +
        'This content may not play on clients with bad clocks!');
    return 0;
  }

  /**
   * Parses an EventStream element.
   *
   * @param {number} periodStart
   * @param {?number} periodDuration
   * @param {!Element} elem
   * @param {number} availabilityStart
   * @private
   */
  parseEventStream_(periodStart, periodDuration, elem, availabilityStart) {
    const XmlUtils = shaka.util.XmlUtils;
    const parseNumber = XmlUtils.parseNonNegativeInt;

    const schemeIdUri = elem.getAttribute('schemeIdUri') || '';
    const value = elem.getAttribute('value') || '';
    const timescale = XmlUtils.parseAttr(elem, 'timescale', parseNumber) || 1;

    for (const eventNode of XmlUtils.findChildren(elem, 'Event')) {
      const presentationTime =
          XmlUtils.parseAttr(eventNode, 'presentationTime', parseNumber) || 0;
      const duration =
          XmlUtils.parseAttr(eventNode, 'duration', parseNumber) || 0;

      let startTime = presentationTime / timescale + periodStart;
      let endTime = startTime + (duration / timescale);
      if (periodDuration != null) {
        // An event should not go past the Period, even if the manifest says so.
        // See: Dash sec. 5.10.2.1
        startTime = Math.min(startTime, periodStart + periodDuration);
        endTime = Math.min(endTime, periodStart + periodDuration);
      }

      // Don't add unavailable regions to the timeline.
      if (endTime < availabilityStart) {
        continue;
      }

      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        schemeIdUri: schemeIdUri,
        value: value,
        startTime: startTime,
        endTime: endTime,
        id: eventNode.getAttribute('id') || '',
        eventElement: eventNode,
      };

      this.playerInterface_.onTimelineRegionAdded(region);
    }
  }

  /**
   * Makes a network request on behalf of SegmentBase.createStreamInfo.
   *
   * @param {!Array.<string>} uris
   * @param {?number} startByte
   * @param {?number} endByte
   * @param {boolean} isInit
   * @return {!Promise.<BufferSource>}
   * @private
   */
  async requestSegment_(uris, startByte, endByte, isInit) {
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    const type = isInit ?
        shaka.net.NetworkingEngine.AdvancedRequestType.INIT_SEGMENT :
        shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT;

    const request = shaka.util.Networking.createSegmentRequest(
        uris,
        startByte,
        endByte,
        this.config_.retryParameters);

    const response = await this.makeNetworkRequest_(
        request, requestType, {type});
    return response.data;
  }

  /**
   * Guess the content type based on MIME type and codecs.
   *
   * @param {string} mimeType
   * @param {string} codecs
   * @return {string}
   * @private
   */
  static guessContentType_(mimeType, codecs) {
    const fullMimeType = shaka.util.MimeUtils.getFullType(mimeType, codecs);

    if (shaka.text.TextEngine.isTypeSupported(fullMimeType)) {
      // If it's supported by TextEngine, it's definitely text.
      // We don't check MediaSourceEngine, because that would report support
      // for platform-supported video and audio types as well.
      return shaka.util.ManifestParserUtils.ContentType.TEXT;
    }

    // Otherwise, just split the MIME type.  This handles video and audio
    // types well.
    return mimeType.split('/')[0];
  }


  /**
   * Create a networking request. This will manage the request using the
   * parser's operation manager.
   *
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.RequestContext=} context
   * @return {!Promise.<shaka.extern.Response>}
   * @private
   */
  makeNetworkRequest_(request, type, context) {
    const op = this.playerInterface_.networkingEngine.request(
        type, request, context);
    this.operationManager_.manage(op);
    return op.promise;
  }
};


/**
 * @typedef {
 *   function(!Array.<string>, ?number, ?number, boolean):
 *     !Promise.<BufferSource>
 * }
 */
shaka.dash.DashParser.RequestSegmentCallback;


/**
 * @typedef {{
 *   segmentBase: Element,
 *   segmentList: Element,
 *   segmentTemplate: Element,
 *   getBaseUris: function():!Array.<string>,
 *   width: (number|undefined),
 *   height: (number|undefined),
 *   contentType: string,
 *   mimeType: string,
 *   codecs: string,
 *   frameRate: (number|undefined),
 *   pixelAspectRatio: (string|undefined),
 *   emsgSchemeIdUris: !Array.<string>,
 *   id: ?string,
 *   language: ?string,
 *   numChannels: ?number,
 *   audioSamplingRate: ?number,
 *   availabilityTimeOffset: number,
 *   segmentSequenceCadence: number
 * }}
 *
 * @description
 * A collection of elements and properties which are inherited across levels
 * of a DASH manifest.
 *
 * @property {Element} segmentBase
 *   The XML node for SegmentBase.
 * @property {Element} segmentList
 *   The XML node for SegmentList.
 * @property {Element} segmentTemplate
 *   The XML node for SegmentTemplate.
 * @property {function():!Array.<string>} getBaseUris
 *   Function than returns an array of absolute base URIs for the frame.
 * @property {(number|undefined)} width
 *   The inherited width value.
 * @property {(number|undefined)} height
 *   The inherited height value.
 * @property {string} contentType
 *   The inherited media type.
 * @property {string} mimeType
 *   The inherited MIME type value.
 * @property {string} codecs
 *   The inherited codecs value.
 * @property {(number|undefined)} frameRate
 *   The inherited framerate value.
 * @property {(string|undefined)} pixelAspectRatio
 *   The inherited pixel aspect ratio value.
 * @property {!Array.<string>} emsgSchemeIdUris
 *   emsg registered schemeIdUris.
 * @property {?string} id
 *   The ID of the element.
 * @property {?string} language
 *   The original language of the element.
 * @property {?number} numChannels
 *   The number of audio channels, or null if unknown.
 * @property {?number} audioSamplingRate
 *   Specifies the maximum sampling rate of the content, or null if unknown.
 * @property {number} availabilityTimeOffset
 *   Specifies the total availabilityTimeOffset of the segment, or 0 if unknown.
 * @property {number} segmentSequenceCadence
 *   Specifies the cadence of independent segments in Segment Sequence
 *   Representation.
 */
shaka.dash.DashParser.InheritanceFrame;


/**
 * @typedef {{
 *   dynamic: boolean,
 *   presentationTimeline: !shaka.media.PresentationTimeline,
 *   period: ?shaka.dash.DashParser.InheritanceFrame,
 *   periodInfo: ?shaka.dash.DashParser.PeriodInfo,
 *   adaptationSet: ?shaka.dash.DashParser.InheritanceFrame,
 *   representation: ?shaka.dash.DashParser.InheritanceFrame,
 *   bandwidth: number,
 *   indexRangeWarningGiven: boolean,
 *   availabilityTimeOffset: number,
 *   profiles: !Array.<string>
 * }}
 *
 * @description
 * Contains context data for the streams.  This is designed to be
 * shallow-copyable, so the parser must overwrite (not modify) each key as the
 * parser moves through the manifest and the parsing context changes.
 *
 * @property {boolean} dynamic
 *   True if the MPD is dynamic (not all segments available at once)
 * @property {!shaka.media.PresentationTimeline} presentationTimeline
 *   The PresentationTimeline.
 * @property {?shaka.dash.DashParser.InheritanceFrame} period
 *   The inheritance from the Period element.
 * @property {?shaka.dash.DashParser.PeriodInfo} periodInfo
 *   The Period info for the current Period.
 * @property {?shaka.dash.DashParser.InheritanceFrame} adaptationSet
 *   The inheritance from the AdaptationSet element.
 * @property {?shaka.dash.DashParser.InheritanceFrame} representation
 *   The inheritance from the Representation element.
 * @property {number} bandwidth
 *   The bandwidth of the Representation, or zero if missing.
 * @property {boolean} indexRangeWarningGiven
 *   True if the warning about SegmentURL@indexRange has been printed.
 * @property {number} availabilityTimeOffset
 *   The sum of the availabilityTimeOffset values that apply to the element.
 * @property {!Array.<string>} profiles
 *   Profiles of DASH are defined to enable interoperability and the signaling
 *   of the use of features.
 */
shaka.dash.DashParser.Context;


/**
 * @typedef {{
 *   start: number,
 *   duration: ?number,
 *   node: !Element,
 *   isLastPeriod: boolean
 * }}
 *
 * @description
 * Contains information about a Period element.
 *
 * @property {number} start
 *   The start time of the period.
 * @property {?number} duration
 *   The duration of the period; or null if the duration is not given.  This
 *   will be non-null for all periods except the last.
 * @property {!Element} node
 *   The XML Node for the Period.
 * @property {boolean} isLastPeriod
 *   Whether this Period is the last one in the manifest.
 */
shaka.dash.DashParser.PeriodInfo;


/**
 * @typedef {{
 *   id: string,
 *   contentType: ?string,
 *   language: string,
 *   main: boolean,
 *   streams: !Array.<shaka.extern.Stream>,
 *   drmInfos: !Array.<shaka.extern.DrmInfo>,
 *   trickModeFor: ?string,
 *   representationIds: !Array.<string>
 * }}
 *
 * @description
 * Contains information about an AdaptationSet element.
 *
 * @property {string} id
 *   The unique ID of the adaptation set.
 * @property {?string} contentType
 *   The content type of the AdaptationSet.
 * @property {string} language
 *   The language of the AdaptationSet.
 * @property {boolean} main
 *   Whether the AdaptationSet has the 'main' type.
 * @property {!Array.<shaka.extern.Stream>} streams
 *   The streams this AdaptationSet contains.
 * @property {!Array.<shaka.extern.DrmInfo>} drmInfos
 *   The DRM info for the AdaptationSet.
 * @property {?string} trickModeFor
 *   If non-null, this AdaptationInfo represents trick mode tracks.  This
 *   property is the ID of the normal AdaptationSet these tracks should be
 *   associated with.
 * @property {!Array.<string>} representationIds
 *   An array of the IDs of the Representations this AdaptationSet contains.
 */
shaka.dash.DashParser.AdaptationInfo;


/**
 * @typedef {function():!Promise.<shaka.media.SegmentIndex>}
 * @description
 * An async function which generates and returns a SegmentIndex.
 */
shaka.dash.DashParser.GenerateSegmentIndexFunction;


/**
 * @typedef {{
 *   generateSegmentIndex: shaka.dash.DashParser.GenerateSegmentIndexFunction
 * }}
 *
 * @description
 * Contains information about a Stream. This is passed from the createStreamInfo
 * methods.
 *
 * @property {shaka.dash.DashParser.GenerateSegmentIndexFunction}
 *     generateSegmentIndex
 *   An async function to create the SegmentIndex for the stream.
 */
shaka.dash.DashParser.StreamInfo;


shaka.media.ManifestParser.registerParserByMime(
    'application/dash+xml', () => new shaka.dash.DashParser());
shaka.media.ManifestParser.registerParserByMime(
    'video/vnd.mpeg.dash.mpd', () => new shaka.dash.DashParser());
