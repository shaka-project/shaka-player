/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.mss.MssParser');

goog.require('goog.asserts');
goog.require('shaka.abr.Ewma');
goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.mss.ContentProtection');
goog.require('shaka.mss.MssUtils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.OperationManager');
goog.require('shaka.util.Timer');
goog.require('shaka.util.XmlUtils');
goog.require('shaka.dependencies');


/**
 * Creates a new MSS parser.
 *
 * @implements {shaka.extern.ManifestParser}
 * @export
 */
shaka.mss.MssParser = class {
  /** Creates a new MSS parser. */
  constructor() {
    /** @private {?shaka.extern.ManifestConfiguration} */
    this.config_ = null;

    /** @private {?shaka.extern.ManifestParser.PlayerInterface} */
    this.playerInterface_ = null;

    /** @private {!Array.<string>} */
    this.manifestUris_ = [];

    /** @private {?shaka.extern.Manifest} */
    this.manifest_ = null;

    /** @private {number} */
    this.globalId_ = 1;

    /**
     * The update period in seconds, or 0 for no updates.
     * @private {number}
     */
    this.updatePeriod_ = 0;

    /**
     * An ewma that tracks how long updates take.
     * This is to mitigate issues caused by slow parsing on embedded devices.
     * @private {!shaka.abr.Ewma}
     */
    this.averageUpdateDuration_ = new shaka.abr.Ewma(5);

    /** @private {shaka.util.Timer} */
    this.updateTimer_ = new shaka.util.Timer(() => {
      this.onUpdate_();
    });

    /** @private {!shaka.util.OperationManager} */
    this.operationManager_ = new shaka.util.OperationManager();

    /**
     * @private {!Map.<number, !BufferSource>}
     */
    this.initSegmentDataByStreamId_ = new Map();
  }

  /**
   * @override
   * @exportInterface
   */
  configure(config) {
    goog.asserts.assert(config.mss != null,
        'MssManifestConfiguration should not be null!');

    this.config_ = config;
  }

  /**
   * @override
   * @exportInterface
   */
  async start(uri, playerInterface) {
    goog.asserts.assert(this.config_, 'Must call configure() before start()!');
    this.manifestUris_ = [uri];
    this.playerInterface_ = playerInterface;

    await this.requestManifest_();

    // Make sure that the parser has not been destroyed.
    if (!this.playerInterface_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
    }

    this.setUpdateTimer_();

    goog.asserts.assert(this.manifest_, 'Manifest should be non-null!');
    return this.manifest_;
  }

  /**
   * Called when the update timer ticks.
   *
   * @return {!Promise}
   * @private
   */
  async onUpdate_() {
    goog.asserts.assert(this.updatePeriod_ >= 0,
        'There should be an update period');

    shaka.log.info('Updating manifest...');

    try {
      await this.requestManifest_();
    } catch (error) {
      goog.asserts.assert(error instanceof shaka.util.Error,
          'Should only receive a Shaka error');

      // Try updating again, but ensure we haven't been destroyed.
      if (this.playerInterface_) {
        // We will retry updating, so override the severity of the error.
        error.severity = shaka.util.Error.Severity.RECOVERABLE;
        this.playerInterface_.onError(error);
      }
    }

    // Detect a call to stop()
    if (!this.playerInterface_) {
      return;
    }

    this.setUpdateTimer_();
  }

  /**
   * Sets the update timer.  Does nothing if the manifest is not live.
   *
   * @private
   */
  setUpdateTimer_() {
    if (this.updatePeriod_ <= 0) {
      return;
    }

    const finalDelay = Math.max(
        shaka.mss.MssParser.MIN_UPDATE_PERIOD_,
        this.updatePeriod_,
        this.averageUpdateDuration_.getEstimate());

    // We do not run the timer as repeating because part of update is async and
    // we need schedule the update after it finished.
    this.updateTimer_.tickAfter(/* seconds= */ finalDelay);
  }

  /**
   * @override
   * @exportInterface
   */
  stop() {
    this.playerInterface_ = null;
    this.config_ = null;
    this.manifestUris_ = [];
    this.manifest_ = null;

    if (this.updateTimer_ != null) {
      this.updateTimer_.stop();
      this.updateTimer_ = null;
    }

    this.initSegmentDataByStreamId_.clear();

    return this.operationManager_.destroy();
  }

  /**
   * @override
   * @exportInterface
   */
  async update() {
    try {
      await this.requestManifest_();
    } catch (error) {
      if (!this.playerInterface_ || !error) {
        return;
      }
      goog.asserts.assert(error instanceof shaka.util.Error, 'Bad error type');
      this.playerInterface_.onError(error);
    }
  }

  /**
   * @override
   * @exportInterface
   */
  onExpirationUpdated(sessionId, expiration) {
    // No-op
  }

  /**
   * Makes a network request for the manifest and parses the resulting data.
   *
   * @private
   */
  async requestManifest_() {
    const requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
    const type = shaka.net.NetworkingEngine.AdvancedRequestType.MSS;
    const request = shaka.net.NetworkingEngine.makeRequest(
        this.manifestUris_, this.config_.retryParameters);
    const networkingEngine = this.playerInterface_.networkingEngine;

    const startTime = Date.now();
    const operation = networkingEngine.request(requestType, request, {type});
    this.operationManager_.manage(operation);

    const response = await operation.promise;

    // Detect calls to stop().
    if (!this.playerInterface_) {
      return;
    }

    // For redirections add the response uri to the first entry in the
    // Manifest Uris array.
    if (response.uri && !this.manifestUris_.includes(response.uri)) {
      this.manifestUris_.unshift(response.uri);
    }

    // This may throw, but it will result in a failed promise.
    this.parseManifest_(response.data, response.uri);
    // Keep track of how long the longest manifest update took.
    const endTime = Date.now();
    const updateDuration = (endTime - startTime) / 1000.0;
    this.averageUpdateDuration_.sample(1, updateDuration);
  }

  /**
   * Parses the manifest XML.  This also handles updates and will update the
   * stored manifest.
   *
   * @param {BufferSource} data
   * @param {string} finalManifestUri The final manifest URI, which may
   *   differ from this.manifestUri_ if there has been a redirect.
   * @return {!Promise}
   * @private
   */
  parseManifest_(data, finalManifestUri) {
    const mss = shaka.util.XmlUtils.parseXml(data, 'SmoothStreamingMedia');
    if (!mss) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSS_INVALID_XML,
          finalManifestUri);
    }
    this.processManifest_(mss, finalManifestUri);
    return Promise.resolve();
  }


  /**
   * Takes a formatted MSS and converts it into a manifest.
   *
   * @param {!Element} mss
   * @param {string} finalManifestUri The final manifest URI, which may
   *   differ from this.manifestUri_ if there has been a redirect.
   * @private
   */
  processManifest_(mss, finalManifestUri) {
    const XmlUtils = shaka.util.XmlUtils;

    const manifestPreprocessor = this.config_.mss.manifestPreprocessor;
    if (manifestPreprocessor) {
      manifestPreprocessor(mss);
    }

    /** @type {!shaka.media.PresentationTimeline} */
    let presentationTimeline;
    if (this.manifest_) {
      presentationTimeline = this.manifest_.presentationTimeline;
    } else {
      presentationTimeline = new shaka.media.PresentationTimeline(
          /* presentationStartTime= */ null, /* delay= */ 0);
    }

    const isLive = XmlUtils.parseAttr(mss, 'IsLive',
        XmlUtils.parseBoolean, /* defaultValue= */ false);

    if (isLive) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSS_LIVE_CONTENT_NOT_SUPPORTED);
    }

    presentationTimeline.setStatic(!isLive);

    const timescale = XmlUtils.parseAttr(mss, 'TimeScale',
        XmlUtils.parseNonNegativeInt, shaka.mss.MssParser.DEFAULT_TIME_SCALE_);
    goog.asserts.assert(timescale && timescale >= 0,
        'Timescale must be defined!');

    let dvrWindowLength = XmlUtils.parseAttr(mss, 'DVRWindowLength',
        XmlUtils.parseNonNegativeInt);
    // If the DVRWindowLength field is omitted for a live presentation or set
    // to 0, the DVR window is effectively infinite
    if (isLive && (dvrWindowLength === 0 || isNaN(dvrWindowLength))) {
      dvrWindowLength = Infinity;
    }
    // Start-over
    const canSeek = XmlUtils.parseAttr(mss, 'CanSeek',
        XmlUtils.parseBoolean, /* defaultValue= */ false);
    if (dvrWindowLength === 0 && canSeek) {
      dvrWindowLength = Infinity;
    }

    let segmentAvailabilityDuration = null;
    if (dvrWindowLength && dvrWindowLength > 0) {
      segmentAvailabilityDuration = dvrWindowLength / timescale;
    }

    // If it's live, we check for an override.
    if (isLive && !isNaN(this.config_.availabilityWindowOverride)) {
      segmentAvailabilityDuration = this.config_.availabilityWindowOverride;
    }

    // If it's null, that means segments are always available.  This is always
    // the case for VOD, and sometimes the case for live.
    if (segmentAvailabilityDuration == null) {
      segmentAvailabilityDuration = Infinity;
    }

    presentationTimeline.setSegmentAvailabilityDuration(
        segmentAvailabilityDuration);

    // Duration in timescale units.
    const duration = XmlUtils.parseAttr(mss, 'Duration',
        XmlUtils.parseNonNegativeInt, Infinity);
    goog.asserts.assert(duration && duration >= 0,
        'Duration must be defined!');

    if (!isLive) {
      presentationTimeline.setDuration(duration / timescale);
    }

    /** @type {!shaka.mss.MssParser.Context} */
    const context = {
      variants: [],
      textStreams: [],
      timescale: timescale,
      duration: duration / timescale,
    };

    this.parseStreamIndexes_(mss, context);

    // These steps are not done on manifest update.
    if (!this.manifest_) {
      this.manifest_ = {
        presentationTimeline: presentationTimeline,
        variants: context.variants,
        textStreams: context.textStreams,
        imageStreams: [],
        offlineSessionIds: [],
        minBufferTime: 0,
        sequenceMode: this.config_.mss.sequenceMode,
        ignoreManifestTimestampsInSegmentsMode: false,
        type: shaka.media.ManifestParser.MSS,
      };

      // This is the first point where we have a meaningful presentation start
      // time, and we need to tell PresentationTimeline that so that it can
      // maintain consistency from here on.
      presentationTimeline.lockStartTime();
    } else {
      // Just update the variants and text streams.
      this.manifest_.variants = context.variants;
      this.manifest_.textStreams = context.textStreams;

      // Re-filter the manifest.  This will check any configured restrictions on
      // new variants, and will pass any new init data to DrmEngine to ensure
      // that key rotation works correctly.
      this.playerInterface_.filter(this.manifest_);
    }
  }

  /**
   * @param {!Element} mss
   * @param {!shaka.mss.MssParser.Context} context
   * @private
   */
  parseStreamIndexes_(mss, context) {
    const ContentProtection = shaka.mss.ContentProtection;
    const XmlUtils = shaka.util.XmlUtils;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const protectionElems = XmlUtils.findChildren(mss, 'Protection');
    const drmInfos = ContentProtection.parseFromProtection(
        protectionElems, this.config_.mss.keySystemsBySystemId);

    const audioStreams = [];
    const videoStreams = [];
    const textStreams = [];
    const streamIndexes = XmlUtils.findChildren(mss, 'StreamIndex');
    for (const streamIndex of streamIndexes) {
      const qualityLevels = XmlUtils.findChildren(streamIndex, 'QualityLevel');
      const timeline = this.createTimeline_(
          streamIndex, context.timescale, context.duration);
      // For each QualityLevel node, create a stream element
      for (const qualityLevel of qualityLevels) {
        const stream = this.createStream_(
            streamIndex, qualityLevel, timeline, drmInfos, context);
        if (!stream) {
          // Skip unsupported stream
          continue;
        }
        if (stream.type == ContentType.AUDIO &&
            !this.config_.disableAudio) {
          audioStreams.push(stream);
        } else if (stream.type == ContentType.VIDEO &&
            !this.config_.disableVideo) {
          videoStreams.push(stream);
        } else if (stream.type == ContentType.TEXT &&
            !this.config_.disableText) {
          textStreams.push(stream);
        }
      }
    }

    const variants = [];
    for (const audio of (audioStreams.length > 0 ? audioStreams : [null])) {
      for (const video of (videoStreams.length > 0 ? videoStreams : [null])) {
        variants.push(this.createVariant_(audio, video));
      }
    }
    context.variants = variants;
    context.textStreams = textStreams;
  }

  /**
   * @param {!Element} streamIndex
   * @param {!Element} qualityLevel
   * @param {!Array.<shaka.mss.MssParser.TimeRange>} timeline
   * @param {!Array.<shaka.extern.DrmInfo>} drmInfos
   * @param {!shaka.mss.MssParser.Context} context
   * @return {?shaka.extern.Stream}
   * @private
   */
  createStream_(streamIndex, qualityLevel, timeline, drmInfos, context) {
    const XmlUtils = shaka.util.XmlUtils;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const MssParser = shaka.mss.MssParser;

    const type = streamIndex.getAttribute('Type');
    const isValidType = type === 'audio' || type === 'video' ||
        type === 'text';
    if (!isValidType) {
      shaka.log.alwaysWarn('Ignoring unrecognized type:', type);
      return null;
    }

    const lang = streamIndex.getAttribute('Language');
    const id = this.globalId_++;

    const bandwidth = XmlUtils.parseAttr(
        qualityLevel, 'Bitrate', XmlUtils.parsePositiveInt);
    const width = XmlUtils.parseAttr(
        qualityLevel, 'MaxWidth', XmlUtils.parsePositiveInt);
    const height = XmlUtils.parseAttr(
        qualityLevel, 'MaxHeight', XmlUtils.parsePositiveInt);
    const channelsCount = XmlUtils.parseAttr(
        qualityLevel, 'Channels', XmlUtils.parsePositiveInt);
    const audioSamplingRate = XmlUtils.parseAttr(
        qualityLevel, 'SamplingRate', XmlUtils.parsePositiveInt);

    /** @type {!shaka.extern.Stream} */
    const stream = {
      id: id,
      originalId: streamIndex.getAttribute('Name') || String(id),
      createSegmentIndex: () => Promise.resolve(),
      closeSegmentIndex: () => Promise.resolve(),
      segmentIndex: null,
      mimeType: '',
      codecs: '',
      frameRate: undefined,
      pixelAspectRatio: undefined,
      bandwidth: bandwidth || 0,
      width: width || undefined,
      height: height || undefined,
      kind: '',
      encrypted: drmInfos.length > 0,
      drmInfos: drmInfos,
      keyIds: new Set(),
      language: lang || 'und',
      label: '',
      type: '',
      primary: false,
      trickModeVideo: null,
      emsgSchemeIdUris: [],
      roles: [],
      forced: false,
      channelsCount: channelsCount,
      audioSamplingRate: audioSamplingRate,
      spatialAudio: false,
      closedCaptions: null,
      hdr: undefined,
      tilesLayout: undefined,
      matchedStreams: [],
      mssPrivateData: {
        duration: context.duration,
        timescale: context.timescale,
        codecPrivateData: null,
      },
    };

    // This is specifically for text tracks.
    const subType = streamIndex.getAttribute('Subtype');
    if (subType) {
      const role = MssParser.ROLE_MAPPING_[subType];
      if (role) {
        stream.roles.push(role);
      }
      if (role === 'main') {
        stream.primary = true;
      }
    }

    let fourCCValue = qualityLevel.getAttribute('FourCC');

    // If FourCC not defined at QualityLevel level,
    // then get it from StreamIndex level
    if (fourCCValue === null || fourCCValue === '') {
      fourCCValue = streamIndex.getAttribute('FourCC');
    }

    // If still not defined (optional for audio stream,
    // see https://msdn.microsoft.com/en-us/library/ff728116%28v=vs.95%29.aspx),
    // then we consider the stream is an audio AAC stream
    if (!fourCCValue) {
      if (type === 'audio') {
        fourCCValue = 'AAC';
      } else if (type === 'video') {
        shaka.log.alwaysWarn('FourCC is not defined whereas it is required ' +
            'for a QualityLevel element for a StreamIndex of type "video"');
        return null;
      }
    }

    // Check if codec is supported
    if (!MssParser.SUPPORTED_CODECS_.includes(fourCCValue.toUpperCase())) {
      shaka.log.alwaysWarn('Codec not supported:', fourCCValue);
      return null;
    }

    const codecPrivateData = this.getCodecPrivateData_(
        qualityLevel, type, fourCCValue, stream);
    stream.mssPrivateData.codecPrivateData = codecPrivateData;

    switch (type) {
      case 'audio':
        if (!codecPrivateData) {
          shaka.log.alwaysWarn('Quality unsupported without CodecPrivateData',
              type);
          return null;
        }
        stream.type = ContentType.AUDIO;
        // This mimetype is fake to allow the transmuxing.
        stream.mimeType = 'mss/audio/mp4';
        stream.codecs = this.getAACCodec_(
            qualityLevel, fourCCValue, codecPrivateData);
        break;
      case 'video':
        if (!codecPrivateData) {
          shaka.log.alwaysWarn('Quality unsupported without CodecPrivateData',
              type);
          return null;
        }
        stream.type = ContentType.VIDEO;
        // This mimetype is fake to allow the transmuxing.
        stream.mimeType = 'mss/video/mp4';
        stream.codecs = this.getH264Codec_(
            qualityLevel, codecPrivateData);
        break;
      case 'text':
        stream.type = ContentType.TEXT;
        stream.mimeType = 'application/mp4';
        if (fourCCValue === 'TTML' || fourCCValue === 'DFXP') {
          stream.codecs = 'stpp';
        }
        break;
    }

    // Lazy-Load the segment index to avoid create all init segment at the
    // same time
    stream.createSegmentIndex = () => {
      if (stream.segmentIndex) {
        return Promise.resolve();
      }
      let initSegmentData;
      if (this.initSegmentDataByStreamId_.has(stream.id)) {
        initSegmentData = this.initSegmentDataByStreamId_.get(stream.id);
      } else {
        initSegmentData = shaka.mss.MssUtils.generateInitSegment(stream);
        this.initSegmentDataByStreamId_.set(stream.id, initSegmentData);
      }
      const initSegmentRef = new shaka.media.InitSegmentReference(
          () => [],
          /* startByte= */ 0,
          /* endByte= */ null,
          /* mediaQuality= */ null,
          /* timescale= */ undefined,
          initSegmentData);

      const segments = this.createSegments_(initSegmentRef,
          stream, streamIndex, timeline, context);

      stream.segmentIndex = new shaka.media.SegmentIndex(segments);
      return Promise.resolve();
    };
    stream.closeSegmentIndex = () => {
      // If we have a segment index, release it.
      if (stream.segmentIndex) {
        stream.segmentIndex.release();
        stream.segmentIndex = null;
      }
    };

    return stream;
  }

  /**
   * @param {!Element} qualityLevel
   * @param {string} type
   * @param {string} fourCCValue
   * @param {!shaka.extern.Stream} stream
   * @return {?string}
   * @private
   */
  getCodecPrivateData_(qualityLevel, type, fourCCValue, stream) {
    const codecPrivateData = qualityLevel.getAttribute('CodecPrivateData');
    if (codecPrivateData) {
      return codecPrivateData;
    }
    if (type !== 'audio') {
      return null;
    }
    // For the audio we can reconstruct the CodecPrivateData
    // By default stereo
    const channels = stream.channelsCount || 2;
    // By default 44,1kHz.
    const samplingRate = stream.audioSamplingRate || 44100;

    const samplingFrequencyIndex = {
      96000: 0x0,
      88200: 0x1,
      64000: 0x2,
      48000: 0x3,
      44100: 0x4,
      32000: 0x5,
      24000: 0x6,
      22050: 0x7,
      16000: 0x8,
      12000: 0x9,
      11025: 0xA,
      8000: 0xB,
      7350: 0xC,
    };

    const indexFreq = samplingFrequencyIndex[samplingRate];
    if (fourCCValue === 'AACH') {
      // High Efficiency AAC Profile
      const objectType = 0x05;
      // 4 bytes :
      // XXXXX        XXXX         XXXX             XXXX
      // 'ObjectType' 'Freq Index' 'Channels value' 'Extens Sampl Freq'
      // XXXXX        XXX   XXXXXXX
      // 'ObjectType' 'GAS' 'alignment = 0'
      const data = new Uint8Array(4);
      // In HE AAC Extension Sampling frequence
      // equals to SamplingRate * 2
      const extensionSamplingFrequencyIndex =
          samplingFrequencyIndex[samplingRate * 2];
      // Freq Index is present for 3 bits in the first byte, last bit is in
      // the second
      data[0] = (objectType << 3) | (indexFreq >> 1);
      data[1] = (indexFreq << 7) | (channels << 3) |
          (extensionSamplingFrequencyIndex >> 1);
      // Origin object type equals to 2 => AAC Main Low Complexity
      data[2] = (extensionSamplingFrequencyIndex << 7) | (0x02 << 2);
      // Slignment bits
      data[3] = 0x0;
      // Put the 4 bytes in an 16 bits array
      const arr16 = new Uint16Array(2);
      arr16[0] = (data[0] << 8) + data[1];
      arr16[1] = (data[2] << 8) + data[3];
      // Convert decimal to hex value
      return arr16[0].toString(16) + arr16[1].toString(16);
    } else {
      // AAC Main Low Complexity
      const objectType = 0x02;
      // 2 bytes:
      // XXXXX        XXXX         XXXX             XXX
      // 'ObjectType' 'Freq Index' 'Channels value' 'GAS = 000'
      const data = new Uint8Array(2);
      // Freq Index is present for 3 bits in the first byte, last bit is in
      // the second
      data[0] = (objectType << 3) | (indexFreq >> 1);
      data[1] = (indexFreq << 7) | (channels << 3);
      // Put the 2 bytes in an 16 bits array
      const arr16 = new Uint16Array(1);
      arr16[0] = (data[0] << 8) + data[1];
      // Convert decimal to hex value
      return arr16[0].toString(16);
    }
  }

  /**
   * @param {!Element} qualityLevel
   * @param {string} fourCCValue
   * @param {?string} codecPrivateData
   * @return {string}
   * @private
   */
  getAACCodec_(qualityLevel, fourCCValue, codecPrivateData) {
    let objectType = 0;

    // Chrome problem, in implicit AAC HE definition, so when AACH is detected
    // in FourCC set objectType to 5 => strange, it should be 2
    if (fourCCValue === 'AACH') {
      objectType = 0x05;
    }
    if (!codecPrivateData) {
      // AAC Main Low Complexity => object Type = 2
      objectType = 0x02;
      if (fourCCValue === 'AACH') {
        // High Efficiency AAC Profile = object Type = 5 SBR
        objectType = 0x05;
      }
    } else if (objectType === 0) {
      objectType = (parseInt(codecPrivateData.substr(0, 2), 16) & 0xF8) >> 3;
    }

    return 'mp4a.40.' + objectType;
  }

  /**
   * @param {!Element} qualityLevel
   * @param {?string} codecPrivateData
   * @return {string}
   * @private
   */
  getH264Codec_(qualityLevel, codecPrivateData) {
    // Extract from the CodecPrivateData field the hexadecimal representation
    // of the following three bytes in the sequence parameter set NAL unit.
    // => Find the SPS nal header
    const nalHeader = /00000001[0-9]7/.exec(codecPrivateData);
    if (!nalHeader.length) {
      return '';
    }
    if (!codecPrivateData) {
      return '';
    }
    // => Find the 6 characters after the SPS nalHeader (if it exists)
    const avcoti = codecPrivateData.substr(
        codecPrivateData.indexOf(nalHeader[0]) + 10, 6);

    return 'avc1.' + avcoti;
  }

  /**
   * @param {!shaka.media.InitSegmentReference} initSegmentRef
   * @param {!shaka.extern.Stream} stream
   * @param {!Element} streamIndex
   * @param {!Array.<shaka.mss.MssParser.TimeRange>} timeline
   * @param {!shaka.mss.MssParser.Context} context
   * @return {!Array.<!shaka.media.SegmentReference>}
   * @private
   */
  createSegments_(initSegmentRef, stream, streamIndex, timeline, context) {
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const url = streamIndex.getAttribute('Url');
    goog.asserts.assert(url, 'Missing URL for segments');

    const mediaUrl = url.replace('{bitrate}', String(stream.bandwidth));

    const segments = [];
    for (const time of timeline) {
      const getUris = () => {
        return ManifestParserUtils.resolveUris(this.manifestUris_,
            [mediaUrl.replace('{start time}', String(time.unscaledStart))]);
      };
      segments.push(new shaka.media.SegmentReference(
          time.start,
          time.end,
          getUris,
          /* startByte= */ 0,
          /* endByte= */ null,
          initSegmentRef,
          /* timestampOffset= */ 0,
          /* appendWindowStart= */ 0,
          /* appendWindowEnd= */ context.duration));
    }
    return segments;
  }

  /**
   * Expands a streamIndex into an array-based timeline.  The results are in
   * seconds.
   *
   * @param {!Element} streamIndex
   * @param {number} timescale
   * @param {number} duration The duration in seconds.
   * @return {!Array.<shaka.mss.MssParser.TimeRange>}
   * @private
   */
  createTimeline_(streamIndex, timescale, duration) {
    goog.asserts.assert(
        timescale > 0 && timescale < Infinity,
        'timescale must be a positive, finite integer');
    goog.asserts.assert(
        duration > 0, 'duration must be a positive integer');

    const XmlUtils = shaka.util.XmlUtils;

    const timePoints = XmlUtils.findChildren(streamIndex, 'c');

    /** @type {!Array.<shaka.mss.MssParser.TimeRange>} */
    const timeline = [];
    let lastEndTime = 0;

    for (let i = 0; i < timePoints.length; ++i) {
      const timePoint = timePoints[i];
      const next = timePoints[i + 1];
      const t =
          XmlUtils.parseAttr(timePoint, 't', XmlUtils.parseNonNegativeInt);
      const d =
          XmlUtils.parseAttr(timePoint, 'd', XmlUtils.parseNonNegativeInt);
      const r = XmlUtils.parseAttr(timePoint, 'r', XmlUtils.parseInt);

      if (!d) {
        shaka.log.warning(
            '"c" element must have a duration:',
            'ignoring the remaining "c" elements.', timePoint);
        return timeline;
      }

      let startTime = t != null ? t : lastEndTime;

      let repeat = r || 0;
      if (repeat < 0) {
        if (next) {
          const nextStartTime =
              XmlUtils.parseAttr(next, 't', XmlUtils.parseNonNegativeInt);
          if (nextStartTime == null) {
            shaka.log.warning(
                'An "c" element cannot have a negative repeat',
                'if the next "c" element does not have a valid start time:',
                'ignoring the remaining "c" elements.', timePoint);
            return timeline;
          } else if (startTime >= nextStartTime) {
            shaka.log.warning(
                'An "c" element cannot have a negative repeatif its start ',
                'time exceeds the next "c" element\'s start time:',
                'ignoring the remaining "c" elements.', timePoint);
            return timeline;
          }
          repeat = Math.ceil((nextStartTime - startTime) / d) - 1;
        } else {
          if (duration == Infinity) {
            // The MSS spec. actually allows the last "c" element to have a
            // negative repeat value even when it has an infinite
            // duration.  No one uses this feature and no one ever should,
            // ever.
            shaka.log.warning(
                'The last "c" element cannot have a negative repeat',
                'if the Period has an infinite duration:',
                'ignoring the last "c" element.', timePoint);
            return timeline;
          } else if (startTime / timescale >= duration) {
            shaka.log.warning(
                'The last "c" element cannot have a negative repeat',
                'if its start time exceeds the duration:',
                'igoring the last "c" element.', timePoint);
            return timeline;
          }
          repeat = Math.ceil((duration * timescale - startTime) / d) - 1;
        }
      }

      for (let j = 0; j <= repeat; ++j) {
        const endTime = startTime + d;
        const item = {
          start: startTime / timescale,
          end: endTime / timescale,
          unscaledStart: startTime,
        };
        timeline.push(item);

        startTime = endTime;
        lastEndTime = endTime;
      }
    }

    return timeline;
  }

  /**
   * @param {?shaka.extern.Stream} audioStream
   * @param {?shaka.extern.Stream} videoStream
   * @return {!shaka.extern.Variant}
   * @private
   */
  createVariant_(audioStream, videoStream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    goog.asserts.assert(!audioStream ||
        audioStream.type == ContentType.AUDIO, 'Audio parameter mismatch!');
    goog.asserts.assert(!videoStream ||
        videoStream.type == ContentType.VIDEO, 'Video parameter mismatch!');

    let bandwidth = 0;
    if (audioStream && audioStream.bandwidth && audioStream.bandwidth > 0) {
      bandwidth += audioStream.bandwidth;
    }
    if (videoStream && videoStream.bandwidth && videoStream.bandwidth > 0) {
      bandwidth += videoStream.bandwidth;
    }

    return {
      id: this.globalId_++,
      language: audioStream ? audioStream.language : 'und',
      disabledUntilTime: 0,
      primary: (!!audioStream && audioStream.primary) ||
          (!!videoStream && videoStream.primary),
      audio: audioStream,
      video: videoStream,
      bandwidth: bandwidth,
      allowedByApplication: true,
      allowedByKeySystem: true,
      decodingInfos: [],
    };
  }
};


