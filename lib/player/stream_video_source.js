/**
 * Copyright 2014 Google Inc.
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
 * @fileoverview Implements a stream oriented video source.
 */

goog.provide('shaka.player.StreamVideoSource');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.IAbrManager');
goog.require('shaka.media.IStream');
goog.require('shaka.media.ManifestInfo');
goog.require('shaka.media.ManifestUpdater');
goog.require('shaka.media.PeriodInfo');
goog.require('shaka.media.SimpleAbrManager');
goog.require('shaka.media.Stream');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.media.StreamInfoProcessor');
goog.require('shaka.media.StreamSetInfo');
goog.require('shaka.media.TextStream');
goog.require('shaka.player.AudioTrack');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.player.IVideoSource');
goog.require('shaka.player.VideoTrack');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.PublicPromise');


/**
 * @event shaka.player.StreamVideoSource.SeekRangeChangedEvent
 * @description Fired when the seekable range changes.
 * @property {string} type 'seekrangechanged'
 * @property {boolean} bubbles true
 * @property {number} start The earliest time that can be seeked to, in seconds.
 * @property {number} end The latest time that can be seeked to, in seconds.
 * @export
 */



/**
 * Creates a StreamVideoSource.
 * The new StreamVideoSource takes ownership of |manifestInfo|.
 *
 * @param {shaka.media.ManifestInfo} manifestInfo
 * @param {!shaka.util.IBandwidthEstimator} estimator
 * @param {!shaka.media.IAbrManager} abrManager
 *
 * @fires shaka.player.StreamVideoSource.SeekRangeChangedEvent
 * @listens shaka.media.Stream.EndedEvent
 * @listens shaka.media.Stream.StartedEvent
 * @listens shaka.util.IBandwidthEstimator.BandwidthEvent
 *
 * @constructor
 * @struct
 * @implements {shaka.player.IVideoSource}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.player.StreamVideoSource = function(manifestInfo, estimator, abrManager) {
  shaka.util.FakeEventTarget.call(this, null);

  /** @protected {shaka.media.ManifestInfo} */
  this.manifestInfo = manifestInfo;

  /** @protected {!shaka.util.IBandwidthEstimator} */
  this.estimator = estimator;

  /** @protected {!shaka.util.EventManager} */
  this.eventManager = new shaka.util.EventManager();

  /** @protected {!MediaSource} */
  this.mediaSource = new MediaSource();

  /** @protected {HTMLVideoElement} */
  this.video = null;

  /**
   * All usable StreamSetInfos from the manifest. Each StreamInfo contained
   * within is mutually compatible with all other StreamInfos of the same type.
   * Populated in selectConfigurations().
   * @protected {!shaka.util.MultiMap.<!shaka.media.StreamSetInfo>}
   */
  this.streamSetsByType = new shaka.util.MultiMap();
  // TODO(story 1890046): Support multiple periods.

  /** @private {!shaka.media.IAbrManager} */
  this.abrManager_ = abrManager;

  /** @private {boolean} */
  this.loaded_ = false;

  /** @private {string} */
  this.lang_ = '';

  /** @private {boolean} */
  this.subsNeeded_ = false;

  /** @private {shaka.player.Stats} */
  this.stats_ = null;

  /** @private {!shaka.util.PublicPromise} */
  this.attachPromise_ = new shaka.util.PublicPromise();

  /** @private {shaka.player.DrmSchemeInfo.Restrictions} */
  this.cachedRestrictions_ = null;

  /** @private {number} */
  this.originalPlaybackRate_ = 1;

  /** @private {!Object.<string, !shaka.media.IStream>} */
  this.streamsByType_ = {};

  /** @private {number} */
  this.minTimestampCorrection_ = Number.POSITIVE_INFINITY;

  /** @private {number} */
  this.maxTimestampCorrection_ = Number.NEGATIVE_INFINITY;

  /** @private {number} */
  this.liveEdgeOffset_ = 0;

  /** @private {boolean} */
  this.canSwitch_ = false;

  /**
   * @private {!Object.<string, {streamInfo: !shaka.media.StreamInfo,
   *                             clearBuffer: boolean}>}
   */
  this.deferredSwitches_ = {};

  /** @private {?number} */
  this.updateTimer_ = null;

  /** @private {?number} */
  this.seekRangeTimer_ = null;
};
goog.inherits(shaka.player.StreamVideoSource, shaka.util.FakeEventTarget);


/**
 * @const {number}
 * @private
 */
shaka.player.StreamVideoSource.MIN_UPDATE_PERIOD_ = 3;


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.player.StreamVideoSource.prototype.destroy = function() {
  this.cancelSeekRangeTimer_();
  this.cancelUpdateTimer_();

  this.deferredSwitches_ = null;

  this.eventManager.destroy();
  this.eventManager = null;

  shaka.util.MapUtils.values(this.streamsByType_).forEach(
      function(stream) {
        stream.destroy();
      });
  this.streamsByType_ = null;

  this.streamSetsByType = null;

  if (this.manifestInfo) {
    this.manifestInfo.destroy();
    this.manifestInfo = null;
  }

  this.abrManager_.destroy();
  this.abrManager_ = null;
  this.estimator = null;

  this.mediaSource = null;
  this.video = null;
  this.stats_ = null;
  this.attachPromise_ = null;
  this.cachedRestrictions_ = null;

  this.parent = null;
};


