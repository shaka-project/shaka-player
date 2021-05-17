/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.WebVttGenerator');

goog.require('shaka.Deprecate');
goog.require('shaka.text.Cue');


/**
 * @summary Manage the conversion to WebVTT.
 * @export
 */
shaka.text.WebVttGenerator = class {
  /**
   * @param {!Array.<!shaka.text.Cue>} cues
   * @return {string}
   */
  static convert(cues) {
    // Flatten nested cue payloads recursively.  If a cue has nested cues,
    // their contents should be combined and replace the payload of the parent.
    const flattenPayload = (cue) => {
      // Handle styles (currently bold/italics/underline).
      // TODO: add support for color rendering.
      const openStyleTags = [];
      const bold = cue.fontWeight >= shaka.text.Cue.fontWeight.BOLD;
      const italics = cue.fontStyle == shaka.text.Cue.fontStyle.ITALIC;
      const underline = cue.textDecoration.includes(
          shaka.text.Cue.textDecoration.UNDERLINE);
      if (bold) {
        openStyleTags.push('b');
      }
      if (italics) {
        openStyleTags.push('i');
      }
      if (underline) {
        openStyleTags.push('u');
      }

      // Prefix opens tags, suffix closes tags in reverse order of opening.
      const prefixStyleTags = openStyleTags.reduce((acc, tag) => {
        return `${acc}<${tag}>`;
      }, '');
      const suffixStyleTags = openStyleTags.reduceRight((acc, tag) => {
        return `${acc}</${tag}>`;
      }, '');

      if (cue.lineBreak || cue.spacer) {
        if (cue.spacer) {
          shaka.Deprecate.deprecateFeature(4,
              'shaka.text.Cue',
              'Please use lineBreak instead of spacer.');
        }
        // This is a vertical lineBreak, so insert a newline.
        return '\n';
      } else if (cue.nestedCues.length) {
        return cue.nestedCues.map(flattenPayload).join('');
      } else {
        // This is a real cue.
        return prefixStyleTags + cue.payload + suffixStyleTags;
      }
    };

    // We don't want to modify the array or objects passed in, since we don't
    // technically own them.  So we build a new array and replace certain items
    // in it if they need to be flattened.
    const flattenedCues = cues.map((cue) => {
      if (cue.nestedCues.length) {
        const flatCue = cue.clone();
        flatCue.nestedCues = [];
        flatCue.payload = flattenPayload(cue);
        return flatCue;
      } else {
        return cue;
      }
    });

    let webvttString = 'WEBVTT\n\n';
    for (const cue of flattenedCues) {
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
