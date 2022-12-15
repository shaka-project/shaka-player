/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for SourceBuffer which are missing from the Closure
 * compiler.
 *
 * @externs
 */


/** @type {string} */
SourceBuffer.prototype.mode;

// TODO: need to figure out how to correctly override this
// SourceBuffer.prototype.changeType = function(type) {};