/** @override */
shaka.player.StreamVideoSource.prototype.attach = function(player, video) {
  if (!this.loaded_) {
    var error = new Error('Cannot call attach() right now.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.parent = player;
  this.video = video;
  this.stats_ = player.getStats();

  // The "sourceopen" event fires after setting the video element's "src"
  // attribute.
  this.eventManager.listen(
      this.mediaSource,
      'sourceopen',
      this.onMediaSourceOpen_.bind(this));

  this.eventManager.listen(
      this.estimator,
      'bandwidth',
      this.onBandwidth_.bind(this));

  // When re-using a video tag in Chrome, mediaKeys can get cleared by Chrome
  // when src is set for the second (or subsequent) time.  This feels like a
  // bug in Chrome.
  // See also: http://crbug.com/459702

  // To work around this, back up the old value and ensure that it is set again
  // before the attach promise is resolved.  This fixes bug #18614098.
  var backupMediaKeys = this.video.mediaKeys;
  this.video.src = window.URL.createObjectURL(this.mediaSource);
  var restorePromise = this.video.setMediaKeys(backupMediaKeys);

  // Return a promise which encompasses both attach and the restoration of
  // mediaKeys.
  return Promise.all([this.attachPromise_, restorePromise]);
};


/** @override */
shaka.player.StreamVideoSource.prototype.load = function(preferredLanguage) {
  if (this.loaded_) {
    var error = new Error('Cannot call load() right now.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  if (!this.manifestInfo || this.manifestInfo.periodInfos.length == 0) {
    var error = new Error('The manifest does not specify any content.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.lang_ = preferredLanguage;
  var periodInfos = this.manifestInfo.periodInfos;
  (new shaka.media.StreamInfoProcessor()).process(periodInfos);

  // TODO(story 1890046): Support multiple periods.
  if (this.manifestInfo.periodInfos.length == 0 ||
      this.manifestInfo.periodInfos[0].streamSetInfos.length == 0) {
    var error = new Error('The manifest specifies content that cannot ' +
                          'be displayed on this browser/platform.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.loaded_ = true;
  return Promise.resolve();
};


/**
 * Updates the manifest.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.onUpdateManifest_ = function() {
  shaka.asserts.assert(this.loaded_);
  shaka.asserts.assert(this.manifestInfo.updatePeriod != null);
  shaka.asserts.assert(this.manifestInfo.updateUrl != null);

  shaka.log.info('Updating manifest...');

  var startTime = Date.now();
  this.updateTimer_ = null;

  /** @type {shaka.media.ManifestUpdater} */
  var updater = null;

  var url = /** @type {!goog.Uri} */ (this.manifestInfo.updateUrl);
  this.onUpdateManifest(url).then(shaka.util.TypedBind(this,
      /** @param {!shaka.media.ManifestInfo} newManifestInfo */
      function(newManifestInfo) {
        updater = new shaka.media.ManifestUpdater(newManifestInfo);
        return updater.update(
            /** @type {!shaka.media.ManifestInfo} */ (this.manifestInfo));
      })
  ).then(shaka.util.TypedBind(this,
      /** @param {!Array.<!shaka.media.StreamInfo>} removedStreamInfos */
      function(removedStreamInfos) {
        shaka.log.info('Manifest updated!');

        updater.destroy();
        updater = null;

        for (var i = 0; i < removedStreamInfos.length; ++i) {
          // ManifestUpdater will have already removed the StreamInfo from the
          // manifest, but if the StreamInfo is currently being used then we
          // need to switch to another StreamInfo.
          this.removeStream_(removedStreamInfos[i]);
        }

        if (this.cachedRestrictions_) {
          this.setRestrictions(this.cachedRestrictions_);
        }

        if (shaka.util.MapUtils.empty(this.streamsByType_)) {
          // createAndStartStreams_() failed the first time it was called.
          // When createAndStartStreams_() succeeds then beginPlayback_()
          // will call onUpdateManifest_().
          this.createAndStartStreams_();
        } else {
          // Ensure the next update occurs within |manifestInfo.updatePeriod|
          // seconds by taking into account the time it took to update the
          // manifest.
          var endTime = Date.now();
          this.setUpdateTimer_((endTime - startTime) / 1000.0);
        }
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        if (updater) {
          updater.destroy();
          updater = null;
        }

        if (error.type != 'aborted') {
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);

          // Try updating again, but ensure we haven't been destroyed.
          if (this.manifestInfo) {
            this.setUpdateTimer_(0);
          }
        }
      })
  );
};


/**
 * Update manifest hook. The caller takes ownership of the returned manifest.
 *
 * @param {!goog.Uri} url
 * @return {!Promise.<!shaka.media.ManifestInfo>}
 * @protected
 */
shaka.player.StreamVideoSource.prototype.onUpdateManifest = function(url) {
  shaka.asserts.notImplemented();
  var error = 'Cannot update manifest with this VideoSource implementation.';
  error.type = 'stream';
  return Promise.reject(error);
};


/**
 * Removes the given StreamInfo. Handles removing an active stream.
 *
 * @param {!shaka.media.StreamInfo} streamInfo
 * @private
 */
shaka.player.StreamVideoSource.prototype.removeStream_ = function(streamInfo) {
  var type = streamInfo.getContentType();
  var stream = this.streamsByType_[type];

  if (stream && (stream.getStreamInfo() == streamInfo)) {
    var usableStreamSetInfos =
        this.streamSetsByType.get(streamInfo.getContentType());
    var newStreamInfos = usableStreamSetInfos
        .map(function(streamSetInfo) { return streamSetInfo.streamInfos; })
        .reduce(function(all, part) { return all.concat(part); }, [])
        .filter(function(streamInfo) { return streamInfo.enabled; });
    if (newStreamInfos.length == 0) {
      shaka.log.warning(
          'The stream', streamInfo.id,
          'was removed but an alternate stream does not exist.');
      // Put the StreamInfo back into its StreamSetInfo since we cannot
      // properly remove it.
      usableStreamSetInfos.push(streamInfo);
      return;
    }

    if (this.deferredSwitches_[type].streamInfo == streamInfo) {
      delete this.deferredSwitches_[type];
    }

    // Just ignore |canSwitch_| and switch right now.
    stream.switch(
        newStreamInfos[0],
        this.manifestInfo.minBufferTime,
        true /* clearBuffer */);

    streamInfo.destroy();
  }

  shaka.log.info('Removed stream', streamInfo.id);
  streamInfo.destroy();
};


/** @override */
shaka.player.StreamVideoSource.prototype.getVideoTracks = function() {
  if (!this.streamSetsByType.has('video')) {
    return [];
  }

  var stream = this.streamsByType_['video'];
  var activeStreamInfo = stream ? stream.getStreamInfo() : null;
  var activeId = activeStreamInfo ? activeStreamInfo.uniqueId : 0;

  /** @type {!Array.<!shaka.player.VideoTrack>} */
  var tracks = [];

  var videoSets = this.streamSetsByType.get('video');
  for (var i = 0; i < videoSets.length; ++i) {
    var streamSetInfo = videoSets[i];
    for (var j = 0; j < streamSetInfo.streamInfos.length; ++j) {
      var streamInfo = streamSetInfo.streamInfos[j];

      // If not enabled, it has been restricted and should not be used.
      if (!streamInfo.enabled) continue;

      var id = streamInfo.uniqueId;
      var bandwidth = streamInfo.bandwidth;
      var width = streamInfo.width;
      var height = streamInfo.height;

      var videoTrack =
          new shaka.player.VideoTrack(id, bandwidth, width, height);
      if (id == activeId) {
        videoTrack.active = true;
      }
      tracks.push(videoTrack);
    }
  }

  return tracks;
};


/** @override */
shaka.player.StreamVideoSource.prototype.getAudioTracks = function() {
  if (!this.streamSetsByType.has('audio')) {
    return [];
  }

  var stream = this.streamsByType_['audio'];
  var activeStreamInfo = stream ? stream.getStreamInfo() : null;
  var activeId = activeStreamInfo ? activeStreamInfo.uniqueId : 0;

  /** @type {!Array.<!shaka.player.AudioTrack>} */
  var tracks = [];

  var audioSets = this.streamSetsByType.get('audio');
  for (var i = 0; i < audioSets.length; ++i) {
    var streamSetInfo = audioSets[i];
    var lang = streamSetInfo.lang;

    for (var j = 0; j < streamSetInfo.streamInfos.length; ++j) {
      var streamInfo = streamSetInfo.streamInfos[j];
      var id = streamInfo.uniqueId;
      var bandwidth = streamInfo.bandwidth;

      var audioTrack = new shaka.player.AudioTrack(id, bandwidth, lang);
      if (id == activeId) {
        audioTrack.active = true;
      }
      tracks.push(audioTrack);
    }
  }

  return tracks;
};


/** @override */
shaka.player.StreamVideoSource.prototype.getTextTracks = function() {
  if (!this.streamSetsByType.has('text')) {
    return [];
  }

  var stream = this.streamsByType_['text'];
  var activeStreamInfo = stream ? stream.getStreamInfo() : null;
  var activeId = activeStreamInfo ? activeStreamInfo.uniqueId : 0;

  /** @type {!Array.<!shaka.player.TextTrack>} */
  var tracks = [];

  var textSets = this.streamSetsByType.get('text');
  for (var i = 0; i < textSets.length; ++i) {
    var streamSetInfo = textSets[i];
    var lang = streamSetInfo.lang;

    for (var j = 0; j < streamSetInfo.streamInfos.length; ++j) {
      var streamInfo = streamSetInfo.streamInfos[j];
      var id = streamInfo.uniqueId;

      var textTrack = new shaka.player.TextTrack(id, lang);
      if (id == activeId) {
        textTrack.active = true;
        shaka.asserts.assert(stream != null);
        textTrack.enabled = stream.getEnabled();
      }
      tracks.push(textTrack);
    }
  }

  return tracks;
};


/** @override */
shaka.player.StreamVideoSource.prototype.getResumeThreshold = function() {
  return this.manifestInfo && this.manifestInfo.minBufferTime || 0;
};


/** @override */
shaka.player.StreamVideoSource.prototype.getConfigurations =
    function() {
  // TODO(story 1890046): Support multiple periods.
  return this.loaded_ ? this.manifestInfo.periodInfos[0].getConfigs() : [];
};


/** @override */
shaka.player.StreamVideoSource.prototype.selectConfigurations =
    function(configs) {
  if (!this.loaded_) {
    shaka.log.warning('Cannot call selectConfigurations() right now.');
    return;
  }

  // Map the stream sets by ID.
  var streamSetsById = {};
  // TODO(story 1890046): Support multiple periods.
  var period = this.manifestInfo.periodInfos[0];
  for (var i = 0; i < period.streamSetInfos.length; ++i) {
    var streamSet = period.streamSetInfos[i];
    streamSetsById[streamSet.uniqueId] = streamSet;
  }

  // Use the IDs to convert the map of configs into a map of stream sets.
  this.streamSetsByType.clear();
  var types = configs.keys();
  for (var i = 0; i < types.length; ++i) {
    var type = types[i];
    var cfgList = configs.get(type);

    if (type == 'video') {
      // We only choose one video stream set.
      var id = cfgList[0].id;
      this.streamSetsByType.push(type, streamSetsById[id]);
    } else if (type == 'audio') {
      // We choose mutually compatible stream sets for audio.
      var basicMimeType = cfgList[0].getBasicMimeType();
      for (var j = 0; j < cfgList.length; ++j) {
        var cfg = cfgList[j];
        if (cfg.getBasicMimeType() != basicMimeType) continue;
        this.streamSetsByType.push(type, streamSetsById[cfg.id]);
      }
    } else {
      // We choose all stream sets otherwise.
      for (var j = 0; j < cfgList.length; ++j) {
        var id = cfgList[j].id;
        this.streamSetsByType.push(type, streamSetsById[id]);
      }
    }
  }

  // Assume subs will be needed.
  this.subsNeeded_ = true;
  var LanguageUtils = shaka.util.LanguageUtils;

  var audioSets = this.streamSetsByType.get('audio');
  if (audioSets) {
    this.sortByLanguage_(audioSets);
    this.streamSetsByType.set('audio', audioSets);

    // If the manifest did not specify a language, assume it is the right one.
    // This means that content creators who omit language because they serve a
    // monolingual demographic will not have annoyed users who have to disable
    // subtitles every single time they play a video.
    var lang = audioSets[0].lang || this.lang_;

    // If the audio language matches the user's language preference, then subs
    // are not needed.
    if (LanguageUtils.match(LanguageUtils.MatchType.MAX, this.lang_, lang)) {
      this.subsNeeded_ = false;
    }
  }

  var textSets = this.streamSetsByType.get('text');
  if (textSets) {
    this.sortByLanguage_(textSets);
    this.streamSetsByType.set('text', textSets);

    var lang = textSets[0].lang || this.lang_;

    // If there is no text track to match the user's language preference,
    // do not turn subs on by default.
    if (!LanguageUtils.match(LanguageUtils.MatchType.MAX, this.lang_, lang)) {
      this.subsNeeded_ = false;
    }
  }
};


/** @override */
shaka.player.StreamVideoSource.prototype.selectVideoTrack =
    function(id, clearBuffer) {
  return this.selectTrack_('video', id, clearBuffer);
};


/** @override */
shaka.player.StreamVideoSource.prototype.selectAudioTrack =
    function(id, clearBuffer) {
  return this.selectTrack_('audio', id, clearBuffer);
};


/** @override */
shaka.player.StreamVideoSource.prototype.selectTextTrack =
    function(id, clearBuffer) {
  return this.selectTrack_('text', id, clearBuffer);
};


/** @override */
shaka.player.StreamVideoSource.prototype.enableTextTrack = function(enabled) {
  var textStream = this.streamsByType_['text'];
  if (textStream) {
    textStream.setEnabled(enabled);
  }
};


/** @override */
shaka.player.StreamVideoSource.prototype.enableAdaptation = function(enabled) {
  this.abrManager_.enable(enabled);
};


/** @override */
shaka.player.StreamVideoSource.prototype.setRestrictions =
    function(restrictions) {
  if (!this.loaded_) {
    shaka.log.warning('Cannot call setRestrictions() right now.');
    return;
  }

  this.cachedRestrictions_ = restrictions;

  // Note that the *Info objects contained within this.manifestInfo are the same
  // objects contained within this.streamSetsByType.
  for (var i = 0; i < this.manifestInfo.periodInfos.length; ++i) {
    var periodInfo = this.manifestInfo.periodInfos[i];

    for (var j = 0; j < periodInfo.streamSetInfos.length; ++j) {
      var streamSetInfo = periodInfo.streamSetInfos[j];

      for (var k = 0; k < streamSetInfo.streamInfos.length; ++k) {
        var streamInfo = streamSetInfo.streamInfos[k];
        streamInfo.enabled = true;

        if (restrictions.maxWidth &&
            streamInfo.width > restrictions.maxWidth) {
          streamInfo.enabled = false;
        }

        if (restrictions.maxHeight &&
            streamInfo.height > restrictions.maxHeight) {
          streamInfo.enabled = false;
        }

        if (restrictions.maxBandwidth &&
            streamInfo.bandwidth > restrictions.maxBandwidth) {
          streamInfo.enabled = false;
        }

        if (restrictions.minBandwidth &&
            streamInfo.bandwidth < restrictions.minBandwidth) {
          streamInfo.enabled = false;
        }
      }  // for k
    }  // for j
  }  // for i
};


/** @override */
shaka.player.StreamVideoSource.prototype.getSessionIds = function() {
  return [];
};


/** @override */
shaka.player.StreamVideoSource.prototype.isOffline = function() {
  return false;
};


/** @override */
shaka.player.StreamVideoSource.prototype.isLive = function() {
  return this.manifestInfo ? this.manifestInfo.live : false;
};


/**
 * Select a track by ID.
 *
 * @param {string} type The type of track to change, such as 'video', 'audio',
 *     or 'text'.
 * @param {number} id The |uniqueId| field of the desired StreamInfo.
 * @param {boolean} clearBuffer
 *
 * @return {boolean} True on success.
 * @private
 */
shaka.player.StreamVideoSource.prototype.selectTrack_ =
    function(type, id, clearBuffer) {
  if (!this.streamSetsByType.has(type)) {
    shaka.log.warning(
        'Cannot select', type, 'track', id,
        'because there are no', type, 'tracks.');
    return false;
  }

  if (!this.streamsByType_[type]) {
    shaka.log.warning(
        'Cannot select', type, 'track', id,
        'because there are no', type, 'streams yet.');
    return false;
  }

  var sets = this.streamSetsByType.get(type);
  for (var i = 0; i < sets.length; ++i) {
    var streamSetInfo = sets[i];
    for (var j = 0; j < streamSetInfo.streamInfos.length; ++j) {
      var streamInfo = streamSetInfo.streamInfos[j];
      if (streamInfo.uniqueId != id) continue;

      if (type != 'text' && !this.canSwitch_) {
        // Note that stream switching is disabled until all SegmentIndexes have
        // been created. This ensures that gaps do not get introduced into the
        // buffer. For example, if all SegmentIndexes are behind by 5 seconds,
        // and we switch to a StreamInfo whose SegmentIndex has not been
        // corrected yet, the next segment will be offset by +5 seconds, which
        // will create a gap in the buffer.
        //
        // However, we still want to process these stream switches, so defer
        // them until later, see onAllStreamsStarted_().
        //
        // Note that if clearBuffer is true for any switch of a particular type
        // then any deferred switch of that type will also set clearBuffer to
        // true.
        var tuple = this.deferredSwitches_[type];

        this.deferredSwitches_[type] = {
          streamInfo: streamInfo,
          clearBuffer: (tuple != null && tuple.clearBuffer) || clearBuffer
        };
        return true;
      }

      shaka.asserts.assert(this.stats_);
      this.stats_.logStreamChange(streamInfo);

      this.streamsByType_[type].switch(
          streamInfo,
          this.manifestInfo.minBufferTime,
          clearBuffer);
      return true;
    }
  }

  shaka.log.warning(
      'Cannot select', type, 'track', id, 'because it does not exist.');
  return false;
};


/**
 * Move the best language match to the front of the array.
 *
 * @param {!Array.<!shaka.media.StreamSetInfo>} streamSets
 * @private
 */
shaka.player.StreamVideoSource.prototype.sortByLanguage_ =
    function(streamSets) {
  // Alias.
  var LanguageUtils = shaka.util.LanguageUtils;

  // Do a fuzzy match and stop on the lowest successful fuzz level.
  for (var fuzz = LanguageUtils.MatchType.MIN;
       fuzz <= LanguageUtils.MatchType.MAX;
       ++fuzz) {
    for (var i = 0; i < streamSets.length; ++i) {
      var set = streamSets[i];
      if (LanguageUtils.match(fuzz, this.lang_, set.lang)) {
        // It's a match, so this set should go to the front.
        streamSets.splice(i, 1);
        streamSets.splice(0, 0, set);
        return;
      }
    }
  }

  // If no languages matched, move the "main" set, if any, to the front.
  for (var i = 0; i < streamSets.length; ++i) {
    var set = streamSets[i];
    if (set.main) {
      streamSets.splice(i, 1);
      streamSets.splice(0, 0, set);
      return;
    }
  }
};


/**
 * MediaSource callback.
 *
 * @param {!Event} event The MediaSource event.
 * @private
 */
shaka.player.StreamVideoSource.prototype.onMediaSourceOpen_ = function(event) {
  this.eventManager.unlisten(this.mediaSource, 'sourceopen');

  this.createAndStartStreams_().then(shaka.util.TypedBind(this,
      function() {
        this.attachPromise_.resolve();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        this.attachPromise_.reject(error);
      })
  );
};


/**
 * Creates and starts the initial set of streams. If the manifest specifies
 * live content then the returned Promise will always resolve.
 *
 * @return {!Promise}
 * @private
 */
shaka.player.StreamVideoSource.prototype.createAndStartStreams_ = function() {
  /** @type {!Array.<!shaka.media.StreamSetInfo>} */
  var selectedStreamSetInfos = [];

  // For each desired type, select the first StreamSetInfo.
  var desiredTypes = ['audio', 'video', 'text'];
  for (var i = 0; i < desiredTypes.length; ++i) {
    var type = desiredTypes[i];
    if (this.streamSetsByType.has(type)) {
      selectedStreamSetInfos.push(this.streamSetsByType.get(type)[0]);
    }
  }

  this.abrManager_.start(this.estimator, this);

  /** @type {!Object.<string, !shaka.media.StreamInfo>} */
  var selectedStreamInfosByType =
      this.selectStreamInfos_(selectedStreamSetInfos);

  // Create the initial SegmentIndexes.
  var async = shaka.util.MapUtils.values(selectedStreamInfosByType).map(
      function(streamInfo) {
        return streamInfo.segmentIndexSource.create();
      });
  return Promise.all(async).then(shaka.util.TypedBind(this,
      /** @param {!Array.<!shaka.media.SegmentIndex>} segmentIndexes */
      function(segmentIndexes) {
        // Ensure all streams are available.
        if (!segmentIndexes.every(function(index) { return index.length(); })) {
          shaka.log.debug('At least one SegmentIndex is empty.');
          var error = new Error('Some streams are not available.');
          error.type = 'stream';
          return Promise.reject(error);
        }

        // Compute the stream limits.
        var streamLimits = this.computeStreamLimits_(segmentIndexes);
        if (!streamLimits) {
          // This may occur if the manifest is not well formed or if the
          // streams have just become available, such that the initial
          // timestamp discrepancies cause the timelines to be disjoint.
          var error = new Error('Some streams are not available.');
          error.type = 'stream';
          return Promise.reject(error);
        }

        // Create the Stream objects.
        if (!this.createStreams_(selectedStreamInfosByType)) {
          var error = new Error('Failed to create Stream objects.');
          error.type = 'stream';
          return Promise.reject(error);
        }

        this.startStreams_(selectedStreamInfosByType, streamLimits);
        return Promise.resolve();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        if (error.type == 'aborted') {
          return;
        }

        shaka.asserts.assert(shaka.util.MapUtils.empty(this.streamsByType_));

        // If the manifest specifies live content then suppress the error, we
        // will try to create and start the streams again from
        // onUpdateManifest_().
        if (this.manifestInfo.live) {
          shaka.log.warning(error.message);
          this.setUpdateTimer_(0);
          return Promise.resolve();
        } else {
          return Promise.reject(error);
        }
      })
  );
};


/**
 * Selects the initial StreamInfos from the given StreamSetsInfos.
 *
 * @param {!Array.<!shaka.media.StreamSetInfo>} streamSetInfos
 * @return {!Object.<string, !shaka.media.StreamInfo>}
 * @private
 */
shaka.player.StreamVideoSource.prototype.selectStreamInfos_ = function(
    streamSetInfos) {
  /** @type {!Object.<string, !shaka.media.StreamInfo>} */
  var selectedStreamInfosByType = {};

  for (var i = 0; i < streamSetInfos.length; ++i) {
    var streamSetInfo = streamSetInfos[i];

    // Start by assuming we will use the first StreamInfo.
    shaka.asserts.assert(streamSetInfo.streamInfos.length > 0);
    var streamInfo = streamSetInfo.streamInfos[0];

    if (streamSetInfo.contentType == 'video') {
      // Ask AbrManager which video StreamInfo to start with.
      var trackId = this.abrManager_.getInitialVideoTrackId();
      shaka.asserts.assert(trackId != null);
      var found = false;
      for (var j = 0; j < streamSetInfo.streamInfos.length; ++j) {
        streamInfo = streamSetInfo.streamInfos[j];
        if (streamInfo.uniqueId == trackId) {
          found = true;
          break;
        }
      }
      shaka.asserts.assert(found);
    } else if (streamSetInfo.contentType == 'audio') {
      // In lieu of audio adaptation, choose the middle stream from the
      // available ones.  If we have high, medium, and low quality audio, this
      // is medium.  If we only have high and low, this is high.
      var index = Math.floor(streamSetInfo.streamInfos.length / 2);
      streamInfo = streamSetInfo.streamInfos[index];
    }

    selectedStreamInfosByType[streamSetInfo.contentType] = streamInfo;
  }

  return selectedStreamInfosByType;
};


/**
 * Creates the initial set of Stream objects. Populates |streamsByType_| on
 * success.
 *
 * @param {!Object.<string, !shaka.media.StreamInfo>} streamInfosByType
 * @return {boolean} True on success; otherwise, return false.
 * @private
 */
shaka.player.StreamVideoSource.prototype.createStreams_ = function(
    streamInfosByType) {
  /** @type {!Object.<string, !shaka.media.IStream>} */
  var streamsByType = {};

  for (var type in streamInfosByType) {
    var streamInfo = streamInfosByType[type];

    var stream = type == 'text' ?
                 this.createTextStream_() :
                 this.createStream_(streamInfo);

    if (!stream) {
      var fullMimeType = streamInfo.getFullMimeType();
      shaka.log.error('Failed to create', fullMimeType, 'stream.');
      shaka.util.MapUtils.values(streamsByType).forEach(
          function(stream) {
            stream.destroy();
          });
      return false;
    }

    streamsByType[type] = stream;
  }

  this.streamsByType_ = streamsByType;
  return true;
};


/**
 * Creates a Stream object.
 *
 * @param {!shaka.media.StreamInfo} streamInfo
 * @return {shaka.media.Stream} A Stream object on success.
 * @private
 */
shaka.player.StreamVideoSource.prototype.createStream_ = function(
    streamInfo) {
  // Create source buffer.
  // TODO: This try block and the one after it may not be necessary, since we
  // should be in a state where no exceptions should be thrown.
  var buf;
  try {
    var fullMimeType = streamInfo.getFullMimeType();
    buf = this.mediaSource.addSourceBuffer(fullMimeType);
  } catch (exception) {
    shaka.log.debug('addSourceBuffer() failed', exception);
    return null;
  }
  shaka.asserts.assert(buf);

  // Offset each timestamp within each media segment appended.
  try {
    buf.timestampOffset = streamInfo.timestampOffset;
  } catch (exception) {
    shaka.log.debug('Failed to set timestampOffset', exception);
    return null;
  }
  shaka.log.v1('timestampOffset', buf.timestampOffset);

  // Create stream.
  shaka.asserts.assert(this.video);
  return new shaka.media.Stream(
      this,
      /** @type {!HTMLVideoElement} */ (this.video),
      this.mediaSource,
      /** @type {!SourceBuffer} */ (buf),
      this.estimator);
};


/**
 * Creates a TextStream object.
 *
 * @return {!shaka.media.TextStream}
 * @private
 */
shaka.player.StreamVideoSource.prototype.createTextStream_ = function() {
  shaka.asserts.assert(this.video);
  var video = /** @type {!HTMLVideoElement} */ (this.video);
  return new shaka.media.TextStream(this, video);
};


/**
 * Starts the streams.
 *
 * @param {!Object.<string, !shaka.media.StreamInfo>} streamInfosByType
 * @param {{start: number, end: number}} streamLimits
 * @private
 */
shaka.player.StreamVideoSource.prototype.startStreams_ = function(
    streamInfosByType, streamLimits) {
  // Don't allow the video to start immediately. We may need to apply a
  // timestamp correction after the initial set of streams have started, which
  // would cause a seek.
  this.originalPlaybackRate_ = this.video.playbackRate;
  this.video.playbackRate = 0;

  // Set the MediaSource's duration and determine the stream start time.
  var streamStartTime;
  if (this.manifestInfo.live) {
    shaka.asserts.assert(streamLimits.end != Number.POSITIVE_INFINITY);
    // We need to set the MediaSource's duration so that we can append new
    // segments and seek. However, since the streams are live there may not be
    // a known duration. We should be able to set the MediaSource's duration
    // to POSITIVE_INFINITY but on some browsers this does not work as intended.
    // So, just set the Period's duration to a "large enough" value.
    this.mediaSource.duration = streamLimits.end + (60 * 60 * 24 * 30);
    streamStartTime = streamLimits.end;
  } else {
    this.mediaSource.duration = streamLimits.end - streamLimits.start;
    streamStartTime = streamLimits.start;
  }

  // Set the video's current time before starting the streams so that the
  // streams begin buffering at the stream start time.
  shaka.log.info('Starting each stream from', streamStartTime);
  this.video.currentTime = streamStartTime;

  // Inform the application of the initial seek range.
  this.fireSeekRangeChangedEvent_(streamLimits.start, streamLimits.end);

  // Start the streams.
  for (var type in this.streamsByType_) {
    var stream = this.streamsByType_[type];

    this.eventManager.listen(
        stream,
        'started',
        this.onStreamStarted_.bind(this));

    this.eventManager.listen(
        stream,
        'ended',
        this.onStreamEnded_.bind(this));

    var streamInfo = streamInfosByType[type];
    this.stats_.logStreamChange(streamInfo);

    stream.switch(
        streamInfo,
        this.manifestInfo.minBufferTime,
        false /* clearBuffer */);
  }

  // Enable the subtitle display by default iff the subs are needed.
  this.enableTextTrack(this.subsNeeded_);
};


/**
 * Stream started callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.StreamVideoSource.prototype.onStreamStarted_ = function(event) {
  shaka.log.debug('onStreamStarted_', event);

  var startedEvent = /** @type {{timestampCorrection: number}} */ (event);
  this.minTimestampCorrection_ =
      Math.min(this.minTimestampCorrection_, startedEvent.timestampCorrection);
  this.maxTimestampCorrection_ =
      Math.max(this.maxTimestampCorrection_, startedEvent.timestampCorrection);

  for (var type in this.streamsByType_) {
    if (!this.streamsByType_[type].hasStarted()) {
      // Not all streams have started, so ignore.
      return;
    }
  }

  this.onAllStreamsStarted_();
};


/**
 * Called when all streams have started.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.onAllStreamsStarted_ = function() {
  shaka.log.debug('onAllStreamsStarted_');

  // Sanity check.
  shaka.asserts.assert(
      this.maxTimestampCorrection_ >= this.minTimestampCorrection_);
  shaka.asserts.assert(
      this.minTimestampCorrection_ != Number.POSITIVE_INFINITY);
  shaka.asserts.assert(
      this.maxTimestampCorrection_ != Number.NEGATIVE_INFINITY);

  shaka.log.info('Timestamp correction', this.maxTimestampCorrection_);

  // |minTimestampCorrection_| and |maxTimestampCorrection_| should have the
  // same sign.
  if (this.minTimestampCorrection_ * this.maxTimestampCorrection_ < 0) {
    shaka.log.warning(
        'Some streams\' media timestamps are ahead of their SegmentIndexes,',
        'while other streams\' timestamps are behind.',
        'The content may have errors in it.');
  }

  // Correct the initial set of SegmentIndexes and then begin playback.
  var segmentIndexes = this.getSegmentIndexes_();
  for (var i = 0; i < segmentIndexes.length; ++i) {
    segmentIndexes[i].correct(this.maxTimestampCorrection_);
  }
  this.beginPlayback_(segmentIndexes);

  // In parallel, create all SegmentIndexes and fetch all initialization
  // segments so that they are available to Stream immediately when switching.
  var async = this.streamSetsByType.getAll()
      .map(function(streamSetInfo) { return streamSetInfo.streamInfos; })
      .reduce(function(all, part) { return all.concat(part); }, [])
      .map(function(streamInfo) {
        var async = [streamInfo.segmentIndexSource.create()];
        if (streamInfo.segmentInitSource) {
          async.push(streamInfo.segmentInitSource.create());
        }
        return Promise.all(async);
      });
  Promise.all(async).then(shaka.util.TypedBind(this,
      /** @param {!Array.<!Array>} results */
      function(results) {
        for (var i = 0; i < results.length; ++i) {
          /** @type {!shaka.media.SegmentIndex} */
          var segmentIndex = results[i][0];
          segmentIndex.correct(this.maxTimestampCorrection_);
        }

        shaka.log.debug(
            'Created/fetched all SegmentIndexes and initialization segments!');

        // Enable stream switching and process all deferred switches.
        this.canSwitch_ = true;
        this.processDeferredSwitches_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        if (error.type != 'aborted') {
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);
        }
      })
  );
};


