/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


describe('SimpleTextDisplayer', () => {
  const originalVTTCue = window.VTTCue;
  const Cue = shaka.text.Cue;
  const SimpleTextDisplayer = shaka.text.SimpleTextDisplayer;

  /** @type {!shaka.test.FakeVideo} */
  let video;
  /** @type {!shaka.test.FakeTextTrack} */
  let mockTrack;
  /** @type {!shaka.text.SimpleTextDisplayer} */
  let displayer;

  beforeEach(() => {
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
      this.snapToLines = true;
      this.vertical = undefined;
      this.line = 'auto';
      this.position = 'auto';
    }
    window.VTTCue = /** @type {?} */(FakeVTTCue);
  });

  afterAll(() => {
    window.VTTCue = originalVTTCue;
  });

  describe('append', () => {
    it('sorts cues before inserting', () => {
      // See: https://bit.ly/2K9VX3s
      verifyHelper(
          [
            {startTime: 10, endTime: 20, text: 'Test1'},
            {startTime: 20, endTime: 30, text: 'Test2'},
            {startTime: 30, endTime: 40, text: 'Test3'},
          ],
          [
            new shaka.text.Cue(20, 30, 'Test2'),
            new shaka.text.Cue(30, 40, 'Test3'),
            new shaka.text.Cue(10, 20, 'Test1'),
          ]);
    });

    it('appends equal time cues in reverse order', () => {
      // Regression test for https://github.com/google/shaka-player/issues/848
      verifyHelper(
          [
            {startTime: 20, endTime: 40, text: 'Test1'},
            {startTime: 20, endTime: 40, text: 'Test2'},
            {startTime: 20, endTime: 40, text: 'Test3'},
          ],
          [
            new shaka.text.Cue(20, 40, 'Test3'),
            new shaka.text.Cue(20, 40, 'Test2'),
            new shaka.text.Cue(20, 40, 'Test1'),
          ]);
    });
  });

  describe('remove', () => {
    it('removes cues which overlap the range', () => {
      const cue1 = new shaka.text.Cue(0, 1, 'Test');
      const cue2 = new shaka.text.Cue(1, 2, 'Test');
      const cue3 = new shaka.text.Cue(2, 3, 'Test');
      displayer.append([cue1, cue2, cue3]);

      displayer.remove(0, 1);
      expect(mockTrack.removeCue).toHaveBeenCalledTimes(1);
      expect(mockTrack.removeCue).toHaveBeenCalledWith(
          jasmine.objectContaining({startTime: 0, endTime: 1}));
      mockTrack.removeCue.calls.reset();

      displayer.remove(0.5, 1.001);
      expect(mockTrack.removeCue).toHaveBeenCalledTimes(1);
      expect(mockTrack.removeCue).toHaveBeenCalledWith(
          jasmine.objectContaining({startTime: 1, endTime: 2}));
      mockTrack.removeCue.calls.reset();

      displayer.remove(3, 5);
      expect(mockTrack.removeCue).not.toHaveBeenCalled();
      mockTrack.removeCue.calls.reset();

      displayer.remove(2.9999, Infinity);
      expect(mockTrack.removeCue).toHaveBeenCalledTimes(1);
      expect(mockTrack.removeCue).toHaveBeenCalledWith(
          jasmine.objectContaining({startTime: 2, endTime: 3}));
      mockTrack.removeCue.calls.reset();
    });

    it('does nothing when nothing is buffered', () => {
      displayer.remove(0, 1);
      expect(mockTrack.removeCue).not.toHaveBeenCalled();
    });
  });

  describe('convertToTextTrackCue', () => {
    it('converts shaka.text.Cues to VttCues', () => {
      verifyHelper(
          [
            {startTime: 20, endTime: 40, text: 'Test'},
          ],
          [
            new shaka.text.Cue(20, 40, 'Test'),
          ]);

      const cue1 = new shaka.text.Cue(20, 40, 'Test');
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
              startTime: 20,
              endTime: 40,
              text: 'Test',
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

      const cue2 = new shaka.text.Cue(30, 50, 'Test');
      cue2.positionAlign = Cue.positionAlign.RIGHT;
      cue2.lineAlign = Cue.lineAlign.END;
      cue2.textAlign = Cue.textAlign.RIGHT;
      cue2.writingMode = Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
      cue2.lineInterpretation = Cue.lineInterpretation.PERCENTAGE;
      cue2.line = 5;

      verifyHelper(
          [
            {
              startTime: 30,
              endTime: 50,
              text: 'Test',
              lineAlign: 'end',
              positionAlign: 'line-right',
              align: 'right',
              vertical: 'rl',
              snapToLines: false,
              line: 5,
            },
          ], [cue2]);

      const cue3 = new shaka.text.Cue(40, 60, 'Test');
      cue3.positionAlign = Cue.positionAlign.CENTER;
      cue3.lineAlign = Cue.lineAlign.CENTER;
      cue3.textAlign = Cue.textAlign.START;
      cue3.direction = Cue.direction.HORIZONTAL_LEFT_TO_RIGHT;

      verifyHelper(
          [
            {
              startTime: 40,
              endTime: 60,
              text: 'Test',
              lineAlign: 'center',
              positionAlign: 'center',
              align: 'start',
              vertical: undefined,
            },
          ], [cue3]);

      const cue4 = new shaka.text.Cue(40, 60, 'Test');
      cue4.line = null;
      cue4.position = null;

      verifyHelper(
          [
            {
              startTime: 40,
              endTime: 60,
              text: 'Test',
              line: 'auto',
              position: 'auto',
            },
          ], [cue4]);

      const cue5 = new shaka.text.Cue(40, 60, 'Test');
      cue5.line = 0;
      cue5.position = 0;

      verifyHelper(
          [
            {
              startTime: 40,
              endTime: 60,
              text: 'Test',
              line: 0,
              position: 0,
            },
          ], [cue5]);
    });

    it('works around browsers not supporting align=center', () => {
      /**
       * @constructor
       * @param {number} start
       * @param {number} end
       * @param {string} text
       */
      function FakeVTTCueWithoutAlignCenter(start, end, text) {
        let align = 'middle';
        Object.defineProperty(this, 'align', {
          get: () => align,
          set: (newValue) => {
            if (newValue != 'center') {
              align = newValue;
            }
          },
        });
        this.startTime = start;
        this.endTime = end;
        this.text = text;
      }
      window.VTTCue = /** @type {?} */(FakeVTTCueWithoutAlignCenter);

      const cue1 = new shaka.text.Cue(20, 40, 'Test');
      cue1.textAlign = Cue.textAlign.CENTER;

      verifyHelper(
          [
            {
              startTime: 20,
              endTime: 40,
              text: 'Test',
              align: 'middle',
            },
          ],
          [cue1]);
    });

    it('ignores cues with startTime >= endTime', () => {
      const cue1 = new shaka.text.Cue(60, 40, 'Test');
      const cue2 = new shaka.text.Cue(40, 40, 'Test');
      displayer.append([cue1, cue2]);
      expect(mockTrack.addCue).not.toHaveBeenCalled();
    });
  });

  function createFakeCue(startTime, endTime) {
    return {startTime: startTime, endTime: endTime};
  }

  /**
   * @param {!Array} vttCues
   * @param {!Array.<!shaka.text.Cue>} shakaCues
   */
  function verifyHelper(vttCues, shakaCues) {
    mockTrack.addCue.calls.reset();
    displayer.append(shakaCues);
    const result = mockTrack.addCue.calls.allArgs().reduce(
        shaka.util.Functional.collapseArrays, []);
    expect(result).toEqual(vttCues.map((c) => jasmine.objectContaining(c)));
  }
});
