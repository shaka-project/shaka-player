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

goog.provide('shaka.cast.CastProxy');

goog.require('goog.asserts');
goog.require('shaka.Deprecate');
goog.require('shaka.cast.CastSender');
goog.require('shaka.cast.CastUtils');
goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');


/**
 * A proxy to switch between local and remote playback for Chromecast in a way
 * that is transparent to the app's controls.
 *
 * @constructor
 * @struct
 * @param {!HTMLMediaElement} video The local video element associated with the
 *   local Player instance.
 * @param {!shaka.Player} player A local Player instance.
 * @param {string} receiverAppId The ID of the cast receiver application.
 *   If blank, casting will not be available, but the proxy will still function
 *   otherwise.
 * @implements {shaka.util.IDestroyable}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.cast.CastProxy = function(video, player, receiverAppId) {
  shaka.util.FakeEventTarget.call(this);

  /** @private {HTMLMediaElement} */
  this.localVideo_ = video;

  /** @private {shaka.Player} */
  this.localPlayer_ = player;

  /** @private {Object} */
  this.videoProxy_ = null;

  /** @private {Object} */
  this.playerProxy_ = null;

  /** @private {shaka.util.FakeEventTarget} */
  this.videoEventTarget_ = null;

  /** @private {shaka.util.FakeEventTarget} */
  this.playerEventTarget_ = null;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = null;

  /** @private {string} */
  this.receiverAppId_ = receiverAppId;

  /** @private {!Map} */
  this.compiledToExternNames_ = new Map();

  /** @private {shaka.cast.CastSender} */
  this.sender_ = new shaka.cast.CastSender(
      receiverAppId,
      () => this.onCastStatusChanged_(),
      () => this.onFirstCastStateUpdate_(),
      (targetName, event) => this.onRemoteEvent_(targetName, event),
      () => this.onResumeLocal_(),
      () => this.getInitState_());

  this.init_();
};
goog.inherits(shaka.cast.CastProxy, shaka.util.FakeEventTarget);


/**
 * Destroys the proxy and the underlying local Player.
 *
 * @param {boolean=} forceDisconnect If true, force the receiver app to shut
 *   down by disconnecting.  Does nothing if not connected.
 * @override
 * @export
 */
shaka.cast.CastProxy.prototype.destroy = function(forceDisconnect) {
  if (forceDisconnect) {
    this.sender_.forceDisconnect();
  }

  if (this.eventManager_) {
    this.eventManager_.release();
    this.eventManager_ = null;
  }

  const waitFor = [];
  if (this.localPlayer_) {
    waitFor.push(this.localPlayer_.destroy());
    this.localPlayer_ = null;
  }

  if (this.sender_) {
    waitFor.push(this.sender_.destroy());
    this.sender_ = null;
  }

  this.localVideo_ = null;
  this.videoProxy_ = null;
  this.playerProxy_ = null;

  return Promise.all(waitFor);
};


/**
 * @event shaka.cast.CastProxy.CastStatusChangedEvent
 * @description Fired when cast status changes.  The status change will be
 *   reflected in canCast() and isCasting().
 * @property {string} type
 *   'caststatuschanged'
 * @exportDoc
 */


/**
 * Get a proxy for the video element that delegates to local and remote video
 * elements as appropriate.
 *
 * @suppress {invalidCasts} to cast proxy Objects to unrelated types
 * @return {!HTMLMediaElement}
 * @export
 */
shaka.cast.CastProxy.prototype.getVideo = function() {
  return /** @type {!HTMLMediaElement} */(this.videoProxy_);
};


/**
 * Get a proxy for the Player that delegates to local and remote Player objects
 * as appropriate.
 *
 * @suppress {invalidCasts} to cast proxy Objects to unrelated types
 * @return {!shaka.Player}
 * @export
 */
shaka.cast.CastProxy.prototype.getPlayer = function() {
  return /** @type {!shaka.Player} */(this.playerProxy_);
};


/**
 * @return {boolean} True if the cast API is available and there are receivers.
 * @export
 */
shaka.cast.CastProxy.prototype.canCast = function() {
  return this.sender_.apiReady() && this.sender_.hasReceivers();
};


/**
 * @return {boolean} True if we are currently casting.
 * @export
 */
