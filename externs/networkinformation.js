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

/**
 * @fileoverview Externs for NetworkInformation based on
 * {@link http://goo.gl/Cr1L15 Network Information API
 *  draft 07 September 2017}
 *
 * @externs
 */


/** @const {NetworkInformation} */
Navigator.prototype.connection;



/**
 * @interface
 * @extends {EventTarget}
 */
function NetworkInformation() {}


/** @const {string} */
NetworkInformation.prototype.effectiveType;


/** @const {number} */
NetworkInformation.prototype.downlink;


/** @const {boolean} */
NetworkInformation.prototype.saveData;


/** @const {string} */
NetworkInformation.prototype.type;
