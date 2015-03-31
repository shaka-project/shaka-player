/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview A utility to simplify the creation of fake events.
 */

goog.provide('shaka.util.FakeEvent');

goog.require('shaka.asserts');


/**
 * @namespace shaka.util.FakeEvent
 * @summary A utility to simplify the creation of fake events.
 */


/**
 * Return an Event object based on the dictionary.
 * The event should contain all of the same properties from the dict.
 * @param {!Object} dict
 * @return {!Event}
 */
shaka.util.FakeEvent.create = function(dict) {
  var event = new CustomEvent(dict.type, {
    detail: dict.detail,
    bubbles: !!dict.bubbles
  });
  // NOTE: In strict mode, we can't overwrite existing properties, so we only
  // set properties on "event" which don't exist yet.  If a property does exist
  // on "event", we assert that it has the correct value already.
  for (var key in dict) {
    if (key in event) {
      shaka.asserts.assert(event[key] == dict[key]);
    } else {
      event[key] = dict[key];
    }
  }
  return event;
};


/**
 * Return an 'error' Event object based on an Error object.
 * @param {!Error} error
 * @return {!Event}
 */
shaka.util.FakeEvent.createErrorEvent = function(error) {
  var event = new CustomEvent('error', {
    detail: error,
    bubbles: true
  });
  return event;
};

