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
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');


/**
 * @namespace shaka.util.StreamUtils
 * @summary A set of utility functions for dealing with Streams and Manifests.
 */


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
shaka.util.StreamUtils.meetsRestrictions = function(
    variant, restrictions, maxHwRes) {
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

  if (!inRange(variant.bandwidth,
               restrictions.minBandwidth,
               restrictions.maxBandwidth)) {
    return false;
  }

  return true;
};


/**
 * @param {!Array.<shaka.extern.Variant>} variants
 * @param {shaka.extern.Restrictions} restrictions
 * @param {{width: number, height: number}} maxHwRes
 * @return {boolean} Whether the tracks changed.
 */
shaka.util.StreamUtils.applyRestrictions =
    function(variants, restrictions, maxHwRes) {
  let tracksChanged = false;

  variants.forEach((variant) => {
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
 * @param {?shaka.extern.Stream} activeAudio
 * @param {?shaka.extern.Stream} activeVideo
 * @param {shaka.extern.Period} period
 */
shaka.util.StreamUtils.filterNewPeriod = function(
    drmEngine, activeAudio, activeVideo, period) {
  const StreamUtils = shaka.util.StreamUtils;

  if (activeAudio) {
    goog.asserts.assert(StreamUtils.isAudio(activeAudio),
                        'Audio streams must have the audio type.');
  }

  if (activeVideo) {
    goog.asserts.assert(StreamUtils.isVideo(activeVideo),
                        'Video streams must have the video type.');
  }

  // Filter variants.
  period.variants = period.variants.filter((variant) => {
    if (drmEngine && drmEngine.initialized()) {
      if (!drmEngine.supportsVariant(variant)) {
        shaka.log.debug('Dropping variant - not compatible with key system',
                        variant);
        return false;
      }
    }

    const audio = variant.audio;
    const video = variant.video;

    if (audio && !shaka.media.MediaSourceEngine.isStreamSupported(audio)) {
      shaka.log.debug('Dropping variant - audio not compatible with platform',
                      StreamUtils.getStreamSummaryString_(audio));
      return false;
    }

    if (video && !shaka.media.MediaSourceEngine.isStreamSupported(video)) {
      shaka.log.debug('Dropping variant - video not compatible with platform',
                      StreamUtils.getStreamSummaryString_(video));
      return false;
    }

    if (audio && activeAudio) {
      if (!StreamUtils.areStreamsCompatible_(audio, activeAudio)) {
        shaka.log.debug('Droping variant - not compatible with active audio',
                        'active audio',
                        StreamUtils.getStreamSummaryString_(activeAudio),
                        'variant.audio',
                        StreamUtils.getStreamSummaryString_(audio));
        return false;
      }
    }

    if (video && activeVideo) {
      if (!StreamUtils.areStreamsCompatible_(video, activeVideo)) {
        shaka.log.debug('Droping variant - not compatible with active video',
                        'active video',
                        StreamUtils.getStreamSummaryString_(activeVideo),
                        'variant.video',
                        StreamUtils.getStreamSummaryString_(video));
        return false;
      }
    }

    return true;
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
 * @param {shaka.extern.Stream} s0
 * @param {shaka.extern.Stream} s1
 * @return {boolean}
 * @private
 */
shaka.util.StreamUtils.areStreamsCompatible_ = function(s0, s1) {
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
};


/**
 * @param {shaka.extern.Variant} variant
 * @return {shaka.extern.Track}
 */
shaka.util.StreamUtils.variantToTrack = function(variant) {
  /** @type {?shaka.extern.Stream} */
  let audio = variant.audio;
  /** @type {?shaka.extern.Stream} */
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

  /** @type {!Set.<string>} */
  const roles = new Set();
  if (audio) audio.roles.forEach((role) => roles.add(role));
  if (video) video.roles.forEach((role) => roles.add(role));

  /** @type {shaka.extern.Track} */
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
    roles: Array.from(roles),
    videoId: null,
    audioId: null,
    channelsCount: null,
    audioBandwidth: null,
    videoBandwidth: null,
    originalVideoId: null,
    originalAudioId: null,
    originalTextId: null,
  };

  if (video) {
    track.videoId = video.id;
    track.originalVideoId = video.originalId;
    track.width = video.width || null;
    track.height = video.height || null;
    track.frameRate = video.frameRate || null;
    track.videoBandwidth = video.bandwidth || null;
  }

  if (audio) {
    track.audioId = audio.id;
    track.originalAudioId = audio.originalId;
    track.channelsCount = audio.channelsCount;
    track.audioBandwidth = audio.bandwidth || null;
    track.label = audio.label;
  }

  return track;
};


/**
 * @param {shaka.extern.Stream} stream
 * @return {shaka.extern.Track}
 */
shaka.util.StreamUtils.textStreamToTrack = function(stream) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  /** @type {shaka.extern.Track} */
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
    videoBandwidth: null,
    originalVideoId: null,
    originalAudioId: null,
    originalTextId: stream.originalId,
  };

  return track;
};


/**
 * Gets an array of Track objects for the given Period.
 *
 * @param {shaka.extern.Period} period
 * @param {?number} activeAudioId
 * @param {?number} activeVideoId
 * @return {!Array.<shaka.extern.Track>}
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
 * Gets an array of text Track objects for the given Period, including text
 * streams in the period, and texts embedded in the video streams in the
 * period.
 *
 * @param {shaka.extern.Period} period
 * @param {?number} activeStreamId
 * @return {!Array.<shaka.extern.Track>}
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
 * @param {shaka.extern.Period} period
 * @param {shaka.extern.Track} track
 * @return {?shaka.extern.Variant}
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
 * @param {shaka.extern.Period} period
 * @param {shaka.extern.Track} track
 * @return {?shaka.extern.Stream}
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
 * @param {!shaka.extern.Variant} variant
 * @return {boolean}
 */
shaka.util.StreamUtils.isPlayable = function(variant) {
  return variant.allowedByApplication && variant.allowedByKeySystem;
};


/**
 * Filters out unplayable variants.
 * @param {!Array.<!shaka.extern.Variant>} variants
 * @return {!Array.<!shaka.extern.Variant>}
 */
shaka.util.StreamUtils.getPlayableVariants = function(variants) {
  return variants.filter(function(variant) {
    return shaka.util.StreamUtils.isPlayable(variant);
  });
};


/**
 * Filters variants according to the given audio channel count config.
 *
 * @param {!Array.<shaka.extern.Variant>} variants
 * @param {number} preferredAudioChannelCount
 * @return {!Array.<!shaka.extern.Variant>}
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
 * @param {!Array.<shaka.extern.Stream>} streams
 * @param {string} preferredLanguage
 * @param {string} preferredRole
 * @return {!Array.<!shaka.extern.Stream>}
 */
shaka.util.StreamUtils.filterStreamsByLanguageAndRole = function(
    streams, preferredLanguage, preferredRole) {
  const LanguageUtils = shaka.util.LanguageUtils;

  /** @type {!Array.<!shaka.extern.Stream>} */
  let chosen = streams;

  // Start with the set of primary streams.
  /** @type {!Array.<!shaka.extern.Stream>} */
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
 * Filter text Streams by role.
 *
 * @param {!Array.<shaka.extern.Stream>} textStreams
 * @param {string} preferredRole
 * @return {!Array.<shaka.extern.Stream>}
 * @private
 */
shaka.util.StreamUtils.filterTextStreamsByRole_ =
    function(textStreams, preferredRole) {
  return textStreams.filter(function(stream) {
    return stream.roles.includes(preferredRole);
  });
};


/**
 * Finds a Variant with given audio and video streams.
 * Returns null if no such Variant was found.
 *
 * @param {?shaka.extern.Stream} audio
 * @param {?shaka.extern.Stream} video
 * @param {!Array.<!shaka.extern.Variant>} variants
 * @return {?shaka.extern.Variant}
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
 * @param {!Array.<shaka.extern.Variant>} variants
 * @return {?shaka.extern.Variant}
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
 * @param {shaka.extern.Manifest} manifest
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
 * @param {shaka.extern.Manifest} manifest
 * @param {shaka.extern.Stream} stream
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
 * @param {shaka.extern.Manifest} manifest
 * @param {shaka.extern.Variant} variant
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
 * Checks if the given stream is an audio stream.
 *
 * @param {shaka.extern.Stream} stream
 * @return {boolean}
 */
shaka.util.StreamUtils.isAudio = function(stream) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  return stream.type == ContentType.AUDIO;
};


/**
 * Checks if the given stream is a video stream.
 *
 * @param {shaka.extern.Stream} stream
 * @return {boolean}
 */
shaka.util.StreamUtils.isVideo = function(stream) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  return stream.type == ContentType.VIDEO;
};


/**
 * Get all the variants from all the periods in the manifest.
 *
 * @param {shaka.extern.Manifest} manifest
 * @return {!Array.<shaka.extern.Variant>}
 */
shaka.util.StreamUtils.getAllVariants = function(manifest) {
  /** @type {!Array.<shaka.extern.Variant>} */
  const found = [];

  manifest.periods.forEach((period) => {
    period.variants.forEach((variant) => {
      found.push(variant);
    });
  });

  return found;
};


/**
 * Get all non-null streams in the variant as an array.
 *
 * @param {shaka.extern.Variant} variant
 * @return {!Array.<shaka.extern.Stream>}
 */
shaka.util.StreamUtils.getVariantStreams = function(variant) {
  const streams = [];

  if (variant.audio) { streams.push(variant.audio); }
  if (variant.video) { streams.push(variant.video); }

  return streams;
};


/**
 * @param {shaka.extern.Stream} stream
 * @return {string}
 * @private
 */
shaka.util.StreamUtils.getStreamSummaryString_ = function(stream) {
  if (shaka.util.StreamUtils.isAudio(stream)) {
    return 'type=audio' +
           ' codecs=' + stream.codecs +
           ' bandwidth='+ stream.bandwidth +
           ' channelsCount=' + stream.channelsCount;
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
};
