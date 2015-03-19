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
 *
 * @param {shaka.media.ManifestInfo} manifestInfo The ManifestInfo, which may
 *     be modified by this VideoSource.
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

  /** @protected {shaka.media.ManifestInfo} */
  this.manifestInfo = manifestInfo;

  /** @private {string} */
  this.lang_ = '';

  /** @private {shaka.player.DrmSchemeInfo.Restrictions} */
  this.cachedRestrictions_ = null;

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
   * @protected {!shaka.util.MultiMap.<!shaka.media.StreamSetInfo>}
   */
  this.streamSetsByType = new shaka.util.MultiMap();
  // TODO(story 1890046): Support multiple periods.

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {!shaka.util.PublicPromise} */
  this.attachPromise_ = new shaka.util.PublicPromise();

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

  this.cachedRestrictions_ = null;
  this.mediaSource_ = null;
  this.video_ = null;
  this.attachPromise_ = null;
  this.estimator_ = null;

  this.parent = null;
};


/** @override */
shaka.player.StreamVideoSource.prototype.attach = function(player, video) {
  if (!this.manifestInfo || this.manifestInfo.periodInfos.length == 0) {
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
  if (!this.manifestInfo || this.manifestInfo.periodInfos.length == 0) {
    var error = new Error('The manifest contains no stream information.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.lang_ = preferredLanguage;

  var streamInfoProcessor = new shaka.media.StreamInfoProcessor();
  streamInfoProcessor.process(this.manifestInfo.periodInfos);

  // TODO(story 1890046): Support multiple periods.
  if (this.manifestInfo.periodInfos.length == 0 ||
      this.manifestInfo.periodInfos[0].streamSetInfos.length == 0) {
    var error = new Error('The manifest specifies content that cannot ' +
                          'be displayed on this browser/platform.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  return Promise.resolve();
};


/**
 * Updates the manifest by merging |manifestInfo| into the existing manifest.
 * Should not be called until after load() has been resolved.
 *
 * @param {!shaka.media.ManifestInfo} manifestInfo The new ManifestInfo.
 * @protected
 */
shaka.player.StreamVideoSource.prototype.updateManifest =
    function(manifestInfo) {
  shaka.log.debug('Updating manifest...');

  if (!this.manifestInfo || this.manifestInfo.periodInfos.length == 0) {
    var error = new Error('Manifest has not been loaded.');
    error.type = 'stream';
    var event = shaka.util.FakeEvent.createErrorEvent(error);
    this.dispatchEvent(event);
    return;
  }

  this.manifestInfo.minBufferTime = manifestInfo.minBufferTime;

  var streamInfoProcessor = new shaka.media.StreamInfoProcessor();
  streamInfoProcessor.process(manifestInfo.periodInfos);

  this.mergePeriodInfos_(manifestInfo);

  if (this.cachedRestrictions_) {
    this.setRestrictions(this.cachedRestrictions_);
  }

  // Resync the streams that ended.
  for (var type in this.streamsByType_) {
    var stream = this.streamsByType_[type];
    if (stream.hasEnded()) {
      // Ideally we should avoid this situation by buffering enough media
      // content; however, this case may still occur if we are close to the
      // "live-edge" and the manifest did not specify an adequate minimum
      // buffer time.
      shaka.log.warning('Resyncing ended stream.');
      stream.resync();
    }
  }
};


/**
 * Merges PeriodInfos from |newManifestInfo| into the current ManifestInfo.
 *
 * @param {!shaka.media.ManifestInfo} newManifestInfo
 * @private
 */
shaka.player.StreamVideoSource.prototype.mergePeriodInfos_ = function(
    newManifestInfo) {
  /** @type {!shaka.util.MultiMap.<!shaka.media.PeriodInfo>} */
  var currentPeriodInfoMap = new shaka.util.MultiMap();
  this.manifestInfo.periodInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    currentPeriodInfoMap.push(id, info);
  });

  /** @type {!shaka.util.MultiMap.<!shaka.media.PeriodInfo>} */
  var newPeriodInfoMap = new shaka.util.MultiMap();
  newManifestInfo.periodInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    newPeriodInfoMap.push(id, info);
  });

  var keys = currentPeriodInfoMap.keys();
  for (var i = 0; i < keys.length; ++i) {
    var id = keys[i];

    var currentPeriodInfos = currentPeriodInfoMap.get(id);
    shaka.asserts.assert(currentPeriodInfos.length != 0);
    if (currentPeriodInfos.length > 1) {
      shaka.log.warning('Cannot update Period ' + id + ' because more ' +
                        'than one existing Period has the same ID.');
      continue;
    }

    var newPeriodInfos = newPeriodInfoMap.get(id);
    if (newPeriodInfos.length == 0) {
      continue;
    } else if (newPeriodInfos.length == 1) {
      currentPeriodInfos[0].duration = newPeriodInfos[0].duration;
      this.mergeStreamSetInfos_(currentPeriodInfos[0], newPeriodInfos[0]);
    } else {
      shaka.log.warning('Cannot update Period ' + id + ' because more ' +
                        'than one new Period has the same ID.');
    }
  }
};


/**
 * Merges StreamSetInfos from |newPeriodInfo| into |currentPeriodInfo|.
 *
 * @param {!shaka.media.PeriodInfo} currentPeriodInfo
 * @param {!shaka.media.PeriodInfo} newPeriodInfo
 * @private
 */
shaka.player.StreamVideoSource.prototype.mergeStreamSetInfos_ = function(
    currentPeriodInfo, newPeriodInfo) {
  /** @type {!shaka.util.MultiMap.<!shaka.media.StreamSetInfo>} */
  var currentStreamSetInfoMap = new shaka.util.MultiMap();
  currentPeriodInfo.streamSetInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    currentStreamSetInfoMap.push(id, info);
  });

  /** @type {!shaka.util.MultiMap.<!shaka.media.StreamSetInfo>} */
  var newStreamSetInfoMap = new shaka.util.MultiMap();
  newPeriodInfo.streamSetInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    newStreamSetInfoMap.push(id, info);
  });

  var keys = currentStreamSetInfoMap.keys();
  for (var i = 0; i < keys.length; ++i) {
    var id = keys[i];

    var currentStreamSetInfos = currentStreamSetInfoMap.get(id);
    shaka.asserts.assert(currentStreamSetInfos.length != 0);
    if (currentStreamSetInfos.length > 1) {
      shaka.log.warning('Cannot update StreamSet ' + id + ' because more ' +
                        'than one existing StreamSet has the same ID.');
      continue;
    }

    var newStreamSetInfos = newStreamSetInfoMap.get(id);
    if (newStreamSetInfos.length == 0) {
      continue;
    } else if (newStreamSetInfos.length == 1) {
      // Only update the StreamSet if it is usable.
      var usableStreamSets =
          this.streamSetsByType.get(currentStreamSetInfos[0].contentType);
      if (usableStreamSets &&
          (usableStreamSets.indexOf(currentStreamSetInfos[0])) >= 0) {
        this.mergeStreamInfos_(currentStreamSetInfos[0], newStreamSetInfos[0]);
      } else {
        shaka.log.warning('Ignoring update to StreamSet ' + id + ' because ' +
                          'it is not usable.');
      }
    } else {
      shaka.log.warning('Cannot update StreamSet ' + id + ' because more ' +
                        'than one new StreamSet has the same ID.');
    }
  }
};


