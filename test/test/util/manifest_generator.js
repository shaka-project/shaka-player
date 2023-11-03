/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @summary
 * A helper class used to generate manifests.  This is done through a series
 * of recursive callbacks.  The callbacks are called synchronously within their
 * function. The callback accepts a "builder" for the respective type.  That
 * object has the same fields as the target type, and can be changed by the
 * callback.  It also has the methods defined below to help in creating the
 * objects.
 */
shaka.test.ManifestGenerator = class {
  /**
   * @param {function(!shaka.test.ManifestGenerator.Manifest)=} func
   * @param {shakaNamespaceType=} compiledShaka
   * @return {shaka.extern.Manifest}
   */
  static generate(func, compiledShaka) {
    const generator = new shaka.test.ManifestGenerator.Manifest(compiledShaka);
    if (func) {
      func(generator);
    }
    return generator.build_();
  }

  /**
   * Creates an object from the given builder.  This function exists because
   * we want to be able to use expect().toEqual with these objects.  If we used
   * the builders themselves, they wouldn't be equal.  So this converts the
   * builder to a "normal" object so it can be used in toEqual.  This assumes
   * that (a) the only fields on the object are fields in the target struct, (b)
   * private fields ending with "_" should be ignored, and (c) all the helpers
   * are defined on the prototype (and therefore not "own" properties).
   *
   * @param {!Object} obj
   * @return {?}
   * @private
   */
  static buildCommon_(obj) {
    const ret = {};
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (key.endsWith('_')) {
        continue;  // Ignore private fields.
      }
      ret[key] = obj[key];
    }
    return ret;
  }

  /**
   * Gets the backing object of the given field.  When using
   * jasmine.objectContaining, the resulting object doesn't have the fields we
   * want, so we return the backing object.
   *
   * @template T
   * @param {T} obj
   * @return {T}
   * @private
   */
  static realObj_(obj) {
    if (obj['sample']) {
      return obj['sample'];
    } else {
      return obj;
    }
  }
};

