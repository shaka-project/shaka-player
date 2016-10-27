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

goog.provide('shaka.dash.SegmentTemplate');

goog.require('goog.asserts');
goog.require('shaka.dash.MpdUtils');
goog.require('shaka.dash.SegmentBase');
goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.Error');


/**
 * @namespace shaka.dash.SegmentTemplate
 * @summary A set of functions for parsing SegmentTemplate elements.
 */


/**
 * Creates a new Stream object or updates the Stream in the manifest.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {shaka.dash.DashParser.RequestInitSegmentCallback} requestInitSegment
 * @param {!Object.<string, !shaka.media.SegmentIndex>} segmentIndexMap
 * @param {boolean} isUpdate True if the manifest is being updated.
 * @throws shaka.util.Error When there is a parsing error.
 * @return {shaka.dash.DashParser.StreamInfo}
 */
shaka.dash.SegmentTemplate.createStream = function(
    context, requestInitSegment, segmentIndexMap, isUpdate) {
  goog.asserts.assert(context.representation.segmentTemplate,
                      'Should only be called with SegmentTemplate');
  var SegmentTemplate = shaka.dash.SegmentTemplate;

  var init = SegmentTemplate.createInitSegment_(context);
  var info = SegmentTemplate.parseSegmentTemplateInfo_(context);

  SegmentTemplate.checkSegmentTemplateInfo_(context, info);

  /** @type {?shaka.dash.DashParser.SegmentIndexFunctions} */
  var segmentIndexFunctions = null;
  if (info.indexTemplate) {
    segmentIndexFunctions = SegmentTemplate.createFromIndexTemplate_(
        context, requestInitSegment, init, info);
  } else if (info.segmentDuration) {
    if (!isUpdate) {
      context.presentationTimeline.notifyMaxSegmentDuration(
          info.segmentDuration);
    }
    segmentIndexFunctions = SegmentTemplate.createFromDuration_(context, info);
  } else {
    /** @type {shaka.media.SegmentIndex} */
    var segmentIndex = null;
    var id = null;
    if (context.period.id && context.representation.id) {
      // Only check/store the index if period and representation IDs are set.
      id = context.period.id + ',' + context.representation.id;
      segmentIndex = segmentIndexMap[id];
    }

    var references = SegmentTemplate.createFromTimeline_(context, info);
    shaka.dash.MpdUtils.fitSegmentReferences(
        context.dynamic, context.periodInfo.duration, references);
    if (segmentIndex) {
      segmentIndex.merge(references);
      var start = context.presentationTimeline.getSegmentAvailabilityStart();
      segmentIndex.evict(start - context.periodInfo.start);
    } else {
      context.presentationTimeline.notifySegments(
          context.periodInfo.start, references);
      segmentIndex = new shaka.media.SegmentIndex(references);
      if (id)
        segmentIndexMap[id] = segmentIndex;
    }

    segmentIndexFunctions = {
      createSegmentIndex: Promise.resolve.bind(Promise),
      findSegmentPosition: segmentIndex.find.bind(segmentIndex),
      getSegmentReference: segmentIndex.get.bind(segmentIndex)
    };
  }

  return {
    createSegmentIndex: segmentIndexFunctions.createSegmentIndex,
    findSegmentPosition: segmentIndexFunctions.findSegmentPosition,
    getSegmentReference: segmentIndexFunctions.getSegmentReference,
    initSegmentReference: init,
    presentationTimeOffset: info.presentationTimeOffset
  };
};


/**
 * @typedef {{
 *   timescale: number,
 *   segmentDuration: ?number,
 *   startNumber: number,
 *   presentationTimeOffset: number,
 *   timeline: Array.<shaka.dash.MpdUtils.TimeRange>,
 *   mediaTemplate: ?string,
 *   indexTemplate: ?string
 * }}
 * @private
 *
 * @description
 * Contains information about a SegmentTemplate.
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
 * @property {?string} mediaTemplate
 *   The media URI template, if given.
 * @property {?string} indexTemplate
 *   The index URI template, if given.
 */
shaka.dash.SegmentTemplate.SegmentTemplateInfo;


/**
 * @param {?shaka.dash.DashParser.InheritanceFrame} frame
 * @return {Element}
 * @private
 */
