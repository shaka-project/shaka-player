/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.Player');

goog.require('goog.asserts');
goog.require('shaka.abr.SimpleAbrManager');
goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.media.Playhead');
goog.require('shaka.media.PlayheadObserver');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.StreamingEngine');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.text.SimpleTextDisplayer');
goog.require('shaka.util.CancelableChain');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StreamUtils');



/**
 * Construct a Player.
 *
 * @param {!HTMLMediaElement} video Any existing TextTracks attached to this
 *   element that were not created by Shaka will be disabled.  A new TextTrack
 *   may be created to display captions or subtitles.
 * @param {function(shaka.Player)=} opt_dependencyInjector Optional callback
 *   which is called to inject mocks into the Player. Used for testing.
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.Player = function(video, opt_dependencyInjector) {
  shaka.util.FakeEventTarget.call(this);

  /** @private {boolean} */
  this.destroyed_ = false;

  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /**
   * Only holds the visibility setting until a textDisplayer_ is created.
   * @private {boolean}
   */
  this.textVisibility_ = false;

  /** @private {shakaExtern.TextDisplayer} */
  this.textDisplayer_ = null;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {shaka.net.NetworkingEngine} */
  this.networkingEngine_ = null;

  /** @private {shaka.media.DrmEngine} */
  this.drmEngine_ = null;

  /** @private {MediaSource} */
  this.mediaSource_ = null;

  /** @private {shaka.media.MediaSourceEngine} */
  this.mediaSourceEngine_ = null;

  /** @private {Promise} */
  this.mediaSourceOpen_ = null;

  /** @private {shaka.media.Playhead} */
  this.playhead_ = null;

  /** @private {shaka.media.PlayheadObserver} */
  this.playheadObserver_ = null;

  /** @private {shaka.media.StreamingEngine} */
  this.streamingEngine_ = null;

  /** @private {shakaExtern.ManifestParser} */
  this.parser_ = null;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = null;

  /** @private {?string} */
  this.manifestUri_ = null;

  /** @private {shakaExtern.AbrManager} */
  this.abrManager_ = null;

  /**
   * Contains an ID for use with creating streams.  The manifest parser should
   * start with small IDs, so this starts with a large one.
   * @private {number}
   */
  this.nextExternalStreamId_ = 1e9;

  /** @private {!Array.<number>} */
  this.loadingTextStreamIds_ = [];

  /** @private {boolean} */
  this.buffering_ = false;

  /** @private {boolean} */
  this.switchingPeriods_ = true;

  /** @private {shaka.util.CancelableChain} */
  this.loadChain_ = null;

  /** @private {Promise} */
  this.unloadChain_ = null;

  /** @private {?shakaExtern.Variant} */
  this.deferredVariant_ = null;

  /** @private {boolean} */
  this.deferredVariantClearBuffer_ = false;

  /** @private {?shakaExtern.Stream} */
  this.deferredTextStream_ = null;

  /** @private {!Array.<shakaExtern.TimelineRegionInfo>} */
  this.pendingTimelineRegions_ = [];

  /**
   * A map of Period number to a map of content type to stream id.
   * @private {!Object.<number, !Object.<string, number>>}
   */
  this.activeStreamsByPeriod_ = {};

  /** @private {?shakaExtern.PlayerConfiguration} */
  this.config_ = this.defaultConfig_();

  /** @private {{width: number, height: number}} */
  this.maxHwRes_ = { width: Infinity, height: Infinity };

  /** @private {shakaExtern.Stats} */
  this.stats_ = this.getCleanStats_();

  /** @private {number} */
  this.lastTimeStatsUpdateTimestamp_ = 0;

  /** @private {string} */
  this.currentAudioLanguage_ = this.config_.preferredAudioLanguage;

  /** @private {string} */
  this.currentTextLanguage_ = this.config_.preferredTextLanguage;

  /** @private {string} */
  this.currentVariantRole_ = '';

  /** @private {string} */
  this.currentTextRole_ = '';

  /**
   * Deprecated.  To be removed in v2.3.
   * @private {boolean}
   */
  this.infiniteRetriesForLiveStreams_ = true;

  if (opt_dependencyInjector)
    opt_dependencyInjector(this);

  this.networkingEngine_ = this.createNetworkingEngine();
  this.initialize_();
};
goog.inherits(shaka.Player, shaka.util.FakeEventTarget);


/**
 * After destruction, a Player object cannot be used again.
 *
 * @override
 * @export
 */
shaka.Player.prototype.destroy = function() {
  this.destroyed_ = true;

  var cancelation = Promise.resolve();
  if (this.loadChain_) {
    // A load is in progress.  Cancel it.
    cancelation = this.loadChain_.cancel(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.PLAYER,
        shaka.util.Error.Code.LOAD_INTERRUPTED));
  }

  return cancelation.then(function() {
    var p = Promise.all([
      // We need to destroy the current fields as well as waiting for an
      // existing unload to complete.  It is fine to call destroyStreaming_ if
      // there is an unload since it resets the fields immediately.
      this.unloadChain_,
      this.destroyStreaming_(),
      this.eventManager_ ? this.eventManager_.destroy() : null,
      this.networkingEngine_ ? this.networkingEngine_.destroy() : null
    ]);

    this.video_ = null;
    this.textVisibility_ = false;
    this.eventManager_ = null;
    this.abrManager_ = null;
    this.networkingEngine_ = null;
    this.config_ = null;
    return p;
  }.bind(this));
};


/**
 * @define {string} A version number taken from git at compile time.
 */
goog.define('GIT_VERSION', 'v2.2.5-debug');


/**
 * @const {string}
 * @export
 */
shaka.Player.version = GIT_VERSION;


/**
 * @event shaka.Player.ErrorEvent
 * @description Fired when a playback error occurs.
 * @property {string} type
 *   'error'
 * @property {!shaka.util.Error} detail
 *   An object which contains details on the error.  The error's 'category' and
 *   'code' properties will identify the specific error that occurred.  In an
 *   uncompiled build, you can also use the 'message' and 'stack' properties
 *   to debug.
 * @exportDoc
 */


/**
 * @event shaka.Player.EmsgEvent
 * @description Fired when a non-typical emsg is found in a segment.
 * @property {string} type
 *   'emsg'
 * @property {shakaExtern.EmsgInfo} detail
 *   An object which contains the content of the emsg box.
 * @exportDoc
 */


/**
 * @event shaka.Player.DrmSessionUpdateEvent
 * @description Fired when the CDM has accepted the license response.
 * @property {string} type
 *   'drmsessionupdate'
 * @exportDoc
 */


/**
 * @event shaka.Player.TimelineRegionAdded
 * @description Fired when a media timeline region is added.
 * @property {string} type
 *   'timelineregionadded'
 * @property {shakaExtern.TimelineRegionInfo} detail
 *   An object which contains a description of the region.
 * @exportDoc
 */


/**
 * @event shaka.Player.TimelineRegionEnter
 * @description Fired when the playhead enters a timeline region.
 * @property {string} type
 *   'timelineregionenter'
 * @property {shakaExtern.TimelineRegionInfo} detail
 *   An object which contains a description of the region.
 * @exportDoc
 */


/**
 * @event shaka.Player.TimelineRegionExit
 * @description Fired when the playhead exits a timeline region.
 * @property {string} type
 *   'timelineregionexit'
 * @property {shakaExtern.TimelineregionInfo} detail
 *   An object which contains a description of the region.
 * @exportDoc
 */


/**
 * @event shaka.Player.BufferingEvent
 * @description Fired when the player's buffering state changes.
 * @property {string} type
 *   'buffering'
 * @property {boolean} buffering
 *   True when the Player enters the buffering state.
 *   False when the Player leaves the buffering state.
 * @exportDoc
 */


/**
 * @event shaka.Player.LoadingEvent
 * @description Fired when the player begins loading.
 *   Used by the Cast receiver to determine idle state.
 * @property {string} type
 *   'loading'
 * @exportDoc
 */


/**
 * @event shaka.Player.UnloadingEvent
 * @description Fired when the player unloads or fails to load.
 *   Used by the Cast receiver to determine idle state.
 * @property {string} type
 *   'unloading'
 * @exportDoc
 */


/**
 * @event shaka.Player.TextTrackVisibilityEvent
 * @description Fired when text track visibility changes.
 * @property {string} type
 *   'texttrackvisibility'
 * @exportDoc
 */


/**
 * @event shaka.Player.TracksChangedEvent
 * @description Fired when the list of tracks changes.  For example, this will
 *   happen when changing periods or when track restrictions change.
 * @property {string} type
 *   'trackschanged'
 * @exportDoc
 */


/**
 * @event shaka.Player.AdaptationEvent
 * @description Fired when an automatic adaptation causes the active tracks
 *   to change.  Does not fire when the application calls selectVariantTrack()
 *   selectTextTrack(), selectAudioLanguage() or selectTextLanguage().
 * @property {string} type
 *   'adaptation'
 * @exportDoc
 */


/**
 * @event shaka.Player.ExpirationUpdatedEvent
 * @description Fired when there is a change in the expiration times of an
 *   EME session.
 * @property {string} type
 *   'expirationupdated'
 * @exportDoc
 */


/**
 * @event shaka.Player.LargeGapEvent
 * @description Fired when the playhead enters a large gap.  If
 *   |config.streaming.jumpLargeGaps| is set, the default action of this event
 *   is to jump the gap; this can be prevented by calling preventDefault() on
 *   the event object.
 * @property {string} type
 *   'largegap'
 * @property {number} currentTime
 *   The current time of the playhead.
 * @property {number} gapSize
 *   The size of the gap, in seconds.
 * @exportDoc
 */


/**
 * @event shaka.Player.StreamingEvent
 * @description Fired after the manifest has been parsed and track information
 *   is available, but before streams have been chosen and before any segments
 *   have been fetched. You may use this event to configure the player based on
 *   information found in the manifest.
 * @property {string} type
 *   'streaming'
 * @exportDoc
 */


/** @private {!Object.<string, function():*>} */
shaka.Player.supportPlugins_ = {};


/**
 * Registers a plugin callback that will be called with support().  The
 * callback will return the value that will be stored in the return value from
 * support().
 *
 * @param {string} name
 * @param {function():*} callback
 * @export
 */
shaka.Player.registerSupportPlugin = function(name, callback) {
  shaka.Player.supportPlugins_[name] = callback;
};


/**
 * Return whether the browser provides basic support. If this returns false,
 * Shaka Player cannot be used at all. In this case, do not construct a Player
 * instance and do not use the library.
 *
 * @return {boolean}
 * @export
 */
shaka.Player.isBrowserSupported = function() {
  // Basic features needed for the library to be usable.
  var basic = !!window.Promise && !!window.Uint8Array &&
              !!Array.prototype.forEach;

  return basic &&
      shaka.media.MediaSourceEngine.isBrowserSupported() &&
      shaka.media.DrmEngine.isBrowserSupported();
};


