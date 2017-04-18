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

goog.provide('shaka.test.FakeAbrManager');
goog.provide('shaka.test.FakeDrmEngine');
goog.provide('shaka.test.FakeManifestParser');
goog.provide('shaka.test.FakePlayhead');
goog.provide('shaka.test.FakePlayheadObserver');
goog.provide('shaka.test.FakePresentationTimeline');
goog.provide('shaka.test.FakeStreamingEngine');
goog.provide('shaka.test.FakeVideo');



/**
 * A fake AbrManager.
 *
 * @constructor
 * @struct
 * @implements {shakaExtern.AbrManager}
 */
shaka.test.FakeAbrManager = function() {
  /** @type {number} */
  this.chooseIndex = 0;

  /** @type {!Array.<shakaExtern.Variant>} */
  this.variants = [];

  /** @type {!Array.<shakaExtern.Stream>} */
  this.textStreams = [];

  spyOn(this, 'chooseStreams').and.callThrough();
  spyOn(this, 'stop');
  spyOn(this, 'init');
  spyOn(this, 'enable');
  spyOn(this, 'disable');
  spyOn(this, 'segmentDownloaded');
  spyOn(this, 'getBandwidthEstimate');
  spyOn(this, 'setDefaultEstimate');
  spyOn(this, 'setRestrictions');
  spyOn(this, 'setTextStreams').and.callThrough();
  spyOn(this, 'setVariants').and.callThrough();
};


/** @override */
shaka.test.FakeAbrManager.prototype.stop = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.init = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.enable = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.disable = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.segmentDownloaded = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.getBandwidthEstimate = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.setDefaultEstimate = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.setRestrictions = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.chooseStreams = function(
    mediaTypesToUpdate) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var ret = {};
  var variant = this.variants[this.chooseIndex];

  var textStream = null;
  if (this.textStreams.length > this.chooseIndex)
    textStream = this.textStreams[this.chooseIndex];

  if (mediaTypesToUpdate.indexOf(ContentType.AUDIO) > -1 ||
      mediaTypesToUpdate.indexOf(ContentType.VIDEO) > -1) {
    if (variant.audio) ret[ContentType.AUDIO] = variant.audio;
    if (variant.video) ret[ContentType.VIDEO] = variant.video;
  }

  if (mediaTypesToUpdate.indexOf(ContentType.TEXT) > -1 && textStream)
    ret[ContentType.TEXT] = textStream;

  return ret;
};


/** @override */
shaka.test.FakeAbrManager.prototype.setVariants = function(variants) {
  this.variants = variants;
};


/** @override */
shaka.test.FakeAbrManager.prototype.setTextStreams = function(streams) {
  this.textStreams = streams;
};



/**
 * A fake DrmEngine.
 *
 * @constructor
 * @struct
 * @extends {shaka.media.DrmEngine}
 * @return {!Object}
 */
shaka.test.FakeDrmEngine = function() {
  var resolve = Promise.resolve.bind(Promise);
  var offlineSessionIds = [];
  var drmInfo = null;

  var ret = jasmine.createSpyObj('FakeDrmEngine', [
    'attach', 'configure', 'destroy', 'getDrmInfo', 'getExpiration',
    'getSessionIds', 'getSupportedTypes', 'init', 'initialized',
    'isSupportedByKeySystem', 'keySystem'
  ]);
  ret.attach.and.callFake(resolve);
  ret.destroy.and.callFake(resolve);
  ret.init.and.callFake(resolve);
  ret.initialized.and.returnValue(true);
  ret.keySystem.and.returnValue('com.example.fake');
  ret.getExpiration.and.returnValue(Infinity);
  // See shaka.test.ManifestGenerator.protototype.createStream.
  ret.getSupportedTypes.and.returnValue(
      ['video/mp4; codecs="avc1.4d401f"']);

  ret.setSessionIds = function(sessions) {
    offlineSessionIds = sessions;
  };
  ret.setDrmInfo = function(info) { drmInfo = info; };
  ret.getDrmInfo.and.callFake(function() { return drmInfo; });
  ret.getSessionIds.and.callFake(function() {
    return offlineSessionIds;
  });
  ret.isSupportedByKeySystem.and.returnValue(true);

  return ret;
};


