/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.dash.DashParser');

goog.require('shaka.asserts');
goog.require('shaka.dash.ContentProtection');
goog.require('shaka.dash.MpdUtils');
goog.require('shaka.dash.SegmentBase');
goog.require('shaka.dash.SegmentList');
goog.require('shaka.dash.SegmentTemplate');
goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.MultiMap');
goog.require('shaka.util.XmlUtils');



/**
 * Creates a new DASH parser.
 *
 * @param {!shaka.net.NetworkingEngine} netEngine
 * @param {function(shakaExtern.Period)} newPeriod
 * @param {function(!shaka.util.Error)} onError
 *
 * @struct
 * @constructor
 * @implements {shaka.media.ManifestParser}
 */
shaka.dash.DashParser = function(netEngine, newPeriod, onError) {
  /** @private {shaka.net.NetworkingEngine} */
  this.networkingEngine_ = netEngine;

  /** @private {?shakaExtern.ManifestConfiguration} */
  this.config_ = null;

  /** @private {?function(shakaExtern.Period)} */
  this.newPeriod_ = newPeriod;

  /** @private {?function(!shaka.util.Error)} */
  this.onError_ = onError;

  /** @private {string} */
  this.manifestUri_ = '';

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = null;

  /** @private {!Array.<string>} */
  this.periodIds_ = [];

  /** @private {number} */
  this.globalId_ = 1;

  /**
   * A map of IDs to SegmentIndex objects.
   * ID: Period@id,AdaptationSet@id,@Representation@id
   * e.g.: '1,5,23'
   * @private {!Object.<string, !shaka.media.SegmentIndex>}
   */
  this.segmentIndexMap_ = {};

  /**
   * The update period in seconds; or 0 for no updates.
   * @private {number}
   */
  this.updatePeriod_ = 0;

  /** @private {?number} */
  this.updateTimer_ = null;
};


/**
 * Contains the minimum amount of time, in seconds, between manifest update
 * requests.
 *
 * @private
 * @const {number}
 */
shaka.dash.DashParser.MIN_UPDATE_PERIOD_ = 3;


/**
 * @typedef {
 *   !function(!Array.<string>, ?number, ?number):!Promise.<!ArrayBuffer>
 * }
 */
shaka.dash.DashParser.RequestInitSegmentCallback;


/**
 * @typedef {{
 *   segmentBase: Element,
 *   segmentList: Element,
 *   segmentTemplate: Element,
 *   baseUris: !Array.<string>,
 *   width: (number|undefined),
 *   height: (number|undefined),
 *   contentType: string,
 *   mimeType: string,
 *   codec: string,
 *   id: string
 * }}
 *
 * @description
 * A collection of elements and properties which are inherited across levels
 * of a DASH manifest.
 *
 * @property {Element} segmentBase
 *   The XML node for SegmentBase.
 * @property {Element} segmentList
 *   The XML node for SegmentList.
 * @property {Element} segmentTemplate
 *   The XML node for SegmentTemplate.
 * @property {!Array.<string>} baseUris
 *   An array of absolute base URIs for the frame.
 * @property {(number|undefined)} width
 *   The inherited width value.
 * @property {(number|undefined)} height
 *   The inherited height value.
 * @property {string} contentType
 *   The inherited media type.
 * @property {string} mimeType
 *   The inherited MIME type value.
 * @property {string} codec
 *   The inherited codec value.
 * @property {string} id
 *   The ID of the element.
 */
shaka.dash.DashParser.InheritanceFrame;


/**
 * @typedef {{
 *   period: ?shaka.dash.DashParser.InheritanceFrame,
 *   periodInfo: ?shaka.dash.DashParser.PeriodInfo,
 *   adaptationSet: ?shaka.dash.DashParser.InheritanceFrame,
 *   representation: ?shaka.dash.DashParser.InheritanceFrame,
 *   bandwidth: (number|undefined),
 *   isLive: boolean
 * }}
 *
 * @description
 * Contains context data for the streams.
 *
 * @property {?shaka.dash.DashParser.InheritanceFrame} period
 *   The inheritance from the Period element.
 * @property {?shaka.dash.DashParser.PeriodInfo} periodInfo
 *   The Period info for the current Period.
 * @property {?shaka.dash.DashParser.InheritanceFrame} adaptationSet
 *   The inheritance from the AdaptationSet element.
 * @property {?shaka.dash.DashParser.InheritanceFrame} representation
 *   The inheritance from the Representation element.
 * @property {(number|undefined)} bandwidth
 *   The bandwidth of the Representation.
 * @property {boolean} isLive
 *   Whether the manifest is live.
 */
