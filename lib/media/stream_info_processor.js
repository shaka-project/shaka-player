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

goog.require('shaka.log');
goog.require('shaka.media.PeriodInfo');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.media.StreamSetInfo');
goog.require('shaka.player.Player');



/**
 * Creates a StreamInfoProcessor, which chooses which streams the application
 * and browser can support.
 *
 * @constructor
 * @struct
 */
shaka.media.StreamInfoProcessor = function() {};


/**
 * Processes the given PeriodInfos.
 *
 * @param {!Array.<shaka.media.PeriodInfo>} periodInfos
 */
shaka.media.StreamInfoProcessor.prototype.process = function(periodInfos) {
  this.filterPeriodInfos_(periodInfos);
  this.sortStreamSetInfos_(periodInfos);
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
 * an unsupported MIME type.
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

    if (!Player.isTypeSupported(streamInfo.getFullMimeType())) {
      // Drop the stream if its MIME type is not supported by the browser.
      shaka.log.warning('Stream uses an unsupported MIME type.', streamInfo);
      streamSetInfo.streamInfos.splice(i, 1);
      --i;
    }
  }
};


/**
 * Sorts StreamInfos by bandwidth.
 *
 * @param {!Array.<!shaka.media.PeriodInfo>} periodInfos
 * @private
 */
shaka.media.StreamInfoProcessor.prototype.sortStreamSetInfos_ = function(
    periodInfos) {
  for (var i = 0; i < periodInfos.length; ++i) {
    var periodInfo = periodInfos[i];
    for (var j = 0; j < periodInfo.streamSetInfos.length; ++j) {
      var streamSetInfo = periodInfo.streamSetInfos[j];
      streamSetInfo.streamInfos.sort(
          shaka.media.StreamInfoProcessor.compareByBandwidth_);
    }
  }
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

