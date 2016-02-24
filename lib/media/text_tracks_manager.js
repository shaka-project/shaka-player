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

goog.provide('shaka.media.TextTracksManager');

goog.require('shaka.asserts');
goog.require('shaka.player.Defaults');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Task');
goog.require('shaka.util.TypedBind');
goog.require('shaka.util.WebVttParser');



/**
 * Creates a manager for accessing the TextTracks Object
 * @param {HTMLVideoElement} video
 * @param {TextTrackList} textTracksSource
 * @constructor
 */
shaka.media.TextTracksManager = function(
    video, textTracksSource) {

  /**
   * The video element
   * @type {HTMLVideoElement}
   * @private
   */
  this.video_ = video;

  /**
   * The textTracks source
   * @type {TextTrackList}
   * @private
   */
  this.textTracksSource_ = textTracksSource;


  /**
   * The label of the text track to id by
   * @type {string}
   * @private
   */
  this.textTracksLabel_ = '';

  /**
   * Stores the state of the shown text track
   * @type {?Object}
   * @private
   */
  this.shownTextTrackLabel_ = null;


  /**
   * Stream information
   * @type {Object}
   * @private
   */
  this.streamInfo_ = {};

  /** @private {shaka.util.IBandwidthEstimator} */
  this.estimator_ = null;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /**
   * Contains a list of segments that have been inserted into the SourceBuffer.
   * These segments may or may not have been evicted by the browser.
   * @private {!Array.<!shaka.media.SegmentReference>}
   */
  this.inserted_ = [];

  /** @private {number} */
  this.timestampCorrection_ = 0;

  /** @private {shaka.util.Task} */
  this.task_ = null;

  /** @private {shaka.util.PublicPromise} */
  this.operationPromise_ = null;

  /** @private {number} */
  this.segmentRequestTimeout_ = shaka.player.Defaults.SEGMENT_REQUEST_TIMEOUT;
};


/**
 * Destroys the TextTracksManager.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.TextTracksManager.prototype.destroy = function() {
  this.abort().catch(function() {});

  if (this.operationPromise_) {
    this.operationPromise_.destroy();
  }
  this.operationPromise_ = null;
  this.task_ = null;

  this.inserted_ = null;

  this.eventManager_.destroy();
  this.eventManager_ = null;

  this.textTracksLabel_ = '';

};


/**
 * Checks if the given timestamp is buffered according to the virtual source
 * buffer.
 *
 * Note that as a SegmentIndex may use PTS and a browser may use DTS or
 * vice-versa, and due to MSE implementation details, isInserted(t) does not
 * imply isBuffered(t) nor does isBuffered(t) imply isInserted(t).
 *
 * @param {number} timestamp The timestamp in seconds.
 * @return {boolean} True if the timestamp is buffered.
 */
shaka.media.TextTracksManager.prototype.isInserted = function(timestamp) {
  return shaka.media.SegmentReference.find(this.inserted_, timestamp) >= 0;
};


/**
 * Gets the SegmentReference corresponding to the last inserted segment.
 *
 * @return {shaka.media.SegmentReference}
 */
shaka.media.TextTracksManager.prototype.getLastInserted = function() {
  var length = this.inserted_.length;
  return length > 0 ? this.inserted_[length - 1] : null;
};


/**
 * Checks if the given timestamp is buffered according to the underlying
 * SourceBuffer.
 *
 * @param {number} timestamp The timestamp in seconds.
 * @return {boolean} True if the timestamp is buffered.
 */
shaka.media.TextTracksManager.prototype.isBuffered = function(timestamp) {
  return this.bufferedAheadOf(timestamp) > 0;
};


/**
 * Computes how far ahead of the given timestamp we have buffered according to
 * the underlying SourceBuffer.
 *
 * @param {number} timestamp The timestamp in seconds.
 * @return {number} in seconds
 */
shaka.media.TextTracksManager.prototype.bufferedAheadOf =
    function(timestamp) {
  var objTrack;
  var numDifference = 0;
  var objLastTime;
  if ((this.textTracksSource_ || []).length) {
    try {
      objTrack = this.getTextTrack(this.textTracksLabel_);
      if ((objTrack) && objTrack.cues) {
        shaka.asserts.assert(typeof timestamp === 'number');
        shaka.asserts.assert(objTrack.cues);

        objLastTime = Array.prototype.slice.call(objTrack.cues)
            .sort(function(objA, objB) {
              return objB.endTime - objA.endTime;
            })[0];

        console.debug(objLastTime, timestamp);
        numDifference = objLastTime.endTime - timestamp;
      }
    } catch (e) {
      shaka.log.debug('Could not figure out buffered ahead time:', e);
    }
  }
  return numDifference;
};


