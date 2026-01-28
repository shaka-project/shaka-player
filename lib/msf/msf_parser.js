/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.msf.MSFParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.msf.MSFTransport');
goog.require('shaka.msf.Utils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');
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

    /** @private {!shaka.util.PublicPromise} */
    this.catalogPromise_ = new shaka.util.PublicPromise();

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
  }

  /**
   * @override
   * @exportInterface
   */
  async start(uri, playerInterface) {
    goog.asserts.assert(this.config_, 'Must call configure() before start()!');
    this.playerInterface_ = playerInterface;

    this.msfTransport_ = new shaka.msf.MSFTransport();

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
      this.connection_ = await this.msfTransport_.connect(uri, fingerprint);
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
      // Subscribe to the catalog in this namespace
      this.subscribeToCatalog_(this.config_.msf.namespaces);
    } else {
      // Listen for announcements
      // Catalog subscription will happen after announcement is received
      this.listenForAnnouncements_();
    }

    this.presentationTimeline_ = new shaka.media.PresentationTimeline(
        /* presentationStartTime= */ 0, /* delay= */ 0);
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
          /* seconds= */ 10, this.catalogPromise_);
    } catch (e) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.CATALOG_TIMEOUT);
    }

    await this.processCatalog_(catalog);

    if (!this.presentationTimeline_.isLive()) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSF_VOD_CONTENT_NOT_SUPPORTED);
    }

    this.createVariants_();

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
        await new Promise((resolve) => {
          new shaka.util.Timer(resolve).tickAfter(1);
        });
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
            shaka.log.debug(`Received publish namespace callback with namespace:
                ${namespace.join('/')}`);

            const namespaceStr = namespace.join('/');
            const isAlreadyProcessed = this.publishNamespaces_.some((ns) =>
              ns.join('/') === namespaceStr);
            if (isAlreadyProcessed) {
              shaka.log.debug(`Already processed namespace: ${namespaceStr}`);
              return;
            }

            // Store the namespace
            this.publishNamespaces_.push(namespace);

            // Subscribe to the catalog in this namespace
            this.subscribeToCatalog_(namespace);
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
          namespaceStr, 'catalog', (obj) => {
            try {
              const text = shaka.util.StringUtils.fromUTF8(obj['data']);
              const catalog = /** @type {shaka.msf.Utils.MSFCatalog} */(
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
      shaka.log.error(`Error subscribing to catalog:
          ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * @param {shaka.msf.Utils.MSFTrack} track
   * @param {string} trackKey
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @return {!Promise}
   */
  async subscribeToTrack(track, trackKey, callback) {
    try {
      const namespace = track.namespace || '';
      const trackName = track.name;

      shaka.log.debug(`Subscribing to track: ${trackKey}`);

      const trackAlias = await this.msfTransport_.subscribeTrack(
          namespace, trackName, (obj) => {
            shaka.log.debug(
                `Received object for track ${trackKey} with ${obj}`);
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
   * @param {shaka.msf.Utils.MSFCatalog} catalog
   * @return {!Promise}
   * @private
   */
  processCatalog_(catalog) {
    shaka.log.debug('MSF Catalog:', catalog);
    const promises = [];
    let isLive = true;
    let duration = Infinity;
    for (const track of catalog.tracks) {
      if ('isLive' in track) {
        isLive = track.isLive;
      }
      if (track.trackDuration) {
        duration = Math.min(duration, track.trackDuration);
      }
      promises.push(this.processTrack_(track));
    }
    if (isLive) {
      this.presentationTimeline_.setStatic(false);
    }
    this.presentationTimeline_.setDuration(duration);
    return Promise.all(promises);
  }

  /**
   * @param {shaka.msf.Utils.MSFTrack} track
   * @private
   */
  processTrack_(track) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    let initData = new Uint8Array([]);
    if (track.initData) {
      initData = shaka.util.Uint8ArrayUtils.fromBase64(track.initData);
    }

    let mimeType = track.mimeType || '';

    const validMp4MimeType = [
      'audio/mp4',
      'video/mp4',
      'video/iso.segment',
      'application/mp4',
    ];

    /** @type {?shaka.media.SegmentUtils.BasicInfo} */
    let basicInfo = null;
    if (validMp4MimeType.includes(mimeType)) {
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

    mimeType = basicInfo.mimeType;
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
      drmInfos: basicInfo.drmInfos,
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
      /** @type {?shaka.util.PublicPromise} */
      let promise = new shaka.util.PublicPromise();
      this.subscribeToTrack(track, trackKey, (obj) => {
        if (!stream.segmentIndex) {
          return;
        }
        const SegmentUtils = shaka.media.SegmentUtils;

        goog.asserts.assert(typeof timescale == 'number',
            'Timescale should be a number!');
        const {startTime, duration} =
            SegmentUtils.getStartTimeAndDurationFromMp4(obj.data, timescale);

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

        stream.segmentIndex.mergeAndEvict(
            [reference],
            this.presentationTimeline_.getSegmentAvailabilityStart());

        this.presentationTimeline_.notifySegments([reference]);
        if (!this.presentationTimeline_.isStartTimeLocked()) {
          this.presentationTimeline_.lockStartTime();
          this.presentationTimeline_.setSegmentAvailabilityDuration(
              Math.max(0.5, duration));
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

        promise?.resolve();
        promise = null;
      });
      stream.segmentIndex = new shaka.media.SegmentIndex([]);
      // goog.asserts.assert(promise != null, 'promise must not be null!');
      return /** @type {!Promise} */(promise);
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
