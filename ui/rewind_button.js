/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.RewindButton');

goog.require('shaka.Deprecate');
goog.require('shaka.ui.TrickPlayButton');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.TrickPlayButton}
 * @final
 * @export
 * @deprecated Use shaka.ui.TrickPlayButton with isForward=false, or the
 *   'rewind' UI element name directly.
 */
shaka.ui.RewindButton = class extends shaka.ui.TrickPlayButton {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls, /* isForward= */ false);
    shaka.Deprecate.deprecateFeature(6,
        'shaka.ui.RewindButton',
        'Use shaka.ui.TrickPlayButton with isForward=false instead.');
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 * @deprecated Use shaka.ui.TrickPlayButton.RewindFactory instead.
 */
shaka.ui.RewindButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.RewindButton(rootElement, controls);
  }
};
