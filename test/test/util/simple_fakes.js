/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.FakeAbrManager');
goog.provide('shaka.test.FakeClosedCaptionParser');
goog.provide('shaka.test.FakeManifestParser');
goog.provide('shaka.test.FakePlayhead');
goog.provide('shaka.test.FakePlayheadObserver');
goog.provide('shaka.test.FakePresentationTimeline');
goog.provide('shaka.test.FakeSegmentIndex');
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
 * @summary A fake AbrManager.
 * @extends {shaka.abr.SimpleAbrManager}
 */
shaka.test.FakeAbrManager = class {
  constructor() {
    /** @type {number} */
    this.chooseIndex = 0;

    /** @type {!Array.<shaka.extern.Variant>} */
    this.variants = [];

    /** @type {shaka.extern.AbrManager.SwitchCallback} */
    this.switchCallback = null;

    /** @type {!jasmine.Spy} */
    this.init = jasmine.createSpy('init').and.callFake((switchCallback) => {
      this.switchCallback = switchCallback;
    });

    /** @type {!jasmine.Spy} */
    this.stop = jasmine.createSpy('stop');

    /** @type {!jasmine.Spy} */
    this.enable = jasmine.createSpy('enable');

    /** @type {!jasmine.Spy} */
    this.disable = jasmine.createSpy('disable');

    /** @type {!jasmine.Spy} */
    this.segmentDownloaded = jasmine.createSpy('segmentDownloaded');

    /** @type {!jasmine.Spy} */
    this.getBandwidthEstimate = jasmine.createSpy('getBandwidthEstimate');

    /** @type {!jasmine.Spy} */
    this.chooseVariant = jasmine.createSpy('chooseVariant').and.callFake(() => {
      return this.variants[this.chooseIndex];
    });

    /** @type {!jasmine.Spy} */
    this.setVariants = jasmine.createSpy('setVariants').and.callFake((arg) => {
      this.variants = arg;
    });

    /** @type {!jasmine.Spy} */
    this.configure = jasmine.createSpy('configure');
  }
};

