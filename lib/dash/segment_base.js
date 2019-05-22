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
goog.require('shaka.util.XmlUtils');


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
   * Creates a new Stream object.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.DashParser.RequestInitSegmentCallback}
   *     requestInitSegment
   * @throws shaka.util.Error When there is a parsing error.
   * @return {shaka.dash.DashParser.StreamInfo}
   */
  static createStream(context, requestInitSegment) {
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

    const init =
        SegmentBase.createInitSegment(context, SegmentBase.fromInheritance_);
    const index = SegmentBase.createSegmentIndex_(
        context, requestInitSegment, init, scaledPresentationTimeOffset);

    return {
      createSegmentIndex: index.createSegmentIndex,
      findSegmentPosition: index.findSegmentPosition,
      getSegmentReference: index.getSegmentReference,
      initSegmentReference: init,
      scaledPresentationTimeOffset: scaledPresentationTimeOffset,
    };
  }

  /**
   * Creates segment index info for the given info.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.DashParser.RequestInitSegmentCallback}
   *     requestInitSegment
   * @param {shaka.media.InitSegmentReference} init
   * @param {!Array.<string>} uris
   * @param {number} startByte
   * @param {?number} endByte
   * @param {string} containerType
   * @param {number} scaledPresentationTimeOffset
   * @return {shaka.dash.DashParser.SegmentIndexFunctions}
   */
  static createSegmentIndexFromUris(
      context, requestInitSegment, init, uris, startByte, endByte,
      containerType, scaledPresentationTimeOffset) {
    const presentationTimeline = context.presentationTimeline;
    const fitLast = !context.dynamic || !context.periodInfo.isLastPeriod;
    const periodStart = context.periodInfo.start;
    const periodDuration = context.periodInfo.duration;

    // Create a local variable to bind to so we can set to null to help the GC.
    let localRequest = requestInitSegment;
    let segmentIndex = null;
    /** @type {!shaka.extern.CreateSegmentIndexFunction} */
    const create = async () => {
      const responses = [
        localRequest(uris, startByte, endByte),
        containerType == 'webm' ?
            localRequest(init.getUris(), init.startByte, init.endByte) :
            null,
      ];

      localRequest = null;
      const results = await Promise.all(responses);
      const indexData = results[0];
      const initData = results[1] || null;
      /** @type {Array.<!shaka.media.SegmentReference>} */
      let references = null;

      if (containerType == 'mp4') {
        references = shaka.media.Mp4SegmentIndexParser.parse(
            indexData, startByte, uris, scaledPresentationTimeOffset);
      } else {
        goog.asserts.assert(initData, 'WebM requires init data');
        references = shaka.media.WebmSegmentIndexParser.parse(
            indexData, initData, uris, scaledPresentationTimeOffset);
      }

      presentationTimeline.notifySegments(references, periodStart);

      // Since containers are never updated, we don't need to store the
      // segmentIndex in the map.
      goog.asserts.assert(!segmentIndex,
          'Should not call createSegmentIndex twice');

      segmentIndex = new shaka.media.SegmentIndex(references);
      if (fitLast) {
        segmentIndex.fit(periodDuration);
      }
      return results;
    };

    /** @type {!shaka.extern.GetSegmentReferenceFunction} */
    const get = (i) => {
      goog.asserts.assert(segmentIndex, 'Must call createSegmentIndex first');
      return segmentIndex.get(i);
    };

    /** @type {!shaka.extern.FindSegmentPositionFunction} */
    const find = (t) => {
      goog.asserts.assert(segmentIndex, 'Must call createSegmentIndex first');
      return segmentIndex.find(t);
    };

    return {
      createSegmentIndex: create,
      findSegmentPosition: find,
      getSegmentReference: get,
    };
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
   * Creates segment index info from a Context object.
   *
   * @param {shaka.dash.DashParser.Context} context
   * @param {shaka.dash.DashParser.RequestInitSegmentCallback}
   *     requestInitSegment
   * @param {shaka.media.InitSegmentReference} init
   * @param {number} scaledPresentationTimeOffset
   * @return {shaka.dash.DashParser.SegmentIndexFunctions}
   * @throws shaka.util.Error When there is a parsing error.
   * @private
   */
  static createSegmentIndex_(
      context, requestInitSegment, init, scaledPresentationTimeOffset) {
    const MpdUtils = shaka.dash.MpdUtils;
    const SegmentBase = shaka.dash.SegmentBase;
    const XmlUtils = shaka.util.XmlUtils;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
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

    if ((containerType == 'webm') && !init) {
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

    const representationIndex = MpdUtils.inheritChild(
        context, SegmentBase.fromInheritance_, 'RepresentationIndex');
    const indexRangeElem = MpdUtils.inheritAttribute(
        context, SegmentBase.fromInheritance_, 'indexRange');

    let indexUris = context.representation.baseUris;
    let indexRange = XmlUtils.parseRange(indexRangeElem || '');
    if (representationIndex) {
      const representationUri = representationIndex.getAttribute('sourceURL');
      if (representationUri) {
        indexUris = ManifestParserUtils.resolveUris(
            context.representation.baseUris, [representationUri]);
      }

      indexRange = XmlUtils.parseAttr(
          representationIndex, 'range', XmlUtils.parseRange, indexRange);
    }

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

    return shaka.dash.SegmentBase.createSegmentIndexFromUris(
        context, requestInitSegment, init, indexUris, indexRange.start,
        indexRange.end, containerType, scaledPresentationTimeOffset);
  }
};
