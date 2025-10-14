/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for HLS Spec.
 * @see https://developer.apple.com/documentation/http-live-streaming/providing-javascript-object-notation-json-chapters
 * @externs
 */


/** @const */
var HlsSpec = {};

/**
 * @typedef {{
 *   chapter: (number|undefined),
 *   "start-time": number,
 *   duration: (number|undefined),
 *   titles: (!Array<!HlsSpec.Title>|undefined),
 *   images: (!Array<!HlsSpec.Image>|undefined),
 *   metadata: (!Array<!HlsSpec.Metadata>|undefined),
 * }}
 */
HlsSpec.Chapter;

/**
 * @typedef {{
 *   language: string,
 *   title: string,
 * }}
 */
HlsSpec.Title;

/**
 * @typedef {{
 *   "image-category": string,
 *   "pixel-width": number,
 *   "pixel-height": number,
 *   url: string
 * }}
 */
HlsSpec.Image;

/**
 * @typedef {{
 *   key: string,
 *   value: (string|number|boolean|!Array<*>|Object),
 *   language: (string|undefined)
 * }}
 */
HlsSpec.Metadata;

/**
 * @typedef {!Array<!HlsSpec.Chapter>}
 */
HlsSpec.ChapterList;
