/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview A polyfill to implement {@link http://goo.gl/sgJHNN EME draft
 * 01 December 2014} on top of {@link http://goo.gl/FSpoAo EME v0.1b}.
 *
 * @see http://enwp.org/polyfill
 */

goog.provide('shaka.polyfill.PatchedMediaKeys.v01b');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');


/**
 * Install the polyfill.
 * @export
 */
shaka.polyfill.PatchedMediaKeys.v01b.install = function() {
  shaka.log.debug('v01b.install');

  shaka.asserts.assert(HTMLMediaElement.prototype.webkitGenerateKeyRequest);

  // Alias.
  var v01b = shaka.polyfill.PatchedMediaKeys.v01b;

  // Install patches.
  Navigator.prototype.requestMediaKeySystemAccess =
      v01b.requestMediaKeySystemAccess;
  // Work around read-only declarations for these properties by using strings:
  HTMLMediaElement.prototype['mediaKeys'] = null;
  HTMLMediaElement.prototype['waitingFor'] = '';
  HTMLMediaElement.prototype.setMediaKeys = v01b.setMediaKeys;
  window.MediaKeys = v01b.MediaKeys;
  // TODO: isTypeSupported deprecated
  window.MediaKeys.isTypeSupported = v01b.MediaKeys.isTypeSupported;
};


/**
 * An implementation of Navigator.prototype.requestMediaKeySystemAccess.
 * Retrieve a MediaKeySystemAccess object.
 *
 * @this {!Navigator}
 * @param {string} keySystem
 * @param {Array.<Object>=} opt_supportedConfigurations
 * @return {!Promise.<!MediaKeySystemAccess>}
 */
shaka.polyfill.PatchedMediaKeys.v01b.requestMediaKeySystemAccess =
    function(keySystem, opt_supportedConfigurations) {
  shaka.log.debug('v01b.requestMediaKeySystemAccess');
  shaka.asserts.assert(this instanceof Navigator);

  // TODO(story 1954733): handle opt_supportedConfigurations.

  // Alias.
  var v01b = shaka.polyfill.PatchedMediaKeys.v01b;
  try {
    var access = new v01b.MediaKeySystemAccess(keySystem);
    return Promise.resolve(/** @type {!MediaKeySystemAccess} */ (access));
  } catch (exception) {
    return Promise.reject(exception);
  }
};


/**
 * An implementation of HTMLMediaElement.prototype.setMediaKeys.
 * Attach a MediaKeys object to the media element.
 *
 * @this {!HTMLMediaElement}
 * @param {MediaKeys} mediaKeys
 * @return {!Promise}
 */
shaka.polyfill.PatchedMediaKeys.v01b.setMediaKeys = function(mediaKeys) {
  shaka.log.debug('v01b.setMediaKeys');
  shaka.asserts.assert(this instanceof HTMLMediaElement);

  // Alias.
  var v01b = shaka.polyfill.PatchedMediaKeys.v01b;

  var newMediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys} */ (
          mediaKeys);
  var oldMediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys} */ (
          this.mediaKeys);

  if (oldMediaKeys && oldMediaKeys != newMediaKeys) {
    shaka.asserts.assert(oldMediaKeys instanceof v01b.MediaKeys);
    // Have the old MediaKeys stop listening to events on the video tag.
    oldMediaKeys.setMedia(null);
  }

  delete this['mediaKeys'];  // in case there is an existing getter
  this['mediaKeys'] = mediaKeys;  // work around read-only declaration

  if (newMediaKeys) {
    shaka.asserts.assert(newMediaKeys instanceof v01b.MediaKeys);
    newMediaKeys.setMedia(this);
  }

  return Promise.resolve();
};


/**
 * For some of this polyfill's implementation, we need to query a video element.
 * But for some embedded systems, it is memory-expensive to create multiple
 * video elements.  Therefore, we check the document to see if we can borrow one
 * to query before we fall back to creating one temporarily.
 *
 * @return {!HTMLVideoElement}
 * @protected
 */
