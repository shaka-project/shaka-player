/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.dash.MpdUtils');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.TXml');
goog.requireType('shaka.dash.DashParser');
goog.requireType('shaka.media.PresentationTimeline');


/**
 * @summary MPD processing utility functions.
 */
shaka.dash.MpdUtils = class {
  /**
   * Fills a SegmentTemplate URI template.  This function does not validate the
   * resulting URI.
   *
   * @param {string} uriTemplate
   * @param {?string} representationId
   * @param {?number} number
   * @param {?number} subNumber
   * @param {?number} bandwidth
   * @param {?(number|bigint)} time
   * @return {string} A URI string.
   * @see ISO/IEC 23009-1:2014 section 5.3.9.4.4
   */
  static fillUriTemplate(
      uriTemplate, representationId, number, subNumber, bandwidth, time) {
    /** @type {!Map<string, ?number | ?string>} */
    const valueTable = new Map()
        .set('RepresentationID', representationId)
        .set('Number', number)
        .set('SubNumber', subNumber)
        .set('Bandwidth', bandwidth)
        .set('Time', time);

    // cspell: disable-next-line
    const re = /\$(RepresentationID|Number|SubNumber|Bandwidth|Time)?(?:%0([0-9]+)([diouxX]))?\$/g;  // eslint-disable-line @stylistic/max-len
    const uri = uriTemplate.replace(re, (match, name, widthStr, format) => {
      if (match == '$$') {
        return '$';
      }

      let value = valueTable.get(name);
      goog.asserts.assert(value !== undefined, 'Unrecognized identifier');

      // Note that |value| may be 0 or ''.
      if (value == null) {
        shaka.log.warning(
            'URL template does not have an available substitution for ',
            'identifier "' + name + '":',
            uriTemplate);
        return match;
      }

      if (name == 'RepresentationID' && widthStr) {
        shaka.log.warning(
            'URL template should not contain a width specifier for identifier',
            '"RepresentationID":',
            uriTemplate);
        widthStr = undefined;
      }

      if (name == 'Time') {
        if (typeof value != 'bigint') {
          goog.asserts.assert(typeof value == 'number',
              'Time value should be a number or bigint!');
          if (Math.abs(value - Math.round(value)) >= 0.2) {
            shaka.log.alwaysWarn(
                'Calculated $Time$ values must be close to integers');
          }
          value = Math.round(value);
        }
      }

      /** @type {string} */
      let valueString;
      switch (format) {
        case undefined:  // Happens if there is no format specifier.
        case 'd':
        case 'i':
        case 'u':
          valueString = value.toString();
          break;
        case 'o':
          valueString = value.toString(8);
          break;
        case 'x':
          valueString = value.toString(16);
          break;
        case 'X':
          valueString = value.toString(16).toUpperCase();
          break;
        default:
          goog.asserts.assert(false, 'Unhandled format specifier');
          valueString = value.toString();
          break;
      }

      // Create a padding string.
      const width = window.parseInt(widthStr, 10) || 1;
      const paddingSize = Math.max(0, width - valueString.length);
      const padding = (new Array(paddingSize + 1)).join('0');

      return padding + valueString;
    });

    return uri;
  }

  /**
   * Expands a SegmentTimeline into an array-based timeline.  The results are in
   * seconds.
   *
   * @param {Array<!shaka.extern.xml.Node>} timePoints
   * @param {number} timescale
   * @param {number} unscaledPresentationTimeOffset
   * @param {number} periodDuration The Period's duration in seconds.
   *   Infinity indicates that the Period continues indefinitely.
   * @param {number} startNumber
   * @return {!Array<shaka.media.PresentationTimeline.TimeRange>}
   */
  static createTimeline(
      timePoints, timescale, unscaledPresentationTimeOffset,
      periodDuration, startNumber) {
    goog.asserts.assert(
        timescale > 0 && timescale < Infinity,
        'timescale must be a positive, finite integer');
    goog.asserts.assert(
        periodDuration > 0, 'period duration must be a positive integer');

    // Alias.
    const TXml = shaka.util.TXml;

    /** @type {!Array<shaka.media.PresentationTimeline.TimeRange>} */
    const timeline = [];
    let lastEndTime = -unscaledPresentationTimeOffset;

    for (let i = 0; i < timePoints.length; ++i) {
      const timePoint = timePoints[i];
      const next = timePoints[i + 1];
      let t = TXml.parseAttr(timePoint, 't', TXml.parseNonNegativeInt);
      const d =
          TXml.parseAttr(timePoint, 'd', TXml.parseNonNegativeInt);
      const r = TXml.parseAttr(timePoint, 'r', TXml.parseInt);

      const k = TXml.parseAttr(timePoint, 'k', TXml.parseInt);

      const partialSegments = k || 0;

      // Adjust the start time to account for the presentation time offset.
      if (t != null) {
        t -= unscaledPresentationTimeOffset;
      }

      if (!d) {
        shaka.log.warning(
            '"S" element must have a duration: ignoring this element.',
            timePoint);
        continue;
      }

      let startTime = t != null ? t : lastEndTime;

      let repeat = r || 0;
      if (repeat < 0) {
        if (next) {
          const nextStartTime =
              TXml.parseAttr(next, 't', TXml.parseNonNegativeInt);
          if (nextStartTime == null) {
            shaka.log.warning(
                'An "S" element cannot have a negative repeat',
                'if the next "S" element does not have a valid start time:',
                'ignoring the remaining "S" elements.', timePoint);
            return timeline;
          } else if (startTime >= nextStartTime) {
            shaka.log.warning(
                'An "S" element cannot have a negative repeat if its start ',
                'time exceeds the next "S" element\'s start time:',
                'ignoring the remaining "S" elements.', timePoint);
            return timeline;
          }
          repeat = Math.ceil((nextStartTime - startTime) / d) - 1;
        } else {
          if (periodDuration == Infinity) {
            // The DASH spec. actually allows the last "S" element to have a
            // negative repeat value even when the Period has an infinite
            // duration.  No one uses this feature and no one ever should,
            // ever.
            shaka.log.warning(
                'The last "S" element cannot have a negative repeat',
                'if the Period has an infinite duration:',
                'ignoring the last "S" element.', timePoint);
            return timeline;
          } else if (startTime / timescale >= periodDuration) {
            shaka.log.warning(
                'The last "S" element cannot have a negative repeat',
                'if its start time exceeds the Period\'s duration:',
                'ignoring the last "S" element.', timePoint);
            return timeline;
          }
          repeat = Math.ceil((periodDuration * timescale - startTime) / d) - 1;
        }
      }

      // The end of the last segment may be before the start of the current
      // segment (a gap) or after the start of the current segment (an
      // overlap). If there is a gap/overlap then stretch/compress the end of
      // the last segment to the start of the current segment.
      //
      // Note: it is possible to move the start of the current segment to the
      // end of the last segment, but this would complicate the computation of
      // the $Time$ placeholder later on.
      if ((timeline.length > 0) && (startTime != lastEndTime)) {
        const delta = startTime - lastEndTime;

        if (Math.abs(delta / timescale) >=
            shaka.util.ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS) {
          shaka.log.warning(
              'SegmentTimeline contains a large gap/overlap:',
              'the content may have errors in it.', timePoint);
        }

        timeline[timeline.length - 1].end = startTime / timescale;
      }

      for (let j = 0; j <= repeat; ++j) {
        const endTime = startTime + d;
        const item = {
          start: startTime / timescale,
          end: endTime / timescale,
          unscaledStart: startTime,
          partialSegments: partialSegments,
          segmentPosition: timeline.length + startNumber,
        };
        timeline.push(item);

        startTime = endTime;
        lastEndTime = endTime;
      }
    }

    return timeline;
  }

  /**
   * Parses common segment info for SegmentList and SegmentTemplate.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {function(?shaka.dash.DashParser.InheritanceFrame):
   *   ?shaka.extern.xml.Node} callback
   *   Gets the element that contains the segment info.
   * @return {shaka.dash.MpdUtils.SegmentInfo}
   */
  static parseSegmentInfo(context, callback) {
    goog.asserts.assert(
        callback(context.representation),
        'There must be at least one element of the given type.');
    const MpdUtils = shaka.dash.MpdUtils;
    const TXml = shaka.util.TXml;

    const timescaleStr =
        MpdUtils.inheritAttribute(context, callback, 'timescale');
    let timescale = 1;
    if (timescaleStr) {
      timescale = TXml.parsePositiveInt(timescaleStr) || 1;
    }

    const durationStr =
        MpdUtils.inheritAttribute(context, callback, 'duration');
    const unscaledSegmentDuration = TXml.parsePositiveInt(durationStr || '');
    const segmentDuration = unscaledSegmentDuration ?
        unscaledSegmentDuration / timescale : null;

    const startNumberStr =
        MpdUtils.inheritAttribute(context, callback, 'startNumber');
    const unscaledPresentationTimeOffset =
        Number(MpdUtils.inheritAttribute(context, callback,
            'presentationTimeOffset')) || 0;
    let startNumber = TXml.parseNonNegativeInt(startNumberStr || '');
    if (startNumberStr == null || startNumber == null) {
      startNumber = 1;
    }

    /** @type {Array<shaka.media.PresentationTimeline.TimeRange>} */
    let timeline = null;
    const timelineNode =
        MpdUtils.inheritChild(context, callback, 'SegmentTimeline');
    if (timelineNode) {
      const timePoints = TXml.findChildren(timelineNode, 'S');
      timeline = MpdUtils.createTimeline(
          timePoints, timescale, unscaledPresentationTimeOffset,
          context.periodInfo.duration || Infinity, startNumber);
    }

    const scaledPresentationTimeOffset =
        (unscaledPresentationTimeOffset / timescale) || 0;
    return {
      timescale: timescale,
      unscaledSegmentDuration: unscaledSegmentDuration,
      segmentDuration: segmentDuration,
      startNumber: startNumber,
      scaledPresentationTimeOffset: scaledPresentationTimeOffset,
      unscaledPresentationTimeOffset: unscaledPresentationTimeOffset,
      timeline: timeline,
    };
  }

  /**
   * Parses common attributes for Representation, AdaptationSet, and Period.
   * @param {shaka.dash.DashParser.Context} context
   * @param {function(?shaka.dash.DashParser.InheritanceFrame):
   *    ?shaka.extern.xml.Node} callback
   * @return {!Array<!shaka.extern.xml.Node>}
   */
  static getNodes(context, callback) {
    const Functional = shaka.util.Functional;
    goog.asserts.assert(
        callback(context.representation),
        'There must be at least one element of the given type.',
    );

    return [
      callback(context.representation),
      callback(context.adaptationSet),
      callback(context.period),
    ].filter(Functional.isNotNull);
  }

  /**
   * Searches the inheritance for a Segment* with the given attribute.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {function(?shaka.dash.DashParser.InheritanceFrame):
   *   ?shaka.extern.xml.Node} callback
   *   Gets the Element that contains the attribute to inherit.
   * @param {string} attribute
   * @return {?string}
   */
  static inheritAttribute(context, callback, attribute) {
    const MpdUtils = shaka.dash.MpdUtils;
    const nodes = MpdUtils.getNodes(context, callback);

    let result = null;
    for (const node of nodes) {
      result = node.attributes[attribute];
      if (result) {
        break;
      }
    }
    return result;
  }

  /**
   * Searches the inheritance for a Segment* with the given child.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {function(?shaka.dash.DashParser.InheritanceFrame):
   *   ?shaka.extern.xml.Node} callback
   *   Gets the Element that contains the child to inherit.
   * @param {string} child
   * @return {?shaka.extern.xml.Node}
   */
  static inheritChild(context, callback, child) {
    const MpdUtils = shaka.dash.MpdUtils;
    const nodes = MpdUtils.getNodes(context, callback);

    const TXml = shaka.util.TXml;
    let result = null;
    for (const node of nodes) {
      result = TXml.findChild(node, child);
      if (result) {
        break;
      }
    }
    return result;
  }

  /**
   * Follow the xlink link contained in the given element.
   * It also strips the xlink properties off of the element,
   * even if the process fails.
   *
   * @param {!shaka.extern.xml.Node} element
   * @param {!shaka.extern.RetryParameters} retryParameters
   * @param {boolean} failGracefully
   * @param {string} baseUri
   * @param {!shaka.net.NetworkingEngine} networkingEngine
   * @param {number} linkDepth
   * @return {!shaka.util.AbortableOperation.<!shaka.extern.xml.Node>}
   * @private
   */
  static handleXlinkInElement_(
      element, retryParameters, failGracefully, baseUri, networkingEngine,
      linkDepth) {
    const MpdUtils = shaka.dash.MpdUtils;
    const TXml = shaka.util.TXml;
    const Error = shaka.util.Error;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const NS = MpdUtils.XlinkNamespaceUri_;

    const xlinkHref = TXml.getAttributeNS(element, NS, 'href');
    const xlinkActuate =
        TXml.getAttributeNS(element, NS, 'actuate') || 'onRequest';

    // Remove the xlink properties, so it won't download again
    // when re-processed.
    for (const key of Object.keys(element.attributes)) {
      const segments = key.split(':');
      const namespace = shaka.util.TXml.getKnownNameSpace(NS);
      if (segments[0] == namespace) {
        delete element.attributes[key];
      }
    }

    if (linkDepth >= 5) {
      return shaka.util.AbortableOperation.failed(new Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_XLINK_DEPTH_LIMIT));
    }

    if (xlinkActuate != 'onLoad') {
      // Only xlink:actuate="onLoad" is supported.
      // When no value is specified, the assumed value is "onRequest".
      return shaka.util.AbortableOperation.failed(new Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_UNSUPPORTED_XLINK_ACTUATE));
    }

    // Resolve the xlink href, in case it's a relative URL.
    const uris = ManifestParserUtils.resolveUris([baseUri], [xlinkHref]);

    // Load in the linked elements.
    const requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
    const request =
        shaka.net.NetworkingEngine.makeRequest(uris, retryParameters);

    const requestOperation = networkingEngine.request(requestType, request);
    // The interface is abstract, but we know it was implemented with the
    // more capable internal class.
    goog.asserts.assert(
        requestOperation instanceof shaka.util.AbortableOperation,
        'Unexpected implementation of IAbortableOperation!');
    // Satisfy the compiler with a cast.
    const networkOperation =
    /** @type {!shaka.util.AbortableOperation.<shaka.extern.Response>} */ (
        requestOperation);

    // Chain onto that operation.
    return networkOperation.chain(
        (response) => {
          // This only supports the case where the loaded xml has a single
          // top-level element.  If there are multiple roots, it will be
          // rejected.
          const rootElem =
              TXml.parseXml(response.data, element.tagName);
          if (!rootElem) {
            // It was not valid XML.
            return shaka.util.AbortableOperation.failed(new Error(
                Error.Severity.CRITICAL, Error.Category.MANIFEST,
                Error.Code.DASH_INVALID_XML, xlinkHref));
          }

          // Now that there is no other possibility of the process erroring,
          // the element can be changed further.

          // Remove the current contents of the node.
          element.children = [];

          // Move the children of the loaded xml into the current element.
          while (rootElem.children.length) {
            const child = rootElem.children.shift();
            element.children.push(child);
          }

          // Move the attributes of the loaded xml into the current element.
          for (const key of Object.keys(rootElem.attributes)) {
            element.attributes[key] = rootElem.attributes[key];
          }

          return shaka.dash.MpdUtils.processXlinks(
              element, retryParameters, failGracefully, uris[0],
              networkingEngine, linkDepth + 1);
        });
  }

  /**
   * Filter the contents of a node recursively, replacing xlink links
   * with their associated online data.
   *
   * @param {!shaka.extern.xml.Node} element
   * @param {!shaka.extern.RetryParameters} retryParameters
   * @param {boolean} failGracefully
   * @param {string} baseUri
   * @param {!shaka.net.NetworkingEngine} networkingEngine
   * @param {number=} linkDepth default set to 0
   * @return {!shaka.util.AbortableOperation.<!shaka.extern.xml.Node>}
   */
  static processXlinks(
      element, retryParameters,
      failGracefully, baseUri, networkingEngine,
      linkDepth = 0) {
    const MpdUtils = shaka.dash.MpdUtils;
    const TXml = shaka.util.TXml;
    const NS = MpdUtils.XlinkNamespaceUri_;

    if (TXml.getAttributeNS(element, NS, 'href')) {
      let handled = MpdUtils.handleXlinkInElement_(
          element, retryParameters, failGracefully,
          baseUri, networkingEngine, linkDepth);
      if (failGracefully) {
        // Catch any error and go on.
        handled = handled.chain(undefined, (error) => {
          // handleXlinkInElement_ strips the xlink properties off of the
          // element even if it fails, so calling processXlinks again will
          // handle whatever contents the element natively has.
          return MpdUtils.processXlinks(
              element, retryParameters, failGracefully, baseUri,
              networkingEngine, linkDepth);
        });
      }
      return handled;
    }

    const childOperations = [];
    for (const child of shaka.util.TXml.getChildNodes(element)) {
      const resolveToZeroString = 'urn:mpeg:dash:resolve-to-zero:2013';
      if (TXml.getAttributeNS(child, NS, 'href') == resolveToZeroString) {
        // This is a 'resolve to zero' code; it means the element should
        // be removed, as specified by the mpeg-dash rules for xlink.
        element.children = element.children.filter(
            (elem) => elem !== child);
      } else if (child.tagName != 'SegmentTimeline') {
        // Don't recurse into a SegmentTimeline since xlink attributes
        // aren't valid in there and looking at each segment can take a long
        // time with larger manifests.

        // Replace the child with its processed form.
        childOperations.push(shaka.dash.MpdUtils.processXlinks(
            /** @type {!shaka.extern.xml.Node} */ (child),
            retryParameters, failGracefully,
            baseUri, networkingEngine, linkDepth));
      }
    }

    return shaka.util.AbortableOperation.all(childOperations).chain(() => {
      return element;
    });
  }
};


