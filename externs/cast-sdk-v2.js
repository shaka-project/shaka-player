/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Google Cast API externs.
 * Based on the {@link https://bit.ly/CastApi Google Cast API}.
 * @externs
 */


/** @type {function(boolean)} */
var __onGCastApiAvailable;


/** @const */
cast.receiver = {};


/** @const */
cast.receiver.system = {};


cast.receiver.system.SystemVolumeData = class {
  constructor() {
    /** @type {number} */
    this.level;

    /** @type {boolean} */
    this.muted;
  }
};


cast.receiver.CastMessageBus = class {
  /** @param {*} message */
  broadcast(message) {}

  /**
   * @param {string} senderId
   * @return {!cast.receiver.CastChannel}
   */
  getCastChannel(senderId) {}
};


/** @type {Function} */
cast.receiver.CastMessageBus.prototype.onMessage;


/**
 * @constructor
 * @struct
 */
cast.receiver.CastMessageBus.Event = class {};


/** @type {?} */
cast.receiver.CastMessageBus.Event.prototype.data;


/** @type {string} */
cast.receiver.CastMessageBus.Event.prototype.senderId;


cast.receiver.CastChannel = class {
  /** @param {*} message */
  send(message) {}
};


cast.receiver.CastReceiverManager = class {
  constructor() {
    /** @type {Function} */
    this.onSenderConnected;

    /** @type {Function} */
    this.onSenderDisconnected;

    /** @type {Function} */
    this.onSystemVolumeChanged;
  }

  /** @return {cast.receiver.CastReceiverManager} */
  static getInstance() {}

  /**
   * @param {string} namespace
   * @param {string=} messageType
   * @return {cast.receiver.CastMessageBus}
   */
  getCastMessageBus(namespace, messageType) {}

  /** @return {Array<string>} */
  getSenders() {}

  start() {}

  stop() {}

  /** @return {?cast.receiver.system.SystemVolumeData} */
  getSystemVolume() {}

  /** @param {number} level */
  setSystemVolumeLevel(level) {}

  /** @param {number} muted */
  setSystemVolumeMuted(muted) {}

  /** @return {boolean} */
  isSystemReady() {}
};


/** @const */
cast.receiver.media = {};


/** @enum {number} */
cast.receiver.media.MetadataType = {
  'GENERIC': 0,
  'MOVIE': 1,
  'TV_SHOW': 2,
  'MUSIC_TRACK': 3,
  'PHOTO': 4,
};


/** @const */
cast.__platform__ = class {
  /**
   * @param {string} type
   * @return {boolean}
   */
  static canDisplayType(type) {}
};


/** @const */
var chrome = {};


/** @const */
chrome.cast = class {
  /**
   * @param {chrome.cast.ApiConfig} apiConfig
   * @param {Function} successCallback
   * @param {Function} errorCallback
   */
  static initialize(apiConfig, successCallback, errorCallback) {}

  /**
   * @param {Function} successCallback
   * @param {Function} errorCallback
   * @param {chrome.cast.SessionRequest=} sessionRequest
   */
  static requestSession(successCallback, errorCallback, sessionRequest) {}
};


/** @type {boolean} */
chrome.cast.isAvailable;


/** @const */
chrome.cast.SessionStatus = {};


/** @type {string} */
chrome.cast.SessionStatus.STOPPED;


chrome.cast.ApiConfig = class {
  /**
   * @param {chrome.cast.SessionRequest} sessionRequest
   * @param {Function} sessionListener
   * @param {Function} receiverListener
   * @param {string=} autoJoinPolicy
   * @param {string=} defaultActionPolicy
   */
  constructor(sessionRequest, sessionListener, receiverListener,
      autoJoinPolicy, defaultActionPolicy) {}
};


chrome.cast.Error = class {
  /**
   * @param {string} code
   * @param {string=} description
   * @param {Object=} details
   */
  constructor(code, description, details) {
    /** @type {string} */
    this.code;

    /** @type {?string} */
    this.description;

    /** @type {Object} */
    this.details;
  }
};


chrome.cast.Receiver = class {
  constructor() {}
};


/** @const {string} */
chrome.cast.Receiver.prototype.friendlyName;


chrome.cast.Session = class {
  constructor() {
    /** @type {string} */
    this.sessionId;

    /** @type {string} */
    this.status;

    /** @type {chrome.cast.Receiver} */
    this.receiver;
  }

  /**
   * @param {string} namespace
   * @param {Function} listener
   */
  addMessageListener(namespace, listener) {}

  /**
   * @param {string} namespace
   * @param {Function} listener
   */
  removeMessageListener(namespace, listener) {}

  /** @param {Function} listener */
  addUpdateListener(listener) {}

  /** @param {Function} listener */
  removeUpdateListener(listener) {}

  /**
   * @param {Function} successCallback
   * @param {Function} errorCallback
   */
  leave(successCallback, errorCallback) {}

  /**
   * @param {string} namespace
   * @param {!Object|string} message
   * @param {Function} successCallback
   * @param {Function} errorCallback
   */
  sendMessage(namespace, message, successCallback, errorCallback) {}

  /**
   * @param {Function} successCallback
   * @param {Function} errorCallback
   */
  stop(successCallback, errorCallback) {}
};


chrome.cast.SessionRequest = class {
  /**
   * @param {string} appId
   * @param {Array<Object>} capabilities
   * @param {?number} timeout
   * @param {boolean} androidReceiverCompatible
   * @param {Object} credentialsData
   */
  constructor(appId, capabilities, timeout, androidReceiverCompatible,
      credentialsData) {}
};
