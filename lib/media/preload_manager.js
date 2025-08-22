/*! @license
 * Shaka Player
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.PreloadManager');

goog.require('goog.asserts');
goog.require('shaka.drm.DrmEngine');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.log');
goog.require('shaka.media.ManifestFilterer');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.QualityObserver');
goog.require('shaka.media.RegionTimeline');
goog.require('shaka.media.SegmentPrefetch');
goog.require('shaka.media.StreamingEngine');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.ObjectUtils');
goog.require('shaka.util.PlayerConfiguration');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Stats');
goog.require('shaka.util.StreamUtils');

/**
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.media.PreloadManager = class extends shaka.util.FakeEventTarget {
  /**
   * @param {string} assetUri
   * @param {?string} mimeType
   * @param {?number|Date} startTime
   * @param {*} playerInterface
   */
  constructor(assetUri, mimeType, startTime, playerInterface) {
    super();

    // Making the playerInterface a * and casting it to the right type allows
    // for the PlayerInterface for this class to not be exported.
    // Unfortunately, the constructor is exported by default.
    const typedPlayerInterface =
    /** @type {!shaka.media.PreloadManager.PlayerInterface} */ (
        playerInterface);

    /** @private {string} */
    this.assetUri_ = assetUri;

    /** @private {?string} */
    this.mimeType_ = mimeType;

    /** @private {!shaka.net.NetworkingEngine} */
    this.networkingEngine_ = typedPlayerInterface.networkingEngine;

    /** @private {?number|Date} */
    this.startTime_ = startTime;

    /** @private {?shaka.extern.AdaptationSetCriteria} */
    this.currentAdaptationSetCriteria_ = null;

    /** @private {number} */
    this.startTimeOfDrm_ = 0;

    /** @private {function():!shaka.drm.DrmEngine} */
    this.createDrmEngine_ = typedPlayerInterface.createDrmEngine;

    /** @private {!shaka.media.ManifestFilterer} */
    this.manifestFilterer_ = typedPlayerInterface.manifestFilterer;

    /** @private {!shaka.extern.ManifestParser.PlayerInterface} */
    this.manifestPlayerInterface_ =
        typedPlayerInterface.manifestPlayerInterface;

    /** @private {!shaka.extern.PlayerConfiguration} */
    this.config_ = typedPlayerInterface.config;

    /** @private {?shaka.extern.Manifest} */
    this.manifest_ = null;

    /** @private {?shaka.extern.ManifestParser.Factory} */
    this.parserFactory_ = null;

    /** @private {?shaka.extern.ManifestParser} */
    this.parser_ = null;

    /** @private {boolean} */
    this.parserEntrusted_ = false;

    /**
     * @private {!shaka.media.RegionTimeline<
     *     shaka.extern.TimelineRegionInfo>}
     */
    this.regionTimeline_ = typedPlayerInterface.regionTimeline;

    /** @private {boolean} */
    this.regionTimelineEntrusted_ = false;

    /** @private {?shaka.drm.DrmEngine} */
    this.drmEngine_ = null;

    /** @private {boolean} */
    this.drmEngineEntrusted_ = false;

    /** @private {shaka.extern.AbrManager} */
    this.abrManager_ = null;

    /** @private {!Map<number, shaka.media.SegmentPrefetch>} */
    this.segmentPrefetchById_ = new Map();

    /** @private {boolean} */
    this.segmentPrefetchEntrusted_ = false;

    /** @private {?shaka.media.QualityObserver} */
    this.qualityObserver_ = typedPlayerInterface.qualityObserver;

    /** @private {!shaka.util.Stats} */
    this.stats_ = new shaka.util.Stats();

    /** @private {!shaka.util.PublicPromise} */
    this.manifestPromise_ = new shaka.util.PublicPromise();

    /** @private {!shaka.util.PublicPromise} */
    this.successPromise_ = new shaka.util.PublicPromise();

    /** @private {?shaka.util.FakeEventTarget} */
    this.eventHandoffTarget_ = null;

    /** @private {boolean} */
    this.destroyed_ = false;

    /** @private {boolean} */
    this.allowPrefetch_ = typedPlayerInterface.allowPrefetch;

    /** @private {?shaka.extern.Variant} */
    this.prefetchedVariant_ = null;

    /** @private {?shaka.extern.Stream} */
    this.prefetchedTextStream_ = null;

    /** @private {boolean} */
    this.hasBeenAttached_ = false;

    /** @private {?Array<function()>} */
    this.queuedOperations_ = [];

    /** @private {?Array<function()>} */
    this.latePhaseQueuedOperations_ = [];

    /** @private {boolean} */
    this.isPreload_ = true;
  }

  /**
   * Makes it so that net requests launched from this load will no longer be
   * marked as "isPreload"
   */
  markIsLoad() {
    this.isPreload_ = false;
  }

  /**
   * @param {boolean} latePhase
   * @param {function()} callback
   */
  addQueuedOperation(latePhase, callback) {
    const queue =
        latePhase ? this.latePhaseQueuedOperations_ : this.queuedOperations_;
    if (queue) {
      queue.push(callback);
    } else {
      callback();
    }
  }

  /** Calls all late phase queued operations, and stops queueing them. */
  stopQueuingLatePhaseQueuedOperations() {
    if (this.latePhaseQueuedOperations_) {
      for (const callback of this.latePhaseQueuedOperations_) {
        callback();
      }
    }
    this.latePhaseQueuedOperations_ = null;
  }

  /** @param {!shaka.util.FakeEventTarget} eventHandoffTarget */
  setEventHandoffTarget(eventHandoffTarget) {
    this.eventHandoffTarget_ = eventHandoffTarget;
    this.hasBeenAttached_ = true;
    // Also call all queued operations, and stop queuing them in the future.
    if (this.queuedOperations_) {
      for (const callback of this.queuedOperations_) {
        callback();
      }
    }
    this.queuedOperations_ = null;
  }

  /** @param {number} offset */
  setOffsetToStartTime(offset) {
    if (this.startTime_ && offset) {
      if (typeof this.startTime_ === 'number') {
        this.startTime_ += offset;
      } else {
        this.startTime_.setTime(this.startTime_.getTime() + offset * 1000);
      }
    }
  }

  /** @return {?number|Date} */
  getStartTime() {
    return this.startTime_;
  }

  /** @return {number} */
  getStartTimeOfDRM() {
    return this.startTimeOfDrm_;
  }

  /** @return {?string} */
  getMimeType() {
    return this.mimeType_;
  }

  /** @return {string} */
  getAssetUri() {
    return this.assetUri_;
  }

  /** @return {?shaka.extern.Manifest} */
  getManifest() {
    return this.manifest_;
  }

  /** @return {?shaka.extern.ManifestParser.Factory} */
  getParserFactory() {
    return this.parserFactory_;
  }

  /** @return {?shaka.extern.AdaptationSetCriteria} */
  getCurrentAdaptationSetCriteria() {
    return this.currentAdaptationSetCriteria_;
  }

  /**
   * Gets the parser, if it exists. Also marks that the parser should not be
   * stopped if this manager is destroyed.
   * @return {?shaka.extern.ManifestParser}
   */
  receiveParser() {
    this.parserEntrusted_ = true;
    return this.parser_;
  }

  /**
   * @return {?shaka.extern.ManifestParser}
   */
  getParser() {
    return this.parser_;
  }

  /**
   * Gets the region timeline, if it exists. Also marks that the timeline should
   * not be released if this manager is destroyed.
   * @return {?shaka.media.RegionTimeline<shaka.extern.TimelineRegionInfo>}
   */
  receiveRegionTimeline() {
    this.regionTimelineEntrusted_ = true;
    return this.regionTimeline_;
  }

  /**
   * @return {?shaka.media.RegionTimeline<shaka.extern.TimelineRegionInfo>}
   */
  getRegionTimeline() {
    return this.regionTimeline_;
  }

  /** @return {?shaka.media.QualityObserver} */
  getQualityObserver() {
    return this.qualityObserver_;
  }

  /** @return {!shaka.util.Stats} */
  getStats() {
    return this.stats_;
  }

  /** @return {!shaka.media.ManifestFilterer} */
  getManifestFilterer() {
    return this.manifestFilterer_;
  }

  /**
   * Gets the drm engine, if it exists. Also marks that the drm engine should
   * not be destroyed if this manager is destroyed.
   * @return {?shaka.drm.DrmEngine}
   */
  receiveDrmEngine() {
    this.drmEngineEntrusted_ = true;
    return this.drmEngine_;
  }

  /**
   * @return {?shaka.drm.DrmEngine}
   */
  getDrmEngine() {
    return this.drmEngine_;
  }

  /**
   * @param {shaka.extern.Variant} variant
   */
  setPrefetchVariant(variant) {
    this.prefetchedVariant_ = variant;
  }

  /**
   * @return {?shaka.extern.Variant}
   */
  getPrefetchedVariant() {
    return this.prefetchedVariant_;
  }

  /**
   * Gets the preloaded variant track if it exists.
   *
   * @return {?shaka.extern.Track}
   * @export
   */
  getPrefetchedVariantTrack() {
    if (!this.prefetchedVariant_) {
      return null;
    }
    return shaka.util.StreamUtils.variantToTrack(this.prefetchedVariant_);
  }

  /**
   * Gets the preloaded text track if it exists.
   *
   * @return {?shaka.extern.TextTrack}
   * @export
   */
  getPrefetchedTextTrack() {
    if (!this.prefetchedTextStream_) {
      return null;
    }
    return shaka.util.StreamUtils.textStreamToTrack(this.prefetchedTextStream_);
  }

  /**
   * Gets the SegmentPrefetch objects for the initial stream ids. Also marks
   * that those objects should not be aborted if this manager is destroyed.
   * @return {!Map<number, shaka.media.SegmentPrefetch>}
   */
  receiveSegmentPrefetchesById() {
    this.segmentPrefetchEntrusted_ = true;
    return this.segmentPrefetchById_;
  }

  /**
   * @param {?shaka.extern.AdaptationSetCriteria} adaptationSetCriteria
   */
  attachAdaptationSetCriteria(adaptationSetCriteria) {
    this.currentAdaptationSetCriteria_ = adaptationSetCriteria;
  }

  /**
   * @param {!shaka.extern.Manifest} manifest
   * @param {!shaka.extern.ManifestParser} parser
   * @param {!shaka.extern.ManifestParser.Factory} parserFactory
   */
  attachManifest(manifest, parser, parserFactory) {
    this.manifest_ = manifest;
    this.parser_ = parser;
    this.parserFactory_ = parserFactory;
  }

  /**
   * Starts the process of loading the asset.
   * Success or failure will be measured through waitForFinish()
   */
  start() {
    (async () => {
      // Force a context switch, to give the player a chance to hook up events
      // immediately if desired.
      await Promise.resolve();

      // Perform the preloading process.
      try {
        await this.parseManifestInner_();
        this.throwIfDestroyed_();

        if (!shaka.drm.DrmUtils.isMediaKeysPolyfilled('webkit')) {
          await this.initializeDrm();
          this.throwIfDestroyed_();
        }

        if (this.allowPrefetch_) {
          await this.prefetchInner_();
          this.throwIfDestroyed_();
        }

        // We don't need the drm keys to load completely for the initial variant
        // to be chosen, but we won't mark the load as a success until it has
        // been loaded. So wait for it here, not inside initializeDrmInner_.
        if (this.allowPrefetch_ && this.drmEngine_) {
          await this.drmEngine_.waitForActiveRequests();
          this.throwIfDestroyed_();
        }

        this.successPromise_.resolve();
      } catch (error) {
        // Ignore OPERATION_ABORTED and OBJECT_DESTROYED errors.
        if (!(error instanceof shaka.util.Error) ||
            (error.code != shaka.util.Error.Code.OPERATION_ABORTED &&
             error.code != shaka.util.Error.Code.OBJECT_DESTROYED)) {
          this.successPromise_.reject(error);
        }
      }
    })();
  }

  /**
   * @param {!Event} event
   * @return {boolean}
   * @override
   */
  dispatchEvent(event) {
    if (this.eventHandoffTarget_) {
      return this.eventHandoffTarget_.dispatchEvent(event);
    } else {
      return super.dispatchEvent(event);
    }
  }

  /**
   * @param {!shaka.util.Error} error
   */
  onError(error) {
    if (error.severity === shaka.util.Error.Severity.CRITICAL) {
      // Cancel the loading process.
      this.successPromise_.reject(error);
      this.destroy();
    }

    const eventName = shaka.util.FakeEvent.EventName.Error;
    const event = this.makeEvent_(eventName, (new Map()).set('detail', error));
    this.dispatchEvent(event);
    if (event.defaultPrevented) {
      error.handled = true;
    }
  }

  /**
   * Throw if destroyed, to interrupt processes with a recognizable error.
   *
   * @private
   */
  throwIfDestroyed_() {
    if (this.isDestroyed()) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OBJECT_DESTROYED);
    }
  }

  /**
   * Makes a fires an event corresponding to entering a state of the loading
   * process.
   * @param {string} nodeName
   * @private
   */
  makeStateChangeEvent_(nodeName) {
    this.dispatchEvent(new shaka.util.FakeEvent(
        /* name= */ shaka.util.FakeEvent.EventName.OnStateChange,
        /* data= */ (new Map()).set('state', nodeName)));
  }

  /**
   * @param {!shaka.util.FakeEvent.EventName} name
   * @param {Map<string, Object>=} data
   * @return {!shaka.util.FakeEvent}
   * @private
   */
  makeEvent_(name, data) {
    return new shaka.util.FakeEvent(name, data);
  }

  /**
   * Pick and initialize a manifest parser, then have it download and parse the
   * manifest.
   *
   * @return {!Promise}
   * @private
   */
  async parseManifestInner_() {
    this.makeStateChangeEvent_('manifest-parser');

    if (!this.parser_) {
      // Create the parser that we will use to parse the manifest.
      this.parserFactory_ = shaka.media.ManifestParser.getFactory(
          this.assetUri_, this.mimeType_);
      goog.asserts.assert(this.parserFactory_, 'Must have manifest parser');
      this.parser_ = this.parserFactory_();

      this.parser_.configure(this.config_.manifest, () => this.isPreload_);
    }

    const startTime = Date.now() / 1000;

    this.makeStateChangeEvent_('manifest');

    if (!this.manifest_) {
      this.manifest_ = await this.parser_.start(
          this.assetUri_, this.manifestPlayerInterface_);

      await this.chooseInitialVariant_();
    }

    this.manifestPromise_.resolve();

    // This event is fired after the manifest is parsed, but before any
    // filtering takes place.
    const event =
          this.makeEvent_(shaka.util.FakeEvent.EventName.ManifestParsed);
    // Delay event to ensure manifest has been properly propagated
    // to the player.
    await Promise.resolve();
    this.dispatchEvent(event);

    // We require all manifests to have at least one variant.
    if (this.manifest_.variants.length == 0) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.NO_VARIANTS);
    }

    // Make sure that all variants are either: audio-only, video-only, or
    // audio-video.
    shaka.media.PreloadManager.filterForAVVariants_(this.manifest_);

    const tracksChangedInitial = this.manifestFilterer_.applyRestrictions(
        this.manifest_);
    if (tracksChangedInitial) {
      const event = this.makeEvent_(
          shaka.util.FakeEvent.EventName.TracksChanged);
      await Promise.resolve();
      this.throwIfDestroyed_();
      this.dispatchEvent(event);
    }

    const now = Date.now() / 1000;
    const delta = now - startTime;
    this.stats_.setManifestTime(delta);
  }

  /**
   * Initializes the DRM engine.
   * @param {?HTMLMediaElement=} media
   * @return {!Promise}
   */
  async initializeDrm(media) {
    if (!this.manifest_ || this.drmEngine_) {
      return;
    }

    this.makeStateChangeEvent_('drm-engine');

    this.startTimeOfDrm_ = Date.now() / 1000;

    this.drmEngine_ = this.createDrmEngine_();
    this.manifestFilterer_.setDrmEngine(this.drmEngine_);

    this.drmEngine_.configure(this.config_.drm, () => this.isPreload_);

    const playableVariants = shaka.util.StreamUtils.getPlayableVariants(
        this.manifest_.variants);
    let isLive = true;
    if (this.manifest_ && this.manifest_.presentationTimeline) {
      isLive = this.manifest_.presentationTimeline.isLive();
    }
    await this.drmEngine_.initForPlayback(
        playableVariants,
        this.manifest_.offlineSessionIds,
        isLive);
    this.throwIfDestroyed_();
    if (media) {
      await this.drmEngine_.attach(media);
      this.throwIfDestroyed_();
    }

    // Now that we have drm information, filter the manifest (again) so that
    // we can ensure we only use variants with the selected key system.
    const tracksChangedAfter = await this.manifestFilterer_.filterManifest(
        this.manifest_);
    if (tracksChangedAfter) {
      const event = this.makeEvent_(
          shaka.util.FakeEvent.EventName.TracksChanged);
      await Promise.resolve();
      this.dispatchEvent(event);
    }
  }

  /** @param {!shaka.extern.PlayerConfiguration} config */
  reconfigure(config) {
    this.config_ = config;
  }

  /**
   * @param {string} name
   * @param {*=} value
   */
  configure(name, value) {
    const config = shaka.util.ConfigUtils.convertToConfigObject(name, value);
    shaka.util.PlayerConfiguration.mergeConfigObjects(this.config_, config);
  }

  /**
   * Return a copy of the current configuration.
   *
   * @return {shaka.extern.PlayerConfiguration}
   */
  getConfiguration() {
    return shaka.util.ObjectUtils.cloneObject(this.config_);
  }

  /**
   * Performs a filtering of the manifest, and chooses the initial
   * variant.
   *
   * @return {!Promise}
   * @private
   */
  async chooseInitialVariant_() {
    // This step does not have any associated events, as it is only part of the
    // "load" state in the old state graph.

    if (!this.currentAdaptationSetCriteria_) {
      // Copy preferred languages from the config again, in case the config was
      // changed between construction and playback.
      this.currentAdaptationSetCriteria_ =
          this.config_.adaptationSetCriteriaFactory();
      this.currentAdaptationSetCriteria_.configure({
        language: this.config_.preferredAudioLanguage,
        role: this.config_.preferredAudioRole,
        videoRole: this.config_.preferredVideoRole,
        channelCount: this.config_.preferredAudioChannelCount,
        hdrLevel: this.config_.preferredVideoHdrLevel,
        spatialAudio: this.config_.preferSpatialAudio,
        videoLayout: this.config_.preferredVideoLayout,
        audioLabel: this.config_.preferredAudioLabel,
        videoLabel: this.config_.preferredVideoLabel,
        codecSwitchingStrategy:
            this.config_.mediaSource.codecSwitchingStrategy,
        audioCodec: '',
        activeAudioCodec: '',
        activeAudioChannelCount: 0,
        preferredAudioCodecs: this.config_.preferredAudioCodecs,
        preferredAudioChannelCount: this.config_.preferredAudioChannelCount,
      });
    }

    if (this.shouldCreateSegmentIndexBeforeDrmEngineInitialization_()) {
      const variant = this.configureAbrManagerAndChooseVariant_();
      if (variant) {
        const createSegmentIndexPromises = [];
        for (const stream of [variant.video, variant.audio]) {
          if (stream && !stream.segmentIndex) {
            createSegmentIndexPromises.push(stream.createSegmentIndex());
          }
        }
        if (createSegmentIndexPromises.length > 0) {
          await Promise.all(createSegmentIndexPromises);
        }
      }
    }
  }

  /**
   * @return {boolean}
   * @private
   */
  shouldCreateSegmentIndexBeforeDrmEngineInitialization_() {
    goog.asserts.assert(
        this.manifest_, 'The manifest should already be parsed.');

    // If we only have one variant, it is useful to preload it, because it will
    // be the only one we can use.
    if (this.manifest_.variants.length == 1) {
      return true;
    }

    // In HLS, DRM information is usually included in the media playlist, so we
    // need to download the media playlist to get the real information.
    if (this.manifest_.type == shaka.media.ManifestParser.HLS) {
      return true;
    }

    return false;
  }

  /**
   * Prefetches segments.
   *
   * @return {!Promise}
   * @private
   */
  async prefetchInner_() {
    if (!this.prefetchedVariant_) {
      const variant = this.configureAbrManagerAndChooseVariant_();
      if (variant) {
        this.prefetchedVariant_ = variant;
      }
    }
    if (this.prefetchedVariant_) {
      const isLive = this.manifest_.presentationTimeline.isLive();
      const promises = [];
      const variant = this.prefetchedVariant_;
      if (variant.video) {
        promises.push(this.prefetchStream_(variant.video, isLive));
      }
      if (variant.audio) {
        promises.push(this.prefetchStream_(variant.audio, isLive));
      }
      const textStream = this.chooseTextStream_();
      if (textStream && shaka.util.StreamUtils.shouldInitiallyShowText(
          variant.audio, textStream, this.config_)) {
        promises.push(this.prefetchStream_(textStream, isLive));
        this.prefetchedTextStream_ = textStream;
      }

      await Promise.all(promises);
    }
  }

  /**
   * @return {shaka.extern.Variant}
   * @private
   */
  configureAbrManagerAndChooseVariant_() {
    goog.asserts.assert(this.currentAdaptationSetCriteria_,
        'Must have an AdaptationSetCriteria');

    if (!this.abrManager_) {
      // Make the ABR manager.
      const abrFactory = this.config_.abrFactory;
      this.abrManager_ = abrFactory();
      this.abrManager_.configure(this.config_.abr);
    }

    const playableVariants = shaka.util.StreamUtils.getPlayableVariants(
        this.manifest_.variants);
    const adaptationSet = this.currentAdaptationSetCriteria_.create(
        playableVariants);
    // Guess what the first variant will be, based on a SimpleAbrManager.
    this.abrManager_.setVariants(Array.from(adaptationSet.values()));

    return this.abrManager_.chooseVariant(/* preferFastSwitching= */ true);
  }

  /**
   * @return {?shaka.extern.Stream}
   * @private
   */
  chooseTextStream_() {
    const subset = shaka.util.StreamUtils.filterStreamsByLanguageAndRole(
        this.manifest_.textStreams,
        this.config_.preferredTextLanguage,
        this.config_.preferredTextRole,
        this.config_.preferForcedSubs);
    return subset[0] || null;
  }

  /**
   * @param {!shaka.extern.Stream} stream
   * @param {boolean} isLive
   * @return {!Promise}
   * @private
   */
  async prefetchStream_(stream, isLive) {
    // Use the prefetch limit from the config if this is set, otherwise use 2.
    const prefetchLimit = this.config_.streaming.segmentPrefetchLimit || 2;
    const prefetch = new shaka.media.SegmentPrefetch(
        prefetchLimit, stream, (reference, stream, streamDataCallback) => {
          return shaka.media.StreamingEngine.dispatchFetch(
              reference, stream, streamDataCallback || null,
              this.config_.streaming.retryParameters, this.networkingEngine_,
              this.isPreload_);
        }, /* reverse= */ false);
    this.segmentPrefetchById_.set(stream.id, prefetch);

    // Start prefetching a bit.
    if (!stream.segmentIndex) {
      await stream.createSegmentIndex();
    }
    // Ignore if start time is a Date, as we do not prefetch segments for live
    // anyway.
    const startTime = typeof this.startTime_ === 'number' ? this.startTime_ : 0;
    const prefetchSegmentIterator =
        stream.segmentIndex.getIteratorForTime(startTime);
    let prefetchSegment = null;
    if (prefetchSegmentIterator) {
      prefetchSegment = prefetchSegmentIterator.current();
      if (!prefetchSegment) {
        prefetchSegment = prefetchSegmentIterator.next().value;
      }
    }
    if (!prefetchSegment) {
      // If we can't get a segment at the desired spot, at least get a segment,
      // so we can get the init segment.
      prefetchSegment = stream.segmentIndex.earliestReference();
    }
    if (prefetchSegment) {
      if (isLive) {
        // Preload only the init segment for Live
        if (prefetchSegment.initSegmentReference) {
          await prefetch.prefetchInitSegment(
              prefetchSegment.initSegmentReference);
        }
      } else {
        // Preload a segment, too... either the first segment, or the segment
        // that corresponds with this.startTime_, as appropriate.
        // Note: this method also preload the init segment
        await prefetch.prefetchSegmentsByTime(prefetchSegment.startTime);
      }
    }
  }

  /**
   * Waits for the loading to be finished (or to fail with an error).
   * @return {!Promise}
   * @export
   */
  waitForFinish() {
    return this.successPromise_;
  }

  /**
   * Waits for the manifest to be loaded (or to fail with an error).
   * @return {!Promise}
   */
  waitForManifest() {
    const promises = [
      this.manifestPromise_,
      this.successPromise_,
    ];
    return Promise.race(promises);
  }

  /**
   * Releases or stops all non-entrusted resources.
   *
   * @override
   * @export
   */
  async destroy() {
    this.destroyed_ = true;
    if (this.parser_ && !this.parserEntrusted_) {
      await this.parser_.stop();
    }
    if (this.abrManager_) {
      this.abrManager_.release();
    }
    if (this.regionTimeline_ && !this.regionTimelineEntrusted_) {
      this.regionTimeline_.release();
    }
    if (this.drmEngine_ && !this.drmEngineEntrusted_) {
      await this.drmEngine_.destroy();
    }
    if (this.segmentPrefetchById_.size > 0 && !this.segmentPrefetchEntrusted_) {
      for (const segmentPrefetch of this.segmentPrefetchById_.values()) {
        segmentPrefetch.clearAll();
      }
    }
    // this.eventHandoffTarget_ is not unset, so that events and errors fired
    // after the preload manager is destroyed will still be routed to the
    // player, if it was once linked up.
  }

  /** @return {boolean} */
  isDestroyed() {
    return this.destroyed_;
  }

  /** @return {boolean} */
  hasBeenAttached() {
    return this.hasBeenAttached_;
  }

  /**
   * Take a series of variants and ensure that they only contain one type of
   * variant. The different options are:
   *  1. Audio-Video
   *  2. Audio-Only
   *  3. Video-Only
   *
   * A manifest can only contain a single type because once we initialize media
   * source to expect specific streams, it must always have content for those
   * streams. If we were to start with audio+video and switch to an audio-only
   * variant, media source would block waiting for video content.
   *
   * @param {shaka.extern.Manifest} manifest
   * @private
   */
  static filterForAVVariants_(manifest) {
    const isAVVariant = (variant) => {
      // Audio-video variants may include both streams separately or may be
      // single multiplexed streams with multiple codecs.
      return (variant.video && variant.audio) ||
             (variant.video && variant.video.codecs.includes(','));
    };
    if (manifest.variants.some(isAVVariant)) {
      shaka.log.debug('Found variant with audio and video content, ' +
          'so filtering out audio-only content.');
      manifest.variants = manifest.variants.filter(isAVVariant);
    }
  }
};

