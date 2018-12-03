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
goog.require('mozilla.LanguageMapping');
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

  /** @private {!Map.<string, !Function>} */
  this.elementNamesToFunctions_ = new Map([
    ['time_and_duration', () => { this.addCurrentTime_(); }],
    ['mute', () => { this.addMuteButton_(); }],
    ['volume', () => { this.addVolumeBar_(); }],
    ['fullscreen', () => { this.addFullscreenButton_(); }],
    ['overflow_menu', () => { this.addOverflowMenuButton_(); }],
    ['captions', () => { this.addCaptionButton_(); }],
    ['cast', () => { this.addCastButton_(); }],
    ['rewind', () => { this.addRewindButton_(); }],
    ['fast_forward', () => { this.addFastForwardButton_(); }],
    ['quality', () => { this.addResolutionButton_(); }],
    ['language', () => { this.addLanguagesButton_(); }],
    ['picture_in_picture', () => { this.addPipButton_(); }],
  ]);

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

  /** @private {number} */
  this.trickPlayRate_ = 1;

  /** @private {?number} */
  this.seekTimeoutId_ = null;

  /** @private {?number} */
  this.mouseStillTimeoutId_ = null;

  /** @private {?number} */
  this.lastTouchEventTime_ = null;

  /** @private {shaka.ui.Localization} */
  this.localization_ = shaka.ui.Controls.createLocalization_();

  this.createDOM_();

  const LocIds = shaka.ui.Locales.Ids;

  /** @private {!Map.<HTMLElement, string>} */
  this.ariaLabels_ = new Map()
    .set(this.seekBar_, LocIds.ARIA_LABEL_SEEK)
    .set(this.captionButton_, LocIds.ARIA_LABEL_CAPTIONS)
    .set(this.backFromCaptionsButton_, LocIds.ARIA_LABEL_BACK)
    .set(this.backFromResolutionButton_, LocIds.ARIA_LABEL_BACK)
    .set(this.backFromLanguageButton_, LocIds.ARIA_LABEL_BACK)
    .set(this.rewindButton_, LocIds.ARIA_LABEL_REWIND)
    .set(this.fastForwardButton_, LocIds.ARIA_LABEL_FAST_FORWARD)
    .set(this.resolutionButton_, LocIds.ARIA_LABEL_RESOLUTION)
    .set(this.languagesButton_, LocIds.ARIA_LABEL_LANGUAGE)
    .set(this.castButton_, LocIds.ARIA_LABEL_CAST)
    .set(this.volumeBar_, LocIds.ARIA_LABEL_VOLUME)
    .set(this.overflowMenuButton_, LocIds.ARIA_LABEL_MORE_SETTINGS);

  /** @private {!Map.<HTMLElement, string>} */
  this.textContentToLocalize_ = new Map()
    .set(this.captionsNameSpan_, LocIds.LABEL_CAPTIONS)
    .set(this.backFromCaptionsSpan_, LocIds.LABEL_CAPTIONS)
    .set(this.captionsOffSpan_, LocIds.LABEL_CAPTIONS_OFF)
    .set(this.castNameSpan_, LocIds.LABEL_CAST)
    .set(this.backFromResolutionSpan_, LocIds.LABEL_RESOLUTION)
    .set(this.resolutionNameSpan_, LocIds.LABEL_RESOLUTION)
    .set(this.abrOnSpan_, LocIds.LABEL_AUTO_QUALITY)
    .set(this.languageNameSpan_, LocIds.LABEL_LANGUAGE)
    .set(this.backFromLanguageSpan_, LocIds.LABEL_LANGUAGE);

  this.updateLocalizedStrings_();

  this.timeAndSeekRangeTimer_ =
    new shaka.util.Timer(this.updateTimeAndSeekRange_.bind(this));

  this.timeAndSeekRangeTimer_.scheduleRepeated(0.125);

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  this.addEventListeners_();

  this.hideSettingsMenusTimer_ =
    new shaka.util.Timer(() => {
      this.hideSettingsMenus_();
    });

  // Initialize caption state with a fake event.
  this.onCaptionStateChange_();

  // We might've missed a caststatuschanged event from the proxy between
  // the controls creation and initializing. Run onCastStatusChange_()
  // to ensure we have the casting state right.
  this.onCastStatusChange_(null);
};

goog.inherits(shaka.ui.Controls, shaka.util.FakeEventTarget);


/**
 * @override
 * @export
 */
shaka.ui.Controls.prototype.destroy = async function() {
  await this.eventManager_.destroy();
  this.localization_ = null;
};


/**
 * @private
 */
shaka.ui.Controls.prototype.updateLocalizedStrings_ = function() {
  const Controls = shaka.ui.Controls;
  const LocIds = shaka.ui.Locales.Ids;

  // Localize aria labels
  let elements = this.ariaLabels_.keys();
  for (const element of elements) {
    if (element == null) {
      continue;
    }

    const id = this.ariaLabels_.get(element);
    element.setAttribute(Controls.ARIA_LABEL_,
        this.localization_.resolve(id));
  }

  // Localize state-dependant labels
  const makePlayNotPause = this.video_.paused && !this.isSeeking_;
  const playButtonAriaLabelId = makePlayNotPause ? LocIds.ARIA_LABEL_PLAY :
                                                   LocIds.ARIA_LABEL_PAUSE;
  this.playButton_.setAttribute(Controls.ARIA_LABEL_,
      this.localization_.resolve(playButtonAriaLabelId));

  if (this.muteButton_) {
    const muteButtonAriaLabelId = this.video_.muted ? LocIds.ARIA_LABEL_UNMUTE :
                                                      LocIds.ARIA_LABEL_MUTE;
    this.muteButton_.setAttribute(Controls.ARIA_LABEL_,
        this.localization_.resolve(muteButtonAriaLabelId));
  }

  if (this.fullscreenButton_) {
    const fullscreenAriaLabel = document.fullscreenElement ?
                                LocIds.ARIA_LABEL_EXIT_FULL_SCREEN :
                                LocIds.ARIA_LABEL_FULL_SCREEN;
    this.fullscreenButton_.setAttribute(Controls.ARIA_LABEL_,
        this.localization_.resolve(fullscreenAriaLabel));
  }

  // If we're not casting, string "not casting" will be displayed,
  // which needs localization.
  this.setCurrentCastSelection_();

  // If we're at "auto" resolution, this string needs localization.
  this.updateResolutionSelection_();

  // If captions/subtitles are off, this string needs localization.
  this.updateTextLanguages_();

  // Localize text
  elements = this.textContentToLocalize_.keys();
  for (const element of elements) {
    if (element == null) {
      continue;
    }

    const id = this.textContentToLocalize_.get(element);
    element.textContent = this.localization_.resolve(id);
  }
};


/**
 * @private
 */
shaka.ui.Controls.prototype.initOptionalElementsToNull_ = function() {
  // TODO: JSDoc needs to pick up UI classes. Make sure it picks up all
  // the members of Controls. b/117615943
  /** @private {HTMLInputElement} */
  this.seekBar_ = null;

  /** @private {HTMLElement} */
  this.muteButton_ = null;

  /** @private {HTMLInputElement} */
  this.volumeBar_ = null;

  /** @private {HTMLElement} */
  this.captionButton_ = null;

    /** @private {HTMLElement} */
  this.captionIcon_ = null;

  /** @private {HTMLElement} */
  this.fullscreenButton_ = null;

  /** @private {HTMLElement} */
  this.currentTime_ = null;

  /** @private {HTMLElement} */
  this.castButton_ = null;

  /** @private {HTMLElement} */
  this.castIcon_ = null;

  /** @private {HTMLElement} */
  this.overflowMenuButton_ = null;

  /** @private {HTMLElement} */
  this.rewindButton_ = null;

  /** @private {HTMLElement} */
  this.fastForwardButton_ = null;

  /** @private {HTMLElement} */
  this.resolutionButton_ = null;

  /** @private {HTMLElement} */
  this.languagesButton_ = null;

  /** @private {HTMLElement} */
  this.resolutionMenu_ = null;

  /** @private {HTMLElement} */
  this.audioLangMenu_ = null;

  /** @private {HTMLElement} */
  this.textLangMenu_ = null;

  /** @private {HTMLElement} */
  this.currentResolution_ = null;

  /** @private {HTMLElement} */
  this.castNameSpan_ = null;

  /** @private {HTMLElement} */
  this.currentAudioLanguage_ = null;

  /** @private {HTMLElement} */
  this.currentCaptions_ = null;

  /** @private {HTMLElement} */
  this.captionsNameSpan_ = null;

  /** @private {HTMLElement} */
  this.backFromCaptionsSpan_ = null;

  /** @private {HTMLElement} */
  this.backFromResolutionButton_ = null;

  /** @private {HTMLElement} */
  this.backFromLanguageButton_ = null;

  /** @private {HTMLElement} */
  this.captionsOffSpan_ = null;

  /** @private {HTMLElement} */
  this.castCurrentSelectionSpan_ = null;

  /** @private {HTMLElement} */
  this.backFromResolutionSpan_ = null;

  /** @private {HTMLElement} */
  this.resolutionNameSpan_ = null;

  /** @private {HTMLElement} */
  this.languageNameSpan_ = null;

  /** @private {HTMLElement} */
  this.backFromLanguageSpan_ = null;

  /** @private {HTMLElement} */
  this.abrOnSpan_ = null;

  /** @private {HTMLElement} */
  this.backFromCaptionsButton_ = null;

  /** @private {HTMLElement} */
  this.pipButton_ = null;

  /** @private {HTMLElement} */
  this.pipNameSpan_ = null;

  /** @private {HTMLElement} */
  this.currentPipState_ = null;

  /** @private {HTMLElement} */
  this.pipIcon_ = null;
};


