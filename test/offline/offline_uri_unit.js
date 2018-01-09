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

describe('OfflineUri', function() {
  /** @const */
  var OfflineUri = shaka.offline.OfflineUri;

  it('creates uri from manifest id', function() {
    /** @type {number} */
    var id = 123;
    /** @type {string} */
    var uri = OfflineUri.manifestIdToUri(id);

    expect(uri).toBe('offline:manifest/123');
  });

  it('creates uri from segment id', function() {
    /** @type {number} */
    var id = 123;
    /** @type {string} */
    var uri = OfflineUri.segmentIdToUri(id);

    expect(uri).toBe('offline:segment/123');
  });

  it('creates null id from non-manifest uri', function() {
    /** @type {string} */
    var uri = 'invalid-uri';
    /** @type {?number} */
    var id = OfflineUri.uriToManifestId(uri);

    expect(id).toBeNull();
  });

  it('creates id from manifest uri', function() {
    /** @type {string} */
    var uri = 'offline:manifest/123';
    /** @type {?number} */
    var id = OfflineUri.uriToManifestId(uri);

    expect(id).toBe(123);
  });

  it('creates null id from non-segment uri', function() {
    /** @type {string} */
    var uri = 'invalid-uri';
    /** @type {?number} */
    var id = OfflineUri.uriToSegmentId(uri);

    expect(id).toBeNull();
  });

  it('creates id from segment uri', function() {
    /** @type {string} */
    var uri = 'offline:segment/123';
    /** @type {?number} */
    var id = OfflineUri.uriToSegmentId(uri);

    expect(id).toBe(123);
  });
});
