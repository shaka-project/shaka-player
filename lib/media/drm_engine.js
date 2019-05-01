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
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Platform');
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

  /** @private {!Set.<string>} */
  this.supportedTypes_ = new Set();

  /** @private {MediaKeys} */
  this.mediaKeys_ = null;

  /** @private {HTMLMediaElement} */
  this.video_ = null;

  /** @private {boolean} */
  this.initialized_ = false;

  /** @private {?shaka.extern.DrmInfo} */
  this.currentDrmInfo_ = null;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /**
   * @private {!Map.<MediaKeySession,
   *           shaka.media.DrmEngine.SessionMetaData>}
   */
  this.activeSessions_ = new Map();

  /** @private {!Array.<string>} */
  this.offlineSessionIds_ = [];

  /** @private {!shaka.util.PublicPromise} */
  this.allSessionsLoaded_ = new shaka.util.PublicPromise();

  /** @private {?shaka.extern.DrmConfiguration} */
  this.config_ = null;

  /** @private {?function(!shaka.util.Error)} */
  this.onError_ = (err) => {
    this.allSessionsLoaded_.reject(err);
    playerInterface.onError(err);
  };

  /**
   * The most recent key status information we have.
   * We may not have announced this information to the outside world yet,
   * which we delay to batch up changes and avoid spurious "missing key" errors.
   * @private {!Map.<string, string>}
   */
  this.keyStatusByKeyId_ = new Map();

  /**
   * The key statuses most recently announced to other classes.
   * We may have more up-to-date information being collected in
   * this.keyStatusByKeyId_, which has not been batched up and released yet.
   * @private {!Map.<string, string>}
   */
  this.announcedKeyStatusByKeyId_ = new Map();

  /** @private {shaka.util.Timer} */
  this.keyStatusTimer_ =
      new shaka.util.Timer(() => this.processKeyStatusChanges_());

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
  this.usePersistentLicenses_ = false;

  /** @private {!Array.<!MediaKeyMessageEvent>} */
  this.mediaKeyMessageEvents_ = [];

  /** @private {boolean} */
  this.initialRequestsSent_ = false;

  /** @private {?shaka.util.Timer} */
  this.expirationTimer_ = new shaka.util.Timer(() => {
    this.pollExpiration_();
  }).tickEvery(/* seconds= */ 1);

  // Add a catch to the Promise to avoid console logs about uncaught errors.
  const noop = () => {};
  this.allSessionsLoaded_.catch(noop);
};


/**
 * @typedef {{
 *   loaded: boolean,
 *   initData: Uint8Array,
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
shaka.media.DrmEngine.SessionMetaData;


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
  this.eventManager_.release();
  this.eventManager_ = null;

  // Since we are destroying ourselves, we don't want to react to the "all
  // sessions loaded" event.
  this.allSessionsLoaded_.reject();

  // Stop all timers. This will ensure that they do not start any new work while
  // we are destroying ourselves.
  this.expirationTimer_.stop();
  this.expirationTimer_ = null;

  this.keyStatusTimer_.stop();
  this.keyStatusTimer_ = null;

  // Close all open sessions.
  const openSessions = Array.from(this.activeSessions_.keys());
  this.activeSessions_.clear();

  // Close all sessions before we remove media keys from the video element.
  await Promise.all(openSessions.map((session) => {
    return Promise.resolve().then(async () => {
      shaka.log.v1('Closing session', session.sessionId);

      try {
        await shaka.media.DrmEngine.closeSession_(session);
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
  this.supportedTypes_.clear();
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
 * @param {shaka.extern.DrmConfiguration} config
 */
shaka.media.DrmEngine.prototype.configure = function(config) {
  this.config_ = config;
};


/**
 * Initialize the drm engine for storing and deleting stored content.
 *
 * @param {!Array.<shaka.extern.Variant>} variants
 *    The variants that are going to be stored.
 * @param {boolean} usePersistentLicenses
 *    Whether or not persistent licenses should be requested and stored for
 *    |manifest|.
 * @return {!Promise}
 */
shaka.media.DrmEngine.prototype.initForStorage = function(
    variants, usePersistentLicenses) {
  // There are two cases for this call:
  //  1. We are about to store a manifest - in that case, there are no offline
  //     sessions and therefore no offline session ids.
  //  2. We are about to remove the offline sessions for this manifest - in
  //     that case, we don't need to know about them right now either as
  //     we will be told which ones to remove later.
  this.offlineSessionIds_ = [];

  // What we really need to know is whether or not they are expecting to use
  // persistent licenses.
  this.usePersistentLicenses_ = usePersistentLicenses;

  return this.init_(variants);
};


/**
 * Initialize the drm engine for playback operations.
 *
 * @param {!Array.<shaka.extern.Variant>} variants
 *    The variants that we want to support playing.
 * @param {!Array.<string>} offlineSessionIds
 * @return {!Promise}
 */
shaka.media.DrmEngine.prototype.initForPlayback = function(
    variants, offlineSessionIds) {
  this.offlineSessionIds_ = offlineSessionIds;
  this.usePersistentLicenses_ = offlineSessionIds.length > 0;

  return this.init_(variants);
};


/**
 * Initializes the drm engine for removing persistent sessions.  Only the
 * removeSession(s) methods will work correctly, creating new sessions may not
 * work as desired.
 *
 * @param {string} keySystem
 * @param {string} licenseServerUri
 * @param {Uint8Array} serverCertificate
 * @param {!Array.<MediaKeySystemMediaCapability>} audioCapabilities
 * @param {!Array.<MediaKeySystemMediaCapability>} videoCapabilities
 * @return {!Promise}
 */
