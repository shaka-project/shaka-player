/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.TsCeaParser');

goog.require('shaka.cea.CeaUtils');
goog.require('shaka.cea.SeiProcessor');
goog.require('shaka.media.ClosedCaptionParser');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.TsParser');

/**
 * MPEG TS CEA parser.
 * @implements {shaka.extern.ICeaParser}
 * @export
 */
shaka.cea.TsCeaParser = class {
  constructor() {
    /**
     * SEI data processor.
     * @private
     * @const {!shaka.cea.SeiProcessor}
     */
    this.seiProcessor_ = new shaka.cea.SeiProcessor();

    /** @private {?shaka.util.TsParser} */
    this.tsParser_ = null;
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
    const CeaUtils = shaka.cea.CeaUtils;

    if (!this.tsParser_) {
      this.tsParser_ = new shaka.util.TsParser();
    } else {
      this.tsParser_.clearData();
    }

    /** @type {!Array<!shaka.extern.ICeaParser.CaptionPacket>} **/
    const captionPackets = [];

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(mediaSegment);
    if (!shaka.util.TsParser.probe(uint8ArrayData)) {
      return captionPackets;
    }
    const tsParser = this.tsParser_.parse(uint8ArrayData);
    const codecs = tsParser.getCodecs();
    const videoNalus = tsParser.getVideoNalus();
    const validNaluTypes = [];
    switch (codecs.video) {
      case 'avc':
        validNaluTypes.push(CeaUtils.H264_NALU_TYPE_SEI);
        break;
      case 'hvc':
        validNaluTypes.push(CeaUtils.H265_PREFIX_NALU_TYPE_SEI);
        validNaluTypes.push(CeaUtils.H265_SUFFIX_NALU_TYPE_SEI);
        break;
    }
    if (!validNaluTypes.length) {
      return captionPackets;
    }
    for (const nalu of videoNalus) {
      if (validNaluTypes.includes(nalu.type) && nalu.time != null) {
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

shaka.media.ClosedCaptionParser.registerParser('video/mp2t',
    () => new shaka.cea.TsCeaParser());
