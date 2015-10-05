/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.require('shaka.player.Defaults');
goog.require('shaka.player.Restrictions');
goog.require('shaka.util.EventManager');

describe('Configuration', function() {
  var video;
  var player;
  var eventManager;
  var estimator;

  beforeAll(integration.setUp);
  afterAll(integration.tearDown);

  beforeEach(function() {
    // Create a video tag.  This will be visible so that long tests do not
    // create the illusion of the test-runner being hung.
    video = createVideo();
    document.body.appendChild(video);

    player = createPlayer(video);
    eventManager = new shaka.util.EventManager();
  });

  afterEach(function(done) {
    eventManager.destroy();
    eventManager = null;

    player.destroy().then(function() {
      player = null;
      done();
    });

    // Remove the video tag from the DOM.
    document.body.removeChild(video);
  });

  describe('configuring the preferredLanguage', function() {
    it('changes the default tracks', function(done) {
      var originalAudioId;
      var originalTextId;

      player.load(newSource(manifests.languagesManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        var activeAudioTrack = getActiveAudioTrack(player);
        expect(activeAudioTrack.lang).toBe('en');
        originalAudioId = activeAudioTrack.id;

        var activeTextTrack = getActiveTextTrack(player);
        expect(activeTextTrack.lang).toBe('en');
        originalTextId = activeTextTrack.id;

        player.configure({'preferredLanguage': 'fr'});
        return player.load(newSource(manifests.languagesManifest));
      }).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        var activeAudioTrack = getActiveAudioTrack(player);
        expect(activeAudioTrack.lang).toBe('fr');
        expect(activeAudioTrack.id).not.toBe(originalAudioId);

        var activeTextTrack = getActiveTextTrack(player);
        expect(activeTextTrack.lang).toBe('fr');
        expect(activeTextTrack.id).not.toBe(originalTextId);

        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('enables text tracks when no matching audio is found', function(done) {
      player.configure({'preferredLanguage': 'el'});
      player.load(newSource(manifests.languagesManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        var activeAudioTrack = getActiveAudioTrack(player);
        expect(activeAudioTrack.lang).toBe('en');

        var activeTextTrack = getActiveTextTrack(player);
        expect(activeTextTrack.lang).toBe('el');
        expect(activeTextTrack.enabled).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('disables text tracks when matching audio is found', function(done) {
      player.configure({'preferredLanguage': 'fr'});
      player.load(newSource(manifests.languagesManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        var activeAudioTrack = getActiveAudioTrack(player);
        expect(activeAudioTrack.lang).toBe('fr');

        var activeTextTrack = getActiveTextTrack(player);
        expect(activeTextTrack.lang).toBe('fr');
        expect(activeTextTrack.enabled).toBe(false);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('respects the \'main\' attribute', function(done) {
      // There are no Thai audio AdaptationSets in the MPD, but the English
      // audio AdaptationSet is marked as main, so even though it is not the
      // first AdaptationSet, it should be preferred.
      player.configure({'preferredLanguage': 'th'});

      player.load(newSource(manifests.languagesManifest)).then(function() {
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        var activeAudioTrack = getActiveAudioTrack(player);
        expect(activeAudioTrack.lang).toBe('en');
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('configuring restrictions', function() {
    it('ignores video tracks above the maximum height', function(done) {
      player.load(newSource(manifests.encryptedManifest)).then(function() {
        var hdVideoTrack = getVideoTrackByHeight(player, 720);
        var sdVideoTrack = getVideoTrackByHeight(player, 480);
        expect(hdVideoTrack).not.toBe(null);
        expect(sdVideoTrack).not.toBe(null);

        var restrictions = player.getConfiguration()['restrictions'];
        restrictions.maxHeight = 480;
        player.configure({'restrictions': restrictions});

        hdVideoTrack = getVideoTrackByHeight(player, 720);
        sdVideoTrack = getVideoTrackByHeight(player, 480);
        expect(hdVideoTrack).toBe(null);
        expect(sdVideoTrack).not.toBe(null);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('ignores video tracks above the maximum width', function(done) {
      player.load(newSource(manifests.encryptedManifest)).then(function() {
        var hdVideoTrack = getVideoTrackByHeight(player, 720);
        var sdVideoTrack = getVideoTrackByHeight(player, 480);
        expect(hdVideoTrack).not.toBe(null);
        expect(sdVideoTrack).not.toBe(null);

        var restrictions = player.getConfiguration()['restrictions'];
        restrictions.maxWidth = 854;
        player.configure({'restrictions': restrictions});

        hdVideoTrack = getVideoTrackByHeight(player, 720);
        sdVideoTrack = getVideoTrackByHeight(player, 480);
        expect(hdVideoTrack).toBe(null);
        expect(sdVideoTrack).not.toBe(null);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('takes effect before the source is loaded', function(done) {
      var restrictions = player.getConfiguration()['restrictions'];
      restrictions.maxHeight = 480;
      player.configure({'restrictions': restrictions});

      player.load(newSource(manifests.encryptedManifest)).then(function() {
        var hdVideoTrack = getVideoTrackByHeight(player, 720);
        var sdVideoTrack = getVideoTrackByHeight(player, 480);
        expect(hdVideoTrack).toBe(null);
        expect(sdVideoTrack).not.toBe(null);

        var restrictions = player.getConfiguration()['restrictions'];
        restrictions.maxHeight = null;
        player.configure({'restrictions': restrictions});

        hdVideoTrack = getVideoTrackByHeight(player, 720);
        sdVideoTrack = getVideoTrackByHeight(player, 480);
        expect(hdVideoTrack).not.toBe(null);
        expect(sdVideoTrack).not.toBe(null);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('fires error if all tracks restricted while playing', function(done) {
      player.removeEventListener('error', convertErrorToTestFailure, false);
      var onError = jasmine.createSpy('onError');
      player.addEventListener('error', onError, false);

      player.load(newSource(manifests.plainManifest)).then(function() {
        waitForMovement(video, eventManager);
      }).then(function() {
        var restrictions = player.getConfiguration()['restrictions'];
        restrictions.maxBandwidth = 10000;
        player.configure({'restrictions': restrictions});

        expect(onError.calls.any()).toBe(true);
        expect(player.getVideoTracks().length).toBe(0);

        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('fires error if all tracks restricted before playing', function(done) {
      player.removeEventListener('error', convertErrorToTestFailure, false);
      var onError = jasmine.createSpy('onError');
      player.addEventListener('error', onError, false);

      var restrictions = player.getConfiguration()['restrictions'];
      restrictions.maxBandwidth = 10000;
      player.configure({'restrictions': restrictions});

      player.load(newSource(manifests.encryptedManifest)).then(function() {
        fail();
      }).catch(function(error) {
        expect(onError.calls.any()).toBe(true);
        done();
      });
    });
  });

  describe('configure and getConfiguration', function() {
    it('rejects an invalid enableAdaptation', function() {
      var exception;
      try {
        player.configure({'enableAdaptation': 2});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);
    });

    it('gets/sets stream buffer size', function() {
      var original = player.getConfiguration()['streamBufferSize'];
      expect(original).not.toBe(5);
      expect(original).toBe(shaka.player.Defaults.STREAM_BUFFER_SIZE);

      expect(player.getConfiguration()['streamBufferSize']).toBe(original);

      player.configure({'streamBufferSize': 5});
      expect(player.getConfiguration()['streamBufferSize']).toBe(5);

      player.configure({'streamBufferSize': original});
      expect(player.getConfiguration()['streamBufferSize']).toBe(original);
    });


    it('rejects an invalid streamBufferSize', function() {
      var exception;

      try {
        player.configure({'streamBufferSize': 'three seconds'});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);

      try {
        player.configure({'streamBufferSize': -1});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof RangeError).toBe(true);
    });

    it('gets/sets LicenseRequest timeout', function() {
      var original = player.getConfiguration()['licenseRequestTimeout'];
      expect(original).not.toBe(5);
      expect(original).toBe(shaka.player.Defaults.LICENSE_REQUEST_TIMEOUT);

      expect(player.getConfiguration()['licenseRequestTimeout']).toBe(original);

      player.configure({'licenseRequestTimeout': 5});
      expect(player.getConfiguration()['licenseRequestTimeout']).toBe(5);

      player.configure({'licenseRequestTimeout': original});
      expect(player.getConfiguration()['licenseRequestTimeout']).toBe(original);
    });

    it('rejects an invalid LicenseRequest timeout', function() {
      var exception;

      try {
        player.configure({'licenseRequestTimeout': 'five seconds'});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);

      try {
        player.configure({'licenseRequestTimeout': NaN});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof RangeError).toBe(true);
    });

    it('gets/sets MpdRequest timeout', function() {
      var original = player.getConfiguration()['mpdRequestTimeout'];
      expect(original).not.toBe(5);
      expect(original).toBe(shaka.player.Defaults.MPD_REQUEST_TIMEOUT);

      expect(player.getConfiguration()['mpdRequestTimeout']).toBe(original);

      player.configure({'mpdRequestTimeout': 5});
      expect(player.getConfiguration()['mpdRequestTimeout']).toBe(5);

      player.configure({'mpdRequestTimeout': original});
      expect(player.getConfiguration()['mpdRequestTimeout']).toBe(original);
    });

    it('rejects an invalid MpdRequest timeout', function() {
      var exception;

      try {
        player.configure({'mpdRequestTimeout': 'seven seconds'});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);

      try {
        player.configure({'mpdRequestTimeout': Number.NEGATIVE_INFINITY});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof RangeError).toBe(true);
    });

    it('gets/sets SegmentRequest timeout', function() {
      var original = player.getConfiguration()['segmentRequestTimeout'];
      expect(original).not.toBe(5);
      expect(original).toBe(shaka.player.Defaults.SEGMENT_REQUEST_TIMEOUT);

      expect(player.getConfiguration()['segmentRequestTimeout']).toBe(original);

      player.configure({'segmentRequestTimeout': 5});
      expect(player.getConfiguration()['segmentRequestTimeout']).toBe(5);

      player.configure({'segmentRequestTimeout': original});
      expect(player.getConfiguration()['segmentRequestTimeout']).toBe(original);
    });

    it('rejects an invalid SegmentRequest timeout', function() {
      var exception;

      try {
        player.configure({'segmentRequestTimeout': 'eleven seconds'});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);

      try {
        player.configure({'segmentRequestTimeout': Number.POSITIVE_INFINITY});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof RangeError).toBe(true);
    });

    it('rejects an invalid preferredLanguage', function() {
      var exception;
      try {
        player.configure({'preferredLanguage': 13});
        fail();
      } catch (e) {
        exception = e;
      }
      expect(exception instanceof TypeError).toBe(true);
    });

    it('gets/sets multiple options at once', function() {
      var restrictions = new shaka.player.Restrictions();
      restrictions.maxWidth = 1280;
      var originalConfig = player.getConfiguration();
      var config = {
        'enableAdaptation': true,
        'streamBufferSize': 17,
        'liveStreamEndTimeout': 20,
        'licenseRequestTimeout': 19,
        'mpdRequestTimeout': 23,
        'segmentRequestTimeout': 29,
        'preferredLanguage': 'fr',
        'restrictions': restrictions
      };
      player.configure(config);
      expect(JSON.stringify(player.getConfiguration()))
          .toBe(JSON.stringify(config));
      player.configure(originalConfig);
    });
  });
});

