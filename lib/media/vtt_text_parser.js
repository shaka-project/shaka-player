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

goog.provide('shaka.media.VttTextParser');

goog.require('shaka.media.TextEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TextParser');


/**
 * @namespace
 * @summary A TextEngine plugin that parses WebVTT files.
 * @param {ArrayBuffer|ArrayBufferView} data
 * @return {!Array.<!TextTrackCue>}
 * @throws {shaka.util.Error}
 */
shaka.media.VttTextParser = function(data) {
  // Get the input as a string.  Normalize newlines to \n.
  var str = shaka.util.StringUtils.fromBytesAutoDetect(data);
  str = str.replace(/\r\n|\r(?=[^\n]|$)/gm, '\n');
  var blocks = str.split(/\n{2,}/m);

  if (!/^WEBVTT($|[ \t\n])/m.test(blocks[0])) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_TEXT_HEADER);
  }

  var ret = [];
  for (var i = 1; i < blocks.length; i++) {
    var lines = blocks[i].split('\n');
    var cue = shaka.media.VttTextParser.parseCue_(lines);
    if (cue)
      ret.push(cue);
  }

  return ret;
};


/**
 * Parses a text block into a Cue object.
 *
 * @param {!Array.<string>} text
 * @return {?TextTrackCue}
 * @private
 */
shaka.media.VttTextParser.parseCue_ = function(text) {
  // Skip empty blocks.
  if (text.length == 1 && !text[0])
    return null;

  // Skip comment blocks.
  if (/^NOTE($|[ \t])/.test(text[0]))
    return null;

  var id = null;
  var index = text[0].indexOf('-->');
  if (index < 0) {
    id = text[0];
    text.splice(0, 1);
  }

  // Parse the times.
  var parser = new shaka.util.TextParser(text[0]);
  var start = shaka.media.VttTextParser.parseTime_(parser);
  var expect = parser.readRegex(/[ \t]+-->[ \t]+/g);
  var end = shaka.media.VttTextParser.parseTime_(parser);
  if (start == null || expect == null || end == null) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_TEXT_CUE);
  }

  // Get the payload.
  var payload = text.slice(1).join('\n');

  var ret;
  if (window.VTTCue) {
    ret = new VTTCue(start, end, payload);

    // Parse optional settings (these are only supported when using VTTCue).
    parser.skipWhitespace();
    var word = parser.readWord();
    while (word) {
      if (!shaka.media.VttTextParser.parseSetting_(ret, word)) {
        throw new shaka.util.Error(
            shaka.util.Error.Category.TEXT,
            shaka.util.Error.Code.INVALID_TEXT_SETTINGS);
      }
      parser.skipWhitespace();
      word = parser.readWord();
    }
  } else {
    ret = new TextTrackCue(start, end, payload);
  }

  if (id != null)
    ret.id = id;
  return ret;
};


/**
 * Parses a WebVTT setting from the given word.
 *
 * @param {!VTTCue} cue
 * @param {string} word
 * @return {boolean} True on success.
 * @private
 */
shaka.media.VttTextParser.parseSetting_ = function(cue, word) {
  var results = null;
  if ((results = /^align:(start|middle|end)$/.exec(word))) {
    cue.align = results[1];
  } else if ((results = /^vertical:(lr|rl)$/.exec(word))) {
    cue.vertical = results[1];
  } else if ((results = /^size:(\d{1,2}|100)%$/.exec(word))) {
    cue.size = Number(results[1]);
  } else if ((results = /^position:(\d{1,2}|100)%$/.exec(word))) {
    cue.position = Number(results[1]);
  } else if ((results = /^line:(\d{1,2}|100)%$/.exec(word))) {
    cue.snapToLines = false;
    cue.line = Number(results[1]);
  } else if ((results = /^line:(-?\d+)$/.exec(word))) {
    cue.snapToLines = true;
    cue.line = Number(results[1]);
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
shaka.media.VttTextParser.parseTime_ = function(parser) {
  // 00:00.000 or 00:00:00.000
  var results = parser.readRegex(/(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})/g);
  if (results == null)
    return null;
  // This capture is optional, but will still be in the array as undefined,
  // default to 0.
  var hours = Number(results[1]) || 0;
  var minutes = Number(results[2]);
  var seconds = Number(results[3]);
  var miliseconds = Number(results[4]);
  if (minutes > 59 || seconds > 59)
    return null;

  return (miliseconds / 1000) + seconds + (minutes * 60) + (hours * 3600);
};

shaka.media.TextEngine.registerParser('text/vtt', shaka.media.VttTextParser);
