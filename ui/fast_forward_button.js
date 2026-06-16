/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.FastForwardButton');

goog.require('shaka.Deprecate');
goog.require('shaka.ui.TrickPlayButton');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.TrickPlayButton}
 * @final
 * @export
 * @deprecated Use shaka.ui.TrickPlayButton with isForward=true, or the
 *   'fast_forward' UI element name directly.
 */
shaka.ui.FastForwardButton = class extends shaka.ui.TrickPlayButton {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls, /* isForward= */ true);
    shaka.Deprecate.deprecateFeature(6,
        'shaka.ui.FastForwardButton',
        'Use shaka.ui.TrickPlayButton with isForward=true instead.');
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 * @deprecated Use shaka.ui.TrickPlayButton.FastForwardFactory instead.
 */
shaka.ui.FastForwardButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.FastForwardButton(rootElement, controls);
  }
};
