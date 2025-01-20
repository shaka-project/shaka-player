/*! @license
 * Shaka Player
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.StubTextDisplayer');

/**
 * A stub text displayer plugin that does nothing
 *
 * @implements {shaka.extern.TextDisplayer}
 * @export
 */
shaka.text.StubTextDisplayer = class {
  /**
   * @override
   * @export
   */
  configure(config) {
  }

  /**
   * @override
   * @export
   */
  remove(start, end) {
  }

  /**
   * @override
   * @export
   */
  append(cues) {
  }

  /**
   * @override
   * @export
   */
  destroy() {
  }

  /**
   * @override
   * @export
   */
  isTextVisible() {
    return false;
  }

  /**
   * @override
   * @export
   */
  setTextVisibility(on) {
  }

  /**
   * @override
   * @export
   */
  setTextLanguage(language) {
  }

  /**
   * @override
   * @export
   */
  enableTextDisplayer() {
  }
};
