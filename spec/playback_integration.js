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

goog.require('shaka.asserts.assert');
goog.require('shaka.player.StreamVideoSource');
goog.require('shaka.util.AjaxRequest');
goog.require('shaka.util.EventManager');

describe('Playback', function() {
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

  describe('setPlaybackRate', function() {
    it('plays faster for rates above 1', function(done) {
      var timestamp;
      player.load(newSource(manifests.plainManifest)).then(function() {
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
      player.load(newSource(manifests.plainManifest)).then(function() {
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
      player.load(newSource(manifests.plainManifest)).then(function() {
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
      player.load(newSource(manifests.plainManifest)).then(function() {
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
      player.load(newSource(manifests.plainManifest)).then(function() {
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
      player.load(newSource(manifests.plainManifest)).then(function() {
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

  it('plays VP9 WebM', function(done) {
    player.load(newSource(manifests.webmManifest)).then(function() {
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

  describe('end-of-stream behavior', function(done) {
    // The "exact" duration of the content specified by |plainManifest|.
    var plainManifestDuration = 181.43107777777777;

    it('permits looping', function(done) {
      video.loop = true;
      player.load(newSource(manifests.plainManifest)).then(function() {
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
      player.load(newSource(manifests.plainManifest)).then(function() {
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
      player.load(newSource(manifests.plainManifest)).then(function() {
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
      player.load(newSource(manifests.plainManifest)).then(function() {
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

      player.load(newSource(manifests.plainManifest)).then(function() {
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

      player.load(newSource(manifests.plainManifest)).then(function() {
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
});

