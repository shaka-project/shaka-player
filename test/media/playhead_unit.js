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

describe('Playhead', function() {
  var video;
  var timeline;
  var playhead;

  // Callback to Playhead to simulate 'loadedmetadata' event from |video|.
  var videoOnLoadedMetadata;

  // Callback to Playhead to simulate 'seeking' event from |video|.
  var videoOnSeeking;

  // Callback to Playhead to simulate 'playing' event from |video|.
  var videoOnPlaying;

  // Callback to Playhead to simulate 'ratechange' event from |video|.
  var videoOnRateChange;

  // Callback to us from Playhead when the buffering state changes.
  var onBuffering;

  // Callback to us from Playhead when a valid 'seeking' event occurs.
  var onSeek;

  beforeEach(function() {
    video = createMockVideo();
    timeline = createMockPresentationTimeline();

    videoOnLoadedMetadata = undefined;
    videoOnSeeking = undefined;
    videoOnPlaying = undefined;

    onBuffering = jasmine.createSpy('onBuffering');
    onSeek = jasmine.createSpy('onSeek');

    video.addEventListener.and.callFake(function(eventName, f, bubbles) {
      if (eventName == 'loadedmetadata') {
        videoOnLoadedMetadata = f;
      } else if (eventName == 'seeking') {
        videoOnSeeking = f;
      } else if (eventName == 'playing') {
        videoOnPlaying = f;
      } else if (eventName == 'ratechange') {
        videoOnRateChange = f;
      } else {
        throw new Error('Unexpected event:' + eventName);
      }
    });

    timeline.isLive.and.returnValue(false);
    timeline.getEarliestStart.and.returnValue(5);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);

    // These tests should not cause these methods to be invoked.
    timeline.getSegmentAvailabilityDuration.and.throwError(new Error());
    timeline.getDuration.and.throwError(new Error());
    timeline.setDuration.and.throwError(new Error());
  });

  afterEach(function(done) {
    playhead.destroy().then(done);
    playhead = null;
  });

  describe('getTime', function() {
    it('returns the correct time when readyState starts at 0', function() {
      playhead = new shaka.media.Playhead(
          video,
          timeline,
          10 /* minBufferTime */,
          5 /* startTime */,
          onBuffering, onSeek);

      expect(video.addEventListener).toHaveBeenCalledWith(
          'loadedmetadata', videoOnLoadedMetadata, false);
      expect(video.addEventListener.calls.count()).toBe(2);

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(0);

      video.readyState = HTMLMediaElement.HAVE_METADATA;
      videoOnLoadedMetadata();

      expect(video.addEventListener).toHaveBeenCalledWith(
          'seeking', videoOnSeeking, false);
      expect(video.addEventListener.calls.count()).toBe(3);

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(5);

      video.currentTime = 6;
      expect(playhead.getTime()).toBe(6);

      // getTime() should always clamp the time even if the video element
      // doesn't dispatch 'seeking' events.
      video.currentTime = 120;
      expect(playhead.getTime()).toBe(60);

      video.currentTime = 0;
      expect(playhead.getTime()).toBe(5);
    });

    it('returns the correct time when readyState starts at 1', function() {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      playhead = new shaka.media.Playhead(
          video,
          timeline,
          10 /* minBufferTime */,
          5 /* startTime */,
          onBuffering, onSeek);

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(5);

      video.currentTime = 6;
      expect(playhead.getTime()).toBe(6);
    });
  });

  it('sets/unsets buffering state', function() {
    playhead = new shaka.media.Playhead(
        video,
        timeline,
        10 /* minBufferTime */,
        5 /* startTime */,
        onBuffering, onSeek);

    // Set to 2 to ensure Playhead restores the correct rate.
    video.playbackRate = 2;
    videoOnRateChange();

    playhead.setBuffering(false);
    expect(onBuffering).not.toHaveBeenCalled();
    expect(video.playbackRate).toBe(2);

    playhead.setBuffering(true);
    expect(onBuffering).toHaveBeenCalledWith(true);
    expect(video.playbackRate).toBe(0);

    onBuffering.calls.reset();

    playhead.setBuffering(true);
    expect(onBuffering).not.toHaveBeenCalled();
    expect(video.playbackRate).toBe(0);

    playhead.setBuffering(false);
    expect(onBuffering).toHaveBeenCalledWith(false);
    expect(video.playbackRate).toBe(2);
  });

  it('clamps playhead after seeking for live', function() {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = {
      length: 1,
      start: function(i) {
        if (i == 0) return 25;
        throw new Error('Unexpected index');
      },
      end: function(i) {
        if (i == 0) return 55;
        throw new Error('Unexpected index');
      }
    };

    timeline.isLive.and.returnValue(true);
    timeline.getEarliestStart.and.returnValue(5);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);
    timeline.getSegmentAvailabilityDuration.and.returnValue(30);

    playhead = new shaka.media.Playhead(
        video,
        timeline,
        10 /* rebufferingGoal */,
        5 /* startTime */,
        onBuffering, onSeek);

    // Calling videoOnSeeking() is like dispatching a 'seeking' event. So, each
    // time we change the video's current time or Playhead changes the video's
    // current time we must call videoOnSeeking(),

    videoOnSeeking();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);

    // left = start + 1 = 5 + 1 = 6
    // safe = left + rebufferingGoal = 6 + 10 = 16

    // Seek in safe region & in buffered region.
    video.currentTime = 26;
    videoOnSeeking();
    expect(video.currentTime).toBe(26);
    expect(playhead.getTime()).toBe(26);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek in safe region & in unbuffered region.
    video.currentTime = 24;
    videoOnSeeking();
    expect(video.currentTime).toBe(24);
    expect(playhead.getTime()).toBe(24);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before left (treated like seek before start even though in buffered
    // region).
    video.currentTime = 5.5;
    videoOnSeeking();
    expect(video.currentTime).toBe(18);
    expect(playhead.getTime()).toBe(18);
    expect(onSeek).not.toHaveBeenCalled();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();

    video.buffered = {
      length: 1,
      start: function(i) {
        if (i == 0) return 10;
        throw new Error('Unexpected index');
      },
      end: function(i) {
        if (i == 0) return 40;
        throw new Error('Unexpected index');
      }
    };

    // Seek outside safe region & in buffered region.
    video.currentTime = 15;
    videoOnSeeking();
    expect(video.currentTime).toBe(15);
    expect(playhead.getTime()).toBe(15);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek outside safe region & in unbuffered region.
    video.currentTime = 9;
    videoOnSeeking();
    expect(video.currentTime).toBe(18);
    expect(playhead.getTime()).toBe(18);
    expect(onSeek).not.toHaveBeenCalled();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek past end.
    video.currentTime = 120;
    videoOnSeeking();
    expect(video.currentTime).toBe(60);
    expect(playhead.getTime()).toBe(60);
    expect(onSeek).not.toHaveBeenCalled();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before start.
    video.currentTime = 1;
    videoOnSeeking();
    expect(video.currentTime).toBe(18);
    expect(playhead.getTime()).toBe(18);
    expect(onSeek).not.toHaveBeenCalled();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek with end < safe (note: safe == 16).
    timeline.getSegmentAvailabilityEnd.and.returnValue(12);

    // Seek before start
    video.currentTime = 4;
    videoOnSeeking();
    expect(video.currentTime).toBe(12);
    expect(playhead.getTime()).toBe(12);
    expect(onSeek).not.toHaveBeenCalled();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek in window.
    video.currentTime = 8;
    videoOnSeeking();
    expect(video.currentTime).toBe(8);
    expect(playhead.getTime()).toBe(8);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek past end.
    video.currentTime = 13;
    videoOnSeeking();
    expect(video.currentTime).toBe(12);
    expect(playhead.getTime()).toBe(12);
    expect(onSeek).not.toHaveBeenCalled();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();
  });

  it('clamps playhead after seeking for VOD', function() {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = {
      length: 1,
      start: function(i) {
        if (i == 0) return 25;
        throw new Error('Unexpected index');
      },
      end: function(i) {
        if (i == 0) return 55;
        throw new Error('Unexpected index');
      }
    };

    timeline.isLive.and.returnValue(false);
    timeline.getEarliestStart.and.returnValue(5);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);
    timeline.getSegmentAvailabilityDuration.and.returnValue(null);

    playhead = new shaka.media.Playhead(
        video,
        timeline,
        10 /* rebufferingGoal */,
        5 /* startTime */,
        onBuffering, onSeek);

    videoOnSeeking();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);

    // Seek past end.
    video.currentTime = 120;
    videoOnSeeking();
    expect(video.currentTime).toBe(60);
    expect(playhead.getTime()).toBe(60);
    expect(onSeek).not.toHaveBeenCalled();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before start.
    video.currentTime = 1;
    videoOnSeeking();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);
    expect(onSeek).not.toHaveBeenCalled();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();
  });

  it('clamps playhead after resuming', function() {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = {
      length: 1,
      start: function(i) {
        if (i == 0) return 5;
        throw new Error('Unexpected index');
      },
      end: function(i) {
        if (i == 0) return 35;
        throw new Error('Unexpected index');
      }
    };

    // Live case:
    timeline.isLive.and.returnValue(true);
    timeline.getEarliestStart.and.returnValue(5);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);
    timeline.getSegmentAvailabilityDuration.and.returnValue(30);

    playhead = new shaka.media.Playhead(
        video,
        timeline,
        10 /* rebufferingGoal */,
        5 /* startTime */,
        onBuffering, onSeek);

    videoOnSeeking();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);

    // Simulate pausing.
    timeline.getEarliestStart.and.returnValue(10);
    timeline.getSegmentAvailabilityStart.and.returnValue(10);
    timeline.getSegmentAvailabilityEnd.and.returnValue(70);
    timeline.getSegmentAvailabilityDuration.and.returnValue(30);

    // left = start + 1 = 10 + 1 = 11
    // safe = left + rebufferingGoal = 11 + 10 = 21

    // The playhead should move to 23 (safe + 2) after resuming, which will
    // cause a 'seeking' event.
    videoOnPlaying();
    expect(video.currentTime).toBe(23);
    videoOnSeeking();
    expect(playhead.getTime()).toBe(23);
    expect(onSeek).toHaveBeenCalled();

    // VOD case:
    timeline.isLive.and.returnValue(false);
    timeline.getEarliestStart.and.returnValue(5);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);
    timeline.getSegmentAvailabilityDuration.and.returnValue(30);

    playhead = new shaka.media.Playhead(
        video,
        timeline,
        10 /* rebufferingGoal */,
        5 /* startTime */,
        onBuffering, onSeek);

    // Simulate pausing.
    timeline.getEarliestStart.and.returnValue(10);
    timeline.getSegmentAvailabilityStart.and.returnValue(10);
    timeline.getSegmentAvailabilityEnd.and.returnValue(70);
    timeline.getSegmentAvailabilityDuration.and.returnValue(30);

    videoOnPlaying();
    expect(video.currentTime).toBe(10);
    videoOnSeeking();
    expect(playhead.getTime()).toBe(10);
    expect(onSeek).toHaveBeenCalled();
  });

  describe('enters/leaves buffering state', function() {
    it('enters buffering state when out of buffered content', function(done) {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      video.buffered = {
        length: 1,
        start: function(i) {
          if (i == 0) return 5;
          throw new Error('Unexpected index');
        },
        end: function(i) {
          if (i == 0) return 10;
          throw new Error('Unexpected index');
        }
      };

      video.duration = 20;

      playhead = new shaka.media.Playhead(
          video,
          timeline,
          10 /* rebufferingGoal */,
          5 /* startTime */,
          onBuffering, onSeek);

      videoOnSeeking();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      video.currentTime = 11;

      onBuffering.and.callFake(function(buffering) {
        expect(buffering).toEqual(true);
        done();
      });
    });

    it('does not enter buffering state when has buffered content',
        function(done) {
          video.readyState = HTMLMediaElement.HAVE_METADATA;

          video.buffered = {
            length: 1,
            start: function(i) {
              if (i == 0) return 5;
              throw new Error('Unexpected index');
            },
            end: function(i) {
              if (i == 0) return 10;
              throw new Error('Unexpected index');
            }
          };

          video.duration = 20;

         playhead = new shaka.media.Playhead(
              video,
              timeline,
              10 /* rebufferingGoal */,
              5 /* startTime */,
              onBuffering, onSeek);

          videoOnSeeking();
          expect(video.currentTime).toBe(5);
          expect(playhead.getTime()).toBe(5);

          // wait for the buffer checking event to fire
          shaka.test.Util.delay(0.5).then(function() {
            expect(onBuffering).not.toHaveBeenCalled();
            done();
          });
        });

    it('leaves buffering state if content got buffered', function(done) {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      video.buffered = {
        length: 1,
        start: function(i) {
          if (i == 0) return 5;
          throw new Error('Unexpected index');
        },
        end: function(i) {
          if (i == 0) return 10;
          throw new Error('Unexpected index');
        }
      };

      video.duration = 20;

      playhead = new shaka.media.Playhead(
          video,
          timeline,
          10 /* rebufferingGoal */,
          5 /* startTime */,
          onBuffering, onSeek);

      videoOnSeeking();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      video.currentTime = 11;

      onBuffering.and.callFake(function(buffering) {
        expect(buffering).toEqual(true);

        video.buffered = {
          length: 1,
          start: function(i) {
            if (i == 0) return 10;
            throw new Error('Unexpected index');
          },
          end: function(i) {
            if (i == 0) return 25;
            throw new Error('Unexpected index');
          }
        };

        onBuffering.and.callFake(function(buffering) {
          expect(buffering).toEqual(false);
          done();
        });
      });
    });
  });

  function createMockVideo() {
    return {
      currentTime: 0,
      readyState: 0,
      playbackRate: 1,
      buffered: null,
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
      dispatchEvent: jasmine.createSpy('dispatchEvent')
    };
  }

  function createMockPresentationTimeline() {
    return {
      getDuration: jasmine.createSpy('getDuration'),
      setDuration: jasmine.createSpy('setDuration'),
      getSegmentAvailabilityDuration:
          jasmine.createSpy('getSegmentAvailabilityDuration'),
      isLive: jasmine.createSpy('isLive'),
      getEarliestStart: jasmine.createSpy('getEarliestStart'),
      getSegmentAvailabilityStart:
          jasmine.createSpy('getSegmentAvailabilityStart'),
      getSegmentAvailabilityEnd:
          jasmine.createSpy('getSegmentAvailabilityEnd')
    };
  }
});

