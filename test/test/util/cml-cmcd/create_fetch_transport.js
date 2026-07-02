/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.createFetchTransport');

goog.requireType('cml.cmcd.CmcdTransportAdapter');


/**
 * Normalize a Request to the HttpRequest shape (lowercase headers,
 * body read as UTF-8 string).
 *
 * @param {!Request} request
 * @return {!Promise<!Object<string, *>>}
 * @private
 */
cml.cmcd.createFetchTransport_toHttpRequest_ = async function(request) {
  /** @type {!Object<string, string>} */
  const headers = {};
  request.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });

  /** @type {string|undefined} */
  let body;
  if (request['body']) {
    try {
      body = await request.text();
    } catch (err) {
      body = undefined;
    }
  }

  return {
    url: request.url,
    method: request.method,
    headers: headers,
    body: body,
  };
};


/**
 * Create a transport adapter that patches `globalThis.fetch` to
 * capture CMCD-bearing requests.
 *
 * @return {!cml.cmcd.CmcdTransportAdapter}
 */
cml.cmcd.createFetchTransport = function() {
  return {
    attach: function(deliver) {
      const origFetch = globalThis.fetch;

      globalThis.fetch = async function(input, init) {
        const inspect = (input instanceof Request) ?
            input.clone() :
            new Request(/** @type {!RequestInfo} */ (input), init);
        const httpRequest =
            await cml.cmcd.createFetchTransport_toHttpRequest_(inspect);
        const synthetic = deliver(httpRequest);
        if (synthetic) {
          return synthetic;
        }
        return origFetch.call(
            globalThis, /** @type {!RequestInfo} */ (input), init);
      };

      return function() {
        globalThis.fetch = origFetch;
      };
    },
  };
};
