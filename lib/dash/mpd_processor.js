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
 * @fileoverview Processes, filters, and interprets an MPD.
 */

goog.provide('shaka.dash.MpdProcessor');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.dash.SegmentIndex');
goog.require('shaka.dash.SegmentReference');
goog.require('shaka.dash.mpd');
goog.require('shaka.log');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.player.Player');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.MultiMap');



/**
 * Set up an MPD processor.
 * @param {shaka.player.DashVideoSource.ContentProtectionCallback}
 *     interpretContentProtection
 * @constructor
 * @struct
 */
shaka.dash.MpdProcessor = function(interpretContentProtection) {
  /** @private {shaka.player.DashVideoSource.ContentProtectionCallback} */
  this.interpretContentProtection_ = interpretContentProtection;

  /**
   * @private {!Array.<shaka.dash.MpdProcessor.AdaptationSetMapAndDrmScheme>}
   */
  this.adaptationSetMapAndDrmSchemeByPeriod_ = [];
};


/**
 * Maps content types to collections of AdaptationSets.
 * @typedef {!shaka.util.MultiMap.<!shaka.dash.mpd.AdaptationSet>}
 */
shaka.dash.MpdProcessor.AdaptationSetMap;


/**
 * @typedef {{adaptationSetMap: !shaka.dash.MpdProcessor.AdaptationSetMap,
 *            drmScheme: shaka.player.DrmSchemeInfo}}
 */
shaka.dash.MpdProcessor.AdaptationSetMapAndDrmScheme;


/**
 * Determine the full MIME type of a Representation.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @return {string}
 */
shaka.dash.MpdProcessor.representationMimeType = function(representation) {
  var type = representation.mimeType || '';
  if (representation.codecs) {
    type += '; codecs="' + representation.codecs + '"';
  }
  return type;
};


/**
 * Process the MPD.  The MPD will be modified by having unsupported
 * Representations and AdaptationSets removed, setting userData fields on
 * Representations and AdaptationSets, and sorting Representations.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 */
shaka.dash.MpdProcessor.prototype.process = function(mpd) {
  // First, check that each Representation has only one of SegmentBase,
  // SegmentList, or SegmentTemplate.
  this.validateSegmentInfo_(mpd);

  // Next, fix up period start/duration and MPD duration attributes.
  this.calculateDurations_(mpd);

  // Next, generate concrete Representations from SegmentTemplates.
  this.processSegmentTemplates_(mpd);

  // Next, fix up durations again since SegmentLists have been generated.
  this.calculateDurations_(mpd);

  // Next, filter out any invalid Representations.
  this.filterRepresentations_(mpd);

  // Next, build segment indexes for each SegmentList.
  this.buildSegmentIndexes_(mpd);

  // Next, bubble up DRM scheme info to the AdaptationSet level.
  this.bubbleUpDrmSchemes_(mpd);

  // Next, sort the Representations by bandwidth.
  this.sortRepresentations_(mpd);

  // Finally, choose AdaptationSets for each period.
  this.chooseAdaptationSets_(mpd);
};


/**
 * Get the number of processed periods.
 *
 * @return {number}
 */
shaka.dash.MpdProcessor.prototype.getNumPeriods = function() {
  return this.adaptationSetMapAndDrmSchemeByPeriod_.length;
};


/**
 * Get the processed AdaptationSets for a given period.
 *
 * @param {number} periodIdx
 * @param {string=} opt_type Optional content type. If left undefined then all
 *     AdaptationSets are returned for the given period.
 * @return {!Array.<!shaka.dash.mpd.AdaptationSet>}
 */
shaka.dash.MpdProcessor.prototype.getAdaptationSets = function(
    periodIdx, opt_type) {
  shaka.asserts.assert(
      periodIdx >= 0 &&
      periodIdx < this.adaptationSetMapAndDrmSchemeByPeriod_.length);

  var tuple = this.adaptationSetMapAndDrmSchemeByPeriod_[periodIdx];
  if (!tuple) {
    return [];
  }

  return opt_type ?
         tuple.adaptationSetMap.get(opt_type) || [] :
         tuple.adaptationSetMap.getAll();
};


/**
 * Get the common DRM scheme for a given period.
 *
 * @param {number} periodIdx
 * @return {shaka.player.DrmSchemeInfo}
 */
shaka.dash.MpdProcessor.prototype.getDrmScheme = function(periodIdx) {
  shaka.asserts.assert(
      periodIdx >= 0 &&
      periodIdx < this.adaptationSetMapAndDrmSchemeByPeriod_.length);

  var tuple = this.adaptationSetMapAndDrmSchemeByPeriod_[periodIdx];
  if (!tuple) {
    return null;
  }

  return tuple.drmScheme;
};


/**
 * Select AdaptationSets for a given period.
 *
 * @param {number} periodIdx
 * @param {string} preferredLang The preferred language.
 * @return {!Array.<!shaka.dash.mpd.AdaptationSet>}
 */
shaka.dash.MpdProcessor.prototype.selectAdaptationSets = function(
    periodIdx, preferredLang) {
  shaka.asserts.assert(
      periodIdx >= 0 &&
      periodIdx < this.adaptationSetMapAndDrmSchemeByPeriod_.length);

  var tuple = this.adaptationSetMapAndDrmSchemeByPeriod_[periodIdx];
  if (!tuple) {
    return [];
  }

  var sets = [];

  // Add a video AdaptationSet.
  var videoSets = tuple.adaptationSetMap.get('video');
  if (videoSets && videoSets.length > 0) {
    shaka.asserts.assert(videoSets.length == 1);
    sets.push(videoSets[0]);
  }

  // Add an audio AdaptationSet.
  var audioSets = tuple.adaptationSetMap.get('audio');
  if (audioSets && audioSets.length > 0) {
    var favoredAudioSets =
        this.filterSetsByLanguage_(audioSets, preferredLang);

    // If no matches were found, take the first audio set.
    sets.push(favoredAudioSets.length > 0 ? favoredAudioSets[0] : audioSets[0]);
  }

  // Add a text AdaptationSet.
  var textSets = tuple.adaptationSetMap.get('text');
  if (textSets && textSets.length > 0) {
    var favoredTextSets =
        this.filterSetsByLanguage_(textSets, preferredLang);

    // If no matches were found, take the first subtitle set.
    var textSet = favoredTextSets.length > 0 ? favoredTextSets[0] :
                                               textSets[0];
    sets.push(textSet);
  }

  return sets;
};


