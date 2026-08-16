/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for WebOS
 *
 * @externs
 */


/** @const */
var PalmSystem = {};


/** @type {string} */
PalmSystem.deviceInfo;


/** @constructor */
function PalmServiceBridge() {}


/** @type {?Function} */
PalmServiceBridge.prototype.onservicecallback;


/** @type {Function} */
PalmServiceBridge.prototype.call = function() {};
