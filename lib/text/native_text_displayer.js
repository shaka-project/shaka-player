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
goog.require('shaka.util.ManifestParserUtils');
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

    /** @private {?shaka.extern.TextDisplayerConfiguration} */
    this.config_ = null;

    /** @private {?HTMLMediaElement} */
    this.video_ = null;

    /** @private {Map<number, !HTMLTrackElement>} */
    this.trackNodes_ = new Map();

    /**
     * ID of the currently active text track. -1 means no track is active.
     * @private {number}
     */
    this.trackId_ = -1;

    /** @private {boolean} */
    this.visible_ = false;

    /**
     * Timer used to debounce the textTracks 'change' event.
     * @private {?shaka.util.Timer}
     */
    this.timer_ = null;

    // Bind private methods so they can be correctly added and removed
    // as event listeners while keeping the right 'this' context.
    // eslint-disable-next-line no-restricted-syntax
    this.onUnloading_ = this.onUnloading_.bind(this);
    // eslint-disable-next-line no-restricted-syntax
    this.onTextChanged_ = this.onTextChanged_.bind(this);
    // eslint-disable-next-line no-restricted-syntax
    this.onChange_ = this.onChange_.bind(this);

    this.eventManager_.listen( player,
        shaka.util.FakeEvent.EventName.Loaded, () => this.checkMsePlayback_());

    this.checkMsePlayback_();
  }

  /**
   * @override
   * @export
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * Removes cues whose time range overlaps with [start, end).
   * Returns false only if this instance has already been destroyed.
   *
   * @override
   * @export
   */
  remove(start, end) {
    if (!this.player_) {
      return false;
    }

    const activeTrack = this.getActiveTrack_();
    if (activeTrack) {
      shaka.text.Utils.removeCuesFromTextTrack(
          activeTrack, (cue) => cue.startTime < end && cue.endTime > start );
    }

    return true;
  }

  /**
   * Appends cues to the active track, applying the subtitle delay if set.
   *
   * @override
   * @export
   */
  append(cues) {
    const activeTrack = this.getActiveTrack_();
    if (!activeTrack) {
      return;
    }

    const delay = this.config_?.subtitleDelay ?? 0;
    const adjustedCues = delay !== 0 ?
      cues.map((cue) => {
        const shifted = cue.clone();
        shifted.startTime = Math.max(0, shifted.startTime + delay);
        shifted.endTime = Math.max(0, shifted.endTime + delay);
        return shifted;
      }) :
      cues;

    shaka.text.Utils.appendCuesToTextTrack(activeTrack, adjustedCues);
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

    this.timer_?.stop();
    this.timer_ = null;
    this.eventManager_?.release();
    this.eventManager_ = null;

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
   * Shows or hides subtitles. Handles both MSE and SRC_EQUALS playback modes.
   *
   * @override
   * @export
   */
  setTextVisibility(on) {
    this.visible_ = on;

    const activeTrack = this.getActiveTrack_();
    if (activeTrack) {
      this.applyVisibilityToTrack_(activeTrack, on);
      return;
    }

    if (this.isSrcEqualsMode_()) {
      this.applyVisibilityToSrcEqualsTracks_(on);
    }
  }

  /**
   * @override
   * @export
   */
  setTextLanguage(_language) {
    // unused
  }

  /**
   * Cleans up internal state when the player starts unloading content.
   * Registered with listenOnce, so it fires at most once per playback session.
   *
   * @private
   */
  onUnloading_() {
    this.timer_?.stop();
    this.timer_ = null;

    this.eventManager_.unlisten(this.player_,
        shaka.util.FakeEvent.EventName.TextChanged, this.onTextChanged_);
    this.eventManager_.unlisten(this.video_.textTracks,
        'change', this.onChange_);

    for (const trackNode of this.trackNodes_.values()) {
      trackNode.remove();
    }
    this.trackNodes_.clear();
    this.trackId_ = -1;
    this.video_ = null;
  }

  /**
   * Synchronises the DOM <track> elements with the player's track list.
   * Creates elements for new tracks, reuses existing ones, and removes
   * any that are no longer present.
   *
   * @private
   */
  onTextChanged_() {
    /** @type {Map<number, !HTMLTrackElement>} */
    const newTrackNodes = new Map();
    const tracks = this.player_.getTextTracks();

    for (const track of tracks) {
      const trackNode = this.trackNodes_.has(track.id) ?
          this.reuseTrackNode_(track) : this.createTrackNode_(track);

      newTrackNodes.set(track.id, trackNode);

      if (track.active) {
        this.trackId_ = track.id;
      }
    }

    // Remove from the DOM any tracks no longer in the player's list.
    for (const trackNode of this.trackNodes_.values()) {
      trackNode.remove();
    }

    this.trackNodes_ = newTrackNodes;
    this.activateCurrentTrack_();
  }

  /**
   * Handles manual changes to the video's textTracks (e.g. the user enables a
   * track through the browser's native subtitle menu). Applies debounce because
   * the 'change' event can fire multiple times in quick succession.
   *
   * @private
   */
  onChange_() {
    if (this.timer_) {
      // A tick is already queued; the debounce absorbs additional events.
      return;
    }

    // Snapshot the current video reference so we can detect if it changes
    // while the timer is pending (e.g. an unload happens in the meantime).
    const videoSnapshot = this.video_;

    this.timer_ = new shaka.util.Timer(() => {
      this.timer_ = null;

      if (this.video_ !== videoSnapshot) {
        return;
      }

      const resolvedTrackId = this.resolveActiveTrackId_();
      this.disableAllTracksExcept_(resolvedTrackId);

      if (this.trackId_ !== resolvedTrackId) {
        this.trackId_ = resolvedTrackId;
        this.syncTrackSelectionWithPlayer_(resolvedTrackId);
      }
    }).tickAfter(0);
  }

  /**
   * Returns the active TextTrack, or null if none is currently active.
   *
   * @return {?TextTrack}
   * @private
   */
  getActiveTrack_() {
    return this.trackNodes_.has(this.trackId_) ?
        this.trackNodes_.get(this.trackId_).track : null;
  }

  /**
   * Applies the visibility mode to a specific track without touching tracks
   * that are already 'disabled' (e.g. manually turned off by the user).
   *
   * @param {TextTrack} track
   * @param {boolean} visible
   * @private
   */
  applyVisibilityToTrack_(track, visible) {
    if (track.mode === 'disabled') {
      return;
    }
    const targetMode = visible ? 'showing' : 'hidden';
    if (track.mode !== targetMode) {
      track.mode = targetMode;
    }
  }

  /**
   * Returns true if the player is currently in SRC_EQUALS mode.
   *
   * @return {boolean}
   * @private
   */
  isSrcEqualsMode_() {
    if (!this.player_) {
      return false;
    }
    const LoadMode = shaka.text.NativeTextDisplayer.LoadMode;
    return this.player_.getLoadMode() === LoadMode.SRC_EQUALS;
  }

  /**
   * Manages subtitle visibility in SRC_EQUALS mode, where tracks are controlled
   * directly by the HTMLMediaElement rather than MSE.
   *
   * @param {boolean} on
   * @private
   */
  applyVisibilityToSrcEqualsTracks_(on) {
    const textTracks = Array.from(this.player_.getMediaElement().textTracks)
        .filter((track) =>
          ['captions', 'subtitles', 'forced'].includes(track.kind));

    if (on) {
      // If a track is already 'showing', do nothing to avoid disrupting state.
      const alreadyShowing = textTracks.some((t) => t.mode === 'showing');
      if (!alreadyShowing) {
        const firstHidden = textTracks.find((t) => t.mode === 'hidden');
        if (firstHidden) {
          firstHidden.mode = 'showing';
        }
      }
    } else {
      for (const track of textTracks) {
        if (track.mode === 'showing') {
          track.mode = 'hidden';
        }
      }
    }
  }

  /**
   * Reuses an existing <track> DOM node for a known track.
   * Disables the node if the track is no longer active, and removes the entry
   * from the original map so that onTextChanged_ can detect orphaned nodes.
   *
   * @param {!shaka.extern.TextTrack} track
   * @return {!HTMLTrackElement}
   * @private
   */
  reuseTrackNode_(track) {
    const trackNode = this.trackNodes_.get(track.id);
    if (!track.active && trackNode.track.mode !== 'disabled') {
      trackNode.track.mode = 'disabled';
    }
    this.trackNodes_.delete(track.id);
    return trackNode;
  }

  /**
   * Creates a new <track> DOM element for the given track and appends it to
   * the video element.
   *
   * @param {!shaka.extern.TextTrack} track
   * @return {!HTMLTrackElement}
   * @private
   */
  createTrackNode_(track) {
    const trackNode = /** @type {!HTMLTrackElement} */ (
      this.video_.ownerDocument.createElement('track'));

    trackNode.kind = this.getTrackKind_(track);
    trackNode.label = this.getTrackLabel_(track);
    trackNode.srclang = this.resolveTrackLanguage_(track);

    // Chrome may refuse to list tracks without a src in its built-in caption
    // menu. In Safari, toggling a track from 'disabled'/'hidden' back to
    // 'showing' without a src causes a visible flash. The minimal WEBVTT data
    // URL prevents both issues.
    trackNode.src = 'data:,WEBVTT';
    trackNode.track.mode = 'disabled';

    this.video_.appendChild(trackNode);
    return trackNode;
  }

  /**
   * Resolves the appropriate srclang value for a track based on its declared
   * language. Falls back to 'und' (undetermined) if the language is unknown.
   *
   * @param {!shaka.extern.TextTrack} track
   * @return {string}
   * @private
   */
  resolveTrackLanguage_(track) {
    if (!track.language) {
      return 'und';
    }
    if (track.language in mozilla.LanguageMapping) {
      return track.language;
    }
    return shaka.util.LanguageUtils.getBase(track.language) ?? 'und';
  }

  /**
   * Activates the track identified by this.trackId_ among the newly built
   * nodes, respecting the current mode if it was changed manually by the user.
   *
   * @private
   */
  activateCurrentTrack_() {
    if (this.trackId_ <= -1) {
      return;
    }

    if (!this.trackNodes_.has(this.trackId_)) {
      this.trackId_ = -1;
      return;
    }

    const track = this.trackNodes_.get(this.trackId_).track;
    // Only update the mode when the track is 'disabled'. If the user changed
    // it manually (e.g. hid it), we respect that choice; onChange_ will update
    // visible_ accordingly.
    if (track.mode === 'disabled') {
      track.mode = this.visible_ ? 'showing' : 'hidden';
    }
  }

  /**
   * Determines which track should be active after a 'change' event.
   * Prefers the previously selected track; otherwise picks the first 'showing'
   * track, and falls back to the first 'hidden' track.
   *
   * @return {number} The ID of the track to activate, or -1 if none.
   * @private
   */
  resolveActiveTrackId_() {
    let trackId = -1;

    // Prefer the previously active track.
    if (this.trackNodes_.has(this.trackId_)) {
      const mode = this.trackNodes_.get(this.trackId_).track.mode;
      if (mode === 'showing') {
        return this.trackId_;
      }
      if (mode === 'hidden') {
        trackId = this.trackId_;
      }
    }

    // Fallback: find any 'showing' track, or the first 'hidden' one.
    for (const id of this.trackNodes_.keys()) {
      const trackNode = /** @type {!HTMLTrackElement} */ (
        this.trackNodes_.get(id));
      if (trackNode.track.mode === 'showing') {
        return id;
      }
      if (trackId < 0 && trackNode.track.mode === 'hidden') {
        trackId = id;
      }
    }

    return trackId;
  }

  /**
   * Sets all tracks except the specified one to 'disabled', avoiding
   * unnecessary change events on tracks that are already disabled.
   *
   * @param {number} keepTrackId
   * @private
   */
  disableAllTracksExcept_(keepTrackId) {
    const keepNode = this.trackNodes_.get(keepTrackId);
    for (const trackNode of this.trackNodes_.values()) {
      if (trackNode !== keepNode && trackNode.track.mode !== 'disabled') {
        trackNode.track.mode = 'disabled';
      }
    }
  }

  /**
   * Notifies the player of the newly selected track, or clears the selection
   * if trackId is -1.
   *
   * @param {number} trackId
   * @private
   */
  syncTrackSelectionWithPlayer_(trackId) {
    if (trackId > -1) {
      this.player_.selectTextTrack(
          /** @type {!shaka.extern.TextTrack} */ ({id: trackId}));
    } else {
      this.player_.selectTextTrack();
    }
  }

  /**
   * Initialises MSE integration if the player is already in MEDIA_SOURCE mode.
   * Called from the constructor and again on each 'Loaded' event.
   *
   * @private
   */
  checkMsePlayback_() {
    if (this.video_ || !this.player_) {
      return;
    }

    const LoadMode = shaka.text.NativeTextDisplayer.LoadMode;
    if (this.player_.getLoadMode() !== LoadMode.MEDIA_SOURCE) {
      return;
    }

    this.video_ = this.player_.getMediaElement();

    this.eventManager_.listenOnce(this.player_,
        shaka.util.FakeEvent.EventName.Unloading, this.onUnloading_);
    this.eventManager_.listen(this.player_,
        shaka.util.FakeEvent.EventName.TextChanged, this.onTextChanged_);
    this.eventManager_.listen(this.video_.textTracks,
        'change', this.onChange_);

    this.onTextChanged_();
  }

  /**
   * Returns the appropriate `kind` value for a <track> element.
   * WebKit requires the 'forced' kind for forced tracks; other browsers use
   * 'captions' for closed captions and 'subtitles' as the default.
   *
   * @param {!shaka.extern.TextTrack} track
   * @return {string}
   * @private
   */
  getTrackKind_(track) {
    const device = shaka.device.DeviceFactory.getDevice();
    if (track.forced && device.getBrowserEngine() ===
        shaka.device.IDevice.BrowserEngine.WEBKIT) {
      return 'forced';
    }
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    if (track.kind === ManifestParserUtils.TextStreamKind.CLOSED_CAPTION) {
      return 'captions';
    }
    return 'subtitles';
  }

  /**
   * Builds a human-readable label for a track. Priority order:
   * 1. track.label (if explicitly set)
   * 2. Intl.DisplayNames resolution (when available)
   * 3. Full language name from LanguageMapping (exact match)
   * 4. Base language name from LanguageMapping with variant in parentheses
   * 5. originalTextId with the language code in parentheses if they differ
   *
   * @param {!shaka.extern.TextTrack} track
   * @return {string}
   * @private
   */
  getTrackLabel_(track) {
    if (track.label) {
      return track.label;
    }

    if (track.language) {
      const base = shaka.util.LanguageUtils.getBase(track.language);

      // 1. Intl.DisplayNames — preferred when available: provides OS-level
      //    resolution for any valid BCP-47 tag in the user's UI locale without
      //    relying on a hand-maintained mapping.
      if (window.Intl && 'DisplayNames' in Intl) {
        try {
          const displayNames = new Intl.DisplayNames(track.language,
              {type: 'language', languageDisplay: 'standard'});
          const displayName = displayNames.of(track.language);
          // Only prefer it when it's reliable
          if (displayName &&
              displayName.toLowerCase() != track.language.toLowerCase()) {
            return displayName.charAt(0).toUpperCase() + displayName.slice(1);
          }
        } catch (_e) {
          // Intl.DisplayNames may throw for malformed tags; fall through.
        }
      }

      // 2. Exact match in mozilla.LanguageMapping.
      const exactMatch = mozilla.LanguageMapping[track.language];
      if (exactMatch) {
        return exactMatch;
      }

      // 3. Base-language match in mozilla.LanguageMapping, with the full tag
      //    shown in parentheses so the variant is still visible to the user.
      const baseMatch = base && mozilla.LanguageMapping[base];
      if (baseMatch) {
        return base === track.language ?
            baseMatch : `${baseMatch} (${track.language})`;
      }
    }

    // Last resort: use originalTextId, coercing nullish values to an empty
    // string.
    const fallback = String(track.originalTextId ?? '');
    if (track.language && track.language !== track.originalTextId) {
      return `${fallback} (${track.language})`;
    }

    return fallback;
  }
};

/**
 * Named constants mirroring shaka.Player.LoadMode to avoid magic numbers.
 * @enum {number}
 */
shaka.text.NativeTextDisplayer.LoadMode = {
  MEDIA_SOURCE: 2,
  SRC_EQUALS: 3,
};