/**
 * Enforces restrictions on the video Representations can be used.
 * Representations which exceed any of these restrictions will be removed.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.player.DrmSchemeInfo.Restrictions} restrictions
 */
shaka.dash.MpdProcessor.prototype.enforceRestrictions =
    function(mpd, restrictions) {
  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];

    for (var j = 0; j < period.adaptationSets.length; ++j) {
      var adaptationSet = period.adaptationSets[j];

      for (var k = 0; k < adaptationSet.representations.length; ++k) {
        var representation = adaptationSet.representations[k];
        var remove = false;

        if (restrictions.maxWidth &&
            representation.width > restrictions.maxWidth) {
          remove = true;
        }

        if (restrictions.maxHeight &&
            representation.height > restrictions.maxHeight) {
          remove = true;
        }

        if (remove) {
          adaptationSet.representations.splice(k, 1);
          --k;
        }
      }  // for k
    }  // for j
  }  // for i
};


/**
 * Returns a list of sets matching the preferred language.
 *
 * @param {Array.<!shaka.dash.mpd.AdaptationSet>} sets
 * @param {string} preferredLang The preferred language.
 * @return {!Array.<!shaka.dash.mpd.AdaptationSet>}
 * @private
 */
shaka.dash.MpdProcessor.prototype.filterSetsByLanguage_ =
    function(sets, preferredLang) {
  // Alias.
  var LanguageUtils = shaka.util.LanguageUtils;

  if (sets && sets.length > 0) {
    // Do a fuzzy match and stop on the lowest successful fuzz level.
    var favoredSets;
    for (var fuzz = LanguageUtils.MatchType.MIN;
         fuzz <= LanguageUtils.MatchType.MAX;
         ++fuzz) {
      favoredSets = sets.filter(
          function(set) {
            var candidate = set.lang || '';
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
 * Calculate each Period's start and duration as well as the MPD's duration.
 *
 * @see ISO/IEC 23009-1:2014 section 5.3.2.1
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @private
 */
shaka.dash.MpdProcessor.prototype.calculateDurations_ = function(mpd) {
  if (!mpd.periods.length) {
    return;
  }

  // "If the 'start' attribute is absent, and the Period element is the first
  // in the MPD, and the MPD type is 'static', then the Period.start time shall
  // be set to zero."
  if (mpd.type == 'static' && mpd.periods[0].start == null) {
    mpd.periods[0].start = 0;
  }

  // If it's zero or truthy, it's set.  This means null and NaN are not set.
  var isSet = function(x) { return x == 0 || !!x; };

  if (mpd.periods.length == 1 &&
      !isSet(mpd.periods[0].duration) &&
      isSet(mpd.duration)) {
    // Assume the period's duration is equal to the MPD's
    // 'mediaPresentationDuration' attribute.
    mpd.periods[0].duration = mpd.duration;
  }

  var totalDuration = 0;

  for (var i = 0; i < mpd.periods.length; ++i) {
    var previousPeriod = mpd.periods[i - 1];
    var period = mpd.periods[i];

    this.calculatePeriodDuration_(period);
    shaka.log.debug('Period duration', period.duration);

    // "The Period extends until the Period.start of the next Period, or until
    // the end of the Media Presentation in the case of the last Period."
    var nextPeriod = mpd.periods[i + 1] || { start: mpd.duration };

    // "If the 'start' attribute is absent, but the previous period contains a
    // 'duration' attribute, the start time of the new Period is the sum of the
    // start time of the previous period Period.start and the value of the
    // attribute 'duration' of the previous Period."
    if (!isSet(period.start) &&
        previousPeriod && isSet(previousPeriod.duration)) {
      shaka.asserts.assert(isSet(previousPeriod.start));
      period.start = previousPeriod.start + previousPeriod.duration;
    }
    shaka.asserts.assert(isSet(period.start));

    // "The difference between the start time of a Period and the start time
    // of the following Period is the duration of the media content represented
    // by this Period."
    if (!isSet(period.duration) && isSet(nextPeriod.start)) {
      period.duration = nextPeriod.start - period.start;
    }
    shaka.asserts.assert(isSet(period.duration));

    totalDuration += period.duration;
  }
  shaka.asserts.assert(isSet(totalDuration));

  var finalPeriod = mpd.periods[mpd.periods.length - 1];
  // "The Media Presentation Duration is provided either as the value of MPD
  // 'mediaPresentationDuration' attribute if present, or as the sum of
  // Period.start + Period.duration of the last Period."
  if (!isSet(mpd.duration) &&
      isSet(finalPeriod.start) && isSet(finalPeriod.duration)) {
    mpd.duration = finalPeriod.start + finalPeriod.duration;
  }
  shaka.asserts.assert(isSet(mpd.duration));
  shaka.asserts.assert(totalDuration == mpd.duration);
};


/**
 * Calculate |period|'s duration based upon its Representations.
 *
 * @param {!shaka.dash.mpd.Period} period
 *
 * @private
 */
shaka.dash.MpdProcessor.prototype.calculatePeriodDuration_ = function(period) {
  if (period.duration) {
    return;
  }

  var maxDuration = null;

  for (var i = 0; i < period.adaptationSets.length; ++i) {
    var adaptationSet = period.adaptationSets[i];
    for (var j = 0; j < adaptationSet.representations.length; ++j) {
      var representation = adaptationSet.representations[j];

      if (!representation.segmentList) {
        continue;
      }

      var segmentListDuration =
          this.calculateSegmentListDuration_(representation.segmentList);

      maxDuration = Math.max(maxDuration, segmentListDuration);
    }
  }

  period.duration = maxDuration;
};


/**
 * Calculates the duration of a SegmentList.
 * @param {!shaka.dash.mpd.SegmentList} segmentList
 *
 * @return {number} The duration of |segmentList|.
 * @private
 */
shaka.dash.MpdProcessor.prototype.calculateSegmentListDuration_ = function(
    segmentList) {
  if (segmentList.segmentDuration) {
    return segmentList.segmentDuration /
           segmentList.timescale *
           segmentList.segmentUrls.length;
  }

  var totalUnscaledDuration = 0;

  for (var i = 0; i < segmentList.segmentUrls.length; ++i) {
    var segmentUrl = segmentList.segmentUrls[i];

    shaka.asserts.assert(segmentUrl.duration);
    totalUnscaledDuration += segmentUrl.duration;
  }

  return totalUnscaledDuration / segmentList.timescale;
};


/**
 * Ensure that each Representation has only one of SegmentBase, SegmentList,
 * or SegmentTemplate.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 *
 * @private
 */
shaka.dash.MpdProcessor.prototype.validateSegmentInfo_ = function(mpd) {
  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];
    for (var j = 0; j < period.adaptationSets.length; ++j) {
      var adaptationSet = period.adaptationSets[j];
      if (adaptationSet.contentType == 'text') continue;

      for (var k = 0; k < adaptationSet.representations.length; ++k) {
        var representation = adaptationSet.representations[k];

        var n = 0;
        n += representation.segmentBase ? 1 : 0;
        n += representation.segmentList ? 1 : 0;
        n += representation.segmentTemplate ? 1 : 0;

        if (n == 0) {
          shaka.log.warning(
              'Representation does not contain any segment information. ' +
              'Representation must contain one of SegmentBase, ' +
              'SegmentList, or SegmentTemplate.');
          adaptationSet.representations.splice(k, 1);
          --k;
        } else if (n != 1) {
          shaka.log.warning(
              'Representation contains multiple segment information sources. ' +
              'Representation should only contain one of SegmentBase, ' +
              'SegmenstList, or SegmentTemplate.');
          if (representation.segmentBase) {
            shaka.log.info('Using SegmentBase by default.');
            representation.segmentList = null;
            representation.segmentTemplate = null;
          } else if (representation.segmentList) {
            shaka.log.info('Using SegmentList by default.');
            representation.segmentTemplate = null;
          } else {
            shaka.asserts.unreachable();
          }
        }
      }  // for k
    }
  }
};


/**
 * Generates either a SegmentBase or SegmentList for each Representation that
 * uses a SegmentTemplate.
 *
 * @see ISO/IEC 23009-1:2014 section 5.3.9.4
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @private
 */
shaka.dash.MpdProcessor.prototype.processSegmentTemplates_ = function(mpd) {
  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];
    for (var j = 0; j < period.adaptationSets.length; ++j) {
      var adaptationSet = period.adaptationSets[j];
      for (var k = 0; k < adaptationSet.representations.length; ++k) {
        var representation = adaptationSet.representations[k];

        if (!representation.segmentTemplate) {
          continue;
        }

        var segmentTemplate = representation.segmentTemplate;

        // Prefer an explicit segment index URL, then a segment timeline, and
        // then a segment duration.
        if (segmentTemplate.indexUrlTemplate) {
          if (segmentTemplate.timeline) {
            shaka.log.warning(
                'Ignoring segment timeline because an explicit segment index ' +
                'URL was provided for the SegmentTemplate.');
          }
          if (segmentTemplate.duration) {
            shaka.log.warning(
                'Ignoring segment duration because an explicit segment index ' +
                'URL was provided for the SegmentTemplate.');
          }
          this.generateSegmentBase_(representation);
          if (!representation.segmentBase) {
            // An error has already been logged.
            adaptationSet.representations.splice(k, 1);
            --k;
          }
        } else if (segmentTemplate.timeline) {
          if (segmentTemplate.segmentDuration) {
            shaka.log.warning(
                'Ignoring segment duration because a segment timeline was ' +
                'provided for the SegmentTemplate.');
          }
          this.generateSegmentListFromTimeline_(representation);
          if (!representation.segmentList) {
            // An error has already been logged.
            adaptationSet.representations.splice(k, 1);
            --k;
          }
        } else if (segmentTemplate.segmentDuration) {
          if (period.duration) {
            this.generateSegmentListFromDuration_(
                representation,
                period.duration);
            if (!representation.segmentList) {
              // An error has already been logged.
              adaptationSet.representations.splice(k, 1);
              --k;
            }
          } else {
            shaka.log.error(
                'SegmentTemplate provides a segment duration but the ' +
                'Period\'s duration is unknown.');
            adaptationSet.representations.splice(k, 1);
            --k;
          }
        } else {
          shaka.log.error(
              'SegmentTemplate does not provide a segment timeline, a ' +
              'segment duration, or an explicit index URL template.');
          adaptationSet.representations.splice(k, 1);
          --k;
        }
      }  // for k
    }
  }
};


/**
 * Generates a SegmentBase from a SegmentTemplate.
 * Sets |representation.segmentBase| on success.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 *
 * @private
 */
shaka.dash.MpdProcessor.prototype.generateSegmentBase_ = function(
    representation) {
  shaka.asserts.assert(representation.segmentBase == null);
  shaka.asserts.assert(representation.segmentList == null);
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.indexUrlTemplate);

  var segmentTemplate = representation.segmentTemplate;
  var segmentBase = new shaka.dash.mpd.SegmentBase();

  segmentBase.representationIndex =
      this.generateRepresentationIndex_(representation);
  if (!segmentBase.representationIndex) {
    // An error has already been logged.
    return;
  }

  segmentBase.initialization = this.generateInitialization_(representation);

  // Generate the media URL. Since there is no SegmentTimeline there is only
  // one media URL, so just map $Number$ to 1 and $Time$ to 0.
  var mediaUrl;
  if (segmentTemplate.mediaUrlTemplate) {
    var filledUrlTemplate = this.fillUrlTemplate_(
        segmentTemplate.mediaUrlTemplate,
        representation.id,
        1,
        representation.bandwidth,
        0);

    if (!filledUrlTemplate) {
      // An error has already been logged.
      return;
    }

    mediaUrl = representation.baseUrl ?
               representation.baseUrl.resolve(filledUrlTemplate) :
               filledUrlTemplate;
  } else {
    // Fallback to the Representation's URL.
    mediaUrl = representation.baseUrl;
  }

  segmentBase.mediaUrl = mediaUrl;
  representation.segmentBase = segmentBase;
};


