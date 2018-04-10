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

goog.provide('shaka.util.StreamUtils');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');


/**
 * @namespace shaka.util.StreamUtils
 * @summary A set of utility functions for dealing with Streams and Manifests.
 */


/**
 * @param {shakaExtern.Variant} variant
 * @param {shakaExtern.Restrictions} restrictions
 *   Configured restrictions from the user.
 * @param {{width: number, height: number}} maxHwRes
 *   The maximum resolution the hardware can handle.
 *   This is applied separately from user restrictions because the setting
 *   should not be easily replaced by the user's configuration.
 * @return {boolean}
 */
shaka.util.StreamUtils.meetsRestrictions = function(
    variant, restrictions, maxHwRes) {
  let video = variant.video;
  if (video) {
    if (video.width < restrictions.minWidth ||
        video.width > restrictions.maxWidth || video.width > maxHwRes.width ||
        video.height < restrictions.minHeight ||
        video.height > restrictions.maxHeight ||
        video.height > maxHwRes.height ||
        (video.width * video.height) < restrictions.minPixels ||
        (video.width * video.height) > restrictions.maxPixels) {
      return false;
    }
  }

  if (variant.bandwidth < restrictions.minBandwidth ||
      variant.bandwidth > restrictions.maxBandwidth) {
    return false;
  }

  return true;
};


/**
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.Restrictions} restrictions
 * @param {{width: number, height: number}} maxHwRes
 * @return {boolean} Whether the tracks changed.
 */
shaka.util.StreamUtils.applyRestrictions =
    function(period, restrictions, maxHwRes) {
  let tracksChanged = false;

  period.variants.forEach(function(variant) {
    let originalAllowed = variant.allowedByApplication;
    variant.allowedByApplication = shaka.util.StreamUtils.meetsRestrictions(
        variant, restrictions, maxHwRes);

    if (originalAllowed != variant.allowedByApplication) {
      tracksChanged = true;
    }
  });

  return tracksChanged;
};


/**
 * Alters the given Period to filter out any unplayable streams.
 *
 * @param {shaka.media.DrmEngine} drmEngine
 * @param {?shakaExtern.Stream} activeAudio
 * @param {?shakaExtern.Stream} activeVideo
 * @param {shakaExtern.Period} period
 */
shaka.util.StreamUtils.filterNewPeriod = function(
    drmEngine, activeAudio, activeVideo, period) {
  const StreamUtils = shaka.util.StreamUtils;

  if (activeAudio) {
    goog.asserts.assert(
        shaka.util.StreamUtils.isAudio(activeAudio),
        'Audio streams must have the audio type.');
  }

  if (activeVideo) {
    goog.asserts.assert(
        shaka.util.StreamUtils.isVideo(activeVideo),
        'Video streams must have the video type.');
  }

  // Filter variants.
  period.variants = period.variants.filter(function(variant) {
    let keep = StreamUtils.isVariantCompatible_(
        variant,
        drmEngine,
        activeAudio,
        activeVideo);

    if (!keep) {
      shaka.log.debug('Dropping Variant (not compatible with key system, ' +
                      'platform, or active Variant)', variant);
    }

    return keep;
  });

  // Filter text streams.
  period.textStreams = period.textStreams.filter(function(stream) {
    let fullMimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, stream.codecs);
    let keep = shaka.text.TextEngine.isTypeSupported(fullMimeType);

    if (!keep) {
      shaka.log.debug('Dropping text stream. Is not supported by the ' +
                      'platform.', stream);
    }

    return keep;
  });
};


/**
 * Checks if a stream is compatible with the key system, platform,
 * and active stream.
 * This does not check if the stream is supported by the chosen key system.
 *
 * @param {?shakaExtern.Stream} stream A non-text stream to check.
 * @param {shaka.media.DrmEngine} drmEngine
 * @param {?shakaExtern.Stream} activeStream
 * @return {boolean}
 * @private
 */
