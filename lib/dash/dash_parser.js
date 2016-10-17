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

goog.provide('shaka.dash.DashParser');

goog.require('goog.asserts');
goog.require('shaka.dash.ContentProtection');
goog.require('shaka.dash.MpdUtils');
goog.require('shaka.dash.SegmentBase');
goog.require('shaka.dash.SegmentList');
goog.require('shaka.dash.SegmentTemplate');
goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.TextEngine');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.MultiMap');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.XmlUtils');



/**
 * Creates a new DASH parser.
 *
 * @struct
 * @constructor
 * @implements {shakaExtern.ManifestParser}
 */
shaka.dash.DashParser = function() {
  /** @private {shaka.net.NetworkingEngine} */
  this.networkingEngine_ = null;

  /** @private {?shakaExtern.ManifestConfiguration} */
  this.config_ = null;

  /** @private {?function(shakaExtern.Period)} */
  this.filterPeriod_ = null;

  /** @private {?function(!shaka.util.Error)} */
  this.onError_ = null;

  /** @private {?function(!shaka.util.FakeEvent)} */
  this.onEvent_ = null;

  /** @private {!Array.<string>} */
  this.manifestUris_ = [];

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

  /** @private {!shaka.net.NetworkingEngine.ResponseFilter} */
  this.emsgResponseFilter_ = this.emsgResponseFilter_.bind(this);
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
 * The default MPD@suggestedPresentationDelay in seconds.
 *
 * @private
 * @const {number}
 */
shaka.dash.DashParser.DEFAULT_SUGGESTED_PRESENTATION_DELAY_ = 10;


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
 *   codecs: string,
 *   frameRate: (number|undefined),
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
 * @property {string} codecs
 *   The inherited codecs value.
 * @property {(number|undefined)} frameRate
 *   The inherited framerate value.
 * @property {string} id
 *   The ID of the element.
 */
shaka.dash.DashParser.InheritanceFrame;


/**
 * @typedef {{
 *   dynamic: boolean,
 *   presentationTimeline: !shaka.media.PresentationTimeline,
 *   period: ?shaka.dash.DashParser.InheritanceFrame,
 *   periodInfo: ?shaka.dash.DashParser.PeriodInfo,
 *   adaptationSet: ?shaka.dash.DashParser.InheritanceFrame,
 *   representation: ?shaka.dash.DashParser.InheritanceFrame,
 *   bandwidth: (number|undefined)
 * }}
 *
 * @description
 * Contains context data for the streams.
 *
 * @property {boolean} dynamic
 *   True if the MPD is dynamic (not all segments available at once)
 * @property {!shaka.media.PresentationTimeline} presentationTimeline
 *   The PresentationTimeline.
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
 */
shaka.dash.DashParser.Context;


/**
 * @typedef {{
 *   start: number,
 *   duration: ?number,
 *   node: !Element,
 *   containsInband: boolean
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
 * @property {boolean} containsInband
 *   Indicates whether a period contains inband information.
 */
shaka.dash.DashParser.PeriodInfo;


/**
 * @typedef {{
 *   id: string,
 *   contentType: ?string,
 *   language: string,
 *   main: boolean,
 *   streams: !Array.<shakaExtern.Stream>,
 *   drmInfos: !Array.<shakaExtern.DrmInfo>,
 *   switchableIds: !Array.<string>,
 *   containsInband: boolean
 * }}
 *
 * @description
 * Contains information about an AdaptationSet element.
 *
 * @property {string} id
 *   The unique ID of the adaptation set.
 * @property {?string} contentType
 *   The content type of the AdaptationSet.
 * @property {string} language
 *   The language of the AdaptationSet.
 * @property {boolean} main
 *   Whether the AdaptationSet has the 'main' type.
 * @property {!Array.<shakaExtern.Stream>} streams
 *   The streams this AdaptationSet contains.
 * @property {!Array.<shakaExtern.DrmInfo>} drmInfos
 *   The DRM info for the AdaptationSet.
 * @property {!Array.<string>} switchableIds
 *   An array of the IDs of the AdaptationSets it can switch to.
 * @property {boolean} containsInband
 *   Signals whether AdaptationSet has inband content indicator on it.
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


/**
 * @typedef {{
 *   schemeIdUri: string,
 *   value: string,
 *   timescale: number,
 *   presentationTimeDelta: number,
 *   eventDuration: number,
 *   id: number,
 *   messageData: Uint8Array
 * }}
 *
 * @description
 * Contains information about an EMSG MP4 box.
 *
 * @property {string} schemeIdUri
 *    Identifies the message scheme.
 * @property {string} value
 *    Specifies the value for the event.
 * @property {number} timescale
 *    Provides the timescale, in ticks per second,
 *    for the time and duration fields within this box.
 * @property {number} presentationTimeDelta
 *    Provides the Media Presentation time delta of the media presentation
 *    time of the event and the earliest presentation time in this segment.
 * @property {number} eventDuration
 *    Provides the duration of event in media presentation time.
 * @property {number} id
 *    A field identifying this instance of the message.
 * @property {Uint8Array} messageData
 *    Body of the message.
 * @exportDoc
 */
shaka.dash.DashParser.EmsgInfo;


/** @override */
shaka.dash.DashParser.prototype.configure = function(config) {
  this.config_ = config;
};


/** @override */
shaka.dash.DashParser.prototype.start =
    function(uri, networkingEngine, filterPeriod, onError, onEvent) {
  goog.asserts.assert(this.config_, 'Must call configure() before start()!');
  this.manifestUris_ = [uri];
  this.networkingEngine_ = networkingEngine;
  this.filterPeriod_ = filterPeriod;
  this.onError_ = onError;
  this.onEvent_ = onEvent;
  return this.requestManifest_().then(function() {
    if (this.networkingEngine_)
      this.setUpdateTimer_(0);
    return this.manifest_;
  }.bind(this));
};


/** @override */
shaka.dash.DashParser.prototype.stop = function() {
  if (this.networkingEngine_)
    this.networkingEngine_.unregisterResponseFilter(this.emsgResponseFilter_);
  this.networkingEngine_ = null;
  this.filterPeriod_ = null;
  this.onError_ = null;
  this.onEvent_ = null;
  this.config_ = null;

  this.manifestUris_ = [];
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
 * @return {!Promise}
 * @private
 */
shaka.dash.DashParser.prototype.requestManifest_ = function() {
  var requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
  var request = shaka.net.NetworkingEngine.makeRequest(
      this.manifestUris_, this.config_.retryParameters);
  return this.networkingEngine_.request(requestType, request)
      .then(function(response) {
        // Detect calls to stop().
        if (!this.networkingEngine_)
          return;

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
 *   differ from this.manifestUri_ if there has been a redirect.
 * @return {!Promise}
 * @throws shaka.util.Error When there is a parsing error.
 * @private
 */
shaka.dash.DashParser.prototype.parseManifest_ =
    function(data, finalManifestUri) {
  var Error = shaka.util.Error;
  var Functional = shaka.util.Functional;
  var XmlUtils = shaka.util.XmlUtils;

  var string = shaka.util.StringUtils.fromUTF8(data);
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

  // Get any Location elements.  This will update the manifest location and
  // the base URI.
  /** @type {!Array.<string>} */
  var manifestBaseUris = [finalManifestUri];
  /** @type {!Array.<string>} */
  var locations = XmlUtils.findChildren(mpd, 'Location')
                      .map(XmlUtils.getContents)
                      .filter(Functional.isNotNull);
  if (locations.length > 0) {
    this.manifestUris_ = locations;
    manifestBaseUris = locations;
  }

  var uris = XmlUtils.findChildren(mpd, 'BaseURL').map(XmlUtils.getContents);
  var baseUris = shaka.dash.MpdUtils.resolveUris(manifestBaseUris, uris);

  var minBufferTime =
      XmlUtils.parseAttr(mpd, 'minBufferTime', XmlUtils.parseDuration);
  this.updatePeriod_ = /** @type {number} */ (XmlUtils.parseAttr(
      mpd, 'minimumUpdatePeriod', XmlUtils.parseDuration, -1));

  var presentationStartTime = XmlUtils.parseAttr(
      mpd, 'availabilityStartTime', XmlUtils.parseDate);
  var segmentAvailabilityDuration = XmlUtils.parseAttr(
      mpd, 'timeShiftBufferDepth', XmlUtils.parseDuration);
  var suggestedPresentationDelay = XmlUtils.parseAttr(
      mpd, 'suggestedPresentationDelay', XmlUtils.parseDuration);
  var maxSegmentDuration = XmlUtils.parseAttr(
      mpd, 'maxSegmentDuration', XmlUtils.parseDuration);
  var mpdType = mpd.getAttribute('type') || 'static';

  var presentationTimeline;
  if (this.manifest_) {
    presentationTimeline = this.manifest_.presentationTimeline;
  } else {
    // DASH IOP v3.0 suggests using a default delay between minBufferTime and
    // timeShiftBufferDepth.  This is literally the range of all feasible
    // choices for the value.  Nothing older than timeShiftBufferDepth is still
    // available, and anything less than minBufferTime will cause buffering
    // issues.
    //
    // We have decided that our default will be 1.5 * minBufferTime, or 10s,
    // whichever is larger.  This is fairly conservative.  Content providers
    // should provide a suggestedPresentationDelay whenever possible to optimize
    // the live streaming experience.
    var defaultPresentationDelay = Math.max(
        shaka.dash.DashParser.DEFAULT_SUGGESTED_PRESENTATION_DELAY_,
        minBufferTime * 1.5);
    var presentationDelay = suggestedPresentationDelay != null ?
        suggestedPresentationDelay : defaultPresentationDelay;
    presentationTimeline = new shaka.media.PresentationTimeline(
        presentationStartTime, presentationDelay);
  }

  /** @type {shaka.dash.DashParser.Context} */
  var context = {
    dynamic: mpdType != 'static',
    presentationTimeline: presentationTimeline,
    period: null,
    periodInfo: null,
    adaptationSet: null,
    representation: null,
    bandwidth: undefined
  };

  var periodsAndDuration = this.parsePeriods_(context, baseUris, mpd);
  var duration = periodsAndDuration.duration;
  var periods = periodsAndDuration.periods;

  presentationTimeline.setStatic(mpdType == 'static');
  presentationTimeline.setDuration(duration || Infinity);
  presentationTimeline.setSegmentAvailabilityDuration(
      segmentAvailabilityDuration != null ?
      segmentAvailabilityDuration :
      Infinity);
  // Use @maxSegmentDuration to override smaller, derived values.
  presentationTimeline.notifyMaxSegmentDuration(maxSegmentDuration || 1);
  if (!COMPILED) presentationTimeline.assertIsValid();

  if (this.manifest_) {
    // This is a manifest update, so we're done.
    return Promise.resolve();
  }

  // This is the first manifest parse, so we cannot return until we calculate
  // the clock offset.
  var timingElements = XmlUtils.findChildren(mpd, 'UTCTiming');

  var isLive = presentationTimeline.isLive();

  // if any of the periods had an emsg box indicator,
  // register a response filter to look for an EMSG box in segments
  if (periodsAndDuration.containsInband)
    this.networkingEngine_.registerResponseFilter(this.emsgResponseFilter_);

  return this.parseUtcTiming_(
      baseUris, timingElements, isLive).then(function(offset) {
    // Detect calls to stop().
    if (!this.networkingEngine_)
      return;

    presentationTimeline.setClockOffset(offset);

    this.manifest_ = {
      presentationTimeline: presentationTimeline,
      periods: periods,
      offlineSessionIds: [],
      minBufferTime: minBufferTime || 0
    };
  }.bind(this));
};


/**
 * Reads and parses the periods from the manifest.  This first does some
 * partial parsing so the start and duration is available when parsing children.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {!Array.<string>} baseUris
 * @param {!Element} mpd
 * @return {{periods: !Array.<shakaExtern.Period>,
 *          duration: ?number, containsInband: boolean}}
 * @private
 */
shaka.dash.DashParser.prototype.parsePeriods_ = function(
    context, baseUris, mpd) {
  var Functional = shaka.util.Functional;
  var XmlUtils = shaka.util.XmlUtils;
  var presentationDuration = XmlUtils.parseAttr(
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
      } else if (presentationDuration != null) {
        // "The Period extends until the Period.start of the next Period, or
        // until the end of the Media Presentation in the case of the last
        // Period."
        periodDuration = presentationDuration - start;
      }
    }

    // Parse child nodes.
    var info = {
      start: start,
      duration: periodDuration,
      node: elem,
      containsInband: false
    };
    var period = this.parsePeriod_(context, baseUris, info);
    periods.push(period);

    // If there are any new periods, call the callback and add them to the
    // manifest.  If this is the first parse, it will see all of them as new.
    var periodId = context.period.id;
    if (this.periodIds_.every(Functional.isNotEqualFunc(periodId))) {
      this.filterPeriod_(period);
      this.periodIds_.push(periodId);
      if (this.manifest_)
        this.manifest_.periods.push(period);
    }

    if (periodDuration == null) {
      if (i + 1 != periodNodes.length) {
        // If the duration is still null and we aren't at the end, then we will
        // skip any remaining periods.
        shaka.log.warning(
            'Skipping Period', i + 1, 'and any subsequent Periods:', 'Period',
            i + 1, 'does not have a valid start time.', periods[i + 1]);
      }

      // The duration is unknown, so the end is unknown.
      prevEnd = null;
      break;
    }

    prevEnd = start + periodDuration;
  }

  if (presentationDuration != null) {
    if (prevEnd != presentationDuration) {
      shaka.log.warning(
          '@mediaPresentationDuration does not match the total duration of all',
          'Periods.');
      // Assume @mediaPresentationDuration is correct.
    }
    return {
      periods: periods,
      duration: presentationDuration,
      containsInband: info.containsInband
    };
  } else {
    return {
      periods: periods,
      duration: prevEnd,
      containsInband: info.containsInband
    };
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

  // If the period doesn't have an ID, give it one based on its start time.
  if (!context.period.id) {
    shaka.log.info(
        'No Period ID given for Period with start time ' + periodInfo.start +
        ',  Assigning a default');
    context.period.id = '__shaka_period_' + periodInfo.start;
  }

  var adaptationSetNodes =
      XmlUtils.findChildren(periodInfo.node, 'AdaptationSet');
  var adaptationSets = adaptationSetNodes
      .map(this.parseAdaptationSet_.bind(this, context))
      .filter(shaka.util.Functional.isNotNull);

  if (adaptationSets.length == 0) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_EMPTY_PERIOD);
  }

  // see if any adaptation set has emsg indicator on it.
  // If it does, we'll register a response filter later.
  for (var i = 0; i < adaptationSets.length; i++) {
    if (adaptationSets[i].containsInband) {
      periodInfo.containsInband = true;
    }
  }

  var streamSets = this.createStreamSets_(adaptationSets);
  return {startTime: periodInfo.start, streamSets: streamSets};
};


/**
 * Parses an AdaptationSet XML element.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {!Element} elem The AdaptationSet element.
 * @return {?shaka.dash.DashParser.AdaptationInfo}
 * @throws shaka.util.Error When there is a parsing error.
 * @private
 */
shaka.dash.DashParser.prototype.parseAdaptationSet_ = function(context, elem) {
  var XmlUtils = shaka.util.XmlUtils;
  context.adaptationSet = this.createFrame_(elem, context.period, null);

  var main = false;
  var roles = XmlUtils.findChildren(elem, 'Role');

  // Default kind for text streams is 'subtitle' if unspecified in the manifest.
  var kind = undefined;
  if (context.adaptationSet.contentType == 'text') kind = 'subtitle';

  for (var i = 0; i < roles.length; i++) {
    var scheme = roles[i].getAttribute('schemeIdUri');
    if (scheme == null || scheme == 'urn:mpeg:dash:role:2011') {
      // These only apply for the given scheme, but allow them to be specified
      // if there is no scheme specified.
      // See: DASH section 5.8.5.5
      var value = roles[i].getAttribute('value');
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

  // InbandEventStream indicates that a segment contains inband
  // information.
  var eventStream = XmlUtils.findChild(elem, 'InbandEventStream');
  var containsInband = eventStream != null;

  var supplementalProperties =
      XmlUtils.findChildren(elem, 'SupplementalProperty');
  var switchableIds = [];
  supplementalProperties.forEach(function(prop) {
    var schemeId = prop.getAttribute('schemeIdUri');
    if (schemeId == 'urn:mpeg:dash:adaptation-set-switching:2016' ||
        schemeId == 'http://dashif.org/guidelines/AdaptationSetSwitching' ||
        schemeId == 'http://dashif.org/descriptor/AdaptationSetSwitching') {
      var value = prop.getAttribute('value');
      if (value)
        switchableIds.push.apply(switchableIds, value.split(','));
    }
  });

  var essentialProperties = XmlUtils.findChildren(elem, 'EssentialProperty');
  // ID of real AdaptationSet if this is a trick mode set:
  var trickModeFor = null;
  essentialProperties.forEach(function(prop) {
    var schemeId = prop.getAttribute('schemeIdUri');
    if (schemeId == 'http://dashif.org/guidelines/trickmode') {
      trickModeFor = prop.getAttribute('value');
    }
  });
  if (trickModeFor != null) {
    // Ignore trick mode tracks until we support them fully.
    return null;
  }

  var contentProtectionElems = XmlUtils.findChildren(elem, 'ContentProtection');
  var contentProtection = shaka.dash.ContentProtection.parseFromAdaptationSet(
      contentProtectionElems, this.config_.dash.customScheme);

  var language =
      shaka.util.LanguageUtils.normalize(elem.getAttribute('lang') || 'und');

  // Parse Representations into Streams.
  var streams = XmlUtils.findChildren(elem, 'Representation')
      .map(this.parseRepresentation_.bind(
          this, context, contentProtection, kind, language))
      .filter(function(s) { return !!s; });

  if (streams.length == 0) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_EMPTY_ADAPTATION_SET);
  }

  if (!context.adaptationSet.contentType) {
    // Guess the AdaptationSet's content type.
    var mimeType = streams[0].mimeType;
    var codecs = streams[0].codecs;
    var fullMimeType = mimeType;
    if (codecs) {
      fullMimeType += '; codecs="' + codecs + '"';
    }

    if (shaka.media.TextEngine.isTypeSupported(fullMimeType)) {
      // If it's supported by TextEngine, it's definitely text.
      // We don't check MediaSourceEngine, because that would report support
      // for platform-supported video and audio types as well.
      context.adaptationSet.contentType = 'text';
    } else {
      // Otherwise, just split the MIME type.  This handles video and audio
      // types well.
      context.adaptationSet.contentType = mimeType.split('/')[0];
    }
  }

  return {
    id: context.adaptationSet.id || ('__fake__' + this.globalId_++),
    contentType: context.adaptationSet.contentType,
    language: language,
    main: main,
    streams: streams,
    drmInfos: contentProtection.drmInfos,
    switchableIds: switchableIds,
    containsInband: containsInband
  };
};


/**
 * Parses a Representation XML element.
 *
 * @param {shaka.dash.DashParser.Context} context
 * @param {shaka.dash.ContentProtection.Context} contentProtection
 * @param {(string|undefined)} kind
 * @param {string} language
 * @param {!Element} node
 * @return {?shakaExtern.Stream} The Stream, or null when there is a
 *   non-critical parsing error.
 * @throws shaka.util.Error When there is a parsing error.
 * @private
 */
shaka.dash.DashParser.prototype.parseRepresentation_ = function(
    context, contentProtection, kind, language, node) {
  var XmlUtils = shaka.util.XmlUtils;

  context.representation = this.createFrame_(node, context.adaptationSet, null);
  if (!this.verifyRepresentation_(context.representation)) {
    shaka.log.warning('Skipping Representation', context.representation);
    return null;
  }

  context.bandwidth =
      XmlUtils.parseAttr(node, 'bandwidth', XmlUtils.parsePositiveInt) ||
      undefined;

  /** @type {?shaka.dash.DashParser.StreamInfo} */
  var streamInfo;
  var requestInitSegment = this.requestInitSegment_.bind(this);
  if (context.representation.segmentBase) {
    streamInfo = shaka.dash.SegmentBase.createStream(
        context, requestInitSegment);
  } else if (context.representation.segmentList) {
    streamInfo = shaka.dash.SegmentList.createStream(
        context, this.segmentIndexMap_);
  } else if (context.representation.segmentTemplate) {
    streamInfo = shaka.dash.SegmentTemplate.createStream(
        context, requestInitSegment, this.segmentIndexMap_, !!this.manifest_);
  } else {
    goog.asserts.assert(context.representation.contentType == 'text' ||
                        context.representation.contentType == 'application',
                        'Must have Segment* with non-text streams.');

    var baseUris = context.representation.baseUris;
    var duration = context.periodInfo.duration || 0;
    streamInfo = {
      createSegmentIndex: Promise.resolve.bind(Promise),
      findSegmentPosition:
          /** @return {?number} */ function(/** number */ time) {
            if (time >= 0 && time < duration)
              return 1;
            else
              return null;
          },
      getSegmentReference:
          /** @return {shaka.media.SegmentReference} */
          function(/** number */ ref) {
            if (ref != 1)
              return null;

            return new shaka.media.SegmentReference(
                1, 0, duration, function() { return baseUris; }, 0, null);
          },
      initSegmentReference: null,
      presentationTimeOffset: 0
    };
  }

  var contentProtectionElems = XmlUtils.findChildren(node, 'ContentProtection');
  var keyId = shaka.dash.ContentProtection.parseFromRepresentation(
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
    codecs: context.representation.codecs,
    frameRate: context.representation.frameRate,
    bandwidth: context.bandwidth,
    width: context.representation.width,
    height: context.representation.height,
    kind: kind,
    encrypted: contentProtection.drmInfos.length > 0,
    keyId: keyId,
    language: language,
    allowedByApplication: true,
    allowedByKeySystem: true
  };
};


/**
 * Called when the update timer ticks.
 *
 * @private
 */
shaka.dash.DashParser.prototype.onUpdate_ = function() {
  goog.asserts.assert(this.updateTimer_, 'Should only be called by timer');
  goog.asserts.assert(this.updatePeriod_ >= 0,
                      'There should be an update period');

  shaka.log.info('Updating manifest...');

  this.updateTimer_ = null;
  var startTime = Date.now();

  this.requestManifest_().then(function() {
    // Detect a call to stop()
    if (!this.networkingEngine_)
      return;

    // Ensure the next update occurs within |updatePeriod_| seconds by taking
    // into account the time it took to update the manifest.
    var endTime = Date.now();
    this.setUpdateTimer_((endTime - startTime) / 1000.0);
  }.bind(this)).catch(function(error) {
    goog.asserts.assert(error instanceof shaka.util.Error,
                        'Should only receive a Shaka error');
    this.onError_(error);

    // Try updating again, but ensure we haven't been destroyed.
    if (this.networkingEngine_) {
      this.setUpdateTimer_(0);
    }
  }.bind(this));
};


/**
 * Sets the update timer.  Does nothing if the manifest does not specify an
 * update period.
 *
 * @param {number} offset An offset, in seconds, to apply to the manifest's
 *   update period.
 * @private
 */
shaka.dash.DashParser.prototype.setUpdateTimer_ = function(offset) {
  if (this.updatePeriod_ < 0)
    return;
  goog.asserts.assert(this.updateTimer_ == null,
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
  goog.asserts.assert(parent || baseUris,
                      'Must provide either parent or baseUris');
  var MpdUtils = shaka.dash.MpdUtils;
  var XmlUtils = shaka.util.XmlUtils;
  parent = parent || /** @type {shaka.dash.DashParser.InheritanceFrame} */ ({
    contentType: '',
    mimeType: '',
    codecs: '',
    frameRate: undefined
  });
  baseUris = baseUris || parent.baseUris;

  var parseNumber = XmlUtils.parseNonNegativeInt;
  var evalDivision = XmlUtils.evalDivision;
  var uris = XmlUtils.findChildren(elem, 'BaseURL').map(XmlUtils.getContents);

  var contentType = elem.getAttribute('contentType') || parent.contentType;
  var mimeType = elem.getAttribute('mimeType') || parent.mimeType;
  var frameRate = XmlUtils.parseAttr(elem, 'frameRate',
      evalDivision) || parent.frameRate;

  if (!contentType) {
    contentType = mimeType.split('/')[0];
  }

  return {
    baseUris: MpdUtils.resolveUris(baseUris, uris),
    segmentBase: XmlUtils.findChild(elem, 'SegmentBase') || parent.segmentBase,
    segmentList: XmlUtils.findChild(elem, 'SegmentList') || parent.segmentList,
    segmentTemplate:
        XmlUtils.findChild(elem, 'SegmentTemplate') || parent.segmentTemplate,
    width: XmlUtils.parseAttr(elem, 'width', parseNumber) || parent.width,
    height: XmlUtils.parseAttr(elem, 'height', parseNumber) || parent.height,
    contentType: contentType,
    mimeType: mimeType,
    codecs: elem.getAttribute('codecs') || parent.codecs,
    frameRate: frameRate,
    id: elem.getAttribute('id')
  };
};


/**
 * Creates the StreamSet objects for the given AdaptationSets.  This will group
 * stream sets according to which streams it can switch to.  If AdaptationSet
 * A can switch to B, it is assumed that B can switch to A (as well as any
 * stream that A can switch to).
 *
 * @param {!Array.<shaka.dash.DashParser.AdaptationInfo>} adaptationSets
 * @return {!Array.<shakaExtern.StreamSet>}
 * @private
 */
shaka.dash.DashParser.prototype.createStreamSets_ = function(adaptationSets) {
  var Functional = shaka.util.Functional;
  /**
   * A map of ID to the group it belongs to.  Multiple IDs can map to the same
   * group.  Each entry in the group will map back to the same array.
   * @type {!Object.<string, !Array.<shaka.dash.DashParser.AdaptationInfo>>}
   */
  var groupMap = {};

  // Create an initial map of all AS.
  adaptationSets.forEach(function(set) { groupMap[set.id] = [set]; });

  // Merge any AdaptationSets that can switch to each other.
  adaptationSets.forEach(function(set) {
    var group = groupMap[set.id];
    set.switchableIds.forEach(function(id) {
      var otherGroup = groupMap[id];
      if (!otherGroup || otherGroup == group)
        return;

      // Merge the other group into the new one.
      group.push.apply(group, otherGroup);

      // Update each ID of the old group to map to the new group.
      otherGroup.forEach(function(other) {
        groupMap[other.id] = group;
      });
    });
  });

  /** @type {!Array.<shakaExtern.StreamSet>} */
  var ret = [];
  /** @type {!Array.<!Array.<shaka.dash.DashParser.AdaptationInfo>>} */
  var seenGroups = [];

  shaka.util.MapUtils.values(groupMap).forEach(function(group) {
    if (seenGroups.indexOf(group) >= 0)
      return;

    seenGroups.push(group);

    // First group AdaptationSets by type.
    var setsByType = new shaka.util.MultiMap();
    group.forEach(function(set) {
      setsByType.push(set.contentType || '', set);
    });

    setsByType.keys().forEach(function(type) {
      // Finally group AdaptationSets of the same type and group by language,
      // then squash them into the same StreamSetInfo.
      var setsByLang = new shaka.util.MultiMap();
      setsByType.get(type).forEach(function(set) {
        setsByLang.push(set.language, set);
      });

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
                  .reduce(Functional.collapseArrays, []),
          streams:
              sets.map(function(s) { return s.streams; })
                  .reduce(Functional.collapseArrays, [])
        };
        ret.push(streamSet);
      });  // forEach lang
    });  // forEach type
  });  // map groupId

  return ret;
};


