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

goog.provide('shaka.media.DrmEngine');

goog.require('shaka.log');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Uint8ArrayUtils');



/**
 * @constructor
 * @param {!shaka.net.NetworkingEngine} networkingEngine
 * @param {function(!shaka.util.Error)} onError Called when an error occurs.
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.DrmEngine = function(networkingEngine, onError) {
  /** @private {string} */
  this.keySystem_ = '';

  /** @private {!Array.<shakaExtern.DrmInfo>} */
  this.drmInfos_ = [];

  /** @private {?MediaKeySystemConfiguration} */
  this.configuration_ = null;
  // TODO: re-evaluate the need for this, as it is not yet used.

  /** @private {MediaKeys} */
  this.mediaKeys_ = null;

  /** @private {HTMLMediaElement} */
  this.video_ = null;

  /** @private {boolean} */
  this.initialized_ = false;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {string} */
  this.licenseServerUri_ = '';

  /** @private {!Array.<shaka.media.DrmEngine.ActiveSession>} */
  this.activeSessions_ = [];

  /** @private {shaka.net.NetworkingEngine} */
  this.networkingEngine_ = networkingEngine;

  /** @private {?shakaExtern.DrmConfiguration} */
  this.config_ = null;

  /** @private {?function(!shaka.util.Error)} */
  this.onError_ = onError;

  /** @private {boolean} */
  this.destroyed_ = false;
};


/**
 * @typedef {{initData: !Uint8Array, session: !MediaKeySession}}
 * @description A record to track sessions and suppress duplicate init data.
 * @property {!Uint8Array} initData
 *     The init data used to create the session.
 * @property {!MediaKeySession} session
 *     The session object.
 */
shaka.media.DrmEngine.ActiveSession;


/** @override */
shaka.media.DrmEngine.prototype.destroy = function() {
  this.destroyed_ = true;

  this.activeSessions_.forEach(function(activeSession) {
    // Ignore any errors when closing the sessions.  One such error would be
    // an invalid state error triggered by closing a session which has not
    // generated any key requests.
    activeSession.session.close().catch(function() {});
  });

  var async = [];
  if (this.eventManager_)
    async.push(this.eventManager_.destroy());
  if (this.video_)
    async.push(this.video_.setMediaKeys(null).catch(function() {}));

  this.drmInfos_ = [];
  this.configuration_ = null;
  this.mediaKeys_ = null;
  this.video_ = null;
  this.eventManager_ = null;
  this.activeSessions_ = [];
  this.networkingEngine_ = null;  // We don't own it, don't destroy() it.
  this.config_ = null;
  this.onError_ = null;

  return Promise.all(async);
};


/**
 * Called by the Player to provide an updated configuration any time it changes.
 * Must be called at least once before init().
 *
 * @param {shakaExtern.DrmConfiguration} config
 */
shaka.media.DrmEngine.prototype.configure = function(config) {
  this.config_ = config;
};


/**
 * Negotiate for a key system and set up MediaKeys.
 * @param {!shakaExtern.Manifest} manifest
 * @param {boolean} offline True if we are storing or loading offline content.
 * @return {!Promise} Resolved if/when a key system has been chosen.
 */
shaka.media.DrmEngine.prototype.init = function(manifest, offline) {
  shaka.asserts.assert(this.config_,
      'DrmEngine configure() must be called before init()!');

  /** @type {!Object.<string, MediaKeySystemConfiguration>} */
  var configsByKeySystem = {};

  /** @type {!Array.<string>} */
  var keySystemsInOrder = [];

  this.prepareMediaKeyConfigs_(manifest, offline,
                               configsByKeySystem, keySystemsInOrder);

  if (!keySystemsInOrder.length) {
    // Unencrypted.
    this.initialized_ = true;
    return Promise.resolve();
  }

  return this.queryMediaKeys_(configsByKeySystem, keySystemsInOrder);
};


/**
 * Attach MediaKeys to the video element and start processing events.
 * @param {HTMLMediaElement} video
 * @return {!Promise}
 */
