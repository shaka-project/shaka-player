/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.EbmlElement');
goog.require('shaka.util.EbmlParser');
goog.require('shaka.util.FailoverUri');



/**
 * Creates a WebM Cues element parser.
 *
 * @constructor
 * @struct
 */
shaka.media.WebmSegmentIndexParser = function() {};


/**
 * Parses SegmentReferences from a WebM containeir.
 *
 * @param {!DataView} cuesData The WebM container's "Cueing Data" section.
 * @param {!DataView} initData The WebM container's headers.
 * @param {!Array.<!goog.Uri>} url The location of each SegmentReference.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {Array.<!shaka.media.SegmentReference>} SegmentReferences on success;
 *     otherwise, return null.
 */
shaka.media.WebmSegmentIndexParser.prototype.parse = function(
    cuesData, initData, url, networkCallback) {
  var references = null;

  try {
    references = this.parseInternal_(cuesData, initData, url, networkCallback);
  } catch (exception) {
    if (!(exception instanceof RangeError)) {
      throw exception;
    }
  }

  return references;
};


/** @const {number} */
shaka.media.WebmSegmentIndexParser.EBML_ID = 0x1a45dfa3;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.SEGMENT_ID = 0x18538067;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.INFO_ID = 0x1549a966;


/** @const {number} */
shaka.media.WebmSegmentIndexParser.TIMECODE_SCALE_ID = 0x2ad7b1;


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
 * @param {!DataView} cuesData
 * @param {!DataView} initData
 * @return {Array.<!shaka.media.SegmentReference>} SegmentReferences on success;
 *     otherwise, return null.
 * @param {!Array.<!goog.Uri>} url The location of each SegmentReference.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @throws {RangeError}
 * @see http://www.matroska.org/technical/specs/index.html
 * @see http://www.webmproject.org/docs/container/
 * @private
 */
shaka.media.WebmSegmentIndexParser.prototype.parseInternal_ = function(
    cuesData, initData, url, networkCallback) {
  var tuple = this.parseWebmContainer_(initData);
  if (!tuple) {
    return null;
  }

  var parser = new shaka.util.EbmlParser(cuesData);
  var cuesElement = parser.parseElement();
  if (cuesElement.id != shaka.media.WebmSegmentIndexParser.CUES_ID) {
    shaka.log.error('CuesElement does not exist.');
    return null;
  }

  return this.parseCues_(
      cuesElement, tuple.segmentOffset, tuple.timecodeScale, url,
      networkCallback);
};


/**
 * Parses a WebM container to get the segment's offset and timecode scale.
 * @param {!DataView} initData
 * @return {?{segmentOffset: number, timecodeScale: number}} The segment's
 *     offset in bytes, and the segment's timecode scale in seconds.
 * @private
 */
shaka.media.WebmSegmentIndexParser.prototype.parseWebmContainer_ = function(
    initData) {
  var parser = new shaka.util.EbmlParser(initData);

  // Check that the WebM container data starts with the EBML header, but
  // skip its contents.
  var ebmlElement = parser.parseElement();
  if (ebmlElement.id != shaka.media.WebmSegmentIndexParser.EBML_ID) {
    shaka.log.error('EBML element does not exist.');
    return null;
  }

  var segmentElement = parser.parseElement();
  if (segmentElement.id != shaka.media.WebmSegmentIndexParser.SEGMENT_ID) {
    shaka.log.error('Segment element does not exist.');
    return null;
  }

  // This value is used as the initial offset to the first referenced segment.
  var segmentOffset = segmentElement.getOffset();

  // Parse the Segment element to get the segment's timecode scale.
  var timecodeScale = this.parseSegment_(segmentElement);
  if (!timecodeScale) {
    return null;
  }

  return { segmentOffset: segmentOffset, timecodeScale: timecodeScale };
};


/**
 * Parses a WebM Info element to get the segment's timecode scale.
 * @param {!shaka.util.EbmlElement} segmentElement
 * @return {?number} The segment's timecode scale in seconds, or null if an
 *     error occurred.
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
    shaka.log.error('Info element does not exist.');
    return null;
  }

  return this.parseInfo_(infoElement);
};


/**
 * Parses a WebM Info element to get the segment's timecode scale.
 * @param {!shaka.util.EbmlElement} infoElement
 * @return {number} The segment's timecode scale in seconds.
 * @private
 */
shaka.media.WebmSegmentIndexParser.prototype.parseInfo_ = function(
    infoElement) {
  var parser = infoElement.createParser();

  // The timecode scale factor in units of [nanoseconds / T], where [T] are the
  // units used to express all other time values in the WebM container. By
  // default it's assumed that [T] == [milliseconds].
  var timecodeScaleNanoseconds = 1000000;

  while (parser.hasMoreData()) {
    var elem = parser.parseElement();
    if (elem.id != shaka.media.WebmSegmentIndexParser.TIMECODE_SCALE_ID) {
      continue;
    }

    timecodeScaleNanoseconds = elem.getUint();

    break;
  }

  // The timecode scale factor in units of [seconds / T].
  var timecodeScale = timecodeScaleNanoseconds / 1000000000;

  return timecodeScale;
};


/**
 * Parses a WebM CuesElement.
 * @param {!shaka.util.EbmlElement} cuesElement
 * @param {number} segmentOffset
 * @param {number} timecodeScale
 * @param {!Array.<!goog.Uri>} url
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {!Array.<!shaka.media.SegmentReference>}
 * @private
 */
shaka.media.WebmSegmentIndexParser.prototype.parseCues_ = function(
    cuesElement, segmentOffset, timecodeScale, url, networkCallback) {
  var references = [];

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

    var currentTime = timecodeScale * tuple.unscaledTime;
    var currentOffset = segmentOffset + tuple.relativeOffset;

    if (lastTime >= 0) {
      shaka.asserts.assert(lastOffset >= 0);

      var failover = new shaka.util.FailoverUri(
          networkCallback, url, lastOffset, currentOffset - 1);
      references.push(
          new shaka.media.SegmentReference(lastTime, currentTime, failover));
    }

    lastTime = currentTime;
    lastOffset = currentOffset;
  }

  if (lastTime >= 0) {
    shaka.asserts.assert(lastOffset >= 0);

    var failover = new shaka.util.FailoverUri(networkCallback, url,
                                              lastOffset, null);
    references.push(
        new shaka.media.SegmentReference(lastTime, null, failover));
  }

  return references;
};


/**
 * Parses a WebM CuePointElement to get an "unadjusted" segment reference.
 * @param {shaka.util.EbmlElement} cuePointElement
 * @return {?{unscaledTime: number, relativeOffset: number}} The referenced
 *     segment's start time in units of [T] (see parseInfo_()), and the
 *     referenced segment's offset in bytes, relative to a WebM Segment
 *     element.
 * @private
 */
shaka.media.WebmSegmentIndexParser.prototype.parseCuePoint_ = function(
    cuePointElement) {
  var parser = cuePointElement.createParser();

  // Parse CueTime element.
  var cueTimeElement = parser.parseElement();
  if (cueTimeElement.id != shaka.media.WebmSegmentIndexParser.CUE_TIME_ID) {
    shaka.log.warning('CueTime element does not exist.');
    return null;
  }
  var unscaledTime = cueTimeElement.getUint();

  // Parse CueTrackPositions element.
  var cueTrackPositionsElement = parser.parseElement();
  if (cueTrackPositionsElement.id !=
      shaka.media.WebmSegmentIndexParser.CUE_TRACK_POSITIONS_ID) {
    shaka.log.warning('CueTrackPositions element does not exist.');
    return null;
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

