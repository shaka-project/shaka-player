/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


/**
 * Add a set of http plugin tests, for the given scheme plugin.
 *
 * @param {boolean} usingFetch True if this should use fetch, false otherwise.
 */
function httpPluginTests(usingFetch) {
  // Neither plugin uses the request type, so this is arbitrary.
  const requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;

  // A dummy progress callback.
  const progressUpdated = (elapsedMs, bytes, bytesRemaining) => {};

  /** @type {shaka.extern.RetryParameters} */
  let retryParameters;

  /** @type {shaka.extern.SchemePlugin} */
  let plugin;

  beforeAll(function() {
    plugin = usingFetch ? shaka.net.HttpFetchPlugin : shaka.net.HttpXHRPlugin;
    PromiseMock.install();

    if (usingFetch) {
      // Install the mock only briefly in the global namespace, to get a handle
      // to the mocked fetch implementation.
      jasmine.Fetch.install();
      let MockFetch = window.fetch;
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
      const MockXHR = function() {
        const instance = new JasmineXHRMock();

        const events = ['abort', 'load', 'error', 'timeout', 'progress'];
        for (const eventName of events) {
          const eventHandlerName = 'on' + eventName;
          let eventHandler = null;

          Object.defineProperty(instance, eventHandlerName, {
            set: function(callback) {
              eventHandler = function(event) {
                // If an event handler throws, the test should fail, since
                // errors should be passed as reasons to `reject()`. Otherwise
                // we would leave the Promise in a pending state.
                try {
                  callback(event);
                } catch (error) {
                  fail('Uncaught error in XMLHttpRequest#' + eventHandlerName);
                }
              };
            },
            get: function() {
              return eventHandler;
            },
          });
        }

        return instance;
      };


      // Now plug this mock into HttpRequest directly, so it does not interfere
      // with other requests, such as those made by karma frameworks like
      // source-map-support.
      shaka.net.HttpXHRPlugin['Xhr_'] = MockXHR;
    }

    jasmine.clock().install();

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
      'response': new ArrayBuffer(0),
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
      'response': new Uint8Array([65, 66, 67]).buffer, // "ABC"
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

  afterAll(function() {
    if (usingFetch) {
      shaka.net.HttpFetchPlugin['fetch_'] = window.fetch;
      shaka.net.HttpFetchPlugin['AbortController_'] = window.AbortController;
      shaka.net.HttpFetchPlugin['ReadableStream_'] = window.ReadableStream;
      shaka.net.HttpFetchPlugin['Headers_'] = window.Headers;
    } else {
      shaka.net.HttpXHRPlugin['Xhr_'] = window.XMLHttpRequest;
    }
    jasmine.clock().uninstall();
    PromiseMock.uninstall();
  });

  it('sets the correct fields', function(done) {
    let request = shaka.net.NetworkingEngine.makeRequest(
        ['https://foo.bar/'], retryParameters);
    request.allowCrossSiteCredentials = true;
    request.method = 'POST';
    request.headers['BAZ'] = '123';

    plugin(request.uris[0], request, requestType, progressUpdated).promise
        .then(() => {
          const actual = mostRecentRequest();
          expect(actual).toBeTruthy();
          expect(actual.url).toBe(request.uris[0]);
          expect(actual.method).toBe(request.method);
          expect(actual.withCredentials).toBe(true);
          // Headers are normalized into lowercase, so 'BAZ' becomes 'baz'.
          expect(actual.requestHeaders['baz']).toBe('123');
        })
        .catch(fail)
        .then(done);
    PromiseMock.flush();
  });

  if (usingFetch) {
    // Regression test for an issue with Edge, where Fetch fails if the body
    // is set to null but succeeds on undefined.
    it('sets a request\'s null body to undefined', function(done) {
      let request = shaka.net.NetworkingEngine.makeRequest(
          ['https://foo.bar/'], retryParameters);
      request.body = null;
      request.method = 'GET';

      plugin(request.uris[0], request, requestType, progressUpdated).promise
          .then(() => {
            const actual = jasmine.Fetch.requests.mostRecent();
            expect(actual).toBeTruthy();
            expect(actual.body).toBeUndefined();
          })
          .catch(fail)
          .then(done);
      PromiseMock.flush();
    });
  }

  it('fails with 202 status', function(done) {
    testFails('https://foo.bar/202', done);
    PromiseMock.flush();
  });

  it('succeeds with 204 status', function(done) {
    testSucceeds('https://foo.bar/204', done);
    PromiseMock.flush();
  });

  it('succeeds with empty line in response', function(done) {
    testSucceedsWithEmptyLine('https://foo.bar/withemptyline', done);
    PromiseMock.flush();
  });

  it('gets redirect URLs with 302 status', function(done) {
    testSucceeds('https://foo.bar/302', done,
                 'https://foo.bar/after/302');
    PromiseMock.flush();
  });

  it('fails with CRITICAL for 401 status', function(done) {
    testFails('https://foo.bar/401', done, shaka.util.Error.Severity.CRITICAL);
    PromiseMock.flush();
  });

  it('fails with CRITICAL for 403 status', function(done) {
    testFails('https://foo.bar/403', done, shaka.util.Error.Severity.CRITICAL);
    PromiseMock.flush();
  });

  it('fails if non-2xx status', function(done) {
    const uri = 'https://foo.bar/404';
    testFails(uri, done, undefined, shaka.util.Error.Code.BAD_HTTP_STATUS,
        [uri, 404, 'ABC', {'foo': 'BAR'}, requestType]);
    PromiseMock.flush();
  });

  it('fails on timeout', function(done) {
    const uri = 'https://foo.bar/timeout';
    testFails(uri, done, shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Code.TIMEOUT, [uri, requestType]);

    // When using fetch, timeout is handled manually by the plugin, instead of
    // being done by the mocking framework, so we need to actually wait.
    if (usingFetch) {
      jasmine.clock().tick(5000);
    }
    PromiseMock.flush();
  });

  it('fails on error', function(done) {
    const uri = 'https://foo.bar/error';
    testFails(uri, done, shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Code.HTTP_ERROR,
        [uri, jasmine.any(Object), requestType]);
    PromiseMock.flush();
  });

  it('detects cache headers', function(done) {
    let request = shaka.net.NetworkingEngine.makeRequest(
        ['https://foo.bar/cache'], retryParameters);
    plugin(request.uris[0], request, requestType, progressUpdated).promise
        .catch(fail)
        .then(function(response) {
          expect(response).toBeTruthy();
          expect(response.fromCache).toBe(true);
        })
        .then(done);
    PromiseMock.flush();
  });

  it('aborts the request when the operation is aborted', function(done) {
    let abortPromise;
    let requestPromise;
    let oldXHRMock = shaka.net.HttpXHRPlugin['Xhr_'];
    if (usingFetch) {
      let request = shaka.net.NetworkingEngine.makeRequest(
          ['https://foo.bar/timeout'], retryParameters);
      const operation = plugin(
          request.uris[0], request, requestType, progressUpdated);

      /** @type {jasmine.Fetch.RequestStub} */
      let actual = jasmine.Fetch.requests.mostRecent();

      requestPromise = operation.promise;

      expect(actual.aborted).toBe(false);
      abortPromise = operation.abort();
      jasmine.clock().tick(400);
      PromiseMock.flush();
      expect(actual.aborted).toBe(true);
    } else {
      /** @type {shaka.extern.IAbortableOperation.<shaka.extern.Response>} */
      let operation;

      // Jasmine-ajax stubbed requests are purely synchronous, so we can't
      // actually insert a call to abort in the middle.
      // Instead, install a very elementary mock.
      /** @constructor */
      let NewXHRMock = function() {
        this.abort = shaka.test.Util.spyFunc(jasmine.createSpy('abort'));

        this.open = shaka.test.Util.spyFunc(jasmine.createSpy('open'));

        /** @type {function()} */
        this.onabort;

        this.send = function() {
          // Delay the effects of send until after operation is defined.
          Promise.resolve().then(function() {
            expect(this.abort).not.toHaveBeenCalled();
            operation.abort();
            expect(this.abort).toHaveBeenCalled();
            this.onabort();
          }.bind(this));
        };
      };
      shaka.net.HttpXHRPlugin['Xhr_'] = NewXHRMock;

      let request = shaka.net.NetworkingEngine.makeRequest(
          ['https://foo.bar/'], retryParameters);
      operation = plugin(
          request.uris[0], request, requestType, progressUpdated);
      requestPromise = operation.promise;
    }

    requestPromise = requestPromise.then(fail).catch((error) => {
      expect(error.code).toBe(shaka.util.Error.Code.OPERATION_ABORTED);
    });

    Promise.all([abortPromise, requestPromise]).catch(fail).then(done);
    PromiseMock.flush();
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
   * @param {function()} done
   * @param {string=} overrideUri
   */
  function testSucceeds(uri, done, overrideUri) {
    let request = shaka.net.NetworkingEngine.makeRequest(
        [uri], retryParameters);
    plugin(uri, request, requestType, progressUpdated).promise
        .catch(fail)
        .then(function(response) {
          expect(mostRecentRequest().url).toBe(uri);
          expect(response).toBeTruthy();
          expect(response.uri).toBe(overrideUri || uri);
          expect(response.data).toBeTruthy();
          expect(response.data.byteLength).toBe(10);
          expect(response.fromCache).toBe(false);
          expect(response.headers).toBeTruthy();
          // Returned header names are in lowercase.
          expect(response.headers['foo']).toBe('BAR');
        })
        .then(done);
  }

  /**
   * @param {string} uri
   * @param {function()} done
   * @param {shaka.util.Error.Severity=} severity
   * @param {shaka.util.Error.Code=} code
   * @param {Array<*>=} errorData
   */
  function testFails(uri, done, severity, code, errorData) {
    let request = shaka.net.NetworkingEngine.makeRequest(
        [uri], retryParameters);
    plugin(uri, request, requestType, progressUpdated).promise
        .then(fail)
        .catch(function(error) {
          expect(error).toBeTruthy();
          expect(error.severity)
              .toBe(severity || shaka.util.Error.Severity.RECOVERABLE);
          if (code) {
            expect(error.code).toBe(code);
          }
          expect(error.category).toBe(shaka.util.Error.Category.NETWORK);
          if (errorData) {
            expect(error.data).toEqual(errorData);
          }

          expect(mostRecentRequest().url).toBe(uri);
        })
        .then(done);
  }

  /**
   * Since IE/Edge incorrectly return the header with a leading new line
   * character ('\n'), we need to trim the response header.
   * @param {string} uri
   * @param {function()} done
   * @param {string=} overrideUri
   */
  function testSucceedsWithEmptyLine(uri, done, overrideUri) {
    let request = shaka.net.NetworkingEngine.makeRequest(
        [uri], retryParameters);
    plugin(uri, request, requestType, progressUpdated).promise
        .catch(fail)
        .then(function(response) {
          expect(mostRecentRequest().url).toBe(uri);
          expect(response).toBeTruthy();
          expect(response.uri).toBe(overrideUri || uri);
          expect(response.data).toBeTruthy();
          expect(response.fromCache).toBe(false);
          expect(response.headers).toBeTruthy();
          // Returned header names do not contain empty lines.
          expect(response.headers['foo']).toBe('BAR');
        })
        .then(done);
  }

  /**
   * @return {jasmine.Ajax.RequestStub}
   */
  function mostRecentRequest() {
    if (usingFetch) {
      let mostRecent = jasmine.Fetch.requests.mostRecent();
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

describe('HttpXHRPlugin', httpPluginTests.bind(null, false));
describe('HttpFetchPlugin', httpPluginTests.bind(null, true));

