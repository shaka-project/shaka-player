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
  const filterStreamsByLanguageAndRole =
      shaka.util.StreamUtils.filterStreamsByLanguageAndRole;
  const filterVariantsByAudioChannelCount =
      shaka.util.StreamUtils.filterVariantsByAudioChannelCount;

  let manifest;

  describe('filterStreamsByLanguageAndRole', function() {
    it('chooses text streams in user\'s preferred language', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(1)
            .language('en')
          .addTextStream(2)
            .language('es')
          .addTextStream(3)
            .language('en')
        .build();

      let chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          '');
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
      expect(chosen[1]).toBe(manifest.periods[0].textStreams[2]);
    });

    it('chooses primary text streams', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(1)
          .addTextStream(2)
            .primary()
          .addTextStream(3)
            .primary()
        .build();

      let chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          '');
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[1]);
      expect(chosen[1]).toBe(manifest.periods[0].textStreams[2]);
    });

    it('chooses text streams in preferred language and role', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(1)
            .language('en')
            .roles(['main', 'commentary'])
          .addTextStream(2)
            .language('es')
          .addTextStream(3)
            .language('en')
            .roles(['caption'])
        .build();

      let chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          'main');
      expect(chosen.length).toBe(1);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
    });

    it('prefers no-role streams if there is no preferred role', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(0)
            .language('en')
            .roles(['commentary'])
          .addTextStream(1)
            .language('en')
          .addTextStream(2)
            .language('en')
            .roles(['secondary'])
        .build();

      let chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          '');
      expect(chosen.length).toBe(1);
      expect(chosen[0].roles.length).toBe(0); // Pick a stream with no role.
    });

    it('ignores no-role streams if there is a preferred role', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(0)
            .language('en')
            .roles(['commentary'])
          .addTextStream(1)
            .language('en')
          .addTextStream(2)
            .language('en')
            .roles(['secondary'])
        .build();

      let chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          'main'); // A role that is not present.
      expect(chosen.length).toBe(1);
      expect(chosen[0].roles.length).toBe(1); // Pick a stream with a role.
    });

    it('chooses only one role, even if none is preferred', function() {
      // Regression test for https://github.com/google/shaka-player/issues/949
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(0)
            .language('en')
            .roles(['commentary'])
          .addTextStream(1)
            .language('en')
            .roles(['commentary'])
          .addTextStream(2)
            .language('en')
            .roles(['secondary'])
          .addTextStream(3)
            .language('en')
            .roles(['secondary'])
          .addTextStream(4)
            .language('en')
            .roles(['main'])
          .addTextStream(5)
            .language('en')
            .roles(['main'])
        .build();

      let chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          '');
      // Which role is chosen is an implementation detail.
      // Each role is found on two text streams, so we should have two.
      expect(chosen.length).toBe(2);
      expect(chosen[0].roles[0]).toEqual(chosen[1].roles[0]);
    });

    it('chooses only one role, even if all are primary', function() {
      // Regression test for https://github.com/google/shaka-player/issues/949
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(0)
            .language('en').primary()
            .roles(['commentary'])
          .addTextStream(1)
            .language('en').primary()
            .roles(['commentary'])
          .addTextStream(2)
            .language('en').primary()
            .roles(['secondary'])
          .addTextStream(3)
            .language('en').primary()
            .roles(['secondary'])
          .addTextStream(4)
            .language('en').primary()
            .roles(['main'])
          .addTextStream(5)
            .language('en').primary()
            .roles(['main'])
        .build();

      let chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'zh',
          '');
      // Which role is chosen is an implementation detail.
      // Each role is found on two text streams, so we should have two.
      expect(chosen.length).toBe(2);
      expect(chosen[0].roles[0]).toEqual(chosen[1].roles[0]);
    });

    it('chooses only one language, even if all are primary', function() {
      // Regression test for https://github.com/google/shaka-player/issues/918
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(0)
            .language('en').primary()
          .addTextStream(1)
            .language('en').primary()
          .addTextStream(2)
            .language('es').primary()
          .addTextStream(3)
            .language('es').primary()
        .build();

      let chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'zh',
          '');
      // Which language is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      expect(chosen.length).toBe(2);
      expect(chosen[0].language).toEqual(chosen[1].language);
    });

    it('chooses a role from among primary streams without language match',
        function() {
          manifest = new shaka.test.ManifestGenerator()
            .addPeriod(0)
              .addTextStream(0)
                .language('en').primary()
                .roles(['commentary'])
              .addTextStream(1)
                .language('en').primary()
                .roles(['commentary'])
              .addTextStream(2)
                .language('en')
                .roles(['secondary'])
              .addTextStream(3)
                .language('en')
                .roles(['secondary'])
              .addTextStream(4)
                .language('en').primary()
                .roles(['main'])
              .addTextStream(5)
                .language('en').primary()
                .roles(['main'])
            .build();

          let chosen = filterStreamsByLanguageAndRole(
              manifest.periods[0].textStreams,
              'zh',
              '');
          // Which role is chosen is an implementation detail.
          // Each role is found on two text streams, so we should have two.
          expect(chosen.length).toBe(2);
          expect(chosen[0].roles[0]).toEqual(chosen[1].roles[0]);

          // Since nothing matches our language preference, we chose primary
          // text streams.
          expect(chosen[0].primary).toBe(true);
          expect(chosen[1].primary).toBe(true);
        });

    it('chooses a role from best language match, in spite of primary',
        function() {
          manifest = new shaka.test.ManifestGenerator()
            .addPeriod(0)
              .addTextStream(0)
                .language('en').primary()
                .roles(['commentary'])
              .addTextStream(1)
                .language('en').primary()
                .roles(['commentary'])
              .addTextStream(2)
                .language('zh')
                .roles(['secondary'])
              .addTextStream(3)
                .language('zh')
                .roles(['secondary'])
              .addTextStream(4)
                .language('en').primary()
                .roles(['main'])
              .addTextStream(5)
                .language('en').primary()
                .roles(['main'])
            .build();

          let chosen = filterStreamsByLanguageAndRole(
              manifest.periods[0].textStreams,
              'zh',
              '');
          expect(chosen.length).toBe(2);
          expect(chosen[0].language).toBe('zh');
          expect(chosen[1].language).toBe('zh');
          expect(chosen[0].primary).toBe(false);
          expect(chosen[1].primary).toBe(false);
        });
  });

  describe('filterVariantsByAudioChannelCount', function() {
    it('chooses variants with preferred audio channels count', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .addAudio(0).channelsCount(2)
          .addVariant(1)
            .addAudio(1).channelsCount(6)
          .addVariant(2)
            .addAudio(2).channelsCount(2)
        .build();

      let chosen = filterVariantsByAudioChannelCount(
          manifest.periods[0].variants, 2);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });

    it('chooses variants with largest audio channel count less than config' +
        ' when no exact audio channel count match is possible', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .addAudio(0).channelsCount(2)
          .addVariant(1)
            .addAudio(1).channelsCount(8)
          .addVariant(2)
            .addAudio(2).channelsCount(2)
        .build();

      let chosen = filterVariantsByAudioChannelCount(
          manifest.periods[0].variants, 6);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });

    it('chooses variants with fewest audio channels when none fit in the ' +
        'config', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .addAudio(0).channelsCount(6)
          .addVariant(1)
            .addAudio(1).channelsCount(8)
          .addVariant(2)
            .addAudio(2).channelsCount(6)
        .build();

      let chosen = filterVariantsByAudioChannelCount(
          manifest.periods[0].variants, 2);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });
  });

  describe('filterNewPeriod', function() {
    let fakeDrmEngine;

    beforeAll(function() {
      fakeDrmEngine = new shaka.test.FakeDrmEngine();
    });

    it('filters text streams with the full MIME type', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(1).mime('text/vtt')
          .addTextStream(2).mime('application/mp4', 'wvtt')
          .addTextStream(3).mime('text/bogus')
          .addTextStream(4).mime('application/mp4', 'bogus')
        .build();

      let noAudio = null;
      let noVideo = null;
      shaka.util.StreamUtils.filterNewPeriod(
          fakeDrmEngine, noAudio, noVideo, manifest.periods[0]);

      // Covers a regression in which we would remove streams with codecs.
      // The last two streams should be removed because their full MIME types
      // are bogus.
      expect(manifest.periods[0].textStreams.length).toBe(2);
      let textStreams = manifest.periods[0].textStreams;
      expect(textStreams[0].id).toBe(1);
      expect(textStreams[1].id).toBe(2);
    });
  });
});
