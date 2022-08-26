/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.TsParser');

goog.require('shaka.log');


/**
 * @export
 */
shaka.util.TsParser = class {
  /**
   * Check if the passed data corresponds to an MPEG2-TS
   * @param {Uint8Array} data
   * @return {boolean}
   */
  static probe(data) {
    const syncOffset = shaka.util.TsParser.syncOffset(data);
    if (syncOffset < 0) {
      return false;
    } else {
      if (syncOffset > 0) {
        shaka.log.warning('MPEG2-TS detected but first sync word found @ ' +
            'offset ' + syncOffset + ', junk ahead ?');
      }
      return true;
    }
  }

  /**
   * Returns the synchronization offset
   * @param {Uint8Array} data
   * @return {number}
   */
  static syncOffset(data) {
    // scan 1000 first bytes
    const scanwindow = Math.min(1000, data.length - 3 * 188);
    let i = 0;
    while (i < scanwindow) {
      // a TS fragment should contain at least 3 TS packets, a PAT, a PMT, and
      // one PID, each starting with 0x47
      if (data[i] === 0x47 &&
          data[i + 188] === 0x47 &&
          data[i + 2 * 188] === 0x47) {
        return i;
      } else {
        i++;
      }
    }
    return -1;
  }
};

