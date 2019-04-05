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

// This tests three assumptions we make about text tracks in Shaka Player:
//   1. If a non-null value for cues is stored, it will always be the
//      non-null value for cues when cues returns a non-null value.
//   2. Regardless of mode, we can use addCue to add cues regardless of the
//      track's current mode.
//   3. Regardless of mode, we can use removeCue to remove cues regardless
//      of the track's current mode.
describe('TextTrackIntegration', function() {
  /** @type {HTMLVideoElement} */
  let video;

  /** @type {TextTrack} */
  let track;

  /** @type {TextTrackCueList} */
  let trackCues;

  beforeEach(function() {
    video = shaka.util.Dom.createVideoElement();
    document.body.appendChild(video);

    expect(video.textTracks).toBeTruthy();
    expect(video.textTracks.length).toBe(0);

    track = video.addTextTrack('subtitles', 'test text track');
    expect(track).not.toBe(null);

    track.mode = 'showing';

    expect(video.textTracks.length).toBe(1);
    expect(track.cues).not.toBe(null);

    trackCues = track.cues;
  });

  afterEach(function() {
    document.body.removeChild(video);
    video = null;
    track = null;
    trackCues = null;
  });

  // There is a difference in behaviour with IE and Edge compared to everyone
  // else. Edge and IE will always return a valid list of cues regardless of
  // what the mode is set to. Everyone else will return null for cues when
  // mode is set to "disabled".
  describe('cues', function() {
    it('is not null when mode is showing', function() {
      track.mode = 'showing';
      expect(track.cues).not.toBe(null);
    });

    it('is not null when mode is hidden', function() {
      track.mode = 'hidden';
      expect(track.cues).not.toBe(null);
    });

    it('does not change references', function() {
      // Flip to the mode from showing to hidden and back. The value
      // of cues should not change.
      track.mode = 'hidden';
      track.mode = 'showing';
      expect(track.cues).toBe(trackCues);

      // Flip to the mode from showing to disabled and back. The value
      // of cues should not change.
      track.mode = 'disabled';
      track.mode = 'showing';
      expect(track.cues).toBe(trackCues);
    });
  });


  describe('addCue', function() {
    let cues = [
      new VTTCue(0, 1000, 'Cue 1 message'),
      new VTTCue(2000, 3000, 'Cue 2 message'),
    ];

    it('adds cues when showing', function() {
      track.mode = 'showing';

      track.addCue(cues[0]);
      track.addCue(cues[1]);

      expect(trackCues.length).toBe(2);
      expect(trackCues[0]).toBe(cues[0]);
      expect(trackCues[1]).toBe(cues[1]);
    });

    it('adds cues when hidden', function() {
      track.mode = 'hidden';

      track.addCue(cues[0]);
      track.addCue(cues[1]);

      expect(trackCues.length).toBe(2);
      expect(trackCues[0]).toBe(cues[0]);
      expect(trackCues[1]).toBe(cues[1]);
    });

    it('adds cues when disabled', function() {
      track.mode = 'disabled';

      track.addCue(cues[0]);
      track.addCue(cues[1]);

      expect(trackCues.length).toBe(2);
      expect(trackCues[0]).toBe(cues[0]);
      expect(trackCues[1]).toBe(cues[1]);
    });
  });

  describe('removeCue', function() {
    let cues = [
      new VTTCue(0, 1000, 'Cue 1 message'),
      new VTTCue(2000, 3000, 'Cue 2 message'),
    ];

    it('removes cues when showing', function() {
      track.mode = 'showing';

      track.addCue(cues[0]);
      track.addCue(cues[1]);

      expect(trackCues.length).toBe(2);

      track.removeCue(cues[0]);
      track.removeCue(cues[1]);

      expect(trackCues.length).toBe(0);
    });

    it('removes cues when hidden', function() {
      track.mode = 'showing';

      track.addCue(cues[0]);
      track.addCue(cues[1]);

      track.mode = 'hidden';

      expect(trackCues.length).toBe(2);

      track.removeCue(cues[0]);
      track.removeCue(cues[1]);

      expect(trackCues.length).toBe(0);
    });

    it('removes cues when disabled', function() {
      track.mode = 'showing';

      track.addCue(cues[0]);
      track.addCue(cues[1]);

      track.mode = 'disabled';

      expect(trackCues.length).toBe(2);

      track.removeCue(cues[0]);
      track.removeCue(cues[1]);

      expect(trackCues.length).toBe(0);
    });
  });
});
