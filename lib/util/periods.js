/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.PeriodCombiner');

goog.require('goog.asserts');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.log');
goog.require('shaka.media.MetaSegmentIndex');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.util.Error');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');

/**
 * A utility to combine streams across periods.
 *
 * @implements {shaka.util.IReleasable}
 * @final
 * @export
 */
shaka.util.PeriodCombiner = class {
  constructor() {
    /** @private {!Array<shaka.extern.Variant>} */
    this.variants_ = [];

    /** @private {!Array<shaka.extern.Stream>} */
    this.audioStreams_ = [];

    /** @private {!Array<shaka.extern.Stream>} */
    this.videoStreams_ = [];

    /** @private {!Array<shaka.extern.Stream>} */
    this.textStreams_ = [];

    /** @private {!Array<shaka.extern.Stream>} */
    this.imageStreams_ = [];

    /** @private {boolean} */
    this.useStreamOnce_ = false;

    /**
     * The IDs of the periods we have already used to generate streams.
     * This helps us identify the periods which have been added when a live
     * stream is updated.
     *
     * @private {!Set<string>}
     */
    this.usedPeriodIds_ = new Set();
  }

  /** @override */
  release() {
    const allStreams =
        this.audioStreams_.concat(this.videoStreams_, this.textStreams_,
            this.imageStreams_);

    for (const stream of allStreams) {
      if (stream.segmentIndex) {
        stream.segmentIndex.release();
      }
    }

    this.audioStreams_ = [];
    this.videoStreams_ = [];
    this.textStreams_ = [];
    this.imageStreams_ = [];
    this.variants_ = [];
    this.useStreamOnce_ = false;
    this.usedPeriodIds_.clear();
  }

  /**
   * @return {!Array<shaka.extern.Variant>}
   *
   * @export
   */
  getVariants() {
    return this.variants_;
  }

  /**
   * @return {!Array<shaka.extern.Stream>}
   *
   * @export
   */
  getTextStreams() {
    // Return a copy of the array because makeTextStreamsForClosedCaptions
    // may make changes to the contents of the array. Those changes should not
    // propagate back to the PeriodCombiner.
    return this.textStreams_.slice();
  }

  /**
   * @return {!Array<shaka.extern.Stream>}
   *
   * @export
   */
  getImageStreams() {
    return this.imageStreams_;
  }

  /**
   * Deletes a stream from matchedStreams because it is no longer needed
   *
   * @param {?shaka.extern.Stream} stream
   * @param {string} periodId
   *
   * @export
   */
  deleteStream(stream, periodId) {
    if (!stream) {
      return;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (stream.type == ContentType.AUDIO) {
      for (const audioStream of this.audioStreams_) {
        audioStream.matchedStreams = audioStream.matchedStreams.filter((s) => {
          return s !== stream;
        });
      }
    } else if (stream.type == ContentType.VIDEO) {
      for (const videoStream of this.videoStreams_) {
        videoStream.matchedStreams = videoStream.matchedStreams.filter((s) => {
          return s !== stream;
        });
        if (videoStream.trickModeVideo) {
          videoStream.trickModeVideo.matchedStreams =
            videoStream.trickModeVideo.matchedStreams.filter((s) => {
              return s !== stream;
            });
        }
        if (videoStream.dependencyStream) {
          videoStream.dependencyStream.matchedStreams =
            videoStream.dependencyStream.matchedStreams.filter((s) => {
              return s !== stream;
            });
        }
      }
    } else if (stream.type == ContentType.TEXT) {
      for (const textStream of this.textStreams_) {
        textStream.matchedStreams = textStream.matchedStreams.filter((s) => {
          return s !== stream;
        });
      }
    } else if (stream.type == ContentType.IMAGE) {
      for (const imageStream of this.imageStreams_) {
        imageStream.matchedStreams = imageStream.matchedStreams.filter((s) => {
          return s !== stream;
        });
      }
    }
    if (stream.segmentIndex) {
      stream.closeSegmentIndex();
    }
    this.usedPeriodIds_.delete(periodId);
  }

  /**
   * Returns an object that contains arrays of streams by type
   * @param {!Array<shaka.extern.Period>} periods
   * @param {boolean} addDummy
   * @return {{
   *   audioStreamsPerPeriod: !Array<!Map<string, shaka.extern.Stream>>,
   *   videoStreamsPerPeriod: !Array<!Map<string, shaka.extern.Stream>>,
   *   textStreamsPerPeriod: !Array<!Map<string, shaka.extern.Stream>>,
   *   imageStreamsPerPeriod: !Array<!Map<string, shaka.extern.Stream>>,
   * }}
   * @private
   */
  getStreamsPerPeriod_(periods, addDummy) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const PeriodCombiner = shaka.util.PeriodCombiner;

    const audioStreamsPerPeriod = [];
    const videoStreamsPerPeriod = [];
    const textStreamsPerPeriod = [];
    const imageStreamsPerPeriod = [];

    for (const period of periods) {
      const audioMap = new Map(period.audioStreams.map((s) =>
        [PeriodCombiner.generateAudioKey_(s), s]));
      const videoMap = new Map(period.videoStreams.map((s) =>
        [PeriodCombiner.generateVideoKey_(s), s]));
      const textMap = new Map(period.textStreams.map((s) =>
        [PeriodCombiner.generateTextKey_(s), s]));
      const imageMap = new Map(period.imageStreams.map((s) =>
        [PeriodCombiner.generateImageKey_(s), s]));

      // It's okay to have a period with no text or images, but our algorithm
      // fails on any period without matching streams.  So we add dummy streams
      // to each period.  Since we combine text streams by language and image
      // streams by resolution, we might need a dummy even in periods with these
      // streams already.
      if (addDummy) {
        const dummyText = PeriodCombiner.dummyStream_(ContentType.TEXT);
        textMap.set(PeriodCombiner.generateTextKey_(dummyText), dummyText);
        const dummyImage = PeriodCombiner.dummyStream_(ContentType.IMAGE);
        imageMap.set(PeriodCombiner.generateImageKey_(dummyImage), dummyImage);
      }

      audioStreamsPerPeriod.push(audioMap);
      videoStreamsPerPeriod.push(videoMap);
      textStreamsPerPeriod.push(textMap);
      imageStreamsPerPeriod.push(imageMap);
    }
    return {
      audioStreamsPerPeriod,
      videoStreamsPerPeriod,
      textStreamsPerPeriod,
      imageStreamsPerPeriod,
    };
  }

  /**
   * @param {!Array<shaka.extern.Period>} periods
   * @param {boolean} isDynamic
   * @param {boolean=} isPatchUpdate
   * @return {!Promise}
   *
   * @export
   */
  async combinePeriods(periods, isDynamic, isPatchUpdate = false) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    // Optimization: for single-period VOD, do nothing.  This makes sure
    // single-period DASH content will be 100% accurately represented in the
    // output.
    if (!isDynamic && periods.length == 1) {
      // We need to filter out duplicates, so call getStreamsPerPeriod()
      // so it will do that by usage of Map.
      const {
        audioStreamsPerPeriod,
        videoStreamsPerPeriod,
        textStreamsPerPeriod,
        imageStreamsPerPeriod,
      } = this.getStreamsPerPeriod_(periods, /* addDummy= */ false);
      this.audioStreams_ = Array.from(audioStreamsPerPeriod[0].values());
      this.videoStreams_ = Array.from(videoStreamsPerPeriod[0].values());
      this.textStreams_ = Array.from(textStreamsPerPeriod[0].values());
      this.imageStreams_ = Array.from(imageStreamsPerPeriod[0].values());
    } else {
      // How many periods we've seen before which are not included in this call.
      const periodsMissing = isPatchUpdate ? this.usedPeriodIds_.size : 0;
      // Find the first period we haven't seen before.  Tag all the periods we
      // see now as "used".
      let firstNewPeriodIndex = -1;
      for (let i = 0; i < periods.length; i++) {
        const period = periods[i];
        if (this.usedPeriodIds_.has(period.id)) {
          // This isn't new.
        } else {
          // This one _is_ new.
          this.usedPeriodIds_.add(period.id);

          if (firstNewPeriodIndex == -1) {
            // And it's the _first_ new one.
            firstNewPeriodIndex = i;
          }
        }
      }

      if (firstNewPeriodIndex == -1) {
        // Nothing new? Nothing to do.
        return;
      }

      const {
        audioStreamsPerPeriod,
        videoStreamsPerPeriod,
        textStreamsPerPeriod,
        imageStreamsPerPeriod,
      } = this.getStreamsPerPeriod_(periods, /* addDummy= */ true);

      await Promise.all([
        this.combine_(
            this.audioStreams_,
            audioStreamsPerPeriod,
            firstNewPeriodIndex,
            shaka.util.PeriodCombiner.cloneStream_,
            shaka.util.PeriodCombiner.concatenateStreams_,
            periodsMissing),
        this.combine_(
            this.videoStreams_,
            videoStreamsPerPeriod,
            firstNewPeriodIndex,
            shaka.util.PeriodCombiner.cloneStream_,
            shaka.util.PeriodCombiner.concatenateStreams_,
            periodsMissing),
        this.combine_(
            this.textStreams_,
            textStreamsPerPeriod,
            firstNewPeriodIndex,
            shaka.util.PeriodCombiner.cloneStream_,
            shaka.util.PeriodCombiner.concatenateStreams_,
            periodsMissing),
        this.combine_(
            this.imageStreams_,
            imageStreamsPerPeriod,
            firstNewPeriodIndex,
            shaka.util.PeriodCombiner.cloneStream_,
            shaka.util.PeriodCombiner.concatenateStreams_,
            periodsMissing),
      ]);
    }

    // Create variants for all audio/video combinations.
    let nextVariantId = 0;
    const variants = [];
    if (!this.videoStreams_.length || !this.audioStreams_.length) {
      // For audio-only or video-only content, just give each stream its own
      // variant.
      const streams = this.videoStreams_.length ? this.videoStreams_ :
        this.audioStreams_;
      for (const stream of streams) {
        const id = nextVariantId++;
        let bandwidth = stream.bandwidth || 0;
        if (stream.dependencyStream) {
          bandwidth += stream.dependencyStream.bandwidth || 0;
        }
        variants.push({
          id,
          language: stream.language,
          disabledUntilTime: 0,
          primary: stream.primary,
          audio: stream.type == ContentType.AUDIO ? stream : null,
          video: stream.type == ContentType.VIDEO ? stream : null,
          bandwidth,
          drmInfos: stream.drmInfos,
          allowedByApplication: true,
          allowedByKeySystem: true,
          decodingInfos: [],
        });
      }
    } else {
      for (const audio of this.audioStreams_) {
        for (const video of this.videoStreams_) {
          const commonDrmInfos = shaka.drm.DrmUtils.getCommonDrmInfos(
              audio.drmInfos, video.drmInfos);

          if (audio.drmInfos.length && video.drmInfos.length &&
              !commonDrmInfos.length) {
            shaka.log.warning(
                'Incompatible DRM in audio & video, skipping variant creation.',
                audio, video);
            continue;
          }

          let bandwidth = (audio.bandwidth || 0) + (video.bandwidth || 0);
          if (audio.dependencyStream) {
            bandwidth += audio.dependencyStream.bandwidth || 0;
          }
          if (video.dependencyStream) {
            bandwidth += video.dependencyStream.bandwidth || 0;
          }

          const id = nextVariantId++;
          variants.push({
            id,
            language: audio.language,
            disabledUntilTime: 0,
            primary: audio.primary,
            audio,
            video,
            bandwidth,
            drmInfos: commonDrmInfos,
            allowedByApplication: true,
            allowedByKeySystem: true,
            decodingInfos: [],
          });
        }
      }
    }

    this.variants_ = variants;
  }


  /**
   * Stitch together DB streams across periods, taking a mix of stream types.
   * The offline database does not separate these by type.
   *
   * Unlike the DASH case, this does not need to maintain any state for manifest
   * updates.
   *
   * @param {!Array<!Array<shaka.extern.StreamDB>>} streamDbsPerPeriod
   * @return {!Promise<!Array<shaka.extern.StreamDB>>}
   */
  static async combineDbStreams(streamDbsPerPeriod) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const PeriodCombiner = shaka.util.PeriodCombiner;

    // Optimization: for single-period content, do nothing.  This makes sure
    // single-period DASH or any HLS content stored offline will be 100%
    // accurately represented in the output.
    if (streamDbsPerPeriod.length == 1) {
      return streamDbsPerPeriod[0];
    }

    const audioStreamDbsPerPeriod = streamDbsPerPeriod.map(
        (streams) => new Map(streams
            .filter((s) => s.type === ContentType.AUDIO)
            .map((s) => [PeriodCombiner.generateAudioKey_(s), s])));
    const videoStreamDbsPerPeriod = streamDbsPerPeriod.map(
        (streams) => new Map(streams
            .filter((s) => s.type === ContentType.VIDEO)
            .map((s) => [PeriodCombiner.generateVideoKey_(s), s])));
    const textStreamDbsPerPeriod = streamDbsPerPeriod.map(
        (streams) => new Map(streams
            .filter((s) => s.type === ContentType.TEXT)
            .map((s) => [PeriodCombiner.generateTextKey_(s), s])));
    const imageStreamDbsPerPeriod = streamDbsPerPeriod.map(
        (streams) => new Map(streams
            .filter((s) => s.type === ContentType.IMAGE)
            .map((s) => [PeriodCombiner.generateImageKey_(s), s])));

    // It's okay to have a period with no text or images, but our algorithm
    // fails on any period without matching streams.  So we add dummy streams to
    // each period.  Since we combine text streams by language and image streams
    // by resolution, we might need a dummy even in periods with these streams
    // already.
    for (const textStreams of textStreamDbsPerPeriod) {
      const dummy = PeriodCombiner.dummyStreamDB_(ContentType.TEXT);
      textStreams.set(PeriodCombiner.generateTextKey_(dummy), dummy);
    }
    for (const imageStreams of imageStreamDbsPerPeriod) {
      const dummy = PeriodCombiner.dummyStreamDB_(ContentType.IMAGE);
      imageStreams.set(PeriodCombiner.generateImageKey_(dummy), dummy);
    }

    const periodCombiner = new shaka.util.PeriodCombiner();

    const combinedAudioStreamDbs = await periodCombiner.combine_(
        /* outputStreams= */ [],
        audioStreamDbsPerPeriod,
        /* firstNewPeriodIndex= */ 0,
        shaka.util.PeriodCombiner.cloneStreamDB_,
        shaka.util.PeriodCombiner.concatenateStreamDBs_,
        /* periodsMissing= */ 0);

    const combinedVideoStreamDbs = await periodCombiner.combine_(
        /* outputStreams= */ [],
        videoStreamDbsPerPeriod,
        /* firstNewPeriodIndex= */ 0,
        shaka.util.PeriodCombiner.cloneStreamDB_,
        shaka.util.PeriodCombiner.concatenateStreamDBs_,
        /* periodsMissing= */ 0);

    const combinedTextStreamDbs = await periodCombiner.combine_(
        /* outputStreams= */ [],
        textStreamDbsPerPeriod,
        /* firstNewPeriodIndex= */ 0,
        shaka.util.PeriodCombiner.cloneStreamDB_,
        shaka.util.PeriodCombiner.concatenateStreamDBs_,
        /* periodsMissing= */ 0);

    const combinedImageStreamDbs = await periodCombiner.combine_(
        /* outputStreams= */ [],
        imageStreamDbsPerPeriod,
        /* firstNewPeriodIndex= */ 0,
        shaka.util.PeriodCombiner.cloneStreamDB_,
        shaka.util.PeriodCombiner.concatenateStreamDBs_,
        /* periodsMissing= */ 0);

    // Recreate variantIds from scratch in the output.
    // HLS content is always single-period, so the early return at the top of
    // this method would catch all HLS content.  DASH content stored with v3.0
    // will already be flattened before storage.  Therefore the only content
    // that reaches this point is multi-period DASH content stored before v3.0.
    // Such content always had variants generated from all combinations of audio
    // and video, so we can simply do that now without loss of correctness.
    let nextVariantId = 0;
    if (!combinedVideoStreamDbs.length || !combinedAudioStreamDbs.length) {
      // For audio-only or video-only content, just give each stream its own
      // variant ID.
      const combinedStreamDbs =
          combinedVideoStreamDbs.concat(combinedAudioStreamDbs);
      for (const stream of combinedStreamDbs) {
        stream.variantIds = [nextVariantId++];
      }
    } else {
      for (const audio of combinedAudioStreamDbs) {
        for (const video of combinedVideoStreamDbs) {
          const id = nextVariantId++;
          video.variantIds.push(id);
          audio.variantIds.push(id);
        }
      }
    }

    return combinedVideoStreamDbs
        .concat(combinedAudioStreamDbs)
        .concat(combinedTextStreamDbs)
        .concat(combinedImageStreamDbs);
  }

  /**
   * Combine input Streams per period into flat output Streams.
   * Templatized to handle both DASH Streams and offline StreamDBs.
   *
   * @param {!Array<T>} outputStreams A list of existing output streams, to
   *   facilitate updates for live DASH content.  Will be modified and returned.
   * @param {!Array<!Map<string, T>>} streamsPerPeriod A list of maps of Streams
   *   from each period.
   * @param {number} firstNewPeriodIndex An index into streamsPerPeriod which
   *   represents the first new period that hasn't been processed yet.
   * @param {function(T):T} clone Make a clone of an input stream.
   * @param {function(T, T)} concat Concatenate the second stream onto the end
   *   of the first.
   * @param {number} periodsMissing The number of periods missing
   *
   * @return {!Promise<!Array<T>>} The same array passed to outputStreams,
   *   modified to include any newly-created streams.
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  async combine_(
      outputStreams, streamsPerPeriod, firstNewPeriodIndex, clone, concat,
      periodsMissing) {
    const unusedStreamsPerPeriod = [];

    for (let i = 0; i < streamsPerPeriod.length; i++) {
      if (i >= firstNewPeriodIndex) {
        // This periods streams are all new.
        unusedStreamsPerPeriod.push(new Set(streamsPerPeriod[i].values()));
      } else {
        // This period's streams have all been used already.
        unusedStreamsPerPeriod.push(new Set());
      }
    }

    // First, extend all existing output Streams into the new periods.
    for (const outputStream of outputStreams) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await this.extendExistingOutputStream_(
          outputStream, streamsPerPeriod, firstNewPeriodIndex, concat,
          unusedStreamsPerPeriod, periodsMissing);
      if (!ok) {
        // This output Stream was not properly extended to include streams from
        // the new period.  This is likely a bug in our algorithm, so throw an
        // error.
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.PERIOD_FLATTENING_FAILED);
      }

      // This output stream is now complete with content from all known
      // periods.
    }  // for (const outputStream of outputStreams)

    for (const unusedStreams of unusedStreamsPerPeriod) {
      for (const stream of unusedStreams) {
        // Create a new output stream which includes this input stream.
        const outputStream = this.createNewOutputStream_(
            stream, streamsPerPeriod, clone, concat,
            unusedStreamsPerPeriod);
        if (outputStream) {
          outputStreams.push(outputStream);
        } else {
          // This is not a stream we can build output from, but it may become
          // part of another output based on another period's stream.
        }
      }  // for (const stream of unusedStreams)
    }  // for (const unusedStreams of unusedStreamsPerPeriod)

    for (const unusedStreams of unusedStreamsPerPeriod) {
      for (const stream of unusedStreams) {
        if (shaka.util.PeriodCombiner.isDummy_(stream)) {
          // This is one of our dummy streams, so ignore it.  We may not use
          // them all, and that's fine.
          continue;
        }
        // If this stream has a different codec/MIME than any other stream,
        // then we can't play it.
        const hasCodec = outputStreams.some((s) => {
          return this.areAVStreamsCompatible_(stream, s);
        });
        if (!hasCodec) {
          continue;
        }

        // Any other unused stream is likely a bug in our algorithm, so throw
        // an error.
        shaka.log.error('Unused stream in period-flattening!',
            stream, outputStreams);
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.PERIOD_FLATTENING_FAILED);
      }
    }

    return outputStreams;
  }

  /**
   * @param {T} outputStream An existing output stream which needs to be
   *   extended into new periods.
   * @param {!Array<!Map<string, T>>} streamsPerPeriod A list of maps of Streams
   *   from each period.
   * @param {number} firstNewPeriodIndex An index into streamsPerPeriod which
   *   represents the first new period that hasn't been processed yet.
   * @param {function(T, T)} concat Concatenate the second stream onto the end
   *   of the first.
   * @param {!Array<!Set<T>>} unusedStreamsPerPeriod An array of sets of
   *   unused streams from each period.
   * @param {number} periodsMissing How many periods are missing in this update.
   *
   * @return {!Promise<boolean>}
   *
   * @template T
   * Should only be called with a Stream type in practice, but has call sites
   * from other templated functions that also accept a StreamDB.
   *
   * @private
   */
  async extendExistingOutputStream_(
      outputStream, streamsPerPeriod, firstNewPeriodIndex, concat,
      unusedStreamsPerPeriod, periodsMissing) {
    this.findMatchesInAllPeriods_(streamsPerPeriod,
        outputStream, periodsMissing > 0);

    // This only exists where T == Stream, and this should only ever be called
    // on Stream types.  StreamDB should not have pre-existing output streams.
    goog.asserts.assert(outputStream.createSegmentIndex,
        'outputStream should be a Stream type!');

    if (!outputStream.matchedStreams) {
      // We were unable to extend this output stream.
      shaka.log.error('No matches extending output stream!',
          outputStream, streamsPerPeriod);
      return false;
    }
    // We need to create all the per-period segment indexes and append them to
    // the output's MetaSegmentIndex.
    if (outputStream.segmentIndex) {
      await shaka.util.PeriodCombiner.extendOutputSegmentIndex_(outputStream,
          firstNewPeriodIndex + periodsMissing);
    }

    shaka.util.PeriodCombiner.extendOutputStream_(outputStream,
        firstNewPeriodIndex, concat, unusedStreamsPerPeriod, periodsMissing);
    return true;
  }

  /**
   * Creates the segment indexes for an array of input streams, and append them
   * to the output stream's segment index.
   *
   * @param {shaka.extern.Stream} outputStream
   * @param {number} firstNewPeriodIndex An index into streamsPerPeriod which
   *   represents the first new period that hasn't been processed yet.
   * @private
   */
  static async extendOutputSegmentIndex_(outputStream, firstNewPeriodIndex) {
    const operations = [];
    const streams = outputStream.matchedStreams;
    goog.asserts.assert(streams, 'matched streams should be valid');

    for (let i = firstNewPeriodIndex; i < streams.length; i++) {
      const stream = streams[i];
      operations.push(stream.createSegmentIndex());
      if (stream.trickModeVideo && !stream.trickModeVideo.segmentIndex) {
        operations.push(stream.trickModeVideo.createSegmentIndex());
      }
      if (stream.dependencyStream && !stream.dependencyStream.segmentIndex) {
        operations.push(stream.dependencyStream.createSegmentIndex());
      }
    }
    await Promise.all(operations);

    // Concatenate the new matches onto the stream, starting at the first new
    // period.
    // Satisfy the compiler about the type.
    // Also checks if the segmentIndex is still valid after the async
    // operations, to make sure we stop if the active stream has changed.
    if (outputStream.segmentIndex instanceof shaka.media.MetaSegmentIndex) {
      for (let i = firstNewPeriodIndex; i < streams.length; i++) {
        const match = streams[i];
        goog.asserts.assert(match.segmentIndex,
            'stream should have a segmentIndex.');
        if (match.segmentIndex) {
          outputStream.segmentIndex.appendSegmentIndex(match.segmentIndex);
        }
      }
    }
  }

  /**
   * Create a new output Stream based on a particular input Stream.  Locates
   * matching Streams in all other periods and combines them into an output
   * Stream.
   * Templatized to handle both DASH Streams and offline StreamDBs.
   *
   * @param {T} stream An input stream on which to base the output stream.
   * @param {!Array<!Map<string, T>>} streamsPerPeriod A list of maps of Streams
   *   from each period.
   * @param {function(T):T} clone Make a clone of an input stream.
   * @param {function(T, T)} concat Concatenate the second stream onto the end
   *   of the first.
   * @param {!Array<!Set<T>>} unusedStreamsPerPeriod An array of sets of
   *   unused streams from each period.
   *
   * @return {?T} A newly-created output Stream, or null if matches
   *   could not be found.`
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  createNewOutputStream_(
      stream, streamsPerPeriod, clone, concat, unusedStreamsPerPeriod) {
    // Check do we want to create output stream from dummy stream
    // and if so, return quickly.
    if (shaka.util.PeriodCombiner.isDummy_(stream)) {
      return null;
    }
    // Start by cloning the stream without segments, key IDs, etc.
    const outputStream = clone(stream);

    // Find best-matching streams in all periods.
    this.findMatchesInAllPeriods_(streamsPerPeriod, outputStream);

    // This only exists where T == Stream.
    if (outputStream.createSegmentIndex) {
      // Override the createSegmentIndex function of the outputStream.
      outputStream.createSegmentIndex = async () => {
        if (!outputStream.segmentIndex) {
          outputStream.segmentIndex = new shaka.media.MetaSegmentIndex();
          await shaka.util.PeriodCombiner.extendOutputSegmentIndex_(
              outputStream, /* firstNewPeriodIndex= */ 0);
        }
      };
      // For T == Stream, we need to create all the per-period segment indexes
      // in advance.  concat() will add them to the output's MetaSegmentIndex.
    }

    if (!outputStream.matchedStreams || !outputStream.matchedStreams.length) {
      // This is not a stream we can build output from, but it may become part
      // of another output based on another period's stream.
      return null;
    }
    shaka.util.PeriodCombiner.extendOutputStream_(outputStream,
        /* firstNewPeriodIndex= */ 0, concat, unusedStreamsPerPeriod,
        /* periodsMissing= */ 0);

    return outputStream;
  }

  /**
   * @param {T} outputStream An existing output stream which needs to be
   *   extended into new periods.
   * @param {number} firstNewPeriodIndex An index into streamsPerPeriod which
   *   represents the first new period that hasn't been processed yet.
   * @param {function(T, T)} concat Concatenate the second stream onto the end
   *   of the first.
   * @param {!Array<!Set<T>>} unusedStreamsPerPeriod An array of sets of
   *   unused streams from each period.
   * @param {number} periodsMissing How many periods are missing in this update
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static extendOutputStream_(
      outputStream, firstNewPeriodIndex, concat, unusedStreamsPerPeriod,
      periodsMissing) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const LanguageUtils = shaka.util.LanguageUtils;
    const matches = outputStream.matchedStreams;

    // Assure the compiler that matches didn't become null during the async
    // operation before.
    goog.asserts.assert(outputStream.matchedStreams,
        'matchedStreams should be non-null');

    // Concatenate the new matches onto the stream, starting at the first new
    // period.
    const start = firstNewPeriodIndex + periodsMissing;
    for (let i = start; i < matches.length; i++) {
      const match = matches[i];
      concat(outputStream, match);

      // We only consider an audio stream "used" if its language is related to
      // the output language.  There are scenarios where we want to generate
      // separate tracks for each language, even when we are forced to connect
      // unrelated languages across periods.
      let used = true;
      if (outputStream.type == ContentType.AUDIO) {
        const relatedness = LanguageUtils.relatedness(
            outputStream.language, match.language);
        if (relatedness == 0) {
          used = false;
        }
      }

      if (used) {
        unusedStreamsPerPeriod[i - periodsMissing].delete(match);
        // Add the full mimetypes to the stream.
        if (match.fullMimeTypes) {
          for (const fullMimeType of match.fullMimeTypes.values()) {
            outputStream.fullMimeTypes.add(fullMimeType);
          }
        }
      }
    }
  }

  /**
   * Clone a Stream to make an output Stream for combining others across
   * periods.
   *
   * @param {shaka.extern.Stream} stream
   * @return {shaka.extern.Stream}
   * @private
   */
  static cloneStream_(stream) {
    const clone = /** @type {shaka.extern.Stream} */(Object.assign({}, stream));

    // These are wiped out now and rebuilt later from the various per-period
    // streams that match this output.
    clone.originalId = null;
    clone.createSegmentIndex = () => Promise.resolve();
    clone.closeSegmentIndex = () => {
      if (clone.segmentIndex) {
        clone.segmentIndex.release();
        clone.segmentIndex = null;
      }
      // Close the segment index of the matched streams.
      if (clone.matchedStreams) {
        for (const match of clone.matchedStreams) {
          if (match.segmentIndex) {
            match.segmentIndex.release();
            match.segmentIndex = null;
          }
        }
      }
    };

    // Clone roles array so this output stream can own it.
    clone.roles = clone.roles.slice();
    clone.segmentIndex = null;
    clone.emsgSchemeIdUris = [];
    clone.keyIds = new Set(stream.keyIds);
    clone.closedCaptions = stream.closedCaptions ?
      new Map(stream.closedCaptions) : null;
    clone.trickModeVideo = null;
    clone.dependencyStream = null;

    return clone;
  }

  /**
   * Clone a StreamDB to make an output stream for combining others across
   * periods.
   *
   * @param {shaka.extern.StreamDB} streamDb
   * @return {shaka.extern.StreamDB}
   * @private
   */
  static cloneStreamDB_(streamDb) {
    const clone = /** @type {shaka.extern.StreamDB} */(Object.assign(
        {}, streamDb));

    // Clone roles array so this output stream can own it.
    clone.roles = clone.roles.slice();
    // These are wiped out now and rebuilt later from the various per-period
    // streams that match this output.
    clone.keyIds = new Set(streamDb.keyIds);
    clone.segments = [];
    clone.variantIds = [];
    clone.closedCaptions = streamDb.closedCaptions ?
      new Map(streamDb.closedCaptions) : null;

    return clone;
  }

  /**
   * Combine the various fields of the input Stream into the output.
   *
   * @param {shaka.extern.Stream} output
   * @param {shaka.extern.Stream} input
   * @private
   */
  static concatenateStreams_(output, input) {
    // We keep the original stream's resolution, frame rate,
    // sample rate, and channel count to ensure that it's properly
    // matched with similar content in other periods further down
    // the line.

    // Combine arrays, keeping only the unique elements
    const combineArrays = (output, input) => {
      if (!output) {
        output = [];
      }
      for (const item of input) {
        if (!output.includes(item)) {
          output.push(item);
        }
      }
      return output;
    };
    output.roles = combineArrays(output.roles, input.roles);

    if (input.emsgSchemeIdUris) {
      output.emsgSchemeIdUris = combineArrays(
          output.emsgSchemeIdUris, input.emsgSchemeIdUris);
    }

    for (const keyId of input.keyIds) {
      output.keyIds.add(keyId);
    }

    if (output.originalId == null) {
      output.originalId = input.originalId;
    } else {
      const newOriginalId = (input.originalId || '');
      if (newOriginalId && !output.originalId.endsWith(newOriginalId)) {
        output.originalId += ',' + newOriginalId;
      }
    }

    const commonDrmInfos = shaka.drm.DrmUtils.getCommonDrmInfos(
        output.drmInfos, input.drmInfos);
    if (input.drmInfos.length && output.drmInfos.length &&
        !commonDrmInfos.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.INCONSISTENT_DRM_ACROSS_PERIODS);
    }
    output.drmInfos = commonDrmInfos;

    // The output is encrypted if any input was encrypted.
    output.encrypted = output.encrypted || input.encrypted;

    // Combine the closed captions maps.
    if (input.closedCaptions) {
      if (!output.closedCaptions) {
        output.closedCaptions = new Map();
      }
      for (const [key, value] of input.closedCaptions) {
        output.closedCaptions.set(key, value);
      }
    }

    // Prioritize the highest bandwidth
    if (output.bandwidth && input.bandwidth) {
      output.bandwidth = Math.max(output.bandwidth, input.bandwidth);
    }

    // Combine trick-play video streams, if present.
    if (input.trickModeVideo) {
      if (!output.trickModeVideo) {
        // Create a fresh output stream for trick-mode playback.
        output.trickModeVideo = shaka.util.PeriodCombiner.cloneStream_(
            input.trickModeVideo);
        output.trickModeVideo.matchedStreams = [];
        output.trickModeVideo.createSegmentIndex = () => {
          if (output.trickModeVideo.segmentIndex) {
            return Promise.resolve();
          }
          const segmentIndex = new shaka.media.MetaSegmentIndex();
          goog.asserts.assert(output.trickModeVideo.matchedStreams,
              'trickmode matched streams should exist');
          for (const stream of output.trickModeVideo.matchedStreams) {
            goog.asserts.assert(stream.segmentIndex,
                'trickmode segment index should exist');
            segmentIndex.appendSegmentIndex(stream.segmentIndex);
          }
          output.trickModeVideo.segmentIndex = segmentIndex;

          return Promise.resolve();
        };
      }

      // Concatenate the trick mode input onto the trick mode output.
      output.trickModeVideo.matchedStreams.push(input.trickModeVideo);
      shaka.util.PeriodCombiner.concatenateStreams_(
          output.trickModeVideo, input.trickModeVideo);
    } else if (output.trickModeVideo) {
      // We have a trick mode output, but no input from this Period.  Fill it in
      // from the standard input Stream.
      output.trickModeVideo.matchedStreams.push(input);
      shaka.util.PeriodCombiner.concatenateStreams_(
          output.trickModeVideo, input);
    }

    // Combine dependency streams, if present.
    if (input.dependencyStream) {
      if (!output.dependencyStream) {
        // Create a fresh output stream for trick-mode playback.
        output.dependencyStream = shaka.util.PeriodCombiner.cloneStream_(
            input.dependencyStream);
        output.dependencyStream.matchedStreams = [];
        output.dependencyStream.createSegmentIndex = () => {
          if (output.dependencyStream.segmentIndex) {
            return Promise.resolve();
          }
          const segmentIndex = new shaka.media.MetaSegmentIndex();
          goog.asserts.assert(output.dependencyStream.matchedStreams,
              'dependency video matched streams should exist');
          for (const stream of output.dependencyStream.matchedStreams) {
            goog.asserts.assert(stream.segmentIndex,
                'dependency video segment index should exist');
            segmentIndex.appendSegmentIndex(stream.segmentIndex);
          }
          output.dependencyStream.segmentIndex = segmentIndex;

          return Promise.resolve();
        };
      }

      // Concatenate the dependency input onto the dependency output.
      output.dependencyStream.matchedStreams.push(input.dependencyStream);
      shaka.util.PeriodCombiner.concatenateStreams_(
          output.dependencyStream, input.dependencyStream);
    } else if (output.dependencyStream) {
      // We have a dependency output, but no input from this Period.
      // Fill it in from the standard input Stream.
      output.dependencyStream.matchedStreams.push(input);
      shaka.util.PeriodCombiner.concatenateStreams_(
          output.dependencyStream, input);
    }
  }

  /**
   * Combine the various fields of the input StreamDB into the output.
   *
   * @param {shaka.extern.StreamDB} output
   * @param {shaka.extern.StreamDB} input
   * @private
   */
  static concatenateStreamDBs_(output, input) {
    // Combine arrays, keeping only the unique elements
    const combineArrays = (output, input) => {
      if (!output) {
        output = [];
      }
      for (const item of input) {
        if (!output.includes(item)) {
          output.push(item);
        }
      }
      return output;
    };
    output.roles = combineArrays(output.roles, input.roles);

    for (const keyId of input.keyIds) {
      output.keyIds.add(keyId);
    }

    // The output is encrypted if any input was encrypted.
    output.encrypted = output.encrypted && input.encrypted;

    // Concatenate segments without de-duping.
    output.segments.push(...input.segments);

    // Combine the closed captions maps.
    if (input.closedCaptions) {
      if (!output.closedCaptions) {
        output.closedCaptions = new Map();
      }
      for (const [key, value] of input.closedCaptions) {
        output.closedCaptions.set(key, value);
      }
    }
  }

  /**
   * Finds streams in all periods which match the output stream.
   *
   * @param {!Array<!Map<string, T>>} streamsPerPeriod
   * @param {T} outputStream
   * @param {boolean=} shouldAppend
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  findMatchesInAllPeriods_(streamsPerPeriod, outputStream,
      shouldAppend = false) {
    const matches = shouldAppend ? outputStream.matchedStreams : [];
    for (const streams of streamsPerPeriod) {
      const match = this.findBestMatchInPeriod_(streams, outputStream);
      if (!match) {
        return;
      }
      matches.push(match);
    }
    outputStream.matchedStreams = matches;
  }

  /**
   * Find the best match for the output stream.
   *
   * @param {!Map<string, T>} streams
   * @param {T} outputStream
   * @return {?T}  Returns null if no match can be found.
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  findBestMatchInPeriod_(streams, outputStream) {
    const getKey = {
      'audio': shaka.util.PeriodCombiner.generateAudioKey_,
      'video': shaka.util.PeriodCombiner.generateVideoKey_,
      'text': shaka.util.PeriodCombiner.generateTextKey_,
      'image': shaka.util.PeriodCombiner.generateImageKey_,
    }[outputStream.type];

    let best = null;
    const key = getKey(outputStream);
    if (streams.has(key)) {
      // We've found exact match by hashing.
      best = streams.get(key);
    } else {
      // We haven't found exact match, try to find the best one via
      // linear search.
      const areCompatible = {
        'audio': (os, s) => this.areAVStreamsCompatible_(os, s),
        'video': (os, s) => this.areAVStreamsCompatible_(os, s),
        'text': shaka.util.PeriodCombiner.areTextStreamsCompatible_,
        'image': shaka.util.PeriodCombiner.areImageStreamsCompatible_,
      }[outputStream.type];
      const isBetterMatch = {
        'audio': shaka.util.PeriodCombiner.isAudioStreamBetterMatch_,
        'video': shaka.util.PeriodCombiner.isVideoStreamBetterMatch_,
        'text': shaka.util.PeriodCombiner.isTextStreamBetterMatch_,
        'image': shaka.util.PeriodCombiner.isImageStreamBetterMatch_,
      }[outputStream.type];

      for (const stream of streams.values()) {
        if (!areCompatible(outputStream, stream)) {
          continue;
        }

        if (outputStream.fastSwitching != stream.fastSwitching) {
          continue;
        }

        if (!best || isBetterMatch(outputStream, best, stream)) {
          best = stream;
        }
      }
    }

    // Remove just found stream if configured to, so possible future linear
    // searches can be faster.
    if (this.useStreamOnce_ && !shaka.util.PeriodCombiner.isDummy_(best)) {
      streams.delete(getKey(best));
    }

    return best;
  }

  /**
   * @param {T} a
   * @param {T} b
   * @return {boolean}
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static areAVStreamsExactMatch_(a, b) {
    return a.mimeType === b.mimeType && a.codecs === b.codecs;
  }

  /**
   * @param {T} a
   * @param {T} b
   * @return {boolean}
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static areAVStreamsCodecsCompatible_(a, b) {
    if (a.mimeType != b.mimeType) {
      return false;
    }
    return shaka.util.PeriodCombiner.getCodec_(a.codecs) ===
        shaka.util.PeriodCombiner.getCodec_(b.codecs);
  }

  /**
   * @param {boolean} useOnce if true, stream will be used only once in period
   *   flattening algorithm.
   * @export
   */
  setUseStreamOnce(useOnce) {
    this.useStreamOnce_ = useOnce;
  }

  /**
   * @param {T} outputStream An audio or video output stream
   * @param {T} candidate A candidate stream to be combined with the output
   * @return {boolean} True if the candidate could be combined with the
   *   output stream
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  areAVStreamsCompatible_(outputStream, candidate) {
    // This field is only available on Stream, not StreamDB.
    if (outputStream.drmInfos) {
      // Check for compatible DRM systems.  Note that clear streams are
      // implicitly compatible with any DRM and with each other.
      if (!shaka.drm.DrmUtils.areDrmCompatible(outputStream.drmInfos,
          candidate.drmInfos)) {
        return false;
      }
    }

    return true;
  }

  /**
   * @param {T} outputStream A text output stream
   * @param {T} candidate A candidate stream to be combined with the output
   * @return {boolean} True if the candidate could be combined with the
   *   output
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static areTextStreamsCompatible_(outputStream, candidate) {
    const LanguageUtils = shaka.util.LanguageUtils;

    // For text, we don't care about MIME type or codec.  We can always switch
    // between text types.

    // If the candidate is a dummy, then it is compatible, and we could use it
    // if nothing else matches.
    if (!candidate.language) {
      return true;
    }

    // Forced subtitles should be treated as unique streams
    if (outputStream.forced !== candidate.forced) {
      return false;
    }

    const languageRelatedness = LanguageUtils.relatedness(
        outputStream.language, candidate.language);

    // We will strictly avoid combining text across languages or "kinds"
    // (caption vs subtitle).
    if (languageRelatedness == 0 ||
        candidate.kind != outputStream.kind) {
      return false;
    }

    return true;
  }

  /**
   * @param {T} outputStream A image output stream
   * @param {T} candidate A candidate stream to be combined with the output
   * @return {boolean} True if the candidate could be combined with the
   *   output
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static areImageStreamsCompatible_(outputStream, candidate) {
    // For image, we don't care about MIME type.  We can always switch
    // between image types.

    return true;
  }

  /**
   * @param {T} outputStream An audio output stream
   * @param {T} best The best match so far for this period
   * @param {T} candidate A candidate stream which might be better
   * @return {boolean} True if the candidate is a better match
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static isAudioStreamBetterMatch_(outputStream, best, candidate) {
    const LanguageUtils = shaka.util.LanguageUtils;
    const {BETTER, EQUAL, WORSE} = shaka.util.PeriodCombiner.BetterOrWorse;

    const codecsBetterOrWorse = shaka.util.PeriodCombiner.compareCodecs_(
        outputStream, best, candidate);
    if (codecsBetterOrWorse === BETTER) {
      return true;
    }
    if (codecsBetterOrWorse === WORSE) {
      return false;
    }

    // The most important thing is language.  In some cases, we will accept a
    // different language across periods when we must.
    const bestRelatedness = LanguageUtils.relatedness(
        outputStream.language, best.language);
    const candidateRelatedness = LanguageUtils.relatedness(
        outputStream.language, candidate.language);

    if (candidateRelatedness > bestRelatedness) {
      return true;
    }
    if (candidateRelatedness < bestRelatedness) {
      return false;
    }

    // If language-based differences haven't decided this, look at labels.
    // If available options differ, look does any matches with output stream.
    if (best.label !== candidate.label) {
      if (outputStream.label === best.label) {
        return false;
      }
      if (outputStream.label === candidate.label) {
        return true;
      }
    }

    // If label-based differences haven't decided this, look at roles.  If
    // the candidate has more roles in common with the output, upgrade to the
    // candidate.
    if (outputStream.roles.length) {
      const bestRoleMatches =
          best.roles.filter((role) => outputStream.roles.includes(role));
      const candidateRoleMatches =
          candidate.roles.filter((role) => outputStream.roles.includes(role));
      if (candidateRoleMatches.length > bestRoleMatches.length) {
        return true;
      } else if (candidateRoleMatches.length < bestRoleMatches.length) {
        return false;
      } else if (candidate.roles.length !== best.roles.length) {
        // Both streams have the same role overlap with the outputStream
        // If this is the case, choose the stream with the fewer roles overall.
        // Streams that match best together tend to be streams with the same
        // roles, e g stream1 with roles [r1, r2] is likely a better match
        // for stream2 with roles [r1, r2] vs stream3 with roles
        // [r1, r2, r3, r4].
        // If we match stream1 with stream3 due to the same role overlap,
        // stream2 is likely to be left unmatched and error out later.
        // See https://github.com/shaka-project/shaka-player/issues/2542 for
        // more details.
        return candidate.roles.length < best.roles.length;
      }
    } else if (!candidate.roles.length && best.roles.length) {
      // If outputStream has no roles, and only one of the streams has no roles,
      // choose the one with no roles.
      return true;
    } else if (candidate.roles.length && !best.roles.length) {
      return false;
    }

    // If the language doesn't match, but the candidate is the "primary"
    // language, then that should be preferred as a fallback.
    if (!best.primary && candidate.primary) {
      return true;
    }
    if (best.primary && !candidate.primary) {
      return false;
    }

    // If language-based and role-based features are equivalent, take the audio
    // with the closes channel count to the output.
    const channelsBetterOrWorse =
        shaka.util.PeriodCombiner.compareClosestPreferLower(
            outputStream.channelsCount,
            best.channelsCount,
            candidate.channelsCount);
    if (channelsBetterOrWorse == BETTER) {
      return true;
    } else if (channelsBetterOrWorse == WORSE) {
      return false;
    }

    // If channels are equal, take the closest sample rate to the output.
    const sampleRateBetterOrWorse =
        shaka.util.PeriodCombiner.compareClosestPreferLower(
            outputStream.audioSamplingRate,
            best.audioSamplingRate,
            candidate.audioSamplingRate);
    if (sampleRateBetterOrWorse == BETTER) {
      return true;
    } else if (sampleRateBetterOrWorse == WORSE) {
      return false;
    }

    if (outputStream.bandwidth) {
      // Take the audio with the closest bandwidth to the output.
      const bandwidthBetterOrWorse =
          shaka.util.PeriodCombiner.compareClosestPreferMinimalAbsDiff_(
              outputStream.bandwidth,
              best.bandwidth,
              candidate.bandwidth);
      if (bandwidthBetterOrWorse == BETTER) {
        return true;
      } else if (bandwidthBetterOrWorse == WORSE) {
        return false;
      }
    }

    // If the result of each comparison was inconclusive, default to false.
    return false;
  }

  /**
   * @param {T} outputStream A video output stream
   * @param {T} best The best match so far for this period
   * @param {T} candidate A candidate stream which might be better
   * @return {boolean} True if the candidate is a better match
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static isVideoStreamBetterMatch_(outputStream, best, candidate) {
    const {BETTER, EQUAL, WORSE} = shaka.util.PeriodCombiner.BetterOrWorse;

    const codecsBetterOrWorse = shaka.util.PeriodCombiner.compareCodecs_(
        outputStream, best, candidate);
    if (codecsBetterOrWorse === BETTER) {
      return true;
    }
    if (codecsBetterOrWorse === WORSE) {
      return false;
    }

    // Take the video with the closest resolution to the output.
    const resolutionBetterOrWorse =
        shaka.util.PeriodCombiner.compareClosestPreferLower(
            outputStream.width * outputStream.height,
            best.width * best.height,
            candidate.width * candidate.height);
    if (resolutionBetterOrWorse == BETTER) {
      return true;
    } else if (resolutionBetterOrWorse == WORSE) {
      return false;
    }

    // We may not know the frame rate for the content, in which case this gets
    // skipped.
    if (outputStream.frameRate) {
      // Take the video with the closest frame rate to the output.
      const frameRateBetterOrWorse =
          shaka.util.PeriodCombiner.compareClosestPreferLower(
              outputStream.frameRate,
              best.frameRate,
              candidate.frameRate);
      if (frameRateBetterOrWorse == BETTER) {
        return true;
      } else if (frameRateBetterOrWorse == WORSE) {
        return false;
      }
    }


    if (outputStream.bandwidth) {
      // Take the video with the closest bandwidth to the output.
      const bandwidthBetterOrWorse =
          shaka.util.PeriodCombiner.compareClosestPreferMinimalAbsDiff_(
              outputStream.bandwidth,
              best.bandwidth,
              candidate.bandwidth);
      if (bandwidthBetterOrWorse == BETTER) {
        return true;
      } else if (bandwidthBetterOrWorse == WORSE) {
        return false;
      }
    }

    // If the result of each comparison was inconclusive, default to false.
    return false;
  }

  /**
   * @param {T} outputStream A text output stream
   * @param {T} best The best match so far for this period
   * @param {T} candidate A candidate stream which might be better
   * @return {boolean} True if the candidate is a better match
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static isTextStreamBetterMatch_(outputStream, best, candidate) {
    const LanguageUtils = shaka.util.LanguageUtils;

    // The most important thing is language.  In some cases, we will accept a
    // different language across periods when we must.
    const bestRelatedness = LanguageUtils.relatedness(
        outputStream.language, best.language);
    const candidateRelatedness = LanguageUtils.relatedness(
        outputStream.language, candidate.language);

    if (candidateRelatedness > bestRelatedness) {
      return true;
    }
    if (candidateRelatedness < bestRelatedness) {
      return false;
    }

    // If the language doesn't match, but the candidate is the "primary"
    // language, then that should be preferred as a fallback.
    if (!best.primary && candidate.primary) {
      return true;
    }
    if (best.primary && !candidate.primary) {
      return false;
    }

    // If language-based differences haven't decided this, look at labels.
    // If available options differ, look does any matches with output stream.
    if (best.label !== candidate.label) {
      if (outputStream.label === best.label) {
        return false;
      }
      if (outputStream.label === candidate.label) {
        return true;
      }
    }

    // If the candidate has more roles in common with the output, upgrade to the
    // candidate.
    if (outputStream.roles.length) {
      const bestRoleMatches =
          best.roles.filter((role) => outputStream.roles.includes(role));
      const candidateRoleMatches =
          candidate.roles.filter((role) => outputStream.roles.includes(role));
      if (candidateRoleMatches.length > bestRoleMatches.length) {
        return true;
      }
      if (candidateRoleMatches.length < bestRoleMatches.length) {
        return false;
      }
    } else if (!candidate.roles.length && best.roles.length) {
      // If outputStream has no roles, and only one of the streams has no roles,
      // choose the one with no roles.
      return true;
    } else if (candidate.roles.length && !best.roles.length) {
      return false;
    }

    // If the candidate has the same MIME type and codec, upgrade to the
    // candidate.  It's not required that text streams use the same format
    // across periods, but it's a helpful signal.  Some content in our demo app
    // contains the same languages repeated with two different text formats in
    // each period.  This condition ensures that all text streams are used.
    // Otherwise, we wind up with some one stream of each language left unused,
    // triggering a failure.
    if (candidate.mimeType == outputStream.mimeType &&
        candidate.codecs == outputStream.codecs &&
        (best.mimeType != outputStream.mimeType ||
         best.codecs != outputStream.codecs)) {
      return true;
    }

    // If the result of each comparison was inconclusive, default to false.
    return false;
  }

  /**
   * @param {T} outputStream A image output stream
   * @param {T} best The best match so far for this period
   * @param {T} candidate A candidate stream which might be better
   * @return {boolean} True if the candidate is a better match
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static isImageStreamBetterMatch_(outputStream, best, candidate) {
    const {BETTER, EQUAL, WORSE} = shaka.util.PeriodCombiner.BetterOrWorse;

    // Take the image with the closest resolution to the output.
    const resolutionBetterOrWorse =
        shaka.util.PeriodCombiner.compareClosestPreferLower(
            outputStream.width * outputStream.height,
            best.width * best.height,
            candidate.width * candidate.height);
    if (resolutionBetterOrWorse == BETTER) {
      return true;
    } else if (resolutionBetterOrWorse == WORSE) {
      return false;
    }

    // If the result of each comparison was inconclusive, default to false.
    return false;
  }

  /**
   * Create a dummy StreamDB to fill in periods that are missing a certain type,
   * to avoid failing the general flattening algorithm.  This won't be used for
   * audio or video, since those are strictly required in all periods if they
   * exist in any period.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} type
   * @return {shaka.extern.StreamDB}
   * @private
   */
  static dummyStreamDB_(type) {
    return {
      id: 0,
      originalId: '',
      groupId: null,
      primary: false,
      type,
      mimeType: '',
      codecs: '',
      language: '',
      originalLanguage: null,
      label: null,
      width: null,
      height: null,
      encrypted: false,
      keyIds: new Set(),
      segments: [],
      variantIds: [],
      roles: [],
      forced: false,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
      external: false,
      fastSwitching: false,
      isAudioMuxedInVideo: false,
      baseOriginalId: null,
    };
  }

  /**
   * Create a dummy Stream to fill in periods that are missing a certain type,
   * to avoid failing the general flattening algorithm.  This won't be used for
   * audio or video, since those are strictly required in all periods if they
   * exist in any period.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} type
   * @return {shaka.extern.Stream}
   * @private
   */
  static dummyStream_(type) {
    return {
      id: 0,
      originalId: '',
      groupId: null,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex: new shaka.media.SegmentIndex([]),
      mimeType: '',
      codecs: '',
      encrypted: false,
      drmInfos: [],
      keyIds: new Set(),
      language: '',
      originalLanguage: null,
      label: null,
      type,
      primary: false,
      trickModeVideo: null,
      dependencyStream: null,
      emsgSchemeIdUris: null,
      roles: [],
      forced: false,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
      accessibilityPurpose: null,
      external: false,
      fastSwitching: false,
      fullMimeTypes: new Set(),
      isAudioMuxedInVideo: false,
      baseOriginalId: null,
    };
  }

  /**
   * Compare the best value so far with the candidate value and the output
   * value.  Decide if the candidate is better, equal, or worse than the best
   * so far.  Any value less than or equal to the output is preferred over a
   * larger value, and closer to the output is better than farther.
   *
   * This provides us a generic way to choose things that should match as
   * closely as possible, like resolution, frame rate, audio channels, or
   * sample rate.  If we have to go higher to make a match, we will.  But if
   * the user selects 480p, for example, we don't want to surprise them with
   * 720p and waste bandwidth if there's another choice available to us.
   *
   * @param {number} outputValue
   * @param {number} bestValue
   * @param {number} candidateValue
   * @return {shaka.util.PeriodCombiner.BetterOrWorse}
   */
  static compareClosestPreferLower(outputValue, bestValue, candidateValue) {
    const {BETTER, EQUAL, WORSE} = shaka.util.PeriodCombiner.BetterOrWorse;

    // If one is the exact match for the output value, and the other isn't,
    // prefer the one that is the exact match.
    if (bestValue == outputValue && outputValue != candidateValue) {
      return WORSE;
    } else if (candidateValue == outputValue && outputValue != bestValue) {
      return BETTER;
    }

    if (bestValue > outputValue) {
      if (candidateValue <= outputValue) {
        // Any smaller-or-equal-to-output value is preferable to a
        // bigger-than-output value.
        return BETTER;
      }

      // Both "best" and "candidate" are greater than the output.  Take
      // whichever is closer.
      if (candidateValue - outputValue < bestValue - outputValue) {
        return BETTER;
      } else if (candidateValue - outputValue > bestValue - outputValue) {
        return WORSE;
      }
    } else {
      // The "best" so far is less than or equal to the output.  If the
      // candidate is bigger than the output, we don't want it.
      if (candidateValue > outputValue) {
        return WORSE;
      }

      // Both "best" and "candidate" are less than or equal to the output.
      // Take whichever is closer.
      if (outputValue - candidateValue < outputValue - bestValue) {
        return BETTER;
      } else if (outputValue - candidateValue > outputValue - bestValue) {
        return WORSE;
      }
    }

    return EQUAL;
  }

  /**
   * @param {T} outputValue
   * @param {T} bestValue
   * @param {T} candidateValue
   * @return {shaka.util.PeriodCombiner.BetterOrWorse}
   * @template T
   * Accepts either a StreamDB or Stream type.
   * @private
   */
  static compareCodecs_(outputValue, bestValue, candidateValue) {
    const {BETTER, EQUAL, WORSE} = shaka.util.PeriodCombiner.BetterOrWorse;
    // An exact match is better than a non-exact match.
    const bestIsExact = shaka.util.PeriodCombiner.areAVStreamsExactMatch_(
        outputValue, bestValue);
    const candidateIsExact = shaka.util.PeriodCombiner.areAVStreamsExactMatch_(
        outputValue, candidateValue);
    if (bestIsExact && !candidateIsExact) {
      return WORSE;
    }
    if (!bestIsExact && candidateIsExact) {
      return BETTER;
    }

    // A compatible match is better than a non-compatible match.
    const bestIsCompatible =
        shaka.util.PeriodCombiner.areAVStreamsCodecsCompatible_(
            outputValue, bestValue);
    const candidateIsCompatible =
        shaka.util.PeriodCombiner.areAVStreamsCodecsCompatible_(
            outputValue, candidateValue);
    if (bestIsCompatible && !candidateIsCompatible) {
      return WORSE;
    }
    if (!bestIsCompatible && candidateIsCompatible) {
      return BETTER;
    }

    return EQUAL;
  }

  /**
   * @param {number} outputValue
   * @param {number} bestValue
   * @param {number} candidateValue
   * @return {shaka.util.PeriodCombiner.BetterOrWorse}
   * @private
   */
  static compareClosestPreferMinimalAbsDiff_(
      outputValue, bestValue, candidateValue) {
    const {BETTER, EQUAL, WORSE} = shaka.util.PeriodCombiner.BetterOrWorse;

    const absDiffBest = Math.abs(outputValue - bestValue);
    const absDiffCandidate = Math.abs(outputValue - candidateValue);
    if (absDiffCandidate < absDiffBest) {
      return BETTER;
    } else if (absDiffBest < absDiffCandidate) {
      return WORSE;
    }

    return EQUAL;
  }

  /**
   * @param {T} stream
   * @return {boolean}
   * @template T
   * Accepts either a StreamDB or Stream type.
   * @private
   */
  static isDummy_(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    switch (stream.type) {
      case ContentType.TEXT:
        return !stream.language;
      case ContentType.IMAGE:
        return !stream.tilesLayout;
      default:
        return false;
    }
  }

  /**
   * @param {T} v
   * @return {string}
   * @template T
   * Accepts either a StreamDB or Stream type.
   * @private
   */
  static generateVideoKey_(v) {
    return shaka.util.PeriodCombiner.generateKey_([
      v.fastSwitching,
      v.width,
      v.frameRate,
      v.codecs,
      v.mimeType,
      v.label,
      v.roles,
      v.closedCaptions ? Array.from(v.closedCaptions.entries()) : null,
      v.bandwidth,
      v.dependencyStream ? v.dependencyStream.baseOriginalId : null,
      Array.from(v.keyIds),
    ]);
  }

  /**
   * @param {T} a
   * @return {string}
   * @template T
   * Accepts either a StreamDB or Stream type.
   * @private
   */
  static generateAudioKey_(a) {
    return shaka.util.PeriodCombiner.generateKey_([
      a.fastSwitching,
      a.channelsCount,
      a.language,
      a.bandwidth,
      a.label,
      a.codecs,
      a.mimeType,
      a.roles,
      a.audioSamplingRate,
      a.primary,
      a.dependencyStream ? a.dependencyStream.baseOriginalId : null,
      Array.from(a.keyIds),
    ]);
  }

  /**
   * @param {T} t
   * @return {string}
   * @template T
   * Accepts either a StreamDB or Stream type.
   * @private
   */
  static generateTextKey_(t) {
    return shaka.util.PeriodCombiner.generateKey_([
      t.language,
      t.label,
      t.codecs,
      t.mimeType,
      t.bandwidth,
      t.roles,
    ]);
  }

  /**
   * @param {T} i
   * @return {string}
   * @template T
   * Accepts either a StreamDB or Stream type.
   * @private
   */
  static generateImageKey_(i) {
    return shaka.util.PeriodCombiner.generateKey_([
      i.width,
      i.codecs,
      i.mimeType,
    ]);
  }

  /**
   * @param {!Array<*>} values
   * @return {string}
   * @private
   */
  static generateKey_(values) {
    return JSON.stringify(values);
  }

  /**
   * @param {string} codecs
   * @return {string}
   * @private
   */
  static getCodec_(codecs) {
    if (!shaka.util.PeriodCombiner.memoizedCodecs.has(codecs)) {
      const normalizedCodec = shaka.util.MimeUtils.getNormalizedCodec(codecs);
      shaka.util.PeriodCombiner.memoizedCodecs.set(codecs, normalizedCodec);
    }
    return shaka.util.PeriodCombiner.memoizedCodecs.get(codecs);
  }
};

/**
 * @enum {number}
 */
shaka.util.PeriodCombiner.BetterOrWorse = {
  BETTER: 1,
  EQUAL: 0,
  WORSE: -1,
};

/**
 * @private {Map<string, string>}
 */
shaka.util.PeriodCombiner.memoizedCodecs = new Map();
