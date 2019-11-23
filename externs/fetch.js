/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for Fetch and Headers
 * which have a few things missing in the Closure compiler.
 *
 * @externs
 */


/**
 * @param {function(string, string)} apply
 */
Headers.prototype.forEach = function(apply) {};
