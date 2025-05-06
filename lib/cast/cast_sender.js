/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cast.CastSender');

goog.require('goog.asserts');
goog.require('shaka.cast.CastUtils');
goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Timer');


/**
 * @implements {shaka.util.IDestroyable}
 */
shaka.cast.CastSender = class {
  /**
   * @param {string} receiverAppId The ID of the cast receiver application.
   * @param {function()} onStatusChanged A callback invoked when the cast status
   *   changes.
   * @param {function()} onFirstCastStateUpdate A callback invoked when an
   *   "update" event has been received for the first time.
   * @param {function(string, !shaka.util.FakeEvent)} onRemoteEvent A callback
   *   invoked with target name and event when a remote event is received.
   * @param {function()} onResumeLocal A callback invoked when the local player
   *   should resume playback.  Called before the cached remote state is wiped.
   * @param {function()} onInitStateRequired A callback to get local player's.
   *   state.  Invoked when casting is initiated from Chrome's cast button.
   * @param {boolean} androidReceiverCompatible Indicates if the app is
   *   compatible with an Android Receiver.
   */
  constructor(receiverAppId, onStatusChanged, onFirstCastStateUpdate,
      onRemoteEvent, onResumeLocal, onInitStateRequired,
      androidReceiverCompatible) {
    /** @private {string} */
    this.receiverAppId_ = receiverAppId;

    /** @private {boolean} */
    this.androidReceiverCompatible_ = androidReceiverCompatible;

    /** @private {shaka.util.Timer} */
    this.statusChangeTimer_ = new shaka.util.Timer(onStatusChanged);

    /** @private {?function()} */
    this.onFirstCastStateUpdate_ = onFirstCastStateUpdate;

    /** @private {boolean} */
    this.hasJoinedExistingSession_ = false;

    /** @private {?function(string, !shaka.util.FakeEvent)} */
    this.onRemoteEvent_ = onRemoteEvent;

    /** @private {?function()} */
    this.onResumeLocal_ = onResumeLocal;

    /** @private {?function()} */
    this.onInitStateRequired_ = onInitStateRequired;

    /** @private {boolean} */
    this.apiReady_ = false;

    /** @private {boolean} */
    this.isCasting_ = false;

    /** @private {string} */
    this.receiverName_ = '';

    /** @private {Object} */
    this.appData_ = null;

    /** @private {?function()} */
    this.onConnectionStatusChangedBound_ =
        () => this.onConnectionStatusChanged_();

    /** @private {?function(string, string)} */
    this.onMessageReceivedBound_ = (namespace, serialized) =>
      this.onMessageReceived_(namespace, serialized);

    /** @private {Object} */
    this.cachedProperties_ = {
      'video': {},
      'player': {},
    };

    /** @private {number} */
    this.nextAsyncCallId_ = 0;

    /** @private {Map<string, !shaka.util.PublicPromise>} */
    this.asyncCallPromises_ = new Map();

    /** @private {shaka.util.PublicPromise} */
    this.castPromise_ = null;

    shaka.cast.CastSender.instances_.add(this);
  }


  /** @override */
  destroy() {
    shaka.cast.CastSender.instances_.delete(this);

    this.rejectAllPromises_();
    if (shaka.cast.CastSender.session_) {
      this.removeListeners_();
      // Don't leave the session, so that this session can be re-used later if
      // necessary.
    }

    if (this.statusChangeTimer_) {
      this.statusChangeTimer_.stop();
      this.statusChangeTimer_ = null;
    }

    this.onRemoteEvent_ = null;
    this.onResumeLocal_ = null;
    this.apiReady_ = false;
    this.isCasting_ = false;
    this.appData_ = null;
    this.cachedProperties_ = null;
    this.asyncCallPromises_ = null;
    this.castPromise_ = null;
    this.onConnectionStatusChangedBound_ = null;
    this.onMessageReceivedBound_ = null;

    return Promise.resolve();
  }


  /**
   * @return {boolean} True if the cast API is available.
   */
  apiReady() {
    return this.apiReady_;
  }


  /**
   * @return {boolean} True if there are receivers.
   */
  hasReceivers() {
    return shaka.cast.CastSender.hasReceivers_;
  }


  /**
   * @return {boolean} True if we are currently casting.
   */
  isCasting() {
    return this.isCasting_;
  }


  /**
   * @return {string} The name of the Cast receiver device, if isCasting().
   */
  receiverName() {
    return this.receiverName_;
  }


  /**
   * @return {boolean} True if we have a cache of remote properties from the
   *   receiver.
   */
  hasRemoteProperties() {
    return Object.keys(this.cachedProperties_['video']).length != 0;
  }


  /** Initialize the Cast API. */
  init() {
    const CastSender = shaka.cast.CastSender;

    if (!this.receiverAppId_.length) {
      // Return if no cast receiver id has been provided.
      // Nothing will be initialized, no global hooks will be installed.
      // If the receiver ID changes before this instance dies, init will be
      // called again.
      return;
    }

    // Check for the cast API.
    if (!window.chrome || !chrome.cast || !chrome.cast.isAvailable) {
      // If the API is not available on this platform or is not ready yet,
      // install a hook to be notified when it becomes available.
      // If the API becomes available before this instance dies, init will be
      // called again.

      // Check if our callback is already installed.
      if (window.__onGCastApiAvailable !== CastSender.onGCastApiAvailable_) {
        // Save pre-existing __onGCastApiAvailable in order to restore later.
        CastSender.__onGCastApiAvailable_ =
          window.__onGCastApiAvailable || null;
        window.__onGCastApiAvailable = CastSender.onGCastApiAvailable_;
      }

      return;
    }

    // The API is now available.
    this.apiReady_ = true;
    this.statusChangeTimer_.tickNow();

    // Use static versions of the API callbacks, since the ChromeCast API is
    // static. If we used local versions, we might end up retaining references
    // to destroyed players here.
    const sessionRequest = new chrome.cast.SessionRequest(this.receiverAppId_,
        /* capabilities= */ [],
        /* timeout= */ null,
        this.androidReceiverCompatible_,
        /* credentialsData= */null);
    const apiConfig = new chrome.cast.ApiConfig(sessionRequest,
        (session) => CastSender.onExistingSessionJoined_(session),
        (availability) => CastSender.onReceiverStatusChanged_(availability),
        'origin_scoped');

    // TODO: Have never seen this fail.  When would it and how should we react?
    chrome.cast.initialize(apiConfig,
        () => { shaka.log.debug('CastSender: init'); },
        (error) => { shaka.log.error('CastSender: init error', error); });
    if (shaka.cast.CastSender.hasReceivers_) {
      // Fire a fake cast status change, to simulate the update that
      // would be fired normally.
      // This is after a brief delay, to give users a chance to add event
      // listeners.
      this.statusChangeTimer_.tickAfter(shaka.cast.CastSender.STATUS_DELAY);
    }

    const oldSession = shaka.cast.CastSender.session_;
    if (oldSession && oldSession.status != chrome.cast.SessionStatus.STOPPED) {
      // The old session still exists, so re-use it.
      shaka.log.debug('CastSender: re-using existing connection');
      this.onExistingSessionJoined_(oldSession);
    } else {
      // The session has been canceled in the meantime, so ignore it.
      shaka.cast.CastSender.session_ = null;
    }
  }


  /**
   * Set application-specific data.
   *
   * @param {Object} appData Application-specific data to relay to the receiver.
   */
  setAppData(appData) {
    this.appData_ = appData;
    if (this.isCasting_) {
      this.sendMessage_({
        'type': 'appData',
        'appData': this.appData_,
      });
    }
  }


  /**
   * @return {!Promise} Resolved when connected to a receiver.  Rejected if the
   *   connection fails or is canceled by the user.
   */
  async cast() {
    if (!this.apiReady_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.CAST,
          shaka.util.Error.Code.CAST_API_UNAVAILABLE);
    }
    if (!shaka.cast.CastSender.hasReceivers_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.CAST,
          shaka.util.Error.Code.NO_CAST_RECEIVERS);
    }
    if (this.isCasting_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.CAST,
          shaka.util.Error.Code.ALREADY_CASTING);
    }

    this.castPromise_ = new shaka.util.PublicPromise();
    chrome.cast.requestSession(
        (session) => this.onSessionInitiated_(session),
        (error) => this.onConnectionError_(error));
    await this.castPromise_;
  }


  /**
   * Shows user a cast dialog where they can choose to stop
   * casting.  Relies on Chrome to perform disconnect if they do.
   * Doesn't do anything if not connected.
   */
  showDisconnectDialog() {
    if (!this.isCasting_) {
      return;
    }

    chrome.cast.requestSession(
        (session) => this.onSessionInitiated_(session),
        (error) => this.onConnectionError_(error));
  }


  /**
   * Forces the receiver app to shut down by disconnecting.  Does nothing if not
   * connected.
   */
  forceDisconnect() {
    if (!this.isCasting_) {
      return;
    }

    this.rejectAllPromises_();

    if (shaka.cast.CastSender.session_) {
      this.removeListeners_();

      // This can throw if we've already been disconnected somehow.
      try {
        shaka.cast.CastSender.session_.stop(() => {}, () => {});
      } catch (error) {}

      shaka.cast.CastSender.session_ = null;
    }

    // Update casting status.
    this.onConnectionStatusChanged_();
  }


  /**
   * Getter for properties of remote objects.
   * @param {string} targetName
   * @param {string} property
   * @return {?}
   */
  get(targetName, property) {
    goog.asserts.assert(targetName == 'video' || targetName == 'player',
        'Unexpected target name');
    const CastUtils = shaka.cast.CastUtils;
    if (targetName == 'video') {
      if (CastUtils.VideoVoidMethods.includes(property)) {
        return (...args) => this.remoteCall_(targetName, property, ...args);
      }
    } else if (targetName == 'player') {
      if (CastUtils.PlayerGetterMethodsThatRequireLive.has(property)) {
        const isLive = this.get('player', 'isLive')();
        goog.asserts.assert(isLive,
            property + ' should be called on a live stream!');
        // If the property shouldn't exist, return a fake function so that the
        // user doesn't call an undefined function and get a second error.
        if (!isLive) {
          return () => undefined;
        }
      }
      if (CastUtils.PlayerVoidMethods.includes(property)) {
        return (...args) => this.remoteCall_(targetName, property, ...args);
      }
      if (CastUtils.PlayerPromiseMethods.includes(property)) {
        return (...args) =>
          this.remoteAsyncCall_(targetName, property, ...args);
      }
      if (CastUtils.PlayerGetterMethods.has(property) ||
          CastUtils.LargePlayerGetterMethods.has(property)) {
        return () => this.propertyGetter_(targetName, property);
      }
    }

    return this.propertyGetter_(targetName, property);
  }


  /**
   * Setter for properties of remote objects.
   * @param {string} targetName
   * @param {string} property
   * @param {?} value
   */
  set(targetName, property, value) {
    goog.asserts.assert(targetName == 'video' || targetName == 'player',
        'Unexpected target name');

    this.cachedProperties_[targetName][property] = value;
    this.sendMessage_({
      'type': 'set',
      'targetName': targetName,
      'property': property,
      'value': value,
    });
  }


  /**
   * @param {chrome.cast.Session} session
   * @private
   */
  onSessionInitiated_(session) {
    shaka.log.debug('CastSender: onSessionInitiated');

    const initState = this.onInitStateRequired_();

    this.onSessionCreated_(session);

    this.sendMessage_({
      'type': 'init',
      'initState': initState,
      'appData': this.appData_,
    });

    this.castPromise_.resolve();
  }


  /**
   * @param {chrome.cast.Error} error
   * @private
   */
  onConnectionError_(error) {
    // Default error code:
    let code = shaka.util.Error.Code.UNEXPECTED_CAST_ERROR;

    switch (error.code) {
      case 'cancel':
        code = shaka.util.Error.Code.CAST_CANCELED_BY_USER;
        break;
      case 'timeout':
        code = shaka.util.Error.Code.CAST_CONNECTION_TIMED_OUT;
        break;
      case 'receiver_unavailable':
        code = shaka.util.Error.Code.CAST_RECEIVER_APP_UNAVAILABLE;
        break;
    }

    this.castPromise_.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.CAST,
        code,
        error));
  }


  /**
   * @param {string} targetName
   * @param {string} property
   * @return {?}
   * @private
   */
  propertyGetter_(targetName, property) {
    goog.asserts.assert(targetName == 'video' || targetName == 'player',
        'Unexpected target name');
    return this.cachedProperties_[targetName][property];
  }


  /**
   * @param {string} targetName
   * @param {string} methodName
   * @param {...*} varArgs
   * @private
   */
  remoteCall_(targetName, methodName, ...varArgs) {
    goog.asserts.assert(targetName == 'video' || targetName == 'player',
        'Unexpected target name');
    this.sendMessage_({
      'type': 'call',
      'targetName': targetName,
      'methodName': methodName,
      'args': varArgs,
    });
  }


  /**
   * @param {string} targetName
   * @param {string} methodName
   * @param {...*} varArgs
   * @return {!Promise}
   * @private
   */
  remoteAsyncCall_(targetName, methodName, ...varArgs) {
    goog.asserts.assert(targetName == 'video' || targetName == 'player',
        'Unexpected target name');

    const p = new shaka.util.PublicPromise();
    const id = this.nextAsyncCallId_.toString();
    this.nextAsyncCallId_++;
    this.asyncCallPromises_.set(id, p);

    try {
      this.sendMessage_({
        'type': 'asyncCall',
        'targetName': targetName,
        'methodName': methodName,
        'args': varArgs,
        'id': id,
      });
    } catch (error) {
      p.reject(error);
    }
    return p;
  }


  /**
   * A static version of onExistingSessionJoined_, that calls that method for
   * each known instance.
   * @param {chrome.cast.Session} session
   * @private
   */
  static onExistingSessionJoined_(session) {
    for (const instance of shaka.cast.CastSender.instances_) {
      instance.onExistingSessionJoined_(session);
    }
  }


  /**
   * @param {chrome.cast.Session} session
   * @private
   */
  onExistingSessionJoined_(session) {
    shaka.log.debug('CastSender: onExistingSessionJoined');

    this.castPromise_ = new shaka.util.PublicPromise();
    this.hasJoinedExistingSession_ = true;

    this.onSessionInitiated_(session);
  }


  /**
   * A static version of onReceiverStatusChanged_, that calls that method for
   * each known instance.
   * @param {string} availability
   * @private
   */
  static onReceiverStatusChanged_(availability) {
    for (const instance of shaka.cast.CastSender.instances_) {
      instance.onReceiverStatusChanged_(availability);
    }
  }


  /**
   * @param {string} availability
   * @private
   */
  onReceiverStatusChanged_(availability) {
    // The cast API is telling us whether there are any cast receiver devices
    // available.
    shaka.log.debug('CastSender: receiver status', availability);
    shaka.cast.CastSender.hasReceivers_ = availability == 'available';
    this.statusChangeTimer_.tickNow();
  }


  /**
   * @param {chrome.cast.Session} session
   * @private
   */
  onSessionCreated_(session) {
    shaka.cast.CastSender.session_ = session;
    session.addUpdateListener(this.onConnectionStatusChangedBound_);
    session.addMessageListener(shaka.cast.CastUtils.SHAKA_MESSAGE_NAMESPACE,
        this.onMessageReceivedBound_);
    this.onConnectionStatusChanged_();
  }


  /**
   * @private
   */
  removeListeners_() {
    const session = shaka.cast.CastSender.session_;
    session.removeUpdateListener(this.onConnectionStatusChangedBound_);
    session.removeMessageListener(shaka.cast.CastUtils.SHAKA_MESSAGE_NAMESPACE,
        this.onMessageReceivedBound_);
  }


  /**
   * @private
   */
  onConnectionStatusChanged_() {
    const connected = shaka.cast.CastSender.session_ ?
        shaka.cast.CastSender.session_.status == 'connected' :
        false;
    shaka.log.debug('CastSender: connection status', connected);
    if (this.isCasting_ && !connected) {
      // Tell CastProxy to transfer state back to local player.
      this.onResumeLocal_();

      // Clear whatever we have cached.
      for (const targetName in this.cachedProperties_) {
        this.cachedProperties_[targetName] = {};
      }

      this.rejectAllPromises_();
    }

    this.isCasting_ = connected;
    this.receiverName_ = connected ?
        shaka.cast.CastSender.session_.receiver.friendlyName :
        '';
    this.statusChangeTimer_.tickNow();
  }


  /**
   * Reject any async call promises that are still pending.
   * @private
   */
  rejectAllPromises_() {
    if (!this.asyncCallPromises_) {
      return;
    }
    for (const id of this.asyncCallPromises_.keys()) {
      const p = this.asyncCallPromises_.get(id);
      this.asyncCallPromises_.delete(id);

      // Reject pending async operations as if they were interrupted.
      // At the moment, load() is the only async operation we are worried about.
      p.reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.LOAD_INTERRUPTED));
    }
  }


  /**
   * @param {string} namespace
   * @param {string} serialized
   * @private
   */
  onMessageReceived_(namespace, serialized) {
    // Since this method is in the compiled library, make sure all messages
    // passed in here were created with quoted property names.

    const message = shaka.cast.CastUtils.deserialize(serialized);
    shaka.log.v2('CastSender: message', message);

    switch (message['type']) {
      case 'event': {
        const targetName = message['targetName'];
        const event = message['event'];
        const fakeEvent = shaka.util.FakeEvent.fromRealEvent(event);
        this.onRemoteEvent_(targetName, fakeEvent);
        break;
      }
      case 'update': {
        const update = message['update'];
        for (const targetName in update) {
          const target = this.cachedProperties_[targetName] || {};
          for (const property in update[targetName]) {
            target[property] = update[targetName][property];
          }
        }
        if (this.hasJoinedExistingSession_) {
          this.onFirstCastStateUpdate_();
          this.hasJoinedExistingSession_ = false;
        }
        break;
      }
      case 'asyncComplete': {
        const id = message['id'];
        const error = message['error'];
        const res = message['res'];
        const p = this.asyncCallPromises_.get(id);
        this.asyncCallPromises_.delete(id);

        goog.asserts.assert(p, 'Unexpected async id');
        if (!p) {
          break;
        }

        if (error) {
          // This is a hacky way to reconstruct the serialized error.
          const reconstructedError = new shaka.util.Error(
              error.severity, error.category, error.code);
          for (const k in error) {
            (/** @type {Object} */(reconstructedError))[k] = error[k];
          }
          p.reject(reconstructedError);
        } else {
          p.resolve(res);
        }
        break;
      }
    }
  }


  /**
   * @param {!Object} message
   * @private
   */
  sendMessage_(message) {
    // Since this method is in the compiled library, make sure all messages
    // passed in here were created with quoted property names.

    const serialized = shaka.cast.CastUtils.serialize(message);
    const session = shaka.cast.CastSender.session_;

    // NOTE: This takes an error callback that we have not seen fire.  We don't
    // know if it would fire synchronously or asynchronously.  Until we know how
    // it works, we just log from that callback.  But we _have_ seen
    // sendMessage() throw synchronously, so we handle that.
    try {
      session.sendMessage(shaka.cast.CastUtils.SHAKA_MESSAGE_NAMESPACE,
          serialized,
          () => {},  // success callback
          shaka.log.error);  // error callback
    } catch (error) {
      shaka.log.error('Cast session sendMessage threw', error);

      // Translate the error
      const shakaError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.CAST,
          shaka.util.Error.Code.CAST_CONNECTION_TIMED_OUT,
          error);

      // Dispatch it through the Player proxy
      const fakeEvent = new shaka.util.FakeEvent(
          'error', (new Map()).set('detail', shakaError));
      this.onRemoteEvent_('player', fakeEvent);

      // Force this session to disconnect and transfer playback to the local
      // device
      this.forceDisconnect();

      // Throw the translated error from this getter/setter/method to the UI/app
      throw shakaError;
    }
  }
};

