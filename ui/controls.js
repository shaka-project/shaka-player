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

goog.require('shaka.log');
goog.require('shaka.ui.Constants');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.SeekBar');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.Timer');


/**
 * A container for custom video controls.
 * @param {!shaka.Player} player
 * @param {!HTMLElement} videoContainer
 * @param {!HTMLMediaElement} video
 * @param {shaka.extern.UIConfiguration} config
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.ui.Controls = function(player, videoContainer, video, config) {
  shaka.util.FakeEventTarget.call(this);

  /** @private {boolean} */
  this.enabled_ = true;

  /** @private {shaka.extern.UIConfiguration} */
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

  /** @private {shaka.ui.SeekBar} */
  this.seekBar_ = null;

  /** @private {boolean} */
  this.isSeeking_ = false;

  /** @private {!Array.<!Element>} */
  this.settingsMenus_ = [];

  /**
   * Individual controls which, when hovered or tab-focused, will force the
   * controls to be shown.
   * @private {!Array.<!Element>}
   */
  this.showOnHoverControls_ = [];

  /** @private {boolean} */
  this.recentMouseMovement_ = false;

  /**
   * This timer is used to detect when the user has stopped moving the mouse
   * and we should fade out the UI.
   *
   * @private {shaka.util.Timer}
   */
  this.mouseStillTimer_ = new shaka.util.Timer(() => {
    this.onMouseStill_();
  });

  /**
   * This timer is used to delay the fading of the UI.
   *
   * @private {shaka.util.Timer}
   */
  this.fadeControlsTimer_ = new shaka.util.Timer(() => {
    this.controlsContainer_.removeAttribute('shown');
    // If there's an overflow menu open, keep it this way for a couple of
    // seconds in case a user immediately initiates another mouse move to
    // interact with the menus. If that didn't happen, go ahead and hide
    // the menus.
    this.hideSettingsMenusTimer_.tickAfter(/* seconds= */ 2);
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
    /** type {function(!HTMLElement)} */
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
    // Suppress timer-based updates if the controls are hidden.
    if (this.isOpaque_()) {
      this.updateTimeAndSeekRange_();
    }
  });

  /** @private {?number} */
  this.lastTouchEventTime_ = null;

  /** @private {!Array.<!shaka.extern.IUIElement>} */
  this.elements_ = [];

  /** @private {shaka.ui.Localization} */
  this.localization_ = shaka.ui.Controls.createLocalization_();

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  // Configure and create the layout of the controls
  this.configure(this.config_);

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
  this.onCastStatusChange_(null);

  // Start this timer after we are finished initializing everything,
  this.timeAndSeekRangeTimer_.tickEvery(/* seconds= */ 0.125);
};

goog.inherits(shaka.ui.Controls, shaka.util.FakeEventTarget);


/** @private {!Map.<string, !shaka.extern.IUIElement.Factory>} */
shaka.ui.ControlsPanel.elementNamesToFactories_ = new Map();


/**
 * @override
 * @export
 */
