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
        'https://time.akamai.com/?ms&iso');

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
        const idsFor = shakaAssets.identifiersForKeySystem;
        if (!asset.isClear() && !asset.isAes128() &&
            !asset.drm.some((keySystem) => {
              if (shakaSupport.drm[keySystem]) {
                return true;
              }
              // Demo assets use an enum here, which we look up in idsFor.
              // Command-line assets use a direct key system ID.
              for (const identifier of idsFor(keySystem)) {
                if (shakaSupport.drm[identifier]) {
                  return true;
                }
              }
              return false;
            })) {
          pending('None of the required key systems are supported.');
        }

        const unsupportedReason =
            asset.getMediaUnsupportedReason(shakaSupport);
        if (unsupportedReason) {
          pending(unsupportedReason);
        }

        if (isImaDaiAsset(asset) &&
            !(window['google'] && google.ima && google.ima.dai)) {
          // The IMA SDK is not loaded on purpose: it has broken test runs on
          // Tizen in the past.
          pending('The IMA DAI SDK is not loaded.');
        }

        // Client-side ads (asset.adTagUri) are not requested: an ad break
        // pauses the content, which would break the playback checks below.

        // Add asset-specific configuration.
        player.configure(asset.getConfiguration());

        // Configure networking for this asset.
        const networkingEngine = player.getNetworkingEngine();
        asset.applyFilters(networkingEngine);

        // Rather than awaiting the load() method, catch any load() errors and
        // wait on the 'canplay' event.  This has the advantage that we will
        // get better logging of the media state on a timeout, since that
        // capability is built into the waiter for media element events.
        const manifestUri = await getManifestUri(asset);
        // Add the external text, thumbnail and chapter tracks once streaming
        // starts, as the demo's queue manager does.
        const extraTracks = new Promise((resolve) => {
          eventManager.listenOnce(player, 'streaming', () => {
            resolve(addExtraTracks(asset));
          });
        });
        const adEvents = recordAdEvents();
        let loads = 0;
        eventManager.listen(player, 'loaded', () => loads++);
        player.load(manifestUri, /* startTime= */ null,
            asset.mimeType || undefined).catch(fail);
        await waiter.timeoutAfter(60).waitForEvent(video, 'canplay');
        await extraTracks;

        if (asset.features) {
          const isLive = asset.features.includes(Feature.LIVE);
          expect(player.isLive()).toBe(isLive);
        }
        await video.play();

        // Wait for the video to start playback.  If it takes longer than 20
        // seconds, fail the test.
        await waiter.waitForMovementOrFailOnTimeout(video, 20);

        // A pre-roll plays before the content, so let it finish before timing
        // the content.
        await waitForLinearAdsToEnd();

        // Play for 30 seconds, but stop early if the video ends.
        await playContentFor(30, adEvents);

        if (video.ended) {
          checkEndedTime();
        } else {
          // Expect that in 30 seconds of playback, we go through at least 20
          // seconds of content.  This allows for some buffering or network
          // flake.
          expect(video.currentTime).withContext(mediaState())
              .toBeGreaterThan(20);

          // Since video.ended is false, we expect the current time to be before
          // the video duration.
          expect(video.currentTime).withContext(mediaState())
              .toBeLessThan(video.duration);

          if (!player.isLive()) {
            // Seek close to the end and play the rest of the content.
            video.currentTime = video.duration - 15;

            // Wait for the video to start playback again after seeking.  If it
            // takes longer than 20 seconds, fail the test.
            await waiter.waitForMovementOrFailOnTimeout(video, 20);
            await waitForLinearAdsToEnd();

            // Play for 30 seconds, but stop early if the video ends.
            await playContentFor(30, adEvents);

            if (asset.features.includes(Feature.MPD_CHAINING)) {
              // At the end, the player loads the next MPD of the chain, which
              // resets the media element, so check that load instead.
              if (loads < 2) {
                await waiter.timeoutAfter(60)
                    .waitForEvent(player, 'loaded');
              }
              expect(player.getAssetUri()).not.toBe(manifestUri);
            } else {
              // By now, ended should be true.
              expect(video.ended).withContext(mediaState()).toBe(true);
              checkEndedTime();
            }
          }
        }

        checkAdEvents(adEvents);
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
   * Play until the video ends, or until |timeout| seconds pass.
   *
   * The waiter considers the video ended up to 0.1s before its duration (which
   * at the waiter's 3x playback rate is a few tens of milliseconds), so when it
   * stops that close to the end, wait for the media element to actually end.
   *
   * @param {number} timeout
   * @return {!Promise}
   */
  async function waitForEndOrTimeout(timeout) {
    await waiter.waitForEndOrTimeout(video, timeout);
    if (!video.ended && video.currentTime >= video.duration - 0.1) {
      await waiter.timeoutAfter(5).failOnTimeout(false)
          .waitForEvent(video, 'ended');
    }
  }

  /**
   * Play the content for |timeout| seconds, or until it ends.  If a linear ad
   * break interrupts it, wait for the break to end and play the content for
   * another |timeout| seconds, so the content checks see a full window.
   *
   * @param {number} timeout
   * @param {!Array<string>} adEvents
   * @return {!Promise}
   */
  async function playContentFor(timeout, adEvents) {
    const countAdStarts =
        () => adEvents.filter((e) => e == shaka.ads.Utils.AD_STARTED).length;
    const adsBefore = countAdStarts();
    await waitForEndOrTimeout(timeout);
    if (!video.ended && countAdStarts() > adsBefore) {
      await waitForLinearAdsToEnd();
      await waitForEndOrTimeout(timeout);
    }
  }

  /**
   * Record the ad events the ad manager dispatches, in order.
   *
   * @return {!Array<string>}
   */
  function recordAdEvents() {
    const AdUtils = shaka.ads.Utils;
    /** @type {!Array<string>} */
    const events = [];
    const types = [
      AdUtils.AD_BREAK_STARTED,
      AdUtils.AD_STARTED,
      AdUtils.AD_IMPRESSION,
      AdUtils.AD_FIRST_QUARTILE,
      AdUtils.AD_MIDPOINT,
      AdUtils.AD_THIRD_QUARTILE,
      AdUtils.AD_COMPLETE,
      AdUtils.AD_SKIPPED,
      AdUtils.AD_STOPPED,
      AdUtils.AD_BREAK_ENDED,
      AdUtils.AD_ERROR,
    ];
    for (const type of types) {
      eventManager.listen(adManager, type, (event) => {
        // A linear ad is the one the quartile checks apply to.
        const ad = adManager.getCurrentAd();
        if (type == AdUtils.AD_ERROR && isUnsupportedAdMedia(event)) {
          // The ad's media can't play in this browser, e.g. the HEVC-only
          // ads of the Apple interstitial sample in headless Chrome: the ad
          // is skipped, as it should be.
          events.push('unsupported ' + type);
        } else if (type == AdUtils.AD_STARTED && ad && !ad.isLinear()) {
          events.push('non-linear ' + type);
        } else {
          events.push(type);
        }
      });
    }
    return events;
  }

  /**
   * @param {!Event} event An ad-error event.
   * @return {boolean} True if the ad failed because the browser does not
   *   support its media.
   */
  function isUnsupportedAdMedia(event) {
    const original = event['originalEvent'];
    const error = original && (original.detail || original);
    return !!error &&
        error.code == shaka.util.Error.Code.CONTENT_UNSUPPORTED_BY_BROWSER;
  }

  /**
   * Wait until no linear ad is playing.  The ads of an ad break play back to
   * back, so this waits for each one in turn.
   *
   * @return {!Promise}
   */
  async function waitForLinearAdsToEnd() {
    for (let ad = adManager.getCurrentAd(); ad && ad.isLinear();
      ad = adManager.getCurrentAd()) {
      const remaining = ad.getRemainingTime();
      const duration = ad.getDuration();
      const expected =
          remaining > 0 ? remaining : (duration > 0 ? duration : 60);
      // eslint-disable-next-line no-await-in-loop
      await waiter.timeoutAfter(expected + 20)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);
      // Give the next ad of the break, if any, a moment to start.
      // eslint-disable-next-line no-await-in-loop
      await shaka.test.Util.delay(1);
    }
  }

  /**
   * Check that each linear ad that played to the end dispatched its
   * impression and its quartile events in order, and that no ad failed.
   *
   * @param {!Array<string>} events
   */
  function checkAdEvents(events) {
    const AdUtils = shaka.ads.Utils;
    expect(events).not.toContain(AdUtils.AD_ERROR);

    const expectedOrder = [
      AdUtils.AD_STARTED,
      AdUtils.AD_FIRST_QUARTILE,
      AdUtils.AD_MIDPOINT,
      AdUtils.AD_THIRD_QUARTILE,
      AdUtils.AD_COMPLETE,
    ];
    // Split the events into one list per ad: each ad ends with AD_STOPPED.
    // The impression may come before or after AD_STARTED depending on the ad
    // manager, so only its presence is checked.
    let adEvents = [];
    for (const event of events) {
      adEvents.push(event);
      if (event != AdUtils.AD_STOPPED) {
        continue;
      }
      // A skipped ad stops early; only an ad that played to the end owes
      // every quartile.
      if (adEvents.includes(AdUtils.AD_STARTED) &&
          adEvents.includes(AdUtils.AD_COMPLETE)) {
        const context = events.join(', ');
        expect(adEvents).withContext(context).toContain(AdUtils.AD_IMPRESSION);
        const tracked = adEvents.filter((e) => expectedOrder.includes(e));
        expect(tracked).withContext(context).toEqual(expectedOrder);
      }
      adEvents = [];
    }
  }

  /**
   * Describe the media state, as context for a failed expectation.
   *
   * @return {string}
   */
  function mediaState() {
    return `current time: ${video.currentTime}, ` +
        `duration: ${video.duration}, ` +
        `ready state: ${video.readyState}, ` +
        `paused: ${video.paused}, ` +
        `player.isEnded(): ${player.isEnded()}, ` +
        `seek range: ${JSON.stringify(player.seekRange())}, ` +
        `buffered: ${JSON.stringify(player.getBufferedInfo())}`;
  }

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
   * @param {!ShakaDemoAssetInfo} asset
   * @return {boolean}
   */
  function isImaDaiAsset(asset) {
    return !!asset.imaAssetKey ||
        !!(asset.imaContentSrcId && asset.imaVideoId);
  }

  /**
   * Add the asset's external text, thumbnail and chapter tracks, and check that
   * the player has them.
   *
   * @param {!ShakaDemoAssetInfo} asset
   * @return {!Promise}
   */
  async function addExtraTracks(asset) {
    await Promise.all([
      ...asset.extraText.map((extraText) => {
        if (extraText.mime) {
          return player.addTextTrackAsync(extraText.uri, extraText.language,
              extraText.kind, extraText.mime, extraText.codecs);
        }
        return player.addTextTrackAsync(
            extraText.uri, extraText.language, extraText.kind);
      }),
      ...asset.extraThumbnail.map((uri) => player.addThumbnailsTrack(uri)),
      ...asset.extraChapter.map((chapter) => player.addChaptersTrack(
          chapter.uri, chapter.language, chapter.mime)),
    ]);
    if (asset.extraThumbnail.length) {
      expect(player.getImageTracks().length).toBeGreaterThan(0);
    }
    if (asset.extraChapter.length) {
      expect(player.getChaptersTracks().length).toBeGreaterThan(0);
    }
  }

  /**
   * @param {ShakaDemoAssetInfo} asset
   * @return {!Promise<string>}
   */
  async function getManifestUri(asset) {
    let manifestUri = asset.manifestUri;
    // If it's a server side dai asset, request ad-containing manifest
    // from the ad manager.
    if (isImaDaiAsset(asset)) {
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
   * @return {!Promise<string>}
   */
  async function getManifestUriFromAdManager(asset) {
    try {
      adManager.setContainers(adContainer, adContainer);
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
   * @return {!Promise<string>}
   */
  async function getManifestUriFromMediaTailorAdManager(asset) {
    try {
      adManager.setContainers(adContainer, adContainer);
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
