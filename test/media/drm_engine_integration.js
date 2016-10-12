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
  var support = {};

  var video;
  var mediaSource;
  var manifest;

  var onErrorSpy;
  var onKeyStatusSpy;
  var drmEngine;
  var mediaSourceEngine;
  var networkingEngine;
  var eventManager;

  var videoInitSegment;
  var audioInitSegment;
  var videoSegment;
  var audioSegment;

  // These come from Axinom and use the Axinom license server.
  // TODO: Do not rely on third-party services long-term.
  var videoInitSegmentUri = '/base/test/test/assets/multidrm-video-init.mp4';
  var videoSegmentUri = '/base/test/test/assets/multidrm-video-segment.mp4';
  var audioInitSegmentUri = '/base/test/test/assets/multidrm-audio-init.mp4';
  var audioSegmentUri = '/base/test/test/assets/multidrm-audio-segment.mp4';

  beforeAll(function(done) {
    var supportTest = shaka.media.DrmEngine.probeSupport()
        .then(function(result) { support = result; })
        .catch(fail);

    video = /** @type {HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);

    Promise.all([
      supportTest,
      shaka.test.Util.fetch(videoInitSegmentUri),
      shaka.test.Util.fetch(videoSegmentUri),
      shaka.test.Util.fetch(audioInitSegmentUri),
      shaka.test.Util.fetch(audioSegmentUri)
    ]).then(function(responses) {
      videoInitSegment = responses[1];
      videoSegment = responses[2];
      audioInitSegment = responses[3];
      audioSegment = responses[4];
    }).catch(fail).then(done);
  });

  beforeEach(function(done) {
    onErrorSpy = jasmine.createSpy('onError');
    onKeyStatusSpy = jasmine.createSpy('onKeyStatus');

    mediaSource = new MediaSource();
    video.src = window.URL.createObjectURL(mediaSource);

    networkingEngine = new shaka.net.NetworkingEngine();
    networkingEngine.registerRequestFilter(function(type, request) {
      if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) return;

      request.headers['X-AxDRM-Message'] = [
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lk',
        'IjoiNjllNTQwODgtZTllMC00NTMwLThjMWEtMWViNmRjZDBkMTRlIiwibWVzc2FnZSI6e',
        'yJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiNmU1YTFkMj',
        'YtMjc1Ny00N2Q3LTgwNDYtZWFhNWQxZDM0YjVhIn1dfX0.yF7PflOPv9qHnu3ZWJNZ12j',
        'gkqTabmwXbDWk_47tLNE'
      ].join('');
    });

    drmEngine = new shaka.media.DrmEngine(
        networkingEngine, onErrorSpy, onKeyStatusSpy);
    var config = {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      clearKeys: {},
      advanced: {},
      servers: {
        'com.widevine.alpha':
            'http://drm-widevine-licensing.axtest.net/AcquireLicense',
        'com.microsoft.playready':
            'http://drm-playready-licensing.axtest.net/AcquireLicense'
      }
    };
    drmEngine.configure(config);

    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addStreamSet('video')
          .addDrmInfo('com.widevine.alpha')
          .addDrmInfo('com.microsoft.playready')
          .addStream(1).mime('video/mp4', 'avc1.640015').encrypted(true)
        .addStreamSet('audio')
          .addDrmInfo('com.widevine.alpha')
          .addDrmInfo('com.microsoft.playready')
          .addStream(1).mime('audio/mp4', 'mp4a.40.2').encrypted(true)
      .build();

    eventManager = new shaka.util.EventManager();

    eventManager.listen(mediaSource, 'sourceopen', function() {
      eventManager.unlisten(mediaSource, 'sourceopen');
      mediaSourceEngine = new shaka.media.MediaSourceEngine(
          video, mediaSource, null);

      mediaSourceEngine.init({
        'video': 'video/mp4; codecs="avc1.640015"',
        'audio': 'audio/mp4; codecs="mp4a.40.2"'
      }, false);
      done();
    });
  });

  afterEach(function(done) {
    video.removeAttribute('src');
    video.load();
    Promise.all([
      eventManager.destroy(),
      mediaSourceEngine.destroy(),
      networkingEngine.destroy(),
      drmEngine.destroy()
    ]).then(done);
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  describe('basic flow', function() {
    it('gets a license and can play encrypted segments', function(done) {
      checkKeySystems();

      // The error callback should not be invoked.
      onErrorSpy.and.callFake(fail);

      var originalRequest = networkingEngine.request;
      var requestComplete;
      var requestSpy = jasmine.createSpy('request');
      var requestMade = new shaka.util.PublicPromise();
      requestSpy.and.callFake(function() {
        requestMade.resolve();
        requestComplete = originalRequest.apply(this, arguments);
        return requestComplete;
      });
      networkingEngine.request = requestSpy;

      var encryptedEventSeen = new shaka.util.PublicPromise();
      eventManager.listen(video, 'encrypted', function() {
        encryptedEventSeen.resolve();
      });
      eventManager.listen(video, 'error', function() {
        fail('MediaError code ' + video.error.code);
        var extended = video.error.msExtendedCode;
        if (extended) {
          if (extended < 0) {
            extended += Math.pow(2, 32);
          }
          fail('MediaError msExtendedCode ' + extended.toString(16));
        }
      });

      var keyStatusEventSeen = new shaka.util.PublicPromise();
      onKeyStatusSpy.and.callFake(function() {
        keyStatusEventSeen.resolve();
      });

      drmEngine.init(manifest, /* offline */ false).then(function() {
        return drmEngine.attach(video);
      }).then(function() {
        return mediaSourceEngine.appendBuffer('video', videoInitSegment,
                                              null, null);
      }).then(function() {
        return mediaSourceEngine.appendBuffer('audio', audioInitSegment,
                                              null, null);
      }).then(function() {
        return encryptedEventSeen;
      }).then(function() {
        // With PlayReady, a persistent license policy can cause a different
        // chain of events.  In particular, the request is bypassed and we get
        // a usable key right away.
        return Promise.race([requestMade, keyStatusEventSeen]);
      }).then(function() {
        if (requestSpy.calls.count()) {
          // We made a license request.
          // Only one request should have been made.
          expect(requestSpy.calls.count()).toBe(1);
          // So it's reasonable to assume that this requestComplete Promise is
          // waiting on the correct request.
          return requestComplete;
        } else {
          // This was probably a PlayReady persistent license.
        }
      }).then(function() {
        return keyStatusEventSeen;
      }).then(function() {
        var call = onKeyStatusSpy.calls.mostRecent();
        if (call) {
          var map = call.args[0];
          expect(Object.keys(map).length).not.toBe(0);
          for (var k in map) {
            expect(map[k]).toBe('usable');
          }
        }

        return mediaSourceEngine.appendBuffer('video', videoSegment,
                                              null, null);
      }).then(function() {
        return mediaSourceEngine.appendBuffer('audio', audioSegment,
                                              null, null);
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
    });
  });  // describe('basic flow')

  function checkKeySystems() {
    // Our test asset for this suite can use any of these key systems:
    if (!support['com.widevine.alpha'] && !support['com.microsoft.playready']) {
      // pending() throws a special exception that Jasmine uses to skip a test.
      // It can only be used from inside it(), not describe() or beforeEach().
      pending('Skipping DrmEngine tests.');
      // The rest of the test will not run.
    }
  }
});
