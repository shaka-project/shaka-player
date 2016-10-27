/**
 * @license
 * Copyright 2016 Google Inc.
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

goog.provide('shaka.media.MediaSourceEngine');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.TextEngine');
goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.PublicPromise');



/**
 * MediaSourceEngine wraps all operations on MediaSource and SourceBuffers.
 * All asynchronous operations return a Promise, and all operations are
 * internally synchronized and serialized as needed.  Operations that can
 * be done in parallel will be done in parallel.
 *
 * @param {HTMLMediaElement} video The video element, used to read error codes
 *   when MediaSource operations fail.
 * @param {MediaSource} mediaSource The MediaSource, which must be in the
 *   'open' state.
 * @param {TextTrack} textTrack The TextTrack to use for subtitles/captions.
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.MediaSourceEngine = function(video, mediaSource, textTrack) {
  goog.asserts.assert(mediaSource.readyState == 'open',
                      'The MediaSource should be in the \'open\' state.');

  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /** @private {MediaSource} */
  this.mediaSource_ = mediaSource;

  /** @private {TextTrack} */
  this.textTrack_ = textTrack;

  /** @private {!Object.<string, SourceBuffer>} */
  this.sourceBuffers_ = {};

  /** @private {shaka.media.TextEngine} */
  this.textEngine_ = null;

  /**
   * @private {!Object.<string,
   *                    !Array.<shaka.media.MediaSourceEngine.Operation>>}
   */
  this.queues_ = {};

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {boolean} */
  this.destroyed_ = false;
};


/**
 * @typedef {{
 *   start: function(),
 *   p: !shaka.util.PublicPromise
 * }}
 *
 * @summary An operation in queue.
 * @property {function()} start
 *   The function which starts the operation.
 * @property {!shaka.util.PublicPromise} p
 *   The PublicPromise which is associated with this operation.
 */
shaka.media.MediaSourceEngine.Operation;


/**
 * Checks if a certain type is supported.
 *
 * @param {string} mimeType
 * @return {boolean}
 */
shaka.media.MediaSourceEngine.isTypeSupported = function(mimeType) {
  return shaka.media.TextEngine.isTypeSupported(mimeType) ||
         MediaSource.isTypeSupported(mimeType);
};


/**
 * Returns true if the browser has the basic APIs we need.
 *
 * @return {boolean}
 */
shaka.media.MediaSourceEngine.isBrowserSupported = function() {
  return !!window.MediaSource;
};


/**
 * Returns a map of MediaSource support for well-known types.
 *
 * @return {!Object.<string, boolean>}
 */
shaka.media.MediaSourceEngine.probeSupport = function() {
  goog.asserts.assert(shaka.media.MediaSourceEngine.isBrowserSupported(),
                      'Requires basic support');
  var support = {};
  var testMimeTypes = [
    // MP4 types
    'video/mp4; codecs="avc1.42E01E"',
    'audio/mp4; codecs="mp4a.40.2"',
    // WebM types
    'video/webm; codecs="vp8"',
    'video/webm; codecs="vp9"',
    'audio/webm; codecs="vorbis"',
    'audio/webm; codecs="opus"',
    // MPEG2 TS types (video/ is also used for audio: http://goo.gl/tYHXiS)
    'video/mp2t; codecs="avc1.42E01E"',
    'video/mp2t; codecs="mp4a.40.2"',
    // WebVTT types
    'text/vtt',
    'application/mp4; codecs="wvtt"',
    // TTML types
    'application/ttml+xml',
    'application/mp4; codecs="stpp"'
  ];

  testMimeTypes.forEach(function(type) {
    support[type] = shaka.media.MediaSourceEngine.isTypeSupported(type);
    var basicType = type.split(';')[0];
    support[basicType] = support[basicType] || support[type];
  });

  return support;
};


/**
 * @override
 */