shaka.ui.Controls.prototype.destroy = async function() {
  if (this.eventManager_) {
    this.eventManager_.release();
    this.eventManager_ = null;
  }

  if (this.mouseStillTimer_) {
    this.mouseStillTimer_.stop();
    this.mouseStillTimer_ = null;
  }

  if (this.fadeControlsTimer_) {
    this.fadeControlsTimer_.stop();
    this.fadeControlsTimer_ = null;
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

  if (this.seekBar_) {
    await this.seekBar_.destroy();
  }
};


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
 *   An object which contains details on the error.  The error's 'category' and
 *   'code' properties will identify the specific error that occurred.  In an
 *   uncompiled build, you can also use the 'message' and 'stack' properties
 *   to debug.
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
shaka.ui.Controls.registerElement = function(name, factory) {
  shaka.ui.ControlsPanel.elementNamesToFactories_.set(name, factory);
};


/**
 * This allows the application to inhibit casting.
 *
 * @param {boolean} allow
 * @export
 */
shaka.ui.Controls.prototype.allowCast = function(allow) {
  this.castAllowed_ = allow;
  this.onCastStatusChange_(null);
};


/**
 * Used by the application to notify the controls that a load operation is
 * complete.  This allows the controls to recalculate play/paused state, which
 * is important for platforms like Android where autoplay is disabled.
 * @export
 */
shaka.ui.Controls.prototype.loadComplete = function() {
  // If we are on Android or if autoplay is false, video.paused should be true.
  // Otherwise, video.paused is false and the content is autoplaying.
  this.onPlayStateChange_();
};


/**
 * @param {!shaka.extern.UIConfiguration} config
 * @export
 */
shaka.ui.Controls.prototype.configure = function(config) {
  this.config_ = config;

  this.castProxy_.changeReceiverId(config.castReceiverAppId);

  // Deconstruct the old layout if applicable
  if (this.seekBar_) {
    this.seekBar_.destroy();
    this.seekBar_ = null;
  }

  if (this.playButton_) {
    this.playButton_.destroy();
    this.playButton_ = null;
  }

  if (this.controlsContainer_) {
    shaka.util.Dom.removeAllChildren(this.controlsContainer_);
    this.videoContainer_.removeChild(this.spinnerContainer_);
  } else {
    this.addControlsContainer_();
  }

  // Create the new layout
  this.createDOM_();

  // Init the play state
  this.onPlayStateChange_();

  // Elements that should not propagate clicks (controls panel, menus)
  const noPropagationElements = this.videoContainer_.getElementsByClassName(
      'shaka-no-propagation');
  for (const element of noPropagationElements) {
    const cb = (event) => event.stopPropagation();
    this.eventManager_.listen(element, 'click', cb);
    this.eventManager_.listen(element, 'dblclick', cb);
  }
};

/**
 * Enable or disable the custom controls. Enabling disables native
 * browser controls.
 *
 * @param {boolean} enabled
 * @export
 */
shaka.ui.Controls.prototype.setEnabledShakaControls = function(enabled) {
  this.enabled_ = enabled;
  if (enabled) {
    shaka.ui.Utils.setDisplay(this.controlsContainer_, true);

    // Spinner lives outside of the main controls div
    shaka.ui.Utils.setDisplay(
      this.spinnerContainer_, this.player_.isBuffering());

    // If we're hiding native controls, make sure the video element itself is
    // not tab-navigable.  Our custom controls will still be tab-navigable.
    this.video_.tabIndex = -1;
    this.video_.controls = false;
  } else {
    shaka.ui.Utils.setDisplay(this.controlsContainer_, false);
    // Spinner lives outside of the main controls div
    shaka.ui.Utils.setDisplay(this.spinnerContainer_, false);
  }

  // The effects of play state changes are inhibited while showing native
  // browser controls.  Recalculate that state now.
  this.onPlayStateChange_();
};


/**
 * @param {boolean} seeking
 * @export
 */
shaka.ui.Controls.prototype.setSeeking = function(seeking) {
  this.isSeeking_ = seeking;
};


/**
 * Enable or disable native browser controls. Enabling disables shaka
 * controls.
 *
 * @param {boolean} enabled
 * @export
 */
shaka.ui.Controls.prototype.setEnabledNativeControls = function(enabled) {
  // If we enable the native controls, the element must be tab-navigable.
  // If we disable the native controls, we want to make sure that the video
  // element itself is not tab-navigable, so that the element is skipped over
  // when tabbing through the page.
  this.video_.controls = enabled;
  this.video_.tabIndex = enabled ? 0 : -1;

  if (enabled) {
    this.setEnabledShakaControls(false);
  }
};


/**
 * @export
 * @return {shaka.cast.CastProxy}
 */
shaka.ui.Controls.prototype.getCastProxy = function() {
  return this.castProxy_;
};


/**
 * @return {shaka.ui.Localization}
 * @export
 */
shaka.ui.Controls.prototype.getLocalization = function() {
  return this.localization_;
};

/** @export */
shaka.ui.Controls.prototype.toggleFullScreen = async function() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    // If we are in PiP mode, leave PiP mode first.
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
    } catch (error) {
      this.dispatchEvent(new shaka.util.FakeEvent('error', {
        detail: error,
      }));
    }
    await this.videoContainer_.requestFullscreen({navigationUI: 'hide'});
  }
};

