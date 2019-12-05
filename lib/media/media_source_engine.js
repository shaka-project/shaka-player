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
goog.require('shaka.media.IClosedCaptionParser');
goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.media.Transmuxer');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Platform');
goog.require('shaka.util.PublicPromise');


/**
 * MediaSourceEngine wraps all operations on MediaSource and SourceBuffers.
 * All asynchronous operations return a Promise, and all operations are
 * internally synchronized and serialized as needed.  Operations that can
 * be done in parallel will be done in parallel.
 *
 * @param {HTMLMediaElement} video The video element, whose source is tied to
 *   MediaSource during the lifetime of the MediaSourceEngine.
 * @param {!shaka.media.IClosedCaptionParser} closedCaptionParser
 *    The closed caption parser that should be used to parser closed captions
 *    from the video stream. MediaSourceEngine takes ownership of the parser.
 *    When MediaSourceEngine is destroyed, it will destroy the parser.
 * @param {!shaka.extern.TextDisplayer} textDisplayer
 *    The text displayer that will be used with the text engine.
 *    MediaSourceEngine takes ownership of the displayer. When MediaSourceEngine
 *    is destroyed, it will destroy the displayer.
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.MediaSourceEngine = function(
    video, closedCaptionParser, textDisplayer) {
  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /** @private {shaka.extern.TextDisplayer} */
  this.textDisplayer_ = textDisplayer;

  /** @private {!Object.<shaka.util.ManifestParserUtils.ContentType,
                         SourceBuffer>} */
  this.sourceBuffers_ = {};

  /** @private {shaka.text.TextEngine} */
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

  /** @private {!Object.<string, !shaka.media.Transmuxer>} */
  this.transmuxers_ = {};

  /** @private {shaka.media.IClosedCaptionParser} */
  this.captionParser_ = closedCaptionParser;

  /** @private {!shaka.util.PublicPromise} */
  this.mediaSourceOpen_ = new shaka.util.PublicPromise();

  /** @private {MediaSource} */
  this.mediaSource_ = this.createMediaSource(this.mediaSourceOpen_);
};


/**
 * Internal reference to window.URL.createObjectURL function to avoid
 * compatibility issues with other libraries and frameworks such as React
 * Native. For use in unit tests only, not meant for external use.
 *
 * @type {function(?):string}
 */
shaka.media.MediaSourceEngine.createObjectURL = window.URL.createObjectURL;


/**
 * Create a MediaSource object, attach it to the video element, and return it.
 * Resolves the given promise when the MediaSource is ready.
 *
 * Replaced by unit tests.
 *
 * @param {!shaka.util.PublicPromise} p
 * @return {!MediaSource}
 */