/**
 * Processes all deferred switches.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.processDeferredSwitches_ = function() {
  for (var type in this.deferredSwitches_) {
    var tuple = this.deferredSwitches_[type];

    var stream = this.streamsByType_[type];
    shaka.asserts.assert(stream);

    shaka.asserts.assert(this.stats_);
    this.stats_.logStreamChange(tuple.streamInfo);

    stream.switch(
        tuple.streamInfo,
        this.manifestInfo.minBufferTime,
        tuple.clearBuffer);
  }

  this.deferredSwitches_ = {};
};


/**
 * Adjusts the video's current time by the max timestamp correction and then
 * begins playback.
 *
 * @param {!Array.<!shaka.media.SegmentIndex>} segmentIndexes The initial set
 *     of SegmentIndexes.
 * @private
 */
shaka.player.StreamVideoSource.prototype.beginPlayback_ = function(
    segmentIndexes) {
  shaka.log.debug('beginPlayback_');

  // Inform the application of the corrected seek range before beginning
  // playback.
  var streamLimits = this.computeStreamLimits_(segmentIndexes);
  shaka.asserts.assert(streamLimits, 'Stream limits should not be null.');
  if (streamLimits) {
    this.fireSeekRangeChangedEvent_(streamLimits.start, streamLimits.end);
  }

  // Note that its particularly important to adjust the video's current time if
  // |maxTimestampCorrection_| is positive; otherwise, some streams may get
  // stuck, as their first segment may start after the beginning of their
  // SegmentIndex.
  shaka.log.debug(
      'Adjusting video.currentTime by',
      this.maxTimestampCorrection_,
      'seconds.');
  var currentTime = this.video.currentTime;
  var correctedCurrentTime = currentTime + this.maxTimestampCorrection_;
  if (!COMPILED && streamLimits) {
    if (correctedCurrentTime < streamLimits.start ||
        correctedCurrentTime > streamLimits.end) {
      shaka.log.error(
          'video.currentTime (' + correctedCurrentTime + ')',
          'should be within the stream limits',
          JSON.stringify(streamLimits));
    }
  }
  this.video.currentTime = correctedCurrentTime;

  if (this.manifestInfo.live) {
    // While the streams are starting the live-edge is moving. So, the video's
    // current time may be behind the live-edge by a few seconds. This may
    // cause a poor UX since the UI might say "-00:03" instead of "LIVE". So,
    // record the offset so we can use it when we compute the stream limits.
    this.liveEdgeOffset_ = streamLimits.end - correctedCurrentTime;
    shaka.asserts.assert(this.liveEdgeOffset_ >= 0);
    shaka.log.debug('Live-edge offset', this.liveEdgeOffset_);
  }

  // TODO: If the playback rate is set by the application between the set and
  // load of originalPlaybackRate_, that rate will be ignored.  Fix this race
  // between StreamVideoSource and the application.  In the mean time,
  // applications should use setPlaybackRate either before loading the source
  // or after playback begins.
  this.video.playbackRate = this.originalPlaybackRate_;

  // Start listening to 'playing' events, as we may need to seek back into the
  // seek window after pausing and playing. Ignore the first 'playing' event
  // which is caused by beginning playback.
  var tempOnPlaying = (function(event) {
    shaka.log.v1('Ignoring first \'playing\' event.');
    var video = /** @type {!EventTarget} */ (this.video);
    this.eventManager.unlisten(video, 'playing');
    this.eventManager.listen(video, 'playing', this.onPlaying_.bind(this));
  }).bind(this);
  this.eventManager.listen(this.video, 'playing', tempOnPlaying);

  // Start listening to 'seek' events. Ignore the first 'seeking' event which
  // is caused by the seek operation above.
  var tempOnSeeking = (function(event) {
    shaka.log.v1('Ignoring first \'seeking\' event.');
    var video = /** @type {!EventTarget} */ (this.video);
    this.eventManager.unlisten(video, 'seeking');
    this.eventManager.listen(video, 'seeking', this.onSeeking_.bind(this));
  }).bind(this);
  this.eventManager.listen(this.video, 'seeking', tempOnSeeking);

  if (this.manifestInfo.updatePeriod != null) {
    // Ensure the next update occurs within |manifestInfo.updatePeriod| seconds
    // by taking into account the time it took to start the streams.
    shaka.asserts.assert(this.updateTimer_ == null);
    this.setUpdateTimer_(this.liveEdgeOffset_);
  }

  this.setSeekRangeTimer_();
};


