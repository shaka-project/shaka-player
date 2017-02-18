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

    it('chooses primary variants', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
         .addVariant(0)
            .primary()
         .addVariant(1)
         .addVariant(2)
         .addVariant(3)
            .primary()
        .build();

      var chosen = shaka.util.StreamUtils.filterVariantsByRoleAndLanguage(
          manifest.periods[0], preferredAudioLanguage);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[3]);
    });

    it('filters out resctricted variants', function() {
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

    it('chooses primary text streams', function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addTextStream(1)
          .addTextStream(2)
            .primary()
          .addTextStream(3)
            .primary()
        .build();

      var chosen = shaka.util.StreamUtils.filterTextStreamsByRoleAndLanguage(
          manifest.periods[0], preferredTextLanguage);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[1]);
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
