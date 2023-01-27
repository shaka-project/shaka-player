/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.Orientation');

goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.polyfill');


/**
 * @summary A polyfill for systems that do not implement screen.orientation.
 * For now, this only handles systems that implement the deprecated
 * window.orientation feature... e.g. iPad.
 * @export
 */
shaka.polyfill.Orientation = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    if (screen.orientation) {
      // Not needed.
      return;
    }

    // There is no way to check to see if the 'orientationchange' event exists
    // on window, which could theoretically lead to this making a
    // screen.orientation object that doesn't actually work.
    // However, it looks like all platforms that support the deprecated
    // window.orientation feature also support that event.
    if (window.orientation != undefined) {
      shaka.polyfill.Orientation.installBasedOnWindowMethods_();
    }
  }

  /**
   * Makes a polyfill for orientation, based on window methods.
   * Note that some of the features this is based on are deprecated, so this
   * will not necessarily work on all platforms.
   * @private
   */
  static installBasedOnWindowMethods_() {
    const orientation = new shaka.polyfill.Orientation.FakeOrientation();
    screen.orientation = /** @type {!ScreenOrientation} */ (orientation);
    const setValues = () => {
      switch (window.orientation) {
        case -90:
          orientation.type = 'landscape-secondary';
          orientation.angle = 270;
          break;
        case 0:
          orientation.type = 'portrait-primary';
          orientation.angle = 0;
          break;
        case 90:
          orientation.type = 'landscape-primary';
          orientation.angle = 90;
          break;
        case 180:
          orientation.type = 'portrait-secondary';
          orientation.angle = 180;
          break;
      }
    };

    setValues();
    window.addEventListener('orientationchange', () => {
      setValues();
      orientation.dispatchChangeEvent();
    });
  }
};


shaka.polyfill.Orientation.FakeOrientation =
class extends shaka.util.FakeEventTarget {
  /** */
  constructor() {
    super();

    /** @type {string} */
    this.type = '';

    /** @type {number} */
    this.angle = 0;
  }

  /** Dispatch a 'change' event. */
  dispatchChangeEvent() {
    const event = new shaka.util.FakeEvent('change');
    this.dispatchEvent(event);
  }

  /**
   * @param {string} orientation
   * @return {!Promise}
   */
  lock(orientation) {
    /**
     * @param {string} orientation
     * @return {boolean}
     */
    const lockOrientation = (orientation) => {
      if (screen.lockOrientation) {
        return screen.lockOrientation(orientation);
      }
      if (screen.mozLockOrientation) {
        return screen.mozLockOrientation(orientation);
      }
      if (screen.msLockOrientation) {
        return screen.msLockOrientation(orientation);
      }
      return false;
    };

    let success = false;
    // The set of input strings for screen.orientation.lock and for
    // screen.lockOrientation are almost, but not entirely, the same.
    switch (orientation) {
      case 'natural':
        success = lockOrientation('default');
        break;
      case 'any':
        // It's not quite clear what locking the screen orientation to 'any'
        // is supposed to mean... presumably, that's equivalent to not being
        // locked?
        success = true;
        this.unlock();
        break;
      default:
        success = lockOrientation(orientation);
        break;
    }
    // According to the docs, there "may be a delay" between the
    // lockOrientation method being called and the screen actually being
    // locked.  Unfortunately, without any idea as to how long that delay is,
    // and with no events to listen for, we cannot account for it here.
    if (success) {
      return Promise.resolve();
    }
    // Either locking was not available, or the process failed... either way,
    // reject this with a mock error.
    // This should be a DOMException, but there is not a public constructor for
    // that.  So we make this look-alike instead.
    const unsupportedKeySystemError =
        new Error('screen.orientation.lock() is not available on this device');
    unsupportedKeySystemError.name = 'NotSupportedError';
    unsupportedKeySystemError['code'] = DOMException.NOT_SUPPORTED_ERR;
    return Promise.reject(unsupportedKeySystemError);
  }

  /** Unlock the screen orientation. */
  unlock() {
    // screen.unlockOrientation has a return value, but
    // screen.orientation.unlock does not. So ignore the return value.
    if (screen.unlockOrientation) {
      screen.unlockOrientation();
    } else if (screen.mozUnlockOrientation) {
      screen.mozUnlockOrientation();
    } else if (screen.msUnlockOrientation) {
      screen.msUnlockOrientation();
    }
  }
};


shaka.polyfill.register(shaka.polyfill.Orientation.install);