/**
 * Merges StreamInfos from |newStreamSetInfo| into |currentStreamSetInfo|.
 *
 * @param {!shaka.media.StreamSetInfo} currentStreamSetInfo
 * @param {!shaka.media.StreamSetInfo} newStreamSetInfo
 * @private
 */
shaka.player.StreamVideoSource.prototype.mergeStreamInfos_ = function(
    currentStreamSetInfo, newStreamSetInfo) {
  /** @type {!shaka.util.MultiMap.<!shaka.media.StreamInfo>} */
  var currentStreamInfoMap = new shaka.util.MultiMap();
  currentStreamSetInfo.streamInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    currentStreamInfoMap.push(id, info);
  });

  /** @type {!shaka.util.MultiMap.<!shaka.media.StreamInfo>} */
  var newStreamInfoMap = new shaka.util.MultiMap();
  newStreamSetInfo.streamInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    newStreamInfoMap.push(id, info);
  });

  /** @type {!Object.<string, string>} */
  var visitedStreamInfoSet = {};

  var keys = currentStreamInfoMap.keys();
  for (var i = 0; i < keys.length; ++i) {
    var id = keys[i];

    visitedStreamInfoSet[id] = id;

    var currentStreamInfos = currentStreamInfoMap.get(id);
    shaka.asserts.assert(currentStreamInfos.length != 0);
    if (currentStreamInfos.length > 1) {
      shaka.log.warning('Cannot update Stream ' + id + ' because more ' +
                        'than one existing Stream has the same ID.');
      continue;
    }

    var newStreamInfos = newStreamInfoMap.get(id);
    if (newStreamInfos.length == 0) {
      this.removeStream_(currentStreamSetInfo, currentStreamInfos[0]);
    } else if (newStreamInfos.length == 1) {
      this.mergeSegmentIndexes_(currentStreamInfos[0], newStreamInfos[0]);
    } else {
      shaka.log.warning('Cannot update Stream ' + id + ' because more ' +
                        'than one new Stream has the same ID.');
    }
  }

  keys = newStreamInfoMap.keys();
  for (var i = 0; i < keys.length; ++i) {
    var id = keys[i];

    if (visitedStreamInfoSet[id]) continue;
    visitedStreamInfoSet[id] = id;

    var newStreamInfos = newStreamInfoMap.get(id);
    shaka.asserts.assert(newStreamInfos.length != 0);
    if (newStreamInfos.length > 1) {
      shaka.log.warning('Cannot add Stream ' + id + ' because more ' +
                        'than one new Stream has the same ID.');
    }

    // Note that content restrictions, if any, are applied after merging.
    currentStreamSetInfo.streamInfos.push(newStreamInfos[0]);
    shaka.log.info('Added Stream ' + id + '.');
  }
};


