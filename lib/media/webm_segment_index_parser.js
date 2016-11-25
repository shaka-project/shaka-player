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

goog.provide('shaka.media.WebmSegmentIndexParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.EbmlElement');
goog.require('shaka.util.EbmlParser');
goog.require('shaka.util.Error');



/**
 * Creates a WebM Cues element parser.
 *
 * @constructor
 * @struct
 */
shaka.media.WebmSegmentIndexParser = function() {};


/** @const {number} */
shaka.media.WebmSegmentIndexParser.EBML_ID = 0x1a45dfa3;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.SEGMENT_ID = 0x18538067;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.INFO_ID = 0x1549a966;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.TIMECODE_SCALE_ID = 0x2ad7b1;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.DURATION_ID = 0x4489;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.CUES_ID = 0x1c53bb6b;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.CUE_POINT_ID = 0xbb;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.CUE_TIME_ID = 0xb3;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.CUE_TRACK_POSITIONS_ID = 0xb7;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.CUE_CLUSTER_POSITION = 0xf1;


/**
 * Parses SegmentReferences from a WebM container.
 * @param {!ArrayBuffer} cuesData The WebM container's "Cueing Data" section.
 * @param {!ArrayBuffer} initData The WebM container's headers.
 * @param {!Array.<string>} uris The possible locations of the WebM file that
 *   contains the segments.
 * @param {number} presentationTimeOffset

 * @return {!Array.<!shaka.media.SegmentReference>}
 * @throws {shaka.util.Error}
 * @see http://www.matroska.org/technical/specs/index.html
 * @see http://www.webmproject.org/docs/container/
 */
shaka.media.WebmSegmentIndexParser.prototype.parse = function(
    cuesData, initData, uris, presentationTimeOffset) {
  var tuple = this.parseWebmContainer_(initData);
  var parser = new shaka.util.EbmlParser(new DataView(cuesData));
  var cuesElement = parser.parseElement();
  if (cuesElement.id != shaka.media.WebmSegmentIndexParser.CUES_ID) {
    shaka.log.error('Not a Cues element.');
    throw new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.WEBM_CUES_ELEMENT_MISSING);
  }

  return this.parseCues_(
      cuesElement, tuple.segmentOffset, tuple.timecodeScale, tuple.duration,
      uris, presentationTimeOffset);
};


/**
 * Parses a WebM container to get the segment's offset, timecode scale, and
 * duration.
 *
 * @param {!ArrayBuffer} initData
 * @return {{segmentOffset: number, timecodeScale: number, duration: number}}
 *   The segment's offset in bytes, the segment's timecode scale in seconds,
 *   and the duration in seconds.
 * @throws {shaka.util.Error}
 * @private
 */
shaka.media.WebmSegmentIndexParser.prototype.parseWebmContainer_ = function(
    initData) {
  var parser = new shaka.util.EbmlParser(new DataView(initData));

  // Check that the WebM container data starts with the EBML header, but
  // skip its contents.
  var ebmlElement = parser.parseElement();
  if (ebmlElement.id != shaka.media.WebmSegmentIndexParser.EBML_ID) {
    shaka.log.error('Not an EBML element.');
    throw new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.WEBM_EBML_HEADER_ELEMENT_MISSING);
  }

  var segmentElement = parser.parseElement();
  if (segmentElement.id != shaka.media.WebmSegmentIndexParser.SEGMENT_ID) {
    shaka.log.error('Not a Segment element.');
    throw new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.WEBM_SEGMENT_ELEMENT_MISSING);
  }

  // This value is used as the initial offset to the first referenced segment.
  var segmentOffset = segmentElement.getOffset();

  // Parse the Segment element to get the segment info.
  var segmentInfo = this.parseSegment_(segmentElement);
  return {
    segmentOffset: segmentOffset,
    timecodeScale: segmentInfo.timecodeScale,
    duration: segmentInfo.duration
  };
};


/**
 * Parses a WebM Info element to get the segment's timecode scale and duration.
 * @param {!shaka.util.EbmlElement} segmentElement
 * @return {{timecodeScale: number, duration: number}} The segment's timecode
 *   scale in seconds and duration in seconds.
 * @throws {shaka.util.Error}
 * @private
 */
shaka.media.WebmSegmentIndexParser.prototype.parseSegment_ = function(
    segmentElement) {
  var parser = segmentElement.createParser();

  // Find the Info element.
  var infoElement = null;
  while (parser.hasMoreData()) {
    var elem = parser.parseElement();
    if (elem.id != shaka.media.WebmSegmentIndexParser.INFO_ID) {
      continue;
    }

    infoElement = elem;

    break;
  }

  if (!infoElement) {
    shaka.log.error('Not an Info element.');
    throw new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.WEBM_INFO_ELEMENT_MISSING);
  }

  return this.parseInfo_(infoElement);
};


/**
 * Parses a WebM Info element to get the segment's timecode scale and duration.
 * @param {!shaka.util.EbmlElement} infoElement
 * @return {{timecodeScale: number, duration: number}} The segment's timecode
 *   scale in seconds and duration in seconds.
 * @throws {shaka.util.Error}
 * @private
 */
