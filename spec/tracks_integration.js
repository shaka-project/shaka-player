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

goog.require('shaka.util.EventManager');

describe('Tracks', function() {
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

  describe('selectVideoTrack', function() {
    it('can set resolution before beginning playback', function(done) {
      player.load(newSource(manifests.plainManifest)).then(function() {
        var track = getVideoTrackByHeight(player, 720);
        player.selectVideoTrack(track.id);
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        return delay(6);
      }).then(function() {
        expect(video.videoHeight).toEqual(720);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('can be called multiple times', function(done) {
      player.load(newSource(manifests.plainManifest)).then(function() {
        var track = getVideoTrackByHeight(player, 720);
        player.selectVideoTrack(track.id);
        video.play();
        return waitForMovement(video, eventManager);
      }).then(function() {
        return delay(6);
      }).then(function() {
        expect(video.videoHeight).toEqual(720);

        var track = getVideoTrackByHeight(player, 360);
        player.selectVideoTrack(track.id);

        return delay(6);
      }).then(function() {
        expect(video.videoHeight).toEqual(360);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('addExternalCaptions', function() {
    it('can be enabled', function(done) {
      var source = newSource(manifests.plainManifest);
      source.addExternalCaptions(manifests.captionFile);

      player.load(source).then(function() {
        var activeTrack = getActiveTextTrack(player);
        expect(activeTrack.enabled).toBe(false);

        player.enableTextTrack(true);

        activeTrack = getActiveTextTrack(player);
        expect(activeTrack.enabled).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('can be called multiple times', function(done) {
      var source = newSource(manifests.plainManifest);
      source.addExternalCaptions(manifests.captionFile);
      source.addExternalCaptions(manifests.captionFile, 'es');

      player.load(source).then(function() {
        var tracks = player.getTextTracks();
        expect(tracks.length).toBe(2);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('enableTextTrack', function() {
    it('enables the active track', function(done) {
      player.load(newSource(manifests.languagesManifest)).then(function() {
        var activeTrack = getActiveTextTrack(player);
        expect(activeTrack.enabled).toBe(false);

        player.enableTextTrack(true);

        activeTrack = getActiveTextTrack(player);
        expect(activeTrack.enabled).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('selectTextTrack', function() {
    var tracks;
    it('activates the correct track', function(done) {
      player.load(newSource(manifests.languagesManifest)).then(function() {
        tracks = player.getTextTracks();
        var activeTrack = getActiveTextTrack(player);
        // Ensure that it is the first track, so that we know our selection
        // of the second track is affecting a real change.
        expect(activeTrack.id).toBe(tracks[0].id);

        player.selectTextTrack(tracks[1].id);
        return delay(0.1);
      }).then(function() {
        activeTrack = getActiveTextTrack(player);
        expect(activeTrack.id).toBe(tracks[1].id);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('fires an adaptation event', function(done) {
      var onAdaptation = jasmine.createSpy('onAdaptation');
      player.load(newSource(manifests.languagesManifest)).then(function() {
        player.addEventListener('adaptation', onAdaptation, false);

        tracks = player.getTextTracks();
        player.selectTextTrack(tracks[1].id);
        return delay(0.1);
      }).then(function() {
        activeTrack = getActiveTextTrack(player);
        expect(activeTrack.id).toBe(tracks[1].id);

        var found = false;
        var max = onAdaptation.calls.count();
        for (var i = 0; i < max; i++) {
          if (onAdaptation.calls.argsFor(i)[0].contentType === 'text') {
            found = true;
          }
        }
        expect(found).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });


    it('does not disable subtitles', function(done) {
      var tracks;
      player.load(newSource(manifests.languagesManifest)).then(function() {
        tracks = player.getTextTracks();
        player.selectTextTrack(tracks[0].id);
        player.enableTextTrack(true);
        return delay(0.1);
      }).then(function() {
        var activeTrack = getActiveTextTrack(player);
        expect(activeTrack.enabled).toBe(true);
        expect(activeTrack.id).toBe(tracks[0].id);

        player.selectTextTrack(tracks[1].id);
        return delay(0.1);
      }).then(function() {
        activeTrack = getActiveTextTrack(player);
        expect(activeTrack.enabled).toBe(true);
        expect(activeTrack.id).toBe(tracks[1].id);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('does not re-enable subtitles', function(done) {
      var tracks;
      player.load(newSource(manifests.languagesManifest)).then(function() {
        tracks = player.getTextTracks();
        player.selectTextTrack(tracks[0].id);
        player.enableTextTrack(false);
        return delay(0.1);
      }).then(function() {
        var activeTrack = getActiveTextTrack(player);
        expect(activeTrack.enabled).toBe(false);
        expect(activeTrack.id).toBe(tracks[0].id);

        player.selectTextTrack(tracks[1].id);
        return delay(0.1);
      }).then(function() {
        activeTrack = getActiveTextTrack(player);
        expect(activeTrack.enabled).toBe(false);
        expect(activeTrack.id).toBe(tracks[1].id);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

});

