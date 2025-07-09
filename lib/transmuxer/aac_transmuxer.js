/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.AacTransmuxer');

goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.ADTS');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Id3Utils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Generator');


/**
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.AacTransmuxer = class {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    /** @private {string} */
    this.originalMimeType_ = mimeType;

    /** @private {number} */
    this.frameIndex_ = 0;

    /** @private {!Map<string, !Uint8Array>} */
    this.initSegments = new Map();

    /** @private {?Uint8Array} */
    this.lastInitSegment_ = null;
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

    if (!this.isAacContainer_(mimeType)) {
      return false;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return Capabilities.isTypeSupported(
        this.convertCodecs(ContentType.AUDIO, mimeType));
  }


  /**
   * Check if the mimetype is 'audio/aac'.
   * @param {string} mimeType
   * @return {boolean}
   * @private
   */
  isAacContainer_(mimeType) {
    return mimeType.toLowerCase().split(';')[0] == 'audio/aac';
  }


  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    if (this.isAacContainer_(mimeType)) {
      const codecs = shaka.util.MimeUtils.getCodecs(mimeType);
      return `audio/mp4; codecs="${codecs || 'mp4a.40.2'}"`;
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
    const ADTS = shaka.transmuxer.ADTS;

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);

    // Check for the ADTS sync word
    // Look for ADTS header | 1111 1111 | 1111 X00X | where X can be
    // either 0 or 1
    // Layer bits (position 14 and 15) in header should be always 0 for ADTS
    // More info https://wiki.multimedia.cx/index.php?title=ADTS
    const id3Data = shaka.util.Id3Utils.getID3Data(uint8ArrayData);
    let offset = id3Data.length;
    for (; offset < uint8ArrayData.length; offset++) {
      if (ADTS.probe(uint8ArrayData, offset)) {
        break;
      }
    }

    let timestamp = reference.endTime * 1000;

    const frames = shaka.util.Id3Utils.getID3Frames(id3Data);
    if (frames.length && reference) {
      const metadataTimestamp = frames.find((frame) => {
        return frame.description ===
            'com.apple.streaming.transportStreamTimestamp';
      });
      if (metadataTimestamp) {
        timestamp = /** @type {!number} */(metadataTimestamp.data);
      }
    }

    const info = ADTS.parseInfo(uint8ArrayData, offset);
    if (!info) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          reference ? reference.getUris()[0] : null));
    }
    stream.audioSamplingRate = info.sampleRate;
    stream.channelsCount = info.channelCount;

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    while (offset < uint8ArrayData.length) {
      const header = ADTS.parseHeader(uint8ArrayData, offset);
      if (!header) {
        return Promise.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED,
            reference ? reference.getUris()[0] : null));
      }
      const length = header.headerLength + header.frameLength;
      if (offset + length <= uint8ArrayData.length) {
        const data = uint8ArrayData.subarray(
            offset + header.headerLength, offset + length);
        samples.push({
          data: data,
          size: header.frameLength,
          duration: ADTS.AAC_SAMPLES_PER_FRAME,
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
      offset += length;
    }

    /** @type {number} */
    const sampleRate = info.sampleRate;
    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(timestamp * sampleRate / 1000);

    /** @type {shaka.util.Mp4Generator.StreamInfo} */
    const streamInfo = {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
      codecs: info.codec,
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: sampleRate,
      duration: duration,
      videoNalus: [],
      audioConfig: new Uint8Array([]),
      videoConfig: new Uint8Array([]),
      hSpacing: 0,
      vSpacing: 0,
      data: {
        sequenceNumber: this.frameIndex_,
        baseMediaDecodeTime: baseMediaDecodeTime,
        samples: samples,
      },
      stream: stream,
    };
    const mp4Generator = new shaka.util.Mp4Generator([streamInfo]);
    let initSegment;
    const initSegmentKey = stream.id + '_' + reference.discontinuitySequence;
    if (!this.initSegments.has(initSegmentKey)) {
      initSegment = mp4Generator.initSegment();
      this.initSegments.set(initSegmentKey, initSegment);
    } else {
      initSegment = this.initSegments.get(initSegmentKey);
    }
    const appendInitSegment = this.lastInitSegment_ !== initSegment;
    const segmentData = mp4Generator.segmentData();
    this.lastInitSegment_ = initSegment;
    this.frameIndex_++;
    return Promise.resolve({
      data: segmentData,
      init: appendInitSegment ? initSegment : null,
    });
  }
};

shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'audio/aac',
    () => new shaka.transmuxer.AacTransmuxer('audio/aac'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
