/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.require('shaka.net.NetworkingEngine');

describe('NetworkingEngine', function() {
  var networkingEngine;
  var resolveScheme;
  var rejectScheme;
  var requestType;

  beforeAll(function() {
    requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
  });

  beforeEach(function() {
    networkingEngine = new shaka.net.NetworkingEngine();
    resolveScheme = jasmine.createSpy('resolve scheme').and.callFake(
        function() {
          return Promise.resolve({data: new ArrayBuffer(5), headers: {}});
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

  describe('retry', function() {
    var oldRandom;

    beforeAll(function() {
      // Use fake random to get an accurate test.
      oldRandom = Math.random;
      Math.random = function() { return 0.75; };
    });

    afterAll(function() {
      Math.random = oldRandom;
    });

    it('will retry', function(done) {
      var request = {
        uri: ['reject://foo'],
        retryParameters: {maxAttempts: 2, baseDelay: 0}
      };
      rejectScheme.and.callFake(function() {
        if (rejectScheme.calls.count() == 1)
          return Promise.reject();
        else
          return Promise.resolve({data: new ArrayBuffer(0), headers: {}});
      });
      networkingEngine.request(requestType, request)
          .catch(fail)
          .then(function() {
            expect(rejectScheme.calls.count()).toBe(2);
            done();
          });
    });

    it('will retry twice', function(done) {
      var request = {
        uri: ['reject://foo'],
        retryParameters: {maxAttempts: 3, baseDelay: 0}
      };
      rejectScheme.and.callFake(function() {
        if (rejectScheme.calls.count() < 3)
          return Promise.reject();
        else
          return Promise.resolve({data: new ArrayBuffer(0), headers: {}});
      });
      networkingEngine.request(requestType, request)
          .catch(fail)
          .then(function() {
            expect(rejectScheme.calls.count()).toBe(3);
            done();
          });
    });

    it('will fail overall', function(done) {
      var request = {
        uri: ['reject://foo'],
        retryParameters: {maxAttempts: 3, baseDelay: 0}
      };
      networkingEngine.request(requestType, request)
          .then(fail)
          .catch(function() { expect(rejectScheme.calls.count()).toBe(3); })
          .then(done);
    });

    it('uses retry delay', function(done) {
      var request = {
        uri: ['reject://foo'],
        retryParameters: {maxAttempts: 2, baseDelay: 200, fuzzFactor: 0}
      };
      var tolerance = 50;
      var start = Date.now();
      networkingEngine.request(requestType, request)
          .then(fail)
          .catch(function() {
            var end = Date.now();
            var delta = end - start;
            expect(delta).toBeGreaterThan(199);
            expect(delta).toBeLessThan(200 + tolerance);
          })
          .then(done);
    });

    it('uses retry backoff factor', function(done) {
      var request = {
        uri: ['reject://foo'],
        retryParameters: {
          maxAttempts: 3,
          baseDelay: 200,
          fuzzFactor: 0,
          backoffFactor: 2
        }
      };
      var tolerance = 50;
      var start = Date.now();
      networkingEngine.request(requestType, request)
          .then(fail)
          .catch(function() {
            var end = Date.now();
            var delta = end - start;
            // 200 for the first try, 400 for the second.
            expect(delta).toBeGreaterThan(599);
            expect(delta).toBeLessThan(600 + tolerance);
          })
          .then(done);
    });

    it('uses retry fuzz factor', function(done) {
      var request = {
        uri: ['reject://foo'],
        retryParameters: {
          maxAttempts: 2,
          baseDelay: 200,
          fuzzFactor: 1,
          backoffFactor: 1
        }
      };
      var tolerance = 50;
      var start = Date.now();
      networkingEngine.request(requestType, request)
          .then(fail)
          .catch(function() {
            var end = Date.now();
            var delta = end - start;
            // (rand * 2.0) - 1.0 = (0.75 * 2.0) - 1.0 = 0.5
            // 0.5 * fuzzFactor = 0.5 * 1 = 0.5
            // delay * (1 + 0.5) = 200 * (1 + 0.5) = 300
            expect(delta).toBeGreaterThan(299);
            expect(delta).toBeLessThan(300 + tolerance);
          })
          .then(done);
    });

    it('uses multiple URIs', function(done) {
      var request = {
        uri: ['reject://foo', 'resolve://foo'],
        retryParameters: {maxAttempts: 3}
      };
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
      var request = {uri: ['resolve://foo'], method: 'POST'};
      resolveScheme.and.callFake(function(uri, request) {
        expect(uri).toBe(request.uri[0]);
        expect(request).toBe(request);
        return Promise.resolve();
      });
      networkingEngine.request(requestType, request).catch(fail).then(done);
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
      var request = {uri: ['resolve://foo']};
      networkingEngine.request(requestType, request)
          .catch(fail)
          .then(function() {
            expect(filter.calls.argsFor(0)[0]).toBe(requestType);
            expect(filter.calls.argsFor(0)[1]).toBe(request);
            expect(filter.calls.argsFor(0)[1].uri[0]).toBe(request.uri[0]);
            done();
          });
    });

    it('can modify uri', function(done) {
      filter.and.callFake(function(type, request) {
        request.uri = ['resolve://foo'];
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
      var request = {
        uri: ['resolve://foo'],
        retryParameters: {maxAttempts: 3, baseRetryDelay: 0}
      };
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
        var response = {data: new ArrayBuffer(100), headers: {}};
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
      var request = {uri: ['resolve://foo']};
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
      var request = {
        uri: ['resolve://foo'],
        retryParameters: {maxAttempts: 2, baseRetryDelay: 0}
      };
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

  function createRequest(uri) {
    return { uri: [uri] };
  }
});