shaka.media.MediaSourceEngine.prototype.createMediaSource = function(p) {
  let mediaSource = new MediaSource();

  // Set up MediaSource on the video element.
  this.eventManager_.listenOnce(mediaSource, 'sourceopen', p.resolve);
  this.video_.src = shaka.media.MediaSourceEngine.createObjectURL(mediaSource);

  return mediaSource;
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
 * @param {shaka.extern.Stream} stream
 * @return {boolean}
 */
shaka.media.MediaSourceEngine.isStreamSupported = function(stream) {
  let fullMimeType = shaka.util.MimeUtils.getFullType(
      stream.mimeType, stream.codecs);
  let extendedMimeType = shaka.util.MimeUtils.getExtendedType(stream);
  return shaka.text.TextEngine.isTypeSupported(fullMimeType) ||
      MediaSource.isTypeSupported(extendedMimeType) ||
      shaka.media.Transmuxer.isSupported(fullMimeType, stream.type);
};


/**
 * Returns a map of MediaSource support for well-known types.
 *
 * @return {!Object.<string, boolean>}
 */
shaka.media.MediaSourceEngine.probeSupport = function() {
  const testMimeTypes = [
    // MP4 types
    'video/mp4; codecs="avc1.42E01E"',
    'video/mp4; codecs="avc3.42E01E"',
    'video/mp4; codecs="hev1.1.6.L93.90"',
    'video/mp4; codecs="hvc1.1.6.L93.90"',
    'video/mp4; codecs="hev1.2.4.L153.B0"; eotf="smpte2084"',  // HDR HEVC
    'video/mp4; codecs="hvc1.2.4.L153.B0"; eotf="smpte2084"',  // HDR HEVC
    'video/mp4; codecs="vp9"',
    'video/mp4; codecs="vp09.00.10.08"',
    'video/mp4; codecs="av01.0.01M.08"',
    'audio/mp4; codecs="mp4a.40.2"',
    'audio/mp4; codecs="ac-3"',
    'audio/mp4; codecs="ec-3"',
    'audio/mp4; codecs="opus"',
    'audio/mp4; codecs="flac"',
    // WebM types
    'video/webm; codecs="vp8"',
    'video/webm; codecs="vp9"',
    'video/webm; codecs="vp09.00.10.08"',
    'audio/webm; codecs="vorbis"',
    'audio/webm; codecs="opus"',
    // MPEG2 TS types (video/ is also used for audio: https://bit.ly/TsMse)
    'video/mp2t; codecs="avc1.42E01E"',
    'video/mp2t; codecs="avc3.42E01E"',
    'video/mp2t; codecs="hvc1.1.6.L93.90"',
    'video/mp2t; codecs="mp4a.40.2"',
    'video/mp2t; codecs="ac-3"',
    'video/mp2t; codecs="ec-3"',
    // WebVTT types
    'text/vtt',
    'application/mp4; codecs="wvtt"',
    // TTML types
    'application/ttml+xml',
    'application/mp4; codecs="stpp"',
  ];

  let support = {};
  for (let type of testMimeTypes) {
    if (shaka.util.Platform.supportsMediaSource()) {
      // Our TextEngine is only effective for MSE platforms at the moment.
      if (shaka.text.TextEngine.isTypeSupported(type)) {
        support[type] = true;
      } else {
        support[type] = MediaSource.isTypeSupported(type) ||
                        shaka.media.Transmuxer.isSupported(type);
      }
    } else {
      support[type] = shaka.util.Platform.supportsMediaType(type);
    }

    const basicType = type.split(';')[0];
    support[basicType] = support[basicType] || support[type];
  }

  return support;
};


/** @override */
shaka.media.MediaSourceEngine.prototype.destroy = function() {
  const Functional = shaka.util.Functional;
  this.destroyed_ = true;

  let cleanup = [];

  for (let contentType in this.queues_) {
    // Make a local copy of the queue and the first item.
    let q = this.queues_[contentType];
    let inProgress = q[0];

    // Drop everything else out of the original queue.
    this.queues_[contentType] = q.slice(0, 1);

    // We will wait for this item to complete/fail.
    if (inProgress) {
      cleanup.push(inProgress.p.catch(Functional.noop));
    }

    // The rest will be rejected silently if possible.
    for (let i = 1; i < q.length; ++i) {
      q[i].p.reject();
    }
  }

  if (this.textEngine_) {
    cleanup.push(this.textEngine_.destroy());
  }
  if (this.textDisplayer_) {
    cleanup.push(this.textDisplayer_.destroy());
  }

  for (let contentType in this.transmuxers_) {
    cleanup.push(this.transmuxers_[contentType].destroy());
  }

  return Promise.all(cleanup).then(() => {
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }

    if (this.video_) {
      // "unload" the video element.
      this.video_.removeAttribute('src');
      this.video_.load();
      this.video_ = null;
    }

    this.mediaSource_ = null;
    this.textEngine_ = null;
    this.textDisplayer_ = null;
    this.sourceBuffers_ = {};
    this.transmuxers_ = {};
    this.captionParser_ = null;
    if (goog.DEBUG) {
      for (let contentType in this.queues_) {
        goog.asserts.assert(
            this.queues_[contentType].length == 0,
            contentType + ' queue should be empty after destroy!');
      }
    }
    this.queues_ = {};
  });
};


/**
 * @return {!Promise} Resolved when MediaSource is open and attached to the
 *   media element.  This process is actually initiated by the constructor.
 */
shaka.media.MediaSourceEngine.prototype.open = function() {
  return this.mediaSourceOpen_;
};


