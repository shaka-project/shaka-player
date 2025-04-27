/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 */

goog.provide('shaka.text.SimpleTextDisplayer');

goog.require('mozilla.LanguageMapping');
goog.require('goog.asserts');
goog.require('shaka.text.Utils');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.Platform');
goog.requireType('shaka.Player');

/**
 * A text displayer plugin using the browser's native VTTCue interface.
 *
 * @implements {shaka.extern.TextDisplayer}
 * @export
 */
shaka.text.SimpleTextDisplayer = class {
  /**
   * @param {shaka.Player} player
   */
  constructor(player) {
    /** @private {?shaka.Player} */
    this.player_ = player;

    /** @private {?HTMLMediaElement} */
    this.video_ = null;

    /** @private {!Map<number, !HTMLTrackElement>} */
    this.trackNodes_ = new Map();

    /** @private {number} */
    this.trackId_ = -1;

    /** @private {boolean} */
    this.visible_ = false;

    /** @private {boolean} */
    this.hasMicroTask_ = false;

    /** @private */
    this.onLoaded_ = () => {
      this.player_.removeEventListener(
          shaka.util.FakeEvent.EventName.Loaded,
          this.onLoaded_,
      );
      if (
        this.player_.getLoadMode() === 2 // shaka.Player.LoadMode.MEDIA_SOURCE
      ) {
        this.video_ = this.player_.getMediaElement();
        this.player_.addEventListener(
            shaka.util.FakeEvent.EventName.Unloading,
            this.onUnloading_,
        );
        this.player_.addEventListener(
            shaka.util.FakeEvent.EventName.TextChanged,
            this.onTextChanged_,
        );
        this.video_.textTracks.addEventListener('change', this.onChange_);
        this.onTextChanged_();
      }
    };

    /** @private */
    this.onUnloading_ = () => {
      this.player_.removeEventListener(
          shaka.util.FakeEvent.EventName.Unloading,
          this.onUnloading_,
      );
      this.player_.removeEventListener(
          shaka.util.FakeEvent.EventName.TextChanged,
          this.onTextChanged_,
      );
      this.video_.textTracks.removeEventListener('change', this.onChange_);
      for (const trackNode of this.trackNodes_.values()) {
        trackNode.remove();
      }
      this.trackNodes_.clear();
      this.video_ = null;
      this.trackId_ = -1;
    };

    /** @private */
    this.onTextChanged_ = () => {
      const newTrackNodes = new Map();
      const tracks = this.player_.getTextTracks();
      for (const track of tracks) {
        let mode;
        if (track.active) {
          mode = this.visible_ ? 'showing' : 'hidden';
          this.trackId_ = track.id;
        } else {
          mode = 'disabled';
        }
        let trackNode;
        if (this.trackNodes_.has(track.id)) {
          trackNode = this.trackNodes_.get(track.id);
          if (trackNode.track.mode !== mode) {
            trackNode.track.mode = mode;
          }
          this.trackNodes_.delete(track.id);
        } else {
          let kind = 'subtitles';
          if (track.forced && shaka.util.Platform.isApple()) {
            kind = 'forced';
          } else if (
            track.kind === 'caption' || (
              track.roles &&
              track.roles.some(
                  (role) => role.includes('transcribes-spoken-dialog'),
              ) &&
              track.roles.some(
                  (role) => role.includes('describes-music-and-sound'),
              )
            )
          ) {
            kind = 'captions';
          }
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

          trackNode = /** @type {!HTMLTrackElement} */
            (this.video_.ownerDocument.createElement('track'));
          trackNode.kind = kind;
          trackNode.label = label || `${track.originalTextId
          }${track.language ? ` (${track.language})` : ''}`;
          if (track.language in mozilla.LanguageMapping) {
            trackNode.srclang = track.language;
          }
          // To avoid an issue of the built-in captions menu in Chrome
          if (shaka.util.Platform.isChrome()) {
            trackNode.src = 'data:,WEBVTT';
            trackNode.track.mode = 'disabled';
          } else {
            trackNode.track.mode = mode;
          }
          this.video_.appendChild(trackNode);
        }
        newTrackNodes.set(track.id, trackNode);
      }
      if (this.trackId_ > -1) {
        if (newTrackNodes.has(this.trackId_)) {
          const trackNode = newTrackNodes.get(this.trackId_);
          // new tracks are disable before appending on Chrome
          if (trackNode.track.mode === 'disabled') {
            trackNode.track.mode = this.visible_ ? 'showing' : 'hidden';
          }
        } else {
          this.trackId_ = -1;
        }
      }
      for (const trackNode of this.trackNodes_.values()) {
        trackNode.remove();
      }
      this.trackNodes_ = newTrackNodes;
    };

    /** @private */
    this.onChange_ = () => {
      if (this.hasMicroTask_) {
        return;
      }
      this.hasMicroTask_ = true;
      Promise.resolve(this.video_).then((video) => {
        this.hasMicroTask_ = false;
        if (this.video_ !== video) {
          return;
        }
        let trackId = -1;
        // Prefer previously selected track.
        if (this.trackId_ > -1) {
          const trackNode = this.trackNodes_.get(this.trackId_);
          if (trackNode.track.mode === 'showing') {
            trackId = this.trackId_;
          } else if (trackNode.track.mode === 'hidden') {
            for (const [
              /** @type {number} */id,
              /** @type {HTMLTrackElement} */trackNode,
            ] of /** @type {!Map} */(this.trackNodes_)) {
              if (id !== this.trackId_ && trackNode.track.mode === 'showing') {
                trackId = id;
                break;
              }
            }
            if (trackId < 0) {
              trackId = this.trackId_;
            }
          }
        }
        if (trackId < 0) {
          for (const [
            /** @type {number} */id,
            /** @type {HTMLTrackElement} */trackNode,
          ] of /** @type {!Map} */(this.trackNodes_)) {
            if (trackNode.track.mode === 'showing') {
              trackId = id;
              break;
            } else if (trackId === -1 && trackNode.track.mode === 'hidden') {
              trackId = id;
            }
          }
        }
        for (const [
          /** @type {number} */id,
          /** @type {HTMLTrackElement} */trackNode,
        ] of /** @type {!Map} */(this.trackNodes_)) {
          const mode = id === trackId ?
            this.visible_ ? 'showing' : 'hidden' :
            'disabled';
          if (trackNode.track.mode != mode) {
            trackNode.track.mode = mode;
          }
        }
        if (this.trackId_ !== trackId) {
          this.trackId_ = trackId;
          this.player_.selectTextTrack(
              /** @type {!shaka.extern.TextTrack} */({id: trackId}),
          );
        }
      });
    };

    player.addEventListener(
        shaka.util.FakeEvent.EventName.Loaded,
        this.onLoaded_,
    );
  }

  /**
   * @override
   * @export
   */
  configure(config) { }

  /**
   * @override
   * @export
   */
  remove(start, end) {
    if (!this.video_ || this.trackId_ < 0) {
      return false;
    }

    shaka.text.SimpleTextDisplayer.removeWhere_(
        this.trackNodes_.get(this.trackId_).track,
        (cue) => cue.startTime < end && cue.endTime > start,
    );

    return true;
  }

  /**
   * @override
   * @export
   */
  append(cues) {
    if (!this.video_ || this.trackId_ < 0) {
      return;
    }
    const flattenedCues = shaka.text.Utils.getCuesToFlatten(cues);

    // Convert cues.
    const textTrackCues = [];
    const textTrack = this.trackNodes_.get(this.trackId_).track;
    const cuesInTextTrack = textTrack.cues ?
      Array.from(textTrack.cues) : [];

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
      textTrack.addCue(cue);
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
      } else {
        this.player_.removeEventListener(
            shaka.util.FakeEvent.EventName.Loaded,
            this.onLoaded_,
        );
      }
      this.player_ = null;
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
    if (this.trackId_ > -1) {
      const trackNode = this.trackNodes_.get(this.trackId_);
      if (trackNode) {
        const mode = on ? 'showing' : 'hidden';
        if (trackNode.track.mode !== mode) {
          trackNode.track.mode = mode;
        }
      }
    }
  }

  /**
   * @override
   * @export
   */
  setTextLanguage(language) { }

  /**
   * @override
   * @export
   */
  enableTextDisplayer() { }

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
    let disabled = false;

    if (track.mode === 'disabled') {
      disabled = true;
      track.mode = 'hidden';
      goog.asserts.assert(
          track.cues,
          'Cues should be accessible when mode is set to "hidden".',
      );
    }

    let i = 0;
    while (i < track.cues.length) {
      const cue = track.cues[i];
      if (predicate(cue)) {
        track.removeCue(cue);
      } else {
        i++;
      }
    }

    if (disabled) {
      track.mode = 'disabled';
    }
  }
};
