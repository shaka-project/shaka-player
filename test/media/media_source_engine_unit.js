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
 *   changeType: jasmine.Spy,
 *   appendBuffer: jasmine.Spy,
 *   remove: jasmine.Spy,
 *   updating: boolean,
 *   addEventListener: jasmine.Spy,
 *   removeEventListener: jasmine.Spy,
 *   buffered: (MockTimeRanges|TimeRanges),
 *   timestampOffset: number,
 *   appendWindowStart: number,
 *   appendWindowEnd: number,
 *   updateend: function(),
 *   error: function(),
 *   mode: string
 * }}
 */
let MockSourceBuffer;


describe('MediaSourceEngine', () => {
  const Util = shaka.test.Util;
  const BufferUtils = shaka.util.BufferUtils;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  const originalIsTypeSupported = window.MediaSource.isTypeSupported;
  let originalIsTypeSupportedManaged;
  if (window.ManagedMediaSource) {
    originalIsTypeSupportedManaged = window.ManagedMediaSource.isTypeSupported;
  }
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

  const buffer = new Uint8Array([0x01]);
  const buffer2 = new Uint8Array([0x02]);
  const buffer3 = new Uint8Array([0x03]);

  const makeFakeStream = (mimeType) => {
    const segmentIndex = {
      isEmpty: () => false,
    };
    segmentIndex[Symbol.iterator] = () => {
      let nextPosition = 0;

      return {
        next: () => {
          if (nextPosition == 0) {
            nextPosition += 1;
            return {
              value: {mimeType},
              done: false,
            };
          } else {
            return {
              value: null,
              done: true,
            };
          }
        },
        current: () => {
          return {mimeType};
        },
      };
    };
    return {mimeType, drmInfos: [{}], segmentIndex};
  };

  const fakeVideoStream = makeFakeStream('video/mp4');
  const fakeAudioStream = makeFakeStream('audio/mp4');
  const fakeTextStream = makeFakeStream('text/mp4');
  const fakeTransportStream = makeFakeStream('tsMimetype');
  const fakeStreams =
      [fakeVideoStream, fakeAudioStream, fakeTextStream, fakeTransportStream];
  for (const fakeStream of fakeStreams) {
    fakeStream.fullMimeTypes = new Set([fakeStream.mimeType]);
  }

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
  let requiresEC3InitSegments;
  /** @type {!jasmine.Spy} */
  let requiresTimestampOffsetFudgeSpy;
  /** @type {!jasmine.Spy} */
  let fakeEncryptionSpy;

  /** @type {!jasmine.Spy} */
  let onScte35;

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
    if (window.ManagedMediaSource) {
      window.ManagedMediaSource.isTypeSupported = (mimeType) => {
        const type = mimeType.split('/')[0];
        return type == 'video' || type == 'audio';
      };
    }
  });

  afterAll(() => {
    window.MediaSource.isTypeSupported = originalIsTypeSupported;
    if (window.ManagedMediaSource) {
      window.ManagedMediaSource.isTypeSupported =
          originalIsTypeSupportedManaged;
    }
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
      if (mockMediaSource.readyState !== 'open') {
        // https://w3c.github.io/media-source/#addsourcebuffer-method
        throw new Error('InvalidStateError');
      }
      const type = mimeType.split('/')[0];
      const buffer = type == 'audio' ? audioSourceBuffer : videoSourceBuffer;

      // reset buffer params
      buffer.timestampOffset = 0;
      buffer.appendWindowEnd = Infinity;
      buffer.appendWindowStart = 0;

      // send a simple mock of the 'addsourcebuffer' event, after returning.
      Util.shortDelay().then(() => {
        mockMediaSource.sourceBuffers.dispatchEvent(
            new Event('addsourcebuffer'));
      });

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
      mockMediaSource.readyState = 'open';
      return mockMediaSource;
    });
    // eslint-disable-next-line no-restricted-syntax
    shaka.media.MediaSourceEngine.prototype.createMediaSource =
        Util.spyFunc(createMediaSourceSpy);

    requiresEncryptionInfoInAllInitSegmentsSpy = spyOn(deviceDetected,
        'requiresEncryptionInfoInAllInitSegments').and.returnValue(false);

    requiresEC3InitSegments = spyOn(deviceDetected,
        'requiresEC3InitSegments').and.returnValue(false);

    requiresTimestampOffsetFudgeSpy = spyOn(deviceDetected,
        'requiresTimestampOffsetFudge').and.returnValue(false);

    fakeEncryptionSpy = spyOn(shaka.media.ContentWorkarounds, 'fakeEncryption')
        .and.callFake((stream, data) => data + 100);

    // MediaSourceEngine uses video to:
    //  - set src attribute
    //  - read error codes when operations fail
    //  - seek to flush the pipeline on some platforms
    //  - check buffered.length to assert that flushing the pipeline is okay
    mockVideo = {
      firstElementChild: undefined,
      error: null,
      currentTime: 0,
      buffered: {
        length: 0,
      },
      appendChild: (element) => {
        mockVideo.firstElementChild = element;
      },
      removeChild: () => {
        mockVideo.firstElementChild = undefined;
      },
      removeAttribute: jasmine.createSpy('removeAttribute'),
      addEventListener: jasmine.createSpy('addVideoEventListener'),
      removeEventListener: jasmine.createSpy('removeVideoEventListener'),
      load: jasmine.createSpy('load'),
      play: jasmine.createSpy('play'),
      paused: true,
      autoplay: false,
    };
    video = /** @type {HTMLMediaElement} */(mockVideo);
    mockClosedCaptionParser = new shaka.test.FakeClosedCaptionParser();
    mockTextDisplayer = new shaka.test.FakeTextDisplayer();
    const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
    // FakeTransmuxer is not in the worker bundle; prevent worker creation so
    // transmux calls fall back to the main-thread inner transmuxer.
    spyOn(shaka.transmuxer.TransmuxerProxy, 'getOrCreateWorker_')
        .and.returnValue(null);

    onScte35 = jasmine.createSpy('onScte35');
    mediaSourceEngine = new shaka.media.MediaSourceEngine(
        video,
        mockTextDisplayer,
        {
          getKeySystem: () => null,
          onMetadata: () => {},
          onEmsg: () => {},
          onScte35: Util.spyFunc(onScte35),
          onEvent: () => {},
          onManifestUpdate: () => {},
          getDrmInfo: () => null,
        },
        config);
    mediaSourceEngine.getCaptionParser = () => {
      return /** @type {!shaka.media.ClosedCaptionParser} */(
        mockClosedCaptionParser);
    };
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
    const originalManagedMediaSource = window.ManagedMediaSource;
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
      if (window.ManagedMediaSource) {
        window.ManagedMediaSource = Util.spyFunc(mediaSourceSpy);
      }

      await mediaSourceEngine.destroy();
    });

    afterAll(() => {
      shaka.media.MediaSourceEngine.createObjectURL = originalCreateObjectURL;
      window.MediaSource = originalMediaSource;
      window.ManagedMediaSource = originalManagedMediaSource;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    });
    const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;

    it('creates a MediaSource object and sets video.src', () => {
      mediaSourceEngine = new shaka.media.MediaSourceEngine(
          video,
          new shaka.test.FakeTextDisplayer(),
          {
            getKeySystem: () => null,
            onMetadata: () => {},
            onEmsg: () => {},
            onScte35: () => {},
            onEvent: () => {},
            onManifestUpdate: () => {},
            getDrmInfo: () => null,
          },
          config);

      expect(createMediaSourceSpy).toHaveBeenCalled();
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(mockVideo.firstElementChild.src).toBe('blob:foo');
    });

    it('revokes object URL after MediaSource opens', () => {
      let onSourceOpenListener;

      mockMediaSource.addEventListener.and.callFake((event, callback, _) => {
        if (event == 'sourceopen') {
          onSourceOpenListener = callback;
        }
      });
      const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;

      mediaSourceEngine = new shaka.media.MediaSourceEngine(
          video,
          new shaka.test.FakeTextDisplayer(),
          {
            getKeySystem: () => null,
            onMetadata: () => {},
            onEmsg: () => {},
            onScte35: () => {},
            onEvent: () => {},
            onManifestUpdate: () => {},
            getDrmInfo: () => null,
          },
          config);

      if (window.ManagedMediaSource) {
        expect(mockMediaSource.addEventListener).toHaveBeenCalledTimes(3);
      } else {
        expect(mockMediaSource.addEventListener).toHaveBeenCalledTimes(1);
      }
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

    it('corrects audio codecs in multiplexed MP4 video', async () => {
      const stream = makeFakeStream('video/mp4');
      stream.codecs = 'opus,av01.0.08M.08';

      const initObject = new Map();
      initObject.set(ContentType.VIDEO, stream);
      await mediaSourceEngine.init(initObject, false);

      const audioCodec = shaka.util.MimeUtils.getCorrectAudioCodecs(
          'opus', stream.mimeType);
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledWith(
          `video/mp4; codecs="${audioCodec},av01.0.08M.08"`);
    });

    it('splits multiplexed content that a transmuxer splits', async () => {
      const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
      config.forceTransmux = true;
      mediaSourceEngine.configure(config);
      const stream = makeFakeStream('video/mp4');
      stream.codecs = 'mp4a.40.2,avc1.42E01E';

      const initObject = new Map();
      initObject.set(ContentType.VIDEO, stream);
      await mediaSourceEngine.init(initObject, false);

      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledTimes(2);
    });

    it('splits unsupported multiplexed content', async () => {
      // Each of the audio and the video may have a transmuxer of its own.
      shaka.transmuxer.TransmuxerEngine.findTransmuxer = (mimeType) => null;
      const stream = makeFakeStream('tsMimetype');
      stream.codecs = 'mp4a.40.34,avc1.64001F';

      const initObject = new Map();
      initObject.set(ContentType.VIDEO, stream);
      await mediaSourceEngine.init(initObject, false);

      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledTimes(2);
    });

    it('does not split multiplexed content without a transmuxer', async () => {
      shaka.transmuxer.TransmuxerEngine.findTransmuxer = (mimeType) => null;
      const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
      config.forceTransmux = true;
      mediaSourceEngine.configure(config);
      const stream = makeFakeStream('video/mp4');
      stream.codecs = 'mp4a.40.2,avc1.42E01E';

      const initObject = new Map();
      initObject.set(ContentType.VIDEO, stream);
      await mediaSourceEngine.init(initObject, false);

      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledOnceWith(
          'video/mp4; codecs="mp4a.40.2,avc1.42E01E"');

      // The first segment must not find the SourceBuffer type changed, which
      // would reset the MediaSource.
      createMediaSourceSpy.calls.reset();
      await mediaSourceEngine.setStreamProperties(
          ContentType.VIDEO, /* timestampOffset= */ 0,
          /* appendWindowStart= */ 0, /* appendWindowEnd= */ Infinity,
          /* ignoreTimestampOffset= */ false, stream.mimeType, stream.codecs,
          initObject);
      expect(createMediaSourceSpy).not.toHaveBeenCalled();
    });

    it('creates SourceBuffers with extra features', async () => {
      const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
      config.addExtraFeaturesToSourceBuffer = (mimeType) => {
        if (mimeType.includes('audio')) {
          return '; extra_audio_param';
        }
        if (mimeType.includes('video')) {
          return '; extra_video_param';
        }
        return '';
      };
      mediaSourceEngine.configure(config);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      await mediaSourceEngine.init(initObject, false);
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledWith(
          'audio/mp4; extra_audio_param');
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledWith(
          'video/mp4; extra_video_param');
      expect(shaka.text.TextEngine).not.toHaveBeenCalled();
    });

    it('creates SourceBuffers when MediaSource readyState is closed',
        async () => {
          const initObject = new Map();
          initObject.set(ContentType.AUDIO, fakeAudioStream);
          initObject.set(ContentType.VIDEO, fakeVideoStream);

          await mediaSourceEngine.open();

          mockMediaSource.readyState = 'closed';
          await expectAsync(
              mediaSourceEngine.init(initObject, false)).not.toBeRejected();
        });

    it('creates SourceBuffers when MediaSource readyState is ended',
        async () => {
          const initObject = new Map();
          initObject.set(ContentType.AUDIO, fakeAudioStream);
          initObject.set(ContentType.VIDEO, fakeVideoStream);

          await mediaSourceEngine.open();

          mockMediaSource.readyState = 'ended';
          await expectAsync(
              mediaSourceEngine.init(initObject, false)).not.toBeRejected();
        });

    it('creates TextEngines for text types', async () => {
      const initObject = new Map();
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
      expect(mockMediaSource.addSourceBuffer).not.toHaveBeenCalled();
      expect(shaka.text.TextEngine).toHaveBeenCalled();
    });

    it('always wraps transmuxer in TransmuxerProxy', async () => {
      const proxySpy = spyOn(shaka.transmuxer, 'TransmuxerProxy')
          .and.callThrough();

      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeTransportStream);
      await mediaSourceEngine.init(initObject, false);
      expect(proxySpy).toHaveBeenCalled();
    });

    it('passes transmuxWorkerUrl to TransmuxerProxy', async () => {
      const proxySpy = spyOn(shaka.transmuxer, 'TransmuxerProxy')
          .and.callThrough();
      const config =
          shaka.util.PlayerConfiguration.createDefault().mediaSource;
      config.transmuxWorkerUrl = 'https://example.com/worker.js';
      mediaSourceEngine.configure(config);

      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeTransportStream);
      await mediaSourceEngine.init(initObject, false);
      expect(proxySpy).toHaveBeenCalledOnceWith(
          mockTransmuxer, 'https://example.com/worker.js', null);
    });

    it('passes the chosen plugin priority to TransmuxerProxy', async () => {
      const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
      const proxySpy = spyOn(shaka.transmuxer, 'TransmuxerProxy')
          .and.callThrough();
      const prioritySpy =
          spyOn(TransmuxerEngine, 'findTransmuxerPluginPriority')
              .and.returnValue(TransmuxerEngine.PluginPriority.FALLBACK);
      const config =
          shaka.util.PlayerConfiguration.createDefault().mediaSource;
      config.transmuxWorkerUrl = 'https://example.com/worker.js';
      mediaSourceEngine.configure(config);

      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeTransportStream);
      await mediaSourceEngine.init(initObject, false);
      expect(prioritySpy).toHaveBeenCalledTimes(1);
      expect(proxySpy).toHaveBeenCalledOnceWith(
          mockTransmuxer, 'https://example.com/worker.js',
          TransmuxerEngine.PluginPriority.FALLBACK);
    });
  });

  describe('removeSourceBuffer', () => {
    beforeEach(() => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
    });

    for (const type of [ContentType.AUDIO, ContentType.VIDEO]) {
      it('removes only ' + type + ' without resetting MSE', async () => {
        await mediaSourceEngine.init(new Map([
          [ContentType.AUDIO, fakeAudioStream],
          [ContentType.VIDEO, fakeVideoStream],
        ]), false);
        const removed = type == ContentType.AUDIO ?
            audioSourceBuffer : videoSourceBuffer;
        const otherType = type == ContentType.AUDIO ?
            ContentType.VIDEO : ContentType.AUDIO;
        const remaining = type == ContentType.AUDIO ?
            videoSourceBuffer : audioSourceBuffer;
        const oldUpdateEnd = removed.updateend;
        createMediaSourceSpy.calls.reset();

        await mediaSourceEngine.removeSourceBuffer(type);
        // A queued event from the detached buffer must not consume a new op.
        oldUpdateEnd();
        await mediaSourceEngine.removeSourceBuffer(type);

        expect(mockMediaSource.removeSourceBuffer)
            .toHaveBeenCalledOnceWith(removed);
        expect(createMediaSourceSpy).not.toHaveBeenCalled();
        expect(mediaSourceEngine.hasSourceBufferFor(type)).toBe(false);
        expect(mediaSourceEngine.hasSourceBufferFor(otherType)).toBe(true);
        expect(removed.removeEventListener).toHaveBeenCalledTimes(2);
        expect(remaining.removeEventListener).not.toHaveBeenCalled();
        const append = mediaSourceEngine.appendBuffer(
            otherType, buffer, null, fakeStream, false);
        remaining.updateend();
        await append;
        expect(remaining.appendBuffer).toHaveBeenCalledOnceWith(buffer);
      });
    }

    it('waits for an append and discards queued and new work', async () => {
      await mediaSourceEngine.init(
          new Map([[ContentType.AUDIO, fakeAudioStream]]), false);
      const first = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream, false);
      const queued = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer2, null, fakeStream, false);
      const removal = mediaSourceEngine.removeSourceBuffer(ContentType.AUDIO);
      await mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer3, null, fakeStream, false);
      expect(mockMediaSource.removeSourceBuffer).not.toHaveBeenCalled();

      audioSourceBuffer.updateend();
      await Promise.all([first, queued, removal]);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledOnceWith(buffer);
      await mediaSourceEngine.clear(ContentType.AUDIO);
      await mediaSourceEngine.remove(ContentType.AUDIO, 0, 10);
      await mediaSourceEngine.flush(ContentType.AUDIO);
      await mediaSourceEngine.destroy();
    });

    it('allows retrying when native removal fails', async () => {
      await mediaSourceEngine.init(
          new Map([[ContentType.AUDIO, fakeAudioStream]]), false);
      mockMediaSource.removeSourceBuffer.and.throwError('removal failed');
      await expectAsync(
          mediaSourceEngine.removeSourceBuffer(ContentType.AUDIO))
          .toBeRejected();
      expect(mediaSourceEngine.hasSourceBufferFor(ContentType.AUDIO))
          .toBe(true);

      mockMediaSource.removeSourceBuffer.and.stub();
      await mediaSourceEngine.removeSourceBuffer(ContentType.AUDIO);
      expect(mediaSourceEngine.hasSourceBufferFor(ContentType.AUDIO))
          .toBe(false);
    });

    it('serializes repeated removal of the same buffer', async () => {
      await mediaSourceEngine.init(
          new Map([[ContentType.AUDIO, fakeAudioStream]]), false);
      await Promise.all([
        mediaSourceEngine.removeSourceBuffer(ContentType.AUDIO),
        mediaSourceEngine.removeSourceBuffer(ContentType.AUDIO),
      ]);
      expect(mockMediaSource.removeSourceBuffer).toHaveBeenCalledTimes(1);
      await mediaSourceEngine.endOfStream();
      await mediaSourceEngine.destroy();
    });

    it('waits for cleanup of the last buffer before resetting', async () => {
      const Decryptor = shaka.media.ClearKeyWebCryptoDecryptor;
      spyOn(Decryptor, 'shouldUse').and.returnValue(true);
      const cleanup = Promise.withResolvers();
      // Hold cleanup for the instances created internally by MSE.
      // eslint-disable-next-line no-restricted-syntax
      spyOn(Decryptor.prototype, 'destroy').and.returnValue(cleanup.promise);
      const streams = new Map([[ContentType.AUDIO, fakeAudioStream]]);
      await mediaSourceEngine.init(streams, false);
      createMediaSourceSpy.calls.reset();
      const removal = mediaSourceEngine.removeSourceBuffer(ContentType.AUDIO);
      await Util.shortDelay();
      expect(mediaSourceEngine.hasSourceBufferFor(ContentType.AUDIO))
          .toBe(false);
      const reset = mediaSourceEngine.reset(streams);
      await Util.shortDelay();
      expect(createMediaSourceSpy).not.toHaveBeenCalled();
      cleanup.resolve();
      await Promise.all([removal, reset]);
      expect(createMediaSourceSpy).toHaveBeenCalledTimes(1);
      await mediaSourceEngine.destroy();
    });

    for (const rejects of [false, true]) {
      it('discards pending transmuxing when it ' +
          (rejects ? 'rejects' : 'resolves') + ' after removal', async () => {
        await mediaSourceEngine.init(
            new Map([[ContentType.VIDEO, fakeTransportStream]]), false);
        const result = Promise.withResolvers();
        mockTransmuxer.transmux.and.returnValue(result.promise);
        const append = mediaSourceEngine.appendBuffer(
            ContentType.VIDEO, buffer, null, fakeStream, false);
        await mediaSourceEngine.removeSourceBuffer(ContentType.VIDEO);
        if (rejects) {
          result.reject(new Error('worker destroyed'));
        } else {
          result.resolve({init: buffer2, data: buffer3});
        }
        await expectAsync(append).toBeResolved();
        expect(videoSourceBuffer.appendBuffer).not.toHaveBeenCalled();
        expect(mockTransmuxer.destroy).toHaveBeenCalled();
      });
    }
  });

  describe('remaining outputs of split content', () => {
    beforeEach(async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const placeholder = makeFakeStream('audio/mp4');
      placeholder.isAudioMuxedInVideo = true;
      await mediaSourceEngine.init(new Map([
        [ContentType.VIDEO, fakeVideoStream],
        [ContentType.AUDIO, placeholder],
      ]), true);
    });

    for (const type of [ContentType.AUDIO, ContentType.VIDEO]) {
      it('routes operations to the remaining ' + type, async () => {
        const removedType = type == ContentType.AUDIO ?
            ContentType.VIDEO : ContentType.AUDIO;
        const remaining = type == ContentType.AUDIO ?
            audioSourceBuffer : videoSourceBuffer;
        const removed = type == ContentType.AUDIO ?
            videoSourceBuffer : audioSourceBuffer;
        await mediaSourceEngine.removeSourceBuffer(removedType);

        const append = mediaSourceEngine.appendBuffer(
            ContentType.VIDEO, buffer, null, fakeStream, false);
        remaining.updateend();
        await append;
        expect(remaining.appendBuffer).toHaveBeenCalledOnceWith(buffer);
        expect(removed.appendBuffer).not.toHaveBeenCalled();

        const remove = mediaSourceEngine.remove(ContentType.VIDEO, 0, 10);
        remaining.updateend();
        await remove;
        const clear = mediaSourceEngine.clear(ContentType.VIDEO);
        remaining.updateend();
        await clear;
        await mediaSourceEngine.resync(ContentType.VIDEO, 20);
        await mediaSourceEngine.flush(ContentType.VIDEO);
        await mediaSourceEngine.setStreamProperties(
            ContentType.VIDEO, 20, 1, 30, false,
            type == ContentType.AUDIO ? 'audio/mp4' : 'video/mp4', '',
            new Map([[type, type == ContentType.AUDIO ?
                fakeAudioStream : fakeVideoStream]]));

        expect(remaining.remove).toHaveBeenCalledTimes(2);
        expect(remaining.timestampOffset).toBe(20);
        expect(remaining.appendWindowStart).toBe(1);
        expect(remaining.appendWindowEnd).toBe(30);
        expect(removed.remove).not.toHaveBeenCalled();
        expect(removed.abort).not.toHaveBeenCalled();
      });
    }

    it('does not duplicate operations on audio', async () => {
      const remove = mediaSourceEngine.remove(ContentType.AUDIO, 0, 10);
      audioSourceBuffer.updateend();
      await remove;
      expect(audioSourceBuffer.remove).toHaveBeenCalledOnceWith(0, 10);
      expect(videoSourceBuffer.remove).not.toHaveBeenCalled();
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
      requiresEC3InitSegments.and.returnValue(false);
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

    it('does not append empty data to the SourceBuffer', async () => {
      // Resolves without an 'updateend' event from the SourceBuffer.
      await mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, new Uint8Array(0), null, fakeStream,
          /* hasClosedCaptions= */ false);
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      // The queue keeps moving after the skipped append.
      const p = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ false);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      audioSourceBuffer.updateend();
      await p;
    });

    it('invokes modifyPreselectionSegmentCallback for Preselection streams',
        async () => {
          const stream =
              shaka.test.StreamingEngineUtil.createMockAudioStream(9);
          stream.preselection = {id: '10', tag: '1'};

          /** @type {!jasmine.Spy} */
          const modifySpy =
              jasmine.createSpy('modifyPreselectionSegmentCallback');
          modifySpy.and.callFake((preselectionSegmentInfo) => {
            // Return a copy so the assertion below sees the original data
            // that was passed in.
            return Object.assign({}, preselectionSegmentInfo, {data: buffer2});
          });

          const config =
              shaka.util.PlayerConfiguration.createDefault().mediaSource;
          config.modifyPreselectionSegmentCallback =
              shaka.test.Util.spyFunc(modifySpy);
          mediaSourceEngine.configure(config);

          const p = mediaSourceEngine.appendBuffer(
              ContentType.AUDIO, buffer, null, stream,
              /* hasClosedCaptions= */ false);

          expect(modifySpy).toHaveBeenCalledWith(jasmine.objectContaining({
            data: buffer,
            preselection: {id: '10', tag: '1'},
            contentType: ContentType.AUDIO,
            isInitSegment: true,
          }));
          expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer2);
          audioSourceBuffer.updateend();
          await p;
        });

    it('appends Preselection stream data unmodified by default', async () => {
      const stream =
          shaka.test.StreamingEngineUtil.createMockAudioStream(9);
      stream.preselection = {id: '10', tag: '1'};

      const p = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, stream,
          /* hasClosedCaptions= */ false);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      audioSourceBuffer.updateend();
      await p;
    });

    it('returns parsed media timestamp', async () => {
      const reference = dummyReference(7, 10);
      spyOn(mediaSourceEngine, 'getTimestampAndDispatchMetadata')
          .and.returnValue({
            timestamp: 5,
            metadata: [],
            scte35: [],
          });

      const p = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, reference, fakeStream,
          /* hasClosedCaptions= */ false);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      audioSourceBuffer.updateend();

      const appendBufferInfo = await p;
      expect(appendBufferInfo.mediaTimestamp).toBe(5);
    });

    it('returns null media timestamp when none is parsed', async () => {
      const reference = dummyReference(7, 10);
      spyOn(mediaSourceEngine, 'getTimestampAndDispatchMetadata')
          .and.returnValue({
            timestamp: null,
            metadata: [],
            scte35: [],
          });

      const p = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, reference, fakeStream,
          /* hasClosedCaptions= */ false);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      audioSourceBuffer.updateend();

      const appendBufferInfo = await p;
      expect(appendBufferInfo.mediaTimestamp).toBeNull();
    });

    it('rejects promise when operation throws', async () => {
      const reference = dummyReference(0, 1000);
      audioSourceBuffer.appendBuffer.and.throwError('fail!');
      mockVideo.error = {code: 5, message: 'something failed'};
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
          jasmine.objectContaining({message: 'fail!'}),
          jasmine.objectContaining({code: 5, message: 'something failed'}),
          reference.getUris()[0]));
      await expectAsync(
          mediaSourceEngine.appendBuffer(
              ContentType.AUDIO, buffer, reference, fakeStream,
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
      const reference = dummyReference(0, 1000);
      mockVideo.error = {code: 5};
      const p = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, reference, fakeStream,
          /* hasClosedCaptions= */ false);
      audioSourceBuffer.error();
      audioSourceBuffer.updateend();

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED,
          5,
          reference.getUris()[0]));
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
          data, 0, 10, 'foo://bar', -1);
    });

    it('forwards to TextEngine HLS discontinuity sequence', async () => {
      const data = new ArrayBuffer(0);
      expect(mockTextEngine.appendBuffer).not.toHaveBeenCalled();
      const reference = dummyReference(0, 10);
      reference.discontinuitySequence = 1;
      await mediaSourceEngine.appendBuffer(
          ContentType.TEXT, data, reference, fakeStream,
          /* hasClosedCaptions= */ false);
      expect(mockTextEngine.appendBuffer).toHaveBeenCalledWith(
          data, 0, 10, 'foo://bar', 1);
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

    it('passed continuity timeline to caption parser', async () => {
      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeVideoStream);

      mockClosedCaptionParser.parseFromSpy.and.callFake((data) => {
        return ['foo', 'bar'];
      });

      await mediaSourceEngine.init(initObject, false);

      // Initialize the closed caption parser.
      let appendInit = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ true, /* seeked= */ false,
          /* adaptation= */ false, /* isChunkedData= */ false,
          /* fromSplit= */ false, /* continuityTimeline= */ 0);
      // In MediaSourceEngine, appendBuffer() is async and Promise-based, but
      // at the browser level, it's event-based.
      // MediaSourceEngine waits for the 'updateend' event from the
      // SourceBuffer, and uses that to resolve the appendBuffer Promise.
      // Here, we must trigger the event on the fake/mock SourceBuffer before
      // waiting on the appendBuffer Promise.
      videoSourceBuffer.updateend();
      await appendInit;

      expect(mockClosedCaptionParser.initSpy)
          .toHaveBeenCalledWith(buffer, false, 0);

      // new init segment
      appendInit = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ true, /* seeked= */ false,
          /* adaptation= */ false, /* isChunkedData= */ false,
          /* fromSplit= */ false, /* continuityTimeline= */ 1);
      videoSourceBuffer.updateend();
      await appendInit;

      expect(mockClosedCaptionParser.initSpy)
          .toHaveBeenCalledWith(buffer, false, 1);

      // new init segment
      appendInit = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ true, /* seeked= */ false,
          /* adaptation= */ true, /* isChunkedData= */ false,
          /* fromSplit= */ false, /* continuityTimeline= */ 1);
      videoSourceBuffer.updateend();
      await appendInit;

      expect(mockClosedCaptionParser.initSpy)
          .toHaveBeenCalledWith(buffer, true, 1);
    });

    it('passes continuity timeline through split muxed content', async () => {
      const muxedAudioStream = makeFakeStream('audio/mp4');
      muxedAudioStream.fullMimeTypes = new Set([muxedAudioStream.mimeType]);
      muxedAudioStream.isAudioMuxedInVideo = true;
      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      initObject.set(ContentType.AUDIO, muxedAudioStream);
      await mediaSourceEngine.init(initObject, false);

      const appendInit = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ true, /* seeked= */ false,
          /* adaptation= */ false, /* isChunkedData= */ false,
          /* fromSplit= */ false, /* continuityTimeline= */ 7);
      // Split muxed content appends video, then audio, each waiting for its
      // own 'updateend'.
      await Util.shortDelay();
      expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      videoSourceBuffer.updateend();
      await Util.shortDelay();
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      audioSourceBuffer.updateend();
      await appendInit;

      expect(mockClosedCaptionParser.initSpy)
          .toHaveBeenCalledWith(buffer, false, 7);
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

    for (const adaptation of [false, true]) {
      it('anchors raw audio after ' + (adaptation ? 'adaptation' : 'seek') +
          ' with a segments-mode manifest', async () => {
        const config =
            shaka.util.PlayerConfiguration.createDefault().mediaSource;
        config.forceTransmux = true;
        mediaSourceEngine.configure(config);
        mockTransmuxer.convertCodecs.and.returnValue('audio/mpeg');
        mockTransmuxer.transmux.and.returnValue(Promise.resolve({
          data: buffer,
          init: null,
        }));
        const stream = makeFakeStream('audio/x-matroska');
        stream.fullMimeTypes = new Set([stream.mimeType]);
        const initObject = new Map();
        initObject.set(ContentType.AUDIO, stream);
        audioSourceBuffer.mode = 'sequence';
        await mediaSourceEngine.init(initObject, /* sequenceMode= */ false);

        const reference = dummyReference(0, 1000);
        reference.startTime = 2;
        reference.timestampOffset = 0;
        // The same segment was appended before the buffer was cleared.
        // MSE advanced the generated timestamps, while StreamingEngine still
        // remembers the requested offset and will not set it again.
        audioSourceBuffer.timestampOffset = 3;
        const appendAudio = mediaSourceEngine.appendBuffer(
            ContentType.AUDIO, buffer, reference, fakeStream,
            /* hasClosedCaptions= */ false, /* seeked= */ !adaptation,
            adaptation);
        await Util.shortDelay();
        expect(audioSourceBuffer.timestampOffset).toBe(2);
        expect(audioSourceBuffer.abort).toHaveBeenCalled();
        audioSourceBuffer.updateend();
        await appendAudio;

        // A following segment keeps MSE's generated timestamps rather than
        // resetting the parser and starting a new coded frame group.
        audioSourceBuffer.abort.calls.reset();
        audioSourceBuffer.timestampOffset = 3;
        reference.startTime = 3;
        const appendNext = mediaSourceEngine.appendBuffer(
            ContentType.AUDIO, buffer, reference, fakeStream,
            /* hasClosedCaptions= */ false);
        await Util.shortDelay();
        expect(audioSourceBuffer.timestampOffset).toBe(3);
        expect(audioSourceBuffer.abort).not.toHaveBeenCalled();
        audioSourceBuffer.updateend();
        await appendNext;
      });
    }

    // Regression test for the interaction between the legacy Edge rounding
    // workaround in setTimestampOffset_ and the per-segment recalculation of
    // the timestamp offset.  The workaround adds 0.001 to any negative offset
    // before writing it to the SourceBuffer, so reading it back and comparing
    // it against a freshly calculated offset reported a 0.001 difference on
    // every segment.  That difference met the "did it change?" threshold, so
    // every append was preceded by an abort(), which resets MSE's coded frame
    // processing and makes it drop everything up to the next keyframe.  On
    // content whose segments are not cut on a GOP boundary, that dropped the
    // start of every segment and left a gap in the buffered ranges.
    it('does not re-set an unchanged negative timestampOffset', async () => {
      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeVideoStream);

      await mediaSourceEngine.init(initObject, /* sequenceMode= */ false,
          shaka.media.ManifestParser.HLS);

      // Media timestamps that start far from zero, as in an MPEG-TS stream
      // carrying a real-time clock, so the offset comes out negative.
      const mediaStart = 92703.440178;
      spyOn(mediaSourceEngine, 'getTimestampAndDispatchMetadata')
          .and.callFake((contentType, data, reference) => {
            return {
              timestamp: mediaStart + reference.startTime,
              metadata: [],
              scte35: [],
            };
          });

      const expectedOffset = -mediaStart;

      /** @param {number} startTime */
      const appendSegment = async (startTime) => {
        const reference = dummyReference(startTime, startTime + 10);
        const append = mediaSourceEngine.appendBuffer(
            ContentType.VIDEO, buffer, reference, fakeStream,
            /* hasClosedCaptions= */ false);
        videoSourceBuffer.updateend();
        await append;
      };

      await appendSegment(0);

      expect(videoSourceBuffer.timestampOffset).toBeCloseTo(expectedOffset, 6);
      videoSourceBuffer.abort.calls.reset();

      // Every later segment resolves to the same offset, so none of them
      // should abort or touch timestampOffset again.  These have to be
      // appended one at a time, since each one needs its own updateend.
      await appendSegment(10);
      await appendSegment(20);
      await appendSegment(30);

      expect(videoSourceBuffer.abort).not.toHaveBeenCalled();
      expect(videoSourceBuffer.timestampOffset).toBeCloseTo(expectedOffset, 6);
    });

    describe('with segments that start in the middle of a GOP', () => {
      // How far the first frame of such a segment is from where the playlist
      // says it starts, as when it is not the earliest one to be presented.
      const midGopShift = 0.16;

      /** @type {!jasmine.Spy} */
      let getTimestampSpy;

      /**
       * @param {number} startTime
       * @param {boolean} startsMidGop
       * @param {boolean=} seeked
       */
      const appendSegment = async (startTime, startsMidGop, seeked = false) => {
        getTimestampSpy.and.returnValue({
          timestamp: startTime + (startsMidGop ? midGopShift : 0),
          metadata: [],
          scte35: [],
          startsMidGop: startsMidGop,
        });
        const append = mediaSourceEngine.appendBuffer(
            ContentType.VIDEO, buffer, dummyReference(startTime, startTime + 1),
            fakeStream, /* hasClosedCaptions= */ false, seeked);
        videoSourceBuffer.updateend();
        await append;
      };

      beforeEach(async () => {
        const initObject = new Map();
        initObject.set(ContentType.VIDEO, fakeVideoStream);
        await mediaSourceEngine.init(initObject, /* sequenceMode= */ false,
            shaka.media.ManifestParser.HLS);
        getTimestampSpy =
            spyOn(mediaSourceEngine, 'getTimestampAndDispatchMetadata');

        await appendSegment(10, /* startsMidGop= */ false);
        expect(videoSourceBuffer.timestampOffset).toBeCloseTo(0, 6);
        videoSourceBuffer.abort.calls.reset();
      });

      // Moving it would abort(), and the SourceBuffer would then drop every
      // frame up to the next key frame: the whole segment.
      it('keeps the timestampOffset of the segment before', async () => {
        await appendSegment(11, /* startsMidGop= */ true);

        expect(videoSourceBuffer.abort).not.toHaveBeenCalled();
        expect(videoSourceBuffer.timestampOffset).toBeCloseTo(0, 6);
      });

      it('moves the timestampOffset after a jump in the timeline', async () => {
        getTimestampSpy.and.returnValue({
          timestamp: 41,
          metadata: [],
          scte35: [],
          startsMidGop: true,
        });
        const append = mediaSourceEngine.appendBuffer(
            ContentType.VIDEO, buffer, dummyReference(11, 12), fakeStream,
            /* hasClosedCaptions= */ false);
        videoSourceBuffer.updateend();
        await append;

        expect(videoSourceBuffer.abort).toHaveBeenCalled();
        expect(videoSourceBuffer.timestampOffset).toBeCloseTo(-30, 6);
      });

      it('moves the timestampOffset after a seek', async () => {
        await appendSegment(11, /* startsMidGop= */ true, /* seeked= */ true);

        expect(videoSourceBuffer.abort).toHaveBeenCalled();
        expect(videoSourceBuffer.timestampOffset)
            .toBeCloseTo(-midGopShift, 6);
      });
    });

    // Chromium, Gecko and WebKit have all been measured to place the first
    // frame exactly on appendWindowStart for a negative timestampOffset, so
    // the fudge from https://github.com/shaka-project/shaka-player/issues/1281
    // only runs where the device asks for it.  See the matching integration
    // test, which verifies the measurement against a real SourceBuffer.
    /**
     * @param {boolean} requiresFudge
     * @return {!Promise<number>}
     */
    const appendWithNegativeOffset = async (requiresFudge) => {
      requiresTimestampOffsetFudgeSpy.and.returnValue(requiresFudge);

      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      await mediaSourceEngine.init(initObject, /* sequenceMode= */ false,
          shaka.media.ManifestParser.HLS);

      const mediaStart = 92703.440178;
      spyOn(mediaSourceEngine, 'getTimestampAndDispatchMetadata')
          .and.returnValue({timestamp: mediaStart, metadata: [], scte35: []});

      const append = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, dummyReference(0, 10), fakeStream,
          /* hasClosedCaptions= */ false);
      videoSourceBuffer.updateend();
      await append;

      return videoSourceBuffer.timestampOffset;
    };

    it('does not fudge a negative offset by default', async () => {
      const offset = await appendWithNegativeOffset(false);
      expect(offset).toBeCloseTo(-92703.440178, 6);
    });

    it('fudges a negative offset when the device requires it', async () => {
      const offset = await appendWithNegativeOffset(true);
      expect(offset).toBeCloseTo(-92703.440178 + 0.001, 6);
    });
  });

  describe('getTimestampAndDispatchMetadata', () => {
    /** @type {!BufferSource} */
    let packedAac;
    /** @type {!BufferSource} */
    let tsAudio;

    beforeAll(async () => {
      [packedAac, tsAudio] = await Promise.all([
        Util.fetch('/base/test/test/assets/hls-raw-aac/fileSequence0.aac'),
        Util.fetch('/base/test/test/assets/audio.ts'),
      ]);
    });

    it('reads the ID3 timestamp of raw AAC', () => {
      const {timestamp} = mediaSourceEngine.getTimestampAndDispatchMetadata(
          ContentType.AUDIO, packedAac, dummyReference(0, 10), fakeStream,
          'audio/aac');
      expect(timestamp).toBeCloseTo(9.907, 3);
    });

    // Packed audio is sometimes published with a .ts extension, so the stream
    // claims MPEG-2 TS.  The transmuxer handles it as packed audio, so the
    // timestamp must come from the ID3 tag too, or the audio never gets a
    // timestamp offset and never lines up with video.
    // See https://github.com/shaka-project/shaka-player/issues/10654
    it('reads the ID3 timestamp of raw AAC labelled as TS', () => {
      const {timestamp} = mediaSourceEngine.getTimestampAndDispatchMetadata(
          ContentType.AUDIO, packedAac, dummyReference(0, 10), fakeStream,
          'video/mp2t; codecs="mp4a.40.2"');
      expect(timestamp).toBeCloseTo(9.907, 3);
    });

    it('still reads the PES timestamp of real TS audio', () => {
      const {timestamp} = mediaSourceEngine.getTimestampAndDispatchMetadata(
          ContentType.AUDIO, tsAudio, dummyReference(0, 10), fakeStream,
          'video/mp2t; codecs="mp4a.40.2"');
      expect(timestamp).toBeCloseTo(56.013333, 3);
    });

    it('does not treat video labelled as TS as packed audio', () => {
      const {timestamp} = mediaSourceEngine.getTimestampAndDispatchMetadata(
          ContentType.VIDEO, packedAac, dummyReference(0, 10), fakeStream,
          'video/mp2t; codecs="avc1.42E01E"');
      expect(timestamp).toBeNull();
    });
  });

  describe('in-band SCTE-35', () => {
    const Scte35 = shaka.test.Scte35;
    const pid = 500;
    /** 2^33, where 33-bit timestamps wrap. */
    const maxTs = 8589934592;

    /** @type {!BufferSource} */
    let videoSegment;
    /**
     * The media time of the first frame of video.ts, about 57.4 seconds.
     * @type {number}
     */
    let segmentStart;

    beforeAll(async () => {
      videoSegment = await Util.fetch('/base/test/test/assets/video.ts');
      const tsParser = new shaka.util.TsParser().parse(
          BufferUtils.toUint8(videoSegment));
      const startTime = tsParser.getStartTimeFromPesHeaders(ContentType.VIDEO);
      goog.asserts.assert(startTime != null, 'video.ts should have a PTS');
      segmentStart = startTime;
    });

    beforeEach(async () => {
      const tsStream = makeFakeStream('video/mp2t');
      tsStream.fullMimeTypes = new Set([tsStream.mimeType]);
      const initObject = new Map();
      initObject.set(ContentType.VIDEO, tsStream);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      // HLS in segments mode, so the timestamp offset comes from the segment.
      await mediaSourceEngine.init(initObject, /* sequenceMode= */ false,
          shaka.media.ManifestParser.HLS);
      // Parsing the segment and setting the timestamp offset come before the
      // append, so finish each append when it is issued.
      videoSourceBuffer.appendBuffer.and.callFake(() => {
        Util.shortDelay().then(() => videoSourceBuffer.updateend());
      });
    });

    /**
     * Appends video.ts carrying the given sections at the given position.
     *
     * @param {!Array<!Uint8Array>} sections
     * @param {number=} startTime
     * @return {!Promise}
     */
    const append = async (sections, startTime = 10) => {
      const segment = Scte35.addToTs(videoSegment, pid, sections);
      await mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, segment, dummyReference(startTime, startTime + 10),
          fakeStream, /* hasClosedCaptions= */ false);
      expect(videoSourceBuffer.appendBuffer).toHaveBeenCalled();
    };

    /** @return {!Array<shaka.extern.Scte35Event>} */
    const reported = () => onScte35.calls.allArgs().map((args) => args[0]);

    /**
     * @param {!Uint8Array} section
     * @return {string}
     */
    const idOf = (section) => {
      const crc = BufferUtils.toDataView(section)
          .getUint32(section.length - 4);
      return pid + '-' + crc.toString(16).padStart(8, '0');
    };

    it('places a splice_insert at its splice time', async () => {
      const section = Scte35.spliceInsert(60 * 90000);
      await append([section]);

      expect(onScte35).toHaveBeenCalledTimes(1);
      const event = reported()[0];
      expect(event.schemeIdUri).toBe('urn:scte:scte35:2013:bin');
      expect(event.source).toBe('ts');
      expect(event.kind).toBe('');
      expect(event.id).toBe(idOf(section));
      expect(event.data).toEqual(section);
      expect(event.node).toBeNull();
      // The segment's first frame plays at 10 seconds.
      expect(event.startTime).toBeCloseTo(10 + 60 - segmentStart, 3);
      expect(event.endTime).toBe(event.startTime);
    });

    it('places a time_signal at its splice time', async () => {
      await append([Scte35.timeSignal(58 * 90000)]);
      expect(onScte35).toHaveBeenCalledTimes(1);
      expect(reported()[0].startTime).toBeCloseTo(10 + 58 - segmentStart, 3);
    });

    it('applies pts_adjustment', async () => {
      await append([
        Scte35.spliceInsert(maxTs - 90000, {ptsAdjustment: 61 * 90000}),
      ]);
      expect(onScte35).toHaveBeenCalledTimes(1);
      expect(reported()[0].startTime).toBeCloseTo(10 + 60 - segmentStart, 3);
    });

    it('takes the splice time closest to the segment across a wrap',
        async () => {
          // One second before 0 is just before the segment, not 26.5 hours
          // after it.
          await append([Scte35.spliceInsert(maxTs - 90000)]);
          expect(onScte35).toHaveBeenCalledTimes(1);
          expect(reported()[0].startTime)
              .toBeCloseTo(10 - 1 - segmentStart, 3);
        });

    it('places an immediate splice at the segment start', async () => {
      await append([Scte35.spliceInsert(null)], 20);
      expect(onScte35).toHaveBeenCalledTimes(1);
      expect(reported()[0].startTime).toBe(20);
    });

    it('places an encrypted section at the segment start', async () => {
      await append([Scte35.spliceInsert(60 * 90000, {encrypted: true})], 20);
      expect(onScte35).toHaveBeenCalledTimes(1);
      expect(reported()[0].startTime).toBe(20);
    });

    it('ignores splice_null heartbeats', async () => {
      await append([Scte35.spliceNull()]);
      expect(onScte35).not.toHaveBeenCalled();
    });

    it('reports a retransmitted section once', async () => {
      const section = Scte35.spliceInsert(60 * 90000);
      await append([section, section]);
      await append([section], 20);
      expect(onScte35).toHaveBeenCalledTimes(1);

      const other = Scte35.spliceInsert(60 * 90000, {eventId: 2});
      await append([section, other], 30);
      expect(onScte35).toHaveBeenCalledTimes(2);
      expect(reported()[1].id).toBe(idOf(other));
    });

    it('reports a section spanning several packets', async () => {
      const descriptors = new Array(400).fill(0x42);
      const section = Scte35.spliceInsert(60 * 90000, {descriptors});
      await append([section]);
      expect(onScte35).toHaveBeenCalledTimes(1);
      expect(reported()[0].data).toEqual(section);
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

    it('caption parser is not updated on audio remove', async () => {
      // init caption parser
      const appendInit = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ true, /* seeked= */ false,
          /* adaptation= */ false, /* isChunkedData= */ false,
          /* fromSplit= */ false, /* continuityTimeline= */ 0);
      videoSourceBuffer.updateend();
      await appendInit;

      const p = mediaSourceEngine.remove(ContentType.AUDIO, 1, 5, [0]);
      audioSourceBuffer.updateend();

      await p;
      expect(mockClosedCaptionParser.removeSpy).not.toHaveBeenCalledWith([0]);
    });

    it('caption parser is updated on video remove', async () => {
      // init caption parser
      const appendInit = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream,
          /* hasClosedCaptions= */ true, /* seeked= */ false,
          /* adaptation= */ false, /* isChunkedData= */ false,
          /* fromSplit= */ false, /* continuityTimeline= */ 0);
      videoSourceBuffer.updateend();
      await appendInit;

      const p = mediaSourceEngine.remove(ContentType.VIDEO, 1, 5, [0]);
      videoSourceBuffer.updateend();

      await p;
      expect(mockClosedCaptionParser.removeSpy).toHaveBeenCalledWith([0]);
    });

    it('rejects promise when operation throws', async () => {
      audioSourceBuffer.remove.and.throwError('fail!');
      mockVideo.error = {code: 5};

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
          jasmine.objectContaining({message: 'fail!'}),
          jasmine.objectContaining({code: 5}),
          null));
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
          5,
          null));
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

      // An integration test involving both StreamingEngine
      // and MediaSourceEngine would also be problematic.  The bug involved
      // a race, so it would be difficult to reproduce the necessary timing.
      // And if we succeeded, it would be tough to detect that we were
      // definitely in a seek loop, since nothing was mocked.

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
          fakeStream.mimeType,
          fakeStream.codecs,
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
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
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
    const initObject = new Map();
    initObject.set(ContentType.VIDEO, fakeVideoStream);
    initObject.set(ContentType.AUDIO, fakeAudioStream);

    /**
     * @param {!Map<shaka.util.ManifestParserUtils.ContentType,
     *              shaka.extern.Stream>} initObject
     * @suppress {visibility}
     */
    async function resetMSE(initObject) {
      await mediaSourceEngine.reset_(initObject);
    }

    it('creates a video queue after audio-only playback', async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      await mediaSourceEngine.init(
          new Map([[ContentType.AUDIO, fakeAudioStream]]), false);
      mockMediaSource.durationGetter.and.returnValue(100);
      await mediaSourceEngine.reset(initObject);
      const append = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, fakeStream, false);
      videoSourceBuffer.updateend();
      await append;
      expect(mockMediaSource.durationSetter).toHaveBeenCalledWith(100);
      expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledOnceWith(buffer);
      await mediaSourceEngine.destroy();
    });

    it('creates queues for both outputs of one muxed TS stream', async () => {
      mockTransmuxer.convertCodecs.and.callFake((type) =>
        type == ContentType.AUDIO ? 'audio/mp4' : 'video/mp4');
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      await mediaSourceEngine.init(
          new Map([[ContentType.AUDIO, fakeAudioStream]]), false);
      const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
      config.forceTransmux = true;
      mediaSourceEngine.configure(config);
      const stream = makeFakeStream('video/mp2t');
      stream.codecs = 'mp4a.40.2,avc1.42E01E';
      await mediaSourceEngine.reset(new Map([[ContentType.VIDEO, stream]]));
      expect(mediaSourceEngine.hasSourceBufferFor(ContentType.AUDIO))
          .toBe(true);
      expect(mediaSourceEngine.hasSourceBufferFor(ContentType.VIDEO))
          .toBe(true);
      await mediaSourceEngine.endOfStream();
      await mediaSourceEngine.destroy();
    });

    it('does not remove a replacement from a preceding reset', async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      await mediaSourceEngine.init(
          new Map([[ContentType.AUDIO, fakeAudioStream]]), false);
      const original = audioSourceBuffer;
      const reset = mediaSourceEngine.reset(initObject);
      const removal = mediaSourceEngine.removeSourceBuffer(ContentType.AUDIO);
      audioSourceBuffer = createMockSourceBuffer();
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      await Promise.all([reset, removal]);
      expect(mediaSourceEngine.hasSourceBufferFor(ContentType.AUDIO))
          .toBe(true);
      expect(mockMediaSource.removeSourceBuffer).toHaveBeenCalledOnceWith(
          original);
      const append = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream, false);
      audioSourceBuffer.updateend();
      await append;
      await mediaSourceEngine.destroy();
    });

    it('restores a removed buffer with a subsequent reset', async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      await mediaSourceEngine.init(initObject, false);
      await mediaSourceEngine.removeSourceBuffer(ContentType.AUDIO);
      audioSourceBuffer = createMockSourceBuffer();
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      await mediaSourceEngine.reset(initObject);
      const append = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, fakeStream, false);
      audioSourceBuffer.updateend();
      await append;
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledOnceWith(buffer);
      await mediaSourceEngine.destroy();
    });

    /** @suppress {visibility} */
    function simulatePlaybackBeginning() {
      mediaSourceEngine.playbackHasBegun_ = true;
    }

    it('should re-create a new MediaSource', async () => {
      await mediaSourceEngine.init(initObject, false);
      await resetMSE(initObject);
      expect(createMediaSourceSpy).toHaveBeenCalled();
    });

    it('should re-create the audio & video source buffers', async () => {
      await mediaSourceEngine.init(initObject, false);
      mockMediaSource.addSourceBuffer.calls.reset();
      await resetMSE(initObject);
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledTimes(2);
    });

    it('should preserve autoplay and paused state', async () => {
      await mediaSourceEngine.init(initObject, false);

      mockVideo.autoplay = true;
      mockVideo.paused = true;

      let canPlayThroughListener = null;
      mockVideo.addEventListener.and.callFake((eventName, callback, _) => {
        if (eventName == 'canplaythrough') {
          canPlayThroughListener = callback;
        }
      });

      simulatePlaybackBeginning();
      await resetMSE(initObject);

      expect(canPlayThroughListener).not.toBe(null);
      if (!canPlayThroughListener) {
        return;
      }
      canPlayThroughListener({target: mockVideo});

      expect(mockVideo.autoplay).toBe(true);
      expect(mockVideo.paused).toBe(true);
      expect(mockVideo.play).not.toHaveBeenCalled();
    });

    it('should not clear autoplay if playback has not begun', async () => {
      await mediaSourceEngine.init(initObject, false);

      mockVideo.autoplay = true;

      let setCount = 0;
      Object.defineProperty(mockVideo, 'autoplay', {
        get: () => true,
        set: () => {
          setCount++;
        },
      });

      await resetMSE(initObject);
      expect(setCount).toBe(0);
    });

    it('is reloading until the position is restored', async () => {
      await mediaSourceEngine.init(initObject, false);

      let loadedMetadataListener = null;
      mockVideo.addEventListener.and.callFake((eventName, callback, _) => {
        if (eventName == 'loadedmetadata') {
          loadedMetadataListener = callback;
        }
      });

      mockVideo.currentTime = 26;
      const reset = resetMSE(initObject);
      mockVideo.currentTime = 0;
      await reset;

      // Segments appended to the new MediaSource must not be treated as the
      // initial buffer gap before the position has been restored.
      expect(mediaSourceEngine.isReloadingMediaSource()).toBe(true);

      expect(loadedMetadataListener).not.toBe(null);
      if (!loadedMetadataListener) {
        return;
      }
      loadedMetadataListener({target: mockVideo});

      expect(mockVideo.currentTime).toBe(26);
      expect(mediaSourceEngine.isReloadingMediaSource()).toBe(false);
    });

    it('should preserve playing state', async () => {
      await mediaSourceEngine.init(initObject, false);

      mockVideo.autoplay = false;
      mockVideo.paused = false;

      let canPlayThroughListener = null;
      mockVideo.addEventListener.and.callFake((eventName, callback, _) => {
        if (eventName == 'canplaythrough') {
          canPlayThroughListener = callback;
        }
      });

      simulatePlaybackBeginning();
      await resetMSE(initObject);

      expect(canPlayThroughListener).not.toBe(null);
      if (!canPlayThroughListener) {
        return;
      }
      canPlayThroughListener({target: mockVideo});

      expect(mockVideo.autoplay).toBe(false);
      expect(mockVideo.paused).toBe(false);
      expect(mockVideo.play).toHaveBeenCalled();
    });
  });

  describe('changeType codec switching', () => {
    const initObject = new Map();
    initObject.set(ContentType.VIDEO, fakeVideoStream);
    initObject.set(ContentType.AUDIO, fakeAudioStream);
    const newMimeType = 'video/mp4; codecs="hvc1.1.6.L93.90"';

    /** @type {!jasmine.Spy} */
    let changeTypeSpy;
    /** @type {!jasmine.Spy} */
    let onBeforeResetSpy;

    beforeEach(/** @suppress {visibility} */ async () => {
      await mediaSourceEngine.init(initObject, false);
      changeTypeSpy = videoSourceBuffer.changeType;
      onBeforeResetSpy = jasmine.createSpy('onBeforeReset')
          .and.returnValue(Promise.resolve());
      spyOn(mediaSourceEngine, 'getInfoAboutResetOrChangeType_')
          .and.returnValue({
            type: shaka.media.MediaSourceEngine.ResetMode_.CHANGE_TYPE,
            newMimeType,
            transmuxer: null,
          });
      createMediaSourceSpy.calls.reset();
    });

    /** @return {!Promise} */
    function setStreamProperties() {
      return mediaSourceEngine.setStreamProperties(
          ContentType.VIDEO, /* timestampOffset= */ 0,
          /* appendWindowStart= */ 0, /* appendWindowEnd= */ Infinity,
          /* ignoreTimestampOffset= */ false, 'video/mp4', 'hvc1.1.6.L93.90',
          initObject, Util.spyFunc(onBeforeResetSpy));
    }

    it('uses changeType when it succeeds', async () => {
      await setStreamProperties();
      expect(changeTypeSpy).toHaveBeenCalledWith(newMimeType);
      expect(onBeforeResetSpy).not.toHaveBeenCalled();
      expect(createMediaSourceSpy).not.toHaveBeenCalled();
    });

    it('falls back to a MediaSource reset when changeType throws',
        async () => {
          changeTypeSpy.and.throwError(new Error('NotSupportedError'));
          await setStreamProperties();
          expect(changeTypeSpy).toHaveBeenCalledWith(newMimeType);
          expect(onBeforeResetSpy).toHaveBeenCalled();
          expect(createMediaSourceSpy).toHaveBeenCalled();
        });

    it('resolves changeType with false when it throws', async () => {
      changeTypeSpy.and.throwError(new Error('NotSupportedError'));
      const changed = await mediaSourceEngine.changeType(
          ContentType.VIDEO, newMimeType, null);
      expect(changed).toBe(false);
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
      // Note: Canceling a blocking operation means doing nothing more about
      // the operation.
      await expectAsync(p2).toBeResolved();
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
      mediaSourceEngine.reinitText('text/vtt', false);

      await mediaSourceEngine.destroy();
      expect(mockTextEngine).toBeTruthy();
      expect(mockTextEngine.destroy).toHaveBeenCalled();
    });
  });

  function createMockMediaSource() {
    const mediaSource = {
      readyState: 'open',
      sourceBuffers: document.createElement('div'),
      addSourceBuffer: jasmine.createSpy('addSourceBuffer'),
      removeSourceBuffer: jasmine.createSpy('removeSourceBuffer'),
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
      changeType: jasmine.createSpy('changeType'),
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
      appendWindowStart: 0,
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
        'storeAndAppendClosedCaptions', 'setModifyCueCallback',
        'setContainerIsMpegTs',
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
