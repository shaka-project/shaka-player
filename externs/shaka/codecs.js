/*! @license
 * Shaka Player
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @externs
 */

/**
 * @typedef {{
 *   data: !Uint8Array,
 *   packetLength: number,
 *   pts: ?number,
 *   dts: ?number,
 *   nalus: !Array<!shaka.extern.VideoNalu>
 * }}
 *
 * @summary MPEG_PES.
 * @property {!Uint8Array} data
 * @property {number} packetLength
 * @property {?number} pts
 * @property {?number} dts
 * @property {!Array<!shaka.extern.VideoNalu>} nalus
 */
shaka.extern.MPEG_PES;


/**
 * @typedef {{
 *   data: !Uint8Array,
 *   frame: boolean,
 *   isKeyframe: boolean,
 *   pts: ?number,
 *   dts: ?number,
 *   nalus: !Array<!shaka.extern.VideoNalu>
 * }}
 *
 * @summary VideoSample.
 * @property {!Uint8Array} data
 * @property {boolean} frame
 * @property {boolean} isKeyframe
 * @property {?number} pts
 * @property {?number} dts
 * @property {!Array<!shaka.extern.VideoNalu>} nalus
 */
shaka.extern.VideoSample;


/**
 * @typedef {{
 *   data: !Uint8Array,
 *   fullData: !Uint8Array,
 *   type: number,
 *   time: ?number
 * }}
 *
 * @summary VideoNalu.
 * @property {!Uint8Array} data
 * @property {!Uint8Array} fullData
 * @property {number} type
 * @property {?number} time
 */
shaka.extern.VideoNalu;


/**
 * @typedef {{
 *   projection: ?string,
 *   hfov: ?number
 * }}
 *
 * @summary VideoNalu.
 * @property {?string} projection
 * @property {?number} hfov
 */
shaka.extern.SpatialVideoInfo;
