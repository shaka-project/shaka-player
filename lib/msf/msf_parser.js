/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.msf.MSFParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.drm.PlayReady');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.msf.MSFTransport');
goog.require('shaka.msf.MSFPresentationTimeline');
goog.require('shaka.msf.Utils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * MOQT Streaming Format.
 *
 * @see https://datatracker.ietf.org/doc/draft-ietf-moq-transport/
 * @see https://datatracker.ietf.org/doc/draft-ietf-moq-msf/
 * @see https://datatracker.ietf.org/doc/draft-ietf-moq-cmsf/
 *
 * @implements {shaka.extern.ManifestParser}
 * @export
 */
shaka.msf.MSFParser = class {
  constructor() {
    /** @private {?shaka.extern.ManifestParser.PlayerInterface} */
    this.playerInterface_ = null;

    /** @private {?shaka.extern.ManifestConfiguration} */
    this.config_ = null;

    /** @private {function():boolean} */
    this.isPreloadFn_ = () => false;

    /** @private {?shaka.extern.Manifest} */
    this.manifest_ = null;

    /** @private {?shaka.msf.MSFTransport} */
    this.msfTransport_ = null;

    /** @private {?shaka.msf.MSFConnection } */
    this.connection_ = null;

    /** @private {!Array<Array<string>>} */
    this.publishNamespaces_ = [];

    /** @private {?function()} */
    this.unregisterPublishNamespaceCallback_ = null;

    /** @private {?function()} */
    this.unregisterCatalogCallback_ = null;

    /** @private {!Promise.PromiseWithResolvers} */
    this.catalogPromise_ = Promise.withResolvers();

    /** @private {number} */
    this.globalId_ = 1;

    /** @private {?shaka.media.PresentationTimeline} */
    this.presentationTimeline_ = null;

    /** @private {!Array<!shaka.extern.Variant>} */
    this.variants_ = [];

    /** @private {!Array<!shaka.extern.Stream>} */
    this.audioStreams_ = [];

    /** @private {!Array<!shaka.extern.Stream>} */
    this.videoStreams_ = [];

    /** @private {!Array<!shaka.extern.Stream>} */
    this.textStreams_ = [];

    /** @private {!Map<string, function()>} */
    this.unregisterTracksCallback_ = new Map();

    /** @private {boolean} */
    this.isFirstVideoSegment_ = true;

    /**
     * Tracks whether the first segment has been received for each content type.
     * Used to delay locking the presentation timeline until all expected
     * stream types have started producing data.
     * @private {!Set<shaka.util.ManifestParserUtils.ContentType>}
     */
    this.receivedFirstSegment_ = new Set();
  }

  /**
   * @param {shaka.extern.ManifestConfiguration} config
   * @param {(function():boolean)=} isPreloadFn
   * @override
   * @exportInterface
   */
  configure(config, isPreloadFn) {
    this.config_ = config;
    if (isPreloadFn) {
      this.isPreloadFn_ = isPreloadFn;
    }
    if (this.msfTransport_) {
      this.msfTransport_.configure(this.config_.msf);
    }
  }

  /**
   * @override
   * @exportInterface
   */
  async start(uri, playerInterface) {
    goog.asserts.assert(this.config_, 'Must call configure() before start()!');
    this.playerInterface_ = playerInterface;

    this.msfTransport_ = new shaka.msf.MSFTransport(this.config_.msf);

    /** @type {?Uint8Array} */
    let fingerprint = null;
    if (this.config_.msf.fingerprintUri) {
      const requestType = shaka.net.NetworkingEngine.RequestType.FINGERPRINT;
      const request = shaka.net.NetworkingEngine.makeRequest(
          [this.config_.msf.fingerprintUri], this.config_.retryParameters);
      const response = await this.playerInterface_.networkingEngine.request(
          requestType, request).promise;

      // Make sure that the parser has not been destroyed.
      if (!this.playerInterface_) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.PLAYER,
            shaka.util.Error.Code.OPERATION_ABORTED);
      }

      const hexString = shaka.util.StringUtils.fromUTF8(response.data).trim();

      const hexBytes = new Uint8Array(hexString.length / 2);
      for (let i = 0; i < hexBytes.length; i += 1) {
        hexBytes[i] = parseInt(hexString.slice(2 * i, 2 * i + 2), 16);
      }
      fingerprint = hexBytes;
    }

    try {
      this.connection_ = await this.msfTransport_.connect(
          uri, fingerprint, this.config_.msf.authorizationToken);
    } catch (error) {
      if (error instanceof shaka.util.Error) {
        throw error;
      }
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.WEBTRANSPORT_INITIALIZATION_FAILED,
          error);
    }

    if (this.config_.msf.namespaces.length) {
      // Get catalog in this namespace
      this.getCatalog_(this.config_.msf.namespaces);
    } else {
      // Listen for announcements
      // Catalog subscription will happen after announcement is received
      this.listenForAnnouncements_();
    }

    this.presentationTimeline_ = new shaka.msf.MSFPresentationTimeline();
    this.presentationTimeline_.setStatic(true);

    this.manifest_ = {
      presentationTimeline: this.presentationTimeline_,
      variants: [],
      textStreams: [],
      imageStreams: [],
      chapterStreams: [],
      offlineSessionIds: [],
      sequenceMode: false,
      ignoreManifestTimestampsInSegmentsMode: false,
      type: shaka.media.ManifestParser.MSF,
      serviceDescription: null,
      nextUrl: null,
      periodCount: 1,
      gapCount: 0,
      isLowLatency: false,
      startTime: null,
    };

    let catalog;
    try {
      catalog = await shaka.util.Functional.promiseWithTimeout(
          /* seconds= */ 10, this.catalogPromise_.promise);
    } catch (error) {
      if (error instanceof shaka.util.Error) {
        throw error;
      }
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSF_CATALOG_TIMEOUT);
    }

    await this.processCatalog_(catalog);

    if (!this.presentationTimeline_.isLive()) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSF_VOD_CONTENT_NOT_SUPPORTED);
    }

    this.createVariants_();

    this.manifest_.isLowLatency = this.presentationTimeline_.isDynamic();
    this.manifest_.variants = this.variants_;
    this.manifest_.textStreams = this.textStreams_;

    this.playerInterface_.makeTextStreamsForClosedCaptions(this.manifest_);

    return this.manifest_;
  }

  /**
   * @override
   * @exportInterface
   */
  async stop() {
    this.unregisterCatalogCallback_?.();
    this.unregisterCatalogCallback_ = null;
    this.unregisterPublishNamespaceCallback_?.();
    this.unregisterPublishNamespaceCallback_ = null;
    this.unregisterTracksCallback_.forEach((callback, key) => {
      callback();
    });
    this.unregisterTracksCallback_.clear();
    if (this.connection_) {
      // Try to close the connection if it's not already closed
      try {
        // WebTransport requires some time to close connections, so we set
        // 1 second here, but this is based on experimental testing only.
        await shaka.util.Functional.delay(/* seconds= */ 1);
        await this.connection_.close();
        this.connection_ = null;
      } catch (error) {
        // Ignore error
      }
    }
    this.msfTransport_?.release();
    this.msfTransport_ = null;
    this.playerInterface_ = null;
    this.config_ = null;
    this.manifest_ = null;
  }

  /**
   * @override
   * @exportInterface
   */
  update() {}

  /**
   * @override
   * @exportInterface
   */
  onExpirationUpdated(sessionId, expiration) {
    // No-op
  }

  /**
   * @override
   * @exportInterface
   */
  onInitialVariantChosen(variant) {
    // No-op
  }

  /**
   * @override
   * @exportInterface
   */
  banLocation(uri) {
    // No-op
  }

  /**
   * @override
   * @exportInterface
   */
  setMediaElement(mediaElement) {
    // No-op
  }

  /**
   * Listen for announcements from the server
   * @private
   */
  listenForAnnouncements_() {
    try {
      shaka.log.debug('Listening for announcements...');

      // Subscribe to announcements
      const unregister =
          this.msfTransport_.registerPublishNamespaceCallback((namespace) => {
            const namespaceStr = namespace.join('/');
            shaka.log.debug(`Received publish namespace callback with namespace:
                ${namespaceStr}`);

            const isAlreadyProcessed = this.publishNamespaces_.some((ns) =>
              ns.join('/') === namespaceStr);
            if (isAlreadyProcessed) {
              shaka.log.debug(`Already processed namespace: ${namespaceStr}`);
              return;
            }

            // Store the namespace
            this.publishNamespaces_.push(namespace);

            // Get catalog in this namespace
            this.getCatalog_(namespace);
          });

      // Save the unregister function
      this.unregisterPublishNamespaceCallback_ = unregister;

      // Log that we've registered the callback
      shaka.log.debug('Announcement listener registered successfully');
    } catch (error) {
      shaka.log.error(`Error listening for announcements:
          ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the catalog in the given namespace
   *
   * @param {Array<string>} namespace
   * @return {!Promise}
   * @private
   */
  getCatalog_(namespace) {
    if (this.config_.msf.useFetchCatalog) {
      return this.fetchCatalog_(namespace);
    }
    return this.subscribeToCatalog_(namespace);
  }

  /**
   * Fetch the catalog using FETCH (one-shot)
   *
   * @param {Array<string>} namespace
   * @return {!Promise}
   * @private
   */
  async fetchCatalog_(namespace) {
    try {
      const namespaceStr = namespace.join('/');
      shaka.log.debug(`Fetching catalog in namespace: ${namespaceStr}`);

      await this.msfTransport_.fetchTrack(
          namespace, 'catalog', (obj) => {
            try {
              const text = shaka.util.StringUtils.fromUTF8(obj['data']);
              const catalog = /** @type {msfCatalog.Catalog} */(
                JSON.parse(text));
              this.catalogPromise_.resolve(catalog);
            } catch (e) {
              shaka.log.error(`Failed to decode catalog data:
              ${e instanceof Error ? e.message : String(e)}`);
            }
          });

      shaka.log.debug(
          `Successfully fetched catalog in namespace: ${namespaceStr}`);
    } catch (error) {
      shaka.log.error('Error fetching catalog:', error);
      if (error && error.kind == shaka.msf.Utils.MessageType.FETCH_ERROR) {
        this.catalogPromise_.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.MSF_NO_CATALOG,
            error.code,
            error.reason));
      } else {
        this.catalogPromise_.reject(error);
      }
    }
  }

  /**
   * Subscribe to the catalog in the given namespace
   *
   * @param {Array<string>} namespace
   * @return {!Promise}
   * @private
   */
  async subscribeToCatalog_(namespace) {
    try {
      const namespaceStr = namespace.join('/');
      shaka.log.debug(`Subscribing to catalog in namespace: ${namespaceStr}`);

      // Subscribe to the "catalog" track in the given namespace
      const trackAlias = await this.msfTransport_.subscribeTrack(
          namespace, 'catalog', (obj) => {
            try {
              const text = shaka.util.StringUtils.fromUTF8(obj['data']);
              const catalog = /** @type {msfCatalog.Catalog} */(
                JSON.parse(text));
              this.catalogPromise_.resolve(catalog);
            } catch (e) {
              shaka.log.error(`Failed to decode catalog data:
              ${e instanceof Error ? e.message : String(e)}`);
            }
          });

      // Create an unregister function that uses the track alias
      const unregisterFunc = () => {
        // Don't try to unsubscribe if we're already disconnecting
        if (!this.playerInterface_) {
          shaka.log.debug('Skipping catalog unsubscribe during disconnect');
          return;
        }
        shaka.log.debug(`Unsubscribing from catalog track with alias
            ${trackAlias}`);
        this.msfTransport_.unsubscribeTrack(trackAlias).catch((err) => {
          shaka.log.error(`Failed to unsubscribe from catalog: ${err}`);
        });
      };

      if (this.unregisterCatalogCallback_) {
        shaka.log.debug('Unregistering previous catalog callback');
        this.unregisterCatalogCallback_();
      }
      this.unregisterCatalogCallback_ = unregisterFunc;
      shaka.log.debug(`Successfully subscribed to catalog in namespace:
          ${namespaceStr} with track alias: ${trackAlias}`);
    } catch (error) {
      shaka.log.error('Error subscribing to catalog:', error);
      if (error && error.kind == shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR) {
        this.catalogPromise_.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.MSF_NO_CATALOG,
            error.code,
            error.reason));
      } else {
        this.catalogPromise_.reject(error);
      }
    }
  }

  /**
   * @param {msfCatalog.Track} track
   * @param {string} trackKey
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @return {!Promise}
   */
  async subscribeToTrack(track, trackKey, callback) {
    try {
      // Fall back to the session namespace when the catalog track object
      // does not include an explicit namespace field (the namespace is
      // typically established at the transport level via PUBLISH_NAMESPACE).
      let namespace = [];
      if (track.namespace) {
        namespace.push(track.namespace);
      }
      if (!namespace.length) {
        if (this.config_.msf.namespaces.length) {
          namespace = this.config_.msf.namespaces;
        } else if (this.publishNamespaces_.length) {
          namespace = this.publishNamespaces_[0];
        } else {
          namespace = [];
        }
      }
      const trackName = track.name;

      shaka.log.debug(`Subscribing to track: ${trackKey}`);

      const trackAlias = await this.msfTransport_.subscribeTrack(
          namespace, trackName, (obj) => {
            shaka.log.v1(
                `Received object for track ${trackKey} with`, obj);
            callback(obj);
          });

      // Create an unregister function that uses the track alias
      const unregisterFunc = () => {
        // Don't try to unsubscribe if we're already disconnecting
        if (!this.playerInterface_) {
          shaka.log.debug('Skipping catalog unsubscribe during disconnect');
          return;
        }
        shaka.log.debug(`Unsubscribing from catalog track with alias
            ${trackAlias}`);
        this.msfTransport_.unsubscribeTrack(trackAlias).catch((err) => {
          shaka.log.error(`Failed to unsubscribe from catalog: ${err}`);
        });
      };

      // Store the subscription
      this.unregisterTracksCallback_.set(trackKey, unregisterFunc);
      shaka.log.debug(
          `Subscribed to track ${trackKey} with alias ${trackAlias}`);
    } catch (error) {
      shaka.log.debug(`Error subscribing to track:
          ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * @param {msfCatalog.Catalog} catalog
   * @return {!Promise}
   * @private
   */
  processCatalog_(catalog) {
    shaka.log.info('MSF Catalog:', catalog);
    const promises = [];
    let isLive = true;
    let duration = Infinity;
    let targetLatency = 0;
    const contentProtections = this.getContentProtections_(catalog);
    for (const track of catalog.tracks) {
      if ('isLive' in track) {
        isLive = track.isLive;
      }
      if (track.targetLatency) {
        targetLatency = Math.max(targetLatency, track.targetLatency);
      }
      if (track.trackDuration) {
        duration = Math.min(duration, track.trackDuration);
      }
      promises.push(this.processTrack_(track, contentProtections));
    }
    if (targetLatency) {
      /** @type {shaka.extern.ServiceDescription} */
      const serviceDescription = {
        maxLatency: null,
        maxPlaybackRate: null,
        minLatency: null,
        minPlaybackRate: null,
        targetLatency: targetLatency / 1000,
      };
      this.manifest_.serviceDescription = serviceDescription;
    }
    if (isLive) {
      this.presentationTimeline_.setStatic(false);
    }
    this.presentationTimeline_.setDuration(duration);
    return Promise.all(promises);
  }

  /**
   * @param {msfCatalog.Catalog} catalog
   * @return {!Map<string, !shaka.extern.DrmInfo>}
   * @private
   */
  getContentProtections_(catalog) {
    const uuidMap = shaka.drm.DrmUtils.getUuidMap();

    /** @type {!Map<string, !shaka.extern.DrmInfo>} */
    const mapContentProtections = new Map();
    const contentProtections = catalog.contentProtections || [];
    for (const contentProtection of contentProtections) {
      const refId = contentProtection.refID;
      const drmSystem = contentProtection.drmSystem;

      if (!drmSystem) {
        continue;
      }
      const keySystem = uuidMap[drmSystem.systemID.toLowerCase()];
      if (!keySystem) {
        continue;
      }
      const encryptionScheme = contentProtection.scheme || 'cenc';

      let initData = null;
      if (drmSystem.pssh) {
        initData = [{
          initDataType: 'cenc',
          initData: shaka.util.Uint8ArrayUtils.fromBase64(drmSystem.pssh),
        }];
      }

      const drmInfo = shaka.util.ManifestParserUtils.createDrmInfo(
          keySystem, encryptionScheme, initData);

      if (drmSystem.laURL?.url) {
        drmInfo.licenseServerUri = drmSystem.laURL.url;
      } else if (initData &&
          shaka.drm.DrmUtils.isPlayReadyKeySystem(keySystem)) {
        drmInfo.licenseServerUri =
            shaka.drm.PlayReady.getLicenseUrlFromPssh(initData[0].initData);
      }
      if (drmSystem.certURL?.url) {
        drmInfo.serverCertificateUri = drmSystem.certURL.url;
      }
      if (drmSystem.robustness) {
        drmInfo.videoRobustness = drmSystem.robustness;
        drmInfo.audioRobustness = drmSystem.robustness;
      }
      if (contentProtection.defaultKID) {
        for (const kid of contentProtection.defaultKID) {
          const normalizedKid = kid.replace(/-/g, '').toLowerCase();
          drmInfo.keyIds.add(normalizedKid);
        }
      }

      mapContentProtections.set(refId, drmInfo);
    }
    return mapContentProtections;
  }

  /**
   * @param {msfCatalog.Track} track
   * @param {!Map<string, !shaka.extern.DrmInfo>} contentProtections
   * @private
   */
  processTrack_(track, contentProtections) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    let initData = new Uint8Array([]);
    if (track.initData) {
      initData = shaka.util.Uint8ArrayUtils.fromBase64(track.initData);
    }

    /** @type {?shaka.media.SegmentUtils.BasicInfo} */
    let basicInfo = null;
    const validPackagings = [
      'cmaf',
      'chunk-per-object',
    ];
    if (validPackagings.includes(track.packaging)) {
      basicInfo = shaka.media.SegmentUtils.getBasicInfoFromMp4(
          initData, initData, /* disableText= */ false);
    }

    if (!basicInfo) {
      shaka.log.info('Skipping incompatible track', track);
      return;
    }

    const timescale = basicInfo.timescale || track.timescale;
    if (!timescale) {
      shaka.log.info(
          'Skipping incompatible track due missing timescale', track);
      return;
    }

    const mimeType = basicInfo.mimeType || track.mimeType || '';
    const codecs = basicInfo.codecs;
    let language = track.lang;
    if (!track.lang || track.lang == 'und') {
      language = basicInfo.language || track.lang;
    }
    const frameRate = Number(basicInfo.frameRate) || track.framerate;
    const width = Number(basicInfo.width) || track.width;
    const height = Number(basicInfo.height) || track.height;
    let channelsCount = basicInfo.channelCount;
    if (!channelsCount && track.channelConfig) {
      channelsCount = parseInt(track.channelConfig, 10);
    }
    const audioSamplingRate = basicInfo.sampleRate || track.samplerate || null;
    const closedCaptions = basicInfo.closedCaptions;
    const hdr = basicInfo.videoRange || undefined;
    const colorGamut = basicInfo.colorGamut || undefined;

    let type = ContentType.TEXT;
    for (const format of ManifestParserUtils.VIDEO_CODEC_REGEXPS) {
      if (format.test(codecs.trim())) {
        type = ContentType.VIDEO;
      }
    }
    if (type == ContentType.TEXT) {
      for (const format of ManifestParserUtils.AUDIO_CODEC_REGEXPS) {
        if (format.test(codecs.trim())) {
          type = ContentType.AUDIO;
        }
      }
    }

    let kind = undefined;
    let accessibilityPurpose = null;

    const roles = [];
    if (track.role) {
      roles.push(track.role);
      switch (track.role) {
        case 'audiodescription':
          if (type == ContentType.AUDIO) {
            accessibilityPurpose =
              shaka.media.ManifestParser.AccessibilityPurpose.VISUALLY_IMPAIRED;
          }
          break;
        case 'caption':
          if (type == ContentType.TEXT) {
            kind = ManifestParserUtils.TextStreamKind.CLOSED_CAPTION;
          }
          break;
        case 'subtitle':
          if (type == ContentType.TEXT) {
            kind = ManifestParserUtils.TextStreamKind.SUBTITLE;
          }
          break;
      }
    }

    let drmInfos = [];
    const contentProtectionRefIDs = track.contentProtectionRefIDs;
    if (contentProtectionRefIDs) {
      for (const refId of contentProtectionRefIDs) {
        const drmInfo = contentProtections.get(refId);
        if (drmInfo) {
          drmInfos.push(drmInfo);
        } else {
          shaka.log.alwaysWarn('Unrecognized contentProtectionRefID', refId);
          return;
        }
      }
    } else {
      drmInfos = basicInfo.drmInfos;
    }

    /** @type {shaka.extern.Stream} */
    const stream = {
      id: this.globalId_++,
      originalId: track.name,
      groupId: null,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex: null,
      mimeType,
      codecs,
      supplementalCodecs: '',
      kind,
      encrypted: false,
      drmInfos,
      keyIds: new Set(),
      language: shaka.util.LanguageUtils.normalize(language || 'und'),
      originalLanguage: language || null,
      label: track.label || null,
      type,
      primary: false,
      trickModeVideo: null,
      dependencyStream: null,
      emsgSchemeIdUris: null,
      frameRate,
      pixelAspectRatio: undefined,
      width,
      height,
      bandwidth: track.bitrate,
      roles,
      forced: false,
      channelsCount,
      audioSamplingRate,
      spatialAudio: false,
      closedCaptions,
      hdr,
      colorGamut,
      videoLayout: undefined,
      tilesLayout: undefined,
      accessibilityPurpose,
      external: false,
      fastSwitching: false,
      fullMimeTypes: new Set([shaka.util.MimeUtils.getFullType(
          mimeType, codecs)]),
      isAudioMuxedInVideo: false,
      baseOriginalId: null,
    };

    const trackKey = `${track.namespace || ''}/${track.name}`;

    const initSegmentReference = new shaka.media.InitSegmentReference(
        () => [],
        /* startBytes= */ 0,
        /* endBytes= */ null,
        /* mediaQuality= */ null,
        timescale,
        initData);

    stream.createSegmentIndex = () => {
      let promiseWithResolvers = Promise.withResolvers();
      this.subscribeToTrack(track, trackKey, (obj) => {
        if (!stream.segmentIndex || !obj.data.byteLength) {
          return;
        }
        const SegmentUtils = shaka.media.SegmentUtils;

        goog.asserts.assert(typeof timescale == 'number',
            'Timescale should be a number!');
        const {startTime, duration} =
            SegmentUtils.getStartTimeAndDurationFromMp4(obj.data, timescale);

        if (!duration) {
          return;
        }

        const reference = new shaka.media.SegmentReference(
            /* startTime= */ startTime,
            /* endTime= */ startTime + duration,
            /* getUris= */ () => [],
            /* startByte= */ 0,
            /* endByte= */ null,
            /* initSegmentReference= */ initSegmentReference,
            /* presentationTimeOffset= */ 0,
            /* appendWindowStart= */ 0,
            /* appendWindowEnd= */ Infinity);

        reference.setSegmentData(obj.data);

        this.receivedFirstSegment_.add(type);

        const timelineLocked = this.presentationTimeline_.isStartTimeLocked();

        if (timelineLocked) {
          const evictTime = Math.min(reference.startTime - 2,
              this.presentationTimeline_.getSegmentAvailabilityStart());
          stream.segmentIndex.mergeAndEvict([reference], evictTime);
        } else {
          stream.segmentIndex.merge([reference]);
        }

        this.presentationTimeline_.notifySegments([reference]);
        this.presentationTimeline_.notifyMaxSegmentDuration(duration);

        if (this.presentationTimeline_.isDynamic()) {
          const maxSegmentDuration =
              this.presentationTimeline_.getMaxSegmentDuration();
          if (maxSegmentDuration > 0) {
            // We want a zero seek range (no DVR):
            // availability window = one segment.
            this.presentationTimeline_.setSegmentAvailabilityDuration(
                maxSegmentDuration);
          }
        }

        if (!timelineLocked &&
            (!this.audioStreams_.length ||
            this.receivedFirstSegment_.has(ContentType.AUDIO)) &&
            (!this.videoStreams_.length ||
            this.receivedFirstSegment_.has(ContentType.VIDEO))) {
          // Only lock once we have first segments from all expected types.
          this.presentationTimeline_.lockStartTime();
        }

        if (!this.config_.disableText &&
            this.isFirstVideoSegment_ && type == ContentType.VIDEO) {
          this.isFirstVideoSegment_ = false;
          const videoInfo = shaka.media.SegmentUtils.getBasicInfoFromMp4(
              initData, obj.data, /* disableText= */ false);
          stream.closedCaptions = videoInfo.closedCaptions;
          if (this.manifest_) {
            this.playerInterface_.makeTextStreamsForClosedCaptions(
                this.manifest_);
          }
        }

        promiseWithResolvers?.resolve();
        promiseWithResolvers = null;
      });
      stream.segmentIndex = new shaka.media.SegmentIndex([]);
      return /** @type {!Promise} */(promiseWithResolvers?.promise);
    };

    stream.closeSegmentIndex = () => {
      if (this.unregisterTracksCallback_.has(trackKey)) {
        this.unregisterTracksCallback_.get(trackKey)();
        this.unregisterTracksCallback_.delete(trackKey);
      }
      // If we have a segment index, release it.
      stream.segmentIndex?.release();
      stream.segmentIndex = null;
    };

    switch (type) {
      case ContentType.AUDIO:
        if (!this.config_.disableAudio) {
          this.audioStreams_.push(stream);
        }
        break;
      case ContentType.VIDEO:
        if (!this.config_.disableVideo) {
          this.videoStreams_.push(stream);
        }
        break;
      case ContentType.TEXT:
        if (!this.config_.disableText) {
          this.textStreams_.push(stream);
        }
        break;
    }
  }

  /**
   * @private
   */
  createVariants_() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    // Create variants for all audio/video combinations.
    let nextVariantId = 0;
    const variants = [];
    if (!this.videoStreams_.length || !this.audioStreams_.length) {
      // For audio-only or video-only content, just give each stream its own
      // variant.
      const streams = this.videoStreams_.length ? this.videoStreams_ :
        this.audioStreams_;
      for (const stream of streams) {
        const id = nextVariantId++;
        let bandwidth = stream.bandwidth || 0;
        if (stream.dependencyStream) {
          bandwidth += stream.dependencyStream.bandwidth || 0;
        }
        variants.push({
          id,
          language: stream.language,
          disabledUntilTime: 0,
          primary: stream.primary,
          audio: stream.type == ContentType.AUDIO ? stream : null,
          video: stream.type == ContentType.VIDEO ? stream : null,
          bandwidth,
          drmInfos: stream.drmInfos,
          allowedByApplication: true,
          allowedByKeySystem: true,
          decodingInfos: [],
        });
      }
    } else {
      for (const audio of this.audioStreams_) {
        for (const video of this.videoStreams_) {
          const commonDrmInfos = shaka.drm.DrmUtils.getCommonDrmInfos(
              audio.drmInfos, video.drmInfos);

          if (audio.drmInfos.length && video.drmInfos.length &&
              !commonDrmInfos.length) {
            shaka.log.warning(
                'Incompatible DRM in audio & video, skipping variant creation.',
                audio, video);
            continue;
          }

          let bandwidth = (audio.bandwidth || 0) + (video.bandwidth || 0);
          if (audio.dependencyStream) {
            bandwidth += audio.dependencyStream.bandwidth || 0;
          }
          if (video.dependencyStream) {
            bandwidth += video.dependencyStream.bandwidth || 0;
          }

          const id = nextVariantId++;
          variants.push({
            id,
            language: audio.language,
            disabledUntilTime: 0,
            primary: audio.primary,
            audio,
            video,
            bandwidth,
            drmInfos: commonDrmInfos,
            allowedByApplication: true,
            allowedByKeySystem: true,
            decodingInfos: [],
          });
        }
      }
    }

    this.variants_ = variants;
  }
};


shaka.media.ManifestParser.registerParserByMime(
    'application/msf', () => new shaka.msf.MSFParser());