shaka.dash.DashParser.Context;


/**
 * @typedef {{
 *   start: number,
 *   duration: ?number,
 *   node: !Element
 * }}
 *
 * @description
 * Contains information about a Period element.
 *
 * @property {number} start
 *   The start time of the period.
 * @property {?number} duration
 *   The duration of the period; or null if the duration is not given.  This
 *   will be non-null for all periods except the last.
 * @property {!Element} node
 *   The XML Node for the Period.
 */
shaka.dash.DashParser.PeriodInfo;


/**
 * @typedef {{
 *   contentType: ?string,
 *   language: string,
 *   group: ?number,
 *   main: boolean,
 *   streams: !Array.<shakaExtern.Stream>,
 *   drmInfos: !Array.<shakaExtern.DrmInfo>
 * }}
 *
 * @description
 * Contains information about an AdaptationSet element.
 *
 * @property {?string} contentType
 *   The content type of the AdaptationSet.
 * @property {string} language
 *   The language of the AdaptationSet.
 * @property {?number} group
 *   The group of the AdaptationSet, if given.
 * @property {boolean} main
 *   Whether the AdaptationSet has the 'main' type.
 * @property {!Array.<shakaExtern.Stream>} streams
 *   The streams this AdaptationSet contains.
 * @property {!Array.<shakaExtern.DrmInfo>} drmInfos
 *   The DRM info for the AdaptationSet.
 */
shaka.dash.DashParser.AdaptationInfo;


/**
 * @typedef {{
 *   createSegmentIndex: shakaExtern.CreateSegmentIndexFunction,
 *   findSegmentPosition: shakaExtern.FindSegmentPositionFunction,
 *   getSegmentReference: shakaExtern.GetSegmentReferenceFunction
 * }}
 *
 * @description
 * Contains functions used to create and find segment references.
 *
 * @property {shakaExtern.CreateSegmentIndexFunction} createSegmentIndex
 *   The createSegmentIndex function.
 * @property {shakaExtern.FindSegmentPositionFunction} findSegmentPosition
 *   The findSegmentPosition function.
 * @property {shakaExtern.GetSegmentReferenceFunction} getSegmentReference
 *   The getSegmentReference function.
 */
shaka.dash.DashParser.SegmentIndexFunctions;


/**
 * @typedef {{
 *   createSegmentIndex: shakaExtern.CreateSegmentIndexFunction,
 *   findSegmentPosition: shakaExtern.FindSegmentPositionFunction,
 *   getSegmentReference: shakaExtern.GetSegmentReferenceFunction,
 *   initSegmentReference: shaka.media.InitSegmentReference,
 *   presentationTimeOffset: (number|undefined)
 * }}
 *
 * @description
 * Contains information about a Stream.  This is passed from the createStream
 * methods.
 *
 * @property {shakaExtern.CreateSegmentIndexFunction} createSegmentIndex
 *   The createSegmentIndex function for the stream.
 * @property {shakaExtern.FindSegmentPositionFunction} findSegmentPosition
 *   The findSegmentPosition function for the stream.
 * @property {shakaExtern.GetSegmentReferenceFunction} getSegmentReference
 *   The getSegmentReference function for the stream.
 * @property {shaka.media.InitSegmentReference} initSegmentReference
 *   The init segment for the stream.
 * @property {(number|undefined)} presentationTimeOffset
 *   The presentationTimeOffset for the stream.
 */
shaka.dash.DashParser.StreamInfo;


/** @override */
shaka.dash.DashParser.prototype.configure = function(config) {
  this.config_ = config;
};


/** @override */
shaka.dash.DashParser.prototype.start = function(uri) {
  shaka.asserts.assert(this.config_, 'Must call configure() before start()!');
  this.manifestUri_ = uri;
  return this.requestManifest_().then(function(manifest) {
    this.setUpdateTimer_(0);
    return manifest;
  }.bind(this));
};


