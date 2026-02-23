/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.TextEngine');

goog.require('goog.asserts');
goog.require('shaka.media.ClosedCaptionParser');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.text.Cue');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.MimeUtils');


// TODO: revisit this when Closure Compiler supports partially-exported classes.
/**
 * @summary Manages text parsers and cues.
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.text.TextEngine = class {
  /**
   * @param {shaka.extern.TextDisplayer} displayer
   * @param {string=} manifestType
   */
  constructor(displayer, manifestType = shaka.media.ManifestParser.UNKNOWN) {
    /** @private {?shaka.extern.TextParser} */
    this.parser_ = null;

    /** @private {shaka.extern.TextDisplayer} */
    this.displayer_ = displayer;

    /** @private {string} */
    this.manifestType_ = manifestType;

    /** @private {boolean} */
    this.segmentRelativeVttTiming_ = false;

    /** @private {boolean} */
    this.external_ = false;

    /** @private {Map<number, number>} */
    this.timestampOffsetMap_ = new Map();

    /** @private {Map<number, Array<shaka.text.TextEngine.DeferredAppend>>} */
    this.deferredAppends_ = new Map();

    /** @private {number} */
    this.appendWindowStart_ = 0;

    /** @private {number} */
    this.appendWindowEnd_ = Infinity;

    /** @private {?number} */
    this.bufferStart_ = null;

    /** @private {?number} */
    this.bufferEnd_ = null;

    /** @private {string} */
    this.selectedClosedCaptionId_ = '';

    /** @private {shaka.extern.TextParser.ModifyCueCallback} */
    this.modifyCueCallback_ = (cue, uri) => {};

    /**
     * The closed captions map stores the CEA closed captions by closed captions
     * id and start and end time.
     * It's used as the buffer of closed caption text streams, to show captions
     * when we start displaying captions or switch caption tracks, we need to be
     * able to get the cues for the other language and display them without
     * re-fetching the video segments they were embedded in.
     * @private {!Map<string, !Array<shaka.text.Cue>>}
     */
    this.closedCaptionsMap_ = new Map();
  }

  /**
   * @param {string} mimeType
   * @param {!shaka.extern.TextParserPlugin} plugin
   * @export
   */
  static registerParser(mimeType, plugin) {
    shaka.text.TextEngine.parserMap_.set(mimeType, plugin);
  }

  /**
   * @param {string} mimeType
   * @export
   */
  static unregisterParser(mimeType) {
    shaka.text.TextEngine.parserMap_.delete(mimeType);
  }

  /**
   * @return {?shaka.extern.TextParserPlugin}
   * @export
   */
  static findParser(mimeType) {
    return shaka.text.TextEngine.parserMap_.get(mimeType);
  }

  /**
   * @param {string} mimeType
   * @return {boolean}
   */
  static isTypeSupported(mimeType) {
    if (shaka.text.TextEngine.parserMap_.has(mimeType)) {
      // An actual parser is available.
      return true;
    }
    if (mimeType == shaka.util.MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE ||
        mimeType == shaka.util.MimeUtils.CEA708_CLOSED_CAPTION_MIMETYPE ) {
      return !!shaka.media.ClosedCaptionParser.findDecoder();
    }
    return false;
  }

  // TODO: revisit this when the compiler supports partially-exported classes.
  /**
   * @override
   * @export
   */
  destroy() {
    this.parser_ = null;
    this.displayer_ = null;
    this.timestampOffsetMap_.clear();
    this.deferredAppends_.clear();
    this.closedCaptionsMap_.clear();

    return Promise.resolve();
  }

  /**
   * @param {!shaka.extern.TextDisplayer} displayer
   */
  setDisplayer(displayer) {
    this.displayer_ = displayer;
  }

  /**
   * Initialize the parser.  This can be called multiple times, but must be
   * called at least once before appendBuffer.
   *
   * @param {string} mimeType
   * @param {boolean} external
   * @param {boolean} segmentRelativeVttTiming
   */
  initParser(mimeType, external, segmentRelativeVttTiming) {
    // No parser for CEA, which is extracted from video and side-loaded
    // into TextEngine and TextDisplayer.
    if (mimeType == shaka.util.MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE ||
        mimeType == shaka.util.MimeUtils.CEA708_CLOSED_CAPTION_MIMETYPE) {
      this.parser_ = null;
      return;
    }

    const factory = shaka.text.TextEngine.parserMap_.get(mimeType);
    goog.asserts.assert(
        factory, 'Text type negotiation should have happened already');
    this.parser_ = factory();
    this.parser_.setManifestType(this.manifestType_);
    this.segmentRelativeVttTiming_ = segmentRelativeVttTiming;
    this.external_ = external;
  }

  /** @param {shaka.extern.TextParser.ModifyCueCallback} modifyCueCallback */
  setModifyCueCallback(modifyCueCallback) {
    this.modifyCueCallback_ = modifyCueCallback;
  }

  /**
   * @param {BufferSource} buffer
   * @param {?number} startTime relative to the start of the presentation
   * @param {?number} endTime relative to the start of the presentation
   * @param {?string=} uri
   * @param {number=} disco the associated discontinuity sequence
   * @return {!Promise}
   */
  async appendBuffer(buffer, startTime, endTime, uri, disco = -1) {
    goog.asserts.assert(
        this.parser_, 'The parser should already be initialized');

    // if we're trying to append content associated with a particular
    // discontinuity sequence delay that append until after we have received
    // its associated timestamp offset
    // skip for segment relative timing and external tracks
    if (!(this.external_) &&
      !this.timestampOffsetMap_.has(disco)) {
      const deferredAppends = this.deferredAppends_.get(disco) || [];
      deferredAppends.push({buffer, startTime, endTime, uri, disco});
      this.deferredAppends_.set(disco, deferredAppends);
      return;
    }

    // Start the operation asynchronously to avoid blocking the caller.
    await Promise.resolve();

    // Check that TextEngine hasn't been destroyed.
    if (!this.parser_ || !this.displayer_) {
      return;
    }

    if (startTime == null || endTime == null) {
      this.parser_.parseInit(shaka.util.BufferUtils.toUint8(buffer));
      return;
    }

    const periodStart = this.external_ ?
        0 : this.timestampOffsetMap_.get(disco);
    const vttOffset = (this.segmentRelativeVttTiming_ || this.external_) ?
        startTime : this.timestampOffsetMap_.get(disco);

    /** @type {shaka.extern.TextParser.TimeContext} **/
    const time = {
      periodStart: periodStart,
      segmentStart: startTime,
      segmentEnd: endTime,
      vttOffset: vttOffset,
    };

    // Parse the buffer and add the new cues.
    const allCues = this.parser_.parseMedia(
        shaka.util.BufferUtils.toUint8(buffer), time, uri, /* images= */ []);
    for (const cue of allCues) {
      this.modifyCueCallback_(cue, uri || null, time);
    }
    const cuesToAppend = allCues.filter((cue) => {
      return cue.startTime >= this.appendWindowStart_ &&
          cue.startTime < this.appendWindowEnd_;
    });

    this.displayer_.append(cuesToAppend);

    // NOTE: We update the buffered range from the start and end times
    // passed down from the segment reference, not with the start and end
    // times of the parsed cues.  This is important because some segments
    // may contain no cues, but we must still consider those ranges
    // buffered.
    if (this.bufferStart_ == null) {
      this.bufferStart_ = Math.max(startTime, this.appendWindowStart_);
    } else {
      // We already had something in buffer, and we assume we are extending
      // the range from the end.
      goog.asserts.assert(
          this.bufferEnd_ != null,
          'There should already be a buffered range end.');
      goog.asserts.assert(
          (startTime - this.bufferEnd_) <= 1,
          'There should not be a gap in text references >1s');
    }
    this.bufferEnd_ = Math.min(endTime, this.appendWindowEnd_);
  }

  /**
   * @param {number} startTime relative to the start of the presentation
   * @param {number} endTime relative to the start of the presentation
   * @param {boolean=} removeClosedCaptions
   * @return {!Promise}
   */
  async remove(startTime, endTime, removeClosedCaptions = false) {
    // Start the operation asynchronously to avoid blocking the caller.
    await Promise.resolve();
    if (startTime >= endTime) {
      return;
    }
    if (removeClosedCaptions) {
      this.removeClosedCaptions_(startTime, endTime);
      // if we are not displaying closed captions and are clearing data for
      // closed captions, we shouldn't clear the displayer.
      if (this.selectedClosedCaptionId_ === '') {
        return;
      }
    }

    const removeInRange = (cue) => {
      const inside = cue.startTime < endTime && cue.endTime > startTime;
      return inside;
    };

    for (const key of this.deferredAppends_.keys()) {
      const deferred = this.deferredAppends_.get(key);
      /** @type {Array<shaka.text.TextEngine.DeferredAppend>} */
      const newDeferreds = [];

      for (let i = 0; i < deferred.length; i++) {
        const cue = deferred[i];
        if (!removeInRange(cue)) {
          newDeferreds.push(cue);
        }
      }
      this.deferredAppends_.set(key, newDeferreds);
    }

    if (this.displayer_ && this.displayer_.remove(startTime, endTime)) {
      if (this.bufferStart_ == null) {
        goog.asserts.assert(
            this.bufferEnd_ == null, 'end must be null if startTime is null');
      } else {
        goog.asserts.assert(
            this.bufferEnd_ != null,
            'end must be non-null if startTime is non-null');

        // Update buffered range.
        if (endTime <= this.bufferStart_ || startTime >= this.bufferEnd_) {
          // No intersection.  Nothing was removed.
        } else if (startTime <= this.bufferStart_ &&
                   endTime >= this.bufferEnd_) {
          // We wiped out everything.
          this.bufferStart_ = this.bufferEnd_ = null;
        } else if (startTime <= this.bufferStart_ &&
                   endTime < this.bufferEnd_) {
          // We removed from the beginning of the range.
          this.bufferStart_ = endTime;
        } else if (startTime > this.bufferStart_ &&
                   endTime >= this.bufferEnd_) {
          // We removed from the end of the range.
          this.bufferEnd_ = startTime;
        } else {
          // We removed from the middle?  StreamingEngine isn't supposed to.
          goog.asserts.assert(
              false, 'removal from the middle is not supported by TextEngine');
        }

        this.updateRangesWithClosedCaptions_();
      }
    }
  }

  /**
   * @param {number} timestampOffset
   * @param {number=} discontinuity defaults to -1, meaning no discontinuities
   *
   */
  setTimestampOffset(timestampOffset, discontinuity = -1) {
    // we should update the timestamp offset:
    // - if we don't already have a value set for the given discontinuity
    // - if we aren't playing HLS
    // - if we are playing HLS and the discontinuity is the default and it
    //     hasn't been updated from the default value yet
    const canUpdate =
      !this.timestampOffsetMap_.has(discontinuity) ||
      this.manifestType_ !== shaka.media.ManifestParser.HLS || (
        this.manifestType_ === shaka.media.ManifestParser.HLS &&
        discontinuity === -1 &&
        this.timestampOffsetMap_.get(discontinuity) === 0);
    if (canUpdate) {
      this.timestampOffsetMap_.set(discontinuity, timestampOffset);
    }
    /** @type {Array<shaka.text.TextEngine.DeferredAppend>} */
    const deferredAppends = this.deferredAppends_.get(discontinuity) || [];
    for (let i = 0; i < deferredAppends.length; i++) {
      const {buffer, startTime, endTime, uri, disco} = deferredAppends[i];
      this.appendBuffer(buffer, startTime, endTime, uri, disco);
    }
    this.deferredAppends_.set(discontinuity, []);
  }

  /**
   * @param {number} appendWindowStart
   * @param {number} appendWindowEnd
   */
  setAppendWindow(appendWindowStart, appendWindowEnd) {
    this.appendWindowStart_ = appendWindowStart;
    this.appendWindowEnd_ = appendWindowEnd;
  }

  /**
   * @return {?number} Time in seconds of the beginning of the buffered range,
   *   or null if nothing is buffered.
   */
  bufferStart() {
    return this.bufferStart_;
  }

  /**
   * @return {?number} Time in seconds of the end of the buffered range,
   *   or null if nothing is buffered.
   */
  bufferEnd() {
    return this.bufferEnd_;
  }

  /**
   * @param {number} t A timestamp
   * @return {boolean}
   */
  isBuffered(t) {
    if (this.bufferStart_ == null || this.bufferEnd_ == null) {
      return false;
    }
    return t >= this.bufferStart_ && t < this.bufferEnd_;
  }

  /**
   * @param {number} t A timestamp
   * @return {number} Number of seconds ahead of 't' we have buffered
   */
  bufferedAheadOf(t) {
    if (this.bufferEnd_ == null || this.bufferEnd_ < t) {
      return 0;
    }

    goog.asserts.assert(
        this.bufferStart_ != null,
        'start should not be null if end is not null');

    return this.bufferEnd_ - Math.max(t, this.bufferStart_);
  }

  /**
   * Set the selected closed captions id.
   * Append the cues stored in the closed captions map until buffer end time.
   * This is to fill the gap between buffered and unbuffered captions, and to
   * avoid duplicates that would be caused by any future video segments parsed
   * for captions.
   *
   * @param {string} id
   * @param {number} bufferEndTime Load any stored cues up to this time.
   */
  setSelectedClosedCaptionId(id, bufferEndTime) {
    this.selectedClosedCaptionId_ = id;

    const captions = this.closedCaptionsMap_.get(id);
    if (captions) {
      const cues = captions.filter((c) => c.endTime <= bufferEndTime);
      if (cues.length) {
        this.displayer_.append(cues);
      }
    }
  }

  /**
   * @param {!shaka.text.Cue} cue the cue to apply the timestamp to recursively
   * @param {number} videoTimestampOffset the timestamp offset of the video
   * @private
   */
  applyVideoTimestampOffsetRecursive_(cue, videoTimestampOffset) {
    cue.startTime += videoTimestampOffset;
    cue.endTime += videoTimestampOffset;
    for (const nested of cue.nestedCues) {
      this.applyVideoTimestampOffsetRecursive_(nested, videoTimestampOffset);
    }
  }

  /**
   * Store the closed captions in the text engine, and append the cues to the
   * text displayer.  This is a side-channel used for embedded text only.
   *
   * @param {!Array<!shaka.extern.ICaptionDecoder.ClosedCaption>} closedCaptions
   * @param {number} videoTimestampOffset the timestamp offset of the video
   *   stream in which these captions were embedded
   */
  storeAndAppendClosedCaptions(closedCaptions, videoTimestampOffset) {
    /** @type {!Map<string, !Array<!shaka.text.Cue>>} */
    const captionsMap = new Map();

    for (const caption of closedCaptions) {
      const id = caption.stream;
      const cue = caption.cue;
      captionsMap.getOrInsert(id, []);

      // Adjust CEA captions with respect to the timestamp offset of the video
      // stream in which they were embedded.
      this.applyVideoTimestampOffsetRecursive_(cue, videoTimestampOffset);

      const keepThisCue =
          cue.startTime >= this.appendWindowStart_ &&
          cue.startTime < this.appendWindowEnd_;
      if (!keepThisCue) {
        continue;
      }

      captionsMap.get(id).push(cue);
      if (id == this.selectedClosedCaptionId_) {
        this.displayer_.append([cue]);
      }
    }

    for (const id of captionsMap.keys()) {
      const closedCaptions = this.closedCaptionsMap_.getOrInsertComputed(
          id, () => []);
      for (const cue of captionsMap.get(id)) {
        closedCaptions.push(cue);
      }
    }

    this.updateRangesWithClosedCaptions_();
  }

  /**
   * @param {number} startTime
   * @param {number} endTime
   * @private
   */
  removeClosedCaptions_(startTime, endTime) {
    for (const id of this.closedCaptionsMap_.keys()) {
      let captions = this.closedCaptionsMap_.get(id);
      captions = captions.filter(
          (cue) => cue.startTime < startTime || cue.endTime >= endTime);
      this.closedCaptionsMap_.set(id, captions);
    }
  }

  /**
   * @private
   */
  updateRangesWithClosedCaptions_() {
    let startTime = Infinity;
    let endTime = -Infinity;
    for (const captions of this.closedCaptionsMap_.values()) {
      for (const cue of captions) {
        startTime = Math.min(startTime, cue.startTime);
        endTime = Math.max(endTime, cue.endTime);
      }
    }
    if (startTime === Infinity || endTime === -Infinity) {
      return;
    }
    if (this.bufferStart_ == null) {
      this.bufferStart_ = Math.max(startTime, this.appendWindowStart_);
    } else {
      this.bufferStart_ = Math.min(
          this.bufferStart_, Math.max(startTime, this.appendWindowStart_));
    }

    this.bufferEnd_ = Math.max(
        this.bufferEnd_, Math.min(endTime, this.appendWindowEnd_));
  }

  /**
   * Get the number of closed caption channels.
   *
   * This function is for TESTING ONLY. DO NOT USE in the library.
   *
   * @return {number}
   */
  getNumberOfClosedCaptionChannels() {
    return this.closedCaptionsMap_.size;
  }

  /**
   * Get the number of closed caption cues for a given channel. If there is
   * no channel for the given channel id, this will return 0.
   *
   * This function is for TESTING ONLY. DO NOT USE in the library.
   *
   * @param {string} channelId
   * @return {number}
   */
  getNumberOfClosedCaptionsInChannel(channelId) {
    const channel = this.closedCaptionsMap_.get(channelId);
    return channel ? channel.length : 0;
  }
};

/** @private {!Map<string, !shaka.extern.TextParserPlugin>} */
shaka.text.TextEngine.parserMap_ = new Map();

/**
 * @typedef {{
 *    buffer: BufferSource,
 *    startTime: ?number,
 *    endTime: ?number,
 *    uri: (?string|undefined),
 *    disco: (number|undefined)
 * }}
 *
 * @property {BufferSource} buffer
 * @property {?number} startTime
 * @property {?number} endTime
 * @property {?string=} uri
 * @property {number=} disco
 */
shaka.text.TextEngine.DeferredAppend;
