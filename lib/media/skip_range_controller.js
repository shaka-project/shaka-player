/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.SkipRangeController');

goog.require('shaka.log');


/**
 * @summary Owns the set of skip ranges -- regions [start, end) whose segments
 * are treated as if they do not exist (never fetched, gap-jumped by the
 * playhead).  Player owns the instance so ranges added before load survive
 * until streaming starts; the streaming side decides when each range actually
 * becomes a gap.
 */
shaka.media.SkipRangeController = class {
  /**
   * @param {shaka.media.SkipRangeController.PlayerInterface} playerInterface
   */
  constructor(playerInterface) {
    /**
     * Disjoint ranges to skip.
     * @private {!Array<shaka.media.SkipRangeController.SkipRange>}
     */
    this.skipRanges_ = [];

    /** @private {!shaka.media.SkipRangeController.PlayerInterface} */
    this.playerInterface_ = playerInterface;
  }

  /**
   * Declares a range [start, end) to be skipped.  Rejects only an
   * empty/reversed interval or a range that overlaps or touches an existing
   * one.  The range is always recorded even if it (or the playhead) is
   * currently buffered: the skip is postponed, acting only once the region can
   * be turned into a real gap (its span is fully unbuffered) -- the streaming
   * side gates that.  Callers apply any manifest stream-type guard first.
   *
   * @param {number} start
   * @param {number} end
   * @return {boolean} True if the range was accepted; false if it was rejected
   *   (empty/reversed interval, or overlaps an existing range).
   */
  add(start, end) {
    if (end <= start) {
      return false;
    }
    // Keep ranges disjoint so a segment falls in at most one.
    for (const other of this.skipRanges_) {
      if (end >= other.start && start <= other.end) {
        shaka.log.warning('addSkipRange(): range overlaps/touches another; ' +
            'coalesce them; ignoring', start, end);
        return false;
      }
    }
    this.skipRanges_.push({start, end});
    this.playerInterface_.requestUpdate();
    return true;
  }

  /**
   * Removes a range (matched by the same start/end), so its content is fetched
   * normally again the next time the region is reached.  Always removes the
   * range; if streaming already committed the hole, the playhead still crosses
   * it as an ordinary gap and seeking back re-fetches the region normally.
   *
   * @param {number} start
   * @param {number} end
   */
  remove(start, end) {
    this.skipRanges_ = this.skipRanges_.filter((r) => {
      return r.start != start || r.end != end;
    });
  }

  /**
   * Drops all skip ranges.  Already-buffered holes are left as-is; only ranges
   * not yet reached are affected (their content then fetches normally).
   */
  clear() {
    this.skipRanges_ = [];
  }

  /**
   * @return {!Array<shaka.media.SkipRangeController.SkipRange>} The active skip
   *   ranges.
   */
  getAll() {
    return this.skipRanges_;
  }

  /**
   * @return {boolean} True if there are no skip ranges.
   */
  isEmpty() {
    return this.skipRanges_.length == 0;
  }

  /**
   * The skip range containing |time| (start in [start, end)), or null.  Ranges
   * hold raw request times; comparing each stream's own segment times against
   * them keeps the decision correct per stream, since audio and video segment
   * boundaries are not aligned.
   *
   * @param {number} time
   * @return {?shaka.media.SkipRangeController.SkipRange}
   */
  getRangeAt(time) {
    for (const region of this.skipRanges_) {
      if (time >= region.start && time < region.end) {
        return region;
      }
    }
    return null;
  }

  /**
   * The skip range |time| falls in that is currently *acting*, or null.  A
   * range only acts while none of it is buffered: one over buffered content, or
   * with the playhead inside it, is inert and plays through -- forming its gap
   * only once the region is clear again.
   *
   * @param {number} time
   * @return {?shaka.media.SkipRangeController.SkipRange}
   */
  activeRangeAt(time) {
    if (this.isEmpty() || this.playerInterface_.getPlaybackRate() < 0) {
      // TODO: Support reverse trick play, which walks the index backwards.
      return null;
    }
    const region = this.getRangeAt(time);
    if (!region ||
        this.playerInterface_.isRegionBuffered(region.start, region.end)) {
      return null;
    }
    return region;
  }

  /**
   * Advances |time| past the acting skip range it falls in (else returns it
   * unchanged), so run-ahead math treats the gap as absent.  An inert range is
   * left in place, or the frontier would stall at the buffered edge.
   *
   * @param {number} time
   * @return {number}
   */
  timeNeededPast(time) {
    const region = this.activeRangeAt(time);
    return region ? region.end : time;
  }
};


/**
 * A skip range, as the raw application-supplied request times.  Each stream
 * compares its own segment times against these, so misaligned audio/video
 * boundaries are handled correctly per stream.
 *
 * @typedef {{
 *   start: number,
 *   end: number,
 * }}
 */
shaka.media.SkipRangeController.SkipRange;


/**
 * @typedef {{
 *   requestUpdate: function():void,
 *   getPlaybackRate: function():number,
 *   isRegionBuffered: function(number, number):boolean
 * }}
 *
 * @summary Player interface.  All members no-op / report a neutral value before
 *   load (no streaming engine yet), so ranges added early are simply queued.
 *
 * requestUpdate schedules an immediate streaming update.
 * getPlaybackRate is the current playback rate (negative in reverse).
 * isRegionBuffered reports whether any part of [start, end) is buffered for any
 * content type currently streaming.
 */
shaka.media.SkipRangeController.PlayerInterface;
