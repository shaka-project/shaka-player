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
  var videoInitSegmentUri = 'test/assets/multidrm-video-init.mp4';
  var videoSegmentUri = 'test/assets/multidrm-video-segment.mp4';
  var audioInitSegmentUri = 'test/assets/multidrm-audio-init.mp4';
  var audioSegmentUri = 'test/assets/multidrm-audio-segment.mp4';

  var originalTimeout;

  beforeAll(function(done) {
    var supportTest = shaka.media.DrmEngine.support().then(function(result) {
      support = result;
    }).catch(fail);

    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;  // ms

    video = /** @type {HTMLVideoElement} */ (document.createElement('video'));
    video.width = '600';
    video.height = '400';
    video.muted = true;
    document.body.appendChild(video);

    var dummyRequest = {
      allowCrossSiteCredentials: false,
      body: null,
      method: 'GET',
      headers: {},
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      uris: []  // specific URI passed to the plugin is used, not this
    };
    Promise.all([
      supportTest,
      shaka.net.HttpPlugin(videoInitSegmentUri, dummyRequest),
      shaka.net.HttpPlugin(videoSegmentUri, dummyRequest),
      shaka.net.HttpPlugin(audioInitSegmentUri, dummyRequest),
      shaka.net.HttpPlugin(audioSegmentUri, dummyRequest)
    ]).then(function(responses) {
      videoInitSegment = responses[1].data;
      videoSegment = responses[2].data;
      audioInitSegment = responses[3].data;
      audioSegment = responses[4].data;
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
      });
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
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
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

  describe('missing keys error', function() {
    it('fires when manifest PSSH does not match key ID', function(done) {
      setBadManifestData();
      runMissingKeyTest(done);
    });

    it('fires even if the license request is delayed', function(done) {
      setBadManifestData();

      // Delay the license request by 3 seconds.
      var originalRequest = networkingEngine.request;
      networkingEngine.request = jasmine.createSpy('request');
      networkingEngine.request.and.callFake(function(type, request) {
        return shaka.test.Util.delay(3).then(function() {
          return originalRequest.call(networkingEngine, type, request);
        });
      });

      runMissingKeyTest(done);
    });

    it('fires when license server returns wrong key ID', function(done) {
      // TODO: Update once we get a PlayReady license server that will return
      // the wrong key IDs.
      if (!support['com.widevine.alpha']) {
        pending('Skipping DrmEngine tests.');
      }

      var config = {
        retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
        clearKeys: {},
        advanced: {},
        servers: {
          'com.widevine.alpha': '//widevine-proxy.appspot.com/proxy'
        }
      };
      drmEngine.configure(config);
      networkingEngine.clearAllRequestFilters();

      runMissingKeyTest(done);
    });

    function setBadManifestData() {
      // Override the init data from the media.  This is from Axinom's other
      // test asset so we get a key response but for the wrong key ID.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addStreamSet('video')
            .addDrmInfo('com.widevine.alpha')
              .addCencInitData(
                  'AAAANHBzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAABQIARIQFTDToGkE' +
                  'RGqRoTOhFaqMQQ==')
            .addDrmInfo('com.microsoft.playready')
              .addCencInitData(
                  'AAAB5HBzc2gAAAAAmgTweZhAQoarkuZb4IhflQAAAcTEAQAAAQABALoB' +
                  'PABXAFIATQBIAEUAQQBEAEUAUgAgAHgAbQBsAG4AcwA9ACIAaAB0AHQA' +
                  'cAA6AC8ALwBzAGMAaABlAG0AYQBzAC4AbQBpAGMAcgBvAHMAbwBmAHQA' +
                  'LgBjAG8AbQAvAEQAUgBNAC8AMgAwADAANwAvADAAMwAvAFAAbABhAHkA' +
                  'UgBlAGEAZAB5AEgAZQBhAGQAZQByACIAIAB2AGUAcgBzAGkAbwBuAD0A' +
                  'IgA0AC4AMAAuADAALgAwACIAPgA8AEQAQQBUAEEAPgA8AFAAUgBPAFQA' +
                  'RQBDAFQASQBOAEYATwA+ADwASwBFAFkATABFAE4APgAxADYAPAAvAEsA' +
                  'RQBZAEwARQBOAD4APABBAEwARwBJAEQAPgBBAEUAUwBDAFQAUgA8AC8A' +
                  'QQBMAEcASQBEAD4APAAvAFAAUgBPAFQARQBDAFQASQBOAEYATwA+ADwA' +
                  'SwBJAEQAPgBvAE4ATQB3AEYAUQBSAHAAYQBrAFMAUgBvAFQATwBoAEYA' +
                  'YQBxAE0AUQBRAD0APQA8AC8ASwBJAEQAPgA8AC8ARABBAFQAQQA+ADwA' +
                  'LwBXAFIATQBIAEUAQQBEAEUAUgA+AA==')
            .addStream(1).mime('video/mp4', 'avc1.640015').encrypted(true)
          .addStreamSet('audio')
            .addDrmInfo('com.widevine.alpha')
            .addDrmInfo('com.microsoft.playready')
          .addStream(1).mime('audio/mp4', 'mp4a.40.2').encrypted(true)
        .build();

      networkingEngine.clearAllRequestFilters();
      networkingEngine.registerRequestFilter(function(type, request) {
        if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) return;

        request.headers['X-AxDRM-Message'] = [
          'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V',
          '5X2lkIjoiNjllNTQwODgtZTllMC00NTMwLThjMWEtMWViNmRjZDBkMTRlIiwibWV',
          'zc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7Iml',
          'kIjoiMTUzMGQzYTAtNjkwNC00NDZhLTkxYTEtMzNhMTE1YWE4YzQxIn0seyJpZCI',
          '6ImM4M2ViNjM5LWU2NjQtNDNmOC1hZTk4LTQwMzliMGMxM2IyZCJ9LHsiaWQiOiI',
          'zZDhjYzc2Mi0yN2FjLTQwMGYtOTg5Zi04YWI1ZGM3ZDc3NzUifSx7ImlkIjoiYmQ',
          '4ZGFkNTgtMDMyZC00YzI1LTg5ZmEtYzdiNzEwZTgyYWMyIn1dfX0.9t18lFmZFVH',
          'MzpoZxYDyqOS0Bk_evGhTBw_F2JnAK2k'
        ].join('');
      });
    }

    function runMissingKeyTest(done) {
      checkKeySystems();

      // The only error should be key ID not found.
      var onErrorCalled = new shaka.util.PublicPromise();
      onErrorSpy.and.callFake(function(error) {
        onErrorCalled.resolve();
        shaka.test.Util.expectToEqualError(
            error,
            new shaka.util.Error(
                shaka.util.Error.Category.DRM,
                shaka.util.Error.Code.WRONG_KEYS));
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

      drmEngine.init(manifest, /* offline */ false).then(function() {
        return drmEngine.attach(video);
      }).then(function() {
        return mediaSourceEngine.appendBuffer(
            'video', videoInitSegment, null, null);
      }).then(function() {
        return mediaSourceEngine.appendBuffer(
            'audio', audioInitSegment, null, null);
      }).then(function() {
        // waitingforkeys only fires once we are trying to play.
        return mediaSourceEngine.appendBuffer(
            'video', videoSegment, null, null);
      }).then(function() {
        return mediaSourceEngine.appendBuffer(
            'audio', audioSegment, null, null);
      }).then(function() {
        video.play();
        // Try to play for 6 seconds.
        return Promise.race([shaka.test.Util.delay(6), onErrorCalled]);
      }).then(function() {
        // There should have been an error and the video should not play.
        expect(video.currentTime).toBe(0);
        expect(onErrorSpy).toHaveBeenCalled();
      }).catch(fail).then(done);
    }
  });  // describe('missing keys')

  function checkKeySystems() {
    // Our test asset for this suite can use any of these key systems:
    if (!support['com.widevine.alpha'] &&
        !support['com.microsoft.playready']) {
      // pending() throws a special exception that Jasmine uses to skip a test.
      // It can only be used from inside it(), not describe() or beforeEach().
      pending('Skipping DrmEngine tests.');
      // The rest of the test will not run.
    }
  }
});
