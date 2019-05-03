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

goog.provide('shaka.util.ManifestFilter');

goog.require('goog.asserts');


/**
 * This utility class contains all the functions used to filter manifests
 * before playback and before storage.
 */
shaka.util.ManifestFilter = class {
  /**
   * Filter the variants in |manifest| to only include the variants that meet
   * the given restrictions.
   *
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.extern.Restrictions} restrictions
   * @param {{width: number, height:number}} maxHwResolution
   */
  static filterByRestrictions(manifest, restrictions, maxHwResolution) {
    for (const period of manifest.periods) {
      period.variants = period.variants.filter((variant) => {
        return shaka.util.StreamUtils.meetsRestrictions(
            variant, restrictions, maxHwResolution);
      });
    }
  }


  /**
   * Filter the variants in the |manifest| to only include those that are
   * supported by media source.
   *
   * @param {shaka.extern.Manifest} manifest
   */
  static filterByMediaSourceSupport(manifest) {
    const MediaSourceEngine = shaka.media.MediaSourceEngine;

    for (const period of manifest.periods) {
      period.variants = period.variants.filter((variant) => {
        let supported = true;
        if (variant.audio) {
          supported =
              supported && MediaSourceEngine.isStreamSupported(variant.audio);
        }
        if (variant.video) {
          supported =
              supported && MediaSourceEngine.isStreamSupported(variant.video);
        }
        return supported;
      });
    }
  }

  /**
   * Filter the variants in |manifest| to only include those that are supported
   * by |drm|.
   *
   * @param {shaka.extern.Manifest} manifest
   * @param {!shaka.media.DrmEngine} drmEngine
   */
  static filterByDrmSupport(manifest, drmEngine) {
    for (const period of manifest.periods) {
      period.variants = period.variants.filter((variant) => {
        return drmEngine.supportsVariant(variant);
      });
    }
  }

  /**
   * Filter the variants in |manifest| to only include those that use codecs
   * that will be supported in each variant. This ensures playback from the
   * first period to the last period by "jumping between" compatible variants.
   *
   * @param {shaka.extern.Manifest} manifest
   */
  static filterByCommonCodecs(manifest) {
    goog.asserts.assert(manifest.periods.length > 0,
                        'There should be at least be one period');

    const ManifestFilter = shaka.util.ManifestFilter;

    // Create a set of summaries that occur in each period.
    /** @type {!shaka.util.ManifestFilter.VariantCodecSummarySet} */
    const common = new shaka.util.ManifestFilter.VariantCodecSummarySet();

    manifest.periods.forEach((period, index) => {
      /** @type {!shaka.util.ManifestFilter.VariantCodecSummarySet} */
      const next = ManifestFilter.VariantCodecSummarySet.fromVariants(
          period.variants);

      if (index == 0) {
        common.includeAll(next);
      } else {
        common.onlyKeep(next);
      }
    });

    // Filter the variants in the period by whether they match a summary that
    // occurs in every period.
    for (const period of manifest.periods) {
      period.variants = period.variants.filter((variant) => {
        const summary = new ManifestFilter.VariantCodecSummary(variant);
        return common.contains(summary);
      });
    }
  }

  /**
   * Go through each period and apply the filter to the set of variants.
   * |filter| will only be given the set of variants in the current period that
   * are compatible with at least one variant in the previous period.
   *
   * @param {shaka.extern.Manifest} manifest
   * @param {function(shaka.extern.Period)} filter
   */
  static rollingFilter(manifest, filter) {
    const ManifestFilter = shaka.util.ManifestFilter;

    // Store a reference to the variants so that the next period can easily
    // reference them too.
    /** @type {!shaka.util.ManifestFilter.VariantCodecSummarySet} */
    let previous = new ManifestFilter.VariantCodecSummarySet();

    manifest.periods.forEach((period, index) => {
      // Remove all variants that don't have a compatible variant in the
      // previous period. If we were to only use the first variant, we would
      // risk a variant being removed from a later period that would break that
      // path across all periods.
      if (index > 0) {
        period.variants = period.variants.filter((variant) => {
          const summary = new ManifestFilter.VariantCodecSummary(variant);
          return previous.contains(summary);
        });
      }

      filter(period);

      // Use the results of filtering this period as the "previous" for the
      // next period.
      previous =
          ManifestFilter.VariantCodecSummarySet.fromVariants(period.variants);
    });
  }
};


/**
 * The variant codec summary is a summary of the codec information for a given
 * codec. This can be used to test the compatibility between variants by
 * checking that their summaries contain the same information.
 *
 * @final
 */
shaka.util.ManifestFilter.VariantCodecSummary = class {
  /**
   * @param {shaka.extern.Variant} variant
   */
  constructor(variant) {
    // We summarize a variant based on the basic mime type and the basic
    // codec because they must match for two variants to be compatible. For
    // example, we can't adapt between WebM and MP4, nor can we adapt between
    // mp4a.* to ec-3.

    const audio = variant.audio;
    const video = variant.video;

    /** @private {?string} */
    this.audioMime_ = audio ? audio.mimeType : null;
    /** @private {?string} */
    this.audioCodec_ = audio ? audio.codecs.split('.')[0] : null;
    /** @private {?string} */
    this.videoMime_ = video ? video.mimeType : null;
    /** @private {?string} */
    this.videoCodec_ = video ? video.codecs.split('.')[0] : null;
  }

  /**
   * Check if this summaries is equal to another.
   *
   * @param {!shaka.util.ManifestFilter.VariantCodecSummary} other
   * @return {boolean}
   */
  equals(other) {
    return this.audioMime_ == other.audioMime_ &&
           this.audioCodec_ == other.audioCodec_ &&
           this.videoMime_ == other.videoMime_ &&
           this.videoCodec_ == other.videoCodec_;
  }
};


/**
 * @final
 */
shaka.util.ManifestFilter.VariantCodecSummarySet = class {
  constructor() {
    /** @private {!Array.<!shaka.util.ManifestFilter.VariantCodecSummary>} */
    this.all_ = [];
  }

  /**
   * @param {!shaka.util.ManifestFilter.VariantCodecSummary} summary
   */
  add(summary) {
    if (!this.contains(summary)) {
      this.all_.push(summary);
    }
  }

  /**
   * Add all items from |other| to |this|.
   * @param {!shaka.util.ManifestFilter.VariantCodecSummarySet} other
   */
  includeAll(other) {
    for (const item of other.all_) {
      this.add(item);
    }
  }

  /**
   * Remove all items from |this| that are not in |other|.
   * @param {!shaka.util.ManifestFilter.VariantCodecSummarySet} other
   */
  onlyKeep(other) {
    this.all_ = this.all_.filter((x) => other.contains(x));
  }

  /**
   * @param {!shaka.util.ManifestFilter.VariantCodecSummary} summary
   * @return {boolean}
   */
  contains(summary) {
    return this.all_.some((x) => summary.equals(x));
  }

  /**
   * Create a set of variant codec summaries for a list of variants. The set
   * may have fewer elements than the list if there are variants with similar
   * codecs.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   * @return {!shaka.util.ManifestFilter.VariantCodecSummarySet}
   */
  static fromVariants(variants) {
    const set = new shaka.util.ManifestFilter.VariantCodecSummarySet();
    for (const variant of variants) {
      set.add(new shaka.util.ManifestFilter.VariantCodecSummary(variant));
    }
    return set;
  }
};
