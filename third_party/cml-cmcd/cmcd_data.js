/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdData');

goog.require('cml.cmcd.Cmcd');


/**
 * A CMCD data object that is either version 1 or version 2.
 *
 * The `v` property acts as a discriminator: when `v === 2`, the type
 * narrows to v2 with inner-list values and event/response keys; when
 * `v === 1` or absent, the type narrows to v1 with scalar `bl`/`br`/
 * `mtp`/`tb` and string `nor`.
 *
 * Upstream CML expresses this as `CmcdV1Data | CmcdV2Data`. Closure
 * typedefs cannot express discriminated unions; we widen to the same
 * superset as `cml.cmcd.Cmcd`. Callers must inspect `v` themselves
 * when version-specific narrowing is required.
 *
 * @typedef {cml.cmcd.Cmcd}
 */
cml.cmcd.CmcdData;
