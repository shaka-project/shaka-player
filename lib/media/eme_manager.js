/**
 * Copyright 2015 Google Inc.
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
 * @fileoverview Implements the EME manager.
 */

goog.provide('shaka.media.EmeManager');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.StreamConfig');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.LicenseRequest');
goog.require('shaka.util.MultiMap');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @event shaka.media.EmeManager.SessionReadyEvent
 * @description Fired when a new MediaKeySession is ready.
 * @property {string} type 'sessionReady'
 * @property {MediaKeySession} detail
 */



/**
 * Creates the EME manager.
 *
 * @param {shaka.player.Player} player The player instance.
 * @param {!HTMLVideoElement} video The video element.
 * @param {!shaka.player.IVideoSource} videoSource The video source.
 *
 * @fires shaka.media.EmeManager.SessionReadyEvent
 * @fires shaka.player.Player.ErrorEvent
 *
 * @constructor
 * @struct
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.media.EmeManager = function(player, video, videoSource) {
  shaka.util.FakeEventTarget.call(this, player);

  /** @private {shaka.player.Player} */
  this.player_ = player;

  /** @private {!HTMLVideoElement} */
  this.video_ = video;

  /** @private {!shaka.player.IVideoSource} */
  this.videoSource_ = videoSource;

  /** @private {MediaKeys} */
  this.mediaKeys_ = null;

  /** @private {shaka.player.DrmSchemeInfo} */
  this.drmScheme_ = null;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {Object.<string, boolean>} */
  this.requestGenerated_ = {};

  /** @private {!Array.<!MediaKeySession>} */
  this.sessions_ = [];

  /** @private {number} */
  this.numUpdates_ = 0;

  /**
   * Resolved when all sessions are probably ready.  This is a heuristic, and
   * is intended to support persisting licenses for offline playback.
   * @private {!shaka.util.PublicPromise}
   */
  this.allSessionsPresumedReady_ = new shaka.util.PublicPromise();

  /** @private {?number} */
  this.allSessionsReadyTimer_ = null;
};
goog.inherits(shaka.media.EmeManager, shaka.util.FakeEventTarget);


/**
 * Destroys the EME manager.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.EmeManager.prototype.destroy = function() {
  this.parent = null;

  for (var i = 0; i < this.sessions_.length; ++i) {
    // Ignore any errors when closing the sessions.  One such error would be
    // an invalid state error triggered by closing a session which has not
    // generated any key requests.
    this.sessions_[i].close().catch(function() {});
  }
  this.sessions_ = [];
  this.mediaKeys_ = null;
  this.drmScheme_ = null;
  this.requestGenerated_ = null;

  this.eventManager_.destroy();
  this.eventManager_ = null;

  this.videoSource_ = null;  // not owned by us, do not destroy
  this.video_ = null;
};


/**
 * Initializes the DRM scheme by choosing from stream configurations provided
 * by the video source.  This function sets |mediaKeys_| and |drmScheme_|.
 * @return {!Promise}
 */
shaka.media.EmeManager.prototype.initialize = function() {
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
    this.allSessionsPresumedReady_.resolve();
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
  // Final error handling is done at the end of Player.load().
  return p;
};


/**
 * @param {number} timeoutMs A timeout in ms after which the promise should be
 *     rejected.
 * @return {!Promise} resolved when all sessions are presumed ready.
 */
