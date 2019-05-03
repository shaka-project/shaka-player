/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.text.Mp4VttParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.text.Cue');
goog.require('shaka.text.TextEngine');
goog.require('shaka.text.VttTextParser');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TextParser');


/**
 * @struct
 * @constructor
 * @implements {shaka.extern.TextParser}
 */
shaka.text.Mp4VttParser = function() {
  /**
   * The current time scale used by the VTT parser.
   *
   * @type {?number}
   * @private
   */
  this.timescale_ = null;
};


/** @override */
shaka.text.Mp4VttParser.prototype.parseInit = function(data) {
  const Mp4Parser = shaka.util.Mp4Parser;

  let sawWVTT = false;

  new Mp4Parser()
      .box('moov', Mp4Parser.children)
      .box('trak', Mp4Parser.children)
      .box('mdia', Mp4Parser.children)
      .fullBox('mdhd', function(box) {
        goog.asserts.assert(
            box.version == 0 || box.version == 1,
            'MDHD version can only be 0 or 1');
        if (box.version == 0) {
          box.reader.skip(4); // Skip "creation_time".
          box.reader.skip(4); // Skip "modification_time".
          this.timescale_ = box.reader.readUint32();
          box.reader.skip(4); // Skip "duration".
        } else {
          box.reader.skip(8); // Skip "creation_time".
          box.reader.skip(8); // Skip "modification_time".
          this.timescale_ = box.reader.readUint32();
          box.reader.skip(8); // Skip "duration".
        }
        box.reader.skip(4); // Skip "pad", "language", and "pre-defined".
      }.bind(this))
      .box('minf', Mp4Parser.children)
      .box('stbl', Mp4Parser.children)
      .fullBox('stsd', Mp4Parser.sampleDescription)
      .box('wvtt', function(box) {
        // A valid vtt init segment, though we have no actual subtitles yet.
        sawWVTT = true;
      }).parse(data);

  if (!this.timescale_) {
    // Missing timescale for VTT content. It should be located in the MDHD.
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT);
  }

  if (!sawWVTT) {
    // A WVTT box should have been seen (a valid vtt init segment with no
    // actual subtitles).
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT);
  }
};


