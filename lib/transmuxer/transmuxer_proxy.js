/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.TransmuxerProxy');

goog.require('shaka.device.DeviceFactory');
goog.require('shaka.log');
goog.require('shaka.transmuxer.WorkerBundle');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @summary A proxy transmuxer that delegates transmux() calls to a Web Worker.
 *
 * Synchronous methods (isSupported, convertCodecs, getOriginalMimeType) are
 * handled on the main thread by the inner transmuxer. Only the heavy
 * transmux() work is offloaded to the worker.
 *
 * In compiled builds, the worker is created from a minimal inline bundle
 * (embedded at build time as a Blob URL) containing only the transmuxer
 * code, avoiding the overhead of loading the entire library in the worker.
 * Falls back to main-thread transmuxing if a worker cannot be created.
 *
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.TransmuxerProxy = class {
  /**
   * @param {!shaka.extern.Transmuxer} innerTransmuxer
   *   The real transmuxer to use for sync methods and as fallback.
   */
  constructor(innerTransmuxer) {
    /** @private {!shaka.extern.Transmuxer} */
    this.innerTransmuxer_ = innerTransmuxer;

    /** @private {boolean} */
    this.workerFailed_ = false;

    /** @private {number} */
    this.nextReqId_ = 0;

    /**
     * Maps request IDs to pending promise resolvers and their timeout timers.
     * @private {!Map<number, {resolve: function(*), reject: function(*),
     *     timer: shaka.util.Timer}>}
     */
    this.pendingRequests_ = new Map();

    /** @private {number} */
    this.id_ = shaka.transmuxer.TransmuxerProxy.nextId_++;

    /** @private {boolean} */
    this.workerReady_ = false;

    /** @private {boolean} */
    this.attachedToWorker_ = false;
  }

  /**
   * @override
   * @export
   */
  destroy() {
    // Reject all pending requests.
    for (const pending of this.pendingRequests_.values()) {
      pending.timer.stop();
      pending.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          'Worker transmuxer destroyed'));
    }
    this.pendingRequests_.clear();

    if (this.attachedToWorker_) {
      const TransmuxerProxy = shaka.transmuxer.TransmuxerProxy;
      if (TransmuxerProxy.sharedWorker_) {
        TransmuxerProxy.sharedWorker_.postMessage(
            {'cmd': 'destroy', 'id': this.id_});
      }
      TransmuxerProxy.activeInstances_.delete(this.id_);
      this.attachedToWorker_ = false;

      // Terminate the shared worker when no instances remain.
      if (TransmuxerProxy.activeInstances_.size === 0 &&
         TransmuxerProxy.sharedWorker_) {
        TransmuxerProxy.sharedWorker_.terminate();
        TransmuxerProxy.sharedWorker_ = null;

        // Revoke the Blob URL to free memory.
        if (TransmuxerProxy.blobUrl_) {
          URL.revokeObjectURL(TransmuxerProxy.blobUrl_);
          TransmuxerProxy.blobUrl_ = null;
        }
      }
    }

    this.innerTransmuxer_.destroy();
  }

  /**
   * @param {string} mimeType
   * @param {string=} contentType
   * @return {boolean}
   * @override
   * @export
   */
  isSupported(mimeType, contentType) {
    return this.innerTransmuxer_.isSupported(mimeType, contentType);
  }

  /**
   * @param {string} contentType
   * @param {string} mimeType
   * @return {string}
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    return this.innerTransmuxer_.convertCodecs(contentType, mimeType);
  }

  /**
   * @return {string}
   * @override
   * @export
   */
  getOriginalMimeType() {
    return this.innerTransmuxer_.getOriginalMimeType();
  }

  /**
   * @override
   * @export
   */
  async transmux(data, stream, reference, duration, contentType) {
    // If worker creation previously failed, fall back to main thread.
    if (this.workerFailed_) {
      return this.innerTransmuxer_.transmux(
          data, stream, reference, duration, contentType);
    }

    // Lazy-init: attach to the shared worker on first transmux call.
    if (!this.attachedToWorker_) {
      const TransmuxerProxy = shaka.transmuxer.TransmuxerProxy;
      const worker = TransmuxerProxy.getOrCreateWorker_();
      if (!worker) {
        this.workerFailed_ = true;
        return this.innerTransmuxer_.transmux(
            data, stream, reference, duration, contentType);
      }
      TransmuxerProxy.activeInstances_.set(this.id_, this);
      this.attachedToWorker_ = true;
    }

    const worker = shaka.transmuxer.TransmuxerProxy.sharedWorker_;
    if (!worker) {
      this.workerFailed_ = true;
      return this.innerTransmuxer_.transmux(
          data, stream, reference, duration, contentType);
    }

    // Send init on first use so the worker creates the right transmuxer.
    if (!this.workerReady_) {
      const mimeType = this.innerTransmuxer_.getOriginalMimeType();
      worker.postMessage({
        'cmd': 'init',
        'id': this.id_,
        'mimeType': mimeType,
      });
      this.workerReady_ = true;
    }

    const reqId = this.nextReqId_++;

    // Extract only the properties transmuxers actually read/write.
    const streamProps = {
      'id': stream.id,
      'codecs': stream.codecs,
      'channelsCount': stream.channelsCount,
      'audioSamplingRate': stream.audioSamplingRate,
      'height': stream.height,
      'width': stream.width,
      'language': stream.language,
    };

    const refProps = reference ? {
      'discontinuitySequence': reference.discontinuitySequence,
      'startTime': reference.startTime,
      'endTime': reference.endTime,
      'uris': reference.getUris(),
    } : null;

    // Copy the buffer before transferring so the original `data` stays valid.
    // This is necessary because MediaSourceEngine may call transmux() twice
    // with the same data (split muxed content: once for audio, once for video).
    const buffer = shaka.util.BufferUtils.toArrayBuffer(
        shaka.util.Uint8ArrayUtils.concat(data));

    const {promise, resolve, reject} = Promise.withResolvers();
    const timer = new shaka.util.Timer(() => {
      if (this.pendingRequests_.has(reqId)) {
        this.pendingRequests_.delete(reqId);
        this.workerFailed_ = true;
        reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED,
            'Worker transmux timed out'));
      }
    });
    timer.tickAfter(shaka.transmuxer.TransmuxerProxy.TIMEOUT_MS_ / 1000);
    this.pendingRequests_.set(reqId, {
      resolve,
      reject,
      timer,
    });

    try {
      // Transfer the copied buffer to the worker for zero-copy delivery.
      // The original data remains valid for any subsequent callers.
      worker.postMessage({
        'cmd': 'transmux',
        'id': this.id_,
        'reqId': reqId,
        'data': buffer,
        'streamProps': streamProps,
        'refProps': refProps,
        'duration': duration,
        'contentType': contentType,
      }, [buffer]);
    } catch (e) {
      timer.stop();
      this.pendingRequests_.delete(reqId);
      shaka.log.warning(
          'Failed to post message to worker, falling back to main thread', e);
      const transmuxerProxy = shaka.transmuxer.TransmuxerProxy;
      transmuxerProxy.terminateWorker_('Worker postMessage failed');
      return this.innerTransmuxer_.transmux(
          data, stream, reference, duration, contentType);
    }

    const response = await promise;

    // Apply stream mutations back to the real stream object.
    const mutations = response['streamMutations'];
    if (mutations && Object.keys(mutations).length > 0) {
      for (const key of Object.keys(mutations)) {
        stream[key] = mutations[key];
      }
    }

    // Reconstruct the output.
    const output = response['output'];
    const BufferUtils = shaka.util.BufferUtils;
    if (output['type'] === 'raw') {
      return BufferUtils.toUint8(
          /** @type {!ArrayBuffer} */(output['data']));
    } else {
      return {
        data: BufferUtils.toUint8(
            /** @type {!ArrayBuffer} */(output['data'])),
        init: output['init'] ? BufferUtils.toUint8(
            /** @type {!ArrayBuffer} */(output['init'])) : null,
      };
    }
  }

  /**
   * Handles messages from the shared worker for this instance.
   * @param {!Object} msg
   * @private
   */
  onWorkerMessage_(msg) {
    const cmd = msg['cmd'];

    if (cmd === 'transmuxed' || cmd === 'error') {
      const reqId = msg['reqId'];
      const pending = this.pendingRequests_.get(reqId);
      if (!pending) {
        return;
      }
      pending.timer.stop();
      this.pendingRequests_.delete(reqId);

      if (cmd === 'error') {
        const errorObj = msg['error'];
        pending.reject(new shaka.util.Error(
            errorObj['severity'],
            errorObj['category'],
            errorObj['code'],
            ...errorObj['data']));
      } else {
        pending.resolve(msg);
      }
    }
  }
};


