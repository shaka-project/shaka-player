/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.dash.SegmentBase');

goog.require('goog.asserts');
goog.require('shaka.dash.MpdUtils');
goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.Mp4SegmentIndexParser');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.WebmSegmentIndexParser');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.ObjectUtils');
goog.require('shaka.util.XmlUtils');
goog.requireType('shaka.dash.DashParser');
goog.requireType('shaka.media.PresentationTimeline');
goog.requireType('shaka.media.SegmentReference');


/**
 * @summary A set of functions for parsing SegmentBase elements.
 */
shaka.dash.SegmentBase = class {
  /**
   * Creates an init segment reference from a Context object.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {function(?shaka.dash.DashParser.InheritanceFrame):Element} callback
   * @return {shaka.media.InitSegmentReference}
   */
  static createInitSegment(context, callback) {
    const MpdUtils = shaka.dash.MpdUtils;
    const XmlUtils = shaka.util.XmlUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    const initialization =
        MpdUtils.inheritChild(context, callback, 'Initialization');
    if (!initialization) {
      return null;
    }

    let resolvedUris = context.representation.baseUris;
    const uri = initialization.getAttribute('sourceURL');
    if (uri) {
      resolvedUris = ManifestParserUtils.resolveUris(
          context.representation.baseUris, [uri]);
    }

    let startByte = 0;
    let endByte = null;
    const range =
        XmlUtils.parseAttr(initialization, 'range', XmlUtils.parseRange);
    if (range) {
      startByte = range.start;
      endByte = range.end;
    }

    const getUris = () => resolvedUris;
    return new shaka.media.InitSegmentReference(getUris, startByte, endByte);
  }

  /**
   * Creates a new StreamInfo object.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.DashParser.RequestInitSegmentCallback}
   *     requestInitSegment
   * @return {shaka.dash.DashParser.StreamInfo}
   */
  static createStreamInfo(context, requestInitSegment) {
    goog.asserts.assert(context.representation.segmentBase,
        'Should only be called with SegmentBase');
    // Since SegmentBase does not need updates, simply treat any call as
    // the initial parse.
    const MpdUtils = shaka.dash.MpdUtils;
    const SegmentBase = shaka.dash.SegmentBase;
    const XmlUtils = shaka.util.XmlUtils;

    const unscaledPresentationTimeOffset = Number(MpdUtils.inheritAttribute(
        context, SegmentBase.fromInheritance_, 'presentationTimeOffset')) || 0;

    const timescaleStr = MpdUtils.inheritAttribute(
        context, SegmentBase.fromInheritance_, 'timescale');
    let timescale = 1;
    if (timescaleStr) {
      timescale = XmlUtils.parsePositiveInt(timescaleStr) || 1;
    }

    const scaledPresentationTimeOffset =
        (unscaledPresentationTimeOffset / timescale) || 0;

    const initSegmentReference =
        SegmentBase.createInitSegment(context, SegmentBase.fromInheritance_);

    // Throws an immediate error if the format is unsupported.
    SegmentBase.checkSegmentIndexRangeSupport_(context, initSegmentReference);

    // Direct fields of context will be reassigned by the parser before
    // generateSegmentIndex is called.  So we must make a shallow copy first,
    // and use that in the generateSegmentIndex callbacks.
    const shallowCopyOfContext =
        shaka.util.ObjectUtils.shallowCloneObject(context);

    return {
      generateSegmentIndex: () => {
        return SegmentBase.generateSegmentIndex_(
            shallowCopyOfContext, requestInitSegment, initSegmentReference,
            scaledPresentationTimeOffset);
      },
    };
  }

  /**
   * Creates a SegmentIndex for the given URIs and context.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.DashParser.RequestInitSegmentCallback}
   *     requestInitSegment
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @param {!Array.<string>} uris
   * @param {number} startByte
   * @param {?number} endByte
   * @param {number} scaledPresentationTimeOffset
   * @return {!Promise.<shaka.media.SegmentIndex>}
   */
  static async generateSegmentIndexFromUris(
      context, requestInitSegment, initSegmentReference, uris, startByte,
      endByte, scaledPresentationTimeOffset) {
    // Unpack context right away, before we start an async process.
    // This immunizes us against changes to the context object later.
    /** @type {shaka.media.PresentationTimeline} */
    const presentationTimeline = context.presentationTimeline;
    const fitLast = !context.dynamic || !context.periodInfo.isLastPeriod;
    const periodStart = context.periodInfo.start;
    const periodDuration = context.periodInfo.duration;
    const containerType = context.representation.mimeType.split('/')[1];

    // Create a local variable to bind to so we can set to null to help the GC.
    let localRequest = requestInitSegment;
    let segmentIndex = null;

    const responses = [
      localRequest(uris, startByte, endByte),
      containerType == 'webm' ?
          localRequest(
              initSegmentReference.getUris(),
              initSegmentReference.startByte,
              initSegmentReference.endByte) :
          null,
    ];

    localRequest = null;
    const results = await Promise.all(responses);
    const indexData = results[0];
    const initData = results[1] || null;
    /** @type {Array.<!shaka.media.SegmentReference>} */
    let references = null;

    const timestampOffset = periodStart - scaledPresentationTimeOffset;
    const appendWindowStart = periodStart;
    const appendWindowEnd = periodDuration ?
        periodStart + periodDuration : Infinity;

    if (containerType == 'mp4') {
      references = shaka.media.Mp4SegmentIndexParser.parse(
          indexData, startByte, uris, initSegmentReference, timestampOffset,
          appendWindowStart, appendWindowEnd);
    } else {
      goog.asserts.assert(initData, 'WebM requires init data');
      references = shaka.media.WebmSegmentIndexParser.parse(
          indexData, initData, uris, initSegmentReference, timestampOffset,
          appendWindowStart, appendWindowEnd);
    }

    presentationTimeline.notifySegments(references);

    // Since containers are never updated, we don't need to store the
    // segmentIndex in the map.
    goog.asserts.assert(!segmentIndex,
        'Should not call generateSegmentIndex twice');

    segmentIndex = new shaka.media.SegmentIndex(references);
    if (fitLast) {
      segmentIndex.fit(appendWindowStart, appendWindowEnd, /* isNew= */ true);
    }
    return segmentIndex;
  }

  /**
   * @param {?shaka.dash.DashParser.InheritanceFrame} frame
   * @return {Element}
   * @private
   */
  static fromInheritance_(frame) {
    return frame.segmentBase;
  }

  /**
   * Compute the byte range of the segment index from the container.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @return {?{start: number, end: number}}
   * @private
   */
  static computeIndexRange_(context) {
    const MpdUtils = shaka.dash.MpdUtils;
    const SegmentBase = shaka.dash.SegmentBase;
    const XmlUtils = shaka.util.XmlUtils;

    const representationIndex = MpdUtils.inheritChild(
        context, SegmentBase.fromInheritance_, 'RepresentationIndex');
    const indexRangeElem = MpdUtils.inheritAttribute(
        context, SegmentBase.fromInheritance_, 'indexRange');

    let indexRange = XmlUtils.parseRange(indexRangeElem || '');
    if (representationIndex) {
      indexRange = XmlUtils.parseAttr(
          representationIndex, 'range', XmlUtils.parseRange, indexRange);
    }
    return indexRange;
  }

  /**
   * Compute the URIs of the segment index from the container.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @return {!Array.<string>}
   * @private
   */
  static computeIndexUris_(context) {
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const MpdUtils = shaka.dash.MpdUtils;
    const SegmentBase = shaka.dash.SegmentBase;

    const representationIndex = MpdUtils.inheritChild(
        context, SegmentBase.fromInheritance_, 'RepresentationIndex');

    let indexUris = context.representation.baseUris;
    if (representationIndex) {
      const representationUri = representationIndex.getAttribute('sourceURL');
      if (representationUri) {
        indexUris = ManifestParserUtils.resolveUris(
            context.representation.baseUris, [representationUri]);
      }
    }

    return indexUris;
  }

  /**
   * Check if this type of segment index is supported.  This allows for
   * immediate errors during parsing, as opposed to an async error from
   * createSegmentIndex().
   *
   * Also checks for a valid byte range, which is not required for callers from
   * SegmentTemplate.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @private
   */
  static checkSegmentIndexRangeSupport_(context, initSegmentReference) {
    const SegmentBase = shaka.dash.SegmentBase;

    SegmentBase.checkSegmentIndexSupport(context, initSegmentReference);

    const indexRange = SegmentBase.computeIndexRange_(context);
    if (!indexRange) {
      shaka.log.error(
          'SegmentBase does not contain sufficient segment information:',
          'the SegmentBase does not contain @indexRange',
          'or a RepresentationIndex element.',
          context.representation);
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
    }
  }

  /**
   * Check if this type of segment index is supported.  This allows for
   * immediate errors during parsing, as opposed to an async error from
   * createSegmentIndex().
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   */
  static checkSegmentIndexSupport(context, initSegmentReference) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const contentType = context.representation.contentType;
    const containerType = context.representation.mimeType.split('/')[1];

    if (contentType != ContentType.TEXT && containerType != 'mp4' &&
        containerType != 'webm') {
      shaka.log.error(
          'SegmentBase specifies an unsupported container type.',
          context.representation);
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_UNSUPPORTED_CONTAINER);
    }

    if ((containerType == 'webm') && !initSegmentReference) {
      shaka.log.error(
          'SegmentBase does not contain sufficient segment information:',
          'the SegmentBase uses a WebM container,',
          'but does not contain an Initialization element.',
          context.representation);
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_WEBM_MISSING_INIT);
    }
  }

  /**
   * Generate a SegmentIndex from a Context object.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.DashParser.RequestInitSegmentCallback}
   *     requestInitSegment
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @param {number} scaledPresentationTimeOffset
   * @return {!Promise.<shaka.media.SegmentIndex>}
   * @private
   */
  static generateSegmentIndex_(
      context, requestInitSegment, initSegmentReference,
      scaledPresentationTimeOffset) {
    const SegmentBase = shaka.dash.SegmentBase;

    const indexUris = SegmentBase.computeIndexUris_(context);
    const indexRange = SegmentBase.computeIndexRange_(context);
    goog.asserts.assert(indexRange, 'Index range should not be null!');

    return shaka.dash.SegmentBase.generateSegmentIndexFromUris(
        context, requestInitSegment, initSegmentReference, indexUris,
        indexRange.start, indexRange.end,
        scaledPresentationTimeOffset);
  }
};
