/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.DrmEngine');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Destroyer');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.Lazy');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Platform');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Uint8ArrayUtils');
goog.require('shaka.util.XmlUtils');


/** @implements {shaka.util.IDestroyable} */
shaka.media.DrmEngine = class {
  /**
   * @param {shaka.media.DrmEngine.PlayerInterface} playerInterface
   * @param {number=} updateExpirationTime
   */
  constructor(playerInterface, updateExpirationTime = 1) {
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

    /** @private {boolean} */
    this.initializedForStorage_ = false;

    /** @private {number} */
    this.licenseTimeSeconds_ = 0;

    /** @private {?shaka.extern.DrmInfo} */
    this.currentDrmInfo_ = null;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /**
     * @private {!Map.<MediaKeySession,
     *           shaka.media.DrmEngine.SessionMetaData>}
     */
    this.activeSessions_ = new Map();

    /**
     * @private {!Map<string,
     *           {initData: ?Uint8Array, initDataType: ?string}>}
     */
    this.storedPersistentSessions_ = new Map();

    /** @private {!shaka.util.PublicPromise} */
    this.allSessionsLoaded_ = new shaka.util.PublicPromise();

    /** @private {?shaka.extern.DrmConfiguration} */
    this.config_ = null;

    /** @private {function(!shaka.util.Error)} */
    this.onError_ = (err) => {
      if (err.severity == shaka.util.Error.Severity.CRITICAL) {
        this.allSessionsLoaded_.reject(err);
      }

      playerInterface.onError(err);
    };

    /**
     * The most recent key status information we have.
     * We may not have announced this information to the outside world yet,
     * which we delay to batch up changes and avoid spurious "missing key"
     * errors.
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

    /** @private {boolean} */
    this.usePersistentLicenses_ = false;

    /** @private {!Array.<!MediaKeyMessageEvent>} */
    this.mediaKeyMessageEvents_ = [];

    /** @private {boolean} */
    this.initialRequestsSent_ = false;

    /** @private {?shaka.util.Timer} */
    this.expirationTimer_ = new shaka.util.Timer(() => {
      this.pollExpiration_();
    }).tickEvery(/* seconds= */ updateExpirationTime);

    // Add a catch to the Promise to avoid console logs about uncaught errors.
    const noop = () => {};
    this.allSessionsLoaded_.catch(noop);

    /** @const {!shaka.util.Destroyer} */
    this.destroyer_ = new shaka.util.Destroyer(() => this.destroyNow_());

    /** @private {boolean} */
    this.srcEquals_ = false;

    /** @private {Promise} */
    this.mediaKeysAttached_ = null;

    /** @private {?shaka.extern.InitDataOverride} */
    this.manifestInitData_ = null;
  }

  /** @override */
  destroy() {
    return this.destroyer_.destroy();
  }

  /**
   * Destroy this instance of DrmEngine. This assumes that all other checks
   * about "if it should" have passed.
   *
   * @private
   */
  async destroyNow_() {
    // |eventManager_| should only be |null| after we call |destroy|. Destroy it
    // first so that we will stop responding to events.
    this.eventManager_.release();
    this.eventManager_ = null;

    // Since we are destroying ourselves, we don't want to react to the "all
    // sessions loaded" event.
    this.allSessionsLoaded_.reject();

    // Stop all timers. This will ensure that they do not start any new work
    // while we are destroying ourselves.
    this.expirationTimer_.stop();
    this.expirationTimer_ = null;

    this.keyStatusTimer_.stop();
    this.keyStatusTimer_ = null;

    // Close all open sessions.
    await this.closeOpenSessions_();

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
    this.storedPersistentSessions_ = new Map();
    this.config_ = null;
    this.onError_ = () => {};
    this.playerInterface_ = null;
    this.srcEquals_ = false;
    this.mediaKeysAttached_ = null;
  }

  /**
   * Called by the Player to provide an updated configuration any time it
   * changes.
   * Must be called at least once before init().
   *
   * @param {shaka.extern.DrmConfiguration} config
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * @param {!boolean} value
   */
  setSrcEquals(value) {
    this.srcEquals_ = value;
  }

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
  initForStorage(variants, usePersistentLicenses) {
    this.initializedForStorage_ = true;
    // There are two cases for this call:
    //  1. We are about to store a manifest - in that case, there are no offline
    //     sessions and therefore no offline session ids.
    //  2. We are about to remove the offline sessions for this manifest - in
    //     that case, we don't need to know about them right now either as
    //     we will be told which ones to remove later.
    this.storedPersistentSessions_ = new Map();

    // What we really need to know is whether or not they are expecting to use
    // persistent licenses.
    this.usePersistentLicenses_ = usePersistentLicenses;

    return this.init_(variants);
  }

  /**
   * Initialize the drm engine for playback operations.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   *    The variants that we want to support playing.
   * @param {!Array.<string>} offlineSessionIds
   * @return {!Promise}
   */
  initForPlayback(variants, offlineSessionIds) {
    this.storedPersistentSessions_ = new Map();

    for (const sessionId of offlineSessionIds) {
      this.storedPersistentSessions_.set(
          sessionId, {initData: null, initDataType: null});
    }

    for (const metadata of this.config_.persistentSessionsMetadata) {
      this.storedPersistentSessions_.set(
          metadata.sessionId,
          {initData: metadata.initData, initDataType: metadata.initDataType});
    }

    this.usePersistentLicenses_ = this.storedPersistentSessions_.size > 0;

    return this.init_(variants);
  }

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
  initForRemoval(keySystem, licenseServerUri, serverCertificate,
      audioCapabilities, videoCapabilities) {
    /** @type {!Map.<string, MediaKeySystemConfiguration>} */
    const configsByKeySystem = new Map();

    /** @type {MediaKeySystemConfiguration} */
    const config = {
      audioCapabilities: audioCapabilities,
      videoCapabilities: videoCapabilities,
      distinctiveIdentifier: 'optional',
      persistentState: 'required',
      sessionTypes: ['persistent-license'],
      label: keySystem,  // Tracked by us, ignored by EME.
    };

    // TODO: refactor, don't stick drmInfos onto MediaKeySystemConfiguration
    config['drmInfos'] = [{  // Non-standard attribute, ignored by EME.
      keySystem: keySystem,
      licenseServerUri: licenseServerUri,
      distinctiveIdentifierRequired: false,
      persistentStateRequired: true,
      audioRobustness: '',  // Not required by queryMediaKeys_
      videoRobustness: '',  // Same
      serverCertificate: serverCertificate,
      serverCertificateUri: '',
      initData: null,
      keyIds: null,
    }];

    configsByKeySystem.set(keySystem, config);
    return this.queryMediaKeys_(configsByKeySystem,
        /* variants= */ []);
  }

  /**
   * Negotiate for a key system and set up MediaKeys.
   * This will assume that both |usePersistentLicences_| and
   * |storedPersistentSessions_| have been properly set.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   *    The variants that we expect to operate with during the drm engine's
   *    lifespan of the drm engine.
   * @return {!Promise} Resolved if/when a key system has been chosen.
   * @private
   */
  async init_(variants) {
    goog.asserts.assert(this.config_,
        'DrmEngine configure() must be called before init()!');

    // ClearKey config overrides the manifest DrmInfo if present. The variants
    // are modified so that filtering in Player still works.
    // This comes before hadDrmInfo because it influences the value of that.
    /** @type {?shaka.extern.DrmInfo} */
    const clearKeyDrmInfo = this.configureClearKey_();
    if (clearKeyDrmInfo) {
      for (const variant of variants) {
        if (variant.video) {
          variant.video.drmInfos = [clearKeyDrmInfo];
        }
        if (variant.audio) {
          variant.audio.drmInfos = [clearKeyDrmInfo];
        }
      }
    }

    const hadDrmInfo = variants.some((variant) => {
      if (variant.video && variant.video.drmInfos.length) {
        return true;
      }
      if (variant.audio && variant.audio.drmInfos.length) {
        return true;
      }
      return false;
    });

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

    /** @type {!Set<shaka.extern.DrmInfo>} */
    const drmInfos = new Set();
    for (const variant of variants) {
      const variantDrmInfos = this.getVariantDrmInfos_(variant);
      for (const info of variantDrmInfos) {
        drmInfos.add(info);
      }
    }

    for (const info of drmInfos) {
      shaka.media.DrmEngine.fillInDrmInfoDefaults_(
          info,
          shaka.util.MapUtils.asMap(this.config_.servers),
          shaka.util.MapUtils.asMap(this.config_.advanced || {}),
          this.config_.keySystemsMapping);
    }


    /** @type {!Map.<string, MediaKeySystemConfiguration>} */
    let configsByKeySystem;

    // We should get the decodingInfo results for the variants after we filling
    // in the drm infos, and before queryMediaKeys_().
    await shaka.util.StreamUtils.getDecodingInfosForVariants(variants,
        this.usePersistentLicenses_, this.srcEquals_,
        this.config_.preferredKeySystems);

    const hasDrmInfo = hadDrmInfo || Object.keys(this.config_.servers).length;
    // An unencrypted content is initialized.
    if (!hasDrmInfo) {
      this.initialized_ = true;
      return Promise.resolve();
    }

    const p = this.queryMediaKeys_(configsByKeySystem, variants);

    // TODO(vaage): Look into the assertion below. If we do not have any drm
    // info, we create drm info so that content can play if it has drm info
    // later.
    // However it is okay if we fail to initialize? If we fail to initialize,
    // it means we won't be able to play the later-encrypted content, which is
    // not okay.

    // If the content did not originally have any drm info, then it doesn't
    // matter if we fail to initialize the drm engine, because we won't need it
    // anyway.
    return hadDrmInfo ? p : p.catch(() => {});
  }

  /**
   * Attach MediaKeys to the video element
   * @return {Promise}
   * @private
   */
  async attachMediaKeys_() {
    if (this.video_.mediaKeys) {
      return;
    }

    // An attach process has already started, let's wait it out
    if (this.mediaKeysAttached_) {
      await this.mediaKeysAttached_;

      this.destroyer_.ensureNotDestroyed();
      return;
    }

    try {
      this.mediaKeysAttached_ = this.video_.setMediaKeys(this.mediaKeys_);

      await this.mediaKeysAttached_;
    } catch (exception) {
      goog.asserts.assert(exception instanceof Error, 'Wrong error type!');

      this.onError_(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.FAILED_TO_ATTACH_TO_VIDEO,
          exception.message));
    }

    this.destroyer_.ensureNotDestroyed();
  }

  /**
   * Processes encrypted event and start licence challenging
   * @return {!Promise}
   * @private
   */
  async onEncryptedEvent_(event) {
    /**
     * MediaKeys should be added when receiving an encrypted event. Setting
     * mediaKeys before could result into encrypted event not being fired on
     * some browsers
     */
    await this.attachMediaKeys_();

    this.newInitData(
        event.initDataType,
        shaka.util.BufferUtils.toUint8(event.initData));
  }

  /**
   * Start processing events.
   * @param {HTMLMediaElement} video
   * @return {!Promise}
   */
  async attach(video) {
    if (!this.mediaKeys_) {
      // Unencrypted, or so we think.  We listen for encrypted events in order
      // to warn when the stream is encrypted, even though the manifest does
      // not know it.
      // Don't complain about this twice, so just listenOnce().
      // FIXME: This is ineffective when a prefixed event is translated by our
      // polyfills, since those events are only caught and translated by a
      // MediaKeys instance.  With clear content and no polyfilled MediaKeys
      // instance attached, you'll never see the 'encrypted' event on those
      // platforms (Safari).
      this.eventManager_.listenOnce(video, 'encrypted', (event) => {
        this.onError_(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.ENCRYPTED_CONTENT_WITHOUT_DRM_INFO));
      });
      return;
    }

    this.video_ = video;

    this.eventManager_.listenOnce(this.video_, 'play', () => this.onPlay_());
    if ('webkitCurrentPlaybackTargetIsWireless' in this.video_) {
      this.eventManager_.listen(this.video_,
          'webkitcurrentplaybacktargetiswirelesschanged',
          () => this.closeOpenSessions_());
    }

    this.manifestInitData_ = this.currentDrmInfo_ ?
      (this.currentDrmInfo_.initData.find(
          (initDataOverride) => initDataOverride.initData.length > 0,
      ) || null) : null;

    /**
     * We can attach media keys before the playback actually begins when:
     *  - If we are not using FairPlay Modern EME
     *  - Some initData already has been generated (through the manifest)
     *  - In case of an offline session
     */
    if (this.manifestInitData_ ||
        this.currentDrmInfo_.keySystem !== 'com.apple.fps' ||
        this.storedPersistentSessions_.size) {
      await this.attachMediaKeys_();
    }

    this.createOrLoad().catch(() => {
      // Silence errors
      // createOrLoad will run async, errors are triggered through onError_
    });

    // Explicit init data for any one stream or an offline session is
    // sufficient to suppress 'encrypted' events for all streams.
    // Also suppress 'encrypted' events when parsing in-band ppsh
    // from media segments because that serves the same purpose as the
    // 'encrypted' events.
    if (!this.manifestInitData_ && !this.storedPersistentSessions_.size &&
        !this.config_.parseInbandPsshEnabled) {
      this.eventManager_.listen(
          this.video_, 'encrypted', (e) => this.onEncryptedEvent_(e));
    }
  }

  /**
   * Sets the server certificate based on the current DrmInfo.
   *
   * @return {!Promise}
   */
  async setServerCertificate() {
    goog.asserts.assert(this.initialized_,
        'Must call init() before setServerCertificate');

    if (!this.mediaKeys_ || !this.currentDrmInfo_) {
      return;
    }

    if (this.currentDrmInfo_.serverCertificateUri &&
       (!this.currentDrmInfo_.serverCertificate ||
       !this.currentDrmInfo_.serverCertificate.length)) {
      const request = shaka.net.NetworkingEngine.makeRequest(
          [this.currentDrmInfo_.serverCertificateUri],
          this.config_.retryParameters);

      try {
        const operation = this.playerInterface_.netEngine.request(
            shaka.net.NetworkingEngine.RequestType.SERVER_CERTIFICATE,
            request);
        const response = await operation.promise;

        this.currentDrmInfo_.serverCertificate =
          shaka.util.BufferUtils.toUint8(response.data);
      } catch (error) {
        // Request failed!
        goog.asserts.assert(error instanceof shaka.util.Error,
            'Wrong NetworkingEngine error type!');

        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.SERVER_CERTIFICATE_REQUEST_FAILED,
            error);
      }

      if (this.destroyer_.destroyed()) {
        return;
      }
    }

    if (!this.currentDrmInfo_.serverCertificate ||
        !this.currentDrmInfo_.serverCertificate.length) {
      return;
    }

    try {
      const supported = await this.mediaKeys_.setServerCertificate(
          this.currentDrmInfo_.serverCertificate);

      if (!supported) {
        shaka.log.warning('Server certificates are not supported by the ' +
                          'key system.  The server certificate has been ' +
                          'ignored.');
      }
    } catch (exception) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.INVALID_SERVER_CERTIFICATE,
          exception.message);
    }
  }

  /**
   * Remove an offline session and delete it's data. This can only be called
   * after a successful call to |init|. This will wait until the
   * 'license-release' message is handled. The returned Promise will be rejected
   * if there is an error releasing the license.
   *
   * @param {string} sessionId
   * @return {!Promise}
   */
  async removeSession(sessionId) {
    goog.asserts.assert(this.mediaKeys_,
        'Must call init() before removeSession');

    const session = await this.loadOfflineSession_(
        sessionId, {initData: null, initDataType: null});

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
    this.activeSessions_.delete(session);
  }

  /**
   * Creates the sessions for the init data and waits for them to become ready.
   *
   * @return {!Promise}
   */
  async createOrLoad() {
    if (this.storedPersistentSessions_.size) {
      this.storedPersistentSessions_.forEach((metadata, sessionId) => {
        this.loadOfflineSession_(sessionId, metadata);
      });

      await this.allSessionsLoaded_;

      const keyIds = (this.currentDrmInfo_ && this.currentDrmInfo_.keyIds) ||
          new Set([]);

      // All the needed keys are already loaded, we don't need another license
      // Therefore we prevent starting a new session
      if (keyIds.size > 0 && this.areAllKeysUsable_()) {
        return this.allSessionsLoaded_;
      }

      // Reset the promise for the next sessions to come if key needs aren't
      // satisfied with persistent sessions
      this.allSessionsLoaded_ = new shaka.util.PublicPromise();
      this.allSessionsLoaded_.catch(() => {});
    }

    // Create sessions.
    const initDatas =
        (this.currentDrmInfo_ ? this.currentDrmInfo_.initData : []) || [];
    for (const initDataOverride of initDatas) {
      this.newInitData(
          initDataOverride.initDataType, initDataOverride.initData);
    }

    // If we have no sessions, we need to resolve the promise right now or else
    // it will never get resolved.
    if (!initDatas.length) {
      this.allSessionsLoaded_.resolve();
    }

    return this.allSessionsLoaded_;
  }

  /**
   * Called when new initialization data is encountered.  If this data hasn't
   * been seen yet, this will create a new session for it.
   *
   * @param {string} initDataType
   * @param {!Uint8Array} initData
   */
  newInitData(initDataType, initData) {
    if (!initData.length) {
      return;
    }

    // Suppress duplicate init data.
    // Note that some init data are extremely large and can't portably be used
    // as keys in a dictionary.

    const metadatas = this.activeSessions_.values();
    for (const metadata of metadatas) {
      if (shaka.util.BufferUtils.equal(initData, metadata.initData) &&
          this.config_.ignoreDuplicateInitData) {
        shaka.log.debug('Ignoring duplicate init data.');
        return;
      }
    }

    // If there are pre-existing sessions that have all been loaded
    // then reset the allSessionsLoaded_ promise, which can now be
    // used to wait for new sesssions to be loaded
    if (this.activeSessions_.size > 0 && this.areAllSessionsLoaded_()) {
      this.allSessionsLoaded_.resolve();
      this.allSessionsLoaded_ = new shaka.util.PublicPromise();
      this.allSessionsLoaded_.catch(() => {});
    }
    this.createSession(initDataType, initData,
        this.currentDrmInfo_.sessionType);
  }

  /** @return {boolean} */
  initialized() {
    return this.initialized_;
  }

  /**
   * @param {?shaka.extern.DrmInfo} drmInfo
   * @return {string} */
  static keySystem(drmInfo) {
    return drmInfo ? drmInfo.keySystem : '';
  }

  /**
   * @param {?string} keySystem
   * @return {boolean} */
  static isPlayReadyKeySystem(keySystem) {
    if (keySystem) {
      return !!keySystem.match(/^com\.(microsoft|chromecast)\.playready/);
    }

    return false;
  }

  /**
   * @param {?string} keySystem
   * @return {boolean} */
  static isFairPlayKeySystem(keySystem) {
    if (keySystem) {
      return !!keySystem.match(/^com\.apple\.fps/);
    }

    return false;
  }

  /**
   * Check if DrmEngine (as initialized) will likely be able to support the
   * given content type.
   *
   * @param {string} contentType
   * @return {boolean}
   */
  willSupport(contentType) {
    // Edge 14 does not report correct capabilities.  It will only report the
    // first MIME type even if the others are supported.  To work around this,
    // we say that Edge supports everything.
    //
    // See https://github.com/shaka-project/shaka-player/issues/1495 for details.
    if (shaka.util.Platform.isLegacyEdge()) {
      return true;
    }

    contentType = contentType.toLowerCase();

    if (shaka.util.Platform.isTizen() &&
        contentType.includes('codecs="ac-3"')) {
      // Some Tizen devices seem to misreport AC-3 support.  This works around
      // the issue, by falling back to EC-3, which seems to be supported on the
      // same devices and be correctly reported in all cases we have observed.
      // See https://github.com/shaka-project/shaka-player/issues/2989 for
      // details.
      const fallback = contentType.replace('ac-3', 'ec-3');
      return this.supportedTypes_.has(contentType) ||
             this.supportedTypes_.has(fallback);
    }

    return this.supportedTypes_.has(contentType);
  }

  /**
   * Returns the ID of the sessions currently active.
   *
   * @return {!Array.<string>}
   */
  getSessionIds() {
    const sessions = this.activeSessions_.keys();
    const ids = shaka.util.Iterables.map(sessions, (s) => s.sessionId);

    // TODO: Make |getSessionIds| return |Iterable| instead of |Array|.
    return Array.from(ids);
  }

  /**
   * Returns the active sessions metadata
   *
   * @return {!Array.<shaka.extern.DrmSessionMetadata>}
   */
  getActiveSessionsMetadata() {
    const sessions = this.activeSessions_.keys();

    const metadata = shaka.util.Iterables.map(sessions, (session) => {
      const metadata = this.activeSessions_.get(session);

      return {
        sessionId: session.sessionId,
        sessionType: metadata.type,
        initData: metadata.initData,
        initDataType: metadata.initDataType,
      };
    });

    return Array.from(metadata);
  }

  /**
   * Returns the next expiration time, or Infinity.
   * @return {number}
   */
  getExpiration() {
    // This will equal Infinity if there are no entries.
    let min = Infinity;

    const sessions = this.activeSessions_.keys();
    for (const session of sessions) {
      if (!isNaN(session.expiration)) {
        min = Math.min(min, session.expiration);
      }
    }

    return min;
  }

  /**
   * Returns the time spent on license requests during this session, or NaN.
   *
   * @return {number}
   */
  getLicenseTime() {
    if (this.licenseTimeSeconds_) {
      return this.licenseTimeSeconds_;
    }
    return NaN;
  }

  /**
   * Returns the DrmInfo that was used to initialize the current key system.
   *
   * @return {?shaka.extern.DrmInfo}
   */
  getDrmInfo() {
    return this.currentDrmInfo_;
  }

  /**
   * Return the media keys created from the current mediaKeySystemAccess.
   * @return {MediaKeys}
   */
  getMediaKeys() {
    return this.mediaKeys_;
  }

  /**
   * Returns the current key statuses.
   *
   * @return {!Object.<string, string>}
   */
  getKeyStatuses() {
    return shaka.util.MapUtils.asObject(this.announcedKeyStatusByKeyId_);
  }

  /**
   * Returns the current media key sessions.
   *
   * @return {!Array.<MediaKeySession>}
   */
  getMediaKeySessions() {
    return Array.from(this.activeSessions_.keys());
  }


  /**
   * @param {shaka.extern.Stream} stream
   * @param {string=} codecOverride
   * @return {string}
   * @private
   */
  static computeMimeType_(stream, codecOverride) {
    const realMimeType = shaka.util.MimeUtils.getFullType(stream.mimeType,
        codecOverride || stream.codecs);
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    if (TransmuxerEngine.isSupported(realMimeType, stream.type)) {
      // This will be handled by the Transmuxer, so use the MIME type that the
      // Transmuxer will produce.
      return TransmuxerEngine.convertCodecs(stream.type, realMimeType);
    }
    return realMimeType;
  }

  /**
   * @param {!Map.<string, MediaKeySystemConfiguration>} configsByKeySystem
   *   A dictionary of configs, indexed by key system, with an iteration order
   *   (insertion order) that reflects the preference for the application.
   * @param {!Array.<shaka.extern.Variant>} variants
   * @return {!Promise} Resolved if/when a key system has been chosen.
   * @private
   */
  async queryMediaKeys_(configsByKeySystem, variants) {
    const drmInfosByKeySystem = new Map();

    const mediaKeySystemAccess = variants.length ?
        this.getKeySystemAccessFromVariants_(variants, drmInfosByKeySystem) :
        await this.getKeySystemAccessByConfigs_(configsByKeySystem);

    if (!mediaKeySystemAccess) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE);
    }
    this.destroyer_.ensureNotDestroyed();

    try {
      // Get the set of supported content types from the audio and video
      // capabilities. Avoid duplicates so that it is easier to read what is
      // supported.
      this.supportedTypes_.clear();

      // Store the capabilities of the key system.
      const realConfig = mediaKeySystemAccess.getConfiguration();

      shaka.log.v2(
          'Got MediaKeySystemAccess with configuration',
          realConfig);

      const audioCaps = realConfig.audioCapabilities || [];
      const videoCaps = realConfig.videoCapabilities || [];

      for (const cap of audioCaps) {
        this.supportedTypes_.add(cap.contentType.toLowerCase());
      }

      for (const cap of videoCaps) {
        this.supportedTypes_.add(cap.contentType.toLowerCase());
      }

      goog.asserts.assert(this.supportedTypes_.size,
          'We should get at least one supported MIME type');

      if (variants.length) {
        this.currentDrmInfo_ = this.createDrmInfoByInfos_(
            mediaKeySystemAccess.keySystem,
            drmInfosByKeySystem.get(mediaKeySystemAccess.keySystem));
      } else {
        this.currentDrmInfo_ = shaka.media.DrmEngine.createDrmInfoByConfigs_(
            mediaKeySystemAccess.keySystem,
            configsByKeySystem.get(mediaKeySystemAccess.keySystem));
      }
      if (!this.currentDrmInfo_.licenseServerUri) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.NO_LICENSE_SERVER_GIVEN,
            this.currentDrmInfo_.keySystem);
      }

      const mediaKeys = await mediaKeySystemAccess.createMediaKeys();
      this.destroyer_.ensureNotDestroyed();
      shaka.log.info('Created MediaKeys object for key system',
          this.currentDrmInfo_.keySystem);

      this.mediaKeys_ = mediaKeys;
      if (this.config_.minHdcpVersion != '' &&
          'getStatusForPolicy' in this.mediaKeys_) {
        try {
          const status = await this.mediaKeys_.getStatusForPolicy({
            minHdcpVersion: this.config_.minHdcpVersion,
          });
          if (status != 'usable') {
            throw new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.DRM,
                shaka.util.Error.Code.MIN_HDCP_VERSION_NOT_MATCH);
          }
          this.destroyer_.ensureNotDestroyed();
        } catch (e) {
          if (e instanceof shaka.util.Error) {
            throw e;
          }
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.DRM,
              shaka.util.Error.Code.ERROR_CHECKING_HDCP_VERSION,
              e.message);
        }
      }
      this.initialized_ = true;

      await this.setServerCertificate();
      this.destroyer_.ensureNotDestroyed();
    } catch (exception) {
      this.destroyer_.ensureNotDestroyed(exception);

      // Don't rewrap a shaka.util.Error from earlier in the chain:
      this.currentDrmInfo_ = null;
      this.supportedTypes_.clear();
      if (exception instanceof shaka.util.Error) {
        throw exception;
      }

      // We failed to create MediaKeys.  This generally shouldn't happen.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.FAILED_TO_CREATE_CDM,
          exception.message);
    }
  }

  /**
   * Get the MediaKeySystemAccess from the decodingInfos of the variants.
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {!Map.<string, !Array.<shaka.extern.DrmInfo>>} drmInfosByKeySystem
   *   A dictionary of drmInfos, indexed by key system.
   * @return {MediaKeySystemAccess}
   * @private
   */
  getKeySystemAccessFromVariants_(variants, drmInfosByKeySystem) {
    for (const variant of variants) {
      // Get all the key systems in the variant that shouldHaveLicenseServer.
      const drmInfos = this.getVariantDrmInfos_(variant);
      for (const info of drmInfos) {
        if (!drmInfosByKeySystem.has(info.keySystem)) {
          drmInfosByKeySystem.set(info.keySystem, []);
        }
        drmInfosByKeySystem.get(info.keySystem).push(info);
      }
    }

    if (drmInfosByKeySystem.size == 1 && drmInfosByKeySystem.has('')) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.NO_RECOGNIZED_KEY_SYSTEMS);
    }

    // If we have configured preferredKeySystems, choose a preferred keySystem
    // if available.
    for (const preferredKeySystem of this.config_.preferredKeySystems) {
      for (const variant of variants) {
        const decodingInfo = variant.decodingInfos.find((decodingInfo) => {
          return decodingInfo.supported &&
              decodingInfo.keySystemAccess != null &&
              decodingInfo.keySystemAccess.keySystem == preferredKeySystem;
        });
        if (decodingInfo) {
          return decodingInfo.keySystemAccess;
        }
      }
    }

    // Try key systems with configured license servers first.  We only have to
    // try key systems without configured license servers for diagnostic
    // reasons, so that we can differentiate between "none of these key
    // systems are available" and "some are available, but you did not
    // configure them properly."  The former takes precedence.
    for (const shouldHaveLicenseServer of [true, false]) {
      for (const variant of variants) {
        for (const decodingInfo of variant.decodingInfos) {
          if (!decodingInfo.supported || !decodingInfo.keySystemAccess) {
            continue;
          }
          const drmInfos =
              drmInfosByKeySystem.get(decodingInfo.keySystemAccess.keySystem);
          for (const info of drmInfos) {
            if (!!info.licenseServerUri == shouldHaveLicenseServer) {
              return decodingInfo.keySystemAccess;
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Get the MediaKeySystemAccess by querying requestMediaKeySystemAccess.
   * @param {!Map.<string, MediaKeySystemConfiguration>} configsByKeySystem
   *   A dictionary of configs, indexed by key system, with an iteration order
   *   (insertion order) that reflects the preference for the application.
   * @return {!Promise.<MediaKeySystemAccess>} Resolved if/when a
   *   mediaKeySystemAccess has been chosen.
   * @private
   */
  async getKeySystemAccessByConfigs_(configsByKeySystem) {
    /** @type {MediaKeySystemAccess} */
    let mediaKeySystemAccess;

    if (configsByKeySystem.size == 1 && configsByKeySystem.has('')) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.NO_RECOGNIZED_KEY_SYSTEMS);
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

    // If we have configured preferredKeySystems, choose the preferred one if
    // available.
    for (const keySystem of this.config_.preferredKeySystems) {
      if (configsByKeySystem.has(keySystem)) {
        const config = configsByKeySystem.get(keySystem);
        try {
          mediaKeySystemAccess =  // eslint-disable-next-line no-await-in-loop
              await navigator.requestMediaKeySystemAccess(keySystem, [config]);
          return mediaKeySystemAccess;
        } catch (error) {
          // Suppress errors.
          shaka.log.v2(
              'Requesting', keySystem, 'failed with config', config, error);
        }
        this.destroyer_.ensureNotDestroyed();
      }
    }

    // Try key systems with configured license servers first.  We only have to
    // try key systems without configured license servers for diagnostic
    // reasons, so that we can differentiate between "none of these key
    // systems are available" and "some are available, but you did not
    // configure them properly."  The former takes precedence.
    // TODO: once MediaCap implementation is complete, this part can be
    // simplified or removed.
    for (const shouldHaveLicenseServer of [true, false]) {
      for (const keySystem of configsByKeySystem.keys()) {
        const config = configsByKeySystem.get(keySystem);
        // TODO: refactor, don't stick drmInfos onto
        // MediaKeySystemConfiguration
        const hasLicenseServer = config['drmInfos'].some((info) => {
          return !!info.licenseServerUri;
        });
        if (hasLicenseServer != shouldHaveLicenseServer) {
          continue;
        }

        try {
          mediaKeySystemAccess =  // eslint-disable-next-line no-await-in-loop
              await navigator.requestMediaKeySystemAccess(keySystem, [config]);
          return mediaKeySystemAccess;
        } catch (error) {
          // Suppress errors.
          shaka.log.v2(
              'Requesting', keySystem, 'failed with config', config, error);
        }
        this.destroyer_.ensureNotDestroyed();
      }
    }
    return mediaKeySystemAccess;
  }

  /**
   * Create a DrmInfo using configured clear keys.
   * The server URI will be a data URI which decodes to a clearkey license.
   * @return {?shaka.extern.DrmInfo} or null if clear keys are not configured.
   * @private
   * @see https://bit.ly/2K8gOnv for the spec on the clearkey license format.
   */
  configureClearKey_() {
    const clearKeys = shaka.util.MapUtils.asMap(this.config_.clearKeys);
    if (clearKeys.size == 0) {
      return null;
    }

    const StringUtils = shaka.util.StringUtils;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    const keys = [];
    const keyIds = [];

    clearKeys.forEach((key, keyId) => {
      let kid = keyId;
      if (kid.length != 22) {
        kid = Uint8ArrayUtils.toBase64(
            Uint8ArrayUtils.fromHex(keyId), false);
      }
      let k = key;
      if (k.length != 22) {
        k = Uint8ArrayUtils.toBase64(
            Uint8ArrayUtils.fromHex(key), false);
      }
      const keyObj = {
        kty: 'oct',
        kid: kid,
        k: k,
      };

      keys.push(keyObj);
      keyIds.push(keyObj.kid);
    });

    const jwkSet = {keys: keys};
    const license = JSON.stringify(jwkSet);

    // Use the keyids init data since is suggested by EME.
    // Suggestion: https://bit.ly/2JYcNTu
    // Format: https://www.w3.org/TR/eme-initdata-keyids/
    const initDataStr = JSON.stringify({'kids': keyIds});
    const initData =
        shaka.util.BufferUtils.toUint8(StringUtils.toUTF8(initDataStr));
    const initDatas = [{initData: initData, initDataType: 'keyids'}];

    return {
      keySystem: 'org.w3.clearkey',
      licenseServerUri: 'data:application/json;base64,' + window.btoa(license),
      distinctiveIdentifierRequired: false,
      persistentStateRequired: false,
      audioRobustness: '',
      videoRobustness: '',
      serverCertificate: null,
      serverCertificateUri: '',
      sessionType: '',
      initData: initDatas,
      keyIds: new Set(keyIds),
    };
  }

  /**
   * Resolves the allSessionsLoaded_ promise when all the sessions are loaded
   *
   * @private
   */
  checkSessionsLoaded_() {
    if (this.areAllSessionsLoaded_()) {
      this.allSessionsLoaded_.resolve();
    }
  }

  /**
   * In case there are no key statuses, consider this session loaded
   * after a reasonable timeout.  It should definitely not take 5
   * seconds to process a license.
   * @param {!shaka.media.DrmEngine.SessionMetaData} metadata
   * @private
   */
  setLoadSessionTimeoutTimer_(metadata) {
    const timer = new shaka.util.Timer(() => {
      metadata.loaded = true;
      this.checkSessionsLoaded_();
    });

    timer.tickAfter(
        /* seconds= */ shaka.media.DrmEngine.SESSION_LOAD_TIMEOUT_);
  }

  /**
   * @param {string} sessionId
   * @param {{initData: ?Uint8Array, initDataType: ?string}} sessionMetadata
   * @return {!Promise.<MediaKeySession>}
   * @private
   */
  async loadOfflineSession_(sessionId, sessionMetadata) {
    let session;

    const sessionType = 'persistent-license';

    try {
      shaka.log.v1('Attempting to load an offline session', sessionId);
      session = this.mediaKeys_.createSession(sessionType);
    } catch (exception) {
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.FAILED_TO_CREATE_SESSION,
          exception.message);
      this.onError_(error);
      return Promise.reject(error);
    }

    this.eventManager_.listen(session, 'message',
        /** @type {shaka.util.EventManager.ListenerType} */(
          (event) => this.onSessionMessage_(event)));
    this.eventManager_.listen(session, 'keystatuseschange',
        (event) => this.onKeyStatusesChange_(event));

    const metadata = {
      initData: sessionMetadata.initData,
      initDataType: sessionMetadata.initDataType,
      loaded: false,
      oldExpiration: Infinity,
      updatePromise: null,
      type: sessionType,
    };
    this.activeSessions_.set(session, metadata);

    try {
      const present = await session.load(sessionId);
      this.destroyer_.ensureNotDestroyed();
      shaka.log.v2('Loaded offline session', sessionId, present);

      if (!present) {
        this.activeSessions_.delete(session);

        const severity = this.config_.persistentSessionOnlinePlayback ?
            shaka.util.Error.Severity.RECOVERABLE :
            shaka.util.Error.Severity.CRITICAL;

        this.onError_(new shaka.util.Error(
            severity,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.OFFLINE_SESSION_REMOVED));

        metadata.loaded = true;
      }

      this.setLoadSessionTimeoutTimer_(metadata);
      this.checkSessionsLoaded_();

      return session;
    } catch (error) {
      this.destroyer_.ensureNotDestroyed(error);

      this.activeSessions_.delete(session);

      const severity = this.config_.persistentSessionOnlinePlayback ?
          shaka.util.Error.Severity.RECOVERABLE :
          shaka.util.Error.Severity.CRITICAL;

      this.onError_(new shaka.util.Error(
          severity,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.FAILED_TO_CREATE_SESSION,
          error.message));

      metadata.loaded = true;

      this.checkSessionsLoaded_();
    }

    return Promise.resolve();
  }

  /**
   * @param {string} initDataType
   * @param {!Uint8Array} initData
   * @param {string} sessionType
   */
  createSession(initDataType, initData, sessionType) {
    goog.asserts.assert(this.mediaKeys_,
        'mediaKeys_ should be valid when creating temporary session.');

    let session;

    try {
      shaka.log.info('Creating new', sessionType, 'session');

      session = this.mediaKeys_.createSession(sessionType);
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
          (event) => this.onSessionMessage_(event)));
    this.eventManager_.listen(session, 'keystatuseschange',
        (event) => this.onKeyStatusesChange_(event));

    const metadata = {
      initData: initData,
      initDataType: initDataType,
      loaded: false,
      oldExpiration: Infinity,
      updatePromise: null,
      type: sessionType,
    };
    this.activeSessions_.set(session, metadata);

    try {
      initData = this.config_.initDataTransform(
          initData, initDataType, this.currentDrmInfo_);
    } catch (error) {
      let shakaError = error;
      if (!(error instanceof shaka.util.Error)) {
        shakaError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.INIT_DATA_TRANSFORM_ERROR,
            error);
      }
      this.onError_(shakaError);
      return;
    }

    if (this.config_.logLicenseExchange) {
      const str = shaka.util.Uint8ArrayUtils.toBase64(initData);
      shaka.log.info('EME init data: type=', initDataType, 'data=', str);
    }

    session.generateRequest(initDataType, initData).catch((error) => {
      if (this.destroyer_.destroyed()) {
        return;
      }
      goog.asserts.assert(error instanceof Error, 'Wrong error type!');

      this.activeSessions_.delete(session);

      // This may be supplied by some polyfills.
      /** @type {MediaKeyError} */
      const errorCode = error['errorCode'];

      let extended;
      if (errorCode && errorCode.systemCode) {
        extended = errorCode.systemCode;
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
  }

  /**
   * @param {!MediaKeyMessageEvent} event
   * @private
   */
  onSessionMessage_(event) {
    if (this.delayLicenseRequest_()) {
      this.mediaKeyMessageEvents_.push(event);
    } else {
      this.sendLicenseRequest_(event);
    }
  }

  /**
   * @return {boolean}
   * @private
   */
  delayLicenseRequest_() {
    if (!this.video_) {
      // If there's no video, don't delay the license request; i.e., in the case
      // of offline storage.
      return false;
    }
    return (this.config_.delayLicenseRequestUntilPlayed &&
            this.video_.paused && !this.initialRequestsSent_);
  }

  /**
   * Sends a license request.
   * @param {!MediaKeyMessageEvent} event
   * @private
   */
  async sendLicenseRequest_(event) {
    /** @type {!MediaKeySession} */
    const session = event.target;
    shaka.log.v1(
        'Sending license request for session', session.sessionId, 'of type',
        event.messageType);
    if (this.config_.logLicenseExchange) {
      const str = shaka.util.Uint8ArrayUtils.toBase64(event.message);
      shaka.log.info('EME license request', str);
    }

    const metadata = this.activeSessions_.get(session);

    let url = this.currentDrmInfo_.licenseServerUri;
    const advancedConfig =
        this.config_.advanced[this.currentDrmInfo_.keySystem];

    if (event.messageType == 'individualization-request' && advancedConfig &&
        advancedConfig.individualizationServer) {
      url = advancedConfig.individualizationServer;
    }

    const requestType = shaka.net.NetworkingEngine.RequestType.LICENSE;
    const request = shaka.net.NetworkingEngine.makeRequest(
        [url], this.config_.retryParameters);
    request.body = event.message;
    request.method = 'POST';
    request.licenseRequestType = event.messageType;
    request.sessionId = session.sessionId;
    request.drmInfo = this.currentDrmInfo_;
    if (metadata) {
      request.initData = metadata.initData;
      request.initDataType = metadata.initDataType;
    }
    // NOTE: allowCrossSiteCredentials can be set in a request filter.

    if (shaka.media.DrmEngine.isPlayReadyKeySystem(
        this.currentDrmInfo_.keySystem)) {
      this.unpackPlayReadyRequest_(request);
    }

    const startTimeRequest = Date.now();

    let response;
    try {
      const req = this.playerInterface_.netEngine.request(requestType, request);
      response = await req.promise;
    } catch (error) {
      // Request failed!
      goog.asserts.assert(error instanceof shaka.util.Error,
          'Wrong NetworkingEngine error type!');
      const shakaErr = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.LICENSE_REQUEST_FAILED,
          error);
      this.onError_(shakaErr);
      if (metadata && metadata.updatePromise) {
        metadata.updatePromise.reject(shakaErr);
      }
      return;
    }
    if (this.destroyer_.destroyed()) {
      return;
    }

    this.licenseTimeSeconds_ += (Date.now() - startTimeRequest) / 1000;

    if (this.config_.logLicenseExchange) {
      const str = shaka.util.Uint8ArrayUtils.toBase64(response.data);
      shaka.log.info('EME license response', str);
    }

    // Request succeeded, now pass the response to the CDM.
    try {
      shaka.log.v1('Updating session', session.sessionId);
      await session.update(response.data);
    } catch (error) {
      // Session update failed!
      const shakaErr = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED,
          error.message);
      this.onError_(shakaErr);
      if (metadata && metadata.updatePromise) {
        metadata.updatePromise.reject(shakaErr);
      }
      return;
    }
    if (this.destroyer_.destroyed()) {
      return;
    }

    const updateEvent = new shaka.util.FakeEvent('drmsessionupdate');
    this.playerInterface_.onEvent(updateEvent);

    if (metadata) {
      if (metadata.updatePromise) {
        metadata.updatePromise.resolve();
      }

      this.setLoadSessionTimeoutTimer_(metadata);
    }
  }

  /**
   * Unpacks PlayReady license requests.  Modifies the request object.
   * @param {shaka.extern.Request} request
   * @private
   */
  unpackPlayReadyRequest_(request) {
    // On Edge, the raw license message is UTF-16-encoded XML.  We need
    // to unpack the Challenge element (base64-encoded string containing the
    // actual license request) and any HttpHeader elements (sent as request
    // headers).

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

    const xml = shaka.util.StringUtils.fromUTF16(
        request.body, /* littleEndian= */ true, /* noThrow= */ true);
    if (!xml.includes('PlayReadyKeyMessage')) {
      // This does not appear to be a wrapped message as on Edge.  Some
      // clients do not need this unwrapping, so we will assume this is one of
      // them.  Note that "xml" at this point probably looks like random
      // garbage, since we interpreted UTF-8 as UTF-16.
      shaka.log.debug('PlayReady request is already unwrapped.');
      request.headers['Content-Type'] = 'text/xml; charset=utf-8';
      return;
    }
    shaka.log.debug('Unwrapping PlayReady request.');
    const dom = shaka.util.XmlUtils.parseXmlString(xml, 'PlayReadyKeyMessage');
    goog.asserts.assert(dom, 'Failed to parse PlayReady XML!');

    // Set request headers.
    const headers = dom.getElementsByTagName('HttpHeader');
    for (const header of headers) {
      const name = header.getElementsByTagName('name')[0];
      const value = header.getElementsByTagName('value')[0];
      goog.asserts.assert(name && value, 'Malformed PlayReady headers!');
      request.headers[name.textContent] = value.textContent;
    }

    // Unpack the base64-encoded challenge.
    const challenge = dom.getElementsByTagName('Challenge')[0];
    goog.asserts.assert(challenge, 'Malformed PlayReady challenge!');
    goog.asserts.assert(challenge.getAttribute('encoding') == 'base64encoded',
        'Unexpected PlayReady challenge encoding!');
    request.body = shaka.util.Uint8ArrayUtils.fromBase64(challenge.textContent);
  }

  /**
   * @param {!Event} event
   * @private
   * @suppress {invalidCasts} to swap keyId and status
   */
  onKeyStatusesChange_(event) {
    const session = /** @type {!MediaKeySession} */(event.target);
    shaka.log.v2('Key status changed for session', session.sessionId);

    const found = this.activeSessions_.get(session);
    const keyStatusMap = session.keyStatuses;
    let hasExpiredKeys = false;

    keyStatusMap.forEach((status, keyId) => {
      // The spec has changed a few times on the exact order of arguments here.
      // As of 2016-06-30, Edge has the order reversed compared to the current
      // EME spec.  Given the back and forth in the spec, it may not be the only
      // one.  Try to detect this and compensate:
      if (typeof keyId == 'string') {
        const tmp = keyId;
        keyId = /** @type {!ArrayBuffer} */(status);
        status = /** @type {string} */(tmp);
      }

      // Microsoft's implementation in Edge seems to present key IDs as
      // little-endian UUIDs, rather than big-endian or just plain array of
      // bytes.
      // standard: 6e 5a 1d 26 - 27 57 - 47 d7 - 80 46 ea a5 d1 d3 4b 5a
      // on Edge:  26 1d 5a 6e - 57 27 - d7 47 - 80 46 ea a5 d1 d3 4b 5a
      // Bug filed: https://bit.ly/2thuzXu

      // NOTE that we skip this if byteLength != 16.  This is used for Edge
      // which uses single-byte dummy key IDs.
      // However, unlike Edge and Chromecast, Tizen doesn't have this problem.
      if (shaka.media.DrmEngine.isPlayReadyKeySystem(
          this.currentDrmInfo_.keySystem) &&
          keyId.byteLength == 16 &&
          (shaka.util.Platform.isEdge() || shaka.util.Platform.isPS4())) {
        // Read out some fields in little-endian:
        const dataView = shaka.util.BufferUtils.toDataView(keyId);
        const part0 = dataView.getUint32(0, /* LE= */ true);
        const part1 = dataView.getUint16(4, /* LE= */ true);
        const part2 = dataView.getUint16(6, /* LE= */ true);
        // Write it back in big-endian:
        dataView.setUint32(0, part0, /* BE= */ false);
        dataView.setUint16(4, part1, /* BE= */ false);
        dataView.setUint16(6, part2, /* BE= */ false);
      }

      if (status != 'status-pending') {
        found.loaded = true;
      }

      if (!found) {
        // We can get a key status changed for a closed session after it has
        // been removed from |activeSessions_|.  If it is closed, none of its
        // keys should be usable.
        goog.asserts.assert(
            status != 'usable', 'Usable keys found in closed session');
      }

      if (status == 'expired') {
        hasExpiredKeys = true;
      }

      const keyIdHex = shaka.util.Uint8ArrayUtils.toHex(keyId).slice(0, 32);

      this.keyStatusByKeyId_.set(keyIdHex, status);
    });

    // If the session has expired, close it.
    // Some CDMs do not have sub-second time resolution, so the key status may
    // fire with hundreds of milliseconds left until the stated expiration time.
    const msUntilExpiration = session.expiration - Date.now();
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
        /* seconds= */ shaka.media.DrmEngine.KEY_STATUS_BATCH_TIME);
  }

  /** @private */
  processKeyStatusChanges_() {
    const privateMap = this.keyStatusByKeyId_;
    const publicMap = this.announcedKeyStatusByKeyId_;

    // Copy the latest key statuses into the publicly-accessible map.
    publicMap.clear();
    privateMap.forEach((status, keyId) => publicMap.set(keyId, status));

    // If all keys are expired, fire an error. |every| is always true for an
    // empty array but we shouldn't fire an error for a lack of key status info.
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
  }

  /**
   * Returns true if the browser has recent EME APIs.
   *
   * @return {boolean}
   */
  static isBrowserSupported() {
    const basic =
        !!window.MediaKeys &&
        !!window.navigator &&
        !!window.navigator.requestMediaKeySystemAccess &&
        !!window.MediaKeySystemAccess &&
        // eslint-disable-next-line no-restricted-syntax
        !!window.MediaKeySystemAccess.prototype.getConfiguration;

    return basic;
  }

  /**
   * Returns a Promise to a map of EME support for well-known key systems.
   *
   * @return {!Promise.<!Object.<string, ?shaka.extern.DrmSupportType>>}
   */
  static async probeSupport() {
    goog.asserts.assert(shaka.media.DrmEngine.isBrowserSupported(),
        'Must have basic EME support');

    const testKeySystems = [
      'org.w3.clearkey',
      'com.widevine.alpha',
      'com.microsoft.playready',
      'com.microsoft.playready.recommendation',
      'com.apple.fps.1_0',
      'com.apple.fps',
      'com.adobe.primetime',
    ];

    const basicVideoCapabilities = [
      {contentType: 'video/mp4; codecs="avc1.42E01E"'},
      {contentType: 'video/webm; codecs="vp8"'},
    ];

    const basicConfig = {
      initDataTypes: ['cenc'],
      videoCapabilities: basicVideoCapabilities,
    };
    const offlineConfig = {
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
        // Our Polyfill will reject anything apart com.apple.fps key systems.
        // It seems the Safari modern EME API will allow to request a
        // MediaKeySystemAccess for the ClearKey CDM, create and update a key
        // session but playback will never start
        // Safari bug: https://bugs.webkit.org/show_bug.cgi?id=231006
        if (keySystem === 'org.w3.clearkey' &&
            shaka.util.Platform.isSafari()) {
          throw new Error('Unsupported keySystem');
        }

        const access = await navigator.requestMediaKeySystemAccess(
            keySystem, configs);

        // Edge doesn't return supported session types, but current versions
        // do not support persistent-license.  If sessionTypes is missing,
        // assume no support for persistent-license.
        // TODO: Polyfill Edge to return known supported session types.
        // Edge bug: https://bit.ly/2IeKzho
        const sessionTypes = access.getConfiguration().sessionTypes;
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
    await Promise.all(tests);
    return shaka.util.MapUtils.asObject(support);
  }

  /** @private */
  onPlay_() {
    for (const event of this.mediaKeyMessageEvents_) {
      this.sendLicenseRequest_(event);
    }

    this.initialRequestsSent_ = true;
    this.mediaKeyMessageEvents_ = [];
  }

  /**
   * Close a drm session while accounting for a bug in Chrome. Sometimes the
   * Promise returned by close() never resolves.
   *
   * See issue #2741 and http://crbug.com/1108158.
   * @param {!MediaKeySession} session
   * @return {!Promise}
   * @private
   */
  async closeSession_(session) {
    const DrmEngine = shaka.media.DrmEngine;

    const timeout = new Promise((resolve, reject) => {
      const timer = new shaka.util.Timer(reject);
      timer.tickAfter(DrmEngine.CLOSE_TIMEOUT_);
    });

    try {
      await Promise.race([
        Promise.all([session.close(), session.closed]),
        timeout,
      ]);
    } catch (e) {
      shaka.log.warning('Timeout waiting for session close');
    }
  }

  /** @private */
  async closeOpenSessions_() {
    // Close all open sessions.
    const openSessions = Array.from(this.activeSessions_.entries());
    this.activeSessions_.clear();

    // Close all sessions before we remove media keys from the video element.
    await Promise.all(openSessions.map(async ([session, metadata]) => {
      try {
        /**
         * Special case when a persistent-license session has been initiated,
         * without being registered in the offline sessions at start-up.
         * We should remove the session to prevent it from being orphaned after
         * the playback session ends
         */
        if (!this.initializedForStorage_ &&
            !this.storedPersistentSessions_.has(session.sessionId) &&
            metadata.type === 'persistent-license' &&
            !this.config_.persistentSessionOnlinePlayback) {
          shaka.log.v1('Removing session', session.sessionId);

          await session.remove();
        } else {
          shaka.log.v1('Closing session', session.sessionId, metadata);

          await this.closeSession_(session);
        }
      } catch (error) {
        // Ignore errors when closing the sessions. Closing a session that
        // generated no key requests will throw an error.

        shaka.log.error('Failed to close or remove the session', error);
      }
    }));
  }

  /**
   * Check if a variant is likely to be supported by DrmEngine. This will err on
   * the side of being too accepting and may not reject a variant that it will
   * later fail to play.
   *
   * @param {!shaka.extern.Variant} variant
   * @return {boolean}
   */
  supportsVariant(variant) {
    /** @type {?shaka.extern.Stream} */
    const audio = variant.audio;
    /** @type {?shaka.extern.Stream} */
    const video = variant.video;

    if (audio && audio.encrypted) {
      const audioContentType = shaka.media.DrmEngine.computeMimeType_(audio);
      if (!this.willSupport(audioContentType)) {
        return false;
      }
    }

    if (video && video.encrypted) {
      const videoContentType = shaka.media.DrmEngine.computeMimeType_(video);
      if (!this.willSupport(videoContentType)) {
        return false;
      }
    }

    const keySystem = shaka.media.DrmEngine.keySystem(this.currentDrmInfo_);
    const drmInfos = this.getVariantDrmInfos_(variant);

    return drmInfos.length == 0 ||
        drmInfos.some((drmInfo) => drmInfo.keySystem == keySystem);
  }

  /**
   * Checks if two DrmInfos can be decrypted using the same key system.
   * Clear content is considered compatible with every key system.
   *
   * @param {!Array.<!shaka.extern.DrmInfo>} drms1
   * @param {!Array.<!shaka.extern.DrmInfo>} drms2
   * @return {boolean}
   */
  static areDrmCompatible(drms1, drms2) {
    if (!drms1.length || !drms2.length) {
      return true;
    }

    if (drms1 === drms2) {
      return true;
    }

    return shaka.media.DrmEngine.getCommonDrmInfos(
        drms1, drms2).length > 0;
  }

  /**
   * Returns an array of drm infos that are present in both input arrays.
   * If one of the arrays is empty, returns the other one since clear
   * content is considered compatible with every drm info.
   *
   * @param {!Array.<!shaka.extern.DrmInfo>} drms1
   * @param {!Array.<!shaka.extern.DrmInfo>} drms2
   * @return {!Array.<!shaka.extern.DrmInfo>}
   */
  static getCommonDrmInfos(drms1, drms2) {
    if (!drms1.length) {
      return drms2;
    }
    if (!drms2.length) {
      return drms1;
    }

    const commonDrms = [];

    for (const drm1 of drms1) {
      for (const drm2 of drms2) {
        // This method is only called to compare drmInfos of a video and an
        // audio adaptations, so we shouldn't have to worry about checking
        // robustness.
        if (drm1.keySystem == drm2.keySystem) {
          const initDataMap = new Map();
          const bothInitDatas = (drm1.initData || [])
              .concat(drm2.initData || []);
          for (const d of bothInitDatas) {
            initDataMap.set(d.keyId, d);
          }
          const initData = Array.from(initDataMap.values());

          const keyIds = drm1.keyIds && drm2.keyIds ?
              new Set([...drm1.keyIds, ...drm2.keyIds]) :
              drm1.keyIds || drm2.keyIds;
          const mergedDrm = {
            keySystem: drm1.keySystem,
            licenseServerUri: drm1.licenseServerUri || drm2.licenseServerUri,
            distinctiveIdentifierRequired: drm1.distinctiveIdentifierRequired ||
                drm2.distinctiveIdentifierRequired,
            persistentStateRequired: drm1.persistentStateRequired ||
                drm2.persistentStateRequired,
            videoRobustness: drm1.videoRobustness || drm2.videoRobustness,
            audioRobustness: drm1.audioRobustness || drm2.audioRobustness,
            serverCertificate: drm1.serverCertificate || drm2.serverCertificate,
            serverCertificateUri: drm1.serverCertificateUri ||
                drm2.serverCertificateUri,
            initData,
            keyIds,
          };
          commonDrms.push(mergedDrm);
          break;
        }
      }
    }

    return commonDrms;
  }

  /**
   * Concat the audio and video drmInfos in a variant.
   * @param {shaka.extern.Variant} variant
   * @return {!Array.<!shaka.extern.DrmInfo>}
   * @private
   */
  getVariantDrmInfos_(variant) {
    const videoDrmInfos = variant.video ? variant.video.drmInfos : [];
    const audioDrmInfos = variant.audio ? variant.audio.drmInfos : [];
    return videoDrmInfos.concat(audioDrmInfos);
  }

  /**
   * Called in an interval timer to poll the expiration times of the sessions.
   * We don't get an event from EME when the expiration updates, so we poll it
   * so we can fire an event when it happens.
   * @private
   */
  pollExpiration_() {
    this.activeSessions_.forEach((metadata, session) => {
      const oldTime = metadata.oldExpiration;
      let newTime = session.expiration;
      if (isNaN(newTime)) {
        newTime = Infinity;
      }

      if (newTime != oldTime) {
        this.playerInterface_.onExpirationUpdated(session.sessionId, newTime);
        metadata.oldExpiration = newTime;
      }
    });
  }

  /**
   * @return {boolean}
   * @private
   */
  areAllSessionsLoaded_() {
    const metadatas = this.activeSessions_.values();
    return shaka.util.Iterables.every(metadatas, (data) => data.loaded);
  }

  /**
   * @return {boolean}
   * @private
   */
  areAllKeysUsable_() {
    const keyIds = (this.currentDrmInfo_ && this.currentDrmInfo_.keyIds) ||
        new Set([]);

    for (const keyId of keyIds) {
      const status = this.keyStatusByKeyId_.get(keyId);

      if (status !== 'usable') {
        return false;
      }
    }

    return true;
  }

  /**
   * Replace the drm info used in each variant in |variants| to reflect each
   * key service in |keySystems|.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {!Map.<string, string>} keySystems
   * @private
   */
  static replaceDrmInfo_(variants, keySystems) {
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
        serverCertificateUri: '',
        initData: [],
        keyIds: new Set(),
      });
    });

    for (const variant of variants) {
      if (variant.video) {
        variant.video.drmInfos = drmInfos;
      }
      if (variant.audio) {
        variant.audio.drmInfos = drmInfos;
      }
    }
  }


  /**
   * Creates a DrmInfo object describing the settings used to initialize the
   * engine.
   *
   * @param {string} keySystem
   * @param {!Array.<shaka.extern.DrmInfo>} drmInfos
   * @return {shaka.extern.DrmInfo}
   *
   * @private
   */
  createDrmInfoByInfos_(keySystem, drmInfos) {
    /** @type {!Array.<string>} */
    const licenseServers = [];

    /** @type {!Array.<string>} */
    const serverCertificateUris = [];

    /** @type {!Array.<!Uint8Array>} */
    const serverCerts = [];

    /** @type {!Array.<!shaka.extern.InitDataOverride>} */
    const initDatas = [];

    /** @type {!Set.<string>} */
    const keyIds = new Set();

    shaka.media.DrmEngine.processDrmInfos_(
        drmInfos, licenseServers, serverCerts,
        serverCertificateUris, initDatas, keyIds);

    if (serverCerts.length > 1) {
      shaka.log.warning('Multiple unique server certificates found! ' +
                        'Only the first will be used.');
    }

    if (licenseServers.length > 1) {
      shaka.log.warning('Multiple unique license server URIs found! ' +
                        'Only the first will be used.');
    }

    if (serverCertificateUris.length > 1) {
      shaka.log.warning('Multiple unique server certificate URIs found! ' +
                        'Only the first will be used.');
    }

    const defaultSessionType =
        this.usePersistentLicenses_ ? 'persistent-license' : 'temporary';

    /** @type {shaka.extern.DrmInfo} */
    const res = {
      keySystem,
      licenseServerUri: licenseServers[0],
      distinctiveIdentifierRequired: drmInfos[0].distinctiveIdentifierRequired,
      persistentStateRequired: drmInfos[0].persistentStateRequired,
      sessionType: drmInfos[0].sessionType || defaultSessionType,
      audioRobustness: drmInfos[0].audioRobustness || '',
      videoRobustness: drmInfos[0].videoRobustness || '',
      serverCertificate: serverCerts[0],
      serverCertificateUri: serverCertificateUris[0],
      initData: initDatas,
      keyIds,
    };

    for (const info of drmInfos) {
      if (info.distinctiveIdentifierRequired) {
        res.distinctiveIdentifierRequired = info.distinctiveIdentifierRequired;
      }

      if (info.persistentStateRequired) {
        res.persistentStateRequired = info.persistentStateRequired;
      }
    }

    return res;
  }

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
  static createDrmInfoByConfigs_(keySystem, config) {
    /** @type {!Array.<string>} */
    const licenseServers = [];

    /** @type {!Array.<string>} */
    const serverCertificateUris = [];

    /** @type {!Array.<!Uint8Array>} */
    const serverCerts = [];

    /** @type {!Array.<!shaka.extern.InitDataOverride>} */
    const initDatas = [];

    /** @type {!Set.<string>} */
    const keyIds = new Set();

    // TODO: refactor, don't stick drmInfos onto MediaKeySystemConfiguration
    shaka.media.DrmEngine.processDrmInfos_(
        config['drmInfos'], licenseServers, serverCerts,
        serverCertificateUris, initDatas, keyIds);

    if (serverCerts.length > 1) {
      shaka.log.warning('Multiple unique server certificates found! ' +
                        'Only the first will be used.');
    }

    if (serverCertificateUris.length > 1) {
      shaka.log.warning('Multiple unique server certificate URIs found! ' +
                        'Only the first will be used.');
    }

    if (licenseServers.length > 1) {
      shaka.log.warning('Multiple unique license server URIs found! ' +
                        'Only the first will be used.');
    }

    // TODO: This only works when all DrmInfo have the same robustness.
    const audioRobustness =
        config.audioCapabilities ? config.audioCapabilities[0].robustness : '';
    const videoRobustness =
        config.videoCapabilities ? config.videoCapabilities[0].robustness : '';

    const distinctiveIdentifier = config.distinctiveIdentifier;
    return {
      keySystem,
      licenseServerUri: licenseServers[0],
      distinctiveIdentifierRequired: (distinctiveIdentifier == 'required'),
      persistentStateRequired: (config.persistentState == 'required'),
      sessionType: config.sessionTypes[0] || 'temporary',
      audioRobustness: audioRobustness || '',
      videoRobustness: videoRobustness || '',
      serverCertificate: serverCerts[0],
      serverCertificateUri: serverCertificateUris[0],
      initData: initDatas,
      keyIds,
    };
  }

  /**
   * Extract license server, server cert, and init data from |drmInfos|, taking
   * care to eliminate duplicates.
   *
   * @param {!Array.<shaka.extern.DrmInfo>} drmInfos
   * @param {!Array.<string>} licenseServers
   * @param {!Array.<!Uint8Array>} serverCerts
   * @param {!Array.<string>} serverCertificateUris
   * @param {!Array.<!shaka.extern.InitDataOverride>} initDatas
   * @param {!Set.<string>} keyIds
   * @private
   */
  static processDrmInfos_(
      drmInfos, licenseServers, serverCerts,
      serverCertificateUris, initDatas, keyIds) {
    /** @type {function(shaka.extern.InitDataOverride,
     *                  shaka.extern.InitDataOverride):boolean} */
    const initDataOverrideEqual = (a, b) => {
      if (a.keyId && a.keyId == b.keyId) {
        // Two initDatas with the same keyId are considered to be the same,
        // unless that "same keyId" is null.
        return true;
      }
      return a.initDataType == b.initDataType &&
         shaka.util.BufferUtils.equal(a.initData, b.initData);
    };

    for (const drmInfo of drmInfos) {
      // Build an array of unique license servers.
      if (!licenseServers.includes(drmInfo.licenseServerUri)) {
        licenseServers.push(drmInfo.licenseServerUri);
      }

      // Build an array of unique license servers.
      if (!serverCertificateUris.includes(drmInfo.serverCertificateUri)) {
        serverCertificateUris.push(drmInfo.serverCertificateUri);
      }

      // Build an array of unique server certs.
      if (drmInfo.serverCertificate) {
        const found = serverCerts.some(
            (cert) => shaka.util.BufferUtils.equal(
                cert, drmInfo.serverCertificate));
        if (!found) {
          serverCerts.push(drmInfo.serverCertificate);
        }
      }

      // Build an array of unique init datas.
      if (drmInfo.initData) {
        for (const initDataOverride of drmInfo.initData) {
          const found = initDatas.some(
              (initData) =>
                initDataOverrideEqual(initData, initDataOverride));
          if (!found) {
            initDatas.push(initDataOverride);
          }
        }
      }

      if (drmInfo.keyIds) {
        for (const keyId of drmInfo.keyIds) {
          keyIds.add(keyId);
        }
      }
    }
  }

  /**
   * Use |servers| and |advancedConfigs| to fill in missing values in drmInfo
   * that the parser left blank. Before working with any drmInfo, it should be
   * passed through here as it is uncommon for drmInfo to be complete when
   * fetched from a manifest because most manifest formats do not have the
   * required information. Also applies the key systems mapping.
   *
   * @param {shaka.extern.DrmInfo} drmInfo
   * @param {!Map.<string, string>} servers
   * @param {!Map.<string, shaka.extern.AdvancedDrmConfiguration>}
   *   advancedConfigs
   * @param {!Object.<string, string>} keySystemsMapping
   * @private
   */
  static fillInDrmInfoDefaults_(drmInfo, servers, advancedConfigs,
      keySystemsMapping) {
    const originalKeySystem = drmInfo.keySystem;

    if (!originalKeySystem) {
      // This is a placeholder from the manifest parser for an unrecognized key
      // system.  Skip this entry, to avoid logging nonsensical errors.
      return;
    }

    // The order of preference for drmInfo:
    // 1. Clear Key config, used for debugging, should override everything else.
    //    (The application can still specify a clearkey license server.)
    // 2. Application-configured servers, if any are present, should override
    //    anything from the manifest.  Nuance: if key system A is in the
    //    manifest and key system B is in the player config, only B will be
    //    used, not A.
    // 3. Manifest-provided license servers are only used if nothing else is
    //    specified.
    // This is important because it allows the application a clear way to
    // indicate which DRM systems should be used on platforms with multiple DRM
    // systems.
    // The only way to get license servers from the manifest is not to specify
    // any in your player config.

    if (originalKeySystem == 'org.w3.clearkey' && drmInfo.licenseServerUri) {
      // Preference 1: Clear Key with pre-configured keys will have a data URI
      // assigned as its license server.  Don't change anything.
      return;
    } else if (servers.size) {
      // Preference 2: If anything is configured at the application level,
      // override whatever was in the manifest.
      const server = servers.get(originalKeySystem) || '';

      drmInfo.licenseServerUri = server;
    } else {
      // Preference 3: Keep whatever we had in drmInfo.licenseServerUri, which
      // comes from the manifest.
    }

    if (!drmInfo.keyIds) {
      drmInfo.keyIds = new Set();
    }

    const advancedConfig = advancedConfigs.get(originalKeySystem);

    if (advancedConfig) {
      if (!drmInfo.distinctiveIdentifierRequired) {
        drmInfo.distinctiveIdentifierRequired =
            advancedConfig.distinctiveIdentifierRequired;
      }

      if (!drmInfo.persistentStateRequired) {
        drmInfo.persistentStateRequired =
            advancedConfig.persistentStateRequired;
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

      if (advancedConfig.sessionType) {
        drmInfo.sessionType = advancedConfig.sessionType;
      }

      if (!drmInfo.serverCertificateUri) {
        drmInfo.serverCertificateUri = advancedConfig.serverCertificateUri;
      }
    }

    if (keySystemsMapping[originalKeySystem]) {
      drmInfo.keySystem = keySystemsMapping[originalKeySystem];
    }

    // Chromecast has a variant of PlayReady that uses a different key
    // system ID.  Since manifest parsers convert the standard PlayReady
    // UUID to the standard PlayReady key system ID, here we will switch
    // to the Chromecast version if we are running on that platform.
    // Note that this must come after fillInDrmInfoDefaults_, since the
    // player config uses the standard PlayReady ID for license server
    // configuration.
    if (window.cast && window.cast.__platform__) {
      if (originalKeySystem == 'com.microsoft.playready') {
        drmInfo.keySystem = 'com.chromecast.playready';
      }
    }
  }

  /**
   * Parse  pssh from a media segment and announce new initData
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {!BufferSource} mediaSegment
   * @return {!Promise<void>}
   */
  parseInbandPssh(contentType, mediaSegment) {
    if (!this.config_.parseInbandPsshEnabled || this.manifestInitData_) {
      return Promise.resolve();
    }

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (![ContentType.AUDIO, ContentType.VIDEO].includes(contentType)) {
      return Promise.resolve();
    }

    const pssh = new shaka.util.Pssh(
        shaka.util.BufferUtils.toUint8(mediaSegment));

    let totalLength = 0;
    for (const data of pssh.data) {
      totalLength += data.length;
    }
    if (totalLength == 0) {
      return Promise.resolve();
    }
    const combinedData = new Uint8Array(totalLength);
    let pos = 0;
    for (const data of pssh.data) {
      combinedData.set(data, pos);
      pos += data.length;
    }
    this.newInitData('cenc', combinedData);
    return this.allSessionsLoaded_;
  }
};


