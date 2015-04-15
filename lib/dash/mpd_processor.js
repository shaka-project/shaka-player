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
 * Creates an MpdProcessor, which validates MPDs, calculates start/duration
 * attributes, removes invalid Representations, and ultimately generates a
 * ManifestInfo.
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
 * The maximum span, in seconds, that a SegmentIndex must account for when that
 * SegmentIndex is being generated via a segment duration.
 * @const {number}
 */
shaka.dash.MpdProcessor.MAX_SEGMENT_INDEX_SPAN = 2 * 60;


/**
 * The default value, in seconds, for MPD@minBufferTime if this attribute is
 * missing.
 * @const {number}
 */
shaka.dash.MpdProcessor.DEFAULT_MIN_BUFFER_TIME = 5.0;


/**
 * Processes the given MPD. Sets |this.periodInfos|.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 */
shaka.dash.MpdProcessor.prototype.process = function(mpd) {
  this.manifestInfo = new shaka.media.ManifestInfo();
  this.validateSegmentInfo_(mpd);
  this.calculateDurations_(mpd);
  this.filterPeriods_(mpd);
  this.createManifestInfo_(mpd);
};


/**
 * Ensures that each Representation has either a SegmentBase, SegmentList, or
 * SegmentTemplate.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
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
      }  // for k
    }
  }
};


/**
 * Attempts to calculate each Period's start attribute and duration attribute,
 * and attempts to calcuate the MPD's mediaPresentationDuration attribute.
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

  // If there is only one Period then infer its duration.
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
  this.manifestInfo.minBufferTime = mpd.minBufferTime ||
      shaka.dash.MpdProcessor.DEFAULT_MIN_BUFFER_TIME;

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

      // Keep track of the largest end time of all segment references so that
      // we can set a Period duration if one was not explicitly set in the MPD
      // or calculated from calculateDurations_().
      var maxLastEndTime = 0;

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

        var streamInfo = this.createStreamInfo_(mpd, period, representation);
        if (!streamInfo) {
          // An error has already been logged.
          continue;
        }

        streamSetInfo.streamInfos.push(streamInfo);
        streamSetInfo.drmSchemes = commonDrmSchemes;

        if (streamInfo.segmentIndex && streamInfo.segmentIndex.length() > 0) {
          maxLastEndTime =
              Math.max(maxLastEndTime, streamInfo.segmentIndex.last().endTime);
        }
      }

      periodInfo.streamSetInfos.push(streamSetInfo);

      if (!periodInfo.duration) {
        periodInfo.duration = maxLastEndTime;

        // If the MPD is dynamic then the Period's duration will likely change
        // after we re-process/update the MPD. When the Period's duration
        // changes we must update the MediaSource object that is presenting the
        // MPD's content, so we can append new media segments to the
        // MediaSource's SourceBuffers. However, changing the MediaSource's
        // duration is challenging as it requires synchronizing the states of
        // multiple SourceBuffers. We can leave the Period's duration as
        // undefined, but then we cannot seek (even programmatically).
        //
        // So, if the MPD is dynamic just set the Period's duration to a
        // "large" value. This ensures that we can seek and that we can append
        // new media segments. This does cause a poor UX if we use the video
        // element's default controls, but we shouldn't use the default
        // controls for live anyways.
        //
        // TODO: Remove this hack once SourceBuffer synchronization is
        // implemented.
        if (mpd.minUpdatePeriod) {
          periodInfo.duration += 60 * 60 * 24 * 30;
        }
      }
    }

    this.manifestInfo.periodInfos.push(periodInfo);
  }
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


/**
 * Creates a StreamInfo from the given Representation.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @return {shaka.media.StreamInfo} The new StreamInfo on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.MpdProcessor.prototype.createStreamInfo_ = function(
    mpd, period, representation) {
  var streamInfo = new shaka.media.StreamInfo();

  streamInfo.id = representation.id;
  streamInfo.bandwidth = representation.bandwidth;
  streamInfo.width = representation.width;
  streamInfo.height = representation.height;
  streamInfo.mimeType = representation.mimeType || '';
  streamInfo.codecs = representation.codecs || '';

  var ok;

  if (representation.segmentBase) {
    ok = this.buildStreamInfoFromSegmentBase_(
        representation.segmentBase, streamInfo);
  } else if (representation.segmentList) {
    ok = this.buildStreamInfoFromSegmentList_(
        representation.segmentList, streamInfo);
  } else if (representation.segmentTemplate) {
    ok = this.buildStreamInfoFromSegmentTemplate_(
        mpd, period, representation, streamInfo);
  } else if (representation.mimeType.split('/')[0] == 'text') {
    // All we need is a URL for subtitles.
    streamInfo.mediaUrl = new goog.Uri(representation.baseUrl);
    ok = true;
  } else {
    shaka.asserts.unreachable();
  }

  return ok ? streamInfo : null;
};


/**
 * Builds a StreamInfo from a SegmentBase.
 *
 * @param {!shaka.dash.mpd.SegmentBase} segmentBase
 * @param {!shaka.media.StreamInfo} streamInfo
 * @return {boolean} True on success.
 * @private
 */
