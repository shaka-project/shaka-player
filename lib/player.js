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
goog.require('shaka.abr.EwmaBandwidthEstimator');
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

  /** @private {TextTrack} */
  this.textTrack_ = null;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {shakaExtern.AbrManager} */
  this.defaultAbrManager_ = new shaka.abr.SimpleAbrManager();

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

  /**
   * @private {!Object.<shaka.util.ManifestParserUtils.ContentType, {
   *   stream: shakaExtern.Stream,
   *   clearBuffer: boolean
   * }>}
   */
  this.deferredSwitches_ = {};

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
    this.textTrack_ = null;
    this.eventManager_ = null;
    this.defaultAbrManager_ = null;
    this.networkingEngine_ = null;
    this.config_ = null;

    return p;
  }.bind(this));
};


/**
 * @define {string} A version number taken from git at compile time.
 */
goog.define('GIT_VERSION', 'v2.1.0-debug');


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
 *   'code' properties will identify the specific error that occured.  In an
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
      filterPeriod: this.filterPeriod_.bind(this),
      onTimelineRegionAdded: this.onTimelineRegionAdded_.bind(this),
      onEvent: this.onEvent_.bind(this),
      onError: this.onError_.bind(this)
    };

    if (this.parser_.start.length > 2) {
      goog.asserts.assert(false, 'Old ManifestParser interface is deprecated');
      shaka.log.warning(
          'The ManifestParser interface has changed. Please upgrade your ' +
          'plugin to accept the PlayerInterface structure. See the ' +
          'ManifestParser documentation for details.');
      // Use a string index here so the compiler doesn't complain about the
      // incorrect arguments.
      return this.parser_['start'](
          manifestUri, this.networkingEngine_, playerInterface.filterPeriod,
          playerInterface.onError, playerInterface.onEvent);
    }

    return this.parser_.start(manifestUri, playerInterface);
  }.bind(this)).then(function(manifest) {

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
    this.manifest_.periods.forEach(this.filterPeriod_.bind(this));

    this.lastTimeStatsUpdateTimestamp_ = Date.now() / 1000;

    // Copy preferred languages from the config again, in case the config was
    // changed between construction and playback.
    this.currentAudioLanguage_ = this.config_.preferredAudioLanguage;
    this.currentTextLanguage_ = this.config_.preferredTextLanguage;

    // Wait for MediaSource to open before continuing.
    return Promise.all([
      this.drmEngine_.attach(this.video_),
      this.mediaSourceOpen_
    ]);
  }.bind(this)).then(function() {
    this.config_.abr.manager.init(this.switch_.bind(this));

    // MediaSource is open, so create the Playhead, MediaSourceEngine, and
    // StreamingEngine.
    this.playhead_ = this.createPlayhead(opt_startTime);
    this.playheadObserver_ = this.createPlayheadObserver();
    this.mediaSourceEngine_ = this.createMediaSourceEngine();

    this.streamingEngine_ = this.createStreamingEngine();
    this.streamingEngine_.configure(this.config_.streaming);

    return this.streamingEngine_.init();
  }.bind(this)).then(function() {
    if (this.config_.streaming.startAtSegmentBoundary) {
      var time = this.adjustStartTime_(this.playhead_.getTime());
      this.playhead_.setStartTime(time);
    }

    // Re-filter the manifest after streams have been chosen.
    this.manifest_.periods.forEach(this.filterPeriod_.bind(this));
    // Dispatch a 'trackschanged' event now that all initial filtering is done.
    this.onTracksChanged_();
    // Since the first streams just became active, send an adaptation event.
    this.onAdaptation_();

    // Now that we've filtered out variants that aren't compatible with the
    // active one, update abr manager with filtered variants for the current
    // period.
    var currentPeriod = this.streamingEngine_.getCurrentPeriod();
    var variants = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
        currentPeriod, this.currentAudioLanguage_);
    this.config_.abr.manager.setVariants(variants);

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
 * Creates a new instance of DrmEngine.  This can be replaced by tests to
 * create fake instances instead.
 *
 * @return {!shaka.media.DrmEngine}
 */
shaka.Player.prototype.createDrmEngine = function() {
  goog.asserts.assert(this.networkingEngine_, 'Must not be destroyed');
  return new shaka.media.DrmEngine(
      this.networkingEngine_,
      this.onError_.bind(this),
      this.onKeyStatus_.bind(this),
      this.onExpirationUpdated_.bind(this));
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
  return new shaka.media.Playhead(
      this.video_, this.manifest_, this.config_.streaming,
      opt_startTime || null, this.onSeek_.bind(this), this.onEvent_.bind(this));
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
      this.video_, this.manifest_, this.config_.streaming,
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
      this.video_, this.mediaSource_, this.textTrack_);
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
    onSegmentAppended: this.onSegmentAppended_.bind(this)
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

  if (config.abr && config.abr.manager &&
      config.abr.manager != this.config_.abr.manager) {
    this.config_.abr.manager.stop();
    config.abr.manager.init(this.switch_.bind(this));
  }

  shaka.util.ConfigUtils.mergeConfigObjects(
      this.config_, config, this.defaultConfig_(), this.configOverrides_(), '');

  this.applyConfig_();
};