/** @private {number} */
shaka.transmuxer.TransmuxerProxy.nextId_ = 0;


/**
 * Timeout in milliseconds for a worker transmux response. If the worker does
 * not respond within this time, the request is rejected and future calls fall
 * back to the main thread.
 * @private @const {number}
 */
shaka.transmuxer.TransmuxerProxy.TIMEOUT_MS_ = 30000;


/**
 * Shared Worker instance used by all TransmuxerProxy instances.
 * @private {?Worker}
 */
shaka.transmuxer.TransmuxerProxy.sharedWorker_ = null;


/**
 * Map of active instances keyed by ID, for routing worker messages.
 * @private {!Map<number, !shaka.transmuxer.TransmuxerProxy>}
 */
shaka.transmuxer.TransmuxerProxy.activeInstances_ = new Map();


/**
 * Gets or creates the shared worker. Returns null if the worker cannot
 * be created (unsupported device, missing script URL, or creation error).
 * @return {?Worker}
 * @private
 */
shaka.transmuxer.TransmuxerProxy.getOrCreateWorker_ = () => {
  const TransmuxerProxy = shaka.transmuxer.TransmuxerProxy;
  if (TransmuxerProxy.sharedWorker_) {
    return TransmuxerProxy.sharedWorker_;
  }

  const device = shaka.device.DeviceFactory.getDevice();
  if (!device.supportsWorkerTransmux()) {
    shaka.log.info(
        'Device does not support worker transmuxing; ' +
        'falling back to main-thread transmuxing');
    return null;
  }

  try {
    let workerUrl;

    if (!COMPILED) {
      // In uncompiled mode, use the bootstrap script that loads Closure
      // Library and the transmuxer dependencies via importScripts.
      workerUrl = TransmuxerProxy.uncompiledWorkerUrl_;
      if (!workerUrl) {
        shaka.log.warning('Could not detect shaka script URL; ' +
            'falling back to main-thread transmuxing');
        return null;
      }
    } else {
      // In compiled mode, create an inline Blob URL from the embedded
      // worker bundle. This avoids loading the entire shaka-player script
      // in the worker — only the minimal transmuxer code is loaded.
      const bundleCode = shaka.transmuxer.WorkerBundle.CODE;
      if (!bundleCode) {
        shaka.log.warning('No embedded worker bundle found; ' +
            'falling back to main-thread transmuxing');
        return null;
      }
      const blob = new Blob([bundleCode], {type: 'text/javascript'});
      workerUrl = URL.createObjectURL(blob);
      TransmuxerProxy.blobUrl_ = workerUrl;
    }

    const worker = new Worker(workerUrl);

    worker.addEventListener('message', (event) => {
      const msg = /** @type {!MessageEvent} */(event).data;
      const cmd = msg['cmd'];
      if (cmd === 'transmuxed' || cmd === 'error') {
        // Route directly to the instance that owns this request.
        const instance = TransmuxerProxy.activeInstances_.get(msg['id']);
        if (instance) {
          instance.onWorkerMessage_(msg);
        }
      }
    });

    worker.addEventListener('error', (event) => {
      shaka.log.warning('Transmuxer worker error:', event);
      TransmuxerProxy.terminateWorker_('Worker error');
    });

    TransmuxerProxy.sharedWorker_ = worker;
    return worker;
  } catch (e) {
    shaka.log.warning(
        'Failed to create transmuxer worker, falling back to main thread', e);
    return null;
  }
};


