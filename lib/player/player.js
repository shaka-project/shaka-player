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
 * @fileoverview Implements the player.
 */

goog.provide('shaka.player.Player');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.EmeManager');
goog.require('shaka.player.AudioTrack');
goog.require('shaka.player.Stats');
goog.require('shaka.player.TextTrack');
goog.require('shaka.player.VideoTrack');
goog.require('shaka.timer');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.LanguageUtils');


/**
 * @event shaka.player.Player.ErrorEvent
 * @description Fired when a playback error occurs.
 *     Bubbles up through the Player.
 * @property {string} type 'error'
 * @property {boolean} bubbles true
 * @property {!Error} detail An object which contains details on the error.
 *    The error's 'type' property will help you identify the specific error
 *    condition and display an appropriate message or error indicator to the
 *    user.  The error's 'message' property contains English text which can
 *    be useful during debugging.
 * @export
 */


/**
 * @event shaka.player.Player.BufferingEvent
 * @description Fired when the player's buffering state changes.
 * @property {string} type 'bufferingStart' or 'bufferingEnd'
 * @export
 */



/**
 * Creates a Player.
 *
 * @param {!HTMLVideoElement} video The video element.
 *
 * @fires shaka.media.Stream.AdaptationEvent
 * @fires shaka.player.Player.BufferingEvent
 * @fires shaka.player.Player.ErrorEvent
 *
 * @constructor
 * @struct
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.player.Player = function(video) {
  shaka.util.FakeEventTarget.call(this, null);

  /**
   * The video element.
   * @private {!HTMLVideoElement}
   */
  this.video_ = video;

  /**
   * The video source object.
   * @private {shaka.player.IVideoSource}
   */
  this.videoSource_ = null;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {shaka.media.EmeManager} */
  this.emeManager_ = null;

  /** @private {string} */
  this.lang_ = 'en';

  /** @private {?number} */
  this.rewindTimer_ = null;

  /** @private {?number} */
  this.watchdogTimer_ = null;

  /** @private {boolean} */
  this.buffering_ = false;

  /** @private {!shaka.player.Stats} */
  this.stats_ = new shaka.player.Stats;

  /** @private {boolean} */
  this.adaptationEnabled_ = true;

  /** @private {!shaka.player.DrmSchemeInfo.Restrictions} */
  this.restrictions_ = new shaka.player.DrmSchemeInfo.Restrictions();
};
goog.inherits(shaka.player.Player, shaka.util.FakeEventTarget);


/**
 * @define {string} A version number taken from git at compile time.
 */
goog.define('GIT_VERSION', 'v1.3.0-debug');


/**
 * @const {string}
 * @export
 */
shaka.player.Player.version = GIT_VERSION;


/**
 * Determines if the browser has all of the necessary APIs to support the Shaka
 * Player.  This check may not pass if polyfills have not been installed.
 *
 * @return {boolean}
 * @export
 */
shaka.player.Player.isBrowserSupported = function() {
  return true &&
      // MSE is needed for adaptive streaming.
      !!window.MediaSource &&
      // EME is needed for protected content.
      !!window.MediaKeys &&
      // Indicates recent EME APIs.
      !!window.navigator &&
      !!window.navigator.requestMediaKeySystemAccess &&
      !!window.MediaKeySystemAccess &&
      !!window.MediaKeySystemAccess.prototype.getConfiguration &&
      // Promises are used frequently for asynchronous operations.
      !!window.Promise &&
      // Playback quality metrics used by Player.getStats().
      !!HTMLVideoElement.prototype.getVideoPlaybackQuality &&
      // Fullscreen API.
      !!Element.prototype.requestFullscreen &&
      !!document.exitFullscreen &&
      'fullscreenElement' in document &&
      // Node.children is used by mpd_parser.js, and body is a Node instance.
      !!document.body.children;
};


/**
 * Determines if the specified MIME type and codec is supported by the browser.
 *
 * @param {string} fullMimeType A MIME type, which should include codec info.
 * @return {boolean} true if the type is supported.
 * @export
 */
