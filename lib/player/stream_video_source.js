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
goog.require('shaka.media.AbrManager');
goog.require('shaka.media.IStream');
goog.require('shaka.media.ManifestInfo');
goog.require('shaka.media.PeriodInfo');
goog.require('shaka.media.Stream');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.media.StreamInfoProcessor');
goog.require('shaka.media.StreamSetInfo');
goog.require('shaka.media.TextStream');
goog.require('shaka.player.AudioTrack');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.player.IVideoSource');
goog.require('shaka.player.VideoTrack');
goog.require('shaka.util.EWMABandwidthEstimator');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.PublicPromise');



/**
 * Creates a StreamVideoSource.
 * @param {!shaka.media.ManifestInfo} manifestInfo
 *
 * @listens shaka.media.Stream.EndedEvent
 * @listens shaka.util.IBandwidthEstimator.BandwidthEvent
 *
 * @struct
 * @constructor
 * @implements {shaka.player.IVideoSource}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.player.StreamVideoSource = function(manifestInfo) {
  shaka.util.FakeEventTarget.call(this, null);

  /** @private {!shaka.media.ManifestInfo} */
  this.manifestInfo_ = manifestInfo;

  /** @private {number} */
  this.resumeThreshold_ = 0;

  /** @private {!shaka.media.StreamInfoProcessor} */
  this.processor_ = new shaka.media.StreamInfoProcessor();

  /** @private {!MediaSource} */
  this.mediaSource_ = new MediaSource();

  /** @private {HTMLVideoElement} */
  this.video_ = null;

  /**
   * The active streams.
   * @private {!Object.<string, !shaka.media.IStream>}
   */
  this.streamsByType_ = {};

  /**
   * All usable stream sets.  Mutually compatible within each type.
   * @private {!Object.<string, !Array.<!shaka.media.StreamSetInfo>>}
   */
  this.streamSetsByType_ = {};
  // TODO(story 1890046): Support multiple periods.

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {!shaka.util.PublicPromise} */
  this.attachPromise_ = new shaka.util.PublicPromise();

  /** @private {string} */
  this.lang_ = '';

  /** @private {boolean} */
  this.subsNeeded_ = false;

  /** @private {!shaka.util.IBandwidthEstimator} */
  this.estimator_ = new shaka.util.EWMABandwidthEstimator();
  // TODO(story 1925894): Seed the estimator with data from the previous
  // playback in the same browser session, unless that data is more than 1
  // hour old.

  /** @private {shaka.player.Stats} */
  this.stats_ = null;

  /** @private {!shaka.media.AbrManager} */
  this.abrManager_ = new shaka.media.AbrManager(this.estimator_, this);
};
goog.inherits(shaka.player.StreamVideoSource, shaka.util.FakeEventTarget);