/**
 * Marks all active instances as failed, rejects their pending requests, shuts
 * down the shared worker, and revokes the blob URL if present.
 * @param {string} message Error message for rejected promises.
 * @private
 */
shaka.transmuxer.TransmuxerProxy.terminateWorker_ = (message) => {
  const TransmuxerProxy = shaka.transmuxer.TransmuxerProxy;
  for (const instance of TransmuxerProxy.activeInstances_.values()) {
    instance.workerFailed_ = true;
    for (const pending of instance.pendingRequests_.values()) {
      pending.timer.stop();
      pending.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          message));
    }
    instance.pendingRequests_.clear();
  }
  TransmuxerProxy.sharedWorker_ = null;
  TransmuxerProxy.activeInstances_.clear();
  if (TransmuxerProxy.blobUrl_) {
    URL.revokeObjectURL(TransmuxerProxy.blobUrl_);
    TransmuxerProxy.blobUrl_ = null;
  }
};


/**
 * Blob URL for the inline worker bundle. Tracked so it can be revoked
 * when the last instance is destroyed.
 * @private {?string}
 */
shaka.transmuxer.TransmuxerProxy.blobUrl_ = null;


/**
 * URL for the uncompiled worker bootstrap script, derived by scanning loaded
 * script tags for a known shaka library path.
 *
 * We avoid document.currentScript because it is only valid during synchronous
 * script evaluation and can be null when scripts are loaded dynamically by
 * Closure Library's goog.require (e.g., via document.write on Firefox/Safari).
 *
 * @type {string}
 */
shaka.transmuxer.TransmuxerProxy.uncompiledWorkerUrl_ = (() => {
  if (typeof document === 'undefined') {
    return '';
  }
  const scripts = document.getElementsByTagName('script');
  for (let i = scripts.length - 1; i >= 0; --i) {
    const src =
      /** @type {!HTMLScriptElement} */(scripts[i]).src;
    if (src && src.includes('lib/transmuxer/transmuxer_proxy.js')) {
      const base = src.substring(
          0, src.indexOf('lib/transmuxer/transmuxer_proxy.js'));
      return base + 'transmuxer_worker.uncompiled.js';
    }
  }
  return '';
})();
