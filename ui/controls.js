/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.Controls');
goog.provide('shaka.ui.ControlsPanel');

goog.require('goog.asserts');
goog.require('shaka.ads.AdManager');
goog.require('shaka.cast.CastProxy');
goog.require('shaka.log');
goog.require('shaka.ui.AdCounter');
goog.require('shaka.ui.AdPosition');
goog.require('shaka.ui.BigPlayButton');
goog.require('shaka.ui.ContextMenu');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.SeekBar');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Timer');

goog.requireType('shaka.Player');


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

    /** @private {shaka.extern.UIConfiguration} */
    this.config_ = config;

    /** @private {shaka.cast.CastProxy} */
    this.castProxy_ = new shaka.cast.CastProxy(
        video, player, this.config_.castReceiverAppId,
        this.config_.castAndroidReceiverCompatible);

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

    /** @private {shaka.extern.IAdManager} */
    this.adManager_ = this.player_.getAdManager();

    /** @private {?shaka.extern.IAd} */
    this.ad_ = null;

    /** @private {?shaka.extern.IUISeekBar} */
    this.seekBar_ = null;

    /** @private {boolean} */
    this.isSeeking_ = false;

    /** @private {!Array.<!HTMLElement>} */
    this.menus_ = [];

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
     * and we should fade out the ui.
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
      for (const menu of this.menus_) {
        shaka.ui.Utils.setDisplay(menu, /* visible= */ false);
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
      if (this.isOpaque()) {
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
     * @private {!Set.<string>}
     */
    this.pressedKeys_ = new Set();

    // We might've missed a caststatuschanged event from the proxy between
    // the controls creation and initializing. Run onCastStatusChange_()
    // to ensure we have the casting state right.
    this.onCastStatusChange_();

    // Start this timer after we are finished initializing everything,
    this.timeAndSeekRangeTimer_.tickEvery(/* seconds= */ 0.125);

    this.eventManager_.listen(this.localization_,
        shaka.ui.Localization.LOCALE_CHANGED, (e) => {
          const locale = e['locales'][0];
          this.adManager_.setLocale(locale);
        });
  }

  /**
   * @override
   * @export
   */
  async destroy() {
    if (document.pictureInPictureElement == this.localVideo_) {
      await document.exitPictureInPicture();
    }

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

    // Important!  Release all child elements before destroying the cast proxy
    // or player.  This makes sure those destructions will not trigger event
    // listeners in the UI which would then invoke the cast proxy or player.
    this.releaseChildElements_();

    if (this.controlsContainer_) {
      this.videoContainer_.removeChild(this.controlsContainer_);
      this.controlsContainer_ = null;
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

    this.localization_ = null;
    this.pressedKeys_.clear();

    // FakeEventTarget implements IReleasable
    super.release();
  }


  /** @private */
  releaseChildElements_() {
    for (const element of this.elements_) {
      element.release();
    }

    this.elements_ = [];
  }

  /**
   * @param {string} name
   * @param {!shaka.extern.IUIElement.Factory} factory
   * @export
   */
  static registerElement(name, factory) {
    shaka.ui.ControlsPanel.elementNamesToFactories_.set(name, factory);
  }

  /**
   * @param {!shaka.extern.IUISeekBar.Factory} factory
   * @export
   */
  static registerSeekBar(factory) {
    shaka.ui.ControlsPanel.seekBarFactory_ = factory;
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
   * @param {!shaka.extern.UIConfiguration} config
   * @export
   */
  configure(config) {
    this.config_ = config;

    this.castProxy_.changeReceiverId(config.castReceiverAppId,
        config.castAndroidReceiverCompatible);

    // Deconstruct the old layout if applicable
    if (this.seekBar_) {
      this.seekBar_ = null;
    }

    if (this.playButton_) {
      this.playButton_ = null;
    }

    if (this.contextMenu_) {
      this.contextMenu_ = null;
    }

    if (this.controlsContainer_) {
      shaka.util.Dom.removeAllChildren(this.controlsContainer_);
      this.releaseChildElements_();
    } else {
      this.addControlsContainer_();
      // The client-side ad container is only created once, and is never
      // re-created or uprooted in the DOM, even when the DOM is re-created,
      // since that seemingly breaks the IMA SDK.
      this.addClientAdContainer_();
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
      this.videoContainer_.setAttribute('shaka-controls', 'true');

      // If we're hiding native controls, make sure the video element itself is
      // not tab-navigable.  Our custom controls will still be tab-navigable.
      this.localVideo_.tabIndex = -1;
      this.localVideo_.controls = false;
    } else {
      this.videoContainer_.removeAttribute('shaka-controls');
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
    this.localVideo_.controls = enabled;
    this.localVideo_.tabIndex = enabled ? 0 : -1;

    if (enabled) {
      this.setEnabledShakaControls(false);
    }
  }

  /**
   * @export
   * @return {?shaka.extern.IAd}
   */
  getAd() {
    return this.ad_;
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
    goog.asserts.assert(
        this.controlsContainer_, 'No controls container after destruction!');
    return this.controlsContainer_;
  }

  /**
   * @return {!HTMLElement}
   * @export
   */
  getServerSideAdContainer() {
    return this.daiAdContainer_;
  }

  /**
   * @return {!HTMLElement}
   * @export
   */
  getClientSideAdContainer() {
    return this.clientAdContainer_;
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
   * @param {boolean} seeking
   * @export
   */
  setSeeking(seeking) {
    this.isSeeking_ = seeking;
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
    return this.seekBar_ ? this.seekBar_.getValue() : this.video_.currentTime;
  }

  /**
   * @param {?number} time
   * @export
   */
  setLastTouchEventTime(time) {
    this.lastTouchEventTime_ = time;
  }

  /**
   * @return {boolean}
   * @export
   */
  anySettingsMenusAreOpen() {
    return this.menus_.some(
        (menu) => !menu.classList.contains('shaka-hidden'));
  }

  /** @export */
  hideSettingsMenus() {
    this.hideSettingsMenusTimer_.tickNow();
  }

  /**
   * @return {boolean}
   * @export
   */
  isFullScreenSupported() {
    if (document.fullscreenEnabled) {
      return true;
    }
    const video = /** @type {HTMLVideoElement} */(this.localVideo_);
    if (video.webkitSupportsFullscreen) {
      return true;
    }
    return false;
  }

  /**
   * @return {boolean}
   * @export
   */
  isFullScreenEnabled() {
    if (document.fullscreenEnabled) {
      return !!document.fullscreenElement;
    }
    const video = /** @type {HTMLVideoElement} */(this.localVideo_);
    if (video.webkitSupportsFullscreen) {
      return video.webkitDisplayingFullscreen;
    }
    return false;
  }

  /** @private */
  async enterFullScreen_() {
    try {
      if (document.fullscreenEnabled) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        }
        const fullScreenElement = this.config_.fullScreenElement;
        await fullScreenElement.requestFullscreen({navigationUI: 'hide'});

        if (this.config_.forceLandscapeOnFullscreen && screen.orientation) {
          // Locking to 'landscape' should let it be either
          // 'landscape-primary' or 'landscape-secondary' as appropriate.
          // We ignore errors from this specific call, since it creates noise
          // on desktop otherwise.
          try {
            await screen.orientation.lock('landscape');
          } catch (error) {}
        }
      } else {
        const video = /** @type {HTMLVideoElement} */(this.localVideo_);
        if (video.webkitSupportsFullscreen) {
          video.webkitEnterFullscreen();
        }
      }
    } catch (error) {
      // Entering fullscreen can fail without user interaction.
      this.dispatchEvent(new shaka.util.FakeEvent(
          'error', (new Map()).set('detail', error)));
    }
  }

  /** @private */
  async exitFullScreen_() {
    if (document.fullscreenEnabled) {
      if (screen.orientation) {
        screen.orientation.unlock();
      }
      await document.exitFullscreen();
    } else {
      const video = /** @type {HTMLVideoElement} */(this.localVideo_);
      if (video.webkitSupportsFullscreen) {
        video.webkitExitFullscreen();
      }
    }
  }

  /** @export */
  async toggleFullScreen() {
    if (this.isFullScreenEnabled()) {
      await this.exitFullScreen_();
    } else {
      await this.enterFullScreen_();
    }
  }

  /** @export */
  showAdUI() {
    shaka.ui.Utils.setDisplay(this.adPanel_, true);
    shaka.ui.Utils.setDisplay(this.clientAdContainer_, true);
    this.controlsContainer_.setAttribute('ad-active', 'true');
  }

  /** @export */
  hideAdUI() {
    shaka.ui.Utils.setDisplay(this.adPanel_, false);
    shaka.ui.Utils.setDisplay(this.clientAdContainer_, false);
    this.controlsContainer_.removeAttribute('ad-active');
  }

  /**
   * Play or pause the current presentation.
   */
  playPausePresentation() {
    if (!this.enabled_) {
      return;
    }

    if (!this.video_.duration) {
      // Can't play yet.  Ignore.
      return;
    }

    this.player_.cancelTrickPlay();

    if (this.presentationIsPaused()) {
      this.video_.play();
    } else {
      this.video_.pause();
    }
  }

  /**
   * Play or pause the current ad.
   */
  playPauseAd() {
    if (this.ad_ && this.ad_.isPaused()) {
      this.ad_.play();
    } else if (this.ad_) {
      this.ad_.pause();
    }
  }


  /**
   * Return true if the presentation is paused.
   *
   * @return {boolean}
   */
  presentationIsPaused() {
    // The video element is in a paused state while seeking, but we don't count
    // that.
    return this.video_.paused && !this.isSeeking();
  }


  /** @private */
  createDOM_() {
    this.videoContainer_.classList.add('shaka-video-container');
    this.localVideo_.classList.add('shaka-video');

    this.addScrimContainer_();

    if (this.config_.addBigPlayButton) {
      this.addPlayButton_();
    }

    if (this.config_.customContextMenu) {
      this.addContextMenu_();
    }

    if (!this.spinnerContainer_) {
      this.addBufferingSpinner_();
    }

    this.addDaiAdContainer_();

    this.addControlsButtonPanel_();

    this.menus_ = Array.from(
        this.videoContainer_.getElementsByClassName('shaka-settings-menu'));
    this.menus_.push(...Array.from(
        this.videoContainer_.getElementsByClassName('shaka-overflow-menu')));

    this.addSeekBar_();

    this.showOnHoverControls_ = Array.from(
        this.videoContainer_.getElementsByClassName(
            'shaka-show-controls-on-mouse-over'));
  }

  /** @private */
  addControlsContainer_() {
    /** @private {HTMLElement} */
    this.controlsContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.controlsContainer_.classList.add('shaka-controls-container');
    this.videoContainer_.appendChild(this.controlsContainer_);

    // Use our controls by default, without anyone calling
    // setEnabledShakaControls:
    this.videoContainer_.setAttribute('shaka-controls', 'true');

    this.eventManager_.listen(this.controlsContainer_, 'touchstart', (e) => {
      this.onContainerTouch_(e);
    }, {passive: false});

    this.eventManager_.listen(this.controlsContainer_, 'click', () => {
      this.onContainerClick_();
    });

    this.eventManager_.listen(this.controlsContainer_, 'dblclick', () => {
      if (this.config_.doubleClickForFullscreen &&
          this.isFullScreenSupported()) {
        this.toggleFullScreen();
      }
    });
  }

  /** @private */
  addPlayButton_() {
    const playButtonContainer = shaka.util.Dom.createHTMLElement('div');
    playButtonContainer.classList.add('shaka-play-button-container');
    this.controlsContainer_.appendChild(playButtonContainer);

    /** @private {shaka.ui.BigPlayButton} */
    this.playButton_ =
        new shaka.ui.BigPlayButton(playButtonContainer, this);
    this.elements_.push(this.playButton_);
  }

  /** @private */
  addContextMenu_() {
    /** @private {shaka.ui.ContextMenu} */
    this.contextMenu_ =
        new shaka.ui.ContextMenu(this.controlsButtonPanel_, this);
    this.elements_.push(this.contextMenu_);
  }

  /** @private */
  addScrimContainer_() {
    // This is the container that gets styled by CSS to have the
    // black gradient scrim at the end of the controls.
    const scrimContainer = shaka.util.Dom.createHTMLElement('div');
    scrimContainer.classList.add('shaka-scrim-container');
    this.controlsContainer_.appendChild(scrimContainer);
  }

  /** @private */
  addAdControls_() {
    /** @private {!HTMLElement} */
    this.adPanel_ = shaka.util.Dom.createHTMLElement('div');
    this.adPanel_.classList.add('shaka-ad-controls');
    const showAdPanel = this.ad_ != null && this.ad_.isLinear();
    shaka.ui.Utils.setDisplay(this.adPanel_, showAdPanel);
    this.bottomControls_.appendChild(this.adPanel_);

    const adPosition = new shaka.ui.AdPosition(this.adPanel_, this);
    this.elements_.push(adPosition);

    const adCounter = new shaka.ui.AdCounter(this.adPanel_, this);
    this.elements_.push(adCounter);
  }

  /** @private */
  addBufferingSpinner_() {
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
    svg.classList.add('shaka-spinner-svg');
    svg.setAttribute('viewBox', '0 0 30 30');
    spinner.appendChild(svg);

    // These coordinates are relative to the SVG viewBox above.  This is
    // distinct from the actual display size in the page, since the "S" is for
    // "Scalable." The radius of 14.5 is so that the edges of the 1-px-wide
    // stroke will touch the edges of the viewBox.
    const spinnerCircle = document.createElementNS(xmlns, 'circle');
    spinnerCircle.classList.add('shaka-spinner-path');
    spinnerCircle.setAttribute('cx', '15');
    spinnerCircle.setAttribute('cy', '15');
    spinnerCircle.setAttribute('r', '14.5');
    spinnerCircle.setAttribute('fill', 'none');
    spinnerCircle.setAttribute('stroke-width', '1');
    spinnerCircle.setAttribute('stroke-miterlimit', '10');
    svg.appendChild(spinnerCircle);
  }

  /** @private */
  addControlsButtonPanel_() {
    /** @private {!HTMLElement} */
    this.bottomControls_ = shaka.util.Dom.createHTMLElement('div');
    this.bottomControls_.classList.add('shaka-bottom-controls');
    this.bottomControls_.classList.add('shaka-no-propagation');
    this.controlsContainer_.appendChild(this.bottomControls_);

    // Overflow menus are supposed to hide once you click elsewhere
    // on the page. The click event listener on window ensures that.
    // However, clicks on the bottom controls don't propagate to the container,
    // so we have to explicitly hide the menus onclick here.
    this.eventManager_.listen(this.bottomControls_, 'click', (e) => {
      // We explicitly deny this measure when clicking on buttons that
      // open submenus in the control panel.
      if (!e.target['closest']('.shaka-overflow-button')) {
        this.hideSettingsMenus();
      }
    });

    this.addAdControls_();

    /** @private {!HTMLElement} */
    this.controlsButtonPanel_ = shaka.util.Dom.createHTMLElement('div');
    this.controlsButtonPanel_.classList.add('shaka-controls-button-panel');
    this.controlsButtonPanel_.classList.add(
        'shaka-show-controls-on-mouse-over');
    if (this.config_.enableTooltips) {
      this.controlsButtonPanel_.classList.add('shaka-tooltips-on');
    }
    this.bottomControls_.appendChild(this.controlsButtonPanel_);

    // Create the elements specified by controlPanelElements
    for (const name of this.config_.controlPanelElements) {
      if (shaka.ui.ControlsPanel.elementNamesToFactories_.get(name)) {
        const factory =
            shaka.ui.ControlsPanel.elementNamesToFactories_.get(name);
        const element = factory.create(this.controlsButtonPanel_, this);
        this.elements_.push(element);
      } else {
        shaka.log.alwaysWarn('Unrecognized control panel element requested:',
            name);
      }
    }
  }


  /**
   * Adds a container for server side ad UI with IMA SDK.
   *
   * @private
   */
  addDaiAdContainer_() {
    /** @private {!HTMLElement} */
    this.daiAdContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.daiAdContainer_.classList.add('shaka-server-side-ad-container');
    this.controlsContainer_.appendChild(this.daiAdContainer_);
  }


  /**
   * Adds a seekbar depending on the configuration.
   * By default an instance of shaka.ui.SeekBar is created
   * This behaviour can be overriden by providing a SeekBar factory using the
   * registerSeekBarFactory function.
   *
   * @private
   */
  addSeekBar_() {
    if (this.config_.addSeekBar) {
      this.seekBar_ = shaka.ui.ControlsPanel.seekBarFactory_.create(
          this.bottomControls_, this);
      this.elements_.push(this.seekBar_);
    } else {
      // Settings menus need to be positioned lower if the seekbar is absent.
      for (const menu of this.menus_) {
        menu.classList.add('shaka-low-position');
      }
    }
  }


  /**
   * Adds a container for client side ad UI with IMA SDK.
   *
   * @private
   */
  addClientAdContainer_() {
    /** @private {!HTMLElement} */
    this.clientAdContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.clientAdContainer_.classList.add('shaka-client-side-ad-container');
    shaka.ui.Utils.setDisplay(this.clientAdContainer_, false);
    this.eventManager_.listen(this.clientAdContainer_, 'click', () => {
      this.onContainerClick_();
    });
    this.videoContainer_.appendChild(this.clientAdContainer_);
  }

  /**
   * Adds static event listeners.  This should only add event listeners to
   * things that don't change (e.g. Player).  Dynamic elements (e.g. controls)
   * should have their event listeners added when they are created.
   *
   * @private
   */
  addEventListeners_() {
    this.eventManager_.listen(this.player_, 'buffering', () => {
      this.onBufferingStateChange_();
    });
    // Set the initial state, as well.
    this.onBufferingStateChange_();

    // Listen for key down events to detect tab and enable outline
    // for focused elements.
    this.eventManager_.listen(window, 'keydown', (e) => {
      this.onWindowKeyDown_(/** @type {!KeyboardEvent} */(e));
    });

    // Listen for click events to dismiss the settings menus.
    this.eventManager_.listen(window, 'click', () => this.hideSettingsMenus());

    // Avoid having multiple submenus open at the same time.
    this.eventManager_.listen(
        this, 'submenuopen', () => {
          this.hideSettingsMenus();
        });

    this.eventManager_.listen(this.video_, 'play', () => {
      this.onPlayStateChange_();
    });

    this.eventManager_.listen(this.video_, 'pause', () => {
      this.onPlayStateChange_();
    });

    this.eventManager_.listen(this.videoContainer_, 'mousemove', (e) => {
      this.onMouseMove_(e);
    });

    this.eventManager_.listen(this.videoContainer_, 'touchmove', (e) => {
      this.onMouseMove_(e);
    }, {passive: true});

    this.eventManager_.listen(this.videoContainer_, 'touchend', (e) => {
      this.onMouseMove_(e);
    }, {passive: true});

    this.eventManager_.listen(this.videoContainer_, 'mouseleave', () => {
      this.onMouseLeave_();
    });

    this.eventManager_.listen(this.castProxy_, 'caststatuschanged', () => {
      this.onCastStatusChange_();
    });

    this.eventManager_.listen(this.videoContainer_, 'keydown', (e) => {
      this.onControlsKeyDown_(/** @type {!KeyboardEvent} */(e));
    });

    this.eventManager_.listen(this.videoContainer_, 'keyup', (e) => {
      this.onControlsKeyUp_(/** @type {!KeyboardEvent} */(e));
    });

    this.eventManager_.listen(
        this.adManager_, shaka.ads.AdManager.AD_STARTED, (e) => {
          this.ad_ = (/** @type {!Object} */ (e))['ad'];
          this.showAdUI();
        });

    this.eventManager_.listen(
        this.adManager_, shaka.ads.AdManager.AD_STOPPED, () => {
          this.ad_ = null;
          this.hideAdUI();
        });

    if (screen.orientation) {
      this.eventManager_.listen(screen.orientation, 'change', async () => {
        await this.onScreenRotation_();
      });
    }
  }


  /**
   * When a mobile device is rotated to landscape layout, and the video is
   * loaded, make the demo app go into fullscreen.
   * Similarly, exit fullscreen when the device is rotated to portrait layout.
   * @private
   */
  async onScreenRotation_() {
    if (!this.video_ ||
        this.video_.readyState == 0 ||
        this.castProxy_.isCasting() ||
        !this.config_.enableFullscreenOnRotation ||
        !this.isFullScreenSupported()) {
      return;
    }

    if (screen.orientation.type.includes('landscape') &&
        !this.isFullScreenEnabled()) {
      await this.enterFullScreen_();
    } else if (screen.orientation.type.includes('portrait') &&
      this.isFullScreenEnabled()) {
      await this.exitFullScreen_();
    }
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
    // This should be treated as part of the touch, which has already been
    // handled.
    if (this.lastTouchEventTime_ && event.type == 'mousemove') {
      return;
    }

    // Use the cursor specified in the CSS file.
    this.videoContainer_.style.cursor = '';

    this.recentMouseMovement_ = true;

    // Make sure we are not about to hide the settings menus and then force them
    // open.
    this.hideSettingsMenusTimer_.stop();

    if (!this.isOpaque()) {
      // Only update the time and seek range on mouse movement if it's the very
      // first movement and we're about to show the controls.  Otherwise, the
      // seek bar will be updated much more rapidly during mouse movement.  Do
      // this right before making it visible.
      this.updateTimeAndSeekRange_();
      this.computeOpacity();
    }

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
    // Hide the cursor.
    this.videoContainer_.style.cursor = 'none';
    this.recentMouseMovement_ = false;
    this.computeOpacity();
  }

  /**
   * @return {boolean} true if any relevant elements are hovered.
   * @private
   */
  isHovered_() {
    if (!window.matchMedia('hover: hover').matches) {
      // This is primarily a touch-screen device, so the :hover query below
      // doesn't make sense.  In spite of this, the :hover query on an element
      // can still return true on such a device after a touch ends.
      // See https://bit.ly/34dBORX for details.
      return false;
    }

    return this.showOnHoverControls_.some((element) => {
      return element.matches(':hover');
    });
  }

  /**
   * Recompute whether the controls should be shown or hidden.
   */
  computeOpacity() {
    const adIsPaused = this.ad_ ? this.ad_.isPaused() : false;
    const videoIsPaused = this.video_.paused && !this.isSeeking_;
    const keyboardNavigationMode = this.controlsContainer_.classList.contains(
        'shaka-keyboard-navigation');

    // Keep showing the controls if the ad or video is paused, there has been
    // recent mouse movement, we're in keyboard navigation, or one of a special
    // class of elements is hovered.
    if (adIsPaused ||
        ((!this.ad_ || !this.ad_.isLinear()) && videoIsPaused) ||
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

    if (this.isOpaque()) {
      this.lastTouchEventTime_ = Date.now();
      // The controls are showing.
      // Let this event continue and become a click.
    } else {
      // The controls are hidden, so show them.
      this.onMouseMove_(event);
      // Stop this event from becoming a click event.
      event.cancelable && event.preventDefault();
    }
  }

  /** @private */
  onContainerClick_() {
    if (!this.enabled_) {
      return;
    }

    if (this.anySettingsMenusAreOpen()) {
      this.hideSettingsMenusTimer_.tickNow();
    } else if (this.config_.singleClickForPlayAndPause) {
      this.onPlayPauseClick_();
    }
  }

  /** @private */
  onPlayPauseClick_() {
    if (this.ad_ && this.ad_.isLinear()) {
      this.playPauseAd();
    } else {
      this.playPausePresentation();
    }
  }

  /** @private */
  onCastStatusChange_() {
    const isCasting = this.castProxy_.isCasting();
    this.dispatchEvent(new shaka.util.FakeEvent(
        'caststatuschanged', (new Map()).set('newStatus', isCasting)));

    if (isCasting) {
      this.controlsContainer_.setAttribute('casting', 'true');
    } else {
      this.controlsContainer_.removeAttribute('casting');
    }
  }

  /** @private */
  onPlayStateChange_() {
    this.computeOpacity();
  }

  /**
   * Support controls with keyboard inputs.
   * @param {!KeyboardEvent} event
   * @private
   */
  onControlsKeyDown_(event) {
    const activeElement = document.activeElement;
    const isVolumeBar = activeElement && activeElement.classList ?
        activeElement.classList.contains('shaka-volume-bar') : false;
    const isSeekBar = activeElement && activeElement.classList &&
        activeElement.classList.contains('shaka-seek-bar');
    // Show the control panel if it is on focus or any button is pressed.
    if (this.controlsContainer_.contains(activeElement)) {
      this.onMouseMove_(event);
    }

    if (!this.config_.enableKeyboardPlaybackControls) {
      return;
    }

    const keyboardSeekDistance = this.config_.keyboardSeekDistance;

    switch (event.key) {
      case 'ArrowLeft':
        // If it's not focused on the volume bar, move the seek time backward
        // for a few sec. Otherwise, the volume will be adjusted automatically.
        if (this.seekBar_ && !isVolumeBar && keyboardSeekDistance > 0) {
          event.preventDefault();
          this.seek_(this.seekBar_.getValue() - keyboardSeekDistance);
        }
        break;
      case 'ArrowRight':
        // If it's not focused on the volume bar, move the seek time forward
        // for a few sec. Otherwise, the volume will be adjusted automatically.
        if (this.seekBar_ && !isVolumeBar && keyboardSeekDistance > 0) {
          event.preventDefault();
          this.seek_(this.seekBar_.getValue() + keyboardSeekDistance);
        }
        break;
      // Jump to the beginning of the video's seek range.
      case 'Home':
        if (this.seekBar_) {
          this.seek_(this.player_.seekRange().start);
        }
        break;
      // Jump to the end of the video's seek range.
      case 'End':
        if (this.seekBar_) {
          this.seek_(this.player_.seekRange().end);
        }
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
   * Support controls with keyboard inputs.
   * @param {!KeyboardEvent} event
   * @private
   */
  onControlsKeyUp_(event) {
    // When the key is released, remove it from the pressed keys set.
    this.pressedKeys_.delete(event.key);
  }

  /**
   * Called both as an event listener and directly by the controls to initialize
   * the buffering state.
   * @private
   */
  onBufferingStateChange_() {
    if (!this.enabled_) {
      return;
    }

    shaka.ui.Utils.setDisplay(
        this.spinnerContainer_, this.player_.isBuffering());
  }

  /**
   * @return {boolean}
   * @export
   */
  isOpaque() {
    if (!this.enabled_) {
      return false;
    }

    return this.controlsContainer_.getAttribute('shown') != null ||
        this.controlsContainer_.getAttribute('casting') != null;
  }

  /**
   * Update the video's current time based on the keyboard operations.
   *
   * @param {number} currentTime
   * @private
   */
  seek_(currentTime) {
    goog.asserts.assert(
        this.seekBar_, 'Caller of seek_ must check for seekBar_ first!');

    this.seekBar_.changeTo(currentTime);

    if (this.isOpaque()) {
      // Only update the time and seek range if it's visible.
      this.updateTimeAndSeekRange_();
    }
  }

  /**
   * Called when the seek range or current time need to be updated.
   * @private
   */
  updateTimeAndSeekRange_() {
    if (this.seekBar_) {
      this.seekBar_.setValue(this.video_.currentTime);
      this.seekBar_.update();

      if (this.seekBar_.isShowing()) {
        for (const menu of this.menus_) {
          menu.classList.remove('shaka-low-position');
        }
      } else {
        for (const menu of this.menus_) {
          menu.classList.add('shaka-low-position');
        }
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
   * @param {!KeyboardEvent} event
   * @private
   */
  onWindowKeyDown_(event) {
    // Add the key to the pressed keys set when it's pressed.
    this.pressedKeys_.add(event.key);

    const anySettingsMenusAreOpen = this.anySettingsMenusAreOpen();

    if (event.key == 'Tab') {
      // Enable blue outline for focused elements for keyboard
      // navigation.
      this.controlsContainer_.classList.add('shaka-keyboard-navigation');
      this.computeOpacity();
      this.eventManager_.listen(window, 'mousedown', () => this.onMouseDown_());
    }

    // If escape key was pressed, close any open settings menus.
    if (event.key == 'Escape') {
      this.hideSettingsMenusTimer_.tickNow();
    }

    if (anySettingsMenusAreOpen && this.pressedKeys_.has('Tab')) {
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
   *
   * This is called by onWindowKeyDown_() function, when there's a settings
   * overflow menu open, and the Tab key / Shift+Tab keys are pressed.
   *
   * @param {!Event} event
   * @private
   */
  keepFocusInMenu_(event) {
    const openSettingsMenus = this.menus_.filter(
        (menu) => !menu.classList.contains('shaka-hidden'));
    if (!openSettingsMenus.length) {
      // For example, this occurs when you hit escape to close the menu.
      return;
    }

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
      if (this.pressedKeys_.has('Shift')) {
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
   * For keyboard navigation, we use blue borders to highlight the active
   * element. If we detect that a mouse is being used, remove the blue border
   * from the active element.
   * @private
   */
  onMouseDown_() {
    this.eventManager_.unlisten(window, 'mousedown');
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
    shaka.ui.Locales.addTo(localization);
    localization.changeLocale(navigator.languages || []);

    return localization;
  }
};


/**
 * @event shaka.ui.Controls#CastStatusChangedEvent
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
 * @event shaka.ui.Controls#SubMenuOpenEvent
 * @description Fired when one of the overflow submenus is opened
 *    (e. g. language/resolution/subtitle selection).
 * @property {string} type
 *   'submenuopen'
 * @exportDoc
 */


/**
 * @event shaka.ui.Controls#CaptionSelectionUpdatedEvent
 * @description Fired when the captions/subtitles menu has finished updating.
 * @property {string} type
 *   'captionselectionupdated'
 * @exportDoc
 */


/**
 * @event shaka.ui.Controls#ResolutionSelectionUpdatedEvent
 * @description Fired when the resolution menu has finished updating.
 * @property {string} type
 *   'resolutionselectionupdated'
 * @exportDoc
 */


/**
 * @event shaka.ui.Controls#LanguageSelectionUpdatedEvent
 * @description Fired when the audio language menu has finished updating.
 * @property {string} type
 *   'languageselectionupdated'
 * @exportDoc
 */


/**
 * @event shaka.ui.Controls#ErrorEvent
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
 * @event shaka.ui.Controls#TimeAndSeekRangeUpdatedEvent
 * @description Fired when the time and seek range elements have finished
 *    updating.
 * @property {string} type
 *   'timeandseekrangeupdated'
 * @exportDoc
 */


/**
 * @event shaka.ui.Controls#UIUpdatedEvent
 * @description Fired after a call to ui.configure() once the UI has finished
 *    updating.
 * @property {string} type
 *   'uiupdated'
 * @exportDoc
 */

/** @private {!Map.<string, !shaka.extern.IUIElement.Factory>} */
shaka.ui.ControlsPanel.elementNamesToFactories_ = new Map();

/** @private {?shaka.extern.IUISeekBar.Factory} */
shaka.ui.ControlsPanel.seekBarFactory_ = new shaka.ui.SeekBar.Factory();
