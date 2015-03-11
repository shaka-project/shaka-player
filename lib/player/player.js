/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Implements the player.
 */

goog.provide('shaka.player.Player');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.StreamConfig');
goog.require('shaka.player.AudioTrack');
goog.require('shaka.player.Stats');
goog.require('shaka.player.TextTrack');
goog.require('shaka.player.VideoTrack');
goog.require('shaka.timer');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.LicenseRequest');
goog.require('shaka.util.MultiMap');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @event shaka.player.Player.ErrorEvent
 * @description Fired when a playback error occurs.
 *     Bubbles up through the Player.
 * @property {string} type 'error'
 * @property {boolean} bubbles true
 * @property {!Error} detail An object which contains details on the error.
 *    The error's 'type' property will help you identify the specific error
 *    condition and display an appropriate message or error indicator to the
 *    user.  The error's 'message' property contains English text which can
 *    be useful during debugging.
 * @export
 */


/**
 * @event shaka.player.Player.BufferingEvent
 * @description Fired when the player's buffering state changes.
 * @property {string} type 'bufferingStart' or 'bufferingEnd'
 * @export
 */



/**
 * Creates a Player.
 *
 * @param {!HTMLVideoElement} video The video element.
 *
 * @fires shaka.media.Stream.AdaptationEvent
 * @fires shaka.player.Player.BufferingEvent
 * @fires shaka.player.Player.ErrorEvent
 *
 * @constructor
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.player.Player = function(video) {
  shaka.util.FakeEventTarget.call(this, null);

  /**
   * The video element.
   * @private {!HTMLVideoElement}
   */
  this.video_ = video;

  /**
   * The video source object.
   * @private {shaka.player.IVideoSource}
   */
  this.videoSource_ = null;

  /** @private {MediaKeys} */
  this.mediaKeys_ = null;

  /** @private {shaka.player.DrmSchemeInfo} */
  this.drmScheme_ = null;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {!Object.<string, boolean>} */
  this.requestGenerated_ = {};

  /** @private {!Array.<!MediaEncryptedEvent>} */
  this.fakeEncryptedEvents_ = [];

  /** @private {!Array.<!MediaKeySession>} */
  this.sessions_ = [];

  /** @private {string} */
  this.lang_ = 'en';

  /** @private {?number} */
  this.rewindTimer_ = null;

  /** @private {?number} */
  this.watchdogTimer_ = null;

  /** @private {boolean} */
  this.buffering_ = false;

  /** @private {!shaka.player.Stats} */
  this.stats_ = new shaka.player.Stats;

  /** @private {boolean} */
  this.adaptationEnabled_ = true;

  /** @private {!shaka.player.DrmSchemeInfo.Restrictions} */
  this.restrictions_ = new shaka.player.DrmSchemeInfo.Restrictions();
};
goog.inherits(shaka.player.Player, shaka.util.FakeEventTarget);


/**
 * @define {string} A version number taken from git at compile time.
 */
goog.define('GIT_VERSION', 'v1.2.0-debug');


/**
 * @const {string}
 * @export
 */
shaka.player.Player.version = GIT_VERSION;


/**
 * Determines if the browser has all of the necessary APIs to support the Shaka
 * Player.  This check may not pass if polyfills have not been installed.
 *
 * @return {boolean}
 * @export
 */
shaka.player.Player.isBrowserSupported = function() {
  return true &&
      // MSE is needed for adaptive streaming.
      !!window.MediaSource &&
      // EME is needed for protected content.
      !!window.MediaKeys &&
      // Indicates recent EME APIs.
      !!window.navigator &&
      !!window.navigator.requestMediaKeySystemAccess &&
      !!window.MediaKeySystemAccess &&
      !!window.MediaKeySystemAccess.prototype.getConfiguration &&
      // Promises are used frequently for asynchronous operations.
      !!window.Promise &&
      // Playback quality metrics used by Player.getStats().
      !!HTMLVideoElement.prototype.getVideoPlaybackQuality &&
      // Fullscreen API.
      !!Element.prototype.requestFullscreen &&
      !!document.exitFullscreen &&
      document.hasOwnProperty('fullscreenElement') &&
      // Node.children is used by mpd_parser.js, and body is a Node instance.
      !!document.body.children;
};


/**
 * Determines if the specified MIME type and codec is supported by the browser.
 *
 * @param {string} fullMimeType A MIME type, which should include codec info.
 * @return {boolean} true if the type is supported.
 * @export
 */
shaka.player.Player.isTypeSupported = function(fullMimeType) {
  var supported;

  // TODO(story 1922598): Although Chrome reports support for mp4a.40.5, it
  // fails to decode some such content. These are low-quality streams anyway,
  // so disable support for them until a solution can be found.
  if (fullMimeType.indexOf('mp4a.40.5') >= 0) {
    return false;
  }

  if (fullMimeType == 'text/vtt') {
    supported = !!window.VTTCue;
  } else {
    supported = MediaSource.isTypeSupported(fullMimeType);
  }

  shaka.log.info('+', fullMimeType, supported ? 'is' : 'is not', 'supported');
  return supported;
};


