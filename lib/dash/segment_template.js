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
goog.require('shaka.util.ManifestParserUtils');


/**
 * @summary A set of functions for parsing SegmentTemplate elements.
 */
shaka.dash.SegmentTemplate = class {
  /**
   * Creates a new Stream object or updates the Stream in the manifest.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.DashParser.RequestInitSegmentCallback}
   *     requestInitSegment
   * @param {!Object.<string, !shaka.media.SegmentIndex>} segmentIndexMap
   * @param {boolean} isUpdate True if the manifest is being updated.
   * @throws shaka.util.Error When there is a parsing error.
   * @return {shaka.dash.DashParser.StreamInfo}
   */
  static createStream(context, requestInitSegment, segmentIndexMap, isUpdate) {
    goog.asserts.assert(context.representation.segmentTemplate,
        'Should only be called with SegmentTemplate');
    const SegmentTemplate = shaka.dash.SegmentTemplate;

    const init = SegmentTemplate.createInitSegment_(context);
    const info = SegmentTemplate.parseSegmentTemplateInfo_(context);

    SegmentTemplate.checkSegmentTemplateInfo_(context, info);

    /** @type {?shaka.dash.DashParser.SegmentIndexFunctions} */
    let segmentIndexFunctions = null;
    if (info.indexTemplate) {
      segmentIndexFunctions = SegmentTemplate.createFromIndexTemplate_(
          context, requestInitSegment, init, info);
    } else if (info.segmentDuration) {
      if (!isUpdate) {
        context.presentationTimeline.notifyMaxSegmentDuration(
            info.segmentDuration);
        context.presentationTimeline.notifyMinSegmentStartTime(
            context.periodInfo.start);
      }
      segmentIndexFunctions =
          SegmentTemplate.createFromDuration_(context, info);
    } else {
      /** @type {shaka.media.SegmentIndex} */
      let segmentIndex = null;
      let id = null;
      if (context.period.id && context.representation.id) {
        // Only check/store the index if period and representation IDs are set.
        id = context.period.id + ',' + context.representation.id;
        segmentIndex = segmentIndexMap[id];
      }

      const references = SegmentTemplate.createFromTimeline_(context, info);

      // Don't fit live content, since it might receive more segments.
      // Unless that live content is multi-period; it's safe to fit every period
      // but the last one, since only the last period might receive new
      // segments.
      const shouldFit = !context.dynamic || !context.periodInfo.isLastPeriod;

      if (segmentIndex) {
        if (shouldFit) {
          // Fit the new references before merging them, so that the merge
          // algorithm has a more accurate view of their start and end times.
          const wrapper = new shaka.media.SegmentIndex(references);
          wrapper.fit(context.periodInfo.duration);
        }

        segmentIndex.merge(references);
        const start =
            context.presentationTimeline.getSegmentAvailabilityStart();
        segmentIndex.evict(start - context.periodInfo.start);
      } else {
        context.presentationTimeline.notifySegments(
            references, context.periodInfo.start);
        segmentIndex = new shaka.media.SegmentIndex(references);
        if (id && context.dynamic) {
          segmentIndexMap[id] = segmentIndex;
        }
      }

      if (shouldFit) {
        segmentIndex.fit(context.periodInfo.duration);
      }

      segmentIndexFunctions = {
        createSegmentIndex: () => Promise.resolve(),
        findSegmentPosition: (i) => segmentIndex.find(i),
        getSegmentReference: (i) => segmentIndex.get(i),
      };
    }

    return {
      createSegmentIndex: segmentIndexFunctions.createSegmentIndex,
      findSegmentPosition: segmentIndexFunctions.findSegmentPosition,
      getSegmentReference: segmentIndexFunctions.getSegmentReference,
      initSegmentReference: init,
      scaledPresentationTimeOffset: info.scaledPresentationTimeOffset,
    };
  }

  /**
   * @param {?shaka.dash.DashParser.InheritanceFrame} frame
   * @return {Element}
   * @private
   */
  static fromInheritance_(frame) {
    return frame.segmentTemplate;
  }

  /**
   * Parses a SegmentTemplate element into an info object.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @return {shaka.dash.SegmentTemplate.SegmentTemplateInfo}
   * @private
   */
  static parseSegmentTemplateInfo_(context) {
    const SegmentTemplate = shaka.dash.SegmentTemplate;
    const MpdUtils = shaka.dash.MpdUtils;
    const segmentInfo =
        MpdUtils.parseSegmentInfo(context, SegmentTemplate.fromInheritance_);

    const media = MpdUtils.inheritAttribute(
        context, SegmentTemplate.fromInheritance_, 'media');
    const index = MpdUtils.inheritAttribute(
        context, SegmentTemplate.fromInheritance_, 'index');

    return {
      segmentDuration: segmentInfo.segmentDuration,
      timescale: segmentInfo.timescale,
      startNumber: segmentInfo.startNumber,
      scaledPresentationTimeOffset: segmentInfo.scaledPresentationTimeOffset,
      unscaledPresentationTimeOffset:
          segmentInfo.unscaledPresentationTimeOffset,
      timeline: segmentInfo.timeline,
      mediaTemplate: media,
      indexTemplate: index,
    };
  }

  /**
   * Verifies a SegmentTemplate info object.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
   * @throws shaka.util.Error When there is a parsing error.
   * @private
   */
  static checkSegmentTemplateInfo_(context, info) {
    let n = 0;
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
          shaka.util.Error.Severity.CRITICAL,
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
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
    }
  }

  /**
   * Creates segment index functions from a index URL template.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.DashParser.RequestInitSegmentCallback}
   *     requestInitSegment
   * @param {shaka.media.InitSegmentReference} init
   * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
   * @throws shaka.util.Error When there is a parsing error.
   * @return {shaka.dash.DashParser.SegmentIndexFunctions}
   * @private
   */
  static createFromIndexTemplate_(context, requestInitSegment, init, info) {
    const MpdUtils = shaka.dash.MpdUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    // Determine the container type.
    const containerType = context.representation.mimeType.split('/')[1];
    if ((containerType != 'mp4') && (containerType != 'webm')) {
      shaka.log.error(
          'SegmentTemplate specifies an unsupported container type.',
          context.representation);
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
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
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_WEBM_MISSING_INIT);
    }

    goog.asserts.assert(info.indexTemplate, 'must be using index template');
    const filledTemplate = MpdUtils.fillUriTemplate(
        info.indexTemplate, context.representation.id,
        null, context.bandwidth || null, null);

    const resolvedUris = ManifestParserUtils.resolveUris(
        context.representation.baseUris, [filledTemplate]);

    return shaka.dash.SegmentBase.createSegmentIndexFromUris(
        context, requestInitSegment, init, resolvedUris, 0, null, containerType,
        info.scaledPresentationTimeOffset);
  }

  /**
   * Creates segment index functions from a segment duration.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
   * @return {shaka.dash.DashParser.SegmentIndexFunctions}
   * @private
   */
  static createFromDuration_(context, info) {
    goog.asserts.assert(info.mediaTemplate,
        'There should be a media template with duration');
    const MpdUtils = shaka.dash.MpdUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    const periodDuration = context.periodInfo.duration;
    const segmentDuration = info.segmentDuration;
    const startNumber = info.startNumber;
    const timescale = info.timescale;

    const template = info.mediaTemplate;
    const bandwidth = context.bandwidth || null;
    const id = context.representation.id;
    const baseUris = context.representation.baseUris;

    const find = (periodTime) => {
      if (periodTime < 0) {
        return null;
      } else if (periodDuration && periodTime >= periodDuration) {
        return null;
      }

      return Math.floor(periodTime / segmentDuration);
    };
    const get = (position) => {
      const segmentStart = position * segmentDuration;
      // Cap the segment end at the period end, to avoid period transition
      // issues in StreamingEngine.
      let segmentEnd = segmentStart + segmentDuration;
      if (periodDuration) {
        segmentEnd = Math.min(segmentEnd, periodDuration);
      }

      // Do not construct segments references that should not exist.
      if (segmentEnd < 0) {
        return null;
      } else if (periodDuration && segmentStart >= periodDuration) {
        return null;
      }

      const getUris = () => {
        const mediaUri = MpdUtils.fillUriTemplate(
            template, id, position + startNumber, bandwidth,
            segmentStart * timescale);
        return ManifestParserUtils.resolveUris(baseUris, [mediaUri]);
      };

      return new shaka.media.SegmentReference(
          position, segmentStart, segmentEnd, getUris, 0, null);
    };

    return {
      createSegmentIndex: () => Promise.resolve(),
      findSegmentPosition: find,
      getSegmentReference: get,
    };
  }

  /**
   * Creates segment references from a timeline.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
   * @return {!Array.<!shaka.media.SegmentReference>}
   * @private
   */
  static createFromTimeline_(context, info) {
    const MpdUtils = shaka.dash.MpdUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    /** @type {!Array.<!shaka.media.SegmentReference>} */
    const references = [];
    for (let i = 0; i < info.timeline.length; i++) {
      const start = info.timeline[i].start;
      const unscaledStart = info.timeline[i].unscaledStart;
      const end = info.timeline[i].end;

      // Note: i = k - 1, where k indicates the k'th segment listed in the MPD.
      // (See section 5.3.9.5.3 of the DASH spec.)
      const segmentReplacement = i + info.startNumber;

      // Consider the presentation time offset in segment uri computation
      const timeReplacement = unscaledStart +
          info.unscaledPresentationTimeOffset;
      const createUris =
          () => {
            goog.asserts.assert(
                info.mediaTemplate,
                'There should be a media template with a timeline');
            const mediaUri = MpdUtils.fillUriTemplate(
                info.mediaTemplate, context.representation.id,
                segmentReplacement, context.bandwidth || null, timeReplacement);
            return ManifestParserUtils
                .resolveUris(context.representation.baseUris, [mediaUri])
                .map((g) => {
                  return g.toString();
                });
          };

      references.push(new shaka.media.SegmentReference(
          segmentReplacement, start, end, createUris, 0, null));
    }

    return references;
  }

  /**
   * Creates an init segment reference from a context object.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @return {shaka.media.InitSegmentReference}
   * @private
   */
  static createInitSegment_(context) {
    const MpdUtils = shaka.dash.MpdUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const SegmentTemplate = shaka.dash.SegmentTemplate;

    const initialization = MpdUtils.inheritAttribute(
        context, SegmentTemplate.fromInheritance_, 'initialization');
    if (!initialization) {
      return null;
    }

    const repId = context.representation.id;
    const bandwidth = context.bandwidth || null;
    const baseUris = context.representation.baseUris;
    const getUris = () => {
      goog.asserts.assert(initialization, 'Should have returned earler');
      const filledTemplate = MpdUtils.fillUriTemplate(
          initialization, repId, null, bandwidth, null);
      const resolvedUris = ManifestParserUtils.resolveUris(
          baseUris, [filledTemplate]);
      return resolvedUris;
    };

    return new shaka.media.InitSegmentReference(getUris, 0, null);
  }
};

/**
 * @typedef {{
 *   timescale: number,
 *   segmentDuration: ?number,
 *   startNumber: number,
 *   scaledPresentationTimeOffset: number,
 *   unscaledPresentationTimeOffset: number,
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
 * @property {number} scaledPresentationTimeOffset
 *   The presentation time offset of the representation, in seconds.
 * @property {number} unscaledPresentationTimeOffset
 *   The presentation time offset of the representation, in timescale units.
 * @property {Array.<shaka.dash.MpdUtils.TimeRange>} timeline
 *   The timeline of the representation, if given.  Times in seconds.
 * @property {?string} mediaTemplate
 *   The media URI template, if given.
 * @property {?string} indexTemplate
 *   The index URI template, if given.
 */
shaka.dash.SegmentTemplate.SegmentTemplateInfo;
