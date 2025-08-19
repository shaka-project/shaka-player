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
    this.button_.classList.add('shaka-no-propagation');
    this.button_.classList.add('close-button');

    new shaka.ui.MaterialSVGIcon(this.button_).use(
        // eslint-disable-next-line @stylistic/max-len
        'M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z',
    );

    this.parent.appendChild(this.button_);

    this.button_.addEventListener('click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
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