/** @override */
shaka.dash.DashParser.prototype.stop = function() {
  this.networkingEngine_ = null;
  this.newPeriod_ = null;
  this.onError_ = null;
  this.config_ = null;

  this.manifestUri_ = '';
  this.manifest_ = null;
  this.periodIds_ = [];
  this.segmentIndexMap_ = {};
  if (this.updateTimer_ != null) {
    window.clearTimeout(this.updateTimer_);
    this.updateTimer_ = null;
  }

  return Promise.resolve();
};


/**
 * Makes a network request for the manifest and parses the resulting data.
 *
 * @return {!Promise.<shakaExtern.Manifest>}
 * @private
 */
shaka.dash.DashParser.prototype.requestManifest_ = function() {
  var requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
  var request = shaka.net.NetworkingEngine.makeRequest(
      [this.manifestUri_], this.config_.retryParameters);
  return this.networkingEngine_.request(requestType, request)
      .then(function(response) {
        // This may throw; but it will result in a failed promise.
        return this.parseManifest_(response.data, response.uri);
      }.bind(this));
};


/**
 * Parses the manifest XML.  This also handles updates and will update the
 * stored manifest.
 *
 * @param {!ArrayBuffer} data
 * @param {string} finalManifestUri The final manifest URI, which may
 *     differ from this.manifestUri_ if there has been a redirect.
 * @return {!Promise.<shakaExtern.Manifest>}
 * @throws shaka.util.Error When there is a parsing error.
 * @private
 */
shaka.dash.DashParser.prototype.parseManifest_ =
    function(data, finalManifestUri) {
  var XmlUtils = shaka.util.XmlUtils;
  var Error = shaka.util.Error;

  var string = shaka.util.Uint8ArrayUtils.toString(new Uint8Array(data));
  var parser = new DOMParser();
  var xml = null;
  var mpd = null;

  try {
    xml = parser.parseFromString(string, 'text/xml');
  } catch (exception) {}
  if (xml) {
    // parseFromString returns a Document object.  A Document is a Node but not
    // an Element, so it cannot be used in XmlUtils (technically it can but the
    // types don't match).  The |documentElement| member defines the top-level
    // element in the document.
    if (xml.documentElement.tagName == 'MPD')
      mpd = xml.documentElement;
  }
  if (!mpd) {
    throw new Error(Error.Category.MANIFEST, Error.Code.DASH_INVALID_XML);
  }

  var uris = XmlUtils.findChildren(mpd, 'BaseURL').map(XmlUtils.getContents);
  var baseUris = shaka.dash.MpdUtils.resolveUris([finalManifestUri], uris);
  /** @type {shaka.dash.DashParser.Context} */
  var context = {
    period: null,
    periodInfo: null,
    adaptationSet: null,
    representation: null,
    bandwidth: undefined,
    isLive: mpd.getAttribute('type') == 'dynamic'
  };

  var minBufferTime =
      XmlUtils.parseAttr(mpd, 'minBufferTime', XmlUtils.parseDuration);
  this.updatePeriod_ =
      XmlUtils.parseAttr(mpd, 'minimumUpdatePeriod', XmlUtils.parseDuration) ||
      0;

  var presentationStartTime = XmlUtils.parseAttr(
      mpd, 'availabilityStartTime', XmlUtils.parseDate);
  var segmentAvailabilityDuration = XmlUtils.parseAttr(
      mpd, 'timeShiftBufferDepth', XmlUtils.parseDuration);
  var suggestedDelay = XmlUtils.parseAttr(
      mpd, 'suggestedPresentationDelay', XmlUtils.parseDuration);
  // TODO(modmaker): Use suggestedPresentationDelay.

  var periodsAndDuration = this.parsePeriods_(context, baseUris, mpd);
  var duration = periodsAndDuration.duration;
  var periods = periodsAndDuration.periods;

  // Cannot return until we calculate the clock offset.
  var timingElements = XmlUtils.findChildren(mpd, 'UTCTiming');
  return this.parseUtcTiming_(timingElements).then(function(offset) {
    if (presentationStartTime == null) {
      // If this is not live, then ignore segment availability.
      segmentAvailabilityDuration = null;
    } else if (segmentAvailabilityDuration == null) {
      // If there is no availability given and it's live, then the segments
      // will always be available.
      segmentAvailabilityDuration = Number.POSITIVE_INFINITY;
    }

    var timeline = new shaka.media.PresentationTimeline(
        duration || Number.POSITIVE_INFINITY, presentationStartTime,
        segmentAvailabilityDuration, offset);

    if (this.manifest_) {
      this.manifest_.presentationTimeline = timeline;
    } else {
      this.manifest_ = {
        periods: periods,
        presentationTimeline: timeline,
        minBufferTime: minBufferTime || 0
      };
    }

    return this.manifest_;
  }.bind(this));
};


