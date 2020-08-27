/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for HTMLMediaElement related to casting which were
 * missing in the Closure compiler.
 *
 * @externs
 */


/**
 * If true, Chrome on Android won't offer to cast in a src= playback.
 *
 * @type {boolean}
 */
HTMLMediaElement.prototype.disableRemotePlayback;