shaka.polyfill.PatchedMediaKeys.v01b.getVideoElement = function() {
  var videos = document.getElementsByTagName('video');
  /** @type {!HTMLVideoElement} */
  var tmpVideo = videos.length ? videos[0] : document.createElement('video');
  return tmpVideo;
};



/**
 * An implementation of MediaKeySystemAccess.
 *
 * @constructor
 * @param {string} keySystem
 * @implements {MediaKeySystemAccess}
 * @throws {Error} if the key system is not supported.
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySystemAccess =
    function(keySystem) {
  shaka.log.debug('v01b.MediaKeySystemAccess');

  /** @type {string} */
  this.keySystem = keySystem;

  /** @private {string} */
  this.internalKeySystem_ = keySystem;

  if (keySystem == 'org.w3.clearkey') {
    // Clearkey's string must be prefixed in v0.1b.
    this.internalKeySystem_ = 'webkit-org.w3.clearkey';
  }

  var tmpVideo = shaka.polyfill.PatchedMediaKeys.v01b.getVideoElement();
  // v0.1b tests for key system availability with an extra argument on
  // canPlayType.  This, however, requires you to check video types in order to
  // check for key systems.  So we check all types we expect might succeed in
  // Chrome.
  var knownGoodTypes = ['video/mp4', 'video/webm'];
  for (var i = 0; i < knownGoodTypes.length; ++i) {
    if (tmpVideo.canPlayType(knownGoodTypes[i], this.internalKeySystem_)) {
      return;
    }
  }

  // The key system did not report as playable with any known-good video types.
  throw Error('The key system specified is not supported.');
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySystemAccess.prototype.
    createMediaKeys = function() {
  shaka.log.debug('v01b.MediaKeySystemAccess.createMediaKeys');

  // Alias.
  var v01b = shaka.polyfill.PatchedMediaKeys.v01b;
  var mediaKeys = new v01b.MediaKeys(this.internalKeySystem_);
  return Promise.resolve(/** @type {!MediaKeys} */ (mediaKeys));
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySystemAccess.prototype.
    getConfiguration = function() {
  shaka.log.debug('v01b.MediaKeySystemAccess.getConfiguration');
  // TODO: getConfiguration unsupported
  return null;
};



/**
 * An implementation of MediaKeys.
 *
 * @constructor
 * @param {string} keySystem
 * @implements {MediaKeys}
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys = function(keySystem) {
  shaka.log.debug('v01b.MediaKeys');

  /** @private {string} */
  this.keySystem_ = keySystem;

  /** @private {HTMLMediaElement} */
  this.media_ = null;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /**
   * @private {!Array.<!shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession>}
   */
  this.newSessions_ = [];

  /**
   * @private {!Object.<string,
   *                    !shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession>}
   */
  this.sessionMap_ = {};
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys.isTypeSupported =
    function(keySystem, mimeType) {
  // TODO: isTypeSupported deprecated
  shaka.log.debug('v01b.MediaKeys.isTypeSupported');

  var tmpVideo = shaka.polyfill.PatchedMediaKeys.v01b.getVideoElement();

  if (keySystem == 'org.w3.clearkey') {
    // Clearkey's string must be prefixed in v0.1b.
    keySystem = 'webkit-org.w3.clearkey';
  }

  return !!tmpVideo.canPlayType(mimeType, keySystem);
};


/**
 * @param {HTMLMediaElement} media
 * @protected
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys.prototype.setMedia =
    function(media) {
  this.media_ = media;

  // Remove any old listeners.
  this.eventManager_.removeAll();

  if (media) {
    // Intercept and translate these prefixed EME events.
    this.eventManager_.listen(media, 'webkitneedkey',
        /** @type {shaka.util.EventManager.ListenerType} */ (
            this.onWebkitNeedKey_.bind(this)));

    this.eventManager_.listen(media, 'webkitkeymessage',
        /** @type {shaka.util.EventManager.ListenerType} */ (
            this.onWebkitKeyMessage_.bind(this)));

    this.eventManager_.listen(media, 'webkitkeyadded',
        /** @type {shaka.util.EventManager.ListenerType} */ (
            this.onWebkitKeyAdded_.bind(this)));

    this.eventManager_.listen(media, 'webkitkeyerror',
        /** @type {shaka.util.EventManager.ListenerType} */ (
            this.onWebkitKeyError_.bind(this)));
  }
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys.prototype.createSession =
    function(opt_sessionType) {
  shaka.log.debug('v01b.MediaKeys.createSession');

  var sessionType = opt_sessionType || 'temporary';
  if (sessionType != 'temporary' && sessionType != 'persistent') {
    throw new TypeError('Session type ' + opt_sessionType +
                        ' is unsupported on this platform.');
  }

  // Alias.
  var v01b = shaka.polyfill.PatchedMediaKeys.v01b;

  shaka.asserts.assert(this.media_);
  var media = /** @type {!HTMLMediaElement} */ (this.media_);

  var session = new v01b.MediaKeySession(media, this.keySystem_, sessionType);
  this.newSessions_.push(session);
  return session;
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys.prototype.setServerCertificate =
    function(serverCertificate) {
  shaka.log.debug('v01b.MediaKeys.setServerCertificate');

  // There is no equivalent in v0.1b, so return failure.
  return Promise.reject(new Error(
      'setServerCertificate not supported on this platform.'));
};


/**
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys.prototype.onWebkitNeedKey_ =
    function(event) {
  shaka.log.debug('v01b.onWebkitNeedKey_', event);
  shaka.asserts.assert(this.media_);

  var event2 = shaka.util.FakeEvent.create({
    type: 'encrypted',
    initDataType: 'cenc',  // not used by v0.1b EME, but given a valid value
    initData: event.initData
  });

  this.media_.dispatchEvent(event2);
};


/**
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys.prototype.onWebkitKeyMessage_ =
    function(event) {
  shaka.log.debug('v01b.onWebkitKeyMessage_', event);

  var session = this.findSession_(event.sessionId);
  shaka.asserts.assert(session);
  if (!session) {
    shaka.log.error('Session not found', event.sessionId);
    return;
  }

  var isNew = isNaN(session.expiration);

  var event2 = shaka.util.FakeEvent.create({
    type: 'message',
    messageType: isNew ? 'licenserequest' : 'licenserenewal',
    message: event.message
  });

  session.generated();
  session.dispatchEvent(event2);
};


/**
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys.prototype.onWebkitKeyAdded_ =
    function(event) {
  shaka.log.debug('v01b.onWebkitKeyAdded_', event);

  var session = this.findSession_(event.sessionId);
  shaka.asserts.assert(session);
  if (session) {
    session.ready();
  }
};


/**
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys.prototype.onWebkitKeyError_ =
    function(event) {
  shaka.log.debug('v01b.onWebkitKeyError_', event);

  var session = this.findSession_(event.sessionId);
  shaka.asserts.assert(session);
  if (session) {
    session.handleError(event);
  }
};


/**
 * @param {string} sessionId
 * @return {shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession}
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeys.prototype.findSession_ =
    function(sessionId) {
  var session = this.sessionMap_[sessionId];
  if (session) {
    shaka.log.debug('v01b.MediaKeys.findSession_', session);
    return session;
  }

  session = this.newSessions_.shift();
  if (session) {
    session.sessionId = sessionId;
    this.sessionMap_[sessionId] = session;
    shaka.log.debug('v01b.MediaKeys.findSession_', session);
    return session;
  }

  return null;
};



/**
 * An implementation of MediaKeySession.
 *
 * @param {!HTMLMediaElement} media
 * @param {string} keySystem
 * @param {string} sessionType
 *
 * @constructor
 * @implements {MediaKeySession}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession =
    function(media, keySystem, sessionType) {
  shaka.log.debug('v01b.MediaKeySession');
  shaka.util.FakeEventTarget.call(this, null);

  /** @private {!HTMLMediaElement} */
  this.media_ = media;

  /** @private {shaka.util.PublicPromise} */
  this.generatePromise_ = null;

  /** @private {shaka.util.PublicPromise} */
  this.updatePromise_ = null;

  /** @private {string} */
  this.keySystem_ = keySystem;

  /** @private {string} */
  this.type_ = sessionType;

  /** @type {string} */
  this.sessionId = '';

  /** @type {number} */
  this.expiration = NaN;

  /** @type {!shaka.util.PublicPromise} */
  this.closed = new shaka.util.PublicPromise();

  /** @type {!MediaKeyStatuses} */
  this.keyStatuses = {};
  // TODO: key status and 'keyschange' events unsupported
};
goog.inherits(shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession,
              shaka.util.FakeEventTarget);


