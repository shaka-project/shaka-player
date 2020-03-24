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

goog.provide('shaka.test.FakeDemoMain');


/**
 * @summary
 * This simulates the interface between ShakaDemoMain and the various tabs.
 * Note that that interface is NOT defined by an extern, as it is not part of
 * Shaka Player proper.
 */
shaka.test.FakeDemoMain = class {
  constructor() {
    this.video = /** @type {!HTMLVideoElement} */ (
      document.createElement('video'));
    this.player = new shaka.Player(this.video);
    this.config_ = this.player.getConfiguration();
    this.selectedAsset = null;

    /** @type {!jasmine.Spy} */
    this.getCurrentConfigValue = jasmine.createSpy('getCurrentConfigValue');
    this.getCurrentConfigValue.and.callFake((valueName) => {
      return this.getValueFromGivenConfig_(valueName);
    });

    /** @type {!jasmine.Spy} */
    this.remakeHash = jasmine.createSpy('remakeHash');

    /** @type {!jasmine.Spy} */
    this.getUILocale = jasmine.createSpy('getUILocale');
    this.getUILocale.and.returnValue('en-us');

    /** @type {!jasmine.Spy} */
    this.getNativeControlsEnabled =
        jasmine.createSpy('getNativeControlsEnabled');
    this.getNativeControlsEnabled.and.returnValue(false);

    /** @type {!jasmine.Spy} */
    this.setNativeControlsEnabled =
        jasmine.createSpy('setNativeControlsEnabled');

    /** @type {!jasmine.Spy} */
    this.getConfiguration = jasmine.createSpy('getConfiguration');
    this.getConfiguration.and.returnValue(this.config_);

    /** @type {!jasmine.Spy} */
    this.resetConfiguration = jasmine.createSpy('resetConfiguration');

    /** @type {!jasmine.Spy} */
    this.configure = jasmine.createSpy('configure');

    /** @type {!jasmine.Spy} */
    this.getIsDrawerOpen = jasmine.createSpy('getIsDrawerOpen');
    this.getIsDrawerOpen.and.returnValue(true);

    /** @type {!jasmine.Spy} */
    this.addNavButton = jasmine.createSpy('addNavButton').and.callFake(() => {
      const container =
      /** @type {!HTMLDivElement} */ (document.createElement('div'));
      const button =
      /** @type {!HTMLButtonElement} */ (document.createElement('button'));
      return {container: container, button: button};
    });

    /** @type {!jasmine.Spy} */
    this.getHamburgerMenu = jasmine.createSpy('getHamburgerMenu');
    this.getHamburgerMenu.and.callFake(() => {
      return /** @type {!HTMLDivElement} */ (document.createElement('div'));
    });

    /** @type {!jasmine.Spy} */
    this.loadAsset = jasmine.createSpy('loadAsset');
    this.loadAsset.and.returnValue(Promise.resolve());

    /** @type {!jasmine.Spy} */
    this.setupOfflineSupport = jasmine.createSpy('setupOfflineSupport');

    /** @type {!jasmine.Spy} */
    this.getAssetUnsupportedReason =
        jasmine.createSpy('getAssetUnsupportedReason');
    this.getAssetUnsupportedReason.and.returnValue(null);
  }

  /** Creates and assigns the mock demo main (and all of the real tab). */
  static setup() {
    shakaDemoMain = new shaka.test.FakeDemoMain();
    const event = document.createEvent('event');
    event.initEvent('shaka-main-loaded', false, false);
    document.dispatchEvent(event);
  }

  /** Disposes of the mock demo main (and all of the real tabs). */
  async cleanup() {
    const event = document.createEvent('event');
    event.initEvent('shaka-main-cleanup', false, false);
    document.dispatchEvent(event);
    await this.player.destroy();
    shakaDemoMain = null;
  }

  /**
   * @param {string} valueName
   * @return {*}
   * @private
   */
  getValueFromGivenConfig_(valueName) {
    let objOn = this.config_;
    let valueNameOn = valueName;
    while (valueNameOn) {
      // Split using a regex that only matches the first period.
      const split = valueNameOn.split(/\.(.+)/);
      if (split.length == 3) {
        valueNameOn = split[1];
        objOn = objOn[split[0]];
      } else {
        return objOn[split[0]];
      }
    }
    return undefined;
  }
};


// The various tabs communicate with ShakaDemoMain through a global variable,
// called shakaDemoMain.
let shakaDemoMain;