shaka.player.Player.isTypeSupported = function(fullMimeType) {
  var supported;

  if (fullMimeType == 'text/vtt') {
    supported = !!window.VTTCue;
  } else {
    supported = MediaSource.isTypeSupported(fullMimeType);
  }

  shaka.log.info('+', fullMimeType, supported ? 'is' : 'is not', 'supported');
  return supported;
};


/**
 * Destroys the player.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 * @export
 */
shaka.player.Player.prototype.destroy = function() {
  this.unload().catch(function() {});

  this.eventManager_.destroy();
  this.eventManager_ = null;

  this.video_ = null;
};


/**
 * Stop playback and unload the current video source.  Makes the player ready
 * for reuse.  Also resets any statistics gathered.
 *
 * MediaKeys must be unloaded asynchronously, but all other resources are
 * removed synchronously.
 *
 * @return {!Promise} A promise, resolved when MediaKeys is removed.
 * @export
 */
shaka.player.Player.prototype.unload = function() {
  if (!this.videoSource_) {
    // Nothing to unload.
    return Promise.resolve();
  }

  if (this.buffering_) {
    this.endBufferingState_();
  }
  // Stop playback.
  this.video_.pause();

  // Stop listening for events and timers.
  this.eventManager_.removeAll();
  this.cancelWatchdogTimer_();
  this.cancelRewindTimer_();

  // Release all EME resources.
  this.emeManager_.destroy();
  this.emeManager_ = null;

  // Remove the video source.
  this.video_.src = '';
  // Only clear mediaKeys after clearing the source.
  var p = this.video_.setMediaKeys(null);
  if (this.videoSource_) {
    this.videoSource_.destroy();
    this.videoSource_ = null;
  }

  // Reset state.
  this.buffering_ = false;
  this.stats_ = new shaka.player.Stats;

  return p;
};


/**
 * Loads the specified video source and starts playback.  If a video source has
 * already been loaded, this calls unload() for you before loading the new
 * source.
 *
 * @param {!shaka.player.IVideoSource} videoSource The IVideoSource object. The
 *     Player takes ownership of |videoSource|.
 * @return {!Promise}
 * @export
 */
shaka.player.Player.prototype.load = function(videoSource) {
  var p = this.unload();
  shaka.asserts.assert(this.videoSource_ == null);
  shaka.asserts.assert(this.emeManager_ == null);

  if (this.video_.autoplay) {
    shaka.timer.begin('load');
    this.eventManager_.listen(this.video_, 'timeupdate',
                              this.onFirstTimestamp_.bind(this));
  }

  // Sync adaptation setting, which could have been set before this source was
  // loaded.
  videoSource.enableAdaptation(this.adaptationEnabled_);

  return p.then(shaka.util.TypedBind(this,
      function() {
        return videoSource.load(this.lang_);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        this.videoSource_ = videoSource;
        this.videoSource_.setRestrictions(this.restrictions_);
        this.emeManager_ = new shaka.media.EmeManager(
            this, this.video_, this.videoSource_);
        return this.emeManager_.initialize();
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        this.setVideoEventListeners_();
        return this.videoSource_.attach(this, this.video_);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        this.startWatchdogTimer_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        // We own the source now, so we must clean it up.
        // We may not have set the source on this, so call destroy on the local
        // var instead.
        videoSource.destroy();

        // Since we may have set the source on this, set it to null.
        this.videoSource_ = null;

        if (this.emeManager_) {
          this.emeManager_.destroy();
          this.emeManager_ = null;
        }

        // Even though we return a rejected promise, we still want to dispatch
        // an error event to ensure that the application is aware of all errors
        // from the player.
        var event = shaka.util.FakeEvent.createErrorEvent(error);
        this.dispatchEvent(event);

        return Promise.reject(error);
      })
  );
};


/**
 * Sets the video's event listeners.
 *
 * @private
 */
shaka.player.Player.prototype.setVideoEventListeners_ = function() {
  this.eventManager_.listen(this.video_, 'error', this.onError_.bind(this));
  this.eventManager_.listen(this.video_, 'playing', this.onPlaying_.bind(this));
  this.eventManager_.listen(this.video_, 'pause', this.onPause_.bind(this));
};


