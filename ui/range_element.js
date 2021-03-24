/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


goog.provide('shaka.ui.RangeElement');

goog.require('shaka.ui.Element');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Timer');


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
   * @param {!Array.<string>} containerClassNames
   * @param {!Array.<string>} barClassNames
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
    // TODO(#2027): step=any causes keyboard nav problems on IE 11.
    this.bar.step = 'any';
    this.bar.min = '0';
    this.bar.max = '1';
    this.bar.value = '0';

    this.container.appendChild(this.bar);
    this.parent.appendChild(this.container);

    this.eventManager.listen(this.bar, 'mousedown', () => {
      if (this.controls.isOpaque()) {
        this.isChanging_ = true;
        this.onChangeStart();
      }
    });

    this.eventManager.listen(this.bar, 'touchstart', (e) => {
      if (this.controls.isOpaque()) {
        this.isChanging_ = true;
        this.setBarValueForTouch_(e);
        this.onChangeStart();
      }
    });

    this.eventManager.listen(this.bar, 'input', () => {
      this.onChange();
    });

    this.eventManager.listen(this.bar, 'touchmove', (e) => {
      if (this.isChanging_) {
        this.setBarValueForTouch_(e);
        this.onChange();
      }
    });

    this.eventManager.listen(this.bar, 'touchend', (e) => {
      if (this.isChanging_) {
        this.isChanging_ = false;
        this.setBarValueForTouch_(e);
        this.onChangeEnd();
      }
    });

    this.eventManager.listen(this.bar, 'mouseup', () => {
      if (this.isChanging_) {
        this.isChanging_ = false;
        this.onChangeEnd();
      }
    });
  }

  /** @override */
  destroy() {
    if (this.endFakeChangeTimer_) {
      this.endFakeChangeTimer_.stop();
      this.endFakeChangeTimer_ = null;
    }

    return super.destroy();
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
   * Synchronize the touch position with the range value.
   * Comes in handy on iOS, where users have to grab the handle in order
   * to start seeking.
   * @param {Event} event
   * @private
   */
  setBarValueForTouch_(event) {
    event.preventDefault();

    const changedTouch = /** @type {TouchEvent} */ (event).changedTouches[0];
    const rect = this.bar.getBoundingClientRect();
    const min = parseFloat(this.bar.min);
    const max = parseFloat(this.bar.max);

    // Calculate the range value based on the touch position.

    // Pixels from the left of the range element
    const touchPosition = changedTouch.clientX - rect.left;

    // Pixels per unit value of the range element.
    const scale = (max - min) / rect.width;

    // Touch position in units, which may be outside the allowed range.
    let value = min + scale * touchPosition;

    // Keep value within bounds.
    if (value < min) {
      value = min;
    } else if (value > max) {
      value = max;
    }

    this.bar.value = value;
  }
};