/**
 * @typedef {{
 *   config: !shaka.extern.PlayerConfiguration,
 *   manifestPlayerInterface: !shaka.extern.ManifestParser.PlayerInterface,
 *   regionTimeline: !shaka.media.RegionTimeline<
 *       shaka.extern.TimelineRegionInfo>,
 *   qualityObserver: ?shaka.media.QualityObserver,
 *   createDrmEngine: function():!shaka.drm.DrmEngine,
 *   networkingEngine: !shaka.net.NetworkingEngine,
 *   manifestFilterer: !shaka.media.ManifestFilterer,
 *   allowPrefetch: boolean,
 * }}
 *
 * @property {!shaka.extern.PlayerConfiguration} config
 * @property {!shaka.extern.ManifestParser.PlayerInterface
 *           } manifestPlayerInterface
 * @property {!shaka.media.RegionTimeline<shaka.extern.TimelineRegionInfo>
 *           } regionTimeline
 * @property {?shaka.media.QualityObserver} qualityObserver
 * @property {function():!shaka.drm.DrmEngine} createDrmEngine
 * @property {!shaka.net.NetworkingEngine} networkingEngine
 * @property {!shaka.media.ManifestFilterer} manifestFilterer
 * @property {boolean} allowPrefetch
 */
shaka.media.PreloadManager.PlayerInterface;
