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

goog.provide('shaka.text.VttTextParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TextParser');


/**
 * @constructor
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.VttTextParser = function() {};


/**
 * @override
 * @export
 */
shaka.text.VttTextParser.prototype.parseInit = function(data) {
  goog.asserts.assert(false, 'VTT does not have init segments');
};


/**
 * @override
 * @export
 * @throws {shaka.util.Error}
 */
shaka.text.VttTextParser.prototype.parseMedia = function(data, time) {
  const VttTextParser = shaka.text.VttTextParser;
  // Get the input as a string.  Normalize newlines to \n.
  let str = shaka.util.StringUtils.fromUTF8(data);
  str = str.replace(/\r\n|\r(?=[^\n]|$)/gm, '\n');
  let blocks = str.split(/\n{2,}/m);

  if (!/^WEBVTT($|[ \t\n])/m.test(blocks[0])) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_TEXT_HEADER);
  }

  let offset = time.segmentStart;
  if (offset == null) {
    // This is a probe, such as the HLS parser makes.  We don't know the segment
    // start time, so we will use the X-TIMESTAMP-MAP header, if present, to get
    // the segment start time.  By only doing this when segmentStart == null, we
    // protect against rollover in the MPEGTS field.

    // In case the attempt below doesn't work out, assume an offset of 0.
    offset = 0;

    if (blocks[0].includes('X-TIMESTAMP-MAP')) {
      // https://bit.ly/2K92l7y
      // The 'X-TIMESTAMP-MAP' header is used in HLS to align text with
      // the rest of the media.
      // The header format is 'X-TIMESTAMP-MAP=MPEGTS:n,LOCAL:m'
      // (the attributes can go in any order)
      // where n is MPEG-2 time and m is cue time it maps to.
      // For example 'X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000'
      // means an offset of 10 seconds
      // 900000/MPEG_TIMESCALE - cue time.
      const cueTimeMatch =
          blocks[0].match(/LOCAL:((?:(\d{1,}):)?(\d{2}):(\d{2})\.(\d{3}))/m);

      const mpegTimeMatch = blocks[0].match(/MPEGTS:(\d+)/m);
      if (cueTimeMatch && mpegTimeMatch) {
        const parser = new shaka.util.TextParser(cueTimeMatch[1]);
        const cueTime = shaka.text.VttTextParser.parseTime_(parser);
        if (cueTime == null) {
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.TEXT,
              shaka.util.Error.Code.INVALID_TEXT_HEADER);
        }

        const mpegTime = Number(mpegTimeMatch[1]);
        const mpegTimescale = shaka.text.VttTextParser.MPEG_TIMESCALE_;
        // Apple-encoded HLS content uses absolute timestamps, so assume the
        // presence of the map tag means the content uses absolute timestamps.
        offset = time.periodStart + (mpegTime / mpegTimescale - cueTime);
      }
    }
  }

  // Parse VTT regions.
  /* !Array.<!shaka.extern.CueRegion> */
  let regions = [];
  let lines = blocks[0].split('\n');
  for (let i = 1; i < lines.length; i++) {
    if (/^Region:/.test(lines[i])) {
      let region = VttTextParser.parseRegion_(lines[i]);
      regions.push(region);
    }
  }

  // Parse cues.
  let ret = [];
  for (let i = 1; i < blocks.length; i++) {
    lines = blocks[i].split('\n');
    let cue = VttTextParser.parseCue_(lines, offset, regions);
    if (cue) {
      ret.push(cue);
    }
    }

  return ret;
};


/**
 * Parses a string into a Region object.
 *
 * @param {string} text
 * @return {!shaka.extern.CueRegion}
 * @private
 */
shaka.text.VttTextParser.parseRegion_ = function(text) {
  const VttTextParser = shaka.text.VttTextParser;
  let parser = new shaka.util.TextParser(text);
  // The region string looks like this:
  // Region: id=fred width=50% lines=3 regionanchor=0%,100%
  //         viewportanchor=10%,90% scroll=up
  let region = new shaka.text.CueRegion();

  // Skip 'Region:'
  parser.readWord();
  parser.skipWhitespace();

  let word = parser.readWord();
  while (word) {
    if (!VttTextParser.parseRegionSetting_(region, word)) {
      shaka.log.warning('VTT parser encountered an invalid VTTRegion setting: ',
                        word,
                        ' The setting will be ignored.');
    }
    parser.skipWhitespace();
    word = parser.readWord();
  }

  return region;
};


/**
 * Parses a text block into a Cue object.
 *
 * @param {!Array.<string>} text
 * @param {number} timeOffset
 * @param {!Array.<!shaka.extern.CueRegion>} regions
 * @return {shaka.text.Cue}
 * @private
 */
