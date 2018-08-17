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
 * @namespace shaka.dash.SegmentBase
 * @summary A set of functions for parsing SegmentBase elements.
 */


/**
 * Creates an init segment reference from a Context object.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {function(?shaka.dash.DashParser.InheritanceFrame):Element} callback
 * @return {shaka.media.InitSegmentReference}
 */
shaka.dash.SegmentBase.createInitSegment = function(context, callback) {
  const MpdUtils = shaka.dash.MpdUtils;
  const XmlUtils = shaka.util.XmlUtils;
  const ManifestParserUtils = shaka.util.ManifestParserUtils;

  let initialization =
      MpdUtils.inheritChild(context, callback, 'Initialization');
  if (!initialization) {
    return null;
  }

  let resolvedUris = context.representation.baseUris;
  let uri = initialization.getAttribute('sourceURL');
  if (uri) {
    resolvedUris =
        ManifestParserUtils.resolveUris(context.representation.baseUris, [uri]);
  }

  let startByte = 0;
  let endByte = null;
  let range = XmlUtils.parseAttr(initialization, 'range', XmlUtils.parseRange);
  if (range) {
    startByte = range.start;
    endByte = range.end;
  }

  let getUris = function() { return resolvedUris; };
  return new shaka.media.InitSegmentReference(getUris, startByte, endByte);
};


/**
 * Creates a new Stream object.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {shaka.dash.DashParser.RequestInitSegmentCallback} requestInitSegment
 * @throws shaka.util.Error When there is a parsing error.
 * @return {shaka.dash.DashParser.StreamInfo}
 */
shaka.dash.SegmentBase.createStream = function(context, requestInitSegment) {
  goog.asserts.assert(context.representation.segmentBase,
                      'Should only be called with SegmentBase');
  // Since SegmentBase does not need updates, simply treat any call as
  // the initial parse.
  const MpdUtils = shaka.dash.MpdUtils;
  const SegmentBase = shaka.dash.SegmentBase;
  const XmlUtils = shaka.util.XmlUtils;

  let unscaledPresentationTimeOffset = Number(MpdUtils.inheritAttribute(
      context, SegmentBase.fromInheritance_, 'presentationTimeOffset')) || 0;

  let timescaleStr = MpdUtils.inheritAttribute(
      context, SegmentBase.fromInheritance_, 'timescale');
  let timescale = 1;
  if (timescaleStr) {
    timescale = XmlUtils.parsePositiveInt(timescaleStr) || 1;
  }

  let scaledPresentationTimeOffset =
      (unscaledPresentationTimeOffset / timescale) || 0;

  let init =
      SegmentBase.createInitSegment(context, SegmentBase.fromInheritance_);
  let index = SegmentBase.createSegmentIndex_(
      context, requestInitSegment, init, scaledPresentationTimeOffset);

  return {
    createSegmentIndex: index.createSegmentIndex,
    findSegmentPosition: index.findSegmentPosition,
    getSegmentReference: index.getSegmentReference,
    initSegmentReference: init,
    scaledPresentationTimeOffset: scaledPresentationTimeOffset,
  };
};


/**
 * Creates segment index info for the given info.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {shaka.dash.DashParser.RequestInitSegmentCallback} requestInitSegment
 * @param {shaka.media.InitSegmentReference} init
 * @param {!Array.<string>} uris
 * @param {number} startByte
 * @param {?number} endByte
 * @param {string} containerType
 * @param {number} scaledPresentationTimeOffset
 * @return {shaka.dash.DashParser.SegmentIndexFunctions}
 */
shaka.dash.SegmentBase.createSegmentIndexFromUris = function(
    context, requestInitSegment, init, uris,
    startByte, endByte, containerType, scaledPresentationTimeOffset) {
  let presentationTimeline = context.presentationTimeline;
  let fitLast = !context.dynamic || !context.periodInfo.isLastPeriod;
  let periodStart = context.periodInfo.start;
  let periodDuration = context.periodInfo.duration;

  // Create a local variable to bind to so we can set to null to help the GC.
  let localRequest = requestInitSegment;
  let segmentIndex = null;
  let create = function() {
    let async = [
      localRequest(uris, startByte, endByte),
      containerType == 'webm' ?
          localRequest(init.getUris(), init.startByte, init.endByte) :
          null,
    ];

    localRequest = null;
    return Promise.all(async).then(function(results) {
      let indexData = results[0];
      let initData = results[1] || null;
      let references = null;

      if (containerType == 'mp4') {
        // eslint-disable-next-line new-cap
        references = shaka.media.Mp4SegmentIndexParser(
            indexData, startByte, uris, scaledPresentationTimeOffset);
      } else {
        goog.asserts.assert(initData, 'WebM requires init data');
        let parser = new shaka.media.WebmSegmentIndexParser();
        references = parser.parse(indexData, initData, uris,
            scaledPresentationTimeOffset);
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
    });
  };
  let get = function(i) {
    goog.asserts.assert(segmentIndex, 'Must call createSegmentIndex first');
    return segmentIndex.get(i);
  };
  let find = function(t) {
    goog.asserts.assert(segmentIndex, 'Must call createSegmentIndex first');
    return segmentIndex.find(t);
  };

  return {
    createSegmentIndex: create,
    findSegmentPosition: find,
    getSegmentReference: get,
  };
};


/**
 * @param {?shaka.dash.DashParser.InheritanceFrame} frame
 * @return {Element}
 * @private
 */
shaka.dash.SegmentBase.fromInheritance_ = function(frame) {
  return frame.segmentBase;
};


/**
 * Creates segment index info from a Context object.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {shaka.dash.DashParser.RequestInitSegmentCallback} requestInitSegment
 * @param {shaka.media.InitSegmentReference} init
 * @param {number} scaledPresentationTimeOffset
 * @return {shaka.dash.DashParser.SegmentIndexFunctions}
 * @throws shaka.util.Error When there is a parsing error.
 * @private
 */
shaka.dash.SegmentBase.createSegmentIndex_ = function(
    context, requestInitSegment, init, scaledPresentationTimeOffset) {
  const MpdUtils = shaka.dash.MpdUtils;
  const SegmentBase = shaka.dash.SegmentBase;
  const XmlUtils = shaka.util.XmlUtils;
  const ManifestParserUtils = shaka.util.ManifestParserUtils;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  let contentType = context.representation.contentType;
  let containerType = context.representation.mimeType.split('/')[1];
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

  let representationIndex = MpdUtils.inheritChild(
      context, SegmentBase.fromInheritance_, 'RepresentationIndex');
  let indexRangeElem = MpdUtils.inheritAttribute(
      context, SegmentBase.fromInheritance_, 'indexRange');

  let indexUris = context.representation.baseUris;
  let indexRange = XmlUtils.parseRange(indexRangeElem || '');
  if (representationIndex) {
    let representationUri = representationIndex.getAttribute('sourceURL');
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
};