/**
 * Apply config changes.
 * @private
 */
shaka.Player.prototype.applyConfig_ = function() {
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
      // this.filterPeriod_() may throw.
      this.manifest_.periods.forEach(this.filterPeriod_.bind(this));
    } catch (error) {
      this.onError_(error);
    }

    // May need to choose new streams.
    shaka.log.debug('Choosing new streams after changing configuration');
    var period = this.streamingEngine_.getCurrentPeriod();
    this.chooseStreamsAndSwitch_(period);
  }

  // Simply enable/disable ABR with each call, since multiple calls to these
  // methods have no effect.
  if (this.config_.abr.enabled && !this.switchingPeriods_) {
    this.config_.abr.manager.enable();
  } else {
    this.config_.abr.manager.disable();
  }

  this.config_.abr.manager.setDefaultEstimate(
      this.config_.abr.defaultBandwidthEstimate);
  this.config_.abr.manager.setRestrictions(this.config_.abr.restrictions);
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
  var config = this.defaultConfig_();

  if (config.abr && config.abr.manager &&
      config.abr.manager != this.config_.abr.manager) {
    this.config_.abr.manager.stop();
    config.abr.manager.init(this.switch_.bind(this));
  }

  // Don't call mergeConfigObjects_(), since that would not reset open-ended
  // dictionaries like drm.servers.
  this.config_ = this.defaultConfig_();

  this.applyConfig_();
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
 * Return a list of variant and text tracks available for the current Period.
 * If there are multiple Periods, then you must seek to the Period before
 * being able to switch.
 *
 * @return {!Array.<shakaExtern.Track>}
 * @export
 * @deprecated Use getVariantTracks() or getTextTracks()
 */
shaka.Player.prototype.getTracks = function() {
  shaka.log.warning('shaka.Player.getTracks() is being deprecated and will ' +
                    'be removed in v2.2. Use getVariantTracks() to get a ' +
                    'list of variant tracks or getTextTracks() for text.');

  var tracks = this.getVariantTracks();
  return tracks.concat(this.getTextTracks());
};


/**
 * Select a specific track.  For variant tracks, this disables adaptation.
 * Note that AdaptationEvents are not fired for manual track selections.
 *
 * @param {shakaExtern.Track} track
 * @param {boolean=} opt_clearBuffer
 * @export
 * @deprecated Use selectVariantTrack() or selectTextTrack()
 */
