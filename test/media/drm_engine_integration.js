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

describe('DrmEngine', function() {
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

  beforeAll(async () => {
    let supportTest = shaka.media.DrmEngine.probeSupport()
        .then(function(result) { support = result; })
        .catch(fail);

    video = shaka.util.Dom.createVideoElement();
    document.body.appendChild(video);

    let responses = await Promise.all([
      supportTest,
      shaka.test.Util.fetch(videoInitSegmentUri),
      shaka.test.Util.fetch(videoSegmentUri),
      shaka.test.Util.fetch(audioInitSegmentUri),
      shaka.test.Util.fetch(audioSegmentUri),
    ]);
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
    networkingEngine.registerRequestFilter(function(type, request) {
      if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) return;

      request.headers['X-AxDRM-Message'] = [
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lk',
        'IjoiNjllNTQwODgtZTllMC00NTMwLThjMWEtMWViNmRjZDBkMTRlIiwibWVzc2FnZSI6e',
        'yJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiNmU1YTFkMj',
        'YtMjc1Ny00N2Q3LTgwNDYtZWFhNWQxZDM0YjVhIn1dfX0.yF7PflOPv9qHnu3ZWJNZ12j',
        'gkqTabmwXbDWk_47tLNE',
      ].join('');
    });

    let playerInterface = {
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

    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addVariant(0)
          .addDrmInfo('com.widevine.alpha')
          .addDrmInfo('com.microsoft.playready')
          .addVideo(1).mime('video/mp4', 'avc1.640015').encrypted(true)
          .addAudio(2).mime('audio/mp4', 'mp4a.40.2').encrypted(true)
      .build();

    let videoStream = manifest.periods[0].variants[0].video;
    let audioStream = manifest.periods[0].variants[0].audio;

    eventManager = new shaka.util.EventManager();

    mediaSourceEngine = new shaka.media.MediaSourceEngine(
        video,
        new shaka.test.FakeClosedCaptionParser(),
        new shaka.test.FakeTextDisplayer());

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

  afterAll(function() {
    document.body.removeChild(video);
  });

  describe('basic flow', function() {
    drmIt('gets a license and can play encrypted segments',
        checkAndRun((done) => {
          // The error callback should not be invoked.
          onErrorSpy.and.callFake(fail);

          let originalRequest = networkingEngine.request.bind(networkingEngine);
          let requestComplete;
          let requestSpy = jasmine.createSpy('request');
          let requestMade = new shaka.util.PublicPromise();
          requestSpy.and.callFake(function() {
            requestMade.resolve();
            requestComplete = originalRequest.apply(null, arguments);
            return requestComplete;
          });
          networkingEngine.request = shaka.test.Util.spyFunc(requestSpy);

          let encryptedEventSeen = new shaka.util.PublicPromise();
          eventManager.listen(video, 'encrypted', function() {
            encryptedEventSeen.resolve();
          });
          eventManager.listen(video, 'error', function() {
            fail('MediaError code ' + video.error.code);
            let extended = video.error.msExtendedCode;
            if (extended) {
              if (extended < 0) {
                extended += Math.pow(2, 32);
              }
              fail('MediaError msExtendedCode ' + extended.toString(16));
            }
          });

          let keyStatusEventSeen = new shaka.util.PublicPromise();
          onKeyStatusSpy.and.callFake(function() {
            keyStatusEventSeen.resolve();
          });

          const periods = manifest.periods;
          const variants = shaka.util.Periods.getAllVariantsFrom(periods);

          drmEngine.initForPlayback(
              variants, manifest.offlineSessionIds).then(function() {
            return drmEngine.attach(video);
          }).then(function() {
            return mediaSourceEngine.appendBuffer(ContentType.VIDEO,
                videoInitSegment, null, null, /* hasClosedCaptions */ false);
          }).then(function() {
            return mediaSourceEngine.appendBuffer(ContentType.AUDIO,
                audioInitSegment, null, null, /* hasClosedCaptions */ false);
          }).then(function() {
            return encryptedEventSeen;
          }).then(function() {
            // With PlayReady, a persistent license policy can cause a different
            // chain of events.  In particular, the request is bypassed and we
            // get a usable key right away.
            return Promise.race([requestMade, keyStatusEventSeen]);
          }).then(function() {
            if (requestSpy.calls.count()) {
              // We made a license request.
              // Only one request should have been made.
              expect(requestSpy.calls.count()).toBe(1);
              // So it's reasonable to assume that this requestComplete Promise
              // is waiting on the correct request.
              return requestComplete;
            } else {
              // This was probably a PlayReady persistent license.
            }
          }).then(function() {
            // Some platforms (notably 2017 Tizen TVs) do not fire key status
            // events.
            let keyStatusTimeout = shaka.test.Util.delay(5);
            return Promise.race([keyStatusTimeout, keyStatusEventSeen]);
          }).then(function() {
            let call = onKeyStatusSpy.calls.mostRecent();
            if (call) {
              let map = /** @type {!Object} */ (call.args[0]);
              expect(Object.keys(map).length).not.toBe(0);
              for (let k in map) {
                expect(map[k]).toBe('usable');
              }
            }

            return mediaSourceEngine.appendBuffer(ContentType.VIDEO,
                videoSegment, null, null, /* hasClosedCaptions */ false);
          }).then(function() {
            return mediaSourceEngine.appendBuffer(ContentType.AUDIO,
                audioSegment, null, null, /* hasClosedCaptions */ false);
          }).then(function() {
            expect(video.buffered.end(0)).toBeGreaterThan(0);
            video.play();
            // Try to play for 5 seconds.
            return shaka.test.Util.delay(5);
          }).then(function() {
            // Something should have played by now.
            expect(video.readyState).toBeGreaterThan(1);
            expect(video.currentTime).toBeGreaterThan(0);
          }).catch(fail).then(done);
        }));
  });  // describe('basic flow')

  /**
   * Before running the test, check if the appropriate keysystems are available.
   * @param {function(function())} test
   * @return {function(function())}
   */
  function checkAndRun(test) {
   return function(done) {
     if (!support['com.widevine.alpha'] &&
         !support['com.microsoft.playready']) {
       pending('Skipping DrmEngine tests.');
     } else {
       test(done);
     }
   };
  }
});
