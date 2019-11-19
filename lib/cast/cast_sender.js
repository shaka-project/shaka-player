/** @license
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
   */
  constructor(receiverAppId, onStatusChanged, onFirstCastStateUpdate,
      onRemoteEvent, onResumeLocal, onInitStateRequired) {
    /** @private {string} */
    this.receiverAppId_ = receiverAppId;

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

    /** @private {Object.<string, !shaka.util.PublicPromise>} */
    this.asyncCallPromises_ = {};

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
    // Check for the cast API and the receiver id.
    if (!window.chrome || !chrome.cast || !chrome.cast.isAvailable ||
        !this.receiverAppId_.length) {
      // Return if either:
      // 1) The API is not available on this platform or is not ready yet.
      // 2) No cast receiver id has been provided.
      // If the API becomes available before this instance dies, or the reveiver
      // id changes, init() will be called again.
      return;
    }

    // The API is now available.
    this.apiReady_ = true;
    this.statusChangeTimer_.tickNow();

    const sessionRequest = new chrome.cast.SessionRequest(this.receiverAppId_);
    const apiConfig = new chrome.cast.ApiConfig(sessionRequest,
        (session) => this.onExistingSessionJoined_(session),
        (availability) => this.onReceiverStatusChanged_(availability),
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
   * @param {shaka.cast.CastUtils.InitStateType} initState Video and player
   *   state to be sent to the receiver.
   * @return {!Promise} Resolved when connected to a receiver.  Rejected if the
   *   connection fails or is canceled by the user.
   */
  async cast(initState) {
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
        (session) => this.onSessionInitiated_(initState, session),
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
    const initState = this.onInitStateRequired_();

    chrome.cast.requestSession(
        (session) => this.onSessionInitiated_(initState, session),
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
      shaka.cast.CastSender.session_.stop(() => {}, () => {});
      shaka.cast.CastSender.session_ = null;
    }
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
      if (CastUtils.PlayerGetterMethodsThatRequireLive[property]) {
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
      if (CastUtils.PlayerGetterMethods[property]) {
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
   * @param {shaka.cast.CastUtils.InitStateType} initState
   * @param {chrome.cast.Session} session
   * @private
   */
  onSessionInitiated_(initState, session) {
    shaka.log.debug('CastSender: onSessionInitiated');
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
    this.asyncCallPromises_[id] = p;

    this.sendMessage_({
      'type': 'asyncCall',
      'targetName': targetName,
      'methodName': methodName,
      'args': varArgs,
      'id': id,
    });
    return p;
  }


  /**
   * @param {chrome.cast.Session} session
   * @private
   */
  onExistingSessionJoined_(session) {
    shaka.log.debug('CastSender: onExistingSessionJoined');

    const initState = this.onInitStateRequired_();

    this.castPromise_ = new shaka.util.PublicPromise();
    this.hasJoinedExistingSession_ = true;

    this.onSessionInitiated_(initState, session);
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
    for (const id in this.asyncCallPromises_) {
      const p = this.asyncCallPromises_[id];
      delete this.asyncCallPromises_[id];

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
        const fakeEvent = new shaka.util.FakeEvent(event['type'], event);
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
        const p = this.asyncCallPromises_[id];
        delete this.asyncCallPromises_[id];

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
          p.resolve();
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
    // TODO: have never seen this fail.  When would it and how should we react?
    const session = shaka.cast.CastSender.session_;
    session.sendMessage(shaka.cast.CastUtils.SHAKA_MESSAGE_NAMESPACE,
        serialized,
        () => {},  // success callback
        shaka.log.error);  // error callback
  }
};

/** @type {number} */
shaka.cast.CastSender.STATUS_DELAY = 0.02;

/** @private {boolean} */
shaka.cast.CastSender.hasReceivers_ = false;

/** @private {chrome.cast.Session} */
shaka.cast.CastSender.session_ = null;

/**
 * A set of all living CastSender instances.  The constructor and destroy
 * methods will add and remove instances from this set.
 *
 * This is used to deal with delayed initialization of the Cast SDK.  When the
 * SDK becomes available, instances will be reinitialized.
 *
 * @private {!Set.<shaka.cast.CastSender>}
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

// The cast SDK will invoke this global callback.  Since in our testing
// environment, we load both uncompiled and compiled code, this global callback
// in uncompiled mode can be overwritten by the same in compiled mode.  The two
// versions will each have their own instances_ map.
// Therefore we gave the callback a name that the CastSender tests could invoke
// instead of using a global that could be overwritten.
window.__onGCastApiAvailable = shaka.cast.CastSender.onSdkLoaded_;