/**
 * Computes a new seek range and fires a 'seekrangechanged' event.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.onUpdateSeekRange_ = function() {
  this.seekRangeTimer_ = null;

  var streamLimits = this.computeStreamLimits_(this.getSegmentIndexes_());
  shaka.asserts.assert(streamLimits, 'Stream limits should not be null.');
  if (streamLimits) {
    this.fireSeekRangeChangedEvent_(streamLimits.start, streamLimits.end);
  }

  this.setSeekRangeTimer_();
};


/**
 * Fires a 'seekrangechanged' event.
 *
 * @param {number} start
 * @param {number} end
 * @private
 */
shaka.player.StreamVideoSource.prototype.fireSeekRangeChangedEvent_ = function(
    start, end) {
  var event = shaka.util.FakeEvent.create({
    'type': 'seekrangechanged',
    'bubbles': true,
    'start': start,
    'end': end
  });

  shaka.log.v1('Seek range', [start, end], end - start);
  this.dispatchEvent(event);
};


/**
 * Video playing callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.StreamVideoSource.prototype.onPlaying_ = function(event) {
  shaka.log.v1('onPlaying_', event);
  this.clampCurrentTime_();
};


/**
 * Video seeking callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.StreamVideoSource.prototype.onSeeking_ = function(event) {
  shaka.log.v1('onSeeking_', event);
  if (!this.clampCurrentTime_()) {
    for (var type in this.streamsByType_) {
      this.streamsByType_[type].resync();
    }
  }
};


/**
 * Clamps the video's current time to the seek range if it is outside of the
 * seek range.
 *
 * @return {boolean} True if the video's current time was clamped.
 * @private
 */
