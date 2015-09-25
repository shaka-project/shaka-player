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

goog.require('shaka.player.StreamVideoSource');
goog.require('shaka.util.EventManager');

describe('Seek', function() {
  var video;
  var player;
  var eventManager;
  var estimator;

  beforeAll(integration.setUp);
  afterAll(integration.tearDown);

  beforeEach(function() {
    // Create a video tag.  This will be visible so that long tests do not
    // create the illusion of the test-runner being hung.
    video = createVideo();
    document.body.appendChild(video);

    player = createPlayer(video);
    eventManager = new shaka.util.EventManager();
  });

  afterEach(function(done) {
    eventManager.destroy();
    eventManager = null;

    player.destroy().then(function() {
      player = null;
      done();
    });

    // Remove the video tag from the DOM.
    document.body.removeChild(video);
  });

  // This covers bug #18597152.  Completely clearing the buffers after a seek
  // can cause the media pipeline in Chrome to get stuck.  This seemed to
  // happen when certain seek intervals were used.
  it('does not lock up on segment boundaries', function(done) {
    player.load(newSource(manifests.plainManifest)).then(function() {
      video.play();
      // gets the player out of INIT state
      return waitForMovement(video, eventManager);
    }).then(function() {
      video.currentTime = 40.0;  // <0.1s before end of segment N (5).
      return delay(2.0);
    }).then(function() {
      video.currentTime = 30.0;  // <0.1s before end of segment N-2 (3).
      return delay(8.0);
    }).then(function() {
      // Typically this bug manifests with seeking == true.
      expect(video.seeking).toBe(false);
      // Typically this bug manifests with readyState == HAVE_METADATA.
      expect(video.readyState).not.toBe(HTMLVideoElement.HAVE_METADATA);
      expect(video.readyState).not.toBe(HTMLVideoElement.HAVE_NOTHING);
      // We can't expect to get all the way to 38.0 unless the seek is
      // instantaneous.  We use 32.0 because it leaves plenty of wiggle room
      // for various delays (including network delay), and because in this
      // particular bug, the video gets stuck at exactly the seek time (30).
      expect(video.currentTime).toBeGreaterThan(32.0);
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  });

  // This covers bug #18597156.  Seeking around without removing any data
  // from the buffers can cause the media pipeline in Chrome to manifest gaps
  // in the buffered data ranges.  Such a gap will move forward as data is
  // replaced in buffer, but the gap will never close until the entire range
  // has been replaced.  It is therefore SourceBufferManager's job to work
  // around this peculiar behavior from Chrome's SourceBuffer.  If this is
  // not done, playback gets "stuck" when the playhead enters such a gap.
  it('does not create unclosable gaps in the buffer', function(done) {
    player.load(newSource(manifests.plainManifest)).then(function() {
      video.play();
      return waitForMovement(video, eventManager);
    }).then(function() {
      video.currentTime = 33.0;
      return waitForMovement(video, eventManager);
    }).then(function() {
      return delay(1.0);
    }).then(function() {
      video.currentTime = 28.0;
      // We don't expect 38.0 because of the uncertainty of network and other
      // delays.  This is a safe number which will not cause false failures.
      // When this bug manifests, the playhead typically gets stuck around
      // 32.9, so we expect that 35.0 is a safe indication that the bug is
      // not manifesting.
      return waitForTargetTime(video, eventManager, 35.0, 12.0);
    }).then(function() {
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  });

  // This covers github issue #15, in which seeking to evicted data hangs
  // playback.
  it('does not hang when seeking to evicted data', function(done) {
    var source = newSource(manifests.highBitrateManifest);

    // This should force Chrome to evict data quickly after it is played.
    // At this asset's bitrate, Chrome should only have enough buffer for
    // 310 seconds of data.  Tweak the buffer time for audio, since this
    // will take much less time and bandwidth to buffer.
    player.configure({'streamBufferSize': 300});

    // Create a temporary shim to intercept and modify manifest info.
    var originalLoad = shaka.player.StreamVideoSource.prototype.load;
    shaka.player.StreamVideoSource.prototype.load = function() {
      var sets = this.manifestInfo.periodInfos[0].streamSetInfos;
      var audioSet = sets[0].contentType == 'audio' ? sets[0] : sets[1];
      expect(audioSet.contentType).toBe('audio');
      // Remove the video set to speed things up.
      this.manifestInfo.periodInfos[0].streamSetInfos = [audioSet];
      return originalLoad.call(this);
    };

    var audioStreamBuffer;
    player.load(source).then(function() {
      // Replace the StreamVideoSource shim.
      shaka.player.StreamVideoSource.prototype.load = originalLoad;
      // Locate the audio stream buffer.
      var audioStream = source.streamsByType_['audio'];
      audioStreamBuffer = audioStream.sbm_.sourceBuffer_;
      // Nothing has buffered yet.
      expect(audioStreamBuffer.buffered.length).toBe(0);
      // Give the audio time to buffer.
      return waitUntilBuffered(audioStreamBuffer, 290, 50);
    }).then(function() {
      // The content is now buffered, and none has been evicted yet.
      expect(audioStreamBuffer.buffered.length).toBe(1);
      expect(audioStreamBuffer.buffered.start(0)).toBe(0);
      video.play();
      return waitForMovement(video, eventManager);
    }).then(function() {
      // Power through and consume the audio data quickly.
      player.setPlaybackRate(4);
      return waitForTargetTime(video, eventManager, 30, 30);
    }).then(function() {
      // Ensure that the browser has evicted the beginning of the stream.
      // Otherwise, this test hasn't reproduced the circumstances correctly.
      expect(audioStreamBuffer.buffered.start(0)).toBeGreaterThan(0);
      expect(audioStreamBuffer.buffered.end(0)).toBeGreaterThan(310);
      expect(video.currentTime).toBeGreaterThan(0);
      // Seek to the beginning, which is data we will have to re-download.
      player.configure({'streamBufferSize': 10});
      player.setPlaybackRate(1.0);
      video.currentTime = 0;
      // Expect to play some.
      return waitForTargetTime(video, eventManager, 0.5, 2.0);
    }).then(function() {
      done();
    }).catch(function(error) {
      // Replace the StreamVideoSource shim.
      shaka.player.StreamVideoSource.prototype.load = originalLoad;
      fail(error);
      done();
    });
  });

  // This covers github issue #26.
  it('does not hang when seeking to pre-adaptation data', function(done) {
    var source = newSource(manifests.plainManifest);

    player.load(source).then(function() {
      video.play();
      return waitForMovement(video, eventManager);
    }).then(function() {
      // Move quickly past the first two segments.
      player.setPlaybackRate(3.0);
      return waitForTargetTime(video, eventManager, 11.0, 6.0);
    }).then(function() {
      var track = getVideoTrackByHeight(player, 480);
      expect(track.active).toBe(false);
      var ok = player.selectVideoTrack(track.id, false);
      expect(ok).toBe(true);
      return waitForMovement(video, eventManager);
    }).then(function() {
      // This bug manifests within two segments of the adaptation point.  To
      // prove that we are not hung, we need to get to a point two segments
      // later than where we adapted.
      return waitForTargetTime(video, eventManager, 22.0, 6.0);
    }).then(function() {
      video.currentTime = 0;
      return waitForMovement(video, eventManager);
    }).then(function() {
      return waitForTargetTime(video, eventManager, 21.0, 12.0);
    }).then(function() {
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  });

  it('can be used during stream switching', function(done) {
    var source = newSource(manifests.plainManifest);

    player.load(source).then(function() {
      video.play();
      return waitForMovement(video, eventManager);
    }).then(function() {
      var videoStream = source.streamsByType_['video'];

      var track = getVideoTrackByHeight(player, 480);
      var ok = player.selectVideoTrack(track.id);
      expect(ok).toBe(true);

      video.currentTime = 30.0;
      return waitForTargetTime(video, eventManager, 33.0, 8.0);
    }).then(function() {
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  });

  // Starts the video 25 seconds in and then seeks back near the beginning
  // before stream startup (initial buffering) has completed. Playback should
  // begin from the seeked-to location and not hang.
  it('can be used during stream startup w/ large < 0 seek', function(done) {
    streamStartupTest(25, 3, done);
  });

  // The same as the above test, but tests on the boundary.
  it('can be used during stream startup w/ small < 0 seek)', function(done) {
    var tolerance = shaka.player.StreamVideoSource.SEEK_TOLERANCE_;
    streamStartupTest(25, 25 - (tolerance / 2), done);
  });

  it('can be used during stream startup w/ large > 0 seek', function(done) {
    streamStartupTest(25, 35, done);
  });

  function streamStartupTest(playbackStartTime, seekTarget, done) {
    var source = newSource(manifests.plainManifest);
    video.autoplay = true;

    player.setPlaybackStartTime(playbackStartTime);

    // Force @minBufferTime to a large value so we have enough time to seek
    // during startup.
    var originalLoad = shaka.player.StreamVideoSource.prototype.load;
    shaka.player.StreamVideoSource.prototype.load = function() {
      expect(this.manifestInfo).not.toBe(null);
      this.manifestInfo.minBufferTime = 80;
      return originalLoad.call(this);
    };

    player.load(source).then(function() {
      // Continue once we've buffered at least one segment.
      return waitFor(30, function() { return video.buffered.length == 1; });
    }).then(function() {
      // Ensure we have buffered at least one segment but have not yet
      // started playback.
      expect(video.buffered.length).toBe(1);
      expect(video.playbackRate).toBe(0);
      // Now seek back near the beginning.
      video.currentTime = seekTarget;

      // Once it seeks to the beginning, it will buffer the video and then
      // start playing once it reaches its buffer goal.
      return waitFor(30, function() { return video.playbackRate != 0; });
    }).then(function() {
      // Ensure that the video is actually moving.
      return delay(1);
    }).then(function() {
      expect(video.buffered.length).toBe(1);
      expect(video.playbackRate).toBe(1);
      expect(video.currentTime).toBeGreaterThan(seekTarget);
      shaka.player.StreamVideoSource.prototype.load = originalLoad;
      done();
    }).catch(function(error) {
      shaka.player.StreamVideoSource.prototype.load = originalLoad;

      fail(error);
      done();
    });
  }
});

