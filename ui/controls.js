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

goog.require('goog.asserts');
goog.require('shaka.ui.Constants');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.Utils');
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

  /** @private {boolean} */
  this.overrideCssShowControls_ = false;

  /** shaka.extern.UIConfiguration */
  this.config_ = config;

  /** @private {!shaka.cast.CastProxy} */
  this.castProxy_ = new shaka.cast.CastProxy(
    video, player, this.config_.castReceiverAppId);

  /** @private {boolean} */
  this.castAllowed_ = true;

  /** @private {!HTMLMediaElement} */
  this.video_ = this.castProxy_.getVideo();

  /** @private {!HTMLMediaElement} */
  this.localVideo_ = video;

  /** @private {!shaka.Player} */
  this.player_ = this.castProxy_.getPlayer();

  /** @private {!HTMLElement} */
  this.videoContainer_ = videoContainer;

  /** @private {boolean} */
  this.isSeeking_ = false;

  /** @private {?number} */
  this.seekTimeoutId_ = null;

  /** @private {?number} */
  this.mouseStillTimeoutId_ = null;

  /** @private {?number} */
  this.lastTouchEventTime_ = null;

  /** @private {!Array.<!shaka.extern.IUIElement>} */
  this.elements_ = [];

  /** @private {shaka.ui.Localization} */
  this.localization_ = shaka.ui.Controls.createLocalization_();

  this.createDOM_();

  this.updateLocalizedStrings_();

  /** @private {shaka.util.Timer} */
  this.timeAndSeekRangeTimer_ =
      new shaka.util.Timer(() => this.updateTimeAndSeekRange_());
  this.timeAndSeekRangeTimer_.start(
      /* seconds= */ 0.125, /* repeating= */ true);

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  this.addEventListeners_();

  this.hideSettingsMenusTimer_ =
    new shaka.util.Timer(() => {
      this.hideSettingsMenus();
    });


  // We might've missed a caststatuschanged event from the proxy between
  // the controls creation and initializing. Run onCastStatusChange_()
  // to ensure we have the casting state right.
  this.onCastStatusChange_(null);
};

goog.inherits(shaka.ui.Controls, shaka.util.FakeEventTarget);


/** @private {!Map.<string, !shaka.extern.IUIElement.Factory>} */
shaka.ui.Controls.elementNamesToFactories_ = new Map();


/**
 * @override
 * @export
 */
shaka.ui.Controls.prototype.destroy = function() {
  if (this.eventManager_) {
    this.eventManager_.release();
    this.eventManager_ = null;
  }

  if (this.timeAndSeekRangeTimer_) {
    this.timeAndSeekRangeTimer_.stop();
    this.timeAndSeekRangeTimer_ = null;
  }

  this.localization_ = null;

  return Promise.resolve();
};


/**
 * @param {string} name
 * @param {!shaka.extern.IUIElement.Factory} factory
 * @export
 */
