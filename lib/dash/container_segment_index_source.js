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

goog.provide('shaka.dash.ContainerSegmentIndexSource');

goog.require('shaka.asserts');
goog.require('shaka.dash.LiveSegmentIndex');
goog.require('shaka.features');
goog.require('shaka.log');
goog.require('shaka.media.ISegmentIndexSource');
goog.require('shaka.media.Mp4SegmentIndexParser');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.WebmSegmentIndexParser');
goog.require('shaka.util.FailoverUri');
goog.require('shaka.util.TypedBind');



/**
 * Creates an ISegmentIndexSource that constructs a SegmentIndex from an MP4 or
 * WebM container.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {string} containerType The container type, which must be either
 *     'mp4' or 'webm'.
 * @param {!shaka.util.FailoverUri} indexMetadata The location of the
 *     container's segment index.
 * @param {shaka.util.FailoverUri} initMetadata The location of the container's
 *     headers, which is required for WebM containers and ignored
 *     for MP4 containers.
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @constructor
 * @struct
 * @implements {shaka.media.ISegmentIndexSource}
 */
shaka.dash.ContainerSegmentIndexSource = function(
    mpd, period, containerType, indexMetadata, initMetadata,
    manifestCreationTime, networkCallback) {
  shaka.asserts.assert(containerType != 'webm' || initMetadata);

  /** @private {!shaka.dash.mpd.Mpd} */
  this.mpd_ = mpd;

  /** @private {!shaka.dash.mpd.Period} */
  this.period_ = period;

  /** @private {string} */
  this.containerType_ = containerType;

  /** @private {!shaka.util.FailoverUri} */
  this.indexMetadata_ = indexMetadata;

  /** @private {shaka.util.FailoverUri} */
  this.initMetadata_ = initMetadata;

  /** @private {number} */
  this.manifestCreationTime_ = manifestCreationTime;

  /** @private {Promise.<!shaka.media.SegmentIndex>} */
  this.promise_ = null;

  /** @private {shaka.media.SegmentIndex} */
  this.segmentIndex_ = null;

  /** @private {shaka.util.FailoverUri.NetworkCallback} */
  this.networkCallback_ = networkCallback;
};


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.dash.ContainerSegmentIndexSource.prototype.destroy = function() {
  this.mpd_ = null;
  this.period_ = null;
  this.networkCallback_ = null;

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
                                    this.indexMetadata_.urls,
                                    this.networkCallback_);
        } else if (this.containerType_ == 'webm') {
          shaka.asserts.assert(initData);
          var parser = new shaka.media.WebmSegmentIndexParser();
          references = parser.parse(new DataView(indexData),
                                    new DataView(initData),
                                    this.indexMetadata_.urls,
                                    this.networkCallback_);
        } else {
          shaka.asserts.unreachable();
        }

        if (!references) {
          var error = new Error(
              'Failed to parse SegmentReferences from ' +
              this.indexMetadata_.toString() + ' ' +
              '(or one of its fallbacks).');
          error.type = 'stream';
          return Promise.reject(error);
        }

        var segmentIndex;
        if (shaka.features.Live && this.mpd_.type == 'dynamic') {
          segmentIndex = new shaka.dash.LiveSegmentIndex(
              references,
              this.mpd_,
              this.period_,
              this.manifestCreationTime_);
        } else {
          shaka.asserts.assert(this.mpd_.type == 'static');
          segmentIndex = new shaka.media.SegmentIndex(references);
        }
        return Promise.resolve(segmentIndex);
      }));

  return this.promise_;
};