shaka.media.MediaSourceEngine.prototype.destroy = function() {
  var Functional = shaka.util.Functional;
  this.destroyed_ = true;

  var cleanup = [];

  for (var contentType in this.queues_) {
    // Make a local copy of the queue and the first item.
    var q = this.queues_[contentType];
    var inProgress = q[0];

    // Drop everything else out of the queue.
    this.queues_[contentType] = q.slice(0, 1);

    // We will wait for this item to complete/fail.
    if (inProgress) {
      cleanup.push(inProgress.p.catch(Functional.noop));
    }

    // The rest will be rejected silently if possible.
    for (var i = 1; i < q.length; ++i) {
      q[i].p.catch(Functional.noop);
      q[i].p.reject();
    }
  }

  if (this.textEngine_) {
    cleanup.push(this.textEngine_.destroy());
  }

  return Promise.all(cleanup).then(function() {
    this.eventManager_.destroy();
    this.eventManager_ = null;
    this.video_ = null;
    this.mediaSource_ = null;
    this.textTrack_ = null;
    this.textEngine_ = null;
    this.sourceBuffers_ = {};
    if (!COMPILED) {
      for (var contentType in this.queues_) {
        goog.asserts.assert(
            this.queues_[contentType].length == 0,
            contentType + ' queue should be empty after destroy!');
      }
    }
    this.queues_ = {};
  }.bind(this));
};


/**
 * @param {!Object.<string, string>} typeConfig A map of content types to full
 *   MIME types.  For example: { 'audio': 'audio/webm; codecs="vorbis"',
 *   'video': 'video/webm; codecs="vp9"', 'text': 'text/vtt' }.
 *   All types given must be supported.
 * @param {boolean} useRelativeCueTimestamps
 *
 * @throws InvalidAccessError if blank MIME types are given
 * @throws NotSupportedError if unsupported MIME types are given
 * @throws QuotaExceededError if the browser can't support that many buffers
 *
 * @suppress {unnecessaryCasts}
 */
shaka.media.MediaSourceEngine.prototype.init =
    function(typeConfig, useRelativeCueTimestamps) {

  for (var contentType in typeConfig) {
    var mimeType = typeConfig[contentType];
    goog.asserts.assert(
        shaka.media.MediaSourceEngine.isTypeSupported(mimeType),
        'Type negotiation should happen before MediaSourceEngine.init!');

    if (contentType == 'text') {
      this.textEngine_ =
          new shaka.media.TextEngine(this.textTrack_,
                                     mimeType,
                                     useRelativeCueTimestamps);
    } else {
      var sourceBuffer = this.mediaSource_.addSourceBuffer(mimeType);
      this.eventManager_.listen(
          sourceBuffer, 'error', this.onError_.bind(this, contentType));
      this.eventManager_.listen(
          sourceBuffer, 'updateend', this.onUpdateEnd_.bind(this, contentType));
      this.sourceBuffers_[contentType] = sourceBuffer;
      this.queues_[contentType] = [];
    }
  }
};


/**
 * Gets the first timestamp in buffer for the given content type.
 *
 * @param {string} contentType
 * @return {?number} The timestamp in seconds, or null if nothing is buffered.
 */
shaka.media.MediaSourceEngine.prototype.bufferStart = function(contentType) {
  if (contentType == 'text') {
    return this.textEngine_.bufferStart();
  }
  return shaka.media.TimeRangesUtils.bufferStart(
      this.getBuffered_(contentType));
};


/**
 * Gets the last timestamp in buffer for the given content type.
 *
 * @param {string} contentType
 * @return {?number} The timestamp in seconds, or null if nothing is buffered.
 */
shaka.media.MediaSourceEngine.prototype.bufferEnd = function(contentType) {
  if (contentType == 'text') {
    return this.textEngine_.bufferEnd();
  }
  return shaka.media.TimeRangesUtils.bufferEnd(this.getBuffered_(contentType));
};


