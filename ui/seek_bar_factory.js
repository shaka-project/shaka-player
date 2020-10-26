/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.SeekBarFactory');

goog.require('shaka.ui.SeekBar');

/**
 * @implements {shaka.extern.ISeekBarFactory}
 * @export
 */

shaka.ui.SeekBarFactory = class {
  /**
   * Creates a shaka.ui.SeekBar. Use this factory to register the default
   * SeekBar when needed
   *
   * @override
   */
  create(rootElement, controls) {
    return new shaka.ui.SeekBar(rootElement, controls);
  }
};
