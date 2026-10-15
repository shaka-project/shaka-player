/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.mkv.MatroskaParser');

goog.require('shaka.codec.VP9');
goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.mkv.CodecId');
goog.require('shaka.mkv.ElementId');
goog.require('shaka.mkv.MatroskaClusterParser');
goog.require('shaka.mkv.MatroskaCodecs');
goog.require('shaka.mkv.MatroskaConstants');
goog.require('shaka.mkv.MatroskaIndexParser');
goog.require('shaka.text.MatroskaTextParser');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.net.NetworkingUtils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.StreamUtils');


/**
 * Parses a Matroska (.mkv, .mka) file into a manifest.  Every track becomes a
 * stream, and the Cues of the file give the segments: byte ranges of the file,
 * each starting at a Cluster with a keyframe.  Nothing is downloaded but the
 * header, the Cues and the Chapters until the streams are played; the media is
 * repackaged by shaka.transmuxer.MatroskaTransmuxer, and the
 * subtitles are read by shaka.text.MatroskaTextParser.
 *
 * @implements {shaka.extern.ManifestParser}
 * @export
 */
shaka.mkv.MatroskaParser = class {
  constructor() {
    /** @private {?shaka.extern.ManifestConfiguration} */
    this.config_ = null;

    /** @private {?shaka.extern.ManifestParser.PlayerInterface} */
    this.playerInterface_ = null;

    /** @private {!Set<!shaka.extern.IAbortableOperation>} */
    this.operations_ = new Set();

    /** @private {boolean} */
    this.stopped_ = false;
  }

  /**
   * @override
   * @export
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * @override
   * @export
   */
  async start(uri, playerInterface) {
    this.playerInterface_ = playerInterface;
    try {
      return await this.load_(uri);
    } catch (error) {
      throw this.addUri_(error, uri);
    }
  }

  /**
   * @override
   * @export
   */
  async stop() {
    this.stopped_ = true;
    await Promise.all(Array.from(this.operations_).map((operation) => {
      return operation.abort();
    }));
    this.operations_.clear();
    this.playerInterface_ = null;
  }

  /** @override */
  update() {}

  /** @override */
  onExpirationUpdated(sessionId, expiration) {}

  /** @override */
  onInitialVariantChosen(variant) {}

  /** @override */
  banLocation(uri) {}

  /** @override */
  setMediaElement(mediaElement) {}

  /**
   * @param {string} uri
   * @return {!Promise<shaka.extern.Manifest>}
   * @private
   */
  async load_(uri) {
    const {header, totalSize} = await this.readHeader_(uri);
    const candidates = this.getCandidates_(header);
    if (!candidates.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MKV_NO_SUPPORTED_TRACKS,
          uri);
    }

    // The ranges the streams are made of come from the Cues of one track: a
    // video track when there is one, as only video is cut at keyframes.
    const indexTrack = (candidates.find((candidate) => {
      return candidate.contentType ==
          shaka.util.ManifestParserUtils.ContentType.VIDEO;
    }) || candidates[0]).track;
    const cues = await this.readCues_(uri, header);
    const announcedDuration = header.duration != null ? header.duration :
        shaka.mkv.MatroskaParser.estimateDuration_(cues, indexTrack.number);
    if (!announcedDuration || !Number.isFinite(announcedDuration) ||
        announcedDuration <= 0) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MKV_MISSING_INDEX,
          uri);
    }
    const duration = announcedDuration;

    // The streams that are wanted.
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const wanted = candidates.filter((candidate) => {
      if (!this.config_) {
        return true;
      }
      switch (candidate.contentType) {
        case ContentType.VIDEO:
          return !this.config_.disableVideo;
        case ContentType.AUDIO:
          return !this.config_.disableAudio;
        default:
          return !this.config_.disableText;
      }
    });

    await this.probeVp9_(uri, header, cues, indexTrack, wanted);

    const bandwidth = totalSize ? Math.round(totalSize * 8 / duration) : 0;
    const makeReferences = (initReference, timestampOffset) => {
      return shaka.mkv.MatroskaParser.makeReferences_(cues, header,
          indexTrack.number, duration, uri, initReference, timestampOffset);
    };
    const videoStreams = [];
    const audioStreams = [];
    const textStreams = [];
    for (const candidate of wanted) {
      // The two streams of a track are told apart by the initialization
      // segment, which the StreamingEngine appends again when it is another
      // range than the last one.  So the second one takes a byte more.  The
      // byte is the start of the element that follows, and an element takes two
      // at least, so it does not add anything to what the segment says.
      const initEnd = shaka.mkv.MatroskaIndexParser.getInitEndOffset(
          header, candidate.track) + (candidate.isAlternate ? 1 : 0);
      const initReference = new shaka.media.InitSegmentReference(
          () => [uri], 0, initEnd);
      // The transmuxer writes the audio and the video later than they are in
      // the file; see MEDIA_TIME_SHIFT.  Subtitles are not moved.
      const references = makeReferences(initReference,
          candidate.contentType == ContentType.TEXT ?
              0 : -shaka.mkv.MatroskaConstants.MEDIA_TIME_SHIFT);
      if (shaka.mkv.MatroskaCodecs.usesRawMpegAudio(candidate.track.codecId)) {
        // Raw MPEG audio has no timestamps. Anchor each append to its segment,
        // including after a seek, instead of applying the MP4/WebM shift.
        for (const reference of references) {
          reference.timestampOffset = reference.startTime;
        }
      }
      if (!references.length) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.MKV_MISSING_INDEX,
            uri);
      }
      const stream = this.createStream_(candidate, references, bandwidth);
      switch (candidate.contentType) {
        case ContentType.VIDEO:
          videoStreams.push(stream);
          break;
        case ContentType.AUDIO:
          audioStreams.push(stream);
          break;
        default:
          textStreams.push(stream);
          break;
      }
    }

    const variants = shaka.mkv.MatroskaParser.makeVariants_(
        videoStreams, audioStreams, bandwidth);
    if (!variants.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MKV_NO_SUPPORTED_TRACKS,
          uri);
    }

    const timeline = new shaka.media.PresentationTimeline(null, 0);
    timeline.setStatic(true);
    timeline.setDuration(duration);

    const chapters = await this.readChapters_(uri, header);
    const firstChapterId =
        Math.max(0, ...header.tracks.map((track) => track.number)) + 1;
    return {
      presentationTimeline: timeline,
      variants,
      textStreams,
      imageStreams: [],
      chapterStreams: shaka.mkv.MatroskaParser.makeChapterStreams_(
          chapters, duration, firstChapterId),
      offlineSessionIds: [],
      sequenceMode: false,
      ignoreManifestTimestampsInSegmentsMode: false,
      type: shaka.media.ManifestParser.MKV,
      serviceDescription: null,
      nextUrl: null,
      periodCount: 1,
      gapCount: 0,
      isLowLatency: false,
      startTime: null,
    };
  }

  /**
   * Reads the header of the file: everything before the first Cluster.  Its
   * size is not known beforehand, so the range that is requested grows until
   * the first Cluster is in it.
   *
   * @param {string} uri
   * @return {!Promise<{header: shaka.mkv.MatroskaIndexParser.Header,
   *   totalSize: ?number}>}
   * @private
   */
  async readHeader_(uri) {
    let size = shaka.mkv.MatroskaParser.INITIAL_HEADER_READ_SIZE_;
    let totalSize = null;
    while (true) {
      // The size of the header is unknown until it has been read, so the
      // requests cannot be made at the same time.
      // eslint-disable-next-line no-await-in-loop
      const response = await this.requestRange_(uri, 0, size - 1);
      if (totalSize == null) {
        totalSize = shaka.mkv.MatroskaParser.getTotalSize_(response);
      }
      const header = shaka.mkv.MatroskaIndexParser.parseHeader(response.data);
      if (header.firstClusterOffset != null) {
        return {header, totalSize};
      }
      // Either the file is over (it has no media) or the header is still to
      // come.
      const received = shaka.util.BufferUtils.toUint8(response.data).length;
      const maxSize = shaka.mkv.MatroskaParser.MAX_HEADER_READ_SIZE_;
      if (received < size || size >= maxSize) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.MKV_INVALID_FILE,
            uri);
      }
      size *= 2;
    }
  }

  /**
   * Lists the tracks that become streams, with what is known of them.
   *
   * @param {shaka.mkv.MatroskaIndexParser.Header} header
   * @return {!Array<shaka.mkv.MatroskaParser.Candidate>}
   * @private
   */
  getCandidates_(header) {
    const MatroskaCodecs = shaka.mkv.MatroskaCodecs;
    const numbers = new Set();
    const candidates = [];
    for (const track of header.tracks) {
      const contentType = MatroskaCodecs.getContentType(track);
      if (!contentType || !track.enabled) {
        continue;
      }
      if (!track.number || numbers.has(track.number)) {
        // The number is what the blocks refer to, so it has to be unique.
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.MKV_INVALID_FILE);
      }
      numbers.add(track.number);
      const codecs = MatroskaCodecs.getCodecs(track);
      if (!codecs) {
        shaka.log.warning('Ignoring the Matroska track', track.number,
            'with the unsupported codec', track.codecId);
        continue;
      }
      const supplementalCodecs = this.config_ &&
          this.config_.ignoreSupplementalCodecs ? '' :
        shaka.mkv.MatroskaCodecs.getSupplementalCodecs(track);
      candidates.push({
        track,
        contentType,
        codecs,
        supplementalCodecs,
        streamId: track.number,
        isAlternate: false,
      });
      if (supplementalCodecs) {
        // A second stream for the platforms that decode Dolby Vision, next to
        // the one for those that do not.  The player keeps the ones it plays.
        candidates.push({
          track,
          contentType,
          codecs: supplementalCodecs,
          supplementalCodecs,
          streamId: track.number +
              shaka.mkv.MatroskaConstants.ALTERNATE_STREAM_ID_OFFSET,
          isAlternate: true,
        });
      }
    }
    return candidates;
  }

  /**
   * A VP9 track normally has no CodecPrivate, so the profile and the bit depth
   * that the codec string needs are only in the first key frame.  Reads it.
   *
   * @param {string} uri
   * @param {shaka.mkv.MatroskaIndexParser.Header} header
   * @param {!Array<shaka.mkv.MatroskaIndexParser.CuePoint>} cues
   * @param {!shaka.mkv.MatroskaIndexParser.Track} indexTrack
   * @param {!Array<shaka.mkv.MatroskaParser.Candidate>} candidates
   * @return {!Promise}
   * @private
   */
  async probeVp9_(uri, header, cues, indexTrack, candidates) {
    const toProbe = candidates.filter((candidate) => {
      return candidate.track.codecId == shaka.mkv.CodecId.VP9 &&
          !candidate.track.codecPrivate;
    });
    if (!toProbe.length) {
      return;
    }
    const first = shaka.mkv.MatroskaParser.makeReferences_(cues, header,
        indexTrack.number, Number.MAX_VALUE, uri, null)[0];
    if (!first) {
      return;
    }
    const start = first.getStartByte();
    const end = Math.min(first.getEndByte() ?? Infinity,
        start + shaka.mkv.MatroskaParser.VP9_PROBE_SIZE_ - 1);
    const response = await this.requestRange_(uri, start, end);
    for (const candidate of toProbe) {
      const frames = shaka.mkv.MatroskaClusterParser.parseFrames(
          response.data, candidate.track, header.timecodeScale,
          /* allowPartial= */ true);
      const keyframe = frames.find((frame) => frame.keyframe);
      const info = keyframe && shaka.codec.VP9.parseKeyFrame(keyframe.data);
      if (info) {
        candidate.codecs = shaka.codec.VP9.getCodecs(info,
            candidate.track.width || info.width,
            candidate.track.height || info.height,
            candidate.track.defaultDuration);
      }
    }
  }

  /**
   * @param {string} uri
   * @param {shaka.mkv.MatroskaIndexParser.Header} header
   * @return {!Promise<!Array<shaka.mkv.MatroskaIndexParser.CuePoint>>}
   * @private
   */
  async readCues_(uri, header) {
    const cuesOffset = header.cuesOffset;
    if (cuesOffset == null) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MKV_MISSING_INDEX,
          uri);
    }
    const data = await this.requestElement_(
        uri, cuesOffset, shaka.mkv.ElementId.CUES);
    const cues = shaka.mkv.MatroskaIndexParser.parseCues(
        data, header.segmentOffset, header.timecodeScale);
    if (!cues.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MKV_MISSING_INDEX,
          uri);
    }
    return cues;
  }

  /**
   * @param {string} uri
   * @param {shaka.mkv.MatroskaIndexParser.Header} header
   * @return {!Promise<!Array<shaka.mkv.MatroskaIndexParser.Chapter>>}
   * @private
   */
  async readChapters_(uri, header) {
    if (header.chaptersOffset == null ||
        (this.config_ && this.config_.disableChapters)) {
      return [];
    }
    const data = await this.requestElement_(
        uri, header.chaptersOffset, shaka.mkv.ElementId.CHAPTERS);
    return shaka.mkv.MatroskaIndexParser.parseChapters(data);
  }

  /**
   * Downloads a top-level element whose size is not known: its header first,
   * then exactly the element.
   *
   * @param {string} uri
   * @param {number} offset
   * @param {shaka.mkv.ElementId} id
   * @return {!Promise<BufferSource>}
   * @private
   */
  async requestElement_(uri, offset, id) {
    const head = await this.requestRange_(uri, offset,
        offset + shaka.mkv.MatroskaParser.ELEMENT_HEADER_READ_SIZE_ - 1);
    const length = shaka.mkv.MatroskaIndexParser.getElementLength(
        head.data, id);
    if (length > shaka.mkv.MatroskaParser.MAX_ELEMENT_SIZE_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MKV_INVALID_FILE,
          uri);
    }
    const body = await this.requestRange_(uri, offset, offset + length - 1);
    return body.data;
  }

  /**
   * @param {string} uri
   * @param {number} start
   * @param {number} end
   * @return {!Promise<shaka.extern.Response>}
   * @private
   */
  async requestRange_(uri, start, end) {
    if (this.stopped_ || !this.playerInterface_) {
      throw this.makeAbortedError_();
    }
    const request = shaka.net.NetworkingUtils.createSegmentRequest(
        [uri], start, end, this.playerInterface_.getStreamingRetryParameters());
    const operation = this.playerInterface_.networkingEngine.request(
        shaka.net.NetworkingEngine.RequestType.SEGMENT, request);
    this.operations_.add(operation);
    try {
      const response = await operation.promise;
      if (this.stopped_) {
        throw this.makeAbortedError_();
      }
      // A server that ignores the Range header answers with the whole file.
      if (shaka.util.BufferUtils.toUint8(response.data).byteLength >
          end - start + 1) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.MKV_INVALID_FILE,
            uri);
      }
      return response;
    } finally {
      this.operations_.delete(operation);
    }
  }

  /**
   * @param {!shaka.mkv.MatroskaParser.Candidate} candidate
   * @param {!Array<!shaka.media.SegmentReference>} references
   * @param {number} bandwidth
   * @return {!shaka.extern.Stream}
   * @private
   */
  createStream_(candidate, references, bandwidth) {
    const {track, contentType, codecs} = candidate;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const MatroskaCodecs = shaka.mkv.MatroskaCodecs;
    const AccessibilityPurpose =
        shaka.media.ManifestParser.AccessibilityPurpose;
    const isVideo = contentType == ContentType.VIDEO;
    const isText = contentType == ContentType.TEXT;

    /** @type {!Object<string, *>} */
    const overrides = {
      id: candidate.streamId,
      originalId: String(track.number),
      type: contentType,
      mimeType: isText ? shaka.text.MatroskaTextParser.MIME_TYPE :
          contentType + '/x-matroska',
      codecs,
      supplementalCodecs: candidate.supplementalCodecs,
      language: shaka.util.LanguageUtils.normalize(track.language),
      originalLanguage: track.language,
      label: track.name || null,
      primary: track.isDefault,
      forced: track.forced,
    };
    if (isVideo) {
      const pixelAspectRatio = MatroskaCodecs.getPixelAspectRatio(track);
      Object.assign(overrides, {
        width: track.width,
        height: track.height,
        frameRate: MatroskaCodecs.getFrameRate(track),
        pixelAspectRatio: pixelAspectRatio ?
            pixelAspectRatio.horizontal + ':' + pixelAspectRatio.vertical :
            undefined,
        hdr: MatroskaCodecs.getHdr(track),
        // Every stream is read from the same bytes, so the file's bitrate is
        // what any of them costs.
        bandwidth,
      });
    } else if (!isText) {
      Object.assign(overrides, {
        channelsCount: track.channels,
        audioSamplingRate: track.outputSampleRate || track.sampleRate,
      });
    }
    if (track.hearingImpaired) {
      overrides['accessibilityPurpose'] = AccessibilityPurpose.HARD_OF_HEARING;
      overrides['roles'] = ['caption'];
    } else if (track.visualImpaired) {
      overrides['accessibilityPurpose'] =
          AccessibilityPurpose.VISUALLY_IMPAIRED;
      overrides['roles'] = ['description'];
    } else if (track.commentary) {
      overrides['roles'] = ['commentary'];
    }
    if (isText) {
      overrides['kind'] = track.hearingImpaired ? 'caption' : 'subtitle';
      // The text engine waits for the timestamp offset that MediaSource
      // reports for the media, which this container never has: the cues have
      // absolute times.  External streams are the ones that do not wait.
      overrides['external'] = true;
    }

    const stream = shaka.util.StreamUtils.createStream(overrides);
    stream.createSegmentIndex = () => {
      // The index may be released and created again, so it gets a copy.
      stream.segmentIndex = new shaka.media.SegmentIndex(references.slice());
      return Promise.resolve();
    };
    stream.closeSegmentIndex = () => {
      if (stream.segmentIndex) {
        stream.segmentIndex.release();
        stream.segmentIndex = null;
      }
    };
    return stream;
  }

  /**
   * Adds the URI to the errors of the file, which are created without it.
   *
   * @param {*} error
   * @param {string} uri
   * @return {*}
   * @private
   */
  addUri_(error, uri) {
    const Code = shaka.util.Error.Code;
    if (error instanceof shaka.util.Error && !error.data.length &&
        [Code.MKV_INVALID_FILE, Code.MKV_MISSING_INDEX,
          Code.MKV_NO_SUPPORTED_TRACKS].includes(error.code)) {
      return new shaka.util.Error(
          error.severity, error.category, error.code, uri);
    }
    return error;
  }

  /** @return {!shaka.util.Error} @private */
  makeAbortedError_() {
    return new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.PLAYER,
        shaka.util.Error.Code.OPERATION_ABORTED);
  }

  /**
   * Makes references to consecutive cluster ranges.  A range may contain more
   * than one cluster when not every cluster has a CuePoint.  Each reference
   * therefore starts on a random access point indicated by Cues.
   *
   * @param {!Array<shaka.mkv.MatroskaIndexParser.CuePoint>} cues
   * @param {shaka.mkv.MatroskaIndexParser.Header} header
   * @param {number} trackNumber The track whose CuePoints define the ranges.
   *   Cues of other tracks (e.g. subtitles) do not fall on keyframes.
   * @param {number} duration
   * @param {string} uri
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @param {number=} timestampOffset
   * @return {!Array<!shaka.media.SegmentReference>}
   * @private
   */
  static makeReferences_(cues, header, trackNumber, duration, uri,
      initSegmentReference, timestampOffset = 0) {
    const firstClusterOffset = header.firstClusterOffset;
    if (firstClusterOffset == null) {
      return [];
    }
    const pointsByOffset = new Map();
    pointsByOffset.set(firstClusterOffset, 0);
    for (const cue of cues) {
      if (cue.track == trackNumber && cue.offset >= firstClusterOffset &&
          cue.time < duration) {
        const oldTime = pointsByOffset.get(cue.offset);
        pointsByOffset.set(cue.offset, oldTime == null ? cue.time :
            Math.min(oldTime, cue.time));
      }
    }
    const points = Array.from(pointsByOffset).sort((a, b) => a[0] - b[0]);
    const references = [];
    for (let i = 0; i < points.length; i++) {
      const [startByte, startTime] = points[i];
      const next = points[i + 1];
      const endTime = next ? next[1] : duration;
      if (endTime <= startTime) {
        continue;
      }
      // The last range stops before the Cues (or any other element that
      // follows the Clusters) so it does not download them.
      const endByte = next ? next[0] - 1 :
          (header.mediaEndOffset == null ? null : header.mediaEndOffset - 1);
      references.push(new shaka.media.SegmentReference(
          startTime, endTime, () => [uri], startByte, endByte,
          initSegmentReference,
          timestampOffset, /* appendWindowStart= */ 0,
          /* appendWindowEnd= */ duration));
    }
    return references;
  }

  /**
   * @param {!shaka.extern.Response} response
   * @return {?number} The size of the whole file, from a Content-Range header.
   * @private
   */
  static getTotalSize_(response) {
    const contentRange = response.headers['content-range'];
    const match = contentRange && /\/(\d+)\s*$/.exec(contentRange);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Guesses the duration of a file that does not write it: the time of the
   * last keyframe, and one more interval like the last one.
   *
   * @param {!Array<shaka.mkv.MatroskaIndexParser.CuePoint>} cues
   * @param {number} trackNumber
   * @return {?number}
   * @private
   */
  static estimateDuration_(cues, trackNumber) {
    const times = cues.filter((cue) => cue.track == trackNumber)
        .map((cue) => cue.time).sort((a, b) => a - b);
    if (times.length < 2) {
      return null;
    }
    const last = times[times.length - 1];
    return last + (last - times[times.length - 2]);
  }

  /**
   * Combines every video with every audio: they are all in the same file, so
   * any pair can be played.
   *
   * @param {!Array<!shaka.extern.Stream>} videoStreams
   * @param {!Array<!shaka.extern.Stream>} audioStreams
   * @param {number} bandwidth
   * @return {!Array<!shaka.extern.Variant>}
   * @private
   */
  static makeVariants_(videoStreams, audioStreams, bandwidth) {
    /** @type {!Array<!shaka.extern.Variant>} */
    const variants = [];
    for (const video of videoStreams.length ? videoStreams : [null]) {
      for (const audio of audioStreams.length ? audioStreams : [null]) {
        if (!video && !audio) {
          continue;
        }
        variants.push({
          id: variants.length,
          language: audio ? audio.language : 'und',
          disabledUntilTime: 0,
          primary: false,
          audio,
          video,
          bandwidth,
          allowedByApplication: true,
          allowedByKeySystem: true,
          decodingInfos: [],
        });
      }
    }
    // The player is to start with what the file marks as default.
    const defaultVariant = variants.find((variant) => {
      return (!variant.video || variant.video.primary) &&
          (!variant.audio || variant.audio.primary);
    }) || variants[0];
    if (defaultVariant) {
      defaultVariant.primary = true;
    }
    return variants;
  }

  /**
   * @param {!Array<shaka.mkv.MatroskaIndexParser.Chapter>} chapters
   * @param {number} duration
   * @param {number} firstId
   * @return {!Array<!shaka.extern.Stream>}
   * @private
   */
  static makeChapterStreams_(chapters, duration, firstId) {
    /** @type {!Map<string, !Array<shaka.mkv.MatroskaIndexParser.Chapter>>} */
    const byLanguage = new Map();
    for (const chapter of chapters) {
      if (chapter.start < duration) {
        if (!byLanguage.has(chapter.language)) {
          byLanguage.set(chapter.language, []);
        }
        byLanguage.get(chapter.language).push(chapter);
      }
    }
    const result = [];
    for (const language of byLanguage.keys()) {
      const entries = byLanguage.get(language);
      entries.sort((a, b) => a.start - b.start);
      const references = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        // A chapter that has no end lasts until the next one starts.
        const nextStart = i + 1 < entries.length ?
            entries[i + 1].start : duration;
        const end = Math.min(duration, entry.end ?? nextStart);
        if (end <= entry.start) {
          continue;
        }
        const reference = new shaka.media.SegmentReference(
            entry.start, end, () => [], 0, null, null, 0, 0, Infinity);
        reference.setMetadata({title: entry.title, images: []});
        references.push(reference);
      }
      const stream = shaka.util.StreamUtils.createStream({
        id: firstId++,
        type: shaka.util.ManifestParserUtils.ContentType.CHAPTER,
        mimeType: 'text/plain',
        language: shaka.util.LanguageUtils.normalize(language),
        originalLanguage: language,
        external: true,
        createSegmentIndex: () => {
          stream.segmentIndex = new shaka.media.SegmentIndex(
              references.slice());
          return Promise.resolve();
        },
      });
      result.push(stream);
    }
    return result;
  }
};