shaka.util.StreamUtils.isStreamCompatible_ =
    function(stream, drmEngine, activeStream) {
  if (!stream) return true;

  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  goog.asserts.assert(stream.type != ContentType.TEXT,
      'Should not be called on a text stream!');

  let drmSupportedMimeTypes = null;
  if (drmEngine && drmEngine.initialized()) {
    drmSupportedMimeTypes = drmEngine.getSupportedTypes();
  }

  // Check if the stream can be played by the platform.
  let fullMimeType = shaka.util.MimeUtils.getFullType(
      stream.mimeType, stream.codecs);

  if (!shaka.media.MediaSourceEngine.isStreamSupported(stream)) {
    return false;
  }

  // Check if the stream can be handled by the key system.
  // There's no need to check that the stream is supported by the
  // chosen key system since the caller has already verified that.
  if (drmSupportedMimeTypes && stream.encrypted &&
      drmSupportedMimeTypes.indexOf(fullMimeType) < 0) {
    return false;
  }

  // Lastly, check if the active stream can switch to the stream.
  // Basic mime types and basic codecs need to match.
  // For example, we can't adapt between WebM and MP4,
  // nor can we adapt between mp4a.* to ec-3.
  // We can switch between text types on the fly,
  // so don't run this check on text.
  if (activeStream) {
    if (stream.mimeType != activeStream.mimeType ||
        stream.codecs.split('.')[0] != activeStream.codecs.split('.')[0]) {
      return false;
    }
  }

  return true;
};


/**
 * Checks if a variant is compatible with the key system, platform,
 * and active stream.
 *
 * @param {!shakaExtern.Variant} variant
 * @param {shaka.media.DrmEngine} drmEngine
 * @param {?shakaExtern.Stream} activeAudio
 * @param {?shakaExtern.Stream} activeVideo
 * @return {boolean}
 * @private
 */
shaka.util.StreamUtils.isVariantCompatible_ =
    function(variant, drmEngine, activeAudio, activeVideo) {
  if (drmEngine && drmEngine.initialized()) {
    if (!drmEngine.isSupportedByKeySystem(variant)) return false;
  }

  let isStreamCompatible = shaka.util.StreamUtils.isStreamCompatible_;

  return isStreamCompatible(variant.audio, drmEngine, activeAudio) &&
         isStreamCompatible(variant.video, drmEngine, activeVideo);
};


/**
 * @param {shakaExtern.Variant} variant
 * @return {shakaExtern.Track}
 */
shaka.util.StreamUtils.variantToTrack = function(variant) {
  /** @type {?shakaExtern.Stream} */
  let audio = variant.audio;
  /** @type {?shakaExtern.Stream} */
  let video = variant.video;

  /** @type {?string} */
  let audioCodec = audio ? audio.codecs : null;
  /** @type {?string} */
  let videoCodec = video ? video.codecs : null;

  /** @type {!Array.<string>} */
  let codecs = [];
  if (videoCodec) codecs.push(videoCodec);
  if (audioCodec) codecs.push(audioCodec);

  /** @type {!Array.<string>} */
  let mimeTypes = [];
  if (video) mimeTypes.push(video.mimeType);
  if (audio) mimeTypes.push(audio.mimeType);
  /** @type {?string} */
  let mimeType = mimeTypes[0] || null;

  /** @type {!Array.<string>} */
  let kinds = [];
  if (audio) kinds.push(audio.kind);
  if (video) kinds.push(video.kind);
  /** @type {?string} */
  let kind = kinds[0] || null;

  /** @type {!Array.<string>} */
  let roles = [];
  if (audio) roles.push.apply(roles, audio.roles);
  if (video) roles.push.apply(roles, video.roles);
  roles = shaka.util.ArrayUtils.removeDuplicates(roles);

  /** @type {shakaExtern.Track} */
  let track = {
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
    mimeType: mimeType,
    codecs: codecs.join(', '),
    audioCodec: audioCodec,
    videoCodec: videoCodec,
    primary: variant.primary,
    roles: roles,
    videoId: null,
    audioId: null,
    channelsCount: null,
    audioBandwidth: null,
    videoBandwidth: null
  };

  if (video) {
    track.videoId = video.id;
    track.width = video.width || null;
    track.height = video.height || null;
    track.frameRate = video.frameRate || null;
    track.videoBandwidth = video.bandwidth || null;
  }

  if (audio) {
    track.audioId = audio.id;
    track.channelsCount = audio.channelsCount;
    track.audioBandwidth = audio.bandwidth || null;
    track.label = audio.label;
  }

  return track;
};


/**
 * @param {shakaExtern.Stream} stream
 * @return {shakaExtern.Track}
 */
shaka.util.StreamUtils.textStreamToTrack = function(stream) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  /** @type {shakaExtern.Track} */
  let track = {
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
    mimeType: stream.mimeType,
    codecs: stream.codecs || null,
    audioCodec: null,
    videoCodec: null,
    primary: stream.primary,
    roles: stream.roles,
    videoId: null,
    audioId: null,
    channelsCount: null,
    audioBandwidth: null,
    videoBandwidth: null
  };

  return track;
};


