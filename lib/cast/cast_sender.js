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

goog.provide('shaka.cast.CastSender');

goog.require('goog.asserts');
goog.require('shaka.cast.CastUtils');
goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.PublicPromise');


/**
 * @constructor
 * @struct
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
 * @implements {shaka.util.IDestroyable}
 */
shaka.cast.CastSender =
    function(receiverAppId, onStatusChanged, onFirstCastStateUpdate,
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
      this.onConnectionStatusChanged_.bind(this);

  /** @private {?function(string, string)} */
  this.onMessageReceivedBound_ = this.onMessageReceived_.bind(this);

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
};


/** @private {boolean} */
shaka.cast.CastSender.hasReceivers_ = false;


/** @private {chrome.cast.Session} */
shaka.cast.CastSender.session_ = null;


/** @override */
shaka.cast.CastSender.prototype.destroy = function() {
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
};


/**
 * @return {boolean} True if the cast API is available.
 */
shaka.cast.CastSender.prototype.apiReady = function() {
  return this.apiReady_;
};


/**
 * @return {boolean} True if there are receivers.
 */
shaka.cast.CastSender.prototype.hasReceivers = function() {
  return shaka.cast.CastSender.hasReceivers_;
};


/**
 * @return {boolean} True if we are currently casting.
 */
shaka.cast.CastSender.prototype.isCasting = function() {
  return this.isCasting_;
};


/**
 * @return {string} The name of the Cast receiver device, if isCasting().
 */
shaka.cast.CastSender.prototype.receiverName = function() {
  return this.receiverName_;
};


/**
 * @return {boolean} True if we have a cache of remote properties from the
 *   receiver.
 */
shaka.cast.CastSender.prototype.hasRemoteProperties = function() {
  return Object.keys(this.cachedProperties_['video']).length != 0;
};


/** Initialize the Cast API. */
shaka.cast.CastSender.prototype.init = function() {
  // Check for the cast extension.
  if (!window.chrome || !chrome.cast || !chrome.cast.isAvailable) {
    // Not available yet, so wait to be notified if/when it is available.
    window.__onGCastApiAvailable = (function(loaded) {
      if (loaded) {
        this.init();
      }
    }).bind(this);
    return;
  }

  // The API is now available.
  delete window.__onGCastApiAvailable;
  this.apiReady_ = true;
  this.statusChangeTimer_.tickNow();

  let sessionRequest = new chrome.cast.SessionRequest(this.receiverAppId_);
  let apiConfig = new chrome.cast.ApiConfig(sessionRequest,
      this.onExistingSessionJoined_.bind(this),
      this.onReceiverStatusChanged_.bind(this),
      'origin_scoped');

  // TODO: Have never seen this fail.  When would it and how should we react?
  chrome.cast.initialize(apiConfig,
      function() { shaka.log.debug('CastSender: init'); },
      function(error) { shaka.log.error('CastSender: init error', error); });
  if (shaka.cast.CastSender.hasReceivers_) {
    // Fire a fake cast status change, to simulate the update that
    // would be fired normally.
    // This is after a brief delay, to give users a chance to add event
    // listeners.
    this.statusChangeTimer_.tickAfter(/* seconds= */ 0.02);
  }

  let oldSession = shaka.cast.CastSender.session_;
  if (oldSession && oldSession.status != chrome.cast.SessionStatus.STOPPED) {
    // The old session still exists, so re-use it.
    shaka.log.debug('CastSender: re-using existing connection');
    this.onExistingSessionJoined_(oldSession);
  } else {
    // The session has been canceled in the meantime, so ignore it.
    shaka.cast.CastSender.session_ = null;
  }
};


/**
 * Set application-specific data.
 *
 * @param {Object} appData Application-specific data to relay to the receiver.
 */
shaka.cast.CastSender.prototype.setAppData = function(appData) {
  this.appData_ = appData;
  if (this.isCasting_) {
    this.sendMessage_({
      'type': 'appData',
      'appData': this.appData_,
    });
  }
};


/**
 * @param {shaka.cast.CastUtils.InitStateType} initState Video and player state
 *   to be sent to the receiver.
 * @return {!Promise} Resolved when connected to a receiver.  Rejected if the
 *   connection fails or is canceled by the user.
 */
shaka.cast.CastSender.prototype.cast = function(initState) {
  if (!this.apiReady_) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.CAST,
        shaka.util.Error.Code.CAST_API_UNAVAILABLE));
  }
  if (!shaka.cast.CastSender.hasReceivers_) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.CAST,
        shaka.util.Error.Code.NO_CAST_RECEIVERS));
  }
  if (this.isCasting_) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.CAST,
        shaka.util.Error.Code.ALREADY_CASTING));
  }

  this.castPromise_ = new shaka.util.PublicPromise();
  chrome.cast.requestSession(
      this.onSessionInitiated_.bind(this, initState),
      this.onConnectionError_.bind(this));
  return this.castPromise_;
};


