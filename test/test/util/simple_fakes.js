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
goog.provide('shaka.test.FakeClosedCaptionParser');
goog.provide('shaka.test.FakeManifestParser');
goog.provide('shaka.test.FakePlayhead');
goog.provide('shaka.test.FakePlayheadObserver');
goog.provide('shaka.test.FakePresentationTimeline');
goog.provide('shaka.test.FakeStreamingEngine');
goog.provide('shaka.test.FakeTextTrack');
goog.provide('shaka.test.FakeTransmuxer');
goog.provide('shaka.test.FakeVideo');

/**
 * @fileoverview Defines simple mocks for library types.
 * @suppress {checkTypes} Suppress errors about missmatches between the
 *   definition and the interface.  This allows us to have the members be
 *   |jasmine.Spy|.  BE CAREFUL IN THIS FILE.
 */


/**
 * A fake AbrManager.
 *
 * @constructor
 * @struct
 * @extends {shaka.abr.SimpleAbrManager}
 * @return {!Object}
 */
shaka.test.FakeAbrManager = function() {
  let ret = jasmine.createSpyObj('FakeAbrManager', [
    'stop', 'init', 'enable', 'disable', 'segmentDownloaded',
    'getBandwidthEstimate', 'chooseVariant', 'setVariants', 'configure',
  ]);

  ret.variants = [];

  ret.chooseIndex = 0;

  ret.init.and.callFake(function(switchCallback) {
    ret.switchCallback = switchCallback;
  });
  ret.setVariants.and.callFake(function(arg) { ret.variants = arg; });
  ret.chooseVariant.and.callFake(function() {
    return ret.variants[ret.chooseIndex];
  });

  return ret;
};


/** @type {number} */
shaka.test.FakeAbrManager.prototype.chooseIndex;


/** @type {!Array.<shaka.extern.Variant>} */
shaka.test.FakeAbrManager.prototype.variants;


/** @type {shaka.extern.AbrManager.SwitchCallback} */
shaka.test.FakeAbrManager.prototype.switchCallback;


/** @type {!jasmine.Spy} */
shaka.test.FakeAbrManager.prototype.stop;


/** @type {!jasmine.Spy} */
shaka.test.FakeAbrManager.prototype.init;


/** @type {!jasmine.Spy} */
shaka.test.FakeAbrManager.prototype.enable;


/** @type {!jasmine.Spy} */
shaka.test.FakeAbrManager.prototype.disable;


/** @type {!jasmine.Spy} */
shaka.test.FakeAbrManager.prototype.segmentDownloaded;


/** @type {!jasmine.Spy} */
shaka.test.FakeAbrManager.prototype.getBandwidthEstimate;


/** @type {!jasmine.Spy} */
shaka.test.FakeAbrManager.prototype.chooseVariant;


/** @type {!jasmine.Spy} */
shaka.test.FakeAbrManager.prototype.setVariants;


/** @type {!jasmine.Spy} */
shaka.test.FakeAbrManager.prototype.configure;


/**
 * A fake StreamingEngine.
 *
 * @constructor
 * @struct
 * @extends {shaka.media.StreamingEngine}
 * @param {function():shaka.media.StreamingEngine.ChosenStreams} onChooseStreams
 * @param {function()} onCanSwitch
 * @return {!Object}
 */
shaka.test.FakeStreamingEngine = function(onChooseStreams, onCanSwitch) {
  let resolve = Promise.resolve.bind(Promise);

  let activeAudio = null;
  let activeVideo = null;
  let activeText = null;

  let ret = jasmine.createSpyObj('fakeStreamingEngine', [
    'destroy', 'configure', 'start', 'getBufferingPeriod',
    'getBufferingAudio', 'getBufferingVideo', 'getBufferingText',
    'loadNewTextStream', 'switchVariant', 'switchTextStream', 'seeked',
    'unloadTextStream',
  ]);
  ret.destroy.and.callFake(resolve);
  ret.getBufferingPeriod.and.returnValue(null);
  ret.getBufferingAudio.and.callFake(function() { return activeAudio; });
  ret.getBufferingVideo.and.callFake(function() { return activeVideo; });
  ret.getBufferingText.and.callFake(function() { return activeText; });
  ret.loadNewTextStream.and.callFake(function(stream) {
    activeText = stream;
    return Promise.resolve();
  });
  ret.unloadTextStream.and.callFake(function() {
    activeText = null;
  });
  ret.start.and.callFake(function() {
    let chosen = onChooseStreams();
    return Promise.resolve().then(function() {
      if (chosen.variant && chosen.variant.audio) {
        activeAudio = chosen.variant.audio;
      }
      if (chosen.variant && chosen.variant.video) {
        activeVideo = chosen.variant.video;
      }
      if (chosen.text) {
        activeText = chosen.text;
      }
    });
  });
  ret.switchVariant.and.callFake(function(variant) {
    activeAudio = variant.audio || activeAudio;
    activeVideo = variant.video || activeVideo;
  });
  ret.switchTextStream.and.callFake(function(textStream) {
    activeText = textStream;
  });
  ret.onChooseStreams = onChooseStreams;
  ret.onCanSwitch = onCanSwitch;
  return ret;
};


