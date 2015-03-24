/**
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
 *
 * @fileoverview Implements an offline video source.
 */

goog.provide('shaka.player.OfflineVideoSource');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.dash.MpdProcessor');
goog.require('shaka.dash.MpdRequest');
goog.require('shaka.dash.mpd');
goog.require('shaka.log');
goog.require('shaka.media.EmeManager');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.player.StreamVideoSource');
goog.require('shaka.util.ContentDatabase');
goog.require('shaka.util.TypedBind');



/**
 * Creates an OfflineVideoSource.
 * @param {?number} groupId The unique ID of the group of streams
 *    in this source.
 * @struct
 * @constructor
 * @extends {shaka.player.StreamVideoSource}
 * @export
 */
shaka.player.OfflineVideoSource = function(groupId) {
  shaka.player.StreamVideoSource.call(this, null);

  /** @private {?number} */
  this.groupId_ = groupId;

  /** @private {!Array.<string>} */
  this.sessionIds_ = [];

  /** @public {number} */
  this.timeoutMs = 30000;

};
goog.inherits(shaka.player.OfflineVideoSource, shaka.player.StreamVideoSource);


/**
 * Stores the content described by the MPD for offline playback.
 * @param {string} mpdUrl The MPD URL.
 * @param {string} preferredLanguage The user's preferred language tag.
 * @param {?shaka.player.DashVideoSource.ContentProtectionCallback}
 *     interpretContentProtection A callback to interpret the ContentProtection
 *     elements in the MPD.
 * @return {!Promise.<number>} The group ID of the stored content.
 */
shaka.player.OfflineVideoSource.prototype.store = function(
    mpdUrl, preferredLanguage, interpretContentProtection) {
  var emeManager;
  var mpdRequest = new shaka.dash.MpdRequest(mpdUrl);

  return mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        var mpdProcessor =
            new shaka.dash.MpdProcessor(interpretContentProtection);
        mpdProcessor.process(mpd);

        this.manifestInfo = mpdProcessor.manifestInfo;
        var baseClassLoad = shaka.player.StreamVideoSource.prototype.load;
        return baseClassLoad.call(this, preferredLanguage);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        var fakeVideoElement = /** @type {!HTMLVideoElement} */ (
            document.createElement('video'));
        fakeVideoElement.src = window.URL.createObjectURL(this.mediaSource);
        emeManager =
            new shaka.media.EmeManager(null, fakeVideoElement, this);
        this.eventManager.listen(
            emeManager, 'sessionReady', this.addSession_.bind(this));
        return emeManager.initialize();
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        // TODO(story 1890046): Support multiple periods.
        var drmScheme = emeManager.getDrmScheme();
        var duration = this.manifestInfo.periodInfos[0].duration;
        if (!duration) {
          shaka.log.warning('The duration of the stream being stored is null.');
        }
        // Choose the first stream set from each type.
        var streamSetInfos = [];
        var desiredTypes = ['audio', 'video'];
        // TODO (natalieharris) : Add text support.
        for (var i = 0; i < desiredTypes.length; ++i) {
          var type = desiredTypes[i];
          if (this.streamSetsByType.has(type)) {
            streamSetInfos.push(this.streamSetsByType.get(type)[0]);
          }
        }
        return this.insertGroup_(streamSetInfos, drmScheme, duration);
      })
  );
};


/**
 * Creates sourceBuffers and appends init data for each of the given streams.
 * This should trigger encrypted events for any encrypted streams.
 * @param {!Array.<shaka.media.StreamInfo>} streamInfos The streams to
 *    initialize.
 * @return {boolean} Success of creating sourceBuffers and appending data.
 * @private
 */
shaka.player.OfflineVideoSource.prototype.initializeStreams_ =
    function(streamInfos) {
  var sourceBuffers = [];
  for (var i = 0; i < streamInfos.length; ++i) {
    try {
      var fullMimeType = streamInfos[i].getFullMimeType();
      sourceBuffers[i] = this.mediaSource.addSourceBuffer(fullMimeType);
    } catch (exception) {
      shaka.log.debug('addSourceBuffer() failed', exception);
    }
  }

  if (streamInfos.length != sourceBuffers.length) return false;

  for (var i = 0; i < streamInfos.length; ++i) {
    sourceBuffers[i].appendBuffer(streamInfos[i].segmentInitializationData);
  }
  return true;
};


/**
 * Event handler for sessionReady events.
 * @param {Event} event A sessionReady event.
 * @private
 */
shaka.player.OfflineVideoSource.prototype.addSession_ = function(event) {
  var session = /** @type {MediaKeySession} */ (event.detail);
  this.sessionIds_.push(session.sessionId);
};


/**
 * Inserts a group of streams into the database.
 * @param {!Array.<!shaka.media.StreamSetInfo>} streamSetInfos The streams to
 *    insert.
 * @param {shaka.player.DrmSchemeInfo} drmScheme The DRM scheme.
 * @param {?number} duration The duration of the entire stream.
 * @return {!Promise.<number>} The unique id assigned to the group.
 * @private
 */
