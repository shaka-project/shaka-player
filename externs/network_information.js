/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for NetworkInformation which were missing in the
 * Closure compiler.
 *
 * @externs
 */


/** @type {boolean} */
NetworkInformation.prototype.saveData;

/**
 * @param {string} type
 * @param {Function} listener
 */
NetworkInformation.prototype.addEventListener = function(type, listener) {};

/**
 * @param {string} type
 * @param {Function} listener
 */
NetworkInformation.prototype.removeEventListener = function(type, listener) {};
