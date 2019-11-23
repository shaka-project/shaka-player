/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for SVGElement which are missing from the Closure
 * compiler.
 *
 * @externs
 */

// Right now, we only use SVGElement in an instanceof check, so we just declare
// the type with nothing on it.

/** @constructor */
function SVGElement() {}
