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

goog.provide('shaka.polyfill.PatchedMediaKeysWebkit');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.polyfill.register');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @namespace shaka.polyfill.PatchedMediaKeysWebkit
 *
 * @summary A polyfill to implement
 * {@link https://bit.ly/EmeMar15 EME draft 12 March 2015} on top of
 * webkit-prefixed {@link https://bit.ly/Eme01b EME v0.1b}.
 */


/**
 * Store api prefix.
 *
 * @private {string}
 */
shaka.polyfill.PatchedMediaKeysWebkit.prefix_ = '';


/**
 * Installs the polyfill if needed.
 */
shaka.polyfill.PatchedMediaKeysWebkit.install = function() {
  // Alias.
  const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;
  const prefixApi = PatchedMediaKeysWebkit.prefixApi_;

  if (!window.HTMLVideoElement ||
      (navigator.requestMediaKeySystemAccess &&
       MediaKeySystemAccess.prototype.getConfiguration)) {
    return;
  }
  if (HTMLMediaElement.prototype.webkitGenerateKeyRequest) {
    shaka.log.info('Using webkit-prefixed EME v0.1b');
    PatchedMediaKeysWebkit.prefix_ = 'webkit';
  } else if (HTMLMediaElement.prototype.generateKeyRequest) {
    shaka.log.info('Using nonprefixed EME v0.1b');
  } else {
    return;
  }

  goog.asserts.assert(
      HTMLMediaElement.prototype[prefixApi('generateKeyRequest')],
                      'PatchedMediaKeysWebkit APIs not available!');

  // Construct a fake key ID.  This is not done at load-time to avoid exceptions
  // on unsupported browsers.  This particular fake key ID was suggested in
  // w3c/encrypted-media#32.
  PatchedMediaKeysWebkit.MediaKeyStatusMap.KEY_ID_ =
      (new Uint8Array([0])).buffer;

  // Install patches.
  navigator.requestMediaKeySystemAccess =
      PatchedMediaKeysWebkit.requestMediaKeySystemAccess;
  // Delete mediaKeys to work around strict mode compatibility issues.
  delete HTMLMediaElement.prototype['mediaKeys'];
  // Work around read-only declaration for mediaKeys by using a string.
  HTMLMediaElement.prototype['mediaKeys'] = null;
  HTMLMediaElement.prototype.setMediaKeys = PatchedMediaKeysWebkit.setMediaKeys;
  window.MediaKeys = PatchedMediaKeysWebkit.MediaKeys;
  window.MediaKeySystemAccess = PatchedMediaKeysWebkit.MediaKeySystemAccess;
};


/**
 * Prefix the api with the stored prefix.
 *
 * @param {string} api
 * @return {string}
 * @private
 */
shaka.polyfill.PatchedMediaKeysWebkit.prefixApi_ = function(api) {
  let prefix = shaka.polyfill.PatchedMediaKeysWebkit.prefix_;
  if (prefix) {
    return prefix + api.charAt(0).toUpperCase() + api.slice(1);
  }
  return api;
};


/**
 * An implementation of navigator.requestMediaKeySystemAccess.
 * Retrieves a MediaKeySystemAccess object.
 *
 * @this {!Navigator}
 * @param {string} keySystem
 * @param {!Array.<!MediaKeySystemConfiguration>} supportedConfigurations
 * @return {!Promise.<!MediaKeySystemAccess>}
 */
shaka.polyfill.PatchedMediaKeysWebkit.requestMediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {
  shaka.log.debug('PatchedMediaKeysWebkit.requestMediaKeySystemAccess');
  goog.asserts.assert(this == navigator,
                      'bad "this" for requestMediaKeySystemAccess');

  // Alias.
  const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;
  try {
    let access = new PatchedMediaKeysWebkit.MediaKeySystemAccess(
        keySystem, supportedConfigurations);
    return Promise.resolve(/** @type {!MediaKeySystemAccess} */ (access));
  } catch (exception) {
    return Promise.reject(exception);
  }
};


/**
 * An implementation of HTMLMediaElement.prototype.setMediaKeys.
 * Attaches a MediaKeys object to the media element.
 *
 * @this {!HTMLMediaElement}
 * @param {MediaKeys} mediaKeys
 * @return {!Promise}
 */
shaka.polyfill.PatchedMediaKeysWebkit.setMediaKeys = function(mediaKeys) {
  shaka.log.debug('PatchedMediaKeysWebkit.setMediaKeys');
  goog.asserts.assert(this instanceof HTMLMediaElement,
                      'bad "this" for setMediaKeys');

  // Alias.
  const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;

  let newMediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys} */ (
          mediaKeys);
  let oldMediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys} */ (
          this.mediaKeys);

  if (oldMediaKeys && oldMediaKeys != newMediaKeys) {
    goog.asserts.assert(
        oldMediaKeys instanceof PatchedMediaKeysWebkit.MediaKeys,
        'non-polyfill instance of oldMediaKeys');
    // Have the old MediaKeys stop listening to events on the video tag.
    oldMediaKeys.setMedia(null);
  }

  delete this['mediaKeys'];  // In case there is an existing getter.
  this['mediaKeys'] = mediaKeys;  // Work around the read-only declaration.

  if (newMediaKeys) {
    goog.asserts.assert(
        newMediaKeys instanceof PatchedMediaKeysWebkit.MediaKeys,
        'non-polyfill instance of newMediaKeys');
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
 * @private
 */
shaka.polyfill.PatchedMediaKeysWebkit.getVideoElement_ = function() {
  let videos = document.getElementsByTagName('video');
  let tmpVideo = videos.length ? videos[0] : document.createElement('video');
  return /** @type {!HTMLVideoElement} */(tmpVideo);
};


/**
 * An implementation of MediaKeySystemAccess.
 *
 * @constructor
 * @struct
 * @param {string} keySystem
 * @param {!Array.<!MediaKeySystemConfiguration>} supportedConfigurations
 * @implements {MediaKeySystemAccess}
 * @throws {Error} if the key system is not supported.
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySystemAccess');

  /** @type {string} */
  this.keySystem = keySystem;

  /** @private {string} */
  this.internalKeySystem_ = keySystem;

  /** @private {!MediaKeySystemConfiguration} */
  this.configuration_;

  // This is only a guess, since we don't really know from the prefixed API.
  let allowPersistentState = false;

  if (keySystem == 'org.w3.clearkey') {
    // ClearKey's string must be prefixed in v0.1b.
    this.internalKeySystem_ = 'webkit-org.w3.clearkey';
    // ClearKey doesn't support persistence.
    allowPersistentState = false;
  }

  let success = false;
  let tmpVideo = shaka.polyfill.PatchedMediaKeysWebkit.getVideoElement_();
  for (let i = 0; i < supportedConfigurations.length; ++i) {
    let cfg = supportedConfigurations[i];

    // Create a new config object and start adding in the pieces which we
    // find support for.  We will return this from getConfiguration() if asked.
    /** @type {!MediaKeySystemConfiguration} */
    let newCfg = {
      'audioCapabilities': [],
      'videoCapabilities': [],
      // It is technically against spec to return these as optional, but we
      // don't truly know their values from the prefixed API:
      'persistentState': 'optional',
      'distinctiveIdentifier': 'optional',
      // Pretend the requested init data types are supported, since we don't
      // really know that either:
      'initDataTypes': cfg.initDataTypes,
      'sessionTypes': ['temporary'],
      'label': cfg.label,
    };

    // v0.1b tests for key system availability with an extra argument on
    // canPlayType.
    let ranAnyTests = false;
    if (cfg.audioCapabilities) {
      for (let j = 0; j < cfg.audioCapabilities.length; ++j) {
        let cap = cfg.audioCapabilities[j];
        if (cap.contentType) {
          ranAnyTests = true;
          // In Chrome <= 40, if you ask about Widevine-encrypted audio support,
          // you get a false-negative when you specify codec information.
          // Work around this by stripping codec info for audio types.
          let contentType = cap.contentType.split(';')[0];
          if (tmpVideo.canPlayType(contentType, this.internalKeySystem_)) {
            newCfg.audioCapabilities.push(cap);
            success = true;
          }
        }
      }
    }
    if (cfg.videoCapabilities) {
      for (let j = 0; j < cfg.videoCapabilities.length; ++j) {
        let cap = cfg.videoCapabilities[j];
        if (cap.contentType) {
          ranAnyTests = true;
          if (tmpVideo.canPlayType(cap.contentType, this.internalKeySystem_)) {
            newCfg.videoCapabilities.push(cap);
            success = true;
          }
        }
      }
    }

    if (!ranAnyTests) {
      // If no specific types were requested, we check all common types to find
      // out if the key system is present at all.
      success = tmpVideo.canPlayType('video/mp4', this.internalKeySystem_) ||
                tmpVideo.canPlayType('video/webm', this.internalKeySystem_);
    }
    if (cfg.persistentState == 'required') {
      if (allowPersistentState) {
        newCfg.persistentState = 'required';
        newCfg.sessionTypes = ['persistent-license'];
      } else {
        success = false;
      }
    }

    if (success) {
      this.configuration_ = newCfg;
      return;
    }
  }  // for each cfg in supportedConfigurations

  let message = 'Unsupported keySystem';
  if (keySystem == 'org.w3.clearkey' || keySystem == 'com.widevine.alpha') {
    message = 'None of the requested configurations were supported.';
  }
  let unsupportedError = new Error(message);
  unsupportedError.name = 'NotSupportedError';
  unsupportedError.code = DOMException.NOT_SUPPORTED_ERR;
  throw unsupportedError;
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySystemAccess.prototype.
    createMediaKeys = function() {
  shaka.log.debug(
      'PatchedMediaKeysWebkit.MediaKeySystemAccess.createMediaKeys');

  // Alias.
  const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;
  let mediaKeys = new PatchedMediaKeysWebkit.MediaKeys(this.internalKeySystem_);
  return Promise.resolve(/** @type {!MediaKeys} */ (mediaKeys));
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySystemAccess.prototype.
    getConfiguration = function() {
  shaka.log.debug(
      'PatchedMediaKeysWebkit.MediaKeySystemAccess.getConfiguration');
  return this.configuration_;
};


/**
 * An implementation of MediaKeys.
 *
 * @constructor
 * @struct
 * @param {string} keySystem
 * @implements {MediaKeys}
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys = function(keySystem) {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeys');

  /** @private {string} */
  this.keySystem_ = keySystem;

  /** @private {HTMLMediaElement} */
  this.media_ = null;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /**
   * @private {!Array.<!shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession>}
   */
  this.newSessions_ = [];

  /**
   * @private {!Object.<string,
   *                    !shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession>}
   */
  this.sessionMap_ = {};
};


/**
 * @param {HTMLMediaElement} media
 * @protected
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys.prototype.setMedia =
    function(media) {
  this.media_ = media;

  // Remove any old listeners.
  this.eventManager_.removeAll();

  let prefix = shaka.polyfill.PatchedMediaKeysWebkit.prefix_;
  if (media) {
    // Intercept and translate these prefixed EME events.
    this.eventManager_.listen(media, prefix + 'needkey',
        /** @type {shaka.util.EventManager.ListenerType} */ (
            this.onWebkitNeedKey_.bind(this)));

    this.eventManager_.listen(media, prefix + 'keymessage',
        /** @type {shaka.util.EventManager.ListenerType} */ (
            this.onWebkitKeyMessage_.bind(this)));

    this.eventManager_.listen(media, prefix + 'keyadded',
        /** @type {shaka.util.EventManager.ListenerType} */ (
            this.onWebkitKeyAdded_.bind(this)));

    this.eventManager_.listen(media, prefix + 'keyerror',
        /** @type {shaka.util.EventManager.ListenerType} */ (
            this.onWebkitKeyError_.bind(this)));
  }
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys.prototype.createSession =
    function(sessionType) {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeys.createSession');

  sessionType = sessionType || 'temporary';
  if (sessionType != 'temporary' && sessionType != 'persistent-license') {
    throw new TypeError('Session type ' + sessionType +
                        ' is unsupported on this platform.');
  }

  // Alias.
  const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;

  // Unprefixed EME allows for session creation without a video tag or src.
  // Prefixed EME requires both a valid HTMLMediaElement and a src.
  let media = this.media_ || /** @type {!HTMLMediaElement} */(
      document.createElement('video'));
  if (!media.src) media.src = 'about:blank';

  let session = new PatchedMediaKeysWebkit.MediaKeySession(
      media, this.keySystem_, sessionType);
  this.newSessions_.push(session);
  return session;
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys.prototype.setServerCertificate =
    function(serverCertificate) {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeys.setServerCertificate');

  // There is no equivalent in v0.1b, so return failure.
  return Promise.resolve(false);
};


/**
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys.prototype.onWebkitNeedKey_ =
    function(event) {
  shaka.log.debug('PatchedMediaKeysWebkit.onWebkitNeedKey_', event);
  goog.asserts.assert(this.media_, 'media_ not set in onWebkitNeedKey_');

  let event2 =
      /** @type {!CustomEvent} */ (document.createEvent('CustomEvent'));
  event2.initCustomEvent('encrypted', false, false, null);

  // not used by v0.1b EME, but given a valid value
  event2.initDataType = 'webm';
  event2.initData = event.initData;

  this.media_.dispatchEvent(event2);
};


