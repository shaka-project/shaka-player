/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cast.CastUtils');

goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.util.FakeEvent');


/**
 * @summary A set of cast utility functions and variables shared between sender
 *   and receiver.
 */
shaka.cast.CastUtils = class {
  /**
   * Serialize as JSON, but specially encode things JSON will not otherwise
   * represent.
   * @param {?} thing
   * @return {string}
   */
  static serialize(thing) {
    return JSON.stringify(thing, (key, value) => {
      if (typeof value == 'function') {
        // Functions can't be (safely) serialized.
        return undefined;
      }

      if (value instanceof Event || value instanceof shaka.util.FakeEvent) {
        // Events don't serialize to JSON well because of the DOM objects
        // and other complex objects they contain, so we strip these out.
        // Note that using Object.keys or JSON.stringify directly on the event
        // will not capture its properties.  We must use a for loop.
        const simpleEvent = {};
        for (const eventKey in value) {
          const eventValue = value[eventKey];
          if (eventValue && typeof eventValue == 'object') {
            if (eventKey == 'detail') {
              // Keep the detail value, because it contains important
              // information for diagnosing errors.
              simpleEvent[eventKey] = eventValue;
            }
            // Strip out non-null object types because they are complex and we
            // don't need them.
          } else if (eventKey in Event) {
            // Strip out keys that are found on Event itself because they are
            // class-level constants we don't need, like Event.MOUSEMOVE == 16.
          } else {
            simpleEvent[eventKey] = eventValue;
          }
        }
        return simpleEvent;
      }

      if (value instanceof Error) {
        // Errors don't serialize to JSON well, either.  TypeError, for example,
        // turns in "{}", leading to messages like "Error UNKNOWN.UNKNOWN" when
        // deserialized on the sender and displayed in the demo app.
        return shaka.cast.CastUtils.unpackError_(value);
      }

      if (value instanceof TimeRanges) {
        // TimeRanges must be unpacked into plain data for serialization.
        return shaka.cast.CastUtils.unpackTimeRanges_(value);
      }

      if (ArrayBuffer.isView(value) &&
      /** @type {TypedArray} */(value).BYTES_PER_ELEMENT === 1) {
        // Some of our code cares about Uint8Arrays actually being Uint8Arrays,
        // so this gives them special treatment.
        return shaka.cast.CastUtils.unpackUint8Array_(
            /** @type {!Uint8Array} */(value));
      }

      if (typeof value == 'number') {
        // NaN and infinity cannot be represented directly in JSON.
        if (isNaN(value)) {
          return 'NaN';
        }
        if (isFinite(value)) {
          return value;
        }
        if (value < 0) {
          return '-Infinity';
        }
        return 'Infinity';
      }

      return value;
    });
  }


  /**
   * Deserialize JSON using our special encodings.
   * @param {string} str
   * @return {?}
   */
  static deserialize(str) {
    return JSON.parse(str, (key, value) => {
      if (value == 'NaN') {
        return NaN;
      } else if (value == '-Infinity') {
        return -Infinity;
      } else if (value == 'Infinity') {
        return Infinity;
      } else if (value && typeof value == 'object' &&
                 value['__type__'] == 'TimeRanges') {
        // TimeRanges objects have been unpacked and sent as plain data.
        // Simulate the original TimeRanges object.
        return shaka.cast.CastUtils.simulateTimeRanges_(value);
      } else if (value && typeof value == 'object' &&
                 value['__type__'] == 'Uint8Array') {
        return shaka.cast.CastUtils.makeUint8Array_(value);
      } else if (value && typeof value == 'object' &&
                 value['__type__'] == 'Error') {
        return shaka.cast.CastUtils.makeError_(value);
      }
      return value;
    });
  }


  /**
   * @param {!TimeRanges} ranges
   * @return {!Object}
   * @private
   */
  static unpackTimeRanges_(ranges) {
    const obj = {
      '__type__': 'TimeRanges',  // a signal to deserialize
      'length': ranges.length,
      'start': [],
      'end': [],
    };

    const TimeRangesUtils = shaka.media.TimeRangesUtils;
    for (const {start, end} of TimeRangesUtils.getBufferedInfo(ranges)) {
      obj['start'].push(start);
      obj['end'].push(end);
    }

    return obj;
  }


  /**
   * Creates a simulated TimeRanges object from data sent by the cast receiver.
   * @param {?} obj
   * @return {{
   *   length: number,
   *   start: function(number): number,
   *   end: function(number): number,
   * }}
   * @private
   */
  static simulateTimeRanges_(obj) {
    return {
      length: obj.length,
      // NOTE: a more complete simulation would throw when |i| was out of range,
      // but for simplicity we will assume a well-behaved application that uses
      // length instead of catch to stop iterating.
      start: (i) => { return obj.start[i]; },
      end: (i) => { return obj.end[i]; },
    };
  }


  /**
   * @param {!Uint8Array} array
   * @return {!Object}
   * @private
   */
  static unpackUint8Array_(array) {
    return {
      '__type__': 'Uint8Array',  // a signal to deserialize
      'entries': Array.from(array),
    };
  }


  /**
   * Creates a Uint8Array object from data sent by the cast receiver.
   * @param {?} obj
   * @return {!Uint8Array}
   * @private
   */
  static makeUint8Array_(obj) {
    return new Uint8Array(/** @type {!Array<number>} */ (obj['entries']));
  }


  /**
   * @param {!Error} error
   * @return {!Object}
   * @private
   */
  static unpackError_(error) {
    // None of the properties in TypeError are enumerable, but there are some
    // common Error properties we expect.  We also enumerate any enumerable
    // properties and "own" properties of the type, in case there is an Error
    // subtype with additional properties we don't know about in advance.
    const properties = new Set(['name', 'message', 'stack']);
    for (const key in error) {
      properties.add(key);
    }
    for (const key of Object.getOwnPropertyNames(error)) {
      properties.add(key);
    }

    const contents = {};
    for (const key of properties) {
      contents[key] = error[key];
    }

    return {
      '__type__': 'Error',  // a signal to deserialize
      'contents': contents,
    };
  }


  /**
   * Creates an Error object from data sent by the cast receiver.
   * @param {?} obj
   * @return {!Error}
   * @private
   */
  static makeError_(obj) {
    const contents = obj['contents'];
    const error = new Error(contents['message']);
    for (const key in contents) {
      error[key] = contents[key];
    }
    return error;
  }
};

