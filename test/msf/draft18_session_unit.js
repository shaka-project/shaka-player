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

  /** @type {!WebTransport} */
  let webTransport;
  /** @type {!shaka.extern.MsfDialect} */
  let dialect;
  /** @type {!shaka.msf.draft18.Codec} */
  let codec;

  beforeEach(() => {
    written = [];
    requestStream = {aborted: false, cancelled: false};

    // The session listens on this for its lifetime, so it must never resolve
    // or the listen loop spins.
    const never = () => new Promise(() => {});

    const fakeWebTransport = /** @type {?} */ ({
      incomingUnidirectionalStreams: {getReader: () => ({read: never})},
      createBidirectionalStream: () =>
        Promise.resolve(fakeBidirectionalStream()),
      // The session watches this to know when the peer has gone away, so it
      // must stay pending for the length of a test.
      closed: never(),
      close: () => {},
    });
    webTransport = /** @type {!WebTransport} */ (fakeWebTransport);

    codec = new shaka.msf.draft18.Codec();
    dialect = /** @type {!shaka.extern.MsfDialect} */ (/** @type {?} */ ({
      getCodec: () => codec,
      getName: () => shaka.config.MsfVersion.DRAFT_18,
    }));

    session = createSession(() => new shaka.msf.draft18.MessageWriter(codec));
  });

  /**
   * @param {function():!shaka.msf.draft18.MessageWriter} writerFactory
   * @return {!shaka.msf.draft18.Session}
   */
  function createSession(writerFactory) {
    return new shaka.msf.draft18.Session(
        webTransport,
        /** @type {!shaka.msf.Writer} */ (/** @type {?} */ ({
          write: () => Promise.resolve(),
        })),
        dialect,
        /** @type {!shaka.extern.MsfManifestConfiguration} */ (
          /** @type {?} */ ({})),
        writerFactory);
  }

  /**
   * Encodes var ints in the draft-18 encoding. A nested array is copied as
   * raw bytes, which is how Publisher Priority is written.
   *
   * @param {...(number|!Array<number>)} values
   * @return {!Array<number>}
   */
  function bytesOf(...values) {
    const writer = new shaka.util.DataViewWriter(
        64, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
    for (const value of values) {
      if (Array.isArray(value)) {
        writer.writeBytes(new Uint8Array(value));
      } else {
        codec.encodeVarInt(writer, BigInt(value));
      }
    }
    return Array.from(writer.getBytes());
  }

  /**
   * A fetch data stream, read past its stream type as handleIncomingStream_
   * would have.
   *
   * @param {!Array<number>} bytes The FETCH_HEADER's Request ID onwards.
   * @return {!shaka.msf.Reader}
   */
  function fetchStreamOf(bytes) {
    const stream = new ReadableStream({
      start: (controller) => {
        controller.enqueue(new Uint8Array(bytes));
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
  function readFetchStream(reader) {
    return session.handleFetchStream_(reader);
  }

  /**
   * A FETCH_OK with no Parameters and no Track Properties.
   *
   * @return {!Uint8Array}
   */
  function fetchOk() {
    return new Uint8Array([
      0x18, // FETCH_OK
      0x00, 0x04, // Length
      0x00, // End Of Track
      0x00, 0x00, // End Location
      0x00, // Parameter count
    ]);
  }

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

    it('reports the reason of a REQUEST_ERROR', async () => {
      // The Retry Interval sits between the Error Code and the Reason. Read
      // as the Reason's length, a Retry Interval of 0 turns every reason
      // into "".
      const reason = 'non-matching namespace';
      const subscribed = session.subscribe(NAMESPACE, TRACK, () => {});
      await shaka.test.Util.shortDelay();
      responses.enqueue(new Uint8Array([
        0x05, // REQUEST_ERROR
        0x00, 3 + reason.length, // Length
        0x10, // Error Code = DOES_NOT_EXIST
        0x00, // Retry Interval
        reason.length,
        ...Array.from(reason, (c) => c.charCodeAt(0)),
      ]));

      await expectAsync(subscribed).toBeRejectedWith(
          jasmine.objectContaining({
            message: jasmine.stringMatching(
                /code 16, reason "non-matching namespace"/),
          }));
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
        0x1c, // Serialization Flags: Group and Object ID, Priority
        0x00, // Group ID
        0x00, // Object ID
        0x80, // Publisher Priority
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

    describe('in draft-22', () => {
      beforeEach(() => {
        session.release();
        session = createSession(
            () => new shaka.msf.draft22.MessageWriter(codec));
      });

      it('are found after a LOCATION_FILTER, which has no length',
          async () => {
            // Next Object carries no fields. Read with the draft-20 framing,
            // its Filter Type would be a length of 5 and swallow the Track
            // Properties.
            const obj = await subscribeAndDeliver(subscribeOkWith(
                [0x01, 0x21, 0x05], // LOCATION_FILTER = Next Object
                COMPRESSION));
            expect(obj.trackProperties).toEqual(new Uint8Array(COMPRESSION));
          });

      it('are found after a LOCATION_FILTER that carries fields',
          async () => {
            const obj = await subscribeAndDeliver(subscribeOkWith(
                [
                  0x01, // Parameter count
                  0x21, 0x03, 0x07, 0x00, 0x02, // Absolute Start, Group End
                ],
                COMPRESSION));
            expect(obj.trackProperties).toEqual(new Uint8Array(COMPRESSION));
          });

      it('are given up on after an unknown Location Filter Type',
          async () => {
            const obj = await subscribeAndDeliver(subscribeOkWith(
                [0x01, 0x21, 0x06], // no such Location Filter Type
                COMPRESSION));
            expect(obj.trackProperties).toBeNull();
          });
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
        0x00, 0x03, // Length
        0x00, // Error Code
        0x00, // Retry Interval
        0x00, // Empty Reason
      ]));
      await expectAsync(fetched).toBeRejected();
      await handled;

      expect(received.length).toBe(0);
    });
  });

  describe('fetch streams', () => {
    /**
     * @return {!Promise<!Array<!shaka.extern.MsfObject>>}
     */
    async function acceptedFetch() {
      /** @type {!Array<!shaka.extern.MsfObject>} */
      const received = [];
      const fetched = session.fetch(
          NAMESPACE, TRACK, (obj) => received.push(obj));
      await shaka.test.Util.shortDelay();
      responses.enqueue(fetchOk());
      await fetched;
      return received;
    }

    /**
     * @param {!Array<!shaka.extern.MsfObject>} objects
     * @return {!Array<string>}
     */
    function locationsOf(objects) {
      return objects.map((obj) => `${obj.location.group}/` +
          `${obj.location.subgroup}/${obj.location.object}`);
    }

    it('reads the fields the Serialization Flags say are present',
        async () => {
          const received = await acceptedFetch();
          await readFetchStream(fetchStreamOf(bytesOf(
              0, // Request ID
              // Group 3, Object 0, with a Priority.
              0x1c, 3, 0, [0x80], 1, [0xa0],
              // Everything left out: the next Object in the same Group.
              0x00, 1, [0xa1],
              // An Object ID Delta within a Group is added as it is.
              0x04, 2, 1, [0xa2],
              // A Group ID Delta is one less than the gap, and the Object ID
              // then starts afresh; the Subgroup ID is spelled out.
              0x0f, 1, 7, 4, 1, [0xa3],
              // The prior Object's Subgroup ID.
              0x01, 1, [0xa4],
              // An End of Non-Existent Range moves the Location on.
              0x8c, 5, 9,
              0x00, 1, [0xa5],
              // Properties.
              0x20, 2, [0x78, 0x01], 1, [0xa6])));

          expect(locationsOf(received)).toEqual([
            '3/0/0', '3/0/1', '3/0/3', '5/7/4', '5/7/5', '5/0/10', '5/0/11',
          ]);
          expect(received.map((obj) => obj.data[0])).toEqual(
              [0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6]);
          expect(received[6].extensions).toEqual(new Uint8Array([0x78, 0x01]));
          expect(received[0].extensions).toBeNull();
        });

    it('refuses a first Object that does not spell out its Location',
        async () => {
          const received = await acceptedFetch();
          await expectAsync(readFetchStream(fetchStreamOf(bytesOf(
              0, 0x00, 1, [0xa0])))).toBeRejected();
          expect(received.length).toBe(0);
        });
  });

  describe('joining the current group', () => {
    /** @type {!Array<!shaka.extern.MsfObject>} */
    let received;

    beforeEach(() => {
      received = [];
    });

    /**
     * @param {!Uint8Array=} answer The SUBSCRIBE_OK to answer with.
     * @return {!Promise<bigint>}
     */
    async function subscribeJoining(answer) {
      const subscribed = session.subscribe(
          NAMESPACE, TRACK, (obj) => received.push(obj),
          /* startLocation= */ null, /* joinCurrentGroup= */ true);
      await shaka.test.Util.shortDelay();
      responses.enqueue(answer || subscribeOk());
      const alias = await subscribed;
      await shaka.test.Util.shortDelay();
      return alias;
    }

    /**
     * A SUBSCRIBE_OK for Track Alias 7 reporting the given Largest Object, or
     * none at all when the track has nothing published.
     *
     * @param {?Array<number>} largestObject
     * @return {!Uint8Array}
     */
    function subscribeOkAt(largestObject) {
      const params = largestObject ?
          [0x01, 0x09].concat(largestObject) : [0x00];
      const payload = [0x07].concat(params);
      return new Uint8Array([0x04, 0x00, payload.length].concat(payload));
    }

    /**
     * Hands an Object to the subscription as a subgroup stream would.
     *
     * @param {bigint} alias
     * @param {number} group
     * @param {number} object
     * @return {!Promise}
     * @suppress {visibility}
     */
    function deliverToSubscription(alias, group, object) {
      return session.deliver_(alias, {
        trackAlias: alias,
        location: {group: BigInt(group), object: BigInt(object)},
        data: new Uint8Array([0x7b, 0x7d]),
        extensions: null,
        status: null,
        payloadReadStartMs: 0,
        receiveTimestampMs: 0,
      });
    }

    /**
     * Objects 0 to count - 1 of a Group, on a fetch stream answering the
     * given request.
     *
     * @param {number} requestId
     * @param {number} group
     * @param {number} count
     * @return {!shaka.msf.Reader}
     */
    function groupStartFor(requestId, group, count) {
      const values = [requestId, 0x1c, group, 0, [0x80], 2, [0x7b, 0x7d]];
      for (let i = 1; i < count; i++) {
        // Subgroup and Group as before, Object ID one more.
        values.push(0x01, 2, [0x7b, 0x7d]);
      }
      return fetchStreamOf(bytesOf(...values));
    }

    /**
     * @return {!Array<string>}
     */
    function receivedLocations() {
      return received.map(
          (obj) => `${obj.location.group}:${obj.location.object}`);
    }

    /**
     * One Object at the given Location on a fetch stream answering the given
     * request.
     *
     * @param {number} requestId
     * @param {number} group
     * @param {number} object
     * @return {!shaka.msf.Reader}
     */
    function oneObjectFor(requestId, group, object) {
      return fetchStreamOf(
          bytesOf(requestId, 0x1c, group, object, [0x80], 2, [0x7b, 0x7d]));
    }

    it('sends a Relative Joining FETCH for the current group', async () => {
      await subscribeJoining();

      expect(written.length).toBe(2);
      expect(Array.from(written[1])).toEqual([
        0x16, // FETCH
        0x00, 0x05, // Length
        0x02, // Request ID
        0x02, // Fetch Type = Relative Joining
        0x00, // Joining Request ID, the SUBSCRIBE's
        0x00, // Joining Start: the current Group
        0x00, // Parameter count
      ]);
    });

    it('delivers the fetched Objects to the subscription', async () => {
      await subscribeJoining();
      responses.enqueue(fetchOk());
      await shaka.test.Util.shortDelay();

      await readFetchStream(oneObjectFor(2, 5, 0));

      expect(received.length).toBe(1);
      expect(received[0].location.group).toBe(BigInt(5));
      expect(received[0].location.object).toBe(BigInt(0));
    });

    it('withdraws the Joining FETCH with the subscription', async () => {
      const alias = await subscribeJoining();
      responses.enqueue(fetchOk());
      await shaka.test.Util.shortDelay();

      await session.unsubscribe(alias);
      await readFetchStream(oneObjectFor(2, 5, 0));

      expect(received.length).toBe(0);
    });

    it('holds the subscription back until the current group is in',
        async () => {
          // The subscription starts at the Next Object, mid-group, and its
          // streams race the fetch. A segmenter fed the end of a Group before
          // its start cannot make a decodable segment of it.
          const alias = await subscribeJoining(subscribeOkAt([5, 1]));
          await deliverToSubscription(alias, 5, 3);
          await deliverToSubscription(alias, 5, 2);
          expect(received.length).toBe(0);

          responses.enqueue(fetchOk());
          await shaka.test.Util.shortDelay();
          await readFetchStream(groupStartFor(2, 5, 2));

          expect(receivedLocations()).toEqual(['5:0', '5:1', '5:2', '5:3']);

          await deliverToSubscription(alias, 6, 0);
          expect(receivedLocations().pop()).toBe('6:0');
        });

    it('still fetches when the SUBSCRIBE_OK reports no Largest Object',
        async () => {
          // relay.moqtail.dev answers without LARGEST_OBJECT and then delivers
          // from the middle of a Group, so only the Joining FETCH's own answer
          // can say there is nothing to fill.
          const alias = await subscribeJoining(subscribeOkAt(null));
          expect(written.length).toBe(2);

          await deliverToSubscription(alias, 7, 18);
          expect(received.length).toBe(0);

          responses.enqueue(fetchOk());
          await shaka.test.Util.shortDelay();
          await readFetchStream(groupStartFor(2, 7, 2));

          expect(receivedLocations()).toEqual(['7:0', '7:1', '7:18']);
        });

    it('releases the subscription when the Joining FETCH fails', async () => {
      const alias = await subscribeJoining(subscribeOkAt([5, 1]));
      await deliverToSubscription(alias, 5, 2);
      responses.enqueue(new Uint8Array([
        0x05, // REQUEST_ERROR
        0x00, 0x03, // Length
        0x03, // Error Code
        0x00, // Retry Interval
        0x00, // Empty Reason
      ]));
      await shaka.test.Util.shortDelay();

      expect(receivedLocations()).toEqual(['5:2']);
    });

    it('keeps the subscription when the Joining FETCH fails', async () => {
      // A track with nothing published yet has no current Group to fetch.
      const alias = await subscribeJoining();
      responses.enqueue(new Uint8Array([
        0x05, // REQUEST_ERROR
        0x00, 0x03, // Length
        0x03, // Error Code
        0x00, // Retry Interval
        0x00, // Empty Reason
      ]));
      await shaka.test.Util.shortDelay();

      expect(registryOf().getTrackInfoFromAlias(alias).closed).toBe(false);
    });

    describe('in draft-20', () => {
      beforeEach(() => {
        session.release();
        session = createSession(
            () => new shaka.msf.draft20.MessageWriter(codec));
      });

      it('asks for it with FILL_PARAMETERS instead of a FETCH', async () => {
        await subscribeJoining();

        const payload = subscribePayload();
        const params = payload.subarray(
            1 + 1 + 1 + NAMESPACE[0].length + 1 + TRACK.length);
        expect(Array.from(params)).toEqual([
          0x03, // Parameter count
          0x10, 0x01, // FORWARD = 1
          0x10, 0x00, // delta 0x10 -> SUBSCRIBER_PRIORITY = 0
          0x03, 0x04, // delta 0x03 -> FILL_PARAMETERS, 4 bytes:
          0x01, // Parameter count
          0x21, 0x01, 0x01, // LOCATION_FILTER, StartGroup = 1
        ]);
      });

      it('delivers the fill fetch stream to the subscription', async () => {
        // Its FETCH_HEADER carries the SUBSCRIBE's own Request ID.
        await subscribeJoining();
        await readFetchStream(oneObjectFor(0, 5, 0));

        expect(received.length).toBe(1);
        expect(received[0].location.group).toBe(BigInt(5));
      });

      it('does not wait for a fill on a track with nothing published',
          async () => {
            // Without a Largest Object the fill range is empty, and the
            // publisher opens no fill fetch stream at all.
            const alias = await subscribeJoining(subscribeOkAt(null));
            await deliverToSubscription(alias, 0, 0);

            expect(receivedLocations()).toEqual(['0:0']);
          });

      it('releases the subscription when the fill stream ends', async () => {
        // A fill stream that stops short of the Largest Object has said all
        // it is going to.
        const alias = await subscribeJoining(subscribeOkAt([5, 3]));
        await deliverToSubscription(alias, 5, 4);
        await readFetchStream(groupStartFor(0, 5, 2));

        expect(receivedLocations()).toEqual(['5:0', '5:1', '5:4']);
      });
    });

    describe('in draft-22', () => {
      beforeEach(() => {
        session.release();
        session = createSession(
            () => new shaka.msf.draft22.MessageWriter(codec));
      });

      it('writes the nested LOCATION_FILTER as Relative Start', async () => {
        // Draft-22 replaced the filter's length with a Location Filter Type.
        // Relative Start is 0x01 and carries one field, so the bytes happen to
        // match what draft-20 writes for a one-byte value; the nested writer
        // has to be a draft-22 one for that to hold by design and not luck.
        await subscribeJoining();

        const payload = subscribePayload();
        const params = payload.subarray(
            1 + 1 + 1 + NAMESPACE[0].length + 1 + TRACK.length);
        expect(Array.from(params)).toEqual([
          0x03, // Parameter count
          0x10, 0x01, // FORWARD = 1
          0x10, 0x00, // delta 0x10 -> SUBSCRIBER_PRIORITY = 0
          0x03, 0x04, // delta 0x03 -> FILL_PARAMETERS, 4 bytes:
          0x01, // Parameter count
          0x21, // LOCATION_FILTER, no length:
          0x01, 0x01, // Relative Start, StartGroup = 1
        ]);
      });
    });
  });
});
