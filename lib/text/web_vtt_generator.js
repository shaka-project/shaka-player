/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.WebVttGenerator');

goog.require('shaka.text.Cue');
goog.require('shaka.text.Utils');


/**
 * @summary Manage the conversion to WebVTT.
 * @export
 */
shaka.text.WebVttGenerator = class {
  /**
   * @param {!Array<!shaka.text.Cue>} cues
   * @param {!Array<!shaka.extern.AdCuePoint>} adCuePoints
   * @return {string}
   */
  static convert(cues, adCuePoints) {
    const webvttTimeString = (time) => {
      let newTime = time;
      for (const adCuePoint of adCuePoints) {
        if (adCuePoint.end && adCuePoint.start < time) {
          const offset = adCuePoint.end - adCuePoint.start;
          newTime += offset;
        }
      }
      const hours = Math.floor(newTime / 3600);
      const minutes = Math.floor(newTime / 60 % 60);
      const seconds = Math.floor(newTime % 60);
      const milliseconds = Math.floor(newTime * 1000 % 1000);
      return (hours < 10 ? '0' : '') + hours + ':' +
          (minutes < 10 ? '0' : '') + minutes + ':' +
          (seconds < 10 ? '0' : '') + seconds + '.' +
          (milliseconds < 100 ? (milliseconds < 10 ? '00' : '0') : '') +
          milliseconds;
    };

    const flattenedCues = shaka.text.Utils.getCuesToFlatten(cues);

    let webvttString = 'WEBVTT\n\n';
    for (const cue of flattenedCues) {
      const webvttSettings = (cue) => {
        const settings = [];
        const Cue = shaka.text.Cue;
        switch (cue.textAlign) {
          case Cue.textAlign.LEFT:
            settings.push('align:left');
            break;
          case Cue.textAlign.RIGHT:
            settings.push('align:right');
            break;
          case Cue.textAlign.CENTER:
            settings.push('align:middle');
            break;
          case Cue.textAlign.START:
            settings.push('align:start');
            break;
          case Cue.textAlign.END:
            settings.push('align:end');
            break;
        }
        switch (cue.writingMode) {
          case Cue.writingMode.VERTICAL_LEFT_TO_RIGHT:
            settings.push('vertical:lr');
            break;
          case Cue.writingMode.VERTICAL_RIGHT_TO_LEFT:
            settings.push('vertical:rl');
            break;
        }

        if (settings.length) {
          return ' ' + settings.join(' ');
        }
        return '';
      };
      webvttString += webvttTimeString(cue.startTime) + ' --> ' +
          webvttTimeString(cue.endTime) + webvttSettings(cue) + '\n';
      webvttString += cue.payload + '\n\n';
    }
    return webvttString;
  }
};