/**
 * Reads and parses the periods from the manifest.  This first does some
 * partial parsing so the start and duration is available when parsing children.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {!Array.<string>} baseUris
 * @param {!Element} mpd
 * @return {{periods: !Array.<shakaExtern.Period>, duration: ?number}}
 * @private
 */
shaka.dash.DashParser.prototype.parsePeriods_ = function(
    context, baseUris, mpd) {
  var XmlUtils = shaka.util.XmlUtils;
  var totalDuration = XmlUtils.parseAttr(
      mpd, 'mediaPresentationDuration', XmlUtils.parseDuration);

  var periods = [];
  var prevEnd = 0;
  var periodNodes = XmlUtils.findChildren(mpd, 'Period');
  for (var i = 0; i < periodNodes.length; i++) {
    var elem = periodNodes[i];
    var start = /** @type {number} */ (
        XmlUtils.parseAttr(elem, 'start', XmlUtils.parseDuration, prevEnd));
    var periodDuration =
        XmlUtils.parseAttr(elem, 'duration', XmlUtils.parseDuration);

    if (periodDuration == null) {
      if (i + 1 != periodNodes.length) {
        // "The difference between the start time of a Period and the start time
        // of the following Period is the duration of the media content
        // represented by this Period."
        var nextPeriod = periodNodes[i + 1];
        var nextStart =
            XmlUtils.parseAttr(nextPeriod, 'start', XmlUtils.parseDuration);
        if (nextStart != null)
          periodDuration = nextStart - start;
      } else if (totalDuration != null) {
        // "The Period extends until the Period.start of the next Period, or
        // until the end of the Media Presentation in the case of the last
        // Period."
        periodDuration = totalDuration - start;
      }
    }

    // Parse child nodes.
    var info = {start: start, duration: periodDuration, node: elem};
    var period = this.parsePeriod_(context, baseUris, info);
    periods.push(period);

    // If there are any new periods, call the callback and add them to the
    // manifest.  If this is the first parse, it will see all of them as new.
    var periodId = context.period.id;
    if (this.periodIds_.every(function(id) { return id != periodId; })) {
      this.newPeriod_(period);
      this.periodIds_.push(periodId);
      if (this.manifest_)
        this.manifest_.periods.push(period);
    }

    if (periodDuration == null && i + 1 != periodNodes.length) {
      // If the duration is still null and we aren't at the end, then skip any
      // remaining periods.
      shaka.log.warning(
          'Skipping Period', i + 1, 'and any subsequent Periods:', 'Period',
          i + 1, 'does not have a valid start time.', periods[i + 1]);
      break;
    }
    prevEnd = start + periodDuration;
  }

  if (totalDuration != null) {
    if (prevEnd != totalDuration) {
      shaka.log.warning(
          '@mediaPresentationDuration does not match the total duration of all',
          'Periods.');
      // Assume @mediaPresentationDuration is correct.
    }
    return {periods: periods, duration: totalDuration};
  } else {
    return {periods: periods, duration: prevEnd};
  }
};


/**
 * Parses a Period XML element.  Unlike the other parse methods, this is not
 * given the Node; it is given a PeriodInfo structure.  Also, partial parsing
 * was done before this was called so start and duration are valid.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {!Array.<string>} baseUris
 * @param {shaka.dash.DashParser.PeriodInfo} periodInfo
 * @return {shakaExtern.Period}
 * @throws shaka.util.Error When there is a parsing error.
 * @private
 */
