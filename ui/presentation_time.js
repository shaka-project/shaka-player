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


goog.provide('shaka.ui.PresentationTimeTracker');

goog.require('shaka.ui.Element');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.PresentationTimeTracker = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    this.currentTime_ = shaka.util.Dom.createHTMLElement('button');
    this.currentTime_.classList.add('shaka-current-time');
    this.setValue_('0:00');
    this.parent.appendChild(this.currentTime_);

    this.eventManager.listen(this.currentTime_, 'click', () => {
      // Jump to LIVE if the user clicks on the current time.
      if (this.player.isLive()) {
        this.video.currentTime = this.player.seekRange().end;
      }
    });

    this.eventManager.listen(this.controls, 'timeandseekrangeupdated', () => {
      this.updateTime_();
    });

    this.eventManager.listen(this.player, 'trackschanged', () => {
      this.onTracksChanged_();
    });
  }

  /** @private */
  setValue_(value) {
    // To avoid constant updates to the DOM, which makes debugging more
    // difficult, only set the value if it has changed.  If we don't do this
    // check, the DOM updates constantly, this element flashes in the debugger
    // in Chrome, and you can't make changes in the CSS panel.
    if (value != this.currentTime_.textContent) {
      this.currentTime_.textContent = value;
    }
  }

  /** @private */
  updateTime_() {
    const isSeeking = this.controls.isSeeking();
    let displayTime = this.controls.getDisplayTime();
    let duration = this.video.duration;
    let seekRange = this.player.seekRange();
    let seekRangeSize = seekRange.end - seekRange.start;

    if (this.player.isLive()) {
      // The amount of time we are behind the live edge.
      let behindLive = Math.floor(seekRange.end - displayTime);
      displayTime = Math.max(0, behindLive);

      let showHour = seekRangeSize >= 3600;

      // Consider "LIVE" when less than 1 second behind the live-edge.  Always
      // show the full time string when seeking, including the leading '-';
      // otherwise, the time string "flickers" near the live-edge.
      // The button should only be clickable when it's live stream content, and
      // the current play time is behind live edge.
      if ((displayTime >= 1) || isSeeking) {
        this.setValue_('- ' + this.buildTimeString_(displayTime, showHour));
        this.currentTime_.disabled = false;
      } else {
        this.setValue_(this.localization.resolve(shaka.ui.Locales.Ids.LIVE));
        this.currentTime_.disabled = true;
      }
    } else {
      let showHour = duration >= 3600;

      let value = this.buildTimeString_(displayTime, showHour);
      if (duration) {
        value += ' / ' +
            this.buildTimeString_(duration, showHour);
      }
      this.setValue_(value);
      this.currentTime_.disabled = true;
    }
  }


  /**
   * Builds a time string, e.g., 01:04:23, from |displayTime|.
   *
   * @param {number} displayTime
   * @param {boolean} showHour
   * @return {string}
   * @private
   */
  buildTimeString_(displayTime, showHour) {
    let h = Math.floor(displayTime / 3600);
    let m = Math.floor((displayTime / 60) % 60);
    let s = Math.floor(displayTime % 60);
    if (s < 10) s = '0' + s;
    let text = m + ':' + s;
    if (showHour) {
      if (m < 10) text = '0' + text;
      text = h + ':' + text;
    }
    return text;
  }

  /**
   * Set the aria label to be 'Live' when the content is live stream.
   */
  onTracksChanged_() {
    if (this.player.isLive()) {
      const ariaLabel = shaka.ui.Locales.Ids.SKIP_TO_LIVE;
      this.currentTime_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
          this.localization.resolve(ariaLabel));
    }
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.PresentationTimeTracker.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.PresentationTimeTracker(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
  'time_and_duration', new shaka.ui.PresentationTimeTracker.Factory());
