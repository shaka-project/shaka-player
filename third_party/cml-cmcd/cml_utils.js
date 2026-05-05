/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.urlToRelativePath');
goog.provide('cml.cmcd.uuid');


/**
 * UUID shim for the vendored @svta/cml-cmcd port.
 *
 * Upstream CML's `CmcdReporter` imports `uuid()` from `@svta/cml-utils`
 * and uses it as the default for `sid` in `createCmcdReporterConfig`.
 * The shaka adapter always sets `sid` explicitly, so this codepath is
 * dead at runtime — Closure ADVANCED will strip it. Kept for verbatim
 * parity with upstream CmcdReporter source so per-bump diffs stay
 * trivial.
 *
 * `crypto.randomUUID()` is polyfilled in browsers without native
 * support by `lib/polyfill/random_uuid.js`.
 *
 * @return {string}
 */
cml.cmcd.uuid = () => crypto.randomUUID();

/**
 * Constructs a relative path from a URL.
 *
 * Vendored verbatim from `@svta/cml-utils`'s `urlToRelativePath`. Used
 * by `cml.cmcd.CMCD_FORMATTER_MAP`'s `nor` formatter to produce
 * root-relative URLs when a `baseUrl` is supplied via
 * `CmcdEncodeOptions.baseUrl`.
 *
 * @param {string} url The destination URL.
 * @param {string} base The base URL.
 * @return {string} The relative path.
 */
cml.cmcd.urlToRelativePath = function(url, base) {
  const to = new URL(url);
  const from = new URL(base);

  if (to.origin !== from.origin) {
    return url;
  }

  const toPath = to.pathname.split('/').slice(1);
  const fromPath = from.pathname.split('/').slice(1, -1);

  // remove common parents
  const length = Math.min(toPath.length, fromPath.length);

  for (let i = 0; i < length; i++) {
    if (toPath[i] !== fromPath[i]) {
      break;
    }

    toPath.shift();
    fromPath.shift();
  }

  // add back paths
  while (fromPath.length) {
    fromPath.shift();
    toPath.unshift('..');
  }

  const relativePath = toPath.join('/');

  // preserve query parameters and hash of the destination url
  return relativePath + to.search + to.hash;
};
