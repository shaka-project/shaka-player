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

goog.provide('shaka.media.DrmEngine');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Uint8ArrayUtils');



/**
 * @constructor
 * @param {!shaka.net.NetworkingEngine} networkingEngine
 * @param {function(!shaka.util.Error)} onError Called when an error occurs.
 * @param {function(!Object.<string, string>)} onKeyStatus Called when key
 *   status changes.  Argument is a map of hex key IDs to statuses.
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.DrmEngine = function(networkingEngine, onError, onKeyStatus) {
  /** @private {Array.<string>} */
  this.supportedTypes_ = null;

  /** @private {MediaKeys} */
  this.mediaKeys_ = null;

  /** @private {HTMLMediaElement} */
  this.video_ = null;

  /** @private {boolean} */
  this.initialized_ = false;

  /** @private {?shakaExtern.DrmInfo} */
  this.currentDrmInfo_ = null;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {!Array.<shaka.media.DrmEngine.ActiveSession>} */
  this.activeSessions_ = [];

  /** @private {!Array.<string>} */
  this.offlineSessionIds_ = [];

  /** @private {!shaka.util.PublicPromise} */
  this.allSessionsLoaded_ = new shaka.util.PublicPromise();

  /** @private {shaka.net.NetworkingEngine} */
  this.networkingEngine_ = networkingEngine;

  /** @private {?shakaExtern.DrmConfiguration} */
  this.config_ = null;

  /** @private {?function(!shaka.util.Error)} */
  this.onError_ = (function(err) {
    this.allSessionsLoaded_.reject(err);
    onError(err);
  }.bind(this));

  /** @private {!Object.<string, string>} */
  this.keyStatusByKeyId_ = {};

  /** @private {?function(!Object.<string, string>)} */
  this.onKeyStatus_ = onKeyStatus;

  /** @private {shaka.util.Timer} */
  this.keyStatusTimer_ = new shaka.util.Timer(
      this.processKeyStatusChanges_.bind(this));

  /** @private {boolean} */
  this.destroyed_ = false;

  /** @private {boolean} */
  this.isOffline_ = false;

  // Add a catch to the Promise to avoid console logs about uncaught errors.
  this.allSessionsLoaded_.catch(function() {});
};


/**
 * @typedef {{
 *   loaded: boolean,
 *   initData: Uint8Array,
 *   session: !MediaKeySession
 * }}
 *
 * @description A record to track sessions and suppress duplicate init data.
 * @property {boolean} loaded
 *   True once the key status has been updated (to a non-pending state).  This
 *   does not mean the session is 'usable'.
 * @property {Uint8Array} initData
 *   The init data used to create the session.
 * @property {!MediaKeySession} session
 *   The session object.
 */
shaka.media.DrmEngine.ActiveSession;


