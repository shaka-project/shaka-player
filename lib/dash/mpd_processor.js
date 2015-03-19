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
goog.require('shaka.util.Clock');



/**
 * Creates an MpdProcessor, which validates MPDs, generates segment information
 * from SegmentTemplate elements, calculates start/duration attributes, removes
 * invalid Representations, and ultimately generates a ManifestInfo.
 *
 * @param {?shaka.player.DashVideoSource.ContentProtectionCallback}
 *     interpretContentProtection
 *
 * @constructor
 * @struct
 */
shaka.dash.MpdProcessor = function(interpretContentProtection) {
  /** @private {?shaka.player.DashVideoSource.ContentProtectionCallback} */
  this.interpretContentProtection_ = interpretContentProtection;

  /** @type {!shaka.media.ManifestInfo} */
  this.manifestInfo = new shaka.media.ManifestInfo();
};


/**
 * Any gap/overlap within a SegmentTimeline that is greater than or equal to
 * this value (in seconds) will generate a warning message.
 * @const {number}
 */
shaka.dash.MpdProcessor.GAP_OVERLAP_WARNING_THRESHOLD = 1.0 / 32.0;


/**
 * The default duration to use to generate a SegmentList if an explicit Period
 * duration and minimumUpdatePeriod are not provided.
 * @const {number}
 */
shaka.dash.MpdProcessor.DEFAULT_DERIVED_PERIOD_DURATION = 2 * 60;


/**
 * Processes the given MPD. Sets |this.periodInfos|.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 */
shaka.dash.MpdProcessor.prototype.process = function(mpd) {
  this.manifestInfo = new shaka.media.ManifestInfo();

  this.validateSegmentInfo_(mpd);

  // Calculate MPD and period durations before and after expanding any
  // SegmentTemplates. A SegmentTemplate that specifies @duration (i.e., a
  // media segment duration) may require a Period duration to be expanded.
  // However, other types of SegmentTemplates can be used to derive the Period
  // duration.
  this.calculateDurations_(mpd);
  this.processSegmentTemplates_(mpd);
  this.calculateDurations_(mpd);

  this.filterPeriods_(mpd);
  this.createManifestInfo_(mpd);
};