/**
 * Signals that the license request has been generated.  This resolves the
 * 'generateRequest' promise.
 *
 * @protected
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession.prototype.generated =
    function() {
  shaka.log.debug('v01b.MediaKeySession.generated');

  if (this.generatePromise_) {
    this.generatePromise_.resolve();
    this.generatePromise_ = null;
  }
};


/**
 * Signals that the session is 'ready', which is the terminology used in older
 * versions of EME.  The new signal is to resolve the 'update' promise.  This
 * translates between the two.
 *
 * @protected
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession.prototype.ready =
    function() {
  shaka.log.debug('v01b.MediaKeySession.ready');

  // There is no expiration info in v0.1b, but we want to signal, at least
  // internally, that the session is no longer new.  This allows us to set
  // the messageType attribute of 'message' events.
  this.expiration = Number.POSITIVE_INFINITY;
  // TODO: key status and 'keyschange' events unsupported

  if (this.updatePromise_) {
    this.updatePromise_.resolve();
  }
  this.updatePromise_ = null;
};


/**
 * Either rejects a promise, or dispatches an error event, as appropriate.
 *
 * @param {!MediaKeyEvent} event
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession.prototype.handleError =
    function(event) {
  shaka.log.debug('v01b.MediaKeySession.handleError', event);

  // This does not match the DOMException we get in current WD EME, but it will
  // at least provide some information which can be used to look into the
  // problem.
  var error = new Error('EME v0.1b key error');
  error.errorCode = event.errorCode;
  error.errorCode.systemCode = event.systemCode;

  // The presence or absence of sessionId indicates whether this corresponds to
  // generateRequest() or update().
  if (!event.sessionId && this.generatePromise_) {
    error.method = 'generateRequest';
    this.generatePromise_.reject(error);
    this.generatePromise_ = null;
  } else if (event.sessionId && this.updatePromise_) {
    error.method = 'update';
    this.updatePromise_.reject(error);
    this.updatePromise_ = null;
  }
};


/**
 * An internal version of generateRequest which defers new calls while old ones
 * are in progress.
 *
 * @param {!shaka.util.PublicPromise} promise  The promise associated with this
 *     call.
 * @param {BufferSource} initData
 * @param {?string} offlineSessionId
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession.prototype.generate_ =
    function(promise, initData, offlineSessionId) {
  if (this.generatePromise_) {
    // We already have a generate in-progress, so defer this one until after
    // the old one is resolved.  Execute this whether the original one succeeds
    // or fails.
    this.generatePromise_.then(
        this.generate_.bind(this, promise, initData, offlineSessionId)
    ).catch(
        this.generate_.bind(this, promise, initData, offlineSessionId)
    );
    return;
  }

  this.generatePromise_ = promise;
  try {
    /** @type {Uint8Array} */
    var mangledInitData;

    if (this.type_ == 'persistent') {
      var StringUtils = shaka.util.StringUtils;
      if (!offlineSessionId) {
        // Persisting the initial license.
        // Prefix the init data with a tag to indicate persistence.
        var u8InitData = new Uint8Array(initData);
        mangledInitData = StringUtils.toUint8Array(
            'PERSISTENT|' + StringUtils.fromUint8Array(u8InitData));
      } else {
        // Loading a stored license.
        // Prefix the init data (which is really a session ID) with a tag to
        // indicate that we are loading a persisted session.
        mangledInitData = StringUtils.toUint8Array(
            'LOAD_SESSION|' + offlineSessionId);
      }
    } else {
      // Streaming.
      shaka.asserts.assert(this.type_ == 'temporary');
      shaka.asserts.assert(!offlineSessionId);
      mangledInitData = new Uint8Array(initData);
    }

    shaka.asserts.assert(mangledInitData);
    this.media_.webkitGenerateKeyRequest(this.keySystem_, mangledInitData);
  } catch (exception) {
    // Reject the promise.
    this.generatePromise_.reject(exception);
    this.generatePromise_ = null;
  }
};


