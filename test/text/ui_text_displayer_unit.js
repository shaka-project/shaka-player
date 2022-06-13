/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('UITextDisplayer', () => {
  /** @type {!HTMLElement} */
  let videoContainer;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.text.UITextDisplayer} */
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
   * @return {!Object.<string, string|number>}
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
    video = new shaka.test.FakeVideo();
  });

  beforeEach(() => {
    textDisplayer = new shaka.text.UITextDisplayer(video, videoContainer);
  });

  afterEach(async () => {
    await textDisplayer.destroy();
  });

  afterAll(() => {
    document.body.removeChild(videoContainer);
  });

  /**
   * @suppress {visibility}
   * "suppress visibility" has function scope, so this is a mini-function that
   * exists solely to suppress visibility rules for these actions.
   */
  function updateCaptions() {
    // Rather than wait for a timer, which can be unreliable on Safari when the
    // device is heavily loaded, trigger the update explicitly.
    textDisplayer.updateCaptions_();
  }

  it('correctly displays styles for cues', () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    cue.color = 'green';
    cue.backgroundColor = 'black';
    cue.direction = shaka.text.Cue.direction.HORIZONTAL_LEFT_TO_RIGHT;
    cue.fontSize = '10px';
    cue.fontWeight = shaka.text.Cue.fontWeight.NORMAL;
    cue.fontStyle = 'normal';
    cue.lineHeight = '2';
    cue.nestedCues = [];
    cue.textAlign = 'center';
    cue.writingMode = shaka.text.Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM;

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    updateCaptions();

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    const captions = textContainer.querySelector('div');
    const cssObj = parseCssText(captions.style.cssText);

    const expectCssObj = {
      'color': 'green',
      'direction': 'ltr',
      'font-size': '10px',
      'font-style': 'normal',
      'font-weight': 400,
      'text-align': 'center',
    };

    // Either the prefixed or unprefixed version may be present.  We will accept
    // either.  Detecting which property the platform has may not work, because
    // Tizen 3, for example, has a writingMode property, but it is
    // non-functional.  Instead of checking for which properties are on the
    // platform's style interface, check which properties are in the cssObj.
    // We expect one or the other to work on all supported platforms.
    if ('writing-mode' in cssObj) {
      expectCssObj['writing-mode'] = 'horizontal-tb';
    } else {
      expectCssObj['-webkit-writing-mode'] = 'horizontal-tb';
    }

    expect(cssObj).toEqual(jasmine.objectContaining(expectCssObj));
    expect(parseCssText(textContainer.querySelector('span').style.cssText))
        .toEqual(jasmine.objectContaining({'background-color': 'black'}));
  });

  it('correctly displays styles for nested cues', () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, '');
    const nestedCue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    cue.nestedCues = [nestedCue];
    nestedCue.textAlign = 'center';
    nestedCue.writingMode = shaka.text.Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM;
    nestedCue.color = 'green';
    nestedCue.backgroundColor = 'black';
    nestedCue.fontSize = '10px';
    nestedCue.fontWeight = shaka.text.Cue.fontWeight.NORMAL;
    nestedCue.fontStyle = 'normal';
    nestedCue.lineHeight = '2';
    nestedCue.nestedCues = [];

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    updateCaptions();

    // Verify styles applied to the nested cues.
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    const captions =
        textContainer.querySelector('span:not(.shaka-text-wrapper)');
    const cssObj = parseCssText(captions.style.cssText);

    const expectCssObj = {
      'color': 'green',
      'font-size': '10px',
      'font-style': 'normal',
      'font-weight': 400,
      'text-align': 'center',
    };

    // Either the prefixed or unprefixed version may be present.  We will accept
    // either.  Detecting which property the platform has may not work, because
    // Tizen 3, for example, has a writingMode property, but it is
    // non-functional.  Instead of checking for which properties are on the
    // platform's style interface, check which properties are in the cssObj.
    // We expect one or the other to work on all supported platforms.
    if ('writing-mode' in cssObj) {
      expectCssObj['writing-mode'] = 'horizontal-tb';
    } else {
      expectCssObj['-webkit-writing-mode'] = 'horizontal-tb';
    }

    expect(cssObj).toEqual(jasmine.objectContaining(expectCssObj));
    expect(parseCssText(captions.querySelector('span').style.cssText))
        .toEqual(jasmine.objectContaining({'background-color': 'black'}));
  });

  it('correctly displays styles for cellResolution units', () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    cue.fontSize = '0.80c';
    cue.linePadding = '0.50c';
    cue.cellResolution = {
      columns: 60,
      rows: 20,
    };

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    updateCaptions();

    // Expected value is calculated based on  ttp:cellResolution="60 20"
    // videoContainerHeight=450px and tts:fontSize="0.80c" on the default style.
    const expectedFontSize = '18px';

    // Expected value is calculated based on ttp:cellResolution="60 20"
    // videoContainerHeight=450px and ebutts:linePadding="0.5c" on the default
    // style.
    const expectedLinePadding = '11.25px';

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    const captions = textContainer.querySelector('div');
    const cssObj = parseCssText(captions.style.cssText);
    expect(cssObj).toEqual(
        jasmine.objectContaining({
          'font-size': expectedFontSize,
          'padding-left': expectedLinePadding,
          'padding-right': expectedLinePadding,
        }));
  });

  it('correctly displays styles for percentages units', () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    cue.fontSize = '90%';
    cue.cellResolution = {
      columns: 32,
      rows: 15,
    };

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    updateCaptions();

    // Expected value is calculated based on  ttp:cellResolution="32 15"
    // videoContainerHeight=450px and tts:fontSize="90%" on the default style.
    const expectedFontSize = '27px';

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    const captions = textContainer.querySelector('div');
    const cssObj = parseCssText(captions.style.cssText);
    expect(cssObj).toEqual(
        jasmine.objectContaining({'font-size': expectedFontSize}));
  });

  it('does not display duplicate cues', () => {
    // These are identical.
    const cue1 = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    const cue2 = new shaka.text.Cue(0, 100, 'Captain\'s log.');

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue1]);
    updateCaptions();

    /** @type {Element} */
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    let captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display this cue.
    expect(captions.length).toBe(1);

    textDisplayer.append([cue2]);
    updateCaptions();

    captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display one cue without duplication.
    expect(captions.length).toBe(1);
  });

  it('does not mistake cues with nested cues as duplicates', () => {
    // These are not identical, but might look like it at the top level.
    const cue1 = new shaka.text.Cue(0, 100, '');
    cue1.nestedCues = [
      new shaka.text.Cue(0, 100, 'Nested cue 1.'),
    ];
    const cue2 = new shaka.text.Cue(0, 100, '');
    cue2.nestedCues = [
      new shaka.text.Cue(0, 100, 'Nested cue 2.'),
    ];
    const cue3 = new shaka.text.Cue(0, 100, '');
    cue3.nestedCues = [
      new shaka.text.Cue(0, 100, 'Nested cue 3.'),
    ];

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue1]);
    updateCaptions();

    /** @type {Element} */
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    let captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display this cue.
    expect(captions.length).toBe(1);

    textDisplayer.append([cue2, cue3]);
    updateCaptions();

    captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display all three cues, since they are not truly
    // duplicates.
    expect(captions.length).toBe(3);
  });

  it('does not mistake cues with different styles duplicates', () => {
    // These all have the same text and timing, but different styles.
    const cue1 = new shaka.text.Cue(0, 100, 'Hello!');
    cue1.color = 'green';

    const cue2 = new shaka.text.Cue(0, 100, 'Hello!');
    cue2.color = 'green';
    cue2.fontStyle = shaka.text.Cue.fontStyle.ITALIC;

    const cue3 = new shaka.text.Cue(0, 100, 'Hello!');
    cue3.color = 'blue';

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue1]);
    updateCaptions();

    /** @type {Element} */
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    let captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display this cue.
    expect(captions.length).toBe(1);

    textDisplayer.append([cue2, cue3]);
    updateCaptions();

    captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display all three cues, since they are not truly
    // duplicates.
    expect(captions.length).toBe(3);
  });

  it('hides currently displayed cue when removed', () => {
    const cue = new shaka.text.Cue(0, 50, 'One');
    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    video.currentTime = 10;
    updateCaptions();
    const textContainer = videoContainer.querySelector('.shaka-text-container');

    let cueElements = textContainer.querySelectorAll('div');
    expect(cueElements.length).toBe(1);
    expect(cueElements[0].textContent).toBe('One');

    textDisplayer.remove(0, 100);

    cueElements = textContainer.querySelectorAll('div');
    expect(cueElements.length).toBe(0);
  });

  it('hides and shows nested cues at appropriate times', () => {
    const parentCue1 = new shaka.text.Cue(0, 100, '');
    const cue1 = new shaka.text.Cue(0, 50, 'One');
    parentCue1.nestedCues.push(cue1);
    const cue2 = new shaka.text.Cue(25, 75, 'Two');
    parentCue1.nestedCues.push(cue2);
    const cue3 = new shaka.text.Cue(50, 100, 'Three');
    parentCue1.nestedCues.push(cue3);

    const parentCue2 = new shaka.text.Cue(90, 190, '');
    const cue4 = new shaka.text.Cue(90, 130, 'Four');
    parentCue2.nestedCues.push(cue4);

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([parentCue1, parentCue2]);

    video.currentTime = 10;
    updateCaptions();
    /** @type {Element} */
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    let parentCueElements = textContainer.querySelectorAll('div');

    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('One');

    video.currentTime = 35;
    updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('OneTwo');

    video.currentTime = 60;
    updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('TwoThree');

    video.currentTime = 85;
    updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('Three');

    video.currentTime = 95;
    updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(2);
    expect(parentCueElements[0].textContent).toBe('Three');
    expect(parentCueElements[1].textContent).toBe('Four');

    video.currentTime = 105;
    updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('Four');

    video.currentTime = 150;
    updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('');
  });
});