/** @type {jasmine.Spy} */
shaka.test.FakeStreamingEngine.prototype.start;


/** @type {jasmine.Spy} */
shaka.test.FakeStreamingEngine.prototype.switchVariant;


/** @type {jasmine.Spy} */
shaka.test.FakeStreamingEngine.prototype.switchTextStream;


/** @type {function()} */
shaka.test.FakeStreamingEngine.prototype.onChooseStreams;


/** @type {function()} */
shaka.test.FakeStreamingEngine.prototype.onCanSwitch;


/**
 * Creates a fake manifest parser.
 *
 * @constructor
 * @param {shaka.extern.Manifest} manifest
 * @struct
 * @implements {shaka.extern.ManifestParser}
 * @return {!Object}
 */
shaka.test.FakeManifestParser = function(manifest) {
  let ret = jasmine.createSpyObj('FakeManifestParser', [
    'start', 'stop', 'configure', 'update', 'onExpirationUpdated',
  ]);
  ret.start.and.callFake(function(manifestUri, playerInterface) {
    ret.playerInterface = playerInterface;
    return Promise.resolve().then(function() {
      return manifest;
    });
  });
  ret.stop.and.returnValue(Promise.resolve());
  return ret;
};


/** @type {!jasmine.Spy} */
shaka.test.FakeManifestParser.prototype.start;


/** @type {!jasmine.Spy} */
shaka.test.FakeManifestParser.prototype.stop;


/** @type {!jasmine.Spy} */
shaka.test.FakeManifestParser.prototype.update;


/** @type {!jasmine.Spy} */
shaka.test.FakeManifestParser.prototype.onExpirationUpdated;


/** @type {!jasmine.Spy} */
shaka.test.FakeManifestParser.prototype.configure;


/** @type {shaka.extern.ManifestParser.PlayerInterface} */
shaka.test.FakeManifestParser.prototype.playerInterface;


/**
 * Creates a fake video element.
 * @param {number=} currentTime
 *
 * @constructor
 * @struct
 * @extends {HTMLVideoElement}
 * @return {!Object}
 */
shaka.test.FakeVideo = function(currentTime) {
  let video = {
    currentTime: currentTime || 0,
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
    offsetWidth: 1000,
    offsetHeight: 1000,

    addTextTrack: jasmine.createSpy('addTextTrack'),
    setMediaKeys: jasmine.createSpy('createMediaKeys'),
    addEventListener: jasmine.createSpy('addEventListener'),
    removeEventListener: jasmine.createSpy('removeEventListener'),
    removeAttribute: jasmine.createSpy('removeAttribute'),
    load: jasmine.createSpy('load'),
    play: jasmine.createSpy('play'),
    pause: jasmine.createSpy('pause'),
    dispatchEvent: jasmine.createSpy('dispatchEvent'),

    on: {},  // event listeners
  };
  video.setMediaKeys.and.returnValue(Promise.resolve());
  video.addTextTrack.and.callFake(function(kind, id) {
    let track = new shaka.test.FakeTextTrack();
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


/** @type {!jasmine.Spy} */
shaka.test.FakeVideo.prototype.play;


/** @type {!jasmine.Spy} */
shaka.test.FakeVideo.prototype.setMediaKeys;


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
    },
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
  let getStart = jasmine.createSpy('getSeekRangeStart');
  let getEnd = jasmine.createSpy('getSeekRangeEnd');
  let getSafeStart = jasmine.createSpy('getSafeSeekRangeStart');
  getSafeStart.and.callFake(function(delay) {
    let end = shaka.test.Util.invokeSpy(getEnd);
    return Math.min(shaka.test.Util.invokeSpy(getStart) + delay, end);
  });

  return {
    getDuration: jasmine.createSpy('getDuration'),
    setDuration: jasmine.createSpy('setDuration'),
    getDelay: jasmine.createSpy('getDelay'),
    setDelay: jasmine.createSpy('setDelay'),
    getPresentationStartTime: jasmine.createSpy('getPresentationStartTime'),
    setClockOffset: jasmine.createSpy('setClockOffset'),
    setStatic: jasmine.createSpy('setStatic'),
    notifySegments: jasmine.createSpy('notifySegments'),
    notifyMaxSegmentDuration: jasmine.createSpy('notifyMaxSegmentDuration'),
    isLive: jasmine.createSpy('isLive'),
    isInProgress: jasmine.createSpy('isInProgress'),
    getSegmentAvailabilityStart:
        jasmine.createSpy('getSegmentAvailabilityStart'),
    getSegmentAvailabilityEnd: jasmine.createSpy('getSegmentAvailabilityEnd'),
    getSeekRangeStart: getStart,
    getSafeSeekRangeStart: getSafeStart,
    getSeekRangeEnd: getEnd,
  };
};


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getDuration;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.setDuration;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getDelay;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.setDelay;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getPresentationStartTime;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.setClockOffset;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.setStatic;


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
shaka.test.FakePresentationTimeline.prototype.getSegmentAvailabilityEnd;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getSafeSeekRangeStart;


/** @type {jasmine.Spy} */
shaka.test.FakePresentationTimeline.prototype.getSeekRangeStart;


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
    release: jasmine.createSpy('release'),
    setRebufferingGoal: jasmine.createSpy('setRebufferingGoal'),
    setStartTime: jasmine.createSpy('setStartTime'),
    getTime: jasmine.createSpy('getTime').and.returnValue(0),
    setBuffering: jasmine.createSpy('setBuffering'),
    getPlaybackRate: jasmine.createSpy('getPlaybackRate').and.returnValue(1),
    setPlaybackRate: jasmine.createSpy('setPlaybackRate'),
  };
};


