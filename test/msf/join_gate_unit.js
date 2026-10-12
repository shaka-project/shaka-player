/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.JoinGate', isMSFSupported, () => {
  /** @type {!shaka.msf.JoinGate} */
  let gate;
  /** @type {!Array<string>} */
  let received;

  beforeEach(() => {
    received = [];
    gate = new shaka.msf.JoinGate(
        (obj) => received.push(`${obj.location.group}:${obj.location.object}`),
        'test');
  });

  afterEach(() => {
    gate.release();
  });

  /**
   * @param {number} group
   * @param {number} object
   * @return {shaka.msf.Utils.MOQObject}
   */
  function objectAt(group, object) {
    return {
      trackAlias: BigInt(0),
      location: {group: BigInt(group), object: BigInt(object)},
      data: new Uint8Array([]),
      extensions: null,
      status: null,
      payloadReadStartMs: 0,
      receiveTimestampMs: 0,
    };
  }

  /**
   * @param {number} group
   * @param {number} object
   * @return {shaka.msf.Utils.Location}
   */
  function locationOf(group, object) {
    return {group: BigInt(group), object: BigInt(object)};
  }

  it('puts the subscription after the fill that it raced', () => {
    gate.expect(locationOf(5, 2), /* timeoutSeconds= */ 10);

    gate.fromSubscription(objectAt(5, 4));
    gate.fromSubscription(objectAt(5, 3));
    gate.fromFill(objectAt(5, 0));
    gate.fromFill(objectAt(5, 1));
    expect(received).toEqual(['5:0', '5:1']);

    gate.fromFill(objectAt(5, 2));
    expect(received).toEqual(['5:0', '5:1', '5:2', '5:3', '5:4']);

    gate.fromSubscription(objectAt(6, 0));
    expect(received).toEqual(['5:0', '5:1', '5:2', '5:3', '5:4', '6:0']);
  });

  it('drops what the subscription repeats of the fill', () => {
    gate.expect(locationOf(5, 1), /* timeoutSeconds= */ 10);

    gate.fromSubscription(objectAt(5, 1));
    gate.fromFill(objectAt(5, 0));
    gate.fromFill(objectAt(5, 1));
    gate.fromSubscription(objectAt(5, 1));
    gate.fromSubscription(objectAt(5, 2));

    expect(received).toEqual(['5:0', '5:1', '5:2']);
  });

  it('has nothing to wait for on a track with nothing published', () => {
    gate.fromSubscription(objectAt(0, 0));
    gate.expect(null, /* timeoutSeconds= */ 10);

    expect(received).toEqual(['0:0']);
  });

  it('opens when the fill ends short of the Largest Object', () => {
    gate.expect(locationOf(5, 9), /* timeoutSeconds= */ 10);
    gate.fromSubscription(objectAt(5, 10));
    gate.fromFill(objectAt(5, 0));

    gate.open();

    expect(received).toEqual(['5:0', '5:10']);
  });

  it('opens when the fill reached the Largest Object before the answer',
      () => {
        // A fill fetch stream can beat the SUBSCRIBE_OK.
        gate.fromFill(objectAt(5, 0));
        gate.fromSubscription(objectAt(5, 1));

        gate.expect(locationOf(5, 0), /* timeoutSeconds= */ 10);

        expect(received).toEqual(['5:0', '5:1']);
      });

  it('drops fill Objects that arrive after it opened', () => {
    gate.fromSubscription(objectAt(5, 3));
    gate.open();
    gate.fromFill(objectAt(5, 0));

    expect(received).toEqual(['5:3']);
  });

  it('stops waiting for a fill that never comes', async () => {
    gate.expect(locationOf(5, 2), /* timeoutSeconds= */ 0.05);
    gate.fromSubscription(objectAt(5, 3));
    expect(received).toEqual([]);

    await shaka.test.Util.delay(0.2);

    expect(received).toEqual(['5:3']);
  });

  it('waits for the fill stream when the answer could not say', () => {
    gate.expect(undefined, /* timeoutSeconds= */ 10);
    gate.fromSubscription(objectAt(5, 3));
    gate.fromFill(objectAt(5, 0));
    expect(received).toEqual(['5:0']);

    gate.open();

    expect(received).toEqual(['5:0', '5:3']);
  });

  it('hands nothing on once released', () => {
    gate.fromSubscription(objectAt(5, 3));
    gate.release();
    gate.fromFill(objectAt(5, 0));
    gate.open();
    gate.fromSubscription(objectAt(5, 4));

    expect(received).toEqual([]);
  });
});
