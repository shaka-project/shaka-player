/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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
goog.require('shaka.util.Iterables');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.ObjectUtils');


/**
 * @summary A set of functions for parsing SegmentTemplate elements.
 */
shaka.dash.SegmentTemplate = class {
  /**
   * Creates a new StreamInfo object.
   * Updates the existing SegmentIndex, if any.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.DashParser.RequestInitSegmentCallback}
   *   requestInitSegment
   * @param {!Object.<string, !shaka.media.SegmentIndex>} segmentIndexMap
   * @param {boolean} isUpdate True if the manifest is being updated.
   * @param {number} segmentLimit The maximum number of segments to generate for
   *   a SegmentTemplate with fixed duration.
   * @return {shaka.dash.DashParser.StreamInfo}
   */
  static createStreamInfo(
      context, requestInitSegment, segmentIndexMap, isUpdate,
      segmentLimit) {
    goog.asserts.assert(context.representation.segmentTemplate,
        'Should only be called with SegmentTemplate');
    const SegmentTemplate = shaka.dash.SegmentTemplate;

    const initSegmentReference = SegmentTemplate.createInitSegment_(context);
    const info = SegmentTemplate.parseSegmentTemplateInfo_(context);

    SegmentTemplate.checkSegmentTemplateInfo_(context, info);

    // Direct fields of context will be reassigned by the parser before
    // generateSegmentIndex is called.  So we must make a shallow copy first,
    // and use that in the generateSegmentIndex callbacks.
    const shallowCopyOfContext =
        shaka.util.ObjectUtils.shallowCloneObject(context);

    if (info.indexTemplate) {
      shaka.dash.SegmentBase.checkSegmentIndexSupport(
          context, initSegmentReference);

      return {
        generateSegmentIndex: () => {
          return SegmentTemplate.generateSegmentIndexFromIndexTemplate_(
              shallowCopyOfContext, requestInitSegment, initSegmentReference,
              info);
        },
      };
    } else if (info.segmentDuration) {
      if (!isUpdate) {
        context.presentationTimeline.notifyMaxSegmentDuration(
            info.segmentDuration);
        context.presentationTimeline.notifyMinSegmentStartTime(
            context.periodInfo.start);
      }

      return {
        generateSegmentIndex: () => {
          return SegmentTemplate.generateSegmentIndexFromDuration_(
              shallowCopyOfContext, info, segmentLimit, initSegmentReference);
        },
      };
    } else {
      /** @type {shaka.media.SegmentIndex} */
      let segmentIndex = null;
      let id = null;
      if (context.period.id && context.representation.id) {
        // Only check/store the index if period and representation IDs are set.
        id = context.period.id + ',' + context.representation.id;
        segmentIndex = segmentIndexMap[id];
      }

      const references = SegmentTemplate.createFromTimeline_(
          context, info, initSegmentReference);

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

      return {
        generateSegmentIndex: () => Promise.resolve(segmentIndex),
      };
    }
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
   * Generates a SegmentIndex from an index URL template.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.DashParser.RequestInitSegmentCallback}
   *     requestInitSegment
   * @param {shaka.media.InitSegmentReference} init
   * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
   * @return {!Promise.<shaka.media.SegmentIndex>}
   * @private
   */
  static generateSegmentIndexFromIndexTemplate_(
      context, requestInitSegment, init, info) {
    const MpdUtils = shaka.dash.MpdUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    goog.asserts.assert(info.indexTemplate, 'must be using index template');
    const filledTemplate = MpdUtils.fillUriTemplate(
        info.indexTemplate, context.representation.id,
        null, context.bandwidth || null, null);

    const resolvedUris = ManifestParserUtils.resolveUris(
        context.representation.baseUris, [filledTemplate]);

    return shaka.dash.SegmentBase.generateSegmentIndexFromUris(
        context, requestInitSegment, init, resolvedUris, 0, null,
        info.scaledPresentationTimeOffset);
  }

  /**
   * Generates a SegmentIndex from fixed-duration segments.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
   * @param {number} segmentLimit The maximum number of segments to generate.
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @return {!Promise.<shaka.media.SegmentIndex>}
   * @private
   */
  static generateSegmentIndexFromDuration_(
      context, info, segmentLimit, initSegmentReference) {
    goog.asserts.assert(info.mediaTemplate,
        'There should be a media template with duration');
    const MpdUtils = shaka.dash.MpdUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    const presentationTimeline = context.presentationTimeline;
    const periodStart = context.periodInfo.start;
    const periodDuration = context.periodInfo.duration;
    const segmentDuration = info.segmentDuration;
    goog.asserts.assert(
        segmentDuration != null, 'Segment duration must not be null!');
    const startNumber = info.startNumber;
    const timescale = info.timescale;

    const template = info.mediaTemplate;
    const bandwidth = context.bandwidth || null;
    const id = context.representation.id;
    const baseUris = context.representation.baseUris;

    // The times from presentationTimeline are relative to the presentation, and
    // are converted here to timestamps relative to the period.
    const getWindowStart =
        () => presentationTimeline.getSegmentAvailabilityStart() - periodStart;
    const getWindowEnd = () => {
      let windowEnd =
          presentationTimeline.getSegmentAvailabilityEnd() - periodStart;
      if (periodDuration) {
        // The period has ended, so cap windowEnd there.
        windowEnd = Math.min(windowEnd, periodDuration);
      }
      return windowEnd;
    };

    // 0-based index, used to calculate times.
    let minPosition = Math.floor(getWindowStart() / segmentDuration);
    const getMaxPosition =
        () => Math.ceil(getWindowEnd() / segmentDuration) - 1;
    const maxPosition = getMaxPosition();

    // Limit the initial SegmentIndex in size, to avoid consuming too much CPU
    // or memory for content with gigantic timeShiftBufferDepth (which can have
    // values up to and including Infinity).
    minPosition = Math.max(minPosition, maxPosition - segmentLimit);

    const references = [];
    const createReference = (position) => {
      // These inner variables are all scoped to the inner loop, and can be used
      // safely in the callback below.
      const segmentStart = position * segmentDuration;
      let segmentEnd = segmentStart + segmentDuration;
      // Cap the segment end at the period end so that references from the next
      // period will fit neatly after it.
      if (periodDuration) {
        segmentEnd = Math.min(segmentEnd, periodDuration);
      }

      // startNumber-based index, used to fill in template and index segment
      // references.
      const segmentPosition = startNumber + position;

      const getUris = () => {
        const mediaUri = MpdUtils.fillUriTemplate(
            template, id, segmentPosition, bandwidth,
            segmentStart * timescale);
        return ManifestParserUtils.resolveUris(baseUris, [mediaUri]);
      };

      // TODO: Update indexes from position to segmentPosition for consistency
      return new shaka.media.SegmentReference(
          position, segmentStart, segmentEnd, getUris, /* startByte */ 0,
          /* endByte */ null, initSegmentReference,
          info.scaledPresentationTimeOffset);
    };

    for (let position = minPosition; position <= maxPosition; ++position) {
      const reference = createReference(position);
      references.push(reference);
    }

    /** @type {shaka.media.SegmentIndex} */
    const segmentIndex = new shaka.media.SegmentIndex(references);

    if (!periodDuration) {
      // The period continues to get longer over time, so check for new
      // references once every |segmentDuration| seconds.
      let nextPosition = maxPosition + 1;
      segmentIndex.updateEvery(segmentDuration, () => {
        // Evict any references outside the window.
        segmentIndex.evict(getWindowStart());

        // Compute any new references that need to be added.
        const maxPosition = getMaxPosition();
        const references = [];
        while (nextPosition <= maxPosition) {
          const reference = createReference(nextPosition);
          references.push(reference);
          nextPosition++;
        }
        return references;
      });
    }

    return Promise.resolve(segmentIndex);
  }

  /**
   * Creates segment references from a timeline.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @return {!Array.<!shaka.media.SegmentReference>}
   * @private
   */
  static createFromTimeline_(context, info, initSegmentReference) {
    const MpdUtils = shaka.dash.MpdUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    /** @type {!Array.<!shaka.media.SegmentReference>} */
    const references = [];
    const enum_ = (it) => shaka.util.Iterables.enumerate(it);
    for (const {i, item: {start, unscaledStart, end}} of enum_(info.timeline)) {
      // Note: i = k - 1, where k indicates the k'th segment listed in the MPD.
      // (See section 5.3.9.5.3 of the DASH spec.)
      const segmentReplacement = i + info.startNumber;

      // Consider the presentation time offset in segment uri computation
      const timeReplacement = unscaledStart +
          info.unscaledPresentationTimeOffset;
      const repId = context.representation.id;
      const bandwidth = context.bandwidth || null;
      const createUris =
          () => {
            goog.asserts.assert(
                info.mediaTemplate,
                'There should be a media template with a timeline');
            const mediaUri = MpdUtils.fillUriTemplate(
                info.mediaTemplate, repId,
                segmentReplacement, bandwidth || null, timeReplacement);
            return ManifestParserUtils
                .resolveUris(context.representation.baseUris, [mediaUri])
                .map((g) => {
                  return g.toString();
                });
          };

      references.push(new shaka.media.SegmentReference(
          segmentReplacement, start, end, createUris, /* startByte */ 0,
          /* endByte */ null, initSegmentReference,
          info.scaledPresentationTimeOffset));
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
