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
  var manifest;
  var playhead;
  var config;

  // Callback to us from Playhead when a valid 'seeking' event occurs.
  var onSeek;

  beforeEach(function() {
    video = new shaka.test.FakeVideo();
    timeline = new shaka.test.FakePresentationTimeline();

    onSeek = jasmine.createSpy('onSeek');

    timeline.isLive.and.returnValue(false);
    timeline.getEarliestStart.and.returnValue(5);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);

    // These tests should not cause these methods to be invoked.
    timeline.getSegmentAvailabilityDuration.and.throwError(new Error());
    timeline.getDuration.and.throwError(new Error());
    timeline.setDuration.and.throwError(new Error());

    // shakaExtern.Manifest
    manifest = {
      periods: [],
      presentationTimeline: timeline,
      minBufferTime: 10,
      offlineSessionIds: []
    };

    // shakaExtern.StreamingConfiguration
    config = {
      rebufferingGoal: 10,
      bufferingGoal: 5,
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      bufferBehind: 15,
      ignoreTextStreamFailures: false,
      useRelativeCueTimestamps: false,
      startAtSegmentBoundary: false,
      smallGapLimit: 0.5,
      jumpLargeGaps: false
    };
  });

  afterEach(function(done) {
    playhead.destroy().then(done);
    playhead = null;
  });

  describe('getTime', function() {
    it('returns the correct time when readyState starts at 0', function() {
      playhead = new shaka.media.Playhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          onSeek);

      expect(video.addEventListener).toHaveBeenCalledWith(
          'loadedmetadata', jasmine.any(Function), false);
      expect(video.addEventListener.calls.count()).toBe(2);

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(0);

      video.readyState = HTMLMediaElement.HAVE_METADATA;
      video.on['loadedmetadata']();

      expect(video.addEventListener).toHaveBeenCalledWith(
          'seeking', jasmine.any(Function), false);
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
          manifest,
          config,
          5 /* startTime */,
          onSeek);

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(5);

      video.currentTime = 6;
      expect(playhead.getTime()).toBe(6);
    });
  });

  it('clamps playhead after seeking for live', function() {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = createFakeBuffered([{start: 25, end: 55}]);

    timeline.isLive.and.returnValue(true);
    timeline.getEarliestStart.and.returnValue(5);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);
    timeline.getSegmentAvailabilityDuration.and.returnValue(30);

    playhead = new shaka.media.Playhead(
        video,
        manifest,
        config,
        5 /* startTime */,
        onSeek);

    // Calling on['seeking']() is like dispatching a 'seeking' event. So, each
    // time we change the video's current time or Playhead changes the video's
    // current time we must call on['seeking'](),

    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);

    // safe = start + rebufferingGoal = 5 + 10 = 15
    // safeSeek = safeSeek + 1 = 15 + 1 = 16

    // Seek in safe region & in buffered region.
    video.currentTime = 26;
    video.on['seeking']();
    expect(video.currentTime).toBe(26);
    expect(playhead.getTime()).toBe(26);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek in safe region & in unbuffered region.
    video.currentTime = 24;
    video.on['seeking']();
    expect(video.currentTime).toBe(24);
    expect(playhead.getTime()).toBe(24);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before left (treated like seek before start even though in buffered
    // region).
    video.currentTime = 5.5;
    video.on['seeking']();
    expect(video.currentTime).toBe(16);
    expect(playhead.getTime()).toBe(16);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    video.buffered = createFakeBuffered([{start: 10, end: 40}]);

    // Seek outside safe region & in buffered region.
    video.currentTime = 15;
    video.on['seeking']();
    expect(video.currentTime).toBe(15);
    expect(playhead.getTime()).toBe(15);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek outside safe region & in unbuffered region.
    video.currentTime = 9;
    video.on['seeking']();
    expect(video.currentTime).toBe(16);
    expect(playhead.getTime()).toBe(16);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek past end.
    video.currentTime = 120;
    video.on['seeking']();
    expect(video.currentTime).toBe(60);
    expect(playhead.getTime()).toBe(60);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before start.
    video.currentTime = 1;
    video.on['seeking']();
    expect(video.currentTime).toBe(16);
    expect(playhead.getTime()).toBe(16);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek with safe == end
    timeline.getSegmentAvailabilityEnd.and.returnValue(12);
    timeline.getSafeAvailabilityStart.and.returnValue(12);

    // Seek before start
    video.currentTime = 4;
    video.on['seeking']();
    expect(video.currentTime).toBe(12);
    expect(playhead.getTime()).toBe(12);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek in window.
    video.currentTime = 8;
    video.on['seeking']();
    expect(video.currentTime).toBe(12);
    expect(playhead.getTime()).toBe(12);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek past end.
    video.currentTime = 13;
    video.on['seeking']();
    expect(video.currentTime).toBe(12);
    expect(playhead.getTime()).toBe(12);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();
  });

  it('clamps playhead after seeking for VOD', function() {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = createFakeBuffered([{start: 25, end: 55}]);

    timeline.isLive.and.returnValue(false);
    timeline.getEarliestStart.and.returnValue(5);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSafeAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);
    timeline.getSegmentAvailabilityDuration.and.returnValue(null);

    playhead = new shaka.media.Playhead(
        video,
        manifest,
        config,
        5 /* startTime */,
        onSeek);

    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);

    // Seek past end.
    video.currentTime = 120;
    video.on['seeking']();
    expect(video.currentTime).toBe(60);
    expect(playhead.getTime()).toBe(60);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before start.
    video.currentTime = 1;
    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();
  });

  describe('clamps playhead after resuming', function() {
    beforeEach(function() {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      video.buffered = createFakeBuffered([{start: 5, end: 35}]);
    });

    it('(live case)', function() {
      timeline.isLive.and.returnValue(true);
      timeline.getEarliestStart.and.returnValue(5);
      timeline.getSegmentAvailabilityStart.and.returnValue(5);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          onSeek);

      video.on['seeking']();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      // Simulate pausing.
      timeline.getEarliestStart.and.returnValue(10);
      timeline.getSegmentAvailabilityStart.and.returnValue(10);
      timeline.getSegmentAvailabilityEnd.and.returnValue(70);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      // Because this is buffered, the playhead should move to (start + 1),
      // which will cause a 'seeking' event.
      video.on['playing']();
      expect(video.currentTime).toBe(11);
      video.on['seeking']();
      expect(playhead.getTime()).toBe(11);
      expect(onSeek).toHaveBeenCalled();
    });

    it('(VOD case)', function() {
      timeline.isLive.and.returnValue(false);
      timeline.getEarliestStart.and.returnValue(5);
      timeline.getSegmentAvailabilityStart.and.returnValue(5);
      timeline.getSafeAvailabilityStart.and.returnValue(5);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          onSeek);

      video.on['seeking']();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      // Simulate pausing.
      timeline.getEarliestStart.and.returnValue(10);
      timeline.getSegmentAvailabilityStart.and.returnValue(10);
      timeline.getSafeAvailabilityStart.and.returnValue(10);
      timeline.getSegmentAvailabilityEnd.and.returnValue(70);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      video.on['playing']();
      expect(video.currentTime).toBe(10);
      video.on['seeking']();
      expect(playhead.getTime()).toBe(10);
      expect(onSeek).toHaveBeenCalled();
    });
  });
});