/**
 * Contains the minimum amount of time, in seconds, between manifest update
 * requests.
 *
 * @private
 * @const {number}
 */
shaka.mss.MssParser.MIN_UPDATE_PERIOD_ = 3;


/**
 * @private
 * @const {number}
 */
shaka.mss.MssParser.DEFAULT_TIME_SCALE_ = 1e7;


/**
 * MSS supported codecs.
 *
 * @private
 * @const {!Array.<string>}
 */
shaka.mss.MssParser.SUPPORTED_CODECS_ = [
  'AAC',
  'AACL',
  'AACH',
  'AACP',
  'AVC1',
  'H264',
  'TTML',
  'DFXP',
];


/**
 * MPEG-DASH Role and accessibility mapping for text tracks according to
 * ETSI TS 103 285 v1.1.1 (section 7.1.2)
 *
 * @const {!Object.<string, string>}
 * @private
 */
shaka.mss.MssParser.ROLE_MAPPING_ = {
  'CAPT': 'main',
  'SUBT': 'alternate',
  'DESC': 'main',
};


/**
 * @typedef {{
 *   variants: !Array.<shaka.extern.Variant>,
 *   textStreams: !Array.<shaka.extern.Stream>,
 *   timescale: number,
 *   duration: number
 * }}
 *
 * @property {!Array.<shaka.extern.Variant>} variants
 *   The presentation's Variants.
 * @property {!Array.<shaka.extern.Stream>} textStreams
 *   The presentation's text streams.
 * @property {number} timescale
 *   The presentation's timescale.
 * @property {number} duration
 *   The presentation's duration.
 */
shaka.mss.MssParser.Context;


/**
 * @typedef {{
 *   start: number,
 *   unscaledStart: number,
 *   end: number
 * }}
 *
 * @description
 * Defines a time range of a media segment.  Times are in seconds.
 *
 * @property {number} start
 *   The start time of the range.
 * @property {number} unscaledStart
 *   The start time of the range in representation timescale units.
 * @property {number} end
 *   The end time (exclusive) of the range.
 */
shaka.mss.MssParser.TimeRange;

if (shaka.dependencies.isoBoxer()) {
  shaka.media.ManifestParser.registerParserByExtension(
      'ism', () => new shaka.mss.MssParser());
  shaka.media.ManifestParser.registerParserByMime(
      'application/vnd.ms-sstr+xml', () => new shaka.mss.MssParser());
}
