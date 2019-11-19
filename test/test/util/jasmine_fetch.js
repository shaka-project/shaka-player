/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


// TODO: this only contains the methods that we use; if this is published
// it should contain the entire breadth of options in jasmine-ajax.

jasmine.Fetch = class {
  /**
   * Install a Jasmine-based mock for the fetch API.
   * This API is based on that of jasmine-ajax.
   */
  static install() {
    if (jasmine.Fetch.container_ && jasmine.Fetch.container_.installed_) {
      // jasmine.Fetch is already installed
      return;
    }

    // Set up the container.
    jasmine.Fetch.container_ = jasmine.Fetch.container_ || {};
    jasmine.Fetch.container_.installed_ = true;
    jasmine.Fetch.container_.stubbedRequests = {};
    /** @type {jasmine.Fetch.RequestStub} */
    jasmine.Fetch.container_.lastFetchRequestStub;
    jasmine.Fetch.container_.oldFetch = window.fetch;
    jasmine.Fetch.container_.oldHeaders = window.Headers;
    jasmine.Fetch.container_.oldAbortController = window.AbortController;
    jasmine.Fetch.container_.oldResponse = window.Response;
    jasmine.Fetch.container_.oldReadableStream = window.ReadableStream;
    /** @type {!Response} */
    jasmine.Fetch.container_.latestResponse;

    window.Headers = /** @type {function (new:Headers,
          (!Array<!Array<string>>|Headers|Object<string,string>)=)} */(
        jasmine.Fetch.Headers);

    window.AbortController = /** @type {function (new:AbortController)} */
        (jasmine.Fetch.AbortController);

    window.Response = /** @type {function (new:Response)} */
        (jasmine.Fetch.Response);

    window.ReadableStream = /** @type {function (new:ReadableStream)} */
        (jasmine.Fetch.ReadableStream);

    window.fetch = (input, init) => {
      // TODO: this does not support input in Request form
      const url = /** @type {string} */ (input);
      return jasmine.Fetch.impl_(url, init || null);
    };
  }

  /**
   * @return {!Error}
   * @private
   */
  static makeAbortError_() {
    // As per the spec, this should be a DOMException, but
    // there is not a public constructor for this
    const exception = new Error('The operation was aborted. ');
    exception.name = 'AbortError';
    exception.code = 20;
    return exception;
  }

  /**
   * @param {string} url
   * @param {RequestInit} init
   * @return {!Promise.<!Response>}
   * @private
   */
  static impl_(url, init) {
    if (init['signal'] && init['signal']()) {
      // Throw an exception.
      return Promise.reject(jasmine.Fetch.makeAbortError_());
    }

    const headers = {};
    const initHeaders = new jasmine.Fetch.Headers(init.headers);
    initHeaders.forEach((value, key) => {
      headers[key] = value;
    });

    const newStub = /** @type {jasmine.Fetch.RequestStub} */({
      url: url,
      query: null,
      data: null,
      body: init.body,
      method: init.method,
      requestHeaders: headers,
      withCredentials: init.credentials == 'include',
      aborted: false,
    });
    jasmine.Fetch.container_.lastFetchRequestStub = newStub;

    const stubbed = jasmine.Fetch.container_.stubbedRequests[url];
    if (stubbed.callFunc) {
      const callFunc = stubbed.callFunc;
      stubbed.callFunc = undefined;
      callFunc(stubbed, self);
      // Call fetch again, in case callFunc changed the stub's action.
      return jasmine.Fetch.impl_(url, init);
    } else if (stubbed.response) {
      const responseHeaders = new jasmine.Fetch.Headers();
      for (const key in stubbed.response.responseHeaders) {
        responseHeaders.append(key, stubbed.response.responseHeaders[key]);
      }

      const body = {
        getReader: () => {
          const sequence = [{
            done: false, value: {byteLength: 100},
          }, {
            done: true, value: null,
          }];
          const read = () => {
            return Promise.resolve(sequence.shift());
          };
          return {read: read};
        },
      };

      // This creates an anonymous object instead of using the
      // built-in response constructor, because the fetch API
      // does not include a very good constructor for Response.
      const response = /** @type {!Response} */ ({
        status: stubbed.response.status,
        body: body,
        headers: responseHeaders,
        url: stubbed.response.responseURL || url,
        arrayBuffer: () => {
          return Promise.resolve(stubbed.response.response);
        },
        clone: () => response,
      });
      jasmine.Fetch.container_.latestResponse = response;
      return Promise.resolve(jasmine.Fetch.container_.latestResponse);
    } else if (stubbed.error) {
      return Promise.reject({message: 'fake error'});
    } else if (stubbed.timeout) {
      // Fetch does not time out yet, so just return a promise that rejects when
      // the user aborts.
      return new Promise(((resolve, reject) => {
        const interval = setInterval(() => {
          if (init['signal'] && init['signal']()) {
            // TODO: This assumes that this request is still the most recent.
            // If you have multiple requests at once, this could be incorrect.
            jasmine.Fetch.container_.lastFetchRequestStub.aborted = true;
            clearInterval(interval);
            reject(jasmine.Fetch.makeAbortError_());
          }
        }, 10);
      }));
    }
    throw new Error('no known action');
  }

  /**
   * Uninstalls jasmine-fetch.
   */
  static uninstall() {
    if (jasmine.Fetch.container_ && jasmine.Fetch.container_.installed_) {
      window.fetch = jasmine.Fetch.container_.oldFetch;
      window.Headers = jasmine.Fetch.container_.oldHeaders;
      window.AbortController = jasmine.Fetch.container_.oldAbortController;
      window.Response = jasmine.Fetch.container_.oldResponse;
      window.ReadableStream = jasmine.Fetch.container_.oldReadableStream;
      jasmine.Fetch.container_.installed_ = false;
    }
  }

  /**
   * @param {string} url
   * @return {jasmine.Fetch.RequestStub}
   */
  static stubRequest(url) {
    const stub = new jasmine.Fetch.RequestStub(url);
    jasmine.Fetch.container_.stubbedRequests[url] = stub;
    return stub;
  }
};