shaka.dash.MpdProcessor.prototype.buildStreamInfoFromSegmentBase_ =
    function(segmentBase, streamInfo) {
  shaka.asserts.assert(segmentBase.timescale > 0);

  var hasSegmentIndexMetadata =
      segmentBase.indexRange ||
      (segmentBase.representationIndex &&
       segmentBase.representationIndex.range);
  if (!hasSegmentIndexMetadata || !segmentBase.baseUrl) {
    shaka.log.warning(
        'A SegmentBase must have a segment index URL and a base URL.',
        segmentBase);
    return false;
  }

  if (segmentBase.presentationTimeOffset) {
    // Each timestamp within each media segment is relative to the start of the
    // Period minus @presentationTimeOffset. So to align the start of the first
    // segment to the start of the Period we must apply an offset of -1 *
    // @presentationTimeOffset seconds to each timestamp within each media
    // segment.
    streamInfo.timestampOffset =
        -1 * segmentBase.presentationTimeOffset / segmentBase.timescale;
  }

  // If a RepresentationIndex does not exist then fallback to the indexRange
  // attribute.
  var representationIndex = segmentBase.representationIndex;
  if (!representationIndex) {
    representationIndex = new shaka.dash.mpd.RepresentationIndex();
    representationIndex.url = new goog.Uri(segmentBase.baseUrl);
    representationIndex.range = segmentBase.indexRange ?
                                segmentBase.indexRange.clone() :
                                null;
  }

  // Set StreamInfo properties.
  streamInfo.mediaUrl = new goog.Uri(segmentBase.baseUrl);

  streamInfo.segmentIndexInfo =
      this.createSegmentMetadataInfo_(representationIndex);

  streamInfo.segmentInitializationInfo =
      this.createSegmentMetadataInfo_(segmentBase.initialization);

  return true;
};


/**
 * Builds a StreamInfo from a SegmentList.
 *
 * @param {!shaka.dash.mpd.SegmentList} segmentList
 * @param {!shaka.media.StreamInfo} streamInfo
 * @return {boolean} True on success.
 * @private
 */
shaka.dash.MpdProcessor.prototype.buildStreamInfoFromSegmentList_ =
    function(segmentList, streamInfo) {
  shaka.asserts.assert(segmentList.timescale > 0);

  if (!segmentList.segmentDuration && (segmentList.segmentUrls.length > 1)) {
    shaka.log.warning(
        'A SegmentList without a segment duration can only have one segment.',
        segmentList);
    return false;
  }

  streamInfo.segmentInitializationInfo =
      this.createSegmentMetadataInfo_(segmentList.initialization);

  var lastEndTime = 0;
  var references = [];

  for (var i = 0; i < segmentList.segmentUrls.length; ++i) {
    var segmentUrl = segmentList.segmentUrls[i];

    // Compute the segment's unscaled start time.
    var startTime;
    if (i == 0) {
      startTime = 0;
    } else {
      startTime = lastEndTime;
    }
    shaka.asserts.assert(startTime >= 0);

    var endTime = null;
    var scaledEndTime = null;

    var scaledStartTime = startTime / segmentList.timescale;

    // If segmentList.segmentDuration is null then there must only be one
    // segment.
    if (segmentList.segmentDuration) {
      endTime = startTime + segmentList.segmentDuration;
      scaledEndTime = endTime / segmentList.timescale;
    }

    lastEndTime = endTime;

    var startByte = 0;
    var endByte = null;
    if (segmentUrl.mediaRange) {
      startByte = segmentUrl.mediaRange.begin;
      endByte = segmentUrl.mediaRange.end;
    }

    references.push(
        new shaka.media.SegmentReference(
            /** @type {number} */(startTime),
            scaledStartTime,
            scaledEndTime,
            startByte,
            endByte,
            new goog.Uri(segmentUrl.mediaUrl)));
  }

  // Set StreamInfo properties.
  streamInfo.segmentIndex = new shaka.media.SegmentIndex(references);
  shaka.log.debug('Generated SegmentIndex from SegmentList',
                  streamInfo.segmentIndex);

  return true;
};


