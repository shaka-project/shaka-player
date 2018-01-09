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

goog.provide('shaka.offline.DBUpgradeFromVersion0');

goog.require('goog.asserts');
goog.require('shaka.offline.DBUpgrade');
goog.require('shaka.offline.DBUtils');



/**
 * With Indexeddb, the initial empty state of any database is considered
 * version 0. Which means when you create a database for the first time,
 * you need to upgrade it from version 0 to your initial version.
 *
 * @constructor
 * @implements {shaka.offline.DBUpgrade}
 */
shaka.offline.DBUpgradeFromVersion0 = function() { };


/**
 * @override
 */
shaka.offline.DBUpgradeFromVersion0.prototype.upgrade = function(
    db, transaction) {
  goog.asserts.assert(db.objectStoreNames.length == 0,
                      'Version 0 database should be empty');

  db.createObjectStore(
      shaka.offline.DBUtils.StoreV2.MANIFEST,
      {autoIncrement: true});

  db.createObjectStore(
      shaka.offline.DBUtils.StoreV2.SEGMENT,
      {autoIncrement: true});
};
