/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */


/**
 * @typedef {{
 *   manifestUri: string,
 *   startTime: ?(number|Date),
 *   mimeType: ?string,
 *   config: ?shaka.extern.PlayerConfiguration
 * }}
 *
 * @property {string} manifestUri
 * @property {?(number|Date)} startTime
 * @property {?string} mimeType
 * @property {?shaka.extern.PlayerConfiguration} config
 * @exportDoc
 */
shaka.extern.QueueItem;
