/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


describe('V1IndexeddbStorageCell', function() {
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

  beforeAll(async function() {
    let data = await shaka.test.Util.fetch(dbImagePath);
    dbImageAsString = shaka.util.StringUtils.fromUTF8(data);
  });

  beforeEach(function() {
    cells = [];
    connections = [];
  });

  afterEach(async function() {
    // If the test did not run, then there will be no cells and no connections,
    // so we don't need to worry about checking if indexeddb is supported here.

    // Destroy the cells before killing any connections.
    await Promise.all(cells.map((cell) => cell.destroy()));
    connections.forEach((connection) => connection.close());
  });

  it('cannot add new manifests', checkAndRun(async function() {
    const expectedErrorCode =
        shaka.util.Error.Code.NEW_KEY_OPERATION_NOT_SUPPORTED;

    let connection = await makeConnection();
    let cell = makeCell(connection);

    // There should be one manifest.
    let manifests = await cell.getAllManifests();
    let manifest = manifests.get(0);
    expect(manifest).toBeTruthy();

    // Make sure that the request fails.
    try {
      await cell.addManifests([manifest]);
      fail();
    } catch (e) {
      expect(e.code).toEqual(expectedErrorCode);
    }
  }));

  it('cannot add new segment', checkAndRun(async function() {
    const expectedErrorCode =
        shaka.util.Error.Code.NEW_KEY_OPERATION_NOT_SUPPORTED;

    let connection = await makeConnection();
    let cell = makeCell(connection);

    // Update the key to what should be a free key.
    let segment = {data: new ArrayBuffer(16)};

    // Make sure that the request fails.
    try {
      await cell.addSegments([segment]);
      fail();
    } catch (e) {
      expect(e.code).toEqual(expectedErrorCode);
    }
  }));

  it('can get all manifests', checkAndRun(async function() {
    let connection = await makeConnection();
    let cell = makeCell(connection);

    // There should be one manifest.
    let map = await cell.getAllManifests();
    expect(map).toBeTruthy();
    expect(map.size).toBe(1);
    expect(map.get(0)).toBeTruthy();
  }));

  it('can get manifest and all segments', checkAndRun(async function() {
    let connection = await makeConnection();
    let cell = makeCell(connection);

    // There should be one manifest.
    let manifests = await cell.getManifests([0]);
    let manifest = manifests[0];
    expect(manifest).toBeTruthy();

    // Collect all the keys for each segment.
    let dataKeys = getAllSegmentKeys(manifest);

    // Check that each segment was successfully retrieved.
    let segmentData = await cell.getSegments(dataKeys);
    expect(segmentData).toBeTruthy();
    expect(segmentData.length).toBe(6);
    segmentData.forEach((segment) => {
      expect(segment).toBeTruthy();
    });
  }));

  it('can update expiration', checkAndRun(async function() {
    // Keys and old values are pulled directly from the db image.
    const manifestKey = 0;
    const oldExpiration = Infinity;
    const newExpiration = 1000;

    let connection = await makeConnection();
    let cell = makeCell(connection);

    let original = await cell.getManifests([manifestKey]);
    expect(original).toBeTruthy();
    expect(original[0]).toBeTruthy();
    expect(original[0].expiration).toBe(oldExpiration);

    await cell.updateManifestExpiration(manifestKey, newExpiration);

    let updated = await cell.getManifests([manifestKey]);
    expect(updated).toBeTruthy();
    expect(updated[0]).toBeTruthy();
    expect(updated[0].expiration).toBe(newExpiration);
  }));

  it('can remove manifests and segments', checkAndRun(async function() {
    let connection = await makeConnection();
    let cell = makeCell(connection);

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

    let checkMissingSegment = async (key) => {
      try {
        await cell.getSegments([key]);
        fail();
      } catch (e) {
        expect(e.code).toBe(shaka.util.Error.Code.KEY_NOT_FOUND);
      }
    };

    let checkMissingManifest = async (key) => {
      try {
        await cell.getManifests([key]);
        fail();
      } catch (e) {
        expect(e.code).toBe(shaka.util.Error.Code.KEY_NOT_FOUND);
      }
    };

    // Need to check each key on its own to ensure that each key is missing
    // and not just one of the keys is missing.
    let checkMissingSegments = (keys) => {
      return Promise.all(keys.map((key) => checkMissingSegment(key)));
    };
    let checkMissingManifests = (keys) => {
      return Promise.all(keys.map((key) => checkMissingManifest(key)));
    };

    await checkMissingSegments(/** @type {!Array.<number>} */(segmentKeys));
    await checkMissingManifests(/** @type {!Array.<number>} */(manifestKeys));
  }));

  /**
   * Get the keys for each segment. This will include the init segments.
   *
   * @param {shaka.extern.ManifestDB} manifest
   * @return {!Array.<number>}
   */
  function getAllSegmentKeys(manifest) {
    let keys = [];

    manifest.periods.forEach((period) => {
      period.streams.forEach((stream) => {
        if (stream.initSegmentKey != null) {
          keys.push(stream.initSegmentKey);
        }

        stream.segments.forEach((segment) => {
          keys.push(segment.dataKey);
        });
      });
    });

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
    let connection = await shaka.test.IndexedDBUtils.open(dbName);
    connections.push(connection);
    return connection;
  }

  /**
   * @param {IDBDatabase} connection
   * @return {shaka.extern.StorageCell}
   */
  function makeCell(connection) {
    let cell = new shaka.offline.indexeddb.V1StorageCell(
        connection,
        segmentStore,
        manifestStore);

    // Track the cell so that we can destroy it when the test is over.
    cells.push(cell);

    return cell;
  }

  /**
   * Before running the test, check if indexeddb is supported on this platform.
   *
   * @param {function():!Promise} test
   * @return {function():!Promise}
   */
  function checkAndRun(test) {
    return async () => {
      if (window.indexedDB) {
        await test();
      } else {
        pending('Indexeddb is not supported on this platform.');
      }
    };
  }
});
