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


goog.provide('shaka.ui.Controls');
goog.provide('shaka.ui.ControlsPanel');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.ui.Constants');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.Timer');


/**
 * A container for custom video controls.
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.ui.Controls = class extends shaka.util.FakeEventTarget {
  /**
   * @param {!shaka.Player} player
   * @param {!HTMLElement} videoContainer
   * @param {!HTMLMediaElement} video
   * @param {shaka.extern.UIConfiguration} config
   */
  constructor(player, videoContainer, video, config) {
    super();

    /** @private {boolean} */
    this.enabled_ = true;

    /** @private {boolean} */
    this.overrideCssShowControls_ = false;

    /** shaka.extern.UIConfiguration */
    this.config_ = config;

    /** @private {shaka.cast.CastProxy} */
    this.castProxy_ = new shaka.cast.CastProxy(
        video, player, this.config_.castReceiverAppId);

    /** @private {boolean} */
    this.castAllowed_ = true;

    /** @private {HTMLMediaElement} */
    this.video_ = this.castProxy_.getVideo();

    /** @private {HTMLMediaElement} */
    this.localVideo_ = video;

    /** @private {shaka.Player} */
    this.player_ = this.castProxy_.getPlayer();

    /** @private {shaka.Player} */
    this.localPlayer_ = player;

    /** @private {!HTMLElement} */
    this.videoContainer_ = videoContainer;

    /** @private {boolean} */
    this.isSeeking_ = false;

    /**
     * This timer is used to introduce a delay between the user scrubbing across
     * the seek bar and the seek being sent to the player.
     *
     * @private {shaka.util.Timer}
     */
    this.seekTimer_ = new shaka.util.Timer(() => {
      goog.asserts.assert(this.seekBar_ != null, 'Seekbar should not be null!');
      this.video_.currentTime = parseFloat(this.seekBar_.value);
    });

    /**
     * This timer is used to detect when the user has stopped moving the mouse
     * and we should fade out the ui.
     *
     * @private {shaka.util.Timer}
     */
    this.mouseStillTimer_ = new shaka.util.Timer(() => {
      this.onMouseStill_();
    });

    /**
     * This timer will be used to hide all settings menus. When the timer ticks
     * it will force all controls to invisible.
     *
     * Rather than calling the callback directly, |Controls| will always call it
     * through the timer to avoid conflicts.
     *
     * @private {shaka.util.Timer}
     */
    this.hideSettingsMenusTimer_ = new shaka.util.Timer(() => {
      /** @type {function(!HTMLElement)} */
      const hide = (control) => {
        shaka.ui.Utils.setDisplay(control, /* visible= */ false);
      };

      for (const menu of this.settingsMenus_) {
        hide(/** @type {!HTMLElement} */ (menu));
      }
    });

    /**
     * This timer is used to regularly update the time and seek range elements
     * so that we are communicating the current state as accurately as possibly.
     *
     * Unlike the other timers, this timer does not "own" the callback because
     * this timer is acting like a heartbeat.
     *
     * @private {shaka.util.Timer}
     */
    this.timeAndSeekRangeTimer_ = new shaka.util.Timer(() => {
      this.updateTimeAndSeekRange_();
    });

    /** @private {?number} */
    this.lastTouchEventTime_ = null;

    /** @private {!Array.<!shaka.extern.IUIElement>} */
    this.elements_ = [];

    /** @private {shaka.ui.Localization} */
    this.localization_ = shaka.ui.Controls.createLocalization_();

    this.createDOM_();

    this.updateLocalizedStrings_();

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    this.addEventListeners_();

    /**
     * The pressed keys set is used to record which keys are currently pressed
     * down, so we can know what keys are pressed at the same time.
     * Used by the focusInsideOverflowMenu_() function.
     * @private {!Set.<number>}
     */
    this.pressedKeys_ = new Set();

    // We might've missed a caststatuschanged event from the proxy between
    // the controls creation and initializing. Run onCastStatusChange_()
    // to ensure we have the casting state right.
    this.onCastStatusChange_();

    // Start this timer after we are finished initializing everything,
    this.timeAndSeekRangeTimer_.tickEvery(/* seconds= */ 0.125);
  }


  /**
   * @override
   * @export
   */
  async destroy() {
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }

    if (this.seekTimer_) {
      this.seekTimer_.stop();
      this.seekTimer_ = null;
    }

    if (this.mouseStillTimer_) {
      this.mouseStillTimer_.stop();
      this.mouseStillTimer_ = null;
    }

    if (this.hideSettingsMenusTimer_) {
      this.hideSettingsMenusTimer_.stop();
      this.hideSettingsMenusTimer_ = null;
    }

    if (this.timeAndSeekRangeTimer_) {
      this.timeAndSeekRangeTimer_.stop();
      this.timeAndSeekRangeTimer_ = null;
    }

    if (this.castProxy_) {
      await this.castProxy_.destroy();
      this.castProxy_ = null;
    }

    if (this.localPlayer_) {
      await this.localPlayer_.destroy();
      this.localPlayer_ = null;
    }
    this.player_ = null;

    this.localVideo_ = null;
    this.video_ = null;

    // TODO: remove any elements created

    this.localization_ = null;
    this.pressedKeys_.clear();

    await Promise.all(this.elements_.map((element) => element.destroy()));
    this.elements_ = [];
  }


  /**
   * @event shaka.Controls.CastStatusChangedEvent
   * @description Fired upon receiving a 'caststatuschanged' event from
   *    the cast proxy.
   * @property {string} type
   *   'caststatuschanged'
   * @property {boolean} newStatus
   *  The new status of the application. True for 'is casting' and
   *  false otherwise.
   * @exportDoc
   */


  /**
   * @event shaka.Controls.SubMenuOpenEvent
   * @description Fired when one of the overflow submenus is opened
   *    (e. g. language/resolution/subtitle selection).
   * @property {string} type
   *   'submenuopen'
   * @exportDoc
   */


  /**
   * @event shaka.Controls.CaptionSelectionUpdatedEvent
   * @description Fired when the captions/subtitles menu has finished updating.
   * @property {string} type
   *   'captionselectionupdated'
   * @exportDoc
   */


  /**
   * @event shaka.Controls.ResolutionSelectionUpdatedEvent
   * @description Fired when the resolution menu has finished updating.
   * @property {string} type
   *   'resolutionselectionupdated'
   * @exportDoc
   */


  /**
   * @event shaka.Controls.LanguageSelectionUpdatedEvent
   * @description Fired when the audio language menu has finished updating.
   * @property {string} type
   *   'languageselectionupdated'
   * @exportDoc
   */


  /**
   * @event shaka.Controls.ErrorEvent
   * @description Fired when something went wrong with the controls.
   * @property {string} type
   *   'error'
   * @property {!shaka.util.Error} detail
   *   An object which contains details on the error.  The error's 'category'
   *   and 'code' properties will identify the specific error that occurred.
   *   In an uncompiled build, you can also use the 'message' and 'stack'
   *   properties to debug.
   * @exportDoc
   */


  /**
   * @event shaka.Controls.TimeAndSeekRangeUpdatedEvent
   * @description Fired when the time and seek range elements have finished
   *    updating.
   * @property {string} type
   *   'timeandseekrangeupdated'
   * @exportDoc
   */


  /**
   * @event shaka.Controls.UIUpdatedEvent
   * @description Fired after a call to ui.configure() once the UI has finished
   *    updating.
   * @property {string} type
   *   'uiupdated'
   * @exportDoc
   */


  /**
   * @param {string} name
   * @param {!shaka.extern.IUIElement.Factory} factory
   * @export
   */
  static registerElement(name, factory) {
    shaka.ui.ControlsPanel.elementNamesToFactories_.set(name, factory);
  }


  /**
   * This allows the application to inhibit casting.
   *
   * @param {boolean} allow
   * @export
   */
  allowCast(allow) {
    this.castAllowed_ = allow;
    this.onCastStatusChange_();
  }


  /**
   * Used by the application to notify the controls that a load operation is
   * complete.  This allows the controls to recalculate play/paused state, which
   * is important for platforms like Android where autoplay is disabled.
   * @export
   */
  loadComplete() {
    // If we are on Android or if autoplay is false, video.paused should be
    // true. Otherwise, video.paused is false and the content is autoplaying.
    this.onPlayStateChange_();
  }


  /**
   * Enable or disable the custom controls. Enabling disables native
   * browser controls.
   *
   * @param {boolean} enabled
   * @export
   */
  setEnabledShakaControls(enabled) {
    this.enabled_ = enabled;
    if (enabled) {
      shaka.ui.Utils.setDisplay(
          this.controlsButtonPanel_.parentElement, true);

      // If we're hiding native controls, make sure the video element itself is
      // not tab-navigable.  Our custom controls will still be tab-navigable.
      this.video_.tabIndex = -1;
      this.video_.controls = false;
    } else {
      shaka.ui.Utils.setDisplay(
          this.controlsButtonPanel_.parentElement, false);
    }

    // The effects of play state changes are inhibited while showing native
    // browser controls.  Recalculate that state now.
    this.onPlayStateChange_();
  }


  /**
   * Enable or disable native browser controls. Enabling disables shaka
   * controls.
   *
   * @param {boolean} enabled
   * @export
   */
  setEnabledNativeControls(enabled) {
    // If we enable the native controls, the element must be tab-navigable.
    // If we disable the native controls, we want to make sure that the video
    // element itself is not tab-navigable, so that the element is skipped over
    // when tabbing through the page.
    this.video_.controls = enabled;
    this.video_.tabIndex = enabled ? 0 : -1;

    if (enabled) {
      this.setEnabledShakaControls(false);
    }
  }


  /**
   * @export
   * @return {shaka.cast.CastProxy}
   */
  getCastProxy() {
    return this.castProxy_;
  }


  /**
   * @return {shaka.ui.Localization}
   * @export
   */
  getLocalization() {
    return this.localization_;
  }


  /**
   * @return {!HTMLElement}
   * @export
   */
  getVideoContainer() {
    return this.videoContainer_;
  }


  /**
   * @return {HTMLMediaElement}
   * @export
   */
  getVideo() {
    return this.video_;
  }


  /**
   * @return {HTMLMediaElement}
   * @export
   */
  getLocalVideo() {
    return this.localVideo_;
  }


  /**
   * @return {shaka.Player}
   * @export
   */
  getPlayer() {
    return this.player_;
  }


  /**
   * @return {shaka.Player}
   * @export
   */
  getLocalPlayer() {
    return this.localPlayer_;
  }


  /**
   * @return {!HTMLElement}
   * @export
   */
  getControlsContainer() {
    return this.controlsContainer_;
  }


  /**
   * @return {!shaka.extern.UIConfiguration}
   * @export
   */
  getConfig() {
    return this.config_;
  }


  /**
   * @return {boolean}
   * @export
   */
  isSeeking() {
    return this.isSeeking_;
  }


  /**
   * @return {boolean}
   * @export
   */
  isCastAllowed() {
    return this.castAllowed_;
  }


  /**
   * @return {number}
   * @export
   */
  getDisplayTime() {
    const displayTime = this.isSeeking_ ?
          Number(this.seekBar_.value) :
          Number(this.video_.currentTime);

    return displayTime;
  }


  /**
   * @param {?number} time
   * @export
   */
  setLastTouchEventTime(time) {
    this.lastTouchEventTime_ = time;
  }


  /**
   * Display controls even if css says overwise.
   * Normally, controls opacity is controled by CSS, but there are
   * a few special cases where we want controls to be displayed no
   * matter what. For example, if the focus is on one of the settings
   * menus. This method is called when we want to signal an exception
   * to normal CSS opacity rules and keep the controls visible.
   *
   * @export
   */
  overrideCssShowControls() {
    this.overrideCssShowControls_ = true;
  }


  /**
   * @return {boolean}
   * @export
   */
  anySettingsMenusAreOpen() {
    return this.settingsMenus_.some(
        (menu) => menu.classList.contains('shaka-displayed'));
  }


  /**
   * @export
   */
  hideSettingsMenus() {
    this.hideSettingsMenusTimer_.tickNow();
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    if (this.seekBar_) {
      this.seekBar_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
          this.localization_.resolve(LocIds.SEEK));
    }

    // Localize state-dependant labels
    const makePlayNotPause = this.video_.paused && !this.isSeeking_;
    const playButtonAriaLabelId = makePlayNotPause ? LocIds.PLAY : LocIds.PAUSE;
    this.playButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization_.resolve(playButtonAriaLabelId));
  }


  /**
   * @private
   */
  initOptionalElementsToNull_() {
    // TODO: encapsulate/abstract range inputs and their containers

    /** @private {HTMLElement} */
    this.seekBarContainer_ = null;

    /** @private {HTMLInputElement} */
    this.seekBar_ = null;
  }


  /**
   * @private
   */
  createDOM_() {
    this.initOptionalElementsToNull_();

    this.videoContainer_.classList.add('shaka-video-container');
    this.video_.classList.add('shaka-video');

    this.addControlsContainer_();

    this.addPlayButton_();

    this.addBufferingSpinner_();

    this.addControlsButtonPanel_();

    // Seek bar
    if (this.config_.addSeekBar) {
      this.addSeekBar_();
    }

    /** @private {!Array.<!Element>} */
    this.settingsMenus_ = Array.from(
        this.videoContainer_.getElementsByClassName('shaka-settings-menu'));

    // Settings menus need to be positioned lower, if the seekbar is absent.
    if (!this.seekBar_) {
      for (const menu of this.settingsMenus_) {
        menu.classList.add('shaka-low-position');
      }
    }
  }


  /**
   * @private
   */
  addControlsContainer_() {
    /** @private {!HTMLElement} */
    this.controlsContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.controlsContainer_.classList.add('shaka-controls-container');
    this.videoContainer_.appendChild(this.controlsContainer_);
  }


  /**
   * @private
   */
  addPlayButton_() {
    /** @private {!HTMLElement} */
    this.playButtonContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.playButtonContainer_.classList.add('shaka-play-button-container');
    this.controlsContainer_.appendChild(this.playButtonContainer_);

    /** @private {!HTMLElement} */
    this.playButton_ = shaka.util.Dom.createHTMLElement('button');
    this.playButton_.classList.add('shaka-play-button');
    this.playButton_.setAttribute('icon', 'play');
    this.playButtonContainer_.appendChild(this.playButton_);
  }


  /**
   * @private
   */
  addBufferingSpinner_() {
    goog.asserts.assert(this.playButtonContainer_,
        'Must have play button container before spinner!');

    // Svg elements have to be created with the svg xml namespace.
    const xmlns = 'http://www.w3.org/2000/svg';

    /** @private {!HTMLElement} */
    this.bufferingSpinner_ =
      /** @type {!HTMLElement} */(document.createElementNS(xmlns, 'svg'));
    // NOTE: SVG elements do not have a classList on IE, so use setAttribute.
    this.bufferingSpinner_.setAttribute('class', 'shaka-spinner-svg');
    this.bufferingSpinner_.setAttribute('viewBox', '0 0 30 30');
    this.playButton_.appendChild(this.bufferingSpinner_);

    // These coordinates are relative to the SVG viewBox above.  This is
    // distinct from the actual display size in the page, since the "S" is for
    // "Scalable." The radius of 14.5 is so that the edges of the 1-px-wide
    // stroke will touch the edges of the viewBox.
    const spinnerCircle = document.createElementNS(xmlns, 'circle');
    spinnerCircle.setAttribute('class', 'shaka-spinner-path');
    spinnerCircle.setAttribute('cx', '15');
    spinnerCircle.setAttribute('cy', '15');
    spinnerCircle.setAttribute('r', '14.5');
    spinnerCircle.setAttribute('fill', 'none');
    spinnerCircle.setAttribute('stroke-width', '1');
    spinnerCircle.setAttribute('stroke-miterlimit', '10');
    this.bufferingSpinner_.appendChild(spinnerCircle);
  }


  /**
   * @private
   */
  addControlsButtonPanel_() {
    /** @private {!HTMLElement} */
    this.controlsButtonPanel_ = shaka.util.Dom.createHTMLElement('div');
    this.controlsButtonPanel_.classList.add('shaka-controls-button-panel');
    this.controlsButtonPanel_.classList.add('shaka-no-propagation');
    this.controlsButtonPanel_.classList.add(
        'shaka-show-controls-on-mouse-over');
    this.controlsContainer_.appendChild(this.controlsButtonPanel_);

    // Create the elements specified by controlPanelElements
    for (let i = 0; i < this.config_.controlPanelElements.length; i++) {
      const name = this.config_.controlPanelElements[i];
      if (shaka.ui.ControlsPanel.elementNamesToFactories_.get(name)) {
        const factory =
            shaka.ui.ControlsPanel.elementNamesToFactories_.get(name);
        this.elements_.push(factory.create(this.controlsButtonPanel_, this));
      } else {
        shaka.log.alwaysWarn('Unrecognized control panel element requested:',
            name);
      }
    }
  }


  /**
 * @private
 */
  addEventListeners_() {
    this.player_.addEventListener('buffering', () => {
      this.onBufferingStateChange_();
    });
    // Set the initial state, as well.
    this.onBufferingStateChange_();

    // Listen for key down events to detect tab and enable outline
    // for focused elements.
    this.eventManager_.listen(window, 'keydown', (e) => this.onKeyDown_(e));

    this.video_.addEventListener('play', () => {
      this.onPlayStateChange_();
    });

    this.video_.addEventListener('pause', () => {
      this.onPlayStateChange_();
    });

    // Since videos go into a paused state at the end, Chrome and Edge both fire
    // the 'pause' event when a video ends.  IE 11 only fires the 'ended' event.
    this.video_.addEventListener('ended', () => {
      this.onPlayStateChange_();
    });

    if (this.seekBar_) {
      this.seekBar_.addEventListener('mousedown', () => {
        this.onSeekStart_();
      });

      this.seekBar_.addEventListener('touchstart', () => {
        this.onSeekStart_();
      }, {passive: true});

      this.seekBar_.addEventListener('input', () => {
        this.onSeekInput_();
      });

      this.seekBar_.addEventListener('touchend', () => {
        this.onSeekEnd_();
      });

      this.seekBar_.addEventListener('mouseup', () => {
        this.onSeekEnd_();
      });
    }

    this.controlsContainer_.addEventListener('touchstart', (e) => {
      this.onContainerTouch_(e);
    }, {passive: false});

    this.controlsContainer_.addEventListener('click', () => {
      this.onContainerClick_();
    });

    // Elements that should not propagate clicks (controls panel, menus)
    const noPropagationElements = this.videoContainer_.getElementsByClassName(
        'shaka-no-propagation');
    for (const element of noPropagationElements) {
      element.addEventListener('click', (event) => {
        event.stopPropagation();
      });
    }

    // Keep showing controls if one of those elements is hovered
    const showControlsElements = this.videoContainer_.getElementsByClassName(
        'shaka-show-controls-on-mouse-over');
    for (const element of showControlsElements) {
      element.addEventListener('mouseover', () => {
        this.overrideCssShowControls_ = true;
      });

      element.addEventListener('mouseleave', () => {
        this.overrideCssShowControls_ = false;
      });
    }

    this.videoContainer_.addEventListener('mousemove', (e) => {
      this.onMouseMove_(e);
    });

    this.videoContainer_.addEventListener('touchmove', (e) => {
      this.onMouseMove_(e);
    }, {passive: true});

    this.videoContainer_.addEventListener('touchend', (e) => {
      this.onMouseMove_(e);
    }, {passive: true});

    this.videoContainer_.addEventListener('mouseleave', () => {
      this.onMouseLeave_();
    });

    // Overflow menus are supposed to hide once you click elsewhere
    // on the video element. The code in onContainerClick_ ensures that.
    // However, clicks on controls panel don't propagate to the container,
    // so we have to explicitly hide the menus onclick here.
    this.controlsButtonPanel_.addEventListener('click', () => {
      this.hideSettingsMenusTimer_.tickNow();
    });

    this.castProxy_.addEventListener('caststatuschanged', () => {
      this.onCastStatusChange_();
    });

    this.videoContainer_.addEventListener('keyup', (e) => {
      this.onKeyUp_(e);
    });

    this.localization_.addEventListener(
        shaka.ui.Localization.LOCALE_UPDATED,
        (e) => this.updateLocalizedStrings_());

    this.localization_.addEventListener(
        shaka.ui.Localization.LOCALE_CHANGED,
        (e) => this.updateLocalizedStrings_());
  }


  /**
   * @private
   */
  addSeekBar_() {
    // This container is to support IE 11.  See detailed notes in
    // less/range_elements.less for a complete explanation.
    // TODO: Factor this into a range-element component.
    this.seekBarContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.seekBarContainer_.classList.add('shaka-seek-bar-container');

    this.seekBar_ =
      /** @type {!HTMLInputElement} */ (document.createElement('input'));
    this.seekBar_.classList.add('shaka-seek-bar');
    this.seekBar_.type = 'range';
    // NOTE: step=any causes keyboard nav problems on IE 11.
    this.seekBar_.setAttribute('step', 'any');
    this.seekBar_.setAttribute('min', '0');
    this.seekBar_.setAttribute('max', '1');
    this.seekBar_.value = '0';
    this.seekBar_.classList.add('shaka-no-propagation');
    this.seekBar_.classList.add('shaka-show-controls-on-mouse-over');

    this.seekBarContainer_.appendChild(this.seekBar_);
    this.controlsContainer_.appendChild(this.seekBarContainer_);
  }


  /**
   * Hiding the cursor when the mouse stops moving seems to be the only
   * decent UX in fullscreen mode.  Since we can't use pure CSS for that,
   * we use events both in and out of fullscreen mode.
   * Showing the control bar when a key is pressed, and hiding it after some
   * time.
   * @param {!Event} event
   * @private
   */
  onMouseMove_(event) {
    // Disable blue outline for focused elements for mouse navigation.
    if (event.type == 'mousemove') {
      this.controlsContainer_.classList.remove('shaka-keyboard-navigation');
    }
    if (event.type == 'touchstart' || event.type == 'touchmove' ||
        event.type == 'touchend' || event.type == 'keyup') {
      this.lastTouchEventTime_ = Date.now();
    } else if (this.lastTouchEventTime_ + 1000 < Date.now()) {
      // It has been a while since the last touch event, this is probably a real
      // mouse moving, so treat it like a mouse.
      this.lastTouchEventTime_ = null;
    }

    // When there is a touch, we can get a 'mousemove' event after touch events.
    // This should be treated as part of the touch, which has already been
    // handled.
    if (this.lastTouchEventTime_ && event.type == 'mousemove') {
      return;
    }

    // Use the cursor specified in the CSS file.
    this.videoContainer_.style.cursor = '';

    // Make sure we are not about to hide the settings menus and then force them
    // open.
    this.hideSettingsMenusTimer_.stop();
    this.setControlsOpacity_(shaka.ui.Enums.Opacity.OPAQUE);
    this.updateTimeAndSeekRange_();

    // Hide the cursor when the mouse stops moving.
    // Only applies while the cursor is over the video container.
    this.mouseStillTimer_.stop();

    // Only start a timeout on 'touchend' or for 'mousemove' with no touch
    // events.
    if (event.type == 'touchend' ||
        event.type == 'keyup'|| !this.lastTouchEventTime_) {
      this.mouseStillTimer_.tickAfter(/* seconds= */ 3);
    }
  }


  /** @private */
  onMouseLeave_() {
    // We sometimes get 'mouseout' events with touches.  Since we can never
    // leave the video element when touching, ignore.
    if (this.lastTouchEventTime_) {
      return;
    }

    // Stop the timer and invoke the callback now to hide the controls.  If we
    // don't, the opacity style we set in onMouseMove_ will continue to override
    // the opacity in CSS and force the controls to stay visible.
    this.mouseStillTimer_.tickNow();
  }


  /**
   * This callback is for when we are pretty sure that the mouse has stopped
   * moving (aka the mouse is still). This method should only be called via
   * |mouseStillTimer_|. If this behaviour needs to be invoked directly, use
   * |mouseStillTimer_.tickNow()|.
   *
   * @private
   */
  onMouseStill_() {
    // Hide the cursor.  (NOTE: not supported on IE)
    this.videoContainer_.style.cursor = 'none';

    // Keep showing the controls if video is paused or one of the control menus
    // is hovered.
    if ((this.video_.paused && !this.isSeeking_) ||
         this.overrideCssShowControls_) {
      this.setControlsOpacity_(shaka.ui.Enums.Opacity.OPAQUE);
    } else {
      this.setControlsOpacity_(shaka.ui.Enums.Opacity.TRANSPARENT);
    }
  }


  /**
   * @param {!Event} event
   * @private
   */
  onContainerTouch_(event) {
    if (!this.video_.duration) {
      // Can't play yet.  Ignore.
      return;
    }

    if (this.isOpaque_()) {
      this.lastTouchEventTime_ = Date.now();
      // The controls are showing.
      // Let this event continue and become a click.
    } else {
      // The controls are hidden, so show them.
      this.onMouseMove_(event);
      // Stop this event from becoming a click event.
      event.preventDefault();
    }
  }


  /**
   * @private
   */
  onContainerClick_() {
    if (!this.enabled_) {
      return;
    }

    if (this.anySettingsMenusAreOpen()) {
      this.hideSettingsMenusTimer_.tickNow();
    } else {
      this.onPlayPauseClick_();
    }
  }


  /** @private */
  onPlayPauseClick_() {
    if (!this.enabled_) {
      return;
    }

    if (!this.video_.duration) {
      // Can't play yet.  Ignore.
      return;
    }

    this.player_.cancelTrickPlay();

    if (this.video_.paused) {
      this.video_.play();
    } else {
      this.video_.pause();
    }
  }


  /**
   * @private
   */
  onCastStatusChange_() {
    const isCasting = this.castProxy_.isCasting();
    this.dispatchEvent(new shaka.util.FakeEvent('caststatuschanged', {
      newStatus: isCasting,
    }));

    if (isCasting) {
      this.controlsContainer_.setAttribute('casting', 'true');
    } else {
      this.controlsContainer_.removeAttribute('casting');
    }
  }


  /** @private */
  onPlayStateChange_() {
    // On IE 11, a video may end without going into a paused state.  To correct
    // both the UI state and the state of the video tag itself, we explicitly
    // pause the video if that happens.
    if (this.video_.ended && !this.video_.paused) {
      this.video_.pause();
    }

    // Video is paused during seek, so don't show the play arrow while seeking:
    if (this.enabled_ && this.video_.paused && !this.isSeeking_) {
      this.playButton_.setAttribute('icon', 'play');
      this.playButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
          this.localization_.resolve(shaka.ui.Locales.Ids.PLAY));
    } else {
      this.playButton_.setAttribute('icon', 'pause');
      this.playButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
          this.localization_.resolve(shaka.ui.Locales.Ids.PAUSE));
    }
  }


  /** @private */
  onSeekStart_() {
    if (!this.enabled_) {
      return;
    }

    this.isSeeking_ = true;
    this.video_.pause();
  }


  /** @private */
  onSeekInput_() {
    if (!this.enabled_) {
      return;
    }

    if (!this.video_.duration) {
      // Can't seek yet.  Ignore.
      return;
    }

    // Update the UI right away.
    this.updateTimeAndSeekRange_();

    // We want to wait until the user has stopped moving the seek bar for a
    // little bit to avoid the number of times we ask the player to seek.
    //
    // To do this, we will start a timer that will fire in a little bit, but if
    // we see another seek bar change, we will cancel that timer and re-start
    // it.
    //
    // Calling |start| on an already pending timer will cancel the old request
    // and start the new one.
    this.seekTimer_.tickAfter(/* seconds= */ 0.125);
  }


  /** @private */
  onSeekEnd_() {
    if (!this.enabled_) {
      return;
    }

    // They just let go of the seek bar, so cancel the timer and manually
    // call the event so that we can respond immediately.
    this.seekTimer_.tickNow();

    this.isSeeking_ = false;
    this.video_.play();
  }


  /**
   * Support controls with keyboard inputs.
   * @param {!Event} event
   * @private
   */
  onKeyUp_(event) {
    const key = event.key;

    const activeElement = document.activeElement;
    const isVolumeBar = activeElement && activeElement.classList ?
        activeElement.classList.contains('shaka-volume-bar') : false;
    const isSeekBar = activeElement && activeElement.classList &&
        activeElement.classList.contains('shaka-seek-bar');
    // Show the control panel if it is on focus or any button is pressed.
    if (this.controlsContainer_.contains(activeElement)) {
      this.onMouseMove_(event);
    }

    // When the key is released, remove it from the pressed keys set.
    this.pressedKeys_.delete(event.keyCode);


    switch (key) {
      case 'ArrowLeft':
        // If it's not focused on the volume bar, move the seek time backward
        // for 5 sec. Otherwise, the volume will be adjusted automatically.
        if (!isVolumeBar) {
          this.seek_(this.video_.currentTime - 5, event);
        }
        break;
      case 'ArrowRight':
        // If it's not focused on the volume bar, move the seek time forward
        // for 5 sec. Otherwise, the volume will be adjusted automatically.
        if (!isVolumeBar) {
          this.seek_(this.video_.currentTime + 5, event);
        }
        break;
      // Jump to the beginning of the video's seek range.
      case 'Home':
        this.seek_(this.player_.seekRange().start, event);
        break;
      // Jump to the end of the video's seek range.
      case 'End':
        this.seek_(this.player_.seekRange().end, event);
        break;
      // Pause or play by pressing space on the seek bar.
      case ' ':
        if (isSeekBar) {
          this.onPlayPauseClick_();
        }
        break;
    }
  }


  /**
   * Called both as an event listener and directly by the controls to initialize
   * the buffering state.
   * @private
   */
  onBufferingStateChange_() {
    // Don't use setDisplay_ here, since the SVG spinner doesn't have classList
    // on IE.
    if (this.player_.isBuffering()) {
      this.bufferingSpinner_.setAttribute(
          'class', 'shaka-spinner-svg');
    } else {
      this.bufferingSpinner_.setAttribute(
          'class', 'shaka-spinner-svg shaka-hidden');
    }
  }


  /**
   * @return {boolean}
   * @private
   */
  isOpaque_() {
    if (!this.enabled_) {
      return false;
    }

    // TODO: refactor into a single property
    // While you are casting, the UI is always opaque.
    if (this.castProxy_ && this.castProxy_.isCasting()) {
      return true;
    }

    return this.controlsContainer_.getAttribute('shown') != null;
  }


  /**
   * Update the video's current time based on the keyboard operations.
   * @param {number} currentTime
   * @param {!Event} event
   * @private
   */
  seek_(currentTime, event) {
    this.video_.currentTime = currentTime;
    this.updateTimeAndSeekRange_();
  }


  /**
   * Called when the seek range or current time need to be updated.
   * @private
   */
  updateTimeAndSeekRange_() {
    // Suppress updates if the controls are hidden.
    if (!this.isOpaque_()) {
      return;
    }

    const Constants = shaka.ui.Constants;
    let displayTime = this.isSeeking_ ?
        Number(this.seekBar_.value) :
        Number(this.video_.currentTime);
    const bufferedLength = this.video_.buffered.length;
    const bufferedStart = bufferedLength ? this.video_.buffered.start(0) : 0;
    const bufferedEnd =
        bufferedLength ? this.video_.buffered.end(bufferedLength - 1) : 0;
    const seekRange = this.player_.seekRange();
    const seekRangeSize = seekRange.end - seekRange.start;

    if (this.seekBar_) {
      this.seekBar_.min = seekRange.start;
      this.seekBar_.max = seekRange.end;
    }

    if (this.player_.isLive()) {
      // The amount of time we are behind the live edge.
      const behindLive = Math.floor(seekRange.end - displayTime);
      displayTime = Math.max(0, behindLive);

      if (!this.isSeeking_ && this.seekBar_) {
        this.seekBar_.value = seekRange.end - displayTime;
      }
    } else {
      if (!this.isSeeking_ && this.seekBar_) {
        this.seekBar_.value = displayTime;
      }
    }

    if (this.seekBar_) {
      // Hide seekbar seek window is very small.
      const seekRange = this.player_.seekRange();
      const seekWindow = seekRange.end - seekRange.start;
      if (seekWindow < Constants.MIN_SEEK_WINDOW_TO_SHOW_SEEKBAR) {
        shaka.ui.Utils.setDisplay(this.seekBarContainer_, false);
        for (const menu of this.settingsMenus_) {
          menu.classList.add('shaka-low-position');
        }
      } else {
        shaka.ui.Utils.setDisplay(this.seekBarContainer_, true);
        for (const menu of this.settingsMenus_) {
          menu.classList.remove('shaka-low-position');
        }

        const gradient = ['to right'];
        if (bufferedLength == 0) {
          gradient.push('#000 0%');
        } else {
          const clampedBufferStart = Math.max(bufferedStart, seekRange.start);
          const clampedBufferEnd = Math.min(bufferedEnd, seekRange.end);

          const bufferStartDistance =
              clampedBufferStart - seekRange.start;
          const bufferEndDistance =
              clampedBufferEnd - seekRange.start;
          const playheadDistance = displayTime - seekRange.start;

          // NOTE: the fallback to zero eliminates NaN.
          const bufferStartFraction =
              (bufferStartDistance / seekRangeSize) || 0;
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
        this.seekBarContainer_.style.background =
            'linear-gradient(' + gradient.join(',') + ')';
      }
    }

    this.dispatchEvent(new shaka.util.FakeEvent('timeandseekrangeupdated'));
  }


  /**
   * Add behaviors for keyboard navigation.
   * 1. Add blue outline for focused elements.
   * 2. Allow exiting overflow settings menus by pressing Esc key.
   * 3. When navigating on overflow settings menu by pressing Tab
   *    key or Shift+Tab keys keep the focus inside overflow menu.
   *
   * @param {!Event} event
   * @private
   */
  onKeyDown_(event) {
    // Add the key code to the pressed keys set when it's pressed.
    this.pressedKeys_.add(event.keyCode);

    const anySettingsMenusAreOpen = this.anySettingsMenusAreOpen();

    if (event.keyCode == shaka.ui.Constants.KEYCODE_TAB) {
      // Enable blue outline for focused elements for keyboard
      // navigation.
      this.controlsContainer_.classList.add('shaka-keyboard-navigation');
      this.eventManager_.listen(
          window, 'mousedown', () => this.onMouseDown_());
    }

    // If escape key was pressed, close any open settings menus.
    if (event.keyCode == shaka.ui.Constants.KEYCODE_ESCAPE) {
      this.hideSettingsMenusTimer_.tickNow();
    }

    if (anySettingsMenusAreOpen &&
          this.pressedKeys_.has(shaka.ui.Constants.KEYCODE_TAB)) {
      // If Tab key or Shift+Tab keys are pressed when navigating through
      // an overflow settings menu, keep the focus to loop inside the
      // overflow menu.
      this.keepFocusInMenu_(event);
    }
  }


  /**
   * When the user is using keyboard to navigate inside the overflow settings
   * menu (pressing Tab key to go forward, or pressing Shift + Tab keys to go
   * backward), make sure it's focused only on the elements of the overflow
   * panel.
   * This is called by onKeyDown_() function, when there's a settings overflow
   * menu open, and the Tab key / Shift+Tab keys are pressed.
   * @param {!Event} event
   * @private
   */
  keepFocusInMenu_(event) {
    const openSettingsMenus = this.settingsMenus_.filter(
        (menu) => menu.classList.contains('shaka-displayed'));
    const settingsMenu = openSettingsMenus[0];
    if (settingsMenu.childNodes.length) {
      // Get the first and the last displaying child element from the overflow
      // menu.
      let firstShownChild = settingsMenu.firstElementChild;
      while (firstShownChild &&
             firstShownChild.classList.contains('shaka-hidden')) {
        firstShownChild = firstShownChild.nextElementSibling;
      }

      let lastShownChild = settingsMenu.lastElementChild;
      while (lastShownChild &&
             lastShownChild.classList.contains('shaka-hidden')) {
        lastShownChild = lastShownChild.previousElementSibling;
      }

      const activeElement = document.activeElement;
      // When only Tab key is pressed, navigate to the next elememnt.
      // If it's currently focused on the last shown child element of the
      // overflow menu, let the focus move to the first child element of the
      // menu.
      // When Tab + Shift keys are pressed at the same time, navigate to the
      // previous element. If it's currently focused on the first shown child
      // element of the overflow menu, let the focus move to the last child
      // element of the menu.
      if (this.pressedKeys_.has(shaka.ui.Constants.KEYCODE_SHIFT)) {
        if (activeElement == firstShownChild) {
          event.preventDefault();
          lastShownChild.focus();
        }
      } else {
        if (activeElement == lastShownChild) {
          event.preventDefault();
          firstShownChild.focus();
        }
      }
    }
  }


  /**
   * Removes class for keyboard navigation if mouse navigation
   * is active.
   * @private
   */
  onMouseDown_() {
    this.eventManager_.unlisten(window, 'mousedown');
    this.eventManager_.listen(window, 'keydown', (e) => this.onKeyDown_(e));
  }


  /**
   * @param {!shaka.ui.Enums.Opacity} opacity
   * @private
   */
  setControlsOpacity_(opacity) {
    if (opacity == shaka.ui.Enums.Opacity.OPAQUE) {
      this.controlsContainer_.setAttribute('shown', 'true');
    } else {
      this.controlsContainer_.removeAttribute('shown');
      // If there's an overflow menu open, keep it this way for a couple of
      // seconds in case a user immediately initiates another mouse move to
      // interact with the menus. If that didn't happen, go ahead and hide
      // the menus.
      this.hideSettingsMenusTimer_.tickAfter(/* seconds= */ 2);
    }
  }


  /**
   * Create a localization instance already pre-loaded with all the locales that
   * we support.
   *
   * @return {!shaka.ui.Localization}
   * @private
   */
  static createLocalization_() {
    /** @type {string} */
    const fallbackLocale = 'en';

    /** @type {!shaka.ui.Localization} */
    const localization = new shaka.ui.Localization(fallbackLocale);
    shaka.ui.Locales.apply(localization);
    localization.changeLocale(navigator.languages || []);

    return localization;
  }
};

/** @private {!Map.<string, !shaka.extern.IUIElement.Factory>} */
shaka.ui.ControlsPanel.elementNamesToFactories_ = new Map();
