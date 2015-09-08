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
goog.require('shaka.dash.mpd');
goog.require('shaka.log');
goog.require('shaka.util.FailoverUri');


/**
 * @namespace shaka.dash.MpdUtils
 * @summary A set of MPD processing utility functions.
 */


/**
 * Any gap/overlap within a SegmentTimeline that is greater than or equal to
 * this value (in seconds) will generate a warning message.
 * @const {number}
 */
shaka.dash.MpdUtils.GAP_OVERLAP_WARN_THRESHOLD = 1.0 / 32.0;


/**
 * Generates a set of SegmentReferences from a SegmentTemplate with a 'duration'
 * attribute.
 *
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} firstSegmentNumber The segment number (one-based) of the
 *     first SegmentReference to generate, relative to the start of the
 *     Representation's Period.
 * @param {number} numSegments The number of SegmentReferences to generate.
 * @return {Array.<!shaka.media.SegmentReference>} The SegmentReferences on
 *     success; otherwise, null.
 */
shaka.dash.MpdUtils.generateSegmentReferences = function(
    networkCallback, representation, firstSegmentNumber, numSegments) {
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.timescale > 0);
  shaka.asserts.assert(representation.segmentTemplate.segmentDuration);
  shaka.asserts.assert(firstSegmentNumber > 0);

  var segmentTemplate = representation.segmentTemplate;

  /** @type {!Array.<!shaka.media.SegmentReference>} */
  var references = [];

  for (var i = 0; i < numSegments; ++i) {
    // The current segment number (one-based), relative to the start of the
    // Representation's Period.
    var segmentNumber = i + firstSegmentNumber;

    var startTime = (segmentNumber - 1) * segmentTemplate.segmentDuration;
    var endTime = startTime + segmentTemplate.segmentDuration;

    var scaledStartTime = startTime / segmentTemplate.timescale;
    var scaledEndTime = endTime / segmentTemplate.timescale;

    // Compute the media URL template placeholder replacements. Note
    // that |segmentReplacement| may be zero.
    var segmentReplacement = (segmentNumber - 1) + segmentTemplate.startNumber;
    var timeReplacement = (segmentNumber - 1) * segmentTemplate.segmentDuration;

    // Generate the media URL.
    var mediaUrl = shaka.dash.MpdUtils.createFromTemplate(
        networkCallback, representation, segmentReplacement, timeReplacement,
        0 /* startByte */, null /* endByte */);
    if (!mediaUrl) {
      // An error has already been logged.
      return null;
    }

    references.push(
        new shaka.media.SegmentReference(
            scaledStartTime,
            scaledEndTime,
            mediaUrl));
  }

  return references;
};


/**
 * Creates a FailoverUri from a relative template URL.
 *
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} number
 * @param {number} time
 * @param {number} startByte
 * @param {?number} endByte
 * @return {shaka.util.FailoverUri}
 */
shaka.dash.MpdUtils.createFromTemplate = function(
    networkCallback, representation, number, time, startByte, endByte) {
  shaka.asserts.assert(representation.segmentTemplate);
  if (!representation.segmentTemplate) return null;

  var urlTemplate = representation.segmentTemplate.mediaUrlTemplate;
  if (!urlTemplate) {
    shaka.log.warning(
        'The SegmentTemplate\'s media URL template is missing:',
        'using the Representation\'s BaseURL instead.',
        representation);
    return representation.baseUrl ?
        new shaka.util.FailoverUri(
            networkCallback, representation.baseUrl, startByte, endByte) :
        null;
  }

  var filledUrlTemplate = shaka.dash.MpdUtils.fillUrlTemplate(
      urlTemplate,
      representation.id,
      number,
      representation.bandwidth,
      time);

  if (!filledUrlTemplate) {
    // An error has already been logged.
    return null;
  }

  var mediaUrl = shaka.util.FailoverUri.resolve(
      representation.baseUrl, filledUrlTemplate);
  return new shaka.util.FailoverUri(
      networkCallback, mediaUrl, startByte, endByte);
};


/**
 * Fills a SegmentTemplate URL template.
 *
 * @see ISO/IEC 23009-1:2014 section 5.3.9.4.4
 *
 * @param {string} urlTemplate
 * @param {?string} representationId
 * @param {?number} number
 * @param {?number} bandwidth
 * @param {?number} time
 * @return {goog.Uri} A URL on success; otherwise, return null.
 */
