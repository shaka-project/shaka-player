/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.Scte35Timeline');

goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.ObjectUtils');
goog.require('shaka.util.TXml');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Uint8ArrayUtils');

/**
 * Owns SCTE-35 messages independently of generic manifest and metadata regions.
 * Identity does not include duration, which may become known in a later update.
 * @implements {shaka.util.IReleasable}
 */
shaka.media.Scte35Timeline = class extends shaka.util.FakeEventTarget {
  /** @param {!function():{start: number, end: number}} getRange */
  constructor(getRange) {
    super();
    /** @private @const {!function():{start: number, end: number}} */
    this.getRange_ = getRange;
    /** @private @const {!Set<shaka.extern.Scte35Event>} */
    this.events_ = new Set();
    /** @private @const {!Map<string, shaka.extern.Scte35Event>} */
    this.identities_ = new Map();
    /** @private @const {!Map<string, shaka.extern.Scte35Event>} */
    this.messages_ = new Map();
    /** @private @const {!shaka.util.Timer} */
    this.timer_ = new shaka.util.Timer(() => this.filter_());
    /** @private {boolean} */
    this.released_ = false;
  }

  /** @param {?shaka.extern.Scte35Event} event */
  addEvent(event) {
    if (this.released_ || !event || !Number.isFinite(event.startTime)) {
      return;
    }
    const retentionEnd = event.startTime + (event.duration || 0);
    if (retentionEnd < this.getRange_().start) {
      return;
    }
    const origin = event.origins[0];
    const identity = this.identity_(event, origin);
    const message = this.message_(event);
    // Repeated MPDs, playlists, renditions and in-band copies share one entry.
    const existing = (identity ? this.identities_.get(identity) : null) ||
        this.messages_.get(message);
    if (existing) {
      let changed = false;
      if (!existing.origins.some((o) => o.source == origin.source &&
          o.id == origin.id && o.scope == origin.scope &&
          o.schemeIdUri == origin.schemeIdUri)) {
        existing.origins.push(shaka.util.ObjectUtils.cloneObject(origin));
        changed = true;
      }
      // HLS supplies the confirmed splice duration; emsg's event duration
      // describes its envelope and must not overwrite it on each segment.
      const hasHls = existing.origins.some((o) => o.source == 'hls');
      const hasDash = existing.origins.some((o) => o.source == 'dash');
      if (event.duration != null && existing.duration != event.duration &&
          (existing.duration == null || origin.source == 'hls' ||
           (!hasHls && (origin.source == 'dash' || !hasDash)))) {
        existing.duration = event.duration;
        changed = true;
      }
      if (origin.source == 'hls' && existing.kind != event.kind) {
        existing.kind = event.kind;
        changed = true;
      }
      if (event.plannedDuration != null &&
          existing.plannedDuration != event.plannedDuration) {
        existing.plannedDuration = event.plannedDuration;
        changed = true;
      }
      if (this.message_(existing) != message) {
        this.messages_.delete(this.message_(existing));
        existing.rawData = event.rawData;
        existing.data = event.data ? event.data.slice() : null;
        existing.xml = event.xml ? shaka.util.TXml.cloneNode(event.xml) : null;
        existing.command = shaka.util.ObjectUtils.cloneObject(event.command);
        existing.segmentationDescriptors = shaka.util.ObjectUtils.cloneObject(
            event.segmentationDescriptors);
        existing.ptsAdjustment = event.ptsAdjustment;
        existing.status = event.status;
        changed = true;
      } else {
        // Keep both representations when the same message arrives via XML
        // and binary transports.
        if (!existing.data && event.data) {
          existing.data = event.data.slice();
          changed = true;
        }
        if (!existing.xml && event.xml) {
          existing.xml = shaka.util.TXml.cloneNode(event.xml);
          changed = true;
        }
      }
      if (identity) {
        this.identities_.set(identity, existing);
      }
      this.messages_.set(message, existing);
      if (changed) {
        this.dispatch_('scte35updated', existing);
      }
      return;
    }
    const copy = shaka.media.Scte35Timeline.clone(event);
    this.events_.add(copy);
    if (identity) {
      this.identities_.set(identity, copy);
    }
    this.messages_.set(message, copy);
    if (this.events_.size == 1) {
      this.timer_.tickEvery(2);
    }
    this.dispatch_('scte35added', copy);
  }

  /** @return {!Iterable<shaka.extern.Scte35Event>} */
  events() {
    return this.events_.values();
  }

  /**
   * Application-visible copies must not expose writable internal byte arrays.
   * @param {shaka.extern.Scte35Event} event
   * @return {shaka.extern.Scte35Event}
   */
  static clone(event) {
    const copy = shaka.util.ObjectUtils.cloneObject(event);
    copy.data = event.data ? event.data.slice() : null;
    copy.xml = event.xml ? shaka.util.TXml.cloneNode(event.xml) : null;
    return copy;
  }

  /** @override */
  release() {
    this.released_ = true;
    this.timer_.stop();
    this.events_.clear();
    this.identities_.clear();
    this.messages_.clear();
    super.release();
  }

  /**
   * @param {shaka.extern.Scte35Event} event
   * @param {shaka.extern.Scte35Origin} origin
   * @return {string}
   * @private
   */
  identity_(event, origin) {
    // An absent ID cannot identify simultaneous commands.
    return origin.id && origin.source != 'emsg' ? JSON.stringify([
      origin.source, origin.scope, origin.id, origin.schemeIdUri.trim(),
      event.startTime, event.kind,
    ]) : '';
  }

  /**
   * @param {shaka.extern.Scte35Event} event
   * @return {string}
   * @private
   */
  message_(event) {
    // Match XML and binary only when the supported semantic fields agree.
    // Preserve raw identity for unknown messages and unknown descriptors.
    const payload = event.status == 'parsed' ? [
      event.ptsAdjustment, event.command, event.segmentationDescriptors,
    ] : event.data ? shaka.util.Uint8ArrayUtils.toHex(event.data) :
        event.xml || event.rawData;
    return JSON.stringify([event.startTime, payload]);
  }

  /** @private */
  filter_() {
    const start = this.getRange_().start;
    for (const event of this.events_) {
      if (event.startTime + (event.duration || 0) < start) {
        this.events_.delete(event);
      }
    }
    this.identities_.forEach((event, key) => {
      if (!this.events_.has(event)) {
        this.identities_.delete(key);
      }
    });
    this.messages_.forEach((event, key) => {
      if (!this.events_.has(event)) {
        this.messages_.delete(key);
      }
    });
    if (!this.events_.size) {
      this.timer_.stop();
    }
  }

  /**
   * @param {string} type
   * @param {shaka.extern.Scte35Event} event
   * @private
   */
  dispatch_(type, event) {
    this.dispatchEvent(new shaka.util.FakeEvent(type,
        new Map().set('detail', shaka.media.Scte35Timeline.clone(event))));
  }
};