/** @extends {shaka.media.StreamingEngine} */
shaka.test.FakeStreamingEngine = class {
  /**
   * @param {function():shaka.media.StreamingEngine.ChosenStreams}
   *     onChooseStreams
   * @param {function()} onCanSwitch
   */
  constructor(onChooseStreams, onCanSwitch) {
    const resolve = () => Promise.resolve();

    let activeAudio = null;
    let activeVideo = null;
    let activeText = null;

    /** @type {function()} */
    this.onChooseStreams = onChooseStreams;

    /** @type {function()} */
    this.onCanSwitch = onCanSwitch;

    /** @type {!jasmine.Spy} */
    this.destroy = jasmine.createSpy('destroy').and.callFake(resolve);

    /** @type {!jasmine.Spy} */
    this.configure = jasmine.createSpy('configure');

    /** @type {!jasmine.Spy} */
    this.seeked = jasmine.createSpy('seeked');

    /** @type {!jasmine.Spy} */
    this.getBufferingPeriod =
        jasmine.createSpy('getBufferingPeriod').and.returnValue(null);

    /** @type {!jasmine.Spy} */
    this.getBufferingAudio =
        jasmine.createSpy('getBufferingAudio').and.callFake(() => activeAudio);

    /** @type {!jasmine.Spy} */
    this.getBufferingVideo =
        jasmine.createSpy('getBufferingVideo').and.callFake(() => activeVideo);

    this.getBufferingText =
        jasmine.createSpy('getBufferingText').and.callFake(() => activeText);

    /** @type {!jasmine.Spy} */
    this.loadNewTextStream =
        jasmine.createSpy('loadNewTextStream').and.callFake((stream) => {
          activeText = stream;
          return Promise.resolve();
        });

    /** @type {!jasmine.Spy} */
    this.unloadTextStream =
        jasmine.createSpy('unloadTextStream').and.callFake(() => {
          activeText = null;
        });

    /** @type {!jasmine.Spy} */
    this.start = jasmine.createSpy('start').and.callFake(async () => {
      const chosen = onChooseStreams();
      await Promise.resolve();
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

    /** @type {!jasmine.Spy} */
    this.switchVariant =
        jasmine.createSpy('switchVariant').and.callFake((variant) => {
          activeAudio = variant.audio || activeAudio;
          activeVideo = variant.video || activeVideo;
        });

    /** @type {!jasmine.Spy} */
    this.switchTextStream =
        jasmine.createSpy('switchTextStream').and.callFake((textStream) => {
          activeText = textStream;
        });
  }
};

/** @extends {shaka.extern.ManifestParser} */
shaka.test.FakeManifestParser = class {
  /** @param {shaka.extern.Manifest} manifest */
  constructor(manifest) {
    /** @type {shaka.extern.ManifestParser.PlayerInterface} */
    this.playerInterface = null;

    /** @type {!jasmine.Spy} */
    this.start = jasmine.createSpy('start').and.callFake(
        async (manifestUri, playerInterface) => {
          this.playerInterface = playerInterface;
          await Promise.resolve();
          return manifest;
        });

    /** @type {!jasmine.Spy} */
    this.stop = jasmine.createSpy('stop').and.returnValue(Promise.resolve());

    /** @type {!jasmine.Spy} */
    this.configure = jasmine.createSpy('configure');

    /** @type {!jasmine.Spy} */
    this.update = jasmine.createSpy('update');

    /** @type {!jasmine.Spy} */
    this.onExpirationUpdated = jasmine.createSpy('onExpirationUpdated');
  }
};

/** @extends {HTMLVideoElement} */
shaka.test.FakeVideo = class {
  /** @param {number=} currentTime */
  constructor(currentTime) {
    /** @const {!Object.<string, !Function>} */
    this.on = {};  // event listeners
    /** @type {!Array.<!TextTrack>} */
    this.textTracks = [];

    this.currentTime = currentTime || 0;
    this.readyState = 0;
    this.playbackRate = 1;
    this.volume = 1;
    this.muted = false;
    this.loop = false;
    this.autoplay = false;
    this.paused = false;
    this.buffered = null;
    this.src = '';
    this.offsetWidth = 1000;
    this.offsetHeight = 1000;

    /** @type {!jasmine.Spy} */
    this.addTextTrack =
        jasmine.createSpy('addTextTrack').and.callFake((kind, id) => {
          const track = new shaka.test.FakeTextTrack();
          this.textTracks.push(track);
          return track;
        });

    /** @type {!jasmine.Spy} */
    this.setMediaKeys =
        jasmine.createSpy('createMediaKeys').and.returnValue(Promise.resolve());

    /** @type {!jasmine.Spy} */
    this.addEventListener =
        jasmine.createSpy('addEventListener').and.callFake((name, callback) => {
          this.on[name] = callback;
        });

    /** @type {!jasmine.Spy} */
    this.removeEventListener = jasmine.createSpy('removeEventListener');

    /** @type {!jasmine.Spy} */
    this.removeAttribute = jasmine.createSpy('removeAttribute');

    /** @type {!jasmine.Spy} */
    this.load = jasmine.createSpy('load');

    /** @type {!jasmine.Spy} */
    this.play = jasmine.createSpy('play');

    /** @type {!jasmine.Spy} */
    this.pause = jasmine.createSpy('pause');

    /** @type {!jasmine.Spy} */
    this.dispatchEvent = jasmine.createSpy('dispatchEvent');
  }
};

/**
 * Creates a fake buffered ranges object.
 *
 * @param {!Array.<{start: number, end: number}>} ranges
 * @return {!TimeRanges}
 */
function createFakeBuffered(ranges) {
  return /** @type {!TimeRanges} */ ({
    length: ranges.length,
    start: (i) => {
      if (i >= 0 && i < ranges.length) {
        return ranges[i].start;
      }
      throw new Error('Unexpected index');
    },
    end: (i) => {
      if (i >= 0 && i < ranges.length) {
        return ranges[i].end;
      }
      throw new Error('Unexpected index');
    },
  });
}

/** @extends {shaka.media.PresentationTimeline} */
shaka.test.FakePresentationTimeline = class {
  constructor() {
    const getStart = jasmine.createSpy('getSeekRangeStart');
    const getEnd = jasmine.createSpy('getSeekRangeEnd');
    const getSafeStart = jasmine.createSpy('getSafeSeekRangeStart');
    getSafeStart.and.callFake((delay) => {
      const end = shaka.test.Util.invokeSpy(getEnd);
      return Math.min(shaka.test.Util.invokeSpy(getStart) + delay, end);
    });

    /** @type {!jasmine.Spy} */
    this.getDuration = jasmine.createSpy('getDuration');

    /** @type {!jasmine.Spy} */
    this.setDuration = jasmine.createSpy('setDuration');

    /** @type {!jasmine.Spy} */
    this.getDelay = jasmine.createSpy('getDelay');

    /** @type {!jasmine.Spy} */
    this.setDelay = jasmine.createSpy('setDelay');

    /** @type {!jasmine.Spy} */
    this.getPresentationStartTime =
        jasmine.createSpy('getPresentationStartTime');

    /** @type {!jasmine.Spy} */
    this.setClockOffset = jasmine.createSpy('setClockOffset');

    /** @type {!jasmine.Spy} */
    this.setStatic = jasmine.createSpy('setStatic');

    /** @type {!jasmine.Spy} */
    this.notifySegments = jasmine.createSpy('notifySegments');

    /** @type {!jasmine.Spy} */
    this.notifyMaxSegmentDuration =
        jasmine.createSpy('notifyMaxSegmentDuration');

    /** @type {!jasmine.Spy} */
    this.isLive = jasmine.createSpy('isLive');

    /** @type {!jasmine.Spy} */
    this.isInProgress = jasmine.createSpy('isInProgress');

    /** @type {!jasmine.Spy} */
    this.getSegmentAvailabilityStart =
        jasmine.createSpy('getSegmentAvailabilityStart');

    /** @type {!jasmine.Spy} */
    this.getSegmentAvailabilityEnd =
        jasmine.createSpy('getSegmentAvailabilityEnd');

    /** @type {!jasmine.Spy} */
    this.getSeekRangeStart = getStart;

    /** @type {!jasmine.Spy} */
    this.getSafeSeekRangeStart = getSafeStart;

    /** @type {!jasmine.Spy} */
    this.getSeekRangeEnd = getEnd;
  }
};

/** @extends {shaka.media.Playhead} */
shaka.test.FakePlayhead = class {
  constructor() {
    /** @type {!jasmine.Spy} */
    this.release = jasmine.createSpy('release');

    /** @type {!jasmine.Spy} */
    this.setRebufferingGoal = jasmine.createSpy('setRebufferingGoal');

    /** @type {!jasmine.Spy} */
    this.setStartTime = jasmine.createSpy('setStartTime');

    /** @type {!jasmine.Spy} */
    this.getTime = jasmine.createSpy('getTime').and.returnValue(0);

    /** @type {!jasmine.Spy} */
    this.setBuffering = jasmine.createSpy('setBuffering');

    /** @type {!jasmine.Spy} */
    this.getPlaybackRate =
        jasmine.createSpy('getPlaybackRate').and.returnValue(1);

    /** @type {!jasmine.Spy} */
    this.setPlaybackRate = jasmine.createSpy('setPlaybackRate');
  }
};

/** @extends {TextTrack} */
shaka.test.FakeTextTrack = class {
  constructor() {
    /** @type {!Array.<TextTrackCue>} */
    this.cues = [];

    /** @type {!jasmine.Spy} */
    this.addCue = jasmine.createSpy('addCue').and.callFake((cue) => {
      this.cues.push(cue);
    });

    /** @type {!jasmine.Spy} */
    this.removeCue = jasmine.createSpy('removeCue').and.callFake((cue) => {
      const idx = this.cues.indexOf(cue);
      expect(idx).not.toBeLessThan(0);
      this.cues.splice(idx, 1);
    });
  }
};

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
    return shaka.test.Util.invokeSpy(this.initSpy);
  }

  /** @override */
  parseFrom(data, onCaptions) {
    return shaka.test.Util.invokeSpy(this.parseFromSpy, data, onCaptions);
  }

  /** @override */
  reset() {
    return shaka.test.Util.invokeSpy(this.resetSpy);
  }
};