/**
 * Builds a StreamInfo from a SegmentTemplate.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {!shaka.media.StreamInfo} streamInfo
 * @return {boolean} True on success.
 * @private
 */
shaka.dash.MpdProcessor.prototype.buildStreamInfoFromSegmentTemplate_ =
    function(mpd, period, representation, streamInfo) {
  shaka.asserts.assert(representation.segmentTemplate);
  var segmentTemplate = representation.segmentTemplate;

  var ok;

  // Prefer an explicit segment index URL, then a SegmentTimeline, and then a
  // segment duration.
  if (segmentTemplate.indexUrlTemplate) {
    if (segmentTemplate.timeline) {
      shaka.log.warning(
          'Ignoring SegmentTimeline because an explicit segment index ' +
          'URL was provided for the SegmentTemplate.',
          representation);
    }
    if (segmentTemplate.segmentDuration) {
      shaka.log.warning(
          'Ignoring segment duration because an explicit segment index ' +
          'URL was provided for the SegmentTemplate.',
          representation);
    }
    ok = this.buildStreamInfoFromIndexUrlTemplate_(representation, streamInfo);
  } else if (segmentTemplate.timeline) {
    if (segmentTemplate.segmentDuration) {
      shaka.log.warning(
          'Ignoring segment duration because a SegmentTimeline was ' +
          'provided for the SegmentTemplate.',
          representation);
    }
    ok = this.buildStreamInfoFromSegmentTimeline_(
        mpd, period, representation, streamInfo);
  } else if (segmentTemplate.segmentDuration) {
    ok = this.buildStreamInfoFromSegmentDuration_(
        mpd, period, representation, streamInfo);
  } else {
    shaka.log.error(
        'SegmentTemplate does not provide an explicit segment index URL, ' +
        'a SegmentTimeline, or a segment duration.',
        representation);
    ok = false;
  }

  return ok;
};


/**
 * Builds a StreamInfo from a SegmentTemplate with an index URL template.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {!shaka.media.StreamInfo} streamInfo
 * @return {boolean} True on success.
 * @private
 */
shaka.dash.MpdProcessor.prototype.buildStreamInfoFromIndexUrlTemplate_ =
    function(representation, streamInfo) {
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.indexUrlTemplate);
  shaka.asserts.assert(representation.segmentTemplate.timescale > 0);

  var segmentTemplate = representation.segmentTemplate;

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
      return false;
    }

    mediaUrl = representation.baseUrl ?
               representation.baseUrl.resolve(filledUrlTemplate) :
               filledUrlTemplate;
  } else {
    // Fallback to the Representation's URL.
    mediaUrl = new goog.Uri(representation.baseUrl);
  }

  // Generate a RepresentationIndex.
  var representationIndex = this.generateRepresentationIndex_(representation);
  if (!representationIndex) {
    // An error has already been logged.
    return false;
  }

  // Generate an Initialization.
  var initialization = null;
  if (segmentTemplate.initializationUrlTemplate) {
    initialization = this.generateInitialization_(representation);
    if (!initialization) {
      // An error has already been logged.
      return false;
    }
  }

  // Set StreamInfo properties.
  streamInfo.mediaUrl = new goog.Uri(mediaUrl);

  if (segmentTemplate.presentationTimeOffset) {
    streamInfo.timestampOffset =
        -1 * segmentTemplate.presentationTimeOffset / segmentTemplate.timescale;
  }

  streamInfo.segmentIndexInfo =
      this.createSegmentMetadataInfo_(representationIndex);

  streamInfo.segmentInitializationInfo =
      this.createSegmentMetadataInfo_(initialization);

  return true;
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
  shaka.asserts.assert(segmentTemplate.indexUrlTemplate);
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
    representationIndex.url = representation.baseUrl.resolve(filledUrlTemplate);
  } else {
    representationIndex.url = filledUrlTemplate;
  }

  return representationIndex;
};


