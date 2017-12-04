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

goog.provide('shaka.test.MockStorageEngineFactory');



/**
 * @constructor
 * @struct
 */
shaka.test.MockStorageEngineFactory = function() {
  /** @private {!function():boolean} */
  this.originalIsSupported_ = shaka.offline.StorageEngineFactory.isSupported;
  /** @private {!function():!Promise<!shaka.offline.IStorageEngine>} */
  this.originalCreate_ = shaka.offline.StorageEngineFactory.createStorageEngine;
};


/**
 * Reset the platform to report it's actual support for storage.
 */
shaka.test.MockStorageEngineFactory.prototype.resetIsSupported = function() {
  var Factory = shaka.offline.StorageEngineFactory;
  Factory.isSupported = this.originalIsSupported_;
};


/**
 * Change whether or not the platform reports supporting storage.
 * @param {boolean} supported
 */
shaka.test.MockStorageEngineFactory.prototype.overrideIsSupported =
    function(supported) {
  var Factory = shaka.offline.StorageEngineFactory;
  Factory.isSupported = function() { return supported; };
};


/**
 * Reset the platform to create its default storage engine type.
 */
shaka.test.MockStorageEngineFactory.prototype.resetCreate = function() {
  var Factory = shaka.offline.StorageEngineFactory;
  Factory.createStorageEngine = this.originalCreate_;
};


/**
 * Change the type of storage engine the platform creates.
 * @param {!function():!Promise<!shaka.offline.IStorageEngine>} createEngine
 */
shaka.test.MockStorageEngineFactory.prototype.overrideCreate =
    function(createEngine) {
  var Factory = shaka.offline.StorageEngineFactory;
  Factory.createStorageEngine = createEngine;
};


/**
 * Reset all overrides to their default behavior.
 */
shaka.test.MockStorageEngineFactory.prototype.resetAll = function() {
  this.resetIsSupported();
  this.resetCreate();
};