jasmine.Fetch.AbortController = class {
  constructor() {
    // TODO: I don't know if this implementation of AbortController is correct,
    // but it works for our tests
    this.aborted_ = false;
    this.signal = () => this.aborted_;
  }

  /**
   * Aborts any request that has been supplied the AbortController's signal.
   */
  abort() {
    this.aborted_ = true;
  }
};

/**
 * Contains information on requests made.
 */
jasmine.Fetch.requests = class {
  /**
   * @return {jasmine.Fetch.RequestStub} request
   */
  static mostRecent() {
    return jasmine.Fetch.container_.lastFetchRequestStub;
  }
};

jasmine.Fetch.ReadableStream = class {
  /** @param {!Object} underlyingSource */
  constructor(underlyingSource) {
    const noop = () => {};
    const controller = {
      close: noop,
      enqueue: noop,
    };
    underlyingSource.start(controller);
  }
};

jasmine.Fetch.Response = class {
  constructor() {
    // Returns a copy of the most recent fake response.
    const latest = jasmine.Fetch.container_.latestResponse;
    this.status = latest.status;
    this.body = latest.body;
    this.headers = latest.headers;
    this.url = latest.url;
    const arrayBuffer = latest.arrayBuffer;
    this.arrayBuffer = () => arrayBuffer;
  }
};

jasmine.Fetch.Headers = class {
  // TODO: add missing Headers methods: delete, entries, set, values
  // see https://developer.mozilla.org/en-US/docs/Web/API/Headers
  // also, make it conform to the iterable protocol

  /**
   * @param {(!Array<!Array<string>>|Headers|Object<string,string>)=} headers
   */
  constructor(headers) {
    this.contents = {};

    if (headers) {
      if (headers instanceof jasmine.Fetch.Headers) {
        // Extract contents, to be read as a generic object below.
        headers = headers.contents;
      }
      if (Array.isArray(headers)) {
        for (const header of headers) {
          this.append(header[0], header[1]);
        }
      } else {
        for (const name of Object.getOwnPropertyNames(headers)) {
          this.append(name, headers[name]);
        }
      }
    }
  }

  /**
   * @param {string} name
   * @param {string} value
   */
  append(name, value) {
    // Normalize name before setting.
    const normalized = name.toLowerCase();
    this.contents[normalized] = value;
  }

  /**
   * @param {Function} apply
   */
  forEach(apply) {
    for (const name of Object.getOwnPropertyNames(this.contents)) {
      apply(this.get(name), name, this);
    }
  }

  /**
   * @return {Object}
   */
  keys() {
    const contentsNames = Object.getOwnPropertyNames(this.contents);
    let index = 0;
    return {
      next: () => {
        return index < contentsNames.length ?
            {value: contentsNames[index++], done: false} :
            {done: true};
      },
    };
  }

  /**
   * @param {string} header
   * @return {string} value
   */
  get(header) {
    return this.contents[header];
  }
};

jasmine.Fetch.RequestStub = class {
  /**
   * @param {string} url
   */
  constructor(url) {
    /** @type {string} */
    this.url = url;
    this.response = undefined;
    this.callFunc = undefined;
    this.timeout = false;
    this.error = false;

    /** @type {ArrayBuffer|undefined} */
    this.body = undefined;
    /** @type {?string} */
    this.query = null;
    /** @type {?Object} */
    this.data = null;
    /** @type {?string} */
    this.method = null;
    /** @type {Object} */
    this.requestHeaders = {};
    /** @type {boolean} */
    this.withCredentials = false;
    /** @type {boolean} */
    this.aborted = false;
  }

  /**
   * @param {Object} response
   * @return {jasmine.Fetch.RequestStub}
   */
  andReturn(response) {
    this.response = response;
    this.callFunc = undefined;
    this.timeout = false;
    this.error = false;
    return this;
  }

  /**
   * @param {Function} callFunc
   * @return {jasmine.Fetch.RequestStub}
   */
  andCallFunction(callFunc) {
    this.response = undefined;
    this.callFunc = callFunc;
    this.timeout = false;
    this.error = false;
    return this;
  }

  /**
   * @return {jasmine.Fetch.RequestStub}
   */
  andTimeout() {
    this.response = undefined;
    this.callFunc = undefined;
    this.timeout = true;
    this.error = false;
    return this;
  }

  /**
   * @return {jasmine.Fetch.RequestStub}
   */
  andError() {
    this.response = undefined;
    this.callFunc = undefined;
    this.timeout = false;
    this.error = true;
    return this;
  }
};
