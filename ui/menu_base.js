/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.MenuBase');

goog.require('shaka.ui.Element');
goog.requireType('shaka.ui.Controls');


/**
 * Abstract base class for UI menu elements (OverflowMenu, SettingsMenu).
 *
 * @extends {shaka.ui.Element}
 * @abstract
 * @export
 */
shaka.ui.MenuBase = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @protected {!shaka.extern.UIConfiguration} */
    this.config = this.controls.getConfig();

    /** @private {HTMLElement} */
    this.videoContainer_ = this.controls.getVideoContainer();

    /** @private {ResizeObserver} */
    this.resizeObserver_ = null;

    /** @private {?number} */
    this.resizeRafId_ = null;

    const resize = () => {
      if (this.resizeRafId_ != null) {
        cancelAnimationFrame(this.resizeRafId_);
      }
      this.resizeRafId_ = requestAnimationFrame(() => {
        this.resizeRafId_ = null;
        this.adjustCustomStyle();
      });
    };

    // Use ResizeObserver if available, fallback to window resize event.
    if (window.ResizeObserver) {
      this.resizeObserver_ = new ResizeObserver(resize);
      this.resizeObserver_.observe(this.controls.getVideoContainer());
    } else {
      // Fallback for older browsers.
      this.eventManager.listen(window, 'resize', resize);
    }

    if ('documentPictureInPicture' in window) {
      this.eventManager.listen(window.documentPictureInPicture, 'enter',
          (e) => {
            const event = /** @type {DocumentPictureInPictureEvent} */(e);
            const pipWindow = event.window;
            this.eventManager.listen(pipWindow, 'resize', resize);
            this.eventManager.listenOnce(pipWindow, 'pagehide', () => {
              this.eventManager.unlisten(pipWindow, 'resize', resize);
              resize();
            });
            resize();
          });
    }
  }

  /** @override */
  release() {
    if (this.resizeObserver_) {
      this.resizeObserver_.disconnect();
      this.resizeObserver_ = null;
    }
    if (this.resizeRafId_ != null) {
      cancelAnimationFrame(this.resizeRafId_);
      this.resizeRafId_ = null;
    }
    super.release();
  }

  /**
   * Called by the RAF-debounced resize handler.
   * Subclasses override this to reposition their specific menu element.
   *
   * @protected
   */
  adjustCustomStyle() {}

  /**
   * Shared positioning algorithm used by both OverflowMenu and SettingsMenu.
   *
   * Computes:
   *   - maxHeight so the menu does not overflow the video container vertically.
   *   - left/right offset so the menu stays within the controls bar
   *     horizontally, aligned with the button that opened it.
   *
   * @param {!HTMLElement} menuElement   The floating menu div to position.
   * @param {!HTMLElement} buttonElement The button that triggered the menu.
   * @param {!HTMLElement} controlsContainer
   *     The bottom controls bar used as the horizontal reference.
   * @protected
   */
  adjustMenuStyle(menuElement, buttonElement, controlsContainer) {
    // --- Max height ---
    const rectMenu = menuElement.getBoundingClientRect();
    // Use the element's own window so this works both in the main document
    // and when videoContainer has been moved into a DocumentPictureInPicture
    // window (where the global `window` would be the wrong browsing context).
    const elementWindow = menuElement.ownerDocument.defaultView || window;
    const styleMenu = elementWindow.getComputedStyle(menuElement);
    const paddingTop = parseFloat(styleMenu.paddingTop);
    const paddingBottom = parseFloat(styleMenu.paddingBottom);
    const rectContainer = this.videoContainer_.getBoundingClientRect();
    const gap = 5;
    const heightIntersection =
        rectMenu.bottom - rectContainer.top - paddingTop - paddingBottom - gap;

    menuElement.style.maxHeight = heightIntersection + 'px';

    if (this.config.showMenusOnTheRight) {
      menuElement.style.right = '15px';
      return;
    }

    // --- Horizontal position ---
    const bottomControlsPos = controlsContainer.getBoundingClientRect();
    const buttonPos = buttonElement.getBoundingClientRect();
    const leftGap = buttonPos.left - bottomControlsPos.left;
    const rightGap = bottomControlsPos.right - buttonPos.right;
    const EDGE_PADDING = 15;
    const MIN_GAP = 60;
    // Align to whichever side has more space, respecting a minimum edge gap.
    if (leftGap < rightGap) {
      const left = leftGap < MIN_GAP ?
          EDGE_PADDING : Math.max(leftGap, EDGE_PADDING);
      menuElement.style.left = left + 'px';
      menuElement.style.right = 'auto';
    } else {
      const right = rightGap < MIN_GAP ?
          EDGE_PADDING : Math.max(rightGap, EDGE_PADDING);
      menuElement.style.right = right + 'px';
      menuElement.style.left = 'auto';
    }
  }
};
