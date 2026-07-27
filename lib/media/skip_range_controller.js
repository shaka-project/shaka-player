/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.SkipRangeController');

goog.require('shaka.log');
goog.requireType('shaka.util.ManifestParserUtils');


/**
 * @summary Owns the set of skip ranges -- regions [start, end) whose segments
 * are treated as if they do not exist (never fetched, gap-jumped by the
 * playhead).  Player owns the instance so ranges added before load survive
 * until streaming starts, and supplies the streaming-side capabilities through
 * a PlayerInterface (empty before load, so the buffered checks then no-op).
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
   * Declares a range [start, end) to be skipped.  Rejects an empty/reversed
   * interval, a range that overlaps or touches an existing one, or (while
   * streaming) a range whose start is already buffered.  Callers apply any
   * manifest stream-type guard first.
   *
   * @param {number} start
   * @param {number} end
   * @return {boolean} True if the range was accepted; false if it was rejected
   *   (empty/reversed interval, overlaps an existing range, or already
   *   buffered).
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
    // Check the range's own start, not the fetch frontier: addSkipRange never
    // removes buffered content, so the range must already be a hole.
    for (const type of this.playerInterface_.getContentTypes()) {
      if (this.playerInterface_.isBuffered(type, start)) {
        shaka.log.warning('addSkipRange(): range already buffered; ignoring',
            start, end);
        return false;
      }
    }
    this.skipRanges_.push({start, end});
    this.playerInterface_.requestUpdate();
    return true;
  }

  /**
   * Removes a range (matched by the same start/end), so its content is fetched
   * normally again.  While streaming, ignored once the hole is committed
   * (buffer end already past |start|; no eviction or rebuffer).
   *
   * @param {number} start
   * @param {number} end
   */
  remove(start, end) {
    for (const type of this.playerInterface_.getContentTypes()) {
      const bufferEnd = this.playerInterface_.bufferEnd(type);
      if (bufferEnd != null && bufferEnd > start) {
        shaka.log.warning('removeSkipRange(): range already buffered; ' +
            'ignoring', start, end);
        return;
      }
    }
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
   * Advances |time| to the end of any skip range it falls in, so run-ahead and
   * end-of-stream math treat the range as absent.
   *
   * @param {number} time
   * @return {number}
   */
  getTimePast(time) {
    const region = this.getRangeAt(time);
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
 *   getContentTypes:
 *       function():!Array<shaka.util.ManifestParserUtils.ContentType>,
 *   isBuffered:
 *       function(shaka.util.ManifestParserUtils.ContentType, number):boolean,
 *   bufferEnd:
 *       function(shaka.util.ManifestParserUtils.ContentType):?number,
 *   requestUpdate: function():void
 * }}
 *
 * @summary Player interface.  Reports no content types before load, so the
 *   buffered checks no-op until streaming exists.  |ContentType| is
 *   shaka.util.ManifestParserUtils.ContentType.
 *
 * getContentTypes returns the content types currently being streamed.
 * isBuffered reports whether a time is buffered for a content type.
 * bufferEnd is the buffer end for a content type, or null if none.
 * requestUpdate schedules an immediate streaming update.
 */
shaka.media.SkipRangeController.PlayerInterface;