shaka.dash.DashParser.prototype.parsePeriod_ = function(
    context, baseUris, periodInfo) {
  var XmlUtils = shaka.util.XmlUtils;
  context.period = this.createFrame_(periodInfo.node, null, baseUris);
  context.periodInfo = periodInfo;

  var adaptationSetNodes =
      XmlUtils.findChildren(periodInfo.node, 'AdaptationSet');
  var adaptationSets =
      adaptationSetNodes.map(this.parseAdaptationSet_.bind(this, context));

  if (adaptationSets.length == 0) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_EMPTY_PERIOD);
  }

  this.assignGroups_(adaptationSets);
  var streamSets = this.createStreamSets_(adaptationSets);
  return {startTime: periodInfo.start, streamSets: streamSets};
};


/**
 * Parses an AdaptationSet XML element.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {!Element} elem The AdaptationSet element.
 * @return {shaka.dash.DashParser.AdaptationInfo}
 * @throws shaka.util.Error When there is a parsing error.
 * @private
 */
shaka.dash.DashParser.prototype.parseAdaptationSet_ = function(context, elem) {
  var XmlUtils = shaka.util.XmlUtils;
  context.adaptationSet = this.createFrame_(elem, context.period, null);
  if (!context.adaptationSet.contentType) {
    var mime = context.adaptationSet.mimeType;
    context.adaptationSet.contentType = mime.split('/')[0];
  }

  var main = false;
  var role = XmlUtils.findChild(elem, 'Role');
  var kind;
  if (role) {
    var scheme = role.getAttribute('schemeIdUri');
    if (scheme == null || scheme == 'urn:mpeg:dash:role:2011') {
      // These only apply for the given scheme, but allow them to be specified
      // if there is no scheme specified.
      // See: DASH section 5.8.5.5
      var value = role.getAttribute('value');
      switch (value) {
        case 'main':
          main = true;
          break;
        case 'caption':
        case 'subtitle':
          kind = value;
          break;
      }
    }
  }

  var contentProtectionElems = XmlUtils.findChildren(elem, 'ContentProtection');
  var contentProtection = shaka.dash.ContentProtection.parseFromAdaptationSet(
      contentProtectionElems, this.config_.dash.customScheme);

  var representations = XmlUtils.findChildren(elem, 'Representation');
  var streams = representations.map(
      this.parseRepresentation_.bind(this, context, contentProtection, kind));

  if (streams.length == 0) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_EMPTY_ADAPTATION_SET);
  }

  if (!context.adaptationSet.contentType) {
    context.adaptationSet.contentType = streams[0].mimeType.split('/')[0];
  }

  return {
    contentType: context.adaptationSet.contentType,
    language:
        shaka.util.LanguageUtils.normalize(elem.getAttribute('lang') || ''),
    group: XmlUtils.parseAttr(elem, 'group', XmlUtils.parseNonNegativeInt),
    main: main,
    streams: streams,
    drmInfos: contentProtection.drmInfos
  };
};


/**
 * Parses a Representation XML element.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {shaka.dash.ContentProtection.Context} contentProtection
 * @param {(string|undefined)} kind
 * @param {!Element} node
 * @return {shakaExtern.Stream}
 * @throws shaka.util.Error When there is a parsing error.
 * @private
 */
shaka.dash.DashParser.prototype.parseRepresentation_ = function(
    context, contentProtection, kind, node) {
  var XmlUtils = shaka.util.XmlUtils;
  context.representation = this.createFrame_(node, context.adaptationSet, null);
  context.bandwidth =
      XmlUtils.parseAttr(node, 'bandwidth', XmlUtils.parsePositiveInt) ||
      undefined;
  if (context.representation.contentType != 'text') {
    this.verifyRepresentation_(context.representation);
  }

  /** @type {?shaka.dash.DashParser.StreamInfo} */
  var streamInfo;
  var requestInitSegment = this.requestInitSegment_.bind(this);
  if (context.representation.segmentBase) {
    streamInfo = shaka.dash.SegmentBase.createStream(
        context, requestInitSegment, this.segmentIndexMap_);
  } else if (context.representation.segmentList) {
    streamInfo = shaka.dash.SegmentList.createStream(
        context, this.segmentIndexMap_, this.manifest_);
  } else {
    streamInfo = shaka.dash.SegmentTemplate.createStream(
        context, requestInitSegment, this.segmentIndexMap_, this.manifest_);
  }

  var contentProtectionElems = XmlUtils.findChildren(node, 'ContentProtection');
  var keyIds = shaka.dash.ContentProtection.parseFromRepresentation(
      contentProtectionElems, this.config_.dash.customScheme,
      contentProtection);

  return {
    id: this.globalId_++,
    createSegmentIndex: streamInfo.createSegmentIndex,
    findSegmentPosition: streamInfo.findSegmentPosition,
    getSegmentReference: streamInfo.getSegmentReference,
    initSegmentReference: streamInfo.initSegmentReference,
    presentationTimeOffset: streamInfo.presentationTimeOffset,
    mimeType: context.representation.mimeType,
    codecs: context.representation.codec,
    bandwidth: context.bandwidth,
    width: context.representation.width,
    height: context.representation.height,
    kind: kind,
    keyIds: keyIds
  };
};


