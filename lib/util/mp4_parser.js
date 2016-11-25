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

goog.provide('shaka.util.Mp4Parser');

goog.require('shaka.util.DataViewReader');


/**
 * Looks for a box of a specified type in an mp4 stream and returns
 * it's size if found one. Returns -1 otherwise. Advances the
 * position of the reader to the beginning of the box content.
 * @param {number} boxType
 * @param {!shaka.util.DataViewReader} reader
 * @return {number}
 */
shaka.util.Mp4Parser.findBox = function(boxType, reader) {
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
  return shaka.util.Mp4Parser.BOX_NOT_FOUND;
};


/**
 * Finds a specified child of the sample description box
 * traversing a given path and returns it's size. Returns -1
 * if the box was not found.
 * @param {ArrayBuffer} data
 * @param {number} boxType
 * @return {number}
 */
shaka.util.Mp4Parser.findSampleDescriptionBox = function(data, boxType) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  /* Path to a sample description box:
    moov->trak->mdia->minf->stpl->stsd->
  */

  var Mp4Parser = shaka.util.Mp4Parser;
  var path = [
    //[box type, number of bytes to skip before getting to inner boxes
    // (for flags etc.)]
    [Mp4Parser.BOX_TYPE_MOOV, 0],
    [Mp4Parser.BOX_TYPE_TRAK, 0],
    [Mp4Parser.BOX_TYPE_MDIA, 0],
    [Mp4Parser.BOX_TYPE_MINF, 0],
    [Mp4Parser.BOX_TYPE_STBL, 0],
    [Mp4Parser.BOX_TYPE_STSD, 8],
    [boxType, 0]
  ];

  var size = Mp4Parser.BOX_NOT_FOUND;
  for (var i = 0; i < path.length; i++) {
    var type = path[i][0];
    var skipBytes = path[i][1];
    size = Mp4Parser.findBox(type, reader);
    if (size == Mp4Parser.BOX_NOT_FOUND)
      return Mp4Parser.BOX_NOT_FOUND;
    reader.skip(skipBytes);
  }

  return size;
};


/** @const {number} */
shaka.util.Mp4Parser.BOX_NOT_FOUND = -1;


/** @const {number} */
shaka.util.Mp4Parser.BOX_TYPE_MDAT = 0x6D646174;


/** @const {number} */
shaka.util.Mp4Parser.BOX_TYPE_MOOV = 0x6D6F6F76;


/** @const {number} */
shaka.util.Mp4Parser.BOX_TYPE_TRAK = 0x7472616B;


/** @const {number} */
shaka.util.Mp4Parser.BOX_TYPE_MDIA = 0x6D646961;


/** @const {number} */
shaka.util.Mp4Parser.BOX_TYPE_MINF = 0x6D696E66;


/** @const {number} */
shaka.util.Mp4Parser.BOX_TYPE_STBL = 0x7374626C;


/** @const {number} */
shaka.util.Mp4Parser.BOX_TYPE_STSD = 0x73747364;
