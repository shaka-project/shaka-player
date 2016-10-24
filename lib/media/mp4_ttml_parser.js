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

goog.provide('shaka.media.Mp4TtmlParser');

goog.require('shaka.media.TextEngine');
goog.require('shaka.media.TtmlTextParser');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Parser');


/**
 * Extracts ttml segment from an mp4 file and
 * invokes ttml parser to parse it.
 * @param {ArrayBuffer} data
 * @param {number} offset
 * @param {?number} segmentStartTime
 * @param {?number} segmentEndTime
 * @param {boolean} useRelativeCueTimestamps Only used by the VTT parser
 * @return {!Array.<!TextTrackCue>}
 */
shaka.media.Mp4TtmlParser =
    function(data, offset, segmentStartTime,
             segmentEndTime, useRelativeCueTimestamps) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  var boxSize = shaka.util.Mp4Parser.findBox(
      shaka.util.Mp4Parser.BOX_TYPE_MDAT, reader);
  if (boxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
    // mdat box found, use TtmlTextParser to parse the content
    return shaka.media.TtmlTextParser(
        reader.readBytes(boxSize - 8).buffer, offset,
        segmentStartTime, segmentEndTime, false);
  }
  var stppBoxSize = shaka.util.Mp4Parser.findSampleDescriptionBox(
      data, shaka.media.Mp4TtmlParser.BOX_TYPE_STPP);
  if (stppBoxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
    // a valid ttml init segment, no actual subtitles yet
    return [];
  } else {
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_TTML);
  }
};


/** @const {number} */
shaka.media.Mp4TtmlParser.BOX_TYPE_STPP = 0x73747070;


shaka.media.TextEngine.registerParser(
    'application/mp4; codecs="stpp"', shaka.media.Mp4TtmlParser);
