/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Implements StreamInfoProcessor.
 */

goog.provide('shaka.media.StreamInfoProcessor');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.PeriodInfo');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentMetadataInfo');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.media.StreamSetInfo');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.player.Player');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.MultiMap');



/**
 * Creates a StreamInfoProcessor, which chooses which streams the application
 * and browser can support.
 *
 * @constructor
 * @struct
 */
shaka.media.StreamInfoProcessor = function() {
  /**
   * @private
   *     {!Array.<shaka.media.StreamInfoProcessor.StreamSetInfoMapAndDrmScheme>}
   */
  this.streamSetInfoMapAndDrmSchemeByPeriod_ = [];

  /** @private {number} */
  this.streamDuration_ = 0;
};


/**
 * Maps a content type to an array of StreamSetInfos.
 * @typedef {!shaka.util.MultiMap.<!shaka.media.StreamSetInfo>}
 */
shaka.media.StreamInfoProcessor.StreamSetInfoMap;


/**
 * @typedef
 *     {{streamSetInfoMap: !shaka.media.StreamInfoProcessor.StreamSetInfoMap,
 *       drmScheme: shaka.player.DrmSchemeInfo}}
 */
shaka.media.StreamInfoProcessor.StreamSetInfoMapAndDrmScheme;


/**
 * Processes the given PeriodInfos.
 *
 * @param {!Array.<shaka.media.PeriodInfo>} periodInfos
 */
shaka.media.StreamInfoProcessor.prototype.process = function(periodInfos) {
  this.calculateStreamDuration_(periodInfos);
  this.filterPeriodInfos_(periodInfos);
  this.sortStreamSetInfos_(periodInfos);
  this.chooseStreamSetInfos_(periodInfos);
};


/**
 * Get the number of processed periods.
 *
 * @return {number}
 */
shaka.media.StreamInfoProcessor.prototype.getNumPeriods = function() {
  return this.streamSetInfoMapAndDrmSchemeByPeriod_.length;
};


/**
 * Gets the stream's entire duration.
 *
 * @return {number}
 */
shaka.media.StreamInfoProcessor.prototype.getStreamDuration = function() {
  return this.streamDuration_;
};


/**
 * Gets the StreamSetInfos for the given period.
 *
 * @param {number} periodIdx
 * @param {string=} opt_type Optional content type. If left undefined then all
 *     StreamInfos are returned for the given period.
 * @return {!Array.<!shaka.media.StreamSetInfo>}
 */
shaka.media.StreamInfoProcessor.prototype.getStreamSetInfos = function(
    periodIdx, opt_type) {
  shaka.asserts.assert(
      periodIdx >= 0 &&
      periodIdx < this.streamSetInfoMapAndDrmSchemeByPeriod_.length);

  var tuple = this.streamSetInfoMapAndDrmSchemeByPeriod_[periodIdx];
  if (!tuple) {
    return [];
  }

  return opt_type ?
         tuple.streamSetInfoMap.get(opt_type) || [] :
         tuple.streamSetInfoMap.getAll();
};


/**
 * Gets the common DrmSchemeInfo for the given period.
 *
 * @param {number} periodIdx
 * @return {shaka.player.DrmSchemeInfo}
 */
shaka.media.StreamInfoProcessor.prototype.getDrmScheme = function(periodIdx) {
  shaka.asserts.assert(
      periodIdx >= 0 &&
      periodIdx < this.streamSetInfoMapAndDrmSchemeByPeriod_.length);

  var tuple = this.streamSetInfoMapAndDrmSchemeByPeriod_[periodIdx];
  if (!tuple) {
    return null;
  }

  return tuple.drmScheme;
};


/**
 * Selects the StreamSetInfos for the given period.
 *
 * @param {number} periodIdx
 * @param {string} preferredLang The preferred language.
 * @return {!Array.<!shaka.media.StreamSetInfo>}
 */