shaka.media.EmeManager.prototype.allSessionsReady = function(timeoutMs) {
  if (this.allSessionsReadyTimer_ == null) {
    this.allSessionsReadyTimer_ = window.setTimeout(
        function() {
          var error = new Error('Timeout waiting for sessions.');
          error.type = 'storage';
          this.allSessionsPresumedReady_.reject(error);
        }.bind(this), timeoutMs);
  }
  return this.allSessionsPresumedReady_;
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
shaka.media.EmeManager.prototype.chooseUnencrypted_ =
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
 * @throws {Error} if DRM scheme info is missing.
 * @private
 */
shaka.media.EmeManager.prototype.buildKeySystemQueries_ =
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
        audioCapabilities: undefined,
        videoCapabilities: undefined,
        initDataTypes: undefined,
        distinctiveIdentifier: 'optional',
        persistentState: this.videoSource_.isOffline() ? 'required' : 'optional'
      };
    }

    // Only check for an empty MIME type after creating mksc.
    // This allows an empty mksc for sources which don't know their MIME types,
    // which EME treats as "no restrictions."
    if (!cfg.fullMimeType) continue;

    var capName = cfg.contentType + 'Capabilities';
    if (!(capName in mksc)) continue;  // not a capability we can check for!

    anythingSpecified = true;
    if (!mksc[capName]) {
      mksc[capName] = [];
    }
    mksc[capName].push({ contentType: cfg.fullMimeType });
  }

  // If nothing is specified, we will never match anything up later.
  // This little hack fixes support for HTTPVideoSource.
  if (!anythingSpecified) {
    if (configs.length) {
      this.drmScheme_ = configs[0].drmScheme;
    } else {
      // No DRM schemes provided.  There should at least be a placeholder for
      // unencrypted content with keySytem == ''.
      var error = new Error('No DRM scheme info provided!');
      error.type = 'drm';
      throw error;
    }
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
shaka.media.EmeManager.prototype.buildKeySystemPromiseChain_ =
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
shaka.media.EmeManager.prototype.chooseEncrypted_ =
    function(configs, chosenStreams, mediaKeySystemAccess) {
  var keySystem = mediaKeySystemAccess.keySystem;
  var mksc = mediaKeySystemAccess.getConfiguration();
  var emeTypes = ['audio', 'video'];

  for (var i = 0; i < emeTypes.length; ++i) {
    var contentType = emeTypes[i];
    if (chosenStreams.has(contentType)) continue;  // not needed!

    var capName = contentType + 'Capabilities';
    var caps = mksc[capName];
    if (!caps || !caps.length) continue;  // type not found!
    caps = caps[0];

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
shaka.media.EmeManager.prototype.setupMediaKeys_ = function(mediaKeys) {
  this.mediaKeys_ = mediaKeys;
  return this.video_.setMediaKeys(this.mediaKeys_).then(
      shaka.util.TypedBind(this, function() {
        shaka.asserts.assert(this.video_.mediaKeys);
        shaka.asserts.assert(this.video_.mediaKeys == this.mediaKeys_);
        if (this.videoSource_.getSessionIds().length > 0) {
          this.loadSessions_();
        } else {
          this.generateFakeEncryptedEvents_();

          // Explicit init data for any one stream is sufficient to suppress
          // 'encrypted' events for all streams.
          if (this.drmScheme_.initDatas.length == 0) {
            this.eventManager_.listen(
                this.video_,
                'encrypted',
                /** @type {shaka.util.EventManager.ListenerType} */(
                    this.onEncrypted_.bind(this)));
          }
        }
      }));
};


/**
 * Generate and dispatch any fake 'encrypted' events for the given DRM scheme.
 * @private
 */
shaka.media.EmeManager.prototype.generateFakeEncryptedEvents_ = function() {
  shaka.asserts.assert(this.drmScheme_);

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

    this.onEncrypted_(event);
  }
};


/**
 * EME 'encrypted' event handler.
 *
 * @param {!MediaEncryptedEvent} event The EME 'encrypted' event.
 * @private
 */
shaka.media.EmeManager.prototype.onEncrypted_ = function(event) {
  // Suppress duplicate init data.
  shaka.asserts.assert(event.initData);
  var initData = new Uint8Array(event.initData);
  var initDataKey = shaka.util.Uint8ArrayUtils.key(initData);

  shaka.asserts.assert(this.drmScheme_);
  if (this.requestGenerated_[initDataKey]) {
    return;
  }

  shaka.log.info('onEncrypted_', initData, event);
  try {
    var session = this.createSession_();
  } catch (exception) {
    var event2 = shaka.util.FakeEvent.createErrorEvent(exception);
    this.dispatchEvent(event2);
    this.allSessionsPresumedReady_.reject(exception);
    return;
  }

  var p = session.generateRequest(event.initDataType, event.initData);
  this.requestGenerated_[initDataKey] = true;

  p.catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        if (!this.requestGenerated_) {
          // The EmeManager has already been destroyed.
          return;
        }
        this.requestGenerated_[initDataKey] = false;
        var event = shaka.util.FakeEvent.createErrorEvent(error);
        this.dispatchEvent(event);
        this.allSessionsPresumedReady_.reject(error);
      })
  );
  this.sessions_.push(session);
};


