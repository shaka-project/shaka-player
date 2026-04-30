/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TransmuxerProxy', () => {
  const TransmuxerProxy = shaka.transmuxer.TransmuxerProxy;

  let mockInner;

  /** @type {!shaka.transmuxer.TransmuxerProxy} */
  let transmuxer;

  /** @type {string} */
  const originalUncompiledWorkerUrl = getUncompiledWorkerUrl();

  /** @type {!shaka.extern.Stream} */
  let fakeStream;

  /** @type {!Uint8Array} */
  let fakeData;

  beforeEach(() => {
    mockInner = jasmine.createSpyObj('innerTransmuxer', [
      'destroy',
      'isSupported',
      'convertCodecs',
      'getOriginalMimeType',
      'transmux',
    ]);
    mockInner.getOriginalMimeType.and.returnValue('video/mp2t');
    mockInner.isSupported.and.returnValue(true);
    mockInner.convertCodecs.and.returnValue('video/mp4; codecs="avc1.42E01E"');
    mockInner.transmux.and.returnValue(
        Promise.resolve(new Uint8Array([1, 2, 3])));

    fakeStream = /** @type {!shaka.extern.Stream} */({
      id: 1,
      codecs: 'avc1.42E01E',
      channelsCount: null,
      audioSamplingRate: null,
      height: null,
      width: null,
      language: 'en',
    });

    fakeData = new Uint8Array([0xAB, 0xCD, 0xEF]);
    transmuxer = new TransmuxerProxy(mockInner);
  });

  afterEach(() => {
    transmuxer.destroy();
    setUncompiledWorkerUrl(originalUncompiledWorkerUrl);
    resetClassState();
  });

  describe('sync methods delegate to inner transmuxer', () => {
    it('isSupported delegates', () => {
      expect(transmuxer.isSupported('video/mp2t', 'video')).toBe(true);
      expect(mockInner.isSupported).toHaveBeenCalledWith('video/mp2t', 'video');
    });

    it('convertCodecs delegates', () => {
      const result = transmuxer.convertCodecs('video', 'video/mp2t');
      expect(result).toBe('video/mp4; codecs="avc1.42E01E"');
      expect(mockInner.convertCodecs)
          .toHaveBeenCalledWith('video', 'video/mp2t');
    });

    it('getOriginalMimeType delegates', () => {
      expect(transmuxer.getOriginalMimeType()).toBe('video/mp2t');
      expect(mockInner.getOriginalMimeType).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('calls destroy on inner transmuxer', () => {
      transmuxer.destroy();
      expect(mockInner.destroy).toHaveBeenCalled();
    });
  });

  describe('fallback to main thread', () => {
    it('falls back when uncompiledWorkerUrl_ is empty', async () => {
      setUncompiledWorkerUrl('');
      const result = await transmuxer.transmux(
          fakeData, fakeStream, null, 10, 'video');
      expect(mockInner.transmux).toHaveBeenCalled();
      expect(result).toEqual(jasmine.any(Uint8Array));
    });

    it('falls back when device does not support worker transmux', async () => {
      const device = shaka.device.DeviceFactory.getDevice();
      spyOn(device, 'supportsWorkerTransmux').and.returnValue(false);
      setUncompiledWorkerUrl('http://fake/shaka.js');

      const result = await transmuxer.transmux(
          fakeData, fakeStream, null, 10, 'video');
      expect(mockInner.transmux).toHaveBeenCalled();
      expect(result).toEqual(jasmine.any(Uint8Array));
    });

    it('continues falling back after first failure', async () => {
      setUncompiledWorkerUrl('');
      await transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
      await transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
      expect(mockInner.transmux).toHaveBeenCalledTimes(2);
    });
  });

  describe('worker path', () => {
    /** @type {?Function} */
    let capturedMessageHandler;

    /** @type {?Function} */
    let capturedErrorHandler;

    let mockWorker;

    /** @type {?Function} */
    let originalWorkerClass;

    beforeEach(() => {
      setUncompiledWorkerUrl('http://fake/shaka.js');

      capturedMessageHandler = null;
      capturedErrorHandler = null;

      mockWorker = {
        postMessage: jasmine.createSpy('postMessage'),
        terminate: jasmine.createSpy('terminate'),
        addEventListener: jasmine.createSpy('addEventListener')
            .and.callFake((type, handler) => {
              if (type === 'message') {
                capturedMessageHandler = handler;
              } else if (type === 'error') {
                capturedErrorHandler = handler;
              }
            }),
      };

      // Replace the Worker constructor so getOrCreateWorker_() returns our
      // mock. We do this by replacing the global and restoring in afterEach.
      originalWorkerClass = window['Worker'];
      window['Worker'] = /** @type {?} */(class {
        constructor() {
          return /** @type {?} */(mockWorker);
        }
      });
    });

    afterEach(() => {
      window['Worker'] = originalWorkerClass;
    });

    /**
     * Simulates the worker sending a 'transmuxed' response.
     * @param {number} id The instance id to route to.
     * @param {number} reqId
     * @param {!ArrayBuffer} outputBuffer
     * @param {Object=} streamMutations
     */
    const simulateTransmuxed = (id, reqId, outputBuffer, streamMutations) => {
      const msg = {
        'cmd': 'transmuxed',
        'id': id,
        'reqId': reqId,
        'output': {'type': 'raw', 'data': outputBuffer},
        'streamMutations': streamMutations || null,
      };
      capturedMessageHandler(/** @type {!MessageEvent} */({data: msg}));
    };

    it('sends init message on first transmux', async () => {
      const id = getInstanceId(transmuxer);
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
      simulateTransmuxed(id, 0, new ArrayBuffer(3));
      await p;

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
          jasmine.objectContaining({'cmd': 'init', 'mimeType': 'video/mp2t'}));
    });

    it('sends init message only once for multiple calls', async () => {
      const id = getInstanceId(transmuxer);
      const p1 = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
      simulateTransmuxed(id, 0, new ArrayBuffer(3));
      await p1;

      const p2 = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
      simulateTransmuxed(id, 1, new ArrayBuffer(3));
      await p2;

      const initCalls = mockWorker.postMessage.calls.all()
          .filter((c) => c.args[0]['cmd'] === 'init');
      expect(initCalls.length).toBe(1);
    });

    it('sends transmux message with correct props', async () => {
      const id = getInstanceId(transmuxer);
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
      simulateTransmuxed(id, 0, new ArrayBuffer(3));
      await p;

      const call = mockWorker.postMessage.calls.all()
          .find((c) => c.args[0]['cmd'] === 'transmux');
      expect(call).toBeTruthy();
      expect(call.args[0]['duration']).toBe(10);
      expect(call.args[0]['contentType']).toBe('video');
      expect(call.args[0]['streamProps']['id']).toBe(1);
      expect(call.args[0]['streamProps']['codecs']).toBe('avc1.42E01E');
    });

    it('returns Uint8Array for type=raw response', async () => {
      const id = getInstanceId(transmuxer);
      const outputData = new Uint8Array([0x01, 0x02, 0x03]);
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
      simulateTransmuxed(id, 0,
          shaka.util.BufferUtils.toArrayBuffer(outputData));
      const result = await p;

      expect(result).toBeInstanceOf(Uint8Array);
      expect(/** @type {!Uint8Array} */(result).length).toBe(3);
    });

    it('returns {data, init} for type=muxed response', async () => {
      const id = getInstanceId(transmuxer);
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
      capturedMessageHandler({data: {
        'cmd': 'transmuxed',
        'id': id,
        'reqId': 0,
        'output': {
          'type': 'segments',
          'data': new ArrayBuffer(4),
          'init': new ArrayBuffer(2),
        },
        'streamMutations': null,
      }});
      const result = await p;

      expect(result).toEqual(jasmine.objectContaining({
        data: jasmine.any(Uint8Array),
        init: jasmine.any(Uint8Array),
      }));
    });

    it('returns null init when absent in muxed response', async () => {
      const id = getInstanceId(transmuxer);
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
      capturedMessageHandler({data: {
        'cmd': 'transmuxed',
        'id': id,
        'reqId': 0,
        'output': {
          'type': 'segments', 'data': new ArrayBuffer(4), 'init': null,
        },
        'streamMutations': null,
      }});
      const result = await p;

      expect(/** @type {{data: ?, init: ?}} */(result).init).toBeNull();
    });

    it('applies stream mutations from worker response', async () => {
      const id = getInstanceId(transmuxer);
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'audio');
      simulateTransmuxed(id, 0, new ArrayBuffer(3),
          {'audioSamplingRate': 48000, 'channelsCount': 2});
      await p;

      expect(fakeStream.audioSamplingRate).toBe(48000);
      expect(fakeStream.channelsCount).toBe(2);
    });

    it('does not modify stream when mutations are null', async () => {
      const id = getInstanceId(transmuxer);
      fakeStream.audioSamplingRate = 44100;
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'audio');
      simulateTransmuxed(id, 0, new ArrayBuffer(3), null);
      await p;

      expect(fakeStream.audioSamplingRate).toBe(44100);
    });

    it('rejects with shaka.util.Error from worker error response', async () => {
      const id = getInstanceId(transmuxer);
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');

      // Register rejection handler before triggering the error to avoid
      // an unhandled-rejection event racing with the expectAsync handler.
      const assertion = expectAsync(p).toBeRejectedWith(
          jasmine.objectContaining({
            code: shaka.util.Error.Code.TRANSMUXING_FAILED,
          }));

      capturedMessageHandler({data: {
        'cmd': 'error',
        'id': id,
        'reqId': 0,
        'error': {
          'severity': shaka.util.Error.Severity.CRITICAL,
          'category': shaka.util.Error.Category.MEDIA,
          'code': shaka.util.Error.Code.TRANSMUXING_FAILED,
          'data': ['test error'],
        },
      }});

      await assertion;
    });

    it('ignores messages with unknown reqId', async () => {
      const id = getInstanceId(transmuxer);
      // Kick off a transmux to initialize the worker, then simulate a stale
      // message with an unknown reqId — should not throw.
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');

      expect(() => {
        capturedMessageHandler({data: {
          'cmd': 'transmuxed',
          'id': id,
          'reqId': 9999,
          'output': {'type': 'raw', 'data': new ArrayBuffer(1)},
          'streamMutations': null,
        }});
      }).not.toThrow();

      // Clean up: resolve the real pending request so afterEach is happy.
      simulateTransmuxed(id, 0, new ArrayBuffer(1));
      await p;
    });

    it('ignores messages with unknown instance id', async () => {
      const id = getInstanceId(transmuxer);
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');

      // A message with a different instance id should be silently ignored.
      expect(() => {
        capturedMessageHandler({data: {
          'cmd': 'transmuxed',
          'id': id + 100,
          'reqId': 0,
          'output': {'type': 'raw', 'data': new ArrayBuffer(1)},
          'streamMutations': null,
        }});
      }).not.toThrow();

      simulateTransmuxed(id, 0, new ArrayBuffer(1));
      await p;
    });

    it('assigns sequential reqIds to concurrent calls', async () => {
      const id = getInstanceId(transmuxer);
      const p1 = transmuxer.transmux(fakeData, fakeStream, null, 10, 'v');
      const p2 = transmuxer.transmux(fakeData, fakeStream, null, 10, 'v');

      simulateTransmuxed(id, 1, new ArrayBuffer(2));
      simulateTransmuxed(id, 0, new ArrayBuffer(2));

      await Promise.all([p1, p2]);

      const transmuxCalls = mockWorker.postMessage.calls.all()
          .filter((c) => c.args[0]['cmd'] === 'transmux');
      expect(transmuxCalls.length).toBe(2);
      expect(transmuxCalls[0].args[0]['reqId']).toBe(0);
      expect(transmuxCalls[1].args[0]['reqId']).toBe(1);
    });

    it('sends destroy message and terminates worker on destroy', async () => {
      const id = getInstanceId(transmuxer);
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
      simulateTransmuxed(id, 0, new ArrayBuffer(1));
      await p;

      transmuxer.destroy();

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
          jasmine.objectContaining({'cmd': 'destroy'}));
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('destroy rejects pending transmux', async () => {
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');

      // Register rejection handler before destroy to avoid an
      // unhandled-rejection event racing with the expectAsync handler.
      const assertion = expectAsync(p).toBeRejectedWith(
          jasmine.objectContaining({
            code: shaka.util.Error.Code.TRANSMUXING_FAILED,
          }));

      transmuxer.destroy();

      await assertion;
    });

    describe('timeout', () => {
      beforeEach(() => jasmine.clock().install());
      afterEach(() => jasmine.clock().uninstall());

      it('rejects on timeout when worker does not respond', async () => {
        const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
        const assertion = expectAsync(p).toBeRejectedWith(
            jasmine.objectContaining({
              code: shaka.util.Error.Code.TRANSMUXING_FAILED,
            }));

        jasmine.clock().tick(30001);
        await assertion;
      });

      it('falls back to main thread after timeout', async () => {
        const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
        const assertion = expectAsync(p).toBeRejectedWith(
            jasmine.objectContaining({
              code: shaka.util.Error.Code.TRANSMUXING_FAILED,
            }));
        jasmine.clock().tick(30001);
        await assertion;

        // mockInner.transmux returns a resolved promise, so this does not
        // involve setTimeout and is safe to await with the clock still running.
        await transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
        expect(mockInner.transmux).toHaveBeenCalled();
      });
    });

    it('sends reference props when reference is provided', async () => {
      const id = getInstanceId(transmuxer);
      const ref = /** @type {?} */({
        discontinuitySequence: 2,
        startTime: 10,
        endTime: 14,
        getUris: () => ['http://example.com/seg.ts'],
      });

      const p = transmuxer.transmux(fakeData, fakeStream, ref, 4, 'video');
      simulateTransmuxed(id, 0, new ArrayBuffer(1));
      await p;

      const call = mockWorker.postMessage.calls.all()
          .find((c) => c.args[0]['cmd'] === 'transmux');
      expect(call.args[0]['refProps']['discontinuitySequence']).toBe(2);
      expect(call.args[0]['refProps']['startTime']).toBe(10);
      expect(call.args[0]['refProps']['endTime']).toBe(14);
      expect(call.args[0]['refProps']['uris'])
          .toEqual(['http://example.com/seg.ts']);
    });

    it('sends null refProps when reference is null', async () => {
      const id = getInstanceId(transmuxer);
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
      simulateTransmuxed(id, 0, new ArrayBuffer(1));
      await p;

      const call = mockWorker.postMessage.calls.all()
          .find((c) => c.args[0]['cmd'] === 'transmux');
      expect(call.args[0]['refProps']).toBeNull();
    });

    describe('worker global error event', () => {
      it('rejects the pending request', async () => {
        const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');

        const assertion = expectAsync(p).toBeRejectedWith(
            jasmine.objectContaining({
              code: shaka.util.Error.Code.TRANSMUXING_FAILED,
            }));

        capturedErrorHandler(new Event('error'));
        await assertion;
      });

      it('falls back to main thread after worker error', async () => {
        const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
        const rejection = expectAsync(p).toBeRejected();
        capturedErrorHandler(new Event('error'));
        await rejection;

        await transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
        expect(mockInner.transmux).toHaveBeenCalled();
      });
    });

    it('surfaces init error with correct reqId on first transmux', async () => {
      const id = getInstanceId(transmuxer);
      const p = transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');

      // Simulate the worker responding with an error because init failed
      // (no plugin found). The worker now returns the error with the
      // correct reqId from the transmux request, not reqId: -1.
      const assertion = expectAsync(p).toBeRejectedWith(
          jasmine.objectContaining({
            code: shaka.util.Error.Code.TRANSMUXING_FAILED,
          }));

      capturedMessageHandler({data: {
        'cmd': 'error',
        'id': id,
        'reqId': 0,
        'error': {
          'severity': shaka.util.Error.Severity.CRITICAL,
          'category': shaka.util.Error.Category.MEDIA,
          'code': shaka.util.Error.Code.TRANSMUXING_FAILED,
          'data': ['No transmuxer initialized for id ' + id],
        },
      }});

      await assertion;
    });

    describe('Worker constructor failure', () => {
      beforeEach(() => {
        window['Worker'] = /** @type {?} */(class {
          constructor() {
            throw new Error('Worker creation not supported');
          }
        });
      });

      it('falls back to main thread when Worker constructor throws',
          async () => {
            const result = await transmuxer.transmux(
                fakeData, fakeStream, null, 10, 'video');
            expect(mockInner.transmux).toHaveBeenCalled();
            expect(result).toEqual(jasmine.any(Uint8Array));
          });

      it('continues falling back after constructor failure', async () => {
        await transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
        await transmuxer.transmux(fakeData, fakeStream, null, 10, 'video');
        expect(mockInner.transmux).toHaveBeenCalledTimes(2);
      });
    });
  });

  /**
   * @suppress {visibility}
   * "suppress visibility" has function scope, so this is a mini-function that
   * exists solely to suppress visibility rules for these actions.
   * @return {string}
   */
  function getUncompiledWorkerUrl() {
    return shaka.transmuxer.TransmuxerProxy.uncompiledWorkerUrl_;
  }

  /**
   * @suppress {visibility}
   * "suppress visibility" has function scope, so this is a mini-function that
   * exists solely to suppress visibility rules for these actions.
   * @param {string} url
   */
  function setUncompiledWorkerUrl(url) {
    shaka.transmuxer.TransmuxerProxy.uncompiledWorkerUrl_ = url;
  }

  /**
   * @suppress {visibility}
   * "suppress visibility" has function scope, so this is a mini-function that
   * exists solely to suppress visibility rules for these actions.
   */
  function resetClassState() {
    shaka.transmuxer.TransmuxerProxy.sharedWorker_ = null;
    shaka.transmuxer.TransmuxerProxy.activeInstances_.clear();
    if (shaka.transmuxer.TransmuxerProxy.blobUrl_) {
      URL.revokeObjectURL(shaka.transmuxer.TransmuxerProxy.blobUrl_);
      shaka.transmuxer.TransmuxerProxy.blobUrl_ = null;
    }
  }

  /**
   * @suppress {visibility}
   * "suppress visibility" has function scope, so this is a mini-function that
   * exists solely to suppress visibility rules for these actions.
   * @param {!shaka.transmuxer.TransmuxerProxy} tx
   * @return {number}
   */
  function getInstanceId(tx) {
    return tx.id_;
  }
});
