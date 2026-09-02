/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @fileoverview Externs for screen properties not in the Closure compiler.
 *
 * @externs
 */


/**
 * A deprecated method we are using in a polyfill.  Use with care!
 * @param {string} orientation
 * @return {boolean}
 */
screen.lockOrientation = function(orientation) {};


/**
 * A deprecated method we are using in a polyfill.  Use with care!
 * @param {string} orientation
 * @return {boolean}
 */
screen.mozLockOrientation = function(orientation) {};


/**
 * A deprecated method we are using in a polyfill.  Use with care!
 * @param {string} orientation
 * @return {boolean}
 */
screen.msLockOrientation = function(orientation) {};


/**
 * A deprecated method we are using in a polyfill.  Use with care!
 * @return {boolean}
 */
screen.unlockOrientation = function() {};


/**
 * A deprecated method we are using in a polyfill.  Use with care!
 * @return {boolean}
 */
screen.mozUnlockOrientation = function() {};


/**
 * A deprecated method we are using in a polyfill.  Use with care!
 * @return {boolean}
 */
screen.msUnlockOrientation = function() {};
