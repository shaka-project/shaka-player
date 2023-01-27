/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.PeriodCombiner');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.MetaSegmentIndex');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.MimeUtils');

/**
 * A utility to combine streams across periods.
 *
 * @implements {shaka.util.IReleasable}
 * @final
 */
shaka.util.PeriodCombiner = class {
  /** */
  constructor() {
    /** @private {!Array.<shaka.extern.Variant>} */
    this.variants_ = [];

    /** @private {!Array.<shaka.extern.Stream>} */
    this.audioStreams_ = [];

    /** @private {!Array.<shaka.extern.Stream>} */
    this.videoStreams_ = [];

    /** @private {!Array.<shaka.extern.Stream>} */
    this.textStreams_ = [];

    /** @private {!Array.<shaka.extern.Stream>} */
    this.imageStreams_ = [];

    /**
     * The IDs of the periods we have already used to generate streams.
     * This helps us identify the periods which have been added when a live
     * stream is updated.
     *
     * @private {!Set.<string>}
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
  }

  /** @return {!Array.<shaka.extern.Variant>} */
  getVariants() {
    return this.variants_;
  }

  /** @return {!Array.<shaka.extern.Stream>} */
  getTextStreams() {
    // Return a copy of the array because makeTextStreamsForClosedCaptions
    // may make changes to the contents of the array. Those changes should not
    // propagate back to the PeriodCombiner.
    return this.textStreams_.slice();
  }

  /** @return {!Array.<shaka.extern.Stream>} */
  getImageStreams() {
    return this.imageStreams_;
  }

  /**
   * @param {!Array.<shaka.util.PeriodCombiner.Period>} periods
   * @param {boolean} isDynamic
   * @return {!Promise}
   */
  async combinePeriods(periods, isDynamic) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    shaka.util.PeriodCombiner.filterOutAudioStreamDuplicates_(periods);
    shaka.util.PeriodCombiner.filterOutVideoStreamDuplicates_(periods);
    shaka.util.PeriodCombiner.filterOutTextStreamDuplicates_(periods);
    shaka.util.PeriodCombiner.filterOutImageStreamDuplicates_(periods);

    // Optimization: for single-period VOD, do nothing.  This makes sure
    // single-period DASH content will be 100% accurately represented in the
    // output.
    if (!isDynamic && periods.length == 1) {
      const firstPeriod = periods[0];
      this.audioStreams_ = firstPeriod.audioStreams;
      this.videoStreams_ = firstPeriod.videoStreams;
      this.textStreams_ = firstPeriod.textStreams;
      this.imageStreams_ = firstPeriod.imageStreams;
    } else {
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

      const audioStreamsPerPeriod = periods.map(
          (period) => period.audioStreams);
      const videoStreamsPerPeriod = periods.map(
          (period) => period.videoStreams);
      const textStreamsPerPeriod = periods.map(
          (period) => period.textStreams);
      const imageStreamsPerPeriod = periods.map(
          (period) => period.imageStreams);

      // It's okay to have a period with no text or images, but our algorithm
      // fails on any period without matching streams.  So we add dummy streams
      // to each period.  Since we combine text streams by language and image
      // streams by resolution, we might need a dummy even in periods with these
      // streams already.
      for (const textStreams of textStreamsPerPeriod) {
        textStreams.push(shaka.util.PeriodCombiner.dummyStream_(
            ContentType.TEXT));
      }
      for (const imageStreams of imageStreamsPerPeriod) {
        imageStreams.push(shaka.util.PeriodCombiner.dummyStream_(
            ContentType.IMAGE));
      }

      await shaka.util.PeriodCombiner.combine_(
          this.audioStreams_,
          audioStreamsPerPeriod,
          firstNewPeriodIndex,
          shaka.util.PeriodCombiner.cloneStream_,
          shaka.util.PeriodCombiner.concatenateStreams_);

      await shaka.util.PeriodCombiner.combine_(
          this.videoStreams_,
          videoStreamsPerPeriod,
          firstNewPeriodIndex,
          shaka.util.PeriodCombiner.cloneStream_,
          shaka.util.PeriodCombiner.concatenateStreams_);

      await shaka.util.PeriodCombiner.combine_(
          this.textStreams_,
          textStreamsPerPeriod,
          firstNewPeriodIndex,
          shaka.util.PeriodCombiner.cloneStream_,
          shaka.util.PeriodCombiner.concatenateStreams_);

      await shaka.util.PeriodCombiner.combine_(
          this.imageStreams_,
          imageStreamsPerPeriod,
          firstNewPeriodIndex,
          shaka.util.PeriodCombiner.cloneStream_,
          shaka.util.PeriodCombiner.concatenateStreams_);
    }

    // Create variants for all audio/video combinations.
    let nextVariantId = 0;
    const variants = [];
    if (!this.videoStreams_.length || !this.audioStreams_.length) {
      // For audio-only or video-only content, just give each stream its own
      // variant.
      const streams = this.videoStreams_.concat(this.audioStreams_);
      for (const stream of streams) {
        const id = nextVariantId++;
        variants.push({
          id,
          language: stream.language,
          primary: stream.primary,
          audio: stream.type == ContentType.AUDIO ? stream : null,
          video: stream.type == ContentType.VIDEO ? stream : null,
          bandwidth: stream.bandwidth || 0,
          drmInfos: stream.drmInfos,
          allowedByApplication: true,
          allowedByKeySystem: true,
          decodingInfos: [],
        });
      }
    } else {
      for (const audio of this.audioStreams_) {
        for (const video of this.videoStreams_) {
          const commonDrmInfos = shaka.media.DrmEngine.getCommonDrmInfos(
              audio.drmInfos, video.drmInfos);

          if (audio.drmInfos.length && video.drmInfos.length &&
              !commonDrmInfos.length) {
            shaka.log.warning(
                'Incompatible DRM in audio & video, skipping variant creation.',
                audio, video);
            continue;
          }

          const id = nextVariantId++;
          variants.push({
            id,
            language: audio.language,
            primary: audio.primary,
            audio,
            video,
            bandwidth: (audio.bandwidth || 0) + (video.bandwidth || 0),
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
   * @param {!Array.<shaka.util.PeriodCombiner.Period>} periods
   * @private
   */
  static filterOutAudioStreamDuplicates_(periods) {
    const ArrayUtils = shaka.util.ArrayUtils;
    // Two audio streams are considered to be duplicates of
    // one another if their ids are different, but all the other
    // information is the same.
    for (const period of periods) {
      const filteredAudios = [];
      for (const a1 of period.audioStreams) {
        let duplicate = false;
        for (const a2 of filteredAudios) {
          if (a1.id != a2.id &&
              a1.channelsCount == a2.channelsCount &&
              a1.language == a2.language &&
              a1.bandwidth == a2.bandwidth &&
              a1.label == a2.label &&
              a1.codecs == a2.codecs &&
              a1.mimeType == a2.mimeType &&
              ArrayUtils.hasSameElements(a1.roles, a2.roles) &&
              a1.audioSamplingRate == a2.audioSamplingRate &&
              a1.primary == a2.primary) {
            duplicate = true;
          }
        }

        if (!duplicate) {
          filteredAudios.push(a1);
        }
      }

      period.audioStreams = filteredAudios;
    }
  }

  /**
   * @param {!Array.<shaka.util.PeriodCombiner.Period>} periods
   * @private
   */
  static filterOutTextStreamDuplicates_(periods) {
    const ArrayUtils = shaka.util.ArrayUtils;
    // Two text streams are considered to be duplicates of
    // one another if their ids are different, but all the other
    // information is the same.
    for (const period of periods) {
      const filteredTexts = [];
      for (const t1 of period.textStreams) {
        let duplicate = false;
        for (const t2 of filteredTexts) {
          if (t1.id != t2.id &&
            t1.language == t2.language &&
            t1.label == t2.label &&
            t1.codecs == t2.codecs &&
            t1.mimeType == t2.mimeType &&
            t1.bandwidth == t2.bandwidth &&
            ArrayUtils.hasSameElements(t1.roles, t2.roles)) {
            duplicate = true;
          }
        }

        if (!duplicate) {
          filteredTexts.push(t1);
        }
      }

      period.textStreams = filteredTexts;
    }
  }

  /**
   * @param {!Array.<shaka.util.PeriodCombiner.Period>} periods
   * @private
   */
  static filterOutVideoStreamDuplicates_(periods) {
    const ArrayUtils = shaka.util.ArrayUtils;
    const MapUtils = shaka.util.MapUtils;
    // Two video streams are considered to be duplicates of
    // one another if their ids are different, but all the other
    // information is the same.
    for (const period of periods) {
      const filteredVideos = [];
      for (const v1 of period.videoStreams) {
        let duplicate = false;
        for (const v2 of filteredVideos) {
          if (v1.id != v2.id &&
              v1.width == v2.width &&
              v1.frameRate == v2.frameRate &&
              v1.codecs == v2.codecs &&
              v1.mimeType == v2.mimeType &&
              v1.label == v2.label &&
              ArrayUtils.hasSameElements(v1.roles, v2.roles) &&
              MapUtils.hasSameElements(v1.closedCaptions, v2.closedCaptions) &&
              v1.bandwidth == v2.bandwidth) {
            duplicate = true;
          }
        }

        if (!duplicate) {
          filteredVideos.push(v1);
        }
      }

      period.videoStreams = filteredVideos;
    }
  }

  /**
   * @param {!Array.<shaka.util.PeriodCombiner.Period>} periods
   * @private
   */
  static filterOutImageStreamDuplicates_(periods) {
    // Two image streams are considered to be duplicates of
    // one another if their ids are different, but all the other
    // information is the same.
    for (const period of periods) {
      const filteredImages = [];
      for (const i1 of period.imageStreams) {
        let duplicate = false;
        for (const i2 of filteredImages) {
          if (i1.id != i2.id &&
              i1.width == i2.width &&
              i1.codecs == i2.codecs &&
              i1.mimeType == i2.mimeType) {
            duplicate = true;
          }
        }

        if (!duplicate) {
          filteredImages.push(i1);
        }
      }

      period.imageStreams = filteredImages;
    }
  }

  /**
   * Stitch together DB streams across periods, taking a mix of stream types.
   * The offline database does not separate these by type.
   *
   * Unlike the DASH case, this does not need to maintain any state for manifest
   * updates.
   *
   * @param {!Array.<!Array.<shaka.extern.StreamDB>>} streamDbsPerPeriod
   * @return {!Promise.<!Array.<shaka.extern.StreamDB>>}
   */
  static async combineDbStreams(streamDbsPerPeriod) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    // Optimization: for single-period content, do nothing.  This makes sure
    // single-period DASH or any HLS content stored offline will be 100%
    // accurately represented in the output.
    if (streamDbsPerPeriod.length == 1) {
      return streamDbsPerPeriod[0];
    }

    const audioStreamDbsPerPeriod = streamDbsPerPeriod.map(
        (streams) => streams.filter((s) => s.type == ContentType.AUDIO));
    const videoStreamDbsPerPeriod = streamDbsPerPeriod.map(
        (streams) => streams.filter((s) => s.type == ContentType.VIDEO));
    const textStreamDbsPerPeriod = streamDbsPerPeriod.map(
        (streams) => streams.filter((s) => s.type == ContentType.TEXT));
    const imageStreamDbsPerPeriod = streamDbsPerPeriod.map(
        (streams) => streams.filter((s) => s.type == ContentType.IMAGE));

    // It's okay to have a period with no text or images, but our algorithm
    // fails on any period without matching streams.  So we add dummy streams to
    // each period.  Since we combine text streams by language and image streams
    // by resolution, we might need a dummy even in periods with these streams
    // already.
    for (const textStreams of textStreamDbsPerPeriod) {
      textStreams.push(shaka.util.PeriodCombiner.dummyStreamDB_(
          ContentType.TEXT));
    }
    for (const imageStreams of imageStreamDbsPerPeriod) {
      imageStreams.push(shaka.util.PeriodCombiner.dummyStreamDB_(
          ContentType.IMAGE));
    }

    const combinedAudioStreamDbs = await shaka.util.PeriodCombiner.combine_(
        /* outputStreams= */ [],
        audioStreamDbsPerPeriod,
        /* firstNewPeriodIndex= */ 0,
        shaka.util.PeriodCombiner.cloneStreamDB_,
        shaka.util.PeriodCombiner.concatenateStreamDBs_);

    const combinedVideoStreamDbs = await shaka.util.PeriodCombiner.combine_(
        /* outputStreams= */ [],
        videoStreamDbsPerPeriod,
        /* firstNewPeriodIndex= */ 0,
        shaka.util.PeriodCombiner.cloneStreamDB_,
        shaka.util.PeriodCombiner.concatenateStreamDBs_);

    const combinedTextStreamDbs = await shaka.util.PeriodCombiner.combine_(
        /* outputStreams= */ [],
        textStreamDbsPerPeriod,
        /* firstNewPeriodIndex= */ 0,
        shaka.util.PeriodCombiner.cloneStreamDB_,
        shaka.util.PeriodCombiner.concatenateStreamDBs_);

    const combinedImageStreamDbs = await shaka.util.PeriodCombiner.combine_(
        /* outputStreams= */ [],
        imageStreamDbsPerPeriod,
        /* firstNewPeriodIndex= */ 0,
        shaka.util.PeriodCombiner.cloneStreamDB_,
        shaka.util.PeriodCombiner.concatenateStreamDBs_);

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
   * @param {!Array.<T>} outputStreams A list of existing output streams, to
   *   facilitate updates for live DASH content.  Will be modified and returned.
   * @param {!Array.<!Array.<T>>} streamsPerPeriod A list of lists of Streams
   *   from each period.
   * @param {number} firstNewPeriodIndex An index into streamsPerPeriod which
   *   represents the first new period that hasn't been processed yet.
   * @param {function(T):T} clone Make a clone of an input stream.
   * @param {function(T, T)} concat Concatenate the second stream onto the end
   *   of the first.
   *
   * @return {!Promise.<!Array.<T>>} The same array passed to outputStreams,
   *   modified to include any newly-created streams.
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static async combine_(
      outputStreams, streamsPerPeriod, firstNewPeriodIndex, clone, concat) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const unusedStreamsPerPeriod = [];
    for (let i = 0; i < streamsPerPeriod.length; i++) {
      if (i >= firstNewPeriodIndex) {
        // This periods streams are all new.
        unusedStreamsPerPeriod.push(new Set(streamsPerPeriod[i]));
      } else {
        // This period's streams have all been used already.
        unusedStreamsPerPeriod.push(new Set());
      }
    }

    // First, extend all existing output Streams into the new periods.
    for (const outputStream of outputStreams) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await shaka.util.PeriodCombiner.extendExistingOutputStream_(
          outputStream, streamsPerPeriod, firstNewPeriodIndex, concat,
          unusedStreamsPerPeriod);
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
        const outputStream =
            shaka.util.PeriodCombiner.createNewOutputStream_(
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
        const isDummyText = stream.type == ContentType.TEXT && !stream.language;
        const isDummyImage = stream.type == ContentType.IMAGE &&
            !stream.tilesLayout;
        if (isDummyText || isDummyImage) {
          // This is one of our dummy streams, so ignore it.  We may not use
          // them all, and that's fine.
          continue;
        }
        // If this stream has a different codec/MIME than any other stream,
        // then we can't play it.
        // TODO(#1528): Consider changing this when we support codec switching.
        const hasCodec = outputStreams.some((s) => {
          return s.mimeType == stream.mimeType &&
                shaka.util.MimeUtils.getNormalizedCodec(s.codecs) ==
                    shaka.util.MimeUtils.getNormalizedCodec(stream.codecs);
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
   * @param {!Array.<!Array.<T>>} streamsPerPeriod A list of lists of Streams
   *   from each period.
   * @param {number} firstNewPeriodIndex An index into streamsPerPeriod which
   *   represents the first new period that hasn't been processed yet.
   * @param {function(T, T)} concat Concatenate the second stream onto the end
   *   of the first.
   * @param {!Array.<!Set.<T>>} unusedStreamsPerPeriod An array of sets of
   *   unused streams from each period.
   *
   * @return {!Promise.<boolean>}
   *
   * @template T
   * Should only be called with a Stream type in practice, but has call sites
   * from other templated functions that also accept a StreamDB.
   *
   * @private
   */
  static async extendExistingOutputStream_(
      outputStream, streamsPerPeriod, firstNewPeriodIndex, concat,
      unusedStreamsPerPeriod) {
    shaka.util.PeriodCombiner.findMatchesInAllPeriods_(streamsPerPeriod,
        outputStream);

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
          firstNewPeriodIndex);
    }

    shaka.util.PeriodCombiner.extendOutputStream_(outputStream,
        firstNewPeriodIndex, concat, unusedStreamsPerPeriod);
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

    for (const stream of streams) {
      operations.push(stream.createSegmentIndex());
      if (stream.trickModeVideo && !stream.trickModeVideo.segmentIndex) {
        operations.push(stream.trickModeVideo.createSegmentIndex());
      }
    }
    await Promise.all(operations);

    // Concatenate the new matches onto the stream, starting at the first new
    // period.
    // Satisfy the compiler about the type.
    // Also checks if the segmentIndex is still valid after the async
    // operations, to make sure we stop if the active stream has changed.
    if (outputStream.segmentIndex instanceof shaka.media.MetaSegmentIndex) {
      for (let i = 0; i < streams.length; i++) {
        const match = streams[i];
        if (match.segmentIndex && i >= firstNewPeriodIndex) {
          goog.asserts.assert(match.segmentIndex,
              'stream should have a segmentIndex.');
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
   * @param {!Array.<!Array.<T>>} streamsPerPeriod A list of lists of Streams
   *   from each period.
   * @param {function(T):T} clone Make a clone of an input stream.
   * @param {function(T, T)} concat Concatenate the second stream onto the end
   *   of the first.
   * @param {!Array.<!Set.<T>>} unusedStreamsPerPeriod An array of sets of
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
  static createNewOutputStream_(
      stream, streamsPerPeriod, clone, concat, unusedStreamsPerPeriod) {
    // Start by cloning the stream without segments, key IDs, etc.
    const outputStream = clone(stream);

    // Find best-matching streams in all periods.
    shaka.util.PeriodCombiner.findMatchesInAllPeriods_(streamsPerPeriod,
        outputStream);

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

    if (!outputStream.matchedStreams) {
      // This is not a stream we can build output from, but it may become part
      // of another output based on another period's stream.
      return null;
    }
    shaka.util.PeriodCombiner.extendOutputStream_(outputStream,
        /* firstNewPeriodIndex= */ 0, concat, unusedStreamsPerPeriod);

    return outputStream;
  }

  /**
   * @param {T} outputStream An existing output stream which needs to be
   *   extended into new periods.
   * @param {number} firstNewPeriodIndex An index into streamsPerPeriod which
   *   represents the first new period that hasn't been processed yet.
   * @param {function(T, T)} concat Concatenate the second stream onto the end
   *   of the first.
   * @param {!Array.<!Set.<T>>} unusedStreamsPerPeriod An array of sets of
   *   unused streams from each period.
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static extendOutputStream_(
      outputStream, firstNewPeriodIndex, concat, unusedStreamsPerPeriod) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const LanguageUtils = shaka.util.LanguageUtils;
    const matches = outputStream.matchedStreams;

    // Assure the compiler that matches didn't become null during the async
    // operation before.
    goog.asserts.assert(outputStream.matchedStreams,
        'matchedStreams should be non-null');

    // Concatenate the new matches onto the stream, starting at the first new
    // period.
    for (let i = 0; i < matches.length; i++) {
      if (i >= firstNewPeriodIndex) {
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
          unusedStreamsPerPeriod[i].delete(match);
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

    clone.segmentIndex = null;
    clone.emsgSchemeIdUris = [];
    clone.keyIds = new Set();
    clone.closedCaptions = null;
    clone.trickModeVideo = null;

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

    // These are wiped out now and rebuilt later from the various per-period
    // streams that match this output.
    clone.keyIds = new Set();
    clone.segments = [];
    clone.variantIds = [];
    clone.closedCaptions = null;

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
    // We keep the original stream's bandwidth, resolution, frame rate,
    // sample rate, and channel count to ensure that it's properly
    // matched with similar content in other periods further down
    // the line.

    // Combine arrays, keeping only the unique elements
    const combineArrays = (a, b) => Array.from(new Set(a.concat(b)));
    output.roles = combineArrays(output.roles, input.roles);

    if (input.emsgSchemeIdUris) {
      output.emsgSchemeIdUris = combineArrays(
          output.emsgSchemeIdUris, input.emsgSchemeIdUris);
    }

    const combineSets = (a, b) => new Set([...a, ...b]);
    output.keyIds = combineSets(output.keyIds, input.keyIds);

    if (output.originalId == null) {
      output.originalId = input.originalId;
    } else {
      output.originalId += ',' + (input.originalId || '');
    }

    const commonDrmInfos = shaka.media.DrmEngine.getCommonDrmInfos(
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

    // Combine trick-play video streams, if present.
    if (input.trickModeVideo) {
      if (!output.trickModeVideo) {
        // Create a fresh output stream for trick-mode playback.
        output.trickModeVideo = shaka.util.PeriodCombiner.cloneStream_(
            input.trickModeVideo);
        // TODO: fix the createSegmentIndex function for trickModeVideo.
        // The trick-mode tracks in multi-period content should have trick-mode
        // segment indexes whenever available, rather than only regular-mode
        // segment indexes.
        output.trickModeVideo.createSegmentIndex = () => {
          // Satisfy the compiler about the type.
          goog.asserts.assert(
              output.segmentIndex instanceof shaka.media.MetaSegmentIndex,
              'The stream should have a MetaSegmentIndex.');
          output.trickModeVideo.segmentIndex = output.segmentIndex.clone();
          return Promise.resolve();
        };
      }

      // Concatenate the trick mode input onto the trick mode output.
      shaka.util.PeriodCombiner.concatenateStreams_(
          output.trickModeVideo, input.trickModeVideo);
    } else if (output.trickModeVideo) {
      // We have a trick mode output, but no input from this Period.  Fill it in
      // from the standard input Stream.
      shaka.util.PeriodCombiner.concatenateStreams_(
          output.trickModeVideo, input);
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
    const combineArrays = (a, b) => Array.from(new Set(a.concat(b)));
    output.roles = combineArrays(output.roles, input.roles);

    const combineSets = (a, b) => new Set([...a, ...b]);
    output.keyIds = combineSets(output.keyIds, input.keyIds);

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
   * @param {!Array.<!Array.<T>>} streamsPerPeriod
   * @param {T} outputStream
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static findMatchesInAllPeriods_(streamsPerPeriod, outputStream) {
    const matches = [];
    for (const streams of streamsPerPeriod) {
      const match = shaka.util.PeriodCombiner.findBestMatchInPeriod_(
          streams, outputStream);
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
   * @param {!Array.<T>} streams
   * @param {T} outputStream
   * @return {?T}  Returns null if no match can be found.
   *
   * @template T
   * Accepts either a StreamDB or Stream type.
   *
   * @private
   */
  static findBestMatchInPeriod_(streams, outputStream) {
    const areCompatible = {
      'audio': shaka.util.PeriodCombiner.areAVStreamsCompatible_,
      'video': shaka.util.PeriodCombiner.areAVStreamsCompatible_,
      'text': shaka.util.PeriodCombiner.areTextStreamsCompatible_,
      'image': shaka.util.PeriodCombiner.areImageStreamsCompatible_,
    }[outputStream.type];

    const isBetterMatch = {
      'audio': shaka.util.PeriodCombiner.isAudioStreamBetterMatch_,
      'video': shaka.util.PeriodCombiner.isVideoStreamBetterMatch_,
      'text': shaka.util.PeriodCombiner.isTextStreamBetterMatch_,
      'image': shaka.util.PeriodCombiner.isImageStreamBetterMatch_,
    }[outputStream.type];

    let best = null;

    for (const stream of streams) {
      if (!areCompatible(outputStream, stream)) {
        continue;
      }

      if (!best || isBetterMatch(outputStream, best, stream)) {
        best = stream;
      }
    }

    return best;
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
  static areAVStreamsCompatible_(outputStream, candidate) {
    const getCodec = (codecs) =>
      shaka.util.MimeUtils.getNormalizedCodec(codecs);
    // Check MIME type and codecs, which should always be the same.
    if (candidate.mimeType != outputStream.mimeType ||
        getCodec(candidate.codecs) != getCodec(outputStream.codecs)) {
      return false;
    }

    // This field is only available on Stream, not StreamDB.
    if (outputStream.drmInfos) {
      // Check for compatible DRM systems.  Note that clear streams are
      // implicitly compatible with any DRM and with each other.
      if (!shaka.media.DrmEngine.areDrmCompatible(outputStream.drmInfos,
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

    // The output stream should not be a dummy stream inserted to fill a period
    // gap.  So reject any candidate if the output has no language.  This would
    // cause findMatchesInAllPeriods_ to return null and this output stream to
    // be skipped (meaning no output streams based on it).
    if (!outputStream.language) {
      return false;
    }

    // If the candidate is a dummy, then it is compatible, and we could use it
    // if nothing else matches.
    if (!candidate.language) {
      return true;
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

    // The output stream should not be a dummy stream inserted to fill a period
    // gap.  So reject any candidate if the output has no tilesLayout.  This
    // would cause findMatchesInAllPeriods_ to return null and this output
    // stream to be skipped (meaning no output streams based on it).
    if (!outputStream.tilesLayout) {
      return false;
    }

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

    // If the output stream was based on the candidate stream, the candidate
    // stream should be considered a better match. We can check this by
    // comparing their ids.
    if (outputStream.id == candidate.id) {
      return true;
    }

    // Otherwise, compare the streams' characteristics to determine the best
    // match.

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

    // If language-based differences haven't decided this, look at roles.  If
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
      } else {
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

    // If the output stream was based on the candidate stream, the candidate
    // stream should be considered a better match. We can check this by
    // comparing their ids.
    if (outputStream.id == candidate.id) {
      return true;
    }

    // Otherwise, compare the streams' characteristics to determine the best
    // match.

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

    // If the output stream was based on the candidate stream, the candidate
    // stream should be considered a better match. We can check this by
    // comparing their ids.
    if (outputStream.id == candidate.id) {
      return true;
    }

    // Otherwise, compare the streams' characteristics to determine the best
    // match.

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

    // If the output stream was based on the candidate stream, the candidate
    // stream should be considered a better match. We can check this by
    // comparing their ids.
    if (outputStream.id == candidate.id) {
      return true;
    }

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
      primary: false,
      type,
      mimeType: '',
      codecs: '',
      language: '',
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
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex: new shaka.media.SegmentIndex([]),
      mimeType: '',
      codecs: '',
      encrypted: false,
      drmInfos: [],
      keyIds: new Set(),
      language: '',
      label: null,
      type,
      primary: false,
      trickModeVideo: null,
      emsgSchemeIdUris: null,
      roles: [],
      forced: false,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
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
};

/**
 * @typedef {{
 *   id: string,
 *   audioStreams: !Array.<shaka.extern.Stream>,
 *   videoStreams: !Array.<shaka.extern.Stream>,
 *   textStreams: !Array.<shaka.extern.Stream>,
 *   imageStreams: !Array.<shaka.extern.Stream>
 * }}
 *
 * @description Contains the streams from one DASH period.
 *
 * @property {string} id
 *   The Period ID.
 * @property {!Array.<shaka.extern.Stream>} audioStreams
 *   The audio streams from one Period.
 * @property {!Array.<shaka.extern.Stream>} videoStreams
 *   The video streams from one Period.
 * @property {!Array.<shaka.extern.Stream>} textStreams
 *   The text streams from one Period.
 * @property {!Array.<shaka.extern.Stream>} imageStreams
 *   The image streams from one Period.
 */
shaka.util.PeriodCombiner.Period;

/**
 * @enum {number}
 */
shaka.util.PeriodCombiner.BetterOrWorse = {
  BETTER: 1,
  EQUAL: 0,
  WORSE: -1,
};