/**
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys.prototype.onWebkitKeyMessage_ =
    function(event) {
  shaka.log.debug('PatchedMediaKeysWebkit.onWebkitKeyMessage_', event);

  let session = this.findSession_(event.sessionId);
  if (!session) {
    shaka.log.error('Session not found', event.sessionId);
    return;
  }

  let isNew = session.keyStatuses.getStatus() == undefined;

  let event2 = new shaka.util.FakeEvent('message', {
    messageType: isNew ? 'licenserequest' : 'licenserenewal',
    message: event.message,
  });

  session.generated();
  session.dispatchEvent(event2);
};


/**
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys.prototype.onWebkitKeyAdded_ =
    function(event) {
  shaka.log.debug('PatchedMediaKeysWebkit.onWebkitKeyAdded_', event);

  let session = this.findSession_(event.sessionId);
  goog.asserts.assert(session, 'unable to find session in onWebkitKeyAdded_');
  if (session) {
    session.ready();
  }
};


/**
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys.prototype.onWebkitKeyError_ =
    function(event) {
  shaka.log.debug('PatchedMediaKeysWebkit.onWebkitKeyError_', event);

  let session = this.findSession_(event.sessionId);
  goog.asserts.assert(session, 'unable to find session in onWebkitKeyError_');
  if (session) {
    session.handleError(event);
  }
};


/**
 * @param {string} sessionId
 * @return {shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession}
 * @private
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys.prototype.findSession_ =
    function(sessionId) {
  let session = this.sessionMap_[sessionId];
  if (session) {
    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeys.findSession_', session);
    return session;
  }

  session = this.newSessions_.shift();
  if (session) {
    session.sessionId = sessionId;
    this.sessionMap_[sessionId] = session;
    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeys.findSession_', session);
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
 * @struct
 * @implements {MediaKeySession}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession =
    function(media, keySystem, sessionType) {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession');
  shaka.util.FakeEventTarget.call(this);

  /** @private {!HTMLMediaElement} */
  this.media_ = media;

  /** @private {boolean} */
  this.initialized_ = false;

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

  /** @type {!shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap} */
  this.keyStatuses =
      new shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap();
};
goog.inherits(shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession,
              shaka.util.FakeEventTarget);