/**
 * Computes how far ahead of the given timestamp is buffered for the given
 * content type.
 *
 * @param {string} contentType
 * @param {number} time
 * @param {number=} opt_tolerance An optional tolerance for range start times.
 *   Counts a range starting anywhere from time to time + opt_tolerance.
 * @return {number} The amount of time buffered ahead in seconds.
 */
shaka.media.MediaSourceEngine.prototype.bufferedAheadOf =
    function(contentType, time, opt_tolerance) {
  var bufferedAhead;
  if (contentType == 'text') {
    bufferedAhead = this.textEngine_.bufferedAheadOf(time);
    if (!bufferedAhead && opt_tolerance) {
      bufferedAhead = this.textEngine_.bufferedAheadOf(
          time + opt_tolerance);
      if (bufferedAhead) bufferedAhead += opt_tolerance;
    }
  } else {
    var TimeRangesUtils = shaka.media.TimeRangesUtils;
    var buffered = this.getBuffered_(contentType);

    bufferedAhead = TimeRangesUtils.bufferedAheadOf(buffered, time);
    if (!bufferedAhead && opt_tolerance) {
      bufferedAhead = TimeRangesUtils.bufferedAheadOf(
          buffered, time + opt_tolerance);
      if (bufferedAhead) bufferedAhead += opt_tolerance;
    }
  }
  return bufferedAhead;
};


/**
 * @param {string} contentType
 * @return {TimeRanges} The buffered ranges for the given content type, or
 *   null if the buffered ranges could not be obtained.
 * @private
 */
shaka.media.MediaSourceEngine.prototype.getBuffered_ = function(contentType) {
  try {
    return this.sourceBuffers_[contentType].buffered;
  } catch (exception) {
    // Note: previous MediaSource errors may cause access to |buffered| to
    // throw.
    shaka.log.error('failed to get buffered range for ' + contentType,
                    exception);
    return null;
  }
};


/**
 * Enqueue an operation to append data to the SourceBuffer.
 * Start and end times are needed for TextEngine, but not for MediaSource.
 * Start and end times may be null for initialization segments, if present they
 * are relative to the presentation timeline.
 *
 * @param {string} contentType
 * @param {!ArrayBuffer} data
 * @param {?number} startTime
 * @param {?number} endTime
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.appendBuffer =
    function(contentType, data, startTime, endTime) {
  if (contentType == 'text') {
    return this.textEngine_.appendBuffer(data, startTime, endTime);
  }
  return this.enqueueOperation_(
      contentType,
      this.append_.bind(this, contentType, data));
};


/**
 * Enqueue an operation to remove data from the SourceBuffer.
 *
 * @param {string} contentType
 * @param {number} startTime
 * @param {number} endTime
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.remove =
    function(contentType, startTime, endTime) {
  // On IE11, this operation would be permitted, but would have no effect!
  // See https://github.com/google/shaka-player/issues/251
  goog.asserts.assert(endTime < Number.MAX_VALUE,
      'remove() with MAX_VALUE or Infinity is not IE-compatible!');
  if (contentType == 'text') {
    return this.textEngine_.remove(startTime, endTime);
  }
  return this.enqueueOperation_(
      contentType,
      this.remove_.bind(this, contentType, startTime, endTime));
};


/**
 * Enqueue an operation to clear the SourceBuffer.
 *
 * @param {string} contentType
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.clear = function(contentType) {
  if (contentType == 'text') {
    return this.textEngine_.remove(0, Infinity);
  }
  return Promise.all([
    // Note that not all platforms allow clearing to Infinity.
    this.enqueueOperation_(
        contentType,
        this.remove_.bind(this, contentType, 0, this.mediaSource_.duration)),
    // Flush the pipeline.  Necessary on Chromecast, even though we have removed
    // everything.
    this.enqueueOperation_(
        contentType,
        this.flush_.bind(this, contentType))
  ]);
};


/**
 * Sets the timestamp offset for the given content type.
 *
 * @param {string} contentType
 * @param {number} timestampOffset The timestamp offset. Segments which start
 *   at time t will be inserted at time t + timestampOffset instead. This
 *   value does not affect segments which have already been inserted.
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.setTimestampOffset = function(
    contentType, timestampOffset) {
  if (contentType == 'text') {
    this.textEngine_.setTimestampOffset(timestampOffset);
    return Promise.resolve();
  }
  return this.enqueueOperation_(
      contentType,
      this.setTimestampOffset_.bind(this, contentType, timestampOffset));
};


/**
 * Sets the append window end for the given content type.
 *
 * @param {string} contentType
 * @param {number} appendWindowEnd The timestamp to set the append window end
 *   to. Media beyond this value will be truncated.
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.setAppendWindowEnd = function(
    contentType, appendWindowEnd) {
  if (contentType == 'text') {
    this.textEngine_.setAppendWindowEnd(appendWindowEnd);
    return Promise.resolve();
  }
  return Promise.all([
    // Queue an abort() to help MSE splice together overlapping segments.
    // We set appendWindowEnd when we change periods in DASH content, and the
    // period transition may result in overlap.
    this.enqueueOperation_(
        contentType,
        this.abort_.bind(this, contentType)),
    this.enqueueOperation_(
        contentType,
        this.setAppendWindowEnd_.bind(this, contentType, appendWindowEnd))
  ]);
};


/**
 * @param {string=} opt_reason Valid reasons are 'network' and 'decode'.
 * @return {!Promise}
 * @see http://w3c.github.io/media-source/#idl-def-EndOfStreamError
 */
