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

describe('TextEngine', function() {
  var TextEngine;
  var dummyData = new ArrayBuffer(0);
  var dummyMimeType = 'text/fake';

  var mockParser;
  var mockTrack;
  var textEngine;

  beforeAll(function() {
    TextEngine = shaka.media.TextEngine;
  });

  beforeEach(function() {
    mockParser = jasmine.createSpy('mockParser');
    mockTrack = createMockTrack();
    TextEngine.registerParser(dummyMimeType, mockParser);
    textEngine = new TextEngine(mockTrack, dummyMimeType, false);
  });

  afterEach(function() {
    textEngine = null;
    TextEngine.unregisterParser(dummyMimeType);
    mockTrack = null;
    mockParser = null;
  });

  describe('isTypeSupported', function() {
    it('reports support only when a parser is installed', function() {
      TextEngine.unregisterParser(dummyMimeType);
      expect(TextEngine.isTypeSupported(dummyMimeType)).toBe(false);
      TextEngine.registerParser(dummyMimeType, mockParser);
      expect(TextEngine.isTypeSupported(dummyMimeType)).toBe(true);
      TextEngine.unregisterParser(dummyMimeType);
      expect(TextEngine.isTypeSupported(dummyMimeType)).toBe(false);
    });
  });

  describe('appendBuffer', function() {
    it('works asynchronously', function(done) {
      mockParser.and.returnValue([1, 2, 3]);
      textEngine.appendBuffer(dummyData, 0, 3).catch(fail).then(done);
      expect(mockTrack.addCue).not.toHaveBeenCalled();
    });

    it('considers empty cues buffered', function(done) {
      mockParser.and.returnValue([]);

      textEngine.appendBuffer(dummyData, 0, 3).then(function() {
        expect(mockParser).toHaveBeenCalledWith(dummyData, 0, 0, 3, false);
        expect(mockTrack.addCue).not.toHaveBeenCalled();
        expect(mockTrack.removeCue).not.toHaveBeenCalled();

        expect(textEngine.bufferStart()).toBe(0);
        expect(textEngine.bufferEnd()).toBe(3);

        mockTrack.addCue.calls.reset();
        mockParser.calls.reset();
      }).catch(fail).then(done);
    });

    it('adds cues to the track', function(done) {
      mockParser.and.returnValue([1, 2, 3]);

      textEngine.appendBuffer(dummyData, 0, 3).then(function() {
        expect(mockParser).toHaveBeenCalledWith(dummyData, 0, 0, 3, false);
        expect(mockTrack.addCue).toHaveBeenCalledWith(1);
        expect(mockTrack.addCue).toHaveBeenCalledWith(2);
        expect(mockTrack.addCue).toHaveBeenCalledWith(3);
        expect(mockTrack.removeCue).not.toHaveBeenCalled();

        mockTrack.addCue.calls.reset();
        mockParser.calls.reset();

        mockParser.and.returnValue([4, 5]);
        return textEngine.appendBuffer(dummyData, 3, 5);
      }).then(function() {
        expect(mockParser).toHaveBeenCalledWith(dummyData, 0, 3, 5, false);
        expect(mockTrack.addCue).toHaveBeenCalledWith(4);
        expect(mockTrack.addCue).toHaveBeenCalledWith(5);
      }).catch(fail).then(done);
    });

    it('does not throw if called right before destroy', function(done) {
      mockParser.and.returnValue([1, 2, 3]);
      textEngine.appendBuffer(dummyData, 0, 3).catch(fail).then(done);
      textEngine.destroy();
    });
  });

  describe('remove', function() {
    var cue1;
    var cue2;
    var cue3;

    beforeEach(function() {
      cue1 = createFakeCue(0, 1);
      cue2 = createFakeCue(1, 2);
      cue3 = createFakeCue(2, 3);
      mockParser.and.returnValue([cue1, cue2, cue3]);
    });

    it('works asynchronously', function(done) {
      textEngine.appendBuffer(dummyData, 0, 3).then(function() {
        var p = textEngine.remove(0, 1);
        expect(mockTrack.removeCue).not.toHaveBeenCalled();
        return p;
      }).catch(fail).then(done);
    });

    it('removes cues which overlap the range', function(done) {
      textEngine.appendBuffer(dummyData, 0, 3).then(function() {
        return textEngine.remove(0, 1);
      }).then(function() {
        expect(mockTrack.removeCue.calls.allArgs()).toEqual([[cue1]]);

        mockTrack.removeCue.calls.reset();
        return textEngine.remove(0.5, 1.001);
      }).then(function() {
        expect(mockTrack.removeCue.calls.allArgs()).toEqual([[cue2]]);

        mockTrack.removeCue.calls.reset();
        return textEngine.remove(3, 5);
      }).then(function() {
        expect(mockTrack.removeCue).not.toHaveBeenCalled();

        mockTrack.removeCue.calls.reset();
        return textEngine.remove(2.9999, Infinity);
      }).then(function() {
        expect(mockTrack.removeCue.calls.allArgs()).toEqual([[cue3]]);
      }).catch(fail).then(done);
    });

    it('does nothing when nothing is buffered', function(done) {
      textEngine.remove(0, 1).then(function() {
        expect(mockTrack.removeCue).not.toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('does not throw if called right before destroy', function(done) {
      textEngine.remove(0, 1).catch(fail).then(done);
      textEngine.destroy();
    });
  });

  describe('setTimestampOffset', function() {
    it('passes the offset to the parser', function(done) {
      mockParser.and.callFake(function(data, offset) {
        return [
          createFakeCue(offset + 0, offset + 1),
          createFakeCue(offset + 2, offset + 3)
        ];
      });

      textEngine.appendBuffer(dummyData, 0, 3).then(function() {
        expect(mockParser).toHaveBeenCalledWith(dummyData, 0, 0, 3, false);
        expect(mockTrack.addCue).toHaveBeenCalledWith(createFakeCue(0, 1));
        expect(mockTrack.addCue).toHaveBeenCalledWith(createFakeCue(2, 3));

        mockTrack.addCue.calls.reset();
        textEngine.setTimestampOffset(4);
        return textEngine.appendBuffer(dummyData, 0, 3);
      }).then(function() {
        expect(mockParser).toHaveBeenCalledWith(dummyData, 4, 0, 3, false);
        expect(mockTrack.addCue).toHaveBeenCalledWith(createFakeCue(4, 5));
        expect(mockTrack.addCue).toHaveBeenCalledWith(createFakeCue(6, 7));
      }).catch(fail).then(done);
    });
  });

  describe('bufferStart/bufferEnd', function() {
    beforeEach(function() {
      mockParser.and.callFake(function() {
        return [createFakeCue(0, 1), createFakeCue(1, 2), createFakeCue(2, 3)];
      });
    });

    it('return null when there are no cues', function() {
      expect(textEngine.bufferStart()).toBe(null);
      expect(textEngine.bufferEnd()).toBe(null);
    });

    it('reflect newly-added cues', function(done) {
      textEngine.appendBuffer(dummyData, 0, 3).then(function() {
        expect(textEngine.bufferStart()).toBe(0);
        expect(textEngine.bufferEnd()).toBe(3);

        return textEngine.appendBuffer(dummyData, 3, 6);
      }).then(function() {
        expect(textEngine.bufferStart()).toBe(0);
        expect(textEngine.bufferEnd()).toBe(6);

        return textEngine.appendBuffer(dummyData, 6, 10);
      }).then(function() {
        expect(textEngine.bufferStart()).toBe(0);
        expect(textEngine.bufferEnd()).toBe(10);
      }).catch(fail).then(done);
    });

    it('reflect newly-removed cues', function(done) {
      textEngine.appendBuffer(dummyData, 0, 3).then(function() {
        return textEngine.appendBuffer(dummyData, 3, 6);
      }).then(function() {
        return textEngine.appendBuffer(dummyData, 6, 10);
      }).then(function() {
        expect(textEngine.bufferStart()).toBe(0);
        expect(textEngine.bufferEnd()).toBe(10);

        return textEngine.remove(0, 3);
      }).then(function() {
        expect(textEngine.bufferStart()).toBe(3);
        expect(textEngine.bufferEnd()).toBe(10);

        return textEngine.remove(8, 11);
      }).then(function() {
        expect(textEngine.bufferStart()).toBe(3);
        expect(textEngine.bufferEnd()).toBe(8);

        return textEngine.remove(11, 20);
      }).then(function() {
        expect(textEngine.bufferStart()).toBe(3);
        expect(textEngine.bufferEnd()).toBe(8);

        return textEngine.remove(0, Infinity);
      }).then(function() {
        expect(textEngine.bufferStart()).toBe(null);
        expect(textEngine.bufferEnd()).toBe(null);
      }).catch(fail).then(done);
    });
  });

  describe('bufferedAheadOf', function() {
    beforeEach(function() {
      mockParser.and.callFake(function() {
        return [createFakeCue(0, 1), createFakeCue(1, 2), createFakeCue(2, 3)];
      });
    });

    it('returns 0 when there are no cues', function() {
      expect(textEngine.bufferedAheadOf(0)).toBe(0);
    });

    it('returns 0 if |t| is not buffered', function(done) {
      textEngine.appendBuffer(dummyData, 3, 6).then(function() {
        expect(textEngine.bufferedAheadOf(2.9)).toBe(0);
        expect(textEngine.bufferedAheadOf(6.1)).toBe(0);
      }).catch(fail).then(done);
    });

    it('returns the distance to the end if |t| is buffered', function(done) {
      textEngine.appendBuffer(dummyData, 0, 3).then(function() {
        expect(textEngine.bufferedAheadOf(0)).toBe(3);
        expect(textEngine.bufferedAheadOf(1)).toBe(2);
        expect(textEngine.bufferedAheadOf(2.5)).toBeCloseTo(0.5);
      }).catch(fail).then(done);
    });
  });

  describe('setAppendWindowEnd', function() {
    beforeEach(function() {
      mockParser.and.callFake(function() {
        return [createFakeCue(0, 1), createFakeCue(1, 2), createFakeCue(2, 3)];
      });
    });

    it('limits appended cues', function(done) {
      textEngine.setAppendWindowEnd(1.9);
      textEngine.appendBuffer(dummyData, 0, 3).then(function() {
        expect(mockTrack.addCue).toHaveBeenCalledWith(createFakeCue(0, 1));
        expect(mockTrack.addCue).toHaveBeenCalledWith(createFakeCue(1, 2));

        mockTrack.addCue.calls.reset();
        textEngine.setAppendWindowEnd(2.1);
        return textEngine.appendBuffer(dummyData, 0, 3);
      }).then(function() {
        expect(mockTrack.addCue).toHaveBeenCalledWith(createFakeCue(0, 1));
        expect(mockTrack.addCue).toHaveBeenCalledWith(createFakeCue(1, 2));
        expect(mockTrack.addCue).toHaveBeenCalledWith(createFakeCue(2, 3));
      }).catch(fail).then(done);
    });

    it('limits bufferEnd', function(done) {
      textEngine.setAppendWindowEnd(1.9);
      textEngine.appendBuffer(dummyData, 0, 3).then(function() {
        expect(textEngine.bufferEnd()).toBe(1.9);

        textEngine.setAppendWindowEnd(2.1);
        return textEngine.appendBuffer(dummyData, 0, 3);
      }).then(function() {
        expect(textEngine.bufferEnd()).toBe(2.1);

        textEngine.setAppendWindowEnd(4.1);
        return textEngine.appendBuffer(dummyData, 0, 3);
      }).then(function() {
        expect(textEngine.bufferEnd()).toBe(3);
      }).catch(fail).then(done);
    });
  });

  function createMockTrack() {
    var track = {
      addCue: jasmine.createSpy('addCue'),
      removeCue: jasmine.createSpy('removeCue'),
      cues: []
    };
    track.addCue.and.callFake(function(cue) {
      track.cues.push(cue);
    });
    track.removeCue.and.callFake(function(cue) {
      var idx = track.cues.indexOf(cue);
      expect(idx).not.toBeLessThan(0);
      track.cues.splice(idx, 1);
    });
    return track;
  }

  function createFakeCue(startTime, endTime) {
    return { startTime: startTime, endTime: endTime };
  }
});
