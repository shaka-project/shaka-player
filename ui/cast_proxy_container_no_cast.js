/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.CastProxyContainer');

goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');

goog.requireType('shaka.Player');


/**
 * A class that encapsulates the relationship between the UI and the cast proxy,
 * so that it can be removed at build time if necessary.
 * This version is a dummy with no cast proxy.
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.ui.CastProxyContainer = class extends shaka.util.FakeEventTarget {
  /**
   * @param {!HTMLMediaElement} video The local video element associated with
   *   the local Player instance.
   * @param {!shaka.Player} player A local Player instance.
   * @param {string} receiverAppId The ID of the cast receiver application.
   *   If blank, casting will not be available, but the proxy will still
   *   function otherwise.
   * @param {boolean} androidReceiverCompatible Indicates if the app is
   *   compatible with an Android Receiver.
   */
  constructor(video, player, receiverAppId, androidReceiverCompatible) {
    super();

    /** @private {!HTMLMediaElement} */
    this.video_ = video;

    /** @private {!shaka.Player} */
    this.player_ = player;
  }

  /**
   * @override
   * @export
   */
  async destroy() {
    await Promise.resolve();
  }

  /**
   * @param {Object} appData
   * @export
   */
  setAppData(appData) {}

  /** Suggests a disconnect. */
  suggestDisconnect() {}

  /** @return {!Promise} */
  async cast() {
    await Promise.resolve();
  }

  /**
   * @param {string} receiverAppId
   * @param {boolean} androidReceiverCompatible
   */
  changeReceiverId(receiverAppId, androidReceiverCompatible) {}

  /** @return {boolean} */
  canCast() {
    return false;
  }

  /** @return {boolean} */
  isCasting() {
    return false;
  }

  /** @return {string} */
  receiverName() {
    return 'dummy';
  }

  /** @return {HTMLMediaElement} */
  getVideo() {
    return this.video_;
  }

  /** @return {shaka.Player} */
  getPlayer() {
    return this.player_;
  }
};