shaka.media.StreamInfoProcessor.prototype.selectStreamSetInfos = function(
    periodIdx, preferredLang) {
  shaka.asserts.assert(
      periodIdx >= 0 &&
      periodIdx < this.streamSetInfoMapAndDrmSchemeByPeriod_.length);

  var tuple = this.streamSetInfoMapAndDrmSchemeByPeriod_[periodIdx];
  if (!tuple) {
    return [];
  }

  /** @type {!Array.<!shaka.media.StreamSetInfo>} */
  var streamSetInfos = [];

  // Add a video StreamSetInfo.
  var videoSets = tuple.streamSetInfoMap.get('video');
  if (videoSets && videoSets.length > 0) {
    shaka.asserts.assert(videoSets.length == 1);
    streamSetInfos.push(videoSets[0]);
  }

  // Add an audio StreamSetInfo.
  var audioSets = tuple.streamSetInfoMap.get('audio');
  if (audioSets && audioSets.length > 0) {
    var favoredAudioSets = this.getStreamSetInfosByLanguage_(
        audioSets, preferredLang);

    // If no matches were found, take the first audio set.
    streamSetInfos.push(favoredAudioSets.length > 0 ?
                        favoredAudioSets[0] :
                        audioSets[0]);
  }

  // Add a text StreamSetInfo.
  var textSets = tuple.streamSetInfoMap.get('text');
  if (textSets && textSets.length > 0) {
    var favoredTextSets = this.getStreamSetInfosByLanguage_(
        textSets, preferredLang);

    // If no matches were found, take the first subtitle set.
    streamSetInfos.push(favoredTextSets.length > 0 ?
                        favoredTextSets[0] :
                        textSets[0]);
  }

  return streamSetInfos;
};


/**
 * Returns an array of StreamSetInfos that match the preferred language.
 *
 * @param {Array.<!shaka.media.StreamSetInfo>} streamSetInfos
 * @param {string} preferredLang The preferred language.
 * @return {!Array.<!shaka.media.StreamSetInfo>}
 * @private
 */
shaka.media.StreamInfoProcessor.prototype.getStreamSetInfosByLanguage_ =
    function(streamSetInfos, preferredLang) {
  // Alias.
  var LanguageUtils = shaka.util.LanguageUtils;

  if (streamSetInfos && streamSetInfos.length > 0) {
    // Do a fuzzy match and stop on the lowest successful fuzz level.
    var favoredSets;
    for (var fuzz = LanguageUtils.MatchType.MIN;
         fuzz <= LanguageUtils.MatchType.MAX;
         ++fuzz) {
      favoredSets = streamSetInfos.filter(
          function(set) {
            var candidate = set.streamInfos.length > 0 ?
                            (set.streamInfos[0].lang || '') :
                            '';
            return LanguageUtils.match(fuzz, preferredLang, candidate);
          });
      if (favoredSets.length) {
        return favoredSets;
      }
    }
  }
  return [];
};


/**
 * Enforces restrictions on which StreamInfos can be used.
 * Video StreamInfos which exceed |restrictions| will be removed.
 *
 * @param {!shaka.player.DrmSchemeInfo.Restrictions} restrictions
 */
shaka.media.StreamInfoProcessor.prototype.enforceRestrictions = function(
    restrictions) {
  var numPeriods = this.getNumPeriods();

  if (numPeriods == 0) {
    shaka.log.warning('No periods to apply restrictions to!');
  }

  for (var i = 0; i < numPeriods; ++i) {
    var streamSetInfoMapAndDrmScheme =
        this.streamSetInfoMapAndDrmSchemeByPeriod_[i];
    var streamSetInfoMap = streamSetInfoMapAndDrmScheme.streamSetInfoMap;

    var keys = streamSetInfoMap.keys();
    for (var keyIndex = 0; keyIndex < keys.length; ++keyIndex) {
      var type = keys[keyIndex];

      var streamSetInfos = streamSetInfoMap.get(type);
      for (var j = 0; j < streamSetInfos.length; ++j) {
        var streamSetInfo = streamSetInfos[j];

        for (var k = 0; k < streamSetInfo.streamInfos.length; ++k) {
          var streamInfo = streamSetInfo.streamInfos[k];
          var remove = false;

          if (restrictions.maxWidth &&
              streamInfo.width > restrictions.maxWidth) {
            remove = true;
          }

          if (restrictions.maxHeight &&
              streamInfo.height > restrictions.maxHeight) {
            remove = true;
          }

          if (remove) {
            streamSetInfo.streamInfos.splice(k, 1);
            --k;
          }
        }  // for k
      }  // for j
    }  // for keyIndex
  }
};


/**
 * Calculates the stream's full duration.
 * @param {!Array.<!shaka.media.PeriodInfo>} periodInfos
 *
 * @private
 */