shaka.media.DrmEngine.prototype.initForRemoval = function(
    keySystem, licenseServerUri, serverCertificate,
    audioCapabilities, videoCapabilities) {
  /** @type {!Map.<string, MediaKeySystemConfiguration>} */
  const configsByKeySystem = new Map();
  configsByKeySystem.set(keySystem, {
    audioCapabilities: audioCapabilities,
    videoCapabilities: videoCapabilities,
    distinctiveIdentifier: 'optional',
    persistentState: 'required',
    sessionTypes: ['persistent-license'],
    label: keySystem,
    drmInfos: [{
      keySystem: keySystem,
      licenseServerUri: licenseServerUri,
      distinctiveIdentifierRequired: false,
      persistentStateRequired: true,
      audioRobustness: '',  // Not required by queryMediaKeys_
      videoRobustness: '',  // Same
      serverCertificate: serverCertificate,
      initData: null,
      keyIds: null,
    }],  // Tracked by us, ignored by EME.
  });

  return this.queryMediaKeys_(configsByKeySystem);
};


/**
 * Negotiate for a key system and set up MediaKeys.
 * This will assume that both |usePersistentLicences_| and |offlineSessionIds_|
 * have been properly set.
 *
 * @param {!Array.<shaka.extern.Variant>} variants
 *    The variants that we expect to operate with during the drm engine's
 *    lifespan of the drm engine.
 * @return {!Promise} Resolved if/when a key system has been chosen.
 * @private
 */
shaka.media.DrmEngine.prototype.init_ = function(variants) {
  goog.asserts.assert(this.config_,
      'DrmEngine configure() must be called before init()!');

  const hadDrmInfo = variants.some((v) => v.drmInfos.length > 0);

  // When preparing to play live streams, it is possible that we won't know
  // about some upcoming encrypted content. If we initialize the drm engine
  // with no key systems, we won't be able to play when the encrypted content
  // comes.
  //
  // To avoid this, we will set the drm engine up to work with as many key
  // systems as possible so that we will be ready.
  if (!hadDrmInfo) {
    const servers = shaka.util.MapUtils.asMap(this.config_.servers);
    shaka.media.DrmEngine.replaceDrmInfo_(variants, servers);
  }

  // ClearKey config overrides the manifest DrmInfo if present. The variants
  // are modified so that filtering in Player still works.
  /** @type {?shaka.extern.DrmInfo} */
  const clearKeyDrmInfo = this.configureClearKey_();
  if (clearKeyDrmInfo) {
    for (const variant of variants) {
      variant.drmInfos = [clearKeyDrmInfo];
    }
  }

  // Make sure all the drm infos are valid and filled in correctly.
  for (const variant of variants) {
    for (const info of variant.drmInfos) {
      shaka.media.DrmEngine.fillInDrmInfoDefaults_(
          info,
          shaka.util.MapUtils.asMap(this.config_.servers),
          shaka.util.MapUtils.asMap(this.config_.advanced || {}));
    }
  }

  /** @type {!Map.<string, MediaKeySystemConfiguration>} */
  const configsByKeySystem = this.prepareMediaKeyConfigsForVariants_(variants);

  // TODO(vaage): Find an explanation for the difference between this
  //  "unencrypted" form and the "no drm info unencrypted form" and express
  //  that difference here.
  if (!configsByKeySystem.size) {
    // Unencrypted.
    this.initialized_ = true;
    return Promise.resolve();
  }

  const p = this.queryMediaKeys_(configsByKeySystem);

  // TODO(vaage): Look into the assertion below. If we do not have any drm info,
  //  we create drm info so that content can play if it has drm info later.
  //  However it is okay if we fail to initialize? If we fail to initialize, it
  //  means we won't be able to play the later-encrypted content, which is no
  //  okay.

  // If the content did not originally have any drm info, then it doesn't matter
  // if we fail to initialize the drm engine, because we won't need it anyway.
  return hadDrmInfo ?
         p :
         p.catch(() => {});
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
    // FIXME: This is ineffective when a prefixed event is translated by our
    // polyfills, since those events are only caught and translated by a
    // MediaKeys instance.  With clear content and no polyfilled MediaKeys
    // instance attached, you'll never see the 'encrypted' event on those
    // platforms (IE 11 & Safari).
    this.eventManager_.listenOnce(video, 'encrypted', (event) => {
      this.onError_(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.ENCRYPTED_CONTENT_WITHOUT_DRM_INFO));
    });
    return Promise.resolve();
  }

  this.video_ = video;

  this.eventManager_.listenOnce(this.video_, 'play', () => this.onPlay_());

  let setMediaKeys = this.video_.setMediaKeys(this.mediaKeys_);
  setMediaKeys = setMediaKeys.catch(function(exception) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.FAILED_TO_ATTACH_TO_VIDEO,
        exception.message));
  });

  let setServerCertificate = this.setServerCertificate();

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
 * Sets the server certificate based on the current DrmInfo.
 *
 * @return {!Promise}
 */
shaka.media.DrmEngine.prototype.setServerCertificate = async function() {
  goog.asserts.assert(this.initialized_,
    'Must call init() before setServerCertificate');

  if (this.mediaKeys_ &&
      this.currentDrmInfo_ &&
      this.currentDrmInfo_.serverCertificate &&
      this.currentDrmInfo_.serverCertificate.length) {
    try {
      const supported = await this.mediaKeys_.setServerCertificate(
          this.currentDrmInfo_.serverCertificate);
      if (!supported) {
        shaka.log.warning('Server certificates are not supported by the key' +
                          ' system.  The server certificate has been ignored.');
      }
    } catch (exception) {
      return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.INVALID_SERVER_CERTIFICATE,
        exception.message));
    }
  }
};


