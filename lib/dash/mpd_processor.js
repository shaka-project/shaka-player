/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.dash.MpdProcessor');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.dash.ContainerSegmentIndexSource');
goog.require('shaka.dash.DurationSegmentIndexSource');
goog.require('shaka.dash.ListSegmentIndexSource');
goog.require('shaka.dash.MpdUtils');
goog.require('shaka.dash.TimelineSegmentIndexSource');
goog.require('shaka.dash.mpd');
goog.require('shaka.log');
goog.require('shaka.media.PeriodInfo');
goog.require('shaka.media.SegmentInitSource');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.media.StreamSetInfo');
goog.require('shaka.media.TextSegmentIndexSource');
goog.require('shaka.util.FailoverUri');



/**
 * Creates an MpdProcessor, which validates MPDs, calculates start, duration,
 * and other missing attributes, removes invalid Periods, AdaptationSets, and
 * Representations, and ultimately generates a ManifestInfo.
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
};


/**
 * The default value, in seconds, for MPD@minBufferTime if this attribute is
 * missing.
 * @const {number}
 */
shaka.dash.MpdProcessor.DEFAULT_MIN_BUFFER_TIME = 5.0;


/**
 * Processes the given MPD.
 * This function modifies |mpd| but does not take ownership of it.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {!shaka.media.ManifestInfo}
 */
