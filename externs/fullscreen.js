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
 * @fileoverview Externs for fullscreen methods ahead of new compiler release.
 * @externs
 *
 * The old compiler we're using already has an incompatible definition for
 * requestFullscreen on Element.  Since we can't replace it on Element, we add
 * ours on HTMLElement, one subclass down.  This is still low-level enough to
 * apply to all reasonable usage of the fullscreen API.
 *
 * The latest compiler version has the updated definition on Element.
 *
 * TODO: Remove once the compiler is upgraded.
 */

/**
 * @record
 * @see https://fullscreen.spec.whatwg.org/#dictdef-fullscreenoptions
 */
function FullscreenOptions() {}

/** @type {string} */
FullscreenOptions.prototype.navigationUI;

/**
 * @see https://fullscreen.spec.whatwg.org/#dom-element-requestfullscreen
 * @param {!FullscreenOptions=} options
 * @return {!Promise}
 * @override
 * @suppress {checkTypes}
 */
HTMLElement.prototype.requestFullscreen = function(options) {};
