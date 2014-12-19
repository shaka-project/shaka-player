/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Player integration tests.
 */

goog.require('shaka.player.Player');
goog.require('shaka.player.DashVideoSource');
goog.require('shaka.polyfill.MediaKeys');
goog.require('shaka.polyfill.VideoPlaybackQuality');

describe('Player', function() {
  var originalAsserts;
  var originalTimeout;
  var video;
  var player;

  function newSource(encrypted) {
    var url = encrypted ?
              'assets/car_cenc-20120827-manifest.mpd' :
              'assets/car-20120827-manifest.mpd';
    return new shaka.player.DashVideoSource(url, interpretContentProtection);
  }

  beforeAll(function() {
    // Hijack assertions and convert failed assertions into failed tests.
    assertsToFailures.install();

    // Change the timeout.
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;  // ms

    // Install polyfills.
    shaka.polyfill.MediaKeys.install();
    shaka.polyfill.VideoPlaybackQuality.install();

    // Create a video tag.  This will be visible so that long tests do not
    // create the illusion of the test-runner being hung.
    video = document.createElement('video');
    video.width = 600;
    video.height = 400;
    // Add it to the DOM.
    document.body.appendChild(video);
  });

  beforeEach(function() {
    // Create a new player.
    player = new shaka.player.Player(video);
    player.addEventListener('error', function(event) {
      // Treat all player errors as test failures.
      var error = event.detail;
      fail(error);
    }, false);

    // Create a new source.
    source = newSource(false);

    // Disable automatic adaptation unless it is needed for a test.
    // This makes test results more reproducible.
    player.enableAdaptation(false);
  });

  afterEach(function() {
    player.destroy();
    player = null;
  });

  afterAll(function() {
    // Remove the video tag from the DOM.
    document.body.removeChild(video);

    // Restore the timeout.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    // Restore normal assertion behavior.
    assertsToFailures.uninstall();
  });

  // Returns the Id of the track for the intended track height.
  // -1 if the target height is not found.
  function getTrackIdForTargetHeight(tracks, targetHeight) {
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].height == targetHeight) {
        return tracks[i].id;
      }
    }

    return -1;
  };

  describe('load', function() {
    // This covers basic player re-use.
    it('can be used multiple times without EME', function(done) {
      player.load(source).then(function() {
        player.play();
        return delay(5.0);
      }).then(function() {
        source = newSource(false);
        return player.load(source);
      }).then(function() {
        player.play();
        return delay(5.0);
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(0.0);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    // This covers bug #18614098.  A presumed bug in Chrome can cause mediaKeys
    // to be unset on the second use of a video tag.
    it('can be used multiple times with EME', function(done) {
      source = newSource(true);
      player.load(source).then(function() {
        player.play();
        return delay(5.0);
      }).then(function() {
        source = newSource(true);
        return player.load(source);
      }).then(function() {
        player.play();
        return delay(5.0);
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(0.0);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('resize', function() {
    // Tests video resizing at the time of initializing player.
    it('can set resolution at time of initialization', function(done) {
      player.load(source).then(function() {
        var tracks = player.getVideoTracks();
        var trackId = getTrackIdForTargetHeight(tracks, 720);
        player.selectVideoTrack(trackId);
        player.play();
        return delay(10.0);
      }).then(function() {
        var currentResolution = player.getCurrentResolution();
        expect(currentResolution).not.toBe(null);
        expect(currentResolution.height).toEqual(720);
        expect(currentResolution.width).toEqual(1280);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    // Tests player at different resolutions.
    it('can be resized multiple times', function(done) {
      player.load(source).then(function() {
        var tracks = player.getVideoTracks();
        var trackId = getTrackIdForTargetHeight(tracks, 720);
        player.selectVideoTrack(trackId);
        player.play();
        return delay(10.0);
      }).then(function() {
        var currentResolution = player.getCurrentResolution();
        expect(currentResolution).not.toBe(null);
        expect(currentResolution.height).toEqual(720);
        expect(currentResolution.width).toEqual(1280);
        return delay(2.0);
      }).then(function() {
        var tracks = player.getVideoTracks();
        var trackId = getTrackIdForTargetHeight(tracks, 360);
        player.selectVideoTrack(trackId);
        return delay(10.0);
      }).then(function() {
        var currentResolution = player.getCurrentResolution();
        expect(currentResolution).not.toBe(null);
        expect(currentResolution.height).toEqual(360);
        expect(currentResolution.width).toEqual(640);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('player-controls', function() {
    // Tests various player controls.
    it('test play and pause video controls', function(done) {
      var timeStamp;
      player.load(source).then(function() {
        player.play();
        return delay(8.0);
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(3.0);
        player.pause();
        timeStamp = player.getCurrentTime();
        return delay(5.0);
      }).then(function() {
        expect(video.paused).toBe(true);
        expect(video.currentTime).toEqual(timeStamp);
        expect(video.currentTime).toEqual(player.getCurrentTime());
        timeStamp = player.getCurrentTime();
        player.play();
        return delay(5.0);
      }).then(function() {
        expect(video.paused).toBe(false);
        expect(video.currentTime).toBeGreaterThan(timeStamp);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('test volume control', function(done) {
      var volume;
      player.load(source).then(function() {
        player.play();
        volume = player.getVolume();
        player.setVolume(0);
        expect(player.getVolume()).toEqual(0);
        player.setVolume(0.5);
        expect(player.getVolume()).toEqual(0.5);
        expect(video.volume).toEqual(0.5);
        player.setMuted(true);
        expect(player.getMuted()).toBe(true);
        expect(video.muted).toBe(true);
        player.setMuted(false);
        expect(player.getMuted()).toBe(false);
        expect(video.muted).toBe(false);
        expect(player.getVolume()).toEqual(0.5);
        expect(video.volume).toEqual(0.5);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('seek', function() {
    // This covers bug #18597152.  Completely clearing the buffers after a seek
    // can cause the media pipeline in Chrome to get stuck.  This seemed to
    // happen when certain seek intervals were used.
    it('does not lock up on segment boundaries', function(done) {
      player.load(source).then(function() {
        player.play();
        return delay(1.0);  // gets the player out of INIT state
      }).then(function() {
        player.seek(40.0);  // <0.1s before end of segment N (5).
        return delay(2.0);
      }).then(function() {
        player.seek(30.0);  // <0.1s before end of segment N-2 (3).
        return delay(5.0);
      }).then(function() {
        // Typically this bug manifests with seeking == true.
        expect(video.seeking).toBe(false);
        // Typically this bug manifests with readyState == HAVE_METADATA.
        expect(video.readyState).not.toBe(HTMLVideoElement.HAVE_METADATA);
        expect(video.readyState).not.toBe(HTMLVideoElement.HAVE_NOTHING);
        // We can't expect to get all the way to 35.0 unless the seek is
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
      player.load(source).then(function() {
        player.play();
        return delay(1.0);
      }).then(function() {
        player.seek(33.0);
        return delay(2.0);
      }).then(function() {
        player.seek(28.0);
        return delay(10.0);
      }).then(function() {
        // We don't expect 38.0 because of the uncertainty of network and other
        // delays.  This is a safe number which will not cause false failures.
        // When this bug manifests, the playhead typically gets stuck around
        // 32.9, so we expect that 35.0 is a safe indication that the bug is
        // not manifesting.
        expect(video.currentTime).toBeGreaterThan(35.0);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('can be used during stream switching', function(done) {
      var videoStream;
      var DashStream = shaka.dash.DashStream;

      player.load(source).then(function() {
        player.play();
        return delay(2.0);
      }).then(function() {
        videoStream = source.streamsByType_['video'];
        expect(videoStream.state_).toBe(DashStream.State_.UPDATING);

        var ok = player.selectVideoTrack(3);  // 480p stream
        expect(ok).toBe(true);
        expect(videoStream.state_).toBe(DashStream.State_.SWITCHING);

        player.seek(30.0);
        return delay(10.0);
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(35.0);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });
});

