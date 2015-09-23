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

goog.require('shaka.dash.MpdRequest');
goog.require('shaka.media.Stream');
goog.require('shaka.player.DashVideoSource');
goog.require('shaka.player.Defaults');
goog.require('shaka.player.Player');
goog.require('shaka.polyfill.installAll');
goog.require('shaka.util.EWMABandwidthEstimator');
goog.require('shaka.util.LicenseRequest');

describe('Player', function() {
  var originalAsserts;
  var originalTimeout;
  var video;
  var player;
  var eventManager;
  var estimator;

  const plainManifest = 'assets/car-20120827-manifest.mpd';
  const encryptedManifest = 'assets/car_cenc-20120827-manifest.mpd';
  const languagesManifest = 'assets/angel_one.mpd';
  const webmManifest = 'assets/feelings_vp9-20130806-manifest.mpd';
  const failoverManifest = 'assets/angel_one_failover.mpd';
  const bogusManifest = 'assets/does_not_exist';
  const highBitrateManifest =
      '//storage.googleapis.com/widevine-demo-media/sintel-1080p/dash.mpd';
  const FUDGE_FACTOR = 0.3;

  const captionFile = 'assets/test_subs.vtt';

  function createVideo() {
    var video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.width = 600;
    video.height = 400;
    return video;
  }

  function createPlayer(video) {
    // Create a new player.
    var player = new shaka.player.Player(video);
    player.addEventListener('error', convertErrorToTestFailure, false);

    // Disable automatic adaptation unless it is needed for a test.
    // This makes test results more reproducible.
    player.configure({'enableAdaptation': false});

    return player;
  }

  beforeAll(function() {
    // Hijack assertions and convert failed assertions into failed tests.
    assertsToFailures.install();

    // Change the timeout.
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 55000;  // ms

    // Install polyfills.
    shaka.polyfill.installAll();
  });

  beforeEach(function() {
    // Create a video tag.  This will be visible so that long tests do not
    // create the illusion of the test-runner being hung.
    video = createVideo();
    video.autoplay = false;
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

  afterAll(function() {
    // Restore the timeout.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    // Restore normal assertion behavior.
    assertsToFailures.uninstall();
  });

  describe('load', function() {
    // This covers basic player re-use.
    it('can be used multiple times without EME', function(done) {
      player.load(newSource(plainManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        return player.load(newSource(plainManifest));
      }).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
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
      player.load(newSource(encryptedManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        return player.load(newSource(encryptedManifest));
      }).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(0.0);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    // Before playback begins there may be an intial seek to the stream start
    // time if one of the streams doesn't start at 0, and there may be another
    // seek from applying a timestamp correction. So, if the streams all start
    // at 0 and have no timestamp correction then there should be no 'seeking'
    // events.
    it('doesn\'t fire unnecessary \'seeking\' events.', function(done) {
      var source = newSource(plainManifest);
      eventManager.listen(video, 'seeking', function() { fail(); });

      player.load(source).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        // Add an "expect" just so Jasmine doesn't complain.
        expect(true).toBeTruthy();
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('selectVideoTrack', function() {
    it('can set resolution before beginning playback', function(done) {
      player.load(newSource(plainManifest)).then(function() {
        var track = getVideoTrackByHeight(720);
        player.selectVideoTrack(track.id);
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        return delay(6);
      }).then(function() {
        expect(video.videoHeight).toEqual(720);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('can be called multiple times', function(done) {
      player.load(newSource(plainManifest)).then(function() {
        var track = getVideoTrackByHeight(720);
        player.selectVideoTrack(track.id);
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        return delay(6);
      }).then(function() {
        expect(video.videoHeight).toEqual(720);

        var track = getVideoTrackByHeight(360);
        player.selectVideoTrack(track.id);

        return delay(6);
      }).then(function() {
        expect(video.videoHeight).toEqual(360);
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
      player.load(newSource(plainManifest)).then(function() {
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
      player.load(newSource(plainManifest)).then(function() {
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
      var source = newSource(highBitrateManifest);

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
      var source = newSource(plainManifest);

      player.load(source).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        // Move quickly past the first two segments.
        player.setPlaybackRate(3.0);
        return waitForTargetTime(video, eventManager, 11.0, 6.0);
      }).then(function() {
        var track = getVideoTrackByHeight(480);
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
      var source = newSource(plainManifest);

      player.load(source).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        var videoStream = source.streamsByType_['video'];

        var track = getVideoTrackByHeight(480);
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
      var source = newSource(plainManifest);
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

  describe('addExternalCaptions', function() {
    it('can be enabled', function(done) {
      var source = newSource(plainManifest);
      source.addExternalCaptions(captionFile);

      player.load(source).then(function() {
        var activeTrack = getActiveTextTrack();
        expect(activeTrack.enabled).toBe(false);

        player.enableTextTrack(true);

        activeTrack = getActiveTextTrack();
        expect(activeTrack.enabled).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('can be called multiple times', function(done) {
      var source = newSource(plainManifest);
      source.addExternalCaptions(captionFile);
      source.addExternalCaptions(captionFile, 'es');

      player.load(source).then(function() {
        var tracks = player.getTextTracks();
        expect(tracks.length).toBe(2);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('setNetworkCallback', function() {
    it('intercepts network calls', function(done) {
      var callback = jasmine.createSpy('network').and.callFake(
          function(url, parameters) {
            expect(url).toBeTruthy();
            expect(parameters).toBeTruthy();
            return null;
          });
      var source = newSource(plainManifest);
      source.setNetworkCallback(callback);

      player.load(source).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        expect(callback.calls.any()).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('intercepts mpd requests', function(done) {
      var hadMpd = false;
      var callback = jasmine.createSpy('network').and.callFake(
          function(url, parameters) {
            expect(url).toBeTruthy();
            expect(parameters).toBeTruthy();
            if (url.indexOf('mpd') != -1) {
              hadMpd = true;
            }
            return null;
          });
      var source = newSource(plainManifest);
      source.setNetworkCallback(callback);

      player.load(source).then(function() {
        expect(callback.calls.any()).toBe(true);
        expect(hadMpd).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('changes urls', function(done) {
      var callback = jasmine.createSpy('network').and.callFake(
          function(url, parameters) {
            expect(url).toBeTruthy();
            expect(parameters).toBeTruthy();
            return url.replace('example', 'appspot');
          });

      // Load the angel manifest and edit the urls to point to an
      // invalid location.
      var url = new shaka.util.FailoverUri(null,
                                           [new goog.Uri(languagesManifest)]);
      var params = new shaka.util.AjaxRequest.Parameters();
      params.responseType = 'text';
      url.fetch(params).then(function(data) {
        var dummy = data.replace('appspot', 'example');
        dummy = 'data:text/plain,' + window.encodeURIComponent(dummy);

        var source = newSource(dummy);
        source.setNetworkCallback(callback);
        return player.load(source);
      }).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        expect(callback.calls.any()).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  it('supports failover', function(done) {
    player.load(newSource(failoverManifest)).then(function() {
      video.play();
      return waitForMovement(video, eventManager);
    }).then(function() {
      expect(video.currentTime).toBeGreaterThan(0.0);
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  });

  describe('enableTextTrack', function() {
    it('enables the active track', function(done) {
      player.load(newSource(languagesManifest)).then(function() {
        var activeTrack = getActiveTextTrack();
        expect(activeTrack.enabled).toBe(false);

        player.enableTextTrack(true);

        activeTrack = getActiveTextTrack();
        expect(activeTrack.enabled).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('selectTextTrack', function() {
    var tracks;
    it('activates the correct track', function(done) {
      player.load(newSource(languagesManifest)).then(function() {
        tracks = player.getTextTracks();
        var activeTrack = getActiveTextTrack();
        // Ensure that it is the first track, so that we know our selection
        // of the second track is affecting a real change.
        expect(activeTrack.id).toBe(tracks[0].id);

        player.selectTextTrack(tracks[1].id);
        return delay(0.1);
      }).then(function() {
        activeTrack = getActiveTextTrack();
        expect(activeTrack.id).toBe(tracks[1].id);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('fires an adaptation event', function(done) {
      var onAdaptation = jasmine.createSpy('onAdaptation');
      player.load(newSource(languagesManifest)).then(function() {
        player.addEventListener('adaptation', onAdaptation, false);

        tracks = player.getTextTracks();
        player.selectTextTrack(tracks[1].id);
        return delay(0.1);
      }).then(function() {
        activeTrack = getActiveTextTrack();
        expect(activeTrack.id).toBe(tracks[1].id);

        var found = false;
        var max = onAdaptation.calls.count();
        for (var i = 0; i < max; i++) {
          if (onAdaptation.calls.argsFor(i)[0].contentType === 'text') {
            found = true;
          }
        }
        expect(found).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });


    it('does not disable subtitles', function(done) {
      var tracks;
      player.load(newSource(languagesManifest)).then(function() {
        tracks = player.getTextTracks();
        player.selectTextTrack(tracks[0].id);
        player.enableTextTrack(true);
        return delay(0.1);
      }).then(function() {
        var activeTrack = getActiveTextTrack();
        expect(activeTrack.enabled).toBe(true);
        expect(activeTrack.id).toBe(tracks[0].id);

        player.selectTextTrack(tracks[1].id);
        return delay(0.1);
      }).then(function() {
        activeTrack = getActiveTextTrack();
        expect(activeTrack.enabled).toBe(true);
        expect(activeTrack.id).toBe(tracks[1].id);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('does not re-enable subtitles', function(done) {
      var tracks;
      player.load(newSource(languagesManifest)).then(function() {
        tracks = player.getTextTracks();
        player.selectTextTrack(tracks[0].id);
        player.enableTextTrack(false);
        return delay(0.1);
      }).then(function() {
        var activeTrack = getActiveTextTrack();
        expect(activeTrack.enabled).toBe(false);
        expect(activeTrack.id).toBe(tracks[0].id);

        player.selectTextTrack(tracks[1].id);
        return delay(0.1);
      }).then(function() {
        activeTrack = getActiveTextTrack();
        expect(activeTrack.enabled).toBe(false);
        expect(activeTrack.id).toBe(tracks[1].id);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('setPlaybackRate', function() {
    it('plays faster for rates above 1', function(done) {
      var timestamp;
      player.load(newSource(plainManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(0.0);
        timestamp = video.currentTime;
        player.setPlaybackRate(2.0);
        return delay(3.0);
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(
            timestamp + 6.0 - FUDGE_FACTOR);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('plays in reverse for negative rates', function(done) {
      var timestamp;
      player.load(newSource(plainManifest)).then(function() {
        video.play();
        return waitForTargetTime(video, eventManager, 3.0, 5.0);
      }).then(function() {
        timestamp = video.currentTime;
        player.setPlaybackRate(-1.0);
        return waitForMovement(video, eventManager);
      }).then(function() {
        return delay(2.0);
      }).then(function() {
        expect(video.currentTime).toBeLessThan(timestamp - 2.0 + FUDGE_FACTOR);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('plays in reverse past the buffered area', function(done) {
      var timestamp;
      // Start in the second segment.
      player.setPlaybackStartTime(10);
      player.load(newSource(plainManifest)).then(function() {
        timestamp = video.currentTime;
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        expect(video.buffered.length).toBe(1);
        expect(video.buffered.start(0)).toBeGreaterThan(5);
        player.setPlaybackRate(-3.0);
        return waitForMovement(video, eventManager);
      }).then(function() {
        return delay(4.0);
      }).then(function() {
        expect(video.currentTime).toBeLessThan(0.1);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('pauses while rewinding', function(done) {
      var timestamp;
      player.setPlaybackStartTime(45);
      player.load(newSource(plainManifest)).then(function() {
        video.play();
        return waitForTargetTime(video, eventManager, 49, 6);
      }).then(function() {
        player.setPlaybackRate(-1.0);
        return delay(2.0);
      }).then(function() {
        video.pause();
        timestamp = video.currentTime;
        return delay(3.0);
      }).then(function() {
        expect(video.paused).toBe(true);
        expect(video.currentTime).toBe(timestamp);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('does not rewind while paused', function(done) {
      var timestamp;
      player.setPlaybackStartTime(45);
      player.load(newSource(plainManifest)).then(function() {
        video.play();
        return waitForTargetTime(video, eventManager, 49, 6);
      }).then(function() {
        video.pause();
        timestamp = video.currentTime;
        return delay(3.0);
      }).then(function() {
        player.setPlaybackRate(-1.0);
        return delay(2.0);
      }).then(function() {
        expect(video.paused).toBe(true);
        expect(video.currentTime).toBe(timestamp);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('rewinds after pausing', function(done) {
      var timestamp;
      player.setPlaybackStartTime(45);
      player.load(newSource(plainManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        player.setPlaybackRate(-1.0);
        return delay(2.0);
      }).then(function() {
        video.pause();
        timestamp = video.currentTime;
        return delay(3.0);
      }).then(function() {
        video.play();
        return delay(2.0);
      }).then(function() {
        expect(video.paused).toBe(false);
        expect(video.currentTime).toBeLessThan(timestamp);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('getStats', function() {
    it('updates playTime', function(done) {
      var oldPlayTime;
      player.load(newSource(plainManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        oldPlayTime = player.getStats().playTime;
        return delay(1.0);
      }).then(function() {
        expect(player.getStats().playTime).toBeGreaterThan(
            oldPlayTime + 1.0 - FUDGE_FACTOR);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('configuring the preferredLanguage', function() {
    it('changes the default tracks', function(done) {
      var originalAudioId;
      var originalTextId;

      player.load(newSource(languagesManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        var activeAudioTrack = getActiveAudioTrack();
        expect(activeAudioTrack.lang).toBe('en');
        originalAudioId = activeAudioTrack.id;

        var activeTextTrack = getActiveTextTrack();
        expect(activeTextTrack.lang).toBe('en');
        originalTextId = activeTextTrack.id;

        player.configure({'preferredLanguage': 'fr'});
        return player.load(newSource(languagesManifest));
      }).then(function() {
        var activeAudioTrack = getActiveAudioTrack();
        expect(activeAudioTrack.lang).toBe('fr');
        expect(activeAudioTrack.id).not.toBe(originalAudioId);

        var activeTextTrack = getActiveTextTrack();
        expect(activeTextTrack.lang).toBe('fr');
        expect(activeTextTrack.id).not.toBe(originalTextId);

        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('enables text tracks when no matching audio is found', function(done) {
      player.configure({'preferredLanguage': 'el'});
      player.load(newSource(languagesManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        var activeAudioTrack = getActiveAudioTrack();
        expect(activeAudioTrack.lang).toBe('en');

        var activeTextTrack = getActiveTextTrack();
        expect(activeTextTrack.lang).toBe('el');
        expect(activeTextTrack.enabled).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('disables text tracks when matching audio is found', function(done) {
      player.configure({'preferredLanguage': 'fr'});
      player.load(newSource(languagesManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        var activeAudioTrack = getActiveAudioTrack();
        expect(activeAudioTrack.lang).toBe('fr');

        var activeTextTrack = getActiveTextTrack();
        expect(activeTextTrack.lang).toBe('fr');
        expect(activeTextTrack.enabled).toBe(false);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('respects the \'main\' attribute', function(done) {
      // There are no Thai audio AdaptationSets in the MPD, but the English
      // audio AdaptationSet is marked as main, so even though it is not the
      // first AdaptationSet, it should be preferred.
      player.configure({'preferredLanguage': 'th'});

      player.load(newSource(languagesManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        var activeAudioTrack = getActiveAudioTrack();
        expect(activeAudioTrack.lang).toBe('en');
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('configuring restrictions', function() {
    it('ignores video tracks above the maximum height', function(done) {
      player.load(newSource(encryptedManifest)).then(function() {
        var hdVideoTrack = getVideoTrackByHeight(720);
        var sdVideoTrack = getVideoTrackByHeight(480);
        expect(hdVideoTrack).not.toBe(null);
        expect(sdVideoTrack).not.toBe(null);

        var restrictions = player.getConfiguration()['restrictions'];
        restrictions.maxHeight = 480;
        player.configure({'restrictions': restrictions});

        hdVideoTrack = getVideoTrackByHeight(720);
        sdVideoTrack = getVideoTrackByHeight(480);
        expect(hdVideoTrack).toBe(null);
        expect(sdVideoTrack).not.toBe(null);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('ignores video tracks above the maximum width', function(done) {
      player.load(newSource(encryptedManifest)).then(function() {
        var hdVideoTrack = getVideoTrackByHeight(720);
        var sdVideoTrack = getVideoTrackByHeight(480);
        expect(hdVideoTrack).not.toBe(null);
        expect(sdVideoTrack).not.toBe(null);

        var restrictions = player.getConfiguration()['restrictions'];
        restrictions.maxWidth = 854;
        player.configure({'restrictions': restrictions});

        hdVideoTrack = getVideoTrackByHeight(720);
        sdVideoTrack = getVideoTrackByHeight(480);
        expect(hdVideoTrack).toBe(null);
        expect(sdVideoTrack).not.toBe(null);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('takes effect before the source is loaded', function(done) {
      var restrictions = player.getConfiguration()['restrictions'];
      restrictions.maxHeight = 480;
      player.configure({'restrictions': restrictions});

      player.load(newSource(encryptedManifest)).then(function() {
        var hdVideoTrack = getVideoTrackByHeight(720);
        var sdVideoTrack = getVideoTrackByHeight(480);
        expect(hdVideoTrack).toBe(null);
        expect(sdVideoTrack).not.toBe(null);

        var restrictions = player.getConfiguration()['restrictions'];
        restrictions.maxHeight = null;
        player.configure({'restrictions': restrictions});

        hdVideoTrack = getVideoTrackByHeight(720);
        sdVideoTrack = getVideoTrackByHeight(480);
        expect(hdVideoTrack).not.toBe(null);
        expect(sdVideoTrack).not.toBe(null);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('fires error if all tracks restricted while playing', function(done) {
      player.removeEventListener('error', convertErrorToTestFailure, false);
      var onError = jasmine.createSpy('onError');
      player.addEventListener('error', onError, false);

      player.load(newSource(plainManifest)).then(function() {
        waitForMovement(video, eventManager);
      }).then(function() {
        var restrictions = player.getConfiguration()['restrictions'];
        restrictions.maxBandwidth = 10000;
        player.configure({'restrictions': restrictions});

        expect(onError.calls.any()).toBe(true);
        expect(player.getVideoTracks().length).toBe(0);

        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('fires error if all tracks restricted before playing', function(done) {
      player.removeEventListener('error', convertErrorToTestFailure, false);
      var onError = jasmine.createSpy('onError');
      player.addEventListener('error', onError, false);

      var restrictions = player.getConfiguration()['restrictions'];
      restrictions.maxBandwidth = 10000;
      player.configure({'restrictions': restrictions});

      player.load(newSource(encryptedManifest)).then(function() {
        fail();
      }).catch(function(error) {
        expect(onError.calls.any()).toBe(true);
        done();
      });
    });
  });

  describe('interpretContentProtection', function() {
    function newSourceWithIcp(icp) {
      var estimator = new shaka.util.EWMABandwidthEstimator();
      return new shaka.player.DashVideoSource(encryptedManifest,
                                              icp,
                                              estimator);
    }

    it('can still use the old-style ContentProtectionCallback', function(done) {
      function icp(contentProtection) {
        // Call utility function from util.js.
        var configs = interpretContentProtection(
            contentProtection.schemeIdUri, contentProtection);
        var c = configs[0];
        // Translate to DrmSchemeInfo.
        var drmSchemeInfo = new shaka.player.DrmSchemeInfo(
            c['keySystem'],
            c['licenseServerUrl'],
            c['withCredentials'],
            c['initData']);
        return drmSchemeInfo;
      }

      player.load(newSourceWithIcp(icp)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(0.0);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('calls the license post-processor', function(done) {
      var licensePostProcessor;

      function icp(schemeIdUri, contentProtection) {
        // Call utility function from util.js.
        var configs =
            interpretContentProtection(schemeIdUri, contentProtection);
        // Ensure we're not overwriting a post-processor that we need.
        expect(licensePostProcessor.spy).toBeTruthy();
        expect(configs[0]['licensePostProcessor']).toBeFalsy();
        configs[0]['licensePostProcessor'] = licensePostProcessor.spy;
        return configs;
      }

      var licensePostProcessor = {
        spy: function(response) { return response; }
      };

      spyOn(licensePostProcessor, 'spy').and.callThrough();

      player.load(newSourceWithIcp(icp)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        expect(licensePostProcessor.spy).toHaveBeenCalled();
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('calls the license pre-processor', function(done) {
      var originalLicenseServerUrl;
      var licensePreProcessor;

      function icp(schemeIdUri, contentProtection) {
        // Call utility function from util.js.
        var configs =
            interpretContentProtection(schemeIdUri, contentProtection);
        // Save the license server URL so that we can check that it gets passed
        // to the pre-processor.
        originalLicenseServerUrl = configs[0]['licenseServerUrl'];
        // Ensure we're not overwriting a pre-processor that we need.
        expect(configs[0]['licensePreProcessor']).toBeFalsy();
        configs[0]['licensePreProcessor'] = licensePreProcessor.spy;
        return configs;
      }

      var licensePreProcessor = {
        spy: function(info) {
          expect(info.url).toBe(originalLicenseServerUrl);

          expect(info.body instanceof ArrayBuffer);
          expect(info.body.length).not.toBe(0);

          expect(info.method).toBe('POST');

          expect(info.headers).toBeTruthy();
          expect(info.headers instanceof Object);

          // Override the values so that we can check that they get passed
          // to the LicenseRequest constructor.
          info.url = info.url + '?arbitrary_data';
          info.body = 'invalid_body';
          info.method = 'GET';
          info.headers['extra_header'] = 'extra_header_value';

          return info;
        }
      };

      var LicenseRequest = shaka.util.LicenseRequest;

      spyOn(window.shaka.util, 'LicenseRequest').and.callFake(
          function(url, body, method, withCredentials, opt_extraHeaders) {
            expect(originalLicenseServerUrl).toBeTruthy();
            expect(url).toBe(originalLicenseServerUrl + '?arbitrary_data');
            expect(body).toBe('invalid_body');
            expect(method).toBe('GET');
            expect(opt_extraHeaders['extra_header']).toBe('extra_header_value');

            var request = new LicenseRequest(
                url, body, method, withCredentials, opt_extraHeaders);

            spyOn(request, 'send').and.callFake(function() {
              // EmeManager will call send(); pass the test but fail the call
              // since the modified request will fail anyways. Note that
              // because done() is called here, the rejected promise will not
              // trigger a test failure.
              done();
              var error = new Error();
              error.type = 'fake';
              return Promise.reject(error);
            });

            return request;
          });

      spyOn(licensePreProcessor, 'spy').and.callThrough();

      player.load(newSourceWithIcp(icp)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        expect(licensePreProcessor.spy).toHaveBeenCalled();
        // done() is called from the LicenseRequest.send() spy above.
      }).catch(function(error) {
        if (error.type != 'destroy') {
          fail(error);
          done();
        }
      });
    });
  });

  describe('configure and getConfiguration', function() {
    it('rejects an invalid enableAdaptation', function() {
      var exception;
      try {
        player.configure({'enableAdaptation': 2});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);
    });

    it('gets/sets stream buffer size', function() {
      var original = player.getConfiguration()['streamBufferSize'];
      expect(original).not.toBe(5);
      expect(original).toBe(shaka.player.Defaults.STREAM_BUFFER_SIZE);

      expect(player.getConfiguration()['streamBufferSize']).toBe(original);

      player.configure({'streamBufferSize': 5});
      expect(player.getConfiguration()['streamBufferSize']).toBe(5);

      player.configure({'streamBufferSize': original});
      expect(player.getConfiguration()['streamBufferSize']).toBe(original);
    });


    it('rejects an invalid streamBufferSize', function() {
      var exception;

      try {
        player.configure({'streamBufferSize': 'three seconds'});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);

      try {
        player.configure({'streamBufferSize': -1});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof RangeError).toBe(true);
    });

    it('gets/sets LicenseRequest timeout', function() {
      var original = player.getConfiguration()['licenseRequestTimeout'];
      expect(original).not.toBe(5);
      expect(original).toBe(shaka.player.Defaults.LICENSE_REQUEST_TIMEOUT);

      expect(player.getConfiguration()['licenseRequestTimeout']).toBe(original);

      player.configure({'licenseRequestTimeout': 5});
      expect(player.getConfiguration()['licenseRequestTimeout']).toBe(5);

      player.configure({'licenseRequestTimeout': original});
      expect(player.getConfiguration()['licenseRequestTimeout']).toBe(original);
    });

    it('rejects an invalid LicenseRequest timeout', function() {
      var exception;

      try {
        player.configure({'licenseRequestTimeout': 'five seconds'});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);

      try {
        player.configure({'licenseRequestTimeout': NaN});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof RangeError).toBe(true);
    });

    it('gets/sets MpdRequest timeout', function() {
      var original = player.getConfiguration()['mpdRequestTimeout'];
      expect(original).not.toBe(5);
      expect(original).toBe(shaka.player.Defaults.MPD_REQUEST_TIMEOUT);

      expect(player.getConfiguration()['mpdRequestTimeout']).toBe(original);

      player.configure({'mpdRequestTimeout': 5});
      expect(player.getConfiguration()['mpdRequestTimeout']).toBe(5);

      player.configure({'mpdRequestTimeout': original});
      expect(player.getConfiguration()['mpdRequestTimeout']).toBe(original);
    });

    it('rejects an invalid MpdRequest timeout', function() {
      var exception;

      try {
        player.configure({'mpdRequestTimeout': 'seven seconds'});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);

      try {
        player.configure({'mpdRequestTimeout': Number.NEGATIVE_INFINITY});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof RangeError).toBe(true);
    });

    it('gets/sets SegmentRequest timeout', function() {
      var original = player.getConfiguration()['segmentRequestTimeout'];
      expect(original).not.toBe(5);
      expect(original).toBe(shaka.player.Defaults.SEGMENT_REQUEST_TIMEOUT);

      expect(player.getConfiguration()['segmentRequestTimeout']).toBe(original);

      player.configure({'segmentRequestTimeout': 5});
      expect(player.getConfiguration()['segmentRequestTimeout']).toBe(5);

      player.configure({'segmentRequestTimeout': original});
      expect(player.getConfiguration()['segmentRequestTimeout']).toBe(original);
    });

    it('rejects an invalid SegmentRequest timeout', function() {
      var exception;

      try {
        player.configure({'segmentRequestTimeout': 'eleven seconds'});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);

      try {
        player.configure({'segmentRequestTimeout': Number.POSITIVE_INFINITY});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof RangeError).toBe(true);
    });

    it('rejects an invalid preferredLanguage', function() {
      var exception;
      try {
        player.configure({'preferredLanguage': 13});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);
    });

    it('gets/sets multiple options at once', function() {
      var restrictions = new shaka.player.Restrictions();
      restrictions.maxWidth = 1280;
      var originalConfig = player.getConfiguration();
      var config = {
        'enableAdaptation': true,
        'streamBufferSize': 17,
        'licenseRequestTimeout': 19,
        'mpdRequestTimeout': 23,
        'segmentRequestTimeout': 29,
        'preferredLanguage': 'fr',
        'restrictions': restrictions
      };
      player.configure(config);
      expect(JSON.stringify(player.getConfiguration()))
          .toBe(JSON.stringify(config));
      player.configure(originalConfig);
    });
  });

  it('plays VP9 WebM', function(done) {
    player.load(newSource(webmManifest)).then(function() {
      video.play();
      return waitForMovement(video, eventManager);
    }).then(function() {
      expect(video.currentTime).toBeGreaterThan(0.0);
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  });

  it('dispatches errors on failure', function(done) {
    player.removeEventListener('error', convertErrorToTestFailure, false);
    var onError = jasmine.createSpy('onError');
    player.addEventListener('error', onError, false);

    // Ignore any errors in the promise chain.
    player.load(newSource(bogusManifest)).catch(function(error) {}).then(
        function() {
          // Expect the error handler to have been called.
          expect(onError.calls.any()).toBe(true);
          done();
        });
  });

  it('respects autoplay=true', function(done) {
    video.autoplay = true;

    player.load(newSource(plainManifest)).then(function() {
      return waitForMovement(video, eventManager);
    }).then(function() {
      expect(video.currentTime).toBeGreaterThan(0.0);
      expect(video.paused).toBe(false);
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  });

  it('respects autoplay=false', function(done) {
    video.autoplay = false;

    player.load(newSource(plainManifest)).then(function() {
      return delay(4);
    }).then(function() {
      expect(video.currentTime).toBe(0);
      expect(video.paused).toBe(true);
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  });

  it('does not count buffering on startup', function(done) {
    var eventFired = false;
    player.addEventListener('bufferingStart', function() {
      eventFired = true;
    });

    delay(1).then(function() {
      expect(video.currentTime).toBe(0);
      expect(player.getStats().bufferingHistory.length).toBe(0);
      expect(eventFired).toBe(false);

      video.autoplay = true;
      return player.load(newSource(plainManifest));
    }).then(function() {
      return waitForMovement(video, eventManager);
    }).then(function() {
      expect(video.currentTime).not.toBe(0);
      expect(player.getStats().bufferingHistory.length).toBe(0);
      expect(eventFired).toBe(false);

      eventFired = false;
      return player.load(newSource(plainManifest));
    }).then(function() {
      video.pause();
      return delay(1);
    }).then(function() {
      expect(video.currentTime).toBe(0);
      expect(player.getStats().bufferingHistory.length).toBe(0);
      expect(eventFired).toBe(false);

      eventFired = false;
      video.autoplay = false;
      return player.load(newSource(plainManifest));
    }).then(function() {
      return delay(1);
    }).then(function() {
      expect(video.currentTime).toBe(0);
      expect(player.getStats().bufferingHistory.length).toBe(0);
      expect(eventFired).toBe(false);

      done();
    }).catch(function(error) {
      video.autoplay = false;
      fail(error);
      done();
    });
  });

  describe('end-of-stream behavior', function(done) {
    // The "exact" duration of the content specified by |plainManifest|.
    var plainManifestDuration = 181.43107777777777;

    it('permits looping', function(done) {
      video.loop = true;
      player.load(newSource(plainManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        video.currentTime = video.duration - 2;
        return waitFor(30, function() {
          return video.currentTime > 0 && video.currentTime < 5;
        }, function(error) {
          error.message = 'Timeout waiting for loop, currentTime = ' +
                          video.currentTime;
        });
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(0);
        expect(video.currentTime).toBeLessThan(5);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('permits looping with playbackStartTime', function(done) {
      video.autoplay = true;
      video.loop = true;
      player.setPlaybackStartTime(plainManifestDuration - 1);
      player.load(newSource(plainManifest)).then(function() {
        // Ensure playback has started near |plainManifestDuration| - 1.
        expect(video.currentTime).toBeGreaterThan(
            plainManifestDuration - 1 - 0.1);
        expect(video.currentTime).toBeLessThan(
            plainManifestDuration - 1 + 0.1);
        return waitFor(30, function() {
          return video.currentTime > 0 && video.currentTime < 5;
        });
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(0);
        expect(video.currentTime).toBeLessThan(5);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('permits looping without initial buffering', function(done) {
      video.autoplay = true;
      video.loop = true;
      player.load(newSource(plainManifest)).then(function() {
        // Note: the browser does not immediately set the video's duration.
        video.currentTime = plainManifestDuration;
        return waitFor(30, function() {
          return video.currentTime > 0 && video.currentTime < 5;
        });
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(0);
        expect(video.currentTime).toBeLessThan(5);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('permits looping if the playhead is past the duration', function(done) {
      video.loop = true;
      player.load(newSource(plainManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        video.currentTime = video.duration + 10;
        return waitFor(30, function() {
          return video.currentTime > 0 && video.currentTime < 5;
        });
      }).then(function() {
        expect(video.currentTime).toBeGreaterThan(0);
        expect(video.currentTime).toBeLessThan(5);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('buffering', function() {
    // Tests that using a streamBufferSize < minBufferTime does not cause
    // the player to hang after re-buffering. Issue #166.
    it('does not stop playback after re-buffering', function(done) {
      // Don't fail from fake errors.
      player.removeEventListener('error', convertErrorToTestFailure, false);
      player.addEventListener(
          'error',
          function(event) {
            if (event.detail.message != 'Fake network failure.') {
              fail(event.detail);
            }
          },
          false);

      // Set the initial streamBufferSize to be less than the default (so we
      // can run the test faster) but larger than minBufferTime (so we don't
      // potentially trigger a separate bug, see the test below).
      player.configure({'streamBufferSize': 8});

      var originalLoad = shaka.player.StreamVideoSource.prototype.load;
      shaka.player.StreamVideoSource.prototype.load = function() {
        expect(this.manifestInfo).not.toBe(null);
        this.manifestInfo.minBufferTime = 2;
        return originalLoad.call(this);
      };

      var originalSend = shaka.util.AjaxRequest.prototype.send;

      player.load(newSource(plainManifest)).then(function() {
        shaka.player.StreamVideoSource.prototype.load = originalLoad;
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        player.configure({'streamBufferSize': 2});

        // Start blocking network requests.
        shaka.util.AjaxRequest.prototype.send = function() {
          shaka.asserts.assert(this.xhr_ == null);
          this.xhr_ = new XMLHttpRequest();
          var error = new Error('Fake network failure.');
          error.type = 'net';
          error.status = 0;
          error.url = this.url;
          error.method = this.parameters.method;
          error.body = this.parameters.body;
          error.xhr = this.xhr_;
          this.promise_.reject(error);
          return this.promise_;
        };
        return delay(12);
      }).then(function() {
        // Ensure the player is in a buffering state.
        expect(video.paused).toBe(true);
        // Start allowing network requests again.
        shaka.util.AjaxRequest.prototype.send = originalSend;
        return waitForMovement(video, eventManager);
      }).then(function() {
        expect(video.paused).toBe(false);
        done();
      }).catch(function(error) {
        shaka.player.StreamVideoSource.prototype.load = originalLoad;
        shaka.util.AjaxRequest.prototype.send = originalSend;

        fail(error);
        done();
      });
    });

    // Tests that using a streamBufferSize < minBufferTime does not cause
    // the player to hang during startup. Issue #166.
    it('does not stop playback during startup', function(done) {
      player.configure({'streamBufferSize': 5});

      var originalLoad = shaka.player.StreamVideoSource.prototype.load;
      shaka.player.StreamVideoSource.prototype.load = function() {
        expect(this.manifestInfo).not.toBe(null);
        this.manifestInfo.minBufferTime = 7;
        return originalLoad.call(this);
      };

      player.load(newSource(plainManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        done();
      }).catch(function(error) {
        shaka.player.StreamVideoSource.prototype.load = originalLoad;

        fail(error);
        done();
      });
    });
  });

  describe('destroy', function() {
    it('does not cause exceptions after load', function(done) {
      // Satisfy Jasmine, which complains if tests have no expectations.
      expect(true).toBe(true);
      // Load the manifest, then wait.
      player.load(newSource(encryptedManifest)).then(function() {
        player.destroy();
        // Wait 1 second for async exceptions.
        // Jasmine will convert them to test failures.
        delay(1).then(done);
      });
    });

    it('does not cause exceptions immediately', function(done) {
      // Satisfy Jasmine, which complains if tests have no expectations.
      expect(true).toBe(true);
      // Chrome complains if you don't catch all failed Promises.
      player.load(newSource(encryptedManifest)).catch(function() {});
      // Now destroy the player without letting it finish loading.
      player.destroy();
      // Wait 1 second for async exceptions.
      // Jasmine will convert them to test failures.
      delay(1).then(done);
    });

    for (var ms = 1; ms <= 1000; ms *= 5) {
      it('does not cause exceptions after ' + ms + ' ms', function(ms, done) {
        // Satisfy Jasmine, which complains if tests have no expectations.
        expect(true).toBe(true);
        // Chrome complains if you don't catch all failed Promises.
        player.load(newSource(encryptedManifest)).catch(function() {});
        // Now destroy the player after the specified delay.
        delay(ms / 1000).then(function() {
          player.destroy();
          // Wait 1 additional second for async exceptions.
          // Jasmine will convert them to test failures.
          delay(1).then(done);
        });
      }.bind(this, ms));
    }
  });

  // TODO(story 1970528): add tests which exercise PSSH parsing,
  // SegmentTemplate resolution, and SegmentList generation.

  /**
   * @param {number} targetHeight
   * @return {shaka.player.VideoTrack} or null if not found.
   */
  function getVideoTrackByHeight(targetHeight) {
    var tracks = player.getVideoTracks();
    for (var i = 0; i < tracks.length; ++i) {
      if (tracks[i].height == targetHeight) {
        return tracks[i];
      }
    }

    return null;
  }

  /**
   * @return {shaka.player.TextTrack} or null if not found.
   */
  function getActiveTextTrack() {
    var tracks = player.getTextTracks();
    for (var i = 0; i < tracks.length; ++i) {
      if (tracks[i].active) {
        return tracks[i];
      }
    }
    return null;
  }

  /**
   * @return {shaka.player.AudioTrack} or null if not found.
   */
  function getActiveAudioTrack() {
    var tracks = player.getAudioTracks();
    for (var i = 0; i < tracks.length; ++i) {
      if (tracks[i].active) {
        return tracks[i];
      }
    }
    return null;
  }
});

