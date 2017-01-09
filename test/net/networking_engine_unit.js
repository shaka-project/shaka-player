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
  var networkingEngine;
  var resolveScheme;
  var rejectScheme;
  var requestType;
  var Util;
  var originalGetLocationProtocol;
  var fakeProtocol;
  var error;

  beforeAll(function() {
    Util = shaka.test.Util;
    requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    originalGetLocationProtocol =
        shaka.net.NetworkingEngine.getLocationProtocol_;
    shaka.net.NetworkingEngine.getLocationProtocol_ = function() {
      return fakeProtocol;
    };
  });

  beforeEach(function() {
    error = new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.HTTP_ERROR);

    networkingEngine = new shaka.net.NetworkingEngine();
    resolveScheme = jasmine.createSpy('resolve scheme').and.callFake(
        function() {
          return Promise.resolve({
            uri: '', data: new ArrayBuffer(5), headers: {}
          });
        });
    rejectScheme = jasmine.createSpy('reject scheme')
        .and.callFake(function() { return Promise.reject(error); });
    shaka.net.NetworkingEngine.registerScheme('resolve', resolveScheme);
    shaka.net.NetworkingEngine.registerScheme('reject', rejectScheme);
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
      var request = createRequest('reject://foo', {
        maxAttempts: 2,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      rejectScheme.and.callFake(function() {
        if (rejectScheme.calls.count() == 1)
          return Promise.reject(error);
        else
          return Promise.resolve({
            uri: '', data: new ArrayBuffer(0), headers: {}
          });
      });
      networkingEngine.request(requestType, request)
          .catch(fail)
          .then(function() {
            expect(rejectScheme.calls.count()).toBe(2);
            done();
          });
    });

    it('will retry twice', function(done) {
      var request = createRequest('reject://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      rejectScheme.and.callFake(function() {
        if (rejectScheme.calls.count() < 3)
          return Promise.reject(error);
        else
          return Promise.resolve({
            uri: '', data: new ArrayBuffer(0), headers: {}
          });
      });
      networkingEngine.request(requestType, request)
          .catch(fail)
          .then(function() {
            expect(rejectScheme.calls.count()).toBe(3);
            done();
          });
    });

    it('will fail overall', function(done) {
      var request = createRequest('reject://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      networkingEngine.request(requestType, request)
          .then(fail)
          .catch(function() { expect(rejectScheme.calls.count()).toBe(3); })
          .then(done);
    });

    describe('backoff', function() {
      var baseDelay = 200;
      var origSetTimeout;
      var setTimeoutSpy;
      var realRandom;

      beforeAll(function() {
        origSetTimeout = shaka.net.NetworkingEngine.setTimeout_;
        setTimeoutSpy = jasmine.createSpy('setTimeout');
        setTimeoutSpy.and.callFake(origSetTimeout);
        shaka.net.NetworkingEngine.setTimeout_ = setTimeoutSpy;
        realRandom = Math.random;
        Math.random = function() { return 0.75; };
      });

      afterAll(function() {
        Math.random = realRandom;
        shaka.net.NetworkingEngine.setTimeout_ = origSetTimeout;
      });

      beforeEach(function() {
        setTimeoutSpy.calls.reset();
      });

      it('uses baseDelay', function(done) {
        var request = createRequest('reject://foo', {
          maxAttempts: 2,
          baseDelay: baseDelay,
          fuzzFactor: 0,
          backoffFactor: 2,
          timeout: 0
        });
        networkingEngine.request(requestType, request)
            .then(fail)
            .catch(function() {
              expect(setTimeoutSpy.calls.count()).toBe(1);
              expect(setTimeoutSpy)
                  .toHaveBeenCalledWith(jasmine.any(Function), baseDelay);
            })
            .then(done);
      });

      it('uses backoffFactor', function(done) {
        var request = createRequest('reject://foo', {
          maxAttempts: 3,
          baseDelay: baseDelay,
          fuzzFactor: 0,
          backoffFactor: 2,
          timeout: 0
        });
        networkingEngine.request(requestType, request)
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
        var request = createRequest('reject://foo', {
          maxAttempts: 2,
          baseDelay: baseDelay,
          fuzzFactor: 1,
          backoffFactor: 1,
          timeout: 0
        });
        networkingEngine.request(requestType, request)
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
    });

    it('uses multiple URIs', function(done) {
      var request = createRequest('', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      request.uris = ['reject://foo', 'resolve://foo'];
      networkingEngine.request(requestType, request)
          .catch(fail)
          .then(function() {
            expect(rejectScheme.calls.count()).toBe(1);
            expect(resolveScheme.calls.count()).toBe(1);
            done();
          });
    });

    it('won\'t retry for CRITICAL error', function(done) {
      var request = createRequest('reject://foo', {
        maxAttempts: 5,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });

      error.severity = shaka.util.Error.Severity.CRITICAL;
      networkingEngine.request(requestType, request)
          .then(fail)
          .catch(function() {
            expect(rejectScheme.calls.count()).toBe(1);
            done();
          });
    });
  });

  describe('request', function() {
    it('uses registered schemes', function(done) {
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .catch(fail)
          .then(function() {
            expect(resolveScheme).toHaveBeenCalled();
            done();
          });
    });

    it('can unregister scheme', function(done) {
      shaka.net.NetworkingEngine.unregisterScheme('resolve');
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .then(fail)
          .catch(function() { expect(resolveScheme).not.toHaveBeenCalled(); })
          .then(done);
    });

    it('rejects if scheme does not exist', function(done) {
      networkingEngine.request(requestType, createRequest('foo://foo'))
          .then(fail)
          .catch(function() { expect(resolveScheme).not.toHaveBeenCalled(); })
          .then(done);
    });

    it('returns the response object', function(done) {
      networkingEngine.request(requestType, createRequest('resolve://foo'))
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
      var request = createRequest('resolve://foo');
      request.method = 'POST';

      resolveScheme.and.callFake(function(uri, request, requestTypePassed) {
        expect(uri).toBe(request.uris[0]);
        expect(request).toEqual(request);
        expect(requestTypePassed).toEqual(requestType);
        return Promise.resolve({});
      });
      networkingEngine.request(requestType, request).catch(fail).then(done);
    });

    it('infers a scheme for // URIs', function(done) {
      fakeProtocol = 'resolve:';
      networkingEngine.request(requestType, createRequest('//foo'))
          .catch(fail)
          .then(function() {
            expect(resolveScheme).toHaveBeenCalled();
            expect(resolveScheme.calls.argsFor(0)[0]).toBe('resolve://foo');
            done();
          });
    });

    it('fills in defaults for partial request objects', function(done) {
      var originalRequest = {
        uris: ['resolve://foo']
      };

      resolveScheme.and.callFake(function(uri, request, requestTypePassed) {
        // NetworkingEngine should have filled in these values:
        expect(request.method).toBeTruthy();
        expect(request.headers).toBeTruthy();
        expect(request.retryParameters).toBeTruthy();

        return Promise.resolve({});
      });
      networkingEngine.request(requestType, originalRequest)
          .catch(fail).then(done);
    });
  });

  describe('request filter', function() {
    var filter;

    beforeEach(function() {
      filter = jasmine.createSpy('request filter');
      networkingEngine.registerRequestFilter(filter);
    });

    afterEach(function() {
      networkingEngine.unregisterRequestFilter(filter);
    });

    it('can be called', function(done) {
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .catch(fail)
          .then(function() {
            expect(filter).toHaveBeenCalled();
            done();
          });
    });

    it('called on failure', function(done) {
      networkingEngine.request(requestType, createRequest('reject://foo'))
          .then(fail)
          .catch(function() { expect(filter).toHaveBeenCalled(); })
          .then(done);
    });

    it('is given correct arguments', function(done) {
      var request = createRequest('resolve://foo');
      networkingEngine.request(requestType, request)
          .catch(fail)
          .then(function() {
            expect(filter.calls.argsFor(0)[0]).toBe(requestType);
            expect(filter.calls.argsFor(0)[1]).toBe(request);
            expect(filter.calls.argsFor(0)[1].uris[0]).toBe(request.uris[0]);
            done();
          });
    });

    it('waits for asynchronous filters', function(done) {
      var responseFilter = jasmine.createSpy('response filter');
      networkingEngine.registerResponseFilter(responseFilter);

      var p = new shaka.util.PublicPromise();
      var p2 = new shaka.util.PublicPromise();
      filter.and.returnValue(p);
      responseFilter.and.returnValue(p2);
      var request = createRequest('resolve://foo');
      var r = networkingEngine.request(requestType, request);
      Util.capturePromiseStatus(r);

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
      var fakeError = 'fake error';
      filter.and.callFake(function() {
        throw fakeError;
      });
      networkingEngine.request(requestType, createRequest('resolve://foo'))
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
          .catch(fail)
          .then(function() {
            expect(filter).toHaveBeenCalled();
            done();
          });
    });

    it('applies request filters sequentially', function(done) {
      var secondFilter = jasmine.createSpy('second request filter');
      networkingEngine.registerRequestFilter(secondFilter);

      var order = 0;
      filter.and.callFake(function() {
        expect(order).toBe(0);
        order += 1;
      });
      secondFilter.and.callFake(function() {
        expect(order).toBe(1);
        order += 1;
      });

      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .catch(fail)
          .then(done);
    });

    it('can modify requests asynchronously', function(done) {
      var p = new shaka.util.PublicPromise();
      filter.and.callFake(function(type, request) {
        return p.then(function() {
          request.uris = ['resolve://foo'];
          request.allowCrossSiteCredentials = true;
        });
      });
      networkingEngine.request(requestType, createRequest('reject://foo'))
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
      var request = createRequest('resolve://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      filter.and.returnValue(Promise.reject());
      networkingEngine.request(requestType, request)
          .then(fail)
          .catch(function() {
            expect(resolveScheme).not.toHaveBeenCalled();
            expect(filter.calls.count()).toBe(1);
          })
          .then(done);
    });

    it('if throws will stop requests', function(done) {
      var request = createRequest('resolve://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      filter.and.throwError(error);
      networkingEngine.request(requestType, request)
          .then(fail)
          .catch(function() {
            expect(resolveScheme).not.toHaveBeenCalled();
            expect(filter.calls.count()).toBe(1);
          })
          .then(done);
    });

    it('causes no errors to remove an unused filter', function() {
      var unusedFilter = jasmine.createSpy('unused filter');
      networkingEngine.unregisterRequestFilter(unusedFilter);
    });
  });

  describe('response filter', function() {
    var filter;

    beforeEach(function() {
      filter = jasmine.createSpy('response filter');
      networkingEngine.registerResponseFilter(filter);
      resolveScheme.and.callFake(function(request) {
        var response = {
          uri: '', data: new ArrayBuffer(100), headers: {}
        };
        return Promise.resolve(response);
      });
    });

    afterEach(function() {
      networkingEngine.unregisterResponseFilter(filter);
    });

    it('can be called', function(done) {
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .catch(fail)
          .then(function() {
            expect(filter).toHaveBeenCalled();
            done();
          });
    });

    it('not called on failure', function(done) {
      networkingEngine.request(requestType, createRequest('reject://foo'))
          .then(fail)
          .catch(function() { expect(filter).not.toHaveBeenCalled(); })
          .then(done);
    });

    it('is given correct arguments', function(done) {
      var request = createRequest('resolve://foo');
      networkingEngine.request(requestType, request)
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
          .catch(fail)
          .then(function(response) {
            expect(filter).toHaveBeenCalled();
            expect(response).toBeTruthy();
            expect(response.headers['DATE']).toBe('CAT');
            done();
          });
    });

    it('applies response filters sequentially', function(done) {
      var secondFilter = jasmine.createSpy('second response filter');
      networkingEngine.registerResponseFilter(secondFilter);

      var order = 0;
      filter.and.callFake(function() {
        expect(order).toBe(0);
        order += 1;
      });
      secondFilter.and.callFake(function() {
        expect(order).toBe(1);
        order += 1;
      });

      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .catch(fail)
          .then(done);
    });

    it('turns errors into shaka errors', function(done) {
      var fakeError = 'fake error';
      filter.and.callFake(function() {
        throw fakeError;
      });
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .then(fail)
          .catch(function(e) {
            expect(e.code).toBe(shaka.util.Error.Code.RESPONSE_FILTER_ERROR);
            expect(e.data).toEqual([fakeError]);
            done();
          });
    });

    it('can modify responses asynchronously', function(done) {
      var p = new shaka.util.PublicPromise();
      filter.and.callFake(function(type, response) {
        return p.then(function() {
          expect(response.headers).toBeTruthy();
          response.headers['DATE'] = 'CAT';
          response.data = new ArrayBuffer(5);
        });
      });

      var request = createRequest('resolve://foo');
      var r = networkingEngine.request(requestType, request)
          .catch(fail)
          .then(function(response) {
            expect(response).toBeTruthy();
            expect(response.headers['DATE']).toBe('CAT');
            expect(response.data.byteLength).toBe(5);
            done();
          });
      Util.capturePromiseStatus(r);

      Util.delay(0.1).then(function() {
        expect(filter).toHaveBeenCalled();
        expect(r.status).toBe('pending');

        p.resolve();
      });
    });

    it('if throws will stop requests', function(done) {
      filter.and.callFake(function() { throw error; });
      networkingEngine.request(requestType, createRequest('resolve://foo'))
          .then(fail)
          .catch(function() { expect(filter).toHaveBeenCalled(); })
          .then(done);
    });

    it('if throws will retry', function(done) {
      var request = createRequest('resolve://foo', {
        maxAttempts: 2,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      error.severity = shaka.util.Error.Severity.RECOVERABLE;
      filter.and.callFake(function() {
        if (filter.calls.count() == 1) throw error;
      });

      networkingEngine.request(requestType, request)
          .catch(fail)
          .then(function() {
            expect(resolveScheme.calls.count()).toBe(2);
            expect(filter.calls.count()).toBe(2);
            done();
          });
    });

    it('causes no errors to remove an unused filter', function() {
      var unusedFilter = jasmine.createSpy('unused filter');
      networkingEngine.unregisterResponseFilter(unusedFilter);
    });
  });

  describe('destroy', function() {
    it('waits for all operations to complete', function(done) {
      var request = createRequest('resolve://foo');
      var p = new shaka.util.PublicPromise();
      resolveScheme.and.returnValue(p);

      var r1 = networkingEngine.request(requestType, request);
      var r2 = networkingEngine.request(requestType, request);
      Util.capturePromiseStatus(r1);
      Util.capturePromiseStatus(r2);

      expect(r1.status).toBe('pending');
      expect(r2.status).toBe('pending');

      var d;
      Util.delay(0.1).then(function() {
        d = networkingEngine.destroy();
        Util.capturePromiseStatus(d);
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
      var filter = jasmine.createSpy('request filter');
      networkingEngine.registerRequestFilter(filter);
      var p = new shaka.util.PublicPromise();
      filter.and.returnValue(p);

      var request = createRequest('resolve://foo', {
        maxAttempts: 1,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      var r = networkingEngine.request(requestType, request);
      Util.capturePromiseStatus(r);

      var d;
      Util.delay(0.1).then(function() {
        expect(filter).toHaveBeenCalled();
        expect(r.status).toBe('pending');

        d = networkingEngine.destroy();
        Util.capturePromiseStatus(d);
        p.resolve();

        return Util.delay(0.1);
      }).then(function() {
        expect(d.status).toBe('resolved');
        expect(r.status).toBe('rejected');
        expect(resolveScheme).not.toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('resolves even when a request fails', function(done) {
      var request = createRequest('reject://foo');
      var p = new shaka.util.PublicPromise();
      rejectScheme.and.returnValue(p);

      var r1 = networkingEngine.request(requestType, request);
      var r2 = networkingEngine.request(requestType, request);
      Util.capturePromiseStatus(r1);
      Util.capturePromiseStatus(r2);

      expect(r1.status).toBe('pending');
      expect(r2.status).toBe('pending');

      var d;
      Util.delay(0.1).then(function() {
        d = networkingEngine.destroy();
        Util.capturePromiseStatus(d);
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
      var request = createRequest('resolve://foo');
      var p = new shaka.util.PublicPromise();
      resolveScheme.and.returnValue(p);

      var r1 = networkingEngine.request(requestType, request);
      var r2;
      var d;
      Util.capturePromiseStatus(r1);
      expect(r1.status).toBe('pending');
      Util.delay(0.1).then(function() {
        // The request has already been made.
        expect(resolveScheme.calls.count()).toBe(1);

        d = networkingEngine.destroy();
        Util.capturePromiseStatus(d);
        expect(d.status).toBe('pending');

        r2 = networkingEngine.request(requestType, request);
        Util.capturePromiseStatus(r2);
        expect(r2.status).toBe('pending');
        // A new request has not been made.
        expect(resolveScheme.calls.count()).toBe(1);

        return Util.delay(0.1);
      }).then(function() {
        expect(r1.status).toBe('pending');
        expect(r2.status).toBe('rejected');
        expect(d.status).toBe('pending');
        p.resolve({});
        return d;
      }).then(function() {
        return Util.delay(0.1);
      }).then(function() {
        expect(r1.status).toBe('resolved');
        expect(r2.status).toBe('rejected');
        expect(d.status).toBe('resolved');
        expect(resolveScheme.calls.count()).toBe(1);
      }).catch(fail).then(done);
    });

    it('does not allow further retries', function(done) {
      var request = createRequest('reject://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });

      var p1 = new shaka.util.PublicPromise();
      var p2 = new shaka.util.PublicPromise();
      rejectScheme.and.callFake(function() {
        return (rejectScheme.calls.count() == 1) ? p1 : p2;
      });

      var r1 = networkingEngine.request(requestType, request);
      var d;
      Util.capturePromiseStatus(r1);
      expect(r1.status).toBe('pending');
      Util.delay(0.1).then(function() {
        expect(rejectScheme.calls.count()).toBe(1);

        d = networkingEngine.destroy();
        Util.capturePromiseStatus(d);
        expect(d.status).toBe('pending');

        return Util.delay(0.1);
      }).then(function() {
        expect(r1.status).toBe('pending');
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
        expect(r1.status).toBe('rejected');
        expect(rejectScheme.calls.count()).toBe(1);
      }).catch(fail).then(done);
    });
  });

  it('ignores cache hits', function(done) {
    var onSegmentDownloaded = jasmine.createSpy('onSegmentDownloaded');
    networkingEngine = new shaka.net.NetworkingEngine(onSegmentDownloaded);

    networkingEngine.request(requestType, createRequest('resolve://foo'))
        .then(function() {
          expect(onSegmentDownloaded).toHaveBeenCalled();
          onSegmentDownloaded.calls.reset();

          resolveScheme.and.callFake(function() {
            return Promise.resolve({
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

  /**
   * @param {string} uri
   * @param {shakaExtern.RetryParameters=} opt_retryParameters
   * @return {shakaExtern.Request}
   */
  function createRequest(uri, opt_retryParameters) {
    var retryParameters = opt_retryParameters ||
                          shaka.net.NetworkingEngine.defaultRetryParameters();
    return shaka.net.NetworkingEngine.makeRequest([uri], retryParameters);
  }
});
