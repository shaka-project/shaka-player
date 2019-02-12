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


goog.provide('shaka.ui.Overlay');

goog.require('goog.asserts');
goog.require('shaka.polyfill.installAll');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.TextDisplayer');


/**
 * @param {!shaka.Player} player
 * @param {!HTMLElement} videoContainer
 * @param {!HTMLMediaElement} video
 * @param {!Object=} config This should follow the form of
 *   {@link shaka.extern.UIConfiguration}, but you may omit
 *   any field you do not wish to change.
 * @constructor
 * @export
 */
shaka.ui.Overlay = function(player, videoContainer, video, config) {
  /** @private {!shaka.Player} */
  this.player_ = player;

  /** @private {!shaka.extern.UIConfiguration} */
  this.config_ = this.defaultConfig_();

  if (config) {
    shaka.util.ConfigUtils.mergeConfigObjects(
        this.config_, config, this.defaultConfig_(),
        /* overrides (only used for player config)*/ {}, /* path */ '');
  }

  // If a cast receiver app id has been given, add a cast button to the UI
  if (this.config_.castReceiverAppId &&
      !this.config_.overflowMenuButtons.includes('cast')) {
    this.config_.overflowMenuButtons.push('cast');
  }

  /** @private {!shaka.ui.Controls} */
  this.controls_ = new shaka.ui.Controls(
      player, videoContainer, video, this.config_);
};


/**
 * @return {!shaka.Player}
 * @export
 */
shaka.ui.Overlay.prototype.getPlayer = function() {
  return this.player_;
};


/**
 * @return {!shaka.ui.Controls}
 * @export
 */
shaka.ui.Overlay.prototype.getControls = function() {
  return this.controls_;
};


/**
 * Enable or disable the custom controls.
 *
 * @param {boolean} enabled
 * @export
 */
shaka.ui.Overlay.prototype.setEnabled = function(enabled) {
  this.controls_.setEnabledShakaControls(enabled);
};


/**
 * @return {!shaka.extern.UIConfiguration}
 * @private
 */
shaka.ui.Overlay.prototype.defaultConfig_ = function() {
  return {
    controlPanelElements: [
      'time_and_duration',
      'spacer',
      'mute',
      'volume',
      'fullscreen',
      'overflow_menu',
    ],
    overflowMenuButtons: [
      'captions',
      'quality',
      'language',
      'picture_in_picture',
    ],
    addSeekBar: true,
    castReceiverAppId: '',
  };
};


/**
 * @private
 */
shaka.ui.Overlay.scanPageForShakaElements_ = function() {
  // Install built-in polyfills to patch browser incompatibilities.
  shaka.polyfill.installAll();
  // Check to see if the browser supports the basic APIs Shaka needs.
  if (!shaka.Player.isBrowserSupported()) {
    shaka.log.error('Shaka Player does not support this browser. ' +
      'Please see https://tinyurl.com/y7s4j9tr for the list of ' +
      'supported browsers.');

    return;
  }

  // Look for elements marked 'data-shaka-player-container'
  // on the page. These will be used to create our default
  // UI.
  const containers = document.querySelectorAll(
      '[data-shaka-player-container]');
  // Look for elements marked 'data-shaka-player'. They will
  // either be used in our default UI or with native browser
  // controls.
  const videos = document.querySelectorAll(
      '[data-shaka-player]');

  if (!videos.length && !containers.length) {
    // No elements have been tagged with shaka attributes.
  } else if (videos.length && !containers.length) {
    // Just the video elements were provided.
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      video.classList.add('video');
      goog.asserts.assert(video.tagName.toLowerCase() == 'video',
        'Should be a video element!');

      const container = document.createElement('div');
      const videoParent = video.parentElement;
      videoParent.replaceChild(container, video);
      container.appendChild(video);

      let castAppId = '';

      // If cast receiver application id was provided, pass it to the
      // UI constructor.
      if (video['dataset'] && video['dataset']['shakaPlayerCastReceiverId']) {
        castAppId = video['dataset']['shakaPlayerCastReceiverId'];
      }

      const videoAsMediaElement = /** @type {!HTMLMediaElement} */ (video);
      const ui = shaka.ui.Overlay.createUI_(
          /** @type {!HTMLElement} */ (container),
          videoAsMediaElement,
          {castReceiverAppId: castAppId});

      if (videoAsMediaElement.controls) {
        ui.getControls().setEnabledNativeControls(true);
      }
    }
  } else {
      for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      goog.asserts.assert(container.tagName.toLowerCase() == 'div',
        'Container should be a div!');

      let castAppId = '';

      // Cast receiver id can be specified on either container or video.
      // It should not be provided on both. If it was, we will use the last
      // one we saw.
      if (container['dataset'] &&
          container['dataset']['shakaPlayerCastReceiverId']) {
        castAppId = container['dataset']['shakaPlayerCastReceiverId'];
      }

      let video = null;
      for (let j = 0; j < videos.length; j++) {
        goog.asserts.assert(videos[j].tagName.toLowerCase() == 'video',
          'Should be a video element!');
        if (videos[j].parentElement == container) {
          video = videos[j];
          break;
        }
      }

      if (!video) {
        video = document.createElement('video');
        container.appendChild(video);
      }

      if (video['dataset'] && video['dataset']['shakaPlayerCastReceiverId']) {
        castAppId = video['dataset']['shakaPlayerCastReceiverId'];
      }
      shaka.ui.Overlay.createUI_(/** @type {!HTMLElement} */ (container),
                                 /** @type {!HTMLMediaElement} */ (video),
                                 {castReceiverAppId: castAppId});
    }
  }

  // After scanning the page for elements, fire the "loaded" event.  This will
  // let apps know they can use the UI library programatically now, even if they
  // didn't have any Shaka-related elements declared in their HTML.

  // "Event" is not constructable on IE, so we use this CustomEvent pattern.
  const uiLoadedEvent = /** @type {!CustomEvent} */(
      document.createEvent('CustomEvent'));
  uiLoadedEvent.initCustomEvent('shaka-ui-loaded', false, false, null);

  document.dispatchEvent(uiLoadedEvent);
};


/**
 * @param {!HTMLElement} container
 * @param {!HTMLMediaElement} video
 * @param {!Object} config (Possibly partial) config in the form of
 *   {@link shaka.extern.UIConfiguration}
 * @return {!shaka.ui.Overlay}
 * @private
 */
shaka.ui.Overlay.createUI_ = function(container, video, config) {
  const player = new shaka.Player(video);
  const ui = new shaka.ui.Overlay(player, container, video, config);

  // If the browser's native controls are disabled, use UI TextDisplayer.
  if (!video.controls) {
    player.configure('textDisplayFactory',
        function() { return new shaka.ui.TextDisplayer(video, container); });
  }

  container['ui'] = ui;
  video['ui'] = ui;
  return ui;
};


if (document.readyState == 'complete') {
  // Don't fire this event synchronously.  In a compiled bundle, the "shaka"
  // namespace might not be exported to the window until after this point.
  Promise.resolve().then(shaka.ui.Overlay.scanPageForShakaElements_);
} else {
  window.addEventListener('load', shaka.ui.Overlay.scanPageForShakaElements_);
}