/**
 * Called when the update timer ticks.
 *
 * @private
 */
shaka.dash.DashParser.prototype.onUpdate_ = function() {
  shaka.asserts.assert(this.updateTimer_, 'Should only be called by timer');
  shaka.asserts.assert(this.updatePeriod_ > 0,
                       'There should be an update period');

  shaka.log.info('Updating manifest...');

  this.updateTimer_ = null;
  var startTime = Date.now();

  this.requestManifest_().then(function() {
    // Detect a call to stop()
    if (!this.manifest_)
      return;

    // Ensure the next update occurs within |updatePeriod_| seconds by taking
    // into account the time it took to update the manifest.
    var endTime = Date.now();
    this.setUpdateTimer_((endTime - startTime) / 1000.0);
  }.bind(this)).catch(function(error) {
    shaka.asserts.assert(error instanceof shaka.util.Error,
                         'Should only receive a Shaka error');
    this.onError_(error);

    // Try updating again, but ensure we haven't been destroyed.
    if (this.manifest_) {
      this.setUpdateTimer_(0);
    }
  }.bind(this));
};


/**
 * Sets the update timer.  Does nothing if the manifest does not specify an
 * update period.
 *
 * @param {number} offset An offset, in seconds, to apply to the manifest's
 *     update period.
 * @private
 */
shaka.dash.DashParser.prototype.setUpdateTimer_ = function(offset) {
  if (this.updatePeriod_ == 0)
    return;
  shaka.asserts.assert(this.updateTimer_ == null,
                       'Timer should not be already set');

  var period =
      Math.max(shaka.dash.DashParser.MIN_UPDATE_PERIOD_, this.updatePeriod_);
  var interval = Math.max(period - offset, 0);
  shaka.log.debug('updateInterval', interval);

  var callback = this.onUpdate_.bind(this);
  this.updateTimer_ = window.setTimeout(callback, 1000 * interval);
};


/**
 * Creates a new inheritance frame for the given element.
 *
 * @param {!Element} elem
 * @param {?shaka.dash.DashParser.InheritanceFrame} parent
 * @param {Array.<string>} baseUris
 * @return {shaka.dash.DashParser.InheritanceFrame}
 * @private
 */
shaka.dash.DashParser.prototype.createFrame_ = function(
    elem, parent, baseUris) {
  shaka.asserts.assert(parent || baseUris,
                       'Must provide either parent or baseUris');
  var MpdUtils = shaka.dash.MpdUtils;
  var XmlUtils = shaka.util.XmlUtils;
  parent = parent || /** @type {shaka.dash.DashParser.InheritanceFrame} */ ({
    contentType: '',
    mimeType: '',
    codec: ''
  });
  baseUris = baseUris || parent.baseUris;

  var parseNumber = XmlUtils.parseNonNegativeInt;
  var uris = XmlUtils.findChildren(elem, 'BaseURL').map(XmlUtils.getContents);
  return {
    baseUris: MpdUtils.resolveUris(baseUris, uris),
    segmentBase: XmlUtils.findChild(elem, 'SegmentBase') || parent.segmentBase,
    segmentList: XmlUtils.findChild(elem, 'SegmentList') || parent.segmentList,
    segmentTemplate:
        XmlUtils.findChild(elem, 'SegmentTemplate') || parent.segmentTemplate,
    width: XmlUtils.parseAttr(elem, 'width', parseNumber) || parent.width,
    height: XmlUtils.parseAttr(elem, 'height', parseNumber) || parent.height,
    contentType: elem.getAttribute('contentType') || parent.contentType,
    mimeType: elem.getAttribute('mimeType') || parent.mimeType,
    codec: elem.getAttribute('codecs') || parent.codec,
    id: elem.getAttribute('id')
  };
};


