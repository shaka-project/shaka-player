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
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Uint8ArrayUtils');



/**
 * @param {shaka.media.DrmEngine.PlayerInterface} playerInterface
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.DrmEngine = function(playerInterface) {
  /** @private {?shaka.media.DrmEngine.PlayerInterface} */
  this.playerInterface_ = playerInterface;

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

  /** @private {?shakaExtern.DrmConfiguration} */
  this.config_ = null;

  /** @private {?function(!shaka.util.Error)} */
  this.onError_ = (function(err) {
    this.allSessionsLoaded_.reject(err);
    playerInterface.onError(err);
  }.bind(this));

  /**
   * The most recent key status information we have.
   * We may not have announced this information to the outside world yet,
   * which we delay to batch up changes and avoid spurious "missing key" errors.
   * @private {!Object.<string, string>}
   */
  this.keyStatusByKeyId_ = {};

  /**
   * The key statuses most recently announced to other classes.
   * We may have more up-to-date information being collected in
   * this.keyStatusByKeyId_, which has not been batched up and released yet.
   * @private {!Object.<string, string>}
   */
  this.announcedKeyStatusByKeyId_ = {};

  /** @private {shaka.util.Timer} */
  this.keyStatusTimer_ = new shaka.util.Timer(
      this.processKeyStatusChanges_.bind(this));

  /**
   * A flag to signal when have started destroying ourselves. This will:
   *  1. Stop later calls to |destroy| from trying to destroy the already
   *     destroyed (or currently destroying) DrmEngine.
   *  2. Stop in-progress async operations from continuing.
   *
   * @private {boolean}
   */
  this.isDestroying_ = false;

  /**
   * A promise that will only resolve once we have finished destroying
   * ourselves, this is used to ensure that subsequent calls to |destroy| don't
   * resolve before the first call to |destroy|.
   *
   * @private {!shaka.util.PublicPromise}
   */
  this.finishedDestroyingPromise_ = new shaka.util.PublicPromise();

  /** @private {boolean} */
  this.isOffline_ = false;

  /** @private {!Array.<!MediaKeyMessageEvent>} */
  this.mediaKeyMessageEvents_ = [];

  /** @private {boolean} */
  this.initialRequestsSent_ = false;

  /** @private {?shaka.util.Timer} */
  this.expirationTimer_ = new shaka.util.Timer(this.pollExpiration_.bind(this));
  this.expirationTimer_.scheduleRepeated(1);

  // Add a catch to the Promise to avoid console logs about uncaught errors.
  this.allSessionsLoaded_.catch(function() {});
};


/**
 * @typedef {{
 *   loaded: boolean,
 *   initData: Uint8Array,
 *   session: !MediaKeySession,
 *   oldExpiration: number,
 *   updatePromise: shaka.util.PublicPromise
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
 * @property {number} oldExpiration
 *   The expiration of the session on the last check.  This is used to fire
 *   an event when it changes.
 * @property {shaka.util.PublicPromise} updatePromise
 *   An optional Promise that will be resolved/rejected on the next update()
 *   call.  This is used to track the 'license-release' message when calling
 *   remove().
 */
shaka.media.DrmEngine.ActiveSession;


/**
 * @typedef {{
 *   netEngine: !shaka.net.NetworkingEngine,
 *   onError: function(!shaka.util.Error),
 *   onKeyStatus: function(!Object.<string,string>),
 *   onExpirationUpdated: function(string,number),
 *   onEvent: function(!Event)
 * }}
 *
 * @property {shaka.net.NetworkingEngine} netEngine
 *   The NetworkingEngine instance to use.  The caller retains ownership.
 * @property {function(!shaka.util.Error)} onError
 *   Called when an error occurs.  If the error is recoverable (see
 *   {@link shaka.util.Error}) then the caller may invoke either
 *   StreamingEngine.switch*() or StreamingEngine.seeked() to attempt recovery.
 * @property {function(!Object.<string,string>)} onKeyStatus
 *   Called when key status changes.  The argument is a map of hex key IDs to
 *   statuses.
 * @property {function(string,number)} onExpirationUpdated
 *   Called when the session expiration value changes.
 * @property {function(!Event)} onEvent
 *   Called when an event occurs that should be sent to the app.
 */
shaka.media.DrmEngine.PlayerInterface;


/** @override */
shaka.media.DrmEngine.prototype.destroy = async function() {
  // If we have started destroying ourselves, wait for the common "I am finished
  // being destroyed" promise to be resolved.
  if (this.isDestroying_) {
    await this.finishedDestroyingPromise_;
  } else {
    this.isDestroying_ = true;
    await this.destroyNow_();
    this.finishedDestroyingPromise_.resolve();
  }
};


/**
 * Destroy this instance of DrmEngine. This assumes that all other checks about
 * "if it should" have passed.
 *
 * @private
 */
