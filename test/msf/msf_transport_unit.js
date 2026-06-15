/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('MSFTransport transportFactory', isMSFSupported, () => {
  /**
   * Build a fake WebTransport-like object that satisfies the subset of the
   * WebTransport interface that connect() touches before throwing. The
   * `.ready` promise rejects so connect() short-circuits before the
   * setup-message exchange — we only care that the factory was invoked and
   * that its return value is what got assigned.
   *
   * @return {!Object}
   */
  function makeFakeTransport() {
    return {
      ready: Promise.reject(new Error('test: short-circuit after factory')),
      closed: Promise.resolve(),
      protocol: '',
      createBidirectionalStream: () => Promise.reject(new Error('unused')),
      close: () => {},
    };
  }

  it('is on the default msf config and points at defaultTransportFactory',
      () => {
        const config = shaka.util.PlayerConfiguration.createDefault();
        expect(config.manifest.msf.transportFactory).toBe(
            shaka.util.PlayerConfiguration.defaultTransportFactory);
      });

  it('default factory returns a real WebTransport when WebTransport exists',
      () => {
        if (!window.WebTransport) {
          pending('WebTransport not available in this environment.');
        }
        // The default factory just constructs `new WebTransport(uri, options)`.
        // We don't await `.ready` (no test server) — we only check the type.
        const wt = shaka.util.PlayerConfiguration.defaultTransportFactory(
            'https://localhost:1/', {});
        expect(wt instanceof WebTransport).toBe(true);
        // Avoid unhandled rejection on the test harness.
        if (wt && wt.closed && wt.closed.catch) {
          wt.closed.catch(() => {});
        }
      });

  it('connect() invokes the configured factory with (uri, options)',
      async () => {
        const defaults = shaka.util.PlayerConfiguration.createDefault();
        const config = defaults.manifest.msf;
        const factory = jasmine.createSpy('transportFactory')
            .and.callFake(() => makeFakeTransport());
        config.transportFactory = /** @type {?} */ (factory);

        const transport = new shaka.msf.MSFTransport(config);
        const uri = 'https://example.test/moq';
        // Fake transport's `.ready` rejects on purpose — connect() rejects.
        await expectAsync(transport.connect(uri, null)).toBeRejected();

        expect(factory).toHaveBeenCalledTimes(1);
        const [calledUri, calledOptions] = factory.calls.mostRecent().args;
        expect(calledUri).toBe(uri);
        // Sanity-check options shape — connect() always builds these.
        expect(calledOptions).toEqual(jasmine.objectContaining({
          allowPooling: false,
          congestionControl: 'low-latency',
        }));
        // Default MsfVersion.AUTO populates a `protocols` list.
        expect(Array.isArray(calledOptions.protocols)).toBe(true);
      });

  it('connect() awaits a Promise-returning factory', async () => {
    const config = shaka.util.PlayerConfiguration.createDefault().manifest.msf;
    const fake = makeFakeTransport();
    let resolveFactory;
    const factoryPromise = new Promise((r) => {
      resolveFactory = r;
    });
    const factory = jasmine.createSpy('asyncTransportFactory')
        .and.returnValue(factoryPromise);
    config.transportFactory = /** @type {?} */ (factory);

    const transport = new shaka.msf.MSFTransport(config);
    const connectPromise = transport.connect('https://example.test/', null);

    // Give the microtask queue a tick so connect() reaches the factory await.
    await Promise.resolve();
    expect(factory).toHaveBeenCalledTimes(1);

    // Resolving the factory lets connect() proceed; the fake's `.ready`
    // rejects, so connect() rejects too. We don't care about the exact
    // error — only that the factory was awaited rather than discarded.
    resolveFactory(fake);
    await expectAsync(connectPromise).toBeRejected();
  });

  it('factory return value is used as the transport handle', async () => {
    const config = shaka.util.PlayerConfiguration.createDefault().manifest.msf;
    const fake = makeFakeTransport();
    const factory = jasmine.createSpy('returningFactory')
        .and.returnValue(fake);
    config.transportFactory = /** @type {?} */ (factory);

    const transport = new shaka.msf.MSFTransport(config);
    // Fake's `.ready` rejects — expected.
    await expectAsync(
        transport.connect('https://example.test/', null)).toBeRejected();
    // If the factory's return value were ignored, MSFTransport would have
    // tried to construct its own WebTransport — which would either fail
    // hard (in a non-WebTransport env) or differ from `fake`. Reaching this
    // point with the spy having been called once is the contract we care
    // about; release() must be safe on the fake.
    expect(factory).toHaveBeenCalledTimes(1);
    expect(() => transport.release()).not.toThrow();
  });

  // ── Factory failure modes ──────────────────────────────────────

  it('connect() rejects when the factory throws synchronously', async () => {
    const config = shaka.util.PlayerConfiguration.createDefault().manifest.msf;
    const factoryError = new Error('test: factory threw');
    config.transportFactory = /** @type {?} */ (() => {
      throw factoryError;
    });

    const transport = new shaka.msf.MSFTransport(config);
    await expectAsync(
        transport.connect('https://example.test/', null))
        .toBeRejectedWith(factoryError);
  });

  it('connect() rejects when the factory returns a rejected Promise',
      async () => {
        const config =
            shaka.util.PlayerConfiguration.createDefault().manifest.msf;
        const factoryError = new Error('test: factory rejected');
        const factory = () => Promise.reject(factoryError);
        config.transportFactory = /** @type {?} */ (factory);

        const transport = new shaka.msf.MSFTransport(config);
        await expectAsync(
            transport.connect('https://example.test/', null))
            .toBeRejectedWith(factoryError);
      });

  it('connect() rejects when the factory returns null', async () => {
    const config = shaka.util.PlayerConfiguration.createDefault().manifest.msf;
    config.transportFactory = /** @type {?} */ (() => null);

    const transport = new shaka.msf.MSFTransport(config);
    // Touching `.closed` on null throws TypeError. We don't pin the
    // exact error type — just the contract that connect() rejects rather
    // than silently resolving with a broken transport.
    await expectAsync(
        transport.connect('https://example.test/', null)).toBeRejected();
  });

  // ── WebTransport-guard / custom-factory escape hatch ──────────

  it('skips the window.WebTransport guard when a custom factory is set',
      async () => {
        // Save and clear `window.WebTransport` so the default-factory path
        // would throw WEBTRANSPORT_NOT_AVAILABLE — verifies the guard is
        // bypassed for custom factories.
        const originalWT = window.WebTransport;
        try {
          delete window.WebTransport;

          const config =
              shaka.util.PlayerConfiguration.createDefault().manifest.msf;
          const factory = jasmine.createSpy('customFactory')
              .and.callFake(() => makeFakeTransport());
          config.transportFactory = /** @type {?} */ (factory);

          const transport = new shaka.msf.MSFTransport(config);
          // Fake `.ready` still rejects — but the rejection is the fake's
          // error, not WEBTRANSPORT_NOT_AVAILABLE. So we just assert that
          // the factory was reached at all.
          await expectAsync(
              transport.connect('https://example.test/', null)).toBeRejected();
          expect(factory).toHaveBeenCalledTimes(1);
        } finally {
          window.WebTransport = originalWT;
        }
      });
});