/**
 * Probes the browser to determine what features are supported.  This makes a
 * number of requests to EME/MSE/etc which may result in user prompts.  This
 * should only be used for diagnostics.
 *
 * NOTE: This may show a request to the user for permission.
 *
 * @see https://goo.gl/ovYLvl
 * @return {!Promise.<shakaExtern.SupportType>}
 * @export
 */
shaka.Player.probeSupport = function() {
  goog.asserts.assert(shaka.Player.isBrowserSupported(),
                      'Must have basic support');
  return shaka.media.DrmEngine.probeSupport().then(function(drm) {
    var manifest = shaka.media.ManifestParser.probeSupport();
    var media = shaka.media.MediaSourceEngine.probeSupport();
    var ret = {
      manifest: manifest,
      media: media,
      drm: drm
    };

    var plugins = shaka.Player.supportPlugins_;
    for (var name in plugins) {
      ret[name] = plugins[name]();
    }

    return ret;
  });
};


/**
 * Load a manifest.
 *
 * @param {string} manifestUri
 * @param {number=} opt_startTime Optional start time, in seconds, to begin
 *   playback.  Defaults to 0 for VOD and to the live edge for live.
 * @param {shakaExtern.ManifestParser.Factory=} opt_manifestParserFactory
 *   Optional manifest parser factory to override auto-detection or use an
 *   unregistered parser.
 * @return {!Promise} Resolved when the manifest has been loaded and playback
 *   has begun; rejected when an error occurs or the call was interrupted by
 *   destroy(), unload() or another call to load().
 * @export
 */
shaka.Player.prototype.load = function(manifestUri, opt_startTime,
                                       opt_manifestParserFactory) {
  var unloadPromise = this.unload();
  var loadChain = new shaka.util.CancelableChain();
  this.loadChain_ = loadChain;
  this.dispatchEvent(new shaka.util.FakeEvent('loading'));

  var startTime = Date.now();

  return loadChain.then(function() {
    return unloadPromise;
  }).then(function() {
    // Not tracked in stats because it should be insignificant.
    // Logged in case it is not.
    shaka.log.debug('Unload latency:', (Date.now() - startTime) / 1000);

    this.stats_ = this.getCleanStats_();

    this.eventManager_.listen(this.video_, 'playing',
                              this.updateState_.bind(this));
    this.eventManager_.listen(this.video_, 'pause',
                              this.updateState_.bind(this));
    this.eventManager_.listen(this.video_, 'ended',
                              this.updateState_.bind(this));

    var abrManagerFactory = this.config_.abrFactory;
    this.abrManager_ = new abrManagerFactory();
    this.configureAbrManager_();

    this.textDisplayer_ = new this.config_.textDisplayFactory();
    this.textDisplayer_.setTextVisibility(this.textVisibility_);

    goog.asserts.assert(this.networkingEngine_, 'Must not be destroyed');
    return shaka.media.ManifestParser.getFactory(
        manifestUri,
        this.networkingEngine_,
        this.config_.manifest.retryParameters,
        opt_manifestParserFactory);
  }.bind(this)).then(function(factory) {

    this.parser_ = new factory();
    this.parser_.configure(this.config_.manifest);
    goog.asserts.assert(this.networkingEngine_, 'Must not be destroyed');
    var playerInterface = {
      networkingEngine: this.networkingEngine_,
      filterNewPeriod: this.filterNewPeriod_.bind(this),
      filterAllPeriods: this.filterAllPeriods_.bind(this),
      onTimelineRegionAdded: this.onTimelineRegionAdded_.bind(this),
      onEvent: this.onEvent_.bind(this),
      onError: this.onError_.bind(this)
    };

    if (this.parser_.start.length > 2) {
      goog.asserts.assert(false, 'Old ManifestParser interface is deprecated');
      shaka.log.alwaysWarn(
          'The ManifestParser interface has changed. Please upgrade your ' +
          'plugin to accept the PlayerInterface structure. See the ' +
          'ManifestParser documentation for details.');
      // Use a string index here so the compiler doesn't complain about the
      // incorrect arguments.
      return this.parser_['start'](
          manifestUri, this.networkingEngine_, playerInterface.filterNewPeriod,
          playerInterface.onError, playerInterface.onEvent);
    }

    return this.parser_.start(manifestUri, playerInterface);
  }.bind(this)).then(function(manifest) {

    // When there is a variant with video and audio, filter out all
    // variants which lack one or the other.
    // This is to avoid problems where we choose audio-only variants because
    // they have lower bandwidth, when there are variants with video available.
    var hasAVVariant = manifest.periods.some(function(period) {
      return period.variants.some(function(variant) {
        return variant.video && variant.audio;
      });
    });
    if (hasAVVariant) {
      shaka.log.debug('Found variant with audio and video content, ' +
          'so filtering all periods.');
      manifest.periods.forEach(function(period) {
        period.variants = period.variants.filter(function(variant) {
          return variant.video && variant.audio;
        });
      });
    }

    if (manifest.periods.length == 0) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.NO_PERIODS);
    }

    this.manifest_ = manifest;
    this.manifestUri_ = manifestUri;
    this.drmEngine_ = this.createDrmEngine();
    this.drmEngine_.configure(this.config_.drm);
    return this.drmEngine_.init(manifest, false /* isOffline */);
  }.bind(this)).then(function() {
    // Re-filter the manifest after DRM has been initialized.
    this.filterAllPeriods_(this.manifest_.periods);

    this.lastTimeStatsUpdateTimestamp_ = Date.now() / 1000;

    // Copy preferred languages from the config again, in case the config was
    // changed between construction and playback.
    this.currentAudioLanguage_ = this.config_.preferredAudioLanguage;
    this.currentTextLanguage_ = this.config_.preferredTextLanguage;

    var fullDuration = this.manifest_.presentationTimeline.getDuration();
    var playRangeEnd = this.config_.playRangeEnd;
    var playRangeStart = this.config_.playRangeStart;

    if (playRangeStart > 0) {
      if (this.isLive()) {
        shaka.log.warning('PlayerConfiguration.playRangeStart has been ' +
                          'configured for live content. Ignoring the setting.');
      } else {
        this.manifest_.presentationTimeline.setAvailabilityStart(
            playRangeStart);
      }
    }

    // If the playback has been configured to end before the end of the
    // presentation, update the duration unless it's live content.
    if (playRangeEnd < fullDuration) {
      if (this.isLive()) {
        shaka.log.warning('PlayerConfiguration.playRangeEnd has been ' +
                          'configured for live content. Ignoring the setting.');
      } else {
        this.manifest_.presentationTimeline.setDuration(playRangeEnd);
      }
    }

    // Wait for MediaSource to open before continuing.
    return Promise.all([
      this.drmEngine_.attach(this.video_),
      this.mediaSourceOpen_
    ]);
  }.bind(this)).then(function() {
    if (this.abrManager_['chooseStreams']) {
      shaka.log.alwaysWarn('AbrManager API has changed. ' +
          'The SwitchCallback signature has changed to accept a variant ' +
          'instead of a map. Please update your AbrManager. ' +
          'The old API will be removed in v2.3.');
      this.abrManager_['init'](this.switchV21_.bind(this));
    } else {
      this.abrManager_.init(this.switch_.bind(this));
    }
    // MediaSource is open, so create the Playhead, MediaSourceEngine, and
    // StreamingEngine.
    this.playhead_ = this.createPlayhead(opt_startTime);
    this.playheadObserver_ = this.createPlayheadObserver();
    this.mediaSourceEngine_ = this.createMediaSourceEngine();

    this.streamingEngine_ = this.createStreamingEngine();
    this.streamingEngine_.configure(this.config_.streaming);

    var event = new shaka.util.FakeEvent('streaming');
    this.dispatchEvent(event);

    // If the content is multi-codec and the browser can play more than one of
    // them, choose codecs now before we initialize streaming.
    this.chooseCodecsAndFilterManifest_();
    return this.streamingEngine_.init();
  }.bind(this)).then(function() {
    if (this.config_.streaming.startAtSegmentBoundary) {
      var time = this.adjustStartTime_(this.playhead_.getTime());
      this.playhead_.setStartTime(time);
    }

    // Re-filter the manifest after streams have been chosen.
    this.manifest_.periods.forEach(this.filterNewPeriod_.bind(this));
    // Dispatch a 'trackschanged' event now that all initial filtering is done.
    this.onTracksChanged_();
    // Since the first streams just became active, send an adaptation event.
    this.onAdaptation_();

    // Now that we've filtered out variants that aren't compatible with the
    // active one, update abr manager with filtered variants for the current
    // period.
    var currentPeriod = this.streamingEngine_.getCurrentPeriod();
    var variants = shaka.util.StreamUtils.filterVariantsByLanguageAndRole(
        currentPeriod, this.currentAudioLanguage_, this.currentVariantRole_);
    this.abrManager_.setVariants(variants);

    var hasPrimary = currentPeriod.variants.some(function(variant) {
      return variant.primary;
    });
    if (!this.currentAudioLanguage_ && !hasPrimary) {
      shaka.log.warning('No preferred audio language set.  We will choose an ' +
                        'arbitrary language initially');
    }

    this.pendingTimelineRegions_.forEach(
        this.playheadObserver_.addTimelineRegion.bind(this.playheadObserver_));
    this.pendingTimelineRegions_ = [];

    // Wait for the 'loadeddata' event to measure load() latency.
    this.eventManager_.listenOnce(this.video_, 'loadeddata', function() {
      // Compute latency in seconds (Date.now() gives ms):
      var latency = (Date.now() - startTime) / 1000;
      this.stats_.loadLatency = latency;
      shaka.log.debug('Load latency:', latency);
    }.bind(this));

    this.loadChain_ = null;
  }.bind(this)).finalize().catch(function(error) {
    goog.asserts.assert(error instanceof shaka.util.Error,
                        'Wrong error type!');
    shaka.log.debug('load() failed:', error);

    // If we haven't started another load, clear the loadChain_ member.
    if (this.loadChain_ == loadChain) {
      this.loadChain_ = null;
      this.dispatchEvent(new shaka.util.FakeEvent('unloading'));
    }
    return Promise.reject(error);
  }.bind(this));
};


/**
 * In case of multiple usable codecs, choose one based on lowest average
 * bandwidth and filter out the rest.
 * @private
 */
