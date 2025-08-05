/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Mp4BoxParsers');

goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Uint8ArrayUtils');

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
    let sampleDescriptionIndex = null;

    const trackId = reader.readUint32(); // Read "track_ID"

    // Read "base_data_offset" if present.
    if (flags & 0x000001) {
      baseDataOffset = reader.readUint64();
    }

    // Read "sample_description_index" if present.
    if (flags & 0x000002) {
      sampleDescriptionIndex = reader.readUint32();
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
      sampleDescriptionIndex,
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
   * Parses a TFDT Box, with a loss of precision beyond 53 bits.
   * Use only when exact integers are not required, e.g. when
   * dividing by the timescale.
   *
   * @param {!shaka.util.DataViewReader} reader
   * @param {number} version
   * @return {!shaka.util.ParsedTFDTBox}
   */
  static parseTFDTInaccurate(reader, version) {
    if (version == 1) {
      const high = reader.readUint32();
      const low = reader.readUint32();
      return {
        baseMediaDecodeTime: (high * Math.pow(2, 32)) + low,
      };
    } else {
      return {
        baseMediaDecodeTime: reader.readUint32(),
      };
    }
  }

  /**
   * Parses a PRFT Box, with a loss of precision beyond 53 bits.
   * Use only when exact integers are not required, e.g. when
   * dividing by the timescale.
   *
   * @param {!shaka.util.DataViewReader} reader
   * @param {number} version
   * @return {!shaka.util.ParsedPRFTBox}
   */
  static parsePRFTInaccurate(reader, version) {
    reader.readUint32(); // Ignore referenceTrackId
    const ntpTimestampSec = reader.readUint32();
    const ntpTimestampFrac = reader.readUint32();
    const ntpTimestamp = ntpTimestampSec * 1000 +
        ntpTimestampFrac / 2**32 * 1000;

    let mediaTime;
    if (version === 0) {
      mediaTime = reader.readUint32();
    } else {
      const high = reader.readUint32();
      const low = reader.readUint32();
      mediaTime = (high * Math.pow(2, 32)) + low;
    }
    return {
      mediaTime,
      ntpTimestamp,
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
      dataOffset = reader.readInt32();
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
   * Parses an visual sample entry box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.util.ParsedVisualSampleEntryBox}
   */
  static visualSampleEntry(reader) {
    // Skip 6 reserved bytes.
    // Skip 2-byte data reference index.
    // Skip 16 more reserved bytes.
    reader.skip(24);
    // 4 bytes for width/height.
    const width = reader.readUint16();
    const height = reader.readUint16();
    // Skip 8 bytes for horizontal/vertical resolution.
    // Skip 4 more reserved bytes (0)
    // Skip 2-byte frame count.
    // Skip 32-byte compressor name (length byte, then name, then 0-padding).
    // Skip 2-byte depth.
    // Skip 2 more reserved bytes (0xff)
    reader.skip(50);

    return {
      width: width,
      height: height,
    };
  }


  /**
   * Parses an audio sample entry box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.util.ParsedAudioSampleEntryBox}
   */
  static audioSampleEntry(reader) {
    reader.skip(6); // Skip "reserved"
    reader.skip(2); // Skip "data_reference_index"
    reader.skip(8); // Skip "reserved"
    const channelCount = reader.readUint16();
    reader.skip(2); // Skip "sample_size"
    reader.skip(2); // Skip "pre_defined"
    reader.skip(2); // Skip "reserved"
    const sampleRate = reader.readUint16() + (reader.readUint16() / 65536);

    return {
      channelCount,
      sampleRate,
    };
  }

  /**
   * Parses a ESDS box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.util.ParsedESDSBox}
   */
  static parseESDS(reader) {
    let codec = 'mp4a';
    let tag;
    let oti;
    while (reader.hasMoreData()) {
      tag = reader.readUint8();
      let byteRead = reader.readUint8();
      while (byteRead & 0x80) {
        byteRead = reader.readUint8();
      }
      if (tag == 0x03) {
        reader.readUint16();
        const flags = reader.readUint8();
        if (flags & 0x80) {
          reader.readUint16();
        }
        if (flags & 0x40) {
          reader.skip(reader.readUint8());
        }
        if (flags & 0x20) {
          reader.readUint16();
        }
      } else if (tag == 0x04) {
        oti = reader.readUint8();
        reader.skip(12);
      } else if (tag == 0x05) {
        break;
      }
    }
    if (oti) {
      codec += '.' + shaka.util.Mp4BoxParsers.toHex_(oti);
      if (tag == 0x05 && reader.hasMoreData()) {
        const firstData = reader.readUint8();
        let audioObjectType = (firstData & 0xF8) >> 3;
        if (audioObjectType === 31 && reader.hasMoreData()) {
          audioObjectType = 32 + ((firstData & 0x7) << 3) +
              ((reader.readUint8() & 0xE0) >> 5);
        }
        codec += '.' + audioObjectType;
      }
    }
    return {codec};
  }

  /**
   * Parses a AVCC box.
   * @param {string} codecBase
   * @param {!shaka.util.DataViewReader} reader
   * @param {string} boxName
   * @return {!shaka.util.ParsedAVCCBox}
   */
  static parseAVCC(codecBase, reader, boxName) {
    const Mp4BoxParsers = shaka.util.Mp4BoxParsers;
    reader.skip(1); // Skip "configurationVersion"
    const codec = codecBase + '.' +
        Mp4BoxParsers.toHex_(reader.readUint8()) +
        Mp4BoxParsers.toHex_(reader.readUint8()) +
        Mp4BoxParsers.toHex_(reader.readUint8());
    return {codec};
  }

  /**
   * Parses a HVCC box.
   * @param {string} codecBase
   * @param {!shaka.util.DataViewReader} reader
   * @param {string} boxName
   * @return {!shaka.util.ParsedHVCCBox}
   */
  static parseHVCC(codecBase, reader, boxName) {
    const Mp4BoxParsers = shaka.util.Mp4BoxParsers;
    reader.skip(1); // Skip "configurationVersion"
    const profileByte = reader.readUint8();
    const profileSpace = ['', 'A', 'B', 'C'][profileByte >> 6];
    const generalProfileIdc = profileByte & 0x1f;
    const profileCompat = reader.readUint32();
    const tierFlag = (profileByte & 0x20) >> 5 ? 'H' : 'L';
    const constraintIndicator = [
      reader.readUint8(),
      reader.readUint8(),
      reader.readUint8(),
      reader.readUint8(),
      reader.readUint8(),
      reader.readUint8(),
    ];
    const levelIDC = reader.readUint8();
    let codec = codecBase;
    codec += '.' + profileSpace + generalProfileIdc;
    codec += '.' + Mp4BoxParsers.toHex_(
        Mp4BoxParsers.reverseBits_(profileCompat),
        /* removeInitialZero= */ true);
    codec += '.' + tierFlag + levelIDC;
    let constraintString = '';
    for (let i = constraintIndicator.length; i--; ) {
      const byte = constraintIndicator[i];
      if (byte || constraintString) {
        const encodedByte = byte.toString(16).toUpperCase();
        constraintString = '.' + encodedByte + constraintString;
      }
    }
    codec += constraintString;

    return {codec};
  }

  /**
   * Parses a DVCC box.
   * @param {string} codecBase
   * @param {!shaka.util.DataViewReader} reader
   * @param {string} boxName
   * @return {!shaka.util.ParsedDVCCBox}
   */
  static parseDVCC(codecBase, reader, boxName) {
    const Mp4BoxParsers = shaka.util.Mp4BoxParsers;
    reader.skip(2); // Skip "dv_version_major" and "dv_version_minor"
    const thirdByte = reader.readUint8();
    const fourthByte = reader.readUint8();
    const profile = (thirdByte >> 1) & 0x7f;
    const level = ((thirdByte << 5) & 0x20) | ((fourthByte >> 3) & 0x1f);
    const codec = codecBase + '.' +
        Mp4BoxParsers.addLeadingZero_(profile) + '.' +
        Mp4BoxParsers.addLeadingZero_(level);

    return {codec};
  }

  /**
   * Parses a DVVC box.
   * @param {string} codecBase
   * @param {!shaka.util.DataViewReader} reader
   * @param {string} boxName
   * @return {!shaka.util.ParsedDVVCBox}
   */
  static parseDVVC(codecBase, reader, boxName) {
    const Mp4BoxParsers = shaka.util.Mp4BoxParsers;
    reader.skip(2); // Skip "dv_version_major" and "dv_version_minor"
    const thirdByte = reader.readUint8();
    const fourthByte = reader.readUint8();
    const profile = (thirdByte >> 1) & 0x7f;
    const level = ((thirdByte << 5) & 0x20) | ((fourthByte >> 3) & 0x1f);
    const codec = codecBase + '.' +
        Mp4BoxParsers.addLeadingZero_(profile) + '.' +
        Mp4BoxParsers.addLeadingZero_(level);

    return {codec};
  }

  /**
   * Parses a VPCC box.
   * @param {string} codecBase
   * @param {!shaka.util.DataViewReader} reader
   * @param {string} boxName
   * @return {!shaka.util.ParsedVPCCBox}
   */
  static parseVPCC(codecBase, reader, boxName) {
    const Mp4BoxParsers = shaka.util.Mp4BoxParsers;
    const profile = reader.readUint8();
    const level = reader.readUint8();
    const bitDepth = (reader.readUint8() >> 4) & 0x0f;
    const codec = codecBase + '.' +
      Mp4BoxParsers.addLeadingZero_(profile) + '.' +
      Mp4BoxParsers.addLeadingZero_(level) + '.' +
      Mp4BoxParsers.addLeadingZero_(bitDepth);

    return {codec};
  }

  /**
   * Parses a AV1C box.
   * @param {string} codecBase
   * @param {!shaka.util.DataViewReader} reader
   * @param {string} boxName
   * @return {!shaka.util.ParsedAV1CBox}
   */
  static parseAV1C(codecBase, reader, boxName) {
    const Mp4BoxParsers = shaka.util.Mp4BoxParsers;
    // More info https://aomediacodec.github.io/av1-isobmff/#av1codecconfigurationbox-syntax
    reader.skip(1); // Skip "marker" and "version"
    const secondByte = reader.readUint8();
    const thirdByte = reader.readUint8();
    const profile = secondByte >>> 5;
    const level = secondByte & 0x1f;
    const tierFlag = thirdByte >>> 7 ? 'H' : 'M';
    const highBitDepth = (thirdByte & 0x40) >> 6;
    const twelveBit = (thirdByte & 0x20) >> 5;
    const bitDepth = profile === 2 && highBitDepth ?
        (twelveBit ? 12 : 10) : (highBitDepth ? 10 : 8);
    const monochrome = (thirdByte & 0x10) >> 4;
    const chromaSubsamplingX = (thirdByte & 0x08) >> 3;
    const chromaSubsamplingY = (thirdByte & 0x04) >> 2;
    const chromaSamplePosition = thirdByte & 0x03;
    // TODO: parse color_description_present_flag
    // default it to BT.709/limited range for now
    const colorPrimaries = 1;
    const transferCharacteristics = 1;
    const matrixCoefficients = 1;
    const videoFullRangeFlag = 0;
    const codec = codecBase + '.' + profile +
      '.' + Mp4BoxParsers.addLeadingZero_(level) + tierFlag +
      '.' + Mp4BoxParsers.addLeadingZero_(bitDepth) +
      '.' + monochrome +
      '.' + chromaSubsamplingX + chromaSubsamplingY + chromaSamplePosition +
      '.' + Mp4BoxParsers.addLeadingZero_(colorPrimaries) +
      '.' + Mp4BoxParsers.addLeadingZero_(transferCharacteristics) +
      '.' + Mp4BoxParsers.addLeadingZero_(matrixCoefficients) +
      '.' + videoFullRangeFlag;

    return {codec};
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

  /**
   * Parses a TENC box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.util.ParsedTENCBox}
   */
  static parseTENC(reader) {
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    reader.readUint8(); // reserved
    reader.readUint8();
    reader.readUint8(); // default_isProtected
    reader.readUint8(); // default_Per_Sample_IV_Size
    const defaultKID = Uint8ArrayUtils.toHex(reader.readBytes(16));
    return {defaultKID};
  }

  /**
   * Parses a HDLR box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.util.ParsedHDLRBox}
   */
  static parseHDLR(reader) {
    reader.skip(8); // Skip "pre_defined"

    const handlerType = reader.readTerminatedString();
    return {handlerType};
  }

  /**
   * Parses a PRJI box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.util.ParsedPRJIBox}
   */
  static parsePRJI(reader) {
    const projection = reader.readTerminatedString();
    return {projection};
  }

  /**
   * Parses a HFOV box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.util.ParsedHFOVBox}
   */
  static parseHFOV(reader) {
    const millidegrees = reader.readUint32();

    return {
      hfov: millidegrees / 1000,
    };
  }

  /**
   * Parses a COLR box.
   * @param {!shaka.util.DataViewReader} reader
   * @return {!shaka.util.ParsedCOLRBox}
   */
  static parseCOLR(reader) {
    let colorGamut = null;
    let videoRange = null;
    const data = reader.readBytes(4);
    let colorType = '';
    colorType += String.fromCharCode(data[0]);
    colorType += String.fromCharCode(data[1]);
    colorType += String.fromCharCode(data[2]);
    colorType += String.fromCharCode(data[3]);
    if (colorType === 'nclx') {
      const colorPrimaries = reader.readUint16();
      switch (colorPrimaries) {
        case 1:
        case 5:
        case 6:
        case 7:
          colorGamut = 'srgb';
          break;
        case 9:
          colorGamut = 'rec2020';
          break;
        case 11:
        case 12:
          colorGamut = 'p3';
          break;
      }
      const transferCharacteristics = reader.readUint16();
      reader.readUint16(); // matrix_coefficients
      switch (transferCharacteristics) {
        case 1:
        case 6:
        case 13:
        case 14:
        case 15:
          videoRange = 'SDR';
          break;
        case 16:
          videoRange = 'PQ';
          break;
        case 18:
          videoRange = 'HLG';
          break;
      }
    }
    return {
      colorGamut,
      videoRange,
    };
  }

  /**
   * Parses AV1 codec string with COLR box information.
   *
   * AV1 codec info: https://aomediacodec.github.io/av1-isobmff/#codecsparam
   *
   * @param {string} codec
   * @param {!shaka.util.DataViewReader} reader
   * @return {string}
   */
  static updateAV1CodecWithCOLRBox(codec, reader) {
    const Mp4BoxParsers = shaka.util.Mp4BoxParsers;
    const initialPosition = reader.getPosition();
    const data = reader.readBytes(4);
    let colorType = '';
    colorType += String.fromCharCode(data[0]);
    colorType += String.fromCharCode(data[1]);
    colorType += String.fromCharCode(data[2]);
    colorType += String.fromCharCode(data[3]);
    if (colorType === 'nclx') {
      const colorPrimaries = reader.readUint16();
      const transferCharacteristics = reader.readUint16();
      const matrixCoefficients = reader.readUint16();
      const videoFullRangeFlag = reader.readUint8() >> 7;
      const codecParts = codec.split('.');
      if (codecParts.length == 10) {
        codecParts[6] = Mp4BoxParsers.addLeadingZero_(colorPrimaries);
        codecParts[7] = Mp4BoxParsers.addLeadingZero_(transferCharacteristics);
        codecParts[8] = Mp4BoxParsers.addLeadingZero_(matrixCoefficients);
        codecParts[9] = String(videoFullRangeFlag);
        codec = codecParts.join('.');
      }
    }
    reader.seek(initialPosition);
    return codec;
  }

  /**
   * Convert a number to hex
   * @param {number} x
   * @param {boolean=} removeInitialZero
   * @return {string}
   * @private
   */
  static toHex_(x, removeInitialZero = false) {
    const value = x.toString(16).toUpperCase();
    if (removeInitialZero) {
      return value;
    }
    return ('0' + value).slice(-2);
  }

  /**
   * Reverse a number bit to bit
   * @param {number} x
   * @return {number}
   * @private
   */
  static reverseBits_(x) {
    let val = x;
    let reversed = 0;
    for (let i = 0; i < 32; i++) {
      reversed |= val & 1;
      if (i == 31) {
        break;
      }
      reversed <<= 1;
      val >>= 1;
    }
    return reversed;
  }

  /**
   *
   * @param {number} x
   * @return {string}
   * @private
   */
  static addLeadingZero_(x) {
    return (x < 10 ? '0' : '') + x;
  }
};


/**
 * @typedef {{
 *   trackId: number,
 *   defaultSampleDuration: ?number,
 *   defaultSampleSize: ?number,
 *   baseDataOffset: ?number,
 *   sampleDescriptionIndex: ?number,
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
 * @property {?number} sampleDescriptionIndex
 *   If specified via flags, this indicate the sample description index
 * @exportDoc
 */
shaka.util.ParsedTFHDBox;

/**
 * @typedef {{
 *   baseMediaDecodeTime: number,
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
 *   mediaTime: number,
 *   ntpTimestamp: number,
 * }}
 *
 * @exportDoc
 */
shaka.util.ParsedPRFTBox;

/**
 * @typedef {{
 *   timescale: number,
 *   language: string,
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
 *   defaultSampleDuration: number,
 *   defaultSampleSize: number,
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
 *   sampleCount: number,
 *   sampleData: !Array<shaka.util.ParsedTRUNSample>,
 *   dataOffset: ?number,
 * }}
 *
 * @property {number} sampleCount
 *   As per the spec: the number of samples being added in this run;
 * @property {!Array<shaka.util.ParsedTRUNSample>} sampleData
 *   An array of size <sampleCount> containing data for each sample
 * @property {?number} dataOffset
 *   If specified via flags, this indicate the offset of the sample in bytes.
 *
 * @exportDoc
 */
shaka.util.ParsedTRUNBox;

/**
 * @typedef {{
 *   sampleDuration: ?number,
 *   sampleSize: ?number,
 *   sampleCompositionTimeOffset: ?number,
 * }}
 *
 * @property {?number} sampleDuration
 *   The length of the sample in timescale units.
 * @property {?number} sampleSize
 *   The size of the sample in bytes.
 * @property {?number} sampleCompositionTimeOffset
 *   The time since the start of the sample in timescale units. Time
 *   offset is based of the start of the sample. If this value is
 *   missing, the accumulated durations preceding this time sample will
 *   be used to create the start time.
 *
 * @exportDoc
 */
shaka.util.ParsedTRUNSample;

/**
 * @typedef {{
 *   trackId: number,
 *   width: number,
 *   height: number,
 * }}
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
 *   codec: string,
 * }}
 *
 * @property {string} codec
 *   A fourcc for a codec
 *
 * @exportDoc
 */
shaka.util.ParsedFRMABox;

/**
 * @typedef {{
 *   defaultKID: string,
 * }}
 *
 * @property {string} defaultKID
 *
 * @exportDoc
 */
shaka.util.ParsedTENCBox;

/**
 * @typedef {{
 *   width: number,
 *   height: number,
 * }}
 *
 * @property {number} width
 * @property {number} height
 *
 * @exportDoc
 */
shaka.util.ParsedVisualSampleEntryBox;

/**
 * @typedef {{
 *   channelCount: number,
 *   sampleRate: number,
 * }}
 *
 * @property {number} channelCount
 * @property {number} sampleRate
 *
 * @exportDoc
 */
shaka.util.ParsedAudioSampleEntryBox;

/**
 * @typedef {{
 *   codec: string,
 * }}
 *
 * @property {string} codec
 *
 * @exportDoc
 */
shaka.util.ParsedESDSBox;

/**
 * @typedef {{
 *   codec: string,
 * }}
 *
 * @property {string} codec
 *
 * @exportDoc
 */
shaka.util.ParsedAVCCBox;

/**
 * @typedef {{
 *   codec: string,
 * }}
 *
 * @property {string} codec
 *
 * @exportDoc
 */
shaka.util.ParsedHVCCBox;

/**
 * @typedef {{
 *   codec: string,
 * }}
 *
 * @property {string} codec
 *
 * @exportDoc
 */
shaka.util.ParsedDVCCBox;

/**
 * @typedef {{
 *   codec: string,
 * }}
 *
 * @property {string} codec
 *
 * @exportDoc
 */
shaka.util.ParsedDVVCBox;

/**
 * @typedef {{
 *   codec: string,
 * }}
 *
 * @property {string} codec
 *
 * @exportDoc
 */
shaka.util.ParsedVPCCBox;

/**
 * @typedef {{
 *   codec: string,
 * }}
 *
 * @property {string} codec
 *
 * @exportDoc
 */
shaka.util.ParsedAV1CBox;

/**
 * @typedef {{
 *   handlerType: string,
 * }}
 *
 * @property {string} handlerType
 *   A four-character code that identifies the type of the media handler or
 *   data handler. For media handlers, this field defines the type of
 *   data—for example, 'vide' for video data, 'soun' for sound data.
 *
 * @exportDoc
 */
shaka.util.ParsedHDLRBox;

/**
 * @typedef {{
 *   projection: string,
 * }}
 *
 * @property {string} projection
 *   A four-character code that identifies the type of the projection.
 *   Possible values:
 *    - Rectangular: ‘rect’
 *    - Half equirectangular: ‘hequ’
 *    - Equirectangular: ?
 *    - Fisheye: ‘fish’
 *
 * @exportDoc
 */
shaka.util.ParsedPRJIBox;

/**
 * @typedef {{
 *   hfov: number,
 * }}
 *
 * @property {number} hfov
 *
 * @exportDoc
 */
shaka.util.ParsedHFOVBox;

/**
 * @typedef {{
 *   colorGamut: ?string,
 *   videoRange: ?string,
 * }}
 *
 * @property {?string} colorGamut
 * @property {?string} videoRange
 *
 * @exportDoc
 */
shaka.util.ParsedCOLRBox;