/**
 * Gets track representations of all playable variants and all text streams.
 *
 * @param {shakaExtern.Period} period
 * @return {!Array.<shakaExtern.Track>}
 */
shaka.util.StreamUtils.getTracks = function(period) {
  const StreamUtils = shaka.util.StreamUtils;

  let tracks = [];

  let variants = StreamUtils.getPlayableVariants(period.variants);
  let textStreams = period.textStreams;

  variants.forEach(function(variant) {
    tracks.push(StreamUtils.variantToTrack(variant));
  });

  textStreams.forEach(function(stream) {
    tracks.push(StreamUtils.textStreamToTrack(stream));
  });

  return tracks;
};


/**
 * Gets an array of Track objects for the given Period.
 *
 * @param {shakaExtern.Period} period
 * @param {?number} activeAudioId
 * @param {?number} activeVideoId
 * @return {!Array.<shakaExtern.Track>}
 */
shaka.util.StreamUtils.getVariantTracks =
    function(period, activeAudioId, activeVideoId) {
  const StreamUtils = shaka.util.StreamUtils;
  let variants = StreamUtils.getPlayableVariants(period.variants);

  return variants.map(function(variant) {
    let track = StreamUtils.variantToTrack(variant);

    if (variant.video && variant.audio) {
      track.active = activeVideoId == variant.video.id &&
                     activeAudioId == variant.audio.id;
    } else if (variant.video) {
      track.active = activeVideoId == variant.video.id;
    } else if (variant.audio) {
      track.active = activeAudioId == variant.audio.id;
    }

    return track;
  });
};


/**
 * Gets an array of text Track objects for the given Period.
 *
 * @param {shakaExtern.Period} period
 * @param {?number} activeStreamId
 * @return {!Array.<shakaExtern.Track>}
 */
shaka.util.StreamUtils.getTextTracks = function(period, activeStreamId) {
  return period.textStreams.map(function(stream) {
    let track = shaka.util.StreamUtils.textStreamToTrack(stream);
    track.active = activeStreamId == stream.id;
    return track;
  });
};


/**
 * Finds the Variant for the given track.
 *
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.Track} track
 * @return {?shakaExtern.Variant}
 */
shaka.util.StreamUtils.findVariantForTrack = function(period, track) {
  for (let i = 0; i < period.variants.length; i++) {
    if (period.variants[i].id == track.id) {
      return period.variants[i];
    }
  }
  return null;
};


/**
 * Finds the text stream for the given track.
 *
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.Track} track
 * @return {?shakaExtern.Stream}
 */
shaka.util.StreamUtils.findTextStreamForTrack = function(period, track) {
  for (let i = 0; i < period.textStreams.length; i++) {
    if (period.textStreams[i].id == track.id) {
      return period.textStreams[i];
    }
  }
  return null;
};


/**
 * Determines if the given variant is playable.
 * @param {!shakaExtern.Variant} variant
 * @return {boolean}
 */
shaka.util.StreamUtils.isPlayable = function(variant) {
  return variant.allowedByApplication && variant.allowedByKeySystem;
};


/**
 * Filters out unplayable variants.
 * @param {!Array.<!shakaExtern.Variant>} variants
 * @return {!Array.<!shakaExtern.Variant>}
 */
shaka.util.StreamUtils.getPlayableVariants = function(variants) {
  return variants.filter(function(variant) {
    return shaka.util.StreamUtils.isPlayable(variant);
  });
};


/**
 * Chooses variants according to the given config.
 *
 * @param {!Array.<shakaExtern.Variant>} variants
 * @param {string} preferredLanguage
 * @param {string} preferredRole
 * @param {number} preferredAudioChannelCount
 * @param {!Object=} languageMatches
 * @return {!Array.<!shakaExtern.Variant>}
 */
shaka.util.StreamUtils.filterVariantsByConfig = function(
    variants, preferredLanguage, preferredRole, preferredAudioChannelCount,
    languageMatches) {
  let chosen = shaka.util.StreamUtils.filterVariantsByLanguageAndRole(
      variants, preferredLanguage, preferredRole, languageMatches);
  return shaka.util.StreamUtils.filterVariantsByAudioChannelCount(chosen,
      preferredAudioChannelCount);
};


/**
 * Chooses variants according to the given config.
 *
 * @param {!Array.<shakaExtern.Variant>} variants
 * @param {string} preferredLanguage
 * @param {string} preferredRole
 * @param {!Object=} languageMatches
 * @return {!Array.<!shakaExtern.Variant>}
 */
