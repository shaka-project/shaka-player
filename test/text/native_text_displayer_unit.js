/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('NativeTextDisplayer', () => {
  const originalVTTCue = window.VTTCue;
  const Cue = shaka.text.Cue;
  const NativeTextDisplayer = shaka.text.NativeTextDisplayer;

  /** @type {!shaka.test.FakeVideo} */
  let video;
  /** @type {!shaka.test.FakeTextTrack} */
  let mockTrack;
  /** @type {!shaka.text.NativeTextDisplayer} */
  let displayer;
  /** @type {Object} **/
  let player;

  beforeEach(() => {
    /** @type {!Array<shaka.extern.TextTrack>} */
    const textTracks = [{
      id: 0,
      active: true,
    }];
    player = {
      addEventListener: () => {},
      removeEventListener: () => {},
      getMediaElement: () => video,
      getLoadMode: () => shaka.Player.LoadMode.MEDIA_SOURCE,
      getTextTracks: () => textTracks,
      selectTextTrack: ({id}) => {
        const track = textTracks.find((t) => t.id === id);
        expect(track).toBeTruthy();
        track.active = true;
      },
    };
    video = new shaka.test.FakeVideo();
    /** @suppress {checkTypes} */
    displayer = new NativeTextDisplayer(player);
    displayer.enableTextDisplayer();

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

  afterEach(async () => {
    await displayer.destroy();
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
      // Regression test for https://github.com/shaka-project/shaka-player/issues/848

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
            {startTime: 20, endTime: 40, text: 'Test1'},
            {startTime: 20, endTime: 40, text: 'Test2'},
            {startTime: 20, endTime: 40, text: 'Test3'},
          ],
          [
            // Reverse order to compensate for the way line='auto' is
            // implemented in browsers.
            new shaka.text.Cue(20, 40, 'Test3'),
            new shaka.text.Cue(20, 40, 'Test2'),
            new shaka.text.Cue(20, 40, 'Test1'),
          ]);

      // Next we test the behavior with a VTTCue which is seen as a cheap
      // polyfill (in which prototype.line does not exist).  This simulates
      // legacy Edge.
      // eslint-disable-next-line no-restricted-syntax
      delete window.VTTCue.prototype['line'];
      displayer.remove(0, Infinity);  // Clear the cues from above.
      verifyHelper(
          [
            {startTime: 20, endTime: 40, text: 'Test1'},
            {startTime: 20, endTime: 40, text: 'Test2'},
            {startTime: 20, endTime: 40, text: 'Test3'},
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
      const nestedCue1 = new shaka.text.Cue(10, 20, 'Test1 ');
      const nestedCue2 = new shaka.text.Cue(10, 20, 'Test2');

      shakaCue.nestedCues = [nestedCue1, nestedCue2];
      verifyHelper(
          [
            {startTime: 10, endTime: 20, text: 'Test1 Test2'},
          ],
          [shakaCue]);
    });

    it('flattens nested cue payloads correctly', () => {
      const level0ContainerCue = new shaka.text.Cue(10, 30, '');
      level0ContainerCue.isContainer = true;

      const level1NonContainerCueA = new shaka.text.Cue(10, 20, '');
      const level1NonContainerCueB = new shaka.text.Cue(20, 30, '');

      // Add a trailing whitespace character to get a space-delimited expected
      // result.
      const cueANestedCue0 = new shaka.text.Cue(10, 20, 'Cue A Test0 ');
      const cueANestedCue1 = new shaka.text.Cue(10, 20, 'Cue A Test1');
      const cueBNestedCue0 = new shaka.text.Cue(20, 30, 'Cue B Test0 ');
      const cueBNestedCue1 = new shaka.text.Cue(20, 30, 'Cue B Test1');

      level1NonContainerCueA.nestedCues = [cueANestedCue0, cueANestedCue1];
      level1NonContainerCueB.nestedCues = [cueBNestedCue0, cueBNestedCue1];
      level0ContainerCue.nestedCues =
          [level1NonContainerCueA, level1NonContainerCueB];

      verifyHelper(
          [
            {startTime: 10, endTime: 20, text: 'Cue A Test0 Cue A Test1'},
            {startTime: 20, endTime: 30, text: 'Cue B Test0 Cue B Test1'},
          ],
          [level0ContainerCue]);
    });

    // Regression test for b/159050711
    it('maintains the styles of the parent cue', () => {
      const shakaCue = new shaka.text.Cue(10, 20, '');
      const nestedCue1 = new shaka.text.Cue(10, 20, 'Test1 ');
      const nestedCue2 = new shaka.text.Cue(10, 20, 'Test2');

      shakaCue.nestedCues = [nestedCue1, nestedCue2];

      shakaCue.lineAlign = Cue.lineAlign.CENTER;
      nestedCue1.lineAlign = Cue.lineAlign.START;
      nestedCue2.lineAlign = Cue.lineAlign.START;

      verifyHelper(
          [
            {
              startTime: 10,
              endTime: 20,
              text: 'Test1 Test2',
              lineAlign: 'center',
            },
          ],
          [shakaCue]);
    });

    it('creates style tags for cues with underline/italics/bold', () => {
      const shakaCue = new shaka.text.Cue(10, 20, '');

      // First cue is underlined and italicized.
      const nestedCue1 = new shaka.text.Cue(10, 20, 'Test1');
      nestedCue1.fontStyle = shaka.text.Cue.fontStyle.ITALIC;
      nestedCue1.textDecoration.push(shaka.text.Cue.textDecoration.UNDERLINE);

      // Second cue is italicized and bolded.
      const nestedCue2 = new shaka.text.Cue(10, 20, 'Test2');
      nestedCue2.fontStyle = shaka.text.Cue.fontStyle.ITALIC;
      nestedCue2.fontWeight = shaka.text.Cue.fontWeight.BOLD;

      // Third cue has no bold, italics, or underline.
      const nestedCue3 = new shaka.text.Cue(10, 20, 'Test3');

      // Fourth cue is only underlined.
      const nestedCue4 = new shaka.text.Cue(10, 20, 'Test4');
      nestedCue4.textDecoration.push(shaka.text.Cue.textDecoration.UNDERLINE);

      const expectedText =
          '<i><u>Test1</u></i><b><i>Test2</i></b>Test3<u>Test4</u>';
      shakaCue.nestedCues = [nestedCue1, nestedCue2, nestedCue3, nestedCue4];
      verifyHelper(
          [
            {startTime: 10, endTime: 20, text: expectedText},
          ],
          [shakaCue]);
    });

    it('adds linebreaks when a linebreak cue is seen', () => {
      const shakaCue = new shaka.text.Cue(10, 20, '');
      const nestedCue1 = new shaka.text.Cue(10, 20, 'Test1');

      // Second cue is a linebreak cue.
      const nestedCue2 = new shaka.text.Cue(10, 20, '');
      nestedCue2.lineBreak = true;

      const nestedCue3 = new shaka.text.Cue(10, 20, 'Test2');

      shakaCue.nestedCues = [nestedCue1, nestedCue2, nestedCue3];
      verifyHelper(
          [
            {startTime: 10, endTime: 20, text: 'Test1\nTest2'},
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
            {startTime: 20, endTime: 40, text: 'Test4'},
          ],
          [
            new shaka.text.Cue(20, 40, 'Test4'),
          ]);

      const cue1 = new shaka.text.Cue(20, 40, 'Test5');
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

      const cue3 = new shaka.text.Cue(40, 60, 'Test1');
      cue3.positionAlign = Cue.positionAlign.CENTER;
      cue3.lineAlign = Cue.lineAlign.CENTER;
      cue3.textAlign = Cue.textAlign.START;
      cue3.direction = Cue.direction.HORIZONTAL_LEFT_TO_RIGHT;

      verifyHelper(
          [
            {
              startTime: 40,
              endTime: 60,
              text: 'Test1',
              lineAlign: 'center',
              positionAlign: 'center',
              align: 'start',
              vertical: undefined,
            },
          ], [cue3]);

      const cue4 = new shaka.text.Cue(40, 60, 'Test2');
      cue4.line = null;
      cue4.position = null;

      verifyHelper(
          [
            {
              startTime: 40,
              endTime: 60,
              text: 'Test2',
              line: 'auto',
              position: 'auto',
            },
          ], [cue4]);

      const cue5 = new shaka.text.Cue(40, 60, 'Test3');
      cue5.line = 0;
      cue5.position = 0;

      verifyHelper(
          [
            {
              startTime: 40,
              endTime: 60,
              text: 'Test3',
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
      mockTrack.addCue.calls.reset();
      const cue1 = new shaka.text.Cue(60, 40, 'Test');
      const cue2 = new shaka.text.Cue(40, 40, 'Test');
      displayer.append([cue1, cue2]);
      expect(mockTrack.addCue).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('deletes the TextTrack it created', async () => {
      // There should only be the one track created by this displayer.
      expect(video.textTracks.length).toBe(1);

      await displayer.destroy();

      // It should be deleted after we destroy it.
      expect(video.textTracks.length).toBe(0);
    });
  });

  function createFakeCue(startTime, endTime) {
    return {startTime: startTime, endTime: endTime};
  }

  /**
   * Verifies that vttCues are converted to shakaCues and appended.
   * @param {!Array} vttCues
   * @param {!Array<!shaka.text.Cue>} shakaCues
   */
  function verifyHelper(vttCues, shakaCues) {
    mockTrack.addCue.calls.reset();
    displayer.append(shakaCues);
    const result = mockTrack.addCue.calls.allArgs().reduce(
        shaka.util.Functional.collapseArrays, []);
    expect(result).toEqual(vttCues.map((c) => jasmine.objectContaining(c)));
  }
});