shaka.Player.prototype.chooseCodecsAndFilterManifest_ = function() {
  function variantCodecs(variant) {
    // Only consider the base of the codec string.  For example, these should
    // both be considered the same codec: avc1.42c01e, avc1.4d401f
    var baseVideoCodec =
        variant.video ? variant.video.codecs.split('.')[0] : '';
    var baseAudioCodec =
        variant.audio ? variant.audio.codecs.split('.')[0] : '';
    return baseVideoCodec + '-' + baseAudioCodec;
  }

  // Organize variants into buckets by codecs.
  var variantsByCodecs = {};
  this.manifest_.periods.forEach(function(period) {
    period.variants.forEach(function(variant) {
      var codecs = variantCodecs(variant);
      if (!(codecs in variantsByCodecs)) {
        variantsByCodecs[codecs] = [];
      }
      variantsByCodecs[codecs].push(variant);
    });
  });

  // Compute the average bandwidth for each group of variants.
  // Choose the lowest-bandwidth codecs.
  var bestCodecs = null;
  var lowestAverageBandwidth = Infinity;
  shaka.util.MapUtils.forEach(variantsByCodecs, function(codecs, variants) {
    var sum = 0;
    var num = 0;
    variants.forEach(function(variant) {
      sum += variant.bandwidth || 0;
      ++num;
    });
    var averageBandwidth = sum / num;
    shaka.log.debug('codecs', codecs, 'avg bandwidth', averageBandwidth);

    if (averageBandwidth < lowestAverageBandwidth) {
      bestCodecs = codecs;
      lowestAverageBandwidth = averageBandwidth;
    }
  });
  goog.asserts.assert(bestCodecs != null, 'Should have chosen codecs!');
  goog.asserts.assert(!isNaN(lowestAverageBandwidth),
      'Bandwidth should be a number!');

  // Filter out any variants that don't match, forcing AbrManager to choose from
  // the most efficient variants possible.
  this.manifest_.periods.forEach(function(period) {
    period.variants = period.variants.filter(function(variant) {
      var codecs = variantCodecs(variant);
      if (codecs == bestCodecs) return true;

      shaka.log.debug('Dropping Variant (better codec available)', variant);
      return false;
    });
  });
};


/**
 * Creates a new instance of DrmEngine.  This can be replaced by tests to
 * create fake instances instead.
 *
 * @return {!shaka.media.DrmEngine}
 */
shaka.Player.prototype.createDrmEngine = function() {
  goog.asserts.assert(this.networkingEngine_, 'Must not be destroyed');

  var playerInterface = {
    netEngine: this.networkingEngine_,
    onError: this.onError_.bind(this),
    onKeyStatus: this.onKeyStatus_.bind(this),
    onExpirationUpdated: this.onExpirationUpdated_.bind(this),
    onEvent: this.onEvent_.bind(this)
  };
  return new shaka.media.DrmEngine(playerInterface);
};


/**
 * Creates a new instance of NetworkingEngine.  This can be replaced by tests
 * to create fake instances instead.
 *
 * @return {!shaka.net.NetworkingEngine}
 */
shaka.Player.prototype.createNetworkingEngine = function() {
  return new shaka.net.NetworkingEngine(this.onSegmentDownloaded_.bind(this));
};


/**
 * Creates a new instance of Playhead.  This can be replaced by tests to create
 * fake instances instead.
 *
 * @param {number=} opt_startTime
 * @return {!shaka.media.Playhead}
 */
shaka.Player.prototype.createPlayhead = function(opt_startTime) {
  goog.asserts.assert(this.manifest_, 'Must have manifest');
  var startTime = opt_startTime == undefined ? null : opt_startTime;
  return new shaka.media.Playhead(
      this.video_, this.manifest_, this.config_.streaming,
      startTime, this.onSeek_.bind(this), this.onEvent_.bind(this));
};


/**
 * Creates a new instance of PlayheadOvserver.  This can be replaced by tests to
 * create fake instances instead.
 *
 * @return {!shaka.media.PlayheadObserver}
 */
shaka.Player.prototype.createPlayheadObserver = function() {
  goog.asserts.assert(this.manifest_, 'Must have manifest');
  return new shaka.media.PlayheadObserver(
      this.video_, this.mediaSource_, this.manifest_, this.config_.streaming,
      this.onBuffering_.bind(this), this.onEvent_.bind(this),
      this.onChangePeriod_.bind(this));
};


/**
 * Create and open MediaSource.  Potentially slow.
 *
 * @return {!Promise}
 */
shaka.Player.prototype.createMediaSource = function() {
  this.mediaSource_ = new MediaSource();
  var ret = new shaka.util.PublicPromise();
  this.eventManager_.listen(this.mediaSource_, 'sourceopen', ret.resolve);
  this.video_.src = window.URL.createObjectURL(this.mediaSource_);
  return ret;
};


/**
 * Creates a new instance of MediaSourceEngine.  This can be replaced by tests
 * to create fake instances instead.
 *
 * @return {!shaka.media.MediaSourceEngine}
 */
shaka.Player.prototype.createMediaSourceEngine = function() {
  return new shaka.media.MediaSourceEngine(
      this.video_, this.mediaSource_, this.textDisplayer_);
};


/**
 * Creates a new instance of StreamingEngine.  This can be replaced by tests
 * to create fake instances instead.
 *
 * @return {!shaka.media.StreamingEngine}
 */
shaka.Player.prototype.createStreamingEngine = function() {
  goog.asserts.assert(
      this.playhead_ && this.playheadObserver_ && this.mediaSourceEngine_ &&
          this.manifest_,
      'Must not be destroyed');

  var playerInterface = {
    playhead: this.playhead_,
    mediaSourceEngine: this.mediaSourceEngine_,
    netEngine: this.networkingEngine_,
    onChooseStreams: this.onChooseStreams_.bind(this),
    onCanSwitch: this.canSwitch_.bind(this),
    onError: this.onError_.bind(this),
    onEvent: this.onEvent_.bind(this),
    onManifestUpdate: this.onManifestUpdate_.bind(this),
    onSegmentAppended: this.onSegmentAppended_.bind(this),
    filterNewPeriod: this.filterNewPeriod_.bind(this),
    filterAllPeriods: this.filterAllPeriods_.bind(this)
  };
  return new shaka.media.StreamingEngine(this.manifest_, playerInterface);
};


/**
 * Configure the Player instance.
 *
 * The config object passed in need not be complete.  It will be merged with
 * the existing Player configuration.
 *
 * Config keys and types will be checked.  If any problems with the config
 * object are found, errors will be reported through logs.
 *
 * @param {!Object} config This should follow the form of
 *   {@link shakaExtern.PlayerConfiguration}, but you may omit any field you do
 *   not wish to change.
 * @export
 */
shaka.Player.prototype.configure = function(config) {
  goog.asserts.assert(this.config_, 'Config must not be null!');

  // Backward compatibility for AbrManager injection.  To be removed in v2.3.
  if (config['abr'] && config['abr']['manager']) {
    shaka.log.alwaysWarn('AbrManager configuration has changed. ' +
        'Please use abrFactory instead of abr.manager. ' +
        'The old API will be removed in v2.3.');
    var managerInstance = config['abr']['manager'];
    var backwardCompatibilityFactory = function() {
      return managerInstance;
    };

    delete config['abr']['manager'];
    config['abrFactory'] = backwardCompatibilityFactory;
  }

  // Backward compatibility for streaming config.  To be removed in v2.3.
  if (config['streaming'] &&
      config['streaming']['infiniteRetriesForLiveStreams'] != null) {
    shaka.log.alwaysWarn('Streaming configuration has changed. ' +
        'Please use streaming.failureCallback instead of ' +
        'streaming.infiniteRetriesForLiveStreams. ' +
        'The old API will be removed in v2.3.');

    this.infiniteRetriesForLiveStreams_ =
        !!config['streaming']['infiniteRetriesForLiveStreams'];
    delete config['streaming']['infiniteRetriesForLiveStreams'];
  }

  shaka.util.ConfigUtils.mergeConfigObjects(
      this.config_, config, this.defaultConfig_(), this.configOverrides_(), '');

  // We only need to clear buffers is the user is changing a setting that we
  // need to see reflected immediately.
  var clearBuffer = 'restrictions' in config;
  this.applyConfig_(clearBuffer);
};


/**
 * Apply config changes.
 * @param {boolean} clearBuffer
 * @private
 */
shaka.Player.prototype.applyConfig_ = function(clearBuffer) {
  if (this.parser_) {
    this.parser_.configure(this.config_.manifest);
  }
  if (this.drmEngine_) {
    this.drmEngine_.configure(this.config_.drm);
  }
  if (this.streamingEngine_) {
    this.streamingEngine_.configure(this.config_.streaming);

    // Need to apply the restrictions to every period.
    try {
      // this.filterNewPeriod_() may throw.
      this.manifest_.periods.forEach(this.filterNewPeriod_.bind(this));
    } catch (error) {
      this.onError_(error);
    }

    // May need to choose new streams.
    shaka.log.debug('Choosing new streams after changing configuration');
    var period = this.streamingEngine_.getCurrentPeriod();
    this.chooseStreamsAndSwitch_(period, clearBuffer);
  }

  if (this.abrManager_) {
    this.configureAbrManager_();
    // Simply enable/disable ABR with each call, since multiple calls to these
    // methods have no effect.
    if (this.config_.abr.enabled && !this.switchingPeriods_) {
      this.abrManager_.enable();
    } else {
      this.abrManager_.disable();
    }
  }
};


/**
 * Backward compatibility for AbrManager configuration.  To be removed in v2.3.
 * @private
 */
shaka.Player.prototype.configureAbrManager_ = function() {
  if (this.abrManager_.configure) {
    this.abrManager_.configure(this.config_.abr);
  } else {
    shaka.log.alwaysWarn('AbrManager API has changed. ' +
        'AbrManager.setDefaultEstimate() and ' +
        'AbrManager.setRestrictions() are deprecated. ' +
        'AbrManager.configure() is used instead. ' +
        'Please upgrade to the new API. ' +
        'The old API will be removed in v2.3.');

    this.abrManager_['setDefaultEstimate'](
        this.config_.abr.defaultBandwidthEstimate);
    this.abrManager_['setRestrictions'](this.config_.abr.restrictions);
  }
};


/**
 * Return a copy of the current configuration.  Modifications of the returned
 * value will not affect the Player's active configuration.  You must call
 * player.configure() to make changes.
 *
 * @return {shakaExtern.PlayerConfiguration}
 * @export
 */
shaka.Player.prototype.getConfiguration = function() {
  goog.asserts.assert(this.config_, 'Config must not be null!');

  var ret = this.defaultConfig_();
  shaka.util.ConfigUtils.mergeConfigObjects(
      ret, this.config_, this.defaultConfig_(), this.configOverrides_(), '');
  return ret;
};


/**
 * Reset configuration to default.
 * @export
 */
shaka.Player.prototype.resetConfiguration = function() {
  // Don't call mergeConfigObjects_(), since that would not reset open-ended
  // dictionaries like drm.servers.
  this.config_ = this.defaultConfig_();

  // Rather than checking if it makes sense to clear the buffers based on which
  // values are getting reset, just clear them.
  this.applyConfig_(true);
};


/**
 * @return {HTMLMediaElement} A reference to the HTML Media Element passed
 *     in during initialization.
 * @export
 */
shaka.Player.prototype.getMediaElement = function() {
  return this.video_;
};


