/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 */

goog.provide('shaka.text.NativeTextDisplayer');

goog.require('mozilla.LanguageMapping');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.text.Utils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.Timer');
goog.requireType('shaka.Player');

/**
 * A text displayer plugin using the browser's native VTTCue interface.
 *
 * @implements {shaka.extern.TextDisplayer}
 * @export
 */
shaka.text.NativeTextDisplayer = class {
  /**
   * @param {shaka.Player} player
   */
  constructor(player) {
    /** @private {?shaka.Player} */
    this.player_ = player;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {?HTMLMediaElement} */
    this.video_ = null;

    /** @private {Map<number, !HTMLTrackElement>} */
    this.trackNodes_ = new Map();

    /** @private {number} */
    this.trackId_ = -1;

    /** @private {boolean} */
    this.visible_ = false;

    /** @private {?shaka.util.Timer} */
    this.timer_ = null;

    /** @private */
    this.onUnloading_ = () => {
      this.eventManager_.unlisten(this.player_,
          shaka.util.FakeEvent.EventName.TextChanged, this.onTextChanged_);
      this.eventManager_.unlisten(this.video_.textTracks, 'change',
          this.onChange_);
      for (const trackNode of this.trackNodes_.values()) {
        trackNode.remove();
      }
      this.trackNodes_.clear();
      this.trackId_ = -1;
      this.video_ = null;
    };

    /** @private */
    this.onTextChanged_ = () => {
      /** @type {Map<number, !HTMLTrackElement>} */
      const newTrackNodes = new Map();
      const tracks = this.player_.getTextTracks();
      for (const track of tracks) {
        let trackNode;
        if (this.trackNodes_.has(track.id)) {
          trackNode = this.trackNodes_.get(track.id);
          if (!track.active && trackNode.track.mode !== 'disabled') {
            trackNode.track.mode = 'disabled';
          }
          this.trackNodes_.delete(track.id);
        } else {
          trackNode = /** @type {!HTMLTrackElement} */
            (this.video_.ownerDocument.createElement('track'));
          trackNode.kind = shaka.text.NativeTextDisplayer.getTrackKind_(track);
          trackNode.label =
            shaka.text.NativeTextDisplayer.getTrackLabel_(track);
          if (track.language in mozilla.LanguageMapping) {
            trackNode.srclang = track.language;
          }
          const device = shaka.device.DeviceFactory.getDevice();
          if (device.getBrowserEngine() ===
              shaka.device.IDevice.BrowserEngine.CHROMIUM) {
            // The built-in captions menu in Chrome may refuse to list invalid
            // subtitles. The data URL is just to avoid this.
            trackNode.src = 'data:,WEBVTT';
          }
          trackNode.track.mode = 'disabled';
          this.video_.appendChild(trackNode);
        }
        newTrackNodes.set(track.id, trackNode);
        if (track.active) {
          this.trackId_ = track.id;
        }
      }
      // Remove all tracks that are not in the new list.
      for (const trackNode of this.trackNodes_.values()) {
        trackNode.remove();
      }
      if (this.trackId_ > -1) {
        if (!newTrackNodes.has(this.trackId_)) {
          this.trackId_ = -1;
        } else {
          // enable current track after everything else is settled
          const track = newTrackNodes.get(this.trackId_).track;
          // Ignore if the mode is not disabled. Maybe the user has changed the
          // mode manually. In that case, visible_ will be updated in onChange_
          if (track.mode === 'disabled') {
            track.mode = this.visible_ ? 'showing' : 'hidden';
          }
        }
      }
      this.trackNodes_ = newTrackNodes;
    };

    /** @private */
    this.onChange_ = () => {
      // The change event may fire multiple times consecutively. So we need to
      // use a timer to ensure the real task runs only once.
      if (this.timer_) {
        return;
      }
      const video = this.video_;
      this.timer_ = new shaka.util.Timer(() => {
        this.timer_ = null;
        if (this.video_ !== video) {
          return;
        }
        let trackId = -1;
        let found = false;
        // Prefer previously selected track.
        if (this.trackNodes_.has(this.trackId_)) {
          const trackNode = this.trackNodes_.get(this.trackId_);
          if (trackNode.track.mode === 'showing') {
            trackId = this.trackId_;
            found = true;
          } else if (trackNode.track.mode === 'hidden') {
            trackId = this.trackId_;
          }
        }
        if (!found) {
          for (const [
            /** @type {number} */id,
            /** @type {HTMLTrackElement} */trackNode,
          ] of /** @type {!Map} */(this.trackNodes_)) {
            if (trackNode.track.mode === 'showing') {
              trackId = id;
              break;
            } else if (trackId < 0 && trackNode.track.mode === 'hidden') {
              // If there is no showing track, we can use the hidden track
              trackId = id;
            }
          }
        }
        for (const [
          /** @type {number} */id,
          /** @type {HTMLTrackElement} */trackNode,
        ] of /** @type {!Map} */(this.trackNodes_)) {
          // Avoid triggering unnecessary change events.
          if (id !== trackId && trackNode.track.mode !== 'disabled') {
            trackNode.track.mode = 'disabled';
          }
        }
        if (this.trackId_ !== trackId) {
          this.trackId_ = trackId;
          if (trackId > -1) {
            this.player_.selectTextTrack(
                /** @type {!shaka.extern.TextTrack} */({id: trackId}));
          }
        }
        // The selectTextTrack() method does not accept null as parameter.
        // So we need to use setTextTrackVisibility() if no track selected.
        this.player_.setTextTrackVisibility(trackId > -1 &&
            this.trackNodes_.get(trackId).track.mode === 'showing');
      }).tickAfter(0);
    };

    this.eventManager_.listen(player, shaka.util.FakeEvent.EventName.Loaded,
        () => this.enableTextDisplayer());

    this.enableTextDisplayer();
  }

  /**
   * @override
   * @export
   */
  configure(config) {
    // unused
  }

  /**
   * @override
   * @export
   */
  remove(start, end) {
    // Should return false only if this instance is destroyed
    if (!this.player_) {
      return false;
    } else if (this.trackNodes_.has(this.trackId_)) {
      shaka.text.Utils.removeCuesFromTextTrack(
          this.trackNodes_.get(this.trackId_).track,
          (cue) => cue.startTime < end && cue.endTime > start);
    }

    return true;
  }

  /**
   * @override
   * @export
   */
  append(cues) {
    if (this.trackNodes_.has(this.trackId_)) {
      shaka.text.Utils.appendCuesToTextTrack(
          this.trackNodes_.get(this.trackId_).track, cues);
    }
  }

  /**
   * @override
   * @export
   */
  destroy() {
    if (this.player_) {
      if (this.video_) {
        this.onUnloading_();
      }
      this.player_ = null;
    }
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }
    return Promise.resolve();
  }

  /**
   * @override
   * @export
   */
  isTextVisible() {
    return this.visible_;
  }

  /**
   * @override
   * @export
   */
  setTextVisibility(on) {
    this.visible_ = on;
    if (this.trackNodes_.has(this.trackId_)) {
      const textTrack = this.trackNodes_.get(this.trackId_).track;
      if (textTrack.mode !== 'disabled') {
        const mode = on ? 'showing' : 'hidden';
        if (textTrack.mode !== mode) {
          textTrack.mode = mode;
        }
      }
    } else if (this.player_ && this.player_.getLoadMode() === 3) {
      // shaka.Player.LoadMode.SRC_EQUALS
      const textTracks = Array.from(this.player_.getMediaElement().textTracks)
          .filter((track) =>
            ['captions', 'subtitles', 'forced'].includes(track.kind));
      if (on) {
        let toShow = null;
        for (const track of textTracks) {
          if (track.mode === 'showing') {
            // One showing track is just enough.
            toShow = null;
            break;
          } else if (!toShow && track.mode === 'hidden') {
            toShow = track;
          }
        }
        if (toShow) {
          toShow.mode = 'showing';
        }
      } else {
        for (const track of textTracks) {
          if (track.mode === 'showing') {
            track.mode = 'hidden';
          }
        }
      }
    }
  }

  /**
   * @override
   * @export
   */
  setTextLanguage(language) {
    // unused
  }

  /**
   * @override
   * @export
   */
  enableTextDisplayer() {
    // shaka.Player.LoadMode.MEDIA_SOURCE
    if (!this.video_ && this.player_ && this.player_.getLoadMode() === 2) {
      this.video_ = this.player_.getMediaElement();
      this.eventManager_.listenOnce(this.player_,
          shaka.util.FakeEvent.EventName.Unloading, this.onUnloading_);
      this.eventManager_.listen(this.player_,
          shaka.util.FakeEvent.EventName.TextChanged, this.onTextChanged_);
      this.eventManager_.listen(this.video_.textTracks, 'change',
          this.onChange_);
      this.onTextChanged_();
    }
  }

  /**
   * @param {!shaka.extern.TextTrack} track
   * @return {string}
   * @private
   */
  static getTrackKind_(track) {
    const device = shaka.device.DeviceFactory.getDevice();
    if (track.forced && device.getBrowserEngine() ===
        shaka.device.IDevice.BrowserEngine.WEBKIT) {
      return 'forced';
    } else if (
      track.kind === 'caption' || (
        track.roles &&
        track.roles.some(
            (role) => role.includes('transcribes-spoken-dialog')) &&
        track.roles.some(
            (role) => role.includes('describes-music-and-sound'))
      )
    ) {
      return 'captions';
    }

    return 'subtitles';
  }

  /**
   * @param {!shaka.extern.TextTrack} track
   * @return {string}
   * @private
   */
  static getTrackLabel_(track) {
    /** @type {string} */
    let label;
    if (track.label) {
      label = track.label;
    } else if (track.language) {
      if (track.language in mozilla.LanguageMapping) {
        label = mozilla.LanguageMapping[track.language];
      } else {
        const language = shaka.util.LanguageUtils.getBase(track.language);
        if (language in mozilla.LanguageMapping) {
          label =
            `${mozilla.LanguageMapping[language]} (${track.language})`;
        }
      }
    }
    if (!label) {
      label = /** @type {string} */(track.originalTextId);
      if (track.language && track.language !== track.originalTextId) {
        label += ` (${track.language})`;
      }
    }

    return label;
  }
};
