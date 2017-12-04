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
  // Use our method to check in case it was replaced.
  var supportsStorage = shaka.offline.StorageEngineFactory.isSupported();

  if (!supportsStorage) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.STORAGE_NOT_SUPPORTED));
  }

  /** @type {!shaka.offline.IStorageEngine} */
  var storageEngine = new shaka.offline.DBEngine();

  return shaka.offline.StorageEngineFactory.initEngine(storageEngine)
      .then(function() { return storageEngine; });
};


/**
 * Initialize a storage engine.
 * @param {!shaka.offline.IStorageEngine} engine
 * @return {!Promise}
 */
shaka.offline.StorageEngineFactory.initEngine = function(engine) {
  /** @const {!Object.<string, string>} */
  var scheme = {
    'manifest': 'key',
    'segment': 'key'
  };

  return engine.init(scheme);
};