/**
 * Builds a StreamInfo from a SegmentTemplate with a SegmentTimeline.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {!shaka.media.StreamInfo} streamInfo
 * @return {boolean} True on success.
 * @private
 */
shaka.dash.MpdProcessor.prototype.buildStreamInfoFromSegmentTimeline_ =
    function(mpd, period, representation, streamInfo) {
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.timeline);
  shaka.asserts.assert(representation.segmentTemplate.timescale > 0);

  if (period.start == null) {
    shaka.log.error(
        'Cannot instantiate SegmentTemplate: the period\'s start time is ' +
        'unknown.',
        representation);
    return false;
  }

  var segmentTemplate = representation.segmentTemplate;
  if (!segmentTemplate.mediaUrlTemplate) {
    shaka.log.error(
        'Cannot instantiate SegmentTemplate: SegmentTemplate does not have a ' +
        'media URL template.',
        representation);
    return false;
  }

  var timeline = this.createTimeline_(segmentTemplate);
  if (!timeline) {
    // An error has already been logged.
    return false;
  }

  // Compute the earliest available timestamp. Assume the MPD only contains
  // segments that are available. This simplifies the calculation below by
  // allowing us to ignore @availabilityStartTime. If we did use
  // @availabilityStartTime then the calculation below would be more
  // complicated than the calculations in computeAvailableSegmentRange_() since
  // the duration of each segment is variable here.
  var earliestAvailableTimestamp = 0;
  if (mpd.minUpdatePeriod && (timeline.length > 0)) {
    var index = Math.max(0, timeline.length - 2);
    var timeShiftBufferDepth = mpd.timeShiftBufferDepth || 0;
    earliestAvailableTimestamp =
        (timeline[index].start / segmentTemplate.timescale) -
        timeShiftBufferDepth;
  }

  // Generate a SegmentIndex.
  var references = [];

  for (var i = 0; i < timeline.length; ++i) {
    var startTime = timeline[i].start;
    var endTime = timeline[i].end;

    // Compute the segment's scaled start time and scaled end time.
    var scaledStartTime = startTime / segmentTemplate.timescale;
    var scaledEndTime = endTime / segmentTemplate.timescale;

    if (scaledStartTime < earliestAvailableTimestamp) {
      // Skip unavailable segments.
      continue;
    }

    var absoluteSegmentNumber = i + segmentTemplate.startNumber;

    // Compute the media URL template placeholder replacements.
    var segmentReplacement = absoluteSegmentNumber;
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
      return false;
    }

    var mediaUrl = representation.baseUrl ?
                   representation.baseUrl.resolve(filledUrlTemplate) :
                   filledUrlTemplate;

    references.push(
        new shaka.media.SegmentReference(
            startTime,
            scaledStartTime,
            scaledEndTime,
            0 /* startByte */,
            null /* endByte */,
            new goog.Uri(mediaUrl)));
  }

  // Generate an Initialization. If there are no references then assume that
  // the intialization segment is not available.
  var initialization = null;
  if (segmentTemplate.initializationUrlTemplate && (references.length > 0)) {
    initialization = this.generateInitialization_(representation);
    if (!initialization) {
      // An error has already been logged.
      return false;
    }
  }

  // Set StreamInfo properties.
  if (segmentTemplate.presentationTimeOffset) {
    streamInfo.timestampOffset =
        -1 * segmentTemplate.presentationTimeOffset / segmentTemplate.timescale;
  }

  if (mpd.minUpdatePeriod && (references.length > 0)) {
    var minBufferTime = this.manifestInfo.minBufferTime;
    var bestAvailableTimestamp =
        references[references.length - 1].startTime - minBufferTime;

    if (bestAvailableTimestamp >= earliestAvailableTimestamp) {
      shaka.log.v1('The best available segment is still available!');
    } else {
      // NOTE: @minBufferTime is large compared to @timeShiftBufferDepth, so we
      // can't start as far back, for buffering, as we'd like.
      bestAvailableTimestamp = earliestAvailableTimestamp;
      shaka.log.v1('The best available segment is no longer available.');
    }

    for (var i = 0; i < references.length; ++i) {
      if (references[i].endTime >= bestAvailableTimestamp) {
        streamInfo.currentSegmentStartTime = references[i].startTime;
        break;
      }
    }

    shaka.asserts.assert(streamInfo.currentSegmentStartTime != null);
  }

  streamInfo.segmentInitializationInfo =
      this.createSegmentMetadataInfo_(initialization);

  streamInfo.segmentIndex = new shaka.media.SegmentIndex(references);
  shaka.log.debug('Generated SegmentIndex from SegmentTimeline',
                  streamInfo.segmentIndex);

  return true;
};


