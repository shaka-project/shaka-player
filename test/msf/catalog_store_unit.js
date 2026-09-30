/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('shaka.msf.CatalogStore', () => {
  const NAMESPACE = 'mlm/cmsf/clear';

  /** @type {!shaka.msf.CatalogStore} */
  let store;

  beforeEach(() => {
    store = new shaka.msf.CatalogStore(NAMESPACE);
  });

  /**
   * @param {number} group
   * @param {number} object
   * @return {{group: bigint, object: bigint}}
   */
  function at(group, object) {
    return {group: BigInt(group), object: BigInt(object)};
  }

  /**
   * @param {!Array<!Object>} tracks
   * @param {!Object=} extra
   * @return {!msfCatalog.Catalog}
   */
  function independent(tracks, extra = {}) {
    return /** @type {!msfCatalog.Catalog} */ (Object.assign(
        {version: 'draft-01', generatedAt: 1, tracks}, extra));
  }

  /**
   * @param {!Array<!Object>} operations
   * @return {!msfCatalog.Catalog}
   */
  function delta(operations) {
    return /** @type {!msfCatalog.Catalog} */ (
      {generatedAt: 2, deltaUpdate: operations});
  }

  /**
   * @param {string} name
   * @param {!Object=} extra
   * @return {!Object}
   */
  function track(name, extra = {}) {
    return Object.assign({name, packaging: 'loc', isLive: true}, extra);
  }

  /** @return {!Array<string>} */
  function trackNames() {
    return store.getCatalog().tracks.map((t) => t.name);
  }

  it('has no catalog before an independent one arrives', () => {
    expect(store.getCatalog()).toBeNull();
  });

  it('takes the independent catalog in object 0', () => {
    const catalog = independent([track('video')]);
    expect(store.push(at(3, 0), catalog)).toBe(true);
    expect(store.getCatalog()).toEqual(catalog);
  });

  describe('delta updates', () => {
    beforeEach(() => {
      store.push(at(0, 0), independent([
        track('video', {bitrate: 1000}),
        track('audio'),
      ]));
    });

    it('adds tracks', () => {
      expect(store.push(at(0, 1), delta([
        {op: 'add', tracks: [track('slides')]},
      ]))).toBe(true);
      expect(trackNames()).toEqual(['video', 'audio', 'slides']);
    });

    it('does not add a track that already exists', () => {
      store.push(at(0, 1), delta([
        {op: 'add', tracks: [track('video', {bitrate: 1})]},
      ]));
      expect(store.getCatalog().tracks.length).toBe(2);
      expect(store.getCatalog().tracks[0].bitrate).toBe(1000);
    });

    it('removes tracks', () => {
      store.push(at(0, 1), delta([
        {op: 'remove', tracks: [{name: 'audio'}]},
      ]));
      expect(trackNames()).toEqual(['video']);
    });

    it('matches a track by the namespace it inherits', () => {
      store.push(at(0, 1), delta([
        {op: 'remove', tracks: [{name: 'audio', namespace: NAMESPACE}]},
      ]));
      expect(trackNames()).toEqual(['video']);

      store.push(at(0, 2), delta([
        {op: 'remove', tracks: [{name: 'video', namespace: 'other'}]},
      ]));
      expect(trackNames()).toEqual(['video']);
    });

    it('clones tracks, overriding what the clone redefines', () => {
      store.push(at(0, 1), delta([{op: 'clone', tracks: [{
        parentName: 'video',
        parentNamespace: NAMESPACE,
        name: 'video-720',
        bitrate: 500,
      }]}]));
      expect(trackNames()).toEqual(['video', 'audio', 'video-720']);
      expect(store.getCatalog().tracks[2]).toEqual(
          /** @type {msfCatalog.Track} */ (
            track('video-720', {bitrate: 500})));
    });

    it('does not clone onto a name already in use', () => {
      store.push(at(0, 1), delta([{op: 'clone', tracks: [
        {parentName: 'video', name: 'audio'},
      ]}]));
      expect(trackNames()).toEqual(['video', 'audio']);
    });

    it('updates the track named by parentName', () => {
      store.push(at(0, 1), delta([{op: 'update', tracks: [
        {parentName: 'video', bitrate: 4000},
      ]}]));
      expect(store.getCatalog().tracks[0]).toEqual(
          /** @type {msfCatalog.Track} */ (track('video', {bitrate: 4000})));
    });

    it('updates the track named by name, as the MSF example does', () => {
      store.push(at(0, 1), delta([{op: 'update', tracks: [
        {name: 'video', bitrate: 4000},
      ]}]));
      expect(store.getCatalog().tracks[0].bitrate).toBe(4000);
    });

    it('applies operations in order, each to the result of the last', () => {
      store.push(at(0, 1), delta([
        {op: 'add', tracks: [track('slides')]},
        {op: 'update', tracks: [{parentName: 'slides', bitrate: 7}]},
        {op: 'remove', tracks: [{name: 'audio'}]},
      ]));
      expect(trackNames()).toEqual(['video', 'slides']);
      expect(store.getCatalog().tracks[1].bitrate).toBe(7);
    });

    it('skips operations it cannot apply and applies the rest', () => {
      store.push(at(0, 1), delta([
        {op: 'rename', tracks: [track('video')]},
        {op: 'remove', tracks: [{name: 'missing'}]},
        {op: 'add', tracks: [track('slides')]},
      ]));
      expect(trackNames()).toEqual(['video', 'audio', 'slides']);
    });

    it('takes generatedAt from the delta', () => {
      store.push(at(0, 1), delta([{op: 'add', tracks: [track('slides')]}]));
      expect(store.getCatalog().generatedAt).toBe(2);
    });

    it('leaves the catalog it replaced alone', () => {
      const before = store.getCatalog();
      store.push(at(0, 1), delta([{op: 'remove', tracks: [{name: 'audio'}]}]));
      expect(before.tracks.length).toBe(2);
      expect(store.getCatalog()).not.toBe(before);
    });
  });

  describe('ordering', () => {
    it('holds deltas until the catalog they apply to arrives', () => {
      expect(store.push(at(4, 2), delta([
        {op: 'remove', tracks: [{name: 'audio'}]},
      ]))).toBe(false);
      expect(store.push(at(4, 1), delta([
        {op: 'add', tracks: [track('slides')]},
      ]))).toBe(false);
      expect(store.getCatalog()).toBeNull();

      expect(store.push(at(4, 0), independent([track('video'),
        track('audio')]))).toBe(true);
      expect(trackNames()).toEqual(['video', 'slides']);
    });

    it('holds a delta until the one before it arrives', () => {
      store.push(at(0, 0), independent([track('video')]));
      store.push(at(0, 2), delta([{op: 'remove', tracks: [{name: 'a'}]}]));
      expect(trackNames()).toEqual(['video']);

      store.push(at(0, 1), delta([{op: 'add', tracks: [track('a')]}]));
      expect(trackNames()).toEqual(['video']);
    });

    it('ignores an object it has already applied', () => {
      store.push(at(0, 0), independent([track('video')]));
      store.push(at(0, 1), delta([{op: 'add', tracks: [track('a')]}]));
      expect(store.push(at(0, 0), independent([track('video')]))).toBe(false);
      expect(store.push(at(0, 1), delta([{op: 'add', tracks: [track('a')]}])))
          .toBe(false);
      expect(trackNames()).toEqual(['video', 'a']);
    });

    it('ignores updates that precede the latest group', () => {
      store.push(at(7, 0), independent([track('video')]));
      expect(store.push(at(6, 3), delta([
        {op: 'add', tracks: [track('old')]},
      ]))).toBe(false);
      expect(store.push(at(6, 0), independent([track('old')]))).toBe(false);
      expect(trackNames()).toEqual(['video']);
    });

    it('replaces the catalog with the one that starts a newer group', () => {
      store.push(at(0, 0), independent([track('video')]));
      store.push(at(0, 1), delta([{op: 'add', tracks: [track('a')]}]));
      expect(store.push(at(1, 0), independent([track('b')]))).toBe(true);
      expect(trackNames()).toEqual(['b']);
    });

    it('drops held deltas of a group a newer one supersedes', () => {
      store.push(at(0, 0), independent([track('video')]));
      store.push(at(0, 2), delta([{op: 'add', tracks: [track('stale')]}]));
      store.push(at(1, 0), independent([track('b')]));
      store.push(at(0, 1), delta([{op: 'add', tracks: [track('stale')]}]));
      expect(trackNames()).toEqual(['b']);
    });

    it('does not report a republished catalog as a change', () => {
      store.push(at(0, 0), independent([track('video')]));
      expect(store.push(at(1, 0), independent([track('video')],
          {generatedAt: 99}))).toBe(false);
      expect(store.getCatalog().generatedAt).toBe(99);
    });

    it('ignores a group whose first object is a delta', () => {
      store.push(at(0, 0), independent([track('video')]));
      expect(store.push(at(1, 0), delta([
        {op: 'add', tracks: [track('a')]},
      ]))).toBe(false);
      expect(store.getCatalog()).toBeNull();
      expect(store.push(at(1, 1), delta([
        {op: 'add', tracks: [track('b')]},
      ]))).toBe(false);
      expect(store.getCatalog()).toBeNull();
    });

    it('takes an independent catalog that follows object 0', () => {
      store.push(at(0, 0), independent([track('video')]));
      expect(store.push(at(0, 1), independent([track('a')]))).toBe(true);
      expect(trackNames()).toEqual(['a']);
    });
  });

  describe('version', () => {
    for (const version of ['draft-01', 'draft-17', 1, '1']) {
      it(`reads version ${JSON.stringify(version)}`, () => {
        store.push(at(0, 0), independent([], {version}));
        expect(store.getCatalog()).not.toBeNull();
      });
    }

    it('reads a catalog that declares no version', () => {
      store.push(at(0, 0), independent([], {version: undefined}));
      expect(store.getCatalog()).not.toBeNull();
    });

    for (const version of ['v2', 2, 'draft-']) {
      it(`refuses version ${JSON.stringify(version)}`, () => {
        const expected = shaka.test.Util.jasmineError(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.MSF_UNSUPPORTED_CATALOG_VERSION,
            String(version)));
        expect(() => store.push(at(0, 0), independent([], {version})))
            .toThrow(expected);
        expect(store.getCatalog()).toBeNull();
      });
    }
  });
});
