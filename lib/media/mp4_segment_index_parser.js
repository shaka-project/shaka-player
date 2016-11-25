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

goog.provide('shaka.media.Mp4SegmentIndexParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Parser');


/**
 * Parses SegmentReferences from an ISO BMFF SIDX structure.
 * @param {!ArrayBuffer} sidxData The MP4's container's SIDX.
 * @param {number} sidxOffset The SIDX's offset, in bytes, from the start of
 *   the MP4 container.
 * @param {!Array.<string>} uris The possible locations of the MP4 file that
 *   contains the segments.
 * @param {number} presentationTimeOffset
 * @return {!Array.<!shaka.media.SegmentReference>}
 * @throws {shaka.util.Error}
 */
shaka.media.Mp4SegmentIndexParser = function(
    sidxData, sidxOffset, uris, presentationTimeOffset) {
  var references = [];

  var reader = new shaka.util.DataViewReader(
      new DataView(sidxData),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  var boxSize = shaka.util.Mp4Parser.findBox(
      shaka.media.Mp4SegmentIndexParser.BOX_TYPE, reader);

  if (boxSize == shaka.util.Mp4Parser.BOX_NOT_FOUND) {
    shaka.log.error('Invalid box type, expected "sidx".');
    throw new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.MP4_SIDX_WRONG_BOX_TYPE);
  }

  // Parse the FullBox structure.
  var version = reader.readUint8();

  // Skip flags (24 bits)
  reader.skip(3);

  // Parse the SIDX structure.
  // Skip reference_ID (32 bits).
  reader.skip(4);

  var timescale = reader.readUint32();
  goog.asserts.assert(timescale != 0, 'timescale cannot be 0');
  if (timescale == 0) {
    shaka.log.error('Invalid timescale.');
    throw new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.MP4_SIDX_INVALID_TIMESCALE);
  }

  var earliestPresentationTime;
  var firstOffset;

  if (version == 0) {
    earliestPresentationTime = reader.readUint32();
    firstOffset = reader.readUint32();
  } else {
    earliestPresentationTime = reader.readUint64();
    firstOffset = reader.readUint64();
  }

  // Skip reserved (16 bits).
  reader.skip(2);

  // Add references.
  var referenceCount = reader.readUint16();

  // Substract the presentationTimeOffset
  var unscaledStartTime = earliestPresentationTime - presentationTimeOffset;
  var startByte = sidxOffset + boxSize + firstOffset;

  for (var i = 0; i < referenceCount; i++) {
    // |chunk| is 1 bit for |referenceType|, and 31 bits for |referenceSize|.
    var chunk = reader.readUint32();
    var referenceType = (chunk & 0x80000000) >>> 31;
    var referenceSize = chunk & 0x7FFFFFFF;

    var subsegmentDuration = reader.readUint32();

    // Skipping 1 bit for |startsWithSap|, 3 bits for |sapType|, and 28 bits
    // for |sapDelta|.
    reader.skip(4);

    // If |referenceType| is 1 then the reference is to another SIDX.
    // We do not support this.
    if (referenceType == 1) {
      shaka.log.error('Heirarchical SIDXs are not supported.');
      throw new shaka.util.Error(
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MP4_SIDX_TYPE_NOT_SUPPORTED);
    }

    references.push(
        new shaka.media.SegmentReference(
            references.length,
            unscaledStartTime / timescale,
            (unscaledStartTime + subsegmentDuration) / timescale,
            function() { return uris; },
            startByte,
            startByte + referenceSize - 1));

    unscaledStartTime += subsegmentDuration;
    startByte += referenceSize;
  }

  return references;
};


/**
 * Indicates the SIDX box structure. It is equal to the string 'sidx' as a
 * 32-bit unsigned integer.
 * @const {number}
 */
shaka.media.Mp4SegmentIndexParser.BOX_TYPE = 0x73696478;
