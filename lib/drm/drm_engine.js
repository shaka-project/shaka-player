/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.drm.DrmEngine');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Destroyer');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.ObjectUtils');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.TXml');
goog.require('shaka.util.Uint8ArrayUtils');


/** @implements {shaka.util.IDestroyable} */
shaka.drm.DrmEngine = class {
  /**
   * @param {shaka.drm.DrmEngine.PlayerInterface} playerInterface
   */
  constructor(playerInterface) {
    /** @private {?shaka.drm.DrmEngine.PlayerInterface} */
    this.playerInterface_ = playerInterface;

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
     * @private {!Map<MediaKeySession,
     *           shaka.drm.DrmEngine.SessionMetaData>}
     */
    this.activeSessions_ = new Map();

    /** @private {!Array<!shaka.net.NetworkingEngine.PendingRequest>} */
    this.activeRequests_ = [];

    /**
     * @private {!Map<string,
     *           {initData: ?Uint8Array, initDataType: ?string}>}
     */
    this.storedPersistentSessions_ = new Map();

    /** @private {boolean} */
    this.hasInitData_ = false;

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
     * @private {!Map<string, string>}
     */
    this.keyStatusByKeyId_ = new Map();

    /**
     * The key statuses most recently announced to other classes.
     * We may have more up-to-date information being collected in
     * this.keyStatusByKeyId_, which has not been batched up and released yet.
     * @private {!Map<string, string>}
     */
    this.announcedKeyStatusByKeyId_ = new Map();

    /** @private {shaka.util.Timer} */
    this.keyStatusTimer_ =
        new shaka.util.Timer(() => this.processKeyStatusChanges_());

    /** @private {boolean} */
    this.usePersistentLicenses_ = false;

    /** @private {!Array<!MediaKeyMessageEvent>} */
    this.mediaKeyMessageEvents_ = [];

    /** @private {boolean} */
    this.initialRequestsSent_ = false;

    /** @private {?shaka.util.Timer} */
    this.expirationTimer_ = new shaka.util.Timer(() => {
      this.pollExpiration_();
    });

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

    /** @private {function():boolean} */
    this.isPreload_ = () => false;
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
      // Webkit EME implementation requires the src to be defined to clear
      // the MediaKeys.
      if (!shaka.drm.DrmUtils.isMediaKeysPolyfilled('webkit')) {
        goog.asserts.assert(
            !this.video_.src &&
            !this.video_.getElementsByTagName('source').length,
            'video src must be removed first!');
      }

      try {
        await this.video_.setMediaKeys(null);
      } catch (error) {
        // Ignore any failures while removing media keys from the video element.
        shaka.log.debug(`DrmEngine.destroyNow_ exception`, error);
      }

      this.video_ = null;
    }

    // Break references to everything else we hold internally.
    this.currentDrmInfo_ = null;
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
   * @param {(function():boolean)=} isPreload
   */
  configure(config, isPreload) {
    this.config_ = config;
    if (isPreload) {
      this.isPreload_ = isPreload;
    }
    if (this.expirationTimer_ && this.initialized_ && this.currentDrmInfo_) {
      this.expirationTimer_.tickEvery(
          /* seconds= */ this.config_.updateExpirationTime);
    }
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
   * @param {!Array<shaka.extern.Variant>} variants
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

    return this.init_(variants, /* isLive= */ false);
  }

  /**
   * Initialize the drm engine for playback operations.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   *    The variants that we want to support playing.
   * @param {!Array<string>} offlineSessionIds
   * @param {boolean=} isLive
   * @return {!Promise}
   */
  initForPlayback(variants, offlineSessionIds, isLive = true) {
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

    return this.init_(variants, isLive);
  }

  /**
   * Initializes the drm engine for removing persistent sessions.  Only the
   * removeSession(s) methods will work correctly, creating new sessions may not
   * work as desired.
   *
   * @param {string} keySystem
   * @param {string} licenseServerUri
   * @param {Uint8Array} serverCertificate
   * @param {!Array<MediaKeySystemMediaCapability>} audioCapabilities
   * @param {!Array<MediaKeySystemMediaCapability>} videoCapabilities
   * @return {!Promise}
   */
  async initForRemoval(keySystem, licenseServerUri, serverCertificate,
      audioCapabilities, videoCapabilities) {
    const mimeTypes = [];
    if (videoCapabilities.length) {
      mimeTypes.push(videoCapabilities[0].contentType);
    }
    if (audioCapabilities.length) {
      mimeTypes.push(audioCapabilities[0].contentType);
    }

    const makeDrmInfo = (encryptionScheme) => {
      const drmInfo = shaka.util.ManifestParserUtils.createDrmInfo(
          keySystem, encryptionScheme, null);
      drmInfo.licenseServerUri = licenseServerUri;
      drmInfo.serverCertificate = serverCertificate;
      drmInfo.persistentStateRequired = true;
      drmInfo.sessionType = 'persistent-license';
      return drmInfo;
    };
    const variant = shaka.util.StreamUtils.createEmptyVariant(mimeTypes);
    if (variant.video) {
      const drmInfo = makeDrmInfo(videoCapabilities[0].encryptionScheme || '');
      variant.video.drmInfos.push(drmInfo);
    }
    if (variant.audio) {
      const drmInfo = makeDrmInfo(audioCapabilities[0].encryptionScheme || '');
      variant.audio.drmInfos.push(drmInfo);
    }
    // We should get the decodingInfo results for the variants after we filling
    // in the drm infos, and before queryMediaKeys_().
    await shaka.util.StreamUtils.getDecodingInfosForVariants([variant],
        /* usePersistentLicenses= */ true, this.srcEquals_,
        /* preferredKeySystems= */ []);
    this.destroyer_.ensureNotDestroyed();
    return this.queryMediaKeys_(/* variants= */ [variant]);
  }

  /**
   * Negotiate for a key system and set up MediaKeys.
   * This will assume that both |usePersistentLicences_| and
   * |storedPersistentSessions_| have been properly set.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   *    The variants that we expect to operate with during the drm engine's
   *    lifespan of the drm engine.
   * @param {boolean} isLive
   * @return {!Promise} Resolved if/when a key system has been chosen.
   * @private
   */
  async init_(variants, isLive) {
    goog.asserts.assert(this.config_,
        'DrmEngine configure() must be called before init()!');

    shaka.drm.DrmEngine.configureClearKey(this.config_.clearKeys, variants);

    const hadDrmInfo = variants.some((variant) => {
      if (variant.video && variant.video.drmInfos.length) {
        return true;
      }
      if (variant.audio && variant.audio.drmInfos.length) {
        return true;
      }
      return false;
    });

    const servers = shaka.util.MapUtils.asMap(this.config_.servers);
    const advanced = shaka.util.MapUtils.asMap(this.config_.advanced || {});

    // When preparing to play live streams, it is possible that we won't know
    // about some upcoming encrypted content. If we initialize the drm engine
    // with no key systems, we won't be able to play when the encrypted content
    // comes.
    //
    // To avoid this, we will set the drm engine up to work with as many key
    // systems as possible so that we will be ready.
    if (!hadDrmInfo && isLive) {
      shaka.drm.DrmEngine.replaceDrmInfo_(variants, servers);
    }

    const drmInfos = new WeakSet();
    for (const variant of variants) {
      const variantDrmInfos = this.getVariantDrmInfos_(variant);
      for (const info of variantDrmInfos) {
        if (!drmInfos.has(info)) {
          drmInfos.add(info);
          shaka.drm.DrmEngine.fillInDrmInfoDefaults_(
              info, servers, advanced, this.config_.keySystemsMapping);
        }
      }
    }

    /**
     * Expand robustness into multiple drm infos if multiple video robustness
     * levels were provided.
     *
     * robustness can be either a single item as a string or multiple items as
     * an array of strings.
     *
     * @param {!Array<shaka.extern.DrmInfo>} drmInfos
     * @param {string} robustnessType
     * @return {!Array<shaka.extern.DrmInfo>}
     */
    const expandRobustness = (drmInfos, robustnessType) => {
      const newDrmInfos = [];
      for (const drmInfo of drmInfos) {
        let items = drmInfo[robustnessType] ||
            (advanced.has(drmInfo.keySystem) &&
            advanced.get(drmInfo.keySystem)[robustnessType]) || '';
        if (items == '' &&
            shaka.drm.DrmUtils.isWidevineKeySystem(drmInfo.keySystem)) {
          if (robustnessType == 'audioRobustness') {
            items = [this.config_.defaultAudioRobustnessForWidevine];
          } else if (robustnessType == 'videoRobustness') {
            items = [this.config_.defaultVideoRobustnessForWidevine];
          }
        }
        if (typeof items === 'string') {
          // if drmInfo's robustness has already been expanded,
          // use the drmInfo directly.
          newDrmInfos.push(drmInfo);
        } else if (Array.isArray(items)) {
          if (items.length === 0) {
            items = [''];
          }
          for (const item of items) {
            newDrmInfos.push(
                Object.assign({}, drmInfo, {[robustnessType]: item}),
            );
          }
        }
      }
      return newDrmInfos;
    };

    const expandedStreams = new WeakSet();

    for (const variant of variants) {
      if (variant.video && !expandedStreams.has(variant.video)) {
        variant.video.drmInfos =
            expandRobustness(variant.video.drmInfos,
                'videoRobustness');
        variant.video.drmInfos =
            expandRobustness(variant.video.drmInfos,
                'audioRobustness');
        expandedStreams.add(variant.video);
      }
      if (variant.audio && !expandedStreams.has(variant.audio)) {
        variant.audio.drmInfos =
            expandRobustness(variant.audio.drmInfos,
                'videoRobustness');
        variant.audio.drmInfos =
            expandRobustness(variant.audio.drmInfos,
                'audioRobustness');
        expandedStreams.add(variant.audio);
      }
    }

    // We should get the decodingInfo results for the variants after we filling
    // in the drm infos, and before queryMediaKeys_().
    await shaka.util.StreamUtils.getDecodingInfosForVariants(variants,
        this.usePersistentLicenses_, this.srcEquals_,
        this.config_.preferredKeySystems);
    this.destroyer_.ensureNotDestroyed();

    const hasDrmInfo = hadDrmInfo || servers.size > 0;
    // An unencrypted content is initialized.
    if (!hasDrmInfo) {
      this.initialized_ = true;
      return Promise.resolve();
    }

    const p = this.queryMediaKeys_(variants);

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
    if (this.video_ === video) {
      return;
    }
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

    if (this.config_.delayLicenseRequestUntilPlayed) {
      this.eventManager_.listenOnce(this.video_, 'play', () => this.onPlay_());
    }
    if (this.video_.remote) {
      this.eventManager_.listen(this.video_.remote, 'connect',
          () => this.closeOpenSessions_());
      this.eventManager_.listen(this.video_.remote, 'connecting',
          () => this.closeOpenSessions_());
      this.eventManager_.listen(this.video_.remote, 'disconnect',
          () => this.closeOpenSessions_());
    } else if ('webkitCurrentPlaybackTargetIsWireless' in this.video_) {
      this.eventManager_.listen(this.video_,
          'webkitcurrentplaybacktargetiswirelesschanged',
          () => this.closeOpenSessions_());
    }

    this.manifestInitData_ = this.currentDrmInfo_ ?
      (this.currentDrmInfo_.initData.find(
          (initDataOverride) => initDataOverride.initData.length > 0,
      ) || null) : null;

    const keySystem = this.currentDrmInfo_.keySystem;
    const needWaitForEncryptedEvent = shaka.device.DeviceFactory.getDevice()
        .needWaitForEncryptedEvent(keySystem);
    /**
     * We can attach media keys before the playback actually begins when:
     *  - If we are not using FairPlay Modern EME
     *  - Some initData already has been generated (through the manifest)
     *  - In case of an offline session
     */
    if (!needWaitForEncryptedEvent &&
        (this.manifestInitData_ || this.storedPersistentSessions_.size ||
        this.config_.parseInbandPsshEnabled)) {
      await this.attachMediaKeys_();
    } else {
      this.eventManager_.listen(
          this.video_, 'encrypted', (e) => this.onEncryptedEvent_(e));
    }

    this.createOrLoad().catch(() => {
      // Silence errors
      // createOrLoad will run async, errors are triggered through onError_
    });
  }

  /**
   * Returns true if the manifest has init data.
   *
   * @return {boolean}
   */
  hasManifestInitData() {
    return !!this.manifestInitData_;
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
            request, {isPreload: this.isPreload_()});
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
      this.hasInitData_ = false;
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

    // If there were no sessions to load, we need to resolve the promise right
    // now or else it will never get resolved.
    // We determine this by checking areAllSessionsLoaded_, rather than checking
    // the number of initDatas, since the newInitData method can reject init
    // datas in some circumstances.
    if (this.areAllSessionsLoaded_()) {
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

    if (this.config_.ignoreDuplicateInitData) {
      const metadatas = this.activeSessions_.values();
      for (const metadata of metadatas) {
        if (shaka.util.BufferUtils.equal(initData, metadata.initData)) {
          shaka.log.debug('Ignoring duplicate init data.');
          return;
        }
      }
      let duplicate = false;
      this.storedPersistentSessions_.forEach((metadata, sessionId) => {
        if (!duplicate &&
            shaka.util.BufferUtils.equal(initData, metadata.initData)) {
          duplicate = true;
        }
      });
      if (duplicate) {
        shaka.log.debug('Ignoring duplicate init data.');
        return;
      }
    }

    // Mark that there is init data, so that the preloader will know to wait
    // for sessions to be loaded.
    this.hasInitData_ = true;

    // If there are pre-existing sessions that have all been loaded
    // then reset the allSessionsLoaded_ promise, which can now be
    // used to wait for new sessions to be loaded
    if (this.activeSessions_.size > 0 && this.areAllSessionsLoaded_()) {
      this.allSessionsLoaded_.resolve();
      this.hasInitData_ = false;
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
   * Returns the ID of the sessions currently active.
   *
   * @return {!Array<string>}
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
   * @return {!Array<shaka.extern.DrmSessionMetadata>}
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
   * @return {!Object<string, string>}
   */
  getKeyStatuses() {
    return shaka.util.MapUtils.asObject(this.announcedKeyStatusByKeyId_);
  }

  /**
   * @param {!Array<shaka.extern.Variant>} variants
   * @return {!Promise} Resolved if/when a key system has been chosen.
   * @private
   */
  async queryMediaKeys_(variants) {
    const drmInfosByKeySystem = new Map();

    const mediaKeySystemAccess =
        this.getKeySystemAccessFromVariants_(variants, drmInfosByKeySystem);

    if (!mediaKeySystemAccess) {
      if (!navigator.requestMediaKeySystemAccess) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.MISSING_EME_SUPPORT);
      }
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE);
    }
    this.destroyer_.ensureNotDestroyed();

    try {
      // Store the capabilities of the key system.
      const realConfig = mediaKeySystemAccess.getConfiguration();

      shaka.log.v2(
          'Got MediaKeySystemAccess with configuration',
          realConfig);

      const keySystem =
          this.config_.keySystemsMapping[mediaKeySystemAccess.keySystem] ||
          mediaKeySystemAccess.keySystem;

      this.currentDrmInfo_ = this.createDrmInfoByInfos_(
          keySystem, drmInfosByKeySystem.get(keySystem));
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

      this.expirationTimer_.tickEvery(
          /* seconds= */ this.config_.updateExpirationTime);

      await this.setServerCertificate();
      this.destroyer_.ensureNotDestroyed();
    } catch (exception) {
      this.destroyer_.ensureNotDestroyed(exception);

      // Don't rewrap a shaka.util.Error from earlier in the chain:
      this.currentDrmInfo_ = null;
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
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {!Map<string, !Array<shaka.extern.DrmInfo>>} drmInfosByKeySystem
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
    let preferredKeySystems = this.config_.preferredKeySystems;
    if (!preferredKeySystems.length) {
      // If there is no preference set and we only have one license server, we
      // use this as preference. This is used to override manifests on those
      // that have the embedded license and the browser supports multiple DRMs.
      const servers = shaka.util.MapUtils.asMap(this.config_.servers);
      if (servers.size == 1) {
        preferredKeySystems = Array.from(servers.keys());
      }
    }
    for (const preferredKeySystem of preferredKeySystems) {
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
          const originalKeySystem = decodingInfo.keySystemAccess.keySystem;
          if (preferredKeySystems.includes(originalKeySystem)) {
            continue;
          }
          let drmInfos = drmInfosByKeySystem.get(originalKeySystem);
          if (!drmInfos && this.config_.keySystemsMapping[originalKeySystem]) {
            drmInfos = drmInfosByKeySystem.get(
                this.config_.keySystemsMapping[originalKeySystem]);
          }
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
   * @param {!shaka.drm.DrmEngine.SessionMetaData} metadata
   * @private
   */
  setLoadSessionTimeoutTimer_(metadata) {
    const timer = new shaka.util.Timer(() => {
      metadata.loaded = true;
      this.checkSessionsLoaded_();
    });

    timer.tickAfter(
        /* seconds= */ shaka.drm.DrmEngine.SESSION_LOAD_TIMEOUT_);
  }

  /**
   * @param {string} sessionId
   * @param {{initData: ?Uint8Array, initDataType: ?string}} sessionMetadata
   * @return {!Promise<MediaKeySession>}
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

  /** @return {!Promise} */
  async waitForActiveRequests() {
    if (this.hasInitData_) {
      await this.allSessionsLoaded_;
      await Promise.all(this.activeRequests_.map((req) => req.promise));
    }
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
    if (advancedConfig && advancedConfig.headers) {
      // Add these to the existing headers.  Do not clobber them!
      // For PlayReady, there will already be headers in the request.
      for (const header in advancedConfig.headers) {
        request.headers[header] = advancedConfig.headers[header];
      }
    }
    // NOTE: allowCrossSiteCredentials can be set in a request filter.

    if (shaka.drm.DrmUtils.isClearKeySystem(
        this.currentDrmInfo_.keySystem)) {
      this.fixClearKeyRequest_(request, this.currentDrmInfo_);
    }

    if (shaka.drm.DrmUtils.isPlayReadyKeySystem(
        this.currentDrmInfo_.keySystem)) {
      this.unpackPlayReadyRequest_(request);
    }

    const startTimeRequest = Date.now();

    let response;
    try {
      const req = this.playerInterface_.netEngine.request(
          requestType, request, {isPreload: this.isPreload_()});
      this.activeRequests_.push(req);
      response = await req.promise;
      shaka.util.ArrayUtils.remove(this.activeRequests_, req);
    } catch (error) {
      if (this.destroyer_.destroyed()) {
        return;
      }
      // Request failed!
      goog.asserts.assert(error instanceof shaka.util.Error,
          'Wrong NetworkingEngine error type!');
      /** @type {shaka.extern.DrmSessionMetadata} */
      const drmSessionMetadata = {
        sessionId: session.sessionId,
        sessionType: metadata.type,
        initData: metadata.initData,
        initDataType: metadata.initDataType,
      };
      const shakaErr = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.LICENSE_REQUEST_FAILED,
          error, drmSessionMetadata);
      if (this.activeSessions_.size == 1) {
        this.onError_(shakaErr);
        if (metadata && metadata.updatePromise) {
          metadata.updatePromise.reject(shakaErr);
        }
      } else {
        if (metadata && metadata.updatePromise) {
          metadata.updatePromise.reject(shakaErr);
        }
        this.activeSessions_.delete(session);
        if (this.areAllSessionsLoaded_()) {
          this.allSessionsLoaded_.resolve();
          this.keyStatusTimer_.tickAfter(/* seconds= */ 0.1);
        }
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
      const errorMessage = (error && error.message) || String(error);
      const shakaErr = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED,
          errorMessage);
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
    const TXml = shaka.util.TXml;

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
    const dom = TXml.parseXmlString(xml, 'PlayReadyKeyMessage');
    goog.asserts.assert(dom, 'Failed to parse PlayReady XML!');

    // Set request headers.
    const headers = TXml.getElementsByTagName(dom, 'HttpHeader');
    for (const header of headers) {
      const name = TXml.getElementsByTagName(header, 'name')[0];
      const value = TXml.getElementsByTagName(header, 'value')[0];
      goog.asserts.assert(name && value, 'Malformed PlayReady headers!');
      request.headers[
          /** @type {string} */(shaka.util.TXml.getTextContents(name))] =
        /** @type {string} */(shaka.util.TXml.getTextContents(value));
    }

    // Unpack the base64-encoded challenge.
    const challenge = TXml.getElementsByTagName(dom, 'Challenge')[0];
    goog.asserts.assert(challenge,
        'Malformed PlayReady challenge!');
    goog.asserts.assert(challenge.attributes['encoding'] == 'base64encoded',
        'Unexpected PlayReady challenge encoding!');
    request.body = shaka.util.Uint8ArrayUtils.fromBase64(
        /** @type {string} */(shaka.util.TXml.getTextContents(challenge)));
  }

  /**
   * Some old ClearKey CDMs don't include the type in the body request.
   *
   * @param {shaka.extern.Request} request
   * @param {shaka.extern.DrmInfo} drmInfo
   * @private
   */
  fixClearKeyRequest_(request, drmInfo) {
    try {
      const body = shaka.util.StringUtils.fromBytesAutoDetect(request.body);
      if (body) {
        const licenseBody =
          /** @type {shaka.drm.DrmEngine.ClearKeyLicenceRequestFormat} */ (
            JSON.parse(body));
        if (!licenseBody.type) {
          licenseBody.type = drmInfo.sessionType;
          request.body =
              shaka.util.StringUtils.toUTF8(JSON.stringify(licenseBody));
        }
      }
    } catch (e) {
      shaka.log.info('Error unpacking ClearKey license', e);
    }
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
      const device = shaka.device.DeviceFactory.getDevice();
      if (shaka.drm.DrmUtils.isPlayReadyKeySystem(
          this.currentDrmInfo_.keySystem) &&
          keyId.byteLength == 16 &&
          device.returnLittleEndianUsingPlayReady()) {
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
        this.closeSession_(session);
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
        /* seconds= */ shaka.drm.DrmEngine.KEY_STATUS_BATCH_TIME);
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
   * Returns a Promise to a map of EME support for well-known key systems.
   *
   * @return {!Promise<!Object<string, ?shaka.extern.DrmSupportType>>}
   */
  static async probeSupport() {
    const testKeySystems = [
      'org.w3.clearkey',
      'com.widevine.alpha',
      'com.widevine.alpha.experiment', // Widevine L1 in Windows
      'com.microsoft.playready',
      'com.microsoft.playready.hardware',
      'com.microsoft.playready.recommendation',
      'com.microsoft.playready.recommendation.3000',
      'com.microsoft.playready.recommendation.3000.clearlead',
      'com.chromecast.playready',
      'com.apple.fps.1_0',
      'com.apple.fps',
      'com.huawei.wiseplay',
    ];

    if (!shaka.drm.DrmUtils.isBrowserSupported()) {
      const result = {};
      for (const keySystem of testKeySystems) {
        result[keySystem] = null;
      }
      return result;
    }

    const hdcpVersions = [
      '1.0',
      '1.1',
      '1.2',
      '1.3',
      '1.4',
      '2.0',
      '2.1',
      '2.2',
      '2.3',
    ];

    const widevineRobustness = [
      'SW_SECURE_CRYPTO',
      'SW_SECURE_DECODE',
      'HW_SECURE_CRYPTO',
      'HW_SECURE_DECODE',
      'HW_SECURE_ALL',
    ];

    const playreadyRobustness = [
      '150',
      '2000',
      '3000',
    ];

    const testRobustness = {
      'com.widevine.alpha': widevineRobustness,
      'com.widevine.alpha.experiment': widevineRobustness,
      'com.microsoft.playready.recommendation': playreadyRobustness,
    };

    const basicVideoCapabilities = [
      {contentType: 'video/mp4; codecs="avc1.42E01E"'},
      {contentType: 'video/webm; codecs="vp8"'},
    ];

    const basicAudioCapabilities = [
      {contentType: 'audio/mp4; codecs="mp4a.40.2"'},
      {contentType: 'audio/webm; codecs="opus"'},
    ];

    const basicConfigTemplate = {
      videoCapabilities: basicVideoCapabilities,
      audioCapabilities: basicAudioCapabilities,
      initDataTypes: ['cenc', 'sinf', 'skd', 'keyids'],
    };

    const testEncryptionSchemes = [
      null,
      'cenc',
      'cbcs',
    ];

    /** @type {!Map<string, ?shaka.extern.DrmSupportType>} */
    const support = new Map();

    const device = shaka.device.DeviceFactory.getDevice();

    /**
     * @param {string} keySystem
     * @param {MediaKeySystemAccess} access
     * @return {!Promise}
     */
    const processMediaKeySystemAccess = async (keySystem, access) => {
      let mediaKeys;
      try {
        // Workaround: Our automated test lab runs Windows browsers under a
        // headless service.  In this environment, Firefox's CDMs seem to crash
        // when we create the CDM here.
        if (!device.createMediaKeysWhenCheckingSupport()) {
          // Reject this, since it crashes our tests.
          throw new Error('Suppressing Firefox Windows DRM in testing!');
        } else {
          // Otherwise, create the CDM.
          mediaKeys = await access.createMediaKeys();
        }
      } catch (error) {
        // In some cases, we can get a successful access object but fail to
        // create a MediaKeys instance.  When this happens, don't update the
        // support structure.  If a previous test succeeded, we won't overwrite
        // any of the results.
        return;
      }

      // If sessionTypes is missing, assume no support for persistent-license.
      const sessionTypes = access.getConfiguration().sessionTypes;
      let persistentState = sessionTypes ?
          sessionTypes.includes('persistent-license') : false;

      // Tizen 3.0 doesn't support persistent licenses, but reports that it
      // does.  It doesn't fail until you call update() with a license
      // response, which is way too late.
      // This is a work-around for #894.
      if (device.misreportsSupportForPersistentLicenses()) {
        persistentState = false;
      }

      const videoCapabilities = access.getConfiguration().videoCapabilities;
      const audioCapabilities = access.getConfiguration().audioCapabilities;

      let supportValue = {
        persistentState,
        encryptionSchemes: [],
        videoRobustnessLevels: [],
        audioRobustnessLevels: [],
        minHdcpVersions: [],
      };
      if (support.has(keySystem) && support.get(keySystem)) {
        // Update the existing non-null value.
        supportValue = support.get(keySystem);
      } else {
        // Set a new one.
        support.set(keySystem, supportValue);
      }

      // If the returned config doesn't mention encryptionScheme, the field
      // is not supported.  If installed, our polyfills should make sure this
      // doesn't happen.
      const returnedScheme = videoCapabilities[0].encryptionScheme;
      if (returnedScheme &&
          !supportValue.encryptionSchemes.includes(returnedScheme)) {
        supportValue.encryptionSchemes.push(returnedScheme);
      }

      const videoRobustness = videoCapabilities[0].robustness;
      if (videoRobustness &&
          !supportValue.videoRobustnessLevels.includes(videoRobustness)) {
        supportValue.videoRobustnessLevels.push(videoRobustness);
      }

      const audioRobustness = audioCapabilities[0].robustness;
      if (audioRobustness &&
          !supportValue.audioRobustnessLevels.includes(audioRobustness)) {
        supportValue.audioRobustnessLevels.push(audioRobustness);
      }

      if ('getStatusForPolicy' in mediaKeys) {
        const promises = [];
        for (const hdcpVersion of hdcpVersions) {
          if (supportValue.minHdcpVersions.includes(hdcpVersion)) {
            continue;
          }
          promises.push(mediaKeys.getStatusForPolicy({
            minHdcpVersion: hdcpVersion,
          }).then((status) => {
            if (status == 'usable' &&
                !supportValue.minHdcpVersions.includes(hdcpVersion)) {
              supportValue.minHdcpVersions.push(hdcpVersion);
            }
          }));
        }
        await Promise.all(promises);
      }
    };

    const testSystemEme = async (keySystem, encryptionScheme,
        videoRobustness, audioRobustness) => {
      try {
        const basicConfig =
            shaka.util.ObjectUtils.cloneObject(basicConfigTemplate);
        for (const cap of basicConfig.videoCapabilities) {
          cap.encryptionScheme = encryptionScheme;
          cap.robustness = videoRobustness;
        }
        for (const cap of basicConfig.audioCapabilities) {
          cap.encryptionScheme = encryptionScheme;
          cap.robustness = audioRobustness;
        }

        const offlineConfig = shaka.util.ObjectUtils.cloneObject(basicConfig);
        offlineConfig.persistentState = 'required';
        offlineConfig.sessionTypes = ['persistent-license'];

        const configs = [offlineConfig, basicConfig];
        // On some (Android) WebView environments,
        // requestMediaKeySystemAccess will
        // not resolve or reject, at least if RESOURCE_PROTECTED_MEDIA_ID
        // is not set.  This is a workaround for that issue.
        const TIMEOUT_FOR_CHECK_ACCESS_IN_SECONDS = 5;
        let access;
        const device = shaka.device.DeviceFactory.getDevice();
        if (device.getDeviceType() == shaka.device.IDevice.DeviceType.MOBILE) {
          access =
            await shaka.util.Functional.promiseWithTimeout(
                TIMEOUT_FOR_CHECK_ACCESS_IN_SECONDS,
                navigator.requestMediaKeySystemAccess(keySystem, configs),
            );
        } else {
          access =
              await navigator.requestMediaKeySystemAccess(keySystem, configs);
        }
        await processMediaKeySystemAccess(keySystem, access);
      } catch (error) {}  // Ignore errors.
    };

    const testSystemMcap = async (keySystem, encryptionScheme,
        videoRobustness, audioRobustness) => {
      try {
        const decodingConfig = {
          type: 'media-source',
          video: {
            contentType: basicVideoCapabilities[0].contentType,
            width: 640,
            height: 480,
            bitrate: 1,
            framerate: 1,
          },
          audio: {
            contentType: basicAudioCapabilities[0].contentType,
            channels: 2,
            bitrate: 1,
            samplerate: 1,
          },
          keySystemConfiguration: {
            keySystem,
            video: {
              encryptionScheme,
              robustness: videoRobustness,
            },
            audio: {
              encryptionScheme,
              robustness: audioRobustness,
            },
          },
        };
        // On some (Android) WebView environments, decodingInfo will
        // not resolve or reject, at least if RESOURCE_PROTECTED_MEDIA_ID
        // is not set.  This is a workaround for that issue.
        const TIMEOUT_FOR_DECODING_INFO_IN_SECONDS = 5;
        let decodingInfo;
        const device = shaka.device.DeviceFactory.getDevice();
        if (device.getDeviceType() == shaka.device.IDevice.DeviceType.MOBILE) {
          decodingInfo =
            await shaka.util.Functional.promiseWithTimeout(
                TIMEOUT_FOR_DECODING_INFO_IN_SECONDS,
                navigator.mediaCapabilities.decodingInfo(decodingConfig),
            );
        } else {
          decodingInfo =
              await navigator.mediaCapabilities.decodingInfo(decodingConfig);
        }

        const access = decodingInfo.keySystemAccess;
        await processMediaKeySystemAccess(keySystem, access);
      } catch (error) {
        // Ignore errors.
        shaka.log.v2('Failed to probe support for', keySystem, error);
      }
    };

    // Initialize the support structure for each key system.
    for (const keySystem of testKeySystems) {
      support.set(keySystem, null);
    }

    const checkKeySystem = (keySystem) => {
      // Our Polyfill will reject anything apart com.apple.fps key systems.
      // It seems the Safari modern EME API will allow to request a
      // MediaKeySystemAccess for the ClearKey CDM, create and update a key
      // session but playback will never start
      // Safari bug: https://bugs.webkit.org/show_bug.cgi?id=231006
      const device = shaka.device.DeviceFactory.getDevice();
      if (device.getBrowserEngine() ===
          shaka.device.IDevice.BrowserEngine.WEBKIT &&
          shaka.drm.DrmUtils.isClearKeySystem(keySystem)) {
        return false;
      }
      return true;
    };

    // Test each key system and encryption scheme.
    const tests = [];
    for (const encryptionScheme of testEncryptionSchemes) {
      for (const keySystem of testKeySystems) {
        if (!checkKeySystem(keySystem)) {
          continue;
        }
        tests.push(testSystemEme(keySystem, encryptionScheme, '', ''));
        tests.push(testSystemMcap(keySystem, encryptionScheme, '', ''));
      }
    }

    for (const keySystem of testKeySystems) {
      for (const robustness of (testRobustness[keySystem] || [])) {
        if (!checkKeySystem(keySystem)) {
          continue;
        }
        tests.push(testSystemEme(keySystem, null, robustness, ''));
        tests.push(testSystemEme(keySystem, null, '', robustness));
        tests.push(testSystemMcap(keySystem, null, robustness, ''));
        tests.push(testSystemMcap(keySystem, null, '', robustness));
      }
    }

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
    try {
      await shaka.util.Functional.promiseWithTimeout(
          shaka.drm.DrmEngine.CLOSE_TIMEOUT_,
          Promise.all([session.close().catch(() => {}), session.closed]));
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
   * Concat the audio and video drmInfos in a variant.
   * @param {shaka.extern.Variant} variant
   * @return {!Array<!shaka.extern.DrmInfo>}
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
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {!Map<string, string>} keySystems
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
   * @param {!Array<shaka.extern.DrmInfo>} drmInfos
   * @return {shaka.extern.DrmInfo}
   *
   * @private
   */
  createDrmInfoByInfos_(keySystem, drmInfos) {
    /** @type {!Array<string>} */
    const encryptionSchemes = [];

    /** @type {!Array<string>} */
    const licenseServers = [];

    /** @type {!Array<string>} */
    const serverCertificateUris = [];

    /** @type {!Array<!Uint8Array>} */
    const serverCerts = [];

    /** @type {!Array<!shaka.extern.InitDataOverride>} */
    const initDatas = [];

    /** @type {!Set<string>} */
    const keyIds = new Set();

    /** @type {!Set<string>} */
    const keySystemUris = new Set();

    shaka.drm.DrmEngine.processDrmInfos_(
        drmInfos, encryptionSchemes, licenseServers, serverCerts,
        serverCertificateUris, initDatas, keyIds, keySystemUris);

    if (encryptionSchemes.length > 1) {
      shaka.log.warning('Multiple unique encryption schemes found! ' +
                        'Only the first will be used.');
    }

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
      encryptionScheme: encryptionSchemes[0],
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

    if (keySystemUris.size > 0) {
      res.keySystemUris = keySystemUris;
    }

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
   * Extract license server, server cert, and init data from |drmInfos|, taking
   * care to eliminate duplicates.
   *
   * @param {!Array<shaka.extern.DrmInfo>} drmInfos
   * @param {!Array<string>} encryptionSchemes
   * @param {!Array<string>} licenseServers
   * @param {!Array<!Uint8Array>} serverCerts
   * @param {!Array<string>} serverCertificateUris
   * @param {!Array<!shaka.extern.InitDataOverride>} initDatas
   * @param {!Set<string>} keyIds
   * @param {!Set<string>} [keySystemUris]
   * @private
   */
  static processDrmInfos_(
      drmInfos, encryptionSchemes, licenseServers, serverCerts,
      serverCertificateUris, initDatas, keyIds, keySystemUris) {
    /**
     * @type {function(shaka.extern.InitDataOverride,
     *                 shaka.extern.InitDataOverride):boolean}
     */
    const initDataOverrideEqual = (a, b) => {
      if (a.keyId && a.keyId == b.keyId) {
        // Two initDatas with the same keyId are considered to be the same,
        // unless that "same keyId" is null.
        return true;
      }
      return a.initDataType == b.initDataType &&
         shaka.util.BufferUtils.equal(a.initData, b.initData);
    };

    const clearkeyDataStart = 'data:application/json;base64,';
    const clearKeyLicenseServers = [];

    for (const drmInfo of drmInfos) {
      // Build an array of unique encryption schemes.
      if (!encryptionSchemes.includes(drmInfo.encryptionScheme)) {
        encryptionSchemes.push(drmInfo.encryptionScheme);
      }

      // Build an array of unique license servers.
      if (drmInfo.keySystem == 'org.w3.clearkey' &&
          drmInfo.licenseServerUri.startsWith(clearkeyDataStart)) {
        if (!clearKeyLicenseServers.includes(drmInfo.licenseServerUri)) {
          clearKeyLicenseServers.push(drmInfo.licenseServerUri);
        }
      } else if (!licenseServers.includes(drmInfo.licenseServerUri)) {
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

      if (drmInfo.keySystemUris && keySystemUris) {
        for (const keySystemUri of drmInfo.keySystemUris) {
          keySystemUris.add(keySystemUri);
        }
      }
    }

    if (clearKeyLicenseServers.length == 1) {
      licenseServers.push(clearKeyLicenseServers[0]);
    } else if (clearKeyLicenseServers.length > 0) {
      const keys = [];
      for (const clearKeyLicenseServer of clearKeyLicenseServers) {
        const license = window.atob(
            clearKeyLicenseServer.split(clearkeyDataStart).pop());
        const jwkSet = /** @type {{keys: !Array}} */(JSON.parse(license));
        keys.push(...jwkSet.keys);
      }
      const newJwkSet = {keys: keys};
      const newLicense = JSON.stringify(newJwkSet);
      licenseServers.push(clearkeyDataStart + window.btoa(newLicense));
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
   * @param {!Map<string, string>} servers
   * @param {!Map<string,
   *               shaka.extern.AdvancedDrmConfiguration>} advancedConfigs
   * @param {!Object<string, string>} keySystemsMapping
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
    // 2. Application-configured servers, if present, override
    //    anything from the manifest.
    // 3. Manifest-provided license servers are only used if nothing else is
    //    specified.
    // This is important because it allows the application a clear way to
    // indicate which DRM systems should be ignored on platforms with multiple
    // DRM systems.
    // Alternatively, use config.preferredKeySystems to specify the preferred
    // key system.

    if (originalKeySystem == 'org.w3.clearkey' && drmInfo.licenseServerUri) {
      // Preference 1: Clear Key with pre-configured keys will have a data URI
      // assigned as its license server.  Don't change anything.
      return;
    } else if (servers.size && servers.get(originalKeySystem)) {
      // Preference 2: If a license server for this keySystem is configured at
      // the application level, override whatever was in the manifest.
      const server = servers.get(originalKeySystem);

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

      // robustness will be filled in with defaults, if needed, in
      // expandRobustness

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

  /**
   * Create a DrmInfo using configured clear keys and assign it to each variant.
   * Only modify variants if clear keys have been set.
   * @see https://bit.ly/2K8gOnv for the spec on the clearkey license format.
   *
   * @param {!Object<string, string>} configClearKeys
   * @param {!Array<shaka.extern.Variant>} variants
   */
  static configureClearKey(configClearKeys, variants) {
    const clearKeys = shaka.util.MapUtils.asMap(configClearKeys);
    if (clearKeys.size == 0) {
      return;
    }
    const clearKeyDrmInfo =
        shaka.util.ManifestParserUtils.createDrmInfoFromClearKeys(clearKeys);
    for (const variant of variants) {
      if (variant.video) {
        variant.video.drmInfos = [clearKeyDrmInfo];
      }
      if (variant.audio) {
        variant.audio.drmInfos = [clearKeyDrmInfo];
      }
    }
  }
};


/**
 * @typedef {{
 *   loaded: boolean,
 *   initData: Uint8Array,
 *   initDataType: ?string,
 *   oldExpiration: number,
 *   type: string,
 *   updatePromise: shaka.util.PublicPromise,
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
shaka.drm.DrmEngine.SessionMetaData;


/**
 * @typedef {{
 *   netEngine: !shaka.net.NetworkingEngine,
 *   onError: function(!shaka.util.Error),
 *   onKeyStatus: function(!Object<string,string>),
 *   onExpirationUpdated: function(string,number),
 *   onEvent: function(!Event),
 * }}
 *
 * @property {shaka.net.NetworkingEngine} netEngine
 *   The NetworkingEngine instance to use.  The caller retains ownership.
 * @property {function(!shaka.util.Error)} onError
 *   Called when an error occurs.  If the error is recoverable (see
 *   {@link shaka.util.Error}) then the caller may invoke either
 *   StreamingEngine.switch*() or StreamingEngine.seeked() to attempt recovery.
 * @property {function(!Object<string,string>)} onKeyStatus
 *   Called when key status changes.  The argument is a map of hex key IDs to
 *   statuses.
 * @property {function(string,number)} onExpirationUpdated
 *   Called when the session expiration value changes.
 * @property {function(!Event)} onEvent
 *   Called when an event occurs that should be sent to the app.
 */
shaka.drm.DrmEngine.PlayerInterface;

/**
 * @typedef {{
 *   kids: !Array<string>,
 *   type: string,
 * }}
 *
 * @property {!Array<string>} kids
 *   An array of key IDs. Each element of the array is the base64url encoding of
 *   the octet sequence containing the key ID value.
 * @property {string} type
 *   The requested MediaKeySessionType.
 * @see https://www.w3.org/TR/encrypted-media/#clear-key-request-format
 */
shaka.drm.DrmEngine.ClearKeyLicenceRequestFormat;

/**
 * The amount of time, in seconds, we wait to consider a session closed.
 * This allows us to work around Chrome bug https://crbug.com/1108158.
 * @private {number}
 */
shaka.drm.DrmEngine.CLOSE_TIMEOUT_ = 1;


/**
 * The amount of time, in seconds, we wait to consider session loaded even if no
 * key status information is available.  This allows us to support browsers/CDMs
 * without key statuses.
 * @private {number}
 */
shaka.drm.DrmEngine.SESSION_LOAD_TIMEOUT_ = 5;


/**
 * The amount of time, in seconds, we wait to batch up rapid key status changes.
 * This allows us to avoid multiple expiration events in most cases.
 * @type {number}
 */
shaka.drm.DrmEngine.KEY_STATUS_BATCH_TIME = 0.5;
