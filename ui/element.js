/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.Element');

goog.require('shaka.ads.Utils');
goog.require('shaka.util.EventManager');
goog.requireType('shaka.Player');
goog.requireType('shaka.ui.Controls');
goog.requireType('shaka.ui.Localization');


/**
 * @implements {shaka.extern.IUIElement}
 * @abstract
 * @export
 */
shaka.ui.Element = class {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    /**
     * @protected {HTMLElement}
     * @exportInterface
     */
    this.parent = parent;

    /**
     * @protected {shaka.ui.Controls}
     * @exportInterface
     */
    this.controls = controls;

    /**
     * @protected {shaka.util.EventManager}
     * @exportInterface
     */
    this.eventManager = new shaka.util.EventManager();

    /**
     * @protected {shaka.ui.Localization}
     * @exportInterface
     */
    this.localization = this.controls.getLocalization();

    /**
     * @protected {shaka.Player}
     * @exportInterface
     */
    this.player = this.controls.getPlayer();

    /**
     * @protected {HTMLMediaElement}
     * @exportInterface
     */
    this.video = this.controls.getVideo();

    /**
     * @protected {shaka.extern.IAdManager}
     * @exportInterface
     */
    this.adManager = this.player.getAdManager();

    /**
     * @protected {?shaka.extern.IAd}
     * @exportInterface
     */
    this.ad = controls.getAd();

    const AD_STARTED = shaka.ads.Utils.AD_STARTED;
    this.eventManager.listen(this.adManager, AD_STARTED, (e) => {
      this.ad = (/** @type {!Object} */ (e))['ad'];
    });

    const AD_STOPPED = shaka.ads.Utils.AD_STOPPED;
    this.eventManager.listen(this.adManager, AD_STOPPED, () => {
      this.ad = null;
    });
  }

  /**
   * @override
   * @export
   */
  release() {
    this.eventManager.release();

    this.parent = null;
    this.controls = null;
    this.eventManager = null;
    this.localization = null;
    this.player = null;
    this.video = null;
    this.adManager = null;
    this.ad = null;
  }
};
