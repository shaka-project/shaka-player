/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.VRPad');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * A pad with arrows to look around VR content.  Holding an arrow turns the
 * view, and the button in the middle resets it.
 *
 * @extends {shaka.ui.Element}
 * @final
 */
shaka.ui.VRPad = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLElement} */
    this.pad_ = shaka.util.Dom.createHTMLElement('div');
    this.pad_.classList.add('shaka-vr-pad');
    this.pad_.classList.add('shaka-no-propagation');
    this.pad_.setAttribute('role', 'group');

    const LocIds = shaka.ui.Locales.Ids;

    /**
     * The buttons, with the id of their string.
     * @private {!Array<{button: !HTMLButtonElement, locId: string}>}
     */
    this.buttons_ = [];

    // In the order of the focus: from the top, and from the left.
    this.addArrow_('up', 0, 1, LocIds.VR_LOOK_UP);
    this.addArrow_('left', -1, 0, LocIds.VR_LOOK_LEFT);

    const recenter = this.addButton_('recenter', LocIds.RECENTER_VR);
    recenter.appendChild(new shaka.ui.Icon(null,
        shaka.ui.Enums.MaterialDesignSVGIcons['RECENTER_VR']).getSvgElement());
    this.eventManager.listen(recenter, 'click', () => {
      if (this.controls.isOpaque()) {
        this.controls.getVR().reset();
      }
    });

    this.addArrow_('right', 1, 0, LocIds.VR_LOOK_RIGHT);
    this.addArrow_('down', 0, -1, LocIds.VR_LOOK_DOWN);

    this.parent.appendChild(this.pad_);

    this.updateLocalizedStrings();

    this.eventManager.listen(this.controls.getVR(), 'vrstatuschanged', () => {
      this.checkAvailability();
    });

    this.checkAvailability();
  }

  /** @override */
  checkAvailability() {
    shaka.ui.Utils.setDisplay(this.pad_, this.controls.isPlayingVR());
  }

  /** @override */
  updateLocalizedStrings() {
    for (const {button, locId} of this.buttons_) {
      button.ariaLabel = this.localization.resolve(locId);
    }
  }

  /**
   * @param {string} name
   * @param {string} locId
   * @return {!HTMLButtonElement}
   * @private
   */
  addButton_(name, locId) {
    const button = shaka.util.Dom.createButton();
    button.classList.add('shaka-vr-pad-button');
    button.classList.add('shaka-vr-pad-' + name);
    this.pad_.appendChild(button);
    this.buttons_.push({button, locId});
    return button;
  }

  /**
   * Adds an arrow that turns the view while it is held, with the pointer or
   * with the Enter or Space keys.
   *
   * @param {string} name
   * @param {number} yaw 1 to look to the right, -1 to the left.
   * @param {number} pitch 1 to look up, -1 down.
   * @param {string} locId
   * @private
   */
  addArrow_(name, yaw, pitch, locId) {
    const button = this.addButton_(name, locId);
    button.appendChild(new shaka.ui.Icon(null,
        shaka.ui.Enums.MaterialDesignSVGIcons['BACK']).getSvgElement());

    // The id does not match any key, so releasing a key does not stop it.
    const id = 'vr-pad-' + name;
    const vr = this.controls.getVR();
    const stop = () => vr.stopLooking(id);

    this.eventManager.listen(button, 'pointerdown', (e) => {
      const event = /** @type {!PointerEvent} */ (e);
      // Only the primary button of a mouse or pen, and any touch.  While the
      // controls are hidden, the first tap only shows them.
      if (event.button != 0 || !this.controls.isOpaque()) {
        return;
      }
      // Keep the release even if the pointer leaves the arrow.
      try {
        button.setPointerCapture(event.pointerId);
      } catch (error) {
        // The pointer is no longer active.
      }
      vr.startLooking(id, yaw, pitch);
    });
    this.eventManager.listenMulti(
        button, ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'],
        stop);

    this.eventManager.listen(button, 'keydown', (e) => {
      const event = /** @type {!KeyboardEvent} */ (e);
      if (event.key == 'Enter' || event.key == ' ') {
        // A held key repeats, but the view keeps turning by itself.
        if (!event.repeat) {
          vr.startLooking(id, yaw, pitch);
        }
        event.preventDefault();
      }
    });
    this.eventManager.listen(button, 'keyup', (e) => {
      const event = /** @type {!KeyboardEvent} */ (e);
      if (event.key == 'Enter' || event.key == ' ') {
        stop();
      }
    });
  }
};
