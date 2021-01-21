/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.WebVttGenerator');


/**
 * @summary Manage the conversion to WebVTT.
 * @export
 */
shaka.text.WebVttGenerator = class {
  /**
   * @param {!Array.<!shaka.extern.Cue>} cues
   * @return {string}
   */
  static convert(cues) {
    let webvttString = 'WEBVTT\n\n';
    for (const cue of cues) {
      const webvttTimeString = (time) => {
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor(time / 60 % 60);
        const seconds = Math.floor(time % 60);
        const milliseconds = Math.floor(time * 1000 % 1000);
        return (hours < 10 ? '0' : '') + hours + ':' +
            (minutes < 10 ? '0' : '') + minutes + ':' +
            (seconds < 10 ? '0' : '') + seconds + '.' +
            (milliseconds < 100 ? (milliseconds < 10 ? '00' : '0') : '') +
            milliseconds;
      };
      webvttString += webvttTimeString(cue.startTime) + ' --> ' +
          webvttTimeString(cue.endTime) + '\n';
      webvttString += cue.payload + '\n\n';
    }
    return webvttString;
  }
};