shaka.test.ManifestGenerator.Manifest = class {
  /** @param {shakaNamespaceType=} compiledShaka */
  constructor(compiledShaka) {
    /** @private {shakaNamespaceType} */
    this.shaka_ = compiledShaka || window['shaka'];

    /** @type {!Array.<shaka.extern.Variant>} */
    this.variants = [];

    /** @type {!Array.<shaka.extern.Stream>} */
    this.textStreams = [];

    /** @type {!Array.<shaka.extern.Stream>} */
    this.imageStreams = [];

    const timeline = new this.shaka_.media.PresentationTimeline(0, 0);
    timeline.setSegmentAvailabilityDuration(Infinity);
    timeline.notifyMaxSegmentDuration(10);

    /** @type {!shaka.media.PresentationTimeline} */
    this.presentationTimeline = timeline;
    /** @type {!Array.<string>} */
    this.offlineSessionIds = [];
    /** @type {number} */
    this.minBufferTime = 0;
    /** @type {boolean} */
    this.sequenceMode = false;
    /** @type {boolean} */
    this.ignoreManifestTimestampsInSegmentsMode = false;
    /** @type {string} */
    this.type = 'UNKNOWN';
    /** @type {?shaka.extern.ServiceDescription} */
    this.serviceDescription = null;


    /** @type {shaka.extern.Manifest} */
    const foo = this;
    goog.asserts.assert(foo, 'Checking for type compatibility');
  }

  /**
   * @return {shaka.extern.Manifest}
   * @private
   */
  build_() {
    return shaka.test.ManifestGenerator.buildCommon_(this);
  }

  /**
   * Converts the presentation timeline into jasmine.any.
   */
  anyTimeline() {
    this.presentationTimeline =
      /** @type {?} */ (jasmine.any(this.shaka_.media.PresentationTimeline));
  }

  /**
   * Gets the existing stream with the given ID.
   * @param {number} id
   * @return {?shaka.extern.Stream}
   * @private
   */
  findExistingStream_(id) {
    const real = (obj) => shaka.test.ManifestGenerator.realObj_(obj);

    for (const maybeVariant of this.variants) {
      const variant = real(maybeVariant);
      if (variant.video && real(variant.video).id == id) {
        return variant.video;
      }
      if (variant.audio && real(variant.audio).id == id) {
        return variant.audio;
      }
    }
    for (const maybeText of this.textStreams) {
      if (real(maybeText).id == id) {
        return maybeText;
      }
    }
    return null;
  }

  /**
   * Gets whether the given ID is used in any stream.
   * @param {?number} id
   * @return {boolean}
   * @private
   */
  isIdUsed_(id) {
    return id != null && this.findExistingStream_(id) != null;
  }

  /**
   * Adds a new variant to the manifest.
   *
   * @param {number} id
   * @param {function(!shaka.test.ManifestGenerator.Variant)=} func
   */
  addVariant(id, func) {
    const variant = new shaka.test.ManifestGenerator.Variant(
        this, /* isPartial= */ false, id);
    if (func) {
      func(variant);
    }
    this.variants.push(variant.build_());
  }

  /**
   * Adds a new partial variant that, when used with jasmine, will only compare
   * the properties explicitly set on it.  Note that this will default to
   * having |null| audio and video streams.
   *
   * @param {function(!shaka.test.ManifestGenerator.Variant)=} func
   */
  addPartialVariant(func) {
    const variant = new shaka.test.ManifestGenerator.Variant(
        this, /* isPartial= */ true);
    if (func) {
      func(variant);
    }
    this.variants.push(/** @type {shaka.extern.Variant} */ (
      jasmine.objectContaining(variant.build_())));
  }

  /**
   * Adds a text stream to the manifest.
   *
   * @param {number} id
   * @param {function(!shaka.test.ManifestGenerator.Stream)=} func
   */
  addTextStream(id, func) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const stream = new shaka.test.ManifestGenerator.Stream(
        this, /* isPartial= */ false, id, ContentType.TEXT, 'und');
    if (func) {
      func(stream);
    }
    this.textStreams.push(stream.build_());
  }

  /**
   * Adds an image stream to the manifest.
   *
   * @param {number} id
   * @param {function(!shaka.test.ManifestGenerator.Stream)=} func
   */
  addImageStream(id, func) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const stream = new shaka.test.ManifestGenerator.Stream(
        this, /* isPartial= */ false, id, ContentType.IMAGE, 'und');
    if (func) {
      func(stream);
    }
    this.imageStreams.push(stream.build_());
  }

  /**
   * Adds a "partial" stream which, when used with jasmine, will only compare
   * the properties that were explicitly given to it.  All other properties will
   * be ignored.
   *
   * @param {function(!shaka.test.ManifestGenerator.Stream)} func
   */
  addPartialTextStream(func) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const stream = new shaka.test.ManifestGenerator.Stream(
        this, /* isPartial= */ true, null, ContentType.TEXT);
    if (func) {
      func(stream);
    }

    const streamObj = /** @type {shaka.extern.Stream} */ (
      jasmine.objectContaining(stream.build_()));
    this.textStreams.push(streamObj);
  }
};