/**
 * Initialize MediaSourceEngine.
 *
 * Note that it is not valid to call this multiple times, except to add or
 * reinitialize text streams.
 *
 * @param {!Map.<shaka.util.ManifestParserUtils.ContentType,
 *               shaka.extern.Stream>} streamsByType
 *   A map of content types to streams.  All streams must be supported according
 *   to MediaSourceEngine.isStreamSupported.
 * @param {boolean} forceTransmuxTS
 *   If true, this will transmux TS content even if it is natively supported.
 *
 * @return {!Promise}
 *
 * @throws InvalidAccessError if blank MIME types are given
 * @throws NotSupportedError if unsupported MIME types are given
 * @throws QuotaExceededError if the browser can't support that many buffers
 */
shaka.media.MediaSourceEngine.prototype.init = async function(
    streamsByType, forceTransmuxTS) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  await this.mediaSourceOpen_;

  streamsByType.forEach((stream, contentType) => {
    goog.asserts.assert(
        shaka.media.MediaSourceEngine.isStreamSupported(stream),
        'Type negotiation should happen before MediaSourceEngine.init!');

    let mimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, stream.codecs);
    if (contentType == ContentType.TEXT) {
      this.reinitText(mimeType);
    } else {
      if ((forceTransmuxTS || !MediaSource.isTypeSupported(mimeType)) &&
          shaka.media.Transmuxer.isSupported(mimeType, contentType)) {
        this.transmuxers_[contentType] = new shaka.media.Transmuxer();
        mimeType =
            shaka.media.Transmuxer.convertTsCodecs(contentType, mimeType);
      }
      let sourceBuffer = this.mediaSource_.addSourceBuffer(mimeType);
      this.eventManager_.listen(
          sourceBuffer, 'error',
          this.onError_.bind(this, contentType));
      this.eventManager_.listen(
          sourceBuffer, 'updateend',
          this.onUpdateEnd_.bind(this, contentType));
      this.sourceBuffers_[contentType] = sourceBuffer;
      this.queues_[contentType] = [];
    }
  });
};


/**
 * Reinitialize the TextEngine for a new text type.
 * @param {string} mimeType
 */
shaka.media.MediaSourceEngine.prototype.reinitText = function(mimeType) {
  if (!this.textEngine_) {
    this.textEngine_ = new shaka.text.TextEngine(this.textDisplayer_);
  }
  this.textEngine_.initParser(mimeType);
};


/**
 * @return {boolean} True if the MediaSource is in an "ended" state, or if the
 *   object has been destroyed.
 */
shaka.media.MediaSourceEngine.prototype.ended = function() {
  return this.mediaSource_ ? this.mediaSource_.readyState == 'ended' : true;
};


/**
 * Gets the first timestamp in buffer for the given content type.
 *
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @return {?number} The timestamp in seconds, or null if nothing is buffered.
 */
shaka.media.MediaSourceEngine.prototype.bufferStart = function(contentType) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (contentType == ContentType.TEXT) {
    return this.textEngine_.bufferStart();
  }
  return shaka.media.TimeRangesUtils.bufferStart(
      this.getBuffered_(contentType));
};


/**
 * Gets the last timestamp in buffer for the given content type.
 *
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @return {?number} The timestamp in seconds, or null if nothing is buffered.
 */
shaka.media.MediaSourceEngine.prototype.bufferEnd = function(contentType) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (contentType == ContentType.TEXT) {
    return this.textEngine_.bufferEnd();
  }
  return shaka.media.TimeRangesUtils.bufferEnd(this.getBuffered_(contentType));
};


/**
 * Determines if the given time is inside the buffered range of the given
 * content type.
 *
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @param {number} time Playhead time
 * @param {number=} smallGapLimit
 * @return {boolean}
 */
shaka.media.MediaSourceEngine.prototype.isBuffered = function(
    contentType, time, smallGapLimit) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (contentType == ContentType.TEXT) {
    return this.textEngine_.isBuffered(time);
  } else {
    let buffered = this.getBuffered_(contentType);
    return shaka.media.TimeRangesUtils.isBuffered(
               buffered, time, smallGapLimit);
  }
};


/**
 * Computes how far ahead of the given timestamp is buffered for the given
 * content type.
 *
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @param {number} time
 * @return {number} The amount of time buffered ahead in seconds.
 */