shaka.ui.Controls.registerElement = function(name, factory) {
  shaka.ui.Controls.elementNamesToFactories_.set(name, factory);
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
 * Enable or disable the custom controls. Enabling disables native
 * browser controls.
 *
 * @param {boolean} enabled
 * @export
 */
shaka.ui.Controls.prototype.setEnabledShakaControls = function(enabled) {
  this.enabled_ = enabled;
  if (enabled) {
    shaka.ui.Controls.setDisplay(
      this.controlsButtonPanel_.parentElement, true);

    // If we're hiding native controls, make sure the video element itself is
    // not tab-navigable.  Our custom controls will still be tab-navigable.
    this.video_.tabIndex = -1;
    this.video_.controls = false;
  } else {
    shaka.ui.Controls.setDisplay(
      this.controlsButtonPanel_.parentElement, false);
  }

  // The effects of play state changes are inhibited while showing native
  // browser controls.  Recalculate that state now.
  this.onPlayStateChange_();
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
 * @return {!shaka.cast.CastProxy}
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


/**
 * @return {!HTMLElement}
 * @export
 */
shaka.ui.Controls.prototype.getVideoContainer = function() {
  return this.videoContainer_;
};


/**
 * @return {!HTMLMediaElement}
 * @export
 */
shaka.ui.Controls.prototype.getVideo = function() {
  return this.video_;
};


/**
 * @return {!HTMLMediaElement}
 * @export
 */
shaka.ui.Controls.prototype.getLocalVideo = function() {
  return this.localVideo_;
};


/**
 * @return {!shaka.Player}
 * @export
 */
shaka.ui.Controls.prototype.getPlayer = function() {
  return this.player_;
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
  const displayTime = this.isSeeking_ ?
        Number(this.seekBar_.value) :
        Number(this.video_.currentTime);

  return displayTime;
};


/**
 * @param {?number} time
 * @export
 */
shaka.ui.Controls.prototype.setLastTouchEventTime = function(time) {
  this.lastTouchEventTime_ = time;
};


/**
 * Depending on the value of display, sets/removes css class of element to
 * either display it or hide.
 *
 * @param {Element} element
 * @param {boolean} display
 * @export
 */
shaka.ui.Controls.setDisplay = function(element, display) {
  if (!element) return;
  if (display) {
    element.classList.add('shaka-displayed');
    // Removing a non-existent class doesn't throw, so, even if
    // the element is not hidden, this should be fine. Same for displayed
    // below.
    element.classList.remove('shaka-hidden');
  } else {
    element.classList.add('shaka-hidden');
    element.classList.remove('shaka-displayed');
  }
};


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
shaka.ui.Controls.prototype.overrideCssShowControls = function() {
  this.overrideCssShowControls_ = true;
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
  for (let menu of this.settingsMenus_) {
    shaka.ui.Controls.setDisplay(/** @type {!HTMLElement} */ (menu), false);
  }
};


/**
 * @private
 */
shaka.ui.Controls.prototype.updateLocalizedStrings_ = function() {
  const LocIds = shaka.ui.Locales.Ids;

  if (this.seekBar_) {
    this.seekBar_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
          this.localization_.resolve(LocIds.ARIA_LABEL_SEEK));
  }

  // Localize state-dependant labels
  const makePlayNotPause = this.video_.paused && !this.isSeeking_;
  const playButtonAriaLabelId = makePlayNotPause ? LocIds.ARIA_LABEL_PLAY :
                                                   LocIds.ARIA_LABEL_PAUSE;
  this.playButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
      this.localization_.resolve(playButtonAriaLabelId));
};


/**
 * @private
 */
shaka.ui.Controls.prototype.initOptionalElementsToNull_ = function() {
  // TODO: encapsulate/abstract range inputs and their containers

  /** @private {HTMLElement} */
  this.seekBarContainer_ = null;

  /** @private {HTMLInputElement} */
  this.seekBar_ = null;
};


/**
 * @private
 */