/**
 * Time update event handler.  Will be removed once the first update is seen.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onFirstTimestamp_ = function(event) {
  shaka.timer.end('load');
  this.stats_.logPlaybackLatency(shaka.timer.get('load'));
  this.eventManager_.unlisten(this.video_, 'timeupdate');
};


/**
 * Video error event handler.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onError_ = function(event) {
  if (!this.video_.error) {
    // This occurred during testing with prefixed EME.  Ignore errors we can't
    // interpret, on the assumption that this is a browser bug.
    shaka.log.debug('Uninterpretable error event!', event);
    return;
  }

  var code = this.video_.error.code;
  if (code == MediaError['MEDIA_ERR_ABORTED']) {
    // Ignore this error code, which should only occur when navigating away or
    // deliberately stopping playback of HTTP content.
    return;
  }

  shaka.log.debug('onError_', event, code);
  var message = shaka.player.Player.MEDIA_ERROR_MAP_[code] ||
                'Unknown playback error.';

  var error = new Error(message);
  error.type = 'playback';
  var event = shaka.util.FakeEvent.createErrorEvent(error);
  this.dispatchEvent(event);
};


/**
 * Video playing event handler.  Fires any time the video starts playing.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onPlaying_ = function(event) {
  shaka.log.debug('onPlaying_', event);
  shaka.timer.begin('playing');

  if (this.buffering_) {
    this.endBufferingState_();
  }
};


/**
 * Video pause event handler.  Fires any time the video stops for any reason,
 * including before a 'seeking' or 'ended' event.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onPause_ = function(event) {
  shaka.log.debug('onPause_', event);
  shaka.timer.end('playing');
  this.stats_.logPlayTime(shaka.timer.get('playing'));
};


/**
 * Gets updated stats about the player.
 *
 * @return {!shaka.player.Stats}
 * @export
 */
shaka.player.Player.prototype.getStats = function() {
  if (!this.video_.paused) {
    // Update play time, which is still progressing.
    shaka.timer.end('playing');
    this.stats_.logPlayTime(shaka.timer.get('playing'));
    shaka.timer.begin('playing');
  }
  this.stats_.updateVideoStats(this.video_);
  return this.stats_;
};


/**
 * Gets the current video resolution. Returns null if the current video
 * resolution could not be determined. Note that this represents the state of
 * decode and rendering, and thus may lag behind the selected track or the
 * data in shaka.dash.DashStream.AdaptationEvent.
 *
 * @return {?{width: number, height: number}}
 * @export
 * @deprecated Please use video.videoWidth / video.videoHeight directly.
 */
shaka.player.Player.prototype.getCurrentResolution = function() {
  var width = this.video_.videoWidth;
  var height = this.video_.videoHeight;

  if (width && height) {
    return { width: width, height: height };
  } else {
    return null;
  }
};


/**
 * Gets the available video tracks.
 *
 * @return {!Array.<!shaka.player.VideoTrack>}
 * @export
 */
shaka.player.Player.prototype.getVideoTracks = function() {
  if (!this.videoSource_) return [];
  return this.videoSource_.getVideoTracks();
};


/**
 * Gets the available audio tracks.
 *
 * @return {!Array.<!shaka.player.AudioTrack>}
 * @export
 */
shaka.player.Player.prototype.getAudioTracks = function() {
  if (!this.videoSource_) return [];
  return this.videoSource_.getAudioTracks();
};


/**
 * Gets the available text tracks.
 *
 * @return {!Array.<!shaka.player.TextTrack>}
 * @export
 */
shaka.player.Player.prototype.getTextTracks = function() {
  if (!this.videoSource_) return [];
  return this.videoSource_.getTextTracks();
};


/**
 * Select a video track by ID.  This can interfere with automatic adaptation,
 * so you should call {@link shaka.player.Player#enableAdaptation}(false) if
 * you intend to switch to manual video track selection.
 *
 * @param {number} id The |id| field of the desired VideoTrack object.
 * @param {boolean=} opt_immediate If true, switch immediately.  Otherwise,
 *     switch when convenient.  Defaults to true.
 *
 * @return {boolean} True if the specified VideoTrack was found.
 * @export
 */
