/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 */

goog.provide('shaka.text.SimpleTextDisplayer');

goog.require('shaka.Deprecate');
goog.require('shaka.text.Utils');


/**
 * A text displayer plugin using the browser's native VTTCue interface.
 *
 * @implements {shaka.extern.TextDisplayer}
 * @deprecated
 * @export
 */
shaka.text.SimpleTextDisplayer = class {
  /**
   * @param {HTMLMediaElement} video
   * @param {string} label
   */
  constructor(video, label) {
    shaka.Deprecate.deprecateFeature(5,
        'SimpleTextDisplayer', 'Please migrate to NativeTextDisplayer');
    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {string} */
    this.textTrackLabel_ = label;

    /** @private {TextTrack} */
    this.textTrack_ = null;

    // TODO: Test that in all cases, the built-in CC controls in the video
    // element are toggling our TextTrack.

    // If the video element has TextTracks, disable them.  If we see one that
    // was created by a previous instance of Shaka Player, reuse it.
    for (const track of Array.from(this.video_.textTracks)) {
      if (track.kind === 'metadata' || track.kind === 'chapters') {
        continue;
      }
      // NOTE: There is no API available to remove a TextTrack from a video
      // element.
      track.mode = 'disabled';

      if (track.label == this.textTrackLabel_) {
        this.textTrack_ = track;
      }
    }
    if (this.textTrack_) {
      this.textTrack_.mode = 'hidden';
    }
  }


  /**
   * @override
   * @export
   */
  configure(config) {
    // Unused.
  }

  /**
   * @override
   * @export
   */
  remove(start, end) {
    // Check that the displayer hasn't been destroyed.
    if (!this.textTrack_) {
      return false;
    }

    const removeInRange = (cue) => {
      const inside = cue.startTime < end && cue.endTime > start;
      return inside;
    };

    shaka.text.Utils.removeCuesFromTextTrack(this.textTrack_, removeInRange);

    return true;
  }

  /**
   * @override
   * @export
   */
  append(cues) {
    if (!this.textTrack_) {
      return;
    }

    shaka.text.Utils.appendCuesToTextTrack(this.textTrack_, cues);
  }

  /**
   * @override
   * @export
   */
  destroy() {
    if (this.textTrack_) {
      const removeIt = (cue) => true;
      shaka.text.Utils.removeCuesFromTextTrack(this.textTrack_, removeIt);

      // NOTE: There is no API available to remove a TextTrack from a video
      // element.
      this.textTrack_.mode = 'disabled';
    }

    this.video_ = null;
    this.textTrack_ = null;
    return Promise.resolve();
  }

  /**
   * @override
   * @export
   */
  isTextVisible() {
    if (!this.textTrack_) {
      return false;
    }
    return this.textTrack_.mode == 'showing';
  }

  /**
   * @override
   * @export
   */
  setTextVisibility(on) {
    if (on && !this.textTrack_) {
      this.createTextTrack_();
    }
    if (this.textTrack_) {
      this.textTrack_.mode = on ? 'showing' : 'hidden';
    }
  }

  /**
   * @override
   * @export
   */
  setTextLanguage(language) {
  }

  /**
   * @override
   * @export
   */
  enableTextDisplayer() {
    this.createTextTrack_();
  }

  /**
   * @private
   */
  createTextTrack_() {
    if (this.video_ && !this.textTrack_) {
      // As far as I can tell, there is no observable difference between setting
      // kind to 'subtitles' or 'captions' when creating the TextTrack object.
      // The individual text tracks from the manifest will still have their own
      // kinds which can be displayed in the app's UI.
      this.textTrack_ =
          this.video_.addTextTrack('subtitles', this.textTrackLabel_);
      this.textTrack_.mode = 'hidden';
    }
  }
};