shaka.media.DrmEngine.prototype.attach = function(video) {
  if (!this.mediaKeys_) {
    // Unencrypted, or so we think.  We listen for encrypted events in order to
    // warn when the stream is encrypted, even though the manifest does not know
    // it.
    var onEncrypted = /** @type {shaka.util.EventManager.ListenerType} */(
        this.onEncrypted_.bind(this));
    this.eventManager_.listen(video, 'encrypted', function(event) {
      // Don't complain about this twice.
      this.eventManager_.unlisten(video, 'encrypted');
      this.onError_(new shaka.util.Error(
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.ENCRYPTED_CONTENT_WITHOUT_DRM_INFO));
    }.bind(this));
    return Promise.resolve();
  }

  /** @type {!Array.<string>} */
  var licenseServers = [];

  /** @type {!Array.<!Uint8Array>} */
  var serverCerts = [];

  /** @type {!Array.<!shakaExtern.InitDataOverride>} */
  var initDatas = [];

  this.processDrmInfos_(licenseServers, serverCerts, initDatas);

  if (serverCerts.length > 1) {
    shaka.log.warning('Multiple unique server certificates found! ' +
                      'Only the first will be used.');
  }

  if (licenseServers.length > 1) {
    shaka.log.warning('Multiple unique license server URIs found! ' +
                      'Only the first will be used.');
  }

  this.licenseServerUri_ = licenseServers[0];
  if (!this.licenseServerUri_) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.NO_LICENSE_SERVER_SPECIFIED,
        this.keySystem_));
  }

  this.video_ = video;

  var setMediaKeys = this.video_.setMediaKeys(this.mediaKeys_);
  setMediaKeys = setMediaKeys.catch(function(exception) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.FAILED_TO_ATTACH_TO_VIDEO,
        exception.message));
  });

  var setServerCertificate = null;
  if (serverCerts.length) {
    setServerCertificate = this.mediaKeys_.setServerCertificate(serverCerts[0]);
    setServerCertificate = setServerCertificate.catch(function(exception) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.INVALID_SERVER_CERTIFICATE,
          exception.message));
    });
  }

  return Promise.all([setMediaKeys, setServerCertificate]).then(function() {
    if (this.destroyed_) return Promise.reject();

    // TODO: load stored sessions?

    if (initDatas.length) {
      // Explicit init data for any one stream is sufficient to suppress
      // 'encrypted' events for all streams.
      initDatas.forEach(function(initDataOverride) {
        this.createTemporarySession_(initDataOverride.initDataType,
                                     initDataOverride.initData);
      }.bind(this));
    } else {
      var onEncrypted = /** @type {shaka.util.EventManager.ListenerType} */(
          this.onEncrypted_.bind(this));
      this.eventManager_.listen(this.video_, 'encrypted', onEncrypted);
    }
  }.bind(this)).catch(function(error) {
    if (this.destroyed_) return Promise.resolve();  // Ignore destruction errors
    return Promise.reject(error);
  }.bind(this));
};


/** @return {boolean} */
shaka.media.DrmEngine.prototype.initialized = function() {
  return this.initialized_;
};


/** @return {string} */
shaka.media.DrmEngine.prototype.keySystem = function() {
  return this.keySystem_;
};


/**
 * @param {!shakaExtern.Manifest} manifest
 * @param {boolean} offline True if we are storing or loading offline content.
 * @param {!Object.<string, MediaKeySystemConfiguration>} configsByKeySystem
 *     (Output parameter.)  A dictionary of configs, indexed by key system.
 * @param {!Array.<string>} keySystemsInOrder
 *     (Output parameter.)  A list of key systems in the order in which we
 *     encounter them.
 * @see https://goo.gl/nwdYnY for MediaKeySystemConfiguration spec
 * @private
 */
