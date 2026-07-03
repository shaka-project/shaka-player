/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.createXhrTransport');

goog.require('shaka.util.StringUtils');

goog.requireType('cml.cmcd.CmcdTransportAdapter');


/**
 * Complete an XHR with the given synthetic response.
 *
 * @param {!XMLHttpRequest} xhr
 * @param {!Response} response
 * @return {!Promise<void>}
 * @private
 */
cml.cmcd.createXhrTransport_completeXhrWith_ =
    async function(xhr, response) {
  let text = '';
  try {
    text = await response.clone().text();
  } catch (err) {
    text = '';
  }

  // shaka's HttpXHRPlugin sets responseType='arraybuffer' and asserts that
  // xhr.response is an ArrayBuffer, so honor the requested responseType
  // when completing synthetically. Uses shaka.util.StringUtils (a deliberate
  // divergence from the dependency-free upstream port) because shaka's
  // conformance config bans direct TextEncoder and TypedArray.buffer use.
  const responseValue = (xhr.responseType === 'arraybuffer') ?
      shaka.util.StringUtils.toUTF8(text) :
      text;

  const ProgressEventCtor = (typeof ProgressEvent !== 'undefined') ?
      ProgressEvent :
      Event;

  // Defer completion to a fresh microtask so onload/onloadend never fire
  // synchronously within send(), mirroring real XHR behavior.
  await Promise.resolve();

  const xhrAny = /** @type {!Object<string, *>} */ (xhr);
  try {
    Object.defineProperty(
        xhr, 'status', {value: response.status, configurable: true});
    Object.defineProperty(
        xhr, 'statusText',
        {value: response.statusText, configurable: true});
    Object.defineProperty(
        xhr, 'readyState', {value: 4, configurable: true});
    Object.defineProperty(
        xhr, 'responseURL',
        {value: xhrAny['_cmcdUrl'] || '', configurable: true});
    Object.defineProperty(
        xhr, 'response', {value: responseValue, configurable: true});
    Object.defineProperty(
        xhr, 'responseText', {value: text, configurable: true});

    if (typeof xhr.onload === 'function') {
      xhr.onload.call(xhr, new ProgressEventCtor('load'));
    }
    if (typeof xhr.onloadend === 'function') {
      xhr.onloadend.call(xhr, new ProgressEventCtor('loadend'));
    }
  } catch (err) {
    // Fallback for environments where defineProperty is restricted.
    xhrAny['status'] = response.status;
    xhrAny['statusText'] = response.statusText;
    xhrAny['readyState'] = 4;
    xhrAny['responseURL'] = xhrAny['_cmcdUrl'] || '';
    xhrAny['response'] = responseValue;
    xhrAny['responseText'] = text;
    if (typeof xhr.onload === 'function') {
      xhr.onload.call(xhr, new ProgressEventCtor('load'));
    }
    if (typeof xhr.onloadend === 'function') {
      xhr.onloadend.call(xhr, new ProgressEventCtor('loadend'));
    }
  }
};


/**
 * Create a transport adapter that patches `XMLHttpRequest.prototype`.
 *
 * @return {!cml.cmcd.CmcdTransportAdapter}
 */
cml.cmcd.createXhrTransport = function() {
  return {
    attach: function(deliver) {
      // `window`, not `globalThis`: older Tizen/WebOS (Chromium < 71) lack
      // globalThis and karma's babel pipeline does not polyfill it.
      const Xhr = window.XMLHttpRequest;
      if (!Xhr) {
        return function() { /* no XHR to detach */ };
      }
      const origOpen = Xhr.prototype.open;
      const origSetRequestHeader = Xhr.prototype.setRequestHeader;
      const origSend = Xhr.prototype.send;

      Xhr.prototype.open = function(method, url) {
        const self = /** @type {!Object<string, *>} */ (this);
        self['_cmcdMethod'] = method;
        self['_cmcdUrl'] = (typeof url === 'string') ? url : url.toString();
        self['_cmcdHeaders'] = {};
        return origOpen.apply(this, arguments);
      };

      Xhr.prototype.setRequestHeader = function(name, value) {
        const self = /** @type {!Object<string, *>} */ (this);
        if (self['_cmcdHeaders']) {
          self['_cmcdHeaders'][name.toLowerCase()] = value;
        }
        return origSetRequestHeader.apply(this, [name, value]);
      };

      Xhr.prototype.send = function(body) {
        const self = /** @type {!Object<string, *>} */ (this);
        const httpRequest = {
          url: self['_cmcdUrl'] || '',
          method: (/** @type {string} */ (self['_cmcdMethod']) || 'GET')
              .toUpperCase(),
          headers: self['_cmcdHeaders'] || {},
          body: (typeof Document !== 'undefined' && body instanceof Document) ?
              undefined :
              (body || undefined),
        };

        const synthetic = deliver(httpRequest);
        if (synthetic) {
          cml.cmcd.createXhrTransport_completeXhrWith_(this, synthetic);
          return;
        }

        return origSend.apply(this, [body]);
      };

      return function() {
        Xhr.prototype.open = origOpen;
        Xhr.prototype.setRequestHeader = origSetRequestHeader;
        Xhr.prototype.send = origSend;
      };
    },
  };
};