/**
 * Generates a SegmentList from a SegmentTemplate which has a segment timeline.
 * Sets |representation.segmentList| on success.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 *
 * @private
 */
shaka.dash.MpdProcessor.prototype.generateSegmentListFromTimeline_ = function(
    representation) {
  shaka.asserts.assert(representation.segmentBase == null);
  shaka.asserts.assert(representation.segmentList == null);
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.timeline);

  var segmentTemplate = representation.segmentTemplate;
  if (!segmentTemplate.mediaUrlTemplate) {
    shaka.log.error('SegmentTemplate provided without a media URL template.');
    return;
  }

  var segmentList = new shaka.dash.mpd.SegmentList();

  // Note: do not copy |segmentDuration| since the segments may have different
  // lengths.
  segmentList.timescale = segmentTemplate.timescale;
  segmentList.presentationTimeOffset = segmentTemplate.presentationTimeOffset;
  segmentList.firstSegmentNumber = segmentTemplate.firstSegmentNumber;
  segmentList.initialization = this.generateInitialization_(representation);
  segmentList.segmentUrls = [];

  // Generate SegmentUrls.
  var timePoints = segmentTemplate.timeline.timePoints;

  // The current segment number.
  var segmentNumber = 1;
  var lastEndTime = -1;

  for (var i = 0; i < timePoints.length; ++i) {
    var repeat = timePoints[i].repeat || 0;
    for (var j = 0; j <= repeat; ++j) {
      if (!timePoints[i].duration) {
        shaka.log.warning(
            'SegmentTimeline "S" element does not have a duration.',
            timePoints[i]);
        return;
      }

      // Compute the time-point's true unscaled start time.
      var startTime;
      if (timePoints[i].startTime && j == 0) {
        startTime = timePoints[i].startTime;
      } else {
        if (i == 0 && j == 0) {
          startTime = 0;
        } else {
          startTime = lastEndTime;
        }
      }

      shaka.asserts.assert(startTime >= 0);

      if (lastEndTime >= 0 && startTime > lastEndTime) {
        // The start of the current segment may begin before the end of the
        // last segment, but there should not be a gap between them.
        shaka.log.warning(
            'SegmentTimeline "S" element does not have a valid start time. ' +
            'There is no segment information for the time range ' +
            lastEndTime + ' to ' + startTime + '.',
            timePoints[i]);
        return;
      }

      lastEndTime = startTime + timePoints[i].duration;

      // Generate the media URL.
      shaka.asserts.assert(segmentTemplate.mediaUrlTemplate);
      var filledUrlTemplate = this.fillUrlTemplate_(
          segmentTemplate.mediaUrlTemplate,
          representation.id,
          segmentNumber - 1 + segmentTemplate.firstSegmentNumber,
          representation.bandwidth,
          startTime);

      if (!filledUrlTemplate) {
        // An error has already been logged.
        return;
      }

      var mediaUrl = representation.baseUrl ?
                     representation.baseUrl.resolve(filledUrlTemplate) :
                     filledUrlTemplate;

      // Create the SegmentUrl.
      var segmentUrl = new shaka.dash.mpd.SegmentUrl();
      segmentUrl.mediaUrl = mediaUrl;
      segmentUrl.startTime = startTime;
      segmentUrl.duration = timePoints[i].duration;

      segmentList.segmentUrls.push(segmentUrl);

      ++segmentNumber;
    } // for j
  }

  representation.segmentList = segmentList;
};