shaka.test.ManifestGenerator.Variant = class {
  /**
   * @param {!shaka.test.ManifestGenerator.Manifest} manifest
   * @param {boolean} isPartial
   * @param {number=} id
   */
  constructor(manifest, isPartial, id) {
    /** @const {!shaka.test.ManifestGenerator.Manifest} */
    this.manifest_ = manifest;

    /** @type {?shaka.extern.Stream} */
    this.audio = null;
    /** @type {?shaka.extern.Stream} */
    this.video = null;
    if (id != null) {
      /** @type {number} */
      this.id = id;
    }

    if (!isPartial) {
      /** @type {string} */
      this.language = 'und';
      /** @type {string} */
      this.label = '';
      /** @type {number} */
      this.bandwidth = 0;
      /** @type {number} */
      this.disabledUntilTime = 0;
      /** @type {boolean} */
      this.primary = false;
      /** @type {boolean} */
      this.allowedByApplication = true;
      /** @type {boolean} */
      this.allowedByKeySystem = true;
      /** @type {!Array.<MediaCapabilitiesDecodingInfo>} */
      this.decodingInfos = [];
    }

    /** @type {shaka.extern.Variant} */
    const foo = this;
    goog.asserts.assert(foo, 'Checking for type compatibility');
  }

  /**
   * @return {shaka.extern.Variant}
   * @private
   */
  build_() {
    return shaka.test.ManifestGenerator.buildCommon_(this);
  }

  /**
   * Sets video stream of the current variant.
   *
   * @param {number} id
   * @param {function(!shaka.test.ManifestGenerator.Stream)=} func
   */
  addVideo(id, func) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const stream = new shaka.test.ManifestGenerator.Stream(
        this.manifest_, /* isPartial= */ false, id, ContentType.VIDEO, 'und');
    if (func) {
      func(stream);
    }
    this.video = stream.build_();
  }

  /**
   * Sets video stream of the current variant.
   *
   * @param {number} id
   * @param {function(!shaka.test.ManifestGenerator.Stream)=} func
   */
  addAudio(id, func) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const stream = new shaka.test.ManifestGenerator.Stream(
        this.manifest_, /* isPartial= */ false, id, ContentType.AUDIO,
        this.language, this.label);
    if (func) {
      func(stream);
    }
    this.audio = stream.build_();
  }

  /**
   * Adds an existing stream to the current variant.
   *
   * @param {number} id
   */
  addExistingStream(id) {
    const stream = this.manifest_.findExistingStream_(id);
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    goog.asserts.assert(stream, 'Must list an existing stream ID');
    if (stream.type == ContentType.AUDIO) {
      this.audio = stream;
    } else if (stream.type == ContentType.VIDEO) {
      this.video = stream;
    } else {
      goog.asserts.assert(false, 'Cannot add existing text streams');
    }
  }

  /**
   * Adds a "partial" stream which, when used with jasmine, will only compare
   * the properties that were explicitly given to it.  All other properties will
   * be ignored.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} type
   * @param {function(!shaka.test.ManifestGenerator.Stream)=} func
   */
  addPartialStream(type, func) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const stream = new shaka.test.ManifestGenerator.Stream(
        this.manifest_, /* isPartial= */ true, null, type);
    if (func) {
      func(stream);
    }

    const streamObj = /** @type {shaka.extern.Stream} */ (
      jasmine.objectContaining(stream.build_()));
    if (type == ContentType.AUDIO) {
      this.audio = streamObj;
    } else {
      goog.asserts.assert(
          type == ContentType.VIDEO, 'Must be audio or video');
      this.video = streamObj;
    }
  }
};

shaka.test.ManifestGenerator.DrmInfo = class {
  /**
   * @param {!shaka.test.ManifestGenerator.Manifest} manifest
   * @param {string} keySystem
   */
  constructor(manifest, keySystem) {
    /** @const {!shaka.test.ManifestGenerator.Manifest} */
    this.manifest_ = manifest;

    /** @type {string} */
    this.keySystem = keySystem;
    /** @type {string} */
    this.licenseServerUri = '';
    /** @type {boolean} */
    this.distinctiveIdentifierRequired = false;
    /** @type {boolean} */
    this.persistentStateRequired = false;
    /** @type {string} */
    this.audioRobustness = '';
    /** @type {string} */
    this.videoRobustness = '';
    /** @type {Uint8Array} */
    this.serverCertificate = null;
    /** @type {!Array.<shaka.extern.InitDataOverride>} */
    this.initData = [];
    /** @type {Set.<string>} */
    this.keyIds = new Set();
    /** @type {string} */
    this.sessionType = '';
    /** @type {string} */
    this.serverCertificateUri = '';

    /** @type {shaka.extern.DrmInfo} */
    const foo = this;
    goog.asserts.assert(foo, 'Checking for type compatibility');
  }

  /**
   * @return {shaka.extern.DrmInfo}
   * @private
   */
  build_() {
    return shaka.test.ManifestGenerator.buildCommon_(this);
  }

  /**
   * Adds a new init data to the current DRM info.
   *
   * @param {string} type
   * @param {!Uint8Array} buffer
   */
  addInitData(type, buffer) {
    this.initData.push({initData: buffer, initDataType: type, keyId: null});
  }

  /**
   * Adds a new 'cenc' init data to the current DRM info.
   *
   * @param {string} base64
   */
  addCencInitData(base64) {
    if (!this.initData) {
      this.initData = [];
    }

    const buffer = shaka.util.Uint8ArrayUtils.fromBase64(base64);
    this.initData.push({initData: buffer, initDataType: 'cenc'});
  }
};