/**
 * Destroys the player.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 * @export
 */
shaka.player.Player.prototype.destroy = function() {
  this.unload().catch(function() {});

  this.eventManager_.destroy();
  this.eventManager_ = null;

  this.video_ = null;
};


/**
 * Stop playback and unload the current video source.  Makes the player ready
 * for reuse.  Also resets any statistics gathered.
 *
 * MediaKeys must be unloaded asynchronously, but all other resources are
 * removed synchronously.
 *
 * @return {!Promise} A promise, resolved when MediaKeys is removed.
 * @export
 */
shaka.player.Player.prototype.unload = function() {
  // Stop playback.
  this.video_.pause();

  // Stop listening for events and timers.
  this.eventManager_.removeAll();
  this.cancelWatchdogTimer_();
  this.cancelRewindTimer_();

  // Release all EME resources.
  for (var i = 0; i < this.sessions_.length; ++i) {
    // Ignore any errors when closing the sessions.  One such error would be
    // an invalid state error triggered by closing a session which has not
    // generated any key requests.
    this.sessions_[i].close().catch(function() {});
  }
  this.sessions_ = [];
  this.fakeEncryptedEvents_ = [];
  this.mediaKeys_ = null;
  this.drmScheme_ = null;

  // Remove the video source.
  this.video_.src = '';
  var p = this.video_.setMediaKeys(null);
  if (this.videoSource_) {
    this.videoSource_.destroy();
    this.videoSource_ = null;
  }

  // Reset state.
  this.buffering_ = false;
  this.requestGenerated_ = {};
  this.stats_ = new shaka.player.Stats;

  return p;
};


/**
 * Loads the specified video source and starts playback.  If a video source has
 * already been loaded, this calls unload() for you before loading the new
 * source.
 *
 * @param {!shaka.player.IVideoSource} videoSource The IVideoSource object. The
 *     Player takes ownership of |videoSource|.
 * @return {!Promise}
 * @export
 */
shaka.player.Player.prototype.load = function(videoSource) {
  var p = this.videoSource_ ? this.unload() : Promise.resolve();
  shaka.asserts.assert(this.videoSource_ == null);

  if (this.video_.autoplay) {
    shaka.timer.begin('load');
    this.eventManager_.listen(this.video_, 'timeupdate',
                              this.onFirstTimestamp_.bind(this));
  }

  // Sync adaptation setting, which could have been set before this source was
  // loaded.
  videoSource.enableAdaptation(this.adaptationEnabled_);

  return p.then(shaka.util.TypedBind(this,
      function() {
        return videoSource.load(this.lang_);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        this.videoSource_ = videoSource;
        this.videoSource_.setRestrictions(this.restrictions_);
        return this.initializeDrmScheme_();
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        this.setVideoEventListeners_();
        return this.videoSource_.attach(this, this.video_);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        // Dispatch any fake 'encrypted' events we might have created.
        for (var i = 0; i < this.fakeEncryptedEvents_.length; ++i) {
          this.onEncrypted_(this.fakeEncryptedEvents_[i]);
        }
        return Promise.resolve();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        // We own the source now, so we must clean it up.
        // We may not have set the source on this, so call destroy on the local
        // var instead.
        videoSource.destroy();

        // Since we may have set the source on this, set it to null.
        this.videoSource_ = null;

        // Even though we return a rejected promise, we still want to dispatch
        // an error event to ensure that the application is aware of all errors
        // from the player.
        var event = shaka.util.FakeEvent.createErrorEvent(error);
        this.dispatchEvent(event);

        return Promise.reject(error);
      })
  );
};


/**
 * Initializes the DRM scheme by choosing from stream configurations provided
 * by the video source.  This function sets |mediaKeys_| and |drmScheme_|.
 * @return {!Promise}
 * @private
 */