shaka.player.StreamVideoSource.prototype.clampCurrentTime_ = function() {
  var streamLimits = this.computeStreamLimits_(this.getSegmentIndexes_());
  shaka.asserts.assert(streamLimits, 'Stream limits should not be null.');
  if (!streamLimits) {
    return false;
  }

  var currentTime = this.video.currentTime;

  // Rounding tolerance.
  var tolerance = 0.01;

  if ((currentTime >= streamLimits.start - tolerance) &&
      (currentTime <= streamLimits.end + tolerance)) {
    return false;
  }

  // If we seek outside the seekable range then clamp the video's current time
  // to the seekable range; this will trigger another 'seeking' event.
  shaka.log.warning(
      'Cannot seek outside of seekable range:',
      'seekable', [streamLimits.start, streamLimits.end],
      'attempted', currentTime);

  var targetTime;
  if (currentTime < streamLimits.start) {
    // For live content, if we re-position the playhead too close to the seek
    // start time then we may end up outside of the seek range again, as the
    // seek window may be moving or we may have to buffer after we
    // re-position. So, re-position the playhead ahead of the seek start
    // time to compensate.
    var compensation = this.manifestInfo.live ?
                       this.manifestInfo.minBufferTime :
                       0;
    targetTime = Math.min(streamLimits.start + compensation, streamLimits.end);
  } else {
    shaka.asserts.assert(currentTime > streamLimits.end);
    targetTime = streamLimits.end;
  }
  this.video.currentTime = targetTime;

  return true;
};