shaka.Player.prototype.selectTrack = function(track, opt_clearBuffer) {
  shaka.log.warning('shaka.Player.selectTrack() is being deprecated and will ' +
                    'be removed in v2.2. Use selectVariantTrack() to select ' +
                    'a new variant track or selectTextTrack() for text.');

  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (track.type == ContentType.TEXT) {
    this.selectTextTrack(track);
  } else {
    // Disable ABR for variant track changes.
    var config = {abr: {enabled: false}};
    this.configure(config);
    this.selectVariantTrack(track, opt_clearBuffer);
  }
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
      this.manifest_.periods[currentPeriod], activeStreams[ContentType.AUDIO],
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
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  var period = this.streamingEngine_.getCurrentPeriod();
  var stream = StreamUtils.findTextStreamForTrack(period, track);

  if (!stream) {
    shaka.log.error('Unable to find the track with id "' + track.id +
                    '"; did we change Periods?');
    return;
  }

  this.addToSwitchHistory_(stream, /* fromAdaptation */ false);

  // Create empty object first and initialize the fields through
  // [] to allow field names to be expressions.
  var streamsToSwitch = {};
  streamsToSwitch[ContentType.TEXT] = stream;
  this.deferredSwitch_(streamsToSwitch, /* opt_clearBuffer */ true);
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
    shaka.log.warning('Changing tracks while abr manager is enabled will ' +
                      'likely result in the selected track being overriden. ' +
                      'Consider disabling abr before calling ' +
                      'selectVariantTrack().');
  }

  var StreamUtils = shaka.util.StreamUtils;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var streamsToSwitch = {};

  var period = this.streamingEngine_.getCurrentPeriod();
  var variant = StreamUtils.findVariantForTrack(period, track);
  var activeStreams = this.streamingEngine_.getActiveStreams();
  if (variant) {
    // Double check that the track is allowed to be played.
    // The track list should only contain playable variants,
    // but if resctrictions change and selectVariantTrack()
    // is called before the track list is updated, we could
    // get a now-restricted variant.
    var variantIsPlayable = StreamUtils.isPlayable(variant);
    if (!variantIsPlayable) {
      shaka.log.error('Unable to switch to track with id "' + track.id +
                      '" because it is restricted.');
      return;
    }

    if (variant.audio) {
      // Update active streams even if we're not switching
      // in case active streams haven't been set up yet.
      this.updateActiveStreams_(variant.audio);
      if (variant.audio != activeStreams[ContentType.AUDIO])
        streamsToSwitch[ContentType.AUDIO] = variant.audio;
    }
    if (variant.video) {
      this.updateActiveStreams_(variant.video);
      if (variant.video != activeStreams[ContentType.VIDEO])
        streamsToSwitch[ContentType.VIDEO] = variant.video;
    }
  }

  // Add entries to the history.
  shaka.util.MapUtils.values(streamsToSwitch).forEach(function(stream) {
    this.addToSwitchHistory_(stream, /* fromAdaptation */ false);
  }.bind(this));

  // Save current text stream to ensure that it doesn't get overridden
  // by a default one inside shaka.Player.configure()
  var currentTextStream = activeStreams[ContentType.TEXT];

  if (currentTextStream) {
    streamsToSwitch[ContentType.TEXT] = currentTextStream;
  }

  this.deferredSwitch_(streamsToSwitch, opt_clearBuffer);
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
 * @export
 */
shaka.Player.prototype.selectAudioLanguage = function(language) {
  if (!this.streamingEngine_) return;
  var period = this.streamingEngine_.getCurrentPeriod();
  this.currentAudioLanguage_ = language;
  this.chooseStreamsAndSwitch_(period);
};


/**
 * Sets currentTextLanguage to the selected language and chooses
 * new text stream in that language if need be.
 *
 * @param {!string} language
 * @export
 */
shaka.Player.prototype.selectTextLanguage = function(language) {
  if (!this.streamingEngine_) return;
  var period = this.streamingEngine_.getCurrentPeriod();
  this.currentTextLanguage_ = language;
  this.chooseStreamsAndSwitch_(period);
};


/**
 * @return {boolean} True if the current text track is visible.
 * @export
 */
shaka.Player.prototype.isTextTrackVisible = function() {
  return this.textTrack_.mode == 'showing';
};


/**
 * Set the visibility of the current text track, if any.
 *
 * @param {boolean} on
 * @export
 */
shaka.Player.prototype.setTextTrackVisibility = function(on) {
  this.textTrack_.mode = on ? 'showing' : 'hidden';
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
      'getPlayheadTimeInUTC should be called on a live stream!');
  var time =
      this.manifest_.presentationTimeline.getPresentationStartTime() * 1000 +
      this.video_.currentTime * 1000;

  return new Date(time);
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
  var videoInfo = this.video_ && this.video_.getVideoPlaybackQuality ?
      this.video_.getVideoPlaybackQuality() : {};

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
    estimatedBandwidth: this.config_.abr.manager.getBandwidthEstimate(),

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
 * @return {!Promise.<shakaExtern.Track>}
 * @export
 */
