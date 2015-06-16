/**
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
 *
 * @fileoverview Live integration tests.
 */

goog.require('shaka.dash.MpdRequest');
goog.require('shaka.media.Stream');
goog.require('shaka.player.Player');
goog.require('shaka.polyfill.installAll');
goog.require('shaka.util.EventManager');

describe('Player', function() {
  var originalTimeout;
  var originalSend;
  var video;
  var videoSource;
  var player;
  var eventManager;

  const segmentDurationManifestUrl =
      'http://vm2.dashif.org/livesim/testpic_6s/Manifest.mpd';
  const googleStorageUrl = 'http://storage.googleapis.com/';
  const segmentTimeDir =
      googleStorageUrl + 'widevine-demo-media/oops-segment-timeline-time/';
  const segmentTimeMpd =
      segmentTimeDir + 'oops-segment-timeline-time-oops_video.mpd';
  const segmentNumberDir =
      googleStorageUrl + 'widevine-demo-media/oops-segment-timeline-number/';
  const segmentNumberMpd =
      segmentNumberDir + 'oops-segment-timeline-number-oops_video.mpd';
  const segmentNumberMinusFiveMpd =
      segmentNumberDir + 'oops-segment-timeline-number-oops_video_minus_5.mpd';
  const segmentNumberPlusFiveMpd =
      segmentNumberDir + 'oops-segment-timeline-number-oops_video_plus_5.mpd';

  const FUDGE_FACTOR = 5;
  const SMALL_FUDGE_FACTOR = 2;
  const SEEK_OFFSET = 10000;

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
    video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.width = 600;
    video.height = 400;

    // Add it to the DOM.
    document.body.appendChild(video);

    // Hijack MpdRequest to set @availabilityStartTime for all MPDs from
    // Cloud Storage to simulate dynamically generated MPDs.
    // Note: currentTime - @availabilityStartTime must be at least as long as
    // the video.
    var availabilityStartTime = (Date.now() / 1000.0) - 300;
    originalSend = shaka.dash.MpdRequest.prototype.send;
    shaka.dash.MpdRequest.prototype.send = function() {
      return originalSend.call(this).then(
          function(mpd) {
            if (this.url.toString().indexOf(googleStorageUrl) >= 0) {
              mpd.availabilityStartTime = availabilityStartTime;
            }
            return Promise.resolve(mpd);
          }.bind(this));
    };
  });

  beforeEach(function() {
    // Create a new player.
    player = new shaka.player.Player(video);
    player.addEventListener('error', convertErrorToTestFailure, false);

    // Disable automatic adaptation unless it is needed for a test.
    // This makes test results more reproducible.
    player.enableAdaptation(false);

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

    // Restore send().
    shaka.dash.MpdRequest.prototype.send = originalSend;

    // Restore the timeout.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    // Restore normal assertion behavior.
    assertsToFailures.uninstall();
  });

  describe('live support for segment duration template', function() {
    beforeEach(function() {
      videoSource = newSource(segmentDurationManifestUrl);
    });

    it('plays two full segments of content', function(done) {
      const SEGMENT_LENGTH = 6;

      var setTestExpectations = function() {
        var targetTime = video.currentTime + (2 * SEGMENT_LENGTH);
        var waitTime = (2 * SEGMENT_LENGTH) + FUDGE_FACTOR;

        waitForTargetTime(
            video, eventManager, targetTime, waitTime).then(function() {
          done();
        }).catch(function(error) {
          fail(error);
          done();
        });
      };

      waitForBeginPlayback(setTestExpectations);

      player.load(videoSource).then(function() {
        video.play();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('returns to seek range when seeking before start', function(done) {
      seekBeforeRange(videoSource, done);
    });

    it('returns to end of seek range when after end', function(done) {
      seekAfterRange(videoSource, done);
    });
  });

  describe('live support for segment number template', function() {
    beforeEach(function() {
      videoSource = newSource(segmentNumberMpd);
    });

    it('requests MPD update in expected time', function(done) {
      requestMpdUpdate(segmentNumberMpd, videoSource, done);
    });

    it('returns to seek range when seeking before start', function(done) {
      seekBeforeRange(videoSource, done);
    });

    it('returns to end of seek range when after end', function(done) {
      seekAfterRange(videoSource, done);
    });

    it('corrects a timestamp that is behind', function(done) {
      correctTimestamp(segmentNumberMinusFiveMpd, 18, done);
    });

    it('corrects a timestamp that is ahead', function(done) {
      correctTimestamp(segmentNumberPlusFiveMpd, 19, done);
    });
  });

  describe('live support for segment time template', function() {
    beforeEach(function() {
      videoSource = newSource(segmentTimeMpd);
    });

    it('requests MPD update in expected time', function(done) {
      requestMpdUpdate(segmentTimeMpd, videoSource, done);
    });

    it('returns to seek range when seeking before start', function(done) {
      seekBeforeRange(videoSource, done);
    });

    it('returns to end of seek range when after end', function(done) {
      seekAfterRange(videoSource, done);
    });
  });

  /**
   * Passes test if timestamp is corrected properly and playback starts.
   * @param {string} manifestUrl
   * @param {number} initalReference The reference at which playback will start.
   * @param {!done} done The done function, to signal the end of this test.
   */
  function correctTimestamp(manifestUrl, initialReference, done) {
    videoSource = newSource(manifestUrl);
    var setTestExpectations = function(segmentIndexes) {
      console.assert(segmentIndexes.length > 0);
      var index = segmentIndexes[0];
      expect(video.buffered.start(0)).toEqual(
          index.references[initialReference].startTime);
      waitForMovement(video, eventManager).then(function() {
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    };

    waitForBeginPlayback(setTestExpectations);

    player.load(videoSource).then(function() {
      video.play();
    }).catch(function(error) {
      fail(error);
      done();
    });
  }

  /**
   * Passes test when MpdRequest is sent.
   * @param {string} targetMpdUrl The url that should be used in the MpdRequest.
   * @param {!IVideoSource} videoSource
   * @param {!done} done The done function, to signal the end of this test.
   */
  function requestMpdUpdate(targetMpdUrl, videoSource, done) {
    player.load(videoSource).then(function() {
      video.play();
      return waitForMovement(video, eventManager);
    }).then(function() {
      // Seek back to ensure there is enough video to get an update.
      video.currentTime -= 10;
      return waitForMpdRequest(targetMpdUrl);
    }).then(function() {
      expect(video.currentTime).toBeGreaterThan(0.0);
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  }

  /**
   * Seeks before the seek range start, then completes if video snaps back to
   * seek range start or fails otherwise.
   * @param {!IVideoSource} videoSource
   * @param {!done} done The done function, to signal the end of this test.
   */
  function seekBeforeRange(videoSource, done) {
    // There are two 'seekrangechanged' events prior to beginning the playback.
    // The second one includes the timestamp correction.
    var count = 0;

    var continueTest = function(event) {
      if (++count < 2) return;
      eventManager.unlisten(videoSource, 'seekrangechanged');
      var seekStart = event.start;
      delay(1.0).then(function() {
        video.currentTime = seekStart - SEEK_OFFSET;
        return waitForMovement(video, eventManager);
      }).then(function() {
        expect(videoSource.video.currentTime).toBeGreaterThan(
            seekStart - SMALL_FUDGE_FACTOR);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    };

    eventManager.listen(videoSource, 'seekrangechanged', continueTest);
    player.load(videoSource).then(function() {
      video.play();
    }).catch(function(error) {
      fail(error);
      done();
    });
  }

  /**
   * Seeks after the seek range end, then completes if video snaps back to seek
   * range end or fails otherwise.
   * @param {!IVideoSource} videoSource
   * @param {!done} done The done function, to signal the end of this test.
   */
  function seekAfterRange(videoSource, done) {
    var count = 0;

    var continueTest = function(event) {
      if (++count < 2) return;
      eventManager.unlisten(videoSource, 'seekrangechanged');
      var seekEnd = event.end;
      delay(1.0).then(function() {
        video.currentTime = seekEnd + SEEK_OFFSET;
        return waitForMovement(video, eventManager);
      }).then(function() {
        expect(videoSource.video.currentTime).toBeLessThan(
            seekEnd + SMALL_FUDGE_FACTOR);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    };

    eventManager.listen(videoSource, 'seekrangechanged', continueTest);
    player.load(videoSource).then(function() {
      video.play();
    }).catch(function(error) {
      fail(error);
      done();
    });
  }

  /**
   * @param {string} targetMpdUrl The url that should be used in the MpdRequest.
   * {!Promise} resolved when an MpdRequest has been sent.
   */
  function waitForMpdRequest(targetMpdUrl) {
    var requestStatus = new shaka.util.PublicPromise();
    var MpdRequest = shaka.dash.MpdRequest;

    spyOn(window.shaka.dash, 'MpdRequest').and.callFake(function(mpdUrl) {
      expect(mpdUrl).toEqual(targetMpdUrl);
      var request = new MpdRequest(mpdUrl);
      spyOn(request, 'send').and.callFake(function() {
        requestStatus.resolve();
        var error = new Error();
        error.type = 'fake';
        return Promise.reject(error);
      });
      return request;
    });

    return requestStatus;
  }

  /**
   * Waits until beginPlayback_() has been called to catch the corrected
   * segmentIndexes, then bind it to the given function and set a Timeout to
   * call asynchronously.
   * @param {Function} fn The function to be called with the segmentIndexes.
   */
  function waitForBeginPlayback(fn) {
    var originalBeginPlayback = videoSource.beginPlayback_;
    videoSource.beginPlayback_ = function(segmentIndexes) {
      originalBeginPlayback.call(videoSource, segmentIndexes);
      // Do this async.
      window.setTimeout(fn.bind(null, segmentIndexes), 0);
    };
  }
});