/**
 * Remove an offline session and delete it's data. This can only be called
 * after a successful call to |init|. This will wait until the 'license-release'
 * message is handled. The returned Promise will be rejected if there is an
 * error releasing the license.
 *
 * @param {string} sessionId
 * @return {!Promise}
 */
shaka.media.DrmEngine.prototype.removeSession = async function(sessionId) {
  goog.asserts.assert(this.mediaKeys_, 'Must call init() before removeSession');

  const session = await this.loadOfflineSession_(sessionId);

  // This will be null on error, such as session not found.
  if (!session) {
    shaka.log.v2('Ignoring attempt to remove missing session', sessionId);
    return;
  }

  // TODO: Consider adding a timeout to get the 'message' event.
  // Note that the 'message' event will get raised after the remove()
  // promise resolves.
  const tasks = [];

  const found = this.activeSessions_.get(session);
  if (found) {
    // This will force us to wait until the 'license-release' message has been
    // handled.
    found.updatePromise = new shaka.util.PublicPromise();
    tasks.push(found.updatePromise);
  }

  shaka.log.v2('Attempting to remove session', sessionId);
  tasks.push(session.remove());

  await Promise.all(tasks);
};

/**
 * Creates the sessions for the init data and waits for them to become ready.
 *
 * @return {!Promise}
 */
