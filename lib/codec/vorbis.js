/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.codec.Vorbis');


/**
 * Vorbis utils.
 *
 * A Vorbis packet has no duration of its own: the audio that a packet adds
 * depends on the sizes of its window and of the window before it, and the
 * window size depends on the mode that the packet says it uses.  This reads
 * what is needed to know those sizes.
 *
 * @see https://xiph.org/vorbis/doc/Vorbis_I_spec.html
 */
shaka.codec.Vorbis = class {
  /**
   * Reads the window sizes and the modes from the headers of a stream.
   *
   * @param {!Uint8Array} codecPrivate The three headers (identification,
   *   comment and setup) with the Xiph lacing that Matroska uses: the number
   *   of headers minus one, the sizes of all but the last, and the headers.
   * @return {?shaka.codec.Vorbis.Info}
   */
  static parseHeaders(codecPrivate) {
    const Vorbis = shaka.codec.Vorbis;
    const headers = Vorbis.splitHeaders_(codecPrivate);
    if (!headers) {
      return null;
    }
    const [identification, , setup] = headers;
    // The identification header: the packet type (1), 'vorbis', the version,
    // the channels, the rate, three bitrates and the block sizes.
    if (identification.length <= Vorbis.BLOCK_SIZES_OFFSET_ ||
        identification[0] != Vorbis.PACKET_TYPE_IDENTIFICATION_) {
      return null;
    }
    const sizes = identification[Vorbis.BLOCK_SIZES_OFFSET_];
    // Two exponents of 2: the small window in the low nibble, the large in the
    // high one.
    const blockSizes = [1 << (sizes & 0x0f), 1 << (sizes >> 4)];

    const modes = Vorbis.parseModes_(setup);
    if (!modes) {
      return null;
    }
    // The bits that write the mode of a packet: those that hold the largest
    // number of a mode.
    const modeBits = modes.length > 1 ?
        32 - Math.clz32(modes.length - 1) : 0;
    return {blockSizes, modeBlockFlags: modes, modeBits};
  }

  /**
   * Gets the size of the window of an audio packet.
   *
   * @param {shaka.codec.Vorbis.Info} info
   * @param {!Uint8Array} packet
   * @return {number} The size in samples, or 0 if the packet is not audio.
   */
  static getWindowSize(info, packet) {
    // The first bit says whether it is audio (0) or a header (1).
    if (!packet.length || (packet[0] & 1)) {
      return 0;
    }
    // Then the number of the mode, least significant bit first.
    let mode = 0;
    for (let i = 0; i < info.modeBits; i++) {
      const bit = 1 + i;
      mode |= ((packet[bit >> 3] >> (bit & 7)) & 1) << i;
    }
    const blockFlag = info.modeBlockFlags[mode];
    return blockFlag == null ? 0 : info.blockSizes[blockFlag];
  }

  /**
   * Gets the samples between the start of a packet and the start of the next:
   * a quarter of each of their windows, as consecutive windows overlap by half
   * of the smaller one.
   *
   * @param {number} windowSize
   * @param {number} nextWindowSize
   * @return {number}
   */
  static getAdvance(windowSize, nextWindowSize) {
    return (windowSize + nextWindowSize) / 4;
  }

  /**
   * @param {!Uint8Array} codecPrivate
   * @return {?Array<!Uint8Array>} The headers, or null if it is not what a
   *   Matroska track writes.
   * @private
   */
  static splitHeaders_(codecPrivate) {
    const Vorbis = shaka.codec.Vorbis;
    if (codecPrivate.length < 1 ||
        codecPrivate[0] != Vorbis.HEADER_COUNT_MINUS_ONE_) {
      return null;
    }
    let offset = 1;
    const sizes = [];
    for (let i = 0; i < Vorbis.HEADER_COUNT_MINUS_ONE_; i++) {
      let size = 0;
      let part;
      do {
        if (offset >= codecPrivate.length) {
          return null;
        }
        part = codecPrivate[offset++];
        size += part;
      } while (part == Vorbis.XIPH_RUN_CONTINUES_);
      sizes.push(size);
    }
    const headers = [];
    for (const size of sizes) {
      if (offset + size > codecPrivate.length) {
        return null;
      }
      headers.push(codecPrivate.subarray(offset, offset + size));
      offset += size;
    }
    headers.push(codecPrivate.subarray(offset));
    return headers;
  }

  /**
   * Finds the modes at the end of the setup header.  Every mode is 41 bits (a
   * block flag, a window type and a transform type that are 0, and a mapping),
   * and they are followed only by the framing bit, so they can be found from
   * the end, without decoding the codebooks, floors and residues that come
   * before them.
   *
   * @param {!Uint8Array} setup
   * @return {?Array<number>} The block flag of each mode.
   * @private
   */
  static parseModes_(setup) {
    const Vorbis = shaka.codec.Vorbis;
    // Bits are numbered from the least significant bit of the first byte.
    const readBits = (position, count) => {
      let value = 0;
      for (let i = 0; i < count; i++) {
        const bit = position + i;
        value += ((setup[bit >> 3] >> (bit & 7)) & 1) * Math.pow(2, i);
      }
      return value;
    };

    // The framing bit is the last bit that is set: zeros pad the last byte.
    let last = setup.length - 1;
    while (last >= 0 && setup[last] == 0) {
      last--;
    }
    if (last < 0) {
      return null;
    }
    const framingBit = last * 8 + (31 - Math.clz32(setup[last]));

    // How many modes fit before the framing bit and look like modes.
    let candidates = 0;
    while (candidates < Vorbis.MAX_MODES_) {
      const start = framingBit - Vorbis.MODE_BITS_ * (candidates + 1);
      if (start - Vorbis.MODE_COUNT_BITS_ < 0) {
        break;
      }
      // The window type and the transform type are 0 (16 bits each).
      if (readBits(start + 1, 32) != 0) {
        break;
      }
      candidates++;
    }
    // The number of modes, minus one, is written before the first one.
    for (let count = candidates; count >= 1; count--) {
      const start = framingBit - Vorbis.MODE_BITS_ * count;
      if (readBits(start - Vorbis.MODE_COUNT_BITS_, Vorbis.MODE_COUNT_BITS_) +
          1 == count) {
        const flags = [];
        for (let i = 0; i < count; i++) {
          flags.push(readBits(start + Vorbis.MODE_BITS_ * i, 1));
        }
        return flags;
      }
    }
    return null;
  }
};