/**
 * Assigns a unique non-zero group to each AdaptationSet without an explicitly
 * set group.
 *
 * @param {!Array.<shaka.dash.DashParser.AdaptationInfo>} adaptationSets
 * @private
 * @see ISO/IEC 23009-1 5.3.3.1
 */
shaka.dash.DashParser.prototype.assignGroups_ = function(adaptationSets) {
  /** @type {!Array.<boolean|undefined>} */
  var groups = [];

  for (var i = 0; i < adaptationSets.length; ++i) {
    var adaptationSet = adaptationSets[i];
    if (adaptationSet.group != null) {
      groups[adaptationSet.group] = true;
    }
  }

  var group = 1;
  for (var i = 0; i < adaptationSets.length; ++i) {
    var adaptationSet = adaptationSets[i];
    if (adaptationSet.group == null) {
      while (groups[group] == true) ++group;
      groups[group] = true;
      adaptationSet.group = group;
    }
  }
};


/**
 * Creates the StreamSet objects for the given AdaptationSets.  This first
 * groups by type, group, and language, then squashes the representations
 * together to create the StreamSet objects.
 *
 * @param {!Array.<shaka.dash.DashParser.AdaptationInfo>} adaptationSets
 * @return {!Array.<shakaExtern.StreamSet>}
 * @private
 */
shaka.dash.DashParser.prototype.createStreamSets_ = function(adaptationSets) {
  /** @type {!Array.<shakaExtern.StreamSet>} */
  var ret = [];

  // First group AdaptationSets by type.
  var setsByType = new shaka.util.MultiMap();
  adaptationSets.forEach(
      function(set) { setsByType.push(set.contentType || '', set); });

  setsByType.keys().forEach(function(type) {
    // Then group AdaptationSets of the same type by group.
    var setsByGroup = new shaka.util.MultiMap();
    setsByType.get(type).forEach(
        function(set) { setsByGroup.push(set.group, set); });

    setsByGroup.keys().forEach(function(group) {
      shaka.asserts.assert(group != null, 'Group cannot be null');

      // Finally group AdaptationSets of the same type and group by language,
      // then squash them into the same StreamSetInfo.
      var setsByLang = new shaka.util.MultiMap();
      setsByGroup.get(group).forEach(
          function(set) { setsByLang.push(set.language, set); });

      setsByLang.keys().forEach(function(lang) {
        var sets =
            /** @type {!Array.<shaka.dash.DashParser.AdaptationInfo>} */ (
                setsByLang.get(lang));

        /** @type {shakaExtern.StreamSet} */
        var streamSet = {
          language: lang,
          type: type,
          primary: sets.some(function(s) { return s.main; }),
          drmInfos:
              sets.map(function(s) { return s.drmInfos; })
                  .reduce(function(all, part) { return all.concat(part); }, []),
          streams:
              sets.map(function(s) { return s.streams; })
                  .reduce(function(all, part) { return all.concat(part); }, [])
        };
        ret.push(streamSet);
      });  // forEach lang
    });  // forEach group
  });  // forEach type

  return ret;
};


/**
 * Verifies that a Representation has exactly one Segment* element.  Prints
 * warnings if there is a problem.
 *
 * @param {shaka.dash.DashParser.InheritanceFrame} frame
 * @throws shaka.util.Error If there is no segment info.
 * @private
 */
shaka.dash.DashParser.prototype.verifyRepresentation_ = function(frame) {
  var n = 0;
  n += frame.segmentBase ? 1 : 0;
  n += frame.segmentList ? 1 : 0;
  n += frame.segmentTemplate ? 1 : 0;

  if (n == 0) {
    shaka.log.error(
        'Representation does not contain any segment information:',
        'the Representation must contain one of SegmentBase,',
        'SegmentList, or SegmentTemplate.',
        frame);
    throw new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
  } else if (n != 1) {
    shaka.log.warning(
        'Representation contains multiple segment information sources:',
        'the Representation should only contain one of SegmentBase,',
        'SegmentList, or SegmentTemplate.',
        frame);
    if (frame.segmentBase) {
      shaka.log.info('Using SegmentBase by default.');
      frame.segmentList = null;
      frame.segmentTemplate = null;
    } else {
      shaka.asserts.assert(frame.segmentList, 'There should be a SegmentList');
      shaka.log.info('Using SegmentList by default.');
      frame.segmentTemplate = null;
    }
  }
};


