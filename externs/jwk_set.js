/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Externs for JWK set.
 * @externs
 */



/**
 * A JSON Web Key set.
 *
 * @constructor
 * @struct
 */
function JWKSet() {
  /** @type {Array.<JWK>} */
  this.keys = [];
}



/**
 * A JSON Web Key.
 *
 * @constructor
 * @struct
 */
function JWK() {
  /**
   * A key in hex.
   * @type {string}
   */
  this.k = '';

  /**
   * A key ID in hex.
   * @type {string}
   */
  this.kid = '';
}
