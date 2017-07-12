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

goog.provide('shaka.polyfill.PatchedMediaKeysSafari');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * Install a polyfill to implement {@link http://goo.gl/blgtZZ EME draft
 * 12 March 2015} on top of the webkit-prefixed EME available in Safari v10.
 */
shaka.polyfill.PatchedMediaKeysSafari.install = function() {
  shaka.log.debug('PatchedMediaKeysSafari.install');

  // Alias
  var PatchedMediaKeysSafari = shaka.polyfill.PatchedMediaKeysSafari;

  // Construct fake key ID.  This is not done at load-time to avoid exceptions
  // on unsupported browsers.  This particular fake key ID was suggested in
  // w3c/encrypted-media#32.
  PatchedMediaKeysSafari.MediaKeyStatusMap.KEY_ID_ =
      (new Uint8Array([0])).buffer;

  // Delete mediaKeys to work around strict mode compatibility issues.
  delete HTMLMediaElement.prototype['mediaKeys'];
  // Work around read-only declaration for mediaKeys by using a string.
  HTMLMediaElement.prototype['mediaKeys'] = null;
  HTMLMediaElement.prototype.setMediaKeys = PatchedMediaKeysSafari.setMediaKeys;

  // Install patches
  window.MediaKeys = PatchedMediaKeysSafari.MediaKeys;
  window.MediaKeySystemAccess = PatchedMediaKeysSafari.MediaKeySystemAccess;
  navigator.requestMediaKeySystemAccess =
      PatchedMediaKeysSafari.requestMediaKeySystemAccess;
};


/**
 * An implementation of navigator.requestMediaKeySystemAccess.
 * Retrieve a MediaKeySystemAccess object.
 *
 * @this {!Navigator}
 * @param {string} keySystem
 * @param {!Array.<!MediaKeySystemConfiguration>} supportedConfigurations
 * @return {!Promise.<!MediaKeySystemAccess>}
 */