/**
 * @return {shaka.net.NetworkingEngine} A reference to the Player's networking
 *     engine.  Applications may use this to make requests through Shaka's
 *     networking plugins.
 * @export
 */
shaka.Player.prototype.getNetworkingEngine = function() {
  return this.networkingEngine_;
};


/**
 * @return {?string} If a manifest is loaded, returns the manifest URI given in
 *   the last call to load().  Otherwise, returns null.
 * @export
 */
shaka.Player.prototype.getManifestUri = function() {
  return this.manifestUri_;
};


/**
 * @return {boolean} True if the current stream is live.  False otherwise.
 * @export
 */
shaka.Player.prototype.isLive = function() {
  return this.manifest_ ?
         this.manifest_.presentationTimeline.isLive() :
         false;
};


/**
 * @return {boolean} True if the current stream is in-progress VOD.
 *   False otherwise.
 * @export
 */
shaka.Player.prototype.isInProgress = function() {
  return this.manifest_ ?
         this.manifest_.presentationTimeline.isInProgress() :
         false;
};


/**
 * @return {boolean} True for audio-only content.  False otherwise.
 * @export
 */
shaka.Player.prototype.isAudioOnly = function() {
  if (!this.manifest_ || !this.manifest_.periods.length)
    return false;

  var variants = this.manifest_.periods[0].variants;
  if (!variants.length)
    return false;

  // Note that if there are some audio-only variants and some audio-video
  // variants, the audio-only variants are removed during filtering.
  // Therefore if the first variant has no video, that's sufficient to say it
  // is audio-only content.
  return !variants[0].video;
};


/**
 * Get the seekable range for the current stream.
 * @return {{start: number, end: number}}
 * @export
 */
shaka.Player.prototype.seekRange = function() {
  var start = 0;
  var end = 0;
  if (this.manifest_) {
    var timeline = this.manifest_.presentationTimeline;
    start = timeline.getSegmentAvailabilityStart();
    end = timeline.getSeekRangeEnd();
  }
  return {'start': start, 'end': end};
};


/**
 * Get the key system currently being used by EME.  This returns the empty
 * string if not using EME.
 *
 * @return {string}
 * @export
 */
shaka.Player.prototype.keySystem = function() {
  return this.drmEngine_ ? this.drmEngine_.keySystem() : '';
};


/**
 * Get the DrmInfo used to initialize EME.  This returns null when not using
 * EME.
 *
 * @return {?shakaExtern.DrmInfo}
 * @export
 */
shaka.Player.prototype.drmInfo = function() {
  return this.drmEngine_ ? this.drmEngine_.getDrmInfo() : null;
};


/**
 * The next known expiration time for any EME session.  If the sessions never
 * expire, or there are no EME sessions, this returns Infinity.
 *
 * @return {number}
 * @export
 */
shaka.Player.prototype.getExpiration = function() {
  return this.drmEngine_ ? this.drmEngine_.getExpiration() : Infinity;
};


/**
 * @return {boolean} True if the Player is in a buffering state.
 * @export
 */
shaka.Player.prototype.isBuffering = function() {
  return this.buffering_;
};


/**
 * Unload the current manifest and make the Player available for re-use.
 *
 * @return {!Promise} Resolved when streaming has stopped and the previous
 *     content, if any, has been unloaded.
 * @export
 */
shaka.Player.prototype.unload = function() {
  if (this.destroyed_) return Promise.resolve();
  this.dispatchEvent(new shaka.util.FakeEvent('unloading'));

  var p = Promise.resolve();
  if (this.loadChain_) {
    // A load is in progress, cancel it.
    var interrupt = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.PLAYER,
        shaka.util.Error.Code.LOAD_INTERRUPTED);
    p = this.loadChain_.cancel(interrupt);
  }

  return p.then(function() {
    // If there is an existing unload operation, use that.
    if (!this.unloadChain_) {
      this.unloadChain_ = this.resetStreaming_().then(function() {
        this.unloadChain_ = null;
      }.bind(this));
    }
    return this.unloadChain_;
  }.bind(this));
};


/**
 * Gets the current effective playback rate.  If using trick play, it will
 * return the current trick play rate; otherwise, it will return the video
 * playback rate.
 * @return {number}
 * @export
 */
shaka.Player.prototype.getPlaybackRate = function() {
  return this.playhead_ ? this.playhead_.getPlaybackRate() : 0;
};


/**
 * Skip through the content without playing.  Simulated using repeated seeks.
 *
 * Trick play will be canceled automatically if the playhead hits the beginning
 * or end of the seekable range for the content.
 *
 * @param {number} rate The playback rate to simulate.  For example, a rate of
 *     2.5 would result in 2.5 seconds of content being skipped every second.
 *     To trick-play backward, use a negative rate.
 * @export
 */
shaka.Player.prototype.trickPlay = function(rate) {
  shaka.log.debug('Trick play rate', rate);
  if (this.playhead_)
    this.playhead_.setPlaybackRate(rate);

  if (this.streamingEngine_)
    this.streamingEngine_.setTrickPlay(rate != 1);
};


/**
 * Cancel trick-play.
 * @export
 */
shaka.Player.prototype.cancelTrickPlay = function() {
  shaka.log.debug('Trick play canceled');
  if (this.playhead_)
    this.playhead_.setPlaybackRate(1);

  if (this.streamingEngine_)
    this.streamingEngine_.setTrickPlay(false);
};


/**
 * Return a list of variant tracks available for the current
 * Period.  If there are multiple Periods, then you must seek to the Period
 * before being able to switch.
 *
 * @return {!Array.<shakaExtern.Track>}
 * @export
 */
shaka.Player.prototype.getVariantTracks = function() {
  if (!this.manifest_)
    return [];
  this.assertCorrectActiveStreams_();

  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  var currentPeriod = shaka.util.StreamUtils.findPeriodContainingTime(
      this.manifest_, this.playhead_.getTime());
  var activeStreams = this.activeStreamsByPeriod_[currentPeriod] || {};
  return shaka.util.StreamUtils.getVariantTracks(
      this.manifest_.periods[currentPeriod],
      activeStreams[ContentType.AUDIO],
      activeStreams[ContentType.VIDEO]);
};


/**
 * Return a list of text tracks available for the current
 * Period.  If there are multiple Periods, then you must seek to the Period
 * before being able to switch.
 *
 * @return {!Array.<shakaExtern.Track>}
 * @export
 */
shaka.Player.prototype.getTextTracks = function() {
  if (!this.manifest_)
    return [];
  this.assertCorrectActiveStreams_();

  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var currentPeriod = shaka.util.StreamUtils.findPeriodContainingTime(
      this.manifest_, this.playhead_.getTime());
  var activeStreams = this.activeStreamsByPeriod_[currentPeriod] || {};
  return shaka.util.StreamUtils
      .getTextTracks(
          this.manifest_.periods[currentPeriod],
          activeStreams[ContentType.TEXT])
      .filter(function(track) {
        // Don't show any tracks that are being loaded still.
        return this.loadingTextStreamIds_.indexOf(track.id) < 0;
      }.bind(this));
};


/**
 * Select a specific text track. Note that AdaptationEvents are not
 * fired for manual track selections.
 *
 * @param {shakaExtern.Track} track
 * @export
 */
shaka.Player.prototype.selectTextTrack = function(track) {
  if (!this.streamingEngine_)
    return;

  var StreamUtils = shaka.util.StreamUtils;

  var period = this.streamingEngine_.getCurrentPeriod();
  var stream = StreamUtils.findTextStreamForTrack(period, track);

  if (!stream) {
    shaka.log.error('Unable to find the track with id "' + track.id +
                    '"; did we change Periods?');
    return;
  }

  // Add entries to the history.
  this.addTextStreamToSwitchHistory_(stream, /* fromAdaptation */ false);
  this.switchTextStream_(stream);
};


/**
 * Select a specific track. Note that AdaptationEvents are not fired for manual
 * track selections.
 *
 * @param {shakaExtern.Track} track
 * @param {boolean=} opt_clearBuffer
 * @export
 */
shaka.Player.prototype.selectVariantTrack = function(track, opt_clearBuffer) {
  if (!this.streamingEngine_)
    return;

  if (this.config_.abr.enabled) {
    shaka.log.alwaysWarn('Changing tracks while abr manager is enabled will ' +
                         'likely result in the selected track being ' +
                         'overriden. Consider disabling abr before calling ' +
                         'selectVariantTrack().');
  }

  var StreamUtils = shaka.util.StreamUtils;

  var period = this.streamingEngine_.getCurrentPeriod();
  var variant = StreamUtils.findVariantForTrack(period, track);
  if (!variant) {
    shaka.log.error('Unable to locate track with id "' + track.id + '".');
    return;
  }

  // Double check that the track is allowed to be played.
  // The track list should only contain playable variants,
  // but if restrictions change and selectVariantTrack()
  // is called before the track list is updated, we could
  // get a now-restricted variant.
  var variantIsPlayable = StreamUtils.isPlayable(variant);
  if (!variantIsPlayable) {
    shaka.log.error('Unable to switch to track with id "' + track.id +
                    '" because it is restricted.');
    return;
  }

  // Add entries to the history.
  this.addVariantToSwitchHistory_(variant, /* fromAdaptation */ false);
  this.switchVariant_(variant, opt_clearBuffer);
};


/**
 * Return a list of audio languages available for the current
 * Period.
 *
 * @return {!Array.<string>}
 * @export
 */
shaka.Player.prototype.getAudioLanguages = function() {
  if (!this.streamingEngine_) {
    return [];
  }

  var StreamUtils = shaka.util.StreamUtils;
  var period = this.streamingEngine_.getCurrentPeriod();
  var variants = StreamUtils.getPlayableVariants(period.variants);
  return variants.map(function(variant) {
    return variant.language;
  }).filter(shaka.util.Functional.isNotDuplicate);
};


/**
 * Return a list of text languages available for the current
 * Period.
 *
 * @return {!Array.<string>}
 * @export
 */
shaka.Player.prototype.getTextLanguages = function() {
  if (!this.streamingEngine_) {
    return [];
  }

  var period = this.streamingEngine_.getCurrentPeriod();
  return period.textStreams.map(function(stream) {
    return stream.language;
  }).filter(shaka.util.Functional.isNotDuplicate);
};


/**
 * Sets currentAudioLanguage to the selected language and chooses
 * new variant in that language if need be.
 *
 * @param {!string} language
 * @param {string=} opt_role
 * @export
 */
shaka.Player.prototype.selectAudioLanguage = function(language, opt_role) {
  if (!this.streamingEngine_) return;
  var period = this.streamingEngine_.getCurrentPeriod();
  this.currentAudioLanguage_ = language;
  this.currentVariantRole_ = opt_role || '';
  this.chooseStreamsAndSwitch_(period, true);
};


/**
 * Sets currentTextLanguage to the selected language and chooses
 * new text stream in that language if need be.
 *
 * @param {!string} language
 * @param {string=} opt_role
 * @export
 */
