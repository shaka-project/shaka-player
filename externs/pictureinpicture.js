/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for picture-in-picture methods.
 * @externs
 */

/**
 * @return {!Promise}
 */
HTMLDocument.prototype.exitPictureInPicture = function() {};


/** @type {Element} */
HTMLDocument.prototype.pictureInPictureElement;


/** @type {boolean} */
HTMLDocument.prototype.pictureInPictureEnabled;


/**
 * @return {!Promise}
 */
HTMLMediaElement.prototype.requestPictureInPicture = function() {};


/** @type {boolean} */
HTMLMediaElement.prototype.disablePictureInPicture;


/**
 * @param {string} mode
 * @return {boolean}
 */
HTMLMediaElement.prototype.webkitSetPresentationMode = function(mode) {};


/**
 * @param {string} mode
 * @return {boolean}
 */
HTMLMediaElement.prototype.webkitSupportsPresentationMode = function(mode) {};


/** @type {string} */
HTMLMediaElement.prototype.webkitPresentationMode;


/**
 * @typedef {{
 *   width: (number|undefined),
 *   height: (number|undefined),
 * }}
 */
var DocumentPictureInPictureOptions;


/**
 * @constructor
 * @implements {EventTarget}
 */
function DocumentPictureInPicture() {}


/**
 * @param {DocumentPictureInPictureOptions} options
 * @return {!Promise.<Window>}
 */
DocumentPictureInPicture.prototype.requestWindow = function(options) {};


/** @type {Window} */
DocumentPictureInPicture.prototype.window;


/** @override */
DocumentPictureInPicture.prototype.addEventListener =
    function(type, listener, options) {};


/** @override */
DocumentPictureInPicture.prototype.removeEventListener =
    function(type, listener, options) {};


/** @override */
DocumentPictureInPicture.prototype.dispatchEvent = function(event) {};


/**
 * @see https://wicg.github.io/document-picture-in-picture/#api
 * @type {!DocumentPictureInPicture}
 */
Window.prototype.documentPictureInPicture;


/**
 * @constructor
 * @extends {Event}
 */
function DocumentPictureInPictureEvent() {}


/** @type {Window} */
DocumentPictureInPictureEvent.prototype.window;