/** @type {!jasmine.Spy} */
shaka.test.FakePlayhead.prototype.release;


/** @type {!jasmine.Spy} */
shaka.test.FakePlayhead.prototype.setRebufferingGoal;


/** @type {!jasmine.Spy} */
shaka.test.FakePlayhead.prototype.setStartTime;


/** @type {!jasmine.Spy} */
shaka.test.FakePlayhead.prototype.getTime;


/** @type {!jasmine.Spy} */
shaka.test.FakePlayhead.prototype.setBuffering;


/** @type {!jasmine.Spy} */
shaka.test.FakePlayhead.prototype.getPlaybackRate;


/** @type {!jasmine.Spy} */
shaka.test.FakePlayhead.prototype.setPlaybackRate;


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
    addTimelineRegion: jasmine.createSpy('addTimelineRegion'),
  };
};


/** @type {jasmine.Spy} */
shaka.test.FakePlayheadObserver.prototype.seeked;


/** @type {jasmine.Spy} */
shaka.test.FakePlayheadObserver.prototype.setRebufferingGoal;


/** @type {jasmine.Spy} */
shaka.test.FakePlayheadObserver.prototype.addTimelineRegion;


/**
 * Creates a text track.
 *
 * @constructor
 * @struct
 * @extends {TextTrack}
 * @return {!Object}
 */
shaka.test.FakeTextTrack = function() {
  let track = {
    addCue: jasmine.createSpy('addCue'),
    removeCue: jasmine.createSpy('removeCue'),
    cues: [],
  };
  track.addCue.and.callFake(function(cue) {
    track.cues.push(cue);
  });
  track.removeCue.and.callFake(function(cue) {
    let idx = track.cues.indexOf(cue);
    expect(idx).not.toBeLessThan(0);
    track.cues.splice(idx, 1);
  });
  return track;
};


/** @type {!jasmine.Spy} */
shaka.test.FakeTextTrack.prototype.addCue;


/** @type {!jasmine.Spy} */
shaka.test.FakeTextTrack.prototype.removeCue;


/**
 * Create a test-focused closed caption parser that requires the creator to
 * provide behaviours for the underlying spies. If no behaviour is provided all
 * calls to the parser will act as NO-OPs.
 *
 * @implements {shaka.media.IClosedCaptionParser}
 * @final
 */
shaka.test.FakeClosedCaptionParser = class {
  constructor() {
    /** @type {!jasmine.Spy} */
    this.initSpy = jasmine.createSpy('init');
    /** @type {!jasmine.Spy} */
    this.parseFromSpy = jasmine.createSpy('parseFrom');
    /** @type {!jasmine.Spy} */
    this.resetSpy = jasmine.createSpy('reset');
  }

  /** @override */
  init() {
    const func = shaka.test.Util.spyFunc(this.initSpy);
    func();
  }

  /** @override */
  parseFrom(data, onCaptions) {
    const func = shaka.test.Util.spyFunc(this.parseFromSpy);
    func(data, onCaptions);
  }

  /** @override */
  reset() {
    const func = shaka.test.Util.spyFunc(this.resetSpy);
    func();
  }
};


/**
 * Creates a transmuxer.
 *
 * @constructor
 * @struct
 * @extends {shaka.media.Transmuxer}
 * @return {!Object}
 */
shaka.test.FakeTransmuxer = function() {
  let output = {
    data: new Uint8Array(),
    captions: [],
  };
  let transmuxer = {
    destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
    transmux: jasmine.createSpy('transmux').and
        .returnValue(Promise.resolve(output)),
  };
  return transmuxer;
};


/** @type {!jasmine.Spy} */
shaka.test.FakeTransmuxer.prototype.destroy;


/** @type {!jasmine.Spy} */
shaka.test.FakeTransmuxer.prototype.transmux;
