/**
 * Copyright 2015 Google Inc.
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
 * @fileoverview A polyfill to stub out {@link http://goo.gl/blgtZZ EME draft
 * 12 March 2015} on browsers with EME version http://www.w3.org/TR/2014/WD-encrypted-media-20140218/.
 *
 * @see http://enwp.org/polyfill
 */

goog.provide('shaka.polyfill.PatchedMediaKeys.v20140218');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Pssh');
goog.require('shaka.asserts');
goog.require('shaka.log');


/**
 * Install the polyfill.
 */
shaka.polyfill.PatchedMediaKeys.v20140218.install = function() {
  shaka.log.debug('PatchedMediaKeys.v20140218.install');

  // Alias
  var v20140218 = shaka.polyfill.PatchedMediaKeys.v20140218;

  // Delete mediaKeys to work around strict mode compatibility issues.
  delete HTMLMediaElement.prototype['mediaKeys'];
  // Work around read-only declaration for mediaKeys by using a string.
  HTMLMediaElement.prototype['mediaKeys'] = null;
  HTMLMediaElement.prototype.setMediaKeys = v20140218.setMediaKeys;

  // Install patches
  window.MediaKeySession = v20140218.MediaKeySession;
  window.MediaKeys = v20140218.MediaKeys;
  window.MediaKeySystemAccess = v20140218.MediaKeySystemAccess;
  window['MediaKeyError'] = v20140218.MediaKeyError; // Compiler not allowing MediaKeyError to be set directly
  Navigator.prototype.requestMediaKeySystemAccess = v20140218.requestMediaKeySystemAccess;
};


/**
 * An implementation of Navigator.prototype.requestMediaKeySystemAccess.
 * Retrieve a MediaKeySystemAccess object.
 *
 * @this {!Navigator}
 * @param {string} keySystem
 * @param {!Array.<!MediaKeySystemConfiguration>} supportedConfigurations
 * @return {!Promise.<!MediaKeySystemAccess>}
 */
shaka.polyfill.PatchedMediaKeys.v20140218.requestMediaKeySystemAccess =
  function(keySystem, supportedConfigurations) {
    shaka.log.debug('PatchedMediaKeys.v20140218.requestMediaKeySystemAccess');
    shaka.asserts.assert(this instanceof Navigator);

    // Alias.
    var v20140218 = shaka.polyfill.PatchedMediaKeys.v20140218;
    try {
      var access = new v20140218.MediaKeySystemAccess(keySystem, supportedConfigurations);
      return Promise.resolve(/** @type {!MediaKeySystemAccess} */ (access));
    } catch (exception) {
      return Promise.reject(exception);
    }
  };


/**
 * An implementation of MediaKeySystemAccess.
 *
 * @constructor
 * @param {string} keySystem
 * @param {!Array.<!MediaKeySystemConfiguration>} supportedConfigurations
 * @implements {MediaKeySystemAccess}
 * @throws {Error} if the key system is not supported.
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeySystemAccess =
  function(keySystem, supportedConfigurations) {
    shaka.log.debug('v20140218.MediaKeySystemAccess');

    /** @type {string} */
    this.keySystem = keySystem;

    /** @private {!MediaKeySystemConfiguration} */
    this.configuration_;

    // This is only a guess, since we don't really know from the prefixed API.
    var allowPersistentState = true;

    if (keySystem == 'org.w3.clearkey') {
      // ClearKey doesn't support persistence.
      allowPersistentState = false;
    }

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
        'initDataTypes': cfg.initDataTypes
      };

      // v0.1b tests for key system availability with an extra argument on
      // canPlayType.
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
        } else {
          success = false;
        }
      }

      if (success) {
        this.configuration_ = newCfg;
        return;
      }
    }  // for each cfg in supportedConfigurations

    throw Error('None of the requested configurations were supported.');
  };


