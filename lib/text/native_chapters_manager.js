/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.NativeChaptersManager');

goog.require('shaka.log');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IReleasable');
goog.requireType('shaka.util.FakeEventTarget');


/**
 * Mirrors the player's chapters into native <track kind="chapters"> elements,
 * so that the browser's own media controls can list them.
 *
 * The native tracks only carry the chapter titles; the player's chapter API
 * keeps the full information (e.g. images).
 *
 * @implements {shaka.util.IReleasable}
 * @final
 */
shaka.text.NativeChaptersManager = class {
  /**
   * @param {!HTMLMediaElement} mediaElement
   * @param {!shaka.util.FakeEventTarget} player
   * @param {shaka.text.NativeChaptersManager.PlayerInterface_} playerInterface
   */
  constructor(mediaElement, player, playerInterface) {
    /** @private {HTMLMediaElement} */
    this.mediaElement_ = mediaElement;

    /** @private {?shaka.text.NativeChaptersManager.PlayerInterface_} */
    this.playerInterface_ = playerInterface;

    /**
     * The managed <track> elements and the chapters they hold, by language.
     *
     * @private {!Map<string, {node: !HTMLTrackElement, key: string}>}
     */
    this.trackNodes_ = new Map();

    /**
     * Incremented on every update, so that a slow update does not overwrite
     * the result of a newer one.
     *
     * @private {number}
     */
    this.updateId_ = 0;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    this.eventManager_.listenMulti(player, [
      shaka.util.FakeEvent.EventName.TracksChanged,
      shaka.util.FakeEvent.EventName.ManifestUpdated,
    ], () => this.update());

    this.update();
  }

  /** @override */
  release() {
    this.updateId_++;
    this.eventManager_.release();
    for (const entry of this.trackNodes_.values()) {
      entry.node.remove();
    }
    this.trackNodes_.clear();
    this.mediaElement_ = null;
    this.playerInterface_ = null;
  }

  /**
   * @param {!TextTrack} textTrack
   * @return {boolean} True if the track was created by this manager.
   */
  isManagedTrack(textTrack) {
    for (const entry of this.trackNodes_.values()) {
      if (entry.node.track === textTrack) {
        return true;
      }
    }
    return false;
  }

  /**
   * Brings the native tracks in line with the player's chapters.
   *
   * @return {!Promise}
   */
  async update() {
    const updateId = ++this.updateId_;
    if (!this.playerInterface_) {
      return;
    }

    /** @type {!Map<string, !Array<shaka.extern.Chapter>>} */
    const chaptersByLanguage = new Map();
    for (const language of this.playerInterface_.getChapterLanguages()) {
      // eslint-disable-next-line no-await-in-loop
      const chapters = await this.playerInterface_.getChapters(language);
      if (updateId != this.updateId_) {
        return;
      }
      if (chapters.length) {
        chaptersByLanguage.set(language, chapters);
      }
    }

    for (const language of Array.from(this.trackNodes_.keys())) {
      if (!chaptersByLanguage.has(language)) {
        this.trackNodes_.get(language).node.remove();
        this.trackNodes_.delete(language);
      }
    }

    for (const language of chaptersByLanguage.keys()) {
      const chapters = chaptersByLanguage.get(language);
      const key = chapters.map((c) => {
        return [c.id, c.startTime, c.endTime, c.title].join('\u0000');
      }).join('\u0001');
      const entry = this.trackNodes_.get(language);
      if (entry && entry.key == key) {
        continue;
      }
      if (entry) {
        entry.node.remove();
      }
      this.trackNodes_.set(language, {
        node: this.createTrackNode_(language, chapters),
        key,
      });
    }
  }

  /**
   * @param {string} language
   * @param {!Array<shaka.extern.Chapter>} chapters
   * @return {!HTMLTrackElement}
   * @private
   */
  createTrackNode_(language, chapters) {
    const trackNode = /** @type {!HTMLTrackElement} */ (
      this.mediaElement_.ownerDocument.createElement('track'));
    trackNode.kind = 'chapters';
    trackNode.srclang = language;
    // Like the NativeTextDisplayer, give the track a minimal WebVTT source.
    trackNode.src = 'data:,WEBVTT';
    this.mediaElement_.appendChild(trackNode);

    const track = trackNode.track;
    // The track only loads, and its cues are only exposed, while it is not
    // disabled.
    track.mode = 'hidden';

    // Loading the track (even when it fails) replaces its cue list, dropping
    // any cue added by script before, so add the cues once it is done.
    let cuesAdded = false;
    const addCues = () => {
      if (cuesAdded) {
        return;
      }
      cuesAdded = true;
      for (const chapter of chapters) {
        if (!(chapter.endTime > chapter.startTime)) {
          continue;
        }
        try {
          const cue = new VTTCue(
              chapter.startTime, chapter.endTime, chapter.title || '');
          cue.id = chapter.id;
          track.addCue(cue);
        } catch (error) {
          shaka.log.warning('Unable to add a native chapter cue', chapter,
              error);
        }
      }
    };
    this.eventManager_.listenOnce(trackNode, 'load', addCues);
    this.eventManager_.listenOnce(trackNode, 'error', addCues);
    return trackNode;
  }
};


/**
 * <code>getChapterLanguages</code> returns the normalized languages of the
 * player's chapter streams, and <code>getChapters</code> the chapters of those
 * streams in a language.
 *
 * @typedef {{
 *   getChapterLanguages: function():!Array<string>,
 *   getChapters: function(string):!Promise<!Array<shaka.extern.Chapter>>
 * }}
 * @private
 */
shaka.text.NativeChaptersManager.PlayerInterface_;
