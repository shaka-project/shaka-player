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

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.VolumeBar = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    // This container is to support IE 11.  See detailed notes in
    // less/range_elements.less for a complete explanation.
    // TODO: Factor this into a range-element component.
    /** @private {!HTMLElement} */
    this.container_ = shaka.util.Dom.createHTMLElement('div');
    this.container_.classList.add('shaka-volume-bar-container');

    this.bar_ =
      /** @type {!HTMLInputElement} */ (document.createElement('input'));
    this.bar_.classList.add('shaka-volume-bar');
    this.bar_.setAttribute('type', 'range');
    // NOTE: step=any causes keyboard nav problems on IE 11.
    this.bar_.setAttribute('step', 'any');
    this.bar_.setAttribute('min', '0');
    this.bar_.setAttribute('max', '1');
    this.bar_.setAttribute('value', '0');

    this.container_.appendChild(this.bar_);
    this.parent.appendChild(this.container_);
    this.updateAriaLabel_();

    this.eventManager.listen(this.video, 'volumechange', () => {
      this.onVolumeStateChange_();
    });

    this.eventManager.listen(this.bar_, 'input', () => {
      this.onVolumeInput_();
    });

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
        this.updateAriaLabel_();
      });

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
        this.updateAriaLabel_();
      });

    // Initialize volume display with a fake event.
    this.onVolumeStateChange_();
  }


  /**
   * @private
   */
  onVolumeStateChange_() {
    if (this.video.muted) {
        this.bar_.value = 0;
    } else {
        this.bar_.value = this.video.volume;
    }

    // TODO: Can we do this with LESS?
    let gradient = ['to right'];
    gradient.push(shaka.ui.Constants.VOLUME_BAR_VOLUME_LEVEL_COLOR +
                 (this.bar_.value * 100) + '%');
    gradient.push(shaka.ui.Constants.VOLUME_BAR_BASE_COLOR +
                 (this.bar_.value * 100) + '%');
    gradient.push(shaka.ui.Constants.VOLUME_BAR_BASE_COLOR + '100%');
    this.container_.style.background =
        'linear-gradient(' + gradient.join(',') + ')';
  }


  /**
   * @private
   */
  onVolumeInput_() {
    this.video.volume = parseFloat(this.bar_.value);
    if (this.video.volume == 0) {
      this.video.muted = true;
    } else {
      this.video.muted = false;
    }
  }


  /**
   * @private
   */
  updateAriaLabel_() {
    this.bar_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
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
