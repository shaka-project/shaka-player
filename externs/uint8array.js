/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for Uint8Array base64/hex helpers
 *
 * @externs
 */

/**
 * Options for Uint8Array.prototype.toBase64().
 * @record
 */
function Uint8ArrayToBase64Options() {}

/** @type {(string|undefined)} */
Uint8ArrayToBase64Options.prototype.alphabet;

/** @type {(boolean|undefined)} */
Uint8ArrayToBase64Options.prototype.omitPadding;

/**
 * Options for Uint8Array.fromBase64().
 * @record
 */
function Uint8ArrayFromBase64Options() {}

/** @type {(string|undefined)} */
Uint8ArrayFromBase64Options.prototype.alphabet;

/** @type {(string|undefined)} */
Uint8ArrayFromBase64Options.prototype.lastChunkHandling;

/**
 * Returns a Base64-encoded string from the contents of this Uint8Array.
 * @param {Uint8ArrayToBase64Options=} options
 * @return {string}
 */
// eslint-disable-next-line no-extend-native
Uint8Array.prototype.toBase64 = function(options) {};

/**
 * Creates a new Uint8Array decoded from a Base64 string.
 * @param {string} string
 * @param {Uint8ArrayFromBase64Options=} options
 * @return {!Uint8Array}
 */
Uint8Array.fromBase64 = function(string, options) {};

/**
 * Returns a lowercase hex string from the contents of this Uint8Array.
 * Example: new Uint8Array([0xCA,0xFE]).toHex() === "cafe"
 * @return {string}
 */
// eslint-disable-next-line no-extend-native
Uint8Array.prototype.toHex = function() {};

/**
 * Creates a new Uint8Array decoded from a hex string (even-length; 0–9, A–F).
 * @param {string} string
 * @return {!Uint8Array}
 */
Uint8Array.fromHex = function(string) {};