/**
 * Generates a SegmentList from a SegmentTemplate which has a segment duration.
 * Sets |representation.segmentList| on success.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} periodDuration
 *
 * @private
 */
shaka.dash.MpdProcessor.prototype.generateSegmentListFromDuration_ = function(
    representation, periodDuration) {
  shaka.asserts.assert(representation.segmentBase == null);
  shaka.asserts.assert(representation.segmentList == null);
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.segmentDuration);

  var segmentTemplate = representation.segmentTemplate;
  if (!segmentTemplate.mediaUrlTemplate) {
    shaka.log.error('SegmentTemplate provided without a media URL template.');
    return;
  }

  var segmentList = new shaka.dash.mpd.SegmentList();

  // Note: do not copy |segmentDuration| since the segments may have different
  // lengths.
  segmentList.timescale = segmentTemplate.timescale;
  segmentList.presentationTimeOffset = segmentTemplate.presentationTimeOffset;
  segmentList.firstSegmentNumber = segmentTemplate.firstSegmentNumber;
  segmentList.initialization = this.generateInitialization_(representation);
  segmentList.segmentUrls = [];

  // The current segment number.
  var segmentNumber = 1;
  var startTime = 0;

  while ((startTime / segmentList.timescale) < periodDuration) {
    // Generate the media URL.
    shaka.asserts.assert(segmentTemplate.mediaUrlTemplate);
    var filledUrlTemplate = this.fillUrlTemplate_(
        segmentTemplate.mediaUrlTemplate,
        representation.id,
        segmentNumber - 1 + segmentTemplate.firstSegmentNumber,
        representation.bandwidth,
        startTime);

    if (!filledUrlTemplate) {
      // An error has already been logged.
      return;
    }

    var mediaUrl = representation.baseUrl ?
                   representation.baseUrl.resolve(filledUrlTemplate) :
                   filledUrlTemplate;

    // Create the SegmentUrl.
    var segmentUrl = new shaka.dash.mpd.SegmentUrl();
    segmentUrl.mediaUrl = mediaUrl;
    segmentUrl.startTime = startTime;
    segmentUrl.duration = segmentTemplate.segmentDuration;

    segmentList.segmentUrls.push(segmentUrl);

    ++segmentNumber;
    startTime += segmentTemplate.segmentDuration;
  }

  representation.segmentList = segmentList;
};