shaka.player.Player.prototype.initializeDrmScheme_ = function() {
  shaka.asserts.assert(this.mediaKeys_ == null);
  shaka.asserts.assert(this.video_.mediaKeys == null);
  shaka.asserts.assert(this.drmScheme_ == null);

  /** @type {!shaka.util.MultiMap.<!shaka.media.StreamConfig>} */
  var chosenStreams = new shaka.util.MultiMap();  // indexed by content type
  var configs = this.videoSource_.getConfigurations();

  this.chooseUnencrypted_(configs, chosenStreams);
  var mediaKeySystemConfigs =
      this.buildKeySystemQueries_(configs, chosenStreams);

  if (Object.keys(mediaKeySystemConfigs).length == 0) {
    // All streams are unencrypted.
    this.videoSource_.selectConfigurations(chosenStreams);
    return Promise.resolve();
  }

  // Build a Promise chain which tries all MediaKeySystemConfigurations.
  // Don't use Promise.reject(), since that will cause Chrome to complain about
  // uncaught errors.  Build the entire chain first, then reject instigator.
  var instigator = new shaka.util.PublicPromise();
  var p = this.buildKeySystemPromiseChain_(mediaKeySystemConfigs, instigator);
  // Cast as a workaround for a Closure bug: google/closure-compiler#715
  p = /** @type {!Promise.<!MediaKeys>} */(
      p.then(this.chooseEncrypted_.bind(this, configs, chosenStreams)));
  p = p.then(this.setupMediaKeys_.bind(this));
  // Start the key system search process and return the chain.
  instigator.reject(null);
  // This chain is only the DRM section of the overall load() chain.
  // Final error handling is done at the end of load().
  return p;
};


/**
 * Choose unencrypted streams for each type if possible.  Store chosen streams
 * into chosenStreams.
 *
 * @param {!Array.<!shaka.media.StreamConfig>} configs A list of configurations
 *     supported by the video source.
 * @param {!shaka.util.MultiMap.<!shaka.media.StreamConfig>} chosenStreams
 *     Chosen streams indexed by content type.
 * @private
 */
shaka.player.Player.prototype.chooseUnencrypted_ =
    function(configs, chosenStreams) {
  for (var i = 0; i < configs.length; ++i) {
    var cfg = configs[i];
    shaka.asserts.assert(cfg.drmScheme != null);
    if (cfg.drmScheme.keySystem) continue;

    // Ideally, the source would have already screened contents for basic type
    // support, but assume that hasn't happened and check the MIME type.
    if (cfg.fullMimeType &&
        !shaka.player.Player.isTypeSupported(cfg.fullMimeType)) continue;

    chosenStreams.push(cfg.contentType, cfg);
  }
};


/**
 * Build a set of MediaKeySystemConfigs to query for encrypted stream support.
 *
 * @param {!Array.<!shaka.media.StreamConfig>} configs A list of configurations
 *     supported by the video source.
 * @param {!shaka.util.MultiMap.<!shaka.media.StreamConfig>} chosenStreams
 *     Chosen streams indexed by content type.
 * @return {!Object.<string, !MediaKeySystemConfiguration>} Key system configs,
 *     indexed by key system.
 * @private
 */
shaka.player.Player.prototype.buildKeySystemQueries_ =
    function(configs, chosenStreams) {
  /** @type {!Object.<string, !MediaKeySystemConfiguration>} */
  var mediaKeySystemConfigs = {};  // indexed by key system
  var anythingSpecified = false;
  for (var i = 0; i < configs.length; ++i) {
    var cfg = configs[i];
    shaka.asserts.assert(cfg.drmScheme != null);
    if (!cfg.drmScheme.keySystem) continue;

    if (chosenStreams.has(cfg.contentType)) continue;

    var keySystem = cfg.drmScheme.keySystem;
    var mksc = mediaKeySystemConfigs[keySystem];
    if (!mksc) {
      mksc = mediaKeySystemConfigs[keySystem] = {
        audioCapabilities: [],
        videoCapabilities: [],
        initDataTypes: [],
        distinctiveIdentifier: 'optional',
        persistentState: 'optional'
      };
    }

    // Only check for an empty MIME type after creating mksc.
    // This allows an empty mksc for sources which don't know their MIME types,
    // which EME treats as "no restrictions."
    if (!cfg.fullMimeType) continue;

    var capName = cfg.contentType + 'Capabilities';
    if (!mksc[capName]) continue;  // not a capability we can check for!

    anythingSpecified = true;
    mksc[capName].push({ contentType: cfg.fullMimeType });
  }

  // If nothing is specified, we will never match anything up later.
  // This little hack fixes support for HTTPVideoSource.
  if (!anythingSpecified) {
    this.drmScheme_ = configs[0].drmScheme;
  }

  return mediaKeySystemConfigs;
};


/**
 * Build a promise chain to check each MediaKey configuration.  If the first
 * config fails, the next will be checked as a series of fallbacks.
 *
 * @param {!Object.<string, !MediaKeySystemConfiguration>} mediaKeySystemConfigs
 *     MediaKeySystemConfiguration} Key system configs, indexed by key system.
 * @param {!Promise} p The beginning of the promise chain, which should be
 *     rejected to start the series of fallback queries.
 * @return {!Promise.<!MediaKeySystemAccess>}
 * @private
 */