/** @type {number} */
shaka.cast.CastSender.STATUS_DELAY = 0.02;

/** @private {boolean} */
shaka.cast.CastSender.hasReceivers_ = false;

/** @private {chrome.cast.Session} */
shaka.cast.CastSender.session_ = null;

/** @private {?function(boolean)} */
shaka.cast.CastSender.__onGCastApiAvailable_ = null;

/**
 * A set of all living CastSender instances.  The constructor and destroy
 * methods will add and remove instances from this set.
 *
 * This is used to deal with delayed initialization of the Cast SDK.  When the
 * SDK becomes available, instances will be reinitialized.
 *
 * @private {!Set<shaka.cast.CastSender>}
 */
shaka.cast.CastSender.instances_ = new Set();

/**
 * If the cast SDK is not available yet, it will invoke this callback once it
 * becomes available.
 *
 * @param {boolean} loaded
 * @private
 */
shaka.cast.CastSender.onSdkLoaded_ = (loaded) => {
  if (loaded) {
    // Any living instances of CastSender should have their init methods called
    // again now that the API is available.
    for (const sender of shaka.cast.CastSender.instances_) {
      sender.init();
    }
  }
};

/**
 * @param {boolean} available
 * @private
 */
shaka.cast.CastSender.onGCastApiAvailable_ = (available) => {
  // Restore callback from saved.
  if (shaka.cast.CastSender.__onGCastApiAvailable_) {
    window.__onGCastApiAvailable =
      shaka.cast.CastSender.__onGCastApiAvailable_;
  } else {
    delete window.__onGCastApiAvailable;
  }
  shaka.cast.CastSender.__onGCastApiAvailable_ = null;

  // A note about this value: In our testing environment, we load both
  // uncompiled and compiled code.  This global callback in uncompiled mode
  // can be overwritten by the same in compiled mode.  The two versions will
  // each have their own instances_ map.  Therefore the callback must have a
  // name, as opposed to being anonymous.  This way, the CastSender tests
  // can invoke the named static method instead of using a global that could
  // be overwritten.
  shaka.cast.CastSender.onSdkLoaded_(available);

  // call restored callback (if any)
  if (typeof window.__onGCastApiAvailable === 'function') {
    window.__onGCastApiAvailable(available);
  }
};