shaka.player.Player.prototype.selectVideoTrack = function(id, opt_immediate) {
  if (!this.videoSource_) return false;
  var immediate = (opt_immediate == undefined) ? true : opt_immediate;
  return this.videoSource_.selectVideoTrack(id, immediate);
};


/**
 * Select an audio track by ID.
 *
 * @param {number} id The |id| field of the desired AudioTrack object.
 *
 * @return {boolean} True if the specified AudioTrack was found.
 * @export
 */
shaka.player.Player.prototype.selectAudioTrack = function(id) {
  if (!this.videoSource_) return false;
  return this.videoSource_.selectAudioTrack(id, false);
};


/**
 * Select a text track by ID.
 *
 * @param {number} id The |id| field of the desired TextTrack object.
 *
 * @return {boolean} True if the specified TextTrack was found.
 * @export
 */
shaka.player.Player.prototype.selectTextTrack = function(id) {
  if (!this.videoSource_) return false;
  return this.videoSource_.selectTextTrack(id, false);
};


/**
 * Enable or disable the text track.  Has no effect if called before
 * load() resolves.
 *
 * @param {boolean} enabled
 * @export
 */
shaka.player.Player.prototype.enableTextTrack = function(enabled) {
  if (!this.videoSource_) return;
  this.videoSource_.enableTextTrack(enabled);
};


/**
 * Enable or disable automatic bitrate adaptation.  May be called at any time.
 *
 * @param {boolean} enabled
 * @export
 */
shaka.player.Player.prototype.enableAdaptation = function(enabled) {
  this.adaptationEnabled_ = enabled;
  if (this.videoSource_) {
    this.videoSource_.enableAdaptation(enabled);
  }
};


/**
 * @return {boolean} Return true if automatic bitrate adaptation enabled.
 * @export
 */
shaka.player.Player.prototype.getAdaptationEnabled = function() {
  return this.adaptationEnabled_;
};


/**
 * @return {number} Current playback time in seconds.
 * @export
 * @deprecated Please use video.currentTime directly.
 */
shaka.player.Player.prototype.getCurrentTime = function() {
  return this.video_.currentTime;
};


/**
 * @return {number} Video duration in seconds.
 * @export
 * @deprecated Please use video.duration directly.
 */
shaka.player.Player.prototype.getDuration = function() {
  return this.video_.duration;
};


/**
 * @return {boolean} True if the video is muted.
 * @export
 * @deprecated Please use video.muted directly.
 */
shaka.player.Player.prototype.getMuted = function() {
  return this.video_.muted;
};


/**
 * @return {number} The video volume, between 0 and 1.
 * @export
 * @deprecated Please use video.volume directly.
 */
shaka.player.Player.prototype.getVolume = function() {
  return this.video_.volume;
};


/**
 * Play the video.  Will reset the playback rate to 1.0 as well.
 * @export
 * @deprecated Please use video.play() directly.
 */
shaka.player.Player.prototype.play = function() {
  this.setPlaybackRate(1.0);
  this.video_.play();
};


/**
 * Pause the video.
 * @export
 * @deprecated Please use video.pause() directly.
 */
shaka.player.Player.prototype.pause = function() {
  this.video_.pause();
};


/**
 * Make the video go full-screen.
 * For security reasons, only works from an event handler for user input.
 * @export
 * @deprecated Please use video.requestFullscreen() directly.
 */
shaka.player.Player.prototype.requestFullscreen = function() {
  this.video_.requestFullscreen();
};


/**
 * @param {number} seconds The desired playback position in seconds.
 * @export
 * @deprecated Please use video.currentTime directly.
 */
shaka.player.Player.prototype.seek = function(seconds) {
  this.video_.currentTime = seconds;
};


/**
 * @param {boolean} on True to mute the video, false to unmute the video.
 * @export
 * @deprecated Please use video.muted directly.
 */
shaka.player.Player.prototype.setMuted = function(on) {
  this.video_.muted = on;
};


