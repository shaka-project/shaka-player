/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdObjectTypeList');


/**
 * A numeric list with an optional object type boolean flag.
 *
 * Upstream CML type:
 * `(number | SfItem<number, ExclusiveRecord<CmcdObjectType, boolean>>)[]`.
 * The `SfItem` wrapper is structured-field metadata that closure cannot
 * statically express; widen to `Array<*>` to cover both bare numbers
 * and SfItem-wrapped numbers.
 *
 * @typedef {!Array<*>}
 */
cml.cmcd.CmcdObjectTypeList;