/**
 * Makes a request to the given URI and calculates the clock offset.
 *
 * @param {string} uri
 * @param {string} method
 * @return {!Promise.<number>}
 * @private
 */
shaka.dash.DashParser.prototype.requestForTiming_ = function(uri, method) {
  var request = shaka.net.NetworkingEngine.makeRequest(
      [uri], this.config_.retryParameters);
  request.method = method;
  var type = shaka.net.NetworkingEngine.RequestType.MANIFEST;
  return this.networkingEngine_.request(type, request).then(function(response) {
    var text;
    if (method == 'HEAD') {
      if (!response.headers || !response.headers['date'])
        return 0;

      text = response.headers['date'];
    } else {
      var data = new Uint8Array(response.data);
      text = shaka.util.Uint8ArrayUtils.toString(data);
    }

    var date = Date.parse(text);
    return isNaN(date) ? 0 : (date - Date.now());
  });
};


/**
 * Parses an array of UTCTiming elements.
 *
 * @param {Array.<!Element>} elems
 * @return {!Promise.<number>}
 * @private
 */
shaka.dash.DashParser.prototype.parseUtcTiming_ = function(elems) {
  var promise = elems.reduce(function(parent, elem) {
    return parent.catch(function() {
      var scheme = elem.getAttribute('schemeIdUri');
      var value = elem.getAttribute('value');
      switch (scheme) {
        // See DASH IOP Guidelines Section 4.7
        // http://goo.gl/CQFNJT
        case 'urn:mpeg:dash:utc:http-head:2014':
        // Some old ISO23009-1 drafts used 2012.
        case 'urn:mpeg:dash:utc:http-head:2012':
          return this.requestForTiming_(value, 'HEAD');
        case 'urn:mpeg:dash:utc:http-xsdate:2014':
        case 'urn:mpeg:dash:utc:http-iso:2014':
        case 'urn:mpeg:dash:utc:http-xsdate:2012':
        case 'urn:mpeg:dash:utc:http-iso:2012':
          return this.requestForTiming_(value, 'GET');
        case 'urn:mpeg:dash:utc:direct:2014':
        case 'urn:mpeg:dash:utc:direct:2012':
          var date = Date.parse(value);
          return isNaN(date) ? 0 : (date - Date.now());

        case 'urn:mpeg:dash:utc:http-ntp:2014':
        case 'urn:mpeg:dash:utc:ntp:2014':
        case 'urn:mpeg:dash:utc:sntp:2014':
          shaka.log.warning('NTP UTCTiming scheme is not supported');
          return Promise.reject();
        default:
          shaka.log.warning('Unrecognized scheme in UTCTiming element', scheme);
          return Promise.reject();
      }
    }.bind(this));
  }.bind(this), Promise.reject());

  return promise.catch(function() { return 0; });
};


/**
 * Makes a network request on behalf of SegmentBase.createStream.
 *
 * @param {!Array.<string>} uris
 * @param {?number} startByte
 * @param {?number} endByte
 * @return {!Promise.<!ArrayBuffer>}
 * @private
 */
shaka.dash.DashParser.prototype.requestInitSegment_ = function(
    uris, startByte, endByte) {
  var requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
  var request = shaka.net.NetworkingEngine.makeRequest(
      uris, this.config_.retryParameters);
  if (startByte != null) {
    var end = (endByte != null ? endByte : '');
    request.headers['Range'] = 'bytes=' + startByte + '-' + end;
  }

  return this.networkingEngine_.request(requestType, request)
      .then(function(response) { return response.data; });
};

shaka.media.ManifestParser.registerParserByExtension(
    'mpd', shaka.dash.DashParser);
shaka.media.ManifestParser.registerParserByMime(
    'application/dash+xml', shaka.dash.DashParser);