shaka.dash.MpdUtils.fillUrlTemplate = function(
    urlTemplate, representationId, number, bandwidth, time) {
  /** @type {!Object.<string, ?number|?string>} */
  var valueTable = {
    'RepresentationID': representationId,
    'Number': number,
    'Bandwidth': bandwidth,
    'Time': time
  };

  var re = /\$(RepresentationID|Number|Bandwidth|Time)?(?:%0([0-9]+)d)?\$/g;
  var url = urlTemplate.replace(re, function(match, name, widthString) {
    if (match == '$$') {
      return '$';
    }

    var value = valueTable[name];
    shaka.asserts.assert(value !== undefined);

    // Note that |value| may be 0 or ''.
    if (value == null) {
      shaka.log.warning(
          'URL template does not have an available substitution for identifier',
          '"' + name + '":',
          urlTemplate);
      return match;
    }

    if (name == 'RepresentationID' && widthString) {
      shaka.log.warning(
          'URL template should not contain a width specifier for identifier',
          '"RepresentationID":',
          urlTemplate);
      widthString = undefined;
    }

    var valueString = value.toString();

    // Create padding string.
    var width = window.parseInt(widthString, 10) || 1;
    var paddingSize = Math.max(0, width - valueString.length);
    var padding = (new Array(paddingSize + 1)).join('0');

    return padding + valueString;
  });

  // The URL might contain illegal characters (e.g., '%').
  try {
    return new goog.Uri(url);
  } catch (exception) {
    if (exception instanceof URIError) {
      shaka.log.warning(
          'URL template contains an illegal character:', urlTemplate);
      return null;
    }
    throw exception;
  }
};


/**
 * Expands a SegmentTimeline into a simple array-based timeline.
 *
 * @param {shaka.dash.mpd.SegmentTimeline} segmentTimeline
 * @param {number} timescale
 * @param {number} durationSeconds The duration of the period (in seconds).
 * @return {!Array.<{start: number, end: number}>}
 */
shaka.dash.MpdUtils.createTimeline = function(
    segmentTimeline, timescale, durationSeconds) {
  shaka.asserts.assert(segmentTimeline);

  var lastEndTime = 0;
  var duration = durationSeconds * timescale;
  var timePoints = segmentTimeline.timePoints;

  /** @type {!Array.<{start: number, end: number}>} */
  var timeline = [];

  for (var i = 0; i < timePoints.length; ++i) {
    if (!timePoints[i].duration) {
      shaka.log.warning(
          'SegmentTimeline "S" element does not have a duration:',
          'ignoring the remaining "S" elements.',
          timePoints[i]);
      return timeline;
    }

    var tpStart = timePoints[i].startTime;
    var startTime = tpStart != null ? tpStart : lastEndTime;

    var repeat = timePoints[i].repeat || 0;
    if (repeat < 0) {
      var d = timePoints[i].duration;
      if (i + 1 === timePoints.length) {
        var delta = timePoints[0].startTime + duration - startTime;
        repeat = Math.ceil(delta / d) - 1;
      } else {
        var next = timePoints[i + 1].startTime;
        repeat = Math.ceil((next - startTime) / d) - 1;
      }
    }

    // The end of the last segment may end before the start of the current
    // segment (a gap) or may end after the start of the current segment (an
    // overlap). If there is a gap/overlap then stretch/compress the end of
    // the last segment to the start of the current segment.
    //
    // Note: it is possible to move the start of the current segment to the
    // end of the last segment, but this would complicate the computation of
    // the $Time$ placeholder.
    if ((timeline.length > 0) && (startTime != lastEndTime)) {
      var delta = startTime - lastEndTime;

      if (Math.abs(delta / timescale) >=
          shaka.dash.MpdUtils.GAP_OVERLAP_WARN_THRESHOLD) {
        shaka.log.warning(
            'SegmentTimeline contains a large gap/overlap.',
            'The content may have errors in it.',
            timePoints[i]);
      }

      timeline[timeline.length - 1].end = startTime;
    }

    for (var j = 0; j <= repeat; ++j) {
      var endTime = startTime + timePoints[i].duration;
      timeline.push({start: startTime, end: endTime});

      startTime = endTime;
      lastEndTime = endTime;
    }
  }

  return timeline;
};