shaka.media.DrmEngine.prototype.destroyNow_ = async function() {
  // |eventManager_| should only be |null| after we call |destroy|. Destroy it
  // first so that we will stop responding to events.
  await this.eventManager_.destroy();
  this.eventManager_ = null;

  // Since we are destroying ourselves, we don't want to react to the "all
  // sessions loaded" event.
  this.allSessionsLoaded_.reject();

  // Stop all timers. This will ensure that they do not start any new work while
  // we are destroying ourselves.
  this.expirationTimer_.cancel();
  this.expirationTimer_ = null;

  this.keyStatusTimer_.cancel();
  this.keyStatusTimer_ = null;

  // Close all open sessions.
  const openSessions = this.activeSessions_;
  this.activeSessions_ = [];

  // Close all sessions before we remove media keys from the video element.
  await Promise.all(openSessions.map((session) => {
    return Promise.resolve().then(async () => {
      shaka.log.v1('Closing session', session.sessionId);

      try {
        await shaka.media.DrmEngine.closeSession_(session.session);
      } catch (error) {
        // Ignore errors when closing the sessions. Closing a session that
        // generated no key requests will throw an error.
      }
    });
  }));

  // |video_| will be |null| if we never attached to a video element.
  if (this.video_) {
    goog.asserts.assert(!this.video_.src, 'video src must be removed first!');

    try {
      await this.video_.setMediaKeys(null);
    } catch (error) {
      // Ignore any failures while removing media keys from the video element.
    }

    this.video_ = null;
  }

  // Break references to everything else we hold internally.
  this.currentDrmInfo_ = null;
  this.supportedTypes_ = null;
  this.mediaKeys_ = null;
  this.offlineSessionIds_ = [];
  this.config_ = null;
  this.onError_ = null;
  this.playerInterface_ = null;
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
 *   and DRM information to query EME.  If the 'clearKeys' configuration is
 *   used, the manifest will be modified to force the use of Clear Key.
 * @param {boolean} offline True if we are storing or loading offline content.
 * @return {!Promise} Resolved if/when a key system has been chosen.
 */
shaka.media.DrmEngine.prototype.init = function(manifest, offline) {
  goog.asserts.assert(this.config_,
      'DrmEngine configure() must be called before init()!');

  /** @type {!Object.<string, MediaKeySystemConfiguration>} */
  let configsByKeySystem = {};

  /** @type {!Array.<string>} */
  let keySystemsInOrder = [];

  // If initial manifest contains unencrypted content, drm configuration
  // overrides DrmInfo so drmEngine can be activated. Thus, the player can play
  // encrypted content if live stream switches from unencrypted content to
  // encrypted content during live streams.
  let isEncryptedContent = manifest.periods.some((period) => {
    return period.variants.some((variant) => variant.drmInfos.length);
  });

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

  return this.queryMediaKeys_(
      configsByKeySystem, keySystemsInOrder, isEncryptedContent);
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
    // Don't complain about this twice, so just listenOnce().
    this.eventManager_.listenOnce(video, 'encrypted', function(event) {
      this.onError_(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.ENCRYPTED_CONTENT_WITHOUT_DRM_INFO));
    }.bind(this));
    return Promise.resolve();
  }

  this.video_ = video;

  this.eventManager_.listenOnce(this.video_, 'play', this.onPlay_.bind(this));

  let setMediaKeys = this.video_.setMediaKeys(this.mediaKeys_);
  setMediaKeys = setMediaKeys.catch(function(exception) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.FAILED_TO_ATTACH_TO_VIDEO,
        exception.message));
  });

  let setServerCertificate = null;
  if (this.currentDrmInfo_.serverCertificate &&
      this.currentDrmInfo_.serverCertificate.length) {
    setServerCertificate = this.mediaKeys_.setServerCertificate(
        this.currentDrmInfo_.serverCertificate).then(function(supported) {
      if (!supported) {
        shaka.log.warning('Server certificates are not supported by the key' +
                          ' system.  The server certificate has been ignored.');
      }
    }).catch(function(exception) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.INVALID_SERVER_CERTIFICATE,
          exception.message));
    });
  }

  return Promise.all([setMediaKeys, setServerCertificate]).then(() => {
    if (this.isDestroying_) { return Promise.reject(); }

    this.createOrLoad();
    if (!this.currentDrmInfo_.initData.length &&
        !this.offlineSessionIds_.length) {
      // Explicit init data for any one stream or an offline session is
      // sufficient to suppress 'encrypted' events for all streams.
      const cb = (e) =>
          this.newInitData(e.initDataType, new Uint8Array(e.initData));
      this.eventManager_.listen(this.video_, 'encrypted', cb);
    }
  }).catch((error) => {
    if (this.isDestroying_) { return; }
    return Promise.reject(error);
  });
};


/**
 * Removes the given offline sessions and deletes their data.  Must call init()
 * before this.  This will wait until the 'license-release' message is handled
 * and the resulting Promise will be rejected if there is an error with that.
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
      if (session) {
        let p = new shaka.util.PublicPromise();
        // TODO: Consider adding a timeout to get the 'message' event.
        // Note that the 'message' event will get raised after the remove()
        // promise resolves.

        for (let i = 0; i < this.activeSessions_.length; i++) {
          if (this.activeSessions_[i].session == session) {
            this.activeSessions_[i].updatePromise = p;
            break;
          }
        }
        return Promise.all([session.remove(), p]);
      }
    }.bind(this));
  }.bind(this)));
};


/**
 * Creates the sessions for the init data and waits for them to become ready.
 *
 * @return {!Promise}
 */
shaka.media.DrmEngine.prototype.createOrLoad = function() {
  let initDatas = this.currentDrmInfo_ ? this.currentDrmInfo_.initData : [];
  initDatas.forEach(function(initDataOverride) {
    this.createTemporarySession_(
        initDataOverride.initDataType, initDataOverride.initData);
  }.bind(this));
  this.offlineSessionIds_.forEach(function(sessionId) {
    this.loadOfflineSession_(sessionId);
  }.bind(this));

  if (!initDatas.length && !this.offlineSessionIds_.length) {
    this.allSessionsLoaded_.resolve();
  }
  return this.allSessionsLoaded_;
};


/**
 * Called when new initialization data is encountered.  If this data hasn't
 * been seen yet, this will create a new session for it.
 *
 * @param {string} initDataType
 * @param {!Uint8Array} initData
 */