/** @type {jasmine.Spy} */
shaka.test.FakeDrmEngine.prototype.init;


/** @type {jasmine.Spy} */
shaka.test.FakeDrmEngine.prototype.attach;


/** @type {jasmine.Spy} */
shaka.test.FakeDrmEngine.prototype.getExpiration;


/** @param {?shakaExtern.DrmInfo} info */
shaka.test.FakeDrmEngine.prototype.setDrmInfo;


/** @param {!Array.<string>} sessions */
shaka.test.FakeDrmEngine.prototype.setSessionIds;



/**
 * A fake StreamingEngine.
 *
 * @constructor
 * @param {shakaExtern.Period} period
 * @struct
 * @extends {shaka.media.StreamingEngine}
 * @return {!Object}
 */
shaka.test.FakeStreamingEngine = function(period) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var resolve = Promise.resolve.bind(Promise);
  var activeStreams = {};
  if (period.variants.length) {
    var variant = period.variants[0];
    if (variant.audio)
      activeStreams[ContentType.AUDIO] = variant.audio;
    if (variant.video)
      activeStreams[ContentType.VIDEO] = variant.video;
  }

  if (period.textStreams.length)
    activeStreams[ContentType.TEXT] = period.textStreams[0];

  var ret = jasmine.createSpyObj('fakeStreamingEngine', [
    'destroy', 'configure', 'init', 'getCurrentPeriod', 'getActiveStreams',
    'notifyNewTextStream', 'switch', 'seeked'
  ]);
  ret.destroy.and.callFake(resolve);
  ret.getCurrentPeriod.and.returnValue(period);
  ret.getActiveStreams.and.returnValue(activeStreams);
  ret.notifyNewTextStream.and.callFake(resolve);
  ret.switch.and.callFake(function(type, stream) {
    activeStreams[type] = stream;
  });
  return ret;
};


/** @type {jasmine.Spy} */
shaka.test.FakeStreamingEngine.prototype.init;



/**
 * Creates a fake manifest parser.
 *
 * @constructor
 * @param {shakaExtern.Manifest} manifest
 * @struct
 * @implements {shakaExtern.ManifestParser}
 */
shaka.test.FakeManifestParser = function(manifest) {
  /** @private {shakaExtern.Manifest} */
  this.manifest_ = manifest;

  spyOn(this, 'start').and.callThrough();
  spyOn(this, 'stop').and.callThrough();
  spyOn(this, 'configure');
  spyOn(this, 'update');
};


/** @override */
shaka.test.FakeManifestParser.prototype.start = function() {
  return Promise.resolve(this.manifest_);
};


/** @override */
shaka.test.FakeManifestParser.prototype.stop = function() {
  return Promise.resolve();
};


/** @override */
shaka.test.FakeManifestParser.prototype.update = function() {};


/** @override */
shaka.test.FakeManifestParser.prototype.onExpirationUpdated = function() {};


/** @override */
shaka.test.FakeManifestParser.prototype.configure = function() {};



/**
 * Creates a fake video element.
 * @param {number=} opt_currentTime
 *
 * @constructor
 * @struct
 * @extends {HTMLVideoElement}
 * @return {!Object}
 */
shaka.test.FakeVideo = function(opt_currentTime) {
  var video = {
    currentTime: opt_currentTime || 0,
    readyState: 0,
    playbackRate: 1,
    volume: 1,
    muted: false,
    loop: false,
    autoplay: false,
    paused: false,
    buffered: null,
    src: '',
    textTracks: [],

    addTextTrack: jasmine.createSpy('addTextTrack'),
    setMediaKeys: jasmine.createSpy('createMediaKeys'),
    addEventListener: jasmine.createSpy('addEventListener'),
    removeEventListener: jasmine.createSpy('removeEventListener'),
    removeAttribute: jasmine.createSpy('removeAttribute'),
    load: jasmine.createSpy('load'),
    play: jasmine.createSpy('play'),
    pause: jasmine.createSpy('pause'),
    dispatchEvent: jasmine.createSpy('dispatchEvent'),

    on: {}  // event listeners
  };
  video.setMediaKeys.and.returnValue(Promise.resolve());
  video.addTextTrack.and.callFake(function(kind, id) {
    // TODO: mock TextTrack, if/when Player starts directly accessing it.
    var track = {};
    video.textTracks.push(track);
    return track;
  });
  video.addEventListener.and.callFake(function(name, callback) {
    video.on[name] = callback;
  });

  return video;
};


