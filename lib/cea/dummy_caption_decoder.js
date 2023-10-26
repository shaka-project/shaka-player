/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.DummyCaptionDecoder');

/** @implements {shaka.extern.ICaptionDecoder} */
shaka.cea.DummyCaptionDecoder = class {
  /** @override */
  extract(userDataSeiMessage, pts) {}

  /** @override */
  decode() {
    return [];
  }

  /** @override */
  clear() {}

  /** @override */
  getStreams() {
    return [];
  }
};