shaka.media.MediaSourceEngine.prototype.bufferedAheadOf =
    function(contentType, time) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (contentType == ContentType.TEXT) {
    return this.textEngine_.bufferedAheadOf(time);
  } else {
    let buffered = this.getBuffered_(contentType);
    return shaka.media.TimeRangesUtils.bufferedAheadOf(buffered, time);
  }
};


/**
 * Fill in the given buffered info object with the buffered info that media
 * source knows about.
 *
 * @param {shaka.extern.BufferedInfo} info
 */
shaka.media.MediaSourceEngine.prototype.getBufferedInfo = function(info) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  const getBufferedInfo = shaka.media.TimeRangesUtils.getBufferedInfo;
  info.total = getBufferedInfo(this.video_.buffered);
  info.audio = getBufferedInfo(this.getBuffered_(ContentType.AUDIO));
  info.video = getBufferedInfo(this.getBuffered_(ContentType.VIDEO));
  info.text = [];

  if (this.textEngine_) {
    const start = this.textEngine_.bufferStart();
    const end = this.textEngine_.bufferEnd();

    if (start != null && end != null) {
      info.text.push({start: start, end: end});
    }
  }
};


/**
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @return {TimeRanges} The buffered ranges for the given content type, or
 *   null if the buffered ranges could not be obtained.
 * @private
 */
shaka.media.MediaSourceEngine.prototype.getBuffered_ = function(contentType) {
  try {
    return this.sourceBuffers_[contentType].buffered;
  } catch (exception) {
    if (contentType in this.sourceBuffers_) {
      // Note: previous MediaSource errors may cause access to |buffered| to
      // throw.
      shaka.log.error('failed to get buffered range for ' + contentType,
                      exception);
    }
    return null;
  }
};


/**
 * Enqueue an operation to append data to the SourceBuffer.
 * Start and end times are needed for TextEngine, but not for MediaSource.
 * Start and end times may be null for initialization segments; if present they
 * are relative to the presentation timeline.
 *
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @param {!ArrayBuffer} data
 * @param {?number} startTime relative to the start of the presentation
 * @param {?number} endTime relative to the start of the presentation
 * @param {?boolean} hasClosedCaptions True if the buffer contains CEA closed
 * captions
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.appendBuffer =
    function(contentType, data, startTime, endTime, hasClosedCaptions) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  if (contentType == ContentType.TEXT) {
    return this.textEngine_.appendBuffer(data, startTime, endTime);
  } else if (this.transmuxers_[contentType]) {
    return this.transmuxers_[contentType].transmux(data).then(
        function(transmuxedData) {
          // For HLS CEA-608/708 CLOSED-CAPTIONS, text data is embedded in the
          // video stream, so textEngine may not have been initialized.
          if (!this.textEngine_) {
            this.reinitText('text/vtt');
          }
          // This doesn't work for native TS support (ex. Edge/Chromecast),
          // since no transmuxing is needed for native TS.
      if (transmuxedData.captions && transmuxedData.captions.length) {
            const videoOffset =
                this.sourceBuffers_[ContentType.VIDEO].timestampOffset;
            this.textEngine_.storeAndAppendClosedCaptions(
                transmuxedData.captions, startTime, endTime, videoOffset);
          }
          return this.enqueueOperation_(contentType,
              this.append_.bind(this, contentType, transmuxedData.data.buffer));
        }.bind(this));
  } else if (hasClosedCaptions && window.muxjs) {
    if (!this.textEngine_) {
      this.reinitText('text/vtt');
    }
    // If it is the init segment for closed captions, initialize the closed
    // caption parser.
    if (startTime == null && endTime == null) {
      this.captionParser_.init(data);
    } else {
      this.captionParser_.parseFrom(data, (captions) => {
        if (captions.length) {
          const videoOffset =
              this.sourceBuffers_[ContentType.VIDEO].timestampOffset;
          this.textEngine_.storeAndAppendClosedCaptions(
              captions, startTime, endTime, videoOffset);
        }
      });
    }
    return this.enqueueOperation_(
        contentType,
        this.append_.bind(this, contentType, data));
  } else {
    return this.enqueueOperation_(
        contentType,
        this.append_.bind(this, contentType, data));
  }
};


/**
 * Set the selected closed captions Id and language.
 *
 * @param {string} id
 */
