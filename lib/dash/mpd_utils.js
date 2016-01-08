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

goog.provide('shaka.dash.MpdUtils');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.util.XmlUtils');


/**
 * @namespace shaka.dash.MpdUtils
 * @summary MPD processing utility functions.
 */


/**
 * Any gap/overlap within a SegmentTimeline that is greater than or equal to
 * this value (in seconds) will generate a warning message.
 * @const {number}
 */
shaka.dash.MpdUtils.GAP_OVERLAP_WARN_THRESHOLD = 1.0 / 32.0;


/**
 * Fills a SegmentTemplate URI template. This function does not validate the
 * resulting URI.
 *
 * @param {string} uriTemplate
 * @param {?string} representationId
 * @param {?number} number
 * @param {?number} bandwidth
 * @param {?number} time
 * @return {string} A URI string.
 * @see ISO/IEC 23009-1:2014 section 5.3.9.4.4
 */
shaka.dash.MpdUtils.fillUriTemplate = function(
    uriTemplate, representationId, number, bandwidth, time) {
  /** @type {!Object.<string, ?number|?string>} */
  var valueTable = {
    'RepresentationID': representationId,
    'Number': number,
    'Bandwidth': bandwidth,
    'Time': time
  };

  var re = /\$(RepresentationID|Number|Bandwidth|Time)?(?:%0([0-9]+)d)?\$/g;
  var uri = uriTemplate.replace(re, function(match, name, widthString) {
    if (match == '$$') {
      return '$';
    }

    var value = valueTable[name];
    shaka.asserts.assert(value !== undefined, 'Unrecognized identifier');

    // Note that |value| may be 0 or ''.
    if (value == null) {
      shaka.log.warning(
          'URL template does not have an available substitution for identifier',
          '"' + name + '":',
          uriTemplate);
      return match;
    }

    if (name == 'RepresentationID' && widthString) {
      shaka.log.warning(
          'URL template should not contain a width specifier for identifier',
          '"RepresentationID":',
          uriTemplate);
      widthString = undefined;
    }

    var valueString = value.toString();

    // Create padding string.
    var width = window.parseInt(widthString, 10) || 1;
    var paddingSize = Math.max(0, width - valueString.length);
    var padding = (new Array(paddingSize + 1)).join('0');

    return padding + valueString;
  });

  return uri;
};


/**
 * Expands a SegmentTimeline into an array-based timeline.
 *
 * @param {!Node} segmentTimeline
 * @param {number} timescale
 * @param {number} periodDuration The Period's duration in seconds.
 *     POSITIVE_INFINITY indicates that the Period continues indefinitely.
 * @return {!Array.<{start: number, end: number}>}
 */
shaka.dash.MpdUtils.createTimeline = function(
    segmentTimeline, timescale, periodDuration) {
  shaka.asserts.assert(timescale > 0 &&
                       timescale < Number.POSITIVE_INFINITY,
                       'timescale must be a positive, finite integer');
  shaka.asserts.assert(periodDuration > 0,
                       'period duration must be a positive integer');

  // Alias.
  var XmlUtils = shaka.util.XmlUtils;

  var timePoints = XmlUtils.findChildren(segmentTimeline, 'S');

  /** @type {!Array.<{start: number, end: number}>} */
  var timeline = [];
  var lastEndTime = 0;

  for (var i = 0; i < timePoints.length; ++i) {
    var timePoint = timePoints[i];
    var t = XmlUtils.parseAttr(timePoint, 't', XmlUtils.parseNonNegativeInt);
    var d = XmlUtils.parseAttr(timePoint, 'd', XmlUtils.parseNonNegativeInt);
    var r = XmlUtils.parseAttr(timePoint, 'r', XmlUtils.parseInt);

    if (!d) {
      shaka.log.warning(
          '"S" element must have a duration:',
          'ignoring the remaining "S" elements.',
          timePoint);
      return timeline;
    }

    var startTime = t != null ? t : lastEndTime;

    var repeat = r || 0;
    if (repeat < 0) {
      if (i + 1 < timePoints.length) {
        var nextTimePoint = timePoints[i + 1];
        var nextStartTime = XmlUtils.parseAttr(
            nextTimePoint, 't', XmlUtils.parseNonNegativeInt);
        if (nextStartTime == null) {
          shaka.log.warning(
              '"S" element cannot have a negative repeat',
              'if the next "S" element does not have a valid start time:',
              'ignoring the remaining "S" elements.',
              timePoint);
          return timeline;
        } else if (startTime >= nextStartTime) {
          shaka.log.warning(
              '"S" element cannot have a negative repeat',
              'if its start time exceeds the next "S" element\'s start time:',
              'ignoring the remaining "S" elements.',
              timePoint);
          return timeline;
        }
        repeat = Math.ceil((nextStartTime - startTime) / d) - 1;
      } else {
        if (periodDuration == Number.POSITIVE_INFINITY) {
          // The DASH spec. actually allows the last "S" element to have a
          // negative repeat value even when the Period has an infinite
          // duration. No one uses this feature and no one ever should, ever.
          shaka.log.warning(
              'The last "S" element cannot have a negative repeat',
              'if the Period has an infinite duration:',
              'ignoring the last "S" element.',
              timePoint);
          return timeline;
        } else if (startTime >= periodDuration) {
          shaka.log.warning(
              'The last "S" element cannot have a negative repeat',
              'if its start time exceeds the Period\'s duration:',
              'igoring the last "S" element.',
              timePoint);
          return timeline;
        }
        repeat = Math.ceil((periodDuration - startTime) / d) - 1;
      }
    }

    // The end of the last segment may end before the start of the current
    // segment (a gap) or may end after the start of the current segment (an
    // overlap). If there is a gap/overlap then stretch/compress the end of
    // the last segment to the start of the current segment.
    //
    // Note: it is possible to move the start of the current segment to the
    // end of the last segment, but this would complicate the computation of
    // the $Time$ placeholder later on.
    if ((timeline.length > 0) && (startTime != lastEndTime)) {
      var delta = startTime - lastEndTime;

      if (Math.abs(delta / timescale) >=
          shaka.dash.MpdUtils.GAP_OVERLAP_WARN_THRESHOLD) {
        shaka.log.warning(
            'SegmentTimeline contains a large gap/overlap:',
            'the content may have errors in it.',
            timePoint);
      }

      timeline[timeline.length - 1].end = startTime;
    }

    for (var j = 0; j <= repeat; ++j) {
      var endTime = startTime + d;
      timeline.push({start: startTime, end: endTime});

      startTime = endTime;
      lastEndTime = endTime;
    }
  }

  return timeline;
};
