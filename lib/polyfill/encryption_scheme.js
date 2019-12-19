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

goog.provide('shaka.polyfill.EncryptionScheme');

goog.require('shaka.polyfill.register');

/**
 * @summary A polyfill to add support for EncryptionScheme queries in EME.
 * @see https://wicg.github.io/encrypted-media-encryption-scheme/
 * @see https://github.com/w3c/encrypted-media/pull/457
 * @see https://github.com/google/eme-encryption-scheme-polyfill
 */
shaka.polyfill.EncryptionScheme = class {
  /**
   * Install the polyfill if needed.
   *
   * @suppress {missingRequire}
   */
  static install() {
    EncryptionSchemePolyfills.install();
  }
};

// Install at a low priority so that other EME polyfills go first.
shaka.polyfill.register(shaka.polyfill.EncryptionScheme.install, -1);
