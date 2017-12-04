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

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Functional');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.XmlUtils');


/**
 * @namespace shaka.dash.MpdUtils
 * @summary MPD processing utility functions.
 */


/**
 * @typedef {{
 *   start: number,
 *   unscaledStart: number,
 *   end: number
 * }}
 *
 * @description
 * Defines a time range of a media segment.  Times are in seconds.
 *
 * @property {number} start
 *   The start time of the range.
 * @property {number} unscaledStart
 *   The start time of the range in representation timescale units.
 * @property {number} end
 *   The end time (exclusive) of the range.
 */
shaka.dash.MpdUtils.TimeRange;


/**
 * @typedef {{
 *   timescale: number,
 *   segmentDuration: ?number,
 *   startNumber: number,
 *   scaledPresentationTimeOffset: number,
 *   unscaledPresentationTimeOffset: number,
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
 * @property {number} scaledPresentationTimeOffset
 *   The presentation time offset of the representation, in seconds.
 * @property {number} unscaledPresentationTimeOffset
 *   The presentation time offset of the representation, in timescale units.
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
  if (time != null) {
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
 * @param {number} unscaledPresentationTimeOffset
 * @param {number} periodDuration The Period's duration in seconds.
 *   Infinity indicates that the Period continues indefinitely.
 * @return {!Array.<shaka.dash.MpdUtils.TimeRange>}
 */
shaka.dash.MpdUtils.createTimeline =
    function(segmentTimeline, timescale, unscaledPresentationTimeOffset,
             periodDuration) {
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
      t -= unscaledPresentationTimeOffset;

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
          shaka.util.ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS) {
        shaka.log.warning(
            'SegmentTimeline contains a large gap/overlap:',
            'the content may have errors in it.',
            timePoint);
      }

      timeline[timeline.length - 1].end = startTime / timescale;
    }

    for (var j = 0; j <= repeat; ++j) {
      var endTime = startTime + d;
      var item = {
        start: startTime / timescale,
        end: endTime / timescale,
        unscaledStart: startTime
      };
      timeline.push(item);

      startTime = endTime;
      lastEndTime = endTime;
    }
  }

  return timeline;
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
  var unscaledPresentationTimeOffset =
      Number(MpdUtils.inheritAttribute(context, callback,
                                       'presentationTimeOffset')) || 0;
  var startNumber = XmlUtils.parseNonNegativeInt(startNumberStr || '');
  if (startNumberStr == null || startNumber == null)
    startNumber = 1;

  var timelineNode =
      MpdUtils.inheritChild(context, callback, 'SegmentTimeline');
  /** @type {Array.<shaka.dash.MpdUtils.TimeRange>} */
  var timeline = null;
  if (timelineNode) {
    timeline = MpdUtils.createTimeline(
        timelineNode, timescale, unscaledPresentationTimeOffset,
        context.periodInfo.duration || Infinity);
  }

  var scaledPresentationTimeOffset =
      (unscaledPresentationTimeOffset / timescale) || 0;
  return {
    timescale: timescale,
    segmentDuration: segmentDuration,
    startNumber: startNumber,
    scaledPresentationTimeOffset: scaledPresentationTimeOffset,
    unscaledPresentationTimeOffset: unscaledPresentationTimeOffset,
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


/**
 * Parse some UTF8 data and return the resulting root element if
 * it was valid XML.
 * @param {ArrayBuffer} data
 * @param {!string} expectedRootElemName
 * @return {Element|undefined}
 */
shaka.dash.MpdUtils.parseXml = function(data, expectedRootElemName) {
  var parser = new DOMParser();
  var rootElem;
  var xml;
  try {
    var string = shaka.util.StringUtils.fromUTF8(data);
    xml = parser.parseFromString(string, 'text/xml');
  } catch (exception) {}
  if (xml) {
    // The top-level element in the loaded xml should have the
    // same type as the element linking.
    if (xml.documentElement.tagName == expectedRootElemName)
      rootElem = xml.documentElement;
  }
  if (rootElem && rootElem.getElementsByTagName('parsererror').length > 0)
    return null; // It had a parser error in it.

  return rootElem;
};


/**
 * Follow the xlink link contained in the given element.
 * It also strips the xlink properties off of the element,
 * even if the process fails.
 *
 * @param {!Element} element
 * @param {!shakaExtern.RetryParameters} retryParameters
 * @param {boolean} failGracefully
 * @param {!string} baseUri
 * @param {!shaka.net.NetworkingEngine} networkingEngine
 * @param {number} linkDepth
 * @return {!Promise.<!Element>}
 * @private
 */
shaka.dash.MpdUtils.handleXlinkInElement_ =
    function(element, retryParameters, failGracefully, baseUri,
             networkingEngine, linkDepth) {
  var MpdUtils = shaka.dash.MpdUtils;
  var Error = shaka.util.Error;
  var ManifestParserUtils = shaka.util.ManifestParserUtils;

  var xlinkHref = element.getAttribute('xlink:href');
  var xlinkActuate = element.getAttribute('xlink:actuate') || 'onRequest';

  // Remove the xlink properties, so it won't download again
  // when re-processed.
  for (var i = 0; i < element.attributes.length; i++) {
    var attribute = element.attributes[i].nodeName;
    if (attribute.indexOf('xlink:') != -1) {
      element.removeAttribute(attribute);
      i -= 1;
    }
  }

  if (linkDepth >= 5) {
    return Promise.reject(new Error(
        Error.Severity.CRITICAL, Error.Category.MANIFEST,
        Error.Code.DASH_XLINK_DEPTH_LIMIT));
  }

  if (xlinkActuate != 'onLoad') {
    // Only xlink:actuate="onLoad" is supported.
    // When no value is specified, the assumed value is "onRequest".
    return Promise.reject(new Error(
        Error.Severity.CRITICAL, Error.Category.MANIFEST,
        Error.Code.DASH_UNSUPPORTED_XLINK_ACTUATE));
  }

  // Resolve the xlink href, in case it's a relative URL.
  var uris = ManifestParserUtils.resolveUris([baseUri], [xlinkHref]);

  // Load in the linked elements.
  var requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
  var request = shaka.net.NetworkingEngine.makeRequest(
      uris, retryParameters);
  var requestPromise = networkingEngine.request(requestType, request);
  return requestPromise.then(function(response) {
    // This only supports the case where the loaded xml has a single
    // top-level element. If there are multiple roots, it will be rejected.
    var rootElem = MpdUtils.parseXml(response.data, element.tagName);
    if (!rootElem) {
      // It was not valid XML.
      return Promise.reject(new Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_INVALID_XML, xlinkHref));
    }

    // Now that there is no other possibility of the process erroring,
    // the element can be changed further.

    // Remove the current contents of the node.
    while (element.childNodes.length)
      element.removeChild(element.childNodes[0]);

    // Move the children of the loaded xml into the current element.
    while (rootElem.childNodes.length) {
      var child = rootElem.childNodes[0];
      rootElem.removeChild(child);
      element.appendChild(child);
    }

    // Move the attributes of the loaded xml into the current element.
    for (var i = 0; i < rootElem.attributes.length; i++) {
      var attribute = rootElem.attributes[i].nodeName;
      var attributeValue = rootElem.getAttribute(attribute);
      element.setAttribute(attribute, attributeValue);
    }

    return shaka.dash.MpdUtils.processXlinks(
        element, retryParameters, failGracefully, uris[0], networkingEngine,
        linkDepth + 1);
  }.bind(element));
};


