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

goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');


/**
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.Restrictions} restrictions
 * @return {boolean} Whether the tracks changed.
 */
shaka.util.StreamUtils.applyRestrictions = function(period, restrictions) {
  var tracksChanged = false;

  period.streamSets.forEach(function(streamSet) {
    streamSet.streams.forEach(function(stream) {
      var originalAllowed = stream.allowedByApplication;
      stream.allowedByApplication = true;

      if (streamSet.type == 'video') {
        if (stream.width < restrictions.minWidth ||
            stream.width > restrictions.maxWidth ||
            stream.height < restrictions.minHeight ||
            stream.height > restrictions.maxHeight ||
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
  var supportedMimeTypes = null;
  if (drmEngine && drmEngine.initialized()) {
    keySystem = drmEngine.keySystem();
    supportedMimeTypes = drmEngine.getSupportedTypes();
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
      if (activeStream && streamSet.type != 'text') {
        // Check that the basic mime types match.  For example, you can't switch
        // from WebM to MP4, so if we started with WebM, eliminate MP4.
        if (stream.mimeType != activeStream.mimeType) {
          streamSet.streams.splice(j, 1);
          --j;
          continue;
        }
      }

      var fullMimeType = stream.mimeType;
      if (stream.codecs) {
        fullMimeType += '; codecs="' + stream.codecs + '"';
      }

      if (!shaka.media.MediaSourceEngine.isTypeSupported(fullMimeType)) {
        streamSet.streams.splice(j, 1);
        --j;
        continue;
      }

      if (supportedMimeTypes && stream.encrypted &&
          supportedMimeTypes.indexOf(fullMimeType) < 0) {
        streamSet.streams.splice(j, 1);
        --j;
        continue;
      }
    }

    if (streamSet.streams.length == 0) {
      period.streamSets.splice(i, 1);
      --i;
    }
  }
};


/**
 * Loads the given manifest and creates and initializes the correct manifest
 * parser and DrmEngine.
 *
 * @param {string} manifestUri
 * @param {boolean} isOffline
 * @param {!shaka.net.NetworkingEngine} netEngine
 * @param {shakaExtern.PlayerConfiguration} config
 * @param {function(!shaka.util.Error)} onError
 * @param {function(shakaExtern.Period)} filterPeriod
 * @param {function(!Object.<string, string>)} onKeyStatusesChange
 * @param {shakaExtern.ManifestParser.Factory=} opt_manifestParserFactory
 * @return {!Promise.<{
 *   manifest: shakaExtern.Manifest,
 *   manifestParser: !shakaExtern.ManifestParser,
 *   drmEngine: !shaka.media.DrmEngine
 * }>}
 */
shaka.util.StreamUtils.load = function(
    manifestUri, isOffline, netEngine, config, onError, filterPeriod,
    onKeyStatusesChange, opt_manifestParserFactory) {
  var ret = {};
  return shaka.media.ManifestParser.getFactory(
      manifestUri, netEngine, config.manifest.retryParameters,
      opt_manifestParserFactory).then(function(factory) {
    goog.asserts.assert(factory, 'Manifest factory should be set');

    ret.parser = new factory();
    ret.parser.configure(config.manifest);
    return ret.parser.start(manifestUri, netEngine, filterPeriod, onError);
  }).then(function(manifest) {
    goog.asserts.assert(manifest, 'Manifest should be set');

    ret.manifest = manifest;
    ret.drmEngine =
        new shaka.media.DrmEngine(netEngine, onError, onKeyStatusesChange);
    ret.drmEngine.configure(config.drm);
    return ret.drmEngine.init(manifest, isOffline);
  }).then(function() {
    // Re-filter the manifest after DRM has been initialized.
    ret.manifest.periods.forEach(filterPeriod);
    return ret;
  });
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
                height: stream.height || null
              };
            });
      })
      .reduce(Functional.collapseArrays, []);
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

  // Choose the first stream set listed as the default.
  /** @type {!Object.<string, shakaExtern.StreamSet>} */
  var streamSetsByType = {};
  period.streamSets.forEach(function(set) {
    if (!hasPlayableStreams(set) || set.type in streamSetsByType) return;
    streamSetsByType[set.type] = set;
  });

  // Then if there are primary stream sets, override the default.
  period.streamSets.forEach(function(set) {
    if (hasPlayableStreams(set) && set.primary)
      streamSetsByType[set.type] = set;
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
              streamSetsByType[set.type] = set;
              if (opt_languageMatches)
                opt_languageMatches[set.type] = true;
            }
          }
        });
      });

  return streamSetsByType;
};
