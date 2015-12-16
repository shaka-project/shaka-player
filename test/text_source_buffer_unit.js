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

describe('TextSourceBuffer', function() {
  var TextSourceBuffer;
  var dummyData = new ArrayBuffer(0);
  var dummyMimeType = 'text/fake';

  beforeAll(function() {
    // Can't set this alias at load-time because the sources may not be loaded
    // yet.
    TextSourceBuffer = shaka.media.TextSourceBuffer;
  });

  describe('isTypeSupported', function() {
    it('reports support only when a parser is installed', function() {
      expect(TextSourceBuffer.isTypeSupported(dummyMimeType)).toBe(false);
      TextSourceBuffer.registerParser(dummyMimeType, function() {});
      expect(TextSourceBuffer.isTypeSupported(dummyMimeType)).toBe(true);
      TextSourceBuffer.unregisterParser(dummyMimeType);
      expect(TextSourceBuffer.isTypeSupported(dummyMimeType)).toBe(false);
    });
  });

  describe('appendBuffer', function() {
    var mockParser;
    var mockTrack;
    var sourceBuffer;
    var eventManager;
    var onUpdateEnd;

    beforeEach(function() {
      mockParser = jasmine.createSpy('mockParser');
      mockTrack = createMockTrack();
      TextSourceBuffer.registerParser(dummyMimeType, mockParser);
      sourceBuffer = new TextSourceBuffer(mockTrack, dummyMimeType);
      onUpdateEnd = jasmine.createSpy('onUpdateEnd');
      eventManager = new shaka.util.EventManager();
      eventManager.listen(sourceBuffer, 'updateend', onUpdateEnd);
    });

    afterEach(function() {
      sourceBuffer = null;
      TextSourceBuffer.unregisterParser(dummyMimeType);
      mockTrack = null;
      mockParser = null;
      eventManager.destroy();
      eventManager = null;
    });

    it('works asynchronously', function() {
      mockParser.and.returnValue([1, 2, 3]);
      sourceBuffer.appendBuffer(dummyData);
      expect(mockTrack.addCue).not.toHaveBeenCalled();
    });

    it('dispatches an "updateend" event', function(done) {
      mockParser.and.returnValue([]);

      expect(sourceBuffer.updating).toBe(false);
      sourceBuffer.appendBuffer(dummyData);
      expect(sourceBuffer.updating).toBe(true);

      eventToPromise(onUpdateEnd).then(function() {
        expect(sourceBuffer.updating).toBe(false);
        done();
      });
    });

    it('adds cues to the track', function(done) {
      expect(mockParser).not.toHaveBeenCalled();
      expect(mockTrack.addCue).not.toHaveBeenCalled();
      expect(mockTrack.removeCue).not.toHaveBeenCalled();

      mockParser.and.returnValue([1, 2, 3]);
      sourceBuffer.appendBuffer(dummyData);

      eventToPromise(onUpdateEnd).then(function() {
        expect(mockParser).toHaveBeenCalledWith(dummyData);
        expect(mockTrack.addCue).toHaveBeenCalledWith(1);
        expect(mockTrack.addCue).toHaveBeenCalledWith(2);
        expect(mockTrack.addCue).toHaveBeenCalledWith(3);
        expect(mockTrack.removeCue).not.toHaveBeenCalled();

        mockTrack.addCue.calls.reset();
        mockParser.calls.reset();

        mockParser.and.returnValue([4, 5]);
        sourceBuffer.appendBuffer(dummyData);

        return eventToPromise(onUpdateEnd);
      }).then(function() {
        expect(mockParser).toHaveBeenCalledWith(dummyData);
        expect(mockTrack.addCue).toHaveBeenCalledWith(4);
        expect(mockTrack.addCue).toHaveBeenCalledWith(5);
        done();
      });
    });
  });

  describe('remove', function() {
    var mockTrack;
    var sourceBuffer;
    var eventManager;
    var onUpdateEnd;

    beforeEach(function() {
      mockTrack = createMockTrack();
      TextSourceBuffer.registerParser(dummyMimeType, function() {});
      sourceBuffer = new TextSourceBuffer(mockTrack, dummyMimeType);
      onUpdateEnd = jasmine.createSpy('onUpdateEnd');
      eventManager = new shaka.util.EventManager();
      eventManager.listen(sourceBuffer, 'updateend', onUpdateEnd);
    });

    afterEach(function() {
      sourceBuffer = null;
      TextSourceBuffer.unregisterParser(dummyMimeType);
      mockTrack = null;
      eventManager.destroy();
      eventManager = null;
    });

    it('works asynchronously', function() {
      var cue1 = createFakeCue(0, 1);
      var cue2 = createFakeCue(1, 2);
      var cue3 = createFakeCue(2, 3);
      mockTrack.cues = [cue1, cue2, cue3];

      sourceBuffer.remove(0, 1);
      expect(mockTrack.removeCue).not.toHaveBeenCalled();
    });

    it('dispatches an "updateend" event', function(done) {
      expect(sourceBuffer.updating).toBe(false);
      sourceBuffer.remove(0, 1);
      expect(sourceBuffer.updating).toBe(true);

      eventToPromise(onUpdateEnd).then(function() {
        expect(sourceBuffer.updating).toBe(false);
        done();
      });
    });

    it('removes cues which overlap the range', function(done) {
      var cue1 = createFakeCue(0, 1);
      var cue2 = createFakeCue(1, 2);
      var cue3 = createFakeCue(2, 3);
      mockTrack.cues = [cue1, cue2, cue3];

      sourceBuffer.remove(0, 1);

      eventToPromise(onUpdateEnd).then(function() {
        expect(mockTrack.removeCue.calls.allArgs()).toEqual([[cue1], [cue2]]);

        mockTrack.removeCue.calls.reset();
        sourceBuffer.remove(0.5, 0.9);
        return eventToPromise(onUpdateEnd);
      }).then(function() {
        expect(mockTrack.removeCue.calls.allArgs()).toEqual([[cue1]]);

        mockTrack.removeCue.calls.reset();
        sourceBuffer.remove(3.00001, 5);
        return eventToPromise(onUpdateEnd);
      }).then(function() {
        expect(mockTrack.removeCue).not.toHaveBeenCalled();

        mockTrack.removeCue.calls.reset();
        sourceBuffer.remove(0.5, 1.5);
        return eventToPromise(onUpdateEnd);
      }).then(function() {
        expect(mockTrack.removeCue.calls.allArgs()).toEqual([[cue1], [cue2]]);

        mockTrack.removeCue.calls.reset();
        sourceBuffer.remove(3, Number.POSITIVE_INFINITY);
        return eventToPromise(onUpdateEnd);
      }).then(function() {
        expect(mockTrack.removeCue.calls.allArgs()).toEqual([[cue3]]);
        done();
      });
    });
  });

  describe('buffered', function() {
    var mockTrack;
    var sourceBuffer;
    var eventManager;
    var onUpdateEnd;

    beforeEach(function() {
      var fakeParser = function() { return []; };
      mockTrack = createMockTrack();
      TextSourceBuffer.registerParser(dummyMimeType, fakeParser);
      sourceBuffer = new TextSourceBuffer(mockTrack, dummyMimeType);
      onUpdateEnd = jasmine.createSpy('onUpdateEnd');
      eventManager = new shaka.util.EventManager();
      eventManager.listen(sourceBuffer, 'updateend', onUpdateEnd);
    });

    afterEach(function() {
      sourceBuffer = null;
      TextSourceBuffer.unregisterParser(dummyMimeType);
      mockTrack = null;
      eventManager.destroy();
      eventManager = null;
    });

    it('reflects newly-added cues', function(done) {
      expect(sourceBuffer.buffered.length).toBe(0);

      var cue1 = createFakeCue(0, 1);
      var cue2 = createFakeCue(1, 2);
      mockTrack.cues = [cue1, cue2];
      // call appendBuffer to trigger the update of buffered.
      sourceBuffer.appendBuffer(dummyData);

      eventToPromise(onUpdateEnd).then(function() {
        expect(sourceBuffer.buffered.length).toBe(1);
        expect(sourceBuffer.buffered.start(0)).toBe(0);
        expect(sourceBuffer.buffered.end(0)).toBe(2);

        var cue3 = createFakeCue(2, 3);
        mockTrack.cues = [cue1, cue2, cue3];
        sourceBuffer.appendBuffer(dummyData);

        return eventToPromise(onUpdateEnd);
      }).then(function() {
        expect(sourceBuffer.buffered.length).toBe(1);
        expect(sourceBuffer.buffered.start(0)).toBe(0);
        expect(sourceBuffer.buffered.end(0)).toBe(3);
        done();
      });
    });

    it('reflects newly-removed cues', function(done) {
      var cue1 = createFakeCue(0, 1);
      var cue2 = createFakeCue(1, 2);
      var cue3 = createFakeCue(2, 3);
      mockTrack.cues = [cue1, cue2, cue3];
      // call appendBuffer to trigger the update of buffered.
      sourceBuffer.appendBuffer(dummyData);

      eventToPromise(onUpdateEnd).then(function() {
        expect(sourceBuffer.buffered.length).toBe(1);
        expect(sourceBuffer.buffered.start(0)).toBe(0);
        expect(sourceBuffer.buffered.end(0)).toBe(3);

        mockTrack.cues = [cue1, cue2];
        // call remove to trigger the update of buffered.
        sourceBuffer.remove(-1, -1);

        return eventToPromise(onUpdateEnd);
      }).then(function() {
        expect(sourceBuffer.buffered.length).toBe(1);
        expect(sourceBuffer.buffered.start(0)).toBe(0);
        expect(sourceBuffer.buffered.end(0)).toBe(2);

        mockTrack.cues = [];
        // call remove to trigger the update of buffered.
        sourceBuffer.remove(-1, -1);

        return eventToPromise(onUpdateEnd);
      }).then(function() {
        expect(sourceBuffer.buffered.length).toBe(0);
        done();
      });
    });
  });

  function eventToPromise(eventSpy) {
    return new Promise(function(resolve) {
      eventSpy.and.callFake(resolve);
    });
  }

  function createMockTrack() {
    return {
      addCue: jasmine.createSpy('addCue'),
      removeCue: jasmine.createSpy('removeCue'),
      cues: []
    };
  }

  function createFakeCue(startTime, endTime) {
    return { startTime: startTime, endTime: endTime };
  }
});