/**
 * Filter the contents of a node recursively, replacing xlink links
 * with their associated online data.
 *
 * @param {!Element} element
 * @param {!shakaExtern.RetryParameters} retryParameters
 * @param {boolean} failGracefully
 * @param {!string} baseUri
 * @param {!shaka.net.NetworkingEngine} networkingEngine
 * @param {number=} opt_linkDepth
 * @return {!Promise.<!Element>}
 */
shaka.dash.MpdUtils.processXlinks =
    function(element, retryParameters, failGracefully, baseUri,
             networkingEngine, opt_linkDepth) {
  var MpdUtils = shaka.dash.MpdUtils;
  opt_linkDepth = opt_linkDepth || 0;

  if (element.getAttribute('xlink:href')) {
    var handled = MpdUtils.handleXlinkInElement_(
        element, retryParameters, failGracefully, baseUri,
        networkingEngine, opt_linkDepth);
    if (failGracefully) {
      // Catch any error and go on.
      handled = handled.catch(function() {
        // handleXlinkInElement_ strips the xlink properties off of the element
        // even if it fails, so calling processXlinks again will handle whatever
        // contents the element natively has.
        return MpdUtils.processXlinks(element, retryParameters, failGracefully,
                                      baseUri, networkingEngine,
                                      opt_linkDepth);
      });
    }
    return handled;
  }

  // Filter out any children that should be nulled.
  for (var i = 0; i < element.childNodes.length; i++) {
    var child = element.childNodes[i];
    if (child instanceof Element) {
      var resolveToZeroString = 'urn:mpeg:dash:resolve-to-zero:2013';
      if (child.getAttribute('xlink:href') == resolveToZeroString) {
        // This is a 'resolve to zero' code; it means the element should
        // be removed, as specified by the mpeg-dash rules for xlink.
        element.removeChild(child);
        i -= 1;
      }
    }
  }

  var childPromises = [];
  for (var i = 0; i < element.childNodes.length; i++) {
    var child = element.childNodes[i];
    if (child.nodeType == Node.ELEMENT_NODE) {
      // Replace the child with its processed form.
      var childPromise = shaka.dash.MpdUtils.processXlinks(
          /** @type {!Element} */ (child), retryParameters, failGracefully,
          baseUri, networkingEngine, opt_linkDepth);
      childPromises.push(childPromise);
    }
  }
  return Promise.all(childPromises).then(function() {
    return element;
  });
};