/**
 * Signals that the license request has been generated.  This resolves the
 * 'generateRequest' promise.
 *
 * @protected
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession.prototype.generated =
    function() {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.generated');

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
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession.prototype.ready =
    function() {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.ready');

  this.updateKeyStatus_('usable');

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
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession.prototype.handleError =
    function(event) {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.handleError', event);

  // This does not match the DOMException we get in current WD EME, but it will
  // at least provide some information which can be used to look into the
  // problem.
  let error = new Error('EME v0.1b key error');
  error.errorCode = event.errorCode;
  error.errorCode.systemCode = event.systemCode;

  // The presence or absence of sessionId indicates whether this corresponds to
  // generateRequest() or update().
  if (!event.sessionId && this.generatePromise_) {
    error.method = 'generateRequest';
    if (event.systemCode == 45) {
      error.message = 'Unsupported session type.';
    }
    this.generatePromise_.reject(error);
    this.generatePromise_ = null;
  } else if (event.sessionId && this.updatePromise_) {
    error.method = 'update';
    this.updatePromise_.reject(error);
    this.updatePromise_ = null;
  } else {
    // This mapping of key statuses is imperfect at best.
    let code = event.errorCode.code;
    let systemCode = event.systemCode;
    if (code == MediaKeyError['MEDIA_KEYERR_OUTPUT']) {
      this.updateKeyStatus_('output-restricted');
    } else if (systemCode == 1) {
      this.updateKeyStatus_('expired');
    } else {
      this.updateKeyStatus_('internal-error');
    }
  }
};


/**
 * Logic which is shared between generateRequest() and load(), both of which
 * are ultimately implemented with webkitGenerateKeyRequest in prefixed EME.
 *
 * @param {?BufferSource} initData
 * @param {?string} offlineSessionId
 * @return {!Promise}
 * @private
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession.prototype.generate_ =
    function(initData, offlineSessionId) {
  if (this.initialized_) {
    return Promise.reject(new Error('The session is already initialized.'));
  }

  this.initialized_ = true;

  /** @type {!Uint8Array} */
  let mangledInitData;

  try {
    if (this.type_ == 'persistent-license') {
      const StringUtils = shaka.util.StringUtils;
      if (!offlineSessionId) {
        // Persisting the initial license.
        // Prefix the init data with a tag to indicate persistence.
        let prefix = StringUtils.toUTF8('PERSISTENT|');
        let result = new Uint8Array(prefix.byteLength + initData.byteLength);
        result.set(new Uint8Array(prefix), 0);
        result.set(new Uint8Array(initData), prefix.byteLength);
        mangledInitData = result;
      } else {
        // Loading a stored license.
        // Prefix the init data (which is really a session ID) with a tag to
        // indicate that we are loading a persisted session.
        mangledInitData = new Uint8Array(
            StringUtils.toUTF8('LOAD_SESSION|' + offlineSessionId));
      }
    } else {
      // Streaming.
      goog.asserts.assert(this.type_ == 'temporary',
                          'expected temporary session');
      goog.asserts.assert(!offlineSessionId,
                          'unexpected offline session ID');
      mangledInitData = new Uint8Array(initData);
    }

    goog.asserts.assert(mangledInitData,
                        'init data not set!');
  } catch (exception) {
    return Promise.reject(exception);
  }

  goog.asserts.assert(this.generatePromise_ == null,
                      'generatePromise_ should be null');
  this.generatePromise_ = new shaka.util.PublicPromise();

  // Because we are hacking media.src in createSession to better emulate
  // unprefixed EME's ability to create sessions and license requests without a
  // video tag, we can get ourselves into trouble.  It seems that sometimes,
  // the setting of media.src hasn't been processed by some other thread, and
  // GKR can throw an exception.  If this occurs, wait 10 ms and try again at
  // most once.  This situation should only occur when init data is available
  // ahead of the 'needkey' event.

  let prefixApi = shaka.polyfill.PatchedMediaKeysWebkit.prefixApi_;
  let generateKeyRequestName = prefixApi('generateKeyRequest');
  try {
    this.media_[generateKeyRequestName](this.keySystem_, mangledInitData);
  } catch (exception) {
    if (exception.name != 'InvalidStateError') {
      this.generatePromise_ = null;
      return Promise.reject(exception);
    }

    const timer = new shaka.util.Timer(() => {
      try {
        this.media_[generateKeyRequestName](this.keySystem_, mangledInitData);
      } catch (exception2) {
        this.generatePromise_.reject(exception2);
        this.generatePromise_ = null;
      }
    });

    timer.tickAfter(/* seconds= */ 0.01);
  }

  return this.generatePromise_;
};


