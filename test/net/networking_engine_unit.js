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

describe('NetworkingEngine', /** @suppress {accessControls} */ function() {
  const StatusPromise = shaka.test.StatusPromise;
  const Util = shaka.test.Util;
  const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
  const originalGetLocationProtocol =
      shaka.net.NetworkingEngine.getLocationProtocol_;

  /** @type {string} */
  let fakeProtocol;
  /** @type {!shaka.net.NetworkingEngine} */
  let networkingEngine;
  /** @type {!jasmine.Spy} */
  let resolveScheme;
  /** @type {!jasmine.Spy} */
  let rejectScheme;
  /** @type {!shaka.util.Error} */
  let error;

  beforeAll(function() {
    shaka.net.NetworkingEngine.getLocationProtocol_ = function() {
      return fakeProtocol;
    };
  });

  function makeResolveScheme(spyName) {
    return jasmine.createSpy(spyName).and.callFake(function() {
      return shaka.util.AbortableOperation.completed({
        uri: '', data: new ArrayBuffer(5), headers: {},
      });
    });
  }

  beforeEach(function() {
    fakeProtocol = 'http:';
    error = new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.HTTP_ERROR);

    networkingEngine = new shaka.net.NetworkingEngine();
    resolveScheme = makeResolveScheme('resolve scheme');
    rejectScheme = jasmine.createSpy('reject scheme').and.callFake(() =>
        shaka.util.AbortableOperation.failed(error));
    shaka.net.NetworkingEngine.registerScheme(
        'resolve', Util.spyFunc(resolveScheme),
        shaka.net.NetworkingEngine.PluginPriority.FALLBACK);
    shaka.net.NetworkingEngine.registerScheme(
        'reject', Util.spyFunc(rejectScheme),
        shaka.net.NetworkingEngine.PluginPriority.FALLBACK);
  });

  afterEach(function() {
    shaka.net.NetworkingEngine.unregisterScheme('resolve');
    shaka.net.NetworkingEngine.unregisterScheme('reject');
  });

  afterAll(function() {
    shaka.net.NetworkingEngine.getLocationProtocol_ =
        originalGetLocationProtocol;
  });

  describe('retry', function() {
    it('will retry', function(done) {
      let request = createRequest('reject://foo', {
        maxAttempts: 2,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      rejectScheme.and.callFake(function() {
        if (rejectScheme.calls.count() == 1) {
          return shaka.util.AbortableOperation.failed(error);
        } else {
          return shaka.util.AbortableOperation.completed({
            uri: '', data: new ArrayBuffer(0), headers: {}
          });
        }
      });
      networkingEngine.request(requestType, request).promise
          .catch(fail)
          .then(function() {
            expect(rejectScheme.calls.count()).toBe(2);
            done();
          });
    });

    it('will retry twice', function(done) {
      let request = createRequest('reject://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      rejectScheme.and.callFake(function() {
        if (rejectScheme.calls.count() < 3) {
          return shaka.util.AbortableOperation.failed(error);
        } else {
          return shaka.util.AbortableOperation.completed({
            uri: '', data: new ArrayBuffer(0), headers: {}
          });
        }
      });
      networkingEngine.request(requestType, request).promise
          .catch(fail)
          .then(function() {
            expect(rejectScheme.calls.count()).toBe(3);
            done();
          });
    });

    it('will fail overall', function(done) {
      let request = createRequest('reject://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      networkingEngine.request(requestType, request).promise
          .then(fail)
          .catch(function(error) {
            // It is expected to fail with the most recent error.
            expect(error).toEqual(jasmine.any(shaka.util.Error));
            expect(rejectScheme.calls.count()).toBe(3);
          }).then(done);
    });

    describe('backoff', function() {
      const baseDelay = 200;
      const origSetTimeout = shaka.net.Backoff.setTimeout_;
      const realRandom = Math.random;

      /** @type {!jasmine.Spy} */
      let setTimeoutSpy;

      beforeAll(function() {
        setTimeoutSpy = jasmine.createSpy('setTimeout');
        setTimeoutSpy.and.callFake(origSetTimeout);
        shaka.net.Backoff.setTimeout_ = Util.spyFunc(setTimeoutSpy);
        Math.random = function() { return 0.75; };
      });

      afterAll(function() {
        Math.random = realRandom;
        shaka.net.Backoff.setTimeout_ = origSetTimeout;
      });

      beforeEach(function() {
        setTimeoutSpy.calls.reset();
      });

      it('uses baseDelay', function(done) {
        let request = createRequest('reject://foo', {
          maxAttempts: 2,
          baseDelay: baseDelay,
          fuzzFactor: 0,
          backoffFactor: 2,
          timeout: 0
        });
        networkingEngine.request(requestType, request).promise
            .then(fail)
            .catch(function() {
              expect(setTimeoutSpy.calls.count()).toBe(1);
              expect(setTimeoutSpy)
                  .toHaveBeenCalledWith(jasmine.any(Function), baseDelay);
            })
            .then(done);
      });

      it('uses backoffFactor', function(done) {
        let request = createRequest('reject://foo', {
          maxAttempts: 3,
          baseDelay: baseDelay,
          fuzzFactor: 0,
          backoffFactor: 2,
          timeout: 0
        });
        networkingEngine.request(requestType, request).promise
            .then(fail)
            .catch(function() {
              expect(setTimeoutSpy.calls.count()).toBe(2);
              expect(setTimeoutSpy)
                  .toHaveBeenCalledWith(jasmine.any(Function), baseDelay);
              expect(setTimeoutSpy)
                  .toHaveBeenCalledWith(jasmine.any(Function), baseDelay * 2);
            })
            .then(done);
      });

      it('uses fuzzFactor', function(done) {
        let request = createRequest('reject://foo', {
          maxAttempts: 2,
          baseDelay: baseDelay,
          fuzzFactor: 1,
          backoffFactor: 1,
          timeout: 0
        });
        networkingEngine.request(requestType, request).promise
            .then(fail)
            .catch(function() {
              // (rand * 2.0) - 1.0 = (0.75 * 2.0) - 1.0 = 0.5
              // 0.5 * fuzzFactor = 0.5 * 1 = 0.5
              // delay * (1 + 0.5) = baseDelay * (1 + 0.5)
              expect(setTimeoutSpy.calls.count()).toBe(1);
              expect(setTimeoutSpy)
                  .toHaveBeenCalledWith(jasmine.any(Function), baseDelay * 1.5);
            })
            .then(done);
      });
    });  // describe('backoff')

    it('uses multiple URIs', function(done) {
      let request = createRequest('', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      request.uris = ['reject://foo', 'resolve://foo'];
      networkingEngine.request(requestType, request).promise
          .catch(fail)
          .then(function() {
            expect(rejectScheme.calls.count()).toBe(1);
            expect(resolveScheme.calls.count()).toBe(1);
            done();
          });
    });

    it('won\'t retry for CRITICAL error', function(done) {
      let request = createRequest('reject://foo', {
        maxAttempts: 5,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });

      error.severity = shaka.util.Error.Severity.CRITICAL;
      networkingEngine.request(requestType, request).promise
          .then(fail)
          .catch(function() {
            expect(rejectScheme.calls.count()).toBe(1);
            done();
          });
    });
  });  // describe('retry')

  describe('request', function() {
    function testResolve(schemeSpy) {
      return networkingEngine.request(
          requestType, createRequest('resolve://foo')).promise
          .catch(fail)
          .then(function() {
            expect(schemeSpy).toHaveBeenCalled();
          });
    }

    it('uses registered schemes', function(done) {
      testResolve(resolveScheme).then(done);
    });

    it('uses registered scheme plugins in order of priority', function(done) {
      let applicationResolveScheme =
          makeResolveScheme('application resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(applicationResolveScheme),
          shaka.net.NetworkingEngine.PluginPriority.APPLICATION);
      let preferredResolveScheme =
          makeResolveScheme('preferred resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(preferredResolveScheme),
          shaka.net.NetworkingEngine.PluginPriority.PREFERRED);

      testResolve(applicationResolveScheme).then(done);
    });

    it('uses newest scheme plugin in case of tie in priority', function(done) {
      let secondResolveScheme = makeResolveScheme('second resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(secondResolveScheme),
          shaka.net.NetworkingEngine.PluginPriority.FALLBACK);

      testResolve(secondResolveScheme).then(done);
    });

    it('defaults new scheme plugins to application priority', function(done) {
      let secondResolveScheme = makeResolveScheme('second resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(secondResolveScheme));
      let preferredResolveScheme =
          makeResolveScheme('preferred resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(preferredResolveScheme),
          shaka.net.NetworkingEngine.PluginPriority.PREFERRED);

      testResolve(secondResolveScheme).then(done);
    });

    it('can unregister scheme', function(done) {
      shaka.net.NetworkingEngine.unregisterScheme('resolve');
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .then(fail)
          .catch(function() { expect(resolveScheme).not.toHaveBeenCalled(); })
          .then(done);
    });

    it('unregister removes all plugins for scheme at once', function(done) {
      let preferredResolveScheme =
          makeResolveScheme('preferred resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(preferredResolveScheme),
          shaka.net.NetworkingEngine.PluginPriority.PREFERRED);

      shaka.net.NetworkingEngine.unregisterScheme('resolve');
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .then(fail)
          .catch(function() {
            expect(resolveScheme).not.toHaveBeenCalled();
            expect(preferredResolveScheme).not.toHaveBeenCalled();
          }).then(done);
    });

    it('rejects if scheme does not exist', function(done) {
      networkingEngine.request(requestType, createRequest('foo://foo'))
          .promise
          .then(fail)
          .catch(function() { expect(resolveScheme).not.toHaveBeenCalled(); })
          .then(done);
    });

    it('returns the response object', function(done) {
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .catch(fail)
          .then(function(response) {
            expect(response).toBeTruthy();
            expect(response.data).toBeTruthy();
            expect(response.data.byteLength).toBe(5);
            expect(response.headers).toBeTruthy();
            done();
          });
    });

    it('passes correct arguments to plugin', function(done) {
      let request = createRequest('resolve://foo');
      request.method = 'POST';

      resolveScheme.and.callFake(
          function(uri, requestPassed, requestTypePassed) {
            expect(uri).toBe(request.uris[0]);
            expect(requestPassed).toEqual(request);
            expect(requestTypePassed).toEqual(requestType);
            return shaka.util.AbortableOperation.completed({});
          });
      networkingEngine.request(requestType, request)
          .promise.catch(fail).then(done);
    });

    it('infers a scheme for // URIs', function(done) {
      fakeProtocol = 'resolve:';
      networkingEngine.request(requestType, createRequest('//foo')).promise
          .catch(fail)
          .then(function() {
            expect(resolveScheme).toHaveBeenCalled();
            expect(resolveScheme.calls.argsFor(0)[0]).toBe('resolve://foo');
            done();
          });
    });

    it('fills in defaults for partial request objects', function(done) {
      let originalRequest = /** @type {shakaExtern.Request} */ ({
        uris: ['resolve://foo']
      });

      resolveScheme.and.callFake(function(uri, request, requestTypePassed) {
        // NetworkingEngine should have filled in these values:
        expect(request.method).toBeTruthy();
        expect(request.headers).toBeTruthy();
        expect(request.retryParameters).toBeTruthy();

        return shaka.util.AbortableOperation.completed({});
      });
      networkingEngine.request(requestType, originalRequest).promise
          .catch(fail).then(done);
    });
  });  // describe('request')

  describe('request filter', function() {
    /** @type {!jasmine.Spy} */
    let filter;

    beforeEach(function() {
      filter = jasmine.createSpy('request filter');
      networkingEngine.registerRequestFilter(Util.spyFunc(filter));
    });

    afterEach(function() {
      networkingEngine.unregisterRequestFilter(Util.spyFunc(filter));
    });

    it('can be called', function(done) {
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .catch(fail)
          .then(function() {
            expect(filter).toHaveBeenCalled();
            done();
          });
    });

    it('called on failure', function(done) {
      networkingEngine.request(requestType, createRequest('reject://foo'))
          .promise
          .then(fail)
          .catch(function() { expect(filter).toHaveBeenCalled(); })
          .then(done);
    });

    it('is given correct arguments', function(done) {
      let request = createRequest('resolve://foo');
      networkingEngine.request(requestType, request).promise
          .catch(fail)
          .then(function() {
            expect(filter.calls.argsFor(0)[0]).toBe(requestType);
            expect(filter.calls.argsFor(0)[1]).toBe(request);
            expect(filter.calls.argsFor(0)[1].uris[0]).toBe(request.uris[0]);
            done();
          });
    });

    it('waits for asynchronous filters', function(done) {
      let responseFilter = jasmine.createSpy('response filter');
      networkingEngine.registerResponseFilter(Util.spyFunc(responseFilter));

      let p = new shaka.util.PublicPromise();
      let p2 = new shaka.util.PublicPromise();
      filter.and.returnValue(p);
      responseFilter.and.returnValue(p2);
      let request = createRequest('resolve://foo');
      let r = new StatusPromise(
          networkingEngine.request(requestType, request).promise);

      Util.delay(0.1).then(function() {
        expect(filter).toHaveBeenCalled();
        expect(resolveScheme).not.toHaveBeenCalled();
        expect(responseFilter).not.toHaveBeenCalled();
        expect(r.status).toBe('pending');
        p.resolve();

        return Util.delay(0.1);
      }).then(function() {
        expect(resolveScheme).toHaveBeenCalled();
        expect(responseFilter).toHaveBeenCalled();
        expect(r.status).toBe('pending');
        p2.resolve();

        return Util.delay(0.1);
      }).then(function() {
        expect(r.status).toBe('resolved');
        done();
      }).catch(fail);
    });

    it('turns errors into shaka errors', function(done) {
      let fakeError = 'fake error';
      filter.and.callFake(function() {
        throw fakeError;
      });
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .then(fail)
          .catch(function(e) {
            expect(e.severity).toBe(shaka.util.Error.Severity.CRITICAL);
            expect(e.code).toBe(shaka.util.Error.Code.REQUEST_FILTER_ERROR);
            expect(e.data).toEqual([fakeError]);
            done();
          });
    });

    it('can modify uris', function(done) {
      filter.and.callFake(function(type, request) {
        request.uris = ['resolve://foo'];
      });
      networkingEngine.request(requestType, createRequest('reject://foo'))
          .promise
          .catch(fail)
          .then(function() {
            expect(filter).toHaveBeenCalled();
            done();
          });
    });

    it('applies request filters sequentially', function(done) {
      let secondFilter = jasmine.createSpy('second request filter');
      networkingEngine.registerRequestFilter(Util.spyFunc(secondFilter));

      let order = 0;
      filter.and.callFake(function() {
        expect(order).toBe(0);
        order += 1;
      });
      secondFilter.and.callFake(function() {
        expect(order).toBe(1);
        order += 1;
      });

      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .catch(fail)
          .then(done);
    });

    it('can modify requests asynchronously', function(done) {
      let p = new shaka.util.PublicPromise();
      filter.and.callFake(function(type, request) {
        return p.then(function() {
          request.uris = ['resolve://foo'];
          request.allowCrossSiteCredentials = true;
        });
      });
      networkingEngine.request(requestType, createRequest('reject://foo'))
          .promise
          .catch(fail)
          .then(function() {
            expect(resolveScheme).toHaveBeenCalled();
            expect(resolveScheme.calls.argsFor(0)[1].allowCrossSiteCredentials)
                .toBe(true);
            done();
          });

      Util.delay(0.1).then(function() {
        expect(filter).toHaveBeenCalled();
        expect(resolveScheme).not.toHaveBeenCalled();

        p.resolve();
      });
    });

    it('can modify allowCrossSiteCredentials', function(done) {
      filter.and.callFake(function(type, request) {
        request.allowCrossSiteCredentials = true;
      });
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .catch(fail)
          .then(function() {
            expect(filter).toHaveBeenCalled();
            expect(resolveScheme).toHaveBeenCalled();
            expect(resolveScheme.calls.argsFor(0)[1].allowCrossSiteCredentials)
                .toBe(true);
            done();
          });
    });

    it('if rejects will stop requests', function(done) {
      let request = createRequest('resolve://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      filter.and.returnValue(Promise.reject());
      networkingEngine.request(requestType, request).promise
          .then(fail)
          .catch(function() {
            expect(resolveScheme).not.toHaveBeenCalled();
            expect(filter.calls.count()).toBe(1);
          })
          .then(done);
    });

    it('if throws will stop requests', function(done) {
      let request = createRequest('resolve://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      filter.and.throwError(error);
      networkingEngine.request(requestType, request).promise
          .then(fail)
          .catch(function() {
            expect(resolveScheme).not.toHaveBeenCalled();
            expect(filter.calls.count()).toBe(1);
          })
          .then(done);
    });

    it('causes no errors to remove an unused filter', function() {
      let unusedFilter = jasmine.createSpy('unused filter');
      networkingEngine.unregisterRequestFilter(Util.spyFunc(unusedFilter));
    });
  });  // describe('request filter')

  describe('response filter', function() {
    /** @type {!jasmine.Spy} */
    let filter;

    beforeEach(function() {
      filter = jasmine.createSpy('response filter');
      networkingEngine.registerResponseFilter(Util.spyFunc(filter));
      resolveScheme.and.callFake(function(request) {
        let response = {
          uri: '', data: new ArrayBuffer(100), headers: {}
        };
        return shaka.util.AbortableOperation.completed(response);
      });
    });

    afterEach(function() {
      networkingEngine.unregisterResponseFilter(Util.spyFunc(filter));
    });

    it('can be called', function(done) {
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .catch(fail)
          .then(function() {
            expect(filter).toHaveBeenCalled();
            done();
          });
    });

    it('not called on failure', function(done) {
      networkingEngine.request(requestType, createRequest('reject://foo'))
          .promise
          .then(fail)
          .catch(function() { expect(filter).not.toHaveBeenCalled(); })
          .then(done);
    });

    it('is given correct arguments', function(done) {
      let request = createRequest('resolve://foo');
      networkingEngine.request(requestType, request)
          .promise
          .catch(fail)
          .then(function() {
            expect(filter.calls.argsFor(0)[0]).toBe(requestType);
            expect(filter.calls.argsFor(0)[1]).toBeTruthy();
            expect(filter.calls.argsFor(0)[1].data).toBeTruthy();
            expect(filter.calls.argsFor(0)[1].headers).toBeTruthy();
            done();
          });
    });

    it('can modify data', function(done) {
      filter.and.callFake(function(type, response) {
        response.data = new ArrayBuffer(5);
      });
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .catch(fail)
          .then(function(response) {
            expect(filter).toHaveBeenCalled();
            expect(response).toBeTruthy();
            expect(response.data.byteLength).toBe(5);
            done();
          });
    });

    it('can modify headers', function(done) {
      filter.and.callFake(function(type, response) {
        expect(response.headers).toBeTruthy();
        response.headers['DATE'] = 'CAT';
      });
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .catch(fail)
          .then(function(response) {
            expect(filter).toHaveBeenCalled();
            expect(response).toBeTruthy();
            expect(response.headers['DATE']).toBe('CAT');
            done();
          });
    });

    it('applies response filters sequentially', function(done) {
      let secondFilter = jasmine.createSpy('second response filter');
      networkingEngine.registerResponseFilter(Util.spyFunc(secondFilter));

      let order = 0;
      filter.and.callFake(function() {
        expect(order).toBe(0);
        order += 1;
      });
      secondFilter.and.callFake(function() {
        expect(order).toBe(1);
        order += 1;
      });

      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .catch(fail)
          .then(done);
    });

    it('turns errors into shaka errors', function(done) {
      let fakeError = 'fake error';
      filter.and.callFake(function() {
        throw fakeError;
      });
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .then(fail)
          .catch(function(e) {
            expect(e.code).toBe(shaka.util.Error.Code.RESPONSE_FILTER_ERROR);
            expect(e.data).toEqual([fakeError]);
            done();
          });
    });

    it('can modify responses asynchronously', function(done) {
      let p = new shaka.util.PublicPromise();
      filter.and.callFake(function(type, response) {
        return p.then(function() {
          expect(response.headers).toBeTruthy();
          response.headers['DATE'] = 'CAT';
          response.data = new ArrayBuffer(5);
        });
      });

      let request = createRequest('resolve://foo');
      let r = new StatusPromise(networkingEngine.request(requestType, request)
          .promise
          .catch(fail)
          .then(function(response) {
            expect(response).toBeTruthy();
            expect(response.headers['DATE']).toBe('CAT');
            expect(response.data.byteLength).toBe(5);
            done();
          }));

      Util.delay(0.1).then(function() {
        expect(filter).toHaveBeenCalled();
        expect(r.status).toBe('pending');

        p.resolve();
      });
    });

    it('if throws will stop requests', function(done) {
      filter.and.callFake(function() { throw error; });
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .promise
          .then(fail)
          .catch(function() { expect(filter).toHaveBeenCalled(); })
          .then(done);
    });

    it('causes no errors to remove an unused filter', function() {
      let unusedFilter = jasmine.createSpy('unused filter');
      networkingEngine.unregisterResponseFilter(Util.spyFunc(unusedFilter));
    });
  });  // describe('response filter')

  describe('destroy', function() {
    it('waits for all operations to complete', function(done) {
      let request = createRequest('resolve://foo');
      let p = new shaka.util.PublicPromise();
      resolveScheme.and.returnValue(
          shaka.util.AbortableOperation.notAbortable(p));

      let r1 = new StatusPromise(
          networkingEngine.request(requestType, request).promise);
      let r2 = new StatusPromise(
          networkingEngine.request(requestType, request).promise);

      expect(r1.status).toBe('pending');
      expect(r2.status).toBe('pending');

      /** @type {!shaka.test.StatusPromise} */
      let d;
      Util.delay(0.1).then(function() {
        d = new StatusPromise(networkingEngine.destroy());
        expect(d.status).toBe('pending');
        expect(r1.status).toBe('pending');
        expect(r2.status).toBe('pending');
        return Util.delay(0.1);
      }).then(function() {
        expect(d.status).toBe('pending');
        p.resolve({});
        return d;
      }).then(function() {
        return Util.delay(0.1);
      }).then(function() {
        expect(r1.status).not.toBe('pending');
        expect(r2.status).not.toBe('pending');
        expect(d.status).toBe('resolved');
      }).catch(fail).then(done);
    });

    it('causes requests to reject if called while filtering', function(done) {
      let filter = jasmine.createSpy('request filter');
      networkingEngine.registerRequestFilter(Util.spyFunc(filter));
      let p = new shaka.util.PublicPromise();
      filter.and.returnValue(p);

      let request = createRequest('resolve://foo', {
        maxAttempts: 1,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      let r = new StatusPromise(
          networkingEngine.request(requestType, request).promise);

      /** @type {!shaka.test.StatusPromise} */
      let d;
      Util.delay(0.1).then(function() {
        expect(filter).toHaveBeenCalled();
        expect(r.status).toBe('pending');

        d = new StatusPromise(networkingEngine.destroy());
        p.resolve();

        return Util.delay(0.1);
      }).then(function() {
        expect(d.status).toBe('resolved');
        expect(r.status).toBe('rejected');
        expect(resolveScheme).not.toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('resolves even when a request fails', function(done) {
      let request = createRequest('reject://foo');
      let p = new shaka.util.PublicPromise();
      rejectScheme.and.returnValue(
          shaka.util.AbortableOperation.notAbortable(p));

      let r1 = new StatusPromise(
          networkingEngine.request(requestType, request).promise);
      let r2 = new StatusPromise(
          networkingEngine.request(requestType, request).promise);

      expect(r1.status).toBe('pending');
      expect(r2.status).toBe('pending');

      /** @type {!shaka.test.StatusPromise} */
      let d;
      Util.delay(0.1).then(function() {
        d = new StatusPromise(networkingEngine.destroy());
        expect(d.status).toBe('pending');

        return Util.delay(0.1);
      }).then(function() {
        expect(d.status).toBe('pending');
        p.reject(error);
        return d;
      }).then(function() {
        return Util.delay(0.1);
      }).then(function() {
        expect(r1.status).toBe('rejected');
        expect(r2.status).toBe('rejected');
        expect(d.status).toBe('resolved');
      }).catch(fail).then(done);
    });

    it('prevents new requests', function(done) {
      let request = createRequest('resolve://foo');

      let d = new StatusPromise(networkingEngine.destroy());
      expect(d.status).toBe('pending');

      let r = new StatusPromise(
          networkingEngine.request(requestType, request).promise);

      Util.delay(0.1).then(() => {
        // A new request has not been made.
        expect(resolveScheme.calls.count()).toBe(0);

        expect(d.status).toBe('resolved');
        expect(r.status).toBe('rejected');
        done();
      });
    });

    it('does not allow further retries', function(done) {
      let request = createRequest('reject://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });

      let p1 = new shaka.util.PublicPromise();
      let p2 = new shaka.util.PublicPromise();
      rejectScheme.and.callFake(function() {
        // Return p1 the first time, then p2 the second time.
        return (rejectScheme.calls.count() == 1) ?
            shaka.util.AbortableOperation.notAbortable(p1) :
            shaka.util.AbortableOperation.notAbortable(p2);
      });

      let r = new StatusPromise(
          networkingEngine.request(requestType, request).promise);
      /** @type {shaka.test.StatusPromise} */
      let d;
      Util.delay(0.1).then(function() {
        expect(rejectScheme.calls.count()).toBe(1);

        d = new StatusPromise(networkingEngine.destroy());
        expect(d.status).toBe('pending');

        return Util.delay(0.1);
      }).then(function() {
        expect(d.status).toBe('pending');
        expect(rejectScheme.calls.count()).toBe(1);
        // Reject the initial request.
        p1.reject(error);
        // Resolve any retry, but since we have already been destroyed, this
        // promise should not be used.
        p2.resolve();
        return d;
      }).then(function() {
        return Util.delay(0.1);
      }).then(function() {
        expect(d.status).toBe('resolved');
        // The request was never retried.
        expect(r.status).toBe('rejected');
        expect(rejectScheme.calls.count()).toBe(1);
      }).catch(fail).then(done);
    });
  });  // describe('destroy')

  it('ignores cache hits', function(done) {
    let onSegmentDownloaded = jasmine.createSpy('onSegmentDownloaded');
    networkingEngine =
        new shaka.net.NetworkingEngine(Util.spyFunc(onSegmentDownloaded));

    networkingEngine.request(requestType, createRequest('resolve://foo'))
        .promise
        .then(function() {
          expect(onSegmentDownloaded).toHaveBeenCalled();
          onSegmentDownloaded.calls.reset();

          resolveScheme.and.callFake(function() {
            return shaka.util.AbortableOperation.completed({
              uri: '',
              data: new ArrayBuffer(5),
              headers: {},
              fromCache: true
            });
          });
          return networkingEngine.request(
              requestType, createRequest('resolve://foo'));
        })
        .then(function() {
          expect(onSegmentDownloaded).not.toHaveBeenCalled();
        })
        .catch(fail)
        .then(done);
  });

  describe('abort', function() {
    /** @type {!shaka.util.Error} */
    let abortError;

    beforeEach(function() {
      abortError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
    });

    it('interrupts request filters', function(done) {
      let filter1Promise = new shaka.util.PublicPromise();
      let filter1Spy = jasmine.createSpy('filter 1')
          .and.returnValue(filter1Promise);
      let filter1 = Util.spyFunc(filter1Spy);
      networkingEngine.registerRequestFilter(filter1);

      let filter2Promise = new shaka.util.PublicPromise();
      let filter2Spy = jasmine.createSpy('filter 2')
          .and.returnValue(filter2Promise);
      let filter2 = Util.spyFunc(filter2Spy);
      networkingEngine.registerRequestFilter(filter2);

      let request = createRequest('resolve://foo');
      let operation = networkingEngine.request(requestType, request);
      let r = new StatusPromise(operation.promise);

      Util.delay(0.1).then(() => {
        // The first filter has been called, but not the second, and not the
        // scheme plugin.
        expect(filter1Spy).toHaveBeenCalled();
        expect(filter2Spy).not.toHaveBeenCalled();
        expect(resolveScheme).not.toHaveBeenCalled();

        // The operation is still pending.
        expect(r.status).toBe('pending');

        operation.abort();

        filter1Promise.resolve();
        return Util.delay(0.1);
      }).then(() => {
        // The second filter has not been called, nor has the scheme plugin.
        // The filter chain was interrupted by abort().
        expect(filter2Spy).not.toHaveBeenCalled();
        expect(resolveScheme).not.toHaveBeenCalled();

        // The operation has been aborted.
        expect(r.status).toBe('rejected');
        return operation.promise.catch((e) => {
          Util.expectToEqualError(e, abortError);
        });
      }).catch(fail).then(done);
    });

    it('interrupts scheme plugins', function(done) {
      let p = new shaka.util.PublicPromise();
      let abortSpy = jasmine.createSpy('abort');
      let abort = Util.spyFunc(abortSpy);

      resolveScheme.and.returnValue(
          new shaka.util.AbortableOperation(p, abort));
      expect(resolveScheme).not.toHaveBeenCalled();

      let request = createRequest('resolve://foo');
      let operation = networkingEngine.request(requestType, request);
      let r = new StatusPromise(operation.promise);

      Util.delay(0.1).then(() => {
        // A request has been made, but not completed yet.
        expect(resolveScheme).toHaveBeenCalled();
        expect(r.status).toBe('pending');

        expect(abortSpy).not.toHaveBeenCalled();
        return operation.abort();
      }).then(() => {
        expect(abortSpy).toHaveBeenCalled();
        p.resolve();

        // The operation has been aborted.
        expect(r.status).toBe('rejected');
        return operation.promise.catch((e) => {
          Util.expectToEqualError(e, abortError);
        });
      }).catch(fail).then(done);
    });

    it('interrupts response filters', function(done) {
      let filter1Promise = new shaka.util.PublicPromise();
      let filter1Spy = jasmine.createSpy('filter 1')
          .and.returnValue(filter1Promise);
      let filter1 = Util.spyFunc(filter1Spy);
      networkingEngine.registerResponseFilter(filter1);

      let filter2Promise = new shaka.util.PublicPromise();
      let filter2Spy = jasmine.createSpy('filter 2')
          .and.returnValue(filter2Promise);
      let filter2 = Util.spyFunc(filter2Spy);
      networkingEngine.registerResponseFilter(filter2);

      let request = createRequest('resolve://foo');
      let operation = networkingEngine.request(requestType, request);
      let r = new StatusPromise(operation.promise);

      Util.delay(0.1).then(() => {
        // The scheme plugin has been called, and the first filter has been
        // called, but not the second.
        expect(resolveScheme).toHaveBeenCalled();
        expect(filter1Spy).toHaveBeenCalled();
        expect(filter2Spy).not.toHaveBeenCalled();

        // The operation is still pending.
        expect(r.status).toBe('pending');

        operation.abort();

        filter1Promise.resolve();
        return Util.delay(0.1);
      }).then(() => {
        // The second filter has still not been called.
        // The filter chain was interrupted by abort().
        expect(filter2Spy).not.toHaveBeenCalled();

        // The operation has been aborted.
        expect(r.status).toBe('rejected');
        return operation.promise.catch((e) => {
          Util.expectToEqualError(e, abortError);
        });
      }).catch(fail).then(done);
    });

    it('is called by destroy', function(done) {
      let p = new shaka.util.PublicPromise();
      let abortSpy = jasmine.createSpy('abort');
      let abort = Util.spyFunc(abortSpy);

      resolveScheme.and.returnValue(
          new shaka.util.AbortableOperation(p, abort));
      expect(resolveScheme).not.toHaveBeenCalled();

      let request = createRequest('resolve://foo');
      let operation = networkingEngine.request(requestType, request);
      let r = new StatusPromise(operation.promise);

      Util.delay(0.1).then(() => {
        // A request has been made, but not completed yet.
        expect(resolveScheme).toHaveBeenCalled();
        expect(abortSpy).not.toHaveBeenCalled();
        return networkingEngine.destroy();
      }).then(() => {
        expect(abortSpy).toHaveBeenCalled();
        p.resolve();

        // The operation has been aborted.
        expect(r.status).toBe('rejected');
        return operation.promise.catch((e) => {
          Util.expectToEqualError(e, abortError);
        });
      }).catch(fail).then(done);
    });
  });

  /**
   * @param {string} uri
   * @param {shakaExtern.RetryParameters=} opt_retryParameters
   * @return {shakaExtern.Request}
   */
  function createRequest(uri, opt_retryParameters) {
    let retryParameters = opt_retryParameters ||
                          shaka.net.NetworkingEngine.defaultRetryParameters();
    return shaka.net.NetworkingEngine.makeRequest([uri], retryParameters);
  }
});  // describe('NetworkingEngine')
