/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * Add a set of http plugin tests, for the given scheme plugin.
 *
 * @param {boolean} usingFetch True if this should use fetch, false otherwise.
 */
function httpPluginTests(usingFetch) {
  // Neither plugin uses the request type, so this is arbitrary.
  const requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
  const Util = shaka.test.Util;

  // A dummy progress callback.
  const progressUpdated = (elapsedMs, bytes, bytesRemaining) => {};

  /** @type {shaka.extern.RetryParameters} */
  let retryParameters;

  /** @type {shaka.extern.SchemePlugin} */
  let plugin;

  beforeAll(() => {
    plugin = usingFetch ? shaka.net.HttpFetchPlugin.parse :
                          shaka.net.HttpXHRPlugin.parse;

    if (usingFetch) {
      // Install the mock only briefly in the global namespace, to get a handle
      // to the mocked fetch implementation.
      jasmine.Fetch.install();
      const MockFetch = window.fetch;
      const MockAbortController = window.AbortController;
      const MockReadableStream = window.ReadableStream;
      const MockHeaders = window.Headers;
      jasmine.Fetch.uninstall();
      // Now plug this mock into HttpRequest directly, so it does not interfere
      // with other requests, such as those made by karma frameworks like
      // source-map-support.
      shaka.net.HttpFetchPlugin['fetch_'] = MockFetch;
      shaka.net.HttpFetchPlugin['AbortController_'] = MockAbortController;
      shaka.net.HttpFetchPlugin['ReadableStream_'] = MockReadableStream;
      shaka.net.HttpFetchPlugin['Headers_'] = MockHeaders;
    } else {
      // Install the mock only briefly in the global namespace, to get a handle
      // to the mocked XHR implementation.
      jasmine.Ajax.install();
      const JasmineXHRMock = window.XMLHttpRequest;
      jasmine.Ajax.uninstall();

      // Wrap event handlers to catch errors
      // eslint-disable-next-line no-restricted-syntax
      const MockXHR = function() {
        const instance = new JasmineXHRMock();

        const events = ['abort', 'load', 'error', 'timeout', 'progress'];
        for (const eventName of events) {
          const eventHandlerName = 'on' + eventName;
          let eventHandler = null;

          Object.defineProperty(instance, eventHandlerName, {
            set: (callback) => {
              eventHandler = (event) => {
                // If an event handler throws, the test should fail, since
                // errors should be passed as reasons to `reject()`. Otherwise
                // we would leave the Promise in a pending state.
                try {
                  callback(event);
                } catch (error) {  // eslint-disable-line no-restricted-syntax
                  fail(
                      'Uncaught error in XMLHttpRequest#' + eventHandlerName +
                      ', ' + error.message);
                }
              };
            },
            get: () => eventHandler,
          });
        }

        return instance;
      };


      // Now plug this mock into HttpRequest directly, so it does not interfere
      // with other requests, such as those made by karma frameworks like
      // source-map-support.
      shaka.net.HttpXHRPlugin['Xhr_'] = MockXHR;
    }

    stubRequest('https://foo.bar/').andReturn({
      'response': new ArrayBuffer(10),
      'status': 200,
      'responseHeaders': {'FOO': 'BAR'},
    });
    stubRequest('https://foo.bar/202').andReturn({
      'response': new ArrayBuffer(0),
      'status': 202,
    });
    stubRequest('https://foo.bar/204').andReturn({
      'response': new ArrayBuffer(10),
      'status': 204,
      'responseHeaders': {'FOO': 'BAR'},
    });
    stubRequest('https://foo.bar/withemptyline').andReturn({
      'response': new ArrayBuffer(10),
      'status': 200,
      'responseHeaders': {'\nFOO': 'BAR'},
    });
    stubRequest('https://foo.bar/302').andReturn({
      'response': new ArrayBuffer(10),
      'status': 200,
      'responseHeaders': {'FOO': 'BAR'},
      'responseURL': 'https://foo.bar/after/302',
    });
    stubRequest('https://foo.bar/401').andReturn({
      'response': new ArrayBuffer(0),
      'status': 401,
    });
    stubRequest('https://foo.bar/403').andReturn({
      'response': new ArrayBuffer(0),
      'status': 403,
    });
    stubRequest('https://foo.bar/404').andReturn({
      'response': shaka.util.BufferUtils.toArrayBuffer(
          new Uint8Array([65, 66, 67])),  // "ABC"
      'status': 404,
      'responseHeaders': {'FOO': 'BAR'},
    });
    stubRequest('https://foo.bar/cache').andReturn({
      'response': new ArrayBuffer(0),
      'status': 200,
      'responseHeaders': {'X-Shaka-From-Cache': 'true'},
    });

    stubRequest('https://foo.bar/timeout').andTimeout();
    stubRequest('https://foo.bar/error').andError();

    retryParameters = shaka.net.NetworkingEngine.defaultRetryParameters();
    retryParameters.timeout = 4000;
  });

  afterAll(() => {
    if (usingFetch) {
      shaka.net.HttpFetchPlugin['fetch_'] = window.fetch;
      shaka.net.HttpFetchPlugin['AbortController_'] = window.AbortController;
      shaka.net.HttpFetchPlugin['ReadableStream_'] = window.ReadableStream;
      shaka.net.HttpFetchPlugin['Headers_'] = window.Headers;
    } else {
      shaka.net.HttpXHRPlugin['Xhr_'] = window.XMLHttpRequest;
    }
  });

  it('sets the correct fields', async () => {
    const request = shaka.net.NetworkingEngine.makeRequest(
        ['https://foo.bar/'], retryParameters);
    request.allowCrossSiteCredentials = true;
    request.method = 'POST';
    request.headers['BAZ'] = '123';

    await plugin(request.uris[0], request, requestType, progressUpdated)
        .promise;

    const actual = mostRecentRequest();
    expect(actual).toBeTruthy();
    expect(actual.url).toBe(request.uris[0]);
    expect(actual.method).toBe(request.method);
    expect(actual.withCredentials).toBe(true);
    // Headers are normalized into lowercase, so 'BAZ' becomes 'baz'.
    expect(actual.requestHeaders['baz']).toBe('123');
  });

  if (usingFetch) {
    // Regression test for an issue with Edge, where Fetch fails if the body
    // is set to null but succeeds on undefined.
    it('sets a request\'s null body to undefined', async () => {
      const request = shaka.net.NetworkingEngine.makeRequest(
          ['https://foo.bar/'], retryParameters);
      request.body = null;
      request.method = 'GET';

      await plugin(request.uris[0], request, requestType, progressUpdated)
          .promise;

      const actual = jasmine.Fetch.requests.mostRecent();
      expect(actual).toBeTruthy();
      expect(actual.body).toBeUndefined();
    });
  }

  it('succeeds with 204 status', async () => {
    await testSucceeds('https://foo.bar/204');
  });

  it('succeeds with empty line in response', async () => {
    await testSucceeds('https://foo.bar/withemptyline');
  });

  it('gets redirect URLs with 302 status', async () => {
    await testSucceeds('https://foo.bar/302', 'https://foo.bar/after/302');
  });

  it('fails with 202 status', async () => {
    const uri = 'https://foo.bar/202';
    const expected = new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.BAD_HTTP_STATUS,
        uri, 202, '', jasmine.any(Object), requestType);
    await testFails(uri, expected);
  });

  it('fails with CRITICAL for 401 status', async () => {
    const uri = 'https://foo.bar/401';
    const expected = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.BAD_HTTP_STATUS,
        uri, 401, '', jasmine.any(Object), requestType);
    await testFails(uri, expected);
  });

  it('fails with CRITICAL for 403 status', async () => {
    const uri = 'https://foo.bar/403';
    const expected = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.BAD_HTTP_STATUS,
        uri, 403, '', jasmine.any(Object), requestType);
    await testFails(uri, expected);
  });

  it('fails if non-2xx status', async () => {
    const uri = 'https://foo.bar/404';
    const expected = new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.BAD_HTTP_STATUS,
        uri, 404, 'ABC', {'foo': 'BAR'}, requestType);
    await testFails(uri, expected);
  });

  it('fails on timeout', async () => {
    const uri = 'https://foo.bar/timeout';
    const expected = new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.TIMEOUT,
        uri, requestType);

    // The timeout handler for Jasmine requires the mock clock to be installed.
    jasmine.clock().install();
    try {
      await testFails(uri, expected);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('fails on error', async () => {
    const uri = 'https://foo.bar/error';
    const expected = new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.HTTP_ERROR,
        uri, jasmine.any(Object), requestType);
    await testFails(uri, expected);
  });

  it('detects cache headers', async () => {
    const request = shaka.net.NetworkingEngine.makeRequest(
        ['https://foo.bar/cache'], retryParameters);

    const response =
        await plugin(request.uris[0], request, requestType, progressUpdated)
            .promise;
    expect(response).toBeTruthy();
    expect(response.fromCache).toBe(true);
  });

  it('aborts the request when the operation is aborted', async () => {
    let requestPromise;
    let uri;
    const oldXHRMock = shaka.net.HttpXHRPlugin['Xhr_'];
    if (usingFetch) {
      uri = 'https://foo.bar/timeout';
      const request = shaka.net.NetworkingEngine.makeRequest(
          [uri], retryParameters);
      const operation = plugin(
          request.uris[0], request, requestType, progressUpdated);

      /** @type {jasmine.Fetch.RequestStub} */
      const actual = jasmine.Fetch.requests.mostRecent();

      requestPromise = operation.promise;

      expect(actual.aborted).toBe(false);
      await operation.abort();
      await Util.shortDelay();  // Delay for jasmine-fetch to detect the abort.
      expect(actual.aborted).toBe(true);
    } else {
      /** @type {shaka.extern.IAbortableOperation.<shaka.extern.Response>} */
      let operation;

      // Jasmine-ajax stubbed requests are purely synchronous, so we can't
      // actually insert a call to abort in the middle.
      // Instead, install a very elementary mock.
      /** @constructor */
      function NewXHRMock() {  // eslint-disable-line no-inner-declarations
        this.abort = Util.spyFunc(jasmine.createSpy('abort'));

        this.open = Util.spyFunc(jasmine.createSpy('open'));

        /** @type {function()} */
        this.onabort;

        this.send = async () => {
          // Delay the effects of send until after operation is defined.
          await Promise.resolve();
          expect(this.abort).not.toHaveBeenCalled();
          operation.abort();
          expect(this.abort).toHaveBeenCalled();
          this.onabort();
        };
      }
      shaka.net.HttpXHRPlugin['Xhr_'] = NewXHRMock;

      uri = 'https://foo.bar/';
      const request = shaka.net.NetworkingEngine.makeRequest(
          [uri], retryParameters);
      operation = plugin(
          request.uris[0], request, requestType, progressUpdated);
      requestPromise = operation.promise;
    }

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.OPERATION_ABORTED,
        uri, requestType));
    await expectAsync(requestPromise).toBeRejectedWith(expected);

    shaka.net.HttpXHRPlugin['Xhr_'] = oldXHRMock;
  });

  /**
   * @param {string} uri
   * @return {jasmine.Ajax.Stub|jasmine.Fetch.RequestStub}
   */
  function stubRequest(uri) {
    if (usingFetch) {
      return jasmine.Fetch.stubRequest(uri);
    } else {
      return jasmine.Ajax.stubRequest(uri);
    }
  }

  /**
   * @param {string} uri
   * @param {string=} overrideUri
   */
  async function testSucceeds(uri, overrideUri) {
    const request = shaka.net.NetworkingEngine.makeRequest(
        [uri], retryParameters);
    const response =
        await plugin(uri, request, requestType, progressUpdated).promise;

    expect(mostRecentRequest().url).toBe(uri);
    expect(response).toBeTruthy();
    expect(response.uri).toBe(overrideUri || uri);
    expect(response.data).toBeTruthy();
    expect(response.data.byteLength).toBe(10);
    expect(response.fromCache).toBe(false);
    expect(response.headers).toBeTruthy();
    // Returned header names are in lowercase and should not contain empty lines
    expect(response.headers['foo']).toBe('BAR');
  }

  /**
   * @param {string} uri
   * @param {shaka.util.Error} expected
   */
  async function testFails(uri, expected) {
    const request = shaka.net.NetworkingEngine.makeRequest(
        [uri], retryParameters);

    const p = plugin(uri, request, requestType, progressUpdated).promise;
    if (expected.code == shaka.util.Error.Code.TIMEOUT) {
      jasmine.clock().tick(5000);
    }
    await expectAsync(p).toBeRejectedWith(expected);
  }

  /**
   * @return {jasmine.Ajax.RequestStub}
   */
  function mostRecentRequest() {
    if (usingFetch) {
      const mostRecent = jasmine.Fetch.requests.mostRecent();
      if (mostRecent) {
        // Convert from jasmine.Fetch.RequestStub to jasmine.Ajax.RequestStub
        return /** @type {jasmine.Ajax.RequestStub} */({
          url: mostRecent.url,
          query: mostRecent.query,
          data: mostRecent.data,
          method: mostRecent.method,
          requestHeaders: mostRecent.requestHeaders,
          withCredentials: mostRecent.withCredentials,
        });
      }
    }
    return jasmine.Ajax.requests.mostRecent();
  }
}

describe('HttpXHRPlugin', () => httpPluginTests(false));
describe('HttpFetchPlugin', () => httpPluginTests(true));