shaka.Player.prototype.selectTextLanguage = function(language, opt_role) {
  if (!this.streamingEngine_) return;
  var period = this.streamingEngine_.getCurrentPeriod();
  this.currentTextLanguage_ = language;
  this.currentTextRole_ = opt_role || '';
  this.chooseStreamsAndSwitch_(period, true);
};


/**
 * @return {boolean} True if the current text track is visible.
 * @export
 */
shaka.Player.prototype.isTextTrackVisible = function() {
  if (this.textDisplayer_) {
    return this.textDisplayer_.isTextVisible();
  } else {
    return this.textVisibility_;
  }
};


/**
 * Set the visibility of the current text track, if any.
 *
 * @param {boolean} on
 * @export
 */
shaka.Player.prototype.setTextTrackVisibility = function(on) {
  if (this.textDisplayer_) {
    this.textDisplayer_.setTextVisibility(on);
  } else {
    this.textVisibility_ = on;
  }
  this.onTextTrackVisibility_();
};


/**
 * Returns current playhead time as a Date.
 *
 * @return {Date}
 * @export
 */
shaka.Player.prototype.getPlayheadTimeAsDate = function() {
  if (!this.manifest_) return null;

  goog.asserts.assert(this.isLive(),
      'getPlayheadTimeAsDate should be called on a live stream!');

  var time =
      this.manifest_.presentationTimeline.getPresentationStartTime() * 1000 +
      this.video_.currentTime * 1000;

  return new Date(time);
};


/**
 * Returns the presentation start time as a Date.
 *
 * @return {Date}
 * @export
 */
shaka.Player.prototype.getPresentationStartTimeAsDate = function() {
  if (!this.manifest_) return null;

  goog.asserts.assert(this.isLive(),
      'getPresentationStartTimeAsDate should be called on a live stream!');

  var time =
      this.manifest_.presentationTimeline.getPresentationStartTime() * 1000;

  return new Date(time);
};


/**
 * Return the information about the current buffered ranges.
 *
 * @return {shakaExtern.BufferedInfo}
 * @export
 */
shaka.Player.prototype.getBufferedInfo = function() {
  if (!this.mediaSourceEngine_) {
    return {
      total: [],
      audio: [],
      video: [],
      text: []
    };
  }

  return this.mediaSourceEngine_.getBufferedInfo();
};


/**
 * Return playback and adaptation stats.
 *
 * @return {shakaExtern.Stats}
 * @export
 */
shaka.Player.prototype.getStats = function() {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  this.updateTimeStats_();
  this.updateState_();

  var video = null;
  var variant = null;

  var videoElem = /** @type {!HTMLVideoElement} */ (this.video_);
  var videoInfo = videoElem && videoElem.getVideoPlaybackQuality ?
      videoElem.getVideoPlaybackQuality() : {};

  if (this.playhead_ && this.manifest_) {
    var periodIdx = shaka.util.StreamUtils.findPeriodContainingTime(
        this.manifest_, this.playhead_.getTime());
    var period = this.manifest_.periods[periodIdx];
    var activeStreams = this.activeStreamsByPeriod_[periodIdx];

    variant = shaka.util.StreamUtils.getVariantByStreamIds(
        activeStreams[ContentType.AUDIO],
        activeStreams[ContentType.VIDEO],
        period.variants);

    video = variant.video || {};
  }

  if (!video) video = {};
  if (!variant) variant = {};

  // Clone the internal object so our state cannot be tampered with.
  var cloneObject = shaka.util.ConfigUtils.cloneObject;
  return {
    // Not tracked in this.stats_:
    width: video.width || 0,
    height: video.height || 0,
    streamBandwidth: variant.bandwidth || 0,
    decodedFrames: Number(videoInfo.totalVideoFrames),
    droppedFrames: Number(videoInfo.droppedVideoFrames),
    estimatedBandwidth: this.abrManager_ ?
        this.abrManager_.getBandwidthEstimate() : NaN,

    loadLatency: this.stats_.loadLatency,
    playTime: this.stats_.playTime,
    bufferingTime: this.stats_.bufferingTime,
    // Deep-clone the objects as well as the arrays that contain them:
    switchHistory: cloneObject(this.stats_.switchHistory),
    stateHistory: cloneObject(this.stats_.stateHistory)
  };
};


/**
 * Adds the given text track to the current Period.  Load() must resolve before
 * calling.  The current Period or the presentation must have a duration.  This
 * returns a Promise that will resolve when the track can be switched to and
 * will resolve with the track that was created.
 *
 * @param {string} uri
 * @param {string} language
 * @param {string} kind
 * @param {string} mime
 * @param {string=} opt_codec
 * @param {string=} opt_label
 * @return {!Promise.<shakaExtern.Track>}
 * @export
 */
shaka.Player.prototype.addTextTrack = function(
    uri, language, kind, mime, opt_codec, opt_label) {
  if (!this.streamingEngine_) {
    shaka.log.error(
        'Must call load() and wait for it to resolve before adding text ' +
        'tracks.');
    return Promise.reject();
  }

  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  // Get the Period duration.
  var period = this.streamingEngine_.getCurrentPeriod();
  /** @type {number} */
  var periodDuration;
  for (var i = 0; i < this.manifest_.periods.length; i++) {
    if (this.manifest_.periods[i] == period) {
      if (i == this.manifest_.periods.length - 1) {
        periodDuration = this.manifest_.presentationTimeline.getDuration() -
            period.startTime;
        if (periodDuration == Infinity) {
          shaka.log.error(
              'The current Period or the presentation must have a duration ' +
              'to add external text tracks.');
          return Promise.reject();
        }
      } else {
        var nextPeriod = this.manifest_.periods[i + 1];
        periodDuration = nextPeriod.startTime - period.startTime;
      }
      break;
    }
  }

  /** @type {shakaExtern.Stream} */
  var stream = {
    id: this.nextExternalStreamId_++,
    createSegmentIndex: Promise.resolve.bind(Promise),
    findSegmentPosition: function(time) { return 1; },
    getSegmentReference: function(ref) {
      if (ref != 1) return null;
      return new shaka.media.SegmentReference(
          1, 0, periodDuration, function() { return [uri]; }, 0, null);
    },
    initSegmentReference: null,
    presentationTimeOffset: 0,
    mimeType: mime,
    codecs: opt_codec || '',
    kind: kind,
    encrypted: false,
    keyId: null,
    language: language,
    label: opt_label || null,
    type: ContentType.TEXT,
    primary: false,
    trickModeVideo: null,
    containsEmsgBoxes: false,
    roles: [],
    channelsCount: null
  };

  // Add the stream to the loading list to ensure it isn't switched to while it
  // is initializing.
  this.loadingTextStreamIds_.push(stream.id);
  period.textStreams.push(stream);

  return this.streamingEngine_.notifyNewTextStream(stream).then(function() {
    if (this.destroyed_) return;

    // If this was the first text stream, StreamingEngine will start streaming
    // it in notifyNewTextStream.  So update the active stream.
    var curPeriodIdx = this.manifest_.periods.indexOf(period);
    var activeStreams = this.streamingEngine_.getActiveStreams();
    if (activeStreams[ContentType.TEXT]) {
      this.activeStreamsByPeriod_[curPeriodIdx][ContentType.TEXT] =
          activeStreams[ContentType.TEXT].id;
    }

    // Remove the stream from the loading list.
    this.loadingTextStreamIds_.splice(
        this.loadingTextStreamIds_.indexOf(stream.id), 1);

    shaka.log.debug('Choosing new streams after adding a text stream');
    this.chooseStreamsAndSwitch_(period, true);
    this.onTracksChanged_();

    return {
      id: stream.id,
      active: false,
      type: ContentType.TEXT,
      bandwidth: 0,
      language: language,
      label: opt_label || null,
      kind: kind,
      width: null,
      height: null
    };
  }.bind(this));
};


/**
 * Set the maximum resolution that the platform's hardware can handle.
 * This will be called automatically by shaka.cast.CastReceiver to enforce
 * limitations of the Chromecast hardware.
 *
 * @param {number} width
 * @param {number} height
 * @export
 */
shaka.Player.prototype.setMaxHardwareResolution = function(width, height) {
  this.maxHwRes_.width = width;
  this.maxHwRes_.height = height;
};


/**
 * Retry streaming after a failure.  Does nothing if not in a failure state.
 * @return {boolean} False if unable to retry.
 * @export
 */
shaka.Player.prototype.retryStreaming = function() {
  return this.streamingEngine_ ? this.streamingEngine_.retry() : false;
};


/**
 * Return the manifest information if it's loaded. Otherwise, return null.
 * @return {?shakaExtern.Manifest}
 * @export
 */
shaka.Player.prototype.getManifest = function() {
  return this.manifest_;
};


/**
 * Initialize the Player.
 * @private
 */
shaka.Player.prototype.initialize_ = function() {
  // Start the (potentially slow) process of opening MediaSource now.
  this.mediaSourceOpen_ = this.createMediaSource();

  // Listen for video errors.
  this.eventManager_.listen(this.video_, 'error',
      this.onVideoError_.bind(this));
};


/**
 * @param {shakaExtern.Variant} variant
 * @param {boolean} fromAdaptation
 * @private
 */
shaka.Player.prototype.addVariantToSwitchHistory_ =
    function(variant, fromAdaptation) {
  if (variant.video)
    this.updateActiveStreams_(variant.video);
  if (variant.audio)
    this.updateActiveStreams_(variant.audio);

  // TODO: Get StreamingEngine to track variants and create getActiveVariant()
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var activePeriod = this.streamingEngine_.getActivePeriod();
  var activeStreams = this.streamingEngine_.getActiveStreams();
  var activeVariant = shaka.util.StreamUtils.getVariantByStreams(
      activeStreams[ContentType.AUDIO], activeStreams[ContentType.VIDEO],
      activePeriod ? activePeriod.variants : []);

  // Only log the switch if the variant changes. For the initial decision,
  // activeVariant is null and variant != activeVariant in this case, too.
  // This allows us to avoid onAdaptation_() when nothing has changed.
  if (variant != activeVariant) {
    this.stats_.switchHistory.push({
      timestamp: Date.now() / 1000,
      id: variant.id,
      type: 'variant',
      fromAdaptation: fromAdaptation,
      bandwidth: variant.bandwidth
    });
  }
};


/**
 * @param {shakaExtern.Stream} textStream
 * @param {boolean} fromAdaptation
 * @private
 */
shaka.Player.prototype.addTextStreamToSwitchHistory_ =
    function(textStream, fromAdaptation) {
  this.updateActiveStreams_(textStream);

  this.stats_.switchHistory.push({
    timestamp: Date.now() / 1000,
    id: textStream.id,
    type: 'text',
    fromAdaptation: fromAdaptation,
    bandwidth: null
  });
};