shaka.player.Player.prototype.buildKeySystemPromiseChain_ =
    function(mediaKeySystemConfigs, p) {
  for (var keySystem in mediaKeySystemConfigs) {
    var mksc = mediaKeySystemConfigs[keySystem];
    p = p.catch(function() {
      // If the prior promise was rejected, try the next key system in the list.
      return navigator.requestMediaKeySystemAccess(keySystem, [mksc]);
    });
  }
  return p;
};


/**
 * When a key system query succeeds, chooses encrypted streams which match the
 * chosen MediaKeySystemConfiguration, then creates a MediaKeys instance.
 *
 * @param {!Array.<!shaka.media.StreamConfig>} configs A list of configurations
 *     supported by the video source.
 * @param {!shaka.util.MultiMap.<!shaka.media.StreamConfig>} chosenStreams
 *     Chosen streams indexed by content type.
 * @param {!MediaKeySystemAccess} mediaKeySystemAccess
 * @return {!Promise.<!MediaKeys>}
 * @private
 */
shaka.player.Player.prototype.chooseEncrypted_ =
    function(configs, chosenStreams, mediaKeySystemAccess) {
  var keySystem = mediaKeySystemAccess.keySystem;
  var mksc = mediaKeySystemAccess.getConfiguration();
  var emeTypes = ['audio', 'video'];

  for (var i = 0; i < emeTypes.length; ++i) {
    var contentType = emeTypes[i];
    if (chosenStreams.has(contentType)) continue;  // not needed!

    var capName = contentType + 'Capabilities';
    var caps = mksc[capName][0];
    if (!caps) continue;  // type not found!

    // Find which StreamConfigs match the selected MediaKeySystemConfiguration.
    var chosenCfgs = [];
    for (var j = 0; j < configs.length; ++j) {
      var cfg = configs[j];
      if (cfg.drmScheme.keySystem == keySystem &&
          cfg.fullMimeType == caps.contentType) {
        chosenCfgs.push(cfg);

        // Accumulate the DRM scheme info from all chosen StreamConfigs.
        if (!this.drmScheme_) {
          this.drmScheme_ = cfg.drmScheme;
        } else {
          var newScheme = /** @type {!shaka.player.DrmSchemeInfo} */(
              cfg.drmScheme);
          this.drmScheme_ = shaka.player.DrmSchemeInfo.combine(
              this.drmScheme_, newScheme);
        }
        break;
      }
    }

    shaka.asserts.assert(chosenCfgs.length);
    chosenStreams.set(contentType, chosenCfgs);
  }

  this.videoSource_.selectConfigurations(chosenStreams);
  return mediaKeySystemAccess.createMediaKeys();
};


/**
 * Sets up MediaKeys after it has been created.  The MediaKeys instance will be
 * attached to the video, any fake events will be generated, and any event
 * listeners will be attached to the video.
 *
 * @param {!MediaKeys} mediaKeys
 * @return {!Promise}
 * @private
 */
shaka.player.Player.prototype.setupMediaKeys_ = function(mediaKeys) {
  this.mediaKeys_ = mediaKeys;
  return this.video_.setMediaKeys(this.mediaKeys_).then(
      shaka.util.TypedBind(this, function() {
        shaka.asserts.assert(this.video_.mediaKeys);
        shaka.asserts.assert(this.video_.mediaKeys == this.mediaKeys_);
        this.generateFakeEncryptedEvents_();

        // Explicit init data for any one stream is sufficient to suppress
        // 'encrypted' events for all streams.
        if (this.fakeEncryptedEvents_.length == 0) {
          this.eventManager_.listen(
              this.video_,
              'encrypted',
              /** @type {shaka.util.EventManager.ListenerType} */(
                  this.onEncrypted_.bind(this)));
        }
      }));
};


/**
 * Generate any fake 'encrypted' events for the given DRM scheme and store them
 * in |fakeEncryptedEvents_|.
 *
 * @private
 */
shaka.player.Player.prototype.generateFakeEncryptedEvents_ = function() {
  shaka.asserts.assert(this.drmScheme_);
  this.fakeEncryptedEvents_ = [];

  for (var i = 0; i < this.drmScheme_.initDatas.length; ++i) {
    var initData = this.drmScheme_.initDatas[i];

    // This DRM scheme has init data information which should override that
    // found in the actual stream.  Therefore, we fake an 'encrypted' event
    // and ignore the actual 'encrypted' events from the browser.
    var event = /** @type {!MediaEncryptedEvent} */ ({
      type: 'encrypted',
      initDataType: initData.initDataType,
      initData: initData.initData
    });

    // The video hasn't been attached yet, so we can't fire these until later.
    this.fakeEncryptedEvents_.push(event);
  }
};


/**
 * Sets the video's event listeners.
 *
 * @private
 */
