/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Implements a SIDX parser.
 */

goog.provide('shaka.media.Mp4SegmentIndexParser');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.DataViewReader');



/**
 * Creates an Mp4SegmentIndexParser.
 *
 * @constructor
 * @struct
 */
shaka.media.Mp4SegmentIndexParser = function() {};


/**
 * Parses SegmentReferences from |sidxData|.
 * @param {!DataView} sidxData The MP4's container's SIDX.
 * @param {number} sidxOffset The SIDX's offset, in bytes, from the start of
 *     the MP4 container.
 * @param {!goog.Uri} url The location of each SegmentReference.
 * @return {Array.<!shaka.media.SegmentReference>} SegmentReferences on success;
 *     otherwise, return null.
 */
shaka.media.Mp4SegmentIndexParser.prototype.parse = function(
    sidxData, sidxOffset, url) {
  var references = null;

  try {
    references = this.parseInternal_(sidxData, sidxOffset, url);
  } catch (exception) {
    if (!(exception instanceof RangeError)) {
      throw exception;
    }
  }

  return references;
};


/**
 * Indicates the SIDX box structure. It is equal to the string 'sidx' as a
 * 32-bit unsigned integer.
 * @const {number}
 */
shaka.media.Mp4SegmentIndexParser.SIDX_INDICATOR = 0x73696478;


/**
 * Parses SegmentReferences from an ISO BMFF SIDX structure.
 * @param {!DataView} sidxData
 * @param {number} sidxOffset
 * @param {!goog.Uri} url
 * @return {Array.<!shaka.media.SegmentReference>} SegmentReferences on success;
 *     otherwise, return null.
 * @throws {RangeError}
 * @private
 * @see ISO/IEC 14496-12:2012 section 4.2 and 8.16.3
 */
shaka.media.Mp4SegmentIndexParser.prototype.parseInternal_ = function(
    sidxData, sidxOffset, url) {
  var references = [];

  var reader = new shaka.util.DataViewReader(
      sidxData,
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  // A SIDX structure is contained within a FullBox structure, which itself is
  // contained within a Box structure.

  // Parse the Box structure.
  var boxSize = reader.readUint32();
  var boxType = reader.readUint32();

  if (boxType != shaka.media.Mp4SegmentIndexParser.SIDX_INDICATOR) {
    shaka.log.error('Invalid box type, expected "sidx".');
    return null;
  }

  if (boxSize == 1) {
    boxSize = reader.readUint64();
  }

  // Parse the FullBox structure.
  var version = reader.readUint8();

  // Skip flags (24 bits)
  reader.skip(3);

  // Parse the SIDX structure.
  // Skip reference_ID (32 bits).
  reader.skip(4);

  var timescale = reader.readUint32();
  shaka.asserts.assert(timescale != 0);
  if (timescale == 0) {
    shaka.log.error('Invalid timescale.');
    return null;
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
  var unscaledStartTime = earliestPresentationTime;
  var startByte = sidxOffset + boxSize + firstOffset;

  for (var i = 0; i < referenceCount; i++) {
    // |chunk| is 1 bit for |referenceType|, and 31 bits for |referenceSize|.
    var chunk = reader.readUint32();
    var referenceType = (chunk & 0x80000000) >>> 31;
    var referenceSize = chunk & 0x7FFFFFFF;

    var subsegmentDuration = reader.readUint32();

    // |chunk| is 1 bit for |startsWithSap|, 3 bits for |sapType|, and 28 bits
    // for |sapDelta|.
    // TODO(story 1891508): Handle stream access point (SAP)?
    chunk = reader.readUint32();
    var startsWithSap = (chunk & 0x80000000) >>> 31;
    var sapType = (chunk & 0x70000000) >>> 28;
    var sapDelta = chunk & 0x0FFFFFFF;

    // If |referenceType| is 1 then the reference is to another SIDX.
    // We do not support this.
    if (referenceType == 1) {
      shaka.log.error('Heirarchical SIDXs are not supported.');
      return null;
    }

    references.push(
        new shaka.media.SegmentReference(
            unscaledStartTime / timescale,
            (unscaledStartTime + subsegmentDuration) / timescale,
            startByte,
            startByte + referenceSize - 1,
            url));

    unscaledStartTime += subsegmentDuration;
    startByte += referenceSize;
  }

  return references;
};