shaka.media.StreamInfoProcessor.prototype.calculateStreamDuration_ = function(
    periodInfos) {
  this.streamDuration_ = 0;

  for (var i = 0; i < periodInfos.length; ++i) {
    var periodInfo = periodInfos[i];
    this.streamDuration_ += periodInfo.duration;
  }
};


/**
 * Removes unsupported StreamInfos from |periodInfos|.
 *
 * @param {!Array.<!shaka.media.PeriodInfo>} periodInfos
 * @private
 */
shaka.media.StreamInfoProcessor.prototype.filterPeriodInfos_ = function(
    periodInfos) {
  for (var i = 0; i < periodInfos.length; ++i) {
    var periodInfo = periodInfos[i];
    for (var j = 0; j < periodInfo.streamSetInfos.length; ++j) {
      var streamSetInfo = periodInfo.streamSetInfos[j];
      this.filterStreamSetInfo_(streamSetInfo);
      if (streamSetInfo.streamInfos.length == 0) {
        // Drop any StreamSetInfo that is empty.
        // An error has already been logged.
        periodInfo.streamSetInfos.splice(j, 1);
        --j;
      }
    }
  }
};


/**
 * Removes any StreamInfo from the given StreamSetInfo that has
 * an unsupported content type and DrmSchemeInfo combination.
 *
 * @param {!shaka.media.StreamSetInfo} streamSetInfo
 * @private
 */
shaka.media.StreamInfoProcessor.prototype.filterStreamSetInfo_ =
    function(streamSetInfo) {
  // Alias.
  var Player = shaka.player.Player;

  for (var i = 0; i < streamSetInfo.streamInfos.length; ++i) {
    var streamInfo = streamSetInfo.streamInfos[i];

    // Filter through those to find only the ones which use key systems and
    // MIME types that the browser supports.
    var numSupported = 0;
    for (var j = 0; j < streamSetInfo.drmSchemes.length; ++j) {
      var scheme = streamSetInfo.drmSchemes[j];
      if (Player.isTypeSupported(scheme.keySystem,
                                 streamInfo.getFullMimeType())) {
        ++numSupported;
      } else {
        streamSetInfo.drmSchemes.splice(j, 1);
        --j;
      }
    }

    // Drop the stream if its MIME type and DRM scheme cannot be supported by
    // the browser.
    if (numSupported == 0) {
      shaka.log.warning(
          'Stream uses an unsupported MIME type and DRM scheme combination.',
          streamInfo);
      streamSetInfo.streamInfos.splice(i, 1);
      --i;
    }
  }
};


/**
 * Sorts each Period's StreamSetInfos by "main-ness" and each StreamSetInfo's
 * StreamInfos by bandwidth.
 *
 * @param {!Array.<!shaka.media.PeriodInfo>} periodInfos
 * @private
 */
shaka.media.StreamInfoProcessor.prototype.sortStreamSetInfos_ = function(
    periodInfos) {
  for (var i = 0; i < periodInfos.length; ++i) {
    var periodInfo = periodInfos[i];
    periodInfo.streamSetInfos.sort(
        shaka.media.StreamInfoProcessor.compareByMain_);
    for (var j = 0; j < periodInfo.streamSetInfos.length; ++j) {
      var streamSetInfo = periodInfo.streamSetInfos[j];
      streamSetInfo.streamInfos.sort(
          shaka.media.StreamInfoProcessor.compareByBandwidth_);
    }
  }
};


/**
 * Compares two StreamSetInfos by "main-ness".
 *
 * @param {!shaka.media.StreamSetInfo} streamSetInfo1
 * @param {!shaka.media.StreamSetInfo} streamSetInfo2
 * @return {number}
 * @private
 */
shaka.media.StreamInfoProcessor.compareByMain_ = function(streamSetInfo1,
                                                          streamSetInfo2) {
  if (streamSetInfo1.main == streamSetInfo2.main) {
    return 0;
  } else if (streamSetInfo1.main) {
    return -1;
  }
  return 1;
};


/**
 * Compares two StreamInfos by bandwidth.
 *
 * @param {!shaka.media.StreamInfo} streamInfo1
 * @param {!shaka.media.StreamInfo} streamInfo2
 * @return {number}
 * @private
 */