/**
 * @typedef {{
 *   track: !shaka.mkv.MatroskaIndexParser.Track,
 *   contentType: string,
 *   codecs: string,
 *   supplementalCodecs: string,
 *   streamId: number,
 *   isAlternate: boolean,
 * }}
 *
 * @property {!shaka.mkv.MatroskaIndexParser.Track} track
 * @property {string} contentType
 * @property {string} codecs
 * @property {string} supplementalCodecs
 *   The codecs of the Dolby Vision version of the track, if it has one.
 * @property {number} streamId
 * @property {boolean} isAlternate
 *   True for the second stream of a track: the one with the supplemental
 *   codecs.
 */
shaka.mkv.MatroskaParser.Candidate;


/**
 * How much of the file is read first.  The EBML header, the SeekHead, the Info
 * and the Tracks add up to a few kilobytes, so this is enough for almost any
 * file in one request.
 *
 * @private @const {number}
 */
shaka.mkv.MatroskaParser.INITIAL_HEADER_READ_SIZE_ = 64 * 1024;


/**
 * The most that is read to find the first Cluster.  Files that put large
 * elements (cover art, big Void areas) before their media need more than the
 * first read, but there is a limit to what can be a header.
 *
 * @private @const {number}
 */
shaka.mkv.MatroskaParser.MAX_HEADER_READ_SIZE_ = 4 * 1024 * 1024;