/**
 * Shows user a cast dialog where they can choose to stop
 * casting.  Relies on Chrome to perform disconnect if they do.
 * Doesn't do anything if not connected.
 */
shaka.cast.CastSender.prototype.showDisconnectDialog = function() {
  if (!this.isCasting_) {
    return;
  }
  let initState = this.onInitStateRequired_();

  chrome.cast.requestSession(
      this.onSessionInitiated_.bind(this, initState),
      this.onConnectionError_.bind(this));
};


/**
 * Forces the receiver app to shut down by disconnecting.  Does nothing if not
 * connected.
 */
shaka.cast.CastSender.prototype.forceDisconnect = function() {
  if (!this.isCasting_) {
    return;
  }

  this.rejectAllPromises_();
  if (shaka.cast.CastSender.session_) {
    this.removeListeners_();
    shaka.cast.CastSender.session_.stop(function() {}, function() {});
    shaka.cast.CastSender.session_ = null;
  }
};


/**
 * Getter for properties of remote objects.
 * @param {string} targetName
 * @param {string} property
 * @return {?}
 */
shaka.cast.CastSender.prototype.get = function(targetName, property) {
  goog.asserts.assert(targetName == 'video' || targetName == 'player',
                      'Unexpected target name');
  const CastUtils = shaka.cast.CastUtils;
  if (targetName == 'video') {
    if (CastUtils.VideoVoidMethods.includes(property)) {
      return this.remoteCall_.bind(this, targetName, property);
    }
  } else if (targetName == 'player') {
    if (CastUtils.PlayerGetterMethodsThatRequireLive[property]) {
      let isLive = this.get('player', 'isLive')();
      goog.asserts.assert(isLive,
          property + ' should be called on a live stream!');
      // If the property shouldn't exist, return a fake function so that the
      // user doesn't call an undefined function and get a second error.
      if (!isLive) {
        return () => undefined;
      }
    }
    if (CastUtils.PlayerVoidMethods.includes(property)) {
      return this.remoteCall_.bind(this, targetName, property);
    }
    if (CastUtils.PlayerPromiseMethods.includes(property)) {
      return this.remoteAsyncCall_.bind(this, targetName, property);
    }
    if (CastUtils.PlayerGetterMethods[property]) {
      return this.propertyGetter_.bind(this, targetName, property);
    }
  }

  return this.propertyGetter_(targetName, property);
};


/**
 * Setter for properties of remote objects.
 * @param {string} targetName
 * @param {string} property
 * @param {?} value
 */
shaka.cast.CastSender.prototype.set = function(targetName, property, value) {
  goog.asserts.assert(targetName == 'video' || targetName == 'player',
                      'Unexpected target name');

  this.cachedProperties_[targetName][property] = value;
  this.sendMessage_({
    'type': 'set',
    'targetName': targetName,
    'property': property,
    'value': value,
  });
};


/**
 * @param {shaka.cast.CastUtils.InitStateType} initState
 * @param {chrome.cast.Session} session
 * @private
 */
shaka.cast.CastSender.prototype.onSessionInitiated_ =
    function(initState, session) {
  shaka.log.debug('CastSender: onSessionInitiated');
  this.onSessionCreated_(session);

  this.sendMessage_({
    'type': 'init',
    'initState': initState,
    'appData': this.appData_,
  });

  this.castPromise_.resolve();
};


/**
 * @param {chrome.cast.Error} error
 * @private
 */
shaka.cast.CastSender.prototype.onConnectionError_ = function(error) {
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
};


/**
 * @param {string} targetName
 * @param {string} property
 * @return {?}
 * @private
 */
shaka.cast.CastSender.prototype.propertyGetter_ =
    function(targetName, property) {
  goog.asserts.assert(targetName == 'video' || targetName == 'player',
                      'Unexpected target name');
  return this.cachedProperties_[targetName][property];
};


/**
 * @param {string} targetName
 * @param {string} methodName
 * @param {...*} varArgs
 * @private
 */
shaka.cast.CastSender.prototype.remoteCall_ =
    function(targetName, methodName, ...varArgs) {
  goog.asserts.assert(targetName == 'video' || targetName == 'player',
                      'Unexpected target name');
  this.sendMessage_({
    'type': 'call',
    'targetName': targetName,
    'methodName': methodName,
    'args': varArgs,
  });
};


/**
 * @param {string} targetName
 * @param {string} methodName
 * @param {...*} varArgs
 * @return {!Promise}
 * @private
 */
shaka.cast.CastSender.prototype.remoteAsyncCall_ =
    function(targetName, methodName, ...varArgs) {
  goog.asserts.assert(targetName == 'video' || targetName == 'player',
                      'Unexpected target name');

  let p = new shaka.util.PublicPromise();
  let id = this.nextAsyncCallId_.toString();
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
};


/**
 * @param {chrome.cast.Session} session
 * @private
 */
