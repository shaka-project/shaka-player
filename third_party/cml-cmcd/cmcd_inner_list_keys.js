/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_INNER_LIST_KEYS');


/**
 * Keys that are inner lists in V2 but plain scalars in V1.
 *
 * Used by both encoding (down-conversion) and decoding (up-conversion).
 *
 * @const {!Set<string>}
 */
cml.cmcd.CMCD_INNER_LIST_KEYS = new Set([
  'ab', 'bl', 'br', 'bsa', 'bsd', 'bsda', 'lab', 'lb', 'mtp',
  'pb', 'tab', 'tb', 'tbl', 'tpb',
]);
