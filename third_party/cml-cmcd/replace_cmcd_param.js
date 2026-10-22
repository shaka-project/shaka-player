/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.replaceCmcdParam');

goog.require('cml.cmcd.CMCD_PARAM');
goog.require('cml.cmcd.percentEncode');


/**
 * @param {string} param
 * @return {boolean}
 * @private
 */
cml.cmcd.replaceCmcdParam_isCmcdParam_ = function(param) {
  return param === cml.cmcd.CMCD_PARAM ||
      param.startsWith(`${cml.cmcd.CMCD_PARAM}=`);
};


/**
 * Replace the `CMCD` query parameter of a URL.
 *
 * The first `CMCD` parameter takes the new value in place. The function
 * removes the other `CMCD` parameters. If the URL has no `CMCD` parameter,
 * the new parameter goes at the end of the query. An empty `value` only
 * removes the parameters. The function does not change the rest of the
 * URL. The URL can be relative.
 *
 * @param {string} url The URL.
 * @param {string=} value The encoded CMCD data, before percent-encoding.
 * @return {string} The URL with at most one `CMCD` parameter.
 */
cml.cmcd.replaceCmcdParam = function(url, value) {
  const hashIndex = url.indexOf('#');
  const end = hashIndex === -1 ? url.length : hashIndex;
  const queryIndex = url.indexOf('?');
  const start = queryIndex === -1 || queryIndex > end ? end : queryIndex;
  /** @type {!Array<string>} */
  const params = [];
  let param = value ?
      `${cml.cmcd.CMCD_PARAM}=${cml.cmcd.percentEncode(value)}` : '';
  let found = false;

  for (const item of start < end ? url.slice(start + 1, end).split('&') : []) {
    if (!cml.cmcd.replaceCmcdParam_isCmcdParam_(item)) {
      params.push(item);
    } else {
      found = true;

      if (param) {
        params.push(param);
        param = '';
      }
    }
  }

  if (param) {
    if (params[params.length - 1] === '') {
      params.pop();
    }

    params.push(param);
  } else if (!found) {
    return url;
  }

  const query = params.join('&');

  return `${url.slice(0, start)}${query ? `?${query}` : ''}${url.slice(end)}`;
};
