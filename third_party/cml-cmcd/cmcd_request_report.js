/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdRequestReport');

goog.requireType('cml.cmcd.Cmcd');


/**
 * A report of a CMCD request.
 *
 * Upstream CML expresses this as a generic `HttpRequest & {customData:
 * {cmcd: Cmcd} & D; headers: Record<string, string>}`. Closure typedefs
 * cannot express generics or type intersection; we list the structural
 * superset of fields (`HttpRequest` shape — `url`, `method`, `body`,
 * `headers`, `customData`, etc. — plus the required `customData.cmcd`
 * narrowing). The generic `D` parameter erases; callers extending
 * `customData` with additional fields treat them as untyped extensions.
 *
 * `body`, `responseType`, `credentials`, `mode` widen to `*` /
 * `string` since their upstream types come from `@svta/cml-utils`'
 * `HttpRequest` (and DOM lib types) which are erased here.
 *
 * @typedef {{
 *   url: string,
 *   method: (string|undefined),
 *   body: (*|undefined),
 *   responseType: (string|undefined),
 *   headers: !Object<string, string>,
 *   credentials: (string|undefined),
 *   mode: (string|undefined),
 *   timeout: (number|undefined),
 *   customData: {cmcd: !cml.cmcd.Cmcd}
 * }}
 */
cml.cmcd.CmcdRequestReport;
