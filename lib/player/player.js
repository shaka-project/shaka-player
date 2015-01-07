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
goog.require('shaka.player.AudioTrack');
goog.require('shaka.player.Stats');
goog.require('shaka.player.TextTrack');
goog.require('shaka.player.VideoTrack');
goog.require('shaka.timer');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.LicenseRequest');
goog.require('shaka.util.StringUtils');


/**
 * @event shaka.player.Player.ErrorEvent
 * @description Fired when a playback error occurs.
 *     Bubbles up through the Player.
 * @property {string} type 'error'
 * @property {boolean} bubbles true
 * @property {!Error} detail An object which contains details on the error.
 * @export
 */



/**
 * Creates a Player.
 *
 * @param {!HTMLVideoElement} video The video element.
 *
 * @fires shaka.player.Player.ErrorEvent
 * @fires shaka.dash.DashStream.AdaptationEvent
 *
 * @constructor
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

  /**
   * The MediaKeys object, non-null if using the OO EME API, null otherwise.
   * @private {MediaKeys}
   */
  this.mediaKeys_ = null;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {!Object.<string, boolean>} */
  this.requestGenerated_ = {};

  /** @private {!Array.<!MediaEncryptedEvent>} */
  this.fakeEncryptedEvents_ = [];

  /** @private {!Array.<!MediaKeySession>} */
  this.sessions_ = [];

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
};
goog.inherits(shaka.player.Player, shaka.util.FakeEventTarget);


/**
 * @const {string}
 * @export
 */
shaka.player.Player.version = 'v1.1';


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
      // Promises are used frequently for asynchronous operations.
      !!window.Promise &&
      // Playback quality metrics used by Player.getStats().
      !!HTMLVideoElement.prototype.getVideoPlaybackQuality &&
      // Fullscreen API.
      !!HTMLMediaElement.prototype.requestFullscreen &&
      // Node.children is used by mpd_parser.js, and body is a Node instance.
      !!document.body.children;
};


/**
 * Determines if the specified codec is supported with the given key system.
 *
 * @param {string} keySystem The key system.  Use the empty string for
 *     unencrypted content.
 * @param {string} mimeType A media MIME type, possibly including codec info.
 *
 * @return {boolean} true if the codec is supported by the key system,
 *     false otherwise.
 * @export
 */
