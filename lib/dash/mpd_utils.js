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

goog.provide('shaka.dash.MpdUtils');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.Functional');
goog.require('shaka.util.XmlUtils');


/**
 * @namespace shaka.dash.MpdUtils
 * @summary MPD processing utility functions.
 */


/**
 * Specifies how tolerant the player is to inaccurate segment start times and
 * end times within a manifest. For example, gaps or overlaps between segments
 * in a SegmentTimeline which are greater than or equal to this value will
 * result in a warning message.
 *
 * @const {number}
 */
shaka.dash.MpdUtils.GAP_OVERLAP_TOLERANCE_SECONDS = 1 / 15;


/**
 * @typedef {{
 *   start: number,
 *   end: number
 * }}
 *
 * @description
 * Defines a time range of a media segment.  Times are in seconds.
 *
 * @property {number} start
 *   The start time of the range.
 * @property {number} end
 *   The end time (exclusive) of the range.
 */
shaka.dash.MpdUtils.TimeRange;


/**
 * @typedef {{
 *   timescale: number,
 *   segmentDuration: ?number,
 *   startNumber: number,
 *   presentationTimeOffset: number,
 *   timeline: Array.<shaka.dash.MpdUtils.TimeRange>
 * }}
 *
 * @description
 * Contains common information between SegmentList and SegmentTemplate items.
 *
 * @property {number} timescale
 *   The time-scale of the representation.
 * @property {?number} segmentDuration
 *   The duration of the segments in seconds, if given.
 * @property {number} startNumber
 *   The start number of the segments; 1 or greater.
 * @property {number} presentationTimeOffset
 *   The presentationTimeOffset of the representation, in seconds.
 * @property {Array.<shaka.dash.MpdUtils.TimeRange>} timeline
 *   The timeline of the representation, if given.  Times in seconds.
 */
shaka.dash.MpdUtils.SegmentInfo;


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
  if (time !== null) {
    goog.asserts.assert(Math.abs(time - Math.round(time)) < 0.2,
                        'Calculated $Time$ values must be close to integers!');
    time = Math.round(time);
  }

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
    goog.asserts.assert(value !== undefined, 'Unrecognized identifier');

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
 * Expands a SegmentTimeline into an array-based timeline.  The results are in
 * seconds.
 *
 * @param {!Element} segmentTimeline
 * @param {number} timescale
 * @param {number} presentationTimeOffset
 * @param {number} periodDuration The Period's duration in seconds.
 *   Infinity indicates that the Period continues indefinitely.
 * @return {!Array.<shaka.dash.MpdUtils.TimeRange>}
 */
shaka.dash.MpdUtils.createTimeline = function(
    segmentTimeline, timescale, presentationTimeOffset, periodDuration) {
  goog.asserts.assert(
      timescale > 0 && timescale < Infinity,
      'timescale must be a positive, finite integer');
  goog.asserts.assert(periodDuration > 0,
                      'period duration must be a positive integer');

  // Alias.
  var XmlUtils = shaka.util.XmlUtils;

  var timePoints = XmlUtils.findChildren(segmentTimeline, 'S');

  /** @type {!Array.<shaka.dash.MpdUtils.TimeRange>} */
  var timeline = [];
  var lastEndTime = 0;

  for (var i = 0; i < timePoints.length; ++i) {
    var timePoint = timePoints[i];
    var t = XmlUtils.parseAttr(timePoint, 't', XmlUtils.parseNonNegativeInt);
    var d = XmlUtils.parseAttr(timePoint, 'd', XmlUtils.parseNonNegativeInt);
    var r = XmlUtils.parseAttr(timePoint, 'r', XmlUtils.parseInt);

    // Adjust start considering the presentation time offset
    if (t != null)
      t -= presentationTimeOffset;

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
        if (periodDuration == Infinity) {
          // The DASH spec. actually allows the last "S" element to have a
          // negative repeat value even when the Period has an infinite
          // duration. No one uses this feature and no one ever should, ever.
          shaka.log.warning(
              'The last "S" element cannot have a negative repeat',
              'if the Period has an infinite duration:',
              'ignoring the last "S" element.',
              timePoint);
          return timeline;
        } else if (startTime / timescale >= periodDuration) {
          shaka.log.warning(
              'The last "S" element cannot have a negative repeat',
              'if its start time exceeds the Period\'s duration:',
              'igoring the last "S" element.',
              timePoint);
          return timeline;
        }
        repeat = Math.ceil((periodDuration * timescale - startTime) / d) - 1;
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
          shaka.dash.MpdUtils.GAP_OVERLAP_TOLERANCE_SECONDS) {
        shaka.log.warning(
            'SegmentTimeline contains a large gap/overlap:',
            'the content may have errors in it.',
            timePoint);
      }

      timeline[timeline.length - 1].end = startTime / timescale;
    }

    for (var j = 0; j <= repeat; ++j) {
      var endTime = startTime + d;
      timeline.push(
          {start: (startTime / timescale), end: (endTime / timescale)});

      startTime = endTime;
      lastEndTime = endTime;
    }
  }

  return timeline;
};


