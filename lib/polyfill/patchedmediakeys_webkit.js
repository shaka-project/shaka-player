/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.PatchedMediaKeysWebkit');

goog.require('goog.asserts');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.log');
goog.require('shaka.polyfill');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @summary A polyfill to implement
 * {@link https://bit.ly/EmeMar15 EME draft 12 March 2015} on top of
 * webkit-prefixed {@link https://bit.ly/Eme01b EME v0.1b}.
 * @export
 */
shaka.polyfill.PatchedMediaKeysWebkit = class {
  /**
   * Installs the polyfill if needed.
   * @export
   */
  static install() {
    // Alias.
    const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;

    if (!window.HTMLVideoElement ||
        (navigator.requestMediaKeySystemAccess &&
         // eslint-disable-next-line no-restricted-syntax
         MediaKeySystemAccess.prototype.getConfiguration)) {
      return;
    }
    // eslint-disable-next-line no-restricted-syntax
    if (HTMLMediaElement.prototype.webkitGenerateKeyRequest) {
      shaka.log.info('Using webkit-prefixed EME v0.1b');
      PatchedMediaKeysWebkit.prefix_ = 'webkit';
      // eslint-disable-next-line no-restricted-syntax
    } else if (HTMLMediaElement.prototype.generateKeyRequest) {
      shaka.log.info('Using nonprefixed EME v0.1b');
    } else {
      return;
    }

    goog.asserts.assert(
        // eslint-disable-next-line no-restricted-syntax
        HTMLMediaElement.prototype[
            PatchedMediaKeysWebkit.prefixApi_('generateKeyRequest')],
        'PatchedMediaKeysWebkit APIs not available!');

    // Install patches.
    navigator.requestMediaKeySystemAccess =
        PatchedMediaKeysWebkit.requestMediaKeySystemAccess;
    // Delete mediaKeys to work around strict mode compatibility issues.
    // eslint-disable-next-line no-restricted-syntax
    delete HTMLMediaElement.prototype['mediaKeys'];
    // Work around read-only declaration for mediaKeys by using a string.
    // eslint-disable-next-line no-restricted-syntax
    HTMLMediaElement.prototype['mediaKeys'] = null;
    // eslint-disable-next-line no-restricted-syntax
    HTMLMediaElement.prototype.setMediaKeys =
        PatchedMediaKeysWebkit.setMediaKeys;
    window.MediaKeys = PatchedMediaKeysWebkit.MediaKeys;
    window.MediaKeySystemAccess = PatchedMediaKeysWebkit.MediaKeySystemAccess;

    window.shakaMediaKeysPolyfill = PatchedMediaKeysWebkit.apiName_;
  }

  /**
   * Prefix the api with the stored prefix.
   *
   * @param {string} api
   * @return {string}
   * @private
   */
  static prefixApi_(api) {
    const prefix = shaka.polyfill.PatchedMediaKeysWebkit.prefix_;
    if (prefix) {
      return prefix + api.charAt(0).toUpperCase() + api.slice(1);
    }
    return api;
  }

  /**
   * An implementation of navigator.requestMediaKeySystemAccess.
   * Retrieves a MediaKeySystemAccess object.
   *
   * @this {!Navigator}
   * @param {string} keySystem
   * @param {!Array<!MediaKeySystemConfiguration>} supportedConfigurations
   * @return {!Promise<!MediaKeySystemAccess>}
   */
  static requestMediaKeySystemAccess(keySystem, supportedConfigurations) {
    shaka.log.debug('PatchedMediaKeysWebkit.requestMediaKeySystemAccess');
    goog.asserts.assert(this == navigator,
        'bad "this" for requestMediaKeySystemAccess');

    // Alias.
    const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;
    try {
      const access = new PatchedMediaKeysWebkit.MediaKeySystemAccess(
          keySystem, supportedConfigurations);
      return Promise.resolve(/** @type {!MediaKeySystemAccess} */ (access));
    } catch (exception) {
      return Promise.reject(exception);
    }
  }

  /**
   * An implementation of HTMLMediaElement.prototype.setMediaKeys.
   * Attaches a MediaKeys object to the media element.
   *
   * @this {!HTMLMediaElement}
   * @param {MediaKeys} mediaKeys
   * @return {!Promise}
   */
  static setMediaKeys(mediaKeys) {
    shaka.log.debug('PatchedMediaKeysWebkit.setMediaKeys');
    goog.asserts.assert(this instanceof HTMLMediaElement,
        'bad "this" for setMediaKeys');

    // Alias.
    const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;

    const newMediaKeys =
    /** @type {shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys} */ (
        mediaKeys);
    const oldMediaKeys =
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
  }

  /**
   * For some of this polyfill's implementation, we need to query a video
   * element.  But for some embedded systems, it is memory-expensive to create
   * multiple video elements.  Therefore, we check the document to see if we can
   * borrow one to query before we fall back to creating one temporarily.
   *
   * @return {!HTMLVideoElement}
   * @private
   */
  static getVideoElement_() {
    const videos = document.getElementsByTagName('video');
    const video = videos.length ? videos[0] : document.createElement('video');
    return /** @type {!HTMLVideoElement} */(video);
  }
};


/**
 * An implementation of MediaKeySystemAccess.
 *
 * @implements {MediaKeySystemAccess}
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySystemAccess = class {
  /**
   * @param {string} keySystem
   * @param {!Array<!MediaKeySystemConfiguration>} supportedConfigurations
   */
  constructor(keySystem, supportedConfigurations) {
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
    const tmpVideo = shaka.polyfill.PatchedMediaKeysWebkit.getVideoElement_();
    for (const cfg of supportedConfigurations) {
      // Create a new config object and start adding in the pieces which we
      // find support for.  We will return this from getConfiguration() if
      // asked.
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

      // v0.1b tests for key system availability with an extra argument on
      // canPlayType.
      let ranAnyTests = false;
      if (cfg.audioCapabilities) {
        for (const cap of cfg.audioCapabilities) {
          if (cap.contentType) {
            ranAnyTests = true;
            // In Chrome <= 40, if you ask about Widevine-encrypted audio
            // support, you get a false-negative when you specify codec
            // information. Work around this by stripping codec info for audio
            // types.
            const contentType = cap.contentType.split(';')[0];
            if (tmpVideo.canPlayType(contentType, this.internalKeySystem_)) {
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
            if (tmpVideo.canPlayType(
                cap.contentType, this.internalKeySystem_)) {
              newCfg.videoCapabilities.push(cap);
              success = true;
            }
          }
        }
      }

      if (!ranAnyTests) {
        // If no specific types were requested, we check all common types to
        // find out if the key system is present at all.
        success =
            tmpVideo.canPlayType('video/mp4', this.internalKeySystem_) ||
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

    // According to the spec, this should be a DOMException, but there is not a
    // public constructor for that.  So we make this look-alike instead.
    const unsupportedError = new Error(message);
    unsupportedError.name = 'NotSupportedError';
    unsupportedError['code'] = DOMException.NOT_SUPPORTED_ERR;
    throw unsupportedError;
  }

  /** @override */
  createMediaKeys() {
    shaka.log.debug(
        'PatchedMediaKeysWebkit.MediaKeySystemAccess.createMediaKeys');

    // Alias.
    const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;
    const mediaKeys =
    new PatchedMediaKeysWebkit.MediaKeys(this.internalKeySystem_);
    return Promise.resolve(/** @type {!MediaKeys} */ (mediaKeys));
  }

  /** @override */
  getConfiguration() {
    shaka.log.debug(
        'PatchedMediaKeysWebkit.MediaKeySystemAccess.getConfiguration');
    return this.configuration_;
  }
};


/**
 * An implementation of MediaKeys.
 *
 * @implements {MediaKeys}
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeys = class {
  /**
   * @param {string} keySystem
   */
  constructor(keySystem) {
    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeys');

    /** @private {string} */
    this.keySystem_ = keySystem;

    /** @private {HTMLMediaElement} */
    this.media_ = null;

    /** @private {!shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /**
     * @private {Array<!shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession>}
     */
    this.newSessions_ = [];

    /**
     * @private {!Map<string,
     *                 !shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession>}
     */
    this.sessionMap_ = new Map();
  }

  /**
   * @param {HTMLMediaElement} media
   * @protected
   */
  setMedia(media) {
    this.media_ = media;

    // Remove any old listeners.
    this.eventManager_.removeAll();

    const prefix = shaka.polyfill.PatchedMediaKeysWebkit.prefix_;
    if (media) {
      // Intercept and translate these prefixed EME events.
      this.eventManager_.listen(media, prefix + 'needkey',
      /** @type {shaka.util.EventManager.ListenerType} */ (
            (event) => this.onWebkitNeedKey_(event)));

      this.eventManager_.listen(media, prefix + 'keymessage',
      /** @type {shaka.util.EventManager.ListenerType} */ (
            (event) => this.onWebkitKeyMessage_(event)));

      this.eventManager_.listen(media, prefix + 'keyadded',
      /** @type {shaka.util.EventManager.ListenerType} */ (
            (event) => this.onWebkitKeyAdded_(event)));

      this.eventManager_.listen(media, prefix + 'keyerror',
      /** @type {shaka.util.EventManager.ListenerType} */ (
            (event) => this.onWebkitKeyError_(event)));
    }
  }

  /** @override */
  createSession(sessionType) {
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
    const media = this.media_ || /** @type {!HTMLMediaElement} */(
      document.createElement('video'));
    if (!media.src) {
      media.src = 'about:blank';
    }

    const session = new PatchedMediaKeysWebkit.MediaKeySession(
        media, this.keySystem_, sessionType);
    this.newSessions_.push(session);
    return session;
  }

  /** @override */
  setServerCertificate(serverCertificate) {
    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeys.setServerCertificate');

    // There is no equivalent in v0.1b, so return failure.
    return Promise.resolve(false);
  }

  /** @override */
  getStatusForPolicy(policy) {
    return Promise.resolve('usable');
  }

  /**
   * @param {!MediaKeyEvent} event
   * @suppress {constantProperty} We reassign what would be const on a real
   *   MediaEncryptedEvent, but in our look-alike event.
   * @private
   */
  onWebkitNeedKey_(event) {
    shaka.log.debug('PatchedMediaKeysWebkit.onWebkitNeedKey_', event);
    goog.asserts.assert(this.media_, 'media_ not set in onWebkitNeedKey_');

    const event2 = new CustomEvent('encrypted');
    const encryptedEvent =
      /** @type {!MediaEncryptedEvent} */(/** @type {?} */(event2));
    // initDataType is not used by v0.1b EME, so any valid value is fine here.
    encryptedEvent.initDataType = 'cenc';
    encryptedEvent.initData = shaka.util.BufferUtils.toArrayBuffer(
        event.initData);

    this.media_.dispatchEvent(event2);
  }

  /**
   * @param {!MediaKeyEvent} event
   * @private
   */
  onWebkitKeyMessage_(event) {
    shaka.log.debug('PatchedMediaKeysWebkit.onWebkitKeyMessage_', event);

    const session = this.findSession_(event.sessionId);
    if (!session) {
      shaka.log.error('Session not found', event.sessionId);
      return;
    }

    const isNew = session.keyStatuses.getStatus() == undefined;

    const data = new Map()
        .set('messageType', isNew ? 'licenserequest' : 'licenserenewal')
        .set('message', event.message);
    const event2 = new shaka.util.FakeEvent('message', data);

    session.generated();
    session.dispatchEvent(event2);
  }

  /**
   * @param {!MediaKeyEvent} event
   * @private
   */
  onWebkitKeyAdded_(event) {
    shaka.log.debug('PatchedMediaKeysWebkit.onWebkitKeyAdded_', event);

    const session = this.findSession_(event.sessionId);
    goog.asserts.assert(
        session, 'unable to find session in onWebkitKeyAdded_');
    if (session) {
      session.ready();
    }
  }

  /**
   * @param {!MediaKeyEvent} event
   * @private
   */
  onWebkitKeyError_(event) {
    shaka.log.debug('PatchedMediaKeysWebkit.onWebkitKeyError_', event);

    const session = this.findSession_(event.sessionId);
    goog.asserts.assert(
        session, 'unable to find session in onWebkitKeyError_');
    if (session) {
      session.handleError(event);
    }
  }

  /**
   * @param {string} sessionId
   * @return {shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession}
   * @private
   */
  findSession_(sessionId) {
    let session = this.sessionMap_.get(sessionId);
    if (session) {
      shaka.log.debug(
          'PatchedMediaKeysWebkit.MediaKeys.findSession_', session);
      return session;
    }

    session = this.newSessions_.shift();
    if (session) {
      session.sessionId = sessionId;
      this.sessionMap_.set(sessionId, session);
      shaka.log.debug(
          'PatchedMediaKeysWebkit.MediaKeys.findSession_', session);
      return session;
    }

    return null;
  }
};


/**
 * An implementation of MediaKeySession.
 *
 * @implements {MediaKeySession}
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeySession =
class extends shaka.util.FakeEventTarget {
  /**
   * @param {!HTMLMediaElement} media
   * @param {string} keySystem
   * @param {string} sessionType
   */
  constructor(media, keySystem, sessionType) {
    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession');
    super();

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

    /** @type {function(!Event)|null} */
    this.onkeystatuseschange = null;
  }

  /**
   * Signals that the license request has been generated.  This resolves the
   * 'generateRequest' promise.
   *
   * @protected
   */
  generated() {
    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.generated');

    if (this.generatePromise_) {
      this.generatePromise_.resolve();
      this.generatePromise_ = null;
    }
  }

  /**
   * Signals that the session is 'ready', which is the terminology used in older
   * versions of EME.  The new signal is to resolve the 'update' promise.  This
   * translates between the two.
   *
   * @protected
   */
  ready() {
    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.ready');

    this.updateKeyStatus_('usable');

    if (this.updatePromise_) {
      this.updatePromise_.resolve();
    }
    this.updatePromise_ = null;
  }

  /**
   * Either rejects a promise, or dispatches an error event, as appropriate.
   *
   * @param {!MediaKeyEvent} event
   */
  handleError(event) {
    shaka.log.debug(
        'PatchedMediaKeysWebkit.MediaKeySession.handleError', event);

    // This does not match the DOMException we get in current WD EME, but it
    // will at least provide some information which can be used to look into the
    // problem.
    const error = new Error('EME v0.1b key error');
    const errorCode = event.errorCode;
    errorCode.systemCode = event.systemCode;
    error['errorCode'] = errorCode;

    // The presence or absence of sessionId indicates whether this corresponds
    // to generateRequest() or update().
    if (!event.sessionId && this.generatePromise_) {
      if (event.systemCode == 45) {
        error.message = 'Unsupported session type.';
      }
      this.generatePromise_.reject(error);
      this.generatePromise_ = null;
    } else if (event.sessionId && this.updatePromise_) {
      this.updatePromise_.reject(error);
      this.updatePromise_ = null;
    } else {
      // This mapping of key statuses is imperfect at best.
      const code = event.errorCode.code;
      const systemCode = event.systemCode;
      if (code == MediaKeyError['MEDIA_KEYERR_OUTPUT']) {
        this.updateKeyStatus_('output-restricted');
      } else if (systemCode == 1) {
        this.updateKeyStatus_('expired');
      } else {
        this.updateKeyStatus_('internal-error');
      }
    }
  }

  /**
   * Logic which is shared between generateRequest() and load(), both of which
   * are ultimately implemented with webkitGenerateKeyRequest in prefixed EME.
   *
   * @param {?BufferSource} initData
   * @param {?string} offlineSessionId
   * @return {!Promise}
   * @private
   */
  generate_(initData, offlineSessionId) {
    const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;

    if (this.initialized_) {
      const error = new Error('The session is already initialized.');
      return Promise.reject(error);
    }

    this.initialized_ = true;

    /** @type {!Uint8Array} */
    let mangledInitData;

    try {
      if (this.type_ == 'persistent-license') {
        const StringUtils = shaka.util.StringUtils;
        if (!offlineSessionId) {
          goog.asserts.assert(initData, 'expecting init data');
          // Persisting the initial license.
          // Prefix the init data with a tag to indicate persistence.
          const prefix = StringUtils.toUTF8('PERSISTENT|');
          mangledInitData = shaka.util.Uint8ArrayUtils.concat(prefix, initData);
        } else {
          // Loading a stored license.
          // Prefix the init data (which is really a session ID) with a tag to
          // indicate that we are loading a persisted session.
          mangledInitData = shaka.util.BufferUtils.toUint8(
              StringUtils.toUTF8('LOAD_SESSION|' + offlineSessionId));
        }
      } else {
        // Streaming.
        goog.asserts.assert(this.type_ == 'temporary',
            'expected temporary session');
        goog.asserts.assert(!offlineSessionId,
            'unexpected offline session ID');
        goog.asserts.assert(initData, 'expecting init data');
        mangledInitData = shaka.util.BufferUtils.toUint8(initData);
      }

      goog.asserts.assert(mangledInitData, 'init data not set!');
    } catch (exception) {
      return Promise.reject(exception);
    }

    goog.asserts.assert(this.generatePromise_ == null,
        'generatePromise_ should be null');
    this.generatePromise_ = new shaka.util.PublicPromise();

    // Because we are hacking media.src in createSession to better emulate
    // unprefixed EME's ability to create sessions and license requests without
    // a video tag, we can get ourselves into trouble.  It seems that sometimes,
    // the setting of media.src hasn't been processed by some other thread, and
    // GKR can throw an exception.  If this occurs, wait 10 ms and try again at
    // most once.  This situation should only occur when init data is available
    // ahead of the 'needkey' event.

    const generateKeyRequestName =
        PatchedMediaKeysWebkit.prefixApi_('generateKeyRequest');
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
  }

  /**
   * An internal version of update which defers new calls while old ones are in
   * progress.
   *
   * @param {!shaka.util.PublicPromise} promise  The promise associated with
   *   this call.
   * @param {BufferSource} response
   * @private
   */
  update_(promise, response) {
    const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;

    if (this.updatePromise_) {
      // We already have an update in-progress, so defer this one until after
      // the old one is resolved.  Execute this whether the original one
      // succeeds or fails.
      this.updatePromise_.then(() => this.update_(promise, response))
          .catch(() => this.update_(promise, response));
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
      const licenseString = StringUtils.fromUTF8(response);
      const jwkSet = /** @type {JWKSet} */ (JSON.parse(licenseString));
      const kty = jwkSet.keys[0].kty;
      if (kty != 'oct') {
        // Reject the promise.
        this.updatePromise_.reject(new Error(
            'Response is not a valid JSON Web Key Set.'));
        this.updatePromise_ = null;
      }
      key = Uint8ArrayUtils.fromBase64(jwkSet.keys[0].k);
      keyId = Uint8ArrayUtils.fromBase64(jwkSet.keys[0].kid);
    } else {
      // The key ID is not required.
      key = shaka.util.BufferUtils.toUint8(response);
      keyId = null;
    }

    const addKeyName = PatchedMediaKeysWebkit.prefixApi_('addKey');
    try {
      this.media_[addKeyName](this.keySystem_, key, keyId, this.sessionId);
    } catch (exception) {
      // Reject the promise.
      this.updatePromise_.reject(exception);
      this.updatePromise_ = null;
    }
  }

  /**
   * Update key status and dispatch a 'keystatuseschange' event.
   *
   * @param {string} status
   * @private
   */
  updateKeyStatus_(status) {
    this.keyStatuses.setStatus(status);
    const event = new shaka.util.FakeEvent('keystatuseschange');
    this.dispatchEvent(event);

    if (this.onkeystatuseschange) {
      this.onkeystatuseschange(event);
    }
  }

  /** @override */
  generateRequest(initDataType, initData) {
    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.generateRequest');
    return this.generate_(initData, null);
  }

  /** @override */
  load(sessionId) {
    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.load');
    if (this.type_ == 'persistent-license') {
      return this.generate_(null, sessionId);
    } else {
      return Promise.reject(new Error('Not a persistent session.'));
    }
  }

  /** @override */
  update(response) {
    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.update', response);
    goog.asserts.assert(this.sessionId, 'update without session ID');

    const nextUpdatePromise = new shaka.util.PublicPromise();
    this.update_(nextUpdatePromise, response);
    return nextUpdatePromise;
  }

  /** @override */
  close() {
    const PatchedMediaKeysWebkit = shaka.polyfill.PatchedMediaKeysWebkit;

    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.close');

    // This will remove a persistent session, but it's also the only way to free
    // CDM resources on v0.1b.
    if (this.type_ != 'persistent-license') {
      // sessionId may reasonably be null if no key request has been generated
      // yet.  Unprefixed EME will return a rejected promise in this case.  We
      // will use the same error message that Chrome 41 uses in its EME
      // implementation.
      if (!this.sessionId) {
        this.closed.reject(new Error('The session is not callable.'));
        return this.closed;
      }

      // This may throw an exception, but we ignore it because we are only using
      // it to clean up resources in v0.1b.  We still consider the session
      // closed. We can't let the exception propagate because
      // MediaKeySession.close() should not throw.
      const cancelKeyRequestName =
          PatchedMediaKeysWebkit.prefixApi_('cancelKeyRequest');
      try {
        this.media_[cancelKeyRequestName](this.keySystem_, this.sessionId);
      } catch (exception) {
        shaka.log.debug(`${cancelKeyRequestName} exception`, exception);
      }
    }

    // Resolve the 'closed' promise and return it.
    this.closed.resolve();
    return this.closed;
  }

  /** @override */
  remove() {
    shaka.log.debug('PatchedMediaKeysWebkit.MediaKeySession.remove');

    if (this.type_ != 'persistent-license') {
      return Promise.reject(new Error('Not a persistent session.'));
    }

    return this.close();
  }
};


/**
 * An implementation of MediaKeyStatusMap.
 * This fakes a map with a single key ID.
 *
 * @todo Consolidate the MediaKeyStatusMap types in these polyfills.
 * @implements {MediaKeyStatusMap}
 */
shaka.polyfill.PatchedMediaKeysWebkit.MediaKeyStatusMap = class {
  constructor() {
    /**
     * @type {number}
     */
    this.size = 0;

    /**
     * @private {string|undefined}
     */
    this.status_ = undefined;
  }

  /**
   * An internal method used by the session to set key status.
   * @param {string|undefined} status
   */
  setStatus(status) {
    this.size = status == undefined ? 0 : 1;
    this.status_ = status;
  }

  /**
   * An internal method used by the session to get key status.
   * @return {string|undefined}
   */
  getStatus() {
    return this.status_;
  }

  /** @override */
  forEach(fn) {
    if (this.status_) {
      fn(this.status_, shaka.drm.DrmUtils.DUMMY_KEY_ID.value());
    }
  }

  /** @override */
  get(keyId) {
    if (this.has(keyId)) {
      return this.status_;
    }
    return undefined;
  }

  /** @override */
  has(keyId) {
    const fakeKeyId = shaka.drm.DrmUtils.DUMMY_KEY_ID.value();
    if (this.status_ && shaka.util.BufferUtils.equal(keyId, fakeKeyId)) {
      return true;
    }
    return false;
  }

  /**
   * @suppress {missingReturn}
   * @override
   */
  entries() {
    goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
  }

  /**
   * @suppress {missingReturn}
   * @override
   */
  keys() {
    goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
  }

  /**
   * @suppress {missingReturn}
   * @override
   */
  values() {
    goog.asserts.assert(false, 'Not used!  Provided only for compiler.');
  }
};


/**
 * Store api prefix.
 *
 * @private {string}
 */
shaka.polyfill.PatchedMediaKeysWebkit.prefix_ = '';


/**
 * API name.
 *
 * @private {string}
 */
shaka.polyfill.PatchedMediaKeysWebkit.apiName_ = 'webkit';


shaka.polyfill.register(shaka.polyfill.PatchedMediaKeysWebkit.install);
