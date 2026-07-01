/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdFormatter');

goog.require('cml.cmcd.CmcdFormatterOptions');
goog.require('cml.cmcd.CmcdValue');


/**
 * A formatter for CMCD values.
 *
 * Upstream CML return type is
 * `ValueOrArray<number | SfItem<number>> | ValueOrArray<string |
 * SfItem<string>>`. Closure cannot express the structured-field-item
 * wrappers; we widen the return to `*` for cross-formatter
 * assignability.
 *
 * @typedef {function(cml.cmcd.CmcdValue, cml.cmcd.CmcdFormatterOptions): *}
 */
cml.cmcd.CmcdFormatter;
