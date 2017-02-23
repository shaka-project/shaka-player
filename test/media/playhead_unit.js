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

  // Callback to Playhead to simulate 'loadedmetadata' event from |video|.
  var videoOnLoadedMetadata;

  // Callback to Playhead to simulate 'seeking' event from |video|.
  var videoOnSeeking;

  // Callback to Playhead to simulate 'playing' event from |video|.
  var videoOnPlaying;

  // Callback to Playhead to simulate 'ratechange' event from |video|.
  var videoOnRateChange;

  // Callback to Playhead to simulate 'timeupdate' event from |video|.
  var videoOnTimeUpdate;

  // Callback to us from Playhead when the buffering state changes.
  var onBuffering;

  // Callback to us from Playhead when a valid 'seeking' event occurs.
  var onSeek;

  // Callback to us from Playhead when a timeline event occurs.
  var onEvent;

  // Callback to us from Playhead when we change to a different Period.
  var onChangePeriod;

  beforeEach(function() {
    video = createMockVideo();
    timeline = createMockPresentationTimeline();

    videoOnLoadedMetadata = undefined;
    videoOnSeeking = undefined;
    videoOnPlaying = undefined;
    videoOnRateChange = undefined;

    onBuffering = jasmine.createSpy('onBuffering');
    onSeek = jasmine.createSpy('onSeek');
    onEvent = jasmine.createSpy('onEvent');
    onChangePeriod = jasmine.createSpy('onChangePeriod');

    video.addEventListener.and.callFake(function(eventName, f, bubbles) {
      if (eventName == 'loadedmetadata') {
        videoOnLoadedMetadata = f;
      } else if (eventName == 'seeking') {
        videoOnSeeking = f;
      } else if (eventName == 'playing') {
        videoOnPlaying = f;
      } else if (eventName == 'ratechange') {
        videoOnRateChange = f;
      } else if (eventName == 'timeupdate') {
        videoOnTimeUpdate = f;
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

    manifest = /** @type {shakaExtern.Manifest} */ ({
      periods: [],
      presentationTimeline: timeline
    });
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
          10 /* minBufferTime */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      expect(video.addEventListener).toHaveBeenCalledWith(
          'loadedmetadata', videoOnLoadedMetadata, false);
      expect(video.addEventListener.calls.count()).toBe(3);

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(0);

      video.readyState = HTMLMediaElement.HAVE_METADATA;
      videoOnLoadedMetadata();

      expect(video.addEventListener).toHaveBeenCalledWith(
          'seeking', videoOnSeeking, false);
      expect(video.addEventListener.calls.count()).toBe(4);

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
          10 /* minBufferTime */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(5);

      video.currentTime = 6;
      expect(playhead.getTime()).toBe(6);
    });
  });

  it('sets/unsets buffering state', function() {
    playhead = new shaka.media.Playhead(
        video,
        manifest,
        10 /* minBufferTime */,
        5 /* startTime */,
        onBuffering, onSeek, onEvent, onChangePeriod);

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
        manifest,
        10 /* rebufferingGoal */,
        5 /* startTime */,
        onBuffering, onSeek, onEvent, onChangePeriod);

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
    expect(video.currentTime).toBe(17);
    expect(playhead.getTime()).toBe(17);
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
    expect(video.currentTime).toBe(17);
    expect(playhead.getTime()).toBe(17);
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
    expect(video.currentTime).toBe(17);
    expect(playhead.getTime()).toBe(17);
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
        manifest,
        10 /* rebufferingGoal */,
        5 /* startTime */,
        onBuffering, onSeek, onEvent, onChangePeriod);

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

  describe('clamps playhead after resuming', function() {
    beforeEach(function() {
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
          10 /* rebufferingGoal */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      videoOnSeeking();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      // Simulate pausing.
      timeline.getEarliestStart.and.returnValue(10);
      timeline.getSegmentAvailabilityStart.and.returnValue(10);
      timeline.getSegmentAvailabilityEnd.and.returnValue(70);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      // Because this is buffered, the playhead should move to (start + 1),
      // which will cause a 'seeking' event.
      videoOnPlaying();
      expect(video.currentTime).toBe(11);
      videoOnSeeking();
      expect(playhead.getTime()).toBe(11);
      expect(onSeek).toHaveBeenCalled();
    });

    it('(VOD case)', function() {
      timeline.isLive.and.returnValue(false);
      timeline.getEarliestStart.and.returnValue(5);
      timeline.getSegmentAvailabilityStart.and.returnValue(5);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          10 /* rebufferingGoal */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      videoOnSeeking();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

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
          manifest,
          10 /* rebufferingGoal */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

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
              manifest,
              10 /* rebufferingGoal */,
              5 /* startTime */,
              onBuffering, onSeek, onEvent, onChangePeriod);

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
          manifest,
          10 /* rebufferingGoal */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

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

    it('leaves buffering state with small non-zero start time', function(done) {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      // Nothing buffered.
      video.buffered = {
        length: 0
      };

      video.duration = 60;
      timeline.getDuration.and.returnValue(60);
      timeline.getEarliestStart.and.returnValue(0);
      timeline.getSegmentAvailabilityStart.and.returnValue(0);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          2 /* rebufferingGoal */,
          0 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      videoOnSeeking();
      expect(video.currentTime).toBe(0);
      expect(playhead.getTime()).toBe(0);

      onBuffering.and.callFake(function(buffering) {
        expect(buffering).toEqual(true);

        video.buffered = {
          length: 1,
          start: function(i) {
            if (i == 0) return 0.2;
            throw new Error('Unexpected index');
          },
          end: function(i) {
            if (i == 0) return 5;
            throw new Error('Unexpected index');
          }
        };

        onBuffering.and.callFake(function(buffering) {
          expect(buffering).toEqual(false);
          done();
        });
      });
    });

    it('leaves buffering state with exact amount buffered', function(done) {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      // Nothing buffered.
      video.buffered = {
        length: 0
      };

      video.duration = 20;
      timeline.getDuration.and.returnValue(20);
      timeline.getEarliestStart.and.returnValue(0);
      timeline.getSegmentAvailabilityStart.and.returnValue(0);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          10 /* rebufferingGoal */,
          0 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      expect(video.currentTime).toBe(0);
      expect(playhead.getTime()).toBe(0);

      onBuffering.and.callFake(function(buffering) {
        expect(buffering).toEqual(true);

        // Exactly 10s (rebufferingGoal) is buffered now.
        video.buffered = {
          length: 1,
          start: function(i) {
            if (i == 0) return 0;
            throw new Error('Unexpected index');
          },
          end: function(i) {
            if (i == 0) return 10;
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

  describe('timeline regions', function() {
    var regionInfo;

    beforeEach(function() {
      regionInfo = {
        schemeIdUri: 'http://example.com',
        value: 'something',
        startTime: 10,
        endTime: 20,
        id: 'abc',
        eventElement: null
      };

      video.readyState = HTMLMediaElement.HAVE_METADATA;

      timeline.getEarliestStart.and.returnValue(0);
      timeline.getDuration.and.returnValue(60);
      timeline.getSegmentAvailabilityStart.and.returnValue(0);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);

      playhead = new shaka.media.Playhead(
          video, manifest, 10 /* rebufferingGoal */, 0 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);
    });

    it('fires enter/exit events when playhead plays into a region', function() {
      playhead.addTimelineRegion(regionInfo);
      onEvent.calls.reset();

      video.currentTime = 0;
      videoOnTimeUpdate();
      expect(onEvent).not.toHaveBeenCalled();

      video.currentTime = 12;
      videoOnTimeUpdate();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionenter', regionInfo);
      onEvent.calls.reset();

      video.currentTime = 17;
      videoOnTimeUpdate();
      expect(onEvent).not.toHaveBeenCalled();

      video.currentTime = 22;
      videoOnTimeUpdate();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionexit', regionInfo);
    });

    it('fires enter/exit events for zero-length regions', function() {
      regionInfo.startTime = regionInfo.endTime = 10;
      playhead.addTimelineRegion(regionInfo);
      onEvent.calls.reset();

      video.currentTime = 8;
      videoOnTimeUpdate();
      expect(onEvent).not.toHaveBeenCalled();

      video.currentTime = 11;
      videoOnTimeUpdate();
      expect(onEvent).toHaveBeenCalledTimes(2);
      expectTimelineEvent('timelineregionenter', regionInfo, 0);
      expectTimelineEvent('timelineregionexit', regionInfo, 1);
    });

    it('fires enter event when adding a region the playead is in', function() {
      video.currentTime = 12;
      playhead.addTimelineRegion(regionInfo);
      expect(onEvent).toHaveBeenCalledTimes(2);
      expectTimelineEvent('timelineregionadded', regionInfo, 0);
      expectTimelineEvent('timelineregionenter', regionInfo, 1);
      onEvent.calls.reset();

      video.currentime = 15;
      videoOnTimeUpdate();
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('fires enter event when seeking into a region', function() {
      playhead.addTimelineRegion(regionInfo);
      onEvent.calls.reset();

      video.currentTime = 13;
      videoOnSeeking();

      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionenter', regionInfo);
      onEvent.calls.reset();

      video.currentTime = 16;
      videoOnTimeUpdate();
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('fires exit event when seeking out of a region', function() {
      video.currentTime = 12;
      playhead.addTimelineRegion(regionInfo);
      expect(onEvent).toHaveBeenCalledTimes(2);
      onEvent.calls.reset();

      video.currentTime = 0;
      videoOnSeeking();

      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionexit', regionInfo);
      onEvent.calls.reset();

      video.currentTime = 4;
      videoOnTimeUpdate();
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('doesn\'t fire when seeking over a region', function() {
      playhead.addTimelineRegion(regionInfo);
      onEvent.calls.reset();

      video.currentTime = 4;
      videoOnTimeUpdate();

      video.currentTime = 7;
      videoOnTimeUpdate();

      video.currentTime = 25;
      videoOnSeeking();

      video.currentTime = 28;
      videoOnTimeUpdate();

      expect(onEvent).not.toHaveBeenCalled();
    });

    it('correctly fires enter/exit events when regions overlap', function() {
      var regionInfo2 = {
        schemeIdUri: 'http://example.com',
        value: 'something',
        startTime: 15,
        endTime: 25,
        id: '123',
        eventElement: null
      };

      playhead.addTimelineRegion(regionInfo);
      playhead.addTimelineRegion(regionInfo2);
      expect(onEvent).toHaveBeenCalledTimes(2);
      onEvent.calls.reset();

      video.currentTime = 7;
      videoOnTimeUpdate();
      expect(onEvent).not.toHaveBeenCalled();

      video.currentTime = 12;
      videoOnTimeUpdate();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionenter', regionInfo);
      onEvent.calls.reset();

      video.currentTime = 16;
      videoOnTimeUpdate();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionenter', regionInfo2);
      onEvent.calls.reset();

      video.currentTime = 22;
      videoOnTimeUpdate();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionexit', regionInfo);
      onEvent.calls.reset();

      video.currentTime = 26;
      videoOnTimeUpdate();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionexit', regionInfo2);
      onEvent.calls.reset();

      video.currentTime = 28;
      videoOnTimeUpdate();
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('won\'t add duplicate regions', function() {
      // Regions with the same scheme ID and time ranges are ignored.
      var infoWithSameTime = {
        schemeIdUri: 'http://example.com',
        value: 'other',
        startTime: 10,
        endTime: 20,
        id: '123',
        eventElement: null
      };
      var differentInfo = {
        schemeIdUri: 'http://google.com',
        value: 'other',
        startTime: 10,
        endTime: 20,
        id: '123',
        eventElement: null
      };

      playhead.addTimelineRegion(regionInfo);
      playhead.addTimelineRegion(regionInfo);
      playhead.addTimelineRegion(differentInfo);
      playhead.addTimelineRegion(infoWithSameTime);
      expect(onEvent).toHaveBeenCalledTimes(2);
      expectTimelineEvent('timelineregionadded', regionInfo, 0);
      expectTimelineEvent('timelineregionadded', differentInfo, 1);
    });

    /**
     * @param {string} eventName
     * @param {shakaExtern.TimelineRegionInfo} info
     * @param {number=} opt_index
     */
    function expectTimelineEvent(eventName, info, opt_index) {
      var event = onEvent.calls.argsFor(opt_index || 0)[0];
      expect(event.type).toBe(eventName);
      expect(event.detail).toEqual(info);
    }
  });

  describe('changing Periods', function() {
    beforeEach(function() {
      manifest.periods = [
        {startTime: 0},
        {startTime: 10},
        {startTime: 20}
      ];

      video.readyState = HTMLMediaElement.HAVE_METADATA;

      timeline.getEarliestStart.and.returnValue(0);
      timeline.getDuration.and.returnValue(40);
      timeline.getSegmentAvailabilityStart.and.returnValue(0);
      timeline.getSegmentAvailabilityEnd.and.returnValue(40);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          10 /* minBufferTime */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      videoOnTimeUpdate();
      expect(onChangePeriod).not.toHaveBeenCalled();
    });

    it('calls the callback when playing into new Period', function(done) {
      video.currentTime = 12;
      shaka.test.Util.delay(0.5).then(function() {
        expect(onChangePeriod).toHaveBeenCalledTimes(1);
        expect(onChangePeriod).toHaveBeenCalledWith(0, 1);

        onChangePeriod.calls.reset();
        video.currentTime = 18;
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(onChangePeriod).not.toHaveBeenCalled();

        video.currentTime = 21;
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(onChangePeriod).toHaveBeenCalledTimes(1);
        expect(onChangePeriod).toHaveBeenCalledWith(1, 2);
      }).catch(fail).then(done);
    });

    it('calls the callback when seeking forward', function(done) {
      video.currentTime = 12;
      videoOnSeeking();
      shaka.test.Util.delay(0.5).then(function() {
        expect(onChangePeriod).toHaveBeenCalledTimes(1);
        expect(onChangePeriod).toHaveBeenCalledWith(0, 1);
      }).catch(fail).then(done);
    });

    it('calls the callback when seeking backward', function(done) {
      video.currentTime = 12;
      shaka.test.Util.delay(0.5).then(function() {
        onChangePeriod.calls.reset();

        video.currentTime = 2;
        videoOnSeeking();
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(onChangePeriod).toHaveBeenCalledTimes(1);
        expect(onChangePeriod).toHaveBeenCalledWith(1, 0);
      }).catch(fail).then(done);
    });

    it('calls the callback when seeking over a Period', function(done) {
      video.currentTime = 22;
      videoOnSeeking();
      shaka.test.Util.delay(0.5).then(function() {
        expect(onChangePeriod).toHaveBeenCalledTimes(1);
        expect(onChangePeriod).toHaveBeenCalledWith(0, 2);
      }).catch(fail).then(done);
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
    var getStart = jasmine.createSpy('getSegmentAvailabilityStart');
    var getSafeStart = jasmine.createSpy('getSafeAvailabilityStart');
    getSafeStart.and.callFake(function(delay) {
      return getStart() + delay;
    });

    return {
      getDuration: jasmine.createSpy('getDuration'),
      setDuration: jasmine.createSpy('setDuration'),
      getSegmentAvailabilityDuration:
          jasmine.createSpy('getSegmentAvailabilityDuration'),
      isLive: jasmine.createSpy('isLive'),
      getEarliestStart: jasmine.createSpy('getEarliestStart'),
      getSegmentAvailabilityStart: getStart,
      getSafeAvailabilityStart: getSafeStart,
      getSegmentAvailabilityEnd:
          jasmine.createSpy('getSegmentAvailabilityEnd')
    };
  }
});

