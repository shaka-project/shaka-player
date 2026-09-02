/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdHeaderMap');

goog.require('cml.cmcd.CmcdKey');


/**
 * A map of CMCD header fields (`CMCD-Object`, `CMCD-Request`,
 * `CMCD-Session`, `CMCD-Status`) to the CMCD keys to include under
 * each header.
 *
 * Upstream CML: `Record<CmcdHeaderField, CmcdKey[]>`.
 *
 * @typedef {!Object<string, !Array<cml.cmcd.CmcdKey>>}
 */
cml.cmcd.CmcdHeaderMap;
