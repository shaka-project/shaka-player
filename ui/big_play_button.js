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


goog.provide('shaka.ui.BigPlayButton');

goog.require('shaka.ui.PlayButton');


/**
 * @extends {shaka.ui.PlayButton}
 * @final
 * @export
 */
shaka.ui.BigPlayButton = class extends shaka.ui.PlayButton {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    this.button.classList.add('shaka-play-button');
    this.button.classList.add('shaka-no-propagation');

    this.updateIcon_();
    this.updateAriaLabel();

    this.eventManager.listen(this.video, 'play', () => {
      this.updateIcon_();
    });

    this.eventManager.listen(this.video, 'pause', () => {
      this.updateIcon_();
    });
  }


  /** @private */
  updateIcon_() {
    if (this.isPaused()) {
      this.button.setAttribute('icon', 'play');
    } else {
      this.button.setAttribute('icon', 'pause');
    }
  }
};
