/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for HTMLMediaElement which were missing in the
 * Closure compiler.
 *
 * @externs
 */


/** @const */
var WebKitPlaybackTargetAvailabilityEvent = {};


/** @type {boolean} */
HTMLMediaElement.prototype.webkitCurrentPlaybackTargetIsWireless;


/** @type {Function} */
HTMLMediaElement.prototype.webkitShowPlaybackTargetPicker = function() {};


var AirPlayEvent = class extends Event {};

/** @type {string} */
AirPlayEvent.prototype.availability;
