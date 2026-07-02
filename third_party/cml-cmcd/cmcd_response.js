/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdResponse');

goog.requireType('cml.cmcd.CmcdObjectTypeList');


/**
 * Common Media Client Data (CMCD) version 2 - Response Mode.
 *
 * Extends `cml.cmcd.CmcdRequest` with response-specific keys
 * (`cmsdd`, `cmsds`, `rc`, `smrt`, `ttfb`, `ttfbb`, `ttlb`, `url`)
 * for reporting response data per the CMCD v2 specification. These
 * keys MUST only be reported on events of type `rr` (response received).
 *
 * Upstream CML expresses this as `CmcdRequest & {response keys...}`.
 * Closure typedefs cannot express type intersection; we list the union
 * of all properties (request + response) directly. All members optional.
 *
 * The string-literal types for `ot`, `sf`, `sta`, `st` are the
 * `cml.cmcd.CmcdObjectType`, `cml.cmcd.CmcdStreamingFormat`,
 * `cml.cmcd.CmcdPlayerState`, `cml.cmcd.CmcdStreamType` enum value
 * unions. We use plain `string` here to keep the typedef self-contained
 * and avoid circular `goog.require` between enum files and this typedef.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#response-mode}
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
 *   cmsdd: (string|undefined),
 *   cmsds: (string|undefined),
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
 *   rc: (number|undefined),
 *   rtp: (number|undefined),
 *   sf: (string|undefined),
 *   sid: (string|undefined),
 *   smrt: (string|undefined),
 *   sn: (number|undefined),
 *   st: (string|undefined),
 *   sta: (string|undefined),
 *   su: (boolean|undefined),
 *   tab: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   tb: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   tbl: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   tpb: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   ttfb: (number|undefined),
 *   ttfbb: (number|undefined),
 *   ttlb: (number|undefined),
 *   url: (string|undefined),
 *   v: (number|undefined)
 * }}
 */
cml.cmcd.CmcdResponse;
