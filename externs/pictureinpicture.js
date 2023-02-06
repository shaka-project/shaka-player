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
 * @see https://wicg.github.io/document-picture-in-picture/#api
 * @constructor
 */
function documentPictureInPicture() {}


/**
 * @return {!Promise}
 */
documentPictureInPicture.prototype.requestWindow = function(options) {};


/** @type {Window} */
documentPictureInPicture.prototype.window;


/** @type {?function(!Event)} */
documentPictureInPicture.prototype.onenter;
