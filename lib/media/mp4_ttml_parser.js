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

goog.require('shaka.media.TtmlTextParser');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');


/**
 * Extracts ttml segment from an mp4 file and
 * invokes ttml parser to parse it.
 * @param {ArrayBuffer} data
 * @return {!Array.<!TextTrackCue>}
 */
shaka.media.Mp4TtmlParser = function(data) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  var boxSize = shaka.media.Mp4TtmlParser.findBox_(
      shaka.media.Mp4TtmlParser.BOX_TYPE_MDAT, reader);
  if (boxSize != shaka.media.Mp4TtmlParser.BOX_NOT_FOUND) {
    // mdat box found, use TtmlTextParser to parse the content
    return shaka.media.TtmlTextParser(reader.readBytes(boxSize - 8).buffer);
  } else if (shaka.media.Mp4TtmlParser.isTtmlInitSegment_(data)) {
    // a valid ttml init segment, no actual subtitles yet
    return [];
  } else {
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_TTML);
  }
};


/**
 * Looks for a box of a specified type in an mp4 stream and returns
 * it's size if found one. Returns -1 otherwise.
 * @param {number} boxType
 * @param {!shaka.util.DataViewReader} reader
 * @return {number}
 * @private
 */
shaka.media.Mp4TtmlParser.findBox_ = function(boxType, reader) {
  while (reader.hasMoreData()) {
    var start = reader.getPosition();
    var size = reader.readUint32();
    var type = reader.readUint32();
    if (size == 1) {
      size = reader.readUint64();
    } else if (size == 0) {
      size = reader.getLength() - start;
    }

    if (type == boxType) {
      return size;
    } else {
      reader.skip(size - (reader.getPosition() - start));
      continue;
    }
  }
  // couldn't find the box
  return shaka.media.Mp4TtmlParser.BOX_NOT_FOUND;
};


/**
 * Traverses an mp4 file looking for a stpp segment
 * @param {ArrayBuffer} data
 * @return {boolean}
 * @private
 */
shaka.media.Mp4TtmlParser.isTtmlInitSegment_ = function(data) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  /* Path to the stpp box:
    moov->trak->mdia->minf->stpl->stsd->stpp
  */
  var Mp4TtmlParser = shaka.media.Mp4TtmlParser;
  var path = [
    //[box type, number of bytes to skip before getting to inner boxes
    // (for flags etc.)]
    [Mp4TtmlParser.BOX_TYPE_MOOV, 0],
    [Mp4TtmlParser.BOX_TYPE_TRAK, 0],
    [Mp4TtmlParser.BOX_TYPE_MDIA, 0],
    [Mp4TtmlParser.BOX_TYPE_MINF, 0],
    [Mp4TtmlParser.BOX_TYPE_STBL, 0],
    [Mp4TtmlParser.BOX_TYPE_STSD, 8],
    [Mp4TtmlParser.BOX_TYPE_STPP, 0]
  ];

  for (var i = 0; i < path.length; i++) {
    var type = path[i][0];
    var skipBytes = path[i][1];
    var size = Mp4TtmlParser.findBox_(type, reader);
    if (size == Mp4TtmlParser.BOX_NOT_FOUND) return false;
    reader.skip(skipBytes);
  }

  return true;
};


/** @const {number} */
shaka.media.Mp4TtmlParser.BOX_NOT_FOUND = -1;


/** @const {number} */
shaka.media.Mp4TtmlParser.BOX_TYPE_MDAT = 0x6D646174;


/** @const {number} */
shaka.media.Mp4TtmlParser.BOX_TYPE_MOOV = 0x6D6F6F76;


/** @const {number} */
shaka.media.Mp4TtmlParser.BOX_TYPE_TRAK = 0x7472616B;


/** @const {number} */
shaka.media.Mp4TtmlParser.BOX_TYPE_MDIA = 0x6D646961;


/** @const {number} */
shaka.media.Mp4TtmlParser.BOX_TYPE_MINF = 0x6D696E66;


/** @const {number} */
shaka.media.Mp4TtmlParser.BOX_TYPE_STBL = 0x7374626C;


/** @const {number} */
shaka.media.Mp4TtmlParser.BOX_TYPE_STSD = 0x73747364;


/** @const {number} */
shaka.media.Mp4TtmlParser.BOX_TYPE_STPP = 0x73747070;


shaka.media.TextEngine.registerParser(
    'application/mp4', shaka.media.Mp4TtmlParser);
