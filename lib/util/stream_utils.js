/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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
 * @summary A set of utility functions for dealing with Streams and Manifests.
 */
shaka.util.StreamUtils = class {
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
   * Alters the given Period to filter out any unplayable streams.
   *
   * @param {shaka.media.DrmEngine} drmEngine
   * @param {?shaka.extern.Stream} activeAudio
   * @param {?shaka.extern.Stream} activeVideo
   * @param {shaka.extern.Period} period
   */
  static filterNewPeriod(drmEngine, activeAudio, activeVideo, period) {
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
    period.textStreams = period.textStreams.filter((stream) => {
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
      mimeType: mimeType,
      codecs: codecs.join(', '),
      audioCodec: audioCodec,
      videoCodec: videoCodec,
      primary: variant.primary,
      roles: Array.from(roles),
      audioRoles: null,
      videoId: null,
      audioId: null,
      channelsCount: null,
      audioSamplingRate: null,
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
      mimeType: stream.mimeType,
      codecs: stream.codecs || null,
      audioCodec: null,
      videoCodec: null,
      primary: stream.primary,
      roles: stream.roles,
      audioRoles: null,
      videoId: null,
      audioId: null,
      channelsCount: null,
      audioSamplingRate: null,
      audioBandwidth: null,
      videoBandwidth: null,
      originalVideoId: null,
      originalAudioId: null,
      originalTextId: stream.originalId,
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
        shaka.util.MimeUtils.CLOSED_CAPTION_MIMETYPE;
    const StreamUtils = shaka.util.StreamUtils;

    /** @type {shaka.extern.Track} */
    const track = StreamUtils.html5TrackToGenericShakaTrack_(textTrack);
    track.active = textTrack.mode != 'disabled';
    track.type = 'text';
    track.originalTextId = textTrack.id;
    if (textTrack.kind == 'captions') {
      track.mimeType = CLOSED_CAPTION_MIMETYPE;
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
      track.roles = ['main'];
      track.audioRoles = ['main'];
    } else {
      track.audioRoles = [];
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
      mimeType: null,
      codecs: null,
      audioCodec: null,
      videoCodec: null,
      primary: false,
      roles: [],
      audioRoles: null,
      videoId: null,
      audioId: null,
      channelsCount: null,
      audioSamplingRate: null,
      audioBandwidth: null,
      videoBandwidth: null,
      originalVideoId: null,
      originalAudioId: null,
      originalTextId: null,
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
   * @return {!Array.<!shaka.extern.Stream>}
   */
  static filterStreamsByLanguageAndRole(
      streams, preferredLanguage, preferredRole) {
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
   * Finds a Variant with given audio and video streams.
   * Returns null if no such Variant was found.
   *
   * @param {?shaka.extern.Stream} audio
   * @param {?shaka.extern.Stream} video
   * @param {!Array.<!shaka.extern.Variant>} variants
   * @return {?shaka.extern.Variant}
   */
  static getVariantByStreams(audio, video, variants) {
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

    for (const variant of variants) {
      if (variant.audio == audio && variant.video == video) {
        return variant;
      }
    }

    return null;
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
   * @param {shaka.extern.Stream} stream
   * @return {string}
   * @private
   */
  static getStreamSummaryString_(stream) {
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