shaka.ui.Controls.prototype.createDOM_ = function() {
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
    for (let menu of this.settingsMenus_) {
      menu.classList.add('shaka-low-position');
    }
  }
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addControlsContainer_ = function() {
  /** @private {!HTMLElement} */
  this.controlsContainer_ = shaka.ui.Utils.createHTMLElement('div');
  this.controlsContainer_.classList.add('shaka-controls-container');
  this.videoContainer_.appendChild(this.controlsContainer_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addPlayButton_ = function() {
  /** @private {!HTMLElement} */
  this.playButtonContainer_ = shaka.ui.Utils.createHTMLElement('div');
  this.playButtonContainer_.classList.add('shaka-play-button-container');
  this.controlsContainer_.appendChild(this.playButtonContainer_);

  /** @private {!HTMLElement} */
  this.playButton_ = shaka.ui.Utils.createHTMLElement('button');
  this.playButton_.classList.add('shaka-play-button');
  this.playButton_.setAttribute('icon', 'play');
  this.playButtonContainer_.appendChild(this.playButton_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addBufferingSpinner_ = function() {
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
  this.bufferingSpinner_.appendChild(spinnerCircle);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addControlsButtonPanel_ = function() {
  /** @private {!HTMLElement} */
  this.controlsButtonPanel_ = shaka.ui.Utils.createHTMLElement('div');
  this.controlsButtonPanel_.classList.add('shaka-controls-button-panel');
  this.controlsButtonPanel_.classList.add('shaka-no-propagation');
  this.controlsButtonPanel_.classList.add('shaka-show-controls-on-mouse-over');
  this.controlsContainer_.appendChild(this.controlsButtonPanel_);

  // Create the elements specified by controlPanelElements
  for (let i = 0; i < this.config_.controlPanelElements.length; i++) {
    const name = this.config_.controlPanelElements[i];
    if (shaka.ui.Controls.elementNamesToFactories_.get(name)) {
      if (shaka.ui.Controls.controlPanelElements_.indexOf(name) == -1) {
        // Not a control panel element, skip
        shaka.log.warning('Element is not part of control panel ' +
          'elements and will be skipped', name);
        continue;
      }
      const factory = shaka.ui.Controls.elementNamesToFactories_.get(name);
      this.elements_.push(factory.create(this.controlsButtonPanel_, this));
    }
  }
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addEventListeners_ = function() {
  // TODO: Convert adding event listers to the "() =>" form.

  this.player_.addEventListener(
      'buffering', this.onBufferingStateChange_.bind(this));

  // Listen for key down events to detect tab and enable outline
  // for focused elements.
  this.eventManager_.listen(window, 'keydown', this.onKeyDown_.bind(this));

  this.video_.addEventListener(
      'play', this.onPlayStateChange_.bind(this));
  this.video_.addEventListener(
      'pause', this.onPlayStateChange_.bind(this));

  // Since videos go into a paused state at the end, Chrome and Edge both fire
  // the 'pause' event when a video ends.  IE 11 only fires the 'ended' event.
  this.video_.addEventListener(
      'ended', this.onPlayStateChange_.bind(this));

  if (this.seekBar_) {
    this.seekBar_.addEventListener(
        'mousedown', this.onSeekStart_.bind(this));
    this.seekBar_.addEventListener(
        'touchstart', this.onSeekStart_.bind(this), {passive: true});
    this.seekBar_.addEventListener(
        'input', this.onSeekInput_.bind(this));
    this.seekBar_.addEventListener(
        'touchend', this.onSeekEnd_.bind(this));
    this.seekBar_.addEventListener(
        'mouseup', this.onSeekEnd_.bind(this));
  }

  this.controlsContainer_.addEventListener(
      'touchstart', this.onContainerTouch_.bind(this), {passive: false});
  this.controlsContainer_.addEventListener(
      'click', this.onContainerClick_.bind(this));

  // Elements that should not propagate clicks (controls panel, menus)
  const noPropagationElements = this.videoContainer_.getElementsByClassName(
      'shaka-no-propagation');
  for (let i = 0; i < noPropagationElements.length; i++) {
    let element = noPropagationElements[i];
    element.addEventListener(
      'click', function(event) { event.stopPropagation(); });
  }

  // Keep showing controls if one of those elements is hovered
  let showControlsElements = this.videoContainer_.getElementsByClassName(
      'shaka-show-controls-on-mouse-over');
  for (let i = 0; i < showControlsElements.length; i++) {
    let element = showControlsElements[i];
    element.addEventListener(
      'mouseover', () => {
        this.overrideCssShowControls_ = true;
      });

    element.addEventListener(
      'mouseleave', () => {
       this.overrideCssShowControls_ = false;
      });
  }

  this.videoContainer_.addEventListener(
      'mousemove', this.onMouseMove_.bind(this));
  this.videoContainer_.addEventListener(
      'touchmove', this.onMouseMove_.bind(this), {passive: true});
  this.videoContainer_.addEventListener(
      'touchend', this.onMouseMove_.bind(this), {passive: true});
  this.videoContainer_.addEventListener(
      'mouseout', this.onMouseOut_.bind(this));

  // Overflow menus are supposed to hide once you click elsewhere
  // on the video element. The code in onContainerClick_ ensures that.
  // However, clicks on controls panel don't propagate to the container,
  // so we have to explicitely hide the menus onclick here.
  this.controlsButtonPanel_.addEventListener('click', () => {
    if (this.anySettingsMenusAreOpen()) {
      this.hideSettingsMenus();
    }
  });

  this.castProxy_.addEventListener(
      'caststatuschanged', (e) => {
        this.onCastStatusChange_(e);
      });

  this.videoContainer_.addEventListener('keyup', this.onKeyUp_.bind(this));

  this.localization_.addEventListener(
      shaka.ui.Localization.LOCALE_UPDATED,
      (e) => this.updateLocalizedStrings_());

  this.localization_.addEventListener(
      shaka.ui.Localization.LOCALE_CHANGED,
      (e) => this.updateLocalizedStrings_());
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addSeekBar_ = function() {
  // This container is to support IE 11.  See detailed notes in
  // less/range_elements.less for a complete explanation.
  // TODO: Factor this into a range-element component.
  this.seekBarContainer_ = shaka.ui.Utils.createHTMLElement('div');
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
  // Show the controls.
  this.setControlsOpacity_(shaka.ui.Enums.Opacity.OPAQUE);
  this.hideSettingsMenusTimer_.stop();
  this.updateTimeAndSeekRange_();

  // Hide the cursor when the mouse stops moving.
  // Only applies while the cursor is over the video container.
  if (this.mouseStillTimeoutId_) {
    // Reset the timer.
    window.clearTimeout(this.mouseStillTimeoutId_);
  }

  // Only start a timeout on 'touchend' or for 'mousemove' with no touch events.
  if (event.type == 'touchend' ||
      event.type == 'keyup'|| !this.lastTouchEventTime_) {
    this.mouseStillTimeoutId_ = window.setTimeout(
        this.onMouseStill_.bind(this), 3000);
  }
};


/** @private */
shaka.ui.Controls.prototype.onMouseOut_ = function() {
  // We sometimes get 'mouseout' events with touches.  Since we can never leave
  // the video element when touching, ignore.
  if (this.lastTouchEventTime_) return;

  // Expire the timer early.
  if (this.mouseStillTimeoutId_) {
    window.clearTimeout(this.mouseStillTimeoutId_);
  }
  // Run the timeout callback to hide the controls.
  // If we don't, the opacity style we set in onMouseMove_ will continue to
  // override the opacity in CSS and force the controls to stay visible.
  this.onMouseStill_();
};


/** @private */
shaka.ui.Controls.prototype.onMouseStill_ = function() {
  // The mouse has stopped moving.
  this.mouseStillTimeoutId_ = null;
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
    this.hideSettingsMenus();
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

  // Video is paused during seek, so don't show the play arrow while seeking:
  if (this.enabled_ && this.video_.paused && !this.isSeeking_) {
    this.playButton_.setAttribute('icon', 'play');
    this.playButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
      this.localization_.resolve(shaka.ui.Locales.Ids.ARIA_LABEL_PLAY));
  } else {
    this.playButton_.setAttribute('icon', 'pause');
    this.playButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
      this.localization_.resolve(shaka.ui.Locales.Ids.ARIA_LABEL_PAUSE));
  }
};


/** @private */
shaka.ui.Controls.prototype.onSeekStart_ = function() {
  if (!this.enabled_) return;

  this.isSeeking_ = true;
  this.video_.pause();
};


/** @private */
shaka.ui.Controls.prototype.onSeekInput_ = function() {
  if (!this.enabled_) return;

  if (!this.video_.duration) {
    // Can't seek yet.  Ignore.
    return;
  }

  // Update the UI right away.
  this.updateTimeAndSeekRange_();

  // Collect input events and seek when things have been stable for 125ms.
  if (this.seekTimeoutId_ != null) {
    window.clearTimeout(this.seekTimeoutId_);
  }
  this.seekTimeoutId_ = window.setTimeout(
      this.onSeekInputTimeout_.bind(this), 125);
};


/** @private */
shaka.ui.Controls.prototype.onSeekInputTimeout_ = function() {
  goog.asserts.assert(this.seekBar_ != null, 'Seekbar should not be null!');
  this.seekTimeoutId_ = null;
  this.video_.currentTime = parseFloat(this.seekBar_.value);
};


/** @private */
shaka.ui.Controls.prototype.onSeekEnd_ = function() {
  if (!this.enabled_) return;

  if (this.seekTimeoutId_ != null) {
    // They just let go of the seek bar, so end the timer early.
    window.clearTimeout(this.seekTimeoutId_);
    this.onSeekInputTimeout_();
  }

  this.isSeeking_ = false;
  this.video_.play();
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
 * @param {!Event} event
 * @private
 */
shaka.ui.Controls.prototype.onBufferingStateChange_ = function(event) {
  // Using [] notation to access buffering property to work around
  // a compiler error.
  const isBuffering = event['buffering'];

  // Don't use setDisplay_ here, since the SVG spinner doesn't have classList
  // on IE.
  if (isBuffering) {
    this.bufferingSpinner_.setAttribute(
        'class', 'shaka-spinner-svg');
  } else {
    this.bufferingSpinner_.setAttribute(
        'class', 'shaka-spinner-svg shaka-hidden');
  }
};


/**
 * @return {boolean}
 * @private
 */
shaka.ui.Controls.prototype.isOpaque_ = function() {
  if (!this.enabled_) return false;

  // TODO: refactor into a single property
  // While you are casting, the UI is always opaque.
  if (this.castProxy_ && this.castProxy_.isCasting()) return true;

  return this.controlsContainer_.getAttribute('shown') != null;
};


/**
 * Update the video's current time based on the keyboard operations.
 * @param {number} currentTime
 * @param {!Event} event
 * @private
 */
shaka.ui.Controls.prototype.seek_ = function(currentTime, event) {
  this.video_.currentTime = currentTime;
  this.updateTimeAndSeekRange_();
};


/**
 * Called when the seek range or current time need to be updated.
 * @private
 */
shaka.ui.Controls.prototype.updateTimeAndSeekRange_ = function() {
  // Suppress updates if the controls are hidden.
  if (!this.isOpaque_()) {
    return;
  }

  this.dispatchEvent(new shaka.util.FakeEvent('timeandseekrangeupdated'));

  const Constants = shaka.ui.Constants;
  let displayTime = this.isSeeking_ ?
      Number(this.seekBar_.value) :
      Number(this.video_.currentTime);
  let bufferedLength = this.video_.buffered.length;
  let bufferedStart = bufferedLength ? this.video_.buffered.start(0) : 0;
  let bufferedEnd =
      bufferedLength ? this.video_.buffered.end(bufferedLength - 1) : 0;
  let seekRange = this.player_.seekRange();
  let seekRangeSize = seekRange.end - seekRange.start;

  if (this.seekBar_) {
    this.seekBar_.min = seekRange.start;
    this.seekBar_.max = seekRange.end;
  }

  if (this.player_.isLive()) {
    // The amount of time we are behind the live edge.
    let behindLive = Math.floor(seekRange.end - displayTime);
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
      shaka.ui.Controls.setDisplay(this.seekBarContainer_, false);
      for (let menu of this.settingsMenus_) {
        menu.classList.add('shaka-low-position');
      }
    } else {
      shaka.ui.Controls.setDisplay(this.seekBarContainer_, true);
      for (let menu of this.settingsMenus_) {
        menu.classList.remove('shaka-low-position');
      }

      let gradient = ['to right'];
      if (bufferedLength == 0) {
        gradient.push('#000 0%');
      } else {
        const clampedBufferStart = Math.max(bufferedStart, seekRange.start);
        const clampedBufferEnd = Math.min(bufferedEnd, seekRange.end);

        const bufferStartDistance = clampedBufferStart - seekRange.start;
        const bufferEndDistance = clampedBufferEnd - seekRange.start;
        const playheadDistance = displayTime - seekRange.start;

        // NOTE: the fallback to zero eliminates NaN.
        const bufferStartFraction = (bufferStartDistance / seekRangeSize) || 0;
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
};


/**
 * Adds class for keyboard navigation if tab was pressed.
 *
 * @param {!Event} event
 * @private
 */
shaka.ui.Controls.prototype.onKeyDown_ = function(event) {
  if (event.keyCode == shaka.ui.Constants.KEYCODE_TAB) {
    // Enable blue outline for focused elements for keyboard
    // navigation.
    this.controlsContainer_.classList.add('shaka-keyboard-navigation');
    this.eventManager_.listen(window, 'mousedown',
                              this.onMouseDown_.bind(this));
  } else if (event.keyCode == shaka.ui.Constants.KEYCODE_TAB &&
      this.anySettingsMenusAreOpen()) {
        this.hideSettingsMenus();
  }
};


/**
 * Removes class for keyboard navigation if mouse navigation
 * is active.
 * @private
 */
shaka.ui.Controls.prototype.onMouseDown_ = function() {
  this.eventManager_.unlisten(window, 'mousedown');
  this.eventManager_.listen(window, 'keydown', this.onKeyDown_.bind(this));
};


/**
 * @param {!shaka.ui.Enums.Opacity} opacity
 * @private
 */
shaka.ui.Controls.prototype.setControlsOpacity_ = function(opacity) {
  if (opacity == shaka.ui.Enums.Opacity.OPAQUE) {
    this.controlsContainer_.setAttribute('shown', 'true');
  } else {
    this.controlsContainer_.removeAttribute('shown');
    // If there's an overflow menu open, keep it this way for a couple of
    // seconds in case a user immidiately initiaites another mouse move to
    // interact with the menus. If that didn't happen, go ahead and hide
    // the menus.
    this.hideSettingsMenusTimer_.start(/* seconds= */ 2,
                                       /* repeating= */ false);
  }
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


/** @private {!Array.<string>} */
shaka.ui.Controls.controlPanelElements_ = [
  'time_and_duration',
  'mute',
  'volume',
  'fullscreen',
  'overflow_menu',
  'rewind',
  'fast_forward',
  'spacer',
];