/** @override */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeySystemAccess.prototype.createMediaKeys = function() {
  shaka.log.debug('v20140218.MediaKeySystemAccess.createMediaKeys');

  // Alias
  var v20140218 = shaka.polyfill.PatchedMediaKeys.v20140218;

  var mediaKeys = new v20140218.MediaKeys(this.keySystem);
  return Promise.resolve(/** @type {!MediaKeys} */ (mediaKeys));
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeySystemAccess.prototype.
  getConfiguration = function() {
  shaka.log.debug('v20140218.MediaKeySystemAccess.getConfiguration');
  return this.configuration_;
};


/**
 * @this {!HTMLMediaElement}
 * @override
 * */
shaka.polyfill.PatchedMediaKeys.v20140218.setMediaKeys = function(mediaKeys_) {
  shaka.log.debug('v20140218.setMediaKeys');

  // If mediaKeys is null, ensure mediaKeys on the videoElement is null
  if (!mediaKeys_) {
    delete this['mediaKeys'];
    this['mediaKeys'] = null;

    return;
  }

  // If mediaKeys is the same as the videoElement's mediaKey instance, do nothing
  if (this.mediaKeys == mediaKeys_) {
    return;
  }

  // Alias
  var v20140218 = shaka.polyfill.PatchedMediaKeys.v20140218;

  // Remove any old listeners.
  mediaKeys_.eventManager_.removeAll();

  // Intercept and translate these prefixed EME events.
  mediaKeys_.eventManager_.listen(this, 'msneedkey', v20140218.onMsNeedKey_);

  delete this['mediaKeys'];  // in case there is an existing getter
  this['mediaKeys'] = mediaKeys_;  // work around read-only declaration

  // Wrap native HTMLMediaElement.msSetMediaKeys with Promise
  try {
    // IE11/Edge requires that readyState >=1 before mediaKeys can be set, so check this,
    // and wait for loadedmetadata event if we are not in the correct state
    if (this.readyState >= 1) {
      return Promise.resolve(this.msSetMediaKeys(mediaKeys_.nativeMediaKeys_));
    }
    else {
      return new Promise(function(resolve, reject){
        resolve(); // Need to resolve immediately otherwise Shaka is waiting indefinitely

        function setMediaKeysDeferred(){
          this.msSetMediaKeys(mediaKeys_.nativeMediaKeys_);
          this.removeEventListener("loadedmetadata", setMediaKeysDeferred);
        }

        this.addEventListener("loadedmetadata", setMediaKeysDeferred);
      }.bind(this));
    }
  } catch (exception) {
    return Promise.reject(exception);
  }
};


/**
 * An implementation of MediaKeys.
 *
 * @constructor
 * @param {string} keySystem
 * @implements {MediaKeys}
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeys = function(keySystem) {
  shaka.log.debug('v20140218.MediaKeys');

  this.keySystem_ = keySystem;
  this.nativeMediaKeys_ = new MSMediaKeys(keySystem);

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeys.prototype.createSession = function(){
  shaka.log.debug('v20140218.MediaKeys.createSession');

  // Alias
  var v20140218 = shaka.polyfill.PatchedMediaKeys.v20140218;

  return new v20140218.MediaKeySession(this.nativeMediaKeys_);
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeys.prototype.setServerCertificate = function(serverCertificate) {
  shaka.log.debug('v20140218.MediaKeys.setServerCertificate');

  // There is no equivalent in v20140218, so return failure.
  return Promise.reject(new Error('setServerCertificate not supported on this platform.'));
};


/**
 * An implementation of MediaKeySession.
 *
 * @constructor
 * @param {MSMediaKeys} nativeMediaKeys_
 * @implements {MediaKeySession}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeySession = function(nativeMediaKeys_) {
  shaka.log.debug('v20140218.MediaKeySession');
  shaka.util.FakeEventTarget.call(this, null);

  // This is the wrapped native MediaKeySession, which will be create in generateRequest
  this.nativeMediaKeySession_ = null;

  this.nativeMediaKeys_ = nativeMediaKeys_;

  // Promises that are resolved later
  this.generateRequestPromise_ = null;
  this.updatePromise_ = null;

  /** @type {string} */
  this.sessionId = '';

  /** @type {number} */
  this.expiration = NaN;

  /** @type {!shaka.util.PublicPromise} */
  this.closed = new shaka.util.PublicPromise();

  /** @type {!MediaKeyStatusMap} */
  this.keyStatuses = new shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap();
};
goog.inherits(shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeySession, shaka.util.FakeEventTarget);