shaka.media.DrmEngine.prototype.prepareMediaKeyConfigs_ =
    function(manifest, offline, configsByKeySystem, keySystemsInOrder) {
  manifest.periods.forEach(function(period) {
    period.streamSets.forEach(function(streamSet) {
      if (streamSet.type == 'text')
        return;  // skip

      streamSet.drmInfos.forEach(function(drmInfo) {
        this.fillInDrmInfoDefaults_(drmInfo);

        var config = configsByKeySystem[drmInfo.keySystem];
        if (!config) {
          config = {
            initDataTypes: undefined,  // don't care.
            audioCapabilities: [],
            videoCapabilities: [],
            distinctiveIdentifier: 'optional',
            persistentState: offline ? 'required' : 'optional',
            sessionTypes: [offline ? 'persistent-license' : 'temporary'],
            label: drmInfo.keySystem,
            drmInfos: []  // tracked by us, ignored by EME
          };
          configsByKeySystem[drmInfo.keySystem] = config;
          keySystemsInOrder.push(drmInfo.keySystem);
        }

        config.drmInfos.push(drmInfo);

        if (drmInfo.distinctiveIdentifierRequired)
          config.distinctiveIdentifier = 'required';

        if (drmInfo.persistentStateRequired)
          config.persistentState = 'required';

        /** @type {!Array.<!MediaKeySystemMediaCapability>} */
        var capabilities = (streamSet.type == 'video') ?
            config.videoCapabilities : config.audioCapabilities;
        /** @type {string} */
        var robustness = ((streamSet.type == 'video') ?
            drmInfo.videoRobustness : drmInfo.audioRobustness) || '';

        streamSet.streams.forEach(function(stream) {
          var fullMimeType = stream.mimeType;
          if (stream.codecs)
            fullMimeType += '; codecs="' + stream.codecs + '"';

          capabilities.push({
            robustness: robustness,
            contentType: fullMimeType
          });  // capabilities.push
        }.bind(this));  // streamSet.streams.forEach
      }.bind(this));  // streamSet.drmInfos.forEach
    }.bind(this));  // period.streamSets.forEach
  }.bind(this));  // manifest.perios.forEach
};


/**
 * @param {!Object.<string, MediaKeySystemConfiguration>} configsByKeySystem
 *     A dictionary of configs, indexed by key system.
 * @param {!Array.<string>} keySystemsInOrder
 *     A list of key systems in the order in which we should query them.
 *     On a browser which supports multiple key systems, the order may indicate
 *     a real preference for the application.
 * @return {!Promise} Resolved if/when a key system has been chosen.
 * @private
 */
shaka.media.DrmEngine.prototype.queryMediaKeys_ =
    function(configsByKeySystem, keySystemsInOrder) {
  // Wait to reject this initial Promise until we have built the entire chain.
  var instigator = new shaka.util.PublicPromise();
  var p = instigator;

  if (keySystemsInOrder.length == 1 && keySystemsInOrder[0] == '') {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.NO_RECOGNIZED_KEY_SYSTEMS));
  }

  keySystemsInOrder.forEach(function(keySystem) {
    var config = configsByKeySystem[keySystem];
    // If there are no tracks of a type, these should be undefined, not empty.
    // Otherwise the query will fail.
    if (config.audioCapabilities.length == 0) {
      config.audioCapabilities = undefined;
    }
    if (config.videoCapabilities.length == 0) {
      config.videoCapabilities = undefined;
    }

    p = p.catch(function() {
      if (this.destroyed_) return Promise.reject();
      return navigator.requestMediaKeySystemAccess(keySystem, [config]);
    }.bind(this));
  }.bind(this));

  p = p.catch(function() {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.REQUESTED_KEY_SYSTEMS_UNAVAILABLE));
  });

  p = p.then(function(mediaKeySystemAccess) {
    if (this.destroyed_) return Promise.reject();

    var originalConfig = configsByKeySystem[mediaKeySystemAccess.keySystem];
    this.drmInfos_ = originalConfig.drmInfos;
    this.keySystem_ = mediaKeySystemAccess.keySystem;
    // NOTE: this may differ from the configuration in the request, in that
    // it may be more specific.
    this.configuration_ = mediaKeySystemAccess.getConfiguration();
    return mediaKeySystemAccess.createMediaKeys();
  }.bind(this)).then(function(mediaKeys) {
    if (this.destroyed_) return Promise.reject();

    this.mediaKeys_ = mediaKeys;
    this.initialized_ = true;
  }.bind(this)).catch(function(exception) {
    if (this.destroyed_) return Promise.resolve();  // Ignore destruction errors

    // Don't rewrap a shaka.util.Error from earlier in the chain:
    if (exception instanceof shaka.util.Error) {
      return Promise.reject(exception);
    }

    // We failed to create MediaKeys.  This generally shouldn't happen.
    this.keySystem_ = '';
    this.drmInfos_ = [];
    this.configuration_ = null;
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.FAILED_TO_CREATE_CDM,
        exception.message));
  }.bind(this));

  instigator.reject();
  return p;
};


