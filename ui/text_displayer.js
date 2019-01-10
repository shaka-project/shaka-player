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


goog.provide('shaka.ui.TextDisplayer');

goog.require('shaka.ui.Utils');


/**
 * @implements {shaka.extern.TextDisplayer}
 * @final
 * @export
 */
shaka.ui.TextDisplayer = class {
  /**
   * Constructor.
   * @param {HTMLMediaElement} video
   * @param {!HTMLElement} videoContainer
   */
  constructor(video, videoContainer) {
    /** @private {boolean} */
    this.isTextVisible_ = false;

    /** @private {!Array.<!shaka.extern.Cue>} */
    this.cues_ = [];

    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {HTMLElement} */
    this.videoContainer_ = videoContainer;

    /** @type {HTMLElement} */
    this.textDisplayPanel_ = shaka.ui.Utils.createHTMLElement('div');
    this.textDisplayPanel_.classList.add('shaka-text-display');
    this.videoContainer_.appendChild(this.textDisplayPanel_);

    /**
     * The captions' update period in seconds.
     * @private {number}
     */
    const updatePeriod = 0.25;

    /** @private {shaka.util.Timer} */
    this.captionsTimer_ =
      new shaka.util.Timer(() => this.updateCaptions_());

    this.captionsTimer_.start(updatePeriod, /* repeating= */ true);

    /** private {Map.<!shaka.extern.Cue, !HTMLElement>} */
    this.currentCuesMap_ = new Map();
  }


  /**
   * @override
   * @export
   */
  append(cues) {
    // Add the cues.
    this.cues_ = this.cues_.concat(cues);

    // Sort all the cues based on the start time and end time.
    this.cues_ = this.cues_.slice().sort((a, b) => {
      if (a.startTime != b.startTime) {
        return a.startTime - b.startTime;
      } else {
        return a.endTime - b.endTime;
      }
    });
  }


  /**
   * @override
   * @export
   */
  destroy() {
    // Remove the text display panel element from the UI.
    this.videoContainer_.removeChild(this.textDisplayPanel_);
    this.textDisplayPanel_ = null;

    this.isTextVisible_ = false;
    this.cues_ = [];
    if (this.captionsTimer_) {
      this.captionsTimer_.stop();
    }

    this.currentCuesMap_.clear();
  }


  /**
   * @override
   * @export
   */
  remove(start, end) {
    this.cues_ = this.cues_.filter((cue) => {
      return cue.endTime <= start || cue.startTime >= end;
    });
    // Clear the previously displayed captions.
    while (this.textDisplayPanel_.firstChild) {
      this.textDisplayPanel_.removeChild(this.textDisplayPanel_.firstChild);
    }

    return true;
  }


  /**
   * @override
   * @export
   */
  isTextVisible() {
    return this.isTextVisible_;
  }

  /**
   * @override
   * @export
   */
  setTextVisibility(on) {
    this.isTextVisible_ = on;
  }

  /**
   * Display the current captions.
   * @private
   */
  updateCaptions_() {
    // For each cue in the current cues map, if the cue's end time has passed,
    // remove the entry from the map, and remove the captions from the page.
    for (const cue of this.currentCuesMap_.keys()) {
      if (cue.startTime > this.video_.currentTime ||
          cue.endTime < this.video_.currentTime) {
        const captionsText = this.currentCuesMap_.get(cue);
        this.textDisplayPanel_.removeChild(captionsText);
        this.currentCuesMap_.delete(cue);
      }
    }

    // Get the current cues that should be displayed. If the cue is not being
    // displayed already, add it to the map, and add the captions onto the page.
    const currentCues = this.cues_.filter((cue) => {
      return cue.startTime <= this.video_.currentTime &&
             cue.endTime > this.video_.currentTime;
    });

    for (const cue of currentCues) {
      if (!this.currentCuesMap_.has(cue)) {
        const captionsText = shaka.ui.Utils.createHTMLElement('span');
        captionsText.textContent = cue.payload;
        this.textDisplayPanel_.appendChild(captionsText);
        this.currentCuesMap_.set(cue, captionsText);
      }
    }
  }
};
