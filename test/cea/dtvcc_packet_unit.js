/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.cea.DtvccPacket');
goog.require('shaka.cea.DtvccPacketBuilder');
goog.require('shaka.test.Util');
goog.require('shaka.util.Error');

describe('DtvccPacket', () => {
  /** @type {!shaka.cea.DtvccPacket} */
  let dtvccPacket;

  it('reads all data from a packet', () => {
    const dataBytes = [{
      pts: 0,
      type: shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_DATA,
      value: 0,
      order: 0,
    },
    {
      pts: 0,
      type: shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_DATA,
      value: 0x1,
      order: 0,
    }];

    dtvccPacket = new shaka.cea.DtvccPacket(dataBytes);
    let i = 0;
    while (dtvccPacket.hasMoreData()) {
      const data = dtvccPacket.readByte();
      expect(data).toBe(dataBytes[i]);
      i++;
    }
    expect(dtvccPacket.getPosition()).toBe(2);
  });

  it('should skip data from a packet correctly', () => {
    const dataBytes = [{
      pts: 0,
      type: shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_DATA,
      value: 0,
      order: 0,
    }];
    dtvccPacket = new shaka.cea.DtvccPacket(dataBytes);
    dtvccPacket.skip(1);
    expect(dtvccPacket.getPosition()).toBe(1);
  });

  describe('should throw a buffer read out of bounds error', () => {
    const error = shaka.test.Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS));
    it('on unbuffered skips', () => {
      expect(() => dtvccPacket.skip(1)).toThrow(error);
    });

    it('on unbuffered reads', () => {
      expect(() => dtvccPacket.readByte()).toThrow(error);
    });
  });
});

