/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @summary Utilities for the tests of Matroska. */
shaka.test.Matroska = class {
  /**
   * The bytes of an EBML variable-length integer holding a size.
   *
   * @param {number} value
   * @return {!Uint8Array}
   */
  static sizeVint(value) {
    for (let length = 1; length <= 8; length++) {
      // All bits set is the reserved "unknown" value.
      if (value < Math.pow(2, 7 * length) - 1) {
        const bytes = new Uint8Array(length);
        let rest = value;
        for (let i = length - 1; i >= 0; i--) {
          bytes[i] = rest % 256;
          rest = Math.floor(rest / 256);
        }
        bytes[0] |= 0x80 >> (length - 1);
        return bytes;
      }
    }
    throw new Error('Too large');
  }

  /**
   * @param {number} id An element ID, with its length marker.
   * @return {!Uint8Array}
   */
  static idBytes(id) {
    const bytes = [];
    for (let rest = id; rest > 0; rest = Math.floor(rest / 256)) {
      bytes.unshift(rest % 256);
    }
    return new Uint8Array(bytes);
  }

  /**
   * @param {number} id
   * @param {...!Uint8Array} payload
   * @return {!Uint8Array}
   */
  static element(id, ...payload) {
    const Matroska = shaka.test.Matroska;
    const body = shaka.util.Uint8ArrayUtils.concat(...payload);
    return shaka.util.Uint8ArrayUtils.concat(
        Matroska.idBytes(id), Matroska.sizeVint(body.length), body);
  }

  /**
   * An element with its size written as unknown.
   *
   * @param {number} id
   * @param {...!Uint8Array} payload
   * @return {!Uint8Array}
   */
  static unknownSizeElement(id, ...payload) {
    const unknown = new Uint8Array(
        [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    return shaka.util.Uint8ArrayUtils.concat(
        shaka.test.Matroska.idBytes(id), unknown, ...payload);
  }

  /**
   * An unsigned integer element, in as few bytes as possible.
   *
   * @param {number} id
   * @param {number} value
   * @return {!Uint8Array}
   */
  static uint(id, value) {
    const bytes = [];
    let rest = value;
    do {
      bytes.unshift(rest % 256);
      rest = Math.floor(rest / 256);
    } while (rest > 0);
    return shaka.test.Matroska.element(id, new Uint8Array(bytes));
  }

  /**
   * A 64-bit floating point element.
   *
   * @param {number} id
   * @param {number} value
   * @return {!Uint8Array}
   */
  static float(id, value) {
    const bytes = new Uint8Array(8);
    shaka.util.BufferUtils.toDataView(bytes).setFloat64(0, value);
    return shaka.test.Matroska.element(id, bytes);
  }

  /**
   * @param {number} id
   * @param {string} value
   * @return {!Uint8Array}
   */
  static string(id, value) {
    return shaka.test.Matroska.element(id, new Uint8Array(
        Array.from(value).map((char) => char.charCodeAt(0))));
  }

  /**
   * The payload of a block: track number, relative time, flags, lacing header
   * and frames.
   *
   * @param {number} track
   * @param {number} relativeTicks
   * @param {number} flags
   * @param {!Uint8Array} laceHeader
   * @param {...!Uint8Array} frames
   * @return {!Uint8Array}
   */
  static blockPayload(track, relativeTicks, flags, laceHeader, ...frames) {
    const time = new Uint8Array(
        [(relativeTicks >> 8) & 0xff, relativeTicks & 0xff]);
    return shaka.util.Uint8ArrayUtils.concat(
        new Uint8Array([0x80 | track]), time, new Uint8Array([flags]),
        laceHeader, ...frames);
  }

  /**
   * @param {number} track
   * @param {number} relativeTicks
   * @param {number} flags
   * @param {...!Uint8Array} frames
   * @return {!Uint8Array}
   */
  static simpleBlock(track, relativeTicks, flags, ...frames) {
    const Matroska = shaka.test.Matroska;
    return Matroska.element(shaka.mkv.ElementId.SIMPLE_BLOCK,
        Matroska.blockPayload(
            track, relativeTicks, flags, new Uint8Array(0), ...frames));
  }

  /**
   * A block group with a block that lasts some time.
   *
   * @param {number} track
   * @param {number} relativeTicks
   * @param {number} durationTicks
   * @param {!Uint8Array} frame
   * @return {!Uint8Array}
   */
  static blockGroup(track, relativeTicks, durationTicks, frame) {
    const Matroska = shaka.test.Matroska;
    const ElementId = shaka.mkv.ElementId;
    return Matroska.element(ElementId.BLOCK_GROUP,
        Matroska.element(ElementId.BLOCK, Matroska.blockPayload(
            track, relativeTicks, 0, new Uint8Array(0), frame)),
        Matroska.uint(ElementId.BLOCK_DURATION, durationTicks));
  }

  /**
   * @param {number} ticks
   * @param {...!Uint8Array} children
   * @return {!Uint8Array}
   */
  static cluster(ticks, ...children) {
    const Matroska = shaka.test.Matroska;
    const ElementId = shaka.mkv.ElementId;
    return Matroska.element(ElementId.CLUSTER,
        Matroska.uint(ElementId.CLUSTER_TIMECODE, ticks), ...children);
  }

  /**
   * @param {number} number
   * @param {!Object=} overrides
   * @return {!shaka.mkv.MatroskaIndexParser.Track}
   */
  static makeTrack(number, overrides = {}) {
    /** @type {!shaka.mkv.MatroskaIndexParser.Track} */
    const track = {
      offset: 0,
      size: 0,
      number,
      type: 1,
      codecId: '',
      codecPrivate: null,
      codecDelay: null,
      language: 'eng',
      name: '',
      enabled: true,
      isDefault: true,
      forced: false,
      hearingImpaired: false,
      visualImpaired: false,
      original: false,
      commentary: false,
      width: null,
      height: null,
      displayWidth: null,
      displayHeight: null,
      transferCharacteristics: null,
      channels: null,
      sampleRate: null,
      outputSampleRate: null,
      defaultDuration: null,
      strippedHeader: null,
      unsupportedEncoding: false,
      dolbyVisionConfig: null,
    };
    return /** @type {!shaka.mkv.MatroskaIndexParser.Track} */(
      Object.assign(track, overrides));
  }

  /**
   * A small file with the given TrackEntry elements.  It has a Cluster, so the
   * header is complete, and a Segment of unknown size like the ones streamed.
   *
   * @param {...!Uint8Array} trackEntries
   * @return {!Uint8Array}
   */
  static makeFile(...trackEntries) {
    return shaka.test.Matroska.makeFileOfType('matroska', ...trackEntries);
  }

  /**
   * Like makeFile(), for a given DocType.
   *
   * @param {string} docType
   * @param {...!Uint8Array} trackEntries
   * @return {!Uint8Array}
   */
  static makeFileOfType(docType, ...trackEntries) {
    const Matroska = shaka.test.Matroska;
    const ElementId = shaka.mkv.ElementId;
    return shaka.util.Uint8ArrayUtils.concat(
        Matroska.element(ElementId.EBML,
            Matroska.string(ElementId.DOC_TYPE, docType)),
        Matroska.unknownSizeElement(ElementId.SEGMENT,
            Matroska.element(ElementId.INFO,
                Matroska.uint(ElementId.TIMECODE_SCALE, 1000000),
                Matroska.float(ElementId.DURATION, 2000)),
            Matroska.element(ElementId.TRACKS, ...trackEntries),
            Matroska.cluster(0)));
  }

  /**
   * A complete small file: the index is there (a SeekHead that points to the
   * Cues, and Cues with one keyframe of the video track), and so is a Cluster
   * with one block of it.  The manifest parser can read it.
   *
   * @param {number} videoTrackNumber
   * @param {...!Uint8Array} trackEntries
   * @return {!Uint8Array}
   */
  static makeIndexedFile(videoTrackNumber, ...trackEntries) {
    const Matroska = shaka.test.Matroska;
    const ElementId = shaka.mkv.ElementId;
    const concat = (...arrays) => shaka.util.Uint8ArrayUtils.concat(...arrays);
    const seekHead = (cuesPosition) => {
      // The position takes 4 bytes always, so the SeekHead has the same size
      // whatever it says.
      const position = Matroska.element(ElementId.SEEK_POSITION,
          new Uint8Array([
            (cuesPosition >>> 24) & 0xff, (cuesPosition >>> 16) & 0xff,
            (cuesPosition >>> 8) & 0xff, cuesPosition & 0xff,
          ]));
      return Matroska.element(ElementId.SEEK_HEAD,
          Matroska.element(ElementId.SEEK,
              Matroska.element(ElementId.SEEK_ID,
                  Matroska.idBytes(ElementId.CUES)),
              position));
    };
    const info = Matroska.element(ElementId.INFO,
        Matroska.uint(ElementId.TIMECODE_SCALE, 1000000),
        Matroska.float(ElementId.DURATION, 2000));
    const tracks = Matroska.element(ElementId.TRACKS, ...trackEntries);
    const cluster = Matroska.cluster(0, Matroska.simpleBlock(
        videoTrackNumber, 0, shaka.mkv.BlockFlag.KEYFRAME,
        new Uint8Array([1, 2, 3])));
    const clusterPosition = seekHead(0).length + info.length + tracks.length;
    const cuesPosition = clusterPosition + cluster.length;
    const cues = Matroska.element(ElementId.CUES,
        Matroska.element(ElementId.CUE_POINT,
            Matroska.uint(ElementId.CUE_TIME, 0),
            Matroska.element(ElementId.CUE_TRACK_POSITIONS,
                Matroska.uint(ElementId.CUE_TRACK, videoTrackNumber),
                Matroska.uint(ElementId.CUE_CLUSTER_POSITION,
                    clusterPosition))));
    return concat(
        Matroska.element(ElementId.EBML,
            Matroska.string(ElementId.DOC_TYPE, 'matroska')),
        Matroska.element(ElementId.SEGMENT, seekHead(cuesPosition), info,
            tracks, cluster, cues));
  }

  /**
   * A TrackEntry.
   *
   * @param {number} number
   * @param {number} type
   * @param {string} codecId
   * @param {...!Uint8Array} fields More fields of the entry.
   * @return {!Uint8Array}
   */
  static trackEntry(number, type, codecId, ...fields) {
    const Matroska = shaka.test.Matroska;
    const ElementId = shaka.mkv.ElementId;
    return Matroska.element(ElementId.TRACK_ENTRY,
        Matroska.uint(ElementId.TRACK_NUMBER, number),
        Matroska.uint(ElementId.TRACK_TYPE, type),
        Matroska.string(ElementId.CODEC_ID, codecId),
        ...fields);
  }

  /**
   * The byte ranges the Clusters of a file are read in, one per keyframe of
   * the first video track, as the manifest parser makes them.
   *
   * @param {!Uint8Array} bytes
   * @param {shaka.mkv.MatroskaIndexParser.Header} header
   * @return {!Array<!shaka.test.Matroska.Segment>}
   */
  static getSegments(bytes, header) {
    const video = header.tracks.find((track) => {
      return track.type == shaka.mkv.TrackType.VIDEO;
    });
    // Several points can refer to the same Cluster: the first one counts.
    const cues = shaka.mkv.MatroskaIndexParser.parseCues(
        bytes.subarray(/** @type {number} */(header.cuesOffset)),
        header.segmentOffset, header.timecodeScale)
        .filter((cue) => cue.track == video.number)
        .filter((cue, i, all) => {
          return all.findIndex((other) => other.offset == cue.offset) == i;
        });
    // Without a following element (e.g. Cues before the Clusters), the media
    // data runs until the end of the file.
    const end = header.mediaEndOffset == null ?
        bytes.length : header.mediaEndOffset;
    return cues.map((cue, i) => {
      const next = cues[i + 1];
      const endByte = next ? next.offset : end;
      // The last one is guessed to be as long as the ones before it.
      const nextTime = next ? next.time : cue.time + 1.5;
      return {
        data: bytes.subarray(cue.offset, endByte),
        reference: new shaka.media.SegmentReference(
            cue.time, nextTime, () => ['uri'], cue.offset, endByte - 1, null,
            0, 0, Infinity),
      };
    });
  }

  /**
   * @param {!Uint8Array} bytes
   * @param {shaka.mkv.MatroskaIndexParser.Header} header
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {!Uint8Array} The initialization segment of the track.
   */
  static getInit(bytes, header, track) {
    return bytes.subarray(0, shaka.mkv.MatroskaIndexParser.getInitEndOffset(
        header, track) + 1);
  }

  /**
   * @param {string} name The file name in the shared MKV assets.
   * @return {string}
   */
  static getAssetUri(name) {
    return '/base/test/test/assets/mkv/' + name;
  }

  /**
   * @param {string} name The file name in the test assets.
   * @return {!Promise<!Uint8Array>}
   */
  static async fetchAsset(name) {
    const data = await shaka.test.Util.fetch(
        shaka.test.Matroska.getAssetUri(name));
    return shaka.util.BufferUtils.toUint8(data);
  }

  /**
   * A networking engine that serves the byte ranges of a file.
   *
   * @param {{bytes: !Uint8Array, uri: string, sendContentRange: boolean}} file
   *   The bytes that are served and the URI they are served as.  These can be
   *   changed afterwards to serve another file.
   * @return {!shaka.test.FakeNetworkingEngine}
   */
  static makeNetworkingEngine(file) {
    const network = new shaka.test.FakeNetworkingEngine();
    network.request.and.callFake((type, request) => {
      const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers['Range']);
      expect(range).not.toBe(null);
      const start = Number(range[1]);
      const end = Number(range[2]);
      const headers = {};
      if (file.sendContentRange) {
        headers['content-range'] =
            `bytes ${start}-${end}/${file.bytes.length}`;
      }
      /** @type {shaka.extern.Response} */
      const response = {
        uri: file.uri,
        originalUri: file.uri,
        data: file.bytes.subarray(start, end + 1),
        headers,
        originalRequest: request,
      };
      return shaka.util.AbortableOperation.completed(response);
    });
    return network;
  }
};


/**
 * A range of Clusters, as the manifest parser makes them, with its bytes.
 *
 * @typedef {{
 *   data: !Uint8Array,
 *   reference: !shaka.media.SegmentReference,
 * }}
 */
shaka.test.Matroska.Segment;


/**
 * What a media segment of fragmented MP4 says about its samples.
 *
 * @typedef {{
 *   baseMediaDecodeTime: number,
 *   samples: !Array<{duration: number, size: number, cts: number}>,
 * }}
 */
shaka.test.Matroska.Fragment;