/** @extends {shaka.media.SegmentIndex} */
shaka.test.FakeSegmentIndex = class {
  constructor() {
    /** @type {!jasmine.Spy} */
    this.destroy =
        jasmine.createSpy('destroy').and.returnValue(Promise.resolve());

    /** @type {!jasmine.Spy} */
    this.find = jasmine.createSpy('find').and.returnValue(null);

    /** @type {!jasmine.Spy} */
    this.get = jasmine.createSpy('get').and.returnValue(null);

    /** @type {!jasmine.Spy} */
    this.offset = jasmine.createSpy('offset');

    /** @type {!jasmine.Spy} */
    this.merge = jasmine.createSpy('merge');

    /** @type {!jasmine.Spy} */
    this.replace = jasmine.createSpy('replace');

    /** @type {!jasmine.Spy} */
    this.evict = jasmine.createSpy('evict');

    /** @type {!jasmine.Spy} */
    this.fit = jasmine.createSpy('fit');

    /** @type {!jasmine.Spy} */
    this.updateEvery = jasmine.createSpy('updateEvery');
  }
};

/** @extends {shaka.media.Transmuxer} */
shaka.test.FakeTransmuxer = class {
  constructor() {
    const output = {
      data: new Uint8Array(),
      captions: [],
    };

    /** @type {!jasmine.Spy} */
    this.destroy =
        jasmine.createSpy('destroy').and.returnValue(Promise.resolve());

    /** @type {!jasmine.Spy} */
    this.transmux =
        jasmine.createSpy('transmux').and.returnValue(Promise.resolve(output));
  }
};