/**
 * @typedef {{
 *   loaded: boolean,
 *   initData: Uint8Array,
 *   initDataType: ?string,
 *   oldExpiration: number,
 *   type: string,
 *   updatePromise: shaka.util.PublicPromise
 * }}
 *
 * @description A record to track sessions and suppress duplicate init data.
 * @property {boolean} loaded
 *   True once the key status has been updated (to a non-pending state).  This
 *   does not mean the session is 'usable'.
 * @property {Uint8Array} initData
 *   The init data used to create the session.
 * @property {?string} initDataType
 *   The init data type used to create the session.
 * @property {!MediaKeySession} session
 *   The session object.
 * @property {number} oldExpiration
 *   The expiration of the session on the last check.  This is used to fire
 *   an event when it changes.
 * @property {string} type
 *   The session type
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

/**
 * The amount of time, in seconds, we wait to consider a session closed.
 * This allows us to work around Chrome bug https://crbug.com/1108158.
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
 * @type {number}
 */
shaka.media.DrmEngine.KEY_STATUS_BATCH_TIME = 0.5;


/**
 * Contains the suggested "default" key ID used by EME polyfills that do not
 * have a per-key key status. See w3c/encrypted-media#32.
 * @type {!shaka.util.Lazy.<!ArrayBuffer>}
 */
shaka.media.DrmEngine.DUMMY_KEY_ID = new shaka.util.Lazy(
    () => shaka.util.BufferUtils.toArrayBuffer(new Uint8Array([0])));
