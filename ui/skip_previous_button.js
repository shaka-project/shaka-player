/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SkipPreviousButton');

goog.require('shaka.Deprecate');
goog.require('shaka.ui.SkipQueueButton');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.SkipQueueButton}
 * @final
 * @export
 * @deprecated Use shaka.ui.SkipQueueButton with isNext=false, or the
 *   'skip_previous' / 'skip_previous_always' UI element names directly.
 */
shaka.ui.SkipPreviousButton = class extends shaka.ui.SkipQueueButton {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {boolean=} showWhenUnavailable
   */
  constructor(parent, controls, showWhenUnavailable = false) {
    super(parent, controls, /* isNext= */ false, showWhenUnavailable);
    shaka.Deprecate.deprecateFeature(6,
        'shaka.ui.SkipPreviousButton',
        'Use shaka.ui.SkipQueueButton with isNext=false instead.');
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 * @deprecated Use shaka.ui.SkipQueueButton.SkipPreviousFactory instead.
 */
shaka.ui.SkipPreviousButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SkipPreviousButton(rootElement, controls);
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 * @deprecated Use shaka.ui.SkipQueueButton.SkipPreviousAlwaysFactory instead.
 */
shaka.ui.SkipPreviousButton.AlwaysFactory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SkipPreviousButton(
        rootElement, controls, /* showDisabled= */ true);
  }
};