shaka.player.Player.prototype.setVideoEventListeners_ = function() {
  this.eventManager_.listen(this.video_, 'error', this.onError_.bind(this));
  // TODO(story 1891509): Connect these events to the UI.
  this.eventManager_.listen(this.video_, 'play', this.onPlay_.bind(this));
  this.eventManager_.listen(this.video_, 'playing', this.onPlaying_.bind(this));
  this.eventManager_.listen(this.video_, 'seeking', this.onSeeking_.bind(this));
  this.eventManager_.listen(this.video_, 'pause', this.onPause_.bind(this));
  this.eventManager_.listen(this.video_, 'ended', this.onEnded_.bind(this));
};


/**
 * EME 'encrypted' event handler.
 *
 * @param {!MediaEncryptedEvent} event The EME 'encrypted' event.
 * @private
 */
shaka.player.Player.prototype.onEncrypted_ = function(event) {
  // Suppress duplicate init data.
  shaka.asserts.assert(event.initData);
  var initData = new Uint8Array(event.initData);
  var initDataKey = shaka.util.Uint8ArrayUtils.key(initData);

  shaka.asserts.assert(this.drmScheme_);
  if (this.drmScheme_.suppressMultipleEncryptedEvents) {
    // In this scheme, all 'encrypted' events are equivalent.
    // Never create more than one session.
    initDataKey = 'first';
  }

  if (this.requestGenerated_[initDataKey]) {
    return;
  }

  shaka.log.info('onEncrypted_', initData, event);

  var session = this.mediaKeys_.createSession();
  this.sessions_.push(session);

  this.eventManager_.listen(session, 'message',
      /** @type {shaka.util.EventManager.ListenerType} */(
          this.onSessionMessage_.bind(this)));
  this.eventManager_.listen(session, 'keystatuseschange',
      /** @type {shaka.util.EventManager.ListenerType} */(
          this.onKeyStatusChange_.bind(this)));

  var p = session.generateRequest(event.initDataType, event.initData);
  this.requestGenerated_[initDataKey] = true;

  p.catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        this.requestGenerated_[initDataKey] = false;
        var event = shaka.util.FakeEvent.createErrorEvent(error);
        this.dispatchEvent(event);
      })
  );
};


/**
 * EME key-message handler.
 *
 * @param {!MediaKeyMessageEvent} event The EME message event.
 * @private
 */
shaka.player.Player.prototype.onSessionMessage_ = function(event) {
  shaka.log.info('onSessionMessage_', event);
  shaka.asserts.assert(this.drmScheme_);
  this.requestLicense_(event.target, this.drmScheme_.licenseServerUrl,
                       event.message, this.drmScheme_.withCredentials,
                       this.drmScheme_.licensePostProcessor);
};


/**
 * EME status-change handler.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onKeyStatusChange_ = function(event) {
  shaka.log.info('onKeyStatusChange_', event);
  var session = /** @type {!MediaKeySession} */(event.target);
  var map = session.keyStatuses;
  var i = map.values();
  for (var v = i.next(); !v.done; v = i.next()) {
    var message = shaka.player.Player.KEY_STATUS_ERROR_MAP_[v.value];
    if (message) {
      var error = new Error(message);
      error.type = v.value;
      var event = shaka.util.FakeEvent.createErrorEvent(error);
      this.dispatchEvent(event);
    }
  }
};


/**
 * Requests a license.
 *
 * @param {!MediaKeySession} session An EME session object.
 * @param {string} licenseServerUrl The license server URL.
 * @param {!ArrayBuffer} licenseRequestBody The license request's body.
 * @param {boolean} withCredentials True if the request should include cookies
 *     when sent cross-domain.  See http://goo.gl/pzY9F7 for more information.
 * @param {?shaka.player.DrmSchemeInfo.LicensePostProcessor} postProcessor The
 *     post-processor for the license, if any.
 *
 * @private
 */
shaka.player.Player.prototype.requestLicense_ =
    function(session, licenseServerUrl, licenseRequestBody, withCredentials,
             postProcessor) {
  shaka.log.info(
      'requestLicense_', session, licenseServerUrl, licenseRequestBody);

  var licenseRequest = new shaka.util.LicenseRequest(
      licenseServerUrl, licenseRequestBody, withCredentials);

  licenseRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!Uint8Array} response */
      function(response) {
        shaka.log.info('onLicenseSuccess_', session);
        if (postProcessor) {
          var restrictions = this.restrictions_;
          response = postProcessor(response, restrictions);
          this.videoSource_.setRestrictions(restrictions);
        }

        return session.update(response);
      })
  ).then(
      function() {
        shaka.log.info('onSessionReady_', session);
      }
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        error.session = session;
        var event = shaka.util.FakeEvent.createErrorEvent(error);
        this.dispatchEvent(event);
      })
  );
};


