/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.IconRegistry');

goog.require('shaka.ui.Enums');

/**
 * @final
 * @export
 */
shaka.ui.IconRegistry = class IconRegistry {
  /**
   * Register custom icon for UI control elements
   * @param {string} name
   * @param {shaka.extern.UIIcon | string} icon
   * @export
   */
  static register(name, icon) {
    if (typeof icon === 'object' || typeof icon == 'string') {
      shaka.ui.Enums.MaterialDesignSVGIcons[name] = icon;
    }
  }
};

/**
 * @export
 */
shaka.ui.IconRegistry.registeredIcons = {};