shaka.cast.CastProxy.prototype.isCasting = function() {
  return this.sender_.isCasting();
};


/**
 * @return {string} The name of the Cast receiver device, if isCasting().
 * @export
 */
shaka.cast.CastProxy.prototype.receiverName = function() {
  return this.sender_.receiverName();
};


/**
 * @return {!Promise} Resolved when connected to a receiver.  Rejected if the
 *   connection fails or is canceled by the user.
 * @export
 */
shaka.cast.CastProxy.prototype.cast = function() {
  let initState = this.getInitState_();

  // TODO: transfer manually-selected tracks?
  // TODO: transfer side-loaded text tracks?

  return this.sender_.cast(initState).then(function() {
    if (!this.localPlayer_) {
      // We've already been destroyed.
      return;
    }

    // Unload the local manifest when casting succeeds.
    return this.localPlayer_.unload();
  }.bind(this));
};


/**
 * Set application-specific data.
 *
 * @param {Object} appData Application-specific data to relay to the receiver.
 * @export
 */
shaka.cast.CastProxy.prototype.setAppData = function(appData) {
  this.sender_.setAppData(appData);
};


/**
 * Show a dialog where user can choose to disconnect from the cast connection.
 * @export
 */
shaka.cast.CastProxy.prototype.suggestDisconnect = function() {
  this.sender_.showDisconnectDialog();
};


/**
 * @param {string} newAppId
 * @export
 */
shaka.cast.CastProxy.prototype.changeReceiverId = async function(newAppId) {
  if (newAppId == this.receiverAppId_) {
    // Nothing to change
    return;
  }

  this.receiverAppId_ = newAppId;

  // Destroy the old sender
  this.sender_.forceDisconnect();
  await this.sender_.destroy();
  this.sender_ = null;

  // Create the new one
  this.sender_ = new shaka.cast.CastSender(
      newAppId,
      () => this.onCastStatusChanged_(),
      () => this.onFirstCastStateUpdate_(),
      (targetName, event) => this.onRemoteEvent_(targetName, event),
      () => this.onResumeLocal_(),
      () => this.getInitState_());

  this.sender_.init();
};


/**
 * Force the receiver app to shut down by disconnecting.
 * @export
 */
shaka.cast.CastProxy.prototype.forceDisconnect = function() {
  this.sender_.forceDisconnect();
};


/**
 * Initialize the Proxies and the Cast sender.
 * @private
 */
shaka.cast.CastProxy.prototype.init_ = function() {
  this.sender_.init();

  this.eventManager_ = new shaka.util.EventManager();

  shaka.cast.CastUtils.VideoEvents.forEach(function(name) {
    this.eventManager_.listen(this.localVideo_, name,
        this.videoProxyLocalEvent_.bind(this));
  }.bind(this));

  shaka.cast.CastUtils.PlayerEvents.forEach(function(name) {
    this.eventManager_.listen(this.localPlayer_, name,
        this.playerProxyLocalEvent_.bind(this));
  }.bind(this));

  // We would like to use Proxy here, but it is not supported on IE11 or Safari.
  this.videoProxy_ = {};
  for (let k in this.localVideo_) {
    Object.defineProperty(this.videoProxy_, k, {
      configurable: false,
      enumerable: true,
      get: this.videoProxyGet_.bind(this, k),
      set: this.videoProxySet_.bind(this, k),
    });
  }

  this.playerProxy_ = {};
  this.iterateOverPlayerMethods_((name, method) => {
    goog.asserts.assert(this.playerProxy_, 'Must have player proxy!');
    Object.defineProperty(this.playerProxy_, name, {
      configurable: false,
      enumerable: true,
      get: () => this.playerProxyGet_(name),
    });
  });

  if (COMPILED) {
    this.mapCompiledToUncompiledPlayerMethodNames_();
  }

  this.videoEventTarget_ = new shaka.util.FakeEventTarget();
  this.videoEventTarget_.dispatchTarget =
      /** @type {EventTarget} */(this.videoProxy_);

  this.playerEventTarget_ = new shaka.util.FakeEventTarget();
  this.playerEventTarget_.dispatchTarget =
      /** @type {EventTarget} */(this.playerProxy_);
};


/**
 * Maps compiled to uncompiled player names so we can figure out
 * which method to call in compiled build, while casting.
 * @private
 */
