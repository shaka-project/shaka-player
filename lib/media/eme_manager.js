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
goog.require('shaka.player.Defaults');
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
      mksc = this.createMediaKeySystemConfig_(cfg.drmScheme);
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
      robustness = cfg.drmScheme.audioRobustness;
    } else if (cfg.contentType == 'video') {
      robustness = cfg.drmScheme.videoRobustness;
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
 * Creates a MediaKeySystemConfiguration from the given DrmSchemeInfo.
 *
 * @param {!shaka.player.DrmSchemeInfo} drmScheme
 * @return {!MediaKeySystemConfiguration}
 * @private
 */
shaka.media.EmeManager.prototype.createMediaKeySystemConfig_ = function(
    drmScheme) {
  var distinctiveIdentifier =
      drmScheme.distinctiveIdentifierRequired ? 'required' : 'optional';

  var persistentState =
      (drmScheme.persistentStateRequired || this.videoSource_.isOffline()) ?
      'required' :
      'optional';

  return {
    audioCapabilities: undefined,
    videoCapabilities: undefined,
    initDataTypes: undefined,
    distinctiveIdentifier: distinctiveIdentifier,
    persistentState: persistentState
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
    p = p.catch(function() {
      // If the prior promise was rejected, try the next key system in the list.
      return navigator.requestMediaKeySystemAccess(keySystem, [mksc]);
    });
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
      if (cfg.drmScheme.keySystem == keySystem &&
          cfg.fullMimeType == caps.contentType &&
          !(cfg.id in chosenIds)) {
        chosenCfgs.push(cfg);
        chosenIds[cfg.id] = true;

        // Accumulate the DRM scheme info from all chosen StreamConfigs.
        if (!this.drmScheme_) {
          this.drmScheme_ = cfg.drmScheme;
        } else {
          var newScheme = /** @type {!shaka.player.DrmSchemeInfo} */(
              cfg.drmScheme);
          shaka.player.DrmSchemeInfo.combine(this.drmScheme_, newScheme);
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
  this.mediaKeys_ = mediaKeys;
  return this.video_.setMediaKeys(this.mediaKeys_).then(
      shaka.util.TypedBind(this, function() {
        // If server certificate is provided, then set is up.
        if (this.drmScheme_.serverCertificate) {
          return this.mediaKeys_.setServerCertificate(
              this.drmScheme_.serverCertificate);
        } else {
          return Promise.resolve();
        }
      })
  ).then(shaka.util.TypedBind(this, function() {
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
  shaka.asserts.assert(event.initData);
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

    p.catch(shaka.util.TypedBind(this,
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
  this.requestLicense_(
      event.target,
      /** @type {!shaka.player.DrmSchemeInfo} */ (this.drmScheme_),
      event.message);
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
      var errorEvent = shaka.util.FakeEvent.createErrorEvent(error);
      this.dispatchEvent(errorEvent);
    }
  }
};


/**
 * Requests a license.
 *
 * @param {!MediaKeySession} session An EME session object.
 * @param {!shaka.player.DrmSchemeInfo} drmScheme
 * @param {!ArrayBuffer} licenseRequestBody The license request's body.
 * @throws {TypeError}
 * @throws {Error}
 * @private
 */
shaka.media.EmeManager.prototype.requestLicense_ = function(
    session, drmScheme, licenseRequestBody) {
  shaka.log.debug('requestLicense_', session, drmScheme, licenseRequestBody);

  var info = this.createLicenseRequestInfo_(drmScheme, licenseRequestBody);

  // Apply common pre-processors
  if (drmScheme.keySystem === 'com.microsoft.playready') {
    this.playReadyLicensePreProcessor_(info);
  }

  var licenseRequest =
      new shaka.util.LicenseRequest(
          /** @type {string} */(info['url']),
          /** @type {(ArrayBuffer|?string)} */(info['body']),
          /** @type {string} */(info['method']),
          drmScheme.withCredentials,
          /** @type {Object.<string, string>} */(info['headers']),
          this.licenseRequestTimeout_);

  licenseRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!Uint8Array} response */
      function(response) {
        shaka.log.info('onLicenseSuccess_', session);
        if (drmScheme.licensePostProcessor) {
          response = drmScheme.licensePostProcessor(response);
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
 * Standard pre-processor for PlayReady license requests.
 *
 * @param {!shaka.player.DrmSchemeInfo.LicenseRequestInfo} info The license request info.
 *
 * @private
 */
shaka.media.EmeManager.prototype.playReadyLicensePreProcessor_ = function(info){
  /*
   The playready license body is actually an XML string, so need to convert
   info.body (which is a Uint8Array, holding UTF-16 text data) to a string
   XML typically has this structure (as an example):
   <PlayReadyKeyMessage type="LicenseAcquisition">
   <LicenseAcquisition Version="1">
   <Challenge encoding="base64encoded">{Base64EncodedBinaryChallengeData}</Challenge>
   <HttpHeaders>
   <HttpHeader><name>Content-Type</name><value>text/xml; charset=utf-8</value></HttpHeader>
   <HttpHeader><name>SOAPAction</name><value>"http://schemas.microsoft.com/DRM/2007/03/protocols/AcquireLicense"</value></HttpHeader>
   </HttpHeaders>
   </LicenseAcquisition>
   </PlayReadyKeyMessage>"
   Only challenge data is sent to the server, http errors are required to be added to the XHR object in order for the
   request to be processed correctly (e.g. may need to add a SOAPAction header as in the above example)
   */

  var licenseBodyXml = String.fromCharCode.apply(null, new Uint16Array(info.body['buffer']));
  var licenseBodyXmlDom = new DOMParser().parseFromString(licenseBodyXml, "application/xml");

  var headerNames = licenseBodyXmlDom.getElementsByTagName("name");
  var headerValues = licenseBodyXmlDom.getElementsByTagName("value");

  console.log(new XMLSerializer().serializeToString(licenseBodyXmlDom));
  //﻿<PlayReadyKeyMessage type="LicenseAcquisition"><LicenseAcquisition Version="1"><Challenge encoding="base64encoded">PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz48c29hcDpFbnZlbG9wZSB4bWxuczp4c2k9Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvWE1MU2NoZW1hLWluc3RhbmNlIiB4bWxuczp4c2Q9Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvWE1MU2NoZW1hIiB4bWxuczpzb2FwPSJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy9zb2FwL2VudmVsb3BlLyI+PHNvYXA6Qm9keT48QWNxdWlyZUxpY2Vuc2UgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vRFJNLzIwMDcvMDMvcHJvdG9jb2xzIj48Y2hhbGxlbmdlPjxDaGFsbGVuZ2UgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vRFJNLzIwMDcvMDMvcHJvdG9jb2xzL21lc3NhZ2VzIj48TEEgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vRFJNLzIwMDcvMDMvcHJvdG9jb2xzIiBJZD0iU2lnbmVkRGF0YSIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+PFZlcnNpb24+MTwvVmVyc2lvbj48Q29udGVudEhlYWRlcj48V1JNSEVBREVSIHhtbG5zPSJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL0RSTS8yMDA3LzAzL1BsYXlSZWFkeUhlYWRlciIgdmVyc2lvbj0iNC4wLjAuMCI+PERBVEE+PFBST1RFQ1RJTkZPPjxLRVlMRU4+MTY8L0tFWUxFTj48QUxHSUQ+QUVTQ1RSPC9BTEdJRD48L1BST1RFQ1RJTkZPPjxLSUQ+eDRxWDZxZDdlVU9DMmtNczBFeXJGdz09PC9LSUQ+PExBX1VSTD5odHRwczovL3R2b2xpLmNvbS9hcGkvZHJtL3YyL3BsYXlyZWFkeS9saWNlbnNlPC9MQV9VUkw+PERTX0lEPng0cVg2cWQ3ZVVPQzJrTXMwRXlyRnc9PTwvRFNfSUQ+PENVU1RPTUFUVFJJQlVURVMgeG1sbnM9IiI+PERSTVRZUEU+c21vb3RoPC9EUk1UWVBFPjxDSUQ+eDRxWDZxZDdlVU9DMmtNczBFeXJGdz09PC9DSUQ+PC9DVVNUT01BVFRSSUJVVEVTPjxDSEVDS1NVTT5KNDRxY1FOS1RJUT08L0NIRUNLU1VNPjwvREFUQT48L1dSTUhFQURFUj48L0NvbnRlbnRIZWFkZXI+PENMSUVOVElORk8+PENMSUVOVFZFUlNJT04+Mi4xMS4wLjIxNTQ8L0NMSUVOVFZFUlNJT04+PC9DTElFTlRJTkZPPjxSZXZvY2F0aW9uTGlzdHM+PFJldkxpc3RJbmZvPjxMaXN0SUQ+aW95ZFRsSzJwMFdYa1drbHByUjVIdz09PC9MaXN0SUQ+PFZlcnNpb24+MTA8L1ZlcnNpb24+PC9SZXZMaXN0SW5mbz48UmV2TGlzdEluZm8+PExpc3RJRD5nQzRJS0tQSHNVQ0NWaG5sdHRpYkp3PT08L0xpc3RJRD48VmVyc2lvbj4xMTwvVmVyc2lvbj48L1Jldkxpc3RJbmZvPjxSZXZMaXN0SW5mbz48TGlzdElEPkJPWjF6VDFVbkVxZkNmNXRKT2kva0E9PTwvTGlzdElEPjxWZXJzaW9uPjEyPC9WZXJzaW9uPjwvUmV2TGlzdEluZm8+PFJldkxpc3RJbmZvPjxMaXN0SUQ+RWYvUlVvalQzVTZDdDJqcVRDQ2hiQT09PC9MaXN0SUQ+PFZlcnNpb24+Mjk8L1ZlcnNpb24+PC9SZXZMaXN0SW5mbz48L1Jldm9jYXRpb25MaXN0cz48TGljZW5zZU5vbmNlPjV3Y3FCL2plQU5TWGJtU1NIZ2dRQnc9PTwvTGljZW5zZU5vbmNlPiA8RW5jcnlwdGVkRGF0YSB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxlbmMjIiBUeXBlPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGVuYyNFbGVtZW50Ij48RW5jcnlwdGlvbk1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMDQveG1sZW5jI2FlczEyOC1jYmMiPjwvRW5jcnlwdGlvbk1ldGhvZD48S2V5SW5mbyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnIyI+PEVuY3J5cHRlZEtleSB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxlbmMjIj48RW5jcnlwdGlvbk1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vRFJNLzIwMDcvMDMvcHJvdG9jb2xzI2VjYzI1NiI+PC9FbmNyeXB0aW9uTWV0aG9kPjxLZXlJbmZvIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjIj48S2V5TmFtZT5XTVJNU2VydmVyPC9LZXlOYW1lPjwvS2V5SW5mbz48Q2lwaGVyRGF0YT48Q2lwaGVyVmFsdWU+Zi9GMmZMaU1Fa0NUZlhDYjRvUWZRMytRUGV1RFdkYlY2MFJBVFN5VGNGWEtPWTBGaG5DRzBRMWRwaDloSTlFaUhyOXZwc0ZJMDFjOTR0K1gzdTgxT2djYmpqSEl2cGxkdEdUejExTXJ2Vm80VzF0T0xRQVF4dHJFR3MwSFNhMHBxV2RKZmY5UUZURHZ3TnAweXdmTmY1TGI1MVVoQzFta0s5QlZjdTN0QmV3PTwvQ2lwaGVyVmFsdWU+PC9DaXBoZXJEYXRhPjwvRW5jcnlwdGVkS2V5PjwvS2V5SW5mbz48Q2lwaGVyRGF0YT48Q2lwaGVyVmFsdWU+aFN3UFpVVGNLU1VvQU5iUzVTREN6YzRySUFWK2czMVh4aFZKWWZqYkQ2OGpuanEzbzZ5WVZ2c2hjUThvOHFIM1B3N2dpSThCK0ViYWt6K05vdTMxZW4rMVRnTWs0SnJjT25WL3RMOERvTFFjS2NlS0JKTGZkZXloRU52SWh3c1FhdzNlM2RudlE3S0oraDQrRmhVdWNxZ0YyL1FtUVIxcmdYcVlxYW95WUVkRzJ2L2dUNis1NDMyek1rZk1kSi95NkFEZU1abk9PR1o0eCs5VW9ESnVCWFk4UmtvUFZzNEk2eisxOVc5RElqT3IxR284VGZzb25vSGZ4VDl6b0c0OGcyOTQ0VUsybGI2NnZrc0o5ODNMUytBeWJ5cnJlNzdNalZYaFVhZksyQ3E0cVJxMXYwWHZnckRmUU9Ta3hIUzhHRGEyb0REaXlpcU5zV2VVL1lUZlFsUzluMlN0U05TWWNFb1pTMERlSkMzaG54aXNGQmlkN0lxR3BqYXFEUEJPUnZCQVlXZFNTTjNsYU5oaDJTdGtTdEtGYk1lelM4Rk1XZ1F6Y3NxMDRTT0JUb0VrdUhPNXE1Y2F2TUkxV2JGRGp5WnpYK2JFSEZsNWh1dVkvNnk2c2lpb01aTlZMcFlQUHRPQk8vdzRXVnBiSUFOUG9ydHZwZFJIQktXSUozNFdFS01CNCtKb3pVejFiampBVkd3Y2pOeUhaRHVwSmVIR29CcGljODJibWZ1NlZrdTJ2MExCMDI1aVpIVHVkSDQzQTRqZDI5Rks4b3VJTVU4UlVoa24xdDJraGM3ZEJ3QmVoMHRCcUJqcVlHSDJUYmJTbDdhSHdYeUhpYnp5aE1DU0t5RWFtWkhWT21GdGd0dXkyZGNnVlVHUDVmWlpJbXo3Qy83NkxHVjA1aUJaNVk4dWxiUjJFSHdFTWRkdjUva3lMdWowRmJBbXB2UmVWS2c0citQYnlBRUZwakMrNEZaN0k5Vjg3czJBR3EwMTE5NzAzUzhsd1krUmZ0WHZaWWZiTDRYc2FrK2VuYXo5blY4TVNHMGxET1NGc241elRoQ2N2RElsZUhWUnVHRkM2MUsxaXlkd3hrOXd5YlR3Wk5KK0F2OTFFNHZyK2E2R0lIVDM5NHBUY1hodTdITDEvbEhxbFYzTTNiZ2w3ZWNVT1FiYjRlTlQ3S2JCSHNlekVlYkVSdTRiYXRaRGkwNDhkVTl2dmxRNjhDckdFQlY1L24rMjl3RzNPN1JiY1NQMGNTVlk1VUhYc0FDaHd1dzRvKzNwaHNkVnQwcFFYa3NWSFpwaFJHT0NaWC9BNzZjQTBCSC9wSFp5ZHkxeGV5c1hDdjlIemhtOFNzZXNMbHBodnhuRWhzQzc0WDVVd1l1dEduaUVucUNtalcrd1pPK2VNcTFXcFMya2Q1T2EvZnplSC9Ec3JUK2tUZ1dqTXVGYmUxeEc3U1JsbW1GdldjRHdoL2F2aDRSV1VqV3lpdHJUWlByMExoaG50Zm9XcUROYmlsZUNHd0E2TnRGK3Y0aGdvQWFCQTJ4bnV2cVNYdldkZThvNXVPLy9VOStSR0RoeFV6ZzAyQUJZMlI1Mzh6QmFMNlRMVjdPdFFmb1ZnVlJlQ3kzSERRajRCN1I5VXoxRzR6amFGVnpOVTdzclZSVkE1ZTRpYjlmaVlIM1J4bGJ3ZVAvOWh3c01XMzA3NVQxR2Zla3NKZzNWT2ZhaEZUejVOMkp4Y3JVMis3bzJ4cnJuU3ZRK3ZqWFhZUmpwNUc2SkI0TkYyaFQ4a3FwKzQyL1gvanBZbDdmMTJzQk8xTW11VWx1amQ5bGZ0a2xjWDNISTlkYUhQNERoNTNvN3BPb0xvY0pIamxYK2NyRXRIQkxYY2RQKzVudWVUNVZ4c1dKWFBma1NrbUNBSkNsTDdGMWFxdlExZVdtT3VGRmlJNWRseGNXenFFL20wNTVROGhKOCtLUlVHaHIvcVVOL0k3YXlaNkVjWFVpcFpNOERpY3Jzbmhpc2tlVWd3bjRMNjFvY2gwdzFlNmRHY0kwTld5U2lXWDVVd2gzT1E2cmFYRUF1SmFSRW0rUElnZ2xlWXJHcTZmTEt0U3NFbzUyWi91Z1I1M1ZqdEZMUTZLcmV0WXhib3ROK0Fob1g3dG9uMGNEQ1VRb3FMYm4wbnNWVTltVk12cGFnT0ZVUTR3T21Sbm5DcUlkNXJ4NndzcDd2allFVGVIR2laZGl4TmFRem1UTDg2Q29xbWIzaDF3OGJ0bW1BYlJRaUg2MS95YTRZUTdNY3VMQkJDeExSVzUyWmp5MGZxbmJQcjYxRjhjZTdoYkMxSFJzeWszWkExbXVqRU5yYlNSc0IzSzloek9QOEhrL1JCRUpiRUIyQUg0d0dseHc5UStCSkloN2IwNU5mcFBvc2VpazBqZDFNcXVDamQvbUNMRWpZcGIrTTBYSmNaT3licEdJaGRldkpkNkYvV1dPZkxvWkFVczY4NG1UWE5BZEpya0pIUENGUVhncTFpeG5MU1U5L09zOHRudnBQNHdMUDBid2hkWVo0RS9oaGdjMkQ5SC9EYnFOMjdLRjBQVDNtZWhFeTl3KzFxdFNHS3RIcVk4NmJid0d4UE5OUkR3VitmV3JyUThOamtkc3Y4elVtTWhYR3Rsb2dWOXJ1eERNdHdCb1F4Y0lNTjloTXlnT2Q5aVlrejMvTUpWY0FidW1iTTRsVHczaWhpR2VFYUY4MjlzUUt2cHlTaFVYN0dSSUVNT2t4TmowSHZOeHNsVUsxVjY0S0l0S2xGbjBVcSs2RVlnQk1XWkFJaFRTTEZ1MmtKVC8zMnYzWlhUWkkzSkM0WEl4bDF6ZTd3WlZmblhBQWRUVTR1ZDdoc0RQZ2hDRE5qSXM3ZWNVRnJTTEVuY3hMNGx2WkpGUTRqdXdpUHdXcjFBOTQvT2VMcmdZdkJ5a1NoRWRwZ1BJaTJ0aWM2OUZydUJQNE5nUC9DdFMzR290S1BVQ0xVYmd2bm9lanR4dFlMS3pXRFNFMXdtOE5rNXBpQmdXSU1CZGNqM043R21lQ1F0bDBFVFA3dGpJR21QZ240S3Z6c3Q0Y05oeFpxZC9QZ3ZwMmYvYUtaUXI3SGl0alcvMDJHYWw4dkdvNWhXWmVudlh5OWVrb3ZRTS84SXR0VHc5cThNLy9yVFA1V0g5NGEzQWVaWWRMc0R5UGM2ekxEb2NZc3lJNER6SzRmTktPV2I3VHp2WUFmOVpxejkvVVVVRlZXRGQwYVQ2Q1BwYWhmMjZabWpoa0gxNVpzSUg2eC9ocEpJY3VmMnRXVFZuWUdyLzdwUk1BRmtXaGJtWjROTWs0K3daTUVzOFpwbFc3VlgzanE0RnBsMC9YamE3MnN0RDhMc25NekNBQjkxVnRaUGJ5a29oaEJRaElXcDlkYWVCUHZoUUpXWERyRE1TL25hUnlYTzB1dkxiQUZSSFhLRDc5V3k5NFc5azhVdnRLWEh5N2xob0tOMGszS3RQYmdabnBKTGZoZmNlMVg3cE1qdjViSkZmbzc0ZzhSckJrZG5jOHVHM2NFWXdFV1BXZnZ1NjdrTzB4dDU5RlFIaHc4ckUzcUNqZlc3UWtjVXBaRW1Sa0pua01YemdrdCtLeTRzZm5TbGZHOVNIZTVDSktyYkFmWTVjUHlObTEvY1BPRFhyN0Y0eHNJOGVFbTdySCtRZVJybFl2V1Y0NThqUzVvbzdyK0ZvaEN5L2tzQTluMEZyUXNJMXVUWFlMQm9yUTdGUWdIalBhZzZ1UHdjb1MrdjlYenhrUmo1ZnJ5WkdKV3dPanh1M0k0WjEwSDB2SVdmLzBEaEpDQllUR2NocEtiMVZHSDVKdzZhYnZNNkM2cVM2Tit1LzVpeGhseUxMeUcyN0gzZiswa29EZjhrYlROTkhSOWN2SmowZ3VpSm13djhKZks1dGVBcG1TaUlqdUxneEFQT3ZXQ2tuS0NWeGhsOG00QVVpMTJsZFNMcGxwbnhuWjR3bFB1SUMvMmVtYjI2SFl1VE9IdVo4UjU4amIvY2s1d3lTZ3FPS202Z3VvZUJlVUpVeHBjVGhleUhDMnBDM1lIU0VzU3lodXV5d1VqT3F1RlhlR3lZWHlnMk5lWk9jWElYSjBDNWVJczlqd1JDSkVwRVV3YUZwM2t1WkFrdEk5Y1Jrb2lDSkZQOW9nWUpNdisvYmFMQkt1NzR6elVHMmU3cHhwOU9LbGc0aldLeUQwdERENVZwdzQxTEVwRVpnV2VqSzg5bklyNGtMdFpCVkVLU2I1UVAyUDVneXhLM0xYNkdIMHVSMHA5YThuSnBHRk9VdGxzeHhFUnlpajZEK3ZONGRWazhzQWdaRHNyT0J4OWRmMnVkclloSld6bnVFNm1rQ1ZvRkVrRllweHRrbEdSYUxvbDJWd05Fb1IwSzlzU3d5MnI1dTJRcVYyQTFzMk5QR0NFc3BTekdrMENlUWJXRUtINERCYVk5OElDQ3N4aVUyR3Y5TlFQUmQ0b0djNkNZaHQ5OWpqWmV0RmtqN1U3a04waUZZYVFOa1llV3ZQZTBtRG9uNXFnZFVmNm5WRFVDL1hqSzd0Y3NLN1BJaGJXcStYRGlVL2ZiYmFEOTBkODJKWE00bDhDUUNrQ0lRdXJSMGNJU3BXRVhuUTdUMTNjWG9iK1V0ejRmWW4xU09wNG1wSnQ4VTVyNWtIYjJVZXZFU3FsK2M0eWdjSW5OS2tJMy9mQk1zdFlvZEoydTBjN1doa1RheWdXMWExMXUweTQvY0ZMQS9JMW5FL2Rrc05KNjZMWWdLOTZwQ3dvMEl4by9hcHJ2Y0tSbUFFV1Z1NDl2NFArbXJuQVVBUldOczF4Z1Qza2F6VXNSTVdOYWlaM3BMWGtoNDRkMGV3SExiUHB0Y0NBNklKS2hNZktaRVkyUHgwQittZm1lK2RnQUM2VHhtNXRxZ1I4Ny9KVkE1cDwvQ2lwaGVyVmFsdWU+PC9DaXBoZXJEYXRhPjwvRW5jcnlwdGVkRGF0YT48L0xBPjxTaWduYXR1cmUgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyMiPjxTaWduZWRJbmZvIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjIj48Q2Fub25pY2FsaXphdGlvbk1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnL1RSLzIwMDEvUkVDLXhtbC1jMTRuLTIwMDEwMzE1Ij48L0Nhbm9uaWNhbGl6YXRpb25NZXRob2Q+PFNpZ25hdHVyZU1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vRFJNLzIwMDcvMDMvcHJvdG9jb2xzI2VjZHNhLXNoYTI1NiI+PC9TaWduYXR1cmVNZXRob2Q+PFJlZmVyZW5jZSBVUkk9IiNTaWduZWREYXRhIj48RGlnZXN0TWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS9EUk0vMjAwNy8wMy9wcm90b2NvbHMjc2hhMjU2Ij48L0RpZ2VzdE1ldGhvZD48RGlnZXN0VmFsdWU+UjlaM2NqZzM5V1FKVGgvdW5Ca040Q3BQQ0UwQXRYcXdIVSt2N3VWWitZND08L0RpZ2VzdFZhbHVlPjwvUmVmZXJlbmNlPjwvU2lnbmVkSW5mbz48U2lnbmF0dXJlVmFsdWU+VUFMa0p2cEdaRWd5aGxtdGRsN1ZnVHlRY29oYnkweWhKUVk1bHJLa0xnL01PalVtbGU3Ly9RYWhZRUlBZ3hDTmNQV3ZpQzhKdXVSN2ZibzVvazZxOXc9PTwvU2lnbmF0dXJlVmFsdWU+PEtleUluZm8geG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyMiPjxLZXlWYWx1ZT48RUNDS2V5VmFsdWU+PFB1YmxpY0tleT4xRGViMEtCWnlVUlBkdHBjTzFZWXQ3QXBPYVBTQmZaU0YzWkJxSWpMenpFQ0JiZ2VtUVg3VUM3SFQ4bnhkbUJyVW44TnJYcVdrUHpVTk5KTi8wcEdtdz09PC9QdWJsaWNLZXk+PC9FQ0NLZXlWYWx1ZT48L0tleVZhbHVlPjwvS2V5SW5mbz48L1NpZ25hdHVyZT48L0NoYWxsZW5nZT48L2NoYWxsZW5nZT48L0FjcXVpcmVMaWNlbnNlPjwvc29hcDpCb2R5Pjwvc29hcDpFbnZlbG9wZT4=</Challenge><HttpHeaders><HttpHeader><name>Content-Type</name><value>text/xml; charset=utf-8</value></HttpHeader><HttpHeader><name>SOAPAction</name><value>"http://schemas.microsoft.com/DRM/2007/03/protocols/AcquireLicense"</value></HttpHeader></HttpHeaders></LicenseAcquisition></PlayReadyKeyMessage>

  for (var i = 0; i < headerNames.length; i++) {
    info.headers[headerNames[i].childNodes[0].nodeValue] =
      headerValues[i].childNodes[0].nodeValue;
  }

  info.body = window.atob(licenseBodyXmlDom
    .getElementsByTagName("Challenge")[0].childNodes[0].nodeValue);
}


/**
 * Creates a LicenseRequestInfo object, potentially calling a licenese request
 * pre-processor.
 *
 * @param {!shaka.player.DrmSchemeInfo} drmScheme
 * @param {!ArrayBuffer} licenseRequestBody
 * @return {!shaka.player.DrmSchemeInfo.LicenseRequestInfo} A LicenseRequestInfo
 *     object whose fields have correct types.
 * @throws TypeError if the application sets a LicenseRequestInfo field to the
 *     wrong type.
 * @throws Error if the application deletes a LicenseRequestInfo field or sets
 *     the |method| field of a LicenseRequestInfo object to something other than
 *     'GET' or 'POST'.
 * @private
 */
shaka.media.EmeManager.prototype.createLicenseRequestInfo_ = function(
    drmScheme, licenseRequestBody) {
  var info = {
    'url': drmScheme.licenseServerUrl,
    'body': (licenseRequestBody.slice ?
      licenseRequestBody.slice(0) : licenseRequestBody),
    'method': 'POST',
    'headers': {}
  };

  if (!drmScheme.licensePreProcessor) {
    return info;
  }

  // Pre-process the license request.
  drmScheme.licensePreProcessor(info);

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
 * Returns the DRM Scheme information.
 * @return {shaka.player.DrmSchemeInfo}
 */
shaka.media.EmeManager.prototype.getDrmScheme = function() {
  return this.drmScheme_;
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

