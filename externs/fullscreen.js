/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for prefixed fullscreen methods.
 * @externs
 */


Document.prototype.msExitFullscreen = function() {};


Document.prototype.webkitExitFullscreen = function() {};

/**
 * @return {!boolean}
 */
Document.prototype.webkitSupportsFullscreen = function() {};

