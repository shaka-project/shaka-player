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
 * @fileoverview Parses a segment index from an ISO BMFF SIDX structure.
 */

goog.provide('shaka.media.IsobmffSegmentIndexParser');

goog.require('shaka.log');
goog.require('shaka.media.ISegmentIndexParser');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.DataViewReader');



/**
 * A parser for ISO BMFF SIDX structures.
 *
 * @param {!goog.Uri} mediaUrl The location of the segments, i.e., all parsed
 *     SegmentReferences are assumed to be reteivable from |mediaUrl|.
 *
 * @constructor
 * @implements {shaka.media.ISegmentIndexParser}
 */
shaka.media.IsobmffSegmentIndexParser = function(mediaUrl) {
  /** @private {!goog.Uri} */
  this.mediaUrl_ = mediaUrl;
};


/** @override */
shaka.media.IsobmffSegmentIndexParser.prototype.parse =
    function(initSegmentData, indexData, indexOffset) {
  var references = null;

  try {
    references = this.parseInternal_(indexData, indexOffset);
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
shaka.media.IsobmffSegmentIndexParser.SIDX_INDICATOR = 0x73696478;


/**
 * Parses the segment index from an ISO BMFF SIDX structure.
 * @param {!DataView} dataView The ISO BMFF SIDX data.
 * @param {number} sidxOffset The byte offset of the SIDX in the container.
 * @return {Array.<!shaka.media.SegmentReference>} The segment references, or
 *     null if an error occurred.
 * @throws {RangeError}
 * @private
 * @see ISO/IEC 14496-12:2012 section 4.2 and 8.16.3
 */
shaka.media.IsobmffSegmentIndexParser.prototype.parseInternal_ = function(
    dataView, sidxOffset) {
  var reader = new shaka.util.DataViewReader(
      dataView,
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  /** @type {!Array.<!shaka.media.SegmentReference>} */
  var references = [];

  // A SIDX structure is contained within a FullBox structure, which itself is
  // contained within a Box structure.

  // Parse the Box structure.
  var boxSize = reader.readUint32();
  var boxType = reader.readUint32();

  if (boxType != shaka.media.IsobmffSegmentIndexParser.SIDX_INDICATOR) {
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
            i,
            unscaledStartTime / timescale,
            (unscaledStartTime + subsegmentDuration) / timescale,
            startByte,
            startByte + referenceSize - 1,
            this.mediaUrl_));

    unscaledStartTime += subsegmentDuration;
    startByte += referenceSize;
  }

  return references;
};

