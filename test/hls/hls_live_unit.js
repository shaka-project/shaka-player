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

describe('HlsParser live', function() {
  /** @const */
  var Util = shaka.test.Util;
  /** @const */
  var ManifestParser = shaka.test.ManifestParser;
  /** @type {!shaka.test.FakeNetworkingEngine} */
  var fakeNetEngine;
  /** @type {!shaka.hls.HlsParser} */
  var parser;
  /** @type {shakaExtern.ManifestParser.PlayerInterface} */
  var playerInterface;
  /** @type {shakaExtern.ManifestConfiguration} */
  var config;
  /** @const */
  var updateTime = 5;
  /** @const */
  var master = [
    '#EXTM3U\n',
    '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
    'RESOLUTION=960x540,FRAME-RATE=60\n',
    'test:/video\n'
  ].join('');
  /** @const {function(string):ArrayBuffer} */
  var toUTF8 = shaka.util.StringUtils.toUTF8;
  /** @type {ArrayBuffer} */
  var segmentData;
  /** @type {ArrayBuffer} */
  var tsSegmentData;
  /** @const {number} */
  var segmentDataStartTime;

  beforeEach(function() {
    // TODO: use StreamGenerator?
    segmentData = new Uint8Array([
      0x00, 0x00, 0x00, 0x24, // size (36)
      0x6D, 0x6F, 0x6F, 0x66, // type (moof)
      0x00, 0x00, 0x00, 0x1C, // traf size (28)
      0x74, 0x72, 0x61, 0x66, // type (traf)
      0x00, 0x00, 0x00, 0x14, // tfdt size (20)
      0x74, 0x66, 0x64, 0x74, // type (tfdt)
      0x01, 0x00, 0x00, 0x00, // version and flags
      0x00, 0x00, 0x00, 0x00, // baseMediaDecodeTime first 4 bytes
      0x00, 0x02, 0xBF, 0x20  // baseMediaDecodeTime last 4 bytes (180000)
    ]).buffer;
    tsSegmentData = new Uint8Array([
      0x47, // TS sync byte (fixed value)
      0x41, 0x01, // not corrupt, payload follows, packet ID 257
      0x10, // not scrambled, no adaptation field, payload only, seq #0
      0x00, 0x00, 0x01, // PES start code (fixed value)
      0xe0, // stream ID (video stream 0)
      0x00, 0x00, // PES packet length (doesn't matter)
      0x80, // marker bits (fixed value), not scrambled, not priority
      0x80, // PTS only, no DTS, other flags 0 (don't matter)
      0x05, // remaining PES header length == 5 (one timestamp)
      0x21, 0x00, 0x0b, 0x7e, 0x41 // PTS = 180000, encoded into 5 bytes
    ]).buffer;
    // 180000 divided by TS timescale (90000) = segment starts at 2s.
    segmentDataStartTime = 2;

    fakeNetEngine = new shaka.test.FakeNetworkingEngine();

    var retry = shaka.net.NetworkingEngine.defaultRetryParameters();
    config = {
      retryParameters: retry,
      dash: {
        customScheme: function(node) { return null; },
        clockSyncUri: '',
        ignoreDrmInfo: false,
        xlinkFailGracefully: false
      }
    };

    playerInterface = {
      filterNewPeriod: function() {},
      filterAllPeriods: function() {},
      networkingEngine: fakeNetEngine,
      onError: fail,
      onEvent: fail,
      onTimelineRegionAdded: fail
    };

    parser = new shaka.hls.HlsParser();
    parser.configure(config);
  });

  afterEach(function() {
    // HLS parser stop is synchronous.
    parser.stop();
  });

  /**
   * Simulate time to trigger a manifest update.
   */
  function delayForUpdatePeriod() {
    // Tick the virtual clock to trigger an update and resolve all Promises.
    Util.fakeEventLoop(updateTime);
  }

  function testUpdate(done, master, initialMedia, initialReferences,
                      updatedMedia, updatedReferences) {
    fakeNetEngine.setResponseMap({
      'test:/master': toUTF8(master),
      'test:/video': toUTF8(initialMedia),
      'test:/video2': toUTF8(initialMedia),
      'test:/audio': toUTF8(initialMedia),
      'test:/main.mp4': segmentData
    });
    parser.start('test:/master', playerInterface)
      .then(function(manifest) {
          var variants = manifest.periods[0].variants;
          for (var i = 0; i < variants.length; i++) {
            var video = variants[i].video;
            var audio = variants[i].audio;
            ManifestParser.verifySegmentIndex(video, initialReferences);
            if (audio)
              ManifestParser.verifySegmentIndex(audio, initialReferences);
          }

          fakeNetEngine.setResponseMapAsText({
            'test:/master': master,
            'test:/video': updatedMedia,
            'test:/video2': updatedMedia,
            'test:/audio': updatedMedia
          });

          delayForUpdatePeriod();
          for (var i = 0; i < variants.length; i++) {
            var video = variants[i].video;
            var audio = variants[i].audio;
            ManifestParser.verifySegmentIndex(video, updatedReferences);
            if (audio)
              ManifestParser.verifySegmentIndex(audio, updatedReferences);
          }
        }).catch(fail).then(done);
    shaka.polyfill.Promise.flush();
  }


  describe('playlist type EVENT', function() {
    var media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:EVENT\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="test:/main.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:2,\n',
      'test:/main.mp4\n'
    ].join('');

    var mediaWithAdditionalSegment = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:EVENT\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="test:/main.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:2,\n',
      'test:/main.mp4\n',
      '#EXTINF:2,\n',
      'test:/main2.mp4\n'
    ].join('');

    it('treats already ended presentation like VOD', function(done) {
      fakeNetEngine.setResponseMap({
        'test:/master': toUTF8(master),
        'test:/video': toUTF8(media + '#EXT-X-ENDLIST'),
        'test:/main.mp4': segmentData
      });

      parser.start('test:/master', playerInterface)
        .then(function(manifest) {
            expect(manifest.presentationTimeline.isLive()).toBe(false);
            expect(manifest.presentationTimeline.isInProgress()).toBe(false);
          })
        .catch(fail)
        .then(done);
    });

    describe('update', function() {
      beforeAll(function() {
        jasmine.clock().install();
        // This polyfill is required for fakeEventLoop.
        shaka.polyfill.Promise.install(/* force */ true);
      });

      afterAll(function() {
        jasmine.clock().uninstall();
        shaka.polyfill.Promise.uninstall();
      });

      it('adds new segments when they appear', function(done) {
        var ref1 = ManifestParser.makeReference('test:/main.mp4',
                                                0, 2, 4);
        var ref2 = ManifestParser.makeReference('test:/main2.mp4',
                                                1, 4, 6);

        testUpdate(done, master, media, [ref1],
                   mediaWithAdditionalSegment, [ref1, ref2]);
      });

      it('updates all variants', function(done) {
        var secondVariant = [
          '#EXT-X-STREAM-INF:BANDWIDTH=300,CODECS="avc1",',
          'RESOLUTION=1200x940,FRAME-RATE=60\n',
          'test:/video2'
        ].join('');

        var masterWithTwoVariants = master + secondVariant;
        var ref1 = ManifestParser.makeReference('test:/main.mp4',
                                                0, 2, 4);
        var ref2 = ManifestParser.makeReference('test:/main2.mp4',
                                                1, 4, 6);

        testUpdate(done, masterWithTwoVariants, media, [ref1],
                   mediaWithAdditionalSegment, [ref1, ref2]);
      });

      it('updates all streams', function(done) {
        var audio = [
          '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
          'URI="test:/audio"\n'
        ].join('');

        var masterWithAudio = master + audio;
        var ref1 = ManifestParser.makeReference('test:/main.mp4',
                                                0, 2, 4);
        var ref2 = ManifestParser.makeReference('test:/main2.mp4',
                                                1, 4, 6);

        testUpdate(done, masterWithAudio, media, [ref1],
                   mediaWithAdditionalSegment, [ref1, ref2]);
      });

      it('handles multiple updates', function(done) {
        var newSegment1 = [
          '#EXTINF:2,\n',
          'test:/main2.mp4\n'
        ].join('');

        var newSegment2 = [
          '#EXTINF:2,\n',
          'test:/main3.mp4\n'
        ].join('');

        var updatedMedia1 = media + newSegment1;
        var updatedMedia2 = updatedMedia1 + newSegment2;
        var ref1 = ManifestParser.makeReference('test:/main.mp4',
                                                0, 2, 4);
        var ref2 = ManifestParser.makeReference('test:/main2.mp4',
                                                1, 4, 6);
        var ref3 = ManifestParser.makeReference('test:/main3.mp4',
                                                2, 6, 8);

        fakeNetEngine.setResponseMap({
          'test:/master': toUTF8(master),
          'test:/video': toUTF8(media),
          'test:/main.mp4': segmentData
        });
        parser.start('test:/master', playerInterface)
          .then(function(manifest) {
              var video = manifest.periods[0].variants[0].video;
              ManifestParser.verifySegmentIndex(video, [ref1]);

              fakeNetEngine.setResponseMapAsText({
                'test:/master': master,
                'test:/video': updatedMedia1
              });

              delayForUpdatePeriod();
              ManifestParser.verifySegmentIndex(video, [ref1, ref2]);

              fakeNetEngine.setResponseMapAsText({
                'test:/master': master,
                'test:/video': updatedMedia2
              });

              delayForUpdatePeriod();
              ManifestParser.verifySegmentIndex(video, [ref1, ref2, ref3]);
            }).catch(fail).then(done);
        shaka.polyfill.Promise.flush();
      });

      it('converts presentation to VOD when it is finished', function(done) {
        fakeNetEngine.setResponseMap({
          'test:/master': toUTF8(master),
          'test:/video': toUTF8(media),
          'test:/main.mp4': segmentData
        });

        parser.start('test:/master', playerInterface).then(function(manifest) {
          expect(manifest.presentationTimeline.isLive()).toBe(true);
          fakeNetEngine.setResponseMapAsText({
            'test:/master': master,
            'test:/video': mediaWithAdditionalSegment + '#EXT-X-ENDLIST\n'
          });

          delayForUpdatePeriod();
          expect(manifest.presentationTimeline.isLive()).toBe(false);
        }).catch(fail).then(done);
        shaka.polyfill.Promise.flush();
      });

      it('starts presentation as VOD when ENDLIST is present', function(done) {
        fakeNetEngine.setResponseMap({
          'test:/master': toUTF8(master),
          'test:/video': toUTF8(media + '#EXT-X-ENDLIST'),
          'test:/main.mp4': segmentData
        });

        parser.start('test:/master', playerInterface).then(function(manifest) {
          expect(manifest.presentationTimeline.isLive()).toBe(false);
        }).catch(fail).then(done);
        shaka.polyfill.Promise.flush();
      });
    });
  });

  describe('playlist type LIVE', function() {
    var media = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MEDIA-SEQUENCE:0\n',
      '#EXTINF:2,\n',
      'test:/main.mp4\n'
    ].join('');

    var mediaWithByteRange = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MEDIA-SEQUENCE:0\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      '#EXTINF:2,\n',
      'test:/main.mp4\n'
    ].join('');

    var expectedStartByte = 616;
    var expectedEndByte = 121705;

    var mediaWithAdditionalSegment = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MEDIA-SEQUENCE:0\n',
      '#EXTINF:2,\n',
      'test:/main.mp4\n',
      '#EXTINF:2,\n',
      'test:/main2.mp4\n'
    ].join('');

    var mediaWithRemovedSegment = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MEDIA-SEQUENCE:1\n',
      '#EXTINF:2,\n',
      'test:/main2.mp4\n'
    ].join('');

    it('starts presentation as VOD when ENDLIST is present', function(done) {
      fakeNetEngine.setResponseMap({
        'test:/master': toUTF8(master),
        'test:/video': toUTF8(media + '#EXT-X-ENDLIST'),
        'test:/main.mp4': segmentData
      });

      parser.start('test:/master', playerInterface).then(function(manifest) {
        expect(manifest.presentationTimeline.isLive()).toBe(false);
      }).catch(fail).then(done);
    });

    describe('update', function() {
      beforeAll(function() {
        jasmine.clock().install();
        // This polyfill is required for fakeEventLoop.
        shaka.polyfill.Promise.install(/* force */ true);
      });

      afterAll(function() {
        jasmine.clock().uninstall();
        shaka.polyfill.Promise.uninstall();
      });

      it('adds new segments when they appear', function(done) {
        var ref1 = ManifestParser.makeReference('test:/main.mp4',
                                                0, 2, 4);
        var ref2 = ManifestParser.makeReference('test:/main2.mp4',
                                                1, 4, 6);

        testUpdate(done, master, media, [ref1],
                   mediaWithAdditionalSegment, [ref1, ref2]);
      });

      it('evicts removed segments', function(done) {
        var ref1 = ManifestParser.makeReference('test:/main.mp4',
                                                0, 2, 4);
        var ref2 = ManifestParser.makeReference('test:/main2.mp4',
                                                1, 4, 6);

        testUpdate(done, master, mediaWithAdditionalSegment, [ref1, ref2],
                   mediaWithRemovedSegment, [ref2]);
      });

      it('handles updates with redirects', function(done) {
        var ref1 = ManifestParser.makeReference('test:/main.mp4',
                                                0, 2, 4);
        var ref2 = ManifestParser.makeReference('test:/main2.mp4',
                                                1, 4, 6);

        fakeNetEngine.setResponseFilter(function(type, response) {
          // Simulate a redirect by changing the response URI
          if (response.uri.indexOf('test:/redirected/') == 0) return;
          response.uri = response.uri.replace('test:/', 'test:/redirected/');
        });

        testUpdate(done, master, media, [ref1],
                   mediaWithAdditionalSegment, [ref1, ref2]);
      });

      it('parses start time from mp4 segments', function(done) {
        fakeNetEngine.setResponseMap({
          'test:/master': toUTF8(master),
          'test:/video': toUTF8(media),
          'test:/main.mp4': segmentData
        });

        var ref = ManifestParser.makeReference(
            'test:/main.mp4', 0, segmentDataStartTime,
            segmentDataStartTime + 2);

        parser.start('test:/master', playerInterface).then(function(manifest) {
          var video = manifest.periods[0].variants[0].video;
          ManifestParser.verifySegmentIndex(video, [ref]);

          // In live content, we do not set presentationTimeOffset.
          expect(video.presentationTimeOffset).toEqual(0);
        }).catch(fail).then(done);
        shaka.polyfill.Promise.flush();
      });

      it('gets start time on update without segment request', function(done) {
        fakeNetEngine.setResponseMap({
          'test:/master': toUTF8(master),
          'test:/video': toUTF8(mediaWithAdditionalSegment),
          'test:/main.mp4': segmentData
        });

        var ref1 = ManifestParser.makeReference(
            'test:/main.mp4', 0, segmentDataStartTime,
            segmentDataStartTime + 2);

        var ref2 = ManifestParser.makeReference(
            'test:/main2.mp4', 1, segmentDataStartTime + 2,
            segmentDataStartTime + 4);

        parser.start('test:/master', playerInterface).then(function(manifest) {
          var video = manifest.periods[0].variants[0].video;
          ManifestParser.verifySegmentIndex(video, [ref1, ref2]);

          fakeNetEngine.setResponseMap({
            'test:/master': toUTF8(master),
            'test:/video': toUTF8(mediaWithRemovedSegment),
            'test:/main.mp4': segmentData,
            'test:/main2.mp4': segmentData
          });

          fakeNetEngine.request.calls.reset();
          delayForUpdatePeriod();

          ManifestParser.verifySegmentIndex(video, [ref2]);

          // Only one request was made, and it was for the playlist.
          // No segment requests were needed to get the start time.
          expect(fakeNetEngine.request.calls.count()).toBe(1);
          fakeNetEngine.expectCancelableRequest(
              'test:/video',
              shaka.net.NetworkingEngine.RequestType.MANIFEST);
        }).catch(fail).then(done);

        shaka.polyfill.Promise.flush();
      });

      it('parses start time from ts segments', function(done) {
        var tsMediaPlaylist = mediaWithRemovedSegment.replace(/\.mp4/g, '.ts');

        fakeNetEngine.setResponseMap({
          'test:/master': toUTF8(master),
          'test:/video': toUTF8(tsMediaPlaylist),
          'test:/main2.ts': tsSegmentData
        });

        var ref = ManifestParser.makeReference(
            'test:/main2.ts', 1, segmentDataStartTime,
            segmentDataStartTime + 2);

        parser.start('test:/master', playerInterface).then(function(manifest) {
          var video = manifest.periods[0].variants[0].video;
          ManifestParser.verifySegmentIndex(video, [ref]);
          // In live content, we do not set presentationTimeOffset.
          expect(video.presentationTimeOffset).toEqual(0);
        }).catch(fail).then(done);

        shaka.polyfill.Promise.flush();
      });

      it('gets start time of segments with byte range', function(done) {
        // Nit: this value is an implementation detail of the fix for #1106
        var partialEndByte = expectedStartByte + 1024 - 1;

        fakeNetEngine.setResponseMap({
          'test:/master': toUTF8(master),
          'test:/video': toUTF8(mediaWithByteRange),
          'test:/main.mp4': segmentData
        });

        var ref = ManifestParser.makeReference(
            'test:/main.mp4' /* uri */,
            0 /* position */,
            segmentDataStartTime /* start */,
            segmentDataStartTime + 2 /* end */,
            '' /* baseUri */,
            expectedStartByte,
            expectedEndByte);  // Complete segment reference

        parser.start('test:/master', playerInterface).then(function(manifest) {
          var video = manifest.periods[0].variants[0].video;
          ManifestParser.verifySegmentIndex(video, [ref]);

          // There should have been a range request for this segment to get the
          // start time.
          fakeNetEngine.expectRangeRequest(
              'test:/main.mp4',
              expectedStartByte,
              partialEndByte);  // Partial segment request
        }).catch(fail).then(done);

        shaka.polyfill.Promise.flush();
      });
    });
  });
});
