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

goog.require('shaka.media.EmeManager');
goog.require('shaka.media.SimpleAbrManager');
goog.require('shaka.player.OfflineVideoSource');
goog.require('shaka.util.ContentDatabaseReader');
goog.require('shaka.util.EWMABandwidthEstimator');
goog.require('shaka.util.PublicPromise');

describe('OfflineVideoSource', function() {

  // This tests whether the OfflineVideoSource deletes the persistent sessions
  // when it deletes the offline content.  This test requires access to
  // persistent licenses, which requires a specially configured license server.
  // Also, offline only works on devices that support persistent licenses.  So
  // this test is disabled by default.
  //
  // To run this test, manually store some protected content in a group BEFORE
  // running the tests and then set the groupId below to the where it is stored.
  var groupId = -1;
  if (groupId >= 0) {
    it('deletes persistent sessions', function(done) {
      var contentDatabase = new shaka.util.ContentDatabaseReader();
      var sessions = [];

      var offlineSource = new shaka.player.OfflineVideoSource(
          groupId, null, null);

      var fakeVideoElement = /** @type {!HTMLVideoElement} */ (
          document.createElement('video'));
      fakeVideoElement.src = window.URL.createObjectURL(
          offlineSource.mediaSource);
      var emeManager = new shaka.media.EmeManager(
          null, fakeVideoElement, offlineSource);

      contentDatabase.setUpDatabase().then(function() {
        return contentDatabase.retrieveGroup(groupId);
      }).then(function(groupInfo) {
        // Find the IDs of the sessions.
        sessions = groupInfo['session_ids'];
        // Require protected content.
        expect(sessions.length).toBeGreaterThan(0);
        // Load the source so we can get a valid EmeManager.
        return offlineSource.load();
      }).then(function() {
        // Ensure the EmeManager does not load the sessions.
        offlineSource.sessionIds_ = [];
        return emeManager.initialize();
      }).then(function() {
        // Create a fresh source to delete the content.
        offlineSource = new shaka.player.OfflineVideoSource(
            groupId, null, null);
        return offlineSource.deleteGroup();
      }).then(function() {
        // Try to load the sessions, it will fail.
        var async = [];
        for (var i = 0; i < sessions.length; i++) {
          var p = emeManager.createSession_().load(sessions[i]).then(
              function(arg) {
                // This means an empty session, it's not valid.
                expect(arg).toBe(false);
              });
          async.push(p);
        }
        return Promise.all(async);
      }).then(function() {
        done();
      }).catch(function(e) {
        fail(e);
      });
    });
  }
});

