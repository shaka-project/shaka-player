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


/** @externs */


/**
 * @typedef {{
 *   manifest: Object.<string, boolean>,
 *   media: Object.<string, boolean>,
 *   drm: Object.<string, boolean>,
 *   supported: boolean
 * }}
 *
 * @description
 * An object detailing browser support for various features.
 *
 * @property {Object.<string, boolean>} manifest
 *   A map of supported manifest types.
 *   The keys are manifest MIME types and file extensions.
 * @property {Object.<string, boolean>} media
 *   A map of supported media types.
 *   The keys are media MIME types.
 * @property {Object.<string, boolean>} drm
 *   A map of DRM support.
 *   The keys are well-known key system IDs.
 * @property {boolean} supported
 *   True if the library is usable at all.
 *
 * @exportDoc
 */
shakaExtern.SupportType;


/** @typedef {function(!Node):?shakaExtern.DrmInfo} */
shakaExtern.ContentProtectionCallback;

