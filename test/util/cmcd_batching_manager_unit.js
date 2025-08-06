/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('CmcdBatchingManager', () => {
  const CmcdBatchingManager = shaka.util.CmcdBatchingManager;

  /** @type {!jasmine.Spy} */
  let mockNetworkingEngine;
  /** @type {!jasmine.Spy} */
  let mockRequest;
  /** @type {shaka.util.CmcdBatchingManager.PlayerInterface} */
  let mockPlayerInterface;
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

    // Mock networking engine
    mockRequest = jasmine.createSpy('request').and.returnValue({
      promise: Promise.resolve({
        status: 200,
        headers: {},
        data: new ArrayBuffer(0),
      }),
    });

    const mockEngine = {request: mockRequest};
    mockNetworkingEngine = jasmine.createSpy('getNetworkingEngine')
        .and.returnValue(mockEngine);

    mockPlayerInterface = /** @type {shaka.util.CmcdBatchingManager.PlayerInterface} */ ({
      getNetworkingEngine: () => mockEngine,
    });

    batchingManager = new CmcdBatchingManager(mockPlayerInterface);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    batchingManager.reset();
  });

  describe('addReport', () => {
    it('sends batch report when batch size limit is reached', async () => {
      const target = createMockTarget({batchSize: 2});

      batchingManager.addReport(target, mockCmcdData);
      expect(mockRequest).not.toHaveBeenCalled();

      batchingManager.addReport(target, {v: 2});
      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

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

    it('sends batch report after timer expires', async () => {
      const target = createMockTarget({batchTimer: 1});

      batchingManager.addReport(target, mockCmcdData);
      expect(mockRequest).not.toHaveBeenCalled();

      // Advance time to trigger timer
      jasmine.clock().tick(1001);
      await new Promise((resolve) => setTimeout(resolve, 0));

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

    it('batches multiple reports into single request', async () => {
      const target = createMockTarget({batchSize: 3});

      batchingManager.addReport(target, mockCmcdData);
      batchingManager.addReport(target, {v: 2});
      batchingManager.addReport(target, {v: 3});

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRequest).toHaveBeenCalledTimes(1);
      const requestCall = mockRequest.calls.mostRecent();
      const requestBody = shaka.util.StringUtils.fromUTF8(
          requestCall.args[1].body);

      // Should contain all three reports separated by newlines
      expect(requestBody.split('\n').length).toBe(3);
    });

    it('handles 410 Gone response by not sending future reports', async () => {
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
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRequest).toHaveBeenCalledTimes(1);
      mockRequest.calls.reset();

      // Second report to same URL should not trigger request
      batchingManager.addReport(target, {v: 2});
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('handles 429 Rate Limited response with retry', async () => {
      const target = createMockTarget({batchSize: 1});

      // First request returns 429 Rate Limited
      mockRequest.and.returnValue({
        promise: Promise.resolve({
          status: 429,
          headers: {},
          data: new ArrayBuffer(0),
        }),
      });

      batchingManager.addReport(target, mockCmcdData);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Mock successful retry
      mockRequest.and.returnValue({
        promise: Promise.resolve({
          status: 200,
          headers: {},
          data: new ArrayBuffer(0),
        }),
      });

      // Advance time to trigger retry (first delay is 1000ms)
      jasmine.clock().tick(1001);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Should have made the retry request
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('handles network errors gracefully', async () => {
      const target = createMockTarget({batchSize: 1});

      mockRequest.and.returnValue({
        promise: Promise.reject(new Error('Network error')),
      });

      spyOn(shaka.log, 'warning');

      batchingManager.addReport(target, mockCmcdData);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(shaka.log.warning).toHaveBeenCalledWith(
          'Failed to send CMCD batch report:',
          jasmine.any(Error),
      );
    });

    it('sends separate requests for different URLs', async () => {
      const target1 = createMockTarget({url: 'https://a.com/cmcd', batchSize: 1});
      const target2 = createMockTarget({url: 'https://b.com/cmcd', batchSize: 1});

      batchingManager.addReport(target1, mockCmcdData);
      batchingManager.addReport(target2, mockCmcdData);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRequest).toHaveBeenCalledTimes(2);

      const firstCall = mockRequest.calls.all()[0];
      const secondCall = mockRequest.calls.all()[1];

      expect(firstCall.args[1].uris[0]).toBe('https://a.com/cmcd');
      expect(secondCall.args[1].uris[0]).toBe('https://b.com/cmcd');
    });

    it('sends separate requests for different configurations', async () => {
      const target1 = createMockTarget({batchSize: 1});
      const target2 = createMockTarget({batchSize: 2});

      batchingManager.addReport(target1, mockCmcdData);
      batchingManager.addReport(target2, mockCmcdData);

      await new Promise((resolve) => setTimeout(resolve, 0));

      // First target should send immediately (batchSize: 1)
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('does not send empty batches', async () => {
      createMockTarget({batchTimer: 1});

      // No reports added, just wait for timer
      jasmine.clock().tick(1001);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  describe('flushBatch', () => {
    it('flushes pending batches for specific URL', async () => {
      const url = 'https://example.com/cmcd';
      const target = createMockTarget({url, batchTimer: 1000}); // Long timer

      batchingManager.addReport(target, mockCmcdData);
      expect(mockRequest).not.toHaveBeenCalled();

      batchingManager.flushBatch(url);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRequest).toHaveBeenCalledWith(
          shaka.net.NetworkingEngine.RequestType.CMCD,
          jasmine.objectContaining({
            uris: [url],
          }),
      );
    });

    it('does not affect batches for different URLs', async () => {
      const target1 = createMockTarget({url: 'https://a.com/cmcd', batchTimer: 1000});
      const target2 = createMockTarget({url: 'https://b.com/cmcd', batchTimer: 1000});

      batchingManager.addReport(target1, mockCmcdData);
      batchingManager.addReport(target2, mockCmcdData);

      batchingManager.flushBatch('https://a.com/cmcd');
      await new Promise((resolve) => setTimeout(resolve, 0));

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
    it('cancels pending timers and prevents future reports', async () => {
      const target = createMockTarget({batchTimer: 1000});

      batchingManager.addReport(target, mockCmcdData);
      batchingManager.reset();

      // Timer should not fire after reset
      jasmine.clock().tick(1001);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('clears gone URLs allowing future reports', async () => {
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
      await new Promise((resolve) => setTimeout(resolve, 0));

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
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRequest).toHaveBeenCalled();
    });
  });
});