/**
 * Verifies that a Representation has exactly one Segment* element.  Prints
 * warnings if there is a problem.
 *
 * @param {shaka.dash.DashParser.InheritanceFrame} frame
 * @return {boolean} True if the Representation is usable; otherwise return
 *   false.
 * @private
 */
shaka.dash.DashParser.prototype.verifyRepresentation_ = function(frame) {
  var n = 0;
  n += frame.segmentBase ? 1 : 0;
  n += frame.segmentList ? 1 : 0;
  n += frame.segmentTemplate ? 1 : 0;

  if (n == 0) {
    // TODO: extend with the list of MIME types registered to TextEngine.
    if (frame.contentType == 'text' || frame.contentType == 'application') {
      return true;
    } else {
      shaka.log.warning(
          'Representation does not contain a segment information source:',
          'the Representation must contain one of SegmentBase, SegmentList,',
          'SegmentTemplate, or explicitly indicate that it is "text".',
          frame);
      return false;
    }
  }

  if (n != 1) {
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
      goog.asserts.assert(frame.segmentList, 'There should be a SegmentList');
      shaka.log.info('Using SegmentList by default.');
      frame.segmentTemplate = null;
    }
  }

  return true;
};


/**
 * Makes a request to the given URI and calculates the clock offset.
 *
 * @param {!Array.<string>} baseUris
 * @param {string} uri
 * @param {string} method
 * @return {!Promise.<number>}
 * @private
 */
