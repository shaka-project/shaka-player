/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.CatalogStore');

goog.require('shaka.log');
goog.require('shaka.util.Error');


/**
 * Rebuilds the current catalog from the Objects of a catalog track.
 *
 * MSF maps the catalog onto the track like this (draft-ietf-moq-msf,
 * "Catalog"):
 *
 *  - Object 0 of every Group is an independent catalog, complete in itself.
 *  - The Objects after it in the same Group are delta updates, each applied
 *    to the document the ones before it produced.
 *  - An update that precedes the first Object of the latest Group is ignored.
 *
 * Objects do not have to arrive in that order. The catalog is joined with a
 * FETCH of the current Group running alongside a subscription for what comes
 * next, so a delta can be read before the independent catalog it applies to,
 * and an Object can be delivered by both. The store holds what it cannot
 * apply yet and drops what it has already seen, so the order it applies them
 * in is always the track's.
 *
 * @final
 */
shaka.msf.CatalogStore = class {
  /**
   * @param {string} catalogNamespace The catalog track's namespace, with its
   *   fields joined by "/". A track that declares no namespace inherits it,
   *   which is what makes a track named with and without its namespace the
   *   same track.
   */
  constructor(catalogNamespace) {
    /** @private {string} */
    this.catalogNamespace_ = catalogNamespace;

    /**
     * The Group the current catalog comes from, or null before the first
     * independent catalog.
     * @private {?bigint}
     */
    this.group_ = null;

    /**
     * The Object ID of the next delta to apply in the current Group.
     * @private {bigint}
     */
    this.nextObject_ = BigInt(0);

    /** @private {?msfCatalog.Catalog} */
    this.catalog_ = null;

    /**
     * Documents that cannot be applied yet, keyed by their Location.
     * @private {!Map<string, shaka.msf.CatalogStore.Entry_>}
     */
    this.pending_ = new Map();
  }

  /**
   * The catalog as of the last Object applied, or null before an independent
   * catalog has arrived.
   *
   * @return {?msfCatalog.Catalog}
   */
  getCatalog() {
    return this.catalog_;
  }

  /**
   * Adds the document carried by a catalog Object.
   *
   * @param {{group: bigint, object: bigint}} location
   * @param {!msfCatalog.Catalog} document
   * @return {boolean} Whether the catalog changed.
   */
  push(location, document) {
    const group = location.group;
    const object = location.object;

    if (this.group_ != null &&
        (group < this.group_ ||
        (group == this.group_ && object < this.nextObject_))) {
      // Either superseded by a newer independent catalog, or seen already:
      // the FETCH and the subscription that join the track can both deliver
      // the Object where they meet.
      shaka.log.v2('Ignoring stale catalog object', location);
      return false;
    }

    const key = shaka.msf.CatalogStore.key_(group, object);
    if (!this.pending_.has(key)) {
      if (this.pending_.size >= shaka.msf.CatalogStore.MAX_PENDING_) {
        shaka.log.warning('Too many catalog objects waiting for the ones ' +
            'before them; dropping', location);
        return false;
      }
      this.pending_.set(key, {group, object, document});
    }

    return this.drain_();
  }

  /**
   * Applies every held document that has become applicable.
   *
   * @return {boolean} Whether the catalog changed.
   * @private
   */
  drain_() {
    let changed = false;
    for (;;) {
      const next = this.takeNext_();
      if (!next) {
        return changed;
      }
      changed = this.apply_(next) || changed;
    }
  }

  /**
   * Removes and returns the held document that comes next, which is either
   * the next delta of the current Group or the independent catalog of the
   * newest Group that has one, whichever is newer.
   *
   * @return {?shaka.msf.CatalogStore.Entry_}
   * @private
   */
  takeNext_() {
    /** @type {?shaka.msf.CatalogStore.Entry_} */
    let newestStart = null;
    for (const entry of this.pending_.values()) {
      if (entry.object == BigInt(0) &&
          (this.group_ == null || entry.group > this.group_) &&
          (!newestStart || entry.group > newestStart.group)) {
        newestStart = entry;
      }
    }

    /** @type {?shaka.msf.CatalogStore.Entry_} */
    let next = newestStart;
    if (!next && this.group_ != null) {
      next = this.pending_.get(shaka.msf.CatalogStore.key_(
          this.group_, this.nextObject_)) || null;
    }
    if (!next) {
      return null;
    }

    this.pending_.delete(shaka.msf.CatalogStore.key_(next.group, next.object));
    if (next.object == BigInt(0)) {
      // A newer independent catalog makes everything held from older Groups
      // irrelevant.
      for (const entry of Array.from(this.pending_.values())) {
        if (entry.group < next.group) {
          this.pending_.delete(
              shaka.msf.CatalogStore.key_(entry.group, entry.object));
        }
      }
    }
    return next;
  }

  /**
   * @param {shaka.msf.CatalogStore.Entry_} entry
   * @return {boolean} Whether the catalog changed.
   * @private
   */
  apply_(entry) {
    const previous = this.catalog_;
    this.update_(entry);
    return !!this.catalog_ && (!previous ||
        shaka.msf.CatalogStore.contentOf_(previous) !=
        shaka.msf.CatalogStore.contentOf_(this.catalog_));
  }

  /**
   * Makes the catalog what an Object says it is.
   *
   * @param {shaka.msf.CatalogStore.Entry_} entry
   * @private
   */
  update_(entry) {
    const document = entry.document;
    const isDelta = Array.isArray(document.deltaUpdate);

    this.group_ = entry.group;
    this.nextObject_ = entry.object + BigInt(1);

    if (entry.object == BigInt(0)) {
      if (isDelta || !Array.isArray(document.tracks)) {
        // MSF requires Object 0 to be a complete catalog. Without one there
        // is nothing for the rest of the Group to apply to.
        shaka.log.warning(
            'Ignoring catalog group whose first object is not an ' +
            'independent catalog', entry.group, document);
        this.catalog_ = null;
        return;
      }
      // A version we cannot read leaves nothing for the deltas after it to
      // apply to.
      this.catalog_ = null;
      this.catalog_ = null;
      shaka.msf.CatalogStore.checkVersion_(document);
      this.catalog_ = document;
      return;
    }

    if (!this.catalog_) {
      return;
    }

    if (!isDelta) {
      // Only deltas may follow Object 0. A complete catalog in their place is
      // still a complete catalog, so it replaces rather than being lost.
      if (!Array.isArray(document.tracks)) {
        shaka.log.warning('Ignoring malformed catalog object', document);
        return;
      }
      shaka.log.warning('Catalog object ' + entry.object + ' of group ' +
          entry.group + ' is independent, but only deltas may follow the ' +
          'first object of a group');
      shaka.msf.CatalogStore.checkVersion_(document);
      this.catalog_ = document;
      return;
    }

    this.catalog_ = this.applyDelta_(this.catalog_, document);
  }

  /**
   * Applies a delta update to a catalog, returning the result. The catalog
   * passed in is left alone.
   *
   * @param {!msfCatalog.Catalog} catalog
   * @param {!msfCatalog.Catalog} delta
   * @return {!msfCatalog.Catalog}
   * @private
   */
  applyDelta_(catalog, delta) {
    const result = /** @type {!msfCatalog.Catalog} */ (
      structuredClone(catalog));
    if (delta.generatedAt != null) {
      result.generatedAt = delta.generatedAt;
    }

    // Operations apply in order, each to the document the previous one left,
    // and an operation that cannot be applied does not stop the rest.
    for (const operation of delta.deltaUpdate || []) {
      const tracks = Array.isArray(operation.tracks) ? operation.tracks : [];
      for (const track of tracks) {
        this.applyOperation_(result, operation.op, track);
      }
    }
    return result;
  }

  /**
   * @param {!msfCatalog.Catalog} catalog
   * @param {string} op
   * @param {!msfCatalog.Track} track
   * @private
   */
  applyOperation_(catalog, op, track) {
    switch (op) {
      case 'add': {
        if (this.indexOf_(catalog, track.namespace, track.name) != -1) {
          shaka.log.warning(
              'Ignoring catalog "add" of a track that already exists', track);
          return;
        }
        catalog.tracks.push(structuredClone(track));
        return;
      }
      case 'remove': {
        const index = this.indexOf_(catalog, track.namespace, track.name);
        if (index == -1) {
          shaka.log.warning(
              'Ignoring catalog "remove" of an unknown track', track);
          return;
        }
        catalog.tracks.splice(index, 1);
        return;
      }
      case 'clone': {
        const parent = this.findParent_(catalog, track);
        if (!parent) {
          shaka.log.warning(
              'Ignoring catalog "clone" of an unknown track', track);
          return;
        }
        const clone = shaka.msf.CatalogStore.override_(parent, track);
        if (this.indexOf_(catalog, clone.namespace, clone.name) != -1) {
          shaka.log.warning(
              'Ignoring catalog "clone" to a name already in use', track);
          return;
        }
        catalog.tracks.push(clone);
        return;
      }
      case 'update': {
        const parent = this.findParent_(catalog, track);
        if (!parent) {
          shaka.log.warning(
              'Ignoring catalog "update" of an unknown track', track);
          return;
        }
        const index = catalog.tracks.indexOf(parent);
        catalog.tracks[index] = shaka.msf.CatalogStore.override_(parent, track);
        return;
      }
      default:
        shaka.log.warning(`Ignoring unknown catalog operation "${op}"`);
    }
  }

  /**
   * The track a "clone" or "update" names as its parent.
   *
   * MSF names it with parentName, but its own "update" example names it with
   * name instead, so that is accepted when parentName is missing.
   *
   * @param {!msfCatalog.Catalog} catalog
   * @param {!msfCatalog.Track} track
   * @return {?msfCatalog.Track}
   * @private
   */
  findParent_(catalog, track) {
    const name = track.parentName != null ? track.parentName : track.name;
    const namespace = track.parentName != null ?
        track.parentNamespace : track.namespace;
    const index = this.indexOf_(catalog, namespace, name);
    return index == -1 ? null : catalog.tracks[index];
  }

  /**
   * @param {!msfCatalog.Catalog} catalog
   * @param {(string|undefined)} namespace
   * @param {string} name
   * @return {number}
   * @private
   */
  indexOf_(catalog, namespace, name) {
    const wanted = namespace || this.catalogNamespace_;
    return catalog.tracks.findIndex((track) =>
      track.name == name &&
          (track.namespace || this.catalogNamespace_) == wanted);
  }

  /**
   * A copy of a track with the fields of another laid over it, minus the
   * fields that only address the parent.
   *
   * @param {!msfCatalog.Track} base
   * @param {!msfCatalog.Track} fields
   * @return {!msfCatalog.Track}
   * @private
   */
  static override_(base, fields) {
    const result = /** @type {!msfCatalog.Track} */ (Object.assign(
        structuredClone(base), structuredClone(fields)));
    delete result['parentName'];
    delete result['parentNamespace'];
    return result;
  }

  /**
   * Refuses a catalog of a version this parser does not understand, which MSF
   * forbids reading at all.
   *
   * The "draft-XX" convention MSF asks for while it is an Internet-Draft is
   * understood, as is 1, the version the finished format will carry. A
   * catalog with no version at all is read, with a warning: the field is
   * required, but refusing it would say nothing more useful.
   *
   * @param {!msfCatalog.Catalog} catalog
   * @private
   */
  static checkVersion_(catalog) {
    const version = catalog.version;
    if (version == null) {
      shaka.log.warning('The MSF catalog does not declare a version');
      return;
    }
    if (version === 1 || version === '1' ||
        (typeof version == 'string' && /^draft-\d+$/.test(version))) {
      return;
    }
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.MSF_UNSUPPORTED_CATALOG_VERSION,
        String(version));
  }

  /**
   * What a catalog says, minus when it was generated: a publisher republishes
   * an unchanged catalog in a new Group so that it does not fall out of the
   * caches of a delivery network, and that is not a change.
   *
   * @param {!msfCatalog.Catalog} catalog
   * @return {string}
   * @private
   */
  static contentOf_(catalog) {
    return JSON.stringify(catalog, (key, value) =>
      key == 'generatedAt' ? undefined : value);
  }

  /**
   * @param {bigint} group
   * @param {bigint} object
   * @return {string}
   * @private
   */
  static key_(group, object) {
    return `${group}/${object}`;
  }
};


/**
 * @typedef {{
 *   group: bigint,
 *   object: bigint,
 *   document: !msfCatalog.Catalog,
 * }}
 * @private
 */
shaka.msf.CatalogStore.Entry_;


/**
 * How many catalog Objects may be held waiting for the ones before them.
 * They only wait for a gap to fill, which takes one round trip; a store that
 * keeps growing is waiting for an Object that is never coming.
 *
 * @private @const {number}
 */
shaka.msf.CatalogStore.MAX_PENDING_ = 32;
