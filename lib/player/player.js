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
goog.require('shaka.player.TextStyle');
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
 * @fires shaka.player.StreamVideoSource.SeekRangeChangedEvent
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

  /** @private {number} */
  this.playbackRate_ = 1.0;

  /** @private {!shaka.player.DrmSchemeInfo.Restrictions} */
  this.restrictions_ = new shaka.player.DrmSchemeInfo.Restrictions();

  /** @private {?number} */
  this.playbackStartTime_ = null;
};
goog.inherits(shaka.player.Player, shaka.util.FakeEventTarget);


/**
 * @define {string} A version number taken from git at compile time.
 */
goog.define('GIT_VERSION', 'v1.4.0-debug');


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
      // Fullscreen API.
      !!Element.prototype.requestFullscreen &&
      !!document.exitFullscreen &&
      'fullscreenElement' in document &&
      // Uint8Array is used frequently for parsing binary data
      !!window.Uint8Array;
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
 * Sets style attributes for text tracks.
 *
 * @param {!shaka.player.TextStyle} style
 * @export
 */
shaka.player.Player.setTextStyle = function(style) {
  var element = document.getElementById(shaka.player.Player.STYLE_ELEMENT_ID_);
  if (!element) {
    element = document.createElement('style');
    element.id = shaka.player.Player.STYLE_ELEMENT_ID_;
    document.head.appendChild(element);
  }
  var sheet = element.sheet;

  while (sheet.cssRules.length) {
    sheet.deleteRule(0);
  }
  sheet.insertRule('::cue { ' + style.toCSS() + ' }', 0);
};


/**
 * Destroys the player.
 * @return {!Promise} A promise, resolved when destroy has finished.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 * @export
 */
