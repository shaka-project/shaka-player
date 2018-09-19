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

describe('AdaptationSetCriteria', function() {
  describe('preference based selection', function() {
    function variants(manifest) {
      return manifest.periods[0].variants;
    }

    it('chooses variants in user\'s preferred language', function() {
      const manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(1)
            .language('es')
          .addVariant(2)
            .language('en')
          .addVariant(3)
            .language('en')
        .build();

      const builder = new shaka.media.PreferenceBasedCriteria('en', '', 0);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[1],
        manifest.periods[0].variants[2],
      ]);
    });

    it('prefers primary variants', function() {
      const manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
         .addVariant(1)
            .primary()
         .addVariant(2)
         .addVariant(3)
         .addVariant(4)
            .primary()
        .build();

      const builder = new shaka.media.PreferenceBasedCriteria('en', '', 0);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[3],
      ]);
    });

    it('chooses variants in preferred language and role', function() {
      const manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(1)
            .language('en')
            .addAudio(10).roles(['main', 'commentary'])
          .addVariant(2)
            .language('en')
            .addAudio(20).roles(['secondary'])
          .addVariant(3)
            .language('es')
            .addAudio(30).roles(['main'])
        .build();

      const builder = new shaka.media.PreferenceBasedCriteria('en', 'main', 0);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
      ]);
    });

    it('chooses only one role, even if none is preferred', function() {
      // Regression test for https://github.com/google/shaka-player/issues/949
      const manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(1)
            .language('en')
            .addAudio(10).roles(['commentary'])
          .addVariant(2)
            .language('en')
            .addAudio(20).roles(['commentary'])
          .addVariant(3)
            .language('en')
            .addAudio(30).roles(['secondary'])
          .addVariant(4)
            .language('en')
            .addAudio(40).roles(['secondary'])
          .addVariant(5)
            .language('en')
            .addAudio(50).roles(['main'])
          .addVariant(6)
            .language('en')
            .addAudio(60).roles(['main'])
        .build();

      const builder = new shaka.media.PreferenceBasedCriteria('en', '', 0);
      const set = builder.create(variants(manifest));

      // Which role is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[1],
      ]);
    });

    it('chooses only one role, even if all are primary', function() {
      // Regression test for https://github.com/google/shaka-player/issues/949
      const manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(1)
            .language('en').primary()
            .addAudio(10).roles(['commentary'])
          .addVariant(2)
            .language('en').primary()
            .addAudio(20).roles(['commentary'])
          .addVariant(3)
            .language('en').primary()
            .addAudio(30).roles(['secondary'])
          .addVariant(4)
            .language('en').primary()
            .addAudio(40).roles(['secondary'])
          .addVariant(5)
            .language('en').primary()
            .addAudio(50).roles(['main'])
          .addVariant(6)
            .language('en').primary()
            .addAudio(60).roles(['main'])
        .build();

      const builder = new shaka.media.PreferenceBasedCriteria('zh', '', 0);
      const set = builder.create(variants(manifest));

      // Which role is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[1],
      ]);
    });

    it('chooses only one language, even if all are primary', function() {
      // Regression test for https://github.com/google/shaka-player/issues/918
      const manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(1)
            .language('en').primary()
            .addAudio(10)
          .addVariant(2)
            .language('en').primary()
            .addAudio(20)
          .addVariant(3)
            .language('es').primary()
            .addAudio(30)
          .addVariant(4)
            .language('es').primary()
            .addAudio(40)
        .build();

      const builder = new shaka.media.PreferenceBasedCriteria('zh', '', 0);
      const set = builder.create(variants(manifest));

      // Which language is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[1],
      ]);
    });

    it('chooses a role from among primary variants without language match',
        function() {
          const manifest = new shaka.test.ManifestGenerator()
            .addPeriod(0)
              .addVariant(1)
                .language('en').primary()
                .addAudio(10).roles(['commentary'])
              .addVariant(2)
                .language('en').primary()
                .addAudio(20).roles(['commentary'])
              .addVariant(3)
                .language('en')
                .addAudio(30).roles(['secondary'])
              .addVariant(4)
                .language('en')
                .addAudio(40).roles(['secondary'])
              .addVariant(5)
                .language('en').primary()
                .addAudio(50).roles(['main'])
              .addVariant(6)
                .language('en').primary()
                .addAudio(60).roles(['main'])
            .build();

          const builder = new shaka.media.PreferenceBasedCriteria('zh', '', 0);
          const set = builder.create(variants(manifest));

          // Which role is chosen is an implementation detail. Each role is
          // found on two variants, so we should have two. Since nothing matches
          // our language preference, we chose primary variants.
          checkSet(set, [
            manifest.periods[0].variants[0],
            manifest.periods[0].variants[1],
          ]);
        });

    it('chooses a role from best language match, in spite of primary',
        function() {
          const manifest = new shaka.test.ManifestGenerator()
            .addPeriod(0)
              .addVariant(1)
                .language('en').primary()
                .addAudio(10).roles(['commentary'])
              .addVariant(2)
                .language('en').primary()
                .addAudio(20).roles(['commentary'])
              .addVariant(3)
                .language('zh')
                .addAudio(30).roles(['secondary'])
              .addVariant(4)
                .language('zh')
                .addAudio(40).roles(['secondary'])
              .addVariant(5)
                .language('en').primary()
                .addAudio(50).roles(['main'])
              .addVariant(6)
                .language('en').primary()
                .addAudio(60).roles(['main'])
            .build();

          const builder = new shaka.media.PreferenceBasedCriteria('zh', '', 0);
          const set = builder.create(variants(manifest));

          checkSet(set, [
            manifest.periods[0].variants[2],
            manifest.periods[0].variants[3],
          ]);
        });

    it('chooses variants with preferred audio channels count', function() {
      const manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(1)
            .addAudio(10).channelsCount(2)
          .addVariant(2)
            .addAudio(20).channelsCount(6)
          .addVariant(3)
            .addAudio(30).channelsCount(2)
        .build();

      const builder = new shaka.media.PreferenceBasedCriteria('', '', 2);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[2],
      ]);
    });

    it('chooses variants with largest audio channel count less than config' +
        ' when no exact audio channel count match is possible', function() {
      const manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(1)
            .addAudio(10).channelsCount(2)
          .addVariant(2)
            .addAudio(20).channelsCount(8)
          .addVariant(3)
            .addAudio(30).channelsCount(2)
        .build();

      const builder = new shaka.media.PreferenceBasedCriteria('', '', 6);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[2],
      ]);
    });

    it('chooses variants with fewest audio channels when none fit in the ' +
        'config', function() {
      const manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(1)
            .addAudio(10).channelsCount(6)
          .addVariant(2)
            .addAudio(20).channelsCount(8)
          .addVariant(3)
            .addAudio(30).channelsCount(6)
        .build();

      const builder = new shaka.media.PreferenceBasedCriteria('', '', 2);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[2],
      ]);
    });
  });

  /**
   * @param {!shaka.media.AdaptationSet} set
   * @param {!Array<T>} array
   * @template T
   */
  function checkSet(set, array) {
    expect(Array.from(set.values())).toEqual(array);
  }
});