shaka.dash.SegmentTemplate.fromInheritance_ = function(frame) {
  return frame.segmentTemplate;
};


/**
 * Parses a SegmentTemplate element into an info object.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @return {shaka.dash.SegmentTemplate.SegmentTemplateInfo}
 * @private
 */
shaka.dash.SegmentTemplate.parseSegmentTemplateInfo_ = function(context) {
  var SegmentTemplate = shaka.dash.SegmentTemplate;
  var MpdUtils = shaka.dash.MpdUtils;
  var segmentInfo =
      MpdUtils.parseSegmentInfo(context, SegmentTemplate.fromInheritance_);

  var media = MpdUtils.inheritAttribute(
      context, SegmentTemplate.fromInheritance_, 'media');
  var index = MpdUtils.inheritAttribute(
      context, SegmentTemplate.fromInheritance_, 'index');

  return {
    segmentDuration: segmentInfo.segmentDuration,
    timescale: segmentInfo.timescale,
    startNumber: segmentInfo.startNumber,
    presentationTimeOffset: segmentInfo.presentationTimeOffset,
    timeline: segmentInfo.timeline,
    mediaTemplate: media,
    indexTemplate: index
  };
};


/**
 * Verifies a SegmentTemplate info object.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
 * @throws shaka.util.Error When there is a parsing error.
 * @private
 */
shaka.dash.SegmentTemplate.checkSegmentTemplateInfo_ = function(context, info) {
  var n = 0;
  n += info.indexTemplate ? 1 : 0;
  n += info.timeline ? 1 : 0;
  n += info.segmentDuration ? 1 : 0;

  if (n == 0) {
    shaka.log.error(
        'SegmentTemplate does not contain any segment information:',
        'the SegmentTemplate must contain either an index URL template',
        'a SegmentTimeline, or a segment duration.',
        context.representation);
    throw new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
  } else if (n != 1) {
    shaka.log.warning(
        'SegmentTemplate containes multiple segment information sources:',
        'the SegmentTemplate should only contain an index URL template,',
        'a SegmentTimeline or a segment duration.',
        context.representation);
    if (info.indexTemplate) {
      shaka.log.info('Using the index URL template by default.');
      info.timeline = null;
      info.segmentDuration = null;
    } else {
      goog.asserts.assert(info.timeline, 'There should be a timeline');
      shaka.log.info('Using the SegmentTimeline by default.');
      info.segmentDuration = null;
    }
  }

  if (!info.indexTemplate && !info.mediaTemplate) {
    shaka.log.error(
        'SegmentTemplate does not contain sufficient segment information:',
        'the SegmentTemplate\'s media URL template is missing.',
        context.representation);
    throw new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
  }
};


/**
 * Creates segment index functions from a index URL template.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {shaka.dash.DashParser.RequestInitSegmentCallback} requestInitSegment
 * @param {shaka.media.InitSegmentReference} init
 * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
 * @throws shaka.util.Error When there is a parsing error.
 * @return {shaka.dash.DashParser.SegmentIndexFunctions}
 * @private
 */
shaka.dash.SegmentTemplate.createFromIndexTemplate_ = function(
    context, requestInitSegment, init, info) {
  var MpdUtils = shaka.dash.MpdUtils;

  // Determine the container type.
  var containerType = context.representation.mimeType.split('/')[1];
  if ((containerType != 'mp4') && (containerType != 'webm')) {
    shaka.log.error(
        'SegmentTemplate specifies an unsupported container type.',
        context.representation);
    throw new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_UNSUPPORTED_CONTAINER);
  }

  if ((containerType == 'webm') && !init) {
    shaka.log.error(
        'SegmentTemplate does not contain sufficient segment information:',
        'the SegmentTemplate uses a WebM container,',
        'but does not contain an initialization URL template.',
        context.representation);
    throw new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_WEBM_MISSING_INIT);
  }

  goog.asserts.assert(info.indexTemplate, 'must be using index template');
  var filledTemplate = MpdUtils.fillUriTemplate(
      info.indexTemplate, context.representation.id,
      null, context.bandwidth || null, null);

  var resolvedUris =
      MpdUtils.resolveUris(context.representation.baseUris, [filledTemplate]);
  return shaka.dash.SegmentBase.createSegmentIndexFromUris(
      context, requestInitSegment, init, resolvedUris, 0, null, containerType,
      info.presentationTimeOffset);
};