/**
 * HTMLMediaElement events that are proxied while casting.
 * @const {!Array<string>}
 */
shaka.cast.CastUtils.VideoEvents = [
  'ended',
  'play',
  'playing',
  'pause',
  'pausing',
  'ratechange',
  'seeked',
  'seeking',
  'timeupdate',
  'volumechange',
];


/**
 * HTMLMediaElement attributes that are proxied while casting.
 * @const {!Array<string>}
 */
shaka.cast.CastUtils.VideoAttributes = [
  'buffered',
  'currentTime',
  'duration',
  'ended',
  'loop',
  'muted',
  'paused',
  'playbackRate',
  'seeking',
  'videoHeight',
  'videoWidth',
  'volume',
];


/**
 * HTMLMediaElement attributes that are transferred when casting begins.
 * @const {!Array<string>}
 */
shaka.cast.CastUtils.VideoInitStateAttributes = [
  'loop',
  'playbackRate',
];


/**
 * HTMLMediaElement methods with no return value that are proxied while casting.
 * @const {!Array<string>}
 */
shaka.cast.CastUtils.VideoVoidMethods = [
  'pause',
  'play',
];


/**
 * Player getter methods that are proxied while casting.
 * The key is the method, the value is the frequency of updates.
 * Frequency 1 translates to every update; frequency 2 to every 2 updates, etc.
 * @const {!Map<string, number>}
 */
shaka.cast.CastUtils.PlayerGetterMethods = new Map()
    // NOTE: The 'drmInfo' property is not proxied, as it is very large.
    .set('getAssetUri', 2)
    .set('getAudioLanguages', 4)
    .set('getAudioLanguagesAndRoles', 4)
    .set('getBufferFullness', 1)
    .set('getBufferedInfo', 2)
    .set('getExpiration', 2)
    .set('getKeyStatuses', 2)
    // NOTE: The 'getManifest' property is not proxied, as it is very large.
    // NOTE: The 'getManifestParserFactory' property is not proxied, as it would
    // not serialize.
    .set('getPlaybackRate', 2)
    .set('getTextLanguages', 4)
    .set('getTextLanguagesAndRoles', 4)
    .set('isAudioOnly', 10)
    .set('isBuffering', 1)
    .set('isInProgress', 1)
    .set('isLive', 10)
    .set('isTextTrackVisible', 1)
    .set('isVideoOnly', 10)
    .set('keySystem', 10)
    .set('seekRange', 1)
    .set('getLoadMode', 10)
    .set('getManifestType', 10)
    .set('isFullyLoaded', 1)
    .set('isEnded', 1)
    .set('getBandwidthEstimate', 1);


