/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdCustomValue');


/**
 * A value type for custom CMCD keys.
 *
 * Upstream CML's TypeScript union covers raw scalars, structured-fields
 * `SfItem` wrappers, and arrays thereof. Closure cannot fully represent
 * the structured-field item shapes statically; we widen to a permissive
 * union that covers all wire-format-valid runtime shapes.
 *
 * @typedef {(string|number|boolean|symbol|!Array<*>|!Object)}
 */
cml.cmcd.CmcdCustomValue;