shaka.cast.CastSender.prototype.onExistingSessionJoined_ = function(session) {
  shaka.log.debug('CastSender: onExistingSessionJoined');

  let initState = this.onInitStateRequired_();

  this.castPromise_ = new shaka.util.PublicPromise();
  this.hasJoinedExistingSession_ = true;

  this.onSessionInitiated_(initState, session);
};


/**
 * @param {string} availability
 * @private
 */
shaka.cast.CastSender.prototype.onReceiverStatusChanged_ =
    function(availability) {
  // The cast extension is telling us whether there are any cast receiver
  // devices available.
  shaka.log.debug('CastSender: receiver status', availability);
  shaka.cast.CastSender.hasReceivers_ = availability == 'available';
  this.statusChangeTimer_.tickNow();
};


/**
 * @param {chrome.cast.Session} session
 * @private
 */
shaka.cast.CastSender.prototype.onSessionCreated_ = function(session) {
  shaka.cast.CastSender.session_ = session;
  session.addUpdateListener(this.onConnectionStatusChangedBound_);
  session.addMessageListener(shaka.cast.CastUtils.SHAKA_MESSAGE_NAMESPACE,
      this.onMessageReceivedBound_);
  this.onConnectionStatusChanged_();
};


/**
 * @private
 */
shaka.cast.CastSender.prototype.removeListeners_ = function() {
  let session = shaka.cast.CastSender.session_;
  session.removeUpdateListener(this.onConnectionStatusChangedBound_);
  session.removeMessageListener(shaka.cast.CastUtils.SHAKA_MESSAGE_NAMESPACE,
      this.onMessageReceivedBound_);
};


/**
 * @private
 */
shaka.cast.CastSender.prototype.onConnectionStatusChanged_ = function() {
  let connected = shaka.cast.CastSender.session_ ?
      shaka.cast.CastSender.session_.status == 'connected' :
      false;
  shaka.log.debug('CastSender: connection status', connected);
  if (this.isCasting_ && !connected) {
    // Tell CastProxy to transfer state back to local player.
    this.onResumeLocal_();

    // Clear whatever we have cached.
    for (let targetName in this.cachedProperties_) {
      this.cachedProperties_[targetName] = {};
    }

    this.rejectAllPromises_();
  }

  this.isCasting_ = connected;
  this.receiverName_ = connected ?
      shaka.cast.CastSender.session_.receiver.friendlyName :
      '';
  this.statusChangeTimer_.tickNow();
};


/**
 * Reject any async call promises that are still pending.
 * @private
 */
shaka.cast.CastSender.prototype.rejectAllPromises_ = function() {
  for (let id in this.asyncCallPromises_) {
    let p = this.asyncCallPromises_[id];
    delete this.asyncCallPromises_[id];

    // Reject pending async operations as if they were interrupted.
    // At the moment, load() is the only async operation we are worried about.
    p.reject(new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.PLAYER,
        shaka.util.Error.Code.LOAD_INTERRUPTED));
  }
};


/**
 * @param {string} namespace
 * @param {string} serialized
 * @private
 */
shaka.cast.CastSender.prototype.onMessageReceived_ =
    function(namespace, serialized) {
  // Since this method is in the compiled library, make sure all messages passed
  // in here were created with quoted property names.

  let message = shaka.cast.CastUtils.deserialize(serialized);
  shaka.log.v2('CastSender: message', message);

  switch (message['type']) {
    case 'event': {
      let targetName = message['targetName'];
      let event = message['event'];
      let fakeEvent = new shaka.util.FakeEvent(event['type'], event);
      this.onRemoteEvent_(targetName, fakeEvent);
      break;
    }
    case 'update': {
      let update = message['update'];
      for (let targetName in update) {
        let target = this.cachedProperties_[targetName] || {};
        for (let property in update[targetName]) {
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
      let id = message['id'];
      let error = message['error'];
      let p = this.asyncCallPromises_[id];
      delete this.asyncCallPromises_[id];

      goog.asserts.assert(p, 'Unexpected async id');
      if (!p) break;

      if (error) {
        // This is a hacky way to reconstruct the serialized error.
        let reconstructedError = new shaka.util.Error(
            error.severity, error.category, error.code);
        for (let k in error) {
          (/** @type {Object} */(reconstructedError))[k] = error[k];
        }
        p.reject(reconstructedError);
      } else {
        p.resolve();
      }
      break;
    }
  }
};


/**
 * @param {!Object} message
 * @private
 */
shaka.cast.CastSender.prototype.sendMessage_ = function(message) {
  // Since this method is in the compiled library, make sure all messages passed
  // in here were created with quoted property names.

  let serialized = shaka.cast.CastUtils.serialize(message);
  // TODO: have never seen this fail.  When would it and how should we react?
  let session = shaka.cast.CastSender.session_;
  session.sendMessage(shaka.cast.CastUtils.SHAKA_MESSAGE_NAMESPACE,
                      serialized,
                      function() {},  // success callback
                      shaka.log.error);  // error callback
};