shaka.dash.MpdProcessor.prototype.process = function(mpd, networkCallback) {
  var manifestCreationTime = shaka.util.Clock.now() / 1000.0;

  this.validateSegmentInfo_(mpd);
  this.calculateDurations_(mpd);
  this.filterPeriods_(mpd);

  if ((mpd.type == 'dynamic') && (mpd.availabilityStartTime == null)) {
    // Assume broadcasting just started.
    shaka.log.warning(
        'The MPD is \'dynamic\' but @availabilityStartTime is not specified:',
        'treating @availabilityStartTime as if it were the current time.');
    mpd.availabilityStartTime = manifestCreationTime;
  }

  return this.createManifestInfo_(mpd, manifestCreationTime, networkCallback);
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
              'Representation does not contain any segment information:',
              'the Representation must contain one of SegmentBase,',
              'SegmentList, or SegmentTemplate.',
              representation);
          adaptationSet.representations.splice(k, 1);
          --k;
        } else if (n != 1) {
          shaka.log.warning(
              'Representation contains multiple segment information sources:',
              'the Representation should only contain one of SegmentBase,',
              'SegmentList, or SegmentTemplate.',
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

  // Ignore @mediaPresentationDuration if the MPD is dynamic.
  // TODO: Consider using @mediaPresentationDuration or other duration
  // attributes for signalling the end of a live stream.
  if (mpd.type == 'dynamic') {
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
      shaka.log.warning(
          '@mediaPresentationDuration does not match the total duration of all',
          'Periods.');
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
        shaka.log.warning(
            'Some Periods may not have valid start times or durations.');
        mpd.mediaPresentationDuration =
            finalPeriod.start + finalPeriod.duration;
      } else {
        // Fallback to what we were able to compute.
        if (mpd.type != 'dynamic') {
          shaka.log.warning(
              'Some Periods may not have valid start times or durations;',
              '@mediaPresentationDuration may not include the duration of all',
              'periods.');
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
          'Representation does not have the same MIME type as other',
          'Representations within its AdaptationSet.',
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
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {!shaka.media.ManifestInfo}
 * @private
 */
shaka.dash.MpdProcessor.prototype.createManifestInfo_ = function(
    mpd, manifestCreationTime, networkCallback) {
  var manifestInfo = new shaka.media.ManifestInfo();

  if (mpd.type == 'dynamic') {
    manifestInfo.live = true;
    manifestInfo.updatePeriod = mpd.minUpdatePeriod;

    // Prefer the URL specified by the Location element.
    manifestInfo.updateUrl = new shaka.util.FailoverUri(
        networkCallback, mpd.updateLocation || mpd.url);

    manifestInfo.availabilityStartTime = mpd.availabilityStartTime;
  }

  manifestInfo.minBufferTime = mpd.minBufferTime ||
      shaka.dash.MpdProcessor.DEFAULT_MIN_BUFFER_TIME;

  for (var i = 0; i < mpd.periods.length; ++i) {
    var period = mpd.periods[i];

    if (period.start == null) {
      shaka.log.warning(
          'Skipping Period', i + 1, 'and any subsequent Periods:',
          'Period', i + 1, 'does not have a valid start time.',
          period);
      break;
    }

    var periodInfo = this.createPeriodInfo_(
        mpd, period, manifestCreationTime, networkCallback);
    manifestInfo.periodInfos.push(periodInfo);
  }

  return manifestInfo;
};


/**
 * Creates a PeriodInfo.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {!shaka.media.PeriodInfo}
 * @private
 */
shaka.dash.MpdProcessor.prototype.createPeriodInfo_ = function(
    mpd, period, manifestCreationTime, networkCallback) {
  shaka.asserts.assert(period.start != null);

  var periodInfo = new shaka.media.PeriodInfo();
  periodInfo.id = period.id;
  periodInfo.start = /** @type {number} */(period.start);
  periodInfo.duration = period.duration;

  // First group AdaptationSets by type.
  var setsByType = new shaka.util.MultiMap();
  period.adaptationSets.forEach(
      function(set) { setsByType.push(set.contentType || '', set); });

  var setTypes = setsByType.keys();
  for (var typeIdx = 0; typeIdx < setTypes.length; ++typeIdx) {
    var type = setTypes[typeIdx];

    // Then group AdaptationSets of the same type by group.
    var setsByGroup = new shaka.util.MultiMap();
    setsByType.get(type).forEach(
        function(set) { setsByGroup.push(set.group, set); });

    var setGroups = setsByGroup.keys();
    for (var groupIdx = 0; groupIdx < setGroups.length; ++groupIdx) {
      var group = setGroups[groupIdx];
      shaka.asserts.assert(group != null);

      // Finally group AdaptationSets of the same type and group by language,
      // then squash them into the same StreamSetInfo.
      var setsByLang = new shaka.util.MultiMap();
      setsByGroup.get(group).forEach(
          function(set) { setsByLang.push(set.lang, set); });

      var setLangs = setsByLang.keys();
      for (var langIdx = 0; langIdx < setLangs.length; ++langIdx) {
        var lang = setLangs[langIdx];

        var sets = /** @type {!Array.<shaka.dash.mpd.AdaptationSet>} */(
            setsByLang.get(lang));
        var streamSetInfo = this.createStreamSetInfo_(
            mpd, period, sets, manifestCreationTime, networkCallback);
        periodInfo.streamSetInfos.push(streamSetInfo);
      }  // for langIdx
    }  // for groupIdx
  }  // for typeIdx

  return periodInfo;
};


/**
 * Creates a StreamSetInfo from AdaptationSets of the same type, group, and
 * language.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {Array.<!shaka.dash.mpd.AdaptationSet>} adaptationSets
 *     AdaptationSets from the same group.
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {!shaka.media.StreamSetInfo}
 * @private
 */
shaka.dash.MpdProcessor.prototype.createStreamSetInfo_ = function(
    mpd, period, adaptationSets, manifestCreationTime, networkCallback) {
  shaka.asserts.assert(adaptationSets.length > 0);
  shaka.asserts.assert(adaptationSets.every(function(set) {
    return (set.group == adaptationSets[0].group) &&
           ((set.lang || '') == (adaptationSets[0].lang || '')) &&
           ((set.contentType || '') == (adaptationSets[0].contentType || ''));
  }));

  var streamSetInfo = new shaka.media.StreamSetInfo();

  // Construct a StreamSetInfo ID from the AdaptationSet IDs. Consider the
  // entire StreamSetInfo unidentifiable if an AdaptationSet (in the group)
  // does not have an ID. StreamSetInfo IDs must remain identical between
  // manifest updates, see shaka.media.ManifestUpdater.
  var identifiable = adaptationSets
      .filter(function(set) { return set.id != null; });
  if (identifiable.length == adaptationSets.length) {
    streamSetInfo.id = identifiable
        .map(function(set) { return set.id; })
        .sort()
        .reduce(function(all, part) { return all + ',' + part; });
  }

  streamSetInfo.lang = adaptationSets[0].lang || '';
  streamSetInfo.contentType = adaptationSets[0].contentType || '';
  streamSetInfo.main = adaptationSets.some(
      function(set) { return set.main; });

  // Maps each StreamInfo to its AdaptationSet, which we use below to enable
  // certain StreamInfos.
  var streamInfoUidToAdaptationSet = {};

  for (var i = 0; i < adaptationSets.length; ++i) {
    var adaptationSet = adaptationSets[i];

    for (var j = 0; j < adaptationSet.representations.length; ++j) {
      var representation = adaptationSet.representations[j];
      var drmInfos = this.getDrmInfos_(representation);

      // Update the common DrmInfos.
      var commonDrmInfos = streamSetInfo.drmInfos.slice(0);
      this.updateCommonDrmInfos_(drmInfos, commonDrmInfos);
      if (commonDrmInfos.length == 0 && streamSetInfo.drmInfos.length > 0) {
        shaka.log.warning(
            'Representation does not contain any ContentProtection elements',
            'that are compatible with other Representations within its',
            'AdaptationSet or AdaptationSet group.',
            representation);
        continue;
      }

      var streamInfo = this.createStreamInfo_(
          mpd, period, representation, manifestCreationTime, networkCallback);
      if (!streamInfo) {
        // An error has already been logged.
        continue;
      }

      streamSetInfo.streamInfos.push(streamInfo);
      streamSetInfo.drmInfos = commonDrmInfos;

      streamInfoUidToAdaptationSet[streamInfo.uniqueId] = adaptationSet;
    }  // for j
  }  // for i

  // If the streams are unencrypted then we don't require a key system.
  var unencrypted = streamSetInfo.drmInfos.some(
      function(drmInfo) { return drmInfo.keySystem == ''; });
  if (unencrypted) {
    streamSetInfo.streamInfos.forEach(
        function(streamInfo) { streamInfo.allowedByKeySystem = true; });
    return streamSetInfo;
  }

  // If the streams are encrypted then assume the key system can probably
  // decrypt the lowest quality streams.  This enables the VideoSource to
  // select at least one stream for stream startup without having to query the
  // key system first.
  //
  // The lowest quality streams are the streams that are contained within
  // the AdaptationSet which contains THE lowest quality stream.
  //
  // For example, given an MPD that looks like
  // <AdaptationSet id="A1" group="1">
  //   <Representation id="R1" width="360" height="240" />
  //   <Representation id="R2" width="640" height="480" />
  // </AdaptationSet>
  // <AdaptationSet id="A2' group="1">
  //   <ContentProtection cenc:default_KID="01234567890ABCDEF" />
  //   <Representation id="R3" width="1280" height="720" />
  //   <Representation id="R4" width="1920" height="1080" />
  // </AdaptationSet>
  // the lowest quality streams are R1 and R2.
  var lowestQualitySet = this.findLowestQualityAdaptationSet_(adaptationSets);

  for (var i = 0; i < streamSetInfo.streamInfos.length; ++i) {
    var streamInfo = streamSetInfo.streamInfos[i];
    var adaptationSet = streamInfoUidToAdaptationSet[streamInfo.uniqueId];
    if (adaptationSet == lowestQualitySet) {
      shaka.log.v1(
          'Assuming the key system can decrypt stream', streamInfo.id + '.');
      streamInfo.allowedByKeySystem = true;
    }
  }

  return streamSetInfo;
};


/**
 * Returns the AdaptationSet that contains the lowest quality Representation.
 *
 * @param {!Array.<!shaka.dash.mpd.AdaptationSet>} adaptationSets
 * @return {shaka.dash.mpd.AdaptationSet}
 * @private
 */
shaka.dash.MpdProcessor.prototype.findLowestQualityAdaptationSet_ = function(
    adaptationSets) {
  var lowestQuality = null;
  var lowestQualitySet = null;

  for (var i = 0; i < adaptationSets.length; ++i) {
    var adaptationSet = adaptationSets[i];

    for (var j = 0; j < adaptationSet.representations.length; ++j) {
      var representation = adaptationSet.representations[j];

      var quality = (representation.width || 1) *
                    (representation.height || 1) *
                    (representation.bandwidth || 1);
      if ((lowestQuality == null) || (quality < lowestQuality)) {
        lowestQuality = quality;
        lowestQualitySet = adaptationSet;
      }
    }
  }

  return lowestQualitySet;
};


/**
 * Sets |commonDrmInfos| to |drmInfos| if |commonDrmInfos| is empty; otherwise,
 * sets |commonDrmInfos| to the intersection between |commonDrmInfos| and
 * |drmInfos|.
 *
 * @param {!Array.<!shaka.player.DrmInfo>} drmInfos
 * @param {!Array.<!shaka.player.DrmInfo>} commonDrmInfos
 *
 * @private
 */
shaka.dash.MpdProcessor.prototype.updateCommonDrmInfos_ = function(
    drmInfos, commonDrmInfos) {
  if (commonDrmInfos.length == 0) {
    Array.prototype.push.apply(commonDrmInfos, drmInfos);
    return;
  }

  for (var i = 0; i < commonDrmInfos.length; ++i) {
    var found = false;
    for (var j = 0; j < drmInfos.length; ++j) {
      if (commonDrmInfos[i].isCompatible(drmInfos[j])) {
        found = true;
        break;
      }
    }
    if (!found) {
      commonDrmInfos.splice(i, 1);
      --i;
    }
  }
};


/**
 * Gets the application provided DrmInfos for the given Representation.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @return {!Array.<!shaka.player.DrmInfo>} The application provided
 *     DrmInfos. A dummy DrmInfo, which has an empty |keySystem| string,
 *     is used for unencrypted content.
 * @private
 */
shaka.dash.MpdProcessor.prototype.getDrmInfos_ = function(representation) {
  var drmInfos = [];
  if (representation.contentProtections.length == 0) {
    // Return a single item which indicates that the content is unencrypted.
    drmInfos.push(new shaka.player.DrmInfo());
  } else if (this.interpretContentProtection_) {
    for (var i = 0; i < representation.contentProtections.length; ++i) {
      var contentProtection = representation.contentProtections[i];
      drmInfos.push.apply(drmInfos, this.createDrmInfos_(contentProtection));
    }
  }
  return drmInfos;
};


/**
 * @param {!shaka.dash.mpd.ContentProtection} contentProtection
 * @return {!Array.<!shaka.player.DrmInfo>}
 * @private
 */
shaka.dash.MpdProcessor.prototype.createDrmInfos_ = function(
    contentProtection) {
  var drmInfos = [];

  var newStyle = this.interpretContentProtection_.length == 2;
  if (!newStyle) {
    shaka.log.error(
        'You must use the new-style ContentProtection interpretation API.',
        'See shaka.player.DashVideoSource.ContentProtectionCallback.');
    return [];
  }

  var schemeId = contentProtection.schemeIdUri || '';
  var element = /** @type {!Node} */ (contentProtection.element);
  var configs = this.interpretContentProtection_(schemeId, element);
  if (!configs) {
    return [];
  }

  if (!(configs instanceof Array)) {
    shaka.log.error(
        'ContentProtection interpretation callback must return',
        'an array of shaka.player.DrmInfo.Config objects.');
    return [];
  }

  for (var i = 0; i < configs.length; ++i) {
    var drmInfo = shaka.player.DrmInfo.createFromConfig(configs[i]);

    if (drmInfo.initDatas.length == 0 &&
        contentProtection.pssh &&
        contentProtection.pssh.psshBox) {
      var initData = {
        'initData': contentProtection.pssh.psshBox,
        'initDataType': 'cenc'
      };
      drmInfo.addInitDatas([initData]);
    }

    drmInfos.push(drmInfo);
  }

  return drmInfos;
};


/**
 * Creates a StreamInfo from the given Representation.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {shaka.media.StreamInfo} The new StreamInfo on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.MpdProcessor.prototype.createStreamInfo_ = function(
    mpd, period, representation, manifestCreationTime, networkCallback) {
  if (!representation.baseUrl || representation.baseUrl.length === 0) {
    shaka.log.warning(
        'Representation does not contain sufficient segment information:',
        'the Representation must contain a BaseURL.',
        representation);
    return null;
  }

  var streamInfo = null;
  var timescale = 1;
  var presentationTimeOffset = 0;

  if (representation.segmentBase) {
    streamInfo = this.createStreamInfoFromSegmentBase_(
        mpd, period, representation, manifestCreationTime, networkCallback);
    timescale = representation.segmentBase.timescale;
    presentationTimeOffset = representation.segmentBase.presentationTimeOffset;
  } else if (representation.segmentList) {
    streamInfo = this.createStreamInfoFromSegmentList_(
        mpd, period, representation, manifestCreationTime, networkCallback);
    timescale = representation.segmentList.timescale;
    presentationTimeOffset = representation.segmentList.presentationTimeOffset;
  } else if (representation.segmentTemplate) {
    streamInfo = this.createStreamInfoFromSegmentTemplate_(
        mpd, period, representation, manifestCreationTime, networkCallback);
    timescale = representation.segmentTemplate.timescale;
    presentationTimeOffset =
        representation.segmentTemplate.presentationTimeOffset;
  } else if (representation.mimeType.split('/')[0] == 'text') {
    streamInfo = new shaka.media.StreamInfo();
    streamInfo.segmentIndexSource = new shaka.media.TextSegmentIndexSource(
        new shaka.util.FailoverUri(networkCallback, representation.baseUrl));
  } else {
    shaka.asserts.unreachable();
  }

  if (!streamInfo) {
    // An error has already been logged.
    return null;
  }

  streamInfo.id = representation.id;

  if (presentationTimeOffset) {
    // Each timestamp within each media segment is relative to the start of the
    // Period minus @presentationTimeOffset. So to align the start of the first
    // segment to the start of the Period we must apply an offset of -1 *
    // @presentationTimeOffset seconds to each timestamp within each media
    // segment.
    streamInfo.timestampOffset = -1 * presentationTimeOffset / timescale;
  }

  streamInfo.bandwidth = representation.bandwidth;
  streamInfo.width = representation.width;
  streamInfo.height = representation.height;
  streamInfo.mimeType = representation.mimeType || '';
  streamInfo.codecs = representation.codecs || '';

  for (var i = 0; i < representation.contentProtections.length; ++i) {
    // Since we don't know which key system we will use yet, map each
    // cenc:default_KID that the manifest specifies.
    var contentProtection = representation.contentProtections[i];
    if (contentProtection.defaultKeyId) {
      streamInfo.keyIds.push(contentProtection.defaultKeyId);
    }
  }

  return streamInfo;
};


/**
 * Creates a StreamInfo from a SegmentBase.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {shaka.media.StreamInfo} A streamInfo on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.MpdProcessor.prototype.createStreamInfoFromSegmentBase_ = function(
    mpd, period, representation, manifestCreationTime, networkCallback) {
  shaka.asserts.assert(representation.segmentBase);
  shaka.asserts.assert(representation.segmentBase.timescale > 0);

  // Determine the container type.
  var containerType = representation.mimeType.split('/')[1];
  if ((containerType != 'mp4') && (containerType != 'webm')) {
    shaka.log.warning(
        'SegmentBase specifies an unsupported container type.',
        representation);
    return null;
  }

  var segmentBase = representation.segmentBase;

  if ((containerType == 'webm') && !segmentBase.initialization) {
    shaka.log.warning(
        'SegmentBase does not contain sufficient segment information:',
        'the SegmentBase uses a WebM container,',
        'but does not contain an Initialization element.',
        segmentBase);
    return null;
  }

  var hasSegmentIndexMetadata =
      segmentBase.indexRange ||
      (segmentBase.representationIndex &&
       segmentBase.representationIndex.range);
  if (!hasSegmentIndexMetadata) {
    shaka.log.warning(
        'SegmentBase does not contain sufficient segment information:',
        'the SegmentBase does not contain @indexRange',
        'or a RepresentationIndex element.',
        segmentBase);
    return null;
  }

  // If a RepresentationIndex does not exist then fallback to @indexRange.
  var representationIndex = segmentBase.representationIndex;
  if (!representationIndex) {
    representationIndex = new shaka.dash.mpd.RepresentationIndex();
    representationIndex.url = representation.baseUrl;
    representationIndex.range = segmentBase.indexRange ?
                                segmentBase.indexRange.clone() :
                                null;
  }

  var indexMetadata = this.createSegmentMetadata_(
      representationIndex, networkCallback);
  var initMetadata =
      segmentBase.initialization ?
      this.createSegmentMetadata_(segmentBase.initialization, networkCallback) :
      null;

  var segmentIndexSource =
      new shaka.dash.ContainerSegmentIndexSource(
          mpd,
          period,
          containerType,
          indexMetadata,
          initMetadata,
          manifestCreationTime,
          networkCallback);
  var segmentInitSource = new shaka.media.SegmentInitSource(initMetadata);

  var streamInfo = new shaka.media.StreamInfo();
  streamInfo.segmentIndexSource = segmentIndexSource;
  streamInfo.segmentInitSource = segmentInitSource;

  return streamInfo;
};


/**
 * Creates a StreamInfo from a SegmentList.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {shaka.media.StreamInfo} A StreamInfo on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.MpdProcessor.prototype.createStreamInfoFromSegmentList_ =
    function(mpd, period, representation, manifestCreationTime,
             networkCallback) {
  shaka.asserts.assert(representation.segmentList);

  var segmentList = representation.segmentList;

  if (!segmentList.segmentDuration && !segmentList.timeline &&
      (segmentList.segmentUrls.length > 1)) {
    shaka.log.warning(
        'SegmentList does not contain sufficient segment information:',
        'the SegmentList specifies multiple segments,',
        'but does not specify a segment duration or timeline.',
        segmentList);
    return null;
  }

  if (!segmentList.segmentDuration && !period.duration &&
      !segmentList.timeline && (segmentList.segmentUrls.length == 1)) {
    shaka.log.warning(
        'SegmentList does not contain sufficient segment information:',
        'the SegmentList specifies one segment,',
        'but does not specify a segment duration, period duration,',
        'or timeline.',
        segmentList);
    return null;
  }

  if (segmentList.timeline && segmentList.timeline.timePoints.length === 0) {
    shaka.log.warning(
        'SegmentList does not contain sufficient segment information:',
        'the SegmentList has an empty timeline.',
        segmentList);
    return null;
  }

  var initMetadata =
      segmentList.initialization ?
      this.createSegmentMetadata_(segmentList.initialization, networkCallback) :
      null;

  var segmentIndexSource =
      new shaka.dash.ListSegmentIndexSource(
          mpd, period, representation, manifestCreationTime, networkCallback);
  var segmentInitSource = new shaka.media.SegmentInitSource(initMetadata);

  var streamInfo = new shaka.media.StreamInfo();
  streamInfo.segmentIndexSource = segmentIndexSource;
  streamInfo.segmentInitSource = segmentInitSource;

  return streamInfo;
};


/**
 * Creates a StreamInfo from a SegmentTemplate
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {shaka.media.StreamInfo} A StreamInfo on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.MpdProcessor.prototype.createStreamInfoFromSegmentTemplate_ =
    function(mpd, period, representation, manifestCreationTime,
             networkCallback) {
  shaka.asserts.assert(representation.segmentTemplate);

  var segmentTemplate = /** @type {!shaka.dash.mpd.SegmentTemplate} */ (
      representation.segmentTemplate);

  if (!this.validateSegmentTemplate_(segmentTemplate)) {
    // An error has already been logged.
    return null;
  }

  // Generate an Initialization.
  var initialization = null;
  if (segmentTemplate.initializationUrlTemplate) {
    initialization = this.generateInitialization_(representation);
    if (!initialization) {
      // An error has already been logged.
      return null;
    }
  }

  var initMetadata =
      initialization ? this.createSegmentMetadata_(
          initialization, networkCallback) : null;

  var segmentIndexSource = this.makeSegmentIndexSourceViaSegmentTemplate_(
      mpd, period, representation, manifestCreationTime, initMetadata,
      networkCallback);
  if (!segmentIndexSource) {
    // An error has already been logged.
    return null;
  }

  var segmentInitSource = new shaka.media.SegmentInitSource(initMetadata);

  var streamInfo = new shaka.media.StreamInfo();
  streamInfo.segmentIndexSource = segmentIndexSource;
  streamInfo.segmentInitSource = segmentInitSource;

  return streamInfo;
};


/**
 * Ensures that |segmentTemplate| has either an index URL template, a
 * SegmentTimeline, or a segment duration.
 *
 * @param {!shaka.dash.mpd.SegmentTemplate} segmentTemplate
 * @return {boolean}
 * @private
 */
shaka.dash.MpdProcessor.prototype.validateSegmentTemplate_ = function(
    segmentTemplate) {
  var n = 0;
  n += segmentTemplate.indexUrlTemplate ? 1 : 0;
  n += segmentTemplate.timeline ? 1 : 0;
  n += segmentTemplate.segmentDuration ? 1 : 0;

  if (n == 0) {
    shaka.log.warning(
        'SegmentTemplate does not contain any segment information:',
        'the SegmentTemplate must contain either an index URL template',
        'a SegmentTimeline, or a segment duration.',
        segmentTemplate);
    return false;
  } else if (n != 1) {
    shaka.log.warning(
        'SegmentTemplate containes multiple segment information sources:',
        'the SegmentTemplate should only contain an index URL template,',
        'a SegmentTimeline or a segment duration.',
        segmentTemplate);
    if (segmentTemplate.indexUrlTemplate) {
      shaka.log.info('Using the index URL template by default.');
      segmentTemplate.timeline = null;
      segmentTemplate.segmentDuration = null;
    } else if (segmentTemplate.timeline) {
      shaka.log.info('Using the SegmentTimeline by default.');
      segmentTemplate.segmentDuration = null;
    } else {
      shaka.asserts.unreachable();
    }
  }

  return true;
};


/**
 * Creates an ISegmentIndexSource from a SegmentTemplate.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri} initMetadata
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {shaka.media.ISegmentIndexSource} A SegmentIndexSource on success;
 *     otherwise, return null.
 * @private
 */
shaka.dash.MpdProcessor.prototype.makeSegmentIndexSourceViaSegmentTemplate_ =
    function(mpd, period, representation, manifestCreationTime, initMetadata,
             networkCallback) {
  shaka.asserts.assert(representation.segmentTemplate);

  var segmentTemplate = representation.segmentTemplate;

  if (segmentTemplate.indexUrlTemplate) {
    return this.makeSegmentIndexSourceViaIndexUrlTemplate_(
        mpd, period, representation, manifestCreationTime, initMetadata,
        networkCallback);
  }

  if (!segmentTemplate.mediaUrlTemplate) {
    shaka.log.warning(
        'SegmentTemplate does not contain sufficient segment information:',
        'the SegmentTemplate\'s media URL template is missing.',
        representation);
    return null;
  }

  if (segmentTemplate.timeline) {
    return new shaka.dash.TimelineSegmentIndexSource(
        mpd, period, representation, manifestCreationTime, networkCallback);
  } else if (segmentTemplate.segmentDuration) {
    if ((mpd.type != 'dynamic') && (period.duration == null)) {
      shaka.log.warning(
          'SegmentTemplate does not contain sufficient segment information:',
          'the Period\'s duration is not known.',
          representation);
      return null;
    }
    return new shaka.dash.DurationSegmentIndexSource(
        mpd, period, representation, manifestCreationTime, networkCallback);
  }

  shaka.asserts.unreachable();
  return null;
};


/**
 * Creates an ISegmentIndexSource from a SegmentTemplate with an index URL
 * template.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri} initMetadata
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {shaka.media.ISegmentIndexSource} A SegmentIndexSource on success;
 *     otherwise, return null.
 * @private
 */
shaka.dash.MpdProcessor.prototype.makeSegmentIndexSourceViaIndexUrlTemplate_ =
    function(mpd, period, representation, manifestCreationTime, initMetadata,
             networkCallback) {
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.indexUrlTemplate);

  // Determine the container type.
  var containerType = representation.mimeType.split('/')[1];
  if ((containerType != 'mp4') && (containerType != 'webm')) {
    shaka.log.warning(
        'SegmentTemplate specifies an unsupported container type.',
        representation);
    return null;
  }

  var segmentTemplate = representation.segmentTemplate;

  if ((containerType == 'webm') && !initMetadata) {
    shaka.log.warning(
        'SegmentTemplate does not contain sufficient segment information:',
        'the SegmentTemplate uses a WebM container,',
        'but does not contain an initialization URL template.',
        segmentTemplate);
    return null;
  }

  // Generate the media URL.
  var mediaUrl = shaka.dash.MpdUtils.createFromTemplate(
      networkCallback, representation, 1, 0, 0, null);
  if (!mediaUrl) {
    // An error has already been logged.
    return null;
  }

  // Generate a RepresentationIndex.
  var representationIndex = this.generateRepresentationIndex_(representation);
  if (!representationIndex) {
    // An error has already been logged.
    return null;
  }

  var indexMetadata = this.createSegmentMetadata_(
      representationIndex, networkCallback);

  var segmentIndexSource =
      new shaka.dash.ContainerSegmentIndexSource(
          mpd,
          period,
          containerType,
          indexMetadata,
          initMetadata,
          manifestCreationTime,
          networkCallback);

  return segmentIndexSource;
};


/**
 * Generates a RepresentationIndex from a SegmentTemplate.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @return {shaka.dash.mpd.RepresentationIndex} A RepresentationIndex on
 *     success; otherwise, return null if no index URL template exists or an
 *     error occurred.
 * @private
 */
shaka.dash.MpdProcessor.prototype.generateRepresentationIndex_ = function(
    representation) {
  shaka.asserts.assert(representation.segmentTemplate);
  var urlTemplate = representation.segmentTemplate.indexUrlTemplate;
  if (!urlTemplate) return null;
  return this.generateUrlTypeObject_(
      representation, urlTemplate, shaka.dash.mpd.RepresentationIndex);
};


/**
 * Generates an Initialization from a SegmentTemplate.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @return {shaka.dash.mpd.Initialization} An Initialization on success;
 *     otherwise return null if no initialization URL template exists or an
 *     error occurred.
 * @private
 */
shaka.dash.MpdProcessor.prototype.generateInitialization_ = function(
    representation) {
  shaka.asserts.assert(representation.segmentTemplate);
  var urlTemplate = representation.segmentTemplate.initializationUrlTemplate;
  if (!urlTemplate) return null;
  return this.generateUrlTypeObject_(
      representation, urlTemplate, shaka.dash.mpd.Initialization);
};


/**
 * Generates either an Initialization or a RepresentationIndex.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {string} urlTemplate
 * @param {!function(new:T)} constructor
 * @return {T}
 * @template T
 * @private
 */
shaka.dash.MpdProcessor.prototype.generateUrlTypeObject_ = function(
    representation, urlTemplate, constructor) {
  shaka.asserts.assert(representation.segmentTemplate);
  var segmentTemplate = representation.segmentTemplate;

  // $Number$ and $Time$ cannot be present in an initialization URL template.
  var filledUrlTemplate = shaka.dash.MpdUtils.fillUrlTemplate(
      urlTemplate,
      representation.id,
      null,
      representation.bandwidth,
      null);

  if (!filledUrlTemplate) {
    // An error has already been logged.
    return null;
  }

  /**
   * @type {!shaka.dash.mpd.RepresentationIndex|
   *        !shaka.dash.mpd.Initialization}
   */
  var urlTypeObject = new constructor();
  urlTypeObject.url = shaka.util.FailoverUri.resolve(
      representation.baseUrl, filledUrlTemplate);
  return urlTypeObject;
};


/**
 * Creates a SegmentMetadata from either a RepresentationIndex or an
 * Initialization.
 *
 * @param {!shaka.dash.mpd.RepresentationIndex|
 *         !shaka.dash.mpd.Initialization} urlTypeObject
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @return {!shaka.util.FailoverUri}
 * @private
 */
shaka.dash.MpdProcessor.prototype.createSegmentMetadata_ = function(
    urlTypeObject, networkCallback) {
  var url = urlTypeObject.url;

  var startByte = 0;
  var endByte = null;
  if (urlTypeObject.range) {
    startByte = urlTypeObject.range.begin;
    endByte = urlTypeObject.range.end;
  }

  return new shaka.util.FailoverUri(networkCallback, url, startByte, endByte);
};

