/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.text.UITextDisplayer');

goog.require('goog.asserts');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.Timer');


/**
 * @implements {shaka.extern.TextDisplayer}
 * @final
 * @export
 */
shaka.text.UITextDisplayer = class {
  /**
   * Constructor.
   * @param {HTMLMediaElement} video
   * @param {HTMLElement} videoContainer
   */
  constructor(video, videoContainer) {
    goog.asserts.assert(videoContainer, 'videoContainer should be valid.');

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

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    this.eventManager_.listen(document, 'fullscreenchange', () => {
      this.updateCaptions_(/* forceUpdate= */ true);
    });
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

    this.updateCaptions_();
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

    // Tear-down the event manager to ensure messages stop moving around.
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }
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
   * @param {boolean=} forceUpdate
   * @private
   */
  updateCaptions_(forceUpdate = true) {
    const currentTime = this.video_.currentTime;

    // Return true if the cue should be displayed at the current time point.
    const shouldCueBeDisplayed = (cue) => {
      return this.cues_.includes(cue) && this.isTextVisible_ &&
             cue.startTime <= currentTime && cue.endTime > currentTime;
    };

    // For each cue in the current cues map, if the cue's end time has passed,
    // remove the entry from the map, and remove the captions from the page.
    for (const cue of this.currentCuesMap_.keys()) {
      if (!shouldCueBeDisplayed(cue) || forceUpdate) {
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
    this.setCaptionStyles_(captions, cue, /* isLeaf= */ true);
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
   * @param {boolean} isNested
   * @private
   */
  setCaptionStyles_(captions, cue, isNested) {
    const Cue = shaka.text.Cue;
    const captionsStyle = captions.style;
    const isLeaf = cue.nestedCues.length == 0;


    if (cue.spacer) {
      // This takes up a whole line on its own, but that line is 0-height,
      // making it effectively a line-break.
      captionsStyle.flexBasis = '100%';
      captionsStyle.height = '0';
      // TODO: support multiple line breaks in a row, in which case second and
      // up need to take up vertical space.

      // Line breaks have no other styles applied.
      return;
    }
    // Set white-space to 'pre-line' to enable showing line breaks in the text.
    captionsStyle.whiteSpace = 'pre-line';
    captions.textContent = cue.payload;
    if (isLeaf) {
      captionsStyle.backgroundColor = cue.backgroundColor;
    }
    captionsStyle.border = cue.border;
    captionsStyle.color = cue.color;
    captionsStyle.direction = cue.direction;
    captionsStyle.opacity = cue.opacity;
    captionsStyle.paddingLeft = shaka.text.UITextDisplayer.convertLengthValue_(
        cue.linePadding, cue, this.videoContainer_
    );
    captionsStyle.paddingRight = shaka.text.UITextDisplayer.convertLengthValue_(
        cue.linePadding, cue, this.videoContainer_
    );

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

    if (isLeaf) {
      captionsStyle.display = 'inline-block';
    } else {
      captionsStyle.display = 'flex';
      captionsStyle.flexDirection = 'row';
      captionsStyle.flexWrap = 'wrap';
      captionsStyle.margin = '0';
      // Setting flexDirection to "row" inverts the sense of align and justify.
      // Now align is vertical and justify is horizontal.  See comments above on
      // vertical alignment for displayAlign.
      captionsStyle.alignItems = captionsStyle.justifyContent;
      captionsStyle.justifyContent = 'center';
    }

    if (isNested) {
      // Work around an IE 11 flexbox bug in which center-aligned items can
      // overflow their container.  See
      // https://github.com/philipwalton/flexbugs/tree/6e720da8#flexbug-2
      captionsStyle.maxWidth = '100%';
    }

    captionsStyle.fontFamily = cue.fontFamily;
    captionsStyle.fontWeight = cue.fontWeight.toString();
    captionsStyle.fontStyle = cue.fontStyle;
    captionsStyle.letterSpacing = cue.letterSpacing;
    captionsStyle.fontSize = shaka.text.UITextDisplayer.convertLengthValue_(
        cue.fontSize, cue, this.videoContainer_
    );

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

  /**
   * Returns info about provided lengthValue
   * @example 100px => { value: 100, unit: 'px' }
   * @param {?string} lengthValue
   *
   * @return {?{ value: number, unit: string }}
   * @private
   */
  static getLengthValueInfo_(lengthValue) {
    const matches = new RegExp(/(\d*\.?\d+)([a-z]+|%+)/).exec(lengthValue);

    if (!matches) {
      return null;
    }

    return {
      value: Number(matches[1]),
      unit: matches[2],
    };
  }

  /**
   * Converts length value to an absolute value in pixels.
   * If lengthValue is already an absolute value it will not
   * be modified. Relative lengthValue will be converted to an
   * absolute value in pixels based on Computed Cell Size
   *
   * @param {string} lengthValue
   * @param {!shaka.extern.Cue} cue
   * @param {HTMLElement} videoContainer
   * @return {string}
   * @private
  */
  static convertLengthValue_(lengthValue, cue, videoContainer) {
    const lengthValueInfo =
        shaka.text.UITextDisplayer.getLengthValueInfo_(lengthValue);

    if (!lengthValueInfo) {
      return lengthValue;
    }

    const {unit, value} = lengthValueInfo;

    switch (unit) {
      case '%':
        return shaka.text.UITextDisplayer.getAbsoluteLengthInPixels_(
            value / 100, cue, videoContainer);
      case 'c':
        return shaka.text.UITextDisplayer.getAbsoluteLengthInPixels_(
            value, cue, videoContainer);
      default:
        return lengthValue;
    }
  }

  /**
   * Returns computed absolute length value in pixels based on cell
   * and a video container size
   * @param {number} value
   * @param {!shaka.extern.Cue} cue
   * @param {HTMLElement} videoContainer
   * @return {string}
   *
   * @private
   * */
  static getAbsoluteLengthInPixels_(value, cue, videoContainer) {
    const containerHeight = videoContainer.clientHeight;

    return (containerHeight * value / cue.cellResolution.rows) + 'px';
  }
};