/**
 * Use this.config_ to fill in missing values in drmInfo.
 * @param {shakaExtern.DrmInfo} drmInfo
 * @private
 */
shaka.media.DrmEngine.prototype.fillInDrmInfoDefaults_ = function(drmInfo) {
  var keySystem = drmInfo.keySystem;

  if (!keySystem) {
    // This is a placeholder from the manifest parser for an unrecognized key
    // system.  Skip this entry, to avoid logging nonsensical errors.
    return;
  }

  if (!drmInfo.licenseServerUri) {
    var server = this.config_.servers[keySystem];
    if (server) {
      drmInfo.licenseServerUri = server;
    } else if (keySystem == 'org.w3.clearkey') {
      var hasClearKeys = Object.keys(this.config_.clearKeys).length != 0;
      if (hasClearKeys) {
        this.configureClearKey_(drmInfo);
      } else {
        shaka.log.error('No keys configured for ' + keySystem);
      }
    } else {
      shaka.log.error('No license server configured for ' + keySystem);
    }
  }

  var advanced = this.config_.advanced[keySystem];
  if (advanced) {
    if (!drmInfo.distinctiveIdentifierRequired) {
      drmInfo.distinctiveIdentifierRequired =
          advanced.distinctiveIdentifierRequired;
    }

    if (!drmInfo.persistentStateRequired) {
      drmInfo.persistentStateRequired = advanced.persistentStateRequired;
    }

    if (!drmInfo.videoRobustness) {
      drmInfo.videoRobustness = advanced.videoRobustness;
    }

    if (!drmInfo.audioRobustness) {
      drmInfo.audioRobustness = advanced.audioRobustness;
    }

    if (!drmInfo.serverCertificate) {
      drmInfo.serverCertificate = advanced.serverCertificate;
    }
  }
};


/**
 * Set license server URI and init data using configured clear keys.
 * The server URI will be a data URI which decodes to a clearkey license.
 * @param {shakaExtern.DrmInfo} drmInfo
 * @private
 * @see https://goo.gl/6nPdhF for the spec on the clearkey license format.
 */
shaka.media.DrmEngine.prototype.configureClearKey_ = function(drmInfo) {
  var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
  var keys = [];
  var initDatas = [];

  for (var keyIdHex in this.config_.clearKeys) {
    var keyHex = this.config_.clearKeys[keyIdHex];

    var keyId = Uint8ArrayUtils.fromHex(keyIdHex);
    var key = Uint8ArrayUtils.fromHex(keyHex);
    var keyObj = {
      kty: 'oct',
      kid: Uint8ArrayUtils.toBase64(keyId, false),
      k: Uint8ArrayUtils.toBase64(key, false)
    };

    keys.push(keyObj);

    // WebM init data format is a single ID, so this is the best fit for now.
    var initDataOverride = {
      'initData': keyId,
      'initDataType': 'webm'
    };
    initDatas.push(initDataOverride);
  }

  var jwkSet = {keys: keys};
  var license = JSON.stringify(jwkSet);

  if (drmInfo.initData && drmInfo.initData.length) {
    shaka.log.warning('Manifest-provided init-data conflicts with ' +
                      'configuration in drm.clearKeys. ' +
                      'Configuration overrides the manifest!');
  }

  drmInfo.initData = initDatas;
  drmInfo.licenseServerUri = 'data:application/json;base64,' +
      window.btoa(license);
};