/**
 * An internal version of update which defers new calls while old ones are in
 * progress.
 *
 * @param {!shaka.util.PublicPromise} promise  The promise associated with this
 *   call.
 * @param {?BufferSource} response
 * @private
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession.prototype.update_ =
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

  let key;
  let keyId;

  if (this.keySystem_ == 'webkit-org.w3.clearkey') {
    // The current EME version of clearkey wants a structured JSON response.
    // The v0.1b version wants just a raw key.  Parse the JSON response and
    // extract the key and key ID.
    const StringUtils = shaka.util.StringUtils;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    let licenseString = StringUtils.fromUTF8(response);
    let jwkSet = /** @type {JWKSet} */ (JSON.parse(licenseString));
    let kty = jwkSet.keys[0].kty;
    if (kty != 'oct') {
      // Reject the promise.
      let error = new Error('Response is not a valid JSON Web Key Set.');
      this.updatePromise_.reject(error);
      this.updatePromise_ = null;
    }
    key = Uint8ArrayUtils.fromBase64(jwkSet.keys[0].k);
    keyId = Uint8ArrayUtils.fromBase64(jwkSet.keys[0].kid);
  } else {
    // The key ID is not required.
    key = new Uint8Array(response);
    keyId = null;
  }

  let prefixApi = shaka.polyfill.PatchedMediaKeysWebkit.prefixApi_;
  let addKeyName = prefixApi('addKey');
  try {
    this.media_[addKeyName](this.keySystem_, key, keyId, this.sessionId);
  } catch (exception) {
    // Reject the promise.
    this.updatePromise_.reject(exception);
    this.updatePromise_ = null;
  }
};