shaka.Player.prototype.addTextTrack = function(
    uri, language, kind, mime, opt_codec) {
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
    type: ContentType.TEXT,
    primary: false,
    trickModeVideo: null,
    containsEmsgBoxes: false
  };

  // Add the stream to the loading list to ensure it isn't switched to while it
  // is initializing.
  this.loadingTextStreamIds_.push(stream.id);
  period.textStreams.push(stream);

  return this.streamingEngine_.notifyNewTextStream(stream).then(function() {
    if (this.destroyed_) return;

    // Remove the stream from the loading list.
    this.loadingTextStreamIds_.splice(
        this.loadingTextStreamIds_.indexOf(stream.id), 1);

    shaka.log.debug('Choosing new streams after adding a text stream');
    this.chooseStreamsAndSwitch_(period);
    this.onTracksChanged_();

    return {
      id: stream.id,
      active: false,
      type: ContentType.TEXT,
      bandwidth: 0,
      language: language,
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
 * Initialize the Player.
 * @private
 */
shaka.Player.prototype.initialize_ = function() {
  // Start the (potentially slow) process of opening MediaSource now.
  this.mediaSourceOpen_ = this.createMediaSource();

  // If the video element has TextTracks, disable them.  If we see one that
  // was created by a previous instance of Shaka Player, reuse it.
  for (var i = 0; i < this.video_.textTracks.length; ++i) {
    var track = this.video_.textTracks[i];
    track.mode = 'disabled';

    if (track.label == shaka.Player.TextTrackLabel_) {
      this.textTrack_ = track;
    }
  }

  if (!this.textTrack_) {
    // As far as I can tell, there is no observable difference between setting
    // kind to 'subtitles' or 'captions' when creating the TextTrack object.
    // The individual text tracks from the manifest will still have their own
    // kinds which can be displayed in the app's UI.
    this.textTrack_ = this.video_.addTextTrack(
        'subtitles', shaka.Player.TextTrackLabel_);
  }
  this.textTrack_.mode = 'hidden';

  // TODO: test that in all cases, the built-in CC controls in the video element
  // are toggling our TextTrack.

  // Listen for video errors.
  this.eventManager_.listen(this.video_, 'error',
      this.onVideoError_.bind(this));
};


/**
 * @param {!shakaExtern.Stream} stream
 * @param {boolean} fromAdaptation
 * @private
 */
shaka.Player.prototype.addToSwitchHistory_ = function(stream, fromAdaptation) {
  this.stats_.switchHistory.push({
    timestamp: Date.now() / 1000,
    id: stream.id,
    type: stream.type,
    fromAdaptation: fromAdaptation
  });

  this.updateActiveStreams_(stream);
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
    this.config_ ? this.config_.abr.manager.stop() : null,
    this.drmEngine_ ? this.drmEngine_.destroy() : null,
    this.mediaSourceEngine_ ? this.mediaSourceEngine_.destroy() : null,
    this.playhead_ ? this.playhead_.destroy() : null,
    this.playheadObserver_ ? this.playheadObserver_.destroy() : null,
    this.streamingEngine_ ? this.streamingEngine_.destroy() : null,
    this.parser_ ? this.parser_.stop() : null
  ]);

  this.drmEngine_ = null;
  this.mediaSourceEngine_ = null;
  this.playhead_ = null;
  this.playheadObserver_ = null;
  this.streamingEngine_ = null;
  this.parser_ = null;
  this.manifest_ = null;
  this.manifestUri_ = null;
  this.mediaSourceOpen_ = null;
  this.mediaSource_ = null;
  this.pendingTimelineRegions_ = [];
  this.activeStreamsByPeriod_ = {};
  this.deferredSwitches_ = {};
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
 * @const {string}
 * @private
 */
shaka.Player.TextTrackLabel_ = 'Shaka Player TextTrack';


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
      serverCertificate: null
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
        ignoreDrmInfo: false
      },
      hls: {
        defaultTimeOffset: 0
      }
    },
    streaming: {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      rebufferingGoal: 2,
      bufferingGoal: 10,
      bufferBehind: 30,
      ignoreTextStreamFailures: false,
      startAtSegmentBoundary: false,
      smallGapLimit: 0.5,
      jumpLargeGaps: false
    },
    abr: {
      manager: this.defaultAbrManager_,
      enabled: true,
      defaultBandwidthEstimate:
          shaka.abr.EwmaBandwidthEstimator.DEFAULT_ESTIMATE,
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
    }
  };
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
 * @param {shakaExtern.Period} period
 * @private
 */