shaka.test.ManifestGenerator.Stream = class {
  /**
   * @param {shaka.test.ManifestGenerator.Manifest} manifest
   * @param {boolean} isPartial
   * @param {?number} id
   * @param {shaka.util.ManifestParserUtils.ContentType} type
   * @param {?string=} lang
   * @param {string=} label
   */
  constructor(manifest, isPartial, id, type, lang, label) {
    // variants can be made up of different combinations of video
    // and audio streams
    // goog.asserts.assert(
    //     !manifest || !manifest.isIdUsed_(id),
    //     'Streams should have unique ids!');
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    /** @const {shaka.test.ManifestGenerator.Manifest} */
    this.manifest_ = manifest;

    /** @type {shaka.media.InitSegmentReference} */
    this.initSegmentReference_ = null;

    /** @type {string} */
    this.type = type;
    if (id != null) {
      /** @type {number} */
      this.id = id;
    }

    if (!isPartial) {
      let defaultMimeType = 'text/plain';
      let defaultCodecs = '';
      if (type == ContentType.AUDIO) {
        defaultMimeType = 'audio/mp4';
        defaultCodecs = 'mp4a.40.2';
      } else if (type == ContentType.VIDEO) {
        defaultMimeType = 'video/mp4';
        defaultCodecs = 'avc1.4d401f';
      } else if (type == ContentType.TEXT) {
        defaultMimeType = 'text/vtt';
      }

      const create =
          jasmine.createSpy('createSegmentIndex').and.callFake(() => {
            return Promise.resolve();
          });
      const shaka_ = manifest ? manifest.shaka_ : shaka;
      const segmentIndex = new shaka_.media.SegmentIndex([]);

      /** @type {?string} */
      this.originalId = null;
      /** @type {?string} */
      this.groupId = null;
      /** @type {shaka.extern.CreateSegmentIndexFunction} */
      this.createSegmentIndex = shaka.test.Util.spyFunc(create);
      /** @type {shaka.media.SegmentIndex} */
      this.segmentIndex = segmentIndex;
      /** @type {string} */
      this.mimeType = defaultMimeType;
      /** @type {string} */
      this.codecs = defaultCodecs;
      /** @type {(number|undefined)} */
      this.frameRate = undefined;
      /** @type {(string|undefined)} */
      this.pixelAspectRatio = undefined;
      /** @type {(number|undefined)} */
      this.bandwidth = undefined;
      /** @type {(number|undefined)} */
      this.width = undefined;
      /** @type {(number|undefined)} */
      this.height = undefined;
      /** @type {(string|undefined)} */
      this.kind = undefined;
      /** @type {boolean} */
      this.encrypted = false;
      /** @type {!Array.<shaka.extern.DrmInfo>} */
      this.drmInfos = [];
      /** @type {!Set.<string>} */
      this.keyIds = new Set();
      /** @type {string} */
      this.language = shaka.util.LanguageUtils.normalize(lang || 'und');
      /** @type {?string} */
      this.originalLanguage = lang || null;
      /** @type {?string} */
      this.label = label || null;
      /** @type {boolean} */
      this.primary = false;
      /** @type {?shaka.extern.Stream} */
      this.trickModeVideo = null;
      /** @type {Array.<string>} */
      this.emsgSchemeIdUris = null;
      /** @type {!Array.<string>} */
      this.roles = [];
      /** @type {boolean} */
      this.forced = false;
      /** @type {?number} */
      this.channelsCount = null;
      /** @type {?number} */
      this.audioSamplingRate = null;
      /** @type {boolean} */
      this.spatialAudio = false;
      /** @type {Map.<string, string>} */
      this.closedCaptions = null;
      /** @type {(string|undefined)} */
      this.hdr = undefined;
      /** @type {(string|undefined)} */
      this.videoLayout = undefined;
      /** @type {(string|undefined)} */
      this.tilesLayout = undefined;
      /** @type {?shaka.media.ManifestParser.AccessibilityPurpose} */
      this.accessibilityPurpose;
      /** @type {boolean} */
      this.external = false;
      /** @type {boolean} */
      this.fastSwitching = false;
    }

    /** @type {shaka.extern.Stream} */
    const foo = this;
    goog.asserts.assert(foo, 'Checking for type compatibility');
  }

  /**
   * @return {shaka.extern.Stream}
   * @private
   */
  build_() {
    return shaka.test.ManifestGenerator.buildCommon_(this);
  }

  /**
   * Adds a new DrmInfo to the current Stream.
   *
   * @param {string} keySystem
   * @param {function(!shaka.test.ManifestGenerator.DrmInfo)=} func
   */
  addDrmInfo(keySystem, func) {
    goog.asserts.assert(this.manifest_,
        'A top-level generated Manifest is required to use this method!');

    const drmInfo =
        new shaka.test.ManifestGenerator.DrmInfo(this.manifest_, keySystem);

    if (func) {
      func(drmInfo);
    }

    if (!this.drmInfos) {
      // This may be the case if this was created through addPartialStream.
      this.drmInfos = [];
    }
    this.drmInfos.push(drmInfo.build_());
  }

  /**
   * Sets the current stream to use segment template to create segments.
   *
   * @param {string} template An sprintf template that will take the segment
   *   index and give a URI.
   * @param {number} segmentDuration
   * @param {?number=} segmentSize
   */
  useSegmentTemplate(template, segmentDuration, segmentSize = null) {
    goog.asserts.assert(this.manifest_,
        'A top-level generated Manifest is required to use this method!');
    goog.asserts.assert(
        segmentDuration, 'Must pass a non-zero segment duration');

    const shaka_ = this.manifest_.shaka_;
    let totalDuration = this.manifest_.presentationTimeline.getDuration();
    goog.asserts.assert(
        isFinite(totalDuration), 'Must specify a manifest duration');
    if (!isFinite(totalDuration)) {
      // Without this, a mistake of an infinite duration would result in an
      // infinite loop and a crash, which would in turn prevent you from seeing
      // the above assertion fail.
      totalDuration = 0;
    }

    const segmentCount = totalDuration / segmentDuration;
    const references = [];

    for (let index = 0; index < segmentCount; index++) {
      const getUris = () => [sprintf(template, index)];
      const start = index * segmentDuration;
      const end = Math.min(totalDuration, (index + 1) * segmentDuration);
      references.push(new shaka_.media.SegmentReference(
          /* startTime= */ start,
          /* endTime= */ end,
          getUris,
          /* startByte= */ 0,
          /* endByte= */ segmentSize,
          this.initSegmentReference_,
          /* timestampOffset= */ 0,
          /* appendWindowStart= */ 0,
          /* appendWindowEnd= */ totalDuration));
    }
    this.segmentIndex = new shaka_.media.SegmentIndex(references);
    return this;
  }

  /**
   * Sets the current stream to use the given text stream.  It will serve a
   * single media segment at the given URI for the entire presentation.
   *
   * @param {string} uri
   */
  textStream(uri) {
    goog.asserts.assert(this.manifest_,
        'A top-level generated Manifest is required to use this method!');

    const duration = this.manifest_.presentationTimeline.getDuration();
    this.segmentIndex =
        this.manifest_.shaka_.media.SegmentIndex.forSingleSegment(
            /* startTime= */ 0, duration, [uri]);
  }

  /**
   * Sets the init segment of the current stream.
   *
   * @param {!Array.<string>} uris
   * @param {number} startByte
   * @param {?number} endByte
   * @param {null|shaka.extern.MediaQualityInfo=} mediaQuality
   */
  setInitSegmentReference(uris, startByte, endByte, mediaQuality) {
    goog.asserts.assert(this.manifest_,
        'A top-level generated Manifest is required to use this method!');

    const getUris = () => uris;
    this.initSegmentReference_ =
        new this.manifest_.shaka_.media.InitSegmentReference(
            getUris, startByte, endByte, mediaQuality);
  }

  /**
   * @param {string} mime
   * @param {string=} codecs
   */
  mime(mime, codecs) {
    this.mimeType = mime;
    this.codecs = codecs || '';
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  size(width, height) {
    this.width = width;
    this.height = height;
  }
};