/** @override */
shaka.text.Mp4VttParser.prototype.parseMedia = function(data, time) {
  if (!this.timescale_) {
    // Missing timescale for VTT content. We should have seen the init segment.
    shaka.log.error('No init segment for MP4+VTT!');
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT);
  }

  const Mp4VttParser = shaka.text.Mp4VttParser;
  const Mp4Parser = shaka.util.Mp4Parser;

  let baseTime = 0;
  /** @type {!Array.<shaka.text.Mp4VttParser.TimeSegment>} */
  let presentations = [];
  /** @type {Uint8Array} */
  let rawPayload;
  /** @type {!Array.<shaka.text.Cue>} */
  let cues = [];

  let sawTFDT = false;
  let sawTRUN = false;
  let sawMDAT = false;
  let defaultDuration = null;

  new Mp4Parser()
      .box('moof', Mp4Parser.children)
      .box('traf', Mp4Parser.children)
      .fullBox('tfdt', function(box) {
        sawTFDT = true;
        goog.asserts.assert(
            box.version == 0 || box.version == 1,
            'TFDT version can only be 0 or 1');
        baseTime = (box.version == 0) ?
            box.reader.readUint32() :
            box.reader.readUint64();
      })
      .fullBox('tfhd', function(box) {
        goog.asserts.assert(
            box.flags != null,
            'A TFHD box should have a valid flags value');
        defaultDuration = Mp4VttParser.parseTFHD_(
            box.flags, box.reader);
      })
      .fullBox('trun', function(box) {
        sawTRUN = true;
        goog.asserts.assert(
            box.version != null,
            'A TRUN box should have a valid version value');
        goog.asserts.assert(
            box.flags != null,
            'A TRUN box should have a valid flags value');
        presentations = Mp4VttParser.parseTRUN_(
            box.version, box.flags, box.reader);
      })
      .box('mdat', Mp4Parser.allData(function(data) {
        goog.asserts.assert(!sawMDAT,
            'VTT cues in mp4 with multiple MDAT are not currently supported!');
        sawMDAT = true;
        rawPayload = data;
      })).parse(data);

  if (!sawMDAT && !sawTFDT && !sawTRUN) {
    // A required box is missing.
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT);
  }

  let currentTime = baseTime;

  let dataView = new DataView(
      rawPayload.buffer, rawPayload.byteOffset, rawPayload.byteLength);
  /** @type {!shaka.util.DataViewReader} */
  let reader = new shaka.util.DataViewReader(
      dataView, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  presentations.forEach((presentation) => {
    // If one presentation corresponds to multiple payloads, it is assumed
    // that all of those payloads have the same start time and duration.
    let duration = presentation.duration || defaultDuration;
    let startTime = presentation.timeOffset ?
                    baseTime + presentation.timeOffset :
                    currentTime;
    currentTime = startTime + (duration || 0);

    // Read samples until it adds up to the given size.
    let totalSize = 0;
    do {
      // Read the payload size.
      let payloadSize = reader.readUint32();
      totalSize += payloadSize;

      // Skip the type.
      let payloadType = reader.readUint32();
      let payloadName = shaka.util.Mp4Parser.typeToString(payloadType);

      // Read the data payload.
      /** @type {Uint8Array} */
      let payload = null;
      if (payloadName == 'vttc') {
        if (payloadSize > 8) {
          payload = reader.readBytes(payloadSize - 8);
        }
      } else if (payloadName == 'vtte') {
        // It's a vtte, which is a vtt cue that is empty. Ignore any data that
        // does exist.
        reader.skip(payloadSize - 8);
      } else {
        shaka.log.error('Unknown box ' + payloadName + '! Skipping!');
        reader.skip(payloadSize - 8);
      }

      if (duration) {
        if (payload) {
          goog.asserts.assert(
              this.timescale_ != null, 'Timescale should not be null!');
          cues.push(shaka.text.Mp4VttParser.parseVTTC_(
              payload,
              time.periodStart + startTime / this.timescale_,
              time.periodStart + currentTime / this.timescale_));
        }
      } else {
        shaka.log.error('WVTT sample duration unknown, and no default found!');
      }

      goog.asserts.assert(
          !presentation.sampleSize || totalSize <= presentation.sampleSize,
          'The samples do not fit evenly into the sample sizes given in the ' +
          'TRUN box!');

      // If no sampleSize was specified, it's assumed that this presentation
      // corresponds to only a single cue.
    } while (presentation.sampleSize && (totalSize < presentation.sampleSize));
  });

  goog.asserts.assert(
      !reader.hasMoreData(),
      'MDAT which contain VTT cues and non-VTT data are not currently ' +
      'supported!');

  return /** @type {!Array.<!shaka.extern.Cue>} */ (
      cues.filter(shaka.util.Functional.isNotNull));
};


/**
 * @typedef {{
 *    duration: ?number,
 *    sampleSize: ?number,
 *    timeOffset: ?number
 *  }}
 *
 * @property {?number} duration
 *    The length of the segment in timescale units.
 * @property {?number} sampleSize
 *    The size of the segment in bytes.
 * @property {?number} timeOffset
 *    The time since the start of the segment in timescale units. Time
 *    offset is based of the start of the segment. If this value is
 *    missing, the accumated durations preceeding this time segment will
 *    be used to create the start time.
 */
shaka.text.Mp4VttParser.TimeSegment;


/**
 * @param {number} flags
 * @param {!shaka.util.DataViewReader} reader
 * @return {?number} The default_sample_duration field, if present.
 * @private
 */