shaka.Player.prototype.filterPeriod_ = function(period) {
  goog.asserts.assert(this.video_, 'Must not be destroyed');
  var StreamUtils = shaka.util.StreamUtils;

  var activeStreams =
      this.streamingEngine_ ? this.streamingEngine_.getActiveStreams() : {};
  StreamUtils.filterPeriod(this.drmEngine_, activeStreams, period);

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
 * Switches to the given streams, deferring switches if needed.
 * @param {!Object.<shaka.util.ManifestParserUtils.ContentType,
                    shakaExtern.Stream>} streamsByType
 * @param {boolean=} opt_clearBuffer
 * @private
 */
shaka.Player.prototype.deferredSwitch_ = function(
    streamsByType, opt_clearBuffer) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  for (var type in streamsByType) {
    var stream = streamsByType[type];
    var clearBuffer = opt_clearBuffer || false;
    // TODO: consider adding a cue replacement algorithm to TextEngine to remove
    // this special case for text:
    if (type == ContentType.TEXT) clearBuffer = true;
    if (this.switchingPeriods_) {
      this.deferredSwitches_[type] = {stream: stream, clearBuffer: clearBuffer};
    } else {
      this.streamingEngine_.switch(type, stream, clearBuffer);
    }
  }
};


/**
 * Verifies that the active streams according to the player match those in
 * StreamingEngine.
 * @private
 */
