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


goog.provide('shaka.ui.SeekBar');

goog.require('shaka.ui.Constants');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.RangeElement');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Timer');


/**
 * @extends {shaka.ui.RangeElement}
 * @final
 * @export
 */
shaka.ui.SeekBar = class extends shaka.ui.RangeElement {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        ['shaka-seek-bar-container'],
        [
          'shaka-seek-bar',
          'shaka-no-propagation',
          'shaka-show-controls-on-mouse-over',
        ]);

    /**
     * This timer is used to introduce a delay between the user scrubbing across
     * the seek bar and the seek being sent to the player.
     *
     * @private {shaka.util.Timer}
     */
    this.seekTimer_ = new shaka.util.Timer(() => {
      this.video.currentTime = this.getValue();
    });

    this.eventManager.listen(this.localization,
        shaka.ui.Localization.LOCALE_UPDATED,
        () => this.updateAriaLabel_());

    this.eventManager.listen(this.localization,
        shaka.ui.Localization.LOCALE_CHANGED,
        () => this.updateAriaLabel_());

    // Initialize seek state and label.
    this.setValue(this.video.currentTime);
    this.update();
    this.updateAriaLabel_();
  }

  /** @override */
  async destroy() {
    if (this.seekTimer_) {
      this.seekTimer_.stop();
      this.seekTimer_ = null;
    }

    await super.destroy();
  }

  /**
   * Called by the base class when user interaction with the input element
   * begins.
   *
   * @override
   */
  onChangeStart() {
    this.video.pause();
  }

  /**
   * Update the video element's state to match the input element's state.
   * Called by the base class when the input element changes.
   *
   * @override
   */
  onChange() {
    if (!this.video.duration) {
      // Can't seek yet.  Ignore.
      return;
    }

    // Update the UI right away.
    this.update();

    // We want to wait until the user has stopped moving the seek bar for a
    // little bit to reduce the number of times we ask the player to seek.
    //
    // To do this, we will start a timer that will fire in a little bit, but if
    // we see another seek bar change, we will cancel that timer and re-start
    // it.
    //
    // Calling |start| on an already pending timer will cancel the old request
    // and start the new one.
    this.seekTimer_.tickAfter(/* seconds= */ 0.125);
  }

  /**
   * Called by the base class when user interaction with the input element
   * ends.
   *
   * @override
   */
  onChangeEnd() {
    // They just let go of the seek bar, so cancel the timer and manually
    // call the event so that we can respond immediately.
    this.seekTimer_.tickNow();

    this.video.play();
  }

  /** @return {boolean} */
  isShowing() {
    // It is showing by default, so it is hidden if shaka-hidden is in the list.
    return !this.container.classList.contains('shaka-hidden');
  }

  /**
   * Called by Controls on a timer to update the state of the seek bar.
   * Also called internally when the user interacts with the input element.
   */
  update() {
    const Constants = shaka.ui.Constants;

    const currentTime = this.getValue();
    const bufferedLength = this.video.buffered.length;
    const bufferedStart = bufferedLength ? this.video.buffered.start(0) : 0;
    const bufferedEnd =
        bufferedLength ? this.video.buffered.end(bufferedLength - 1) : 0;

    const seekRange = this.player.seekRange();
    const seekRangeSize = seekRange.end - seekRange.start;

    this.setRange(seekRange.start, seekRange.end);

    // Hide seekbar if the seek window is very small.
    if (this.player.isLive() &&
        seekRangeSize < Constants.MIN_SEEK_WINDOW_TO_SHOW_SEEKBAR) {
      shaka.ui.Utils.setDisplay(this.container, false);
    } else {
      shaka.ui.Utils.setDisplay(this.container, true);

      const gradient = ['to right'];
      if (bufferedLength == 0) {
        gradient.push('#000 0%');
      } else {
        const clampedBufferStart = Math.max(bufferedStart, seekRange.start);
        const clampedBufferEnd = Math.min(bufferedEnd, seekRange.end);
        const clampedCurrentTime = Math.min(
            Math.max(currentTime, seekRange.start),
            seekRange.end);

        const bufferStartDistance = clampedBufferStart - seekRange.start;
        const bufferEndDistance = clampedBufferEnd - seekRange.start;
        const playheadDistance = clampedCurrentTime - seekRange.start;

        // NOTE: the fallback to zero eliminates NaN.
        const bufferStartFraction = (bufferStartDistance / seekRangeSize) || 0;
        const bufferEndFraction = (bufferEndDistance / seekRangeSize) || 0;
        const playheadFraction = (playheadDistance / seekRangeSize) || 0;

        gradient.push(Constants.SEEK_BAR_BASE_COLOR + ' ' +
                     (bufferStartFraction * 100) + '%');
        gradient.push(Constants.SEEK_BAR_PLAYED_COLOR + ' ' +
                     (bufferStartFraction * 100) + '%');
        gradient.push(Constants.SEEK_BAR_PLAYED_COLOR + ' ' +
                     (playheadFraction * 100) + '%');
        gradient.push(Constants.SEEK_BAR_BUFFERED_COLOR + ' ' +
                     (playheadFraction * 100) + '%');
        gradient.push(Constants.SEEK_BAR_BUFFERED_COLOR + ' ' +
                     (bufferEndFraction * 100) + '%');
        gradient.push(Constants.SEEK_BAR_BASE_COLOR + ' ' +
                     (bufferEndFraction * 100) + '%');
      }
      this.container.style.background =
          'linear-gradient(' + gradient.join(',') + ')';
    }
  }

  /** @private */
  updateAriaLabel_() {
    this.bar.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(shaka.ui.Locales.Ids.SEEK));
  }
};