/**
 * Fetches the segment corresponding to the given SegmentReference and appends
 * the it to the underlying SourceBuffer. This cannot be called if another
 * operation is in progress.
 *
 * @param {shaka.media.SegmentReference} reference
 * @param {Object} streamInfo Optional information used for constructing
 * textTracks information
 * @return {!Promise.<?number>} A promise to a timestamp correction, which may
 *     be null if a timestamp correction could not be computed. A timestamp
 *     correction is computed if the underlying SourceBuffer is initially
 *     empty. The timestamp correction, if one is computed, is not
 *     automatically applied to the virtual source buffer; to apply a timestamp
 *     correction, call correct().
 */
shaka.media.TextTracksManager.prototype.fetch = function(
    reference, streamInfo) {
  shaka.log.v1('fetch');

  this.textTracksLabel_ = streamInfo.id;

  // Check state.
  shaka.asserts.assert(!this.task_);
  if (this.task_) {
    var error = new Error('Cannot fetch: previous operation not complete.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.task_ = new shaka.util.Task();

  this.task_.append(
      function() {
        var refDuration =
            reference.endTime ? (reference.endTime - reference.startTime) : 1;
        var params = new shaka.util.AjaxRequest.Parameters();
        params.maxAttempts = 3;
        params.baseRetryDelayMs = refDuration * 1000;
        params.requestTimeoutMs = this.segmentRequestTimeout_ * 1000;
        params.responseType = 'text';
        return [
          reference.url.fetch(params, this.estimator_),
          shaka.util.FailoverUri.prototype.abortFetch.bind(reference.url)];
      }.bind(this));

  this.task_.append(shaka.util.TypedBind(this,
      function(data) {
        var append = this.append_.call(this, data, streamInfo);
        return [append, this.abort_.bind(this)];
      }));

  this.task_.append(
      function() {
        var i = shaka.media.SegmentReference
          .find(this.inserted_, reference.startTime);
        if (i >= 0) {
          // The SegmentReference at i has a start time less than |reference|'s.
          this.inserted_.splice(i + 1, 0, reference);
        } else {
          this.inserted_.push(reference);
        }
      }.bind(this));

  return this.startTask_().then(
      function() {
        return Promise.resolve(0);
      }.bind(this));
};


/**
 * Resets the virtual source buffer and clears all media from the underlying
 * SourceBuffer. The returned promise will resolve immediately if there is no
 * media within the underlying SourceBuffer. This cannot be called if another
 * operation is in progress.
 *
 * @return {!Promise}
 */
shaka.media.TextTracksManager.prototype.clear = function() {
  shaka.log.v1(this.logPrefix_(), 'clear');

  // Check state.
  shaka.asserts.assert(!this.task_);
  if (this.task_) {
    var error = new Error('Cannot clear (' + this.textTracksLabel_ + '): ' +
                          'previous operation not complete.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.task_ = new shaka.util.Task();

  this.task_.append(function() {
    var p = this.clear_();
    return [p, this.abort_.bind(this)];
  }.bind(this));

  return this.startTask_();
};


/**
 * Resets the virtual source buffer and clears all media from the underlying
 * SourceBuffer after the given timestamp. The returned promise will resolve
 * immediately if there is no media within the underlying SourceBuffer. This
 * cannot be called if another operation is in progress.
 *
 * @param {number} timestamp
 *
 * @return {!Promise}
 */
shaka.media.TextTracksManager.prototype.clearAfter = function(timestamp) {
  shaka.log.v1(this.logPrefix_(), 'clearAfter');

  // Check state.
  shaka.asserts.assert(!this.task_);
  if (this.task_) {
    var error = new Error('Cannot clearAfter' +
                          '(' + this.textTracksLabel_ + '): ' +
                          'previous operation not complete.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.task_ = new shaka.util.Task();

  this.task_.append(function() {
    var p = this.clearAfter_(timestamp);
    return [p, this.abort_.bind(this)];
  }.bind(this));

  return this.startTask_();
};


/**
 * Aborts the current operation if one exists.
 * The returned promise will never be rejected.
 *
 * @return {!Promise}
 */
shaka.media.TextTracksManager.prototype.abort = function() {
  shaka.log.v1(this.logPrefix_(), 'abort');
  if (!this.task_) {
    return Promise.resolve();
  }
  return this.task_.abort();
};


/**
 * Corrects each SegmentReference in the virtual source buffer by the given
 * timestamp correction. The previous timestamp correction, if it exists, is
 * replaced.
 *
 * @param {number} timestampCorrection
 */
shaka.media.TextTracksManager.prototype.correct = function(
    timestampCorrection) {
  var delta = timestampCorrection - this.timestampCorrection_;
  if (delta == 0) {
    return;
  }

  this.inserted_ = shaka.media.SegmentReference.shift(this.inserted_, delta);
  this.timestampCorrection_ = timestampCorrection;

  shaka.log.debug(
      this.logPrefix_(),
      'applied timestamp correction of',
      timestampCorrection,
      'seconds to TextTracksManager',
      this);
};


/**
 * Emits an error message and returns true if there are multiple buffered
 * ranges; otherwise, does nothing and returns false.
 *
 * @return {boolean}
 */
shaka.media.TextTracksManager.prototype.detectMultipleBufferedRanges =
    function() {
  return false;
};


/**
 * Sets the segment request timeout in seconds.
 *
 * @param {number} timeout
 */
shaka.media.TextTracksManager.prototype.setSegmentRequestTimeout =
    function(timeout) {
  shaka.asserts.assert(!isNaN(timeout));
  this.segmentRequestTimeout_ = timeout;
};


/**
 * Starts the task and returns a Promise which is resolved/rejected after the
 * task ends and is cleaned up.
 *
 * @return {!Promise}
 * @private
 */
shaka.media.TextTracksManager.prototype.startTask_ = function() {
  shaka.asserts.assert(this.task_);
  this.task_.start();
  return this.task_.getPromise().then(shaka.util.TypedBind(this,
      function() {
        this.task_ = null;
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {*} error */
      function(error) {
        shaka.log.v1(this.logPrefix_(), 'task failed!');
        this.task_ = null;
        return Promise.reject(error);
      })
  );
};


/**
 * Append to the text tracks object.
 *
 * @param {!String} data
 * @param {Object} streamInfo
 * @return {!Promise}
 * @private
 */
shaka.media.TextTracksManager.prototype.append_ = function(data, streamInfo) {
  shaka.asserts.assert(!this.operationPromise_);
  shaka.asserts.assert(this.task_);

  try {
    var strId = streamInfo.id;
    var strLang = streamInfo.segmentIndexSource ?
        streamInfo.segmentIndexSource.representation_.lang : '';
    var strSubtitles = data;

    var boolTrack = strSubtitles.indexOf('-->') !== -1;
    var objTrack = this.addOrGetTextTrack(strId, strLang);

    if (boolTrack) {
      var objParsed = new shaka.util.WebVttParser().parse(strSubtitles);
      objParsed.cues.forEach(function(objCue) {
        var objMatchedCue =
            Array.prototype.slice.call(objTrack.cues || []).slice(-10)
                .filter(function(objStoredCue) {
                  return objStoredCue.text === objCue.text;
                })
                .slice(-1)[0];
        if (objMatchedCue) {
          objMatchedCue.endTime = objCue.endTime;
          shaka.log.debug('Editing parsed VTT cue', {
            start: objMatchedCue.startTime,
            end: objCue.endTime,
            text: objMatchedCue.text
          });
        } else {
          objTrack
            .addCue(new VTTCue(objCue.startTime, objCue.endTime, objCue.text));
          shaka.log.debug('Adding parsed VTT cue', {
            start: objCue.startTime,
            end: objCue.endTime,
            text: objCue.text
          });
        }
      });
    }

  } catch (exception) {
    shaka.log.debug('Failed to append buffer:', exception);
    return Promise.reject(exception);
  }

  setTimeout(function() {
    this.onSourceBufferUpdateEnd_(new Event('someEvent'));
  }.bind(this), 0);

  this.operationPromise_ = new shaka.util.PublicPromise();
  return this.operationPromise_;
};


/**
 * Clear the text tracks buffer.
 *
 * @return {!Promise}
 * @private
 */
shaka.media.TextTracksManager.prototype.clear_ = function() {
  shaka.asserts.assert(!this.operationPromise_);

  // TODO: Find a way to clear
  if (this.textTracksSource_.length == 0) {
    shaka.log.v1('Nothing to clear.');
    shaka.asserts.assert(this.inserted_.length == 0);
    return Promise.resolve();
  }

  try {
    // This will trigger an 'updateend' event.
    this.clearTextTracks();
    this.inserted_ = [];
    this.textTracksLabel_ = '';
    return Promise.resolve();
  } catch (exception) {
    shaka.log.debug('Failed to clear buffer:', exception);
    return Promise.reject(exception);
  }
};


/**
 * Clear the text tracks buffer after the given timestamp (aligned to the next
 * segment boundary).
 *
 * @param {number} timestamp
 *
 * @return {!Promise}
 * @private
 */
shaka.media.TextTracksManager.prototype.clearAfter_ = function(timestamp) {
  shaka.asserts.assert(!this.operationPromise_);

  var index = shaka.media.SegmentReference.find(this.inserted_, timestamp);

  // If no segment found, or it's the last one, bail out gracefully.
  if (index == -1 || index == this.inserted_.length - 1) {
    shaka.log.v1(
        this.logPrefix_(),
        'nothing to clear: no segments on or after timestamp.');
    return Promise.resolve();
  }

  this.inserted_ = this.inserted_.slice(0, index + 1);

  this.operationPromise_ = new shaka.util.PublicPromise();
  return this.operationPromise_;
};


/**
 * Abort the current operation on the source buffer.
 *
 * @private
 */
shaka.media.TextTracksManager.prototype.abort_ = function() {
  shaka.log.v1(this.logPrefix_(), 'abort_');
  shaka.asserts.assert(this.operationPromise_);
};


/**
 * |sourceBuffer_|'s 'updateend' callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.media.TextTracksManager.prototype.onSourceBufferUpdateEnd_ =
    function(event) {
  shaka.log.v1(this.logPrefix_(), 'onSourceBufferUpdateEnd_');

  shaka.asserts.assert(this.operationPromise_);

  this.operationPromise_.resolve();
  this.operationPromise_ = null;
};


/**
 * Returns a text tracks from the text tracks list
 * @param {string} strLabel
 * @return {*}
 */
shaka.media.TextTracksManager.prototype.getTextTrack = function(strLabel) {
  return this.findTrackByProperty('label', strLabel);
};


/**
 * Creates a text tracks and returns them or gets an existing one
 * @param {string} strLabel
 * @param {string} strLang
 * @param {string=} opt_strKind
 * @return {*}
 */
shaka.media.TextTracksManager.prototype.addOrGetTextTrack =
    function(strLabel, strLang, opt_strKind) {
  var strKindDefault = 'subtitles';
  var objTrack = this.getTextTrack(strLabel);
  if (!objTrack) {
    objTrack = this.video_
      .addTextTrack((opt_strKind || strKindDefault), strLabel, strLang);
  }
  return objTrack;
};


/**
 * Clears out the text tracks
 * @return {boolean}
 */
shaka.media.TextTracksManager.prototype.clearTextTracks = function() {
  if (!this.textTracksSource_) {
    return false;
  }
  shaka.asserts.assert(this.textTracksSource_);

  Array.prototype.slice.call(this.textTracksSource_)
      .forEach(function(objTextTrack) {
        Array.prototype.slice.call(objTextTrack.cues || [])
            .forEach(function(objCue) {
              objTextTrack.removeCue(objCue);
            });
        shaka.log.debug('Removed track cues:', objTextTrack);
      });
};


/**
 * Allows for a text track to be set to visible
 * @param  {String} id  The id of the text track, aka label
 * @param  {Boolean} enabled Hide or show the text track specified
 * @return {*} Returns false on not executing
 */
shaka.media.TextTracksManager.prototype.showTextTrack = function(id, enabled) {
  var defaultMode = 'hidden';
  var givenMode = (enabled) ? 'showing' : defaultMode;
  var mode = null;
  if (id === 'undefined' && enabled) {
    shaka.log.debug('Cannot change text track visibility of unknown');
    return false;
  }
  if (this.shownTextTrackLabel_ &&
      this.shownTextTrackLabel_.enabled === enabled &&
      this.shownTextTrackLabel_.id === id) {
    return false;
  }
  this.shownTextTrackLabel_ = null;
  Array.prototype.slice.call(this.textTracksSource_)
    .forEach(function(textTrack) {
        textTrack.mode = (textTrack.label === id) ? givenMode : defaultMode;
        if (textTrack.label === id) {
          this.shownTextTrackLabel_ = {
            id: id,
            enabled: enabled
          };
        }
      }.bind(this));
  shaka.log.debug('showTextTrack', this.shownTextTrackLabel_);
};


/**
 * Finds text by label e.g.
 * @param {string } strKey
 * @param {string} strValue
 * @return {*}
 */
shaka.media.TextTracksManager.prototype.findTrackByProperty =
    function(strKey, strValue) {
  var arrFiltered = Array.prototype.slice.call(this.textTracksSource_)
      .filter(function(objTrack) {
        return objTrack[strKey] === strValue;
      });
  return (arrFiltered.length) ? arrFiltered[0] : null;
};


if (!COMPILED) {
  /**
   * Returns a string with the form 'SBM MIME_TYPE:' for logging purposes.
   *
   * @return {string}
   * @private
   */
  shaka.media.TextTracksManager.prototype.logPrefix_ = function() {
    return 'TTM ' + this.textTracksLabel_ + ':';
  };
}
