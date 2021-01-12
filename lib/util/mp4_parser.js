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

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.DataViewReader');


/**
 * Create a new MP4 Parser
 * @struct
 * @constructor
 * @export
 */
shaka.util.Mp4Parser = function() {
  /** @private {!Object.<number, shaka.util.Mp4Parser.BoxType_>} */
  this.headers_ = [];

  /** @private {!Object.<number, !shaka.util.Mp4Parser.CallbackType>} */
  this.boxDefinitions_ = [];

  /** @private {boolean} */
  this.done_ = false;
};


/**
 * @typedef {function(!shaka.extern.ParsedBox)}
 * @exportInterface
 */
shaka.util.Mp4Parser.CallbackType;


/**
 * An enum used to track the type of box so that the correct values can be
 * read from the header.
 *
 * @enum {number}
 * @private
 */
shaka.util.Mp4Parser.BoxType_ = {
  BASIC_BOX: 0,
  FULL_BOX: 1,
};


/**
 * Declare a box type as a Box.
 *
 * @param {string} type
 * @param {!shaka.util.Mp4Parser.CallbackType} definition
 * @return {!shaka.util.Mp4Parser}
 * @export
 */
shaka.util.Mp4Parser.prototype.box = function(type, definition) {
  let typeCode = shaka.util.Mp4Parser.typeFromString_(type);
  this.headers_[typeCode] = shaka.util.Mp4Parser.BoxType_.BASIC_BOX;
  this.boxDefinitions_[typeCode] = definition;
  return this;
};


/**
 * Declare a box type as a Full Box.
 *
 * @param {string} type
 * @param {!shaka.util.Mp4Parser.CallbackType} definition
 * @return {!shaka.util.Mp4Parser}
 * @export
 */
shaka.util.Mp4Parser.prototype.fullBox = function(type, definition) {
  let typeCode = shaka.util.Mp4Parser.typeFromString_(type);
  this.headers_[typeCode] = shaka.util.Mp4Parser.BoxType_.FULL_BOX;
  this.boxDefinitions_[typeCode] = definition;
  return this;
};


/**
 * Stop parsing.  Useful for extracting information from partial segments and
 * avoiding an out-of-bounds error once you find what you are looking for.
 *
 * @export
 */
shaka.util.Mp4Parser.prototype.stop = function() {
  this.done_ = true;
};


/**
 * Parse the given data using the added callbacks.
 *
 * @param {!BufferSource} data
 * @param {boolean=} partialOkay If true, allow reading partial payloads
 *   from some boxes. If the goal is a child box, we can sometimes find it
 *   without enough data to find all child boxes.
 * @export
 */
