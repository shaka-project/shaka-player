/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
 *   error: function()
 * }}
 */
let MockSourceBuffer;


describe('MediaSourceEngine', function() {
  const Util = shaka.test.Util;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  const originalIsTypeSupported = window.MediaSource.isTypeSupported;
  const originalTextEngine = shaka.text.TextEngine;
  const originalCreateMediaSource =
      shaka.media.MediaSourceEngine.prototype.createMediaSource;
  const originalTransmuxer = shaka.media.Transmuxer;

  // Jasmine Spies don't handle toHaveBeenCalledWith well with objects, so use
  // some numbers instead.
  const buffer = /** @type {!ArrayBuffer} */ (/** @type {?} */ (1));
  const buffer2 = /** @type {!ArrayBuffer} */ (/** @type {?} */ (2));
  const buffer3 = /** @type {!ArrayBuffer} */ (/** @type {?} */ (3));

  const fakeVideoStream = {mimeType: 'video/foo'};
  const fakeAudioStream = {mimeType: 'audio/foo'};
  const fakeTextStream = {mimeType: 'text/foo'};
  const fakeTransportStream = {mimeType: 'tsMimetype'};

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

  /** @type {!shaka.media.MediaSourceEngine} */
  let mediaSourceEngine;

  beforeAll(function() {
    // Since this is not an integration test, we don't want MediaSourceEngine to
    // fail assertions based on browser support for types.  Pretend that all
    // video and audio types are supported.
    window.MediaSource.isTypeSupported = function(mimeType) {
      let type = mimeType.split('/')[0];
      return type == 'video' || type == 'audio';
    };
  });

  afterAll(function() {
    window.MediaSource.isTypeSupported = originalIsTypeSupported;
    shaka.media.Transmuxer = originalTransmuxer;
  });

  beforeEach(/** @suppress {invalidCasts} */ function() {
    audioSourceBuffer = createMockSourceBuffer();
    videoSourceBuffer = createMockSourceBuffer();
    mockMediaSource = createMockMediaSource();
    mockMediaSource.addSourceBuffer.and.callFake(function(mimeType) {
      let type = mimeType.split('/')[0];
      return type == 'audio' ? audioSourceBuffer : videoSourceBuffer;
    });
    mockTransmuxer = new shaka.test.FakeTransmuxer();

    let func = function() { return mockTransmuxer; };
    shaka.media.Transmuxer = /** @type {?} */ (func);
    shaka.media.Transmuxer.convertTsCodecs = originalTransmuxer.convertTsCodecs;
    shaka.media.Transmuxer.isSupported = (mimeType, contentType) => {
      return mimeType == 'tsMimetype';
    };

    shaka.text.TextEngine = createMockTextEngineCtor();

    createMediaSourceSpy = jasmine.createSpy('createMediaSource');
    createMediaSourceSpy.and.callFake(function(p) {
      p.resolve();
      return mockMediaSource;
    });
    shaka.media.MediaSourceEngine.prototype.createMediaSource =
        Util.spyFunc(createMediaSourceSpy);

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
      removeAttribute: /** @this {HTMLVideoElement} */ function(attr) {
        // Only called with attr == 'src'.
        // This assertion alerts us if the requirements for this mock change.
        goog.asserts.assert(attr == 'src', 'Unexpected removeAttribute() call');
        this.src = '';
      },
      load: /** @this {HTMLVideoElement} */ function() {
        // This assertion alerts us if the requirements for this mock change.
        goog.asserts.assert(this.src == '', 'Unexpected load() call');
      },
    };
    video = /** @type {HTMLMediaElement} */(mockVideo);
    mockClosedCaptionParser = new shaka.test.FakeClosedCaptionParser();
    mockTextDisplayer = new shaka.test.FakeTextDisplayer();
    mediaSourceEngine = new shaka.media.MediaSourceEngine(
        video,
        mockClosedCaptionParser,
        mockTextDisplayer);
  });

  afterEach(function() {
    mockTextEngine = null;
    shaka.text.TextEngine = originalTextEngine;
    shaka.media.MediaSourceEngine.prototype.createMediaSource =
        originalCreateMediaSource;
  });

  describe('constructor', function() {
    const originalCreateObjectURL =
      shaka.media.MediaSourceEngine.createObjectURL;
    const originalMediaSource = window.MediaSource;
    /** @type {jasmine.Spy} */
    let createObjectURLSpy;

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

      let mediaSourceSpy = jasmine.createSpy('MediaSource').and.callFake(() => {
        return mockMediaSource;
      });
      window.MediaSource = Util.spyFunc(mediaSourceSpy);

      await mediaSourceEngine.destroy();
    });

    afterAll(function() {
      shaka.media.MediaSourceEngine.createObjectURL = originalCreateObjectURL;
      window.MediaSource = originalMediaSource;
    });

    it('creates a MediaSource object and sets video.src', function() {
      mediaSourceEngine = new shaka.media.MediaSourceEngine(
          video,
          new shaka.test.FakeClosedCaptionParser(),
          new shaka.test.FakeTextDisplayer());

      expect(createMediaSourceSpy).toHaveBeenCalled();
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(mockVideo.src).toEqual('blob:foo');
    });
  });

  describe('init', function() {
    it('creates SourceBuffers for the given types', async () => {
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      await mediaSourceEngine.init(initObject, false);
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledWith('audio/foo');
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledWith('video/foo');
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

  describe('bufferStart and bufferEnd', function() {
    beforeEach(async () => {
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('returns correct timestamps for one range', function() {
      audioSourceBuffer.buffered = createFakeBuffered([{start: 0, end: 10}]);

      expect(mediaSourceEngine.bufferStart(ContentType.AUDIO)).toBeCloseTo(0);
      expect(mediaSourceEngine.bufferEnd(ContentType.AUDIO)).toBeCloseTo(10);
    });

    it('returns correct timestamps for multiple ranges', function() {
      audioSourceBuffer.buffered =
          createFakeBuffered([{start: 5, end: 10}, {start: 20, end: 30}]);

      expect(mediaSourceEngine.bufferStart(ContentType.AUDIO)).toBeCloseTo(5);
      expect(mediaSourceEngine.bufferEnd(ContentType.AUDIO)).toBeCloseTo(30);
    });

    it('returns null if there are no ranges', function() {
      audioSourceBuffer.buffered = createFakeBuffered([]);

      expect(mediaSourceEngine.bufferStart(ContentType.AUDIO)).toBeNull();
      expect(mediaSourceEngine.bufferEnd(ContentType.AUDIO)).toBeNull();
    });

    it('will forward to TextEngine', function() {
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

  describe('bufferedAheadOf', function() {
    beforeEach(async () => {
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('returns the amount of data ahead of the given position', function() {
      audioSourceBuffer.buffered = createFakeBuffered([{start: 0, end: 10}]);

      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 0))
          .toBeCloseTo(10);
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 5))
          .toBeCloseTo(5);
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 9.9))
          .toBeCloseTo(0.1);
    });

    it('returns zero when given an unbuffered time', function() {
      audioSourceBuffer.buffered = createFakeBuffered([{start: 5, end: 10}]);

      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 10))
          .toBeCloseTo(0);
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.AUDIO, 100))
          .toBeCloseTo(0);
    });

    it('returns the correct amount with multiple ranges', function() {
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

    it('will forward to TextEngine', function() {
      mockTextEngine.bufferedAheadOf.and.returnValue(10);

      expect(mockTextEngine.bufferedAheadOf).not.toHaveBeenCalled();
      expect(mediaSourceEngine.bufferedAheadOf(ContentType.TEXT, 5)).toBe(10);
      expect(mockTextEngine.bufferedAheadOf).toHaveBeenCalledWith(5);
    });
  });

  describe('appendBuffer', function() {
    beforeEach(async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('appends the given data', async () => {
      /** @type {!shaka.test.StatusPromise} */
      let p = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false));
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      audioSourceBuffer.updateend();
      await p;
    });

    it('rejects promise when operation throws', async () => {
      audioSourceBuffer.appendBuffer.and.throwError('fail!');
      mockVideo.error = {code: 5};
      try {
        await mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null,
          null, /* hasClosedCaptions */ false);
        fail('not reached');
      } catch (error) {
        expect(error.code).toBe(
            shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW);
        expect(error.data).toEqual(
            [jasmine.objectContaining({message: 'fail!'})]);
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      }
    });

    it('rejects promise when op. throws QuotaExceededError', async () => {
      let fakeDOMException = {name: 'QuotaExceededError'};
      audioSourceBuffer.appendBuffer.and.callFake(function() {
        throw fakeDOMException;
      });
      mockVideo.error = {code: 5};
      try {
        await mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null,
          null, /* hasClosedCaptions */ false);
        fail('not reached');
      } catch (error) {
        expect(error.code).toBe(shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR);
        expect(error.data).toEqual([ContentType.AUDIO]);
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      }
    });

    it('rejects the promise if this operation fails async', function(done) {
      mockVideo.error = {code: 5};
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false).then(function() {
            fail('not reached');
            done();
          }, function(error) {
            expect(error.code).toBe(
                shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED);
            expect(error.data).toEqual([5]);
            expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
            done();
          });
      audioSourceBuffer.error();
      audioSourceBuffer.updateend();
    });

    it('queues operations on a single SourceBuffer', async () => {
      /** @type {!shaka.test.StatusPromise} */
      let p1 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false));
      /** @type {!shaka.test.StatusPromise} */
      let p2 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer2, null, null,
          /* hasClosedCaptions */ false));

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
      let p1 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false));
      /** @type {!shaka.test.StatusPromise} */
      let p2 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer2, null, null,
          /* hasClosedCaptions */ false));
      /** @type {!shaka.test.StatusPromise} */
      let p3 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer3, null, null,
          /* hasClosedCaptions */ false));

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
      audioSourceBuffer.appendBuffer.and.callFake(function(value) {
        if (value == 2) {
          // throw synchronously.
          throw new Error();
        } else {
          // complete successfully asynchronously.
          Promise.resolve().then(function() {
            audioSourceBuffer.updateend();
          });
        }
      });

      /** @type {!shaka.test.StatusPromise} */
      let p1 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false));
      /** @type {!shaka.test.StatusPromise} */
      let p2 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer2, null, null,
          /* hasClosedCaptions */ false));
      /** @type {!shaka.test.StatusPromise} */
      let p3 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer3, null, null,
          /* hasClosedCaptions */ false));

      await Util.delay(0.1);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer2);
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer3);
      expect(p1.status).toBe('resolved');
      expect(p2.status).toBe('rejected');
      expect(p3.status).toBe('resolved');
    });

    it('forwards to TextEngine', async () => {
      let data = new ArrayBuffer(0);
      expect(mockTextEngine.appendBuffer).not.toHaveBeenCalled();
      await mediaSourceEngine.appendBuffer(
          ContentType.TEXT, data, 0, 10, /* hasClosedCaptions */ false);
      expect(mockTextEngine.appendBuffer).toHaveBeenCalledWith(
          data, 0, 10);
    });

    it('appends transmuxed data and captions', function(done) {
      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeTransportStream);

      const output = {
        data: new Uint8Array(1),
        captions: [{}],
      };
      mockTransmuxer.transmux.and.returnValue(Promise.resolve(output));

      mediaSourceEngine.init(initObject, false).then(() => {
        return mediaSourceEngine.appendBuffer(
            ContentType.VIDEO, buffer, null, null,
            /* hasClosedCaptions */ false);
      }).then(() => {
        expect(mockTextEngine.storeAndAppendClosedCaptions).toHaveBeenCalled();
        expect(videoSourceBuffer.appendBuffer).toHaveBeenCalled();
      }).catch(fail).then(done);

      // The 'updateend' event fires once the data is done appending to the
      // media source.  We only append to the media source once transmuxing is
      // done.  Since transmuxing is done using Promises, we need to delay the
      // event until MediaSourceEngine calls appendBuffer.
      Util.delay(0.1).then(function() {
        videoSourceBuffer.updateend();
      });
    });

    it('appends only transmuxed data without embedded text', function(done) {
      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeTransportStream);

      const output = {
        data: new Uint8Array(1),
        captions: [],
      };
      mockTransmuxer.transmux.and.returnValue(Promise.resolve(output));

      mediaSourceEngine.init(initObject, false).then(() => {
        return mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer, null,
            null, /* hasClosedCaptions */ false);
      }).then(() => {
        expect(videoSourceBuffer.appendBuffer).toHaveBeenCalled();
      }).catch(fail).then(done);

      // The 'updateend' event fires once the data is done appending to the
      // media source.  We only append to the media source once transmuxing is
      // done.  Since transmuxing is done using Promises, we need to delay the
      // event until MediaSourceEngine calls appendBuffer.
      Util.delay(0.1).then(function() {
        videoSourceBuffer.updateend();
      });
    });

    it('appends parsed closed captions from CaptionParser', async () => {
      const initObject = new Map();
      initObject.set(ContentType.VIDEO, fakeVideoStream);

      mockClosedCaptionParser.parseFromSpy.and.callFake((data, onCaptions) => {
        onCaptions(['foo', 'bar']);
      });

      await mediaSourceEngine.init(initObject, false);

      // Initialize the closed caption parser.
      const appendInit = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, null, true);
      // In MediaSourceEngine, appendBuffer() is async and Promise-based, but
      // at the browser level, it's event-based.
      // MediaSourceEngine waits for the 'updateend' event from the
      // SourceBuffer, and uses that to resolve the appendBuffer Promise.
      // Here, we must trigger the event on the fake/mock SourceBuffer before
      // waiting on the appendBuffer Promise.
      videoSourceBuffer.updateend();
      await appendInit;

      expect(mockTextEngine.storeAndAppendClosedCaptions).not.
          toHaveBeenCalled();
      // Parse and append the closed captions embedded in video stream.
      const appendVideo = mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, 0, Infinity, true);
      videoSourceBuffer.updateend();
      await appendVideo;

      expect(mockTextEngine.storeAndAppendClosedCaptions).toHaveBeenCalled();
    });

    it('appends closed caption data only when mux.js is available',
        async () => {
      const originalMuxjs = window.muxjs;

      try {
        window['muxjs'] = null;
        const initObject = new Map();
        initObject.set(ContentType.VIDEO, fakeVideoStream);
        await mediaSourceEngine.init(initObject, false);

        const appendBuffer = mediaSourceEngine.appendBuffer(
            ContentType.VIDEO, buffer, null, null, true);
        // In MediaSourceEngine, appendBuffer() is async and Promise-based, but
        // at the browser level, it's event-based.
        // MediaSourceEngine waits for the 'updateend' event from the
        // SourceBuffer, and uses that to resolve the appendBuffer Promise.
        // Here, we must trigger the event on the fake/mock SourceBuffer before
        // waiting on the appendBuffer Promise.
        videoSourceBuffer.updateend();
        await appendBuffer;
        expect(mockClosedCaptionParser.initSpy).not.toHaveBeenCalled();
        expect(mockTextEngine.storeAndAppendClosedCaptions).not.
            toHaveBeenCalled();
      } finally {
        window['muxjs'] = originalMuxjs;
      }
    });
  });

  describe('remove', function() {
    beforeEach(async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('removes the given data', function(done) {
      mediaSourceEngine.remove(ContentType.AUDIO, 1, 5).then(function() {
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
        done();
      });
      audioSourceBuffer.updateend();
    });

    it('rejects promise when operation throws', async () => {
      audioSourceBuffer.remove.and.throwError('fail!');
      mockVideo.error = {code: 5};
      try {
        await mediaSourceEngine.remove(ContentType.AUDIO, 1, 5);
        fail('not reached');
      } catch (error) {
        expect(error.code).toBe(
            shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW);
        expect(error.data).toEqual(
            [jasmine.objectContaining({message: 'fail!'})]);
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
      }
    });

    it('rejects the promise if this operation fails async', function(done) {
      mockVideo.error = {code: 5};
      mediaSourceEngine.remove(ContentType.AUDIO, 1, 5).then(function() {
        fail('not reached');
        done();
      }, function(error) {
        expect(error.code).toBe(
            shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED);
        expect(error.data).toEqual([5]);
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
        done();
      });
      audioSourceBuffer.error();
      audioSourceBuffer.updateend();
    });

    it('queues operations on a single SourceBuffer', async () => {
      /** @type {!shaka.test.StatusPromise} */
      let p1 = new shaka.test.StatusPromise(
          mediaSourceEngine.remove(ContentType.AUDIO, 1, 5));
      /** @type {!shaka.test.StatusPromise} */
      let p2 = new shaka.test.StatusPromise(
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
      let p1 = new shaka.test.StatusPromise(
          mediaSourceEngine.remove(ContentType.AUDIO, 1, 5));
      /** @type {!shaka.test.StatusPromise} */
      let p2 = new shaka.test.StatusPromise(
          mediaSourceEngine.remove(ContentType.AUDIO, 6, 10));
      /** @type {!shaka.test.StatusPromise} */
      let p3 = new shaka.test.StatusPromise(
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
      audioSourceBuffer.remove.and.callFake(function(start, end) {
        if (start == 2) {
          // throw synchronously.
          throw new Error();
        } else {
          // complete successfully asynchronously.
          Promise.resolve().then(function() {
            audioSourceBuffer.updateend();
          });
        }
      });

      /** @type {!shaka.test.StatusPromise} */
      let p1 = new shaka.test.StatusPromise(
          mediaSourceEngine.remove(ContentType.AUDIO, 1, 2));
      /** @type {!shaka.test.StatusPromise} */
      let p2 = new shaka.test.StatusPromise(
          mediaSourceEngine.remove(ContentType.AUDIO, 2, 3));
      /** @type {!shaka.test.StatusPromise} */
      let p3 = new shaka.test.StatusPromise(
          mediaSourceEngine.remove(ContentType.AUDIO, 3, 4));

      await Util.delay(0.1);
      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 2);
      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(2, 3);
      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(3, 4);
      expect(p1.status).toBe('resolved');
      expect(p2.status).toBe('rejected');
      expect(p3.status).toBe('resolved');
    });

    it('will forward to TextEngine', async () => {
      expect(mockTextEngine.remove).not.toHaveBeenCalled();
      await mediaSourceEngine.remove(ContentType.TEXT, 10, 20);
      expect(mockTextEngine.remove).toHaveBeenCalledWith(10, 20);
    });
  });

  describe('clear', function() {
    beforeEach(async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      initObject.set(ContentType.TEXT, fakeTextStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('clears the given data', function(done) {
      mockMediaSource.durationGetter_.and.returnValue(20);
      mediaSourceEngine.clear(ContentType.AUDIO).then(function() {
        expect(audioSourceBuffer.remove.calls.count()).toBe(1);
        expect(audioSourceBuffer.remove.calls.argsFor(0)[0]).toBe(0);
        expect(audioSourceBuffer.remove.calls.argsFor(0)[1] >= 20).toBeTruthy();
        done();
      });
      audioSourceBuffer.updateend();
    });

    it('does not seek', function(done) {
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

      mockMediaSource.durationGetter_.and.returnValue(20);
      mediaSourceEngine.clear(ContentType.AUDIO).then(function() {
        expect(mockVideo.currentTime).toBe(originalTime);
        done();
      });
      audioSourceBuffer.updateend();
    });

    it('will forward to TextEngine', async () => {
      expect(mockTextEngine.setTimestampOffset).not.toHaveBeenCalled();
      expect(mockTextEngine.setAppendWindow).not.toHaveBeenCalled();
      await mediaSourceEngine.setStreamProperties(ContentType.TEXT,
                                                  /* timestampOffset */ 10,
                                                  /* appendWindowStart */ 0,
                                                  /* appendWindowEnd */ 20);
      expect(mockTextEngine.setTimestampOffset).toHaveBeenCalledWith(10);
      expect(mockTextEngine.setAppendWindow).toHaveBeenCalledWith(0, 20);
    });
  });

  describe('endOfStream', function() {
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
      let p1 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false));
      /** @type {!shaka.test.StatusPromise} */
      let p2 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, null,
          /* hasClosedCaptions */ false));
      /** @type {!shaka.test.StatusPromise} */
      let p3 = new shaka.test.StatusPromise(mediaSourceEngine.endOfStream());

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
      let p1 = mediaSourceEngine.endOfStream();
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer, null, null,
          /* hasClosedCaptions */ false);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer2, null, null,
          /* hasClosedCaptions */ false);

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
      let p1 = mediaSourceEngine.endOfStream();
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false);

      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      try {
        await p1;
        fail('not reached');
      } catch (error) {
        expect(mockMediaSource.endOfStream).toHaveBeenCalled();
        await Util.delay(0.1);
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        audioSourceBuffer.updateend();
      }
    });
  });

  describe('setDuration', function() {
    beforeEach(async () => {
      mockMediaSource.durationGetter_.and.returnValue(0);
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('sets the given duration', async () => {
      await mediaSourceEngine.setDuration(100);
      expect(mockMediaSource.durationSetter_).toHaveBeenCalledWith(100);
    });

    it('waits for all previous operations to complete', async () => {
      /** @type {!shaka.test.StatusPromise} */
      let p1 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false));
      /** @type {!shaka.test.StatusPromise} */
      let p2 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.VIDEO, buffer, null, null,
          /* hasClosedCaptions */ false));
      /** @type {!shaka.test.StatusPromise} */
      let p3 = new shaka.test.StatusPromise(mediaSourceEngine.setDuration(100));

      expect(mockMediaSource.durationSetter_).not.toHaveBeenCalled();
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
      expect(mockMediaSource.durationSetter_).toHaveBeenCalledWith(100);
    });

    it('makes subsequent operations wait', async () => {
      /** @type {!Promise} */
      let p1 = mediaSourceEngine.setDuration(100);
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer, null, null,
          /* hasClosedCaptions */ false);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer2, null, null,
          /* hasClosedCaptions */ false);

      // The setter hasn't been called yet because blocking multiple queues
      // takes an extra tick, even when they are empty.
      expect(mockMediaSource.durationSetter_).not.toHaveBeenCalled();

      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();
      expect(videoSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      await p1;
      expect(mockMediaSource.durationSetter_).toHaveBeenCalled();
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
      mockMediaSource.durationSetter_.and.throwError(new Error());
      /** @type {!Promise} */
      let p1 = mediaSourceEngine.setDuration(100);
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false);

      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      try {
        await p1;
        fail('not reached');
      } catch (error) {
        expect(mockMediaSource.durationSetter_).toHaveBeenCalled();
        await Util.delay(0.1);
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
        audioSourceBuffer.updateend();
      }
    });
  });

  describe('destroy', function() {
    beforeEach(async () => {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      const initObject = new Map();
      initObject.set(ContentType.AUDIO, fakeAudioStream);
      initObject.set(ContentType.VIDEO, fakeVideoStream);
      await mediaSourceEngine.init(initObject, false);
    });

    it('waits for all operations to complete', async () => {
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, buffer, null, null,
        /* hasClosedCaptions */ false);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, buffer, null, null,
        /* hasClosedCaptions */ false);

      /** @type {!shaka.test.StatusPromise} */
      let p = new shaka.test.StatusPromise(mediaSourceEngine.destroy());

      expect(p.status).toBe('pending');
      await Util.delay(0.1);
      expect(p.status).toBe('pending');
      audioSourceBuffer.updateend();
      await Util.delay(0.1);
      expect(p.status).toBe('pending');
      videoSourceBuffer.updateend();
      await Util.delay(0.1);
      expect(p.status).toBe('resolved');
    });

    it('resolves even when a pending operation fails', async () => {
      /** @type {!shaka.test.StatusPromise} */
      let p1 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false));
      /** @type {!shaka.test.StatusPromise} */
      let p2 = new shaka.test.StatusPromise(mediaSourceEngine.destroy());

      audioSourceBuffer.error();
      audioSourceBuffer.updateend();
      await Util.delay(0.1);
      expect(p1.status).toBe('rejected');
      expect(p2.status).toBe('resolved');
    });

    it('waits for blocking operations to complete', async () => {
      /** @type {!shaka.test.StatusPromise} */
      let p1 = new shaka.test.StatusPromise(mediaSourceEngine.endOfStream());
      /** @type {!shaka.test.StatusPromise} */
      let p2 = new shaka.test.StatusPromise(mediaSourceEngine.destroy());

      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      await p1;
      expect(p2.status).toBe('pending');
      await Util.delay(0.1);
      expect(p2.status).toBe('resolved');
    });

    it('cancels operations that have not yet started', async () => {
      mediaSourceEngine.appendBuffer(
        ContentType.AUDIO, buffer, null, null, /* hasClosedCaptions */ false);
      /** @type {!shaka.test.StatusPromise} */
      let rejected =
          new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
              ContentType.AUDIO, buffer2, null, null,
              /* hasClosedCaptions */ false));
      // Create the expectation first so we don't get unhandled rejection errors
      const expected = expectAsync(rejected).toBeRejected();

      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(buffer2);

      /** @type {!shaka.test.StatusPromise} */
      let p = new shaka.test.StatusPromise(mediaSourceEngine.destroy());

      expect(p.status).toBe('pending');
      await Util.delay(0.1);
      expect(p.status).toBe('pending');
      await expected;
      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(buffer);
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(buffer2);
      audioSourceBuffer.updateend();
      await Util.delay(0.1);
      expect(p.status).toBe('resolved');
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(buffer2);
    });

    it('cancels blocking operations that have not yet started', async () => {
      /** @type {!shaka.test.StatusPromise} */
      let p1 = new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, buffer, null, null,
          /* hasClosedCaptions */ false));
      /** @type {!shaka.test.StatusPromise} */
      let p2 = new shaka.test.StatusPromise(mediaSourceEngine.endOfStream());
      /** @type {!shaka.test.StatusPromise} */
      let p3 = new shaka.test.StatusPromise(mediaSourceEngine.destroy());

      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');
      audioSourceBuffer.updateend();
      await Util.delay(0.1);
      expect(p1.status).toBe('resolved');
      expect(p2.status).toBe('rejected');
      await Util.delay(0.1);
      expect(p3.status).toBe('resolved');
    });

    it('prevents new operations from being added', async () => {
      let p = mediaSourceEngine.destroy();
      /** @type {!shaka.test.StatusPromise} */
      let rejected =
          new shaka.test.StatusPromise(mediaSourceEngine.appendBuffer(
              ContentType.AUDIO, buffer, null, null,
              /* hasClosedCaptions */ false));

      // The promise has already been rejected, but our capture requires 1 tick.
      Promise.resolve().then(function() {
        expect(rejected.status).toBe('rejected');
        expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();
      });

      await p;
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();
    });

    it('destroys text engines', async () => {
      mediaSourceEngine.reinitText('text/vtt');

      await mediaSourceEngine.destroy();
      expect(mockTextEngine).toBeTruthy();
      expect(mockTextEngine.destroy).toHaveBeenCalled();
    });

    // Regression test for https://github.com/google/shaka-player/issues/984
    it('destroys TextDisplayer on destroy', async () => {
      await mediaSourceEngine.destroy();
      expect(mockTextDisplayer.destroySpy).toHaveBeenCalled();
    });
  });

  function createMockMediaSource() {
    let mediaSource = {
      readyState: 'open',
      addSourceBuffer: jasmine.createSpy('addSourceBuffer'),
      endOfStream: jasmine.createSpy('endOfStream'),
      durationGetter_: jasmine.createSpy('duration getter'),
      durationSetter_: jasmine.createSpy('duration setter'),
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: function() {},
    };
    Object.defineProperty(
        mediaSource, 'duration',
        {get: mediaSource.durationGetter_, set: mediaSource.durationSetter_});
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
      updateend: function() {},
      error: function() {},
    };
  }

  function createMockTextEngineCtor() {
    let ctor = jasmine.createSpy('TextEngine');
    ctor.isTypeSupported = function() { return true; };
    ctor.and.callFake(function() {
      expect(mockTextEngine).toBeFalsy();
      mockTextEngine = jasmine.createSpyObj('TextEngine', [
        'initParser', 'destroy', 'appendBuffer', 'remove', 'setTimestampOffset',
        'setAppendWindow', 'bufferStart', 'bufferEnd', 'bufferedAheadOf',
        'storeAndAppendClosedCaptions',
      ]);

      let resolve = Promise.resolve.bind(Promise);
      mockTextEngine.destroy.and.callFake(resolve);
      mockTextEngine.appendBuffer.and.callFake(resolve);
      mockTextEngine.remove.and.callFake(resolve);
      return mockTextEngine;
    });
    return ctor;
  }

  function captureEvents(object, targetEventNames) {
    object.addEventListener.and.callFake(function(eventName, listener) {
      if (targetEventNames.includes(eventName)) {
        object[eventName] = listener;
      }
    });
    object.removeEventListener.and.callFake(function(eventName, listener) {
      if (targetEventNames.includes(eventName)) {
        expect(object[eventName]).toBe(listener);
        object[eventName] = null;
      }
    });
  }
});
