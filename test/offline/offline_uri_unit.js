/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('OfflineUri', () => {
  const OfflineUri = shaka.offline.OfflineUri;

  it('creates uri from manifest id', () => {
    /** @type {number} */
    const id = 123;
    /** @type {string} */
    const uri = OfflineUri.manifest('mech', 'cell', id).toString();

    expect(uri).toBe('offline:manifest/mech/cell/123');
  });

  it('creates uri from segment id', () => {
    /** @type {number} */
    const id = 123;
    /** @type {string} */
    const uri = OfflineUri.segment('mech', 'cell', id).toString();

    expect(uri).toBe('offline:segment/mech/cell/123');
  });

  it('creates uri from pending segment', () => {
    const uri = OfflineUri.pendingSegment('mech', 'cell', 123,
        {streamId: 4, position: 5, isInit: false});
    expect(uri.toString()).toBe('offline:pending/mech/cell/123/4/5');

    const initUri = OfflineUri.pendingSegment('mech', 'cell', 123,
        {streamId: 4, position: 5, isInit: true});
    expect(initUri.toString()).toBe('offline:pending/mech/cell/123/4/5/init');
  });

  it('creates null from invalid uri', () => {
    /** @type {string} */
    const uri = 'invalid-uri';
    const parsed = OfflineUri.parse(uri);

    expect(parsed).toBeNull();
  });

  it('parse manifest uri', () => {
    /** @type {string} */
    const uri = 'offline:manifest/mech/cell/123';
    const parsed = OfflineUri.parse(uri);

    expect(parsed).toBeTruthy();
    expect(parsed.isManifest()).toBeTruthy();
    expect(parsed.mechanism()).toBe('mech');
    expect(parsed.cell()).toBe('cell');
    expect(parsed.key()).toBe(123);
  });

  it('parse segment uri', () => {
    /** @type {string} */
    const uri = 'offline:segment/mech/cell/123';
    const parsed = OfflineUri.parse(uri);

    expect(parsed).toBeTruthy();
    expect(parsed.isSegment()).toBeTruthy();
    expect(parsed.mechanism()).toBe('mech');
    expect(parsed.cell()).toBe('cell');
    expect(parsed.key()).toBe(123);
  });

  it('parse pending segment uri', () => {
    /** @type {string} */
    const uri = 'offline:pending/mech/cell/123/4/5/init';
    const parsed = OfflineUri.parse(uri);

    expect(parsed).toBeTruthy();
    expect(parsed.isPendingSegment()).toBeTruthy();
    expect(parsed.mechanism()).toBe('mech');
    expect(parsed.cell()).toBe('cell');
    expect(parsed.key()).toBe(123);
    expect(parsed.pendingSegment())
        .toEqual({streamId: 4, position: 5, isInit: true});
    expect(parsed.manifestOfPendingSegment().toString())
        .toBe('offline:manifest/mech/cell/123');
    expect(parsed.toString()).toBe(uri);
  });

  it('creates null from pending segment uri without its position', () => {
    expect(OfflineUri.parse('offline:pending/mech/cell/123')).toBeNull();
  });

  it('creates null from segment uri with a position', () => {
    expect(OfflineUri.parse('offline:segment/mech/cell/123/4/5')).toBeNull();
  });
});