/**
 * Extract license server, server cert, and init data from DrmInfos, taking
 * care to eliminate duplicates.
 *
 * @param {!Array.<string>} licenseServers
 * @param {!Array.<!Uint8Array>} serverCerts
 * @param {!Array.<!shakaExtern.InitDataOverride>} initDatas
 * @private
 */
shaka.media.DrmEngine.prototype.processDrmInfos_ =
    function(licenseServers, serverCerts, initDatas) {
  /**
   * @param {shakaExtern.InitDataOverride} a
   * @param {shakaExtern.InitDataOverride} b
   * @return {boolean}
   */
  function initDataOverrideEqual(a, b) {
    return a.initDataType == b.initDataType &&
           shaka.util.Uint8ArrayUtils.equal(a.initData, b.initData);
  }

  this.drmInfos_.forEach(function(drmInfo) {
    // Aliases:
    var ArrayUtils = shaka.util.ArrayUtils;
    var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

    // Build an array of unique license servers.
    if (licenseServers.indexOf(drmInfo.licenseServerUri) == -1) {
      licenseServers.push(drmInfo.licenseServerUri);
    }

    // Build an array of unique server certs.
    if (drmInfo.serverCertificate) {
      if (ArrayUtils.indexOf(serverCerts, drmInfo.serverCertificate,
                             Uint8ArrayUtils.equal) == -1) {
        serverCerts.push(drmInfo.serverCertificate);
      }
    }

    // Build an array of unique init datas.
    if (drmInfo.initData) {
      drmInfo.initData.forEach(function(initDataOverride) {
        if (ArrayUtils.indexOf(initDatas, initDataOverride,
                               initDataOverrideEqual) == -1) {
          initDatas.push(initDataOverride);
        }
      });
    }
  });
};


/**
 * @param {!MediaEncryptedEvent} event
 * @private
 */
shaka.media.DrmEngine.prototype.onEncrypted_ = function(event) {
  // Aliases:
  var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

  var initData = new Uint8Array(event.initData);

  // Suppress duplicate init data.
  // Note that some init data are extremely large and can't portably be used as
  // keys in a dictionary.
  for (var i = 0; i < this.activeSessions_.length; ++i) {
    if (Uint8ArrayUtils.equal(initData, this.activeSessions_[i].initData)) {
      shaka.log.debug('Ignoring duplicate init data.');
      return;
    }
  }

  this.createTemporarySession_(event.initDataType, initData);
};


/**
 * @param {string} initDataType
 * @param {!Uint8Array} initData
 * @private
 */
shaka.media.DrmEngine.prototype.createTemporarySession_ =
    function(initDataType, initData) {
  var session;
  try {
    session = this.mediaKeys_.createSession();
  } catch (exception) {
    this.onError_(new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.FAILED_TO_CREATE_SESSION,
        exception.message));
    return;
  }

  this.eventManager_.listen(session, 'message',
      /** @type {shaka.util.EventManager.ListenerType} */(
          this.onSessionMessage_.bind(this)));
  this.eventManager_.listen(session, 'keystatuseschange',
      this.onKeyStatusesChange_.bind(this));

  var p = session.generateRequest(initDataType, initData.buffer);
  this.activeSessions_.push({initData: initData, session: session});

  p.catch(function(error) {
    if (this.destroyed_) return;

    for (var i = 0; i < this.activeSessions_.length; ++i) {
      if (this.activeSessions_[i].session == session) {
        this.activeSessions_.splice(i, 1);
        break;
      }
    }
    this.onError_(new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.FAILED_TO_GENERATE_LICENSE_REQUEST,
        error.message));
  }.bind(this));
};


