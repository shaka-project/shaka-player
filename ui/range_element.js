/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.RangeElement');

goog.require('shaka.ui.Element');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Timer');
goog.requireType('shaka.ui.Controls');


/**
 * A range element, built to work across browsers.
 *
 * In particular, getting styles to work right on IE requires a specific
 * structure.
 *
 * This also handles the case where the range element is being manipulated and
 * updated at the same time.  This can happen when seeking during playback or
 * when casting.
 *
 * @implements {shaka.extern.IUIRangeElement}
 * @export
 */
shaka.ui.RangeElement = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {!Array<string>} containerClassNames
   * @param {!Array<string>} barClassNames
   */
  constructor(parent, controls, containerClassNames, barClassNames) {
    super(parent, controls);

    /**
     * This container is to support IE 11.  See detailed notes in
     * less/range_elements.less for a complete explanation.
     * @protected {!HTMLElement}
     */
    this.container = shaka.util.Dom.createHTMLElement('div');
    this.container.classList.add('shaka-range-container');
    this.container.classList.add(...containerClassNames);

    /** @private {boolean} */
    this.isChanging_ = false;

    /** @protected {!HTMLInputElement} */
    this.bar =
      /** @type {!HTMLInputElement} */ (document.createElement('input'));

    /** @private {shaka.util.Timer} */
    this.endFakeChangeTimer_ = new shaka.util.Timer(() => {
      this.onChangeEnd();
      this.isChanging_ = false;
    });

    this.bar.classList.add('shaka-range-element');
    this.bar.classList.add(...barClassNames);
    this.bar.type = 'range';
    this.bar.step = 'any';
    this.bar.min = '0';
    this.bar.max = '1';
    this.bar.value = '0';
    this.bar.disabled = !this.controls.isOpaque();

    this.container.appendChild(this.bar);
    this.parent.appendChild(this.container);

    this.showingUITimer_ = new shaka.util.Timer(() => {
      this.bar.disabled = false;
    });

    this.eventManager.listen(this.controls, 'showingui', (e) => {
      this.showingUITimer_.tickAfter(/* seconds= */ 0);
    });

    this.eventManager.listen(this.controls, 'hidingui', (e) => {
      this.showingUITimer_.stop();
      this.bar.disabled = true;
    });

    this.eventManager.listen(this.bar, 'mousedown', (e) => {
      if (!this.bar.disabled) {
        this.isChanging_ = true;
        this.onChangeStart();
        e.stopPropagation();
      }
    });

    this.eventManager.listen(this.bar, 'touchstart', (e) => {
      if (!this.bar.disabled) {
        this.isChanging_ = true;
        this.setBarValueForTouch_(e);
        this.onChangeStart();
        e.stopPropagation();
      }
    });

    this.eventManager.listen(this.bar, 'input', () => {
      this.onChange();
    });

    this.eventManager.listen(this.bar, 'touchmove', (e) => {
      if (this.isChanging_) {
        this.setBarValueForTouch_(e);
        this.onChange();
        e.stopPropagation();
      }
    });

    this.eventManager.listen(this.bar, 'touchend', (e) => {
      if (this.isChanging_) {
        this.isChanging_ = false;
        this.setBarValueForTouch_(e);
        this.onChangeEnd();
        e.stopPropagation();
      }
    });

    this.eventManager.listen(this.bar, 'touchcancel', (e) => {
      if (this.isChanging_) {
        this.isChanging_ = false;
        this.setBarValueForTouch_(e);
        this.onChangeEnd();
        e.stopPropagation();
      }
    });

    this.eventManager.listen(this.bar, 'mouseup', (e) => {
      if (this.isChanging_) {
        this.isChanging_ = false;
        this.onChangeEnd();
        e.stopPropagation();
      }
    });

    this.eventManager.listen(this.bar, 'blur', () => {
      if (this.isChanging_) {
        this.isChanging_ = false;
        this.onChangeEnd();
      }
    });

    this.eventManager.listen(this.bar, 'contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  /** @override */
  release() {
    if (this.endFakeChangeTimer_) {
      this.endFakeChangeTimer_.stop();
      this.endFakeChangeTimer_ = null;
    }

    super.release();
  }

  /**
   * @override
   * @export
   */
  setRange(min, max) {
    this.bar.min = min;
    this.bar.max = max;
  }

  /**
   * Called when user interaction begins.
   * To be overridden by subclasses.
   * @override
   * @export
   */
  onChangeStart() {}

  /**
   * Called when a new value is set by user interaction.
   * To be overridden by subclasses.
   * @override
   * @export
   */
  onChange() {}

  /**
   * Called when user interaction ends.
   * To be overridden by subclasses.
   * @override
   * @export
   */
  onChangeEnd() {}

  /**
   * Called to implement keyboard-based changes, where this is no clear "end".
   * This will simulate events like onChangeStart(), onChange(), and
   * onChangeEnd() as appropriate.
   *
   * @override
   * @export
   */
  changeTo(value) {
    if (!this.isChanging_) {
      this.isChanging_ = true;
      this.onChangeStart();
    }

    const min = parseFloat(this.bar.min);
    const max = parseFloat(this.bar.max);

    if (value > max) {
      this.bar.value = max;
    } else if (value < min) {
      this.bar.value = min;
    } else {
      this.bar.value = value;
    }
    this.onChange();

    this.endFakeChangeTimer_.tickAfter(/* seconds= */ 0.5);
  }

  /**
   * @override
   * @export
   */
  getValue() {
    return parseFloat(this.bar.value);
  }

  /**
   * @override
   * @export
   */
  setValue(value) {
    // The user interaction overrides any external values being pushed in.
    if (this.isChanging_) {
      return;
    }

    this.bar.value = value;
  }

  /**
   * Converts an X position within the element into a range input value.
   * @param {number} clientX
   * @return {number}
   */
  getValueFromPosition(clientX) {
    // Get the bounding rectangle of the range input element
    const rect = this.bar.getBoundingClientRect();

    // Parse the min, max, and step attributes from the input element
    const min = parseFloat(this.bar.min);
    const max = parseFloat(this.bar.max);
    const step = parseFloat(this.bar.step) || 1;

    // Define the effective range of the thumb movement
    // 12 is the value of @thumb-size in range_elements.less. Note: for
    // everything to work, this value has to be synchronized.
    const thumbWidth = 12;
    const minX = rect.left + thumbWidth / 2;
    const maxX = rect.right - thumbWidth / 2;

    // Clamp the touch X position to stay within the thumb's movement range
    const clampedX = Math.max(minX, Math.min(maxX, clientX));

    // Calculate the percentage of the track that the clamped X represents
    const percent = (clampedX - minX) / (maxX - minX);

    // Convert the percentage into a value within the input's range
    let value = min + percent * (max - min);

    // Round the value to the nearest step
    value = Math.round((value - min) / step) * step + min;

    // Ensure the value stays within the min and max bounds
    value = Math.min(max, Math.max(min, value));

    return value;
  }

  /**
   * Synchronize the touch position with the range value.
   * Comes in handy on iOS, where users have to grab the handle in order
   * to start seeking.
   * @param {Event} event
   * @private
   */
  setBarValueForTouch_(event) {
    event.preventDefault();

    const changedTouch = /** @type {TouchEvent} */ (event).changedTouches[0];

    this.bar.value = this.getValueFromPosition(changedTouch.clientX);
  }
};