/**
 * Time update event handler.  Will be removed once the first update is seen.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onFirstTimestamp_ = function(event) {
  shaka.timer.end('load');
  this.stats_.logPlaybackLatency(shaka.timer.get('load'));
  this.eventManager_.unlisten(this.video_, 'timeupdate');
};


/**
 * Video error event handler.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onError_ = function(event) {
  if (!this.video_.error) {
    // This occurred during testing with prefixed EME.  Ignore errors we can't
    // interpret, on the assumption that this is a browser bug.
    shaka.log.debug('Uninterpretable error event!', event);
    return;
  }

  var code = this.video_.error.code;
  if (code == MediaError['MEDIA_ERR_ABORTED']) {
    // Ignore this error code, which should only occur when navigating away or
    // deliberately stopping playback of HTTP content.
    return;
  }

  shaka.log.debug('onError_', event, code);
  var message = shaka.player.Player.MEDIA_ERROR_MAP_[code] ||
                'Unknown playback error.';

  var error = new Error(message);
  error.type = 'playback';
  var event = shaka.util.FakeEvent.createErrorEvent(error);
  this.dispatchEvent(event);
};


/**
 * Video play event handler.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onPlay_ = function(event) {
  shaka.log.debug('onPlay_', event);
};


/**
 * Video playing event handler.  Fires any time the video starts playing.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onPlaying_ = function(event) {
  shaka.log.debug('onPlaying_', event);
  shaka.timer.begin('playing');

  this.cancelWatchdogTimer_();

  this.watchdogTimer_ =
      window.setTimeout(this.onWatchdogTimer_.bind(this), 100);
};


/**
 * Video seeking event handler.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onSeeking_ = function(event) {
  shaka.log.debug('onSeeking_', event);

  this.cancelWatchdogTimer_();
  this.buffering_ = false;
};


/**
 * Video pause event handler.  Fires any time the video stops for any reason,
 * including before a 'seeking' or 'ended' event.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onPause_ = function(event) {
  shaka.log.debug('onPause_', event);
  shaka.timer.end('playing');
  this.stats_.logPlayTime(shaka.timer.get('playing'));
};


/**
 * Video end event handler.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onEnded_ = function(event) {
  shaka.log.debug('onEnded_', event, this.getStats());
  this.cancelWatchdogTimer_();
};


/**
 * Gets updated stats about the player.
 *
 * @return {!shaka.player.Stats}
 * @export
 */
shaka.player.Player.prototype.getStats = function() {
  if (!this.video_.paused) {
    // Update play time, which is still progressing.
    shaka.timer.end('playing');
    this.stats_.logPlayTime(shaka.timer.get('playing'));
    shaka.timer.begin('playing');
  }
  this.stats_.updateVideoStats(this.video_);
  return this.stats_;
};


/**
 * Gets the current video resolution. Returns null if the current video
 * resolution could not be determined. Note that this represents the state of
 * decode and rendering, and thus may lag behind the selected track or the
 * data in shaka.dash.DashStream.AdaptationEvent.
 *
 * @return {?{width: number, height: number}}
 * @export
 */
shaka.player.Player.prototype.getCurrentResolution = function() {
  var width = this.video_.videoWidth;
  var height = this.video_.videoHeight;

  if (width && height) {
    return { width: width, height: height };
  } else {
    return null;
  }
};


/**
 * Gets the available video tracks.
 *
 * @return {!Array.<!shaka.player.VideoTrack>}
 * @export
 */
shaka.player.Player.prototype.getVideoTracks = function() {
  if (!this.videoSource_) return [];
  return this.videoSource_.getVideoTracks();
};


/**
 * Gets the available audio tracks.
 *
 * @return {!Array.<!shaka.player.AudioTrack>}
 * @export
 */
shaka.player.Player.prototype.getAudioTracks = function() {
  if (!this.videoSource_) return [];
  return this.videoSource_.getAudioTracks();
};


/**
 * Gets the available text tracks.
 *
 * @return {!Array.<!shaka.player.TextTrack>}
 * @export
 */
shaka.player.Player.prototype.getTextTracks = function() {
  if (!this.videoSource_) return [];
  return this.videoSource_.getTextTracks();
};


/**
 * Select a video track by ID.  This can interfere with automatic adaptation,
 * so you should call {@link shaka.player.Player#enableAdaptation}(false) if
 * you intend to switch to manual video track selection.
 *
 * @param {number} id The |id| field of the desired VideoTrack object.
 * @param {boolean=} opt_immediate If true, switch immediately.  Otherwise,
 *     switch when convenient.  Defaults to true.
 *
 * @return {boolean} True if the specified VideoTrack was found.
 * @export
 */
shaka.player.Player.prototype.selectVideoTrack = function(id, opt_immediate) {
  if (!this.videoSource_) return false;
  var immediate = (opt_immediate == undefined) ? true : opt_immediate;
  return this.videoSource_.selectVideoTrack(id, immediate);
};


/**
 * Select an audio track by ID.
 *
 * @param {number} id The |id| field of the desired AudioTrack object.
 *
 * @return {boolean} True if the specified AudioTrack was found.
 * @export
 */
