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

describe('MediaSourceEngine', function() {
  var originalIsTypeSupported;
  var originalTextEngine;
  var audioSourceBuffer;
  var videoSourceBuffer;
  var mockVideo;
  var mockMediaSource;
  var mockTextEngine;
  var mediaSourceEngine;
  var Util;
  var ContentType;

  beforeAll(function() {
    Util = shaka.test.Util;
    ContentType = shaka.util.ManifestParserUtils.ContentType;
    originalIsTypeSupported = window.MediaSource.prototype.isTypeSupported;
    // Since this is not an integration test, we don't want MediaSourceEngine to
    // fail assertions based on browser support for types.  Pretend that all
    // video and audio types are supported.
    window.MediaSource.prototype.isTypeSupported = function(mimeType) {
      var type = mimeType.split('/')[0];
      return type == 'video' || type == 'audio';
    };

    originalTextEngine = shaka.media.TextEngine;
    shaka.media.TextEngine = createMockTextEngineCtor();
  });

  afterAll(function() {
    window.MediaSource.prototype.isTypeSupported = originalIsTypeSupported;
    shaka.media.TextEngine = originalTextEngine;
  });

  beforeEach(/** @suppress {invalidCasts} */ function() {
    audioSourceBuffer = createMockSourceBuffer();
    videoSourceBuffer = createMockSourceBuffer();
    mockMediaSource = createMockMediaSource();
    mockMediaSource.addSourceBuffer.and.callFake(function(mimeType) {
      var type = mimeType.split('/')[0];
      return type == 'audio' ? audioSourceBuffer : videoSourceBuffer;
    });

    // MediaSourceEngine uses video to:
    //  - read error codes when operations fail
    //  - seek to flush the pipeline on some platforms
    //  - check buffered.length to assert that flushing the pipeline is okay
    mockVideo = {
      error: null,
      currentTime: 0,
      buffered: {
        length: 0
      }
    };
    var video = /** @type {HTMLMediaElement} */(mockVideo);
    mediaSourceEngine =
        new shaka.media.MediaSourceEngine(video, mockMediaSource, null);
  });

  afterEach(function() {
    mockTextEngine = null;
  });

  describe('init', function() {
    it('creates SourceBuffers for the given types', function() {
      // Create empty object first and initialize the fields through
      // [] to allow field names to be expressions.
      var initObject = {};
      initObject[ContentType.AUDIO] = 'audio/foo';
      initObject[ContentType.VIDEO] = 'video/foo';
      mediaSourceEngine.init(initObject);
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledWith('audio/foo');
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledWith('video/foo');
      expect(shaka.media.TextEngine).not.toHaveBeenCalled();
    });

    it('creates TextEngines for text types', function() {
      // Create empty object first and initialize the fields through
      // [] to allow field names to be expressions.
      var initObject = {};
      initObject[ContentType.TEXT] = 'text/foo';
      mediaSourceEngine.init(initObject);
      expect(mockMediaSource.addSourceBuffer).not.toHaveBeenCalled();
      expect(shaka.media.TextEngine).toHaveBeenCalled();
    });
  });

  describe('bufferStart and bufferEnd', function() {
    beforeEach(function() {
      // Create empty object first and initialize the fields through
      // [] to allow field names to be expressions.
      var initObject = {};
      initObject[ContentType.AUDIO] = 'audio/foo';
      initObject[ContentType.TEXT] = 'text/foo';
      mediaSourceEngine.init(initObject);
    });

    it('returns correct timestamps for one range', function() {
      audioSourceBuffer.buffered = createFakeBuffered([{start: 0, end: 10}]);

      expect(mediaSourceEngine.bufferStart(ContentType.AUDIO, 0))
                                          .toBeCloseTo(0);
      expect(mediaSourceEngine.bufferEnd(ContentType.AUDIO, 0))
                                        .toBeCloseTo(10);
    });

    it('returns correct timestamps for multiple ranges', function() {
      audioSourceBuffer.buffered =
          createFakeBuffered([{start: 5, end: 10}, {start: 20, end: 30}]);

      expect(mediaSourceEngine.bufferStart(ContentType.AUDIO, 0))
                                          .toBeCloseTo(5);
      expect(mediaSourceEngine.bufferEnd(ContentType.AUDIO, 0))
                                        .toBeCloseTo(30);
    });

    it('returns null if there are no ranges', function() {
      audioSourceBuffer.buffered = createFakeBuffered([]);

      expect(mediaSourceEngine.bufferStart(ContentType.AUDIO, 0)).toBeNull();
      expect(mediaSourceEngine.bufferEnd(ContentType.AUDIO, 0)).toBeNull();
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
    beforeEach(function() {
      // Create empty object first and initialize the fields through
      // [] to allow field names to be expressions.
      var initObject = {};
      initObject[ContentType.AUDIO] = 'audio/foo';
      initObject[ContentType.TEXT] = 'text/foo';
      mediaSourceEngine.init(initObject);
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
    beforeEach(function() {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      // Create empty object first and initialize the fields through
      // [] to allow field names to be expressions.
      var initObject = {};
      initObject[ContentType.AUDIO] = 'audio/foo';
      initObject[ContentType.VIDEO] = 'video/foo';
      initObject[ContentType.TEXT] = 'text/foo';
      mediaSourceEngine.init(initObject);
    });

    it('appends the given data', function(done) {
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null)
          .then(function() {
            expect(audioSourceBuffer.appendBuffer)
                  .toHaveBeenCalledWith(1);
            done();
          });
      audioSourceBuffer.updateend();
    });

    it('rejects promise when operation throws', function(done) {
      audioSourceBuffer.appendBuffer.and.throwError('fail!');
      mockVideo.error = { code: 5 };
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null)
      .then(function() {
            fail('not reached');
            done();
          }, function(error) {
            expect(error.code).toBe(
                shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW);
            expect(error.data).toEqual(
                [jasmine.objectContaining({message: 'fail!'})]);
            expect(audioSourceBuffer.appendBuffer)
                  .toHaveBeenCalledWith(1);
            done();
          });
    });

    it('rejects promise when op. throws QuotaExceededError', function(done) {
      var fakeDOMException = { name: 'QuotaExceededError' };
      audioSourceBuffer.appendBuffer.and.callFake(function() {
        throw fakeDOMException;
      });
      mockVideo.error = { code: 5 };
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null)
      .then(function() {
            fail('not reached');
            done();
          }, function(error) {
            expect(error.code).toBe(shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR);
            expect(error.data).toEqual([ContentType.AUDIO]);
            expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
            done();
          });
    });

    it('rejects the promise if this operation fails async', function(done) {
      mockVideo.error = { code: 5 };
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null)
      .then(function() {
            fail('not reached');
            done();
          }, function(error) {
            expect(error.code).toBe(
                shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED);
            expect(error.data).toEqual([5]);
            expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
            done();
          });
      audioSourceBuffer.error();
      audioSourceBuffer.updateend();
    });

    it('queues operations on a single SourceBuffer', function(done) {
      var p1 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);
      var p2 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, 2, null, null);
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);

      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(2);
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');

      audioSourceBuffer.updateend();
      p1.then(function() {
        expect(p2.status).toBe('pending');
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(2);

        audioSourceBuffer.updateend();
        return p2;
      }).then(function() {
        done();
      });
    });

    it('queues operations independently for different types', function(done) {
      var p1 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);
      var p2 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, 2, null, null);
      var p3 = mediaSourceEngine.appendBuffer(ContentType.VIDEO, 3, null, null);
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);
      Util.capturePromiseStatus(p3);

      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(2);
      expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(3);
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');

      audioSourceBuffer.updateend();
      videoSourceBuffer.updateend();
      // Wait a tick between each updateend() and the status check that follows.
      p1.then(function() {
        expect(p2.status).toBe('pending');
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(2);

        return p3;
      }).then(function() {
        audioSourceBuffer.updateend();
        return p2;
      }).then(function() {
        done();
      });
    });

    it('continues if an operation throws', function(done) {
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

      var p1 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);
      var p2 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, 2, null, null);
      var p3 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, 3, null, null);
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);
      Util.capturePromiseStatus(p3);

      Util.delay(0.1).then(function() {
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(2);
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(3);
        expect(p1.status).toBe('resolved');
        expect(p2.status).toBe('rejected');
        expect(p3.status).toBe('resolved');
        done();
      });
    });

    it('forwards to TextEngine', function(done) {
      var data = new ArrayBuffer(0);
      expect(mockTextEngine.appendBuffer).not.toHaveBeenCalled();
      mediaSourceEngine.appendBuffer(ContentType.TEXT, data, 0, 10)
      .then(function() {
            expect(mockTextEngine.appendBuffer)
                  .toHaveBeenCalledWith(data, 0, 10);
          }).catch(fail).then(done);
    });
  });

  describe('remove', function() {
    beforeEach(function() {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      // Create empty object first and initialize the fields through
      // [] to allow field names to be expressions.
      var initObject = {};
      initObject[ContentType.AUDIO] = 'audio/foo';
      initObject[ContentType.VIDEO] = 'video/foo';
      initObject[ContentType.TEXT] = 'text/foo';
      mediaSourceEngine.init(initObject);
    });

    it('removes the given data', function(done) {
      mediaSourceEngine.remove(ContentType.AUDIO, 1, 5).then(function() {
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
        done();
      });
      audioSourceBuffer.updateend();
    });

    it('rejects promise when operation throws', function(done) {
      audioSourceBuffer.remove.and.throwError('fail!');
      mockVideo.error = { code: 5 };
      mediaSourceEngine.remove(ContentType.AUDIO, 1, 5).then(function() {
        fail('not reached');
        done();
      }, function(error) {
        expect(error.code).toBe(
            shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW);
        expect(error.data).toEqual(
            [jasmine.objectContaining({message: 'fail!'})]);
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
        done();
      });
    });

    it('rejects the promise if this operation fails async', function(done) {
      mockVideo.error = { code: 5 };
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

    it('queues operations on a single SourceBuffer', function(done) {
      var p1 = mediaSourceEngine.remove(ContentType.AUDIO, 1, 5);
      var p2 = mediaSourceEngine.remove(ContentType.AUDIO, 6, 10);
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);

      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
      expect(audioSourceBuffer.remove).not.toHaveBeenCalledWith(6, 10);
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');

      audioSourceBuffer.updateend();
      p1.then(function() {
        expect(p2.status).toBe('pending');
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(6, 10);

        audioSourceBuffer.updateend();
        return p2;
      }).then(function() {
        done();
      });
    });

    it('queues operations independently for different types', function(done) {
      var p1 = mediaSourceEngine.remove(ContentType.AUDIO, 1, 5);
      var p2 = mediaSourceEngine.remove(ContentType.AUDIO, 6, 10);
      var p3 = mediaSourceEngine.remove(ContentType.VIDEO, 3, 8);
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);
      Util.capturePromiseStatus(p3);

      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
      expect(audioSourceBuffer.remove).not.toHaveBeenCalledWith(6, 10);
      expect(videoSourceBuffer.remove).toHaveBeenCalledWith(3, 8);
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');

      audioSourceBuffer.updateend();
      videoSourceBuffer.updateend();
      p1.then(function() {
        expect(p2.status).toBe('pending');
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(6, 10);
        return p3;
      }).then(function() {
        audioSourceBuffer.updateend();
        return p2;
      }).then(function() {
        done();
      });
    });

    it('continues if an operation throws', function(done) {
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

      var p1 = mediaSourceEngine.remove(ContentType.AUDIO, 1, 2);
      var p2 = mediaSourceEngine.remove(ContentType.AUDIO, 2, 3);
      var p3 = mediaSourceEngine.remove(ContentType.AUDIO, 3, 4);
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);
      Util.capturePromiseStatus(p3);

      Util.delay(0.1).then(function() {
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 2);
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(2, 3);
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(3, 4);
        expect(p1.status).toBe('resolved');
        expect(p2.status).toBe('rejected');
        expect(p3.status).toBe('resolved');
        done();
      });
    });

    it('will forward to TextEngine', function(done) {
      expect(mockTextEngine.remove).not.toHaveBeenCalled();
      mediaSourceEngine.remove(ContentType.TEXT, 10, 20).then(function() {
        expect(mockTextEngine.remove).toHaveBeenCalledWith(10, 20);
      }).catch(fail).then(done);
    });
  });

  describe('clear', function() {
    beforeEach(function() {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      // Create empty object first and initialize the fields through
      // [] to allow field names to be expressions.
      var initObject = {};
      initObject[ContentType.AUDIO] = 'audio/foo';
      initObject[ContentType.VIDEO] = 'video/foo';
      initObject[ContentType.TEXT] = 'text/foo';
      mediaSourceEngine.init(initObject);
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

      var originalTime = 10;
      mockVideo.currentTime = originalTime;

      mockMediaSource.durationGetter_.and.returnValue(20);
      mediaSourceEngine.clear(ContentType.AUDIO).then(function() {
        expect(mockVideo.currentTime).toBe(originalTime);
        done();
      });
      audioSourceBuffer.updateend();
    });

    it('will forward to TextEngine', function(done) {
      expect(mockTextEngine.setTimestampOffset).not.toHaveBeenCalled();
      expect(mockTextEngine.setAppendWindowEnd).not.toHaveBeenCalled();
      mediaSourceEngine
          .setStreamProperties(ContentType.TEXT,
                               /* timestampOffset */ 10,
                               /* appendWindowEnd */ 20)
          .then(function() {
            expect(mockTextEngine.setTimestampOffset).toHaveBeenCalledWith(10);
            expect(mockTextEngine.setAppendWindowEnd).toHaveBeenCalledWith(20);
          })
          .catch(fail)
          .then(done);
    });
  });

  describe('endOfStream', function() {
    beforeEach(function() {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      // Create empty object first and initialize the fields through
      // [] to allow field names to be expressions.
      var initObject = {};
      initObject[ContentType.AUDIO] = 'audio/foo';
      initObject[ContentType.VIDEO] = 'video/foo';
      mediaSourceEngine.init(initObject);
    });

    it('ends the MediaSource stream with the given reason', function(done) {
      mediaSourceEngine.endOfStream('foo').then(function() {
        expect(mockMediaSource.endOfStream).toHaveBeenCalledWith('foo');
        done();
      });
    });

    it('waits for all previous operations to complete', function(done) {
      var p1 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);
      var p2 = mediaSourceEngine.appendBuffer(ContentType.VIDEO, 1, null, null);
      var p3 = mediaSourceEngine.endOfStream();
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);
      Util.capturePromiseStatus(p3);

      expect(mockMediaSource.endOfStream).not.toHaveBeenCalled();
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');

      audioSourceBuffer.updateend();
      p1.then(function() {
        expect(p2.status).toBe('pending');
        expect(p3.status).toBe('pending');
        videoSourceBuffer.updateend();
        return p2;
      }).then(function() {
        return p3;
      }).then(function() {}).then(function() {
        expect(mockMediaSource.endOfStream).toHaveBeenCalled();
        done();
      });
    });

    it('makes subsequent operations wait', function(done) {
      var p1 = mediaSourceEngine.endOfStream();
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, 1, null, null);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, 2, null, null);

      // endOfStream hasn't been called yet because blocking multiple queues
      // takes an extra tick, even when they are empty.
      expect(mockMediaSource.endOfStream).not.toHaveBeenCalled();

      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();
      expect(videoSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      p1.then(function() {
        expect(mockMediaSource.endOfStream).toHaveBeenCalled();
        // The next operations have already been kicked off.
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        // This one is still in queue.
        expect(videoSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(2);
        audioSourceBuffer.updateend();
        videoSourceBuffer.updateend();
      }).then(function() {
        expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(2);
        videoSourceBuffer.updateend();
      }).then(function() {
        done();
      });
    });

    it('runs subsequent operations if this operation throws', function(done) {
      mockMediaSource.endOfStream.and.throwError(new Error());
      var p1 = mediaSourceEngine.endOfStream();
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);

      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      p1.then(function() {
        fail('not reached');
        done();
      }).catch(function() {
        expect(mockMediaSource.endOfStream).toHaveBeenCalled();
        return Util.delay(0.1);
      }).then(function() {
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        audioSourceBuffer.updateend();
      }).then(function() {
        done();
      });
    });
  });

  describe('setDuration', function() {
    beforeEach(function() {
      mockMediaSource.durationGetter_.and.returnValue(0);
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      // Create empty object first and initialize the fields through
      // [] to allow field names to be expressions.
      var initObject = {};
      initObject[ContentType.AUDIO] = 'audio/foo';
      initObject[ContentType.VIDEO] = 'video/foo';
      mediaSourceEngine.init(initObject);
    });

    it('sets the given duration', function(done) {
      mediaSourceEngine.setDuration(100).then(function() {
        expect(mockMediaSource.durationSetter_).toHaveBeenCalledWith(100);
        done();
      });
    });

    it('waits for all previous operations to complete', function(done) {
      var p1 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);
      var p2 = mediaSourceEngine.appendBuffer(ContentType.VIDEO, 1, null, null);
      var p3 = mediaSourceEngine.setDuration(100);
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);
      Util.capturePromiseStatus(p3);

      expect(mockMediaSource.durationSetter_).not.toHaveBeenCalled();
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');

      audioSourceBuffer.updateend();
      p1.then(function() {
        expect(p2.status).toBe('pending');
        expect(p3.status).toBe('pending');
        videoSourceBuffer.updateend();
        return p2;
      }).then(function() {
        return p3;
      }).then(function() {}).then(function() {
        expect(mockMediaSource.durationSetter_).toHaveBeenCalledWith(100);
        done();
      });
    });

    it('makes subsequent operations wait', function(done) {
      var p1 = mediaSourceEngine.setDuration(100);
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, 1, null, null);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, 2, null, null);

      // The setter hasn't been called yet because blocking multiple queues
      // takes an extra tick, even when they are empty.
      expect(mockMediaSource.durationSetter_).not.toHaveBeenCalled();

      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();
      expect(videoSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      p1.then(function() {
        expect(mockMediaSource.durationSetter_).toHaveBeenCalled();
        // The next operations have already been kicked off.
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        // This one is still in queue.
        expect(videoSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(2);
        audioSourceBuffer.updateend();
        videoSourceBuffer.updateend();
      }).then(function() {
        expect(videoSourceBuffer.appendBuffer).toHaveBeenCalledWith(2);
        videoSourceBuffer.updateend();
      }).then(function() {
        done();
      });
    });

    it('runs subsequent operations if this operation throws', function(done) {
      mockMediaSource.durationSetter_.and.throwError(new Error());
      var p1 = mediaSourceEngine.setDuration(100);
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);

      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();

      p1.then(function() {
        fail('not reached');
        done();
      }).catch(function() {
        expect(mockMediaSource.durationSetter_).toHaveBeenCalled();
        return Util.delay(0.1);
      }).then(function() {
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        audioSourceBuffer.updateend();
      }).then(function() {
        done();
      });
    });
  });

  describe('destroy', function() {
    beforeEach(function() {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      // Create empty object first and initialize the fields through
      // [] to allow field names to be expressions.
      var initObject = {};
      initObject[ContentType.AUDIO] = 'audio/foo';
      initObject[ContentType.VIDEO] = 'video/foo';
      mediaSourceEngine.init(initObject);
    });

    it('waits for all operations to complete', function(done) {
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);
      mediaSourceEngine.appendBuffer(ContentType.VIDEO, 1, null, null);

      var p = mediaSourceEngine.destroy();
      Util.capturePromiseStatus(p);

      expect(p.status).toBe('pending');
      Util.delay(0.1).then(function() {
        expect(p.status).toBe('pending');
        audioSourceBuffer.updateend();
        return Util.delay(0.1);
      }).then(function() {
        expect(p.status).toBe('pending');
        videoSourceBuffer.updateend();
        return Util.delay(0.1);
      }).then(function() {
        expect(p.status).toBe('resolved');
        done();
      });
    });

    it('resolves even when a pending operation fails', function(done) {
      var p1 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);
      var p2 = mediaSourceEngine.destroy();
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);

      audioSourceBuffer.error();
      audioSourceBuffer.updateend();
      Util.delay(0.1).then(function() {
        expect(p1.status).toBe('rejected');
        expect(p2.status).toBe('resolved');
        done();
      });
    });

    it('waits for blocking operations to complete', function(done) {
      var p1 = mediaSourceEngine.endOfStream();
      var p2 = mediaSourceEngine.destroy();
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);

      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      p1.then(function() {
        expect(p2.status).toBe('pending');
        return Util.delay(0.1);
      }).then(function() {
        expect(p2.status).toBe('resolved');
        done();
      });
    });

    it('cancels operations that have not yet started', function(done) {
      mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);
      var rejected = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, 2, null, null);
      Util.capturePromiseStatus(rejected);

      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(2);

      var p = mediaSourceEngine.destroy();
      Util.capturePromiseStatus(p);

      expect(p.status).toBe('pending');
      Util.delay(0.1).then(function() {
        expect(p.status).toBe('pending');
        expect(rejected.status).toBe('rejected');
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(2);
        audioSourceBuffer.updateend();
        return Util.delay(0.1);
      }).then(function() {
        expect(p.status).toBe('resolved');
        expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(2);
        done();
      });
    });

    it('cancels blocking operations that have not yet started', function(done) {
      var p1 = mediaSourceEngine.appendBuffer(ContentType.AUDIO, 1, null, null);
      var p2 = mediaSourceEngine.endOfStream();
      var p3 = mediaSourceEngine.destroy();
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);
      Util.capturePromiseStatus(p3);

      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');
      audioSourceBuffer.updateend();
      Util.delay(0.1).then(function() {
        expect(p1.status).toBe('resolved');
        expect(p2.status).toBe('rejected');
        return Util.delay(0.1);
      }).then(function() {
        expect(p3.status).toBe('resolved');
        done();
      });
    });

    it('prevents new operations from being added', function(done) {
      var p = mediaSourceEngine.destroy();
      var rejected = mediaSourceEngine.appendBuffer(
          ContentType.AUDIO, 1, null, null);
      Util.capturePromiseStatus(rejected);

      // The promise has already been rejected, but our capture requires 1 tick.
      Promise.resolve().then(function() {
        expect(rejected.status).toBe('rejected');
        expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();
      });

      p.then(function() {
        expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalled();
        done();
      });
    });

    it('destroys text engines', function(done) {
      mediaSourceEngine.reinitText('text/vtt');

      mediaSourceEngine.destroy().then(function() {
        expect(mockTextEngine).toBeTruthy();
        expect(mockTextEngine.destroy).toHaveBeenCalled();
      }).catch(fail).then(done);
    });
  });

  function createMockMediaSource() {
    var mediaSource = {
      readyState: 'open',
      addSourceBuffer: jasmine.createSpy('addSourceBuffer'),
      endOfStream: jasmine.createSpy('endOfStream'),
      durationGetter_: jasmine.createSpy('duration getter'),
      durationSetter_: jasmine.createSpy('duration setter')
    };
    Object.defineProperty(mediaSource, 'duration',
        { get: mediaSource.durationGetter_, set: mediaSource.durationSetter_ });
    return mediaSource;
  }

  function createMockSourceBuffer() {
    return {
      abort: jasmine.createSpy('abort'),
      appendBuffer: jasmine.createSpy('appendBuffer'),
      remove: jasmine.createSpy('remove'),
      updating: false,
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: function() {},
      buffered: {
        length: 0,
        start: jasmine.createSpy('buffered.start'),
        end: jasmine.createSpy('buffered.end')
      },
      timestampOffset: 0,
      appendWindowEnd: Infinity,
      updateend: function() {},
      error: function() {}
    };
  }

  function createMockTextEngineCtor() {
    var ctor = jasmine.createSpy('TextEngine');
    ctor.isTypeSupported = function() { return true; };
    ctor.and.callFake(function() {
      expect(mockTextEngine).toBeFalsy();
      mockTextEngine = jasmine.createSpyObj('TextEngine', [
        'initParser', 'destroy', 'appendBuffer', 'remove', 'setTimestampOffset',
        'setAppendWindowEnd', 'bufferStart', 'bufferEnd', 'bufferedAheadOf'
      ]);

      var resolve = Promise.resolve.bind(Promise);
      mockTextEngine.destroy.and.callFake(resolve);
      mockTextEngine.appendBuffer.and.callFake(resolve);
      mockTextEngine.remove.and.callFake(resolve);
      return mockTextEngine;
    });
    return ctor;
  }

  function captureEvents(object, targetEventNames) {
    object.addEventListener.and.callFake(function(eventName, listener) {
      if (targetEventNames.indexOf(eventName) != -1) {
        object[eventName] = listener;
      }
    });
  }
});
