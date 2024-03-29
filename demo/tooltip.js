/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shakaDemo.Tooltips');

/**
 * Creates and contains a tooltip.
 */
shakaDemo.Tooltips = class {
  /**
   * @param {!Element} labeledElement
   * @param {string} content
   */
  static make(labeledElement, content) {
    tippy(labeledElement, {
      content,
      placement: 'bottom',
      arrow: true,
      animation: 'scale',
      size: 'large',
    });
    // TODO: The tooltip should be unreadable by screen readers, and this
    // tooltip info should instead be encoded into the object.
  }
};
