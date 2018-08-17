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

goog.provide('shaka.dash.SegmentList');

goog.require('goog.asserts');
goog.require('shaka.dash.MpdUtils');
goog.require('shaka.dash.SegmentBase');
goog.require('shaka.log');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.XmlUtils');


/**
 * @namespace shaka.dash.SegmentList
 * @summary A set of functions for parsing SegmentList elements.
 */


/**
 * Creates a new Stream object or updates the Stream in the manifest.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {!Object.<string, !shaka.media.SegmentIndex>} segmentIndexMap
 * @return {shaka.dash.DashParser.StreamInfo}
 */
shaka.dash.SegmentList.createStream = function(context, segmentIndexMap) {
  goog.asserts.assert(context.representation.segmentList,
                      'Should only be called with SegmentList');
  const SegmentList = shaka.dash.SegmentList;

  let init = shaka.dash.SegmentBase.createInitSegment(
      context, SegmentList.fromInheritance_);
  let info = SegmentList.parseSegmentListInfo_(context);

  SegmentList.checkSegmentListInfo_(context, info);

  /** @type {shaka.media.SegmentIndex} */
  let segmentIndex = null;
  let id = null;
  if (context.period.id && context.representation.id) {
    // Only check/store the index if period and representation IDs are set.
    id = context.period.id + ',' + context.representation.id;
    segmentIndex = segmentIndexMap[id];
  }

  let references = SegmentList.createSegmentReferences_(
      context.periodInfo.duration, info.startNumber,
      context.representation.baseUris, info);

  if (segmentIndex) {
    segmentIndex.merge(references);
    let start = context.presentationTimeline.getSegmentAvailabilityStart();
    segmentIndex.evict(start - context.periodInfo.start);
  } else {
    context.presentationTimeline.notifySegments(
        references, context.periodInfo.start);
    segmentIndex = new shaka.media.SegmentIndex(references);
    if (id && context.dynamic) {
      segmentIndexMap[id] = segmentIndex;
    }
  }

  if (!context.dynamic || !context.periodInfo.isLastPeriod) {
    segmentIndex.fit(context.periodInfo.duration);
  }

  return {
    createSegmentIndex: Promise.resolve.bind(Promise),
    findSegmentPosition: segmentIndex.find.bind(segmentIndex),
    getSegmentReference: segmentIndex.get.bind(segmentIndex),
    initSegmentReference: init,
    scaledPresentationTimeOffset: info.scaledPresentationTimeOffset,
  };
};


/**
 * @typedef {{
 *   mediaUri: string,
 *   start: number,
 *   end: ?number
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
 *   timeline: Array.<shaka.dash.MpdUtils.TimeRange>,
 *   mediaSegments: !Array.<shaka.dash.SegmentList.MediaSegment>
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
 * @property {Array.<shaka.dash.MpdUtils.TimeRange>} timeline
 *   The timeline of the representation, if given.  Times in seconds.
 * @property {!Array.<shaka.dash.SegmentList.MediaSegment>} mediaSegments
 *   The URI and byte-ranges of the media segments.
 */
shaka.dash.SegmentList.SegmentListInfo;


/**
 * @param {?shaka.dash.DashParser.InheritanceFrame} frame
 * @return {Element}
 * @private
 */
shaka.dash.SegmentList.fromInheritance_ = function(frame) {
  return frame.segmentList;
};


/**
 * Parses the SegmentList items to create an info object.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @return {shaka.dash.SegmentList.SegmentListInfo}
 * @private
 */
shaka.dash.SegmentList.parseSegmentListInfo_ = function(context) {
  const SegmentList = shaka.dash.SegmentList;
  const MpdUtils = shaka.dash.MpdUtils;

  let mediaSegments = SegmentList.parseMediaSegments_(context);
  let segmentInfo =
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
    timeline: segmentInfo.timeline,
    mediaSegments: mediaSegments,
  };
};


/**
 * Checks whether a SegmentListInfo object is valid.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {shaka.dash.SegmentList.SegmentListInfo} info
 * @throws shaka.util.Error When there is a parsing error.
 * @private
 */
shaka.dash.SegmentList.checkSegmentListInfo_ = function(context, info) {
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

  if (!info.segmentDuration && !context.periodInfo.duration && !info.timeline &&
      info.mediaSegments.length == 1) {
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
};


/**
 * Creates an array of segment references for the given data.
 *
 * @param {?number} periodDuration in seconds.
 * @param {number} startNumber
 * @param {!Array.<string>} baseUris
 * @param {shaka.dash.SegmentList.SegmentListInfo} info
 * @return {!Array.<!shaka.media.SegmentReference>}
 * @private
 */
shaka.dash.SegmentList.createSegmentReferences_ = function(
    periodDuration, startNumber, baseUris, info) {
  const ManifestParserUtils = shaka.util.ManifestParserUtils;

  let max = info.mediaSegments.length;
  if (info.timeline && info.timeline.length != info.mediaSegments.length) {
    max = Math.min(info.timeline.length, info.mediaSegments.length);
    shaka.log.warning(
        'The number of items in the segment timeline and the number of segment',
        'URLs do not match, truncating', info.mediaSegments.length, 'to', max);
  }

  /** @type {!Array.<!shaka.media.SegmentReference>} */
  let references = [];
  let prevEndTime = info.startTime;
  for (let i = 0; i < max; i++) {
    let segment = info.mediaSegments[i];
    let mediaUri = ManifestParserUtils.resolveUris(
        baseUris, [segment.mediaUri]);

    let startTime = prevEndTime;
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

    let getUris = (function(uris) { return uris; }.bind(null, mediaUri));
    references.push(
        new shaka.media.SegmentReference(
            i + startNumber, startTime, endTime, getUris, segment.start,
            segment.end));
    prevEndTime = endTime;
  }

  return references;
};


/**
 * Parses the media URIs from the context.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @return {!Array.<shaka.dash.SegmentList.MediaSegment>}
 * @private
 */
shaka.dash.SegmentList.parseMediaSegments_ = function(context) {
  const Functional = shaka.util.Functional;
  /** @type {!Array.<!Element>} */
  let segmentLists = [
    context.representation.segmentList,
    context.adaptationSet.segmentList,
    context.period.segmentList,
  ].filter(Functional.isNotNull);

  const XmlUtils = shaka.util.XmlUtils;
  // Search each SegmentList for one with at least one SegmentURL element,
  // select the first one, and convert each SegmentURL element to a tuple.
  return segmentLists
      .map(function(node) { return XmlUtils.findChildren(node, 'SegmentURL'); })
      .reduce(function(all, part) { return all.length > 0 ? all : part; })
      .map(function(urlNode) {
        if (urlNode.getAttribute('indexRange') &&
            !context.indexRangeWarningGiven) {
          context.indexRangeWarningGiven = true;
          shaka.log.warning(
              'We do not support the SegmentURL@indexRange attribute on ' +
              'SegmentList.  We only use the SegmentList@duration attribute ' +
              'or SegmentTimeline, which must be accurate.');
        }

        let uri = urlNode.getAttribute('media');
        let range = XmlUtils.parseAttr(
            urlNode, 'mediaRange', XmlUtils.parseRange, {start: 0, end: null});
        return {mediaUri: uri, start: range.start, end: range.end};
      });
};

