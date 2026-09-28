/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.draft18.Session', isMSFSupported, () => {
  const NAMESPACE = ['cmsf/clear'];
  const TRACK = 'catalog';

  /** @type {!shaka.msf.draft18.Session} */
  let session;
  /** @type {!Array<!Uint8Array>} */
  let written;
  /** @type {!ReadableStreamDefaultController} */
  let responses;
  /** @type {{aborted: boolean, cancelled: boolean}} */
  let requestStream;

  /**
   * A bidirectional stream whose write side records bytes and whose read side
   * is fed by the test through `responses`.
   *
   * @return {!Object}
   */
  function fakeBidirectionalStream() {
    const writable = new WritableStream({
      write: (chunk) => {
        written.push(chunk);
      },
      abort: () => {
        requestStream.aborted = true;
      },
    });
    const readable = new ReadableStream({
      start: (controller) => {
        responses = controller;
      },
      cancel: () => {
        requestStream.cancelled = true;
      },
    });
    return {writable, readable};
  }

  beforeEach(() => {
    written = [];
    requestStream = {aborted: false, cancelled: false};

    // The session listens on this for its lifetime, so it must never resolve
    // or the listen loop spins.
    const never = () => new Promise(() => {});

    const webTransport = /** @type {!WebTransport} */ (/** @type {?} */ ({
      incomingUnidirectionalStreams: {getReader: () => ({read: never})},
      createBidirectionalStream: () =>
        Promise.resolve(fakeBidirectionalStream()),
      // The session watches this to know when the peer has gone away, so it
      // must stay pending for the length of a test.
      closed: never(),
      close: () => {},
    }));

    const codec = new shaka.msf.draft18.Codec();
    const dialect = /** @type {!shaka.extern.MsfDialect} */ (/** @type {?} */ ({
      getCodec: () => codec,
      getName: () => shaka.config.MsfVersion.DRAFT_18,
    }));

    session = new shaka.msf.draft18.Session(
        webTransport,
        /** @type {!shaka.msf.Writer} */ (/** @type {?} */ ({
          write: () => Promise.resolve(),
        })),
        dialect,
        /** @type {!shaka.extern.MsfManifestConfiguration} */ (
          /** @type {?} */ ({})),
        () => new shaka.msf.draft18.MessageWriter(codec));
  });

  afterEach(() => {
    session.release();
  });

  /**
   * The registry is the session's own state, and a subscription can only be
   * established through a full SUBSCRIBE round trip.
   *
   * @return {!shaka.msf.TrackAliasRegistry}
   * @suppress {visibility}
   */
  function registryOf() {
    return session.trackRegistry_;
  }

  /**
   * The SUBSCRIBE_OK moqlivemock answers with: Track Alias 7, one
   * LARGEST_OBJECT parameter at {0, 0}, and no Track Properties.
   *
   * @return {!Uint8Array}
   */
  function subscribeOk() {
    return new Uint8Array([
      0x04, // SUBSCRIBE_OK
      0x00, 0x05, // Length
      0x07, // Track Alias
      0x01, // Parameter count
      0x09, 0x00, 0x00, // LARGEST_OBJECT = {group 0, object 0}
    ]);
  }

  /**
   * @return {!Uint8Array}
   */
  function publishDone() {
    return new Uint8Array([
      0x0b, // PUBLISH_DONE
      0x00, 0x03, // Length
      0x00, 0x00, 0x00, // Status Code, Stream Count, empty Reason
    ]);
  }

  /**
   * The bytes of the SUBSCRIBE this session sent, minus the type and length.
   *
   * @return {!Uint8Array}
   */
  function subscribePayload() {
    expect(written.length).toBe(1);
    const bytes = written[0];
    expect(bytes[0]).toBe(0x03); // SUBSCRIBE
    return bytes.subarray(3);
  }

  describe('subscribe', () => {
    it('omits GROUP_ORDER rather than asking for the publisher order',
        async () => {
          // Draft-16 said "the publisher's own order" with the value 0 of a
          // fixed field. As a parameter that value does not exist, and a
          // publisher that rejects the SUBSCRIBE over it answers nothing at
          // all, so the subscription hangs instead of failing.
          const subscribed = session.subscribe(NAMESPACE, TRACK, () => {});
          await shaka.test.Util.shortDelay();
          responses.enqueue(subscribeOk());
          await subscribed;

          const payload = subscribePayload();
          // Request ID 0, one namespace field, the track name, then the
          // parameters.
          const params = payload.subarray(
              1 + 1 + 1 + NAMESPACE[0].length + 1 + TRACK.length);
          expect(Array.from(params)).toEqual([
            0x02, // Parameter count
            0x10, 0x01, // FORWARD = 1
            0x10, 0x00, // delta 0x10 -> SUBSCRIBER_PRIORITY = 0
          ]);
        });

    it('resolves with the Track Alias', async () => {
      const subscribed = session.subscribe(NAMESPACE, TRACK, () => {});
      await shaka.test.Util.shortDelay();
      responses.enqueue(subscribeOk());
      expect(await subscribed).toBe(BigInt(7));
    });

    it('consumes the whole SUBSCRIBE_OK before reading the next message',
        async () => {
          // The parameters after the Track Alias are not read, but they still
          // have to be skipped: left in the stream, LARGEST_OBJECT's bytes
          // would be taken for the header of the next message and PUBLISH_DONE
          // would never be seen.
          const subscribed = session.subscribe(NAMESPACE, TRACK, () => {});
          await shaka.test.Util.shortDelay();
          responses.enqueue(subscribeOk());
          const alias = await subscribed;

          responses.enqueue(publishDone());
          await shaka.test.Util.shortDelay();

          expect(registryOf().getTrackInfoFromAlias(alias).closed).toBe(true);
        });
  });

  describe('unsubscribe', () => {
    /**
     * @return {!Promise<bigint>}
     */
    async function subscribeAndAck() {
      const subscribed = session.subscribe(NAMESPACE, TRACK, () => {});
      await shaka.test.Util.shortDelay();
      responses.enqueue(subscribeOk());
      return subscribed;
    }

    it('tears down the request stream', async () => {
      // Draft-17 removed UNSUBSCRIBE: the request stream IS the subscription,
      // so dropping our callbacks is not a withdrawal. Left open, the
      // publisher keeps sending objects for the whole session.
      const alias = await subscribeAndAck();
      await session.unsubscribe(alias);

      expect(requestStream.aborted).toBe(true);
      expect(requestStream.cancelled).toBe(true);
    });

    it('closes the track so late objects are dropped without waiting',
        async () => {
          // deliver_ retries an unknown alias for half a second before giving
          // up, on the theory that the SUBSCRIBE_OK has not landed yet. A
          // track we withdrew from is not that case.
          const alias = await subscribeAndAck();
          await session.unsubscribe(alias);

          const trackInfo = registryOf().getTrackInfoFromAlias(alias);
          expect(trackInfo.closed).toBe(true);
          expect(trackInfo.callbacks.length).toBe(0);
        });

    it('rejects an alias it never knew', () => {
      expect(() => session.unsubscribe(BigInt(99))).toThrow();
    });
  });

  describe('Track Properties', () => {
    // MSF_COMPRESSION = GZIP, the Track Property MSF defines. 0x78 and 1 both
    // fit in one byte in the draft-18 var int encoding.
    const COMPRESSION = [0x78, 0x01];

    /**
     * @param {!Array<number>} params The Parameters, count included.
     * @param {!Array<number>} properties
     * @return {!Uint8Array}
     */
    function subscribeOkWith(params, properties) {
      const payload = [0x07].concat(params, properties); // Track Alias 7
      return new Uint8Array([0x04, 0x00, payload.length].concat(payload));
    }

    /**
     * @param {!Array<number>} properties
     * @return {!Uint8Array}
     */
    function fetchOkWith(properties) {
      const payload = [
        0x00, // End Of Track
        0x00, 0x00, // End Location
        0x00, // Parameter count
      ].concat(properties);
      return new Uint8Array([0x18, 0x00, payload.length].concat(payload));
    }

    /**
     * A fetch data stream carrying one Object with the payload '{}', read
     * past its stream type as handleIncomingStream_ would have.
     *
     * @return {!shaka.msf.Reader}
     */
    function fetchStream() {
      const bytes = new Uint8Array([
        0x00, // Request ID
        0x00, // Group ID
        0x00, // Subgroup ID
        0x00, // Object ID
        0x80, // Publisher Priority
        0x00, // Properties Length
        0x02, 0x7b, 0x7d, // Payload
      ]);
      const stream = new ReadableStream({
        start: (controller) => {
          controller.enqueue(bytes);
          controller.close();
        },
      });
      return new shaka.msf.Reader(
          new Uint8Array([]), stream, new shaka.msf.draft18.Codec());
    }

    /**
     * @param {!shaka.msf.Reader} reader
     * @return {!Promise}
     * @suppress {visibility}
     */
    function handleFetchStream(reader) {
      return session.handleFetchStream_(reader);
    }

    /**
     * Delivers an Object as the data stream reader would, once it has read
     * one for the given alias.
     *
     * @param {bigint} alias
     * @return {!Promise}
     * @suppress {visibility}
     */
    function deliverObject(alias) {
      return session.deliver_(alias, {
        trackAlias: alias,
        location: {group: BigInt(0), object: BigInt(0), subgroup: null},
        data: new Uint8Array([0x7b, 0x7d]),
        extensions: null,
        status: null,
        payloadReadStartMs: 0,
        receiveTimestampMs: 0,
      });
    }

    /**
     * @param {!Uint8Array} response
     * @return {!Promise<!shaka.extern.MsfObject>}
     */
    async function subscribeAndDeliver(response) {
      /** @type {!Array<!shaka.extern.MsfObject>} */
      const received = [];
      const subscribed = session.subscribe(
          NAMESPACE, TRACK, (obj) => received.push(obj));
      await shaka.test.Util.shortDelay();
      responses.enqueue(response);
      const alias = await subscribed;
      await deliverObject(alias);
      expect(received.length).toBe(1);
      return received[0];
    }

    it('are handed on with the Objects of a subscription', async () => {
      const obj = await subscribeAndDeliver(subscribeOkWith(
          [0x01, 0x09, 0x00, 0x00], // LARGEST_OBJECT = {0, 0}
          COMPRESSION));
      expect(obj.trackProperties).toEqual(new Uint8Array(COMPRESSION));
    });

    it('are found after every Parameter a SUBSCRIBE_OK may carry',
        async () => {
          const obj = await subscribeAndDeliver(subscribeOkWith(
              [
                0x02, // Parameter count
                0x08, 0x05, // EXPIRES = 5
                0x01, 0x03, 0x04, // delta 1 -> LARGEST_OBJECT = {3, 4}
              ],
              COMPRESSION));
          expect(obj.trackProperties).toEqual(new Uint8Array(COMPRESSION));
        });

    it('are null when the SUBSCRIBE_OK has none', async () => {
      const obj = await subscribeAndDeliver(subscribeOk());
      expect(obj.trackProperties).toBeNull();
    });

    it('are given up on after a Parameter that cannot be stepped over',
        async () => {
          // Parameter values are encoded however their type says, so there is
          // no telling where an unknown one ends. The SUBSCRIBE_OK still has
          // to be consumed whole, or PUBLISH_DONE would be missed.
          const received = [];
          const subscribed = session.subscribe(
              NAMESPACE, TRACK, (obj) => received.push(obj));
          await shaka.test.Util.shortDelay();
          responses.enqueue(subscribeOkWith(
              [0x01, 0x40, 0x00, 0x00], // unknown type 0x40
              COMPRESSION));
          const alias = await subscribed;
          await deliverObject(alias);
          expect(received[0].trackProperties).toBeNull();

          responses.enqueue(publishDone());
          await shaka.test.Util.shortDelay();
          expect(registryOf().getTrackInfoFromAlias(alias).closed).toBe(true);
        });

    it('are handed on with the Objects of a fetch', async () => {
      const received = [];
      const fetched = session.fetch(
          NAMESPACE, TRACK, (obj) => received.push(obj));
      await shaka.test.Util.shortDelay();
      responses.enqueue(fetchOkWith(COMPRESSION));
      await fetched;

      await handleFetchStream(fetchStream());

      expect(received.length).toBe(1);
      expect(received[0].trackProperties).toEqual(new Uint8Array(COMPRESSION));
    });

    it('hold fetched Objects that beat the FETCH_OK until it arrives',
        async () => {
          // A publisher may send Objects before answering, and the Track
          // Properties that say how to read them are in the answer.
          const received = [];
          const fetched = session.fetch(
              NAMESPACE, TRACK, (obj) => received.push(obj));
          await shaka.test.Util.shortDelay();

          const handled = handleFetchStream(fetchStream());
          await shaka.test.Util.shortDelay();
          expect(received.length).toBe(0);

          responses.enqueue(fetchOkWith(COMPRESSION));
          await fetched;
          await handled;

          expect(received.length).toBe(1);
          expect(received[0].trackProperties)
              .toEqual(new Uint8Array(COMPRESSION));
        });

    it('drop the fetched Objects of a fetch that failed', async () => {
      const received = [];
      const fetched = session.fetch(
          NAMESPACE, TRACK, (obj) => received.push(obj));
      await shaka.test.Util.shortDelay();

      const handled = handleFetchStream(fetchStream());
      responses.enqueue(new Uint8Array([
        0x05, // REQUEST_ERROR
        0x00, 0x02, // Length
        0x00, 0x00, // Error Code, empty Reason
      ]));
      await expectAsync(fetched).toBeRejected();
      await handled;

      expect(received.length).toBe(0);
    });
  });
});