shaka.player.OfflineVideoSource.prototype.insertGroup_ =
    function(streamSetInfos, drmScheme, duration) {
  var streamIds = [];
  var selectedStreams = streamSetInfos.map(this.selectStreamInfo_);
  var contentDatabase = new shaka.util.ContentDatabase(null);
  var p = contentDatabase.setUpDatabase();

  // Insert each stream into the database.
  for (var i = 0; i < selectedStreams.length; ++i) {
    var streamInfo = selectedStreams[i];

    var insertStream = (
        function(streamInfo) {
          return contentDatabase.insertStream(streamInfo, duration, drmScheme);
        }).bind(this, streamInfo);

    p = p.then(insertStream).then(
        /** @param {number} streamId */
        function(streamId) {
          streamIds.push(streamId);
          return Promise.resolve();
        });
  }
  // Insert information about the group of streams into the database and close
  // the connection.
  p = p.then(shaka.util.TypedBind(this, function() {
        if (this.initializeStreams_(selectedStreams)) {
          var sessionPromise = new shaka.util.PublicPromise();
          var numEncryptedStreams = this.countEncryptedStreams_(streamSetInfos);
          var startWaiting = Date.now();

          var waitForSessions = (function() {
            if (this.sessionIds_.length == numEncryptedStreams) {
              contentDatabase.insertGroup(streamIds, this.sessionIds_).then(
                  function(id) { sessionPromise.resolve(id) });
            } else {
              var timeElapsed = Date.now() - startWaiting;
              if (timeElapsed < this.timeoutMs) {
                setTimeout(waitForSessions, 500);
              } else {
                var error = new Error('Timeout while initializing streams.');
                error.type = 'storage';
                return sessionPromise.reject(error);
              }
            }
          }).bind(this);

          waitForSessions();
          return sessionPromise;
        } else {
          var error = new Error('Error initializing streams.');
          error.type = 'storage';
          return Promise.reject(error);
        }
      })).then(
          /** @param {number} groupId */
          function(groupId) {
            contentDatabase.closeDatabaseConnection();
            return Promise.resolve(groupId);
          }
      ).catch(
          /** @param {Error} e */
          function(e) {
            contentDatabase.closeDatabaseConnection();
            return Promise.reject(e);
          });
  return p;
};


/**
 * Counts the number of streamSets with only encrypted streams.
 * @param {!Array.<shaka.media.StreamSetInfo>} streamSetInfos
 * @return {number}
 * @private
 */
shaka.player.OfflineVideoSource.prototype.countEncryptedStreams_ =
    function(streamSetInfos) {
  var numEncryptedStreams = streamSetInfos.length;
  for (var i = 0; i < streamSetInfos.length; ++i) {
    for (var j = 0; j < streamSetInfos[i].drmSchemes.length; ++j) {
      if (streamSetInfos[i].drmSchemes[j].keySystem == '') {
        numEncryptedStreams--;
        break;
      }
    }
  }
  return numEncryptedStreams;
};


/**
 * Selects which stream from a stream info set should be stored offline.
 * @param {!shaka.media.StreamSetInfo} streamSetInfo The stream set to select a
 *    stream from.
 * @return {!shaka.media.StreamInfo}
 * @private
 */
shaka.player.OfflineVideoSource.prototype.selectStreamInfo_ =
    function(streamSetInfo) {
  shaka.asserts.assert(streamSetInfo.streamInfos.length > 0);
  var selected = streamSetInfo.streamInfos[0];

  if (streamSetInfo.contentType == 'video') {
    streamSetInfo.streamInfos.sort(
        function(a, b) { return a.height - b.height });
    selected = streamSetInfo.streamInfos[0];
    for (var i = 1; i < streamSetInfo.streamInfos.length; ++i) {
      // Select stream with height closest to, but not exceeding 480.
      if (streamSetInfo.streamInfos[i].height > 480) {
        break;
      } else {
        selected = streamSetInfo.streamInfos[i];
      }
    }
  } else if (streamSetInfo.contentType == 'audio') {
    // Choose the middle stream from the available ones.  If we have high,
    // medium, and low quality audio, this is medium.  If we only have high
    // and low, this is high.
    var index = Math.floor(streamSetInfo.streamInfos.length / 2);
    selected = streamSetInfo.streamInfos[index];
  }
  return selected;
};


/** @override */
shaka.player.OfflineVideoSource.prototype.destroy = function() {
  // TODO (natalieharris)
};


/** @override */
shaka.player.OfflineVideoSource.prototype.load = function(preferredLanguage) {
  // TODO (natalieharris)
};


/** @override */
shaka.player.OfflineVideoSource.prototype.getSessionIds = function() {
  return this.sessionIds_;
};


/** @override */
shaka.player.OfflineVideoSource.prototype.isOffline = function() {
  return true;
};
