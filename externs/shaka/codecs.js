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
 *   hfov: ?number,
 *   stereoLayout: ?string
 * }}
 *
 * @summary Spatial video info.
 * @property {?string} projection
 *   The projection of the video, as signaled in the content, such as
 *   <code>'rect'</code>, <code>'equi'</code>, <code>'hequ'</code>,
 *   <code>'fish'</code>, <code>'prim'</code> or <code>'aiv'</code>.
 * @property {?number} hfov
 *   The horizontal field of view of the video, in degrees.
 * @property {?string} stereoLayout
 *   How the views of each eye are stored, as signaled in the content:
 *   <ul>
 *     <li><code>'mono'</code>: a single view.</li>
 *     <li><code>'top-bottom'</code>: both views in each frame, the left eye
 *       on top.</li>
 *     <li><code>'left-right'</code>: both views in each frame, the left eye
 *       on the left.</li>
 *     <li><code>'multiview'</code>: each eye is a separate view of the
 *       bitstream, as in MV-HEVC (Apple Immersive Video and spatial video).
 *       The browser decodes and displays a single view.</li>
 *   </ul>
 */
shaka.extern.SpatialVideoInfo;
