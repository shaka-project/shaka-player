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
 * @constructor
 */
function DocumentPictureInPicture() {}


/**
 * @return {!Promise}
 */
DocumentPictureInPicture.prototype.requestWindow = function(options) {};


/** @type {Window} */
DocumentPictureInPicture.prototype.window;


/**
 * @param {string} type
 * @param {Function} listener
 */
DocumentPictureInPicture.prototype.addEventListener =
    function(type, listener) {};


/**
 * @see https://wicg.github.io/document-picture-in-picture/#api
 * @type {!DocumentPictureInPicture}
 */
Window.prototype.documentPictureInPicture;
