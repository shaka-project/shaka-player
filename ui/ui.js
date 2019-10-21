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
goog.require('shaka.Deprecate');
goog.require('shaka.polyfill.installAll');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.TextDisplayer');
goog.require('shaka.util.Platform');


/**
 * @param {!shaka.Player} player
 * @param {!HTMLElement} videoContainer
 * @param {!HTMLMediaElement} video
 * @implements {shaka.util.IDestroyable}
 * @constructor
 * @export
 */
shaka.ui.Overlay = function(player, videoContainer, video) {
  /** @private {shaka.Player} */
  this.player_ = player;

  /** @private {!shaka.extern.UIConfiguration} */
  this.config_ = this.defaultConfig_();

  // Make sure this container is discoverable and that the UI can be reached
  // through it.
  videoContainer['dataset']['shakaPlayerContainer'] = '';
  videoContainer['ui'] = this;

  // Tag the container for mobile platforms, to allow different styles.
  if (this.isMobile()) {
    videoContainer.classList.add('shaka-mobile');
  }

  /** @private {shaka.ui.Controls} */
  this.controls_ = new shaka.ui.Controls(
      player, videoContainer, video, this.config_);

  // Run the initial setup so that no configure() call is required for default
  // settings.
  this.configure({});

  // If the browser's native controls are disabled, use UI TextDisplayer.
  // Arrow functions cannot be used with "new", so the factory must use
  // a "function" function.
  if (!video.controls) {
    // eslint-disable-next-line no-restricted-syntax
    const textDisplayer = function() {
      return new shaka.ui.TextDisplayer(video, videoContainer);
    };
    player.configure('textDisplayFactory', textDisplayer);
  }

  videoContainer['ui'] = this;
  video['ui'] = this;
};


/**
 * @override
 * @export
 */
shaka.ui.Overlay.prototype.destroy = async function() {
  await this.controls_.destroy();
  this.controls_ = null;

  await this.player_.destroy();
  this.player_ = null;
};


/**
 * Detects if this is a mobile platform, in case you want to choose a different
 * UI configuration on mobile devices.
 *
 * @return {boolean}
 * @export
 */
shaka.ui.Overlay.prototype.isMobile = function() {
  return shaka.util.Platform.isMobile();
};


/**
 * @return {!shaka.extern.UIConfiguration}
 * @export
 */
shaka.ui.Overlay.prototype.getConfiguration = function() {
  const ret = this.defaultConfig_();
  shaka.util.ConfigUtils.mergeConfigObjects(
      ret, this.config_, this.defaultConfig_(),
      /* overrides (only used for player config)*/ {}, /* path */ '');
  return ret;
};


/**
 * @param {string|!Object} config This should either be a field name or an
 *   object following the form of {@link shaka.extern.UIConfiguration}, where
 *   you may omit any field you do not wish to change.
 * @param {*=} value This should be provided if the previous parameter
 *   was a string field name.
 * @export
 */
shaka.ui.Overlay.prototype.configure = function(config, value) {
  goog.asserts.assert(typeof(config) == 'object' || arguments.length == 2,
                      'String configs should have values!');

  // ('fieldName', value) format
  if (arguments.length == 2 && typeof(config) == 'string') {
    config = shaka.util.ConfigUtils.convertToConfigObject(config, value);
  }

  goog.asserts.assert(typeof(config) == 'object', 'Should be an object!');

  shaka.util.ConfigUtils.mergeConfigObjects(
        this.config_, config, this.defaultConfig_(),
        /* overrides (only used for player config)*/ {}, /* path */ '');

  // If a cast receiver app id has been given, add a cast button to the UI
  if (this.config_.castReceiverAppId &&
      !this.config_.overflowMenuButtons.includes('cast')) {
    this.config_.overflowMenuButtons.push('cast');
  }

  goog.asserts.assert(this.player_ != null, 'Should have a player!');

  this.controls_.configure(this.config_);

  this.controls_.dispatchEvent(new shaka.util.FakeEvent('uiupdated'));
};


/**
 * @return {shaka.Player}
 * @export
 * @deprecated Use getControls().getPlayer() instead.
 */
shaka.ui.Overlay.prototype.getPlayer = function() {
  shaka.Deprecate.deprecateFeature(
      2, 6,
      'ui.Overlay.getPlayer()',
      'Please use getControls().getPlayer() instead.');

  return this.controls_.getPlayer();
};


/**
 * @return {shaka.ui.Controls}
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
      'cast',
    ],
    addSeekBar: true,
    addBigPlayButton: true,
    castReceiverAppId: '',
    clearBufferOnQualityChange: true,
      seekBarColors: {
        base: 'rgba(255, 255, 255, 0.3)',
        buffered: 'rgba(255, 255, 255, 0.54)',
        played: 'rgb(255, 255, 255)',
      },
      volumeBarColors: {
        base: 'rgba(255, 255, 255, 0.54)',
        level: 'rgb(255, 255, 255)',
      },
  };
};


/**
 * @private
 */
