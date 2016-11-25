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

describe('StreamUtils', function() {

  describe('chooses correct stream set', function() {
    var config;
    var manifest;

    beforeAll(function() {

      config = /** @type {shakaExtern.PlayerConfiguration} */({
        preferredAudioLanguage: 'en',
        preferredTextLanguage: 'en'
      });
    });

    it('chooses audio stream with the lowest average bandwidth', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addStreamSet('audio')
            .language('en')
            .addStream(1).bandwidth(200)
            .addStream(2).bandwidth(400)
          .addStreamSet('audio')
            .language('en')
            .addStream(3).bandwidth(100)
            .addStream(4).bandwidth(300)
        .build();

      var chosen = shaka.util.StreamUtils.chooseStreamSets(
          manifest.periods[0], config);
      expect(chosen['audio']).toBe(manifest.periods[0].streamSets[1]);
    });

    it("chooses audio stream in user's preferred language", function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addStreamSet('audio')
            .language('en')
            .addStream(1).bandwidth(200)
            .addStream(2).bandwidth(400)
          .addStreamSet('audio')
            .language('es')
            .addStream(3).bandwidth(100)
            .addStream(4).bandwidth(300)
        .build();

      var chosen = shaka.util.StreamUtils.chooseStreamSets(
          manifest.periods[0], config);
      expect(chosen['audio']).toBe(manifest.periods[0].streamSets[0]);
    });

    it('chooses video stream with the highest top resolution', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
         .addStreamSet('video')
            .addStream(5).bandwidth(100).size(100, 200)
            .addStream(6).bandwidth(200).size(200, 400)
          .addStreamSet('video')
            .addStream(7).bandwidth(100).size(100, 200)
            .addStream(8).bandwidth(200).size(400, 600)
        .build();

      var chosen = shaka.util.StreamUtils.chooseStreamSets(
          manifest.periods[0], config);
      expect(chosen['video']).toBe(manifest.periods[0].streamSets[1]);
    });

    it('breaks ties on video streams by choosing one with the lowest' +
       ' average bandwidth', function() {
          manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
           .addStreamSet('video')
              .addStream(5).bandwidth(200).size(100, 200)
              .addStream(6).bandwidth(200).size(200, 400)
            .addStreamSet('video')
              .addStream(7).bandwidth(100).size(100, 200)
              .addStream(8).bandwidth(200).size(200, 400)
          .build();

          var chosen = shaka.util.StreamUtils.chooseStreamSets(
              manifest.periods[0], config);
          expect(chosen['video']).toBe(manifest.periods[0].streamSets[1]);
        });

    it('chooses the first available text stream', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addStreamSet('text')
            .language('en')
            .addStream(1).bandwidth(200).kind('caption')
          .addStreamSet('text')
            .language('en')
            .addStream(2).bandwidth(200).kind('caption')
        .build();

      var chosen = shaka.util.StreamUtils.chooseStreamSets(
          manifest.periods[0], config);
      expect(chosen['text']).toBe(manifest.periods[0].streamSets[0]);
    });

    it("chooses a text stream in user's preferred language", function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addStreamSet('text')
            .language('es')
            .addStream(1).bandwidth(100).kind('caption')
          .addStreamSet('text')
            .language('en')
            .addStream(2).bandwidth(200).kind('caption')
        .build();

      var chosen = shaka.util.StreamUtils.chooseStreamSets(
          manifest.periods[0], config);
      expect(chosen['text']).toBe(manifest.periods[0].streamSets[1]);
    });

    it('chooses primary media streams', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
         .addStreamSet('video')
            .primary()
            .addStream(5).bandwidth(100).size(100, 200)
            .addStream(6).bandwidth(200).size(200, 400)
          .addStreamSet('video')
            .addStream(7).bandwidth(100).size(100, 200)
            .addStream(8).bandwidth(200).size(400, 600)
          .addStreamSet('audio')
            .language('es')
            .primary()
            .addStream(1).bandwidth(200)
            .addStream(2).bandwidth(400)
          .addStreamSet('audio')
            .language('de')
            .addStream(3).bandwidth(200)
            .addStream(4).bandwidth(400)
        .build();

      var chosen = shaka.util.StreamUtils.chooseStreamSets(
          manifest.periods[0], config);
      expect(chosen['video']).toBe(manifest.periods[0].streamSets[0]);
      expect(chosen['audio']).toBe(manifest.periods[0].streamSets[2]);
    });

    it('breaks tie on primary media streams by choosing one' +
        ' with lower average bandwidth', function() {
         manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addStreamSet('audio')
              .language('es')
              .primary()
              .addStream(1).bandwidth(200)
              .addStream(2).bandwidth(400)
            .addStreamSet('audio')
              .language('es')
              .primary()
              .addStream(3).bandwidth(200)
              .addStream(4).bandwidth(100)
            .addStreamSet('audio')
              .language('de')
              .addStream(3).bandwidth(200)
              .addStream(4).bandwidth(100)
          .build();

         var chosen = shaka.util.StreamUtils.chooseStreamSets(
             manifest.periods[0], config);
         expect(chosen['audio']).toBe(manifest.periods[0].streamSets[1]);
       });
  });
});