/**
 * Merges SegmentIndexes from |newStreamInfo| into |currentStreamSet|.
 *
 * @param {!shaka.media.StreamInfo} currentStreamInfo
 * @param {!shaka.media.StreamInfo} newStreamInfo
 * @private
 */
shaka.player.StreamVideoSource.prototype.mergeSegmentIndexes_ = function(
    currentStreamInfo, newStreamInfo) {
  var async = [
    currentStreamInfo.getSegmentIndex(),
    newStreamInfo.getSegmentIndex()
  ];

  Promise.all(async).then(shaka.util.TypedBind(this,
      function() {
        shaka.asserts.assert(currentStreamInfo.segmentIndex);
        shaka.asserts.assert(newStreamInfo.segmentIndex);

        currentStreamInfo.segmentIndex.merge(
            /** @type {!shaka.media.SegmentIndex} */ (
                newStreamInfo.segmentIndex));
        shaka.log.info('Updated StreamInfo ' + currentStreamInfo.id + ', ' +
                       'SegmentIndex now has ' +
                       currentStreamInfo.segmentIndex.getNumReferences() + ' ' +
                       'references.');
      })
  );
};


/**
 * Removes |streamInfo| from the list of usable streams. Switches to a new
 * stream if |streamInfo| is active. Does not remove |streamInfo| if it is the
 * only usable stream of its type.
 *
 * @param {!shaka.media.StreamSetInfo} streamSetInfo The parent StreamSetInfo.
 * @param {!shaka.media.StreamInfo} streamInfo
 * @private
 */