/**
 * Creates segment index functions from a segment duration.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
 * @return {shaka.dash.DashParser.SegmentIndexFunctions}
 * @private
 */
shaka.dash.SegmentTemplate.createFromDuration_ = function(context, info) {
  goog.asserts.assert(info.mediaTemplate,
                      'There should be a media template with duration');
  var MpdUtils = shaka.dash.MpdUtils;

  var periodDuration = context.periodInfo.duration;
  var segmentDuration = info.segmentDuration;
  var startNumber = info.startNumber;
  var timescale = info.timescale;

  var template = info.mediaTemplate;
  var bandwidth = context.bandwidth || null;
  var id = context.representation.id;
  var baseUris = context.representation.baseUris;

  var find = function(periodTime) {
    if (periodTime < 0)
      return null;
    else if (periodDuration && periodTime >= periodDuration)
      return null;

    return Math.floor(periodTime / segmentDuration);
  };
  var get = function(position) {
    var segmentStart = position * segmentDuration;
    var getUris = function() {
      var mediaUri = MpdUtils.fillUriTemplate(
          template, id, position + startNumber, bandwidth,
          segmentStart * timescale);
      return MpdUtils.resolveUris(baseUris, [mediaUri]);
    };

    return new shaka.media.SegmentReference(
        position, segmentStart, segmentStart + segmentDuration, getUris, 0,
        null);
  };

  return {
    createSegmentIndex: Promise.resolve.bind(Promise),
    findSegmentPosition: find,
    getSegmentReference: get
  };
};


/**
 * Creates segment references from a timeline.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
 * @return {!Array.<!shaka.media.SegmentReference>}
 * @private
 */
shaka.dash.SegmentTemplate.createFromTimeline_ = function(context, info) {
  goog.asserts.assert(info.mediaTemplate,
                      'There should be a media template with a timeline');
  var MpdUtils = shaka.dash.MpdUtils;

  /** @type {!Array.<!shaka.media.SegmentReference>} */
  var references = [];
  for (var i = 0; i < info.timeline.length; i++) {
    var start = info.timeline[i].start;
    var end = info.timeline[i].end;

    // Note: i = k - 1, where k indicates the k'th segment listed in the MPD.
    // (See section 5.3.9.5.3 of the DASH spec.)
    var segmentReplacement = i + info.startNumber;

    // Consider the presentation time offset in segment uri computation
    var timeReplacement = (start + info.presentationTimeOffset) *
        info.timescale;

    var createUris = (function(
            template, repId, bandwidth, baseUris, segmentId, time) {
          var mediaUri = MpdUtils.fillUriTemplate(
              template, repId, segmentId, bandwidth, time);
          return MpdUtils.resolveUris(baseUris, [mediaUri])
              .map(function(g) { return g.toString(); });
        }.bind(null, info.mediaTemplate, context.representation.id,
               context.bandwidth || null, context.representation.baseUris,
               segmentReplacement, timeReplacement));

    references.push(new shaka.media.SegmentReference(
        segmentReplacement, start, end, createUris, 0, null));
  }

  return references;
};


/**
 * Creates an init segment reference from a context object.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @return {shaka.media.InitSegmentReference}
 * @private
 */
shaka.dash.SegmentTemplate.createInitSegment_ = function(context) {
  var MpdUtils = shaka.dash.MpdUtils;
  var SegmentTemplate = shaka.dash.SegmentTemplate;

  var initialization = MpdUtils.inheritAttribute(
      context, SegmentTemplate.fromInheritance_, 'initialization');
  if (!initialization)
    return null;

  var repId = context.representation.id;
  var bandwidth = context.bandwidth || null;
  var baseUris = context.representation.baseUris;
  var getUris = function() {
    goog.asserts.assert(initialization, 'Should have returned earler');
    var filledTemplate = MpdUtils.fillUriTemplate(
        initialization, repId, null, bandwidth, null);
    var resolvedUris = MpdUtils.resolveUris(baseUris, [filledTemplate]);
    return resolvedUris;
  };

  return new shaka.media.InitSegmentReference(getUris, 0, null);
};