/**
 * Expands a SegmentTimeline into a simple array-based timeline.
 *
 * @return {Array.<{start: number, end: number}>}
 * @private
 */
shaka.dash.MpdProcessor.prototype.createTimeline_ = function(segmentTemplate) {
  shaka.asserts.assert(segmentTemplate.timeline);

  var timePoints = segmentTemplate.timeline.timePoints;
  var lastEndTime = 0;

  /** @type {!Array.<{start: number, end: number}>} */
  var timeline = [];

  for (var i = 0; i < timePoints.length; ++i) {
    var repeat = timePoints[i].repeat || 0;
    for (var j = 0; j <= repeat; ++j) {
      if (!timePoints[i].duration) {
        shaka.log.warning(
            'SegmentTimeline "S" element does not have a duration.',
            timePoints[i]);
        return null;
      }

      // Compute the segment's unscaled start time and unscaled end time.
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
      var endTime = startTime + timePoints[i].duration;

      // The end of the last segment may end before the start of the current
      // segment (a gap) or may end after the start of the current segment (an
      // overlap). If there is a gap/overlap then stretch/compress the end of
      // the last segment to the start of the current segment.
      //
      // Note: it is possible to move the start of the current segment to the
      // end of the last segment, but this complicates the computation of the
      // $Time$ placeholder.
      if ((timeline.length > 0) && (startTime != lastEndTime)) {
        var delta = startTime - lastEndTime;

        if (Math.abs(delta / segmentTemplate.timescale) >=
            shaka.dash.MpdProcessor.GAP_OVERLAP_WARNING_THRESHOLD) {
          shaka.log.warning(
              'SegmentTimeline contains a large gap/overlap, the content may ' +
              'have errors in it.',
              timePoints[i]);
        }

        timeline[timeline.length - 1].end = startTime;
      }

      lastEndTime = endTime;

      timeline.push({start: startTime, end: endTime});
    }  // for j
  }

  return timeline;
};


/**
 * Builds a StreamInfo from a SegmentTemplate with a segment duration.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {!shaka.media.StreamInfo} streamInfo
 * @return {boolean} True on success.
 * @private
 */