shaka.media.StreamInfoProcessor.compareByBandwidth_ = function(
    streamInfo1, streamInfo2) {
  var b1 = streamInfo1.bandwidth || Number.MAX_VALUE;
  var b2 = streamInfo2.bandwidth || Number.MAX_VALUE;

  if (b1 < b2) {
    return -1;
  } else if (b1 > b2) {
    return 1;
  }

  return 0;
};


/**
 * Chooses viable StreamSetInfos for each period.
 *
 * @param {!Array.<!shaka.media.PeriodInfo>} periodInfos
 * @private
 */
shaka.media.StreamInfoProcessor.prototype.chooseStreamSetInfos_ =
    function(periodInfos) {
  this.streamSetInfoMapAndDrmSchemeByPeriod_ = [];

  for (var i = 0; i < periodInfos.length; ++i) {
    var periodInfo = periodInfos[i];
    var tuple = this.chooseStreamSetInfosForPeriod_(periodInfo);
    if (tuple) {
      this.streamSetInfoMapAndDrmSchemeByPeriod_.push(tuple);
    }
  }
};


/**
 * Chooses viable StreamInfos for the given period.
 *
 * @param {!shaka.media.PeriodInfo} periodInfo
 * @return {?shaka.media.StreamInfoProcessor.StreamSetInfoMapAndDrmScheme}
 * @private
 */
shaka.media.StreamInfoProcessor.prototype.chooseStreamSetInfosForPeriod_ =
    function(periodInfo) {
  /** @type {!shaka.media.StreamInfoProcessor.StreamSetInfoMap} */
  var byType = new shaka.util.MultiMap();

  /** @type {!shaka.media.StreamInfoProcessor.StreamSetInfoMap} */
  var byKeySystem = new shaka.util.MultiMap();

  // Build multi-maps by both type and key system.
  for (var i = 0; i < periodInfo.streamSetInfos.length; ++i) {
    var streamSetInfo = periodInfo.streamSetInfos[i];
    byType.push(streamSetInfo.contentType, streamSetInfo);

    var drmSchemes = streamSetInfo.drmSchemes;
    for (var j = 0; j < drmSchemes.length; ++j) {
      var drmScheme = drmSchemes[j];
      byKeySystem.push(drmScheme.keySystem, streamSetInfo);
    }
  }

  // For each desired type, make a list of key systems which can supply it.
  // Keep track of the intersection of all of these lists.
  var desiredTypes = ['audio', 'video', 'text'];
  var intersection = null;
  var allKeySystems = byKeySystem.keys();
  for (var i = 0; i < desiredTypes.length; ++i) {
    var type = desiredTypes[i];
    var streamSetInfos = byType.get(type);
    if (!streamSetInfos) {
      // There is no such type available, so ignore it and move on.
      shaka.log.warning('No streams available for ' + type);
      continue;
    }

    var keySystems =
        this.buildKeySystemList_(streamSetInfos, allKeySystems);
    if (!intersection) {
      intersection = keySystems;
    } else {
      intersection = shaka.util.ArrayUtils.intersect(intersection, keySystems);
    }
  }

  if (!intersection) {
    // There are no key systems which can provide all desired types.
    return null;
  }

  // Any of the key systems in |intersection| is suitable.
  var keySystem = intersection[0];

  // But if unencrypted for everything is an option, prefer that.
  if (intersection.indexOf('') >= 0) {
    keySystem = '';
  }

  var tuple = this.getStreamSetInfosByKeySystem_(
      byType.getAll(), keySystem);

  tuple.streamSetInfoMap =
      this.getStreamSetInfosByMimeType_(tuple.streamSetInfoMap);

  return tuple;
};


/**
 * Gets the key systems that appear in |streamSetInfos|.
 * If there is an unencrypted stream then all key systems will appear in
 * the output.  This allows an unencrypted source to mix in with all other key
 * systems.
 *
 * @param {!Array.<!shaka.media.StreamSetInfo>} streamSetInfos
 * @param {!Array.<string>} allKeySystems
 * @return {!Array.<string>}
 * @private
 */