shaka.Player.prototype.assertCorrectActiveStreams_ = function() {
  if (!this.streamingEngine_ || !this.manifest_ || COMPILED) return;
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
    goog.asserts.assert(streamingActive[type].id == playerActive[type],
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
  this.config_.abr.manager.segmentDownloaded(deltaTimeMs, numBytes);
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
 * Chooses streams from the given Period.
 *
 * @param {!shakaExtern.Period} period
 * @param {!Array.<!shakaExtern.Variant>} variants
 * @param {!Array.<!shakaExtern.Stream>} textStreams
 * @param {boolean=} opt_chooseAll If true, choose streams of every type.
 * @return {!Object.<string, !shakaExtern.Stream>} A map of stream types to
 *   chosen streams.
 * @private
 */
shaka.Player.prototype.chooseStreams_ =
    function(period, variants, textStreams, opt_chooseAll) {
  goog.asserts.assert(this.config_, 'Must not be destroyed');

  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  // Issue an error if there are no playable variants
  if (!variants || variants.length < 1) {
    this.onError_(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.RESTRICTIONS_CANNOT_BE_MET));
    return {};
  }

  // Update abr manager with newly filtered streams and variants.
  this.config_.abr.manager.setVariants(variants);
  this.config_.abr.manager.setTextStreams(textStreams);

  var needsUpdate = [];
  if (opt_chooseAll) {
    needsUpdate = [ContentType.VIDEO, ContentType.AUDIO];
    if (period.textStreams.length) needsUpdate.push(ContentType.TEXT);
  }

  // Check if any of the active streams is no longer available
  // or is using the wrong language.
  var activeStreams = this.streamingEngine_.getActiveStreams();
  var activeVariant = shaka.util.StreamUtils.getVariantByStreams(
                                              activeStreams[ContentType.AUDIO],
                                              activeStreams[ContentType.VIDEO],
                                              period.variants);

  if (activeVariant) {
    if (!activeVariant.allowedByApplication ||
        !activeVariant.allowedByKeySystem) {
      needsUpdate.push(ContentType.AUDIO);
      needsUpdate.push(ContentType.VIDEO);
    }

    for (var type in activeStreams) {
      var stream = activeStreams[type];
      if (stream.type == ContentType.AUDIO &&
          stream.language != variants[0].language) {
        needsUpdate.push(type);
      } else if (stream.type == ContentType.TEXT && textStreams.length > 0 &&
                 stream.language != textStreams[0].language) {
        needsUpdate.push(type);
      }
    }
  }

  needsUpdate = needsUpdate.filter(shaka.util.Functional.isNotDuplicate);

  if (needsUpdate.length > 0) {
    shaka.log.debug('Choosing new streams for', needsUpdate);
    var chosen = {};
    try {
      chosen = this.config_.abr.manager.chooseStreams(needsUpdate);
    } catch (err) {
      this.onError_(err);
    }

    return chosen;
  } else {
    shaka.log.debug('No new streams need to be chosen.');
    return {};
  }
};


/**
 * Chooses streams from the given Period and switches to them.
 * Called after a config change, a new text stream, or a key status event.
 *
 * @param {!shakaExtern.Period} period
 * @private
 */
shaka.Player.prototype.chooseStreamsAndSwitch_ = function(period) {
  goog.asserts.assert(this.config_, 'Must not be destroyed');
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  // Create empty object first and initialize the fields through
  // [] to allow field names to be expressions.
  var languageMatches = {};
  languageMatches[ContentType.AUDIO] = false;
  languageMatches[ContentType.TEXT] = false;

  var variants = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
      period, this.currentAudioLanguage_, languageMatches);
  var textStreams = shaka.util.StreamUtils.filterTextStreamsByRoleAndLanguage(
      period, this.currentTextLanguage_, languageMatches);

  // chooseStreams_ filters out choices which are already active.
  var chosen = this.chooseStreams_(period, variants, textStreams);

  for (var type in chosen) {
    this.addToSwitchHistory_(chosen[type], /* fromAdaptation */ true);
  }

  // Because we're running this after a config change (manual language change),
  // a new text stream, or a key status event, and because active streams have
  // been filtered out already, it is always okay to clear the buffer for what
  // remains.
  this.deferredSwitch_(chosen, /* opt_clearBuffer */ true);

  // Send an adaptation event so that the UI can show the new language/tracks.
  this.onAdaptation_();

  if (chosen[ContentType.TEXT]) {
    // If audio and text tracks have different languages, and the text track
    // matches the user's preference, then show the captions.
    if (chosen[ContentType.AUDIO] &&
        languageMatches[ContentType.TEXT] &&
        chosen[ContentType.TEXT].language !=
            chosen[ContentType.AUDIO].language) {
      this.textTrack_.mode = 'showing';
      this.onTextTrackVisibility_();
    }
  }
};


/**
 * Callback from StreamingEngine.
 *
 * @param {!shakaExtern.Period} period
 * @return {!Object.<string, !shakaExtern.Stream>} A map of stream types to
 *   chosen streams.
 * @private
 */
shaka.Player.prototype.onChooseStreams_ = function(period) {
  shaka.log.debug('onChooseStreams_', period);
  goog.asserts.assert(this.config_, 'Must not be destroyed');

  // We are switching Periods, so the AbrManager will be disabled.  But if we
  // want to abr.enabled, we do not want to call AbrManager.enable before
  // canSwitch_ is called.
  this.switchingPeriods_ = true;
  this.config_.abr.manager.disable();

  shaka.log.debug('Choosing new streams after period changed');
  var variants = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
      period, this.currentAudioLanguage_);

  var textStreams = shaka.util.StreamUtils.filterTextStreamsByRoleAndLanguage(
      period, this.currentTextLanguage_);

  shaka.log.v2('onChooseStreams_, variants and text streams: ',
               variants, textStreams);

  var chosen = this.chooseStreams_(
      period, variants, textStreams, /* opt_chooseAll */ true);
  shaka.log.v2('onChooseStreams_, chosen=', chosen);

  // Override the chosen streams with the ones picked in
  // selectVariant/TextTrack. NOTE: The apparent race between
  // selectVariant/TextTrack and period transition is handled by
  // StreamingEngine, which will re-request tracks for thetransition if any
  // of these deferred selections are from the wrong period.
  for (var type in this.deferredSwitches_) {
    // We are choosing initial tracks, so no segments from this Period have
    // been downloaded yet.  Therefore, it is okay to ignore the .clearBuffer
    // member of this structure.
    chosen[type] = this.deferredSwitches_[type].stream;
  }
  this.deferredSwitches_ = {};

  for (var type in chosen) {
    this.addToSwitchHistory_(chosen[type], /* fromAdaptation */ true);
  }

  // Don't fire a tracks-changed event since we aren't inside the new Period
  // yet.

  return chosen;
};