/**
 * @param {!shakaExtern.Stream} stream
 * @private
 */
shaka.Player.prototype.updateActiveStreams_ = function(stream) {
  goog.asserts.assert(this.manifest_, 'Must not be destroyed');
  var periodIndex =
      shaka.util.StreamUtils.findPeriodContainingStream(this.manifest_, stream);
  if (!this.activeStreamsByPeriod_[periodIndex])
    this.activeStreamsByPeriod_[periodIndex] = {};
  this.activeStreamsByPeriod_[periodIndex][stream.type] = stream.id;
};


/**
 * Destroy members responsible for streaming.
 *
 * @return {!Promise}
 * @private
 */
shaka.Player.prototype.destroyStreaming_ = function() {
  if (this.eventManager_) {
    this.eventManager_.unlisten(this.mediaSource_, 'sourceopen');
    this.eventManager_.unlisten(this.video_, 'loadeddata');
    this.eventManager_.unlisten(this.video_, 'playing');
    this.eventManager_.unlisten(this.video_, 'pause');
    this.eventManager_.unlisten(this.video_, 'ended');
  }

  if (this.video_) {
    this.video_.removeAttribute('src');
    this.video_.load();
  }

  var p = Promise.all([
    this.abrManager_ ? this.abrManager_.stop() : null,
    this.drmEngine_ ? this.drmEngine_.destroy() : null,
    this.mediaSourceEngine_ ? this.mediaSourceEngine_.destroy() : null,
    this.playhead_ ? this.playhead_.destroy() : null,
    this.playheadObserver_ ? this.playheadObserver_.destroy() : null,
    this.streamingEngine_ ? this.streamingEngine_.destroy() : null,
    this.parser_ ? this.parser_.stop() : null,
    this.textDisplayer_ ? this.textDisplayer_.destroy() : null
  ]);

  this.drmEngine_ = null;
  this.mediaSourceEngine_ = null;
  this.playhead_ = null;
  this.playheadObserver_ = null;
  this.streamingEngine_ = null;
  this.parser_ = null;
  this.textDisplayer_ = null;
  this.manifest_ = null;
  this.manifestUri_ = null;
  this.mediaSourceOpen_ = null;
  this.mediaSource_ = null;
  this.pendingTimelineRegions_ = [];
  this.activeStreamsByPeriod_ = {};
  this.stats_ = this.getCleanStats_();

  return p;
};


/**
 * Reset the streaming system.
 * @return {!Promise}
 * @private
 */
shaka.Player.prototype.resetStreaming_ = function() {
  if (!this.parser_) {
    // Nothing is playing, so this is effectively a no-op.
    return Promise.resolve();
  }

  // Destroy the streaming system before we recreate everything.
  return this.destroyStreaming_().then(function() {
    if (this.destroyed_) return;

    // Force an exit from the buffering state.
    this.onBuffering_(false);

    // Start the (potentially slow) process of opening MediaSource now.
    this.mediaSourceOpen_ = this.createMediaSource();
  }.bind(this));
};


/**
 * @return {!Object}
 * @private
 */
shaka.Player.prototype.configOverrides_ = function() {
  return {
    '.drm.servers': '',
    '.drm.clearKeys': '',
    '.drm.advanced': {
      distinctiveIdentifierRequired: false,
      persistentStateRequired: false,
      videoRobustness: '',
      audioRobustness: '',
      serverCertificate: new Uint8Array(0)
    }
  };
};


/**
 * @return {shakaExtern.PlayerConfiguration}
 * @private
 */
shaka.Player.prototype.defaultConfig_ = function() {
  return {
    drm: {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      // These will all be verified by special cases in mergeConfigObjects_():
      servers: {},    // key is arbitrary key system ID, value must be string
      clearKeys: {},  // key is arbitrary key system ID, value must be string
      advanced: {},    // key is arbitrary key system ID, value is a record type
      delayLicenseRequestUntilPlayed: false
    },
    manifest: {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      dash: {
        customScheme: function(node) {
          // Reference node to keep closure from removing it.
          // If the argument is removed, it breaks our function length check
          // in mergeConfigObjects_().
          // TODO: Find a better solution if possible.
          // NOTE: Chrome App Content Security Policy prohibits usage of new
          // Function()

          if (node) return null;
        },
        clockSyncUri: '',
        ignoreDrmInfo: false,
        xlinkFailGracefully: false
      },
      hls: {
        defaultTimeOffset: 0
      }
    },
    streaming: {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      failureCallback:
          this.defaultStreamingFailureCallback_.bind(this),
      rebufferingGoal: 2,
      bufferingGoal: 10,
      bufferBehind: 30,
      ignoreTextStreamFailures: false,
      startAtSegmentBoundary: false,
      smallGapLimit: 0.5,
      jumpLargeGaps: false
    },
    abrFactory: shaka.abr.SimpleAbrManager,
    textDisplayFactory: function(videoElement) {
      return new shaka.text.SimpleTextDisplayer(videoElement);
    }.bind(null, this.video_),
    abr: {
      enabled: true,
      // This is a relatively safe default, since 3G cell connections
      // are faster than this.  For slower connections, such as 2G,
      // the default estimate may be too high.
      defaultBandwidthEstimate: 500e3,  // 500kbps
      switchInterval: 8,
      bandwidthUpgradeTarget: 0.85,
      bandwidthDowngradeTarget: 0.95,
      restrictions: {
        minWidth: 0,
        maxWidth: Infinity,
        minHeight: 0,
        maxHeight: Infinity,
        minPixels: 0,
        maxPixels: Infinity,
        minBandwidth: 0,
        maxBandwidth: Infinity
      }
    },
    preferredAudioLanguage: '',
    preferredTextLanguage: '',
    restrictions: {
      minWidth: 0,
      maxWidth: Infinity,
      minHeight: 0,
      maxHeight: Infinity,
      minPixels: 0,
      maxPixels: Infinity,
      minBandwidth: 0,
      maxBandwidth: Infinity
    },
    playRangeStart: 0,
    playRangeEnd: Infinity
  };
};


/**
 * @param {!shaka.util.Error} error
 * @private
 */
shaka.Player.prototype.defaultStreamingFailureCallback_ = function(error) {
  var retryErrorCodes = [
    shaka.util.Error.Code.BAD_HTTP_STATUS,
    shaka.util.Error.Code.HTTP_ERROR,
    shaka.util.Error.Code.TIMEOUT
  ];

  if (this.isLive() && this.infiniteRetriesForLiveStreams_ &&
      retryErrorCodes.indexOf(error.code) >= 0) {
    error.severity = shaka.util.Error.Severity.RECOVERABLE;

    shaka.log.warning('Live streaming error.  Retrying automatically...');
    this.retryStreaming();
  }
};


/**
 * @return {shakaExtern.Stats}
 * @private
 */
shaka.Player.prototype.getCleanStats_ = function() {
  return {
    // These are not tracked in the private stats structure and are only here to
    // satisfy the compiler.
    width: NaN,
    height: NaN,
    streamBandwidth: NaN,
    decodedFrames: NaN,
    droppedFrames: NaN,
    estimatedBandwidth: NaN,

    // These are tracked in the private stats structure to avoid the need for
    // many private member variables.
    loadLatency: NaN,
    playTime: 0,
    bufferingTime: 0,
    switchHistory: [],
    stateHistory: []
  };
};


/**
 * Filters a list of periods.
 * @param {!Array.<!shakaExtern.Period>} periods
 * @private
 */
shaka.Player.prototype.filterAllPeriods_ = function(periods) {
  goog.asserts.assert(this.video_, 'Must not be destroyed');
  var StreamUtils = shaka.util.StreamUtils;

  var activeStreams =
      this.streamingEngine_ ? this.streamingEngine_.getActiveStreams() : {};
  periods.forEach(function(period) {
    StreamUtils.filterNewPeriod(this.drmEngine_, activeStreams, period);
  }.bind(this));

  var validPeriodsCount = 0;
  periods.forEach(function(period) {
    if (StreamUtils.getPlayableVariants(period.variants).length > 0)
      validPeriodsCount++;
  }.bind(this));

  // If no periods is playable, throw CONTENT_UNSUPPORTED_BY_BROWSER.
  // If only some of the periods are playable, throw UNPLAYABLE_PERIOD.
  if (validPeriodsCount == 0) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.CONTENT_UNSUPPORTED_BY_BROWSER);
  } else if (validPeriodsCount < periods.length) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.UNPLAYABLE_PERIOD);
  }

  periods.forEach(function(period) {
    var tracksChanged = shaka.util.StreamUtils.applyRestrictions(
        period, this.config_.restrictions, this.maxHwRes_);
    if (tracksChanged && this.streamingEngine_ &&
        this.streamingEngine_.getCurrentPeriod() == period) {
      this.onTracksChanged_();
    }

    var allVariantsRestricted =
        StreamUtils.getPlayableVariants(period.variants).length < 1;

    if (allVariantsRestricted) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.RESTRICTIONS_CANNOT_BE_MET);
    }
  }.bind(this));
};


/**
 * Filters a new period.
 * @param {shakaExtern.Period} period
 * @private
 */
shaka.Player.prototype.filterNewPeriod_ = function(period) {
  goog.asserts.assert(this.video_, 'Must not be destroyed');
  var StreamUtils = shaka.util.StreamUtils;

  var activeStreams =
      this.streamingEngine_ ? this.streamingEngine_.getActiveStreams() : {};
  StreamUtils.filterNewPeriod(this.drmEngine_, activeStreams, period);

  // Check for playable variants before restrictions to give a different error
  // if we have restricted all the tracks rather than there being none.
  var hasPlayableVariants =
      StreamUtils.getPlayableVariants(period.variants).length > 0;

  var tracksChanged = shaka.util.StreamUtils.applyRestrictions(
      period, this.config_.restrictions, this.maxHwRes_);
  if (tracksChanged && this.streamingEngine_ &&
      this.streamingEngine_.getCurrentPeriod() == period) {
    this.onTracksChanged_();
  }

  // Check for playable variants again. If the first check found variants, but
  // not the second, then all variants are restricted.
  var allVariantsRestricted =
      StreamUtils.getPlayableVariants(period.variants).length < 1;

  if (!hasPlayableVariants) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.UNPLAYABLE_PERIOD);
  } else if (allVariantsRestricted) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.RESTRICTIONS_CANNOT_BE_MET);
  }
};


/**
 * Switches to the given variant, deferring if needed.
 * @param {shakaExtern.Variant} variant
 * @param {boolean=} opt_clearBuffer
 * @private
 */
shaka.Player.prototype.switchVariant_ =
    function(variant, opt_clearBuffer) {
  if (this.switchingPeriods_) {
    // Store this action for later.
    this.deferredVariant_ = variant;
    this.deferredVariantClearBuffer_ = opt_clearBuffer || false;
  } else {
    // Act now.
    this.streamingEngine_.switchVariant(variant, opt_clearBuffer || false);
  }
};


