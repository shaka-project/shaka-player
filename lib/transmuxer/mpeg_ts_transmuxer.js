/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.MpegTsTransmuxer');

goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.MpegAudio');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.TsParser');
goog.require('shaka.util.Uint8ArrayUtils');

/**
 * @fileoverview
 *
 * This transmuxer takes an audio-only TS with MP3, and converts it to
 * raw MP3(audio/mpeg). We don't do it in ts_transmuxer.js because the
 * output of it is always MP4. This transmuxer is necessary because the only
 * browser that supports MP3 in MP4 is Firefox(audio/mp4; codecs="mp3"),
 * other browsers don't support it.
 */

/**
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.MpegTsTransmuxer = class {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    /** @private {string} */
    this.originalMimeType_ = mimeType;

    /** @private {?shaka.util.TsParser} */
    this.tsParser_ = null;
  }


  /**
   * @override
   * @export
   */
  destroy() {
    // Nothing
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

    if (!this.isTsContainer_(mimeType)) {
      return false;
    }

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const MimeUtils = shaka.util.MimeUtils;

    const codecs = MimeUtils.getCodecs(mimeType);
    const allCodecs = MimeUtils.splitCodecs(codecs);

    const audioCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.AUDIO, allCodecs);
    const videoCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.VIDEO, allCodecs);

    if (!audioCodec || videoCodec) {
      return false;
    }
    const normalizedCodec = MimeUtils.getNormalizedCodec(audioCodec);

    if (normalizedCodec != 'mp3') {
      return false;
    }

    return Capabilities.isTypeSupported(
        this.convertCodecs(ContentType.AUDIO, mimeType));
  }


  /**
   * Check if the mimetype is 'video/mp2t'.
   * @param {string} mimeType
   * @return {boolean}
   * @private
   */
  isTsContainer_(mimeType) {
    return mimeType.toLowerCase().split(';')[0] == 'video/mp2t';
  }


  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    if (this.isTsContainer_(mimeType)) {
      return 'audio/mpeg';
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
  transmux(data, stream, reference, duration, contentType) {
    const MpegAudio = shaka.transmuxer.MpegAudio;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

    if (!this.tsParser_) {
      this.tsParser_ = new shaka.util.TsParser();
    } else {
      this.tsParser_.clearData();
    }
    this.tsParser_.setDiscontinuitySequence(reference.discontinuitySequence);

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);

    const tsParser = this.tsParser_.parse(uint8ArrayData);
    const codecs = tsParser.getCodecs();
    if (codecs.audio != 'mp3' || contentType != ContentType.AUDIO) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          reference ? reference.getUris()[0] : null));
    }

    // MPEG audio frames are not aligned with the PES packets, so join the
    // payloads and parse them as a single elementary stream. Otherwise the
    // frames that straddle a PES boundary would be dropped, and their leading
    // bytes in the next payload could be mistaken for a frame of their own.
    /** @type {!Array<!Uint8Array>} */
    const payloads = [];
    for (const audioData of tsParser.getAudioData()) {
      if (!audioData.data) {
        continue;
      }
      payloads.push(audioData.data);
    }
    const audioStream = Uint8ArrayUtils.concatRange(payloads);

    /** @type {!Array<!Uint8Array>} */
    const frames = [];
    let offset = 0;
    while (offset < audioStream.length) {
      const header = MpegAudio.parseHeader(audioStream, offset);
      if (!header) {
        offset++;
        continue;
      }
      if (offset + header.frameLength <= audioStream.length) {
        frames.push(
            audioStream.subarray(offset, offset + header.frameLength));
      }
      offset += header.frameLength;
    }

    return Promise.resolve(Uint8ArrayUtils.concatRange(frames));
  }
};


shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'video/mp2t',
    () => new shaka.transmuxer.MpegTsTransmuxer('video/mp2t'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.PREFERRED_SECONDARY);
