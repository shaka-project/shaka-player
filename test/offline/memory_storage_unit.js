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


describe('MemoryStorageCell', function() {
  const OfflineUtils = shaka.test.OfflineUtils;

  it('can add, get, and remove segments', function(done) {
    /** @type {!Array.<shaka.extern.SegmentDataDB>} */
    let segments = [
      OfflineUtils.createSegmentData([0]),
      OfflineUtils.createSegmentData([0, 1]),
      OfflineUtils.createSegmentData([0, 1, 2]),
    ];

    /** @type {!Array.<number>} */
    let keys;

    /** @type {shaka.extern.StorageCell} */
    let cell = new shaka.offline.memory.StorageCell();

    cell.addSegments(segments).then((k) => {
      keys = k;

      expect(keys).toBeTruthy();
      expect(keys.length).toBe(segments.length);

      return cell.getSegments(keys);
    }).then((found) => {
      expect(found).toBeTruthy();
      expect(found.length).toBe(segments.length);
      OfflineUtils.expectSegmentToEqual(found[0], segments[0]);
      OfflineUtils.expectSegmentToEqual(found[1], segments[1]);
      OfflineUtils.expectSegmentToEqual(found[2], segments[2]);

      return cell.removeSegments(keys);
    }).then(() => {
      // The get should fail as there should be no entries under the keys
      // anymore.
      return cell.getSegments(keys).then(fail).catch((error) => {
        expect(error.code).toBe(shaka.util.Error.Code.KEY_NOT_FOUND);
      });
    }).catch(fail).then(done);
  });

  it('can add, get, and remove manifests', function(done) {
    /** @type {!Array.<shaka.extern.ManifestDB>} */
    let manifests = [
      OfflineUtils.createManifest('original-uri-1'),
      OfflineUtils.createManifest('original-uri-2'),
      OfflineUtils.createManifest('original-uri-3'),
    ];

    /** @type {!Array.<number>} */
    let keys;

    /** @type {shaka.extern.StorageCell} */
    let cell = new shaka.offline.memory.StorageCell();

    cell.addManifests(manifests).then((k) => {
      keys = k;

      expect(keys).toBeTruthy();
      expect(keys.length).toBe(manifests.length);

      return cell.getManifests(keys);
    }).then((found) => {
      expect(found).toBeTruthy();
      expect(found.length).toBe(manifests.length);
      expect(found[0]).toEqual(manifests[0]);
      expect(found[1]).toEqual(manifests[1]);
      expect(found[2]).toEqual(manifests[2]);

      return cell.removeManifests(keys);
    }).then(() => {
      // The get should fail as there should be no entries under the keys
      // anymore.
      return cell.getManifests(keys).then(fail).catch((error) => {
        expect(error.code).toBe(shaka.util.Error.Code.KEY_NOT_FOUND);
      });
    }).catch(fail).then(done);
  });

  it('can add and get all manifests', function(done) {
    /** @type {!Array.<shaka.extern.ManifestDB>} */
    let manifests = [
      OfflineUtils.createManifest('original-uri-1'),
      OfflineUtils.createManifest('original-uri-2'),
      OfflineUtils.createManifest('original-uri-3'),
    ];

    /** @type {!Array.<number>} */
    let keys = [];

    /** @type {shaka.extern.StorageCell} */
    let cell = new shaka.offline.memory.StorageCell();

    cell.addManifests(manifests).then((k) => {
      keys = k;

      expect(keys).toBeTruthy();
      expect(keys.length).toBe(manifests.length);

      return cell.getAllManifests();
    }).then((found) => {
      expect(found).toBeTruthy();

      let actual = keys.map((key) => found[key]);
      expect(actual[0]).toEqual(manifests[0]);
      expect(actual[1]).toEqual(manifests[1]);
      expect(actual[2]).toEqual(manifests[2]);
    }).catch(fail).then(done);
  });

  it('can add, get, and update manifests', function(done) {
    /** @type {shaka.extern.ManifestDB} */
    let originalManifest = OfflineUtils.createManifest('original');
    originalManifest.expiration = 1000;

    /** @type {number} */
    let key;

    /** @type {shaka.extern.StorageCell} */
    let cell = new shaka.offline.memory.StorageCell();

    cell.addManifests([originalManifest]).then((keys) => {
      expect(keys).toBeTruthy();
      expect(keys.length).toBe(1);

      key = keys[0];

      return cell.getManifests(keys);
    }).then((found) => {
      expect(found).toBeTruthy();
      expect(found.length).toBe(1);
      expect(found[0]).toEqual(originalManifest);

      return cell.updateManifestExpiration(key, 500);
    }).then(() => {
      return cell.getManifests([key]);
    }).then((newFound) => {
      expect(newFound).toBeTruthy();
      expect(newFound.length).toBe(1);

      expect(newFound[0]).not.toEqual(originalManifest);
      originalManifest.expiration = 500;
      expect(newFound[0]).toEqual(originalManifest);
    }).catch(fail).then(done);
  });
});
