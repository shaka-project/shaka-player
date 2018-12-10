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


goog.provide('shaka.ui.Utils');

goog.require('goog.asserts');


/**
 * @param {!HTMLElement} element
 * @param {string} className
 * @return {!HTMLElement}
 * @export
 */
shaka.ui.Utils.getFirstDescendantWithClassName = function(element, className) {
  let descendant = shaka.ui.Utils.getDescendantIfExists(element, className);
  goog.asserts.assert(descendant != null, 'Should not be null!');

  return descendant;
};


/**
 * @param {!HTMLElement} element
 * @param {string} className
 * @return {?HTMLElement}
 */
shaka.ui.Utils.getDescendantIfExists = function(element, className) {
  let childrenWithClassName = element.getElementsByClassName(className);
  if (childrenWithClassName.length) {
    return /** @type {!HTMLElement} */ (childrenWithClassName[0]);
  }

  return null;
};


/**
 * Return true if the content is Transport Stream.
 * Used to decide if caption button is shown all the time in the demo,
 * and whether to show 'Default Text' as a Text Track option.
 *
 * @param {shaka.Player} player
 * @return {boolean}
 */
shaka.ui.Utils.isTsContent = function(player) {
  let activeTracks = player.getVariantTracks().filter(function(track) {
    return track.active == true;
  });
  let activeTrack = activeTracks[0];
  if (activeTrack) {
    return activeTrack.mimeType == 'video/mp2t';
  }
  return false;
};


/**
 * Creates an element, and cast the type from Element to HTMLElement.
 *
 * @param {string} tagName
 * @return {!HTMLElement}
 */
shaka.ui.Utils.createHTMLElement = function(tagName) {
  const element =
    /** @type {!HTMLElement} */ (document.createElement(tagName));
  return element;
};
