/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cast.CastProxy');

goog.require('shaka.Player');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');

/**
 * @summary A dummy version of the cast proxy. Meant to allow Shaka Player to
 * build the UI without the cast system.
 *
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.cast.CastProxy = class extends shaka.util.FakeEventTarget {
  /**
   * @param {!HTMLMediaElement} video
   * @param {!shaka.Player} player
   * @param {string} receiverAppId
   * @param {boolean} androidReceiverCompatible
   */
  constructor(video, player, receiverAppId, androidReceiverCompatible = false) {
    super();

    /** @private {!HTMLMediaElement} */
    this.video_ = video;

    /** @private {!shaka.Player} */
    this.player_ = player;
  }

  /**
   * @param {boolean=} forceDisconnect
   * @override
   * @export
   */
  async destroy(forceDisconnect) {
    await this.player_.destroy();
    super.release();
  }

  /**
   * @return {!HTMLMediaElement}
   * @export
   */
  getVideo() {
    return this.video_;
  }

  /**
   * @return {!shaka.Player}
   * @export
   */
  getPlayer() {
    return this.player_;
  }

  /**
   * @return {boolean}
   * @export
   */
  canCast() {
    return false;
  }

  /**
   * @return {boolean}
   * @export
   */
  isCasting() {
    return false;
  }

  /**
   * @return {string}
   * @export
   */
  receiverName() {
    return 'dummy';
  }

  /**
   * @return {!Promise}
   * @export
   */
  async cast() {
    await Promise.resolve();
  }

  /**
   * @param {Object} appData
   * @export
   */
  setAppData(appData) {}

  /**
   * @export
   */
  suggestDisconnect() {}

  /**
   * @export
   */
  forceDisconnect() {}


  /**
   * @param {string} newAppId
   * @param {boolean=} newCastAndroidReceiver
   * @export
   */
  async changeReceiverId(newAppId, newCastAndroidReceiver = false) {
    await Promise.resolve();
  }
};
