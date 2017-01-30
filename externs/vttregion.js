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
 * @fileoverview Externs for VTTRegion based on this
 * {@link https://w3c.github.io/webvtt/#the-vttregion-interface API}
 *
 * @externs
 */



/** @interface */
function VTTRegion() {}


/** @type {number} */
VTTRegion.prototype.width;


/** @type {number} */
VTTRegion.prototype.lines;


/** @type {number} */
VTTRegion.prototype.regionAnchorX;


/** @type {number} */
VTTRegion.prototype.regionAnchorY;


/** @type {number} */
VTTRegion.prototype.viewportAnchorX;


/** @type {number} */
VTTRegion.prototype.viewportAnchorY;


/** @type {?string} */
VTTRegion.prototype.scroll;