shaka.media.DrmEngine.prototype.createOrLoad = function() {
  // Create temp sessions.
  let initDatas = this.currentDrmInfo_ ? this.currentDrmInfo_.initData : [];
  initDatas.forEach((initDataOverride) => {
    return this.createTemporarySession_(initDataOverride.initDataType,
                                        initDataOverride.initData);
  });

  // Load each session.
  this.offlineSessionIds_.forEach((sessionId) => {
    return this.loadOfflineSession_(sessionId);
  });

  // If we have no sessions, we need to resolve the promise right now or else
  // it will never get resolved.
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
  const metadatas = this.activeSessions_.values();
  for (const metadata of metadatas) {
    if (Uint8ArrayUtils.equal(initData, metadata.initData)) {
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
 * Check if DrmEngine (as initialized) will likely be able to support the given
 * content type.
 *
 * @param {string} contentType
 * @return {boolean}
 */
shaka.media.DrmEngine.prototype.willSupport = function(contentType) {
  // Edge 14 does not report correct capabilities.  It will only report the
  // first MIME type even if the others are supported.  To work around this,
  // we say that Edge supports everything.
  //
  // See: https://bit.ly/2IcEgv0 and Issue #1495
  if (shaka.util.Platform.isEdge()) {
    return true;
  }

  return this.supportedTypes_.has(contentType);
};


/**
 * Returns the ID of the sessions currently active.
 *
 * @return {!Array.<string>}
 */
shaka.media.DrmEngine.prototype.getSessionIds = function() {
  const sessions = this.activeSessions_.keys();
  const ids = shaka.util.Iterables.map(sessions, (s) => s.sessionId);

  // TODO: Make |getSessionIds| return |Iterable| instead of |Array|.
  return Array.from(ids);
};


/**
 * Returns the next expiration time, or Infinity.
 * @return {number}
 */
shaka.media.DrmEngine.prototype.getExpiration = function() {
  // This will equal Infinity if there are no entries.
  let min = Infinity;

  const sessions = this.activeSessions_.keys();
  for (const session of sessions) {
    if (!isNaN(session.expiration)) {
      min = Math.min(min, session.expiration);
    }
  }

  return min;
};


/**
 * Returns the DrmInfo that was used to initialize the current key system.
 *
 * @return {?shaka.extern.DrmInfo}
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
  return shaka.util.MapUtils.asObject(this.announcedKeyStatusByKeyId_);
};


/**
 * @param {!Array.<shaka.extern.Variant>} variants
 * @see https://bit.ly/EmeConfig for MediaKeySystemConfiguration spec
 * @return {!Map.<string, MediaKeySystemConfiguration>}
 * @private
 */
shaka.media.DrmEngine.prototype.prepareMediaKeyConfigsForVariants_ = function(
    variants) {
  // Get all the drm info so that we can avoid using nested loops when we just
  // need the drm info.
  const allDrmInfo = new Set();
  for (const variant of variants) {
    for (const info of variant.drmInfos) {
      allDrmInfo.add(info);
    }
  }

  // Make sure all the drm infos are valid and filled in correctly.
  for (const info of allDrmInfo) {
    shaka.media.DrmEngine.fillInDrmInfoDefaults_(
        info,
        shaka.util.MapUtils.asMap(this.config_.servers),
        shaka.util.MapUtils.asMap(this.config_.advanced || {}));
  }

  const persistentState =
      this.usePersistentLicenses_ ? 'required' : 'optional';
  const sessionTypes =
      this.usePersistentLicenses_ ? ['persistent-license'] : ['temporary'];

  const configs = new Map();

  // Create a config entry for each key system.
  for (const info of allDrmInfo) {
    const config = {
      // Ignore initDataTypes.
      audioCapabilities: [],
      videoCapabilities: [],
      distinctiveIdentifier: 'optional',
      persistentState: persistentState,
      sessionTypes: sessionTypes,
      label: info.keySystem,
      drmInfos: [],  // Tracked by us, ignored by EME.
    };

    // Multiple calls to |set| will still respect the insertion order of the
    // first call to |set| for a given key.
    configs.set(info.keySystem, config);
  }

  // Connect each key system with each stream using it.
  for (const variant of variants) {
    /** @type {?shaka.extern.Stream} */
    const audio = variant.audio;
    /** @type {?shaka.extern.Stream} */
    const video = variant.video;

    /** @type {string} */
    const audioMimeType =
        audio ?
        shaka.util.MimeUtils.getFullType(audio.mimeType, audio.codecs) :
        '';
    /** @type {string} */
    const videoMimeType =
        video ?
        shaka.util.MimeUtils.getFullType(video.mimeType, video.codecs) :
        '';

    // Add the last bit of information to each config;
    for (const info of variant.drmInfos) {
      const config = configs.get(info.keySystem);
      goog.asserts.assert(
          config,
          'Any missing configs should have be filled in before.');

      config.drmInfos.push(info);

      if (info.distinctiveIdentifierRequired) {
        config.distinctiveIdentifier = 'required';
      }

      if (info.persistentStateRequired) {
        config.persistentState = 'required';
      }

      if (audio) {
        /** @type {MediaKeySystemMediaCapability} */
        const capability = {
          robustness: info.audioRobustness || '',
          contentType: audioMimeType,
        };

        config.audioCapabilities.push(capability);
      }

      if (video) {
        /** @type {MediaKeySystemMediaCapability} */
        const capability = {
          robustness: info.videoRobustness || '',
          contentType: videoMimeType,
        };

        config.videoCapabilities.push(capability);
      }
    }
  }

  return configs;
};


/**
 * @param {!Map.<string, MediaKeySystemConfiguration>} configsByKeySystem
 *   A dictionary of configs, indexed by key system, with an iteration order
 *   (insertion order) that reflects the preference for the application.
 * @return {!Promise} Resolved if/when a key system has been chosen.
 * @private
 */
shaka.media.DrmEngine.prototype.queryMediaKeys_ = function(configsByKeySystem) {
  if (configsByKeySystem.size == 1 && configsByKeySystem.has('')) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.NO_RECOGNIZED_KEY_SYSTEMS));
  }

  // If there are no tracks of a type, these should be not present.
  // Otherwise the query will fail.
  for (const config of configsByKeySystem.values()) {
    if (config.audioCapabilities.length == 0) {
      delete config.audioCapabilities;
    }
    if (config.videoCapabilities.length == 0) {
      delete config.videoCapabilities;
    }
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
    configsByKeySystem.forEach((config, keySystem) => {
      let hasLicenseServer = config.drmInfos.some(function(info) {
        return !!info.licenseServerUri;
      });
      if (hasLicenseServer != shouldHaveLicenseServer) return;

      p = p.catch(function() {
        if (this.isDestroying_) { return; }
        return navigator.requestMediaKeySystemAccess(keySystem, [config]);
      }.bind(this));
    });
  }.bind(this));

  p = p.catch(() => {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE));
  });

  p = p.then(function(mediaKeySystemAccess) {
    if (this.isDestroying_) { return Promise.reject(); }

    // Get the set of supported content types from the audio and video
    // capabilities. Avoid duplicates so that it is easier to read what is
    // supported.
    this.supportedTypes_.clear();

    // Store the capabilities of the key system.
    const realConfig = mediaKeySystemAccess.getConfiguration();
    const audioCaps = realConfig.audioCapabilities || [];
    const videoCaps = realConfig.videoCapabilities || [];

    for (const cap of audioCaps) {
      this.supportedTypes_.add(cap.contentType);
    }

    for (const cap of videoCaps) {
      this.supportedTypes_.add(cap.contentType);
    }

    goog.asserts.assert(this.supportedTypes_.size,
                        'We should get at least one supported MIME type');

    this.currentDrmInfo_ = shaka.media.DrmEngine.createDrmInfoFor_(
        mediaKeySystemAccess.keySystem,
        configsByKeySystem.get(mediaKeySystemAccess.keySystem));

    if (!this.currentDrmInfo_.licenseServerUri) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.NO_LICENSE_SERVER_GIVEN,
          this.currentDrmInfo_.keySystem));
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
    this.supportedTypes_.clear();
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

  instigator.reject();
  return p;
};


/**
 * Create a DrmInfo using configured clear keys.
 * The server URI will be a data URI which decodes to a clearkey license.
 * @return {?shaka.extern.DrmInfo} or null if clear keys are not configured.
 * @private
 * @see https://bit.ly/2K8gOnv for the spec on the clearkey license format.
 */
shaka.media.DrmEngine.prototype.configureClearKey_ = function() {
  const clearKeys = shaka.util.MapUtils.asMap(this.config_.clearKeys);
  if (clearKeys.size == 0) { return null; }

  const StringUtils = shaka.util.StringUtils;
  const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
  let keys = [];
  let keyIds = [];

  clearKeys.forEach((keyHex, keyIdHex) => {
    let keyId = Uint8ArrayUtils.fromHex(keyIdHex);
    let key = Uint8ArrayUtils.fromHex(keyHex);
    let keyObj = {
      kty: 'oct',
      kid: Uint8ArrayUtils.toBase64(keyId, false),
      k: Uint8ArrayUtils.toBase64(key, false),
    };

    keys.push(keyObj);
    keyIds.push(keyObj.kid);
  });

  let jwkSet = {keys: keys};
  let license = JSON.stringify(jwkSet);

  // Use the keyids init data since is suggested by EME.
  // Suggestion: https://bit.ly/2JYcNTu
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
    keyIds: [],
  };
};