/**
 * Calculates each Period's start attribute and duration attribute, and
 * calcuates the MPD's mediaPresentationDuration attribute.
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

  if (mpd.periods[0].start == null) {
    mpd.periods[0].start = 0;
  }

  // If it's zero or truthy, it's set.  This means null and NaN are not set.
  var isSet = function(x) { return x == 0 || !!x; };

  // @mediaPresentationDuration should only be used if the MPD is static.
  if (isSet(mpd.minUpdatePeriod)) {
    mpd.mediaPresentationDuration = null;
  }

  // If there is only one period then infer its duration.
  if (isSet(mpd.mediaPresentationDuration) &&
      (mpd.periods.length == 1) &&
      !isSet(mpd.periods[0].duration)) {
    mpd.periods[0].duration = mpd.mediaPresentationDuration;
  }

  var totalDuration = 0;

  // True if |totalDuration| includes all periods, false if it only includes up
  // to the last Period in which a start time and duration could be
  // ascertained.
  var totalDurationIncludesAllPeriods = true;

  for (var i = 0; i < mpd.periods.length; ++i) {
    var previousPeriod = mpd.periods[i - 1];
    var period = mpd.periods[i];

    if (period.duration == null) {
      this.calculatePeriodDuration_(period);
      shaka.log.debug('Calculated period duration:', period.duration);

      // If the MPD is dynamic then the Period's duration will likely change
      // after we re-process/update the MPD. When the Period's duration changes
      // we must update the MediaSource object that is presenting the MPD's
      // content, so we can append new media segments to the MediaSource's
      // SourceBuffers. However, changing the MediaSource's duration is
      // challenging as it requires synchronizing the states of multiple
      // SourceBuffers. We can leave the Period's duration as undefined, but
      // then we cannot seek (even programmatically).
      //
      // So, if the MPD is dynamic just set the Period's duration to a "large"
      // value. This ensures that we can seek and that we can append new media
      // segments. This does cause a poor UX if we use the video element's
      // default controls, but we shouldn't use the default controls for live
      // anyways.
      // TODO: Remove this hack once SourceBuffer synchronization is
      // implemented.
      if (isSet(period.duration) && isSet(mpd.minUpdatePeriod)) {
        period.duration += 60 * 60 * 24;
      }
    }

    // "The Period extends until the Period.start of the next Period, or until
    // the end of the Media Presentation in the case of the last Period."
    var nextPeriod = mpd.periods[i + 1] ||
                     { start: mpd.mediaPresentationDuration };

    // "If the 'start' attribute is absent, but the previous period contains a
    // 'duration' attribute, the start time of the new Period is the sum of the
    // start time of the previous period Period.start and the value of the
    // attribute 'duration' of the previous Period."
    if (!isSet(period.start) &&
        previousPeriod &&
        isSet(previousPeriod.start) &&
        isSet(previousPeriod.duration)) {
      period.start = previousPeriod.start + previousPeriod.duration;
    }

    // "The difference between the start time of a Period and the start time
    // of the following Period is the duration of the media content represented
    // by this Period."
    if (!isSet(period.duration) && isSet(nextPeriod.start)) {
      period.duration = nextPeriod.start - period.start;
    }

    if ((period.start != null) && (period.duration != null)) {
      totalDuration += period.duration;
    } else {
      totalDurationIncludesAllPeriods = false;
    }
  }

  // "The Media Presentation Duration is provided either as the value of MPD
  // 'mediaPresentationDuration' attribute if present, or as the sum of
  // Period.start + Period.duration of the last Period."
  if (isSet(mpd.mediaPresentationDuration)) {
    if (mpd.mediaPresentationDuration != totalDuration) {
      shaka.log.warning('@mediaPresentationDuration does not match the total ' +
                        'duration of all periods.');
      // Assume mpd.mediaPresentationDuration is correct;
      // |totalDurationIncludesAllPeriods| may be false.
    }
  } else {
    var finalPeriod = mpd.periods[mpd.periods.length - 1];
    if (totalDurationIncludesAllPeriods) {
      shaka.asserts.assert(isSet(finalPeriod.start) &&
                           isSet(finalPeriod.duration));
      shaka.asserts.assert(totalDuration ==
                           finalPeriod.start + finalPeriod.duration);
      mpd.mediaPresentationDuration = totalDuration;
    } else {
      if (isSet(finalPeriod.start) && isSet(finalPeriod.duration)) {
        shaka.log.warning('Some Periods may not have valid start times ' +
                          'or durations.');
        mpd.mediaPresentationDuration =
            finalPeriod.start + finalPeriod.duration;
      } else {
        // Fallback to what we were able to compute.
        if (mpd.type == 'static') {
          shaka.log.warning('Some Periods may not have valid start times ' +
                            'or durations; @mediaPresentationDuration may ' +
                            'not include the duration of all periods.');
          mpd.mediaPresentationDuration = totalDuration;
        }
      }
    }
  }
};


/**
 * Calculates |period|'s duration based upon its Representations.
 *
 * @param {!shaka.dash.mpd.Period} period
 * @private
 */
shaka.dash.MpdProcessor.prototype.calculatePeriodDuration_ = function(period) {
  shaka.asserts.assert(period.duration == null);

  var maxDuration = null;

  for (var i = 0; i < period.adaptationSets.length; ++i) {
    var adaptationSet = period.adaptationSets[i];
    for (var j = 0; j < adaptationSet.representations.length; ++j) {
      var representation = adaptationSet.representations[j];
      if (!representation.segmentList) continue;

      var segmentListDuration =
          this.calculateSegmentListDuration_(representation.segmentList);
      if (segmentListDuration == null) continue;

      maxDuration = Math.max(maxDuration || 0, segmentListDuration);
    }
  }

  period.duration = maxDuration;
};


/**
 * Calculates the given SegmentList's duration.
 *
 * @param {!shaka.dash.mpd.SegmentList} segmentList
 * @return {?number} The total duration of all media segments specified by
 *     |segmentList|.
 * @private
 */
