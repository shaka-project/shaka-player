/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdRequest');

goog.require('cml.cmcd.CmcdObjectTypeList');


/**
 * Common Media Client Data (CMCD) version 2 - Request Mode.
 *
 * A standardized set of HTTP request header fields and query string
 * parameters for communicating media playback metrics in request mode.
 *
 * Upstream CML uses an indexed signature for custom (`prefix-suffix`)
 * keys; closure typedefs cannot express that, so callers may attach
 * additional `string-string`-keyed properties as untyped extensions.
 *
 * The string-literal types for `ot`, `sf`, `sta`, `st` etc. are the
 * `cml.cmcd.CmcdObjectType`, `cml.cmcd.CmcdStreamingFormat`,
 * `cml.cmcd.CmcdPlayerState`, `cml.cmcd.CmcdStreamType` enum value
 * unions. We use plain `string` here to keep the typedef self-contained
 * and avoid circular `goog.require` between enum files and this typedef.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#request-mode}
 *
 * @typedef {{
 *   ab: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   bg: (boolean|undefined),
 *   bl: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   br: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   bs: (boolean|undefined),
 *   bsa: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   bsd: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   bsda: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   cdn: (string|undefined),
 *   cid: (string|undefined),
 *   cs: (string|undefined),
 *   d: (number|undefined),
 *   dfa: (number|undefined),
 *   dl: (number|undefined),
 *   ec: (!Array<string>|undefined),
 *   lab: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   lb: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   ltc: (number|undefined),
 *   msd: (number|undefined),
 *   mtp: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   nor: (!Array<*>|undefined),
 *   nr: (boolean|undefined),
 *   ot: (string|undefined),
 *   pb: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   pr: (number|undefined),
 *   pt: (number|undefined),
 *   rtp: (number|undefined),
 *   sf: (string|undefined),
 *   sid: (string|undefined),
 *   sn: (number|undefined),
 *   st: (string|undefined),
 *   sta: (string|undefined),
 *   su: (boolean|undefined),
 *   tab: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   tb: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   tbl: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   tpb: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   v: (number|undefined)
 * }}
 */
cml.cmcd.CmcdRequest;
