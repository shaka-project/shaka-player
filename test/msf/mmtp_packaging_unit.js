/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.packaging.Mmtp', isMSFSupported, () => {
  const Util = shaka.test.Util;
  const BufferUtils = shaka.util.BufferUtils;

  const VIDEO_PACKET_ID = 1;
  const AUDIO_PACKET_ID = 2;
  const SIGNALING_PACKET_ID = 0;

  /**
   * Every packet of the fixture, in the order the producer sent them.
   * @type {!Array<!Uint8Array>}
   */
  let packets;
  /** @type {!Uint8Array} */
  let videoInit;
  /** @type {!Uint8Array} */
  let audioInit;

  beforeAll(async () => {
    const base = '/base/test/test/assets/mmtp/';
    const capture = BufferUtils.toUint8(
        await Util.fetch(base + 'av-h264-aac.mmtp'));
    packets = [];
    const view = BufferUtils.toDataView(capture);
    for (let offset = 0; offset < capture.byteLength;) {
      const length = view.getUint32(offset);
      packets.push(capture.subarray(offset + 4, offset + 4 + length));
      offset += 4 + length;
    }
    videoInit = BufferUtils.toUint8(await Util.fetch(base + 'video-init.mp4'));
    audioInit = BufferUtils.toUint8(await Util.fetch(base + 'audio-init.mp4'));
  });

  /**
   * @param {!Uint8Array} packet
   * @return {number}
   */
  function packetIdOf(packet) {
    return (packet[2] << 8) | packet[3];
  }

  /**
   * @param {number} packetId
   * @return {!Array<!Uint8Array>}
   */
  function packetsOf(packetId) {
    return packets.filter((packet) => packetIdOf(packet) == packetId);
  }

  /**
   * @param {!Object=} overrides
   * @return {msfCatalog.Track}
   */
  function videoTrack(overrides) {
    return /** @type {msfCatalog.Track} */ (Object.assign({
      name: 'video',
      packaging: 'mmtp',
      isLive: true,
      codec: 'avc1.64000b',
      framerate: 15,
      width: 160,
      height: 90,
      mmtpMode: 'mfu',
      timescale: 1000000,
      groupDurationMs: 1000,
    }, overrides || {}));
  }

  /**
   * @param {!Object=} overrides
   * @return {msfCatalog.Track}
   */
  function audioTrack(overrides) {
    return /** @type {msfCatalog.Track} */ (Object.assign({
      name: 'audio',
      packaging: 'mmtp',
      isLive: true,
      codec: 'mp4a.40.2',
      samplerate: 48000,
      channelConfig: '2',
      mmtpMode: 'mfu',
      timescale: 48000,
      groupDurationMs: 1000,
    }, overrides || {}));
  }

  /**
   * @param {msfCatalog.Track} track
   * @param {!Uint8Array=} initData
   * @return {?shaka.extern.MsfTrackDescription}
   */
  function describeTrack(track, initData) {
    const packaging = shaka.msf.PackagingRegistry.create('mmtp');
    goog.asserts.assert(packaging, 'mmtp packaging must be registered');
    return packaging.describeTrack(track, initData || new Uint8Array(0));
  }

  /**
   * @param {msfCatalog.Track} track
   * @return {!shaka.msf.packaging.MmtpSegmenter}
   */
  function segmenterFor(track) {
    const packaging = shaka.msf.PackagingRegistry.create('mmtp');
    goog.asserts.assert(packaging, 'mmtp packaging must be registered');
    expect(packaging.describeTrack(track, new Uint8Array(0))).not.toBeNull();
    return /** @type {!shaka.msf.packaging.MmtpSegmenter} */ (
      packaging.createSegmenter());
  }

  /**
   * @param {number} objectId
   * @param {!Uint8Array} data
   * @return {!shaka.extern.MsfObject}
   */
  function makeObject(objectId, data) {
    return /** @type {!shaka.extern.MsfObject} */ ({
      trackAlias: BigInt(1),
      location: {
        group: BigInt(0),
        object: BigInt(objectId),
        subgroup: BigInt(0),
      },
      data,
      extensions: null,
      status: null,
      payloadReadStartMs: 0,
      receiveTimestampMs: 0,
    });
  }

  /**
   * @param {!shaka.extern.MsfSegmenter} segmenter
   * @param {!Array<!Uint8Array>} objects
   * @return {!Array<!shaka.extern.MsfSegment>}
   */
  function pushAll(segmenter, objects) {
    const segments = [];
    for (let i = 0; i < objects.length; i++) {
      segments.push(...segmenter.push(makeObject(i, objects[i])));
    }
    return segments;
  }

  /**
   * @param {!Object<string, number>} counts
   * @return {number}
   */
  function total(counts) {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }

  it('registers for the "mmtp" catalog packaging', () => {
    expect(shaka.msf.PackagingRegistry.getRegisteredPackagings())
        .toContain('mmtp');
  });

  describe('describeTrack', () => {
    it('presents a track without catalog init data as fMP4', () => {
      const description = describeTrack(videoTrack());
      expect(description).not.toBeNull();
      expect(description.basicInfo.mimeType).toBe('video/mp4');
      expect(description.basicInfo.codecs).toBe('avc1.64000b');
      // The init segment arrives in-band, on the segments themselves.
      expect(description.initSegmentReference).toBeNull();
    });

    it('presents an audio track as audio', () => {
      const description = describeTrack(audioTrack());
      expect(description).not.toBeNull();
      expect(description.basicInfo.mimeType).toBe('audio/mp4');
      expect(description.basicInfo.codecs).toBe('mp4a.40.2');
    });

    it('uses catalog init data as the init segment', () => {
      const description = describeTrack(videoTrack(), videoInit);
      expect(description).not.toBeNull();
      const init = description.initSegmentReference;
      expect(init).not.toBeNull();
      expect(BufferUtils.equal(init.getSegmentData(), videoInit)).toBe(true);
      expect(description.basicInfo.codecs).toMatch(/^avc1\./);
    });

    it('describes an FEC-protected track, with any interleave span', () => {
      // Repair is for lossy delivery; a subscription's Objects are not lost,
      // so the declaration neither helps nor hinders playback here. A zero
      // or absent span is valid metadata either way.
      const fec = {
        algorithm: 'raptorq',
        blockProfile: 'iso-ssbg1-v1',
        sourceSymbols: 32,
        repairSymbols: 8,
        symbolSize: 1312,
        repairTrack: 'video-repair',
      };
      for (const interleaveDepthMs of [undefined, 0, 133]) {
        const track = videoTrack(
            {fec: Object.assign({interleaveDepthMs}, fec)});
        expect(shaka.msf.packaging.Mmtp.whyUnsupported(track)).toBeNull();
        expect(describeTrack(track)).not.toBeNull();
      }
    });

    const rejections = [
      ['without mmtpMode', {mmtpMode: undefined}, 'mmtpMode'],
      ['with an unknown mmtpMode', {mmtpMode: 'segment'}, 'mmtpMode'],
      ['in MPU mode', {mmtpMode: 'mpu'}, '"mpu" is not supported'],
      ['without a timescale', {timescale: undefined}, 'timescale'],
      ['with a fractional timescale', {timescale: 1.5}, 'timescale'],
      ['without a group duration', {groupDurationMs: undefined},
        'groupDuration'],
      ['with a zero group duration', {groupDurationMs: 0}, 'groupDuration'],
      ['without a codec', {codec: undefined}, 'codec'],
      ['with two codecs', {codec: 'avc1.64000b,mp4a.40.2'}, 'several'],
      ['with a text codec', {codec: 'wvtt'}, 'neither audio nor video'],
    ];
    for (const [name, overrides, expected] of rejections) {
      it(`skips a track ${name}, saying why`, () => {
        const track = videoTrack(overrides);
        expect(describeTrack(track)).toBeNull();
        expect(shaka.msf.packaging.Mmtp.whyUnsupported(track))
            .toContain(expected);
      });
    }

    it('skips a track whose catalog init data is not ISO-BMFF', () => {
      expect(describeTrack(videoTrack(), new Uint8Array([1, 2, 3, 4])))
          .toBeNull();
    });

    it('skips every track when libmmt is not loaded', () => {
      const libmmt = window['BlockcastMmt'];
      try {
        // A classic script's top-level var cannot be deleted.
        window['BlockcastMmt'] = undefined;
        expect(describeTrack(videoTrack())).toBeNull();
        expect(shaka.msf.packaging.Mmtp.whyUnsupported(videoTrack()))
            .toContain('libmmt is not loaded');
      } finally {
        window['BlockcastMmt'] = libmmt;
      }
    });
  });

  describe('segmenter', () => {
    it('makes one segment per video sample, timed as authored', () => {
      const segmenter = segmenterFor(videoTrack());
      const objects = packetsOf(VIDEO_PACKET_ID);
      const segments = pushAll(segmenter, objects);

      // 2 s at 15 fps; the producer stopped one frame short of 2 s.
      expect(segments.length).toBe(29);
      expect(segments[0].startTime).toBe(0);
      expect(segments[0].independent).toBe(true);
      for (let i = 0; i < segments.length; i++) {
        expect(segments[i].duration).toBeCloseTo(1 / 15, 4);
        expect(segments[i].timestampOffset).toBe(0);
        expect(segments[i].discontinuitySequence).toBe(-1);
        if (i > 0) {
          expect(segments[i].startTime).toBeCloseTo(
              segments[i - 1].startTime + segments[i - 1].duration, 6);
        }
      }

      const stats = segmenter.getStats();
      expect(stats.samples).toEqual({'segment': 29});
      expect(total(stats.packets)).toBe(objects.length);
    });

    it('makes one segment per audio sample, timed as authored', () => {
      const segmenter = segmenterFor(audioTrack());
      const objects = packetsOf(AUDIO_PACKET_ID);
      const segments = pushAll(segmenter, objects);

      expect(segments.length).toBe(94);
      for (const segment of segments) {
        expect(segment.duration).toBeCloseTo(1024 / 48000, 6);
        expect(segment.independent).toBe(true);
      }
      expect(segments[93].startTime).toBeCloseTo(93 * 1024 / 48000, 6);
      expect(total(segmenter.getStats().packets)).toBe(objects.length);
    });

    it('puts the in-band init segment ahead of the first sample only',
        () => {
          const segmenter = segmenterFor(videoTrack());
          const segments = pushAll(segmenter, packetsOf(VIDEO_PACKET_ID));

          const boxesOf = (data) => {
            const types = [];
            new shaka.util.Mp4Parser()
                .box('ftyp', (box) => types.push('ftyp'))
                .box('moov', (box) => types.push('moov'))
                .box('moof', (box) => types.push('moof'))
                .box('mdat', (box) => types.push('mdat'))
                .parse(data);
            return types;
          };
          expect(boxesOf(segments[0].data))
              .toEqual(['ftyp', 'moov', 'moof', 'mdat']);
          // The producer repeats the same init segment; it is not appended
          // again while it is unchanged.
          for (const segment of segments.slice(1)) {
            expect(boxesOf(segment.data)).toEqual(['moof', 'mdat']);
          }
        });

    it('marks only random access points as sync samples', () => {
      const segmenter = segmenterFor(videoTrack());
      const segments = pushAll(segmenter, packetsOf(VIDEO_PACKET_ID));
      const sync = segments.map((segment) => {
        let isSync = false;
        new shaka.util.Mp4Parser()
            .box('moof', shaka.util.Mp4Parser.children)
            .box('traf', shaka.util.Mp4Parser.children)
            .fullBox('trun', (box) => {
              // ISO/IEC 14496-12 8.8.8: the sample flags of the first (and
              // only) sample, wherever the box's own flags put them.
              const flags = /** @type {number} */ (box.flags);
              const reader = box.reader;
              reader.skip(4); // sample_count
              if (flags & 0x1) {
                reader.skip(4); // data_offset
              }
              let sampleFlags = null;
              if (flags & 0x4) {
                sampleFlags = reader.readUint32(); // first_sample_flags
              } else {
                if (flags & 0x100) {
                  reader.skip(4); // sample_duration
                }
                if (flags & 0x200) {
                  reader.skip(4); // sample_size
                }
                if (flags & 0x400) {
                  sampleFlags = reader.readUint32();
                }
              }
              // sample_is_non_sync_sample
              isSync = sampleFlags != null && !(sampleFlags & 0x10000);
            })
            .parse(segment.data, /* partialOkay= */ true);
        return isSync;
      });
      // A GOP of 15 frames.
      expect(sync.map((isSync, i) => isSync ? i : -1)
          .filter((i) => i >= 0)).toEqual([0, 15]);
    });

    it('drops what precedes the init segment when joining mid-GOP', () => {
      const segmenter = segmenterFor(videoTrack());
      const objects = packetsOf(VIDEO_PACKET_ID);
      // Join mid-GOP, after the first GOP's init segment: nothing can be
      // timed until the next GOP repeats it.
      const segments = pushAll(segmenter, objects.slice(objects.length >> 2));

      const stats = segmenter.getStats();
      expect(stats.packets['drop:mfu-no-resolver']).toBeGreaterThan(0);
      expect(segments.length).toBeGreaterThan(0);
      // The first segment is the second GOP's random access point.
      expect(segments[0].startTime).toBeCloseTo(1, 4);
    });

    it('starts at a random access point when joining after the init', () => {
      const segmenter = segmenterFor(videoTrack());
      const objects = packetsOf(VIDEO_PACKET_ID);
      // The init segment, then the stream from the first GOP's second movie
      // fragment: its samples are timed, but not decodable.
      const segments = pushAll(
          segmenter, [objects[0]].concat(objects.slice(7)));

      const stats = segmenter.getStats();
      expect(stats.reorder['droppedBeforeStartupKeyframe']).toBe(14);
      expect(stats.samples).toEqual({'segment': 14});
      expect(segments[0].startTime).toBeCloseTo(1, 4);
    });

    it('counts and ignores the signaling flow', () => {
      const segmenter = segmenterFor(videoTrack());
      const signaling = packetsOf(SIGNALING_PACKET_ID);
      expect(signaling.length).toBeGreaterThan(0);
      expect(pushAll(segmenter, signaling)).toEqual([]);
      expect(segmenter.getStats().packets).toEqual(
          {'non-media': signaling.length});
    });

    it('drops media of another packet ID than the track\'s', () => {
      const segmenter = segmenterFor(videoTrack());
      const video = packetsOf(VIDEO_PACKET_ID);
      const audio = packetsOf(AUDIO_PACKET_ID);
      const segments = pushAll(segmenter, video.slice(0, 10));
      const before = segments.length;
      segments.push(...pushAll(segmenter, audio.slice(0, 30)));

      expect(segments.length).toBe(before);
      expect(segmenter.getStats().packets['drop:foreign-packet-id'])
          .toBeGreaterThan(0);
    });

    it('drops malformed packets without throwing', () => {
      const segmenter = segmenterFor(videoTrack());
      const video = packetsOf(VIDEO_PACKET_ID);
      const malformed = [
        new Uint8Array([0x00]),
        new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
        video[0].subarray(0, 8),
        video[1].subarray(0, video[1].byteLength >> 1),
      ];
      expect(pushAll(segmenter, malformed)).toEqual([]);

      const stats = segmenter.getStats();
      expect(total(stats.packets)).toBe(malformed.length);
      for (const outcome of Object.keys(stats.packets)) {
        expect(outcome).toMatch(/^(drop:|rejected$|pending$)/);
      }
      expect(stats.samples).toEqual({});
    });

    it('ignores empty objects, which carry an object status', () => {
      const segmenter = segmenterFor(videoTrack());
      expect(segmenter.push(makeObject(0, new Uint8Array(0)))).toEqual([]);
      const stats = segmenter.getStats();
      expect(stats.packets).toEqual({});
      expect(stats.samples).toEqual({});
    });

    it('starts each segmenter from a clean state', () => {
      const packaging = shaka.msf.PackagingRegistry.create('mmtp');
      packaging.describeTrack(videoTrack(), new Uint8Array(0));
      const video = packetsOf(VIDEO_PACKET_ID);
      const first = pushAll(packaging.createSegmenter(), video);
      const second = pushAll(packaging.createSegmenter(), video);
      expect(second.length).toBe(first.length);
      expect(BufferUtils.equal(second[0].data, first[0].data)).toBe(true);
    });
  });

  describe('appended to MediaSource', () => {
    /**
     * @param {string} mimeType
     * @param {!Array<!Uint8Array>} appends
     * @return {!Promise<!TimeRanges>}
     */
    async function buffer(mimeType, appends) {
      const mediaSource = new MediaSource();
      const video = /** @type {!HTMLVideoElement} */ (
        document.createElement('video'));
      const url = URL.createObjectURL(mediaSource);
      video.src = url;
      try {
        await new Promise((resolve) => {
          mediaSource.addEventListener('sourceopen', resolve, {once: true});
        });
        const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        for (const data of appends) {
          sourceBuffer.appendBuffer(data);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve, reject) => {
            sourceBuffer.addEventListener('updateend', resolve, {once: true});
            sourceBuffer.addEventListener('error', reject, {once: true});
          });
        }
        return /** @type {!TimeRanges} */ (sourceBuffer.buffered);
      } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    }

    it('buffers the whole video track from in-band init', async () => {
      const mimeType = 'video/mp4; codecs="avc1.64000b"';
      if (!MediaSource.isTypeSupported(mimeType)) {
        pending('H.264 is not supported here');
      }
      const segments =
          pushAll(segmenterFor(videoTrack()), packetsOf(VIDEO_PACKET_ID));
      const buffered =
          await buffer(mimeType, segments.map((segment) => segment.data));

      expect(buffered.length).toBe(1);
      expect(buffered.start(0)).toBeCloseTo(0, 2);
      const last = segments[segments.length - 1];
      expect(buffered.end(0)).toBeCloseTo(last.startTime + last.duration, 2);
    });

    it('buffers the whole audio track behind catalog init', async () => {
      const mimeType = 'audio/mp4; codecs="mp4a.40.2"';
      if (!MediaSource.isTypeSupported(mimeType)) {
        pending('AAC is not supported here');
      }
      const description = describeTrack(audioTrack(), audioInit);
      const segments =
          pushAll(segmenterFor(audioTrack()), packetsOf(AUDIO_PACKET_ID));
      const buffered = await buffer(mimeType, [
        BufferUtils.toUint8(/** @type {!BufferSource} */ (
          description.initSegmentReference.getSegmentData())),
        ...segments.map((segment) => segment.data),
      ]);

      expect(buffered.length).toBe(1);
      const last = segments[segments.length - 1];
      expect(buffered.end(0)).toBeCloseTo(last.startTime + last.duration, 2);
    });
  });

  describe('over a draft-18 session', () => {
    it('reassembles Objects read from a draft-18 subgroup stream',
        async () => {
          const dialect = new shaka.msf.draft18.Dialect();
          expect(dialect.getSubprotocol()).toBe('moqt-18');
          const codec = dialect.getCodec();

          const never = () => new Promise(() => {});
          let control;
          const webTransport = /** @type {!WebTransport} */ (
            /** @type {?} */ ({
              incomingUnidirectionalStreams: {getReader: () => ({read: never})},
              createBidirectionalStream: () => Promise.resolve({
                writable: new WritableStream({}),
                readable: new ReadableStream({
                  start: (controller) => {
                    control = controller;
                  },
                }),
              }),
              closed: never(),
              close: () => {},
            }));
          const session = new shaka.msf.draft18.Session(
              webTransport,
              /** @type {!shaka.msf.Writer} */ (/** @type {?} */ ({
                write: () => Promise.resolve(),
              })),
              /** @type {!shaka.extern.MsfDialect} */ (dialect),
              /** @type {!shaka.extern.MsfManifestConfiguration} */ (
                /** @type {?} */ ({})),
              () => new shaka.msf.draft18.MessageWriter(codec));

          try {
            const segmenter = segmenterFor(videoTrack());
            const segments = [];
            const subscribed = session.subscribe(['mmtp'], 'video', (obj) => {
              segments.push(...segmenter.push(obj));
            });
            await Util.shortDelay();
            control.enqueue(new Uint8Array([
              0x04, // SUBSCRIBE_OK
              0x00, 0x05, // Length
              0x07, // Track Alias
              0x01, // Parameter count
              0x09, 0x00, 0x00, // LARGEST_OBJECT = {group 0, object 0}
            ]));
            const alias = await subscribed;

            // One SUBGROUP_HEADER stream of type 0x30: Subgroup ID 0, the
            // default Publisher Priority and no Object Properties, then each
            // Object as an Object ID delta, a payload length and the payload.
            const writer = new shaka.util.DataViewWriter(
                256, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
            codec.encodeVarInt(writer, BigInt(0x30));
            codec.encodeVarInt(writer, alias);
            codec.encodeVarInt(writer, BigInt(0)); // Group ID
            const objects = packetsOf(VIDEO_PACKET_ID);
            for (const packet of objects) {
              codec.encodeVarInt(writer, BigInt(0)); // Object ID delta
              codec.encodeVarInt(writer, BigInt(packet.byteLength));
              writer.writeBytes(packet);
            }
            const bytes = writer.getBytes();
            const stream = new ReadableStream({
              start: (controller) => {
                controller.enqueue(bytes);
                controller.close();
              },
            });
            await /** @type {?} */ (session).handleIncomingStream_(stream);

            expect(segments.length).toBe(29);
            expect(total(segmenter.getStats().packets))
                .toBe(objects.length);
          } finally {
            session.release();
          }
        });
  });
});
