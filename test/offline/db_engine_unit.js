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

describe('DBEngine', function() {
  var db;
  var schema;
  var oldName;

  beforeAll(/** @suppress {accessControls} */ function() {
    oldName = shaka.offline.DBEngine.DB_NAME_;
    shaka.offline.DBEngine.DB_NAME_ += '_test';
  });

  beforeEach(function(done) {
    schema = {'test': 'key', 'other': 'key'};

    shaka.offline.DBEngine.deleteDatabase().then(function() {
      db = new shaka.offline.DBEngine();
      return db.init(schema);
    }).catch(fail).then(done);
  });

  afterAll(/** @suppress {accessControls} */ function() {
    shaka.offline.DBEngine.DB_NAME_ = oldName;
  });

  afterEach(function(done) {
    db.destroy().catch(fail).then(done);
  });

  it('stores and retrieves values', function(done) {
    var data = {
      key: 123,
      extra: 'foobar'
    };
    db.insert('test', data).then(function() {
      return db.get('test', 123);
    }).then(function(actual) {
      expect(actual).toEqual(data);
    }).catch(fail).then(done);
  });

  it('supports concurrent operations', function(done) {
    var data1 = {key: 1, extra: 'cat'};
    var data2 = {key: 2, foobar: 'baz'};
    var data3 = {key: 3, abc: 123};
    var data4 = {key: 4, utf: [1, 2, 3]};
    Promise.all([
      db.insert('test', data1),
      db.insert('test', data2),
      db.insert('other', data3),
      db.insert('test', data4)
    ]).then(function() {
      return Promise.all([
        db.get('test', 1),
        db.get('test', 2),
        db.get('other', 3),
        db.get('test', 4)
      ]);
    }).then(function(data) {
      expect(data[0]).toEqual(data1);
      expect(data[1]).toEqual(data2);
      expect(data[2]).toEqual(data3);
      expect(data[3]).toEqual(data4);
    }).catch(fail).then(done);
  });

  it('supports remove', function(done) {
    Promise.all([
      db.insert('test', {key: 1, i: 4}),
      db.insert('test', {key: 2, i: 1}),
      db.insert('test', {key: 3, i: 2}),
      db.insert('test', {key: 4, i: 9}),
      db.insert('test', {key: 5, i: 8}),
      db.insert('test', {key: 6, i: 7})
    ]).then(function() {
      return db.remove('test', 2);
    }).then(function() {
      return db.get('test', 2);
    }).then(function(data) {
      expect(data).toBeFalsy();
      return db.removeWhere('test', function(s) { return s.i >= 7; });
    }).then(function() {
      return db.get('test', 5);
    }).then(function(data) {
      expect(data).toBeFalsy();
      return db.get('test', 3);
    }).then(function(data) {
      expect(data).toBeTruthy();
    }).catch(fail).then(done);
  });

  it('aborts transactions on destroy()', function(done) {
    var expectedError = new shaka.util.Error(
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.OPERATION_ABORTED);
    var insert1Finished = false, insert2Finished = false;
    db.insert('test', {key: 1}).then(fail, function(error) {
      shaka.test.Util.expectToEqualError(error, expectedError);
      insert1Finished = true;
    });
    db.insert('test', {key: 2}).then(fail, function(error) {
      shaka.test.Util.expectToEqualError(error, expectedError);
      insert2Finished = true;
    });

    db.destroy()
        .catch(fail)
        .then(function() {
          // Insert a slight delay to avoid a race between this callback and
          // the above callbacks.
          return shaka.test.Util.delay(0.001);
        })
        .then(function() {
          expect(insert1Finished).toBe(true);
          expect(insert2Finished).toBe(true);
          done();
        });
  });

  it('will find and reserve IDs', function(done) {
    Promise
        .all([
          db.insert('test', {key: 1}),
          db.insert('test', {key: 2}),
          db.insert('other', {key: 4}),  // Max
          db.insert('test', {key: 6}),
          db.insert('test', {key: 9}),  // Max
          db.insert('other', {key: 3}),
          db.insert('other', {key: 1})
        ])
        // Destroy the database to refresh the IDs.
        .then(function() { return db.destroy(); })
        .then(function() {
          db = new shaka.offline.DBEngine();
          return db.init(schema);
        })
        .then(function() {
          expect(db.reserveId('test')).toBe(10);
          expect(db.reserveId('test')).toBe(11);
          expect(db.reserveId('other')).toBe(5);
          expect(db.reserveId('test')).toBe(12);
          expect(db.reserveId('test')).toBe(13);
          expect(db.reserveId('other')).toBe(6);
        })
        .catch(fail)
        .then(done);
  });
});
