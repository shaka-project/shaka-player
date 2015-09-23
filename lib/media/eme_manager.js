/**
 * @license
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
 */

goog.provide('shaka.media.EmeManager');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.StreamConfig');
goog.require('shaka.player.Defaults');
goog.require('shaka.player.DrmInfo');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.LicenseRequest');
goog.require('shaka.util.MapUtils');
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

  /** @private {shaka.player.DrmInfo} */
  this.drmInfo_ = null;

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

  /** @private {number} */
  this.licenseRequestTimeout_ = shaka.player.Defaults.LICENSE_REQUEST_TIMEOUT;
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
  this.drmInfo_ = null;
  this.requestGenerated_ = null;

  this.allSessionsPresumedReady_.destroy();
  this.allSessionsPresumedReady_ = null;

  this.eventManager_.destroy();
  this.eventManager_ = null;

  if (this.allSessionsReadyTimer_) {
    window.clearTimeout(this.allSessionsReadyTimer_);
    this.allSessionsReadyTimer_ = null;
  }

  this.videoSource_ = null;  // not owned by us, do not destroy
  this.video_ = null;
};


/**
 * Initializes the DrmInfo by choosing from stream configurations provided
 * by the video source.  This function sets |mediaKeys_| and |drmInfo_|.
 * @return {!Promise}
 */
