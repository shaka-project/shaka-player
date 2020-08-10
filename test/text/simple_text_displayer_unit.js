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


describe('SimpleTextDisplayer', function() {
  const originalVTTCue = window.VTTCue;
  const Cue = shaka.text.Cue;
  const SimpleTextDisplayer = shaka.text.SimpleTextDisplayer;

  /** @type {!shaka.test.FakeVideo} */
  let video;
  /** @type {!shaka.test.FakeTextTrack} */
  let mockTrack;
  /** @type {!shaka.text.SimpleTextDisplayer} */
  let displayer;

  beforeEach(function() {
    video = new shaka.test.FakeVideo();
    displayer = new SimpleTextDisplayer(video);

    expect(video.textTracks.length).toBe(1);
    mockTrack = /** @type {!shaka.test.FakeTextTrack} */ (video.textTracks[0]);
    expect(mockTrack).toBeTruthy();

    /**
     * @constructor
     * @param {number} start
     * @param {number} end
     * @param {string} text
     */
    function FakeVTTCue(start, end, text) {
      this.startTime = start;
      this.endTime = end;
      this.text = text;
    }
    window.VTTCue = /** @type {?} */(FakeVTTCue);
  });

  afterAll(function() {
    window.VTTCue = originalVTTCue;
  });

  describe('append', function() {
    it('sorts cues before inserting', function() {
      // See: https://bit.ly/2K9VX3s
      verifyHelper(
          [
            {start: 10, end: 20, text: 'Test1'},
            {start: 20, end: 30, text: 'Test2'},
            {start: 30, end: 40, text: 'Test3'},
          ],
          [
            new shaka.text.Cue(20, 30, 'Test2'),
            new shaka.text.Cue(30, 40, 'Test3'),
            new shaka.text.Cue(10, 20, 'Test1'),
          ]);
    });

    it('appends equal time cues in reverse order', function() {
      // Regression test for https://github.com/google/shaka-player/issues/848

      // When VTTCue is seen as the real thing (because of the presence of
      // VTTCue.prototype.line), then the reverse-order behavior comes into
      // play.  The reverse order is only needed because of VTTCue spec
      // behavior.

      // First we test the behavior with a real-looking VTTCue (in which
      // prototype.line merely exists).  This simulates Chrome, Firefox, and
      // Safari.
      // eslint-disable-next-line no-restricted-syntax
      window.VTTCue.prototype['line'] = 'auto';
      verifyHelper(
          [
            {start: 20, end: 40, text: 'Test1'},
            {start: 20, end: 40, text: 'Test2'},
            {start: 20, end: 40, text: 'Test3'},
          ],
          [
            // Reverse order to compensate for the way line='auto' is
            // implemented in browsers.
            new shaka.text.Cue(20, 40, 'Test3'),
            new shaka.text.Cue(20, 40, 'Test2'),
            new shaka.text.Cue(20, 40, 'Test1'),
          ]);

      // Next we test the behavior with a VTTCue which is seen as a cheap
      // polyfill (in which prototype.line does not exist).  This simulates IE
      // and legacy Edge.
      // eslint-disable-next-line no-restricted-syntax
      delete window.VTTCue.prototype['line'];
      displayer.remove(0, Infinity);  // Clear the cues from above.
      verifyHelper(
          [
            {start: 20, end: 40, text: 'Test1'},
            {start: 20, end: 40, text: 'Test2'},
            {start: 20, end: 40, text: 'Test3'},
          ],
          [
            // Input order, since the displayer sees this as a fake VTTCue
            // implementation.
            new shaka.text.Cue(20, 40, 'Test1'),
            new shaka.text.Cue(20, 40, 'Test2'),
            new shaka.text.Cue(20, 40, 'Test3'),
          ]);
    });

    it('appends nested cues', () => {
      const shakaCue = new shaka.text.Cue(10, 20, '');
      const nestedCue1 = new shaka.text.Cue(10, 20, 'Test1');
      const nestedCue2 = new shaka.text.Cue(10, 20, 'Test2');

      shakaCue.nestedCues = [nestedCue1, nestedCue2];

      verifyHelper(
          [
            {start: 10, end: 20, text: 'Test1 Test2'},
          ],
          [shakaCue]);
    });

    // Regression test for b/159050711
    it('maintains the styles of the parent cue', () => {
      const shakaCue = new shaka.text.Cue(10, 20, '');
      const nestedCue1 = new shaka.text.Cue(10, 20, 'Test1');
      const nestedCue2 = new shaka.text.Cue(10, 20, 'Test2');

      shakaCue.nestedCues = [nestedCue1, nestedCue2];

      shakaCue.lineAlign = Cue.lineAlign.CENTER;
      nestedCue1.lineAlign = Cue.lineAlign.START;
      nestedCue2.lineAlign = Cue.lineAlign.START;

      verifyHelper(
          [
            {
              start: 10,
              end: 20,
              text: 'Test1 Test2',
              lineAlign: 'center',
            },
          ],
          [shakaCue]);
    });

    it('skips duplicate cues', () => {
      const cue1 = new shaka.text.Cue(10, 20, 'Test');
      displayer.append([cue1]);
      expect(mockTrack.addCue).toHaveBeenCalledTimes(1);
      mockTrack.addCue.calls.reset();

      const cue2 = new shaka.text.Cue(10, 20, 'Test');
      displayer.append([cue2]);
      expect(mockTrack.addCue).not.toHaveBeenCalled();
    });
  });

  describe('remove', function() {
    it('removes cues which overlap the range', function() {
      let cue1 = new shaka.text.Cue(0, 1, 'Test');
      let cue2 = new shaka.text.Cue(1, 2, 'Test');
      let cue3 = new shaka.text.Cue(2, 3, 'Test');
      displayer.append([cue1, cue2, cue3]);

      displayer.remove(0, 1);
      expect(mockTrack.removeCue.calls.count()).toBe(1);
      expect(mockTrack.removeCue).toHaveBeenCalledWith(
          jasmine.objectContaining({startTime: 0, endTime: 1}));
      mockTrack.removeCue.calls.reset();

      displayer.remove(0.5, 1.001);
      expect(mockTrack.removeCue.calls.count()).toBe(1);
      expect(mockTrack.removeCue).toHaveBeenCalledWith(
          jasmine.objectContaining({startTime: 1, endTime: 2}));
      mockTrack.removeCue.calls.reset();

      displayer.remove(3, 5);
      expect(mockTrack.removeCue).not.toHaveBeenCalled();
      mockTrack.removeCue.calls.reset();

      displayer.remove(2.9999, Infinity);
      expect(mockTrack.removeCue.calls.count()).toBe(1);
      expect(mockTrack.removeCue).toHaveBeenCalledWith(
          jasmine.objectContaining({startTime: 2, endTime: 3}));
      mockTrack.removeCue.calls.reset();
    });

    it('does nothing when nothing is buffered', function() {
      displayer.remove(0, 1);
      expect(mockTrack.removeCue).not.toHaveBeenCalled();
    });
  });

  describe('convertToTextTrackCue', function() {
    it('converts shaka.text.Cues to VttCues', function() {
      verifyHelper(
          [
            {start: 20, end: 40, text: 'Test4'},
          ],
          [
            new shaka.text.Cue(20, 40, 'Test4'),
          ]);

      let cue1 = new shaka.text.Cue(20, 40, 'Test5');
      cue1.positionAlign = Cue.positionAlign.LEFT;
      cue1.lineAlign = Cue.lineAlign.START;
      cue1.size = 80;
      cue1.textAlign = Cue.textAlign.LEFT;
      cue1.writingMode = Cue.writingMode.VERTICAL_LEFT_TO_RIGHT;
      cue1.lineInterpretation = Cue.lineInterpretation.LINE_NUMBER;
      cue1.line = 5;
      cue1.position = 10;

      verifyHelper(
          [
            {
              start: 20,
              end: 40,
              text: 'Test5',
              lineAlign: 'start',
              positionAlign: 'line-left',
              size: 80,
              align: 'left',
              vertical: 'lr',
              snapToLines: true,
              line: 5,
              position: 10,
            },
          ], [cue1]);

      let cue2 = new shaka.text.Cue(30, 50, 'Test');
      cue2.positionAlign = Cue.positionAlign.RIGHT;
      cue2.lineAlign = Cue.lineAlign.END;
      cue2.textAlign = Cue.textAlign.RIGHT;
      cue2.writingMode = Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
      cue2.lineInterpretation = Cue.lineInterpretation.PERCENTAGE;
      cue2.line = 5;

      verifyHelper(
          [
            {
              start: 30,
              end: 50,
              text: 'Test',
              lineAlign: 'end',
              positionAlign: 'line-right',
              align: 'right',
              vertical: 'rl',
              snapToLines: false,
              line: 5,
            },
          ], [cue2]);

      let cue3 = new shaka.text.Cue(40, 60, 'Test1');
      cue3.positionAlign = Cue.positionAlign.CENTER;
      cue3.lineAlign = Cue.lineAlign.CENTER;
      cue3.textAlign = Cue.textAlign.START;
      cue3.direction = Cue.direction.HORIZONTAL_LEFT_TO_RIGHT;

      verifyHelper(
          [
            {
              start: 40,
              end: 60,
              text: 'Test1',
              lineAlign: 'center',
              positionAlign: 'center',
              align: 'start',
              vertical: undefined,
            },
          ], [cue3]);

      let cue4 = new shaka.text.Cue(40, 60, 'Test2');
      cue4.line = null;
      cue4.position = null;

      verifyHelper(
          [
            {
              start: 40,
              end: 60,
              text: 'Test2',
              // In a real VTTCue, these would be the default of "auto".
              // With our mock, we leave them unset and they are undefined.
              line: undefined,
              position: undefined,
            },
          ], [cue4]);

      let cue5 = new shaka.text.Cue(40, 60, 'Test3');
      cue5.line = 0;
      cue5.position = 0;

      verifyHelper(
          [
            {
              start: 40,
              end: 60,
              text: 'Test3',
              line: 0,
              position: 0,
            },
          ], [cue5]);
    });

    it('works around browsers not supporting align=center', function() {
      /**
       * @constructor
       * @param {number} start
       * @param {number} end
       * @param {string} text
       */
      function FakeVTTCueWithoutAlignCenter(start, end, text) {
        let align = 'middle';
        Object.defineProperty(this, 'align', {
          get: function() { return align; },
          set: function(newValue) {
            if (newValue != 'center') align = newValue;
          },
        });
        this.startTime = start;
        this.endTime = end;
        this.text = text;
      }
      window.VTTCue = /** @type {?} */(FakeVTTCueWithoutAlignCenter);

      let cue1 = new shaka.text.Cue(20, 40, 'Test');
      cue1.textAlign = Cue.textAlign.CENTER;

      verifyHelper(
          [
            {
              start: 20,
              end: 40,
              text: 'Test',
              align: 'middle',
            },
          ],
          [cue1]);
    });

    it('ignores cues with startTime >= endTime', function() {
      mockTrack.addCue.calls.reset();
      let cue1 = new shaka.text.Cue(60, 40, 'Test');
      let cue2 = new shaka.text.Cue(40, 40, 'Test');
      displayer.append([cue1, cue2]);
      expect(mockTrack.addCue).not.toHaveBeenCalled();
    });
  });

  function createFakeCue(startTime, endTime) {
    return {startTime: startTime, endTime: endTime};
  }

  /**
   * Verifies that vttCues are converted to shakaCues and appended.
   * @param {!Array} vttCues
   * @param {!Array.<!shaka.text.Cue>} shakaCues
   */
  function verifyHelper(vttCues, shakaCues) {
    mockTrack.addCue.calls.reset();
    displayer.append(shakaCues);
    let result = mockTrack.addCue.calls.allArgs().reduce(
        shaka.util.Functional.collapseArrays, []);
    expect(result).toBeTruthy();
    expect(result.length).toBe(vttCues.length);

    for (let i = 0; i < vttCues.length; i++) {
      expect(result[i].startTime).toBe(vttCues[i].start);
      expect(result[i].endTime).toBe(vttCues[i].end);
      expect(result[i].text).toBe(vttCues[i].text);

      if ('id' in vttCues[i]) {
        expect(result[i].id).toBe(vttCues[i].id);
      }
      if ('vertical' in vttCues[i]) {
        expect(result[i].vertical).toBe(vttCues[i].vertical);
      }
      if ('line' in vttCues[i]) {
        expect(result[i].line).toBe(vttCues[i].line);
      }
      if ('align' in vttCues[i]) {
        expect(result[i].align).toBe(vttCues[i].align);
      }
      if ('size' in vttCues[i]) {
        expect(result[i].size).toBe(vttCues[i].size);
      }
      if ('position' in vttCues[i]) {
        expect(result[i].position).toBe(vttCues[i].position);
      }
    }
  }
});