/** @override */
shaka.media.DrmEngine.prototype.destroy = function() {
  var Functional = shaka.util.Functional;
  this.destroyed_ = true;

  var async = this.activeSessions_.map(function(activeSession) {
    // Ignore any errors when closing the sessions.  One such error would be
    // an invalid state error triggered by closing a session which has not
    // generated any key requests.
    activeSession.session.close().catch(Functional.noop);
    goog.asserts.assert(activeSession.session.closed, 'Bad EME implementation');
    return activeSession.session.closed;
  });
  this.allSessionsLoaded_.reject();

  if (this.eventManager_)
    async.push(this.eventManager_.destroy());

  if (this.video_) {
    goog.asserts.assert(!this.video_.src, 'video src must be removed first!');
    async.push(this.video_.setMediaKeys(null).catch(Functional.noop));
  }

  if (this.keyStatusTimer_) {
    this.keyStatusTimer_.cancel();
  }
  this.keyStatusTimer_ = null;

  this.currentDrmInfo_ = null;
  this.supportedTypes_ = null;
  this.mediaKeys_ = null;
  this.video_ = null;
  this.eventManager_ = null;
  this.activeSessions_ = [];
  this.offlineSessionIds_ = [];
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
 * @param {!shakaExtern.Manifest} manifest The manifest is read for MIME type
 *   and DRM information to query EME. If the 'clearKeys' configuration is
 *   used, the manifest will be modified to force the use of Clear Key.
 * @param {boolean} offline True if we are storing or loading offline content.
 * @return {!Promise} Resolved if/when a key system has been chosen.
 */
shaka.media.DrmEngine.prototype.init = function(manifest, offline) {
  goog.asserts.assert(this.config_,
      'DrmEngine configure() must be called before init()!');

  /** @type {!Object.<string, MediaKeySystemConfiguration>} */
  var configsByKeySystem = {};

  /** @type {!Array.<string>} */
  var keySystemsInOrder = [];

  // |isOffline_| determines what kind of session to create.  The argument to
  // |prepareMediaKeyConfigs_| determines the kind of CDM to query for.  So
  // we still need persistent state when we are loading offline sessions.
  this.isOffline_ = offline;
  this.offlineSessionIds_ = manifest.offlineSessionIds;
  this.prepareMediaKeyConfigs_(
      manifest, offline || manifest.offlineSessionIds.length > 0,
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
    this.eventManager_.listen(video, 'encrypted', function(event) {
      // Don't complain about this twice.
      this.eventManager_.unlisten(video, 'encrypted');
      this.onError_(new shaka.util.Error(
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.ENCRYPTED_CONTENT_WITHOUT_DRM_INFO));
    }.bind(this));
    return Promise.resolve();
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
  if (this.currentDrmInfo_.serverCertificate) {
    setServerCertificate = this.mediaKeys_.setServerCertificate(
        this.currentDrmInfo_.serverCertificate);
    setServerCertificate = setServerCertificate.catch(function(exception) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.INVALID_SERVER_CERTIFICATE,
          exception.message));
    });
  }

  return Promise.all([setMediaKeys, setServerCertificate]).then(function() {
    if (this.destroyed_) return Promise.reject();

    this.createOrLoad();
    if (!this.currentDrmInfo_.initData.length &&
        !this.offlineSessionIds_.length) {
      // Explicit init data for any one stream or an offline session is
      // sufficient to suppress 'encrypted' events for all streams.
      var onEncrypted = /** @type {shaka.util.EventManager.ListenerType} */(
          this.onEncrypted_.bind(this));
      this.eventManager_.listen(this.video_, 'encrypted', onEncrypted);
    }
  }.bind(this)).catch(function(error) {
    if (this.destroyed_) return Promise.resolve();  // Ignore destruction errors
    return Promise.reject(error);
  }.bind(this));
};


/**
 * Removes the given offline sessions and deletes their data.  Must call init()
 * before this.
 *
 * @param {!Array.<string>} sessions
 * @return {!Promise}
 */
shaka.media.DrmEngine.prototype.removeSessions = function(sessions) {
  goog.asserts.assert(this.mediaKeys_ || !sessions.length,
                      'Must call init() before removeSessions');
  return Promise.all(sessions.map(function(sessionId) {
    return this.loadOfflineSession_(sessionId).then(function(session) {
      // This will be null on error, such as session not found.
      if (session)
        return session.remove();
    });
  }.bind(this)));
};


/**
 * Creates the sessions for the init data and waits for them to become ready.
 *
 * @return {!Promise}
 */
shaka.media.DrmEngine.prototype.createOrLoad = function() {
  var initDatas = this.currentDrmInfo_ ? this.currentDrmInfo_.initData : [];
  initDatas.forEach(function(initDataOverride) {
    this.createTemporarySession_(
        initDataOverride.initDataType, initDataOverride.initData);
  }.bind(this));
  this.offlineSessionIds_.forEach(function(sessionId) {
    this.loadOfflineSession_(sessionId);
  }.bind(this));

  if (!initDatas.length && !this.offlineSessionIds_.length)
    this.allSessionsLoaded_.resolve();
  return this.allSessionsLoaded_;
};


/** @return {boolean} */
shaka.media.DrmEngine.prototype.initialized = function() {
  return this.initialized_;
};


/** @return {string} */
shaka.media.DrmEngine.prototype.keySystem = function() {
  return this.currentDrmInfo_ ? this.currentDrmInfo_.keySystem : '';
};