/**
 * Generates a RepresentationIndex from a SegmentTemplate.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 *
 * @return {shaka.dash.mpd.RepresentationIndex} A RepresentationIndex on
 *     success, null if no index URL template exists or an error occurred.
 * @private
 */
shaka.dash.MpdProcessor.prototype.generateRepresentationIndex_ = function(
    representation) {
  shaka.asserts.assert(representation.segmentTemplate);

  var segmentTemplate = representation.segmentTemplate;
  if (!segmentTemplate.indexUrlTemplate) {
    return null;
  }

  var representationIndex = new shaka.dash.mpd.RepresentationIndex();

  // $Number$ and $Time$ cannot be present in an index URL template.
  var filledUrlTemplate = this.fillUrlTemplate_(
      segmentTemplate.indexUrlTemplate,
      representation.id,
      null,
      representation.bandwidth,
      null);

  if (!filledUrlTemplate) {
    // An error has already been logged.
    return null;
  }

  if (representation.baseUrl && filledUrlTemplate) {
    representationIndex.url =
        representation.baseUrl.resolve(filledUrlTemplate);
  } else {
    representationIndex.url = filledUrlTemplate;
  }

  return representationIndex;
};


/**
 * Generates an Initialization from a SegmentTemplate.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 *
 * @return {shaka.dash.mpd.Initialization} An Initialization on success, null
 *     if no initialization URL template exists or an error occurred.
 * @private
 */
shaka.dash.MpdProcessor.prototype.generateInitialization_ = function(
    representation) {
  shaka.asserts.assert(representation.segmentTemplate);

  var segmentTemplate = representation.segmentTemplate;
  if (!segmentTemplate.initializationUrlTemplate) {
    // This is not an error: the segments may be self initializing.
    return null;
  }

  var initialization = new shaka.dash.mpd.Initialization();

  // $Number$ and $Time$ cannot be present in an initialization URL template.
  var filledUrlTemplate = this.fillUrlTemplate_(
      segmentTemplate.initializationUrlTemplate,
      representation.id,
      null,
      representation.bandwidth,
      null);

  if (!filledUrlTemplate) {
    // An error has already been logged.
    return null;
  }

  if (representation.baseUrl && filledUrlTemplate) {
    initialization.url =
        representation.baseUrl.resolve(filledUrlTemplate);
  } else {
    initialization.url = filledUrlTemplate;
  }

  return initialization;
};


/**
 * Fills a SegmentTemplate URL template.
 *
 * @see ISO/IEC 23009-1:2014 section 5.3.9.4.4
 *
 * @param {string} urlTemplate
 * @param {?string} representationId
 * @param {?number} number
 * @param {?number} bandwidth
 * @param {?number} time
 *
 * @return {goog.Uri} A URL on success; null if the resulting URL contains
 *     illegal characters.
 * @private
 */
shaka.dash.MpdProcessor.prototype.fillUrlTemplate_ = function(
    urlTemplate, representationId, number, bandwidth, time) {
  /** @type {!Object.<string, ?number|?string>} */
  var valueTable = {
    'RepresentationID': representationId,
    'Number': number,
    'Bandwidth': bandwidth,
    'Time': time
  };

  var re = /\$(RepresentationID|Number|Bandwidth|Time)?(?:%0([0-9]+)d)?\$/g;
  var url = urlTemplate.replace(re, function(match, name, widthString) {
    if (match == '$$') {
      return '$';
    }

    var value = valueTable[name];
    shaka.asserts.assert(value !== undefined);

    // Note that |value| may be 0 or ''.
    if (value == null) {
      shaka.log.warning(
          'URL template does not have an available substitution for ' +
          'identifier ' + '"' + name + '".');
      return match;
    }

    if (name == 'RepresentationID' && widthString) {
      shaka.log.warning(
          'URL template should not contain a width specifier for identifier ' +
          '"RepresentationID".');
      widthString = undefined;
    }

    var valueString = value.toString();

    // Create padding string.
    var width = window.parseInt(widthString, 10) || 1;
    var paddingSize = Math.max(0, width - valueString.length);
    var padding = (new Array(paddingSize + 1)).join('0');

    return padding + valueString;
  });

  // The URL might contain illegal characters (e.g., '%').
  try {
    return new goog.Uri(url);
  } catch (exception) {
    if (exception instanceof URIError) {
      shaka.log.warning('URL template contains an illegal character.');
      return null;
    }
    throw exception;
  }
};


/**
 * Builds a SegmentIndex for each SegmentList.
 * Clears each SegmentList's SegmentUrls.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 *
 * @private
 */
shaka.dash.MpdProcessor.prototype.buildSegmentIndexes_ = function(mpd) {
  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];
    for (var j = 0; j < period.adaptationSets.length; ++j) {
      var adaptationSet = period.adaptationSets[j];
      for (var k = 0; k < adaptationSet.representations.length; ++k) {
        var representation = adaptationSet.representations[k];

        if (!representation.segmentList) {
          continue;
        }

        var segmentList = representation.segmentList;

        var segmentIndex = this.createSegmentIndex_(segmentList);
        if (!segmentIndex) {
          // An error has already been logged.
          adaptationSet.representations.splice(k, 1);
          --k;
        }

        // There could be hundreds of SegmentUrls; no need to keep them around.
        segmentList.segmentUrls = [];

        segmentList.userData = segmentIndex;
      }  // for k
    }
  }
};


