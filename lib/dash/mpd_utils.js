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
  var MpdUtils = shaka.dash.MpdUtils;

  var timePoints = MpdUtils.findChildren(segmentTimeline, 'S');

  /** @type {!Array.<{start: number, end: number}>} */
  var timeline = [];
  var lastEndTime = 0;

  for (var i = 0; i < timePoints.length; ++i) {
    var timePoint = timePoints[i];
    var t = MpdUtils.parseAttr(timePoint, 't', MpdUtils.parseNonNegativeInt);
    var d = MpdUtils.parseAttr(timePoint, 'd', MpdUtils.parseNonNegativeInt);
    var r = MpdUtils.parseAttr(timePoint, 'r', MpdUtils.parseInt);

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
        var nextStartTime = MpdUtils.parseAttr(
            nextTimePoint, 't', MpdUtils.parseNonNegativeInt);
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


/**
 * Finds a child XML element.
 * @param {!Node} elem The parent XML element.
 * @param {string} name The child XML element's tag name.
 * @return {Node} The child XML element, or null if a child XML element does
 *     not exist with the given tag name OR if there exists more than one
 *     child XML element with the given tag name.
 */
shaka.dash.MpdUtils.findChild = function(elem, name) {
  var childElement = null;

  for (var i = 0; i < elem.childNodes.length; i++) {
    if (elem.childNodes[i].tagName != name)
      continue;
    if (childElement)
      return null;
    childElement = elem.childNodes[i];
  }

  return childElement;
};


/**
 * Finds child XML elements.
 * @param {!Node} elem The parent XML element.
 * @param {string} name The child XML element's tag name.
 * @return {!Array.<!Node>} The child XML elements.
 */
shaka.dash.MpdUtils.findChildren = function(elem, name) {
  var childElements = [];

  for (var i = 0; i < elem.childNodes.length; i++) {
    if (elem.childNodes[i].tagName == name)
      childElements.push(elem.childNodes[i]);
  }

  return childElements;
};


/**
 * Gets the text contents of a node.
 * @param {!Node} elem The XML element.
 * @return {?string} The text contents, or null if there are none.
 */
shaka.dash.MpdUtils.getContents = function(elem) {
  var contents = elem.firstChild;
  if (!contents || contents.nodeType != Node.TEXT_NODE)
    return null;

  return contents.nodeValue.trim();
};


/**
 * Parses an attribute by its name.
 * @param {!Node} elem The XML element.
 * @param {string} name The attribute name.
 * @param {function(string): (T|null)} parseFunction A function that parses
 *     the attribute.
 * @param {(T|null)=} opt_defaultValue The attribute's default value, if not
 *     specified, the attibute's default value is null.
 * @return {(T|null)} The parsed attribute on success, or the attribute's
 *     default value if the attribute does not exist or could not be parsed.
 * @template T
 */
shaka.dash.MpdUtils.parseAttr = function(
    elem, name, parseFunction, opt_defaultValue) {
  var parsedValue = null;

  var value = elem.getAttribute(name);
  if (value != null)
    parsedValue = parseFunction(value);

  if (parsedValue == null)
    return opt_defaultValue !== undefined ? opt_defaultValue : null;

  return parsedValue;
};


/**
 * Parses an XML date string.
 * @param {string} dateString
 * @return {?number} The parsed date in seconds on success; otherwise, return
 *     null.
 */
shaka.dash.MpdUtils.parseDate = function(dateString) {
  if (!dateString)
    return null;

  var result = Date.parse(dateString);
  return (!isNaN(result) ? Math.floor(result / 1000.0) : null);
};


/**
 * Parses an XML duration string.
 * Negative values are not supported. Years and months are treated as exactly
 * 365 and 30 days respectively.
 * @param {string} durationString The duration string, e.g., "PT1H3M43.2S",
 *     which means 1 hour, 3 minutes, and 43.2 seconds.
 * @return {?number} The parsed duration in seconds on success; otherwise,
 *     return null.
 * @see {@link http://www.datypic.com/sc/xsd/t-xsd_duration.html}
 */
shaka.dash.MpdUtils.parseDuration = function(durationString) {
  if (!durationString)
    return null;

  var re = '^P(?:([0-9]*)Y)?(?:([0-9]*)M)?(?:([0-9]*)D)?' +
           '(?:T(?:([0-9]*)H)?(?:([0-9]*)M)?(?:([0-9.]*)S)?)?$';
  var matches = new RegExp(re).exec(durationString);

  if (!matches) {
    shaka.log.warning('Invalid duration string:', durationString);
    return null;
  }

  // Note: Number(null) == 0 but Number(undefined) == NaN.
  var years = Number(matches[1] || null);
  var months = Number(matches[2] || null);
  var days = Number(matches[3] || null);
  var hours = Number(matches[4] || null);
  var minutes = Number(matches[5] || null);
  var seconds = Number(matches[6] || null);

  // Assume a year always has 365 days and a month always has 30 days.
  var d = (60 * 60 * 24 * 365) * years +
          (60 * 60 * 24 * 30) * months +
          (60 * 60 * 24) * days +
          (60 * 60) * hours +
          60 * minutes +
          seconds;
  return isFinite(d) ? d : null;
};


/**
 * Parses a range string.
 * @param {string} rangeString The range string, e.g., "101-9213".
 * @return {?{start: number, end: number}} The parsed range on success;
 *     otherwise, return null.
 */
shaka.dash.MpdUtils.parseRange = function(rangeString) {
  var matches = /([0-9]+)-([0-9]+)/.exec(rangeString);

  if (!matches)
    return null;

  var start = Number(matches[1]);
  if (!isFinite(start))
    return null;

  var end = Number(matches[2]);
  if (!isFinite(end))
    return null;

  return {start: start, end: end};
};


/**
 * Parses an integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed integer on success; otherwise, return null.
 */
shaka.dash.MpdUtils.parseInt = function(intString) {
  var n = Number(intString);
  return (n % 1 === 0) ? n : null;
};


/**
 * Parses a positive integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed positive integer on success; otherwise,
 *     return null.
 */
shaka.dash.MpdUtils.parsePositiveInt = function(intString) {
  var n = Number(intString);
  return (n % 1 === 0) && (n > 0) ? n : null;
};


/**
 * Parses a non-negative integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed non-negative integer on success; otherwise,
 *     return null.
 */
shaka.dash.MpdUtils.parseNonNegativeInt = function(intString) {
  var n = Number(intString);
  return (n % 1 === 0) && (n >= 0) ? n : null;
};


/**
 * Parses a floating point number.
 * @param {string} floatString The floating point number string.
 * @return {?number} The parsed floating point number on success; otherwise,
 *     return null. May return NEGATIVE_INFINITY or POSITIVE_INFINITY.
 */
shaka.dash.MpdUtils.parseFloat = function(floatString) {
  var n = Number(floatString);
  return !isNaN(n) ? n : null;
};