shaka.text.Mp4VttParser.parseTFHD_ = function(flags, reader) {
  // Skip "track_ID".
  reader.skip(4);

  // Skip "base_data_offset" if present.
  if (flags & 0x000001) { reader.skip(8); }

  // Skip "sample_description_index" if present.
  if (flags & 0x000002) { reader.skip(4); }

  // Read and return "default_sample_duration" if present.
  if (flags & 0x000008) { return reader.readUint32(); }

  // There is no "default_sample_duration".
  return null;
};


/**
 * @param {number} version
 * @param {number} flags
 * @param {!shaka.util.DataViewReader} reader
 * @return {!Array.<shaka.text.Mp4VttParser.TimeSegment>}
 * @private
 */
shaka.text.Mp4VttParser.parseTRUN_ = function(version, flags, reader) {
  let sampleCount = reader.readUint32();

  // Skip "data_offset" if present.
  if (flags & 0x000001) { reader.skip(4); }

  // Skip "first_sample_flags" if present.
  if (flags & 0x000004) { reader.skip(4); }

  let samples = [];

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    /** @type {shaka.text.Mp4VttParser.TimeSegment} */
    let sample = {
      duration: null,
      sampleSize: null,
      timeOffset: null,
    };

    // Read "sample duration" if present.
    if (flags & 0x000100) { sample.duration = reader.readUint32(); }

    // Read "sample_size" if present.
    if (flags & 0x000200) { sample.sampleSize = reader.readUint32(); }

    // Skip "sample_flags" if present.
    if (flags & 0x000400) { reader.skip(4); }

    // Read "sample_time_offset" if present.
    if (flags & 0x000800) {
      sample.timeOffset = version == 0 ?
          reader.readUint32() :
          reader.readInt32();
    }

    samples.push(sample);
  }

  return samples;
};


/**
 * Parses a vttc box into a cue.
 *
 * @param {!Uint8Array} data
 * @param {number} startTime
 * @param {number} endTime
 * @return {shaka.text.Cue}
 * @private
 */
shaka.text.Mp4VttParser.parseVTTC_ = function(data, startTime, endTime) {
  let payload;
  let id;
  let settings;

  new shaka.util.Mp4Parser()
      .box('payl', shaka.util.Mp4Parser.allData(function(data) {
        payload = shaka.util.StringUtils.fromUTF8(data);
      }))
      .box('iden', shaka.util.Mp4Parser.allData(function(data) {
        id = shaka.util.StringUtils.fromUTF8(data);
      }))
      .box('sttg', shaka.util.Mp4Parser.allData(function(data) {
        settings = shaka.util.StringUtils.fromUTF8(data);
      }))
      .parse(data);

  if (payload) {
    return shaka.text.Mp4VttParser.assembleCue_(payload,
                                                id,
                                                settings,
                                                startTime,
                                                endTime);
  } else {
    return null;
  }
};


/**
 * Take the individual components that make a cue and create a vttc cue.
 *
 * @param {string} payload
 * @param {?string} id
 * @param {?string} settings
 * @param {number} startTime
 * @param {number} endTime
 * @return {!shaka.text.Cue}
 * @private
 */
shaka.text.Mp4VttParser.assembleCue_ = function(payload,
                                                id,
                                                settings,
                                                startTime,
                                                endTime) {
  let cue = new shaka.text.Cue(
      startTime,
      endTime,
      payload);

  if (id) {
    cue.id = id;
  }

  if (settings) {
    let parser = new shaka.util.TextParser(settings);

    let word = parser.readWord();

    while (word) {
      // TODO: Check WebVTTConfigurationBox for region info.
      if (!shaka.text.VttTextParser.parseCueSetting(cue, word,
                                                    /* VTTRegions */ [])) {
        shaka.log.warning('VTT parser encountered an invalid VTT setting: ',
                          word,
                          ' The setting will be ignored.');
      }

      parser.skipWhitespace();
      word = parser.readWord();
    }
  }

  return cue;
};


shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="wvtt"',
    shaka.text.Mp4VttParser);
