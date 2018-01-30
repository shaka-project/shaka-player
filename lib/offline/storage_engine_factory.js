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

goog.provide('shaka.offline.StorageEngineFactory');

goog.require('shaka.offline.DBEngine');
goog.require('shaka.offline.IStorageEngine');
goog.require('shaka.util.Error');


/**
 * @namespace shaka.offline.StorageEngineFactory
 */


/**
 * @const{string}
 * @private
 */
shaka.offline.StorageEngineFactory.NAME_ = 'shaka_offline_db';

/**
 * Determines if this platform supports any form of storage engine.
 * @return {boolean}
 */
shaka.offline.StorageEngineFactory.isSupported = function() {
  return shaka.offline.DBEngine.isSupported();
};


/**
 * Create a new instance of the supported storage engine. The created instance
 * will be initialized.
 * @return {!Promise<!shaka.offline.IStorageEngine>}
 */
shaka.offline.StorageEngineFactory.createStorageEngine = function() {
  const name = shaka.offline.StorageEngineFactory.NAME_;

  return shaka.offline.StorageEngineFactory.ensureSupport().then(function() {
    let engine = new shaka.offline.DBEngine(name);
    return engine.init().then(function() { return engine; });
  });
};


/**
 * Delete the storage engine and all its contents. This operation is
 * non-reversible.
 * @return {!Promise}
 */
shaka.offline.StorageEngineFactory.deleteStorage = function() {
  const name = shaka.offline.StorageEngineFactory.NAME_;

  return shaka.offline.StorageEngineFactory.ensureSupport().then(function() {
    return shaka.offline.DBEngine.deleteDatabase(name);
  });
};


/** @return {!Promise} */
shaka.offline.StorageEngineFactory.ensureSupport = function() {
  // Use our method to check in case it was replaced.
  let support = shaka.offline.StorageEngineFactory.isSupported();

  if (support) {
    return Promise.resolve();
  } else {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.STORAGE_NOT_SUPPORTED));
  }
};