shaka.media.WebmSegmentIndexParser.prototype.parseInfo_ = function(
    infoElement) {
  var parser = infoElement.createParser();

  // The timecode scale factor in units of [nanoseconds / T], where [T] are the
  // units used to express all other time values in the WebM container. By
  // default it's assumed that [T] == [milliseconds].
  var timecodeScaleNanoseconds = 1000000;
  /** @type {?number} */
  var durationScale = null;

  while (parser.hasMoreData()) {
    var elem = parser.parseElement();
    if (elem.id == shaka.media.WebmSegmentIndexParser.TIMECODE_SCALE_ID) {
      timecodeScaleNanoseconds = elem.getUint();
    } else if (elem.id == shaka.media.WebmSegmentIndexParser.DURATION_ID) {
      durationScale = elem.getFloat();
    }
  }
  if (durationScale == null) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.WEBM_DURATION_ELEMENT_MISSING);
  }

  // The timecode scale factor in units of [seconds / T].
  var timecodeScale = timecodeScaleNanoseconds / 1000000000;
  // The duration is stored in units of [T]
  var durationSeconds = durationScale * timecodeScale;

  return {timecodeScale: timecodeScale, duration: durationSeconds};
};


/**
 * Parses a WebM CuesElement.
 * @param {!shaka.util.EbmlElement} cuesElement
 * @param {number} segmentOffset
 * @param {number} timecodeScale
 * @param {number} duration
 * @param {!Array.<string>} uris
 * @param {number} presentationTimeOffset
 * @return {!Array.<!shaka.media.SegmentReference>}
 * @throws {shaka.util.Error}
 * @private
 */
shaka.media.WebmSegmentIndexParser.prototype.parseCues_ = function(
    cuesElement, segmentOffset, timecodeScale, duration, uris,
    presentationTimeOffset) {
  var references = [];
  var getUris = function() { return uris; };

  var parser = cuesElement.createParser();

  var lastTime = -1;
  var lastOffset = -1;

  while (parser.hasMoreData()) {
    var elem = parser.parseElement();
    if (elem.id != shaka.media.WebmSegmentIndexParser.CUE_POINT_ID) {
      continue;
    }

    var tuple = this.parseCuePoint_(elem);
    if (!tuple) {
      continue;
    }

    // Substract presentationTimeOffset from unscalled time
    var currentTime = timecodeScale *
        (tuple.unscaledTime - presentationTimeOffset);
    var currentOffset = segmentOffset + tuple.relativeOffset;

    if (lastTime >= 0) {
      goog.asserts.assert(lastOffset >= 0, 'last offset cannot be 0');

      references.push(
          new shaka.media.SegmentReference(
              references.length,
              lastTime, currentTime,
              getUris,
              lastOffset, currentOffset - 1));
    }

    lastTime = currentTime;
    lastOffset = currentOffset;
  }

  if (lastTime >= 0) {
    goog.asserts.assert(lastOffset >= 0, 'last offset cannot be 0');

    references.push(
        new shaka.media.SegmentReference(
            references.length, lastTime, duration, getUris, lastOffset, null));
  }

  return references;
};


/**
 * Parses a WebM CuePointElement to get an "unadjusted" segment reference.
 * @param {shaka.util.EbmlElement} cuePointElement
 * @return {{unscaledTime: number, relativeOffset: number}} The referenced
 *   segment's start time in units of [T] (see parseInfo_()), and the
 *   referenced segment's offset in bytes, relative to a WebM Segment
 *   element.
 * @throws {shaka.util.Error}
 * @private
 */
shaka.media.WebmSegmentIndexParser.prototype.parseCuePoint_ = function(
    cuePointElement) {
  var parser = cuePointElement.createParser();

  // Parse CueTime element.
  var cueTimeElement = parser.parseElement();
  if (cueTimeElement.id != shaka.media.WebmSegmentIndexParser.CUE_TIME_ID) {
    shaka.log.warning('Not a CueTime element.');
    throw new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.WEBM_CUE_TIME_ELEMENT_MISSING);
  }
  var unscaledTime = cueTimeElement.getUint();

  // Parse CueTrackPositions element.
  var cueTrackPositionsElement = parser.parseElement();
  if (cueTrackPositionsElement.id !=
      shaka.media.WebmSegmentIndexParser.CUE_TRACK_POSITIONS_ID) {
    shaka.log.warning('Not a CueTrackPositions element.');
    throw new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.WEBM_CUE_TRACK_POSITIONS_ELEMENT_MISSING);
  }

  var cueTrackParser = cueTrackPositionsElement.createParser();
  var relativeOffset = 0;

  while (cueTrackParser.hasMoreData()) {
    var elem = cueTrackParser.parseElement();
    if (elem.id != shaka.media.WebmSegmentIndexParser.CUE_CLUSTER_POSITION) {
      continue;
    }

    relativeOffset = elem.getUint();
    break;
  }

  return { unscaledTime: unscaledTime, relativeOffset: relativeOffset };
};

