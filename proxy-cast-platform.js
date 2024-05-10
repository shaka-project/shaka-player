/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Proxy cast platform methods across frames.  Shared between the
 * test environment and support.html.
 */

/**
 * Patch Cast's cast.__platform__.canDisplayType to allow it to operate across
 * frames and origins in our testing environment.
 *
 * The Cast runtime only exposes cast.__platform__ on the top window, not
 * iframes embedded within it.  However, both Chromecast WebDriver Server in
 * our lab and the test runner Karma use iframes, and there are three different
 * origins involved: WebDriver Server's receiver at github.io, Karma's
 * top-level, and an inner frame of Karma that is raw HTML as text with no
 * origin.
 *
 * With all of these complexities, the only way to access cast.__platform__ is
 * asynchronously via postMessage.  This means all callers of
 * cast.__platform__.canDisplayType must use `await`, even though the
 * underlying method is synchronous.  If the caller is running in the top frame
 * (as in a real receiver), `await` will do no harm.  If the caller is running
 * inside our tests in Karma, the `await` is critical to access __platform__
 * via this shim.
 */
function proxyCastCanDisplayType() {
  if (!navigator.userAgent.includes('CrKey')) {
    // Not Chromecast, do nothing.
    return;
  }

  // Create the namespaces if needed.
  if (!window.cast) {
    window['cast'] = {};
  }
  if (!cast.__platform__) {
    cast['__platform__'] = {};
  }

  if (cast.__platform__.canDisplayType) {
    // Already exists, do nothing.
    return;
  }

  // Create an async shim.  Calls to canDisplayType will be translated into
  // async messages to the top frame, which will then execute the method and
  // post a message back with results (or an error).  The resolve/reject
  // functions for the shim's returned Promise will be stored temporarily in
  // these maps and matched up by request ID.
  /** @type {!Map<number, function(?)>} */
  const resolveMap = new Map();
  /** @type {!Map<number, function(?)>} */
  const rejectMap = new Map();
  /** @type {number} */
  let nextId = 0;

  /**
   * @typedef {{
   *   id: number,
   *   type: string,
   *   result: *,
   * }}
   */
  let CastShimMessage;

  // Listen for message events for results/errors from the top frame.
  window.addEventListener('message', (event) => {
    const data = /** @type {CastShimMessage} */(event['data']);
    console.log('Received cross-frame message', data);

    if (data.type == 'cast.__platform__:result') {
      // Find the matching resolve function and resolve the promise for this
      // request.
      const resolve = resolveMap.get(data.id);
      if (resolve) {
        resolve(data.result);

        // Clear both resolve and reject from the maps for this ID.
        resolveMap.delete(data.id);
        rejectMap.delete(data.id);
      }
    } else if (data.type == 'cast.__platform__:error') {
      // Find the matching reject function and reject the promise for this
      // request.
      const reject = rejectMap.get(data.id);
      if (reject) {
        reject(data.result);

        // Clear both resolve and reject from the maps for this ID.
        resolveMap.delete(data.id);
        rejectMap.delete(data.id);
      }
    }
  });

  // Shim canDisplayType to proxy the request up to the top frame.
  cast.__platform__.canDisplayType = /** @type {?} */(castCanDisplayTypeShim);

  /**
   * @param {string} type
   * @return {!Promise<boolean>}
   */
  function castCanDisplayTypeShim(type) {
    return new Promise((resolve, reject) => {
      // Craft a message for the top frame to execute this method for us.
      const message = {
        id: nextId++,
        type: 'cast.__platform__',
        command: 'canDisplayType',
        args: Array.from(arguments),
      };

      // Store the resolve and reject functions so we can act on results/errors
      // later.
      resolveMap.set(message.id, resolve);
      rejectMap.set(message.id, reject);

      // Reject after a 5s timeout.  This can happen if we're running under an
      // incompatible version of Chromecast WebDriver Server's receiver app.
      setTimeout(() => {
        reject(new Error('canDisplayType timeout!'));

        // Clear both resolve and reject from the maps for this ID.
        resolveMap.delete(message.id);
        rejectMap.delete(message.id);
      }, 5000);

      // Send the message to the top frame.
      console.log('Sending cross-frame message', message);
      window.top.postMessage(message, '*');
    });
  }
}
