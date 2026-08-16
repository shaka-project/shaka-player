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
 * @extends {MediaSource}
 */
function ManagedMediaSource() {}

/**
 * @param {string} type
 * @return {boolean}
 */
ManagedMediaSource.isTypeSupported = function(type) {};

/**
 * @constructor
 * @extends {SourceBuffer}
 */
function ManagedSourceBuffer() {}
