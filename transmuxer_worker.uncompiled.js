/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Entry point for the transmuxer Web Worker in uncompiled
 * (development) mode.  Loads Closure Library via importScripts, pulls in the
 * dependency graph, then goog.require's the transmuxer plugins and the worker
 * entry point.
 *
 * In compiled builds this file is not used — the compiled bundle is loaded
 * directly as the Worker script.
 */

// Closure's base.js uses document.currentScript (or document.write) to resolve
// relative paths.  Neither exists inside a Worker, so we provide a
// CLOSURE_IMPORT_SCRIPT hook that uses importScripts instead, and set
// CLOSURE_BASE_PATH so Closure can find its own modules.

/* eslint-disable no-restricted-syntax */
// @ts-ignore
self.CLOSURE_BASE_PATH =
    'node_modules/google-closure-library/closure/goog/';

// Tell Closure to use importScripts for loading dependencies.
self.CLOSURE_IMPORT_SCRIPT = (src) => {
  importScripts(src);
  return true;
};

// Load Closure Library base and the generated dependency map.
importScripts(
    'node_modules/google-closure-library/closure/goog/base.js',
    'dist/deps.js');

// Pull in the device factory so DeviceFactory.getDevice() works inside the
// worker (needed by TsTransmuxer.isSupported -> convertCodecs ->
// StreamUtils.getCorrectAudioCodecs).
goog.require('shaka.device.DefaultBrowser');

// Pull in the transmuxer plugins so they self-register with
// TransmuxerEngine, then load the worker entry point.
goog.require('shaka.transmuxer.AacTransmuxer');
goog.require('shaka.transmuxer.Ac3Transmuxer');
goog.require('shaka.transmuxer.Ec3Transmuxer');
goog.require('shaka.transmuxer.Mp3Transmuxer');
goog.require('shaka.transmuxer.MpegTsTransmuxer');
goog.require('shaka.transmuxer.TsTransmuxer');
goog.require('shaka.transmuxer.TransmuxerWorker');

// The auto-boot at the bottom of transmuxer_worker.js will have already
// called TransmuxerWorker.boot() when it was loaded by goog.require above.
