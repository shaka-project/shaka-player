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

goog.provide('shaka.player.StreamVideoSource');

goog.require('shaka.asserts');
goog.require('shaka.features');
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
goog.require('shaka.player.Defaults');
goog.require('shaka.player.IVideoSource');
goog.require('shaka.player.Restrictions');
goog.require('shaka.player.VideoTrack');
goog.require('shaka.util.EmeUtils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');


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
 * @event shaka.player.StreamVideoSource.TracksChangedEvent
 * @description Fired when one or more audio, video, or text tracks become
 *     available or unavailable.
 * @property {string} type 'trackschanged'
 * @property {boolean} bubbles true
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

  /** @protected {number} */
  this.mpdRequestTimeout = shaka.player.Defaults.MPD_REQUEST_TIMEOUT;

  /**
   * All usable StreamSetInfos from the manifest. Each StreamInfo contained
   * within is mutually compatible with all other StreamInfos of the same type.
   * Populated in selectConfigurations().
   * @protected {!shaka.util.MultiMap.<!shaka.media.StreamSetInfo>}
   * TODO(story 1890046): Support multiple periods.
   */
  this.streamSetsByType = new shaka.util.MultiMap();

  /** @private {!shaka.media.IAbrManager} */
  this.abrManager_ = abrManager;
  this.abrManager_.initialize(estimator, this);

  /** @private {boolean} */
  this.loaded_ = false;

  /** @private {string} */
  this.lang_ = shaka.player.Defaults.PREFERRED_LANGUAGE;

  /** @private {boolean} */
  this.subsNeeded_ = false;

  /** @private {shaka.player.Stats} */
  this.stats_ = null;

  /** @private {!shaka.util.PublicPromise} */
  this.attachPromise_ = new shaka.util.PublicPromise();

  /** @private {!shaka.player.Restrictions} */
  this.restrictions_ = new shaka.player.Restrictions();

  /** @private {?number} */
  this.ignoreSeek_ = null;

  /** @private {number} */
  this.originalPlaybackRate_ = 1;

  /** @private {!Object.<string, !shaka.media.IStream>} */
  this.streamsByType_ = {};

  /** @private {!shaka.util.PublicPromise} */
  this.proceedPromise_ = new shaka.util.PublicPromise();

  /** @private {number} */
  this.liveEdgeOffset_ = 0;

  /** @private {number} */
  this.liveEndTime_ = 0;

  /** @private {number} */
  this.liveStreamEndTimeout_ = shaka.player.Defaults.STREAM_BUFFER_SIZE;

  /** @private {?number} */
  this.liveEndedTimer_ = null;

  /** @private {boolean} */
  this.canSwitch_ = false;

  /**
   * @private {!Object.<string, {streamInfo: !shaka.media.StreamInfo,
   *                             clearBuffer: boolean,
   *                             clearBufferOffset: (number|undefined)}>}
   */
  this.deferredSwitches_ = {};

  /** @private {?number} */
  this.updateTimer_ = null;

  /** @private {?number} */
  this.seekRangeTimer_ = null;

  /** @private {?number} */
  this.playbackStartTime_ = null;

  /** @private {!Object.<string, *>} */
  this.streamConfig_ = {};
};
goog.inherits(shaka.player.StreamVideoSource, shaka.util.FakeEventTarget);


/**
 * @const {number}
 * @private
 */
shaka.player.StreamVideoSource.MIN_UPDATE_PERIOD_ = 3;


/**
 * @const {number}
 * @private
 */
shaka.player.StreamVideoSource.SEEK_TOLERANCE_ = 0.01;


/**
 * @const {number}
 * @private
 */
shaka.player.StreamVideoSource.SEEK_OFFSET_ = 0.5;


/**
 * <p>
 * Configures the StreamVideoSource options.
 * </p>
 *
 * The following configuration options are supported:
 * <ul>
 * <li>
 *   <b>enableAdaptation</b>: boolean <br>
 *   Enables or disables automatic bitrate adaptation.
 *
 * <li>
 *   <b>streamBufferSize</b>: number <br>
 *   Sets the maximum amount of content, in seconds, that audio and video
 *   streams will buffer ahead of the playhead.  For DASH streams, this will
 *   be overridden if 'minBufferTime' is larger.
 *
 * <li>
 *   <b>mpdRequestTimeout</b>: number <br>
 *   Sets the MPD request timeout in seconds. A value of zero indicates no
 *   timeout.
 *
 * <li>
 *   <b>segmentRequestTimeout</b>: number <br>
 *   Sets the segment request timeout in seconds. A value of zero indicates no
 *   timeout.
 *
 * <li>
 *   <b>preferredLanguage</b>: string <br>
 *   Sets the preferred language (the default is 'en').
 *
 * <li>
 *   <b>restrictions</b>: shaka.player.Restrictions <br>
 *   Sets the video track restrictions.
 * </ul>
 *
 * @example
 *     streamVideoSouce.configure({'streamBufferSize': 20});
 *
 * @param {!Object.<string, *>} config A configuration object, which contains
 *     the configuration options as key-value pairs. All fields should have
 *     already been validated.
 * @override
 */
shaka.player.StreamVideoSource.prototype.configure = function(config) {
  if (config['streamBufferSize'] != null) {
    this.streamConfig_['streamBufferSize'] = config['streamBufferSize'];
  }

  if (config['segmentRequestTimeout'] != null) {
    this.streamConfig_['segmentRequestTimeout'] =
        config['segmentRequestTimeout'];
  }

  this.configureStreams_();

  if (config['enableAdaptation'] != null) {
    this.abrManager_.enable(Boolean(config['enableAdaptation']));
  }

  if (config['mpdRequestTimeout'] != null) {
    this.mpdRequestTimeout = Number(config['mpdRequestTimeout']);
  }

  if (config['liveStreamEndTimeout'] != null) {
    this.liveStreamEndTimeout_ = Number(config['liveStreamEndTimeout']);
  }

  if (config['preferredLanguage'] != null) {
    this.lang_ =
        shaka.util.LanguageUtils.normalize(String(config['preferredLanguage']));
  }

  if (config['restrictions'] != null) {
    var restrictions = /** @type {!shaka.player.Restrictions} */(
        config['restrictions']);
    this.restrictions_ = restrictions;
    if (this.loaded_) {
      this.applyRestrictions_();
    }
  }
};


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.player.StreamVideoSource.prototype.destroy = function() {
  this.attachPromise_.destroy();
  this.proceedPromise_.destroy();

  this.attachPromise_ = null;
  this.proceedPromise_ = null;

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
  this.restrictions_ = null;

  this.parent = null;
};