shaka.util.StreamUtils.filterVariantsByLanguageAndRole = function(
    variants, preferredLanguage, preferredRole, languageMatches) {
  const LanguageUtils = shaka.util.LanguageUtils;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  /** @type {!Array.<!shakaExtern.Variant>} */
  let playable = shaka.util.StreamUtils.getPlayableVariants(variants);

  /** @type {!Array.<!shakaExtern.Variant>} */
  let chosen = playable;

  // Start with the set of primary variants.
  /** @type {!Array.<!shakaExtern.Variant>} */
  let primary = playable.filter(function(variant) {
    return variant.primary;
  });

  if (primary.length) {
    chosen = primary;
  }

  // Now reduce the set to one language.  This covers both arbitrary language
  // choices and the reduction of the "primary" variant set to one language.
  let firstLanguage = chosen.length ? chosen[0].language : '';
  chosen = chosen.filter(function(variant) {
    return variant.language == firstLanguage;
  });

  // Now search for matches based on language preference.  If any language match
  // is found, it overrides the selection above.  Favor exact matches, then base
  // matches, finally different subtags.  Execute in reverse order so the later
  // steps override the previous ones.
  if (preferredLanguage) {
    let pref = LanguageUtils.normalize(preferredLanguage);
    [LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY,
     LanguageUtils.MatchType.BASE_LANGUAGE_OKAY,
     LanguageUtils.MatchType.EXACT]
        .forEach(function(matchType) {
          let betterLangMatchFound = false;
          playable.forEach(function(variant) {
            pref = LanguageUtils.normalize(pref);
            let lang = LanguageUtils.normalize(variant.language);
            if (LanguageUtils.match(matchType, pref, lang)) {
              if (betterLangMatchFound) {
                chosen.push(variant);
              } else {
                chosen = [variant];
                betterLangMatchFound = true;
              }
              if (languageMatches) {
                languageMatches[ContentType.AUDIO] = true;
              }
            }
          }); // forEach(variant)
        }); // forEach(matchType)
  } // if (preferredLanguage)

  // Now refine the choice based on role preference.
  if (preferredRole) {
    let roleMatches = shaka.util.StreamUtils.filterVariantsByRole_(
        chosen, preferredRole);
    if (roleMatches.length) {
      return roleMatches;
    } else {
      shaka.log.warning('No exact match for the variant role could be found.');
    }
  }

  // Either there was no role preference, or it could not be satisfied.
  // Choose an arbitrary role, if there are any, and filter out any other roles.
  // This ensures we never adapt between roles.
  let allRoles = chosen.map(function(variant) {
    let audioRoles = variant.audio ? variant.audio.roles : [];
    let videoRoles = variant.video ? variant.video.roles : [];
    return audioRoles.concat(videoRoles);
  }).reduce(shaka.util.Functional.collapseArrays, []);

  if (!allRoles.length) {
    return chosen;
  }
  return shaka.util.StreamUtils.filterVariantsByRole_(chosen, allRoles[0]);
};


/**
 * Filters variants according to the given audio channel count config.
 *
 * @param {!Array.<shakaExtern.Variant>} variants
 * @param {number} preferredAudioChannelCount
 * @return {!Array.<!shakaExtern.Variant>}
 */
shaka.util.StreamUtils.filterVariantsByAudioChannelCount = function(
    variants, preferredAudioChannelCount) {
  // Group variants by their audio channel counts.
  let variantsByChannelCount = variants
      .filter((v) => v.audio && v.audio.channelsCount)
      .reduce((map, variant) => {
        let count = variant.audio.channelsCount;
        if (map[count]) {
          map[count].push(variant);
        } else {
          map[count] = [variant];
        }
        return map;
      }, {});

  let channelCounts = Object.keys(variantsByChannelCount);

  // If no variant has audio channel count info, return the original variants.
  if (channelCounts.length == 0) {
    return variants;
  }

  // Choose the variants with the largest number of audio channels less than or
  // equal to the configured number of audio channels.
  let countLessThanOrEqualtoConfig =
      channelCounts.filter((count) => count <= preferredAudioChannelCount);
  if (countLessThanOrEqualtoConfig.length) {
    return variantsByChannelCount[Math.max.apply(null,
        countLessThanOrEqualtoConfig)];
  }
  // If all variants have more audio channels than the config, choose the
  // variants with the fewest audio channels.
  return variantsByChannelCount[Math.min.apply(null, channelCounts)];
};

