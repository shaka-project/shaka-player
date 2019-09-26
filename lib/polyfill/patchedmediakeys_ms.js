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

goog.provide('shaka.polyfill.PatchedMediaKeysMs');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.polyfill.register');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @namespace shaka.polyfill.PatchedMediaKeysMs
 *
 * @summary A polyfill to implement
 * {@link https://bit.ly/EmeMar15 EME draft 12 March 2015}
 * on top of ms-prefixed
 * {@link https://www.w3.org/TR/2014/WD-encrypted-media-20140218/ EME v20140218}
 */


/**
 * Installs the polyfill if needed.
 */
shaka.polyfill.PatchedMediaKeysMs.install = function() {
  if (!window.HTMLVideoElement || !window.MSMediaKeys ||
      (navigator.requestMediaKeySystemAccess &&
       MediaKeySystemAccess.prototype.getConfiguration)) {
    return;
  }
  shaka.log.info('Using ms-prefixed EME v20140218');

  // Alias
  const PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;

  // Construct a fake key ID.  This is not done at load-time to avoid exceptions
  // on unsupported browsers.  This particular fake key ID was suggested in
  // w3c/encrypted-media#32.
  PatchedMediaKeysMs.MediaKeyStatusMap.KEY_ID_ = (new Uint8Array([0])).buffer;

  // Delete mediaKeys to work around strict mode compatibility issues.
  delete HTMLMediaElement.prototype['mediaKeys'];
  // Work around read-only declaration for mediaKeys by using a string.
  HTMLMediaElement.prototype['mediaKeys'] = null;
  HTMLMediaElement.prototype.setMediaKeys = PatchedMediaKeysMs.setMediaKeys;

  // Install patches
  window.MediaKeys = PatchedMediaKeysMs.MediaKeys;
  window.MediaKeySystemAccess = PatchedMediaKeysMs.MediaKeySystemAccess;
  navigator.requestMediaKeySystemAccess =
      PatchedMediaKeysMs.requestMediaKeySystemAccess;
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
shaka.polyfill.PatchedMediaKeysMs.requestMediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {
  shaka.log.debug('PatchedMediaKeysMs.requestMediaKeySystemAccess');
  goog.asserts.assert(this == navigator,
                      'bad "this" for requestMediaKeySystemAccess');

  // Alias.
  const PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;
  try {
    let access = new PatchedMediaKeysMs.MediaKeySystemAccess(
        keySystem, supportedConfigurations);
    return Promise.resolve(/** @type {!MediaKeySystemAccess} */ (access));
  } catch (exception) {
    return Promise.reject(exception);
  }
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
shaka.polyfill.PatchedMediaKeysMs.MediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeySystemAccess');

  /** @type {string} */
  this.keySystem = keySystem;

  /** @private {!MediaKeySystemConfiguration} */
  this.configuration_;

  let allowPersistentState = false;

  let success = false;
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

    // PatchedMediaKeysMs tests for key system availability through
    // MSMediaKeys.isTypeSupported
    let ranAnyTests = false;
    if (cfg.audioCapabilities) {
      for (let j = 0; j < cfg.audioCapabilities.length; ++j) {
        let cap = cfg.audioCapabilities[j];
        if (cap.contentType) {
          ranAnyTests = true;
          let contentType = cap.contentType.split(';')[0];
          if (MSMediaKeys.isTypeSupported(this.keySystem, contentType)) {
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
          let contentType = cap.contentType.split(';')[0];
          if (MSMediaKeys.isTypeSupported(this.keySystem, contentType)) {
            newCfg.videoCapabilities.push(cap);
            success = true;
          }
        }
      }
    }

    if (!ranAnyTests) {
      // If no specific types were requested, we check all common types to find
      // out if the key system is present at all.
      success = MSMediaKeys.isTypeSupported(this.keySystem, 'video/mp4');
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

  // As per the spec, this should be a DOMException, but there is not a public
  // constructor for this.
  let unsupportedKeySystemError = new Error('Unsupported keySystem');
  unsupportedKeySystemError.name = 'NotSupportedError';
  unsupportedKeySystemError.code = DOMException.NOT_SUPPORTED_ERR;
  throw unsupportedKeySystemError;
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySystemAccess.prototype.
    createMediaKeys = function() {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeySystemAccess.createMediaKeys');

  // Alias
  const PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;

  let mediaKeys = new PatchedMediaKeysMs.MediaKeys(this.keySystem);
  return Promise.resolve(/** @type {!MediaKeys} */ (mediaKeys));
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySystemAccess.prototype.
    getConfiguration = function() {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeySystemAccess.getConfiguration');
  return this.configuration_;
};


/**
 * An implementation of HTMLMediaElement.prototype.setMediaKeys.
 * Attaches a MediaKeys object to the media element.
 *
 * @this {!HTMLMediaElement}
 * @param {MediaKeys} mediaKeys
 * @return {!Promise}
 */
shaka.polyfill.PatchedMediaKeysMs.setMediaKeys = function(mediaKeys) {
  shaka.log.debug('PatchedMediaKeysMs.setMediaKeys');
  goog.asserts.assert(this instanceof HTMLMediaElement,
                      'bad "this" for setMediaKeys');

  // Alias
  const PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;

  let newMediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeysMs.MediaKeys} */ (
      mediaKeys);
  let oldMediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeysMs.MediaKeys} */ (
      this.mediaKeys);

  if (oldMediaKeys && oldMediaKeys != newMediaKeys) {
    goog.asserts.assert(oldMediaKeys instanceof PatchedMediaKeysMs.MediaKeys,
                        'non-polyfill instance of oldMediaKeys');
    // Have the old MediaKeys stop listening to events on the video tag.
    oldMediaKeys.setMedia(null);
  }

  delete this['mediaKeys'];  // in case there is an existing getter
  this['mediaKeys'] = mediaKeys;  // work around read-only declaration

  if (newMediaKeys) {
    goog.asserts.assert(newMediaKeys instanceof PatchedMediaKeysMs.MediaKeys,
                        'non-polyfill instance of newMediaKeys');
    return newMediaKeys.setMedia(this);
  }

  return Promise.resolve();
};


/**
 * An implementation of MediaKeys.
 *
 * @constructor
 * @struct
 * @param {string} keySystem
 * @implements {MediaKeys}
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeys = function(keySystem) {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeys');

  /** @private {!MSMediaKeys} */
  this.nativeMediaKeys_ = new MSMediaKeys(keySystem);

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeys.prototype.
    createSession = function(sessionType) {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeys.createSession');

  sessionType = sessionType || 'temporary';
  // For now, only the 'temporary' type is supported.
  if (sessionType != 'temporary') {
    throw new TypeError('Session type ' + sessionType +
        ' is unsupported on this platform.');
  }

  // Alias
  const PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;

  return new PatchedMediaKeysMs.MediaKeySession(
      this.nativeMediaKeys_, sessionType);
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeys.prototype.
    setServerCertificate = function(serverCertificate) {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeys.setServerCertificate');

  // There is no equivalent in PatchedMediaKeysMs, so return failure.
  return Promise.resolve(false);
};


/**
 * @param {HTMLMediaElement} media
 * @protected
 * @return {!Promise}
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeys.prototype.
    setMedia = function(media) {
  // Alias
  const PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;

  // Remove any old listeners.
  this.eventManager_.removeAll();

  // It is valid for media to be null; null is used to flag that event handlers
  // need to be cleaned up.
  if (!media) {
    return Promise.resolve();
  }

  // Intercept and translate these prefixed EME events.
  this.eventManager_.listen(media, 'msneedkey',
      /** @type {shaka.util.EventManager.ListenerType} */
      (PatchedMediaKeysMs.onMsNeedKey_));

  let self = this;
  function setMediaKeysDeferred() {
    media.msSetMediaKeys(self.nativeMediaKeys_);
    media.removeEventListener('loadedmetadata', setMediaKeysDeferred);
  }

  // Wrap native HTMLMediaElement.msSetMediaKeys with a Promise.
  try {
    // IE11/Edge requires that readyState >=1 before mediaKeys can be set, so
    // check this and wait for loadedmetadata if we are not in the correct state
    if (media.readyState >= 1) {
      media.msSetMediaKeys(this.nativeMediaKeys_);
    } else {
      media.addEventListener('loadedmetadata', setMediaKeysDeferred);
    }

    return Promise.resolve();
  } catch (exception) {
    return Promise.reject(exception);
  }
};


/**
 * An implementation of MediaKeySession.
 *
 * @constructor
 * @struct
 * @param {MSMediaKeys} nativeMediaKeys
 * @param {string} sessionType
 * @implements {MediaKeySession}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.polyfill.PatchedMediaKeysMs.
    MediaKeySession = function(nativeMediaKeys, sessionType) {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeySession');
  shaka.util.FakeEventTarget.call(this);

  // The native MediaKeySession, which will be created in generateRequest.
  /** @private {MSMediaKeySession} */
  this.nativeMediaKeySession_ = null;

  /** @private {MSMediaKeys} */
  this.nativeMediaKeys_ = nativeMediaKeys;

  // Promises that are resolved later
  /** @private {shaka.util.PublicPromise} */
  this.generateRequestPromise_ = null;

  /** @private {shaka.util.PublicPromise} */
  this.updatePromise_ = null;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @type {string} */
  this.sessionId = '';

  /** @type {number} */
  this.expiration = NaN;

  /** @type {!shaka.util.PublicPromise} */
  this.closed = new shaka.util.PublicPromise();

  /** @type {!shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap} */
  this.keyStatuses =
      new shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap();
};
goog.inherits(shaka.polyfill.PatchedMediaKeysMs.MediaKeySession,
    shaka.util.FakeEventTarget);


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySession.prototype.
    generateRequest = function(initDataType, initData) {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeySession.generateRequest');

  this.generateRequestPromise_ = new shaka.util.PublicPromise();

  try {
    // This EME spec version requires a MIME content type as the 1st param
    // to createSession, but doesn't seem to matter what the value is.

    // NOTE: IE11 takes either Uint8Array or ArrayBuffer, but Edge 12 only
    // accepts Uint8Array.
    this.nativeMediaKeySession_ = this.nativeMediaKeys_
        .createSession('video/mp4', new Uint8Array(initData), null);

    // Attach session event handlers here.
    this.eventManager_.listen(this.nativeMediaKeySession_, 'mskeymessage',
        /** @type {shaka.util.EventManager.ListenerType} */
        (this.onMsKeyMessage_.bind(this)));
    this.eventManager_.listen(this.nativeMediaKeySession_, 'mskeyadded',
        /** @type {shaka.util.EventManager.ListenerType} */
        (this.onMsKeyAdded_.bind(this)));
    this.eventManager_.listen(this.nativeMediaKeySession_, 'mskeyerror',
        /** @type {shaka.util.EventManager.ListenerType} */
        (this.onMsKeyError_.bind(this)));

    this.updateKeyStatus_('status-pending');
  } catch (exception) {
    this.generateRequestPromise_.reject(exception);
  }

  return this.generateRequestPromise_;
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySession.prototype.
    load = function() {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeySession.load');

  return Promise.reject(new Error('MediaKeySession.load not yet supported'));
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySession.prototype.
    update = function(response) {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeySession.update');

  this.updatePromise_ = new shaka.util.PublicPromise();

  try {
    // Pass through to the native session.
    // NOTE: IE11 takes either Uint8Array or ArrayBuffer, but Edge 12 only
    // accepts Uint8Array.
    this.nativeMediaKeySession_.update(new Uint8Array(response));
  } catch (exception) {
    this.updatePromise_.reject(exception);
  }

  return this.updatePromise_;
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySession.prototype.
    close = function() {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeySession.close');

  try {
    // Pass through to the native session.
    // NOTE: IE seems to have a spec discrepancy here - v2010218 should have
    // MediaKeySession.release, but actually uses "close". The next version
    // of the spec is the initial Promise based one, so it's not the target spec
    // either.
    this.nativeMediaKeySession_.close();

    this.closed.resolve();
    this.eventManager_.removeAll();
  } catch (exception) {
    this.closed.reject(exception);
  }

  return this.closed;
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySession.prototype.
    remove = function() {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeySession.remove');

  return Promise.reject(new Error('MediaKeySession.remove is only ' +
      'applicable for persistent licenses, which are not supported on ' +
      'this platform'));
};


/**
 * Handler for the native media elements msNeedKey event.
 *
 * @this {!HTMLMediaElement}
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysMs.onMsNeedKey_ = function(event) {
  shaka.log.debug('PatchedMediaKeysMs.onMsNeedKey_', event);
  if (!event.initData) {
    return;
  }

  // NOTE: Because "this" is a real EventTarget, on IE, the event we dispatch
  // here must also be a real Event.
  let event2 = /** @type {!CustomEvent} */(document.createEvent('CustomEvent'));
  event2.initCustomEvent('encrypted', false, false, null);
  event2.initDataType = 'cenc';
  event2.initData = shaka.util.Pssh.normaliseInitData(event.initData);

  this.dispatchEvent(event2);
};


/**
 * Handler for the native keymessage event on MSMediaKeySession.
 *
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySession.prototype.
    onMsKeyMessage_ = function(event) {
  shaka.log.debug('PatchedMediaKeysMs.onMsKeyMessage_', event);

  // We can now resolve this.generateRequestPromise, which should be non-null.
  goog.asserts.assert(this.generateRequestPromise_,
                      'generateRequestPromise_ not set in onMsKeyMessage_');
  if (this.generateRequestPromise_) {
    this.generateRequestPromise_.resolve();
    this.generateRequestPromise_ = null;
  }

  let isNew = this.keyStatuses.getStatus() == undefined;

  let event2 = new shaka.util.FakeEvent('message', {
    messageType: isNew ? 'license-request' : 'license-renewal',
    message: event.message.buffer,
  });

  this.dispatchEvent(event2);
};


/**
 * Handler for the native keyadded event on MSMediaKeySession.
 *
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySession.prototype.
    onMsKeyAdded_ = function(event) {
  shaka.log.debug('PatchedMediaKeysMs.onMsKeyAdded_', event);

  // PlayReady's concept of persistent licenses makes emulation difficult here.
  // A license policy can say that the license persists, which causes the CDM to
  // store it for use in a later session.  The result is that in IE11, the CDM
  // fires 'mskeyadded' without ever firing 'mskeymessage'.
  if (this.generateRequestPromise_) {
    shaka.log.debug('Simulating completion for a PR persistent license.');
    goog.asserts.assert(!this.updatePromise_,
        'updatePromise_ and generateRequestPromise_ set in onMsKeyAdded_');
    this.updateKeyStatus_('usable');
    this.generateRequestPromise_.resolve();
    this.generateRequestPromise_ = null;
    return;
  }

  // We can now resolve this.updatePromise, which should be non-null.
  goog.asserts.assert(this.updatePromise_,
                      'updatePromise_ not set in onMsKeyAdded_');
  if (this.updatePromise_) {
    this.updateKeyStatus_('usable');
    this.updatePromise_.resolve();
    this.updatePromise_ = null;
  }
};


/**
 * Handler for the native keyerror event on MSMediaKeySession.
 *
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySession.prototype.
    onMsKeyError_ = function(event) {
  shaka.log.debug('PatchedMediaKeysMs.onMsKeyError_', event);

  let error = new Error('EME PatchedMediaKeysMs key error');
  error.errorCode = this.nativeMediaKeySession_.error;

  if (this.generateRequestPromise_ != null) {
    this.generateRequestPromise_.reject(error);
    this.generateRequestPromise_ = null;
  } else if (this.updatePromise_ != null) {
    this.updatePromise_.reject(error);
    this.updatePromise_ = null;
  } else {
    // Unexpected error - map native codes to standardised key statuses.
    // Possible values of this.nativeMediaKeySession_.error.code:
    // MS_MEDIA_KEYERR_UNKNOWN        = 1
    // MS_MEDIA_KEYERR_CLIENT         = 2
    // MS_MEDIA_KEYERR_SERVICE        = 3
    // MS_MEDIA_KEYERR_OUTPUT         = 4
    // MS_MEDIA_KEYERR_HARDWARECHANGE = 5
    // MS_MEDIA_KEYERR_DOMAIN         = 6

    switch (this.nativeMediaKeySession_.error.code) {
      case MSMediaKeyError.MS_MEDIA_KEYERR_OUTPUT:
      case MSMediaKeyError.MS_MEDIA_KEYERR_HARDWARECHANGE:
        this.updateKeyStatus_('output-not-allowed');
        break;
      default:
        this.updateKeyStatus_('internal-error');
        break;
    }
  }
};


/**
 * Updates key status and dispatch a 'keystatuseschange' event.
 *
 * @param {string} status
 * @private
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySession.prototype.
    updateKeyStatus_ = function(status) {
  this.keyStatuses.setStatus(status);
  let event = new shaka.util.FakeEvent('keystatuseschange');
  this.dispatchEvent(event);
};


/**
 * An implementation of MediaKeyStatusMap.
 * This fakes a map with a single key ID.
 *
 * @constructor
 * @struct
 * @implements {MediaKeyStatusMap}
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap = function() {
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
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.KEY_ID_;


/**
 * An internal method used by the session to set key status.
 * @param {string|undefined} status
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.prototype.
    setStatus = function(status) {
  this.size = status == undefined ? 0 : 1;
  this.status_ = status;
};


/**
 * An internal method used by the session to get key status.
 * @return {string|undefined}
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.prototype.
    getStatus = function() {
  return this.status_;
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.prototype.
    forEach = function(fn) {
  if (this.status_) {
    let fakeKeyId =
        shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.KEY_ID_;
    fn(this.status_, fakeKeyId);
  }
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.prototype.
    get = function(keyId) {
  if (this.has(keyId)) {
    return this.status_;
  }
  return undefined;
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.prototype.
    has = function(keyId) {
  let fakeKeyId =
      shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.KEY_ID_;
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
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.prototype.
    entries = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for the compiler.');
};


/**
 * @suppress {missingReturn}
 * @override
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.prototype.
    keys = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for the compiler.');
};


/**
 * @suppress {missingReturn}
 * @override
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.prototype.
    values = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for the compiler.');
};


shaka.polyfill.register(shaka.polyfill.PatchedMediaKeysMs.install);