/**
 * @typedef {{
 *   timescale: number,
 *   unscaledSegmentDuration: ?number,
 *   segmentDuration: ?number,
 *   startNumber: number,
 *   scaledPresentationTimeOffset: number,
 *   unscaledPresentationTimeOffset: number,
 *   timeline: Array<shaka.media.PresentationTimeline.TimeRange>,
 * }}
 *
 * @description
 * Contains common information between SegmentList and SegmentTemplate items.
 *
 * @property {number} timescale
 *   The time-scale of the representation.
 * @property {?number} unscaledSegmentDuration
 *   The duration of the segments in timescale units, if given.
 * @property {?number} segmentDuration
 *   The duration of the segments in seconds, if given.
 * @property {number} startNumber
 *   The start number of the segments; 1 or greater.
 * @property {number} scaledPresentationTimeOffset
 *   The presentation time offset of the representation, in seconds.
 * @property {number} unscaledPresentationTimeOffset
 *   The presentation time offset of the representation, in timescale units.
 * @property {Array<shaka.media.PresentationTimeline.TimeRange>} timeline
 *   The timeline of the representation, if given.  Times in seconds.
 */
shaka.dash.MpdUtils.SegmentInfo;


/**
 * @const {string}
 * @private
 */
shaka.dash.MpdUtils.XlinkNamespaceUri_ = 'http://www.w3.org/1999/xlink';
