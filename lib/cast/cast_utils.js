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

goog.provide('shaka.cast.CastUtils');


/**
 * @namespace shaka.cast.CastUtils
 * @summary A set of cast utility functions and variables shared between sender
 *   and receiver.
 */


/**
 * HTMLMediaElement events that are proxied while casting.
 * @const {!Array.<string>}
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
  'volumechange'
];


/**
 * HTMLMediaElement attributes that are proxied while casting.
 * @const {!Array.<string>}
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
  'volume'
];


/**
 * HTMLMediaElement attributes that are transferred when casting begins.
 * @const {!Array.<string>}
 */
shaka.cast.CastUtils.VideoInitStateAttributes = [
  'loop',
  'playbackRate'
];


/**
 * HTMLMediaElement methods with no return value that are proxied while casting.
 * @const {!Array.<string>}
 */
shaka.cast.CastUtils.VideoVoidMethods = [
  'pause',
  'play'
];


/**
 * Player events that are proxied while casting.
 * @const {!Array.<string>}
 */
shaka.cast.CastUtils.PlayerEvents = [
  'adaptation',
  'buffering',
  'error',
  'texttrackvisibility',
  'trackschanged'
];


/**
 * Player getter methods that are proxied while casting.
 * @const {!Array.<string>}
 */
shaka.cast.CastUtils.PlayerGetterMethods = [
  'getConfiguration',
  'getManifestUri',
  'getPlaybackRate',
  'getTracks',
  'getStats',
  'isBuffering',
  'isLive',
  'isTextTrackVisible',
  'seekRange'
];


/**
 * Player getter and setter methods that are used to transfer state when casting
 * begins.
 * @const {!Array.<!Array.<string>>}
 */
shaka.cast.CastUtils.PlayerInitState = [
  ['getConfiguration', 'configure']
];


/**
 * Player getter and setter methods that are used to transfer state after
 * after load() is resolved.
 * @const {!Array.<!Array.<string>>}
 */
shaka.cast.CastUtils.PlayerInitAfterLoadState = [
  ['isTextTrackVisible', 'setTextTrackVisibility']
];


/**
 * Player methods with no return value that are proxied while casting.
 * @const {!Array.<string>}
 */
shaka.cast.CastUtils.PlayerVoidMethods = [
  'configure',
  'resetConfiguration',
  'trickPlay',
  'cancelTrickPlay',
  'selectTrack',
  'setTextTrackVisibility',
  'addTextTrack'
];


/**
 * Player methods returning a Promise that are proxied while casting.
 * @const {!Array.<string>}
 */
shaka.cast.CastUtils.PlayerPromiseMethods = [
  // The opt_manifestFactory method is not supported.
  'load',
  'unload'
];


/**
 * @typedef {{
 *   video: Object,
 *   player: Object,
 *   manifest: ?string,
 *   startTime: ?number
 * }}
 * @property {Object} video
 *   Dictionary of video properties to be set.
 * @property {Object} player
 *   Dictionary of player setters to be called.
 * @property {?string} manifest
 *   The currently-selected manifest, if present.
 * @property {?number} startTime
 *   The playback start time, if currently playing.
 */
shaka.cast.CastUtils.InitStateType;


/**
 * The namespace for Shaka messages on the cast bus.
 * @const {string}
 */
shaka.cast.CastUtils.MESSAGE_NAMESPACE = 'urn:x-cast:com.google.shaka.v2';


/**
 * Serialize as JSON, but specially encode things JSON will not otherwise
 * represent.
 * @param {?} thing
 * @return {string}
 */
shaka.cast.CastUtils.serialize = function(thing) {
  return JSON.stringify(thing, function(key, value) {
    if (key == 'manager') {
      // ABR manager can't be serialized.
      return undefined;
    }
    if (typeof value == 'function') {
      // Functions can't be (safely) serialized.
      return undefined;
    }
    if (value instanceof Event || value instanceof shaka.util.FakeEvent) {
      // Events don't serialize to JSON well because of the DOM objects
      // and other complex objects they contain.  So we strip these out.
      // Note that using Object.keys or JSON.stringify directly on the event
      // will not capture its properties.  We must use a for loop.
      var simpleEvent = {};
      for (var eventKey in value) {
        var eventValue = value[eventKey];
        if (eventValue && typeof eventValue == 'object') {
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
    if (value instanceof TimeRanges) {
      // TimeRanges must be unpacked into plain data for serialization.
      return shaka.cast.CastUtils.unpackTimeRanges_(value);
    }
    if (typeof value == 'number') {
      // NaN and infinity cannot be represented directly in JSON.
      if (isNaN(value)) return 'NaN';
      if (isFinite(value)) return value;
      if (value < 0) return '-Infinity';
      return 'Infinity';
    }
    return value;
  });
};


/**
 * Deserialize JSON using our special encodings.
 * @param {string} str
 * @return {?}
 */
shaka.cast.CastUtils.deserialize = function(str) {
  return JSON.parse(str, function(key, value) {
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
    }
    return value;
  });
};


/**
 * @param {!TimeRanges} ranges
 * @return {Object}
 * @private
 */
shaka.cast.CastUtils.unpackTimeRanges_ = function(ranges) {
  var obj = {
    '__type__': 'TimeRanges',  // a signal to deserialize
    'length': ranges.length,
    'start': [],
    'end': []
  };

  for (var i = 0; i < ranges.length; ++i) {
    obj['start'].push(ranges.start(i));
    obj['end'].push(ranges.end(i));
  }

  return obj;
};


/**
 * Creates a simulated TimeRanges object from data sent by the cast receiver.
 * @param {?} obj
 * @return {{
 *   length: number,
 *   start: function(number): number,
 *   end: function(number): number
 * }}
 * @private
 */
shaka.cast.CastUtils.simulateTimeRanges_ = function(obj) {
  return {
    length: obj.length,
    // NOTE: a more complete simulation would throw when |i| was out of range,
    // but for simplicity we will assume a well-behaved application that uses
    // length instead of catch to stop iterating.
    start: function(i) { return obj.start[i]; },
    end: function(i) { return obj.end[i]; }
  };
};
