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

goog.provide('shaka.offline.memory.StorageMechanism');

goog.require('shaka.offline.memory.StorageCell');



/**
 * @implements {shakaExtern.StorageMechanism}
 */
shaka.offline.memory.StorageMechanism = class {
  constructor() {
    /** @private {shaka.offline.memory.StorageCell} */
    this.cell_ = null;
  }


  /**
   * @override
   */
  init() {
    this.cell_ = new shaka.offline.memory.StorageCell();
    return Promise.resolve();
  }


  /**
   * @override
   */
  destroy() {
    let cell = this.cell_;
    this.cell_ = null;
    return cell.destroy();
  }


  /**
   * @override
   */
  getCells() {
    return {
      '0': this.cell_
    };
  }


  /**
   * @override
   */
  erase() {
    // Since we need to be initialized after an erase, just set the cell to a
    // new instance.
    this.cell_ = new shaka.offline.memory.StorageCell();
    return Promise.resolve();
  }
};
