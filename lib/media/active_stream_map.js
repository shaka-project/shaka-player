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
   * |type| playing in |period|.
   *
   * @param {shaka.extern.Period} period
   * @param {shaka.media.ActiveStreamMap.StreamType} type
   * @param {shaka.media.ActiveStreamMap.StreamId} streamId
   */
  update(period, type, streamId) {
    if (this.history_.has(period)) {
      this.history_.get(period).update(type, streamId);
    } else {
     const frame = new shaka.media.ActiveStreamMap.Frame();
     frame.update(type, streamId);

     this.history_.set(period, frame);
    }
  }

  /**
   * Get the id for the stream with the given type that was playing last in the
   * given period. If the period had not started playing or there is no stream
   * of type |type|, then |null| will be returned.
   *
   * @param {shaka.extern.Period} period
   * @param {shaka.media.ActiveStreamMap.StreamType} type
   * @return {?shaka.media.ActiveStreamMap.StreamId}
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
    /**
     * A mapping of stream type to stream id.
     *
     * @private {!Object<shaka.media.ActiveStreamMap.StreamType,
     *                   shaka.media.ActiveStreamMap.StreamId>}
     */
    this.record_ = {};
  }

  /**
   * @param {shaka.media.ActiveStreamMap.StreamType} type
   * @param {shaka.media.ActiveStreamMap.StreamId} streamId
   */
  update(type, streamId) {
    this.record_[type] = streamId;
  }

  /**
   * Get the stream id for the stream type |type| played during this time
   * frame. If there was no stream of type |type|, |null| will be returned.
   *
   * @param {shaka.media.ActiveStreamMap.StreamType} type
   * @return {?shaka.media.ActiveStreamMap.StreamId}
   */
  get(type) {
    return this.record_[type];
  }
};


/**
 * A type definition for a stream's id.
 * @typedef {number}
 */
shaka.media.ActiveStreamMap.StreamId;


/**
 * A type definitions for a stream's type.
 * @typedef {string}
 */
shaka.media.ActiveStreamMap.StreamType;
