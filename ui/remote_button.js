/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.RemoteButton');

goog.require('shaka.Player');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Platform');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.RemoteButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLButtonElement} */
    this.remoteButton_ = shaka.util.Dom.createButton();
    this.remoteButton_.classList.add('shaka-remote-button');
    this.remoteButton_.classList.add('shaka-tooltip');
    this.remoteButton_.ariaPressed = 'false';

    /** @private {!HTMLElement} */
    this.remoteIcon_ = shaka.util.Dom.createHTMLElement('i');
    this.remoteIcon_.classList.add('material-icons-round');
    let icon = shaka.ui.Enums.MaterialDesignIcons.CAST;
    const safariVersion = shaka.util.Platform.safariVersion();
    if (safariVersion && safariVersion >= 13) {
      icon = shaka.ui.Enums.MaterialDesignIcons.AIRPLAY;
    }
    this.remoteIcon_.textContent = icon;
    this.remoteButton_.appendChild(this.remoteIcon_);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    this.remoteNameSpan_ = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.remoteNameSpan_);

    this.remoteCurrentSelectionSpan_ =
      shaka.util.Dom.createHTMLElement('span');
    this.remoteCurrentSelectionSpan_.classList.add(
        'shaka-current-selection-span');
    label.appendChild(this.remoteCurrentSelectionSpan_);
    this.remoteButton_.appendChild(label);
    this.parent.appendChild(this.remoteButton_);

    /** @private {number} */
    this.callbackId_ = -1;

    // Setup strings in the correct language
    this.updateLocalizedStrings_();

    shaka.ui.Utils.setDisplay(this.remoteButton_, false);

    if (!this.video.remote || this.video.disableRemotePlayback) {
      this.remoteButton_.classList.add('shaka-hidden');
    } else {
      this.eventManager.listen(
          this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
            this.updateLocalizedStrings_();
          });

      this.eventManager.listen(
          this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
            this.updateLocalizedStrings_();
          });

      this.eventManager.listen(this.controls, 'caststatuschanged', () => {
        this.updateRemoteState_();
      });

      this.eventManager.listen(this.remoteButton_, 'click', () => {
        this.video.remote.prompt();
      });

      this.eventManager.listen(this.video.remote, 'connect', () => {
        this.updateRemoteState_();
      });

      this.eventManager.listen(this.video.remote, 'connecting', () => {
        this.updateRemoteState_();
      });

      this.eventManager.listen(this.video.remote, 'disconnect', () => {
        this.updateRemoteState_();
      });

      this.eventManager.listen(this.player, 'loaded', () => {
        this.updateRemoteState_();
      });

      this.updateRemoteState_();
    }
  }

  /** @override */
  release() {
    if (this.video.remote && this.callbackId_ != -1) {
      this.video.remote.cancelWatchAvailability(this.callbackId_).catch(() => {
        // Ignore this error.
      });
    }

    super.release();
  }

  /**
   * @private
   */
  async updateRemoteState_() {
    if (this.controls.getCastProxy().canCast() &&
        this.controls.isCastAllowed()) {
      shaka.ui.Utils.setDisplay(this.remoteButton_, false);
      if (this.callbackId_ != -1) {
        this.video.remote.cancelWatchAvailability(this.callbackId_);
        this.callbackId_ = -1;
      }
    } else if (this.video.remote.state == 'disconnected') {
      const handleAvailabilityChange = (availability) => {
        if (this.player) {
          const loadMode = this.player.getLoadMode();
          const srcMode = loadMode == shaka.Player.LoadMode.SRC_EQUALS;
          shaka.ui.Utils.setDisplay(
              this.remoteButton_, srcMode && availability);
        } else {
          shaka.ui.Utils.setDisplay(this.remoteButton_, false);
        }
      };
      try {
        if (this.callbackId_ != -1) {
          await this.video.remote.cancelWatchAvailability(this.callbackId_);
          this.callbackId_ = -1;
        }
      } catch (e) {
        // Ignore this error.
      }
      try {
        const id = await this.video.remote.watchAvailability(
            handleAvailabilityChange);
        this.callbackId_ = id;
      } catch (e) {
        handleAvailabilityChange(/* availability= */ true);
      }
    } else if (this.callbackId_ != -1) {
      // If remote device is connecting or connected, we should stop
      // watching remote device availability to save power.
      await this.video.remote.cancelWatchAvailability(this.callbackId_);
      this.callbackId_ = -1;
    }
  }

  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;
    let text = this.localization.resolve(LocIds.CAST);
    const safariVersion = shaka.util.Platform.safariVersion();
    if (safariVersion && safariVersion >= 13) {
      text = this.localization.resolve(LocIds.AIRPLAY);
    }
    this.remoteButton_.ariaLabel = text;
    this.remoteNameSpan_.textContent = text;
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.RemoteButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.RemoteButton(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'remote', new shaka.ui.RemoteButton.Factory());

shaka.ui.Controls.registerElement(
    'remote', new shaka.ui.RemoteButton.Factory());
