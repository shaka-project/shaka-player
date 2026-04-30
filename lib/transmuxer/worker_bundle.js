/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.WorkerBundle');


/**
 * Holds the inline transmuxer worker code as a string constant.
 *
 * In compiled builds, the build system generates a version of this file with
 * the actual compiled worker bundle embedded in CODE. In uncompiled/dev mode,
 * CODE is empty and the worker is loaded from an external bootstrap script
 * instead.
 *
 * @const {string}
 */
shaka.transmuxer.WorkerBundle.CODE = '';
