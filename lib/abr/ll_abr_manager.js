/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.abr.LlAbrManager');
goog.require('shaka.util.Timer');

goog.require('shaka.util.EventManager');


/**
 * @implements {shaka.extern.AbrManager}
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.abr.LlAbrManager = class {
  constructor() {
    /** @private {?shaka.extern.AbrManager.SwitchCallback} */
    this.switch_ = null;

    /** @private {!shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {HTMLMediaElement} */
    this.mediaElement_ = null;

    /** @private {!Array<!shaka.extern.Variant>} */
    this.variants_ = [];

    /** @private {shaka.util.Timer} */
    this.timer_ = new shaka.util.Timer(() => this.evaluate_());
  }


  /**
   * @override
   * @export
   */
  stop() {
    this.switch_ = null;
    this.variants_ = [];
    if (this.timer_) {
      this.timer_.stop();
    }
  }

  /**
   * @override
   * @export
   */
  release() {
    this.stop();
    this.eventManager_.release();
  }


  /**
   * @override
   * @export
   */
  init(switchCallback) {
    this.switch_ = switchCallback;
  }


  /**
   * @param {boolean=} preferFastSwitching
   * @return {shaka.extern.Variant}
   * @override
   * @export
   */
  chooseVariant(preferFastSwitching = false) {
    const chosen = this.variants_[0] || null;
    return chosen;
  }


  /**
   * @override
   * @export
   */
  trySuggestStreams() {
  }

  /**
   * @override
   * @export
   */
  enable() {
  }


  /**
   * @override
   * @export
   */
  disable() {
  }


  /**
   * @override
   * @export
   */
  segmentDownloaded(deltaTimeMs, numBytes, allowSwitch, request, context) {
  }


  /**
   * @override
   * @export
   */
  getBandwidthEstimate() {
    return 0;
  }


  /**
   * @override
   * @export
   */
  setVariants(variants) {
    this.variants_ = variants;
    return true;
  }


  /**
   * @override
   * @export
   */
  playbackRateChanged(rate) {
  }


  /**
   * @override
   * @export
   */
  setMediaElement(mediaElement) {
    this.mediaElement_ = mediaElement;
  }


  /**
   * @override
   * @export
   */
  setCmsdManager(cmsdManager) {
  }


  /**
   * @override
   * @export
   */
  configure(config) {
  }

  /**
   * @private
   */
  evaluate_() {
    // ... tick
  }
};
