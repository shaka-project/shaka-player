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
  /** @type {!ArrayBuffer} */
  let ceaInitSegment;


  beforeAll(async () => {
    [
      ceaInitSegment,
    ] = await Promise.all([
      shaka.test.Util.fetch(ceaInitSegmentUri),
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
   * @return {Map<number, shaka.extern.ICaptionDecoder>}
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
