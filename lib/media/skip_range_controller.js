/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.SkipRangeController');

goog.require('shaka.log');
goog.require('shaka.util.NumberUtils');
goog.requireType('shaka.media.SegmentReference');


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

    // Alignment verdicts keyed by range identity (a merge/split makes a new
    // object, so it starts unresolved).  A range is "resolved" once it is in
    // one of these; only alignable ranges may be carved.
    /** @private {!WeakSet<shaka.media.SkipRangeController.SkipRange>} */
    this.alignable_ = new WeakSet();
    /** @private {!WeakSet<shaka.media.SkipRangeController.SkipRange>} */
    this.unalignable_ = new WeakSet();
  }

  /**
   * Declares a range [start, end) to be skipped.  An empty/reversed interval is
   * rejected; otherwise the range is always accepted.  A new range that
   * overlaps or touches (within a small tolerance) any existing ranges is
   * merged with all of them into a single coalesced range -- transitively, so
   * one add can bridge several existing ranges.  The merged set stays disjoint
   * and sorted by start, so a segment falls in at most one range.  The range is
   * recorded even if it (or the playhead) is currently buffered: the skip is
   * postponed, acting only once the region can be turned into a real gap (its
   * span is fully unbuffered) -- the streaming side gates that.  Callers apply
   * any manifest stream-type guard first.
   *
   * @param {number} start
   * @param {number} end
   * @return {boolean} True if the range was accepted; false only if it was an
   *   empty/reversed interval.
   */
  add(start, end) {
    if (end <= start) {
      return false;
    }
    const tolerance = shaka.media.SkipRangeController.TOLERANCE_SECONDS;
    let merged = {start, end};
    const untouched = [];
    // Fold every overlapping/touching range into |merged|.  Ranges that don't
    // touch it are kept as-is.  Because the stored set was already disjoint,
    // one pass coalesces all of them transitively.
    for (const other of this.skipRanges_) {
      const overlaps = merged.start <= other.end + tolerance &&
          other.start <= merged.end + tolerance;
      if (overlaps) {
        merged = {
          start: Math.min(merged.start, other.start),
          end: Math.max(merged.end, other.end),
        };
      } else {
        untouched.push(other);
      }
    }
    untouched.push(merged);
    untouched.sort((a, b) => a.start - b.start);
    this.skipRanges_ = untouched;
    this.playerInterface_.requestUpdate();
    return true;
  }

  /**
   * Subtracts the interval [start, end) from the stored ranges, so its content
   * is fetched normally again the next time the region is reached.  This is
   * interval subtraction, not an exact-match delete: removing a sub-interval of
   * a range trims it, and removing from its middle splits it in two.  Endpoints
   * within a small tolerance of a stored range's own boundary snap to it, so a
   * slightly-off remove doesn't leave a sliver behind (and can fully restore a
   * range an equally-slightly-off remove would otherwise miss).  If streaming
   * already committed a hole, the playhead still crosses it as an ordinary gap;
   * re-fetching happens when the region is next reached.
   *
   * @param {number} start
   * @param {number} end
   */
  remove(start, end) {
    if (end <= start) {
      return;
    }
    const NumberUtils = shaka.util.NumberUtils;
    const tolerance = shaka.media.SkipRangeController.TOLERANCE_SECONDS;
    const next = [];
    let changed = false;
    for (const r of this.skipRanges_) {
      // Snap the cut endpoints to this range's own boundaries when they're
      // within tolerance, so float jitter doesn't leave slivers or miss a
      // full-range removal.
      const cutStart = NumberUtils.isFloatEqual(start, r.start, tolerance) ?
          r.start : start;
      const cutEnd = NumberUtils.isFloatEqual(end, r.end, tolerance) ?
          r.end : end;
      // Cut lies entirely outside this range: keep it untouched.
      if (cutEnd <= r.start || cutStart >= r.end) {
        next.push(r);
        continue;
      }
      changed = true;
      // Left fragment survives if the cut starts after the range start.
      if (cutStart - r.start > tolerance) {
        next.push({start: r.start, end: cutStart});
      }
      // Right fragment survives if the cut ends before the range end.
      if (r.end - cutEnd > tolerance) {
        next.push({start: cutEnd, end: r.end});
      }
    }
    if (!changed) {
      return;
    }
    next.sort((a, b) => a.start - b.start);
    this.skipRanges_ = next;
    this.playerInterface_.requestUpdate();
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
   * Matching is tolerant on both sides of each boundary so a segment time that
   * misses the raw boundary by float jitter still lines up: a segment starting
   * within tolerance *below* |region.start| still counts as inside, and one
   * starting within tolerance of |region.end| is treated as *at* the end (the
   * first kept segment) rather than inside -- so nothing extra is dropped.
   *
   * @param {number} time
   * @return {?shaka.media.SkipRangeController.SkipRange}
   */
  getRangeAt(time) {
    const NumberUtils = shaka.util.NumberUtils;
    const tolerance = shaka.media.SkipRangeController.TOLERANCE_SECONDS;
    for (const region of this.skipRanges_) {
      if (time > region.start - tolerance && time < region.end &&
          !NumberUtils.isFloatEqual(time, region.end, tolerance)) {
        return region;
      }
    }
    return null;
  }

  /**
   * The skip range |time| falls in that is currently *acting* (unbuffered), or
   * null.  Used only by run-ahead math (timeNeededPast): an already-buffered
   * range must not push the frontier past it, or it stalls at the buffered
   * edge.  The per-segment skip decision instead uses containingActiveRange,
   * which is buffer-independent -- see there.
   *
   * @param {number} time
   * @return {?shaka.media.SkipRangeController.SkipRange}
   */
  activeRangeAt(time) {
    const region = this.forwardRangeAt_(time);
    if (!region ||
        this.playerInterface_.isRegionBuffered(region.start, region.end)) {
      return null;
    }
    return region;
  }

  /**
   * The skip range a concrete segment [startTime, endTime) may be carved out
   * of, or null.  Backs the per-segment skip/discard decisions on every stream
   * and entry point (fetch frontier, append guard, prefetch).
   *
   * Deliberately buffer-independent: gating on isRegionBuffered is
   * self-defeating, since the first in-range append flips the range "buffered"
   * and stops every stream skipping, leaving misaligned partial fills that
   * gap-jump can't clear (the seek-into-range stall).  A range is skippable
   * only once the reference grid confirms it aligns to segment boundaries on
   * both ends (markAlignable); until resolved, or if unalignable, this returns
   * null.
   *
   * @param {number} startTime
   * @param {number} endTime
   * @return {?shaka.media.SkipRangeController.SkipRange}
   */
  containingActiveRange(startTime, endTime) {
    const tolerance = shaka.media.SkipRangeController.TOLERANCE_SECONDS;
    const region = this.forwardRangeAt_(startTime);
    if (!region || endTime > region.end + tolerance ||
        !this.alignable_.has(region)) {
      return null;
    }
    return region;
  }

  /**
   * Whether a segment may still be dropped by a skip range, so prefetch should
   * defer.  True while its containing range is alignable or unresolved (may
   * yet be carved); false once the range is confirmed unalignable (it will be
   * kept).
   *
   * @param {number} startTime
   * @param {number} endTime
   * @return {boolean}
   */
  mayBeSkipped(startTime, endTime) {
    const tolerance = shaka.media.SkipRangeController.TOLERANCE_SECONDS;
    const region = this.forwardRangeAt_(startTime);
    if (!region || endTime > region.end + tolerance) {
      return false;
    }
    return !this.unalignable_.has(region);
  }

  /**
   * The range |time| falls in when the skip may apply at all: non-empty set and
   * forward playback.  Shared by activeRangeAt (which then adds the buffered
   * gate) and containingActiveRange (which does not).
   *
   * @param {number} time
   * @return {?shaka.media.SkipRangeController.SkipRange}
   * @private
   */
  forwardRangeAt_(time) {
    if (this.isEmpty() || this.playerInterface_.getPlaybackRate() < 0) {
      // TODO: Support reverse trick play, which walks the index backwards.
      return null;
    }
    return this.getRangeAt(time);
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

  /**
   * @param {shaka.media.SkipRangeController.SkipRange} region
   * @return {boolean} Whether the reference grid has resolved this range's
   *   boundary alignment yet (in either alignable_ or unalignable_).
   */
  isResolved(region) {
    return this.alignable_.has(region) || this.unalignable_.has(region);
  }

  /**
   * @param {shaka.media.SkipRangeController.SkipRange} region
   * @return {boolean} Whether the range was confirmed not to align to video
   *   segment boundaries (never carved on any stream).
   */
  isUnalignable(region) {
    return this.unalignable_.has(region);
  }

  /**
   * Records whether |region| aligns to video segment boundaries on both ends,
   * given the video segments covering its start and end (from the streaming
   * side, which owns the indices).  It aligns when a segment starts at
   * region.start AND a segment boundary lands at region.end (the end segment
   * starts or ends there).  Aligned ranges snap to those boundaries and become
   * skippable; misaligned ranges are never skipped and warn once.  Runs once
   * per range.
   *
   * A boundary matches an endpoint when it lies within tolerance on either
   * side; the closest wins, since the window can span more than one boundary.
   * Callers pass the candidate segments (a lone segment is accepted as
   * shorthand).
   *
   * @param {shaka.media.SkipRangeController.SkipRange} region
   * @param {?shaka.media.SegmentReference|
   *         !Array<!shaka.media.SegmentReference>} startSegs Segments that may
   *   carry a boundary matching region.start.
   * @param {?shaka.media.SegmentReference|
   *         !Array<!shaka.media.SegmentReference>} endSegs Segments that may
   *   carry a boundary matching region.end.
   */
  resolveAlignment(region, startSegs, endSegs) {
    // A hole can only begin where a segment does, so the start must meet a
    // segment start; the end may meet either boundary, as both are points the
    // first kept segment can start from.
    const alignedStart = this.closestBoundary_(
        region.start, startSegs, (ref) => [ref.startTime]);
    const alignedEnd = this.closestBoundary_(
        region.end, endSegs, (ref) => [ref.startTime, ref.endTime]);
    if (alignedStart == null || alignedEnd == null) {
      this.markUnalignable_(region);
      return;
    }
    this.markAlignable_(region, alignedStart, alignedEnd);
  }

  /**
   * The segment boundary closest to |time| among |segs|, or null if none is
   * within tolerance.
   *
   * @param {number} time
   * @param {?shaka.media.SegmentReference|
   *         !Array<!shaka.media.SegmentReference>} segs
   * @param {function(!shaka.media.SegmentReference):!Array<number>} boundsOf
   *   The boundaries of a segment that |time| may snap to.
   * @return {?number}
   * @private
   */
  closestBoundary_(time, segs, boundsOf) {
    const tolerance = shaka.media.SkipRangeController.TOLERANCE_SECONDS;
    let best = null;
    let bestError = Infinity;
    for (const ref of (Array.isArray(segs) ? segs : [segs])) {
      if (!ref) {
        continue;
      }
      for (const boundary of boundsOf(ref)) {
        const error = Math.abs(boundary - time);
        if (error <= tolerance && error < bestError) {
          best = boundary;
          bestError = error;
        }
      }
    }
    return best;
  }

  /**
   * Snaps |region|'s endpoints to the aligned boundaries (so merge/split stay
   * aligned) and marks it skippable.
   *
   * @param {shaka.media.SkipRangeController.SkipRange} region
   * @param {number} start
   * @param {number} end
   * @private
   */
  markAlignable_(region, start, end) {
    const changed = region.start !== start || region.end !== end;
    region.start = start;
    region.end = end;
    this.alignable_.add(region);
    if (changed) {
      this.skipRanges_.sort((a, b) => a.start - b.start);
    }
  }

  /**
   * Marks |region| unskippable and warns once (visible by default) that the
   * app's range could not be honored.
   *
   * @param {shaka.media.SkipRangeController.SkipRange} region
   * @private
   */
  markUnalignable_(region) {
    this.unalignable_.add(region);
    shaka.log.warning('addSkipRange(): range [' + region.start + ', ' +
        region.end + ') does not align to video segment boundaries on both ' +
        'ends, so it cannot form a clean hole and will not be skipped; ' +
        'align the range to segment boundaries.');
  }
};


/**
 * The tolerance, in seconds, for matching skip-range endpoints against segment
 * boundaries and for coalescing adjacent ranges.  Application-supplied times
 * (e.g. ad-server times from MediaTailor) miss segment boundaries by fractions
 * of a second; this absorbs that jitter so a slightly-off boundary still lines
 * up with the segment grid instead of fetching the whole segment.  Shared with
 * shaka.media.StreamingEngine so both sides agree.
 *
 * @const {number}
 */
shaka.media.SkipRangeController.TOLERANCE_SECONDS = 1e-3;


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
