/**
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
 *
 * @fileoverview Implements a SegmentIndexSource that constructs a SegmentIndex
 * from an MP4 or WebM container.
 */

goog.provide('shaka.dash.ContainerSegmentIndexSource');

goog.require('shaka.asserts');
goog.require('shaka.dash.LiveSegmentIndex');
goog.require('shaka.log');
goog.require('shaka.media.ISegmentIndexSource');
goog.require('shaka.media.Mp4SegmentIndexParser');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentMetadata');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.WebmSegmentIndexParser');
goog.require('shaka.util.TypedBind');



/**
 * Creates a ContainerSegmentIndexSource.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {string} containerType The container type, which must be either
 *     'mp4' or 'webm'.
 * @param {!shaka.media.SegmentMetadata} indexMetadata Metadata info for the
 *     container's index metadata.
 * @param {shaka.media.SegmentMetadata} initMetadata Metadata info for the
 *     container's headers, which is required for WebM containers and ignored
 *     for MP4 containers.
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @constructor
 * @struct
 * @implements {shaka.media.ISegmentIndexSource}
 */
shaka.dash.ContainerSegmentIndexSource = function(
    mpd, period, containerType, indexMetadata, initMetadata,
    manifestCreationTime) {
  shaka.asserts.assert(containerType != 'webm' || initMetadata);

  /** @private {!shaka.dash.mpd.Mpd} */
  this.mpd_ = mpd;

  /** @private {!shaka.dash.mpd.Period} */
  this.period_ = period;

  /** @private {string} */
  this.containerType_ = containerType;

  /** @private {!shaka.media.SegmentMetadata} */
  this.indexMetadata_ = indexMetadata;

  /** @private {shaka.media.SegmentMetadata} */
  this.initMetadata_ = initMetadata;

  /** @private {number} */
  this.manifestCreationTime_ = manifestCreationTime;

  /** @private {Promise.<!shaka.media.SegmentIndex>} */
  this.promise_ = null;

  /** @private {shaka.media.SegmentIndex} */
  this.segmentIndex_ = null;
};


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.dash.ContainerSegmentIndexSource.prototype.destroy = function() {
  this.mpd_ = null;
  this.period_ = null;

  this.indexMetadata_.abortFetch();
  this.indexMetadata_ = null;

  if (this.initMetadata_) {
    this.initMetadata_.abortFetch();
    this.initMetadata_ = null;
  }

  if (this.segmentIndex_) {
    this.segmentIndex_.destroy();
    this.segmentIndex_ = null;
  }

  this.promise_ = null;
};


/** @override */
shaka.dash.ContainerSegmentIndexSource.prototype.create = function() {
  if (this.promise_) {
    return this.promise_;
  }

  var async = [this.indexMetadata_.fetch()];
  if (this.containerType_ == 'webm') {
    async.push(this.initMetadata_.fetch());
  }

  this.promise_ = Promise.all(async).then(shaka.util.TypedBind(this,
      /** @param {!Array} results */
      function(results) {
        var indexData = results[0];
        var initData = results[1] || null;

        var references = null;
        if (this.containerType_ == 'mp4') {
          var parser = new shaka.media.Mp4SegmentIndexParser();
          references = parser.parse(new DataView(indexData),
                                    this.indexMetadata_.startByte,
                                    this.indexMetadata_.url);
        } else if (this.containerType_ == 'webm') {
          shaka.asserts.assert(initData);
          var parser = new shaka.media.WebmSegmentIndexParser();
          references = parser.parse(new DataView(indexData),
                                    new DataView(initData),
                                    this.indexMetadata_.url);
        } else {
          shaka.asserts.unreachable();
        }

        if (!references) {
          var error = new Error('Failed to parse segment references from',
                                this.containerType_,
                                'container.');
          error.type = 'stream';
          return Promise.reject(error);
        }

        var segmentIndex = this.mpd_.type == 'dynamic' ?
                           new shaka.dash.LiveSegmentIndex(
                               references,
                               this.mpd_,
                               this.period_,
                               this.manifestCreationTime_) :
                           new shaka.media.SegmentIndex(references);
        return Promise.resolve(segmentIndex);
      }));

  return this.promise_;
};

