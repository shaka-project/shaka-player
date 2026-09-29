/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.media.Capabilities');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.mkv.BlockAddType');
goog.require('shaka.mkv.CodecId');
goog.require('shaka.mkv.ElementId');
goog.require('shaka.mkv.MatroskaConstants');
goog.require('shaka.mkv.MatroskaIndexParser');
goog.require('shaka.mkv.MatroskaParser');
goog.require('shaka.mkv.TrackType');
goog.require('shaka.net.NetworkingUtils');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.PlayerConfiguration');

describe('MatroskaParser', () => {
  const CodecId = shaka.mkv.CodecId;
  const Matroska = shaka.test.Matroska;
  const MatroskaIndexParser = shaka.mkv.MatroskaIndexParser;
  const TrackType = shaka.mkv.TrackType;

  const multitrackUri = Matroska.getAssetUri('multitrack.mkv');

  /** @type {!shaka.mkv.MatroskaParser} */
  let parser;
  /** @type {!shaka.test.FakeNetworkingEngine} */
  let network;
  /** @type {{bytes: !Uint8Array, uri: string, sendContentRange: boolean}} */
  let file;
  /** @type {!Uint8Array} */
  let multitrack;

  beforeAll(async () => {
    multitrack = await Matroska.fetchAsset('multitrack.mkv');
  });

  beforeEach(() => {
    parser = new shaka.mkv.MatroskaParser();
    file = {bytes: multitrack, uri: multitrackUri, sendContentRange: true};
    network = Matroska.makeNetworkingEngine(file);
  });

  afterEach(async () => {
    await parser.stop();
  });

  /** @return {shaka.extern.ManifestParser.PlayerInterface} */
  const makePlayerInterface = () => {
    const config = shaka.util.PlayerConfiguration.createDefault();
    return {
      networkingEngine: network,
      filter: (manifest) => Promise.resolve(),
      makeTextStreamsForClosedCaptions: (manifest) => {},
      onTimelineRegionAdded: fail,
      onScte35Event: fail,
      onEvent: fail,
      onError: fail,
      isLowLatencyMode: () => false,
      updateDuration: () => {},
      newDrmInfo: (stream) => {},
      onManifestUpdated: () => {},
      getBandwidthEstimate: () => 1e6,
      onMetadata: () => Promise.resolve(),
      disableStream: (stream) => {},
      addFont: (name, url) => {},
      getStreamingRetryParameters: () => config.streaming.retryParameters,
      onSegmentReceived: (deltaTimeMs, numBytes) => {},
    };
  };

  /**
   * @param {string} name
   * @return {!Promise<shaka.extern.Manifest>}
   */
  const startWithAsset = async (name) => {
    file.bytes = await Matroska.fetchAsset(name);
    file.uri = Matroska.getAssetUri(name);
    return parser.start(file.uri, makePlayerInterface());
  };

  /** @return {!Promise<shaka.extern.Manifest>} */
  const startMultitrack = () => {
    return parser.start(multitrackUri, makePlayerInterface());
  };

  /**
   * @param {shaka.extern.Stream} stream A stream whose index has been created.
   * @return {!Array<!shaka.media.SegmentReference>}
   */
  const getReferences = (stream) => {
    return Array.from(/** @type {!shaka.media.SegmentIndex} */(
      stream.segmentIndex));
  };

  /**
   * @param {!Object} manifestConfig
   */
  const configure = (manifestConfig) => {
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    Object.assign(config, manifestConfig);
    parser.configure(config);
  };

  describe('manifest', () => {
    it('is of type MKV', async () => {
      const manifest = await startMultitrack();
      expect(manifest.type).toBe(shaka.media.ManifestParser.MKV);
      expect(manifest.type).toBe('MKV');
      expect(manifest.sequenceMode).toBe(false);
    });

    it('lasts as long as the file says', async () => {
      const manifest = await startMultitrack();
      expect(manifest.presentationTimeline.getDuration()).toBeCloseTo(4.5, 3);
      expect(manifest.presentationTimeline.isLive()).toBe(false);
    });

    it('has a variant for each pair of video and audio', async () => {
      const manifest = await startMultitrack();
      // One video, and the seven audio tracks that can be repackaged:
      // AAC, Opus, MP3, AC-3, E-AC-3, FLAC and Vorbis.
      expect(manifest.variants.length).toBe(7);
      const codecs = manifest.variants.map((variant) => variant.audio.codecs);
      expect(codecs).toEqual(
          ['mp4a.40.2', 'opus', 'mp3', 'ac-3', 'ec-3', 'flac', 'vorbis']);
      for (const variant of manifest.variants) {
        expect(variant.video.codecs).toBe('avc1.64000a');
      }
      expect(new Set(manifest.variants.map((v) => v.id)).size).toBe(7);
    });

    it('starts with what the file marks as default', async () => {
      const manifest = await startMultitrack();
      const primary = manifest.variants.filter((variant) => variant.primary);
      expect(primary.length).toBe(1);
      // The first audio track has the flag; the second does not.
      expect(primary[0].audio.codecs).toBe('mp4a.40.2');
      expect(primary[0].language).toBe('en');
    });

    it('takes the first variant as the default if nothing says', async () => {
      const manifest = await startWithAsset('index.mkv');
      expect(manifest.variants.length).toBe(1);
      expect(manifest.variants[0].primary).toBe(true);
    });

    it('gives the streams their identifiers and languages', async () => {
      const manifest = await startMultitrack();
      const audio = manifest.variants.map((variant) => variant.audio);
      expect(audio.map((stream) => stream.originalId)).toEqual(
          ['2', '3', '4', '5', '6', '7', '8']);
      // ISO 639-2 codes become the ones the rest of the player uses.
      expect(audio[0].language).toBe('en');
      expect(audio[1].language).toBe('es');
      expect(audio[2].language).toBe('fr');
      expect(audio[0].originalLanguage).toBe('eng');
    });

    it('describes the video', async () => {
      const manifest = await startMultitrack();
      const video = manifest.variants[0].video;
      expect(video.type).toBe('video');
      expect(video.mimeType).toBe('video/x-matroska');
      expect(video.width).toBe(64);
      expect(video.height).toBe(64);
      // Exactly, not 1 over a duration rounded to a nanosecond.
      expect(video.frameRate).toBe(10);
      expect(video.hdr).toBeUndefined();
    });

    it('describes the audio', async () => {
      const manifest = await startMultitrack();
      const mp3 = manifest.variants[2].audio;
      expect(mp3.type).toBe('audio');
      expect(mp3.mimeType).toBe('audio/x-matroska');
      expect(mp3.channelsCount).toBe(1);
      expect(mp3.audioSamplingRate).toBe(44100);
    });

    it('takes the bandwidth from the size of the file', async () => {
      const manifest = await startMultitrack();
      const expected = Math.round(multitrack.length * 8 / 4.5);
      for (const variant of manifest.variants) {
        expect(variant.bandwidth).toBe(expected);
      }
      expect(manifest.variants[0].video.bandwidth).toBe(expected);
    });

    it('has no bandwidth when the server does not say the size', async () => {
      file.sendContentRange = false;
      const manifest = await startMultitrack();
      expect(manifest.variants[0].bandwidth).toBe(0);
    });

    it('skips the tracks that cannot be repackaged', async () => {
      const manifest = await startWithAsset('vp8-vorbis-srt.mkv');
      // VP8 and Vorbis are now repackaged as WebM.
      expect(manifest.variants[0].video.codecs).toBe('vp8');
      expect(manifest.variants[0].audio.codecs).toBe('vorbis');
    });
  });

  describe('video codecs', () => {
    it('reads VP9 parameters from the first key frame', async () => {
      const manifest = await startWithAsset('index.mkv');
      const video = manifest.variants[0].video;
      // The track has no CodecPrivate: profile 0, 8 bits, 4:2:0.
      expect(video.codecs).toMatch(/^vp09\.00\.\d\d\.08\.01$/);
      expect(manifest.variants[0].audio.codecs).toBe('opus');
    });

    it('reads AV1 parameters from CodecPrivate', async () => {
      const manifest = await startWithAsset('av1-10bit-opus.mkv');
      expect(manifest.variants[0].video.codecs).toMatch(/^av01\.0\.\d\dM\.10$/);
    });

    it('reads HEVC and E-AC-3 parameters', async () => {
      const manifest = await startWithAsset('hevc-10bit-eac3.mkv');
      expect(manifest.variants[0].video.codecs).toBe('hvc1.4.10.L30.9D.A8');
      expect(manifest.variants[0].audio.codecs).toBe('ec-3');
    });

    it('reads AVC and AAC parameters', async () => {
      const manifest = await startWithAsset('avc-aac-srt.mkv');
      expect(manifest.variants[0].video.codecs).toBe('avc1.4d400a');
      expect(manifest.variants[0].audio.codecs).toBe('mp4a.40.2');
    });
  });

  describe('segments', () => {
    it('makes a reference for each keyframe of the video', async () => {
      const manifest = await startMultitrack();
      const video = manifest.variants[0].video;
      await video.createSegmentIndex();
      const references = getReferences(video);
      // A keyframe every 1.5 seconds, for the 4.5 the file lasts.
      expect(references.map((reference) => reference.startTime)).toEqual(
          [0, 1.5]);
      expect(references[0].endTime).toBe(1.5);
      expect(references[1].endTime).toBeCloseTo(4.5, 3);
    });

    it('makes the ranges follow each other', async () => {
      const manifest = await startMultitrack();
      const video = manifest.variants[0].video;
      await video.createSegmentIndex();
      const references = getReferences(video);
      const header = MatroskaIndexParser.parseHeader(multitrack.subarray(
          0, 8192));
      expect(references[0].getStartByte()).toBe(header.firstClusterOffset);
      expect(references[0].getEndByte()).toBe(
          references[1].getStartByte() - 1);
      // The last one stops before the Cues, which it has no use for.
      expect(references[1].getEndByte()).toBe(
          /** @type {number} */(header.cuesOffset) - 1);
    });

    it('gives the audio the ranges of the video', async () => {
      const manifest = await startMultitrack();
      const video = manifest.variants[0].video;
      const audio = manifest.variants[0].audio;
      await video.createSegmentIndex();
      await audio.createSegmentIndex();
      const videoRanges = getReferences(video).map((reference) => {
        return [reference.getStartByte(), reference.getEndByte()];
      });
      const audioRanges = getReferences(audio).map((reference) => {
        return [reference.getStartByte(), reference.getEndByte()];
      });
      expect(audioRanges).toEqual(videoRanges);
    });

    it('moves the audio and the video, but not the text', async () => {
      const manifest = await startMultitrack();
      const shift = shaka.mkv.MatroskaConstants.MEDIA_TIME_SHIFT;
      for (const stream of [manifest.variants[0].video,
        manifest.variants[0].audio]) {
        // eslint-disable-next-line no-await-in-loop
        await stream.createSegmentIndex();
        expect(stream.segmentIndex.earliestReference().timestampOffset)
            .toBe(-shift);
      }
      const text = manifest.textStreams[0];
      await text.createSegmentIndex();
      expect(text.segmentIndex.earliestReference().timestampOffset).toBe(0);
    });

    for (const rawSupported of [false, true]) {
      // eslint-disable-next-line @stylistic/max-len
      it('positions MP3 segments with raw support ' + rawSupported, async () => {
        spyOn(shaka.media.Capabilities, 'isTypeSupported')
            .and.callFake((type) => type == 'audio/mpeg' && rawSupported);
        const manifest = await startMultitrack();
        const stream = manifest.variants.find((v) => v.audio.codecs == 'mp3')
            .audio;
        await stream.createSegmentIndex();
        const references = getReferences(stream);
        expect(references.length).toBeGreaterThan(1);
        for (const reference of references) {
          expect(reference.timestampOffset).toBe(rawSupported ?
              // eslint-disable-next-line @stylistic/max-len
              reference.startTime : -shaka.mkv.MatroskaConstants.MEDIA_TIME_SHIFT);
        }
      });
    }

    it('can create the index again after it is closed', async () => {
      const manifest = await startMultitrack();
      const video = manifest.variants[0].video;
      await video.createSegmentIndex();
      video.closeSegmentIndex();
      expect(video.segmentIndex).toBe(null);
      await video.createSegmentIndex();
      expect(video.segmentIndex.earliestReference()).not.toBe(null);
    });
  });

  describe('initialization segments', () => {
    it('ends each at the end of the track entry', async () => {
      const manifest = await startMultitrack();
      const header = MatroskaIndexParser.parseHeader(multitrack.subarray(
          0, 8192));
      const streams = [manifest.variants[0].video,
        ...manifest.variants.map((variant) => variant.audio),
        ...manifest.textStreams];
      for (const stream of streams) {
        // eslint-disable-next-line no-await-in-loop
        await stream.createSegmentIndex();
        const init = stream.segmentIndex.earliestReference()
            .initSegmentReference;
        const track = /** @type {!shaka.mkv.MatroskaIndexParser.Track} */(
          header.tracks.find((entry) => {
            return String(entry.number) == stream.originalId;
          }));
        expect(init.getStartByte()).toBe(0);
        expect(init.getEndByte()).toBe(
            MatroskaIndexParser.getInitEndOffset(header, track));
      }
    });

    it('is a different range for each track', async () => {
      const manifest = await startMultitrack();
      const streams = [manifest.variants[0].video,
        ...manifest.variants.map((variant) => variant.audio),
        ...manifest.textStreams];
      const ends = new Set();
      for (const stream of streams) {
        // eslint-disable-next-line no-await-in-loop
        await stream.createSegmentIndex();
        ends.add(stream.segmentIndex.earliestReference()
            .initSegmentReference.getEndByte());
      }
      // The StreamingEngine appends the initialization segment again when it
      // is not the last one, which is how the transmuxer learns of a switch.
      expect(ends.size).toBe(streams.length);
    });
  });

  describe('text', () => {
    it('has a stream for each subtitle track', async () => {
      const manifest = await startMultitrack();
      expect(manifest.textStreams.length).toBe(2);
      const [english, spanish] = manifest.textStreams;
      expect(english.type).toBe('text');
      expect(english.language).toBe('en');
      expect(english.kind).toBe('subtitle');
      expect(english.forced).toBe(false);
      expect(english.label).toBe(null);
      expect(spanish.language).toBe('es');
      expect(spanish.forced).toBe(true);
      expect(spanish.label).toBe('Forzados');
    });

    it('has a stream for ASS subtitles', async () => {
      const manifest = await startWithAsset('ass-styles.mkv');
      expect(manifest.textStreams.length).toBe(1);
      const text = manifest.textStreams[0];
      expect(text.mimeType).toBe('text/x-matroska');
      expect(text.codecs).toBe('ass');
      expect(shaka.text.TextEngine.isTypeSupported(
          shaka.util.MimeUtils.getFullType(text.mimeType, text.codecs)))
          .toBe(true);
    });

    it('is read by the parser of the container', async () => {
      const manifest = await startMultitrack();
      const text = manifest.textStreams[0];
      expect(text.mimeType).toBe('text/x-matroska');
      expect(text.codecs).toBe('srt');
      expect(shaka.text.TextEngine.isTypeSupported(
          shaka.util.MimeUtils.getFullType(text.mimeType, text.codecs)))
          .toBe(true);
    });

    it('does not wait for a timestamp offset', async () => {
      const manifest = await startMultitrack();
      expect(manifest.textStreams[0].external).toBe(true);
    });
  });

  describe('Dolby Vision', () => {
    const hvcC = new Uint8Array([
      1, 0x02, 0x20, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 120,
    ]);
    const offset = shaka.mkv.MatroskaConstants.ALTERNATE_STREAM_ID_OFFSET;

    /**
     * @param {number} profile
     * @param {number} compatibility
     * @param {boolean=} hasEnhancementLayer
     * @return {!Uint8Array}
     */
    const makeFile = (profile, compatibility, hasEnhancementLayer = false) => {
      const record = new Uint8Array(24);
      record.set([1, 0, profile << 1,
        (3 << 3) | 0x05 | (hasEnhancementLayer ? 2 : 0),
        compatibility << 4]);
      const ElementId = shaka.mkv.ElementId;
      return Matroska.makeIndexedFile(1,
          Matroska.trackEntry(1, TrackType.VIDEO, CodecId.HEVC,
              Matroska.element(ElementId.CODEC_PRIVATE, hvcC),
              Matroska.element(ElementId.BLOCK_ADDITION_MAPPING,
                  Matroska.uint(ElementId.BLOCK_ADD_ID_TYPE,
                      shaka.mkv.BlockAddType.DVVC),
                  Matroska.element(ElementId.BLOCK_ADD_ID_EXTRA_DATA,
                      record))),
          Matroska.trackEntry(2, TrackType.AUDIO, CodecId.OPUS));
    };

    /**
     * @param {!Uint8Array} bytes
     * @return {!Promise<shaka.extern.Manifest>}
     */
    const start = (bytes) => {
      file.bytes = bytes;
      return parser.start(multitrackUri, makePlayerInterface());
    };

    it('has a stream for each codec, as HLS and DASH do', async () => {
      const manifest = await start(makeFile(8, 1));
      const videos = manifest.variants.map((variant) => variant.video);
      // Two variants for the audio, and the plain codec comes first.
      expect(videos.map((video) => video.codecs)).toEqual(
          ['hvc1.2.4.L120.90', 'dvh1.08.03']);
      expect(videos.map((video) => video.id)).toEqual([1, 1 + offset]);
      // Both are the same track.
      expect(videos.map((video) => video.originalId)).toEqual(['1', '1']);
      expect(manifest.variants.map((variant) => variant.audio.originalId))
          .toEqual(['2', '2']);
    });

    it('gives both streams the supplemental codecs', async () => {
      const manifest = await start(makeFile(8, 1));
      for (const variant of manifest.variants) {
        expect(variant.video.supplementalCodecs).toBe('dvh1.08.03');
      }
    });

    it('says what the HDR is', async () => {
      const manifest = await start(makeFile(8, 1));
      for (const variant of manifest.variants) {
        expect(variant.video.hdr).toBe('PQ');
      }
    });

    it('makes the initialization segments differ by one byte', async () => {
      const manifest = await start(makeFile(8, 1));
      const ends = [];
      for (const variant of manifest.variants) {
        // eslint-disable-next-line no-await-in-loop
        await variant.video.createSegmentIndex();
        ends.push(variant.video.segmentIndex.earliestReference()
            .initSegmentReference.getEndByte());
      }
      expect(ends[1]).toBe(ends[0] + 1);
    });

    it('reads the same segments for both', async () => {
      const manifest = await start(makeFile(8, 1));
      const ranges = [];
      for (const variant of manifest.variants) {
        // eslint-disable-next-line no-await-in-loop
        await variant.video.createSegmentIndex();
        const reference = variant.video.segmentIndex.earliestReference();
        ranges.push([reference.getStartByte(), reference.getEndByte()]);
      }
      expect(ranges[1][0]).toBe(ranges[0][0]);
      expect(ranges[1][1]).toBe(ranges[0][1]);
    });

    it('has only the plain stream if supplemental codecs are ignored',
        async () => {
          configure({ignoreSupplementalCodecs: true});
          const manifest = await start(makeFile(8, 1));
          expect(manifest.variants.map((variant) => variant.video.codecs))
              .toEqual(['hvc1.2.4.L120.90']);
          expect(manifest.variants[0].video.supplementalCodecs).toBe('');
        });

    it('has only a Dolby Vision stream for profile 5', async () => {
      const manifest = await start(makeFile(5, 0));
      expect(manifest.variants.length).toBe(1);
      expect(manifest.variants[0].video.codecs).toBe('dvh1.05.03');
      expect(manifest.variants[0].video.id).toBe(1);
    });

    it('has only the plain stream with an enhancement layer', async () => {
      const manifest = await start(makeFile(7, 6, true));
      expect(manifest.variants.length).toBe(1);
      expect(manifest.variants[0].video.codecs).toBe('hvc1.2.4.L120.90');
    });
  });

  describe('configuration', () => {
    it('leaves out the video', async () => {
      configure({disableVideo: true});
      const manifest = await startMultitrack();
      expect(manifest.variants.length).toBe(7);
      for (const variant of manifest.variants) {
        expect(variant.video).toBe(null);
        expect(variant.audio).not.toBe(null);
      }
    });

    it('leaves out the audio', async () => {
      configure({disableAudio: true});
      const manifest = await startMultitrack();
      expect(manifest.variants.length).toBe(1);
      expect(manifest.variants[0].audio).toBe(null);
      expect(manifest.variants[0].video).not.toBe(null);
    });

    it('leaves out the text', async () => {
      configure({disableText: true});
      const manifest = await startMultitrack();
      expect(manifest.textStreams).toEqual([]);
    });

    /**
     * @return {!Array<string>} The ranges that have been requested.
     */
    const getRanges = () => {
      return network.request.calls.allArgs().map((args) => {
        return args[1].headers['Range'];
      });
    };

    it('does not read the chapters when they are disabled', async () => {
      const bytes = await Matroska.fetchAsset('avc-aac-srt.mkv');
      const header = MatroskaIndexParser.parseHeader(bytes.subarray(0, 8192));
      const start = `bytes=${header.chaptersOffset}-`;

      configure({disableChapters: true});
      await startWithAsset('avc-aac-srt.mkv');
      expect(getRanges().some((range) => range.startsWith(start)))
          .toBe(false);
      await parser.stop();

      parser = new shaka.mkv.MatroskaParser();
      network.request.calls.reset();
      configure({disableChapters: false});
      await parser.start(file.uri, makePlayerInterface());
      expect(getRanges().some((range) => range.startsWith(start))).toBe(true);
    });
  });

  describe('chapters', () => {
    it('exposes them with their titles', async () => {
      const manifest = await startWithAsset('avc-aac-srt.mkv');
      expect(manifest.chapterStreams.length).toBe(1);
      const stream = manifest.chapterStreams[0];
      await stream.createSegmentIndex();
      const first = stream.segmentIndex.get(0);
      const second = stream.segmentIndex.get(1);
      expect(first.getMetadata().title).toBe('Opening');
      expect(second.getMetadata().title).toBe('Ending');
      expect(first.startTime).toBe(0);
      expect(second.startTime).toBe(2);
    });

    it('gives them identifiers that no track has', async () => {
      const manifest = await startWithAsset('avc-aac-srt.mkv');
      const ids = new Set(manifest.variants.flatMap((variant) => {
        return [variant.video.id, variant.audio.id];
      }));
      expect(ids.has(manifest.chapterStreams[0].id)).toBe(false);
    });
  });

  describe('requests', () => {
    it('reads the header, and the Cues, in ranges', async () => {
      await startWithAsset('index.mkv');
      // The header, the VP9 probe... but the media only once, and never all
      // of the file.
      const ranges = network.request.calls.allArgs().map((args) => {
        return args[1].headers['Range'];
      });
      expect(ranges[0]).toBe('bytes=0-65535');
      for (const range of ranges) {
        expect(range).toMatch(/^bytes=\d+-\d+$/);
      }
    });

    it('asks for the Cues with the length their header gives', async () => {
      await startMultitrack();
      const header = MatroskaIndexParser.parseHeader(multitrack.subarray(
          0, 8192));
      const start = /** @type {number} */(header.cuesOffset);
      const ranges = network.request.calls.allArgs().map((args) => {
        return args[1].headers['Range'];
      });
      expect(ranges).toContain(`bytes=${start}-${start + 15}`);
      expect(ranges).toContain(`bytes=${start}-${multitrack.length - 1}`);
    });
  });

  describe('errors', () => {
    /**
     * @param {!Promise} promise
     * @return {!Promise<shaka.util.Error>}
     */
    const getError = (promise) => promise.then(fail, (error) => error);

    it('rejects a file that is not Matroska', async () => {
      file.bytes = new Uint8Array(70000).fill(1);
      const error = await getError(
          parser.start(multitrackUri, makePlayerInterface()));
      expect(error.code).toBe(shaka.util.Error.Code.MKV_INVALID_FILE);
      expect(error.category).toBe(shaka.util.Error.Category.MANIFEST);
      // The URI is in the error.
      expect(error.data).toEqual([multitrackUri]);
    });

    it('rejects a file without an index', async () => {
      // A file that has tracks that can be played, but no Cues.
      const track = Matroska.trackEntry(1, TrackType.AUDIO, CodecId.OPUS);
      file.bytes = Matroska.makeFile(track);
      const error = await getError(
          parser.start(multitrackUri, makePlayerInterface()));
      expect(error.code).toBe(shaka.util.Error.Code.MKV_MISSING_INDEX);
      expect(error.data).toEqual([multitrackUri]);
    });

    it('rejects a file without a track that can be played', async () => {
      file.bytes = Matroska.makeFile(
          Matroska.trackEntry(1, TrackType.AUDIO, 'A_DTS'),
          Matroska.trackEntry(2, TrackType.VIDEO, 'V_MPEG2'));
      const error = await getError(
          parser.start(multitrackUri, makePlayerInterface()));
      expect(error.code).toBe(shaka.util.Error.Code.MKV_NO_SUPPORTED_TRACKS);
      expect(error.data).toEqual([multitrackUri]);
    });

    it('rejects two tracks with the same number', async () => {
      file.bytes = Matroska.makeFile(
          Matroska.trackEntry(1, TrackType.AUDIO, CodecId.OPUS),
          Matroska.trackEntry(1, TrackType.AUDIO, CodecId.OPUS));
      const error = await getError(
          parser.start(multitrackUri, makePlayerInterface()));
      expect(error.code).toBe(shaka.util.Error.Code.MKV_INVALID_FILE);
    });

    it('rejects a server that ignores the range', async () => {
      network.request.and.callFake((type, request) => {
        /** @type {shaka.extern.Response} */
        const response = {
          uri: multitrackUri,
          originalUri: multitrackUri,
          // The whole file, whatever was asked for.
          data: multitrack,
          headers: {},
          originalRequest: request,
        };
        return shaka.util.AbortableOperation.completed(response);
      });
      const error = await getError(
          parser.start(multitrackUri, makePlayerInterface()));
      expect(error.code).toBe(shaka.util.Error.Code.MKV_INVALID_FILE);
    });

    it('is aborted by stop()', async () => {
      await parser.stop();
      const error = await getError(
          parser.start(multitrackUri, makePlayerInterface()));
      expect(error.code).toBe(shaka.util.Error.Code.OPERATION_ABORTED);
    });
  });

  describe('registration', () => {
    it('claims the MIME types of Matroska', () => {
      for (const mimeType of ['video/x-matroska', 'video/matroska',
        'audio/x-matroska', 'audio/matroska']) {
        expect(shaka.media.ManifestParser.getFactory(
            'https://example.com/file', mimeType)).toBeDefined();
      }
    });

    it('claims the extensions of Matroska', () => {
      const getMimeType = (uri) => {
        return shaka.net.NetworkingUtils.getMimeTypeFromUri(uri);
      };
      expect(getMimeType('https://example.com/video.mkv'))
          .toBe('video/x-matroska');
      expect(getMimeType('https://example.com/video.mk3d'))
          .toBe('video/x-matroska');
      expect(getMimeType('https://example.com/audio.mka'))
          .toBe('audio/x-matroska');
    });

    it('leaves WebM to the browser', () => {
      expect(shaka.net.NetworkingUtils.getMimeTypeFromUri('a.webm'))
          .toBe('video/webm');
    });
  });
});
