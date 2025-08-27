/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('CmcdBatchingManager', () => {
  const CmcdBatchingManager = shaka.util.CmcdBatchingManager;

  /** @type {!jasmine.Spy} */
  let mockRequest;
  /** @type {!jasmine.Spy} */
  let mockDateNow;
  /** @type {shaka.Player} */
  let mockPlayer;
  /** @type {shaka.util.CmcdBatchingManager} */
  let batchingManager;

  // Mock CMCD data for testing
  const mockCmcdData = {
    sid: 'test-session-id',
    cid: 'test-content-id',
    v: 1,
    br: 1000,
    d: 4000,
    ot: 'v',
  };

  // Mock target configurations
  const createMockTarget = (overrides = {}) => {
    return Object.assign({
      url: 'https://example.com/cmcd',
      mode: 'response',
      batchSize: null,
      batchTimer: null,
    }, overrides);
  };

  beforeEach(() => {
    jasmine.clock().install();
    // Mock Date.now to work with fake clock
    mockDateNow = spyOn(Date, 'now').and.returnValue(0);

    // Mock networking engine
    mockRequest = jasmine.createSpy('request').and.returnValue({
      promise: Promise.resolve({
        status: 200,
        headers: {},
        data: new ArrayBuffer(0),
      }),
    });

    const mockEngine = /** @type {shaka.net.NetworkingEngine} */ (
      {request: mockRequest});

    mockPlayer =
      /** @type {shaka.Player} */ ({
        getNetworkingEngine: () => mockEngine,
      });

    batchingManager = new CmcdBatchingManager(mockPlayer);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    batchingManager.reset();
  });

  describe('addReport', () => {
    it('sends batch report when batch size limit is reached', () => {
      const target = createMockTarget({batchSize: 2});

      batchingManager.addReport(target, mockCmcdData);
      expect(mockRequest).not.toHaveBeenCalled();

      batchingManager.addReport(target, {v: 2});

      expect(mockRequest).toHaveBeenCalledWith(
          shaka.net.NetworkingEngine.RequestType.CMCD,
          jasmine.objectContaining({
            uris: [target.url],
            method: 'POST',
            body: jasmine.any(ArrayBuffer),
            headers: jasmine.objectContaining({
              'Content-Type': 'application/cmcd+json',
            }),
          }),
      );
    });

    it('sends batch report after timer expires', () => {
      const target = createMockTarget({batchTimer: 1});

      batchingManager.addReport(target, mockCmcdData);
      expect(mockRequest).not.toHaveBeenCalled();

      // Advance time to trigger timer
      jasmine.clock().tick(1001);

      expect(mockRequest).toHaveBeenCalledWith(
          shaka.net.NetworkingEngine.RequestType.CMCD,
          jasmine.objectContaining({
            uris: [target.url],
            method: 'POST',
            body: jasmine.any(ArrayBuffer),
            headers: jasmine.objectContaining({
              'Content-Type': 'application/cmcd+json',
            }),
          }),
      );
    });

    it('batches multiple reports into single request', () => {
      const target = createMockTarget({batchSize: 3});

      batchingManager.addReport(target, mockCmcdData);
      batchingManager.addReport(target, {v: 2});
      batchingManager.addReport(target, {v: 3});

      expect(mockRequest).toHaveBeenCalledTimes(1);
      const requestCall = mockRequest.calls.mostRecent();
      const requestBody = shaka.util.StringUtils.fromUTF8(
          requestCall.args[1].body);

      // Should contain all three reports separated by newlines
      expect(requestBody.split('\n').length).toBe(3);
    });

    it('handles 410 Gone response by not sending future reports', async () => {
      const target = createMockTarget({batchSize: 1});

      // Create a promise we can control
      let resolvePromise;
      const controlledPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      // First request returns 410 Gone
      mockRequest.and.returnValue({
        promise: controlledPromise,
      });

      batchingManager.addReport(target, mockCmcdData);

      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Now resolve the promise with 410 status
      resolvePromise({
        status: 410,
        headers: {},
        data: new ArrayBuffer(0),
      });

      // Wait for the promise and the .then() callback to execute
      await controlledPromise;
      await Promise.resolve(); // Wait for microtask queue to process

      mockRequest.calls.reset();

      // Second report to same URL should not trigger request
      batchingManager.addReport(target, {v: 2});

      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('handles 429 Rate Limited response with retry', async () => {
      const target = createMockTarget({batchSize: 1});

      // Create a promise we can control for the 429 response
      let resolve429Promise;
      const controlled429Promise = new Promise((resolve) => {
        resolve429Promise = resolve;
      });

      // First request returns 429 Rate Limited
      mockRequest.and.returnValue({
        promise: controlled429Promise,
      });

      batchingManager.addReport(target, mockCmcdData);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Now resolve the promise with 429 status
      resolve429Promise({
        status: 429,
        headers: {},
        data: new ArrayBuffer(0),
      });

      // Wait for the promise and the .then() callback to execute
      await controlled429Promise;
      await Promise.resolve(); // Wait for microtask queue to process

      // Mock successful retry
      mockRequest.and.returnValue({
        promise: Promise.resolve({
          status: 200,
          headers: {},
          data: new ArrayBuffer(0),
        }),
      });

      // Advance time to trigger retry (first delay is 100ms)
      mockDateNow.and.returnValue(101); // Advance Date.now to match
      jasmine.clock().tick(101);

      // Wait for the retry timer callback to execute
      await Promise.resolve();

      // Should have made the retry request
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('handles network errors gracefully', async () => {
      const target = createMockTarget({batchSize: 1});

      // Create a promise we can control for the network error
      let rejectErrorPromise;
      const controlledErrorPromise = new Promise((_resolve, reject) => {
        rejectErrorPromise = reject;
      });

      mockRequest.and.returnValue({
        promise: controlledErrorPromise,
      });

      spyOn(shaka.log, 'warning');

      batchingManager.addReport(target, mockCmcdData);

      // Now reject the promise with a network error
      const networkError = new Error('Network error');
      rejectErrorPromise(networkError);

      // Wait for the promise rejection to be handled
      await expectAsync(controlledErrorPromise).toBeRejected();
      await Promise.resolve(); // Wait for microtask queue to process

      expect(shaka.log.warning).toHaveBeenCalledWith(
          'Failed to send CMCD batch report:',
          networkError,
      );
    });

    it('sends separate requests for different URLs', () => {
      const target1 = createMockTarget({url: 'https://a.com/cmcd', batchSize: 1});
      const target2 = createMockTarget({url: 'https://b.com/cmcd', batchSize: 1});

      batchingManager.addReport(target1, mockCmcdData);
      batchingManager.addReport(target2, mockCmcdData);

      expect(mockRequest).toHaveBeenCalledTimes(2);

      const firstCall = mockRequest.calls.all()[0];
      const secondCall = mockRequest.calls.all()[1];

      expect(firstCall.args[1].uris[0]).toBe('https://a.com/cmcd');
      expect(secondCall.args[1].uris[0]).toBe('https://b.com/cmcd');
    });

    it('sends separate requests for different configurations', () => {
      const target1 = createMockTarget({batchSize: 1});
      const target2 = createMockTarget({batchSize: 2});

      batchingManager.addReport(target1, mockCmcdData);
      batchingManager.addReport(target2, mockCmcdData);

      // First target should send immediately (batchSize: 1)
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('does not send empty batches', () => {
      createMockTarget({batchTimer: 1});

      // No reports added, just wait for timer
      jasmine.clock().tick(1001);

      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  describe('flushBatch', () => {
    it('flushes pending batches for specific URL', () => {
      const url = 'https://example.com/cmcd';
      const target = createMockTarget({url, batchTimer: 10}); // Long timer

      batchingManager.addReport(target, mockCmcdData);
      expect(mockRequest).not.toHaveBeenCalled();

      batchingManager.flushBatch(url);

      expect(mockRequest).toHaveBeenCalledWith(
          shaka.net.NetworkingEngine.RequestType.CMCD,
          jasmine.objectContaining({
            uris: [url],
          }),
      );
    });

    it('does not affect batches for different URLs', () => {
      const target1 = createMockTarget({url: 'https://a.com/cmcd', batchTimer: 1});
      const target2 = createMockTarget({url: 'https://b.com/cmcd', batchTimer: 1});

      batchingManager.addReport(target1, mockCmcdData);
      batchingManager.addReport(target2, mockCmcdData);

      batchingManager.flushBatch('https://a.com/cmcd');

      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(mockRequest.calls.mostRecent().args[1].uris[0]).toBe('https://a.com/cmcd');
    });

    it('handles non-existent URLs gracefully', () => {
      expect(() => {
        batchingManager.flushBatch('https://nonexistent.com');
      }).not.toThrow();
    });
  });

  describe('reset', () => {
    it('cancels pending timers and prevents future reports', () => {
      const target = createMockTarget({batchTimer: 1});

      batchingManager.addReport(target, mockCmcdData);
      batchingManager.reset();

      // Timer should not fire after reset
      jasmine.clock().tick(1001);

      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('clears gone URLs allowing future reports', () => {
      const target = createMockTarget({batchSize: 1});

      // First request returns 410 Gone
      mockRequest.and.returnValue({
        promise: Promise.resolve({
          status: 410,
          headers: {},
          data: new ArrayBuffer(0),
        }),
      });

      batchingManager.addReport(target, mockCmcdData);
      // Reset should clear the gone URLs
      batchingManager.reset();

      // Mock successful response
      mockRequest.and.returnValue({
        promise: Promise.resolve({
          status: 200,
          headers: {},
          data: new ArrayBuffer(0),
        }),
      });

      mockRequest.calls.reset();

      // Should now allow reports to the previously gone URL
      batchingManager.addReport(target, {v: 2});
      expect(mockRequest).toHaveBeenCalled();
    });
  });
});
