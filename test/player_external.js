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
  const Util = shaka.test.Util;
  const Feature = shakaAssets.Feature;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;

  /** @type {shaka.extern.SupportType} */
  let support;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.Player} */
  let player;
  /** @type {shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  beforeAll(async () => {
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);

    /** @type {!shaka.util.PublicPromise} */
    const loaded = new shaka.util.PublicPromise();
    if (getClientArg('uncompiled')) {
      // For debugging purposes, use the uncompiled library.
      compiledShaka = shaka;
      loaded.resolve();
    } else {
      // Load the compiled library as a module.
      // All tests in this suite will use the compiled library.
      require(['/base/dist/shaka-player.compiled.js'], (shakaModule) => {
        compiledShaka = shakaModule;
        loaded.resolve();
      });
    }

    await loaded;
    support = await compiledShaka.Player.probeSupport();
  });

  beforeEach(function() {
    player = new compiledShaka.Player(video);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake(function(event) { fail(event.detail); });
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
  });

  afterEach(async () => {
    await Promise.all([
      eventManager.destroy(),
      player.destroy(),
    ]);

    // Work-around: allow the Tizen media pipeline to cool down.
    // Without this, Tizen's pipeline seems to hang in subsequent tests.
    // TODO: file a bug on Tizen
    await Util.delay(0.1);
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  describe('plays', function() {
    function createAssetTest(asset) {
      if (asset.disabled) return;

      let testName =
          asset.source + ' / ' + asset.name + ' : ' + asset.manifestUri;

      let wit = asset.focus ? fit : it;
      wit(testName, async () => {
        if (asset.drm.length && !asset.drm.some(
            function(keySystem) { return support.drm[keySystem]; })) {
          pending('None of the required key systems are supported.');
        }

        if (asset.features) {
          let mimeTypes = [];
          if (asset.features.includes(Feature.WEBM)) {
            mimeTypes.push('video/webm');
          }
          if (asset.features.includes(Feature.MP4)) {
            mimeTypes.push('video/mp4');
          }
          if (!mimeTypes.some(
              function(type) { return support.media[type]; })) {
            pending('None of the required MIME types are supported.');
          }
        }

        let config = {abr: {}, drm: {}, manifest: {dash: {}}};
        config.abr.enabled = false;
        config.manifest.dash.clockSyncUri =
            'https://shaka-player-demo.appspot.com/time.txt';
        if (asset.licenseServers) {
          config.drm.servers = asset.licenseServers;
        }
        if (asset.drmCallback) {
          config.manifest.dash.customScheme = asset.drmCallback;
        }
        if (asset.clearKeys) {
          config.drm.clearKeys = asset.clearKeys;
        }
        player.configure(config);

        if (asset.licenseRequestHeaders) {
          player.getNetworkingEngine().registerRequestFilter(
              addLicenseRequestHeaders.bind(null, asset.licenseRequestHeaders));
        }

        let networkingEngine = player.getNetworkingEngine();
        if (asset.requestFilter) {
          networkingEngine.registerRequestFilter(asset.requestFilter);
        }
        if (asset.responseFilter) {
          networkingEngine.registerResponseFilter(asset.responseFilter);
        }
        if (asset.extraConfig) {
          player.configure(asset.extraConfig);
        }

        await player.load(asset.manifestUri);
        if (asset.features) {
          const isLive = asset.features.includes(Feature.LIVE);
          expect(player.isLive()).toEqual(isLive);
        }
        video.play();

        // 30 seconds or video ended, whichever comes first.
        await waitForTimeOrEnd(video, 40);

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
            await waitForTimeOrEnd(video, 40);

            expect(video.ended).toBe(true);
            expect(video.currentTime).toBeCloseTo(video.duration, 1);
          }
        }
      });
    }

    // The user can run tests on a specific manifest URI that is not in the
    // asset list.
    const testCustomAsset = getClientArg('testCustomAsset');
    if (testCustomAsset) {
      // Construct an "asset" structure to reuse the test logic above.
      /** @type {Object} */
      const licenseServers = getClientArg('testCustomLicenseServer');
      const keySystems = Object.keys(licenseServers || {});
      const asset = {
        source: 'command line',
        name: 'custom',
        manifestUri: testCustomAsset,
        focus: true,
        licenseServers: licenseServers,
        drm: keySystems,
      };
      createAssetTest(asset);
    } else {
      // No custom assets? Create a test for each asset in the demo asset list.
      shakaAssets.testAssets.forEach(createAssetTest);
    }
  });

  /**
   * @param {!EventTarget} target
   * @param {number} timeout in seconds, after which the Promise succeeds
   * @return {!Promise}
   */
  function waitForTimeOrEnd(target, timeout) {
    let curEventManager = eventManager;
    return new Promise(function(resolve, reject) {
      let callback = function() {
        curEventManager.unlisten(target, 'ended');
        resolve();
      };
      curEventManager.listen(target, 'ended', callback);
      Util.delay(timeout).then(callback);
    });
  }

  /**
   * @param {!Object.<string, string>} headers
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shaka.extern.Request} request
   */
  function addLicenseRequestHeaders(headers, requestType, request) {
    const RequestType = compiledShaka.net.NetworkingEngine.RequestType;
    if (requestType != RequestType.LICENSE) return;

    // Add these to the existing headers.  Do not clobber them!
    // For PlayReady, there will already be headers in the request.
    for (let k in headers) {
      request.headers[k] = headers[k];
    }
  }
});