shaka.util.Mp4Parser.prototype.parse = function(data, partialOkay) {
  let wrapped = new Uint8Array(data);
  let reader = new shaka.util.DataViewReader(
      new DataView(wrapped.buffer, wrapped.byteOffset, wrapped.byteLength),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  this.done_ = false;
  while (reader.hasMoreData() && !this.done_) {
    this.parseNext(0, reader, partialOkay);
  }
};


/**
 * Parse the next box on the current level.
 *
 * @param {number} absStart The absolute start position in the original
 *   byte array.
 * @param {!shaka.util.DataViewReader} reader
 * @param {boolean=} partialOkay If true, allow reading partial payloads
 *   from some boxes. If the goal is a child box, we can sometimes find it
 *   without enough data to find all child boxes.
 * @export
 */
shaka.util.Mp4Parser.prototype.parseNext =
    function(absStart, reader, partialOkay) {
  let start = reader.getPosition();

  let size = reader.readUint32();
  let type = reader.readUint32();
  let name = shaka.util.Mp4Parser.typeToString(type);
  let has64BitSize = false;
  shaka.log.v2('Parsing MP4 box', name);

  switch (size) {
    case 0:
      size = reader.getLength() - start;
      break;
    case 1:
      size = reader.readUint64();
      has64BitSize = true;
      break;
  }

  let boxDefinition = this.boxDefinitions_[type];

  if (boxDefinition) {
    let version = null;
    let flags = null;

    if (this.headers_[type] == shaka.util.Mp4Parser.BoxType_.FULL_BOX) {
      let versionAndFlags = reader.readUint32();
      version = versionAndFlags >>> 24;
      flags = versionAndFlags & 0xFFFFFF;
    }

    // Read the whole payload so that the current level can be safely read
    // regardless of how the payload is parsed.
    let end = start + size;
    if (partialOkay && end > reader.getLength()) {
      // For partial reads, truncate the payload if we must.
      end = reader.getLength();
    }
    let payloadSize = end - reader.getPosition();
    let payload =
        (payloadSize > 0) ? reader.readBytes(payloadSize) : new Uint8Array(0);

    let payloadReader = new shaka.util.DataViewReader(
        new DataView(payload.buffer, payload.byteOffset, payload.byteLength),
        shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

    /** @type {shaka.extern.ParsedBox} */
    let box = {
      parser: this,
      partialOkay: partialOkay || false,
      version,
      flags,
      reader: payloadReader,
      size,
      start: start + absStart,
      has64BitSize,
    };

    boxDefinition(box);
  } else {
    // Move the read head to be at the end of the box.
    // If the box is longer than the remaining parts of the file, e.g. the
    // mp4 is improperly formatted, or this was a partial range request that
    // ended in the middle of a box, just skip to the end.
    const skipLength = Math.min(
        start + size - reader.getPosition(),
        reader.getLength() - reader.getPosition());
    reader.skip(skipLength);
  }
};


/**
 * A callback that tells the Mp4 parser to treat the body of a box as a series
 * of boxes. The number of boxes is limited by the size of the parent box.
 *
 * @param {!shaka.extern.ParsedBox} box
 * @export
 */
shaka.util.Mp4Parser.children = function(box) {
  // The "reader" starts at the payload, so we need to add the header to the
  // start position.  The header size varies.
  const headerSize = shaka.util.Mp4Parser.headerSize(box);
  while (box.reader.hasMoreData() && !box.parser.done_) {
      box.parser.parseNext(box.start + headerSize, box.reader, box.partialOkay);
  }
};


/**
 * A callback that tells the Mp4 parser to treat the body of a box as a sample
 * description. A sample description box has a fixed number of children. The
 * number of children is represented by a 4 byte unsigned integer. Each child
 * is a box.
 *
 * @param {!shaka.extern.ParsedBox} box
 * @export
 */
shaka.util.Mp4Parser.sampleDescription = function(box) {
  // The "reader" starts at the payload, so we need to add the header to the
  // start position.  The header size varies.
  const headerSize = shaka.util.Mp4Parser.headerSize(box);
  for (let count = box.reader.readUint32();
       count > 0 && !box.parser.done_;
       count -= 1) {
    box.parser.parseNext(box.start + headerSize, box.reader, box.partialOkay);
  }
};


/**
 * Create a callback that tells the Mp4 parser to treat the body of a box as a
 * binary blob and to parse the body's contents using the provided callback.
 *
 * @param {function(!Uint8Array)} callback
 * @return {!shaka.util.Mp4Parser.CallbackType}
 * @export
 */
shaka.util.Mp4Parser.allData = function(callback) {
  return function(box) {
    let all = box.reader.getLength() - box.reader.getPosition();
    callback(box.reader.readBytes(all));
  };
};


/**
 * Convert an ascii string name to the integer type for a box.
 *
 * @param {string} name The name of the box. The name must be four
 *                      characters long.
 * @return {number}
 * @private
 */
shaka.util.Mp4Parser.typeFromString_ = function(name) {
  goog.asserts.assert(
      name.length == 4,
      'Mp4 box names must be 4 characters long');

  let code = 0;
  for (let i = 0; i < name.length; i++) {
    code = (code << 8) | name.charCodeAt(i);
  }
  return code;
};


/**
 * Convert an integer type from a box into an ascii string name.
 * Useful for debugging.
 *
 * @param {number} type The type of the box, a uint32.
 * @return {string}
 * @export
 */
shaka.util.Mp4Parser.typeToString = function(type) {
  let name = String.fromCharCode(
      (type >> 24) & 0xff,
      (type >> 16) & 0xff,
      (type >> 8) & 0xff,
      type & 0xff);
  return name;
};


/**
 * Find the header size of the box.
 * Useful for modifying boxes in place or finding the exact offset of a field.
 *
 * @param {shaka.extern.ParsedBox} box
 * @return {number}
 * @export
 */
shaka.util.Mp4Parser.headerSize = function(box) {
  return /* basic header */ 8
      + /* additional 64-bit size field */ (box.has64BitSize ? 8 : 0)
      + /* version and flags for a "full" box */ (box.flags != null ? 4 : 0);
};
