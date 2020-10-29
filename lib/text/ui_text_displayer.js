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
goog.require('shaka.util.Timer');


/**
 * The text displayer plugin for the Shaka Player UI.  Can also be used directly
 * by providing an appropriate container element.
 *
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
  }


  /**
   * @override
   * @export
   */
  append(cues) {
    for (const cue of cues) {
      // When a VTT cue spans a segment boundary, the cue will be duplicated
      // into two segments.
      // To avoid displaying duplicate cues, if the current cue list already
      // contains the cue, skip it.
      const containsCue = this.cues_.some(
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
             cue.startTime <= currentTime && cue.endTime >= currentTime;
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
      const cueElement = this.displayCue_(
          this.textContainer_, cue, /* isNested= */ false);
      this.currentCuesMap_.set(cue, cueElement);
    }
  }

  /**
   * Displays a cue
   *
   * @param {Element} container
   * @param {!shaka.extern.Cue} cue
   * @param {boolean} isNested
   * @return {!Element} the created captions element
   * @private
   */
  displayCue_(container, cue, isNested) {
    // Nested cues are inline elements.  Top-level cues are block elements.
    const cueElement = shaka.util.Dom.createHTMLElement(
        isNested ? 'span' : 'div');

    this.setCaptionStyles_(cueElement, cue, isNested);

    for (const nestedCue of cue.nestedCues) {
      this.displayCue_(cueElement, nestedCue, /* isNested= */ true);
    }

    container.appendChild(cueElement);
    return cueElement;
  }

  /**
   * @param {!HTMLElement} cueElement
   * @param {!shaka.extern.Cue} cue
   * @param {boolean} isNested
   * @private
   */
  setCaptionStyles_(cueElement, cue, isNested) {
    const Cue = shaka.text.Cue;
    const style = cueElement.style;
    const isLeaf = cue.nestedCues.length == 0;

    if (cue.spacer) {
      // This takes up a whole line on its own, but that line is 0-height,
      // making it effectively a line-break.
      style.flexBasis = '100%';
      style.height = '0';
      // TODO: support multiple line breaks in a row, in which case second and
      // up need to take up vertical space.

      // Line breaks have no other styles applied.
      return;
    }

    // TODO: wrapLine is not yet supported.  Lines always wrap.

    // White space should be preserved if emitted by the text parser.  It's the
    // job of the parser to omit any whitespace that should not be displayed.
    // Using 'pre-wrap' means that whitespace is preserved even at the end of
    // the text, but that lines which overflow can still be broken.
    style.whiteSpace = 'pre-wrap';

    // Using 'break-spaces' would be better, as it would preserve even trailing
    // spaces, but that only shipped in Chrome 76.  As of July 2020, Safari
    // still has not implemented break-spaces, and the original Chromecast will
    // never have this feature since it no longer gets firmware updates.
    // So we need to replace trailing spaces with non-breaking spaces.
    cueElement.textContent = cue.payload.replace(/\s+$/g, (match) => {
      const nonBreakingSpace = '\xa0';
      return nonBreakingSpace.repeat(match.length);
    });

    style.backgroundColor = cue.backgroundColor;
    style.border = cue.border;
    style.color = cue.color;
    style.direction = cue.direction;
    style.opacity = cue.opacity;
    style.paddingLeft = shaka.text.UITextDisplayer.convertLengthValue_(
        cue.linePadding, cue, this.videoContainer_);
    style.paddingRight = shaka.text.UITextDisplayer.convertLengthValue_(
        cue.linePadding, cue, this.videoContainer_);

    if (cue.backgroundImage) {
      style.backgroundImage = 'url(\'' + cue.backgroundImage + '\')';
      style.backgroundRepeat = 'no-repeat';
      style.backgroundSize = 'contain';
      style.backgroundPosition = 'center';

      if (cue.backgroundColor == '') {
        // In text-based cues, background color can default in CSS.
        // In bitmap-based cues, we default to a transparent background color,
        // so that the bitmap can be the only background.
        style.backgroundColor = 'transparent';
      }

      if (cue.region) {
        // Region settings are used to size bitmap-based subtitles.
        // TODO: Revisit this as we update the TTML parser.  This is a special
        // case that is not intuitive.
        const percentageUnit = shaka.text.CueRegion.units.PERCENTAGE;
        const heightUnit =
            cue.region.heightUnits == percentageUnit ? '%' : 'px';
        const widthUnit = cue.region.widthUnits == percentageUnit ? '%' : 'px';
        style.height = cue.region.height + heightUnit;
        style.width = cue.region.width + widthUnit;
      }
    }

    // The displayAlign attribute specifys the vertical alignment of the
    // captions inside the text container. Before means at the top of the
    // text container, and after means at the bottom.
    if (cue.displayAlign == Cue.displayAlign.BEFORE) {
      style.justifyContent = 'flex-start';
    } else if (cue.displayAlign == Cue.displayAlign.CENTER) {
      style.justifyContent = 'center';
    } else {
      style.justifyContent = 'flex-end';
    }

    if (isLeaf) {
      style.display = 'inline-block';
    } else {
      style.display = 'flex';
      style.flexDirection = 'row';
      style.flexWrap = 'wrap';
      style.margin = '0';
      // Setting flexDirection to "row" switches the meanings of align and
      // justify.  Now align is vertical and justify is horizontal.  See
      // comments above on vertical alignment for displayAlign.
      style.alignItems = style.justifyContent;
      style.justifyContent = 'center';
    }

    if (isNested) {
      // Work around an IE 11 flexbox bug in which center-aligned items can
      // overflow their container.  See
      // https://github.com/philipwalton/flexbugs/tree/6e720da8#flexbug-2
      style.maxWidth = '100%';
    }

    style.fontFamily = cue.fontFamily;
    style.fontWeight = cue.fontWeight.toString();
    style.fontStyle = cue.fontStyle;
    style.letterSpacing = cue.letterSpacing;
    style.fontSize = shaka.text.UITextDisplayer.convertLengthValue_(
        cue.fontSize, cue, this.videoContainer_);

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
        style.position = 'absolute';
        if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
          if (cue.lineAlign == Cue.lineAlign.START) {
            style.top = cue.line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            style.bottom = cue.line + '%';
          }
        } else if (cue.writingMode == Cue.writingMode.VERTICAL_LEFT_TO_RIGHT) {
          if (cue.lineAlign == Cue.lineAlign.START) {
            style.left = cue.line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            style.right = cue.line + '%';
          }
        } else {
          if (cue.lineAlign == Cue.lineAlign.START) {
            style.right = cue.line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            style.left = cue.line + '%';
          }
        }
      }
    } else if (cue.region && cue.region.id && !isNested && !isLeaf) {
      // Regions are only applied to block container (!isNested && !isLeaf).
      // TODO: Revisit this as we update the TTML parser.  See special case for
      // backgroundImage + region above.
      const percentageUnit = shaka.text.CueRegion.units.PERCENTAGE;
      const heightUnit = cue.region.heightUnits == percentageUnit ? '%' : 'px';
      const widthUnit = cue.region.widthUnits == percentageUnit ? '%' : 'px';
      const viewportAnchorUnit =
          cue.region.viewportAnchorUnits == percentageUnit ? '%' : 'px';
      style.height = cue.region.height + heightUnit;
      style.width = cue.region.width + widthUnit;
      style.position = 'absolute';
      style.top = cue.region.viewportAnchorY + viewportAnchorUnit;
      style.left = cue.region.viewportAnchorX + viewportAnchorUnit;
    }

    style.lineHeight = cue.lineHeight;

    // The position defines the indent of the text container in the
    // direction defined by the writing direction.
    if (cue.position) {
      if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
        style.paddingLeft = cue.position;
      } else {
        style.paddingTop = cue.position;
      }
    }

    // The positionAlign attribute is an alignment for the text container in
    // the dimension of the writing direction.
    if (cue.positionAlign == Cue.positionAlign.LEFT) {
      style.cssFloat = 'left';
    } else if (cue.positionAlign == Cue.positionAlign.RIGHT) {
      style.cssFloat = 'right';
    }

    style.textAlign = cue.textAlign;
    style.textDecoration = cue.textDecoration.join(' ');
    style.writingMode = cue.writingMode;

    // The size is a number giving the size of the text container, to be
    // interpreted as a percentage of the video, as defined by the writing
    // direction.
    if (cue.size) {
      if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
        style.width = cue.size + '%';
      } else {
        style.height = cue.size + '%';
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
