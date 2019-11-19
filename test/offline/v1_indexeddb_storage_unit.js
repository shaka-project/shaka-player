/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('V1IndexeddbStorageCell', () => window.indexedDB, () => {
  const Util = shaka.test.Util;

  const dbImagePath = '/base/test/test/assets/db-dump-v1.json';

  const dbName = 'shaka-storage-cell-test';
  const segmentStore = 'segment';
  const manifestStore = 'manifest';

  /** @type {string} */
  let dbImageAsString;

  /** @type {!Array.<shaka.extern.StorageCell>} */
  let cells = [];

  /** @type {!Array.<IDBDatabase>} */
  let connections = [];

  beforeAll(async () => {
    const data = await shaka.test.Util.fetch(dbImagePath);
    dbImageAsString = shaka.util.StringUtils.fromUTF8(data);
  });

  beforeEach(() => {
    cells = [];
    connections = [];
  });

  afterEach(async () => {
    // If the test did not run, then there will be no cells and no connections,
    // so we don't need to worry about checking if indexeddb is supported here.

    // Destroy the cells before killing any connections.
    await Promise.all(cells.map((cell) => cell.destroy()));
    for (const connection of connections) {
      connection.close();
    }
  });

  it('cannot add new manifests', async () => {
    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.NEW_KEY_OPERATION_NOT_SUPPORTED,
        jasmine.any(String)));

    const connection = await makeConnection();
    const cell = makeCell(connection);

    // There should be one manifest.
    const manifests = await cell.getAllManifests();
    const manifest = manifests.get(0);
    expect(manifest).toBeTruthy();

    // Make sure that the request fails.
    await expectAsync(cell.addManifests([manifest])).toBeRejectedWith(expected);
  });

  it('cannot add new segment', async () => {
    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.NEW_KEY_OPERATION_NOT_SUPPORTED,
        jasmine.any(String)));

    const connection = await makeConnection();
    const cell = makeCell(connection);

    // Update the key to what should be a free key.
    const segment = {data: new ArrayBuffer(16)};

    // Make sure that the request fails.
    await expectAsync(cell.addSegments([segment])).toBeRejectedWith(expected);
  });

  it('can get all manifests', async () => {
    const connection = await makeConnection();
    const cell = makeCell(connection);

    // There should be one manifest.
    const map = await cell.getAllManifests();
    expect(map).toBeTruthy();
    expect(map.size).toBe(1);
    expect(map.get(0)).toBeTruthy();
  });

  it('can get manifest and all segments', async () => {
    const connection = await makeConnection();
    const cell = makeCell(connection);

    // There should be one manifest.
    const manifests = await cell.getManifests([0]);
    const manifest = manifests[0];
    expect(manifest).toBeTruthy();

    // Collect all the keys for each segment.
    const dataKeys = getAllSegmentKeys(manifest);

    // Check that each segment was successfully retrieved.
    const segmentData = await cell.getSegments(dataKeys);
    expect(segmentData).toBeTruthy();
    expect(segmentData.length).toBe(6);
    for (const segment of segmentData) {
      expect(segment).toBeTruthy();
    }
  });

  it('can update expiration', async () => {
    // Keys and old values are pulled directly from the db image.
    const manifestKey = 0;
    const oldExpiration = Infinity;
    const newExpiration = 1000;

    const connection = await makeConnection();
    const cell = makeCell(connection);

    const original = await cell.getManifests([manifestKey]);
    expect(original).toBeTruthy();
    expect(original[0]).toBeTruthy();
    expect(original[0].expiration).toBe(oldExpiration);

    await cell.updateManifestExpiration(manifestKey, newExpiration);

    const updated = await cell.getManifests([manifestKey]);
    expect(updated).toBeTruthy();
    expect(updated[0]).toBeTruthy();
    expect(updated[0].expiration).toBe(newExpiration);
  });

  it('can remove manifests and segments', async () => {
    const connection = await makeConnection();
    const cell = makeCell(connection);

    /** @type {!Array.<number>} */
    const manifestKeys = [];
    /** @type {!Array.<number>} */
    const segmentKeys = [];

    const manifests = await cell.getAllManifests();
    manifests.forEach((manifest, manifestKey) => {
      manifestKeys.push(manifestKey);

      for (const key of getAllSegmentKeys(manifest)) {
        segmentKeys.push(key);
      }
    });

    expect(manifestKeys.length).toBe(1);
    expect(segmentKeys.length).toBe(6);

    // Remove all the segments.
    const noop = () => {};
    await cell.removeManifests(manifestKeys, noop);
    await cell.removeSegments(segmentKeys, noop);

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.KEY_NOT_FOUND,
        jasmine.any(String)));
    const checkMissingSegment = async (key) => {
      await expectAsync(cell.getSegments([key])).toBeRejectedWith(expected);
    };

    const checkMissingManifest = async (key) => {
      await expectAsync(cell.getManifests([key])).toBeRejectedWith(expected);
    };

    // Need to check each key on its own to ensure that each key is missing
    // and not just one of the keys is missing.
    const checkMissingSegments = (keys) => {
      return Promise.all(keys.map((key) => checkMissingSegment(key)));
    };
    const checkMissingManifests = (keys) => {
      return Promise.all(keys.map((key) => checkMissingManifest(key)));
    };

    await checkMissingSegments(/** @type {!Array.<number>} */(segmentKeys));
    await checkMissingManifests(/** @type {!Array.<number>} */(manifestKeys));
  });

  /**
   * Get the keys for each segment. This will include the init segments.
   *
   * @param {shaka.extern.ManifestDB} manifest
   * @return {!Array.<number>}
   */
  function getAllSegmentKeys(manifest) {
    const keys = [];

    for (const period of manifest.periods) {
      for (const stream of period.streams) {
        if (stream.initSegmentKey != null) {
          keys.push(stream.initSegmentKey);
        }

        for (const segment of stream.segments) {
          keys.push(segment.dataKey);
        }
      }
    }

    return keys;
  }

  /**
   * @return {!Promise.<IDBDatabase>}
   */
  async function makeConnection() {
    const CannedIDB = shaka.test.CannedIDB;
    const startFromScratch = true;
    await CannedIDB.restoreJSON(dbName, dbImageAsString, startFromScratch);

    // Track the connection so that we can close it when the test is over.
    const connection = await shaka.test.IndexedDBUtils.open(dbName);
    connections.push(connection);
    return connection;
  }

  /**
   * @param {IDBDatabase} connection
   * @return {shaka.extern.StorageCell}
   */
  function makeCell(connection) {
    const cell = new shaka.offline.indexeddb.V1StorageCell(
        connection,
        segmentStore,
        manifestStore);

    // Track the cell so that we can destroy it when the test is over.
    cells.push(cell);

    return cell;
  }
});
