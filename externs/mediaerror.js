/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @fileoverview Externs for MediaError properties not in the Closure compiler.
 *
 * @externs
 */


/**
 * A new field in the living standard to give a more informative diagnostic
 * message about the error.
 * @type {string}
 */
MediaError.prototype.message;


/**
 * A Microsoft Edge and IE extension to add a Windows error code.
 * @type {number}
 */
MediaError.prototype.msExtendedCode;