/**
 * An internal version of update which defers new calls while old ones are in
 * progress.
 *
 * @param {!shaka.util.PublicPromise} promise  The promise associated with this
 *     call.
 * @param {BufferSource} response
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession.prototype.update_ =
    function(promise, response) {
  if (this.updatePromise_) {
    // We already have an update in-progress, so defer this one until after the
    // old one is resolved.  Execute this whether the original one succeeds or
    // fails.
    this.updatePromise_.then(
        this.update_.bind(this, promise, response)
    ).catch(
        this.update_.bind(this, promise, response)
    );
    return;
  }

  this.updatePromise_ = promise;

  var key;
  var keyId;

  if (this.keySystem_ == 'webkit-org.w3.clearkey') {
    // The current EME version of clearkey wants a structured JSON response.
    // The v0.1b version wants just a raw key.  Parse the JSON response and
    // extract the key and key ID.
    var StringUtils = shaka.util.StringUtils;
    var licenseString = StringUtils.fromUint8Array(new Uint8Array(response));
    var jwkSet = /** @type {JWKSet} */ (JSON.parse(licenseString));
    key = StringUtils.toUint8Array(StringUtils.fromBase64(jwkSet.keys[0].k));
    keyId = StringUtils.toUint8Array(
        StringUtils.fromBase64(jwkSet.keys[0].kid));
  } else {
    // The key ID is not required.
    key = new Uint8Array(response);
    keyId = null;
  }

  try {
    this.media_.webkitAddKey(this.keySystem_, key, keyId, this.sessionId);
  } catch (exception) {
    // Reject the promise.
    this.updatePromise_.reject(exception);
    this.updatePromise_ = null;
  }
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession.prototype.generateRequest =
    function(initDataType, initData) {
  shaka.log.debug('v01b.MediaKeySession.generateRequest');
  var nextGeneratePromise = new shaka.util.PublicPromise();
  this.generate_(nextGeneratePromise, initData, null);
  return nextGeneratePromise;
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession.prototype.load =
    function(sessionId) {
  shaka.log.debug('v01b.MediaKeySession.load');
  if (this.type_ == 'persistent') {
    var nextGeneratePromise = new shaka.util.PublicPromise();
    this.generate_(nextGeneratePromise, null, sessionId);
    return nextGeneratePromise;
  } else {
    return Promise.reject(new Error('The session type is not "persistent".'));
  }
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession.prototype.update =
    function(response) {
  shaka.log.debug('v01b.MediaKeySession.update', response);
  shaka.asserts.assert(this.sessionId);

  var nextUpdatePromise = new shaka.util.PublicPromise();
  this.update_(nextUpdatePromise, response);
  return nextUpdatePromise;
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession.prototype.close =
    function() {
  shaka.log.debug('v01b.MediaKeySession.close');
  shaka.asserts.assert(this.sessionId);

  if (this.type_ != 'persistent') {
    // This will remove a persistent session, but it's also the only way to
    // free CDM resources on v0.1b.
    this.media_.webkitCancelKeyRequest(this.keySystem_, this.sessionId);
  }

  // Resolve the 'closed' promise and return it.
  this.closed.resolve();
  return this.closed;
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v01b.MediaKeySession.prototype.remove =
    function() {
  shaka.log.debug('v01b.MediaKeySession.remove');

  if (this.type_ != 'persistent') {
    return Promise.reject(new Error('Not a persistent session.'));
  }

  return this.close();
};