/**
 * The most an element that is downloaded whole (Cues, Chapters) may be.  Cues
 * take about 20 bytes per keyframe, so this holds those of days of video; it
 * keeps a corrupt size from asking for the whole file.
 *
 * @private @const {number}
 */
shaka.mkv.MatroskaParser.MAX_ELEMENT_SIZE_ = 16 * 1024 * 1024;


/**
 * The size of an element header: an ID (at most 4 bytes) and a size (at most
 * 8 bytes), rounded up.
 *
 * @private @const {number}
 */
shaka.mkv.MatroskaParser.ELEMENT_HEADER_READ_SIZE_ = 16;


/**
 * How many bytes of the first Cluster are read to look for a VP9 key frame.
 * Frames of the track come early in the Cluster, and a key frame of a VP9 track
 * at 4K is a few hundred kilobytes.
 *
 * @private @const {number}
 */
shaka.mkv.MatroskaParser.VP9_PROBE_SIZE_ = 2 * 1024 * 1024;


/**
 * The MIME types of Matroska: the ones IANA registered and the ones that are
 * really sent.
 *
 * @private @const {!Array<string>}
 */
shaka.mkv.MatroskaParser.MIME_TYPES_ = [
  'video/x-matroska',
  'video/matroska',
  'audio/x-matroska',
  'audio/matroska',
];


for (const mimeType of shaka.mkv.MatroskaParser.MIME_TYPES_) {
  shaka.media.ManifestParser.registerParserByMime(
      mimeType, () => new shaka.mkv.MatroskaParser());
}

// Other builds keep the MIME types these extensions have always had.
shaka.net.NetworkingUtils.registerExtension('mkv', 'video/x-matroska');
shaka.net.NetworkingUtils.registerExtension('mk3d', 'video/x-matroska');
shaka.net.NetworkingUtils.registerExtension('mka', 'audio/x-matroska');
