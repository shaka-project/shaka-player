/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdValue');


/**
 * A CMCD value — `ValueOf<Cmcd>`. Any concrete value that may appear
 * for some key in a CMCD payload (number, string, boolean, list, etc.).
 *
 * Closure cannot express `ValueOf<T>` statically; widen to the unrestricted
 * runtime union. Encoders narrow further at the call site.
 *
 * @typedef {*}
 */
cml.cmcd.CmcdValue;