shaka.text.VttTextParser.parseCue_ = function(text, timeOffset, regions) {
  const VttTextParser = shaka.text.VttTextParser;

  // Skip empty blocks.
  if (text.length == 1 && !text[0]) {
    return null;
  }

  // Skip comment blocks.
  if (/^NOTE($|[ \t])/.test(text[0])) {
    return null;
  }

  // Skip style blocks.
  if (text[0] == 'STYLE') {
    return null;
  }

  let id = null;
  if (!text[0].includes('-->')) {
    id = text[0];
    text.splice(0, 1);
  }

  // Parse the times.
  let parser = new shaka.util.TextParser(text[0]);
  let start = VttTextParser.parseTime_(parser);
  let expect = parser.readRegex(/[ \t]+-->[ \t]+/g);
  let end = VttTextParser.parseTime_(parser);

  if (start == null || expect == null || end == null) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_TEXT_CUE);
  }

  start += timeOffset;
  end += timeOffset;

  // Get the payload.
  let payload = text.slice(1).join('\n').trim();

  let cue = new shaka.text.Cue(start, end, payload);

  // Parse optional settings.
  parser.skipWhitespace();
  let word = parser.readWord();
  while (word) {
    if (!VttTextParser.parseCueSetting(cue, word, regions)) {
      shaka.log.warning('VTT parser encountered an invalid VTT setting: ',
                        word,
                        ' The setting will be ignored.');
    }
    parser.skipWhitespace();
    word = parser.readWord();
  }

  if (id != null) {
    cue.id = id;
  }
  return cue;
};


/**
 * Parses a WebVTT setting from the given word.
 *
 * @param {!shaka.text.Cue} cue
 * @param {string} word
 * @param {!Array.<!shaka.text.CueRegion>} regions
 * @return {boolean} True on success.
 */
shaka.text.VttTextParser.parseCueSetting = function(cue, word, regions) {
  const VttTextParser = shaka.text.VttTextParser;
  let results = null;
  if ((results = /^align:(start|middle|center|end|left|right)$/.exec(word))) {
    VttTextParser.setTextAlign_(cue, results[1]);
  } else if ((results = /^vertical:(lr|rl)$/.exec(word))) {
    VttTextParser.setVerticalWritingMode_(cue, results[1]);
  } else if ((results = /^size:([\d.]+)%$/.exec(word))) {
    cue.size = Number(results[1]);
  } else if ((results =
      /^position:([\d.]+)%(?:,(line-left|line-right|center|start|end))?$/
      .exec(word))) {
    cue.position = Number(results[1]);
    if (results[2]) {
      VttTextParser.setPositionAlign_(cue, results[2]);
    }
  } else if ((results = /^region:(.*)$/.exec(word))) {
    let region = VttTextParser.getRegionById_(regions, results[1]);
    if (region) {
      cue.region = region;
    }
  } else {
    return VttTextParser.parsedLineValueAndInterpretation_(cue, word);
  }

  return true;
};


/**
 *
 * @param {!Array.<!shaka.text.CueRegion>} regions
 * @param {string} id
 * @return {?shaka.text.CueRegion}
 * @private
 */
shaka.text.VttTextParser.getRegionById_ = function(regions, id) {
  let regionsWithId = regions.filter(function(region) {
    return region.id == id;
  });
  if (!regionsWithId.length) {
    shaka.log.warning('VTT parser could not find a region with id: ',
                  id,
                  ' The region will be ignored.');
    return null;
  }
  goog.asserts.assert(regionsWithId.length == 1,
                      'VTTRegion ids should be unique!');

  return regionsWithId[0];
};


/**
 * Parses a WebVTTRegion setting from the given word.
 *
 * @param {!shaka.text.CueRegion} region
 * @param {string} word
 * @return {boolean} True on success.
 * @private
 */
shaka.text.VttTextParser.parseRegionSetting_ = function(region, word) {
  let results = null;
  if ((results = /^id=(.*)$/.exec(word))) {
    region.id = results[1];
  } else if ((results = /^width=(\d{1,2}|100)%$/.exec(word))) {
    region.width = Number(results[1]);
  } else if ((results = /^lines=(\d+)$/.exec(word))) {
    region.height = Number(results[1]);
    region.heightUnits = shaka.text.CueRegion.units.LINES;
  } else if ((results = /^regionanchor=(\d{1,2}|100)%,(\d{1,2}|100)%$/
            .exec(word))) {
    region.regionAnchorX = Number(results[1]);
    region.regionAnchorY = Number(results[2]);
  } else if ((results = /^viewportanchor=(\d{1,2}|100)%,(\d{1,2}|100)%$/
            .exec(word))) {
    region.viewportAnchorX = Number(results[1]);
    region.viewportAnchorY = Number(results[2]);
  } else if ((results = /^scroll=up$/.exec(word))) {
    region.scroll = shaka.text.CueRegion.scrollMode.UP;
  } else {
    return false;
  }

  return true;
};