/**
 * @param {number} level The video volume, between 0 and 1.
 * @export
 * @deprecated Please use video.volume directly.
 */
shaka.player.Player.prototype.setVolume = function(level) {
  this.video_.volume = level;
};


/**
 * @param {string} lang The user's preferred language tag.  If not set,
 *     defaults to 'en'.  This setting will affect the initial tracks chosen by
 *     subsequent calls to Player.load().
 * @see IETF RFC 5646
 * @see ISO 639
 * @export
 */
shaka.player.Player.prototype.setPreferredLanguage = function(lang) {
  // Normalize the language tag.
  this.lang_ = shaka.util.LanguageUtils.normalize(lang);
};


/**
 * @param {number} rate The playback rate.
 *     Negative values will rewind the video.
 *     Positive values less than 1.0 will trigger slow-motion playback.
 *     Positive values greater than 1.0 will trigger fast-forward.
 *     0.0 is similar to pausing the video.
 *     Some UAs will not play audio at rates less than 0.25 or 0.5 or greater
 *     than 4.0 or 5.0, but this behavior is not specified.
 *     No audio will be played while rewinding.
 * @export
 */
shaka.player.Player.prototype.setPlaybackRate = function(rate) {
  // Cancel any rewind we might be in the middle of.
  this.cancelRewindTimer_();

  if (rate >= 0) {
    // Slow-mo or fast-forward are handled natively by the UA.
    this.video_.playbackRate = rate;
  } else {
    // Rewind is not supported by any UA to date (2015), so we fake it.
    // http://crbug.com/33099
    this.video_.playbackRate = 0;
    this.onRewindTimer_(this.video_.currentTime, Date.now(), rate);
  }
};


/**
 * @param {shaka.player.DrmSchemeInfo.Restrictions} restrictions
 *     Restrictions object instance with custom restricions.
 *     For example: A Restrictions instance with maxBandwidth = 700000
 *     and minBandwidth = 200000 will restrict
 *     playback to video tracks with bandwidth between 700000 and 200000.
 * @throws {TypeError} if restrictions argument isn't a Restrictions instance.
 * @export
 */
shaka.player.Player.prototype.setRestrictions = function(restrictions) {
  if (!(restrictions instanceof shaka.player.DrmSchemeInfo.Restrictions)) {
    throw new TypeError('Argument must be a Restrictions instance.');
  }
  this.restrictions_ = restrictions.clone();
  if (this.videoSource_)
    this.videoSource_.setRestrictions(this.restrictions_);
};


/**
 * @return {!shaka.player.DrmSchemeInfo.Restrictions}
 *     A copy of the current restrictions object.
 * @export
 */
shaka.player.Player.prototype.getRestrictions = function() {
  return this.restrictions_.clone();
};


/**
 * @return {boolean}
 * @export
 */
shaka.player.Player.prototype.isLive = function() {
  return this.videoSource_ ? this.videoSource_.isLive() : false;
};


/**
 * Cancels the rewind timer, if any.
 * @private
 */
shaka.player.Player.prototype.cancelRewindTimer_ = function() {
  if (this.rewindTimer_) {
    window.clearTimeout(this.rewindTimer_);
    this.rewindTimer_ = null;
  }
};


/**
 * Starts the watchdog timer.
 * @private
 */
shaka.player.Player.prototype.startWatchdogTimer_ = function() {
  this.cancelWatchdogTimer_();
  this.watchdogTimer_ =
      window.setTimeout(this.onWatchdogTimer_.bind(this), 100);
};


/**
 * Cancels the watchdog timer, if any.
 * @private
 */
shaka.player.Player.prototype.cancelWatchdogTimer_ = function() {
  if (this.watchdogTimer_) {
    window.clearTimeout(this.watchdogTimer_);
    this.watchdogTimer_ = null;
  }
};


/**
 * Called on a recurring timer to simulate rewind.
 * @param {number} startVideoTime
 * @param {number} startWallTime
 * @param {number} rate
 * @private
 */
