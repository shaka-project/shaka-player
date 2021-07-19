/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 * @suppress {missingRequire} TODO(b/152540451): this shouldn't be needed
 */

goog.provide('shaka.text.SimpleTextDisplayer');

goog.require('goog.asserts');
goog.require('shaka.Deprecate');
goog.require('shaka.log');
goog.require('shaka.text.Cue');


/**
 * A text displayer plugin using the browser's native VTTCue interface.
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
      // NOTE: There is no API available to remove a TextTrack from a video
      // element.
      track.mode = 'disabled';

      if (track.label == shaka.Player.TextTrackLabel) {
        this.textTrack_ = track;
      }
    }

    if (!this.textTrack_) {
      // As far as I can tell, there is no observable difference between setting
      // kind to 'subtitles' or 'captions' when creating the TextTrack object.
      // The individual text tracks from the manifest will still have their own
      // kinds which can be displayed in the app's UI.
      this.textTrack_ = video.addTextTrack(
          'subtitles', shaka.Player.TextTrackLabel);
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
    // Flatten nested cue payloads recursively.  If a cue has nested cues,
    // their contents should be combined and replace the payload of the parent.
    const flattenPayload = (cue) => {
      // Handle styles (currently bold/italics/underline).
      // TODO add support for color rendering.
      const openStyleTags = [];
      const bold = cue.fontWeight >= shaka.text.Cue.fontWeight.BOLD;
      const italics = cue.fontStyle == shaka.text.Cue.fontStyle.ITALIC;
      const underline = cue.textDecoration.includes(
          shaka.text.Cue.textDecoration.UNDERLINE);
      if (bold) {
        openStyleTags.push('b');
      }
      if (italics) {
        openStyleTags.push('i');
      }
      if (underline) {
        openStyleTags.push('u');
      }

      // Prefix opens tags, suffix closes tags in reverse order of opening.
      const prefixStyleTags = openStyleTags.reduce((acc, tag) => {
        return `${acc}<${tag}>`;
      }, '');
      const suffixStyleTags = openStyleTags.reduceRight((acc, tag) => {
        return `${acc}</${tag}>`;
      }, '');

      if (cue.lineBreak || cue.spacer) {
        if (cue.spacer) {
          shaka.Deprecate.deprecateFeature(4,
              'shaka.extern.Cue',
              'Please use lineBreak instead of spacer.');
        }
        // This is a vertical lineBreak, so insert a newline.
        return '\n';
      } else if (cue.nestedCues.length) {
        return cue.nestedCues.map(flattenPayload).join('');
      } else {
        // This is a real cue.
        return prefixStyleTags + cue.payload + suffixStyleTags;
      }
    };

    // We don't want to modify the array or objects passed in, since we don't
    // technically own them.  So we build a new array and replace certain items
    // in it if they need to be flattened.
    const flattenedCues = cues.map((cue) => {
      if (cue.nestedCues.length) {
        const flatCue = cue.clone();
        flatCue.nestedCues = [];
        flatCue.payload = flattenPayload(cue);
        return flatCue;
      } else {
        return cue;
      }
    });

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

      if (!containsCue) {
        const cue =
            shaka.text.SimpleTextDisplayer.convertToTextTrackCue_(inCue);
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
        // See https://github.com/google/shaka-player/issues/848 for more info.
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
      // Edge will throw in this case.
      // See issue #501
      shaka.log.warning('Invalid cue times: ' + shakaCue.startTime +
                        ' - ' + shakaCue.endTime);
      return null;
    }

    const Cue = shaka.text.Cue;
    /** @type {VTTCue} */
    const vttCue = new VTTCue(
        shakaCue.startTime,
        shakaCue.endTime,
        shakaCue.payload);

    // NOTE: positionAlign and lineAlign settings are not supported by Chrome
    // at the moment, so setting them will have no effect.
    // The bug on chromium to implement them:
    // https://bugs.chromium.org/p/chromium/issues/detail?id=633690

    vttCue.lineAlign = shakaCue.lineAlign;
    vttCue.positionAlign = shakaCue.positionAlign;
    if (shakaCue.size) {
      vttCue.size = shakaCue.size;
    }

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
