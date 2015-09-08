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


goog.provide('shaka.util.EmeUtils');


/**
 * @namespace shaka.util.EmeUtils
 * @summary A set of EME utility functions.
 */


/**
 * Gets the error message for the given key status.
 *
 * @param {string} status
 * @return {?string}
 * @see {@link https://w3c.github.io/encrypted-media/#idl-def-MediaKeyStatus}
 */
shaka.util.EmeUtils.getKeyStatusErrorMessage = function(status) {
  var message = shaka.util.EmeUtils.KEY_STATUS_ERROR_MAP_[status];
  // usable, output-downscaled, and status-pending are not errors.
  // The assertion helps catch future status message changes.
  shaka.asserts.assert(message ||
                       status === 'usable' ||
                       status === 'output-downscaled' ||
                       status === 'status-pending',
                       'Unexpected key status value: ' + status);
  return message || null;
};


/**
 * A map from key statuses to error messages. Key statuses that are not
 * errors are not included in the map.
 *
 * @const {!Object.<string, string>}
 * @private
 */
shaka.util.EmeUtils.KEY_STATUS_ERROR_MAP_ = {
  'output-restricted': 'The required output protection is not available.',
  // This has been removed from the EME spec and deprecated, but some browsers
  // may still use it.
  'output-not-allowed': 'The required output protection is not available.',
  'expired': 'The decryption key has expired.',
  'internal-error': 'The key system has encountered an unspecified error.'
};