/** @override */
shaka.player.StreamVideoSource.prototype.attach = function(player, video) {
  if (!this.loaded_) {
    var error = new Error('Cannot call attach() right now.');
    error.type = 'app';
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

  if (shaka.features.Live && this.manifestInfo.live) {
    this.eventManager.listen(
        player,
        'bufferingStart',
        this.onBufferingStart_.bind(this));

    this.eventManager.listen(
        player,
        'bufferingEnd',
        this.onBufferingEnd_.bind(this));
  }

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
shaka.player.StreamVideoSource.prototype.load = function() {
  if (this.loaded_) {
    var error = new Error('Cannot call load() right now.');
    error.type = 'app';
    return Promise.reject(error);
  }

  if (!this.manifestInfo || this.manifestInfo.periodInfos.length == 0) {
    var error = new Error('The manifest does not specify any content.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  if (!shaka.features.Live && this.manifestInfo.live) {
    var error = new Error('Live manifest support not enabled.');
    error.type = 'app';
    return Promise.reject(error);
  }

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

  // Set the Streams' initial buffer sizes.
  this.streamConfig_['initialStreamBufferSize'] =
      this.manifestInfo.minBufferTime;
  this.configureStreams_();

  this.applyRestrictions_();

  return Promise.resolve();
};


if (shaka.features.Live) {
  /**
   * Updates the manifest.
   *
   * @param {boolean} useLocal Whether to update using the local manifest.
   * @private
   */
  shaka.player.StreamVideoSource.prototype.onUpdateManifest_ =
      function(useLocal) {
    shaka.asserts.assert(this.loaded_);
    shaka.asserts.assert(this.manifestInfo.updatePeriod != null);
    shaka.asserts.assert(this.manifestInfo.updateUrl != null);

    shaka.log.info('Updating manifest...');

    var startTime = Date.now();
    this.updateTimer_ = null;

    /** @type {shaka.media.ManifestUpdater} */
    var updater = null;

    var url = /** @type {!shaka.util.FailoverUri} */
        (this.manifestInfo.updateUrl);
    var p = useLocal ?
        this.onUpdateLocalManifest() :
        this.onUpdateManifest(url);

    p.then(shaka.util.TypedBind(this,
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

          // Reconfigure the Streams because |minBufferTime| may have changed.
          this.streamConfig_['initialStreamBufferSize'] =
              this.manifestInfo.minBufferTime;
          this.configureStreams_();

          this.applyRestrictions_();

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
        /** @param {*} error */
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
   * @param {!shaka.util.FailoverUri} url
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
   * Update local manifest hook.  The caller takes ownership of the returned
   * manifest.  This CANNOT return this.manifestInfo.
   *
   * @return {!Promise.<!shaka.media.ManifestInfo>}
   * @protected
   */
  shaka.player.StreamVideoSource.prototype.onUpdateLocalManifest = function() {
    shaka.asserts.notImplemented();
    var error = 'Cannot update manifest with this VideoSource implementation.';
    error.type = 'stream';
    return Promise.reject(error);
  };


  /**
   * Sets the update timer to updated the manifest using the local copy.
   *
   * @private
   */
  shaka.player.StreamVideoSource.prototype.setUpdateLocalManifest_ =
      function() {
    shaka.asserts.assert(!this.updateTimer_);
    shaka.asserts.assert(this.manifestInfo.live);
    shaka.asserts.assert(this.manifestInfo.availabilityStartTime);

    var currentTime = Date.now() / 1000;
    var ast = this.manifestInfo.availabilityStartTime;
    var updateInterval = Math.max(ast - currentTime,
        shaka.player.StreamVideoSource.MIN_UPDATE_PERIOD_);
    shaka.log.debug('updateLocalInterval', updateInterval);

    var callback = this.onUpdateManifest_.bind(this, true);
    this.updateTimer_ = window.setTimeout(callback, 1000 * updateInterval);
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

    var callback = this.onUpdateManifest_.bind(this, false);
    this.updateTimer_ = window.setTimeout(callback, 1000 * updateInterval);
  };
}  // shaka.features.Live


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
        .filter(function(streamInfo) { return streamInfo.usable(); });
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
    stream.switch(newStreamInfos[0], true /* clearBuffer */);

    streamInfo.destroy();
  }

  shaka.log.info('Removed stream', streamInfo.id);
  streamInfo.destroy();
};


/**
 * @override
 * @export
 */
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
      if (!streamInfo.usable()) continue;

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


/**
 * @override
 * @export
 */
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
      if (!streamInfo.usable()) continue;

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


/**
 * @override
 * @export
 */
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
shaka.player.StreamVideoSource.prototype.getBufferingGoal = function() {
  return Number(this.streamConfig_['initialStreamBufferSize']);
};


/** @override */
shaka.player.StreamVideoSource.prototype.getConfigurations =
    function() {
  // TODO(story 1890046): Support multiple periods.
  return this.loaded_ ? this.manifestInfo.periodInfos[0].getConfigs() : [];
};


/** @override */
shaka.player.StreamVideoSource.prototype.selectConfigurations = function(
    configs) {
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
    function(id, clearBuffer, opt_clearBufferOffset) {
  return this.selectTrack_('video', id, clearBuffer, opt_clearBufferOffset);
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
shaka.player.StreamVideoSource.prototype.setPlaybackStartTime =
    function(startTime) {
  this.playbackStartTime_ = startTime;
};


/**
 * Applies the video track restrictions, if any.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.applyRestrictions_ = function() {
  shaka.asserts.assert(this.manifestInfo);
  shaka.asserts.assert(this.loaded_);

  if (!this.restrictions_) {
    return;
  }

  var tracksChanged = false;

  // Note that the *Info objects contained within this.manifestInfo are the same
  // objects contained within this.streamSetsByType.
  for (var i = 0; i < this.manifestInfo.periodInfos.length; ++i) {
    var periodInfo = this.manifestInfo.periodInfos[i];

    for (var j = 0; j < periodInfo.streamSetInfos.length; ++j) {
      var streamSetInfo = periodInfo.streamSetInfos[j];

      if (streamSetInfo.contentType != 'video') continue;

      for (var k = 0; k < streamSetInfo.streamInfos.length; ++k) {
        var streamInfo = streamSetInfo.streamInfos[k];

        var originalAllowed = streamInfo.allowedByApplication;
        streamInfo.allowedByApplication = true;

        if (this.restrictions_.maxWidth &&
            streamInfo.width > this.restrictions_.maxWidth) {
          streamInfo.allowedByApplication = false;
        }

        if (this.restrictions_.maxHeight &&
            streamInfo.height > this.restrictions_.maxHeight) {
          streamInfo.allowedByApplication = false;
        }

        if (this.restrictions_.maxBandwidth &&
            streamInfo.bandwidth > this.restrictions_.maxBandwidth) {
          streamInfo.allowedByApplication = false;
        }

        if (this.restrictions_.minBandwidth &&
            streamInfo.bandwidth < this.restrictions_.minBandwidth) {
          streamInfo.allowedByApplication = false;
        }

        if (originalAllowed == streamInfo.allowedByApplication) continue;

        shaka.log.info(
            streamInfo.allowedByApplication ? 'Permitting' : 'Restricting',
            'stream', streamInfo.id + '.',
            'The application has applied new video track restrictions.');

        tracksChanged = true;
      }  // for k
    }  // for j
  }  // for i

  // If selectConfigurations() has not been called yet then there are no tracks
  // yet.
  if (this.streamSetsByType.getAll().length == 0 || !tracksChanged) {
    return;
  }

  this.fireTracksChangedEvent_();

  shaka.asserts.assert(this.streamSetsByType.has('video'));
  var videoTracks = this.getVideoTracks();
  if (videoTracks.length > 0) {
    return;
  }

  // Raise an error but don't explicity stop playback (leave that to the
  // application).
  var error = new Error('The application has restricted all video tracks!');
  error.type = 'app';
  var errorEvent = shaka.util.FakeEvent.createErrorEvent(error);
  this.dispatchEvent(errorEvent);
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


/** @override */
shaka.player.StreamVideoSource.prototype.onKeyStatusesChange = function(
    keyStatusByKeyId) {
  if (!COMPILED) {
    for (var keyId in keyStatusByKeyId) {
      var prettyKeyId = shaka.util.StringUtils.formatHexString(keyId);
      shaka.log.debug(
          'Key status:', prettyKeyId + ': ' + keyStatusByKeyId[keyId]);
    }
  }

  var tracksChanged = false;

  var streamInfosByKeyId = new shaka.util.MultiMap();

  var streamSetInfos = this.streamSetsByType.getAll();
  for (var i = 0; i < streamSetInfos.length; ++i) {
    var streamSetInfo = streamSetInfos[i];
    for (var j = 0; j < streamSetInfo.streamInfos.length; ++j) {
      var streamInfo = streamSetInfo.streamInfos[j];
      streamInfo.keyIds.forEach(
          function(keyId) { streamInfosByKeyId.push(keyId, streamInfo); });
    }
  }

  for (var keyId in keyStatusByKeyId) {
    var keyStatus = keyStatusByKeyId[keyId];
    var message = shaka.util.EmeUtils.getKeyStatusErrorMessage(keyStatus);

    var streamInfos = streamInfosByKeyId.get(keyId);
    if (!streamInfos) {
      var prettyKeyId = shaka.util.StringUtils.formatHexString(keyId);
      shaka.log.debug('Key', prettyKeyId, 'was not specified in the manifest.');
      if (message) {
        shaka.log.warning('Key', prettyKeyId, 'is not usable.', message);
      }
      continue;
    }

    for (var i = 0; i < streamInfos.length; ++i) {
      var streamInfo = streamInfos[i];
      var originalAllowed = streamInfo.allowedByKeySystem;
      streamInfo.allowedByKeySystem = !message;
      if (originalAllowed == streamInfo.allowedByKeySystem) continue;
      shaka.log.info(
          streamInfo.allowedByKeySystem ? 'Permitting' : 'Restricting',
          'stream', streamInfo.id + '.', message || '');
      tracksChanged = true;
    }
  }

  if (!tracksChanged) {
    return;
  }

  this.fireTracksChangedEvent_();

  var audioTracks = this.getAudioTracks();
  var videoTracks = this.getVideoTracks();

  var noAudio = this.streamSetsByType.has('audio') && (audioTracks.length == 0);
  var noVideo = this.streamSetsByType.has('video') && (videoTracks.length == 0);

  if (!noAudio && !noVideo) {
    return;
  }

  // Raise an error but don't explicitly stop playback (leave that to the
  // application).
  var suffix;
  if (noAudio && noVideo) {
    suffix = 'audio and video tracks.';
  } else if (noAudio) {
    suffix = 'audio tracks.';
  } else {
    suffix = 'video tracks.';
  }
  var error = new Error('The key system has restricted all ' + suffix);
  error.type = 'drm';
  var errorEvent = shaka.util.FakeEvent.createErrorEvent(error);
  this.dispatchEvent(errorEvent);
};


/**
 * Fires a 'trackschanged' event.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.fireTracksChangedEvent_ = function() {
  var event = shaka.util.FakeEvent.create({
    'type': 'trackschanged',
    'bubbles': true
  });

  this.dispatchEvent(event);
};


/**
 * Select a track by ID.
 *
 * @param {string} type The type of track to change, such as 'video', 'audio',
 *     or 'text'.
 * @param {number} id The |uniqueId| field of the desired StreamInfo.
 * @param {boolean} clearBuffer
 * @param {number=} opt_clearBufferOffset if |clearBuffer| and
 *     |opt_clearBufferOffset| are truthy, clear the stream buffer from the
 *     offset (in front of video currentTime) to the end of the stream.
 *
 * @return {boolean} True on success.
 * @private
 */
shaka.player.StreamVideoSource.prototype.selectTrack_ =
    function(type, id, clearBuffer, opt_clearBufferOffset) {
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

      if (!streamInfo.allowedByKeySystem) {
        shaka.log.warning(
            'Cannot select', type, 'track', id,
            'because the track is not allowed by the key system.');
        return false;
      }

      if (!streamInfo.allowedByApplication) {
        shaka.log.warning(
            'Cannot select', type, 'track', id,
            'because the track is not allowed by the application.');
        return false;
      }

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
          clearBuffer: (tuple != null && tuple.clearBuffer) || clearBuffer,
          clearBufferOffset:
              (tuple != null && tuple.clearBufferOffset) ||
              opt_clearBufferOffset
        };
        return true;
      }

      shaka.asserts.assert(this.stats_);
      this.stats_.logStreamChange(streamInfo);

      this.streamsByType_[type].switch(
          streamInfo, clearBuffer, opt_clearBufferOffset);
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
 * Called when the MediaSource transitions into the 'open' state. Only
 * called after load() has been called.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.StreamVideoSource.prototype.onMediaSourceOpen_ = function(event) {
  this.eventManager.unlisten(this.mediaSource, 'sourceopen');

  this.createAndStartStreams_().then(shaka.util.TypedBind(this,
      function() {
        if (this.attachPromise_) {
          this.attachPromise_.resolve();
        }
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {*} error */
      function(error) {
        if (this.attachPromise_) {
          this.attachPromise_.reject(error);
        }
      })
  );
};


/**
 * Instantiates the Streams and begins stream startup.
 *
 * Stream startup consists of starting a Stream for each available content
 * type, waiting for each of these Streams to complete their initialization
 * sequence (see {@link shaka.media.IStream}), applying the global timestamp
 * correction, and then beginning playback.
 *
 * This function resolves the returned Promise when it instantiates and starts
 * the initial set of Streams; at this time, each Stream (i.e., each Stream in
 * this.streamsByType_) will be in the 'startup' state; however, actual
 * playback will not have begun, and the video's playback rate should be zero.
 *
 * When each Stream completes startup we call
 * {@link shaka.player.StreamVideoSource#onAllStreamsStarted_}; at this time,
 * each Stream will be in the 'waiting' state.
 *
 * @return {!Promise} A Promise that resolves when this function creates
 *     the initial set of Streams and begins stream startup. If the manifest
 *     specifies live content then this function will always resolve the
 *     returned Promise; otherwise, this function may reject the returned
 *     Promise.
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

  /** @type {!Object.<string, !shaka.media.StreamInfo>} */
  var selectedStreamInfosByType =
      this.selectStreamInfos_(selectedStreamSetInfos);
  for (var i = 0; i < desiredTypes.length; ++i) {
    var type = desiredTypes[i];
    if (this.streamSetsByType.has(type) && !selectedStreamInfosByType[type]) {
      var error = new Error(
          'Unable to select an initial ' + type + ' stream: ' +
          'all ' + type + ' streams have been restricted ' +
          '(by the application or by the key system).');
      error.type = 'stream';
      return Promise.reject(error);
    }
  }

  // Create/fetch the SegmentIndex for each selected StreamInfo.
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

        // Compute the initial stream limits.
        var streamLimits = this.computeStreamLimits_(segmentIndexes);
        if (!streamLimits) {
          // This may occur if the manifest is not well formed or if the
          // streams have just become available, such that the streams' media
          // timelines do not intersect, i.e., the streams do not share any
          // timestamps in common.
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

        this.abrManager_.start();
        this.startStreams_(selectedStreamInfosByType, streamLimits);
        return Promise.resolve();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {*} error */
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
          // If @availabilityStartTime is in the future, simply re-process the
          // local manifest once it become available; otherwise fetch a new
          // manifest and process that.
          if (shaka.util.Clock.now() <
              this.manifestInfo.availabilityStartTime) {
            this.setUpdateLocalManifest_();
          } else {
            this.setUpdateTimer_(0);
          }
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

    var streamInfo = null;
    if (streamSetInfo.contentType == 'video') {
      // Ask AbrManager which video StreamInfo to start with.
      var trackId = this.abrManager_.getInitialVideoTrackId();
      if (trackId == null) {
        shaka.log.debug('No initial video streams to select.');
        continue;
      }

      var streamInfos = streamSetInfo.streamInfos.filter(
          function(streamInfo) { return streamInfo.uniqueId == trackId; });

      // Ensure AbrManager selected a video StreamInfo from |streamSetInfo|.
      if (streamInfos.length == 0) {
        shaka.log.debug(
            'No initial video streams to select from the selected ' +
            'StreamSetInfo.');
        continue;
      }

      shaka.asserts.assert(streamInfos.length == 1);
      shaka.asserts.assert(streamInfos[0].usable());
      streamInfo = streamInfos[0];
    } else if (streamSetInfo.contentType == 'audio') {
      var usableStreamInfos = streamSetInfo.streamInfos.filter(
          function(streamInfo) { return streamInfo.usable(); });
      if (usableStreamInfos.length == 0) {
        shaka.log.debug('No initial audio streams to select.');
        continue;
      }

      // In lieu of audio adaptation, choose the middle stream from the
      // usable ones.  If we have high, medium, and low quality audio, this
      // is medium.  If we only have high and low, this is high.
      var index = Math.floor(usableStreamInfos.length / 2);
      streamInfo = streamSetInfo.streamInfos[index];
    } else if (streamSetInfo.streamInfos.length > 0) {
      streamInfo = streamSetInfo.streamInfos[0];
    }
    shaka.asserts.assert(streamInfo);

    selectedStreamInfosByType[streamSetInfo.contentType] =
        /** @type {!shaka.media.StreamInfo} */(streamInfo);
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
 * @return {!shaka.media.Stream}
 * @private
 */
shaka.player.StreamVideoSource.prototype.createStream_ = function(streamInfo) {
  shaka.asserts.assert(this.video);
  var fullMimeType = streamInfo.getFullMimeType();
  var stream = new shaka.media.Stream(
      this,
      /** @type {!HTMLVideoElement} */(this.video),
      this.mediaSource,
      streamInfo.getFullMimeType(),
      this.estimator);
  stream.configure(this.streamConfig_);
  return stream;
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
 * Starts each Stream.
 *
 * @param {!Object.<string, !shaka.media.StreamInfo>} streamInfosByType
 * @param {{start: number, end: number, last: number}} streamLimits The initial
 *     stream limits.
 * @private
 */
shaka.player.StreamVideoSource.prototype.startStreams_ = function(
    streamInfosByType, streamLimits) {
  // If we apply a global timestamp correction after the Streams complete
  // startup then we will also have to adjust the video's current time (see
  // onAllStreamsStarted_), so don't begin playback yet.
  this.originalPlaybackRate_ = this.video.playbackRate;
  this.video.playbackRate = 0;

  this.setUpMediaSource_(streamLimits);

  // Determine the stream start time.
  var streamStartTime;
  if (this.manifestInfo.live) {
    shaka.asserts.assert(streamLimits.end != Number.POSITIVE_INFINITY);
    streamStartTime = streamLimits.end;
  } else {
    // If a specific start time was set, and it's within the stream limits, use
    // that as the start time.
    if (this.playbackStartTime_ &&
        this.playbackStartTime_ <= streamLimits.end &&
        this.playbackStartTime_ >= streamLimits.start) {
      streamStartTime = this.playbackStartTime_;
    } else {
      streamStartTime = streamLimits.start;
    }
  }

  shaka.log.info('Starting each stream from', streamStartTime);

  // Start listening to 'seeking' events right away as we must handle seeking
  // during stream startup.
  this.eventManager.listen(this.video, 'seeking', this.onSeeking_.bind(this));

  if (this.video.currentTime != streamStartTime) {
    // Set the video's current time before starting the streams so that the
    // streams start buffering at the stream start time.
    this.video.currentTime = streamStartTime;

    // Ignore the resulting 'seeking' event since there's no need to resync the
    // streams before buffering (see onSeeking_).
    this.ignoreSeek_ = streamStartTime;
    shaka.log.debug('Ignoring pending seek to', this.ignoreSeek_);
  }

  // Inform the application of the initial seek range.
  this.fireSeekRangeChangedEvent_(streamLimits.start, streamLimits.end);

  // Start the streams.
  var async = [];

  for (var type in this.streamsByType_) {
    var stream = this.streamsByType_[type];

    async.push(stream.started(this.proceedPromise_));

    this.eventManager.listen(
        stream,
        'ended',
        this.onStreamEnded_.bind(this));

    var streamInfo = streamInfosByType[type];
    this.stats_.logStreamChange(streamInfo);

    stream.switch(streamInfo, false /* clearBuffer */);
  }

  Promise.all(async).then(
      this.onAllStreamsStarted_.bind(this)
  ).catch(shaka.util.TypedBind(this,
      /** @param {*} error */
      function(error) {
        // One or more Streams encountered an unrecoverable error during stream
        // startup. There's nothing else to do.
        shaka.asserts.assert(error.type != 'aborted');

        if (error.type != 'destroy') {
          shaka.log.error('Stream startup failed!');

          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);
        }
      })
  );

  // Enable the subtitle display by default iff the subs are needed.
  this.enableTextTrack(this.subsNeeded_);
};


/**
 * Called when each Stream has completed startup.
 *
 * Computes a global timestamp correction and immediately applies it to the
 * initial set of SegmentIndexes and then begins playback. In parallel,
 * creates/fetches all SegmentIndexes and fetches all initialization segments.
 *
 * @param {!Array.<number>} timestampCorrections The initial set of streams'
 *     timestamp corrections.
 * @private
 */
shaka.player.StreamVideoSource.prototype.onAllStreamsStarted_ = function(
    timestampCorrections) {
  shaka.log.info('All Streams have completed startup!');

  shaka.asserts.assert(
      timestampCorrections &&
      timestampCorrections.length == Object.keys(this.streamsByType_).length,
      'There should be a timestamp correction for each Stream.');

  // Compute a global timestamp correction (TSC) to correct the
  // SegmentIndexes.
  //
  // For example, consider two streams, where the manifest specified that they
  // should start at 2 seconds but the first one is offset by 2 seconds and the
  // second one is offset by 3 seconds. After we buffer 2 segments we would see
  // [1] below (if the SegmentIndexes were accurate, we would see [2] below).
  //
  // Legend:
  // a: 1st segment's content.
  // b: 2nd segment's content.
  //
  // [1]
  // <---|---|---aaaaaaaabbbbbbbb--------->
  // <---|---|-----aaaaaaaabbbbbbbb------->
  //     0   2   4 5 6   8   A   B
  //
  // [2]
  // <---|---aaaaaaaabbbbbbbb------------->
  // <---|---aaaaaaaabbbbbbbb------------->
  //     0   2   4   6   8   A   B
  //
  // These timestamp offsets exist because a manifest may not provide exact
  // timestamp signalling, especially for live streams. For example, for DASH,
  // inaccurate timestamp signalling is explicitly allowed (i.e., MPD start
  // times are approximations of media presentation start times).
  //
  // If we did not compensate for these timestamp offsets then we would
  // encounter two issues:
  // 1. the user could seek such that the playhead could end up in an
  //    unbuffered region, e.g., if the user seeks to 6.1 seconds then each
  //    Stream would fetch segment two, which would leave the playhead in an
  //    unbuffered region;
  // 2. the playhead would be behind the first buffered range before playback
  //    even begins.
  // Note that if the timestamp offsets were negative, we would encounter
  // similar issues.
  //
  // So, to compensate for these timestamp offsets we use TSCs: if a stream is
  // offset by N seconds then it requires an N second TSC.
  //
  // We compute a single global TSC, which is the maximum TSC among the initial
  // set of streams' TSCs, and then correct every SegmentIndex with the global
  // TSC. So, in the future when the Streams fetch segments that should start
  // at M seconds, the segments will either start exactly at M seconds or at
  // some small amount of time before M seconds. Furthermore, we adjust the
  // playhead before we begin playback to ensure the playhead is within a
  // buffered range (see beginPlayback_).
  //
  // We assume the TSCs between streams are similar, so this solution is not
  // perfect as it does not solve issue 1 in all cases; however, this
  // assumption is almost always valid and it frees us from having to compute a
  // TSC for every stream that we switch to, which is difficult when we have
  // already buffered one or more segments.
  var minTimestampCorrection = Number.POSITIVE_INFINITY;
  var maxTimestampCorrection = Number.NEGATIVE_INFINITY;
  for (var i = 0; i < timestampCorrections.length; ++i) {
    var tsc = timestampCorrections[i];
    minTimestampCorrection = Math.min(minTimestampCorrection, tsc);
    maxTimestampCorrection = Math.max(maxTimestampCorrection, tsc);
  }
  shaka.log.info('Timestamp correction', maxTimestampCorrection);

  // |minTimestampCorrection| and |maxTimestampCorrection| should have the
  // same sign.
  if (minTimestampCorrection * maxTimestampCorrection < 0) {
    shaka.log.warning(
        'Some streams\' media timestamps are ahead of their SegmentIndexes,',
        'while other streams\' timestamps are behind.',
        'The content may have errors in it.');
  }

  // Correct the initial set of SegmentIndexes and then begin playback.
  var segmentIndexes = this.getSegmentIndexes_();
  for (var i = 0; i < segmentIndexes.length; ++i) {
    segmentIndexes[i].correct(maxTimestampCorrection);
  }
  this.beginPlayback_(segmentIndexes, maxTimestampCorrection);

  // In parallel, create/fetch all SegmentIndexes and fetch all initialization
  // segments so that they are available to the Streams right away. This
  // reduces latency when stream switching.
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
          segmentIndex.correct(maxTimestampCorrection);
        }

        shaka.log.debug(
            'Created/fetched all SegmentIndexes and initialization segments!');

        // Enable stream switching and process all deferred switches.
        this.canSwitch_ = true;
        this.processDeferredSwitches_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {*} error */
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

    stream.switch(tuple.streamInfo, tuple.clearBuffer, tuple.clearBufferOffset);
  }

  this.deferredSwitches_ = {};
};


/**
 * Corrects the MediaSource's duration and append windows, moves the playhead
 * to the start of the first buffered range, and then starts playback by
 * signalling each Stream to proceed.
 *
 * @param {!Array.<!shaka.media.SegmentIndex>} segmentIndexes The initial set
 *     of SegmentIndexes.
 * @param {number} timestampCorrection The global timestamp correction.
 * @private
 */
shaka.player.StreamVideoSource.prototype.beginPlayback_ = function(
    segmentIndexes, timestampCorrection) {
  shaka.log.debug('beginPlayback_');

  var streamLimits = this.computeStreamLimits_(segmentIndexes);
  shaka.asserts.assert(streamLimits, 'Stream limits should not be null.');
  if (streamLimits) {
    this.setUpMediaSource_(streamLimits);
    this.fireSeekRangeChangedEvent_(streamLimits.start, streamLimits.end);
  }

  // If there is a global timestamp correction then the playhead may be in an
  // unbuffered region (see onAllStreamsStarted_), so adjust the video's
  // current time as necessary. If |timestampCorrection| is 0 then don't modify
  // video.currentTime so we don't fire an unnecessary 'seeking' event.
  var correctedCurrentTime;
  if (timestampCorrection != 0) {
    shaka.log.debug(
        'Adjusting video.currentTime by', timestampCorrection, 'seconds.');
    correctedCurrentTime = this.video.currentTime + timestampCorrection;
    this.video.currentTime = correctedCurrentTime;

    // Ignore the resulting 'seeking' event since there's no need to resync the
    // streams (see onSeeking_).
    this.ignoreSeek_ = correctedCurrentTime;
    shaka.log.debug('Ignoring pending seek to', this.ignoreSeek_);
  } else {
    correctedCurrentTime = this.video.currentTime;
  }
  shaka.asserts.assert(correctedCurrentTime != null);

  // Sanity check: check that |correctedCurrentTime| is within the stream
  // limits.
  if (!COMPILED && streamLimits) {
    // For live content, if the available bandwidth is really low (e.g., lower
    // than the bandwidth specified in the manifest) then it's possible for
    // |correctedCurrentTime| to be legitimately outside of the stream limits,
    // i.e., the seek window may move past the corrected playhead.
    //
    // Note: since video.currentTime may have less precision than
    // |timestampCorrection|, include a tolerance.
    var tolerance = 10e-6;

    if (this.manifestInfo.live &&
        correctedCurrentTime < streamLimits.start - tolerance) {
      shaka.log.debug(
          'correctedCurrentTime (' + correctedCurrentTime + ')',
          'is outside of the stream limits before beginning playback!');
    }

    if ((!this.manifestInfo.live &&
         correctedCurrentTime < streamLimits.start - tolerance) ||
        (correctedCurrentTime > streamLimits.end + tolerance)) {
      shaka.log.error(
          'correctedCurrentTime (' + correctedCurrentTime + ')',
          'should be within the stream limits',
          [streamLimits.start, streamLimits.end]);
    }
  }

  if (this.manifestInfo.live && streamLimits) {
    // While the streams are starting the live-edge is moving. So, the video's
    // current time may be behind the live-edge by a few seconds (note that
    // |streamLimits| has already been corrected). This may cause a poor UX
    // since the UI might say "-00:03" instead of "LIVE". So, record an offset
    // to apply to the stream limits in the future.
    this.liveEdgeOffset_ = streamLimits.end - correctedCurrentTime;

    // Sanity check: check that |liveEdgeOffset_| is non-negative.
    if (!COMPILED) {
      // Note: since video.currentTime may have less precision than
      // |timestampCorrection|, include a tolerance.
      var tolerance = 10e-6;
      shaka.asserts.assert(this.liveEdgeOffset_ >= -tolerance,
                           'liveEdgeOffset_ should not be less than zero.');
    }

    this.liveEdgeOffset_ = Math.max(this.liveEdgeOffset_, 0);
    shaka.log.debug('Live-edge offset', this.liveEdgeOffset_);
  }

  // TODO: If the playback rate is set by the application between the set and
  // load of originalPlaybackRate_, that rate will be ignored.  Fix this race
  // between StreamVideoSource and the application.  In the mean time,
  // applications should use setPlaybackRate either before loading the source
  // or after playback begins.
  this.video.playbackRate = this.originalPlaybackRate_;

  if (this.manifestInfo.live && this.manifestInfo.updatePeriod != null) {
    // Ensure the next update occurs within |manifestInfo.updatePeriod| seconds
    // by taking into account the time it took to start the streams.
    shaka.asserts.assert(this.updateTimer_ == null);
    this.setUpdateTimer_(this.liveEdgeOffset_);
  }

  this.setSeekRangeTimer_();
  this.proceedPromise_.resolve();
};


/**
 * Sets the MediaSource's duration and the SourceBuffers' append windows.
 * Before calling this function, the MediaSource must be in the 'open' state.
 * This function may be called any number of times.
 *
 * @param {{start: number, end: number, last: number}} streamLimits The current
 *     stream limits.
 * @private
 */
shaka.player.StreamVideoSource.prototype.setUpMediaSource_ = function(
    streamLimits) {
  shaka.asserts.assert(this.mediaSource.readyState == 'open',
                       'The MediaSource should be in the \'open\' state.');

  // We need to set the MediaSource's duration so that we can append segments
  // and allow the user to seek.
  if (this.manifestInfo.live) {
    // For live content we usually don't know the content's duration, so we
    // don't need to set the duration to a precise value. We should be able to
    // set the MediaSource's duration to POSITIVE_INFINITY but on some browsers
    // this does not work as intended. So, just set the MediaSource's duration
    // to a "large" value.
    if (isNaN(this.mediaSource.duration)) {
      this.mediaSource.duration = streamLimits.end + (60 * 60 * 24 * 30);
    }
  } else {
    // For static content we know the content's duration, and we must set the
    // duration to a precise value so we don't modify the video's duration
    // during playback (e.g., by inserting a segment into the SourceBuffer that
    // ends after the MediaSource's duration) and so we can support normal
    // end-of-stream behavior (i.e., the browser should pause the video when
    // the playhead reaches the end of the video, and the browser should be
    // able to loop the video).
    //
    // So, set the MediaSource's duration to the stream end time. However, note
    // that some streams (either from the initial set of streams or from the
    // set of all streams) may start before the stream start time or may end
    // before the stream end time because the streams' media timelines may not
    // be aligned with eachother (this is normal, and is true both before and
    // after we apply the global timestamp correction). If we insert a segment
    // into the SourceBuffer that ends after the MediaSource's duration then
    // the MediaSource's duration will increase, and if the MediaSource's
    // duration increases beyond the seekable range (by some non-negligible
    // amount) then the playhead will be able to move into an unseekable range
    // during playback, which will interfere with normal end-of-stream behavior
    // and buffering detection (see #155).
    //
    // So, set the SourceBuffers' append windows so that the MediaSource's
    // duration cannot increase past the stream end time.
    //
    // TODO: If the new duration is less than the old duration then changing
    // the duration starts the 'duration change algorithm'.
    // See {@link http://www.w3.org/TR/media-source/#duration-change-algorithm}.
    // Handle this case.
    if (isNaN(this.mediaSource.duration) ||
        streamLimits.end > this.mediaSource.duration) {
      shaka.log.debug('Setting MediaSource duration to', streamLimits.end);
      this.mediaSource.duration = streamLimits.end;
      for (var i = 0; i < this.mediaSource.sourceBuffers.length; ++i) {
        this.mediaSource.sourceBuffers[i].appendWindowEnd = streamLimits.end;
      }
    }
  }
};


/**
 * Computes a new seek range and fires a 'seekrangechanged' event. Also clamps
 * the playhead to the seek start time during playback.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.onUpdateSeekRange_ = function() {
  this.seekRangeTimer_ = null;
  this.setSeekRangeTimer_();

  var streamLimits = this.computeStreamLimits_(this.getSegmentIndexes_());
  shaka.asserts.assert(streamLimits, 'Stream limits should not be null.');
  if (!streamLimits) {
    return;
  }

  if (this.manifestInfo.live && this.liveEndTime_ != streamLimits.last) {
    this.liveEndTime_ = streamLimits.last;
    if (this.liveEndedTimer_ != null) {
      shaka.log.debug('Not the end of the live stream.');
      window.clearTimeout(this.liveEndedTimer_);
      this.liveEndedTimer_ = null;
    }
  }

  this.fireSeekRangeChangedEvent_(streamLimits.start, streamLimits.end);

  if (this.video.paused) {
    return;
  }

  // Clamping the playhead to the right here ensures that if the user pauses
  // and then plays the video then the playhead is moved into the seekable
  // range. Note that if the playhead moves to the right of the seekable range
  // during playback then some of the streams must be buffering, so there's no
  // need to clamp the playhead.
  // TODO: Add live integration test that covers this case.
  var currentTime = this.video.currentTime;
  var start = streamLimits.start;
  var end = streamLimits.end;
  if (this.clampPlayheadToRight_(currentTime, start, end)) {
    shaka.log.warning(
        'Playhead is outside of the seekable range:',
        'seekable', [start, end],
        'attempted', currentTime,
        'Adjusting...');
    // If the video's current time was clamped then there will be a
    // 'seeking' event which is handled by onSeeking_().
  }
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
 * Video seeking callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.StreamVideoSource.prototype.onSeeking_ = function(event) {
  shaka.log.v1('onSeeking_', event);

  var currentTime = this.video.currentTime;

  if (this.ignoreSeek_ != null) {
    var tolerance = shaka.player.StreamVideoSource.SEEK_TOLERANCE_;
    if ((currentTime >= this.ignoreSeek_ - tolerance) &&
        (currentTime <= this.ignoreSeek_ + tolerance)) {
      shaka.log.debug('Ignored seek to', this.ignoreSeek_);
      this.ignoreSeek_ = null;
      return;
    }
    this.ignoreSeek_ = null;
  }

  var streamLimits = this.computeStreamLimits_(this.getSegmentIndexes_());
  shaka.asserts.assert(streamLimits, 'Stream limits should not be null.');
  if (!streamLimits) {
    return;
  }

  var start = streamLimits.start;
  var end = streamLimits.end;
  if (this.clampPlayheadToRight_(currentTime, start, end) ||
      this.clampPlayheadToLeft_(currentTime, end)) {
    shaka.log.warning(
        'Playhead has been moved outside of the seekable range:',
        'seekable', [start, end],
        'attempted', currentTime,
        'Adjusting...');
    // If the video's current time was clamped then there will be another
    // 'seeking' event, so this function will get called again and the 'else'
    // branch below will be executed.
  } else {
    for (var type in this.streamsByType_) {
      this.streamsByType_[type].resync();
    }
  }
};


/**
 * Clamps the video's current time to the right of the given start time
 * (inclusive).
 *
 * @param {number} currentTime The video's current time.
 * @param {number} start The start time in seconds.
 * @param {number} end The end time in seconds, which must be provided to
 *     ensure that the playhead is not adjusted too far right.
 * @return {boolean} True if the video's current was clamped, in which case a
 *     'seeking' event will be fired by the video.
 * @private
 */
shaka.player.StreamVideoSource.prototype.clampPlayheadToRight_ = function(
    currentTime, start, end) {
  if (currentTime >= start - shaka.player.StreamVideoSource.SEEK_TOLERANCE_) {
    return false;
  }

  // For live content, if we re-position the playhead too close to the seek
  // start time then we may end up outside of the seek range again, as the seek
  // window may be moving or we may have to buffer after we re-position. So,
  // re-position the playhead ahead of the seek start time to compensate.
  var compensation = 0;
  if (this.manifestInfo.live) {
    compensation = shaka.player.StreamVideoSource.SEEK_OFFSET_;

    // Search all of the streams to see if they have buffered the start time.
    // If one of them hasn't, then add some compensation.
    for (var type in this.streamsByType_) {
      if (!this.streamsByType_[type].isBuffered(start + compensation)) {
        compensation = this.manifestInfo.minBufferTime;
        break;
      }
    }
  }

  this.video.currentTime = Math.min(start + compensation, end);
  return true;
};


/**
 * Clamps the video's current time to the left of the given end time
 * (inclusive).
 *
 * @param {number} currentTime The video's current time.
 * @param {number} end The end time in seconds.
 * @return {boolean} True if the video's current was clamped, in which case a
 *     'seeking' event will be fired by the video.
 * @private
 */
shaka.player.StreamVideoSource.prototype.clampPlayheadToLeft_ = function(
    currentTime, end) {
  if (currentTime <= end + shaka.player.StreamVideoSource.SEEK_TOLERANCE_) {
    return false;
  }

  this.video.currentTime = end;
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
      // Not all streams have ended.
      return;
    }
  }

  this.endOfStream_();
};


/**
 * The buffering start event callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.StreamVideoSource.prototype.onBufferingStart_ = function(event) {
  shaka.asserts.assert(this.manifestInfo.live);

  var ended = shaka.util.MapUtils.values(this.streamsByType_)
      .every(function(stream) { return stream.hasEnded(); });
  if (ended) {
    // We are in a buffering state and all the streams have ended.  We assume
    // that either the manifest does not update or it has updated recently
    // enough to give the newest segments; therefore, we are probably at the
    // end of the live stream.
    shaka.log.info('Possible end of live stream.');
    this.liveEndedTimer_ =
        window.setTimeout(this.endOfStream_.bind(this),
            1000 * this.liveStreamEndTimeout_);
  }
};


/**
 * The buffering end event callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.StreamVideoSource.prototype.onBufferingEnd_ = function(event) {
  shaka.asserts.assert(this.manifestInfo.live);

  if (this.liveEndedTimer_ != null) {
    shaka.log.debug('Not the end of the live stream.');
    window.clearTimeout(this.liveEndedTimer_);
    this.liveEndedTimer_ = null;
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
 * Signals the end of the video.
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.endOfStream_ = function() {
  // |mediaSource| must be in the 'open' state before calling endOfStream().
  shaka.asserts.assert(this.mediaSource.readyState == 'open',
                       'The MediaSource should be in the \'open\' state.');

  // Sanity check: endOfStream() sets the MediaSource's duration to the end of
  // the video's buffered range. However, it should not actually modify the
  // MediaSource's duration (significantly) because the streams' last segments
  // should end very close to the MediaSource's duration.
  // See {@link http://www.w3.org/TR/media-source/#end-of-stream-algorithm}.
  //
  // Note that if the current streams are the initial streams then one of the
  // stream's last segment should end exactly at the MediaSource's duration.
  // However, if this is not the case then either one of the stream's last
  // segment ends after the MediaSource's duration, in which case the append
  // window will cut it off, so the MediaSource's duration won't be modified;
  // or both of the streams' last segments end before the MediaSource's
  // duration, which for well formed content should still not modify the
  // MediaSource's duration.
  if (!COMPILED) {
    var durationBefore = this.mediaSource.duration;
    var durationAfter;
  }

  shaka.log.info('Signalling end-of-stream.');
  this.liveEndedTimer_ = null;
  this.mediaSource.endOfStream();

  if (!COMPILED) {
    var durationAfter = this.mediaSource.duration;
    if (durationAfter != durationBefore) {
      shaka.log.warning(
          'endOfStream() should not modify the MediaSource\'s duration:',
          'before', durationBefore,
          'after', durationAfter,
          'delta', durationAfter - durationBefore);
    }

    var updating = false;
    for (var i = 0; i < this.mediaSource.sourceBuffers.length; ++i) {
      updating = this.mediaSource.sourceBuffers[i].updating;
    }
    shaka.asserts.assert(
        !updating,
        'endOfStream() should not trigger the duration change algorithm.');
  }
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
 * Computes the stream limits, i.e., a stream start time and stream end time,
 * of the given SegmentIndexes. The stream limits define the video's seekable
 * range, so the video's current time should always be within the stream
 * limits.
 *
 * The stream limits are a subset of each individual SegmentIndex's seek range;
 * however, the converse is not true.
 *
 * @param {!Array.<!shaka.media.SegmentIndex>} segmentIndexes
 * @return {?{start: number, end: number, last: number}} The stream limits on
 *     success; otherwise, return null if a stream end time could not be
 *     computed or the streams' media timelines do not intersect.
 * @private
 */
shaka.player.StreamVideoSource.prototype.computeStreamLimits_ = function(
    segmentIndexes) {
  shaka.asserts.assert(this.manifestInfo);

  var startTime = 0;
  var endTime = Number.POSITIVE_INFINITY;
  var lastTime = Number.POSITIVE_INFINITY;

  for (var i = 0; i < segmentIndexes.length; ++i) {
    var seekRange = segmentIndexes[i].getSeekRange();
    startTime = Math.max(startTime, seekRange.start);
    if (seekRange.end != null) {
      endTime = Math.min(endTime, seekRange.end);
    }
    if (segmentIndexes[i].length()) {
      lastTime = Math.min(lastTime, segmentIndexes[i].last().endTime);
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
    shaka.log.debug('The streams\' media timelines do not intersect.');
    return null;
  }

  return { start: startTime, end: endTime, last: lastTime };
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


/**
 * Configures each Stream with |streamConfig_|
 *
 * @private
 */
shaka.player.StreamVideoSource.prototype.configureStreams_ = function() {
  for (var type in this.streamsByType_) {
    var stream = this.streamsByType_[type];
    stream.configure(this.streamConfig_);
  }
};

