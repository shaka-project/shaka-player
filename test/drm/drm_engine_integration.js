/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DrmEngine', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  // Sintel, packaged with Shaka Streamer against Widevine's test key server,
  // carrying both Widevine and PlayReady headers.
  const videoInitSegmentUri = '/base/test/test/assets/multidrm-video-init.mp4';
  const videoSegmentUri = '/base/test/test/assets/multidrm-video-segment.mp4';
  const audioInitSegmentUri = '/base/test/test/assets/multidrm-audio-init.mp4';
  const audioSegmentUri = '/base/test/test/assets/multidrm-audio-segment.mp4';

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.extern.Manifest} */
  let manifest;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;
  /** @type {!jasmine.Spy} */
  let onKeyStatusSpy;
  /** @type {!jasmine.Spy} */
  let onExpirationSpy;
  /** @type {!jasmine.Spy} */
  let onEventSpy;

  /** @type {!shaka.drm.DrmEngine} */
  let drmEngine;
  /** @type {!shaka.media.MediaSourceEngine} */
  let mediaSourceEngine;
  /** @type {!shaka.net.NetworkingEngine} */
  let networkingEngine;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  /** @type {!ArrayBuffer} */
  let videoInitSegment;
  /** @type {!ArrayBuffer} */
  let audioInitSegment;
  /** @type {!ArrayBuffer} */
  let videoSegment;
  /** @type {!ArrayBuffer} */
  let audioSegment;

  /** @type {shaka.extern.Stream} */
  const fakeStream = shaka.test.StreamingEngineUtil.createMockVideoStream(1);

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);

    const responses = await Promise.all([
      shaka.test.Util.fetch(videoInitSegmentUri),
      shaka.test.Util.fetch(videoSegmentUri),
      shaka.test.Util.fetch(audioInitSegmentUri),
      shaka.test.Util.fetch(audioSegmentUri),
    ]);
    videoInitSegment = responses[0];
    videoSegment = responses[1];
    audioInitSegment = responses[2];
    audioSegment = responses[3];
  });

  beforeEach(async () => {
    onErrorSpy = jasmine.createSpy('onError');
    onKeyStatusSpy = jasmine.createSpy('onKeyStatus');
    onExpirationSpy = jasmine.createSpy('onExpirationUpdated');
    onEventSpy = jasmine.createSpy('onEvent');

    networkingEngine = new shaka.net.NetworkingEngine();

    const defaultConfig =
        shaka.util.PlayerConfiguration.createDefault().networking;
    networkingEngine.configure(defaultConfig);

    const playerInterface = {
      netEngine: networkingEngine,
      onError: shaka.test.Util.spyFunc(onErrorSpy),
      onKeyStatus: shaka.test.Util.spyFunc(onKeyStatusSpy),
      onExpirationUpdated: shaka.test.Util.spyFunc(onExpirationSpy),
      onEvent: shaka.test.Util.spyFunc(onEventSpy),
    };

    drmEngine = new shaka.drm.DrmEngine(playerInterface);
    const config = shaka.util.PlayerConfiguration.createDefault().drm;
    // Widevine's own test proxy issues the keys, because the content was
    // packaged against it.  Keys are derived from the content ID.  PlayReady
    // cannot derive anything, so its test server is told the keys outright.
    // Audio and video carry different keys, hence two pairs.
    config.servers['com.widevine.alpha'] =
        'https://proxy.uat.widevine.com/proxy';
    // cspell:disable
    config.servers['com.microsoft.playready'] =
        'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=' +
        '(kid:26093af8-68d3-5e2c-ae9f-1cd3d59932f1,' +
        'contentkey:EWhluYzoRWVfysDE4GLf3Q==,sl:150),' +
        '(kid:763c2f1e-d21a-521b-a1f1-bc49e9d429ac,' +
        'contentkey:k+agIcdficUArJbWp6EKlQ==,sl:150)';
    // cspell:enable
    config.preferredKeySystems = [
      'com.widevine.alpha',
      'com.microsoft.playready',
    ];
    drmEngine.configure(config);

    manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.addVariant(0, (variant) => {
        variant.addVideo(1, (stream) => {
          stream.encrypted = true;
          stream.addDrmInfo('com.microsoft.playready');
          stream.addDrmInfo('com.widevine.alpha');
        });
        variant.addAudio(2, (stream) => {
          stream.encrypted = true;
          stream.addDrmInfo('com.microsoft.playready');
          stream.addDrmInfo('com.widevine.alpha');
        });
      });
    });

    const videoStream = manifest.variants[0].video;
    const audioStream = manifest.variants[0].audio;

    eventManager = new shaka.util.EventManager();
    const mediaSourceConfig =
        shaka.util.PlayerConfiguration.createDefault().mediaSource;
    mediaSourceEngine = new shaka.media.MediaSourceEngine(
        video,
        new shaka.test.FakeTextDisplayer(),
        {
          getKeySystem: () => null,
          onMetadata: () => {},
          onEmsg: () => {},
          onEvent: () => {},
          onManifestUpdate: () => {},
          getDrmInfo: () => null,
        },
        mediaSourceConfig);

    const expectedObject = new Map();
    expectedObject.set(ContentType.AUDIO, audioStream);
    expectedObject.set(ContentType.VIDEO, videoStream);
    await mediaSourceEngine.init(expectedObject);
  });

  afterEach(async () => {
    eventManager.release();

    await mediaSourceEngine.destroy();
    await networkingEngine.destroy();
    await drmEngine.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  filterDescribe('basic flow', checkTrueDrmSupport, () => {
    drmIt('gets a license and can play encrypted segments', async () => {
      // The error callback should not be invoked.
      onErrorSpy.and.callFake(fail);

      const originalRequest = networkingEngine.request;
      let requestComplete;
      /** @type {!jasmine.Spy} */
      const requestSpy = jasmine.createSpy('request');
      /** @type {!Promise.PromiseWithResolvers} */
      const requestMade = Promise.withResolvers();
      requestSpy.and.callFake((...args) => {
        requestMade.resolve();
        // eslint-disable-next-line no-restricted-syntax
        requestComplete = originalRequest.call(networkingEngine, ...args);
        return requestComplete;
      });
      networkingEngine.request = shaka.test.Util.spyFunc(requestSpy);

      /** @type {!Promise.PromiseWithResolvers} */
      const encryptedEventSeen = Promise.withResolvers();
      eventManager.listen(video, 'encrypted', () => {
        encryptedEventSeen.resolve();
      });

      eventManager.listen(video, 'error', () => {
        fail('MediaError message ' + video.error.message);
        fail('MediaError code ' + video.error.code);

        let extended = video.error.msExtendedCode;
        if (extended) {
          if (extended < 0) {
            extended += Math.pow(2, 32);
          }
          fail('MediaError msExtendedCode ' + extended.toString(16));
        }
      });

      /** @type {!Promise.PromiseWithResolvers} */
      const keyStatusEventSeen = Promise.withResolvers();
      onKeyStatusSpy.and.callFake(() => {
        keyStatusEventSeen.resolve();
      });

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      await drmEngine.attach(video);

      await mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, videoInitSegment, null, fakeStream,
          /* hasClosedCaptions= */ false);
      await mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, audioInitSegment, null, fakeStream,
          /* hasClosedCaptions= */ false);
      await encryptedEventSeen.promise;

      // With PlayReady, a persistent license policy can cause a different
      // chain of events.  In particular, the request is bypassed and we
      // get a usable key right away.
      await Promise.race([requestMade.promise, keyStatusEventSeen.promise]);

      if (requestSpy.calls.count()) {
        // We made a license request.
        // Only one request should have been made.
        expect(requestSpy).toHaveBeenCalledTimes(1);
        // So it's reasonable to assume that this requestComplete Promise
        // is waiting on the correct request.
        await requestComplete;
      } else {
        // This was probably a PlayReady persistent license.
      }

      // Some platforms (notably 2017 Tizen TVs) do not fire key status
      // events.
      const keyStatusTimeout = shaka.test.Util.delay(5);
      await Promise.race([keyStatusTimeout, keyStatusEventSeen.promise]);

      const call = onKeyStatusSpy.calls.mostRecent();
      if (call) {
        const map = /** @type {!Object} */ (call.args[0]);
        expect(Object.keys(map).length).not.toBe(0);
        for (const k in map) {
          expect(map[k]).toBe('usable');
        }
      }

      const reference = dummyReference(0, 10);

      await mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, videoSegment, reference, fakeStream,
          /* hasClosedCaptions= */ false);
      await mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, audioSegment, reference, fakeStream,
          /* hasClosedCaptions= */ false);

      expect(video.buffered.end(0)).toBeGreaterThan(0);
      await video.play();

      const waiter = new shaka.test.Waiter(eventManager).timeoutAfter(15);
      waiter.setMediaSourceEngine(mediaSourceEngine);
      await waiter.waitForMovement(video);

      // Something should have played by now.
      expect(video.readyState).toBeGreaterThan(1);
      expect(video.currentTime).toBeGreaterThan(0);
    });
  });  // describe('basic flow')

  filterDescribe('ClearKey', checkClearKeySupport, () => {
    drmIt('plays encrypted content with the ClearKey CDM', async () => {
      const BrowserEngine = shaka.device.IDevice.BrowserEngine;
      if (deviceDetected.getBrowserEngine() === BrowserEngine.WEBKIT) {
        pending('Disabled on Safari.');
      }
      // Configure DrmEngine for ClearKey playback.
      const config = shaka.util.PlayerConfiguration.createDefault().drm;
      // The keys Widevine's test key server derived for this content, given
      // the content id it was packaged with.  Audio and video carry different
      // keys, so both are needed.
      config.clearKeys = {
        // Video.
        '26093af868d35e2cae9f1cd3d59932f1': '116865b98ce845655fcac0c4e062dfdd',
        // Audio.
        '763c2f1ed21a521ba1f1bc49e9d429ac': '93e6a021c75f89c500ac96d6a7a10a95',
      };
      drmEngine.configure(config);

      // The error callback should not be invoked.
      onErrorSpy.and.callFake(fail);

      /** @type {!Promise.PromiseWithResolvers} */
      const encryptedEventSeen = Promise.withResolvers();
      eventManager.listen(video, 'encrypted', () => {
        encryptedEventSeen.resolve();
      });

      eventManager.listen(video, 'error', () => {
        fail('MediaError message ' + video.error.message);
        fail('MediaError code ' + video.error.code);

        let extended = video.error.msExtendedCode;
        if (extended) {
          if (extended < 0) {
            extended += Math.pow(2, 32);
          }
          fail('MediaError msExtendedCode ' + extended.toString(16));
        }
      });

      /** @type {!Promise.PromiseWithResolvers} */
      const keyStatusEventSeen = Promise.withResolvers();
      onKeyStatusSpy.and.callFake(() => {
        keyStatusEventSeen.resolve();
      });

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      await drmEngine.attach(video);

      await mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, videoInitSegment, null, fakeStream,
          /* hasClosedCaptions= */ false);
      await mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, audioInitSegment, null, fakeStream,
          /* hasClosedCaptions= */ false);
      await encryptedEventSeen.promise;

      // Some platforms (notably 2017 Tizen TVs) do not fire key status
      // events.
      const keyStatusTimeout = shaka.test.Util.delay(5);
      await Promise.race([keyStatusTimeout, keyStatusEventSeen.promise]);

      const call = onKeyStatusSpy.calls.mostRecent();
      if (call) {
        const map = /** @type {!Object} */ (call.args[0]);
        expect(Object.keys(map).length).not.toBe(0);
        for (const k in map) {
          expect(map[k]).toBe('usable');
        }
      }

      const reference = dummyReference(0, 10);

      await mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, videoSegment, reference, fakeStream,
          /* hasClosedCaptions= */ false);
      await mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, audioSegment, reference, fakeStream,
          /* hasClosedCaptions= */ false);

      expect(video.buffered.end(0)).toBeGreaterThan(0);
      await video.play();

      const waiter = new shaka.test.Waiter(eventManager).timeoutAfter(15);
      waiter.setMediaSourceEngine(mediaSourceEngine);
      await waiter.waitForMovement(video);

      // Something should have played by now.
      expect(video.readyState).toBeGreaterThan(1);
      expect(video.currentTime).toBeGreaterThan(0);
    });
  });  // describe('ClearKey')

  function dummyReference(startTime, endTime) {
    return new shaka.media.SegmentReference(
        startTime, endTime,
        /* uris= */ () => ['foo://bar'],
        /* startByte= */ 0,
        /* endByte= */ null,
        /* initSegmentReference= */ null,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity);
  }
});