/**
 * Creates a SegmentIndex from a SegmentList.
 *
 * @param {!shaka.dash.mpd.SegmentList} segmentList
 *
 * @return {shaka.dash.SegmentIndex} A SegmentIndex on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.MpdProcessor.prototype.createSegmentIndex_ = function(segmentList) {
  var timescale = segmentList.timescale;
  var presentationTimeOffset = segmentList.presentationTimeOffset;
  var firstSegmentNumber = segmentList.firstSegmentNumber;
  var segmentDuration = segmentList.segmentDuration;

  /** @type {!Array.<!shaka.dash.SegmentReference>} */
  var references = [];

  for (var i = 0; i < segmentList.segmentUrls.length; ++i) {
    var segmentUrl = segmentList.segmentUrls[i];

    /** @type {number} */
    var startTime = 0;

    /** @type {?number} */
    var endTime = null;

    /** @type {number} */
    var startByte = 0;

    /** @type {?number} */
    var endByte = null;

    // Note that |startTime| may be 0.
    if (segmentUrl.startTime != null) {
      shaka.asserts.assert(segmentUrl.mediaRange == null);
      shaka.asserts.assert(segmentUrl.duration);

      if (i > 0 && segmentList.segmentUrls[i - 1].startTime != null) {
        // Sanity check: there should not be a gap between the end of the last
        // segment and the start of the current segment.
        var lastTime = segmentList.segmentUrls[i - 1].startTime;
        var lastDuration = segmentList.segmentUrls[i - 1].duration;
        shaka.asserts.assert(lastTime + lastDuration >= segmentUrl.startTime);
      }

      startTime = (presentationTimeOffset + segmentUrl.startTime) / timescale;
      endTime = startTime + (segmentUrl.duration / timescale);
    } else {
      shaka.asserts.assert(segmentUrl.duration == null);

      if (!segmentDuration) {
        shaka.log.warning(
            'SegmentList does not contain an explicit segment duration.',
            segmentList);
        return null;
      }

      if (i == 0) {
        startTime = presentationTimeOffset / timescale;
      } else {
        var lastTime = references[i - 1].startTime;
        startTime = lastTime + (segmentDuration / timescale);
      }

      endTime = startTime + (segmentDuration / timescale);

      if (segmentUrl.mediaRange) {
        startByte = segmentUrl.mediaRange.begin;
        endByte = segmentUrl.mediaRange.end;
      }
    }

    shaka.asserts.assert(segmentUrl.mediaUrl);
    references.push(
        new shaka.dash.SegmentReference(
            i,
            startTime,
            endTime,
            startByte,
            endByte,
            /** @type {!goog.Uri} */ (segmentUrl.mediaUrl)));
  }

  return new shaka.dash.SegmentIndex(references);
};


/**
 * Remove the Representations from the given MPD that have inconsistent mime
 * types, that specify unsupported types, or that specify unsupported DRM
 * schemes.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @private
 */
shaka.dash.MpdProcessor.prototype.filterRepresentations_ =
    function(mpd) {
  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];
    for (var j = 0; j < period.adaptationSets.length; ++j) {
      var adaptationSet = period.adaptationSets[j];
      this.removeUnsupportedRepresentations_(adaptationSet);
      this.removeInconsistentRepresentations_(adaptationSet);
      if (adaptationSet.representations.length == 0) {
        // Drop any AdaptationSet in which all Representations have been
        // filtered out. An error has already been logged.
        period.adaptationSets.splice(j, 1);
        --j;
      }
    }
  }
};


/**
 * Remove the Representations from the given AdaptationSet that have a
 * different mime type than the mime type of the first Representation of the
 * given AdaptationSet.
 *
 * @param {!shaka.dash.mpd.AdaptationSet} adaptationSet
 * @private
 */
shaka.dash.MpdProcessor.prototype.removeInconsistentRepresentations_ =
    function(adaptationSet) {
  var desiredMimeType = null;
  for (var i = 0; i < adaptationSet.representations.length; ++i) {
    var representation = adaptationSet.representations[i];
    var mimeType = representation.mimeType || '';
    if (!desiredMimeType) {
      desiredMimeType = mimeType;
    } else if (mimeType != desiredMimeType) {
      shaka.log.warning(
          'Representation has an inconsistent mime type.',
          adaptationSet.representations[i]);
      adaptationSet.representations.splice(i, 1);
      --i;
    }
  }
};


/**
 * Remove the Representations from the given AdaptationSet that have
 * unsupported types or that only use unsupported DRM schemes.
 *
 * @param {!shaka.dash.mpd.AdaptationSet} adaptationSet
 * @private
 */
shaka.dash.MpdProcessor.prototype.removeUnsupportedRepresentations_ =
    function(adaptationSet) {
  var Player = shaka.player.Player;

  for (var i = 0; i < adaptationSet.representations.length; ++i) {
    var representation = adaptationSet.representations[i];
    var type = shaka.dash.MpdProcessor.representationMimeType(representation);

    // Check which schemes the application understands.
    var approvedSchemes = this.getApprovedSchemes_(representation);
    // Filter through those now to find only the ones which use key systems
    // and MIME types the browser supports.
    var supportedSchemes = [];
    var numSupported = 0;
    for (var j = 0; j < approvedSchemes.length; ++j) {
      var scheme = approvedSchemes[j];
      if (Player.isTypeSupported(scheme.keySystem, type)) {
        supportedSchemes.push(scheme);
        ++numSupported;
      }
    }

    // Drop any encrypted Representation whose MIME types and DRM schemes
    // can't be supported by the browser.
    if (numSupported == 0) {
      shaka.log.warning(
          'Representation has an unsupported mime type and DRM ' +
          'scheme combination.',
          adaptationSet.representations[i]);
      adaptationSet.representations.splice(i, 1);
      --i;
      continue;
    }

    // Store the list of schemes for this Representation.
    representation.userData = supportedSchemes;
  }
};