/**
 * Stream ended callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.StreamVideoSource.prototype.onStreamEnded_ = function(event) {
  if (this.manifestInfo.live) {
    return;
  }

  for (var type in this.streamsByType_) {
    if (!this.streamsByType_[type].hasEnded()) {
      // Not all streams have ended, so ignore.
      return;
    }
  }

  // |mediaSource_| should be in the open state before calling endOfStream().
  if (this.mediaSource.readyState == 'open') {
    // All streams have ended, so signal EOF to |mediaSource_|.
    this.mediaSource.endOfStream();
  }
};


/**
 * Bandwidth statistics update callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.StreamVideoSource.prototype.onBandwidth_ = function(event) {
  shaka.asserts.assert(this.stats_);
  this.stats_.logBandwidth(this.estimator.getBandwidth());
};


/**
 * Gets the active Streams' SegmentIndexes.
 *
 * @return {!Array.<!shaka.media.SegmentIndex>}
 * @private
 */
shaka.player.StreamVideoSource.prototype.getSegmentIndexes_ = function() {
  return shaka.util.MapUtils.values(this.streamsByType_)
      .map(function(stream) { return stream.getSegmentIndex(); })
      .filter(function(index) { return index != null; });
};


/**
 * Computes the stream limits, i.e., a stream start time and a stream end time,
 * that are mutually compatible with the given SegmentIndexes. The video's
 * current time should always be within the stream limits.
 *
 * @param {!Array.<!shaka.media.SegmentIndex>} segmentIndexes
 * @return {?{start: number, end: number}} The stream limits on success;
 *     otherwise, return null if a stream end time could not be computed or
 *     the streams' timelines are disjoint.
 * @private
 */
