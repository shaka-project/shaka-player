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

    mockNetworkingEngine = jasmine.createSpy('getNetworkingEngine')
        .and.returnValue({
          request: mockRequest,
        });

    mockPlayerInterface = {
      getNetworkingEngine: mockNetworkingEngine,
    };

    batchingManager = new CmcdBatchingManager(mockPlayerInterface);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    batchingManager.reset();
  });

  describe('Constructor', () => {
    it('initializes with empty state', () => {
      expect(batchingManager.batches_).toEqual(new Map());
      expect(batchingManager.timers_).toEqual(new Map());
      expect(batchingManager.retryQueue_).toEqual([]);
      expect(batchingManager.retryTimers_).toEqual(new Map());
      expect(batchingManager.goneUrls_).toEqual(new Set());
    });
  });

  describe('addReport', () => {
    it('creates a new batch for a new target', () => {
      const target = createMockTarget();
      batchingManager.addReport(target, mockCmcdData);

      expect(batchingManager.batches_.size).toBe(1);
      const batch = batchingManager.batches_.values().next().value;
      expect(batch.target).toBe(target);
      expect(batch.cmcdData).toContain('sid%3D%22test-session-id%22');
    });

    it('appends data to existing batch', () => {
      const target = createMockTarget();
      batchingManager.addReport(target, mockCmcdData);
      batchingManager.addReport(target, {sid: 'test-2'});

      expect(batchingManager.batches_.size).toBe(1);
      const batch = batchingManager.batches_.values().next().value;
      expect(batch.cmcdData.split('\n').length).toBe(2);
    });

    it('ignores reports for URLs marked as gone (410)', () => {
      const target = createMockTarget();
      batchingManager.goneUrls_.add(target.url);
      batchingManager.addReport(target, mockCmcdData);

      expect(batchingManager.batches_.size).toBe(0);
    });

    it('sets up batch timer when configured', async () => {
      const target = createMockTarget({batchTimer: 5});
      const flushSpy = spyOn(batchingManager, 'flushByTargetKey_')
          .and.callThrough();

      batchingManager.addReport(target, mockCmcdData);

      expect(batchingManager.timers_.size).toBe(1);

      jasmine.clock().tick(5001);
      await flushSpy;

      expect(batchingManager.flushByTargetKey_).toHaveBeenCalled();
    });

    it('flushes batch when size limit is reached', () => {
      const target = createMockTarget({batchSize: 2});
      spyOn(batchingManager, 'flushByTargetKey_');

      batchingManager.addReport(target, mockCmcdData);
      expect(batchingManager.flushByTargetKey_).not.toHaveBeenCalled();

      batchingManager.addReport(target, {v: 2});
      expect(batchingManager.flushByTargetKey_).toHaveBeenCalled();
    });

    it('does not set up multiple timers for same target', () => {
      const target = createMockTarget({batchTimer: 1000});

      batchingManager.addReport(target, mockCmcdData);
      batchingManager.addReport(target, {v: 2});

      expect(batchingManager.timers_.size).toBe(1);
    });
  });

  describe('flushBatch', () => {
    it('flushes all batches for a specific URL', () => {
      const url = 'https://example.com/cmcd';
      const target1 = createMockTarget({url});
      const target2 = createMockTarget({url, batchSize: 10});
      const target3 = createMockTarget({url: 'https://other.com/cmcd'});

      spyOn(batchingManager, 'flushByTargetKey_');

      batchingManager.addReport(target1, mockCmcdData);
      batchingManager.addReport(target2, mockCmcdData);
      batchingManager.addReport(target3, mockCmcdData);

      batchingManager.flushBatch(url);

      expect(batchingManager.flushByTargetKey_).toHaveBeenCalledTimes(2);
    });

    it('handles non-existent URLs gracefully', () => {
      expect(() => {
        batchingManager.flushBatch('https://nonexistent.com');
      }).not.toThrow();
    });
  });

  describe('reset', () => {
    it('clears all state and stops timers', () => {
      const target = createMockTarget({batchTimer: 1000});
      batchingManager.addReport(target, mockCmcdData);

      // Add to retry queue
      batchingManager.retryQueue_.push({
        request: {},
        retryCount: 0,
        sendTime: Date.now() + 1000,
      });

      batchingManager.goneUrls_.add('https://gone.com');

      const timerSpy = jasmine.createSpy('stop');
      batchingManager.timers_.set('test', {stop: timerSpy});
      batchingManager.retryTimers_.set('retry', {stop: timerSpy});

      batchingManager.reset();

      expect(batchingManager.batches_.size).toBe(0);
      expect(batchingManager.timers_.size).toBe(0);
      expect(batchingManager.retryQueue_).toEqual([]);
      expect(batchingManager.retryTimers_.size).toBe(0);
      expect(batchingManager.goneUrls_.size).toBe(0);
      expect(timerSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateTargetKey_', () => {
    it('generates unique keys for different targets', () => {
      const target1 = createMockTarget({url: 'https://a.com'});
      const target2 = createMockTarget({url: 'https://b.com'});
      const target3 = createMockTarget({url: 'https://a.com', batchSize: 10});

      const key1 = batchingManager.generateTargetKey_(target1);
      const key2 = batchingManager.generateTargetKey_(target2);
      const key3 = batchingManager.generateTargetKey_(target3);

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });

    it('generates same key for identical targets', () => {
      const target1 = createMockTarget({url: 'https://a.com', batchSize: 5});
      const target2 = createMockTarget({url: 'https://a.com', batchSize: 5});

      const key1 = batchingManager.generateTargetKey_(target1);
      const key2 = batchingManager.generateTargetKey_(target2);

      expect(key1).toBe(key2);
    });
  });

  describe('flushByTargetKey_', () => {
    it('does nothing for non-existent keys', () => {
      expect(() => {
        batchingManager.flushByTargetKey_('non-existent');
      }).not.toThrow();

      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('does nothing for empty batches', () => {
      const target = createMockTarget();
      const key = batchingManager.generateTargetKey_(target);
      batchingManager.batches_.set(key, {
        cmcdData: '',
        target: target,
      });

      batchingManager.flushByTargetKey_(key);

      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('sends batch report and clears data', async () => {
      const target = createMockTarget();
      batchingManager.addReport(target, mockCmcdData);

      const key = batchingManager.generateTargetKey_(target);
      await batchingManager.flushByTargetKey_(key);

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

      // Check that batch data is cleared
      const batch = batchingManager.batches_.get(key);
      expect(batch.cmcdData).toBe('');
    });

    it('stops and removes timer after flushing', async () => {
      const target = createMockTarget({batchTimer: 1000});
      batchingManager.addReport(target, mockCmcdData);

      const key = batchingManager.generateTargetKey_(target);
      const timer = batchingManager.timers_.get(key);
      spyOn(timer, 'stop');

      await batchingManager.flushByTargetKey_(key);

      expect(timer.stop).toHaveBeenCalled();
      expect(batchingManager.timers_.has(key)).toBe(false);
    });

    it('handles 410 Gone response', async () => {
      const target = createMockTarget();
      mockRequest.and.returnValue({
        promise: Promise.resolve({
          status: 410,
          headers: {},
          data: new ArrayBuffer(0),
        }),
      });

      batchingManager.addReport(target, mockCmcdData);
      const key = batchingManager.generateTargetKey_(target);

      await batchingManager.flushByTargetKey_(key);

      expect(batchingManager.goneUrls_.has(target.url)).toBe(true);
    });

    it('handles 429 Rate Limited response', async () => {
      const target = createMockTarget();
      mockRequest.and.returnValue({
        promise: Promise.resolve({
          status: 429,
          headers: {},
          data: new ArrayBuffer(0),
        }),
      });

      batchingManager.addReport(target, mockCmcdData);
      const key = batchingManager.generateTargetKey_(target);

      await batchingManager.flushByTargetKey_(key);

      expect(batchingManager.retryQueue_.length).toBe(1);
      expect(batchingManager.retryTimers_.has('retry')).toBe(true);
    });

    it('handles network errors gracefully', async () => {
      const target = createMockTarget();
      mockRequest.and.returnValue({
        promise: Promise.reject(new Error('Network error')),
      });

      spyOn(shaka.log, 'warning');

      batchingManager.addReport(target, mockCmcdData);
      const key = batchingManager.generateTargetKey_(target);

      await batchingManager.flushByTargetKey_(key);

      expect(shaka.log.warning).toHaveBeenCalledWith(
          'Failed to send CMCD batch report:',
          jasmine.any(Error),
      );
    });
  });

  describe('sendBatchReport_', () => {
    it('makes network request with correct parameters', async () => {
      const request = {
        uris: ['https://example.com/cmcd'],
        method: 'POST',
        headers: {'Content-Type': 'application/cmcd+json'},
        body: new Uint8Array([1, 2, 3]),
      };

      await batchingManager.sendBatchReport_(request);

      expect(mockRequest).toHaveBeenCalledWith(
          shaka.net.NetworkingEngine.RequestType.CMCD,
          request,
      );
    });

    it('returns response on success', async () => {
      const mockResponse = {status: 200, data: new ArrayBuffer(0)};
      mockRequest.and.returnValue({promise: Promise.resolve(mockResponse)});

      const request = {uris: ['https://example.com/cmcd']};
      const response = await batchingManager.sendBatchReport_(request);

      expect(response).toBe(mockResponse);
    });

    it('returns error response when available', async () => {
      const errorResponse = {status: 500, data: new ArrayBuffer(0)};
      const error = new Error('Network error');
      error.response = errorResponse;
      mockRequest.and.returnValue({promise: Promise.reject(error)});

      const request = {uris: ['https://example.com/cmcd']};
      const response = await batchingManager.sendBatchReport_(request);

      expect(response).toBe(errorResponse);
    });

    it('re-throws error when no response available', async () => {
      const error = new Error('Network error');
      mockRequest.and.returnValue({promise: Promise.reject(error)});

      const request = {uris: ['https://example.com/cmcd']};

      await expectAsync(batchingManager.sendBatchReport_(request))
          .toBeRejectedWith(error);
    });
  });

  describe('processRetryQueue_', () => {
    beforeEach(() => {
      spyOn(batchingManager, 'sendBatchReport_').and.returnValue(
          Promise.resolve({status: 200}),
      );
    });

    it('processes reports ready for retry', async () => {
      const pastTime = Date.now() - 1000;
      const futureTime = Date.now() + 1000;

      batchingManager.retryQueue_ = [
        {request: {uris: ['https://a.com']}, retryCount: 0, sendTime: pastTime},
        {request: {uris: ['https://b.com']}, retryCount: 0, sendTime: futureTime},
        {request: {uris: ['https://c.com']}, retryCount: 0, sendTime: pastTime},
      ];

      await batchingManager.processRetryQueue_();

      expect(batchingManager.sendBatchReport_).toHaveBeenCalledTimes(2);
      expect(batchingManager.retryQueue_.length).toBe(1);
      expect(batchingManager.retryQueue_[0].sendTime).toBe(futureTime);
    });

    it('adds failed requests back to retry queue', async () => {
      batchingManager.sendBatchReport_.and.returnValue(
          Promise.resolve({status: 429}),
      );

      batchingManager.retryQueue_ = [
        {request: {uris: ['https://a.com']}, retryCount: 0, sendTime: Date.now() - 1000},
      ];

      await batchingManager.processRetryQueue_();

      const retryQueueElement = batchingManager.retryQueue_[0];
      expect(batchingManager.retryQueue_.length).toBe(1);
      expect(retryQueueElement.retryCount).toBe(1);
      expect(retryQueueElement.sendTime).toBeGreaterThan(Date.now());
    });

    it('handles 410 responses by marking URLs as gone', async () => {
      batchingManager.sendBatchReport_.and.returnValue(
          Promise.resolve({status: 410}),
      );

      const testUrl = 'https://gone.com';
      batchingManager.retryQueue_ = [
        {
          request: {uris: [testUrl]},
          retryCount: 0,
          sendTime: Date.now() - 1000,
        },
      ];

      await batchingManager.processRetryQueue_();

      expect(batchingManager.goneUrls_.has(testUrl)).toBe(true);
      expect(batchingManager.retryQueue_.length).toBe(0);
    });

    it('discards requests that exceed max retry count', async () => {
      batchingManager.sendBatchReport_.and.returnValue(
          Promise.resolve({status: 429}),
      );

      const maxRetries = batchingManager.retryDelays_.length;
      batchingManager.retryQueue_ = [
        {
          request: {uris: ['https://a.com']},
          retryCount: maxRetries - 1,
          sendTime: Date.now() - 1000,
        },
      ];

      await batchingManager.processRetryQueue_();

      expect(batchingManager.retryQueue_.length).toBe(0);
    });

    it('sets up timer for next retry batch', async () => {
      const futureTime = Date.now() + 5000;
      batchingManager.retryQueue_ = [
        {request: {uris: ['https://a.com']}, retryCount: 0, sendTime: futureTime},
      ];

      await batchingManager.processRetryQueue_();

      expect(batchingManager.retryTimers_.has('retry')).toBe(true);
    });

    it('handles sendBatchReport errors gracefully', async () => {
      batchingManager.sendBatchReport_.and.returnValue(
          Promise.reject(new Error('Send failed')),
      );

      spyOn(shaka.log, 'warning');

      batchingManager.retryQueue_ = [
        {request: {uris: ['https://a.com']}, retryCount: 0, sendTime: Date.now() - 1000},
      ];

      await batchingManager.processRetryQueue_();

      expect(shaka.log.warning).toHaveBeenCalledWith(
          'Retry attempt failed for CMCD batch:',
          jasmine.any(Error),
      );
    });

    it('stops existing retry timer before setting new one', async () => {
      const oldTimer = {stop: jasmine.createSpy('stop')};
      batchingManager.retryTimers_.set('retry', oldTimer);

      const futureTime = Date.now() + 1000;
      batchingManager.retryQueue_ = [
        {request: {uris: ['https://a.com']}, retryCount: 0, sendTime: futureTime},
      ];

      await batchingManager.processRetryQueue_();

      expect(oldTimer.stop).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('handles complete batch lifecycle with timer', async () => {
      const target = createMockTarget({
        batchTimer: 1,
        batchSize: 3,
      });

      const flushSpy = spyOn(batchingManager, 'flushByTargetKey_')
          .and.callThrough();

      // Add reports but don't reach batch size
      batchingManager.addReport(target, mockCmcdData);
      batchingManager.addReport(target, {v: 2});

      expect(mockRequest).not.toHaveBeenCalled();

      // Trigger timer
      jasmine.clock().tick(1001);
      await flushSpy;

      expect(mockRequest).toHaveBeenCalled();
    });

    it('handles batch size limit before timer', () => {
      const target = createMockTarget({
        batchTimer: 1,
        batchSize: 2,
      });

      spyOn(batchingManager, 'flushByTargetKey_');

      batchingManager.addReport(target, mockCmcdData);
      expect(batchingManager.flushByTargetKey_).not.toHaveBeenCalled();

      batchingManager.addReport(target, {v: 2});
      expect(batchingManager.flushByTargetKey_).toHaveBeenCalled();
    });

    it('handles retry with exponential backoff', async () => {
      // First request fails with 429
      mockRequest.and.returnValue({
        promise: Promise.resolve({status: 429}),
      });

      const target = createMockTarget();
      batchingManager.addReport(target, mockCmcdData);

      const key = batchingManager.generateTargetKey_(target);
      await batchingManager.flushByTargetKey_(key);

      expect(batchingManager.retryQueue_.length).toBe(1);

      // Mock successful retry
      mockRequest.and.returnValue({
        promise: Promise.resolve({status: 200}),
      });

      const processRetryQueueSpy = spyOn(batchingManager, 'processRetryQueue_')
          .and.callThrough();

      // Process retry queue
      jasmine.clock().tick(batchingManager.retryDelays_[0] + 1);
      await processRetryQueueSpy;

      expect(batchingManager.retryQueue_.length).toBe(0);
    });
  });
});
