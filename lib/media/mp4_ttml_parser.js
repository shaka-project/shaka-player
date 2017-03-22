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
  var Mp4Parser = shaka.util.Mp4Parser;

  var sawMDAT = false;
  var sawSTPP = false;
  var payload = [];

  var parser = new shaka.util.Mp4Parser()
      .box('mdia', Mp4Parser.children)
      .box('minf', Mp4Parser.children)
      .box('moov', Mp4Parser.children)
      .box('stbl', Mp4Parser.children)
      .fullBox('stsd', Mp4Parser.sampleDescription)
      .box('trak', Mp4Parser.children)
      .box('mdat', Mp4Parser.allData(function(data) {
        sawMDAT = true;
        payload = shaka.media.TtmlTextParser(
            data.buffer,
            offset,
            segmentStartTime,
            segmentEndTime,
            false);
      }))
      .box('stpp', function(box) {
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


shaka.media.TextEngine.registerParser(
    'application/mp4; codecs="stpp"', shaka.media.Mp4TtmlParser);
