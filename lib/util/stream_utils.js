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

goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');


/**
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.Restrictions} restrictions
 *   Configured restrictions from the user.
 * @param {{width: number, height: number}} maxHwRes
 *   The maximum resolution the hardware can handle.
 *   This is applied separately from user restrictions because the setting
 *   should not be easily replaced by the user's configuration.
 * @return {boolean} Whether the tracks changed.
 */
shaka.util.StreamUtils.applyRestrictions =
    function(period, restrictions, maxHwRes) {
  var tracksChanged = false;

  period.streamSets.forEach(function(streamSet) {
    streamSet.streams.forEach(function(stream) {
      var originalAllowed = stream.allowedByApplication;
      stream.allowedByApplication = true;

      if (streamSet.type == 'video') {
        if (stream.width < restrictions.minWidth ||
            stream.width > restrictions.maxWidth ||
            stream.width > maxHwRes.width ||
            stream.height < restrictions.minHeight ||
            stream.height > restrictions.maxHeight ||
            stream.height > maxHwRes.height ||
            (stream.width * stream.height) < restrictions.minPixels ||
            (stream.width * stream.height) > restrictions.maxPixels ||
            stream.bandwidth < restrictions.minVideoBandwidth ||
            stream.bandwidth > restrictions.maxVideoBandwidth) {
          stream.allowedByApplication = false;
        }
      } else if (streamSet.type == 'audio') {
        if (stream.bandwidth < restrictions.minAudioBandwidth ||
            stream.bandwidth > restrictions.maxAudioBandwidth) {
          stream.allowedByApplication = false;
        }
      }

      if (originalAllowed != stream.allowedByApplication)
        tracksChanged = true;
    });
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
shaka.util.StreamUtils.filterPeriod = function(
    drmEngine, activeStreams, period) {
  var keySystem = '';
  var drmSupportedMimeTypes = null;
  if (drmEngine && drmEngine.initialized()) {
    keySystem = drmEngine.keySystem();
    drmSupportedMimeTypes = drmEngine.getSupportedTypes();
  }

  for (var i = 0; i < period.streamSets.length; ++i) {
    var streamSet = period.streamSets[i];

    if (keySystem) {
      // A key system has been selected.
      // Remove streamSets which can only be used with other key systems.
      // Note that drmInfos == [] means unencrypted.
      var match = streamSet.drmInfos.length == 0 ||
                  streamSet.drmInfos.some(function(drmInfo) {
                    return drmInfo.keySystem == keySystem; });

      if (!match) {
        shaka.log.debug('Dropping StreamSet, can\'t be used with ' + keySystem,
                        streamSet);
        period.streamSets.splice(i, 1);
        --i;
        continue;
      }
    }

    var activeStream = activeStreams[streamSet.type];

    for (var j = 0; j < streamSet.streams.length; ++j) {
      var stream = streamSet.streams[j];
      var fullMimeType = stream.mimeType;
      if (stream.codecs) {
        fullMimeType += '; codecs="' + stream.codecs + '"';
      }

      if (!shaka.media.MediaSourceEngine.isTypeSupported(fullMimeType)) {
        // Remove streams that cannot be played by the platform.
        streamSet.streams.splice(j, 1);
        --j;
        continue;
      }

      if (drmSupportedMimeTypes && stream.encrypted &&
          drmSupportedMimeTypes.indexOf(fullMimeType) < 0) {
        // Remove encrypted streams that cannot be handled by the key system.
        streamSet.streams.splice(j, 1);
        --j;
        continue;
      }

      if (activeStream) {
        // Check that the basic mime types and basic codecs match.
        // For example, we can't adapt between WebM and MP4,
        // nor can we adapt between mp4a.* to ec-3.
        if (stream.mimeType != activeStream.mimeType ||
            stream.codecs.split('.')[0] != activeStream.codecs.split('.')[0]) {
          streamSet.streams.splice(j, 1);
          --j;
          continue;
        }
      }
    }

    if (streamSet.streams.length == 0) {
      period.streamSets.splice(i, 1);
      --i;
    }
  }
};


/**
 * Gets an array of Track objects for the given Period
 *
 * @param {shakaExtern.Period} period
 * @param {Object.<string, shakaExtern.Stream>} activeStreams
 * @return {!Array.<shakaExtern.Track>}
 */
shaka.util.StreamUtils.getTracks = function(period, activeStreams) {
  // Convert each stream into a track and squash them into one array.
  var Functional = shaka.util.Functional;
  return period.streamSets
      .map(function(streamSet) {
        var activeStream = activeStreams ? activeStreams[streamSet.type] : null;
        return streamSet.streams
            .filter(function(stream) {
              return stream.allowedByApplication && stream.allowedByKeySystem;
            })
            .map(function(stream) {
              return {
                id: stream.id,
                active: activeStream == stream,
                type: streamSet.type,
                bandwidth: stream.bandwidth,
                language: streamSet.language,
                kind: stream.kind || null,
                width: stream.width || null,
                height: stream.height || null,
                frameRate: stream.frameRate || undefined,
                codecs: stream.codecs || null
              };
            });
      })
      .reduce(Functional.collapseArrays, []);
};


/**
 * Find the stream and stream set for the given track.
 *
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.Track} track
 * @return {?{stream: shakaExtern.Stream, streamSet: shakaExtern.StreamSet}}
 */
shaka.util.StreamUtils.findStreamForTrack = function(period, track) {
  for (var i = 0; i < period.streamSets.length; i++) {
    var streamSet = period.streamSets[i];
    for (var j = 0; j < streamSet.streams.length; j++) {
      var stream = streamSet.streams[j];
      if (stream.id == track.id)
        return {stream: stream, streamSet: streamSet};
    }
  }
  return null;
};


/**
 * Determines if the given stream set has any playable streams.
 * @param {shakaExtern.StreamSet} streamSet
 * @return {boolean}
 */
shaka.util.StreamUtils.hasPlayableStreams = function(streamSet) {
  return streamSet.streams.some(function(stream) {
    return stream.allowedByApplication && stream.allowedByKeySystem;
  });
};


/**
 * Chooses a stream set of each type according to the given config.
 *
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.PlayerConfiguration} config
 * @param {!Object=} opt_languageMatches
 * @return {!Object.<string, shakaExtern.StreamSet>}
 */
shaka.util.StreamUtils.chooseStreamSets = function(
    period, config, opt_languageMatches) {
  var LanguageUtils = shaka.util.LanguageUtils;
  var hasPlayableStreams = shaka.util.StreamUtils.hasPlayableStreams;
  var StreamUtils = shaka.util.StreamUtils;

  // Choose the first stream set listed as the default.
  /** @type {!Object.<string, shakaExtern.StreamSet>} */
  var streamSetsByType = {};
  period.streamSets.forEach(function(set) {
    if (!hasPlayableStreams(set) || set.type in streamSetsByType) return;
    streamSetsByType[set.type] = set;
  });

  // Pick video set with highest top resolution, break ties
  // by selecting one with lower average bandwidth
  var highestResolution = 0;
  period.streamSets.forEach(function(set) {
    if (hasPlayableStreams(set) && set.type == 'video') {
      var resolution = StreamUtils.getHighestResolution(set);
      if (resolution > highestResolution) {
        highestResolution = resolution;
        streamSetsByType['video'] = set;
      } else if (resolution == highestResolution) {
        if (StreamUtils.getAvgBandwidth(set) <
            StreamUtils.getAvgBandwidth(streamSetsByType['video'])) {
          streamSetsByType['video'] = set;
        }
      }
    }
  });


  // Then if there are primary stream sets, override the default.
  period.streamSets.forEach(function(set) {
    if (hasPlayableStreams(set) && set.primary) {
      // if both sets are primary, choose one with lower
      // average bandwidth
      if (streamSetsByType[set.type].primary) {
        if (StreamUtils.getAvgBandwidth(set) <
            StreamUtils.getAvgBandwidth(streamSetsByType[set.type])) {
          streamSetsByType[set.type] = set;
        }
      } else {
        streamSetsByType[set.type] = set;
      }
    }
  });

  // Finally, choose based on language preference.  Favor exact matches, then
  // base matches, finally different subtags.  Execute in reverse order so
  // the later steps override the previous ones.
  [LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY,
   LanguageUtils.MatchType.BASE_LANGUAGE_OKAY,
   LanguageUtils.MatchType.EXACT]
      .forEach(function(matchType) {
        period.streamSets.forEach(function(set) {
          if (!hasPlayableStreams(set))
            return;

          /** @type {string} */
          var pref;
          if (set.type == 'audio')
            pref = config.preferredAudioLanguage;
          else if (set.type == 'text')
            pref = config.preferredTextLanguage;

          if (pref) {
            pref = LanguageUtils.normalize(pref);
            var lang = LanguageUtils.normalize(set.language);
            if (LanguageUtils.match(matchType, pref, lang)) {
              // If this audio stream has the same language as a previous
              // match, only choose it if it uses less bandwidth.
              if (set.language == streamSetsByType[set.type].language) {
                if (StreamUtils.getAvgBandwidth(set) <
                    StreamUtils.getAvgBandwidth(streamSetsByType[set.type])) {
                  streamSetsByType[set.type] = set;
                }
              } else {
                streamSetsByType[set.type] = set;
              }
              if (opt_languageMatches)
                opt_languageMatches[set.type] = true;
            }
          }
        });
      });

  return streamSetsByType;
};


/**
 * Computes average bandwidth across all streams of a stream set.
 * Assumes a stream set of audio/video type, where all streams have
 * bandwidth.
 *
 * @param {shakaExtern.StreamSet} streamSet
 * @return {number}
 */
shaka.util.StreamUtils.getAvgBandwidth = function(streamSet) {
  var bandwidthSum = 0;

  // to make sure we don't end up trying to divide by 0
  if (!streamSet || streamSet.streams.length < 1) return bandwidthSum;

  streamSet.streams.forEach(function(stream) {
    bandwidthSum += stream.bandwidth;
  });

  return bandwidthSum / streamSet.streams.length;
};


/**
 * Loops through all the streams in a StreamSet and returns the value
 * of the highest resolution found across all streams.
 * Assumes a valid video StreamSet.
 *
 * @param {shakaExtern.StreamSet} streamSet
 * @return {number}
 */
shaka.util.StreamUtils.getHighestResolution = function(streamSet) {
  var highestRes = 0;
  if (!streamSet) return highestRes;

  streamSet.streams.forEach(function(stream) {
    if (stream.height > highestRes)
      highestRes = stream.height;
  });

  return highestRes;
};
