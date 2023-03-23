/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('NetworkingEngine', /** @suppress {accessControls} */ () => {
  const StatusPromise = shaka.test.StatusPromise;
  const Util = shaka.test.Util;
  const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
  const originalGetLocationProtocol =
      shaka.net.NetworkingEngine.getLocationProtocol_;
  const originalDefer = shaka.net.Backoff.defer;

  /** @type {string} */
  let fakeProtocol;
  /** @type {!shaka.net.NetworkingEngine} */
  let networkingEngine;
  /** @type {!jasmine.Spy} */
  let resolveScheme;
  /** @type {!jasmine.Spy} */
  let rejectScheme;
  /** @type {!jasmine.Spy} */
  let onProgress;
  /** @type {!shaka.util.Error} */
  let error;
  /** @type {!jasmine.Spy} */
  let deferSpy;

  beforeAll(() => {
    shaka.net.NetworkingEngine.getLocationProtocol_ = () => fakeProtocol;
  });

  function makeResolveScheme(spyName) {
    return jasmine.createSpy(spyName).and.callFake(
        () => shaka.util.AbortableOperation.completed(createResponse()));
  }

  beforeEach(() => {
    fakeProtocol = 'http:';
    error = new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.HTTP_ERROR);

    onProgress = jasmine.createSpy('onProgressUpdated');
    networkingEngine = new shaka.net.NetworkingEngine(Util.spyFunc(onProgress));
    resolveScheme = makeResolveScheme('resolve scheme');
    rejectScheme = jasmine.createSpy('reject scheme').and.callFake(() =>
      shaka.util.AbortableOperation.failed(error));
    shaka.net.NetworkingEngine.registerScheme(
        'resolve', Util.spyFunc(resolveScheme),
        shaka.net.NetworkingEngine.PluginPriority.FALLBACK);
    shaka.net.NetworkingEngine.registerScheme(
        'reject', Util.spyFunc(rejectScheme),
        shaka.net.NetworkingEngine.PluginPriority.FALLBACK);

    deferSpy = jasmine.createSpy('defer');
    deferSpy.and.callFake((delay, cb) => cb());
    shaka.net.Backoff.defer = Util.spyFunc(deferSpy);
  });

  afterEach(() => {
    shaka.net.NetworkingEngine.unregisterScheme('resolve');
    shaka.net.NetworkingEngine.unregisterScheme('reject');
  });

  afterAll(() => {
    shaka.net.NetworkingEngine.getLocationProtocol_ =
        originalGetLocationProtocol;
    shaka.net.Backoff.defer = originalDefer;
  });

  describe('retry', () => {
    it('will retry', async () => {
      const request = createRequest('reject://foo', {
        maxAttempts: 2,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0,
        stallTimeout: 0,
        connectionTimeout: 0,
      });
      rejectScheme.and.callFake(() => {
        if (rejectScheme.calls.count() == 1) {
          return shaka.util.AbortableOperation.failed(error);
        } else {
          return shaka.util.AbortableOperation.completed(createResponse());
        }
      });
      await networkingEngine.request(requestType, request).promise;
      expect(rejectScheme).toHaveBeenCalledTimes(2);
    });

    it('will retry twice', async () => {
      const request = createRequest('reject://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0,
        stallTimeout: 0,
        connectionTimeout: 0,
      });
      rejectScheme.and.callFake(() => {
        if (rejectScheme.calls.count() < 3) {
          return shaka.util.AbortableOperation.failed(error);
        } else {
          return shaka.util.AbortableOperation.completed(createResponse());
        }
      });
      await networkingEngine.request(requestType, request).promise;
      expect(rejectScheme).toHaveBeenCalledTimes(3);
    });

    it('will fail overall', async () => {
      const request = createRequest('reject://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0,
        stallTimeout: 0,
        connectionTimeout: 0,
      });

      // It is expected to fail with the most recent error, but at a CRITICAL
      // severity, even though the original is at RECOVERABLE.

      // Check our expectations.
      expect(error.severity).toBe(shaka.util.Error.Severity.RECOVERABLE);

      // Modify the expected error.  Note that |expected| here is a wrapper
      // created by jasmine, and |expected.sample| is the Object containing the
      // expected values.
      const expected = Util.jasmineError(error);
      expected.sample.severity = shaka.util.Error.Severity.CRITICAL;

      await expectAsync(networkingEngine.request(requestType, request).promise)
          .toBeRejectedWith(expected);
      expect(rejectScheme).toHaveBeenCalledTimes(3);
    });

    describe('backoff', () => {
      const baseDelay = 200;
      const realRandom = Math.random;

      afterAll(() => {
        Math.random = realRandom;
      });

      beforeEach(() => {
        Math.random = () => 0.75;
      });

      it('uses baseDelay', async () => {
        const request = createRequest('reject://foo', {
          maxAttempts: 2,
          baseDelay: baseDelay,
          fuzzFactor: 0,
          backoffFactor: 2,
          timeout: 0,
          stallTimeout: 0,
          connectionTimeout: 0,
        });

        await expectAsync(
            networkingEngine.request(requestType, request).promise)
            .toBeRejected();
        expect(deferSpy).toHaveBeenCalledTimes(1);
        expect(deferSpy).toHaveBeenCalledWith(baseDelay, jasmine.any(Function));
      });

      it('uses backoffFactor', async () => {
        const request = createRequest('reject://foo', {
          maxAttempts: 3,
          baseDelay: baseDelay,
          fuzzFactor: 0,
          backoffFactor: 2,
          timeout: 0,
          stallTimeout: 0,
          connectionTimeout: 0,
        });

        await expectAsync(
            networkingEngine.request(requestType, request).promise)
            .toBeRejected();
        expect(deferSpy).toHaveBeenCalledTimes(2);
        expect(deferSpy).toHaveBeenCalledWith(
            baseDelay, jasmine.any(Function));
        expect(deferSpy).toHaveBeenCalledWith(
            baseDelay * 2, jasmine.any(Function));
      });

      it('uses fuzzFactor', async () => {
        const request = createRequest('reject://foo', {
          maxAttempts: 2,
          baseDelay: baseDelay,
          fuzzFactor: 1,
          backoffFactor: 1,
          timeout: 0,
          stallTimeout: 0,
          connectionTimeout: 0,
        });

        await expectAsync(
            networkingEngine.request(requestType, request).promise)
            .toBeRejected();
        // (rand * 2.0) - 1.0 = (0.75 * 2.0) - 1.0 = 0.5
        // 0.5 * fuzzFactor = 0.5 * 1 = 0.5
        // delay * (1 + 0.5) = baseDelay * (1 + 0.5)
        expect(deferSpy).toHaveBeenCalledTimes(1);
        expect(deferSpy).toHaveBeenCalledWith(
            baseDelay * 1.5, jasmine.any(Function));
      });
    });  // describe('backoff')

    it('uses multiple URIs', async () => {
      const request = createRequest('', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0,
        stallTimeout: 0,
        connectionTimeout: 0,
      });
      request.uris = ['reject://foo', 'resolve://foo'];
      await networkingEngine.request(requestType, request).promise;
      expect(rejectScheme).toHaveBeenCalledTimes(1);
      expect(resolveScheme).toHaveBeenCalledTimes(1);
    });

    it('won\'t retry for CRITICAL error', async () => {
      const request = createRequest('reject://foo', {
        maxAttempts: 5,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0,
        stallTimeout: 0,
        connectionTimeout: 0,
      });

      error.severity = shaka.util.Error.Severity.CRITICAL;
      await expectAsync(networkingEngine.request(requestType, request).promise)
          .toBeRejected();
      expect(rejectScheme).toHaveBeenCalledTimes(1);
    });
  });  // describe('retry')

  describe('request', () => {
    async function testResolve(schemeSpy) {
      await networkingEngine
          .request(requestType, createRequest('resolve://foo'))
          .promise;
      expect(schemeSpy).toHaveBeenCalled();
    }

    it('uses registered schemes', async () => {
      await testResolve(resolveScheme);
    });

    it('treats schemes as case-insensitive', async () => {
      await networkingEngine
          .request(requestType, createRequest('Resolve://foo'))
          .promise;
      await networkingEngine
          .request(requestType, createRequest('RESOLVE://foo'))
          .promise;
      await networkingEngine
          .request(requestType, createRequest('rEsOlVe://foo'))
          .promise;
    });

    it('uses registered scheme plugins in order of priority', async () => {
      const applicationResolveScheme =
          makeResolveScheme('application resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(applicationResolveScheme),
          shaka.net.NetworkingEngine.PluginPriority.APPLICATION);
      const preferredResolveScheme =
          makeResolveScheme('preferred resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(preferredResolveScheme),
          shaka.net.NetworkingEngine.PluginPriority.PREFERRED);

      await testResolve(applicationResolveScheme);
    });

    it('uses newest scheme plugin in case of tie in priority', async () => {
      const secondResolveScheme = makeResolveScheme('second resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(secondResolveScheme),
          shaka.net.NetworkingEngine.PluginPriority.FALLBACK);

      await testResolve(secondResolveScheme);
    });

    it('defaults new scheme plugins to application priority', async () => {
      const secondResolveScheme = makeResolveScheme('second resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(secondResolveScheme));
      const preferredResolveScheme =
          makeResolveScheme('preferred resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(preferredResolveScheme),
          shaka.net.NetworkingEngine.PluginPriority.PREFERRED);

      await testResolve(secondResolveScheme);
    });

    it('can unregister scheme', async () => {
      shaka.net.NetworkingEngine.unregisterScheme('resolve');
      await expectAsync(
          networkingEngine.request(requestType, createRequest('resolve://foo'))
              .promise)
          .toBeRejected();
      expect(resolveScheme).not.toHaveBeenCalled();
    });

    it('unregister removes all plugins for scheme at once', async () => {
      const preferredResolveScheme =
          makeResolveScheme('preferred resolve scheme');
      shaka.net.NetworkingEngine.registerScheme(
          'resolve', Util.spyFunc(preferredResolveScheme),
          shaka.net.NetworkingEngine.PluginPriority.PREFERRED);

      shaka.net.NetworkingEngine.unregisterScheme('resolve');
      await expectAsync(
          networkingEngine.request(requestType, createRequest('resolve://foo'))
              .promise)
          .toBeRejected();
      expect(resolveScheme).not.toHaveBeenCalled();
      expect(preferredResolveScheme).not.toHaveBeenCalled();
    });

    it('rejects if scheme does not exist', async () => {
      await expectAsync(
          networkingEngine.request(requestType, createRequest('foo://foo'))
              .promise)
          .toBeRejected();
      expect(resolveScheme).not.toHaveBeenCalled();
    });

    it('returns the response object', async () => {
      const response = await networkingEngine
          .request(requestType, createRequest('resolve://foo')).promise;
      expect(response).toBeTruthy();
      expect(response.data).toBeTruthy();
      expect(response.data.byteLength).toBe(5);
      expect(response.headers).toBeTruthy();
    });

    it('passes correct arguments to plugin', async () => {
      const request = createRequest('resolve://foo');
      request.method = 'POST';

      resolveScheme.and.callFake(
          (uri, requestPassed, requestTypePassed) => {
            expect(uri).toBe(request.uris[0]);
            expect(requestPassed).toEqual(request);
            expect(requestTypePassed).toBe(requestType);
            return shaka.util.AbortableOperation.completed(createResponse());
          });
      await networkingEngine.request(requestType, request).promise;
    });

    it('infers a scheme for // URIs', async () => {
      fakeProtocol = 'resolve:';
      await networkingEngine.request(requestType, createRequest('//foo'))
          .promise;
      expect(resolveScheme).toHaveBeenCalled();
      expect(resolveScheme.calls.argsFor(0)[0]).toBe('resolve://foo');
    });

    it('fills in defaults for partial request objects', async () => {
      const originalRequest = /** @type {shaka.extern.Request} */ ({
        uris: ['resolve://foo'],
      });

      resolveScheme.and.callFake((uri, request, requestTypePassed) => {
        // NetworkingEngine should have filled in these values:
        expect(request.method).toBeTruthy();
        expect(request.headers).toBeTruthy();
        expect(request.retryParameters).toBeTruthy();

        return shaka.util.AbortableOperation.completed(createResponse());
      });
      await networkingEngine.request(requestType, originalRequest).promise;
    });
  });  // describe('request')

  describe('request filter', () => {
    /** @type {!jasmine.Spy} */
    let filter;

    beforeEach(() => {
      filter = jasmine.createSpy('request filter');
      networkingEngine.registerRequestFilter(Util.spyFunc(filter));
    });

    afterEach(() => {
      networkingEngine.unregisterRequestFilter(Util.spyFunc(filter));
    });

    it('can be called', async () => {
      await networkingEngine
          .request(requestType, createRequest('resolve://foo')).promise;
      expect(filter).toHaveBeenCalled();
    });

    it('called on failure', async () => {
      await expectAsync(
          networkingEngine.request(requestType, createRequest('reject://foo'))
              .promise)
          .toBeRejected();
      expect(filter).toHaveBeenCalled();
    });

    it('is given correct arguments', async () => {
      const request = createRequest('resolve://foo');
      await networkingEngine.request(requestType, request).promise;
      expect(filter.calls.argsFor(0)[0]).toBe(requestType);
      expect(filter.calls.argsFor(0)[1]).toBe(request);
      expect(filter.calls.argsFor(0)[1].uris[0]).toBe(request.uris[0]);
    });

    it('waits for asynchronous filters', async () => {
      const responseFilter = jasmine.createSpy('response filter');
      networkingEngine.registerResponseFilter(Util.spyFunc(responseFilter));

      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      /** @type {!shaka.util.PublicPromise} */
      const p2 = new shaka.util.PublicPromise();
      filter.and.returnValue(p);
      responseFilter.and.returnValue(p2);
      const request = createRequest('resolve://foo');
      /** @type {!shaka.test.StatusPromise} */
      const r = new StatusPromise(
          networkingEngine.request(requestType, request).promise);

      await Util.shortDelay();

      expect(filter).toHaveBeenCalled();
      expect(resolveScheme).not.toHaveBeenCalled();
      expect(responseFilter).not.toHaveBeenCalled();
      expect(r.status).toBe('pending');
      p.resolve();

      await Util.shortDelay();

      expect(resolveScheme).toHaveBeenCalled();
      expect(responseFilter).toHaveBeenCalled();
      expect(r.status).toBe('pending');
      p2.resolve();

      await Util.shortDelay();
      expect(r.status).toBe('resolved');
    });

    it('turns errors into shaka errors', async () => {
      const fakeError = new Error('fake error');
      filter.and.callFake(() => {
        throw fakeError;
      });
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.REQUEST_FILTER_ERROR, fakeError));
      await expectAsync(
          networkingEngine.request(requestType, createRequest('resolve://foo'))
              .promise)
          .toBeRejectedWith(expected);
    });

    it('can modify uris', async () => {
      filter.and.callFake((type, request) => {
        request.uris = ['resolve://foo'];
      });
      await networkingEngine.request(requestType, createRequest('reject://foo'))
          .promise;
      expect(filter).toHaveBeenCalled();
    });

    it('applies request filters sequentially', async () => {
      const secondFilter = jasmine.createSpy('second request filter');
      networkingEngine.registerRequestFilter(Util.spyFunc(secondFilter));

      let order = 0;
      filter.and.callFake(() => {
        expect(order).toBe(0);
        order += 1;
      });
      secondFilter.and.callFake(() => {
        expect(order).toBe(1);
        order += 1;
      });

      await networkingEngine
          .request(requestType, createRequest('resolve://foo')).promise;
    });

    it('can modify requests asynchronously', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      filter.and.callFake(async (type, request) => {
        await p;
        request.uris = ['resolve://foo'];
        request.allowCrossSiteCredentials = true;
      });

      const req = async () => {
        await networkingEngine
            .request(requestType, createRequest('reject://foo')).promise;
        expect(resolveScheme).toHaveBeenCalled();
        expect(resolveScheme.calls.argsFor(0)[1].allowCrossSiteCredentials)
            .toBe(true);
      };
      const resolve = async () => {
        await Util.shortDelay();
        expect(filter).toHaveBeenCalled();
        expect(resolveScheme).not.toHaveBeenCalled();
        p.resolve();
      };

      await Promise.all([req(), resolve()]);
    });

    it('can modify allowCrossSiteCredentials', async () => {
      filter.and.callFake((type, request) => {
        request.allowCrossSiteCredentials = true;
      });
      await networkingEngine
          .request(requestType, createRequest('resolve://foo')).promise;
      expect(filter).toHaveBeenCalled();
      expect(resolveScheme).toHaveBeenCalled();
      expect(resolveScheme.calls.argsFor(0)[1].allowCrossSiteCredentials)
          .toBe(true);
    });

    it('if rejects will stop requests', async () => {
      const request = createRequest('resolve://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0,
        stallTimeout: 0,
        connectionTimeout: 0,
      });
      filter.and.returnValue(Promise.reject(new Error('')));

      await expectAsync(networkingEngine.request(requestType, request).promise)
          .toBeRejected();
      expect(resolveScheme).not.toHaveBeenCalled();
      expect(filter).toHaveBeenCalledTimes(1);
    });

    it('if throws will stop requests', async () => {
      const request = createRequest('resolve://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0,
        stallTimeout: 0,
        connectionTimeout: 0,
      });
      filter.and.throwError(error);

      await expectAsync(networkingEngine.request(requestType, request).promise)
          .toBeRejected();
      expect(resolveScheme).not.toHaveBeenCalled();
      expect(filter).toHaveBeenCalledTimes(1);
    });

    it('causes no errors to remove an unused filter', () => {
      const unusedFilter = jasmine.createSpy('unused filter');
      networkingEngine.unregisterRequestFilter(Util.spyFunc(unusedFilter));
    });
  });  // describe('request filter')

  describe('response filter', () => {
    /** @type {!jasmine.Spy} */
    let filter;

    beforeEach(() => {
      filter = jasmine.createSpy('response filter');
      networkingEngine.registerResponseFilter(Util.spyFunc(filter));
      resolveScheme.and.callFake((request) => {
        return shaka.util.AbortableOperation.completed(createResponse());
      });
    });

    afterEach(() => {
      networkingEngine.unregisterResponseFilter(Util.spyFunc(filter));
    });

    it('can be called', async () => {
      await networkingEngine
          .request(requestType, createRequest('resolve://foo')).promise;
      expect(filter).toHaveBeenCalled();
    });

    it('not called on failure', async () => {
      await expectAsync(
          networkingEngine.request(requestType, createRequest('reject://foo'))
              .promise)
          .toBeRejected();
      expect(filter).not.toHaveBeenCalled();
    });

    it('is given correct arguments', async () => {
      const request = createRequest('resolve://foo');
      await networkingEngine.request(requestType, request).promise;
      expect(filter.calls.argsFor(0)[0]).toBe(requestType);
      expect(filter.calls.argsFor(0)[1]).toBeTruthy();
      expect(filter.calls.argsFor(0)[1].data).toBeTruthy();
      expect(filter.calls.argsFor(0)[1].headers).toBeTruthy();
    });

    it('can modify data', async () => {
      filter.and.callFake((type, response) => {
        response.data = new ArrayBuffer(5);
      });
      const response = await networkingEngine
          .request(requestType, createRequest('resolve://foo')).promise;
      expect(filter).toHaveBeenCalled();
      expect(response).toBeTruthy();
      expect(response.data.byteLength).toBe(5);
    });

    it('can modify headers', async () => {
      filter.and.callFake((type, response) => {
        expect(response.headers).toBeTruthy();
        response.headers['DATE'] = 'CAT';
      });
      const response = await networkingEngine
          .request(requestType, createRequest('resolve://foo')).promise;
      expect(filter).toHaveBeenCalled();
      expect(response).toBeTruthy();
      expect(response.headers['DATE']).toBe('CAT');
    });

    it('applies response filters sequentially', async () => {
      const secondFilter = jasmine.createSpy('second response filter');
      networkingEngine.registerResponseFilter(Util.spyFunc(secondFilter));

      let order = 0;
      filter.and.callFake(() => {
        expect(order).toBe(0);
        order += 1;
      });
      secondFilter.and.callFake(() => {
        expect(order).toBe(1);
        order += 1;
      });

      await networkingEngine
          .request(requestType, createRequest('resolve://foo')).promise;
    });

    it('turns errors into shaka errors', async () => {
      const fakeError = 'fake error';
      filter.and.callFake(() => {
        throw fakeError;
      });
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.RESPONSE_FILTER_ERROR, fakeError));
      await expectAsync(
          networkingEngine.request(requestType, createRequest('resolve://foo'))
              .promise)
          .toBeRejectedWith(expected);
    });

    it('can modify responses asynchronously', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      filter.and.callFake(async (type, response) => {
        await p;
        expect(response.headers).toBeTruthy();
        response.headers['DATE'] = 'CAT';
        response.data = new ArrayBuffer(5);
      });

      /** @type {!shaka.test.StatusPromise} */
      let r;
      const makeRequest = async () => {
        const request = createRequest('resolve://foo');
        r = new StatusPromise(
            networkingEngine.request(requestType, request).promise);

        const response = await r;
        expect(response).toBeTruthy();
        expect(response.headers['DATE']).toBe('CAT');
        expect(response.data.byteLength).toBe(5);
      };
      const delay = async () => {
        await Util.shortDelay();
        expect(filter).toHaveBeenCalled();
        expect(r.status).toBe('pending');

        p.resolve();
      };
      await Promise.all([makeRequest(), delay()]);
    });

    it('if throws will stop requests', async () => {
      filter.and.callFake(() => {
        throw error;
      });
      await expectAsync(
          networkingEngine.request(requestType, createRequest('resolve://foo'))
              .promise)
          .toBeRejected();
      expect(filter).toHaveBeenCalled();
    });

    it('causes no errors to remove an unused filter', () => {
      const unusedFilter = jasmine.createSpy('unused filter');
      networkingEngine.unregisterResponseFilter(Util.spyFunc(unusedFilter));
    });
  });  // describe('response filter')

  describe('destroy', () => {
    it('waits for all operations to complete', async () => {
      const request = createRequest('resolve://foo');
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      resolveScheme.and.returnValue(
          shaka.util.AbortableOperation.notAbortable(p));

      /** @type {!shaka.test.StatusPromise} */
      const r1 = new StatusPromise(
          networkingEngine.request(requestType, request).promise);
      /** @type {!shaka.test.StatusPromise} */
      const r2 = new StatusPromise(
          networkingEngine.request(requestType, request).promise);

      expect(r1.status).toBe('pending');
      expect(r2.status).toBe('pending');
      await Util.shortDelay();

      /** @type {!shaka.test.StatusPromise} */
      const d = new StatusPromise(networkingEngine.destroy());
      expect(d.status).toBe('pending');
      expect(r1.status).toBe('pending');
      expect(r2.status).toBe('pending');
      await Util.shortDelay();

      expect(d.status).toBe('pending');
      p.resolve({});
      await d;
      await Util.shortDelay();

      expect(r1.status).not.toBe('pending');
      expect(r2.status).not.toBe('pending');
      expect(d.status).toBe('resolved');
    });

    it('causes requests to reject if called while filtering', async () => {
      const filter = jasmine.createSpy('request filter');
      networkingEngine.registerRequestFilter(Util.spyFunc(filter));
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      filter.and.returnValue(p);

      const request = createRequest('resolve://foo', {
        maxAttempts: 1,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0,
        stallTimeout: 0,
        connectionTimeout: 0,
      });
      /** @type {!shaka.test.StatusPromise} */
      const r = new StatusPromise(
          networkingEngine.request(requestType, request).promise);
      await Util.shortDelay();

      expect(filter).toHaveBeenCalled();
      expect(r.status).toBe('pending');

      /** @type {!shaka.test.StatusPromise} */
      const d = new StatusPromise(networkingEngine.destroy());
      p.resolve();

      await Util.shortDelay();

      expect(d.status).toBe('resolved');
      expect(r.status).toBe('rejected');
      expect(resolveScheme).not.toHaveBeenCalled();
    });

    it('resolves even when a request fails', async () => {
      const request = createRequest('reject://foo');
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      rejectScheme.and.returnValue(
          shaka.util.AbortableOperation.notAbortable(p));

      /** @type {!shaka.test.StatusPromise} */
      const r1 = new StatusPromise(
          networkingEngine.request(requestType, request).promise);
      /** @type {!shaka.test.StatusPromise} */
      const r2 = new StatusPromise(
          networkingEngine.request(requestType, request).promise);

      expect(r1.status).toBe('pending');
      expect(r2.status).toBe('pending');
      await Util.shortDelay();

      /** @type {!shaka.test.StatusPromise} */
      const d = new StatusPromise(networkingEngine.destroy());
      expect(d.status).toBe('pending');
      await Util.shortDelay();

      expect(d.status).toBe('pending');
      p.reject(error);
      await d;
      await Util.shortDelay();

      expect(r1.status).toBe('rejected');
      expect(r2.status).toBe('rejected');
      expect(d.status).toBe('resolved');
    });

    it('prevents new requests', async () => {
      const request = createRequest('resolve://foo');

      /** @type {!shaka.test.StatusPromise} */
      const d = new StatusPromise(networkingEngine.destroy());
      expect(d.status).toBe('pending');

      /** @type {!shaka.test.StatusPromise} */
      const r = new StatusPromise(
          networkingEngine.request(requestType, request).promise);
      await Util.shortDelay();

      // A new request has not been made.
      expect(resolveScheme).not.toHaveBeenCalled();

      expect(d.status).toBe('resolved');
      expect(r.status).toBe('rejected');
    });

    it('does not allow further retries', async () => {
      const request = createRequest('reject://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0,
        stallTimeout: 0,
        connectionTimeout: 0,
      });

      /** @type {!shaka.util.PublicPromise} */
      const p1 = new shaka.util.PublicPromise();
      /** @type {!shaka.util.PublicPromise} */
      const p2 = new shaka.util.PublicPromise();
      rejectScheme.and.callFake(() => {
        // Return p1 the first time, then p2 the second time.
        return (rejectScheme.calls.count() == 1) ?
            shaka.util.AbortableOperation.notAbortable(p1) :
            shaka.util.AbortableOperation.notAbortable(p2);
      });

      /** @type {!shaka.test.StatusPromise} */
      const r = new StatusPromise(
          networkingEngine.request(requestType, request).promise);
      await Util.shortDelay();

      expect(rejectScheme).toHaveBeenCalledTimes(1);
      /** @type {!shaka.test.StatusPromise} */
      const d = new StatusPromise(networkingEngine.destroy());
      expect(d.status).toBe('pending');
      await Util.shortDelay();

      expect(d.status).toBe('pending');
      expect(rejectScheme).toHaveBeenCalledTimes(1);
      // Reject the initial request.
      p1.reject(error);
      // Resolve any retry, but since we have already been destroyed, this
      // promise should not be used.
      p2.resolve();
      await d;
      await Util.shortDelay();

      expect(d.status).toBe('resolved');
      // The request was never retried.
      expect(r.status).toBe('rejected');
      expect(rejectScheme).toHaveBeenCalledTimes(1);
    });
  });  // describe('destroy')

  it('ignores cache hits', async () => {
    /** @type {!jasmine.Spy} */
    const onSegmentDownloaded = jasmine.createSpy('onSegmentDownloaded');
    networkingEngine =
        new shaka.net.NetworkingEngine(Util.spyFunc(onSegmentDownloaded));

    await networkingEngine.request(requestType, createRequest('resolve://foo'))
        .promise;
    expect(onSegmentDownloaded).toHaveBeenCalled();
    onSegmentDownloaded.calls.reset();

    resolveScheme.and.callFake(() => {
      return shaka.util.AbortableOperation.completed(createResponse());
    });
    await networkingEngine.request(requestType, createRequest('resolve://foo'));

    expect(onSegmentDownloaded).not.toHaveBeenCalled();
  });

  describe('\'retry\' event', () => {
    /** @type {shaka.extern.Request} */
    let request;
    /** @type {jasmine.Spy} */
    let retrySpy;

    beforeEach(() => {
      request = createRequest('reject://foo', {
        maxAttempts: 3,
        baseDelay: 0,
        backoffFactor: 0,
        fuzzFactor: 0,
        timeout: 0,
        stallTimeout: 0,
        connectionTimeout: 0,
      });

      retrySpy = jasmine.createSpy('retry listener');
      networkingEngine.addEventListener('retry', Util.spyFunc(retrySpy));
    });

    it('is called on recoverable error', async () => {
      const error1 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.HTTP_ERROR);
      const error2 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.BAD_HTTP_STATUS);
      const resolve = createResponse();
      rejectScheme.and.callFake(() => {
        switch (rejectScheme.calls.count()) {
          case 1: return shaka.util.AbortableOperation.failed(error1);
          case 2: return shaka.util.AbortableOperation.failed(error2);
          default: return shaka.util.AbortableOperation.completed(resolve);
        }
      });
      await networkingEngine.request(requestType, request).promise;

      expect(retrySpy).toHaveBeenCalledTimes(2);
      if (retrySpy.calls.count() == 2) {
        const event1 = retrySpy.calls.argsFor(0)[0];
        const event2 = retrySpy.calls.argsFor(1)[0];
        expect(event1.error).toBe(error1);
        expect(event2.error).toBe(error2);
      }
    });

    it('is not called on critical errors', async () => {
      error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.HTTP_ERROR);
      await expectAsync(networkingEngine.request(requestType, request).promise)
          .toBeRejected();
      expect(retrySpy).not.toHaveBeenCalled();
    });
  });

  describe('abort', () => {
    /** @type {!shaka.util.Error} */
    let abortError;

    beforeEach(() => {
      abortError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
    });

    it('interrupts request filters', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const filter1Promise = new shaka.util.PublicPromise();
      const filter1Spy = jasmine.createSpy('filter 1')
          .and.returnValue(filter1Promise);
      const filter1 = Util.spyFunc(filter1Spy);
      networkingEngine.registerRequestFilter(filter1);

      /** @type {!shaka.util.PublicPromise} */
      const filter2Promise = new shaka.util.PublicPromise();
      const filter2Spy = jasmine.createSpy('filter 2')
          .and.returnValue(filter2Promise);
      const filter2 = Util.spyFunc(filter2Spy);
      networkingEngine.registerRequestFilter(filter2);

      const request = createRequest('resolve://foo');
      /** @type {!shaka.extern.IAbortableOperation} */
      const operation = networkingEngine.request(requestType, request);
      /** @type {!shaka.test.StatusPromise} */
      const r = new StatusPromise(operation.promise);

      await Util.shortDelay();
      // The first filter has been called, but not the second, and not the
      // scheme plugin.
      expect(filter1Spy).toHaveBeenCalled();
      expect(filter2Spy).not.toHaveBeenCalled();
      expect(resolveScheme).not.toHaveBeenCalled();

      // The operation is still pending.
      expect(r.status).toBe('pending');

      operation.abort();

      filter1Promise.resolve();
      await Util.shortDelay();

      // The second filter has not been called, nor has the scheme plugin.
      // The filter chain was interrupted by abort().
      expect(filter2Spy).not.toHaveBeenCalled();
      expect(resolveScheme).not.toHaveBeenCalled();

      // The operation has been aborted.
      expect(r.status).toBe('rejected');
      await expectAsync(operation.promise)
          .toBeRejectedWith(Util.jasmineError(abortError));
    });

    it('interrupts scheme plugins', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      const abortSpy = jasmine.createSpy('abort');
      const abort = Util.spyFunc(abortSpy);

      resolveScheme.and.returnValue(
          new shaka.util.AbortableOperation(p, abort));
      expect(resolveScheme).not.toHaveBeenCalled();

      const request = createRequest('resolve://foo');
      /** @type {!shaka.extern.IAbortableOperation} */
      const operation = networkingEngine.request(requestType, request);
      /** @type {!shaka.test.StatusPromise} */
      const r = new StatusPromise(operation.promise);

      await Util.shortDelay();
      // A request has been made, but not completed yet.
      expect(resolveScheme).toHaveBeenCalled();
      expect(r.status).toBe('pending');

      expect(abortSpy).not.toHaveBeenCalled();
      await operation.abort();

      expect(abortSpy).toHaveBeenCalled();
      p.resolve();

      // The operation has been aborted.
      expect(r.status).toBe('rejected');
      await expectAsync(operation.promise)
          .toBeRejectedWith(Util.jasmineError(abortError));
    });

    it('interrupts response filters', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const filter1Promise = new shaka.util.PublicPromise();
      const filter1Spy = jasmine.createSpy('filter 1')
          .and.returnValue(filter1Promise);
      const filter1 = Util.spyFunc(filter1Spy);
      networkingEngine.registerResponseFilter(filter1);

      const filter2Promise = new shaka.util.PublicPromise();
      const filter2Spy = jasmine.createSpy('filter 2')
          .and.returnValue(filter2Promise);
      const filter2 = Util.spyFunc(filter2Spy);
      networkingEngine.registerResponseFilter(filter2);

      const request = createRequest('resolve://foo');
      /** @type {!shaka.extern.IAbortableOperation} */
      const operation = networkingEngine.request(requestType, request);
      /** @type {!shaka.test.StatusPromise} */
      const r = new StatusPromise(operation.promise);

      await Util.shortDelay();
      // The scheme plugin has been called, and the first filter has been
      // called, but not the second.
      expect(resolveScheme).toHaveBeenCalled();
      expect(filter1Spy).toHaveBeenCalled();
      expect(filter2Spy).not.toHaveBeenCalled();

      // The operation is still pending.
      expect(r.status).toBe('pending');

      operation.abort();

      filter1Promise.resolve();
      await Util.shortDelay();

      // The second filter has still not been called.
      // The filter chain was interrupted by abort().
      expect(filter2Spy).not.toHaveBeenCalled();

      // The operation has been aborted.
      expect(r.status).toBe('rejected');
      await expectAsync(operation.promise)
          .toBeRejectedWith(Util.jasmineError(abortError));
    });

    it('is called by destroy', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      const abortSpy = jasmine.createSpy('abort');
      const abort = Util.spyFunc(abortSpy);

      resolveScheme.and.returnValue(
          new shaka.util.AbortableOperation(p, abort));
      expect(resolveScheme).not.toHaveBeenCalled();

      const request = createRequest('resolve://foo');
      /** @type {!shaka.extern.IAbortableOperation} */
      const operation = networkingEngine.request(requestType, request);
      /** @type {!shaka.test.StatusPromise} */
      const r = new StatusPromise(operation.promise);

      await Util.shortDelay();
      // A request has been made, but not completed yet.
      expect(resolveScheme).toHaveBeenCalled();
      expect(abortSpy).not.toHaveBeenCalled();
      await networkingEngine.destroy();

      expect(abortSpy).toHaveBeenCalled();
      p.resolve();

      // The operation has been aborted.
      expect(r.status).toBe('rejected');
      await expectAsync(operation.promise)
          .toBeRejectedWith(Util.jasmineError(abortError));
    });
  });

  describe('progress events', () => {
    it('forwards progress events to caller', async () => {
      /** @const {!shaka.util.PublicPromise} */
      const delay = new shaka.util.PublicPromise();
      resolveScheme.and.callFake((uri, req, type, progress) => {
        progress(1, 2, 3);

        const p = (async () => {
          progress(4, 5, 6);
          await delay;
          progress(7, 8, 9);
          return createResponse();
        })();
        return new shaka.util.AbortableOperation(p, () => {});
      });

      /** @const {shaka.net.NetworkingEngine.PendingRequest} */
      const resp = networkingEngine.request(
          requestType, createRequest('resolve://'));
      await Util.shortDelay();  // Allow Promises to resolve.
      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith(1, 2);
      expect(onProgress).toHaveBeenCalledWith(4, 5);
      onProgress.calls.reset();

      delay.resolve();
      await resp.promise;
      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(7, 8);
    });

    it('doesn\'t forward progress events for non-SEGMENT', async () => {
      resolveScheme.and.callFake((uri, req, type, progress) => {
        progress(1, 2, 3);
        progress(4, 5, 6);
        return shaka.util.AbortableOperation.completed(createResponse());
      });

      const resp = networkingEngine.request(
          shaka.net.NetworkingEngine.RequestType.LICENSE,
          createRequest('resolve://'));
      await resp.promise;
      expect(onProgress).not.toHaveBeenCalled();
    });

    it('repports progress even if plugin doesn\'t report it', async () => {
      const resp = networkingEngine.request(
          requestType, createRequest('resolve://'));
      await resp.promise;
      expect(onProgress).toHaveBeenCalled();
    });
  });

  /**
   * @param {string} uri
   * @param {shaka.extern.RetryParameters=} retryParameters
   * @return {shaka.extern.Request}
   */
  function createRequest(uri, retryParameters) {
    retryParameters = retryParameters ||
        shaka.net.NetworkingEngine.defaultRetryParameters();
    return shaka.net.NetworkingEngine.makeRequest([uri], retryParameters);
  }

  describe('createSegmentRequest', () => {
    it('does not add range headers to requests for the whole segment', () => {
      // You had _one_ job, createSegmentRequest!

      const request = shaka.util.Networking.createSegmentRequest(
          /* uris= */ ['/foo.mp4'],
          /* start= */ 0,
          /* end= */ null,
          shaka.net.NetworkingEngine.defaultRetryParameters());

      const keys = Object.keys(request.headers).map((k) => k.toLowerCase());
      expect(keys).not.toContain('range');
    });
  });

  /** @return {shaka.extern.Response} */
  function createResponse() {
    return {
      uri: '',
      originalUri: '',
      data: new ArrayBuffer(5),
      headers: {},
    };
  }
});  // describe('NetworkingEngine')