shaka.ui.Overlay.scanPageForShakaElements_ = async function() {
  // Install built-in polyfills to patch browser incompatibilities.
  shaka.polyfill.installAll();
  // Check to see if the browser supports the basic APIs Shaka needs.
  if (!shaka.Player.isBrowserSupported()) {
    shaka.log.error('Shaka Player does not support this browser. ' +
        'Please see https://tinyurl.com/y7s4j9tr for the list of ' +
        'supported browsers.');

    // After scanning the page for elements, fire a special "loaded" event for
    // when the load fails. This will allow the page to react to the failure.
    shaka.ui.Overlay.dispatchLoadedEvent_('shaka-ui-load-failed');
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
      // If the app has already manually created a UI for this element,
      // don't create another one.
      if (video['ui']) {
        continue;
      }
      goog.asserts.assert(video.tagName.toLowerCase() == 'video',
        'Should be a video element!');

      const container = document.createElement('div');
      const videoParent = video.parentElement;
      videoParent.replaceChild(container, video);
      container.appendChild(video);

        shaka.ui.Overlay.setupUIandAutoLoad_(container, video);
    }
  } else {
    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      // If the app has already manually created a UI for this element,
      // don't create another one.
      if (container['ui']) {
        continue;
      }
      goog.asserts.assert(container.tagName.toLowerCase() == 'div',
        'Container should be a div!');


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
        video.setAttribute('playsinline', '');
        container.appendChild(video);
      }

      // eslint-disable-next-line no-await-in-loop
      await shaka.ui.Overlay.setupUIandAutoLoad_(container, video);
    }
  }

  // After scanning the page for elements, fire the "loaded" event.  This will
  // let apps know they can use the UI library programmatically now, even if
  // they didn't have any Shaka-related elements declared in their HTML.
  shaka.ui.Overlay.dispatchLoadedEvent_('shaka-ui-loaded');
};


/**
 * @param {string} eventName
 * @private
 */
shaka.ui.Overlay.dispatchLoadedEvent_ = function(eventName) {
  // "Event" is not constructable on IE, so we use this CustomEvent pattern.
  const uiLoadedEvent = /** @type {!CustomEvent} */(
      document.createEvent('CustomEvent'));
  uiLoadedEvent.initCustomEvent(eventName, false, false, null);

  document.dispatchEvent(uiLoadedEvent);
};


/**
 * @param {!Element} container
 * @param {!Element} video
 * @private
 */
shaka.ui.Overlay.setupUIandAutoLoad_ = async function(container, video) {
  // Create the UI
    const player = new shaka.Player(
        shaka.util.Dom.asHTMLMediaElement(video));
    const ui = new shaka.ui.Overlay(player,
      shaka.util.Dom.asHTMLElement(container),
      shaka.util.Dom.asHTMLMediaElement(video));

  // Get and configure cast app id.
  let castAppId = '';

  // Cast receiver id can be specified on either container or video.
  // It should not be provided on both. If it was, we will use the last
  // one we saw.
  if (container['dataset'] &&
      container['dataset']['shakaPlayerCastReceiverId']) {
    castAppId = container['dataset']['shakaPlayerCastReceiverId'];
  } else if (video['dataset'] &&
             video['dataset']['shakaPlayerCastReceiverId']) {
    castAppId = video['dataset']['shakaPlayerCastReceiverId'];
  }

  if (castAppId.length) {
    ui.configure({castReceiverAppId: castAppId});
  }

  if (shaka.util.Dom.asHTMLMediaElement(video).controls) {
    ui.getControls().setEnabledNativeControls(true);
  }

  // Get the source and load it
  // Source can be specified either on the video element:
  //  <video src='foo.m2u8'></video>
  // or as a separate element inside the video element:
  //  <video>
  //    <source src='foo.m2u8'/>
  //  </video>
  // It should not be specified on both.
  const src = video.getAttribute('src');
  if (src) {
    const sourceElem = document.createElement('source');
    sourceElem.setAttribute('src', src);
    video.appendChild(sourceElem);
    video.removeAttribute('src');
  }

  for (const elem of video.querySelectorAll('source')) {
    try { // eslint-disable-next-line no-await-in-loop
      await ui.getControls().getPlayer().load(elem.getAttribute('src'));
      break;
    } catch (e) {
      shaka.log.error('Error auto-loading asset', e);
    }
  }
};


if (document.readyState == 'complete') {
  // Don't fire this event synchronously.  In a compiled bundle, the "shaka"
  // namespace might not be exported to the window until after this point.
  Promise.resolve().then(shaka.ui.Overlay.scanPageForShakaElements_);
} else {
  window.addEventListener('load', shaka.ui.Overlay.scanPageForShakaElements_);
}