shaka.cast.CastProxy.prototype.
    mapCompiledToUncompiledPlayerMethodNames_ = function() {
  // In compiled mode, UI tries to access player methods
  // by their internal renamed names, but the proxy object doesn't know about
  // those.
  // See https://github.com/google/shaka-player/issues/2130 for details.
  const methodsToNames = new Map();
  this.iterateOverPlayerMethods_((name, method) => {
    if (methodsToNames.has(method)) {
      // If two method names, point to the same method, add them to the
      // map as aliases of each other.
      const name2 = methodsToNames.get(method);
      // Assumes that the compiled name is shorter
      if (name.length < name2.length) {
        this.compiledToExternNames_.set(name, name2);
      } else {
        this.compiledToExternNames_.set(name2, name);
      }
    } else {
      methodsToNames.set(method, name);
    }
  });
};


/**
 * Iterates over all of the methods of the player, including inherited methods
 * from FakeEventTarget.
 * @param {function(string, function())} operation
 * @private
 */
shaka.cast.CastProxy.prototype.iterateOverPlayerMethods_ = function(operation) {
  goog.asserts.assert(this.localPlayer_, 'Must have player!');
  const player = /** @type {!Object} */ (this.localPlayer_);
  // Avoid accessing any over-written methods in the prototype chain.
  const seenNames = new Set();

  /**
   * @param {string} name
   * @return {boolean}
   */
  function shouldAddToTheMap(name) {
    if (name == 'constructor') {
      // Don't proxy the constructor.
      return false;
    }

    const method = /** @type {Object} */(player)[name];
    if (typeof method != 'function') {
      // Don't proxy non-methods.
      return false;
    }

    // Add if the map does not already have it
    return !seenNames.has(name);
  }

  // First, look at the methods on the object itself, so this can properly
  // proxy any methods not on the prototype (for example, in the mock player).
  for (const key in player) {
    if (shouldAddToTheMap(key)) {
      seenNames.add(key);
      operation(key, player[key]);
    }
  }

  // The exact length of the prototype chain might vary; for resiliency, this
  // will just look at the entire chain, rather than assuming a set length.
  let proto = /** @type {!Object} */ (Object.getPrototypeOf(player));
  const objProto = /** @type {!Object} */ (Object.getPrototypeOf({}));
  while (proto && proto != objProto) { // Don't proxy Object methods.
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (shouldAddToTheMap(name)) {
        seenNames.add(name);
        operation(name, (player)[name]);
      }
    }
    proto = /** @type {!Object} */ (Object.getPrototypeOf(proto));
  }
};


/**
 * @return {shaka.cast.CastUtils.InitStateType} initState Video and player state
 *   to be sent to the receiver.
 * @private
 */
shaka.cast.CastProxy.prototype.getInitState_ = function() {
  let initState = {
    'video': {},
    'player': {},
    'playerAfterLoad': {},
    'manifest': this.localPlayer_.getAssetUri(),
    'startTime': null,
  };

  // Pause local playback before capturing state.
  this.localVideo_.pause();

  shaka.cast.CastUtils.VideoInitStateAttributes.forEach(function(name) {
    initState['video'][name] = this.localVideo_[name];
  }.bind(this));

  // If the video is still playing, set the startTime.
  // Has no effect if nothing is loaded.
  if (!this.localVideo_.ended) {
    initState['startTime'] = this.localVideo_.currentTime;
  }

  shaka.cast.CastUtils.PlayerInitState.forEach(function(pair) {
    let getter = pair[0];
    let setter = pair[1];
    let value = /** @type {Object} */(this.localPlayer_)[getter]();

    initState['player'][setter] = value;
  }.bind(this));

  shaka.cast.CastUtils.PlayerInitAfterLoadState.forEach(function(pair) {
    let getter = pair[0];
    let setter = pair[1];
    let value = /** @type {Object} */(this.localPlayer_)[getter]();

    initState['playerAfterLoad'][setter] = value;
  }.bind(this));

  return initState;
};


/**
 * Dispatch an event to notify the app that the status has changed.
 * @private
 */
shaka.cast.CastProxy.prototype.onCastStatusChanged_ = function() {
  let event = new shaka.util.FakeEvent('caststatuschanged');
  this.dispatchEvent(event);
};


