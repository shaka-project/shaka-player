/**
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
 *
 * @fileoverview steam_video_source.js tests.
 */

goog.require('shaka.media.ManifestInfo');
goog.require('shaka.media.PeriodInfo');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.media.StreamSetInfo');
goog.require('shaka.player.StreamVideoSource');

describe('StreamVideoSource', function() {
  var initialVideoReferences1;
  var initialVideoReferences2;
  var initialAudioReferences;
  var manifest;
  var source;

  beforeEach(function() {
    initialVideoReferences1 = [];
    initialVideoReferences1.push(new shaka.media.SegmentReference(
        100, 30, 40, 0, null, 'http://example.com/video-sd-100.mp4'));
    initialVideoReferences1.push(new shaka.media.SegmentReference(
        101, 40, 50, 0, null, 'http://example.com/video-sd-101.mp4'));
    initialVideoReferences1.push(new shaka.media.SegmentReference(
        102, 50, 60, 0, null, 'http://example.com/video-sd-102.mp4'));

    initialVideoReferences2 = [];
    initialVideoReferences2.push(new shaka.media.SegmentReference(
        100, 30, 40, 0, null, 'http://example.com/video-hd-100.mp4'));
    initialVideoReferences2.push(new shaka.media.SegmentReference(
        101, 40, 50, 0, null, 'http://example.com/video-hd-101.mp4'));
    initialVideoReferences2.push(new shaka.media.SegmentReference(
        102, 50, 60, 0, null, 'http://example.com/video-hd-102.mp4'));

    initialAudioReferences = [];
    initialAudioReferences.push(new shaka.media.SegmentReference(
        1, 30, 40, 0, null, 'http://example.com/audio-1.mp4'));
    initialAudioReferences.push(new shaka.media.SegmentReference(
        2, 40, 50, 0, null, 'http://example.com/audio-2.mp4'));
    initialAudioReferences.push(new shaka.media.SegmentReference(
        3, 50, 60, 0, null, 'http://example.com/audio-3.mp4'));

    manifest = createLiveManifest(initialVideoReferences1,
                                  initialVideoReferences2,
                                  initialAudioReferences);

    source = new shaka.player.StreamVideoSource(manifest);
  });

  describe('update', function() {
    it('merges SegmentIndexes', function(done) {
      // Repeat the last reference from |initialVideoReferences1| so we can
      // check that it doesn't get duplicated after merging.
      var newVideoReferences1 = [];
      newVideoReferences1.push(new shaka.media.SegmentReference(
          102, 50, 60, 0, null, 'http://example.com/video-sd-102.mp4'));
      newVideoReferences1.push(new shaka.media.SegmentReference(
          103, 60, 70, 0, null, 'http://example.com/video-sd-103.mp4'));
      newVideoReferences1.push(new shaka.media.SegmentReference(
          104, 70, 80, 0, null, 'http://example.com/video-sd-104.mp4'));

      // Don't update the HD SegmentIndex so we can check that it doesn't
      // get modified after merging.
      var newVideoReferences2 = cloneReferences(initialVideoReferences2);

      // Create a gap between the last reference from |initialAudioReferences|
      // and the next one so we can check that the new reference gets fixed-up.
      var newAudioReferences = [];
      newAudioReferences.push(new shaka.media.SegmentReference(
          4, 62, 70, 0, null, 'http://example.com/audio-4.mp4'));
      newAudioReferences.push(new shaka.media.SegmentReference(
          5, 70, 80, 0, null, 'http://example.com/audio-5.mp4'));

      var newManifest = createLiveManifest(newVideoReferences1,
                                           newVideoReferences2,
                                           newAudioReferences);

      source.load().then(shaka.util.TypedBind(this,
          function() {
            source.updateManifest(newManifest);
            var mergedManifest = source.manifestInfo;

            // Check the SD video's StreamInfo's SegmentIndex.
            var mergedVideoStreamInfo1 =
                mergedManifest.periodInfos[0].streamSetInfos[0].streamInfos[0];
            expect(mergedVideoStreamInfo1.id).toBe('video-sd');

            var mergedVideoReferences1 =
                mergedVideoStreamInfo1.segmentIndex.references_;

            checkReference(
                mergedVideoReferences1[0],
                'http://example.com/video-sd-100.mp4',
                30, 40);

            checkReference(
                mergedVideoReferences1[1],
                'http://example.com/video-sd-101.mp4',
                40, 50);

            checkReference(
                mergedVideoReferences1[2],
                'http://example.com/video-sd-102.mp4',
                50, 60);

            checkReference(
                mergedVideoReferences1[3],
                'http://example.com/video-sd-103.mp4',
                60, 70);

            checkReference(
                mergedVideoReferences1[4],
                'http://example.com/video-sd-104.mp4',
                70, 80);

            // Check the HD video's StreamInfo's SegmentIndex.
            var mergedVideoStreamInfo2 =
                mergedManifest.periodInfos[0].streamSetInfos[0].streamInfos[1];
            expect(mergedVideoStreamInfo2.id).toBe('video-hd');

            var mergedVideoReferences2 =
                mergedVideoStreamInfo2.segmentIndex.references_;

            checkReference(
                mergedVideoReferences2[0],
                'http://example.com/video-hd-100.mp4',
                30, 40);

            checkReference(
                mergedVideoReferences2[1],
                'http://example.com/video-hd-101.mp4',
                40, 50);

            checkReference(
                mergedVideoReferences2[2],
                'http://example.com/video-hd-102.mp4',
                50, 60);

            // Check the audio's StreamInfo's SegmentIndex.
            var mergedAudioStreamInfo =
                mergedManifest.periodInfos[0].streamSetInfos[1].streamInfos[0];
            expect(mergedAudioStreamInfo.id).toBe('audio');

            var mergedAudioReferences =
                mergedAudioStreamInfo.segmentIndex.references_;

            checkReference(
                mergedAudioReferences[0],
                'http://example.com/audio-1.mp4',
                30, 40);

            checkReference(
                mergedAudioReferences[1],
                'http://example.com/audio-2.mp4',
                40, 50);

            checkReference(
                mergedAudioReferences[2],
                'http://example.com/audio-3.mp4',
                50, 62);

            // The start time should get fixed-up.
            checkReference(
                mergedAudioReferences[3],
                'http://example.com/audio-4.mp4',
                62, 70);

            checkReference(
                mergedAudioReferences[4],
                'http://example.com/audio-5.mp4',
                70, 80);

            done();
          })
      );
    });

    it('removes an inactive StreamInfo', function(done) {
      var newVideoReferences1 = cloneReferences(initialVideoReferences1);
      var newVideoReferences2 = cloneReferences(initialVideoReferences2);
      var newAudioReferences = cloneReferences(initialAudioReferences);

      var newManifest = createLiveManifest(newVideoReferences1,
                                           newVideoReferences2,
                                           newAudioReferences);

      // Remove the SD video stream.
      var streamInfos =
          newManifest.periodInfos[0].streamSetInfos[0].streamInfos;
      streamInfos.splice(0, 1);

      source.load().then(shaka.util.TypedBind(this,
          function() {
            source.updateManifest(newManifest);
            var mergedManifest = source.manifestInfo;

            // Check that the SD video stream was removed.
            var streamInfos =
                mergedManifest.periodInfos[0].streamSetInfos[0].streamInfos;
            expect(streamInfos.length).toBe(1);
            expect(streamInfos[0].id).toBe('video-hd');

            done();
          })
      );
    });

    it('adds a new StreamInfo', function(done) {
      var newVideoReferences1 = cloneReferences(initialVideoReferences1);
      var newVideoReferences2 = cloneReferences(initialVideoReferences2);
      var newAudioReferences = cloneReferences(initialAudioReferences);

      var newManifest = createLiveManifest(newVideoReferences1,
                                           newVideoReferences2,
                                           newAudioReferences);

      // Add another video stream.
      var newVideoInfo = new shaka.media.StreamInfo();
      newVideoInfo.id = 'video-new';
      newVideoInfo.mimeType = 'video/mp4';
      newVideoInfo.codecs = 'avc1.4d4015';

      newManifest.periodInfos[0].streamSetInfos[0].streamInfos.push(
          newVideoInfo);

      source.load().then(shaka.util.TypedBind(this,
          function() {
            source.updateManifest(newManifest);
            var mergedManifest = source.manifestInfo;

            // Check that the new stream was added.
            var newStreamInfo =
                mergedManifest.periodInfos[0].streamSetInfos[0].streamInfos[2];
            expect(newStreamInfo.id).toBe('video-new');

            done();
          })
      );
    });
  });

  /**
   * Creates a ManifestInfo. Ownership of |videoReferences1|,
   * |videoReferences2|, and |audioReferences| is transferred to the returned
   * ManifestInfo.
   *
   * @param {!Array.<!shaka.media.SegmentReference>} videoReferences1
   * @param {!Array.<!shaka.media.SegmentReference>} videoReferences2
   * @param {!Array.<!shaka.media.SegmentReference>} audioReferences
   * @return {!shaka.media.ManifestInfo}
   */
  function createLiveManifest(
      videoReferences1, videoReferences2, audioReferences) {
    // Build SD video StreamInfo.
    var videoInfo1 = new shaka.media.StreamInfo();
    videoInfo1.id = 'video-sd';
    videoInfo1.bandwidth = 250000;
    videoInfo1.width = 720;
    videoInfo1.height = 480;
    videoInfo1.mimeType = 'video/mp4';
    videoInfo1.codecs = 'avc1.4d4015';
    videoInfo1.segmentIndex = new shaka.media.SegmentIndex(videoReferences1);

    // Build HD video StreamInfo.
    var videoInfo2 = new shaka.media.StreamInfo();
    videoInfo2.id = 'video-hd';
    videoInfo2.bandwidth = 500000;
    videoInfo2.width = 1920;
    videoInfo2.height = 1080;
    videoInfo2.mimeType = 'video/mp4';
    videoInfo2.codecs = 'avc1.4d4015';
    videoInfo2.segmentIndex = new shaka.media.SegmentIndex(videoReferences2);

    // Build audio StreamInfo.
    var audioInfo = new shaka.media.StreamInfo();
    audioInfo.id = 'audio';
    audioInfo.bandwidth = 1800000;
    audioInfo.mimeType = 'audio/mp4';
    audioInfo.codecs = 'mp4a.40.2';
    audioInfo.segmentIndex = new shaka.media.SegmentIndex(audioReferences);

    // Build video set.
    var videoSetInfo = new shaka.media.StreamSetInfo();
    videoSetInfo.contentType = 'video';
    videoSetInfo.streamInfos = [videoInfo1, videoInfo2];

    // Build audio set.
    var audioSetInfo = new shaka.media.StreamSetInfo();
    audioSetInfo.contentType = 'audio';
    audioSetInfo.streamInfos = [audioInfo];

    // Build period.
    var periodInfo = new shaka.media.PeriodInfo();
    periodInfo.id = 'period-1';
    periodInfo.start = 0;
    periodInfo.duration = 3600;
    periodInfo.streamSetInfos = [videoSetInfo, audioSetInfo];

    // Build manifest.
    var manifest = new shaka.media.ManifestInfo();
    manifest.live = true;
    manifest.periodInfos = [periodInfo];

    return manifest;
  }

  /**
   * @param {!Array.<!shaka.media.SegmentReference>} references
   * @return {!Array.<!shaka.media.SegmentReference>}
   */
  function cloneReferences(references) {
    var cloned = [];
    for (var i = 0; i < references.length; ++i) {
      var r = references[i];
      cloned.push(new shaka.media.SegmentReference(
          r.id,
          r.startTime,
          r.endTime,
          r.startByte,
          r.endByte,
          r.url ? new goog.Uri(r.url) : null));
    }
    return cloned;
  };
});

