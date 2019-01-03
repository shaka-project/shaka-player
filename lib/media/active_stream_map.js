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
   * Check if a period has been played or has started playing.
   *
   * @param {shaka.extern.Period} period
   * @return {boolean}
   */
  hasPeriod(period) {
    return this.history_.has(period);
  }

  /**
   * Update the records to show that |stream| was the last stream of
   * |stream.type| playing in |period|.
   *
   * @param {shaka.extern.Period} period
   * @param {shaka.extern.Stream} stream
   */
  use(period, stream) {
    if (this.history_.has(period)) {
      this.history_.get(period).use(stream);
    } else {
     const frame = new shaka.media.ActiveStreamMap.Frame();
     frame.use(stream);
     this.history_.set(period, frame);
    }
  }

  /**
   * Get the stream with the given type that was playing last in the given
   * period. If the period had not started playing or there is no stream of
   * |type|, then |null| will be returned.
   *
   * @param {shaka.extern.Period} period
   * @param {string} type
   * @return {?shaka.extern.Stream}
   */
  get(period, type) {
    const record = this.history_.get(period);
    return record ? record.get(type) : null;
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
    /** @private {!Map<string, shaka.extern.Stream>} */
    this.record_ = new Map();
  }

  /**
   * Register that we are using |stream| in this frame (period).
   *
   * @param {shaka.extern.Stream} stream
   */
  use(stream) {
    this.record_.set(stream.type, stream);
  }

  /**
   * Get the stream with the given type. Will return |null| if not stream is
   * found with the given type.
   *
   * @param {string} type
   * @return {?shaka.extern.Stream}
   */
  get(type) {
    // |get| will return |undefined| if the key is not found.
    return this.record_.get(type) || null;
  }
};
