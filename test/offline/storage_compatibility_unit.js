/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// All of the database dumps referenced below were originally made from the
// "Heliocentrism" content in our demo app.
// https://storage.googleapis.com/shaka-demo-assets/heliocentrism/heliocentrism.mpd
// The dumps were made with test/test/util/canned_idb.js
const compatibilityTestsMetadata = [
  {
    // This was our original (v1) storage format for Shaka Player v2.0,
    // deprecated in v2.3.  This is not the same as the storage format from
    // Shaka Player v1, which is no longer supported.
    name: 'v1',
    dbImagePath: '/base/test/test/assets/db-dump-v1.json',
    manifestKey: 0,
    readOnly: true,
    makeCell: (connection) => new shaka.offline.indexeddb.V1StorageCell(
        connection,
        /* segmentStore= */ 'segment',
        /* manifestStore= */ 'manifest'),
  },
  {
    // Two variants of v2 exist in the field.  This is the initial version of
    // v2, as upgraded from v1 databases.  It was broken in a way that prevented
    // new records from being added.  This format was introduced in Shaka Player
    // v2.3 and deprecated in v2.3.2.
    name: 'v2-broken',
    dbImagePath: '/base/test/test/assets/db-dump-v2-broken.json',
    manifestKey: 0,
    readOnly: true,
    makeCell: (connection) => new shaka.offline.indexeddb.V2StorageCell(
        connection,
        /* segmentStore= */ 'segment-v2',
        /* manifestStore= */ 'manifest-v2',
        /* isFixedKey= */ true),  // TODO: Drop isFixedKey when v4 is out.
  },
  {
    // This is the "clean" version of the v2 database format, as created from
    // scratch, to which new records could be added.  This format was introduced
    // in Shaka Player v2.3 and deprecated in v2.3.2.
    name: 'v2-clean',
    dbImagePath: '/base/test/test/assets/db-dump-v2-clean.json',
    manifestKey: 1,
    readOnly: true,
    makeCell: (connection) => new shaka.offline.indexeddb.V2StorageCell(
        connection,
        /* segmentStore= */ 'segment-v2',
        /* manifestStore= */ 'manifest-v2',
        /* isFixedKey= */ true),  // TODO: Drop isFixedKey when v4 is out.
  },
  {
    // This is the v3 version of the database, which is actually identical to
    // the "clean" version of the v2 database.  The version number was
    // incremented to overcome the "broken" v2 databases.  This format was
    // introduced in v2.3.2.
    name: 'v3',
    dbImagePath: '/base/test/test/assets/db-dump-v3.json',
    manifestKey: 1,
    readOnly: false,
    makeCell: (connection) => new shaka.offline.indexeddb.V2StorageCell(
        connection,
        /* segmentStore= */ 'segment-v3',
        /* manifestStore= */ 'manifest-v3',
        /* isFixedKey= */ false),  // TODO: Drop isFixedKey when v4 is out.
  },
  {
    // This is the v3 version of the database as written by v2.5.0 - v2.5.9.  A
    // bug in v2.5 caused the stream metadata from all periods to be written to
    // each period.  This was corrected in v2.5.10.
    // See https://github.com/google/shaka-player/issues/2389
    name: 'v3-broken',
    dbImagePath: '/base/test/test/assets/db-dump-v3-broken.json',
    manifestKey: 1,
    readOnly: false,
    makeCell: (connection) => new shaka.offline.indexeddb.V2StorageCell(
        connection,
        /* segmentStore= */ 'segment-v3',
        /* manifestStore= */ 'manifest-v3',
        /* isFixedKey= */ false),  // TODO: Drop isFixedKey when v4 is out.
  },
];


