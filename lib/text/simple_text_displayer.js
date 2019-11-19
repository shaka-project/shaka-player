/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.SimpleTextDisplayer');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.text.Cue');


/**
 * @summary
 * This defines the default text displayer plugin. An instance of this
 * class is used when no custom displayer is given.
 *
 * This class simply converts shaka.text.Cue objects to
 * TextTrackCues and feeds them to the browser.
 *
 * @implements {shaka.extern.TextDisplayer}
 * @export
 */
shaka.text.SimpleTextDisplayer = class {
  /** @param {HTMLMediaElement} video */
  constructor(video) {
    /** @private {TextTrack} */
    this.textTrack_ = null;

    // TODO: Test that in all cases, the built-in CC controls in the video
    // element are toggling our TextTrack.

    // If the video element has TextTracks, disable them.  If we see one that
    // was created by a previous instance of Shaka Player, reuse it.
    for (const track of Array.from(video.textTracks)) {
      track.mode = 'disabled';

      if (track.label == shaka.text.SimpleTextDisplayer.TextTrackLabel_) {
        this.textTrack_ = track;
      }
    }

    if (!this.textTrack_) {
      // As far as I can tell, there is no observable difference between setting
      // kind to 'subtitles' or 'captions' when creating the TextTrack object.
      // The individual text tracks from the manifest will still have their own
      // kinds which can be displayed in the app's UI.
      this.textTrack_ = video.addTextTrack(
          'subtitles', shaka.text.SimpleTextDisplayer.TextTrackLabel_);
    }
    this.textTrack_.mode = 'hidden';
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
    const convertToTextTrackCue =
        shaka.text.SimpleTextDisplayer.convertToTextTrackCue_;

    // Convert cues.
    const textTrackCues = [];
    for (const inCue of cues) {
      const cue = convertToTextTrackCue(inCue);
      if (cue) {
        textTrackCues.push(cue);
      }
    }

    // Sort the cues based on start/end times.  Make a copy of the array so
    // we can get the index in the original ordering.  Out of order cues are
    // rejected by IE/Edge.  See https://bit.ly/2K9VX3s
    const sortedCues = textTrackCues.slice().sort((a, b) => {
      if (a.startTime != b.startTime) {
        return a.startTime - b.startTime;
      } else if (a.endTime != b.endTime) {
        return a.endTime - b.startTime;
      } else {
        // The browser will display cues with identical time ranges from the
        // bottom up.  Reversing the order of equal cues means the first one
        // parsed will be at the top, as you would expect.
        // See https://github.com/google/shaka-player/issues/848 for more info.
        return textTrackCues.indexOf(b) - textTrackCues.indexOf(a);
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
    }

    this.textTrack_ = null;
    return Promise.resolve();
  }

  /**
   * @override
   * @export
   */
  isTextVisible() {
    return this.textTrack_.mode == 'showing';
  }

  /**
   * @override
   * @export
   */
  setTextVisibility(on) {
    this.textTrack_.mode = on ? 'showing' : 'hidden';
  }

  /**
   * @param {!shaka.extern.Cue} shakaCue
   * @return {TextTrackCue}
   * @private
   */
  static convertToTextTrackCue_(shakaCue) {
    if (shakaCue.startTime >= shakaCue.endTime) {
      // IE/Edge will throw in this case.
      // See issue #501
      shaka.log.warning('Invalid cue times: ' + shakaCue.startTime +
                        ' - ' + shakaCue.endTime);
      return null;
    }

    const Cue = shaka.text.Cue;
    /** @type {VTTCue} */
    const vttCue = new VTTCue(shakaCue.startTime,
        shakaCue.endTime,
        shakaCue.payload);

    // NOTE: positionAlign and lineAlign settings are not supported by Chrome
    // at the moment, so setting them will have no effect.
    // The bug on chromium to implement them:
    // https://bugs.chromium.org/p/chromium/issues/detail?id=633690

    vttCue.lineAlign = shakaCue.lineAlign;
    vttCue.positionAlign = shakaCue.positionAlign;
    vttCue.size = shakaCue.size;
    try {
      // Safari 10 seems to throw on align='center'.
      vttCue.align = shakaCue.textAlign;
    } catch (exception) {}

    if (shakaCue.textAlign == 'center' && vttCue.align != 'center') {
      // We want vttCue.position = 'auto'. By default, |position| is set to
      // "auto". If we set it to "auto" safari will throw an exception, so we
      // must rely on the default value.
      vttCue.align = 'middle';
    }

    if (shakaCue.writingMode ==
            Cue.writingMode.VERTICAL_LEFT_TO_RIGHT) {
      vttCue.vertical = 'lr';
    } else if (shakaCue.writingMode ==
             Cue.writingMode.VERTICAL_RIGHT_TO_LEFT) {
      vttCue.vertical = 'rl';
    }

    // snapToLines flag is true by default
    if (shakaCue.lineInterpretation == Cue.lineInterpretation.PERCENTAGE) {
      vttCue.snapToLines = false;
    }

    if (shakaCue.line != null) {
      vttCue.line = shakaCue.line;
    }

    if (shakaCue.position != null) {
      vttCue.position = shakaCue.position;
    }

    return vttCue;
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

/**
 * @const {string}
 * @private
 */
shaka.text.SimpleTextDisplayer.TextTrackLabel_ = 'Shaka Player TextTrack';
