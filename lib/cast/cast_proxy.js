/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cast.CastProxy');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.cast.CastSender');
goog.require('shaka.cast.CastUtils');
goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');


/**
 * @event shaka.cast.CastProxy.CastStatusChangedEvent
 * @description Fired when cast status changes.  The status change will be
 *   reflected in canCast() and isCasting().
 * @property {string} type
 *   'caststatuschanged'
 * @exportDoc
 */


/**
 * @summary A proxy to switch between local and remote playback for Chromecast
 * in a way that is transparent to the app's controls.
 *
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.cast.CastProxy = class extends shaka.util.FakeEventTarget {
  /**
   * @param {!HTMLMediaElement} video The local video element associated with
   *   the local Player instance.
   * @param {!shaka.Player} player A local Player instance.
   * @param {string} receiverAppId The ID of the cast receiver application.
   *   If blank, casting will not be available, but the proxy will still
   *   function otherwise.
   * @param {boolean} androidReceiverCompatible Indicates if the app is
   *   compatible with an Android Receiver.
   */
  constructor(video, player, receiverAppId,
      androidReceiverCompatible = false) {
    super();

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

    /** @private {boolean} */
    this.androidReceiverCompatible_ = androidReceiverCompatible;

    /** @private {!Array<?>} */
    this.addThumbnailsTrackCalls_ = [];

    /** @private {!Array<?>} */
    this.addTextTrackAsyncCalls_ = [];

    /** @private {!Array<?>} */
    this.addChaptersTrackCalls_ = [];

    /** @private {!Map} */
    this.compiledToExternNames_ = new Map();

    /** @private {shaka.cast.CastSender} */
    this.sender_ = null;

    if (window.chrome) {
      this.sender_ = new shaka.cast.CastSender(
          receiverAppId,
          () => this.onCastStatusChanged_(),
          () => this.onFirstCastStateUpdate_(),
          (targetName, event) => this.onRemoteEvent_(targetName, event),
          () => this.onResumeLocal_(),
          () => this.getInitState_(),
          androidReceiverCompatible);
      this.init_();
    } else {
      this.initWithoutSender_();
    }
  }

  /**
   * Destroys the proxy and the underlying local Player.
   *
   * @param {boolean=} forceDisconnect If true, force the receiver app to shut
   *   down by disconnecting.  Does nothing if not connected.
   * @override
   * @export
   */
  destroy(forceDisconnect = false) {
    if (this.sender_ && forceDisconnect) {
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

    // FakeEventTarget implements IReleasable
    super.release();

    return Promise.all(waitFor);
  }

  /**
   * Get a proxy for the video element that delegates to local and remote video
   * elements as appropriate.
   *
   * @suppress {invalidCasts} to cast proxy Objects to unrelated types
   * @return {!HTMLMediaElement}
   * @export
   */
  getVideo() {
    return /** @type {!HTMLMediaElement} */(this.videoProxy_);
  }

  /**
   * Get a proxy for the Player that delegates to local and remote Player
   * objects as appropriate.
   *
   * @suppress {invalidCasts} to cast proxy Objects to unrelated types
   * @return {!shaka.Player}
   * @export
   */
  getPlayer() {
    return /** @type {!shaka.Player} */(this.playerProxy_);
  }

  /**
   * @return {boolean} True if the cast API is available and there are
   *   receivers.
   * @export
   */
  canCast() {
    if (!this.sender_) {
      return false;
    }
    return this.sender_.apiReady() && this.sender_.hasReceivers();
  }

  /**
   * @return {boolean} True if we are currently casting.
   * @export
   */
  isCasting() {
    if (!this.sender_) {
      return false;
    }
    return this.sender_.isCasting();
  }

  /**
   * @return {string} The name of the Cast receiver device, if isCasting().
   * @export
   */
  receiverName() {
    if (!this.sender_) {
      return '';
    }
    return this.sender_.receiverName();
  }

  /**
   * @return {!Promise} Resolved when connected to a receiver.  Rejected if the
   *   connection fails or is canceled by the user.
   * @export
   */
  async cast() {
    if (!this.sender_) {
      return;
    }
    // TODO: transfer manually-selected tracks?

    await this.sender_.cast();
    if (!this.localPlayer_) {
      // We've already been destroyed.
      return;
    }

    // Unload the local manifest when casting succeeds.
    await this.localPlayer_.unload();
  }

  /**
   * Set application-specific data.
   *
   * @param {Object} appData Application-specific data to relay to the receiver.
   * @export
   */
  setAppData(appData) {
    if (!this.sender_) {
      return;
    }
    this.sender_.setAppData(appData);
  }

  /**
   * Show a dialog where user can choose to disconnect from the cast connection.
   * @export
   */
  suggestDisconnect() {
    if (!this.sender_) {
      return;
    }
    this.sender_.showDisconnectDialog();
  }

  /**
   * Force the receiver app to shut down by disconnecting.
   * @export
   */
  forceDisconnect() {
    if (!this.sender_) {
      return;
    }
    this.sender_.forceDisconnect();
  }


  /**
   * @param {string} newAppId
   * @param {boolean=} newCastAndroidReceiver
   * @export
   */
  async changeReceiverId(newAppId, newCastAndroidReceiver = false) {
    if (newAppId == this.receiverAppId_ &&
        newCastAndroidReceiver == this.androidReceiverCompatible_) {
      // Nothing to change
      return;
    }

    this.receiverAppId_ = newAppId;
    this.androidReceiverCompatible_ = newCastAndroidReceiver;

    if (!this.sender_) {
      return;
    }

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
        () => this.getInitState_(),
        newCastAndroidReceiver);

    this.sender_.init();
  }

  /**
   * Initialize the Proxies without Cast sender.
   * @private
   */
  initWithoutSender_() {
    this.videoProxy_ = /** @type {Object} */(this.localVideo_);
    this.playerProxy_ = /** @type {Object} */(this.localPlayer_);
  }

  /**
   * Initialize the Proxies and the Cast sender.
   * @private
   */
  init_() {
    this.sender_.init();

    this.eventManager_ = new shaka.util.EventManager();

    for (const name of shaka.cast.CastUtils.VideoEvents) {
      this.eventManager_.listen(this.localVideo_, name,
          (event) => this.videoProxyLocalEvent_(event));
    }

    for (const key in shaka.util.FakeEvent.EventName) {
      const name = shaka.util.FakeEvent.EventName[key];
      this.eventManager_.listen(this.localPlayer_, name,
          (event) => this.playerProxyLocalEvent_(event));
    }

    // We would like to use Proxy here, but it is not supported on Safari.
    this.videoProxy_ = {};
    for (const k in this.localVideo_) {
      Object.defineProperty(this.videoProxy_, k, {
        configurable: false,
        enumerable: true,
        get: () => this.videoProxyGet_(k),
        set: (value) => { this.videoProxySet_(k, value); },
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

    this.eventManager_.listen(this.localPlayer_,
        shaka.util.FakeEvent.EventName.Unloading, () => {
          if (this.sender_ && this.sender_.isCasting()) {
            return;
          }
          this.resetExternalTracks();
        });
  }


  /**
   * Maps compiled to uncompiled player names so we can figure out
   * which method to call in compiled build, while casting.
   * @private
   */
  mapCompiledToUncompiledPlayerMethodNames_() {
    // In compiled mode, UI tries to access player methods by their internal
    // renamed names, but the proxy object doesn't know about those.  See
    // https://github.com/shaka-project/shaka-player/issues/2130 for details.
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
  }

  /**
   * Iterates over all of the methods of the player, including inherited methods
   * from FakeEventTarget.
   * @param {function(string, function())} operation
   * @private
   */
  iterateOverPlayerMethods_(operation) {
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
  }

  /**
   * @return {shaka.cast.CastUtils.InitStateType} initState Video and player
   *   state to be sent to the receiver.
   * @private
   */
  getInitState_() {
    const initState = {
      'video': {},
      'player': {},
      'playerAfterLoad': {},
      'manifest': this.localPlayer_.getAssetUri(),
      'startTime': null,
      'addThumbnailsTrackCalls': this.addThumbnailsTrackCalls_,
      'addTextTrackAsyncCalls': this.addTextTrackAsyncCalls_,
      'addChaptersTrackCalls': this.addChaptersTrackCalls_,
    };

    // Pause local playback before capturing state.
    this.localVideo_.pause();

    for (const name of shaka.cast.CastUtils.VideoInitStateAttributes) {
      initState['video'][name] = this.localVideo_[name];
    }

    // If the video is still playing, set the startTime.
    // Has no effect if nothing is loaded.
    if (!this.localVideo_.ended) {
      initState['startTime'] = this.localVideo_.currentTime;
    }

    for (const pair of shaka.cast.CastUtils.PlayerInitState) {
      const getter = pair[0];
      const setter = pair[1];
      const value = /** @type {Object} */(this.localPlayer_)[getter]();

      initState['player'][setter] = value;
    }

    for (const pair of shaka.cast.CastUtils.PlayerInitAfterLoadState) {
      const getter = pair[0];
      const setter = pair[1];
      const value = /** @type {Object} */(this.localPlayer_)[getter]();

      initState['playerAfterLoad'][setter] = value;
    }

    return initState;
  }

  /**
   * Dispatch an event to notify the app that the status has changed.
   * @private
   */
  onCastStatusChanged_() {
    const event = new shaka.util.FakeEvent('caststatuschanged');
    this.dispatchEvent(event);
  }

  /**
   * Dispatch a synthetic play or pause event to ensure that the app correctly
   * knows that the player is playing, if joining an existing receiver.
   * @private
   */
  onFirstCastStateUpdate_() {
    const type = this.videoProxy_['paused'] ? 'pause' : 'play';
    const fakeEvent = new shaka.util.FakeEvent(type);
    this.videoEventTarget_.dispatchEvent(fakeEvent);
  }

  /**
   * Transfer remote state back and resume local playback.
   * @private
   */
  onResumeLocal_() {
    // Transfer back the player state.
    for (const pair of shaka.cast.CastUtils.PlayerInitState) {
      const getter = pair[0];
      const setter = pair[1];
      const value = this.sender_.get('player', getter)();
      /** @type {Object} */(this.localPlayer_)[setter](value);
    }

    const addThumbnailsTrackCalls = this.addThumbnailsTrackCalls_;
    const addTextTrackAsyncCalls = this.addTextTrackAsyncCalls_;
    const addChaptersTrackCalls = this.addChaptersTrackCalls_;

    this.resetExternalTracks();

    // Get the most recent manifest URI and ended state.
    const assetUri = this.sender_.get('player', 'getAssetUri')();
    const ended = this.sender_.get('video', 'ended');

    let manifestReady = Promise.resolve();
    const autoplay = this.localVideo_.autoplay;

    let startTime = null;

    // If the video is still playing, set the startTime.
    // Has no effect if nothing is loaded.
    if (!ended) {
      startTime = this.sender_.get('video', 'currentTime');
    }

    let activeTextTrack;
    const textTracks = this.sender_.get('player', 'getTextTracks')();

    if (textTracks && textTracks.length) {
      activeTextTrack = textTracks.find((t) => t.active);
    }

    const isTextTrackVisible =
        this.sender_.get('player', 'isTextTrackVisible')();

    // Now load the manifest, if present.
    if (assetUri) {
      // Don't autoplay the content until we finish setting up initial state.
      this.localVideo_.autoplay = false;
      manifestReady = this.localPlayer_.load(assetUri, startTime);
    }

    // Get the video state into a temp variable since we will apply it async.
    const videoState = {};
    for (const name of shaka.cast.CastUtils.VideoInitStateAttributes) {
      videoState[name] = this.sender_.get('video', name);
    }

    // Finally, take on video state and player's "after load" state.
    manifestReady.then(() => {
      if (!this.localVideo_) {
        // We've already been destroyed.
        return;
      }

      for (const args of addThumbnailsTrackCalls) {
        this.getPlayer().addThumbnailsTrack(...args);
      }
      for (const args of addTextTrackAsyncCalls) {
        this.getPlayer().addTextTrackAsync(...args);
      }
      for (const args of addChaptersTrackCalls) {
        this.getPlayer().addChaptersTrack(...args);
      }

      for (const name of shaka.cast.CastUtils.VideoInitStateAttributes) {
        this.localVideo_[name] = videoState[name];
      }

      for (const pair of shaka.cast.CastUtils.PlayerInitAfterLoadState) {
        const getter = pair[0];
        const setter = pair[1];
        const value = this.sender_.get('player', getter)();
        /** @type {Object} */(this.localPlayer_)[setter](value);
      }

      this.localPlayer_.setTextTrackVisibility(isTextTrackVisible);
      if (activeTextTrack) {
        this.localPlayer_.selectTextLanguage(
            activeTextTrack.language,
            activeTextTrack.roles,
            activeTextTrack.forced);
      }

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
      const eventType = shaka.util.FakeEvent.EventName.Error;
      const data = (new Map()).set('detail', error);
      const event = new shaka.util.FakeEvent(eventType, data);
      this.localPlayer_.dispatchEvent(event);
    });
  }

  /**
   * @param {string} name
   * @return {?}
   * @private
   */
  videoProxyGet_(name) {
    if (name == 'addEventListener') {
      return (type, listener, options) => {
        return this.videoEventTarget_.addEventListener(type, listener, options);
      };
    }
    if (name == 'removeEventListener') {
      return (type, listener, options) => {
        return this.videoEventTarget_.removeEventListener(
            type, listener, options);
      };
    }

    // If we are casting, but the first update has not come in yet, use local
    // values, but not local methods.
    if (this.sender_.isCasting() && !this.sender_.hasRemoteProperties()) {
      const value = this.localVideo_[name];
      if (typeof value != 'function') {
        return value;
      }
    }

    // Use local values and methods if we are not casting.
    if (!this.sender_.isCasting()) {
      let value = this.localVideo_[name];
      if (typeof value == 'function') {
        // eslint-disable-next-line no-restricted-syntax
        value = value.bind(this.localVideo_);
      }
      return value;
    }

    return this.sender_.get('video', name);
  }

  /**
   * @param {string} name
   * @param {?} value
   * @private
   */
  videoProxySet_(name, value) {
    if (!this.sender_.isCasting()) {
      this.localVideo_[name] = value;
      return;
    }

    this.sender_.set('video', name, value);
  }

  /**
   * @param {!Event} event
   * @private
   */
  videoProxyLocalEvent_(event) {
    if (this.sender_.isCasting()) {
      // Ignore any unexpected local events while casting.  Events can still be
      // fired by the local video and Player when we unload() after the Cast
      // connection is complete.
      return;
    }

    // Convert this real Event into a FakeEvent for dispatch from our
    // FakeEventListener.
    const fakeEvent = shaka.util.FakeEvent.fromRealEvent(event);
    this.videoEventTarget_.dispatchEvent(fakeEvent);
  }

  /**
   * @param {string} name
   * @param {boolean} dontRecordCalls
   * @return {?}
   * @private
   */
  playerProxyGet_(name, dontRecordCalls = false) {
    // If name is a shortened compiled name, get the original version
    // from our map.
    if (this.compiledToExternNames_.has(name)) {
      name = this.compiledToExternNames_.get(name);
    }

    if (name == 'addEventListener') {
      return (type, listener, options) => {
        return this.playerEventTarget_.addEventListener(
            type, listener, options);
      };
    }
    if (name == 'removeEventListener') {
      return (type, listener, options) => {
        return this.playerEventTarget_.removeEventListener(
            type, listener, options);
      };
    }

    if (name == 'getMediaElement') {
      return () => this.videoProxy_;
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
      return () => this.localPlayer_.getNetworkingEngine();
    }

    if (name == 'getDrmEngine') {
      // Always returns a local instance.
      if (this.sender_.isCasting()) {
        shaka.log.warning('NOTE: getDrmEngine() is always local!');
      }
      return () => this.localPlayer_.getDrmEngine();
    }

    if (name == 'getAdManager') {
      // Always returns a local instance.
      if (this.sender_.isCasting()) {
        shaka.log.warning('NOTE: getAdManager() is always local!');
      }
      return () => this.localPlayer_.getAdManager();
    }

    if (name == 'getQueueManager') {
      // Always returns a local instance.
      return () => this.localPlayer_.getQueueManager();
    }

    if (name == 'setVideoContainer') {
      // Always returns a local instance.
      if (this.sender_.isCasting()) {
        shaka.log.warning('NOTE: setVideoContainer() is always local!');
      }
      return (container) => this.localPlayer_.setVideoContainer(container);
    }

    if (!dontRecordCalls) {
      if (name == 'addThumbnailsTrack') {
        return (...args) => {
          this.addThumbnailsTrackCalls_.push(args);
          return this.playerProxyGet_(
              name, /* dontRecordCalls= */ true)(...args);
        };
      }
      if (name == 'addTextTrackAsync') {
        return (...args) => {
          this.addTextTrackAsyncCalls_.push(args);
          return this.playerProxyGet_(
              name, /* dontRecordCalls= */ true)(...args);
        };
      }
      if (name == 'addChaptersTrack') {
        return (...args) => {
          this.addChaptersTrackCalls_.push(args);
          return this.playerProxyGet_(
              name, /* dontRecordCalls= */ true)(...args);
        };
      }
    }

    if (this.sender_.isCasting()) {
      // These methods are unavailable or otherwise stubbed during casting.
      if (name == 'getManifest' || name == 'drmInfo') {
        return () => {
          shaka.log.alwaysWarn(name + '() does not work while casting!');
          return null;
        };
      }

      if (name == 'attach' || name == 'detach') {
        return () => {
          shaka.log.alwaysWarn(name + '() does not work while casting!');
          return Promise.resolve();
        };
      }

      if (name == 'getChapters') {
        // This does not follow our standard pattern (takes an arguments), and
        // therefore can't be proactively proxied and cached the way other
        // synchronous getters can.
        return () => {
          shaka.log.alwaysWarn(name + '() does not work while casting!');
          return [];
        };
      }
    }  // if (this.sender_.isCasting())

    // If we are casting, but the first update has not come in yet, use local
    // getters, but not local methods.
    if (this.sender_.isCasting() && !this.sender_.hasRemoteProperties()) {
      if (shaka.cast.CastUtils.PlayerGetterMethods.has(name) ||
          shaka.cast.CastUtils.LargePlayerGetterMethods.has(name)) {
        const value = /** @type {Object} */(this.localPlayer_)[name];
        goog.asserts.assert(typeof value == 'function',
            'only methods on Player');
        // eslint-disable-next-line no-restricted-syntax
        return value.bind(this.localPlayer_);
      }
    }

    // Use local getters and methods if we are not casting.
    if (!this.sender_.isCasting()) {
      const value = /** @type {Object} */(this.localPlayer_)[name];
      goog.asserts.assert(typeof value == 'function',
          'only methods on Player');
      // eslint-disable-next-line no-restricted-syntax
      return value.bind(this.localPlayer_);
    }

    return this.sender_.get('player', name);
  }

  /**
   * @param {!Event} event
   * @private
   */
  playerProxyLocalEvent_(event) {
    if (this.sender_.isCasting()) {
      // Ignore any unexpected local events while casting.
      return;
    }

    this.playerEventTarget_.dispatchEvent(event);
  }

  /**
   * @param {string} targetName
   * @param {!shaka.util.FakeEvent} event
   * @private
   */
  onRemoteEvent_(targetName, event) {
    goog.asserts.assert(this.sender_.isCasting(),
        'Should only receive remote events while casting');
    if (!this.sender_.isCasting()) {
      // Ignore any unexpected remote events.
      return;
    }

    if (targetName == 'video') {
      this.videoEventTarget_.dispatchEvent(event);
    } else if (targetName == 'player') {
      if (event.type == shaka.util.FakeEvent.EventName.Unloading) {
        this.resetExternalTracks();
      }
      this.playerEventTarget_.dispatchEvent(event);
    }
  }

  /**
   * Reset external tracks
   */
  resetExternalTracks() {
    this.addThumbnailsTrackCalls_ = [];
    this.addTextTrackAsyncCalls_ = [];
    this.addChaptersTrackCalls_ = [];
  }
};