/**
 * Expands the first SegmentReference so it begins at the start of its Period
 * if it already begins close to the start of its Period, and expands or
 * contracts the last SegmentReference so it ends at the end of its Period for
 * VOD presentations.
 *
 * @param {boolean} dynamic
 * @param {?number} periodDuration
 * @param {!Array.<!shaka.media.SegmentReference>} references
 */
shaka.dash.MpdUtils.fitSegmentReferences = function(
    dynamic, periodDuration, references) {
  if (references.length == 0)
    return;

  /** @const {number} */
  var tolerance = shaka.dash.MpdUtils.GAP_OVERLAP_TOLERANCE_SECONDS;

  var firstReference = references[0];
  if (firstReference.startTime <= tolerance) {
    // Note: if the segment actually starts past 0, the video element should
    // automatically jump the gap since the gap is small.
    references[0] =
        new shaka.media.SegmentReference(
            firstReference.position,
            0, firstReference.endTime,
            firstReference.getUris,
            firstReference.startByte, firstReference.endByte);
  }

  if (dynamic)
    return;
  goog.asserts.assert(periodDuration != null,
                      'Period duration must be known for static content!');
  goog.asserts.assert(periodDuration != Infinity,
                      'Period duration must be finite for static content!');

  var lastReference = references[references.length - 1];

  // Sanity check.
  goog.asserts.assert(
      lastReference.startTime < periodDuration,
      'lastReference cannot begin after the end of the Period');
  if (lastReference.startTime > periodDuration) return;

  // Log warning if necessary.
  if (lastReference.endTime <= periodDuration - tolerance) {
    shaka.log.warning(
        'The last segment should not end before the end of the Period.',
        lastReference);
  } else if (lastReference.endTime >= periodDuration + tolerance) {
    shaka.log.warning(
        'The last segment should not end after the end of the Period.',
        lastReference);
  }

  // Adjust the last SegmentReference.
  references[references.length - 1] =
      new shaka.media.SegmentReference(
          lastReference.position,
          lastReference.startTime, periodDuration,
          lastReference.getUris,
          lastReference.startByte, lastReference.endByte);
};


/**
 * Resolves an array of relative URIs to the given base URIs.  This will result
 * in M*N number of URIs.
 *
 * @param {!Array.<string>} baseUris
 * @param {!Array.<string>} relativeUris
 * @return {!Array.<string>}
 */
shaka.dash.MpdUtils.resolveUris = function(baseUris, relativeUris) {
  var Functional = shaka.util.Functional;
  if (relativeUris.length == 0)
    return baseUris;

  var relativeAsGoog =
      relativeUris.map(function(uri) { return new goog.Uri(uri); });
  // Resolve each URI relative to each base URI, creating an Array of Arrays.
  // Then flatten the Arrays into a single Array.
  return baseUris.map(function(uri) { return new goog.Uri(uri); })
    .map(function(base) { return relativeAsGoog.map(base.resolve.bind(base)); })
    .reduce(Functional.collapseArrays, [])
    .map(function(uri) { return uri.toString(); });
};


