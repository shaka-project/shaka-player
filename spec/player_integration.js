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

goog.require('shaka.player.DashVideoSource');
goog.require('shaka.player.Player');
goog.require('shaka.util.AjaxRequest');
goog.require('shaka.util.EWMABandwidthEstimator');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FailoverUri');
goog.require('shaka.util.LicenseRequest');

describe('Player', function() {
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

  describe('load', function() {
    // This covers basic player re-use.
    it('can be used multiple times without EME', function(done) {
      player.load(newSource(manifests.plainManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        return player.load(newSource(manifests.plainManifest));
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
      player.load(newSource(manifests.encryptedManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        return player.load(newSource(manifests.encryptedManifest));
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
      var source = newSource(manifests.plainManifest);
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

  describe('setNetworkCallback', function() {
    it('intercepts network calls', function(done) {
      var callback = jasmine.createSpy('network').and.callFake(
          function(url, parameters) {
            expect(url).toBeTruthy();
            expect(parameters).toBeTruthy();
            return null;
          });
      var source = newSource(manifests.plainManifest);
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
      var source = newSource(manifests.plainManifest);
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
          [new goog.Uri(manifests.languagesManifest)]);
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
    player.load(newSource(manifests.failoverManifest)).then(function() {
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

  describe('getStats', function() {
    it('updates playTime', function(done) {
      var oldPlayTime;
      player.load(newSource(manifests.plainManifest)).then(function() {
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

  describe('interpretContentProtection', function() {
    function newSourceWithIcp(icp) {
      var estimator = new shaka.util.EWMABandwidthEstimator();
      return new shaka.player.DashVideoSource(manifests.encryptedManifest,
                                              icp,
                                              estimator);
    }

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

  it('dispatches errors on failure', function(done) {
    player.removeEventListener('error', convertErrorToTestFailure, false);
    var onError = jasmine.createSpy('onError');
    player.addEventListener('error', onError, false);

    // Ignore any errors in the promise chain.
    player.load(newSource(manifests.bogusManifest)).catch(function(error) {
    }).then(
        function() {
          // Expect the error handler to have been called.
          expect(onError.calls.any()).toBe(true);
          done();
        });
  });

  it('respects autoplay=true', function(done) {
    video.autoplay = true;

    player.load(newSource(manifests.plainManifest)).then(function() {
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

    player.load(newSource(manifests.plainManifest)).then(function() {
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
      return player.load(newSource(manifests.plainManifest));
    }).then(function() {
      return waitForMovement(video, eventManager);
    }).then(function() {
      expect(video.currentTime).not.toBe(0);
      expect(player.getStats().bufferingHistory.length).toBe(0);
      expect(eventFired).toBe(false);

      eventFired = false;
      return player.load(newSource(manifests.plainManifest));
    }).then(function() {
      video.pause();
      return delay(1);
    }).then(function() {
      expect(video.currentTime).toBe(0);
      expect(player.getStats().bufferingHistory.length).toBe(0);
      expect(eventFired).toBe(false);

      eventFired = false;
      video.autoplay = false;
      return player.load(newSource(manifests.plainManifest));
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

  describe('destroy', function() {
    it('does not cause exceptions after load', function(done) {
      // Satisfy Jasmine, which complains if tests have no expectations.
      expect(true).toBe(true);
      // Load the manifest, then wait.
      player.load(newSource(manifests.encryptedManifest)).then(function() {
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
      player.load(newSource(manifests.encryptedManifest)).catch(function() {});
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
        player.load(newSource(manifests.encryptedManifest)).catch(function() {
        });
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
});