shaka.media.DrmEngine.prototype.newInitData = function(initDataType, initData) {
  // Aliases:
  const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

  // Suppress duplicate init data.
  // Note that some init data are extremely large and can't portably be used as
  // keys in a dictionary.
  for (const session of this.activeSessions_) {
    if (Uint8ArrayUtils.equal(initData, session.initData)) {
      shaka.log.debug('Ignoring duplicate init data.');
      return;
    }
  }

  this.createTemporarySession_(initDataType, initData);
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
 * Returns the next expiration time, or Infinity.
 * @return {number}
 */
shaka.media.DrmEngine.prototype.getExpiration = function() {
  let expirations = this.activeSessions_.map(function(session) {
    let expiration = session.session.expiration;
    return isNaN(expiration) ? Infinity : expiration;
  });
  // This will equal Infinity if there are no entries.
  return Math.min.apply(Math, expirations);
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
 * Returns the current key statuses.
 *
 * @return {!Object.<string, string>}
 */
shaka.media.DrmEngine.prototype.getKeyStatuses = function() {
  return this.announcedKeyStatusByKeyId_;
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
  let clearKeyDrmInfo = this.configureClearKey_();
  let configDrmInfos = this.getDrmInfosByConfig_(manifest);

  manifest.periods.forEach(function(period) {
    period.variants.forEach(function(variant) {
      // clearKey config overrides manifest DrmInfo if present.
      // The manifest is modified so that filtering in Player still works.
      if (clearKeyDrmInfo) {
        variant.drmInfos = [clearKeyDrmInfo];
      }

      // If initial manifest contains unencrypted content,
      // drm configuration overrides DrmInfo so drmEngine can be activated.
      // Thus, the player can play encrypted content if live stream switches
      // from unencrypted content to encrypted content during live streams.
      if (configDrmInfos) {
        variant.drmInfos = configDrmInfos;
      }

      variant.drmInfos.forEach(function(drmInfo) {
        this.fillInDrmInfoDefaults_(drmInfo);

        // Chromecast has a variant of PlayReady that uses a different key
        // system ID.  Since manifest parsers convert the standard PlayReady
        // UUID to the standard PlayReady key system ID, here we will switch
        // to the Chromecast version if we are running on that platform.
        // Note that this must come after fillInDrmInfoDefaults_, since the
        // player config uses the standard PlayReady ID for license server
        // configuration.
        if (window.cast && window.cast.__platform__) {
          if (drmInfo.keySystem == 'com.microsoft.playready') {
            drmInfo.keySystem = 'com.chromecast.playready';
          }
        }

        let config = configsByKeySystem[drmInfo.keySystem];
        if (!config) {
          config = {
            // Ignore initDataTypes.
            audioCapabilities: [],
            videoCapabilities: [],
            distinctiveIdentifier: 'optional',
            persistentState: offline ? 'required' : 'optional',
            sessionTypes: [offline ? 'persistent-license' : 'temporary'],
            label: drmInfo.keySystem,
            drmInfos: []  // Tracked by us, ignored by EME.
          };
          configsByKeySystem[drmInfo.keySystem] = config;
          keySystemsInOrder.push(drmInfo.keySystem);
        }

        config.drmInfos.push(drmInfo);

        if (drmInfo.distinctiveIdentifierRequired) {
          config.distinctiveIdentifier = 'required';
        }

        if (drmInfo.persistentStateRequired) {
          config.persistentState = 'required';
        }

        let streams = [];
        if (variant.video) streams.push(variant.video);
        if (variant.audio) streams.push(variant.audio);

        streams.forEach(function(stream) {
          const ContentType = shaka.util.ManifestParserUtils.ContentType;

          /** @type {!Array.<!MediaKeySystemMediaCapability>} */
          let capabilities = (stream.type == ContentType.VIDEO) ?
              config.videoCapabilities : config.audioCapabilities;
          /** @type {string} */
          let robustness = ((stream.type == ContentType.VIDEO) ?
              drmInfo.videoRobustness : drmInfo.audioRobustness) || '';

          let fullMimeType = shaka.util.MimeUtils.getFullType(
              stream.mimeType, stream.codecs);

          capabilities.push({
            robustness: robustness,
            contentType: fullMimeType
          });
        }.bind(this)); // streams.forEach (variant.video, variant.audio)
      }.bind(this)); // variant.drmInfos.forEach
    }.bind(this));  // periods.variants.forEach
  }.bind(this));  // manifest.perios.forEach
};


/**
 * @param {!Object.<string, MediaKeySystemConfiguration>} configsByKeySystem
 *   A dictionary of configs, indexed by key system.
 * @param {!Array.<string>} keySystemsInOrder
 *   A list of key systems in the order in which we should query them.
 *   On a browser which supports multiple key systems, the order may indicate
 *   a real preference for the application.
 * @param {boolean} isEncryptedContent
 *   True if the content is encrypted, false otherwise.
 * @return {!Promise} Resolved if/when a key system has been chosen.
 * @private
 */
shaka.media.DrmEngine.prototype.queryMediaKeys_ =
    function(configsByKeySystem, keySystemsInOrder, isEncryptedContent) {
  if (keySystemsInOrder.length == 1 && keySystemsInOrder[0] == '') {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.NO_RECOGNIZED_KEY_SYSTEMS));
  }

  // Wait to reject this initial Promise until we have built the entire chain.
  let instigator = new shaka.util.PublicPromise();
  let p = instigator;

  // Try key systems with configured license servers first.  We only have to try
  // key systems without configured license servers for diagnostic reasons, so
  // that we can differentiate between "none of these key systems are available"
  // and "some are available, but you did not configure them properly."  The
  // former takes precedence.
  [true, false].forEach(function(shouldHaveLicenseServer) {
    keySystemsInOrder.forEach(function(keySystem) {
      let config = configsByKeySystem[keySystem];

      let hasLicenseServer = config.drmInfos.some(function(info) {
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
        if (this.isDestroying_) { return; }
        return navigator.requestMediaKeySystemAccess(keySystem, [config]);
      }.bind(this));
    }.bind(this));
  }.bind(this));

  p = p.catch(function() {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE));
  });

  p = p.then(function(mediaKeySystemAccess) {
    if (this.isDestroying_) { return Promise.reject(); }

    // TODO: Remove once Edge has released a fix for https://goo.gl/qMeV7v
    let isEdge = navigator.userAgent.indexOf('Edge/') >= 0;

    // Store the capabilities of the key system.
    let realConfig = mediaKeySystemAccess.getConfiguration();
    let audioCaps = realConfig.audioCapabilities || [];
    let videoCaps = realConfig.videoCapabilities || [];
    let caps = audioCaps.concat(videoCaps);
    this.supportedTypes_ = caps.map(function(c) { return c.contentType; });
    if (isEdge) {
      // Edge 14 does not report correct capabilities.  It will only report the
      // first MIME type even if the others are supported.  To work around this,
      // set the supported types to null, which Player will use as a signal that
      // the information is not available.
      // See: https://goo.gl/qMeV7v
      this.supportedTypes_ = null;
    }
    goog.asserts.assert(!this.supportedTypes_ || this.supportedTypes_.length,
                        'We should get at least one supported MIME type');

    let originalConfig = configsByKeySystem[mediaKeySystemAccess.keySystem];
    this.createCurrentDrmInfo_(
        mediaKeySystemAccess.keySystem, originalConfig,
        originalConfig.drmInfos);

    if (!this.currentDrmInfo_.licenseServerUri) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.NO_LICENSE_SERVER_GIVEN));
    }

    return mediaKeySystemAccess.createMediaKeys();
  }.bind(this)).then(function(mediaKeys) {
    if (this.isDestroying_) { return Promise.reject(); }
    shaka.log.info('Created MediaKeys object for key system',
                   this.currentDrmInfo_.keySystem);

    this.mediaKeys_ = mediaKeys;
    this.initialized_ = true;
  }.bind(this)).catch(function(exception) {
    if (this.isDestroying_) { return; }

    // Don't rewrap a shaka.util.Error from earlier in the chain:
    this.currentDrmInfo_ = null;
    this.supportedTypes_ = null;
    if (exception instanceof shaka.util.Error) {
      return Promise.reject(exception);
    }

    // We failed to create MediaKeys.  This generally shouldn't happen.
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.FAILED_TO_CREATE_CDM,
        exception.message));
  }.bind(this));

  if (!isEncryptedContent) {
    // It doesn't matter if we fail to initialize the drm engine, if we won't
    // actually need it anyway.
    p = p.catch(() => {});
  }

  instigator.reject();
  return p;
};