shaka.dash.MpdProcessor.prototype.calculateSegmentListDuration_ = function(
    segmentList) {
  if (segmentList.segmentUrls.length == 0) {
    shaka.log.debug('SegmentList does not contain any SegmentURLs.');
    return 0;
  }

  var totalUnscaledDuration = 0;

  // Include the time between the start of the Period and the first available
  // media segment.
  if (segmentList.segmentUrls[0].startTime != null) {
    totalUnscaledDuration += segmentList.segmentUrls[0].startTime;
  }

  for (var i = 0; i < segmentList.segmentUrls.length; ++i) {
    var segmentUrl = segmentList.segmentUrls[i];

    if (segmentUrl.duration != null) {
      // |segmentList| was generated from a SegmentTemplate.
      totalUnscaledDuration += segmentUrl.duration;
    } else if (segmentList.segmentDuration) {
      totalUnscaledDuration += segmentList.segmentDuration;
    } else {
      // This may occur if no period duration or segment duration was specified.
      shaka.log.warning(
          'SegmentList contains SegmentURLs that have unknown durations.');
      return null;
    }
  }

  shaka.asserts.assert(segmentList.timescale > 0);
  return totalUnscaledDuration / segmentList.timescale;
};


/**
 * Ensures that each Representation has either a SegmentBase, SegmentList, or
 * SegmentTemplate, and ensures that there is sufficient information from the
 * MPD to fetch or create a SegmentIndex.
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
          var hasSegmentIndexMetadata =
              representation.segmentBase.indexRange ||
              (representation.segmentBase.representationIndex &&
               representation.segmentBase.representationIndex.range);
          if (!hasSegmentIndexMetadata ||
              !representation.segmentBase.mediaUrl) {
            shaka.log.warning(
                'Representation is missing critical segment information: ' +
                'A Representation that uses a SegmentBase must contain a ' +
                'segment index URL and a base URL.',
                representation);
            adaptationSet.representations.splice(k, 1);
            --k;
          }
        }

        if (representation.segmentList) {
          if ((!representation.segmentList.segmentDuration) &&
              (representation.segmentList.segmentUrls.length > 1)) {
            shaka.log.warning(
                'Representation has ambiguous segment information: ' +
                'A Representation that uses a SegmentList without a ' +
                'segment duration can only contain one segment.');
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
          this.generateSegmentListFromTimeline_(mpd, period, representation);
          if (!representation.segmentList) {
            // An error has already been logged.
            adaptationSet.representations.splice(k, 1);
            --k;
          }
        } else if (segmentTemplate.segmentDuration) {
          this.generateSegmentListFromDuration_(mpd, period, representation);
          if (!representation.segmentList) {
            // An error has already been logged.
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
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @private
 */
shaka.dash.MpdProcessor.prototype.generateSegmentListFromTimeline_ = function(
    mpd, period, representation) {
  shaka.asserts.assert(representation.segmentBase == null);
  shaka.asserts.assert(representation.segmentList == null);
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.timeline);

  if (period.start == null) {
    shaka.log.error(
        'Cannot instantiate SegmentTemplate: the period\'s start time is ' +
        'unknown.',
        representation);
    return;
  }

  var segmentTemplate = representation.segmentTemplate;
  if (!segmentTemplate.mediaUrlTemplate) {
    shaka.log.error(
        'Cannot instantiate SegmentTemplate: SegmentTemplate does not have a ' +
        'media URL template.',
        representation);
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

  var timePoints = segmentTemplate.timeline.timePoints;
  var lastEndTime = -1;
  var segmentNumber = 1;

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

      // The end of the last segment may end before the start of the current
      // segment (a gap) or may end after the start of the current segment (an
      // overlap). If there is a gap/overlap then stretch/compress the end of
      // the last segment to the start of the current segment.
      //
      // Note: it is possible to move the start of the current segment to the
      // end of the last segment, but this complicates the computation of the
      // $Time$ placeholder.
      if ((lastEndTime >= 0) && (startTime != lastEndTime)) {
        var numSegmentUrls = segmentList.segmentUrls.length;
        shaka.asserts.assert(numSegmentUrls > 0);

        var lastSegmentUrl = segmentList.segmentUrls[numSegmentUrls - 1];

        var delta = startTime - lastEndTime;

        shaka.asserts.assert(segmentList.timescale > 0);
        if (Math.abs(delta / segmentList.timescale) >=
            shaka.dash.MpdProcessor.GAP_OVERLAP_WARNING_THRESHOLD) {
          shaka.log.warning('SegmentTimeline contains a large gap/overlap, ' +
                            'the content may have errors in it.',
                            timePoints[i]);
        }

        lastSegmentUrl.duration += delta;
        shaka.asserts.assert(
            (lastSegmentUrl.startTime + lastSegmentUrl.duration) ==
            startTime);
      }

      lastEndTime = startTime + timePoints[i].duration;

      var segmentReplacement = (segmentNumber - 1) + segmentList.startNumber;
      var timeReplacement = startTime;

      // Generate the media URL.
      shaka.asserts.assert(segmentTemplate.mediaUrlTemplate);
      var filledUrlTemplate = this.fillUrlTemplate_(
          segmentTemplate.mediaUrlTemplate,
          representation.id,
          segmentReplacement,
          representation.bandwidth,
          timeReplacement);

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
      segmentUrl.segmentNumber = segmentNumber;
      segmentUrl.startTime = startTime;
      segmentUrl.duration = timePoints[i].duration;

      segmentList.segmentUrls.push(segmentUrl);

      ++segmentNumber;
    }  // for j
  }

  representation.segmentList = segmentList;
};