/**
 * @param {!MediaKeyMessageEvent} event
 * @private
 */
shaka.media.DrmEngine.prototype.onSessionMessage_ = function(event) {
  /** @type {!MediaKeySession} */
  var session = event.target;

  var requestType = shaka.net.NetworkingEngine.RequestType.LICENSE;
  var request = shaka.net.NetworkingEngine.makeRequest(
      [this.licenseServerUri_], this.config_.retryParameters);
  request.body = event.message;
  request.method = 'POST';
  // NOTE: allowCrossSiteCredentials can be set in a request filter.

  // TODO: PlayReady pre-processor here?  Or as a response filter?
  this.networkingEngine_.request(requestType, request)
      .then(function(response) {
        if (this.destroyed_) return Promise.reject();

        // Request succeeded, now pass the response to the CDM.
        return session.update(response.data);
      }.bind(this), function(error) {
        // Ignore destruction errors
        if (this.destroyed_) return Promise.resolve();

        // Request failed!
        shaka.asserts.assert(error instanceof shaka.util.Error,
                             'Wrong NetworkingEngine error type!');
        this.onError_(new shaka.util.Error(
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.LICENSE_REQUEST_FAILED,
            error));
      }.bind(this)).catch(function(error) {
        // Ignore destruction errors
        if (this.destroyed_) return Promise.resolve();

        // Session update failed!
        this.onError_(new shaka.util.Error(
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED,
            error.message));
      }.bind(this));
};


/**
 * @param {!Event} event
 * @private
 */
shaka.media.DrmEngine.prototype.onKeyStatusesChange_ = function(event) {
  var session = /** @type {!MediaKeySession} */(event.target);
  var keyStatusMap = session.keyStatuses;

  /** @type {!Object.<string, string>} */
  var keyStatusByKeyId = {};

  var itr = keyStatusMap.keys();
  for (var key = itr.next(); !key.done; key = itr.next()) {
    var keyAsHexString =
        shaka.util.Uint8ArrayUtils.toHex(new Uint8Array(key.value));
    var status = keyStatusMap.get(key.value);
    shaka.asserts.assert(status, 'Key status must have a value!');
    keyStatusByKeyId[keyAsHexString] = /** @type {string} */(status);
  }

  // If the session has expired, close it.
  if (session.expiration < Date.now()) {
    shaka.log.debug('Session has expired', session);
    for (var i = 0; i < this.activeSessions_.length; ++i) {
      if (this.activeSessions_[i].session == session) {
        this.activeSessions_.splice(i, 1);
        break;
      }
    }
    session.close();
  }

  // TODO: push key status information up, use it to enable/disable streams
};


/**
 * Returns a Promise to a map of EME support for well-known key systems.
 *
 * @return {!Promise.<!Object.<string, boolean>>}
 */
shaka.media.DrmEngine.support = function() {
  // Every object in the support hierarchy has a "basic" member.
  // All "basic" members must be true for the library to be usable.
  var basic =
      !!window.MediaKeys &&
      !!window.navigator &&
      !!window.navigator.requestMediaKeySystemAccess &&
      !!window.MediaKeySystemAccess &&
      !!window.MediaKeySystemAccess.prototype.getConfiguration;

  var support = {'basic': basic};

  var tests = [];
  if (support['basic']) {
    var testKeySystems = [
      'org.w3.clearkey',
      'com.widevine.alpha',
      'com.microsoft.playready',
      'com.apple.fps.2_0',
      'com.apple.fps.1_0',
      'com.apple.fps',
      'com.adobe.primetime'
    ];

    testKeySystems.forEach(function(keySystem) {
      var p = navigator.requestMediaKeySystemAccess(keySystem, [{}])
          .then(function() {
            support[keySystem] = true;
          }, function() {
            support[keySystem] = false;
          });
      tests.push(p);
    });
  }

  return Promise.all(tests).then(function() {
    return support;
  });
};
