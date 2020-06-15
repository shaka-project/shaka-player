/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Mp4BoxParsers');

goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Iterables');

shaka.util.Mp4BoxParsers = class {
  /**
   * Parses a TFHD Box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {!number} flags
   * @return {!shaka.extern.ParsedTFHDBox}
   */
  static parseTFHD(reader, flags) {
    let defaultSampleDuration = null;

    reader.skip(4); // Skip "track_ID"

    // Skip "base_data_offset" if present.
    if (flags & 0x000001) {
      reader.skip(8);
    }

    // Skip "sample_description_index" if present.
    if (flags & 0x000002) {
      reader.skip(4);
    }

    // Read "default_sample_duration" if present.
    if (flags & 0x000008) {
      defaultSampleDuration = reader.readUint32();
    }

    /** @type {!shaka.extern.ParsedTFHDBox} */
    const parsedTFHD = {
      defaultSampleDuration: defaultSampleDuration,
    };

    return parsedTFHD;
  }

  /**
   * Parses a TFDT Box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {!number} version
   * @return {!shaka.extern.ParsedTFDTBox}
   */
  static parseTFDT(reader, version) {
    const baseMediaDecodeTime = version == 1 ?
        reader.readUint64() : reader.readUint32();

    /** @type {!shaka.extern.ParsedTFDTBox} */
    const parsedTFDT = {
      baseMediaDecodeTime: baseMediaDecodeTime,
    };

    return parsedTFDT;
  }

  /**
   * Parses a MDHD Box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {!number} version
   * @return {!shaka.extern.ParsedMDHDBox}
   */
  static parseMDHD(reader, version) {
    if (version == 1) {
      reader.skip(8); // Skip "creation_time"
      reader.skip(8); // Skip "modification_time"
    } else {
      reader.skip(4); // Skip "creation_time"
      reader.skip(4); // Skip "modification_time"
    }

    const timescale = reader.readUint32();

    /** @type {!shaka.extern.ParsedMDHDBox} */
    const parsedMDHD = {
      timescale: timescale,
    };

    return parsedMDHD;
  }

  /**
   * Parses a TREX Box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.extern.ParsedTREXBox}
   */
  static parseTREX(reader) {
    reader.skip(4); // Skip "track_ID"
    reader.skip(4); // Skip "default_sample_description_index"
    const defaultSampleDuration = reader.readUint32();

    /** @type {!shaka.extern.ParsedTREXBox} */
    const parsedTREX = {
      defaultSampleDuration: defaultSampleDuration,
    };

    return parsedTREX;
  }

  /**
   * Parses a TRUN Box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {!number} version
   * @param {!number} flags
   * @return {!shaka.extern.ParsedTRUNBox}
   */
  static parseTRUN(reader, version, flags) {
    const sampleCount = reader.readUint32();
    const sampleData = [];

    // Skip "data_offset" if present.
    if (flags & 0x000001) {
      reader.skip(4);
    }

    // Skip "first_sample_flags" if present.
    if (flags & 0x000004) {
      reader.skip(4);
    }

    for (const _ of shaka.util.Iterables.range(sampleCount)) {
      shaka.util.Functional.ignored(_);
      /** @type {shaka.extern.TRUNSample} */
      const sample = {
        sampleDuration: null,
        sampleSize: null,
        sampleCompositionTimeOffset: null,
      };

      // Read "sample duration" if present.
      if (flags & 0x000100) {
        sample.sampleDuration = reader.readUint32();
      }

      // Read "sample_size" if present.
      if (flags & 0x000200) {
        sample.sampleSize = reader.readUint32();
      }

      // Skip "sample_flags" if present.
      if (flags & 0x000400) {
        reader.skip(4);
      }

      // Read "sample_time_offset" if present.
      if (flags & 0x000800) {
        sample.sampleCompositionTimeOffset = version == 0 ?
              reader.readUint32() :
              reader.readInt32();
      }

      sampleData.push(sample);
    }

    /** @type {!shaka.extern.ParsedTRUNBox} */
    const parsedTRUN = {
      sampleCount: sampleCount,
      sampleData: sampleData,
    };

    return parsedTRUN;
  }

  /**
   * Parses a TKHD Box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {!number} version
   * @return {!shaka.extern.ParsedTKHDBox}
   */
  static parseTKHD(reader, version) {
    let trackId = 0;
    if (version == 1) {
      reader.skip(8); // Skip "creation_time"
      reader.skip(8); // Skip "modification_time"
      trackId = reader.readUint64();
    } else {
      reader.skip(4); // Skip "creation_time"
      reader.skip(4); // Skip "modification_time"
      trackId = reader.readUint32();
    }

    /** @type {!shaka.extern.ParsedTKHDBox} */
    const parsedTKHD = {
      trackId: trackId,
    };
    return parsedTKHD;
  }
};