shaka.media.MediaSourceEngine.prototype.endOfStream = function(opt_reason) {
  return this.enqueueBlockingOperation_(function() {
    // Chrome won't let me pass undefined, but it will let me omit the
    // argument.  Firefox does not have this problem.
    // TODO: File a bug about this.
    if (opt_reason) {
      this.mediaSource_.endOfStream(opt_reason);
    } else {
      this.mediaSource_.endOfStream();
    }
  }.bind(this));
};


/**
 * We only support increasing duration at this time.  Decreasing duration
 * causes the MSE removal algorithm to run, which results in an 'updateend'
 * event.  Supporting this scenario would be complicated, and is not currently
 * needed.
 *
 * @param {number} duration
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.setDuration = function(duration) {
  goog.asserts.assert(
      isNaN(this.mediaSource_.duration) ||
          this.mediaSource_.duration <= duration,
      'duration cannot decrease: ' + this.mediaSource_.duration + ' -> ' +
          duration);
  return this.enqueueBlockingOperation_(function() {
    this.mediaSource_.duration = duration;
  }.bind(this));
};


/**
 * Get the current MediaSource duration.
 *
 * @return {number}
 */
shaka.media.MediaSourceEngine.prototype.getDuration = function() {
  return this.mediaSource_.duration;
};


/**
 * Append data to the SourceBuffer.
 * @param {string} contentType
 * @param {!ArrayBuffer} data
 * @throws QuotaExceededError if the browser's buffer is full
 * @private
 */
shaka.media.MediaSourceEngine.prototype.append_ =
    function(contentType, data) {
  // This will trigger an 'updateend' event.
  this.sourceBuffers_[contentType].appendBuffer(data);
};


/**
 * Remove data from the SourceBuffer.
 * @param {string} contentType
 * @param {number} startTime
 * @param {number} endTime
 * @private
 */
shaka.media.MediaSourceEngine.prototype.remove_ =
    function(contentType, startTime, endTime) {
  if (endTime <= startTime) {
    // Ignore removal of inverted or empty ranges.
    // Fake 'updateend' event to resolve the operation.
    this.onUpdateEnd_(contentType);
    return;
  }

  // This will trigger an 'updateend' event.
  this.sourceBuffers_[contentType].remove(startTime, endTime);
};


