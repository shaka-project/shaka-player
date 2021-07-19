/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Mp4BoxParsers');

goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Functional');
goog.require('shaka.util.Iterables');

shaka.util.Mp4BoxParsers = class {
  /**
   * Parses a TFHD Box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {number} flags
   * @return {!shaka.util.ParsedTFHDBox}
   */
  static parseTFHD(reader, flags) {
    let defaultSampleDuration = null;
    let defaultSampleSize = null;

    const trackId = reader.readUint32(); // Read "track_ID"

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

    // Read "default_sample_size" if present.
    if (flags & 0x000010) {
      defaultSampleSize = reader.readUint32();
    }

    return {
      trackId,
      defaultSampleDuration,
      defaultSampleSize,
    };
  }

  /**
   * Parses a TFDT Box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {number} version
   * @return {!shaka.util.ParsedTFDTBox}
   */
  static parseTFDT(reader, version) {
    const baseMediaDecodeTime = version == 1 ?
        reader.readUint64Ex(true) : reader.readUint32();

    if (typeof baseMediaDecodeTime === 'number') {
      return {
        baseMediaDecodeTime,
        baseMediaDecodeTimeEx: null,
      };
    } else {
      return {
        baseMediaDecodeTime: 0,
        baseMediaDecodeTimeEx: baseMediaDecodeTime,
      };
    }
  }

  /**
   * Parses a MDHD Box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {number} version
   * @return {!shaka.util.ParsedMDHDBox}
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

    return {
      timescale,
    };
  }

  /**
   * Parses a TREX Box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.util.ParsedTREXBox}
   */
  static parseTREX(reader) {
    reader.skip(4); // Skip "track_ID"
    reader.skip(4); // Skip "default_sample_description_index"
    const defaultSampleDuration = reader.readUint32();
    const defaultSampleSize = reader.readUint32();

    return {
      defaultSampleDuration,
      defaultSampleSize,
    };
  }

  /**
   * Parses a TRUN Box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {number} version
   * @param {number} flags
   * @return {!shaka.util.ParsedTRUNBox}
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
      /** @type {shaka.util.ParsedTRUNSample} */
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

    return {
      sampleCount,
      sampleData,
    };
  }

  /**
   * Parses a TKHD Box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {number} version
   * @return {!shaka.util.ParsedTKHDBox}
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

    return {
      trackId,
    };
  }
};


/**
 * @typedef {{
 *    trackId: number,
 *    defaultSampleDuration: ?number,
 *    defaultSampleSize: ?number
 * }}
 *
 * @property {number} trackId
 *   As per the spec: an integer that uniquely identifies this
 *   track over the entire life‐time of this presentation
 * @property {?number} defaultSampleDuration
 *   If specified via flags, this overrides the default sample
 *   duration in the Track Extends Box for this fragment
 * @property {?number} defaultSampleSize
 *   If specified via flags, this overrides the default sample
 *   size in the Track Extends Box for this fragment
 *
 * @exportDoc
 */
shaka.util.ParsedTFHDBox;

/**
 * @typedef {{
 *    baseMediaDecodeTime: number,
 *    baseMediaDecodeTimeEx: ?{high: number, low:number}
 * }}
 *
 * @property {number} baseMediaDecodeTime
 *   As per the spec: the absolute decode time, measured on the media
 *   timeline, of the first sample in decode order in the track fragment
 *
 * @property {?{high: number, low:number}} baseMediaDecodeTimeEx
 *   When baseMediaDecodeTime would exceed Number.MAX_SAFE_INTEGER, this field
 *   contains the full high and low 32-bit values of the 64-bit value. In
 *   this case, baseMediaDecodeTime will be set to 0.
 * @exportDoc
 */
shaka.util.ParsedTFDTBox;

/**
 * @typedef {{
 *    timescale: number
 * }}
 *
 * @property {number} timescale
 *   As per the spec: an integer that specifies the time‐scale for this media;
 *   this is the number of time units that pass in one second
 *
 * @exportDoc
 */
shaka.util.ParsedMDHDBox;

/**
 * @typedef {{
 *    defaultSampleDuration: number,
 *    defaultSampleSize: number
 * }}
 *
 * @property {number} defaultSampleDuration
 *   The default sample duration to be used in track fragments
 * @property {number} defaultSampleSize
 *   The default sample size to be used in track fragments
 *
 * @exportDoc
 */
shaka.util.ParsedTREXBox;

/**
 * @typedef {{
 *    sampleCount: number,
 *    sampleData: !Array.<shaka.util.ParsedTRUNSample>
 * }}
 *
 * @property {number} sampleCount
 *   As per the spec: the number of samples being added in this run;
 * @property {!Array.<shaka.util.ParsedTRUNSample>} sampleData
 *   An array of size <sampleCount> containing data for each sample
 *
 * @exportDoc
 */
shaka.util.ParsedTRUNBox;

/**
 * @typedef {{
 *    sampleDuration: ?number,
 *    sampleSize: ?number,
 *    sampleCompositionTimeOffset: ?number
 *  }}
 *
 * @property {?number} sampleDuration
 *   The length of the sample in timescale units.
 * @property {?number} sampleSize
 *   The size of the sample in bytes.
 * @property {?number} sampleCompositionTimeOffset
 *   The time since the start of the sample in timescale units. Time
 *   offset is based of the start of the sample. If this value is
 *   missing, the accumulated durations preceeding this time sample will
 *   be used to create the start time.
 *
 * @exportDoc
 */
shaka.util.ParsedTRUNSample;

/**
 * @typedef {{
 *    trackId: number
 *  }}
 *
 * @property {number} trackId
 *   Unique ID indicative of this track
 *
 * @exportDoc
 */
shaka.util.ParsedTKHDBox;
