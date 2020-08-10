/**
 * @license
 * Copyright 2016 Google Inc.
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

goog.provide('shaka.text.SimpleTextDisplayer');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.text.Cue');


/**
 * <p>
 * This defines the default text displayer plugin. An instance of this
 * class is used when no custom displayer is given.
 * </p>
 * <p>
 * This class simply converts shaka.text.Cue objects to
 * TextTrackCues and feeds them to the browser.
 * </p>
 *
 * @param {HTMLMediaElement} video
 * @constructor
 * @struct
 * @implements {shaka.extern.TextDisplayer}
 * @export
 */
shaka.text.SimpleTextDisplayer = function(video) {
  /** @private {TextTrack} */
  this.textTrack_ = null;

  // TODO: Test that in all cases, the built-in CC controls in the video element
  // are toggling our TextTrack.

  // If the video element has TextTracks, disable them.  If we see one that
  // was created by a previous instance of Shaka Player, reuse it.
  for (let i = 0; i < video.textTracks.length; ++i) {
    let track = video.textTracks[i];
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
};


/**
 * @override
 * @export
 */
shaka.text.SimpleTextDisplayer.prototype.remove = function(start, end) {
  // Check that the displayer hasn't been destroyed.
  if (!this.textTrack_) return false;

  let removeInRange = (cue) => {
    const inside = cue.startTime < end && cue.endTime > start;
    return inside;
  };

  shaka.text.SimpleTextDisplayer.removeWhere_(this.textTrack_, removeInRange);

  return true;
};


/**
 * @override
 * @export
 */
shaka.text.SimpleTextDisplayer.prototype.append = function(cues) {
  const convertToTextTrackCue =
      shaka.text.SimpleTextDisplayer.convertToTextTrackCue_;

  // Flatten nestedCues.  If a cue has nested cues, their contents should be
  // combined and replace the payload of the parent.  However, we don't want
  // to modify the array or objects passed in, since we don't technically own
  // them.  So we build a new array and replace certain items in it if they
  // need to be flattened.
  const flattenedCues = cues.map((cue) => {
    if (cue.nestedCues.length) {
      const payload = cue.nestedCues.map((inner) => {
        if (inner.spacer) {
          // This is a vertical spacer, so insert a newline.
          return '\n';
        } else {
          // This is a real cue.  Add a space after it.  Extra spaces at the
          // end or before a vertical spacer are removed with a Regexp below.
          return inner.payload + ' ';
        }
      }).join('').replace(/ $/m, '');

      const flatCue = cue.clone();
      flatCue.nestedCues = [];
      flatCue.payload = payload;
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
      const cue = convertToTextTrackCue(inCue);
      if (cue) {
        textTrackCues.push(cue);
      }
    }
  }

  // Sort the cues based on start/end times.  Make a copy of the array so
  // we can get the index in the original ordering.  Out of order cues are
  // rejected by IE/Edge.  See https://bit.ly/2K9VX3s
  let sortedCues = textTrackCues.slice().sort(function(a, b) {
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
      // reverse the order.  This occurs on IE11 and legacy Edge.
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

  sortedCues.forEach(function(cue) {
    this.textTrack_.addCue(cue);
  }.bind(this));
};


/**
 * @override
 * @export
 */
shaka.text.SimpleTextDisplayer.prototype.destroy = function() {
  if (this.textTrack_) {
    let removeIt = (cue) => true;
    shaka.text.SimpleTextDisplayer.removeWhere_(this.textTrack_, removeIt);
  }

  this.textTrack_ = null;
  return Promise.resolve();
};


/**
 * @override
 * @export
 */
shaka.text.SimpleTextDisplayer.prototype.isTextVisible = function() {
  return this.textTrack_.mode == 'showing';
};


/**
 * @override
 * @export
 */
shaka.text.SimpleTextDisplayer.prototype.setTextVisibility = function(on) {
  this.textTrack_.mode = on ? 'showing' : 'hidden';
};


/**
 * @param {!shaka.extern.Cue} shakaCue
 * @return {TextTrackCue}
 * @private
 */
shaka.text.SimpleTextDisplayer.convertToTextTrackCue_ = function(shakaCue) {
  if (shakaCue.startTime >= shakaCue.endTime) {
    // IE/Edge will throw in this case.
    // See issue #501
    shaka.log.warning('Invalid cue times: ' + shakaCue.startTime +
                      ' - ' + shakaCue.endTime);
    return null;
  }

  const Cue = shaka.text.Cue;
  /** @type {VTTCue} */
  let vttCue = new VTTCue(shakaCue.startTime,
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
};


/**
 * Iterate over all the cues in a text track and remove all those for which
 * |predicate(cue)| returns true.
 *
 * @param {!TextTrack} track
 * @param {function(!TextTrackCue):boolean} predicate
 * @private
 */
shaka.text.SimpleTextDisplayer.removeWhere_ = function(track, predicate) {
  // Since |track.cues| can be null if |track.mode| is "disabled", force it to
  // something other than "disabled".
  //
  // If the track is already showing, then we should keep it as showing. But if
  // it something else, we will use hidden so that we don't "flash" cues on the
  // screen.
  let oldState = track.mode;
  let tempState = oldState == 'showing' ? 'showing' : 'hidden';

  track.mode = tempState;

  goog.asserts.assert(
      track.cues,
      'Cues should be accessible when mode is set to "' + tempState + '".');

  // Go backward so that if a removal is done, it should not cause problems
  // with future indexing. In the case that the underlying implementation
  // returns a copy (and not a shared instance) cache a copy of the tracks.
  let cues = track.cues;
  for (let i = cues.length - 1; i >= 0; i--) {
    let cue = cues[i];
    if (cue && predicate(cue)) {
      track.removeCue(cue);
    }
  }

  track.mode = oldState;
};
