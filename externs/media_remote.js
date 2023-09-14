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


/**
 * @constructor
 * @implements {EventTarget}
 */
function RemotePlayback() {}


/**
 * Represents the RemotePlayback connection's state.
 * @type {string}
 */
RemotePlayback.prototype.state;


/**
 * The watchAvailability() method of the RemotePlayback interface watches
 * the list of available remote playback devices and returns a Promise that
 * resolves with the callbackId of a remote playback device.
 *
 * @param {!function(boolean)} callback
 * @return {!Promise}
 */
RemotePlayback.prototype.watchAvailability = function(callback) {};


/**
 * The cancelWatchAvailability() method of the RemotePlayback interface
 * cancels the request to watch for one or all available devices.
 *
 * @param {number} id
 * @return {!Promise}
 */
RemotePlayback.prototype.cancelWatchAvailability = function(id) {};


/**
 * The prompt() method of the RemotePlayback interface prompts the user
 * to select an available remote playback device and give permission
 * for the current media to be played using that device.
 *
 * If the user gives permission, the state will be set to connecting and
 * the user agent will connect to the device to initiate playback.
 *
 * If the user chooses to instead disconnect from the device, the state will
 * be set to disconnected and user agent will disconnect from this device.
 *
 * @return {!Promise}
 */
RemotePlayback.prototype.prompt = function() {};


/** @type {RemotePlayback} */
HTMLMediaElement.prototype.remote;