/**
 * Call abort() on the SourceBuffer.
 * This resets MSE's last_decode_timestamp on all track buffers, which should
 * trigger the splicing logic for overlapping segments.
 * @param {string} contentType
 * @private
 */
shaka.media.MediaSourceEngine.prototype.abort_ = function(contentType) {
  // Save the append window end, which is reset on abort().
  var appendWindowEnd = this.sourceBuffers_[contentType].appendWindowEnd;

  // This will not trigger an 'updateend' event, since nothing is happening.
  // This is only to reset MSE internals, not to abort an actual operation.
  this.sourceBuffers_[contentType].abort();

  // Restore the append window end.
  this.sourceBuffers_[contentType].appendWindowEnd = appendWindowEnd;

  // Fake 'updateend' event to resolve the operation.
  this.onUpdateEnd_(contentType);
};


/**
 * Nudge the playhead to force the media pipeline to be flushed.
 * This seems to be necessary on Chromecast to get new content to replace old
 * content.
 * @param {string} contentType
 * @private
 */
shaka.media.MediaSourceEngine.prototype.flush_ = function(contentType) {
  // Never use flush_ if there's data.  It causes a hiccup in playback.
  goog.asserts.assert(
      this.video_.buffered.length == 0,
      'MediaSourceEngine.flush_ should only be used after clearing all data!');

  // Seeking forces the pipeline to be flushed.
  this.video_.currentTime -= 0.001;

  // Fake 'updateend' event to resolve the operation.
  this.onUpdateEnd_(contentType);
};


/**
 * Set the SourceBuffer's timestamp offset.
 * @param {string} contentType
 * @param {number} timestampOffset
 * @private
 */
shaka.media.MediaSourceEngine.prototype.setTimestampOffset_ =
    function(contentType, timestampOffset) {
  this.sourceBuffers_[contentType].timestampOffset = timestampOffset;

  // Fake 'updateend' event to resolve the operation.
  this.onUpdateEnd_(contentType);
};


/**
 * Set the SourceBuffer's append window end.
 * @param {string} contentType
 * @param {number} appendWindowEnd
 * @private
 */
shaka.media.MediaSourceEngine.prototype.setAppendWindowEnd_ =
    function(contentType, appendWindowEnd) {
  var fudge = 1 / 25;  // one frame, assuming a low framerate
  this.sourceBuffers_[contentType].appendWindowEnd = appendWindowEnd + fudge;

  // Fake 'updateend' event to resolve the operation.
  this.onUpdateEnd_(contentType);
};


/**
 * @param {string} contentType
 * @param {!Event} event
 * @private
 */
shaka.media.MediaSourceEngine.prototype.onError_ =
    function(contentType, event) {
  var operation = this.queues_[contentType][0];
  goog.asserts.assert(operation, 'Spurious error event!');
  goog.asserts.assert(!this.sourceBuffers_[contentType].updating,
                      'SourceBuffer should not be updating on error!');
  var code = this.video_.error ? this.video_.error.code : 0;
  operation.p.reject(new shaka.util.Error(
      shaka.util.Error.Category.MEDIA,
      shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED,
      code));
  // Do not pop from queue.  An 'updateend' event will fire next, and to avoid
  // synchronizing these two event handlers, we will allow that one to pop from
  // the queue as normal.  Note that because the operation has already been
  // rejected, the call to resolve() in the 'updateend' handler will have no
  // effect.
};


/**
 * @param {string} contentType
 * @private
 */
shaka.media.MediaSourceEngine.prototype.onUpdateEnd_ = function(contentType) {
  var operation = this.queues_[contentType][0];
  goog.asserts.assert(operation, 'Spurious updateend event!');
  if (!operation) return;
  goog.asserts.assert(!this.sourceBuffers_[contentType].updating,
                      'SourceBuffer should not be updating on updateend!');
  operation.p.resolve();
  this.popFromQueue_(contentType);
};


/**
 * Enqueue an operation and start it if appropriate.
 *
 * @param {string} contentType
 * @param {function()} start
 * @return {!Promise}
 * @private
 */
