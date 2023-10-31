/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Player', () => {
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
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  /** @type {!shaka.test.Waiter} */
  let waiter;

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
    support = await compiledShaka.Player.probeSupport();
  });

  beforeEach(async () => {
    player = new compiledShaka.Player();
    await player.attach(video);

    // Make sure we are playing the lowest res available to avoid test flake
    // based on network issues.  Note that disabling ABR and setting a low
    // abr.defaultBandwidthEstimate would not be sufficient, because it
    // would only affect the choice of track on the first period.  When we
    // cross a period boundary, the default bandwidth estimate will no
    // longer be in effect, and AbrManager may choose higher res tracks for
    // the new period.  Using abr.restrictions.maxHeight will let us force
    // AbrManager to the lowest resolution, which is its fallback when these
    // soft restrictions cannot be met.
    player.configure('abr.restrictions.maxHeight', 1);

    // Make sure that live streams are synced against a good clock.
    player.configure('manifest.dash.clockSyncUri',
        'https://shaka-player-demo.appspot.com/time.txt');

    // Disable stall detection, which can interfere with playback tests.
    player.configure('streaming.stallEnabled', false);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake((event) => fail(event.detail));
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
  });

  afterEach(async () => {
    eventManager.release();

    await player.destroy();
    player.releaseAllMutexes();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  describe('plays', () => {
    /** @param {!ShakaDemoAssetInfo} asset */
    function createAssetTest(asset) {
      if (asset.disabled) {
        return;
      }

      const testName =
          asset.source + ' / ' + asset.name + ' : ' + asset.manifestUri;

      const wit = asset.focus ? fit : it;
      wit(testName, async () => {
        const idFor = shakaAssets.identifierForKeySystem;
        if (!asset.isClear() &&
            !asset.drm.some((keySystem) => {
              // Demo assets use an enum here, which we look up in idFor.
              // Command-line assets use a direct key system ID.
              return support.drm[idFor(keySystem)] || support.drm[keySystem];
            })) {
          pending('None of the required key systems are supported.');
        }

        if (asset.features) {
          const mimeTypes = [];
          if (asset.features.includes(Feature.WEBM)) {
            mimeTypes.push('video/webm');
          }
          if (asset.features.includes(Feature.MP4)) {
            mimeTypes.push('video/mp4');
          }
          if (mimeTypes.length &&
              !mimeTypes.some((type) => support.media[type])) {
            pending('None of the required MIME types are supported.');
          }
        }

        // Add asset-specific configuration.
        player.configure(asset.getConfiguration());

        // Configure networking for this asset.
        const networkingEngine = player.getNetworkingEngine();
        asset.applyFilters(networkingEngine);

        // Rather than awaiting the load() method, catch any load() errors and
        // wait on the 'canplay' event.  This has the advantage that we will
        // get better logging of the media state on a timeout, since that
        // capabilitiy is built into the waiter for media element events.
        player.load(asset.manifestUri).catch(fail);
        await waiter.timeoutAfter(60).waitForEvent(video, 'canplay');

        if (asset.features) {
          const isLive = asset.features.includes(Feature.LIVE);
          expect(player.isLive()).toBe(isLive);
        }
        await video.play();

        // Wait for the video to start playback.  If it takes longer than 20
        // seconds, fail the test.
        await waiter.waitForMovementOrFailOnTimeout(video, 20);

        // Play for 30 seconds, but stop early if the video ends.
        await waiter.waitForEndOrTimeout(video, 30);

        if (video.ended) {
          checkEndedTime();
        } else {
          // Expect that in 30 seconds of playback, we go through at least 20
          // seconds of content.  This allows for some buffering or network
          // flake.
          expect(video.currentTime).toBeGreaterThan(20);

          // Since video.ended is false, we expect the current time to be before
          // the video duration.
          expect(video.currentTime).toBeLessThan(video.duration);

          if (!player.isLive()) {
            // Seek close to the end and play the rest of the content.
            video.currentTime = video.duration - 15;

            // Wait for the video to start playback again after seeking.  If it
            // takes longer than 20 seconds, fail the test.
            await waiter.waitForMovementOrFailOnTimeout(video, 20);

            // Play for 30 seconds, but stop early if the video ends.
            await waiter.waitForEndOrTimeout(video, 30);

            // By now, ended should be true.
            expect(video.ended).toBe(true);
            checkEndedTime();
          }
        }
      });  // actual test
    }  // createAssetTest

    // The user can run tests on a specific manifest URI that is not in the
    // asset list.
    const testCustomAsset = getClientArg('testCustomAsset');
    if (testCustomAsset) {
      // Construct an "asset" structure to reuse the test logic above.
      /** @type {Object} */
      const licenseServers = getClientArg('testCustomLicenseServer');
      const keySystems = Object.keys(licenseServers || {});
      const asset = new ShakaDemoAssetInfo(
          /* name= */ 'custom',
          /* iconUri= */ '',
          /* manifestUri= */ testCustomAsset,
          /* source= */ shakaAssets.Source.CUSTOM);
      if (keySystems.length) {
        for (const keySystem of keySystems) {
          asset.addKeySystem(/** @type {!shakaAssets.KeySystem} */ (keySystem));
          const licenseServer = licenseServers[keySystem];
          if (licenseServer) {
            asset.addLicenseServer(keySystem, licenseServer);
          }
        }
      }
      createAssetTest(asset);
    } else {
      // No custom assets? Create a test for each asset in the demo asset list.
      for (const asset of shakaAssets.testAssets) {
        createAssetTest(asset);
      }
    }
  });

  /**
   * Check the video time for videos that we expect to have ended.
   */
  function checkEndedTime() {
    if (video.currentTime >= video.duration) {
      // On some platforms, currentTime surpasses duration by more than 0.1s.
      // For the purposes of this test, this is fine, so don't set any precise
      // expectations on currentTime if it's larger.
    } else {
      // On some platforms, currentTime is less than duration, but it should be
      // close.
      expect(video.currentTime).toBeCloseTo(
          video.duration, /* decimal= */ 1);
    }
  }

  /**
   * @param {!Object.<string, string>} headers
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shaka.extern.Request} request
   */
  function addLicenseRequestHeaders(headers, requestType, request) {
    const RequestType = compiledShaka.net.NetworkingEngine.RequestType;
    if (requestType != RequestType.LICENSE) {
      return;
    }

    // Add these to the existing headers.  Do not clobber them!
    // For PlayReady, there will already be headers in the request.
    for (const k in headers) {
      request.headers[k] = headers[k];
    }
  }
});
