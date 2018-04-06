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

describe('OfflineManifestParser', function() {
  const mockSEFactory = new shaka.test.MockStorageEngineFactory();
  const playerInterface =
      /** @type {shaka.extern.ManifestParser.PlayerInterface} */ (null);

  /** @type {!shaka.offline.IStorageEngine} */
  let fakeStorageEngine;
  /** @type {!shaka.offline.OfflineManifestParser} */
  let parser;

  beforeEach(function() {
    fakeStorageEngine = new shaka.test.MemoryStorageEngine();
    let getStorageEngine = function() {
      return Promise.resolve(fakeStorageEngine);
    };

    mockSEFactory.overrideIsSupported(true);
    mockSEFactory.overrideCreate(getStorageEngine);

    parser = new shaka.offline.OfflineManifestParser();
  });

  afterEach(function() {
    parser.stop();
    mockSEFactory.resetAll();
  });

  it('will query storage engine for the manifest', function(done) {
    new shaka.test.ManifestDBBuilder(fakeStorageEngine)
        .build().then(function(id) {
          /** @type {shaka.offline.OfflineUri} */
          let uri = shaka.offline.OfflineUri.manifest('mechanism', 'cell', id);
          return parser.start(uri.toString(), playerInterface);
        }).catch(fail).then(done);
  });

  it('will fail if manifest not found', function(done) {
    /** @type {number} */
    let id = 101;
    /** @type {shaka.offline.OfflineUri} */
    let uri = shaka.offline.OfflineUri.manifest('mechanism', 'cell', id);

    parser.start(uri.toString(), playerInterface)
        .then(fail)
        .catch(function(err) {
          shaka.test.Util.expectToEqualError(
              err,
              new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.STORAGE,
                  shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND,
                  id));
        })
        .then(done);
  });

  it('will fail for invalid URI', function(done) {
    let uri = 'offline:this-is-invalid';
    parser.start(uri, playerInterface)
        .then(fail)
        .catch(function(err) {
          shaka.test.Util.expectToEqualError(
              err,
              new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.NETWORK,
                  shaka.util.Error.Code.MALFORMED_OFFLINE_URI, uri));
        })
        .then(done);
  });

  describe('update expiration', function() {
    const sessionId = 'abc';

    /** @type {number} */
    let id;

    /** @type {number} */
    let expiration = 256;

    beforeEach(function(done) {
      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .onManifest(function(manifest) {
            manifest.sessionIds = [sessionId];
          })
          .build().then(function(newId) {
            //  Save the id so that we can use it later to fetch the manifest.
            id = newId;

            const uri = shaka.offline.OfflineUri.manifest(
                'mechanism', 'cell', id);
            return parser.start(uri.toString(), playerInterface);
          }).catch(fail).then(done);
    });

    it('will ignore when data is deleted', function(done) {
      fakeStorageEngine.removeManifests([0], null)
          .then(function() {
            parser.onExpirationUpdated(sessionId, expiration);
          })
          .catch(fail)
          .then(done);
    });

    it('will ignore when updating unknown session', function() {
      parser.onExpirationUpdated('other', expiration);
    });

    it('will update expiration', function(done) {
      parser.onExpirationUpdated(sessionId, expiration);

      shaka.test.Util.delay(0.1).then(function() {
        return fakeStorageEngine.getManifest(id);
      }).then(function(manifest) {
        expect(manifest.expiration).toBe(expiration);
      }).catch(fail).then(done);
    });
  });
});