shaka.player.Player.isTypeSupported = function(keySystem, mimeType) {
  var supported;

  // TODO(story 1922598): Although Chrome reports support for mp4a.40.5, it
  // fails to decode some such content. These are low-quality streams anyway,
  // so disable support for them until a solution can be found.
  if (mimeType.indexOf('mp4a.40.5') >= 0) {
    return false;
  }

  if (mimeType == 'text/vtt') {
    supported = !!window.VTTCue;
  } else {
    supported = MediaSource.isTypeSupported(mimeType);

    if (supported && keySystem) {
      // Strip off the codec info, if any, leaving just a basic MIME type.
      var basicType = mimeType.split(';')[0];
      // TODO: isTypeSupported is deprecated
      supported = MediaKeys.isTypeSupported(keySystem, basicType);
    }
  }

  shaka.log.info(keySystem, '+', mimeType,
                 supported ? 'is' : 'is not', 'supported');
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
  // Stop playback.
  this.video_.pause();

  // Stop listening for events and timers.
  this.eventManager_.removeAll();
  this.cancelWatchdogTimer_();
  this.cancelRewindTimer_();

  // Release all EME resources.
  for (var i = 0; i < this.sessions_.length; ++i) {
    // Ignore any errors when closing the sessions.  One such error would be
    // an invalid state error triggered by closing a session which has not
    // generated any key requests.
    this.sessions_[i].close().catch(function() {});
  }
  this.sessions_ = [];
  this.fakeEncryptedEvents_ = [];
  this.mediaKeys_ = null;

  // Remove the video source.
  this.video_.src = '';
  this.video_.load();
  var p = this.video_.setMediaKeys(null);
  if (this.videoSource_) {
    this.videoSource_.destroy();
    this.videoSource_ = null;
  }

  // Reset state.
  this.buffering_ = false;
  this.requestGenerated_ = {};
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
  var p = this.videoSource_ ? this.unload() : Promise.resolve();
  shaka.asserts.assert(this.videoSource_ == null);

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
        return this.initializeDrmScheme_();
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        this.setVideoEventListeners_();
        return this.videoSource_.attach(this, this.video_);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        // Dispatch any fake 'encrypted' events we might have created.
        for (var i = 0; i < this.fakeEncryptedEvents_.length; ++i) {
          this.onEncrypted_(this.fakeEncryptedEvents_[i]);
        }
        return Promise.resolve();
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
 * Initializes the DRM scheme.  This function sets |mediaKeys_|.
 * @return {!Promise}
 * @private
 */
shaka.player.Player.prototype.initializeDrmScheme_ = function() {
  shaka.asserts.assert(this.mediaKeys_ == null);
  shaka.asserts.assert(this.video_.mediaKeys == null);

  // TODO(story 2544736): Support multiple DASH periods with different schemes?
  var drmScheme = this.videoSource_.getDrmSchemeInfo();
  if (!drmScheme) {
    shaka.log.info('No encryption.');
    return Promise.resolve();
  }

  var p = navigator.requestMediaKeySystemAccess(drmScheme.keySystem);
  return p.then(shaka.util.TypedBind(this,
      /** @param {!MediaKeySystemAccess} mediaKeySystemAccess */
      function(mediaKeySystemAccess) {
        return mediaKeySystemAccess.createMediaKeys();
      })
  ).then(shaka.util.TypedBind(this,
      /** @param {!MediaKeys} mediaKeys */
      function(mediaKeys) {
        this.mediaKeys_ = mediaKeys;
        return this.video_.setMediaKeys(this.mediaKeys_);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        shaka.asserts.assert(this.video_.mediaKeys);
        shaka.asserts.assert(this.video_.mediaKeys == this.mediaKeys_);
        this.generateFakeEncryptedEvents_(drmScheme);

        // Explicit init data for any one stream is sufficient to suppress
        // 'encrypted' events for all streams.
        if (this.fakeEncryptedEvents_.length == 0) {
          this.eventManager_.listen(
              this.video_,
              'encrypted',
              /** @type {shaka.util.EventManager.ListenerType} */(
                  this.onEncrypted_.bind(this)));
        }
      })
  );
};


/**
 * Generate any fake 'encrypted' events for the given DRM scheme and store them
 * in |fakeEncryptedEvents_|.
 *
 * @param {shaka.player.DrmSchemeInfo} drmScheme
 * @private
 */
shaka.player.Player.prototype.generateFakeEncryptedEvents_ =
    function(drmScheme) {
  this.fakeEncryptedEvents_ = [];

  for (var i = 0; i < drmScheme.initDatas.length; ++i) {
    var initData = drmScheme.initDatas[i];

    // This DRM scheme has init data information which should override that
    // found in the actual stream.  Therefore, we fake an 'encrypted' event
    // and ignore the actual 'encrypted' events from the browser.
    var event = /** @type {!MediaEncryptedEvent} */ ({
      type: 'encrypted',
      initDataType: initData.initDataType,
      initData: initData.initData
    });

    // The video hasn't been attached yet, so we can't fire these until later.
    this.fakeEncryptedEvents_.push(event);
  }
};


/**
 * Sets the video's event listeners.
 *
 * @private
 */
shaka.player.Player.prototype.setVideoEventListeners_ = function() {
  // TODO(story 1891509): Connect these events to the UI.
  this.eventManager_.listen(this.video_, 'play', this.onPlay_.bind(this));
  this.eventManager_.listen(this.video_, 'playing', this.onPlaying_.bind(this));
  this.eventManager_.listen(this.video_, 'seeking', this.onSeeking_.bind(this));
  this.eventManager_.listen(this.video_, 'pause', this.onPause_.bind(this));
  this.eventManager_.listen(this.video_, 'ended', this.onEnded_.bind(this));
};


/**
 * EME 'encrypted' event handler.
 *
 * @param {!MediaEncryptedEvent} event The EME 'encrypted' event.
 * @private
 */
shaka.player.Player.prototype.onEncrypted_ = function(event) {
  // Suppress duplicate init data.
  shaka.asserts.assert(event.initData);
  var initData = new Uint8Array(event.initData);
  var initDataKey = shaka.util.StringUtils.uint8ArrayKey(initData);

  var drmScheme = this.videoSource_.getDrmSchemeInfo();
  if (drmScheme.suppressMultipleEncryptedEvents) {
    // In this scheme, all 'encrypted' events are equivalent.
    // Never create more than one session.
    initDataKey = 'first';
  }

  if (this.requestGenerated_[initDataKey]) {
    return;
  }

  shaka.log.info('onEncrypted_', initData, event);

  var session = this.mediaKeys_.createSession();
  this.sessions_.push(session);

  this.eventManager_.listen(
      session, 'message', /** @type {shaka.util.EventManager.ListenerType} */(
          this.onSessionMessage_.bind(this)));

  var p = session.generateRequest(event.initDataType, event.initData);
  p.then(shaka.util.TypedBind(this,
      function() {
        this.requestGenerated_[initDataKey] = true;
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        var event = shaka.util.FakeEvent.createErrorEvent(error);
        this.dispatchEvent(event);
      })
  );
};


/**
 * EME key-message handler.
 *
 * @param {!MediaKeyMessageEvent} event The EME message event.
 * @private
 */
shaka.player.Player.prototype.onSessionMessage_ = function(event) {
  shaka.log.info('onSessionMessage_', event);
  var drmScheme = this.videoSource_.getDrmSchemeInfo();
  this.requestLicense_(event.target, drmScheme.licenseServerUrl, event.message,
                       drmScheme.withCredentials,
                       drmScheme.licensePostProcessor);
};


/**
 * Requests a license.
 *
 * @param {!MediaKeySession} session An EME session object.
 * @param {string} licenseServerUrl The license server URL.
 * @param {!ArrayBuffer} licenseRequestBody The license request's body.
 * @param {boolean} withCredentials True if the request should include cookies
 *     when sent cross-domain.  See http://goo.gl/pzY9F7 for more information.
 * @param {?shaka.player.DrmSchemeInfo.LicensePostProcessor} postProcessor The
 *     post-processor for the license, if any.
 *
 * @private
 */
shaka.player.Player.prototype.requestLicense_ =
    function(session, licenseServerUrl, licenseRequestBody, withCredentials,
             postProcessor) {
  shaka.log.info(
      'requestLicense_', session, licenseServerUrl, licenseRequestBody);

  var licenseRequest = new shaka.util.LicenseRequest(
      licenseServerUrl, licenseRequestBody, withCredentials);

  licenseRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!Uint8Array} response */
      function(response) {
        shaka.log.info('onLicenseSuccess_', session);
        if (postProcessor) {
          var restrictions = new shaka.player.DrmSchemeInfo.Restrictions();
          response = postProcessor(response, restrictions);
          this.videoSource_.setRestrictions(restrictions);
        }

        return session.update(response);
      })
  ).then(
      function() {
        shaka.log.info('onSessionReady_', session);
      }
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        error.session = session;
        var event = shaka.util.FakeEvent.createErrorEvent(error);
        this.dispatchEvent(event);
      })
  );
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
 * Video play event handler.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onPlay_ = function(event) {
  shaka.log.debug('onPlay_', event);
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

  this.cancelWatchdogTimer_();

  this.watchdogTimer_ =
      window.setTimeout(this.onWatchdogTimer_.bind(this), 100);
};


