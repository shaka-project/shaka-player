/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.text.UITextDisplayer');

goog.require('goog.asserts');
goog.require('shaka.config.CharacterEdgeStyle');
goog.require('shaka.config.PositionArea');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.text.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.Lazy');
goog.require('shaka.util.Timer');
goog.requireType('shaka.Player');


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
   * @param {shaka.Player} player
   */
  constructor(player) {
    /** @private {boolean} */
    this.isTextVisible_ = false;

    /** @private {!Array<!shaka.text.Cue>} */
    this.cues_ = [];

    /** @private {shaka.Player} */
    this.player_ = player;

    /** @private {HTMLMediaElement} */
    this.video_ = player.getMediaElement();

    /** @private {HTMLElement} */
    this.videoContainer_ = player.getVideoContainer();

    /** @private {?number} */
    this.aspectRatio_ = null;

    /** @private {boolean} */
    this.renderSuspended_ = false;

    /** @private {boolean} */
    this.isContainerActuallyVisible_ = true;

    /** @private {?shaka.extern.TextDisplayerConfiguration} */
    this.config_ = null;

    /** @private {?shaka.extern.TextDisplayerConfiguration} */
    this.previewConfig_ = null;

    /** @private {?shaka.text.Cue} */
    this.previewCue_ = null;

    /** @private {boolean} */
    this.showingPreviewCue_ = false;

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

    /**
     * Drives caption updates. Rather than polling at a fixed rate, this fires
     * once at the next moment a cue needs to change (see
     * configureCaptionsTimer_), then reschedules itself.
     * @private {shaka.util.Timer}
     */
    this.captionsTimer_ = new shaka.util.Timer(() => {
      this.updateCaptions_();
      // Schedule the next update at the following cue boundary.
      this.configureCaptionsTimer_();
    });
    this.configureCaptionsTimer_();

    /** @private {shaka.util.Timer} */
    this.applyVisibilityTimer_ = new shaka.util.Timer(() => {
      this.applyVisibility_();
    });

    /**
     * Maps cues to cue elements. Specifically points out the wrapper element of
     * the cue (e.g. the HTML element to put nested cues inside).
     * @private {Map<!shaka.text.Cue,
     *               !shaka.text.UITextDisplayer.CueRegistry_>}
     */
    this.currentCuesMap_ = new Map();

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    this.eventManager_.listen(document, 'fullscreenchange', () => {
      this.updateCaptions_(/* forceUpdate= */ true);
    });

    this.eventManager_.listen(this.video_, 'seeking', () => {
      this.updateCaptions_(/* forceUpdate= */ true);
      // The playhead jumped, so the previously scheduled boundary is stale.
      this.configureCaptionsTimer_();
    });

    // Any of these can change when the next cue boundary will be reached (or
    // whether playback is progressing at all), so re-evaluate the update
    // schedule when they fire.
    this.eventManager_.listenMulti(this.video_,
        ['play', 'playing', 'pause', 'waiting'], () => {
          this.configureCaptionsTimer_();
        });

    // Use the player's rate change event (which also covers trick play) rather
    // than the media element's, to match getPlaybackRate() below.
    this.eventManager_.listen(this.player_, 'ratechange', () => {
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

    /** @private {boolean} */
    this.pendingResize_ = false;

    /** @private {ResizeObserver} */
    this.resizeObserver_ = null;
    if ('ResizeObserver' in window) {
      this.resizeObserver_ = new ResizeObserver(() => {
        if (this.pendingResize_) {
          return;
        }
        this.pendingResize_ = true;
        requestAnimationFrame(() => {
          this.pendingResize_ = false;

          if (!this.textContainer_) {
            return;
          }

          if (this.textContainer_.parentElement && this.isTextVisible_) {
            this.updateCaptions_(/* forceUpdate= */ true);
          }
        });
      });
      goog.asserts.assert(this.videoContainer_,
          'this.videoContainer_ must be non-null');
      this.resizeObserver_.observe(this.videoContainer_);
    }

    /** @private {Map<string, !HTMLElement>} */
    this.regionElements_ = new Map();

    /**
     * The background colors of the region elements which have one.
     * @private {!Map<!HTMLElement, string>}
     */
    this.regionBackgrounds_ = new Map();

    /**
     * The new paragraphs with ruby, which are laid out once they are shown,
     * as some of their ruby depends on the lines they are broken into.
     * @private {!Array<{element: !HTMLElement, cue: !shaka.text.Cue}>}
     */
    this.rubyParagraphs_ = [];

    /**
     * The new ruby elements whose annotations are outside the lines of their
     * paragraph.
     * @private {!Array<!HTMLElement>}
     */
    this.outsideRubyElements_ = [];

    /** @private {IntersectionObserver} */
    this.visibilityObserver_ = null;
    if ('IntersectionObserver' in window) {
      const options = {
        root: null,
        threshold: [0.01],
      };
      this.visibilityObserver_ = new IntersectionObserver((entries) => {
        if (entries.length) {
          const entry = entries[entries.length - 1];
          this.isContainerActuallyVisible_ =
              entry.isIntersecting && entry.intersectionRatio > 0;
          this.applyVisibilityTimer_.tickAfter(
              shaka.text.UITextDisplayer.VISIBILITY_DEBOUNCE_);
        }
      }, options);
      goog.asserts.assert(this.videoContainer_,
          'this.videoContainer_ must be non-null');
      this.visibilityObserver_.observe(this.videoContainer_);
    }

    this.eventManager_.listen(document, 'visibilitychange', (e) => {
      this.applyVisibilityTimer_.tickNow();
    });

    shaka.util.Dom.listenForPlayerExpansion(this.eventManager_, this.video_,
        () => this.applyVisibilityTimer_.tickNow());

    const video = /** @type {HTMLVideoElement} */(this.video_);
    if (video.webkitPresentationMode || video.webkitSupportsFullscreen) {
      this.eventManager_.listen(video, 'webkitpresentationmodechanged', () => {
        this.applyVisibilityTimer_.tickNow();
      });
    }

    this.applyVisibility_();
  }


  /**
   * @override
   * @export
   */
  configure(config) {
    this.config_ = config;
    this.configureCaptionsTimer_();
    // Re-evaluate visibility, since the new config may have changed
    // suspendRenderingWhenHidden.  Without this, a previously suspended
    // renderer (e.g. suspended at construction time because the container was
    // not yet visible) would stay suspended and updateCaptions_() below would
    // be a no-op.
    this.applyVisibility_();
    this.updateCaptions_(/* forceUpdate= */ true);
  }

  /**
   * Temporarily previews text displayer style settings using the normal UI
   * text rendering path.
   *
   * @param {!shaka.extern.TextDisplayerConfiguration} config
   * @param {string} exampleText
   * @export
   */
  setTextStylePreview(config, exampleText) {
    this.previewConfig_ =
    /** @type {!shaka.extern.TextDisplayerConfiguration} */(
        Object.assign({}, config));
    this.previewCue_ = new shaka.text.Cue(
        Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, exampleText);
    this.updateCaptions_(/* forceUpdate= */ true);
  }

  /**
   * Clears temporary text style preview settings.
   * @export
   */
  clearTextStylePreview() {
    if (!this.previewConfig_ && !this.previewCue_) {
      return;
    }

    this.previewConfig_ = null;
    this.previewCue_ = null;
    this.showingPreviewCue_ = false;
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
    this.previewConfig_ = null;
    this.previewCue_ = null;
    this.showingPreviewCue_ = false;
    this.captionsTimer_?.stop();
    this.captionsTimer_ = null;
    this.applyVisibilityTimer_?.stop();
    this.applyVisibilityTimer_ = null;

    this.currentCuesMap_.clear();

    // Tear-down the event manager to ensure messages stop moving around.
    this.eventManager_?.release();
    this.eventManager_ = null;

    this.resizeObserver_?.disconnect();
    this.resizeObserver_ = null;

    this.visibilityObserver_?.disconnect();
    this.visibilityObserver_ = null;

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
   * Schedules the next caption update to land exactly when the displayed text
   * next needs to change (a cue or nested-cue start/end boundary), instead of
   * polling at a fixed rate. This makes character-by-character reveals (CEA-608
   * paint-on / roll-up) land on time and avoids waking up while nothing is
   * changing. A safety period bounds the wait so a missed event or a stall can
   * never freeze the captions.
   * @private
   */
  configureCaptionsTimer_() {
    if (!this.captionsTimer_) {
      return;
    }
    // Nothing to animate: no cues, rendering suspended, or playback paused (a
    // paused frame doesn't change, and events such as seeking force their own
    // update).
    if (!this.cues_.length || this.renderSuspended_ || this.video_.paused) {
      this.captionsTimer_.stop();
      return;
    }

    const UITextDisplayer = shaka.text.UITextDisplayer;
    const delay = this.getActiveConfig_()?.subtitleDelay ?? 0;
    const now = this.video_.currentTime - delay;

    // Default to the safety period; tighten it to the next boundary below.
    let mediaUntilUpdate = UITextDisplayer.SAFETY_REFRESH_PERIOD_;
    const nextBoundary = this.getNextBoundary_(this.cues_, now);
    // Only target the boundary while the media is actually progressing. During
    // a stall currentTime is frozen, so the boundary never gets closer; fall
    // back to the safety period to avoid waking repeatedly for nothing.
    if (nextBoundary != null &&
        this.video_.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      mediaUntilUpdate = Math.min(
          mediaUntilUpdate, Math.max(0, nextBoundary - now));
    }

    // Convert from media time to wall-clock time using the playback rate, with
    // a small floor so dense cues (e.g. per-character reveals) can't spin.
    const rate = Math.abs(this.player_.getPlaybackRate()) || 1;
    const wallUntilUpdate = Math.max(
        UITextDisplayer.MIN_REFRESH_PERIOD_, mediaUntilUpdate / rate);
    this.captionsTimer_.tickAfter(wallUntilUpdate);
  }

  /**
   * Finds the earliest cue or nested-cue time boundary strictly after the given
   * time. These are the only moments at which the rendered output can change,
   * so the update timer wakes there.
   * @param {!Array<!shaka.text.Cue>} cues
   * @param {number} time
   * @return {?number} The next boundary time, or null if there is none ahead.
   * @private
   */
  getNextBoundary_(cues, time) {
    let next = null;
    const consider = (boundary) => {
      if (boundary > time && (next == null || boundary < next)) {
        next = boundary;
      }
    };
    for (const cue of cues) {
      consider(cue.startTime);
      consider(cue.endTime);
      if (cue.nestedCues.length) {
        const nestedNext = this.getNextBoundary_(cue.nestedCues, time);
        if (nestedNext != null) {
          consider(nestedNext);
        }
      }
    }
    return next;
  }

  /**
   * @return {?shaka.extern.TextDisplayerConfiguration}
   * @private
   */
  getActiveConfig_() {
    return this.previewConfig_ || this.config_;
  }

  /**
   * @private
   */
  applyVisibility_() {
    const video = /** @type {HTMLVideoElement} */(this.video_);
    let isPiPActive = false;
    if (window.documentPictureInPicture &&
        window.documentPictureInPicture.window) {
      isPiPActive = true;
    } else if (document.pictureInPictureElement === video) {
      isPiPActive = true;
    }
    let isFullscreenActive = false;
    if (document.fullscreenEnabled &&
        document.fullscreenElement === this.videoContainer_) {
      isFullscreenActive = true;
    } else if (video.webkitSupportsFullscreen) {
      isFullscreenActive = video.webkitDisplayingFullscreen;
    }
    const pageVisible = document.visibilityState === 'visible';
    const suspendWhenHidden = this.config_?.suspendRenderingWhenHidden ?? true;
    const actuallyVisible = !suspendWhenHidden || isPiPActive ||
        isFullscreenActive ||
        (pageVisible && this.isContainerActuallyVisible_);
    if (actuallyVisible) {
      if (this.renderSuspended_) {
        this.renderSuspended_ = false;
        this.configureCaptionsTimer_();
        requestAnimationFrame(() => {
          if (!this.textContainer_) {
            return;
          }

          if (this.textContainer_.parentElement && this.isTextVisible_) {
            this.updateCaptions_();
          }
        });
      }
    } else {
      if (!this.renderSuspended_) {
        this.renderSuspended_ = true;
        if (this.captionsTimer_) {
          this.captionsTimer_.stop();
        }
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
   * Looks up the cue registry for a cue.  When a custom positionArea is
   * configured the cue list is cloned, so the cue may not be a key by
   * reference; in that case we fall back to an equality-based search.
   *
   * @param {!shaka.text.Cue} cue
   * @param {?shaka.extern.TextDisplayerConfiguration} config
   * @return {{
   *   key: !shaka.text.Cue,
   *   registry: ?shaka.text.UITextDisplayer.CueRegistry_,
   * }}
   * @private
   */
  findCueRegistry_(cue, config) {
    let key = cue;
    let registry = this.currentCuesMap_.get(cue) || null;
    if (!registry && config &&
        config.positionArea != shaka.config.PositionArea.DEFAULT) {
      for (const candidate of this.currentCuesMap_.keys()) {
        if (shaka.text.Cue.equal(cue, candidate)) {
          key = candidate;
          registry = this.currentCuesMap_.get(candidate);
        }
      }
    }
    return {key, registry};
  }

  /**
   * @param {!Array<!shaka.text.Cue>} cues
   * @param {!HTMLElement} container
   * @param {number} currentTime
   * @param {!Array<!shaka.text.Cue>} parents
   * @private
   */
  updateCuesRecursive_(cues, container, currentTime, parents) {
    const config = this.getActiveConfig_();

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
    /**
     * The cues created in this call, whose elements are new.
     * @type {!Set<!shaka.text.Cue>}
     */
    const newCues = new Set();
    for (const cue of cues) {
      parents.push(cue);

      const registryInfo = this.findCueRegistry_(cue, config);
      const cueKey = registryInfo.key;
      let cueRegistry = registryInfo.registry;
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
          this.currentCuesMap_.delete(cueKey);
          cueRegistry = null;
        }
      }

      if (shouldBeDisplayed) {
        toPlant.push(cue);
        if (!cueRegistry) {
          // The cue has to be made!
          this.createCue_(cue, parents);
          newCues.add(cue);
          cueRegistry = this.currentCuesMap_.get(cueKey);
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
      // Nested cues keep the order of the document they come from.
      if (!parents.length) {
        toPlant.sort((a, b) => {
          if (a.startTime != b.startTime) {
            return a.startTime - b.startTime;
          } else {
            return a.endTime - b.endTime;
          }
        });
      }
      /**
       * The new cue elements of each region that scrolls up.
       * @type {!Map<!HTMLElement, !Array<!HTMLElement>>}
       */
      const scrollingRegions = new Map();
      for (const cue of toPlant) {
        const cueRegistry = this.findCueRegistry_(cue, config).registry;
        goog.asserts.assert(cueRegistry, 'cueRegistry should exist.');
        if (cueRegistry.regionElement) {
          if (cueRegistry.regionElement.contains(container)) {
            cueRegistry.regionElement.removeChild(container);
          }
          container.appendChild(cueRegistry.regionElement);
          cueRegistry.regionElement.appendChild(cueRegistry.cueElement);
          if (newCues.has(cue) &&
              cue.region.scroll == shaka.text.CueRegion.scrollMode.UP) {
            const regionElement = cueRegistry.regionElement;
            if (!scrollingRegions.has(regionElement)) {
              scrollingRegions.set(regionElement, []);
            }
            scrollingRegions.get(regionElement).push(cueRegistry.cueElement);
          }
        } else {
          container.appendChild(cueRegistry.cueElement);
        }
      }
      for (const regionElement of scrollingRegions.keys()) {
        shaka.text.UITextDisplayer.scrollUpRegion_(
            regionElement, scrollingRegions.get(regionElement));
      }
    }
  }

  /**
   * @param {!Array<!shaka.text.Cue>} cues
   * @param {number} currentTime
   * @return {boolean}
   * @private
   */
  hasCueAtTime_(cues, currentTime) {
    return cues.some((cue) => {
      return cue.startTime <= currentTime && cue.endTime > currentTime &&
        this.hasCueContent_(cue);
    });
  }

  /**
   * @param {!shaka.text.Cue} cue
   * @return {boolean}
   * @private
   */
  hasCueContent_(cue) {
    const text = cue.payload.replace(/[\u00a0\u200B]/g, ' ').trim();
    return !!text || !!cue.backgroundImage ||
      cue.nestedCues.some((nestedCue) => this.hasCueContent_(nestedCue));
  }

  /**
   * Display the current captions.
   * @param {boolean=} forceUpdate
   * @private
   */
  updateCaptions_(forceUpdate = false) {
    if (!this.textContainer_ || this.renderSuspended_) {
      return;
    }

    const config = this.getActiveConfig_();
    const delay = config?.subtitleDelay ?? 0;
    const currentTime = this.video_.currentTime - delay;
    // The real cues are only shown instead of the preview while the text is
    // visible.  Otherwise, the preview would never show while the text is
    // disabled and a cue is buffered at the current time.
    const showPreviewCue = !!this.previewCue_ &&
        (!this.isTextVisible_ || !this.hasCueAtTime_(this.cues_, currentTime));
    if (showPreviewCue != this.showingPreviewCue_) {
      forceUpdate = true;
      this.showingPreviewCue_ = showPreviewCue;
    }

    if (showPreviewCue) {
      // Force a full clear if we are showing a preview. This prevents
      // "stacking" bugs because the preview cue object changes
      // frequently during hover.
      forceUpdate = true;
    }
    const shouldBeVisible = this.isTextVisible_ || showPreviewCue;
    if (shouldBeVisible) {
      if (!this.textContainer_.parentElement) {
        this.videoContainer_.appendChild(this.textContainer_);
      }
    } else {
      if (this.textContainer_.parentElement) {
        this.videoContainer_.removeChild(this.textContainer_);
      }
    }

    if (!shouldBeVisible || forceUpdate) {
      // Remove child elements from all regions.
      for (const regionElement of this.regionElements_.values()) {
        shaka.util.Dom.removeAllChildren(regionElement);
      }
      // Remove all top-level elements in the text container.
      shaka.util.Dom.removeAllChildren(this.textContainer_);
      // Clear the element maps.
      this.currentCuesMap_.clear();
      this.regionElements_.clear();
      this.regionBackgrounds_.clear();
    }
    if (shouldBeVisible) {
      // Log currently attached cue elements for verification, later.
      const previousCuesMap = new Map();
      if (goog.DEBUG) {
        for (const cue of this.currentCuesMap_.keys()) {
          previousCuesMap.set(cue, this.currentCuesMap_.get(cue));
        }
      }

      let cues = showPreviewCue && this.previewCue_ ?
        [this.previewCue_] : this.cues_;
      if (config &&
        config.positionArea != shaka.config.PositionArea.DEFAULT) {
        cues = cues.map((cue) => this.processCueStyle_(cue));
      }

      // Update the cues.
      this.updateCuesRecursive_(
          cues, this.textContainer_, currentTime, /* parents= */ []);
      this.paintRegionBackgrounds_();
      this.layOutRuby_();

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

  /** @private */
  processCueStyle_(cue) {
    const config = /** @type {!shaka.extern.TextDisplayerConfiguration} */(
      this.getActiveConfig_());
    goog.asserts.assert(
        config.positionArea !== shaka.config.PositionArea.DEFAULT,
        'processCueStyle_ is intended to use on non default positioning');
    const modifiedCue = cue.clone();
    shaka.text.Utils.resetCuePositioning(modifiedCue);
    modifiedCue.region = shaka.text.UITextDisplayer.CustomRegion_.value();
    switch (config.positionArea) {
      case shaka.config.PositionArea.TOP_LEFT:
        modifiedCue.textAlign = shaka.text.Cue.textAlign.LEFT;
        modifiedCue.displayAlign = shaka.text.Cue.displayAlign.BEFORE;
        break;
      case shaka.config.PositionArea.TOP_CENTER:
        modifiedCue.textAlign = shaka.text.Cue.textAlign.CENTER;
        modifiedCue.displayAlign = shaka.text.Cue.displayAlign.BEFORE;
        break;
      case shaka.config.PositionArea.TOP_RIGHT:
        modifiedCue.textAlign = shaka.text.Cue.textAlign.RIGHT;
        modifiedCue.displayAlign = shaka.text.Cue.displayAlign.BEFORE;
        break;
      case shaka.config.PositionArea.CENTER_LEFT:
        modifiedCue.textAlign = shaka.text.Cue.textAlign.LEFT;
        modifiedCue.displayAlign = shaka.text.Cue.displayAlign.CENTER;
        break;
      case shaka.config.PositionArea.CENTER:
        modifiedCue.textAlign = shaka.text.Cue.textAlign.CENTER;
        modifiedCue.displayAlign = shaka.text.Cue.displayAlign.CENTER;
        break;
      case shaka.config.PositionArea.CENTER_RIGHT:
        modifiedCue.textAlign = shaka.text.Cue.textAlign.RIGHT;
        modifiedCue.displayAlign = shaka.text.Cue.displayAlign.CENTER;
        break;
      case shaka.config.PositionArea.BOTTOM_LEFT:
        modifiedCue.textAlign = shaka.text.Cue.textAlign.LEFT;
        modifiedCue.displayAlign = shaka.text.Cue.displayAlign.AFTER;
        break;
      case shaka.config.PositionArea.BOTTOM_CENTER:
        modifiedCue.textAlign = shaka.text.Cue.textAlign.CENTER;
        modifiedCue.displayAlign = shaka.text.Cue.displayAlign.AFTER;
        break;
      case shaka.config.PositionArea.BOTTOM_RIGHT:
        modifiedCue.textAlign = shaka.text.Cue.textAlign.RIGHT;
        modifiedCue.displayAlign = shaka.text.Cue.displayAlign.AFTER;
        break;
    }
    return modifiedCue;
  }

  /**
   * Compute a unique internal id:
   * Regions can reuse the id but have different dimensions, we need to
   * consider those differences
   * @param {shaka.text.CueRegion} region
   * @private
   */
  generateRegionId_(region) {
    const CueRegion = shaka.text.CueRegion;
    const percentageUnit = CueRegion.units.PERCENTAGE;
    let heightUnit = region.heightUnits == percentageUnit ? '%' : 'px';
    if (region.heightUnits == CueRegion.units.LINES) {
      heightUnit = 'lines';
    }
    const viewportAnchorUnit =
        region.viewportAnchorUnits == percentageUnit ? '%' : 'px';
    const uniqueRegionId = `${region.id}_${
      region.width}x${region.height}${heightUnit}-${
      region.viewportAnchorX}x${region.viewportAnchorY}${viewportAnchorUnit}-${
      region.regionAnchorX}x${region.regionAnchorY}-${
      region.backgroundColor}-${region.opacity}-${region.padding}-${
      region.overflow}-${region.zIndex}`;

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
    const UITextDisplayer = shaka.text.UITextDisplayer;
    const region = cue.region;
    // from https://dvcs.w3.org/hg/text-tracks/raw-file/default/608toVTT/608toVTT.html#caption-window-size
    // if aspect ratio is 4/3, use that value, otherwise, use the 16:9 value
    const lineWidthMultiple = this.aspectRatio_ === 4/3 ? 2.5 : 1.9;

    const regionId = this.generateRegionId_(region);
    if (this.regionElements_.has(regionId)) {
      return this.regionElements_.get(regionId);
    }

    const regionElement = shaka.util.Dom.createHTMLElement('span');

    const linesUnit = shaka.text.CueRegion.units.LINES;
    const percentageUnit = shaka.text.CueRegion.units.PERCENTAGE;
    const pixelUnit = shaka.text.CueRegion.units.PX;
    const heightUnit = region.heightUnits == percentageUnit ? '%' : 'px';
    let widthUnit = region.widthUnits == percentageUnit ? '%' : 'px';
    const viewportAnchorUnit =
        region.viewportAnchorUnits == percentageUnit ? '%' : 'px';

    regionElement.id = 'shaka-text-region---' + regionId;
    regionElement.classList.add('shaka-text-region');

    regionElement.style.position = 'absolute';

    let regionWidth = region.width;
    if (region.widthUnits === linesUnit) {
      regionWidth = region.width * lineWidthMultiple;
      widthUnit = '%';
    }
    regionElement.style.width = regionWidth + widthUnit;

    // A region sized in lines is as tall as that many lines of its cues, so
    // its height is a multiple of their font size.  Other regions have a
    // fixed height.
    const sizedInLines = region.heightUnits === linesUnit;
    let fontSize = '';
    let lines = 0;
    if (sizedInLines) {
      const config = this.getActiveConfig_();
      const fontScaleFactor = config ? config.fontScaleFactor : 1;
      fontSize = UITextDisplayer.convertLengthValue_(
          cue.fontSize || '1em', cue, this.videoContainer_, fontScaleFactor);
      const lineHeight = UITextDisplayer.REGION_LINE_HEIGHT_;
      lines = region.height * lineHeight;
      regionElement.style.height = `calc(${lines} * ${fontSize})`;
      // The cues inherit it, so the lines of the region fit them exactly.
      regionElement.style.lineHeight = String(lineHeight);
    } else {
      regionElement.style.height = region.height + heightUnit;
    }

    let top;
    let left;
    let anchorUnit = viewportAnchorUnit;
    if (region.viewportAnchorUnits === linesUnit) {
      // from https://dvcs.w3.org/hg/text-tracks/raw-file/default/608toVTT/608toVTT.html#positioning-in-cea-708
      top = region.viewportAnchorY / 75 * 100;
      const windowWidth = this.aspectRatio_ === 4/3 ? 160 : 210;
      left = region.viewportAnchorX / windowWidth * 100;
      anchorUnit = '%';
    } else {
      top = region.viewportAnchorY;
      left = region.viewportAnchorX;
    }
    // Adjust top and left values based on the region anchor and size.
    left -= region.regionAnchorX * regionWidth / 100;
    regionElement.style.left = left + anchorUnit;
    if (sizedInLines) {
      const regionAnchorLines = region.regionAnchorY / 100 * lines;
      regionElement.style.top =
          `calc(${top}${anchorUnit} - ${regionAnchorLines} * ${fontSize})`;
    } else {
      top -= region.regionAnchorY * region.height / 100;
      regionElement.style.top = top + anchorUnit;
    }

    if (region.heightUnits !== pixelUnit &&
        region.widthUnits !== pixelUnit &&
        region.viewportAnchorUnits !== pixelUnit) {
      // Clip region.  The top of a region sized in lines depends on the font
      // size, so it can't be clipped here.
      const width = parseInt(regionElement.style.width.slice(0, -1), 10) || 0;
      const realLeft = Math.max(0, Math.min(100 - width, left));
      regionElement.style.left = realLeft + '%';
      if (!sizedInLines) {
        const height =
            parseInt(regionElement.style.height.slice(0, -1), 10) || 0;
        const realTop = Math.max(0, Math.min(100 - height, top));
        regionElement.style.top = realTop + '%';
      }
    }

    regionElement.style.display = 'flex';
    regionElement.style.flexDirection = 'column';
    regionElement.style.alignItems = 'center';

    regionElement.style.justifyContent =
        UITextDisplayer.displayAlignToJustifyContent_(cue.displayAlign);

    if (region.backgroundColor) {
      // It is painted while the region shows content.
      this.regionBackgrounds_.set(regionElement, region.backgroundColor);
    }
    if (region.opacity != 1) {
      regionElement.style.opacity = String(region.opacity);
    }
    if (region.padding && !sizedInLines) {
      // The padding is inside the region.  CSS can't express a length
      // relative to the height of the region, so percentages are converted to
      // pixels.  The top and bottom lengths come first.
      regionElement.style.boxSizing = 'border-box';
      const container = this.videoContainer_;
      regionElement.style.padding = region.padding.split(' ').map((side, i) => {
        const isHorizontal = i % 2;
        const size = isHorizontal ? region.width : region.height;
        const units = isHorizontal ? region.widthUnits : region.heightUnits;
        const containerSize = units != percentageUnit ? 100 : isHorizontal ?
            container.clientWidth : container.clientHeight;
        return side.endsWith('%') ?
            parseFloat(side) * size * containerSize / 10000 + 'px' : side;
      }).join(' ');
    }
    if (region.overflow) {
      regionElement.style.overflow = region.overflow;
    }
    if (region.zIndex != null) {
      regionElement.style.zIndex = String(region.zIndex);
      // The regions are only stacked relative to each other, so that a
      // negative z-index does not hide a region behind the video.
      this.textContainer_.style.isolation = 'isolate';
    }

    if (region.scroll == shaka.text.CueRegion.scrollMode.UP) {
      // New lines are added at the bottom and push the older ones up, out of
      // the region.
      regionElement.style.justifyContent = 'flex-end';
      regionElement.style.overflow = 'hidden';
    }

    this.regionElements_.set(regionId, regionElement);
    return regionElement;
  }

  /**
   * Paints the background of the regions while they show content.  The region
   * of a cue which only contains other cues is displayed with it, even when
   * none of those cues is.
   *
   * @private
   */
  paintRegionBackgrounds_() {
    if (!this.regionBackgrounds_.size) {
      return;
    }
    /** @type {!Array<!HTMLElement>} */
    const leafElements = [];
    for (const cue of this.currentCuesMap_.keys()) {
      if (!cue.nestedCues.length) {
        leafElements.push(this.currentCuesMap_.get(cue).cueElement);
      }
    }
    for (const regionElement of this.regionBackgrounds_.keys()) {
      const showsContent =
          leafElements.some((element) => regionElement.contains(element));
      regionElement.style.backgroundColor =
          showsContent ? this.regionBackgrounds_.get(regionElement) : '';
    }
  }

  /**
   * Lays out the ruby of the new paragraphs which depends on the lines they
   * are broken into: the annotations which are outside the lines, and the
   * space reserved for annotations on each line.
   * See https://www.w3.org/TR/ttml2/#style-attribute-rubyPosition and
   * https://www.w3.org/TR/ttml2/#style-attribute-rubyReserve
   *
   * @private
   */
  layOutRuby_() {
    const UITextDisplayer = shaka.text.UITextDisplayer;
    const paragraphs = this.rubyParagraphs_.filter(
        (paragraph) => this.textContainer_.contains(paragraph.element));
    const outsideRubyElements = this.outsideRubyElements_;
    this.rubyParagraphs_ = [];
    this.outsideRubyElements_ = [];

    // The layout is read before it is changed, so that it is only computed
    // once.
    /** @type {!Array<function()>} */
    const changes = [];
    for (const {element, cue} of paragraphs) {
      const writingMode = cue.writingMode;
      const lines = UITextDisplayer.getLines_(element, writingMode);
      if (!lines.length) {
        continue;
      }
      /** @type {function(!DOMRect):number} */
      const getLine = (rect) => {
        const center = UITextDisplayer.getBlockInterval_(
            rect, writingMode).reduce((a, b) => a + b) / 2;
        const index = lines.findIndex((line) => center < line[1]);
        return index < 0 ? lines.length - 1 : index;
      };

      // Outside is before the first line, and after the other lines.
      for (const rubyElement of outsideRubyElements) {
        if (element.contains(rubyElement)) {
          const isBefore = getLine(
              UITextDisplayer.getBaseRect_(rubyElement)) == 0;
          changes.push(() => UITextDisplayer.setRubyPosition_(
              rubyElement, isBefore, writingMode));
        }
      }

      if (!cue.rubyReserve) {
        continue;
      }
      const [position, size] = cue.rubyReserve.split(' ');
      const fontSize = UITextDisplayer.convertLengthValue_(
          size, cue, this.videoContainer_);
      // The space is reserved by a ruby with an empty annotation, which is
      // added at the start of each line.  Both sides are reserved by nesting
      // a ruby annotated after the line in one annotated before it.
      for (const {node, offset, line} of
        UITextDisplayer.getLineStarts_(element, getLine)) {
        let ruby = shaka.util.Dom.createHTMLElement('span');
        ruby.textContent = UITextDisplayer.ZERO_WIDTH_SPACE_;
        const isBoth = position == 'both' ||
            (position == 'outside' && lines.length == 1);
        const isBefore = position == 'before' ||
            (position == 'outside' && line == 0);
        for (const before of isBoth ? [false, true] : [isBefore]) {
          const outer = shaka.util.Dom.createHTMLElement('ruby');
          outer.appendChild(ruby);
          const annotation = shaka.util.Dom.createHTMLElement('rt');
          annotation.textContent = UITextDisplayer.ZERO_WIDTH_SPACE_;
          annotation.style.fontSize = fontSize;
          outer.appendChild(annotation);
          UITextDisplayer.setRubyPosition_(outer, before, writingMode);
          ruby = outer;
        }
        changes.push(() => {
          const next = offset ?
              /** @type {!Text} */ (node).splitText(offset) : node;
          next.parentNode.insertBefore(ruby, next);
        });
      }
    }
    // The line starts are changed from the last one, so that the offsets in
    // the texts of the previous ones are still valid.
    for (const change of changes.reverse()) {
      change();
    }
  }

  /**
   * Gets the texts of an element which are laid out on its lines, which are
   * not the ones of ruby annotations.
   *
   * @param {!Element} element
   * @return {!Array<!Text>}
   * @private
   */
  static getBaseTexts_(element) {
    const texts = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (!node.parentElement.closest('rt, rp')) {
        texts.push(/** @type {!Text} */ (node));
      }
      node = walker.nextNode();
    }
    return texts;
  }

  /**
   * Gets the rectangle of the bases of a ruby, without its annotations.
   *
   * @param {!Element} element
   * @return {!DOMRect}
   * @private
   */
  static getBaseRect_(element) {
    const texts = shaka.text.UITextDisplayer.getBaseTexts_(element);
    if (!texts.length) {
      return /** @type {!DOMRect} */ (element.getBoundingClientRect());
    }
    const range = document.createRange();
    range.setStartBefore(texts[0]);
    range.setEndAfter(texts[0]);
    return /** @type {!DOMRect} */ (range.getBoundingClientRect());
  }

  /**
   * Finds whether a cue contains ruby.
   *
   * @param {!shaka.text.Cue} cue
   * @return {boolean}
   * @private
   */
  static hasRuby_(cue) {
    return cue.nestedCues.some((nestedCue) => !!nestedCue.rubyTag ||
        shaka.text.UITextDisplayer.hasRuby_(nestedCue));
  }

  /**
   * Places the annotations of a ruby before or after the line, in the block
   * progression direction.
   *
   * @param {!HTMLElement} element
   * @param {boolean} isBefore
   * @param {shaka.text.Cue.writingMode} writingMode
   * @private
   */
  static setRubyPosition_(element, isBefore, writingMode) {
    // "over" is above a horizontal line, and on the right of a vertical one,
    // which is before the line when lines are stacked from right to left.
    const isOver = isBefore !=
        (writingMode == shaka.text.Cue.writingMode.VERTICAL_LEFT_TO_RIGHT);
    const position = isOver ? 'over' : 'under';
    element.style.setProperty('ruby-position', position);
    if (element.style.getPropertyValue('ruby-position') != position) {
      // Older versions of WebKit only have a prefixed property, whose values
      // are relative to the block progression already.
      element.style.setProperty(
          '-webkit-ruby-position', isBefore ? 'before' : 'after');
    }
  }

  /**
   * Gets the lines a paragraph is broken into, as intervals along the block
   * progression direction, in the order the lines are stacked.
   *
   * @param {!HTMLElement} element
   * @param {shaka.text.Cue.writingMode} writingMode
   * @return {!Array<!Array<number>>}
   * @private
   */
  static getLines_(element, writingMode) {
    // A paragraph is a block, so the lines are the ones of its text.
    const rects = [];
    for (const text of shaka.text.UITextDisplayer.getBaseTexts_(element)) {
      const range = document.createRange();
      range.selectNodeContents(text);
      rects.push(...Array.from(range.getClientRects()));
    }
    const intervals = rects
        .filter((rect) => rect.width || rect.height)
        .map((rect) => shaka.text.UITextDisplayer.getBlockInterval_(
            /** @type {!DOMRect} */ (rect), writingMode))
        .sort((a, b) => a[0] - b[0]);
    // The fragments of a line, like the ones of its nested elements, overlap.
    /** @type {!Array<!Array<number>>} */
    const lines = [];
    for (const interval of intervals) {
      const last = lines[lines.length - 1];
      if (last && interval[0] < last[1]) {
        last[1] = Math.max(last[1], interval[1]);
      } else {
        lines.push(interval);
      }
    }
    return lines;
  }

  /**
   * Gets the interval of a rectangle along the block progression direction,
   * which increases from the first line to the last one.
   *
   * @param {!DOMRect} rect
   * @param {shaka.text.Cue.writingMode} writingMode
   * @return {!Array<number>}
   * @private
   */
  static getBlockInterval_(rect, writingMode) {
    const Cue = shaka.text.Cue;
    if (writingMode == Cue.writingMode.VERTICAL_RIGHT_TO_LEFT) {
      return [-rect.right, -rect.left];
    } else if (writingMode == Cue.writingMode.VERTICAL_LEFT_TO_RIGHT) {
      return [rect.left, rect.right];
    }
    return [rect.top, rect.bottom];
  }

  /**
   * Finds where each line of a paragraph starts: before the first ruby, or the
   * first character which is not a space, of the line.
   *
   * @param {!HTMLElement} element
   * @param {function(!DOMRect):number} getLine
   * @return {!Array<{node: !Node, offset: number, line: number}>} The node
   *   and the offset in its text of each line start, with the index of the
   *   line.
   * @private
   */
  static getLineStarts_(element, getLine) {
    const UITextDisplayer = shaka.text.UITextDisplayer;
    /** @type {!Array<{node: !Node, offset: number, line: number}>} */
    const starts = [];
    let lastLine = -1;
    /**
     * @param {!Node} node
     * @param {number} offset
     * @param {!DOMRect} rect
     */
    const visit = (node, offset, rect) => {
      const line = getLine(rect);
      if (line > lastLine) {
        starts.push({node, offset, line});
        lastLine = line;
      }
    };
    const walker = document.createTreeWalker(element,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType == Node.ELEMENT_NODE) {
        const name = /** @type {!Element} */ (node).localName;
        if (name == 'ruby') {
          // A ruby is laid out with its annotations, on one line.
          visit(node, 0, UITextDisplayer.getBaseRect_(
              /** @type {!Element} */ (node)));
          // Its content is skipped.
          node = null;
          while (!node && walker.currentNode != element) {
            node = walker.nextSibling();
            if (!node && !walker.parentNode()) {
              break;
            }
          }
          continue;
        }
      } else {
        const text = /** @type {!Text} */ (node).data;
        for (let i = 0; i < text.length; i++) {
          if (/\s/.test(text[i])) {
            continue;
          }
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          visit(node, i, /** @type {!DOMRect} */ (
            range.getBoundingClientRect()));
        }
      }
      node = walker.nextNode();
    }
    return starts;
  }

  /**
   * Scrolls up the lines of a region with scroll:up when new cues are added to
   * it, the way the WebVTT spec transitions the region from the old to the new
   * position of its lines.
   * See https://www.w3.org/TR/webvtt1/#processing-model
   *
   * @param {!HTMLElement} regionElement
   * @param {!Array<!HTMLElement>} newCueElements
   * @private
   */
  static scrollUpRegion_(regionElement, newCueElements) {
    // The region only contains cue elements.
    const children = /** @type {!Array<!HTMLElement>} */ (
      Array.from(regionElement.childNodes));
    if (children.length <= newCueElements.length) {
      // There were no lines to scroll.
      return;
    }
    let height = 0;
    for (const element of newCueElements) {
      height += element.offsetHeight;
    }
    if (!height) {
      return;
    }
    const duration = shaka.text.UITextDisplayer.SCROLL_DURATION_MS_;
    for (const child of children) {
      if (child.animate) {
        child.animate([
          {transform: `translateY(${height}px)`},
          {transform: 'translateY(0)'},
        ], {duration, easing: 'ease'});
      }
    }
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
      // When the background is customized, it is only painted behind the
      // text, so semi-transparent backgrounds are not painted twice.
      if (!shaka.text.UITextDisplayer.isBackgroundCustomized_(
          this.getActiveConfig_())) {
        wrapper.style.backgroundColor = cue.backgroundColor;
      }
      wrapper.style.lineHeight = 'normal';
      if (cue.isContainer) {
        // The wrapper of a container lays its blocks out like the container
        // does, instead of shrinking them to their content.
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.width = '100%';
      }
      cueElement.appendChild(wrapper);
    }

    if (type != 'br' && !cue.backgroundImage) {
      this.paintWindow_(cueElement, wrapper, cue, parents);
    }

    this.currentCuesMap_.set(cue, {cueElement, wrapper, regionElement});
  }

  /**
   * Paints the window of the configuration, a box behind all the lines of a
   * block of text, which are the top-level cues and the cues laid out as
   * separate lines by their container.  The backgrounds of the text are
   * painted over it.
   *
   * @param {!HTMLElement} cueElement
   * @param {!HTMLElement} wrapper
   * @param {!shaka.text.Cue} cue
   * @param {!Array<!shaka.text.Cue>} parents The parents of the cue, and the
   *   cue itself.
   * @private
   */
  paintWindow_(cueElement, wrapper, cue, parents) {
    const config = this.getActiveConfig_();
    if (!config ||
        (!config.windowColor && isNaN(config.windowOpacity))) {
      return;
    }
    const isNested = parents.length > 1;
    // The text inside containers is laid out in the blocks of the containers'
    // children.
    if (cue.isContainer ||
        (isNested && !parents[parents.length - 2].isContainer)) {
      return;
    }

    let windowElement = cueElement;
    if (wrapper != cueElement) {
      // The wrapper contains all the lines.
      windowElement = wrapper;
    } else if (!isNested) {
      // The text of a top-level cue is directly in its element, which may be
      // wider than the text, so it is moved into a box that fits it.
      windowElement = shaka.util.Dom.createHTMLElement('span');
      windowElement.classList.add('shaka-text-window');
      while (cueElement.firstChild) {
        windowElement.appendChild(cueElement.firstChild);
      }
      cueElement.appendChild(windowElement);
    }

    const color = config.windowColor || 'black';
    windowElement.style.backgroundColor = isNaN(config.windowOpacity) ?
        color :
        shaka.text.Utils.setColorOpacity(color, config.windowOpacity) || color;
  }

  /**
   * Gets the font color of a cue element, applying the font color and the
   * font opacity of the configuration.
   *
   * @param {!shaka.text.Cue} cue
   * @param {boolean} isNested
   * @param {?shaka.extern.TextDisplayerConfiguration} config
   * @return {string}
   * @private
   */
  getFontColor_(cue, isNested, config) {
    let color = cue.color;
    if (config && config.fontColor) {
      color = config.fontColor;
    }
    if (!config || isNaN(config.fontOpacity)) {
      return color;
    }
    if (!color) {
      if (isNested) {
        // The parent already has the opacity, and it is inherited.
        return '';
      }
      // The color comes from the text container, which can be themed.
      color = window.getComputedStyle(this.textContainer_).color;
    }
    return shaka.text.Utils.setColorOpacity(color, config.fontOpacity) ||
        color;
  }

  /**
   * Gets the background color of a cue element, applying the background
   * color and the background opacity of the configuration.
   *
   * @param {string} inheritedColor The background color of the cue, or of its
   *   nearest parent that has one.
   * @param {boolean} hasText
   * @param {?shaka.extern.TextDisplayerConfiguration} config
   * @return {string}
   * @private
   */
  static getBackgroundColor_(inheritedColor, hasText, config) {
    // If there is no background, default to a semi-transparent black.
    // Only do this for the text itself.
    const defaultColor = 'rgba(0, 0, 0, 0.8)';
    if (!shaka.text.UITextDisplayer.isBackgroundCustomized_(config)) {
      return inheritedColor || (hasText ? defaultColor : '');
    }
    goog.asserts.assert(config, 'A customized background needs a config');
    // A customized background is only painted behind the text, so
    // semi-transparent backgrounds are not painted twice.
    if (!hasText) {
      return '';
    }
    const color = config.backgroundColor || inheritedColor || defaultColor;
    if (isNaN(config.backgroundOpacity)) {
      return color;
    }
    return shaka.text.Utils.setColorOpacity(
        color, config.backgroundOpacity) || color;
  }

  /**
   * @param {?shaka.extern.TextDisplayerConfiguration} config
   * @return {boolean}
   * @private
   */
  static isBackgroundCustomized_(config) {
    return !!config &&
        (!!config.backgroundColor || !isNaN(config.backgroundOpacity));
  }

  /**
   * Overrides the shadow and the outline of the subtitle with the character
   * edge style of the configuration.
   *
   * @param {!CSSStyleDeclaration} style
   * @param {?shaka.extern.TextDisplayerConfiguration} config
   * @private
   */
  setCharacterEdgeStyle_(style, config) {
    const CharacterEdgeStyle = shaka.config.CharacterEdgeStyle;
    const edgeStyle = config ? config.characterEdgeStyle :
        CharacterEdgeStyle.DEFAULT;
    if (edgeStyle == CharacterEdgeStyle.DEFAULT) {
      return;
    }

    // The unit is 1/32 of the font size, so the shadows scale with the font.
    const opacity =
        config && !isNaN(config.fontOpacity) ? config.fontOpacity : 1;
    const dark = `rgba(34, 34, 34, ${opacity})`;
    const light = `rgba(204, 204, 204, ${opacity})`;
    const unit = (value) => (value / 32) + 'em';
    const shadows = [];
    switch (edgeStyle) {
      case CharacterEdgeStyle.DROP_SHADOW:
        for (const blur of [3, 4, 5]) {
          shadows.push(`${unit(2)} ${unit(2)} ${unit(blur)} ${dark}`);
        }
        break;
      case CharacterEdgeStyle.RAISED:
        for (const offset of [1, 2, 3]) {
          shadows.push(`${unit(offset)} ${unit(offset)} ${dark}`);
        }
        break;
      case CharacterEdgeStyle.DEPRESSED:
        shadows.push(`${unit(1)} ${unit(1)} ${light}`);
        shadows.push(`${unit(-1)} ${unit(-1)} ${dark}`);
        break;
      case CharacterEdgeStyle.OUTLINE:
        for (let i = 0; i < 5; i++) {
          shadows.push(`0 0 ${unit(2)} ${dark}`);
        }
        break;
    }
    style.textShadow = shadows.length ? shadows.join(', ') : 'none';
    // The outline of the subtitle is replaced too.
    style.webkitTextStrokeWidth = '0';
  }

  /**
   * Gets the text shadow of a cue, which also draws the text stroke around the
   * text, since a CSS stroke would be drawn over the text.  The text shadow of
   * an element replaces the one of its parent, so it includes the text stroke
   * and the text shadow inherited from the parents.
   *
   * @param {!shaka.text.Cue} cue
   * @param {!Array<!shaka.text.Cue>} parents The parents of the cue, and the
   *   cue itself.
   * @return {string}
   * @private
   */
  getTextShadow_(cue, parents) {
    const UITextDisplayer = shaka.text.UITextDisplayer;
    const shadows = [];
    // The stroke of the closest cue which has one.
    const strokeCue =
        parents.slice().reverse().find((c) => c.textStrokeWidth);
    const width = strokeCue ? UITextDisplayer.getLengthValueInfo_(
        this.convertTtmlLengths_(strokeCue.textStrokeWidth, cue)) : null;
    if (width && width.value > 0) {
      // Shadows all around the text, at the distance of the width.
      const strokeColor = strokeCue.textStrokeColor ||
          UITextDisplayer.inheritProperty_(parents, (c) => c.color) ||
          'currentColor';
      const directions = 16;
      for (let i = 0; i < directions; i++) {
        const angle = i * 2 * Math.PI / directions;
        const x = Number((width.value * Math.cos(angle)).toFixed(3));
        const y = Number((width.value * Math.sin(angle)).toFixed(3));
        shadows.push(`${x}${width.unit} ${y}${width.unit} 0 ${
          strokeColor}`.trim());
      }
    }
    const textShadow =
        UITextDisplayer.inheritProperty_(parents, (c) => c.textShadow);
    if (textShadow && textShadow != 'none') {
      shadows.push(this.convertTtmlLengths_(textShadow, cue));
    }
    if (shadows.length) {
      return shadows.join(', ');
    }
    // Remove the shadows of the parents, if the cue removes them.
    return strokeCue || textShadow ? 'none' : '';
  }

  /**
   * Converts the lengths in cells or relative to the size of the video, like
   * "1c" or "10rh", to pixels.
   *
   * @param {string} value
   * @param {!shaka.text.Cue} cue
   * @return {string}
   * @private
   */
  convertTtmlLengths_(value, cue) {
    const container = this.videoContainer_;
    return value.replace(/(^|[\s,(])(-?\d*\.?\d+)(c|rw|rh)(?=[\s,)]|$)/g,
        (match, prefix, number, unit) => {
          const length = Number(number);
          let pixels = container.clientHeight * length / 100;
          if (unit == 'c') {
            pixels = container.clientHeight * length / cue.cellResolution.rows;
          } else if (unit == 'rw') {
            pixels = container.clientWidth * length / 100;
          }
          return prefix + pixels + 'px';
        });
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
    const config = this.getActiveConfig_();

    // White space should be preserved if emitted by the text parser.  It's the
    // job of the parser to omit any whitespace that should not be displayed.
    // Using 'pre-wrap' means that whitespace is preserved even at the end of
    // the text, but that lines which overflow can still be broken, unless the
    // lines of the cue should not wrap.
    style.whiteSpace = cue.wrapLine ? 'pre-wrap' : 'pre';

    // Using 'break-spaces' would be better, as it would preserve even trailing
    // spaces, but that only shipped in Chrome 76.  As of July 2020, Safari
    // still has not implemented break-spaces, and the original Chromecast will
    // never have this feature since it no longer gets firmware updates.
    // So we need to replace trailing spaces with non-breaking spaces.
    const text = cue.payload.replace(/\s+$/g, (match) => {
      const nonBreakingSpace = '\xa0';
      return nonBreakingSpace.repeat(match.length);
    });

    style.color = this.getFontColor_(cue, isNested, config);
    style.direction = cue.direction;
    style.unicodeBidi = cue.unicodeBidi;
    if (style.unicodeBidi != cue.unicodeBidi) {
      // Values like "isolate" are prefixed in older browsers.
      style.unicodeBidi = '-webkit-' + cue.unicodeBidi;
    }
    style.opacity = cue.opacity;
    style.paddingLeft = shaka.text.UITextDisplayer.convertLengthValue_(
        cue.linePadding, cue, this.videoContainer_);
    style.paddingRight =
        shaka.text.UITextDisplayer.convertLengthValue_(
            cue.linePadding, cue, this.videoContainer_);
    style.textCombineUpright = cue.textCombineUpright;
    style.visibility = cue.visibility;
    style.textShadow = this.getTextShadow_(cue, parents);
    this.setCharacterEdgeStyle_(style, config);

    if (cue.backgroundImage) {
      // Sanitize the URL to prevent CSS injection via single-quote breakout.
      const sanitizedUrl = cue.backgroundImage.replace(/['"()\\]/g, '');
      style.backgroundImage = 'url(\'' + sanitizedUrl + '\')';
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
        const bgColor = shaka.text.UITextDisplayer.getBackgroundColor_(
            inherit((c) => c.backgroundColor), !!text, config);
        if (bgColor) {
          elem.style.backgroundColor = bgColor;
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
    if (cue.rubyTag) {
      // The <ruby> and <rt> elements keep their own display, which lays the
      // annotation out over its base text.
    } else if (isNested && !parents[parents.length - 1].isContainer) {
      style.display = 'inline';
      if (parents[parents.length - 2].isContainer) {
        // A paragraph is a flex item of its container, or of its region, which
        // ignores the float of its alignment, so it is aligned by them
        // instead, against its own start or end.
        // Browsers without self-start and self-end in flex layout (before
        // Chrome 59, such as Tizen 3) ignore them and keep the flex-start or
        // flex-end set first.  Those align against the container's start or
        // end instead, which is the same unless the paragraph's direction
        // differs from its container's.
        const isRightToLeft =
            cue.direction == Cue.direction.HORIZONTAL_RIGHT_TO_LEFT;
        if (cue.textAlign == Cue.textAlign.START ||
            cue.textAlign == (isRightToLeft ?
                Cue.textAlign.RIGHT : Cue.textAlign.LEFT)) {
          style.alignSelf = 'flex-start';
          style.alignSelf = 'self-start';
        } else if (cue.textAlign == Cue.textAlign.END ||
            cue.textAlign == (isRightToLeft ?
                Cue.textAlign.LEFT : Cue.textAlign.RIGHT)) {
          style.alignSelf = 'flex-end';
          style.alignSelf = 'self-end';
        }
        if (cue.rubyReserve || shaka.text.UITextDisplayer.hasRuby_(cue)) {
          this.rubyParagraphs_.push({element: cueElement, cue});
        }
      }
    } else {
      style.display = 'flex';
      style.flexDirection = 'column';
      style.alignItems = 'center';
      if (cue.textAlign == Cue.textAlign.LEFT ||
          cue.textAlign == Cue.textAlign.START) {
        style.width = '100%';
        style.alignItems = 'flex-start';
      } else if (cue.textAlign == Cue.textAlign.RIGHT ||
          cue.textAlign == Cue.textAlign.END) {
        style.width = '100%';
        style.alignItems = 'flex-end';
      }
      if (cue.isContainer) {
        // A container, like a TTML <body> or <div>, fills the width of its
        // region, so its paragraphs are aligned against the region.
        style.width = '100%';
      }

      style.justifyContent =
          shaka.text.UITextDisplayer.displayAlignToJustifyContent_(
              cue.displayAlign);
    }

    if (!isLeaf) {
      style.margin = '0';
    }

    if (cue.rubyAlign) {
      style.setProperty('ruby-align', cue.rubyAlign);
    }
    if (cue.rubyTag == 'ruby') {
      // The position of the annotation applies to its ruby.
      const annotation =
          cue.nestedCues.find((nestedCue) => nestedCue.rubyTag == 'rt');
      const rubyPosition = annotation ? annotation.rubyPosition : null;
      if (rubyPosition == Cue.rubyPosition.OUTSIDE) {
        // It depends on the line of the paragraph the ruby is laid out on.
        this.outsideRubyElements_.push(cueElement);
      } else if (rubyPosition) {
        shaka.text.UITextDisplayer.setRubyPosition_(cueElement,
            rubyPosition == Cue.rubyPosition.BEFORE, cue.writingMode);
      }
    }

    style.fontFamily = config?.fontFamily || cue.fontFamily;
    style.fontVariant = config?.fontVariant || '';
    style.fontWeight = cue.fontWeight.toString();
    style.fontStyle = cue.fontStyle;
    style.letterSpacing = this.convertTtmlLengths_(cue.letterSpacing, cue);
    const fontScaleFactor = config ? config.fontScaleFactor : 1;
    if (isNested) {
      // The scale factor is applied once, on the top-level cue.  Nested cues
      // without a font size, or with one relative to their parent (em),
      // inherit it, so scaling them again would compound it at every level.
      if (cue.fontSize) {
        const lengthValueInfo =
            shaka.text.UITextDisplayer.getLengthValueInfo_(cue.fontSize);
        const isRelativeToParent =
            !!lengthValueInfo && lengthValueInfo.unit == 'em';
        style.fontSize = shaka.text.UITextDisplayer.convertLengthValue_(
            cue.fontSize, cue, this.videoContainer_,
            isRelativeToParent ? 1 : fontScaleFactor);
      }
    } else if (fontScaleFactor !== 1 || cue.fontSize) {
      // Use browser default (1em) if fontSize is not set or empty
      const fontSize = cue.fontSize || '1em';
      style.fontSize = shaka.text.UITextDisplayer.convertLengthValue_(
          fontSize, cue, this.videoContainer_, fontScaleFactor);
    }

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
    } else if (!isNested &&
        cue.writingMode != Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
      // A cue with no line setting has a computed line of -1, the last line.
      // For vertical text the lines stack along the horizontal axis, so the
      // last line is against the edge they stack away from: the left for text
      // growing left, the right for text growing right.
      //
      // Horizontal cues get this for free, because the text container stacks
      // its children at the bottom, but nothing places vertical ones.
      //
      // Only a top-level cue is placed.  Nested cues, like the spans of a
      // vertical TTML paragraph, flow inside their parent, and placing each of
      // them at the same edge would draw them on top of each other.
      style.position = 'absolute';
      style.top = '0';
      style.height = '100%';
      if (cue.writingMode == Cue.writingMode.VERTICAL_LEFT_TO_RIGHT) {
        style.right = '0';
      } else {
        style.left = '0';
      }
    }

    style.lineHeight = this.convertTtmlLengths_(cue.lineHeight, cue);

    // The positionAlign attribute is an alignment for the text container in
    // the dimension of the writing direction.
    const computedPositionAlign = this.computeCuePositionAlignment_(cue);
    // According to the W3C WebVTT specification
    // See: https://www.w3.org/TR/webvtt1/#webvtt-cue-position
    // The position of the cue box depends on the cue alignment.
    //   If align: start, then the position specifies the left edge.
    //   If align: center, then it specifies the center of the cue box.
    //   If align: end, then it refers to the right edge.
    // Inline elements are not floated, as the floats of the words of a line
    // would reorder them, and drop the spaces between them.
    const canFloat = style.display != 'inline' && !cue.rubyTag;
    if (computedPositionAlign == Cue.positionAlign.LEFT) {
      if (canFloat) {
        style.cssFloat = 'left';
      }
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
      if (canFloat) {
        style.cssFloat = 'right';
      }
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

    // The alignment of ruby is its ruby-align, which a text-align would
    // override.
    if (!cue.rubyTag) {
      style.textAlign = cue.textAlign;
    }
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
      // A cue box is anchored at its position, so how large it is allowed to
      // grow depends on which edge of it that position refers to and how much
      // room is left on the other side.  Without this a cue can be laid out
      // past the edge of the video and never be seen.  See the "maximum size"
      // step of https://www.w3.org/TR/webvtt1/#apply-webvtt-cue-settings
      //
      // Note that a cue which does not state a size is left alone here.  The
      // spec would treat it as 100 and clamp that too, but Shaka represents an
      // unset size as 0 and lays those cues out without a width at all.
      let position = cue.position;
      if (position == null) {
        // A position of auto computes from the text alignment.
        if (cue.textAlign == Cue.textAlign.LEFT) {
          position = 0;
        } else if (cue.textAlign == Cue.textAlign.RIGHT) {
          position = 100;
        } else {
          position = 50;
        }
      }

      let maximumSize;
      if (computedPositionAlign == Cue.positionAlign.LEFT) {
        maximumSize = 100 - position;
      } else if (computedPositionAlign == Cue.positionAlign.RIGHT) {
        maximumSize = position;
      } else if (position <= 50) {
        maximumSize = position * 2;
      } else {
        maximumSize = (100 - position) * 2;
      }

      const size = Math.min(cue.size, maximumSize);

      if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
        style.width = size + '%';
      } else {
        style.height = size + '%';
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
   * absolute value in pixels based on Computed Cell Size, or on the size of
   * the video container for lengths relative to the root container.
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
      // Percentage of a cell
      case '%':
        return shaka.text.UITextDisplayer.getAbsoluteLengthInPixels_(
            realValue / 100, cue, videoContainer);
      case 'c':
        return shaka.text.UITextDisplayer.getAbsoluteLengthInPixels_(
            realValue, cue, videoContainer);
      // Percentage of the height or the width of the root container
      case 'rh':
        return videoContainer.clientHeight * realValue / 100 + 'px';
      case 'rw':
        return videoContainer.clientWidth * realValue / 100 + 'px';
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

  /**
   * Maps a cue's displayAlign to the equivalent CSS justify-content value.
   *
   * @param {shaka.text.Cue.displayAlign} displayAlign
   * @return {string}
   * @private
   */
  static displayAlignToJustifyContent_(displayAlign) {
    switch (displayAlign) {
      case shaka.text.Cue.displayAlign.BEFORE:
        return 'flex-start';
      case shaka.text.Cue.displayAlign.CENTER:
        return 'center';
      default:
        return 'flex-end';
    }
  }
};

/**
 * The DOM bookkeeping kept for each displayed cue.  `wrapper` is the element
 * into which nested cues are placed.
 *
 * @typedef {{
 *   cueElement: !HTMLElement,
 *   regionElement: HTMLElement,
 *   wrapper: !HTMLElement,
 * }}
 */
shaka.text.UITextDisplayer.CueRegistry_;

/**
 * Longest the update timer will ever wait, in seconds. Caption updates normally
 * land exactly on the next cue boundary; this only bounds the wait so a missed
 * event or a playback stall can never leave the captions stale indefinitely.
 * @private @const {number}
 */
shaka.text.UITextDisplayer.SAFETY_REFRESH_PERIOD_ = 1;

/**
 * Shortest the update timer will ever wait, in seconds (~one frame at 60fps).
 * Prevents a hot loop when cue boundaries are very close together, e.g.
 * character-by-character CEA-608 reveals.
 * @private @const {number}
 */
shaka.text.UITextDisplayer.MIN_REFRESH_PERIOD_ = 1 / 60;

/**
 * Debounce applied before re-evaluating container visibility, in seconds.
 * @private @const {number}
 */
shaka.text.UITextDisplayer.VISIBILITY_DEBOUNCE_ = 0.25;

/**
 * @private {!shaka.util.Lazy<!shaka.text.CueRegion>}
 */
shaka.text.UITextDisplayer.CustomRegion_ = new shaka.util.Lazy(() => {
  const region = new shaka.text.CueRegion();
  region.id = 'shaka-custom-region';
  region.height = 90;
  region.width = 90;
  region.viewportAnchorX = 5;
  region.viewportAnchorY = 5;
  return region;
});

/**
 * The line height of the cues in a region sized in lines, relative to their
 * font size.  It matches the default line height of the text container.
 * @private @const {number}
 */
shaka.text.UITextDisplayer.REGION_LINE_HEIGHT_ = 1.4;

/**
 * How long the lines of a region with scroll:up take to scroll, as in the
 * WebVTT spec.
 * @private @const {number}
 */
shaka.text.UITextDisplayer.SCROLL_DURATION_MS_ = 433;

/**
 * The text of the empty bases and annotations which reserve space for ruby.
 * @private @const {string}
 */
shaka.text.UITextDisplayer.ZERO_WIDTH_SPACE_ = '\u200B';