/** @const {!Object.<string, !Function>} */
shaka.test.FakeVideo.prototype.on;


/**
 * Creates a fake buffered ranges object.
 *
 * @param {!Array.<{start: number, end: number}>} ranges
 * @return {!TimeRanges}
 */
function createFakeBuffered(ranges) {
  return /** @type {!TimeRanges} */({
    length: ranges.length,
    start: function(i) {
      if (i >= 0 && i < ranges.length) return ranges[i].start;
      throw new Error('Unexpected index');
    },
    end: function(i) {
      if (i >= 0 && i < ranges.length) return ranges[i].end;
      throw new Error('Unexpected index');
    }
  });
}



/**
 * Creates a fake PresentationTimeline object.
 *
 * @constructor
 * @struct
 * @extends {shaka.media.PresentationTimeline}
 * @return {!Object}
 */
shaka.test.FakePresentationTimeline = function() {
  var getStart = jasmine.createSpy('getSegmentAvailabilityStart');
  var getSafeStart = jasmine.createSpy('getSafeAvailabilityStart');
  getSafeStart.and.callFake(function(delay) {
    return getStart() + delay;
  });

  return {
    getDuration: jasmine.createSpy('getDuration'),
    setDuration: jasmine.createSpy('setDuration'),
    getPresentationStartTime: jasmine.createSpy('getPresentationStartTime'),
    setClockOffset: jasmine.createSpy('setClockOffset'),
    setStatic: jasmine.createSpy('setStatic'),
    getSegmentAvailabilityDuration:
        jasmine.createSpy('getSegmentAvailabilityDuration'),
    notifySegments: jasmine.createSpy('notifySegments'),
    notifyMaxSegmentDuration: jasmine.createSpy('notifyMaxSegmentDuration'),
    isLive: jasmine.createSpy('isLive'),
    isInProgress: jasmine.createSpy('isInProgress'),
    getSegmentAvailabilityStart: getStart,
    getSafeAvailabilityStart: getSafeStart,
    getSegmentAvailabilityEnd: jasmine.createSpy('getSegmentAvailabilityEnd'),
    getSeekRangeEnd: jasmine.createSpy('getSeekRangeEnd')
  };
};


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getDuration;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.setDuration;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getPresentationStartTime;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.setClockOffset;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.setStatic;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getSegmentAvailabilityDuration;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.notifySegments;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.notifyMaxSegmentDuration;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.isLive;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.isInProgress;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getSegmentAvailabilityStart;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getSafeAvailabilityStart;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getSegmentAvailabilityEnd;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getSeekRangeEnd;



/**
 * Creates a fake Playhead object.
 *
 * @constructor
 * @struct
 * @extends {shaka.media.Playhead}
 * @return {!Object}
 */
shaka.test.FakePlayhead = function() {
  return {
    destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
    setRebufferingGoal: jasmine.createSpy('setRebufferingGoal'),
    setStartTime: jasmine.createSpy('setStartTime'),
    getTime: jasmine.createSpy('getTime').and.returnValue(0),
    setBuffering: jasmine.createSpy('setBuffering'),
    getPlaybackRate: jasmine.createSpy('getPlaybackRate').and.returnValue(1),
    setPlaybackRate: jasmine.createSpy('setPlaybackRate')
  };
};



/**
 * Creates a fake PlayheadObserver object.
 *
 * @constructor
 * @struct
 * @extends {shaka.media.PlayheadObserver}
 * @return {!Object}
 */
shaka.test.FakePlayheadObserver = function() {
  return {
    destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
    seeked: jasmine.createSpy('seeked'),
    setRebufferingGoal: jasmine.createSpy('setRebufferingGoal'),
    addTimelineRegion: jasmine.createSpy('addTimelineRegion')
  };
};


/** @type {jasmine.Spy} */
shaka.test.FakePlayheadObserver.prototype.seeked;


/** @type {jasmine.Spy} */
shaka.test.FakePlayheadObserver.prototype.setRebufferingGoal;


/** @type {jasmine.Spy} */
shaka.test.FakePlayheadObserver.prototype.addTimelineRegion;
