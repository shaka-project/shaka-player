/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for ManagedMediaSource which were missing in the
 * Closure compiler.
 *
 * @externs
 */

/**
 * @constructor
 * @implements {EventTarget}
 */
function ManagedMediaSource() {}

/** @override */
ManagedMediaSource.prototype.addEventListener =
    function(type, listener, optPptions) {};

/** @override */
ManagedMediaSource.prototype.removeEventListener =
    function(type, listener, optPptions) {};

/** @override */
ManagedMediaSource.prototype.dispatchEvent = function(evt) {};

/** @type {Array<SourceBuffer>} */
ManagedMediaSource.prototype.sourceBuffers;

/** @type {Array<SourceBuffer>} */
ManagedMediaSource.prototype.activeSourceBuffers;

/** @type {number} */
ManagedMediaSource.prototype.duration;

/**
 * @param {string} type
 * @return {SourceBuffer}
 */
ManagedMediaSource.prototype.addSourceBuffer = function(type) {};

/**
 * @param {SourceBuffer} sourceBuffer
 * @return {undefined}
 */
ManagedMediaSource.prototype.removeSourceBuffer = function(sourceBuffer) {};

/**
 * Updates the live seekable range.
 * @param {number} start
 * @param {number} end
 */
ManagedMediaSource.prototype.setLiveSeekableRange = function(start, end) {};

/**
 * Clears the live seekable range.
 * @return {void}
 */
ManagedMediaSource.prototype.clearLiveSeekableRange = function() {};

/** @type {string} */
ManagedMediaSource.prototype.readyState;

/**
 * @param {string=} optError
 * @return {undefined}
 */
ManagedMediaSource.prototype.endOfStream = function(optError) {};

/**
 * @param {string} type
 * @return {boolean}
 */
ManagedMediaSource.isTypeSupported = function(type) {};
