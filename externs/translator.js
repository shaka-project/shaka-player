/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for Translator and Language Detector APIs.
 *
 * @externs
 */

/**
 * @constructor
 */
function Translator() {}

/**
  @type {number}
 */
Translator.prototype.inputQuota;

/**
  @type {string}
 */
Translator.prototype.sourceLanguage;

/**
  @type {string}
 */
Translator.prototype.targetLanguage;

/**
  @return {void}
 */
Translator.prototype.destroy = function() {};

/**
 * @param {string} text
 * @return {!Promise<number>}
 */
Translator.prototype.measureInputUsage = function(text) {};

/**
 * @param {string} text
 * @return {!Promise<string>}
 */
Translator.prototype.translate = function(text) {};

/**
 * @param {string} text
 * @return {!ReadableStream<string>}
 */
Translator.prototype.translateStreaming = function(text) {};

/**
 * @param {(Object|null)=} options
 * @return {!Promise<string>}
 */
Translator.availability = function(options) {};

/**
 * @param {(Object|null)=} options
 * @return {!Promise<!Translator>}
 */
Translator.create = function(options) {};

/**
 * @constructor
 */
function LanguageDetector() {}

/**
  @type {number}
 */
LanguageDetector.prototype.inputQuota;

/**
  @return {void}
 */
LanguageDetector.prototype.destroy = function() {};

/**
 * @param {string} text
 * @return {!Promise<number>}
 */
LanguageDetector.prototype.measureInputUsage = function(text) {};

/**
 * @param {string} text
 * @return {!Promise<Array<{detectedLanguage: string, confidence: number}>>}
 */
LanguageDetector.prototype.detect = function(text) {};

/**
 * @param {(Object|null)=} options
 * @return {!Promise<string>}
 */
LanguageDetector.availability = function(options) {};

/**
 * @param {(Object|null)=} options
 * @return {!Promise<!LanguageDetector>}
 */
LanguageDetector.create = function(options) {};

/**
 * @constructor
 */
function CreateMonitor() {}

/**
 * @constructor
 */
function DownloadProgressEvent() {}

/**
  @type {number}
 */
DownloadProgressEvent.prototype.loaded;
