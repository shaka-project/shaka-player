/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.MuxjsTransmuxer');

goog.require('goog.asserts');
goog.require('shaka.dependencies');
goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.MuxjsTransmuxer = class {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    /** @private {string} */
    this.originalMimeType_ = mimeType;

    /** @private {?muxjs} */
    this.muxjs_ = shaka.dependencies.muxjs();

    /** @private {muxjs.mp4.Transmuxer} */
    this.muxTransmuxer_ = null;

    /** @private {shaka.util.PublicPromise} */
    this.transmuxPromise_ = null;

    /** @private {!Array.<!Uint8Array>} */
    this.transmuxedData_ = [];

    /** @private {boolean} */
    this.isTransmuxing_ = false;

    if (this.muxjs_) {
      this.muxTransmuxer_ = new this.muxjs_.mp4.Transmuxer({
        'keepOriginalTimestamps': true,
      });
      this.muxTransmuxer_.on('data', (segment) => this.onTransmuxed_(segment));
      this.muxTransmuxer_.on('done', () => this.onTransmuxDone_());
    }
  }


  /**
   * @override
   * @export
   */
  destroy() {
    if (this.muxTransmuxer_) {
      this.muxTransmuxer_.dispose();
    }
    this.muxTransmuxer_ = null;
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

    const isTs = this.isTsContainer_(mimeType);
    const isAac = this.isAacContainer_(mimeType);

    if (!this.muxjs_ || (!isTs && !isAac)) {
      return false;
    }

    if (isAac) {
      return Capabilities.isTypeSupported(this.convertAacCodecs_());
    }

    if (contentType) {
      return Capabilities.isTypeSupported(
          this.convertTsCodecs_(contentType, mimeType));
    }

    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const audioMime = this.convertTsCodecs_(ContentType.AUDIO, mimeType);
    const videoMime = this.convertTsCodecs_(ContentType.VIDEO, mimeType);
    return Capabilities.isTypeSupported(audioMime) ||
        Capabilities.isTypeSupported(videoMime);
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
   * Check if the mimetype contains 'mp2t'.
   * @param {string} mimeType
   * @return {boolean}
   * @private
   */
  isTsContainer_(mimeType) {
    return mimeType.toLowerCase().split(';')[0].split('/')[1] == 'mp2t';
  }


  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    if (this.isAacContainer_(mimeType)) {
      return this.convertAacCodecs_();
    } else if (this.isTsContainer_(mimeType)) {
      return this.convertTsCodecs_(contentType, mimeType);
    }
    return mimeType;
  }


  /**
   * For aac stream, convert its codecs to MP4 codecs.
   * @return {string}
   * @private
   */
  convertAacCodecs_() {
    return 'audio/mp4; codecs="mp4a.40.2"';
  }


  /**
   * For transport stream, convert its codecs to MP4 codecs.
   * @param {string} contentType
   * @param {string} tsMimeType
   * @return {string}
   * @private
   */
  convertTsCodecs_(contentType, tsMimeType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    let mp4MimeType = tsMimeType.replace(/mp2t/i, 'mp4');
    if (contentType == ContentType.AUDIO) {
      mp4MimeType = mp4MimeType.replace('video', 'audio');
    }

    // Handle legacy AVC1 codec strings (pre-RFC 6381).
    // Look for "avc1.<profile>.<level>", where profile is:
    //   66 (baseline => 0x42)
    //   77 (main => 0x4d)
    //   100 (high => 0x64)
    // Reference: https://bit.ly/2K9JI3x
    const match = /avc1\.(66|77|100)\.(\d+)/.exec(mp4MimeType);
    if (match) {
      let newCodecString = 'avc1.';

      const profile = match[1];
      if (profile == '66') {
        newCodecString += '4200';
      } else if (profile == '77') {
        newCodecString += '4d00';
      } else {
        goog.asserts.assert(profile == '100',
            'Legacy avc1 parsing code out of sync with regex!');
        newCodecString += '6400';
      }

      // Convert the level to hex and append to the codec string.
      const level = Number(match[2]);
      goog.asserts.assert(level < 256,
          'Invalid legacy avc1 level number!');
      newCodecString += (level >> 4).toString(16);
      newCodecString += (level & 0xf).toString(16);

      mp4MimeType = mp4MimeType.replace(match[0], newCodecString);
    }

    return mp4MimeType;
  }


  /**
   * @override
   * @export
   */
  getOrginalMimeType() {
    return this.originalMimeType_;
  }


  /**
   * @override
   * @export
   */
  transmux(data) {
    goog.asserts.assert(this.muxTransmuxer_,
        'mux.js should be available.');
    goog.asserts.assert(!this.isTransmuxing_,
        'No transmuxing should be in progress.');
    this.isTransmuxing_ = true;
    this.transmuxPromise_ = new shaka.util.PublicPromise();
    this.transmuxedData_ = [];

    const dataArray = shaka.util.BufferUtils.toUint8(data);
    this.muxTransmuxer_.push(dataArray);
    this.muxTransmuxer_.flush();

    // Workaround for https://bit.ly/Shaka1449 mux.js not
    // emitting 'data' and 'done' events.
    // mux.js code is synchronous, so if onTransmuxDone_ has
    // not been called by now, it's not going to be.
    // Treat it as a transmuxing failure and reject the promise.
    if (this.isTransmuxing_) {
      this.transmuxPromise_.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED));
    }
    return this.transmuxPromise_;
  }

  /**
   * Handles the 'data' event of the transmuxer.
   * Extracts the cues from the transmuxed segment, and adds them to an array.
   * Stores the transmuxed data in another array, to pass it back to
   * MediaSourceEngine, and append to the source buffer.
   *
   * @param {muxjs.mp4.Transmuxer.Segment} segment
   * @private
   */
  onTransmuxed_(segment) {
    this.transmuxedData_.push(
        shaka.util.Uint8ArrayUtils.concat(segment.initSegment, segment.data));
  }


  /**
   * Handles the 'done' event of the transmuxer.
   * Resolves the transmux Promise, and returns the transmuxed data.
   * @private
   */
  onTransmuxDone_() {
    const data = shaka.util.Uint8ArrayUtils.concat(...this.transmuxedData_);
    this.transmuxPromise_.resolve(data);
    this.isTransmuxing_ = false;
  }
};

shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'audio/aac',
    () => new shaka.transmuxer.MuxjsTransmuxer('audio/aac'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'video/mp2t',
    () => new shaka.transmuxer.MuxjsTransmuxer('video/mp2t'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
