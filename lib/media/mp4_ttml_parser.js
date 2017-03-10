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
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Box');
goog.require('shaka.util.Mp4Parser');


/**
 * @namespace
 * @summary Extracts a TTML segment from an MP4 file and invokes the TTML parser
 *   to parse it.
 * @param {ArrayBuffer} data
 * @param {number} offset
 * @param {?number} segmentStartTime
 * @param {?number} segmentEndTime
 * @param {boolean} useRelativeCueTimestamps Only used by the VTT parser
 * @return {!Array.<!TextTrackCue>}
 * @export
 */
shaka.media.Mp4TtmlParser =
    function(data, offset, segmentStartTime,
             segmentEndTime, useRelativeCueTimestamps) {
  var Mp4TtmlParser = shaka.media.Mp4TtmlParser;
  var Mp4Box = shaka.util.Mp4Box;
  var Mp4Parser = shaka.util.Mp4Parser;

  var sawMDAT = false;
  var sawSTPP = false;
  var payload = [];

  var parser = new shaka.util.Mp4Parser()
      .box(Mp4Box.MDIA, Mp4Parser.children)
      .box(Mp4Box.MINF, Mp4Parser.children)
      .box(Mp4Box.MOOV, Mp4Parser.children)
      .box(Mp4Box.STBL, Mp4Parser.children)
      .fullBox(Mp4Box.STSD, Mp4Parser.sampleDescription)
      .box(Mp4Box.TRAK, Mp4Parser.children)
      .box(Mp4Box.MDAT, Mp4Parser.allData(function(data) {
        sawMDAT = true;
        payload = shaka.media.TtmlTextParser(
            data.buffer,
            offset,
            segmentStartTime,
            segmentEndTime,
            false);
      }))
      .box(Mp4TtmlParser.BOX_TYPE_STPP, function(box) {
        sawSTPP = true;
      });

  if (data) {
    parser.parse(data);
  }

  if (sawMDAT || sawSTPP) {
    return payload;
  }

  throw new shaka.util.Error(
      shaka.util.Error.Category.TEXT,
      shaka.util.Error.Code.INVALID_MP4_TTML);
};


/** @const {number} */
shaka.media.Mp4TtmlParser.BOX_TYPE_STPP = 0x73747070;


shaka.media.TextEngine.registerParser(
    'application/mp4; codecs="stpp"', shaka.media.Mp4TtmlParser);