/**
 * Switches to the given text stream, deferring if needed.
 * @param {shakaExtern.Stream} textStream
 * @private
 */
shaka.Player.prototype.switchTextStream_ = function(textStream) {
  if (this.switchingPeriods_) {
    // Store this action for later.
    this.deferredTextStream_ = textStream;
  } else {
    // Act now.
    this.streamingEngine_.switchTextStream(textStream);
  }
};


/**
 * Verifies that the active streams according to the player match those in
 * StreamingEngine.
 * @private
 */
shaka.Player.prototype.assertCorrectActiveStreams_ = function() {
  if (!this.streamingEngine_ || !this.manifest_ || !goog.DEBUG) return;
  var StreamUtils = shaka.util.StreamUtils;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  var streamingActive = this.streamingEngine_.getActiveStreams();
  var mainStream =
      streamingActive[ContentType.VIDEO] || streamingActive[ContentType.AUDIO];
  if (!mainStream)
    return;

  var streamingPeriodIndex =
      StreamUtils.findPeriodContainingStream(this.manifest_, mainStream);
  var currentPeriodIndex =
      this.manifest_.periods.indexOf(this.streamingEngine_.getCurrentPeriod());
  if (streamingPeriodIndex < 0 || streamingPeriodIndex != currentPeriodIndex)
    return;

  var playerActive = this.activeStreamsByPeriod_[currentPeriodIndex] || {};
  for (var type in streamingActive) {
    var activeId = streamingActive[type].id;

    if (type == ContentType.TEXT) {
      if (this.deferredTextStream_)
        activeId = this.deferredTextStream_.id;
    } else if (type == ContentType.AUDIO) {
      if (this.deferredVariant_)
        activeId = this.deferredVariant_.audio.id;
    } else if (type == ContentType.VIDEO) {
      if (this.deferredVariant_)
        activeId = this.deferredVariant_.video.id;
    }

    goog.asserts.assert(activeId == playerActive[type],
                        'Inconsistent active stream');
  }
};


/** @private */
shaka.Player.prototype.updateTimeStats_ = function() {
  // Only count while we're loaded.
  if (!this.manifest_)
    return;

  var now = Date.now() / 1000;
  if (this.buffering_)
    this.stats_.bufferingTime += (now - this.lastTimeStatsUpdateTimestamp_);
  else
    this.stats_.playTime += (now - this.lastTimeStatsUpdateTimestamp_);

  this.lastTimeStatsUpdateTimestamp_ = now;
};


/**
 * @param {number} time
 * @return {number}
 * @private
 */
shaka.Player.prototype.adjustStartTime_ = function(time) {
  var activeStreams = this.streamingEngine_.getActiveStreams();
  var period = this.streamingEngine_.getCurrentPeriod();

  // This method is called after StreamingEngine.init resolves, this means that
  // all the active streams have had createSegmentIndex called.
  function getAdjustedTime(stream, time) {
    if (!stream) return null;
    var idx = stream.findSegmentPosition(time - period.startTime);
    if (idx == null) return null;
    var ref = stream.getSegmentReference(idx);
    if (!ref) return null;
    var refTime = ref.startTime + period.startTime;
    goog.asserts.assert(refTime <= time, 'Segment should start before time');
    return refTime;
  }

  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var videoStartTime = getAdjustedTime(activeStreams[ContentType.VIDEO], time);
  var audioStartTime = getAdjustedTime(activeStreams[ContentType.AUDIO], time);

  // If we have both video and audio times, pick the larger one.  If we picked
  // the smaller one, that one will download an entire segment to buffer the
  // difference.
  if (videoStartTime != null && audioStartTime != null)
    return Math.max(videoStartTime, audioStartTime);
  else if (videoStartTime != null)
    return videoStartTime;
  else if (audioStartTime != null)
    return audioStartTime;
  else
    return time;
};


/**
 * Callback from NetworkingEngine.
 *
 * @param {number} deltaTimeMs
 * @param {number} numBytes
 * @private
 */
shaka.Player.prototype.onSegmentDownloaded_ = function(deltaTimeMs, numBytes) {
  if (this.abrManager_) {
    // Abr manager might not exist during offline storage.
    this.abrManager_.segmentDownloaded(deltaTimeMs, numBytes);
  }
};


/**
 * Callback from PlayheadObserver.
 *
 * @param {boolean} buffering
 * @private
 */
shaka.Player.prototype.onBuffering_ = function(buffering) {
  // Before setting |buffering_|, update the time spent in the previous state.
  this.updateTimeStats_();
  this.buffering_ = buffering;
  this.updateState_();

  if (this.playhead_)
    this.playhead_.setBuffering(buffering);

  var event = new shaka.util.FakeEvent('buffering', { 'buffering': buffering });
  this.dispatchEvent(event);
};


/**
 * Callback from PlayheadObserver.
 * @private
 */
shaka.Player.prototype.onChangePeriod_ = function() {
  this.onTracksChanged_();
};


/**
 * Called from potential initiators of state change, or before returning stats
 * to the user.
 *
 * This method decides if state has actually changed, updates the last entry,
 * and adds a new one if needed.
 *
 * @private
 */
shaka.Player.prototype.updateState_ = function() {
  if (this.destroyed_) return;

  var newState;
  if (this.buffering_) {
    newState = 'buffering';
  } else if (this.video_.ended) {
    newState = 'ended';
  } else if (this.video_.paused) {
    newState = 'paused';
  } else {
    newState = 'playing';
  }

  var now = Date.now() / 1000;
  if (this.stats_.stateHistory.length) {
    var lastIndex = this.stats_.stateHistory.length - 1;
    var lastEntry = this.stats_.stateHistory[lastIndex];
    lastEntry.duration = now - lastEntry.timestamp;

    if (newState == lastEntry.state) {
      // The state has not changed, so do not add anything to the history.
      return;
    }
  }

  this.stats_.stateHistory.push({
    timestamp: now,
    state: newState,
    duration: 0
  });
};


/**
 * Callback from Playhead.
 *
 * @private
 */
shaka.Player.prototype.onSeek_ = function() {
  if (this.playheadObserver_)
    this.playheadObserver_.seeked();
  if (this.streamingEngine_)
    this.streamingEngine_.seeked();
};


/**
 * Choose a variant through ABR manager.
 * On error, dispatches an error event and returns null.
 *
 * @param {!Array.<shakaExtern.Variant>} variants
 * @return {?shakaExtern.Variant}
 * @private
 */
shaka.Player.prototype.chooseVariant_ = function(variants) {
  goog.asserts.assert(this.config_, 'Must not be destroyed');

  if (!variants || !variants.length) {
    this.onError_(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.RESTRICTIONS_CANNOT_BE_MET));
    return null;
  }

  // Update abr manager with newly filtered variants.
  this.abrManager_.setVariants(variants);

  // Backward compatibility for the AbrManager plugin interface.
  if (this.abrManager_['chooseStreams']) {
    shaka.log.alwaysWarn('AbrManager API has changed. ' +
        'AbrManager.chooseStreams() is deprecated. ' +
        'Please implement AbrManager.chooseVariant() to upgrade. ' +
        'The old API will be removed in v2.3.');

    var ContentType = shaka.util.ManifestParserUtils.ContentType;
    var mediaTypesToUpdate = ['video', 'audio'];
    var chosen = this.abrManager_['chooseStreams'](mediaTypesToUpdate);
    var chosenVariant = shaka.util.StreamUtils.getVariantByStreams(
        chosen[ContentType.AUDIO], chosen[ContentType.VIDEO], variants);
    return chosenVariant;
  }

  return this.abrManager_.chooseVariant();
};


/**
 * Chooses streams from the given Period and switches to them.
 * Called after a config change, a new text stream, a key status event, or an
 * explicit language change.
 *
 * @param {!shakaExtern.Period} period
 * @param {!boolean} clearBuffer
 * @private
 */
shaka.Player.prototype.chooseStreamsAndSwitch_ = function(period, clearBuffer) {
  goog.asserts.assert(this.config_, 'Must not be destroyed');

  var variants = shaka.util.StreamUtils.filterVariantsByLanguageAndRole(
      period, this.currentAudioLanguage_, this.currentVariantRole_);
  var textStreams = shaka.util.StreamUtils.filterTextStreamsByLanguageAndRole(
      period, this.currentTextLanguage_, this.currentTextRole_);

  // Because we're running this after a config change (manual language change),
  // a new text stream, or a key status event, and because switching to an
  // active stream is a no-op, it is always okay to clear the buffer here.
  var chosenVariant = this.chooseVariant_(variants);
  if (chosenVariant) {
    this.addVariantToSwitchHistory_(chosenVariant, /* fromAdaptation */ true);
    this.switchVariant_(chosenVariant, clearBuffer);
  }

  var chosenText = textStreams[0];
  if (chosenText) {
    this.addTextStreamToSwitchHistory_(chosenText, /* fromAdaptation */ true);
    this.switchTextStream_(chosenText);
  }

  // Send an adaptation event so that the UI can show the new language/tracks.
  this.onAdaptation_();
};


/**
 * Callback from StreamingEngine, invoked when a period starts.
 *
 * @param {!shakaExtern.Period} period
 * @return {shaka.media.StreamingEngine.ChosenStreams} An object containing the
 *   chosen variant and text stream.
 * @private
 */