/**
 * @return {!HTMLElement}
 * @export
 */
shaka.ui.Controls.prototype.getVideoContainer = function() {
  return this.videoContainer_;
};


/**
 * @return {HTMLMediaElement}
 * @export
 */
shaka.ui.Controls.prototype.getVideo = function() {
  return this.video_;
};


/**
 * @return {HTMLMediaElement}
 * @export
 */
shaka.ui.Controls.prototype.getLocalVideo = function() {
  return this.localVideo_;
};


/**
 * @return {shaka.Player}
 * @export
 */
shaka.ui.Controls.prototype.getPlayer = function() {
  return this.player_;
};


/**
 * @return {shaka.Player}
 * @export
 */
shaka.ui.Controls.prototype.getLocalPlayer = function() {
  return this.localPlayer_;
};


/**
 * @return {!HTMLElement}
 * @export
 */
shaka.ui.Controls.prototype.getControlsContainer = function() {
  return this.controlsContainer_;
};


/**
 * @return {!shaka.extern.UIConfiguration}
 * @export
 */
shaka.ui.Controls.prototype.getConfig = function() {
  return this.config_;
};


/**
 * @return {boolean}
 * @export
 */
shaka.ui.Controls.prototype.isSeeking = function() {
  return this.isSeeking_;
};


/**
 * @return {boolean}
 * @export
 */
shaka.ui.Controls.prototype.isCastAllowed = function() {
  return this.castAllowed_;
};


/**
 * @return {number}
 * @export
 */
shaka.ui.Controls.prototype.getDisplayTime = function() {
  return this.seekBar_ ? this.seekBar_.getValue() : this.video_.currentTime;
};


/**
 * @param {?number} time
 * @export
 */
shaka.ui.Controls.prototype.setLastTouchEventTime = function(time) {
  this.lastTouchEventTime_ = time;
};


/**
 * @return {boolean}
 * @export
 */
shaka.ui.Controls.prototype.anySettingsMenusAreOpen = function() {
  return this.settingsMenus_.some(
      (menu) => menu.classList.contains('shaka-displayed'));
};


/**
 * @export
 */
shaka.ui.Controls.prototype.hideSettingsMenus = function() {
  this.hideSettingsMenusTimer_.tickNow();
};


/**
 * @private
 */
