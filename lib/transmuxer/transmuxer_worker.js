/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.TransmuxerWorker');

goog.require('shaka.log');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');


/**
 * @summary Web Worker entry point for offloading transmux operations.
 *
 * This class manages transmuxer instances inside a Web Worker and
 * communicates with the main thread via postMessage.
 *
 * Message protocol (main -> worker):
 *   {cmd: 'init', id: number, mimeType: string}
 *   {cmd: 'transmux', id: number, reqId: number, data: ArrayBuffer,
 *    streamProps: Object, refProps: Object, duration: number,
 *    contentType: string}
 *   {cmd: 'destroy', id: number}
 *
 * Response protocol (worker -> main):
 *   {cmd: 'transmuxed', id: number, reqId: number, output: Object,
 *    streamMutations: Object}
 *   {cmd: 'error', id: number, reqId: number, error: Object}
 *   {cmd: 'destroyed', id: number}
 *
 * @export
 */
shaka.transmuxer.TransmuxerWorker = class {
  constructor() {
    /**
     * @private {!Map<number, !shaka.extern.Transmuxer>}
     */
    this.transmuxers_ = new Map();
  }

  /**
   * Starts listening for messages. Call this from the worker global scope.
   * @export
   */
  start() {
    self.addEventListener('message', (event) => {
      this.onMessage_(/** @type {!MessageEvent} */(event));
    });
  }

  /**
   * Handles incoming messages from the main thread.
   * @param {!MessageEvent} event
   * @private
   */
  onMessage_(event) {
    const msg = event.data;
    switch (msg['cmd']) {
      case 'init':
        this.onInit_(msg);
        break;
      case 'transmux':
        this.onTransmux_(msg);
        break;
      case 'destroy':
        this.onDestroy_(msg);
        break;
    }
  }

  /**
   * Creates a transmuxer instance.
   * @param {!Object} msg
   * @private
   */
  onInit_(msg) {
    const id = msg['id'];
    const mimeType = msg['mimeType'];

    // Look up the transmuxer plugin directly without calling isSupported().
    // The main thread already validated support; re-checking here would fail
    // because MediaSource in Workers may not report the same type support as
    // the main thread.
    const plugin =
        shaka.transmuxer.TransmuxerEngine.findTransmuxerPlugin(mimeType);

    if (plugin) {
      this.transmuxers_.set(id, plugin());
    } else {
      // Only log here; the subsequent onTransmux_ call will post an error
      // with the correct reqId so the proxy can route it to the caller.
      shaka.log.warning('TransmuxerWorker: no plugin found for', mimeType);
    }
  }

  /**
   * Runs a transmux operation and posts back the result.
   * @param {!Object} msg
   * @private
   */
  async onTransmux_(msg) {
    const id = msg['id'];
    const reqId = msg['reqId'];

    const transmuxer = this.transmuxers_.get(id);
    if (!transmuxer) {
      self.postMessage({
        'cmd': 'error',
        'id': id,
        'reqId': reqId,
        'error': {
          'severity': shaka.util.Error.Severity.CRITICAL,
          'category': shaka.util.Error.Category.MEDIA,
          'code': shaka.util.Error.Code.TRANSMUXING_FAILED,
          'data': ['No transmuxer initialized for id ' + id],
        },
      });
      return;
    }

    const streamProps = msg['streamProps'];
    const refProps = msg['refProps'];

    const stream = {
      'id': streamProps['id'],
      'codecs': streamProps['codecs'],
      'channelsCount': streamProps['channelsCount'],
      'audioSamplingRate': streamProps['audioSamplingRate'],
      'height': streamProps['height'],
      'width': streamProps['width'],
      'language': streamProps['language'],
    };

    const reference = refProps ? {
      'discontinuitySequence': refProps['discontinuitySequence'],
      'startTime': refProps['startTime'],
      'endTime': refProps['endTime'],
      'getUris': () => refProps['uris'],
    } : null;

    const data = shaka.util.BufferUtils.toUint8(
        /** @type {!ArrayBuffer} */(msg['data']));
    const duration = msg['duration'];
    const contentType = msg['contentType'];

    try {
      const result = await transmuxer.transmux(
          data,
          /** @type {shaka.extern.Stream} */(stream),
          /** @type {?} */(reference),
          duration,
          contentType);

      // Compute mutations: which stream properties changed.
      const streamMutations = {};
      const mutatedKeys = [
        'audioSamplingRate', 'channelsCount', 'height', 'width',
      ];
      for (const key of mutatedKeys) {
        if (stream[key] !== streamProps[key]) {
          streamMutations[key] = stream[key];
        }
      }

      // Convert typed array views to ArrayBuffer before posting. Only
      // ArrayBuffer (not views) can be transferred zero-copy via postMessage.
      const BufferUtils = shaka.util.BufferUtils;

      if (ArrayBuffer.isView(result)) {
        const buf = BufferUtils.toArrayBuffer(
            /** @type {!Uint8Array} */(result));
        self.postMessage({
          'cmd': 'transmuxed',
          'id': id,
          'reqId': reqId,
          'output': {'type': 'raw', 'data': buf},
          'streamMutations': streamMutations,
        }, [buf]);
      } else {
        const output = /** @type {!shaka.extern.TransmuxerOutput} */(result);
        const dataBuf = BufferUtils.toArrayBuffer(output.data);
        const initBuf = output.init ?
            BufferUtils.toArrayBuffer(output.init) : null;
        const transfers = [dataBuf];
        const response = {
          'cmd': 'transmuxed',
          'id': id,
          'reqId': reqId,
          'output': {
            'type': 'segments',
            'data': dataBuf,
            'init': initBuf,
          },
          'streamMutations': streamMutations,
        };
        if (initBuf) {
          transfers.push(initBuf);
        }
        self.postMessage(response, transfers);
      }
    } catch (e) {
      self.postMessage({
        'cmd': 'error',
        'id': id,
        'reqId': reqId,
        'error': shaka.transmuxer.TransmuxerWorker.errorToObject_(e),
      });
    }
  }

  /**
   * Converts a caught error into a plain serializable object for postMessage.
   * @param {*} e
   * @return {!Object}
   * @private
   */
  static errorToObject_(e) {
    if (e instanceof shaka.util.Error) {
      return {
        'severity': e.severity,
        'category': e.category,
        'code': e.code,
        'data': e.data,
      };
    }
    return {
      'severity': shaka.util.Error.Severity.CRITICAL,
      'category': shaka.util.Error.Category.MEDIA,
      'code': shaka.util.Error.Code.TRANSMUXING_FAILED,
      'data': [e instanceof Error ? e.message : 'Unknown error'],
    };
  }

  /**
   * Destroys a transmuxer instance.
   * @param {!Object} msg
   * @private
   */
  onDestroy_(msg) {
    const id = msg['id'];
    const transmuxer = this.transmuxers_.get(id);
    if (transmuxer) {
      transmuxer.destroy();
      this.transmuxers_.delete(id);
    }
    self.postMessage({'cmd': 'destroyed', 'id': id});
  }
};


/**
 * Boots the worker if running in a Worker global scope.
 * This is called at load time so the worker is ready immediately.
 */
shaka.transmuxer.TransmuxerWorker.boot = () => {
  if (typeof DedicatedWorkerGlobalScope !== 'undefined' &&
      self instanceof DedicatedWorkerGlobalScope) {
    const worker = new shaka.transmuxer.TransmuxerWorker();
    worker.start();
  }
};

// Auto-boot when loaded in a worker context.
shaka.transmuxer.TransmuxerWorker.boot();
