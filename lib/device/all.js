/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Aggregates every device plugin into a single dependency. Each
 * device self-registers with DeviceFactory as a load-time side effect, so
 * requiring this one module pulls them all into the dependency graph. A bundle
 * built with --dependency_mode=PRUNE (the transmuxer worker) can then keep
 * every device via a single entry point instead of listing each one by hand.
 * @suppress {extraRequire} The requires below are load-bearing side effects.
 */

goog.provide('shaka.device.AllDevices');

goog.require('shaka.device.AppleBrowser');
goog.require('shaka.device.Chromecast');
goog.require('shaka.device.DefaultBrowser');
goog.require('shaka.device.Hisense');
goog.require('shaka.device.PlayStation');
goog.require('shaka.device.TitanOS');
goog.require('shaka.device.TiVoOS');
goog.require('shaka.device.Tizen');
goog.require('shaka.device.Vizio');
goog.require('shaka.device.WebKitSTB');
goog.require('shaka.device.WebOS');
goog.require('shaka.device.Xbox');
