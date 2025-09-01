/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.dash.DashParser');

goog.require('goog.asserts');
goog.require('goog.Uri');
goog.require('shaka.Deprecate');
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
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.ContentSteeringManager');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Networking');
goog.require('shaka.util.ObjectUtils');
goog.require('shaka.util.OperationManager');
goog.require('shaka.util.PeriodCombiner');
goog.require('shaka.util.PlayerConfiguration');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TimeUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.TXml');
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

    /** @private {!Array<string>} */
    this.manifestUris_ = [];

    /** @private {?shaka.extern.Manifest} */
    this.manifest_ = null;

    /** @private {number} */
    this.globalId_ = 1;

    /** @private {!Array<shaka.extern.xml.Node>} */
    this.patchLocationNodes_ = [];

    /**
     * A context of the living manifest used for processing
     * Patch MPD's
     * @private {!shaka.dash.DashParser.PatchContext}
     */
    this.manifestPatchContext_ = {
      mpdId: '',
      type: '',
      profiles: [],
      mediaPresentationDuration: null,
      availabilityTimeOffset: 0,
      getBaseUris: null,
      publishTime: 0,
    };

    /**
     * This is a cache is used the store a snapshot of the context
     * object which is built up throughout node traversal to maintain
     * a current state. This data needs to be preserved for parsing
     * patches.
     * The key is a combination period and representation id's.
     * @private {!Map<string, !shaka.dash.DashParser.Context>}
     */
    this.contextCache_ = new Map();

    /**
     * @private {
     *   !Map<string, {endTime: number, timeline: number, reps: Array<string>}>
     * }
     */
    this.continuityCache_ = new Map();

    /**
     * A map of IDs to Stream objects.
     * ID: Period@id,Representation@id
     * e.g.: '1,23'
     * @private {!Map<string, !shaka.extern.Stream>}
     */
    this.streamMap_ = new Map();

    /**
     * A map of Period IDs to Stream Map IDs.
     * Use to have direct access to streamMap key.
     * @private {!Map<string, !Array<string>>}
     */
    this.indexStreamMap_ = new Map();

    /**
     * A map of period ids to their durations
     * @private {!Map<string, number>}
     */
    this.periodDurations_ = new Map();

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
      if (this.mediaElement_ && !this.config_.continueLoadingWhenPaused) {
        this.eventManager_.unlisten(this.mediaElement_, 'timeupdate');
        if (this.mediaElement_.paused) {
          this.eventManager_.listenOnce(
              this.mediaElement_, 'timeupdate', () => this.onUpdate_());
          return;
        }
      }
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
     * @private {!Array<string>}
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

    /** @private {number} */
    this.gapCount_ = 0;

    /** @private {boolean} */
    this.isLowLatency_ = false;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {HTMLMediaElement} */
    this.mediaElement_ = null;

    /** @private {boolean} */
    this.isTransitionFromDynamicToStatic_ = false;

    /** @private {string} */
    this.lastManifestQueryParams_ = '';

    /** @private {function():boolean} */
    this.isPreloadFn_ = () => false;

    /** @private {?Array<string>} */
    this.lastCalculatedBaseUris_ = [];

    /**
     * Used to track which prft nodes have been already parsed to avoid
     * duplicating work for all representations.
     * @private {!Set<!shaka.extern.xml.Node>}
     */
    this.parsedPrftNodes_ = new Set();

    /** @private {!shaka.dash.ContentProtection} */
    this.contentProtection_ = new shaka.dash.ContentProtection();
  }

  /**
   * @param {shaka.extern.ManifestConfiguration} config
   * @param {(function():boolean)=} isPreloadFn
   * @override
   * @exportInterface
   */
  configure(config, isPreloadFn) {
    goog.asserts.assert(config.dash != null,
        'DashManifestConfiguration should not be null!');
    const needFireUpdate = this.playerInterface_ &&
      config.updatePeriod != this.config_.updatePeriod &&
      config.updatePeriod >= 0;
    this.config_ = config;
    if (isPreloadFn) {
      this.isPreloadFn_ = isPreloadFn;
    }
    if (needFireUpdate && this.manifest_ &&
      this.manifest_.presentationTimeline.isLive()) {
      this.updateNow_();
    }
    if (this.contentSteeringManager_) {
      this.contentSteeringManager_.configure(this.config_);
    }

    if (this.periodCombiner_) {
      this.periodCombiner_.setUseStreamOnce(
          this.config_.dash.useStreamOnceInPeriodFlattening);
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
    for (const stream of this.streamMap_.values()) {
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
    this.streamMap_.clear();
    this.indexStreamMap_.clear();
    this.contextCache_.clear();
    this.continuityCache_.clear();
    this.manifestPatchContext_ = {
      mpdId: '',
      type: '',
      profiles: [],
      mediaPresentationDuration: null,
      availabilityTimeOffset: 0,
      getBaseUris: null,
      publishTime: 0,
    };
    this.periodCombiner_ = null;

    if (this.updateTimer_ != null) {
      this.updateTimer_.stop();
      this.updateTimer_ = null;
    }

    if (this.contentSteeringManager_) {
      this.contentSteeringManager_.destroy();
    }

    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }
    this.parsedPrftNodes_.clear();
    this.contentProtection_.release();

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
   * @override
   * @exportInterface
   */
  setMediaElement(mediaElement) {
    this.mediaElement_ = mediaElement;
  }

  /**
   * Makes a network request for the manifest and parses the resulting data.
   *
   * @return {!Promise<number>} Resolves with the time it took, in seconds, to
   *   fulfill the request and parse the data.
   * @private
   */
  async requestManifest_() {
    const requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
    let type = shaka.net.NetworkingEngine.AdvancedRequestType.MPD;
    let rootElement = 'MPD';
    const patchLocationUris = this.getPatchLocationUris_();
    let manifestUris = this.manifestUris_;
    if (patchLocationUris.length) {
      manifestUris = patchLocationUris;
      rootElement = 'Patch';
      type = shaka.net.NetworkingEngine.AdvancedRequestType.MPD_PATCH;
    } else if (this.manifestUris_.length > 1 && this.contentSteeringManager_) {
      const locations = this.contentSteeringManager_.getLocations(
          'Location', /* ignoreBaseUrls= */ true);
      if (locations.length) {
        manifestUris = locations;
      }
    }
    const request = shaka.net.NetworkingEngine.makeRequest(
        manifestUris, this.config_.retryParameters);
    const startTime = Date.now();

    const response = await this.makeNetworkRequest_(
        request, requestType, {type});

    // Detect calls to stop().
    if (!this.playerInterface_) {
      return 0;
    }

    // For redirections add the response uri to the first entry in the
    // Manifest Uris array.
    if (response.uri && response.uri != response.originalUri &&
        !this.manifestUris_.includes(response.uri)) {
      this.manifestUris_.unshift(response.uri);
    }

    const uriObj = new goog.Uri(response.uri);
    this.lastManifestQueryParams_ = uriObj.getQueryData().toString();

    // This may throw, but it will result in a failed promise.
    await this.parseManifest_(response.data, response.uri, rootElement);
    // Keep track of how long the longest manifest update took.
    const endTime = Date.now();
    const updateDuration = (endTime - startTime) / 1000.0;
    this.averageUpdateDuration_.sample(1, updateDuration);

    this.parsedPrftNodes_.clear();

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
   * @param {string} rootElement MPD or Patch, depending on context
   * @return {!Promise}
   * @private
   */
  async parseManifest_(data, finalManifestUri, rootElement) {
    let manifestData = data;
    const manifestPreprocessor = this.config_.dash.manifestPreprocessor;
    const defaultManifestPreprocessor =
        shaka.util.PlayerConfiguration.defaultManifestPreprocessor;
    if (manifestPreprocessor != defaultManifestPreprocessor) {
      shaka.Deprecate.deprecateFeature(5,
          'manifest.dash.manifestPreprocessor configuration',
          'Please Use manifest.dash.manifestPreprocessorTXml instead.');
      const mpdElement =
          shaka.util.XmlUtils.parseXml(manifestData, rootElement);
      if (!mpdElement) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.DASH_INVALID_XML,
            finalManifestUri);
      }
      manifestPreprocessor(mpdElement);
      manifestData = shaka.util.XmlUtils.toArrayBuffer(mpdElement);
    }
    const mpd = shaka.util.TXml.parseXml(manifestData, rootElement);
    if (!mpd) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_XML,
          finalManifestUri);
    }
    const manifestPreprocessorTXml =
        this.config_.dash.manifestPreprocessorTXml;
    const defaultManifestPreprocessorTXml =
        shaka.util.PlayerConfiguration.defaultManifestPreprocessorTXml;
    if (manifestPreprocessorTXml != defaultManifestPreprocessorTXml) {
      manifestPreprocessorTXml(mpd);
    }

    if (rootElement === 'Patch') {
      return this.processPatchManifest_(mpd);
    }

    const disableXlinkProcessing = this.config_.dash.disableXlinkProcessing;
    if (disableXlinkProcessing) {
      return this.processManifest_(mpd, finalManifestUri);
    }

    // Process the mpd to account for xlink connections.
    const failGracefully = this.config_.dash.xlinkFailGracefully;
    const xlinkOperation = shaka.dash.MpdUtils.processXlinks(
        mpd, this.config_.retryParameters, failGracefully, finalManifestUri,
        this.playerInterface_.networkingEngine);
    this.operationManager_.manage(xlinkOperation);
    const finalMpd = await xlinkOperation.promise;
    return this.processManifest_(finalMpd, finalManifestUri);
  }


  /**
   * Takes a formatted MPD and converts it into a manifest.
   *
   * @param {!shaka.extern.xml.Node} mpd
   * @param {string} finalManifestUri The final manifest URI, which may
   *   differ from this.manifestUri_ if there has been a redirect.
   * @return {!Promise}
   * @private
   */
  async processManifest_(mpd, finalManifestUri) {
    const TXml = shaka.util.TXml;

    goog.asserts.assert(this.config_,
        'Must call configure() before processManifest_()!');

    if (this.contentSteeringManager_) {
      this.contentSteeringManager_.clearPreviousLocations();
    }

    // Get any Location elements.  This will update the manifest location and
    // the base URI.
    /** @type {!Array<string>} */
    let manifestBaseUris = [finalManifestUri];
    /** @type {!Array<string>} */
    const locations = [];
    /** @type {!Map<string, string>} */
    const locationsMapping = new Map();
    const locationsObjs = TXml.findChildren(mpd, 'Location');
    for (const locationsObj of locationsObjs) {
      const serviceLocation = locationsObj.attributes['serviceLocation'];
      const uri = TXml.getContents(locationsObj);
      if (!uri) {
        continue;
      }
      const finalUri = shaka.util.ManifestParserUtils.resolveUris(
          manifestBaseUris, [uri])[0];
      if (serviceLocation) {
        if (this.contentSteeringManager_) {
          this.contentSteeringManager_.addLocation(
              'Location', serviceLocation, finalUri);
        } else {
          locationsMapping.set(serviceLocation, finalUri);
        }
      }
      locations.push(finalUri);
    }
    if (this.contentSteeringManager_) {
      const steeringLocations = this.contentSteeringManager_.getLocations(
          'Location', /* ignoreBaseUrls= */ true);
      if (steeringLocations.length > 0) {
        this.manifestUris_ = steeringLocations;
        manifestBaseUris = steeringLocations;
      }
    } else if (locations.length) {
      this.manifestUris_ = locations;
      manifestBaseUris = locations;
    }

    this.manifestPatchContext_.mpdId = mpd.attributes['id'] || '';
    this.manifestPatchContext_.publishTime =
        TXml.parseAttr(mpd, 'publishTime', TXml.parseDate) || 0;
    this.patchLocationNodes_ = TXml.findChildren(mpd, 'PatchLocation');

    let contentSteeringPromise = Promise.resolve();

    const contentSteering = TXml.findChild(mpd, 'ContentSteering');
    if (contentSteering && this.playerInterface_) {
      const defaultPathwayId =
          contentSteering.attributes['defaultServiceLocation'];
      if (!this.contentSteeringManager_) {
        this.contentSteeringManager_ =
            new shaka.util.ContentSteeringManager(this.playerInterface_);
        this.contentSteeringManager_.configure(this.config_);
        this.contentSteeringManager_.setManifestType(
            shaka.media.ManifestParser.DASH);
        this.contentSteeringManager_.setBaseUris(manifestBaseUris);
        this.contentSteeringManager_.setDefaultPathwayId(defaultPathwayId);
        const uri = TXml.getContents(contentSteering);
        if (uri) {
          const queryBeforeStart =
            TXml.parseAttr(contentSteering, 'queryBeforeStart',
                TXml.parseBoolean, /* defaultValue= */ false);
          if (queryBeforeStart) {
            contentSteeringPromise =
                this.contentSteeringManager_.requestInfo(uri);
          } else {
            this.contentSteeringManager_.requestInfo(uri);
          }
        }
      } else {
        this.contentSteeringManager_.setBaseUris(manifestBaseUris);
        this.contentSteeringManager_.setDefaultPathwayId(defaultPathwayId);
      }
      for (const serviceLocation of locationsMapping.keys()) {
        const uri = locationsMapping.get(serviceLocation);
        this.contentSteeringManager_.addLocation(
            'Location', serviceLocation, uri);
      }
    }

    const uriObjs = TXml.findChildren(mpd, 'BaseURL');
    let someLocationValid = false;
    if (this.contentSteeringManager_) {
      for (const uriObj of uriObjs) {
        const serviceLocation = uriObj.attributes['serviceLocation'];
        const uri = TXml.getContents(uriObj);
        if (serviceLocation && uri) {
          this.contentSteeringManager_.addLocation(
              'BaseURL', serviceLocation, uri);
          someLocationValid = true;
        }
      }
    }
    // Clean the array instead of creating a new one. By doing this we ensure
    // that references to the array does not change in callback functions.
    this.lastCalculatedBaseUris_.splice(0);
    if (!someLocationValid || !this.contentSteeringManager_) {
      const uris = uriObjs.map(TXml.getContents);
      this.lastCalculatedBaseUris_.push(
          ...shaka.util.ManifestParserUtils.resolveUris(
              manifestBaseUris, uris));
    }

    // Here we are creating local variables to avoid direct references to `this`
    // in a callback function. By doing this we can ensure that garbage
    // collector can clean up `this` object when it is no longer needed.
    const contentSteeringManager = this.contentSteeringManager_;
    const lastCalculatedBaseUris = this.lastCalculatedBaseUris_;

    const getBaseUris = () => {
      if (contentSteeringManager && someLocationValid) {
        return contentSteeringManager.getLocations('BaseURL');
      }
      // Return the copy, because caller of this function is not an owner
      // of the array.
      return lastCalculatedBaseUris.slice();
    };

    this.manifestPatchContext_.getBaseUris = getBaseUris;

    let availabilityTimeOffset = 0;
    if (uriObjs && uriObjs.length) {
      availabilityTimeOffset = TXml.parseAttr(uriObjs[0],
          'availabilityTimeOffset', TXml.parseFloat) || 0;
    }
    this.manifestPatchContext_.availabilityTimeOffset = availabilityTimeOffset;

    this.updatePeriod_ = /** @type {number} */ (TXml.parseAttr(
        mpd, 'minimumUpdatePeriod', TXml.parseDuration, -1));

    const presentationStartTime = TXml.parseAttr(
        mpd, 'availabilityStartTime', TXml.parseDate);
    let segmentAvailabilityDuration = TXml.parseAttr(
        mpd, 'timeShiftBufferDepth', TXml.parseDuration);

    const ignoreSuggestedPresentationDelay =
      this.config_.dash.ignoreSuggestedPresentationDelay;
    let suggestedPresentationDelay = null;
    if (!ignoreSuggestedPresentationDelay) {
      suggestedPresentationDelay = TXml.parseAttr(
          mpd, 'suggestedPresentationDelay', TXml.parseDuration);
    }

    const ignoreMaxSegmentDuration =
        this.config_.dash.ignoreMaxSegmentDuration;
    let maxSegmentDuration = null;
    if (!ignoreMaxSegmentDuration) {
      maxSegmentDuration = TXml.parseAttr(
          mpd, 'maxSegmentDuration', TXml.parseDuration);
    }
    const mpdType = mpd.attributes['type'] || 'static';

    if (this.manifest_ && this.manifest_.presentationTimeline) {
      this.isTransitionFromDynamicToStatic_ =
          this.manifest_.presentationTimeline.isLive() && mpdType == 'static';
    }

    this.manifestPatchContext_.type = mpdType;
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
      const availabilityStart =
          presentationTimeline.getSegmentAvailabilityStart();
      for (const stream of this.streamMap_.values()) {
        if (stream.segmentIndex) {
          stream.segmentIndex.evict(availabilityStart);
        }
      }
    } else {
      const ignoreMinBufferTime = this.config_.dash.ignoreMinBufferTime;
      let minBufferTime = 0;
      if (!ignoreMinBufferTime) {
        minBufferTime =
            TXml.parseAttr(mpd, 'minBufferTime', TXml.parseDuration) || 0;
      }
      // DASH IOP v3.0 suggests using a default delay between minBufferTime
      // and timeShiftBufferDepth.  This is literally the range of all
      // feasible choices for the value.  Nothing older than
      // timeShiftBufferDepth is still available, and anything less than
      // minBufferTime will cause buffering issues.
      let delay = 0;
      if (suggestedPresentationDelay != null) {
        // 1. If a suggestedPresentationDelay is provided by the manifest, that
        // will be used preferentially.
        // This is given a minimum bound of segmentAvailabilityDuration.
        // Content providers should provide a suggestedPresentationDelay
        // whenever possible to optimize the live streaming experience.
        delay = Math.min(
            suggestedPresentationDelay,
            segmentAvailabilityDuration || Infinity);
      } else if (this.config_.defaultPresentationDelay > 0) {
        // 2. If the developer provides a value for
        // "manifest.defaultPresentationDelay", that is used as a fallback.
        delay = this.config_.defaultPresentationDelay;
      } else {
        // 3. Otherwise, we default to the lower of segmentAvailabilityDuration
        // and 1.5 * minBufferTime. This is fairly conservative.
        delay = Math.min(
            minBufferTime * 1.5, segmentAvailabilityDuration || Infinity);
      }
      presentationTimeline = new shaka.media.PresentationTimeline(
          presentationStartTime, delay, this.config_.dash.autoCorrectDrift);
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

    const profiles = mpd.attributes['profiles'] || '';
    this.manifestPatchContext_.profiles = profiles.split(',');

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
      mediaPresentationDuration: null,
      profiles: profiles.split(','),
      roles: null,
      urlParams: () => '',
    };

    await contentSteeringPromise;

    this.gapCount_ = 0;
    const periodsAndDuration = this.parsePeriods_(
        context, getBaseUris, mpd, /* newPeriod= */ false);
    const duration = periodsAndDuration.duration;
    const periods = periodsAndDuration.periods;

    if ((mpdType == 'static' && !this.isTransitionFromDynamicToStatic_) ||
        !periodsAndDuration.durationDerivedFromPeriods) {
      // Ignore duration calculated from Period lengths if this is dynamic.
      presentationTimeline.setDuration(duration || Infinity);
    }

    if (this.isLowLatency_ && this.lowLatencyMode_) {
      presentationTimeline.setAvailabilityTimeOffset(
          this.minTotalAvailabilityTimeOffset_);
    }

    // Use @maxSegmentDuration to override smaller, derived values.
    presentationTimeline.notifyMaxSegmentDuration(maxSegmentDuration || 1);
    if (goog.DEBUG && !this.isTransitionFromDynamicToStatic_) {
      presentationTimeline.assertIsValid();
    }

    if (this.isLowLatency_ && this.lowLatencyMode_) {
      const presentationDelay = suggestedPresentationDelay != null ?
          suggestedPresentationDelay : this.config_.defaultPresentationDelay;
      presentationTimeline.setDelay(presentationDelay);
    }

    // These steps are not done on manifest update.
    if (!this.manifest_) {
      await this.periodCombiner_.combinePeriods(periods, context.dynamic);

      this.manifest_ = {
        presentationTimeline: presentationTimeline,
        variants: this.periodCombiner_.getVariants(),
        textStreams: this.periodCombiner_.getTextStreams(),
        imageStreams: this.periodCombiner_.getImageStreams(),
        offlineSessionIds: [],
        sequenceMode: this.config_.dash.sequenceMode,
        ignoreManifestTimestampsInSegmentsMode: false,
        type: shaka.media.ManifestParser.DASH,
        serviceDescription: this.parseServiceDescription_(mpd),
        nextUrl: this.parseMpdChaining_(mpd),
        periodCount: periods.length,
        gapCount: this.gapCount_,
        isLowLatency: this.isLowLatency_,
        startTime: null,
      };

      // We only need to do clock sync when we're using presentation start
      // time. This condition also excludes VOD streams.
      if (presentationTimeline.usingPresentationStartTime()) {
        const TXml = shaka.util.TXml;
        const timingElements = TXml.findChildren(mpd, 'UTCTiming');
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

      if (this.periodCombiner_ &&
          !this.manifest_.presentationTimeline.isLive()) {
        this.periodCombiner_.release();
      }
    } else {
      this.manifest_.periodCount = periods.length;
      this.manifest_.gapCount = this.gapCount_;
      await this.postPeriodProcessing_(periods, /* isPatchUpdate= */ false);
    }

    // Add text streams to correspond to closed captions.  This happens right
    // after period combining, while we still have a direct reference, so that
    // any new streams will appear in the period combiner.
    this.playerInterface_.makeTextStreamsForClosedCaptions(this.manifest_);

    this.cleanStreamMap_();
    this.cleanContinuityCache_(periods);
  }

  /**
   * Handles common procedures after processing new periods.
   *
   * @param {!Array<shaka.extern.Period>} periods to be appended
   * @param {boolean} isPatchUpdate does call comes from mpd patch update
   * @private
   */
  async postPeriodProcessing_(periods, isPatchUpdate) {
    await this.periodCombiner_.combinePeriods(periods, true, isPatchUpdate);

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

  /**
   * Takes a formatted Patch MPD and converts it into a manifest.
   *
   * @param {!shaka.extern.xml.Node} mpd
   * @return {!Promise}
   * @private
   */
  async processPatchManifest_(mpd) {
    const TXml = shaka.util.TXml;

    const mpdId = mpd.attributes['mpdId'];
    const originalPublishTime = TXml.parseAttr(mpd, 'originalPublishTime',
        TXml.parseDate);
    if (!mpdId || mpdId !== this.manifestPatchContext_.mpdId ||
        originalPublishTime !== this.manifestPatchContext_.publishTime) {
      // Clean patch location nodes, so it will force full MPD update.
      this.patchLocationNodes_ = [];
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_PATCH);
    }

    /** @type {!Array<shaka.extern.Period>} */
    const newPeriods = [];
    /** @type {!Array<shaka.extern.xml.Node>} */
    const periodAdditions = [];
    /** @type {!Set<string>} */
    const modifiedTimelines = new Set();

    for (const patchNode of TXml.getChildNodes(mpd)) {
      let handled = true;
      const paths = TXml.parseXpath(patchNode.attributes['sel'] || '');
      const node = paths[paths.length - 1];
      const content = TXml.getContents(patchNode) || '';

      if (node.name === 'MPD') {
        if (node.attribute === 'mediaPresentationDuration') {
          const content = TXml.getContents(patchNode) || '';
          this.parsePatchMediaPresentationDurationChange_(content);
        } else if (node.attribute === 'type') {
          this.parsePatchMpdTypeChange_(content);
        } else if (node.attribute === 'publishTime') {
          this.manifestPatchContext_.publishTime = TXml.parseDate(content) || 0;
        } else if (node.attribute === null && patchNode.tagName === 'add') {
          periodAdditions.push(patchNode);
        } else {
          handled = false;
        }
      } else if (node.name === 'PatchLocation') {
        this.updatePatchLocationNodes_(patchNode);
      } else if (node.name === 'Period') {
        if (patchNode.tagName === 'add') {
          periodAdditions.push(patchNode);
        } else if (patchNode.tagName === 'remove' && node.id) {
          this.removePatchPeriod_(node.id);
        }
      } else if (node.name === 'SegmentTemplate') {
        const timelines = this.modifySegmentTemplate_(patchNode);
        for (const timeline of timelines) {
          modifiedTimelines.add(timeline);
        }
      } else if (node.name === 'SegmentTimeline' || node.name === 'S') {
        const timelines = this.modifyTimepoints_(patchNode);
        for (const timeline of timelines) {
          modifiedTimelines.add(timeline);
        }
      } else {
        handled = false;
      }
      if (!handled) {
        shaka.log.warning('Unhandled ' + patchNode.tagName + ' operation',
            patchNode.attributes['sel']);
      }
    }

    for (const timeline of modifiedTimelines) {
      this.parsePatchSegment_(timeline);
    }

    // Add new periods after extending timelines, as new periods
    // remove context cache of previous periods.
    for (const periodAddition of periodAdditions) {
      newPeriods.push(...this.parsePatchPeriod_(periodAddition));
    }

    if (newPeriods.length) {
      this.manifest_.periodCount += newPeriods.length;
      this.manifest_.gapCount = this.gapCount_;
      await this.postPeriodProcessing_(newPeriods, /* isPatchUpdate= */ true);
    }
    if (this.manifestPatchContext_.type == 'static') {
      const duration = this.manifestPatchContext_.mediaPresentationDuration;
      this.manifest_.presentationTimeline.setDuration(duration || Infinity);
    }
  }

  /**
   * Handles manifest type changes, this transition is expected to be
   * "dynamic" to "static".
   *
   * @param {!string} mpdType
   * @private
   */
  parsePatchMpdTypeChange_(mpdType) {
    this.manifest_.presentationTimeline.setStatic(mpdType == 'static');
    this.manifestPatchContext_.type = mpdType;
    for (const context of this.contextCache_.values()) {
      context.dynamic = mpdType == 'dynamic';
    }
    if (mpdType == 'static') {
      // Manifest is no longer dynamic, so stop live updates.
      this.updatePeriod_ = -1;
    }
  }

  /**
   * @param {string} durationString
   * @private
   */
  parsePatchMediaPresentationDurationChange_(durationString) {
    const duration = shaka.util.TXml.parseDuration(durationString);
    if (duration == null) {
      return;
    }
    this.manifestPatchContext_.mediaPresentationDuration = duration;
    for (const context of this.contextCache_.values()) {
      context.mediaPresentationDuration = duration;
    }
  }

  /**
   * Ingests a full MPD period element from a patch update
   *
   * @param {!shaka.extern.xml.Node} periods
   * @private
   */
  parsePatchPeriod_(periods) {
    goog.asserts.assert(this.manifestPatchContext_.getBaseUris,
        'Must provide getBaseUris on manifestPatchContext_');

    /** @type {shaka.dash.DashParser.Context} */
    const context = {
      dynamic: this.manifestPatchContext_.type == 'dynamic',
      presentationTimeline: this.manifest_.presentationTimeline,
      period: null,
      periodInfo: null,
      adaptationSet: null,
      representation: null,
      bandwidth: 0,
      indexRangeWarningGiven: false,
      availabilityTimeOffset: this.manifestPatchContext_.availabilityTimeOffset,
      profiles: this.manifestPatchContext_.profiles,
      mediaPresentationDuration:
          this.manifestPatchContext_.mediaPresentationDuration,
      roles: null,
      urlParams: () => '',
    };

    const periodsAndDuration = this.parsePeriods_(context,
        this.manifestPatchContext_.getBaseUris, periods, /* newPeriod= */ true);

    return periodsAndDuration.periods;
  }

  /**
   * @param {string} periodId
   * @private
   */
  removePatchPeriod_(periodId) {
    const SegmentTemplate = shaka.dash.SegmentTemplate;
    this.manifest_.periodCount--;
    for (const contextId of this.contextCache_.keys()) {
      if (contextId.startsWith(periodId)) {
        const context = this.contextCache_.get(contextId);
        SegmentTemplate.removeTimepoints(context);
        this.parsePatchSegment_(contextId);
        this.contextCache_.delete(contextId);
      }
    }
    const newPeriods = this.lastManifestUpdatePeriodIds_.filter((pID) => {
      return pID !== periodId;
    });
    this.lastManifestUpdatePeriodIds_ = newPeriods;
  }

  /**
   * @param {!Array<shaka.util.TXml.PathNode>} paths
   * @return {!Array<string>}
   * @private
   */
  getContextIdsFromPath_(paths) {
    let periodId = '';
    let adaptationSetId = '';
    let adaptationSetPosition = -1;
    let representationId = '';
    for (const node of paths) {
      if (node.name === 'Period') {
        periodId = node.id;
      } else if (node.name === 'AdaptationSet') {
        adaptationSetId = node.id;
        if (node.position !== null) {
          adaptationSetPosition = node.position;
        }
      } else if (node.name === 'Representation') {
        representationId = node.id;
      }
    }

    /** @type {!Array<string>} */
    const contextIds = [];

    if (representationId) {
      contextIds.push(periodId + ',' + representationId);
    } else {
      if (adaptationSetId) {
        for (const context of this.contextCache_.values()) {
          if (context.period.id === periodId &&
              context.adaptationSet.id === adaptationSetId &&
              context.representation.id) {
            contextIds.push(periodId + ',' + context.representation.id);
          }
        }
      } else {
        if (adaptationSetPosition > -1) {
          for (const context of this.contextCache_.values()) {
            if (context.period.id === periodId &&
                context.adaptationSet.position === adaptationSetPosition &&
                context.representation.id) {
              contextIds.push(periodId + ',' + context.representation.id);
            }
          }
        }
      }
    }

    return contextIds;
  }

  /**
   * Modifies SegmentTemplate based on MPD patch.
   *
   * @param {!shaka.extern.xml.Node} patchNode
   * @return {!Array<string>} context ids with updated timeline
   * @private
   */
  modifySegmentTemplate_(patchNode) {
    const TXml = shaka.util.TXml;
    const paths = TXml.parseXpath(patchNode.attributes['sel'] || '');
    const lastPath = paths[paths.length - 1];
    if (!lastPath.attribute) {
      return [];
    }
    const contextIds = this.getContextIdsFromPath_(paths);
    const content = TXml.getContents(patchNode) || '';

    for (const contextId of contextIds) {
      /** @type {shaka.dash.DashParser.Context} */
      const context = this.contextCache_.get(contextId);
      goog.asserts.assert(context && context.representation.segmentTemplate,
          'cannot modify segment template');
      TXml.modifyNodeAttribute(context.representation.segmentTemplate,
          patchNode.tagName, lastPath.attribute, content);
    }
    return contextIds;
  }

  /**
   * Ingests Patch MPD segments into timeline.
   *
   * @param {!shaka.extern.xml.Node} patchNode
   * @return {!Array<string>} context ids with updated timeline
   * @private
   */
  modifyTimepoints_(patchNode) {
    const TXml = shaka.util.TXml;
    const SegmentTemplate = shaka.dash.SegmentTemplate;

    const paths = TXml.parseXpath(patchNode.attributes['sel'] || '');
    const contextIds = this.getContextIdsFromPath_(paths);

    for (const contextId of contextIds) {
      /** @type {shaka.dash.DashParser.Context} */
      const context = this.contextCache_.get(contextId);
      SegmentTemplate.modifyTimepoints(context, patchNode);
    }
    return contextIds;
  }

  /**
   * Parses modified segments.
   *
   * @param {string} contextId
   * @private
   */
  parsePatchSegment_(contextId) {
    /** @type {shaka.dash.DashParser.Context} */
    const context = this.contextCache_.get(contextId);

    const currentStream = this.streamMap_.get(contextId);
    goog.asserts.assert(currentStream, 'stream should exist');

    if (currentStream.segmentIndex) {
      currentStream.segmentIndex.evict(
          this.manifest_.presentationTimeline.getSegmentAvailabilityStart());
    }

    try {
      const requestSegment = (uris, startByte, endByte, isInit) => {
        return this.requestSegment_(uris, startByte, endByte, isInit);
      };
      // TODO we should obtain lastSegmentNumber if possible
      const streamInfo = shaka.dash.SegmentTemplate.createStreamInfo(
          context, requestSegment, this.streamMap_, /* isUpdate= */ true,
          this.config_.dash.initialSegmentLimit, this.periodDurations_,
          context.representation.aesKey, /* lastSegmentNumber= */ null,
          /* isPatchUpdate= */ true, this.continuityCache_);
      currentStream.createSegmentIndex = async () => {
        if (!currentStream.segmentIndex) {
          currentStream.segmentIndex =
                await streamInfo.generateSegmentIndex();
        }
      };
    } catch (error) {
      const ContentType = shaka.util.ManifestParserUtils.ContentType;
      const contentType = context.representation.contentType;
      const isText = contentType == ContentType.TEXT ||
            contentType == ContentType.APPLICATION;
      const isImage = contentType == ContentType.IMAGE;
      if (!(isText || isImage) ||
            error.code != shaka.util.Error.Code.DASH_NO_SEGMENT_INFO) {
        // We will ignore any DASH_NO_SEGMENT_INFO errors for text/image
        throw error;
      }
    }
  }

  /**
   * Reads maxLatency and maxPlaybackRate properties from service
   * description element.
   *
   * @param {!shaka.extern.xml.Node} mpd
   * @return {?shaka.extern.ServiceDescription}
   * @private
   */
  parseServiceDescription_(mpd) {
    const TXml = shaka.util.TXml;
    const elem = TXml.findChild(mpd, 'ServiceDescription');

    if (!elem ) {
      return null;
    }

    const latencyNode = TXml.findChild(elem, 'Latency');
    const playbackRateNode = TXml.findChild(elem, 'PlaybackRate');

    if (!latencyNode && !playbackRateNode) {
      return null;
    }

    const description = {};

    if (latencyNode) {
      if ('target' in latencyNode.attributes) {
        description.targetLatency =
          parseInt(latencyNode.attributes['target'], 10) / 1000;
      }
      if ('max' in latencyNode.attributes) {
        description.maxLatency =
          parseInt(latencyNode.attributes['max'], 10) / 1000;
      }
      if ('min' in latencyNode.attributes) {
        description.minLatency =
          parseInt(latencyNode.attributes['min'], 10) / 1000;
      }
    }

    if (playbackRateNode) {
      if ('max' in playbackRateNode.attributes) {
        description.maxPlaybackRate =
          parseFloat(playbackRateNode.attributes['max']);
      }
      if ('min' in playbackRateNode.attributes) {
        description.minPlaybackRate =
          parseFloat(playbackRateNode.attributes['min']);
      }
    }

    return description;
  }

  /**
   * Reads chaining url.
   *
   * @param {!shaka.extern.xml.Node} mpd
   * @return {?string}
   * @private
   */
  parseMpdChaining_(mpd) {
    const TXml = shaka.util.TXml;
    const supplementalProperties =
        TXml.findChildren(mpd, 'SupplementalProperty');

    if (!supplementalProperties.length) {
      return null;
    }

    for (const prop of supplementalProperties) {
      const schemeId = prop.attributes['schemeIdUri'];
      if (schemeId == 'urn:mpeg:dash:chaining:2016') {
        return prop.attributes['value'];
      }
    }

    return null;
  }

  /**
   * Reads and parses the periods from the manifest.  This first does some
   * partial parsing so the start and duration is available when parsing
   * children.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {function(): !Array<string>} getBaseUris
   * @param {!shaka.extern.xml.Node} mpd
   * @param {!boolean} newPeriod
   * @return {{
   *   periods: !Array<shaka.extern.Period>,
   *   duration: ?number,
   *   durationDerivedFromPeriods: boolean,
   * }}
   * @private
   */
  parsePeriods_(context, getBaseUris, mpd, newPeriod) {
    const TXml = shaka.util.TXml;
    let presentationDuration = context.mediaPresentationDuration;

    if (!presentationDuration) {
      presentationDuration = TXml.parseAttr(
          mpd, 'mediaPresentationDuration', TXml.parseDuration);
      this.manifestPatchContext_.mediaPresentationDuration =
          presentationDuration;
    }

    let seekRangeStart = 0;
    if (this.manifest_ && this.manifest_.presentationTimeline &&
        this.isTransitionFromDynamicToStatic_) {
      seekRangeStart = this.manifest_.presentationTimeline.getSeekRangeStart();
    }

    const periods = [];
    let prevEnd = seekRangeStart;
    const periodNodes = TXml.findChildren(mpd, 'Period');
    for (let i = 0; i < periodNodes.length; i++) {
      const elem = periodNodes[i];
      const next = periodNodes[i + 1];
      let start = /** @type {number} */ (
        TXml.parseAttr(elem, 'start', TXml.parseDuration, prevEnd));
      const periodId = elem.attributes['id'];
      const givenDuration =
          TXml.parseAttr(elem, 'duration', TXml.parseDuration);
      start = (i == 0 && start == 0 && this.isTransitionFromDynamicToStatic_) ?
          seekRangeStart : start;

      let periodDuration = null;
      if (next) {
        // "The difference between the start time of a Period and the start time
        // of the following Period is the duration of the media content
        // represented by this Period."
        const nextStart =
            TXml.parseAttr(next, 'start', TXml.parseDuration);
        if (nextStart != null) {
          periodDuration = nextStart - start + seekRangeStart;
        }
      } else if (presentationDuration != null) {
        // "The Period extends until the Period.start of the next Period, or
        // until the end of the Media Presentation in the case of the last
        // Period."
        periodDuration = presentationDuration - start + seekRangeStart;
      }

      const threshold =
          shaka.util.ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS;
      if (periodDuration && givenDuration &&
          Math.abs(periodDuration - givenDuration) > threshold) {
        shaka.log.warning('There is a gap/overlap between Periods', elem);

        // This means it's a gap, the distance between period starts is
        // larger than the period's duration
        if (periodDuration > givenDuration) {
          this.gapCount_++;
        }
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
        this.periodDurations_.set(context.period.id, periodDuration);
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

    if (newPeriod) {
      // append new period from the patch manifest
      for (const el of periods) {
        const periodID = el.id;
        if (!this.lastManifestUpdatePeriodIds_.includes(periodID)) {
          this.lastManifestUpdatePeriodIds_.push(periodID);
        }
      }
    } else {
      // Replace previous seen periods with the current one.
      this.lastManifestUpdatePeriodIds_ = periods.map((el) => el.id);
    }

    if (presentationDuration != null) {
      if (prevEnd != null) {
        const threshold =
            shaka.util.ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS;
        const difference = prevEnd - seekRangeStart - presentationDuration;
        if (Math.abs(difference) > threshold) {
          shaka.log.warning(
              '@mediaPresentationDuration does not match the total duration ',
              'of all Periods.');
          // Assume @mediaPresentationDuration is correct.
        }
      }
      return {
        periods: periods,
        duration: presentationDuration + seekRangeStart,
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
   * Clean StreamMap Object to remove reference of deleted Stream Object
   * @private
   */
  cleanStreamMap_() {
    const oldPeriodIds = Array.from(this.indexStreamMap_.keys());
    const diffPeriodsIDs = oldPeriodIds.filter((pId) => {
      return !this.lastManifestUpdatePeriodIds_.includes(pId);
    });
    for (const pId of diffPeriodsIDs) {
      let shouldDeleteIndex = true;
      for (const contextId of this.indexStreamMap_.get(pId)) {
        const stream = this.streamMap_.get(contextId);
        if (!stream) {
          continue;
        }
        if (stream.segmentIndex && !stream.segmentIndex.isEmpty()) {
          shouldDeleteIndex = false;
          continue;
        }
        if (this.periodCombiner_) {
          this.periodCombiner_.deleteStream(stream, pId);
        }
        this.streamMap_.delete(contextId);
      }
      if (shouldDeleteIndex) {
        this.indexStreamMap_.delete(pId);
      }
    }
  }

  /**
   * Clean continuityCache Object to remove reference of removed periods.
   * This should end up running after the current manifest has been processed
   * so that it can use previous periods to calculate the continuity of the new
   * periods.
   * @param {!Array<shaka.extern.Period>} periods
   * @private
   */
  cleanContinuityCache_(periods) {
    const activePeriodId = new Set(periods.map((p) => p.id));
    for (const key of this.continuityCache_.keys()) {
      if (!activePeriodId.has(key)) {
        this.continuityCache_.delete(key);
      }
    }
  }

  /**
   * Parses a Period XML element.  Unlike the other parse methods, this is not
   * given the Node; it is given a PeriodInfo structure.  Also, partial parsing
   * was done before this was called so start and duration are valid.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {function(): !Array<string>} getBaseUris
   * @param {shaka.dash.DashParser.PeriodInfo} periodInfo
   * @return {shaka.extern.Period}
   * @private
   */
  parsePeriod_(context, getBaseUris, periodInfo) {
    const Functional = shaka.util.Functional;
    const TXml = shaka.util.TXml;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    goog.asserts.assert(periodInfo.node, 'periodInfo.node should exist');
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
        TXml.findChildren(periodInfo.node, 'EventStream');
    const availabilityStart =
        context.presentationTimeline.getSegmentAvailabilityStart();

    for (const node of eventStreamNodes) {
      this.parseEventStream_(
          periodInfo.start, periodInfo.duration, node, availabilityStart);
    }


    const supplementalProperties =
        TXml.findChildren(periodInfo.node, 'SupplementalProperty');
    for (const prop of supplementalProperties) {
      const schemeId = prop.attributes['schemeIdUri'];
      if (schemeId == 'urn:mpeg:dash:urlparam:2014') {
        const urlParams = this.getURLParametersFunction_(prop);
        if (urlParams) {
          context.urlParams = urlParams;
        }
      }
    }

    const adaptationSets =
        TXml.findChildren(periodInfo.node, 'AdaptationSet')
            .map((node, position) =>
              this.parseAdaptationSet_(context, position, node))
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

    /** @type {!Map<string, shaka.extern.Stream>} */
    const dependencyStreamMap = new Map();
    for (const adaptationSet of adaptationSets) {
      for (const [dependencyId, stream] of adaptationSet.dependencyStreamMap) {
        dependencyStreamMap.set(dependencyId, stream);
      }
    }

    if (dependencyStreamMap.size) {
      let duplicateAdaptationSets = null;
      for (const adaptationSet of adaptationSets) {
        const streamsWithDependencyStream = [];
        for (const stream of adaptationSet.streams) {
          if (dependencyStreamMap.has(stream.originalId)) {
            if (!duplicateAdaptationSets) {
              duplicateAdaptationSets =
                  TXml.findChildren(periodInfo.node, 'AdaptationSet')
                      .map((node, position) =>
                        this.parseAdaptationSet_(context, position, node))
                      .filter(Functional.isNotNull);
            }
            for (const duplicateAdaptationSet of duplicateAdaptationSets) {
              const newStream = duplicateAdaptationSet.streams.find(
                  (s) => s.originalId == stream.originalId);
              if (newStream) {
                newStream.dependencyStream =
                    dependencyStreamMap.get(newStream.originalId);
                newStream.originalId += newStream.dependencyStream.originalId;
                streamsWithDependencyStream.push(newStream);
              }
            }
          }
        }
        if (streamsWithDependencyStream.length) {
          adaptationSet.streams.push(...streamsWithDependencyStream);
        }
      }
    }

    const normalAdaptationSets = adaptationSets
        .filter((as) => { return !as.trickModeFor; });

    const trickModeAdaptationSets = adaptationSets
        .filter((as) => { return as.trickModeFor; });

    // Attach trick mode tracks to normal tracks.
    if (!this.config_.disableIFrames) {
      for (const trickModeSet of trickModeAdaptationSets) {
        const targetIds = trickModeSet.trickModeFor.split(' ');
        for (const normalSet of normalAdaptationSets) {
          if (targetIds.includes(normalSet.id)) {
            for (const stream of normalSet.streams) {
              shaka.util.StreamUtils.setBetterIFrameStream(
                  stream, trickModeSet.streams);
            }
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
   * @param {!Array<!shaka.dash.DashParser.AdaptationInfo>} adaptationSets
   * @param {string} contentType
   * @private
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
   * @param {number} position
   * @param {!shaka.extern.xml.Node} elem The AdaptationSet element.
   * @return {?shaka.dash.DashParser.AdaptationInfo}
   * @private
   */
  parseAdaptationSet_(context, position, elem) {
    const TXml = shaka.util.TXml;
    const Functional = shaka.util.Functional;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const ContentType = ManifestParserUtils.ContentType;

    context.adaptationSet = this.createFrame_(elem, context.period, null);
    context.adaptationSet.position = position;

    let main = false;
    const roleElements = TXml.findChildren(elem, 'Role');
    const roleValues = roleElements.map((role) => {
      return role.attributes['value'];
    }).filter(Functional.isNotNull);

    // Default kind for text streams is 'subtitle' if unspecified in the
    // manifest.
    let kind = undefined;
    const isText = context.adaptationSet.contentType == ContentType.TEXT;
    if (isText) {
      kind = ManifestParserUtils.TextStreamKind.SUBTITLE;
    }

    for (const roleElement of roleElements) {
      const scheme = roleElement.attributes['schemeIdUri'];
      if (scheme == null || scheme == 'urn:mpeg:dash:role:2011') {
        // These only apply for the given scheme, but allow them to be specified
        // if there is no scheme specified.
        // See: DASH section 5.8.5.5
        const value = roleElement.attributes['value'];
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

    let colorGamut;

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

    const getColorGamutFromColourPrimariesCICP = (cicp) => {
      switch (cicp) {
        case 1:
        case 5:
        case 6:
        case 7:
          return 'srgb';
        case 9:
          return 'rec2020';
        case 11:
        case 12:
          return 'p3';
      }
      return undefined;
    };

    const parseFont = (prop) => {
      const fontFamily = prop.attributes['dvb:fontFamily'];
      const fontUrl = prop.attributes['dvb:url'];
      if (fontFamily && fontUrl) {
        const uris = shaka.util.ManifestParserUtils.resolveUris(
            context.adaptationSet.getBaseUris(), [fontUrl],
            context.urlParams());
        this.playerInterface_.addFont(fontFamily, uris[0]);
      }
    };

    const essentialProperties =
        TXml.findChildren(elem, 'EssentialProperty');
    // ID of real AdaptationSet if this is a trick mode set:
    let trickModeFor = null;
    let isFastSwitching = false;
    let adaptationSetUrlParams = null;
    let unrecognizedEssentialProperty = false;
    for (const prop of essentialProperties) {
      const schemeId = prop.attributes['schemeIdUri'];
      if (schemeId == 'http://dashif.org/guidelines/trickmode') {
        trickModeFor = prop.attributes['value'];
      } else if (schemeId == transferCharacteristicsScheme) {
        videoRange = getVideoRangeFromTransferCharacteristicCICP(
            parseInt(prop.attributes['value'], 10),
        );
      } else if (schemeId == colourPrimariesScheme) {
        colorGamut = getColorGamutFromColourPrimariesCICP(
            parseInt(prop.attributes['value'], 10),
        );
      } else if (schemeId == matrixCoefficientsScheme) {
        continue;
      } else if (schemeId == 'urn:mpeg:dash:ssr:2023' &&
          this.config_.dash.enableFastSwitching) {
        isFastSwitching = true;
      } else if (schemeId == 'urn:dvb:dash:fontdownload:2014') {
        parseFont(prop);
      } else if (schemeId == 'urn:mpeg:dash:urlparam:2014') {
        adaptationSetUrlParams = this.getURLParametersFunction_(prop);
        if (!adaptationSetUrlParams) {
          unrecognizedEssentialProperty = true;
        }
      } else {
        unrecognizedEssentialProperty = true;
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

    let lastSegmentNumber = null;

    const supplementalProperties =
        TXml.findChildren(elem, 'SupplementalProperty');
    for (const prop of supplementalProperties) {
      const schemeId = prop.attributes['schemeIdUri'];
      if (schemeId == 'http://dashif.org/guidelines/last-segment-number') {
        lastSegmentNumber = parseInt(prop.attributes['value'], 10) - 1;
      } else if (schemeId == transferCharacteristicsScheme) {
        videoRange = getVideoRangeFromTransferCharacteristicCICP(
            parseInt(prop.attributes['value'], 10),
        );
      } else if (schemeId == colourPrimariesScheme) {
        colorGamut = getColorGamutFromColourPrimariesCICP(
            parseInt(prop.attributes['value'], 10),
        );
      } else if (schemeId == 'urn:dvb:dash:fontdownload:2014') {
        parseFont(prop);
      } else if (schemeId == 'urn:mpeg:dash:urlparam:2014') {
        adaptationSetUrlParams = this.getURLParametersFunction_(prop);
      }
    }

    if (adaptationSetUrlParams) {
      context.urlParams = adaptationSetUrlParams;
    }

    const accessibilities = TXml.findChildren(elem, 'Accessibility');
    const LanguageUtils = shaka.util.LanguageUtils;
    const closedCaptions = new Map();
    /** @type {?shaka.media.ManifestParser.AccessibilityPurpose} */
    let accessibilityPurpose;
    for (const prop of accessibilities) {
      const schemeId = prop.attributes['schemeIdUri'];
      const value = prop.attributes['value'];
      if (schemeId == 'urn:scte:dash:cc:cea-608:2015' &&
          !this.config_.disableText) {
        let channelId = 1;
        if (value != null) {
          const channelAssignments = value.split(';');
          for (const captionStr of channelAssignments) {
            let channel;
            let language;
            // Some closed caption descriptions have channel number and
            // language ("CC1=eng") others may only have language ("eng,spa").
            if (!captionStr.includes('=')) {
              // When the channel assignments are not explicitly provided and
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
      } else if (schemeId == 'urn:scte:dash:cc:cea-708:2015' &&
          !this.config_.disableText) {
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
            // 1=lang:eng;2=lang:deu" i.e. serviceNumber=lang:threeLetterCode.
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
        } else if (value == '9') {
          accessibilityPurpose =
              shaka.media.ManifestParser.AccessibilityPurpose.SPOKEN_SUBTITLES;
        }
      }
    }

    const contentProtectionElements =
        TXml.findChildren(elem, 'ContentProtection');
    const contentProtection = this.contentProtection_.parseFromAdaptationSet(
        contentProtectionElements,
        this.config_.ignoreDrmInfo,
        this.config_.dash.keySystemsByURI);

    // We use contentProtectionElements instead of drmInfos as the latter is
    // not populated yet, and we need the encrypted flag for the upcoming
    // parseRepresentation that will set the encrypted flag to the init seg.
    context.adaptationSet.encrypted = contentProtectionElements.length > 0;

    const language = shaka.util.LanguageUtils.normalize(
        context.adaptationSet.language || 'und');

    const label = context.adaptationSet.label;

    /** @type {!Map<string, shaka.extern.Stream>} */
    const dependencyStreamMap = new Map();

    // Parse Representations into Streams.
    const representations = TXml.findChildren(elem, 'Representation');
    if (!this.config_.ignoreSupplementalCodecs) {
      const supplementalRepresentations = [];
      for (const rep of representations) {
        const supplementalCodecs = TXml.getAttributeNS(
            rep, shaka.dash.DashParser.SCTE214_, 'supplementalCodecs');
        if (supplementalCodecs) {
          // Duplicate representations with their supplementalCodecs
          const obj = shaka.util.ObjectUtils.cloneObject(rep);
          obj.attributes['codecs'] = supplementalCodecs.split(' ').join(',');
          if (obj.attributes['id']) {
            obj.attributes['supplementalId'] =
                obj.attributes['id'] + '_supplementalCodecs';
          }
          supplementalRepresentations.push(obj);
        }
      }
      representations.push(...supplementalRepresentations);
    }
    const streams = representations.map((representation) => {
      const parsedRepresentation = this.parseRepresentation_(context,
          contentProtection, kind, language, label, main, roleValues,
          closedCaptions, representation, accessibilityPurpose,
          lastSegmentNumber);
      if (parsedRepresentation) {
        parsedRepresentation.hdr = parsedRepresentation.hdr || videoRange;
        parsedRepresentation.colorGamut =
            parsedRepresentation.colorGamut || colorGamut;
        parsedRepresentation.fastSwitching = isFastSwitching;
        const dependencyId = representation.attributes['dependencyId'];
        if (dependencyId) {
          parsedRepresentation.baseOriginalId = dependencyId;
          dependencyStreamMap.set(dependencyId, parsedRepresentation);
          return null;
        }
      }
      return parsedRepresentation;
    }).filter((s) => !!s);

    if (streams.length == 0 && dependencyStreamMap.size == 0) {
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
      if (this.config_.enableAudioGroups) {
        stream.groupId = adaptationId;
      }
    }

    const repIds = representations
        .map((node) => {
          return node.attributes['supplementalId'] || node.attributes['id'];
        }).filter(shaka.util.Functional.isNotNull);

    return {
      id: adaptationId,
      contentType: context.adaptationSet.contentType,
      language: language,
      main: main,
      streams: streams,
      drmInfos: contentProtection.drmInfos,
      trickModeFor: trickModeFor,
      representationIds: repIds,
      dependencyStreamMap,
    };
  }

  /**
   * @param {!shaka.extern.xml.Node} elem
   * @return {?function():string}
   * @private
   */
  getURLParametersFunction_(elem) {
    const TXml = shaka.util.TXml;
    const urlQueryInfo = TXml.findChildNS(
        elem, shaka.dash.DashParser.UP_NAMESPACE_, 'UrlQueryInfo');
    if (urlQueryInfo && TXml.parseAttr(urlQueryInfo, 'useMPDUrlQuery',
        TXml.parseBoolean, /* defaultValue= */ false)) {
      const queryTemplate = urlQueryInfo.attributes['queryTemplate'];
      if (queryTemplate) {
        return () => {
          if (queryTemplate == '$querypart$') {
            return this.lastManifestQueryParams_;
          }
          const parameters = queryTemplate.split('&').map((param) => {
            if (param == '$querypart$') {
              return this.lastManifestQueryParams_;
            } else {
              const regex = /\$query:(.*?)\$/g;
              const parts = regex.exec(param);
              if (parts && parts.length == 2) {
                const paramName = parts[1];
                const queryData =
                    new goog.Uri.QueryData(this.lastManifestQueryParams_);
                const value = queryData.get(paramName);
                if (value.length) {
                  return paramName + '=' + value[0];
                }
              }
              return param;
            }
          });
          return parameters.join('&');
        };
      }
    }
    return null;
  }

  /**
   * Parses a Representation XML element.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.ContentProtection.Context} contentProtection
   * @param {(string|undefined)} kind
   * @param {string} language
   * @param {?string} label
   * @param {boolean} isPrimary
   * @param {!Array<string>} roles
   * @param {Map<string, string>} closedCaptions
   * @param {!shaka.extern.xml.Node} node
   * @param {?shaka.media.ManifestParser.AccessibilityPurpose
   *        } accessibilityPurpose
   * @param {?number} lastSegmentNumber
   *
   * @return {?shaka.extern.Stream} The Stream, or null when there is a
   *   non-critical parsing error.
   * @private
   */
  parseRepresentation_(context, contentProtection, kind, language, label,
      isPrimary, roles, closedCaptions, node, accessibilityPurpose,
      lastSegmentNumber) {
    const TXml = shaka.util.TXml;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    context.representation =
        this.createFrame_(node, context.adaptationSet, null);

    const representationId = context.representation.id;

    this.minTotalAvailabilityTimeOffset_ =
        Math.min(this.minTotalAvailabilityTimeOffset_,
            context.representation.availabilityTimeOffset);

    this.isLowLatency_ = this.minTotalAvailabilityTimeOffset_ > 0;

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
        TXml.parseAttr(node, 'bandwidth', TXml.parsePositiveInt) || 0;

    context.roles = roles;

    const supplementalPropertyElements =
        TXml.findChildren(node, 'SupplementalProperty');
    const essentialPropertyElements =
        TXml.findChildren(node, 'EssentialProperty');
    const contentProtectionElements =
        TXml.findChildren(node, 'ContentProtection');

    let representationUrlParams = null;
    let urlParamsElement = essentialPropertyElements.find((element) => {
      const schemeId = element.attributes['schemeIdUri'];
      return schemeId == 'urn:mpeg:dash:urlparam:2014';
    });
    if (urlParamsElement) {
      representationUrlParams =
          this.getURLParametersFunction_(urlParamsElement);
    } else {
      urlParamsElement = supplementalPropertyElements.find((element) => {
        const schemeId = element.attributes['schemeIdUri'];
        return schemeId == 'urn:mpeg:dash:urlparam:2014';
      });
      if (urlParamsElement) {
        representationUrlParams =
            this.getURLParametersFunction_(urlParamsElement);
      }
    }

    if (representationUrlParams) {
      context.urlParams = representationUrlParams;
    }

    /** @type {?shaka.dash.DashParser.StreamInfo} */
    let streamInfo;

    const contentType = context.representation.contentType;
    const isText = contentType == ContentType.TEXT ||
                   contentType == ContentType.APPLICATION;
    const isImage = contentType == ContentType.IMAGE;

    if (contentProtectionElements.length) {
      context.adaptationSet.encrypted = true;
    }

    try {
      /** @type {shaka.extern.aesKey|undefined} */
      let aesKey = undefined;
      if (contentProtection.aes128Info) {
        const getBaseUris = context.representation.getBaseUris;
        const urlParams = context.urlParams;
        const uris = shaka.util.ManifestParserUtils.resolveUris(
            getBaseUris(), [contentProtection.aes128Info.keyUri], urlParams());
        const requestType = shaka.net.NetworkingEngine.RequestType.KEY;
        const request = shaka.net.NetworkingEngine.makeRequest(
            uris, this.config_.retryParameters);

        aesKey = {
          bitsKey: 128,
          blockCipherMode: 'CBC',
          iv: contentProtection.aes128Info.iv,
          firstMediaSequenceNumber: 0,
        };

        // Don't download the key object until the segment is parsed, to
        // avoid a startup delay for long manifests with lots of keys.
        aesKey.fetchKey = async () => {
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
          aesKey.cryptoKey = await window.crypto.subtle.importKey(
              'raw', keyResponse.data, algorithm, true, ['decrypt']);
          aesKey.fetchKey = undefined; // No longer needed.
        };
      }
      context.representation.aesKey = aesKey;

      const requestSegment = (uris, startByte, endByte, isInit) => {
        return this.requestSegment_(uris, startByte, endByte, isInit);
      };
      if (context.representation.segmentBase) {
        streamInfo = shaka.dash.SegmentBase.createStreamInfo(
            context, requestSegment, aesKey);
      } else if (context.representation.segmentList) {
        streamInfo = shaka.dash.SegmentList.createStreamInfo(
            context, this.streamMap_, aesKey);
      } else if (context.representation.segmentTemplate) {
        const hasManifest = !!this.manifest_;

        streamInfo = shaka.dash.SegmentTemplate.createStreamInfo(
            context, requestSegment, this.streamMap_, hasManifest,
            this.config_.dash.initialSegmentLimit, this.periodDurations_,
            aesKey, lastSegmentNumber, /* isPatchUpdate= */ false,
            this.continuityCache_);
      } else {
        goog.asserts.assert(isText,
            'Must have Segment* with non-text streams.');

        const duration = context.periodInfo.duration || 0;
        const getBaseUris = context.representation.getBaseUris;
        const mimeType = context.representation.mimeType;
        const codecs = context.representation.codecs;
        streamInfo = {
          endTime: -1,
          timeline: -1,
          generateSegmentIndex: () => {
            const segmentIndex = shaka.media.SegmentIndex.forSingleSegment(
                periodStart, duration, getBaseUris());
            segmentIndex.forEachTopLevelReference((ref) => {
              ref.mimeType = mimeType;
              ref.codecs = codecs;
            });
            return Promise.resolve(segmentIndex);
          },
          timescale: 1,
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

    const keyId = this.contentProtection_.parseFromRepresentation(
        contentProtectionElements, contentProtection,
        this.config_.ignoreDrmInfo,
        this.config_.dash.keySystemsByURI);
    const keyIds = new Set(keyId ? [keyId] : []);

    // Detect the presence of E-AC3 JOC audio content, using DD+JOC signaling.
    // See: ETSI TS 103 420 V1.2.1 (2018-10)
    const hasJoc = supplementalPropertyElements.some((element) => {
      const expectedUri = 'tag:dolby.com,2018:dash:EC3_ExtensionType:2018';
      const expectedValue = 'JOC';
      return element.attributes['schemeIdUri'] == expectedUri &&
          element.attributes['value'] == expectedValue;
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
      const thumbnailTileElem = essentialPropertyElements.find((element) => {
        const expectedUris = [
          'http://dashif.org/thumbnail_tile',
          'http://dashif.org/guidelines/thumbnail_tile',
        ];
        return expectedUris.includes(element.attributes['schemeIdUri']);
      });
      if (thumbnailTileElem) {
        tilesLayout = thumbnailTileElem.attributes['value'];
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

    if (this.patchLocationNodes_.length && representationId) {
      this.contextCache_.set(`${context.period.id},${representationId}`,
          this.cloneContext_(context));
    }

    if (context.representation.producerReferenceTime) {
      this.parseProducerReferenceTime_(
          context.representation.producerReferenceTime,
          streamInfo,
          context.presentationTimeline);
    }

    if (streamInfo.endTime != -1 &&
      context.period.id != null &&
      context.representation.id != null) {
      const cache = this.continuityCache_.get(context.period.id);
      if (cache) {
        cache.endTime = streamInfo.endTime;
        if (!cache.reps.includes(context.representation.id)) {
          cache.reps.push(context.representation.id);
        }
        this.continuityCache_.set(context.period.id, cache);
      } else {
        const cache = {
          endTime: streamInfo.endTime,
          timeline: streamInfo.timeline,
          reps: [context.representation.id],
        };
        this.continuityCache_.set(context.period.id, cache);
      }
    }

    /** @type {shaka.extern.Stream} */
    let stream;

    if (contextId && this.streamMap_.has(contextId)) {
      stream = this.streamMap_.get(contextId);
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
        codecs,
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
        dependencyStream: null,
        emsgSchemeIdUris:
            context.representation.emsgSchemeIdUris,
        roles,
        forced,
        channelsCount: context.representation.numChannels,
        audioSamplingRate: context.representation.audioSamplingRate,
        spatialAudio,
        closedCaptions,
        hdr,
        colorGamut: undefined,
        videoLayout: undefined,
        tilesLayout,
        accessibilityPurpose,
        external: false,
        fastSwitching: false,
        fullMimeTypes: new Set([shaka.util.MimeUtils.getFullType(
            context.representation.mimeType, context.representation.codecs)]),
        isAudioMuxedInVideo: false,
        baseOriginalId: null,
      };
    }

    stream.createSegmentIndex = async () => {
      if (!stream.segmentIndex) {
        stream.segmentIndex = await streamInfo.generateSegmentIndex();
      }
    };

    if (contextId && context.dynamic && !this.streamMap_.has(contextId)) {
      const periodId = context.period.id || '';
      if (!this.indexStreamMap_.has(periodId)) {
        this.indexStreamMap_.set(periodId, []);
      }
      this.streamMap_.set(contextId, stream);
      this.indexStreamMap_.get(periodId).push(contextId);
    }

    return stream;
  }

  /**
   * @param {!shaka.extern.xml.Node} prftNode
   * @param {!shaka.dash.DashParser.StreamInfo} streamInfo
   * @param {!shaka.media.PresentationTimeline} presentationTimeline
   * @private
   */
  parseProducerReferenceTime_(prftNode, streamInfo, presentationTimeline) {
    const TXml = shaka.util.TXml;

    if (this.parsedPrftNodes_.has(prftNode)) {
      return;
    }

    this.parsedPrftNodes_.add(prftNode);
    const presentationTime = TXml.parseAttr(
        prftNode, 'presentationTime', TXml.parseNonNegativeInt) || 0;
    const utcTiming = TXml.findChild(prftNode, 'UTCTiming');
    let wallClockTime;
    const parseAsNtp = !utcTiming || !utcTiming.attributes['schemeIdUri'] ||
        shaka.dash.DashParser.isNtpScheme_(utcTiming.attributes['schemeIdUri']);
    if (parseAsNtp) {
      const ntpTimestamp = TXml.parseAttr(
          prftNode, 'wallClockTime', TXml.parseNonNegativeInt) || 0;
      wallClockTime = shaka.util.TimeUtils.convertNtp(ntpTimestamp);
    } else {
      wallClockTime = (TXml.parseAttr(
          prftNode, 'wallClockTime', TXml.parseDate) || 0) * 1000;
    }
    const programStartDate = new Date(wallClockTime -
      (presentationTime / streamInfo.timescale) * 1000);
    const programStartTime = programStartDate.getTime() / 1000;
    if (!isNaN(programStartTime)) {
      if (!presentationTimeline.isStartTimeLocked()) {
        presentationTimeline.setInitialProgramDateTime(programStartTime);
      }
      /** @type {shaka.extern.ProducerReferenceTime} */
      const prftInfo = {
        wallClockTime,
        programStartDate,
      };
      const eventName = shaka.util.FakeEvent.EventName.Prft;
      const data = (new Map()).set('detail', prftInfo);
      const event = new shaka.util.FakeEvent(eventName, data);
      this.playerInterface_.onEvent(event);
    }
  }

  /**
   * Clone context and remove xml document references.
   *
   * @param {!shaka.dash.DashParser.Context} context
   * @return {!shaka.dash.DashParser.Context}
   * @private
   */
  cloneContext_(context) {
    /**
     * @param {?shaka.dash.DashParser.InheritanceFrame} frame
     * @return {?shaka.dash.DashParser.InheritanceFrame}
     */
    const cloneFrame = (frame) => {
      if (!frame) {
        return null;
      }
      const clone = shaka.util.ObjectUtils.shallowCloneObject(frame);
      clone.segmentBase = null;
      clone.segmentList = null;
      clone.segmentTemplate = shaka.util.TXml.cloneNode(clone.segmentTemplate);
      clone.producerReferenceTime = null;
      return clone;
    };
    const contextClone = shaka.util.ObjectUtils.shallowCloneObject(context);
    contextClone.period = cloneFrame(contextClone.period);
    contextClone.adaptationSet = cloneFrame(contextClone.adaptationSet);
    contextClone.representation = cloneFrame(contextClone.representation);

    if (contextClone.periodInfo) {
      contextClone.periodInfo =
        shaka.util.ObjectUtils.shallowCloneObject(contextClone.periodInfo);
      contextClone.periodInfo.node = null;
    }

    return contextClone;
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
   * Update now the manifest
   *
   * @private
   */
  updateNow_() {
    this.updateTimer_.tickNow();
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
    if (this.updatePeriod_ < 0) {
      return;
    }
    let updateTime = this.updatePeriod_;
    if (this.config_.updatePeriod >= 0) {
      updateTime = this.config_.updatePeriod;
    }

    const finalDelay = Math.max(
        updateTime - offset,
        this.averageUpdateDuration_.getEstimate());

    // We do not run the timer as repeating because part of update is async and
    // we need schedule the update after it finished.
    this.updateTimer_.tickAfter(/* seconds= */ finalDelay);
  }

  /**
   * Creates a new inheritance frame for the given element.
   *
   * @param {!shaka.extern.xml.Node} elem
   * @param {?shaka.dash.DashParser.InheritanceFrame} parent
   * @param {?function(): !Array<string>} getBaseUris
   * @return {shaka.dash.DashParser.InheritanceFrame}
   * @private
   */
  createFrame_(elem, parent, getBaseUris) {
    goog.asserts.assert(parent || getBaseUris,
        'Must provide either parent or getBaseUris');
    const SegmentUtils = shaka.media.SegmentUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const TXml = shaka.util.TXml;
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
      segmentSequenceCadence: 1,
      encrypted: false,
    });
    getBaseUris = getBaseUris || parent.getBaseUris;

    const parseNumber = TXml.parseNonNegativeInt;
    const evalDivision = TXml.evalDivision;

    const id = elem.attributes['id'];
    const supplementalId = elem.attributes['supplementalId'];
    const uriObjs = TXml.findChildren(elem, 'BaseURL');
    let calculatedBaseUris;
    let someLocationValid = false;
    if (this.contentSteeringManager_) {
      for (const uriObj of uriObjs) {
        const serviceLocation = uriObj.attributes['serviceLocation'];
        const uri = TXml.getContents(uriObj);
        if (serviceLocation && uri) {
          this.contentSteeringManager_.addLocation(
              id, serviceLocation, uri);
          someLocationValid = true;
        }
      }
    }
    if (!someLocationValid || !this.contentSteeringManager_) {
      calculatedBaseUris = uriObjs.map(TXml.getContents);
    }

    // Here we are creating local variable to avoid direct references to `this`
    // in a callback function. By doing this we can ensure that garbage
    // collector can clean up `this` object when it is no longer needed.
    const contentSteeringManager = this.contentSteeringManager_;

    const getFrameUris = () => {
      if (!uriObjs.length) {
        return [];
      }
      if (contentSteeringManager && someLocationValid) {
        return contentSteeringManager.getLocations(id);
      }
      if (calculatedBaseUris) {
        return calculatedBaseUris;
      }
      return [];
    };

    let contentType = elem.attributes['contentType'] || parent.contentType;
    const mimeType = elem.attributes['mimeType'] || parent.mimeType;
    const allCodecs = [
      elem.attributes['codecs'] || parent.codecs,
    ];
    const codecs = SegmentUtils.codecsFiltering(allCodecs).join(',');
    const frameRate =
        TXml.parseAttr(elem, 'frameRate', evalDivision) || parent.frameRate;
    const pixelAspectRatio =
        elem.attributes['sar'] || parent.pixelAspectRatio;
    const emsgSchemeIdUris = this.emsgSchemeIdUris_(
        TXml.findChildren(elem, 'InbandEventStream'),
        parent.emsgSchemeIdUris);
    const audioChannelConfigs =
        TXml.findChildren(elem, 'AudioChannelConfiguration');
    const numChannels =
        this.parseAudioChannels_(audioChannelConfigs) || parent.numChannels;
    const audioSamplingRate =
        TXml.parseAttr(elem, 'audioSamplingRate', parseNumber) ||
        parent.audioSamplingRate;

    if (!contentType) {
      contentType = shaka.dash.DashParser.guessContentType_(mimeType, codecs);
    }

    const segmentBase = TXml.findChild(elem, 'SegmentBase');
    const segmentTemplate = TXml.findChild(elem, 'SegmentTemplate');

    // The availabilityTimeOffset is the sum of all @availabilityTimeOffset
    // values that apply to the adaptation set, via BaseURL, SegmentBase,
    // or SegmentTemplate elements.
    const segmentBaseAto = segmentBase ?
        (TXml.parseAttr(segmentBase, 'availabilityTimeOffset',
            TXml.parseFloat) || 0) : 0;
    const segmentTemplateAto = segmentTemplate ?
        (TXml.parseAttr(segmentTemplate, 'availabilityTimeOffset',
            TXml.parseFloat) || 0) : 0;
    const baseUriAto = uriObjs && uriObjs.length ?
        (TXml.parseAttr(uriObjs[0], 'availabilityTimeOffset',
            TXml.parseFloat) || 0) : 0;

    const availabilityTimeOffset = parent.availabilityTimeOffset + baseUriAto +
        segmentBaseAto + segmentTemplateAto;

    let segmentSequenceCadence = null;
    const segmentSequenceProperties =
        TXml.findChild(elem, 'SegmentSequenceProperties');
    if (segmentSequenceProperties) {
      const cadence = TXml.parseAttr(segmentSequenceProperties, 'cadence',
          TXml.parsePositiveInt);
      if (cadence) {
        segmentSequenceCadence = cadence;
      }
    }

    // This attribute is currently non-standard, but it is supported by Kaltura.
    let label = elem.attributes['label'];

    // See DASH IOP 4.3 here https://dashif.org/docs/DASH-IF-IOP-v4.3.pdf (page 35)
    const labelElements = TXml.findChildren(elem, 'Label');
    if (labelElements && labelElements.length) {
      // NOTE: Right now only one label field is supported.
      const firstLabelElement = labelElements[0];
      if (TXml.getTextContents(firstLabelElement)) {
        label = TXml.getTextContents(firstLabelElement);
      }
    }

    return {
      getBaseUris:
          () => ManifestParserUtils.resolveUris(getBaseUris(), getFrameUris()),
      segmentBase: segmentBase || parent.segmentBase,
      segmentList:
          TXml.findChild(elem, 'SegmentList') || parent.segmentList,
      segmentTemplate: segmentTemplate || parent.segmentTemplate,
      producerReferenceTime: TXml.findChild(elem, 'ProducerReferenceTime') ||
        parent.producerReferenceTime,
      width: TXml.parseAttr(elem, 'width', parseNumber) || parent.width,
      height: TXml.parseAttr(elem, 'height', parseNumber) || parent.height,
      contentType: contentType,
      mimeType: mimeType,
      codecs: codecs,
      frameRate: frameRate,
      pixelAspectRatio: pixelAspectRatio,
      emsgSchemeIdUris: emsgSchemeIdUris,
      id: supplementalId || id,
      originalId: id,
      language: elem.attributes['lang'],
      numChannels: numChannels,
      audioSamplingRate: audioSamplingRate,
      availabilityTimeOffset: availabilityTimeOffset,
      initialization: null,
      segmentSequenceCadence:
          segmentSequenceCadence || parent.segmentSequenceCadence,
      label: label || null,
      encrypted: false,
    };
  }

  /**
   * Returns a new array of InbandEventStream schemeIdUri containing the union
   * of the ones parsed from inBandEventStreams and the ones provided in
   * emsgSchemeIdUris.
   *
   * @param {!Array<!shaka.extern.xml.Node>} inBandEventStreams
   *     Array of InbandEventStream
   *     elements to parse and add to the returned array.
   * @param {!Array<string>} emsgSchemeIdUris Array of parsed
   *     InbandEventStream schemeIdUri attributes to add to the returned array.
   * @return {!Array<string>} schemeIdUris Array of parsed
   *     InbandEventStream schemeIdUri attributes.
   * @private
   */
  emsgSchemeIdUris_(inBandEventStreams, emsgSchemeIdUris) {
    const schemeIdUris = emsgSchemeIdUris.slice();
    for (const event of inBandEventStreams) {
      const schemeIdUri = event.attributes['schemeIdUri'];
      if (!schemeIdUris.includes(schemeIdUri)) {
        schemeIdUris.push(schemeIdUri);
      }
    }
    return schemeIdUris;
  }

  /**
   * @param {!Array<!shaka.extern.xml.Node>} audioChannelConfigs An array of
   *   AudioChannelConfiguration elements.
   * @return {?number} The number of audio channels, or null if unknown.
   * @private
   */
  parseAudioChannels_(audioChannelConfigs) {
    for (const elem of audioChannelConfigs) {
      const scheme = elem.attributes['schemeIdUri'];
      if (!scheme) {
        continue;
      }

      const value = elem.attributes['value'];
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

        case 'tag:dolby.com,2015:dash:audio_channel_configuration:2015': {
          // ETSI TS 103 190-2 v1.2.1, Annex G.3
          // LSB-to-MSB order
          const channelCountMapping =
            [2, 1, 2, 2, 2, 2, 1, 2, 2, 1, 1, 1, 1, 2, 1, 1, 2, 2];
          const hexValue = parseInt(value, 16);
          if (!hexValue) {  // 0 or NaN
            shaka.log.warning('Channel parsing failure! ' +
                          'Ignoring scheme and value', scheme, value);
            continue;
          }
          let numBits = 0;
          for (let i = 0; i < channelCountMapping.length; i++) {
            if (hexValue & (1<<i)) {
              numBits += channelCountMapping[i];
            }
          }
          if (numBits) {
            return numBits;
          }
          continue;
        }

        case 'tag:dolby.com,2014:dash:audio_channel_configuration:2011':
        case 'urn:dolby:dash:audio_channel_configuration:2011': {
          // Defined by https://ott.dolby.com/OnDelKits/DDP/Dolby_Digital_Plus_Online_Delivery_Kit_v1.5/Documentation/Content_Creation/SDM/help_files/topics/ddp_mpeg_dash_c_mpd_auchlconfig.html
          // keep list in order of the spec; reverse for LSB-to-MSB order
          const channelCountMapping =
            [1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 2, 1, 2, 1, 1].reverse();
          const hexValue = parseInt(value, 16);
          if (!hexValue) {  // 0 or NaN
            shaka.log.warning('Channel parsing failure! ' +
                          'Ignoring scheme and value', scheme, value);
            continue;
          }
          let numBits = 0;
          for (let i = 0; i < channelCountMapping.length; i++) {
            if (hexValue & (1<<i)) {
              numBits += channelCountMapping[i];
            }
          }
          if (numBits) {
            return numBits;
          }
          continue;
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
   * @param {function(): !Array<string>} getBaseUris
   * @param {string} uri
   * @param {string} method
   * @return {!Promise<number>}
   * @private
   */
  async requestForTiming_(getBaseUris, uri, method) {
    const uris = [shaka.util.StringUtils.htmlUnescape(uri)];
    const requestUris =
        shaka.util.ManifestParserUtils.resolveUris(getBaseUris(), uris);
    const request = shaka.net.NetworkingEngine.makeRequest(
        requestUris, this.config_.retryParameters);
    request.method = method;
    const type = shaka.net.NetworkingEngine.RequestType.TIMING;

    const operation =
    this.playerInterface_.networkingEngine.request(
        type, request, {isPreload: this.isPreloadFn_()});
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
   * @param {function(): !Array<string>} getBaseUris
   * @param {!Array<!shaka.extern.xml.Node>} elements
   * @return {!Promise<number>}
   * @private
   */
  async parseUtcTiming_(getBaseUris, elements) {
    const schemesAndValues = elements.map((elem) => {
      return {
        scheme: elem.attributes['schemeIdUri'],
        value: elem.attributes['value'],
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
   * @param {!shaka.extern.xml.Node} elem
   * @param {number} availabilityStart
   * @private
   */
  parseEventStream_(periodStart, periodDuration, elem, availabilityStart) {
    const TXml = shaka.util.TXml;
    const parseNumber = shaka.util.TXml.parseNonNegativeInt;

    const schemeIdUri = elem.attributes['schemeIdUri'] || '';
    const value = elem.attributes['value'] || '';
    const timescale = TXml.parseAttr(elem, 'timescale', parseNumber) || 1;
    const presentationTimeOffset =
      TXml.parseAttr(elem, 'presentationTimeOffset', parseNumber) || 0;

    for (const eventNode of TXml.findChildren(elem, 'Event')) {
      const presentationTime =
          TXml.parseAttr(eventNode, 'presentationTime', parseNumber) || 0;
      const duration =
          TXml.parseAttr(eventNode, 'duration', parseNumber) || 0;

      // Ensure start time won't be lower than period start.
      let startTime = Math.max(
          (presentationTime - presentationTimeOffset) / timescale + periodStart,
          periodStart);
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
        id: eventNode.attributes['id'] || '',
        timescale: timescale,
        eventElement: TXml.txmlNodeToDomElement(eventNode),
        eventNode: TXml.cloneNode(eventNode),
      };

      this.playerInterface_.onTimelineRegionAdded(region);
    }
  }

  /**
   * Makes a network request on behalf of SegmentBase.createStreamInfo.
   *
   * @param {!Array<string>} uris
   * @param {?number} startByte
   * @param {?number} endByte
   * @param {boolean} isInit
   * @return {!Promise<BufferSource>}
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
   * @return {!Promise<shaka.extern.Response>}
   * @private
   */
  makeNetworkRequest_(request, type, context) {
    if (!context) {
      context = {};
    }
    context.isPreload = this.isPreloadFn_();
    const op = this.playerInterface_.networkingEngine.request(
        type, request, context);
    this.operationManager_.manage(op);
    return op.promise;
  }

  /**
   * @param {!shaka.extern.xml.Node} patchNode
   * @private
   */
  updatePatchLocationNodes_(patchNode) {
    const TXml = shaka.util.TXml;
    TXml.modifyNodes(this.patchLocationNodes_, patchNode);
  }

  /**
   * @return {!Array<string>}
   * @private
   */
  getPatchLocationUris_() {
    const TXml = shaka.util.TXml;
    const mpdId = this.manifestPatchContext_.mpdId;
    const publishTime = this.manifestPatchContext_.publishTime;
    if (!mpdId || !publishTime || !this.patchLocationNodes_.length) {
      return [];
    }
    const now = Date.now() / 1000;
    const patchLocations = this.patchLocationNodes_.filter((patchLocation) => {
      const ttl = TXml.parseNonNegativeInt(patchLocation.attributes['ttl']);
      return !ttl || publishTime + ttl > now;
    })
        .map(TXml.getContents)
        .filter(shaka.util.Functional.isNotNull);

    if (!patchLocations.length) {
      return [];
    }
    return shaka.util.ManifestParserUtils.resolveUris(
        this.manifestUris_, patchLocations);
  }

  /**
   * @param {string} scheme
   * @return {boolean}
   * @private
   */
  static isNtpScheme_(scheme) {
    return scheme === 'urn:mpeg:dash:utc:http-ntp:2014' ||
        scheme === 'urn:mpeg:dash:utc:ntp:2014' ||
        scheme === 'urn:mpeg:dash:utc:sntp:2014';
  }
};

/**
 * @typedef {{
 *   mpdId: string,
 *   type: string,
 *   mediaPresentationDuration: ?number,
 *   profiles: !Array<string>,
 *   availabilityTimeOffset: number,
 *   getBaseUris: ?function():!Array<string>,
 *   publishTime: number,
 * }}
 *
 * @property {string} mpdId
 *   ID of the original MPD file.
 * @property {string} type
 *   Specifies the type of the dash manifest i.e. "static"
 * @property {?number} mediaPresentationDuration
 *   Media presentation duration, or null if unknown.
 * @property {!Array<string>} profiles
 *   Profiles of DASH are defined to enable interoperability and the
 *   signaling of the use of features.
 * @property {number} availabilityTimeOffset
 *   Specifies the total availabilityTimeOffset of the segment.
 * @property {?function():!Array<string>} getBaseUris
 *   An array of absolute base URIs.
 * @property {number} publishTime
 *   Time when manifest has been published, in seconds.
 */
shaka.dash.DashParser.PatchContext;


/**
 * @const {string}
 * @private
 */
shaka.dash.DashParser.SCTE214_ = 'urn:scte:dash:scte214-extensions';


/**
 * @const {string}
 * @private
 */
shaka.dash.DashParser.UP_NAMESPACE_ = 'urn:mpeg:dash:schema:urlparam:2014';


/**
 * @typedef {
 *   function(!Array<string>, ?number, ?number, boolean):
 *     !Promise<BufferSource>
 * }
 */
shaka.dash.DashParser.RequestSegmentCallback;


/**
 * @typedef {{
 *   segmentBase: ?shaka.extern.xml.Node,
 *   segmentList: ?shaka.extern.xml.Node,
 *   segmentTemplate: ?shaka.extern.xml.Node,
 *   producerReferenceTime: ?shaka.extern.xml.Node,
 *   getBaseUris: function():!Array<string>,
 *   width: (number|undefined),
 *   height: (number|undefined),
 *   contentType: string,
 *   mimeType: string,
 *   codecs: string,
 *   frameRate: (number|undefined),
 *   pixelAspectRatio: (string|undefined),
 *   emsgSchemeIdUris: !Array<string>,
 *   id: ?string,
 *   originalId: ?string,
 *   position: (number|undefined),
 *   language: ?string,
 *   numChannels: ?number,
 *   audioSamplingRate: ?number,
 *   availabilityTimeOffset: number,
 *   initialization: ?string,
 *   aesKey: (shaka.extern.aesKey|undefined),
 *   segmentSequenceCadence: number,
 *   label: ?string,
 *   encrypted: boolean,
 * }}
 *
 * @description
 * A collection of elements and properties which are inherited across levels
 * of a DASH manifest.
 *
 * @property {?shaka.extern.xml.Node} segmentBase
 *   The XML node for SegmentBase.
 * @property {?shaka.extern.xml.Node} segmentList
 *   The XML node for SegmentList.
 * @property {?shaka.extern.xml.Node} segmentTemplate
 *   The XML node for SegmentTemplate.
 * @property {?shaka.extern.xml.Node} producerReferenceTime
 *  The XML node for ProducerReferenceTime.
 * @property {function():!Array<string>} getBaseUris
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
 * @property {!Array<string>} emsgSchemeIdUris
 *   emsg registered schemeIdUris.
 * @property {?string} id
 *   The ID of the element.
 * @property {?string} originalId
 *   The original ID of the element.
 * @property {number|undefined} position
 *   Position of the element used for indexing in case of no id
 * @property {?string} language
 *   The original language of the element.
 * @property {?number} numChannels
 *   The number of audio channels, or null if unknown.
 * @property {?number} audioSamplingRate
 *   Specifies the maximum sampling rate of the content, or null if unknown.
 * @property {number} availabilityTimeOffset
 *   Specifies the total availabilityTimeOffset of the segment, or 0 if unknown.
 * @property {?string} initialization
 *   Specifies the file where the init segment is located, or null.
 * @property {(shaka.extern.aesKey|undefined)} aesKey
 *   AES-128 Content protection key
 * @property {number} segmentSequenceCadence
 *   Specifies the cadence of independent segments in Segment Sequence
 *   Representation.
 * @property {?string} label
 *   Label or null if unknown.
 * @property {boolean} encrypted
 *   Specifies is encrypted or not.
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
 *   mediaPresentationDuration: ?number,
 *   profiles: !Array<string>,
 *   roles: ?Array<string>,
 *   urlParams: function():string,
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
 * @property {!Array<string>} profiles
 *   Profiles of DASH are defined to enable interoperability and the signaling
 *   of the use of features.
 * @property {?number} mediaPresentationDuration
 *   Media presentation duration, or null if unknown.
 * @property {function():string} urlParams
 *   The query params for the segments.
 */
shaka.dash.DashParser.Context;


/**
 * @typedef {{
 *   start: number,
 *   duration: ?number,
 *   node: ?shaka.extern.xml.Node,
 *   isLastPeriod: boolean,
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
 * @property {?shaka.extern.xml.Node} node
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
 *   streams: !Array<shaka.extern.Stream>,
 *   drmInfos: !Array<shaka.extern.DrmInfo>,
 *   trickModeFor: ?string,
 *   representationIds: !Array<string>,
 *   dependencyStreamMap: !Map<string, shaka.extern.Stream>,
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
 * @property {!Array<shaka.extern.Stream>} streams
 *   The streams this AdaptationSet contains.
 * @property {!Array<shaka.extern.DrmInfo>} drmInfos
 *   The DRM info for the AdaptationSet.
 * @property {?string} trickModeFor
 *   If non-null, this AdaptationInfo represents trick mode tracks.  This
 *   property is the ID of the normal AdaptationSet these tracks should be
 *   associated with.
 * @property {!Array<string>} representationIds
 *   An array of the IDs of the Representations this AdaptationSet contains.
 * @property {!Map<string, string>} dependencyStreamMap
 *   A map of dependencyStream
 */
shaka.dash.DashParser.AdaptationInfo;


/**
 * @typedef {function(): !Promise<shaka.media.SegmentIndex>}
 * @description
 * An async function which generates and returns a SegmentIndex.
 */
shaka.dash.DashParser.GenerateSegmentIndexFunction;


/**
 * @typedef {{
 *   timeline: number,
 *   endTime: number,
 *   generateSegmentIndex: shaka.dash.DashParser.GenerateSegmentIndexFunction,
 *   timescale: number,
 * }}
 *
 * @description
 * Contains information about a Stream. This is passed from the createStreamInfo
 * methods.
 *
 * @property {number} timeline
 *    The continuity timeline, if it has one.
 * @property {number} endTime
 *    The current timeline's end time, if it has one.
 * @property {shaka.dash.DashParser.GenerateSegmentIndexFunction
 *           } generateSegmentIndex
 *   An async function to create the SegmentIndex for the stream.
 * @property {number} timescale
 *  The timescale of the stream.
 */
shaka.dash.DashParser.StreamInfo;


shaka.media.ManifestParser.registerParserByMime(
    'application/dash+xml', () => new shaka.dash.DashParser());
shaka.media.ManifestParser.registerParserByMime(
    'video/vnd.mpeg.dash.mpd', () => new shaka.dash.DashParser());
