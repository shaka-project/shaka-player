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

goog.require('shaka.dash.MpdRequest');
goog.require('shaka.media.Stream');
goog.require('shaka.player.DashVideoSource');
goog.require('shaka.player.Player');
goog.require('shaka.polyfill.installAll');
goog.require('shaka.util.EWMABandwidthEstimator');
goog.require('shaka.util.LicenseRequest');
goog.require('shaka.util.RangeRequest');

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
  const bogusManifest = 'assets/does_not_exist';
  const highBitrateManifest =
      '//storage.googleapis.com/widevine-demo-media/sintel-1080p/dash.mpd';
  const FUDGE_FACTOR = 0.3;

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
    player.enableAdaptation(false);

    return player;
  }

  beforeAll(function() {
    // Hijack assertions and convert failed assertions into failed tests.
    assertsToFailures.install();

    // Change the timeout.
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;  // ms

    // Install polyfills.
    shaka.polyfill.installAll();

    // Create a video tag.  This will be visible so that long tests do not
    // create the illusion of the test-runner being hung.
    video = createVideo();
    document.body.appendChild(video);
  });

  beforeEach(function() {
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
  });

  afterAll(function() {
    // Remove the video tag from the DOM.
    document.body.removeChild(video);

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
  });

  describe('selectVideoTrack', function() {
    beforeEach(function(done) {
      // On some browsers, using the same video tag for these test cause the
      // tests to be flakely. So use a fresh video tag for each test.
      player.destroy().then(function() {
        document.body.removeChild(video);
        video = createVideo();
        document.body.appendChild(video);
        player = createPlayer(video);
        done();
      });
    });

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
        return delay(6.0);
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
      player.setStreamBufferSize(300);

      // Create a temporary shim to intercept and modify manifest info.
      var originalLoad = shaka.player.StreamVideoSource.prototype.load;
      shaka.player.StreamVideoSource.prototype.load = function(
          preferredLanguage) {
        var sets = this.manifestInfo.periodInfos[0].streamSetInfos;
        var audioSet = sets[0].contentType == 'audio' ? sets[0] : sets[1];
        expect(audioSet.contentType).toBe('audio');
        // Remove the video set to speed things up.
        this.manifestInfo.periodInfos[0].streamSetInfos = [audioSet];
        return originalLoad.call(this, preferredLanguage);
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
        return delay(8.0);
      }).then(function() {
        // The content is now buffered.
        expect(audioStreamBuffer.buffered.length).toBe(1);
        expect(audioStreamBuffer.buffered.start(0)).toBe(0);
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        // Power through and consume the audio data quickly.
        player.setPlaybackRate(4);
        return delay(5);
      }).then(function() {
        // Ensure that the browser has evicted the beginning of the stream.
        // Otherwise, this test hasn't reproduced the circumstances correctly.
        expect(audioStreamBuffer.buffered.start(0)).toBeGreaterThan(0);
        expect(video.currentTime).toBeGreaterThan(0);
        // Seek to the beginning, which is data we will have to re-download.
        player.setStreamBufferSize(10);
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
        return waitForTargetTime(video, eventManager, 33.0, 7.0);
      }).then(function() {
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('fires an event when seeking by zero ', function(done) {
      // StreamVideoSource assumes that seeking by zero will fire a seek event.
      var source = newSource(plainManifest);
      var onSeeking = jasmine.createSpy('onSeeking');

      player.load(source).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        video.addEventListener('seeking', onSeeking);
        video.currentTime += 0;
        expect(onSeeking.calls.count()).toEqual(0);
        return delay(0.5);
      }).then(function() {
        video.currentTime -= 0;
        expect(onSeeking.calls.count()).toEqual(1);
        return delay(0.5);
      }).then(function() {
        expect(onSeeking.calls.count()).toEqual(2);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
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

  describe('setPreferredLanguage', function() {
    it('changes the default tracks', function(done) {
      var originalAudioId;
      var originalTextId;

      player.load(newSource(languagesManifest)).then(function() {
        var activeAudioTrack = getActiveAudioTrack();
        expect(activeAudioTrack.lang).toBe('en');
        originalAudioId = activeAudioTrack.id;

        var activeTextTrack = getActiveTextTrack();
        expect(activeTextTrack.lang).toBe('en');
        originalTextId = activeTextTrack.id;

        player.setPreferredLanguage('fr');
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
      player.setPreferredLanguage('el');
      player.load(newSource(languagesManifest)).then(function() {
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
      player.setPreferredLanguage('fr');
      player.load(newSource(languagesManifest)).then(function() {
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
  });

  describe('setRestrictions', function() {
    it('ignores video tracks above the maximum height', function(done) {
      player.load(newSource(encryptedManifest)).then(function() {
        var hdVideoTrack = getVideoTrackByHeight(720);
        var sdVideoTrack = getVideoTrackByHeight(480);
        expect(hdVideoTrack).not.toBe(null);
        expect(sdVideoTrack).not.toBe(null);

        var restrictions = player.getRestrictions();
        restrictions.maxHeight = 480;
        player.setRestrictions(restrictions);

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

        var restrictions = player.getRestrictions();
        restrictions.maxWidth = 854;
        player.setRestrictions(restrictions);

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
      var restrictions = player.getRestrictions();
      restrictions.maxHeight = 480;
      player.setRestrictions(restrictions);

      player.load(newSource(encryptedManifest)).then(function() {
        var hdVideoTrack = getVideoTrackByHeight(720);
        var sdVideoTrack = getVideoTrackByHeight(480);
        expect(hdVideoTrack).toBe(null);
        expect(sdVideoTrack).not.toBe(null);

        var restrictions = player.getRestrictions();
        restrictions.maxHeight = null;
        player.setRestrictions(restrictions);

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
  });

  describe('interpretContentProtection', function() {
    function newSourceWithIcp(icp) {
      var estimator = new shaka.util.EWMABandwidthEstimator();
      return new shaka.player.DashVideoSource(encryptedManifest,
                                              icp,
                                              estimator);
    }

    it('calls the license post-processor', function(done) {
      var licensePostProcessor = {
        spy: function(response) { return response; }
      };

      function icp(contentProtection) {
        // Call utility function from util.js.
        var drmScheme = interpretContentProtection(contentProtection);
        // Ensure we're not overwriting a post-processor that we need.
        expect(drmScheme.licensePostProcessor).toBeNull();
        drmScheme.licensePostProcessor = licensePostProcessor.spy;
        return drmScheme;
      }

      spyOn(licensePostProcessor, 'spy').and.callThrough();

      player.load(newSourceWithIcp(icp)).then(function() {
        video.play();
        delay(0.5);
      }).then(function() {
        expect(licensePostProcessor.spy).toHaveBeenCalled();
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('calls the license pre-processor', function(done) {
      var licensePreProcessor = {
        spy: function(info) { return info; }
      };

      function icp(contentProtection) {
        // Call utility function from util.js.
        var drmScheme = interpretContentProtection(contentProtection);
        // Ensure we're not overwriting a pre-processor that we need.
        expect(drmScheme.licensePreProcessor).toBeNull();
        drmScheme.licensePreProcessor = licensePreProcessor.spy;
        return drmScheme;
      }

      spyOn(licensePreProcessor, 'spy').and.callThrough();

      player.load(newSourceWithIcp(icp)).then(function() {
        video.play();
        delay(0.5);
      }).then(function() {
        expect(licensePreProcessor.spy).toHaveBeenCalled();
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('setStreamBufferSize', function() {
    it('sets buffer size on streams', function() {
      var original = shaka.media.Stream.bufferSizeSeconds;
      player.setStreamBufferSize(5);
      expect(shaka.media.Stream.bufferSizeSeconds).toEqual(5);
      player.setStreamBufferSize(original);
    });
  });

  describe('getStreamBufferSize', function() {
    it('gets streams buffer size', function() {
      var original = shaka.media.Stream.bufferSizeSeconds;
      expect(player.getStreamBufferSize()).toEqual(original);
      player.setStreamBufferSize(5);
      expect(player.getStreamBufferSize()).toEqual(5);
      player.setStreamBufferSize(original);
      expect(player.getStreamBufferSize()).toEqual(original);
    });
  });

  describe('setLicenseRequestTimeout', function() {
    it('set timeout on LicenseRequests', function() {
      player.setLicenseRequestTimeout(5);
      var request = new shaka.util.LicenseRequest(
          'test.url.com', new ArrayBuffer(1024), false);
      expect(request.parameters.requestTimeoutMs).toEqual(5);
      player.setLicenseRequestTimeout(0);
    });
  });

  describe('setLicenseRequestTimeout', function() {
    it('sets timeout on MpdRequests', function() {
      player.setMpdRequestTimeout(10);
      var request = new shaka.dash.MpdRequest('test.url.com');
      expect(request.parameters.requestTimeoutMs).toEqual(10);
      player.setMpdRequestTimeout(0);
    });
  });

  describe('setLicenseRequestTimeout', function() {
    it('sets timeout on RangeRequests', function() {
      player.setRangeRequestTimeout(13);
      var request = new shaka.util.RangeRequest('test.url.com', 0, null);
      expect(request.parameters.requestTimeoutMs).toEqual(13);
      player.setRangeRequestTimeout(0);
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