/**
 * Callback from StreamingEngine.
 *
 * @private
 */
shaka.Player.prototype.canSwitch_ = function() {
  shaka.log.debug('canSwitch_');
  this.switchingPeriods_ = false;
  if (this.config_.abr.enabled)
    this.config_.abr.manager.enable();

  // If we still have deferred switches, switch now.
  for (var type in this.deferredSwitches_) {
    var info = this.deferredSwitches_[type];
    this.streamingEngine_.switch(type, info.stream, info.clearBuffer);
  }
  this.deferredSwitches_ = {};
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
 * @param {!Object.<shaka.util.ManifestParserUtils.ContentType,
 *                  !shakaExtern.Stream>} streamsByType
 * @param {boolean=} opt_clearBuffer
 * @private
 */
shaka.Player.prototype.switch_ = function(streamsByType, opt_clearBuffer) {
  shaka.log.debug('switch_');
  goog.asserts.assert(this.config_.abr.enabled,
      'AbrManager should not call switch while disabled!');
  goog.asserts.assert(!this.switchingPeriods_,
      'AbrManager should not call switch while transitioning between Periods!');

  // We have adapted to a new stream, record it in the history.  Only add if
  // we are actually switching the stream.
  var oldActive = this.streamingEngine_.getActiveStreams();
  for (var type in streamsByType) {
    var stream = streamsByType[type];
    if (oldActive[type] != stream) {
      this.addToSwitchHistory_(stream, /* fromAdaptation */ true);
    } else {
      // If it's the same, remove it from the map.
      // This allows us to avoid onAdaptation_() when nothing has changed.
      delete streamsByType[type];
    }
  }

  if (shaka.util.MapUtils.empty(streamsByType)) {
    // There's nothing to change.
    return;
  }

  if (!this.streamingEngine_) {
    // There's no way to change it.
    return;
  }

  for (var type in streamsByType) {
    var clearBuffer = opt_clearBuffer || false;
    this.streamingEngine_.switch(type, streamsByType[type], clearBuffer);
  }
  this.onAdaptation_();
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

  this.onError_(new shaka.util.Error(
      shaka.util.Error.Severity.CRITICAL,
      shaka.util.Error.Category.MEDIA,
      shaka.util.Error.Code.VIDEO_ERROR,
      code, extended));
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

  period.variants.forEach(function(variant) {
    var streams = [];
    if (variant.audio) streams.push(variant.audio);
    if (variant.video) streams.push(variant.video);

    streams.forEach(function(stream) {
      var originalAllowed = variant.allowedByKeySystem;

      // Only update the status if it is in the map.
      if (stream.keyId && stream.keyId in keyStatusMap) {
        var keyStatus = keyStatusMap[stream.keyId];
        variant.allowedByKeySystem = restrictedStatuses.indexOf(keyStatus) < 0;
      }

      if (originalAllowed != variant.allowedByKeySystem) {
        tracksChanged = true;
      }
    });
  });

  var activeStreams = this.streamingEngine_.getActiveStreams();
  var activeVariant = shaka.util.StreamUtils.getVariantByStreams(
      activeStreams[ContentType.AUDIO], activeStreams[ContentType.VIDEO],
      period.variants);
  if (activeVariant && !activeVariant.allowedByKeySystem) {
    shaka.log.debug('Choosing new streams after key status changed');
    this.chooseStreamsAndSwitch_(period);
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
