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

goog.provide('shaka.util.TextParser');

goog.require('goog.asserts');


/**
 * Reads elements from strings.
 */
shaka.util.TextParser = class {
  /**
   * @param {string} data
   */
  constructor(data) {
    /**
     * @const
     * @private {string}
     */
    this.data_ = data;

    /** @private {number} */
    this.position_ = 0;
  }


  /** @return {boolean} Whether it is at the end of the string. */
  atEnd() {
    return this.position_ == this.data_.length;
  }


  /**
   * Reads a line from the parser.  This will read but not return the newline.
   * Returns null at the end.
   *
   * @return {?string}
   */
  readLine() {
    return this.readRegexReturnCapture_(/(.*?)(\n|$)/gm, 1);
  }


  /**
   * Reads a word from the parser.  This will not read or return any whitespace
   * before or after the word (including newlines).  Returns null at the end.
   *
   * @return {?string}
   */
  readWord() {
    return this.readRegexReturnCapture_(/[^ \t\n]*/gm, 0);
  }


  /**
   * Skips any continuous whitespace from the parser.  Returns null at the end.
   */
  skipWhitespace() {
    this.readRegex(/[ \t]+/gm);
  }


  /**
   * Reads the given regular expression from the parser.  This requires the
   * match to be at the current position; there is no need to include a head
   * anchor.
   * This requires that the regex have the global flag to be set so that it can
   * set lastIndex to start the search at the current position.  Returns null at
   * the end or if the regex does not match the current position.
   *
   * @param {!RegExp} regex
   * @return {Array.<string>}
   */
  readRegex(regex) {
    const index = this.indexOf_(regex);
    if (this.atEnd() || index == null || index.position != this.position_) {
      return null;
    }

    this.position_ += index.length;
    return index.results;
  }


  /**
   * Reads a regex from the parser and returns the given capture.
   *
   * @param {!RegExp} regex
   * @param {number} index
   * @return {?string}
   * @private
   */
  readRegexReturnCapture_(regex, index) {
    if (this.atEnd()) {
      return null;
    }

    const ret = this.readRegex(regex);
    if (!ret) {
      return null;
    } else {
      return ret[index];
    }
  }


  /**
   * Returns the index info about a regular expression match.
   *
   * @param {!RegExp} regex
   * @return {?{position: number, length: number, results: !Array.<string>}}
   * @private
   */
  indexOf_(regex) {
    // The global flag is required to use lastIndex.
    goog.asserts.assert(regex.global, 'global flag should be set');

    regex.lastIndex = this.position_;
    const results = regex.exec(this.data_);
    if (results == null) {
      return null;
    } else {
      return {
        position: results.index,
        length: results[0].length,
        results: results,
      };
    }
  }
};