/**
 * Loads persistent sessions via sessionId saved within videoSource.
 * @private
 */
shaka.media.EmeManager.prototype.loadSessions_ = function() {
  var persistentSessionIds = this.videoSource_.getSessionIds();
  shaka.asserts.assert(persistentSessionIds.length > 0);
  for (var i = 0; i < persistentSessionIds.length; ++i) {
    var session = this.createSession_();
    var p = session.load(persistentSessionIds[i]);
    this.sessions_.push(session);

    p.catch(shaka.util.TypedBind(this,
        /** @param {!Error} error */
        function(error) {
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);
        })
    );
  }
};


/**
 * Creates a new MediaKeySession.
 * @return {MediaKeySession}
 * @private
 */
shaka.media.EmeManager.prototype.createSession_ = function() {
  var session = this.videoSource_.isOffline() ?
      this.mediaKeys_.createSession('persistent-license') :
      this.mediaKeys_.createSession();

  this.eventManager_.listen(session, 'message',
      /** @type {shaka.util.EventManager.ListenerType} */(
          this.onSessionMessage_.bind(this)));
  this.eventManager_.listen(session, 'keystatuseschange',
      /** @type {shaka.util.EventManager.ListenerType} */(
          this.onKeyStatusChange_.bind(this)));
  return session;
};


/**
 * EME key-message handler.
 *
 * @param {!MediaKeyMessageEvent} event The EME message event.
 * @private
 */
shaka.media.EmeManager.prototype.onSessionMessage_ = function(event) {
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
shaka.media.EmeManager.prototype.onKeyStatusChange_ = function(event) {
  shaka.log.info('onKeyStatusChange_', event);
  var session = /** @type {!MediaKeySession} */(event.target);
  var map = session.keyStatuses;
  var i = map.values();
  for (var v = i.next(); !v.done; v = i.next()) {
    var message = shaka.media.EmeManager.KEY_STATUS_ERROR_MAP_[v.value];
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
shaka.media.EmeManager.prototype.requestLicense_ =
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
        if (postProcessor)
          response = postProcessor(response);
        return session.update(response);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        shaka.log.info('onSessionReady_', session);
        var event = shaka.util.FakeEvent.create(
            {type: 'sessionReady', detail: session});
        this.dispatchEvent(event);
        this.numUpdates_++;
        if (this.numUpdates_ >= this.sessions_.length) {
          this.allSessionsPresumedReady_.resolve();
        }
      })
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
 * Returns the DRM Scheme information.
 * @return {shaka.player.DrmSchemeInfo}
 */
shaka.media.EmeManager.prototype.getDrmScheme = function() {
  return this.drmScheme_;
};


/**
 * A map of key statuses to errors.  Not every key status appears in the map,
 * in which case that key status is not treated as an error.
 *
 * @private {!Object.<string, string>}
 * @const
 */
shaka.media.EmeManager.KEY_STATUS_ERROR_MAP_ = {
  // usable, output-downscaled, and status-pending do not result in errors.
  'output-not-allowed': 'The required output protection is not available.',
  'expired': 'A required key has expired and the content cannot be decrypted.',
  'internal-error': 'An unknown error has occurred in the CDM.'
};

