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

goog.provide('shaka.test.ManifestGenerator');


/**
 * @summary
 * A helper class used to generate manifests.  This is done by chaining multiple
 * calls together that build the manifest.  All the methods can appear at any
 * point and will apply to the most recent substructure.  For example, the
 * language() method sets the language of the most recent variant.
 */
shaka.test.ManifestGenerator = class {
  /** @param {*=} shaka */
  constructor(shaka) {
    /** @private {?} */
    this.shaka_ = shaka || window['shaka'];

    const timeline = new this.shaka_.media.PresentationTimeline(0, 0);
    timeline.setSegmentAvailabilityDuration(Infinity);
    timeline.notifyMaxSegmentDuration(10);

    /** @private {shaka.extern.Manifest} */
    this.manifest_ = {
      presentationTimeline: timeline,
      periods: [],
      offlineSessionIds: [],
      minBufferTime: 0,
    };

    /** @private {shaka.extern.Stream|shaka.extern.Variant|null} */
    this.lastObjectAdded_ = null;

    /** @private {?shaka.extern.Stream} */
    this.lastStreamAdded_ = null;
  }

  /** @return {shaka.extern.Manifest} */
  build() {
    return this.manifest_;
  }

  /**
   * Sets a specified presentation timeline.
   *
   * @param {!shaka.media.PresentationTimeline} timeline
   * @return {!shaka.test.ManifestGenerator}
   */
  setTimeline(timeline) {
    this.manifest_.presentationTimeline = timeline;
    return this;
  }

  /**
   * Sets the duration of the presentation timeline.
   *
   * @param {number} duration
   * @return {!shaka.test.ManifestGenerator}
   */
  setPresentationDuration(duration) {
    this.manifest_.presentationTimeline.setDuration(duration);
    return this;
  }

  /**
   * Converts the presentation timeline into jasmine.any.
   *
   * @return {!shaka.test.ManifestGenerator}
   */
  anyTimeline() {
    this.manifest_.presentationTimeline =
        jasmine.any(this.shaka_.media.PresentationTimeline);
    return this;
  }

  /**
   * Sets the minimum buffer time.
   *
   * @param {number} minBufferTime
   * @return {!shaka.test.ManifestGenerator}
   */
  minBufferTime(minBufferTime) {
    this.manifest_.minBufferTime = minBufferTime;
    return this;
  }

  /**
   * Adds a new Period to the manifest.
   *
   * @param {number} startTime
   * @return {!shaka.test.ManifestGenerator}
   */
  addPeriod(startTime) {
    this.manifest_.periods.push(
        {
          startTime: startTime,
          variants: [],
          textStreams: [],
        });
    this.lastObjectAdded_ = null;
    this.lastStreamAdded_ = null;
    return this;
  }

  // Variant methods {{{
  /**
   * Adds a new variant to the manifest.
   *
   * @param {number} id
   * @return {!shaka.test.ManifestGenerator}
   */
  addVariant(id) {
    const period = this.currentPeriod_();
    const variant = {
      id: id,
      language: 'und',
      bandwidth: 0,
      primary: false,
      drmInfos: [],
      audio: null,
      video: null,
      allowedByApplication: true,
      allowedByKeySystem: true,
    };
    period.variants.push(variant);
    this.lastObjectAdded_ = variant;
    this.lastStreamAdded_ = null;
    return this;
  }

  /**
   * Adds a new partial variant that, when used with jasmine, will only compare
   * the properties explicitly set on it.  Note that this will default to
   * having |null| audio and video streams.
   *
   * @param {number=} id
   * @return {!shaka.test.ManifestGenerator}
   */
  addPartialVariant(id) {
    const period = this.currentPeriod_();

    const variant = /** @type {shaka.extern.Variant} */ ({
      audio: null,
      video: null,
    });
    if (id != null) {
      variant.id = id;
    }
    this.lastObjectAdded_ = variant;
    this.lastStreamAdded_ = null;
    period.variants.push(/** @type {shaka.extern.Variant} */ (
      jasmine.objectContaining(variant)));

    return this;
  }

  /**
   * Sets the language of the most recent variant or text stream.
   *
   * @param {string} language
   * @return {!shaka.test.ManifestGenerator}
   */
  language(language) {
    this.currentStreamOrVariant_().language = language;
    return this;
  }

  /**
   * Sets that the most recent variant or text stream is primary.
   *
   * @return {!shaka.test.ManifestGenerator}
   */
  primary() {
    this.currentStreamOrVariant_().primary = true;
    return this;
  }

  /**
   * Sets the bandwidth of the current stream.
   *
   * @param {number} bandwidth
   * @return {!shaka.test.ManifestGenerator}
   */
  bandwidth(bandwidth) {
    this.currentStreamOrVariant_().bandwidth = bandwidth;
    return this;
  }

  /**
   * Sets that the current variant is disallowed by the application.
   *
   * @return {!shaka.test.ManifestGenerator}
   */
  disallowByApplication() {
    const variant = this.currentVariant_();
    variant.allowedByApplication = false;
    return this;
  }

  /**
   * Sets that the current variant is disallowed by the key system.
   *
   * @return {!shaka.test.ManifestGenerator}
   */
  disallowByKeySystem() {
    const variant = this.currentVariant_();
    variant.allowedByKeySystem = false;
    return this;
  }
  // }}}

  // DrmInfo methods {{{
  /**
   * Adds a new DrmInfo to the current variant.
   *
   * @param {string} keySystem
   * @return {!shaka.test.ManifestGenerator}
   */
  addDrmInfo(keySystem) {
    const variant = this.currentVariant_();
    if (!variant.drmInfos) {
      variant.drmInfos = [];
    }
    variant.drmInfos.push({
      keySystem: keySystem,
      licenseServerUri: '',
      distinctiveIdentifierRequired: false,
      persistentStateRequired: false,
      audioRobustness: '',
      videoRobustness: '',
      serverCertificate: null,
      initData: null,
      keyIds: [],
    });
    return this;
  }

  /**
   * Sets the license server URI of the current DRM info.
   *
   * @param {string} uri
   * @return {!shaka.test.ManifestGenerator}
   */
  licenseServerUri(uri) {
    const drmInfo = this.currentDrmInfo_();
    drmInfo.licenseServerUri = uri;
    return this;
  }

  /**
   * Sets that distinctive identifier is required on the current DRM info.
   *
   * @return {!shaka.test.ManifestGenerator}
   */
  distinctiveIdentifierRequired() {
    const drmInfo = this.currentDrmInfo_();
    drmInfo.distinctiveIdentifierRequired = true;
    return this;
  }

  /**
   * Sets that persistent state is required on the current DRM info.
   *
   * @return {!shaka.test.ManifestGenerator}
   */
  persistentStateRequired() {
    const drmInfo = this.currentDrmInfo_();
    drmInfo.persistentStateRequired = true;
    return this;
  }

  /**
   * Sets the audio robustness of the current DRM info.
   *
   * @param {string} robustness
   * @return {!shaka.test.ManifestGenerator}
   */
  audioRobustness(robustness) {
    const drmInfo = this.currentDrmInfo_();
    drmInfo.audioRobustness = robustness;
    return this;
  }

  /**
   * Sets the video robustness of the current DRM info.
   *
   * @param {string} robustness
   * @return {!shaka.test.ManifestGenerator}
   */
  videoRobustness(robustness) {
    const drmInfo = this.currentDrmInfo_();
    drmInfo.videoRobustness = robustness;
    return this;
  }

  /**
   * Adds a new init data to the current DRM info.
   *
   * @param {string} type
   * @param {!Uint8Array} buffer
   * @return {!shaka.test.ManifestGenerator}
   */
  addInitData(type, buffer) {
    const drmInfo = this.currentDrmInfo_();
    if (!drmInfo.initData) {
      drmInfo.initData = [];
    }
    drmInfo.initData.push({initData: buffer, initDataType: type, keyId: null});
    return this;
  }

  /**
   * Adds a new 'cenc' init data to the current DRM info.
   *
   * @param {string} base64
   * @return {!shaka.test.ManifestGenerator}
   */
  addCencInitData(base64) {
    const drmInfo = this.currentDrmInfo_();
    if (!drmInfo.initData) {
      drmInfo.initData = [];
    }

    const buffer = shaka.util.Uint8ArrayUtils.fromBase64(base64);
    drmInfo.initData.push({initData: buffer, initDataType: 'cenc'});
    return this;
  }
  // }}}

  // Stream methods {{{
  /**
   * Sets video stream of the current variant.
   *
   * @param {number} id
   * @return {!shaka.test.ManifestGenerator}
   */
  addVideo(id) {
    goog.asserts.assert(!this.isIdUsed_(id), 'Streams should have unique ids!');

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const stream = this.createStream_(id, ContentType.VIDEO, 'und');

    this.currentVariant_().video = stream;
    this.lastStreamAdded_ = stream;
    this.lastObjectAdded_ = stream;

    return this;
  }

  /**
   * Sets video stream of the current variant.
   *
   * @param {number} id
   * @return {!shaka.test.ManifestGenerator}
   */
  addAudio(id) {
    goog.asserts.assert(!this.isIdUsed_(id), 'Streams should have unique ids!');

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const variant = this.currentVariant_();
    const stream = this.createStream_(id, ContentType.AUDIO, variant.language);

    variant.audio = stream;
    this.lastStreamAdded_ = stream;
    this.lastObjectAdded_ = stream;

    return this;
  }

  /**
   * Adds a text stream to the current period.
   *
   * @param {number} id
   * @return {!shaka.test.ManifestGenerator}
   */
  addTextStream(id) {
    goog.asserts.assert(!this.isIdUsed_(id), 'Streams should have unique ids!');

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const stream = this.createStream_(id, ContentType.TEXT, 'und');

    this.currentPeriod_().textStreams.push(stream);
    this.lastObjectAdded_ = stream;
    this.lastStreamAdded_ = stream;

    return this;
  }

  /**
   * Adds an existing stream to the current variant.
   *
   * @param {number} id
   * @return {!shaka.test.ManifestGenerator}
   */
  addExistingStream(id) {
    const ManifestGenerator = shaka.test.ManifestGenerator;
    const period = this.currentPeriod_();
    let found = false;
    for (let variant of period.variants) {
      variant = ManifestGenerator.realObj_(variant);
      if (variant.audio && ManifestGenerator.realObj_(variant.audio).id == id) {
        this.currentVariant_().audio = variant.audio;
        found = true;
        break;
      } else if (variant.video &&
                 ManifestGenerator.realObj_(variant.video).id == id) {
        this.currentVariant_().video = variant.video;
        found = true;
        break;
      }
    }

    goog.asserts.assert(found, 'Must list an existing stream ID.');
    // Reset the last set fields so we assert if we try to change an existing
    // stream.  The caller must create a new stream before being able to change
    // their properties.
    this.lastObjectAdded_ = null;
    this.lastStreamAdded_ = null;
    return this;
  }

  /**
   * Adds a "partial" stream which, when used with jasmine, will only compare
   * the properties that were explicitly given to it.  All other properties will
   * be ignored.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} type
   * @param {number=} id
   * @return {!shaka.test.ManifestGenerator}
   */
  addPartialStream(type, id) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const stream = /** @type {shaka.extern.Stream} */ ({type: type});
    if (id != null) {
      stream.id = id;
    }
    this.lastObjectAdded_ = stream;
    this.lastStreamAdded_ = stream;

    const streamObj =
    /** @type {shaka.extern.Stream} */ (jasmine.objectContaining(stream));
    if (type == ContentType.TEXT) {
      const period = this.currentPeriod_();
      period.textStreams.push(streamObj);
    } else {
      const variant = this.currentVariant_();
      if (type == ContentType.AUDIO) {
        variant.audio = streamObj;
      } else {
        variant.video = streamObj;
      }
    }

    return this;
  }

  /**
   * Creates a new stream.
   *
   * @param {number} id
   * @param {string} type
   * @param {string} language
   * @return {!shaka.extern.Stream}
   * @private
   */
  createStream_(id, type, language) {
    goog.asserts.assert(!this.isIdUsed_(id),
        'Streams should have unique ids!');

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
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
    const find =
        jasmine.createSpy('findSegmentPosition').and.returnValue(null);
    const get =
        jasmine.createSpy('getSegmentReference').and.returnValue(null);

    /** @type {shaka.extern.Stream} */
    const stream = {
      id: id,
      originalId: null,
      createSegmentIndex: shaka.test.Util.spyFunc(create),
      findSegmentPosition: shaka.test.Util.spyFunc(find),
      getSegmentReference: shaka.test.Util.spyFunc(get),
      initSegmentReference: null,
      presentationTimeOffset: 0,
      mimeType: defaultMimeType,
      codecs: defaultCodecs,
      frameRate: undefined,
      bandwidth: undefined,
      width: undefined,
      height: undefined,
      kind: undefined,
      encrypted: false,
      keyId: null,
      language: language,
      label: null,
      type: type,
      primary: false,
      trickModeVideo: null,
      emsgSchemeIdUris: null,
      roles: [],
      channelsCount: null,
      closedCaptions: null,
    };
    return stream;
  }

  /**
   * Sets the current stream to use segment template to create segments.
   *
   * @param {string} template An sprintf template that will take the segment
   *   index and give a URI.
   * @param {number} segmentDuration
   * @param {?number=} segmentSize
   * @return {!shaka.test.ManifestGenerator}
   */
  useSegmentTemplate(template, segmentDuration, segmentSize = null) {
    const stream = this.currentStream_();
    const totalDuration = this.manifest_.presentationTimeline.getDuration();
    const segmentCount = totalDuration / segmentDuration;
    stream.createSegmentIndex = () => Promise.resolve();
    stream.findSegmentPosition = (time) => Math.floor(time / segmentDuration);
    stream.getSegmentReference = (index) => {
      goog.asserts.assert(!isNaN(index), 'Invalid index requested!');
      if (index < 0 || index >= segmentCount || isNaN(index)) {
        return null;
      }
      const getUris = () => [sprintf(template, index)];
      const start = index * segmentDuration;
      const end = Math.min(totalDuration, (index + 1) * segmentDuration);
      return new this.shaka_.media.SegmentReference(
          index, start, end, getUris, 0, segmentSize);
    };
    return this;
  }

  /**
   * Sets the current stream to use the given text stream.  It will serve a
   * single media segment at the given URI for the entire Period.
   *
   * @param {string} uri
   * @return {!shaka.test.ManifestGenerator}
   */
  textStream(uri) {
    const stream = this.currentStream_();
    const duration = this.manifest_.presentationTimeline.getDuration();
    const getUris = () => [uri];

    stream.createSegmentIndex = () => Promise.resolve();
    stream.findSegmentPosition = (time) =>
      (time >= 0 && time < duration ? 1 : null);
    stream.getSegmentReference = (position) => {
      if (position != 1) {
        return null;
      }
      const startTime = 0;
      return new this.shaka_.media.SegmentReference(
          position, startTime, duration, getUris, 0, null);
    };

    return this;
  }

  /**
   * Force a delay in createSegmentIndex to delay setup.  This can be useful in
   * certain tests.
   *
   * @return {!shaka.test.ManifestGenerator}
   */
  delayCreateSegmentIndex() {
    this.currentStream_().createSegmentIndex = () => shaka.test.Util.delay(1);
    return this;
  }

  /**
   * Converts the init segment of the current stream into jasmine.any.
   *
   * @return {!shaka.test.ManifestGenerator}
   */
  anyInitSegment() {
    const stream = this.currentStream_();
    stream.initSegmentReference =
      /** @type {shaka.media.InitSegmentReference} */ (
        jasmine.any(this.shaka_.media.InitSegmentReference));
    return this;
  }

  /**
   * Sets the init segment of the current stream to null.
   *
   * @return {!shaka.test.ManifestGenerator}
   */
  nullInitSegment() {
    const stream = this.currentStream_();
    stream.initSegmentReference = null;
    return this;
  }

  /**
   * Sets the init segment of the current stream.
   *
   * @param {!Array.<string>} uris
   * @param {number} startByte
   * @param {?number} endByte
   * @return {!shaka.test.ManifestGenerator}
   */
  initSegmentReference(uris, startByte, endByte) {
    const stream = this.currentStream_();
    const getUris = () => uris;
    stream.initSegmentReference =
        new this.shaka_.media.InitSegmentReference(getUris, startByte, endByte);
    return this;
  }

  /**
   * Sets the presentation time offset of the current stream.
   *
   * @param {number} pto
   * @return {!shaka.test.ManifestGenerator}
   */
  presentationTimeOffset(pto) {
    const stream = this.currentStream_();
    stream.presentationTimeOffset = pto;
    return this;
  }

  /**
   * Sets the MIME type of the current stream.
   *
   * @param {string} mime
   * @param {string=} codecs
   * @return {!shaka.test.ManifestGenerator}
   */
  mime(mime, codecs) {
    const stream = this.currentStream_();
    stream.mimeType = mime;
    stream.codecs = codecs || '';
    return this;
  }

  /**
   * Sets the closed captions of the current stream.
   *
   * @param {Map.<string, string>} closedCaptions
   * @return {!shaka.test.ManifestGenerator}
   */
  closedCaptions(closedCaptions) {
    const stream = this.currentStream_();
    stream.closedCaptions = closedCaptions;
    return this;
  }

  /**
   * Sets the framerate of the current stream.
   *
   * @param {number} frameRate
   * @return {!shaka.test.ManifestGenerator}
   */
  frameRate(frameRate) {
    const stream = this.currentStream_();
    stream.frameRate = frameRate;
    return this;
  }

  /**
   * Sets the width and height of the current stream.
   *
   * @param {number} width
   * @param {number} height
   * @return {!shaka.test.ManifestGenerator}
   */
  size(width, height) {
    const stream = this.currentStream_();
    stream.width = width;
    stream.height = height;
    return this;
  }

  /**
   * Sets the kind of the current stream.
   *
   * @param {string} kind
   * @return {!shaka.test.ManifestGenerator}
   */
  kind(kind) {
    const stream = this.currentStream_();
    stream.kind = kind;
    return this;
  }

  /**
   * Sets the encrypted flag of the current stream.
   *
   * @param {boolean} encrypted
   * @return {!shaka.test.ManifestGenerator}
   */
  encrypted(encrypted) {
    const stream = this.currentStream_();
    stream.encrypted = encrypted;
    return this;
  }

  /**
   * Sets the key ID of the current stream.
   *
   * @param {string} keyId
   * @return {!shaka.test.ManifestGenerator}
   */
  keyId(keyId) {
    const stream = this.currentStream_();
    stream.keyId = keyId;
    return this;
  }

  /**
   * Sets the label of the language of the most recent stream stream.
   *
   * @param {string} label
   * @return {!shaka.test.ManifestGenerator}
   */
  label(label) {
    this.currentStream_().label = label;
    return this;
  }

  /**
   * Sets the roles of the current stream.
   * @param {!Array.<string>} roles
   * @return {!shaka.test.ManifestGenerator}
   */
  roles(roles) {
    const stream = this.currentStream_();
    stream.roles = roles;
    return this;
  }

  /**
   * Sets the count of the channels of the current stream.
   * @param {number} count
   * @return {!shaka.test.ManifestGenerator}
   */
  channelsCount(count) {
    const stream = this.currentStream_();
    stream.channelsCount = count;
    return this;
  }

  /**
   * Sets the original ID of the current stream.
   *
   * @param {?string} originalId
   * @return {!shaka.test.ManifestGenerator}
   */
  originalId(originalId) {
    const stream = this.currentStream_();
    stream.originalId = originalId;
    return this;
  }
  // }}}

  // Private methods {{{
  /**
   * Gets the most recent period.
   * @return {shaka.extern.Period}
   * @private
   */
  currentPeriod_() {
    goog.asserts.assert(this.manifest_.periods.length > 0,
        'Must call addPeriod() at least once.');
    return this.manifest_.periods[this.manifest_.periods.length - 1];
  }

  /**
   * Gets the most recent variant.
   * @return {shaka.extern.Variant}
   * @private
   */
  currentVariant_() {
    const realObj_ = shaka.test.ManifestGenerator.realObj_;
    const period = this.currentPeriod_();
    goog.asserts.assert(period.variants.length > 0,
        'Must call addVariant() at least once.');
    return realObj_(period.variants[period.variants.length - 1]);
  }

  /**
   * Gets the most recent variant or text stream.
   * @return {shaka.extern.Stream|shaka.extern.Variant}
   * @private
   */
  currentStreamOrVariant_() {
    goog.asserts.assert(this.lastObjectAdded_,
        'Must call addVariant() or addTextStream()' +
                        ' at least once.');
    return this.lastObjectAdded_;
  }

  /**
   * Gets the most recent DRM info.
   * @return {shaka.extern.DrmInfo}
   * @private
   */
  currentDrmInfo_() {
    const realObj_ = shaka.test.ManifestGenerator.realObj_;
    const variant = this.currentVariant_();
    goog.asserts.assert(variant.drmInfos.length > 0,
        'Must call addDrmInfo() at least once.');
    return realObj_(variant.drmInfos[variant.drmInfos.length - 1]);
  }

  /**
   * Gets the most recent stream.
   * @return {shaka.extern.Stream}
   * @private
   */
  currentStream_() {
    goog.asserts.assert(this.lastStreamAdded_,
        'Must add at least one stream.');
    return this.lastStreamAdded_;
  }

  /**
   * Returns true if current period has a stream with a given id.
   *
   * @param {number} id
   * @return {boolean}
   * @private
   */
  isIdUsed_(id) {
    const ManifestGenerator = shaka.test.ManifestGenerator;
    for (const period of this.manifest_.periods) {
      for (const wrappedVariant of period.variants) {
        const variant = ManifestGenerator.realObj_(wrappedVariant);
        if ((variant.video &&
             (ManifestGenerator.realObj_(variant.video).id == id)) ||
            (variant.audio &&
             (ManifestGenerator.realObj_(variant.audio).id == id))) {
          return true;
        }

        for (const wrappedText of period.textStreams) {
          if (ManifestGenerator.realObj_(wrappedText).id == id) {
            return true;
          }
        }
      }
    }

    return false;
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
  // }}}
};