/**
 * Player getter methods with data large enough to be sent in their own update
 * messages, to reduce the size of each message.  The format of this is
 * identical to PlayerGetterMethods.
 * @const {!Map<string, number>}
 */
shaka.cast.CastUtils.LargePlayerGetterMethods = new Map()
    // NOTE: The 'getSharedConfiguration' property is not proxied as it would
    //       not be possible to share a reference.
    .set('getConfiguration', 4)
    .set('getConfigurationForLowLatency', 4)
    .set('getStats', 5)
    .set('getAudioTracks', 2)
    .set('getChaptersTracks', 2)
    .set('getImageTracks', 2)
    .set('getVideoTracks', 2)
    .set('getTextTracks', 2)
    .set('getVariantTracks', 2);


/**
 * Player getter methods that are proxied while casting, but only when casting
 * a livestream.
 * The key is the method, the value is the frequency of updates.
 * Frequency 1 translates to every update; frequency 2 to every 2 updates, etc.
 * @const {!Map<string, number>}
 */
shaka.cast.CastUtils.PlayerGetterMethodsThatRequireLive = new Map()
    .set('getPlayheadTimeAsDate', 1)
    .set('getPresentationStartTimeAsDate', 20)
    .set('getSegmentAvailabilityDuration', 20);


/**
 * Player getter and setter methods that are used to transfer state when casting
 * begins.
 * @const {!Array<!Array<string>>}
 */
shaka.cast.CastUtils.PlayerInitState = [
  [
    'getConfiguration',
    'configure',
    'getConfigurationForLowLatency',
    'configurationForLowLatency',
  ],
];


/**
 * Player getter and setter methods that are used to transfer state after
 * load() is resolved.
 * @const {!Array<!Array<string>>}
 */
shaka.cast.CastUtils.PlayerInitAfterLoadState = [
  ['isTextTrackVisible', 'setTextTrackVisibility'],
];


/**
 * Player methods with no return value that are proxied while casting.
 * @const {!Array<string>}
 */
shaka.cast.CastUtils.PlayerVoidMethods = [
  'cancelTrickPlay',
  'configure',
  'configurationForLowLatency',
  'getChapters',
  'resetConfiguration',
  'retryStreaming',
  'selectAudioLanguage',
  'selectAudioTrack',
  'selectTextLanguage',
  'selectTextTrack',
  'selectVariantTrack',
  'selectVariantsByLabel',
  'selectVideoTrack',
  'setTextTrackVisibility',
  'trickPlay',
  'updateStartTime',
  'goToLive',
  'useTrickPlayTrackIfAvailable',
];


/**
 * Player methods returning a Promise that are proxied while casting.
 * @const {!Array<string>}
 */
shaka.cast.CastUtils.PlayerPromiseMethods = [
  'addChaptersTrack',
  'addTextTrackAsync',
  'addThumbnailsTrack',
  'getAllThumbnails',
  'getChaptersAsync',
  'getThumbnails',
  'attach',
  'attachCanvas',
  'detach',
  // The manifestFactory parameter of load is not supported.
  'load',
  'unload',
];


/**
 * @typedef {{
 *   video: Object,
 *   player: Object,
 *   manifest: ?string,
 *   startTime: ?number,
 *   addThumbnailsTrackCalls: !Array<?>,
 *   addTextTrackAsyncCalls: !Array<?>,
 *   addChaptersTrackCalls: !Array<?>,
 * }}
 * @property {Object} video
 *   Dictionary of video properties to be set.
 * @property {Object} player
 *   Dictionary of player setters to be called.
 * @property {?string} manifest
 *   The currently-selected manifest, if present.
 * @property {?number} startTime
 *   The playback start time, if currently playing.
 * @property {!Array<?>} addThumbnailsTrackCalls
 *   List of parameters with which addThumbnailsTrack was called.
 * @property {!Array<?>} addTextTrackAsyncCalls
 *   List of parameters with which addTextTrackAsync was called.
 * @property {!Array<?>} addChaptersTrackCalls
 *   List of parameters with which addChaptersTrack was called.
 */
shaka.cast.CastUtils.InitStateType;


/**
 * The namespace for Shaka messages on the cast bus.
 * @const {string}
 */
shaka.cast.CastUtils.SHAKA_MESSAGE_NAMESPACE = 'urn:x-cast:com.google.shaka.v2';


/**
 * The namespace for generic messages on the cast bus.
 * @const {string}
 */
shaka.cast.CastUtils.GENERIC_MESSAGE_NAMESPACE =
    'urn:x-cast:com.google.cast.media';
