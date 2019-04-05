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


goog.provide('shaka.util.Dom');


shaka.util.Dom = class {
  /**
   * Creates an element, and cast the type from Element to HTMLElement.
   *
   * @param {string} tagName
   * @return {!HTMLElement}
   * @export
   */
  static createHTMLElement(tagName) {
    const element =
      /** @type {!HTMLElement} */ (document.createElement(tagName));
    return element;
  }


  /**
   * Creates an element, and cast the type from Element to HTMLElement.
   *
   * @return {!HTMLVideoElement}
   * @export
   */
  static createVideoElement() {
    const video =
      /** @type {!HTMLVideoElement} */ (document.createElement('video'));

    video.muted = true;
    video.width = 600;
    video.height = 400;

    return video;
  }
};
