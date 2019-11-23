/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for our custom filters defined in test/test/boot.js.
 * @externs
 */


/**
 * @param {string} name
 * @param {jasmine.Callback} callback
 */
var drmIt = function(name, callback) {};


/**
 * @param {string} name
 * @param {jasmine.Callback} callback
 */
var quarantinedIt = function(name, callback) {};


/**
 * @param {string} name
 * @param {function():*} cond
 * @param {function()} callback
 */
var filterDescribe = function(name, cond, callback) {};