/**
 * Dispatch a synthetic play or pause event to ensure that the app correctly
 * knows that the player is playing, if joining an existing receiver.
 * @private
 */
shaka.cast.CastProxy.prototype.onFirstCastStateUpdate_ = function() {
  let type = this.videoProxy_.paused ? 'pause' : 'play';
  let fakeEvent = new shaka.util.FakeEvent(type);
  this.videoEventTarget_.dispatchEvent(fakeEvent);
};


/**
 * Transfer remote state back and resume local playback.
 * @private
 */
shaka.cast.CastProxy.prototype.onResumeLocal_ = function() {
  // Transfer back the player state.
  shaka.cast.CastUtils.PlayerInitState.forEach(function(pair) {
    let getter = pair[0];
    let setter = pair[1];
    let value = this.sender_.get('player', getter)();
    /** @type {Object} */(this.localPlayer_)[setter](value);
  }.bind(this));

  // Get the most recent manifest URI and ended state.
  let assetUri = this.sender_.get('player', 'getAssetUri')();
  let ended = this.sender_.get('video', 'ended');

  let manifestReady = Promise.resolve();
  let autoplay = this.localVideo_.autoplay;

  let startTime = null;

  // If the video is still playing, set the startTime.
  // Has no effect if nothing is loaded.
  if (!ended) {
    startTime = this.sender_.get('video', 'currentTime');
  }

  // Now load the manifest, if present.
  if (assetUri) {
    // Don't autoplay the content until we finish setting up initial state.
    this.localVideo_.autoplay = false;
    manifestReady = this.localPlayer_.load(assetUri, startTime);
  }

  // Get the video state into a temp variable since we will apply it async.
  let videoState = {};
  shaka.cast.CastUtils.VideoInitStateAttributes.forEach(function(name) {
    videoState[name] = this.sender_.get('video', name);
  }.bind(this));

  // Finally, take on video state and player's "after load" state.
  manifestReady.then(() => {
    if (!this.localVideo_) {
      // We've already been destroyed.
      return;
    }

    shaka.cast.CastUtils.VideoInitStateAttributes.forEach(function(name) {
      this.localVideo_[name] = videoState[name];
    }.bind(this));

    shaka.cast.CastUtils.PlayerInitAfterLoadState.forEach(function(pair) {
      let getter = pair[0];
      let setter = pair[1];
      let value = this.sender_.get('player', getter)();
      /** @type {Object} */(this.localPlayer_)[setter](value);
    }.bind(this));

    // Restore the original autoplay setting.
    this.localVideo_.autoplay = autoplay;
    if (assetUri) {
      // Resume playback with transferred state.
      this.localVideo_.play();
    }
  }, (error) => {
    // Pass any errors through to the app.
    goog.asserts.assert(error instanceof shaka.util.Error,
                        'Wrong error type!');
    let event = new shaka.util.FakeEvent('error', {'detail': error});
    this.localPlayer_.dispatchEvent(event);
  });
};


/**
 * @param {string} name
 * @return {?}
 * @private
 */
shaka.cast.CastProxy.prototype.videoProxyGet_ = function(name) {
  if (name == 'addEventListener') {
    return this.videoEventTarget_.addEventListener.bind(
        this.videoEventTarget_);
  }
  if (name == 'removeEventListener') {
    return this.videoEventTarget_.removeEventListener.bind(
        this.videoEventTarget_);
  }

  // If we are casting, but the first update has not come in yet, use local
  // values, but not local methods.
  if (this.sender_.isCasting() && !this.sender_.hasRemoteProperties()) {
    let value = this.localVideo_[name];
    if (typeof value != 'function') {
      return value;
    }
  }

  // Use local values and methods if we are not casting.
  if (!this.sender_.isCasting()) {
    let value = this.localVideo_[name];
    if (typeof value == 'function') {
      value = value.bind(this.localVideo_);
    }
    return value;
  }

  return this.sender_.get('video', name);
};


/**
 * @param {string} name
 * @param {?} value
 * @private
 */
shaka.cast.CastProxy.prototype.videoProxySet_ = function(name, value) {
  if (!this.sender_.isCasting()) {
    this.localVideo_[name] = value;
    return;
  }

  this.sender_.set('video', name, value);
};


/**
 * @param {!Event} event
 * @private
 */