/**
 * Returns an array of the media types supported by the current key system.
 * These will be full mime types (e.g. 'video/webm; codecs="vp8"').
 *
 * @return {Array.<string>}
 */
shaka.media.DrmEngine.prototype.getSupportedTypes = function() {
  return this.supportedTypes_;
};


/**
 * Returns the ID of the sessions currently active.
 *
 * @return {!Array.<string>}
 */
shaka.media.DrmEngine.prototype.getSessionIds = function() {
  return this.activeSessions_.map(function(session) {
    return session.session.sessionId;
  });
};


/**
 * Returns the DrmInfo that was used to initialize the current key system.
 *
 * @return {?shakaExtern.DrmInfo}
 */
shaka.media.DrmEngine.prototype.getDrmInfo = function() {
  return this.currentDrmInfo_;
};


/**
 * @param {!shakaExtern.Manifest} manifest
 * @param {boolean} offline True if we are storing or loading offline content.
 * @param {!Object.<string, MediaKeySystemConfiguration>} configsByKeySystem
 *   (Output parameter.)  A dictionary of configs, indexed by key system.
 * @param {!Array.<string>} keySystemsInOrder
 *   (Output parameter.)  A list of key systems in the order in which we
 *   encounter them.
 * @see https://goo.gl/nwdYnY for MediaKeySystemConfiguration spec
 * @private
 */
shaka.media.DrmEngine.prototype.prepareMediaKeyConfigs_ =
    function(manifest, offline, configsByKeySystem, keySystemsInOrder) {
  var clearKeyDrmInfo = this.configureClearKey_();

  // TODO: Remove once Edge has released a fix for https://goo.gl/vr2Vle
  var isEdge = navigator.userAgent.indexOf('Edge/') >= 0;

  manifest.periods.forEach(function(period) {
    period.streamSets.forEach(function(streamSet) {
      if (streamSet.type == 'text')
        return;  // skip

      // clearKey config overrides manifest DrmInfo if present.
      // The manifest is modified so that filtering in Player still works.
      if (clearKeyDrmInfo) {
        streamSet.drmInfos = [clearKeyDrmInfo];
      }

      streamSet.drmInfos.forEach(function(drmInfo) {
        this.fillInDrmInfoDefaults_(drmInfo);

        var config = configsByKeySystem[drmInfo.keySystem];
        if (!config) {
          config = {
            // ignore initDataTypes
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
          if (stream.codecs) {
            fullMimeType += '; codecs="' + stream.codecs + '"';
          }

          // Some DRM license providers requires that we have a default
          // KID from manifest in the wrapped license request
          // and needs to be accessible in a request filter
          if (stream.keyId) {
            drmInfo.keyIds.push(stream.keyId);
          }

          // Edge 13 fails this negotiation with NotSupportedError if more than
          // one entry is given, even if each entry individually would be
          // supported.  Bug filed: https://goo.gl/vr2Vle
          // TODO: Remove once Edge has released a fix.
          if (isEdge && drmInfo.keySystem == 'com.microsoft.playready' &&
              capabilities.length) {
            return;
          }
          capabilities.push({
            robustness: robustness,
            contentType: fullMimeType
          });
        }.bind(this));  // streamSet.streams.forEach
      }.bind(this));  // streamSet.drmInfos.forEach
    }.bind(this));  // period.streamSets.forEach
  }.bind(this));  // manifest.perios.forEach
};


/**
 * @param {!Object.<string, MediaKeySystemConfiguration>} configsByKeySystem
 *   A dictionary of configs, indexed by key system.
 * @param {!Array.<string>} keySystemsInOrder
 *   A list of key systems in the order in which we should query them.
 *   On a browser which supports multiple key systems, the order may indicate
 *   a real preference for the application.
 * @return {!Promise} Resolved if/when a key system has been chosen.
 * @private
 */
