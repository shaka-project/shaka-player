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
 * @fileoverview Implements a DASH video source.
 */

goog.provide('shaka.player.DashVideoSource');

goog.require('shaka.asserts');
goog.require('shaka.dash.AbrManager');
goog.require('shaka.dash.DashStream');
goog.require('shaka.dash.DashTextStream');
goog.require('shaka.dash.IDashStream');
goog.require('shaka.dash.MpdProcessor');
goog.require('shaka.dash.MpdRequest');
goog.require('shaka.dash.mpd');
goog.require('shaka.log');
goog.require('shaka.player.AudioTrack');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.player.IVideoSource');
goog.require('shaka.player.VideoTrack');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.EWMABandwidthEstimator');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.TypedBind');



/**
 * Creates a DashVideoSource.
 * @param {string} mpdUrl The MPD URL.
 * @param {shaka.player.DashVideoSource.ContentProtectionCallback}
 *     interpretContentProtection A callback to interpret the ContentProtection
 *     elements in the DASH MPD.
 *
 * @listens shaka.dash.DashStream.EndedEvent
 * @listens shaka.util.IBandwidthEstimator.BandwidthEvent
 *
 * @struct
 * @constructor
 * @implements {shaka.player.IVideoSource}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.player.DashVideoSource = function(mpdUrl, interpretContentProtection) {
  shaka.util.FakeEventTarget.call(this, null);

  /** @private {shaka.dash.mpd.Mpd}. */
  this.mpd_ = null;

  /** @private {string} */
  this.mpdUrl_ = mpdUrl;

  /** @private {!shaka.dash.MpdProcessor} */
  this.processor_ = new shaka.dash.MpdProcessor(interpretContentProtection);

  /** @private {!MediaSource} */
  this.mediaSource_ = new MediaSource();

  /** @private {HTMLVideoElement} */
  this.video_ = null;

  /**
   * The active DASH streams.
   * @private {!Object.<string, !shaka.dash.IDashStream>}
   */
  this.streamsByType_ = {};

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {!shaka.util.PublicPromise} */
  this.attachPromise_ = new shaka.util.PublicPromise();

  /** @private {string} */
  this.lang_ = '';

  /** @private {!shaka.util.IBandwidthEstimator} */
  this.estimator_ = new shaka.util.EWMABandwidthEstimator();
  // TODO(story 1925894): Seed the estimator with data from the previous
  // playback in the same browser session, unless that data is more than 1
  // hour old.

  /** @private {shaka.player.Stats} */
  this.stats_ = null;

  /** @private {!shaka.dash.AbrManager} */
  this.abrManager_ = new shaka.dash.AbrManager(this.estimator_, this);
};
goog.inherits(shaka.player.DashVideoSource, shaka.util.FakeEventTarget);


/**
 * A callback to the application to interpret DASH ContentProtection elements.
 * These elements can contain almost anything and can be highly application-
 * specific, so they cannot (in general) be interpreted by the library.
 *
 * The first parameter is the ContentProtection element.
 * The callback should return a DrmSchemeInfo object if the ContentProtection
 * element is understood by the application, or null otherwise.
 *
 * @typedef {function(!shaka.dash.mpd.ContentProtection):
 *           shaka.player.DrmSchemeInfo}
 * @expose
 */
shaka.player.DashVideoSource.ContentProtectionCallback;


