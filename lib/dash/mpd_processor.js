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
 * @fileoverview Implements MpdProcessor.
 */

goog.provide('shaka.dash.MpdProcessor');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.dash.mpd');
goog.require('shaka.log');
goog.require('shaka.media.PeriodInfo');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentMetadataInfo');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.media.StreamSetInfo');



/**
 * Creates an MpdProcessor, which validates MPDs, generates segment information
 * from SegmentTemplate elements, calculates start/duration attributes, removes
 * invalid Representations, and ultimately generates a ManifestInfo.
 *
 * @param {shaka.player.DashVideoSource.ContentProtectionCallback}
 *     interpretContentProtection
 *
 * @constructor
 * @struct
 */
shaka.dash.MpdProcessor = function(interpretContentProtection) {
  /** @private {shaka.player.DashVideoSource.ContentProtectionCallback} */
  this.interpretContentProtection_ = interpretContentProtection;

  /** @type {!shaka.media.ManifestInfo} */
  this.manifestInfo = new shaka.media.ManifestInfo();
};


/**
 * Processes the given MPD. Sets |this.periodInfos|.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 */
shaka.dash.MpdProcessor.prototype.process = function(mpd) {
  this.manifestInfo = new shaka.media.ManifestInfo();

  this.validateSegmentInfo_(mpd);

  // Calculate MPD and period durations before and after expanding any
  // SegmentTemplates. A SegmentTemplate with a segmentDuration attribute
  // requires a Period duration to be expanded. However, other types
  // of SegmentTemplates can be used to derive the Period duration.
  this.calculateDurations_(mpd);
  this.processSegmentTemplates_(mpd);
  this.calculateDurations_(mpd);

  this.filterPeriods_(mpd);
  this.createManifestInfo_(mpd);
};


/**
 * Calculates each Period's start attribute and duration attribute, and
 * calcuates the MPD's duration attribute.
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
 * Calculates |period|'s duration based upon its Representations.
 *
 * @param {!shaka.dash.mpd.Period} period
 * @private
 */
shaka.dash.MpdProcessor.prototype.calculatePeriodDuration_ = function(period) {
  if (period.duration != null) {
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
 * Calculates the given SegmentList's duration.
 *
 * @param {!shaka.dash.mpd.SegmentList} segmentList
 * @return {number} The duration of |segmentList|.
 * @private
 */
shaka.dash.MpdProcessor.prototype.calculateSegmentListDuration_ = function(
    segmentList) {
  if (segmentList.segmentUrls.length == 0) {
    return 0;
  }

  if (segmentList.segmentDuration) {
    return segmentList.segmentDuration /
           segmentList.timescale *
           segmentList.segmentUrls.length;
  }

  // Add the time before the SegmentList's first segment to the SegmentList's
  // duration.
  shaka.asserts.assert(segmentList.segmentUrls[0].startTime != null);
  var totalUnscaledDuration = segmentList.segmentUrls[0].startTime;

  for (var i = 0; i < segmentList.segmentUrls.length; ++i) {
    var segmentUrl = segmentList.segmentUrls[i];

    shaka.asserts.assert(segmentUrl.duration);
    totalUnscaledDuration += segmentUrl.duration;
  }

  return totalUnscaledDuration / segmentList.timescale;
};


/**
 * Ensures that each Representation has only one of SegmentBase, SegmentList,
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
              'A Representation must contain one of SegmentBase, ' +
              'SegmentList, or SegmentTemplate.',
              representation);
          adaptationSet.representations.splice(k, 1);
          --k;
        } else if (n != 1) {
          shaka.log.warning(
              'Representation contains multiple segment information sources. ' +
              'A Representation should only contain one of SegmentBase, ' +
              'SegmenstList, or SegmentTemplate.',
              representation);
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

        if (representation.segmentBase) {
          if (!representation.segmentBase.representationIndex ||
              !representation.segmentBase.representationIndex.range ||
              !representation.segmentBase.mediaUrl) {
            shaka.log.warning(
                'Representation is missing critical segment information: ' +
                'A Representation that uses a SegmentBase must contain a ' +
                'segment index URL and a media URL.',
                representation);
            adaptationSet.representations.splice(k, 1);
            --k;
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
          if (segmentTemplate.segmentDuration) {
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
          if (period.duration != null) {
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
  segmentList.startNumber = segmentTemplate.startNumber;
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
          (segmentNumber - 1) + segmentTemplate.startNumber,
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

  segmentList.timescale = segmentTemplate.timescale;
  segmentList.presentationTimeOffset = segmentTemplate.presentationTimeOffset;
  segmentList.segmentDuration = segmentTemplate.segmentDuration;
  segmentList.startNumber = segmentTemplate.startNumber;
  segmentList.initialization = this.generateInitialization_(representation);
  segmentList.segmentUrls = [];

  var numSegments =
      Math.floor(periodDuration / segmentTemplate.segmentDuration);

  for (var segmentNumber = 1; segmentNumber <= numSegments; ++segmentNumber) {
    var time =
        ((segmentNumber - 1) + (segmentTemplate.startNumber - 1)) *
        segmentTemplate.segmentDuration;

    // Generate the media URL.
    shaka.asserts.assert(segmentTemplate.mediaUrlTemplate);
    var filledUrlTemplate = this.fillUrlTemplate_(
        segmentTemplate.mediaUrlTemplate,
        representation.id,
        segmentNumber - 1 + segmentTemplate.startNumber,
        representation.bandwidth,
        time);

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
    segmentUrl.startTime = time;
    segmentUrl.duration = segmentTemplate.segmentDuration;

    segmentList.segmentUrls.push(segmentUrl);
  }

  representation.segmentList = segmentList;
};


/**
 * Generates a RepresentationIndex from a SegmentTemplate.
 *
 * @param {!shaka.dash.mpd.Representation} representation
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
 * Removes invalid Representations from |mpd|.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @private
 */
shaka.dash.MpdProcessor.prototype.filterPeriods_ = function(mpd) {
  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];
    for (var j = 0; j < period.adaptationSets.length; ++j) {
      var adaptationSet = period.adaptationSets[j];
      this.filterAdaptationSet_(adaptationSet);
      if (adaptationSet.representations.length == 0) {
        // Drop any AdaptationSet that is empty.
        // An error has already been logged.
        period.adaptationSets.splice(j, 1);
        --j;
      }
    }
  }
};


