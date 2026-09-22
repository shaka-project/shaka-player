/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.msf.MediaTimeline');

goog.require('shaka.log');
goog.require('shaka.util.StringUtils');

goog.requireType('shaka.msf.Utils');


/**
 * The map between media time and MoQT Location for one or more tracks.
 *
 * MoQT addresses content by Group and Object, and media by presentation
 * timestamp; nothing in the transport relates the two. Without that relation a
 * player can only ever ask for the live edge, because a time it wants to seek
 * to names no Location it could subscribe from. The media timeline is what
 * supplies it, and with it the seekable range stops being "whatever has
 * already arrived".
 *
 * MSF carries the relation two ways, and this class holds both because a
 * presentation may use either:
 *
 *  - An explicit timeline track, whose Objects are JSON documents listing one
 *    record per published Group. It is authoritative, covers variable Group
 *    durations, and states what is still accessible.
 *  - A template on the media track itself, which states a start and a constant
 *    interval. It is unbounded: it describes Locations that have not been
 *    published yet as readily as ones long past.
 *
 * Where both describe the same time, the explicit records win: they are
 * observations of what was published, while the template is a prediction.
 *
 * @see https://datatracker.ietf.org/doc/draft-ietf-moq-msf/ section 8
 *
 * @final
 */
shaka.msf.MediaTimeline = class {
  /** */
  constructor() {
    /**
     * Explicit entries, sorted ascending by media time.
     *
     * @private {!Array<shaka.msf.MediaTimeline.Entry>}
     */
    this.entries_ = [];

    /**
     * The Locations the explicit entries already cover, so a record repeated
     * across an incremental update is not stored twice.
     *
     * @private {!Set<string>}
     */
    this.locations_ = new Set();

    /** @private {?shaka.msf.MediaTimeline.Template} */
    this.template_ = null;
  }

  /**
   * Whether anything is known at all. An empty timeline answers null to every
   * lookup, and the parser treats it as though there were no timeline.
   *
   * @return {boolean}
   */
  isEmpty() {
    return !this.entries_.length && !this.template_;
  }

  /**
   * Takes in one Object of a media timeline track.
   *
   * The first Object of each Group is independent: it carries every record
   * accessible at that point, so it replaces what came before rather than
   * adding to it, and a record that has aged out of it is gone from the
   * timeline too. The Objects after it in the same Group carry only what is
   * new (MSF section 8.3).
   *
   * @param {!Uint8Array} data The Object payload, a JSON document.
   * @param {boolean} independent Whether this is the first Object of a Group.
   * @return {boolean} True if the timeline changed.
   */
  addObject(data, independent) {
    let parsed;
    try {
      parsed = JSON.parse(shaka.util.StringUtils.fromUTF8(data));
    } catch (error) {
      shaka.log.warning('Discarding an unparseable media timeline object',
          error);
      return false;
    }

    if (!Array.isArray(parsed)) {
      shaka.log.warning(
          'Discarding a media timeline object that is not an array', parsed);
      return false;
    }

    const entries = [];
    let discarded = 0;
    for (const record of parsed) {
      const entry = shaka.msf.MediaTimeline.parseEntry_(record);
      if (entry) {
        entries.push(entry);
      } else {
        discarded++;
      }
    }
    if (discarded) {
      // One malformed record is not a reason to throw away a document that is
      // otherwise a usable seek map, but it is worth saying out loud.
      shaka.log.warning(
          `Discarded ${discarded} malformed media timeline record(s)`);
    }

    if (independent) {
      this.entries_ = [];
      this.locations_.clear();
    } else if (!entries.length) {
      return false;
    }

    for (const entry of entries) {
      const key = shaka.msf.MediaTimeline.key_(entry.group, entry.object);
      if (this.locations_.has(key)) {
        continue;
      }
      this.locations_.add(key);
      this.entries_.push(entry);
    }

    // Records are published in order, so this sorts an almost-sorted array in
    // the ordinary case; it is here for the publisher that does not.
    this.entries_.sort((a, b) => a.time - b.time);
    return true;
  }

  /**
   * Takes in the `template` field of a catalog track.
   *
   * @param {!Array<*>} template
   * @return {boolean} True if the template was usable.
   */
  setTemplate(template) {
    const parsed = shaka.msf.MediaTimeline.parseTemplate_(template);
    if (!parsed) {
      shaka.log.warning('Ignoring a malformed media timeline template',
          template);
      return false;
    }
    this.template_ = parsed;
    return true;
  }

  /**
   * The earliest media time this timeline describes, in seconds, or null when
   * it describes nothing.
   *
   * For an explicit timeline this is the oldest record the publisher still
   * offers, which is the start of the seekable range. For a template it is the
   * start of the presentation, which the publisher asserts is addressable.
   *
   * @return {?number}
   */
  getStartTime() {
    const times = [];
    if (this.entries_.length) {
      times.push(this.entries_[0].time);
    }
    if (this.template_) {
      times.push(this.template_.startTime);
    }
    return times.length ? Math.min(...times) : null;
  }

  /**
   * The latest media time an explicit record describes, in seconds, or null
   * when there are none.
   *
   * A template has no end: it extrapolates as far as it is asked to. The live
   * edge is the presentation timeline's business, not this class's, so a
   * template-only timeline answers null here rather than inventing one.
   *
   * @return {?number}
   */
  getEndTime() {
    return this.entries_.length ?
        this.entries_[this.entries_.length - 1].time : null;
  }

  /**
   * The Location to subscribe from in order to receive the media that covers
   * the given presentation time, or null when the timeline cannot say.
   *
   * The answer is the entry at or before that time, because a subscription
   * that started at the entry after it would skip the content asked for.
   *
   * @param {number} time In seconds.
   * @return {?shaka.msf.Utils.Location}
   */
  locationForTime(time) {
    const entry = this.entryForTime_(time);
    if (entry) {
      return {group: entry.group, object: entry.object, subgroup: null};
    }
    return null;
  }

  /**
   * The presentation time of the media at a Location, in seconds, or null when
   * the timeline does not describe that Location.
   *
   * @param {shaka.msf.Utils.Location} location
   * @return {?number}
   */
  timeForLocation(location) {
    for (const entry of this.entries_) {
      if (entry.group == location.group && entry.object == location.object) {
        return entry.time;
      }
    }

    const template = this.template_;
    if (!template) {
      return null;
    }

    // Invert location[n] = start + n * delta. Only one of the two deltas has
    // to be non-zero -- a template that advances by Group alone is the common
    // one -- so the index comes from whichever moves, and the other coordinate
    // then has to agree with what the template predicts for that index.
    let index;
    if (template.deltaGroup) {
      const groups = location.group - template.startGroup;
      if (groups % template.deltaGroup) {
        return null;
      }
      index = groups / template.deltaGroup;
    } else {
      const objects = location.object - template.startObject;
      if (objects % template.deltaObject) {
        return null;
      }
      index = objects / template.deltaObject;
    }

    if (index < BigInt(0)) {
      return null;
    }
    const predicted = shaka.msf.MediaTimeline.atIndex_(template, index);
    if (predicted.group != location.group ||
        predicted.object != location.object) {
      return null;
    }
    return predicted.time;
  }

  /**
   * The wallclock time at which the media at the given presentation time was
   * encoded, in milliseconds since the epoch, or null when it is not known.
   *
   * MSF says a publisher that does not know it sends 0, which is also what a
   * VOD asset carries, so a zero is reported as "not known" rather than as
   * 1 January 1970.
   *
   * @param {number} time In seconds.
   * @return {?number}
   */
  wallClockForTime(time) {
    const entry = this.entryForTime_(time);
    if (!entry || !entry.wallClock) {
      return null;
    }
    // The entry covers a Group, so interpolate across it rather than reporting
    // the Group's start for every time inside it.
    return entry.wallClock + (time - entry.time) * 1000;
  }

  /**
   * The entry covering a presentation time: the last one at or before it.
   *
   * @param {number} time In seconds.
   * @return {?shaka.msf.MediaTimeline.Entry}
   * @private
   */
  entryForTime_(time) {
    // The entries are sorted, and a long DVR window holds one per Group for
    // however long the publisher retains, so this is a binary search for the
    // last entry at or before the time rather than a walk.
    let low = 0;
    let high = this.entries_.length - 1;
    let found = null;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.entries_[mid].time <= time) {
        found = this.entries_[mid];
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (found) {
      return found;
    }

    const template = this.template_;
    if (!template) {
      return null;
    }

    // Before the template's own start there is nothing to extrapolate back
    // to, so the first entry is the best answer.
    const elapsed = Math.max(0, time - template.startTime);
    const index = BigInt(Math.floor(elapsed * 1000 / template.deltaTime));
    return shaka.msf.MediaTimeline.atIndex_(template, index);
  }

  /**
   * Expands a template at one index, per the formulas in MSF section 8.4.1.
   *
   * @param {shaka.msf.MediaTimeline.Template} template
   * @param {bigint} index
   * @return {shaka.msf.MediaTimeline.Entry}
   * @private
   */
  static atIndex_(template, index) {
    const n = Number(index);
    return {
      time: template.startTime + (n * template.deltaTime) / 1000,
      group: template.startGroup + index * template.deltaGroup,
      object: template.startObject + index * template.deltaObject,
      wallClock: template.startWallClock ?
          template.startWallClock + n * template.deltaWallClock : 0,
    };
  }

  /**
   * Reads one record of the explicit format: a media presentation timestamp in
   * milliseconds, a Location as a two-number array, and a wallclock time in
   * milliseconds since the epoch.
   *
   * @param {*} record
   * @return {?shaka.msf.MediaTimeline.Entry}
   * @private
   */
  static parseEntry_(record) {
    if (!Array.isArray(record) || record.length < 3) {
      return null;
    }
    const time = shaka.msf.MediaTimeline.readNumber_(record[0]);
    const location = record[1];
    const wallClock = shaka.msf.MediaTimeline.readNumber_(record[2]);
    if (time == null || wallClock == null || wallClock < 0 ||
        !Array.isArray(location) || location.length < 2) {
      return null;
    }
    const group = shaka.msf.MediaTimeline.readIndex_(location[0]);
    const object = shaka.msf.MediaTimeline.readIndex_(location[1]);
    if (group == null || object == null) {
      return null;
    }
    return {time: time / 1000, group, object, wallClock};
  }

  /**
   * Reads the six mandatory values of the template format, in the fixed order
   * MSF section 8.4.1 gives them.
   *
   * @param {!Array<*>} template
   * @return {?shaka.msf.MediaTimeline.Template}
   * @private
   */
  static parseTemplate_(template) {
    if (!Array.isArray(template) || template.length < 6) {
      return null;
    }
    const startTime = shaka.msf.MediaTimeline.readNumber_(template[0]);
    const deltaTime = shaka.msf.MediaTimeline.readNumber_(template[1]);
    const start = template[2];
    const delta = template[3];
    const startWallClock = shaka.msf.MediaTimeline.readNumber_(template[4]);
    const deltaWallClock = shaka.msf.MediaTimeline.readNumber_(template[5]);

    if (startTime == null || deltaTime == null || deltaTime <= 0 ||
        startWallClock == null || startWallClock < 0 ||
        deltaWallClock == null || deltaWallClock < 0 ||
        !Array.isArray(start) || start.length < 2 ||
        !Array.isArray(delta) || delta.length < 2) {
      return null;
    }

    const startGroup = shaka.msf.MediaTimeline.readIndex_(start[0]);
    const startObject = shaka.msf.MediaTimeline.readIndex_(start[1]);
    const deltaGroup = shaka.msf.MediaTimeline.readIndex_(delta[0]);
    const deltaObject = shaka.msf.MediaTimeline.readIndex_(delta[1]);
    if (startGroup == null || startObject == null ||
        deltaGroup == null || deltaObject == null) {
      return null;
    }
    if (!deltaGroup && !deltaObject) {
      // The Location would never advance, so every time would map to the same
      // Object and the template would describe a still frame.
      return null;
    }

    return {
      startTime: startTime / 1000,
      deltaTime,
      startGroup,
      startObject,
      deltaGroup,
      deltaObject,
      startWallClock,
      deltaWallClock,
    };
  }

  /**
   * @param {*} value
   * @return {?number} The value when it is a finite JSON Number, else null.
   * @private
   */
  static readNumber_(value) {
    if (typeof value != 'number' || !isFinite(value)) {
      return null;
    }
    return value;
  }

  /**
   * Reads a Group or Object ID, which are MoQT var ints and so cannot be
   * negative or fractional.
   *
   * @param {*} value
   * @return {?bigint}
   * @private
   */
  static readIndex_(value) {
    const number = shaka.msf.MediaTimeline.readNumber_(value);
    if (number == null || number < 0 || !Number.isInteger(number)) {
      return null;
    }
    return BigInt(number);
  }

  /**
   * @param {bigint} group
   * @param {bigint} object
   * @return {string}
   * @private
   */
  static key_(group, object) {
    return `${group}:${object}`;
  }
};


/**
 * One media timeline record: the media presentation time of an Object, in
 * seconds, where it sits in the track, and when it was encoded, in
 * milliseconds since the epoch, or 0 when that is not known.
 *
 * @typedef {{
 *   time: number,
 *   group: bigint,
 *   object: bigint,
 *   wallClock: number,
 * }}
 */
shaka.msf.MediaTimeline.Entry;


/**
 * A parsed media timeline template. Times are seconds for the start and
 * milliseconds for the intervals, matching how each is used: the start is
 * compared against presentation times, the intervals are multiplied by an
 * index.
 *
 * @typedef {{
 *   startTime: number,
 *   deltaTime: number,
 *   startGroup: bigint,
 *   startObject: bigint,
 *   deltaGroup: bigint,
 *   deltaObject: bigint,
 *   startWallClock: number,
 *   deltaWallClock: number,
 * }}
 */
shaka.msf.MediaTimeline.Template;