/**
 * Update key status and dispatch a 'keystatuseschange' event.
 *
 * @param {string} status
 * @private
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession.prototype.
    updateKeyStatus_ = function(status) {
  this.keyStatuses.setStatus(status);
  let event = new shaka.util.FakeEvent('keystatuseschange');
  this.dispatchEvent(event);
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession.prototype.
    generateRequest = function(initDataType, initData) {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.generateRequest');
  return this.generate_(initData, null);
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession.prototype.load =
    function(sessionId) {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.load');
  if (this.type_ == 'persistent-license') {
    return this.generate_(null, sessionId);
  } else {
    return Promise.reject(new Error('Not a persistent session.'));
  }
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession.prototype.update =
    function(response) {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.update', response);
  goog.asserts.assert(this.sessionId, 'update without session ID');

  let nextUpdatePromise = new shaka.util.PublicPromise();
  this.update_(nextUpdatePromise, response);
  return nextUpdatePromise;
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession.prototype.close =
    function() {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.close');

  // This will remove a persistent session, but it's also the only way to
  // free CDM resources on v0.1b.
  if (this.type_ != 'persistent-license') {
    // sessionId may reasonably be null if no key request has been generated
    // yet.  Unprefixed EME will return a rejected promise in this case.
    // We will use the same error message that Chrome 41 uses in its EME
    // implementation.
    if (!this.sessionId) {
      this.closed.reject(new Error('The session is not callable.'));
      return this.closed;
    }

    // This may throw an exception, but we ignore it because we are only using
    // it to clean up resources in v0.1b.  We still consider the session closed.
    // We can't let the exception propagate because MediaKeySession.close()
    // should not throw.
    let prefixApi = shaka.polyfill.PatchedMediaKeysWebkit.prefixApi_;
    let cancelKeyRequestName = prefixApi('cancelKeyRequest');
    try {
      this.media_[cancelKeyRequestName](this.keySystem_, this.sessionId);
    } catch (exception) {}
  }

  // Resolve the 'closed' promise and return it.
  this.closed.resolve();
  return this.closed;
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession.prototype.remove =
    function() {
  shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.remove');

  if (this.type_ != 'persistent-license') {
    return Promise.reject(new Error('Not a persistent session.'));
  }

  return this.close();
};


/**
 * An implementation of MediaKeyStatusMap.
 * This fakes a map with a single key ID.
 *
 * @constructor
 * @struct
 * @implements {MediaKeyStatusMap}
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap = function() {
  /**
   * @type {number}
   */
  this.size = 0;

  /**
   * @private {string|undefined}
   */
  this.status_ = undefined;
};