/**
 * Get all application-approved DRM schemes for a representation.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @return {!Array.<!shaka.player.DrmSchemeInfo>} A list of application-approved
 *     schemes.  A dummy scheme structure will be used for unencrypted content.
 *     This dummy scheme will have an empty string for |keySystem| and is used
 *     to simplify calculations later.
 * @private
 */
shaka.dash.MpdProcessor.prototype.getApprovedSchemes_ =
    function(representation) {
  var approvedSchemes = [];
  if (representation.contentProtections.length == 0) {
    // Return a single item which indicates that the content is unencrypted.
    approvedSchemes.push(shaka.player.DrmSchemeInfo.createUnencrypted());
  } else if (this.interpretContentProtection_) {
    for (var i = 0; i < representation.contentProtections.length; ++i) {
      var contentProtection = representation.contentProtections[i];
      var schemeInfo = this.interpretContentProtection_(contentProtection);
      if (schemeInfo) {
        approvedSchemes.push(schemeInfo);
      }
    }
  }
  return approvedSchemes;
};


/**
 * Populate each AdaptationSet with the DRM schemes common to all of its
 * Representations.  This is because we cannot change DRM schemes during
 * playback, so we can only consider the schemes common to all of the
 * Representations within an AdaptationSet.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @private
 */
shaka.dash.MpdProcessor.prototype.bubbleUpDrmSchemes_ = function(mpd) {
  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];
    for (var j = 0; j < period.adaptationSets.length; ++j) {
      var adaptationSet = period.adaptationSets[j];
      this.bubbleUpDrmSchemesInAdaptationSet_(adaptationSet);
    }
  }
};


/**
 * Populate the given AdaptationSet with the DRM schemes common to all of its
 * Representations.
 *
 * @param {!shaka.dash.mpd.AdaptationSet} adaptationSet
 * @private
 */
shaka.dash.MpdProcessor.prototype.bubbleUpDrmSchemesInAdaptationSet_ =
    function(adaptationSet) {
  // Alias.
  var DrmSchemeInfo = shaka.player.DrmSchemeInfo;

  // Start by building a map of all DRM schemes from the representations.
  /** @type {!Object.<string, {drmScheme: !DrmSchemeInfo, count: number}>} */
  var schemeMap = {};

  for (var i = 0; i < adaptationSet.representations.length; ++i) {
    var representation = adaptationSet.representations[i];
    var drmSchemes = /** @type {!Array.<!shaka.player.DrmSchemeInfo>} */ (
        representation.userData);

    // Collect all unique keys.  The same key may appear more than once in
    // drmSchemes, in which case it should only be counted once.
    var keyMap = {};
    for (var j = 0; j < drmSchemes.length; ++j) {
      var drmScheme = drmSchemes[j];
      var key = drmScheme.key();
      keyMap[key] = drmScheme;
    }

    for (var key in keyMap) {
      if (!schemeMap.hasOwnProperty(key)) {
        schemeMap[key] = {drmScheme: keyMap[key], count: 1};
      } else {
        schemeMap[key].count++;
      }
    }
  }

  // Find the key systems which appear in all Representations.
  var numRepresentations = adaptationSet.representations.length;
  var commonDrmSchemes = [];
  for (var key in schemeMap) {
    var entry = schemeMap[key];
    if (entry.count == numRepresentations) {
      // This scheme is common to all representations.
      commonDrmSchemes.push(entry.drmScheme);
    }
  }

  // Store the list of schemes for this AdaptationSet.
  adaptationSet.userData = commonDrmSchemes;
};


/**
 * Sort Representations by bandwidth within each AdaptationSet in the MPD.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @private
 */
shaka.dash.MpdProcessor.prototype.sortRepresentations_ = function(mpd) {
  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];
    for (var j = 0; j < period.adaptationSets.length; ++j) {
      var adaptationSet = period.adaptationSets[j];
      adaptationSet.representations.sort(
          shaka.dash.MpdProcessor.compareByBandwidth_);
    }
  }
};


/**
 * @param {!shaka.dash.mpd.Representation} rep1
 * @param {!shaka.dash.mpd.Representation} rep2
 * @return {number}
 * @private
 */
shaka.dash.MpdProcessor.compareByBandwidth_ = function(rep1, rep2) {
  var b1 = rep1.bandwidth || Number.MAX_VALUE;
  var b2 = rep2.bandwidth || Number.MAX_VALUE;

  if (b1 < b2) {
    return -1;
  } else if (b1 > b2) {
    return 1;
  }

  return 0;
};


/**
 * Choose AdaptationSets for each period.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @private
 */
shaka.dash.MpdProcessor.prototype.chooseAdaptationSets_ = function(mpd) {
  this.adaptationSetMapAndDrmSchemeByPeriod_ = [];
  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];
    this.adaptationSetMapAndDrmSchemeByPeriod_.push(
        this.chooseAdaptationSetsForPeriod_(period));
  }
};


/**
 * Choose AdaptationSets for a given period.
 *
 * @param {!shaka.dash.mpd.Period} period
 * @return {?shaka.dash.MpdProcessor.AdaptationSetMapAndDrmScheme}
 * @private
 */