shaka.media.StreamInfoProcessor.prototype.buildKeySystemList_ =
    function(streamSetInfos, allKeySystems) {
  /** @type {!Object.<string, null>} */
  var keySystemSet = {};

  for (var i = 0; i < streamSetInfos.length; ++i) {
    var streamSetInfo = streamSetInfos[i];
    var drmSchemes = streamSetInfo.drmSchemes;
    for (var j = 0; j < drmSchemes.length; ++j) {
      var drmScheme = drmSchemes[j];
      keySystemSet[drmScheme.keySystem] = null;
    }
  }

  if (keySystemSet.hasOwnProperty('')) {
    // There is an unencrypted stream in the list, so this list can match with
    // any key system.
    return allKeySystems;
  }

  return shaka.util.ArrayUtils.fromObjectKeys(keySystemSet);
};


/**
 * Gets the StreamSetInfos that support the given key system, and gets
 * those StreamSetInfos' common DrmSchemeInfo.
 *
 * @param {!Array.<!shaka.media.StreamSetInfo>} streamSetInfos
 * @param {string} keySystem
 * @return {shaka.media.StreamInfoProcessor.StreamSetInfoMapAndDrmScheme}
 * @private
 */
shaka.media.StreamInfoProcessor.prototype.getStreamSetInfosByKeySystem_ =
    function(streamSetInfos, keySystem) {
  /**
   * The StreamSetInfos that support |keySystem|.
   * @type {!shaka.util.MultiMap.<!shaka.media.StreamSetInfo>}
   */
  var allowableStreamSetInfoMap = new shaka.util.MultiMap();

  /**
   * The DRM scheme shared by |allowableStreamSetInfoMap|.
   * @type {shaka.player.DrmSchemeInfo}
   */
  var commonDrmScheme = null;

  for (var i = 0; i < streamSetInfos.length; ++i) {
    var streamSetInfo = streamSetInfos[i];
    var drmSchemes = streamSetInfo.drmSchemes;

    for (var j = 0; j < drmSchemes.length; ++j) {
      var drmScheme = drmSchemes[j];

      if (drmScheme.keySystem != keySystem && drmScheme.keySystem != '') {
        // Unencrypted mixes with everything, so the empty keySystem is okay.
        continue;
      }

      shaka.asserts.assert(streamSetInfo.contentType != null);
      var type = streamSetInfo.contentType;
      allowableStreamSetInfoMap.push(type, streamSetInfo);

      if (!commonDrmScheme || !commonDrmScheme.keySystem) {
        commonDrmScheme = drmScheme;
      } else if (drmScheme.keySystem) {
        commonDrmScheme =
            shaka.player.DrmSchemeInfo.combine(commonDrmScheme, drmScheme);
      }
    }
  }

  return {
    streamSetInfoMap: allowableStreamSetInfoMap,
    drmScheme: commonDrmScheme
  };
};


/**
 * Gets a single video StreamSetInfo and an array of audio
 * StreamSetInfos that each have the same MIME type. It's assumed that
 * within a StreamSetInfo that each StreamInfo has the same MIME type
 * as the first StreamInfo within that StreamSetInfo.
 *
 * @param {!shaka.media.StreamInfoProcessor.StreamSetInfoMap} byType
 * @return {!shaka.media.StreamInfoProcessor.StreamSetInfoMap}
 * @private
 */
shaka.media.StreamInfoProcessor.prototype.getStreamSetInfosByMimeType_ =
    function(byType) {
  /** @type {!shaka.util.MultiMap.<!shaka.media.StreamSetInfo>} */
  var allowableStreamSetInfoMap = new shaka.util.MultiMap();

  // Add one video StreamSetInfos.
  var videoSets = byType.get('video');
  if (videoSets && videoSets.length > 0) {
    allowableStreamSetInfoMap.push('video', videoSets[0]);
  }

  // Add audio StreamSetInfos.
  var audioSets = byType.get('audio');
  if (audioSets && audioSets.length > 0) {
    shaka.asserts.assert(audioSets[0].streamInfos.length > 0);
    var firstMimeType = audioSets[0].streamInfos[0].mimeType;
    for (var i = 0; i < audioSets.length; ++i) {
      var mimeType = audioSets[i].streamInfos[0].mimeType;
      if (mimeType == firstMimeType) {
        allowableStreamSetInfoMap.push('audio', audioSets[i]);
      }
    }
  }

  // Add text StreamSetInfos.
  var textSets = byType.get('text');
  if (textSets) {
    for (var i = 0; i < textSets.length; ++i) {
      allowableStreamSetInfoMap.push('text', textSets[i]);
    }
  }

  return allowableStreamSetInfoMap;
};

