/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.Ac3Transmuxer');

goog.require('shaka.device.DeviceFactory');
goog.require('shaka.media.Capabilities');
goog.require('shaka.metadata.Id3Utils');
goog.require('shaka.transmuxer.Ac3');
goog.require('shaka.transmuxer.BaseTransmuxer');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.transmuxer.TransmuxerUtils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Mp4Generator');


/**
 * @extends {shaka.transmuxer.BaseTransmuxer}
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.Ac3Transmuxer = class extends shaka.transmuxer.BaseTransmuxer {
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
  transmux(data, stream, reference, duration) {
    const Ac3 = shaka.transmuxer.Ac3;

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);

    const id3Data = shaka.metadata.Id3Utils.getID3Data(uint8ArrayData);
    let offset = id3Data.length;
    for (; offset < uint8ArrayData.length; offset++) {
      if (Ac3.probe(uint8ArrayData, offset)) {
        break;
      }
    }

    const timestamp = this.getId3Timestamp(
        id3Data, reference.endTime * 1000);

    /** @type {number} */
    let sampleRate = 0;

    /** @type {!Uint8Array} */
    let audioConfig = new Uint8Array([]);

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    /** @type {!shaka.transmuxer.Ac3.Ac3Frame} */
    const frame = {
      sampleRate: 0,
      channelCount: 0,
      audioConfig: new Uint8Array(0),
      frameLength: 0,
    };

    while (offset < uint8ArrayData.length) {
      const didParseFrame = Ac3.parseFrame(uint8ArrayData, offset, frame);
      if (!didParseFrame) {
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
        flags: shaka.transmuxer.TransmuxerUtils.AUDIO_SAMPLE_FLAGS,
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
      timescale: sampleRate,
      duration: duration,
      mediaConfig: audioConfig,
      data: {
        sequenceNumber: this.frameIndex,
        baseMediaDecodeTime: baseMediaDecodeTime,
        samples: samples,
      },
      stream: stream,
    };
    const mp4Generator = new shaka.util.Mp4Generator([streamInfo]);
    return Promise.resolve(
        this.packageSegment(mp4Generator, stream, reference));
  }
};

shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'audio/ac3',
    () => new shaka.transmuxer.Ac3Transmuxer('audio/ac3'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
