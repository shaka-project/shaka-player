/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.codec.DolbyVision');


/**
 * Dolby Vision utils.
 *
 * A Dolby Vision stream is a stream of another codec (HEVC, AVC, AV1) with the
 * dynamic metadata in it, and a configuration record that says which profile
 * it uses.  In MP4 the record goes into the sample entry, whose name is
 * changed to the Dolby Vision one, so that the platforms that decode Dolby
 * Vision can tell it from the plain stream.
 *
 * @see https://professionalsupport.dolby.com/s/article/Dolby-Vision-Streams-Within-the-ISO-Base-Media-File-Format
 */
shaka.codec.DolbyVision = class {
  /**
   * Reads a DOVIDecoderConfigurationRecord (the payload of dvcC and dvvC).
   *
   * @param {!Uint8Array} record
   * @return {?shaka.codec.DolbyVision.Config}
   */
  static parseConfig(record) {
    const DolbyVision = shaka.codec.DolbyVision;
    if (record.length < DolbyVision.MIN_RECORD_SIZE_) {
      return null;
    }
    // Bytes 0 and 1 are the version.  Then the profile (7 bits), the level
    // (6), and the flags of which layers and metadata there are (3).
    return {
      profile: record[2] >> 1,
      level: ((record[2] & 0x01) << 5) | (record[3] >> 3),
      rpuPresent: !!(record[3] & 0x04),
      elPresent: !!(record[3] & 0x02),
      blPresent: !!(record[3] & 0x01),
      blSignalCompatibilityId: record[4] >> 4,
    };
  }

  /**
   * Gets the name of the box that holds the record: dvcC for the profiles up
   * to 7, and dvvC for the newer ones.
   *
   * @param {shaka.codec.DolbyVision.Config} config
   * @return {string}
   */
  static getBoxName(config) {
    return config.profile > shaka.codec.DolbyVision.LAST_DVCC_PROFILE_ ?
        'dvvC' : 'dvcC';
  }

  /**
   * Gets the RFC 6381 codec string.
   *
   * @param {string} entryName The sample entry: 'dvh1' (HEVC), 'dva1' (AVC) or
   *   'dav1' (AV1).
   * @param {shaka.codec.DolbyVision.Config} config
   * @return {string}
   */
  static getCodecs(entryName, config) {
    const pad = (value) => String(value).padStart(2, '0');
    return entryName + '.' + pad(config.profile) + '.' + pad(config.level);
  }

  /**
   * Tells whether the stream plays as its base codec, HDR10 or SDR, on a
   * platform that does not decode Dolby Vision.  Profile 5 does not: its
   * colors only make sense with the Dolby Vision metadata.
   *
   * @param {shaka.codec.DolbyVision.Config} config
   * @return {boolean}
   */
  static hasCompatibleBase(config) {
    return config.blSignalCompatibilityId != 0;
  }

  /**
   * Gets the name of the sample entry that a codec string asks for, if it is
   * one of Dolby Vision.
   *
   * @param {string} codecs
   * @return {?string}
   */
  static getEntryName(codecs) {
    const entry = codecs.split('.')[0].toLowerCase();
    return shaka.codec.DolbyVision.ENTRY_NAMES_.includes(entry) ? entry : null;
  }
};


/**
 * @typedef {{
 *   profile: number,
 *   level: number,
 *   rpuPresent: boolean,
 *   elPresent: boolean,
 *   blPresent: boolean,
 *   blSignalCompatibilityId: number,
 * }}
 *
 * @property {number} profile
 * @property {number} level
 * @property {boolean} rpuPresent
 *   Whether the frames carry the dynamic metadata (the RPU).
 * @property {boolean} elPresent
 *   Whether there is an enhancement layer.
 * @property {boolean} blPresent
 *   Whether there is a base layer.
 * @property {number} blSignalCompatibilityId
 *   What the base layer is compatible with: 0 nothing (profile 5), 1 HDR10,
 *   2 SDR, 4 HLG.
 */
shaka.codec.DolbyVision.Config;


/**
 * The size of the fields of a record that are read: the version, the profile
 * and level, the flags and the compatibility.
 * @private @const {number}
 */
shaka.codec.DolbyVision.MIN_RECORD_SIZE_ = 5;

/**
 * The last profile that is signaled in a dvcC box.
 * @private @const {number}
 */
shaka.codec.DolbyVision.LAST_DVCC_PROFILE_ = 7;

/**
 * The sample entries of Dolby Vision that are written, for HEVC, AVC and AV1.
 * @private @const {!Array<string>}
 */
shaka.codec.DolbyVision.ENTRY_NAMES_ = ['dvh1', 'dva1', 'dav1'];
