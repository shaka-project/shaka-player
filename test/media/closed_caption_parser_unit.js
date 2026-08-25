/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This uses a lot of private variable access, so, suppress that error
 */
describe('ClosedCaptionParser', () => {
  const ceaInitSegmentUri = '/base/test/test/assets/cea-init.mp4';
  // MP4 H.264 stream carrying CEA-608 captions inside ITU-T T.35 SEI messages.
  const ceaSegmentUri = '/base/test/test/assets/cea-segment.mp4';
  // MP4 stream with a dedicated CEA-608 caption track (raw `c608` byte pairs).
  const cea608TrackInitSegmentUri =
      '/base/test/test/assets/cea608-track-init.mp4';
  const cea608TrackSegmentUri =
      '/base/test/test/assets/cea608-track-segment.mp4';
  // MPEG-TS stream carrying both CEA-608 and CEA-708 captions in video SEI.
  const tsCaptionsUri = '/base/test/test/assets/captions-test.ts';

  /** @type {!ArrayBuffer} */
  let ceaInitSegment;
  /** @type {!ArrayBuffer} */
  let ceaSegment;
  /** @type {!ArrayBuffer} */
  let cea608TrackInitSegment;
  /** @type {!ArrayBuffer} */
  let cea608TrackSegment;
  /** @type {!ArrayBuffer} */
  let tsCaptions;


  beforeAll(async () => {
    [
      ceaInitSegment,
      ceaSegment,
      cea608TrackInitSegment,
      cea608TrackSegment,
      tsCaptions,
    ] = await Promise.all([
      shaka.test.Util.fetch(ceaInitSegmentUri),
      shaka.test.Util.fetch(ceaSegmentUri),
      shaka.test.Util.fetch(cea608TrackInitSegmentUri),
      shaka.test.Util.fetch(cea608TrackSegmentUri),
      shaka.test.Util.fetch(tsCaptionsUri),
    ]);
  });

  /**
   * @suppress {visibility}
   * @param {shaka.media.ClosedCaptionParser} parser
   * @return {shaka.extern.ICaptionDecoder}
   */
  function getDecoder(parser) {
    return parser.ceaDecoder_;
  }

  /**
   * @suppress {visibility}
   * @param {shaka.media.ClosedCaptionParser} parser
   * @return {!Map<number, !shaka.extern.ICaptionDecoder>}
   */
  function getDecoderCache(parser) {
    return parser.decoderCache_;
  }

  /**
   * @suppress {visibility}
   * @param {shaka.media.ClosedCaptionParser} parser
   * @return {number}
   */
  function getCurrentContinuityTimeline(parser) {
    return parser.currentContinuityTimeline_;
  }

  /**
   * @suppress {visibility}
   * @param {shaka.media.ClosedCaptionParser} parser
   * @param {number} continuityTimeline
   */
  function updateDecoder(parser, continuityTimeline) {
    parser.updateDecoder_(continuityTimeline);
  }

  it('can handle empty caption packets', async () => {
    const initSegment = await shaka.test.Util.fetch(
        'base/test/test/assets/empty_caption_video_init.mp4');
    const videoSegment = await shaka.test.Util.fetch(
        'base/test/test/assets/empty_caption_video_segment.mp4');
    const mimeType = 'video/mp4';
    const parser = new shaka.media.ClosedCaptionParser(mimeType);
    parser.init(initSegment);
    parser.parseFrom(videoSegment);
  });

  it('creates an mp4 cea decoder when created', () => {
    const mimeType = 'video/mp4';
    const parser = new shaka.media.ClosedCaptionParser(mimeType);

    expect(getDecoder(parser)).toBeInstanceOf(shaka.cea.CeaDecoder);
    expect(getDecoderCache(parser).size).toBe(1);
  });

  it('calls reset if init is called and it is not an adaptation ' +
  'and not a new timeline', () => {
    const mimeType = 'video/mp4';
    const parser = new shaka.media.ClosedCaptionParser(mimeType);
    const resetSpy = spyOn(parser, 'reset');

    expect(getDecoder(parser)).toBeInstanceOf(shaka.cea.CeaDecoder);
    expect(getDecoderCache(parser).size).toBe(1);

    parser.init(ceaInitSegment);

    expect(resetSpy).toHaveBeenCalled();
  });

  it('does not call reset if init is called and it is an adaptation ' +
  'and not a new timeline', () => {
    const mimeType = 'video/mp4';
    const parser = new shaka.media.ClosedCaptionParser(mimeType);
    const resetSpy = spyOn(parser, 'reset');
    const updateDecoderSpy = spyOn(parser, 'updateDecoder_');

    expect(getDecoder(parser)).toBeInstanceOf(shaka.cea.CeaDecoder);
    expect(getDecoderCache(parser).size).toBe(1);

    parser.init(ceaInitSegment, true);

    expect(resetSpy).not.toHaveBeenCalled();
    expect(updateDecoderSpy).not.toHaveBeenCalled();
  });

  it('does not call reset if init is called and it is an adaptation ' +
  'and explicitly the current timeline', () => {
    const mimeType = 'video/mp4';
    const parser = new shaka.media.ClosedCaptionParser(mimeType);
    const resetSpy = spyOn(parser, 'reset');
    const updateDecoderSpy = spyOn(parser, 'updateDecoder_');

    expect(getDecoder(parser)).toBeInstanceOf(shaka.cea.CeaDecoder);
    expect(getDecoderCache(parser).size).toBe(1);

    parser.init(ceaInitSegment, true, getCurrentContinuityTimeline(parser));

    expect(resetSpy).not.toHaveBeenCalled();
    expect(updateDecoderSpy).not.toHaveBeenCalled();
    expect(getCurrentContinuityTimeline(parser)).toBe(0);
  });

  it('does not call reset if init is called and it is not adaptation ' +
  'but it is a new timeline', () => {
    const mimeType = 'video/mp4';
    const parser = new shaka.media.ClosedCaptionParser(mimeType);
    const resetSpy = spyOn(parser, 'reset');
    const updateDecoderSpy = spyOn(parser, 'updateDecoder_');

    expect(getDecoder(parser)).toBeInstanceOf(shaka.cea.CeaDecoder);
    expect(getDecoderCache(parser).size).toBe(1);

    parser.init(ceaInitSegment, false, 1);

    expect(resetSpy).not.toHaveBeenCalled();
    expect(updateDecoderSpy).toHaveBeenCalledWith(1);
    expect(getCurrentContinuityTimeline(parser)).toBe(1);
  });

  describe('updateDecoder_', () => {
    it('re-uses existing decoder if one is available', () => {
      const mimeType = 'video/mp4';
      const parser = new shaka.media.ClosedCaptionParser(mimeType);
      const ceaDecoderBefore = getDecoder(parser);

      updateDecoder(parser, getCurrentContinuityTimeline(parser));

      expect(getDecoder(parser)).toBe(ceaDecoderBefore);
      expect(getDecoderCache(parser).size).toBe(1);
    });

    it('creates a new decoder for the new continuity timeline', () => {
      const mimeType = 'video/mp4';
      const parser = new shaka.media.ClosedCaptionParser(mimeType);
      const ceaDecoderBefore = getDecoder(parser);

      updateDecoder(parser, getCurrentContinuityTimeline(parser) + 1);

      expect(getDecoder(parser)).not.toBe(ceaDecoderBefore);
      expect(getDecoderCache(parser).size).toBe(2);
    });

    it('re-uses existing decoder if one is available and ' +
    'it is not the current continuityTimeline', () => {
      const mimeType = 'video/mp4';
      const parser = new shaka.media.ClosedCaptionParser(mimeType);
      const ceaDecoderBefore = getDecoder(parser);
      const customDecoder = new shaka.cea.DummyCaptionDecoder();

      getDecoderCache(parser).set(1, customDecoder);
      updateDecoder(parser, 1);

      expect(getDecoder(parser)).not.toBe(ceaDecoderBefore);
      expect(getDecoder(parser)).toEqual(customDecoder);
      expect(getDecoderCache(parser).size).toBe(2);
    });
  });

  describe('integration', () => {
    /**
     * Asserts the cue-timing invariant from every emitted cue
     * satisfies startTime < endTime, and (per stream) consecutive cues never
     * overlap. This is the end-to-end guard for captions produced by the full
     * parse -> extract -> decode pipeline.
     * @param {!Array<!shaka.extern.ICaptionDecoder.ClosedCaption>} captions
     */
    function expectValidCueTiming(captions) {
      /** @type {!Map<string, number>} */
      const lastEndByStream = new Map();
      for (const caption of captions) {
        const cue = caption.cue;
        // 6.1: a cue must have positive, ordered duration.
        expect(cue.startTime).toBeLessThan(cue.endTime);
        // 6.1: consecutive cues on a single stream must not overlap.
        if (lastEndByStream.has(caption.stream)) {
          expect(cue.startTime)
              .toBeGreaterThanOrEqual(lastEndByStream.get(caption.stream));
        }
        lastEndByStream.set(caption.stream, cue.endTime);
      }
    }

    // MP4 H.264 elementary stream must decode end-to-end and surface their
    // captioning streams via getStreams().
    it('decodes CEA-608 SEI captions from an MP4 H.264 stream', () => {
      const parser = new shaka.media.ClosedCaptionParser('video/mp4');
      parser.init(ceaInitSegment);

      const captions = parser.parseFrom(ceaSegment);

      expectValidCueTiming(captions);
      // This asset carries field-1 (CC1) and field-2 (CC3) caption data.
      const streams = parser.getStreams();
      expect(streams).toContain('CC1');
      expect(streams).toContain('CC3');
    });

    // `c608` byte pairs (the RAW608 packet format) rather than SEI. Exercise
    // the extractRaw608 path through the parser end-to-end.
    it('decodes CEA-608 captions from a raw c608 MP4 track', () => {
      const parser = new shaka.media.ClosedCaptionParser('video/mp4');
      parser.init(cea608TrackInitSegment);

      const captions = parser.parseFrom(cea608TrackSegment);

      expectValidCueTiming(captions);
      // The raw 608 track decodes on field 1 -> CC1.
      expect(parser.getStreams()).toContain('CC1');
    });

    // CEA-708 captions inside video SEI. The TS parser needs no init segment.
    // This drives the CEA-708 service/window decode path (Delay alignment and
    // window selection) end-to-end alongside CEA-608.
    it('decodes CEA-608 and CEA-708 captions from an MPEG-TS stream', () => {
      const parser = new shaka.media.ClosedCaptionParser('video/mp2t');

      const captions = parser.parseFrom(tsCaptions);

      expectValidCueTiming(captions);
      const streams = parser.getStreams();
      // This asset carries CEA-608 (CC1) and one CEA-708 service (svc1).
      expect(streams).toContain('CC1');
      expect(streams).toContain('svc1');
    });

    // timeline. Each decoder keeps its own discovered-stream state, and the
    // cached decoder is restored (not recreated) when we return to a previously
    // seen timeline across a discontinuity.
    it('caches and restores a decoder per continuity timeline', () => {
      const parser = new shaka.media.ClosedCaptionParser('video/mp4');

      // Timeline 0: decode the SEI segment so the decoder discovers CC1/CC3.
      parser.init(ceaInitSegment, /* adaptation= */ false,
          /* continuityTimeline= */ 0);
      parser.parseFrom(ceaSegment);
      const timeline0Decoder = getDecoder(parser);
      expect(parser.getStreams()).toContain('CC1');
      expect(getDecoderCache(parser).size).toBe(1);

      // Discontinuity to timeline 1: a fresh decoder is created and cached, so
      // it has not discovered any streams yet.
      parser.init(ceaInitSegment, /* adaptation= */ false,
          /* continuityTimeline= */ 1);
      const timeline1Decoder = getDecoder(parser);
      expect(timeline1Decoder).not.toBe(timeline0Decoder);
      expect(getDecoderCache(parser).size).toBe(2);
      expect(parser.getStreams()).toEqual([]);

      // Decode on timeline 1 so its decoder independently discovers streams.
      parser.parseFrom(ceaSegment);
      expect(parser.getStreams()).toContain('CC1');

      // Return to timeline 0 across another discontinuity: the original decoder
      // is restored from the cache (not recreated) with its state intact.
      parser.init(ceaInitSegment, /* adaptation= */ false,
          /* continuityTimeline= */ 0);
      expect(getDecoder(parser)).toBe(timeline0Decoder);
      expect(getDecoderCache(parser).size).toBe(2);
      expect(parser.getStreams()).toContain('CC1');
      expect(parser.getStreams()).toContain('CC3');
    });
  });

  describe('remove', () => {
    it('will clear decoder cache according to provided continuity timelines',
        () => {
          const mimeType = 'video/mp4';
          const parser = new shaka.media.ClosedCaptionParser(mimeType);
          const decoderCache = getDecoderCache(parser);

          decoderCache.set(1, new shaka.cea.DummyCaptionDecoder());
          decoderCache.set(2, new shaka.cea.DummyCaptionDecoder());
          decoderCache.set(3, new shaka.cea.DummyCaptionDecoder());
          decoderCache.set(4, new shaka.cea.DummyCaptionDecoder());
          decoderCache.set(5, new shaka.cea.DummyCaptionDecoder());

          expect(decoderCache.size).toBe(6);
          expect(Array.from(decoderCache.keys())).toEqual([0, 1, 2, 3, 4, 5]);

          parser.remove([0, 1, 2]);

          expect(decoderCache.size).toBe(3);
          expect(Array.from(decoderCache.keys())).toEqual([0, 1, 2]);
        });
  });
});
