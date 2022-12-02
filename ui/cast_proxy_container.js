/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.CastProxyContainer');

goog.require('shaka.cast.CastProxy');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');

goog.requireType('shaka.Player');


/**
 * A class that encapsulates the relationship between the UI and the cast proxy,
 * so that it can be removed at build time if necessary.
 * This version wraps around an actual cast proxy.
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

    this.castProxy_ = new shaka.cast.CastProxy(
        video, player, receiverAppId, androidReceiverCompatible);
  }

  /**
   * @override
   * @export
   */
  async destroy() {
    await this.castProxy_.destroy();
    super.release();
  }

  /**
   * @param {string} type The event type to listen for.
   * @param {shaka.util.FakeEventTarget.ListenerType} listener
   * @param {(!AddEventListenerOptions|boolean)=} options
   * @override
   */
  addEventListener(type, listener, options) {
    this.castProxy_.addEventListener(type, listener, options);
  }

  /**
   * @param {string} type
   * @param {shaka.util.FakeEventTarget.ListenerType} listener
   * @param {(EventListenerOptions|boolean)=} options
   * @override
   */
  removeEventListener(type, listener, options) {
    this.castProxy_.removeEventListener(type, listener, options);
  }

  /**
   * @param {Object} appData
   * @export
   */
  setAppData(appData) {
    this.castProxy_.setAppData(appData);
  }

  /** Suggests a disconnect. */
  suggestDisconnect() {
    this.castProxy_.suggestDisconnect();
  }

  /** @return {!Promise} */
  async cast() {
    await this.castProxy_.cast();
  }

  /**
   * @param {string} receiverAppId
   * @param {boolean} androidReceiverCompatible
   */
  changeReceiverId(receiverAppId, androidReceiverCompatible) {
    this.castProxy_.changeReceiverId(receiverAppId, androidReceiverCompatible);
  }

  /** @return {boolean} */
  canCast() {
    return this.castProxy_.canCast();
  }

  /** @return {boolean} */
  isCasting() {
    return this.castProxy_.isCasting();
  }

  /** @return {string} */
  receiverName() {
    return this.castProxy_.receiverName();
  }

  /** @return {HTMLMediaElement} */
  getVideo() {
    return this.castProxy_.getVideo();
  }

  /** @return {shaka.Player} */
  getPlayer() {
    return this.castProxy_.getPlayer();
  }
};