/**
 * Chooses streams according to the given config.
 *
 * @param {!Array.<shakaExtern.Stream>} streams
 * @param {string} preferredLanguage
 * @param {string} preferredRole
 * @param {!Object=} languageMatches
 * @return {!Array.<!shakaExtern.Stream>}
 */
shaka.util.StreamUtils.filterStreamsByLanguageAndRole = function(
    streams, preferredLanguage, preferredRole, languageMatches) {
  const LanguageUtils = shaka.util.LanguageUtils;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  /** @type {!Array.<!shakaExtern.Stream>} */
  let chosen = streams;

  // Start with the set of primary streams.
  /** @type {!Array.<!shakaExtern.Stream>} */
  let primary = streams.filter(function(stream) {
    return stream.primary;
  });

  if (primary.length) {
    chosen = primary;
  }

  // Now reduce the set to one language.  This covers both arbitrary language
  // choice and the reduction of the "primary" stream set to one language.
  let firstLanguage = chosen.length ? chosen[0].language : '';
  chosen = chosen.filter(function(stream) {
    return stream.language == firstLanguage;
  });

  // Now search for matches based on language preference.  If any language match
  // is found, it overrides the selection above.  Favor exact matches, then base
  // matches, finally different subtags.  Execute in reverse order so the later
  // steps override the previous ones.
  if (preferredLanguage) {
    let pref = LanguageUtils.normalize(preferredLanguage);
    [LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY,
     LanguageUtils.MatchType.BASE_LANGUAGE_OKAY,
     LanguageUtils.MatchType.EXACT]
        .forEach(function(matchType) {
          let betterLangMatchFound = false;
          streams.forEach(function(stream) {
            let lang = LanguageUtils.normalize(stream.language);
            if (LanguageUtils.match(matchType, pref, lang)) {
              if (betterLangMatchFound) {
                chosen.push(stream);
              } else {
                chosen = [stream];
                betterLangMatchFound = true;
              }
              if (languageMatches) {
                languageMatches[ContentType.TEXT] = true;
              }
            }
          }); // forEach(stream)
        }); // forEach(matchType)
  } // if (preferredLanguage)

  // Now refine the choice based on role preference.
  if (preferredRole) {
    let roleMatches = shaka.util.StreamUtils.filterTextStreamsByRole_(
        chosen, preferredRole);
    if (roleMatches.length) {
      return roleMatches;
    } else {
      shaka.log.warning('No exact match for the text role could be found.');
    }
  } else {
    // Prefer text streams with no roles, if they exist.
    let noRoleMatches = chosen.filter(function(stream) {
      return stream.roles.length == 0;
    });
    if (noRoleMatches.length) {
      return noRoleMatches;
    }
  }

  // Either there was no role preference, or it could not be satisfied.
  // Choose an arbitrary role, if there are any, and filter out any other roles.
  // This ensures we never adapt between roles.

  let allRoles = chosen.map(function(stream) {
    return stream.roles;
  }).reduce(shaka.util.Functional.collapseArrays, []);

  if (!allRoles.length) {
    return chosen;
  }
  return shaka.util.StreamUtils.filterTextStreamsByRole_(chosen, allRoles[0]);
};


/**
 * Filter Variants by role.
 *
 * @param {!Array.<shakaExtern.Variant>} variants
 * @param {string} preferredRole
 * @return {!Array.<shakaExtern.Variant>}
 * @private
 */
shaka.util.StreamUtils.filterVariantsByRole_ =
    function(variants, preferredRole) {
  return variants.filter(function(variant) {
    return (variant.audio && variant.audio.roles.indexOf(preferredRole) >= 0) ||
           (variant.video && variant.video.roles.indexOf(preferredRole) >= 0);
  });
};


/**
 * Filter text Streams by role.
 *
 * @param {!Array.<shakaExtern.Stream>} textStreams
 * @param {string} preferredRole
 * @return {!Array.<shakaExtern.Stream>}
 * @private
 */
shaka.util.StreamUtils.filterTextStreamsByRole_ =
    function(textStreams, preferredRole) {
  return textStreams.filter(function(stream) {
    return stream.roles.indexOf(preferredRole) >= 0;
  });
};


/**
 * Finds a Variant with given audio and video streams.
 * Returns null if no such Variant was found.
 *
 * @param {?shakaExtern.Stream} audio
 * @param {?shakaExtern.Stream} video
 * @param {!Array.<!shakaExtern.Variant>} variants
 * @return {?shakaExtern.Variant}
 */
