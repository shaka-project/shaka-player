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

/**
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.media.PreloadManager = class {
  /**
   * @param {string} assetUri
   * @param {?string} mimeType
   * @param {number} startTimeOfLoad
   * @param {*} playerInterface
   */
  constructor(assetUri, mimeType, startTimeOfLoad, playerInterface) {
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

    /** @private {?shaka.media.AdaptationSetCriteria} */
    this.currentAdaptationSetCriteria_ = null;

    /** @private {number} */
    this.startTimeOfLoad_ = startTimeOfLoad;

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

    /** @private {!Map.<number, shaka.media.SegmentPrefetch>} */
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
    this.drmPromise_ = new shaka.util.PublicPromise();

    /** @private {!shaka.util.PublicPromise} */
    this.chooseInitialVariantPromise_ = new shaka.util.PublicPromise();
  }

  /** @return {number} */
  getStartTimeOfLoad() {
    return this.startTimeOfLoad_;
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
   * Gets the region timeline, if it exists. Also marks that the timeline should
   * not be released if this manager is destroyed.
   * @return {?shaka.media.RegionTimeline}
   */
  receiveRegionTimeline() {
    this.regionTimelineEntrusted_ = true;
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
   * Gets the SegmentPrefetch objects for the initial stream ids. Also marks
   * that those objects should not be aborted if this manager is destroyed.
   * @return {!Map.<number, shaka.media.SegmentPrefetch>}
   */
  receiveSegmentPrefetchesById() {
    this.segmentPrefetchEntrusted_ = true;
    return this.segmentPrefetchById_;
  }

  /** @return {!Promise} */
  waitForManifest() {
    return this.manifestPromise_;
  }

  /** @return {!Promise} */
  waitForDrm() {
    return this.drmPromise_;
  }

  /** @return {!Promise} */
  waitForChooseInitialVariant() {
    return this.chooseInitialVariantPromise_;
  }

  /**
   * @param {!shaka.extern.Manifest} manifest
   * @param {!shaka.extern.ManifestParser} parser
   */
  attachManifest(manifest, parser) {
    this.manifest_ = manifest;
    this.parser_ = parser;
  }

  /**
   * Starts the process of loading the asset.
   * @return {!Promise}
   */
  async start() {
    // Force a context switch, to give the player a chance to hook up events
    // immediately if desired.
    await Promise.resolve();

    // Perform the preloading process.
    await this.parseManifestInner_();
    this.manifestPromise_.resolve();
    await this.initializeDrmInner_();
    this.drmPromise_.resolve();
    await this.chooseInitialVariantInner_();
    this.chooseInitialVariantPromise_.resolve();
  }

  /**
   * Pick and initialize a manifest parser, then have it download and parse the
   * manifest.
   *
   * @return {!Promise}
   * @private
   */
  async parseManifestInner_() {
    // TODO: Add event-handoff system.

    // this.makeStateChangeEvent_('manifest-parser');

    if (!this.parser_) {
      // Create the parser that we will use to parse the manifest.
      this.parserFactory_ = shaka.media.ManifestParser.getFactory(
          this.assetUri_, this.mimeType_);
      goog.asserts.assert(this.parserFactory_, 'Must have manifest parser');
      this.parser_ = this.parserFactory_();

      this.parser_.configure(this.config_.manifest);
    }

    const startTime = Date.now() / 1000;

    // this.makeStateChangeEvent_('manifest');

    if (!this.manifest_) {
      this.manifest_ = await this.parser_.start(
          this.assetUri_, this.manifestPlayerInterface_);
    }

    // This event is fired after the manifest is parsed, but before any
    // filtering takes place.
    // const event =
    //       this.makeEvent_(shaka.util.FakeEvent.EventName.ManifestParsed);
    // this.dispatchEvent(event);

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
    // this.makeStateChangeEvent_('drm-engine');

    // TODO: Make a DRM start time variable so this can hook into the player
    // interface for DRM engine.
    // const startTime = Date.now() / 1000;

    this.drmEngine_ = this.createDrmEngine_();
    this.manifestFilterer_.setDrmEngine(this.drmEngine_);

    this.drmEngine_.configure(this.config_.drm);

    await this.drmEngine_.initForPlayback(
        this.manifest_.variants,
        this.manifest_.offlineSessionIds);

    // Now that we have drm information, filter the manifest (again) so that
    // we can ensure we only use variants with the selected key system.
    // const tracksChanged =
    await this.manifestFilterer_.filterManifest(this.manifest_);
    // if (tracksChanged) {
    // TODO: Fire a "shaka.util.FakeEvent.EventName.TracksChanged" event.
    // }
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

    // TODO: Add a method to re-configure the preload manager once it has hooked
    // up to a load object?

    // Copy preferred languages from the config again, in case the config was
    // changed between construction and playback.
    this.currentAdaptationSetCriteria_ =
        new shaka.media.PreferenceBasedCriteria(
            this.config_.preferredAudioLanguage,
            this.config_.preferredVariantRole,
            this.config_.preferredAudioChannelCount,
            this.config_.preferredVideoHdrLevel,
            this.config_.preferredVideoLayout,
            this.config_.preferredAudioLabel,
            this.config_.mediaSource.codecSwitchingStrategy,
            this.config_.manifest.dash.enableAudioGroups);

    // If the content is multi-codec and the browser can play more than one of
    // them, choose codecs now before we initialize streaming.
    shaka.util.StreamUtils.chooseCodecsAndFilterManifest(
        this.manifest_,
        this.config_.preferredVideoCodecs,
        this.config_.preferredAudioCodecs,
        this.config_.preferredDecodingAttributes);

    // Prefetch segments for the predicted first variant.
    // We start these here, but don't wait for them; it's okay to start the
    // full load process while the segments are being prefetched.
    const playableVariants = shaka.util.StreamUtils.getPlayableVariants(
        this.manifest_.variants);
    const adaptationSet = this.currentAdaptationSetCriteria_.create(
        playableVariants);
    for (const variant of adaptationSet.values()) {
      // TODO: Only prefetch the variant we will be starting with.
      for (const stream of [variant.video, variant.audio]) {
        this.makePrefetchForStream_(stream);
      }
    }
  }

  /**
   * @param {!shaka.extern.Stream} stream
   * @return {!Promise}
   * @private
   */
  async makePrefetchForStream_(stream) {
    const prefetchLimit = 1; // TODO: 0 for live?
    const prefetch = new shaka.media.SegmentPrefetch(
        prefetchLimit, stream, (reference, stream, streamDataCallback) => {
          return shaka.media.StreamingEngine.dispatchFetch(
              reference, stream, streamDataCallback || null,
              this.config_.streaming.retryParameters, this.networkingEngine_);
        });
    this.segmentPrefetchById_.set(stream.id, prefetch);

    // Start prefetching a bit.
    await stream.createSegmentIndex();
    const firstSegment = stream.segmentIndex.earliestReference();
    if (firstSegment) {
      // Preload the init segment.
      if (firstSegment.initSegmentReference) {
        prefetch.prefetchInitSegment(firstSegment.initSegmentReference);
      }
      // Preload the first segment, too.
      prefetch.prefetchSegments(firstSegment);
    }
  }

  /**
   * Releases or stops all non-enstrusted resources.
   *
   * @override
   * @export
   */
  async destroy() {
    if (this.parser_ && !this.parserEntrusted_) {
      await this.parser_.stop();
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
 *   manifestFilterer: !shaka.media.ManifestFilterer
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
 */
shaka.media.PreloadManager.PlayerInterface;