shaka.media.MediaSourceEngine.prototype.setSelectedClosedCaptionId =
    function(id) {
  const VIDEO = shaka.util.ManifestParserUtils.ContentType.VIDEO;
  const videoBufferEndTime = this.bufferEnd(VIDEO) || 0;
  this.textEngine_.setSelectedClosedCaptionId(id, videoBufferEndTime);
};


/**
 * Enqueue an operation to remove data from the SourceBuffer.
 *
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @param {number} startTime relative to the start of the presentation
 * @param {number} endTime relative to the start of the presentation
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.remove =
    function(contentType, startTime, endTime) {
  // On IE11, this operation would be permitted, but would have no effect!
  // See https://github.com/google/shaka-player/issues/251
  goog.asserts.assert(endTime < Number.MAX_VALUE,
      'remove() with MAX_VALUE or Infinity is not IE-compatible!');
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (contentType == ContentType.TEXT) {
    return this.textEngine_.remove(startTime, endTime);
  }
  return this.enqueueOperation_(
      contentType,
      this.remove_.bind(this, contentType, startTime, endTime));
};


/**
 * Enqueue an operation to clear the SourceBuffer.
 *
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.clear = function(contentType) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (contentType == ContentType.TEXT) {
    if (!this.textEngine_) {
      return Promise.resolve();
    }

    // CaptionParser tracks the latest timestamp and uses this to filter
    // for duplicate captions.  We do this ourselves, so we must reset
    // the CaptionParser when we seek.  The best indicator of an
    // unbuffered seek in MediaSourceEngine is clear().  This causes a
    // small glitch when we change languages (which also calls clear()),
    // where the first caption in the new language may be missing.
    // TODO: Ask mux.js for a switch to remove this timestamp-tracking
    // feature so that we can do away with these hacks.
    this.captionParser_.reset();

    return this.textEngine_.remove(0, Infinity);
  }
  // Note that not all platforms allow clearing to Infinity.
  return this.enqueueOperation_(
      contentType,
      this.remove_.bind(this, contentType, 0, this.mediaSource_.duration));
};


/**
 * Enqueue an operation to flush the SourceBuffer.
 * This is a workaround for what we believe is a Chromecast bug.
 *
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.flush = function(contentType) {
  // Flush the pipeline.  Necessary on Chromecast, even though we have removed
  // everything.
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (contentType == ContentType.TEXT) {
    // Nothing to flush for text.
    return Promise.resolve();
  }
  return this.enqueueOperation_(
      contentType,
      this.flush_.bind(this, contentType));
};


/**
 * Sets the timestamp offset and append window end for the given content type.
 *
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @param {number} timestampOffset The timestamp offset.  Segments which start
 *   at time t will be inserted at time t + timestampOffset instead.  This
 *   value does not affect segments which have already been inserted.
 * @param {number} appendWindowStart The timestamp to set the append window
 *   start to.  For future appends, frames/samples with timestamps less than
 *   this value will be dropped.
 * @param {number} appendWindowEnd The timestamp to set the append window end
 *   to.  For future appends, frames/samples with timestamps greater than this
 *   value will be dropped.
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.setStreamProperties = function(
    contentType, timestampOffset, appendWindowStart, appendWindowEnd) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (contentType == ContentType.TEXT) {
    this.textEngine_.setTimestampOffset(timestampOffset);
    this.textEngine_.setAppendWindow(appendWindowStart, appendWindowEnd);
    return Promise.resolve();
  }

  return Promise.all([
    // Queue an abort() to help MSE splice together overlapping segments.
    // We set appendWindowEnd when we change periods in DASH content, and the
    // period transition may result in overlap.
    //
    // An abort() also helps with MPEG2-TS.  When we append a TS segment, we
    // always enter a PARSING_MEDIA_SEGMENT state and we can't change the
    // timestamp offset.  By calling abort(), we reset the state so we can
    // set it.
    this.enqueueOperation_(
        contentType,
        this.abort_.bind(this, contentType)),
    this.enqueueOperation_(
        contentType,
        this.setTimestampOffset_.bind(this, contentType, timestampOffset)),
    this.enqueueOperation_(
        contentType,
        this.setAppendWindow_.bind(
            this, contentType, appendWindowStart, appendWindowEnd)),
  ]);
};


/**
 * @param {string=} reason Valid reasons are 'network' and 'decode'.
 * @return {!Promise}
 * @see http://w3c.github.io/media-source/#idl-def-EndOfStreamError
 */
