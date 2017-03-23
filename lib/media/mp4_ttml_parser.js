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
 * @struct
 * @constructor
 * @implements {shakaExtern.TextParser}
 */
shaka.media.Mp4TtmlParser = function() {
  /**
   * @type {!shakaExtern.TextParser}
   * @private
   */
  this.parser_ = new shaka.media.TtmlTextParser();
};


/** @override **/
shaka.media.Mp4TtmlParser.prototype.parseInit = function(data) {
  var Mp4Parser = shaka.util.Mp4Parser;

  var sawSTPP = false;

  new Mp4Parser()
      .box('moov', Mp4Parser.children)
      .box('trak', Mp4Parser.children)
      .box('mdia', Mp4Parser.children)
      .box('minf', Mp4Parser.children)
      .box('stbl', Mp4Parser.children)
      .fullBox('stsd', Mp4Parser.sampleDescription)
      .box('stpp', function(box) {
        sawSTPP = true;
      }).parse(data);

  if (!sawSTPP) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_TTML);
  }
};


/** @override **/
shaka.media.Mp4TtmlParser.prototype.parseMedia = function(data, time) {
  var Mp4Parser = shaka.util.Mp4Parser;

  var sawMDAT = false;
  var payload = [];

  new Mp4Parser()
      .box('mdat', Mp4Parser.allData(function(data) {
        sawMDAT = true;
        payload = this.parser_.parseMedia(data.buffer, time);
      }.bind(this))).parse(data);

  if (!sawMDAT) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_TTML);
  }

  return payload;
};


shaka.media.TextEngine.registerParser(
    'application/mp4; codecs="stpp"',
    shaka.media.Mp4TtmlParser);
