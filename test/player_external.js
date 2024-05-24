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

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!HTMLElement} */
  let adContainer;
  /** @type {shaka.Player} */
  let player;
  /** @type {shaka.extern.IAdManager} */
  let adManager;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  /** @type {!shaka.test.Waiter} */
  let waiter;

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    adContainer =
      /** @type {!HTMLElement} */ (document.createElement('div'));
    document.body.appendChild(adContainer);
    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
  });

  beforeEach(async () => {
    player = new compiledShaka.Player();
    adManager = player.getAdManager();
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
    shaka.util.Dom.removeAllChildren(adContainer);
  });

  afterAll(() => {
    document.body.removeChild(video);
    document.body.removeChild(adContainer);
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
        if (!asset.isClear() && !asset.isAes128() &&
            !asset.drm.some((keySystem) => {
              // Demo assets use an enum here, which we look up in idFor.
              // Command-line assets use a direct key system ID.
              return window['shakaSupport'].drm[idFor(keySystem)] ||
                 window['shakaSupport'].drm[keySystem];
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
          if (asset.features.includes(Feature.MP2TS)) {
            mimeTypes.push('video/mp2t');
          }
          if (asset.features.includes(Feature.CONTAINERLESS)) {
            mimeTypes.push('audio/aac');
          }
          if (asset.features.includes(Feature.DOLBY_VISION_3D)) {
            mimeTypes.push('video/mp4; codecs="dvh1.20.01"');
          }
          if (mimeTypes.length &&
              !mimeTypes.some((type) => window['shakaSupport'].media[type])) {
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
        const manifestUri = await getManifestUri(asset);
        player.load(manifestUri).catch(fail);
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
   * @param {ShakaDemoAssetInfo} asset
   * @return {!Promise.<string>}
   */
  async function getManifestUri(asset) {
    let manifestUri = asset.manifestUri;
    // If it's a server side dai asset, request ad-containing manifest
    // from the ad manager.
    if (asset.imaAssetKey || (asset.imaContentSrcId && asset.imaVideoId)) {
      manifestUri = await getManifestUriFromAdManager(asset);
    }
    // If it's a MediaTailor asset, request ad-containing manifest
    // from the ad manager.
    if (asset.mediaTailorUrl) {
      manifestUri = await getManifestUriFromMediaTailorAdManager(asset);
    }
    return manifestUri;
  }

  /**
   * @param {ShakaDemoAssetInfo} asset
   * @return {!Promise.<string>}
   */
  async function getManifestUriFromAdManager(asset) {
    try {
      adManager.initServerSide(adContainer, video);
      let request;
      if (asset.imaAssetKey != null) {
        // LIVE stream
        request = new google.ima.dai.api.LiveStreamRequest();
        request.assetKey = asset.imaAssetKey;
      } else {
        // VOD
        goog.asserts.assert(asset.imaContentSrcId != null &&
            asset.imaVideoId != null, 'Asset should have ima ids!');
        request = new google.ima.dai.api.VODStreamRequest();
        request.contentSourceId = asset.imaContentSrcId;
        request.videoId = asset.imaVideoId;
      }
      switch (asset.imaManifestType) {
        case 'DASH':
        case 'dash':
        case 'MPD':
        case 'mpd':
          request.format = google.ima.dai.api.StreamRequest.StreamFormat.DASH;
          break;
        case 'HLS':
        case 'hls':
        case 'M3U8':
        case 'm3u8':
          request.format = google.ima.dai.api.StreamRequest.StreamFormat.HLS;
          break;
      }

      const uri = await adManager.requestServerSideStream(
          request, /* backupUri= */ asset.manifestUri);
      return uri;
    // eslint-disable-next-line no-restricted-syntax
    } catch (error) {
      fail(error);
      return asset.manifestUri;
    }
  }

  /**
   * @param {ShakaDemoAssetInfo} asset
   * @return {!Promise.<string>}
   */
  async function getManifestUriFromMediaTailorAdManager(asset) {
    try {
      const netEngine = player.getNetworkingEngine();
      goog.asserts.assert(netEngine, 'There should be a net engine.');
      adManager.initMediaTailor(adContainer, netEngine, video);
      goog.asserts.assert(asset.mediaTailorUrl != null,
          'Media Tailor info not be null!');
      const uri = await adManager.requestMediaTailorStream(
          asset.mediaTailorUrl, asset.mediaTailorAdsParams,
          /* backupUri= */ asset.manifestUri);
      return uri;
    // eslint-disable-next-line no-restricted-syntax
    } catch (error) {
      fail(error);
      return asset.manifestUri;
    }
  }
});