/**
 * @const {!ArrayBuffer}
 * @private
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap.KEY_ID_;


/**
 * An internal method used by the session to set key status.
 * @param {string|undefined} status
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap.prototype.setStatus =
    function(status) {
  this.size = status == undefined ? 0 : 1;
  this.status_ = status;
};


/**
 * An internal method used by the session to get key status.
 * @return {string|undefined}
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap.prototype.getStatus =
    function() {
  return this.status_;
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap.prototype.forEach =
    function(fn) {
  if (this.status_) {
    let fakeKeyId =
        shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap.KEY_ID_;
    fn(this.status_, fakeKeyId);
  }
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap.prototype.get =
    function(keyId) {
  if (this.has(keyId)) {
    return this.status_;
  }
  return undefined;
};


/** @override */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap.prototype.has =
    function(keyId) {
  let fakeKeyId =
      shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap.KEY_ID_;
  if (this.status_ &&
      shaka.util.Uint8ArrayUtils.equal(
          new Uint8Array(keyId), new Uint8Array(fakeKeyId))) {
    return true;
  }
  return false;
};


/**
 * @suppress {missingReturn}
 * @override
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap.prototype.
    entries = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
};


/**
 * @suppress {missingReturn}
 * @override
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap.prototype.
    keys = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
};


/**
 * @suppress {missingReturn}
 * @override
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap.prototype.
    values = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
};


shaka.polyfill.register(shaka.polyfill.PatchedMediaKeysWebkit.install);