shaka.player.StreamVideoSource.prototype.removeStream_ = function(
    streamSetInfo, streamInfo) {
  var stream = this.streamsByType_[streamSetInfo.contentType];
  shaka.asserts.assert(stream);

  var usableStreamSetInfos =
      this.streamSetsByType.get(streamSetInfo.contentType);
  shaka.asserts.assert(usableStreamSetInfos);

  if (stream.getStreamInfo() == streamInfo) {
    // Find the next usable StreamInfo.
    var newStreamInfo = (function() {
      for (var i = 0; i < usableStreamSetInfos.length; ++i) {
        var usableStreamSetInfo = usableStreamSetInfos[i];
        for (var j = 0; j < usableStreamSetInfo.streamInfos.length; ++j) {
          var info = usableStreamSetInfo.streamInfos[j];
          if ((info != streamInfo) && info.enabled) {
            return info;
          }
        }
      }
      return null;
    })();

    if (!newStreamInfo) {
      // TODO: Allow this if an alternate stream exists in the new manifest.
      shaka.log.warning('Cannot remove stream ' + streamInfo.id + ' because ' +
                        'an alternate stream does not exist.');
      return;
    }

    stream.switch(newStreamInfo, true /* immediate */);
  }

  var i = streamSetInfo.streamInfos.indexOf(streamInfo);
  shaka.asserts.assert(i >= 0);
  streamSetInfo.streamInfos.splice(i, 1);

  shaka.log.info('Removed Stream ' + streamInfo.id + '.');
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
  return this.manifestInfo.minBufferTime || 0;
};


/** @override */
shaka.player.StreamVideoSource.prototype.getConfigurations =
    function() {
  if (this.manifestInfo.periodInfos.length == 0) {
    return [];
  }

  // TODO(story 1890046): Support multiple periods.
  return this.manifestInfo.periodInfos[0].getConfigs();
};


/** @override */
shaka.player.StreamVideoSource.prototype.selectConfigurations =
    function(configs) {
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
    var LanguageUtils = shaka.util.LanguageUtils;
    if (LanguageUtils.match(LanguageUtils.MatchType.MAX, this.lang_, lang)) {
      this.subsNeeded_ = false;
    }
  }

  var textSets = this.streamSetsByType.get('text');
  if (textSets) {
    this.sortByLanguage_(textSets);
    this.streamSetsByType.set('text', textSets);
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
  if (!this.streamSetsByType.has(type)) {
    return false;
  }
  shaka.asserts.assert(this.streamsByType_[type]);

  var sets = this.streamSetsByType.get(type);
  for (var i = 0; i < sets.length; ++i) {
    var streamSetInfo = sets[i];
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
  shaka.asserts.assert(this.manifestInfo.periodInfos.length > 0);
  shaka.asserts.assert(this.mediaSource_.sourceBuffers.length == 0);
  shaka.asserts.assert(this.video_);
  shaka.asserts.assert(this.stats_);

  this.eventManager_.unlisten(this.mediaSource_, 'sourceopen');

  // TODO(story 1890046): Support multiple periods.
  var periodDuration = this.manifestInfo.periodInfos[0].duration;
  if (periodDuration != null) {
    this.mediaSource_.duration = periodDuration;
  } else {
    shaka.log.warning('Manifest does not specify a period duration!');
  }

  // Choose the first stream set from each type.
  var selectedStreamSetInfos = [];
  var desiredTypes = ['audio', 'video', 'text'];
  for (var i = 0; i < desiredTypes.length; ++i) {
    var type = desiredTypes[i];
    if (this.streamSetsByType.has(type)) {
      selectedStreamSetInfos.push(this.streamSetsByType.get(type)[0]);
    }
  }

  /** @type {!Object.<string, !shaka.media.StreamInfo>} */
  var selectedStreamInfosByType = {};

  // Keep track of the latest start time so we can start each stream from
  // this point.
  // TODO: Start the stream at, or close to, the current presentation time if
  // live.
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
  // TODO: This try block and the one after it may not be necessary, since we
  // should be in a state where no exceptions should be thrown.
  var buf;
  try {
    var fullMimeType = streamInfo.getFullMimeType();
    buf = this.mediaSource_.addSourceBuffer(fullMimeType);
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

  shaka.log.info('Latest start time:', latestStartTime);
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

  if (this.manifestInfo.live) {
    return;
  }

  for (var type in this.streamsByType_) {
    if (!this.streamsByType_[type].hasEnded()) {
      // Not all streams have ended, so ignore.
      return;
    }
  }

  // If all the streams have ended then |mediaSource_| should be in the
  // open state, which is required before calling endOfStream().
  shaka.asserts.assert(this.mediaSource_.readyState == 'open');

  // All streams have ended, so signal EOF to |mediaSource_|.
  this.mediaSource_.endOfStream();
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

