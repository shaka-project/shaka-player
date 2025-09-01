/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.StreamUtils');

goog.require('goog.asserts');
goog.require('shaka.config.AutoShowText');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.lcevc.Dec');
goog.require('shaka.log');
goog.require('shaka.media.Capabilities');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.MultiMap');
goog.require('shaka.util.ObjectUtils');
goog.requireType('shaka.drm.DrmEngine');


/**
 * @summary A set of utility functions for dealing with Streams and Manifests.
 * @export
 */
shaka.util.StreamUtils = class {
  /**
   * In case of multiple usable codecs, choose one based on lowest average
   * bandwidth and filter out the rest.
   * Also filters out variants that have too many audio channels.
   * @param {!shaka.extern.Manifest} manifest
   * @param {!Array<string>} preferredVideoCodecs
   * @param {!Array<string>} preferredAudioCodecs
   * @param {!Array<string>} preferredDecodingAttributes
   * @param {!Array<string>} preferredTextFormats
   */
  static chooseCodecsAndFilterManifest(manifest, preferredVideoCodecs,
      preferredAudioCodecs, preferredDecodingAttributes, preferredTextFormats) {
    const StreamUtils = shaka.util.StreamUtils;
    const MimeUtils = shaka.util.MimeUtils;

    if (preferredTextFormats.length) {
      let subset = manifest.textStreams;
      for (const textFormat of preferredTextFormats) {
        const filtered = subset.filter((textStream) => {
          if (textStream.codecs.startsWith(textFormat) ||
              textStream.mimeType.startsWith(textFormat)) {
            return true;
          }
          return false;
        });
        if (filtered.length) {
          subset = filtered;
          break;
        }
      }
      manifest.textStreams = subset;
    }

    let variants = manifest.variants;
    // To start, choose the codecs based on configured preferences if available.
    if (preferredVideoCodecs.length || preferredAudioCodecs.length) {
      variants = StreamUtils.choosePreferredCodecs(variants,
          preferredVideoCodecs, preferredAudioCodecs);
    }

    if (preferredDecodingAttributes.length) {
      // group variants by resolution and choose preferred variants only
      /** @type {!shaka.util.MultiMap<shaka.extern.Variant>} */
      const variantsByResolutionMap = new shaka.util.MultiMap();
      for (const variant of variants) {
        variantsByResolutionMap
            .push(String(variant.video.width || 0), variant);
      }
      const bestVariants = [];
      variantsByResolutionMap.forEach((width, variantsByResolution) => {
        let highestMatch = 0;
        let matchingVariants = [];
        for (const variant of variantsByResolution) {
          const matchCount = preferredDecodingAttributes.filter(
              (attribute) => variant.decodingInfos[0][attribute],
          ).length;
          if (matchCount > highestMatch) {
            highestMatch = matchCount;
            matchingVariants = [variant];
          } else if (matchCount == highestMatch) {
            matchingVariants.push(variant);
          }
        }
        bestVariants.push(...matchingVariants);
      });
      variants = bestVariants;
    }

    const audioStreamsSet = new Set();
    const videoStreamsSet = new Set();
    for (const variant of variants) {
      if (variant.audio) {
        audioStreamsSet.add(variant.audio);
      }
      if (variant.video) {
        videoStreamsSet.add(variant.video);
      }
    }

    const audioStreams = Array.from(audioStreamsSet).sort((v1, v2) => {
      return v1.bandwidth - v2.bandwidth;
    });
    const validAudioIds = [];
    const validAudioStreamsMap = new Map();
    const getAudioId = (stream) => {
      let id = stream.language + (stream.channelsCount || 0) +
        (stream.audioSamplingRate || 0) + stream.roles.join(',') +
        stream.label + stream.groupId + stream.fastSwitching;
      if (stream.dependencyStream) {
        id += stream.dependencyStream.baseOriginalId || '';
      }
      return id;
    };
    for (const stream of audioStreams) {
      const groupId = getAudioId(stream);
      const validAudioStreams = validAudioStreamsMap.get(groupId) || [];
      if (!validAudioStreams.length) {
        validAudioStreams.push(stream);
        validAudioIds.push(stream.id);
      } else {
        const previousStream = validAudioStreams[validAudioStreams.length - 1];
        const previousCodec =
          MimeUtils.getNormalizedCodec(previousStream.codecs);
        const currentCodec =
          MimeUtils.getNormalizedCodec(stream.codecs);
        if (previousCodec == currentCodec) {
          if (!stream.bandwidth || !previousStream.bandwidth ||
              stream.bandwidth > previousStream.bandwidth) {
            validAudioStreams.push(stream);
            validAudioIds.push(stream.id);
          }
        }
      }
      validAudioStreamsMap.set(groupId, validAudioStreams);
    }

    // Keys based in MimeUtils.getNormalizedCodec. Lower is better
    const videoCodecPreference = {
      'vp8': 1,
      'avc': 1,
      'dovi-avc': 0.95,
      'vp9': 0.9,
      'vp09': 0.9,
      'hevc': 0.85,
      'dovi-hevc': 0.8,
      'dovi-p5': 0.75,
      'av01': 0.7,
      'dovi-av1': 0.65,
      'vvc': 0.6,
    };

    const videoStreams = Array.from(videoStreamsSet)
        .sort((v1, v2) => {
          if (!v1.bandwidth || !v2.bandwidth || v1.bandwidth == v2.bandwidth) {
            if (v1.codecs && v2.codecs && v1.codecs != v2.codecs &&
                v1.width == v2.width) {
              const v1Codecs = MimeUtils.getNormalizedCodec(v1.codecs);
              const v2Codecs = MimeUtils.getNormalizedCodec(v2.codecs);
              if (v1Codecs != v2Codecs) {
                const indexV1 = videoCodecPreference[v1Codecs] || 1;
                const indexV2 = videoCodecPreference[v2Codecs] || 1;
                return indexV1 - indexV2;
              }
            }
            return v1.width - v2.width;
          }
          return v1.bandwidth - v2.bandwidth;
        });

    const isChangeTypeSupported =
      shaka.media.Capabilities.isChangeTypeSupported();

    const validVideoIds = [];
    const validVideoStreamsMap = new Map();
    const getVideoGroupId = (stream) => {
      let id = String(stream.width || '') + String(stream.height || '') +
          String(Math.round(stream.frameRate || 0)) + (stream.hdr || '') +
          stream.fastSwitching;
      if (stream.dependencyStream) {
        id += stream.dependencyStream.baseOriginalId || '';
      }
      if (stream.roles) {
        id += stream.roles.sort().join('_');
      }
      return id;
    };
    for (const stream of videoStreams) {
      const groupId = getVideoGroupId(stream);
      const validVideoStreams = validVideoStreamsMap.get(groupId) || [];
      if (!validVideoStreams.length) {
        validVideoStreams.push(stream);
        validVideoIds.push(stream.id);
      } else {
        const previousStream = validVideoStreams[validVideoStreams.length - 1];
        if (!isChangeTypeSupported) {
          const previousCodec =
            MimeUtils.getNormalizedCodec(previousStream.codecs);
          const currentCodec =
            MimeUtils.getNormalizedCodec(stream.codecs);
          if (previousCodec !== currentCodec) {
            continue;
          }
        }
        const previousCodec =
          MimeUtils.getNormalizedCodec(previousStream.codecs);
        const currentCodec =
          MimeUtils.getNormalizedCodec(stream.codecs);
        if (previousCodec == currentCodec) {
          if (!stream.bandwidth || !previousStream.bandwidth ||
              stream.bandwidth > previousStream.bandwidth) {
            validVideoStreams.push(stream);
            validVideoIds.push(stream.id);
          }
        }
      }
      validVideoStreamsMap.set(groupId, validVideoStreams);
    }

    // Filter out any variants that don't match, forcing AbrManager to choose
    // from a single video codec and a single audio codec possible.
    manifest.variants = manifest.variants.filter((variant) => {
      const audio = variant.audio;
      const video = variant.video;
      if (audio) {
        if (!validAudioIds.includes(audio.id)) {
          shaka.log.debug('Dropping Variant (better codec available)', variant);
          return false;
        }
      }
      if (video) {
        if (!validVideoIds.includes(video.id)) {
          shaka.log.debug('Dropping Variant (better codec available)', variant);
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Choose the codecs by configured preferred audio and video codecs.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {!Array<string>} preferredVideoCodecs
   * @param {!Array<string>} preferredAudioCodecs
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
   * Filter the variants in |manifest| to only include the variants that meet
   * the given restrictions.
   *
   * @param {!shaka.extern.Manifest} manifest
   * @param {shaka.extern.Restrictions} restrictions
   * @param {shaka.extern.Resolution} maxHwResolution
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
   * @param {shaka.extern.Resolution} maxHwRes
   *   The maximum resolution the hardware can handle.
   *   This is applied separately from user restrictions because the setting
   *   should not be easily replaced by the user's configuration.
   * @return {boolean}
   * @export
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
      let videoWidth = video.width;
      let videoHeight = video.height;
      if (videoHeight > videoWidth) {
        // Vertical video.
        [videoWidth, videoHeight] = [videoHeight, videoWidth];
      }

      if (!inRange(videoWidth,
          restrictions.minWidth,
          Math.min(restrictions.maxWidth, maxHwRes.width))) {
        return false;
      }

      if (!inRange(videoHeight,
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

    // |variant.video.frameRate| can be undefined, which breaks
    // the math, so make sure they are there first.
    if (variant && variant.video && variant.video.frameRate) {
      if (!inRange(variant.video.frameRate,
          restrictions.minFrameRate,
          restrictions.maxFrameRate)) {
        return false;
      }
    }

    // |variant.audio.channelsCount| can be undefined, which breaks
    // the math, so make sure they are there first.
    if (variant && variant.audio && variant.audio.channelsCount) {
      if (!inRange(variant.audio.channelsCount,
          restrictions.minChannelsCount,
          restrictions.maxChannelsCount)) {
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
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {shaka.extern.Restrictions} restrictions
   * @param {shaka.extern.Resolution} maxHwRes
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
   * @param {shaka.drm.DrmEngine} drmEngine
   * @param {shaka.extern.Manifest} manifest
   * @param {!Array<string>=} preferredKeySystems
   * @param {!Object<string, string>=} keySystemsMapping
   */
  static async filterManifest(drmEngine, manifest, preferredKeySystems = [],
      keySystemsMapping = {}) {
    await shaka.util.StreamUtils.filterManifestByMediaCapabilities(
        drmEngine, manifest, manifest.offlineSessionIds.length > 0,
        preferredKeySystems, keySystemsMapping);
    shaka.util.StreamUtils.filterTextStreams_(manifest);
    await shaka.util.StreamUtils.filterImageStreams_(manifest);
  }


  /**
   * Alters the given Manifest to filter out any streams unsupported by the
   * platform via MediaCapabilities.decodingInfo() API.
   *
   * @param {shaka.drm.DrmEngine} drmEngine
   * @param {shaka.extern.Manifest} manifest
   * @param {boolean} usePersistentLicenses
   * @param {!Array<string>} preferredKeySystems
   * @param {!Object<string, string>} keySystemsMapping
   */
  static async filterManifestByMediaCapabilities(
      drmEngine, manifest, usePersistentLicenses, preferredKeySystems,
      keySystemsMapping) {
    goog.asserts.assert(navigator.mediaCapabilities,
        'MediaCapabilities should be valid.');

    if (shaka.device.DeviceFactory.getDevice()
        .shouldOverrideDolbyVisionCodecs()) {
      shaka.util.StreamUtils.overrideDolbyVisionCodecs(manifest.variants);
    }
    await shaka.util.StreamUtils.getDecodingInfosForVariants(
        manifest.variants, usePersistentLicenses, /* srcEquals= */ false,
        preferredKeySystems);

    let keySystem = null;
    if (drmEngine) {
      const drmInfo = drmEngine.getDrmInfo();
      if (drmInfo) {
        keySystem = drmInfo.keySystem;
      }
    }

    const StreamUtils = shaka.util.StreamUtils;

    manifest.variants = manifest.variants.filter((variant) => {
      const supported = StreamUtils.checkVariantSupported_(
          variant, keySystem, keySystemsMapping);
      // Filter out all unsupported variants.
      if (!supported) {
        shaka.log.debug('Dropping variant - not compatible with platform',
            StreamUtils.getVariantSummaryString_(variant));
      }
      return supported;
    });
  }


  /**
   * Maps Dolby Vision codecs to H.264 and H.265 equivalents as a workaround
   * to make Dolby Vision playback work on some platforms.
   *
   * Mapping is done according to the relevant Dolby documentation found here:
   * https://professionalsupport.dolby.com/s/article/How-to-signal-Dolby-Vision-in-MPEG-DASH?language=en_US
   * @param {!Array<!shaka.extern.Variant>} variants
   */
  static overrideDolbyVisionCodecs(variants) {
    /** @type {!Map<string, string>} */
    const codecMap = new Map()
        .set('dvav', 'avc3')
        .set('dva1', 'avc1')
        .set('dvhe', 'hev1')
        .set('dvh1', 'hvc1')
        .set('dvc1', 'vvc1')
        .set('dvi1', 'vvi1');

    /** @type {!Set<!shaka.extern.Stream>} */
    const streams = new Set();
    for (const variant of variants) {
      if (variant.video) {
        streams.add(variant.video);
      }
    }
    for (const video of streams) {
      for (const [dvCodec, replacement] of codecMap) {
        if (video.codecs.includes(dvCodec)) {
          video.codecs = video.codecs.replace(dvCodec, replacement);
          break;
        }
      }
    }
  }


  /**
   * @param {!shaka.extern.Variant} variant
   * @param {?string} keySystem
   * @param {!Object<string, string>} keySystemsMapping
   * @return {boolean}
   * @private
   */
  static checkVariantSupported_(variant, keySystem, keySystemsMapping) {
    const variantSupported = variant.decodingInfos.some((decodingInfo) => {
      if (!decodingInfo.supported) {
        return false;
      }
      if (keySystem) {
        const keySystemAccess = decodingInfo.keySystemAccess;
        if (keySystemAccess) {
          const currentKeySystem =
              keySystemsMapping[keySystemAccess.keySystem] ||
              keySystemAccess.keySystem;
          if (currentKeySystem != keySystem) {
            return false;
          }
        }
      }
      return true;
    });
    if (!variantSupported) {
      return false;
    }

    const device = shaka.device.DeviceFactory.getDevice();
    const isXboxOne = device.getDeviceName() === 'Xbox';
    const isFirefoxAndroid =
        device.getDeviceType() === shaka.device.IDevice.DeviceType.MOBILE &&
        device.getBrowserEngine() === shaka.device.IDevice.BrowserEngine.GECKO;

    // See: https://github.com/shaka-project/shaka-player/issues/3860
    const video = variant.video;
    const videoWidth = (video && video.width) || 0;
    const videoHeight = (video && video.height) || 0;

    // See: https://github.com/shaka-project/shaka-player/issues/3380
    // Note: it makes sense to drop early
    if (isXboxOne && video && (videoWidth > 1920 || videoHeight > 1080) &&
        (video.codecs.includes('avc1.') || video.codecs.includes('avc3.'))) {
      return false;
    }

    const videoDependencyStream = video && video.dependencyStream;
    if (videoDependencyStream &&
        !shaka.lcevc.Dec.isStreamSupported(videoDependencyStream)) {
      return false;
    }

    const audio = variant.audio;

    // See: https://github.com/shaka-project/shaka-player/issues/6111
    // It seems that Firefox Android reports that it supports
    // Opus + Widevine, but it is not actually supported.
    // It makes sense to drop early.
    if (isFirefoxAndroid && audio && audio.encrypted &&
        audio.codecs.toLowerCase().includes('opus')) {
      return false;
    }

    const audioDependencyStream = audio && audio.dependencyStream;
    if (audioDependencyStream) {
      return false;
    }

    return true;
  }


  /**
   * Queries mediaCapabilities for the decoding info for that decoding config,
   * and assigns it to the given variant.
   * If that query has been done before, instead return a cached result.
   * @param {!shaka.extern.Variant} variant
   * @param {!Array<!MediaDecodingConfiguration>} decodingConfigs
   * @private
   */
  static async getDecodingInfosForVariant_(variant, decodingConfigs) {
    /**
     * @param {?MediaCapabilitiesDecodingInfo} a
     * @param {!MediaCapabilitiesDecodingInfo} b
     * @return {!MediaCapabilitiesDecodingInfo}
     */
    const merge = (a, b) => {
      if (!a) {
        return b;
      } else {
        const res = shaka.util.ObjectUtils.shallowCloneObject(a);
        res.supported = a.supported && b.supported;
        res.powerEfficient = a.powerEfficient && b.powerEfficient;
        res.smooth = a.smooth && b.smooth;
        if (b.keySystemAccess && !res.keySystemAccess) {
          res.keySystemAccess = b.keySystemAccess;
        }
        return res;
      }
    };

    const StreamUtils = shaka.util.StreamUtils;
    /** @type {?MediaCapabilitiesDecodingInfo} */
    let finalResult = null;
    const promises = [];
    for (const decodingConfig of decodingConfigs) {
      const cacheKey =
          shaka.util.ObjectUtils.alphabeticalKeyOrderStringify(decodingConfig);

      const cache = StreamUtils.decodingConfigCache_;
      if (cache.has(cacheKey)) {
        shaka.log.v2('Using cached results of mediaCapabilities.decodingInfo',
            'for key', cacheKey);
        finalResult = merge(finalResult, cache.get(cacheKey));
      } else {
        // Do a final pass-over of the decoding config: if a given stream has
        // multiple codecs, that suggests that it switches between those codecs
        // at points of the go-through.
        // mediaCapabilities by itself will report "not supported" when you
        // put in multiple different codecs, so each has to be checked
        // individually. So check each and take the worst result, to determine
        // overall variant compatibility.
        promises.push(StreamUtils
            .checkEachDecodingConfigCombination_(decodingConfig).then((res) => {
              /** @type {?MediaCapabilitiesDecodingInfo} */
              let acc = null;
              for (const result of (res || [])) {
                acc = merge(acc, result);
              }
              if (acc) {
                cache.set(cacheKey, acc);
                finalResult = merge(finalResult, acc);
              }
            }));
      }
    }
    await Promise.all(promises);
    if (finalResult) {
      variant.decodingInfos.push(finalResult);
    }
  }

  /**
   * @param {!MediaDecodingConfiguration} decodingConfig
   * @return {!Promise<?Array<!MediaCapabilitiesDecodingInfo>>}
   * @private
   */
  static checkEachDecodingConfigCombination_(decodingConfig) {
    let videoCodecs = [''];
    if (decodingConfig.video) {
      videoCodecs = shaka.util.MimeUtils.getCodecs(
          decodingConfig.video.contentType).split(',');
    }
    let audioCodecs = [''];
    if (decodingConfig.audio) {
      audioCodecs = shaka.util.MimeUtils.getCodecs(
          decodingConfig.audio.contentType).split(',');
    }
    const promises = [];
    for (const videoCodec of videoCodecs) {
      for (const audioCodec of audioCodecs) {
        const copy = shaka.util.ObjectUtils.cloneObject(decodingConfig);
        if (decodingConfig.video) {
          const mimeType = shaka.util.MimeUtils.getBasicType(
              copy.video.contentType);
          copy.video.contentType = shaka.util.MimeUtils.getFullType(
              mimeType, videoCodec);
        }
        if (decodingConfig.audio) {
          const mimeType = shaka.util.MimeUtils.getBasicType(
              copy.audio.contentType);
          copy.audio.contentType = shaka.util.MimeUtils.getFullType(
              mimeType, audioCodec);
        }
        promises.push(new Promise((resolve, reject) => {
          // On some (Android) WebView environments, decodingInfo will
          // not resolve or reject, at least if RESOURCE_PROTECTED_MEDIA_ID
          // is not set.  This is a workaround for that issue.
          const TIMEOUT_FOR_DECODING_INFO_IN_SECONDS = 5;
          let promise;
          const device = shaka.device.DeviceFactory.getDevice();
          if (device.getDeviceType() ==
              shaka.device.IDevice.DeviceType.MOBILE) {
            promise = shaka.util.Functional.promiseWithTimeout(
                TIMEOUT_FOR_DECODING_INFO_IN_SECONDS,
                navigator.mediaCapabilities.decodingInfo(copy),
            );
          } else {
            promise = navigator.mediaCapabilities.decodingInfo(copy);
          }
          promise.then((res) => {
            resolve(res);
          }).catch(reject);
        }));
      }
    }
    return Promise.all(promises).catch((e) => {
      shaka.log.info('MediaCapabilities.decodingInfo() failed.',
          JSON.stringify(decodingConfig), e);
      return null;
    });
  }


  /**
   * Get the decodingInfo results of the variants via MediaCapabilities.
   * This should be called after the DrmEngine is created and configured, and
   * before DrmEngine sets the mediaKeys.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {boolean} usePersistentLicenses
   * @param {boolean} srcEquals
   * @param {!Array<string>} preferredKeySystems
   * @exportDoc
   */
  static async getDecodingInfosForVariants(variants, usePersistentLicenses,
      srcEquals, preferredKeySystems) {
    const gotDecodingInfo = variants.some((variant) =>
      variant.decodingInfos.length);
    if (gotDecodingInfo) {
      shaka.log.debug('Already got the variants\' decodingInfo.');
      return;
    }

    // Try to get preferred key systems first to avoid unneeded calls to CDM.
    for (const preferredKeySystem of preferredKeySystems) {
      let keySystemSatisfied = false;
      for (const variant of variants) {
        /** @type {!Array<!Array<!MediaDecodingConfiguration>>} */
        const decodingConfigs = shaka.util.StreamUtils.getDecodingConfigs_(
            variant, usePersistentLicenses, srcEquals)
            .filter((configs) => {
              // All configs in a batch will have the same keySystem.
              const config = configs[0];
              const keySystem = config.keySystemConfiguration &&
                config.keySystemConfiguration.keySystem;
              return keySystem === preferredKeySystem;
            });

        // The reason we are performing this await in a loop rather than
        // batching into a `promise.all` is performance related.
        // https://github.com/shaka-project/shaka-player/pull/4708#discussion_r1022581178
        for (const configs of decodingConfigs) {
          // eslint-disable-next-line no-await-in-loop
          await shaka.util.StreamUtils.getDecodingInfosForVariant_(
              variant, configs);
        }
        if (variant.decodingInfos.some((d) => d.supported)) {
          keySystemSatisfied = true;
        }
      } // for (const variant of variants)
      if (keySystemSatisfied) {
        // Return if any preferred key system is already satisfied.
        return;
      }
    } // for (const preferredKeySystem of preferredKeySystems)

    for (const variant of variants) {
      /** @type {!Array<!Array<!MediaDecodingConfiguration>>} */
      const decodingConfigs = shaka.util.StreamUtils.getDecodingConfigs_(
          variant, usePersistentLicenses, srcEquals)
          .filter((configs) => {
            // All configs in a batch will have the same keySystem.
            const config = configs[0];
            const keySystem = config.keySystemConfiguration &&
              config.keySystemConfiguration.keySystem;
            // Avoid checking preferred systems twice.
            return !keySystem || !preferredKeySystems.includes(keySystem);
          });

      // The reason we are performing this await in a loop rather than
      // batching into a `promise.all` is performance related.
      // https://github.com/shaka-project/shaka-player/pull/4708#discussion_r1022581178
      for (const configs of decodingConfigs) {
        // eslint-disable-next-line no-await-in-loop
        await shaka.util.StreamUtils.getDecodingInfosForVariant_(
            variant, configs);
      }
    }
  }


  /**
   * Generate a batch of MediaDecodingConfiguration objects to get the
   * decodingInfo results for each variant.
   * Each batch shares the same DRM information, and represents the various
   * fullMimeType combinations of the streams.
   * @param {!shaka.extern.Variant} variant
   * @param {boolean} usePersistentLicenses
   * @param {boolean} srcEquals
   * @return {!Array<!Array<!MediaDecodingConfiguration>>}
   * @private
   */
  static getDecodingConfigs_(variant, usePersistentLicenses, srcEquals) {
    const audio = variant.audio;
    const video = variant.video;

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const MimeUtils = shaka.util.MimeUtils;
    const StreamUtils = shaka.util.StreamUtils;

    const videoConfigs = [];
    const audioConfigs = [];
    if (video) {
      for (const fullMimeType of video.fullMimeTypes) {
        let videoCodecs = MimeUtils.getCodecs(fullMimeType);

        // For multiplexed streams with audio+video codecs, the config should
        // have AudioConfiguration and VideoConfiguration.
        // We ignore the multiplexed audio when there is normal audio also.
        if (videoCodecs.includes(',') && !audio) {
          const allCodecs = videoCodecs.split(',');
          const baseMimeType = MimeUtils.getBasicType(fullMimeType);

          videoCodecs = ManifestParserUtils.guessCodecs(
              ContentType.VIDEO, allCodecs);

          let audioCodecs = ManifestParserUtils.guessCodecs(
              ContentType.AUDIO, allCodecs);
          audioCodecs = StreamUtils.getCorrectAudioCodecs(
              audioCodecs, baseMimeType);

          const audioFullType = MimeUtils.getFullOrConvertedType(
              baseMimeType, audioCodecs, ContentType.AUDIO);

          audioConfigs.push({
            contentType: audioFullType,
            channels: 2,
            bitrate: variant.bandwidth || 1,
            samplerate: 1,
            spatialRendering: false,
          });
        }

        videoCodecs = StreamUtils.getCorrectVideoCodecs(videoCodecs);
        const fullType = MimeUtils.getFullOrConvertedType(
            MimeUtils.getBasicType(fullMimeType), videoCodecs,
            ContentType.VIDEO);

        // VideoConfiguration
        const videoConfig = {
          contentType: fullType,

          // NOTE: Some decoders strictly check the width and height fields and
          // won't decode smaller than 64x64.  So if we don't have this info (as
          // is the case in some of our simpler tests), assume a 64x64
          // resolution to fill in this required field for MediaCapabilities.
          //
          // This became an issue specifically on Firefox on M1 Macs.
          width: video.width || 64,
          height: video.height || 64,

          bitrate: video.bandwidth || variant.bandwidth || 1,
          // framerate must be greater than 0, otherwise the config is invalid.
          framerate: video.frameRate || 30,
        };
        if (video.hdr) {
          // We assume that SDR uses by default srgb, so don't set it.
          switch (video.hdr) {
            case 'PQ':
              videoConfig.transferFunction = 'pq';
              break;
            case 'HLG':
              videoConfig.transferFunction = 'hlg';
              break;
          }
        }
        if (video.colorGamut) {
          videoConfig.colorGamut = video.colorGamut;
        }
        videoConfigs.push(videoConfig);
      }
    }
    if (audio) {
      for (const fullMimeType of audio.fullMimeTypes) {
        const baseMimeType = MimeUtils.getBasicType(fullMimeType);
        const codecs = StreamUtils.getCorrectAudioCodecs(
            MimeUtils.getCodecs(fullMimeType), baseMimeType);
        const fullType = MimeUtils.getFullOrConvertedType(
            baseMimeType, codecs, ContentType.AUDIO);

        // AudioConfiguration
        audioConfigs.push({
          contentType: fullType,
          channels: audio.channelsCount || 2,
          bitrate: audio.bandwidth || variant.bandwidth || 1,
          samplerate: audio.audioSamplingRate || 1,
          spatialRendering: audio.spatialAudio,
        });
      }
    }

    // Generate each combination of video and audio config as a separate
    // MediaDecodingConfiguration, inside the main "batch".
    /** @type {!Array<!MediaDecodingConfiguration>} */
    const mediaDecodingConfigBatch = [];
    if (videoConfigs.length == 0) {
      videoConfigs.push(null);
    }
    if (audioConfigs.length == 0) {
      audioConfigs.push(null);
    }
    for (const videoConfig of videoConfigs) {
      for (const audioConfig of audioConfigs) {
        /** @type {!MediaDecodingConfiguration} */
        const mediaDecodingConfig = {
          type: srcEquals ? 'file' : 'media-source',
        };
        if (videoConfig) {
          mediaDecodingConfig.video = videoConfig;
        }
        if (audioConfig) {
          mediaDecodingConfig.audio = audioConfig;
        }
        mediaDecodingConfigBatch.push(mediaDecodingConfig);
      }
    }

    const videoDrmInfos = variant.video ? variant.video.drmInfos : [];
    const audioDrmInfos = variant.audio ? variant.audio.drmInfos : [];
    const allDrmInfos = videoDrmInfos.concat(audioDrmInfos);

    // Return a list containing the mediaDecodingConfig for unencrypted variant.
    if (!allDrmInfos.length) {
      return [mediaDecodingConfigBatch];
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
      const drmInfos = drmInfoByKeySystems.get(keySystem);

      // Get all the robustness info so that we can avoid using nested
      // loops when we just need the robustness.
      const drmInfosByRobustness = new Map();
      for (const info of drmInfos) {
        const keyName = `${info.videoRobustness},${info.audioRobustness}`;
        if (!drmInfosByRobustness.get(keyName)) {
          drmInfosByRobustness.set(keyName, []);
        }
        drmInfosByRobustness.get(keyName).push(info);
      }

      for (const drmInfosRobustness of drmInfosByRobustness.values()) {
        const modifiedMediaDecodingConfigBatch = [];
        for (const base of mediaDecodingConfigBatch) {
          // Create a copy of the mediaDecodingConfig.
          const config = /** @type {!MediaDecodingConfiguration} */
              (Object.assign({}, base));


          /** @type {!MediaCapabilitiesKeySystemConfiguration} */
          const keySystemConfig = {
            keySystem: keySystem,
            initDataType: 'cenc',
            persistentState: persistentState,
            distinctiveIdentifier: 'optional',
            sessionTypes: sessionTypes,
          };

          for (const info of drmInfosRobustness) {
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
                if (info.encryptionScheme) {
                  keySystemConfig.audio.encryptionScheme =
                      info.encryptionScheme;
                }
              } else {
                if (info.encryptionScheme) {
                  keySystemConfig.audio.encryptionScheme =
                      keySystemConfig.audio.encryptionScheme ||
                      info.encryptionScheme;
                }
                keySystemConfig.audio.robustness =
                    keySystemConfig.audio.robustness ||
                    info.audioRobustness;
              }
              // See: https://github.com/shaka-project/shaka-player/issues/4659
              if (keySystemConfig.audio.robustness == '') {
                delete keySystemConfig.audio.robustness;
              }
            }

            if (video) {
              if (!keySystemConfig.video) {
                // KeySystemTrackConfiguration
                keySystemConfig.video = {
                  robustness: info.videoRobustness,
                };
                if (info.encryptionScheme) {
                  keySystemConfig.video.encryptionScheme =
                      info.encryptionScheme;
                }
              } else {
                if (info.encryptionScheme) {
                  keySystemConfig.video.encryptionScheme =
                      keySystemConfig.video.encryptionScheme ||
                      info.encryptionScheme;
                }
                keySystemConfig.video.robustness =
                    keySystemConfig.video.robustness ||
                    info.videoRobustness;
              }
              // See: https://github.com/shaka-project/shaka-player/issues/4659
              if (keySystemConfig.video.robustness == '') {
                delete keySystemConfig.video.robustness;
              }
            }
          }
          config.keySystemConfiguration = keySystemConfig;
          modifiedMediaDecodingConfigBatch.push(config);
        }
        configs.push(modifiedMediaDecodingConfigBatch);
      }
    }
    return configs;
  }


  /**
   * Generates the correct audio codec for MediaDecodingConfiguration and
   * for MediaSource.isTypeSupported.
   * @param {string} codecs
   * @param {string} mimeType
   * @return {string}
   */
  static getCorrectAudioCodecs(codecs, mimeType) {
    // According to RFC 6381 section 3.3, 'fLaC' is actually the correct
    // codec string. We still need to map it to 'flac', as some browsers
    // currently don't support 'fLaC', while 'flac' is supported by most
    // major browsers.
    // See https://bugs.chromium.org/p/chromium/issues/detail?id=1422728
    const device = shaka.device.DeviceFactory.getDevice();
    const webkit = shaka.device.IDevice.BrowserEngine.WEBKIT;
    if (codecs.toLowerCase() == 'flac') {
      if (device.getBrowserEngine() != webkit) {
        return 'flac';
      } else {
        return 'fLaC';
      }
    }

    // The same is true for 'Opus'.
    if (codecs.toLowerCase() === 'opus') {
      if (device.getBrowserEngine() != webkit) {
        return 'opus';
      } else {
        if (shaka.util.MimeUtils.getContainerType(mimeType) == 'mp4') {
          return 'Opus';
        } else {
          return 'opus';
        }
      }
    }

    if (codecs.toLowerCase() == 'ac-3' && device.requiresEC3InitSegments()) {
      return 'ec-3';
    }

    return codecs;
  }


  /**
   * Generates the correct video codec for MediaDecodingConfiguration and
   * for MediaSource.isTypeSupported.
   * @param {string} codec
   * @return {string}
   */
  static getCorrectVideoCodecs(codec) {
    if (codec.includes('avc1')) {
      // Convert avc1 codec string from RFC-4281 to RFC-6381 for
      // MediaSource.isTypeSupported
      // Example, convert avc1.66.30 to avc1.42001e (0x42 == 66 and 0x1e == 30)
      const avcData = codec.split('.');
      if (avcData.length == 3) {
        let result = avcData.shift() + '.';
        result += parseInt(avcData.shift(), 10).toString(16);
        result +=
            ('000' + parseInt(avcData.shift(), 10).toString(16)).slice(-4);
        return result;
      }
    } else if (codec == 'vp9') {
      // MediaCapabilities supports 'vp09...' codecs, but not 'vp9'. Translate
      // vp9 codec strings into 'vp09...', to allow such content to play with
      // mediaCapabilities enabled.
      // This means profile 0, level 4.1, 8-bit color.  This supports 1080p @
      // 60Hz.  See https://en.wikipedia.org/wiki/VP9#Levels
      //
      // If we don't have more detailed codec info, assume this profile and
      // level because it's high enough to likely accommodate the parameters we
      // do have, such as width and height.  If an implementation is checking
      // the profile and level very strictly, we want older VP9 content to
      // still work to some degree.  But we don't want to set a level so high
      // that it is rejected by a hardware decoder that can't handle the
      // maximum requirements of the level.
      //
      // This became an issue specifically on Firefox on M1 Macs.
      return 'vp09.00.41.08';
    }
    return codec;
  }


  /**
   * Alters the given Manifest to filter out any streams incompatible with the
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
          shaka.log.debug('Dropping variant - not compatible with active audio',
              'active audio',
              StreamUtils.getStreamSummaryString_(currentVariant.audio),
              'variant.audio',
              StreamUtils.getStreamSummaryString_(audio));
          return false;
        }
      }

      if (video && currentVariant && currentVariant.video) {
        if (!StreamUtils.areStreamsCompatible_(video, currentVariant.video)) {
          shaka.log.debug('Dropping variant - not compatible with active video',
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
  static async filterImageStreams_(manifest) {
    const imageStreams = [];
    for (const stream of manifest.imageStreams) {
      let mimeType = stream.mimeType;
      if (mimeType == 'application/mp4' && stream.codecs == 'mjpg') {
        mimeType = 'image/jpg';
      }
      if (!shaka.util.StreamUtils.supportedImageMimeTypes_.has(mimeType)) {
        const minImage = shaka.util.StreamUtils.minImage_.get(mimeType);
        if (minImage) {
          // eslint-disable-next-line no-await-in-loop
          const res = await shaka.util.StreamUtils.isImageSupported_(minImage);
          shaka.util.StreamUtils.supportedImageMimeTypes_.set(mimeType, res);
        } else {
          shaka.util.StreamUtils.supportedImageMimeTypes_.set(mimeType, false);
        }
      }

      const keep =
          shaka.util.StreamUtils.supportedImageMimeTypes_.get(mimeType);

      if (!keep) {
        shaka.log.debug('Dropping image stream. Is not supported by the ' +
                        'platform.', stream);
      } else {
        imageStreams.push(stream);
      }
    }
    manifest.imageStreams = imageStreams;
  }

  /**
   * @param {string} minImage
   * @return {!Promise<boolean>}
   * @private
   */
  static isImageSupported_(minImage) {
    return new Promise((resolve) => {
      const imageElement = /** @type {HTMLImageElement} */(new Image());
      imageElement.src = minImage;
      if ('decode' in imageElement) {
        imageElement.decode().then(() => {
          resolve(true);
        }).catch(() => {
          resolve(false);
        });
      } else {
        imageElement.onload = imageElement.onerror = () => {
          resolve(imageElement.height === 2);
        };
      }
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
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    /** @type {?shaka.extern.Stream} */
    const audio = variant.audio;
    /** @type {?shaka.extern.Stream} */
    const video = variant.video;

    /** @type {?string} */
    const audioMimeType = audio ? audio.mimeType : null;
    /** @type {?string} */
    const videoMimeType = video ? video.mimeType : null;

    /** @type {?string} */
    const audioCodec = audio ? audio.codecs : null;
    /** @type {?string} */
    const videoCodec = video ? video.codecs : null;

    /** @type {?string} */
    const audioGroupId = audio ? audio.groupId : null;

    /** @type {!Array<string>} */
    const mimeTypes = [];
    if (video) {
      mimeTypes.push(video.mimeType);
    }
    if (audio) {
      mimeTypes.push(audio.mimeType);
    }
    /** @type {?string} */
    const mimeType = mimeTypes[0] || null;

    /** @type {!Array<string>} */
    const kinds = [];
    if (audio) {
      kinds.push(audio.kind);
    }
    if (video) {
      kinds.push(video.kind);
    }
    /** @type {?string} */
    const kind = kinds[0] || null;

    /** @type {!Set<string>} */
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
      videoLabel: null,
      kind: kind,
      width: null,
      height: null,
      frameRate: null,
      pixelAspectRatio: null,
      hdr: null,
      colorGamut: null,
      videoLayout: null,
      mimeType: mimeType,
      audioMimeType: audioMimeType,
      videoMimeType: videoMimeType,
      codecs: '',
      audioCodec: audioCodec,
      videoCodec: videoCodec,
      primary: variant.primary,
      roles: Array.from(roles),
      audioRoles: null,
      videoRoles: null,
      forced: false,
      videoId: null,
      audioId: null,
      audioGroupId: audioGroupId,
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
      accessibilityPurpose: null,
      originalLanguage: null,
    };

    if (video) {
      track.videoId = video.id;
      track.originalVideoId = video.originalId;
      track.width = video.width || null;
      track.height = video.height || null;
      track.frameRate = video.frameRate || null;
      track.pixelAspectRatio = video.pixelAspectRatio || null;
      track.videoBandwidth = video.bandwidth || null;
      track.hdr = video.hdr || null;
      track.colorGamut = video.colorGamut || null;
      track.videoLayout = video.videoLayout || null;
      track.videoRoles = video.roles;
      track.videoLabel = video.label;

      const dependencyStream = video.dependencyStream;
      if (dependencyStream) {
        track.width = dependencyStream.width || track.width;
        track.height = dependencyStream.height || track.height;
        track.videoCodec = dependencyStream.codecs || track.videoCodec;
        if (track.videoBandwidth && dependencyStream.bandwidth) {
          track.videoBandwidth += dependencyStream.bandwidth;
        }
      }

      if (videoCodec.includes(',')) {
        track.channelsCount = video.channelsCount;
        track.audioSamplingRate = video.audioSamplingRate;
        track.spatialAudio = video.spatialAudio;
        track.originalLanguage = video.originalLanguage;
        track.audioMimeType = videoMimeType;
        const allCodecs = videoCodec.split(',');
        try {
          track.videoCodec = ManifestParserUtils.guessCodecs(
              ContentType.VIDEO, allCodecs);
          track.audioCodec = ManifestParserUtils.guessCodecs(
              ContentType.AUDIO, allCodecs);
        } catch (e) {
          // Ignore this error.
        }
      }
    }

    if (audio) {
      track.audioId = audio.id;
      track.originalAudioId = audio.originalId;
      track.channelsCount = audio.channelsCount;
      track.audioSamplingRate = audio.audioSamplingRate;
      track.audioBandwidth = audio.bandwidth || null;
      track.spatialAudio = audio.spatialAudio;
      track.label = audio.label;
      track.audioRoles = audio.roles;
      track.accessibilityPurpose = audio.accessibilityPurpose;
      track.originalLanguage = audio.originalLanguage;

      const dependencyStream = audio.dependencyStream;
      if (dependencyStream) {
        track.audioCodec = dependencyStream.codecs || track.audioCodec;
        if (track.audioBandwidth && dependencyStream.bandwidth) {
          track.audioBandwidth += dependencyStream.bandwidth;
        }
      }
    }

    /** @type {!Array<string>} */
    const codecs = [];
    if (track.videoCodec) {
      codecs.push(track.videoCodec);
    }
    if (track.audioCodec) {
      codecs.push(track.audioCodec);
    }
    track.codecs = codecs.join(', ');

    return track;
  }


  /**
   * @param {shaka.extern.Stream} stream
   * @return {shaka.extern.TextTrack}
   */
  static textStreamToTrack(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    /** @type {shaka.extern.TextTrack} */
    const track = {
      id: stream.id,
      active: false,
      type: ContentType.TEXT,
      bandwidth: stream.bandwidth || 0,
      language: stream.language,
      label: stream.label,
      kind: stream.kind || null,
      mimeType: stream.mimeType,
      codecs: stream.codecs || null,
      primary: stream.primary,
      roles: stream.roles,
      accessibilityPurpose: stream.accessibilityPurpose,
      forced: stream.forced,
      originalTextId: stream.originalId,
      originalLanguage: stream.originalLanguage,
    };

    return track;
  }


  /**
   * @param {shaka.extern.Stream} stream
   * @return {shaka.extern.ImageTrack}
   */
  static imageStreamToTrack(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    let width = stream.width || null;
    let height = stream.height || null;

    // The stream width and height represent the size of the entire thumbnail
    // sheet, so divide by the layout.
    let reference = null;
    // Note: segmentIndex is built by default for HLS, but not for DASH, but
    // in DASH this information comes at the stream level and not at the
    // segment level.
    if (stream.segmentIndex) {
      reference = stream.segmentIndex.earliestReference();
    }
    let layout = stream.tilesLayout;
    if (reference) {
      layout = reference.getTilesLayout() || layout;
    }
    if (layout && width != null) {
      width /= Number(layout.split('x')[0]);
    }
    if (layout && height != null) {
      height /= Number(layout.split('x')[1]);
    }
    // TODO: What happens if there are multiple grids, with different
    // layout sizes, inside this image stream?

    /** @type {shaka.extern.ImageTrack} */
    const track = {
      id: stream.id,
      type: ContentType.IMAGE,
      bandwidth: stream.bandwidth || 0,
      width,
      height,
      mimeType: stream.mimeType,
      codecs: stream.codecs || null,
      tilesLayout: layout || null,
      originalImageId: stream.originalId,
    };

    return track;
  }


  /**
   * Generate and return an ID for this track, since the ID field is optional.
   *
   * @param {TextTrack|AudioTrack|VideoTrack} html5Track
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
   * @return {shaka.extern.TextTrack}
   */
  static html5TextTrackToTrack(textTrack) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    /** @type {shaka.extern.TextTrack} */
    const track = {
      id: shaka.util.StreamUtils.html5TrackId(textTrack),
      active: textTrack.mode != 'disabled',
      type: ContentType.TEXT,
      bandwidth: 0,
      language: shaka.util.LanguageUtils.normalize(textTrack.language || 'und'),
      label: textTrack.label,
      kind: textTrack.kind,
      mimeType: null,
      codecs: null,
      primary: false,
      roles: [],
      accessibilityPurpose: null,
      forced: textTrack.kind == 'forced',
      originalTextId: textTrack.id,
      originalLanguage: textTrack.language,
    };
    if (textTrack.kind == 'captions') {
      // See: https://github.com/shaka-project/shaka-player/issues/6233
      track.mimeType = 'unknown';
    }
    if (textTrack.kind == 'subtitles') {
      track.mimeType = 'text/vtt';
    }
    if (textTrack.kind) {
      track.roles = [textTrack.kind];
    }

    return track;
  }


  /**
   * @param {AudioTrack} audioTrack
   * @return {shaka.extern.AudioTrack}
   */
  static html5AudioTrackToTrack(audioTrack) {
    const language = audioTrack.language;

    /** @type {shaka.extern.AudioTrack} */
    const track = {
      active: audioTrack.enabled,
      language: shaka.util.LanguageUtils.normalize(language || 'und'),
      label: audioTrack.label,
      mimeType: null,
      codecs: null,
      primary: audioTrack.kind == 'main',
      roles: [],
      accessibilityPurpose: null,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      originalLanguage: language,
    };

    if (audioTrack.kind) {
      track.roles.push(audioTrack.kind);
    }

    if (audioTrack.configuration) {
      if (audioTrack.configuration.codec) {
        track.codecs = audioTrack.configuration.codec;
      }
      if (audioTrack.configuration.sampleRate) {
        track.audioSamplingRate = audioTrack.configuration.sampleRate;
      }
      if (audioTrack.configuration.numberOfChannels) {
        track.channelsCount = audioTrack.configuration.numberOfChannels;
      }
    }

    return track;
  }


  /**
   * @param {?AudioTrack} audioTrack
   * @param {?VideoTrack} videoTrack
   * @return {shaka.extern.Track}
   */
  static html5TrackToShakaTrack(audioTrack, videoTrack) {
    goog.asserts.assert(audioTrack || videoTrack,
        'There must be at least audioTrack or videoTrack.');

    const LanguageUtils = shaka.util.LanguageUtils;

    const language = audioTrack ? audioTrack.language : null;

    /** @type {shaka.extern.Track} */
    const track = {
      id: shaka.util.StreamUtils.html5TrackId(audioTrack || videoTrack),
      active: audioTrack ? audioTrack.enabled : videoTrack.selected,
      type: 'variant',
      bandwidth: 0,
      language: LanguageUtils.normalize(language || 'und'),
      label: audioTrack ? audioTrack.label : null,
      videoLabel: null,
      kind: audioTrack ? audioTrack.kind : null,
      width: null,
      height: null,
      frameRate: null,
      pixelAspectRatio: null,
      hdr: null,
      colorGamut: null,
      videoLayout: null,
      mimeType: null,
      audioMimeType: null,
      videoMimeType: null,
      codecs: null,
      audioCodec: null,
      videoCodec: null,
      primary: audioTrack ? audioTrack.kind == 'main' : false,
      roles: [],
      forced: false,
      audioRoles: null,
      videoRoles: null,
      videoId: null,
      audioId: null,
      audioGroupId: null,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      tilesLayout: null,
      audioBandwidth: null,
      videoBandwidth: null,
      originalVideoId: videoTrack ? videoTrack.id : null,
      originalAudioId: audioTrack ? audioTrack.id : null,
      originalTextId: null,
      originalImageId: null,
      accessibilityPurpose: null,
      originalLanguage: language,
    };

    if (audioTrack && audioTrack.kind) {
      track.roles = [audioTrack.kind];
      track.audioRoles = [audioTrack.kind];
    }

    if (audioTrack && audioTrack.configuration) {
      if (audioTrack.configuration.codec) {
        track.audioCodec = audioTrack.configuration.codec;
        track.codecs = track.audioCodec;
      }
      if (audioTrack.configuration.bitrate) {
        track.audioBandwidth = audioTrack.configuration.bitrate;
        track.bandwidth += track.audioBandwidth;
      }
      if (audioTrack.configuration.sampleRate) {
        track.audioSamplingRate = audioTrack.configuration.sampleRate;
      }
      if (audioTrack.configuration.numberOfChannels) {
        track.channelsCount = audioTrack.configuration.numberOfChannels;
      }
    }

    if (videoTrack && videoTrack.configuration) {
      if (videoTrack.configuration.codec) {
        track.videoCodec = videoTrack.configuration.codec;
        if (track.codecs) {
          track.codecs += ',' + track.videoCodec;
        } else {
          track.codecs = track.videoCodec;
        }
      }
      if (videoTrack.configuration.bitrate) {
        track.videoBandwidth = videoTrack.configuration.bitrate;
        track.bandwidth += track.videoBandwidth;
      }
      if (videoTrack.configuration.framerate) {
        track.frameRate = videoTrack.configuration.framerate;
      }
      if (videoTrack.configuration.width) {
        track.width = videoTrack.configuration.width;
      }
      if (videoTrack.configuration.height) {
        track.height = videoTrack.configuration.height;
      }
      if (videoTrack.configuration.colorSpace &&
          videoTrack.configuration.colorSpace.transfer) {
        switch (videoTrack.configuration.colorSpace.transfer) {
          case 'pq':
            track.hdr = 'PQ';
            break;
          case 'hlg':
            track.hdr = 'HLG';
            break;
          case 'bt709':
            track.hdr = 'SDR';
            break;
        }
      }
    }

    return track;
  }


  /**
   * Determines if the given variant is playable.
   * @param {!shaka.extern.Variant} variant
   * @return {boolean}
   */
  static isPlayable(variant) {
    return variant.allowedByApplication &&
        variant.allowedByKeySystem &&
        variant.disabledUntilTime == 0;
  }


  /**
   * Filters out unplayable variants.
   * @param {!Array<!shaka.extern.Variant>} variants
   * @return {!Array<!shaka.extern.Variant>}
   */
  static getPlayableVariants(variants) {
    return variants.filter((variant) => {
      return shaka.util.StreamUtils.isPlayable(variant);
    });
  }


  /**
   * Chooses streams according to the given config.
   * Works both for Stream and Track types due to their similarities.
   *
   * @param {!Array<!shaka.extern.Stream>|!Array<!shaka.extern.Track>} streams
   * @param {string} preferredLanguage
   * @param {string} preferredRole
   * @param {boolean} preferredForced
   * @return {!Array<!shaka.extern.Stream>|!Array<!shaka.extern.Track>}
   */
  static filterStreamsByLanguageAndRole(
      streams, preferredLanguage, preferredRole, preferredForced) {
    const LanguageUtils = shaka.util.LanguageUtils;

    /** @type {!Array<!shaka.extern.Stream>|!Array<!shaka.extern.Track>} */
    let chosen = streams;

    // Start with the set of primary streams.
    /** @type {!Array<!shaka.extern.Stream>|!Array<!shaka.extern.Track>} */
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
      const roleMatches = shaka.util.StreamUtils.filterStreamsByRole_(
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
    return shaka.util.StreamUtils.filterStreamsByRole_(chosen, allRoles[0]);
  }


  /**
   * Filter Streams by role.
   * Works both for Stream and Track types due to their similarities.
   *
   * @param {!Array<!shaka.extern.Stream>|!Array<!shaka.extern.Track>} streams
   * @param {string} preferredRole
   * @return {!Array<!shaka.extern.Stream>|!Array<!shaka.extern.Track>}
   * @private
   */
  static filterStreamsByRole_(streams, preferredRole) {
    return streams.filter((stream) => {
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
   * @return {!Array<shaka.extern.Stream>}
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
   * Indicates if some of the variant's streams are fastSwitching.
   *
   * @param {shaka.extern.Variant} variant
   * @return {boolean}
   */
  static isFastSwitching(variant) {
    if (variant.audio && variant.audio.fastSwitching) {
      return true;
    }
    if (variant.video && variant.video.fastSwitching) {
      return true;
    }
    return false;
  }


  /**
   * Set the best iframe stream to the original stream.
   *
   * @param {!shaka.extern.Stream} stream
   * @param {!Array<!shaka.extern.Stream>} iFrameStreams
   */
  static setBetterIFrameStream(stream, iFrameStreams) {
    if (!iFrameStreams.length) {
      return;
    }
    const validStreams = iFrameStreams.filter((iFrameStream) =>
      shaka.util.MimeUtils.getNormalizedCodec(stream.codecs) ==
      shaka.util.MimeUtils.getNormalizedCodec(iFrameStream.codecs))
        .sort((a, b) => {
          if (!a.bandwidth || !b.bandwidth || a.bandwidth == b.bandwidth) {
            return (a.width || 0) - (b.width || 0);
          }
          return a.bandwidth - b.bandwidth;
        });
    stream.trickModeVideo = validStreams[0];
    if (validStreams.length > 1) {
      const sameResolutionStream = validStreams.find((iFrameStream) =>
        stream.width == iFrameStream.width &&
        stream.height == iFrameStream.height);
      if (sameResolutionStream) {
        stream.trickModeVideo = sameResolutionStream;
      }
    }
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


  /**
   * Clears underlying decoding config cache.
   */
  static clearDecodingConfigCache() {
    shaka.util.StreamUtils.decodingConfigCache_.clear();
  }


  /**
   * Check if we should show text on screen automatically.
   *
   * @param {?shaka.extern.Stream} audioStream
   * @param {shaka.extern.Stream} textStream
   * @param {!shaka.extern.PlayerConfiguration} config
   * @return {boolean}
   */
  static shouldInitiallyShowText(audioStream, textStream, config) {
    const AutoShowText = shaka.config.AutoShowText;

    if (config.autoShowText == AutoShowText.NEVER) {
      return false;
    }
    if (config.autoShowText == AutoShowText.ALWAYS) {
      return true;
    }

    const LanguageUtils = shaka.util.LanguageUtils;

    /** @type {string} */
    const preferredTextLocale =
        LanguageUtils.normalize(config.preferredTextLanguage);
    /** @type {string} */
    const textLocale = LanguageUtils.normalize(textStream.language);

    if (config.autoShowText == AutoShowText.IF_PREFERRED_TEXT_LANGUAGE) {
      // Only the text language match matters.
      return LanguageUtils.areLanguageCompatible(
          textLocale,
          preferredTextLocale);
    }

    if (config.autoShowText == AutoShowText.IF_SUBTITLES_MAY_BE_NEEDED) {
      if (!audioStream) {
        return false;
      }
      /* The text should automatically be shown if the text is
       * language-compatible with the user's text language preference, but not
       * compatible with the audio.  These are cases where we deduce that
       * subtitles may be needed.
       *
       * For example:
       *   preferred | chosen | chosen |
       *   text      | text   | audio  | show
       *   -----------------------------------
       *   en-CA     | en     | jp     | true
       *   en        | en-US  | fr     | true
       *   fr-CA     | en-US  | jp     | false
       *   en-CA     | en-US  | en-US  | false
       *
       */
      /** @type {string} */
      const audioLocale = LanguageUtils.normalize(audioStream.language);

      return (
        LanguageUtils.areLanguageCompatible(textLocale, preferredTextLocale) &&
        !LanguageUtils.areLanguageCompatible(audioLocale, textLocale));
    }

    shaka.log.alwaysWarn('Invalid autoShowText setting!');
    return false;
  }

  /**
   * @param {!Array<string>} mimeTypes
   * @return {!shaka.extern.Variant}
   */
  static createEmptyVariant(mimeTypes) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    /** @type {shaka.extern.Variant} */
    const variant = {
      id: 0,
      language: 'und',
      disabledUntilTime: 0,
      primary: false,
      audio: null,
      video: null,
      bandwidth: 100,
      allowedByApplication: true,
      allowedByKeySystem: true,
      decodingInfos: [],
    };
    for (const mimeType of mimeTypes) {
      const stream = {
        id: 0,
        originalId: null,
        groupId: null,
        createSegmentIndex: () => Promise.resolve(),
        segmentIndex: null,
        mimeType: mimeType ? shaka.util.MimeUtils.getBasicType(mimeType) : '',
        codecs: mimeType ? shaka.util.MimeUtils.getCodecs(mimeType) : '',
        encrypted: true,
        drmInfos: [],
        keyIds: new Set(),
        language: 'und',
        originalLanguage: null,
        label: null,
        type: ContentType.VIDEO,
        primary: false,
        trickModeVideo: null,
        dependencyStream: null,
        emsgSchemeIdUris: null,
        roles: [],
        forced: false,
        channelsCount: null,
        audioSamplingRate: null,
        spatialAudio: false,
        closedCaptions: null,
        accessibilityPurpose: null,
        external: false,
        fastSwitching: false,
        fullMimeTypes: new Set(),
        isAudioMuxedInVideo: false,
        baseOriginalId: null,
      };
      stream.fullMimeTypes.add(shaka.util.MimeUtils.getFullType(
          stream.mimeType, stream.codecs));
      if (mimeType.startsWith('audio/')) {
        stream.type = ContentType.AUDIO;
        variant.audio = stream;
      } else {
        variant.video = stream;
      }
    }

    return variant;
  }
};


/**
 * A cache of results from mediaCapabilities.decodingInfo, indexed by the
 * (stringified) decodingConfig.
 *
 * @type {Map<string, !MediaCapabilitiesDecodingInfo>}
 * @private
 */
shaka.util.StreamUtils.decodingConfigCache_ = new Map();


/** @private {number} */
shaka.util.StreamUtils.nextTrackId_ = 0;

/**
 * @enum {string}
 */
shaka.util.StreamUtils.DecodingAttributes = {
  SMOOTH: 'smooth',
  POWER: 'powerEfficient',
};

/**
 * @private {!Map<string, boolean>}
 */
shaka.util.StreamUtils.supportedImageMimeTypes_ = new Map()
    .set('image/svg+xml', true)
    .set('image/png', true)
    .set('image/jpeg', true)
    .set('image/jpg', true);

/**
 * @const {string}
 * @private
 */
// cspell: disable-next-line
shaka.util.StreamUtils.minWebPImage_ = 'data:image/webp;base64,UklGRjoAAABXRU' +
    'JQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwY' +
    'AAA';

/**
 * @const {string}
 * @private
 */
// cspell: disable-next-line
shaka.util.StreamUtils.minAvifImage_ = 'data:image/avif;base64,AAAAIGZ0eXBhdm' +
    'lmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljd' +
    'AAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEA' +
    'AAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAA' +
    'AamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAA' +
    'xhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAA' +
    'CVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';

/**
 * @const {!Map<string, string>}
 * @private
 */
shaka.util.StreamUtils.minImage_ = new Map()
    .set('image/webp', shaka.util.StreamUtils.minWebPImage_)
    .set('image/avif', shaka.util.StreamUtils.minAvifImage_);