/**
 * Parses common segment info for SegmentList and SegmentTemplate.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {function(?shaka.dash.DashParser.InheritanceFrame):Element} callback
 *   Gets the element that contains the segment info.
 * @return {shaka.dash.MpdUtils.SegmentInfo}
 */
shaka.dash.MpdUtils.parseSegmentInfo = function(context, callback) {
  goog.asserts.assert(
      callback(context.representation),
      'There must be at least one element of the given type.');
  var MpdUtils = shaka.dash.MpdUtils;
  var XmlUtils = shaka.util.XmlUtils;

  var timescaleStr = MpdUtils.inheritAttribute(context, callback, 'timescale');
  var timescale = 1;
  if (timescaleStr) {
    timescale = XmlUtils.parsePositiveInt(timescaleStr) || 1;
  }

  var durationStr = MpdUtils.inheritAttribute(context, callback, 'duration');
  var segmentDuration = XmlUtils.parsePositiveInt(durationStr || '');
  if (segmentDuration) {
    segmentDuration /= timescale;
  }

  var startNumberStr =
      MpdUtils.inheritAttribute(context, callback, 'startNumber');
  var presentationTimeOffset =
      MpdUtils.inheritAttribute(context, callback, 'presentationTimeOffset');
  var startNumber = XmlUtils.parseNonNegativeInt(startNumberStr || '');
  if (startNumberStr == null || startNumber == null)
    startNumber = 1;

  var timelineNode =
      MpdUtils.inheritChild(context, callback, 'SegmentTimeline');
  /** @type {Array.<shaka.dash.MpdUtils.TimeRange>} */
  var timeline = null;
  if (timelineNode) {
    timeline = MpdUtils.createTimeline(
        timelineNode, timescale, Number(presentationTimeOffset),
        context.periodInfo.duration || Infinity);
  }

  var pto = (Number(presentationTimeOffset) / timescale) || 0;
  return {
    timescale: timescale,
    segmentDuration: segmentDuration,
    startNumber: startNumber,
    presentationTimeOffset: pto,
    timeline: timeline
  };
};


/**
 * Searches the inheritance for a Segment* with the given attribute.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {function(?shaka.dash.DashParser.InheritanceFrame):Element} callback
 *   Gets the Element that contains the attribute to inherit.
 * @param {string} attribute
 * @return {?string}
 */
shaka.dash.MpdUtils.inheritAttribute = function(context, callback, attribute) {
  var Functional = shaka.util.Functional;
  goog.asserts.assert(
      callback(context.representation),
      'There must be at least one element of the given type');

  /** @type {!Array.<!Element>} */
  var nodes = [
    callback(context.representation),
    callback(context.adaptationSet),
    callback(context.period)
  ].filter(Functional.isNotNull);

  return nodes
      .map(function(s) { return s.getAttribute(attribute); })
      .reduce(function(all, part) { return all || part; });
};


/**
 * Searches the inheritance for a Segment* with the given child.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {function(?shaka.dash.DashParser.InheritanceFrame):Element} callback
 *   Gets the Element that contains the child to inherit.
 * @param {string} child
 * @return {Element}
 */
shaka.dash.MpdUtils.inheritChild = function(context, callback, child) {
  var Functional = shaka.util.Functional;
  goog.asserts.assert(
      callback(context.representation),
      'There must be at least one element of the given type');

  /** @type {!Array.<!Element>} */
  var nodes = [
    callback(context.representation),
    callback(context.adaptationSet),
    callback(context.period)
  ].filter(Functional.isNotNull);

  var XmlUtils = shaka.util.XmlUtils;
  return nodes
      .map(function(s) { return XmlUtils.findChild(s, child); })
      .reduce(function(all, part) { return all || part; });
};