/**
 * @typedef {{
 *   blockSizes: !Array<number>,
 *   modeBlockFlags: !Array<number>,
 *   modeBits: number,
 * }}
 *
 * @property {!Array<number>} blockSizes
 *   The size in samples of the small and of the large window.
 * @property {!Array<number>} modeBlockFlags
 *   For each mode, whether it uses the large window (1) or the small (0).
 * @property {number} modeBits
 *   The number of bits that write the mode in a packet.
 */
shaka.codec.Vorbis.Info;


/**
 * The number of headers in the codec configuration of Matroska, minus one: the
 * identification, the comment and the setup headers.
 * @private @const {number}
 */
shaka.codec.Vorbis.HEADER_COUNT_MINUS_ONE_ = 2;

/**
 * In Xiph lacing a byte of 255 means that the size goes on in the next byte.
 * @private @const {number}
 */
shaka.codec.Vorbis.XIPH_RUN_CONTINUES_ = 255;

/**
 * The type of an identification header packet.
 * @private @const {number}
 */
shaka.codec.Vorbis.PACKET_TYPE_IDENTIFICATION_ = 1;

/**
 * Offset of the block sizes in the identification header: the packet type, the
 * 6 bytes of 'vorbis', the version (4), the channels (1), the sample rate (4)
 * and the three bitrates (12).
 * @private @const {number}
 */
shaka.codec.Vorbis.BLOCK_SIZES_OFFSET_ = 28;

/**
 * The size of a mode: block flag (1 bit), window type (16), transform type
 * (16) and mapping (8).
 * @private @const {number}
 */
shaka.codec.Vorbis.MODE_BITS_ = 41;

/**
 * The size of the field that holds the number of modes, minus one.
 * @private @const {number}
 */
shaka.codec.Vorbis.MODE_COUNT_BITS_ = 6;

/**
 * The most modes a stream can have, as the count is 6 bits.
 * @private @const {number}
 */
shaka.codec.Vorbis.MAX_MODES_ = 64;
