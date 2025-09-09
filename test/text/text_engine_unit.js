/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TextEngine', () => {
  const TextEngine = shaka.text.TextEngine;

  const dummyData = new Uint8Array(0);
  const dummyMimeType = 'text/fake';

  /** @type {!Function} */
  let mockParserPlugIn;

  /** @type {!shaka.test.FakeTextDisplayer} */
  let mockDisplayer;

  /** @type {!jasmine.Spy} */
  let mockParseInit;

  /** @type {!jasmine.Spy} */
  let mockSetSequenceMode;

  /** @type {!jasmine.Spy} */
  let mockParseMedia;

  /** @type {!shaka.text.TextEngine} */
  let textEngine;

  beforeEach(() => {
    mockParseInit = jasmine.createSpy('mockParseInit');
    mockSetSequenceMode = jasmine.createSpy('mockSetSequenceMode');
    mockParseMedia = jasmine.createSpy('mockParseMedia');
    // eslint-disable-next-line no-restricted-syntax
    mockParserPlugIn = function() {
      return {
        parseInit: mockParseInit,
        setSequenceMode: mockSetSequenceMode,
        parseMedia: mockParseMedia,
      };
    };

    mockDisplayer = new shaka.test.FakeTextDisplayer();
    mockDisplayer.removeSpy.and.returnValue(true);

    TextEngine.registerParser(dummyMimeType, mockParserPlugIn);
    textEngine = new TextEngine(mockDisplayer);
    textEngine.initParser(
        dummyMimeType,
        /* sequenceMode= */ false,
        /* segmentRelativeVttTiming= */ false,
        shaka.media.ManifestParser.UNKNOWN);
  });

  afterEach(() => {
    TextEngine.unregisterParser(dummyMimeType);
  });

  describe('isTypeSupported', () => {
    it('reports support only when a parser is installed', () => {
      TextEngine.unregisterParser(dummyMimeType);
      expect(TextEngine.isTypeSupported(dummyMimeType)).toBe(false);
      TextEngine.registerParser(dummyMimeType, mockParserPlugIn);
      expect(TextEngine.isTypeSupported(dummyMimeType)).toBe(true);
      TextEngine.unregisterParser(dummyMimeType);
      expect(TextEngine.isTypeSupported(dummyMimeType)).toBe(false);
    });

    it('reports support for closed captions if decoder is installed', () => {
      const originalFind = shaka.media.ClosedCaptionParser.findDecoder;
      const mockFind = jasmine.createSpy('findDecoder').and.returnValue(null);
      shaka.media.ClosedCaptionParser.findDecoder =
          shaka.test.Util.spyFunc(mockFind);
      // Both CEA-608 and CEA-708 is supported by our closed caption parser.
      expect(TextEngine.isTypeSupported(
          shaka.util.MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE)).toBe(false);
      expect(TextEngine.isTypeSupported(
          shaka.util.MimeUtils.CEA708_CLOSED_CAPTION_MIMETYPE)).toBe(false);

      shaka.media.ClosedCaptionParser.findDecoder = originalFind;
      expect(TextEngine.isTypeSupported(
          shaka.util.MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE)).toBe(true);
      expect(TextEngine.isTypeSupported(
          shaka.util.MimeUtils.CEA708_CLOSED_CAPTION_MIMETYPE)).toBe(true);
    });
  });

  describe('appendBuffer', () => {
    it('works asynchronously', async () => {
      mockParseMedia.and.returnValue([1, 2, 3]);
      const p = textEngine.appendBuffer(dummyData, 0, 3);
      expect(mockDisplayer.appendSpy).not.toHaveBeenCalled();
      await p;
    });

    it('calls displayer.append()', async () => {
      const cue1 = createFakeCue(1, 2);
      const cue2 = createFakeCue(2, 3);
      const cue3 = createFakeCue(3, 4);
      const cue4 = createFakeCue(4, 5);
      mockParseMedia.and.returnValue([cue1, cue2]);

      await textEngine.appendBuffer(dummyData, 0, 3);
      expect(mockParseMedia).toHaveBeenCalledOnceMoreWith([
        dummyData,
        {periodStart: 0, segmentStart: 0, segmentEnd: 3, vttOffset: 0},
        undefined,
        [],
      ]);

      expect(mockDisplayer.appendSpy).toHaveBeenCalledOnceMoreWith([
        [cue1, cue2],
      ]);

      expect(mockDisplayer.removeSpy).not.toHaveBeenCalled();

      mockParseMedia.and.returnValue([cue3, cue4]);

      await textEngine.appendBuffer(dummyData, 3, 5);

      expect(mockParseMedia).toHaveBeenCalledOnceMoreWith([
        dummyData,
        {periodStart: 0, segmentStart: 3, segmentEnd: 5, vttOffset: 0},
        undefined,
        [],
      ]);

      expect(mockDisplayer.appendSpy).toHaveBeenCalledOnceMoreWith([
        [cue3, cue4],
      ]);
    });

    it('does not throw if called right before destroy', async () => {
      mockParseMedia.and.returnValue([1, 2, 3]);
      const p = textEngine.appendBuffer(dummyData, 0, 3);
      textEngine.destroy();
      await p;
    });

    it('calls modifyCueCallback', async () => {
      const cue1 = createFakeCue(0, 1);
      const cue2 = createFakeCue(1, 2);
      const modifyCueCallback = jasmine.createSpy('modifyCueCallback');
      textEngine.setModifyCueCallback(
          shaka.test.Util.spyFunc(modifyCueCallback));
      mockParseMedia.and.returnValue([cue1, cue2]);
      await textEngine.appendBuffer(dummyData, 0, 3, 'uri');
      expect(modifyCueCallback).toHaveBeenCalledWith(
          cue1, 'uri', jasmine.objectContaining({periodStart: 0}));
      expect(modifyCueCallback).toHaveBeenCalledWith(
          cue2, 'uri', jasmine.objectContaining({periodStart: 0}));
    });
  });

  describe('storeAndAppendClosedCaptions', () => {
    it('appends closed captions with selected id', () => {
      const startTime = 0;
      const endTime = 1;
      const text = 'captions';
      const caption = {
        cue: new shaka.text.Cue(startTime, endTime, text),
        stream: 'CC1',
      };

      textEngine.setSelectedClosedCaptionId('CC1', 0);
      textEngine.storeAndAppendClosedCaptions([caption], /* offset= */ 0);
      expect(mockDisplayer.appendSpy).toHaveBeenCalled();
    });

    it('does not append closed captions without selected id', () => {
      const startTime = 1;
      const endTime = 2;
      const text = 'caption2';
      const caption = {
        cue: new shaka.text.Cue(startTime, endTime, text),
        stream: 'CC1',
      };

      textEngine.setSelectedClosedCaptionId('CC3', 0);
      textEngine.storeAndAppendClosedCaptions([caption], /* offset= */ 0);
      expect(mockDisplayer.appendSpy).not.toHaveBeenCalled();
    });

    it('stores closed captions', () => {
      const caption0 = {
        cue: new shaka.text.Cue(0, 1, 'caption1'),
        stream: 'CC1',
      };
      const caption1 = {
        cue: new shaka.text.Cue(1, 2, 'caption2'),
        stream: 'CC1',
      };
      const caption2 = {
        cue: new shaka.text.Cue(1, 2, 'caption3'),
        stream: 'CC3',
      };

      textEngine.setSelectedClosedCaptionId('CC1', 0);
      // Text Engine stores all the closed captions as a two layer map.
      // {closed caption id -> {start and end time -> cues}}
      textEngine.storeAndAppendClosedCaptions([caption0], /* offset= */ 0);
      expect(textEngine.getNumberOfClosedCaptionChannels()).toBe(1);
      expect(textEngine.getNumberOfClosedCaptionsInChannel('CC1')).toBe(1);

      textEngine.storeAndAppendClosedCaptions([caption1], /* offset= */ 0);
      // Caption1 has the same stream id with caption0, but different start and
      // end time. The closed captions map should have 1 key CC1, and two values
      // for two start and end times.
      expect(textEngine.getNumberOfClosedCaptionChannels()).toBe(1);
      expect(textEngine.getNumberOfClosedCaptionsInChannel('CC1')).toBe(2);

      textEngine.storeAndAppendClosedCaptions([caption2], /* offset= */ 0);
      // Caption2 has a different stream id CC3, so the closed captions map
      // should have two different keys, CC1 and CC3.
      expect(textEngine.getNumberOfClosedCaptionChannels()).toBe(2);
    });

    it('offsets closed captions to account for video offset', () => {
      const startTime = 0;
      const endTime = 1;
      const text = 'captions';
      const caption = {
        cue: new shaka.text.Cue(startTime, endTime, text),
        stream: 'CC1',
      };

      textEngine.setSelectedClosedCaptionId('CC1', 0);
      textEngine.storeAndAppendClosedCaptions([caption], /* offset= */ 1000);
      expect(mockDisplayer.appendSpy).toHaveBeenCalledWith([
        jasmine.objectContaining({
          startTime: 1000,
          endTime: 1001,
        }),
      ]);
    });
  });


  describe('remove', () => {
    let cue1;
    let cue2;
    let cue3;

    beforeEach(() => {
      cue1 = createFakeCue(0, 1);
      cue2 = createFakeCue(1, 2);
      cue3 = createFakeCue(2, 3);
      mockParseMedia.and.returnValue([cue1, cue2, cue3]);
    });

    it('works asynchronously', async () => {
      await textEngine.appendBuffer(dummyData, 0, 3);
      const p = textEngine.remove(0, 1);
      expect(mockDisplayer.removeSpy).not.toHaveBeenCalled();
      await p;
    });

    it('calls displayer.remove()', async () => {
      await textEngine.remove(0, 1);
      expect(mockDisplayer.removeSpy).toHaveBeenCalledWith(0, 1);
    });

    it('does not throw if called right before destroy', async () => {
      const p = textEngine.remove(0, 1);
      textEngine.destroy();
      await p;
    });
  });

  describe('setTimestampOffset', () => {
    it('passes the offset to the parser', async () => {
      mockParseMedia.and.callFake((data, time) => {
        return [
          createFakeCue(time.periodStart + 0,
              time.periodStart + 1),
          createFakeCue(time.periodStart + 2,
              time.periodStart + 3),
        ];
      });

      await textEngine.appendBuffer(dummyData, 0, 3);

      expect(mockParseMedia).toHaveBeenCalledOnceMoreWith([
        dummyData,
        {periodStart: 0, segmentStart: 0, segmentEnd: 3, vttOffset: 0},
        undefined,
        [],
      ]);
      expect(mockDisplayer.appendSpy).toHaveBeenCalledOnceMoreWith([
        [
          createFakeCue(0, 1),
          createFakeCue(2, 3),
        ],
      ]);

      textEngine.setTimestampOffset(4);
      await textEngine.appendBuffer(dummyData, 4, 7);

      expect(mockParseMedia).toHaveBeenCalledOnceMoreWith([
        dummyData,
        {periodStart: 4, segmentStart: 4, segmentEnd: 7, vttOffset: 4},
        undefined,
        [],
      ]);
      expect(mockDisplayer.appendSpy).toHaveBeenCalledOnceMoreWith([
        [
          createFakeCue(4, 5),
          createFakeCue(6, 7),
        ],
      ]);
    });

    it('vttOffset when segmentRelativeVttTiming is set', async () => {
      textEngine.initParser(
          dummyMimeType,
          /* sequenceMode= */ false,
          /* segmentRelativeVttTiming= */ true,
          shaka.media.ManifestParser.UNKNOWN);

      mockParseMedia.and.callFake((data, time) => {
        return [
          createFakeCue(time.periodStart + 0,
              time.periodStart + 1),
          createFakeCue(time.periodStart + 2,
              time.periodStart + 3),
        ];
      });

      await textEngine.appendBuffer(dummyData, 0, 3);

      expect(mockParseMedia).toHaveBeenCalledOnceMoreWith([
        dummyData,
        {periodStart: 0, segmentStart: 0, segmentEnd: 3, vttOffset: 0},
        undefined,
        [],
      ]);

      textEngine.setTimestampOffset(8);
      await textEngine.appendBuffer(dummyData, 4, 7);

      // vttOffset should equal segmentStart instead of periodStart
      expect(mockParseMedia).toHaveBeenCalledOnceMoreWith([
        dummyData,
        {periodStart: 8, segmentStart: 4, segmentEnd: 7, vttOffset: 4},
        undefined,
        [],
      ]);
    });
  });

  describe('bufferStart/bufferEnd', () => {
    beforeEach(() => {
      mockParseMedia.and.callFake(() => {
        return [createFakeCue(0, 1), createFakeCue(1, 2), createFakeCue(2, 3)];
      });
    });

    it('return null when there are no cues', () => {
      expect(textEngine.bufferStart()).toBe(null);
      expect(textEngine.bufferEnd()).toBe(null);
    });

    it('reflect newly-added cues', async () => {
      await textEngine.appendBuffer(dummyData, 0, 3);
      expect(textEngine.bufferStart()).toBe(0);
      expect(textEngine.bufferEnd()).toBe(3);

      await textEngine.appendBuffer(dummyData, 3, 6);
      expect(textEngine.bufferStart()).toBe(0);
      expect(textEngine.bufferEnd()).toBe(6);

      await textEngine.appendBuffer(dummyData, 6, 10);
      expect(textEngine.bufferStart()).toBe(0);
      expect(textEngine.bufferEnd()).toBe(10);
    });

    it('reflect newly-removed cues', async () => {
      await textEngine.appendBuffer(dummyData, 0, 3);
      await textEngine.appendBuffer(dummyData, 3, 6);
      await textEngine.appendBuffer(dummyData, 6, 10);
      expect(textEngine.bufferStart()).toBe(0);
      expect(textEngine.bufferEnd()).toBe(10);

      await textEngine.remove(0, 3);
      expect(textEngine.bufferStart()).toBe(3);
      expect(textEngine.bufferEnd()).toBe(10);

      await textEngine.remove(8, 11);
      expect(textEngine.bufferStart()).toBe(3);
      expect(textEngine.bufferEnd()).toBe(8);

      await textEngine.remove(11, 20);
      expect(textEngine.bufferStart()).toBe(3);
      expect(textEngine.bufferEnd()).toBe(8);

      await textEngine.remove(0, Infinity);
      expect(textEngine.bufferStart()).toBe(null);
      expect(textEngine.bufferEnd()).toBe(null);
    });

    it('does not use timestamp offset', async () => {
      // The start and end times passed to appendBuffer are now absolute, so
      // they already account for timestampOffset and period offset.
      // See https://github.com/shaka-project/shaka-player/issues/1562
      textEngine.setTimestampOffset(60);
      await textEngine.appendBuffer(dummyData, 0, 3);
      expect(textEngine.bufferStart()).toBe(0);
      expect(textEngine.bufferEnd()).toBe(3);

      await textEngine.appendBuffer(dummyData, 3, 6);
      expect(textEngine.bufferStart()).toBe(0);
      expect(textEngine.bufferEnd()).toBe(6);
    });
  });

  describe('bufferedAheadOf', () => {
    beforeEach(() => {
      mockParseMedia.and.callFake(() => {
        return [createFakeCue(0, 1), createFakeCue(1, 2), createFakeCue(2, 3)];
      });
    });

    it('returns 0 when there are no cues', () => {
      expect(textEngine.bufferedAheadOf(0)).toBe(0);
    });

    it('returns 0 if |t| is not buffered', async () => {
      await textEngine.appendBuffer(dummyData, 3, 6);
      expect(textEngine.bufferedAheadOf(6.1)).toBe(0);
    });

    it('ignores gaps in the content', async () => {
      await textEngine.appendBuffer(dummyData, 3, 6);
      expect(textEngine.bufferedAheadOf(2)).toBe(3);
    });

    it('returns the distance to the end if |t| is buffered', async () => {
      await textEngine.appendBuffer(dummyData, 0, 3);
      expect(textEngine.bufferedAheadOf(0)).toBe(3);
      expect(textEngine.bufferedAheadOf(1)).toBe(2);
      expect(textEngine.bufferedAheadOf(2.5)).toBeCloseTo(0.5);
    });

    it('does not use timestamp offset', async () => {
      // The start and end times passed to appendBuffer are now absolute, so
      // they already account for timestampOffset and period offset.
      // See https://github.com/shaka-project/shaka-player/issues/1562
      textEngine.setTimestampOffset(60);
      await textEngine.appendBuffer(dummyData, 3, 6);
      expect(textEngine.bufferedAheadOf(4)).toBe(2);
      expect(textEngine.bufferedAheadOf(64)).toBe(0);
    });
  });

  describe('setAppendWindow', () => {
    beforeEach(() => {
      mockParseMedia.and.callFake(() => {
        return [createFakeCue(0, 1), createFakeCue(1, 2), createFakeCue(2, 3)];
      });
    });

    it('limits appended cues', async () => {
      textEngine.setAppendWindow(0, 1.9);
      await textEngine.appendBuffer(dummyData, 0, 3);

      expect(mockDisplayer.appendSpy).toHaveBeenCalledOnceMoreWith([
        [
          createFakeCue(0, 1),
          createFakeCue(1, 2),
        ],
      ]);

      textEngine.setAppendWindow(1, 2.1);
      await textEngine.appendBuffer(dummyData, 0, 3);

      expect(mockDisplayer.appendSpy).toHaveBeenCalledOnceMoreWith([
        [
          createFakeCue(1, 2),
          createFakeCue(2, 3),
        ],
      ]);
    });

    it('limits bufferStart', async () => {
      textEngine.setAppendWindow(1, 9);
      await textEngine.appendBuffer(dummyData, 0, 3);
      expect(textEngine.bufferStart()).toBe(1);

      await textEngine.remove(0, 9);
      textEngine.setAppendWindow(2.1, 9);
      await textEngine.appendBuffer(dummyData, 0, 3);
      expect(textEngine.bufferStart()).toBe(2.1);
    });

    it('limits bufferEnd', async () => {
      textEngine.setAppendWindow(0, 1.9);
      await textEngine.appendBuffer(dummyData, 0, 3);
      expect(textEngine.bufferEnd()).toBe(1.9);

      textEngine.setAppendWindow(0, 2.1);
      await textEngine.appendBuffer(dummyData, 0, 3);
      expect(textEngine.bufferEnd()).toBe(2.1);

      textEngine.setAppendWindow(0, 4.1);
      await textEngine.appendBuffer(dummyData, 0, 3);
      expect(textEngine.bufferEnd()).toBe(3);
    });
  });

  function createFakeCue(startTime, endTime) {
    return {startTime: startTime, endTime: endTime};
  }
});
