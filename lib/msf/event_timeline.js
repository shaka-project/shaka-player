/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.msf.EventTimeline');

goog.require('shaka.log');
goog.require('shaka.util.StringUtils');

goog.requireType('shaka.msf.Utils');


/**
 * The records of one MSF event timeline track, and which of them have been
 * reported.
 *
 * An event timeline associates ad hoc metadata with the presentation: each
 * record carries a `data` value, whose structure its track's `eventType`
 * defines, and exactly one index reference saying where it applies -- a media
 * time, a wallclock time or a MoQT Location (MSF section 8.1). This class
 * handles what every event type has in common and leaves `data` alone.
 *
 * Placing a record on the presentation timeline is the caller's business,
 * since a Location or a wallclock time needs a media timeline to be placed.
 * A record that cannot be placed yet is held until it can, and every record is
 * reported once, the first time it can be placed. That matters because the
 * publisher repeats every record still accessible at the start of each Group,
 * and because where a record is placed can shift as the media timeline grows.
 *
 * @see https://datatracker.ietf.org/doc/draft-ietf-moq-msf/ section 8
 *
 * @final
 */
shaka.msf.EventTimeline = class {
  /**
   * @param {function(shaka.msf.EventTimeline.Record):?number} getTime Places
   *   a record on the presentation timeline, in seconds, or answers null when
   *   it cannot be placed yet.
   * @param {function(shaka.msf.EventTimeline.Record, number)} onRecord
   *   Receives each record, once, with where it was placed.
   */
  constructor(getTime, onRecord) {
    /**
     * @private {function(shaka.msf.EventTimeline.Record):?number}
     */
    this.getTime_ = getTime;

    /** @private {function(shaka.msf.EventTimeline.Record, number)} */
    this.onRecord_ = onRecord;

    /**
     * The IDs of the records already reported and still accessible.
     *
     * @private {!Set<string>}
     */
    this.reported_ = new Set();

    /**
     * The records waiting to be placed, by ID, in arrival order.
     *
     * @private {!Map<string, shaka.msf.EventTimeline.Record>}
     */
    this.pending_ = new Map();
  }

  /**
   * Takes in one Object of the track, and reports every record that can be
   * placed.
   *
   * The first Object of each Group is independent: it carries every record
   * still accessible, so a record missing from it has aged out and will not be
   * sent again. The Objects after it in the same Group carry only what is new
   * (MSF section 8.3).
   *
   * @param {!Uint8Array} data The Object payload, a JSON document.
   * @param {boolean} independent Whether this is the first Object of a Group.
   */
  addObject(data, independent) {
    let parsed;
    try {
      parsed = JSON.parse(shaka.util.StringUtils.fromUTF8(data));
    } catch (error) {
      shaka.log.warning('Discarding an unparseable event timeline object',
          error);
      return;
    }
    if (!Array.isArray(parsed)) {
      shaka.log.warning(
          'Discarding an event timeline object that is not an array', parsed);
      return;
    }

    const records = [];
    let discarded = 0;
    for (const item of parsed) {
      const record = shaka.msf.EventTimeline.parseRecord_(item);
      if (record) {
        records.push(record);
      } else {
        discarded++;
      }
    }
    if (discarded) {
      shaka.log.warning(
          `Discarded ${discarded} malformed event timeline record(s)`);
    }

    if (independent && (records.length || !discarded)) {
      // Forgetting what has aged out is what keeps these from growing for as
      // long as the presentation runs. A document in which nothing was
      // readable says nothing about what aged out, so it is not taken as a
      // reason to forget.
      const current = new Set(records.map((record) => record.id));
      for (const id of this.reported_) {
        if (!current.has(id)) {
          this.reported_.delete(id);
        }
      }
      for (const id of this.pending_.keys()) {
        if (!current.has(id)) {
          this.pending_.delete(id);
        }
      }
    }

    for (const record of records) {
      if (this.reported_.has(record.id) || this.pending_.has(record.id)) {
        continue;
      }
      this.pending_.set(record.id, record);
      if (this.pending_.size > shaka.msf.EventTimeline.MAX_PENDING_) {
        // A record that never becomes placeable -- one whose wallclock time no
        // media timeline ever covers, say -- must not be held forever. The
        // oldest goes first.
        const oldest = this.pending_.keys().next().value;
        shaka.log.warning('Discarding an event timeline record that could ' +
            'not be placed on the presentation timeline',
        this.pending_.get(oldest));
        this.pending_.delete(oldest);
      }
    }

    this.resolve();
  }

  /**
   * Reports every pending record that can now be placed, and leaves the
   * others waiting. Called when what places them -- a media timeline -- has
   * changed.
   */
  resolve() {
    for (const record of Array.from(this.pending_.values())) {
      const time = this.getTime_(record);
      if (time == null) {
        continue;
      }
      this.pending_.delete(record.id);
      this.reported_.add(record.id);
      this.onRecord_(record, time);
    }
  }

  /**
   * Reads one record: exactly one index reference and a `data` value.
   *
   * @param {*} item
   * @return {?shaka.msf.EventTimeline.Record}
   * @private
   */
  static parseRecord_(item) {
    if (!item || typeof item != 'object' || Array.isArray(item)) {
      return null;
    }
    const object = /** @type {!Object} */ (item);
    if (!('data' in object)) {
      return null;
    }
    const data = object['data'];

    // MSF writes the index references as T, L and M, and some of the
    // specifications of event types as t, l and m, so either is accepted. A
    // record may carry only one.
    let index = '';
    let value;
    for (const key of Object.keys(object)) {
      const lower = key.toLowerCase();
      if (lower == 'm' || lower == 't' || lower == 'l') {
        if (index) {
          return null;
        }
        index = lower;
        value = object[key];
      }
    }
    if (!index) {
      return null;
    }

    let time = 0;
    /** @type {?shaka.msf.Utils.Location} */
    let location = null;
    let valueText;
    if (index == 'l') {
      if (!Array.isArray(value) || value.length < 2 ||
          !shaka.msf.EventTimeline.isLocationIndex_(value[0]) ||
          !shaka.msf.EventTimeline.isLocationIndex_(value[1])) {
        return null;
      }
      location = {
        group: BigInt(value[0]),
        object: BigInt(value[1]),
        subgroup: null,
      };
      valueText = `${value[0]},${value[1]}`;
    } else {
      if (typeof value != 'number' || !isFinite(value) || value < 0) {
        return null;
      }
      time = value;
      valueText = String(value);
    }

    return {
      // Two records can share an index reference -- an SCTE-35 splice and
      // its cancellation, say -- so what they carry is part of what identifies
      // them.
      id: `${index}:${valueText}:` +
          shaka.msf.EventTimeline.hash_(JSON.stringify(data) || ''),
      index,
      time,
      location,
      data,
    };
  }

  /**
   * @param {*} value
   * @return {boolean} Whether the value can be a Group or Object ID.
   * @private
   */
  static isLocationIndex_(value) {
    return typeof value == 'number' && Number.isInteger(value) && value >= 0;
  }

  /**
   * A short, stable hash of a string (32-bit FNV-1a), for identifiers that
   * have to tell long strings apart without carrying them.
   *
   * @param {string} text
   * @return {string}
   * @private
   */
  static hash_(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
  }
};


/**
 * One event timeline record.
 *
 * @typedef {{
 *   id: string,
 *   index: string,
 *   time: number,
 *   location: ?shaka.msf.Utils.Location,
 *   data: *,
 * }}
 *
 * @property {string} id
 *   Identifies the record across the documents that repeat it: its index
 *   reference and a hash of its data.
 * @property {string} index
 *   Which index reference it carries: 'm' for media time, 't' for wallclock
 *   time or 'l' for Location.
 * @property {number} time
 *   For 'm' the media time, and for 't' the wallclock time, both in
 *   milliseconds. 0 for 'l'.
 * @property {?shaka.msf.Utils.Location} location
 *   For 'l', the Location. Null otherwise.
 * @property {*} data
 *   The record's `data`, as parsed from JSON. Its structure is defined by the
 *   track's `eventType`.
 */
shaka.msf.EventTimeline.Record;


/**
 * How many records may wait to be placed.
 *
 * @private @const {number}
 */
shaka.msf.EventTimeline.MAX_PENDING_ = 100;