shaka.dash.MpdProcessor.prototype.buildStreamInfoFromSegmentDuration_ =
    function(mpd, period, representation, streamInfo) {
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.segmentDuration);
  shaka.asserts.assert(representation.segmentTemplate.timescale > 0);

  if (period.start == null) {
    shaka.log.error(
        'Cannot instantiate SegmentTemplate: the period\'s start time is ' +
        'unknown.',
        representation);
    return false;
  }

  var segmentTemplate = representation.segmentTemplate;
  if (!segmentTemplate.mediaUrlTemplate) {
    shaka.log.error(
        'Cannot instantiate SegmentTemplate: SegmentTemplate does not have a ' +
        'media URL template.',
        representation);
    return false;
  }

  // The number of segment references to generate starting from the earliest
  // available segment to the current segment, but not counting the current
  // segment.
  var numSegmentsBeforeCurrentSegment = 0;

  // Find the earliest available segment and the current segment. All segment
  // numbers are relative to the start of |period| unless marked otherwise.
  var earliestSegmentNumber;
  var currentSegmentNumber;
  if (mpd.minUpdatePeriod) {
    var pair = this.computeAvailableSegmentRange_(mpd, period, segmentTemplate);
    if (pair) {
      // Build the SegmentIndex starting from the earliest available segment.
      earliestSegmentNumber = pair.earliest;
      currentSegmentNumber = pair.current;
      numSegmentsBeforeCurrentSegment =
          currentSegmentNumber - earliestSegmentNumber;
      shaka.asserts.assert(numSegmentsBeforeCurrentSegment >= 0);
    }
  } else {
    earliestSegmentNumber = 1;
  }
  shaka.asserts.assert(earliestSegmentNumber === undefined ||
                       earliestSegmentNumber >= 0);

  // The optimal number of segment references to generate starting from, and
  // including, the current segment
  var numSegmentsFromCurrentSegment = 0;

  // Note that if |earliestSegmentNumber| is undefined then the current segment
  // is not available.
  if (earliestSegmentNumber >= 0) {
    numSegmentsFromCurrentSegment =
        this.computeOptimalSegmentIndexSize_(mpd, period, segmentTemplate);
    if (!numSegmentsFromCurrentSegment) {
      // An error has already been logged.
      return false;
    }
  }

  var totalNumSegments =
      numSegmentsBeforeCurrentSegment + numSegmentsFromCurrentSegment;
  var references = [];

  for (var i = 0; i < totalNumSegments; ++i) {
    var segmentNumber = i + earliestSegmentNumber;

    var startTime = (segmentNumber - 1) * segmentTemplate.segmentDuration;
    var endTime = startTime + segmentTemplate.segmentDuration;

    var scaledStartTime = startTime / segmentTemplate.timescale;
    var scaledEndTime = endTime / segmentTemplate.timescale;

    var absoluteSegmentNumber =
        (segmentNumber - 1) + segmentTemplate.startNumber;

    // Compute the media URL template placeholder replacements.
    var segmentReplacement = absoluteSegmentNumber;
    var timeReplacement =
        ((segmentNumber - 1) + (segmentTemplate.startNumber - 1)) *
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
      return false;
    }

    var mediaUrl = representation.baseUrl ?
                   representation.baseUrl.resolve(filledUrlTemplate) :
                   filledUrlTemplate;

    references.push(
        new shaka.media.SegmentReference(
            startTime,
            scaledStartTime,
            scaledEndTime,
            0 /* startByte */,
            null /* endByte */,
            new goog.Uri(mediaUrl)));
  }

  // Generate an Initialization. If there are no references then assume that
  // the intialization segment is not available.
  var initialization = null;
  if (segmentTemplate.initializationUrlTemplate && (references.length > 0)) {
    initialization = this.generateInitialization_(representation);
    if (!initialization) {
      // An error has already been logged.
      return false;
    }
  }

  // Set StreamInfo properties.
  if (segmentTemplate.presentationTimeOffset) {
    streamInfo.timestampOffset =
        -1 * segmentTemplate.presentationTimeOffset / segmentTemplate.timescale;
  }

  if (mpd.minUpdatePeriod && (references.length > 0)) {
    shaka.asserts.assert(currentSegmentNumber);
    var scaledSegmentDuration =
        segmentTemplate.segmentDuration / segmentTemplate.timescale;
    streamInfo.currentSegmentStartTime =
        (currentSegmentNumber - 1) * scaledSegmentDuration;
  }

  streamInfo.segmentInitializationInfo =
      this.createSegmentMetadataInfo_(initialization);

  streamInfo.segmentIndex = new shaka.media.SegmentIndex(references);
  shaka.log.debug('Generated SegmentIndex from segment duration',
                  streamInfo.segmentIndex);

  return true;
};


/**
 * Computes the optimal number of segment references, N, for |period|.  If the
 * MPD is static then N * segmentDuration is the smallest multiple of
 * segmentDuration >= |period|'s duration; if the MPD is dynamic then N *
 * segmentDuration is the smallest multiple of segmentDuration >= the minimum
 * of |period|'s duration, minimumUpdatePeriod, and MAX_SEGMENT_INDEX_SPAN.
 *
 * If the MPD is dynamic, and at least one segment is available, then N can be
 * regarded as the number of segment references that we can generate right now,
 * such that the generated segment references will all be valid when it's time
 * to actually fetch the corresponding segments.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.SegmentTemplate} segmentTemplate
 * @return {?number}
 * @private
 */
