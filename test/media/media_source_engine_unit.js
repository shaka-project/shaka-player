/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @typedef {{
 *   length: number,
 *   start: jasmine.Spy,
 *   end: jasmine.Spy
 * }}
 */
let MockTimeRanges;


/**
 * @typedef {{
 *   abort: jasmine.Spy,
 *   appendBuffer: jasmine.Spy,
 *   remove: jasmine.Spy,
 *   updating: boolean,
 *   addEventListener: jasmine.Spy,
 *   removeEventListener: jasmine.Spy,
 *   buffered: (MockTimeRanges|TimeRanges),
 *   timestampOffset: number,
 *   appendWindowEnd: number,
 *   updateend: function(),
 *   error: function(),
 *   mode: string
 * }}
 */
let MockSourceBuffer;


describe('MediaSourceEngine', () => {
  const Util = shaka.test.Util;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  const originalIsTypeSupported = window.MediaSource.isTypeSupported;
  const originalTextEngine = shaka.text.TextEngine;
  const originalCreateMediaSource =
      // eslint-disable-next-line no-restricted-syntax
      shaka.media.MediaSourceEngine.prototype.createMediaSource;

  const originalFindTransmuxer =
      shaka.transmuxer.TransmuxerEngine.findTransmuxer;
  const originalConvertCodecs =
      shaka.transmuxer.TransmuxerEngine.convertCodecs;
  const originalIsSupported =
      shaka.transmuxer.TransmuxerEngine.isSupported;

  // Jasmine Spies don't handle toHaveBeenCalledWith well with objects, so use
  // some numbers instead.
  const buffer = /** @type {!ArrayBuffer} */ (/** @type {?} */ (1));
  const buffer2 = /** @type {!ArrayBuffer} */ (/** @type {?} */ (2));
  const buffer3 = /** @type {!ArrayBuffer} */ (/** @type {?} */ (3));

  const fakeVideoStream = {mimeType: 'video/mp4', drmInfos: [{}]};
  const fakeAudioStream = {mimeType: 'audio/mp4', drmInfos: []};
  const fakeTextStream = {mimeType: 'text/mp4', drmInfos: []};
  const fakeTransportStream = {mimeType: 'tsMimetype', drmInfos: []};

  /** @type {shaka.extern.Stream} */
  const fakeStream = shaka.test.StreamingEngineUtil.createMockVideoStream(1);

  let audioSourceBuffer;
  let videoSourceBuffer;
  let mockVideo;

  /** @type {HTMLMediaElement} */
  let video;
  let mockMediaSource;

  let mockTextEngine;
  /** @type {!shaka.test.FakeTextDisplayer} */
  let mockTextDisplayer;
  /** @type {!shaka.test.FakeClosedCaptionParser} */
  let mockClosedCaptionParser;
  /** @type {!shaka.test.FakeTransmuxer} */
  let mockTransmuxer;

  /** @type {!jasmine.Spy} */
  let createMediaSourceSpy;
  /** @type {!jasmine.Spy} */
  let requiresEncryptionInfoInAllInitSegmentsSpy;
  /** @type {!jasmine.Spy} */
  let fakeEncryptionSpy;

  /** @type {!shaka.media.MediaSourceEngine} */
  let mediaSourceEngine;

  beforeAll(() => {
    // Since this is not an integration test, we don't want MediaSourceEngine to
    // fail assertions based on browser support for types.  Pretend that all
    // video and audio types are supported.
    window.MediaSource.isTypeSupported = (mimeType) => {
      const type = mimeType.split('/')[0];
      return type == 'video' || type == 'audio';
    };
  });

  afterAll(() => {
    window.MediaSource.isTypeSupported = originalIsTypeSupported;
    shaka.transmuxer.TransmuxerEngine.findTransmuxer =
        originalFindTransmuxer;
    shaka.transmuxer.TransmuxerEngine.convertCodecs =
        originalConvertCodecs;
    shaka.transmuxer.TransmuxerEngine.isSupported =
        originalIsSupported;
  });

  beforeEach(/** @suppress {invalidCasts} */ () => {
    audioSourceBuffer = createMockSourceBuffer();
    videoSourceBuffer = createMockSourceBuffer();
    mockMediaSource = createMockMediaSource();
    mockMediaSource.addSourceBuffer.and.callFake((mimeType) => {
      const type = mimeType.split('/')[0];
      const buffer = type == 'audio' ? audioSourceBuffer : videoSourceBuffer;
      // reset buffer params
      buffer.timestampOffset = 0;
      buffer.appendWindowEnd = Infinity;
      buffer.appendWindowStart = 0;

      return buffer;
    });
    mockTransmuxer = new shaka.test.FakeTransmuxer();
    shaka.transmuxer.TransmuxerEngine.findTransmuxer =
        (mimeType) => {
          return () => mockTransmuxer;
        };
    shaka.transmuxer.TransmuxerEngine.convertCodecs =
        (mimeType, contentType) => {
          return 'video/mp4; codecs="avc1.42E01E"';
        };
    shaka.transmuxer.TransmuxerEngine.isSupported =
        (mimeType, contentType) => {
          return mimeType == 'tsMimetype';
        };

    shaka.text.TextEngine = createMockTextEngineCtor();

    createMediaSourceSpy = jasmine.createSpy('createMediaSource');
    createMediaSourceSpy.and.callFake((p) => {
      p.resolve();
      return mockMediaSource;
    });
    // eslint-disable-next-line no-restricted-syntax
    shaka.media.MediaSourceEngine.prototype.createMediaSource =
        Util.spyFunc(createMediaSourceSpy);

    requiresEncryptionInfoInAllInitSegmentsSpy = spyOn(shaka.util.Platform,
        'requiresEncryptionInfoInAllInitSegments').and.returnValue(false);

    fakeEncryptionSpy = spyOn(shaka.media.ContentWorkarounds, 'fakeEncryption')
        .and.callFake((data) => data + 100);

    // MediaSourceEngine uses video to:
    //  - set src attribute
    //  - read error codes when operations fail
    //  - seek to flush the pipeline on some platforms
    //  - check buffered.length to assert that flushing the pipeline is okay
    mockVideo = {
      src: '',
      error: null,
      currentTime: 0,
      buffered: {
        length: 0,
      },
      removeAttribute: /** @this {HTMLVideoElement} */ (attr) => {
        // Only called with attr == 'src'.
        // This assertion alerts us if the requirements for this mock change.
        goog.asserts.assert(attr == 'src', 'Unexpected removeAttribute() call');
        mockVideo.src = '';
      },
      addEventListener: jasmine.createSpy('addVideoEventListener'),
      load: /** @this {HTMLVideoElement} */ () => {
        // This assertion alerts us if the requirements for this mock change.
        goog.asserts.assert(mockVideo.src == '', 'Unexpected load() call');
      },
      play: jasmine.createSpy('play'),
    };
    video = /** @type {HTMLMediaElement} */(mockVideo);
    mockClosedCaptionParser = new shaka.test.FakeClosedCaptionParser();
    mockTextDisplayer = new shaka.test.FakeTextDisplayer();
    mediaSourceEngine = new shaka.media.MediaSourceEngine(
        video,
        mockTextDisplayer);
    mediaSourceEngine.getCaptionParser = () => {
      return mockClosedCaptionParser;
    };
    const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
    mediaSourceEngine.configure(config);
  });

  afterEach(() => {
    mockTextEngine = null;
    shaka.text.TextEngine = originalTextEngine;
    // eslint-disable-next-line no-restricted-syntax
    shaka.media.MediaSourceEngine.prototype.createMediaSource =
        originalCreateMediaSource;
  });

  describe('constructor', () => {
    const originalCreateObjectURL =
      shaka.media.MediaSourceEngine.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    const originalMediaSource = window.MediaSource;
    /** @type {jasmine.Spy} */
    let createObjectURLSpy;
    /** @type {jasmine.Spy} */
    let revokeObjectURLSpy;

    beforeEach(async () => {
      // Mock out MediaSource so we can test the production version of
      // createMediaSource.  To do this, the test must call the
      // MediaSourceEngine constructor again.  The call beforeEach was done with
      // a mocked createMediaSource.
      createMediaSourceSpy.calls.reset();
      createMediaSourceSpy.and.callFake(originalCreateMediaSource);

      createObjectURLSpy = jasmine.createSpy('createObjectURL');
      createObjectURLSpy.and.returnValue('blob:foo');
      shaka.media.MediaSourceEngine.createObjectURL =
        Util.spyFunc(createObjectURLSpy);

      revokeObjectURLSpy = jasmine.createSpy('revokeObjectURL');
      window.URL.revokeObjectURL = Util.spyFunc(revokeObjectURLSpy);

      const mediaSourceSpy = jasmine.createSpy('MediaSource');
      // Because this is a fake constructor, it must be callable with "new".
      // This will cause jasmine to invoke the callback with "new" as well, so
      // the callback must be a "function".  This detail is hidden when babel
      // transpiles the tests.
      // eslint-disable-next-line prefer-arrow-callback, no-restricted-syntax
      mediaSourceSpy.and.callFake(function() {
        return mockMediaSource;
      });
      window.MediaSource = Util.spyFunc(mediaSourceSpy);

      await mediaSourceEngine.destroy();
    });

    afterAll(() => {
      shaka.media.MediaSourceEngine.createObjectURL = originalCreateObjectURL;
      window.MediaSource = originalMediaSource;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('creates a MediaSource object and sets video.src', () => {
      mediaSourceEngine = new shaka.media.MediaSourceEngine(
          video,
          new shaka.test.FakeTextDisplayer());

      expect(createMediaSourceSpy).toHaveBeenCalled();
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(mockVideo.src).toBe('blob:foo');
    });

    it('revokes object URL after MediaSource opens', () => {
      let onSourceOpenListener;

      mockMediaSource.addEventListener.and.callFake((event, callback, _) => {
        if (event == 'sourceopen') {
          onSourceOpenListener = callback;
        }
      });

      mediaSourceEngine = new shaka.media.MediaSourceEngine(
          video,
          new shaka.test.FakeTextDisplayer());

      expect(mockMediaSource.addEventListener).toHaveBeenCalledTimes(1);
      expect(mockMediaSource.addEventListener.calls.mostRecent().args[0])
          .toBe('sourceopen');
      expect(typeof onSourceOpenListener).toBe(typeof Function);

      onSourceOpenListener();

      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:foo');
    });
  });

  describe('init', () => {
    it('creates SourceBuffers for the given types', async () => {
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      await mediaSourceEngine.init(initObject, false);
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledWith('audio/mp4');
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledWith('video/mp4');
      expect(shaka.text.TextEngine).not.toHaveBeenCalled();
    });

    it('creates TextEngines for text types', async () => {
      const initObject = new Map();
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
      expect(mockMediaSource.addSourceBuffer).not.toHaveBeenCalled();
      expect(shaka.text.TextEngine).toHaveBeenCalled();
    });
  });

  describe('bufferStart and bufferEnd', () => {
    beforeEach(async () => {
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('returns correct timestamps for one range', () => {
      audioSourceBuffer.buffered = createFakeBuffered([{start: 0, end: 10}]);

      expect(mediaSourceEngine.bufferStart(ContentType.AUDIO)).toBeCloseTo(0);
      expect(mediaSourceEngine.bufferEnd(ContentType.AUDIO)).toBeCloseTo(10);
    });

    it('returns correct timestamps for multiple ranges', () => {
      audioSourceBuffer.buffered =
          createFakeBuffered([{start: 5, end: 10}, {start: 20, end: 30}]);

      expect(mediaSourceEngine.bufferStart(ContentType.AUDIO)).toBeCloseTo(5);
      expect(mediaSourceEngine.bufferEnd(ContentType.AUDIO)).toBeCloseTo(30);
    });

    it('returns null if there are no ranges', () => {
      audioSourceBuffer.buffered = createFakeBuffered([]);

      expect(mediaSourceEngine.bufferStart(ContentType.AUDIO)).toBeNull();
      expect(mediaSourceEngine.bufferEnd(ContentType.AUDIO)).toBeNull();
    });

    it('will forward to TextEngine', () => {
      mockTextEngine.bufferStart.and.returnValue(10);
      mockTextEngine.bufferEnd.and.returnValue(20);

      expect(mockTextEngine.bufferStart).not.toHaveBeenCalled();
      expect(mediaSourceEngine.bufferStart(ContentType.TEXT)).toBe(10);
      expect(mockTextEngine.bufferStart).toHaveBeenCalled();

      expect(mockTextEngine.bufferEnd).not.toHaveBeenCalled();
      expect(mediaSourceEngine.bufferEnd(ContentType.TEXT)).toBe(20);
      expect(mockTextEngine.bufferEnd).toHaveBeenCalled();
    });
  });

  describe('bufferedAheadOf', () => {
    beforeEach(async () => {
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('returns the amount of data ahead of the given position', () => {
      audioSourceBuffer.buffered = createFakeBuffered([{start: 0, end: 10}]);

      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 0))
          .toBeCloseTo(10);
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 5))
          .toBeCloseTo(5);
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 9.9))
          .toBeCloseTo(0.1);
    });

    it('returns zero when given an unbuffered time', () => {
      audioSourceBuffer.buffered = createFakeBuffered([{start: 5, end: 10}]);

      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 10))
          .toBeCloseTo(0);
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 100))
          .toBeCloseTo(0);
    });

    it('returns the correct amount with multiple ranges', () => {
      audioSourceBuffer.buffered =
          createFakeBuffered([{start: 1, end: 3}, {start: 6, end: 10}]);

      // in range 0
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 1))
          .toBeCloseTo(6);
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 2.5))
          .toBeCloseTo(4.5);

      // between range 0 and 1
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 5))
          .toBeCloseTo(4);

      // in range 1
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 6))
          .toBeCloseTo(4);
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 9.9))
          .toBeCloseTo(0.1);
    });

    it('will forward to TextEngine', () => {
      mockTextEngine.bufferedAheadOf.and.returnValue(10);

      expect(mockTextEngine.bufferedAheadOf).not.toHaveBeenCalled();
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.TEXT, 5)).toBe(10);
      expect(mockTextEngine.bufferedAheadOf).toHaveBeenCalledWith(5);
    });
  });

  describe('appendBuffer', () => {
    beforeEach(async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('should apply fake encryption by default', async () => {
      requiresEncryptionInfoInAllInitSegmentsSpy.and.returnValue(true);

      const p = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false);

      expect(fakeEncryptionSpy).toHaveBeenCalled();

      expect(videoSourceBuffer.appendBuffer)
          .toHaveBeenCalledWith((buffer + 100));
      videoSourceBuffer.updateend();

      await p;
    });

    it('should not apply fake encryption when config is off', async () => {
      requiresEncryptionInfoInAllInitSegmentsSpy.and.returnValue(true);

      const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
      config.insertFakeEncryptionInInit = false;

      mediaSourceEngine.configure(config);

      const p = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false);

      expect(fakeEncryptionSpy).not.toHaveBeenCalled();

      expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      videoSourceBuffer.updateend();

      await p;
    });

    it('appends the given data', async () => {
      const p = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      audioSourceBuffer.updateend();
      await p;
    });

    it('rejects promise when operation throws', async () => {
      audioSourceBuffer.appendBuffer.and.throwError('fail!');
      mockVideo.error = {code: 5, message: 'something failed'};
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
          jasmine.objectContaining({message: 'fail!'}),
          {code: 5, message: 'something failed'}));
      await expectAsync(
          mediaSourceEngine.appendBuffer(
              ContentType.AUDIO, buffer, null, fakeStream,
              /* hasClosedCaptions= */ false))
          .toBeRejectedWith(expected);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
    });

    it('rejects promise when op. throws QuotaExceededError', async () => {
      const fakeDOMException = {name: 'QuotaExceededError'};
      audioSourceBuffer.appendBuffer.and.callFake(() => {
        throw fakeDOMException;
      });
      mockVideo.error = {code: 5};
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
          ContentType.AUDIO));
      await expectAsync(
          mediaSourceEngine.appendBuffer(
              ContentType.AUDIO, buffer, null, fakeStream,
              /* hasClosedCaptions= */ false))
          .toBeRejectedWith(expected);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
    });

    it('handles QuotaExceededError for pending operations', async () => {
      const fakeDOMException = {name: 'QuotaExceededError'};
      audioSourceBuffer.appendBuffer.and.callFake(() => {
        if (audioSourceBuffer.appendBuffer.calls.count() > 1) {
          throw fakeDOMException;
        }
      });
      mockVideo.error = {code: 5};
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
          ContentType.AUDIO));

      const p1 = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false);
      const p2 = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false);
      audioSourceBuffer.updateend();
      await expectAsync(p1).toBeResolved();
      await expectAsync(p2).toBeRejectedWith(expected);
    });

    it('rejects the promise if this operation fails async', async () => {
      mockVideo.error = {code: 5};
      const p = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false);
      audioSourceBuffer.error();
      audioSourceBuffer.updateend();

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED,
          5));
      await expectAsync(p).toBeRejectedWith(expected);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
    });

    it('queues operations on a single SourceBuffer', async () => {
      /** @type {!shaka.test.StatusPromise} */
      const p1 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false));
      /** @type {!shaka.test.StatusPromise} */
      const p2 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer2, null, fakeStream,
          /* hasClosedCaptions= */ false));

      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(buffer2);
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');

      audioSourceBuffer.updateend();
      await p1;
      expect(p2.status).toBe('pending');
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer2);
      audioSourceBuffer.updateend();
      await p2;
    });

    it('queues operations independently for different types', async () => {
      /** @type {!shaka.test.StatusPromise} */
      const p1 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false));
      /** @type {!shaka.test.StatusPromise} */
      const p2 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer2, null, fakeStream,
          /* hasClosedCaptions= */ false));
      /** @type {!shaka.test.StatusPromise} */
      const p3 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer3, null, fakeStream,
          /* hasClosedCaptions= */ false));

      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(buffer2);
      expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer3);
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');

      audioSourceBuffer.updateend();
      videoSourceBuffer.updateend();
      // Wait a tick between each updateend() and the status check that follows.
      await p1;
      expect(p2.status).toBe('pending');
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer2);
      await p3;
      audioSourceBuffer.updateend();
      await p2;
    });

    it('continues if an operation throws', async () => {
      audioSourceBuffer.appendBuffer.and.callFake((value) => {
        if (value == 2) {
          // throw synchronously.
          throw new Error();
        } else {
          // complete successfully asynchronously.
          Promise.resolve().then(() => {
            audioSourceBuffer.updateend();
          });
        }
      });

      const p1 = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false);
      const p2 = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer2, null, fakeStream,
          /* hasClosedCaptions= */ false);
      const p3 = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer3, null, fakeStream,
          /* hasClosedCaptions= */ false);

      await expectAsync(p1).toBeResolved();
      await expectAsync(p2).toBeRejected();
      await expectAsync(p3).toBeResolved();
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer2);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer3);
    });

    it('forwards to TextEngine', async () => {
      const data = new ArrayBuffer(0);
      expect(mockTextEngine.appendBuffer).not.toHaveBeenCalled();
      const reference = dummyReference(0, 10);
      await mediaSourceEngine.appendBuffer(
          ContentType.TEXT, data, reference, fakeStream,
          /* hasClosedCaptions= */ false);
      expect(mockTextEngine.appendBuffer).toHaveBeenCalledWith(
          data, 0, 10, 'foo://bar');
    });

    it('appends transmuxed data', async () => {
      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeTransportStream);

      const output = {
        data: new Uint8Array(1),
        captions: [{}],
      };
      mockTransmuxer.transmux.and.returnValue(Promise.resolve(output));

      const init = async () => {
        await mediaSourceEngine.init(initObject, false);
        await mediaSourceEngine.appendBuffer(
            ContentType.VIDEO, buffer, null, fakeStream,
            /* hasClosedCaptions= */ false);
        expect(videoSourceBuffer.appendBuffer).toHaveBeenCalled();
      };

      // The 'updateend' event fires once the data is done appending to the
      // media source.  We only append to the media source once transmuxing is
      // done.  Since transmuxing is done using Promises, we need to delay the
      // event until MediaSourceEngine calls appendBuffer.
      const delay = async () => {
        await Util.shortDelay();
        videoSourceBuffer.updateend();
      };
      await Promise.all([init(), delay()]);
    });

    it('appends parsed closed captions from CaptionParser', async () => {
      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeVideoStream);

      mockClosedCaptionParser.parseFromSpy.and.callFake((data) => {
        return ['foo', 'bar'];
      });

      await mediaSourceEngine.init(initObject, false);

      // Initialize the closed caption parser.
      const appendInit = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ true);
      // In MediaSourceEngine, appendBuffer() is async and Promise-based, but
      // at the browser level, it's event-based.
      // MediaSourceEngine waits for the 'updateend' event from the
      // SourceBuffer, and uses that to resolve the appendBuffer Promise.
      // Here, we must trigger the event on the fake/mock SourceBuffer before
      // waiting on the appendBuffer Promise.
      videoSourceBuffer.updateend();
      await appendInit;

      expect(mockTextEngine.storeAndAppendClosedCaptions).not
          .toHaveBeenCalled();
      // Parse and append the closed captions embedded in video stream.
      const reference = dummyReference(0, 1000);
      const appendVideo = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, reference, fakeStream,
          /* hasClosedCaptions= */ true);
      videoSourceBuffer.updateend();
      await appendVideo;

      expect(mockTextEngine.storeAndAppendClosedCaptions).toHaveBeenCalled();
    });

    it('sets timestampOffset on adaptations in sequence mode', async () => {
      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      videoSourceBuffer.mode = 'sequence';

      await mediaSourceEngine.init(initObject, /* sequenceMode= */ true);

      expect(videoSourceBuffer.timestampOffset).toBe(0);

      // Mocks appending a segment from a newly adapted variant with a 0.50
      // second misalignment from the old variant.
      const reference = dummyReference(0, 1000);
      reference.startTime = 0.50;
      const appendVideo = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, reference, fakeStream,
          /* hasClosedCaptions= */ false,
          /* seeked= */ false, /* adaptation= */ true);
      videoSourceBuffer.updateend();
      await appendVideo;

      expect(videoSourceBuffer.timestampOffset).toBe(0.50);
    });
  });

  describe('remove', () => {
    beforeEach(async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('removes the given data', async () => {
      const p = mediaSourceEngine.remove(ContentType.AUDIO, 1, 5);
      audioSourceBuffer.updateend();

      await p;
      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
    });

    it('rejects promise when operation throws', async () => {
      audioSourceBuffer.remove.and.throwError('fail!');
      mockVideo.error = {code: 5};

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
          jasmine.objectContaining({message: 'fail!'}),
          {code: 5}));
      await expectAsync(mediaSourceEngine.remove(ContentType.AUDIO, 1, 5))
          .toBeRejectedWith(expected);
      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
    });

    it('rejects the promise if this operation fails async', async () => {
      mockVideo.error = {code: 5};
      const p = mediaSourceEngine.remove(ContentType.AUDIO, 1, 5);
      audioSourceBuffer.error();
      audioSourceBuffer.updateend();

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED,
          5));
      await expectAsync(p).toBeRejectedWith(expected);
      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
    });

    it('queues operations on a single SourceBuffer', async () => {
      /** @type {!shaka.test.StatusPromise} */
      const p1 = new shaka.test.StatusPromise(
          mediaSourceEngine.remove(ContentType.AUDIO, 1, 5));
      /** @type {!shaka.test.StatusPromise} */
      const p2 = new shaka.test.StatusPromise(
          mediaSourceEngine.remove(ContentType.AUDIO, 6, 10));

      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
      expect(audioSourceBuffer.remove).not.toHaveBeenCalledWith(6, 10);
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');

      audioSourceBuffer.updateend();
      await p1;
      expect(p2.status).toBe('pending');
      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(6, 10);
      audioSourceBuffer.updateend();
      await p2;
    });

    it('queues operations independently for different types', async () => {
      /** @type {!shaka.test.StatusPromise} */
      const p1 = new shaka.test.StatusPromise(
          mediaSourceEngine.remove(ContentType.AUDIO, 1, 5));
      /** @type {!shaka.test.StatusPromise} */
      const p2 = new shaka.test.StatusPromise(
          mediaSourceEngine.remove(ContentType.AUDIO, 6, 10));
      /** @type {!shaka.test.StatusPromise} */
      const p3 = new shaka.test.StatusPromise(
          mediaSourceEngine.remove(ContentType.VIDEO, 3, 8));

      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
      expect(audioSourceBuffer.remove).not.toHaveBeenCalledWith(6, 10);
      expect(videoSourceBuffer.remove).toHaveBeenCalledWith(3, 8);
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');

      audioSourceBuffer.updateend();
      videoSourceBuffer.updateend();
      await p1;
      expect(p2.status).toBe('pending');
      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(6, 10);
      await p3;
      audioSourceBuffer.updateend();
      await p2;
    });

    it('continues if an operation throws', async () => {
      audioSourceBuffer.remove.and.callFake((start, end) => {
        if (start == 2) {
          // throw synchronously.
          throw new Error();
        } else {
          // complete successfully asynchronously.
          Promise.resolve().then(() => {
            audioSourceBuffer.updateend();
          });
        }
      });

      const p1 = mediaSourceEngine.remove(ContentType.AUDIO, 1, 2);
      const p2 = mediaSourceEngine.remove(ContentType.AUDIO, 2, 3);
      const p3 = mediaSourceEngine.remove(ContentType.AUDIO, 3, 4);

      await expectAsync(p1).toBeResolved();
      await expectAsync(p2).toBeRejected();
      await expectAsync(p3).toBeResolved();
      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 2);
      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(2, 3);
      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(3, 4);
    });

    it('will forward to TextEngine', async () => {
      expect(mockTextEngine.remove).not.toHaveBeenCalled();
      await mediaSourceEngine.remove(ContentType.TEXT, 10, 20);
      expect(mockTextEngine.remove).toHaveBeenCalledWith(10, 20);
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('clears the given data', async () => {
      mockMediaSource.durationGetter.and.returnValue(20);
      const p = mediaSourceEngine.clear(ContentType.AUDIO);
      audioSourceBuffer.updateend();

      await p;
      expect(audioSourceBuffer.remove).toHaveBeenCalledTimes(1);
      expect(audioSourceBuffer.remove.calls.argsFor(0)[0]).toBe(0);
      expect(audioSourceBuffer.remove.calls.argsFor(0)[1] >= 20).toBeTruthy();
    });

    it('does not seek', async () => {
      // We had a bug in which we got into a seek loop. Seeking caused
      // StreamingEngine to call clear().  Clearing triggered a pipeline flush
      // which was implemented by seeking.  See issue #569.

      // This loop is difficult to test for directly.

      // A unit test on StreamingEngine would not suffice, since reproduction of
      // the bug would involve making the mock MediaSourceEngine seek on clear.
      // Since the fix was to remove the implicit seek, this behavior would then
      // be removed from the mock, which would render the test useless.

      // An integration test involving both StreamingEngine and MediaSourcEngine
      // would also be problematic.  The bug involved a race, so it would be
      // difficult to reproduce the necessary timing.  And if we succeeded, it
      // would be tough to detect that we were definitely in a seek loop, since
      // nothing was mocked.

      // So the best option seems to be to enforce that clear() does not result
      // in a seek.  This can be done here, in a unit test on MediaSourceEngine.
      // It does not reproduce the seek loop, but it does ensure that the test
      // would fail if we ever reintroduced this behavior.

      const originalTime = 10;
      mockVideo.currentTime = originalTime;

      mockMediaSource.durationGetter.and.returnValue(20);
      const p = mediaSourceEngine.clear(ContentType.AUDIO);
      audioSourceBuffer.updateend();

      await p;
      expect(mockVideo.currentTime).toBe(originalTime);
    });

    it('will forward to TextEngine', async () => {
      expect(mockTextEngine.setTimestampOffset).not.toHaveBeenCalled();
      expect(mockTextEngine.setAppendWindow).not.toHaveBeenCalled();
      await mediaSourceEngine.setStreamProperties(ContentType.TEXT,
          /* timestampOffset= */ 10,
          /* appendWindowStart= */ 0,
          /* appendWindowEnd= */ 20,
          /* sequenceMode= */ false,
          fakeStream,
          /* streamsByType= */ new Map());
      expect(mockTextEngine.setTimestampOffset).toHaveBeenCalledWith(10);
      expect(mockTextEngine.setAppendWindow).toHaveBeenCalledWith(0, 20);
    });
  });

  describe('endOfStream', () => {
    beforeEach(async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('ends the MediaSource stream with the given reason', async () => {
      await mediaSourceEngine.endOfStream('foo');
      expect(mockMediaSource.endOfStream).toHaveBeenCalledWith('foo');
    });

    it('waits for all previous operations to complete', async () => {
      /** @type {!shaka.test.StatusPromise} */
      const p1 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false));
      /** @type {!shaka.test.StatusPromise} */
      const p2 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false));
      /** @type {!shaka.test.StatusPromise} */
      const p3 = new shaka.test.StatusPromise(mediaSourceEngine.endOfStream());

      expect(mockMediaSource.endOfStream).not.toHaveBeenCalled();
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');

      audioSourceBuffer.updateend();
      await p1;
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');
      videoSourceBuffer.updateend();
      await p2;
      await p3;
      expect(mockMediaSource.endOfStream).toHaveBeenCalled();
    });

    it('makes subsequent operations wait', async () => {
      /** @type {!Promise} */
      const p1 = mediaSourceEngine.endOfStream();
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null,
          fakeStream, /* hasClosedCaptions= */ false);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer, null,
          fakeStream, /* hasClosedCaptions= */ false);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer2, null,
          fakeStream, /* hasClosedCaptions= */ false);

      // endOfStream hasn't been called yet because blocking multiple queues
      // takes an extra tick, even when they are empty.
      expect(mockMediaSource.endOfStream).not.toHaveBeenCalled();

      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();
      expect(videoSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      await p1;
      expect(mockMediaSource.endOfStream).toHaveBeenCalled();
      // The next operations have already been kicked off.
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      // This one is still in queue.
      expect(videoSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(buffer2);
      audioSourceBuffer.updateend();
      videoSourceBuffer.updateend();
      await Promise.resolve();
      expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer2);
      videoSourceBuffer.updateend();
    });

    it('runs subsequent operations if this operation throws', async () => {
      mockMediaSource.endOfStream.and.throwError(new Error());
      /** @type {!Promise} */
      const p1 = mediaSourceEngine.endOfStream();
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null,
          fakeStream, /* hasClosedCaptions= */ false);

      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      await expectAsync(p1).toBeRejected();
      expect(mockMediaSource.endOfStream).toHaveBeenCalled();
      await Util.shortDelay();
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
      audioSourceBuffer.updateend();
    });
  });

  describe('setDuration', () => {
    beforeEach(async () => {
      mockMediaSource.durationGetter.and.returnValue(0);
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('sets the given duration', async () => {
      await mediaSourceEngine.setDuration(100);
      expect(mockMediaSource.durationSetter).toHaveBeenCalledWith(100);
    });

    it('waits for all previous operations to complete', async () => {
      /** @type {!shaka.test.StatusPromise} */
      const p1 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false));
      /** @type {!shaka.test.StatusPromise} */
      const p2 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false));
      /** @type {!shaka.test.StatusPromise} */
      const p3 =
          new shaka.test.StatusPromise(mediaSourceEngine.setDuration(100));

      expect(mockMediaSource.durationSetter).not.toHaveBeenCalled();
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');

      audioSourceBuffer.updateend();
      await p1;
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');
      videoSourceBuffer.updateend();
      await p2;
      await p3;
      expect(mockMediaSource.durationSetter).toHaveBeenCalledWith(100);
    });

    it('makes subsequent operations wait', async () => {
      /** @type {!Promise} */
      const p1 = mediaSourceEngine.setDuration(100);
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null,
          fakeStream, /* hasClosedCaptions= */ false);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer, null,
          fakeStream, /* hasClosedCaptions= */ false);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer2, null,
          fakeStream, /* hasClosedCaptions= */ false);

      // The setter hasn't been called yet because blocking multiple queues
      // takes an extra tick, even when they are empty.
      expect(mockMediaSource.durationSetter).not.toHaveBeenCalled();

      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();
      expect(videoSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      await p1;
      expect(mockMediaSource.durationSetter).toHaveBeenCalled();
      // The next operations have already been kicked off.
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      // This one is still in queue.
      expect(videoSourceBuffer.appendBuffer)
          .not.toHaveBeenCalledWith(buffer2);
      audioSourceBuffer.updateend();
      videoSourceBuffer.updateend();
      await Promise.resolve();
      expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer2);
      videoSourceBuffer.updateend();
    });

    it('runs subsequent operations if this operation throws', async () => {
      mockMediaSource.durationSetter.and.throwError(new Error());
      /** @type {!Promise} */
      const p1 = mediaSourceEngine.setDuration(100);
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null,
          fakeStream, /* hasClosedCaptions= */ false);

      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      await expectAsync(p1).toBeRejected();
      expect(mockMediaSource.durationSetter).toHaveBeenCalled();
      await Util.shortDelay();
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      audioSourceBuffer.updateend();
    });

    it('allows duration to be shrunk', async () => {
      // Pretend the initial duration was 100.
      mockMediaSource.durationGetter.and.returnValue(100);

      // When duration is shrunk, 'updateend' events are generated.  This is
      // because reducing the duration triggers the MSE removal algorithm to
      // run.
      mockMediaSource.durationSetter.and.callFake((duration) => {
        expect(duration).toBe(50);
        videoSourceBuffer.updateend();
        audioSourceBuffer.updateend();
      });

      audioSourceBuffer.appendBuffer.and.callFake(() => {
        audioSourceBuffer.updateend();
      });
      videoSourceBuffer.appendBuffer.and.callFake(() => {
        videoSourceBuffer.updateend();
      });

      /** @type {!Promise} */
      const p1 = mediaSourceEngine.setDuration(50);
      expect(mockMediaSource.durationSetter).not.toHaveBeenCalled();

      // These operations should be blocked until after duration is shrunk.
      // This is tested because shrinking duration generates 'updateend'
      // events, and we want to show that the queue still operates correctly.
      const a1 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null,
          fakeStream, /* hasClosedCaptions= */ false);
      const a2 = mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer, null,
          fakeStream, /* hasClosedCaptions= */ false);

      await p1;
      await a1;
      await a2;
    });
  });

  describe('reload codec switching', () => {
    beforeEach(
        /** @suppress {visibility, checkTypes} */
        () => {
          mediaSourceEngine.eventManager_.listenOnce =
              jasmine.createSpy('listener');
          mediaSourceEngine.eventManager_.listen =
              jasmine.createSpy('eventListener');
        });
    const initObject = new Map();
    initObject.set(ContentType.VIDEO, fakeVideoStream);
    initObject.set(ContentType.AUDIO, fakeAudioStream);

    it('should re-create a new MediaSource',
    /** @suppress {visibility} */ async () => {
          await mediaSourceEngine.init(initObject, false);
          mediaSourceEngine.reset_(initObject);
          expect(createMediaSourceSpy).toHaveBeenCalled();
        });

    it('should re-create the audio & video source buffers',
    /** @suppress {invalidCasts, visibility, checkTypes} */ async () => {
          await mediaSourceEngine.init(initObject, false);
          mediaSourceEngine.reset_(initObject);
          expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledTimes(2);
        });

    it('should persist the previous source buffer parameters',
    /** @suppress {invalidCasts, visibility, checkTypes} */async () => {
          await mediaSourceEngine.init(initObject, false);

          audioSourceBuffer.timestampOffset = 10;
          audioSourceBuffer.appendWindowStart = 5;
          audioSourceBuffer.appendWindowEnd = 20;

          videoSourceBuffer.timestampOffset = 20;
          videoSourceBuffer.appendWindowStart = 15;
          videoSourceBuffer.appendWindowEnd = 30;

          mediaSourceEngine.reset_(initObject);

          expect(audioSourceBuffer.timestampOffset).toBe(10);
          expect(audioSourceBuffer.appendWindowStart).toBe(5);
          expect(audioSourceBuffer.appendWindowEnd).toBe(20);

          expect(videoSourceBuffer.timestampOffset).toBe(20);
          expect(videoSourceBuffer.appendWindowStart).toBe(15);
          expect(videoSourceBuffer.appendWindowEnd).toBe(30);
        });

    it('should preserve autoplay state',
    /** @suppress {invalidCasts, visibility, checkTypes} */
        async () => {
          const originalInitSourceBuffer = mediaSourceEngine.initSourceBuffer_;
          try {
            await mediaSourceEngine.init(initObject, false);
            video.autoplay = true;
            video.paused = true;
            const playSpy = /** @type {jasmine.Spy} */ (video.play);
            const addListenOnceSpy =
            /** @type {jasmine.Spy} */
              (mediaSourceEngine.eventManager_.listenOnce);
            const addEventListenerSpy =
            /** @type {jasmine.Spy} */
                (mediaSourceEngine.eventManager_.listen);
            mediaSourceEngine.playbackHasBegun_ = true;
            mediaSourceEngine.initSourceBuffer_ =
              jasmine.createSpy('initSourceBuffer');
            const initSourceBufferSpy =
            /** @type {jasmine.Spy} */
                (mediaSourceEngine.initSourceBuffer_);
            addEventListenerSpy.and.callFake((o, e, c) => {
              c(); // audio
              c(); // video
            });
            await mediaSourceEngine.reset_(initObject);
            const callback = addListenOnceSpy.calls.argsFor(0)[2];
            callback();
            expect(initSourceBufferSpy).toHaveBeenCalled();
            expect(addListenOnceSpy.calls.argsFor(0)[1]).toBe('canplay');
            expect(video.autoplay).toBe(true);
            expect(playSpy).not.toHaveBeenCalled();
          } finally {
            mediaSourceEngine.initSourceBuffer_ = originalInitSourceBuffer;
          }
        });

    it('should not set autoplay to false if playback has not begun',
    /** @suppress {invalidCasts, visibility, checkTypes} */
        async () => {
          const originalInitSourceBuffer = mediaSourceEngine.initSourceBuffer_;
          try {
            await mediaSourceEngine.init(initObject, false);
            video.autoplay = true;
            let setCount = 0;
            const addEventListenerSpy =
            /** @type {jasmine.Spy} */
              (mediaSourceEngine.eventManager_.listen);
            addEventListenerSpy.and.callFake((o, e, c) => {
              c(); // audio
              c(); // video
            });
            mediaSourceEngine.initSourceBuffer_ =
            jasmine.createSpy('initSourceBuffer');
            Object.defineProperty(video, 'autoplay', {
              get: () => true,
              set: () => {
                setCount++;
              },
            });
            await mediaSourceEngine.reset_(initObject);
            expect(setCount).toBe(0);
          } finally {
            mediaSourceEngine.initSourceBuffer_ = originalInitSourceBuffer;
          }
        });

    it('should preserve playing state',
    /** @suppress {invalidCasts, visibility, checkTypes} */
        async () => {
          const originalInitSourceBuffer = mediaSourceEngine.initSourceBuffer_;
          try {
            await mediaSourceEngine.init(initObject, false);
            video.autoplay = false;
            video.paused = false;
            const playSpy = /** @type {jasmine.Spy} */ (video.play);
            const addListenOnceSpy =
            /** @type {jasmine.Spy} */
              (mediaSourceEngine.eventManager_.listenOnce);
            const addEventListenerSpy =
            /** @type {jasmine.Spy} */
                (mediaSourceEngine.eventManager_.listen);
            mediaSourceEngine.playbackHasBegun_ = true;
            mediaSourceEngine.initSourceBuffer_ =
              jasmine.createSpy('initSourceBuffer');
            const initSourceBufferSpy =
            /** @type {jasmine.Spy} */
                (mediaSourceEngine.initSourceBuffer_);
            addEventListenerSpy.and.callFake((o, e, c) => {
              c(); // audio
              c(); // video
            });
            await mediaSourceEngine.reset_(initObject);
            const callback = addListenOnceSpy.calls.argsFor(0)[2];
            callback();
            expect(initSourceBufferSpy).toHaveBeenCalled();
            expect(addListenOnceSpy.calls.argsFor(0)[1]).toBe('canplay');
            expect(video.autoplay).toBe(false);
            expect(playSpy).toHaveBeenCalled();
          } finally {
            mediaSourceEngine.initSourceBuffer_ = originalInitSourceBuffer;
          }
        });
  });

  describe('destroy', () => {
    beforeEach(async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('waits for all operations to complete', async () => {
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null,
          fakeStream, /* hasClosedCaptions= */ false);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer, null,
          fakeStream, /* hasClosedCaptions= */ false);

      /** @type {!shaka.test.StatusPromise} */
      const d = new shaka.test.StatusPromise(mediaSourceEngine.destroy());

      expect(d.status).toBe('pending');
      await Util.shortDelay();
      expect(d.status).toBe('pending');
      audioSourceBuffer.updateend();
      await Util.shortDelay();
      expect(d.status).toBe('pending');
      videoSourceBuffer.updateend();
      await d;
    });

    it('resolves even when a pending operation fails', async () => {
      const p = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false);
      const d = mediaSourceEngine.destroy();

      audioSourceBuffer.error();
      audioSourceBuffer.updateend();
      await expectAsync(p).toBeRejected();
      await d;
    });

    it('waits for blocking operations to complete', async () => {
      /** @type {!shaka.test.StatusPromise} */
      const p = new shaka.test.StatusPromise(mediaSourceEngine.endOfStream());
      /** @type {!shaka.test.StatusPromise} */
      const d = new shaka.test.StatusPromise(mediaSourceEngine.destroy());

      expect(p.status).toBe('pending');
      expect(d.status).toBe('pending');
      await p;
      expect(d.status).toBe('pending');
      await d;
    });

    it('cancels operations that have not yet started', async () => {
      mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false);
      const rejected = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer2, null, fakeStream,
          /* hasClosedCaptions= */ false);
      // Create the expectation first so we don't get unhandled rejection errors
      const expected = expectAsync(rejected).toBeRejected();

      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(buffer2);

      /** @type {!shaka.test.StatusPromise} */
      const d = new shaka.test.StatusPromise(mediaSourceEngine.destroy());

      expect(d.status).toBe('pending');
      await Util.shortDelay();
      expect(d.status).toBe('pending');
      await expected;
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(buffer2);
      audioSourceBuffer.updateend();
      await d;
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(buffer2);
    });

    it('cancels blocking operations that have not yet started', async () => {
      const p1 = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false);
      const p2 = mediaSourceEngine.endOfStream();
      const d = mediaSourceEngine.destroy();

      audioSourceBuffer.updateend();
      await expectAsync(p1).toBeResolved();
      await expectAsync(p2).toBeRejected();
      await d;
    });

    it('prevents new operations from being added', async () => {
      const d = mediaSourceEngine.destroy();
      await expectAsync(
          mediaSourceEngine.appendBuffer(
              ContentType.AUDIO, buffer, null, fakeStream,
              /* hasClosedCaptions= */ false))
          .toBeRejected();
      await d;
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();
    });

    it('destroys text engines', async () => {
      mediaSourceEngine.reinitText('text/vtt', false, false);

      await mediaSourceEngine.destroy();
      expect(mockTextEngine).toBeTruthy();
      expect(mockTextEngine.destroy).toHaveBeenCalled();
    });

    // Regression test for https://github.com/shaka-project/shaka-player/issues/984
    it('destroys TextDisplayer on destroy', async () => {
      await mediaSourceEngine.destroy();
      expect(mockTextDisplayer.destroySpy).toHaveBeenCalled();
    });
  });

  function createMockMediaSource() {
    const mediaSource = {
      readyState: 'open',
      sourceBuffers: document.createElement('div'),
      addSourceBuffer: jasmine.createSpy('addSourceBuffer'),
      endOfStream: jasmine.createSpy('endOfStream'),
      durationGetter: jasmine.createSpy('duration getter'),
      durationSetter: jasmine.createSpy('duration setter'),
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: () => {},
    };
    Object.defineProperty(mediaSource, 'duration', {
      get: Util.spyFunc(mediaSource.durationGetter),
      set: Util.spyFunc(mediaSource.durationSetter),
    });
    return mediaSource;
  }

  /** @return {MockSourceBuffer} */
  function createMockSourceBuffer() {
    return {
      abort: jasmine.createSpy('abort'),
      appendBuffer: jasmine.createSpy('appendBuffer'),
      remove: jasmine.createSpy('remove'),
      updating: false,
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
      buffered: {
        length: 0,
        start: jasmine.createSpy('buffered.start'),
        end: jasmine.createSpy('buffered.end'),
      },
      timestampOffset: 0,
      appendWindowEnd: Infinity,
      updateend: () => {},
      error: () => {},
      mode: 'segments',
    };
  }

  function createMockTextEngineCtor() {
    const ctor = jasmine.createSpy('TextEngine');
    ctor['isTypeSupported'] = () => true;
    // Because this is a fake constructor, it must be callable with "new".
    // This will cause jasmine to invoke the callback with "new" as well, so
    // the callback must be a "function".  This detail is hidden when babel
    // transpiles the tests.
    // eslint-disable-next-line prefer-arrow-callback, no-restricted-syntax
    ctor.and.callFake(function() {
      expect(mockTextEngine).toBeFalsy();
      mockTextEngine = jasmine.createSpyObj('TextEngine', [
        'initParser', 'destroy', 'appendBuffer', 'remove', 'setTimestampOffset',
        'setAppendWindow', 'bufferStart', 'bufferEnd', 'bufferedAheadOf',
        'storeAndAppendClosedCaptions',
      ]);

      const resolve = () => Promise.resolve();
      mockTextEngine.destroy.and.callFake(resolve);
      mockTextEngine.appendBuffer.and.callFake(resolve);
      mockTextEngine.remove.and.callFake(resolve);
      return mockTextEngine;
    });
    return ctor;
  }

  function captureEvents(object, targetEventNames) {
    object.addEventListener.and.callFake((eventName, listener) => {
      if (targetEventNames.includes(eventName)) {
        object[eventName] = listener;
      }
    });
    object.removeEventListener.and.callFake((eventName, listener) => {
      if (targetEventNames.includes(eventName)) {
        expect(object[eventName]).toBe(listener);
        object[eventName] = null;
      }
    });
  }

  function dummyReference(startTime, endTime) {
    return new shaka.media.SegmentReference(
        startTime, endTime,
        /* uris= */ () => ['foo://bar'],
        /* startByte= */ 0,
        /* endByte= */ null,
        /* initSegmentReference= */ null,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity);
  }
});
