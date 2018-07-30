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
 * @externs
 */


/**
 * @typedef {{
 *   hasAppRestrictions: boolean,
 *   missingKeys: !Array.<string>,
 *   restrictedKeyStatuses: !Array.<string>
 * }}
 *
 * @property {boolean} hasAppRestrictions
 *   Whether there are streams that are restricted due to app-provided
 *   restrictions.
 * @property {!Array.<string>} missingKeys
 *   The key IDs that were missing.
 * @property {!Array.<string>} restrictedKeyStatuses
 *   The restricted EME key statuses that the streams had.  For example,
 *   'output-restricted' would mean streams couldn't play due to restrictions
 *   on the output device (e.g. HDCP).
 * @exportDoc
 */
shaka.extern.RestrictionInfo;


/**
 * @interface
 * @exportDoc
 */
shaka.extern.Error = function() {};


/**
 * @type {shaka.util.Error.Severity}
 * @exportDoc
 */
shaka.extern.Error.prototype.severity;


/**
 * @const {shaka.util.Error.Category}
 * @exportDoc
 */
shaka.extern.Error.prototype.category;


/**
 * @const {shaka.util.Error.Code}
 * @exportDoc
 */
shaka.extern.Error.prototype.code;


/**
 * @const {!Array.<*>}
 * @exportDoc
 */
shaka.extern.Error.prototype.data;


/**
 * @type {boolean}
 * @exportDoc
 */
shaka.extern.Error.prototype.handled;

