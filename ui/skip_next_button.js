/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SkipNextButton');

goog.require('shaka.Deprecate');
goog.require('shaka.ui.SkipQueueButton');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.SkipQueueButton}
 * @final
 * @export
 * @deprecated Use shaka.ui.SkipQueueButton with isNext=true, or the
 *   'skip_next' / 'skip_next_always' UI element names directly.
 */
shaka.ui.SkipNextButton = class extends shaka.ui.SkipQueueButton {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {boolean=} showWhenUnavailable
   */
  constructor(parent, controls, showWhenUnavailable = false) {
    super(parent, controls, /* isNext= */ true, showWhenUnavailable);
    shaka.Deprecate.deprecateFeature(6,
        'shaka.ui.SkipNextButton',
        'Use shaka.ui.SkipQueueButton with isNext=true instead.');
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 * @deprecated Use shaka.ui.SkipQueueButton.SkipNextFactory instead.
 */
shaka.ui.SkipNextButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SkipNextButton(rootElement, controls);
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 * @deprecated Use shaka.ui.SkipQueueButton.SkipNextAlwaysFactory instead.
 */
shaka.ui.SkipNextButton.AlwaysFactory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SkipNextButton(
        rootElement, controls, /* showDisabled= */ true);
  }
};
