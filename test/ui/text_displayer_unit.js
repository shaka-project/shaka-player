/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('UITextDisplayer', () => {
  /** @type {!HTMLElement} */
  let videoContainer;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.ui.TextDisplayer} */
  let textDisplayer;
  /** @type {number} */
  const videoContainerHeight = 450;

  /**
   * Transform a cssText to an object.
   * Example:
   * cssText: 'background-color: black; color: green; font-size: 10px;'
   * cssObject: {
   *   background-color: 'black',
   *   color: 'green',
   *   font-size: '10px',
   * }
   * @param {string} cssStr
   * @return {Object.<string, string|number>}
   */
  function parseCssText(cssStr) {
    // Remove the white spaces in the string.
    // Split with ';' and ignore the last one.
    const css = cssStr.replace(/\s/g, '').substring(0, cssStr.length - 1)
        .split(';');
    const cssObj = {};
    for (const cssStyle of css) {
      const propertyAndValue = cssStyle.split(':');
      let value = propertyAndValue[1];
      value = isNaN(value) ? value : Number(value);
      cssObj[propertyAndValue[0]] = value;
    }
    return cssObj;
  }


  beforeAll(() => {
    videoContainer =
      /** @type {!HTMLElement} */ (document.createElement('div'));
    videoContainer.style.height = `${videoContainerHeight}px`;
    document.body.appendChild(videoContainer);
    video = shaka.test.UiUtils.createVideoElement();
    videoContainer.appendChild(video);
  });

  beforeEach(() => {
    textDisplayer = new shaka.ui.TextDisplayer(video, videoContainer);
  });

  afterEach(async () => {
    await textDisplayer.destroy();
  });

  it('correctly displays styles for cues', async () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    cue.color = 'green';
    cue.backgroundColor = 'black';
    cue.direction = 'ltr';
    cue.fontSize = '10px';
    cue.fontWeight = 400;
    cue.fontStyle = 'normal';
    cue.lineHeight = 2;
    cue.nestedCues = [];
    cue.textAlign = 'center';
    cue.writingMode = 'horizontal-tb';

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    // Wait until updateCaptions_() gets called.
    await shaka.test.Util.delay(0.5);

    const textContainer =
        videoContainer.querySelector('.shaka-text-container');
    const captions = textContainer.querySelector('span');
    const cssObj = parseCssText(captions.style.cssText);
    expect(cssObj).toEqual(
        jasmine.objectContaining({
          'color': 'green',
          'background-color': 'black',
          'direction': 'ltr',
          'font-size': '10px',
          'font-style': 'normal',
          'font-weight': 400,
          'line-height': 2,
          'text-align': 'center',
          // TODO: We're not testing writing-mode since IE 11 only supports
          // deprecated writing-mode values partially. Add it back once we end
          // support for IE 11.
          // https://github.com/google/shaka-player/issues/2339
          // 'writing-mode': 'horizontal-tb',
        }));
  });

  it('correctly displays styles for nested cues', async () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    const nestedCue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    cue.nestedCues = [nestedCue];
    nestedCue.textAlign = 'center';
    nestedCue.writingMode = 'horizontal-tb';
    nestedCue.color = 'green';
    nestedCue.backgroundColor = 'black';
    nestedCue.fontSize = '10px';
    nestedCue.fontWeight = 400;
    nestedCue.fontStyle = 'normal';
    nestedCue.lineHeight = 2;
    nestedCue.nestedCues = [];

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    // Wait until updateCaptions_() gets called.
    await shaka.test.Util.delay(0.5);

    // Verify styles applied to the nested cues.
    const textContainer =
        videoContainer.querySelector('.shaka-text-container');
    const captions = textContainer.querySelector('span');
    const cssObj = parseCssText(captions.style.cssText);
    expect(cssObj).toEqual(
        jasmine.objectContaining({
          'color': 'green',
          'background-color': 'black',
          'font-size': '10px',
          'font-style': 'normal',
          'font-weight': 400,
          'text-align': 'center',
          // TODO: We're not testing writing-mode since IE 11 only supports
          // deprecated writing-mode values partially. Add it back once we end
          // support for IE 11.
          // https://github.com/google/shaka-player/issues/2339
          // 'writing-mode': 'horizontal-tb',
        }));
  });

  it('correctly displays styles for cellResolution units', async () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    cue.fontSize = '0.80c';
    cue.cellResolution = {
      columns: 60,
      rows: 20,
    };

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    // Wait until updateCaptions_() gets called.
    await shaka.test.Util.delay(0.5);

    // Expected value is calculated based on  ttp:cellResolution="60 20"
    // videoContainerHeight=450px and tts:fontSize="0.80c" on the default style.
    const expectedFontSize = '18px';

    const textContainer =
        videoContainer.querySelector('.shaka-text-container');
    const captions = textContainer.querySelector('span');
    const cssObj = parseCssText(captions.style.cssText);
    expect(cssObj).toEqual(
        jasmine.objectContaining({'font-size': expectedFontSize}));
  });

  it('correctly displays styles for percentages units', async () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    cue.fontSize = '90%';
    cue.cellResolution = {
      columns: 32,
      rows: 15,
    };

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    // Wait until updateCaptions_() gets called.
    await shaka.test.Util.delay(0.5);

    // Expected value is calculated based on  ttp:cellResolution="32 15"
    // videoContainerHeight=450px and tts:fontSize="90%" on the default style.
    const expectedFontSize = '27px';

    const textContainer =
        videoContainer.querySelector('.shaka-text-container');
    const captions = textContainer.querySelector('span');
    const cssObj = parseCssText(captions.style.cssText);
    expect(cssObj).toEqual(
        jasmine.objectContaining({'font-size': expectedFontSize}));
  });
});