/**
 * @param {!shaka.text.Cue} cue
 * @param {string} align
 * @private
 */
shaka.text.VttTextParser.setTextAlign_ = function(cue, align) {
  const Cue = shaka.text.Cue;
  if (align == 'middle') {
    cue.textAlign = Cue.textAlign.CENTER;
  } else {
    goog.asserts.assert(align.toUpperCase() in Cue.textAlign,
                        align.toUpperCase() +
                        ' Should be in Cue.textAlign values!');

    cue.textAlign = Cue.textAlign[align.toUpperCase()];
  }
};


/**
 * @param {!shaka.text.Cue} cue
 * @param {string} align
 * @private
 */
shaka.text.VttTextParser.setPositionAlign_ = function(cue, align) {
  const Cue = shaka.text.Cue;
  if (align == 'line-left' || align == 'start') {
    cue.positionAlign = Cue.positionAlign.LEFT;
  } else if (align == 'line-right' || align == 'end') {
    cue.positionAlign = Cue.positionAlign.RIGHT;
  } else {
    cue.positionAlign = Cue.positionAlign.CENTER;
  }
};


/**
 * @param {!shaka.text.Cue} cue
 * @param {string} value
 * @private
 */
shaka.text.VttTextParser.setVerticalWritingMode_ = function(cue, value) {
  const Cue = shaka.text.Cue;
  if (value == 'lr') {
    cue.writingMode = Cue.writingMode.VERTICAL_LEFT_TO_RIGHT;
  } else {
    cue.writingMode = Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
  }
};


/**
 * @param {!shaka.text.Cue} cue
 * @param {string} word
 * @return {boolean}
 * @private
 */
shaka.text.VttTextParser.parsedLineValueAndInterpretation_ =
    function(cue, word) {
  const Cue = shaka.text.Cue;
  let results = null;
  if ((results = /^line:([\d.]+)%(?:,(start|end|center))?$/.exec(word))) {
    cue.lineInterpretation = Cue.lineInterpretation.PERCENTAGE;
    cue.line = Number(results[1]);
    if (results[2]) {
      goog.asserts.assert(results[2].toUpperCase() in Cue.lineAlign,
                          results[2].toUpperCase() +
                          ' Should be in Cue.lineAlign values!');
      cue.lineAlign = Cue.lineAlign[results[2].toUpperCase()];
    }
  } else if ((results = /^line:(-?\d+)(?:,(start|end|center))?$/.exec(word))) {
    cue.lineInterpretation = Cue.lineInterpretation.LINE_NUMBER;
    cue.line = Number(results[1]);
    if (results[2]) {
      goog.asserts.assert(results[2].toUpperCase() in Cue.lineAlign,
                          results[2].toUpperCase() +
                          ' Should be in Cue.lineAlign values!');
      cue.lineAlign = Cue.lineAlign[results[2].toUpperCase()];
    }
  } else {
    return false;
  }

  return true;
};


/**
 * Parses a WebVTT time from the given parser.
 *
 * @param {!shaka.util.TextParser} parser
 * @return {?number}
 * @private
 */
shaka.text.VttTextParser.parseTime_ = function(parser) {
  // 00:00.000 or 00:00:00.000 or 0:00:00.000
  let results = parser.readRegex(/(?:(\d{1,}):)?(\d{2}):(\d{2})\.(\d{3})/g);
  if (results == null) {
    return null;
  }
  // This capture is optional, but will still be in the array as undefined,
  // in which case it is 0.
  let hours = Number(results[1]) || 0;
  let minutes = Number(results[2]);
  let seconds = Number(results[3]);
  let miliseconds = Number(results[4]);
  if (minutes > 59 || seconds > 59) {
    return null;
  }

  return (miliseconds / 1000) + seconds + (minutes * 60) + (hours * 3600);
};


/**
 * @const {number}
 * @private
 */
shaka.text.VttTextParser.MPEG_TIMESCALE_ = 90000;

shaka.text.TextEngine.registerParser(
    'text/vtt',
    shaka.text.VttTextParser);

shaka.text.TextEngine.registerParser(
    'text/vtt; codecs="vtt"',
    shaka.text.VttTextParser);
shaka.text.TextEngine.registerParser(
    'text/vtt; codecs="wvtt"',
    shaka.text.VttTextParser);
