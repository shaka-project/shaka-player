/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.features');


/**
 * @namespace shaka.features
 * @summary Contains compiler flags used to enable features.
 */


/**
 * @define {boolean} true to enable dash sources, false otherwise.
 */
goog.define('shaka.features.Dash', true);


/**
 * @define {boolean} true to enable offline sources, false otherwise.
 */
goog.define('shaka.features.Offline', true);


/**
 * @define {boolean} true to enable HTTP sources, false otherwise.
 */
goog.define('shaka.features.Http', true);


/**
 * @define {boolean} true to enable Live sources, false otherwise.
 */
goog.define('shaka.features.Live', true);
