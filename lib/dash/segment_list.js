/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.dash.SegmentList');

goog.require('goog.asserts');
goog.require('shaka.dash.MpdUtils');
goog.require('shaka.dash.SegmentBase');
goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');
goog.requireType('shaka.dash.DashParser');
goog.requireType('shaka.media.PresentationTimeline');


/**
 * @summary A set of functions for parsing SegmentList elements.
 */
shaka.dash.SegmentList = class {
  /**
   * Creates a new StreamInfo object.
   * Updates the existing SegmentIndex, if any.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {!Map<string, !shaka.extern.Stream>} streamMap
   * @param {shaka.extern.aesKey|undefined} aesKey
   * @return {shaka.dash.DashParser.StreamInfo}
   */
  static createStreamInfo(context, streamMap, aesKey) {
    goog.asserts.assert(context.representation.segmentList,
        'Should only be called with SegmentList');
    const SegmentList = shaka.dash.SegmentList;

    const initSegmentReference = shaka.dash.SegmentBase.createInitSegment(
        context, SegmentList.fromInheritance_, aesKey);
    const info = SegmentList.parseSegmentListInfo_(context);

    SegmentList.checkSegmentListInfo_(context, info);

    /** @type {shaka.media.SegmentIndex} */
    let segmentIndex = null;
    let stream = null;
    if (context.period.id && context.representation.id) {
      // Only check/store the index if period and representation IDs are set.
      const id = context.period.id + ',' + context.representation.id;
      stream = streamMap.get(id);
      if (stream) {
        segmentIndex = stream.segmentIndex;
      }
    }

    const references = SegmentList.createSegmentReferences_(
        context.periodInfo.start, context.periodInfo.duration,
        info.startNumber, context.representation.getBaseUris, info,
        initSegmentReference, aesKey, context.representation.mimeType,
        context.representation.codecs, context.bandwidth, context.urlParams);

    const isNew = !segmentIndex;
    if (segmentIndex) {
      const start = context.presentationTimeline.getSegmentAvailabilityStart();
      segmentIndex.mergeAndEvict(references, start);
    } else {
      segmentIndex = new shaka.media.SegmentIndex(references);
    }
    context.presentationTimeline.notifySegments(references);

    if (!context.dynamic || !context.periodInfo.isLastPeriod) {
      const periodStart = context.periodInfo.start;
      const periodEnd = context.periodInfo.duration ?
          context.periodInfo.start + context.periodInfo.duration : Infinity;
      segmentIndex.fit(periodStart, periodEnd, isNew);
    }

    if (stream) {
      stream.segmentIndex = segmentIndex;
    }

    return {
      endTime: -1,
      timeline: -1,
      generateSegmentIndex: () => {
        if (!segmentIndex || segmentIndex.isEmpty()) {
          segmentIndex.merge(references);
        }
        return Promise.resolve(segmentIndex);
      },
      timescale: info.timescale,
    };
  }

  /**
   * @param {?shaka.dash.DashParser.InheritanceFrame} frame
   * @return {?shaka.extern.xml.Node}
   * @private
   */
  static fromInheritance_(frame) {
    return frame.segmentList;
  }

  /**
   * Parses the SegmentList items to create an info object.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @return {shaka.dash.SegmentList.SegmentListInfo}
   * @private
   */
  static parseSegmentListInfo_(context) {
    const SegmentList = shaka.dash.SegmentList;
    const MpdUtils = shaka.dash.MpdUtils;

    const mediaSegments = SegmentList.parseMediaSegments_(context);
    const segmentInfo =
        MpdUtils.parseSegmentInfo(context, SegmentList.fromInheritance_);

    let startNumber = segmentInfo.startNumber;
    if (startNumber == 0) {
      shaka.log.warning('SegmentList@startNumber must be > 0');
      startNumber = 1;
    }

    let startTime = 0;
    if (segmentInfo.segmentDuration) {
      // See DASH sec. 5.3.9.5.3
      // Don't use presentationTimeOffset for @duration.
      startTime = segmentInfo.segmentDuration * (startNumber - 1);
    } else if (segmentInfo.timeline && segmentInfo.timeline.length > 0) {
      // The presentationTimeOffset was considered in timeline creation.
      startTime = segmentInfo.timeline[0].start;
    }

    return {
      segmentDuration: segmentInfo.segmentDuration,
      startTime: startTime,
      startNumber: startNumber,
      scaledPresentationTimeOffset: segmentInfo.scaledPresentationTimeOffset,
      timescale: segmentInfo.timescale,
      timeline: segmentInfo.timeline,
      mediaSegments: mediaSegments,
    };
  }

  /**
   * Checks whether a SegmentListInfo object is valid.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.SegmentList.SegmentListInfo} info
   * @private
   */
  static checkSegmentListInfo_(context, info) {
    if (!info.segmentDuration && !info.timeline &&
        info.mediaSegments.length > 1) {
      shaka.log.warning(
          'SegmentList does not contain sufficient segment information:',
          'the SegmentList specifies multiple segments,',
          'but does not specify a segment duration or timeline.',
          context.representation);
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
    }

    if (!info.segmentDuration && !context.periodInfo.duration &&
        !info.timeline && info.mediaSegments.length == 1) {
      shaka.log.warning(
          'SegmentList does not contain sufficient segment information:',
          'the SegmentList specifies one segment,',
          'but does not specify a segment duration, period duration,',
          'or timeline.',
          context.representation);
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
    }

    if (info.timeline && info.timeline.length == 0) {
      shaka.log.warning(
          'SegmentList does not contain sufficient segment information:',
          'the SegmentList has an empty timeline.',
          context.representation);
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
    }
  }

  /**
   * Creates an array of segment references for the given data.
   *
   * @param {number} periodStart in seconds.
   * @param {?number} periodDuration in seconds.
   * @param {number} startNumber
   * @param {function(): !Array<string>} getBaseUris
   * @param {shaka.dash.SegmentList.SegmentListInfo} info
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @param {shaka.extern.aesKey|undefined} aesKey
   * @param {string} mimeType
   * @param {string} codecs
   * @param {number} bandwidth
   * @param {function():string} urlParams
   * @return {!Array<!shaka.media.SegmentReference>}
   * @private
   */
  static createSegmentReferences_(
      periodStart, periodDuration, startNumber, getBaseUris, info,
      initSegmentReference, aesKey, mimeType, codecs, bandwidth, urlParams) {
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    let max = info.mediaSegments.length;
    if (info.timeline && info.timeline.length != info.mediaSegments.length) {
      max = Math.min(info.timeline.length, info.mediaSegments.length);
      shaka.log.warning(
          'The number of items in the segment timeline and the number of ',
          'segment URLs do not match, truncating', info.mediaSegments.length,
          'to', max);
    }

    const timestampOffset = periodStart - info.scaledPresentationTimeOffset;
    const appendWindowStart = periodStart;
    const appendWindowEnd = periodDuration ?
        periodStart + periodDuration : Infinity;

    /** @type {!Array<!shaka.media.SegmentReference>} */
    const references = [];
    let prevEndTime = info.startTime;
    for (let i = 0; i < max; i++) {
      const segment = info.mediaSegments[i];
      const startTime = prevEndTime;
      let endTime;

      if (info.segmentDuration != null) {
        endTime = startTime + info.segmentDuration;
      } else if (info.timeline) {
        // Ignore the timepoint start since they are continuous.
        endTime = info.timeline[i].end;
      } else {
        // If segmentDuration and timeline are null then there must
        // be exactly one segment.
        goog.asserts.assert(
            info.mediaSegments.length == 1 && periodDuration,
            'There should be exactly one segment with a Period duration.');
        endTime = startTime + periodDuration;
      }

      let uris = null;
      const getUris = () => {
        if (uris == null) {
          uris = ManifestParserUtils.resolveUris(
              getBaseUris(), [segment.mediaUri], urlParams());
        }
        return uris;
      };

      const ref = new shaka.media.SegmentReference(
          periodStart + startTime,
          periodStart + endTime,
          getUris,
          segment.start,
          segment.end,
          initSegmentReference,
          timestampOffset,
          appendWindowStart, appendWindowEnd,
          /* partialReferences= */ [],
          /* tilesLayout= */ '',
          /* tileDuration= */ null,
          /* syncTime= */ null,
          shaka.media.SegmentReference.Status.AVAILABLE,
          aesKey);
      ref.codecs = codecs;
      ref.mimeType = mimeType;
      ref.bandwidth = bandwidth;
      references.push(ref);
      prevEndTime = endTime;
    }

    return references;
  }

  /**
   * Parses the media URIs from the context.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @return {!Array<shaka.dash.SegmentList.MediaSegment>}
   * @private
   */
  static parseMediaSegments_(context) {
    const Functional = shaka.util.Functional;
    /** @type {!Array<!shaka.extern.xml.Node>} */
    const segmentLists = [
      context.representation.segmentList,
      context.adaptationSet.segmentList,
      context.period.segmentList,
    ].filter(Functional.isNotNull);

    const TXml = shaka.util.TXml;
    const StringUtils = shaka.util.StringUtils;
    // Search each SegmentList for one with at least one SegmentURL element,
    // select the first one, and convert each SegmentURL element to a tuple.
    return segmentLists
        .map((node) => { return TXml.findChildren(node, 'SegmentURL'); })
        .reduce((all, part) => { return all.length > 0 ? all : part; })
        .map((urlNode) => {
          if (urlNode.attributes['indexRange'] &&
              !context.indexRangeWarningGiven) {
            context.indexRangeWarningGiven = true;
            shaka.log.warning(
                'We do not support the SegmentURL@indexRange attribute on ' +
                'SegmentList.  We only use the SegmentList@duration ' +
                'attribute or SegmentTimeline, which must be accurate.');
          }

          const uri = StringUtils.htmlUnescape(urlNode.attributes['media']);
          const range = TXml.parseAttr(
              urlNode, 'mediaRange', TXml.parseRange,
              {start: 0, end: null});
          return {mediaUri: uri, start: range.start, end: range.end};
        });
  }
};