describe('Storage Compatibility', () => {
  for (const metadata of compatibilityTestsMetadata) {
    describe(metadata.name, () => {
      makeTests(metadata);
    });
  }

  function makeTests(metadata) {
    const CannedIDB = shaka.test.CannedIDB;
    const Util = shaka.test.Util;

    /** @type {?shaka.extern.StorageCell} */
    let cell = null;

    /** @type {?IDBDatabase} */
    let connection = null;

    /** @type {string} */
    let dbImageAsString;

    beforeAll(async () => {
      const data = await shaka.test.Util.fetch(metadata.dbImagePath);
      dbImageAsString = shaka.util.StringUtils.fromUTF8(data);
    });

    beforeEach(async () => {
      if (!window.indexedDB) { pending('No storage support!'); }

      const dbName = 'shaka-storage-cell-test';

      // Load the canned database image.
      await CannedIDB.restoreJSON(
          dbName, dbImageAsString, /* wipeDatabase= */ true);

      // Track the connection so that we can close it when the test is over.
      connection = await shaka.test.IndexedDBUtils.open(dbName);

      // Create a storage cell.
      cell = metadata.makeCell(connection);
    });

    afterEach(async () => {
      // Destroy the cell before killing the connection.
      if (cell) {
        await cell.destroy();
      }
      cell = null;

      if (connection) {
        connection.close();
      }
      connection = null;
    });

    if (metadata.readOnly) {
      it('cannot add new manifests', async () => {
        if (!window.indexedDB) { pending('No storage support!'); }

        const expected = Util.jasmineError(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.NEW_KEY_OPERATION_NOT_SUPPORTED,
            jasmine.any(String)));

        // There should be one manifest.
        const manifests = await cell.getAllManifests();
        const manifest = manifests.get(metadata.manifestKey);
        expect(manifest).toBeTruthy();

        // Make sure that the request fails.
        await expectAsync(
            cell.addManifests([manifest])).toBeRejectedWith(expected);
      });

      it('cannot add new segment', async () => {
        if (!window.indexedDB) { pending('No storage support!'); }

        const expected = Util.jasmineError(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.NEW_KEY_OPERATION_NOT_SUPPORTED,
            jasmine.any(String)));

        // Update the key to what should be a free key.
        const segment = {data: new ArrayBuffer(16)};

        // Make sure that the request fails.
        await expectAsync(
            cell.addSegments([segment])).toBeRejectedWith(expected);
      });
    }  // if (metadata.readOnly)

    it('can get all manifests', async () => {
      if (!window.indexedDB) { pending('No storage support!'); }

      // There should be one manifest.
      const map = await cell.getAllManifests();
      expect(map).toBeTruthy();
      expect(map.size).toBe(1);
      expect(map.get(metadata.manifestKey)).toBeTruthy();
    });

    it('can get manifest and all segments', async () => {
      if (!window.indexedDB) { pending('No storage support!'); }

      // There should be one manifest.
      const manifests = await cell.getManifests([metadata.manifestKey]);
      const manifest = manifests[0];
      expect(manifest).toBeTruthy();

      // Collect all the keys for each segment.
      const dataKeys = getAllSegmentKeys(manifest);

      // Check that each segment was successfully retrieved.
      const segmentData = await cell.getSegments(dataKeys);
      expect(segmentData.length).not.toBe(0);

      for (const segment of segmentData) {
        expect(segment).toBeTruthy();
      }
    });

    it('can update expiration', async () => {
      if (!window.indexedDB) { pending('No storage support!'); }

      const oldExpiration = Infinity;
      const newExpiration = 1000;

      const original = await cell.getManifests([metadata.manifestKey]);
      expect(original).toBeTruthy();
      expect(original[0]).toBeTruthy();
      expect(original[0].expiration).toBe(oldExpiration);

      await cell.updateManifestExpiration(metadata.manifestKey, newExpiration);

      const updated = await cell.getManifests([metadata.manifestKey]);
      expect(updated).toBeTruthy();
      expect(updated[0]).toBeTruthy();
      expect(updated[0].expiration).toBe(newExpiration);
    });

    it('can remove manifests and segments', async () => {
      if (!window.indexedDB) { pending('No storage support!'); }

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
      expect(segmentKeys.length).not.toBe(0);

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

      await checkMissingSegments(segmentKeys);
      await checkMissingManifests(manifestKeys);
    });

    it('correctly converts to the current manifest format', async () => {
      const ContentType = shaka.util.ManifestParserUtils.ContentType;

      // There should be one manifest.
      const manifestDb = (await cell.getManifests([metadata.manifestKey]))[0];
      const converter = new shaka.offline.ManifestConverter(
          'mechanism', 'cell');
      const actual = converter.fromManifestDB(manifestDb);

      const expected = new shaka.test.ManifestGenerator()
          .anyTimeline()
          .minBufferTime(2)
          .addPeriod(0)
            .addPartialVariant()
              .addPartialStream(ContentType.VIDEO)
                .frameRate(29.97)
                .mime('video/webm', 'vp9')
                .size(640, 480)
          .addPeriod(Util.closeTo(2.06874))
            .addPartialVariant()
              .addPartialStream(ContentType.VIDEO)
                .frameRate(29.97)
                .mime('video/webm', 'vp9')
                .size(640, 480)
          .addPeriod(Util.closeTo(4.20413))
            .addPartialVariant()
              .addPartialStream(ContentType.VIDEO)
                .frameRate(29.97)
                .mime('video/webm', 'vp9')
                .size(320, 240)
          .build();

      expect(actual).toEqual(expected);

      const period0 = actual.periods[0];
      const period1 = actual.periods[1];
      const period2 = actual.periods[2];

      expect(period0.startTime).toEqual(0);
      expect(period1.startTime).toEqual(Util.closeTo(2.06874));
      expect(period2.startTime).toEqual(Util.closeTo(4.20413));

      const video0 = period0.variants[0].video;
      const video1 = period1.variants[0].video;
      const video2 = period2.variants[0].video;

      const segment0 = video0.getSegmentReference(0);
      const segment1 = video1.getSegmentReference(0);
      const segment2 = video2.getSegmentReference(0);

      expect(segment0).toEqual(jasmine.objectContaining({
        startTime: 0,
        endTime: Util.closeTo(2.06874),
      }));
      expect(segment1).toEqual(jasmine.objectContaining({
        startTime: 0,
        endTime: Util.closeTo(2.13539),
      }));
      expect(segment2).toEqual(jasmine.objectContaining({
        startTime: 0,
        endTime: Util.closeTo(0.70070),
      }));
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
  }  // makeTests
});
