/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.DummyCeaParser');

/**
 * Dummy CEA parser.
 * @implements {shaka.extern.ICeaParser}
 */
shaka.cea.DummyCeaParser = class {
  /**
   * @override
   */
  init(initSegment) {
  }

  /**
   * @override
   */
  parse(mediaSegment) {
    return /* captionPackets= */ [];
  }
};