/**
 * @typedef {{
 *   mediaUri: string,
 *   start: number,
 *   end: ?number,
 * }}
 *
 * @property {string} mediaUri
 *   The URI of the segment.
 * @property {number} start
 *   The start byte of the segment.
 * @property {?number} end
 *   The end byte of the segment, or null.
 */
shaka.dash.SegmentList.MediaSegment;

/**
 * @typedef {{
 *   segmentDuration: ?number,
 *   startTime: number,
 *   startNumber: number,
 *   scaledPresentationTimeOffset: number,
 *   timescale: number,
 *   timeline: Array<shaka.media.PresentationTimeline.TimeRange>,
 *   mediaSegments: !Array<shaka.dash.SegmentList.MediaSegment>,
 * }}
 * @private
 *
 * @description
 * Contains information about a SegmentList.
 *
 * @property {?number} segmentDuration
 *   The duration of the segments, if given.
 * @property {number} startTime
 *   The start time of the first segment, in seconds.
 * @property {number} startNumber
 *   The start number of the segments; 1 or greater.
 * @property {number} scaledPresentationTimeOffset
 *   The scaledPresentationTimeOffset of the representation, in seconds.
 * @property {number} timescale
 *  The timescale of the representation.
 * @property {Array<shaka.media.PresentationTimeline.TimeRange>} timeline
 *   The timeline of the representation, if given.  Times in seconds.
 * @property {!Array<shaka.dash.SegmentList.MediaSegment>} mediaSegments
 *   The URI and byte-ranges of the media segments.
 */
shaka.dash.SegmentList.SegmentListInfo;
