/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for PlayStation
 *
 * @externs
 */


/** @const */
var msdk = {};


/** @const */
msdk.device = {};


/**
 * @return {!Promise<{resolution: string}>}
 */
msdk.device.getDisplayInfo = function() {};


/**
 * @return {!Promise<{resolution: string}>}
 */
msdk.device.getDisplayInfoImmediate = function() {};