/**
 * Removes any Representation from the given AdaptationSet that has a different
 * MIME type than the MIME type of the first Representation of the
 * AdaptationSet.
 *
 * @param {!shaka.dash.mpd.AdaptationSet} adaptationSet
 * @private
 */
shaka.dash.MpdProcessor.prototype.filterAdaptationSet_ = function(
    adaptationSet) {
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
 * Creates a ManifestInfo from |mpd|.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @private
 */
shaka.dash.MpdProcessor.prototype.createManifestInfo_ = function(mpd) {
  this.manifestInfo.minBufferTime = mpd.minBufferTime || 0;

  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];

    var periodInfo = new shaka.media.PeriodInfo();

    shaka.asserts.assert(period.start != null);
    periodInfo.start = period.start || 0;

    shaka.asserts.assert(period.duration != null);
    periodInfo.duration = period.duration || 0;

    for (var j = 0; j < period.adaptationSets.length; ++j) {
      var adaptationSet = period.adaptationSets[j];

      var streamSetInfo = new shaka.media.StreamSetInfo();
      streamSetInfo.main = adaptationSet.main;
      streamSetInfo.contentType = adaptationSet.contentType || '';

      for (var k = 0; k < adaptationSet.representations.length; ++k) {
        var representation = adaptationSet.representations[k];

        // Get common DRM schemes.
        var commonDrmSchemes = streamSetInfo.drmSchemes.slice(0);
        this.updateCommonDrmSchemes_(representation, commonDrmSchemes);
        if (commonDrmSchemes.length == 0 &&
            streamSetInfo.drmSchemes.length > 0) {
          shaka.log.warning(
              'Representation does not contain any DRM schemes that are in ' +
              'common with other Representations within its AdaptationSet.',
              representation);
          continue;
        }

        var streamInfo = this.createStreamInfo_(representation);
        if (!streamInfo) {
          // An error has already been logged.
          continue;
        }

        streamSetInfo.streamInfos.push(streamInfo);
        streamSetInfo.drmSchemes = commonDrmSchemes;
      }

      periodInfo.streamSetInfos.push(streamSetInfo);
    }

    this.manifestInfo.periodInfos.push(periodInfo);
  }
};