shaka.polyfill.PatchedMediaKeysSafari.requestMediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {
  shaka.log.debug('PatchedMediaKeysSafari.requestMediaKeySystemAccess');
  goog.asserts.assert(this == navigator,
                      'bad "this" for requestMediaKeySystemAccess');

  // Alias.
  var PatchedMediaKeysSafari = shaka.polyfill.PatchedMediaKeysSafari;
  try {
    var access = new PatchedMediaKeysSafari.MediaKeySystemAccess(
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
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {
  shaka.log.debug('PatchedMediaKeysSafari.MediaKeySystemAccess');

  /** @type {string} */
  this.keySystem = keySystem;

  /** @private {!MediaKeySystemConfiguration} */
  this.configuration_;

  var allowPersistentState = false;

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

    // PatchedMediaKeysSafari tests for key system availability through
    // WebKitMediaKeys.isTypeSupported
    var ranAnyTests = false;
    if (cfg.audioCapabilities) {
      for (var j = 0; j < cfg.audioCapabilities.length; ++j) {
        var cap = cfg.audioCapabilities[j];
        if (cap.contentType) {
          ranAnyTests = true;
          // Remove the codecs from the string, if any.  For example, this turns
          // 'audio/webm; codecs="opus"' into 'audio/webm'.
          var contentType = cap.contentType.split(';')[0];
          if (WebKitMediaKeys.isTypeSupported(this.keySystem, contentType)) {
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
          // Remove the codecs from the string, if any.  For example, this turns
          // 'video/webm; codecs="vp9"' into 'video/webm'.
          var contentType = cap.contentType.split(';')[0];
          if (WebKitMediaKeys.isTypeSupported(this.keySystem, contentType)) {
            newCfg.videoCapabilities.push(cap);
            success = true;
          }
        }
      }
    }

    if (!ranAnyTests) {
      // If no specific types were requested, we check for the key system alone.
      success = WebKitMediaKeys.isTypeSupported(this.keySystem);
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


/** @override */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySystemAccess.prototype.
    createMediaKeys = function() {
  shaka.log.debug(
      'PatchedMediaKeysSafari.MediaKeySystemAccess.createMediaKeys');

  // Alias
  var PatchedMediaKeysSafari = shaka.polyfill.PatchedMediaKeysSafari;

  var mediaKeys = new PatchedMediaKeysSafari.MediaKeys(this.keySystem);
  return Promise.resolve(/** @type {!MediaKeys} */ (mediaKeys));
};


/** @override */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySystemAccess.prototype.
    getConfiguration = function() {
  shaka.log.debug(
      'PatchedMediaKeysSafari.MediaKeySystemAccess.getConfiguration');
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
shaka.polyfill.PatchedMediaKeysSafari.setMediaKeys = function(mediaKeys) {
  shaka.log.debug('PatchedMediaKeysSafari.setMediaKeys');
  goog.asserts.assert(this instanceof HTMLMediaElement,
                      'bad "this" for setMediaKeys');

  // Alias
  var PatchedMediaKeysSafari = shaka.polyfill.PatchedMediaKeysSafari;

  var newMediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeysSafari.MediaKeys} */ (
      mediaKeys);
  var oldMediaKeys =
      /** @type {shaka.polyfill.PatchedMediaKeysSafari.MediaKeys} */ (
      this.mediaKeys);

  if (oldMediaKeys && oldMediaKeys != newMediaKeys) {
    goog.asserts.assert(
        oldMediaKeys instanceof PatchedMediaKeysSafari.MediaKeys,
        'non-polyfill instance of oldMediaKeys');
    // Have the old MediaKeys stop listening to events on the video tag.
    oldMediaKeys.setMedia(null);
  }

  delete this['mediaKeys'];  // in case there is an existing getter
  this['mediaKeys'] = mediaKeys;  // work around read-only declaration

  if (newMediaKeys) {
    goog.asserts.assert(
        newMediaKeys instanceof PatchedMediaKeysSafari.MediaKeys,
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
shaka.polyfill.PatchedMediaKeysSafari.MediaKeys = function(keySystem) {
  shaka.log.debug('PatchedMediaKeysSafari.MediaKeys');

  /** @private {!WebKitMediaKeys} */
  this.nativeMediaKeys_ = new WebKitMediaKeys(keySystem);

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  // These fields must be accessible to the MediaKeySession implementation:
  /** @type {?BufferSource} */
  this.serverCertificate = null;

  /** @type {string} */
  this.keySystem = keySystem;
};


/** @override */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeys.prototype.
    createSession = function(opt_sessionType) {
  shaka.log.debug('PatchedMediaKeysSafari.MediaKeys.createSession');

  var sessionType = opt_sessionType || 'temporary';
  // For now, only 'temporary' type is supported
  if (sessionType != 'temporary') {
    throw new TypeError('Session type ' + opt_sessionType +
        ' is unsupported on this platform.');
  }

  // Alias
  var PatchedMediaKeysSafari = shaka.polyfill.PatchedMediaKeysSafari;

  return new PatchedMediaKeysSafari.MediaKeySession(
      this, this.nativeMediaKeys_, sessionType);
};


/** @override */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeys.prototype.
    setServerCertificate = function(serverCertificate) {
  shaka.log.debug('PatchedMediaKeysSafari.MediaKeys.setServerCertificate');
  this.serverCertificate = serverCertificate;
  return Promise.resolve(true);
};


/**
 * @param {HTMLMediaElement} media
 * @protected
 * @return {!Promise}
 */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeys.prototype.
    setMedia = function(media) {

  // Alias
  var PatchedMediaKeysSafari = shaka.polyfill.PatchedMediaKeysSafari;

  // Remove any old listeners.
  this.eventManager_.removeAll();

  // It is valid for media to be null, it's used to flag that event handlers
  // need to be cleaned up
  if (!media) {
    return Promise.resolve();
  }

  // Intercept and translate these prefixed EME events.
  this.eventManager_.listen(media, 'webkitneedkey',
      /** @type {shaka.util.EventManager.ListenerType} */
      (PatchedMediaKeysSafari.onWebkitNeedKey_));

  try {
    media.webkitSetMediaKeys(this.nativeMediaKeys_);
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
 * @param {shaka.polyfill.PatchedMediaKeysSafari.MediaKeys} mediaKeys
 * @param {WebKitMediaKeys} nativeMediaKeys
 * @param {string} sessionType
 * @implements {MediaKeySession}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession =
    function(mediaKeys, nativeMediaKeys, sessionType) {
  shaka.log.debug('PatchedMediaKeysSafari.MediaKeySession');
  shaka.util.FakeEventTarget.call(this);

  // Native MediaKeySession, which will be created in generateRequest
  /** @private {WebKitMediaKeySession} */
  this.nativeMediaKeySession_ = null;

  /** @private {shaka.polyfill.PatchedMediaKeysSafari.MediaKeys} */
  this.mediaKeys_ = mediaKeys;

  /** @private {WebKitMediaKeys} */
  this.nativeMediaKeys_ = nativeMediaKeys;

  // Promises that are resolved later
  /** @private {Promise} */
  this.generateRequestPromise_ = null;

  /** @private {Promise} */
  this.updatePromise_ = null;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {string} */
  this.contentId_ = '';

  /** @type {string} */
  this.sessionId = '';

  /** @type {number} */
  this.expiration = NaN;

  /** @type {!shaka.util.PublicPromise} */
  this.closed = new shaka.util.PublicPromise();

  /** @type {!MediaKeyStatusMap} */
  this.keyStatuses =
      new shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap();
};
goog.inherits(shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession,
    shaka.util.FakeEventTarget);


/** @override */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.
    generateRequest = function(initDataType, initData) {
  shaka.log.debug('PatchedMediaKeysSafari.MediaKeySession.generateRequest');

  this.generateRequestPromise_ = new shaka.util.PublicPromise();

  try {
    initData = this.wrapInitData_(initDataType, initData);

    // This EME spec version requires a MIME content type as the 1st param
    // to createSession, but it doesn't seem to matter what the value is.
    this.nativeMediaKeySession_ = this.nativeMediaKeys_
        .createSession('video/mp4', new Uint8Array(initData));
    if (!this.nativeMediaKeySession_) {
      throw new Error('Unable to create session!');
    }
    this.sessionId = this.nativeMediaKeySession_.sessionId;

    // Attach session event handlers here
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
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.
    load = function() {
  shaka.log.debug('PatchedMediaKeysSafari.MediaKeySession.load');

  return Promise.reject(new Error('MediaKeySession.load not yet supported'));
};


/** @override */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.
    update = function(response) {
  shaka.log.debug('PatchedMediaKeysSafari.MediaKeySession.update');

  this.updatePromise_ = new shaka.util.PublicPromise();

  try {
    goog.asserts.assert(response != null, 'null response!');

    // Unwrap the response.
    response = this.unwrapLicense_(response);

    // Pass through to the native session.
    this.nativeMediaKeySession_.update(new Uint8Array(response));
  } catch (exception) {
    this.updatePromise_.reject(exception);
  }

  return this.updatePromise_;
};


/** @override */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.
    close = function() {
  shaka.log.debug('PatchedMediaKeysSafari.MediaKeySession.close');

  try {
    // Pass through to the native session
    this.nativeMediaKeySession_.close();

    this.closed.resolve();
    this.eventManager_.removeAll();
  } catch (exception) {
    this.closed.reject(exception);
  }

  return this.closed;
};


/** @override */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.
    remove = function() {
  shaka.log.debug('PatchedMediaKeysSafari.MediaKeySession.remove');

  return Promise.reject(new Error('MediaKeySession.remove is only ' +
      'applicable for persistent licenses, which are not supported on ' +
      'this platform'));
};


/**
 * Handler for the native media elements webkitNeedKey event.
 *
 * @this {!HTMLMediaElement}
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysSafari.onWebkitNeedKey_ = function(event) {
  shaka.log.debug('PatchedMediaKeysSafari.onWebkitNeedKey_', event);

  // NOTE: The init data format looks like this:
  // {
  //   "cont" : "mpts",
  //   "codc" : 2053202275,
  //   "mtyp" : 1936684398
  // }
  // We have no idea what to do with it.  We rely on the manifest parser to
  // supply the content ID as an init data override, so the encrypted events
  // we fire here should probably be ignored.

  // NOTE: Because "this" is a real EventTarget, the event we dispatch
  // here must also be a real Event.
  var event2 = /** @type {!CustomEvent} */(document.createEvent('CustomEvent'));
  event2.initCustomEvent('encrypted', false, false, null);
  event2.initDataType = 'mpts';
  event2.initData = event.initData;

  this.dispatchEvent(event2);
};


/**
 * Handler for the native keymessage event on WebKitMediaKeySession.
 *
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.
    onWebkitKeyMessage_ = function(event) {
  shaka.log.debug('PatchedMediaKeysSafari.onWebkitKeyMessage_', event);

  // We can now resolve this.generateRequestPromise (it should be non-null)
  goog.asserts.assert(this.generateRequestPromise_,
                      'generateRequestPromise_ not set in onWebkitKeyMessage_');
  if (this.generateRequestPromise_) {
    this.generateRequestPromise_.resolve();
    this.generateRequestPromise_ = null;
  }

  var isNew = this.keyStatuses.getStatus() == undefined;

  // The server may need the content ID as well as the key request.
  // We add the 'contentId' parameter below and let DrmEngine handle it.
  var event2 = new shaka.util.FakeEvent('message', {
    messageType: isNew ? 'licenserequest' : 'licenserenewal',
    message: event.message.buffer,
    'contentId': this.contentId_
  });

  this.dispatchEvent(event2);
};


/**
 * Handler for the native keyadded event on WebKitMediaKeySession.
 *
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.
    onWebkitKeyAdded_ = function(event) {
  shaka.log.debug('PatchedMediaKeysSafari.onWebkitKeyAdded_', event);

  // We don't expect to get this event while generating a request.
  goog.asserts.assert(!this.generateRequestPromise_,
                      'generateRequestPromise_ set in onWebkitKeyAdded_');

  // We can now resolve this.updatePromise (it should be non-null)
  goog.asserts.assert(this.updatePromise_,
                      'updatePromise_ not set in onWebkitKeyAdded_');
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
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.
    onWebkitKeyError_ = function(event) {
  shaka.log.debug('PatchedMediaKeysSafari.onWebkitKeyError_', event);

  var error = new Error('EME PatchedMediaKeysSafari key error');
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

    MEDIA_KEYERR_UNKNOWN        = 1
    MEDIA_KEYERR_CLIENT         = 2
    MEDIA_KEYERR_SERVICE        = 3
    MEDIA_KEYERR_OUTPUT         = 4
    MEDIA_KEYERR_HARDWARECHANGE = 5
    MEDIA_KEYERR_DOMAIN         = 6
    */

    switch (this.nativeMediaKeySession_.error.code) {
      case WebKitMediaKeyError.MEDIA_KEYERR_OUTPUT:
      case WebKitMediaKeyError.MEDIA_KEYERR_HARDWARECHANGE:
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
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.
    updateKeyStatus_ = function(status) {
  this.keyStatuses.setStatus(status);
  var event = new shaka.util.FakeEvent('keystatuseschange');
  this.dispatchEvent(event);
};


/**
 * @return {boolean} true if the key system is FairPlay
 * @private
 */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.isFairPlay_ =
    function() {
  return this.mediaKeys_.keySystem.indexOf('com.apple.fps') == 0;
};


/**
 * Wrap the init data for FairPlay into the format expected by the CDM.
 *
 * @param {string} initDataType
 * @param {BufferSource} initData
 * @return {BufferSource}
 * @throws {Error} if we do not have a server certificate
 * @private
 */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.wrapInitData_ =
    function(initDataType, initData) {
  if (!this.isFairPlay_()) {
    // Don't touch non-FairPlay init data.
    shaka.log.debug('Not FairPlay.  Using init data as-is.');
    return initData;
  }

  shaka.log.debug('Wrapping FairPlay init data.');
  var serverCertificate = this.mediaKeys_.serverCertificate;
  if (!serverCertificate) {
    throw new Error('A server certificate is required for FairPlay!');
  }

  // skd is the type used by the HLS parser when it feeds us an skd URI as init
  // data.  This is how we get the content ID.
  if (initDataType != 'skd') {
    throw new Error('Only skd-type init data is supported for FairPlay!');
  }

  // TODO: is this the right approach to parse the string?
  // Step 1: extract the content ID from the init data, which is a little-endian
  // UTF-16 string.
  var initDataAsString = shaka.util.StringUtils.fromUTF16(
      initData, /* littleEndian */ true);
  shaka.log.info('FairPlay init data:', initDataAsString);
  var initDataAsUri = new goog.Uri(initDataAsString);
  var contentIdAsString = initDataAsUri.getDomain();
  shaka.log.info('FairPlay content ID:', contentIdAsString);
  var contentIdAsArray = shaka.util.StringUtils.toUTF16(
      contentIdAsString, /* littleEndian */ true);
  // Store this for later.  We may need it in the license request.
  this.contentId_ = contentIdAsString;

  // Step 2: construct the individual pieces of the formatted init data.
  // Format: [original init data] + [LE 4 byte content ID byte length] +
  //         [UTF-16-LE content ID] + [LE 4 byte certificate byte length] +
  //         [certificate bytes]
  var idLength = new Uint8Array(4);
  (new DataView(idLength.buffer)).setUint32(
      0, contentIdAsArray.byteLength, /* littleEndian */ true);
  var certificateLength = new Uint8Array(4);
  (new DataView(certificateLength.buffer)).setUint32(
      0, serverCertificate.byteLength, /* littleEndian */ true);

  // Step 3: concatenate the pieces and return an ArrayBuffer.
  // TODO: examples show original init data first, but WebKit's sources seem
  // to show parsers that expect not to have that piece.
  var newInitData = shaka.util.Uint8ArrayUtils.concat(
      new Uint8Array(initData),
      idLength,
      new Uint8Array(contentIdAsArray),
      certificateLength,
      new Uint8Array(serverCertificate));
  return newInitData.buffer;
};


/**
 * Unwrap the license response into the format the CDM expects.
 *
 * @param {BufferSource} response
 * @return {BufferSource}
 * @throws {Error} if we fail to parse the reponse
 * @private
 */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeySession.prototype.unwrapLicense_ =
    function(response) {
  if (!this.isFairPlay_()) {
    // Don't touch non-FairPlay licenses.
    shaka.log.debug('Not FairPlay.  Using license response as-is.');
    return response;
  }

  shaka.log.debug('Unwrapping FairPlay license response.');
  // TODO: is this the right approach to parse the string?
  // We expect a response in the form of an XML document.
  // Inside that document is an element called <ckc>.
  // Inside that element is a base64-encoded string containing the license.
  // The CDM expects us to extract and decode that inner string.
  var doc = shaka.util.StringUtils.fromUTF16(
      response, /* littleEndian */ true);
  var matches = /<ckc>(.*)<\/ckc>/.exec(doc);
  if (!matches) {
    throw new Error('Failed to parse FairPlay response! (no ckc element)');
  }

  var base64License = matches[1];
  var license = shaka.util.Uint8ArrayUtils.fromBase64(base64License);
  return license.buffer;
};



/**
 * An implementation of MediaKeyStatusMap.
 * This fakes a map with a single key ID.
 *
 * @constructor
 * @struct
 * @implements {MediaKeyStatusMap}
 */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap = function() {
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
shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap.KEY_ID_;


/**
 * An internal method used by the session to set key status.
 * @param {string|undefined} status
 */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap.prototype.
    setStatus = function(status) {
  this.size = status == undefined ? 0 : 1;
  this.status_ = status;
};


/**
 * An internal method used by the session to get key status.
 * @return {string|undefined}
 */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap.prototype.
    getStatus = function() {
  return this.status_;
};


/** @override */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap.prototype.
    forEach = function(fn) {
  if (this.status_) {
    var fakeKeyId =
        shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap.KEY_ID_;
    fn(this.status_, fakeKeyId);
  }
};


/** @override */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap.prototype.
    get = function(keyId) {
  if (this.has(keyId)) {
    return this.status_;
  }
  return undefined;
};


/** @override */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap.prototype.
    has = function(keyId) {
  var fakeKeyId =
      shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap.KEY_ID_;
  if (this.status_ &&
      shaka.util.Uint8ArrayUtils.equal(
          new Uint8Array(keyId), new Uint8Array(fakeKeyId))) {
    return true;
  }
  return false;
};


/** @suppress {missingReturn} */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap.prototype.
    entries = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
};


/** @suppress {missingReturn} */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap.prototype.
    keys = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
};


/** @suppress {missingReturn} */
shaka.polyfill.PatchedMediaKeysSafari.MediaKeyStatusMap.prototype.
    values = function() {
  goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
};