shaka.media.MediaSourceEngine.prototype.enqueueOperation_ =
    function(contentType, start) {
  if (this.destroyed_) return Promise.reject();

  var operation = {
    start: start,
    p: new shaka.util.PublicPromise()
  };
  this.queues_[contentType].push(operation);

  if (this.queues_[contentType].length == 1) {
    try {
      operation.start();
    } catch (exception) {
      if (exception.name == 'QuotaExceededError') {
        operation.p.reject(new shaka.util.Error(
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
            contentType));
      } else {
        operation.p.reject(new shaka.util.Error(
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
            exception));
      }
      this.popFromQueue_(contentType);
    }
  }
  return operation.p;
};


/**
 * Enqueue an operation which must block all other operations on all
 * SourceBuffers.
 *
 * @param {function()} run
 * @return {!Promise}
 * @private
 */
shaka.media.MediaSourceEngine.prototype.enqueueBlockingOperation_ =
    function(run) {
  if (this.destroyed_) return Promise.reject();

  var allWaiters = [];

  // Enqueue a 'wait' operation onto each queue.
  // This operation signals its readiness when it starts.
  // When all wait operations are ready, the real operation takes place.
  for (var contentType in this.sourceBuffers_) {
    var ready = new shaka.util.PublicPromise();
    var operation = {
      start: function(ready) { ready.resolve(); }.bind(null, ready),
      p: ready
    };

    this.queues_[contentType].push(operation);
    allWaiters.push(ready);

    if (this.queues_[contentType].length == 1) {
      operation.start();
    }
  }

  // Return a Promise to the real operation, which waits to begin until there
  // are no other in-progress operations on any SourceBuffers.
  return Promise.all(allWaiters).then(function() {
    if (!COMPILED) {
      // If we did it correctly, nothing is updating.
      for (var contentType in this.sourceBuffers_) {
        goog.asserts.assert(
            this.sourceBuffers_[contentType].updating == false,
            'SourceBuffers should not be updating after a blocking op!');
      }
    }

    var ret;
    // Run the real operation, which is synchronous.
    try {
      run();
    } catch (exception) {
      ret = Promise.reject(new shaka.util.Error(
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
          exception));
    }

    // Unblock the queues.
    for (var contentType in this.sourceBuffers_) {
      this.popFromQueue_(contentType);
    }

    return ret;
  }.bind(this), function() {
    // One of the waiters failed, which means we've been destroyed.
    goog.asserts.assert(this.destroyed_, 'Should be destroyed by now');
    // We haven't popped from the queue.  Canceled waiters have been removed by
    // destroy.  What's left now should just be resolved waiters.  In uncompiled
    // mode, we will maintain good hygiene and make sure the assert at the end
    // of destroy passes.  In compiled mode, the queues are wiped in destroy.
    if (!COMPILED) {
      for (var contentType in this.sourceBuffers_) {
        if (this.queues_[contentType].length) {
          goog.asserts.assert(
              this.queues_[contentType].length == 1,
              'Should be at most one item in queue!');
          goog.asserts.assert(
              allWaiters.indexOf(this.queues_[contentType][0].p) != -1,
              'The item in queue should be one of our waiters!');
          this.queues_[contentType].shift();
        }
      }
    }
    return Promise.reject();
  }.bind(this));
};


/**
 * Pop from the front of the queue and start a new operation.
 * @param {string} contentType
 * @private
 */
shaka.media.MediaSourceEngine.prototype.popFromQueue_ = function(contentType) {
  // Remove the in-progress operation, which is now complete.
  this.queues_[contentType].shift();
  // Retrieve the next operation, if any, from the queue and start it.
  var next = this.queues_[contentType][0];
  if (next) {
    try {
      next.start();
    } catch (exception) {
      next.p.reject(new shaka.util.Error(
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
          exception));
      this.popFromQueue_(contentType);
    }
  }
};