/**
 * Destroys the DashVideoSource.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.player.DashVideoSource.prototype.destroy = function() {
  this.eventManager_.destroy();
  this.eventManager_ = null;

  this.destroyStreams_();
  this.streamsByType_ = null;

  this.video_ = null;
  this.mediaSource_ = null;
  this.processor_ = null;
  this.mpdUrl_ = null;
  this.mpd_ = null;
  this.parent = null;
  this.attachPromise_ = null;
  this.estimator_ = null;
};


/** @override */
shaka.player.DashVideoSource.prototype.attach = function(player, video) {
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
shaka.player.DashVideoSource.prototype.getDrmSchemeInfo = function() {
  if (this.processor_.getNumPeriods() == 0) {
    return null;
  }

  // TODO(story 1890046): Support multiple periods.
  var drmScheme = this.processor_.getDrmScheme(0);

  // Externally unencrypted is signalled by null.
  return (drmScheme && drmScheme.keySystem) ? drmScheme : null;
};


/** @override */
shaka.player.DashVideoSource.prototype.load = function(preferredLanguage) {
  this.lang_ = preferredLanguage;

  var mpdRequest = new shaka.dash.MpdRequest(this.mpdUrl_);
  return mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        if (mpd.periods.length == 0) {
          var error = new Error('Unplayable MPD: no periods.');
          error.type = 'mpd';
          return Promise.reject(error);
        }

        this.processor_.process(mpd);
        this.mpd_ = mpd;

        // TODO(story 1890046): Support multiple periods.
        if ((this.processor_.getNumPeriods() == 0) ||
            (this.processor_.getAdaptationSets(0).length == 0)) {
          var error = new Error(
              'This content cannot be displayed on this browser/platform.');
          error.type = 'mpd';
          return Promise.reject(error);
        }

        return Promise.resolve();
      })
  );
};


