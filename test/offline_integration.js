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

describe('Offline', function() {
  var originalName;
  var storage;
  var player;
  var video;

  beforeAll(/** @suppress {accessControls} */ function(done) {
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = '600';
    video.height = '400';
    video.muted = true;
    document.body.appendChild(video);

    originalName = shaka.offline.DBEngine.DB_NAME_;
    shaka.offline.DBEngine.DB_NAME_ += '_test';
    // Ensure we start with a clean slate.
    shaka.offline.DBEngine.deleteDatabase().catch(fail).then(done);
  });

  beforeEach(function() {
    player = new shaka.Player(video);
    storage = new shaka.offline.Storage(player);
  });

  afterEach(function(done) {
    Promise.all([storage.destroy(), player.destroy()]).catch(fail).then(done);
  });

  afterAll(/** @suppress {accessControls} */ function() {
    document.body.removeChild(video);
    shaka.offline.DBEngine.DB_NAME_ = originalName;
  });

  it('stores and plays clear content', function(done) {
    var uri = '//storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd';
    var storedContent;
    storage.store(uri)
        .then(function(content) {
          storedContent = content;
          return player.load(storedContent.offlineUri);
        })
        .then(function() {
          video.play();
          return shaka.test.Util.delay(5);
        })
        .then(function() {
          expect(video.currentTime).toBeGreaterThan(3);
          expect(video.ended).toBe(false);
          return player.unload();
        })
        .then(function() {
          return storage.remove(storedContent);
        })
        .catch(fail)
        .then(done);
  }, 30000);
});
