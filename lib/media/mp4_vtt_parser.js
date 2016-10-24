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
 * Extracts VTT segment from an MP4 file and does the mapping to cue objects.
 *
 * @param {ArrayBuffer} data
 * @param {number} offset
 * @param {?number} segmentStartTime
 * @param {?number} segmentEndTime
 * @param {boolean} useRelativeCueTimestamps Only used by the VTT parser
 * @return {!Array.<!TextTrackCue>}
 */
shaka.media.Mp4VttParser =
    function(data, offset, segmentStartTime,
             segmentEndTime, useRelativeCueTimestamps) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
  var boxSize = shaka.util.Mp4Parser.findBox(
      shaka.util.Mp4Parser.BOX_TYPE_MDAT, reader);
  if (boxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
    // mdat box found, parse the content
    // valid media segment should have start and end time
    goog.asserts.assert(
        segmentStartTime != null, 'start time should not be null');
    goog.asserts.assert(segmentEndTime != null, 'end time should not be null');
    return shaka.media.Mp4VttParser.parseData_(
        reader.readBytes(boxSize - 8).buffer, offset,
        segmentStartTime, segmentEndTime);
  }
  var wvttBoxSize = shaka.util.Mp4Parser.findSampleDescriptionBox(
      data, shaka.media.Mp4VttParser.BOX_TYPE_WVTT);
  if (wvttBoxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
    // a valid vtt init segment, no actual subtitles yet
    return [];
  } else {
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT);
  }
};


/**
 * Parses the content of the mdat MP4 box into cue objects.
 *
 * @param {ArrayBuffer} data
 * @param {number} offset
 * @param {number} segmentStartTime
 * @param {number} segmentEndTime
 * @return {!Array.<!TextTrackCue>}
 * @private
 */
shaka.media.Mp4VttParser.parseData_ = function(
    data, offset, segmentStartTime, segmentEndTime) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  segmentStartTime += offset;
  segmentEndTime += offset;

  var result = [];
  // Cues are represented as vttc boxes. Each box corresponds to a cue.
  while (reader.hasMoreData()) {
    var boxSize = shaka.util.Mp4Parser.findBox(
        shaka.media.Mp4VttParser.BOX_TYPE_VTTC, reader);
    if (boxSize == shaka.util.Mp4Parser.BOX_NOT_FOUND) {
      // No more cues
      break;
    }
    var cue = shaka.media.Mp4VttParser.parseCue_(
        reader.readBytes(boxSize - 8).buffer,
        segmentStartTime, segmentEndTime);
    if (cue)
      result.push(cue);
  }

  return result;
};


/**
 * Parses a vttc box into a cue.
 *
 * @param {ArrayBuffer} data
 * @param {number} segmentStartTime
 * @param {number} segmentEndTime
 * @return {TextTrackCue}
 * @private
 */
shaka.media.Mp4VttParser.parseCue_ = function(
    data, segmentStartTime, segmentEndTime) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  var payload;
  var settings;
  var id;

  while (reader.hasMoreData()) {
    var startPosition = reader.getPosition();
    var size = reader.readUint32();
    var type = reader.readUint32();
    var content = shaka.util.StringUtils.fromUTF8(
        reader.readBytes(size - 8).buffer);
    if (size == 1) {
      size = reader.readUint64();
    } else if (size == 0) {
      size = reader.getLength() - startPosition;
    }

    switch (type) {
      case shaka.media.Mp4VttParser.BOX_TYPE_PAYL:
        payload = content;
        break;
      case shaka.media.Mp4VttParser.BOX_TYPE_IDEN:
        id = content;
        break;
      case shaka.media.Mp4VttParser.BOX_TYPE_STTG:
        settings = content;
        break;
      default:
        break;
    }
  }
  // payload box is mandatory
  if (!payload) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT);
  }

  var cue = shaka.media.TextEngine.makeCue(
      segmentStartTime, segmentEndTime, payload);
  if (!cue)
    return null;

  if (id)
    cue.id = id;
  if (settings) {
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


/** @const {number} */
shaka.media.Mp4VttParser.BOX_TYPE_WVTT = 0x77767474;


/** @const {number} */
shaka.media.Mp4VttParser.BOX_TYPE_VTTC = 0x76747463;


/** @const {number} */
shaka.media.Mp4VttParser.BOX_TYPE_PAYL = 0x7061796C;


/** @const {number} */
shaka.media.Mp4VttParser.BOX_TYPE_IDEN = 0x6964656F;


/** @const {number} */
shaka.media.Mp4VttParser.BOX_TYPE_STTG = 0x73747467;


shaka.media.TextEngine.registerParser(
    'application/mp4; codecs="wvtt"', shaka.media.Mp4VttParser);