shaka.media.DrmEngine.prototype.queryMediaKeys_ =
    function(configsByKeySystem, keySystemsInOrder) {
  if (keySystemsInOrder.length == 1 && keySystemsInOrder[0] == '') {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.NO_RECOGNIZED_KEY_SYSTEMS));
  }

  // Wait to reject this initial Promise until we have built the entire chain.
  var instigator = new shaka.util.PublicPromise();
  var p = instigator;

  // Try key systems with configured license servers first.  We only have to try
  // key systems without configured license servers for diagnostic reasons, so
  // that we can differentiate between "none of these key systems are available"
  // and "some are available, but you did not configure them properly."  The
  // former takes precedence.
  [true, false].forEach(function(shouldHaveLicenseServer) {
    keySystemsInOrder.forEach(function(keySystem) {
      var config = configsByKeySystem[keySystem];

      var hasLicenseServer = config.drmInfos.some(function(info) {
        return !!info.licenseServerUri;
      });
      if (hasLicenseServer != shouldHaveLicenseServer) return;

      // If there are no tracks of a type, these should be not present.
      // Otherwise the query will fail.
      if (config.audioCapabilities.length == 0) {
        delete config.audioCapabilities;
      }
      if (config.videoCapabilities.length == 0) {
        delete config.videoCapabilities;
      }

      p = p.catch(function() {
        if (this.destroyed_) return Promise.reject();
        return navigator.requestMediaKeySystemAccess(keySystem, [config]);
      }.bind(this));
    }.bind(this));
  }.bind(this));

  p = p.catch(function() {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE));
  });

  p = p.then(function(mediaKeySystemAccess) {
    if (this.destroyed_) return Promise.reject();

    // Store the capabilities of the key system.
    var realConfig = mediaKeySystemAccess.getConfiguration();
    var audioCaps = realConfig.audioCapabilities || [];
    var videoCaps = realConfig.videoCapabilities || [];
    var caps = audioCaps.concat(videoCaps);
    this.supportedTypes_ = caps.map(function(c) { return c.contentType; });
    if (this.supportedTypes_.length == 0) {
      // Edge 13 does not report capabilities.  To work around this, set the
      // supported types to null, which Player will use as a signal that the
      // information is not available.
      // See: https://goo.gl/0cSuT2
      this.supportedTypes_ = null;
    }

    var originalConfig = configsByKeySystem[mediaKeySystemAccess.keySystem];
    this.createCurrentDrmInfo_(
        mediaKeySystemAccess.keySystem, originalConfig,
        originalConfig.drmInfos);

    if (!this.currentDrmInfo_.licenseServerUri) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.NO_LICENSE_SERVER_GIVEN));
    }

    return mediaKeySystemAccess.createMediaKeys();
  }.bind(this)).then(function(mediaKeys) {
    if (this.destroyed_) return Promise.reject();

    this.mediaKeys_ = mediaKeys;
    this.initialized_ = true;
  }.bind(this)).catch(function(exception) {
    if (this.destroyed_) return Promise.resolve();  // Ignore destruction errors

    // Don't rewrap a shaka.util.Error from earlier in the chain:
    this.currentDrmInfo_ = null;
    this.supportedTypes_ = null;
    if (exception instanceof shaka.util.Error) {
      return Promise.reject(exception);
    }

    // We failed to create MediaKeys.  This generally shouldn't happen.
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
    } else {
      shaka.log.error('No license server configured for ' + keySystem);
    }
  }

  if (!drmInfo.keyIds) {
    drmInfo.keyIds = [];
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
 * Create a DrmInfo using configured clear keys.
 * The server URI will be a data URI which decodes to a clearkey license.
 * @return {?shakaExtern.DrmInfo} or null if clear keys are not configured.
 * @private
 * @see https://goo.gl/6nPdhF for the spec on the clearkey license format.
 */
shaka.media.DrmEngine.prototype.configureClearKey_ = function() {
  var hasClearKeys = !shaka.util.MapUtils.empty(this.config_.clearKeys);
  if (!hasClearKeys) return null;

  var StringUtils = shaka.util.StringUtils;
  var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
  var keys = [];
  var keyIds = [];

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
    keyIds.push(keyObj.kid);
  }

  var jwkSet = {keys: keys};
  var license = JSON.stringify(jwkSet);

  // Use the keyids init data since is suggested by EME.
  // Suggestion: https://goo.gl/R72xp4
  // Format: https://goo.gl/75RCP6
  var initDataStr = JSON.stringify({'kids': keyIds});
  var initData = new Uint8Array(StringUtils.toUTF8(initDataStr));
  var initDatas = [{initData: initData, initDataType: 'keyids'}];

  return {
    keySystem: 'org.w3.clearkey',
    licenseServerUri: 'data:application/json;base64,' + window.btoa(license),
    distinctiveIdentifierRequired: false,
    persistentStateRequired: false,
    audioRobustness: '',
    videoRobustness: '',
    serverCertificate: null,
    initData: initDatas,
    keyIds: []
  };
};