/**
 * Use this.config_ to fill in missing values in drmInfo.
 * @param {shakaExtern.DrmInfo} drmInfo
 * @private
 */
shaka.media.DrmEngine.prototype.fillInDrmInfoDefaults_ = function(drmInfo) {
  let keySystem = drmInfo.keySystem;

  if (!keySystem) {
    // This is a placeholder from the manifest parser for an unrecognized key
    // system.  Skip this entry, to avoid logging nonsensical errors.
    return;
  }

  if (!drmInfo.licenseServerUri) {
    let server = this.config_.servers[keySystem];
    if (server) {
      drmInfo.licenseServerUri = server;
    }
  }

  if (!drmInfo.keyIds) {
    drmInfo.keyIds = [];
  }

  let advanced = this.config_.advanced[keySystem];
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
  let hasClearKeys = !shaka.util.MapUtils.empty(this.config_.clearKeys);
  if (!hasClearKeys) return null;

  const StringUtils = shaka.util.StringUtils;
  const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
  let keys = [];
  let keyIds = [];

  for (let keyIdHex in this.config_.clearKeys) {
    let keyHex = this.config_.clearKeys[keyIdHex];

    let keyId = Uint8ArrayUtils.fromHex(keyIdHex);
    let key = Uint8ArrayUtils.fromHex(keyHex);
    let keyObj = {
      kty: 'oct',
      kid: Uint8ArrayUtils.toBase64(keyId, false),
      k: Uint8ArrayUtils.toBase64(key, false)
    };

    keys.push(keyObj);
    keyIds.push(keyObj.kid);
  }

  let jwkSet = {keys: keys};
  let license = JSON.stringify(jwkSet);

  // Use the keyids init data since is suggested by EME.
  // Suggestion: https://goo.gl/R72xp4
  // Format: https://www.w3.org/TR/eme-initdata-keyids/
  let initDataStr = JSON.stringify({'kids': keyIds});
  let initData = new Uint8Array(StringUtils.toUTF8(initDataStr));
  let initDatas = [{initData: initData, initDataType: 'keyids'}];

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
 * Returns the DrmInfo that is generated by drm configation.
 * It activates DrmEngine if drm configs have keySystems.
 * @param {!shakaExtern.Manifest} manifest
 * @return {Array.<{shakaExtern.DrmInfo}>}
 * @private
 */
shaka.media.DrmEngine.prototype.getDrmInfosByConfig_ = function(manifest) {
  let config = this.config_;
  let serverKeys = Object.keys(config.servers);

  if (!serverKeys.length) {
    return null;
  }

  let isEncryptedContent = manifest.periods.some(function(period) {
    return period.variants.some(function(variant) {
      return variant.drmInfos.length;
    });
  });

  // We should only create fake DrmInfos when none are provided by the manifest.
  if (isEncryptedContent) {
    return null;
  }

  return serverKeys.map(function(keySystem) {
    return {
      keySystem: keySystem,
      licenseServerUri: config.servers[keySystem],
      distinctiveIdentifierRequired: false,
      persistentStateRequired: false,
      audioRobustness: '',
      videoRobustness: '',
      serverCertificate: null,
      initData: [],
      keyIds: []
    };
  });
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
  let licenseServers = [];

  /** @type {!Array.<!Uint8Array>} */
  let serverCerts = [];

  /** @type {!Array.<!shakaExtern.InitDataOverride>} */
  let initDatas = [];

  /** @type {!Array.<string>} */
  let keyIds = [];

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
  let audioRobustness =
      config.audioCapabilities ? config.audioCapabilities[0].robustness : '';
  let videoRobustness =
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
    if (a.keyId && a.keyId == b.keyId) {
      // Two initDatas with the same keyId are considered to be the same,
      // unless that "same keyId" is null.
      return true;
    }
    return a.initDataType == b.initDataType &&
           shaka.util.Uint8ArrayUtils.equal(a.initData, b.initData);
  }

  drmInfos.forEach(function(drmInfo) {
    // Aliases:
    const ArrayUtils = shaka.util.ArrayUtils;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

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
      for (let i = 0; i < drmInfo.keyIds.length; ++i) {
        if (keyIds.indexOf(drmInfo.keyIds[i]) == -1) {
          keyIds.push(drmInfo.keyIds[i]);
        }
      }
    }
  });
};


