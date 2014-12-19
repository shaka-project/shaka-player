/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview dash_video_source.js unit tests.
 */

goog.require('shaka.dash.mpd');
goog.require('shaka.player.AudioTrack');
goog.require('shaka.player.DashVideoSource');
goog.require('shaka.player.VideoTrack');
goog.require('shaka.util.MultiMap');

describe('DashVideoSource', function() {
  // TODO(story 2544737): Add additional unit tests.
  it('is able to get audio and video tracks.', function() {
    // |videoRepresentation1| and |videoRepresentation2| are part of
    // |videoSet1|
    var videoRepresentation1 = new shaka.dash.mpd.Representation();
    videoRepresentation1.mimeType = 'video/mp4';
    videoRepresentation1.bandwidth = 1000;
    videoRepresentation1.width = 640;
    videoRepresentation1.height = 380;

    var videoRepresentation2 = new shaka.dash.mpd.Representation();
    videoRepresentation2.mimeType = 'video/mp4';
    videoRepresentation2.bandwidth = 2000;
    videoRepresentation2.width = 720;
    videoRepresentation2.height = 480;

    // |audioRepresentation1| and |audioRepresentation2| are part of
    // |audioSet1|
    var audioRepresentation1 = new shaka.dash.mpd.Representation();
    audioRepresentation1.mimeType = 'audio/mp4';
    audioRepresentation1.bandwidth = 500;

    var audioRepresentation2 = new shaka.dash.mpd.Representation();
    audioRepresentation2.mimeType = 'audio/mp4';
    audioRepresentation2.bandwidth = 900;

    // |audioRepresentation3| and |audioRepresentation4| are part of
    // |audioSet2|
    var audioRepresentation3 = new shaka.dash.mpd.Representation();
    audioRepresentation3.mimeType = 'audio/mp4';
    audioRepresentation3.bandwidth = 500;

    var audioRepresentation4 = new shaka.dash.mpd.Representation();
    audioRepresentation4.mimeType = 'audio/mp4';
    audioRepresentation4.bandwidth = 800;

    var videoSet1 = new shaka.dash.mpd.AdaptationSet();
    videoSet1.contentType = 'video';
    videoSet1.representations = [videoRepresentation1, videoRepresentation2];

    var audioSet1 = new shaka.dash.mpd.AdaptationSet();
    audioSet1.lang = 'en';
    audioSet1.contentType = 'audio';
    audioSet1.representations = [audioRepresentation1, audioRepresentation2];

    var audioSet2 = new shaka.dash.mpd.AdaptationSet();
    audioSet2.lang = 'fr';
    audioSet2.contentType = 'audio';
    audioSet2.representations = [audioRepresentation3, audioRepresentation4];

    var adaptationSetMap = new shaka.util.MultiMap();
    adaptationSetMap.push('video', videoSet1);
    adaptationSetMap.push('audio', audioSet1);
    adaptationSetMap.push('audio', audioSet2);

    var videoSource = createFakeDashVideoSource(adaptationSetMap);

    // Aliases.
    var AudioTrack = shaka.player.AudioTrack;
    var VideoTrack = shaka.player.VideoTrack;

    // Check the audio tracks.
    var expectedAudioTracks = [
      new AudioTrack(3, 500, 'en'),
      new AudioTrack(4, 900, 'en'),
      new AudioTrack(5, 500, 'fr'),
      new AudioTrack(6, 800, 'fr')];

    var audioTracks = videoSource.getAudioTracks();
    expect(audioTracks).not.toBeNull();
    expect(audioTracks.length).toBe(expectedAudioTracks.length);

    expectedAudioTracks.sort(AudioTrack.compare);
    audioTracks.sort(AudioTrack.compare);

    for (var i = 0; i < expectedAudioTracks.length; ++i) {
      expect(audioTracks[i].id).toBe(expectedAudioTracks[i].id);
      expect(AudioTrack.compare(audioTracks[i],
                                expectedAudioTracks[i])).toBe(0);
    }

    // Check the video tracks.
    var expectedVideoTracks = [
      new VideoTrack(1, 1000, 640, 380),
      new VideoTrack(2, 2000, 720, 480)];

    var videoTracks = videoSource.getVideoTracks();
    expect(videoTracks).not.toBeNull();
    expect(videoTracks.length).toBe(expectedVideoTracks.length);

    expectedVideoTracks.sort(VideoTrack.compare);
    videoTracks.sort(VideoTrack.compare);

    for (var i = 0; i < expectedVideoTracks.length; ++i) {
      expect(videoTracks[i].id).toBe(expectedVideoTracks[i].id);
      expect(VideoTrack.compare(videoTracks[i],
                                expectedVideoTracks[i])).toBe(0);
    }
  });

  // Creates a fake DashVideoSource object. This is a hack to test
  // getAudioTracks() and getVideoTracks() without actually creating a real
  // DashVideoSource, which would require setting up a bunch of mock objects.
  // TODO(story 2544737): Use a real DashVideoSource object.
  createFakeDashVideoSource = function(adaptationSetMap) {
    var fakeMpdProcessor = {
      getNumPeriods : function() {
        return 1;
      },
      getAdaptationSets : function(periodIdx, opt_type) {
        console.assert(periodIdx == 0);
        return opt_type ?
               adaptationSetMap.get(opt_type) :
               adaptationSetMap.getAll();
      }
    };

    fakeDashVideoSource = {};

    fakeDashVideoSource.streamsByType_ = {};

    fakeDashVideoSource.processor_ = fakeMpdProcessor;

    fakeDashVideoSource.getAudioTracks =
        shaka.player.DashVideoSource.prototype.getAudioTracks.bind(
            fakeDashVideoSource);

    fakeDashVideoSource.getVideoTracks =
        shaka.player.DashVideoSource.prototype.getVideoTracks.bind(
            fakeDashVideoSource);

    return fakeDashVideoSource;
  };
});

