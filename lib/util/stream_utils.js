/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.StreamUtils');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.MultiMap');
goog.require('shaka.util.Platform');
goog.requireType('shaka.media.DrmEngine');


/**
 * @summary A set of utility functions for dealing with Streams and Manifests.
 */
shaka.util.StreamUtils = class {
  /**
   * In case of multiple usable codecs, choose one based on lowest average
   * bandwidth and filter out the rest.
   * Also filters out variants that have too many audio channels.
   * @param {!shaka.extern.Manifest} manifest
   * @param {!Array.<string>} preferredVideoCodecs
   * @param {!Array.<string>} preferredAudioCodecs
   * @param {number} preferredAudioChannelCount
   * @param {!Array.<string>} preferredDecodingAttributes
   */
  static chooseCodecsAndFilterManifest(manifest, preferredVideoCodecs,
      preferredAudioCodecs, preferredAudioChannelCount,
      preferredDecodingAttributes) {
    const StreamUtils = shaka.util.StreamUtils;

    let variants = manifest.variants;
    // To start, choose the codecs based on configured preferences if available.
    if (preferredVideoCodecs.length || preferredAudioCodecs.length) {
      variants = StreamUtils.choosePreferredCodecs(variants,
          preferredVideoCodecs, preferredAudioCodecs);
    }

    // Consider a subset of variants based on audio channel
    // preferences.
    // For some content (#1013), surround-sound variants will use a different
    // codec than stereo variants, so it is important to choose codecs **after**
    // considering the audio channel config.
    variants = StreamUtils.filterVariantsByAudioChannelCount(
        variants, preferredAudioChannelCount);

    // Now organize variants into buckets by codecs.
    /** @type {!shaka.util.MultiMap.<shaka.extern.Variant>} */
    let variantsByCodecs = StreamUtils.getVariantsByCodecs_(variants);
    variantsByCodecs = StreamUtils.filterVariantsByDensity_(variantsByCodecs);

    const bestCodecs = StreamUtils.chooseCodecsByDecodingAttributes_(
        variantsByCodecs, preferredDecodingAttributes);

    // Filter out any variants that don't match, forcing AbrManager to choose
    // from a single video codec and a single audio codec possible.
    manifest.variants = manifest.variants.filter((variant) => {
      const codecs = StreamUtils.getVariantCodecs_(variant);
      if (codecs == bestCodecs) {
        return true;
      }

      shaka.log.debug('Dropping Variant (better codec available)', variant);
      return false;
    });
  }

  /**
  * Get variants by codecs.
  *
  * @param {!Array<shaka.extern.Variant>} variants
  * @return {!shaka.util.MultiMap.<shaka.extern.Variant>}
  * @private
  */
  static getVariantsByCodecs_(variants) {
    const variantsByCodecs = new shaka.util.MultiMap();
    for (const variant of variants) {
      const variantCodecs = shaka.util.StreamUtils.getVariantCodecs_(variant);
      variantsByCodecs.push(variantCodecs, variant);
    }

    return variantsByCodecs;
  }

  /**
  * Filters variants by density.
  * Get variants by codecs map with the max density where all codecs are
  * present.
  *
  * @param {!shaka.util.MultiMap.<shaka.extern.Variant>} variantsByCodecs
  * @return {!shaka.util.MultiMap.<shaka.extern.Variant>}
  * @private
  */
  static filterVariantsByDensity_(variantsByCodecs) {
    let maxDensity = 0;
    const codecGroupsByDensity = new Map();
    const countCodecs = variantsByCodecs.size();

    variantsByCodecs.forEach((codecs, variants) => {
      for (const variant of variants) {
        const video = variant.video;
        if (!video || !video.width || !video.height) {
          continue;
        }

        const density = video.width * video.height * (video.frameRate || 1);
        if (!codecGroupsByDensity.has(density)) {
          codecGroupsByDensity.set(density, new shaka.util.MultiMap());
        }

        /** @type {!shaka.util.MultiMap.<shaka.extern.Variant>} */
        const group = codecGroupsByDensity.get(density);
        group.push(codecs, variant);

        // We want to look at the groups in which all codecs are present.
        // Take the max density from those groups where all codecs are present.
        // Later, we will compare bandwidth numbers only within this group.
        // Effectively, only the bandwidth differences in the highest-res and
        // highest-framerate content will matter in choosing a codec.
        if (group.size() === countCodecs) {
          maxDensity = Math.max(maxDensity, density);
        }
      }
    });

    return maxDensity ? codecGroupsByDensity.get(maxDensity) : variantsByCodecs;
  }

  /**
   * Choose the codecs by configured preferred audio and video codecs.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {!Array.<string>} preferredVideoCodecs
   * @param {!Array.<string>} preferredAudioCodecs
   * @return {!Array<shaka.extern.Variant>}
   */
  static choosePreferredCodecs(variants, preferredVideoCodecs,
      preferredAudioCodecs) {
    let subset = variants;
    for (const videoCodec of preferredVideoCodecs) {
      const filtered = subset.filter((variant) => {
        return variant.video && variant.video.codecs.startsWith(videoCodec);
      });
      if (filtered.length) {
        subset = filtered;
        break;
      }
    }

    for (const audioCodec of preferredAudioCodecs) {
      const filtered = subset.filter((variant) => {
        return variant.audio && variant.audio.codecs.startsWith(audioCodec);
      });
      if (filtered.length) {
        subset = filtered;
        break;
      }
    }
    return subset;
  }

  /**
   * Choose the codecs by configured preferred decoding attributes.
   *
   * @param {!shaka.util.MultiMap.<shaka.extern.Variant>} variantsByCodecs
   * @param {!Array.<string>} attributes
   * @return {string}
   * @private
   */
  static chooseCodecsByDecodingAttributes_(variantsByCodecs, attributes) {
    const StreamUtils = shaka.util.StreamUtils;

    for (const attribute of attributes) {
      if (attribute == StreamUtils.DecodingAttributes.SMOOTH ||
          attribute == StreamUtils.DecodingAttributes.POWER) {
        variantsByCodecs = StreamUtils.chooseCodecsByMediaCapabilitiesInfo_(
            variantsByCodecs, attribute);
        // If we only have one smooth or powerEfficient codecs, choose it as the
        // best codecs.
        if (variantsByCodecs.size() == 1) {
          return variantsByCodecs.keys()[0];
        }
      } else if (attribute == StreamUtils.DecodingAttributes.BANDWIDTH) {
        return StreamUtils.findCodecsByLowestBandwidth_(variantsByCodecs);
      }
    }
    // If there's no configured decoding preferences, or we have multiple codecs
    // that meets the configured decoding preferences, choose the one with
    // the lowest bandwidth.
    return StreamUtils.findCodecsByLowestBandwidth_(variantsByCodecs);
  }

  /**
   * Choose the best codecs by configured preferred MediaCapabilitiesInfo
   * attributes.
   *
   * @param {!shaka.util.MultiMap.<shaka.extern.Variant>} variantsByCodecs
   * @param {string} attribute
   * @return {!shaka.util.MultiMap.<shaka.extern.Variant>}
   * @private
   */
  static chooseCodecsByMediaCapabilitiesInfo_(variantsByCodecs, attribute) {
    let highestScore = 0;
    const bestVariantsByCodecs = new shaka.util.MultiMap();
    variantsByCodecs.forEach((codecs, variants) => {
      let sum = 0;
      let num = 0;

      for (const variant of variants) {
        if (variant.decodingInfos.length) {
          sum += variant.decodingInfos[0][attribute] ? 1 : 0;
          num++;
        }
      }

      const averageScore = sum / num;
      shaka.log.debug('codecs', codecs, 'avg', attribute, averageScore);

      if (averageScore > highestScore) {
        bestVariantsByCodecs.clear();
        bestVariantsByCodecs.push(codecs, variants);
        highestScore = averageScore;
      } else if (averageScore == highestScore) {
        bestVariantsByCodecs.push(codecs, variants);
      }
    });
    return bestVariantsByCodecs;
  }

  /**
   * Find the lowest-bandwidth (best) codecs.
   * Compute the average bandwidth for each group of variants.
   *
   * @param {!shaka.util.MultiMap.<shaka.extern.Variant>} variantsByCodecs
   * @return {string}
   * @private
   */
  static findCodecsByLowestBandwidth_(variantsByCodecs) {
    let bestCodecs = '';
    let lowestAverageBandwidth = Infinity;

    variantsByCodecs.forEach((codecs, variants) => {
      let sum = 0;
      let num = 0;
      for (const variant of variants) {
        sum += variant.bandwidth || 0;
        ++num;
      }

      const averageBandwidth = sum / num;
      shaka.log.debug('codecs', codecs, 'avg bandwidth', averageBandwidth);

      if (averageBandwidth < lowestAverageBandwidth) {
        bestCodecs = codecs;
        lowestAverageBandwidth = averageBandwidth;
      }
    });

    goog.asserts.assert(bestCodecs !== '', 'Should have chosen codecs!');
    goog.asserts.assert(!isNaN(lowestAverageBandwidth),
        'Bandwidth should be a number!');

    return bestCodecs;
  }

  /**
   * Get a string representing all codecs used in a variant.
   *
   * @param {!shaka.extern.Variant} variant
   * @return {string}
   * @private
   */
  static getVariantCodecs_(variant) {
    // Only consider the base of the codec string.  For example, these should
    // both be considered the same codec: avc1.42c01e, avc1.4d401f
    let baseVideoCodec = '';
    if (variant.video) {
      baseVideoCodec = shaka.util.MimeUtils.getCodecBase(variant.video.codecs);
    }

    let baseAudioCodec = '';
    if (variant.audio) {
      baseAudioCodec = shaka.util.MimeUtils.getCodecBase(variant.audio.codecs);
    }

    return baseVideoCodec + '-' + baseAudioCodec;
  }

  /**
   * Filter the variants in |manifest| to only include the variants that meet
   * the given restrictions.
   *
   * @param {!shaka.extern.Manifest} manifest
   * @param {shaka.extern.Restrictions} restrictions
   * @param {{width: number, height:number}} maxHwResolution
   */
  static filterByRestrictions(manifest, restrictions, maxHwResolution) {
    manifest.variants = manifest.variants.filter((variant) => {
      return shaka.util.StreamUtils.meetsRestrictions(
          variant, restrictions, maxHwResolution);
    });
  }

  /**
   * @param {shaka.extern.Variant} variant
   * @param {shaka.extern.Restrictions} restrictions
   *   Configured restrictions from the user.
   * @param {{width: number, height: number}} maxHwRes
   *   The maximum resolution the hardware can handle.
   *   This is applied separately from user restrictions because the setting
   *   should not be easily replaced by the user's configuration.
   * @return {boolean}
   */
  static meetsRestrictions(variant, restrictions, maxHwRes) {
    /** @type {function(number, number, number):boolean} */
    const inRange = (x, min, max) => {
      return x >= min && x <= max;
    };

    const video = variant.video;

    // |video.width| and |video.height| can be undefined, which breaks
    // the math, so make sure they are there first.
    if (video && video.width && video.height) {
      if (!inRange(video.width,
          restrictions.minWidth,
          Math.min(restrictions.maxWidth, maxHwRes.width))) {
        return false;
      }

      if (!inRange(video.height,
          restrictions.minHeight,
          Math.min(restrictions.maxHeight, maxHwRes.height))) {
        return false;
      }

      if (!inRange(video.width * video.height,
          restrictions.minPixels,
          restrictions.maxPixels)) {
        return false;
      }
    }

    // |variant.frameRate| can be undefined, which breaks
    // the math, so make sure they are there first.
    if (variant && variant.video && variant.video.frameRate) {
      if (!inRange(variant.video.frameRate,
          restrictions.minFrameRate,
          restrictions.maxFrameRate)) {
        return false;
      }
    }

    if (!inRange(variant.bandwidth,
        restrictions.minBandwidth,
        restrictions.maxBandwidth)) {
      return false;
    }

    return true;
  }


  /**
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {shaka.extern.Restrictions} restrictions
   * @param {{width: number, height: number}} maxHwRes
   * @return {boolean} Whether the tracks changed.
   */
  static applyRestrictions(variants, restrictions, maxHwRes) {
    let tracksChanged = false;

    for (const variant of variants) {
      const originalAllowed = variant.allowedByApplication;
      variant.allowedByApplication = shaka.util.StreamUtils.meetsRestrictions(
          variant, restrictions, maxHwRes);

      if (originalAllowed != variant.allowedByApplication) {
        tracksChanged = true;
      }
    }

    return tracksChanged;
  }


  /**
   * Alters the given Manifest to filter out any unplayable streams.
   *
   * @param {shaka.media.DrmEngine} drmEngine
   * @param {?shaka.extern.Variant} currentVariant
   * @param {shaka.extern.Manifest} manifest
   */
  static async filterManifest(
      drmEngine, currentVariant, manifest) {
    await shaka.util.StreamUtils.filterManifestByMediaCapabilities(manifest,
        manifest.offlineSessionIds.length > 0);
    shaka.util.StreamUtils.filterManifestByCurrentVariant(
        currentVariant, manifest);
    shaka.util.StreamUtils.filterTextStreams_(manifest);
    shaka.util.StreamUtils.filterImageStreams_(manifest);
  }


  /**
   * Alters the given Manifest to filter out any streams unsupported by the
   * platform via MediaCapabilities.decodingInfo() API.
   *
   * @param {shaka.extern.Manifest} manifest
   * @param {boolean} usePersistentLicenses
   */
  static async filterManifestByMediaCapabilities(
      manifest, usePersistentLicenses) {
    goog.asserts.assert(navigator.mediaCapabilities,
        'MediaCapabilities should be valid.');

    await shaka.util.StreamUtils.getDecodingInfosForVariants(
        manifest.variants, usePersistentLicenses);
    manifest.variants = manifest.variants.filter((variant) => {
      const video = variant.video;
      // See: https://github.com/google/shaka-player/issues/3380
      if (shaka.util.Platform.isXboxOne() && video &&
          ((video.width && video.width > 1920) ||
          (video.height && video.height > 1080)) &&
          video.codecs.includes('avc1.')) {
        shaka.log.debug('Dropping variant - not compatible with platform',
            shaka.util.StreamUtils.getVariantSummaryString_(variant));
        return false;
      }

      const supported = variant.decodingInfos.some((decodingInfo) => {
        return decodingInfo.supported;
      });
      // Filter out all unsupported variants.
      if (!supported) {
        shaka.log.debug('Dropping variant - not compatible with platform',
            shaka.util.StreamUtils.getVariantSummaryString_(variant));
      }
      return supported;
    });
  }


  /**
   * Get the decodingInfo results of the variants via MediaCapabilities.
   * This should be called after the DrmEngine is created and configured, and
   * before DrmEngine sets the mediaKeys.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {boolean} usePersistentLicenses
   * @exportDoc
   */
  static async getDecodingInfosForVariants(variants, usePersistentLicenses) {
    const gotDecodingInfo = variants.some((variant) =>
      variant.decodingInfos.length);
    if (gotDecodingInfo) {
      shaka.log.debug('Already got the variants\' decodingInfo.');
      return;
    }

    const mediaCapabilities = navigator.mediaCapabilities;

    const operations = [];
    const getVariantDecodingInfos = (async (variant, decodingConfig) => {
      try {
        const result = await mediaCapabilities.decodingInfo(decodingConfig);
        variant.decodingInfos.push(result);
      } catch (e) {
        shaka.log.info('MediaCapabilities.decodingInfo() failed.',
            JSON.stringify(decodingConfig), e);
      }
    });

    for (const variant of variants) {
      /** @type {!Array.<!MediaDecodingConfiguration>} */
      const decodingConfigs = shaka.util.StreamUtils.getDecodingConfigs_(
          variant, usePersistentLicenses);

      for (const config of decodingConfigs) {
        operations.push(getVariantDecodingInfos(variant, config));
      }
    }
    await Promise.all(operations);
  }


  /**
   * Generate a MediaDecodingConfiguration object to get the decodingInfo
   * results for each variant.
   * @param {!shaka.extern.Variant} variant
   * @param {boolean} usePersistentLicenses
   * @return {!Array.<!MediaDecodingConfiguration>}
   * @private
   */
  static getDecodingConfigs_(variant, usePersistentLicenses) {
    const audio = variant.audio;
    const video = variant.video;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    /** @type {!MediaDecodingConfiguration} */
    const mediaDecodingConfig = {
      type: 'media-source',
    };

    if (video) {
      let videoCodecs = video.codecs;
      // For multiplexed streams with audio+video codecs, the config should have
      // AudioConfiguration and VideoConfiguration.
      if (video.codecs.includes(',')) {
        const allCodecs = video.codecs.split(',');
        videoCodecs = shaka.util.ManifestParserUtils.guessCodecs(
            ContentType.VIDEO, allCodecs);
        videoCodecs = shaka.util.StreamUtils.patchVp9(videoCodecs);
        const audioCodecs = shaka.util.ManifestParserUtils.guessCodecs(
            ContentType.AUDIO, allCodecs);

        const audioFullType = shaka.util.MimeUtils.getFullOrConvertedType(
            video.mimeType, audioCodecs, ContentType.AUDIO);
        mediaDecodingConfig.audio = {
          contentType: audioFullType,
          channels: 2,
          bitrate: variant.bandwidth || 1,
          samplerate: 1,
          spatialRendering: false,
        };
      }
      videoCodecs = shaka.util.StreamUtils.patchVp9(videoCodecs);
      const fullType = shaka.util.MimeUtils.getFullOrConvertedType(
          video.mimeType, videoCodecs, ContentType.VIDEO);
      // VideoConfiguration
      mediaDecodingConfig.video = {
        contentType: fullType,
        width: video.width || 1,
        height: video.height || 1,
        bitrate: video.bandwidth || variant.bandwidth || 1,
        // framerate must be greater than 0, otherwise the config is invalid.
        framerate: video.frameRate || 1,
      };
    }
    if (audio) {
      // Some Tizen devices seem to misreport AC-3 support, but correctly
      // report EC-3 support.  So query EC-3 as a fallback for AC-3.
      // See https://github.com/google/shaka-player/issues/2989 for details.
      const codecs =
          (audio.codecs.toLowerCase() == 'ac-3' &&
          shaka.util.Platform.isTizen()) ? 'ec-3' : audio.codecs;
      const fullType = shaka.util.MimeUtils.getFullOrConvertedType(
          audio.mimeType, codecs, ContentType.AUDIO);

      // AudioConfiguration
      mediaDecodingConfig.audio = {
        contentType: fullType,
        channels: audio.channelsCount || 2,
        bitrate: audio.bandwidth || variant.bandwidth || 1,
        samplerate: audio.audioSamplingRate || 1,
        spatialRendering: audio.spatialAudio,
      };
    }

    const videoDrmInfos = variant.video ? variant.video.drmInfos : [];
    const audioDrmInfos = variant.audio ? variant.audio.drmInfos : [];
    const allDrmInfos = videoDrmInfos.concat(audioDrmInfos);

    // Return a list containing the mediaDecodingConfig for unencrypted variant.
    if (!allDrmInfos.length) {
      return [mediaDecodingConfig];
    }

    // A list of MediaDecodingConfiguration objects created for the variant.
    const configs = [];

    // Get all the drm info so that we can avoid using nested loops when we
    // just need the drm info.
    const drmInfoByKeySystems = new Map();
    for (const info of allDrmInfos) {
      if (!drmInfoByKeySystems.get(info.keySystem)) {
        drmInfoByKeySystems.set(info.keySystem, []);
      }
      drmInfoByKeySystems.get(info.keySystem).push(info);
    }

    const persistentState =
        usePersistentLicenses ? 'required' : 'optional';
    const sessionTypes =
        usePersistentLicenses ? ['persistent-license'] : ['temporary'];

    for (const keySystem of drmInfoByKeySystems.keys()) {
      // Create a copy of the mediaDecodingConfig.
      const config = /** @type {!MediaDecodingConfiguration} */
          (Object.assign({}, mediaDecodingConfig));

      const drmInfos = drmInfoByKeySystems.get(keySystem);

      /** @type {!MediaCapabilitiesKeySystemConfiguration} */
      const keySystemConfig = {
        keySystem: keySystem,
        initDataType: 'cenc',
        persistentState: persistentState,
        distinctiveIdentifier: 'optional',
        sessionTypes: sessionTypes,
      };

      for (const info of drmInfos) {
        if (info.initData && info.initData.length) {
          const initDataTypes = new Set();
          for (const initData of info.initData) {
            initDataTypes.add(initData.initDataType);
          }
          if (initDataTypes.size > 1) {
            shaka.log.v2('DrmInfo contains more than one initDataType,',
                'and we use the initDataType of the first initData.',
                info);
          }
          keySystemConfig.initDataType = info.initData[0].initDataType;
        }

        if (info.distinctiveIdentifierRequired) {
          keySystemConfig.distinctiveIdentifier = 'required';
        }
        if (info.persistentStateRequired) {
          keySystemConfig.persistentState = 'required';
        }
        if (info.sessionType) {
          keySystemConfig.sessionTypes = [info.sessionType];
        }

        if (audio) {
          if (!keySystemConfig.audio) {
            // KeySystemTrackConfiguration
            keySystemConfig.audio = {
              robustness: info.audioRobustness,
            };
          } else {
            keySystemConfig.audio.robustness =
                keySystemConfig.audio.robustness || info.audioRobustness;
          }
        }

        if (video) {
          if (!keySystemConfig.video) {
            // KeySystemTrackConfiguration
            keySystemConfig.video = {
              robustness: info.videoRobustness,
            };
          } else {
            keySystemConfig.video.robustness =
                keySystemConfig.video.robustness || info.videoRobustness;
          }
        }
      }
      config.keySystemConfiguration = keySystemConfig;
      configs.push(config);
    }
    return configs;
  }

  /**
   * MediaCapabilities supports 'vp09...' codecs, but not 'vp9'. Translate vp9
   * codec strings into 'vp09...', to allow such content to play with
   * mediaCapabilities enabled.
   *
   * @param {string} codec
   * @return {string}
   */
  static patchVp9(codec) {
    if (codec == 'vp9') {
      return 'vp09.00.10.08';
    }
    return codec;
  }


  /**
   * Alters the given Manifest to filter out any streams uncompatible with the
   * current variant.
   *
   * @param {?shaka.extern.Variant} currentVariant
   * @param {shaka.extern.Manifest} manifest
   */
  static filterManifestByCurrentVariant(currentVariant, manifest) {
    const StreamUtils = shaka.util.StreamUtils;
    manifest.variants = manifest.variants.filter((variant) => {
      const audio = variant.audio;
      const video = variant.video;
      if (audio && currentVariant && currentVariant.audio) {
        if (!StreamUtils.areStreamsCompatible_(audio, currentVariant.audio)) {
          shaka.log.debug('Droping variant - not compatible with active audio',
              'active audio',
              StreamUtils.getStreamSummaryString_(currentVariant.audio),
              'variant.audio',
              StreamUtils.getStreamSummaryString_(audio));
          return false;
        }
      }

      if (video && currentVariant && currentVariant.video) {
        if (!StreamUtils.areStreamsCompatible_(video, currentVariant.video)) {
          shaka.log.debug('Droping variant - not compatible with active video',
              'active video',
              StreamUtils.getStreamSummaryString_(currentVariant.video),
              'variant.video',
              StreamUtils.getStreamSummaryString_(video));
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Alters the given Manifest to filter out any unsupported text streams.
   *
   * @param {shaka.extern.Manifest} manifest
   * @private
   */
  static filterTextStreams_(manifest) {
    // Filter text streams.
    manifest.textStreams = manifest.textStreams.filter((stream) => {
      const fullMimeType = shaka.util.MimeUtils.getFullType(
          stream.mimeType, stream.codecs);
      const keep = shaka.text.TextEngine.isTypeSupported(fullMimeType);

      if (!keep) {
        shaka.log.debug('Dropping text stream. Is not supported by the ' +
                        'platform.', stream);
      }

      return keep;
    });
  }


  /**
   * Alters the given Manifest to filter out any unsupported image streams.
   *
   * @param {shaka.extern.Manifest} manifest
   * @private
   */
  static filterImageStreams_(manifest) {
    // Filter image streams.
    manifest.imageStreams = manifest.imageStreams.filter((stream) => {
      // TODO: re-examine this and avoid allow-listing the MIME types we can
      // accept.
      const validMimeTypes = [
        'image/svg+xml',
        'image/png',
        'image/jpeg',
      ];
      const Platform = shaka.util.Platform;
      // Add webp support to popular platforms that support it.
      const webpSupport = Platform.isWebOS() ||
                          Platform.isTizen() ||
                          Platform.isChromecast();
      if (webpSupport) {
        validMimeTypes.push('image/webp');
      }
      // TODO: add support to image/webp and image/avif
      const keep = validMimeTypes.includes(stream.mimeType);

      if (!keep) {
        shaka.log.debug('Dropping image stream. Is not supported by the ' +
                        'platform.', stream);
      }

      return keep;
    });
  }


  /**
   * @param {shaka.extern.Stream} s0
   * @param {shaka.extern.Stream} s1
   * @return {boolean}
   * @private
   */
  static areStreamsCompatible_(s0, s1) {
    // Basic mime types and basic codecs need to match.
    // For example, we can't adapt between WebM and MP4,
    // nor can we adapt between mp4a.* to ec-3.
    // We can switch between text types on the fly,
    // so don't run this check on text.
    if (s0.mimeType != s1.mimeType) {
      return false;
    }

    if (s0.codecs.split('.')[0] != s1.codecs.split('.')[0]) {
      return false;
    }

    return true;
  }


  /**
   * @param {shaka.extern.Variant} variant
   * @return {shaka.extern.Track}
   */
  static variantToTrack(variant) {
    /** @type {?shaka.extern.Stream} */
    const audio = variant.audio;
    /** @type {?shaka.extern.Stream} */
    const video = variant.video;

    /** @type {?string} */
    const audioCodec = audio ? audio.codecs : null;
    /** @type {?string} */
    const videoCodec = video ? video.codecs : null;

    /** @type {!Array.<string>} */
    const codecs = [];
    if (videoCodec) {
      codecs.push(videoCodec);
    }
    if (audioCodec) {
      codecs.push(audioCodec);
    }

    /** @type {!Array.<string>} */
    const mimeTypes = [];
    if (video) {
      mimeTypes.push(video.mimeType);
    }
    if (audio) {
      mimeTypes.push(audio.mimeType);
    }
    /** @type {?string} */
    const mimeType = mimeTypes[0] || null;

    /** @type {!Array.<string>} */
    const kinds = [];
    if (audio) {
      kinds.push(audio.kind);
    }
    if (video) {
      kinds.push(video.kind);
    }
    /** @type {?string} */
    const kind = kinds[0] || null;

    /** @type {!Set.<string>} */
    const roles = new Set();
    if (audio) {
      for (const role of audio.roles) {
        roles.add(role);
      }
    }
    if (video) {
      for (const role of video.roles) {
        roles.add(role);
      }
    }

    /** @type {shaka.extern.Track} */
    const track = {
      id: variant.id,
      active: false,
      type: 'variant',
      bandwidth: variant.bandwidth,
      language: variant.language,
      label: null,
      kind: kind,
      width: null,
      height: null,
      frameRate: null,
      pixelAspectRatio: null,
      hdr: null,
      mimeType: mimeType,
      codecs: codecs.join(', '),
      audioCodec: audioCodec,
      videoCodec: videoCodec,
      primary: variant.primary,
      roles: Array.from(roles),
      audioRoles: null,
      forced: false,
      videoId: null,
      audioId: null,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      tilesLayout: null,
      audioBandwidth: null,
      videoBandwidth: null,
      originalVideoId: null,
      originalAudioId: null,
      originalTextId: null,
      originalImageId: null,
    };

    if (video) {
      track.videoId = video.id;
      track.originalVideoId = video.originalId;
      track.width = video.width || null;
      track.height = video.height || null;
      track.frameRate = video.frameRate || null;
      track.pixelAspectRatio = video.pixelAspectRatio || null;
      track.videoBandwidth = video.bandwidth || null;
    }

    if (audio) {
      track.audioId = audio.id;
      track.originalAudioId = audio.originalId;
      track.channelsCount = audio.channelsCount;
      track.audioSamplingRate = audio.audioSamplingRate;
      track.audioBandwidth = audio.bandwidth || null;
      track.label = audio.label;
      track.audioRoles = audio.roles;
    }

    return track;
  }


  /**
   * @param {shaka.extern.Stream} stream
   * @return {shaka.extern.Track}
   */
  static textStreamToTrack(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    /** @type {shaka.extern.Track} */
    const track = {
      id: stream.id,
      active: false,
      type: ContentType.TEXT,
      bandwidth: 0,
      language: stream.language,
      label: stream.label,
      kind: stream.kind || null,
      width: null,
      height: null,
      frameRate: null,
      pixelAspectRatio: null,
      hdr: null,
      mimeType: stream.mimeType,
      codecs: stream.codecs || null,
      audioCodec: null,
      videoCodec: null,
      primary: stream.primary,
      roles: stream.roles,
      audioRoles: null,
      forced: stream.forced,
      videoId: null,
      audioId: null,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      tilesLayout: null,
      audioBandwidth: null,
      videoBandwidth: null,
      originalVideoId: null,
      originalAudioId: null,
      originalTextId: stream.originalId,
      originalImageId: null,
    };

    return track;
  }


  /**
   * @param {shaka.extern.Stream} stream
   * @return {shaka.extern.Track}
   */
  static imageStreamToTrack(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    /** @type {shaka.extern.Track} */
    const track = {
      id: stream.id,
      active: false,
      type: ContentType.IMAGE,
      bandwidth: stream.bandwidth || 0,
      language: '',
      label: null,
      kind: null,
      width: stream.width || null,
      height: stream.height || null,
      frameRate: null,
      pixelAspectRatio: null,
      hdr: null,
      mimeType: stream.mimeType,
      codecs: null,
      audioCodec: null,
      videoCodec: null,
      primary: false,
      roles: [],
      audioRoles: null,
      forced: false,
      videoId: null,
      audioId: null,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      tilesLayout: stream.tilesLayout || null,
      audioBandwidth: null,
      videoBandwidth: null,
      originalVideoId: null,
      originalAudioId: null,
      originalTextId: null,
      originalImageId: stream.originalId,
    };

    return track;
  }


  /**
   * Generate and return an ID for this track, since the ID field is optional.
   *
   * @param {TextTrack|AudioTrack} html5Track
   * @return {number} The generated ID.
   */
  static html5TrackId(html5Track) {
    if (!html5Track['__shaka_id']) {
      html5Track['__shaka_id'] = shaka.util.StreamUtils.nextTrackId_++;
    }
    return html5Track['__shaka_id'];
  }


  /**
   * @param {TextTrack} textTrack
   * @return {shaka.extern.Track}
   */
  static html5TextTrackToTrack(textTrack) {
    const CLOSED_CAPTION_MIMETYPE =
        shaka.util.MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE;
    const StreamUtils = shaka.util.StreamUtils;

    /** @type {shaka.extern.Track} */
    const track = StreamUtils.html5TrackToGenericShakaTrack_(textTrack);
    track.active = textTrack.mode != 'disabled';
    track.type = 'text';
    track.originalTextId = textTrack.id;
    if (textTrack.kind == 'captions') {
      track.mimeType = CLOSED_CAPTION_MIMETYPE;
    }
    if (textTrack.kind) {
      track.roles = [textTrack.kind];
    }
    if (textTrack.kind == 'forced') {
      track.forced = true;
    }

    return track;
  }


  /**
   * @param {AudioTrack} audioTrack
   * @return {shaka.extern.Track}
   */
  static html5AudioTrackToTrack(audioTrack) {
    const StreamUtils = shaka.util.StreamUtils;

    /** @type {shaka.extern.Track} */
    const track = StreamUtils.html5TrackToGenericShakaTrack_(audioTrack);
    track.active = audioTrack.enabled;
    track.type = 'variant';
    track.originalAudioId = audioTrack.id;

    if (audioTrack.kind == 'main') {
      track.primary = true;
    }
    if (audioTrack.kind) {
      track.roles = [audioTrack.kind];
      track.audioRoles = [audioTrack.kind];
      track.label = audioTrack.label;
    }

    return track;
  }


  /**
   * Creates a Track object with non-type specific fields filled out.  The
   * caller is responsible for completing the Track object with any
   * type-specific information (audio or text).
   *
   * @param {TextTrack|AudioTrack} html5Track
   * @return {shaka.extern.Track}
   * @private
   */
  static html5TrackToGenericShakaTrack_(html5Track) {
    /** @type {shaka.extern.Track} */
    const track = {
      id: shaka.util.StreamUtils.html5TrackId(html5Track),
      active: false,
      type: '',
      bandwidth: 0,
      language: shaka.util.LanguageUtils.normalize(html5Track.language),
      label: html5Track.label,
      kind: html5Track.kind,
      width: null,
      height: null,
      frameRate: null,
      pixelAspectRatio: null,
      hdr: null,
      mimeType: null,
      codecs: null,
      audioCodec: null,
      videoCodec: null,
      primary: false,
      roles: [],
      forced: false,
      audioRoles: null,
      videoId: null,
      audioId: null,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      tilesLayout: null,
      audioBandwidth: null,
      videoBandwidth: null,
      originalVideoId: null,
      originalAudioId: null,
      originalTextId: null,
      originalImageId: null,
    };

    return track;
  }


  /**
   * Determines if the given variant is playable.
   * @param {!shaka.extern.Variant} variant
   * @return {boolean}
   */
  static isPlayable(variant) {
    return variant.allowedByApplication && variant.allowedByKeySystem;
  }


  /**
   * Filters out unplayable variants.
   * @param {!Array.<!shaka.extern.Variant>} variants
   * @return {!Array.<!shaka.extern.Variant>}
   */
  static getPlayableVariants(variants) {
    return variants.filter((variant) => {
      return shaka.util.StreamUtils.isPlayable(variant);
    });
  }


  /**
   * Filters variants according to the given audio channel count config.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {number} preferredAudioChannelCount
   * @return {!Array.<!shaka.extern.Variant>}
   */
  static filterVariantsByAudioChannelCount(
      variants, preferredAudioChannelCount) {
    // Group variants by their audio channel counts.
    const variantsWithChannelCounts =
        variants.filter((v) => v.audio && v.audio.channelsCount);

    /** @type {!Map.<number, !Array.<shaka.extern.Variant>>} */
    const variantsByChannelCount = new Map();
    for (const variant of variantsWithChannelCounts) {
      const count = variant.audio.channelsCount;
      goog.asserts.assert(count != null, 'Must have count after filtering!');
      if (!variantsByChannelCount.has(count)) {
        variantsByChannelCount.set(count, []);
      }
      variantsByChannelCount.get(count).push(variant);
    }

    /** @type {!Array.<number>} */
    const channelCounts = Array.from(variantsByChannelCount.keys());

    // If no variant has audio channel count info, return the original variants.
    if (channelCounts.length == 0) {
      return variants;
    }

    // Choose the variants with the largest number of audio channels less than
    // or equal to the configured number of audio channels.
    const countLessThanOrEqualtoConfig =
        channelCounts.filter((count) => count <= preferredAudioChannelCount);
    if (countLessThanOrEqualtoConfig.length) {
      return variantsByChannelCount.get(
          Math.max(...countLessThanOrEqualtoConfig));
    }

    // If all variants have more audio channels than the config, choose the
    // variants with the fewest audio channels.
    return variantsByChannelCount.get(Math.min(...channelCounts));
  }

  /**
   * Chooses streams according to the given config.
   *
   * @param {!Array.<shaka.extern.Stream>} streams
   * @param {string} preferredLanguage
   * @param {string} preferredRole
   * @param {boolean} preferredForced
   * @return {!Array.<!shaka.extern.Stream>}
   */
  static filterStreamsByLanguageAndRole(
      streams, preferredLanguage, preferredRole, preferredForced) {
    const LanguageUtils = shaka.util.LanguageUtils;

    /** @type {!Array.<!shaka.extern.Stream>} */
    let chosen = streams;

    // Start with the set of primary streams.
    /** @type {!Array.<!shaka.extern.Stream>} */
    const primary = streams.filter((stream) => {
      return stream.primary;
    });

    if (primary.length) {
      chosen = primary;
    }

    // Now reduce the set to one language.  This covers both arbitrary language
    // choice and the reduction of the "primary" stream set to one language.
    const firstLanguage = chosen.length ? chosen[0].language : '';
    chosen = chosen.filter((stream) => {
      return stream.language == firstLanguage;
    });

    // Find the streams that best match our language preference. This will
    // override previous selections.
    if (preferredLanguage) {
      const closestLocale = LanguageUtils.findClosestLocale(
          LanguageUtils.normalize(preferredLanguage),
          streams.map((stream) => stream.language));

      // Only replace |chosen| if we found a locale that is close to our
      // preference.
      if (closestLocale) {
        chosen = streams.filter((stream) => {
          const locale = LanguageUtils.normalize(stream.language);
          return locale == closestLocale;
        });
      }
    }

    // Filter by forced preference
    chosen = chosen.filter((stream) => {
      return stream.forced == preferredForced;
    });

    // Now refine the choice based on role preference.
    if (preferredRole) {
      const roleMatches = shaka.util.StreamUtils.filterTextStreamsByRole_(
          chosen, preferredRole);
      if (roleMatches.length) {
        return roleMatches;
      } else {
        shaka.log.warning('No exact match for the text role could be found.');
      }
    } else {
      // Prefer text streams with no roles, if they exist.
      const noRoleMatches = chosen.filter((stream) => {
        return stream.roles.length == 0;
      });
      if (noRoleMatches.length) {
        return noRoleMatches;
      }
    }

    // Either there was no role preference, or it could not be satisfied.
    // Choose an arbitrary role, if there are any, and filter out any other
    // roles. This ensures we never adapt between roles.

    const allRoles = chosen.map((stream) => {
      return stream.roles;
    }).reduce(shaka.util.Functional.collapseArrays, []);

    if (!allRoles.length) {
      return chosen;
    }
    return shaka.util.StreamUtils.filterTextStreamsByRole_(chosen, allRoles[0]);
  }


  /**
   * Filter text Streams by role.
   *
   * @param {!Array.<shaka.extern.Stream>} textStreams
   * @param {string} preferredRole
   * @return {!Array.<shaka.extern.Stream>}
   * @private
   */
  static filterTextStreamsByRole_(textStreams, preferredRole) {
    return textStreams.filter((stream) => {
      return stream.roles.includes(preferredRole);
    });
  }


  /**
   * Checks if the given stream is an audio stream.
   *
   * @param {shaka.extern.Stream} stream
   * @return {boolean}
   */
  static isAudio(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return stream.type == ContentType.AUDIO;
  }


  /**
   * Checks if the given stream is a video stream.
   *
   * @param {shaka.extern.Stream} stream
   * @return {boolean}
   */
  static isVideo(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return stream.type == ContentType.VIDEO;
  }


  /**
   * Get all non-null streams in the variant as an array.
   *
   * @param {shaka.extern.Variant} variant
   * @return {!Array.<shaka.extern.Stream>}
   */
  static getVariantStreams(variant) {
    const streams = [];

    if (variant.audio) {
      streams.push(variant.audio);
    }
    if (variant.video) {
      streams.push(variant.video);
    }

    return streams;
  }


  /**
   * Returns a string of a variant, with the attribute values of its audio
   * and/or video streams for log printing.
   * @param {shaka.extern.Variant} variant
   * @return {string}
   * @private
   */
  static getVariantSummaryString_(variant) {
    const summaries = [];
    if (variant.audio) {
      summaries.push(shaka.util.StreamUtils.getStreamSummaryString_(
          variant.audio));
    }
    if (variant.video) {
      summaries.push(shaka.util.StreamUtils.getStreamSummaryString_(
          variant.video));
    }
    return summaries.join(', ');
  }

  /**
   * Returns a string of an audio or video stream for log printing.
   * @param {shaka.extern.Stream} stream
   * @return {string}
   * @private
   */
  static getStreamSummaryString_(stream) {
    // Accepted parameters for Chromecast can be found (internally) at
    // go/cast-mime-params

    if (shaka.util.StreamUtils.isAudio(stream)) {
      return 'type=audio' +
             ' codecs=' + stream.codecs +
             ' bandwidth='+ stream.bandwidth +
             ' channelsCount=' + stream.channelsCount +
             ' audioSamplingRate=' + stream.audioSamplingRate;
    }

    if (shaka.util.StreamUtils.isVideo(stream)) {
      return 'type=video' +
             ' codecs=' + stream.codecs +
             ' bandwidth=' + stream.bandwidth +
             ' frameRate=' + stream.frameRate +
             ' width=' + stream.width +
             ' height=' + stream.height;
    }

    return 'unexpected stream type';
  }
};


/** @private {number} */
shaka.util.StreamUtils.nextTrackId_ = 0;

/**
 * @enum {string}
 */
shaka.util.StreamUtils.DecodingAttributes = {
  SMOOTH: 'smooth',
  POWER: 'powerEfficient',
  BANDWIDTH: 'bandwidth',
};
