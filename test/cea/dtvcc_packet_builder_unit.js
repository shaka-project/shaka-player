/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DtvccPacketBuilder', () => {
  /** @type {!shaka.cea.DtvccPacketBuilder} */
  let dtvccPacketBuilder;

  /** @type {!number} */
  const DTVCC_PACKET_START = shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_START;

  /** @type {!number} */
  const DTVCC_PACKET_DATA = shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_DATA;

  beforeEach(() => {
    dtvccPacketBuilder = new shaka.cea.DtvccPacketBuilder();
  });

  it('parses and returns a full packet correctly', () => {
    // Last 6 bits of the first byte in a DTVCC_PACKET_START is
    // packetSize. The number of data bytes that follow should be
    // packetSize * 2 -1, as per the spec.
    const dtvccStartByte = 0b00000001;

    // Add the byte for DTVCC_PACKET_START.
    dtvccPacketBuilder.addByte({
      pts: 0,
      type: DTVCC_PACKET_START,
      byte: dtvccStartByte,
      order: 0,
    });

    const cea708PacketDataBytes = [
      {
        pts: 0,
        type: DTVCC_PACKET_DATA,
        byte: 0,
        order: 0,
      },
    ];

    for (const byte of cea708PacketDataBytes) {
      dtvccPacketBuilder.addByte(byte);
    }

    const expectedPackets = [new shaka.cea.DtvccPacket(cea708PacketDataBytes)];
    const parsedPackets = dtvccPacketBuilder.getParsedPackets();
    expect(parsedPackets).toEqual(expectedPackets);
  });

  it('does not return a half-processed packet', () => {
    const dtvccStartByte = 0b00000010; // 2 * 2 -1 = 3 data bytes should follow.

    // Add the byte for DTVCC_PACKET_START.
    dtvccPacketBuilder.addByte({
      pts: 0,
      type: DTVCC_PACKET_START,
      byte: dtvccStartByte,
      order: 0,
    });

    // Add a DTVCC_PACKET_DATA byte.
    dtvccPacketBuilder.addByte({
      pts: 0,
      type: DTVCC_PACKET_START,
      byte: dtvccStartByte,
      order: 0,
    });

    // Add another DTVCC_PACKET_START byte before all the data bytes
    // were received for the first packet.
    dtvccPacketBuilder.addByte({
      pts: 0,
      type: DTVCC_PACKET_START,
      byte: dtvccStartByte,
      order: 0,
    });

    // Expect no packets to be returned, since no packets completed processing.
    const parsedPackets = dtvccPacketBuilder.getParsedPackets();
    expect(parsedPackets).toEqual([]);
  });

  it('clears the packet builder', () => {
    const dtvccStartByte = 0b00000001; // 1 * 2 -1 = 1 data bytes should follow.

    // Add the byte for DTVCC_PACKET_START.
    dtvccPacketBuilder.addByte({
      pts: 0,
      type: DTVCC_PACKET_START,
      byte: dtvccStartByte,
      order: 0,
    });

    // Clear the packet builder.
    dtvccPacketBuilder.clear();

    // Add a DTVCC_PACKET_DATA byte.
    dtvccPacketBuilder.addByte({
      pts: 0,
      type: DTVCC_PACKET_START,
      byte: dtvccStartByte,
      order: 0,
    });

    // Even though the right number of data bytes were given according to the
    // start packet, the packet builder was cleared in between. So no packets
    // should have been returned.
    const parsedPackets = dtvccPacketBuilder.getParsedPackets();
    expect(parsedPackets).toEqual([]);
  });

  it('ignores DTVCC_PACKET_DATA sent without a DTVCC_PACKET_START', () => {
    // These next two bytes are DTVCC_PACKET_DATA, but no DTVCC_PACKET_START
    // was sent yet. So these bytes should have been ignored by the builder.
    dtvccPacketBuilder.addByte({
      pts: 0,
      type: DTVCC_PACKET_DATA,
      byte: 0,
      order: 0,
    });
    dtvccPacketBuilder.addByte({
      pts: 0,
      type: DTVCC_PACKET_DATA,
      byte: 0,
      order: 0,
    });

    const dtvccStartByte = 0b00000001; // 1 * 2 -1 = 1 data bytes should follow.

    // Add the byte for DTVCC_PACKET_START.
    dtvccPacketBuilder.addByte({
      pts: 0,
      type: DTVCC_PACKET_START,
      byte: dtvccStartByte,
      order: 0,
    });

    const cea708PacketDataBytes = [
      {
        pts: 0,
        type: DTVCC_PACKET_DATA,
        byte: 0,
        order: 0,
      },
    ];

    for (const byte of cea708PacketDataBytes) {
      dtvccPacketBuilder.addByte(byte);
    }

    const expectedPackets = [new shaka.cea.DtvccPacket(cea708PacketDataBytes)];
    const parsedPackets = dtvccPacketBuilder.getParsedPackets();
    expect(parsedPackets).toEqual(expectedPackets);
  });
});