shaka.ui.Controls.prototype.createDOM_ = function() {
  this.videoContainer_.classList.add('shaka-video-container');
  this.video_.classList.add('shaka-video');

  this.addSkimContainer_();

  if (this.config_.addBigPlayButton) {
    this.addPlayButton_();
  }

  this.addBufferingSpinner_();

  this.addControlsButtonPanel_();

  this.settingsMenus_ = Array.from(
    this.videoContainer_.getElementsByClassName('shaka-settings-menu'));

  if (this.config_.addSeekBar) {
    this.seekBar_ = new shaka.ui.SeekBar(this.bottomControls_, this);
  } else {
    // Settings menus need to be positioned lower, if the seekbar is absent.
    for (let menu of this.settingsMenus_) {
      menu.classList.add('shaka-low-position');
    }
  }

  this.showOnHoverControls_ = Array.from(
      this.videoContainer_.getElementsByClassName(
          'shaka-show-controls-on-mouse-over'));
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addControlsContainer_ = function() {
  /** @private {!HTMLElement} */
  this.controlsContainer_ = shaka.util.Dom.createHTMLElement('div');
  this.controlsContainer_.classList.add('shaka-controls-container');
  this.videoContainer_.appendChild(this.controlsContainer_);

  this.eventManager_.listen(this.controlsContainer_, 'touchstart', (e) => {
    this.onContainerTouch_(e);
  }, {passive: false});

  this.eventManager_.listen(this.controlsContainer_, 'click', (e) => {
    this.onContainerClick_(e);
  });
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addPlayButton_ = function() {
  const playButtonContainer = shaka.util.Dom.createHTMLElement('div');
  playButtonContainer.classList.add('shaka-play-button-container');
  this.controlsContainer_.appendChild(playButtonContainer);

  /** @private {shaka.ui.BigPlayButton} */
  this.playButton_ =
      new shaka.ui.BigPlayButton(playButtonContainer, this);
};

/** @private */
shaka.ui.Controls.prototype.addSkimContainer_ = function() {
  // This is the container that gets styled by CSS to have the
  // black gradient skim at the end of the controls.
  const skimContainer = shaka.util.Dom.createHTMLElement('div');
  skimContainer.classList.add('shaka-skim-container');
  skimContainer.classList.add('shaka-fade-out-on-mouse-out');
  this.controlsContainer_.appendChild(skimContainer);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addBufferingSpinner_ = function() {
  /** @private {!HTMLElement} */
  this.spinnerContainer_ = shaka.util.Dom.createHTMLElement('div');
  this.spinnerContainer_.classList.add('shaka-spinner-container');
  this.videoContainer_.appendChild(this.spinnerContainer_);

  const spinner = shaka.util.Dom.createHTMLElement('div');
  spinner.classList.add('shaka-spinner');
  this.spinnerContainer_.appendChild(spinner);

  // Svg elements have to be created with the svg xml namespace.
  const xmlns = 'http://www.w3.org/2000/svg';

  const svg =
      /** @type {!HTMLElement} */(document.createElementNS(xmlns, 'svg'));
  svg.setAttribute('class', 'shaka-spinner-svg');
  svg.setAttribute('viewBox', '0 0 30 30');
  spinner.appendChild(svg);

  // These coordinates are relative to the SVG viewBox above.  This is distinct
  // from the actual display size in the page, since the "S" is for "Scalable."
  // The radius of 14.5 is so that the edges of the 1-px-wide stroke will touch
  // the edges of the viewBox.
  const spinnerCircle = document.createElementNS(xmlns, 'circle');
  spinnerCircle.setAttribute('class', 'shaka-spinner-path');
  spinnerCircle.setAttribute('cx', '15');
  spinnerCircle.setAttribute('cy', '15');
  spinnerCircle.setAttribute('r', '14.5');
  spinnerCircle.setAttribute('fill', 'none');
  spinnerCircle.setAttribute('stroke-width', '1');
  spinnerCircle.setAttribute('stroke-miterlimit', '10');
  svg.appendChild(spinnerCircle);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addControlsButtonPanel_ = function() {
  /** @private {!HTMLElement} */
  this.bottomControls_ = shaka.util.Dom.createHTMLElement('div');
  this.bottomControls_.classList.add('shaka-bottom-controls');
  this.controlsContainer_.appendChild(this.bottomControls_);

  /** @private {!HTMLElement} */
  this.controlsButtonPanel_ = shaka.util.Dom.createHTMLElement('div');
  this.controlsButtonPanel_.classList.add('shaka-controls-button-panel');
  this.controlsButtonPanel_.classList.add('shaka-no-propagation');
  this.controlsButtonPanel_.classList.add('shaka-show-controls-on-mouse-over');
  this.bottomControls_.appendChild(this.controlsButtonPanel_);

  // Overflow menus are supposed to hide once you click elsewhere
  // on the video element. The code in onContainerClick_ ensures that.
  // However, clicks on controls panel don't propagate to the container,
  // so we have to explicitly hide the menus onclick here.
  this.eventManager_.listen(this.controlsButtonPanel_, 'click', () => {
    this.hideSettingsMenus();
  });

  // Create the elements specified by controlPanelElements
  for (let i = 0; i < this.config_.controlPanelElements.length; i++) {
    const name = this.config_.controlPanelElements[i];
    if (shaka.ui.ControlsPanel.elementNamesToFactories_.get(name)) {
      const factory = shaka.ui.ControlsPanel.elementNamesToFactories_.get(name);
      this.elements_.push(factory.create(this.controlsButtonPanel_, this));
    } else {
      shaka.log.alwaysWarn('Unrecognized control panel element requested:',
                           name);
    }
  }
};


/**
 * When a mobile device is rotated to landscape layout, and the video is
 * loaded, make the demo app go into fullscreen.
 * Similarly, exit fullscreen when the device is rotated to portrait layout.
 * @private
 */
shaka.ui.Controls.prototype.onScreenRotation_ = function() {
  if (!this.video_ ||
      this.video_.readyState == 0 ||
      this.castProxy_.isCasting()) { return; }

  if (screen.orientation.type.includes('landscape') &&
      !document.fullscreenElement) {
    this.videoContainer_.requestFullscreen({navigationUI: 'hide'});
  } else if (screen.orientation.type.includes('portrait') &&
      document.fullscreenElement) {
    document.exitFullscreen();
  }
};


/**
 * Adds static event listeners.  This should only add event listeners to
 * things that don't change (e.g. Player).  Dynamic elements (e.g. controls)
 * should have their event listeners added when they are created.
 * @private
 */
shaka.ui.Controls.prototype.addEventListeners_ = function() {
  // TODO: Convert adding event listers to the "() =>" form.

  this.eventManager_.listen(this.player_, 'buffering', () => {
    this.onBufferingStateChange_();
  });
  // Set the initial state, as well.
  this.onBufferingStateChange_();

  // Listen for key down events to detect tab and enable outline
  // for focused elements.
  this.eventManager_.listen(window, 'keydown', this.onKeyDown_.bind(this));

  this.eventManager_.listen(
      this.controlsContainer_, 'dblclick', () => this.toggleFullScreen());

  this.eventManager_.listen(this.video_,
      'play', this.onPlayStateChange_.bind(this));
  this.eventManager_.listen(this.video_,
      'pause', this.onPlayStateChange_.bind(this));

  // Since videos go into a paused state at the end, Chrome and Edge both fire
  // the 'pause' event when a video ends.  IE 11 only fires the 'ended' event.
  this.eventManager_.listen(this.video_,
      'ended', this.onPlayStateChange_.bind(this));

  this.eventManager_.listen(this.videoContainer_,
      'mousemove', this.onMouseMove_.bind(this));
  this.eventManager_.listen(this.videoContainer_,
      'touchmove', this.onMouseMove_.bind(this), {passive: true});
  this.eventManager_.listen(this.videoContainer_,
      'touchend', this.onMouseMove_.bind(this), {passive: true});
  this.eventManager_.listen(this.videoContainer_,
      'mouseleave', this.onMouseLeave_.bind(this));

  this.eventManager_.listen(this.castProxy_,
      'caststatuschanged', (e) => {
        this.onCastStatusChange_(e);
      });

  this.eventManager_.listen(this.videoContainer_,
      'keyup', this.onKeyUp_.bind(this));

  if (screen.orientation) {
    this.eventManager_.listen(screen.orientation, 'change', () => {
      this.onScreenRotation_();
    });
  }
};


/**
 * Hiding the cursor when the mouse stops moving seems to be the only decent UX
 * in fullscreen mode.  Since we can't use pure CSS for that, we use events both
 * in and out of fullscreen mode.
 * Showing the control bar when a key is pressed, and hiding it after some time.
 * @param {!Event} event
 * @private
 */
shaka.ui.Controls.prototype.onMouseMove_ = function(event) {
  // Disable blue outline for focused elements for mouse navigation.
  if (event.type == 'mousemove') {
    this.controlsContainer_.classList.remove('shaka-keyboard-navigation');
    this.computeOpacity();
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
  // This should be treated as part of the touch, which has already been handled
  if (this.lastTouchEventTime_ && event.type == 'mousemove') {
    return;
  }

  // Use the cursor specified in the CSS file.
  this.videoContainer_.style.cursor = '';

  this.recentMouseMovement_ = true;

  // Make sure we are not about to hide the settings menus and then force them
  // open.
  this.hideSettingsMenusTimer_.stop();

  if (!this.isOpaque_()) {
    // Only update the time and seek range on mouse movement if it's the very
    // first movement and we're about to show the controls.  Otherwise the
    // seek bar will be updated mich more rapidly during mouse movement.  Do
    // this right before making it visible.
    this.updateTimeAndSeekRange_();
    this.computeOpacity();
  }

  // Hide the cursor when the mouse stops moving.
  // Only applies while the cursor is over the video container.
  this.mouseStillTimer_.stop();

  // Only start a timeout on 'touchend' or for 'mousemove' with no touch events.
  if (event.type == 'touchend' ||
      event.type == 'keyup'|| !this.lastTouchEventTime_) {
    this.mouseStillTimer_.tickAfter(/* seconds= */ 3);
  }
};


/** @private */
shaka.ui.Controls.prototype.onMouseLeave_ = function() {
  // We sometimes get 'mouseout' events with touches.  Since we can never leave
  // the video element when touching, ignore.
  if (this.lastTouchEventTime_) return;

  // Stop the timer and invoke the callback now to hide the controls.  If we
  // don't, the opacity style we set in onMouseMove_ will continue to override
  // the opacity in CSS and force the controls to stay visible.
  this.mouseStillTimer_.tickNow();
};


/**
 * This callback is for when we are pretty sure that the mouse has stopped
 * moving (aka the mouse is still). This method should only be called via
 * |mouseStillTimer_|. If this behaviour needs to be invoked directly, use
 * |mouseStillTimer_.tickNow()|.
 *
 * @private
 */
shaka.ui.Controls.prototype.onMouseStill_ = function() {
  // Hide the cursor.  (NOTE: not supported on IE)
  this.videoContainer_.style.cursor = 'none';

  this.recentMouseMovement_ = false;
  this.computeOpacity();
};


/**
 * @return {boolean} true if any relevant elements are hovered.
 * @private
 */
shaka.ui.Controls.prototype.isHovered_ = function() {
  return this.showOnHoverControls_.some((element) => {
    return element.matches(':hover');
  });
};


/**
 * Recompute whether the controls should be shown or hidden.
 */
shaka.ui.Controls.prototype.computeOpacity = function() {
  const videoIsPaused = this.video_.paused && !this.isSeeking_;
  const keyboardNavigationMode = this.controlsContainer_.classList.contains(
    'shaka-keyboard-navigation');

  // Keep showing the controls if the video is paused, there has been recent
  // mouse movement, we're in keyboard navigation, or one of a special class of
  // elements is hovered.
  if (videoIsPaused ||
      this.recentMouseMovement_ ||
      keyboardNavigationMode ||
      this.isHovered_()) {
    // Make sure the state is up-to-date before showing it.
    this.updateTimeAndSeekRange_();

    this.controlsContainer_.setAttribute('shown', 'true');
    this.fadeControlsTimer_.stop();
  } else {
    this.fadeControlsTimer_.tickAfter(/* seconds= */ this.config_.fadeDelay);
  }
};


/**
 * @param {!Event} event
 * @private
 */
shaka.ui.Controls.prototype.onContainerTouch_ = function(event) {
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
};


/**
 * @param {!Event} event
 * @private
 */
shaka.ui.Controls.prototype.onContainerClick_ = function(event) {
  if (!this.enabled_) return;

  if (this.anySettingsMenusAreOpen()) {
    this.hideSettingsMenusTimer_.tickNow();
  } else {
    this.onPlayPauseClick_();
  }
};


/** @private */
shaka.ui.Controls.prototype.onPlayPauseClick_ = function() {
  if (!this.enabled_) return;

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
};


/**
 * @param {Event} event
 * @private
 */
shaka.ui.Controls.prototype.onCastStatusChange_ = function(event) {
  const isCasting = this.castProxy_.isCasting();
  this.dispatchEvent(new shaka.util.FakeEvent('caststatuschanged', {
    newStatus: isCasting,
  }));

  if (isCasting) {
    this.controlsContainer_.setAttribute('casting', 'true');
  } else {
    this.controlsContainer_.removeAttribute('casting');
  }
};


/** @private */
shaka.ui.Controls.prototype.onPlayStateChange_ = function() {
  // On IE 11, a video may end without going into a paused state.  To correct
  // both the UI state and the state of the video tag itself, we explicitly
  // pause the video if that happens.
  if (this.video_.ended && !this.video_.paused) {
    this.video_.pause();
  }

  this.computeOpacity();
};


/**
 * Support controls with keyboard inputs.
 * @param {!Event} event
 * @private
 */
shaka.ui.Controls.prototype.onKeyUp_ = function(event) {
  let key = event.key;

  let activeElement = document.activeElement;
  let isVolumeBar = activeElement && activeElement.classList ?
      activeElement.classList.contains('shaka-volume-bar') : false;
  let isSeekBar = activeElement && activeElement.classList &&
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
};


/**
 * Called both as an event listener and directly by the controls to initialize
 * the buffering state.
 * @private
 */
shaka.ui.Controls.prototype.onBufferingStateChange_ = function() {
  if (!this.enabled_) {
    return;
  }

  shaka.ui.Utils.setDisplay(
      this.spinnerContainer_, this.player_.isBuffering());
};


/**
 * @return {boolean}
 * @private
 */
shaka.ui.Controls.prototype.isOpaque_ = function() {
  if (!this.enabled_) return false;

  return this.controlsContainer_.getAttribute('shown') != null ||
      this.controlsContainer_.getAttribute('casting') != null;
};


/**
 * Update the video's current time based on the keyboard operations.
 * @param {number} currentTime
 * @param {!Event} event
 * @private
 */
shaka.ui.Controls.prototype.seek_ = function(currentTime, event) {
  this.video_.currentTime = currentTime;
  if (this.isOpaque_()) {
    // Only update the time and esek range if it's visible.
    this.updateTimeAndSeekRange_();
  }
};


/**
 * Called when the seek range or current time need to be updated.
 * @private
 */
shaka.ui.Controls.prototype.updateTimeAndSeekRange_ = function() {
  if (this.seekBar_) {
    this.seekBar_.setValue(this.video_.currentTime);
    this.seekBar_.update();
    if (this.seekBar_.isShowing()) {
      for (let menu of this.settingsMenus_) {
        menu.classList.remove('shaka-low-position');
      }
    } else {
      for (let menu of this.settingsMenus_) {
        menu.classList.add('shaka-low-position');
      }
    }
  }

  this.dispatchEvent(new shaka.util.FakeEvent('timeandseekrangeupdated'));
};


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
shaka.ui.Controls.prototype.onKeyDown_ = function(event) {
  // Add the key code to the pressed keys set when it's pressed.
  this.pressedKeys_.add(event.keyCode);

  const anySettingsMenusAreOpen = this.anySettingsMenusAreOpen();

  if (event.keyCode == shaka.ui.Constants.KEYCODE_TAB) {
    // Enable blue outline for focused elements for keyboard
    // navigation.
    this.controlsContainer_.classList.add('shaka-keyboard-navigation');
    this.computeOpacity();
    this.eventManager_.listen(window, 'mousedown',
                              this.onMouseDown_.bind(this));
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
};


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
shaka.ui.Controls.prototype.keepFocusInMenu_ = function(event) {
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
};


/**
 * For keyboard navigation, we use blue borders to highlight the active
 * element. If we detect that a mouse is being used, remove the blue border
 * from the active element.
 * @private
 */
shaka.ui.Controls.prototype.onMouseDown_ = function() {
  this.eventManager_.unlisten(window, 'mousedown');
  this.eventManager_.listen(window, 'keydown', this.onKeyDown_.bind(this));
};


/**
 * Create a localization instance already pre-loaded with all the locales that
 * we support.
 *
 * @return {!shaka.ui.Localization}
 * @private
 */
shaka.ui.Controls.createLocalization_ = function() {
  /** @type {string} */
  const fallbackLocale = 'en';

  /** @type {!shaka.ui.Localization} */
  const localization = new shaka.ui.Localization(fallbackLocale);
  shaka.ui.Locales.apply(localization);
  localization.changeLocale(navigator.languages || []);

  return localization;
};
