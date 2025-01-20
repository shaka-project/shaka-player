/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 */

goog.provide('shaka.text.SimpleTextDisplayer');

goog.require('goog.asserts');
goog.require('shaka.text.Utils');


/**
 * A text displayer plugin using the browser's native VTTCue interface.
 *
 * @implements {shaka.extern.TextDisplayer}
 * @export
 */
shaka.text.SimpleTextDisplayer = class {
  /**
   * @param {HTMLMediaElement} video
   * @param {string} label
   */
  constructor(video, label) {
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

    shaka.text.SimpleTextDisplayer.removeWhere_(this.textTrack_, removeInRange);

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
    const flattenedCues = shaka.text.Utils.getCuesToFlatten(cues);

    // Convert cues.
    const textTrackCues = [];
    const cuesInTextTrack = this.textTrack_.cues ?
                            Array.from(this.textTrack_.cues) : [];

    for (const inCue of flattenedCues) {
      // When a VTT cue spans a segment boundary, the cue will be duplicated
      // into two segments.
      // To avoid displaying duplicate cues, if the current textTrack cues
      // list already contains the cue, skip it.
      const containsCue = cuesInTextTrack.some((cueInTextTrack) => {
        if (cueInTextTrack.startTime == inCue.startTime &&
            cueInTextTrack.endTime == inCue.endTime &&
            cueInTextTrack.text == inCue.payload) {
          return true;
        }
        return false;
      });

      if (!containsCue && inCue.payload) {
        const cue =
            shaka.text.Utils.mapShakaCueToNativeCue(inCue);
        if (cue) {
          textTrackCues.push(cue);
        }
      }
    }

    // Sort the cues based on start/end times.  Make a copy of the array so
    // we can get the index in the original ordering.  Out of order cues are
    // rejected by Edge.  See https://bit.ly/2K9VX3s
    const sortedCues = textTrackCues.slice().sort((a, b) => {
      if (a.startTime != b.startTime) {
        return a.startTime - b.startTime;
      } else if (a.endTime != b.endTime) {
        return a.endTime - b.startTime;
      } else {
        // The browser will display cues with identical time ranges from the
        // bottom up.  Reversing the order of equal cues means the first one
        // parsed will be at the top, as you would expect.
        // See https://github.com/shaka-project/shaka-player/issues/848 for
        // more info.
        // However, this ordering behavior is part of VTTCue's "line" field.
        // Some platforms don't have a real VTTCue and use a polyfill instead.
        // When VTTCue is polyfilled or does not support "line", we should _not_
        // reverse the order.  This occurs on legacy Edge.
        // eslint-disable-next-line no-restricted-syntax
        if ('line' in VTTCue.prototype) {
          // Native VTTCue
          return textTrackCues.indexOf(b) - textTrackCues.indexOf(a);
        } else {
          // Polyfilled VTTCue
          return textTrackCues.indexOf(a) - textTrackCues.indexOf(b);
        }
      }
    });

    for (const cue of sortedCues) {
      this.textTrack_.addCue(cue);
    }
  }

  /**
   * @override
   * @export
   */
  destroy() {
    if (this.textTrack_) {
      const removeIt = (cue) => true;
      shaka.text.SimpleTextDisplayer.removeWhere_(this.textTrack_, removeIt);

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

  /**
   * Iterate over all the cues in a text track and remove all those for which
   * |predicate(cue)| returns true.
   *
   * @param {!TextTrack} track
   * @param {function(!TextTrackCue):boolean} predicate
   * @private
   */
  static removeWhere_(track, predicate) {
    // Since |track.cues| can be null if |track.mode| is "disabled", force it to
    // something other than "disabled".
    //
    // If the track is already showing, then we should keep it as showing. But
    // if it something else, we will use hidden so that we don't "flash" cues on
    // the screen.
    const oldState = track.mode;
    const tempState = oldState == 'showing' ? 'showing' : 'hidden';

    track.mode = tempState;

    goog.asserts.assert(
        track.cues,
        'Cues should be accessible when mode is set to "' + tempState + '".');

    // Create a copy of the list to avoid errors while iterating.
    for (const cue of Array.from(track.cues)) {
      if (cue && predicate(cue)) {
        track.removeCue(cue);
      }
    }

    track.mode = oldState;
  }
};
