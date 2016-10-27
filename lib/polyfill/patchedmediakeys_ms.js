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
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * Install a polyfill to implement {@link http://goo.gl/blgtZZ EME draft
 * 12 March 2015} on top of ms-prefixed
 * {@link http://www.w3.org/TR/2014/WD-encrypted-media-20140218/ EME v20140218}.
 */
shaka.polyfill.PatchedMediaKeysMs.install = function() {
  shaka.log.debug('PatchedMediaKeysMs.install');

  // Alias
  var PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;

  // Construct fake key ID.  This is not done at load-time to avoid exceptions
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
 * Retrieve a MediaKeySystemAccess object.
 *
 * @this {!Navigator}
 * @param {string} keySystem
 * @param {!Array.<!MediaKeySystemConfiguration>} supportedConfigurations
 * @return {!Promise.<!MediaKeySystemAccess>}
 * @suppress {unnecessaryCasts}
 */
shaka.polyfill.PatchedMediaKeysMs.requestMediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {
  shaka.log.debug('PatchedMediaKeysMs.requestMediaKeySystemAccess');
  goog.asserts.assert(this == navigator,
                      'bad "this" for requestMediaKeySystemAccess');

  // Alias.
  var PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;
  try {
    var access = new PatchedMediaKeysMs.MediaKeySystemAccess(
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

  var allowPersistentState = true;

  var success = false;
  for (var i = 0; i < supportedConfigurations.length; ++i) {
    var cfg = supportedConfigurations[i];

    // Create a new config object and start adding in the pieces which we
    // find support for.  We will return this from getConfiguration() if
    // asked.
    /** @type {!MediaKeySystemConfiguration} */
    var newCfg = {
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
      'label': cfg.label
    };

    // PatchedMediaKeysMs tests for key system availability through
    // MSMediaKeys.isTypeSupported
    var ranAnyTests = false;
    if (cfg.audioCapabilities) {
      for (var j = 0; j < cfg.audioCapabilities.length; ++j) {
        var cap = cfg.audioCapabilities[j];
        if (cap.contentType) {
          ranAnyTests = true;
          var contentType = cap.contentType.split(';')[0];
          if (MSMediaKeys.isTypeSupported(this.keySystem, contentType)) {
            newCfg.audioCapabilities.push(cap);
            success = true;
          }
        }
      }
    }
    if (cfg.videoCapabilities) {
      for (var j = 0; j < cfg.videoCapabilities.length; ++j) {
        var cap = cfg.videoCapabilities[j];
        if (cap.contentType) {
          ranAnyTests = true;
          var contentType = cap.contentType.split(';')[0];
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

  // As per the spec, this should be a DOMException, but
  // there is not a public constructor for this
  var unsupportedKeySystemError = new Error('Unsupported keySystem');
  unsupportedKeySystemError.name = 'NotSupportedError';
  unsupportedKeySystemError.code = DOMException.NOT_SUPPORTED_ERR;
  throw unsupportedKeySystemError;
};


/**
 * @override
 * @suppress {unnecessaryCasts}
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySystemAccess.prototype.
    createMediaKeys = function() {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeySystemAccess.createMediaKeys');

  // Alias
  var PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;

  var mediaKeys = new PatchedMediaKeysMs.MediaKeys(this.keySystem);
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
 * Attach a MediaKeys object to the media element.
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
  var PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;

  var newMediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeysMs.MediaKeys} */ (
      mediaKeys);
  var oldMediaKeys =
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
    createSession = function(opt_sessionType) {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeys.createSession');

  var sessionType = opt_sessionType || 'temporary';
  // For now, only 'temporary' type is supported
  if (sessionType != 'temporary') {
    throw new TypeError('Session type ' + opt_sessionType +
        ' is unsupported on this platform.');
  }

  // Alias
  var PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;

  return new PatchedMediaKeysMs.MediaKeySession(
      this.nativeMediaKeys_, sessionType);
};


/** @override */
shaka.polyfill.PatchedMediaKeysMs.MediaKeys.prototype.
    setServerCertificate = function(serverCertificate) {
  shaka.log.debug('PatchedMediaKeysMs.MediaKeys.setServerCertificate');

  // There is no equivalent in PatchedMediaKeysMs, so return failure.
  return Promise.reject(new Error('setServerCertificate not supported on ' +
      'this platform.'));
};


/**
 * @param {HTMLMediaElement} media
 * @protected
 * @return {!Promise}
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeys.prototype.
    setMedia = function(media) {

  // Alias
  var PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;

  // Remove any old listeners.
  this.eventManager_.removeAll();

  // It is valid for media to be null, it's used to flag that event handlers
  // need to be cleaned up
  if (!media) {
    return Promise.resolve();
  }

  // Intercept and translate these prefixed EME events.
  this.eventManager_.listen(media, 'msneedkey',
      /** @type {shaka.util.EventManager.ListenerType} */
      (PatchedMediaKeysMs.onMsNeedKey_));

  var self = this;
  function setMediaKeysDeferred() {
    media.msSetMediaKeys(self.nativeMediaKeys_);
    media.removeEventListener('loadedmetadata', setMediaKeysDeferred);
  }

  // Wrap native HTMLMediaElement.msSetMediaKeys with Promise
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

  // Native MediaKeySession, which will be created in generateRequest
  /** @private {MSMediaKeySession} */
  this.nativeMediaKeySession_ = null;

  /** @private {MSMediaKeys} */
  this.nativeMediaKeys_ = nativeMediaKeys;

  // Promises that are resolved later
  /** @private {Promise} */
  this.generateRequestPromise_ = null;

  /** @private {Promise} */
  this.updatePromise_ = null;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @type {string} */
  this.sessionId = '';

  /** @type {number} */
  this.expiration = NaN;

  /** @type {!shaka.util.PublicPromise} */
  this.closed = new shaka.util.PublicPromise();

  /** @type {!MediaKeyStatusMap} */
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

    // Attach session event handlers here
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
    // Pass through to the native session
    // NOTE: IE seems to have spec discrepancy here - v2010218 should have
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

  // Alias
  var PatchedMediaKeysMs = shaka.polyfill.PatchedMediaKeysMs;

  // NOTE: Because "this" is a real EventTarget, on IE, the event we dispatch
  // here must also be a real Event.
  var event2 = /** @type {!CustomEvent} */(document.createEvent('CustomEvent'));
  event2.initCustomEvent('encrypted', false, false, null);
  event2.initDataType = 'cenc';
  event2.initData = PatchedMediaKeysMs.NormaliseInitData_(event.initData);

  this.dispatchEvent(event2);
};


/**
 * Normalise the initData array. This is to apply browser specific work-arounds,
 * e.g. removing duplicates which appears to occur intermittently when the
 * native msneedkey event fires (i.e. event.initData contains dupes).
 *
 * @param {?Uint8Array} initData
 * @private
 * @return {?Uint8Array}
 */
shaka.polyfill.PatchedMediaKeysMs.
    NormaliseInitData_ = function(initData) {
  if (!initData) {
    return initData;
  }

  var pssh = new shaka.util.Pssh(initData);

  // If there is only a single pssh, return the original array
  if (pssh.dataBoundaries.length <= 1) {
    return initData;
  }

  var unfilteredInitDatas = [];
  for (var i = 0; i < pssh.dataBoundaries.length; i++) {
    var currPssh = initData.subarray(
        pssh.dataBoundaries[i].start,
        pssh.dataBoundaries[i].end + 1); // end is exclusive, hence the +1

    unfilteredInitDatas.push(currPssh);
  }

  // Dedupe psshData
  var dedupedInitDatas = shaka.util.ArrayUtils.removeDuplicates(
      unfilteredInitDatas,
      shaka.polyfill.PatchedMediaKeysMs.compareInitDatas_);

  var targetLength = 0;
  for (var i = 0; i < dedupedInitDatas.length; i++) {
    targetLength += dedupedInitDatas[i].length;
  }

  // Concat array of Uint8Arrays back into a single Uint8Array
  var normalisedInitData = new Uint8Array(targetLength);
  var offset = 0;
  for (var i = 0; i < dedupedInitDatas.length; i++) {
    normalisedInitData.set(dedupedInitDatas[i], offset);
    offset += dedupedInitDatas[i].length;
  }

  return normalisedInitData;
};


/**
 * @param {!Uint8Array} initDataA
 * @param {!Uint8Array} initDataB
 * @return {boolean}
 * @private
 */
shaka.polyfill.PatchedMediaKeysMs.compareInitDatas_ =
    function(initDataA, initDataB) {
  return shaka.util.Uint8ArrayUtils.equal(initDataA, initDataB);
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

  // We can now resolve this.generateRequestPromise (it should be non-null)
  goog.asserts.assert(this.generateRequestPromise_,
                      'generateRequestPromise_ not set in onMsKeyMessage_');
  if (this.generateRequestPromise_) {
    this.generateRequestPromise_.resolve();
    this.generateRequestPromise_ = null;
  }

  var isNew = this.keyStatuses.getStatus() == undefined;

  var event2 = new shaka.util.FakeEvent('message', {
    messageType: isNew ? 'licenserequest' : 'licenserenewal',
    message: event.message.buffer
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

  // We can now resolve this.updatePromise (it should be non-null)
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

  var error = new Error('EME PatchedMediaKeysMs key error');
  error.errorCode = this.nativeMediaKeySession_.error;

  if (this.generateRequestPromise_ != null) {
    this.generateRequestPromise_.reject(error);
    this.generateRequestPromise_ = null;
  } else if (this.updatePromise_ != null) {
    this.updatePromise_.reject(error);
    this.updatePromise_ = null;
  } else {
    /*
    Unexpected error - map native codes to standardised key statuses.
    Possible values of this.nativeMediaKeySession_.error.code

    MS_MEDIA_KEYERR_UNKNOWN        = 1
    MS_MEDIA_KEYERR_CLIENT         = 2
    MS_MEDIA_KEYERR_SERVICE        = 3
    MS_MEDIA_KEYERR_OUTPUT         = 4
    MS_MEDIA_KEYERR_HARDWARECHANGE = 5
    MS_MEDIA_KEYERR_DOMAIN         = 6
    */

    switch (this.nativeMediaKeySession_.error.code) {
      case MSMediaKeyError.MS_MEDIA_KEYERR_OUTPUT:
      case MSMediaKeyError.MS_MEDIA_KEYERR_HARDWARECHANGE:
        this.updateKeyStatus_('output-not-allowed');
      default:
        this.updateKeyStatus_('internal-error');
    }
  }
};


/**
 * Update key status and dispatch a 'keystatuseschange' event.
 *
 * @param {string} status
 * @private
 */
shaka.polyfill.PatchedMediaKeysMs.MediaKeySession.prototype.
    updateKeyStatus_ = function(status) {
  this.keyStatuses.setStatus(status);
  var event = new shaka.util.FakeEvent('keystatuseschange');
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
    var fakeKeyId =
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
  var fakeKeyId =
      shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.KEY_ID_;
  if (this.status_ &&
      shaka.util.Uint8ArrayUtils.equal(
          new Uint8Array(keyId), new Uint8Array(fakeKeyId))) {
    return true;
  }
  return false;
};


/** @suppress {missingReturn} */
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.prototype.
    entries = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
};


/** @suppress {missingReturn} */
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.prototype.
    keys = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
};


/** @suppress {missingReturn} */
shaka.polyfill.PatchedMediaKeysMs.MediaKeyStatusMap.prototype.
    values = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
};