shaka.player.Player.prototype.selectAudioTrack = function(id) {
  if (!this.videoSource_) return false;
  return this.videoSource_.selectAudioTrack(id, false);
};


/**
 * Select a text track by ID.
 *
 * @param {number} id The |id| field of the desired TextTrack object.
 *
 * @return {boolean} True if the specified TextTrack was found.
 * @export
 */
shaka.player.Player.prototype.selectTextTrack = function(id) {
  if (!this.videoSource_) return false;
  return this.videoSource_.selectTextTrack(id, false);
};


/**
 * Enable or disable the text track.  Has no effect if called before
 * load() resolves.
 *
 * @param {boolean} enabled
 * @export
 */
shaka.player.Player.prototype.enableTextTrack = function(enabled) {
  if (!this.videoSource_) return;
  this.videoSource_.enableTextTrack(enabled);
};


/**
 * Enable or disable automatic bitrate adaptation.  May be called at any time.
 *
 * @param {boolean} enabled
 * @export
 */
shaka.player.Player.prototype.enableAdaptation = function(enabled) {
  this.adaptationEnabled_ = enabled;
  if (this.videoSource_) {
    this.videoSource_.enableAdaptation(enabled);
  }
};


/**
 * @return {number} Current playback time in seconds.
 * @export
 */
shaka.player.Player.prototype.getCurrentTime = function() {
  return this.video_.currentTime;
};


/**
 * @return {number} Video duration in seconds.
 * @export
 */
shaka.player.Player.prototype.getDuration = function() {
  return this.video_.duration;
};


/**
 * @return {boolean} True if the video is muted.
 * @export
 */
shaka.player.Player.prototype.getMuted = function() {
  return this.video_.muted;
};


/**
 * @return {number} The video volume, between 0 and 1.
 * @export
 */
shaka.player.Player.prototype.getVolume = function() {
  return this.video_.volume;
};


/**
 * Play the video.  Will reset the playback rate to 1.0 as well.
 * @export
 */
shaka.player.Player.prototype.play = function() {
  this.setPlaybackRate(1.0);
  this.video_.play();
};


/**
 * Pause the video.
 * @export
 */
shaka.player.Player.prototype.pause = function() {
  this.video_.pause();
};


/**
 * Make the video go full-screen.
 * For security reasons, only works from an event handler for user input.
 * @export
 */
shaka.player.Player.prototype.requestFullscreen = function() {
  this.video_.requestFullscreen();
};


/**
 * @param {number} seconds The desired playback position in seconds.
 * @export
 */
shaka.player.Player.prototype.seek = function(seconds) {
  this.video_.currentTime = seconds;
};


/**
 * @param {boolean} on True to mute the video, false to unmute the video.
 * @export
 */
shaka.player.Player.prototype.setMuted = function(on) {
  this.video_.muted = on;
};


/**
 * @param {number} level The video volume, between 0 and 1.
 * @export
 */
shaka.player.Player.prototype.setVolume = function(level) {
  this.video_.volume = level;
};


/**
 * @param {string} lang The user's preferred language tag.  If not set,
 *     defaults to 'en'.  This setting will affect the initial tracks chosen by
 *     subsequent calls to Player.load().
 * @see IETF RFC 5646
 * @see ISO 639
 * @export
 */
shaka.player.Player.prototype.setPreferredLanguage = function(lang) {
  // Normalize the language tag.
  this.lang_ = shaka.util.LanguageUtils.normalize(lang);
};


/**
 * @param {number} rate The playback rate.
 *     Negative values will rewind the video.
 *     Positive values less than 1.0 will trigger slow-motion playback.
 *     Positive values greater than 1.0 will trigger fast-forward.
 *     0.0 is invalid and will be ignored.
 *     Some UAs will not play audio at rates less than 0.25 or 0.5 or greater
 *     than 4.0 or 5.0, but this behavior is not specified.
 *     No audio will be played while rewinding.
 * @export
 */
shaka.player.Player.prototype.setPlaybackRate = function(rate) {
  shaka.asserts.assert(rate != 0);
  if (rate == 0) {
    return;
  }

  // Cancel any rewind we might be in the middle of.
  this.cancelRewindTimer_();

  if (rate > 0) {
    // Slow-mo or fast-forward are handled natively by the UA.
    this.video_.playbackRate = rate;
  } else {
    // Rewind is not supported by any UA to date (2014), so we fake it.
    this.video_.playbackRate = 0;
    this.onRewindTimer_(rate);
  }
};


/**
 * @param {number} max Maximum bandwidth allowed for playback of video tracks
 * @export
 */
shaka.player.Player.prototype.setMaxBandwidth = function(max) {
  this.restrictions_.maxBandwidth = max;
  if (this.videoSource_) {
    this.videoSource_.setRestrictions(this.restrictions_);
  }
};


