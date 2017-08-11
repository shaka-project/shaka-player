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
  var video = variant.video;
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
  var tracksChanged = false;

  period.variants.forEach(function(variant) {
    var originalAllowed = variant.allowedByApplication;
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
 * @param {!Object.<string, shakaExtern.Stream>} activeStreams
 * @param {shakaExtern.Period} period
 */
shaka.util.StreamUtils.filterNewPeriod = function(
    drmEngine, activeStreams, period) {
  var StreamUtils = shaka.util.StreamUtils;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  var activeVideo = activeStreams[ContentType.VIDEO];
  var activeAudio = activeStreams[ContentType.AUDIO];

  // Filter variants
  for (var i = 0; i < period.variants.length; ++i) {
    var variant = period.variants[i];
    if (!StreamUtils.variantIsCompatible_(
        variant, drmEngine, activeAudio, activeVideo)) {
      shaka.log.debug('Dropping Variant (not compatible with key system, ' +
                      'platform, or active Variant)', variant);
      period.variants.splice(i, 1);
      --i;
      continue;
    }
  }

  // Filter text streams
  for (var i = 0; i < period.textStreams.length; ++i) {
    var stream = period.textStreams[i];
    var fullMimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, stream.codecs);
    if (!shaka.text.TextEngine.isTypeSupported(fullMimeType)) {
      shaka.log.debug('Dropping text stream. Is not supported by the ' +
                      'platform.', stream);
      period.textStreams.splice(i, 1);
      --i;
    }
  }
};


/**
 * Checks if a stream is compatible with the key system, platform,
 * and active stream.
 *
 * @param {?shakaExtern.Stream} stream
 * @param {shaka.media.DrmEngine} drmEngine
 * @param {?shakaExtern.Stream} activeStream
 * @return {boolean}
 * @private
 */
shaka.util.StreamUtils.streamIsCompatible_ =
    function(stream, drmEngine, activeStream) {
  if (!stream) return true;

  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  goog.asserts.assert(stream.type != ContentType.TEXT,
      'Should not be called on a text stream!');

  var drmSupportedMimeTypes = null;
  if (drmEngine && drmEngine.initialized()) {
    drmSupportedMimeTypes = drmEngine.getSupportedTypes();
  }

  // Check if stream can be played by the platform
  var fullMimeType = shaka.util.MimeUtils.getFullType(
      stream.mimeType, stream.codecs);

  if (!shaka.media.MediaSourceEngine.isStreamSupported(stream))
    return false;

  // Check if stream can be handled by the key system.
  // There's no need to check that the stream is supported by the
  // chosen key system since the caller has already verified that.
  if (drmSupportedMimeTypes && stream.encrypted &&
      drmSupportedMimeTypes.indexOf(fullMimeType) < 0) {
    return false;
  }

  // Lastly, check if active stream can switch to the stream
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
 * @param {shakaExtern.Stream} activeAudio
 * @param {shakaExtern.Stream} activeVideo
 * @return {boolean}
 * @private
 */
shaka.util.StreamUtils.variantIsCompatible_ =
    function(variant, drmEngine, activeAudio, activeVideo) {
  var StreamUtils = shaka.util.StreamUtils;
  if (drmEngine && drmEngine.initialized()) {
    if (!drmEngine.isSupportedByKeySystem(variant)) return false;
  }

  return StreamUtils.streamIsCompatible_(variant.audio,
                                         drmEngine,
                                         activeAudio) &&
         StreamUtils.streamIsCompatible_(variant.video, drmEngine, activeVideo);
};


/**
 * Gets an array of Track objects for the given Period
 *
 * @param {shakaExtern.Period} period
 * @param {?number} activeAudioId
 * @param {?number} activeVideoId
 * @return {!Array.<shakaExtern.Track>}
 */
shaka.util.StreamUtils.getVariantTracks =
    function(period, activeAudioId, activeVideoId) {
  var StreamUtils = shaka.util.StreamUtils;
  var variants = StreamUtils.getPlayableVariants(period.variants);
  var label = null;
  var tracks = variants.map(function(variant) {
    var isActive;
    if (variant.video && variant.audio) {
      isActive = activeVideoId == variant.video.id &&
                 activeAudioId == variant.audio.id;
    } else {
      isActive = (variant.video && activeVideoId == variant.video.id) ||
                 (variant.audio && activeAudioId == variant.audio.id);
    }
    var codecs = '';
    if (variant.video) codecs += variant.video.codecs;
    if (variant.audio) {
      if (codecs != '') codecs += ', ';
      codecs += variant.audio.codecs;
      label = variant.audio.label;
    }

    var audioCodec = variant.audio ? variant.audio.codecs : null;
    var videoCodec = variant.video ? variant.video.codecs : null;
    var mimeType = null;
    if (variant.video) mimeType = variant.video.mimeType;
    else if (variant.audio) mimeType = variant.audio.mimeType;

    var kind = null;
    if (variant.audio) kind = variant.audio.kind;
    else if (variant.video) kind = variant.video.kind;

    var audioRoles = variant.audio ? variant.audio.roles : [];
    var videoRoles = variant.video ? variant.video.roles : [];
    var roles = shaka.util.ArrayUtils.removeDuplicates(
        audioRoles.concat(videoRoles));
    return {
      id: variant.id,
      active: isActive,
      type: 'variant',
      bandwidth: variant.bandwidth,
      language: variant.language,
      label: label,
      kind: kind || null,
      width: variant.video ? variant.video.width : null,
      height: variant.video ? variant.video.height : null,
      frameRate: variant.video ? variant.video.frameRate : undefined,
      mimeType: mimeType,
      codecs: codecs,
      audioCodec: audioCodec,
      videoCodec: videoCodec,
      primary: variant.primary,
      roles: roles,
      videoId: variant.video ? variant.video.id : null,
      audioId: variant.audio ? variant.audio.id : null,
      channelsCount: variant.audio ? variant.audio.channelsCount : null,
      audioBandwidth: (variant.audio && variant.audio.bandwidth) ?
                       variant.audio.bandwidth : null,
      videoBandwidth: (variant.video && variant.video.bandwidth) ?
                       variant.video.bandwidth : null
    };
  });

  return tracks;
};


/**
 * Gets an array of text Track objects for the given Period.
 *
 * @param {shakaExtern.Period} period
 * @param {?number} activeStreamId
 * @return {!Array.<shakaExtern.Track>}
 */
shaka.util.StreamUtils.getTextTracks = function(period, activeStreamId) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  return period.textStreams.map(function(stream) {
    return {
      id: stream.id,
      active: activeStreamId == stream.id,
      type: ContentType.TEXT,
      language: stream.language,
      label: stream.label,
      kind: stream.kind,
      mimeType: stream.mimeType,
      codecs: stream.codecs || null,
      audioCodec: null,
      videoCodec: null,
      primary: stream.primary,
      roles: stream.roles,
      channelsCount: null,
      audioBandwidth: null,
      videoBandwidth: null
    };
  });
};


/**
 * Find the Variant for the given track.
 *
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.Track} track
 * @return {?shakaExtern.Variant}
 */
shaka.util.StreamUtils.findVariantForTrack = function(period, track) {
  for (var i = 0; i < period.variants.length; i++) {
    if (period.variants[i].id == track.id)
      return period.variants[i];
  }
  return null;
};


/**
 * Find the text stream for the given track.
 *
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.Track} track
 * @return {?shakaExtern.Stream}
 */
shaka.util.StreamUtils.findTextStreamForTrack = function(period, track) {
  for (var i = 0; i < period.textStreams.length; i++) {
    if (period.textStreams[i].id == track.id)
      return period.textStreams[i];
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
 * Filters out not playable variants.
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
 * @param {shakaExtern.Period} period
 * @param {string} preferredLanguage
 * @param {string} preferredRole
 * @param {!Object=} opt_languageMatches
 * @return {!Array.<!shakaExtern.Variant>}
 */
shaka.util.StreamUtils.filterVariantsByLanguageAndRole = function(
    period, preferredLanguage, preferredRole, opt_languageMatches) {
  var LanguageUtils = shaka.util.LanguageUtils;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var variants = shaka.util.StreamUtils.getPlayableVariants(period.variants);

  // Start with the set of primary variants.
  /** @type {!Array.<!shakaExtern.Variant>} */
  var chosen = variants.filter(function(variant) {
    return variant.primary;
  });

  // If there were no primary variants, go back to all variants.
  if (!chosen.length) {
    chosen = variants;
  }

  // Now reduce the set to one language.  This covers both arbitrary language
  // choice and the reduction of the "primary" variant set to one language.
  var firstLanguage = chosen.length ? chosen[0].language : '';
  chosen = chosen.filter(function(variant) {
    return variant.language == firstLanguage;
  });

  // Now search for matches based on language preference.  If any language match
  // is found, it overrides the selection above.  Favor exact matches, then base
  // matches, finally different subtags.  Execute in reverse order so the later
  // steps override the previous ones.
  if (preferredLanguage) {
    var pref = LanguageUtils.normalize(preferredLanguage);
    [LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY,
     LanguageUtils.MatchType.BASE_LANGUAGE_OKAY,
     LanguageUtils.MatchType.EXACT]
        .forEach(function(matchType) {
          var betterLangMatchFound = false;
          variants.forEach(function(variant) {
            pref = LanguageUtils.normalize(pref);
            var lang = LanguageUtils.normalize(variant.language);
            if (LanguageUtils.match(matchType, pref, lang)) {
              if (betterLangMatchFound) {
                chosen.push(variant);
              } else {
                chosen = [variant];
                betterLangMatchFound = true;
              }
              if (opt_languageMatches) {
                opt_languageMatches[ContentType.AUDIO] = true;
              }
            }
          }); // forEach(variant)
        }); // forEach(matchType)
  } // if (preferredLanguage)

  // Now refine the choice based on role preference.
  if (preferredRole) {
    var roleMatches = shaka.util.StreamUtils.filterVariantsByRole_(
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
  var allRoles = chosen.map(function(variant) {
    var audioRoles = variant.audio ? variant.audio.roles : [];
    var videoRoles = variant.video ? variant.video.roles : [];
    return audioRoles.concat(videoRoles);
  }).reduce(shaka.util.Functional.collapseArrays, []);

  if (!allRoles.length) {
    return chosen;
  }
  return shaka.util.StreamUtils.filterVariantsByRole_(chosen, allRoles[0]);
};


/**
 * Chooses text streams according to the given config.
 *
 * @param {shakaExtern.Period} period
 * @param {string} preferredLanguage
 * @param {string} preferredRole
 * @param {!Object=} opt_languageMatches
 * @return {!Array.<!shakaExtern.Stream>}
 */
shaka.util.StreamUtils.filterTextStreamsByLanguageAndRole = function(
    period, preferredLanguage, preferredRole, opt_languageMatches) {
  var LanguageUtils = shaka.util.LanguageUtils;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var streams = period.textStreams;

  // Start with the set of primary streams.
  /** @type {!Array.<!shakaExtern.Stream>} */
  var chosen = streams.filter(function(stream) {
    return stream.primary;
  });

  // If there were no primary streams, go back to all streams.
  if (!chosen.length) {
    chosen = streams;
  }

  // Now reduce the set to one language.  This covers both arbitrary language
  // choice and the reduction of the "primary" stream set to one language.
  var firstLanguage = chosen.length ? chosen[0].language : '';
  chosen = chosen.filter(function(stream) {
    return stream.language == firstLanguage;
  });

  // Now search for matches based on language preference.  If any language match
  // is found, it overrides the selection above.  Favor exact matches, then base
  // matches, finally different subtags.  Execute in reverse order so the later
  // steps override the previous ones.
  if (preferredLanguage) {
    var pref = LanguageUtils.normalize(preferredLanguage);
    [LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY,
     LanguageUtils.MatchType.BASE_LANGUAGE_OKAY,
     LanguageUtils.MatchType.EXACT]
        .forEach(function(matchType) {
          var betterLangMatchFound = false;
          streams.forEach(function(stream) {
            var lang = LanguageUtils.normalize(stream.language);
            if (LanguageUtils.match(matchType, pref, lang)) {
              if (betterLangMatchFound) {
                chosen.push(stream);
              } else {
                chosen = [stream];
                betterLangMatchFound = true;
              }
              if (opt_languageMatches)
                opt_languageMatches[ContentType.TEXT] = true;
            }
          }); // forEach(stream)
        }); // forEach(matchType)
  } // if (preferredLanguage)

  // Now refine the choice based on role preference.
  if (preferredRole) {
    var roleMatches = shaka.util.StreamUtils.filterTextStreamsByRole_(
        chosen, preferredRole);
    if (roleMatches.length) {
      return roleMatches;
    } else {
      shaka.log.warning('No exact match for the text role could be found.');
    }
  }

  // Either there was no role preference, or it could not be satisfied.
  // Choose an arbitrary role, if there are any, and filter out any other roles.
  // This ensures we never adapt between roles.

  var allRoles = chosen.map(function(stream) {
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
 * Returns null if none was found.
 *
 * @param {?shakaExtern.Stream} audio
 * @param {?shakaExtern.Stream} video
 * @param {!Array.<!shakaExtern.Variant>} variants
 * @return {?shakaExtern.Variant}
 */
shaka.util.StreamUtils.getVariantByStreams = function(audio, video, variants) {
  for (var i = 0; i < variants.length; i++) {
    if (variants[i].audio == audio && variants[i].video == video)
      return variants[i];
  }

  return null;
};


/**
 * Finds a Variant with the given video and audio streams, by stream ID.
 * Returns null if none were found.
 *
 * @param {?number} audioId
 * @param {?number} videoId
 * @param {!Array.<shakaExtern.Variant>} variants
 * @return {?shakaExtern.Variant}
 */
shaka.util.StreamUtils.getVariantByStreamIds = function(
    audioId, videoId, variants) {
  function matchesId(id, stream) {
    if (id == null)
      return stream == null;
    else
      return stream.id == id;
  }

  for (var i = 0; i < variants.length; i++) {
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
  var threshold = shaka.util.ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS;
  for (var i = manifest.periods.length - 1; i > 0; --i) {
    var period = manifest.periods[i];
    // The last segment may end right before the end of the Period because of
    // rounding issues.
    if (time + threshold >= period.startTime)
      return i;
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
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  for (var periodIdx = 0; periodIdx < manifest.periods.length; ++periodIdx) {
    var period = manifest.periods[periodIdx];
    if (stream.type == ContentType.TEXT) {
      for (var j = 0; j < period.textStreams.length; ++j) {
        var textStream = period.textStreams[j];
        if (textStream == stream)
          return periodIdx;
      }
    } else {
      for (var j = 0; j < period.variants.length; ++j) {
        var variant = period.variants[j];
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
  for (var periodIdx = 0; periodIdx < manifest.periods.length; ++periodIdx) {
    var period = manifest.periods[periodIdx];
    for (var j = 0; j < period.variants.length; ++j) {
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