/**
 * Creates a DrmInfo object describing the settings used to initialize the
 * engine.
 *
 * @param {string} keySystem
 * @param {MediaKeySystemConfiguration} config
 * @param {!Array.<shakaExtern.DrmInfo>} drmInfos
 * @private
 */
shaka.media.DrmEngine.prototype.createCurrentDrmInfo_ = function(
    keySystem, config, drmInfos) {
  /** @type {!Array.<string>} */
  var licenseServers = [];

  /** @type {!Array.<!Uint8Array>} */
  var serverCerts = [];

  /** @type {!Array.<!shakaExtern.InitDataOverride>} */
  var initDatas = [];

  /** @type {!Array.<string>} */
  var keyIds = [];

  this.processDrmInfos_(drmInfos, licenseServers, serverCerts, initDatas,
      keyIds);

  if (serverCerts.length > 1) {
    shaka.log.warning('Multiple unique server certificates found! ' +
                      'Only the first will be used.');
  }

  if (licenseServers.length > 1) {
    shaka.log.warning('Multiple unique license server URIs found! ' +
                      'Only the first will be used.');
  }

  // TODO: This only works when all DrmInfo have the same robustness.
  var audioRobustness =
      config.audioCapabilities ? config.audioCapabilities[0].robustness : '';
  var videoRobustness =
      config.videoCapabilities ? config.videoCapabilities[0].robustness : '';
  this.currentDrmInfo_ = {
    keySystem: keySystem,
    licenseServerUri: licenseServers[0],
    distinctiveIdentifierRequired: (config.distinctiveIdentifier == 'required'),
    persistentStateRequired: (config.persistentState == 'required'),
    audioRobustness: audioRobustness,
    videoRobustness: videoRobustness,
    serverCertificate: serverCerts[0],
    initData: initDatas,
    keyIds: keyIds
  };
};


/**
 * Extract license server, server cert, and init data from DrmInfos, taking
 * care to eliminate duplicates.
 *
 * @param {!Array.<shakaExtern.DrmInfo>} drmInfos
 * @param {!Array.<string>} licenseServers
 * @param {!Array.<!Uint8Array>} serverCerts
 * @param {!Array.<!shakaExtern.InitDataOverride>} initDatas
 * @param {!Array.<string>} keyIds
 * @private
 */