/**
 * @param {number} min Minimum bandwidth allowed for playback of video tracks
 * @export
 */
shaka.player.Player.prototype.setMinBandwidth = function(min) {
  this.restrictions_.minBandwidth = min;
  if (this.videoSource_) {
    this.videoSource_.setRestrictions(this.restrictions_);
  }
};


/**
 * Cancels the rewind timer, if any.
 * @private
 */
shaka.player.Player.prototype.cancelRewindTimer_ = function() {
  if (this.rewindTimer_) {
    window.clearTimeout(this.rewindTimer_);
    this.rewindTimer_ = null;
  }
};


/**
 * Cancels the watchdog timer, if any.
 * @private
 */
shaka.player.Player.prototype.cancelWatchdogTimer_ = function() {
  if (this.watchdogTimer_) {
    window.clearTimeout(this.watchdogTimer_);
    this.watchdogTimer_ = null;
  }
};


/**
 * Called on a recurring timer to simulate rewind.
 * @param {number} rate
 * @private
 */
shaka.player.Player.prototype.onRewindTimer_ = function(rate) {
  shaka.asserts.assert(rate < 0);
  // For a rate of -1.0, we move the playhead back by 0.1s every 0.1s (100ms).
  this.video_.currentTime += 0.1 * rate;
  this.rewindTimer_ =
      window.setTimeout(this.onRewindTimer_.bind(this, rate), 100);
};


/**
 * Called on a recurring timer to detect buffering events.
 * @private
 */
shaka.player.Player.prototype.onWatchdogTimer_ = function() {
  this.watchdogTimer_ =
      window.setTimeout(this.onWatchdogTimer_.bind(this), 100);

  // Because we cancel this onSeeking_ and re-enable it onPlaying_.
  shaka.asserts.assert(!this.video_.seeking, 'should not be seeking');

  var buffered = this.video_.buffered;
  // Counter-intuitively, the play head can advance audio-only while video is
  // buffering.  |buffered| will show the intersection of buffered ranges for
  // both audio and video, so this is an accurate way to sense that we are
  // buffering.  The 'stalled', 'waiting', and 'suspended' events do not work
  // for this purpose as of Chrome 38.
  var bufferEnd = buffered.length ? buffered.end(buffered.length - 1) : 0;
  var underflow = this.video_.currentTime - bufferEnd;

  if (!this.buffering_) {
    if (underflow > shaka.player.Player.UNDERFLOW_THRESHOLD_) {
      this.buffering_ = true;
      this.video_.pause();
      this.stats_.logBufferingEvent();
      shaka.timer.begin('buffering');
      shaka.log.debug('Buffering...');
      this.dispatchEvent(shaka.util.FakeEvent.create({type: 'bufferingStart'}));
    }
  } else {
    var resumeThreshold = this.videoSource_.getResumeThreshold();
    shaka.asserts.assert(resumeThreshold > 0);
    if (underflow < -resumeThreshold) {
      shaka.log.debug('Buffering complete.');
      shaka.timer.end('buffering');
      this.stats_.logBufferingTime(shaka.timer.get('buffering'));
      this.buffering_ = false;
      this.dispatchEvent(shaka.util.FakeEvent.create({type: 'bufferingEnd'}));
      this.video_.play();
    }
  }
};


/**
 * The threshold for underflow, in seconds.  If the play head is outside the
 * buffered range by this much, we will consider the player to be out of data.
 *
 * @private {number}
 * @const
 */
shaka.player.Player.UNDERFLOW_THRESHOLD_ = 0.050;


/**
 * A map of key statuses to errors.  Not every key status appears in the map,
 * in which case that key status is not treated as an error.
 *
 * @private {!Object.<string, string>}
 * @const
 */
shaka.player.Player.KEY_STATUS_ERROR_MAP_ = {
  'output-not-allowed': 'The required output protection is not available.',
  'expired': 'A required key has expired and the content cannot be decrypted.',
  'internal-error': 'An unknown error has occurred in the CDM.'
};


/**
 * A map of MediaError codes to error messages.  The JS interpreter won't take
 * a symbolic name as a key, so the symbolic names for these error codes appear
 * in comments after the number.
 *
 * @private {!Object.<number, string>}
 * @const
 */
shaka.player.Player.MEDIA_ERROR_MAP_ = {
  // This should not occur for DASH sources, but may occur for HTTP sources.
  2: // MediaError.MEDIA_ERR_NETWORK
      'A network failure occured while loading media content.',

  3: // MediaError.MEDIA_ERR_DECODE
      'The browser failed to decode the media content.',

  // This is also unlikely for DASH sources, but HTTP sources do not check
  // browser support before beginning playback.
  4: // MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
      'The browser does not support the media content.'
};