shaka.util.StreamUtils.getVariantByStreams = function(audio, video, variants) {
  if (audio) {
    goog.asserts.assert(
        shaka.util.StreamUtils.isAudio(audio),
        'Audio streams must have the audio type.');
  }

  if (video) {
    goog.asserts.assert(
        shaka.util.StreamUtils.isVideo(video),
        'Video streams must have the video type.');
  }

  for (let i = 0; i < variants.length; i++) {
    if (variants[i].audio == audio && variants[i].video == video) {
      return variants[i];
    }
  }

  return null;
};


/**
 * Finds a Variant with the given video and audio streams, by stream ID.
 * Returns null if no such Variant was found.
 *
 * @param {?number} audioId
 * @param {?number} videoId
 * @param {!Array.<shakaExtern.Variant>} variants
 * @return {?shakaExtern.Variant}
 */
shaka.util.StreamUtils.getVariantByStreamIds = function(
    audioId, videoId, variants) {
  function matchesId(id, stream) {
    if (id == null) {
      return stream == null;
    } else {
      return stream.id == id;
    }
  }

  for (let i = 0; i < variants.length; i++) {
    if (matchesId(audioId, variants[i].audio) &&
        matchesId(videoId, variants[i].video)) {
      return variants[i];
    }
  }

  return null;
};


/**
 * Gets the index of the Period that contains the given time.
 * @param {shakaExtern.Manifest} manifest
 * @param {number} time The time in seconds from the start of the presentation.
 * @return {number}
 */
shaka.util.StreamUtils.findPeriodContainingTime = function(manifest, time) {
  let threshold = shaka.util.ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS;
  for (let i = manifest.periods.length - 1; i > 0; --i) {
    let period = manifest.periods[i];
    // The last segment may end right before the end of the Period because of
    // rounding issues.
    if (time + threshold >= period.startTime) {
      return i;
    }
  }
  return 0;
};


/**
 * @param {shakaExtern.Manifest} manifest
 * @param {shakaExtern.Stream} stream
 * @return {number} The index of the Period which contains |stream|, or -1 if
 *   no Period contains |stream|.
 */
shaka.util.StreamUtils.findPeriodContainingStream = function(manifest, stream) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  for (let periodIdx = 0; periodIdx < manifest.periods.length; ++periodIdx) {
    let period = manifest.periods[periodIdx];
    if (stream.type == ContentType.TEXT) {
      for (let j = 0; j < period.textStreams.length; ++j) {
        let textStream = period.textStreams[j];
        if (textStream == stream) {
          return periodIdx;
        }
      }
    } else {
      for (let j = 0; j < period.variants.length; ++j) {
        let variant = period.variants[j];
        if (variant.audio == stream || variant.video == stream ||
            (variant.video && variant.video.trickModeVideo == stream)) {
          return periodIdx;
        }
      }
    }
  }
  return -1;
};


/**
 * @param {shakaExtern.Manifest} manifest
 * @param {shakaExtern.Variant} variant
 * @return {number} The index of the Period which contains |stream|, or -1 if
 *   no Period contains |stream|.
 */
shaka.util.StreamUtils.findPeriodContainingVariant =
    function(manifest, variant) {
  for (let periodIdx = 0; periodIdx < manifest.periods.length; ++periodIdx) {
    let period = manifest.periods[periodIdx];
    for (let j = 0; j < period.variants.length; ++j) {
      if (period.variants[j] == variant) {
        return periodIdx;
      }
    }
  }
  return -1;
};


/**
 * Gets the rebuffering goal from the manifest and configuration.
 *
 * @param {shakaExtern.Manifest} manifest
 * @param {shakaExtern.StreamingConfiguration} config
 * @param {number} scaleFactor
 *
 * @return {number}
 */
shaka.util.StreamUtils.getRebufferingGoal = function(
    manifest, config, scaleFactor) {
  return scaleFactor *
         Math.max(manifest.minBufferTime || 0, config.rebufferingGoal);
};


/**
 * Checks if the given stream is an audio stream.
 *
 * @param {shakaExtern.Stream} stream
 * @return {boolean}
 */
shaka.util.StreamUtils.isAudio = function(stream) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  return stream.type == ContentType.AUDIO;
};


/**
 * Checks if the given stream is a video stream.
 *
 * @param {shakaExtern.Stream} stream
 * @return {boolean}
 */
shaka.util.StreamUtils.isVideo = function(stream) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  return stream.type == ContentType.VIDEO;
};