shaka.media.MediaSourceEngine.prototype.endOfStream = function(reason) {
  return this.enqueueBlockingOperation_(function() {
    // If endOfStream() has already been called on the media source,
    // don't call it again.
    if (this.ended()) {
      return;
    }
    // Tizen and IE11 won't let us pass undefined, but it will let us omit the
    // argument.
    if (reason) {
      this.mediaSource_.endOfStream(reason);
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
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
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
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @param {number} startTime relative to the start of the presentation
 * @param {number} endTime relative to the start of the presentation
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
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @private
 */
shaka.media.MediaSourceEngine.prototype.abort_ = function(contentType) {
  // Save the append window, which is reset on abort().
  let appendWindowStart = this.sourceBuffers_[contentType].appendWindowStart;
  let appendWindowEnd = this.sourceBuffers_[contentType].appendWindowEnd;

  // This will not trigger an 'updateend' event, since nothing is happening.
  // This is only to reset MSE internals, not to abort an actual operation.
  this.sourceBuffers_[contentType].abort();

  // Restore the append window.
  this.sourceBuffers_[contentType].appendWindowStart = appendWindowStart;
  this.sourceBuffers_[contentType].appendWindowEnd = appendWindowEnd;

  // Fake an 'updateend' event to resolve the operation.
  this.onUpdateEnd_(contentType);
};


/**
 * Nudge the playhead to force the media pipeline to be flushed.
 * This seems to be necessary on Chromecast to get new content to replace old
 * content.
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @private
 */
shaka.media.MediaSourceEngine.prototype.flush_ = function(contentType) {
  // Never use flush_ if there's data.  It causes a hiccup in playback.
  goog.asserts.assert(
      this.video_.buffered.length == 0,
      'MediaSourceEngine.flush_ should only be used after clearing all data!');

  // Seeking forces the pipeline to be flushed.
  this.video_.currentTime -= 0.001;

  // Fake an 'updateend' event to resolve the operation.
  this.onUpdateEnd_(contentType);
};


/**
 * Set the SourceBuffer's timestamp offset.
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @param {number} timestampOffset
 * @private
 */
shaka.media.MediaSourceEngine.prototype.setTimestampOffset_ =
    function(contentType, timestampOffset) {
  // Work around for https://github.com/google/shaka-player/issues/1281:
  // TODO(https://bit.ly/2ttKiBU): follow up when this is fixed in Edge
  if (timestampOffset < 0) {
    // Try to prevent rounding errors in Edge from removing the first keyframe.
    timestampOffset += 0.001;
  }

  this.sourceBuffers_[contentType].timestampOffset = timestampOffset;

  // Fake an 'updateend' event to resolve the operation.
  this.onUpdateEnd_(contentType);
};


/**
 * Set the SourceBuffer's append window end.
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @param {number} appendWindowStart
 * @param {number} appendWindowEnd
 * @private
 */
shaka.media.MediaSourceEngine.prototype.setAppendWindow_ =
    function(contentType, appendWindowStart, appendWindowEnd) {
  // You can't set start > end, so first set start to 0, then set the new end,
  // then set the new start.  That way, there are no intermediate states which
  // are invalid.
  this.sourceBuffers_[contentType].appendWindowStart = 0;
  this.sourceBuffers_[contentType].appendWindowEnd = appendWindowEnd;
  this.sourceBuffers_[contentType].appendWindowStart = appendWindowStart;

  // Fake an 'updateend' event to resolve the operation.
  this.onUpdateEnd_(contentType);
};


/**
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @param {!Event} event
 * @private
 */
shaka.media.MediaSourceEngine.prototype.onError_ =
    function(contentType, event) {
  let operation = this.queues_[contentType][0];
  goog.asserts.assert(operation, 'Spurious error event!');
  goog.asserts.assert(!this.sourceBuffers_[contentType].updating,
                      'SourceBuffer should not be updating on error!');
  let code = this.video_.error ? this.video_.error.code : 0;
  operation.p.reject(new shaka.util.Error(
      shaka.util.Error.Severity.CRITICAL,
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
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @private
 */
shaka.media.MediaSourceEngine.prototype.onUpdateEnd_ = function(contentType) {
  let operation = this.queues_[contentType][0];
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
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @param {function()} start
 * @return {!Promise}
 * @private
 */
shaka.media.MediaSourceEngine.prototype.enqueueOperation_ =
    function(contentType, start) {
  if (this.destroyed_) return Promise.reject();

  let operation = {
    start: start,
    p: new shaka.util.PublicPromise(),
  };
  this.queues_[contentType].push(operation);

  if (this.queues_[contentType].length == 1) {
    try {
      operation.start();
    } catch (exception) {
      if (exception.name == 'QuotaExceededError') {
        operation.p.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
            contentType));
      } else {
        operation.p.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
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

  let allWaiters = [];

  // Enqueue a 'wait' operation onto each queue.
  // This operation signals its readiness when it starts.
  // When all wait operations are ready, the real operation takes place.
  for (let contentType in this.sourceBuffers_) {
    let ready = new shaka.util.PublicPromise();
    let operation = {
      start: function(ready) { ready.resolve(); }.bind(null, ready),
      p: ready,
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
    if (goog.DEBUG) {
      // If we did it correctly, nothing is updating.
      for (let contentType in this.sourceBuffers_) {
        goog.asserts.assert(
            this.sourceBuffers_[contentType].updating == false,
            'SourceBuffers should not be updating after a blocking op!');
      }
    }

    let ret;
    // Run the real operation, which is synchronous.
    try {
      run();
    } catch (exception) {
      ret = Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
          exception));
    }

    // Unblock the queues.
    for (let contentType in this.sourceBuffers_) {
      this.popFromQueue_(contentType);
    }

    return ret;
  }.bind(this), function(error) {
    // One of the waiters failed, which means we've been destroyed.
    goog.asserts.assert(this.destroyed_, 'Should be destroyed by now');
    // We haven't popped from the queue.  Canceled waiters have been removed by
    // destroy.  What's left now should just be resolved waiters.  In uncompiled
    // mode, we will maintain good hygiene and make sure the assert at the end
    // of destroy passes.  In compiled mode, the queues are wiped in destroy.
    if (goog.DEBUG) {
      for (let contentType in this.sourceBuffers_) {
        if (this.queues_[contentType].length) {
          goog.asserts.assert(
              this.queues_[contentType].length == 1,
              'Should be at most one item in queue!');
          goog.asserts.assert(
              allWaiters.includes(this.queues_[contentType][0].p),
              'The item in queue should be one of our waiters!');
          this.queues_[contentType].shift();
        }
      }
    }
    throw error;
  }.bind(this));
};


/**
 * Pop from the front of the queue and start a new operation.
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 * @private
 */
shaka.media.MediaSourceEngine.prototype.popFromQueue_ = function(contentType) {
  // Remove the in-progress operation, which is now complete.
  this.queues_[contentType].shift();
  // Retrieve the next operation, if any, from the queue and start it.
  let next = this.queues_[contentType][0];
  if (next) {
    try {
      next.start();
    } catch (exception) {
      next.p.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
          exception));
      this.popFromQueue_(contentType);
    }
  }
};


/**
 * @return {!shaka.extern.TextDisplayer}
 */
shaka.media.MediaSourceEngine.prototype.getTextDisplayer = function() {
  goog.asserts.assert(
      this.textDisplayer_,
      'TextDisplayer should only be null when this is destroyed');

  return this.textDisplayer_;
};

/**
 * @param {!shaka.extern.TextDisplayer} textDisplayer
 */
shaka.media.MediaSourceEngine.prototype.setTextDisplayer =
    function(textDisplayer) {
      const oldTextDisplayer = this.textDisplayer_;
      this.textDisplayer_ = textDisplayer;
      if (oldTextDisplayer) {
        textDisplayer.setTextVisibility(oldTextDisplayer.isTextVisible());
        oldTextDisplayer.destroy();
      }
      if (this.textEngine_) {
        this.textEngine_.setDisplayer(textDisplayer);
      }
    };
