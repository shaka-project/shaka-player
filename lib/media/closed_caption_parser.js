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

goog.provide('shaka.media.IClosedCaptionParser');
goog.provide('shaka.media.MuxJSClosedCaptionParser');
goog.provide('shaka.media.NoopCaptionParser');


/**
 * The IClosedCaptionParser defines the interface to provide all operations for
 * parsing the closed captions embedded in Dash videos streams.
 * @interface
 */
shaka.media.IClosedCaptionParser = class {
  /**
   * Initialize the caption parser. This should be called only once.
   * @param {!ArrayBuffer} data
   */
  init(data) {}

  /**
   * Parses embedded CEA closed captions and interacts with the underlying
   * CaptionStream, and calls the callback function when there are closed
   * captions.
   *
   * @param {!ArrayBuffer} data
   * @param {function(Array.<muxjs.mp4.ClosedCaption>)} onCaptions
   *         A callback function to handle the closed captions from parsed data.
   */
  parseFrom(data, onCaptions) {}

  /**
   * Resets the CaptionStream.
   */
  reset() {}
};


/**
 * Closed Caption Parser provides all operations for parsing the closed captions
 * embedded in Dash videos streams.
 *
 * @implements {shaka.media.IClosedCaptionParser}
 * @final
 */
shaka.media.MuxJSClosedCaptionParser = class {
  constructor() {
    /** @private {muxjs.mp4.CaptionParser} */
    this.muxCaptionParser_ = new muxjs.mp4.CaptionParser();

    /** @private {!Array.<number>} */
    this.videoTrackIds_ = [];

    /**
     * Timescales from the init segments, used for mux.js CaptionParser.
     * @private {!Object.<number, number>}
     */
    this.timescales_ = {};
  }

  /**
   * @override
   */
  init(data) {
    const probe = muxjs.mp4.probe;
    // Caption parser for Dash
    const initBytes = new Uint8Array(data);
    this.videoTrackIds_ = probe.videoTrackIds(initBytes);
    this.timescales_ = probe.timescale(initBytes);
    this.muxCaptionParser_.init();
  }

  /**
   * @override
   */
  parseFrom(data, onCaptions) {
    const segmentBytes = new Uint8Array(data);
    const dashParsed = this.muxCaptionParser_.parse(
          segmentBytes, this.videoTrackIds_, this.timescales_);
    if (dashParsed && dashParsed.captions) {
      onCaptions(dashParsed.captions);
    }
    // ParsedCaptions is used by mux.js to store the captions parsed so far.
    // It should be reset every time some data is parsed, so as to store new
    // data.
    this.muxCaptionParser_.clearParsedCaptions();
  }

  /**
   * @override
   */
  reset() {
    this.muxCaptionParser_.resetCaptionStream();
  }

  /**
   * Check if the MuxJS closed caption parser is supported on this platform.
   *
   * @return {boolean}
   */
  static isSupported() {
    return !!window.muxjs;
  }
};

/**
 * Noop Caption Parser creates an empty caption parser object when mux.js is not
 * available.
 *
 * @implements {shaka.media.IClosedCaptionParser}
 * @final
 */
shaka.media.NoopCaptionParser = class {
  constructor() {}

  /**
   * @override
   */
  init(data) {}

  /**
   * @override
   */
  parseFrom(data, onCaptions) {}

  /**
   * @override
   */
  reset() {}
};