shaka.dash.MpdProcessor.prototype.chooseAdaptationSetsForPeriod_ =
    function(period) {
  /** @type {!shaka.dash.MpdProcessor.AdaptationSetMap} */
  var byType = new shaka.util.MultiMap();

  /** @type {!shaka.util.MultiMap.<!shaka.dash.mpd.AdaptationSet>} */
  var byKeySystem = new shaka.util.MultiMap();

  // Build multi-maps by both type and key system.
  for (var i = 0; i < period.adaptationSets.length; ++i) {
    var adaptationSet = period.adaptationSets[i];
    var type = adaptationSet.contentType || '';
    byType.push(type, adaptationSet);

    var drmSchemes = /** @type {!Array.<!shaka.player.DrmSchemeInfo>} */ (
        adaptationSet.userData);
    for (var j = 0; j < drmSchemes.length; ++j) {
      var drmScheme = drmSchemes[j];
      byKeySystem.push(drmScheme.keySystem, adaptationSet);
    }
  }

  // For each desired type, make a list of key systems which can supply it.
  // Keep track of the intersection of all of these lists.
  var desiredTypes = ['audio', 'video', 'text'];
  var intersection = null;
  var allKeySystems = byKeySystem.keys();
  for (var i = 0; i < desiredTypes.length; ++i) {
    var type = desiredTypes[i];
    var adaptationSets = byType.get(type);
    if (!adaptationSets) {
      // There is no such type available, so ignore it and move on.
      shaka.log.warning('No AdaptationSets available for ' + type);
      continue;
    }

    var keySystems = this.buildKeySystemList_(adaptationSets, allKeySystems);
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

  var tuple = this.chooseAdaptationSetsByKeySystem_(byType.getAll(), keySystem);

  tuple.adaptationSetMap =
      this.chooseAdaptationSetsByMimeType_(tuple.adaptationSetMap);

  return tuple;
};


/**
 * Build a list of key systems which appear in the list of adaptation sets.
 * If there is an unencrypted adaptation set, all key systems will appear in
 * the output.  This allows an unencrypted source to mix in with all other key
 * systems.
 *
 * @param {!Array.<!shaka.dash.mpd.AdaptationSet>} adaptationSets
 * @param {!Array.<string>} allKeySystems
 * @return {!Array.<string>}
 * @private
 */
shaka.dash.MpdProcessor.prototype.buildKeySystemList_ =
    function(adaptationSets, allKeySystems) {
  /** @type {!Object.<string, null>} */
  var keySystemMap = {};

  for (var i = 0; i < adaptationSets.length; ++i) {
    var adaptationSet = adaptationSets[i];
    var drmSchemes = /** @type {!Array.<!shaka.player.DrmSchemeInfo>} */ (
        adaptationSet.userData);
    for (var j = 0; j < drmSchemes.length; ++j) {
      var drmScheme = drmSchemes[j];
      keySystemMap[drmScheme.keySystem] = null;
    }
  }

  if (keySystemMap.hasOwnProperty('')) {
    // There is an unencrypted set in the list, so this list can match with
    // any key system.
    return allKeySystems;
  }

  return shaka.util.ArrayUtils.fromObjectKeys(keySystemMap);
};


/**
 * Get the AdaptationSets that support the given key system, and get those
 * AdaptationSets' common DRM scheme.
 *
 * @param {!Array.<!shaka.dash.mpd.AdaptationSet>} adaptationSets
 * @param {string} keySystem
 * @return {shaka.dash.MpdProcessor.AdaptationSetMapAndDrmScheme}
 * @private
 */
shaka.dash.MpdProcessor.prototype.chooseAdaptationSetsByKeySystem_ =
    function(adaptationSets, keySystem) {
  /**
   * The AdaptationSets that support |keySystem|.
   * @type {!shaka.util.MultiMap.<!shaka.dash.mpd.AdaptationSet>}
   */
  var allowableAdaptationSetMap = new shaka.util.MultiMap();

  /**
   * The DRM scheme shared by |allowableAdaptationSetMap|.
   * @type {shaka.player.DrmSchemeInfo}
   */
  var commonDrmScheme = null;

  for (var i = 0; i < adaptationSets.length; ++i) {
    var adaptationSet = adaptationSets[i];
    var drmSchemes = /** @type {!Array.<!shaka.player.DrmSchemeInfo>} */ (
        adaptationSet.userData);
    for (var j = 0; j < drmSchemes.length; ++j) {
      var drmScheme = drmSchemes[j];

      // Unencrypted mixes with everything, so the empty keySystem is okay.
      if (drmScheme.keySystem != keySystem && drmScheme.keySystem != '')
        continue;

      shaka.asserts.assert(adaptationSet.contentType != null);
      var type = /** @type {string} */ (adaptationSet.contentType);
      allowableAdaptationSetMap.push(type, adaptationSet);

      if (!commonDrmScheme || !commonDrmScheme.keySystem) {
        commonDrmScheme = drmScheme;
      } else if (drmScheme.keySystem) {
        commonDrmScheme =
            shaka.player.DrmSchemeInfo.combine(commonDrmScheme, drmScheme);
      }
    }
  }

  return {
    adaptationSetMap: allowableAdaptationSetMap,
    drmScheme: commonDrmScheme
  };
};


/**
 * Choose a single video AdaptationSet and a collection of audio AdaptationSets
 * that each have the same mime type. It's assumed that within an
 * AdaptationSet, each Representation has the same mime type as the first
 * Representation within that AdaptationSet.
 *
 * @param {!shaka.dash.MpdProcessor.AdaptationSetMap} byType
 * @return {!shaka.dash.MpdProcessor.AdaptationSetMap}
 * @private
 */
shaka.dash.MpdProcessor.prototype.chooseAdaptationSetsByMimeType_ =
    function(byType) {
  var allowableAdaptationSetMap = new shaka.util.MultiMap();

  // Add one video AdaptationSet.
  var videoSets = byType.get('video');
  if (videoSets) {
    allowableAdaptationSetMap.push('video', videoSets[0]);
  }

  // Add audio AdaptationSets.
  var audioSets = byType.get('audio');
  if (audioSets) {
    for (var i = 0; i < audioSets.length; ++i) {
      if (audioSets[i].mimeType == audioSets[0].mimeType) {
        allowableAdaptationSetMap.push('audio', audioSets[i]);
      }
    }
  }

  // Add text AdaptationSets.
  var textSets = byType.get('text');
  if (textSets) {
    for (var i = 0; i < textSets.length; ++i) {
      allowableAdaptationSetMap.push('text', textSets[i]);
    }
  }

  return allowableAdaptationSetMap;
};

