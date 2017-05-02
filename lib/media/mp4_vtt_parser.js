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

goog.provide('shaka.media.Mp4VttParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.TextEngine');
goog.require('shaka.media.VttTextParser');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TextParser');



/**
 * @struct
 * @constructor
 * @implements {shakaExtern.TextParser}
 */
shaka.media.Mp4VttParser = function() {
  /**
   * The current time scale used by the VTT parser.
   *
   * @type {?number}
   * @private
   */
  this.timescale_ = null;
};


/** @override */
shaka.media.Mp4VttParser.prototype.parseInit = function(data) {
  var Mp4Parser = shaka.util.Mp4Parser;

  var sawWVTT = false;

  new Mp4Parser()
      .box('moov', Mp4Parser.children)
      .box('trak', Mp4Parser.children)
      .box('mdia', Mp4Parser.children)
      .fullBox('mdhd', function(box) {
        goog.asserts.assert(
            box.version == 0 || box.version == 1,
            'MDHD version can only be 0 or 1');
        if (box.version == 0) {
          box.reader.skip(4); // skip "creation_time"
          box.reader.skip(4); // skip "modification_time"
          this.timescale_ = box.reader.readUint32();
          box.reader.skip(4); // skip "duration"
        } else {
          box.reader.skip(8); // skip "creation_time"
          box.reader.skip(8); // skip "modification_time"
          this.timescale_ = box.reader.readUint32();
          box.reader.skip(8); // skip "duration"
        }
        box.reader.skip(4); // skip "pad", "language", and "pre-defined"
      }.bind(this))
      .box('minf', Mp4Parser.children)
      .box('stbl', Mp4Parser.children)
      .fullBox('stsd', Mp4Parser.sampleDescription)
      .box('wvtt', function(box) {
        // A valid vtt init segment, no actual subtitles yet
        sawWVTT = true;
      }).parse(data);

  if (!this.timescale_) {
    // Missing timescale for VTT content. Should be located in the MDHD
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
shaka.media.Mp4VttParser.prototype.parseMedia = function(data, time) {
  var Mp4VttParser = shaka.media.Mp4VttParser;
  var Mp4Parser = shaka.util.Mp4Parser;

  var baseTime = 0;
  var presentations = [];
  var payloads = [];
  var cues = [];

  var sawTFDT = false;
  var sawTRUN = false;
  var sawMDAT = false;

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
      .box('vtte', function(box) {
        // VTTE are empty cues, so there is no need to do any more than insert
        // a place-holder. We must add something or else the ordering between
        // the payloads and presentation times would fall out of order.
        payloads.push(null);
      })
      .box('vttc', Mp4Parser.allData(function(data) {
        payloads.push(data.buffer);
      }))
      .box('mdat', function(box) {
        sawMDAT = true;
        Mp4Parser.children(box);
      }).parse(data);

  if (!sawMDAT && !sawTFDT && !sawTRUN) {
    // A required box is missing
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT);
  }

  goog.asserts.assert(
      presentations.length == payloads.length,
      'The number of presentations should equal the number of payloads');

  var currentTime = baseTime;

  for (var i = 0; i < presentations.length; i++) {
    var presentation = presentations[i];
    var payload = payloads[i];

    if (presentation.duration) {
      var startTime = presentation.timeOffset ?
                      baseTime + presentation.timeOffset :
                      currentTime;

      currentTime = startTime + presentation.duration;

      // The payload can be null as that would mean that it was a VTTE and
      // was only inserted to keep the presentation times in sync with the
      // payloads.
      if (payload) {
        cues.push(shaka.media.Mp4VttParser.parseVTTC_(
            payload,
            time.periodStart + startTime / this.timescale_,
            time.periodStart + currentTime / this.timescale_));
      }
    }
  }

  return cues;
};


/**
 * @typedef {{
 *    duration: ?number,
 *    timeOffset: ?number
 *  }}
 *
 * @property {?number} duration
 *    The length of the segment in timescale units.
 * @property {?number} timeOffset
 *    The time since the start of the segment in timescale units. Time
 *    offset is based of the start of the segment. If this value is
 *    missing, the accumated durations preceeding this time segment will
 *    be used to create the start time.
 */
shaka.media.Mp4VttParser.TimeSegment;


/**
 * @param {number} version
 * @param {number} flags
 * @param {!shaka.util.DataViewReader} reader
 * @return {!Array.<shaka.media.Mp4VttParser.TimeSegment>}
 * @private
 */
shaka.media.Mp4VttParser.parseTRUN_ = function(version, flags, reader) {
  var sampleCount = reader.readUint32();

  // skip "data_offset" if present
  if (flags & 0x000001) { reader.skip(4); }

  // skip "first_sample_flags" if present
  if (flags & 0x000004) { reader.skip(4); }

  var samples = [];

  for (var sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {

    /** @type {shaka.media.Mp4VttParser.TimeSegment} */
    var sample = {
      duration: null,
      timeOffset: null
    };

    // read "sample duration" if present
    if (flags & 0x000100) { sample.duration = reader.readUint32(); }

    // skip "sample_size" if present
    if (flags & 0x000200) { reader.skip(4); }

    // skip "sample_flags" if present
    if (flags & 0x000400) {reader.skip(4); }

    // read "sample_time_offset" if present
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
 * @param {!ArrayBuffer} data
 * @param {number} startTime
 * @param {number} endTime
 * @return {TextTrackCue}
 * @private
 */
shaka.media.Mp4VttParser.parseVTTC_ = function(data, startTime, endTime) {
  var payload;
  var id;
  var settings;

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
    return shaka.media.Mp4VttParser.assembleCue_(payload,
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
 * @return {TextTrackCue}
 * @private
 */
shaka.media.Mp4VttParser.assembleCue_ = function(payload,
                                                 id,
                                                 settings,
                                                 startTime,
                                                 endTime) {
  var cue = shaka.media.TextEngine.makeCue(
      startTime,
      endTime,
      payload);

  if (cue && id) {
    cue.id = id;
  }

  if (cue && settings) {
    var parser = new shaka.util.TextParser(settings);

    var word = parser.readWord();

    while (word) {

      if (!shaka.media.VttTextParser.parseSetting(cue, word)) {
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


shaka.media.TextEngine.registerParser(
    'application/mp4; codecs="wvtt"',
    shaka.media.Mp4VttParser);
