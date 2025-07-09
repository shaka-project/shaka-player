/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.Ac3Transmuxer');

goog.require('shaka.device.DeviceFactory');
goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.Ac3');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Id3Utils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Mp4Generator');


/**
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.Ac3Transmuxer = class {
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

    if (!this.isAc3Container_(mimeType)) {
      return false;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return Capabilities.isTypeSupported(
        this.convertCodecs(ContentType.AUDIO, mimeType));
  }


  /**
   * Check if the mimetype is 'audio/ac3'.
   * @param {string} mimeType
   * @return {boolean}
   * @private
   */
  isAc3Container_(mimeType) {
    return mimeType.toLowerCase().split(';')[0] == 'audio/ac3';
  }


  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    if (this.isAc3Container_(mimeType)) {
      const device = shaka.device.DeviceFactory.getDevice();
      if (device.requiresEC3InitSegments()) {
        return 'audio/mp4; codecs="ec-3"';
      } else {
        return 'audio/mp4; codecs="ac-3"';
      }
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
    const Ac3 = shaka.transmuxer.Ac3;

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);

    const id3Data = shaka.util.Id3Utils.getID3Data(uint8ArrayData);
    let offset = id3Data.length;
    for (; offset < uint8ArrayData.length; offset++) {
      if (Ac3.probe(uint8ArrayData, offset)) {
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

    /** @type {number} */
    let sampleRate = 0;

    /** @type {!Uint8Array} */
    let audioConfig = new Uint8Array([]);

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    while (offset < uint8ArrayData.length) {
      const frame = Ac3.parseFrame(uint8ArrayData, offset);
      if (!frame) {
        return Promise.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED,
            reference ? reference.getUris()[0] : null));
      }
      stream.audioSamplingRate = frame.sampleRate;
      stream.channelsCount = frame.channelCount;
      sampleRate = frame.sampleRate;
      audioConfig = frame.audioConfig;

      const frameData = uint8ArrayData.subarray(
          offset, offset + frame.frameLength);

      samples.push({
        data: frameData,
        size: frame.frameLength,
        duration: Ac3.AC3_SAMPLES_PER_FRAME,
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
      offset += frame.frameLength;
    }
    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(timestamp * sampleRate / 1000);

    /** @type {shaka.util.Mp4Generator.StreamInfo} */
    const streamInfo = {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
      codecs: 'ac-3',
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: sampleRate,
      duration: duration,
      videoNalus: [],
      audioConfig: audioConfig,
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
    'audio/ac3',
    () => new shaka.transmuxer.Ac3Transmuxer('audio/ac3'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
