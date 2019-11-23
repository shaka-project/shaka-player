/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.VTTCue');

goog.require('shaka.log');
goog.require('shaka.polyfill');


/**
 * @summary A polyfill to provide VTTCue.
 */
shaka.polyfill.VTTCue = class {
  /**
   * Install the polyfill if needed.
   */
  static install() {
    if (window.VTTCue) {
      shaka.log.info('Using native VTTCue.');
      return;
    }

    if (!window.TextTrackCue) {
      shaka.log.error('VTTCue not available.');
      return;
    }

    const constructorLength = TextTrackCue.length;
    if (constructorLength == 3) {
      shaka.log.info('Using VTTCue polyfill from 3 argument TextTrackCue.');
      window.VTTCue = shaka.polyfill.VTTCue.from3ArgsTextTrackCue_;
    } else if (constructorLength == 6) {
      shaka.log.info('Using VTTCue polyfill from 6 argument TextTrackCue.');
      window.VTTCue = shaka.polyfill.VTTCue.from6ArgsTextTrackCue_;
    } else if (shaka.polyfill.VTTCue.canUse3ArgsTextTrackCue_()) {
      shaka.log.info('Using VTTCue polyfill from 3 argument TextTrackCue.');
      window.VTTCue = shaka.polyfill.VTTCue.from3ArgsTextTrackCue_;
    }
  }

  /**
   * Draft spec TextTrackCue with 3 constructor arguments.
   * @see {@link https://bit.ly/2IdyKbA W3C Working Draft 25 October 2012}.
   *
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} text
   * @return {TextTrackCue}
   * @private
   */
  static from3ArgsTextTrackCue_(startTime, endTime, text) {
    return new window.TextTrackCue(startTime, endTime, text);
  }

  /**
   * Draft spec TextTrackCue with 6 constructor arguments (5th & 6th are
   * optional).
   * @see {@link https://bit.ly/2KaGSP2 W3C Working Draft 29 March 2012}.
   *
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} text
   * @return {TextTrackCue}
   * @private
   */
  static from6ArgsTextTrackCue_(startTime, endTime, text) {
    const id = startTime + '-' + endTime + '-' + text;
    // Quoting the access to the TextTrackCue object to satisfy the compiler.
    return new window['TextTrackCue'](id, startTime, endTime, text);
  }

  /**
   * IE10, IE11 and Edge return TextTrackCue.length = 0, although they accept 3
   * constructor arguments.
   *
   * @return {boolean}
   * @private
   */
  static canUse3ArgsTextTrackCue_() {
    try {
      return !!shaka.polyfill.VTTCue.from3ArgsTextTrackCue_(1, 2, '');
    } catch (error) {
      return false;
    }
  }
};


shaka.polyfill.register(shaka.polyfill.VTTCue.install);