/**
 * @param {string} sessionId
 * @return {!Promise.<MediaKeySession>}
 * @private
 */
shaka.media.DrmEngine.prototype.loadOfflineSession_ = function(sessionId) {
  let session;
  try {
    shaka.log.v1('Attempting to load an offline session', sessionId);
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

  const metadata = {
    initData: null,
    loaded: false,
    oldExpiration: Infinity,
    updatePromise: null,
  };
  this.activeSessions_.set(session, metadata);

  return session.load(sessionId).then(function(present) {
    if (this.isDestroying_) { return Promise.reject(); }
    shaka.log.v2('Loaded offline session', sessionId, present);

    if (!present) {
      this.activeSessions_.delete(session);

      this.onError_(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.OFFLINE_SESSION_REMOVED));
      return;
    }

    // TODO: We should get a key status change event.  Remove once Chrome CDM
    // is fixed.
    metadata.loaded = true;
    if (this.areAllSessionsLoaded_()) {
      this.allSessionsLoaded_.resolve();
    }

    return session;
  }.bind(this), function(error) {
    if (this.isDestroying_) { return; }

    this.activeSessions_.delete(session);

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
    if (this.usePersistentLicenses_) {
      shaka.log.v1('Creating new persistent session');
      session = this.mediaKeys_.createSession('persistent-license');
    } else {
      shaka.log.v1('Creating new temporary session');
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

  const metadata = {
    initData: initData,
    loaded: false,
    oldExpiration: Infinity,
    updatePromise: null,
  };
  this.activeSessions_.set(session, metadata);

  session.generateRequest(initDataType, initData.buffer).catch((error) => {
    if (this.isDestroying_) { return; }

    this.activeSessions_.delete(session);

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
  shaka.log.v2('Sending license request for session', session.sessionId);

  const metadata = this.activeSessions_.get(session);

  let url = this.currentDrmInfo_.licenseServerUri;
  const advancedConfig = this.config_.advanced[this.currentDrmInfo_.keySystem];
  if (event.messageType == 'individualization-request' && advancedConfig &&
      advancedConfig.individualizationServer) {
    url = advancedConfig.individualizationServer;
  }

  const requestType = shaka.net.NetworkingEngine.RequestType.LICENSE;
  let request = shaka.net.NetworkingEngine.makeRequest(
      [url], this.config_.retryParameters);
  request.body = event.message;
  request.method = 'POST';
  request.licenseRequestType = event.messageType;
  // NOTE: allowCrossSiteCredentials can be set in a request filter.

  if (this.currentDrmInfo_.keySystem == 'com.microsoft.playready' ||
      this.currentDrmInfo_.keySystem == 'com.chromecast.playready') {
    this.unpackPlayReadyRequest_(request);
  }
  if (this.currentDrmInfo_.keySystem.startsWith('com.apple.fps')) {
    this.formatFairPlayRequest_(request);
  }

  this.playerInterface_.netEngine.request(requestType, request).promise
      .then(function(response) {
        if (this.isDestroying_) { return Promise.reject(); }

        if (this.currentDrmInfo_.keySystem.startsWith('com.apple.fps')) {
          this.parseFairPlayResponse_(response);
        }

        // Request succeeded, now pass the response to the CDM.
        return session.update(response.data).then(function() {
          let event = new shaka.util.FakeEvent('drmsessionupdate');
          this.playerInterface_.onEvent(event);

          if (metadata) {
            if (metadata.updatePromise) {
              metadata.updatePromise.resolve();
            }
            // In case there are no key statuses, consider this session loaded
            // after a reasonable timeout.  It should definitely not take 5
            // seconds to process a license.
            const timer = new shaka.util.Timer(() => {
              metadata.loaded = true;
              if (this.areAllSessionsLoaded_()) {
                this.allSessionsLoaded_.resolve();
              }
            });

            timer.tickAfter(
                /* seconds= */ shaka.media.DrmEngine.SESSION_LOAD_TIMEOUT_);
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
        if (metadata && metadata.updatePromise) {
          metadata.updatePromise.reject(shakaErr);
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
        if (metadata && metadata.updatePromise) {
          metadata.updatePromise.reject(shakaErr);
        }
      }.bind(this));
};


/**
 * Unpacks PlayReady license requests.  Modifies the request object.
 * @param {shaka.extern.Request} request
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
  if (!xml.includes('PlayReadyKeyMessage')) {
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
 * Formats FairPlay license requests.  Modifies the request object.
 *
 * @param {shaka.extern.Request} request
 * @private
 */
shaka.media.DrmEngine.prototype.formatFairPlayRequest_ = function(request) {
  // The standard format for FairPlay seems to be to place the request into a
  // POST parameter (spc=).
  const originalPayload = new Uint8Array(request.body);
  const base64Payload = shaka.util.Uint8ArrayUtils.toBase64(originalPayload);
  const params = 'spc=' + base64Payload;
  request.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  request.body = shaka.util.StringUtils.toUTF8(params);
};


/**
 * Parse FairPlay license response format.  Modifies the response object.
 * This will run after any response filters, so application-specific formats
 * can still be handled by the app.
 *
 * @param {shaka.extern.Response} response
 * @private
 */
shaka.media.DrmEngine.prototype.parseFairPlayResponse_ = function(response) {
  // In Apple's docs, responses can be of the form:
  //   '\n<ckc>base64encoded</ckc>\n' or 'base64encoded'
  // We have also seen responses in JSON format from some of our partners.
  // In all of these text-based formats, the CKC data is base64-encoded.

  // This handles all of the above.  Other formats should be handled via
  // application-level response filters.

  let responseText;
  try {
    // Convert it to text for further processing.
    responseText = shaka.util.StringUtils.fromUTF8(response.data);
  } catch (error) {
    // Assume it's not a text format of any kind and leave it alone.
    return;
  }

  // Trim whitespace.
  responseText = responseText.trim();

  // Look for <ckc> wrapper and remove it.
  if (responseText.substr(0, 5) === '<ckc>' &&
      responseText.substr(-6) === '</ckc>') {
    responseText = responseText.slice(5, -6);
  }

  // Look for a JSON wrapper and remove it.
  try {
    const responseObject = JSON.parse(responseText);
    responseText = responseObject['ckc'];
  } catch (error) {
    // It wasn't JSON.  Fall through with other transformations.
  }

  // Decode the base64-encoded data into the format the browser expects.
  // It's not clear why FairPlay license servers don't just serve this directly.
  response.data = shaka.util.Uint8ArrayUtils.fromBase64(responseText).buffer;
};


/**
 * @param {!Event} event
 * @private
 * @suppress {invalidCasts} to swap keyId and status
 */
shaka.media.DrmEngine.prototype.onKeyStatusesChange_ = function(event) {
  const session = /** @type {!MediaKeySession} */(event.target);
  shaka.log.v2('Key status changed for session', session.sessionId);

  const found = this.activeSessions_.get(session);
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
    // Bug filed: https://bit.ly/2thuzXu

    // NOTE that we skip this if byteLength != 16.  This is used for the IE11
    // and Edge 12 EME polyfill, which uses single-byte dummy key IDs.
    // However, unlike Edge and Chromecast, Tizen doesn't have this problem.
    if (this.currentDrmInfo_.keySystem == 'com.microsoft.playready' &&
        keyId.byteLength == 16 &&
        !shaka.util.Platform.isTizen()) {
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
    // Bug filed: https://bit.ly/2tpIU3n
    // Microsoft has fixed the issue on Edge, but it remains in IE.
    if (this.currentDrmInfo_.keySystem == 'com.microsoft.playready' &&
        status == 'status-pending') {
      status = 'usable';
    }

    if (status != 'status-pending') {
      found.loaded = true;
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

    this.keyStatusByKeyId_.set(keyIdHex, status);
  }.bind(this));

  // If the session has expired, close it.
  // Some CDMs do not have sub-second time resolution, so the key status may
  // fire with hundreds of milliseconds left until the stated expiration time.
  let msUntilExpiration = session.expiration - Date.now();
  if (msUntilExpiration < 0 || (hasExpiredKeys && msUntilExpiration < 1000)) {
    // If this is part of a remove(), we don't want to close the session until
    // the update is complete.  Otherwise, we will orphan the session.
    if (found && !found.updatePromise) {
      shaka.log.debug('Session has expired', session.sessionId);
      this.activeSessions_.delete(session);
      session.close().catch(() => {});  // Silence uncaught rejection errors
    }
  }

  if (!this.areAllSessionsLoaded_()) {
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
  this.keyStatusTimer_.tickAfter(
      /* seconds= */ shaka.media.DrmEngine.KEY_STATUS_BATCH_TIME_);
};


/**
 * @private
 */
shaka.media.DrmEngine.prototype.processKeyStatusChanges_ = function() {
  const privateMap = this.keyStatusByKeyId_;
  const publicMap = this.announcedKeyStatusByKeyId_;

  // Copy the latest key statuses into the publicly-accessible map.
  publicMap.clear();
  privateMap.forEach((status, keyId) => publicMap.set(keyId, status));

  // If all keys are expired, fire an error. |every| is always true for an empty
  // array but we shouldn't fire an error for a lack of key status info.
  const statuses = Array.from(publicMap.values());
  const allExpired = statuses.length &&
                     statuses.every((status) => status == 'expired');

  if (allExpired) {
    this.onError_(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.EXPIRED));
  }

  this.playerInterface_.onKeyStatus(shaka.util.MapUtils.asObject(publicMap));
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
 * @return {!Promise.<!Object.<string, ?shaka.extern.DrmSupportType>>}
 */
shaka.media.DrmEngine.probeSupport = function() {
  goog.asserts.assert(shaka.media.DrmEngine.isBrowserSupported(),
                      'Must have basic EME support');

  let testKeySystems = [
    'org.w3.clearkey',
    'com.widevine.alpha',
    'com.microsoft.playready',
    'com.apple.fps.3_0',
    'com.apple.fps.2_0',
    'com.apple.fps.1_0',
    'com.apple.fps',
    'com.adobe.primetime',
  ];

  let basicVideoCapabilities = [
    {contentType: 'video/mp4; codecs="avc1.42E01E"'},
    {contentType: 'video/webm; codecs="vp8"'},
  ];

  let basicConfig = {
    videoCapabilities: basicVideoCapabilities,
  };
  let offlineConfig = {
    videoCapabilities: basicVideoCapabilities,
    persistentState: 'required',
    sessionTypes: ['persistent-license'],
  };

  // Try the offline config first, then fall back to the basic config.
  const configs = [offlineConfig, basicConfig];

  /** @type {!Map.<string, ?shaka.extern.DrmSupportType>} */
  const support = new Map();

  const testSystem = async (keySystem) => {
    try {
      const access = await navigator.requestMediaKeySystemAccess(
          keySystem, configs);

      // Edge doesn't return supported session types, but current versions
      // do not support persistent-license.  If sessionTypes is missing,
      // assume no support for persistent-license.
      // TODO: Polyfill Edge to return known supported session types.
      // Edge bug: https://bit.ly/2IeKzho
      let sessionTypes = access.getConfiguration().sessionTypes;
      let persistentState = sessionTypes ?
          sessionTypes.includes('persistent-license') : false;

      // Tizen 3.0 doesn't support persistent licenses, but reports that it
      // does.  It doesn't fail until you call update() with a license
      // response, which is way too late.
      // This is a work-around for #894.
      if (shaka.util.Platform.isTizen3()) {
        persistentState = false;
      }

      support.set(keySystem, {persistentState: persistentState});
      await access.createMediaKeys();
    } catch (e) {
      // Either the request failed or createMediaKeys failed.
      // Either way, write null to the support object.
      support.set(keySystem, null);
    }
  };

  // Test each key system.
  const tests = testKeySystems.map((keySystem) => testSystem(keySystem));
  return Promise.all(tests).then(() => shaka.util.MapUtils.asObject(support));
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
 * Check if a variant is likely to be supported by DrmEngine. This will err on
 * the side of being too accepting and may not reject a variant that it will
 * later fail to play.
 *
 * @param {!shaka.extern.Variant} variant
 * @return {boolean}
 **/
shaka.media.DrmEngine.prototype.supportsVariant = function(variant) {
  /** @type {?shaka.extern.Stream} */
  const audio = variant.audio;
  /** @type {?shaka.extern.Stream} */
  const video = variant.video;

  if (audio && audio.encrypted) {
    const audioContentType = shaka.util.MimeUtils.getFullType(
        audio.mimeType, audio.codecs);

    if (!this.willSupport(audioContentType)) { return false; }
  }

  if (video && video.encrypted) {
    const videoContentType = shaka.util.MimeUtils.getFullType(
        video.mimeType, video.codecs);

    if (!this.willSupport(videoContentType)) { return false; }
  }

  const keySystem = this.keySystem();
  return variant.drmInfos.length == 0 ||
      variant.drmInfos.some((drmInfo) => drmInfo.keySystem == keySystem);
};


/**
 * Checks if two DrmInfos can be decrypted using the same key system.
 * Clear content is considered compatible with every key system.
 *
 * @param {!Array.<!shaka.extern.DrmInfo>} drms1
 * @param {!Array.<!shaka.extern.DrmInfo>} drms2
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
 * @param {!Array.<!shaka.extern.DrmInfo>} drms1
 * @param {!Array.<!shaka.extern.DrmInfo>} drms2
 * @return {!Array.<!shaka.extern.DrmInfo>}
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
          keyIds: keyIds,
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
  this.activeSessions_.forEach((metadata, session) => {
    let oldTime = metadata.oldExpiration;
    let newTime = session.expiration;
    if (isNaN(newTime)) {
      newTime = Infinity;
    }

    if (newTime != oldTime) {
      this.playerInterface_.onExpirationUpdated(session.sessionId, newTime);
      metadata.oldExpiration = newTime;
    }
  });
};


/**
 * @return {boolean}
 * @private
 */
shaka.media.DrmEngine.prototype.areAllSessionsLoaded_ = function() {
  const metadatas = this.activeSessions_.values();
  return shaka.util.Iterables.every(metadatas, (data) => data.loaded);
};


/**
 * Replace the drm info used in each variant in |variants| to reflect each
 * key service in |keySystems|.
 *
 * @param {!Array.<shaka.extern.Variant>} variants
 * @param {!Map.<string, string>} keySystems
 * @private
 */
shaka.media.DrmEngine.replaceDrmInfo_ = function(variants, keySystems) {
  const drmInfos = [];

  keySystems.forEach((uri, keySystem) => {
    drmInfos.push({
      keySystem: keySystem,
      licenseServerUri: uri,
      distinctiveIdentifierRequired: false,
      persistentStateRequired: false,
      audioRobustness: '',
      videoRobustness: '',
      serverCertificate: null,
      initData: [],
      keyIds: [],
    });
  });

  for (const variant of variants) {
    variant.drmInfos = drmInfos;
  }
};


/**
 * Creates a DrmInfo object describing the settings used to initialize the
 * engine.
 *
 * @param {string} keySystem
 * @param {MediaKeySystemConfiguration} config
 * @return {shaka.extern.DrmInfo}
 *
 * @private
 */
shaka.media.DrmEngine.createDrmInfoFor_ = function(keySystem, config) {
  /** @type {!Array.<string>} */
  let licenseServers = [];

  /** @type {!Array.<!Uint8Array>} */
  let serverCerts = [];

  /** @type {!Array.<!shaka.extern.InitDataOverride>} */
  let initDatas = [];

  /** @type {!Array.<string>} */
  let keyIds = [];

  shaka.media.DrmEngine.processDrmInfos_(
      config.drmInfos, licenseServers, serverCerts, initDatas, keyIds);

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

  return {
    keySystem: keySystem,
    licenseServerUri: licenseServers[0],
    distinctiveIdentifierRequired: (config.distinctiveIdentifier == 'required'),
    persistentStateRequired: (config.persistentState == 'required'),
    audioRobustness: audioRobustness,
    videoRobustness: videoRobustness,
    serverCertificate: serverCerts[0],
    initData: initDatas,
    keyIds: keyIds,
  };
};


/**
 * Extract license server, server cert, and init data from |drmInfos|, taking
 * care to eliminate duplicates.
 *
 * @param {!Array.<shaka.extern.DrmInfo>} drmInfos
 * @param {!Array.<string>} licenseServers
 * @param {!Array.<!Uint8Array>} serverCerts
 * @param {!Array.<!shaka.extern.InitDataOverride>} initDatas
 * @param {!Array.<string>} keyIds
 * @private
 */
shaka.media.DrmEngine.processDrmInfos_ =
    function(drmInfos, licenseServers, serverCerts, initDatas, keyIds) {
  /** @type {function(shaka.extern.InitDataOverride,
   *                  shaka.extern.InitDataOverride):boolean} */
  let initDataOverrideEqual = (a, b) => {
    if (a.keyId && a.keyId == b.keyId) {
      // Two initDatas with the same keyId are considered to be the same,
      // unless that "same keyId" is null.
      return true;
    }
    return a.initDataType == b.initDataType &&
           shaka.util.Uint8ArrayUtils.equal(a.initData, b.initData);
  };

  drmInfos.forEach((drmInfo) => {
    // Aliases:
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

    // Build an array of unique license servers.
    if (!licenseServers.includes(drmInfo.licenseServerUri)) {
      licenseServers.push(drmInfo.licenseServerUri);
    }

    // Build an array of unique server certs.
    if (drmInfo.serverCertificate) {
      const found = serverCerts.some(
          (cert) => Uint8ArrayUtils.equal(cert, drmInfo.serverCertificate));
      if (!found) {
        serverCerts.push(drmInfo.serverCertificate);
      }
    }

    // Build an array of unique init datas.
    if (drmInfo.initData) {
      drmInfo.initData.forEach((initDataOverride) => {
        const found = initDatas.some(
            (initData) => initDataOverrideEqual(initData, initDataOverride));
        if (!found) {
          initDatas.push(initDataOverride);
        }
      });
    }

    if (drmInfo.keyIds) {
      for (let i = 0; i < drmInfo.keyIds.length; ++i) {
        if (!keyIds.includes(drmInfo.keyIds[i])) {
          keyIds.push(drmInfo.keyIds[i]);
        }
      }
    }
  });
};


/**
 * Use |servers| and |advancedConfigs| to fill in missing values in drmInfo that
 * the parser left blank. Before working with any drmInfo, it should be passed
 * through here as it is uncommon for drmInfo to be complete when fetched
 * from a manifest because most manifest formats do not have the required
 * information.
 *
 * @param {shaka.extern.DrmInfo} drmInfo
 * @param {!Map.<string, string>} servers
 * @param {!Map.<string, shaka.extern.AdvancedDrmConfiguration>} advancedConfigs
 * @private
 */
shaka.media.DrmEngine.fillInDrmInfoDefaults_ = function(
    drmInfo, servers, advancedConfigs) {
  if (!drmInfo.keySystem) {
    // This is a placeholder from the manifest parser for an unrecognized key
    // system.  Skip this entry, to avoid logging nonsensical errors.
    return;
  }

  // The order of preference for drmInfo:
  // 1. Clear Key config, used for debugging, should override everything else.
  //    (The application can still specify a clearkey license server.)
  // 2. Application-configured servers, if any are present, should override
  //    anything from the manifest.  Nuance: if key system A is in the manifest
  //    and key system B is in the player config, only B will be used, not A.
  // 3. Manifest-provided license servers are only used if nothing else is
  //    specified.
  // This is important because it allows the application a clear way to indicate
  // which DRM systems should be used on platforms with multiple DRM systems.
  // The only way to get license servers from the manifest is not to specify any
  // in your player config.

  if (drmInfo.keySystem == 'org.w3.clearkey' && drmInfo.licenseServerUri) {
    // Preference 1: Clear Key with pre-configured keys will have a data URI
    // assigned as its license server.  Don't change anything.
    return;
  } else if (servers.size) {
    // Preference 2: If anything is configured at the application level,
    // override whatever was in the manifest.
    const server = servers.get(drmInfo.keySystem) || '';
    drmInfo.licenseServerUri = server;
  } else {
    // Preference 3: Keep whatever we had in drmInfo.licenseServerUri, which
    // comes from the manifest.
  }

  if (!drmInfo.keyIds) {
    drmInfo.keyIds = [];
  }

  const advancedConfig = advancedConfigs.get(drmInfo.keySystem);
  if (advancedConfig) {
    if (!drmInfo.distinctiveIdentifierRequired) {
      drmInfo.distinctiveIdentifierRequired =
          advancedConfig.distinctiveIdentifierRequired;
    }

    if (!drmInfo.persistentStateRequired) {
      drmInfo.persistentStateRequired = advancedConfig.persistentStateRequired;
    }

    if (!drmInfo.videoRobustness) {
      drmInfo.videoRobustness = advancedConfig.videoRobustness;
    }

    if (!drmInfo.audioRobustness) {
      drmInfo.audioRobustness = advancedConfig.audioRobustness;
    }

    if (!drmInfo.serverCertificate) {
      drmInfo.serverCertificate = advancedConfig.serverCertificate;
    }
  }

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
  const DrmEngine = shaka.media.DrmEngine;

  const timeout = new Promise((resolve) => {
    const timer = new shaka.util.Timer(resolve);
    timer.tickAfter(DrmEngine.CLOSE_TIMEOUT_);
  });

  /** @type {boolean} */
  const wasSessionClosed = await Promise.race([
      session.close().then(() => true),
      timeout.then(() => false),
  ]);

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
