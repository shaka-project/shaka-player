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
    networkingEngine = new shaka.net.NetworkingEngine();
    resolveScheme = jasmine.createSpy('resolve scheme').and.callFake(
        function() {
          return Promise.resolve({
            uri: '', data: new ArrayBuffer(5), headers: {}
          });
        });
    rejectScheme = jasmine.createSpy('reject scheme')
        .and.callFake(function() { return Promise.reject(); });
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
          return Promise.reject();
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
          return Promise.reject();
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
      var realSetTimeout;
      var setTimeoutSpy;
      var realRandom;

      beforeAll(function() {
        realSetTimeout = window.setTimeout;
        setTimeoutSpy = jasmine.createSpy('setTimeout');
        setTimeoutSpy.and.callFake(realSetTimeout);
        window.setTimeout = setTimeoutSpy;
        realRandom = Math.random;
        Math.random = function() { return 0.75; };
      });

      afterAll(function() {
        Math.random = realRandom;
        window.setTimeout = realSetTimeout;
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

      resolveScheme.and.callFake(function(uri, request) {
        expect(uri).toBe(request.uris[0]);
        expect(request).toEqual(request);
        return Promise.resolve();
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

    it('if throws will stop requests', function(done) {
      var request = createRequest('resolve://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0
      });
      filter.and.throwError(new Error());
      networkingEngine.request(requestType, request)
          .then(fail)
          .catch(function() {
            expect(resolveScheme).not.toHaveBeenCalled();
            expect(filter.calls.count()).toBe(1);
          })
          .then(done);
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

    it('if throws will stop requests', function(done) {
      filter.and.throwError(new Error());
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
      filter.and.callFake(function() {
        if (filter.calls.count() == 1) throw new Error();
      });
      networkingEngine.request(requestType, request)
          .catch(fail)
          .then(function() {
            expect(resolveScheme.calls.count()).toBe(2);
            expect(filter.calls.count()).toBe(2);
            done();
          });
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

      var d = networkingEngine.destroy();
      Util.capturePromiseStatus(d);
      expect(d.status).toBe('pending');

      Util.delay(0.1).then(function() {
        expect(d.status).toBe('pending');
        p.resolve();
        return d;
      }).then(function() {
        return Util.delay(0.1);
      }).then(function() {
        expect(r1.status).toBe('resolved');
        expect(r2.status).toBe('resolved');
        expect(d.status).toBe('resolved');
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

      var d = networkingEngine.destroy();
      Util.capturePromiseStatus(d);
      expect(d.status).toBe('pending');

      Util.delay(0.1).then(function() {
        expect(d.status).toBe('pending');
        p.reject();
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
      Util.capturePromiseStatus(r1);
      expect(r1.status).toBe('pending');
      // The request has already been made.
      expect(resolveScheme.calls.count()).toBe(1);

      var d = networkingEngine.destroy();
      Util.capturePromiseStatus(d);
      expect(d.status).toBe('pending');

      var r2 = networkingEngine.request(requestType, request);
      Util.capturePromiseStatus(r2);
      expect(r2.status).toBe('pending');
      // A new request has not been made.
      expect(resolveScheme.calls.count()).toBe(1);

      Util.delay(0.1).then(function() {
        expect(r1.status).toBe('pending');
        expect(r2.status).toBe('rejected');
        expect(d.status).toBe('pending');
        p.resolve();
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
      Util.capturePromiseStatus(r1);
      expect(r1.status).toBe('pending');
      expect(rejectScheme.calls.count()).toBe(1);

      var d = networkingEngine.destroy();
      Util.capturePromiseStatus(d);
      expect(d.status).toBe('pending');

      Util.delay(0.1).then(function() {
        expect(r1.status).toBe('pending');
        expect(d.status).toBe('pending');
        expect(rejectScheme.calls.count()).toBe(1);
        // Reject the initial request.
        p1.reject();
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
