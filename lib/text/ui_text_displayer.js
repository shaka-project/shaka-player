/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.text.UITextDisplayer');

goog.require('goog.asserts');
goog.require('shaka.util.Dom');


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

    /** @private {!Array.<!shaka.extern.Cue>} */
    this.cues_ = [];

    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {HTMLElement} */
    this.videoContainer_ = videoContainer;

    /** @type {HTMLElement} */
    this.textContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.textContainer_.classList.add('shaka-text-container');
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
      const containsCue = this.cues_.some((cueInList) => {
        if (cueInList.payload == cue.payload &&
            cueInList.startTime == cue.startTime &&
            cueInList.endTime == cue.endTime) {
          return true;
        }
        return false;
      });
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
      this.displayCue_(this.textContainer_, cue);
    }
  }

  /**
   * Returns tokens describing start/end tags and string content from a cue.
   *
   * @param {string} str
   * @return {!Array<{type: string, value: string}>}
   * @private
   */
  tokenizeCueString_(str) {
    if (!str) {
      return [];
    }

    const tokens = [];

    let currentValue = '';
    for (let i = 0; i < str.length; i++) {
      if (i+1 < str.length && str[i] === '<' && str[i+1] !== ' ') {
        if (currentValue) {
          // Flush the current value as we enter tag detection.
          tokens.push({type: 'text', value: currentValue});
        }
        currentValue = '<';

        // Seek to end of tag.
        i++;
        let wellTerminated = false;
        for (;i < str.length; i++) {
          currentValue += str[i];
          if (str[i] === '>') {
            wellTerminated = true;
            break;
          }
        }

        if (!wellTerminated || currentValue.length < 3) {
          // No termination found, append literal string.
          tokens.push({type: 'text', value: currentValue});
        } else {
          let tagType = 'startTag';
          currentValue = currentValue.substr(1, currentValue.length - 2);
          if (currentValue[0] == '/') {
            currentValue = currentValue.substr(1); // Removes /
            tagType = 'endTag';
          }
          if (currentValue) {
            tokens.push({type: tagType, value: currentValue});
          }
        }
        currentValue = '';
      } else {
        currentValue += str[i];
      }
    }

    // Final flush.
    if (currentValue) {
      tokens.push({type: 'text', value: currentValue});
    }

    return tokens;
  }

  /**
   * Returns a safe collection of html elements for display as a single cue.
   *
   * @param {!Array<{type: string, value: string}>} tokens
   * @return {!Array<HTMLElement>}
   * @private
   */
  buildCueElements_(tokens) {
    const supportedTags = [
      'i',
      'b',
      'u',
    ];

    const elements = [];

    // Build a set of root elements from the token collection.
    const stack = [];
    let syntaxError = false;
    for (const currentToken of tokens) {
      if (currentToken.type === 'text') {
        // Element is a text field.
        const textElement = document.createElement('span');
        textElement.textContent = currentToken.value;
        if (stack.length) {
          // Add to bottom stack element.
          stack[stack.length - 1].appendChild(textElement);
        } else {
          // Add as standalone.
          elements.push(textElement);
        }
      } else if (supportedTags.includes(currentToken.value)) {
        // Element is a supported tag.
        if (currentToken.type === 'startTag') {
          // Add this new element to the stack.
          stack.push(document.createElement(currentToken.value));
          const elem = document.createElement(currentToken.value);
          if (stack.length) {
            stack[stack.length - 1].appendChild(elem);
          }
          stack.push(elem);
        } else if (currentToken.type === 'endTag') {
          // Check to see if this closes the last opened tag.
          const bottomName = stack[stack.length - 1].tagName.toLowerCase();
          if (bottomName === currentToken.value.toLowerCase()) {
            // Close this tag off the stack.
            const v = stack.pop();
            if (!stack.length) {
              // Stack is empty, push root of this tree into elements.
              elements.push(v);
            }
          } else {
            // Input syntax error.
            syntaxError = true;
          }
        }
      }
    }
    // If we have unclosed tags, add the unclosed elements.
    if (stack.length) {
      // Since the elements in the stack are already nested inside each other,
      // we only need to push stack[0].
      elements.push(stack[0]);
    }

    // If there is a syntax error return an empty array.
    if (syntaxError) {
      return [];
    }

    return elements;
  }

  /**
   * Displays a nested cue
   *
   * @param {Element} container
   * @param {!shaka.extern.Cue} cue
   * @return {!Element} the created captions container
   * @private
   */
  displayNestedCue_(container, cue) {
    const captions = shaka.util.Dom.createHTMLElement('span');

    if (cue.spacer) {
      captions.style.display = 'block';
    } else {
      this.setCaptionStyles_(captions, cue, /* isNested= */ true);
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
      this.setCaptionStyles_(nestedCuesContainer, cue, /* isNested= */ false);

      for (let i = 0; i < cue.nestedCues.length; i++) {
        this.displayNestedCue_(nestedCuesContainer, cue.nestedCues[i]);
      }

      container.appendChild(nestedCuesContainer);
      this.currentCuesMap_.set(cue, nestedCuesContainer);
    } else {
      this.currentCuesMap_.set(cue, this.displayNestedCue_(container, cue));
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

    // Set white-space to 'pre-line' to enable showing line breaks in the text.
    captionsStyle.whiteSpace = 'pre-line';
    if (isNested) {
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

    // Add cue content
    const tokens = this.tokenizeCueString_(cue.payload);
    // If there are only 1 token and it's text, we don't create a new element.
    if (tokens.length == 1 && tokens[0].type == 'text') {
      captions.textContent = cue.payload;
    } else {
      for (const element of this.buildCueElements_(tokens)) {
        captions.appendChild(element);
      }
    }

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
      captionsStyle.alignItems = 'center';
      captionsStyle.display = 'flex';
      captionsStyle.flexDirection = 'column';
      captionsStyle.margin = '0';
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
    } else if (cue.region && cue.region.id && !isNested) {
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
