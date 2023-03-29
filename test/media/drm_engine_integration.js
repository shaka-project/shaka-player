/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DrmEngine', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  // These come from Axinom and use the Axinom license server.
  // TODO: Do not rely on third-party services long-term.
  const videoInitSegmentUri = '/base/test/test/assets/multidrm-video-init.mp4';
  const videoSegmentUri = '/base/test/test/assets/multidrm-video-segment.mp4';
  const audioInitSegmentUri = '/base/test/test/assets/multidrm-audio-init.mp4';
  const audioSegmentUri = '/base/test/test/assets/multidrm-audio-segment.mp4';

  /** @type {!Object.<string, ?shaka.extern.DrmSupportType>} */
  let support = {};

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

  /** @type {!shaka.media.DrmEngine} */
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
      shaka.media.DrmEngine.probeSupport(),
      shaka.test.Util.fetch(videoInitSegmentUri),
      shaka.test.Util.fetch(videoSegmentUri),
      shaka.test.Util.fetch(audioInitSegmentUri),
      shaka.test.Util.fetch(audioSegmentUri),
    ]);
    support = responses[0];
    videoInitSegment = responses[1];
    videoSegment = responses[2];
    audioInitSegment = responses[3];
    audioSegment = responses[4];
  });

  beforeEach(async () => {
    onErrorSpy = jasmine.createSpy('onError');
    onKeyStatusSpy = jasmine.createSpy('onKeyStatus');
    onExpirationSpy = jasmine.createSpy('onExpirationUpdated');
    onEventSpy = jasmine.createSpy('onEvent');

    networkingEngine = new shaka.net.NetworkingEngine();
    networkingEngine.registerRequestFilter((type, request) => {
      if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) {
        return;
      }

      request.headers['X-AxDRM-Message'] = [
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lk',
        'IjoiNjllNTQwODgtZTllMC00NTMwLThjMWEtMWViNmRjZDBkMTRlIiwibWVzc2FnZSI6e',
        'yJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiNmU1YTFkMj',
        'YtMjc1Ny00N2Q3LTgwNDYtZWFhNWQxZDM0YjVhIn1dfX0.yF7PflOPv9qHnu3ZWJNZ12j',
        'gkqTabmwXbDWk_47tLNE',
      ].join('');
    });

    const playerInterface = {
      netEngine: networkingEngine,
      onError: shaka.test.Util.spyFunc(onErrorSpy),
      onKeyStatus: shaka.test.Util.spyFunc(onKeyStatusSpy),
      onExpirationUpdated: shaka.test.Util.spyFunc(onExpirationSpy),
      onEvent: shaka.test.Util.spyFunc(onEventSpy),
    };

    drmEngine = new shaka.media.DrmEngine(playerInterface);
    const config = shaka.util.PlayerConfiguration.createDefault().drm;
    config.servers['com.widevine.alpha'] =
        'https://drm-widevine-licensing.axtest.net/AcquireLicense';
    config.servers['com.microsoft.playready'] =
        'https://drm-playready-licensing.axtest.net/AcquireLicense';
    drmEngine.configure(config);

    manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.addVariant(0, (variant) => {
        variant.addVideo(1, (stream) => {
          stream.encrypted = true;
          stream.addDrmInfo('com.widevine.alpha');
          stream.addDrmInfo('com.microsoft.playready');
        });
        variant.addAudio(2, (stream) => {
          stream.encrypted = true;
          stream.addDrmInfo('com.widevine.alpha');
          stream.addDrmInfo('com.microsoft.playready');
        });
      });
    });

    const videoStream = manifest.variants[0].video;
    const audioStream = manifest.variants[0].audio;

    eventManager = new shaka.util.EventManager();

    mediaSourceEngine = new shaka.media.MediaSourceEngine(
        video,
        new shaka.test.FakeTextDisplayer());
    const mediaSourceConfig =
        shaka.util.PlayerConfiguration.createDefault().mediaSource;
    mediaSourceEngine.configure(mediaSourceConfig);

    const expectedObject = new Map();
    expectedObject.set(ContentType.AUDIO, audioStream);
    expectedObject.set(ContentType.VIDEO, videoStream);
    await mediaSourceEngine.init(expectedObject, false);
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

  function checkTrueDrmSupport() {
    if (shaka.util.Platform.isXboxOne()) {
      // Axinom won't issue a license for an Xbox One.  The error message from
      // the license server says "Your DRM client's security level is 150, but
      // the entitlement message requires 2000 or higher."
      // TODO: Stop using Axinom's license server.  Use
      // https://testweb.playready.microsoft.com/Server/ServiceQueryStringSyntax
      return false;
    }
    return support['com.widevine.alpha'] || support['com.microsoft.playready'];
  }

  function checkClearKeySupport() {
    return support['org.w3.clearkey'];
  }

  filterDescribe('basic flow', checkTrueDrmSupport, () => {
    drmIt('gets a license and can play encrypted segments', async () => {
      // The error callback should not be invoked.
      onErrorSpy.and.callFake(fail);

      const originalRequest = networkingEngine.request;
      let requestComplete;
      /** @type {!jasmine.Spy} */
      const requestSpy = jasmine.createSpy('request');
      /** @type {!shaka.util.PublicPromise} */
      const requestMade = new shaka.util.PublicPromise();
      requestSpy.and.callFake((...args) => {
        requestMade.resolve();
        // eslint-disable-next-line no-restricted-syntax
        requestComplete = originalRequest.call(networkingEngine, ...args);
        return requestComplete;
      });
      networkingEngine.request = shaka.test.Util.spyFunc(requestSpy);

      /** @type {!shaka.util.PublicPromise} */
      const encryptedEventSeen = new shaka.util.PublicPromise();
      eventManager.listen(video, 'encrypted', () => {
        encryptedEventSeen.resolve();
      });
      eventManager.listen(video, 'error', () => {
        fail('MediaError code ' + video.error.code);
        let extended = video.error.msExtendedCode;
        if (extended) {
          if (extended < 0) {
            extended += Math.pow(2, 32);
          }
          fail('MediaError msExtendedCode ' + extended.toString(16));
        }
      });

      /** @type {!shaka.util.PublicPromise} */
      const keyStatusEventSeen = new shaka.util.PublicPromise();
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
      await encryptedEventSeen;
      // With PlayReady, a persistent license policy can cause a different
      // chain of events.  In particular, the request is bypassed and we
      // get a usable key right away.
      await Promise.race([requestMade, keyStatusEventSeen]);

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
      await Promise.race([keyStatusTimeout, keyStatusEventSeen]);

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
      video.play();

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
      // Configure DrmEngine for ClearKey playback.
      const config = shaka.util.PlayerConfiguration.createDefault().drm;
      config.clearKeys = {
        // From https://github.com/Axinom/public-test-vectors/tree/conservative#v61-multidrm
        '6e5a1d26275747d78046eaa5d1d34b5a': '197f26f572c864d2338b3ae5d114ea9c',
      };
      drmEngine.configure(config);

      // The error callback should not be invoked.
      onErrorSpy.and.callFake(fail);

      /** @type {!shaka.util.PublicPromise} */
      const encryptedEventSeen = new shaka.util.PublicPromise();
      eventManager.listen(video, 'encrypted', () => {
        encryptedEventSeen.resolve();
      });
      eventManager.listen(video, 'error', () => {
        fail('MediaError code ' + video.error.code);
        let extended = video.error.msExtendedCode;
        if (extended) {
          if (extended < 0) {
            extended += Math.pow(2, 32);
          }
          fail('MediaError msExtendedCode ' + extended.toString(16));
        }
      });

      /** @type {!shaka.util.PublicPromise} */
      const keyStatusEventSeen = new shaka.util.PublicPromise();
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
      await encryptedEventSeen;

      // Some platforms (notably 2017 Tizen TVs) do not fire key status
      // events.
      const keyStatusTimeout = shaka.test.Util.delay(5);
      await Promise.race([keyStatusTimeout, keyStatusEventSeen]);

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
      video.play();

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
