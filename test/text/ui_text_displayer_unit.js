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
    video.currentTime = 0;
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
    cue.fontStyle = shaka.text.Cue.fontStyle.NORMAL;
    cue.lineHeight = '2';
    cue.nestedCues = [];
    cue.textAlign = shaka.text.Cue.textAlign.CENTER;
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
    nestedCue.textAlign = shaka.text.Cue.textAlign.CENTER;
    nestedCue.writingMode = shaka.text.Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM;
    nestedCue.color = 'green';
    nestedCue.backgroundColor = 'black';
    nestedCue.fontSize = '10px';
    nestedCue.fontWeight = shaka.text.Cue.fontWeight.NORMAL;
    nestedCue.fontStyle = shaka.text.Cue.fontStyle.NORMAL;
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
    const cue2 = new shaka.text.Cue(25, 75, 'Two');
    const cue3 = new shaka.text.Cue(50, 100, 'Three');
    parentCue1.nestedCues = [cue1, cue2, cue3];

    const parentCue2 = new shaka.text.Cue(90, 190, '');
    const cue4 = new shaka.text.Cue(90, 130, 'Four');
    parentCue2.nestedCues = [cue4];

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

  it('creates separate elements for cue regions', () => {
    const cueRegion = new shaka.text.CueRegion();
    cueRegion.id = 'regionId';
    cueRegion.height = 80;
    cueRegion.heightUnits = shaka.text.CueRegion.units.PERCENTAGE;
    cueRegion.width = 80;
    cueRegion.widthUnits = shaka.text.CueRegion.units.PERCENTAGE;
    cueRegion.viewportAnchorX = 10;
    cueRegion.viewportAnchorY = 10;
    cueRegion.viewportAnchorUnits = shaka.text.CueRegion.units.PERCENTAGE;

    // These all attach to the same region, but only one region element should
    // be created.
    const cues = [
      new shaka.text.Cue(0, 100, ''),
      new shaka.text.Cue(0, 100, ''),
      new shaka.text.Cue(0, 100, ''),
    ];
    for (const cue of cues) {
      cue.displayAlign = shaka.text.Cue.displayAlign.CENTER;
      cue.region = cueRegion;
    }

    textDisplayer.setTextVisibility(true);
    textDisplayer.append(cues);
    updateCaptions();

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    const allRegionElements = textContainer.querySelectorAll(
        '.shaka-text-region');

    // Verify that the nested cues are all attached to a single region element.
    expect(allRegionElements.length).toBe(1);
    const regionElement = allRegionElements[0];
    const children = Array.from(regionElement.childNodes).filter(
        (e) => e.nodeType == Node.ELEMENT_NODE);
    expect(children.length).toBe(3);

    // Verify styles applied to the region element.
    const regionCssObj = parseCssText(regionElement.style.cssText);
    const expectRegionCssObj = {
      'position': 'absolute',
      'height': '80%',
      'width': '80%',
      'top': '10%',
      'left': '10%',
      'display': 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      'justify-content': 'center',
    };
    expect(regionCssObj).toEqual(jasmine.objectContaining(expectRegionCssObj));

    for (const caption of children) {
      // Verify that styles applied to the nested cues _DO NOT_ include region
      // placement.
      const cueCssObj = parseCssText(caption.style.cssText);
      expect(Object.keys(cueCssObj)).not.toContain('height');
      expect(Object.keys(cueCssObj)).not.toContain('width');
      expect(Object.keys(cueCssObj)).not.toContain('top');
      expect(Object.keys(cueCssObj)).not.toContain('left');
    }
  });

  it('does not lose second item in a region', () => {
    const cueRegion = new shaka.text.CueRegion();
    cueRegion.id = 'regionId';
    cueRegion.height = 80;
    cueRegion.heightUnits = shaka.text.CueRegion.units.PERCENTAGE;
    cueRegion.width = 80;
    cueRegion.widthUnits = shaka.text.CueRegion.units.PERCENTAGE;
    cueRegion.viewportAnchorX = 10;
    cueRegion.viewportAnchorY = 10;
    cueRegion.viewportAnchorUnits = shaka.text.CueRegion.units.PERCENTAGE;

    // These have identical nested.
    const cue1 = new shaka.text.Cue(168, 181.84, '');
    cue1.nestedCues = [
      new shaka.text.Cue(168, 181.84, ''),
    ];
    cue1.region = cueRegion;

    const nested1 = new shaka.text.Cue(168, 170.92, '');
    nested1.nestedCues = [new shaka.text.Cue(0, 170.92,
        'Emo look. I mean listen.')];

    const nested2 = new shaka.text.Cue(172, 174.84, '');
    nested2.nestedCues = [new shaka.text.Cue(172, 174.84,
        'You have to learn to listen.')];

    const nested3 = new shaka.text.Cue(175.84, 177.64, '');
    nested3.nestedCues = [new shaka.text.Cue(175.84, 177.64,
        'This is not some game.')];

    const nested4 = new shaka.text.Cue(177.68, 181.84, '');
    nested4.nestedCues = [new shaka.text.Cue(177.68, 181.84,
        'You - I mean we - we could easily die out here.')];

    cue1.nestedCues[0].nestedCues = [nested1, nested2, nested3, nested4];

    video.currentTime = 170;
    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue1]);
    updateCaptions();

    /** @type {Element} */
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    let captions = textContainer.querySelectorAll('div');
    expect(captions.length).toBe(1);
    let allRegionElements = textContainer.querySelectorAll(
        '.shaka-text-region');
    // Verify that the nested cues are all attached to a single region element.
    expect(allRegionElements.length).toBe(1);

    // Advance time to where there is none to show
    video.currentTime = 171;
    updateCaptions();

    allRegionElements = textContainer.querySelectorAll(
        '.shaka-text-region');
    expect(allRegionElements.length).toBe(1);

    // Advance time to where there is something to show
    video.currentTime = 173;
    updateCaptions();

    allRegionElements = textContainer.querySelectorAll(
        '.shaka-text-region');
    expect(allRegionElements.length).toBe(1);

    captions = textContainer.querySelectorAll('div');

    expect(captions.length).toBe(1);
    expect(captions[0].textContent).toBe('You have to learn to listen.');

    allRegionElements = textContainer.querySelectorAll(
        '.shaka-text-region');
    expect(allRegionElements.length).toBe(1);
  });

  it('creates separate regions when dimensions differ but id same', () => {
    const identicalRegionId = 'regionId';

    const cueRegion1 = new shaka.text.CueRegion();
    const cueRegion2 = new shaka.text.CueRegion();
    cueRegion1.id = identicalRegionId;
    cueRegion2.id = identicalRegionId;

    cueRegion1.height = 80;
    cueRegion1.heightUnits = shaka.text.CueRegion.units.PERCENTAGE;
    cueRegion1.width = 80;
    cueRegion1.widthUnits = shaka.text.CueRegion.units.PERCENTAGE;

    cueRegion2.height = 160; // the only difference!
    cueRegion2.heightUnits = shaka.text.CueRegion.units.PERCENTAGE;
    cueRegion2.width = 80;
    cueRegion2.widthUnits = shaka.text.CueRegion.units.PERCENTAGE;

    cueRegion1.viewportAnchorX = 10;
    cueRegion1.viewportAnchorY = 10;
    cueRegion1.viewportAnchorUnits = shaka.text.CueRegion.units.PERCENTAGE;

    cueRegion2.viewportAnchorX = 10;
    cueRegion2.viewportAnchorY = 10;
    cueRegion2.viewportAnchorUnits = shaka.text.CueRegion.units.PERCENTAGE;

    // These all attach to the same region, but only one region element should
    // be created.
    const firstBatchOfCues = [
      new shaka.text.Cue(0, 100, ''),
      new shaka.text.Cue(0, 100, ''),
      new shaka.text.Cue(0, 100, ''),
    ];
    for (const cue of firstBatchOfCues) {
      cue.displayAlign = shaka.text.Cue.displayAlign.CENTER;
      cue.region = cueRegion1;
    }

    // Another batch for the other region
    const secondBatchOfCues = [
      new shaka.text.Cue(0, 100, ''),
      new shaka.text.Cue(0, 100, ''),
      new shaka.text.Cue(0, 100, ''),
    ];
    for (const cue of secondBatchOfCues) {
      cue.displayAlign = shaka.text.Cue.displayAlign.CENTER;
      cue.region = cueRegion2;
    }

    textDisplayer.setTextVisibility(true);
    textDisplayer.append(firstBatchOfCues);
    textDisplayer.append(secondBatchOfCues);
    updateCaptions();

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    const allRegionElements = textContainer.querySelectorAll(
        '.shaka-text-region');

    // Verify that the nested cues are attached to respective region element.
    expect(allRegionElements.length).toBe(2);

    const childrenOfOne = Array.from(allRegionElements[0].childNodes).filter(
        (e) => e.nodeType == Node.ELEMENT_NODE);
    expect(childrenOfOne.length).toBe(3);

    const childrenOfTwo = Array.from(allRegionElements[1].childNodes).filter(
        (e) => e.nodeType == Node.ELEMENT_NODE);
    expect(childrenOfTwo.length).toBe(3);
  });
});