/**
 * Video seeking event handler.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onSeeking_ = function(event) {
  shaka.log.debug('onSeeking_', event);

  this.cancelWatchdogTimer_();
  this.buffering_ = false;
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
 * Video end event handler.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.Player.prototype.onEnded_ = function(event) {
  shaka.log.debug('onEnded_', event, this.getStats());
  this.cancelWatchdogTimer_();
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
 *
 * @return {boolean} True if the specified VideoTrack was found.
 * @export
 */
shaka.player.Player.prototype.selectVideoTrack = function(id) {
  if (!this.videoSource_) return false;
  return this.videoSource_.selectVideoTrack(id, true);
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
 * Enable or disable the text track.  Has no effect before Player.load().
 *
 * @param {boolean} enabled
 * @export
 */
shaka.player.Player.prototype.enableTextTrack = function(enabled) {
  if (!this.videoSource_) return;
  this.videoSource_.enableTextTrack(enabled);
};


/**
 * Enable or disable automatic bitrate adaptation.
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
 * @return {number} Current playback time in seconds.
 * @export
 */
shaka.player.Player.prototype.getCurrentTime = function() {
  return this.video_.currentTime;
};


/**
 * @return {number} Video duration in seconds.
 * @export
 */
shaka.player.Player.prototype.getDuration = function() {
  return this.video_.duration;
};


/**
 * @return {boolean} True if the video is muted.
 * @export
 */
shaka.player.Player.prototype.getMuted = function() {
  return this.video_.muted;
};


/**
 * @return {number} The video volume, between 0 and 1.
 * @export
 */
shaka.player.Player.prototype.getVolume = function() {
  return this.video_.volume;
};


/**
 * Play the video.  Will reset the playback rate to 1.0 as well.
 * @export
 */
shaka.player.Player.prototype.play = function() {
  this.setPlaybackRate(1.0);
  this.video_.play();
};


/**
 * Pause the video.
 * @export
 */
shaka.player.Player.prototype.pause = function() {
  this.video_.pause();
};


/**
 * Make the video go full-screen.
 * For security reasons, only works from an event handler for user input.
 * @export
 */
shaka.player.Player.prototype.requestFullscreen = function() {
  this.video_.requestFullscreen();
};


/**
 * @param {number} seconds The desired playback position in seconds.
 * @export
 */
shaka.player.Player.prototype.seek = function(seconds) {
  this.video_.currentTime = seconds;
};


/**
 * @param {boolean} on True to mute the video, false to unmute the video.
 * @export
 */
shaka.player.Player.prototype.setMuted = function(on) {
  this.video_.muted = on;
};


/**
 * @param {number} level The video volume, between 0 and 1.
 * @export
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
 *     0.0 is invalid and will be ignored.
 *     Some UAs will not play audio at rates less than 0.25 or 0.5 or greater
 *     than 4.0 or 5.0, but this behavior is not specified.
 *     No audio will be played while rewinding.
 * @export
 */
shaka.player.Player.prototype.setPlaybackRate = function(rate) {
  shaka.asserts.assert(rate != 0);
  if (rate == 0) {
    return;
  }

  // Cancel any rewind we might be in the middle of.
  this.cancelRewindTimer_();

  if (rate > 0) {
    // Slow-mo or fast-forward are handled natively by the UA.
    this.video_.playbackRate = rate;
  } else {
    // Rewind is not supported by any UA to date (2014), so we fake it.
    this.video_.playbackRate = 0;
    this.onRewindTimer_(rate);
  }
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
 * @param {number} rate
 * @private
 */
shaka.player.Player.prototype.onRewindTimer_ = function(rate) {
  shaka.asserts.assert(rate < 0);
  // For a rate of -1.0, we move the playhead back by 0.1s every 0.1s (100ms).
  this.video_.currentTime += 0.1 * rate;
  this.rewindTimer_ =
      window.setTimeout(this.onRewindTimer_.bind(this, rate), 100);
};


/**
 * Called on a recurring timer to detect buffering events.
 * @private
 */
shaka.player.Player.prototype.onWatchdogTimer_ = function() {
  this.watchdogTimer_ =
      window.setTimeout(this.onWatchdogTimer_.bind(this), 100);

  // Because we cancel this onSeeking_ and re-enable it onPlaying_.
  shaka.asserts.assert(!this.video_.seeking, 'should not be seeking');

  var buffered = this.video_.buffered;
  // Counter-intuitively, the play head can advance audio-only while video is
  // buffering.  |buffered| will show the intersection of buffered ranges for
  // both audio and video, so this is an accurate way to sense that we are
  // buffering.  The 'stalled', 'waiting', and 'suspended' events do not work
  // for this purpose as of Chrome 38.
  var bufferEnd = buffered.length ? buffered.end(buffered.length - 1) : 0;
  var underflow = this.video_.currentTime - bufferEnd;

  if (!this.buffering_) {
    if (underflow > shaka.player.Player.UNDERFLOW_THRESHOLD_) {
      this.buffering_ = true;
      this.video_.pause();
      this.stats_.logBufferingEvent();
      shaka.timer.begin('buffering');
      shaka.log.debug('Buffering...');
    }
  } else {
    var resumeThreshold = this.videoSource_.getResumeThreshold();
    shaka.asserts.assert(resumeThreshold > 0);
    if (underflow < -resumeThreshold) {
      shaka.log.debug('Buffering complete.');
      shaka.timer.end('buffering');
      this.stats_.logBufferingTime(shaka.timer.get('buffering'));
      this.buffering_ = false;
      this.video_.play();
    }
  }
};


/**
 * The threshold for underflow, in seconds.  If the play head is outside the
 * buffered range by this much, we will consider the player to be out of data.
 *
 * @private {number}
 * @const
 */
shaka.player.Player.UNDERFLOW_THRESHOLD_ = 0.050;

