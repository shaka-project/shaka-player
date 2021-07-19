/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for TextTrackCue which are missing from the Closure
 * compiler.
 *
 * @externs
 */


/** @type {string} */
TextTrackCue.prototype.positionAlign;

/** @type {string} */
TextTrackCue.prototype.lineAlign;

/** @type {number|null|string} */
TextTrackCue.prototype.line;

/** @type {string} */
TextTrackCue.prototype.vertical;

/** @type {boolean} */
TextTrackCue.prototype.snapToLines;

/** @type {string} */
TextTrackCue.prototype.type;

/** @type {?} */
TextTrackCue.prototype.value;
