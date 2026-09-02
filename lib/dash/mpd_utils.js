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
goog.require('shaka.util.URL');
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
          unscaledStart: startTime,
          end: endTime / timescale,
          unscaledEnd: endTime,
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
      let timePoints = [];
      const patterns = MpdUtils.parsePatterns_(timelineNode);
      const sNodes = TXml.findChildren(timelineNode, 'S');

      if (patterns.size) {
        for (const s of sNodes) {
          const expanded = MpdUtils.expandSWithPattern_(s, patterns);
          timePoints.push(...expanded);
        }
      } else {
        timePoints = sNodes;
      }

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
   * @param {!shaka.extern.xml.Node} segmentTimelineNode
   * @return {!Map<string, !shaka.extern.xml.Node>}
   * @private
   */
  static parsePatterns_(segmentTimelineNode) {
    const TXml = shaka.util.TXml;
    const patterns = new Map();

    const patternNodes = TXml.findChildren(segmentTimelineNode, 'Pattern');
    for (const pattern of patternNodes) {
      const id = pattern.attributes['id'];
      if (id) {
        patterns.set(id, pattern);
      } else {
        shaka.log.warning('Ignoring Pattern without id.', pattern);
      }
    }
    return patterns;
  }

  /**
   * Expands an <S> element that references a Pattern into one or more
   * plain <S> elements without pattern usage.
   *
   * @param {!shaka.extern.xml.Node} sNode
   * @param {!Map<string, !shaka.extern.xml.Node>} patterns
   * @return {!Array<!shaka.extern.xml.Node>}
   * @private
   */
  static expandSWithPattern_(sNode, patterns) {
    const TXml = shaka.util.TXml;

    const patternId = sNode.attributes['p'];
    if (!patternId) {
      // S without pattern.
      return [sNode];
    }

    if (!patterns.has(patternId)) {
      shaka.log.error('Referenced Pattern not found:', patternId);
      return [];
    }

    const patternNode = patterns.get(patternId);
    const pNodes = TXml.findChildren(patternNode, 'P');
    if (!pNodes.length) {
      return [];
    }

    // --------------------------------------------------
    // 1. Build duration array D[] from Pattern.P
    // --------------------------------------------------
    /** @type {!Array<number>} */
    const patternDurations = [];
    for (const p of pNodes) {
      const d = Number(p.attributes['d']);
      const r = Number(p.attributes['r'] || 0);

      if (!Number.isFinite(d) || d <= 0) {
        continue;
      }

      for (let i = 0; i <= r; i++) {
        patternDurations.push(d);
      }
    }

    if (!patternDurations.length) {
      return [];
    }

    // --------------------------------------------------
    // 2. Resolve S attributes
    // --------------------------------------------------
    const pE = Number(sNode.attributes['pE'] || 0);
    const r = Number(sNode.attributes['r'] || 0);
    const segmentCount = r + 1;

    const startTime = Number(sNode.attributes['t'] || 0);
    const k = Number(sNode.attributes['k'] || 1);

    // --------------------------------------------------
    // 3. Expand into exactly (r + 1) segments
    // --------------------------------------------------
    const result = [];
    let currentTime = startTime;
    const n = patternDurations.length;

    for (let i = 0; i < segmentCount; i++) {
      const index = (pE + i) % n;
      const d = patternDurations[index];

      /** @type {!shaka.extern.xml.Node} */
      const newS = {
        tagName: 'S',
        attributes: {
          t: String(currentTime),
          d: String(d),
        },
        children: [],
        parent: null,
      };

      if (k > 1) {
        newS.attributes['k'] = String(k);
      }

      result.push(newS);
      currentTime += d;
    }

    return result;
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
   * Checks whether the MPD has any Linked Periods (Periods with ImportedMPD
   * children, as defined in DASH 6th edition §5.3.2.6).
   *
   * @param {!shaka.extern.xml.Node} mpd
   * @return {boolean}
   */
  static hasLinkedPeriods(mpd) {
    const TXml = shaka.util.TXml;
    for (const period of TXml.findChildren(mpd, 'Period')) {
      if (TXml.findChild(period, 'ImportedMPD')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resolves Linked Periods (ImportedMPD elements, DASH 6th ed. §5.3.2.6).
   * For each Period with an ImportedMPD child, fetches the referenced
   * single-period MPD and integrates its content into the Linked Period
   * following the reference processing model of §5.3.2.6.3.  When the
   * resolution fails, the Linked Period falls back to a regular Period, or is
   * removed if it has no valid content (step 2).
   *
   * @param {!shaka.extern.xml.Node} mpd
   * @param {string} baseUri
   * @param {!shaka.extern.RetryParameters} retryParameters
   * @param {!shaka.net.NetworkingEngine} networkingEngine
   * @return {!shaka.util.AbortableOperation.<!shaka.extern.xml.Node>}
   */
  static processLinkedPeriods(mpd, baseUri, retryParameters, networkingEngine) {
    const TXml = shaka.util.TXml;
    const MpdUtils = shaka.dash.MpdUtils;
    const requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;

    const periodOperations = [];
    for (const period of TXml.findChildren(mpd, 'Period')) {
      const foundImportedMpdElem = TXml.findChild(period, 'ImportedMPD');
      if (!foundImportedMpdElem) {
        continue;
      }
      // Closure does not propagate the non-null narrowing above into the async
      // callbacks below, so keep an explicitly non-null reference.
      const importedMpdElem =
      /** @type {!shaka.extern.xml.Node} */ (foundImportedMpdElem);

      const href = TXml.getContents(importedMpdElem)?.trim();
      if (!href) {
        // There is no URI to resolve, so the import can never succeed: treat
        // it as a failed resolution (§5.3.2.6.3 step 1.a / step 2).
        MpdUtils.fallbackLinkedPeriod_(mpd, period, importedMpdElem);
        continue;
      }

      const importedUri = shaka.util.URL.resolve(baseUri, href);
      const request =
          shaka.net.NetworkingEngine.makeRequest(
              [importedUri], retryParameters);
      const networkOperation =
      /** @type {!shaka.util.AbortableOperation.<shaka.extern.Response>} */(
          networkingEngine.request(requestType, request));

      const op = networkOperation.chain((response) => {
        // §5.3.2.6.3 step 1: the imported MPD has been retrieved.
        let importedMpd = null;
        try {
          importedMpd = TXml.parseXml(response.data, 'MPD');
        } catch (e) {
          // Step 1.b: a syntactically invalid MPD means resolution fails.
        }
        const importedPeriod =
            importedMpd ? TXml.findChild(importedMpd, 'Period') : null;

        if (!importedMpd || !importedPeriod ||
            MpdUtils.importedMpdResolutionFails_(importedMpd)) {
          // Failures from steps 1.b and 1.c fall back per step 2.
          MpdUtils.fallbackLinkedPeriod_(mpd, period, importedMpdElem);
        } else {
          // Step 3: integrate the imported content into the Linked Period.
          // The ImportedMPD element is removed as part of this (step 4).
          MpdUtils.mergeImportedPeriod_(
              period, importedMpd, importedPeriod, response.uri);
        }
        return mpd;
      }, (error) => {
        // Step 1.a: the resolution (download) failed, possibly after retries.
        // Step 2: fall back to a regular Period instead of failing the parse.
        MpdUtils.fallbackLinkedPeriod_(mpd, period, importedMpdElem);
        return mpd;
      });

      periodOperations.push(op);
    }

    if (!periodOperations.length) {
      return shaka.util.AbortableOperation.completed(mpd);
    }
    return shaka.util.AbortableOperation.all(periodOperations).chain(() => mpd);
  }

  /**
   * Handles a failed Linked Period resolution (§5.3.2.6.3 step 2): the
   * ImportedMPD element is removed so the Linked Period becomes a regular
   * Period.  If the resulting Period has no valid content, the Period itself is
   * removed from the MPD.
   *
   * @param {!shaka.extern.xml.Node} mpd
   * @param {!shaka.extern.xml.Node} period
   * @param {!shaka.extern.xml.Node} importedMpdElem
   * @private
   */
  static fallbackLinkedPeriod_(mpd, period, importedMpdElem) {
    period.children = period.children.filter((c) => c !== importedMpdElem);
    if (!shaka.dash.MpdUtils.isValidRegularPeriod_(period)) {
      shaka.log.warning(
          'Failed to resolve a Linked Period (ImportedMPD) and the Period ' +
          'has no valid content; removing it from the MPD.');
      mpd.children = mpd.children.filter((c) => c !== period);
    } else {
      shaka.log.warning(
          'Failed to resolve a Linked Period (ImportedMPD); falling back ' +
          'to a regular Period.');
    }
  }

  /**
   * A regular Period is valid if it contains at least one Adaptation Set, or if
   * its @duration is zero (see DASH 6th ed. Table 4, AdaptationSet semantics).
   *
   * @param {!shaka.extern.xml.Node} period
   * @return {boolean}
   * @private
   */
  static isValidRegularPeriod_(period) {
    const TXml = shaka.util.TXml;
    if (TXml.findChildren(period, 'AdaptationSet').length) {
      return true;
    }
    return TXml.parseDuration(period.attributes['duration'] || '') === 0;
  }

  /**
   * Checks whether a retrieved imported MPD must be rejected per §5.3.2.6.3:
   *   - step 1.b: it does not conform to the imported MPD restrictions.  The
   *     Single-Period Static Profile (clause 8.15.2) requires MPD@type="static"
   *     (the default when the attribute is absent) — so a live/dynamic, or a
   *     "list", imported MPD is rejected — and exactly one Period element.
   *   - step 1.c: @availabilityEndTime is present and earlier than now.
   *
   * @param {!shaka.extern.xml.Node} importedMpd
   * @return {boolean}
   * @private
   */
  static importedMpdResolutionFails_(importedMpd) {
    const TXml = shaka.util.TXml;
    const type = importedMpd.attributes['type'] || 'static';
    if (type !== 'static') {
      return true;
    }
    // Clause 8.15.2: one and only one Period element shall be present.
    if (TXml.findChildren(importedMpd, 'Period').length !== 1) {
      return true;
    }
    const availabilityEndTime =
        TXml.parseDate(importedMpd.attributes['availabilityEndTime'] || '');
    return availabilityEndTime != null &&
        availabilityEndTime * 1000 < Date.now();
  }

  /**
   * Integrates the content of an imported single-period MPD into a Linked
   * Period, following DASH 6th ed. §5.3.2.6.3 step 3.
   *
   * @param {!shaka.extern.xml.Node} period The Linked Period.
   * @param {!shaka.extern.xml.Node} importedMpd
   * @param {!shaka.extern.xml.Node} importedPeriod
   * @param {string} importedMpdUri The absolute URL of the imported MPD.
   * @private
   */
  static mergeImportedPeriod_(period, importedMpd, importedPeriod,
      importedMpdUri) {
    const TXml = shaka.util.TXml;
    const MpdUtils = shaka.dash.MpdUtils;

    // Step 3.b: keep only the allowed attributes (@id, @start, @duration) of
    // the Linked Period; any other attribute is removed.
    const keepAttrs = new Set(['id', 'start', 'duration']);
    for (const name of Object.keys(period.attributes)) {
      if (!keepAttrs.has(name) && !name.includes(':')) {
        delete period.attributes[name];
      }
    }

    // Step 3.b: keep only the allowed elements of the Linked Period; everything
    // else (its own BaseURL/AdaptationSet/..., and the ImportedMPD element) is
    // removed.  Elements from a foreign namespace are also preserved.
    const keepTags = new Set([
      'ServiceDescription',
      'SupplementalProperty',
      'EssentialProperty',
      'EventStream',
      'RequestParam',
    ]);
    const linkedKept = TXml.getChildNodes(period).filter(
        (child) => keepTags.has(child.tagName) || child.tagName.includes(':'));

    // Imported Period content, plus the imported MPD-level SupplementalProperty
    // (step 3.a.iii) and EssentialProperty elements moved to Period level.  The
    // imported BaseURL elements are handled separately by the Base URL
    // resolution (step 3.e).
    const importedChildren = TXml.getChildNodes(importedPeriod)
        .filter((child) => child.tagName !== 'BaseURL')
        .concat(
            TXml.findChildren(importedMpd, 'SupplementalProperty'),
            TXml.findChildren(importedMpd, 'EssentialProperty'));

    // Step 3.c: when an equivalent element is present in both Periods, the
    // imported one overrides (replaces) the one from the Linked Period.
    const importedKeys = new Set();
    for (const child of importedChildren) {
      const key = MpdUtils.linkedPeriodMergeKey_(child);
      if (key != null) {
        importedKeys.add(key);
      }
    }
    const survivingLinked = linkedKept.filter((child) => {
      const key = MpdUtils.linkedPeriodMergeKey_(child);
      return key == null || !importedKeys.has(key);
    });

    // Step 3.e: resolve the Base URLs of the imported MPD (clause 5.6) into
    // absolute URLs which become the Linked Period's BaseURL element(s).
    const baseUrlNodes = MpdUtils.resolveImportedBaseUrls_(
        importedMpd, importedPeriod, importedMpdUri).map((uri) => {
      return /** @type {!shaka.extern.xml.Node} */ ({
        tagName: 'BaseURL',
        attributes: {},
        children: [uri],
        parent: period,
      });
    });

    // Re-parent the imported children to the Linked Period.
    for (const child of importedChildren) {
      child.parent = period;
    }

    // Steps 4: the ImportedMPD element is dropped here, as it is not part of
    // any of the kept sets.
    period.children = baseUrlNodes.concat(importedChildren, survivingLinked);

    // Step 3.d.iii: @duration becomes the smaller of the two when both Periods
    // define one; otherwise the imported value is used if the Linked Period has
    // none.  (@id and @start of the Linked Period take precedence per steps
    // 3.d.i / 3.d.ii, so they are intentionally left untouched.)
    const importedDuration = importedPeriod.attributes['duration'];
    if (importedDuration) {
      const linkedDuration = period.attributes['duration'];
      if (!linkedDuration) {
        period.attributes['duration'] = importedDuration;
      } else {
        const linkedSeconds = TXml.parseDuration(linkedDuration);
        const importedSeconds = TXml.parseDuration(importedDuration);
        if (linkedSeconds != null && importedSeconds != null &&
            importedSeconds < linkedSeconds) {
          period.attributes['duration'] = importedDuration;
        }
      }
    }
  }

  /**
   * Returns the equivalence key used by §5.3.2.6.3 step 3.c to decide whether
   * two elements are "the same" (so the imported one overrides the Linked
   * Period one), or null if the element is not subject to override.
   *
   * @param {!shaka.extern.xml.Node} node
   * @return {?string}
   * @private
   */
  static linkedPeriodMergeKey_(node) {
    switch (node.tagName) {
      case 'ServiceDescription':
        return 'ServiceDescription:' + (node.attributes['id'] || '');
      case 'SupplementalProperty':
      case 'EssentialProperty':
      case 'EventStream':
        return node.tagName + ':' + (node.attributes['schemeIdUri'] || '') +
            ':' + (node.attributes['value'] || '');
      default:
        return null;
    }
  }

  /**
   * Resolves the Base URLs of an imported MPD into absolute URLs, following the
   * Base URL resolution of clause 5.6 (§5.3.2.6.3 step 3.e).  The imported MPD
   * URL is the root, against which the imported MPD-level BaseURL elements are
   * resolved, against which in turn the imported Period-level BaseURL elements
   * are resolved.
   *
   * @param {!shaka.extern.xml.Node} importedMpd
   * @param {!shaka.extern.xml.Node} importedPeriod
   * @param {string} importedMpdUri
   * @return {!Array<string>}
   * @private
   */
  static resolveImportedBaseUrls_(importedMpd, importedPeriod, importedMpdUri) {
    const TXml = shaka.util.TXml;
    const getBaseUris = (elem) => {
      const uris = [];
      for (const baseUrl of TXml.findChildren(elem, 'BaseURL')) {
        const contents = TXml.getContents(baseUrl);
        if (contents) {
          uris.push(contents);
        }
      }
      return uris;
    };

    let baseUris = [importedMpdUri];
    const mpdBaseUris = getBaseUris(importedMpd);
    if (mpdBaseUris.length) {
      baseUris = shaka.util.URL.resolveUris(baseUris, mpdBaseUris);
    }
    const periodBaseUris = getBaseUris(importedPeriod);
    if (periodBaseUris.length) {
      baseUris = shaka.util.URL.resolveUris(baseUris, periodBaseUris);
    }
    return baseUris;
  }

  /**
   * Fast detection of whether the MPD contains XLinks worth resolving.
   * The DASH spec only allows XLink on the following elements:
   *   - Period
   *   - AdaptationSet
   *   - SegmentList
   * We also avoid descending into SegmentTimeline for performance and
   * because XLink is not valid there.
   *
   * @param {!shaka.extern.xml.Node} root
   * @return {boolean}
   */
  static hasXlinks(root) {
    const TXml = shaka.util.TXml;
    const NS = shaka.dash.MpdUtils.XlinkNamespaceUri_;

    // If the MPD root does not declare the XLink namespace, we can skip
    // scanning in the common case where the namespace is always declared at
    // the root.
    if (root.attributes['xmlns:xlink'] !== NS) {
      return false;
    }

    // Elements where XLink is valid per spec.
    const xlinkElements = new Set(['Period', 'AdaptationSet', 'SegmentList']);
    // Containers that are worthwhile to traverse to reach the allowed elements.
    const containers = new Set([
      'MPD', 'Period', 'AdaptationSet', 'Representation', 'SegmentList',
    ]);
    /** @type {!Array<!shaka.extern.xml.Node>} */
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (xlinkElements.has(node.tagName)) {
        if (TXml.getAttributeNS(node, NS, 'href')) {
          // Early return on first XLink occurrence.
          return true;
        }
      }
      for (const child of TXml.getChildNodes(node)) {
        if (containers.has(child.tagName)) {
          stack.push(child);
        }
      }
    }
    return false;
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
    const uris = shaka.util.URL.resolveUris([baseUri], [xlinkHref]);

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
    // Descend only through containers that can lead to valid XLink locations.
    const containers = new Set([
      'MPD', 'Period', 'AdaptationSet', 'Representation', 'SegmentList',
    ]);

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
      } else if (containers.has(child.tagName)) {
        // Recurse only into relevant containers.
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

  /**
   * Extracts and normalizes the EssentialProperty descriptors that are direct
   * children of the given element.
   *
   * @param {!shaka.extern.xml.Node} node
   * @return {!Array<shaka.dash.MpdUtils.Descriptor>}
   * @see ISO/IEC 23009-1:2022 clause 5.8.4.8
   */
  static parseEssentialProperties(node) {
    return shaka.dash.MpdUtils.parseDescriptorsByTag_(
        node, 'EssentialProperty');
  }

  /**
   * Extracts and normalizes the SupplementalProperty descriptors that are
   * direct children of the given element.
   *
   * @param {!shaka.extern.xml.Node} node
   * @return {!Array<shaka.dash.MpdUtils.Descriptor>}
   * @see ISO/IEC 23009-1:2022 clause 5.8.4.9
   */
  static parseSupplementalProperties(node) {
    return shaka.dash.MpdUtils.parseDescriptorsByTag_(
        node, 'SupplementalProperty');
  }

  /**
   * Extracts and normalizes the descriptor elements with the given tag name
   * that are direct children of the given element.
   *
   * @param {!shaka.extern.xml.Node} node
   * @param {string} tagName
   * @return {!Array<shaka.dash.MpdUtils.Descriptor>}
   * @private
   */
  static parseDescriptorsByTag_(node, tagName) {
    return shaka.util.TXml.findChildren(node, tagName)
        .map(shaka.dash.MpdUtils.normalizeDescriptor_);
  }

  /**
   * Returns the first descriptor in the list matching the given scheme (and,
   * when provided, value), or null if there is none.
   *
   * @param {!Array<shaka.dash.MpdUtils.Descriptor>} descriptors
   * @param {string} schemeIdUri
   * @param {string=} value
   * @return {?shaka.dash.MpdUtils.Descriptor}
   */
  static getDescriptor(descriptors, schemeIdUri, value) {
    return descriptors.find((d) => d.schemeIdUri == schemeIdUri &&
        (value == undefined || d.value == value)) || null;
  }

  /**
   * Returns true if the list contains a descriptor matching the given scheme
   * (and, when provided, value).
   *
   * @param {!Array<shaka.dash.MpdUtils.Descriptor>} descriptors
   * @param {string} schemeIdUri
   * @param {string=} value
   * @return {boolean}
   */
  static hasDescriptor(descriptors, schemeIdUri, value) {
    return shaka.dash.MpdUtils.getDescriptor(
        descriptors, schemeIdUri, value) != null;
  }

  /**
   * Normalizes a single EssentialProperty/SupplementalProperty element into a
   * Descriptor, keeping a reference to the underlying XML element for access to
   * scheme-specific attributes.
   *
   * @param {!shaka.extern.xml.Node} element
   * @return {shaka.dash.MpdUtils.Descriptor}
   * @private
   */
  static normalizeDescriptor_(element) {
    return {
      schemeIdUri: element.attributes['schemeIdUri'],
      value: element.attributes['value'],
      id: element.attributes['id'],
      element,
    };
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
 * @typedef {{
 *   schemeIdUri: string,
 *   value: string,
 *   id: string,
 *   element: !shaka.extern.xml.Node,
 * }}
 *
 * @description
 * A normalized DASH property descriptor, as carried by EssentialProperty and
 * SupplementalProperty elements.
 *
 * @property {string} schemeIdUri
 *   The @schemeIdUri attribute identifying the descriptor scheme.
 * @property {string} value
 *   The @value attribute, or undefined if not present.
 * @property {string} id
 *   The @id attribute, or undefined if not present.
 * @property {!shaka.extern.xml.Node} element
 *   The underlying XML element, for access to scheme-specific attributes.
 */
shaka.dash.MpdUtils.Descriptor;


/**
 * @const {string}
 * @private
 */
shaka.dash.MpdUtils.XlinkNamespaceUri_ = 'http://www.w3.org/1999/xlink';
