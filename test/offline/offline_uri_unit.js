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
  const OfflineUri = shaka.offline.OfflineUri;

  it('creates uri from manifest id', function() {
    /** @type {number} */
    let id = 123;
    /** @type {string} */
    let uri = OfflineUri.manifest('mech', 'cell', id).toString();

    expect(uri).toBe('offline:manifest/mech/cell/123');
  });

  it('creates uri from segment id', function() {
    /** @type {number} */
    let id = 123;
    /** @type {string} */
    let uri = OfflineUri.segment('mech', 'cell', id).toString();

    expect(uri).toBe('offline:segment/mech/cell/123');
  });

  it('creates null from invalid uri', function() {
    /** @type {string} */
    let uri = 'invalid-uri';
    let parsed = OfflineUri.parse(uri);

    expect(parsed).toBeNull();
  });

  it('parse manifest uri', function() {
    /** @type {string} */
    let uri = 'offline:manifest/mech/cell/123';
    let parsed = OfflineUri.parse(uri);

    expect(parsed).toBeTruthy();
    expect(parsed.isManifest()).toBeTruthy();
    expect(parsed.mechanism()).toBe('mech');
    expect(parsed.cell()).toBe('cell');
    expect(parsed.key()).toBe(123);
  });

  it('parse segment uri', function() {
    /** @type {string} */
    let uri = 'offline:segment/mech/cell/123';
    let parsed = OfflineUri.parse(uri);

    expect(parsed).toBeTruthy();
    expect(parsed.isSegment()).toBeTruthy();
    expect(parsed.mechanism()).toBe('mech');
    expect(parsed.cell()).toBe('cell');
    expect(parsed.key()).toBe(123);
  });
});