/**
 * @private
 */
shaka.ui.Controls.prototype.createDOM_ = function() {
  this.initOptionalElementsToNull_();

  this.videoContainer_.classList.add('shaka-video-container');
  this.videoContainer_.classList.add('shaka-overlay-parent');
  this.video_.classList.add('shaka-video');

  this.addControlsContainer_();

  this.addPlayButton_();

  this.addBufferingSpinner_();

  this.addControlsButtonPanel_();

  // Overflow menu
  // Adding the overflow menu after the controls button panel, since the
  // screen reader follows DOM orders.
  this.addOverflowMenu_();

  // Seek bar
  if (this.config_.addSeekBar) {
    this.addSeekBar_();
  }

  /** @private {!NodeList.<!Element>} */
  this.backToOverflowMenuButtons_ = this.videoContainer_.
    getElementsByClassName('shaka-back-to-overflow-button');

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
  this.controlsContainer_ = shaka.ui.Controls.createHTMLElement_('div');
  this.controlsContainer_.classList.add('shaka-controls-container');
  this.controlsContainer_.classList.add('shaka-overlay');
  this.videoContainer_.appendChild(this.controlsContainer_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addPlayButton_ = function() {
  /** @private {!HTMLElement} */
  this.playButtonContainer_ = shaka.ui.Controls.createHTMLElement_('div');
  this.playButtonContainer_.classList.add('shaka-play-button-container');
  this.playButtonContainer_.classList.add('shaka-overlay-parent');
  this.controlsContainer_.appendChild(this.playButtonContainer_);

  /** @private {!HTMLElement} */
  this.playButton_ = shaka.ui.Controls.createHTMLElement_('button');
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

  /** @private {!HTMLElement} */
  this.bufferingSpinner_ = shaka.ui.Controls.createHTMLElement_('div');
  this.bufferingSpinner_.classList.add('shaka-buffering-spinner');
  this.bufferingSpinner_.classList.add('shaka-overlay');
  this.playButtonContainer_.appendChild(this.bufferingSpinner_);

  // Svg elements have to be created with the svg xml namespace.
  const xmlns = 'http://www.w3.org/2000/svg';

  /** @private {!HTMLElement} */
  this.spinnerSvg_ =
      /** @type {!HTMLElement} */(document.createElementNS(xmlns, 'svg'));
  // NOTE: SVG elements do not have a classList on IE, so use setAttribute.
  this.spinnerSvg_.setAttribute('class', 'shaka-spinner-svg');
  this.spinnerSvg_.setAttribute('viewBox', '25 25 50 50');
  this.bufferingSpinner_.appendChild(this.spinnerSvg_);

  const spinnerCircle = document.createElementNS(xmlns, 'circle');
  spinnerCircle.setAttribute('class', 'shaka-spinner-path');
  spinnerCircle.setAttribute('cx', '50');
  spinnerCircle.setAttribute('cy', '50');
  spinnerCircle.setAttribute('r', '15');
  spinnerCircle.setAttribute('fill', 'none');
  spinnerCircle.setAttribute('stroke-width', '1');
  spinnerCircle.setAttribute('stroke-miterlimit', '10');
  this.spinnerSvg_.appendChild(spinnerCircle);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addControlsButtonPanel_ = function() {
  /** @private {!HTMLElement} */
  this.controlsButtonPanel_ = shaka.ui.Controls.createHTMLElement_('div');
  this.controlsButtonPanel_.classList.add('shaka-controls-button-panel');
  this.controlsButtonPanel_.classList.add('shaka-no-propagation');
  this.controlsButtonPanel_.classList.add('shaka-show-controls-on-mouse-over');
  this.controlsContainer_.appendChild(this.controlsButtonPanel_);

  // Create the elements specified by controlPanelElements
  for (let i = 0; i < this.config_.controlPanelElements.length; i++) {
    const name = this.config_.controlPanelElements[i];
    if (this.elementNamesToFunctions_.get(name)) {
      if (shaka.ui.Controls.controlPanelElements_.indexOf(name) == -1) {
        // Not a control panel element, skip
        shaka.log.warning('Element is not part of control panel ' +
          'elements and will be skipped', name);
        continue;
      }
      this.elementNamesToFunctions_.get(name)();
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

  if (this.config_.adaptPlayButtonSize) {
    this.video_.addEventListener(
        'resize', this.resizePlayButtonAndSpinner_.bind(this));
  }

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

  if (this.muteButton_) {
    this.muteButton_.addEventListener(
      'click', this.onMuteButtonClick_.bind(this));
  }

  if (this.volumeBar_) {
    this.volumeBar_.addEventListener(
      'input', this.onVolumeInput_.bind(this));
  }

  this.video_.addEventListener(
      'volumechange', this.onVolumeStateChange_.bind(this));
  // Initialize volume display with a fake event.
  this.onVolumeStateChange_();

  if (this.captionButton_) {
    this.captionButton_.addEventListener(
      'click', this.onCaptionClick_.bind(this));
  }

  this.player_.addEventListener(
      'texttrackvisibility', this.onCaptionStateChange_.bind(this));
  this.player_.addEventListener(
      'trackschanged', this.onTracksChange_.bind(this));
  this.player_.addEventListener(
      'variantchanged', this.onVariantChange_.bind(this));
  this.player_.addEventListener(
      'textchanged', this.updateTextLanguages_.bind(this));

  if (this.fullscreenButton_) {
    this.fullscreenButton_.addEventListener(
      'click', this.onFullscreenClick_.bind(this));
  }

  if (this.currentTime_) {
    this.currentTime_.addEventListener(
      'click', this.onCurrentTimeClick_.bind(this));
  }

  if (this.rewindButton_) {
    this.rewindButton_.addEventListener(
      'click', this.onRewindClick_.bind(this));
  }

  if (this.fastForwardButton_) {
    this.fastForwardButton_.addEventListener(
      'click', this.onFastForwardClick_.bind(this));
  }

  if (this.castButton_) {
    this.castButton_.addEventListener(
      'click', this.onCastClick_.bind(this));
  }

  if (this.pipButton_) {
    this.pipButton_.addEventListener(
      'click', () => {
        this.onPipClick_();
      });
    this.localVideo_.addEventListener(
      'enterpictureinpicture', this.onEnterPictureInPicture_.bind(this));
    this.localVideo_.addEventListener(
      'leavepictureinpicture', this.onLeavePictureInPicture_.bind(this));
  }

  this.controlsContainer_.addEventListener(
      'touchstart', this.onContainerTouch_.bind(this), {passive: false});
  this.controlsContainer_.addEventListener(
      'click', this.onContainerClick_.bind(this));

  this.overflowMenu_.addEventListener(
      'touchstart', function(event) {
        this.lastTouchEventTime_ = Date.now();
        event.stopPropagation();
      }.bind(this));

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

  if (this.overflowMenuButton_) {
    this.overflowMenuButton_.addEventListener(
      'click', this.onOverflowMenuButtonClick_.bind(this));
  }

  if (this.resolutionButton_) {
    this.resolutionButton_.addEventListener(
        'click', this.onResolutionClick_.bind(this));
  }

  if (this.languagesButton_) {
    this.languagesButton_.addEventListener(
        'click', this.onLanguagesClick_.bind(this));
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
    if (this.anySettingsMenusAreOpen_()) {
      this.hideSettingsMenus_();
    }
  });

  this.castProxy_.addEventListener(
      'caststatuschanged', this.onCastStatusChange_.bind(this));

  this.videoContainer_.addEventListener('keyup', this.onKeyUp_.bind(this));

  for (let i = 0; i < this.backToOverflowMenuButtons_.length; i++) {
    let button = this.backToOverflowMenuButtons_[i];
    button.addEventListener('click', () => {
      // Hide the submenus, display the overflow menu
      this.hideSettingsMenus_();
      shaka.ui.Controls.setDisplay_(this.overflowMenu_, true);

      // If there are back to overflow menu buttons, there must be
      // overflow menu buttons, but oh well
      if (this.overflowMenu_.childNodes.length) {
        /** @type {!HTMLElement} */ (this.overflowMenu_.childNodes[0]).focus();
      }

      // Make sure controls are displayed
      this.overrideCssShowControls_ = true;
    });
  }

  if (screen.orientation) {
    screen.orientation.addEventListener(
        'change', this.onScreenRotation_.bind(this));
  }

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
  this.seekBar_ =
    /** @type {!HTMLInputElement} */ (document.createElement('input'));
  this.seekBar_.classList.add('shaka-seek-bar');
  this.seekBar_.type = 'range';
  this.seekBar_.setAttribute('step', 'any');
  this.seekBar_.setAttribute('min', '0');
  this.seekBar_.setAttribute('max', '1');
  this.seekBar_.value = '0';
  this.seekBar_.classList.add('shaka-no-propagation');
  this.seekBar_.classList.add('shaka-show-controls-on-mouse-over');
  this.controlsContainer_.appendChild(this.seekBar_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addOverflowMenu_ = function() {
  /** @private {!HTMLElement} */
  this.overflowMenu_ = shaka.ui.Controls.createHTMLElement_('div');
  this.overflowMenu_.classList.add('shaka-overflow-menu');
  this.overflowMenu_.classList.add('shaka-no-propagation');
  this.overflowMenu_.classList.add('shaka-show-controls-on-mouse-over');
  this.overflowMenu_.classList.add('shaka-settings-menu');
  this.controlsContainer_.appendChild(this.overflowMenu_);

  for (let i = 0; i < this.config_.overflowMenuButtons.length; i++) {
    const name = this.config_.overflowMenuButtons[i];
    if (this.elementNamesToFunctions_.get(name)) {
      if (shaka.ui.Controls.overflowButtons_.indexOf(name) == -1) {
        // Not an overflow button, skip
        shaka.log.warning('Element is not part of overflow ' +
          'button collection and will be skipped', name);
        continue;
      }
      this.elementNamesToFunctions_.get(name)();
    }
  }

  // Add settings menus
  if (this.config_.overflowMenuButtons.indexOf('quality') > -1) {
    this.addResolutionMenu_();
  }

  if (this.config_.overflowMenuButtons.indexOf('language') > -1) {
    this.addAudioLangMenu_();
  }

  if (this.config_.overflowMenuButtons.indexOf('captions') > -1) {
    this.addTextLangMenu_();
  }
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addCurrentTime_ = function() {
  const timeContainer = shaka.ui.Controls.createHTMLElement_('div');
  timeContainer.classList.add('shaka-time-container');
  this.currentTime_ = shaka.ui.Controls.createHTMLElement_('div');
  this.currentTime_.textContent = '0:00';
  timeContainer.appendChild(this.currentTime_);
  this.controlsButtonPanel_.appendChild(timeContainer);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addMuteButton_ = function() {
  this.muteButton_ = shaka.ui.Controls.createHTMLElement_('button');
  this.muteButton_.classList.add('shaka-mute-button');
  this.muteButton_.classList.add('material-icons');
  this.muteButton_.textContent = shaka.ui.Controls.MaterialDesignIcons_.MUTE;
  this.controlsButtonPanel_.appendChild(this.muteButton_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addVolumeBar_ = function() {
  this.volumeBar_ =
    /** @type {!HTMLInputElement} */ (document.createElement('input'));
  this.volumeBar_.classList.add('shaka-volume-bar');
  this.volumeBar_.setAttribute('type', 'range');
  this.volumeBar_.setAttribute('step', 'any');
  this.volumeBar_.setAttribute('min', '0');
  this.volumeBar_.setAttribute('max', '1');
  this.volumeBar_.setAttribute('value', '0');
  this.controlsButtonPanel_.appendChild(this.volumeBar_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addFullscreenButton_ = function() {
  this.fullscreenButton_ = shaka.ui.Controls.createHTMLElement_('button');
  this.fullscreenButton_.classList.add('shaka-fullscreen-button');
  this.fullscreenButton_.classList.add('material-icons');
  this.fullscreenButton_.textContent =
    shaka.ui.Controls.MaterialDesignIcons_.FULLSCREEN;
  this.controlsButtonPanel_.appendChild(this.fullscreenButton_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addOverflowMenuButton_ = function() {
  this.overflowMenuButton_ = shaka.ui.Controls.createHTMLElement_('button');
  this.overflowMenuButton_.classList.add('shaka-overflow-menu-button');
  this.overflowMenuButton_.classList.add('shaka-no-propagation');
  this.overflowMenuButton_.classList.add('material-icons');
  this.overflowMenuButton_.textContent =
    shaka.ui.Controls.MaterialDesignIcons_.OPEN_OVERFLOW;
  this.controlsButtonPanel_.appendChild(this.overflowMenuButton_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addCaptionButton_ = function() {
  this.captionButton_ = shaka.ui.Controls.createHTMLElement_('button');
  this.captionButton_.classList.add('shaka-caption-button');
  this.captionIcon_ = shaka.ui.Controls.createHTMLElement_('i');
  this.captionIcon_.classList.add('material-icons');
  this.captionIcon_.textContent =
    shaka.ui.Controls.MaterialDesignIcons_.CLOSED_CAPTIONS;

  if (this.player_ && this.player_.isTextTrackVisible()) {
    this.captionButton_.setAttribute('aria-pressed', 'true');
  } else {
    this.captionButton_.setAttribute('aria-pressed', 'false');
  }
  this.captionButton_.appendChild(this.captionIcon_);

  const label = shaka.ui.Controls.createHTMLElement_('label');
  label.classList.add('shaka-overflow-button-label');

  this.captionsNameSpan_ = shaka.ui.Controls.createHTMLElement_('span');

  label.appendChild(this.captionsNameSpan_);

  this.currentCaptions_ = shaka.ui.Controls.createHTMLElement_('span');
  this.currentCaptions_.classList.add('shaka-current-selection-span');
  label.appendChild(this.currentCaptions_);
  this.captionButton_.appendChild(label);
  this.overflowMenu_.appendChild(this.captionButton_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addTextLangMenu_ = function() {
  this.textLangMenu_ = shaka.ui.Controls.createHTMLElement_('div');
  this.textLangMenu_.classList.add('shaka-text-languages');
  this.textLangMenu_.classList.add('shaka-no-propagation');
  this.textLangMenu_.classList.add('shaka-show-controls-on-mouse-over');
  this.textLangMenu_.classList.add('shaka-settings-menu');

  this.backFromCaptionsButton_ = shaka.ui.Controls.createHTMLElement_('button');
  this.backFromCaptionsButton_.classList.add('shaka-back-to-overflow-button');
  this.textLangMenu_.appendChild(this.backFromCaptionsButton_);

  const backIcon = shaka.ui.Controls.createHTMLElement_('i');
  backIcon.classList.add('material-icons');
  backIcon.textContent = shaka.ui.Controls.MaterialDesignIcons_.BACK;
  this.backFromCaptionsButton_.appendChild(backIcon);

  this.backFromCaptionsSpan_ = shaka.ui.Controls.createHTMLElement_('span');
  this.backFromCaptionsButton_.appendChild(this.backFromCaptionsSpan_);

  // Add the off option
  const off = shaka.ui.Controls.createHTMLElement_('button');
  off.setAttribute('aria-selected', 'true');
  this.textLangMenu_.appendChild(off);

  const chosenIcon = shaka.ui.Controls.createHTMLElement_('i');
  chosenIcon.classList.add('material-icons');
  chosenIcon.classList.add('shaka-chosen-item');
  // This text content is actually a material design icon.
  // DO NOT LOCALIZE
  chosenIcon.textContent = shaka.ui.Controls.MaterialDesignIcons_.CHECKMARK;
  // Screen reader should ignore 'done'.
  chosenIcon.setAttribute('aria-hidden', 'true');
  off.appendChild(chosenIcon);

  this.captionsOffSpan_ = shaka.ui.Controls.createHTMLElement_('span');

  this.captionsOffSpan_.classList.add('shaka-auto-span');
  off.appendChild(this.captionsOffSpan_);

  this.controlsContainer_.appendChild(this.textLangMenu_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addCastButton_ = function() {
  this.castButton_ = shaka.ui.Controls.createHTMLElement_('button');

  this.castButton_.classList.add('shaka-cast-button');
  this.castButton_.classList.add('shaka-hidden');
  this.castButton_.setAttribute('aria-pressed', 'false');

  this.castIcon_ = shaka.ui.Controls.createHTMLElement_('i');
  this.castIcon_.classList.add('material-icons');
  // This text content is actually a material design icon.
  // DO NOT LOCALIZE
  this.castIcon_.textContent = shaka.ui.Controls.MaterialDesignIcons_.CAST;
  this.castButton_.appendChild(this.castIcon_);

  const label = shaka.ui.Controls.createHTMLElement_('label');
  label.classList.add('shaka-overflow-button-label');
  this.castNameSpan_ = shaka.ui.Controls.createHTMLElement_('span');
  label.appendChild(this.castNameSpan_);

  this.castCurrentSelectionSpan_ = shaka.ui.Controls.createHTMLElement_('span');
  this.castCurrentSelectionSpan_.classList.add('shaka-current-selection-span');
  label.appendChild(this.castCurrentSelectionSpan_);
  this.castButton_.appendChild(label);
  this.overflowMenu_.appendChild(this.castButton_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addRewindButton_ = function() {
  this.rewindButton_ = shaka.ui.Controls.createHTMLElement_('button');
  this.rewindButton_.classList.add('shaka-rewind-button');
  this.rewindButton_.classList.add('material-icons');
  this.rewindButton_.textContent =
    shaka.ui.Controls.MaterialDesignIcons_.REWIND;
  this.controlsButtonPanel_.appendChild(this.rewindButton_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addFastForwardButton_ = function() {
  this.fastForwardButton_ = shaka.ui.Controls.createHTMLElement_('button');
  this.fastForwardButton_.classList.add('shaka-fast-forward-button');
  this.fastForwardButton_.classList.add('material-icons');
  this.fastForwardButton_.textContent =
    shaka.ui.Controls.MaterialDesignIcons_.FAST_FORWARD;
  this.controlsButtonPanel_.appendChild(this.fastForwardButton_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addResolutionMenu_ = function() {
  this.resolutionMenu_ = shaka.ui.Controls.createHTMLElement_('div');
  this.resolutionMenu_.classList.add('shaka-resolutions');
  this.resolutionMenu_.classList.add('shaka-no-propagation');
  this.resolutionMenu_.classList.add('shaka-show-controls-on-mouse-over');
  this.resolutionMenu_.classList.add('shaka-settings-menu');

  this.backFromResolutionButton_ =
    shaka.ui.Controls.createHTMLElement_('button');
  this.backFromResolutionButton_.classList.add('shaka-back-to-overflow-button');
  this.resolutionMenu_.appendChild(this.backFromResolutionButton_);

  const backIcon = shaka.ui.Controls.createHTMLElement_('i');
  backIcon.classList.add('material-icons');
  backIcon.textContent = shaka.ui.Controls.MaterialDesignIcons_.BACK;
  this.backFromResolutionButton_.appendChild(backIcon);

  this.backFromResolutionSpan_ = shaka.ui.Controls.createHTMLElement_('span');
  this.backFromResolutionButton_.appendChild(this.backFromResolutionSpan_);


  // Add the abr option
  const auto = shaka.ui.Controls.createHTMLElement_('button');
  auto.setAttribute('aria-selected', 'true');
  this.resolutionMenu_.appendChild(auto);

  const chosenIcon = shaka.ui.Controls.createHTMLElement_('i');
  chosenIcon.classList.add('material-icons');
  chosenIcon.classList.add('shaka-chosen-item');
  chosenIcon.textContent = shaka.ui.Controls.MaterialDesignIcons_.CHECKMARK;
  // Screen reader should ignore the checkmark.
  chosenIcon.setAttribute('aria-hidden', 'true');
  auto.appendChild(chosenIcon);

  this.abrOnSpan_ = shaka.ui.Controls.createHTMLElement_('span');
  this.abrOnSpan_.classList.add('shaka-auto-span');
  auto.appendChild(this.abrOnSpan_);

  this.controlsContainer_.appendChild(this.resolutionMenu_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addResolutionButton_ = function() {
  this.resolutionButton_ = shaka.ui.Controls.createHTMLElement_('button');

  this.resolutionButton_.classList.add('shaka-resolution-button');

  const icon = shaka.ui.Controls.createHTMLElement_('i');
  icon.classList.add('material-icons');
  icon.textContent = shaka.ui.Controls.MaterialDesignIcons_.RESOLUTION;
  this.resolutionButton_.appendChild(icon);

  const label = shaka.ui.Controls.createHTMLElement_('label');
  label.classList.add('shaka-overflow-button-label');
  this.resolutionNameSpan_ = shaka.ui.Controls.createHTMLElement_('span');
  label.appendChild(this.resolutionNameSpan_);

  this.currentResolution_ = shaka.ui.Controls.createHTMLElement_('span');
  this.currentResolution_.classList.add('shaka-current-selection-span');
  label.appendChild(this.currentResolution_);
  this.resolutionButton_.appendChild(label);

  this.overflowMenu_.appendChild(this.resolutionButton_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addAudioLangMenu_ = function() {
  this.audioLangMenu_ = shaka.ui.Controls.createHTMLElement_('div');
  this.audioLangMenu_.classList.add('shaka-audio-languages');
  this.audioLangMenu_.classList.add('shaka-no-propagation');
  this.audioLangMenu_.classList.add('shaka-show-controls-on-mouse-over');
  this.audioLangMenu_.classList.add('shaka-settings-menu');

  this.backFromLanguageButton_ = shaka.ui.Controls.createHTMLElement_('button');
  this.backFromLanguageButton_.classList.add('shaka-back-to-overflow-button');
  this.audioLangMenu_.appendChild(this.backFromLanguageButton_);

  const backIcon = shaka.ui.Controls.createHTMLElement_('i');
  backIcon.classList.add('material-icons');
  backIcon.textContent = shaka.ui.Controls.MaterialDesignIcons_.BACK;
  this.backFromLanguageButton_.appendChild(backIcon);

  this.backFromLanguageSpan_ = shaka.ui.Controls.createHTMLElement_('span');
  this.backFromLanguageButton_.appendChild(this.backFromLanguageSpan_);

  this.controlsContainer_.appendChild(this.audioLangMenu_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addLanguagesButton_ = function() {
  this.languagesButton_ = shaka.ui.Controls.createHTMLElement_('button');
  this.languagesButton_.classList.add('shaka-language-button');

  const icon = shaka.ui.Controls.createHTMLElement_('i');
  icon.classList.add('material-icons');
  icon.textContent = shaka.ui.Controls.MaterialDesignIcons_.LANGUAGE;
  this.languagesButton_.appendChild(icon);

  const label = shaka.ui.Controls.createHTMLElement_('label');
  label.classList.add('shaka-overflow-button-label');
  this.languageNameSpan_ = shaka.ui.Controls.createHTMLElement_('span');
  this.languageNameSpan_.classList.add('languageSpan');
  label.appendChild(this.languageNameSpan_);

  this.currentAudioLanguage_ = shaka.ui.Controls.createHTMLElement_('span');
  this.currentAudioLanguage_.classList.add('shaka-current-selection-span');
  const language = this.player_.getConfiguration().preferredAudioLanguage;
  this.setChosenLanguageName_(this.currentAudioLanguage_, language);
  label.appendChild(this.currentAudioLanguage_);

  this.languagesButton_.appendChild(label);

  this.overflowMenu_.appendChild(this.languagesButton_);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.addPipButton_ = function() {
  this.pipButton_ = shaka.ui.Controls.createHTMLElement_('button');

  this.pipIcon_ = shaka.ui.Controls.createHTMLElement_('i');
  this.pipIcon_.classList.add('material-icons');
  // This text content is actually a material design icon.
  // DO NOT LOCALIZE
  this.pipIcon_.textContent = shaka.ui.Controls.MaterialDesignIcons_.PIP;
  this.pipButton_.appendChild(this.pipIcon_);

  const label = shaka.ui.Controls.createHTMLElement_('label');
  label.classList.add('shaka-overflow-button-label');
  this.pipNameSpan_ = shaka.ui.Controls.createHTMLElement_('span');
  // TODO: localize
  this.pipNameSpan_.textContent = 'Picture-in-picture';
  label.appendChild(this.pipNameSpan_);

  this.currentPipState_ = shaka.ui.Controls.createHTMLElement_('span');
  this.currentPipState_.classList.add('shaka-current-selection-span');
  // TODO: localize
  this.currentPipState_.textContent = 'Off';
  label.appendChild(this.currentPipState_);

  this.pipButton_.appendChild(label);

  this.overflowMenu_.appendChild(this.pipButton_);

  // Don't display the button if PiP is not supported or not allowed
  // TODO: Can this ever change? Is it worth creating the button if the below
  // condition is true?
  if (!this.isPipAllowed_()) {
    shaka.ui.Controls.setDisplay_(this.pipButton_, false);
  }
};


/**
 * @return {boolean}
 * @private
 */
shaka.ui.Controls.prototype.isPipAllowed_ = function() {
  return document.pictureInPictureEnabled &&
      !this.video_.disablePictureInPicture;
};


/**
 * @param {!Element} element
 * @param {string} language
 * @private
 */
shaka.ui.Controls.prototype.setChosenLanguageName_ =
  function(element, language) {
  if (language.length) {
    let languageName;
    if (mozilla.LanguageMapping[language]) {
      languageName = mozilla.LanguageMapping[language].nativeName;
    } else {
      // We don't know this language
      languageName = this.localization_.resolve(
        shaka.ui.Controls.resolveSpecialLanguageCode_(language));
    }
    element.textContent = languageName;
  }
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
    shaka.ui.Controls.setDisplay_(
      this.controlsButtonPanel_.parentElement, true);
    this.video_.controls = false;
  } else {
    shaka.ui.Controls.setDisplay_(
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
  this.video_.controls = enabled;

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
 * When a mobile device is rotated to landscape layout, and the video is loaded,
 * make the demo app go into fullscreen.
 * Similarly, exit fullscreen when the device is rotated to portrait layout.
 * @private
 */
shaka.ui.Controls.prototype.onScreenRotation_ = function() {
  if (!this.video_ ||
      this.video_.readyState == 0 ||
      this.castProxy_.isCasting()) return;

  if (screen.orientation.type.includes('landscape') &&
      !document.fullscreenElement) {
    this.videoContainer_.requestFullscreen();
  } else if (screen.orientation.type.includes('portrait') &&
      document.fullscreenElement) {
    document.exitFullscreen();
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
  this.setControlsOpacity_(shaka.ui.Controls.Opacity_.OPAQUE);
  this.hideSettingsMenusTimer_.cancel();
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
    this.setControlsOpacity_(shaka.ui.Controls.Opacity_.OPAQUE);
  } else {
    this.setControlsOpacity_(shaka.ui.Controls.Opacity_.TRANSPARENT);
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

  // If the overflow menu is showing, hide it on a touch event
  if (this.overflowMenu_.classList.contains('shaka-displayed')) {
    shaka.ui.Controls.setDisplay_(this.overflowMenu_, false);
    // Stop this event from becoming a click event.
    event.preventDefault();
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

  if (this.anySettingsMenusAreOpen_()) {
    this.hideSettingsMenus_();
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
  this.trickPlayRate_ = 1;

  if (this.video_.paused) {
    this.video_.play();
  } else {
    this.video_.pause();
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

  const Controls = shaka.ui.Controls;
  // Video is paused during seek, so don't show the play arrow while seeking:
  if (this.enabled_ && this.video_.paused && !this.isSeeking_) {
    this.playButton_.setAttribute('icon', 'play');
    this.playButton_.setAttribute(Controls.ARIA_LABEL_,
      this.localization_.resolve(shaka.ui.Locales.Ids.ARIA_LABEL_PLAY));
  } else {
    this.playButton_.setAttribute('icon', 'pause');
    this.playButton_.setAttribute(Controls.ARIA_LABEL_,
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


/** @private */
shaka.ui.Controls.prototype.onMuteButtonClick_ = function() {
  if (!this.enabled_) return;

  this.video_.muted = !this.video_.muted;
};


/**
 * Updates the controls to reflect volume changes.
 * @private
 */
shaka.ui.Controls.prototype.onVolumeStateChange_ = function() {
  const Controls = shaka.ui.Controls;
  if (this.video_.muted) {
    if (this.muteButton_) {
      this.muteButton_.textContent =
        shaka.ui.Controls.MaterialDesignIcons_.UNMUTE;
      this.muteButton_.setAttribute(Controls.ARIA_LABEL_,
        this.localization_.resolve(shaka.ui.Locales.Ids.ARIA_LABEL_UNMUTE));
    }
    if (this.volumeBar_) {
      this.volumeBar_.value = 0;
    }
  } else {
    if (this.muteButton_) {
      this.muteButton_.textContent =
        shaka.ui.Controls.MaterialDesignIcons_.MUTE;
      this.muteButton_.setAttribute(Controls.ARIA_LABEL_,
        this.localization_.resolve(shaka.ui.Locales.Ids.ARIA_LABEL_MUTE));
    }
    if (this.volumeBar_) {
      this.volumeBar_.value = this.video_.volume;
    }
  }

  if (this.volumeBar_) {
    let gradient = ['to right'];
    gradient.push(shaka.ui.Controls.VOLUME_BAR_VOLUME_LEVEL_COLOR_ +
                 (this.volumeBar_.value * 100) + '%');
    gradient.push(shaka.ui.Controls.VOLUME_BAR_BASE_COLOR_ +
                 (this.volumeBar_.value * 100) + '%');
    gradient.push(shaka.ui.Controls.VOLUME_BAR_BASE_COLOR_ + '100%');
    this.volumeBar_.style.background =
        'linear-gradient(' + gradient.join(',') + ')';
  }
};


/** @private */
shaka.ui.Controls.prototype.onVolumeInput_ = function() {
  this.video_.volume = parseFloat(this.volumeBar_.value);
  if (this.video_.volume == 0) {
    this.video_.muted = true;
  } else {
    this.video_.muted = false;
  }
};


/** @private */
shaka.ui.Controls.prototype.onCaptionClick_ = function() {
  if (!this.enabled_) return;

  shaka.ui.Controls.setDisplay_(this.overflowMenu_, false);
  shaka.ui.Controls.setDisplay_(this.textLangMenu_, true);
  // Focus on the currently selected language button.
  this.focusOnTheChosenItem_(this.textLangMenu_);
};


/** @private */
shaka.ui.Controls.prototype.onResolutionClick_ = function() {
  if (!this.enabled_) return;
  shaka.ui.Controls.setDisplay_(this.overflowMenu_, false);
  shaka.ui.Controls.setDisplay_(this.resolutionMenu_, true);
  // Focus on the currently selected resolution button.
  this.focusOnTheChosenItem_(this.resolutionMenu_);
};


/** @private */
shaka.ui.Controls.prototype.onLanguagesClick_ = function() {
  if (!this.enabled_) return;
  shaka.ui.Controls.setDisplay_(this.overflowMenu_, false);
  shaka.ui.Controls.setDisplay_(this.audioLangMenu_, true);
  // Focus on the currently selected language button.
  this.focusOnTheChosenItem_(this.audioLangMenu_);
};


/** @private */
shaka.ui.Controls.prototype.onTracksChange_ = function() {
  // TS content might have captions embedded in video stream, we can't know
  // until we start transmuxing. So, always show caption button if we're
  // playing TS content.
  if (this.captionButton_) {
    if (shaka.ui.Utils.isTsContent(this.player_)) {
      shaka.ui.Controls.setDisplay_(this.captionButton_, true);
    } else {
      let hasText = this.player_.getTextTracks().length;
      shaka.ui.Controls.setDisplay_(this.captionButton_, hasText > 0);
    }
  }

  // Update language and resolution selections
  this.updateResolutionSelection_();
  this.updateAudioLanguages_();
  this.updateTextLanguages_();
};


/** @private */
shaka.ui.Controls.prototype.onVariantChange_ = function() {
  // Update language and resolution selections
  this.updateResolutionSelection_();
  this.updateAudioLanguages_();
};


/** @private */
shaka.ui.Controls.prototype.updateResolutionSelection_ = function() {
  // Only applicable if resolution button is a part of the UI
  if (!this.resolutionButton_ || !this.resolutionMenu_) {
    return;
  }

  let tracks = this.player_.getVariantTracks();
  // Hide resolution menu and button for audio-only content.
  if (tracks.length && !tracks[0].height) {
    shaka.ui.Controls.setDisplay_(this.resolutionMenu_, false);
    shaka.ui.Controls.setDisplay_(this.resolutionButton_, false);
    return;
  }
  tracks.sort(function(t1, t2) {
    return t1.height - t2.height;
  });
  tracks.reverse();

  // If there is a selected variant track, then we filtering out any tracks in
  // a different language.  Then we use those remaining tracks to display the
  // available resolutions.
  const selectedTrack = tracks.find((track) => track.active);
  if (selectedTrack) {
    const language = selectedTrack.language;
    // Filter by current audio language.
    tracks = tracks.filter(function(track) {
      return track.language == language;
    });
  }

  // Remove old shaka-resolutions
  // 1. Save the back to menu button
  const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
      this.resolutionMenu_, 'shaka-back-to-overflow-button');

  // 2. Remove everything
  while (this.resolutionMenu_.firstChild) {
    this.resolutionMenu_.removeChild(this.resolutionMenu_.firstChild);
  }

  // 3. Add the backTo Menu button back
  this.resolutionMenu_.appendChild(backButton);

  const abrEnabled = this.player_.getConfiguration().abr.enabled;

  // Add new ones
  tracks.forEach((track) => {
    let button = shaka.ui.Controls.createHTMLElement_('button');
    button.classList.add('explicit-resolution');
    button.addEventListener('click',
        this.onTrackSelected_.bind(this, track));

    let span = shaka.ui.Controls.createHTMLElement_('span');
    span.textContent = track.height + 'p';
    button.appendChild(span);

    if (!abrEnabled && track == selectedTrack) {
      // If abr is disabled, mark the selected track's
      // resolution.
      button.setAttribute('aria-selected', 'true');
      button.appendChild(this.chosenIcon_());
      span.classList.add('shaka-chosen-item');
      this.currentResolution_.textContent = span.textContent;
    }
    this.resolutionMenu_.appendChild(button);
  });

  // Add the Auto button
  let autoButton = shaka.ui.Controls.createHTMLElement_('button');
  autoButton.addEventListener('click', function() {
    let config = {abr: {enabled: true}};
    this.player_.configure(config);
    this.updateResolutionSelection_();
  }.bind(this));

  let autoSpan = shaka.ui.Controls.createHTMLElement_('span');
  autoSpan.textContent =
    this.localization_.resolve(shaka.ui.Locales.Ids.LABEL_AUTO_QUALITY);
  autoButton.appendChild(autoSpan);

  // If abr is enabled reflect it by marking 'Auto'
  // as selected.
  if (abrEnabled) {
    autoButton.setAttribute('aria-selected', 'true');
    autoButton.appendChild(this.chosenIcon_());

    autoSpan.classList.add('shaka-chosen-item');

    this.currentResolution_.textContent =
      this.localization_.resolve(shaka.ui.Locales.Ids.LABEL_AUTO_QUALITY);
  }

  this.resolutionMenu_.appendChild(autoButton);
  this.focusOnTheChosenItem_(this.resolutionMenu_);
};


/** @private */
shaka.ui.Controls.prototype.updateAudioLanguages_ = function() {
  // Only applicable if language button is a part of the UI
  if (!this.languagesButton_ ||
      !this.audioLangMenu_ || !this.currentAudioLanguage_) {
    return;
  }

  const tracks = this.player_.getVariantTracks();

  const languagesAndRoles = this.player_.getAudioLanguagesAndRoles();
  const languages = languagesAndRoles.map((langAndRole) => {
    return langAndRole.language;
  });

  this.updateLanguages_(tracks, this.audioLangMenu_, languages,
    this.onAudioLanguageSelected_, /* updateChosen */ true,
    this.currentAudioLanguage_);
  this.focusOnTheChosenItem_(this.audioLangMenu_);
};


/** @private */
shaka.ui.Controls.prototype.updateTextLanguages_ = function() {
  // Only applicable if captions button is a part of the UI
  if (!this.captionButton_ || !this.textLangMenu_ ||
      !this.currentCaptions_) {
    return;
  }

  const tracks = this.player_.getTextTracks();

  const languagesAndRoles = this.player_.getTextLanguagesAndRoles();
  const languages = languagesAndRoles.map((langAndRole) => {
    return langAndRole.language;
  });

  this.updateLanguages_(tracks, this.textLangMenu_, languages,
    this.onTextLanguageSelected_,
    /* Don't mark current text language as chosen unless captions are enabled */
    this.player_.isTextTrackVisible(),
    this.currentCaptions_);

  // Add the Off button
  let offButton = shaka.ui.Controls.createHTMLElement_('button');
  offButton.addEventListener('click', () => {
    this.player_.setTextTrackVisibility(false);
    this.updateTextLanguages_();
  });

  offButton.appendChild(this.captionsOffSpan_);

  this.textLangMenu_.appendChild(offButton);

  if (!this.player_.isTextTrackVisible()) {
    offButton.setAttribute('aria-selected', 'true');
    offButton.appendChild(this.chosenIcon_());
    this.captionsOffSpan_.classList.add('shaka-chosen-item');
    this.currentCaptions_.textContent =
        this.localization_.resolve(shaka.ui.Locales.Ids.LABEL_CAPTIONS_OFF);
  }

  this.focusOnTheChosenItem_(this.textLangMenu_);
};


/**
 * @param {!Array.<shaka.extern.Track>} tracks
 * @param {!HTMLElement} langMenu
 * @param {!Array.<string>} languages
 * @param {function(string)} onLanguageSelected
 * @param {boolean} updateChosen
 * @param {!HTMLElement} currentSelectionElement
 * @private
 */
shaka.ui.Controls.prototype.updateLanguages_ = function(tracks, langMenu,
  languages, onLanguageSelected, updateChosen, currentSelectionElement) {
  // Using array.filter(f)[0] as an alternative to array.find(f) which is
  // not supported in IE11.
  const activeTracks = tracks.filter(function(track) {
    return track.active == true;
  });
  const selectedTrack = activeTracks[0];

  // Remove old languages
  // 1. Save the back to menu button
  const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
    langMenu, 'shaka-back-to-overflow-button');

  // 2. Remove everything
  while (langMenu.firstChild) {
    langMenu.removeChild(langMenu.firstChild);
  }

  // 3. Add the backTo Menu button back
  langMenu.appendChild(backButton);

  // 4. Add new buttons
  languages.forEach((language) => {
    let button = shaka.ui.Controls.createHTMLElement_('button');
    button.addEventListener('click', onLanguageSelected.bind(this, language));

    let span = shaka.ui.Controls.createHTMLElement_('span');
    this.setChosenLanguageName_(span, language);
    button.appendChild(span);

    if (updateChosen && (language == selectedTrack.language)) {
      button.appendChild(this.chosenIcon_());
      span.classList.add('shaka-chosen-item');
      button.setAttribute('aria-selected', 'true');
      currentSelectionElement.textContent = span.textContent;
    }
    langMenu.appendChild(button);
  });
};


/**
 * @param {!shaka.extern.Track} track
 * @private
 */
shaka.ui.Controls.prototype.onTrackSelected_ = function(track) {
  // Disable abr manager before changing tracks.
  let config = {abr: {enabled: false}};
  this.player_.configure(config);

  this.player_.selectVariantTrack(track, /* clearBuffer */ true);
};


/**
 * @param {string} language
 * @private
 */
shaka.ui.Controls.prototype.onAudioLanguageSelected_ = function(language) {
  this.player_.selectAudioLanguage(language);
};


/**
 * @param {string} language
 * @return {!Promise}
 * @private
 */
shaka.ui.Controls.prototype.onTextLanguageSelected_ = async function(language) {
  await this.player_.setTextTrackVisibility(true);
  this.player_.selectTextLanguage(language);
};


/**
 * @param {HTMLElement} menu
 * @private
 */
shaka.ui.Controls.prototype.focusOnTheChosenItem_ = function(menu) {
  if (!menu) return;
  const chosenItem = shaka.ui.Utils.getDescendantIfExists(
    menu, 'shaka-chosen-item');
  if (chosenItem) {
    chosenItem.parentElement.focus();
  }
};


/**
 * @return {!Element}
 * @private
 */
shaka.ui.Controls.prototype.chosenIcon_ = function() {
  let chosenIcon = shaka.ui.Controls.createHTMLElement_('i');
  chosenIcon.classList.add('material-icons');
  chosenIcon.textContent = shaka.ui.Controls.MaterialDesignIcons_.CHECKMARK;
  // Screen reader should ignore 'done'.
  chosenIcon.setAttribute('aria-hidden', 'true');
  return chosenIcon;
};


/** @private */
shaka.ui.Controls.prototype.onCaptionStateChange_ = function() {
  if (this.captionIcon_) {
    if (this.player_.isTextTrackVisible()) {
      this.captionIcon_.classList.add('shaka-captions-on');
      this.captionIcon_.classList.remove('shaka-captions-off');
    } else {
      this.captionIcon_.classList.add('shaka-captions-off');
      this.captionIcon_.classList.remove('shaka-captions-on');
    }
  }
};


/** @private */
shaka.ui.Controls.prototype.onFullscreenClick_ = async function() {
  if (!this.enabled_) return;

  const Controls = shaka.ui.Controls;
  const LocIds = shaka.ui.Locales.Ids;
  if (document.fullscreenElement) {
    document.exitFullscreen();
    this.fullscreenButton_.textContent =
      shaka.ui.Controls.MaterialDesignIcons_.FULLSCREEN;
    this.fullscreenButton_.setAttribute(Controls.ARIA_LABEL_,
      this.localization_.resolve(LocIds.ARIA_LABEL_FULL_SCREEN));
  } else {
    await this.videoContainer_.requestFullscreen();
    this.fullscreenButton_.textContent =
      shaka.ui.Controls.MaterialDesignIcons_.EXIT_FULLSCREEN;
    this.fullscreenButton_.setAttribute(Controls.ARIA_LABEL_,
      this.localization_.resolve(LocIds.ARIA_LABEL_EXIT_FULL_SCREEN));
  }
};


/** @private */
shaka.ui.Controls.prototype.onCurrentTimeClick_ = function() {
  if (!this.enabled_) return;

  // Jump to LIVE if the user clicks on the current time.
  if (this.player_.isLive() && this.seekBar_) {
    this.video_.currentTime = Number(this.seekBar_.max);
  }
};


/**
 * Cycles trick play rate between -1, -2, -4, and -8.
 * @private
 */
shaka.ui.Controls.prototype.onRewindClick_ = function() {
  if (!this.enabled_) return;

  if (!this.video_.duration) {
    return;
  }

  this.trickPlayRate_ = (this.trickPlayRate_ > 0 || this.trickPlayRate_ < -4) ?
      -1 : this.trickPlayRate_ * 2;
  this.player_.trickPlay(this.trickPlayRate_);
};


/**
 * Cycles trick play rate between 1, 2, 4, and 8.
 * @private
 */
shaka.ui.Controls.prototype.onFastForwardClick_ = function() {
  if (!this.enabled_) return;

  if (!this.video_.duration) {
    return;
  }

  this.trickPlayRate_ = (this.trickPlayRate_ < 0 || this.trickPlayRate_ > 4) ?
      1 : this.trickPlayRate_ * 2;
  this.player_.trickPlay(this.trickPlayRate_);
};


/** @private */
shaka.ui.Controls.prototype.onCastClick_ = async function() {
  if (!this.enabled_) return;

  if (this.castProxy_.isCasting()) {
    this.castProxy_.suggestDisconnect();
  } else {
    this.castButton_.disabled = true;
    this.castProxy_.cast().then(function() {
      this.castButton_.disabled = false;
      // Success!
    }.bind(this), function(error) {
      this.castButton_.disabled = false;
      if (error.code != shaka.util.Error.Code.CAST_CANCELED_BY_USER) {
        this.dispatchEvent(new shaka.util.FakeEvent('error', {
          errorDetails: error,
        }));
      }
    }.bind(this));

    // If we're in picture-in-picture state, exit
    if (document.pictureInPictureElement && this.pipButton_ != null) {
      await this.onPipClick_();
    }
  }
};


/**
 * @return {!Promise}
 * @private
 */
shaka.ui.Controls.prototype.onPipClick_ = async function() {
  if (!this.enabled_) {
    return;
  }

  try {
    if (!document.pictureInPictureElement) {
      await this.video_.requestPictureInPicture();
    } else {
      await document.exitPictureInPicture();
    }
  } catch (error) {
    this.dispatchEvent(new shaka.util.FakeEvent('error', {
      errorDetails: error,
    }));
  }
};


/** @private */
shaka.ui.Controls.prototype.onEnterPictureInPicture_ = function() {
  if (!this.enabled_) {
    return;
  }

  const Controls = shaka.ui.Controls;
  this.pipIcon_.textContent = Controls.MaterialDesignIcons_.EXIT_PIP;
  // TODO: localize
  this.pipButton_.setAttribute(Controls.ARIA_LABEL_,
      'exit picture in picture mode');
  this.currentPipState_.textContent = 'On';
};


/** @private */
shaka.ui.Controls.prototype.onLeavePictureInPicture_ = function() {
  if (!this.enabled_) {
    return;
  }

  const Controls = shaka.ui.Controls;
  this.pipIcon_.textContent = Controls.MaterialDesignIcons_.PIP;
  // TODO: localize
  this.pipButton_.setAttribute(Controls.ARIA_LABEL_,
      'enter picture in picture mode');
  this.currentPipState_.textContent = 'Off';
};


/** @private */
shaka.ui.Controls.prototype.onOverflowMenuButtonClick_ = function() {
  if (this.anySettingsMenusAreOpen_()) {
    this.hideSettingsMenus_();
  } else {
    shaka.ui.Controls.setDisplay_(this.overflowMenu_, true);
    this.overrideCssShowControls_ = true;
    // If overflow menu has currently visible buttons, focus on the
    // first one, when the menu opens.
    const isDisplayed = function(element) {
      return element.classList.contains('shaka-hidden') == false;
    };

    const Iterables = shaka.util.Iterables;
    if (Iterables.some(this.overflowMenu_.childNodes, isDisplayed)) {
      // Focus on the first visible child of the overflow menu
      const visibleElements =
        Iterables.filter(this.overflowMenu_.childNodes, isDisplayed);
      /** @type {!HTMLElement} */ (visibleElements[0]).focus();
    }
  }
};


/**
 * @param {Event} event
 * @private
 */
shaka.ui.Controls.prototype.onCastStatusChange_ = function(event) {
  const canCast = this.castProxy_.canCast() && this.castAllowed_;
  const isCasting = this.castProxy_.isCasting();
  this.dispatchEvent(new shaka.util.FakeEvent('caststatuschanged', {
    newStatus: isCasting,
  }));

  if (this.castButton_) {
    const materialDesignIcons = shaka.ui.Controls.MaterialDesignIcons_;
    shaka.ui.Controls.setDisplay_(this.castButton_, canCast);
    this.castIcon_.textContent = isCasting ?
                                 materialDesignIcons.EXIT_CAST :
                                 materialDesignIcons.CAST;

    // Aria-pressed set to true when casting, set to false otherwise.
    if (canCast) {
      if (isCasting) {
        this.castButton_.setAttribute('aria-pressed', 'true');
      } else {
        this.castButton_.setAttribute('aria-pressed', 'false');
      }
    }
  }

  this.setCurrentCastSelection_();

  const pipIsEnabled = (this.isPipAllowed_() && (this.pipButton_ != null));
  if (isCasting) {
    this.controlsButtonPanel_.classList.add('shaka-casting');
    // Picture-in-picture is not applicable if we're casting
    if (pipIsEnabled) {
      shaka.ui.Controls.setDisplay_(this.pipButton_, false);
    }
  } else {
    this.controlsButtonPanel_.classList.remove('shaka-casting');
    if (pipIsEnabled) {
      shaka.ui.Controls.setDisplay_(this.pipButton_, true);
    }
  }
};


/**
 * @param {!Event} event
 * @private
 */
shaka.ui.Controls.prototype.onBufferingStateChange_ = function(event) {
  // Using [] notation to access buffering property to work around
  // a compiler error.
  const classToAdd = event['buffering'] ? 'shaka-displayed' : 'shaka-hidden';
  const classToRemove = event['buffering'] ? 'shaka-hidden' : 'shaka-displayed';
  this.bufferingSpinner_.classList.add(classToAdd);
  this.bufferingSpinner_.classList.remove(classToRemove);
};


/**
 * @private
 */
shaka.ui.Controls.prototype.setCurrentCastSelection_ = function() {
  if (!this.castCurrentSelectionSpan_) {
    return;
  }

  if (this.castProxy_.isCasting()) {
    this.castCurrentSelectionSpan_.textContent = this.castProxy_.receiverName();
  } else {
    this.castCurrentSelectionSpan_.textContent =
        this.localization_.resolve(shaka.ui.Locales.Ids.LABEL_NOT_CASTING);
  }
};


/**
 * @return {boolean}
 * @private
 */
shaka.ui.Controls.prototype.isOpaque_ = function() {
  if (!this.enabled_) return false;

  // While you are casting, the UI is always opaque.
  if (this.castProxy_ && this.castProxy_.isCasting()) return true;

  return this.controlsContainer_.classList.contains('shaka-opaque');
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

  let Controls = shaka.ui.Controls;
  let displayTime = this.isSeeking_ ?
      Number(this.seekBar_.value) :
      Number(this.video_.currentTime);
  let duration = this.video_.duration;
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

    let showHour = seekRangeSize >= 3600;

    // Consider "LIVE" when less than 1 second behind the live-edge.  Always
    // show the full time string when seeking, including the leading '-';
    // otherwise, the time string "flickers" near the live-edge.
    if (this.currentTime_) {
      if ((displayTime >= 1) || this.isSeeking_) {
        this.currentTime_.textContent =
            '- ' + this.buildTimeString_(displayTime, showHour);
        this.currentTime_.style.cursor = 'pointer';
      } else {
        this.currentTime_.textContent =
          this.localization_.resolve(shaka.ui.Locales.Ids.LABEL_LIVE);
        this.currentTime_.style.cursor = '';
      }
    }


    if (!this.isSeeking_ && this.seekBar_) {
      this.seekBar_.value = seekRange.end - displayTime;
    }
  } else {
    let showHour = duration >= 3600;

    if (this.currentTime_) {
      this.currentTime_.textContent =
      this.buildTimeString_(displayTime, showHour);
    }


    if (duration && this.currentTime_) {
      this.currentTime_.textContent += ' / ' +
          this.buildTimeString_(duration, showHour);
    }

    if (!this.isSeeking_ && this.seekBar_) {
      this.seekBar_.value = displayTime;
    }

    if (this.currentTime_) {
      this.currentTime_.style.cursor = '';
    }
  }

  if (this.seekBar_) {
    // Hide seekbar seek window is very small.
    const seekRange = this.player_.seekRange();
    const seekWindow = seekRange.end - seekRange.start;
    if (seekWindow < shaka.ui.Controls.MIN_SEEK_WINDOW_TO_SHOW_SEEKBAR_ ) {
      this.seekBar_.classList.add('shaka-hidden');
      for (let menu of this.settingsMenus_) {
        menu.classList.add('shaka-low-position');
      }
    } else {
      // Removing a non-existent class doesn't throw, so, even if
      // the element is not hidden, this should be fine.
      this.seekBar_.classList.remove('shaka-hidden');
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

        gradient.push(Controls.SEEK_BAR_BASE_COLOR_ + ' ' +
                     (bufferStartFraction * 100) + '%');
        gradient.push(Controls.SEEK_BAR_PLAYED_COLOR_ + ' ' +
                     (bufferStartFraction * 100) + '%');
        gradient.push(Controls.SEEK_BAR_PLAYED_COLOR_ + ' ' +
                     (playheadFraction * 100) + '%');
        gradient.push(Controls.SEEK_BAR_BUFFERED_COLOR_ + ' ' +
                     (playheadFraction * 100) + '%');
        gradient.push(Controls.SEEK_BAR_BUFFERED_COLOR_ + ' ' +
                     (bufferEndFraction * 100) + '%');
        gradient.push(Controls.SEEK_BAR_BASE_COLOR_ + ' ' +
                     (bufferEndFraction * 100) + '%');
      }
      this.seekBar_.style.background =
          'linear-gradient(' + gradient.join(',') + ')';
    }
  }
};


/**
 * Builds a time string, e.g., 01:04:23, from |displayTime|.
 *
 * @param {number} displayTime
 * @param {boolean} showHour
 * @return {string}
 * @private
 */
shaka.ui.Controls.prototype.buildTimeString_ = function(displayTime, showHour) {
  let h = Math.floor(displayTime / 3600);
  let m = Math.floor((displayTime / 60) % 60);
  let s = Math.floor(displayTime % 60);
  if (s < 10) s = '0' + s;
  let text = m + ':' + s;
  if (showHour) {
    if (m < 10) text = '0' + text;
    text = h + ':' + text;
  }
  return text;
};


/**
 * @private
 */
shaka.ui.Controls.prototype.resizePlayButtonAndSpinner_ = function() {
  // Play button size depends on the video dimensions and is
  // calculated by taking the max of the smallest size we allow
  // and the black magic Chrome designers came up with aka
  // take min(video.width, video.height) and multiply it by a
  // pre-determined ratio, depending on how big the video is.
  const Controls = shaka.ui.Controls;
  const width = this.video_.clientWidth;
  const height = this.video_.clientHeight;
  let sizingRatio = Controls.LARGE_PLAY_BUTTON_SIZE_RATIO_;
  if (width < Controls.SIZING_MEDIUM_THRESHHOLD_) {
    sizingRatio = Controls.SMALL_PLAY_BUTTON_SIZE_RATIO_;
  } else if (width < Controls.SIZING_LARGE_THRESHHOLD_) {
    sizingRatio = Controls.MEDIUM_PLAY_BUTTON_SIZE_RATIO_;
  }

  const minDimention = Math.min(width, height);
  const playButtonSize =
    Math.max(Controls.MIN_PLAY_BUTTON_WIDTH_, minDimention * sizingRatio);

  this.playButton_.style.width = playButtonSize + 'px';
  this.playButton_.style.height = playButtonSize + 'px';

  // The spinner-to-button ratio is b/a+b = c where a is the play button
  // size, b is the spinner size and c is equal to BUFFERING_SPINNER_DELIMETER_.
  const delimeter = Controls.BUFFERING_SPINNER_DELIMETER_;
  const spinnerSize = (playButtonSize * delimeter) / (1 - delimeter);
  this.spinnerSvg_.style.width = spinnerSize + 'px';
  this.spinnerSvg_.style.height = spinnerSize + 'px';
};


/**
 * Adds class for keyboard navigation if tab was pressed.
 *
 * @param {!Event} event
 * @private
 */
shaka.ui.Controls.prototype.onKeyDown_ = function(event) {
  if (event.keyCode == shaka.ui.Controls.KEYCODE_TAB_) {
    // Enable blue outline for focused elements for keyboard
    // navigation.
    this.controlsContainer_.classList.add('shaka-keyboard-navigation');
    this.eventManager_.listen(window, 'mousedown',
                              this.onMouseDown_.bind(this));
  } else if (event.keyCode == shaka.ui.Controls.KEYCODE_ESCAPE_ &&
      this.anySettingsMenusAreOpen_()) {
        this.hideSettingsMenus_();
  }
};


/**
 * Removes class for keyboard navigation if mouse navigation
 * is active.
 * @private
 */
shaka.ui.Controls.prototype.onMouseDown_ = function() {
  // Disable blue outline for focused elements for mouse
  // navigation.
  this.controlsContainer_.classList.remove('shaka-keyboard-navigation');

  this.eventManager_.unlisten(window, 'mousedown');
  this.eventManager_.listen(window, 'keydown', this.onKeyDown_.bind(this));
};


/**
 * Depending on the value of display, sets/removes css class of element to
 * either display it or hide.
 *
 * @param {Element} element
 * @param {boolean} display
 * @private
 */
shaka.ui.Controls.setDisplay_ = function(element, display) {
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
 * @private
 */
shaka.ui.Controls.prototype.hideSettingsMenus_ = function() {
  for (let menu of this.settingsMenus_) {
    shaka.ui.Controls.setDisplay_(/** @type {!HTMLElement} */ (menu), false);
  }
};


/**
 * @private
 * @return {boolean}
 */
shaka.ui.Controls.prototype.anySettingsMenusAreOpen_ = function() {
  return this.settingsMenus_.some(
    (menu) => menu.classList.contains('shaka-displayed'));
};


/**
 * @param {!shaka.ui.Controls.Opacity_} opacity
 * @private
 */
shaka.ui.Controls.prototype.setControlsOpacity_ = function(opacity) {
  if (opacity == shaka.ui.Controls.Opacity_.OPAQUE) {
    this.controlsContainer_.classList.add('shaka-opaque');
    this.controlsContainer_.classList.remove('shaka-transparent');
  } else {
    this.controlsContainer_.classList.add('shaka-transparent');
    this.controlsContainer_.classList.remove('shaka-opaque');
    // If there's an overflow menu open, keep it this way for a couple of
    // seconds in case a user immidiately initiaites another mouse move to
    // interact with the menus. If that didn't happen, go ahead and hide
    // the menus.
    this.hideSettingsMenusTimer_.schedule(2);
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


/**
 * Resolve a special language code to a name/description enum.
 *
 * @param {string} lang
 * @return {string}
 */
shaka.ui.Controls.resolveSpecialLanguageCode_ = function(lang) {
  if (lang == 'mul') {
    return shaka.ui.Locales.Ids.LABEL_MULTIPLE_LANGUAGES;
  } else if (lang == 'zxx') {
    return shaka.ui.Locales.Ids.LABEL_NOT_APPLICABLE;
  } else {
    return shaka.ui.Locales.Ids.LABEL_UNKNOWN_LANGUAGE;
  }
};


/**
 * @param {string} tagName
 * @return {!HTMLElement}
 * @private
 */
shaka.ui.Controls.createHTMLElement_ = function(tagName) {
  const element =
    /** @type {!HTMLElement} */ (document.createElement(tagName));
  return element;
};


/**
 * @const {string}
 * @private
 */
shaka.ui.Controls.SEEK_BAR_BASE_COLOR_ = 'rgba(255, 255, 255, 0.3)';


/**
 * @const {string}
 * @private
 */
shaka.ui.Controls.SEEK_BAR_PLAYED_COLOR_ = 'rgb(255, 255, 255)';


/**
 * @const {string}
 * @private
 */
shaka.ui.Controls.SEEK_BAR_BUFFERED_COLOR_ = 'rgba(255, 255, 255, 0.54)';


/**
 * @const {string}
 * @private
 */
shaka.ui.Controls.VOLUME_BAR_VOLUME_LEVEL_COLOR_ = 'rgb(255, 255, 255)';


/**
 * @const {string}
 * @private
 */
shaka.ui.Controls.VOLUME_BAR_BASE_COLOR_ = 'rgba(255, 255, 255, 0.54)';


/**
 * Video width (in pixels) used for determining play button size.
 * @const {number}
 * @private
 */
shaka.ui.Controls.SIZING_MEDIUM_THRESHHOLD_ = 741;


/**
 * Video width (in pixels) used for determining play button size.
 * @const {number}
 * @private
 */
shaka.ui.Controls.SIZING_LARGE_THRESHHOLD_ = 1441;


/**
 * The ratio of width/height used for play button size.
 * (Dependant on sizing threashhold).
 * @const {number}
 * @private
 */
shaka.ui.Controls.SMALL_PLAY_BUTTON_SIZE_RATIO_ = 0.25;


/**
 * The ratio of width/height used for play button size.
 * (Dependant on sizing threashhold).
 * @const {number}
 * @private
 */
shaka.ui.Controls.MEDIUM_PLAY_BUTTON_SIZE_RATIO_ = 0.15;


/**
 * The ratio of width/height used for play button size.
 * (Dependant on sizing threashhold).
 * @const {number}
 * @private
 */
shaka.ui.Controls.LARGE_PLAY_BUTTON_SIZE_RATIO_ = 0.11;


/**
 * Minimal width (in pixels) a play button should have;
 * @const {number}
 * @private
 */
shaka.ui.Controls.MIN_PLAY_BUTTON_WIDTH_ = 48;


/**
 * @const {number}
 * @private
 */
shaka.ui.Controls.BUFFERING_SPINNER_DELIMETER_ = 0.62;


/**
 * @const {number}
 * @private
 */
shaka.ui.Controls.MIN_SEEK_WINDOW_TO_SHOW_SEEKBAR_ = 5; // seconds


/**
 * @enum {number}
 * @private
 */
shaka.ui.Controls.Opacity_ = {
  'TRANSPARENT': 0,
  'OPAQUE': 1,
};


/**
 * @const {number}
 * @private
 */
shaka.ui.Controls.KEYCODE_TAB_ = 9;


/**
 * @const {number}
 * @private
 */
shaka.ui.Controls.KEYCODE_ESCAPE_ = 27;


/** @private {!Array.<string>} */
shaka.ui.Controls.controlPanelElements_ = [
  'time_and_duration',
  'mute',
  'volume',
  'fullscreen',
  'overflow_menu',
  'rewind',
  'fast_forward',
];


/** @private {!Array.<string>} */
shaka.ui.Controls.overflowButtons_ = [
  'captions',
  'cast',
  'quality',
  'language',
  'picture_in_picture',
];


/**
 * @const {string}
 * @private
 */
shaka.ui.Controls.ARIA_LABEL_= 'aria-label';


/**
 * These strings are used to insert material design icons
 * and should never be localized.
 * @enum {string}
 * @private
 */
shaka.ui.Controls.MaterialDesignIcons_ = {
  'FULLSCREEN': 'fullscreen',
  'EXIT_FULLSCREEN': 'fullscreen_exit',
  'CLOSED_CAPTIONS': 'closed_caption',
  'CHECKMARK': 'done',
  'LANGUAGE': 'language',
  'PIP': 'picture_in_picture_alt',
  // 'branding_watermark' material icon looks like a "dark version"
  // of the p-i-p icon. We use "dark version" icons to signal that the
  // feature is turned on.
  'EXIT_PIP': 'branding_watermark',
  'BACK': 'arrow_back',
  'RESOLUTION': 'settings',
  'MUTE': 'volume_up',
  'UNMUTE': 'volume_off',
  'CAST': 'cast',
  'EXIT_CAST': 'cast_connected',
  'OPEN_OVERFLOW': 'more_vert',
  'REWIND': 'fast_rewind',
  'FAST_FORWARD': 'fast_forward',
};
