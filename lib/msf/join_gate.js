/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.JoinGate');

goog.require('shaka.log');
goog.require('shaka.util.Timer');
goog.requireType('shaka.msf.Utils');


/**
 * Puts a subscription that joins the current Group back in Location order.
 *
 * Joining delivers the current Group twice over: its first Objects on a
 * fetch stream (a Joining FETCH in draft-18, a fill fetch stream in draft-20
 * and later), and the rest of it, mid-group, on the subscription's own
 * streams. The two race, so the subscription's Objects can arrive first.
 * A segmenter or a segment index that is fed in arrival order then sees the
 * end of a Group before its start.
 *
 * So the fill is passed through as it comes, since it is the earliest part,
 * and the subscription's Objects are held until the fill is over. Then they
 * are handed on in Location order, and from there on the subscription passes
 * straight through. Whatever the subscription repeats of the fill is dropped.
 *
 * The fill is over when it reaches the Largest Object the SUBSCRIBE_OK
 * reported, when its stream ends or fails, or, for a publisher that never
 * sends it, after a timeout. A fill Object that arrives after that is too late
 * to be put in order and is dropped.
 *
 * @final
 */
shaka.msf.JoinGate = class {
  /**
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @param {string} description Used in log messages.
   */
  constructor(callback, description) {
    /** @private {shaka.msf.Utils.ObjectCallback} */
    this.callback_ = callback;

    /** @private {string} */
    this.description_ = description;

    /**
     * The subscription's Objects, while the fill is still running; null once
     * it is over.
     * @private {?Array<shaka.msf.Utils.MOQObject>}
     */
    this.held_ = [];

    /**
     * The last Object the fill delivered.
     * @private {?shaka.msf.Utils.Location}
     */
    this.fillEnd_ = null;

    /**
     * Where the fill ends, once the SUBSCRIBE_OK has said.
     * @private {?shaka.msf.Utils.Location}
     */
    this.largestObject_ = null;

    /** @private {shaka.util.Timer} */
    this.timer_ = new shaka.util.Timer(() => {
      shaka.log.warning(
          `${this.description_}: the current Group did not arrive in time; ` +
          'playing from the subscription alone');
      this.open();
    });
  }

  /**
   * Hands on an Object of the fill.
   *
   * @param {shaka.msf.Utils.MOQObject} obj
   */
  fromFill(obj) {
    if (!this.held_) {
      return;
    }
    this.fillEnd_ = obj.location;
    this.callback_(obj);
    if (this.largestObject_ &&
        shaka.msf.JoinGate.compare_(obj.location, this.largestObject_) >= 0) {
      this.open();
    }
  }

  /**
   * Hands on an Object of the subscription, or holds it until the fill is
   * over.
   *
   * @param {shaka.msf.Utils.MOQObject} obj
   */
  fromSubscription(obj) {
    if (this.held_) {
      this.held_.push(obj);
    } else if (!this.isFilled_(obj)) {
      this.callback_(obj);
    }
  }

  /**
   * Says what the SUBSCRIBE_OK reported as the Largest Object, which is where
   * the fill ends, and starts waiting for it.
   *
   * @param {(?shaka.msf.Utils.Location|undefined)} largestObject Null when
   *   nothing has been published on the track, so there is nothing to fill;
   *   undefined when the SUBSCRIBE_OK could not tell, so the fill ends only
   *   when its stream does.
   * @param {number} timeoutSeconds How long to wait for the fill.
   */
  expect(largestObject, timeoutSeconds) {
    if (largestObject === null) {
      this.open();
      return;
    }
    this.largestObject_ = largestObject || null;
    if (largestObject && this.fillEnd_ &&
        shaka.msf.JoinGate.compare_(this.fillEnd_, largestObject) >= 0) {
      this.open();
      return;
    }
    if (this.held_) {
      this.timer_.tickAfter(timeoutSeconds);
    }
  }

  /**
   * Ends the fill and hands on what the subscription delivered meanwhile.
   */
  open() {
    this.timer_.stop();
    const held = this.held_;
    if (!held) {
      return;
    }
    this.held_ = null;
    held.sort((a, b) => shaka.msf.JoinGate.compare_(a.location, b.location));
    for (const obj of held) {
      if (!this.isFilled_(obj)) {
        this.callback_(obj);
      }
    }
  }

  /**
   * Stops handing anything on.
   */
  release() {
    this.timer_.stop();
    this.held_ = null;
    this.callback_ = () => {};
  }

  /**
   * @param {shaka.msf.Utils.MOQObject} obj
   * @return {boolean} Whether the fill already delivered this Object.
   * @private
   */
  isFilled_(obj) {
    return !!this.fillEnd_ &&
        shaka.msf.JoinGate.compare_(obj.location, this.fillEnd_) <= 0;
  }

  /**
   * @param {shaka.msf.Utils.Location} a
   * @param {shaka.msf.Utils.Location} b
   * @return {number}
   * @private
   */
  static compare_(a, b) {
    if (a.group != b.group) {
      return a.group < b.group ? -1 : 1;
    }
    if (a.object != b.object) {
      return a.object < b.object ? -1 : 1;
    }
    return 0;
  }
};
