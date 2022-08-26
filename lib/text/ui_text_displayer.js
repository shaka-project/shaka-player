/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.text.UITextDisplayer');

goog.require('goog.asserts');
goog.require('shaka.Deprecate');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
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

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    this.eventManager_.listen(document, 'fullscreenchange', () => {
      this.updateCaptions_(/* forceUpdate= */ true);
    });

    /** @private {ResizeObserver} */
    this.resizeObserver_ = null;
    if ('ResizeObserver' in window) {
      this.resizeObserver_ = new ResizeObserver(() => {
        this.updateCaptions_(/* forceUpdate= */ true);
      });
      this.resizeObserver_.observe(this.textContainer_);
    }
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

    if (this.resizeObserver_) {
      this.resizeObserver_.disconnect();
      this.resizeObserver_ = null;
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
  updateCaptions_(forceUpdate = false) {
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
    let type = isNested ? 'span' : 'div';
    if (cue.lineBreak || cue.spacer) {
      if (cue.spacer) {
        shaka.Deprecate.deprecateFeature(4,
            'shaka.extern.Cue',
            'Please use lineBreak instead of spacer.');
      }
      type = 'br';
    }

    // Nested cues are inline elements.  Top-level cues are block elements.
    const cueElement = shaka.util.Dom.createHTMLElement(type);
    if (type != 'br') {
      this.setCaptionStyles_(cueElement, cue, isNested);
    }

    let wrapper = cueElement;
    if (!isNested && cue.nestedCues.length) {
      // Create a wrapper element which will serve to contain all children into
      // a single item.  This ensures that nested span elements appear
      // horizontally and br elements occupy no vertical space.
      wrapper = shaka.util.Dom.createHTMLElement('span');
      wrapper.classList.add('shaka-text-wrapper');
      cueElement.appendChild(wrapper);
    }

    for (const nestedCue of cue.nestedCues) {
      this.displayCue_(wrapper, nestedCue, /* isNested= */ true);
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
    let style = cueElement.style;
    const isLeaf = cue.nestedCues.length == 0;

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
    const text = cue.payload.replace(/\s+$/g, (match) => {
      const nonBreakingSpace = '\xa0';
      return nonBreakingSpace.repeat(match.length);
    });
    if (isNested) {
      cueElement.textContent = text;
    } else if (text.length) {
      // If a top-level cue has text, move to a <span> so the background is
      // styled correctly.
      const span = shaka.util.Dom.createHTMLElement('span');
      span.textContent = text;
      cueElement.appendChild(span);
      style = span.style;
    }

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
    }

    // The displayAlign attribute specifies the vertical alignment of the
    // captions inside the text container. Before means at the top of the
    // text container, and after means at the bottom.
    if (isNested) {
      style.display = 'inline';
    } else {
      style.display = 'flex';
      style.flexDirection = 'column';
      style.alignItems = 'center';

      if (cue.displayAlign == Cue.displayAlign.BEFORE) {
        style.justifyContent = 'flex-start';
      } else if (cue.displayAlign == Cue.displayAlign.CENTER) {
        style.justifyContent = 'center';
      } else {
        style.justifyContent = 'flex-end';
      }
    }

    if (!isLeaf) {
      style.margin = '0';
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
    } else if (cue.region && cue.region.id &&
      ((!isNested && !isLeaf) || (cue.backgroundImage))) {
      // In text-base cues, regions are only applied to block container
      // (!isNested && !isLeaf).
      // In bitmap-based cues, region settings are used to specify the size and
      // position of the backgroundImage.
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

    // Old versions of Chromium, which may be found in certain versions of Tizen
    // and WebOS, may require the prefixed version: webkitWritingMode.
    // https://caniuse.com/css-writing-mode
    // However, testing shows that Tizen 3, at least, has a 'writingMode'
    // property, but the setter for it does nothing.  Therefore we need to
    // detect that and fall back to the prefixed version in this case, too.
    if (!('writingMode' in document.documentElement.style) ||
        style.writingMode != cue.writingMode) {
      // Note that here we do not bother to check for webkitWritingMode support
      // explicitly.  We try the unprefixed version, then fall back to the
      // prefixed version unconditionally.
      style.webkitWritingMode = cue.writingMode;
    }

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