shaka.media.EmeManager.prototype.initialize = function() {
  shaka.asserts.assert(this.mediaKeys_ == null);
  shaka.asserts.assert(this.video_.mediaKeys == null);
  shaka.asserts.assert(this.drmInfo_ == null);

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
  p = p.then(this.chooseEncrypted_.bind(this, configs, chosenStreams));
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
 * Deletes all sessions from persistent storage.
 *
 * @return {!Promise}
 */
shaka.media.EmeManager.prototype.deleteSessions = function() {
  return Promise.all(this.sessions_.map(function(a) {
    shaka.log.debug('Removing session', a);
    return a.remove();
  }));
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
    shaka.asserts.assert(cfg.drmInfo != null);
    if (cfg.drmInfo.keySystem) continue;

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
 * @throws {Error} if DrmInfo is missing.
 * @private
 */
shaka.media.EmeManager.prototype.buildKeySystemQueries_ =
    function(configs, chosenStreams) {
  /** @type {!Object.<string, !MediaKeySystemConfiguration>} */
  var mediaKeySystemConfigs = {};  // indexed by key system
  var anythingSpecified = false;
  for (var i = 0; i < configs.length; ++i) {
    var cfg = configs[i];
    shaka.asserts.assert(cfg.drmInfo != null);
    if (!cfg.drmInfo.keySystem) continue;

    if (chosenStreams.has(cfg.contentType)) continue;

    var keySystem = cfg.drmInfo.keySystem;
    var mksc = mediaKeySystemConfigs[keySystem];
    if (!mksc) {
      mksc = this.createMediaKeySystemConfig_(cfg.drmInfo);
      mediaKeySystemConfigs[keySystem] = mksc;
    }

    // Only check for an empty MIME type after creating mksc.
    // This allows an empty mksc for sources which don't know their MIME types,
    // which EME treats as "no restrictions."
    if (!cfg.fullMimeType) continue;

    var capName = cfg.contentType + 'Capabilities';
    if (!(capName in mksc)) continue;  // Not a capability we can check for!

    anythingSpecified = true;
    if (!mksc[capName]) {
      mksc[capName] = [];
    }

    var robustness;
    if (cfg.contentType == 'audio') {
      robustness = cfg.drmInfo.audioRobustness;
    } else if (cfg.contentType == 'video') {
      robustness = cfg.drmInfo.videoRobustness;
    }

    mksc[capName].push({
      contentType: cfg.fullMimeType,
      robustness: robustness
    });

    shaka.log.info('MKSC', mksc);
  }

  // If nothing is specified, we will never match anything up later.
  // This little hack fixes support for HTTPVideoSource.
  if (!anythingSpecified) {
    if (configs.length) {
      this.drmInfo_ = configs[0].drmInfo;
    } else {
      // There should be at least one DrmInfo, i.e., a placeholder for
      // unencrypted content with keySytem == ''.
      var error = new Error('No DrmInfo exists!');
      error.type = 'drm';
      throw error;
    }
  }

  return mediaKeySystemConfigs;
};


/**
 * Creates a MediaKeySystemConfiguration from the given DrmInfo.
 *
 * @param {!shaka.player.DrmInfo} drmInfo
 * @return {!MediaKeySystemConfiguration}
 * @private
 */
shaka.media.EmeManager.prototype.createMediaKeySystemConfig_ = function(
    drmInfo) {
  var distinctiveIdentifier =
      drmInfo.distinctiveIdentifierRequired ? 'required' : 'optional';

  var persistentState =
      (drmInfo.persistentStateRequired || this.videoSource_.isOffline()) ?
      'required' :
      'optional';

  var sessionTypes = [
    this.videoSource_.isOffline() ? 'persistent-license' : 'temporary'
  ];

  return {
    audioCapabilities: undefined,
    videoCapabilities: undefined,
    initDataTypes: undefined,
    distinctiveIdentifier: distinctiveIdentifier,
    persistentState: persistentState,
    sessionTypes: sessionTypes
  };
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
    p = p.catch(function(keySystem, mksc) {
      // If the prior promise was rejected, try the next key system in the list.
      return navigator.requestMediaKeySystemAccess(keySystem, [mksc]);
    }.bind(null, keySystem, mksc));
  }
  if (this.videoSource_.isOffline()) {
    p = p.catch(function() {
      throw Error(
          'Either none of the requested key systems are supported or none of ' +
          'the requested key systems support persistent state.');
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
  if (!this.video_) {
    return this.rejectDestroyed_();
  }

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
    var chosenIds = {};
    for (var j = 0; j < configs.length; ++j) {
      var cfg = configs[j];
      if (cfg.drmInfo.keySystem == keySystem &&
          cfg.fullMimeType == caps.contentType &&
          !(cfg.id in chosenIds)) {
        chosenCfgs.push(cfg);
        chosenIds[cfg.id] = true;

        // Combine the DrmInfos from all chosen StreamConfigs.
        if (!this.drmInfo_) {
          this.drmInfo_ = cfg.drmInfo;
        } else {
          var newDrmInfo = /** @type {!shaka.player.DrmInfo} */(cfg.drmInfo);
          this.drmInfo_ = this.drmInfo_.combine(newDrmInfo);
        }
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
  if (!this.video_) {
    return this.rejectDestroyed_();
  }

  this.mediaKeys_ = mediaKeys;
  return this.video_.setMediaKeys(this.mediaKeys_).then(
      shaka.util.TypedBind(this, function() {
        if (!this.video_) {
          return this.rejectDestroyed_();
        }

        // If server certificate is provided, then set is up.
        if (this.drmInfo_.serverCertificate) {
          return this.mediaKeys_.setServerCertificate(
              this.drmInfo_.serverCertificate);
        } else {
          return Promise.resolve();
        }
      })
  ).then(shaka.util.TypedBind(this, function() {
    if (!this.video_) {
      return this.rejectDestroyed_();
    }
    shaka.asserts.assert(this.video_.mediaKeys);
    shaka.asserts.assert(this.video_.mediaKeys == this.mediaKeys_);
    if (this.videoSource_.getSessionIds().length > 0) {
      this.loadSessions_();
    } else {
      this.generateFakeEncryptedEvents_();

      // Explicit init data for any one stream is sufficient to suppress
      // 'encrypted' events for all streams.
      if (this.drmInfo_.initDatas.length == 0) {
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
 * @return {!Promise}
 * @private
 */
shaka.media.EmeManager.prototype.rejectDestroyed_ = function() {
  var error = new Error('EmeManager destroyed');
  error.type = 'destroy';
  return Promise.reject(error);
};


/**
 * Generate and dispatch any fake 'encrypted' events for |drmInfo_|.
 * @private
 */
shaka.media.EmeManager.prototype.generateFakeEncryptedEvents_ = function() {
  shaka.asserts.assert(this.drmInfo_);

  for (var i = 0; i < this.drmInfo_.initDatas.length; ++i) {
    var initData = this.drmInfo_.initDatas[i];

    // This DrmInfo has init data information which should override that found
    // in the actual stream.  Therefore, we fake an 'encrypted' event and
    // ignore the actual 'encrypted' events from the browser.
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
  shaka.asserts.assert(event.initData);
  var initData = new Uint8Array(event.initData);
  shaka.log.info('onEncrypted_', initData, event);

  // Suppress duplicate init data.
  var initDataKey = shaka.util.Uint8ArrayUtils.key(initData);
  if (this.requestGenerated_[initDataKey]) {
    shaka.log.debug('License request already generated!');
    return;
  }

  try {
    var session = this.createSession_();
  } catch (exception) {
    var event2 = shaka.util.FakeEvent.createErrorEvent(exception);
    this.dispatchEvent(event2);
    this.allSessionsPresumedReady_.reject(exception);
    return;
  }

  var p = session.generateRequest(event.initDataType,
      /** @type {!BufferSource} */(event.initData));
  this.requestGenerated_[initDataKey] = true;

  p.catch(shaka.util.TypedBind(this,
      /** @param {*} error */
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

    p.then(shaka.util.TypedBind(this,
        function(arg) {
          // Assume that the load does not require a message.  This allows
          // offline sessions to use allSessionsReady.
          this.numUpdates_++;
          if (this.numUpdates_ >= this.sessions_.length) {
            this.allSessionsPresumedReady_.resolve();
          }
        })
    ).catch(shaka.util.TypedBind(this,
        /** @param {*} error */
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
  var session = null;
  if (this.videoSource_.isOffline()) {
    try {
      session = this.mediaKeys_.createSession('persistent-license');
    } catch (e) {
      throw Error(
          'Persistent licenses are not supported by this key system or ' +
          'platform.');
    }
  } else {
    session = this.mediaKeys_.createSession();
  }

  this.eventManager_.listen(session, 'message',
      /** @type {shaka.util.EventManager.ListenerType} */(
          this.onSessionMessage_.bind(this)));
  this.eventManager_.listen(session, 'keystatuseschange',
      /** @type {shaka.util.EventManager.ListenerType} */(
          this.onKeyStatusesChange_.bind(this)));
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
  shaka.asserts.assert(this.drmInfo_);
  this.requestLicense_(
      event.target,
      /** @type {!shaka.player.DrmInfo} */ (this.drmInfo_),
      event.message);
};


/**
 * EME status-change handler.
 *
 * @param {!Event} event
 * @private
 */
shaka.media.EmeManager.prototype.onKeyStatusesChange_ = function(event) {
  shaka.log.debug('onKeyStatusesChange_', event);

  var session = /** @type {!MediaKeySession} */(event.target);
  var keyStatusMap = session.keyStatuses;

  /** @type {!Object.<string, string>} */
  var keyStatusByKeyId = {};

  var itr = keyStatusMap.keys();
  for (var key = itr.next(); !key.done; key = itr.next()) {
    var keyAsHexString =
        shaka.util.Uint8ArrayUtils.toHex(new Uint8Array(key.value));
    var status = keyStatusMap.get(key.value);
    shaka.asserts.assert(status != null);
    keyStatusByKeyId[keyAsHexString] = /** @type {string} */(status);
  }

  this.videoSource_.onKeyStatusesChange(keyStatusByKeyId);
};


/**
 * Requests a license.
 *
 * @param {!MediaKeySession} session An EME session object.
 * @param {!shaka.player.DrmInfo} drmInfo
 * @param {!ArrayBuffer} licenseRequestBody The license request's body.
 * @throws {TypeError}
 * @throws {Error}
 * @private
 */
shaka.media.EmeManager.prototype.requestLicense_ = function(
    session, drmInfo, licenseRequestBody) {
  shaka.log.debug('requestLicense_', session, drmInfo, licenseRequestBody);

  var info = this.createLicenseRequestInfo_(drmInfo, licenseRequestBody);
  var licenseRequest =
      new shaka.util.LicenseRequest(
          /** @type {string} */(info['url']),
          /** @type {(ArrayBuffer|?string)} */(info['body']),
          /** @type {string} */(info['method']),
          drmInfo.withCredentials,
          /** @type {Object.<string, string>} */(info['headers']),
          this.licenseRequestTimeout_);

  licenseRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!Uint8Array} response */
      function(response) {
        shaka.log.info('onLicenseSuccess_', session);
        if (drmInfo.licensePostProcessor) {
          response = drmInfo.licensePostProcessor(response);
        }
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
      /** @param {*} error */
      function(error) {
        error.session = session;
        var event = shaka.util.FakeEvent.createErrorEvent(error);
        this.dispatchEvent(event);
      })
  );
};


/**
 * Creates a LicenseRequestInfo object, potentially calling a licenese request
 * pre-processor.
 *
 * @param {!shaka.player.DrmInfo} drmInfo
 * @param {!ArrayBuffer} licenseRequestBody
 * @return {!shaka.player.DrmInfo.LicenseRequestInfo} A LicenseRequestInfo
 *     object whose fields have correct types.
 * @throws TypeError if the application sets a LicenseRequestInfo field to the
 *     wrong type.
 * @throws Error if the application deletes a LicenseRequestInfo field or sets
 *     the |method| field of a LicenseRequestInfo object to something other than
 *     'GET' or 'POST'.
 * @private
 */
shaka.media.EmeManager.prototype.createLicenseRequestInfo_ = function(
    drmInfo, licenseRequestBody) {
  var info = {
    'url': drmInfo.licenseServerUrl,
    'body': licenseRequestBody.slice(0),
    'method': 'POST',
    'headers': {}
  };

  if (!drmInfo.licensePreProcessor) {
    return info;
  }

  // Pre-process the license request.
  drmInfo.licensePreProcessor(info);

  info.url = shaka.util.MapUtils.getString(info, 'url');
  if (info.url == null) {
    throw new Error('\'url\' cannot be null.');
  }

  // Note that the application may set |body| to null on purpose.
  if (!(info.body instanceof ArrayBuffer ||
        typeof info.body == 'string' ||
        info.body == null)) {
    throw new TypeError(
        '\'body\' must be an ArrayBuffer, a string, or null.');
  }

  info.method = shaka.util.MapUtils.getString(info, 'method');
  if (!(info.method == 'GET' || info.method == 'POST')) {
    throw new Error('\'method\' must be either \'GET\' or \'POST\'.');
  }

  info.headers = shaka.util.MapUtils.getAsInstanceType(info, 'headers', Object);
  if (info.headers == null) {
    throw new Error('\'headers\' cannot be null.');
  }

  return info;
};


/**
 * Returns the current DrmInfo.
 * @return {shaka.player.DrmInfo}
 */
shaka.media.EmeManager.prototype.getDrmInfo = function() {
  return this.drmInfo_;
};


/**
 * Sets the license request timeout in seconds.
 *
 * @param {number} timeout The license request timeout in seconds.
 */
shaka.media.EmeManager.prototype.setLicenseRequestTimeout = function(timeout) {
  shaka.asserts.assert(!isNaN(timeout));
  this.licenseRequestTimeout_ = timeout;
};

