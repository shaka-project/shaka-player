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

describe('Playhead', function() {
  var video;
  var timeline;

  // Callback to Playhead to simulate 'loadedmetadata' event from |video|.
  var videoOnLoadedMetadata;

  // Callback to Playhead to simulate 'seeking' event from |video|.
  var videoOnSeeking;

  // Callback to us from Playhead when the buffering state changes.
  var onBuffering;

  // Callback to us from Playhead when a valid 'seeking' event occurs.
  var onSeek;

  beforeEach(function() {
    video = createMockVideo();
    timeline = createMockPresentationTimeline();

    videoOnLoadedMetadata = undefined;
    videoOnSeeking = undefined;

    onBuffering = jasmine.createSpy('onBuffering');
    onSeek = jasmine.createSpy('onSeek');

    video.addEventListener.and.callFake(function(eventName, f, bubbles) {
      if (eventName == 'loadedmetadata') {
        videoOnLoadedMetadata = f;
      } else if (eventName == 'seeking') {
        videoOnSeeking = f;
      } else {
        throw new Error('Unexpected event:' + eventName);
      }
    });

    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);

    // These tests should not cause these methods to be invoked.
    timeline.getSegmentAvailabilityDuration.and.throwError(new Error());
    timeline.getDuration.and.throwError(new Error());
    timeline.setDuration.and.throwError(new Error());
  });

  describe('getTime', function() {
    it('returns the correct time when readyState starts at 0', function() {
      var playhead = new shaka.media.Playhead(
          video,
          timeline,
          10 /* minBufferTime */,
          5 /* startTime */,
          onBuffering, onSeek);

      expect(video.addEventListener).toHaveBeenCalledWith(
          'loadedmetadata', videoOnLoadedMetadata, false);
      expect(video.addEventListener.calls.count()).toBe(1);

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(0);

      video.readyState = HTMLMediaElement.HAVE_METADATA;
      videoOnLoadedMetadata();

      expect(video.addEventListener).toHaveBeenCalledWith(
          'seeking', videoOnSeeking, false);
      expect(video.addEventListener.calls.count()).toBe(2);

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

      var playhead = new shaka.media.Playhead(
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
    var playhead = new shaka.media.Playhead(
        video,
        timeline,
        10 /* minBufferTime */,
        5 /* startTime */,
        onBuffering, onSeek);

    // Set to 2 to ensure Playhead restores the correct rate.
    video.playbackRate = 2;

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

  it('clamps seeks', function() {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = {
      length: 1,
      start: function(i) {
        if (i == 0) return 5;
        throw new Error('Unexpected index');
      },
      end: function(i) {
        if (i == 0) return 25;
        throw new Error('Unexpected index');
      }
    };

    timeline.getSegmentAvailabilityDuration.and.returnValue(30);

    var onBuffering = jasmine.createSpy('onBuffering');
    var onSeek = jasmine.createSpy('onSeek');
    var playhead = new shaka.media.Playhead(
        video,
        timeline,
        10 /* minBufferTime */,
        5 /* startTime */,
        onBuffering, onSeek);

    expect(playhead.getTime()).toBe(5);
    expect(video.currentTime).toBe(5);

    // Calling videoOnSeeking() is like dispatching a 'seeking' event. So, each
    // time we change the video's current or Playhead changes the video's
    // current time time we must call videoOnSeeking(),

    video.currentTime = 6;
    videoOnSeeking();
    expect(video.currentTime).toBe(6);
    expect(playhead.getTime()).toBe(6);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    video.currentTime = 120;
    videoOnSeeking();
    expect(video.currentTime).toBe(60);
    expect(playhead.getTime()).toBe(60);
    expect(onSeek).not.toHaveBeenCalledWith();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    video.currentTime = 0;
    videoOnSeeking();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);
    expect(onSeek).not.toHaveBeenCalledWith();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    video.currentTime = 20;
    videoOnSeeking();
    expect(video.currentTime).toBe(20);
    expect(playhead.getTime()).toBe(20);
    expect(onSeek).toHaveBeenCalled();

    // Now remove start of buffer so we can check that current time is
    // adjusted to take into account buffering. Note segment availability
    // window is set so the presentation is live.
    video.buffered = {
      length: 1,
      start: function(i) {
        if (i == 0) return 20;
        throw new Error('Unexpected index');
      },
      end: function(i) {
        if (i == 0) return 35;  // Like one segment.
        throw new Error('Unexpected index');
      }
    };

    onSeek.calls.reset();

    video.currentTime = 0;
    videoOnSeeking();
    expect(video.currentTime).toBe(5 + 10);
    expect(playhead.getTime()).toBe(5 + 10);
    expect(onSeek).not.toHaveBeenCalledWith();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    video.currentTime = 6;
    videoOnSeeking();
    expect(video.currentTime).toBe(5 + 10);
    expect(playhead.getTime()).toBe(5 + 10);
    expect(onSeek).not.toHaveBeenCalledWith();
    videoOnSeeking();
    expect(onSeek).toHaveBeenCalled();

    // Now do the same thing but for VOD.
    timeline.getSegmentAvailabilityDuration.and.returnValue(null);

    onSeek.calls.reset();

    video.currentTime = 6;
    videoOnSeeking();
    expect(video.currentTime).toBe(6);
    expect(playhead.getTime()).toBe(6);
    expect(onSeek).toHaveBeenCalled();
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
      getSegmentAvailabilityStart:
          jasmine.createSpy('getSegmentAvailabilityStart'),
      getSegmentAvailabilityEnd:
          jasmine.createSpy('getSegmentAvailabilityEnd')
    };
  }
});

