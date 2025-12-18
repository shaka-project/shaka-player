/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for new SpeechRecognition APIs in Chrome.
 * @see https://webaudio.github.io/web-speech-api/#dom-speechrecognition-start
 * @externs
 */


/**
 * @type {boolean}
 */
SpeechRecognition.prototype.processLocally;

/**
 * Not a real class, but Chrome is incubating a new parameter on start(), and
 * the only way we found to override the method from the existing Closure
 * externs is to define a subclass and use override.
 * @override
 * @param {MediaStreamTrack=} mediaStreamTrack
 */
var ChromeSpeechRecognition = class extends SpeechRecognition {};

/**
 * @override
 * @param {MediaStreamTrack=} mediaStreamTrack
 */
ChromeSpeechRecognition.prototype.start = function(mediaStreamTrack) {};


/**
 * @fileoverview Externs for Web Speech API (SpeechRecognition).
 * @externs
 */


/**
 * @fileoverview Externs for Web Speech API (SpeechRecognition).
 * @externs
 */

/**
 * @typedef {{
 *   langs: !Array<string>,
 *   processLocally: boolean,
 * }}
 */
var SpeechRecognitionOptions;

/**
 * @param {!SpeechRecognitionOptions} options
 * @return {!Promise<string>}
 */
ChromeSpeechRecognition.available = function(options) {};

/**
 * @param {!SpeechRecognitionOptions} options
 * @return {!Promise<boolean>}
 */
ChromeSpeechRecognition.install = function(options) {};


