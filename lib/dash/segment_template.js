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
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.ObjectUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');
goog.requireType('shaka.dash.DashParser');
goog.requireType('shaka.media.PresentationTimeline');


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
   * @param {!Map<string, !shaka.extern.Stream>} streamMap
   * @param {boolean} isUpdate True if the manifest is being updated.
   * @param {number} segmentLimit The maximum number of segments to generate for
   *   a SegmentTemplate with fixed duration.
   * @param {!Map<string, number>} periodDurationMap
   * @param {shaka.extern.aesKey|undefined} aesKey
   * @param {?number} lastSegmentNumber
   * @param {boolean} isPatchUpdate
   * @param {
   *  !Map<string, {endTime: number, timeline: number, reps: Array<string>}>
   * } continuityCache
   * @return {shaka.dash.DashParser.StreamInfo}
   */
  static createStreamInfo(
      context, requestSegment, streamMap, isUpdate, segmentLimit,
      periodDurationMap, aesKey, lastSegmentNumber, isPatchUpdate,
      continuityCache) {
    goog.asserts.assert(context.representation.segmentTemplate,
        'Should only be called with SegmentTemplate ' +
        'or segment info defined');
    const MpdUtils = shaka.dash.MpdUtils;
    const SegmentTemplate = shaka.dash.SegmentTemplate;
    const TimelineSegmentIndex = shaka.dash.TimelineSegmentIndex;

    if (!isPatchUpdate && !context.representation.initialization) {
      context.representation.initialization =
          MpdUtils.inheritAttribute(
              context, SegmentTemplate.fromInheritance_, 'initialization');
    }

    const initSegmentReference = context.representation.initialization ?
        SegmentTemplate.createInitSegment_(context, aesKey) : null;

    /** @type {shaka.dash.SegmentTemplate.SegmentTemplateInfo} */
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
        endTime: -1,
        timeline: -1,
        generateSegmentIndex: () => {
          return SegmentTemplate.generateSegmentIndexFromIndexTemplate_(
              shallowCopyOfContext, requestSegment, initSegmentReference,
              info);
        },
        timescale: info.timescale,
      };
    } else if (info.segmentDuration) {
      if (!isUpdate &&
          context.adaptationSet.contentType !== 'image' &&
          context.adaptationSet.contentType !== 'text') {
        const periodStart = context.periodInfo.start;
        const periodId = context.period.id;
        const initialPeriodDuration = context.periodInfo.duration;
        const periodDuration =
          (periodId != null && periodDurationMap.get(periodId)) ||
          initialPeriodDuration;
        const periodEnd = periodDuration ?
          (periodStart + periodDuration) : Infinity;

        context.presentationTimeline.notifyMaxSegmentDuration(
            info.segmentDuration);
        context.presentationTimeline.notifyPeriodDuration(
            periodStart, periodEnd);
      }

      return {
        endTime: -1,
        timeline: -1,
        generateSegmentIndex: () => {
          return SegmentTemplate.generateSegmentIndexFromDuration_(
              shallowCopyOfContext, info, segmentLimit, initSegmentReference,
              periodDurationMap, aesKey, lastSegmentNumber,
              context.representation.segmentSequenceCadence);
        },
        timescale: info.timescale,
      };
    } else {
      /** @type {shaka.media.SegmentIndex} */
      let segmentIndex = null;
      let id = null;
      let stream = null;
      if (context.period.id && context.representation.id) {
        // Only check/store the index if period and representation IDs are set.
        id = context.period.id + ',' + context.representation.id;
        stream = streamMap.get(id);
        if (stream) {
          segmentIndex = stream.segmentIndex;
        }
      }

      const periodStart = context.periodInfo.start;
      const periodEnd = context.periodInfo.duration ? periodStart +
        context.periodInfo.duration : Infinity;

      shaka.log.debug(`New manifest ${periodStart} - ${periodEnd}`);

      if (!segmentIndex) {
        let newTimeline = 0;
        let timelineToUse = -1;

        if (context.period.id != null && context.representation.id != null) {
          const cache = continuityCache.get(context.period.id);

          if (cache) {
            // if we're on the current period still, use that timeline
            timelineToUse = cache.timeline;
          } else {
            // if we're on a new period, calculate timeline to use
            for (const value of continuityCache.values()) {
              const threshold =
                  shaka.util.ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS;
              if (Math.abs(info.scaledPresentationTimeOffset - value.endTime) <=
                threshold && value.reps.includes(context.representation.id)) {
                timelineToUse = value.timeline;
                break;
              } else if (value.timeline >= newTimeline) {
                newTimeline = value.timeline + 1;
              }
            }
          }
        }

        if (timelineToUse == -1) {
          timelineToUse = newTimeline;
        }

        shaka.log.debug(`Creating TSI with end ${periodEnd}`);
        segmentIndex = new TimelineSegmentIndex(
            context.dynamic,
            info,
            context.representation.originalId,
            context.bandwidth,
            context.representation.getBaseUris,
            context.urlParams,
            periodStart,
            periodEnd,
            initSegmentReference,
            aesKey,
            context.representation.segmentSequenceCadence,
            timelineToUse,
        );
      } else {
        const tsi = /** @type {!TimelineSegmentIndex} */(segmentIndex);
        tsi.appendTemplateInfo(
            info, periodStart, periodEnd, initSegmentReference,
            context.dynamic);

        const availabilityStart =
          context.presentationTimeline.getSegmentAvailabilityStart();
        tsi.evict(availabilityStart);
      }

      if (info.timeline &&
          context.adaptationSet.contentType !== 'image' &&
          context.adaptationSet.contentType !== 'text') {
        const tsi = /** @type {!TimelineSegmentIndex} */(segmentIndex);
        // getTimeline is the info.timeline but fitted to the period.
        const timeline = tsi.getTimeline();
        context.presentationTimeline.notifyTimeRange(
            timeline,
            periodStart);
      }

      if (stream && context.dynamic) {
        stream.segmentIndex = segmentIndex;
      }


      const timeline = info.timeline;
      const lastItem = timeline && timeline[timeline.length-1];
      const endTime = lastItem ?
          lastItem.end + info.scaledPresentationTimeOffset :
          -1;
      let continuityTimeline = -1;

      if (segmentIndex instanceof shaka.dash.TimelineSegmentIndex) {
        continuityTimeline = segmentIndex.continuityTimeline();
      }

      return {
        endTime,
        timeline: continuityTimeline,
        generateSegmentIndex: () => {
          // If segmentIndex is deleted, or segmentIndex's references are
          // released by closeSegmentIndex(), we should set the value of
          // segmentIndex again.
          if (segmentIndex instanceof shaka.dash.TimelineSegmentIndex &&
              segmentIndex.isEmpty()) {
            segmentIndex.appendTemplateInfo(info, periodStart,
                periodEnd, initSegmentReference, context.dynamic);
          }
          return Promise.resolve(segmentIndex);
        },
        timescale: info.timescale,
      };
    }
  }

  /**
   * Ingests Patch MPD segments into timeline.
   *
   * @param {!shaka.dash.DashParser.Context} context
   * @param {shaka.extern.xml.Node} patchNode
   */
  static modifyTimepoints(context, patchNode) {
    const MpdUtils = shaka.dash.MpdUtils;
    const SegmentTemplate = shaka.dash.SegmentTemplate;
    const TXml = shaka.util.TXml;

    const timelineNode = MpdUtils.inheritChild(context,
        SegmentTemplate.fromInheritance_, 'SegmentTimeline');
    goog.asserts.assert(timelineNode, 'timeline node not found');
    const timepoints = TXml.findChildren(timelineNode, 'S');

    goog.asserts.assert(timepoints, 'timepoints should exist');
    TXml.modifyNodes(timepoints, patchNode);
    timelineNode.children = timepoints;
  }

  /**
   * Removes all segments from timeline.
   *
   * @param {!shaka.dash.DashParser.Context} context
   */
  static removeTimepoints(context) {
    const MpdUtils = shaka.dash.MpdUtils;
    const SegmentTemplate = shaka.dash.SegmentTemplate;

    const timelineNode = MpdUtils.inheritChild(context,
        SegmentTemplate.fromInheritance_, 'SegmentTimeline');
    goog.asserts.assert(timelineNode, 'timeline node not found');
    timelineNode.children = [];
  }

  /**
   * @param {?shaka.dash.DashParser.InheritanceFrame} frame
   * @return {?shaka.extern.xml.Node}
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
    const StringUtils = shaka.util.StringUtils;
    const segmentInfo =
        MpdUtils.parseSegmentInfo(context, SegmentTemplate.fromInheritance_);

    const media = MpdUtils.inheritAttribute(
        context, SegmentTemplate.fromInheritance_, 'media');

    const index = MpdUtils.inheritAttribute(
        context, SegmentTemplate.fromInheritance_, 'index');

    const k = MpdUtils.inheritAttribute(
        context, SegmentTemplate.fromInheritance_, 'k');

    let numChunks = 0;
    if (k) {
      numChunks = parseInt(k, 10);
    }

    return {
      unscaledSegmentDuration: segmentInfo.unscaledSegmentDuration,
      segmentDuration: segmentInfo.segmentDuration,
      timescale: segmentInfo.timescale,
      startNumber: segmentInfo.startNumber,
      scaledPresentationTimeOffset: segmentInfo.scaledPresentationTimeOffset,
      unscaledPresentationTimeOffset:
          segmentInfo.unscaledPresentationTimeOffset,
      timeline: segmentInfo.timeline,
      mediaTemplate: media && StringUtils.htmlUnescape(media),
      indexTemplate: index,
      mimeType: context.representation.mimeType,
      codecs: context.representation.codecs,
      bandwidth: context.bandwidth,
      numChunks: numChunks,
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
          'SegmentTemplate contains multiple segment information sources:',
          'the SegmentTemplate should only contain an index URL template,',
          'a SegmentTimeline or a segment duration.',
          context.representation);
      if (info.indexTemplate) {
        shaka.log.info('Using the index URL template by default.');
        info.timeline = null;
        info.unscaledSegmentDuration = null;
        info.segmentDuration = null;
      } else {
        goog.asserts.assert(info.timeline, 'There should be a timeline');
        shaka.log.info('Using the SegmentTimeline by default.');
        info.unscaledSegmentDuration = null;
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
   * @return {!Promise<shaka.media.SegmentIndex>}
   * @private
   */
  static generateSegmentIndexFromIndexTemplate_(
      context, requestSegment, init, info) {
    const MpdUtils = shaka.dash.MpdUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    goog.asserts.assert(info.indexTemplate, 'must be using index template');
    const filledTemplate = MpdUtils.fillUriTemplate(
        info.indexTemplate, context.representation.originalId,
        null, null, context.bandwidth || null, null);

    const resolvedUris = ManifestParserUtils.resolveUris(
        context.representation.getBaseUris(), [filledTemplate]);

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
   * @param {!Map<string, number>} periodDurationMap
   * @param {shaka.extern.aesKey|undefined} aesKey
   * @param {?number} lastSegmentNumber
   * @param {number} segmentSequenceCadence
   * @return {!Promise<shaka.media.SegmentIndex>}
   * @private
   */
  static generateSegmentIndexFromDuration_(
      context, info, segmentLimit, initSegmentReference, periodDurationMap,
      aesKey, lastSegmentNumber, segmentSequenceCadence) {
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
        (periodId != null && periodDurationMap.get(periodId)) ||
        initialPeriodDuration;
      const periodEnd = periodDuration ?
        (periodStart + periodDuration) : Infinity;
      return periodEnd;
    };

    const segmentDuration = info.segmentDuration;
    goog.asserts.assert(
        segmentDuration != null, 'Segment duration must not be null!');

    const startNumber = info.startNumber;

    const template = info.mediaTemplate;
    const bandwidth = context.bandwidth || null;
    const id = context.representation.originalId;
    const getBaseUris = context.representation.getBaseUris;
    const urlParams = context.urlParams;

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

      // For Low Latency we can request the partial current position.
      if (context.representation.availabilityTimeOffset) {
        availablePeriodPositions[1]++;
      }

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
    const maxPosition = lastSegmentNumber || range[1];

    const references = [];
    const createReference = (position) => {
      // These inner variables are all scoped to the inner loop, and can be used
      // safely in the callback below.

      goog.asserts.assert(segmentDuration != null,
          'Segment duration must not be null!');

      // Relative to the period start.
      const positionWithinPeriod = position - startNumber;
      const segmentPeriodTime = positionWithinPeriod * segmentDuration;

      const unscaledSegmentDuration = info.unscaledSegmentDuration;
      goog.asserts.assert(unscaledSegmentDuration != null,
          'Segment duration must not be null!');

      // The original media timestamp from the timeline is what is expected in
      // the $Time$ template.  (Or based on duration, in this case.)  It should
      // not be adjusted with presentationTimeOffset or the Period start.
      let timeReplacement = positionWithinPeriod * unscaledSegmentDuration;
      if ('BigInt' in window && timeReplacement > Number.MAX_SAFE_INTEGER) {
        timeReplacement =
            BigInt(positionWithinPeriod) * BigInt(unscaledSegmentDuration);
      }

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

      const partialSegmentRefs = [];

      const numChunks = info.numChunks;
      if (numChunks) {
        const partialDuration = (segmentEnd - segmentStart) / numChunks;

        for (let i = 0; i < numChunks; i++) {
          const start = segmentStart + partialDuration * i;
          const end = start + partialDuration;
          const subNumber = i;
          const getPartialUris = () => {
            const mediaUri = MpdUtils.fillUriTemplate(
                template, id, position, subNumber, bandwidth, timeReplacement);
            return ManifestParserUtils.resolveUris(
                getBaseUris(), [mediaUri], urlParams());
          };
          const partial = new shaka.media.SegmentReference(
              start,
              end,
              getPartialUris,
              /* startByte= */ 0,
              /* endByte= */ null,
              initSegmentReference,
              timestampOffset,
              /* appendWindowStart= */ periodStart,
              /* appendWindowEnd= */ getPeriodEnd(),
              /* partialReferences= */ [],
              /* tilesLayout= */ '',
              /* tileDuration= */ null,
              /* syncTime= */ null,
              shaka.media.SegmentReference.Status.AVAILABLE,
              aesKey);
          partial.codecs = context.representation.codecs;
          partial.mimeType = context.representation.mimeType;
          if (segmentSequenceCadence == 0) {
            if (i > 0) {
              partial.markAsNonIndependent();
            }
          } else if ((i % segmentSequenceCadence) != 0) {
            partial.markAsNonIndependent();
          }
          partialSegmentRefs.push(partial);
        }
      }

      const getUris = () => {
        if (numChunks) {
          return [];
        }
        const mediaUri = MpdUtils.fillUriTemplate(
            template, id, position, /* subNumber= */ null, bandwidth,
            timeReplacement);
        return ManifestParserUtils.resolveUris(
            getBaseUris(), [mediaUri], urlParams());
      };

      const ref = new shaka.media.SegmentReference(
          segmentStart,
          segmentEnd,
          getUris,
          /* startByte= */ 0,
          /* endByte= */ null,
          initSegmentReference,
          timestampOffset,
          /* appendWindowStart= */ periodStart,
          /* appendWindowEnd= */ getPeriodEnd(),
          partialSegmentRefs,
          /* tilesLayout= */ '',
          /* tileDuration= */ null,
          /* syncTime= */ null,
          shaka.media.SegmentReference.Status.AVAILABLE,
          aesKey,
          partialSegmentRefs.length > 0);
      ref.codecs = context.representation.codecs;
      ref.mimeType = context.representation.mimeType;
      ref.bandwidth = context.bandwidth;
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
      let updateTime = segmentDuration;
      // For low latency we need to evict very frequently.
      if (context.representation.availabilityTimeOffset) {
        updateTime = 0.1;
      }
      segmentIndex.updateEvery(updateTime, () => {
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
   * Creates an init segment reference from a context object.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.extern.aesKey|undefined} aesKey
   * @return {shaka.media.InitSegmentReference}
   * @private
   */
  static createInitSegment_(context, aesKey) {
    const MpdUtils = shaka.dash.MpdUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const SegmentTemplate = shaka.dash.SegmentTemplate;

    let initialization = context.representation.initialization;
    if (!initialization) {
      initialization = MpdUtils.inheritAttribute(
          context, SegmentTemplate.fromInheritance_, 'initialization');
    }
    if (!initialization) {
      return null;
    }
    initialization = shaka.util.StringUtils.htmlUnescape(initialization);

    const repId = context.representation.originalId;
    const bandwidth = context.bandwidth || null;
    const getBaseUris = context.representation.getBaseUris;
    const urlParams = context.urlParams;
    const getUris = () => {
      goog.asserts.assert(initialization, 'Should have returned earlier');
      const filledTemplate = MpdUtils.fillUriTemplate(
          initialization, repId, null, null, bandwidth, null);
      const resolvedUris = ManifestParserUtils.resolveUris(
          getBaseUris(), [filledTemplate], urlParams());
      return resolvedUris;
    };
    const qualityInfo = shaka.dash.SegmentBase.createQualityInfo(context);
    const encrypted = context.adaptationSet.encrypted;
    const ref = new shaka.media.InitSegmentReference(
        getUris,
        /* startByte= */ 0,
        /* endByte= */ null,
        qualityInfo,
        /* timescale= */ null,
        /* segmentData= */ null,
        aesKey,
        encrypted);
    ref.codecs = context.representation.codecs;
    ref.mimeType = context.representation.mimeType;
    if (context.periodInfo && !context.periodInfo.isLastPeriod) {
      ref.boundaryEnd = context.periodInfo.start + context.periodInfo.duration;
    }
    return ref;
  }
};


/**
 * A SegmentIndex that returns segments references on demand from
 * a segment timeline.
 *
 * @extends {shaka.media.SegmentIndex}
 * @implements {shaka.util.IReleasable}
 * @implements {Iterable<?shaka.media.SegmentReference>}
 *
 * @private
 *
 */
shaka.dash.TimelineSegmentIndex = class extends shaka.media.SegmentIndex {
  /**
   * @param {boolean} dynamic
   * @param {!shaka.dash.SegmentTemplate.SegmentTemplateInfo} templateInfo
   * @param {?string} representationId
   * @param {number} bandwidth
   * @param {function(): Array<string>} getBaseUris
   * @param {function():string} urlParams
   * @param {number} periodStart
   * @param {number} periodEnd
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @param {shaka.extern.aesKey|undefined} aesKey
   * @param {number} segmentSequenceCadence
   * @param {number} timeline
   */
  constructor(dynamic, templateInfo, representationId, bandwidth, getBaseUris,
      urlParams, periodStart, periodEnd, initSegmentReference,
      aesKey, segmentSequenceCadence, timeline) {
    super([]);

    /** @private {boolean} */
    this.dynamic_ = dynamic;

    /** @private {?shaka.dash.SegmentTemplate.SegmentTemplateInfo} */
    this.templateInfo_ = templateInfo;

    /** @private {?string} */
    this.representationId_ = representationId;

    /** @private {number} */
    this.bandwidth_ = bandwidth;

    /** @private {function(): Array<string>} */
    this.getBaseUris_ = getBaseUris;

    /** @private {function():string} */
    this.urlParams_ = urlParams;

    /** @private {number} */
    this.periodStart_ = periodStart;

    /** @private {number} */
    this.periodEnd_ = periodEnd;

    /** @private {shaka.media.InitSegmentReference} */
    this.initSegmentReference_ = initSegmentReference;

    /** @private {shaka.extern.aesKey|undefined} */
    this.aesKey_ = aesKey;

    /** @private {number} */
    this.segmentSequenceCadence_ = segmentSequenceCadence;
    /** @private {number} */
    this.timeline_ = timeline;

    this.fitTimeline();
  }

  /**
   * @override
   */
  getNumReferences() {
    if (this.templateInfo_) {
      return this.templateInfo_.timeline.length;
    } else {
      return 0;
    }
  }

  /**
   * @override
   */
  release() {
    super.release();
    this.templateInfo_ = null;
    // We cannot release other fields, as segment index can
    // be recreated using only template info.
  }


  /**
   * @override
   */
  evict(time) {
    if (!this.templateInfo_) {
      return;
    }
    shaka.log.debug(`${this.representationId_} Evicting at ${time}`);
    let numToEvict = 0;
    const timeline = this.templateInfo_.timeline;

    for (let i = 0; i < timeline.length; i += 1) {
      const range = timeline[i];
      const end = range.end + this.periodStart_;
      const start = range.start + this.periodStart_;

      if (end <= time) {
        shaka.log.debug(`Evicting ${start} - ${end}`);
        numToEvict += 1;
      } else {
        break;
      }
    }

    if (numToEvict > 0) {
      this.templateInfo_.timeline = timeline.slice(numToEvict);
      if (this.references.length >= numToEvict) {
        this.references = this.references.slice(numToEvict);
      }

      this.numEvicted_ += numToEvict;

      if (this.getNumReferences() === 0) {
        this.release();
      }
    }
  }

  /**
   * Merge new template info
   * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
   * @param {number} periodStart
   * @param {number} periodEnd
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @param {boolean} dynamic
   */
  appendTemplateInfo(info, periodStart, periodEnd, initSegmentReference,
      dynamic) {
    this.updateInitSegmentReference(initSegmentReference);
    this.dynamic_ = dynamic;
    if (!this.templateInfo_) {
      this.templateInfo_ = info;
      this.periodStart_ = periodStart;
      this.periodEnd_ = periodEnd;
    } else {
      if (this.templateInfo_.unscaledPresentationTimeOffset !==
          info.unscaledPresentationTimeOffset) {
        this.templateInfo_.timeline = info.timeline;
        this.templateInfo_.unscaledPresentationTimeOffset =
          info.unscaledPresentationTimeOffset;
        this.templateInfo_.scaledPresentationTimeOffset =
          info.scaledPresentationTimeOffset;
      }

      if (this.templateInfo_.mediaTemplate !== info.mediaTemplate) {
        this.templateInfo_.mediaTemplate = info.mediaTemplate;
      }

      const currentTimeline = this.templateInfo_.timeline;

      // Append timeline
      let newEntries;
      if (currentTimeline.length) {
        const lastCurrentEntry = currentTimeline[currentTimeline.length - 1];
        newEntries = info.timeline.filter((entry) => {
          return entry.end > lastCurrentEntry.end;
        });
      } else {
        newEntries = info.timeline.slice();
      }

      if (newEntries.length > 0) {
        shaka.log.debug(`Appending ${newEntries.length} entries`);
        this.templateInfo_.timeline.push(...newEntries);
      }

      if (this.periodEnd_ !== periodEnd) {
        this.periodEnd_ = periodEnd;
      }
    }

    this.fitTimeline();
  }

  /**
   * Updates the init segment reference and propagates the update to all
   * references.
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   */
  updateInitSegmentReference(initSegmentReference) {
    if (this.initSegmentReference_ === initSegmentReference) {
      return;
    }

    this.initSegmentReference_ = initSegmentReference;
    for (const reference of this.references) {
      if (reference) {
        reference.updateInitSegmentReference(initSegmentReference);
      }
    }
  }

  /**
   *
   * @param {number} time
   */
  isBeforeFirstEntry(time) {
    const hasTimeline = this.templateInfo_ &&
      this.templateInfo_.timeline && this.templateInfo_.timeline.length;

    if (hasTimeline) {
      const timeline = this.templateInfo_.timeline;
      return time < timeline[0].start + this.periodStart_;
    } else {
      return false;
    }
  }

  /**
   * Fit timeline entries to period boundaries
   */
  fitTimeline() {
    if (!this.templateInfo_ || this.getIsImmutable()) {
      return;
    }
    const timeline = this.templateInfo_.timeline;
    goog.asserts.assert(timeline, 'Timeline should be non-null!');
    const newTimeline = [];
    for (const range of timeline) {
      if (range.start >= this.periodEnd_) {
        // Starts after end of period.
      } else if (range.end <= 0) {
        // Ends before start of period.
      } else {
        // Usable.
        newTimeline.push(range);
      }
    }
    this.templateInfo_.timeline = newTimeline;

    this.evict(this.periodStart_);

    // Do NOT adjust last range to match period end! With high precision
    // timestamps several recalculations may give wrong results on less precise
    // platforms. To mitigate that, we're using cached |periodEnd_| value in
    // find/get() methods whenever possible.
  }

  /**
   * Get the current timeline
   * @return {!Array<shaka.media.PresentationTimeline.TimeRange>}
   */
  getTimeline() {
    if (!this.templateInfo_) {
      return [];
    }
    const timeline = this.templateInfo_.timeline;
    goog.asserts.assert(timeline, 'Timeline should be non-null!');
    return timeline;
  }

  /**
   * @override
   */
  find(time) {
    shaka.log.debug(`Find ${time}`);

    if (this.isBeforeFirstEntry(time)) {
      return this.numEvicted_;
    }

    if (!this.templateInfo_) {
      return null;
    }

    const timeline = this.templateInfo_.timeline;

    // Early exit if the time isn't within this period
    if (time < this.periodStart_ || time >= this.periodEnd_) {
      return null;
    }

    const lastIndex = timeline.length - 1;

    for (let i = 0; i < timeline.length; i++) {
      const range = timeline[i];
      const start = range.start + this.periodStart_;
      // A rounding error can cause /time/ to equal e.endTime or fall in between
      // the references by a fraction of a second. To account for this, we use
      // the start of the next segment as /end/, unless this is the last
      // reference, in which case we use the period end as the /end/
      let end;

      if (i < lastIndex) {
        end = timeline[i + 1].start + this.periodStart_;
      } else if (this.periodEnd_ === Infinity) {
        end = range.end + this.periodStart_;
      } else {
        end = this.periodEnd_;
      }

      if ((time >= start) && (time < end)) {
        return i + this.numEvicted_;
      }
    }

    return null;
  }

  /**
   * @override
   */
  get(position) {
    const correctedPosition = position - this.numEvicted_;
    if (correctedPosition < 0 ||
        correctedPosition >= this.getNumReferences() || !this.templateInfo_) {
      return null;
    }

    let ref = this.references[correctedPosition];

    if (!ref) {
      const range = this.templateInfo_.timeline[correctedPosition];
      const segmentReplacement = range.segmentPosition;

      // The original media timestamp from the timeline is what is expected in
      // the $Time$ template.  It should not be adjusted with
      // presentationTimeOffset or the Period start, but
      // unscaledPresentationTimeOffset was already subtracted from the times
      // in timeline.
      const timeReplacement = range.unscaledStart +
          this.templateInfo_.unscaledPresentationTimeOffset;

      const timestampOffset = this.periodStart_ -
        this.templateInfo_.scaledPresentationTimeOffset;
      const trueSegmentEnd = this.periodStart_ + range.end;
      let segmentEnd = trueSegmentEnd;
      if (correctedPosition === this.getNumReferences() - 1 &&
          this.periodEnd_ !== Infinity) {
        // See https://github.com/shaka-project/shaka-player/issues/8672
        if (this.dynamic_ && Math.abs(segmentEnd - this.periodEnd_) > 0.1) {
          segmentEnd = Math.min(segmentEnd, this.periodEnd_);
        } else {
          segmentEnd = this.periodEnd_;
        }
      }
      const codecs = this.templateInfo_.codecs;
      const mimeType = this.templateInfo_.mimeType;
      const bandwidth = this.templateInfo_.bandwidth;

      const partialSegmentRefs = [];

      let hasSubNumber = false;
      if (range.partialSegments &&
          this.templateInfo_ && this.templateInfo_.mediaTemplate) {
        hasSubNumber = this.templateInfo_.mediaTemplate.includes('$SubNumber$');
      }
      if (hasSubNumber) {
        const partialDuration =
            (range.end - range.start) / range.partialSegments;

        for (let i = 0; i < range.partialSegments; i++) {
          const start = range.start + partialDuration * i;
          const end = start + partialDuration;
          const subNumber = i;
          let uris = null;
          const getPartialUris = () => {
            if (!this.templateInfo_) {
              return [];
            }
            if (uris == null) {
              uris = shaka.dash.TimelineSegmentIndex.createUris_(
                  this.templateInfo_.mediaTemplate,
                  this.representationId_,
                  segmentReplacement,
                  this.bandwidth_,
                  timeReplacement,
                  subNumber,
                  this.getBaseUris_,
                  this.urlParams_);
            }
            return uris;
          };
          const partial = new shaka.media.SegmentReference(
              this.periodStart_ + start,
              this.periodStart_ + end,
              getPartialUris,
              /* startByte= */ 0,
              /* endByte= */ null,
              this.initSegmentReference_,
              timestampOffset,
              this.periodStart_,
              this.periodEnd_,
              /* partialReferences= */ [],
              /* tilesLayout= */ '',
              /* tileDuration= */ null,
              /* syncTime= */ null,
              shaka.media.SegmentReference.Status.AVAILABLE,
              this.aesKey_);
          partial.codecs = codecs;
          partial.mimeType = mimeType;
          partial.bandwidth = bandwidth;
          if (this.segmentSequenceCadence_ == 0) {
            if (i > 0) {
              partial.markAsNonIndependent();
            }
          } else if ((i % this.segmentSequenceCadence_) != 0) {
            partial.markAsNonIndependent();
          }
          partialSegmentRefs.push(partial);
        }
      }

      const createUrisCb = () => {
        if (partialSegmentRefs.length > 0 || !this.templateInfo_) {
          return [];
        }
        return shaka.dash.TimelineSegmentIndex
            .createUris_(
                this.templateInfo_.mediaTemplate,
                this.representationId_,
                segmentReplacement,
                this.bandwidth_,
                timeReplacement,
                /* subNumber= */ null,
                this.getBaseUris_,
                this.urlParams_,
            );
      };

      ref = new shaka.media.SegmentReference(
          this.periodStart_ + range.start,
          segmentEnd,
          createUrisCb,
          /* startByte= */ 0,
          /* endByte= */ null,
          this.initSegmentReference_,
          timestampOffset,
          this.periodStart_,
          this.periodEnd_,
          partialSegmentRefs,
          /* tilesLayout= */ '',
          /* tileDuration= */ null,
          /* syncTime= */ null,
          shaka.media.SegmentReference.Status.AVAILABLE,
          this.aesKey_,
          /* allPartialSegments= */ partialSegmentRefs.length > 0);
      ref.codecs = codecs;
      ref.mimeType = mimeType;
      ref.trueEndTime = trueSegmentEnd;
      ref.bandwidth = bandwidth;
      this.references[correctedPosition] = ref;
    }

    return ref;
  }

  /**
   * @override
   */
  forEachTopLevelReference(fn) {
    this.fitTimeline();
    for (let i = 0; i < this.getNumReferences(); i++) {
      const reference = this.get(i + this.numEvicted_);
      if (reference) {
        fn(reference);
      }
    }
  }

  /**
   * Fill in a specific template with values to get the segment uris
   *
   * @return {!Array<string>}
   * @private
   */
  static createUris_(mediaTemplate, repId, segmentReplacement,
      bandwidth, timeReplacement, subNumber, getBaseUris, urlParams) {
    const mediaUri = shaka.dash.MpdUtils.fillUriTemplate(
        mediaTemplate, repId,
        segmentReplacement, subNumber, bandwidth || null, timeReplacement);
    return shaka.util.ManifestParserUtils
        .resolveUris(getBaseUris(), [mediaUri], urlParams())
        .map((g) => {
          return g.toString();
        });
  }

  /**
   * Return the continuity timeline associated with the current
   * TimelineSegmentIndex.
   * In the context of a multiperiod dash stream, the continuous periods as
   * outlined in the IOP will return the same timeline value.
   *
   * @override
   */
  continuityTimeline() {
    return this.timeline_;
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
 *   mediaTemplate: ?string,
 *   indexTemplate: ?string,
 *   mimeType: string,
 *   codecs: string,
 *   bandwidth: number,
 *   numChunks: number,
 * }}
 *
 * @description
 * Contains information about a SegmentTemplate.
 *
 * @property {number} timescale
 *   The time-scale of the representation.
 * @property {?number} unscaledSegmentDuration
 *   The duration of the segments in seconds, in timescale units.
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
 * @property {?string} mediaTemplate
 *   The media URI template, if given.
 * @property {?string} indexTemplate
 *   The index URI template, if given.
 * @property {string} mimeType
 *   The mimeType.
 * @property {string} codecs
 *   The codecs.
 * @property {number} bandwidth
 *   The bandwidth.
 * @property {number} numChunks
 *   The number of chunks in each segment.
 */
shaka.dash.SegmentTemplate.SegmentTemplateInfo;