/** @override */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeySession.prototype.generateRequest = function(initDataType, initData) {
  shaka.log.debug('v20140218.MediaKeySession.generateRequest');

  this.generateRequestPromise_ = new shaka.util.PublicPromise();

  try {
    // This EME spec version requires a MIME content type as the 1st param
    // to createSession, but doesn't seem to matter what the value is...
    this.nativeMediaKeySession_ = this.nativeMediaKeys_.createSession("video/mp4", initData);

    // Attach session event handlers here
    this.nativeMediaKeySession_.addEventListener("mskeymessage", shaka.polyfill.PatchedMediaKeys.v20140218.onMsKeyMessage_.bind(this));
    this.nativeMediaKeySession_.addEventListener("mskeyadded", shaka.polyfill.PatchedMediaKeys.v20140218.onMsKeyAdded_.bind(this));
    this.nativeMediaKeySession_.addEventListener("mskeyerror", shaka.polyfill.PatchedMediaKeys.v20140218.onMsKeyError_.bind(this));

    this.updateKeyStatus_("status-pending");
  }
  catch(exception) {
    this.generateRequestPromise_.reject(exception);
  }

  return this.generateRequestPromise_;
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeySession.prototype.load = function() {
  shaka.log.debug('v20140218.MediaKeySession.load');

  return Promise.reject(new Error('MediaKeySession.load is only applicable for persistent licenses, which are not supported on this platform'));
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeySession.prototype.update = function(response) {
  shaka.log.debug('v20140218.MediaKeySession.update');

  this.updatePromise_ = new shaka.util.PublicPromise();

  try {
    // Pass through to the native session
    this.nativeMediaKeySession_.update(response);
  }
  catch(exception) {
    this.updatePromise_.reject(exception);
  }

  return this.updatePromise_;
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeySession.prototype.close = function() {
  shaka.log.debug('v20140218.MediaKeySession.close');

  try {
    // Pass through to the native session
    // NOTE: IE seems to have spec discrepancy here - v2010218 should have MediaKeySession.release, but uses "close".
    // The next version of the spec is the initial Promise based one, so it's not the target spec either. Am supporting
    // both just in case..
    if (this.nativeMediaKeySession_.release) {
      this.nativeMediaKeySession_.release();
    }
    else {
      this.nativeMediaKeySession_.close();
    }

    this.closed.resolve();
  }
  catch(exception) {
    this.closed.reject(exception);
  }

  return this.closed;
};


/** @override */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeySession.prototype.remove = function() {
  shaka.log.debug('v20140218.MediaKeySession.remove');

  return Promise.reject(new Error('MediaKeySession.remove is only applicable for persistent licenses, which are not supported on this platform'));
};


/**
 * An implementation of MediaKeyError.
 *
 * @constructor
 * @param {MSMediaKeyError} nativeMediaKeyError
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyError = function(nativeMediaKeyError) {
  shaka.log.debug('v20140218.MediaKeyError');

  this.nativeMediaKeyError_ = nativeMediaKeyError;
  this.code = nativeMediaKeyError.code;
  this.systemCode = nativeMediaKeyError.systemCode;
};


/**
 * Handler for the native media elements msNeedKey event.
 *
 * @this {!HTMLMediaElement}
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v20140218.onMsNeedKey_ = function(event) {
  shaka.log.debug('v20140218.onMsNeedKey_', event);

  // Specific work-around: IE11 seems to be raising needkey with 2 identical PSSH boxes. Not sure if this
  // the way media is encoded, or an IE11 issue. This work-around may not be suitable for pull-request
  var normalisedInitData = event.initData;
  if (event.initData != null) {
    var pssh = new shaka.util.Pssh(event.initData);
    if (pssh.systemIds.length == 2) {
      normalisedInitData = event.initData.subarray(0, event.initData.length / 2);
    }
  }

  var event2 = shaka.util.FakeEvent.create({
    type: 'encrypted',
    initDataType: 'cenc',  // ContentType is sent, not initDataType, not sure where to source an accurate value
    initData: normalisedInitData
  });

  this.dispatchEvent(event2);
};


/**
 * Handler for the native keymessage event on MSMediaKeySession.
 *
 * @this {!MediaKeySession}
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v20140218.onMsKeyMessage_ = function(event) {
  shaka.log.debug('v20140218.onMsKeyMessage_', event);

  // We can now resolve this.generateRequestPromise (it should be non-null)
  if (this.generateRequestPromise_) {
    this.generateRequestPromise_.resolve();
    this.generateRequestPromise_ = null;
  }

  var event2 = shaka.util.FakeEvent.create({
    type: 'message',
    messageType: 'licenserequest',
    message: event.message
  });

  this.dispatchEvent(event2);
};


/**
 * Handler for the native keyadded event on MSMediaKeySession.
 *
 * @this {!MediaKeySession}
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v20140218.onMsKeyAdded_ = function(event) {
  shaka.log.debug('v20140218.onMsKeyAdded_', event);

  // We can now resolve this.updatePromise (it should be non-null)
  if (this.updatePromise_) {
    this.updateKeyStatus_("usable");
    this.updatePromise_.resolve();
    this.updatePromise_ = null;
  }
};


/**
 * Handler for the native keyerror event on MSMediaKeySession.
 *
 * @this {!MediaKeySession}
 * @param {!MediaKeyEvent} event
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v20140218.onMsKeyError_ = function(event) {
  shaka.log.debug('v20140218.onMsKeyError_', event);

  // Alias
  var v20140218 = shaka.polyfill.PatchedMediaKeys.v20140218;

  var error = new Error('EME v20140218 key error');
  error.errorCode = new v20140218.MediaKeyError(this.nativeMediaKeySession_);

  if (this.generateRequestPromise_ != null) {
    this.generateRequestPromise_.reject(error);
    this.generateRequestPromise_ = null;
  }
  else if (this.updatePromise_ != null) {
    this.updatePromise_.reject(error);
    this.updatePromise_ = null;
  }
  else {
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
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeySession.prototype.updateKeyStatus_ = function(status) {
  this.keyStatuses.setStatus(status);
  var event = shaka.util.FakeEvent.create({type: 'keystatuseschange'});
  this.dispatchEvent(event);
};


/**
 * An implementation of Iterator.
 *
 * @param {!Array.<VALUE>} values
 *
 * @constructor
 * @implements {Iterator}
 * @template VALUE
 */
shaka.polyfill.PatchedMediaKeys.v20140218.Iterator = function(values) {
  /** @private {!Array.<VALUE>} */
  this.values_ = values;

  /** @private {number} */
  this.index_ = 0;
};


/**
 * @return {{value:VALUE, done:boolean}}
 */
shaka.polyfill.PatchedMediaKeys.v20140218.Iterator.prototype.next = function() {
  if (this.index_ >= this.values_.length) {
    return {value: undefined, done: true};
  }
  return {value: this.values_[this.index_++], done: false};
};



/**
 * An implementation of MediaKeyStatusMap.
 * This fakes a map with a single key ID.
 *
 * @constructor
 * @implements {MediaKeyStatusMap}
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap = function() {
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
 * @const {!Uint8Array}
 * @private
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.KEY_ID_;


/**
 * An internal method used by the session to set key status.
 * @param {string|undefined} status
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.prototype.setStatus =
  function(status) {
    this.size = status == undefined ? 0 : 1;
    this.status_ = status;
  };


/**
 * An internal method used by the session to get key status.
 * @return {string|undefined}
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.prototype.getStatus =
  function() {
    return this.status_;
  };


/**
 * Array entry 0 is the key, 1 is the value.
 * @return {Iterator.<Array.<!BufferSource|string>>}
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.prototype.entries =
  function() {
    var fakeKeyId =
      shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.KEY_ID_;
    /** @type {!Array.<!Array.<!BufferSource|string>>} */
    var arr = [];
    if (this.status_) {
      arr.push([fakeKeyId, this.status_]);
    }
    return new shaka.polyfill.PatchedMediaKeys.v20140218.Iterator(arr);
  };


/**
 * The functor is called with each value.
 * @param {function(string)} fn
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.prototype.forEach =
  function(fn) {
    if (this.status_) {
      fn(this.status_);
    }
  };


/**
 * @param {!BufferSource} keyId
 * @return {string|undefined}
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.prototype.get =
  function(keyId) {
    if (this.has(keyId)) {
      return this.status_;
    }
    return undefined;
  };


/**
 * @param {!BufferSource} keyId
 * @return {boolean}
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.prototype.has =
  function(keyId) {
    var fakeKeyId =
      shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.KEY_ID_;
    if (this.status_ &&
      shaka.util.Uint8ArrayUtils.equal(new Uint8Array(keyId), fakeKeyId)) {
      return true;
    }
    return false;
  };


/**
 * @return {Iterator.<!BufferSource>}
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.prototype.keys =
  function() {
    var fakeKeyId =
      shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.KEY_ID_;
    /** @type {!Array.<!BufferSource>} */
    var arr = [];
    if (this.status_) {
      arr.push(fakeKeyId);
    }
    return new shaka.polyfill.PatchedMediaKeys.v20140218.Iterator(arr);
  };


/**
 * @return {Iterator.<string>}
 */
shaka.polyfill.PatchedMediaKeys.v20140218.MediaKeyStatusMap.prototype.values =
  function() {
    /** @type {!Array.<string>} */
    var arr = [];
    if (this.status_) {
      arr.push(this.status_);
    }
    return new shaka.polyfill.PatchedMediaKeys.v20140218.Iterator(arr);
  };