/**
 * Generates a SegmentList from a SegmentTemplate which has a segment duration.
 * Sets |representation.segmentList| on success.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @private
 */
shaka.dash.MpdProcessor.prototype.generateSegmentListFromDuration_ = function(
    mpd, period, representation) {
  shaka.asserts.assert(representation.segmentBase == null);
  shaka.asserts.assert(representation.segmentList == null);
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.segmentDuration);

  if (period.start == null) {
    shaka.log.error(
        'Cannot instantiate SegmentTemplate: the period\'s start time is ' +
        'unknown.',
        representation);
    return;
  }

  var segmentTemplate = representation.segmentTemplate;
  if (!segmentTemplate.mediaUrlTemplate) {
    shaka.log.error(
        'Cannot instantiate SegmentTemplate: SegmentTemplate does not have a ' +
        'media URL template.',
        representation);
    return;
  }

  /** @type {?number} */
  var periodDuration = null;

  if (mpd.type == 'static') {
    if (period.duration != null) {
      periodDuration = period.duration;
    } else {
      shaka.log.error(
          'Cannot create SegmentTemplate: the Period\'s duration is unknown.',
          representation);
      return;
    }
  } else {
    // Use @minimumUpdatePeriod, if possible, to derive a Period duration to
    // use to generate a SegmentList. We don't always want to use the entire
    // Period's duration if the MPD is dynamic, since the SegmentList will have
    // to be re-generated anyways, and the entire Period's duration may be very
    // long.
    var derivedPeriodDuration =
        Math.min(mpd.minUpdatePeriod || Number.POSITIVE_INFINITY,
                 shaka.dash.MpdProcessor.DEFAULT_DERIVED_PERIOD_DURATION);

    periodDuration =
        Math.min(derivedPeriodDuration,
                 period.duration || Number.POSITIVE_INFINITY);
  }

  shaka.asserts.assert(periodDuration &&
                       periodDuration != Number.POSITIVE_INFINITY);
  shaka.log.v1('Generating SegmentList using Period duration', periodDuration);

  var segmentList = new shaka.dash.mpd.SegmentList();

  segmentList.timescale = segmentTemplate.timescale;
  segmentList.presentationTimeOffset = segmentTemplate.presentationTimeOffset;
  segmentList.segmentDuration = segmentTemplate.segmentDuration;
  segmentList.startNumber = segmentTemplate.startNumber;
  segmentList.initialization = this.generateInitialization_(representation);
  segmentList.segmentUrls = [];

  var firstSegmentNumber;
  if (mpd.minUpdatePeriod) {
    // Build the SegmentList starting from the most recent segment guaranteed
    // to be available from the media server. Any segments after this segment
    // are not guaranteed to be available at this time.
    var firstSegmentNumber =
        this.computeCurrentSegmentNumber_(mpd, period, segmentList);
    if (!firstSegmentNumber) {
      // The stream is not available yet.
      representation.segmentList = segmentList;
      return;
    }
  } else {
    // Build the SegmentList starting from the first segment. All segments
    // after this segment should be available.
    firstSegmentNumber = 1;
  }
  shaka.asserts.assert(firstSegmentNumber);

  var scaledSegmentDuration =
      segmentList.segmentDuration / segmentList.timescale;
  // The number of segments to add to the SegmentList.
  var numSegments = Math.floor(periodDuration / scaledSegmentDuration);

  for (var segmentNumber = firstSegmentNumber;
       segmentNumber - firstSegmentNumber < numSegments;
       ++segmentNumber) {
    var segmentReplacement = (segmentNumber - 1) + segmentList.startNumber;
    var timeReplacement =
        ((segmentNumber - 1) + (segmentList.startNumber - 1)) *
        segmentTemplate.segmentDuration;

    // Generate the media URL.
    shaka.asserts.assert(segmentTemplate.mediaUrlTemplate);
    var filledUrlTemplate = this.fillUrlTemplate_(
        segmentTemplate.mediaUrlTemplate,
        representation.id,
        segmentReplacement,
        representation.bandwidth,
        timeReplacement);

    if (!filledUrlTemplate) {
      // An error has already been logged.
      return;
    }

    var mediaUrl = representation.baseUrl ?
                   representation.baseUrl.resolve(filledUrlTemplate) :
                   filledUrlTemplate;

    // Create the SegmentUrl. Note that times within SegmentUrl are unscaled.
    var segmentUrl = new shaka.dash.mpd.SegmentUrl();
    segmentUrl.mediaUrl = mediaUrl;
    segmentUrl.segmentNumber = segmentNumber;
    segmentUrl.startTime = (segmentNumber - 1) * segmentList.segmentDuration;
    segmentUrl.duration = segmentList.segmentDuration;

    segmentList.segmentUrls.push(segmentUrl);
  }

  representation.segmentList = segmentList;
};


