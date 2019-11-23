/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.test.UiUtils');


shaka.test.UiUtils = class {
  /**
   * @param {!HTMLElement} videoContainer
   * @param {!HTMLMediaElement} video
   * @param {!Object=} config
   * @return {!shaka.ui.Overlay}
   */
  static createUIThroughAPI(videoContainer, video, config) {
    const player = new shaka.Player(video);
    // Create UI
    config = config || {};
    const ui = new shaka.ui.Overlay(player, videoContainer, video);
    ui.getControls().addEventListener('error', (/** * */ e) => fail(e.detail));
    ui.configure(config);
    return ui;
  }


  /**
   * @param {!Array.<!Element>} containers
   * @param {!Array.<!Element>} videos
   * @suppress {visibility}
   */
  static async createUIThroughDOMAutoSetup(containers, videos) {
    const eventManager = new shaka.util.EventManager();
    const waiter = new shaka.test.Waiter(eventManager);
    for (const container of containers) {
      container.setAttribute('data-shaka-player-container', '');
    }

    for (const video of videos) {
      video.setAttribute('data-shaka-player', '');
    }

    // Create the waiter first so we can catch a synchronous event.
    const p =
        waiter.failOnTimeout(false).waitForEvent(document, 'shaka-ui-loaded');

    // Call UI's private method to scan the page for shaka
    // elements and create the UI.
    shaka.ui.Overlay.scanPageForShakaElements_();
    await p;
  }

  /**
   * @param {!HTMLElement} parent
   * @param {string} className
   */
  static confirmElementFound(parent, className) {
    const elements = parent.getElementsByClassName(className);
    expect(elements.length).toBe(1);
  }

  /**
   * @param {!HTMLElement} parent
   * @param {string} className
   */
  static confirmElementMissing(parent, className) {
    const elements = parent.getElementsByClassName(className);
    expect(elements.length).toBe(0);
  }


  /**
   * Thoroughly clean up after UI-related tests.
   *
   * The UI tests can create lots of DOM elements (including videos) that are
   * easy to lose track of.  This is a universal cleanup system to avoid leaving
   * anything behind.
   */
  static async cleanupUI() {
    // If we don't clean up the UI, these tests could pollute the environment
    // for other tests that run later, causing failures in unrelated tests.
    // This is causing particular issues on Tizen.
    const containers =
        document.querySelectorAll('[data-shaka-player-container]');

    const destroys = [];
    for (const container of containers) {
      const ui = /** @type {shaka.ui.Overlay} */(container['ui']);

      // Destroying the UI destroys the controls and player inside.
      destroys.push(ui.destroy());
    }
    await Promise.all(destroys);

    // Now remove all the containers from the DOM.
    for (const container of containers) {
      container.parentElement.removeChild(container);
    }
  }


  /**
   * @param {!Element} cssLink
   */
  static async setupCSS(cssLink) {
    const head = document.head;
    cssLink.type = 'text/css';
    cssLink.rel = 'stylesheet/less';
    cssLink.href ='/base/ui/controls.less';
    head.appendChild(cssLink);

    // LESS script has been added at the beginning of the test pass
    // (in test/test/boot.js). This tells it that we've added a new
    // stylesheet, so LESS can process it.
    less.registerStylesheetsImmediately();
    await less.refresh(/* reload */ true,
        /* modifyVars*/ false, /* clearFileCache */ false);
  }

  /**
   * Simulates a native event (e.g. 'click') on the given element.
   *
   * @param {EventTarget} target
   * @param {string} name
   */
  static simulateEvent(target, name) {
    const type = {
      'click': 'MouseEvent',
      'dblclick': 'MouseEvent',
    }[name] || 'CustomEvent';

    // Note we can't use the MouseEvent constructor since it isn't supported on
    // IE11.
    const event = document.createEvent(type);
    event.initEvent(name, true, true);
    target.dispatchEvent(event);
  }
};
