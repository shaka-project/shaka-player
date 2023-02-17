/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Mp4BoxParsers');

goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Mp4Parser');

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
    let baseDataOffset = null;

    const trackId = reader.readUint32(); // Read "track_ID"

    // Skip "base_data_offset" if present.
    if (flags & 0x000001) {
      baseDataOffset = reader.readUint64();
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
      baseDataOffset,
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
        reader.readUint64() : reader.readUint32();

    return {
      baseMediaDecodeTime,
    };
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

    reader.skip(4); // Skip "duration"

    const language = reader.readUint16();

    // language is stored as an ISO-639-2/T code in an array of three
    // 5-bit fields each field is the packed difference between its ASCII
    // value and 0x60
    const languageString =
        String.fromCharCode((language >> 10) + 0x60) +
        String.fromCharCode(((language & 0x03c0) >> 5) + 0x60) +
        String.fromCharCode((language & 0x1f) + 0x60);

    return {
      timescale,
      language: languageString,
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
    let dataOffset = null;

    // "data_offset"
    if (flags & 0x000001) {
      dataOffset = reader.readUint32();
    }

    // Skip "first_sample_flags" if present.
    if (flags & 0x000004) {
      reader.skip(4);
    }

    for (let i = 0; i < sampleCount; i++) {
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
      dataOffset,
    };
  }

  /**
   * Parses a TKHD Box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {number} version
   * @return {!shaka.util.ParsedTKHDBox}
   */
  static parseTKHD(reader, version) {
    if (version == 1) {
      reader.skip(8); // Skip "creation_time"
      reader.skip(8); // Skip "modification_time"
    } else {
      reader.skip(4); // Skip "creation_time"
      reader.skip(4); // Skip "modification_time"
    }

    const trackId = reader.readUint32();

    if (version == 1) {
      reader.skip(8); // Skip "reserved"
    } else {
      reader.skip(4); // Skip "reserved"
    }
    reader.skip(4); // Skip "duration"
    reader.skip(8); // Skip "reserved"
    reader.skip(2); // Skip "layer"
    reader.skip(2); // Skip "alternate_group"
    reader.skip(2); // Skip "volume"
    reader.skip(2); // Skip "reserved"
    reader.skip(36); // Skip "matrix_structure"

    const width = reader.readUint16() + (reader.readUint16() / 16);
    const height = reader.readUint16() + (reader.readUint16() / 16);

    return {
      trackId,
      width,
      height,
    };
  }

  /**
   * Parses a MP4A box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.util.ParsedMP4ABox}
   */
  static parseMP4A(reader) {
    reader.skip(6); // Skip "reserved"
    reader.skip(2); // Skip "data_reference_index"
    reader.skip(8); // Skip "reserved"
    const channelCount = reader.readUint16();
    reader.skip(2); // Skip "samplesize"
    reader.skip(2); // Skip "pre_defined"
    reader.skip(2); // Skip "reserved"
    const sampleRate = reader.readUint16() + (reader.readUint16() / 65536);

    return {
      channelCount,
      sampleRate,
    };
  }

  /**
   * Parses a FRMA box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.util.ParsedFRMABox}
   */
  static parseFRMA(reader) {
    const fourcc = reader.readUint32();
    const codec = shaka.util.Mp4Parser.typeToString(fourcc);
    return {codec};
  }
};


/**
 * @typedef {{
 *    trackId: number,
 *    defaultSampleDuration: ?number,
 *    defaultSampleSize: ?number,
 *    baseDataOffset: ?number
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
 * @property {?number} baseDataOffset
 *   If specified via flags, this indicate the base data offset
 *
 * @exportDoc
 */
shaka.util.ParsedTFHDBox;

/**
 * @typedef {{
 *    baseMediaDecodeTime: number
 * }}
 *
 * @property {number} baseMediaDecodeTime
 *   As per the spec: the absolute decode time, measured on the media
 *   timeline, of the first sample in decode order in the track fragment
 *
 * @exportDoc
 */
shaka.util.ParsedTFDTBox;

/**
 * @typedef {{
 *    timescale: number,
 *    language: string
 * }}
 *
 * @property {number} timescale
 *   As per the spec: an integer that specifies the time‐scale for this media;
 *   this is the number of time units that pass in one second
 * @property {string} language
 *   Language code for this media
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
 *    sampleData: !Array.<shaka.util.ParsedTRUNSample>,
 *    dataOffset: ?number
 * }}
 *
 * @property {number} sampleCount
 *   As per the spec: the number of samples being added in this run;
 * @property {!Array.<shaka.util.ParsedTRUNSample>} sampleData
 *   An array of size <sampleCount> containing data for each sample
 * @property {?number} dataOffset
 *   If specified via flags, this indicate the offset of the sample in bytes.
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
 *    trackId: number,
 *    width: number,
 *    height: number
 *  }}
 *
 * @property {number} trackId
 *   Unique ID indicative of this track
 * @property {number} width
 *   Width of this track in pixels
 * @property {number} height
 *   Height of this track in pixels.
 *
 * @exportDoc
 */
shaka.util.ParsedTKHDBox;

/**
 * @typedef {{
 *    codec: string
 *  }}
 *
 * @property {string} codec
 *   A fourcc for a codec
 *
 * @exportDoc
 */
shaka.util.ParsedFRMABox;

/**
 * @typedef {{
 *    channelCount: number,
 *    sampleRate: number
 *  }}
 *
 * @property {number} channelCount
 * @property {number} sampleRate
 *
 * @exportDoc
 */
shaka.util.ParsedMP4ABox;