/**
 * @param {string} sessionId
 * @return {!Promise.<MediaKeySession>}
 * @private
 */
shaka.media.DrmEngine.prototype.loadOfflineSession_ = function(sessionId) {
  let session;
  try {
    session = this.mediaKeys_.createSession('persistent-license');
  } catch (exception) {
    let error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
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

  let activeSession = {
    initData: null,
    session: session,
    loaded: false,
    oldExpiration: Infinity,
    updatePromise: null
  };
  this.activeSessions_.push(activeSession);

  return session.load(sessionId).then(function(present) {
    if (this.isDestroying_) { return Promise.reject(); }
    shaka.log.v2('Loaded offline session', sessionId, present);

    if (!present) {
      let i = this.activeSessions_.indexOf(activeSession);
      goog.asserts.assert(i >= 0, 'Session must be in the array');
      this.activeSessions_.splice(i, 1);

      this.onError_(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.OFFLINE_SESSION_REMOVED));
      return;
    }

    // TODO: We should get a key status change event.  Remove once Chrome CDM
    // is fixed.
    activeSession.loaded = true;
    if (this.activeSessions_.every((s) => s.loaded)) {
      this.allSessionsLoaded_.resolve();
    }

    return session;
  }.bind(this), function(error) {
    if (this.isDestroying_) { return; }

    let i = this.activeSessions_.indexOf(activeSession);
    goog.asserts.assert(i >= 0, 'Session must be in the array');
    this.activeSessions_.splice(i, 1);

    this.onError_(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
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
  let session;
  try {
    if (this.isOffline_) {
      session = this.mediaKeys_.createSession('persistent-license');
    } else {
      session = this.mediaKeys_.createSession();
    }
  } catch (exception) {
    this.onError_(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
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
  this.activeSessions_.push({
    initData: initData,
    session: session,
    loaded: false,
    oldExpiration: Infinity,
    updatePromise: null
  });

  session.generateRequest(initDataType, initData.buffer).catch((error) => {
    if (this.isDestroying_) { return; }

    for (let i = 0; i < this.activeSessions_.length; ++i) {
      if (this.activeSessions_[i].session == session) {
        this.activeSessions_.splice(i, 1);
        break;
      }
    }

    let extended;
    if (error.errorCode && error.errorCode.systemCode) {
      extended = error.errorCode.systemCode;
      if (extended < 0) {
        extended += Math.pow(2, 32);
      }
      extended = '0x' + extended.toString(16);
    }

    this.onError_(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.FAILED_TO_GENERATE_LICENSE_REQUEST,
        error.message, error, extended));
  });
};


/**
 * @param {!MediaKeyMessageEvent} event
 * @private
 */
shaka.media.DrmEngine.prototype.onSessionMessage_ = function(event) {
  if (this.delayLicenseRequest_()) {
    this.mediaKeyMessageEvents_.push(event);
  } else {
    this.sendLicenseRequest_(event);
  }
};


/**
 * @return {boolean}
 * @private
 */
shaka.media.DrmEngine.prototype.delayLicenseRequest_ = function() {
  return (this.config_.delayLicenseRequestUntilPlayed &&
          this.video_.paused && !this.initialRequestsSent_);
};


/**
 * Sends a license request.
 * @param {!MediaKeyMessageEvent} event
 * @private
 */
shaka.media.DrmEngine.prototype.sendLicenseRequest_ = function(event) {
  /** @type {!MediaKeySession} */
  let session = event.target;

  let activeSession;
  for (let i = 0; i < this.activeSessions_.length; i++) {
    if (this.activeSessions_[i].session == session) {
      activeSession = this.activeSessions_[i];
      break;
    }
  }

  const requestType = shaka.net.NetworkingEngine.RequestType.LICENSE;
  let request = shaka.net.NetworkingEngine.makeRequest(
      [this.currentDrmInfo_.licenseServerUri], this.config_.retryParameters);
  request.body = event.message;
  request.method = 'POST';
  // NOTE: allowCrossSiteCredentials can be set in a request filter.

  if (this.currentDrmInfo_.keySystem == 'com.microsoft.playready' ||
      this.currentDrmInfo_.keySystem == 'com.chromecast.playready') {
    this.unpackPlayReadyRequest_(request);
  }

  this.playerInterface_.netEngine.request(requestType, request).promise
      .then(function(response) {
        if (this.isDestroying_) { return Promise.reject(); }

        // Request succeeded, now pass the response to the CDM.
        return session.update(response.data).then(function() {
          let event = new shaka.util.FakeEvent('drmsessionupdate');
          this.playerInterface_.onEvent(event);

          if (activeSession) {
            if (activeSession.updatePromise) {
              activeSession.updatePromise.resolve();
            }
            // In case there are no key statuses, consider this session loaded
            // after a reasonable timeout.  It should definitely not take 5
            // seconds to process a license.
            setTimeout(function() {
              activeSession.loaded = true;
              if (this.activeSessions_.every((s) => s.loaded)) {
                this.allSessionsLoaded_.resolve();
              }
            }.bind(this), shaka.media.DrmEngine.SESSION_LOAD_TIMEOUT_ * 1000);
          }
        }.bind(this));
      }.bind(this), function(error) {
        // Ignore destruction errors
        if (this.isDestroying_) { return; }

        // Request failed!
        goog.asserts.assert(error instanceof shaka.util.Error,
                            'Wrong NetworkingEngine error type!');
        let shakaErr = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.LICENSE_REQUEST_FAILED,
            error);
        this.onError_(shakaErr);
        if (activeSession && activeSession.updatePromise) {
          activeSession.updatePromise.reject(shakaErr);
        }
      }.bind(this)).catch(function(error) {
        // Ignore destruction errors
        if (this.isDestroying_) { return; }

        // Session update failed!
        let shakaErr = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED,
            error.message);
        this.onError_(shakaErr);
        if (activeSession && activeSession.updatePromise) {
          activeSession.updatePromise.reject(shakaErr);
        }
      }.bind(this));
};


/**
 * Unpacks PlayReady license requests.  Modifies the request object.
 * @param {shakaExtern.Request} request
 * @private
 */
shaka.media.DrmEngine.prototype.unpackPlayReadyRequest_ = function(request) {
  // On IE and Edge, the raw license message is UTF-16-encoded XML.  We need to
  // unpack the Challenge element (base64-encoded string containing the actual
  // license request) and any HttpHeader elements (sent as request headers).

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

  let xml = shaka.util.StringUtils.fromUTF16(
      request.body, true /* littleEndian */, true /* noThrow */);
  if (xml.indexOf('PlayReadyKeyMessage') == -1) {
    // This does not appear to be a wrapped message as on IE and Edge.  Some
    // clients do not need this unwrapping, so we will assume this is one of
    // them.  Note that "xml" at this point probably looks like random garbage,
    // since we interpreted UTF-8 as UTF-16.
    shaka.log.debug('PlayReady request is already unwrapped.');
    request.headers['Content-Type'] = 'text/xml; charset=utf-8';
    return;
  }
  shaka.log.debug('Unwrapping PlayReady request.');
  let dom = new DOMParser().parseFromString(xml, 'application/xml');

  // Set request headers.
  let headers = dom.getElementsByTagName('HttpHeader');
  for (let i = 0; i < headers.length; ++i) {
    let name = headers[i].querySelector('name');
    let value = headers[i].querySelector('value');
    goog.asserts.assert(name && value, 'Malformed PlayReady headers!');
    request.headers[name.textContent] = value.textContent;
  }

  // Unpack the base64-encoded challenge.
  let challenge = dom.querySelector('Challenge');
  goog.asserts.assert(challenge, 'Malformed PlayReady challenge!');
  goog.asserts.assert(challenge.getAttribute('encoding') == 'base64encoded',
                      'Unexpected PlayReady challenge encoding!');
  request.body =
      shaka.util.Uint8ArrayUtils.fromBase64(challenge.textContent).buffer;
};


/**
 * @param {!Event} event
 * @private
 * @suppress {invalidCasts} to swap keyId and status
 */
shaka.media.DrmEngine.prototype.onKeyStatusesChange_ = function(event) {
  let session = /** @type {!MediaKeySession} */(event.target);

  // Locate the session in the active sessions list.
  let i;
  for (i = 0; i < this.activeSessions_.length; ++i) {
    if (this.activeSessions_[i].session == session) {
      break;
    }
  }
  const found = i < this.activeSessions_.length;

  let keyStatusMap = session.keyStatuses;
  let hasExpiredKeys = false;

  keyStatusMap.forEach(function(status, keyId) {
    // The spec has changed a few times on the exact order of arguments here.
    // As of 2016-06-30, Edge has the order reversed compared to the current
    // EME spec.  Given the back and forth in the spec, it may not be the only
    // one.  Try to detect this and compensate:
    if (typeof keyId == 'string') {
      let tmp = keyId;
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
    // However, unlike Edge and Chromecast, Tizen doesn't have this problem.
    if (this.currentDrmInfo_.keySystem == 'com.microsoft.playready' &&
        keyId.byteLength == 16 && !/Tizen/.exec(navigator.userAgent)) {
      // Read out some fields in little-endian:
      let dataView = new DataView(keyId);
      let part0 = dataView.getUint32(0, true /* LE */);
      let part1 = dataView.getUint16(4, true /* LE */);
      let part2 = dataView.getUint16(6, true /* LE */);
      // Write it back in big-endian:
      dataView.setUint32(0, part0, false /* BE */);
      dataView.setUint16(4, part1, false /* BE */);
      dataView.setUint16(6, part2, false /* BE */);
    }

    // Microsoft's implementation in IE11 seems to never set key status to
    // 'usable'.  It is stuck forever at 'status-pending'.  In spite of this,
    // the keys do seem to be usable and content plays correctly.
    // Bug filed: https://goo.gl/fcXEy1
    // Microsoft has fixed the issue on Edge, but it remains in IE.
    if (this.currentDrmInfo_.keySystem == 'com.microsoft.playready' &&
        status == 'status-pending') {
      status = 'usable';
    }

    if (status != 'status-pending') {
      this.activeSessions_[i].loaded = true;
    }

    if (!found) {
      // We can get a key status changed for a closed session after it has been
      // removed from |activeSessions_|.  If it is closed, none of its keys
      // should be usable.
      goog.asserts.assert(
          status != 'usable', 'Usable keys found in closed session');
    }

    if (status == 'expired') {
      hasExpiredKeys = true;
    }

    let keyIdHex = shaka.util.Uint8ArrayUtils.toHex(new Uint8Array(keyId));

    this.keyStatusByKeyId_[keyIdHex] = status;
  }.bind(this));

  // If the session has expired, close it.
  // Some CDMs do not have sub-second time resolution, so the key status may
  // fire with hundreds of milliseconds left until the stated expiration time.
  let msUntilExpiration = session.expiration - Date.now();
  if (msUntilExpiration < 0 || (hasExpiredKeys && msUntilExpiration < 1000)) {
    // If this is part of a remove(), we don't want to close the session until
    // the update is complete.  Otherwise, we will orphan the session.
    if (found && !this.activeSessions_[i].updatePromise) {
      shaka.log.debug('Session has expired', session);
      this.activeSessions_.splice(i, 1);
      session.close().catch(() => {});  // Silence uncaught rejection errors
    }
  }

  const allSessionsLoaded = this.activeSessions_.every((s) => s.loaded);
  if (!allSessionsLoaded) {
    // Don't announce key statuses or resolve the "all loaded" promise until
    // everything is loaded.
    return;
  }

  this.allSessionsLoaded_.resolve();

  // Batch up key status changes before checking them or notifying Player.
  // This handles cases where the statuses of multiple sessions are set
  // simultaneously by the browser before dispatching key status changes for
  // each of them.  By batching these up, we only send one status change event
  // and at most one EXPIRED error on expiration.
  this.keyStatusTimer_.schedule(shaka.media.DrmEngine.KEY_STATUS_BATCH_TIME_);
};


/**
 * @private
 */
shaka.media.DrmEngine.prototype.processKeyStatusChanges_ = function() {
  // Copy the latest key statuses into the publicly-accessible map.
  this.announcedKeyStatusByKeyId_ = {};
  for (let keyId in this.keyStatusByKeyId_) {
    this.announcedKeyStatusByKeyId_[keyId] = this.keyStatusByKeyId_[keyId];
  }

  // If all keys are expired, fire an error.
  function isExpired(keyId, status) {
    return status == 'expired';
  }
  const MapUtils = shaka.util.MapUtils;
  // Note that every() is always true for an empty map,
  // but we shouldn't fire an error for a lack of key status info.
  let allExpired = !MapUtils.empty(this.announcedKeyStatusByKeyId_) &&
                   MapUtils.every(this.announcedKeyStatusByKeyId_, isExpired);

  if (allExpired) {
    this.onError_(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.EXPIRED));
  }

  this.playerInterface_.onKeyStatus(this.announcedKeyStatusByKeyId_);
};


/**
 * Returns true if the browser has recent EME APIs.
 *
 * @return {boolean}
 */
shaka.media.DrmEngine.isBrowserSupported = function() {
  let basic =
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

  let tests = [];
  let testKeySystems = [
    'org.w3.clearkey',
    'com.widevine.alpha',
    'com.microsoft.playready',
    'com.apple.fps.2_0',
    'com.apple.fps.1_0',
    'com.apple.fps',
    'com.adobe.primetime'
  ];

  let basicVideoCapabilities = [
    {contentType: 'video/mp4; codecs="avc1.42E01E"'},
    {contentType: 'video/webm; codecs="vp8"'}
  ];

  let basicConfig = {
    videoCapabilities: basicVideoCapabilities
  };
  let offlineConfig = {
    videoCapabilities: basicVideoCapabilities,
    persistentState: 'required',
    sessionTypes: ['persistent-license']
  };

  // Try the offline config first, then fall back to the basic config.
  let configs = [offlineConfig, basicConfig];

  let support = {};
  testKeySystems.forEach(function(keySystem) {
    let p = navigator.requestMediaKeySystemAccess(keySystem, configs)
        .then(function(access) {
          // Edge doesn't return supported session types, but current versions
          // do not support persistent-license.  If sessionTypes is missing,
          // assume no support for persistent-license.
          // TODO: Polyfill Edge to return known supported session types.
          // Edge bug: https://goo.gl/z0URJ0
          let sessionTypes = access.getConfiguration().sessionTypes;
          let persistentState = sessionTypes ?
              sessionTypes.indexOf('persistent-license') >= 0 : false;

          // Tizen 3.0 doesn't support persistent licenses, but reports that it
          // does.  It doesn't fail until you call update() with a license
          // response, which is way too late.
          // This is a work-around for #894.
          if (navigator.userAgent.indexOf('Tizen 3') >= 0) {
            persistentState = false;
          }

          support[keySystem] = {persistentState: persistentState};
          return access.createMediaKeys();
        }).catch(function() {
          // Either the request failed or createMediaKeys failed.
          // Either way, write null to the support object.
          support[keySystem] = null;
        });
    tests.push(p);
  });

  return Promise.all(tests).then(function() {
    return support;
  });
};


/**
 * @private
 */
shaka.media.DrmEngine.prototype.onPlay_ = function() {
  for (let i = 0; i < this.mediaKeyMessageEvents_.length; i++) {
    this.sendLicenseRequest_(this.mediaKeyMessageEvents_[i]);
  }

  this.initialRequestsSent_ = true;
  this.mediaKeyMessageEvents_ = [];
};


/**
 * Checks if a variant is compatible with the key system.
 * @param {!shakaExtern.Variant} variant
 * @return {boolean}
**/
shaka.media.DrmEngine.prototype.isSupportedByKeySystem = function(variant) {
  let keySystem = this.keySystem();
  return variant.drmInfos.length == 0 ||
      variant.drmInfos.some(function(drmInfo) {
        return drmInfo.keySystem == keySystem;
      });
};


/**
 * Checks if two DrmInfos can be decrypted using the same key system.
 * Clear content is considered compatible with every key system.
 *
 * @param {!Array.<!shakaExtern.DrmInfo>} drms1
 * @param {!Array.<!shakaExtern.DrmInfo>} drms2
 * @return {boolean}
 */
shaka.media.DrmEngine.areDrmCompatible = function(drms1, drms2) {
  if (!drms1.length || !drms2.length) return true;

  return shaka.media.DrmEngine.getCommonDrmInfos(
      drms1, drms2).length > 0;
};


/**
 * Returns an array of drm infos that are present in both input arrays.
 * If one of the arrays is empty, returns the other one since clear
 * content is considered compatible with every drm info.
 *
 * @param {!Array.<!shakaExtern.DrmInfo>} drms1
 * @param {!Array.<!shakaExtern.DrmInfo>} drms2
 * @return {!Array.<!shakaExtern.DrmInfo>}
 */
shaka.media.DrmEngine.getCommonDrmInfos = function(drms1, drms2) {
  if (!drms1.length) return drms2;
  if (!drms2.length) return drms1;

  let commonDrms = [];

  for (let i = 0; i < drms1.length; i++) {
    for (let j = 0; j < drms2.length; j++) {
      // This method is only called to compare drmInfos of a video and an audio
      // adaptations, so we shouldn't have to worry about checking robustness.
      if (drms1[i].keySystem == drms2[j].keySystem) {
        let drm1 = drms1[i];
        let drm2 = drms2[j];
        let initData = [];
        initData = initData.concat(drm1.initData || []);
        initData = initData.concat(drm2.initData || []);
        let keyIds = [];
        keyIds = keyIds.concat(drm1.keyIds);
        keyIds = keyIds.concat(drm2.keyIds);
        let mergedDrm = {
          keySystem: drm1.keySystem,
          licenseServerUri: drm1.licenseServerUri || drm2.licenseServerUri,
          distinctiveIdentifierRequired: drm1.distinctiveIdentifierRequired ||
              drm2.distinctiveIdentifierRequired,
          persistentStateRequired: drm1.persistentStateRequired ||
              drm2.persistentStateRequired,
          videoRobustness: drm1.videoRobustness || drm2.videoRobustness,
          audioRobustness: drm1.audioRobustness || drm2.audioRobustness,
          serverCertificate: drm1.serverCertificate || drm2.serverCertificate,
          initData: initData,
          keyIds: keyIds
        };
        commonDrms.push(mergedDrm);
        break;
      }
    }
  }

  return commonDrms;
};


/**
 * Called in an interval timer to poll the expiration times of the sessions.  We
 * don't get an event from EME when the expiration updates, so we poll it so we
 * can fire an event when it happens.
 * @private
 */
shaka.media.DrmEngine.prototype.pollExpiration_ = function() {
  this.activeSessions_.forEach(function(session) {
    let old = session.oldExpiration;
    let new_ = session.session.expiration;
    if (isNaN(new_)) {
      new_ = Infinity;
    }

    if (new_ != old) {
      this.playerInterface_.onExpirationUpdated(
          session.session.sessionId, new_);
      session.oldExpiration = new_;
    }
  }.bind(this));
};


/**
 * Close a drm session while accounting for a bug in Chrome. Sometimes the
 * Promise returned by close() never resolves.
 *
 * See issue #1093 and https://crbug.com/690583.
 *
 * @param {!MediaKeySession} session
 * @return {!Promise}
 * @private
 */
shaka.media.DrmEngine.closeSession_ = async function(session) {
  /** @type {!Promise.<boolean>} */
  const close = session.close().then(() => true);

  /** @type {!Promise.<boolean>} */
  const timeout = new Promise((resolve) => {
    setTimeout(() => { resolve(false); },
               shaka.media.DrmEngine.CLOSE_TIMEOUT_ * 1000);
  });

  /** @type {boolean} */
  const wasSessionClosed = await Promise.race([close, timeout]);

  if (!wasSessionClosed) {
    shaka.log.warning('Timeout waiting for session close');
  }
};


/**
 * The amount of time, in seconds, we wait to consider a session closed.
 * This allows us to work around Chrome bug https://crbug.com/690583.
 * @private {number}
 */
shaka.media.DrmEngine.CLOSE_TIMEOUT_ = 1;

/**
 * The amount of time, in seconds, we wait to consider session loaded even if no
 * key status information is available.  This allows us to support browsers/CDMs
 * without key statuses.
 * @private {number}
 */
shaka.media.DrmEngine.SESSION_LOAD_TIMEOUT_ = 5;

/**
 * The amount of time, in seconds, we wait to batch up rapid key status changes.
 * This allows us to avoid multiple expiration events in most cases.
 * @private {number}
 */
shaka.media.DrmEngine.KEY_STATUS_BATCH_TIME_ = 0.5;
