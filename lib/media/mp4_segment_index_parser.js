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
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Parser');


/**
 * Parses SegmentReferences from an ISO BMFF SIDX structure.
 * @param {!ArrayBuffer} sidxData The MP4's container's SIDX.
 * @param {number} sidxOffset The SIDX's offset, in bytes, from the start of
 *   the MP4 container.
 * @param {!Array.<string>} uris The possible locations of the MP4 file that
 *   contains the segments.
 * @param {number} scaledPresentationTimeOffset
 * @return {!Array.<!shaka.media.SegmentReference>}
 * @throws {shaka.util.Error}
 */
shaka.media.Mp4SegmentIndexParser = function(
    sidxData, sidxOffset, uris, scaledPresentationTimeOffset) {
  const Mp4SegmentIndexParser = shaka.media.Mp4SegmentIndexParser;

  let references;

  let parser = new shaka.util.Mp4Parser()
      .fullBox('sidx', function(box) {
        references = Mp4SegmentIndexParser.parseSIDX_(
            sidxOffset,
            scaledPresentationTimeOffset,
            uris,
            box);
      });

  if (sidxData) {
    parser.parse(sidxData);
  }

  if (references) {
    return references;
  } else {
    shaka.log.error('Invalid box type, expected "sidx".');
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.MP4_SIDX_WRONG_BOX_TYPE);
  }
};


/**
 * Parse a SIDX box from the given reader.
 *
 * @param {number} sidxOffset
 * @param {number} scaledPresentationTimeOffset
 * @param {!Array.<string>} uris The possible locations of the MP4 file that
 *   contains the segments.
 * @param {!shaka.extern.ParsedBox} box
 * @return {!Array.<!shaka.media.SegmentReference>}
 * @private
 */
shaka.media.Mp4SegmentIndexParser.parseSIDX_ = function(
    sidxOffset,
    scaledPresentationTimeOffset,
    uris,
    box) {
  goog.asserts.assert(
      box.version != null,
      'SIDX is a full box and should have a valid version.');

  let references = [];

  // Parse the SIDX structure.
  // Skip reference_ID (32 bits).
  box.reader.skip(4);

  let timescale = box.reader.readUint32();

  if (timescale == 0) {
    shaka.log.error('Invalid timescale.');
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.MP4_SIDX_INVALID_TIMESCALE);
  }

  let earliestPresentationTime;
  let firstOffset;

  if (box.version == 0) {
    earliestPresentationTime = box.reader.readUint32();
    firstOffset = box.reader.readUint32();
  } else {
    earliestPresentationTime = box.reader.readUint64();
    firstOffset = box.reader.readUint64();
  }

  // Skip reserved (16 bits).
  box.reader.skip(2);

  // Add references.
  let referenceCount = box.reader.readUint16();

  // Substract the presentation time offset
  let unscaledStartTime = earliestPresentationTime;
  let startByte = sidxOffset + box.size + firstOffset;

  for (let i = 0; i < referenceCount; i++) {
    // |chunk| is 1 bit for |referenceType|, and 31 bits for |referenceSize|.
    let chunk = box.reader.readUint32();
    let referenceType = (chunk & 0x80000000) >>> 31;
    let referenceSize = chunk & 0x7FFFFFFF;

    let subsegmentDuration = box.reader.readUint32();

    // Skipping 1 bit for |startsWithSap|, 3 bits for |sapType|, and 28 bits
    // for |sapDelta|.
    box.reader.skip(4);

    // If |referenceType| is 1 then the reference is to another SIDX.
    // We do not support this.
    if (referenceType == 1) {
      shaka.log.error('Heirarchical SIDXs are not supported.');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MP4_SIDX_TYPE_NOT_SUPPORTED);
    }

    references.push(
        new shaka.media.SegmentReference(
            references.length,
            (unscaledStartTime / timescale) -
                scaledPresentationTimeOffset,
            ((unscaledStartTime + subsegmentDuration) / timescale) -
                scaledPresentationTimeOffset,
            function() { return uris; },
            startByte,
            startByte + referenceSize - 1));

    unscaledStartTime += subsegmentDuration;
    startByte += referenceSize;
  }

  box.parser.stop();
  return references;
};