/**
 * Creates a StreamInfo from the given Representation.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @return {shaka.media.StreamInfo} The new StreamInfo on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.MpdProcessor.prototype.createStreamInfo_ = function(representation) {
  var streamInfo = new shaka.media.StreamInfo();

  streamInfo.id = representation.id;
  streamInfo.lang = representation.lang || '';
  streamInfo.minBufferTime = representation.minBufferTime;
  streamInfo.bandwidth = representation.bandwidth;
  streamInfo.width = representation.width;
  streamInfo.height = representation.height;
  streamInfo.mimeType = representation.mimeType || '';
  streamInfo.codecs = representation.codecs || '';

  streamInfo.mediaUrl = representation.baseUrl;

  if (representation.segmentBase) {
    shaka.asserts.assert(representation.segmentBase.representationIndex);
    shaka.asserts.assert(representation.segmentBase.representationIndex.range);
    shaka.asserts.assert(representation.segmentBase.mediaUrl);

    streamInfo.timestampOffset =
        representation.segmentBase.presentationTimeOffset /
        representation.segmentBase.timescale;

    streamInfo.mediaUrl = representation.segmentBase.mediaUrl;

    streamInfo.segmentIndexInfo = this.createSegmentMetadataInfo_(
        representation.segmentBase.representationIndex);

    streamInfo.segmentInitializationInfo = this.createSegmentMetadataInfo_(
        representation.segmentBase.initialization);
  } else if (representation.segmentList) {
    streamInfo.timestampOffset =
        representation.segmentList.presentationTimeOffset /
        representation.segmentList.timescale;

    streamInfo.segmentInitializationInfo = this.createSegmentMetadataInfo_(
        representation.segmentList.initialization);

    // Create SegmentIndex.
    streamInfo.segmentIndex =
        this.createSegmentIndex_(representation.segmentList);
    if (!streamInfo.segmentIndex) {
      // An error has already been logged.
      return null;
    }
  }

  return streamInfo;
};


/**
 * Updates |commonDrmSchemes|.
 *
 * If |commonDrmSchemes| is empty then after this function is called
 * |commonDrmSchemes| will equal |representation|'s application provided DRM
 * schemes.
 *
 * Otherwise, if |commonDrmSchemes| is non-empty then after this function is
 * called |commonDrmSchemes| will equal the intersection between
 * |representation|'s application provided DRM schemes and |commonDrmSchemes|
 * at the time this function was called.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {!Array.<!shaka.player.DrmSchemeInfo>} commonDrmSchemes
 *
 * @private
 */
shaka.dash.MpdProcessor.prototype.updateCommonDrmSchemes_ = function(
    representation, commonDrmSchemes) {
  var drmSchemes = this.getDrmSchemeInfos_(representation);

  if (commonDrmSchemes.length == 0) {
    Array.prototype.push.apply(commonDrmSchemes, drmSchemes);
    return;
  }

  for (var i = 0; i < commonDrmSchemes.length; ++i) {
    var found = false;
    for (var j = 0; j < drmSchemes.length; ++j) {
      if (commonDrmSchemes[i].key() == drmSchemes[j].key()) {
        found = true;
        break;
      }
    }
    if (!found) {
      commonDrmSchemes.splice(i, 1);
      --i;
    }
  }
};


/**
 * Creates a SegmentMetadataInfo from either a RepresentationIndex or an
 * Initialization.
 *
 * @param {shaka.dash.mpd.RepresentationIndex|
 *         shaka.dash.mpd.Initialization} urlTypeObject
 * @return {shaka.media.SegmentMetadataInfo}
 * @private
 */
shaka.dash.MpdProcessor.prototype.createSegmentMetadataInfo_ = function(
    urlTypeObject) {
  if (!urlTypeObject) {
    return null;
  }

  var segmentMetadataInfo = new shaka.media.SegmentMetadataInfo();

  segmentMetadataInfo.url = urlTypeObject.url;

  if (urlTypeObject.range) {
    segmentMetadataInfo.startByte = urlTypeObject.range.begin;
    segmentMetadataInfo.endByte = urlTypeObject.range.end;
  }

  return segmentMetadataInfo;
};


/**
 * Creates a SegmentIndex from a SegmentList.
 *
 * @param {!shaka.dash.mpd.SegmentList} segmentList
 * @return {shaka.media.SegmentIndex} A SegmentIndex on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.MpdProcessor.prototype.createSegmentIndex_ = function(segmentList) {
  var timescale = segmentList.timescale;
  var presentationTimeOffset = segmentList.presentationTimeOffset;
  var startNumber = segmentList.startNumber;
  var segmentDuration = segmentList.segmentDuration;

  /** @type {!Array.<!shaka.media.SegmentReference>} */
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

      startTime = segmentUrl.startTime / timescale;
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
        startTime = 0;
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
        new shaka.media.SegmentReference(
            i,
            startTime,
            endTime,
            startByte,
            endByte,
            /** @type {!goog.Uri} */ (segmentUrl.mediaUrl)));
  }

  return new shaka.media.SegmentIndex(references);
};


/**
 * Gets the application provided DrmSchemeInfos for the given Representation.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @return {!Array.<!shaka.player.DrmSchemeInfo>} The application provided
 *     DrmSchemeInfos. A dummy scheme, which has an empty |keySystem| string,
 *     is used for unencrypted content.
 * @private
 */
shaka.dash.MpdProcessor.prototype.getDrmSchemeInfos_ =
    function(representation) {
  var drmSchemes = [];
  if (representation.contentProtections.length == 0) {
    // Return a single item which indicates that the content is unencrypted.
    drmSchemes.push(shaka.player.DrmSchemeInfo.createUnencrypted());
  } else if (this.interpretContentProtection_) {
    for (var i = 0; i < representation.contentProtections.length; ++i) {
      var contentProtection = representation.contentProtections[i];
      var drmSchemeInfo = this.interpretContentProtection_(contentProtection);
      if (drmSchemeInfo) {
        drmSchemes.push(drmSchemeInfo);
      }
    }
  }
  return drmSchemes;
};