shaka.Player.prototype.onChooseStreams_ = function(period) {
  shaka.log.debug('onChooseStreams_', period);
  goog.asserts.assert(this.config_, 'Must not be destroyed');

  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var StreamUtils = shaka.util.StreamUtils;

  // We are switching Periods, so the AbrManager will be disabled.  But if we
  // want to abr.enabled, we do not want to call AbrManager.enable before
  // canSwitch_ is called.
  this.switchingPeriods_ = true;
  this.abrManager_.disable();

  shaka.log.debug('Choosing new streams after period changed');

  // Create empty object first and initialize the fields through
  // [] to allow field names to be expressions.
  // TODO: this feedback system for language matches could be cleaned up
  var languageMatches = {};
  languageMatches[ContentType.AUDIO] = false;
  languageMatches[ContentType.TEXT] = false;

  var variants = StreamUtils.filterVariantsByLanguageAndRole(
      period, this.currentAudioLanguage_, this.currentVariantRole_,
      languageMatches);

  var textStreams = StreamUtils.filterTextStreamsByLanguageAndRole(
      period, this.currentTextLanguage_, this.currentTextRole_,
      languageMatches);

  shaka.log.v2('onChooseStreams_, variants and text streams: ',
               variants, textStreams);

  var chosenVariant = this.chooseVariant_(variants);
  var chosenTextStream = textStreams[0] || null;

  shaka.log.v2('onChooseStreams_, chosen=', chosenVariant, chosenTextStream);

  // Ignore deferred variant or text streams.  We are starting a new period,
  // so any deferred switches must logically have been from an older period.
  // Verify this in uncompiled mode.
  if (goog.DEBUG) {
    var deferredPeriodIndex;
    var deferredPeriod;

    // This assertion satisfies a compiler nullability check below.
    goog.asserts.assert(this.manifest_, 'Manifest should exist!');

    if (this.deferredVariant_) {
      deferredPeriodIndex = StreamUtils.findPeriodContainingVariant(
          this.manifest_, this.deferredVariant_);
      deferredPeriod = this.manifest_.periods[deferredPeriodIndex];
      goog.asserts.assert(
          deferredPeriod != period,
          'Mistakenly ignoring deferred variant from the same period!');
    }

    if (this.deferredTextStream_) {
      deferredPeriodIndex = StreamUtils.findPeriodContainingStream(
          this.manifest_, this.deferredTextStream_);
      deferredPeriod = this.manifest_.periods[deferredPeriodIndex];
      goog.asserts.assert(
          deferredPeriod != period,
          'Mistakenly ignoring deferred text stream from the same period!');
    }
  }
  this.deferredVariant_ = null;
  this.deferredTextStream_ = null;

  if (chosenVariant) {
    this.addVariantToSwitchHistory_(chosenVariant, /* fromAdaptation */ true);
  }
  if (chosenTextStream) {
    this.addTextStreamToSwitchHistory_(
        chosenTextStream, /* fromAdaptation */ true);

    // If audio and text tracks have different languages, and the text track
    // matches the user's preference, then show the captions.  Only do this
    // when we are choosing the initial tracks during startup.
    var startingUp = !this.streamingEngine_.getActivePeriod();
    if (startingUp) {
      if (chosenVariant && chosenVariant.audio &&
          languageMatches[ContentType.TEXT] &&
          chosenTextStream.language != chosenVariant.audio.language) {
        this.textDisplayer_.setTextVisibility(true);
        this.onTextTrackVisibility_();
      }
    }
  }

  // Don't fire a tracks-changed event since we aren't inside the new Period
  // yet.
  return { variant: chosenVariant, text: chosenTextStream };
};


/**
 * Callback from StreamingEngine, invoked when the period is set up.
 *
 * @private
 */
shaka.Player.prototype.canSwitch_ = function() {
  shaka.log.debug('canSwitch_');
  goog.asserts.assert(this.config_, 'Must not be destroyed');

  this.switchingPeriods_ = false;

  if (this.config_.abr.enabled)
    this.abrManager_.enable();

  // If we still have deferred switches, switch now.
  if (this.deferredVariant_) {
    this.streamingEngine_.switchVariant(
        this.deferredVariant_, this.deferredVariantClearBuffer_);
    this.deferredVariant_ = null;
  }
  if (this.deferredTextStream_) {
    this.streamingEngine_.switchTextStream(this.deferredTextStream_);
    this.deferredTextStream_ = null;
  }
};


/**
 * Callback from StreamingEngine.
 *
 * @private
 */
shaka.Player.prototype.onManifestUpdate_ = function() {
  if (this.parser_ && this.parser_.update)
    this.parser_.update();
};


/**
 * Callback from StreamingEngine.
 *
 * @private
 */
shaka.Player.prototype.onSegmentAppended_ = function() {
  if (this.playhead_)
    this.playhead_.onSegmentAppended();
};


/**
 * Callback from AbrManager.
 *
 * @param {shakaExtern.Variant} variant
 * @param {boolean=} opt_clearBuffer
 * @private
 */
shaka.Player.prototype.switch_ = function(variant, opt_clearBuffer) {
  shaka.log.debug('switch_');
  goog.asserts.assert(this.config_.abr.enabled,
      'AbrManager should not call switch while disabled!');
  goog.asserts.assert(!this.switchingPeriods_,
      'AbrManager should not call switch while transitioning between Periods!');

  this.addVariantToSwitchHistory_(variant, /* fromAdaptation */ true);

  if (!this.streamingEngine_) {
    // There's no way to change it.
    return;
  }

  this.streamingEngine_.switchVariant(variant, opt_clearBuffer || false);
  this.onAdaptation_();
};


/**
 * Callback from v2.1 or v2.0 AbrManager plugins, for backward compatibility.
 * To be removed in v2.3.
 *
 * @param {!Object.<shaka.util.ManifestParserUtils.ContentType,
 *                  !shakaExtern.Stream>} streamsByType
 * @param {boolean=} opt_clearBuffer
 * @private
 */
shaka.Player.prototype.switchV21_ = function(streamsByType, opt_clearBuffer) {
  if (!this.streamingEngine_) {
    // There's no way to change it.
    return;
  }

  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var activePeriod = this.streamingEngine_.getActivePeriod();

  var variant = shaka.util.StreamUtils.getVariantByStreams(
      streamsByType[ContentType.AUDIO], streamsByType[ContentType.VIDEO],
      activePeriod ? activePeriod.variants : []);

  goog.asserts.assert(variant, 'Could not find variant to switch!');
  if (variant) {
    this.switch_(variant, opt_clearBuffer);
  }
};


/**
 * Dispatches a 'adaptation' event.
 * @private
 */
shaka.Player.prototype.onAdaptation_ = function() {
  // In the next frame, dispatch a 'adaptation' event.
  // This gives StreamingEngine time to absorb the changes before the user
  // tries to query them.
  Promise.resolve().then(function() {
    if (this.destroyed_) return;
    var event = new shaka.util.FakeEvent('adaptation');
    this.dispatchEvent(event);
  }.bind(this));
};


/**
 * Dispatches a 'trackschanged' event.
 * @private
 */
shaka.Player.prototype.onTracksChanged_ = function() {
  // In the next frame, dispatch a 'trackschanged' event.
  // This gives StreamingEngine time to absorb the changes before the user
  // tries to query them.
  Promise.resolve().then(function() {
    if (this.destroyed_) return;
    var event = new shaka.util.FakeEvent('trackschanged');
    this.dispatchEvent(event);
  }.bind(this));
};


/** @private */
shaka.Player.prototype.onTextTrackVisibility_ = function() {
  var event = new shaka.util.FakeEvent('texttrackvisibility');
  this.dispatchEvent(event);
};


/**
 * @param {!shaka.util.Error} error
 * @private
 */
shaka.Player.prototype.onError_ = function(error) {
  // Errors dispatched after destroy is called are irrelevant.
  if (this.destroyed_) return;

  goog.asserts.assert(error instanceof shaka.util.Error, 'Wrong error type!');

  var event = new shaka.util.FakeEvent('error', { 'detail': error });
  this.dispatchEvent(event);
  if (event.defaultPrevented) {
    error.handled = true;
  }
};


/**
 * @param {shakaExtern.TimelineRegionInfo} region
 * @private
 */
shaka.Player.prototype.onTimelineRegionAdded_ = function(region) {
  if (this.playheadObserver_) {
    this.playheadObserver_.addTimelineRegion(region);
  } else {
    this.pendingTimelineRegions_.push(region);
  }
};


/**
 * @param {!Event} event
 * @private
 */
shaka.Player.prototype.onEvent_ = function(event) {
  this.dispatchEvent(event);
};


/**
 * @param {!Event} event
 * @private
 */
shaka.Player.prototype.onVideoError_ = function(event) {
  if (!this.video_.error) return;

  var code = this.video_.error.code;
  if (code == 1 /* MEDIA_ERR_ABORTED */) {
    // Ignore this error code, which should only occur when navigating away or
    // deliberately stopping playback of HTTP content.
    return;
  }

  // Extra error information from MS Edge and IE11:
  var extended = this.video_.error.msExtendedCode;
  if (extended) {
    // Convert to unsigned:
    if (extended < 0) {
      extended += Math.pow(2, 32);
    }
    // Format as hex:
    extended = extended.toString(16);
  }

  // Extra error information from Chrome:
  var message = this.video_.error.message;

  this.onError_(new shaka.util.Error(
      shaka.util.Error.Severity.CRITICAL,
      shaka.util.Error.Category.MEDIA,
      shaka.util.Error.Code.VIDEO_ERROR,
      code, extended, message));
};


/**
 * @param {!Object.<string, string>} keyStatusMap A map of hex key IDs to
 *   statuses.
 * @private
 */
shaka.Player.prototype.onKeyStatus_ = function(keyStatusMap) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  goog.asserts.assert(this.streamingEngine_, 'Should have been initialized.');
  // 'usable', 'released', 'output-downscaled', 'status-pending' are statuses
  // of the usable keys.
  // 'expired' status is being handled separately in DrmEngine.
  var restrictedStatuses = ['output-restricted', 'internal-error'];

  var period = this.streamingEngine_.getCurrentPeriod();
  var tracksChanged = false;

  // If EME is using a synthetic key, the only key is '00' (a single 0 byte).
  // In this case, it is only used to report global success/failure.
  // See note about old platforms in: https://goo.gl/KtQMja
  var isGlobalStatus = Object.keys(keyStatusMap).length == 1 &&
      Object.keys(keyStatusMap)[0] == '00';

  if (isGlobalStatus) {
    shaka.log.warning(
        'Got a synthetic key status event, so we don\'t know the real key ' +
        'statuses. If we don\'t have all the keys, you\'ll need to set ' +
        'restrictions so we don\'t select those tracks.');
  }

  period.variants.forEach(function(variant) {
    var streams = [];
    if (variant.audio) streams.push(variant.audio);
    if (variant.video) streams.push(variant.video);

    streams.forEach(function(stream) {
      var originalAllowed = variant.allowedByKeySystem;

      // Only update if we have a key ID for the stream.  If the key isn't
      // present, then we don't have that key and it should be restricted.
      if (stream.keyId) {
        var keyStatus = keyStatusMap[isGlobalStatus ? '00' : stream.keyId];
        variant.allowedByKeySystem =
            !!keyStatus && restrictedStatuses.indexOf(keyStatus) < 0;
      }

      if (originalAllowed != variant.allowedByKeySystem) {
        tracksChanged = true;
      }
    });
  });

  // TODO: Get StreamingEngine to track variants and create getActiveVariant()
  var activeStreams = this.streamingEngine_.getActiveStreams();
  var activeVariant = shaka.util.StreamUtils.getVariantByStreams(
      activeStreams[ContentType.AUDIO], activeStreams[ContentType.VIDEO],
      period.variants);
  if (activeVariant && !activeVariant.allowedByKeySystem) {
    shaka.log.debug('Choosing new streams after key status changed');
    this.chooseStreamsAndSwitch_(period, true);
  }

  if (tracksChanged)
    this.onTracksChanged_();
};


/**
 * Callback from DrmEngine
 * @param {string} keyId
 * @param {number} expiration
 * @private
 */
shaka.Player.prototype.onExpirationUpdated_ = function(keyId, expiration) {
  if (this.parser_ && this.parser_.onExpirationUpdated)
    this.parser_.onExpirationUpdated(keyId, expiration);

  var event = new shaka.util.FakeEvent('expirationupdated');
  this.dispatchEvent(event);
};
