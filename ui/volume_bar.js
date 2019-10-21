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


goog.provide('shaka.ui.VolumeBar');

goog.require('shaka.ui.Constants');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.RangeElement');


/**
 * @extends {shaka.ui.RangeElement}
 * @final
 * @export
 */
shaka.ui.VolumeBar = class extends shaka.ui.RangeElement {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        ['shaka-volume-bar-container'], ['shaka-volume-bar']);

    /** @private {!shaka.extern.UIConfiguration} */
    this.config_ = this.controls.getConfig();

    this.eventManager.listen(this.video,
        'volumechange',
        () => this.onVolumeStateChange_());

    this.eventManager.listen(this.localization,
        shaka.ui.Localization.LOCALE_UPDATED,
        () => this.updateAriaLabel_());

    this.eventManager.listen(this.localization,
        shaka.ui.Localization.LOCALE_CHANGED,
        () => this.updateAriaLabel_());

    // Initialize volume display and label.
    this.onVolumeStateChange_();
    this.updateAriaLabel_();
  }

  /**
   * Update the video element's state to match the input element's state.
   * Called by the base class when the input element changes.
   *
   * @override
   */
  onChange() {
    this.video.volume = this.getValue();
    if (this.video.volume == 0) {
      this.video.muted = true;
    } else {
      this.video.muted = false;
    }
  }

  /** @private */
  onVolumeStateChange_() {
    if (this.video.muted) {
      this.setValue(0);
    } else {
      this.setValue(this.video.volume);
    }

    const colors = this.config_.volumeBarColors;
    const gradient = ['to right'];
    gradient.push(colors.level + (this.getValue() * 100) + '%');
    gradient.push(colors.base + (this.getValue() * 100) + '%');
    gradient.push(colors.base + '100%');

    this.container.style.background =
        'linear-gradient(' + gradient.join(',') + ')';
  }

  /** @private */
  updateAriaLabel_() {
    this.bar.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(shaka.ui.Locales.Ids.VOLUME));
  }
};

/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.VolumeBar.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.VolumeBar(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement('volume', new shaka.ui.VolumeBar.Factory());
