/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.text.UITextDisplayer');

goog.require('goog.asserts');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.text.Utils');
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

    /** @private {!Array<!shaka.text.Cue>} */
    this.cues_ = [];

    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {HTMLElement} */
    this.videoContainer_ = videoContainer;

    /** @private {?number} */
    this.aspectRatio_ = null;

    /** @private {?shaka.extern.TextDisplayerConfiguration} */
    this.config_ = null;

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

    /** @private {shaka.util.Timer} */
    this.captionsTimer_ = new shaka.util.Timer(() => {
      if (!this.video_.paused) {
        this.updateCaptions_();
      }
    });
    this.configureCaptionsTimer_();

    /**
     * Maps cues to cue elements. Specifically points out the wrapper element of
     * the cue (e.g. the HTML element to put nested cues inside).
     * @private {Map<!shaka.text.Cue, !{
     *   cueElement: !HTMLElement,
     *   regionElement: HTMLElement,
     *   wrapper: !HTMLElement,
     * }>}
     */
    this.currentCuesMap_ = new Map();

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    this.eventManager_.listen(document, 'fullscreenchange', () => {
      this.updateCaptions_(/* forceUpdate= */ true);
    });

    this.eventManager_.listen(this.video_, 'seeking', () => {
      this.updateCaptions_(/* forceUpdate= */ true);
    });

    this.eventManager_.listen(this.video_, 'ratechange', () => {
      this.configureCaptionsTimer_();
    });

    // From: https://html.spec.whatwg.org/multipage/media.html#dom-video-videowidth
    // Whenever the natural width or natural height of the video changes
    // (including, for example, because the selected video track was changed),
    // if the element's readyState attribute is not HAVE_NOTHING, the user
    // agent must queue a media element task given the media element to fire an
    // event named resize at the media element.
    this.eventManager_.listen(this.video_, 'resize', () => {
      const element = /** @type {!HTMLVideoElement} */ (this.video_);
      const width = element.videoWidth;
      const height = element.videoHeight;
      if (width && height) {
        this.aspectRatio_ = width / height;
      } else {
        this.aspectRatio_ = null;
      }
    });

    /** @private {ResizeObserver} */
    this.resizeObserver_ = null;
    if ('ResizeObserver' in window) {
      this.resizeObserver_ = new ResizeObserver(() => {
        this.updateCaptions_(/* forceUpdate= */ true);
      });
      this.resizeObserver_.observe(this.textContainer_);
    }

    /** @private {Map<string, !HTMLElement>} */
    this.regionElements_ = new Map();
  }


  /**
   * @override
   * @export
   */
  configure(config) {
    this.config_ = config;
    this.configureCaptionsTimer_();
    this.updateCaptions_(/* forceUpdate= */ true);
  }


  /**
   * @override
   * @export
   */
  append(cues) {
    // Clone the cues list for performance optimization. We can avoid the cues
    // list growing during the comparisons for duplicate cues.
    // See: https://github.com/shaka-project/shaka-player/issues/3018
    const cuesList = [...this.cues_];
    for (const cue of shaka.text.Utils.removeDuplicates(cues)) {
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
    if (this.cues_.length) {
      this.configureCaptionsTimer_();
    }

    this.updateCaptions_();
  }


  /**
   * @override
   * @export
   */
  destroy() {
    // Return resolved promise if destroy() has been called.
    if (!this.textContainer_) {
      return Promise.resolve();
    }

    // Remove the text container element from the UI.
    if (this.textContainer_.parentElement) {
      this.videoContainer_.removeChild(this.textContainer_);
    }
    this.textContainer_ = null;

    this.isTextVisible_ = false;
    this.cues_ = [];
    if (this.captionsTimer_) {
      this.captionsTimer_.stop();
      this.captionsTimer_ = null;
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

    return Promise.resolve();
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
    const oldNumCues = this.cues_.length;
    this.cues_ = this.cues_.filter(
        (cue) => cue.startTime < start || cue.endTime >= end);
    // If anything was actually removed in this process, force the captions to
    // update. This makes sure that the currently-displayed cues will stop
    // displaying if removed (say, due to the user changing languages).
    const forceUpdate = oldNumCues > this.cues_.length;
    this.updateCaptions_(forceUpdate);
    if (!this.cues_.length) {
      this.configureCaptionsTimer_();
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
    if (this.isTextVisible_) {
      if (!this.textContainer_.parentElement) {
        this.videoContainer_.appendChild(this.textContainer_);
      }
      this.updateCaptions_(/* forceUpdate= */ true);
    } else {
      if (this.textContainer_.parentElement) {
        this.videoContainer_.removeChild(this.textContainer_);
      }
    }
  }

  /**
   * @override
   * @export
   */
  setTextLanguage(language) {
    if (language && language != 'und') {
      this.textContainer_.setAttribute('lang', language);
    } else {
      this.textContainer_.setAttribute('lang', '');
    }
  }

  /**
   * @override
   * @export
   */
  enableTextDisplayer() {
  }

  /**
   * @private
   */
  configureCaptionsTimer_() {
    if (this.captionsTimer_) {
      if (this.cues_.length) {
        const captionsUpdatePeriod = this.config_ ?
            this.config_.captionsUpdatePeriod : 0.25;
        const updateTime = captionsUpdatePeriod /
            Math.max(1, Math.abs(this.video_.playbackRate));
        this.captionsTimer_.tickEvery(updateTime);
      } else {
        this.captionsTimer_.stop();
      }
    }
  }

  /**
   * @private
   */
  isElementUnderTextContainer_(elemToCheck) {
    while (elemToCheck != null) {
      if (elemToCheck == this.textContainer_) {
        return true;
      }
      elemToCheck = elemToCheck.parentElement;
    }
    return false;
  }

  /**
   * @param {!Array<!shaka.text.Cue>} cues
   * @param {!HTMLElement} container
   * @param {number} currentTime
   * @param {!Array<!shaka.text.Cue>} parents
   * @private
   */
  updateCuesRecursive_(cues, container, currentTime, parents) {
    // Set to true if the cues have changed in some way, which will require
    // DOM changes. E.g. if a cue was added or removed.
    let updateDOM = false;
    /**
     * The elements to remove from the DOM.
     * Some of these elements may be added back again, if their corresponding
     * cue is in toPlant.
     * These elements are only removed if updateDOM is true.
     * @type {!Array<!HTMLElement>}
     */
    const toUproot = [];
    /**
     * The cues whose corresponding elements should be in the DOM.
     * Some of these might be new, some might have been displayed beforehand.
     * These will only be added if updateDOM is true.
     * @type {!Array<!shaka.text.Cue>}
     */
    const toPlant = [];
    for (const cue of cues) {
      parents.push(cue);

      let cueRegistry = this.currentCuesMap_.get(cue);
      const shouldBeDisplayed =
          cue.startTime <= currentTime && cue.endTime > currentTime;
      let wrapper = cueRegistry ? cueRegistry.wrapper : null;

      if (cueRegistry) {
        // If the cues are replanted, all existing cues should be uprooted,
        // even ones which are going to be planted again.
        toUproot.push(cueRegistry.cueElement);

        // Also uproot all displayed region elements.
        if (cueRegistry.regionElement) {
          toUproot.push(cueRegistry.regionElement);
        }

        // If the cue should not be displayed, remove it entirely.
        if (!shouldBeDisplayed) {
          // Since something has to be removed, we will need to update the DOM.
          updateDOM = true;
          this.currentCuesMap_.delete(cue);
          cueRegistry = null;
        }
      }

      if (shouldBeDisplayed) {
        toPlant.push(cue);
        if (!cueRegistry) {
          // The cue has to be made!
          this.createCue_(cue, parents);
          cueRegistry = this.currentCuesMap_.get(cue);
          wrapper = cueRegistry.wrapper;
          updateDOM = true;
        } else if (!this.isElementUnderTextContainer_(wrapper)) {
          // We found that the wrapper needs to be in the DOM
          updateDOM = true;
        }
      }

      // Recursively check the nested cues, to see if they need to be added or
      // removed.
      // If wrapper is null, that means that the cue is not only not being
      // displayed currently, it also was not removed this tick. So it's
      // guaranteed that the children will neither need to be added nor removed.
      if (cue.nestedCues.length > 0 && wrapper) {
        this.updateCuesRecursive_(
            cue.nestedCues, wrapper, currentTime, parents);
      }

      const topCue = parents.pop();
      goog.asserts.assert(topCue == cue, 'Parent cues should be kept in order');
    }

    if (updateDOM) {
      for (const element of toUproot) {
        // NOTE: Because we uproot shared region elements, too, we might hit an
        // element here that has no parent because we've already processed it.
        if (element.parentElement) {
          element.parentElement.removeChild(element);
        }
      }
      toPlant.sort((a, b) => {
        if (a.startTime != b.startTime) {
          return a.startTime - b.startTime;
        } else {
          return a.endTime - b.endTime;
        }
      });
      for (const cue of toPlant) {
        const cueRegistry = this.currentCuesMap_.get(cue);
        goog.asserts.assert(cueRegistry, 'cueRegistry should exist.');
        if (cueRegistry.regionElement) {
          if (cueRegistry.regionElement.contains(container)) {
            cueRegistry.regionElement.removeChild(container);
          }
          container.appendChild(cueRegistry.regionElement);
          cueRegistry.regionElement.appendChild(cueRegistry.cueElement);
        } else {
          container.appendChild(cueRegistry.cueElement);
        }
      }
    }
  }

  /**
   * Display the current captions.
   * @param {boolean=} forceUpdate
   * @private
   */
  updateCaptions_(forceUpdate = false) {
    if (!this.textContainer_) {
      return;
    }

    const currentTime = this.video_.currentTime;
    if (!this.isTextVisible_ || forceUpdate) {
      // Remove child elements from all regions.
      for (const regionElement of this.regionElements_.values()) {
        shaka.util.Dom.removeAllChildren(regionElement);
      }
      // Remove all top-level elements in the text container.
      shaka.util.Dom.removeAllChildren(this.textContainer_);
      // Clear the element maps.
      this.currentCuesMap_.clear();
      this.regionElements_.clear();
    }
    if (this.isTextVisible_) {
      // Log currently attached cue elements for verification, later.
      const previousCuesMap = new Map();
      if (goog.DEBUG) {
        for (const cue of this.currentCuesMap_.keys()) {
          previousCuesMap.set(cue, this.currentCuesMap_.get(cue));
        }
      }

      // Update the cues.
      this.updateCuesRecursive_(
          this.cues_, this.textContainer_, currentTime, /* parents= */ []);

      if (goog.DEBUG) {
        // Previously, we had an issue (#2076) where cues sometimes were not
        // properly removed from the DOM. It is not clear if this issue still
        // happens, so the previous fix for it has been changed to an assert.
        for (const cue of previousCuesMap.keys()) {
          if (!this.currentCuesMap_.has(cue)) {
            // TODO: If the problem does not appear again, then we should remove
            // this assert (and the previousCuesMap code) in Shaka v4.
            const cueElement = previousCuesMap.get(cue).cueElement;
            goog.asserts.assert(
                !cueElement.parentNode, 'Cue was not properly removed!');
          }
        }
      }
    }
  }

  /**
   * Compute a unique internal id:
   * Regions can reuse the id but have different dimensions, we need to
   * consider those differences
   * @param {shaka.text.CueRegion} region
   * @private
   */
  generateRegionId_(region) {
    const percentageUnit = shaka.text.CueRegion.units.PERCENTAGE;
    const heightUnit = region.heightUnits == percentageUnit ? '%' : 'px';
    const viewportAnchorUnit =
        region.viewportAnchorUnits == percentageUnit ? '%' : 'px';
    const uniqueRegionId = `${region.id}_${
      region.width}x${region.height}${heightUnit}-${
      region.viewportAnchorX}x${region.viewportAnchorY}${viewportAnchorUnit}`;

    return uniqueRegionId;
  }

  /**
   * Get or create a region element corresponding to the cue region.  These are
   * cached by ID.
   *
   * @param {!shaka.text.Cue} cue
   * @return {!HTMLElement}
   * @private
   */
  getRegionElement_(cue) {
    const region = cue.region;
    // from https://dvcs.w3.org/hg/text-tracks/raw-file/default/608toVTT/608toVTT.html#caption-window-size
    // if aspect ratio is 4/3, use that value, otherwise, use the 16:9 value
    const lineWidthMultiple = this.aspectRatio_ === 4/3 ? 2.5 : 1.9;
    const lineHeightMultiple = 5.33;

    const regionId = this.generateRegionId_(region);
    if (this.regionElements_.has(regionId)) {
      return this.regionElements_.get(regionId);
    }

    const regionElement = shaka.util.Dom.createHTMLElement('span');

    const linesUnit = shaka.text.CueRegion.units.LINES;
    const percentageUnit = shaka.text.CueRegion.units.PERCENTAGE;
    const pixelUnit = shaka.text.CueRegion.units.PX;
    let heightUnit = region.heightUnits == percentageUnit ? '%' : 'px';
    let widthUnit = region.widthUnits == percentageUnit ? '%' : 'px';
    const viewportAnchorUnit =
        region.viewportAnchorUnits == percentageUnit ? '%' : 'px';

    regionElement.id = 'shaka-text-region---' + regionId;
    regionElement.classList.add('shaka-text-region');

    regionElement.style.position = 'absolute';

    let regionHeight = region.height;
    let regionWidth = region.width;

    if (region.heightUnits === linesUnit) {
      regionHeight = region.height * lineHeightMultiple;
      heightUnit = '%';
    }
    if (region.widthUnits === linesUnit) {
      regionWidth = region.width * lineWidthMultiple;
      widthUnit = '%';
    }
    regionElement.style.height = regionHeight + heightUnit;
    regionElement.style.width = regionWidth + widthUnit;

    if (region.viewportAnchorUnits === linesUnit) {
      // from https://dvcs.w3.org/hg/text-tracks/raw-file/default/608toVTT/608toVTT.html#positioning-in-cea-708
      let top = region.viewportAnchorY / 75 * 100;
      const windowWidth = this.aspectRatio_ === 4/3 ? 160 : 210;
      let left = region.viewportAnchorX / windowWidth * 100;
      // adjust top and left values based on the region anchor and window size
      top -= region.regionAnchorY * regionHeight / 100;
      left -= region.regionAnchorX * regionWidth / 100;
      regionElement.style.top = top + '%';
      regionElement.style.left = left + '%';
    } else {
      regionElement.style.top = region.viewportAnchorY -
        region.regionAnchorY * regionHeight / 100 + viewportAnchorUnit;
      regionElement.style.left = region.viewportAnchorX -
        region.regionAnchorX * regionWidth / 100 + viewportAnchorUnit;
    }
    if (region.heightUnits !== pixelUnit &&
        region.widthUnits !== pixelUnit &&
        region.viewportAnchorUnits !== pixelUnit) {
      // Clip region
      const top = parseInt(regionElement.style.top.slice(0, -1), 10) || 0;
      const left = parseInt(regionElement.style.left.slice(0, -1), 10) || 0;
      const height = parseInt(regionElement.style.height.slice(0, -1), 10) || 0;
      const width = parseInt(regionElement.style.width.slice(0, -1), 10) || 0;
      const realTop = Math.max(0, Math.min(100 - height, top));
      const realLeft = Math.max(0, Math.min(100 - width, left));
      regionElement.style.top = realTop + '%';
      regionElement.style.left = realLeft + '%';
    }

    regionElement.style.display = 'flex';
    regionElement.style.flexDirection = 'column';
    regionElement.style.alignItems = 'center';

    if (cue.displayAlign == shaka.text.Cue.displayAlign.BEFORE) {
      regionElement.style.justifyContent = 'flex-start';
    } else if (cue.displayAlign == shaka.text.Cue.displayAlign.CENTER) {
      regionElement.style.justifyContent = 'center';
    } else {
      regionElement.style.justifyContent = 'flex-end';
    }

    this.regionElements_.set(regionId, regionElement);
    return regionElement;
  }

  /**
   * Creates the object for a cue.
   *
   * @param {!shaka.text.Cue} cue
   * @param {!Array<!shaka.text.Cue>} parents
   * @private
   */
  createCue_(cue, parents) {
    const isNested = parents.length > 1;
    let type = isNested ? 'span' : 'div';
    if (cue.lineBreak) {
      type = 'br';
    }
    if (cue.rubyTag) {
      type = cue.rubyTag;
    }

    const needWrapper = !isNested && cue.nestedCues.length > 0;

    // Nested cues are inline elements.  Top-level cues are block elements.
    const cueElement = shaka.util.Dom.createHTMLElement(type);
    if (type != 'br') {
      this.setCaptionStyles_(cueElement, cue, parents, needWrapper);
    }

    let regionElement = null;
    if (cue.region && cue.region.id) {
      regionElement = this.getRegionElement_(cue);
    }

    let wrapper = cueElement;
    if (needWrapper) {
      // Create a wrapper element which will serve to contain all children into
      // a single item.  This ensures that nested span elements appear
      // horizontally and br elements occupy no vertical space.
      wrapper = shaka.util.Dom.createHTMLElement('span');
      wrapper.classList.add('shaka-text-wrapper');
      wrapper.style.backgroundColor = cue.backgroundColor;
      wrapper.style.lineHeight = 'normal';
      cueElement.appendChild(wrapper);
    }

    this.currentCuesMap_.set(cue, {cueElement, wrapper, regionElement});
  }

  /**
   * Compute cue position alignment
   * See https://www.w3.org/TR/webvtt1/#webvtt-cue-position-alignment
   *
   * @param {!shaka.text.Cue} cue
   * @return {!shaka.text.Cue.positionAlign}
   * @private
   */
  computeCuePositionAlignment_(cue) {
    const Cue = shaka.text.Cue;
    const {direction, positionAlign, textAlign} = cue;

    if (positionAlign !== Cue.positionAlign.AUTO) {
      // Position align is not AUTO: use it
      return positionAlign;
    }

    // Position align is AUTO: use text align to compute its value

    if (textAlign === Cue.textAlign.LEFT ||
      (textAlign === Cue.textAlign.START &&
        direction === Cue.direction.HORIZONTAL_LEFT_TO_RIGHT) ||
      (textAlign === Cue.textAlign.END &&
        direction === Cue.direction.HORIZONTAL_RIGHT_TO_LEFT)) {
      return Cue.positionAlign.LEFT;
    }

    if (textAlign === Cue.textAlign.RIGHT ||
      (textAlign === Cue.textAlign.START &&
        direction === Cue.direction.HORIZONTAL_RIGHT_TO_LEFT) ||
      (textAlign === Cue.textAlign.END &&
        direction === Cue.direction.HORIZONTAL_LEFT_TO_RIGHT)) {
      return Cue.positionAlign.RIGHT;
    }

    return Cue.positionAlign.CENTER;
  }

  /**
   * @param {!HTMLElement} cueElement
   * @param {!shaka.text.Cue} cue
   * @param {!Array<!shaka.text.Cue>} parents
   * @param {boolean} hasWrapper
   * @private
   */
  setCaptionStyles_(cueElement, cue, parents, hasWrapper) {
    const Cue = shaka.text.Cue;
    const inherit =
        (cb) => shaka.text.UITextDisplayer.inheritProperty_(parents, cb);
    const style = cueElement.style;
    const isLeaf = cue.nestedCues.length == 0;
    const isNested = parents.length > 1;

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

    style.webkitTextStrokeColor = cue.textStrokeColor;
    style.webkitTextStrokeWidth = cue.textStrokeWidth;
    style.color = cue.color;
    style.direction = cue.direction;
    style.opacity = cue.opacity;
    style.paddingLeft = shaka.text.UITextDisplayer.convertLengthValue_(
        cue.linePadding, cue, this.videoContainer_);
    style.paddingRight =
        shaka.text.UITextDisplayer.convertLengthValue_(
            cue.linePadding, cue, this.videoContainer_);
    style.textCombineUpright = cue.textCombineUpright;
    style.textShadow = cue.textShadow;

    if (cue.backgroundImage) {
      style.backgroundImage = 'url(\'' + cue.backgroundImage + '\')';
      style.backgroundRepeat = 'no-repeat';
      style.backgroundSize = 'contain';
      style.backgroundPosition = 'center';

      if (cue.backgroundColor) {
        style.backgroundColor = cue.backgroundColor;
      }

      // Quoting https://www.w3.org/TR/ttml-imsc1.2/:
      // "The width and height (in pixels) of the image resource referenced by
      // smpte:backgroundImage SHALL be equal to the width and height expressed
      // by the tts:extent attribute of the region in which the div element is
      // presented".
      style.width = '100%';
      style.height = '100%';
    } else {
      // If we have both text and nested cues, then style everything; otherwise
      // place the text in its own <span> so the background doesn't fill the
      // whole region.
      let elem;
      if (cue.nestedCues.length) {
        elem = cueElement;
      } else {
        elem = shaka.util.Dom.createHTMLElement('span');
        cueElement.appendChild(elem);
      }

      if (cue.border) {
        elem.style.border = cue.border;
      }
      if (!hasWrapper) {
        const bgColor = inherit((c) => c.backgroundColor);
        if (bgColor) {
          elem.style.backgroundColor = bgColor;
        } else if (text) {
          // If there is no background, default to a semi-transparent black.
          // Only do this for the text itself.
          elem.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        }
      }
      if (text) {
        elem.setAttribute('translate', 'no');
        elem.textContent = text;
      }
    }

    // The displayAlign attribute specifies the vertical alignment of the
    // captions inside the text container. Before means at the top of the
    // text container, and after means at the bottom.
    if (isNested && !parents[parents.length - 1].isContainer) {
      style.display = 'inline';
    } else {
      style.display = 'flex';
      style.flexDirection = 'column';
      style.alignItems = 'center';
      if (cue.textAlign == Cue.textAlign.LEFT ||
          cue.textAlign == Cue.textAlign.START) {
        style.width = '100%';
        style.alignItems = 'start';
      } else if (cue.textAlign == Cue.textAlign.RIGHT ||
          cue.textAlign == Cue.textAlign.END) {
        style.width = '100%';
        style.alignItems = 'end';
      }

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
    const fontScaleFactor = this.config_ ? this.config_.fontScaleFactor : 1;
    style.fontSize = shaka.text.UITextDisplayer.convertLengthValue_(
        cue.fontSize, cue, this.videoContainer_, fontScaleFactor);

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
    let line = cue.line;
    if (line != null) {
      let lineInterpretation = cue.lineInterpretation;
      // HACK: the current implementation of UITextDisplayer only handled
      // PERCENTAGE, so we need convert LINE_NUMBER to PERCENTAGE
      if (lineInterpretation == Cue.lineInterpretation.LINE_NUMBER) {
        lineInterpretation = Cue.lineInterpretation.PERCENTAGE;
        let maxLines = 16;
        // The maximum number of lines is different if it is a vertical video.
        if (this.aspectRatio_ && this.aspectRatio_ < 1) {
          maxLines = 32;
        }
        if (line < 0) {
          line = 100 + line / maxLines * 100;
        } else {
          line = line / maxLines * 100;
        }
      }
      if (lineInterpretation == Cue.lineInterpretation.PERCENTAGE) {
        style.position = 'absolute';
        if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
          style.width = '100%';
          if (cue.lineAlign == Cue.lineAlign.START) {
            style.top = line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            style.bottom = (100 - line) + '%';
          }
        } else if (cue.writingMode == Cue.writingMode.VERTICAL_LEFT_TO_RIGHT) {
          style.height = '100%';
          if (cue.lineAlign == Cue.lineAlign.START) {
            style.left = line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            style.right = (100 - line) + '%';
          }
        } else {
          style.height = '100%';
          if (cue.lineAlign == Cue.lineAlign.START) {
            style.right = line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            style.left = (100 - line) + '%';
          }
        }
      }
    }

    style.lineHeight = cue.lineHeight;

    // The positionAlign attribute is an alignment for the text container in
    // the dimension of the writing direction.
    const computedPositionAlign = this.computeCuePositionAlignment_(cue);
    // According to the W3C WebVTT specification
    // See: https://www.w3.org/TR/webvtt1/#webvtt-cue-position
    // The position of the cue box depends on the cue alignment.
    //   If align: start, then the position specifies the left edge.
    //   If align: center, then it specifies the center of the cue box.
    //   If align: end, then it refers to the right edge.
    if (computedPositionAlign == Cue.positionAlign.LEFT) {
      style.cssFloat = 'left';
      if (cue.position !== null) {
        style.position = 'absolute';
        if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
          style.left = cue.position + '%';
          style.width = 'auto';
        } else {
          style.top = cue.position + '%';
        }
      }
    } else if (computedPositionAlign == Cue.positionAlign.RIGHT) {
      style.cssFloat = 'right';
      if (cue.position !== null) {
        style.position = 'absolute';
        if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
          style.right = (100 - cue.position) + '%';
          style.width = 'auto';
        } else {
          style.bottom = cue.position + '%';
        }
      }
    } else {
      if (cue.position !== null && cue.position != 50) {
        style.position = 'absolute';
        if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
          style.left = cue.position + '%';
          style.width = 'auto';
        } else {
          style.top = cue.position + '%';
        }
        if (cue.size) {
          style.transform = 'translateX(-50%)';
        }
      }
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
   * @param {!shaka.text.Cue} cue
   * @param {HTMLElement} videoContainer
   * @param {number=} scaleFactor
   * @return {string}
   * @private
   */
  static convertLengthValue_(lengthValue, cue, videoContainer,
      scaleFactor = 1) {
    const lengthValueInfo =
        shaka.text.UITextDisplayer.getLengthValueInfo_(lengthValue);

    if (!lengthValueInfo) {
      return lengthValue;
    }

    const {unit, value} = lengthValueInfo;

    const realValue = value * scaleFactor;

    switch (unit) {
      case '%':
        return shaka.text.UITextDisplayer.getAbsoluteLengthInPixels_(
            realValue / 100, cue, videoContainer);
      case 'c':
        return shaka.text.UITextDisplayer.getAbsoluteLengthInPixels_(
            realValue, cue, videoContainer);
      default:
        return realValue + unit;
    }
  }

  /**
   * Returns computed absolute length value in pixels based on cell
   * and a video container size
   * @param {number} value
   * @param {!shaka.text.Cue} cue
   * @param {HTMLElement} videoContainer
   * @return {string}
   *
   * @private
   */
  static getAbsoluteLengthInPixels_(value, cue, videoContainer) {
    const containerHeight = videoContainer.clientHeight;

    return (containerHeight * value / cue.cellResolution.rows) + 'px';
  }

  /**
   * Inherits a property from the parent Cue elements.  If the value is falsy,
   * it is assumed to be inherited from the parent. This returns null if the
   * value isn't found.
   *
   * @param {!Array<!shaka.text.Cue>} parents
   * @param {function(!shaka.text.Cue):?T} cb
   * @return {?T}
   * @template T
   * @private
   */
  static inheritProperty_(parents, cb) {
    for (let i = parents.length - 1; i >= 0; i--) {
      const val = cb(parents[i]);
      if (val || val === 0) {
        return val;
      }
    }
    return null;
  }
};
