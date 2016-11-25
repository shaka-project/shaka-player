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

describe('Player', function() {
  var Util;
  var onErrorSpy;
  var Feature;

  /** @type {shakaExtern.SupportType} */
  var support;
  /** @type {!HTMLVideoElement} */
  var video;
  /** @type {shaka.Player} */
  var player;
  /** @type {shaka.util.EventManager} */
  var eventManager;

  var shaka;

  beforeAll(function(done) {
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);

    // Load test utils from outside the compiled library.
    Util = window.shaka.test.Util;
    // Load asset features from outside the compiled library.
    Feature = window.shakaAssets.Feature;

    var loaded = window.shaka.util.PublicPromise();
    if (window.shaka.test.Util.getClientArg('uncompiled')) {
      // For debugging purposes, use the uncompiled library.
      shaka = window.shaka;
      loaded.resolve();
    } else {
      // Load the compiled library as a module.
      // All tests in this suite will use the compiled library.
      require(['../dist/shaka-player.compiled.js'], function(shakaModule) {
        shaka = shakaModule;
        shaka.net.NetworkingEngine.registerScheme(
            'test', window.shaka.test.TestScheme);
        shaka.media.ManifestParser.registerParserByMime(
            'application/x-test-manifest',
            window.shaka.test.TestScheme.ManifestParser);

        loaded.resolve();
      });
    }

    loaded.then(function() {
      return window.shaka.test.TestScheme.createManifests(shaka, '_compiled');
    }).then(function() {
      return shaka.Player.probeSupport();
    }).then(function(supportResults) {
      support = supportResults;
      done();
    });
  });

  beforeEach(function() {
    player = new shaka.Player(video);

    // Grab event manager from the uncompiled library:
    eventManager = new window.shaka.util.EventManager();

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake(function(event) { fail(event.detail); });
    eventManager.listen(player, 'error', onErrorSpy);
  });

  afterEach(function(done) {
    Promise.all([
      eventManager.destroy(),
      player.destroy()
    ]).catch(fail).then(done);
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  describe('getStats', function() {
    it('gives stats about current stream', function(done) {
      // This is tested more in player_unit.js.  This is here to test the public
      // API and to check for renaming.
      player.load('test:sintel_compiled').then(function() {
        video.play();
        return waitForEvent(video, 'timeupdate', 10);
      }).then(function() {
        var stats = player.getStats();
        var expected = {
          width: jasmine.any(Number),
          height: jasmine.any(Number),
          streamBandwidth: jasmine.any(Number),

          decodedFrames: jasmine.any(Number),
          droppedFrames: jasmine.any(Number),
          estimatedBandwidth: jasmine.any(Number),
          playTime: jasmine.any(Number),
          bufferingTime: jasmine.any(Number),

          // We should have loaded the first Period by now, so we should have a
          // history.
          switchHistory: jasmine.arrayContaining([{
            timestamp: jasmine.any(Number),
            id: jasmine.any(Number),
            type: 'video',
            fromAdaptation: true
          }])
        };
        expect(stats).toEqual(expected);
      }).catch(fail).then(done);
    });
  });

  describe('setTextTrackVisibility', function() {
    // Using mode='disabled' on TextTrack causes cues to go null, which leads
    // to a crash in TextEngine.  This validates that we do not trigger this
    // behavior when changing visibility of text.
    it('does not cause cues to be null', function(done) {
      var textTrack = video.textTracks[0];
      player.load('test:sintel_compiled').then(function() {
        video.play();
        return waitForEvent(video, 'timeupdate', 10);
      }).then(function() {
        // This should not be null initially.
        expect(textTrack.cues).not.toBe(null);

        player.setTextTrackVisibility(true);
        // This should definitely not be null when visible.
        expect(textTrack.cues).not.toBe(null);

        player.setTextTrackVisibility(false);
        // This should not transition to null when invisible.
        expect(textTrack.cues).not.toBe(null);
      }).catch(fail).then(done);
    });
  });

  describe('plays', function() {
    window.shakaAssets.testAssets.forEach(function(asset) {
      if (asset.disabled) return;

      var testName =
          asset.source + ' / ' + asset.name + ' : ' + asset.manifestUri;

      var wit = asset.focus ? fit : it;
      wit(testName, function(done) {
        if (!window.shaka.test.Util.getClientArg('external')) {
          pending('Skipping tests that use external assets.');
        }

        if (asset.drm.length && !asset.drm.some(
            function(keySystem) { return support.drm[keySystem]; })) {
          pending('None of the required key systems are supported.');
        }

        var mimeTypes = [];
        if (asset.features.indexOf(Feature.WEBM) >= 0)
          mimeTypes.push('video/webm');
        if (asset.features.indexOf(Feature.MP4) >= 0)
          mimeTypes.push('video/mp4');
        if (!mimeTypes.some(
            function(type) { return support.media[type]; })) {
          pending('None of the required MIME types are supported.');
        }

        var isLive = asset.features.indexOf(Feature.LIVE) >= 0;

        var config = { abr: {}, drm: {}, manifest: { dash: {} } };
        config.abr.enabled = false;
        config.manifest.dash.clockSyncUri =
            '//shaka-player-demo.appspot.com/time.txt';
        if (asset.licenseServers)
          config.drm.servers = asset.licenseServers;
        if (asset.drmCallback)
          config.manifest.dash.customScheme = asset.drmCallback;
        if (asset.clearKeys)
          config.drm.clearKeys = asset.clearKeys;
        player.configure(config);

        if (asset.licenseRequestHeaders) {
          player.getNetworkingEngine().registerRequestFilter(
              addLicenseRequestHeaders.bind(null, asset.licenseRequestHeaders));
        }

        var networkingEngine = player.getNetworkingEngine();
        if (asset.requestFilter)
          networkingEngine.registerRequestFilter(asset.requestFilter);
        if (asset.responseFilter)
          networkingEngine.registerResponseFilter(asset.responseFilter);
        if (asset.extraConfig)
          player.configure(asset.extraConfig);

        player.load(asset.manifestUri).then(function() {
          expect(player.isLive()).toEqual(isLive);
          video.play();
          return waitForEvent(video, 'timeupdate', 10);
        }).then(function() {
          // 30 seconds or video ended, whichever comes first.
          return waitForTimeOrEnd(video, 30);
        }).then(function() {
          if (video.ended) {
            expect(video.currentTime).toBeCloseTo(video.duration, 1);
          } else {
            expect(video.currentTime).toBeGreaterThan(20);
            // If it were very close to duration, why !video.ended?
            expect(video.currentTime).not.toBeCloseTo(video.duration);

            if (!player.isLive()) {
              // Seek and play out the end.
              video.currentTime = video.duration - 15;
              // 30 seconds or video ended, whichever comes first.
              return waitForTimeOrEnd(video, 30).then(function() {
                expect(video.ended).toBe(true);
                expect(video.currentTime).toBeCloseTo(video.duration, 1);
              });
            }
          }
        }).catch(fail).then(done);
      });
    });
  });

  /**
   * @param {!EventTarget} target
   * @param {string} eventName
   * @param {number} timeout in seconds, after which the Promise fails
   * @return {!Promise}
   */
  function waitForEvent(target, eventName, timeout) {
    return new Promise(function(resolve, reject) {
      eventManager.listen(target, eventName, function() {
        resolve();
        eventManager.unlisten(target, eventName);
      });
      Util.delay(timeout).then(function() {
        reject('Timeout waiting for ' + eventName);
        eventManager.unlisten(target, eventName);
      });
    });
  }

  /**
   * @param {!EventTarget} target
   * @param {number} timeout in seconds, after which the Promise succeeds
   * @return {!Promise}
   */
  function waitForTimeOrEnd(target, timeout) {
    return Promise.race([
      Util.delay(timeout),
      waitForEvent(target, 'ended', timeout + 1)
    ]);
  }

  /**
   * @param {!Object.<string, string>} headers
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shakaExtern.Request} request
   */
  function addLicenseRequestHeaders(headers, requestType, request) {
    var RequestType = shaka.net.NetworkingEngine.RequestType;
    if (requestType != RequestType.LICENSE) return;

    // Add these to the existing headers.  Do not clobber them!
    // For PlayReady, there will already be headers in the request.
    for (var k in headers) {
      request.headers[k] = headers[k];
    }
  }
});