shaka.dash.MpdProcessor.prototype.computeOptimalSegmentIndexSize_ = function(
    mpd, period, segmentTemplate) {
  shaka.asserts.assert(segmentTemplate.segmentDuration);
  shaka.asserts.assert(segmentTemplate.timescale > 0);

  var duration;
  if (mpd.type == 'static') {
    if (period.duration != null) {
      duration = period.duration;
    } else {
      shaka.log.error(
          'Cannot instantiate SegmentTemplate: the Period\'s duration ' +
          'is unknown.',
          period);
      return null;
    }
  } else {
    // Note that |period|'s duration and @minimumUpdatePeriod may be very
    // large, so fallback to a default value if necessary. The VideoSource is
    // responsible for generating new SegmentIndexes when it needs them.
    duration = Math.min(period.duration || Number.POSITIVE_INFINITY,
                        mpd.minUpdatePeriod || Number.POSITIVE_INFINITY,
                        shaka.dash.MpdProcessor.MAX_SEGMENT_INDEX_SPAN);
  }
  shaka.asserts.assert(
      duration && (duration != Number.POSITIVE_INFINITY),
      'duration should not be zero or infinity!');

  var scaledSegmentDuration =
      segmentTemplate.segmentDuration / segmentTemplate.timescale;
  var n = Math.ceil(duration / scaledSegmentDuration);

  shaka.log.v1('SegmentIndex span', duration);
  shaka.log.v1('Optimal SegmentIndex size', n);

  shaka.asserts.assert(n >= 1);
  return n;
};


/**
 * Computes the segment numbers of the earliest segment and the current
 * segment, both relative to the start of |period|. Assumes the MPD is dynamic.
 * |segmentTemplate| must have a segment duration.
 *
 * The earliest segment is the segment with the smallest start time that is
 * still available from the media server. The current segment is the segment
 * with the largest start time that is available from the media server and that
 * also respects the suggestedPresentationDelay attribute and the minBufferTime
 * attribute.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.SegmentTemplate} segmentTemplate
 * @return {?{earliest: number, current: number}} Two segment numbers, or null
 *     if the stream is not available yet.
 * @private
 */
shaka.dash.MpdProcessor.prototype.computeAvailableSegmentRange_ = function(
    mpd, period, segmentTemplate) {
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

  shaka.asserts.assert(segmentTemplate.segmentDuration);
  shaka.asserts.assert(segmentTemplate.timescale > 0);
  var scaledSegmentDuration =
      segmentTemplate.segmentDuration / segmentTemplate.timescale;

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
  //
  // TODO: Use availabilityTimeOffset
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
    shaka.log.v1('The best available segment is still available!');
  } else {
    // NOTE: @suggestedPresentationDelay + @minBufferTime is large compared to
    // @timeShiftBufferDepth, so we can't start as far back, for buffering, as
    // we'd like.
    currentSegmentStartTime = earliestAvailableSegmentStartTime;
    shaka.log.v1('The best available segment is no longer available.');
  }

  var earliestSegmentNumber =
      (earliestAvailableSegmentStartTime / scaledSegmentDuration) + 1;
  shaka.asserts.assert(
      earliestSegmentNumber == Math.round(earliestSegmentNumber),
      'earliestSegmentNumber should be an integer.');

  var currentSegmentNumber =
      (currentSegmentStartTime / scaledSegmentDuration) + 1;
  shaka.asserts.assert(
      currentSegmentNumber == Math.round(currentSegmentNumber),
      'currentSegmentNumber should be an integer.');

  shaka.log.v1('earliestSegmentNumber', earliestSegmentNumber);
  shaka.log.v1('currentSegmentNumber', currentSegmentNumber);

  return { earliest: earliestSegmentNumber, current: currentSegmentNumber };
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
  shaka.asserts.assert(segmentTemplate.initializationUrlTemplate);
  if (!segmentTemplate.initializationUrlTemplate) {
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
    initialization.url = representation.baseUrl.resolve(filledUrlTemplate);
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