/** @override */
shaka.player.DashVideoSource.prototype.getVideoTracks = function() {
  if (this.processor_.getNumPeriods() == 0) {
    return [];
  }

  var stream = this.streamsByType_['video'];
  var activeRepresentation = stream ? stream.getRepresentation() : null;
  var activeId = activeRepresentation ? activeRepresentation.uniqueId : 0;

  /** @type {!Array.<!shaka.player.VideoTrack>} */
  var tracks = [];

  // TODO(story 1890046): Support multiple periods.
  var adaptationSets = this.processor_.getAdaptationSets(0, 'video');

  for (var i = 0; i < adaptationSets.length; ++i) {
    var adaptationSet = adaptationSets[i];

    for (var j = 0; j < adaptationSet.representations.length; ++j) {
      var representation = adaptationSet.representations[j];

      var id = representation.uniqueId;
      var bandwidth = representation.bandwidth;
      var width = representation.width;
      var height = representation.height;

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
shaka.player.DashVideoSource.prototype.getAudioTracks = function() {
  if (this.processor_.getNumPeriods() == 0) {
    return [];
  }

  var stream = this.streamsByType_['audio'];
  var activeRepresentation = stream ? stream.getRepresentation() : null;
  var activeId = activeRepresentation ? activeRepresentation.uniqueId : 0;

  /** @type {!Array.<!shaka.player.AudioTrack>} */
  var tracks = [];

  // TODO(story 1890046): Support multiple periods.
  var adaptationSets = this.processor_.getAdaptationSets(0, 'audio');

  for (var i = 0; i < adaptationSets.length; ++i) {
    var adaptationSet = adaptationSets[i];
    var lang = adaptationSet.lang;

    for (var j = 0; j < adaptationSet.representations.length; ++j) {
      var representation = adaptationSet.representations[j];

      var id = representation.uniqueId;
      var bandwidth = representation.bandwidth;

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
shaka.player.DashVideoSource.prototype.getTextTracks = function() {
  if (this.processor_.getNumPeriods() == 0) {
    return [];
  }

  var stream = this.streamsByType_['text'];
  var activeRepresentation = stream ? stream.getRepresentation() : null;
  var activeId = activeRepresentation ? activeRepresentation.uniqueId : 0;

  /** @type {!Array.<!shaka.player.TextTrack>} */
  var tracks = [];

  // TODO(story 1890046): Support multiple periods.
  var adaptationSets = this.processor_.getAdaptationSets(0, 'text');

  for (var i = 0; i < adaptationSets.length; ++i) {
    var adaptationSet = adaptationSets[i];
    var lang = adaptationSet.lang;

    for (var j = 0; j < adaptationSet.representations.length; ++j) {
      var representation = adaptationSet.representations[j];

      var id = representation.uniqueId;
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
shaka.player.DashVideoSource.prototype.getResumeThreshold = function() {
  return this.mpd_.minBufferTime;
};


/** @override */
shaka.player.DashVideoSource.prototype.selectVideoTrack =
    function(id, immediate) {
  return this.selectTrack_('video', id, immediate);
};


/** @override */
shaka.player.DashVideoSource.prototype.selectAudioTrack =
    function(id, immediate) {
  return this.selectTrack_('audio', id, immediate);
};


/** @override */
shaka.player.DashVideoSource.prototype.selectTextTrack =
    function(id, immediate) {
  return this.selectTrack_('text', id, immediate);
};


/** @override */
shaka.player.DashVideoSource.prototype.enableTextTrack = function(enabled) {
  var textStream = this.streamsByType_['text'];
  if (textStream) {
    textStream.setEnabled(enabled);
  }
};


/** @override */
shaka.player.DashVideoSource.prototype.enableAdaptation = function(enabled) {
  this.abrManager_.enable(enabled);
};


/** @override */
shaka.player.DashVideoSource.prototype.setRestrictions =
    function(restrictions) {
  shaka.asserts.assert(this.mpd_);
  if (this.mpd_) {
    this.processor_.enforceRestrictions(this.mpd_, restrictions);
  }
};


/**
 * Select a track by ID.
 *
 * @param {string} type The type of track to change, such as 'video', 'audio',
 *     or 'text'.
 * @param {number} id The |uniqueId| field of the desired representation.
 * @param {boolean} immediate If true, switch immediately.
 *
 * @return {boolean} True if the specified track was found.
 * @private
 */
shaka.player.DashVideoSource.prototype.selectTrack_ =
    function(type, id, immediate) {
  if (this.processor_.getNumPeriods() == 0) {
    return false;
  }
  if (!this.streamsByType_[type]) {
    return false;
  }

  // TODO(story 1890046): Support multiple periods.
  var adaptationSets = this.processor_.getAdaptationSets(0, type);

  for (var i = 0; i < adaptationSets.length; ++i) {
    var adaptationSet = adaptationSets[i];
    for (var j = 0; j < adaptationSet.representations.length; ++j) {
      var representation = adaptationSet.representations[j];
      if (representation.uniqueId == id) {
        this.stats_.logRepresentationChange(representation);
        this.streamsByType_[type].switch(representation, immediate);
        return true;
      }
    }
  }

  return false;
};


/**
 * MediaSource callback.
 *
 * @param {!Event} event The MediaSource event.
 * @private
 */
shaka.player.DashVideoSource.prototype.onMediaSourceOpen_ =
    function(event) {
  shaka.asserts.assert(this.mpd_ != null);
  shaka.asserts.assert(this.mediaSource_.sourceBuffers.length == 0);
  shaka.asserts.assert(this.mpd_.periods.length != 0);

  this.eventManager_.unlisten(this.mediaSource_, 'sourceopen');

  // TODO(story 1890046): Support multiple periods.
  var duration = this.mpd_.periods[0].duration || this.mpd_.duration;
  shaka.asserts.assert(duration != null);
  this.mediaSource_.duration = /** @type {number} */ (duration);

  shaka.asserts.assert(this.processor_.getNumPeriods() > 0);
  var adaptationSets = this.processor_.selectAdaptationSets(0, this.lang_);

  /** @type {!Object.<string, !shaka.dash.mpd.Representation>} */
  var representationsByType = {};

  // Create DASH streams.
  for (var i = 0; i < adaptationSets.length; ++i) {
    var adaptationSet = adaptationSets[i];
    var contentType = adaptationSet.contentType || '';

    // Start by assuming we will use the first Representation.
    var representation = adaptationSet.representations[0];
    if (contentType == 'video') {
      // Ask AbrManager which video Representation to start with.
      var trackId = this.abrManager_.getInitialVideoTrackId();
      shaka.asserts.assert(trackId != null);
      var found = false;
      for (var j = 0; j < adaptationSet.representations.length; ++j) {
        representation = adaptationSet.representations[j];
        if (representation.uniqueId == trackId) {
          found = true;
          break;
        }
      }
      shaka.asserts.assert(found);
    } else if (contentType == 'audio') {
      // In lieu of audio adaptation, choose the middle representation from
      // the audio adaptation set.  If we have high, medium, and low quality
      // audio, this is medium.  If we only have high and low, this is high.
      var length = adaptationSet.representations.length;
      var index = Math.floor(length / 2);
      representation = adaptationSet.representations[index];
    }

    // Log the initial representation choice.
    this.stats_.logRepresentationChange(representation);

    var mimeType =
        shaka.dash.MpdProcessor.representationMimeType(representation);
    var stream = (contentType == 'text') ? this.createTextStream_() :
                                           this.createStream_(mimeType);
    if (!stream) {
      // An error has already been dispatched and the promise rejected.
      return;
    }
    this.streamsByType_[contentType] = stream;
    representationsByType[contentType] = representation;
  }

  // Start DASH streams.
  for (var type in this.streamsByType_) {
    this.eventManager_.listen(
        this.streamsByType_[type],
        'ended',
        this.onStreamEnded_.bind(this));
    var representation = representationsByType[type];
    this.streamsByType_[type].start(representation);
  }

  // Assume subs will be needed.
  var subsNeeded = true;

  // If there is an audio track, and the language matches the user's
  // preference, then subtitles are not needed.
  var audioRepresentation = representationsByType['audio'];
  if (audioRepresentation) {
    // If the MPD did not specify a language, assume it is the right one.
    // This means that content creators who omit language because they serve a
    // monolingual demographic will not have annoyed users who have to disable
    // subtitles every single time they play a video.
    var lang = audioRepresentation.lang || this.lang_;

    // Alias.
    var LanguageUtils = shaka.util.LanguageUtils;
    if (LanguageUtils.match(LanguageUtils.MatchType.MAX, this.lang_, lang)) {
      // It's a match, so subs are not needed.
      subsNeeded = false;
    }
  }

  // Enable the subtitle display by default iff the subs are needed.
  this.enableTextTrack(subsNeeded);

  this.attachPromise_.resolve();
};


/**
 * Creates a DashStream object.
 *
 * @param {string} mimeType
 * @return {shaka.dash.DashStream} or null on failure.
 * @private
 */
shaka.player.DashVideoSource.prototype.createStream_ = function(mimeType) {
  // Create source buffer.
  var buf;
  try {
    buf = this.mediaSource_.addSourceBuffer(mimeType);
    shaka.asserts.assert(buf != null);
  } catch (exception) {
    this.destroyStreams_();
    var error = new Error('Failed to create DASH stream for ' + mimeType + '.');
    error.type = 'dash';
    error.exception = exception;
    this.attachPromise_.reject(error);
    return null;
  }

  // Create stream.
  return new shaka.dash.DashStream(
      this,
      /** @type {!HTMLVideoElement} */ (this.video_),
      this.mediaSource_,
      /** @type {!SourceBuffer} */ (buf),
      this.estimator_);
};


/**
 * Creates a DashTextStream object.
 *
 * @return {!shaka.dash.DashTextStream}
 * @private
 */
shaka.player.DashVideoSource.prototype.createTextStream_ = function() {
  var video = /** @type {!HTMLVideoElement} */ (this.video_);
  return new shaka.dash.DashTextStream(this, video);
};


/**
 * Destroy all streams.
 *
 * @private
 */
shaka.player.DashVideoSource.prototype.destroyStreams_ = function() {
  for (var type in this.streamsByType_) {
    this.streamsByType_[type].destroy();
  }
  this.streamsByType_ = {};
};


/**
 * DashStream EOF callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.DashVideoSource.prototype.onStreamEnded_ = function(event) {
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
shaka.player.DashVideoSource.prototype.onSeeking_ = function(event) {
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
shaka.player.DashVideoSource.prototype.onBandwidth_ = function(event) {
  this.stats_.logBandwidth(this.estimator_.getBandwidth());
};

