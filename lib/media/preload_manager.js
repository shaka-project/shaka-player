/*! @license
 * Shaka Player
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.PreloadManager');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.media.ManifestFilterer');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.media.PreferenceBasedCriteria');
goog.require('shaka.util.Stats');
goog.require('shaka.media.SegmentPrefetch');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.media.AdaptationSetCriteria');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.RegionTimeline');
goog.require('shaka.media.QualityObserver');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.media.StreamingEngine');
goog.require('shaka.media.SegmentPrefetch');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.ObjectUtils');
goog.require('shaka.util.PlayerConfiguration');

/**
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.media.PreloadManager = class extends shaka.util.FakeEventTarget {
  /**
   * @param {string} assetUri
   * @param {?string} mimeType
   * @param {?number} startTime
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

    /** @private {?number} */
    this.startTime_ = startTime;

    /** @private {?shaka.media.AdaptationSetCriteria} */
    this.currentAdaptationSetCriteria_ = null;

    /** @private {number} */
    this.startTimeOfDrm_ = 0;

    /** @private {function():!shaka.media.DrmEngine} */
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

    /** @private {!shaka.media.RegionTimeline} */
    this.regionTimeline_ = typedPlayerInterface.regionTimeline;

    /** @private {boolean} */
    this.regionTimelineEntrusted_ = false;

    /** @private {?shaka.media.DrmEngine} */
    this.drmEngine_ = null;

    /** @private {boolean} */
    this.drmEngineEntrusted_ = false;

    /** @private {?shaka.extern.AbrManager.Factory} */
    this.abrManagerFactory_ = null;

    /** @private {shaka.extern.AbrManager} */
    this.abrManager_ = null;

    /** @private {boolean} */
    this.abrManagerEntrusted_ = false;

    /** @private {!Map.<number, shaka.media.SegmentPrefetch>} */
    this.segmentPrefetchById_ = new Map();

    /** @private {boolean} */
    this.segmentPrefetchEntrusted_ = false;

    /** @private {?shaka.media.QualityObserver} */
    this.qualityObserver_ = typedPlayerInterface.qualityObserver;

    /** @private {!shaka.util.Stats} */
    this.stats_ = new shaka.util.Stats();

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

    /** @private {boolean} */
    this.allowMakeAbrManager_ = typedPlayerInterface.allowMakeAbrManager;

    /** @private {boolean} */
    this.hasBeenAttached_ = false;

    /** @private {?Array.<function()>} */
    this.queuedOperations_ = [];

    /** @private {?Array.<function()>} */
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
      this.startTime_ += offset;
    }
  }

  /** @return {?number} */
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

  /** @return {?shaka.media.AdaptationSetCriteria} */
  getCurrentAdaptationSetCriteria() {
    return this.currentAdaptationSetCriteria_;
  }

  /** @return {?shaka.extern.AbrManager.Factory} */
  getAbrManagerFactory() {
    return this.abrManagerFactory_;
  }

  /**
   * Gets the abr manager, if it exists. Also marks that the abr manager should
   * not be stopped if this manager is destroyed.
   * @return {?shaka.extern.AbrManager}
   */
  receiveAbrManager() {
    this.abrManagerEntrusted_ = true;
    return this.abrManager_;
  }

  /**
   * @return {?shaka.extern.AbrManager}
   */
  getAbrManager() {
    return this.abrManager_;
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
   * @return {?shaka.media.RegionTimeline}
   */
  receiveRegionTimeline() {
    this.regionTimelineEntrusted_ = true;
    return this.regionTimeline_;
  }

  /**
   * @return {?shaka.media.RegionTimeline}
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
   * @return {?shaka.media.DrmEngine}
   */
  receiveDrmEngine() {
    this.drmEngineEntrusted_ = true;
    return this.drmEngine_;
  }

  /**
   * @return {?shaka.media.DrmEngine}
   */
  getDrmEngine() {
    return this.drmEngine_;
  }

  /**
   * @return {?shaka.extern.Variant}
   */
  getPrefetchedVariant() {
    return this.prefetchedVariant_;
  }

  /**
   * Gets the SegmentPrefetch objects for the initial stream ids. Also marks
   * that those objects should not be aborted if this manager is destroyed.
   * @return {!Map.<number, shaka.media.SegmentPrefetch>}
   */
  receiveSegmentPrefetchesById() {
    this.segmentPrefetchEntrusted_ = true;
    return this.segmentPrefetchById_;
  }

  /**
   * @param {?shaka.extern.AbrManager} abrManager
   * @param {?shaka.extern.AbrManager.Factory} abrFactory
   */
  attachAbrManager(abrManager, abrFactory) {
    this.abrManager_ = abrManager;
    this.abrManagerFactory_ = abrFactory;
  }

  /**
   * @param {?shaka.media.AdaptationSetCriteria} adaptationSetCriteria
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

        await this.initializeDrmInner_();
        this.throwIfDestroyed_();

        await this.chooseInitialVariantInner_();
        this.throwIfDestroyed_();

        this.successPromise_.resolve();
      } catch (error) {
        this.successPromise_.reject(error);
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
   * @param {Map.<string, Object>=} data
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
    }

    // This event is fired after the manifest is parsed, but before any
    // filtering takes place.
    const event =
          this.makeEvent_(shaka.util.FakeEvent.EventName.ManifestParsed);
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

    const now = Date.now() / 1000;
    const delta = now - startTime;
    this.stats_.setManifestTime(delta);
  }

  /**
   * Initializes the DRM engine.
   *
   * @return {!Promise}
   * @private
   */
  async initializeDrmInner_() {
    goog.asserts.assert(
        this.manifest_, 'The manifest should already be parsed.');

    this.makeStateChangeEvent_('drm-engine');

    this.startTimeOfDrm_ = Date.now() / 1000;

    this.drmEngine_ = this.createDrmEngine_();
    this.manifestFilterer_.setDrmEngine(this.drmEngine_);

    this.drmEngine_.configure(this.config_.drm, () => this.isPreload_);

    const tracksChangedInitial = this.manifestFilterer_.applyRestrictions(
        this.manifest_);
    if (tracksChangedInitial) {
      const event = this.makeEvent_(
          shaka.util.FakeEvent.EventName.TracksChanged);
      await Promise.resolve();
      this.throwIfDestroyed_();
      this.dispatchEvent(event);
    }

    const playableVariants = shaka.util.StreamUtils.getPlayableVariants(
        this.manifest_.variants);
    await this.drmEngine_.initForPlayback(
        playableVariants,
        this.manifest_.offlineSessionIds);
    this.throwIfDestroyed_();

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
   * Performs a final filtering of the manifest, and chooses the initial
   * variant.
   *
   * @private
   */
  chooseInitialVariantInner_() {
    goog.asserts.assert(
        this.manifest_, 'The manifest should already be parsed.');

    // This step does not have any associated events, as it is only part of the
    // "load" state in the old state graph.

    if (!this.currentAdaptationSetCriteria_) {
      // Copy preferred languages from the config again, in case the config was
      // changed between construction and playback.
      this.currentAdaptationSetCriteria_ =
          new shaka.media.PreferenceBasedCriteria(
              this.config_.preferredAudioLanguage,
              this.config_.preferredVariantRole,
              this.config_.preferredAudioChannelCount,
              this.config_.preferredVideoHdrLevel,
              this.config_.preferSpatialAudio,
              this.config_.preferredVideoLayout,
              this.config_.preferredAudioLabel,
              this.config_.preferredVideoLabel,
              this.config_.mediaSource.codecSwitchingStrategy,
              this.config_.manifest.dash.enableAudioGroups);
    }

    // Make the ABR manager.
    if (this.allowMakeAbrManager_) {
      const abrFactory = this.config_.abrFactory;
      this.abrManagerFactory_ = abrFactory;
      this.abrManager_ = abrFactory();
      this.abrManager_.configure(this.config_.abr);
    }

    if (this.allowPrefetch_) {
      const isLive = this.manifest_.presentationTimeline.isLive();
      // Prefetch segments for the predicted first variant.
      // We start these here, but don't wait for them; it's okay to start the
      // full load process while the segments are being prefetched.
      const playableVariants = shaka.util.StreamUtils.getPlayableVariants(
          this.manifest_.variants);
      const adaptationSet = this.currentAdaptationSetCriteria_.create(
          playableVariants);
      // Guess what the first variant will be, based on a SimpleAbrManager.
      this.abrManager_.configure(this.config_.abr);
      this.abrManager_.setVariants(Array.from(adaptationSet.values()));
      const variant = this.abrManager_.chooseVariant();
      if (variant) {
        this.prefetchedVariant_ = variant;
        if (variant.video) {
          this.makePrefetchForStream_(variant.video, isLive);
        }
        if (variant.audio) {
          this.makePrefetchForStream_(variant.audio, isLive);
        }
      }
    }
  }

  /**
   * @param {!shaka.extern.Stream} stream
   * @param {boolean} isLive
   * @return {!Promise}
   * @private
   */
  async makePrefetchForStream_(stream, isLive) {
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
    await stream.createSegmentIndex();
    const startTime = this.startTime_ || 0;
    const prefetchSegmentIterator =
        stream.segmentIndex.getIteratorForTime(startTime);
    let prefetchSegment =
        prefetchSegmentIterator ? prefetchSegmentIterator.current() : null;
    if (!prefetchSegment) {
      // If we can't get a segment at the desired spot, at least get a segment,
      // so we can get the init segment.
      prefetchSegment = stream.segmentIndex.earliestReference();
    }
    if (prefetchSegment) {
      if (isLive) {
        // Preload only the init segment for Live
        if (prefetchSegment.initSegmentReference) {
          prefetch.prefetchInitSegment(prefetchSegment.initSegmentReference);
        }
      } else {
        // Preload a segment, too... either the first segment, or the segment
        // that corresponds with this.startTime_, as appropriate.
        // Note: this method also preload the init segment
        prefetch.prefetchSegmentsByTime(prefetchSegment.startTime);
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
    if (this.abrManager_ && !this.abrManagerEntrusted_) {
      await this.abrManager_.stop();
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
 *   regionTimeline: !shaka.media.RegionTimeline,
 *   qualityObserver: ?shaka.media.QualityObserver,
 *   createDrmEngine: function():!shaka.media.DrmEngine,
 *   networkingEngine: !shaka.net.NetworkingEngine,
 *   manifestFilterer: !shaka.media.ManifestFilterer,
 *   allowPrefetch: boolean,
 *   allowMakeAbrManager: boolean
 * }}
 *
 * @property {!shaka.extern.PlayerConfiguration} config
 * @property {!shaka.extern.ManifestParser.PlayerInterface}
 *   manifestPlayerInterface
 * @property {!shaka.media.RegionTimeline} regionTimeline
 * @property {?shaka.media.QualityObserver} qualityObserver
 * @property {function():!shaka.media.DrmEngine} createDrmEngine
 * @property {!shaka.net.NetworkingEngine} networkingEngine
 * @property {!shaka.media.ManifestFilterer} manifestFilterer
 * @property {boolean} allowPrefetch
 * @property {boolean} allowMakeAbrManager
 */
shaka.media.PreloadManager.PlayerInterface;