shaka.media.DrmEngine.prototype.processDrmInfos_ =
    function(drmInfos, licenseServers, serverCerts, initDatas, keyIds) {
  /**
   * @param {shakaExtern.InitDataOverride} a
   * @param {shakaExtern.InitDataOverride} b
   * @return {boolean}
   */
  function initDataOverrideEqual(a, b) {
    return a.initDataType == b.initDataType &&
           shaka.util.Uint8ArrayUtils.equal(a.initData, b.initData);
  }

  drmInfos.forEach(function(drmInfo) {
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

    if (drmInfo.keyIds) {
      for (var i = 0; i < drmInfo.keyIds.length; ++i) {
        if (keyIds.indexOf(drmInfo.keyIds[i]) == -1) {
          keyIds.push(drmInfo.keyIds[i]);
        }
      }
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
 * @param {string} sessionId
 * @return {!Promise.<MediaKeySession>}
 * @private
 */
shaka.media.DrmEngine.prototype.loadOfflineSession_ = function(sessionId) {
  var session;
  try {
    session = this.mediaKeys_.createSession('persistent-license');
  } catch (exception) {
    var error = new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.FAILED_TO_CREATE_SESSION,
        exception.message);
    this.onError_(error);
    return Promise.reject(error);
  }

  this.eventManager_.listen(session, 'message',
      /** @type {shaka.util.EventManager.ListenerType} */(
          this.onSessionMessage_.bind(this)));
  this.eventManager_.listen(session, 'keystatuseschange',
      this.onKeyStatusesChange_.bind(this));

  var activeSession = {initData: null, session: session, loaded: false};
  this.activeSessions_.push(activeSession);

  return session.load(sessionId).then(function(present) {
    if (this.destroyed_) return;

    if (!present) {
      var i = this.activeSessions_.indexOf(activeSession);
      goog.asserts.assert(i >= 0, 'Session must be in the array');
      this.activeSessions_.splice(i, 1);

      this.onError_(new shaka.util.Error(
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.OFFLINE_SESSION_REMOVED));
      return;
    }

    // TODO: We should get a key status change event.  Remove once Chrome CDM
    // is fixed.
    activeSession.loaded = true;
    if (this.activeSessions_.every(function(s) { return s.loaded; }))
      this.allSessionsLoaded_.resolve();

    return session;
  }.bind(this), function(error) {
    if (this.destroyed_) return;

    var i = this.activeSessions_.indexOf(activeSession);
    goog.asserts.assert(i >= 0, 'Session must be in the array');
    this.activeSessions_.splice(i, 1);

    this.onError_(new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.FAILED_TO_CREATE_SESSION,
        error.message));
  }.bind(this));
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
    if (this.isOffline_) {
      session = this.mediaKeys_.createSession('persistent-license');
    } else {
      session = this.mediaKeys_.createSession();
    }
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
  this.activeSessions_.push(
      {initData: initData, session: session, loaded: false});

  session.generateRequest(initDataType, initData.buffer).catch(function(error) {
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
      [this.currentDrmInfo_.licenseServerUri], this.config_.retryParameters);
  request.body = event.message;
  request.method = 'POST';
  // NOTE: allowCrossSiteCredentials can be set in a request filter.

  if (this.currentDrmInfo_.keySystem == 'com.microsoft.playready') {
    this.unpackPlayReadyRequest_(request);
  }

  this.networkingEngine_.request(requestType, request)
      .then(function(response) {
        if (this.destroyed_) return Promise.reject();

        // Request succeeded, now pass the response to the CDM.
        return session.update(response.data);
      }.bind(this), function(error) {
        // Ignore destruction errors
        if (this.destroyed_) return Promise.resolve();

        // Request failed!
        goog.asserts.assert(error instanceof shaka.util.Error,
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
 * Unpack PlayReady license requests.  Modifies the request object.
 * @param {shakaExtern.Request} request
 * @private
 */
shaka.media.DrmEngine.prototype.unpackPlayReadyRequest_ = function(request) {
  // The PlayReady license message as it comes from the CDM can't be directly
  // delivered to a license server.  Other CDMs do not seem to need this kind
  // of special handling.

  // The raw license message is UTF-16-encoded XML.  We need to unpack the
  // Challenge element (base64-encoded string containing the actual license
  // request) and any HttpHeader elements (sent as request headers).

  // Example XML:

  // <PlayReadyKeyMessage type="LicenseAcquisition">
  //   <LicenseAcquisition Version="1">
  //     <Challenge encoding="base64encoded">{Base64Data}</Challenge>
  //     <HttpHeaders>
  //       <HttpHeader>
  //         <name>Content-Type</name>
  //         <value>text/xml; charset=utf-8</value>
  //       </HttpHeader>
  //       <HttpHeader>
  //         <name>SOAPAction</name>
  //         <value>http://schemas.microsoft.com/DRM/etc/etc</value>
  //       </HttpHeader>
  //     </HttpHeaders>
  //   </LicenseAcquisition>
  // </PlayReadyKeyMessage>

  var xml = shaka.util.StringUtils.fromUTF16(
      request.body, true /* littleEndian */);
  var dom = new DOMParser().parseFromString(xml, 'application/xml');

  // Set request headers.
  var headers = dom.getElementsByTagName('HttpHeader');
  for (var i = 0; i < headers.length; ++i) {
    var name = headers[i].querySelector('name');
    var value = headers[i].querySelector('value');
    goog.asserts.assert(name && value, 'Malformed PlayReady headers!');
    request.headers[name.textContent] = value.textContent;
  }

  // Unpack the base64-encoded challenge.
  var challenge = dom.querySelector('Challenge');
  goog.asserts.assert(challenge, 'Malformed PlayReady challenge!');
  goog.asserts.assert(challenge.getAttribute('encoding') == 'base64encoded',
                      'Unexpected PlayReady challenge encoding!');
  request.body =
      shaka.util.Uint8ArrayUtils.fromBase64(challenge.textContent).buffer;
};


/**
 * @param {!Event} event
 * @private
 * @suppress {invalidCasts,unnecessaryCasts} to swap keyId and status
 */
shaka.media.DrmEngine.prototype.onKeyStatusesChange_ = function(event) {
  var session = /** @type {!MediaKeySession} */(event.target);

  // Locate the session in the active sessions list.
  var i;
  for (i = 0; i < this.activeSessions_.length; ++i) {
    if (this.activeSessions_[i].session == session) {
      break;
    }
  }
  goog.asserts.assert(i < this.activeSessions_.length,
                      'Key status change for inactive session!');
  if (i == this.activeSessions_.length) return;

  var keyStatusMap = session.keyStatuses;
  var hasExpiredKeys = false;

  if (keyStatusMap.forEach === undefined) {
    // Older versions of Firefox (<= 46) use the old MediaKeyStatusMap API, so
    // just forego checking key statuses on these versions: newer versions of
    // Firefox use the new MediaKeyStatusMap API.
    shaka.log.debug('keyStatuses.forEach missing!');
    keyStatusMap = [];
  }

  keyStatusMap.forEach(function(status, keyId) {
    // The spec has changed a few times on the exact order of arguments here.
    // As of 2016-06-30, Edge has the order reversed compared to the current
    // EME spec.  Given the back and forth in the spec, it may not be the only
    // one.  Try to detect this and compensate:
    if (typeof keyId == 'string') {
      var tmp = keyId;
      keyId = /** @type {ArrayBuffer} */(status);
      status = /** @type {string} */(tmp);
    }

    // Microsoft's implementation in Edge seems to present key IDs as
    // little-endian UUIDs, rather than big-endian or just plain array of bytes.
    // standard: 6e 5a 1d 26 - 27 57 - 47 d7 - 80 46 ea a5 d1 d3 4b 5a
    // on Edge:  26 1d 5a 6e - 57 27 - d7 47 - 80 46 ea a5 d1 d3 4b 5a
    // Bug filed: https://goo.gl/gnRSkJ

    // NOTE that we skip this if byteLength != 16.  This is used for the IE11
    // and Edge 12 EME polyfill, which uses single-byte dummy key IDs.
    if (this.currentDrmInfo_.keySystem == 'com.microsoft.playready' &&
        keyId.byteLength == 16) {
      // Read out some fields in little-endian:
      var dataView = new DataView(keyId);
      var part0 = dataView.getUint32(0, true /* LE */);
      var part1 = dataView.getUint16(4, true /* LE */);
      var part2 = dataView.getUint16(6, true /* LE */);
      // Write it back in big-endian:
      dataView.setUint32(0, part0, false /* BE */);
      dataView.setUint16(4, part1, false /* BE */);
      dataView.setUint16(6, part2, false /* BE */);
    }

    // Microsoft's implementation in IE11 and Edge seems to never set key
    // status to 'usable'.  It is stuck forever at 'status-pending'.  In spite
    // of this, the keys do seem to be usable and content plays correctly.
    // Bug filed: https://goo.gl/fcXEy1
    if (this.currentDrmInfo_.keySystem == 'com.microsoft.playready' &&
        status == 'status-pending') {
      status = 'usable';
    }

    if (status != 'status-pending') {
      this.activeSessions_[i].loaded = true;
      if (this.activeSessions_.every(function(s) { return s.loaded; }))
        this.allSessionsLoaded_.resolve();
    }

    if (status == 'expired') {
      hasExpiredKeys = true;
    }

    var keyIdHex = shaka.util.Uint8ArrayUtils.toHex(new Uint8Array(keyId));

    this.keyStatusByKeyId_[keyIdHex] = status;
  }.bind(this));

  // If the session has expired, close it.
  // Some CDMs do not have sub-second time resolution, so the key status may
  // fire with hundreds of milliseconds left until the stated expiration time.
  var msUntilExpiration = session.expiration - Date.now();
  if (msUntilExpiration < 0 || (hasExpiredKeys && msUntilExpiration < 1000)) {
    shaka.log.debug('Session has expired', session);
    this.activeSessions_.splice(i, 1);
    session.close();
  }

  // Batch up key status changes before checking them or notifying Player.
  // This handles cases where the statuses of multiple sessions are set
  // simultaneously by the browser before dispatching key status changes for
  // each of them.  By batching these up, we only send one status change event
  // and at most one EXPIRED error on expiration.
  this.keyStatusTimer_.schedule(0.1);
};


/**
 * @private
 */
shaka.media.DrmEngine.prototype.processKeyStatusChanges_ = function() {
  // If all keys are expired, fire an error.
  var allExpired = shaka.util.MapUtils.every(
      this.keyStatusByKeyId_, function(keyId, status) {
        return status == 'expired';
      });
  if (allExpired) {
    this.onError_(new shaka.util.Error(
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.EXPIRED));
  }

  this.onKeyStatus_(this.keyStatusByKeyId_);
};


/**
 * Returns true if the browser has recent EME APIs.
 *
 * @return {boolean}
 */
shaka.media.DrmEngine.isBrowserSupported = function() {
  var basic =
      !!window.MediaKeys &&
      !!window.navigator &&
      !!window.navigator.requestMediaKeySystemAccess &&
      !!window.MediaKeySystemAccess &&
      !!window.MediaKeySystemAccess.prototype.getConfiguration;

  return basic;
};


/**
 * Returns a Promise to a map of EME support for well-known key systems.
 *
 * @return {!Promise.<!Object.<string, ?shakaExtern.DrmSupportType>>}
 */
shaka.media.DrmEngine.probeSupport = function() {
  goog.asserts.assert(shaka.media.DrmEngine.isBrowserSupported(),
                      'Must have basic EME support');

  var tests = [];
  var testKeySystems = [
    'org.w3.clearkey',
    'com.widevine.alpha',
    'com.microsoft.playready',
    'com.apple.fps.2_0',
    'com.apple.fps.1_0',
    'com.apple.fps',
    'com.adobe.primetime'
  ];

  var basicVideoCapabilities = [
    { contentType: 'video/mp4; codecs="avc1.42E01E"' },
    { contentType: 'video/webm; codecs="vp8"' }
  ];

  var basicConfig = {
    videoCapabilities: basicVideoCapabilities
  };
  var offlineConfig = {
    videoCapabilities: basicVideoCapabilities,
    persistentState: 'required',
    sessionTypes: ['persistent-license']
  };

  // Try the offline config first, then fall back to the basic config.
  var configs = [offlineConfig, basicConfig];

  var support = {};
  testKeySystems.forEach(function(keySystem) {
    var p = navigator.requestMediaKeySystemAccess(keySystem, configs)
        .then(function(access) {
          // We can't (yet) trust every browser to report the session types they
          // support in access.getConfiguration().  Therefore, we create a
          // MediaKeys object and try to create an offline session.
          // https://goo.gl/gtYT3z, https://goo.gl/rvnB1g, https://goo.gl/z0URJ0
          return access.createMediaKeys();
        })
        .then(function(mediaKeys) {
          var persistentState = false;
          try {
            // This will throw if persistent licenses are not supported.
            mediaKeys.createSession('persistent-license');
            persistentState = true;
          } catch (e) {}

          support[keySystem] = {persistentState: persistentState};
        }, function() {
          support[keySystem] = null;
        });
    tests.push(p);
  });

  return Promise.all(tests).then(function() {
    return support;
  });
};
