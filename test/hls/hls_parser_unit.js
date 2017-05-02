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


describe('HlsParser', function() {
  var fakeNetEngine;
  var parser;
  var playerInterface;

  beforeEach(function() {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    var retry = shaka.net.NetworkingEngine.defaultRetryParameters();
    parser = new shaka.hls.HlsParser();
    parser.configure({
      retryParameters: retry,
      dash: {
        customScheme: function(node) { return null; },
        clockSyncUri: '',
        ignoreDrmInfo: false
      },
      hls: {
        defaultTimeOffset: 0
      }
    });
    playerInterface = {
      networkingEngine: fakeNetEngine,
      filterPeriod: function() {},
      onError: fail
    };
  });

  /**
   * @param {string} master
   * @param {string} media
   * @param {shakaExtern.Manifest} manifest
   * @param {function()} done
   */
  function testHlsParser(master, media, manifest, done) {
    fakeNetEngine.setResponseMapAsText({
      'test://master': master,
      'test://audio': media,
      'test://video': media,
      'test://text': media
    });

    parser.start('test://master', playerInterface)
        .then(function(actual) { expect(actual).toEqual(manifest); })
        .catch(fail)
        .then(done);
  }

  it('parses video only variant', function(done) {
    var master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'test://video'
    ].join('');

    var media = [
      '#EXTM3U\n',
      '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'test://main.mp4'
    ].join('');

    var manifest = new shaka.test.ManifestGenerator()
            .anyTimeline()
            .addPeriod(jasmine.any(Number))
              .addVariant(jasmine.any(Number))
                .language('und')
                .bandwidth(200)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('video/mp4', 'avc1')
                  .frameRate(60)
                  .size(960, 540)
          .build();

    testHlsParser(master, media, manifest, done);
  });

  it('parses audio and video variant', function(done) {
    var master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1, mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'test://video\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="test://audio"\n'
    ].join('');

    var media = [
      '#EXTM3U\n',
      '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'test://main.mp4'
    ].join('');

    var manifest = new shaka.test.ManifestGenerator()
            .anyTimeline()
            .addPeriod(jasmine.any(Number))
              .addVariant(jasmine.any(Number))
                .language('en')
                .bandwidth(200)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('video/mp4', 'avc1')
                  .frameRate(60)
                  .size(960, 540)
                .addAudio(jasmine.any(Number))
                  .language('en')
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('audio/mp4', 'mp4a')
          .build();

    testHlsParser(master, media, manifest, done);
  });

  it('parses multiple variants', function(done) {
    var master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1, mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'test://video\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=300,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=120,AUDIO="aud2"\n',
      'test://video\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="test://audio"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud2",LANGUAGE="fr",',
      'URI="test://audio"\n'
    ].join('');

    var media = [
      '#EXTM3U\n',
      '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'test://main.mp4'
    ].join('');

    var manifest = new shaka.test.ManifestGenerator()
            .anyTimeline()
            .addPeriod(jasmine.any(Number))
              .addVariant(jasmine.any(Number))
                .language('en')
                .bandwidth(200)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('video/mp4', 'avc1')
                  .frameRate(60)
                  .size(960, 540)
                .addAudio(jasmine.any(Number))
                  .language('en')
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('audio/mp4', 'mp4a')
              .addVariant(jasmine.any(Number))
                .language('fr')
                .bandwidth(300)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('video/mp4', 'avc1')
                  .frameRate(120)
                  .size(960, 540)
                .addAudio(jasmine.any(Number))
                  .language('fr')
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('audio/mp4', 'mp4a')
          .build();

    testHlsParser(master, media, manifest, done);
  });

  it('parses multiple streams with the same group id', function(done) {
    var master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'test://video\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="en",',
      'URI="test://audio"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="fr",',
      'URI="test://audio"\n'
    ].join('');

    var media = [
      '#EXTM3U\n',
      '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'test://main.mp4'
    ].join('');

    var manifest = new shaka.test.ManifestGenerator()
            .anyTimeline()
            .addPeriod(jasmine.any(Number))
              .addVariant(jasmine.any(Number))
                .language('en')
                .bandwidth(200)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('video/mp4', 'avc1')
                  .frameRate(60)
                  .size(960, 540)
                .addAudio(jasmine.any(Number))
                  .language('en')
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('audio/mp4', 'mp4a')
              .addVariant(jasmine.any(Number))
                .language('fr')
                .bandwidth(200)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('video/mp4', 'avc1')
                  .frameRate(60)
                  .size(960, 540)
                .addAudio(jasmine.any(Number))
                  .language('fr')
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('audio/mp4', 'mp4a')
          .build();

    testHlsParser(master, media, manifest, done);
  });

  it('parses manifest with text streams', function(done) {
    var master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'test://video\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="test://audio"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="test://text"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub2",LANGUAGE="es",',
      'URI="test://text"\n'
    ].join('');

    var media = [
      '#EXTM3U\n',
      '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'test://main.mp4'
    ].join('');

    var TextStreamKind = shaka.util.ManifestParserUtils.TextStreamKind;
    var manifest = new shaka.test.ManifestGenerator()
            .anyTimeline()
            .addPeriod(jasmine.any(Number))
              .addVariant(jasmine.any(Number))
                .language('en')
                .bandwidth(200)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('video/mp4', 'avc1')
                  .frameRate(60)
                  .size(960, 540)
                .addAudio(jasmine.any(Number))
                  .language('en')
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('audio/mp4', 'mp4a')
              .addTextStream(jasmine.any(Number))
                .language('en')
                .anySegmentFunctions()
                .nullInitSegment()
                .presentationTimeOffset(0)
                .mime('text/vtt', '')
                .kind(TextStreamKind.SUBTITLE)
              .addTextStream(jasmine.any(Number))
                .language('es')
                .anySegmentFunctions()
                .nullInitSegment()
                .presentationTimeOffset(0)
                .mime('text/vtt', '')
                .kind('subtitle')
          .build();

    testHlsParser(master, media, manifest, done);
  });

  it('respects config.hls.defaultTimeOffset setting', function(done) {
    var master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'test://video'
    ].join('');

    var media = [
      '#EXTM3U\n',
      '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'test://main.mp4'
    ].join('');

    var manifest = new shaka.test.ManifestGenerator()
            .anyTimeline()
            .addPeriod(jasmine.any(Number))
              .addVariant(jasmine.any(Number))
                .language('und')
                .bandwidth(200)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(10)
                  .mime('video/mp4', 'avc1')
                  .frameRate(60)
                  .size(960, 540)
          .build();

    parser.configure({
      hls: {defaultTimeOffset: 10}
    });

    testHlsParser(master, media, manifest, done);
  });

  it('parses video described by a media tag', function(done) {
    var master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
      'test://audio\n',
      '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="test://video"'
    ].join('');

    var media = [
      '#EXTM3U\n',
      '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'test://main.mp4'
    ].join('');

    var manifest = new shaka.test.ManifestGenerator()
            .anyTimeline()
            .addPeriod(jasmine.any(Number))
              .addVariant(jasmine.any(Number))
                .bandwidth(200)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('video/mp4', 'avc1')
                  .frameRate(60)
                  .size(960, 540)
                .addAudio(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('audio/mp4', 'mp4a')
          .build();

    testHlsParser(master, media, manifest, done);
  });

  it('constructs relative URIs', function(done) {
    var master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
      'audio/audio.m3u8\n',
      '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="video/video.m3u8"'
    ].join('');

    var media = [
      '#EXTM3U\n',
      '#EXT-X-MAP:URI="init.mp4"\n',
      '#EXTINF:5,\n',
      'segment.mp4'
    ].join('');

    var manifest = new shaka.test.ManifestGenerator()
            .anyTimeline()
            .addPeriod(jasmine.any(Number))
              .addVariant(jasmine.any(Number))
                .bandwidth(200)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('video/mp4', 'avc1')
                  .frameRate(60)
                  .size(960, 540)
                .addAudio(jasmine.any(Number))
                  .anySegmentFunctions()
                  .anyInitSegment()
                  .presentationTimeOffset(0)
                  .mime('audio/mp4', 'mp4a')
          .build();

    fakeNetEngine.setResponseMapAsText({
      'test://host/master.m3u8': master,
      'test://host/audio/audio.m3u8': media,
      'test://host/video/video.m3u8': media
    });

    parser.start('test://host/master.m3u8', playerInterface)
        .then(function(actual) {
          expect(actual).toEqual(manifest);
          var video = actual.periods[0].variants[0].video;
          var audio = actual.periods[0].variants[0].audio;

          var videoPosition = video.findSegmentPosition(0);
          var audioPosition = audio.findSegmentPosition(0);
          expect(videoPosition).not.toBe(null);
          expect(audioPosition).not.toBe(null);

          var videoReference = video.getSegmentReference(videoPosition);
          var audioReference = audio.getSegmentReference(audioPosition);
          expect(videoReference).not.toBe(null);
          expect(audioReference).not.toBe(null);
          if (videoReference) {
            expect(videoReference.getUris()[0])
                .toEqual('test://host/video/segment.mp4');
          }
          if (audioReference) {
            expect(audioReference.getUris()[0])
                .toEqual('test://host/audio/segment.mp4');
          }
        }).catch(fail).then(done);
  });

  it('allows streams with no init segment', function(done) {
    var master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
      'test://audio\n',
      '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="test://video"'
    ].join('');

    var media = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:6\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'test://main.mp4'
    ].join('');

    var manifest = new shaka.test.ManifestGenerator()
            .anyTimeline()
            .addPeriod(jasmine.any(Number))
              .addVariant(jasmine.any(Number))
                .bandwidth(200)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .nullInitSegment()
                  .presentationTimeOffset(0)
                  .mime('video/mp4', 'avc1')
                  .frameRate(60)
                  .size(960, 540)
                .addAudio(jasmine.any(Number))
                  .anySegmentFunctions()
                  .nullInitSegment()
                  .presentationTimeOffset(0)
                  .mime('audio/mp4', 'mp4a')
          .build();

    testHlsParser(master, media, manifest, done);
  });

  it('constructs DrmInfo for Widevine', function(done) {
    var master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'test://video\n'
    ].join('');

    var initDataBase64 =
        'dGhpcyBpbml0IGRhdGEgY29udGFpbnMgaGlkZGVuIHNlY3JldHMhISE=';

    var media = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:6\n',
      '#EXT-X-KEY:METHOD=SAMPLE-AES-CENC,',
      'KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed",',
      'URI="data:text/plain;base64,',
      initDataBase64, '",\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'test://main.mp4'
    ].join('');

    var manifest = new shaka.test.ManifestGenerator()
            .anyTimeline()
            .addPeriod(jasmine.any(Number))
              .addVariant(jasmine.any(Number))
                .bandwidth(200)
                .addVideo(jasmine.any(Number))
                  .anySegmentFunctions()
                  .nullInitSegment()
                  .presentationTimeOffset(0)
                  .mime('video/mp4', 'avc1')
                  .frameRate(60)
                  .size(960, 540)
                .encrypted(true)
                .addDrmInfo('com.widevine.alpha')
                  .addCencInitData(initDataBase64)
          .build();

    testHlsParser(master, media, manifest, done);
  });

  describe('Errors out', function() {
    var Code = shaka.util.Error.Code;

    /**
     * @param {string} master
     * @param {string} media
     * @param {!shaka.util.Error} error
     * @param {function()} done
     */
    function verifyError(master, media, error, done) {
      fakeNetEngine.setResponseMapAsText({'test://master': master,
        'test://audio': media,
        'test://video': media
      });

      parser.start('test://master', playerInterface)
            .then(fail)
            .catch(function(e) {
                shaka.test.Util.expectToEqualError(e, error);
              })
            .then(done);
    }

    it('if multiple init sections were provided', function(done) {
      var master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
        'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
        'test://audio\n',
        '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="test://video"'
      ].join('');

      var media = [
        '#EXTM3U\n',
        '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
        '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
        '#EXTINF:5,\n',
        '#EXT-X-BYTERANGE:121090@616\n',
        'test://main.mp4'
      ].join('');

      var error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          Code.HLS_MULTIPLE_MEDIA_INIT_SECTIONS_FOUND);

      verifyError(master, media, error, done);
    });

    it('if unable to guess mime type', function(done) {
      var master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
        'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
        'test://audio\n',
        '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="test://video"'
      ].join('');

      var media = [
        '#EXTM3U\n',
        '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
        '#EXTINF:5,\n',
        '#EXT-X-BYTERANGE:121090@616\n',
        'test://main.exe'
      ].join('');

      var error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          Code.HLS_COULD_NOT_GUESS_MIME_TYPE,
          'exe');

      verifyError(master, media, error, done);
    });

    it('if unable to guess codecs', function(done) {
      var master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="aaa,bbb",',
        'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
        'test://audio\n',
        '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",',
        'URI="test://video"'
      ].join('');

      var media = [
        '#EXTM3U\n',
        '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
        '#EXTINF:5,\n',
        '#EXT-X-BYTERANGE:121090@616\n',
        'test://main.mp4'
      ].join('');

      var error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          Code.HLS_COULD_NOT_GUESS_CODECS,
          ['aaa', 'bbb']);

      verifyError(master, media, error, done);
    });

    describe('if required attributes are missing', function() {
      /**
       * @param {string} master
       * @param {string} media
       * @param {string} attributeName
       * @param {function()} done
       */
      function verifyMissingAttribute(master, media, attributeName, done) {
        var error = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            Code.HLS_REQUIRED_ATTRIBUTE_MISSING,
            attributeName);

        verifyError(master, media, error, done);
      }

      it('bandwidth', function(done) {
        var master = [
          '#EXTM3U\n',
          '#EXT-X-STREAM-INF:CODECS="avc1,mp4a",',
          'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
          'test://audio\n',
          '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="test://video"'
        ].join('');

        var media = [
          '#EXTM3U\n',
          '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
          '#EXTINF:5,\n',
          '#EXT-X-BYTERANGE:121090@616\n',
          'test://main.exe'
        ].join('');

        verifyMissingAttribute(master, media, 'BANDWIDTH', done);
      });

      it('codecs', function(done) {
        var master = [
          '#EXTM3U\n',
          '#EXT-X-STREAM-INF:BANDWIDTH=200,',
          'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
          'test://audio\n',
          '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="test://video"'
        ].join('');

        var media = [
          '#EXTM3U\n',
          '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
          '#EXTINF:5,\n',
          '#EXT-X-BYTERANGE:121090@616\n',
          'test://main.exe'
        ].join('');

        verifyMissingAttribute(master, media, 'CODECS', done);
      });

      it('uri', function(done) {
        var master = [
          '#EXTM3U\n',
          '#EXT-X-STREAM-INF:CODECS="avc1,mp4a",BANDWIDTH=200,',
          'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
          'test://audio\n',
          '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid"'
        ].join('');

        var media = [
          '#EXTM3U\n',
          '#EXT-X-MAP:URI="test://main.mp4"\n',
          '#EXTINF:5,\n',
          '#EXT-X-BYTERANGE:121090@616\n',
          'test://main.exe'
        ].join('');

        verifyMissingAttribute(master, media, 'URI', done);
      });
    });

    describe('if required tags are missing', function() {
      /**
       * @param {string} master
       * @param {string} media
       * @param {string} tagName
       * @param {function()} done
       */
      function verifyMissingTag(master, media, tagName, done) {
        var error = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            Code.HLS_REQUIRED_TAG_MISSING,
            tagName);

        verifyError(master, media, error, done);
      }

      it('EXTINF', function(done) {
        var master = [
          '#EXTM3U\n',
          '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
          'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
          'test://audio\n',
          '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="test://video"'
        ].join('');

        var media = [
          '#EXTM3U\n',
          '#EXT-X-MAP:URI="test://main.mp4",BYTERANGE="616@0"\n',
          '#EXT-X-BYTERANGE:121090@616\n',
          'test://main.exe'
        ].join('');

        verifyMissingTag(master, media, 'EXTINF', done);
      });
    });
  });
});