shaka.player.Player.prototype.onRewindTimer_ =
    function(startVideoTime, startWallTime, rate) {
  shaka.asserts.assert(rate < 0);
  var offset = ((Date.now() - startWallTime) / 1000) * rate;
  this.video_.currentTime = startVideoTime + offset;

  var callback = this.onRewindTimer_.bind(
      this, startVideoTime, startWallTime, rate);
  this.rewindTimer_ = window.setTimeout(callback, 100);
};


/**
 * Called to enter a buffering state.
 * @private
 */
shaka.player.Player.prototype.enterBufferingState_ = function() {
  this.buffering_ = true;
  this.video_.pause();
  this.stats_.logBufferingEvent();
  shaka.timer.begin('buffering');
  shaka.log.debug('Buffering...');
  this.dispatchEvent(shaka.util.FakeEvent.create({type: 'bufferingStart'}));
};


/**
 * Called to leave a buffering state, either due to unloading a video source,
 * unpausing a video, or because of the watchdog's decision.
 * @private
 */
shaka.player.Player.prototype.endBufferingState_ = function() {
  shaka.asserts.assert(this.buffering_);
  shaka.log.debug('Buffering complete.');
  shaka.timer.end('buffering');
  this.stats_.logBufferingTime(shaka.timer.get('buffering'));
  this.buffering_ = false;
  this.dispatchEvent(shaka.util.FakeEvent.create({type: 'bufferingEnd'}));
};


/**
 * Called on a recurring timer to detect buffering events.
 * @private
 */
shaka.player.Player.prototype.onWatchdogTimer_ = function() {
  this.startWatchdogTimer_();

  if (this.video_.ended || this.video_.seeking) return;

  var buffered = this.video_.buffered;
  // Counter-intuitively, the play head can advance audio-only while video is
  // buffering.  |buffered| will show the intersection of buffered ranges for
  // both audio and video, so this is an accurate way to sense that we are
  // buffering.  The 'stalled', 'waiting', and 'suspended' events do not work
  // for this purpose as of Chrome 38.  Nor will video.readyState.
  var bufferEnd = buffered.length ? buffered.end(buffered.length - 1) : 0;
  var buffered = bufferEnd - this.video_.currentTime;
  var threshold = shaka.player.Player.UNDERFLOW_THRESHOLD_;
  var fudgedBufferEnd = bufferEnd + shaka.player.Player.BUFFERED_FUDGE_FACTOR_;

  if (!this.buffering_) {
    // Don't go into a buffering state while paused or when at the end of the
    // video.
    if ((fudgedBufferEnd < this.video_.duration && buffered < threshold) &&
        !this.video_.paused) {
      this.enterBufferingState_();
    }
  } else {
    var resumeThreshold = this.videoSource_.getResumeThreshold();
    shaka.asserts.assert(resumeThreshold > 0);
    if (buffered > resumeThreshold) {
      this.endBufferingState_();
      this.video_.play();
    }
  }
};


/**
 * The threshold for underflow, in seconds.  If there is less than this amount
 * of data buffered, we will consider the player to be out of data.
 *
 * @private {number}
 * @const
 */
shaka.player.Player.UNDERFLOW_THRESHOLD_ = 0.1;


/**
 * A fudge factor applied to buffered ranges to determine if the end of the
 * video is buffered.
 *
 * @private {number}
 * @const
 */
shaka.player.Player.BUFFERED_FUDGE_FACTOR_ = 0.05;


/**
 * A map of MediaError codes to error messages.  The JS interpreter won't take
 * a symbolic name as a key, so the symbolic names for these error codes appear
 * in comments after the number.
 *
 * @private {!Object.<number, string>}
 * @const
 */
shaka.player.Player.MEDIA_ERROR_MAP_ = {
  // This should not occur for DASH sources, but may occur for HTTP sources.
  2: // MediaError.MEDIA_ERR_NETWORK
      'A network failure occured while loading media content.',

  3: // MediaError.MEDIA_ERR_DECODE
      'The browser failed to decode the media content.',

  // This is also unlikely for DASH sources, but HTTP sources do not check
  // browser support before beginning playback.
  4: // MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
      'The browser does not support the media content.'
};

