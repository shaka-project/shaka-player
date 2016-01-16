/**
 * @license
 * Copyright 2015 Google Inc.
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
  var originalMediaSource;
  var originalTextSourceBuffer;
  var audioSourceBuffer;
  var videoSourceBuffer;
  var mockMediaSource;
  var dummyData = new ArrayBuffer();
  var mediaSourceEngine;
  var Util;

  beforeAll(function() {
    Util = shaka.test.Util;
    originalMediaSource = window.MediaSource;
    // Since this is not an integration test, we don't want MediaSourceEngine to
    // fail assertions based on browser support for types.  Pretend that all
    // video and audio types are supported.
    window.MediaSource = {
      isTypeSupported: function(mimeType) {
        var contentType = mimeType.split('/')[0];
        return contentType == 'video' || contentType == 'audio';
      }
    };

    originalTextSourceBuffer = shaka.media.TextSourceBuffer;
    shaka.media.TextSourceBuffer = createMockTextSourceBufferCtor();
  });

  afterAll(function() {
    window.MediaSource = originalMediaSource;
    shaka.media.TextSourceBuffer = originalTextSourceBuffer;
  });

  beforeEach(function() {
    audioSourceBuffer = createMockSourceBuffer();
    videoSourceBuffer = createMockSourceBuffer();
    mockMediaSource = createMockMediaSource();
    mockMediaSource.addSourceBuffer.and.callFake(function(mimeType) {
      var contentType = mimeType.split('/')[0];
      return contentType == 'audio' ? audioSourceBuffer : videoSourceBuffer;
    });

    mediaSourceEngine =
        new shaka.media.MediaSourceEngine(mockMediaSource, null);
  });

  describe('init', function() {
    it('creates SourceBuffers for the given types', function() {
      mediaSourceEngine.init({'audio': 'audio/foo', 'video': 'video/foo'});
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledWith('audio/foo');
      expect(mockMediaSource.addSourceBuffer).toHaveBeenCalledWith('video/foo');
      expect(shaka.media.TextSourceBuffer).not.toHaveBeenCalled();
    });

    it('creates TextSourceBuffers for text types', function() {
      mediaSourceEngine.init({'text': 'text/foo'});
      expect(mockMediaSource.addSourceBuffer).not.toHaveBeenCalled();
      expect(shaka.media.TextSourceBuffer).toHaveBeenCalled();
    });
  });

  describe('bufferStart and bufferEnd', function() {
    beforeEach(function() {
      mediaSourceEngine.init({'audio': 'audio/foo'});
    });

    it('returns correct timestamps for one range', function() {
      audioSourceBuffer.buffered.length = 1;
      audioSourceBuffer.buffered.start.and.returnValue(0);
      audioSourceBuffer.buffered.end.and.returnValue(10);

      expect(mediaSourceEngine.bufferStart('audio', 0)).toBeCloseTo(0);
      expect(mediaSourceEngine.bufferEnd('audio', 0)).toBeCloseTo(10);
    });

    it('returns correct timestamps for multiple ranges', function() {
      audioSourceBuffer.buffered.length = 2;

      audioSourceBuffer.buffered.start.and.callFake(function(i) {
        if (i == 0) return 5;
        if (i == 1) return 20;
        throw new Error('Unexpected index');
      });

      audioSourceBuffer.buffered.end.and.callFake(function(i) {
        if (i == 0) return 10;
        if (i == 1) return 30;
        throw new Error('Unexpected index');
      });

      expect(mediaSourceEngine.bufferStart('audio', 0)).toBeCloseTo(5);
      expect(mediaSourceEngine.bufferEnd('audio', 0)).toBeCloseTo(30);
    });

    it('returns null if there are no ranges', function() {
      audioSourceBuffer.buffered.length = 0;

      expect(mediaSourceEngine.bufferStart('audio', 0)).toBeNull();
      expect(mediaSourceEngine.bufferEnd('audio', 0)).toBeNull();
    });
  });

  describe('bufferedAheadOf', function() {
    beforeEach(function() {
      mediaSourceEngine.init({'audio': 'audio/foo'});
    });

    it('returns the amount of data ahead of the given position', function() {
      audioSourceBuffer.buffered.length = 1;
      audioSourceBuffer.buffered.start.and.returnValue(0);
      audioSourceBuffer.buffered.end.and.returnValue(10);

      expect(mediaSourceEngine.bufferedAheadOf('audio', 0)).toBeCloseTo(10);
      expect(mediaSourceEngine.bufferedAheadOf('audio', 5)).toBeCloseTo(5);
      expect(mediaSourceEngine.bufferedAheadOf('audio', 9.9)).toBeCloseTo(0.1);
    });

    it('returns zero when given an unbuffered time', function() {
      audioSourceBuffer.buffered.length = 1;
      audioSourceBuffer.buffered.start.and.returnValue(0);
      audioSourceBuffer.buffered.end.and.returnValue(10);

      expect(mediaSourceEngine.bufferedAheadOf('audio', 10)).toBeCloseTo(0);
      expect(mediaSourceEngine.bufferedAheadOf('audio', 100)).toBeCloseTo(0);
      expect(mediaSourceEngine.bufferedAheadOf('audio', -0.001)).toBeCloseTo(0);
    });

    it('returns the correct amount with multiple ranges', function() {
      audioSourceBuffer.buffered.length = 2;
      audioSourceBuffer.buffered.start.and.callFake(function(i) {
        return i == 0 ? 1 : 6;
      });
      audioSourceBuffer.buffered.end.and.callFake(function(i) {
        return i == 0 ? 3 : 10;
      });

      // in range 0
      expect(mediaSourceEngine.bufferedAheadOf('audio', 1)).toBeCloseTo(2);
      expect(mediaSourceEngine.bufferedAheadOf('audio', 2.5)).toBeCloseTo(0.5);

      // between range 0 and 1
      expect(mediaSourceEngine.bufferedAheadOf('audio', 5)).toBeCloseTo(0);

      // in range 1
      expect(mediaSourceEngine.bufferedAheadOf('audio', 6)).toBeCloseTo(4);
      expect(mediaSourceEngine.bufferedAheadOf('audio', 9.9)).toBeCloseTo(0.1);
    });
  });

  describe('appendBuffer', function() {
    beforeEach(function() {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      mediaSourceEngine.init({'audio': 'audio/foo', 'video': 'video/foo'});
    });

    it('appends the given data', function(done) {
      mediaSourceEngine.appendBuffer('audio', 1).then(function() {
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        done();
      });
      audioSourceBuffer.updateend();
    });

    it('rejects the promise if this operation throws', function(done) {
      audioSourceBuffer.appendBuffer.and.throwError(new Error());
      mediaSourceEngine.appendBuffer('audio', 1).then(function() {
        fail('not reached');
        done();
      }, function() {
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        done();
      });
    });

    it('rejects the promise if this operation fails async', function(done) {
      mediaSourceEngine.appendBuffer('audio', 1).then(function() {
        fail('not reached');
        done();
      }, function() {
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
        done();
      });
      audioSourceBuffer.error();
      audioSourceBuffer.updateend();
    });

    it('queues operations on a single SourceBuffer', function(done) {
      var p1 = mediaSourceEngine.appendBuffer('audio', 1);
      var p2 = mediaSourceEngine.appendBuffer('audio', 2);
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);

      expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(1);
      expect(audioSourceBuffer.appendBuffer).not.toHaveBeenCalledWith(2);
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');

      audioSourceBuffer.updateend();
      // Wait a tick between each updateend() and the status check that follows.
      Promise.resolve().then(function() {
        expect(p1.status).toBe('resolved');
        expect(p2.status).toBe('pending');
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(2);

        audioSourceBuffer.updateend();
      }).then(function() {
        expect(p2.status).toBe('resolved');
        done();
      });
    });

    it('queues operations independently for different types', function(done) {
      var p1 = mediaSourceEngine.appendBuffer('audio', 1);
      var p2 = mediaSourceEngine.appendBuffer('audio', 2);
      var p3 = mediaSourceEngine.appendBuffer('video', 3);
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
      Promise.resolve().then(function() {
        expect(p1.status).toBe('resolved');
        expect(p2.status).toBe('pending');
        expect(p3.status).toBe('resolved');
        expect(audioSourceBuffer.appendBuffer).toHaveBeenCalledWith(2);

        audioSourceBuffer.updateend();
      }).then(function() {
        expect(p2.status).toBe('resolved');
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

      var p1 = mediaSourceEngine.appendBuffer('audio', 1);
      var p2 = mediaSourceEngine.appendBuffer('audio', 2);
      var p3 = mediaSourceEngine.appendBuffer('audio', 3);
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
  });

  describe('remove and clear', function() {
    beforeEach(function() {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      mediaSourceEngine.init({'audio': 'audio/foo', 'video': 'video/foo'});
    });

    it('removes the given data', function(done) {
      mediaSourceEngine.remove('audio', 1, 5).then(function() {
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
        done();
      });
      audioSourceBuffer.updateend();
    });

    it('rejects the promise if this operation throws', function(done) {
      audioSourceBuffer.remove.and.throwError(new Error());
      mediaSourceEngine.remove('audio', 1, 5).then(function() {
        fail('not reached');
        done();
      }, function() {
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
        done();
      });
    });

    it('rejects the promise if this operation fails async', function(done) {
      mediaSourceEngine.remove('audio', 1, 5).then(function() {
        fail('not reached');
        done();
      }, function() {
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
        done();
      });
      audioSourceBuffer.error();
      audioSourceBuffer.updateend();
    });

    it('queues operations on a single SourceBuffer', function(done) {
      var p1 = mediaSourceEngine.remove('audio', 1, 5);
      var p2 = mediaSourceEngine.remove('audio', 6, 10);
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);

      expect(audioSourceBuffer.remove).toHaveBeenCalledWith(1, 5);
      expect(audioSourceBuffer.remove).not.toHaveBeenCalledWith(6, 10);
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');

      audioSourceBuffer.updateend();
      // Wait a tick between each updateend() and the status check that follows.
      Promise.resolve().then(function() {
        expect(p1.status).toBe('resolved');
        expect(p2.status).toBe('pending');
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(6, 10);

        audioSourceBuffer.updateend();
      }).then(function() {
        expect(p2.status).toBe('resolved');
        done();
      });
    });

    it('queues operations independently for different types', function(done) {
      var p1 = mediaSourceEngine.remove('audio', 1, 5);
      var p2 = mediaSourceEngine.remove('audio', 6, 10);
      var p3 = mediaSourceEngine.remove('video', 3, 8);
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
      // Wait a tick between each updateend() and the status check that follows.
      Promise.resolve().then(function() {
        expect(p1.status).toBe('resolved');
        expect(p2.status).toBe('pending');
        expect(p3.status).toBe('resolved');
        expect(audioSourceBuffer.remove).toHaveBeenCalledWith(6, 10);

        audioSourceBuffer.updateend();
      }).then(function() {
        expect(p2.status).toBe('resolved');
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

      var p1 = mediaSourceEngine.remove('audio', 1, 2);
      var p2 = mediaSourceEngine.remove('audio', 2, 3);
      var p3 = mediaSourceEngine.remove('audio', 3, 4);
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

    it('clears the given data', function(done) {
      mockMediaSource.durationGetter_.and.returnValue(20);
      mediaSourceEngine.clear('audio').then(function() {
        expect(audioSourceBuffer.remove.calls.count()).toBe(1);
        expect(audioSourceBuffer.remove.calls.argsFor(0)[0]).toBe(0);
        expect(audioSourceBuffer.remove.calls.argsFor(0)[1] >= 20).toBeTruthy();
        done();
      });
      audioSourceBuffer.updateend();
    });
  });

  describe('setTimestampOffset', function() {
    beforeEach(function() {
      mediaSourceEngine.init({'audio': 'audio/foo'});
    });

    it('sets the timestamp offset', function(done) {
      expect(audioSourceBuffer.timestampOffset).toBe(0);
      mediaSourceEngine.setTimestampOffset('audio', 10).then(function() {
        expect(audioSourceBuffer.timestampOffset).toBe(10);
        done();
      });
    });
  });

  describe('endOfStream', function() {
    beforeEach(function() {
      captureEvents(audioSourceBuffer, ['updateend', 'error']);
      captureEvents(videoSourceBuffer, ['updateend', 'error']);
      mediaSourceEngine.init({'audio': 'audio/foo', 'video': 'video/foo'});
    });

    it('ends the MediaSource stream with the given reason', function(done) {
      mediaSourceEngine.endOfStream('foo').then(function() {
        expect(mockMediaSource.endOfStream).toHaveBeenCalledWith('foo');
        done();
      });
    });

    it('waits for all previous operations to complete', function(done) {
      var p1 = mediaSourceEngine.appendBuffer('audio', 1);
      var p2 = mediaSourceEngine.appendBuffer('video', 1);
      var p3 = mediaSourceEngine.endOfStream();
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);
      Util.capturePromiseStatus(p3);

      expect(mockMediaSource.endOfStream).not.toHaveBeenCalled();
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');

      audioSourceBuffer.updateend();
      // Wait a tick between each updateend() and the status check that follows.
      Promise.resolve().then(function() {
        expect(p1.status).toBe('resolved');
        expect(p2.status).toBe('pending');
        expect(p3.status).toBe('pending');
        videoSourceBuffer.updateend();
      }).then(function() {
        expect(p2.status).toBe('resolved');
        // blocking multiple queues takes an extra tick to process:
      }).then(function() {}).then(function() {
        expect(mockMediaSource.endOfStream).toHaveBeenCalled();
        expect(p3.status).toBe('resolved');
        done();
      });
    });

    it('makes subsequent operations wait', function(done) {
      var p1 = mediaSourceEngine.endOfStream();
      var p2 = mediaSourceEngine.appendBuffer('audio', 1);
      var p3 = mediaSourceEngine.appendBuffer('video', 1);
      var p4 = mediaSourceEngine.appendBuffer('video', 2);

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
      var p2 = mediaSourceEngine.appendBuffer('audio', 1);

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
      mediaSourceEngine.init({'audio': 'audio/foo', 'video': 'video/foo'});
    });

    it('sets the given duration', function(done) {
      mediaSourceEngine.setDuration(100).then(function() {
        expect(mockMediaSource.durationSetter_).toHaveBeenCalledWith(100);
        done();
      });
    });

    it('waits for all previous operations to complete', function(done) {
      var p1 = mediaSourceEngine.appendBuffer('audio', 1);
      var p2 = mediaSourceEngine.appendBuffer('video', 1);
      var p3 = mediaSourceEngine.setDuration(100);
      Util.capturePromiseStatus(p1);
      Util.capturePromiseStatus(p2);
      Util.capturePromiseStatus(p3);

      expect(mockMediaSource.durationSetter_).not.toHaveBeenCalled();
      expect(p1.status).toBe('pending');
      expect(p2.status).toBe('pending');
      expect(p3.status).toBe('pending');

      audioSourceBuffer.updateend();
      // Wait a tick between each updateend() and the status check that follows.
      Promise.resolve().then(function() {
        expect(p1.status).toBe('resolved');
        expect(p2.status).toBe('pending');
        expect(p3.status).toBe('pending');
        videoSourceBuffer.updateend();
      }).then(function() {
        expect(p2.status).toBe('resolved');
        // blocking multiple queues takes an extra tick to process:
      }).then(function() {}).then(function() {
        expect(mockMediaSource.durationSetter_).toHaveBeenCalledWith(100);
        expect(p3.status).toBe('resolved');
        done();
      });
    });

    it('makes subsequent operations wait', function(done) {
      var p1 = mediaSourceEngine.setDuration(100);
      var p2 = mediaSourceEngine.appendBuffer('audio', 1);
      var p3 = mediaSourceEngine.appendBuffer('video', 1);
      var p4 = mediaSourceEngine.appendBuffer('video', 2);

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
      var p2 = mediaSourceEngine.appendBuffer('audio', 1);

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
      mediaSourceEngine.init({'audio': 'audio/foo', 'video': 'video/foo'});
    });

    it('waits for all operations to complete', function(done) {
      mediaSourceEngine.appendBuffer('audio', 1);
      mediaSourceEngine.appendBuffer('video', 1);

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
      var p1 = mediaSourceEngine.appendBuffer('audio', 1);
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
      mediaSourceEngine.appendBuffer('audio', 1);
      var rejected = mediaSourceEngine.appendBuffer('audio', 2);
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
      var p1 = mediaSourceEngine.appendBuffer('audio', 1);
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
      var rejected = mediaSourceEngine.appendBuffer('audio', 1);
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
      timestampOffset: 0
    };
  }

  function createMockTextSourceBufferCtor() {
    var ctor = jasmine.createSpy('TextSourceBuffer');
    ctor.isTypeSupported = function() { return true; };
    ctor.prototype.addEventListener = function() {};
    ctor.prototype.removeEventListener = function() {};
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