shaka.dash.DashParser.prototype.requestForTiming_ =
    function(baseUris, uri, method) {
  var requestUris = shaka.dash.MpdUtils.resolveUris(baseUris, [uri]);
  var request = shaka.net.NetworkingEngine.makeRequest(
      requestUris, this.config_.retryParameters);
  request.method = method;
  var type = shaka.net.NetworkingEngine.RequestType.MANIFEST;
  return this.networkingEngine_.request(type, request).then(function(response) {
    var text;
    if (method == 'HEAD') {
      if (!response.headers || !response.headers['date'])
        return 0;

      text = response.headers['date'];
    } else {
      text = shaka.util.StringUtils.fromUTF8(response.data);
    }

    var date = Date.parse(text);
    return isNaN(date) ? 0 : (date - Date.now());
  });
};


/**
 * Parses an array of UTCTiming elements.
 *
 * @param {!Array.<string>} baseUris
 * @param {!Array.<!Element>} elems
 * @param {boolean} isLive
 * @return {!Promise.<number>}
 * @private
 */
shaka.dash.DashParser.prototype.parseUtcTiming_ =
    function(baseUris, elems, isLive) {
  var schemesAndValues = elems.map(function(elem) {
    return {
      scheme: elem.getAttribute('schemeIdUri'),
      value: elem.getAttribute('value')
    };
  });

  // If there's nothing specified in the manifest, but we have a default from
  // the config, use that.
  var clockSyncUri = this.config_.dash.clockSyncUri;
  if (isLive && !schemesAndValues.length && clockSyncUri) {
    schemesAndValues.push({
      scheme: 'urn:mpeg:dash:utc:http-head:2014',
      value: clockSyncUri
    });
  }

  var Functional = shaka.util.Functional;
  return Functional.createFallbackPromiseChain(schemesAndValues, function(sv) {
    var scheme = sv.scheme;
    var value = sv.value;
    switch (scheme) {
      // See DASH IOP Guidelines Section 4.7
      // http://goo.gl/CQFNJT
      case 'urn:mpeg:dash:utc:http-head:2014':
      // Some old ISO23009-1 drafts used 2012.
      case 'urn:mpeg:dash:utc:http-head:2012':
        return this.requestForTiming_(baseUris, value, 'HEAD');
      case 'urn:mpeg:dash:utc:http-xsdate:2014':
      case 'urn:mpeg:dash:utc:http-iso:2014':
      case 'urn:mpeg:dash:utc:http-xsdate:2012':
      case 'urn:mpeg:dash:utc:http-iso:2012':
        return this.requestForTiming_(baseUris, value, 'GET');
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
        shaka.log.warning(
            'Unrecognized scheme in UTCTiming element', scheme);
        return Promise.reject();
    }
  }.bind(this)).catch(function() {
    if (isLive) {
      shaka.log.warning(
          'A UTCTiming element should always be given in live manifests! ' +
          'This content may not play on clients with bad clocks!');
    }
    return 0;
  });
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


/**
 * Response filter that looks for presence of EMSG
 * boxes in segments. If a box is found, depending on the content it
 * either triggers the manifest update or dispatches an event with the
 * box content to the application.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {!shakaExtern.Response} response
 * @private
 */
shaka.dash.DashParser.prototype.emsgResponseFilter_ = function(type, response) {
  // Only look for segment responses:
  if (type == shaka.net.NetworkingEngine.RequestType.SEGMENT) {
    var reader = new shaka.util.DataViewReader(new DataView(response.data),
        shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
    var boxSize = shaka.util.Mp4Parser.findBox(
        shaka.dash.DashParser.BOX_TYPE_EMSG, reader);
    if (boxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
      var start = reader.getPosition() - 8;
      var end = start + boxSize;
      // skip version and flags
      reader.skip(4);
      var scheme_id = reader.readTerminatedString();
      // scheme_id of "urn:mpeg:dash:event:2012" means it's
      // time to update the manifest
      if (scheme_id == shaka.dash.DashParser.DASH_EMSG_SCHEME_ID_URI) {
        // trigger manifest update
        this.requestManifest_();
      } else {
        // read rest of the data and dispatch event to the application
        var value = reader.readTerminatedString();
        var timescale = reader.readUint32();
        var presentationTimeDelta = reader.readUint32();
        var eventDuration = reader.readUint32();
        var id = reader.readUint32();
        var messageData = reader.readBytes(end - reader.getPosition());

        /** @type {shaka.dash.DashParser.EmsgInfo} */
        var emsg = {
          schemeIdUri: scheme_id,
          value: value,
          timescale: timescale,
          presentationTimeDelta: presentationTimeDelta,
          eventDuration: eventDuration,
          id: id,
          messageData: messageData
        };

        var event = new shaka.util.FakeEvent(
            'emsg', { 'detail': emsg });
        this.onEvent_(event);
      }
    }
  }
};


/** @const {number} */
shaka.dash.DashParser.BOX_TYPE_EMSG = 0x656D7367;


/** @const {string} */
shaka.dash.DashParser.DASH_EMSG_SCHEME_ID_URI = 'urn:mpeg:dash:event:2012';


shaka.media.ManifestParser.registerParserByExtension(
    'mpd', shaka.dash.DashParser);
shaka.media.ManifestParser.registerParserByMime(
    'application/dash+xml', shaka.dash.DashParser);

