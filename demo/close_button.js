/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shakaDemo.CloseButton');


/**
 * A custom UI button, to allow users to close the video element.
 * This cannot actually extend shaka.ui.Element, as that class does not exist
 * at load-time when in uncompiled mode.
 * @extends {shaka.ui.Element}
 */
shakaDemo.CloseButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);
    this.button_ = document.createElement('button');
    this.button_.classList.add('material-icons-round');
    this.button_.classList.add('close-button');
    this.button_.textContent = 'close'; // Close icon.
    this.parent.appendChild(this.button_);

    this.button_.addEventListener('click', () => {
      shakaDemoMain.unload();
    });

    if ('documentPictureInPicture' in window) {
      this.eventManager.listen(
          window.documentPictureInPicture, 'enter', () => {
            this.button_.style.display = 'none';
            const pipWindow = window.documentPictureInPicture.window;
            this.eventManager.listen(pipWindow, 'pagehide', () => {
              this.button_.style.display = 'block';
            });
          });
    }
  }
};

/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shakaDemo.CloseButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shakaDemo.CloseButton(rootElement, controls);
  }
};

// This button is registered inside setup in shakaDemo.Main, rather than
// statically here, since shaka.ui.Controls does not exist in this stage of the
// load process.
