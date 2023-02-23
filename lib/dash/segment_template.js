/*! @license
 * Shaka Player
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
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.ObjectUtils');
goog.requireType('shaka.dash.DashParser');


/**
 * @summary A set of functions for parsing SegmentTemplate elements.
 */
shaka.dash.SegmentTemplate = class {
  /**
   * Creates a new StreamInfo object.
   * Updates the existing SegmentIndex, if any.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.DashParser.RequestSegmentCallback} requestSegment
   * @param {!Object.<string, !shaka.extern.Stream>} streamMap
   * @param {boolean} isUpdate True if the manifest is being updated.
   * @param {number} segmentLimit The maximum number of segments to generate for
   *   a SegmentTemplate with fixed duration.
   * @param {!Object.<string, number>} periodDurationMap
   * @return {shaka.dash.DashParser.StreamInfo}
   */
  static createStreamInfo(
      context, requestSegment, streamMap, isUpdate, segmentLimit,
      periodDurationMap) {
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
              shallowCopyOfContext, requestSegment, initSegmentReference,
              info);
        },
      };
    } else if (info.segmentDuration) {
      if (!isUpdate && context.adaptationSet.contentType !== 'image') {
        context.presentationTimeline.notifyMaxSegmentDuration(
            info.segmentDuration);
        context.presentationTimeline.notifyMinSegmentStartTime(
            context.periodInfo.start);
      }

      return {
        generateSegmentIndex: () => {
          return SegmentTemplate.generateSegmentIndexFromDuration_(
              shallowCopyOfContext, info, segmentLimit, initSegmentReference,
              periodDurationMap);
        },
      };
    } else {
      /** @type {shaka.media.SegmentIndex} */
      let segmentIndex = null;
      let id = null;
      let stream = null;
      if (context.period.id && context.representation.id) {
        // Only check/store the index if period and representation IDs are set.
        id = context.period.id + ',' + context.representation.id;
        stream = streamMap[id];
        if (stream) {
          segmentIndex = stream.segmentIndex;
        }
      }

      const references = SegmentTemplate.createFromTimeline_(
          shallowCopyOfContext, info, initSegmentReference);

      const periodStart = context.periodInfo.start;
      const periodEnd = context.periodInfo.duration ?
          context.periodInfo.start + context.periodInfo.duration : Infinity;

      /* When to fit segments.  All refactors should honor/update this table:
       *
       * | dynamic | infinite | last   | should | notes                     |
       * |         | period   | period | fit    |                           |
       * | ------- | -------- | ------ | ------ | ------------------------- |
       * |     F   |     F    |    X   |    T   | typical VOD               |
       * |     F   |     T    |    X   |    X   | impossible: infinite VOD  |
       * |     T   |     F    |    F   |    T   | typical live, old period  |
       * |     T   |     F    |    T   |    F   | typical IPR               |
       * |     T   |     T    |    F   |    X   | impossible: old, infinite |
       * |     T   |     T    |    T   |    F   | typical live, new period  |
       */

      // We never fit the final period of dynamic content, which could be
      // infinite live (with no limit to fit to) or IPR (which would expand the
      // most recent segment to the end of the presentation).
      const shouldFit = !(context.dynamic && context.periodInfo.isLastPeriod);

      if (segmentIndex) {
        if (shouldFit) {
          // Fit the new references before merging them, so that the merge
          // algorithm has a more accurate view of their start and end times.
          const wrapper = new shaka.media.SegmentIndex(references);
          wrapper.fit(periodStart, periodEnd, /* isNew= */ true);
        }

        segmentIndex.mergeAndEvict(references,
            context.presentationTimeline.getSegmentAvailabilityStart());
      } else {
        segmentIndex = new shaka.media.SegmentIndex(references);
      }
      context.presentationTimeline.notifySegments(references);

      if (shouldFit) {
        segmentIndex.fit(periodStart, periodEnd);
      }

      if (stream && context.dynamic) {
        stream.segmentIndex = segmentIndex;
      }

      return {
        generateSegmentIndex: () => {
          // If segmentIndex is deleted, or segmentIndex's references are
          // released by closeSegmentIndex(), we should set the value of
          // segmentIndex again.
          if (!segmentIndex || segmentIndex.isEmpty()) {
            segmentIndex.merge(references);
          }
          return Promise.resolve(segmentIndex);
        },
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
   * @param {shaka.dash.DashParser.RequestSegmentCallback} requestSegment
   * @param {shaka.media.InitSegmentReference} init
   * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
   * @return {!Promise.<shaka.media.SegmentIndex>}
   * @private
   */
  static generateSegmentIndexFromIndexTemplate_(
      context, requestSegment, init, info) {
    const MpdUtils = shaka.dash.MpdUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    goog.asserts.assert(info.indexTemplate, 'must be using index template');
    const filledTemplate = MpdUtils.fillUriTemplate(
        info.indexTemplate, context.representation.id,
        null, context.bandwidth || null, null);

    const resolvedUris = ManifestParserUtils.resolveUris(
        context.representation.baseUris, [filledTemplate]);

    return shaka.dash.SegmentBase.generateSegmentIndexFromUris(
        context, requestSegment, init, resolvedUris, 0, null,
        info.scaledPresentationTimeOffset);
  }

  /**
   * Generates a SegmentIndex from fixed-duration segments.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
   * @param {number} segmentLimit The maximum number of segments to generate.
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @param {!Object.<string, number>} periodDurationMap
   * @return {!Promise.<shaka.media.SegmentIndex>}
   * @private
   */
  static generateSegmentIndexFromDuration_(
      context, info, segmentLimit, initSegmentReference, periodDurationMap) {
    goog.asserts.assert(info.mediaTemplate,
        'There should be a media template with duration');

    const MpdUtils = shaka.dash.MpdUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    const presentationTimeline = context.presentationTimeline;

    // Capture values that could change as the parsing context moves on to
    // other parts of the manifest.
    const periodStart = context.periodInfo.start;
    const periodId = context.period.id;
    const initialPeriodDuration = context.periodInfo.duration;

    // For multi-period live streams the period duration may not be known until
    // the following period appears in an updated manifest. periodDurationMap
    // provides the updated period duration.
    const getPeriodEnd = () => {
      const periodDuration =
        (periodId != null && periodDurationMap[periodId]) ||
        initialPeriodDuration;
      const periodEnd = periodDuration ?
        (periodStart + periodDuration) : Infinity;
      return periodEnd;
    };

    const segmentDuration = info.segmentDuration;
    goog.asserts.assert(
        segmentDuration != null, 'Segment duration must not be null!');

    const startNumber = info.startNumber;
    const timescale = info.timescale;

    const template = info.mediaTemplate;
    const bandwidth = context.bandwidth || null;
    const id = context.representation.id;
    const baseUris = context.representation.baseUris;

    const timestampOffset = periodStart - info.scaledPresentationTimeOffset;

    // Computes the range of presentation timestamps both within the period and
    // available.  This is an intersection of the period range and the
    // availability window.
    const computeAvailablePeriodRange = () => {
      return [
        Math.max(
            presentationTimeline.getSegmentAvailabilityStart(),
            periodStart),

        Math.min(
            presentationTimeline.getSegmentAvailabilityEnd(),
            getPeriodEnd()),
      ];
    };

    // Computes the range of absolute positions both within the period and
    // available.  The range is inclusive.  These are the positions for which we
    // will generate segment references.
    const computeAvailablePositionRange = () => {
      // In presentation timestamps.
      const availablePresentationTimes = computeAvailablePeriodRange();
      goog.asserts.assert(availablePresentationTimes.every(isFinite),
          'Available presentation times must be finite!');
      goog.asserts.assert(availablePresentationTimes.every((x) => x >= 0),
          'Available presentation times must be positive!');
      goog.asserts.assert(segmentDuration != null,
          'Segment duration must not be null!');

      // In period-relative timestamps.
      const availablePeriodTimes =
          availablePresentationTimes.map((x) => x - periodStart);
      // These may sometimes be reversed ([1] <= [0]) if the period is
      // completely unavailable.  The logic will still work if this happens,
      // because we will simply generate no references.

      // In period-relative positions (0-based).
      const availablePeriodPositions = [
        Math.ceil(availablePeriodTimes[0] / segmentDuration),
        Math.ceil(availablePeriodTimes[1] / segmentDuration) - 1,
      ];

      // In absolute positions.
      const availablePresentationPositions =
          availablePeriodPositions.map((x) => x + startNumber);
      return availablePresentationPositions;
    };

    // For Live, we must limit the initial SegmentIndex in size, to avoid
    // consuming too much CPU or memory for content with gigantic
    // timeShiftBufferDepth (which can have values up to and including
    // Infinity).
    const range = computeAvailablePositionRange();
    const minPosition = context.dynamic ?
        Math.max(range[0], range[1] - segmentLimit + 1) :
        range[0];
    const maxPosition = range[1];

    const references = [];
    const createReference = (position) => {
      // These inner variables are all scoped to the inner loop, and can be used
      // safely in the callback below.

      goog.asserts.assert(segmentDuration != null,
          'Segment duration must not be null!');

      // Relative to the period start.
      const positionWithinPeriod = position - startNumber;
      const segmentPeriodTime = positionWithinPeriod * segmentDuration;

      // What will appear in the actual segment files.  The media timestamp is
      // what is expected in the $Time$ template.
      const segmentMediaTime = segmentPeriodTime +
          info.scaledPresentationTimeOffset;

      const getUris = () => {
        const mediaUri = MpdUtils.fillUriTemplate(
            template, id, position, bandwidth,
            segmentMediaTime * timescale);
        return ManifestParserUtils.resolveUris(baseUris, [mediaUri]);
      };

      // Relative to the presentation.
      const segmentStart = segmentPeriodTime + periodStart;
      const trueSegmentEnd = segmentStart + segmentDuration;
      // Cap the segment end at the period end so that references from the
      // next period will fit neatly after it.
      const segmentEnd = Math.min(trueSegmentEnd, getPeriodEnd());

      // This condition will be true unless the segmentStart was >= periodEnd.
      // If we've done the position calculations correctly, this won't happen.
      goog.asserts.assert(segmentStart < segmentEnd,
          'Generated a segment outside of the period!');

      const ref = new shaka.media.SegmentReference(
          segmentStart,
          segmentEnd,
          getUris,
          /* startByte= */ 0,
          /* endByte= */ null,
          initSegmentReference,
          timestampOffset,
          /* appendWindowStart= */ periodStart,
          /* appendWindowEnd= */ getPeriodEnd());
      // This is necessary information for thumbnail streams:
      ref.trueEndTime = trueSegmentEnd;
      return ref;
    };

    for (let position = minPosition; position <= maxPosition; ++position) {
      const reference = createReference(position);
      references.push(reference);
    }

    /** @type {shaka.media.SegmentIndex} */
    const segmentIndex = new shaka.media.SegmentIndex(references);

    // If the availability timeline currently ends before the period, we will
    // need to add references over time.
    const willNeedToAddReferences =
        presentationTimeline.getSegmentAvailabilityEnd() < getPeriodEnd();

    // When we start a live stream with a period that ends within the
    // availability window we will not need to add more references, but we will
    // need to evict old references.
    const willNeedToEvictReferences = presentationTimeline.isLive();

    if (willNeedToAddReferences || willNeedToEvictReferences) {
      // The period continues to get longer over time, so check for new
      // references once every |segmentDuration| seconds.
      // We clamp to |minPosition| in case the initial range was reversed and no
      // references were generated.  Otherwise, the update would start creating
      // negative positions for segments in periods which begin in the future.
      let nextPosition = Math.max(minPosition, maxPosition + 1);
      segmentIndex.updateEvery(segmentDuration, () => {
        // Evict any references outside the window.
        const availabilityStartTime =
          presentationTimeline.getSegmentAvailabilityStart();
        segmentIndex.evict(availabilityStartTime);

        // Compute any new references that need to be added.
        const [_, maxPosition] = computeAvailablePositionRange();
        const references = [];
        while (nextPosition <= maxPosition) {
          const reference = createReference(nextPosition);
          references.push(reference);
          nextPosition++;
        }

        // The timer must continue firing until the entire period is
        // unavailable, so that all references will be evicted.
        if (availabilityStartTime > getPeriodEnd() && !references.length) {
          // Signal stop.
          return null;
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

    const periodStart = context.periodInfo.start;
    const periodDuration = context.periodInfo.duration;

    const timestampOffset = periodStart - info.scaledPresentationTimeOffset;
    const appendWindowStart = periodStart;
    const appendWindowEnd = periodDuration ?
        periodStart + periodDuration : Infinity;

    /** @type {!Array.<!shaka.media.SegmentReference>} */
    const references = [];
    for (let i = 0; i < info.timeline.length; i++) {
      const {start, unscaledStart, end} = info.timeline[i];

      // Note: i = k - 1, where k indicates the k'th segment listed in the MPD.
      // (See section 5.3.9.5.3 of the DASH spec.)
      const segmentReplacement = i + info.startNumber;

      // Consider the presentation time offset in segment uri computation
      const timeReplacement = unscaledStart +
          info.unscaledPresentationTimeOffset;
      const repId = context.representation.id;
      const bandwidth = context.bandwidth || null;
      const mediaTemplate = info.mediaTemplate;
      const baseUris = context.representation.baseUris;

      // This callback must not capture any non-local
      // variables, such as info, context, etc.  Make
      // sure any values you reference here have
      // been assigned to local variables within the
      // loop, or else we will end up with a leak.
      const createUris =
          () => {
            goog.asserts.assert(
                mediaTemplate,
                'There should be a media template with a timeline');
            const mediaUri = MpdUtils.fillUriTemplate(
                mediaTemplate, repId,
                segmentReplacement, bandwidth || null, timeReplacement);
            return ManifestParserUtils
                .resolveUris(baseUris, [mediaUri])
                .map((g) => {
                  return g.toString();
                });
          };

      references.push(new shaka.media.SegmentReference(
          periodStart + start,
          periodStart + end,
          createUris,
          /* startByte= */ 0,
          /* endByte= */ null,
          initSegmentReference,
          timestampOffset,
          appendWindowStart,
          appendWindowEnd));
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
    const qualityInfo = shaka.dash.SegmentBase.createQualityInfo(context);
    return new shaka.media.InitSegmentReference(getUris, 0, null, qualityInfo);
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