shaka.player.Player.prototype.destroy = function() {
  return this.unload().then(shaka.util.TypedBind(this, function() {
    this.eventManager_.destroy();
    this.eventManager_ = null;

    this.video_ = null;
  })).catch(function() {});
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

  videoSource.setPlaybackStartTime(this.playbackStartTime_);
  this.playbackStartTime_ = null;

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
      /** @param {*} error */
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
  var elapsed = shaka.timer.get('playing');
  if (!isNaN(elapsed)) {
    this.stats_.logPlayTime(elapsed);
  }
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
    var elapsed = shaka.timer.get('playing');
    if (!isNaN(elapsed)) {
      this.stats_.logPlayTime(elapsed);
      shaka.timer.begin('playing');
    }
  }
  this.stats_.updateVideoStats(this.video_);
  return this.stats_;
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
 * Select a video track by ID.  This can interfere with automatic bitrate
 * adaptation, so you should disable adaptation, via
 * {@link shaka.player.Player#configure}, if you intend to use manual video
 * track selection.
 *
 * @param {number} id The |id| field of the desired VideoTrack object.
 * @param {boolean=} opt_clearBuffer If true (and by default), removes the
 *     previous stream's content before switching to the new stream.
 *
 * @return {boolean} True if the specified VideoTrack was found.
 * @export
 */
shaka.player.Player.prototype.selectVideoTrack = function(id, opt_clearBuffer) {
  if (!this.videoSource_) return false;
  var clearBuffer = (opt_clearBuffer == undefined) ? true : opt_clearBuffer;
  return this.videoSource_.selectVideoTrack(id, clearBuffer);
};


/**
 * Select an audio track by ID.
 *
 * @param {number} id The |id| field of the desired AudioTrack object.
 * @param {boolean=} opt_clearBuffer If true (and by default), removes the
 *     previous stream's content before switching to the new stream.
 *
 * @return {boolean} True if the specified AudioTrack was found.
 * @export
 */
shaka.player.Player.prototype.selectAudioTrack = function(id, opt_clearBuffer) {
  if (!this.videoSource_) return false;
  var clearBuffer = (opt_clearBuffer == undefined) ? true : opt_clearBuffer;
  return this.videoSource_.selectAudioTrack(id, clearBuffer);
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
 * @param {boolean} enabled
 * @export
 * @deprecated Please use configure().
 */
shaka.player.Player.prototype.enableAdaptation = function(enabled) {
  this.configure({'enableAdaptation': enabled});
};


/**
 * @return {boolean} Return true if automatic bitrate adaptation enabled.
 * @export
 * @deprecated Please use getConfiguration().
 */
shaka.player.Player.prototype.getAdaptationEnabled = function() {
  return this.adaptationEnabled_;
};


/**
 * @param {number} bufferSize The stream buffer size in seconds.
 * @export
 * @deprecated Please use configure().
 */
shaka.player.Player.prototype.setStreamBufferSize = function(bufferSize) {
  this.configure({'streamBufferSize': bufferSize});
};


/**
 * Returns the amount of content that streams will buffer, in seconds, after
 * startup.
 *
 * @return {number}
 * @export
 * @deprecated Please use getConfiguration().
 */
shaka.player.Player.prototype.getStreamBufferSize = function() {
  return shaka.media.Stream.bufferSizeSeconds;
};


/**
 * @param {number} timeout Timeout for LicenseRequests in ms.
 * @export
 * @deprecated Please use configure().
 */
shaka.player.Player.prototype.setLicenseRequestTimeout = function(timeout) {
  this.configure({'licenseRequestTimeout': timeout});
};


/**
 * @param {number} timeout Timeout for MpdRequests in ms.
 * @export
 * @deprecated Please use configure().
 */
shaka.player.Player.prototype.setMpdRequestTimeout = function(timeout) {
  this.configure({'mpdRequestTimeout': timeout});
};


/**
 * @param {number} timeout Timeout for RangeRequests in ms.
 * @export
 * @deprecated Please use configure().
 */
shaka.player.Player.prototype.setRangeRequestTimeout = function(timeout) {
  this.configure({'rangeRequestTimeout': timeout});
};


/**
 * @param {string} lang
 * @export
 * @deprecated Please use configure().
 */
shaka.player.Player.prototype.setPreferredLanguage = function(lang) {
  this.configure({'preferredLanguage': lang});
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
  this.playbackRate_ = rate;
};


/**
 * Returns the current playbackRate.
 * @return {number}
 * @export
 */
shaka.player.Player.prototype.getPlaybackRate = function() {
  return this.playbackRate_;
};


/**
 * @param {shaka.player.DrmSchemeInfo.Restrictions} restrictions
 * @export
 * @deprecated Please use configure().
 */
shaka.player.Player.prototype.setRestrictions = function(restrictions) {
  this.configure({'restrictions': restrictions});
};


/**
 * @return {!shaka.player.DrmSchemeInfo.Restrictions}
 *     A copy of the current restrictions object.
 * @export
 * @deprecated Please use getConfiguration().
 */
shaka.player.Player.prototype.getRestrictions = function() {
  return this.restrictions_.clone();
};


/**
 * @param {number} startTime Desired time (in seconds) for playback
 *      to begin from.
 * @export
 */
shaka.player.Player.prototype.setPlaybackStartTime = function(startTime) {
  this.playbackStartTime_ = startTime;
};


/**
 * @return {boolean}
 * @export
 */
shaka.player.Player.prototype.isLive = function() {
  return this.videoSource_ ? this.videoSource_.isLive() : false;
};


/**
 * Configures the Player. Configuration options are set via key-value pairs.
 * <br>
 *
 * The following configuration options are supported:
 * <ul>
 * <li>
 *   enableAdaptation: boolean <br>
 *   Enables or disables automatic bitrate adaptation.
 *
 * <li>
 *   streamBufferSize: number <br>
 *   Sets the amount of content that streams will buffer, in seconds, after
 *   startup. Where startup consists of waiting until the streams have buffered
 *   some minimum amount of content, which is determined by the VideoSource
 *   implementation; for DASH content, the minimum amount of content is equal
 *   to the 'minBufferTime' attribute from the MPD.
 *
 * <li>
 *   licenseRequestTimeout: number <br>
 *   Sets the license request timeout in seconds.
 *
 * <li>
 *   mpdRequestTimeout: number <br>
 *   Sets the MPD request timeout in seconds.
 *
 * <li>
 *   rangeRequestTimeout: number <br>
 *   Sets the range request timeout in seconds. Range requests are used to
 *   fetch metadata and media content.
 *
 * <li>
 *   preferredLanguage: string <br>
 *   Sets the preferred language (the default is 'en'). This affects which
 *   audio and video tracks are initially chosen. <br>
 *   See {@link https://tools.ietf.org/html/rfc5646 IETF RFC 5646}. <br>
 *   See {@link http://www.iso.org/iso/home/standards/language_codes.htm
 *        ISO 639}.
 *
 * <li>
 *   restrictions: shaka.player.DrmSchemeInfo.Restrictions <br>
 *   Sets the content restrictions. For example, if maxBandwidth = 700000 and
 *   minBandwidth = 200000 then playback will be restricted to video tracks
 *   with bandwidths between 700000 and 200000. Note that if the current video
 *   track does not meet the restrictions then the stream will not
 *   automatically switch tracks.
 * </ul>
 *
 * @example
 *     player.configure({'enableAdaptation': false});
 *     player.configure({'preferredLanguage': 'en',
 *                       'streamBufferSize': 15});
 *
 * @param {Object.<string, *>} config A configuration object, which contains
 *     the configuration options as key-value pairs.
 * @export
 */
shaka.player.Player.prototype.configure = function(config) {
  if (!config) return;

  var enableAdaptation = config['enableAdaptation'];
  if (typeof enableAdaptation == 'boolean') {
    this.adaptationEnabled_ = enableAdaptation;
    if (this.videoSource_) {
      this.videoSource_.enableAdaptation(enableAdaptation);
    }
  } else if (enableAdaptation != null) {
    throw new TypeError('\'enableAdaptation\' must be a boolean value.');
  }

  var streamBufferSize = config['streamBufferSize'];
  if (typeof streamBufferSize == 'number' &&
      streamBufferSize >= 0) {
    // TODO: should not be static
    shaka.media.Stream.bufferSizeSeconds = streamBufferSize;
  } else if (streamBufferSize != null) {
    throw new TypeError(
        '\'streamBufferSize\' must be a non-negative number.');
  }

  var licenseRequestTimeout = config['licenseRequestTimeout'];
  if (typeof licenseRequestTimeout == 'number' &&
      licenseRequestTimeout >= 0) {
    // TODO: should not be static
    shaka.util.LicenseRequest.requestTimeoutMs = licenseRequestTimeout;
  } else if (licenseRequestTimeout != null) {
    throw new TypeError(
        '\'licenseRequestTimeout\' must be a non-negative number.');
  }

  var mpdRequestTimeout = config['mpdRequestTimeout'];
  if (typeof mpdRequestTimeout == 'number' &&
      mpdRequestTimeout >= 0) {
    // TODO: should not be static
    shaka.dash.MpdRequest.requestTimeoutMs = mpdRequestTimeout;
  } else if (mpdRequestTimeout != null) {
    throw new TypeError(
        '\'mpdRequestTimeout\' must be a non-negative number.');
  }

  var rangeRequestTimeout = config['rangeRequestTimeout'];
  if (typeof rangeRequestTimeout == 'number' &&
      rangeRequestTimeout >= 0) {
    // TODO: should not be static
    shaka.util.RangeRequest.requestTimeoutMs = rangeRequestTimeout;
  } else if (rangeRequestTimeout != null) {
    throw new TypeError(
        '\'rangeRequestTimeout\' must be a non-negative number.');
  }

  var preferredLanguage = config['preferredLanguage'];
  if (typeof preferredLanguage == 'string') {
    this.lang_ = shaka.util.LanguageUtils.normalize(
        /** @type {string} */ (preferredLanguage));
  } else if (preferredLanguage != null) {
    throw new TypeError('\'preferredLanguage\' must be a string.');
  }

  var restrictions = config['restrictions'];
  if (restrictions instanceof shaka.player.DrmSchemeInfo.Restrictions) {
    this.restrictions_ = restrictions.clone();
    if (this.videoSource_) {
      this.videoSource_.setRestrictions(this.restrictions_);
    }
  } else if (restrictions != null) {
    throw new TypeError('\'restrictions\' must be a Restrictions instance.');
  }
};


/**
 * Gets the Player's configuration.
 *
 * @return {!Object.<string, *>} A configuration object.
 * @see {@link shaka.player.Player#configure}
 * @export
 */
shaka.player.Player.prototype.getConfiguration = function() {
  return {
    'enableAdaptation': this.adaptationEnabled_,
    'streamBufferSize': shaka.media.Stream.bufferSizeSeconds,
    'licenseRequestTimeout': shaka.util.LicenseRequest.requestTimeoutMs,
    'mpdRequestTimeout': shaka.dash.MpdRequest.requestTimeoutMs,
    'rangeRequestTimeout': shaka.util.RangeRequest.requestTimeoutMs,
    'preferredLanguage': this.lang_,
    'restrictions': this.restrictions_.clone()
  };
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


/**
 * The ID of a style element used to control text styles.
 *
 * @private {string}
 * @const
 */
shaka.player.Player.STYLE_ELEMENT_ID_ = 'ShakaPlayerTextStyle';