shaka.cast.CastProxy.prototype.videoProxyLocalEvent_ = function(event) {
  if (this.sender_.isCasting()) {
    // Ignore any unexpected local events while casting.  Events can still be
    // fired by the local video and Player when we unload() after the Cast
    // connection is complete.
    return;
  }

  // Convert this real Event into a FakeEvent for dispatch from our
  // FakeEventListener.
  let fakeEvent = new shaka.util.FakeEvent(event.type, event);
  this.videoEventTarget_.dispatchEvent(fakeEvent);
};


/**
 * @param {string} name
 * @return {?}
 * @private
 */
shaka.cast.CastProxy.prototype.playerProxyGet_ = function(name) {
  // If name is a shortened compiled name, get the original version from our
  // map.
  if (this.compiledToExternNames_.has(name)) {
    name = this.compiledToExternNames_.get(name);
  }

  if (name == 'addEventListener') {
    return this.playerEventTarget_.addEventListener.bind(
        this.playerEventTarget_);
  }
  if (name == 'removeEventListener') {
    return this.playerEventTarget_.removeEventListener.bind(
        this.playerEventTarget_);
  }

  if (name == 'getMediaElement') {
    return function() { return this.videoProxy_; }.bind(this);
  }

  if (name == 'getSharedConfiguration') {
    shaka.log.warning(
        'Can\'t share configuration across a network. Returning copy.');
    return this.sender_.get('player', 'getConfiguration');
  }

  if (name == 'getNetworkingEngine') {
    // Always returns a local instance, in case you need to make a request.
    // Issues a warning, in case you think you are making a remote request
    // or affecting remote filters.
    if (this.sender_.isCasting()) {
      shaka.log.warning('NOTE: getNetworkingEngine() is always local!');
    }
    return this.localPlayer_.getNetworkingEngine.bind(this.localPlayer_);
  }

  if (this.sender_.isCasting()) {
    // These methods are unavailable or otherwise stubbed during casting.
    if (name == 'getManifest' || name == 'drmInfo') {
      return function() {
        shaka.log.alwaysWarn(name + '() does not work while casting!');
        return null;
      };
    }

    if (name == 'getManifestUri') {
      shaka.Deprecate.deprecateFeature(
          2, 6,
          'getManifestUri',
          'Please use "getAssetUri" instead.');

      return this.playerProxyGet_('getAssetUri');
    }

    if (name == 'attach' || name == 'detach') {
      return function() {
        shaka.log.alwaysWarn(name + '() does not work while casting!');
        return Promise.resolve();
      };
    }
  }  // if (this.sender_.isCasting())

  // If we are casting, but the first update has not come in yet, use local
  // getters, but not local methods.
  if (this.sender_.isCasting() && !this.sender_.hasRemoteProperties()) {
    if (shaka.cast.CastUtils.PlayerGetterMethods[name]) {
      let value = /** @type {Object} */(this.localPlayer_)[name];
      goog.asserts.assert(typeof value == 'function', 'only methods on Player');
      return value.bind(this.localPlayer_);
    }
  }

  // Use local getters and methods if we are not casting.
  if (!this.sender_.isCasting()) {
    let value = /** @type {Object} */(this.localPlayer_)[name];
    goog.asserts.assert(typeof value == 'function', 'only methods on Player');
    return value.bind(this.localPlayer_);
  }

  return this.sender_.get('player', name);
};


/**
 * @param {!Event} event
 * @private
 */
shaka.cast.CastProxy.prototype.playerProxyLocalEvent_ = function(event) {
  if (this.sender_.isCasting()) {
    // Ignore any unexpected local events while casting.
    return;
  }

  this.playerEventTarget_.dispatchEvent(event);
};


/**
 * @param {string} targetName
 * @param {!shaka.util.FakeEvent} event
 * @private
 */
shaka.cast.CastProxy.prototype.onRemoteEvent_ = function(targetName, event) {
  goog.asserts.assert(this.sender_.isCasting(),
                      'Should only receive remote events while casting');
  if (!this.sender_.isCasting()) {
    // Ignore any unexpected remote events.
    return;
  }

  if (targetName == 'video') {
    this.videoEventTarget_.dispatchEvent(event);
  } else if (targetName == 'player') {
    this.playerEventTarget_.dispatchEvent(event);
  }
};
