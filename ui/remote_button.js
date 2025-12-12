/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.RemoteButton');

goog.require('shaka.Player');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
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

    const device = shaka.device.DeviceFactory.getDevice();

    /** @private {boolean} */
    this.isAirPlay_ = device.supportsAirPlay();

    /** @private {!HTMLButtonElement} */
    this.remoteButton_ = shaka.util.Dom.createButton();
    this.remoteButton_.classList.add('shaka-remote-button');
    this.remoteButton_.classList.add('shaka-tooltip');
    this.remoteButton_.ariaPressed = 'false';

    /** @private {!shaka.ui.Icon} */
    this.remoteIcon_ = new shaka.ui.Icon(this.remoteButton_,
        this.isAirPlay_ ?
          shaka.ui.Enums.MaterialDesignSVGIcons['AIRPLAY'] :
          shaka.ui.Enums.MaterialDesignSVGIcons['CAST']);

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

    /** @private {?RemotePlayback} */
    this.remote_ = device.getRemote(this.video);

    if (!this.remote_) {
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
        if (!this.controls.isOpaque()) {
          return;
        }
        this.remote_.prompt().catch(() => {});
      });

      this.eventManager.listen(this.remote_, 'connect', () => {
        this.updateRemoteState_();
        this.updateIcon_();
      });

      this.eventManager.listen(this.remote_, 'connecting', () => {
        this.updateRemoteState_();
        this.updateIcon_();
      });

      this.eventManager.listen(this.remote_, 'disconnect', () => {
        this.updateRemoteState_();
        this.updateIcon_();
      });

      this.eventManager.listen(this.player, 'loaded', () => {
        this.updateRemoteState_();
      });

      if (this.isSubMenu) {
        this.eventManager.listen(this.controls, 'submenuopen', () => {
          this.updateRemoteState_(/* force= */ true);
        });
        this.eventManager.listen(this.controls, 'submenuclose', () => {
          this.updateRemoteState_(/* force= */ true);
        });
      }

      this.updateRemoteState_(/* force= */ true);
      this.updateIcon_();
    }
  }

  /** @override */
  release() {
    if (this.remote_ && this.callbackId_ != -1) {
      this.remote_.cancelWatchAvailability(this.callbackId_).catch(() => {
        // Ignore this error.
      });
    }

    super.release();
  }

  /**
   * @param {boolean=} force
   * @private
   */
  async updateRemoteState_(force = false) {
    if ((this.controls.getCastProxy().canCast() &&
        this.controls.isCastAllowed()) || !this.remote_) {
      shaka.ui.Utils.setDisplay(this.remoteButton_, false);
      if (this.callbackId_ != -1) {
        this.remote_.cancelWatchAvailability(this.callbackId_);
        this.callbackId_ = -1;
      }
    } else if (this.remote_.state == 'disconnected' || force) {
      const handleAvailabilityChange = (availability) => {
        if (this.player) {
          const disableRemote = this.video.disableRemotePlayback;
          let canCast = true;
          if (shaka.device.DeviceFactory.getDevice().supportsAirPlay()) {
            const loadMode = this.player.getLoadMode();
            const mseMode = loadMode == shaka.Player.LoadMode.MEDIA_SOURCE;
            if (mseMode && this.player.getManifestType() != 'HLS') {
              canCast = false;
            }
          }
          const display = canCast && availability && !disableRemote &&
              !this.isSubMenuOpened;
          shaka.ui.Utils.setDisplay(this.remoteButton_, display);
        } else {
          shaka.ui.Utils.setDisplay(this.remoteButton_, false);
        }
      };
      try {
        if (this.callbackId_ != -1) {
          await this.remote_.cancelWatchAvailability(this.callbackId_);
          this.callbackId_ = -1;
        }
      } catch (e) {
        // Ignore this error.
      }
      try {
        const id = await this.remote_.watchAvailability(
            handleAvailabilityChange);
        this.callbackId_ = id;
      } catch (e) {
        handleAvailabilityChange(/* availability= */ true);
      }
    } else {
      shaka.ui.Utils.setDisplay(this.remoteButton_, !this.isSubMenuOpened);
      if (this.callbackId_ != -1) {
        // If remote device is connecting or connected, we should stop
        // watching remote device availability to save power.
        await this.remote_.cancelWatchAvailability(this.callbackId_);
        this.callbackId_ = -1;
      }
    }
  }

  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;
    const text = this.isAirPlay_ ?
        this.localization.resolve(LocIds.AIRPLAY) :
        this.localization.resolve(LocIds.CAST);
    this.remoteButton_.ariaLabel = text;
    this.remoteNameSpan_.textContent = text;
  }

  /**
   * @private
   */
  updateIcon_() {
    if (this.isAirPlay_) {
      return;
    }
    if (this.remote_.state == 'disconnected') {
      this.remoteIcon_.use(shaka.ui.Enums.MaterialDesignSVGIcons['CAST']);
    } else {
      this.remoteIcon_.use(shaka.ui.Enums.MaterialDesignSVGIcons['EXIT_CAST']);
    }
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
