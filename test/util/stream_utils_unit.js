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
  var manifest;
  var preferredAudioLanguage = 'en';
  var preferredTextLanguage = 'en';
  var preferredAudioRole = 'main';
  var preferredTextRole = 'main';

  describe('filterVariantsByRoleAndLanguage', function() {
    it("chooses variants in user's preferred language", function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .language('es')
          .addVariant(1)
            .language('en')
          .addVariant(2)
            .language('en')
        .build();

      var chosen = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
          manifest.periods[0], preferredAudioLanguage);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[1]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });

    it("chooses variants in user's preferred role", function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .language('es')
            .addAudio(0).roles(['main'])
          .addVariant(1)
            .language('es')
            .addAudio(1).roles(['commentary'])
          .addVariant(2)
            .language('es')
            .addAudio(2).roles(['main'])
        .build();

      var chosen = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
          manifest.periods[0], undefined, undefined, preferredAudioRole);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });

    it('chooses variants in preferred language and role', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .language('en')
            .addAudio(0).roles(['main', 'commentary'])
          .addVariant(1)
            .language('en')
            .addAudio(1).roles(['secondary'])
          .addVariant(2)
            .language('es')
            .addAudio(2).roles(['main'])
        .build();

      var chosen = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
          manifest.periods[0],
          preferredAudioLanguage, undefined, preferredAudioRole);
      expect(chosen.length).toBe(1);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
    });

    it("chooses variants in user's preferred language if " +
       'preferred role does not match', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .language('en')
            .addAudio(0).roles(['secondary'])
          .addVariant(1)
            .language('en')
            .addAudio(1).roles(['secondary'])
          .addVariant(2)
            .language('es')
            .addAudio(2).roles(['supplementary'])
        .build();

      var chosen = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
          manifest.periods[0],
          preferredAudioLanguage, undefined, preferredAudioRole);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[1]);
    });

    it("chooses variants in user's preferred role if " +
       'preferred language does not match', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .language('es')
            .addAudio(0).roles(['main'])
          .addVariant(1)
            .language('es')
            .addAudio(1).roles(['commentary'])
          .addVariant(2)
            .language('es')
            .addAudio(2).roles(['main'])
        .build();

      var chosen = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
          manifest.periods[0], preferredAudioLanguage, undefined, preferredAudioRole);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });

    it('chooses variants in preferred language within single role', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0) // this variant will be chosen and used as baseline
            .language('en')
            .addVideo(0).roles(['main'])
            .addAudio(2).roles(['secondary'])
          .addVariant(1)
            .language('en')
            .addVideo(0).roles(['main'])
            .addAudio(3).roles(['commentary'])
          .addVariant(2)
            .language('en')
            .addVideo(0).roles(['main'])
            .addAudio(4).roles(['secondary'])
          .addVariant(3)
            .language('es')
            .addVideo(0).roles(['main'])
            .addAudio(5).roles(['commentary'])
          .addVariant(4) // Will not be chosen because roles list is different
            .language('en')
            .addVideo(0).roles(['main'])
            .addAudio(6).roles(['secondary', 'alternate'])
          .addVariant(5) // Will not be chosen because video role differs
            .language('en')
            .addVideo(1).roles(['alternate'])
            .addAudio(7).roles(['secondary'])
          .addVariant(6) // Will not be chosen because no video
            .language('en')
            .addAudio(8).roles(['secondary'])
        .build();

      var chosen = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
          manifest.periods[0],
          preferredAudioLanguage);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });

    it('chooses variants with language and role of first variant when ' +
       'neither preferred language nor preferred role match', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0) // this variant will be chosen and used as baseline
            .language('es')
            .addVideo(0).roles(['main'])
            .addAudio(2).roles(['secondary'])
          .addVariant(1)
            .language('es')
            .addVideo(0).roles(['main'])
            .addAudio(3).roles(['commentary'])
          .addVariant(2)
            .language('es')
            .addVideo(0).roles(['main'])
            .addAudio(4).roles(['secondary'])
          .addVariant(3) // Will not be chosen because language is different
            .language('fr')
            .addVideo(0).roles(['main'])
            .addAudio(5).roles(['secondary'])
          .addVariant(4) // Will not be chosen because roles list is different
            .language('es')
            .addVideo(0).roles(['main'])
            .addAudio(6).roles(['secondary', 'alternate'])
          .addVariant(5) // Will not be chosen because video role differs
            .language('es')
            .addVideo(1).roles(['alternate'])
            .addAudio(7).roles(['secondary'])
          .addVariant(6) // Will not be chosen because no video
            .language('es')
            .addAudio(8).roles(['secondary'])
        .build();

      var chosen = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
          manifest.periods[0],
          preferredAudioLanguage);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });

    it('chooses primary variants', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .primary()
            .language('en')
            .addAudio(0).roles(['main'])
          .addVariant(1) // Won't be chosen because doesn't match user prefs
            .primary()
            .language('es')
            .addAudio(1).roles(['main'])
          .addVariant(2)
            .primary()
            .language('en')
            .addAudio(2).roles(['main'])
          .addVariant(4) // Won't be chosen because not primary
            .language('en')
            .addAudio(2).roles(['main'])
        .build();

      var chosen = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
          manifest.periods[0],
          preferredAudioLanguage, undefined, preferredAudioRole);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });

    it('filters out restricted variants', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
          .addVariant(1)
          .addVariant(2)
        .build();

      manifest.periods[0].variants[0].allowedByKeySystem = false;
      manifest.periods[0].variants[1].allowedByApplication = false;

      var chosen = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
          manifest.periods[0], preferredAudioLanguage);
      expect(chosen.length).toBe(1);
      expect(chosen[0]).toBe(manifest.periods[0].variants[2]);
    });
  });

  describe('filterTextStreamsByRoleAndLanguage', function() {
    it("chooses text streams in user's preferred language", function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(1)
            .language('en')
          .addTextStream(2)
            .language('es')
          .addTextStream(3)
            .language('en')
        .build();

      var chosen = shaka.util.StreamUtils.filterTextStreamsByRoleAndLanguage(
          manifest.periods[0], preferredTextLanguage);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
      expect(chosen[1]).toBe(manifest.periods[0].textStreams[2]);
    });

    it("chooses text streams in user's preferred role", function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(1)
            .language('es')
            .roles(['main'])
          .addTextStream(2)
            .language('es')
            .roles(['commentary'])
          .addTextStream(3)
            .language('es')
            .roles(['main'])
        .build();
      var chosen = shaka.util.StreamUtils.filterTextStreamsByRoleAndLanguage(
          manifest.periods[0], preferredTextLanguage, undefined, preferredTextRole);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
      expect(chosen[1]).toBe(manifest.periods[0].textStreams[2]);
    });

    it("chooses text streams in user's preferred language if " +
       'preferred role does not match', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(0)
            .language('en')
            .roles(['secondary'])
          .addTextStream(1)
            .language('en')
            .roles(['secondary'])
          .addTextStream(2)
            .language('es')
            .roles(['supplementary'])
        .build();

      var chosen = shaka.util.StreamUtils.filterTextStreamsByRoleAndLanguage(
          manifest.periods[0], preferredTextLanguage, undefined, preferredTextRole);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
      expect(chosen[1]).toBe(manifest.periods[0].textStreams[1]);
    });

    it("chooses variants in user's preferred role if " +
       'preferred language does not match', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(0)
            .language('es')
            .roles(['main'])
          .addTextStream(1)
            .language('es')
            .roles(['caption'])
          .addTextStream(2)
            .language('es')
            .roles(['main'])
        .build();

      var chosen = shaka.util.StreamUtils.filterTextStreamsByRoleAndLanguage(
          manifest.periods[0], preferredTextLanguage, undefined, preferredTextRole);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
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

      var chosen = shaka.util.StreamUtils.filterTextStreamsByRoleAndLanguage(
          manifest.periods[0],
          preferredTextLanguage, undefined, preferredTextRole);
      expect(chosen.length).toBe(1);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
    });

    it('chooses text streams in preferred language ' +
       'within single role', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(0) // this variant will be chosen and used as baseline
            .language('en')
            .roles(['caption'])
          .addTextStream(1)
            .language('en')
            .roles(['commentary'])
          .addTextStream(2)
            .language('en')
            .roles(['caption'])
          .addTextStream(3)
            .language('es')
            .roles(['caption'])
          .addTextStream(4) // Will not be chosen because roles list is different
            .language('en')
            .roles(['caption', 'alternate'])
        .build();

      var chosen = shaka.util.StreamUtils.filterTextStreamsByRoleAndLanguage(
          manifest.periods[0],
          preferredTextLanguage);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
      expect(chosen[1]).toBe(manifest.periods[0].textStreams[2]);
    });

    it('chooses text streams with language and role of first variant when ' +
       'neither preferred language nor preferred role match', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(0) // this variant will be chosen and used as baseline
            .language('es')
            .roles(['caption'])
          .addTextStream(1)
            .language('es')
            .roles(['commentary'])
          .addTextStream(2)
            .language('es')
            .roles(['caption'])
          .addTextStream(3) // Will not be chosen because language differs
            .language('fr')
            .roles(['caption'])
          .addTextStream(4) // Will not be chosen because roles list is different
            .language('es')
            .roles(['caption', 'alternate'])
        .build();

      var chosen = shaka.util.StreamUtils.filterTextStreamsByRoleAndLanguage(
          manifest.periods[0],
          preferredTextLanguage);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
      expect(chosen[1]).toBe(manifest.periods[0].textStreams[2]);
    });

    it('chooses primary text streams', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(1)
            .primary()
            .language('en')
            .roles(['main'])
          .addTextStream(2) // Won't be chosen because doesn't match user prefs
            .primary()
            .language('en')
            .roles(['caption'])
          .addTextStream(3)
            .primary()
            .language('en')
            .roles(['main'])
          .addTextStream(4) // Won't be chosen because not primary
            .language('en')
            .roles(['main'])
        .build();

      var chosen = shaka.util.StreamUtils.filterTextStreamsByRoleAndLanguage(
          manifest.periods[0], preferredTextLanguage);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
      expect(chosen[1]).toBe(manifest.periods[0].textStreams[2]);
    });
  });

  describe('filterPeriod', function() {
    var fakeDrmEngine;

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

      var activeStreams = {};
      shaka.util.StreamUtils.filterPeriod(
          fakeDrmEngine, activeStreams, manifest.periods[0]);

      // Covers a regression in which we would remove streams with codecs.
      // The last two streams should be removed because their full MIME types
      // are bogus.
      expect(manifest.periods[0].textStreams.length).toBe(2);
      var textStreams = manifest.periods[0].textStreams;
      expect(textStreams[0].id).toBe(1);
      expect(textStreams[1].id).toBe(2);
    });
  });
});
