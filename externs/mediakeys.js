/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for MediaKeys which were missing in the
 * Closure compiler.
 *
 * @externs
 */

/**
 * @param {Object} policy
 * @return {!Promise<string>}
 */
MediaKeys.prototype.getStatusForPolicy = function(policy) {};
