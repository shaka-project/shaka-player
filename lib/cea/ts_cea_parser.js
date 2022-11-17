/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.TsCeaParser');

goog.require('shaka.cea.ICeaParser');
goog.require('shaka.cea.SeiProcessor');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.TsParser');

/**
 * MPEG TS CEA parser.
 * @implements {shaka.cea.ICeaParser}
 */
shaka.cea.TsCeaParser = class {
  /** */
  constructor() {
    /**
     * SEI data processor.
     * @private
     * @const {!shaka.cea.SeiProcessor}
     */
    this.seiProcessor_ = new shaka.cea.SeiProcessor();
  }

  /**
   * @override
   */
  init(initSegment) {
    // TS hasn't init segment
  }

  /**
   * @override
   */
  parse(mediaSegment) {
    const ICeaParser = shaka.cea.ICeaParser;

    /** @type {!Array<!shaka.cea.ICeaParser.CaptionPacket>} **/
    const captionPackets = [];

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(mediaSegment);
    if (!shaka.util.TsParser.probe(uint8ArrayData)) {
      return captionPackets;
    }
    const tsParser = new shaka.util.TsParser().parse(uint8ArrayData);
    const videoNalus = tsParser.getVideoNalus();
    for (const nalu of videoNalus) {
      if (nalu.type == ICeaParser.H264_NALU_TYPE_SEI &&
          nalu.time != null) {
        for (const packet of this.seiProcessor_.process(nalu.data)) {
          captionPackets.push({
            packet: packet,
            pts: nalu.time,
          });
        }
      }
    }
    return captionPackets;
  }
};
