/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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
    this.data_ = data || '';

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
   * @return {Array<string>}
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
   * @return {?{position: number, length: number, results: !Array<string>}}
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

  /**
   * Parses a time.
   *
   * @return {?number}
   */
  parseTime() {
    const results = this.readRegex(shaka.util.TextParser.timeFormat_);
    if (results == null) {
      return null;
    }
    // This capture is optional, but will still be in the array as undefined,
    // in which case it is 0.
    const hours = Number(results[1]) || 0;
    const minutes = Number(results[2]);
    const seconds = Number(results[3]);
    const milliseconds = Number(results[6]) || 0;
    if (minutes > 59 || seconds > 59) {
      return null;
    }

    return (milliseconds / 1000) + seconds + (minutes * 60) + (hours * 3600);
  }

  /**
   * Parses a time from string.
   *
   * @param {?string} time
   * @return {?number}
   */
  static parseTime(time) {
    if (!time) {
      return null;
    }
    const parser = new shaka.util.TextParser(time);
    return parser.parseTime();
  }
};

/**
 * @const
 * @private {!RegExp}
 * @example 00:00.000 or 00:00:00.000 or 0:00:00.000 or
 * 00:00.00 or 00:00:00.00 or 0:00:00.00 or 00:00:00
 */
shaka.util.TextParser.timeFormat_ =
    /(?:(\d{1,}):)?(\d{2}):(\d{2})((\.(\d{1,3})))?/g;
