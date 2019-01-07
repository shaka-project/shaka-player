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

goog.provide('shaka.media.ActiveStreamMap');


/**
 * A structure used to track which streams were last used in any given period.
 *
 * @final
 */
shaka.media.ActiveStreamMap = class {
  constructor() {
    /**
     * A mapping between a period and the content last streamed in that period.
     *
     * @private {!Map.<shaka.extern.Period, !shaka.media.ActiveStreamMap.Frame>}
     */
    this.history_ = new Map();
  }

  /**
   * Clear the history.
   */
  clear() {
    // Clear the map to release references to the periods (the key). This
    // assumes that the references will be broken by doing this.
    this.history_.clear();
  }

  /**
   * Set the variant that was last playing in |period|. Setting it to |null| is
   * the same as saying "we were playing no variant in this period".
   *
   * @param {shaka.extern.Period} period
   * @param {?shaka.extern.Variant} variant
   */
  useVariant(period, variant) {
    this.getFrameFor_(period).variant = variant;
  }

  /**
   * Set the text stream that was last displayed in |period|. Setting it to
   * |null| is the same as saying "we were displaying no text in this period".
   *
   * @param {shaka.extern.Period} period
   * @param {?shaka.extern.Stream} stream
   */
  useText(period, stream) {
    this.getFrameFor_(period).text = stream;
  }

  /**
   * Get the variant that was playing in the given period. If no variant  was
   * playing this period or the period had not started playing, then |null| will
   * be returned.
   *
   * @param {shaka.extern.Period} period
   * @return {?shaka.extern.Variant}
   */
  getVariant(period) {
    return this.getFrameFor_(period).variant;
  }

  /**
   * Get the text stream that was playing in the given period. If no text
   * stream was playing this period or the period had not started playing, then
   * |null| will be returned.
   *
   * @param {shaka.extern.Period} period
   * @return {?shaka.extern.Stream}
   */
  getText(period) {
    return this.getFrameFor_(period).text;
  }

  /**
   * Get the frame for a period. This will ensure that a frame exists for the
   * given period.
   *
   * @param {shaka.extern.Period} period
   * @return {!shaka.media.ActiveStreamMap.Frame}
   * @private
   */
  getFrameFor_(period) {
    if (!this.history_.has(period)) {
      const frame = new shaka.media.ActiveStreamMap.Frame();
      this.history_.set(period, frame);
    }

    return this.history_.get(period);
  }
};


/**
 * A structure used to track which streams were played during a specific
 * time frame.
 *
 * @final
 */
shaka.media.ActiveStreamMap.Frame = class {
  constructor() {
    /** @type {?shaka.extern.Variant} */
    this.variant = null;
    /** @type {?shaka.extern.Stream} */
    this.text = null;
  }
};
