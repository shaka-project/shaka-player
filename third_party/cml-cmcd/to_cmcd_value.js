/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.toCmcdValue');

goog.require('cml.cmcd.SfItem');


/**
 * Convert a value to a CMCD value.
 *
 * Upstream signature is generic
 * `<V extends SfBareItem, P>(value: V, params?: P): SfItem<V, P>`;
 * the closure port erases generics — every CMCD bare item flows through
 * the same `SfItem` runtime constructor.
 *
 * @param {*} value The value to convert to a CMCD value.
 * @param {*=} params The parameters to convert to a CMCD value.
 * @return {!cml.cmcd.SfItem} The CMCD value.
 */
cml.cmcd.toCmcdValue = function(value, params) {
  return new cml.cmcd.SfItem(value, params);
};
