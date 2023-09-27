/**
 * @typedef {{
 *   data: Uint8Array,
 *   packetLength: number,
 *   pts: ?number,
 *   dts: ?number
 * }}
 *
 * @summary MPEG_PES.
 * @property {Uint8Array} data
 * @property {number} packetLength
 * @property {?number} pts
 * @property {?number} dts
 */
shaka.extern.MPEG_PES;


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