/**
 * Computes the segment number, relative to the start of |period|, of the most
 * recent segment guaranteed to be available from the media server. Assumes the
 * MPD is dynamic.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.SegmentList} segmentList
 * @return {?number} A segment number, or null if the stream is not
 *     available yet.
 * @private
 */
shaka.dash.MpdProcessor.prototype.computeCurrentSegmentNumber_ = function(
    mpd, period, segmentList) {
  var currentTime = shaka.util.Clock.now() / 1000.0;

  var availabilityStartTime = mpd.availabilityStartTime != null ?
                              mpd.availabilityStartTime :
                              currentTime;

  if (availabilityStartTime > currentTime) {
    shaka.log.warning('The stream is not available yet!', period);
    return null;
  }

  var minBufferTime = mpd.minBufferTime || 0;
  var suggestedPresentationDelay = mpd.suggestedPresentationDelay || 0;

  // The following diagram shows the relationship between the values we use to
  // compute the current segment number; descriptions of each value are given
  // within the code. The diagram depicts the media presentation timeline. 0
  // corresponds to availabilityStartTime + period.start in wall-clock time,
  // and currentPresentationTime corresponds to currentTime in wall-clock time.
  //
  // Legend:
  // CPT: currentPresentationTime
  // EAT: earliestAvailableSegmentStartTime
  // LAT: latestAvailableSegmentStartTime
  // BAT: bestAvailableSegmentStartTime
  // SD:  scaledSegmentDuration.
  // SPD: suggestedPresentationDelay
  // MBT: minBufferTime
  // TSB: timeShiftBufferDepth
  //
  // Time:
  //   <---|-----------------+--------+-----------------+----------|--------->
  //       0                EAT      BAT               LAT        CPT
  //                                                      |---SD---|
  //                                      |-MBT-|--SPD--|
  //                      |---SD---|---SD---|<--------TSB--------->|
  // Segments:
  //   <---1--------2--------3--------4--------5--------6--------7--------8-->
  //       |---SD---|---SD---| ...

  shaka.asserts.assert(segmentList.segmentDuration);
  shaka.asserts.assert(segmentList.timescale > 0);
  var scaledSegmentDuration =
      segmentList.segmentDuration / segmentList.timescale;

  // The current presentation time, which is the amount of time since the start
  // of the Period.
  var currentPresentationTime =
      currentTime - (availabilityStartTime + period.start);
  if (currentPresentationTime < 0) {
    shaka.log.warning('The Period is not available yet!', period);
    return null;
  }

  // Compute the segment start time of the earliest available segment, i.e.,
  // the segment that starts furthest from the present but is still available).
  // The MPD spec. indicates that
  //
  // SegmentAvailabilityStartTime =
  //   MpdAvailabilityStartTime + PeriodStart + SegmentStart + SegmentDuration
  //
  // SegmentAvailabilityEndTime =
  //   SegmentAvailabilityStartTime + SegmentDuration + TimeShiftBufferDepth
  //
  // So let SegmentAvailabilityEndTime equal the current time and compute
  // SegmentStart, which yields the start time that a segment would need to
  // have to have an availability end time equal to the current time.
  var earliestAvailableTimestamp = currentPresentationTime -
                                   (2 * scaledSegmentDuration) -
                                   mpd.timeShiftBufferDepth;
  if (earliestAvailableTimestamp < 0) {
    earliestAvailableTimestamp = 0;
  }

  // Now round up to the nearest segment boundary, since the segment
  // corresponding to |earliestAvailableTimestamp| is not available.
  var earliestAvailableSegmentStartTime =
      Math.ceil(earliestAvailableTimestamp / scaledSegmentDuration) *
      scaledSegmentDuration;

  // Compute the segment start time of the latest available segment, i.e., the
  // segment that starts closest to the present but is available.
  //
  // Using the above formulas, let SegmentAvailabilityStartTime equal the
  // current time and compute SegmentStart, which yields the start time that
  // a segment would need to have to have an availability start time
  // equal to the current time.
  var latestAvailableTimestamp = currentPresentationTime -
                                 scaledSegmentDuration;
  if (latestAvailableTimestamp < 0) {
    shaka.log.warning('The first segment is not available yet!', period);
    return null;
  }

  // Now round down to the nearest segment boundary, since the segment
  // corresponding to |latestAvailableTimestamp| may not yet be available.
  var latestAvailableSegmentStartTime =
      Math.floor(latestAvailableTimestamp / scaledSegmentDuration) *
      scaledSegmentDuration;

  // Now compute the start time of the "best" available segment, by offsetting
  // by @suggestedPresentationDelay and @minBufferTime. Note that we subtract
  // by @minBufferTime to ensure that after playback begins we can buffer at
  // least @minBufferTime seconds worth of media content.
  var bestAvailableTimestamp = latestAvailableSegmentStartTime -
                               suggestedPresentationDelay -
                               minBufferTime;
  if (bestAvailableTimestamp < 0) {
    shaka.log.warning('The first segment may not be available yet.');
    bestAvailableTimestamp = 0;
    // Don't return; taking into account @suggestedPresentationDelay is only a
    // reccomendation. The first segment /might/ be available.
  }

  var bestAvailableSegmentStartTime =
      Math.floor(bestAvailableTimestamp / scaledSegmentDuration) *
      scaledSegmentDuration;

  // Now take the larger of |bestAvailableSegmentStartTime| and
  // |earliestAvailableSegmentStartTime|.
  var currentSegmentStartTime;
  if (bestAvailableSegmentStartTime >= earliestAvailableSegmentStartTime) {
    currentSegmentStartTime = bestAvailableSegmentStartTime;
    shaka.log.v1('Using the best available segment.');
  } else {
    currentSegmentStartTime = earliestAvailableSegmentStartTime;
    shaka.log.v1('Using the earliest available segment.');
  }

  var currentSegmentNumber =
      (currentSegmentStartTime / scaledSegmentDuration) + 1;
  // |currentSegmentNumber| should be an integer.
  shaka.asserts.assert(currentSegmentNumber ==
                       Math.round(currentSegmentNumber));

  shaka.log.v2('currentSegmentNumber', currentSegmentNumber);
  return currentSegmentNumber;
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
  this.manifestInfo.live = mpd.minUpdatePeriod != null;
  this.manifestInfo.minBufferTime = mpd.minBufferTime || 0;

  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];

    var periodInfo = new shaka.media.PeriodInfo();
    periodInfo.id = period.id;

    shaka.asserts.assert(period.start != null);
    periodInfo.start = period.start || 0;
    periodInfo.duration = period.duration;

    for (var j = 0; j < period.adaptationSets.length; ++j) {
      var adaptationSet = period.adaptationSets[j];

      var streamSetInfo = new shaka.media.StreamSetInfo();
      streamSetInfo.id = adaptationSet.id;
      streamSetInfo.main = adaptationSet.main;
      streamSetInfo.contentType = adaptationSet.contentType || '';
      streamSetInfo.lang = adaptationSet.lang || '';

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

        var streamInfo = this.createStreamInfo_(mpd, representation);
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
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Representation} representation
 * @return {shaka.media.StreamInfo} The new StreamInfo on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.MpdProcessor.prototype.createStreamInfo_ = function(
    mpd, representation) {
  shaka.asserts.assert(representation.baseUrl);

  var streamInfo = new shaka.media.StreamInfo();

  streamInfo.id = representation.id;
  streamInfo.minBufferTime = representation.minBufferTime || 0;
  streamInfo.bandwidth = representation.bandwidth;
  streamInfo.width = representation.width;
  streamInfo.height = representation.height;
  streamInfo.mimeType = representation.mimeType || '';
  streamInfo.codecs = representation.codecs || '';
  streamInfo.mediaUrl = representation.baseUrl;

  if (representation.segmentBase) {
    shaka.asserts.assert(representation.segmentBase.timescale > 0);

    // Each timestamp within each media segment is relative to the start of the
    // Period minus @presentationTimeOffset. So to align the start of the first
    // segment to the start of the Period we must apply an offset of
    // -1 * @presentationTimeOffset seconds to each timestamp within each media
    // segment.
    streamInfo.timestampOffset =
        -1 *
        representation.segmentBase.presentationTimeOffset /
        representation.segmentBase.timescale;

    shaka.asserts.assert(representation.segmentBase.mediaUrl);
    streamInfo.mediaUrl = representation.segmentBase.mediaUrl;

    // If a RepresentationIndex does not exist then fallback to the indexRange
    // attribute.
    var representationIndex = representation.segmentBase.representationIndex;
    if (!representationIndex) {
      representationIndex = new shaka.dash.mpd.RepresentationIndex();
      representationIndex.url = new goog.Uri(representation.baseUrl);
      representationIndex.range =
          representation.segmentBase.indexRange ?
          representation.segmentBase.indexRange.clone() :
          null;
    }
    streamInfo.segmentIndexInfo =
        this.createSegmentMetadataInfo_(representationIndex);

    var initialization = representation.segmentBase.initialization;
    streamInfo.segmentInitializationInfo =
        this.createSegmentMetadataInfo_(initialization);
  } else if (representation.segmentList) {
    shaka.asserts.assert(representation.segmentList.timescale > 0);

    // Align @presentationTimeOffset to a segment boundary if possible.
    // Round-up to ensure that we have the first segment.
    //
    // This is necessary on Chrome, as Chrome will not start playback
    // midway through a segment if a timestamp offset is set.
    // TODO: file a bug at crbug.com
    if ((representation.segmentList.presentationTimeOffset != null) &&
        (representation.segmentList.segmentDuration)) {
      var segmentNumber =
          Math.ceil(representation.segmentList.presentationTimeOffset /
                    representation.segmentList.segmentDuration) + 1;
      var pto = segmentNumber * representation.segmentList.segmentDuration;
      representation.segmentList.presentationTimeOffset = -1 * pto;
    }

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
  } else if (representation.mimeType.split('/')[0] == 'text') {
    // nop
  } else {
    shaka.asserts.unreachable();
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
  shaka.asserts.assert(segmentList.timescale > 0);
  var timescale = segmentList.timescale;
  var presentationTimeOffset = segmentList.presentationTimeOffset;
  var startNumber = segmentList.startNumber;
  var segmentDuration = segmentList.segmentDuration;

  /** @type {!Array.<!shaka.media.SegmentReference>} */
  var references = [];

  for (var i = 0; i < segmentList.segmentUrls.length; ++i) {
    var segmentUrl = segmentList.segmentUrls[i];

    var segmentNumber = i + 1;
    var startTime = 0;
    var startByte = 0;

    /** @type {?number} */
    var endTime = null;

    /** @type {?number} */
    var endByte = null;

    // Note that |startTime| may be 0.
    if (segmentUrl.startTime != null) {
      shaka.asserts.assert(segmentUrl.mediaRange == null);
      shaka.asserts.assert(segmentUrl.segmentNumber != null);
      shaka.asserts.assert(segmentUrl.duration != null);

      if ((i > 0) && (segmentList.segmentUrls[i - 1].startTime != null)) {
        // Sanity check: there should not be a gap/overlap between the end of
        // the last segment and the start of the current segment.
        var lastTime = segmentList.segmentUrls[i - 1].startTime;
        var lastDuration = segmentList.segmentUrls[i - 1].duration;
        shaka.asserts.assert(lastTime + lastDuration == segmentUrl.startTime);
      }

      segmentNumber = /** @type {number} */ (segmentUrl.segmentNumber);
      startTime = segmentUrl.startTime / timescale;
      endTime = startTime + (segmentUrl.duration / timescale);
    } else {
      shaka.asserts.assert(segmentUrl.segmentNumber == null);
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
            segmentNumber,
            startTime,
            endTime,
            startByte,
            endByte,
            /** @type {!goog.Uri} */ (segmentUrl.mediaUrl)));
  }

  var segmentIndex = new shaka.media.SegmentIndex(references);
  shaka.log.debug('Generated SegmentIndex', segmentIndex);

  return segmentIndex;
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