/**
 * Destroys the StreamVideoSource.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.player.StreamVideoSource.prototype.destroy = function() {
  this.eventManager_.destroy();
  this.eventManager_ = null;

  this.abrManager_.destroy();
  this.abrManager_ = null;

  this.destroyStreams_();
  this.streamsByType_ = null;

  this.processor_ = null;
  this.mediaSource_ = null;
  this.video_ = null;
  this.attachPromise_ = null;
  this.estimator_ = null;

  this.parent = null;
};


/** @override */
shaka.player.StreamVideoSource.prototype.attach = function(player, video) {
  // Check if load() has been resolved.
  if (this.manifestInfo_.periodInfos.length == 0) {
    var error = new Error('Manifest has not been loaded.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.parent = player;
  this.video_ = video;
  this.stats_ = player.getStats();

  // The "sourceopen" event fires after setting the video element's "src"
  // attribute.
  this.eventManager_.listen(
      this.mediaSource_,
      'sourceopen',
      this.onMediaSourceOpen_.bind(this));

  this.eventManager_.listen(
      this.video_,
      'seeking',
      this.onSeeking_.bind(this));

  this.eventManager_.listen(
      this.estimator_,
      'bandwidth',
      this.onBandwidth_.bind(this));

  // When re-using a video tag in Chrome, mediaKeys can get cleared by Chrome
  // when src is set for the second (or subsequent) time.  This feels like a
  // bug in Chrome.
  // See also: http://crbug.com/459702

  // To work around this, back up the old value and ensure that it is set again
  // before the attach promise is resolved.  This fixes bug #18614098.
  var backupMediaKeys = this.video_.mediaKeys;
  this.video_.src = window.URL.createObjectURL(this.mediaSource_);
  var restorePromise = this.video_.setMediaKeys(backupMediaKeys);

  // Return a promise which encompasses both attach and the restoration of
  // mediaKeys.
  return Promise.all([this.attachPromise_, restorePromise]);
};


/** @override */
shaka.player.StreamVideoSource.prototype.load = function(preferredLanguage) {
  this.lang_ = preferredLanguage;

  if (this.manifestInfo_.periodInfos.length == 0) {
    var error = new Error('The manifest contains no stream information.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.resumeThreshold_ = this.manifestInfo_.minBufferTime;
  this.processor_.process(this.manifestInfo_.periodInfos);

  // TODO(story 1890046): Support multiple periods.
  if (this.manifestInfo_.periodInfos.length == 0 ||
      this.manifestInfo_.periodInfos[0].streamSetInfos.length == 0) {
    var error = new Error('The manifest specifies content that cannot ' +
                          'be displayed on this browser/platform.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  return Promise.resolve();
};


/** @override */
shaka.player.StreamVideoSource.prototype.getVideoTracks = function() {
  if (!this.streamSetsByType_['video']) {
    return [];
  }

  var stream = this.streamsByType_['video'];
  var activeStreamInfo = stream ? stream.getStreamInfo() : null;
  var activeId = activeStreamInfo ? activeStreamInfo.uniqueId : 0;

  /** @type {!Array.<!shaka.player.VideoTrack>} */
  var tracks = [];

  for (var i = 0; i < this.streamSetsByType_['video'].length; ++i) {
    var streamSetInfo = this.streamSetsByType_['video'][i];
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
  if (!this.streamSetsByType_['audio']) {
    return [];
  }

  var stream = this.streamsByType_['audio'];
  var activeStreamInfo = stream ? stream.getStreamInfo() : null;
  var activeId = activeStreamInfo ? activeStreamInfo.uniqueId : 0;

  /** @type {!Array.<!shaka.player.AudioTrack>} */
  var tracks = [];

  for (var i = 0; i < this.streamSetsByType_['audio'].length; ++i) {
    var streamSetInfo = this.streamSetsByType_['audio'][i];
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
  if (!this.streamSetsByType_['text']) {
    return [];
  }

  var stream = this.streamsByType_['text'];
  var activeStreamInfo = stream ? stream.getStreamInfo() : null;
  var activeId = activeStreamInfo ? activeStreamInfo.uniqueId : 0;

  /** @type {!Array.<!shaka.player.TextTrack>} */
  var tracks = [];

  for (var i = 0; i < this.streamSetsByType_['text'].length; ++i) {
    var streamSetInfo = this.streamSetsByType_['text'][i];
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
  return this.resumeThreshold_;
};


/** @override */
shaka.player.StreamVideoSource.prototype.getConfigurations =
    function() {
  if (this.manifestInfo_.periodInfos.length == 0) {
    return [];
  }

  // TODO(story 1890046): Support multiple periods.
  return this.manifestInfo_.periodInfos[0].getConfigs();
};


/** @override */
shaka.player.StreamVideoSource.prototype.selectConfigurations =
    function(configs) {
  // Map the stream sets by ID.
  var streamSetsById = {};
  // TODO(story 1890046): Support multiple periods.
  var period = this.manifestInfo_.periodInfos[0];
  for (var i = 0; i < period.streamSetInfos.length; ++i) {
    var streamSet = period.streamSetInfos[i];
    streamSetsById[streamSet.uniqueId] = streamSet;
  }

  // Use the IDs to convert the map of configs into a map of stream sets.
  this.streamSetsByType_ = {};
  var types = configs.keys();
  for (var i = 0; i < types.length; ++i) {
    var type = types[i];
    var cfgList = configs.get(type);

    this.streamSetsByType_[type] = [];
    if (type == 'video') {
      // We only choose one video stream set.
      var id = cfgList[0].id;
      this.streamSetsByType_[type].push(streamSetsById[id]);
    } else if (type == 'audio') {
      // We choose mutually compatible stream sets for audio.
      var basicMimeType = cfgList[0].getBasicMimeType();
      for (var j = 0; j < cfgList.length; ++j) {
        var cfg = cfgList[j];
        if (cfg.getBasicMimeType() != basicMimeType) continue;
        this.streamSetsByType_[type].push(streamSetsById[cfg.id]);
      }
    } else {
      // We choose all stream sets otherwise.
      for (var j = 0; j < cfgList.length; ++j) {
        var id = cfgList[j].id;
        this.streamSetsByType_[type].push(streamSetsById[id]);
      }
    }
  }

  // Assume subs will be needed.
  this.subsNeeded_ = true;

  var audioSets = this.streamSetsByType_['audio'];
  if (audioSets) {
    this.sortByLanguage_(audioSets);

    // If the manifest did not specify a language, assume it is the right one.
    // This means that content creators who omit language because they serve a
    // monolingual demographic will not have annoyed users who have to disable
    // subtitles every single time they play a video.
    var lang = audioSets[0].lang || this.lang_;

    // If the audio language matches the user's language preference, then subs
    // are not needed.
    var LanguageUtils = shaka.util.LanguageUtils;
    if (LanguageUtils.match(LanguageUtils.MatchType.MAX, this.lang_, lang)) {
      this.subsNeeded_ = false;
    }
  }

  var textSets = this.streamSetsByType_['text'];
  if (textSets) {
    this.sortByLanguage_(textSets);
  }
};


/** @override */
shaka.player.StreamVideoSource.prototype.selectVideoTrack =
    function(id, immediate) {
  return this.selectTrack_('video', id, immediate);
};


/** @override */
shaka.player.StreamVideoSource.prototype.selectAudioTrack =
    function(id, immediate) {
  return this.selectTrack_('audio', id, immediate);
};


/** @override */
shaka.player.StreamVideoSource.prototype.selectTextTrack =
    function(id, immediate) {
  return this.selectTrack_('text', id, immediate);
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
  for (var i = 0; i < this.manifestInfo_.periodInfos.length; ++i) {
    var periodInfo = this.manifestInfo_.periodInfos[i];

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
      }  // for k
    }  // for j
  }  // for i
};


/**
 * Select a track by ID.
 *
 * @param {string} type The type of track to change, such as 'video', 'audio',
 *     or 'text'.
 * @param {number} id The |uniqueId| field of the desired StreamInfo.
 * @param {boolean} immediate If true, switch immediately.
 *
 * @return {boolean} True if the specified track was found.
 * @private
 */
shaka.player.StreamVideoSource.prototype.selectTrack_ =
    function(type, id, immediate) {
  if (!this.streamSetsByType_[type]) {
    return false;
  }
  shaka.asserts.assert(this.streamsByType_[type]);

  for (var i = 0; i < this.streamSetsByType_[type].length; ++i) {
    var streamSetInfo = this.streamSetsByType_[type][i];
    for (var j = 0; j < streamSetInfo.streamInfos.length; ++j) {
      var streamInfo = streamSetInfo.streamInfos[j];
      if (streamInfo.uniqueId == id) {
        shaka.asserts.assert(this.stats_);
        this.stats_.logStreamChange(streamInfo);
        this.streamsByType_[type].switch(streamInfo, immediate);
        return true;
      }
    }
  }

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
shaka.player.StreamVideoSource.prototype.onMediaSourceOpen_ =
    function(event) {
  shaka.asserts.assert(this.manifestInfo_.periodInfos.length > 0);
  shaka.asserts.assert(this.mediaSource_.sourceBuffers.length == 0);
  shaka.asserts.assert(this.video_);
  shaka.asserts.assert(this.stats_);

  this.eventManager_.unlisten(this.mediaSource_, 'sourceopen');

  // TODO(story 1890046): Support multiple periods.
  this.mediaSource_.duration = this.manifestInfo_.periodInfos[0].duration;

  // Choose the first stream set from each type.
  var selectedStreamSetInfos = [];
  var desiredTypes = ['audio', 'video', 'text'];
  for (var i = 0; i < desiredTypes.length; ++i) {
    var type = desiredTypes[i];
    if (this.streamSetsByType_[type]) {
      selectedStreamSetInfos.push(this.streamSetsByType_[type][0]);
    }
  }

  /** @type {!Object.<string, !shaka.media.StreamInfo>} */
  var selectedStreamInfosByType = {};

  // Keep track of the latest start time so we can start each stream from
  // this point.
  var latestStartTime = 0;

  // Start a promise chain which will resolve once all streams have been
  // created and started.
  var p = Promise.resolve();

  // Create streams.
  for (var i = 0; i < selectedStreamSetInfos.length; ++i) {
    var streamSetInfo = selectedStreamSetInfos[i];

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

    /**
     * @return {!Promise}
     * @this {shaka.player.StreamVideoSource}
     */
    var getSegmentIndex = (function(streamInfo) {
      return streamInfo.getSegmentIndex();
    }).bind(this, streamInfo);

    /**
     * @return {!Promise}
     * @this {shaka.player.StreamVideoSource}
     */
    var addStream = (function(contentType, streamInfo) {
      var stream = contentType == 'text' ?
                   this.createTextStream_() :
                   this.createStream_(streamInfo);

      if (!stream) {
        var fullMimeType = streamInfo.getFullMimeType();
        var error = new Error('Cannot create stream for ' + fullMimeType + '.');
        error.type = 'stream';
        return Promise.reject(error);
      }

      this.streamsByType_[contentType] = stream;
      selectedStreamInfosByType[contentType] = streamInfo;

      // Log the initial stream choice.
      this.stats_.logStreamChange(streamInfo);

      // Update |latestStartTime|.
      if (contentType != 'text') {
        shaka.asserts.assert(streamInfo.segmentIndex);
        var segmentReference = streamInfo.segmentIndex.getReference(0);
        if (segmentReference) {
          latestStartTime =
              Math.max(latestStartTime, segmentReference.startTime);
        }
      }

      return Promise.resolve();
    }).bind(this, streamSetInfo.contentType, streamInfo);

    // Get the stream's SegmentIndex right now so that we can compute
    // |latestStartTime|.
    if (streamSetInfo.contentType != 'text') {
      p = p.then(getSegmentIndex);
    }

    // Cast as workaround for closure compiler issue.
    p = /** @type {!Promise} */ (p.then(addStream));
  }

  p.then(shaka.util.TypedBind(this,
      function() {
        this.startStreams_(selectedStreamInfosByType, latestStartTime);
        this.attachPromise_.resolve();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        this.destroyStreams_();
        this.attachPromise_.reject(error);
      })
  );
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
  var buf;
  try {
    var fullMimeType = streamInfo.getFullMimeType();
    buf = this.mediaSource_.addSourceBuffer(fullMimeType);
  } catch (exception) {
    shaka.log.debug('addSourceBuffer() failed', exception);
    return null;
  }
  shaka.asserts.assert(buf);

  // Adjust the source buffer's timestamps.
  shaka.asserts.assert(this.manifestInfo_.periodInfos.length > 0);
  // TODO(story 1890046): Support multiple periods.
  var periodInfo = this.manifestInfo_.periodInfos[0];
  buf.timestampOffset = periodInfo.start - streamInfo.timestampOffset;
  shaka.log.v1('timestampOffset', buf.timestampOffset);

  // Create stream.
  shaka.asserts.assert(this.video_);
  return new shaka.media.Stream(
      this,
      /** @type {!HTMLVideoElement} */ (this.video_),
      this.mediaSource_,
      /** @type {!SourceBuffer} */ (buf),
      this.estimator_);
};


/**
 * Creates a TextStream object.
 *
 * @return {!shaka.media.TextStream}
 * @private
 */
shaka.player.StreamVideoSource.prototype.createTextStream_ = function() {
  shaka.asserts.assert(this.video_);
  var video = /** @type {!HTMLVideoElement} */ (this.video_);
  return new shaka.media.TextStream(this, video);
};


/**
 * Starts the streams.
 *
 * @param {!Object.<string, !shaka.media.StreamInfo>} selectedStreamInfosByType
 * @param {number} latestStartTime
 * @private
 */
shaka.player.StreamVideoSource.prototype.startStreams_ = function(
    selectedStreamInfosByType, latestStartTime) {
  shaka.asserts.assert(this.video_);

  this.video_.currentTime = latestStartTime;

  // Start streams.
  for (var contentType in this.streamsByType_) {
    var stream = this.streamsByType_[contentType];
    shaka.asserts.assert(stream);
    this.eventManager_.listen(stream, 'ended', this.onStreamEnded_.bind(this));
    stream.start(selectedStreamInfosByType[contentType]);
  }

  // Enable the subtitle display by default iff the subs are needed.
  this.enableTextTrack(this.subsNeeded_);
};


/**
 * Destroy all streams.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.destroyStreams_ = function() {
  for (var type in this.streamsByType_) {
    this.streamsByType_[type].destroy();
  }
  this.streamsByType_ = {};
};


/**
 * Stream EOF callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.StreamVideoSource.prototype.onStreamEnded_ = function(event) {
  shaka.log.v1('onStreamEnded_', event);

  // Check the state, otherwise this throws an exception.
  if (this.mediaSource_.readyState == 'open') {
    for (var type in this.streamsByType_) {
      if (!this.streamsByType_[type].hasEnded()) {
        // Not all streams have ended, so ignore.
        return;
      }
    }

    // All streams have ended, so signal EOF to the |mediaSource_|.
    this.mediaSource_.endOfStream();
  }
};


/**
 * Video seeking callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.StreamVideoSource.prototype.onSeeking_ = function(event) {
  // Resync each stream to the new timestamp.
  for (var type in this.streamsByType_) {
    this.streamsByType_[type].resync();
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
  this.stats_.logBandwidth(this.estimator_.getBandwidth());
};

