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

goog.require('shaka.util.Dom');


/**
 * @implements {shaka.extern.TextDisplayer}
 * @final
 * @export
 */
shaka.ui.TextDisplayer = class {
  /**
   * Constructor.
   * @param {HTMLMediaElement} video
   * @param {HTMLElement} videoContainer
   */
  constructor(video, videoContainer) {
    /** @private {boolean} */
    this.isTextVisible_ = false;

    /** @private {!Array.<!shaka.text.Cue>} */
    this.cues_ = [];

    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {HTMLElement} */
    this.videoContainer_ = videoContainer;

    /** @type {HTMLElement} */
    this.textContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.textContainer_.classList.add('shaka-text-container');

    // Set the subtitles text-centered by default.
    this.textContainer_.style.textAlign = 'center';

    // Set the captions in the middle horizontally by default.
    this.textContainer_.style.display = 'flex';
    this.textContainer_.style.flexDirection = 'column';
    this.textContainer_.style.alignItems = 'center';

    // Set the captions at the bottom by default.
    this.textContainer_.style.justifyContent = 'flex-end';

    this.videoContainer_.appendChild(this.textContainer_);

    /**
     * The captions' update period in seconds.
     * @private {number}
     */
    const updatePeriod = 0.25;

    /** @private {shaka.util.Timer} */
    this.captionsTimer_ = new shaka.util.Timer(() => {
      this.updateCaptions_();
    }).tickEvery(updatePeriod);

    /** private {Map.<!shaka.extern.Cue, !HTMLElement>} */
    this.currentCuesMap_ = new Map();
  }


  /**
   * @override
   * @export
   */
  append(cues) {
    // Clone the cues list for performace optimization. We can avoid the cues
    // list growing during the comparisons for duplicate cues.
    // See: https://github.com/google/shaka-player/issues/3018
    const cuesList = [...this.cues_];
    for (const cue of cues) {
      // When a VTT cue spans a segment boundary, the cue will be duplicated
      // into two segments.
      // To avoid displaying duplicate cues, if the current cue list already
      // contains the cue, skip it.
      const containsCue = cuesList.some(
          (cueInList) => shaka.text.Cue.equal(cueInList, cue));
      if (!containsCue) {
        this.cues_.push(cue);
      }
    }
  }


  /**
   * @override
   * @export
   */
  destroy() {
    // Remove the text container element from the UI.
    this.videoContainer_.removeChild(this.textContainer_);
    this.textContainer_ = null;

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
    // Return false if destroy() has been called.
    if (!this.textContainer_) {
      return false;
    }

    // Remove the cues out of the time range.
    this.cues_ = this.cues_.filter(
        (cue) => cue.startTime < start || cue.endTime >= end);
    this.updateCaptions_();

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
    const currentTime = this.video_.currentTime;

    // Return true if the cue should be displayed at the current time point.
    const shouldCueBeDisplayed = (cue) => {
      return this.cues_.includes(cue) && this.isTextVisible_ &&
             cue.startTime <= currentTime && cue.endTime > currentTime;
    };

    // For each cue in the current cues map, if the cue's end time has passed,
    // remove the entry from the map, and remove the captions from the page.
    for (const cue of this.currentCuesMap_.keys()) {
      if (!shouldCueBeDisplayed(cue)) {
        const captions = this.currentCuesMap_.get(cue);
        this.textContainer_.removeChild(captions);
        this.currentCuesMap_.delete(cue);
      }
    }

    // Sometimes we don't remove a cue element correctly.  So check all the
    // child nodes and remove any that don't have an associated cue.
    const expectedChildren = new Set(this.currentCuesMap_.values());
    for (const child of Array.from(this.textContainer_.childNodes)) {
      if (!expectedChildren.has(child)) {
        this.textContainer_.removeChild(child);
      }
    }

    // Get the current cues that should be added to display. If the cue is not
    // being displayed already, add it to the map, and add the captions onto the
    // page.
    const currentCues = this.cues_.filter((cue) => {
      return shouldCueBeDisplayed(cue) && !this.currentCuesMap_.has(cue);
    }).sort((a, b) => {
      if (a.startTime != b.startTime) {
        return a.startTime - b.startTime;
      } else {
        return a.endTime - b.endTime;
      }
    });

    for (const cue of currentCues) {
      this.displayCue_(this.textContainer_, cue);
    }
  }

  /**
   * Displays a nested cue
   *
   * @param {Element} container
   * @param {!shaka.extern.Cue} cue
   * @param {boolean} isNested
   * @return {!Element} the created captions container
   * @private
   */
  displayLeafCue_(container, cue, isNested) {
    const captions = shaka.util.Dom.createHTMLElement('span');
    if (isNested) {
      captions.classList.add('shaka-nested-cue');
    }

    if (cue.spacer) {
      captions.style.display = 'block';
    } else {
      this.setCaptionStyles_(captions, cue, /* isLeaf= */ true);
    }

    container.appendChild(captions);

    return captions;
  }

  /**
   * Displays a cue
   *
   * @param {Element} container
   * @param {!shaka.extern.Cue} cue
   * @private
   */
  displayCue_(container, cue) {
    if (cue.nestedCues.length) {
      const nestedCuesContainer = shaka.util.Dom.createHTMLElement('p');
      nestedCuesContainer.style.width = '100%';
      this.setCaptionStyles_(nestedCuesContainer, cue, /* isLeaf= */ false);

      for (let i = 0; i < cue.nestedCues.length; i++) {
        this.displayLeafCue_(
            nestedCuesContainer, cue.nestedCues[i], /* isNested= */ true);
      }

      container.appendChild(nestedCuesContainer);
      this.currentCuesMap_.set(cue, nestedCuesContainer);
    } else {
      this.currentCuesMap_.set(cue,
          this.displayLeafCue_(container, cue, /* isNested= */ false));
    }
  }

  /**
   * @param {!HTMLElement} captions
   * @param {!shaka.extern.Cue} cue
   * @param {boolean} isLeaf
   * @private
   */
  setCaptionStyles_(captions, cue, isLeaf) {
    const Cue = shaka.text.Cue;
    const captionsStyle = captions.style;

    // Set white-space to 'pre-line' to enable showing line breaks in the text.
    captionsStyle.whiteSpace = 'pre-line';
    captions.textContent = cue.payload;
    if (isLeaf) {
      captionsStyle.backgroundColor = cue.backgroundColor;
    }
    captionsStyle.color = cue.color;
    captionsStyle.direction = cue.direction;

    if (cue.backgroundImage) {
      captionsStyle.backgroundImage = 'url(\'' + cue.backgroundImage + '\')';
      captionsStyle.backgroundRepeat = 'no-repeat';
      captionsStyle.backgroundSize = 'contain';
      captionsStyle.backgroundPosition = 'center';
      if (cue.backgroundColor == '') {
        captionsStyle.backgroundColor = 'transparent';
      }
    }
    if (cue.backgroundImage && cue.region) {
      const percentageUnit = shaka.text.CueRegion.units.PERCENTAGE;
      const heightUnit = cue.region.heightUnits == percentageUnit ? '%' : 'px';
      const widthUnit = cue.region.widthUnits == percentageUnit ? '%' : 'px';
      captionsStyle.height = cue.region.height + heightUnit;
      captionsStyle.width = cue.region.width + widthUnit;
    }

    // The displayAlign attribute specifys the vertical alignment of the
    // captions inside the text container. Before means at the top of the
    // text container, and after means at the bottom.
    if (cue.displayAlign == Cue.displayAlign.BEFORE) {
      captionsStyle.justifyContent = 'flex-start';
    } else if (cue.displayAlign == Cue.displayAlign.CENTER) {
      captionsStyle.justifyContent = 'center';
    } else {
      captionsStyle.justifyContent = 'flex-end';
    }

    if (cue.nestedCues.length) {
      captionsStyle.display = 'flex';
      captionsStyle.flexDirection = 'row';
      captionsStyle.margin = '0';
      // Setting flexDirection to "row" inverts the sense of align and justify.
      // Now align is vertical and justify is horizontal.  See comments above on
      // vertical alignment for displayAlign.
      captionsStyle.alignItems = captionsStyle.justifyContent;
      captionsStyle.justifyContent = 'center';
    }

    if (isLeaf) {
      // Work around an IE 11 flexbox bug in which center-aligned items can
      // overflow their container.  See
      // https://github.com/philipwalton/flexbugs/tree/6e720da8#flexbug-2
      captionsStyle.maxWidth = '100%';
    }

    captionsStyle.fontFamily = cue.fontFamily;
    captionsStyle.fontWeight = cue.fontWeight.toString();
    captionsStyle.fontSize = cue.fontSize;
    captionsStyle.fontStyle = cue.fontStyle;

    // The line attribute defines the positioning of the text container inside
    // the video container.
    // - The line offsets the text container from the top, the right or left of
    //   the video viewport as defined by the writing direction.
    // - The value of the line is either as a number of lines, or a percentage
    //   of the video viewport height or width.
    // The lineAlign is an alignment for the text container's line.
    // - The Start alignment means the text container’s top side (for horizontal
    //   cues), left side (for vertical growing right), or right side (for
    //   vertical growing left) is aligned at the line.
    // - The Center alignment means the text container is centered at the line
    //   (to be implemented).
    // - The End Alignment means The text container’s bottom side (for
    //   horizontal cues), right side (for vertical growing right), or left side
    //   (for vertical growing left) is aligned at the line.
    // TODO: Implement line alignment with line number.
    // TODO: Implement lineAlignment of 'CENTER'.
    if (cue.line) {
      if (cue.lineInterpretation == Cue.lineInterpretation.PERCENTAGE) {
        captionsStyle.position = 'absolute';
        if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
          if (cue.lineAlign == Cue.lineAlign.START) {
            captionsStyle.top = cue.line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            captionsStyle.bottom = cue.line + '%';
          }
        } else if (cue.writingMode == Cue.writingMode.VERTICAL_LEFT_TO_RIGHT) {
          if (cue.lineAlign == Cue.lineAlign.START) {
            captionsStyle.left = cue.line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            captionsStyle.right = cue.line + '%';
          }
        } else {
          if (cue.lineAlign == Cue.lineAlign.START) {
            captionsStyle.right = cue.line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            captionsStyle.left = cue.line + '%';
          }
        }
      }
    } else if (cue.region && cue.region.id && !isLeaf) {
      const percentageUnit = shaka.text.CueRegion.units.PERCENTAGE;
      const heightUnit = cue.region.heightUnits == percentageUnit ? '%' : 'px';
      const widthUnit = cue.region.widthUnits == percentageUnit ? '%' : 'px';
      const viewportAnchorUnit =
          cue.region.viewportAnchorUnits == percentageUnit ? '%' : 'px';
      captionsStyle.height = cue.region.height + heightUnit;
      captionsStyle.width = cue.region.width + widthUnit;
      captionsStyle.position = 'absolute';
      captionsStyle.top = cue.region.viewportAnchorY + viewportAnchorUnit;
      captionsStyle.left = cue.region.viewportAnchorX + viewportAnchorUnit;
    }

    captionsStyle.lineHeight = cue.lineHeight;

    // The position defines the indent of the text container in the
    // direction defined by the writing direction.
    if (cue.position) {
      if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
        captionsStyle.paddingLeft = cue.position;
      } else {
        captionsStyle.paddingTop = cue.position;
      }
    }

    // The positionAlign attribute is an alignment for the text container in
    // the dimension of the writing direction.
    if (cue.positionAlign == Cue.positionAlign.LEFT) {
      captionsStyle.cssFloat = 'left';
    } else if (cue.positionAlign == Cue.positionAlign.RIGHT) {
      captionsStyle.cssFloat = 'right';
    }

    captionsStyle.textAlign = cue.textAlign;
    captionsStyle.textDecoration = cue.textDecoration.join(' ');
    captionsStyle.writingMode = cue.writingMode;

    // Old versions of Chromium, which may be found in certain versions of Tizen
    // and WebOS, may require the prefixed version: webkitWritingMode.
    // https://caniuse.com/css-writing-mode
    // However, testing shows that Tizen 3, at least, has a 'writingMode'
    // property, but the setter for it does nothing.  Therefore we need to
    // detect that and fall back to the prefixed version in this case, too.
    if (!('writingMode' in document.documentElement.style) ||
        captionsStyle.writingMode != cue.writingMode) {
      // Note that here we do not bother to check for webkitWritingMode support
      // explicitly.  We try the unprefixed version, then fall back to the
      // prefixed version unconditionally.
      captionsStyle.webkitWritingMode = cue.writingMode;
    }

    // The size is a number giving the size of the text container, to be
    // interpreted as a percentage of the video, as defined by the writing
    // direction.
    if (cue.size) {
      if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
        captionsStyle.width = cue.size + '%';
      } else {
        captionsStyle.height = cue.size + '%';
      }
    }
  }
};