shaka.player.StreamVideoSource.prototype.computeStreamLimits_ = function(
    segmentIndexes) {
  shaka.asserts.assert(this.manifestInfo);

  var startTime = 0;
  var endTime = Number.POSITIVE_INFINITY;

  for (var i = 0; i < segmentIndexes.length; ++i) {
    var seekRange = segmentIndexes[i].getSeekRange();
    startTime = Math.max(startTime, seekRange.start);
    if (seekRange.end != null) {
      endTime = Math.min(endTime, seekRange.end);
    }
  }

  // Fallback to the period's duration if necessary.
  if (endTime == Number.POSITIVE_INFINITY) {
    // TODO(story 1890046): Support multiple periods.
    var period = this.manifestInfo.periodInfos[0];
    if (period.duration) {
      endTime = (period.start || 0) + period.duration;
    } else {
      shaka.log.debug('Failed to compute a stream end time.');
      return null;
    }
  }

  if (this.manifestInfo.live) {
    // Ensure that we can actually buffer the minimum buffer size by offsetting
    // the stream end time.
    var offset = this.manifestInfo.minBufferTime + this.liveEdgeOffset_;
    endTime = Math.max(endTime - offset, startTime);
  }

  if (startTime > endTime) {
    shaka.log.debug('The streams\' timelines are disjoint.');
    return null;
  }

  return { start: startTime, end: endTime };
};


