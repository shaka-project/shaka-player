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

goog.provide('shaka.polyfill.PatchedMediaKeysApple');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.polyfill.register');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @namespace shaka.polyfill.PatchedMediaKeysApple
 *
 * @summary A polyfill to implement modern, standardized EME on top of Apple's
 * prefixed EME in Safari.
 */


/**
 * Installs the polyfill if needed.
 */
shaka.polyfill.PatchedMediaKeysApple.install = function() {
  if (!window.HTMLVideoElement || !window.WebKitMediaKeys) {
    // No HTML5 video or no prefixed EME.
    return;
  }

  // TODO: Prefer unprefixed EME once we know how to use it.
  // See: https://bugs.webkit.org/show_bug.cgi?id=197433
  /*
  if (navigator.requestMediaKeySystemAccess &&
      MediaKeySystemAccess.prototype.getConfiguration) {
    // Prefixed EME is preferable.
    return;
  }
  */

  shaka.log.info('Using Apple-prefixed EME');

  // Alias
  const PatchedMediaKeysApple = shaka.polyfill.PatchedMediaKeysApple;

  // Construct a fake key ID.  This is not done at load-time to avoid exceptions
  // on unsupported browsers.  This particular fake key ID was suggested in
  // w3c/encrypted-media#32.
  PatchedMediaKeysApple.MediaKeyStatusMap.KEY_ID_ =
      (new Uint8Array([0])).buffer;

  // Delete mediaKeys to work around strict mode compatibility issues.
  delete HTMLMediaElement.prototype['mediaKeys'];
  // Work around read-only declaration for mediaKeys by using a string.
  HTMLMediaElement.prototype['mediaKeys'] = null;
  HTMLMediaElement.prototype.setMediaKeys = PatchedMediaKeysApple.setMediaKeys;

  // Install patches
  window.MediaKeys = PatchedMediaKeysApple.MediaKeys;
  window.MediaKeySystemAccess = PatchedMediaKeysApple.MediaKeySystemAccess;
  navigator.requestMediaKeySystemAccess =
      PatchedMediaKeysApple.requestMediaKeySystemAccess;
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
shaka.polyfill.PatchedMediaKeysApple.requestMediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {
  shaka.log.debug('PatchedMediaKeysApple.requestMediaKeySystemAccess');
  goog.asserts.assert(this == navigator,
                      'bad "this" for requestMediaKeySystemAccess');

  // Alias.
  const PatchedMediaKeysApple = shaka.polyfill.PatchedMediaKeysApple;
  try {
    const access = new PatchedMediaKeysApple.MediaKeySystemAccess(
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
shaka.polyfill.PatchedMediaKeysApple.MediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {
  shaka.log.debug('PatchedMediaKeysApple.MediaKeySystemAccess');

  /** @type {string} */
  this.keySystem = keySystem;

  /** @private {!MediaKeySystemConfiguration} */
  this.configuration_;

  // Optimization: WebKitMediaKeys.isTypeSupported delays responses by a
  // significant amount of time, possibly to discourage fingerprinting.
  // Since we know only FairPlay is supported here, let's skip queries for
  // anything else to speed up the process.
  if (keySystem.startsWith('com.apple.fps')) {
    for (const cfg of supportedConfigurations) {
      const newCfg = this.checkConfig_(cfg);
      if (newCfg) {
        this.configuration_ = newCfg;
        return;
      }
    }
  }

  // As per the spec, this should be a DOMException, but there is not a public
  // constructor for DOMException.
  const unsupportedKeySystemError = new Error('Unsupported keySystem');
  unsupportedKeySystemError.name = 'NotSupportedError';
  unsupportedKeySystemError.code = DOMException.NOT_SUPPORTED_ERR;
  throw unsupportedKeySystemError;
};


/**
 * Check a single config for MediaKeySystemAccess.
 *
 * @param {MediaKeySystemConfiguration} cfg The requested config.
 * @return {?MediaKeySystemConfiguration} A matching config we can support, or
 *   null if the input is not supportable.
 * @private
 */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySystemAccess.prototype.
    checkConfig_ = function(cfg) {
  if (cfg.persistentState == 'required') {
    // Not supported by the prefixed API.
    return null;
  }

  // Create a new config object and start adding in the pieces which we find
  // support for.  We will return this from getConfiguration() later if asked.

  /** @type {!MediaKeySystemConfiguration} */
  const newCfg = {
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

  // PatchedMediaKeysApple tests for key system availability through
  // WebKitMediaKeys.isTypeSupported.
  let ranAnyTests = false;
  let success = false;

  if (cfg.audioCapabilities) {
    for (const cap of cfg.audioCapabilities) {
      if (cap.contentType) {
        ranAnyTests = true;

        const contentType = cap.contentType.split(';')[0];
        if (WebKitMediaKeys.isTypeSupported(this.keySystem, contentType)) {
          newCfg.audioCapabilities.push(cap);
          success = true;
        }
      }
    }
  }

  if (cfg.videoCapabilities) {
    for (const cap of cfg.videoCapabilities) {
      if (cap.contentType) {
        ranAnyTests = true;

        const contentType = cap.contentType.split(';')[0];
        if (WebKitMediaKeys.isTypeSupported(this.keySystem, contentType)) {
          newCfg.videoCapabilities.push(cap);
          success = true;
        }
      }
    }
  }

  if (!ranAnyTests) {
    // If no specific types were requested, we check all common types to find
    // out if the key system is present at all.
    success = WebKitMediaKeys.isTypeSupported(this.keySystem, 'video/mp4');
  }

  if (success) {
    return newCfg;
  }
  return null;
};


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySystemAccess.prototype.
    createMediaKeys = function() {
  shaka.log.debug('PatchedMediaKeysApple.MediaKeySystemAccess.createMediaKeys');

  // Alias
  const PatchedMediaKeysApple = shaka.polyfill.PatchedMediaKeysApple;

  const mediaKeys = new PatchedMediaKeysApple.MediaKeys(this.keySystem);
  return Promise.resolve(/** @type {!MediaKeys} */ (mediaKeys));
};


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySystemAccess.prototype.
    getConfiguration = function() {
  shaka.log.debug(
      'PatchedMediaKeysApple.MediaKeySystemAccess.getConfiguration');
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
shaka.polyfill.PatchedMediaKeysApple.setMediaKeys = function(mediaKeys) {
  shaka.log.debug('PatchedMediaKeysApple.setMediaKeys');
  goog.asserts.assert(this instanceof HTMLMediaElement,
                      'bad "this" for setMediaKeys');

  // Alias
  const PatchedMediaKeysApple = shaka.polyfill.PatchedMediaKeysApple;

  const newMediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeysApple.MediaKeys} */ (
      mediaKeys);
  const oldMediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeysApple.MediaKeys} */ (
      this.mediaKeys);

  if (oldMediaKeys && oldMediaKeys != newMediaKeys) {
    goog.asserts.assert(oldMediaKeys instanceof PatchedMediaKeysApple.MediaKeys,
                        'non-polyfill instance of oldMediaKeys');
    // Have the old MediaKeys stop listening to events on the video tag.
    oldMediaKeys.setMedia(null);
  }

  delete this['mediaKeys'];  // in case there is an existing getter
  this['mediaKeys'] = mediaKeys;  // work around read-only declaration

  if (newMediaKeys) {
    goog.asserts.assert(newMediaKeys instanceof PatchedMediaKeysApple.MediaKeys,
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
shaka.polyfill.PatchedMediaKeysApple.MediaKeys = function(keySystem) {
  shaka.log.debug('PatchedMediaKeysApple.MediaKeys');

  /** @private {!WebKitMediaKeys} */
  this.nativeMediaKeys_ = new WebKitMediaKeys(keySystem);

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @type {Uint8Array} */
  this.certificate = null;
};


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeys.prototype.
    createSession = function(sessionType) {
  shaka.log.debug('PatchedMediaKeysApple.MediaKeys.createSession');

  sessionType = sessionType || 'temporary';
  // For now, only the 'temporary' type is supported.
  if (sessionType != 'temporary') {
    throw new TypeError('Session type ' + sessionType +
        ' is unsupported on this platform.');
  }

  // Alias
  const PatchedMediaKeysApple = shaka.polyfill.PatchedMediaKeysApple;

  return new PatchedMediaKeysApple.MediaKeySession(
      this.nativeMediaKeys_, sessionType);
};


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeys.prototype.
    setServerCertificate = function(serverCertificate) {
  shaka.log.debug('PatchedMediaKeysApple.MediaKeys.setServerCertificate');

  this.certificate =
      serverCertificate ? new Uint8Array(serverCertificate) : null;

  return Promise.resolve(true);
};


/**
 * @param {HTMLMediaElement} media
 * @protected
 * @return {!Promise}
 */
shaka.polyfill.PatchedMediaKeysApple.MediaKeys.prototype.
    setMedia = function(media) {
  // Alias
  const PatchedMediaKeysApple = shaka.polyfill.PatchedMediaKeysApple;

  // Remove any old listeners.
  this.eventManager_.removeAll();

  // It is valid for media to be null; null is used to flag that event handlers
  // need to be cleaned up.
  if (!media) {
    return Promise.resolve();
  }

  // Intercept and translate these prefixed EME events.
  this.eventManager_.listen(media, 'webkitneedkey',
      /** @type {shaka.util.EventManager.ListenerType} */
      (PatchedMediaKeysApple.onWebkitNeedKey_));

  // Wrap native HTMLMediaElement.webkitSetMediaKeys with a Promise.
  try {
    // Some browsers require that readyState >=1 before mediaKeys can be set, so
    // check this and wait for loadedmetadata if we are not in the correct state
    if (media.readyState >= 1) {
      media.webkitSetMediaKeys(this.nativeMediaKeys_);
    } else {
      this.eventManager_.listenOnce(media, 'loadedmetadata', () => {
        media.webkitSetMediaKeys(this.nativeMediaKeys_);
      });
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
 * @param {WebKitMediaKeys} nativeMediaKeys
 * @param {string} sessionType
 * @implements {MediaKeySession}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySession =
    function(nativeMediaKeys, sessionType) {
  shaka.log.debug('PatchedMediaKeysApple.MediaKeySession');
  shaka.util.FakeEventTarget.call(this);

  /** The native MediaKeySession, which will be created in generateRequest.
   * @private {WebKitMediaKeySession} */
  this.nativeMediaKeySession_ = null;

  /** @private {WebKitMediaKeys} */
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

  /** @type {!shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap} */
  this.keyStatuses =
      new shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap();
};
goog.inherits(shaka.polyfill.PatchedMediaKeysApple.MediaKeySession,
    shaka.util.FakeEventTarget);


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySession.prototype.
    generateRequest = function(initDataType, initData) {
  shaka.log.debug('PatchedMediaKeysApple.MediaKeySession.generateRequest');

  this.generateRequestPromise_ = new shaka.util.PublicPromise();

  try {
    // This EME spec version requires a MIME content type as the 1st param
    // to createSession, but doesn't seem to matter what the value is.
    // It also only accepts Uint8Array, not ArrayBuffer, so explicitly make
    // initData into a Uint8Array.
    this.nativeMediaKeySession_ = this.nativeMediaKeys_.createSession(
        'video/mp4', new Uint8Array(initData));

    // Attach session event handlers here.
    this.eventManager_.listen(this.nativeMediaKeySession_, 'webkitkeymessage',
        /** @type {shaka.util.EventManager.ListenerType} */
        (this.onWebkitKeyMessage_.bind(this)));
    this.eventManager_.listen(this.nativeMediaKeySession_, 'webkitkeyadded',
        /** @type {shaka.util.EventManager.ListenerType} */
        (this.onWebkitKeyAdded_.bind(this)));
    this.eventManager_.listen(this.nativeMediaKeySession_, 'webkitkeyerror',
        /** @type {shaka.util.EventManager.ListenerType} */
        (this.onWebkitKeyError_.bind(this)));

    this.updateKeyStatus_('status-pending');
  } catch (exception) {
    this.generateRequestPromise_.reject(exception);
  }

  return this.generateRequestPromise_;
};


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySession.prototype.
    load = function() {
  shaka.log.debug('PatchedMediaKeysApple.MediaKeySession.load');

  return Promise.reject(new Error('MediaKeySession.load not yet supported'));
};


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySession.prototype.
    update = function(response) {
  shaka.log.debug('PatchedMediaKeysApple.MediaKeySession.update');

  this.updatePromise_ = new shaka.util.PublicPromise();

  try {
    // Pass through to the native session.
    this.nativeMediaKeySession_.update(new Uint8Array(response));
  } catch (exception) {
    this.updatePromise_.reject(exception);
  }

  return this.updatePromise_;
};


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySession.prototype.
    close = function() {
  shaka.log.debug('PatchedMediaKeysApple.MediaKeySession.close');

  try {
    // Pass through to the native session.
    this.nativeMediaKeySession_.close();

    this.closed.resolve();
    this.eventManager_.removeAll();
  } catch (exception) {
    this.closed.reject(exception);
  }

  return this.closed;
};


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySession.prototype.
    remove = function() {
  shaka.log.debug('PatchedMediaKeysApple.MediaKeySession.remove');

  return Promise.reject(new Error('MediaKeySession.remove is only ' +
      'applicable for persistent licenses, which are not supported on ' +
      'this platform'));
};


/**
 * Rebuild FairPlay init data according to Apple's docs.  It's unclear why this
 * is not done by the browser, or if the unprefixed version will do it for us.
 *
 * @param {BufferSource} initData
 * @param {BufferSource} certificate
 * @return {BufferSource}
 */
shaka.polyfill.PatchedMediaKeysApple.rebuildInitData_ =
    function(initData, certificate) {
  // TODO: Move this into DrmEngine if it is still needed with unprefixed EME.
  // FairPlay init data is in two parts and must be processed a bit.
  // The first part is a 4 byte little-endian int, which is the length of the
  // second part.
  const initDataArray = new Uint8Array(initData);
  const dataview = new DataView(initDataArray.buffer);
  const length = dataview.getUint32(
      /* position= */ 0, /* littleEndian= */ true);
  if (length + 4 != initDataArray.byteLength) {
    throw new Error('Malformed init data!');
  }

  // The second part is a UTF-16 LE URI from the manifest.
  const uriString = shaka.util.StringUtils.fromUTF16(
      initDataArray.slice(4), /* littleEndian= */ true);

  // The domain of that URI is the content ID according to Apple's FPS sample.
  const uri = new goog.Uri(uriString);
  const contentId = uri.getDomain();

  // From that, we build a new init data to use in the session.  This is
  // composed of several parts.  First, the raw init data we already got.
  // Second, a 4-byte LE length followed by the content ID in UTF-16-LE.
  // Third, a 4-byte LE length followed by the certificate.
  const contentIdArray = new Uint8Array(
      shaka.util.StringUtils.toUTF16(contentId, /* littleEndian= */ true));

  const rebuiltInitData = new Uint8Array(
      initDataArray.byteLength +
      4 + contentIdArray.byteLength +
      4 + certificate.byteLength);

  let offset = 0;
  /** @param {!Uint8Array} array */
  const append = (array) => {
    rebuiltInitData.set(array, offset);
    offset += array.byteLength;
  };
  /** @param {!Uint8Array} array */
  const appendWithLength = (array) => {
    const view = new DataView(rebuiltInitData.buffer);
    const value = array.byteLength;
    view.setUint32(offset, value, /* littleEndian= */ true);
    offset += 4;
    append(array);
  };

  append(initDataArray);
  appendWithLength(contentIdArray);
  appendWithLength(new Uint8Array(certificate));

  return rebuiltInitData;
};


/**
 * Handler for the native media elements webkitneedkey event.
 *
 * @this {!HTMLMediaElement}
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysApple.onWebkitNeedKey_ = function(event) {
  shaka.log.debug('PatchedMediaKeysApple.onWebkitNeedKey_', event);

  const PatchedMediaKeysApple = shaka.polyfill.PatchedMediaKeysApple;
  const mediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeysApple.MediaKeys} */(
          this.mediaKeys);
  goog.asserts.assert(mediaKeys instanceof PatchedMediaKeysApple.MediaKeys,
                      'non-polyfill instance of newMediaKeys');

  goog.asserts.assert(event.initData != null, 'missing init data!');

  const certificate = mediaKeys.certificate;
  goog.asserts.assert(certificate != null, 'missing certificate!');

  // NOTE: Because "this" is a real EventTarget, the event we dispatch here must
  // also be a real Event.
  const event2 = new Event('encrypted');
  // TODO: validate this initDataType against the unprefixed version
  event2.initDataType = 'cenc';
  event2.initData = PatchedMediaKeysApple.rebuildInitData_(
      event.initData, certificate);

  this.dispatchEvent(event2);
};


/**
 * Handler for the native keymessage event on WebKitMediaKeySession.
 *
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySession.prototype.
    onWebkitKeyMessage_ = function(event) {
  shaka.log.debug('PatchedMediaKeysApple.onWebkitKeyMessage_', event);

  // We can now resolve this.generateRequestPromise, which should be non-null.
  goog.asserts.assert(this.generateRequestPromise_,
                      'generateRequestPromise_ should be set before now!');
  if (this.generateRequestPromise_) {
    this.generateRequestPromise_.resolve();
    this.generateRequestPromise_ = null;
  }

  const isNew = this.keyStatuses.getStatus() == undefined;

  const event2 = new shaka.util.FakeEvent('message', {
    messageType: isNew ? 'license-request' : 'license-renewal',
    message: event.message.buffer,
  });

  this.dispatchEvent(event2);
};


/**
 * Handler for the native keyadded event on WebKitMediaKeySession.
 *
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySession.prototype.
    onWebkitKeyAdded_ = function(event) {
  shaka.log.debug('PatchedMediaKeysApple.onWebkitKeyAdded_', event);

  // This shouldn't fire while we're in the middle of generateRequest, but if it
  // does, we will need to change the logic to account for it.
  goog.asserts.assert(!this.generateRequestPromise_,
      'Key added during generate!');

  // We can now resolve this.updatePromise, which should be non-null.
  goog.asserts.assert(this.updatePromise_,
                      'updatePromise_ should be set before now!');
  if (this.updatePromise_) {
    this.updateKeyStatus_('usable');
    this.updatePromise_.resolve();
    this.updatePromise_ = null;
  }
};


/**
 * Handler for the native keyerror event on WebKitMediaKeySession.
 *
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysApple.MediaKeySession.prototype.
    onWebkitKeyError_ = function(event) {
  shaka.log.debug('PatchedMediaKeysApple.onWebkitKeyError_', event);

  const error = new Error('EME PatchedMediaKeysApple key error');
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
    // MEDIA_KEYERR_UNKNOWN        = 1
    // MEDIA_KEYERR_CLIENT         = 2
    // MEDIA_KEYERR_SERVICE        = 3
    // MEDIA_KEYERR_OUTPUT         = 4
    // MEDIA_KEYERR_HARDWARECHANGE = 5
    // MEDIA_KEYERR_DOMAIN         = 6

    switch (this.nativeMediaKeySession_.error.code) {
      case WebKitMediaKeyError.MEDIA_KEYERR_OUTPUT:
      case WebKitMediaKeyError.MEDIA_KEYERR_HARDWARECHANGE:
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
shaka.polyfill.PatchedMediaKeysApple.MediaKeySession.prototype.
    updateKeyStatus_ = function(status) {
  this.keyStatuses.setStatus(status);
  const event = new shaka.util.FakeEvent('keystatuseschange');
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
shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap = function() {
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
shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap.KEY_ID_;


/**
 * An internal method used by the session to set key status.
 * @param {string|undefined} status
 */
shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap.prototype.
    setStatus = function(status) {
  this.size = status == undefined ? 0 : 1;
  this.status_ = status;
};


/**
 * An internal method used by the session to get key status.
 * @return {string|undefined}
 */
shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap.prototype.
    getStatus = function() {
  return this.status_;
};


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap.prototype.
    forEach = function(fn) {
  if (this.status_) {
    const fakeKeyId =
        shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap.KEY_ID_;
    fn(this.status_, fakeKeyId);
  }
};


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap.prototype.
    get = function(keyId) {
  if (this.has(keyId)) {
    return this.status_;
  }
  return undefined;
};


/** @override */
shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap.prototype.
    has = function(keyId) {
  const fakeKeyId =
      shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap.KEY_ID_;
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
shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap.prototype.
    entries = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for the compiler.');
};


/**
 * @suppress {missingReturn}
 * @override
 */
shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap.prototype.
    keys = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for the compiler.');
};


/**
 * @suppress {missingReturn}
 * @override
 */
shaka.polyfill.PatchedMediaKeysApple.MediaKeyStatusMap.prototype.
    values = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for the compiler.');
};


shaka.polyfill.register(shaka.polyfill.PatchedMediaKeysApple.install);
