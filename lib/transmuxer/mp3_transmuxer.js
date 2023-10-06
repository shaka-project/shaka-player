/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.Mp3Transmuxer');

goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.MpegAudio');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Id3Utils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Mp4Generator');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.Mp3Transmuxer = class {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    /** @private {string} */
    this.originalMimeType_ = mimeType;

    /** @private {number} */
    this.frameIndex_ = 0;

    /** @private {!Map.<number, !Uint8Array>} */
    this.initSegments = new Map();
  }


  /**
   * @override
   * @export
   */
  destroy() {
    this.initSegments.clear();
  }


  /**
   * Check if the mime type and the content type is supported.
   * @param {string} mimeType
   * @param {string=} contentType
   * @return {boolean}
   * @override
   * @export
   */
  isSupported(mimeType, contentType) {
    const Capabilities = shaka.media.Capabilities;

    if (!this.isMpegContainer_(mimeType)) {
      return false;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return Capabilities.isTypeSupported(
        this.convertCodecs(ContentType.AUDIO, mimeType));
  }


  /**
   * Check if the mimetype is 'audio/mpeg'.
   * @param {string} mimeType
   * @return {boolean}
   * @private
   */
  isMpegContainer_(mimeType) {
    return mimeType.toLowerCase().split(';')[0] == 'audio/mpeg';
  }


  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    if (this.isMpegContainer_(mimeType)) {
      return 'audio/mp4; codecs="mp3"';
    }
    return mimeType;
  }


  /**
   * @override
   * @export
   */
  getOriginalMimeType() {
    return this.originalMimeType_;
  }


  /**
   * @override
   * @export
   */
  transmux(data, stream, reference, duration) {
    const MpegAudio = shaka.transmuxer.MpegAudio;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);

    const id3Data = shaka.util.Id3Utils.getID3Data(uint8ArrayData);
    let offset = id3Data.length;
    for (; offset < uint8ArrayData.length; offset++) {
      if (MpegAudio.probe(uint8ArrayData, offset)) {
        break;
      }
    }

    const timescale = 90000;
    let firstHeader;

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    while (offset < uint8ArrayData.length) {
      const header = MpegAudio.parseHeader(uint8ArrayData, offset);
      if (!header) {
        return Promise.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED));
      }
      if (!firstHeader) {
        firstHeader = header;
      }
      if (offset + header.frameLength <= uint8ArrayData.length) {
        samples.push({
          data: uint8ArrayData.subarray(offset, offset + header.frameLength),
          size: header.frameLength,
          duration: MpegAudio.MPEG_AUDIO_SAMPLE_PER_FRAME,
          cts: 0,
          flags: {
            isLeading: 0,
            isDependedOn: 0,
            hasRedundancy: 0,
            degradPrio: 0,
            dependsOn: 2,
            isNonSync: 0,
          },
        });
      }
      offset += header.frameLength;
    }
    if (!firstHeader) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED));
    }
    /** @type {number} */
    const sampleRate = firstHeader.sampleRate;
    /** @type {number} */
    const frameDuration =
        firstHeader.samplesPerFrame * timescale / firstHeader.sampleRate;
    /** @type {number} */
    const baseMediaDecodeTime = this.frameIndex_ * frameDuration;

    /** @type {shaka.util.Mp4Generator.StreamInfo} */
    const streamInfo = {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
      codecs: 'mp3',
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: sampleRate,
      duration: duration,
      videoNalus: [],
      audioConfig: new Uint8Array([]),
      videoConfig: new Uint8Array([]),
      data: {
        sequenceNumber: this.frameIndex_,
        baseMediaDecodeTime: baseMediaDecodeTime,
        samples: samples,
      },
      stream: stream,
    };
    const mp4Generator = new shaka.util.Mp4Generator([streamInfo]);
    let initSegment;
    if (!this.initSegments.has(stream.id)) {
      initSegment = mp4Generator.initSegment();
      this.initSegments.set(stream.id, initSegment);
    } else {
      initSegment = this.initSegments.get(stream.id);
    }
    const segmentData = mp4Generator.segmentData();

    this.frameIndex_++;
    const transmuxData = Uint8ArrayUtils.concat(initSegment, segmentData);
    return Promise.resolve(transmuxData);
  }
};

shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'audio/mpeg',
    () => new shaka.transmuxer.Mp3Transmuxer('audio/mpeg'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