/**
 * Sets the update timer. Does nothing if the manifest does not specify
 * an update period.
 *
 * @param {number} offset An offset, in seconds, to apply to the manifest's
 *     update period.
 * @private
 */
shaka.player.StreamVideoSource.prototype.setUpdateTimer_ = function(offset) {
  if (this.manifestInfo.updatePeriod == null) {
    return;
  }
  shaka.asserts.assert(this.updateTimer_ == null);

  var updatePeriod =
      Math.max(this.manifestInfo.updatePeriod,
               shaka.player.StreamVideoSource.MIN_UPDATE_PERIOD_);
  var updateInterval = Math.max(updatePeriod - offset, 0);
  shaka.log.debug('updateInterval', updateInterval);

  var callback = this.onUpdateManifest_.bind(this);
  this.updateTimer_ = window.setTimeout(callback, 1000 * updateInterval);
};


/**
 * Cancels the update timer, if any.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.cancelUpdateTimer_ = function() {
  if (this.updateTimer_) {
    window.clearTimeout(this.updateTimer_);
    this.updateTimer_ = null;
  }
};


/**
 * Sets the seek range timer.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.setSeekRangeTimer_ = function() {
  if (!this.manifestInfo.live) {
    return;
  }
  shaka.asserts.assert(this.seekRangeTimer_ == null);

  var callback = this.onUpdateSeekRange_.bind(this);
  this.seekRangeTimer_ = window.setTimeout(callback, 1000);
};


/**
 * Cancels the seek range timer, if any.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.cancelSeekRangeTimer_ = function() {
  if (this.seekRangeTimer_) {
    window.clearTimeout(this.seekRangeTimer_);
    this.seekRangeTimer_ = null;
  }
};

