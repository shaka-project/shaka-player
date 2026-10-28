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
  /** @type {Object} **/
  let player;

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
   * @return {!Object<string, string | number>}
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
    // The displayer reads getPlaybackRate() and listens to the player's
    // 'ratechange' event, so the fake exposes those (the event listener is
    // never fired in these tests, so addEventListener can be a no-op).
    player = {
      getMediaElement: () => video,
      getVideoContainer: () => videoContainer,
      getPlaybackRate: () => video.playbackRate,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  beforeEach(() => {
    video.currentTime = 0;
    /** @suppress {checkTypes} */
    textDisplayer = new shaka.text.UITextDisplayer(player);
    // Disable suspendRenderingWhenHidden so the tests don't depend on the
    // video container actually intersecting the viewport.  On some devices
    // (e.g. Chromecast) the IntersectionObserver reports the test container as
    // not visible and suspends rendering, which would intermittently prevent
    // cues from being rendered at all.
    const config = shaka.util.PlayerConfiguration.createDefault().textDisplayer;
    config.suspendRenderingWhenHidden = false;
    textDisplayer.configure(config);
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
   * @return {!Promise}
   */
  async function updateCaptions() {
    // Rather than wait for a timer, which can be unreliable on Safari when the
    // device is heavily loaded, trigger the update explicitly.
    textDisplayer.updateCaptions_();

    await shaka.test.Util.shortDelay();
  }

  it('correctly displays styles for cues', async () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    cue.color = 'green';
    cue.backgroundColor = 'black';
    cue.direction = shaka.text.Cue.direction.HORIZONTAL_LEFT_TO_RIGHT;
    const cueSampleFontSize = '10px';
    cue.fontSize = cueSampleFontSize;
    cue.fontWeight = shaka.text.Cue.fontWeight.NORMAL;
    cue.fontStyle = shaka.text.Cue.fontStyle.NORMAL;
    cue.lineHeight = '2';
    cue.nestedCues = [];
    cue.textAlign = shaka.text.Cue.textAlign.CENTER;
    cue.writingMode = shaka.text.Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM;

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    const captions = textContainer.querySelector('div');
    const cssObj = parseCssText(captions.style.cssText);

    const expectCssObj = {
      'color': 'green',
      'direction': 'ltr',
      'font-size': cueSampleFontSize,
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

  it('renders LINE_THROUGH text decoration as a valid CSS value',
      async () => {
        // Regression test: previously LINE_THROUGH was 'lineThrough', which
        // is not a valid CSS text-decoration value, so browsers ignored it
        // and no strikethrough was drawn.  After the fix the value is the
        // valid CSS token 'line-through'.
        /** @type {!shaka.text.Cue} */
        const cue = new shaka.text.Cue(0, 100, 'deleted text');
        cue.textDecoration.push(shaka.text.Cue.textDecoration.LINE_THROUGH);
        cue.nestedCues = [];

        textDisplayer.setTextVisibility(true);
        textDisplayer.append([cue]);
        await updateCaptions();

        const textContainer =
            videoContainer.querySelector('.shaka-text-container');
        const captions = textContainer.querySelector('div');
        // Browsers expose the parsed value via the longhand
        // text-decoration-line; fall back to the shorthand for older engines.
        const decoration =
            captions.style.textDecorationLine ||
            captions.style.textDecoration;
        expect(decoration).toContain('line-through');
        expect(decoration).not.toContain('lineThrough');
      });

  it('correctly displays styles for nested cues', async () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, '');
    const nestedCue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    cue.nestedCues = [nestedCue];
    nestedCue.textAlign = shaka.text.Cue.textAlign.CENTER;
    nestedCue.writingMode = shaka.text.Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM;
    nestedCue.color = 'green';
    nestedCue.backgroundColor = 'black';
    const cueSampleFontSize = '10px';
    nestedCue.fontSize = cueSampleFontSize;
    nestedCue.fontWeight = shaka.text.Cue.fontWeight.NORMAL;
    nestedCue.fontStyle = shaka.text.Cue.fontStyle.NORMAL;
    nestedCue.lineHeight = '2';
    nestedCue.nestedCues = [];

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    // Verify styles applied to the nested cues.
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    const captions =
        textContainer.querySelector('span:not(.shaka-text-wrapper)');
    const cssObj = parseCssText(captions.style.cssText);

    const expectCssObj = {
      'color': 'green',
      'font-size': cueSampleFontSize,
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

  it('places only the top-level cue of vertical text', async () => {
    const Cue = shaka.text.Cue;
    const cue = new Cue(0, 100, '');
    cue.writingMode = Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
    for (const text of ['First line', 'Second line']) {
      const nestedCue = new Cue(0, 100, text);
      nestedCue.writingMode = Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
      cue.nestedCues.push(nestedCue);
    }

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    const cueElement = /** @type {!HTMLElement} */(
      textContainer.querySelector('div'));
    expect(cueElement.style.position).toBe('absolute');
    expect(cueElement.style.left).toBe('0px');

    // The nested cues flow inside the top-level one, instead of all being
    // placed at the same edge, on top of each other.
    const nestedElements =
        cueElement.querySelectorAll('.shaka-text-wrapper > span');
    expect(nestedElements.length).toBe(2);
    for (const element of nestedElements) {
      expect(/** @type {!HTMLElement} */(element).style.position).toBe('');
    }
  });

  describe('TTML paragraphs', () => {
    /**
     * Shows a paragraph in a body and a div, the way the TTML parser nests
     * them.
     *
     * @param {!shaka.text.Cue} paragraph
     * @return {!Promise<!HTMLElement>} The element of the paragraph.
     */
    async function showParagraph(paragraph) {
      const body = new shaka.text.Cue(0, 100, '');
      body.isContainer = true;
      const div = new shaka.text.Cue(0, 100, '');
      div.isContainer = true;
      body.nestedCues = [div];
      div.nestedCues = [paragraph];

      textDisplayer.setTextVisibility(true);
      textDisplayer.append([body]);
      await updateCaptions();

      const textContainer =
          videoContainer.querySelector('.shaka-text-container');
      const wrapper = textContainer.querySelector('.shaka-text-wrapper');
      return /** @type {!HTMLElement} */ (
        wrapper.firstElementChild.firstElementChild);
    }

    /**
     * @param {string} payload
     * @return {!shaka.text.Cue}
     */
    function span(payload) {
      return new shaka.text.Cue(0, 100, payload);
    }

    /** @return {!shaka.text.Cue} */
    function lineBreak() {
      const cue = new shaka.text.Cue(0, 100, '');
      cue.lineBreak = true;
      return cue;
    }

    /**
     * @param {string} base
     * @param {string} text
     * @param {?shaka.text.Cue.rubyPosition} rubyPosition
     * @return {!shaka.text.Cue}
     */
    function ruby(base, text, rubyPosition) {
      const cue = new shaka.text.Cue(0, 100, '');
      cue.rubyTag = 'ruby';
      const annotation = span(text);
      annotation.rubyTag = 'rt';
      annotation.rubyPosition = rubyPosition;
      cue.nestedCues = [span(base), annotation];
      return cue;
    }

    /**
     * @param {!Element} element
     * @return {string}
     */
    function getRubyPosition(element) {
      const style = /** @type {!HTMLElement} */ (element).style;
      return style.getPropertyValue('ruby-position') ||
          style.getPropertyValue('-webkit-ruby-position');
    }

    it('aligns paragraphs in their containers', async () => {
      const Cue = shaka.text.Cue;
      const paragraph = new Cue(0, 100, '');
      paragraph.textAlign = Cue.textAlign.END;
      paragraph.nestedCues = [span('First'), span('Second')];
      const element = await showParagraph(paragraph);

      // The containers fill their region, and the paragraph is aligned in
      // them.
      const wrapper = element.parentElement.parentElement;
      expect(wrapper.classList).toContain('shaka-text-wrapper');
      expect(wrapper.style.display).toBe('flex');
      expect(wrapper.style.width).toBe('100%');
      expect(wrapper.parentElement.style.width).toBe('100%');
      expect(element.parentElement.style.width).toBe('100%');
      // Older browsers don't support self-end in flex layout, and get the
      // flex-end fallback instead.
      const alignSelf = CSS.supports('align-self', 'self-end') ?
          'self-end' : 'flex-end';
      expect(element.style.alignSelf).toBe(alignSelf);

      // The words of the paragraph are not floated, which would reverse them.
      for (const child of Array.from(element.childNodes)) {
        expect(/** @type {!HTMLElement} */ (child).style.cssFloat).toBe('');
      }
    });

    it('keeps the display of ruby', async () => {
      const Cue = shaka.text.Cue;
      const paragraph = new Cue(0, 100, '');
      const rubyCue = ruby('Base', 'Text', Cue.rubyPosition.BEFORE);
      rubyCue.rubyAlign = 'space-around';
      paragraph.nestedCues = [rubyCue];
      const element = await showParagraph(paragraph);

      const rubyElement = /** @type {!HTMLElement} */ (
        element.querySelector('ruby'));
      const annotation = /** @type {!HTMLElement} */ (
        rubyElement.querySelector('rt'));
      expect(rubyElement.style.display).toBe('');
      expect(annotation.style.display).toBe('');
      // A text alignment would override the alignment of the ruby.
      expect(annotation.style.textAlign).toBe('');
      expect(getRubyPosition(rubyElement)).toMatch(/^(over|before)$/);
    });

    it('places outside annotations after the lines but the first',
        async () => {
          const Cue = shaka.text.Cue;
          const paragraph = new Cue(0, 100, '');
          paragraph.nestedCues = [
            ruby('First', 'Text', Cue.rubyPosition.OUTSIDE),
            lineBreak(),
            ruby('Second', 'Text', Cue.rubyPosition.OUTSIDE),
          ];
          const element = await showParagraph(paragraph);

          const rubyElements = element.querySelectorAll('ruby');
          expect(rubyElements.length).toBe(2);
          expect(getRubyPosition(rubyElements[0])).toMatch(/^(over|before)$/);
          expect(getRubyPosition(rubyElements[1])).toMatch(/^(under|after)$/);
        });

    it('reserves space for ruby on each line', async () => {
      const paragraph = new shaka.text.Cue(0, 100, '');
      paragraph.rubyReserve = 'both 0.5em';
      paragraph.nestedCues = [span('First'), lineBreak(), span('Second')];
      const element = await showParagraph(paragraph);

      // Each line starts with a ruby annotated before it, which holds a ruby
      // annotated after it.
      const reserves = Array.from(element.querySelectorAll('ruby'))
          .filter((rubyElement) => rubyElement.parentElement.localName !=
              'ruby');
      expect(reserves.length).toBe(2);
      for (const reserve of reserves) {
        expect(getRubyPosition(reserve)).toMatch(/^(over|before)$/);
        const inner = reserve.querySelector('ruby');
        expect(getRubyPosition(inner)).toMatch(/^(under|after)$/);
        for (const annotation of Array.from(reserve.querySelectorAll('rt'))) {
          expect(/** @type {!HTMLElement} */ (annotation).style.fontSize)
              .toBe('0.5em');
        }
      }
      // The text is unchanged, except for the empty bases and annotations.
      expect(element.textContent.replace(/\u200B/g, '')).toBe('FirstSecond');
    });
  });

  it('converts font sizes relative to the video container', async () => {
    const cue = new shaka.text.Cue(0, 100, 'Text');
    cue.fontSize = '10rh';

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    const cueElement = /** @type {!HTMLElement} */ (
      textContainer.querySelector('div'));
    expect(cueElement.style.fontSize).toBe(videoContainerHeight / 10 + 'px');
  });

  it('correctly displays styles for cellResolution units', async () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');

    const fontSizeAsCellResolution = 0.80;
    cue.fontSize = `${fontSizeAsCellResolution}c`;
    cue.linePadding = '0.50c';
    cue.cellResolution = {
      columns: 60,
      rows: 20,
    };

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    // Expected value is calculated based on  ttp:cellResolution="60 20"
    // videoContainerHeight=450px and tts:fontSize="0.80c" on the default style.
    const calculatedFontSize = (450/20) * fontSizeAsCellResolution;
    const expectedFontSize = `${calculatedFontSize}px`;

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

  it('correctly displays styles for percentages units', async () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    const cueSampleFontSize = 90;
    cue.fontSize = `${cueSampleFontSize}%`;
    cue.cellResolution = {
      columns: 32,
      rows: 15,
    };

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    // Expected value is calculated based on  ttp:cellResolution="32 15"
    // videoContainerHeight=450px and tts:fontSize="90%" on the default style.
    const calculatedFontSize = (450/15) * (cueSampleFontSize/100);
    const expectedFontSize = `${calculatedFontSize}px`;

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    const captions = textContainer.querySelector('div');
    const cssObj = parseCssText(captions.style.cssText);
    expect(cssObj).toEqual(
        jasmine.objectContaining({'font-size': expectedFontSize}));
  });

  it('does not display duplicate cues', async () => {
    // These are identical.
    const cue1 = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    const cue2 = new shaka.text.Cue(0, 100, 'Captain\'s log.');

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue1]);
    await updateCaptions();

    /** @type {Element} */
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    let captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display this cue.
    expect(captions.length).toBe(1);

    textDisplayer.append([cue2]);
    await updateCaptions();

    captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display one cue without duplication.
    expect(captions.length).toBe(1);
  });

  it('does not mistake cues with nested cues as duplicates', async () => {
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
    await updateCaptions();

    /** @type {Element} */
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    let captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display this cue.
    expect(captions.length).toBe(1);

    textDisplayer.append([cue2, cue3]);
    await updateCaptions();

    captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display all three cues, since they are not truly
    // duplicates.
    expect(captions.length).toBe(3);
  });

  it('does not mistake cues with different styles duplicates', async () => {
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
    await updateCaptions();

    /** @type {Element} */
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    let captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display this cue.
    expect(captions.length).toBe(1);

    textDisplayer.append([cue2, cue3]);
    await updateCaptions();

    captions = textContainer.querySelectorAll('div');
    // Expect textContainer to display all three cues, since they are not truly
    // duplicates.
    expect(captions.length).toBe(3);
  });

  it('hides currently displayed cue when removed', async () => {
    const cue = new shaka.text.Cue(0, 50, 'One');
    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    video.currentTime = 10;
    await updateCaptions();
    const textContainer = videoContainer.querySelector('.shaka-text-container');

    let cueElements = textContainer.querySelectorAll('div');
    expect(cueElements.length).toBe(1);
    expect(cueElements[0].textContent).toBe('One');

    textDisplayer.remove(0, 100);

    cueElements = textContainer.querySelectorAll('div');
    expect(cueElements.length).toBe(0);
  });

  it('hides and shows nested cues at appropriate times', async () => {
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
    await updateCaptions();
    /** @type {Element} */
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    let parentCueElements = textContainer.querySelectorAll('div');

    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('One');

    video.currentTime = 35;
    await updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('OneTwo');

    video.currentTime = 60;
    await updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('TwoThree');

    video.currentTime = 85;
    await updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('Three');

    video.currentTime = 95;
    await updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(2);
    expect(parentCueElements[0].textContent).toBe('Three');
    expect(parentCueElements[1].textContent).toBe('Four');

    video.currentTime = 105;
    await updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('Four');

    video.currentTime = 150;
    await updateCaptions();
    parentCueElements = textContainer.querySelectorAll('div');
    expect(parentCueElements.length).toBe(1);
    expect(parentCueElements[0].textContent).toBe('');
  });

  it('keeps nested cues in the order of the document', async () => {
    const parentCue = new shaka.text.Cue(0, 100, '');
    // The second nested cue begins first.
    parentCue.nestedCues = [
      new shaka.text.Cue(10, 100, 'One'),
      new shaka.text.Cue(5, 100, 'Two'),
    ];

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([parentCue]);

    video.currentTime = 20;
    await updateCaptions();
    /** @type {Element} */
    const textContainer = videoContainer.querySelector('.shaka-text-container');
    expect(textContainer.textContent).toBe('OneTwo');
  });

  it('creates separate elements for cue regions', async () => {
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
      new shaka.text.Cue(0, 200, ''),
      new shaka.text.Cue(0, 300, ''),
    ];
    for (const cue of cues) {
      cue.displayAlign = shaka.text.Cue.displayAlign.CENTER;
      cue.region = cueRegion;
    }

    textDisplayer.setTextVisibility(true);
    textDisplayer.append(cues);
    await updateCaptions();

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

    // Regions with a fixed height don't clip their cues.
    expect(regionElement.style.overflow).toBe('');
  });

  it('applies the styles of cue regions', async () => {
    const cueRegion = new shaka.text.CueRegion();
    cueRegion.id = 'regionId';
    cueRegion.width = 50;
    cueRegion.height = 40;
    cueRegion.backgroundColor = 'red';
    cueRegion.opacity = 0.5;
    // In percentage of the height or of the width of the region.
    cueRegion.padding = '10% 5px 0% 20%';
    cueRegion.overflow = 'hidden';
    cueRegion.zIndex = 2;
    const cue = new shaka.text.Cue(0, 100, 'Test');
    cue.region = cueRegion;

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    const regionElement = /** @type {!HTMLElement} */ (
      videoContainer.querySelector('.shaka-text-region'));
    expect(regionElement.style.backgroundColor).toBe('red');
    expect(regionElement.style.opacity).toBe('0.5');
    expect(regionElement.style.overflow).toBe('hidden');
    expect(regionElement.style.zIndex).toBe('2');
    // The padding is inside the region.
    expect(regionElement.style.boxSizing).toBe('border-box');
    const regionHeight = videoContainer.clientHeight * 0.4;
    const regionWidth = videoContainer.clientWidth * 0.5;
    expect(parseFloat(regionElement.style.paddingTop))
        .toBeCloseTo(regionHeight * 0.1, 2);
    expect(regionElement.style.paddingRight).toBe('5px');
    expect(parseFloat(regionElement.style.paddingBottom)).toBe(0);
    expect(parseFloat(regionElement.style.paddingLeft))
        .toBeCloseTo(regionWidth * 0.2, 2);
  });

  it('paints the background of a region while it shows content', async () => {
    const cueRegion = new shaka.text.CueRegion();
    cueRegion.id = 'regionId';
    cueRegion.backgroundColor = 'red';
    const containerCue = new shaka.text.Cue(0, 100, '');
    containerCue.region = cueRegion;
    containerCue.nestedCues = [new shaka.text.Cue(0, 50, 'Test')];

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([containerCue]);

    video.currentTime = 10;
    await updateCaptions();
    let regionElement = /** @type {!HTMLElement} */ (
      videoContainer.querySelector('.shaka-text-region'));
    expect(regionElement.style.backgroundColor).toBe('red');

    // The container is still displayed, but none of its content is.
    video.currentTime = 60;
    await updateCaptions();
    regionElement = /** @type {!HTMLElement} */ (
      videoContainer.querySelector('.shaka-text-region'));
    expect(regionElement.style.backgroundColor).toBe('');
  });

  it('converts the line height in cells', async () => {
    const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
    cue.lineHeight = '1c';
    cue.cellResolution = {
      columns: 60,
      rows: 20,
    };

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    // videoContainerHeight=450px and ttp:cellResolution="60 20".
    const captions = videoContainer.querySelector('.shaka-text-container div');
    expect(captions.style.lineHeight).toBe('22.5px');
  });

  it('draws the text stroke with the inherited text color', async () => {
    const cue = new shaka.text.Cue(0, 100, '');
    cue.color = 'red';
    const nestedCue = new shaka.text.Cue(0, 100, 'Stroke');
    nestedCue.textStrokeWidth = '2px';
    cue.nestedCues = [nestedCue];

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    const element = Array.from(videoContainer.querySelectorAll(
        '.shaka-text-container span')).find(
        (e) => e.textContent == 'Stroke' && e.style.textShadow);
    expect(element.style.textShadow).toContain('red');
    expect(element.style.textShadow).not.toContain('undefined');
  });

  it('draws the text stroke around the text', async () => {
    const cue = new shaka.text.Cue(0, 100, '');
    cue.textStrokeColor = 'red';
    cue.textStrokeWidth = '2px';
    cue.textShadow = '1px 1px blue';
    const removedStroke = new shaka.text.Cue(0, 100, 'No stroke');
    removedStroke.textStrokeWidth = '0';
    cue.nestedCues = [new shaka.text.Cue(0, 100, 'Stroke'), removedStroke];

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    /**
     * @param {string} text
     * @return {string}
     */
    const getTextShadow = (text) => {
      const elements = Array.from(videoContainer.querySelectorAll(
          '.shaka-text-container span'));
      const element = elements.find(
          (e) => e.textContent == text && e.style.textShadow);
      return element.style.textShadow;
    };
    /**
     * @param {string} textShadow
     * @return {number}
     */
    const countStrokeShadows =
        (textShadow) => textShadow.split('red').length - 1;

    // A CSS stroke would be drawn over the text.
    const cueElement =
        videoContainer.querySelector('.shaka-text-container div');
    expect(cueElement.style.webkitTextStrokeWidth).toBe('');
    expect(countStrokeShadows(cueElement.style.textShadow)).toBe(16);
    expect(cueElement.style.textShadow).toContain('blue');
    // The nested cues inherit the stroke and the shadow, unless they remove
    // them.
    expect(countStrokeShadows(getTextShadow('Stroke'))).toBe(16);
    expect(getTextShadow('Stroke')).toContain('blue');
    expect(countStrokeShadows(getTextShadow('No stroke'))).toBe(0);
    expect(getTextShadow('No stroke')).toContain('blue');
  });

  it('hides the cues which are not visible', async () => {
    const cue = new shaka.text.Cue(0, 100, 'Hidden');
    cue.visibility = 'hidden';

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    const cueElement = /** @type {!HTMLElement} */ (
      videoContainer.querySelector('.shaka-text-container > div'));
    // The cue still takes its place.
    expect(cueElement.style.visibility).toBe('hidden');
    expect(cueElement.textContent).toBe('Hidden');
  });

  it('applies the bidirectional embedding level of the cues', async () => {
    const cue = new shaka.text.Cue(0, 100, 'Override');
    cue.direction = shaka.text.Cue.direction.HORIZONTAL_RIGHT_TO_LEFT;
    cue.unicodeBidi = 'bidi-override';

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    const cueElement = /** @type {!HTMLElement} */ (
      videoContainer.querySelector('.shaka-text-container > div'));
    expect(cueElement.style.direction).toBe('rtl');
    expect(cueElement.style.unicodeBidi).toBe('bidi-override');
  });

  it('falls back to the prefixed bidirectional embedding level', async () => {
    const cue = new shaka.text.Cue(0, 100, 'Isolated');
    cue.unicodeBidi = 'isolate';
    // An older browser which only supports the prefixed value.  The
    // prototype which defines the property depends on the browser.
    const prototypes = [];
    for (let p = Object.getPrototypeOf(document.createElement('div').style);
      p; p = Object.getPrototypeOf(p)) {
      prototypes.push(p);
    }
    const style = /** @type {!Object} */ (prototypes.find((p) =>
      Object.getOwnPropertyDescriptor(p, 'unicodeBidi')) || prototypes[0]);
    const descriptor =
        Object.getOwnPropertyDescriptor(style, 'unicodeBidi');
    const values = new WeakMap();
    Object.defineProperty(style, 'unicodeBidi', {
      configurable: true,
      // The accessors need the style they are called on, as "this".
      /**
       * @this {!CSSStyleDeclaration}
       * @return {string}
       */
      // eslint-disable-next-line no-restricted-syntax
      get() {
        return values.get(this) || '';
      },
      /**
       * @this {!CSSStyleDeclaration}
       * @param {string} value
       */
      // eslint-disable-next-line no-restricted-syntax
      set(value) {
        if (value != 'isolate') {
          values.set(this, value);
        }
      },
    });

    try {
      textDisplayer.setTextVisibility(true);
      textDisplayer.append([cue]);
      await updateCaptions();

      const cueElement = /** @type {!HTMLElement} */ (
        videoContainer.querySelector('.shaka-text-container > div'));
      expect(cueElement.style.unicodeBidi).toBe('-webkit-isolate');
    } finally {
      if (descriptor) {
        Object.defineProperty(style, 'unicodeBidi', descriptor);
      } else {
        delete style['unicodeBidi'];
      }
    }
  });

  it('does not wrap the lines of cues which should not wrap', async () => {
    const cue = new shaka.text.Cue(0, 100, 'Test');
    cue.wrapLine = false;

    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    const cueElement = /** @type {!HTMLElement} */ (
      videoContainer.querySelector('.shaka-text-container > div'));
    expect(cueElement.style.whiteSpace).toBe('pre');
  });

  describe('regions sized in lines', () => {
    /**
     * @param {number} lines
     * @return {!shaka.text.CueRegion}
     */
    function createLinesRegion(lines) {
      const region = new shaka.text.CueRegion();
      region.id = 'fred';
      region.width = 40;
      region.height = lines;
      region.heightUnits = shaka.text.CueRegion.units.LINES;
      region.regionAnchorX = 50;
      region.regionAnchorY = 100;
      region.viewportAnchorX = 50;
      region.viewportAnchorY = 80;
      return region;
    }

    /**
     * @param {number} startTime
     * @param {!shaka.text.CueRegion} region
     * @return {!shaka.text.Cue}
     */
    function createCue(startTime, region) {
      const cue = new shaka.text.Cue(startTime, 100, 'Test ' + startTime);
      cue.region = region;
      return cue;
    }

    /**
     * Positions the text container over the video container, as the UI styles
     * do, which the unit tests don't load.
     * @return {!DOMRect}
     */
    function positionTextContainer() {
      videoContainer.style.position = 'relative';
      const textContainer = /** @type {!HTMLElement} */ (
        videoContainer.querySelector('.shaka-text-container'));
      textContainer.style.position = 'absolute';
      textContainer.style.top = '0';
      textContainer.style.left = '0';
      textContainer.style.width = '100%';
      textContainer.style.height = '100%';
      return textContainer.getBoundingClientRect();
    }

    afterEach(() => {
      videoContainer.style.position = '';
    });

    /** @return {!HTMLElement} */
    function getRegionElement() {
      const regionElements =
          videoContainer.querySelectorAll('.shaka-text-region');
      expect(regionElements.length).toBe(1);
      return /** @type {!HTMLElement} */ (regionElements[0]);
    }

    it('sizes and anchors the region box', async () => {
      textDisplayer.setTextVisibility(true);
      textDisplayer.append([createCue(0, createLinesRegion(3))]);
      await updateCaptions();

      const regionElement = getRegionElement();
      // From the default displayAlign of the cue.
      expect(regionElement.style.justifyContent).toBe('flex-end');

      // The region is 3 lines tall, with the line height of its cues.
      const fontSize = parseFloat(getComputedStyle(regionElement).fontSize);
      const lineHeight =
          parseFloat(getComputedStyle(regionElement).lineHeight);
      expect(lineHeight).toBeCloseTo(1.4 * fontSize, 1);
      const container = positionTextContainer();
      const box = regionElement.getBoundingClientRect();
      expect(box.height).toBeCloseTo(3 * lineHeight, 0);
      expect(box.width).toBeCloseTo(0.4 * container.width, 0);
      // The bottom center of the region is anchored at 50%,80% of the
      // viewport.
      expect(box.left - container.left)
          .toBeCloseTo(0.5 * container.width - box.width / 2, 0);
      expect(box.bottom - container.top).toBeCloseTo(0.8 * container.height, 0);
    });

    it('scales the lines with the font scale factor', async () => {
      const config =
          shaka.util.PlayerConfiguration.createDefault().textDisplayer;
      config.suspendRenderingWhenHidden = false;
      config.fontScaleFactor = 2;
      textDisplayer.configure(config);
      textDisplayer.setTextVisibility(true);
      textDisplayer.append([createCue(0, createLinesRegion(2))]);
      await updateCaptions();

      const regionElement = getRegionElement();
      const fontSize = parseFloat(getComputedStyle(regionElement).fontSize);
      const box = regionElement.getBoundingClientRect();
      expect(box.height).toBeCloseTo(2 * 1.4 * 2 * fontSize, 0);
    });

    it('sizes regions with a width in columns', async () => {
      // As CEA-708 windows are.
      const region = createLinesRegion(2);
      region.width = 32;
      region.widthUnits = shaka.text.CueRegion.units.LINES;

      textDisplayer.setTextVisibility(true);
      textDisplayer.append([createCue(0, region)]);
      await updateCaptions();

      const regionElement = getRegionElement();
      const lineHeight =
          parseFloat(getComputedStyle(regionElement).lineHeight);
      positionTextContainer();
      const box = regionElement.getBoundingClientRect();
      expect(box.height).toBeCloseTo(2 * lineHeight, 0);
      // The text that doesn't fit is shown, not hidden.
      expect(regionElement.style.overflow).toBe('');
    });

    it('keeps apart regions of the same size in other units', async () => {
      const vttRegion = createLinesRegion(3);
      const pixelRegion = vttRegion.clone();
      pixelRegion.heightUnits = shaka.text.CueRegion.units.PX;

      textDisplayer.setTextVisibility(true);
      textDisplayer.append([
        createCue(0, vttRegion),
        createCue(0, pixelRegion),
      ]);
      await updateCaptions();

      expect(videoContainer.querySelectorAll('.shaka-text-region').length)
          .toBe(2);
    });

    describe('scroll', () => {
      /** @type {!jasmine.Spy} */
      let animateSpy;

      beforeEach(() => {
        // eslint-disable-next-line no-restricted-syntax
        const prototype = HTMLElement.prototype;
        if (!prototype.animate) {
          pending('Element.animate() is not supported');
        }
        animateSpy = spyOn(prototype, 'animate').and.callThrough();
      });

      it('scrolls up the lines when a cue is added', async () => {
        const region = createLinesRegion(2);
        region.scroll = shaka.text.CueRegion.scrollMode.UP;

        textDisplayer.setTextVisibility(true);
        textDisplayer.append([createCue(0, region)]);
        await updateCaptions();
        // Nothing to scroll for the first cue.
        expect(animateSpy).not.toHaveBeenCalled();

        textDisplayer.append([createCue(1, region)]);
        video.currentTime = 1;
        await updateCaptions();

        const regionElement = getRegionElement();
        const children = /** @type {!Array<!HTMLElement>} */ (
          Array.from(regionElement.childNodes));
        expect(children.length).toBe(2);
        const newLineHeight = children[1].offsetHeight;
        expect(newLineHeight).toBeGreaterThan(0);
        // Both lines move up from one line below.
        expect(animateSpy).toHaveBeenCalledTimes(2);
        for (const call of animateSpy.calls.all()) {
          expect(children).toContain(call.object);
          expect(call.args[0]).toEqual([
            {transform: `translateY(${newLineHeight}px)`},
            {transform: 'translateY(0)'},
          ]);
          expect(call.args[1]).toEqual(
              jasmine.objectContaining({duration: 433}));
        }
      });

      it('scrolls up regions with a fixed height', async () => {
        const region = new shaka.text.CueRegion();
        region.id = 'window';
        region.height = 20;
        region.width = 80;
        region.scroll = shaka.text.CueRegion.scrollMode.UP;

        textDisplayer.setTextVisibility(true);
        textDisplayer.append([createCue(0, region)]);
        await updateCaptions();
        textDisplayer.append([createCue(1, region)]);
        video.currentTime = 1;
        await updateCaptions();

        const regionElement = getRegionElement();
        expect(regionElement.style.justifyContent).toBe('flex-end');
        expect(regionElement.style.overflow).toBe('hidden');
        expect(animateSpy).toHaveBeenCalledTimes(2);
      });

      it('does not scroll regions without scroll:up', async () => {
        const region = createLinesRegion(2);

        textDisplayer.setTextVisibility(true);
        textDisplayer.append([createCue(0, region)]);
        await updateCaptions();
        textDisplayer.append([createCue(1, region)]);
        video.currentTime = 1;
        await updateCaptions();

        expect(getRegionElement().childNodes.length).toBe(2);
        expect(animateSpy).not.toHaveBeenCalled();
      });
    });
  });

  it('does not lose second item in a region', async () => {
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
    await updateCaptions();

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
    await updateCaptions();

    allRegionElements = textContainer.querySelectorAll(
        '.shaka-text-region');
    expect(allRegionElements.length).toBe(1);

    // Advance time to where there is something to show
    video.currentTime = 173;
    await updateCaptions();

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

  // eslint-disable-next-line @stylistic/max-len
  it('creates separate regions when dimensions differ but id same', async () => {
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
      new shaka.text.Cue(0, 200, ''),
      new shaka.text.Cue(0, 300, ''),
    ];
    for (const cue of firstBatchOfCues) {
      cue.displayAlign = shaka.text.Cue.displayAlign.CENTER;
      cue.region = cueRegion1;
    }

    // Another batch for the other region
    const secondBatchOfCues = [
      new shaka.text.Cue(0, 100, ''),
      new shaka.text.Cue(0, 200, ''),
      new shaka.text.Cue(0, 300, ''),
    ];
    for (const cue of secondBatchOfCues) {
      cue.displayAlign = shaka.text.Cue.displayAlign.CENTER;
      cue.region = cueRegion2;
    }

    textDisplayer.setTextVisibility(true);
    textDisplayer.append(firstBatchOfCues);
    textDisplayer.append(secondBatchOfCues);
    await updateCaptions();

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

  it('textDisplayer does not crash if destroy is called more than once', () => {
    textDisplayer.setTextVisibility(true);

    expect(videoContainer.childNodes.length).toBe(1);

    textDisplayer.destroy();
    textDisplayer.destroy();

    expect(videoContainer.childNodes.length).toBe(0);
  });

  it('previews text styles through the normal renderer', async () => {
    const cue = new shaka.text.Cue(0, 100, 'Previewed cue');
    const config =
        shaka.util.PlayerConfiguration.createDefault().textDisplayer;
    config.suspendRenderingWhenHidden = false;

    textDisplayer.configure(config);
    textDisplayer.setTextVisibility(true);
    textDisplayer.append([cue]);
    await updateCaptions();

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    let cueElement = textContainer.querySelector('div');
    expect(cueElement.textContent).toBe('Previewed cue');
    expect(cueElement.style.fontSize).toBe('');

    const previewConfig =
    /** @type {!shaka.extern.TextDisplayerConfiguration} */(
        Object.assign({}, config, {'fontScaleFactor': 2}));
    textDisplayer.setTextStylePreview(
        previewConfig, 'Subtitles example');

    cueElement = textContainer.querySelector('div');
    expect(cueElement.textContent).toBe('Previewed cue');
    expect(cueElement.style.fontSize).toBe('2em');

    textDisplayer.clearTextStylePreview();

    cueElement = textContainer.querySelector('div');
    expect(cueElement.textContent).toBe('Previewed cue');
    expect(cueElement.style.fontSize).toBe('');
  });

  describe('fontScaleFactor', () => {
    beforeEach(() => {
      const config =
          shaka.util.PlayerConfiguration.createDefault().textDisplayer;
      config.suspendRenderingWhenHidden = false;
      config.fontScaleFactor = 2;
      textDisplayer.configure(config);
      textDisplayer.setTextVisibility(true);
    });

    /**
     * @param {string} text
     * @return {!Array<!shaka.text.Cue>}
     */
    function parseVtt(text) {
      return new shaka.text.VttTextParser().parseMedia(
          shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(text)),
          {
            periodStart: 0,
            segmentStart: 0,
            segmentEnd: 100,
            vttOffset: 0,
            isMpegTs: false,
          },
          null, []);
    }

    /**
     * @param {string} body
     * @return {!Array<!shaka.text.Cue>}
     */
    function parseTtml(body) {
      return new shaka.text.TtmlTextParser().parseMedia(
          shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(
              '<tt xmlns="http://www.w3.org/ns/ttml" ' +
              'xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
              body + '</tt>')),
          {
            periodStart: 0,
            segmentStart: 0,
            segmentEnd: 100,
            vttOffset: 0,
            isMpegTs: false,
          },
          null, []);
    }

    /**
     * @param {!Array<!shaka.text.Cue>} cues
     * @param {string} text
     * @return {!Promise<number>} The computed font size of the innermost
     *   element containing the text, in pixels.
     */
    async function getFontSize(cues, text) {
      textDisplayer.append(cues);
      await updateCaptions();
      const textContainer =
          videoContainer.querySelector('.shaka-text-container');
      const elements = Array.from(textContainer.querySelectorAll('*'))
          .filter((e) => e.textContent.trim() == text);
      const element = elements[elements.length - 1];
      expect(element).toBeTruthy();
      return parseFloat(getComputedStyle(element).fontSize);
    }

    /** @return {number} */
    function getBaseFontSize() {
      return parseFloat(getComputedStyle(
          videoContainer.querySelector('.shaka-text-container')).fontSize);
    }

    it('scales CEA-608/708 cues only once', async () => {
      const cue = new shaka.text.Cue(0, 100, '');
      const nestedCue = shaka.cea.CeaUtils.createStyledCue(
          0, 100, /* underline= */ false, /* italics= */ true,
          'white', 'black');
      nestedCue.payload = 'Captain\'s log.';
      cue.nestedCues = [nestedCue];

      const fontSize = await getFontSize([cue], 'Captain\'s log.');
      expect(fontSize).toBeCloseTo(2 * getBaseFontSize(), 1);
    });

    it('scales deeply nested WebVTT cues only once', async () => {
      const cues = parseVtt(
          'WEBVTT\n\n' +
          '00:00:00.000 --> 00:01:40.000\n' +
          '<c>one <c>two <c>three <c>four</c></c></c></c>\n');

      const fontSize = await getFontSize(cues, 'four');
      expect(fontSize).toBeCloseTo(2 * getBaseFontSize(), 1);
    });

    it('does not scale nested WebVTT font sizes in em again', async () => {
      const cues = parseVtt(
          'WEBVTT\n\n' +
          'STYLE\n::cue(.big) { font-size: 150%; }\n\n' +
          '00:00:00.000 --> 00:01:40.000\n' +
          '<c>one <c>two <c.big>three</c></c></c>\n');

      const fontSize = await getFontSize(cues, 'three');
      expect(fontSize).toBeCloseTo(2 * 1.5 * getBaseFontSize(), 1);
    });

    it('scales nested TTML cues only once', async () => {
      const cues = parseTtml(
          '<body><div><p begin="0s" end="100s">' +
          '<span>one <span>two</span></span>' +
          '<span tts:fontSize="10px">three</span>' +
          '</p></div></body>');

      // The default cell resolution is 32 by 15 cells, and the default font
      // size is 1c.
      const cellHeight = videoContainerHeight / 15;
      expect(await getFontSize(cues, 'two')).toBeCloseTo(2 * cellHeight, 1);
      expect(await getFontSize([], 'three')).toBeCloseTo(2 * 10, 1);
    });
  });

  // eslint-disable-next-line @stylistic/max-len
  it('shows example text only when no cue is active during preview', async () => {
    const config =
        shaka.util.PlayerConfiguration.createDefault().textDisplayer;
    config.suspendRenderingWhenHidden = false;

    textDisplayer.configure(config);
    textDisplayer.setTextVisibility(true);

    textDisplayer.setTextStylePreview(config, 'Subtitles example');

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    expect(textContainer.textContent).toBe('Subtitles example');

    textDisplayer.clearTextStylePreview();
    expect(textContainer.textContent).toBe('');

    textDisplayer.setTextStylePreview(config, 'Subtitles example');
    expect(textContainer.textContent).toBe('Subtitles example');

    textDisplayer.append([new shaka.text.Cue(0, 100, 'Real subtitle')]);
    await updateCaptions();

    expect(textContainer.textContent).toBe('Real subtitle');
  });

  it('shows example text while normal text visibility is off', () => {
    const config =
        shaka.util.PlayerConfiguration.createDefault().textDisplayer;
    config.suspendRenderingWhenHidden = false;

    textDisplayer.configure(config);

    textDisplayer.setTextStylePreview(config, 'Subtitles example');

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    expect(textContainer.textContent).toBe('Subtitles example');

    textDisplayer.clearTextStylePreview();

    expect(videoContainer.querySelector('.shaka-text-container')).toBe(null);
  });

  it('shows example text over a hidden cue while visibility is off',
      async () => {
        const config =
            shaka.util.PlayerConfiguration.createDefault().textDisplayer;
        config.suspendRenderingWhenHidden = false;

        textDisplayer.configure(config);
        textDisplayer.append([new shaka.text.Cue(0, 100, 'Real subtitle')]);
        await updateCaptions();

        textDisplayer.setTextStylePreview(config, 'Subtitles example');

        const textContainer =
            videoContainer.querySelector('.shaka-text-container');
        expect(textContainer.textContent).toBe('Subtitles example');

        textDisplayer.clearTextStylePreview();

        expect(videoContainer.querySelector('.shaka-text-container'))
            .toBe(null);
      });

  it('replaces example text during repeated preview updates', () => {
    const config =
        shaka.util.PlayerConfiguration.createDefault().textDisplayer;
    config.suspendRenderingWhenHidden = false;

    textDisplayer.configure(config);
    textDisplayer.setTextVisibility(true);

    textDisplayer.setTextStylePreview(config, 'First example');

    const textContainer = videoContainer.querySelector('.shaka-text-container');
    let cueElements = textContainer.querySelectorAll('div');
    expect(cueElements.length).toBe(1);
    expect(textContainer.textContent).toBe('First example');

    textDisplayer.setTextStylePreview(config, 'Second example');

    cueElements = textContainer.querySelectorAll('div');
    expect(cueElements.length).toBe(1);
    expect(textContainer.textContent).toBe('Second example');
  });

  it('positions cue at top-left when positionArea=TOP_LEFT', async () => {
    /** @type {!shaka.text.Cue} */
    const cue = new shaka.text.Cue(0, 100, 'Top-Left');

    textDisplayer.setTextVisibility(true);
    const config =
        shaka.util.PlayerConfiguration.createDefault().textDisplayer;
    config.suspendRenderingWhenHidden = false;
    config.positionArea = shaka.config.PositionArea.TOP_LEFT;
    textDisplayer.configure(config);

    textDisplayer.append([cue]);
    await updateCaptions();

    /** @type {Element} */
    const textContainer = videoContainer.querySelector('.shaka-text-container');

    // Top-level cue should be a DIV
    const cueElement = textContainer.querySelector('div');

    // The custom region (CustomRegion) should be created and wrap the cue
    const regionElement = textContainer.querySelector('.shaka-text-region');

    // --- Region validations (CustomRegion: 90% x 90% at top/left 5%) ---
    const regionCss = parseCssText(regionElement.style.cssText);
    expect(regionCss).toEqual(jasmine.objectContaining({
      'position': 'absolute',
      'height': '90%',
      'width': '90%',
      'top': '5%',
      'left': '5%',
      'display': 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      // displayAlign BEFORE => justifyContent 'flex-start'
      'justify-content': 'flex-start',
    }));

    // --- Cue validations (LEFT + BEFORE) ---
    const cueCss = parseCssText(cueElement.style.cssText);
    expect(cueCss).toEqual(jasmine.objectContaining({
      'display': 'flex',
      'flex-direction': 'column',
      // textAlign LEFT => alignItems 'flex-start' and width 100%
      'align-items': 'flex-start',
      'width': '100%',
      // displayAlign BEFORE => justifyContent 'flex-start'
      'justify-content': 'flex-start',
      'text-align': 'left',
    }));

    // Text content should be present
    expect(cueElement.textContent).toBe('Top-Left');
  });

  describe('getNextBoundary_', () => {
    /**
     * @param {!Array<!shaka.text.Cue>} cues
     * @param {number} time
     * @return {?number}
     * @suppress {visibility}
     */
    function getNextBoundary(cues, time) {
      return textDisplayer.getNextBoundary_(cues, time);
    }

    it('returns the earliest boundary strictly after the time', () => {
      const cues = [new shaka.text.Cue(1, 3, 'a')];
      expect(getNextBoundary(cues, 0)).toBe(1);
      expect(getNextBoundary(cues, 1)).toBe(3);
      expect(getNextBoundary(cues, 2)).toBe(3);
      // No boundary remains after the cue has ended.
      expect(getNextBoundary(cues, 3)).toBe(null);
    });

    it('considers all cues', () => {
      const cues = [
        new shaka.text.Cue(1, 3, 'a'),
        new shaka.text.Cue(5, 8, 'b'),
      ];
      expect(getNextBoundary(cues, 3)).toBe(5);
      expect(getNextBoundary(cues, 5)).toBe(8);
    });

    it('descends into nested cues (character-by-character reveals)', () => {
      const cue = new shaka.text.Cue(1, 10, '');
      cue.nestedCues = [
        new shaka.text.Cue(2, 10, 'a'),
        new shaka.text.Cue(5, 10, 'b'),
      ];
      const cues = [cue];
      expect(getNextBoundary(cues, 1)).toBe(2);
      expect(getNextBoundary(cues, 2)).toBe(5);
      expect(getNextBoundary(cues, 5)).toBe(10);
    });
  });

  describe('style overrides', () => {
    /** @type {!shaka.extern.TextDisplayerConfiguration} */
    let config;

    beforeEach(() => {
      config = shaka.util.PlayerConfiguration.createDefault().textDisplayer;
      config.suspendRenderingWhenHidden = false;
      textDisplayer.setTextVisibility(true);
    });

    /**
     * Normalizes a CSS color the way the browser serializes it.
     *
     * @param {string} color
     * @return {string}
     */
    function normalizeColor(color) {
      const element = document.createElement('div');
      element.style.color = color;
      return element.style.color;
    }

    /**
     * @param {!Array<!shaka.text.Cue>} cues
     * @return {!Promise<!Element>} The text container.
     */
    async function render(cues) {
      textDisplayer.configure(config);
      textDisplayer.append(cues);
      await updateCaptions();
      return /** @type {!Element} */(
        videoContainer.querySelector('.shaka-text-container'));
    }

    /** @return {!shaka.text.Cue} */
    function createStyledCue() {
      const cue = new shaka.text.Cue(0, 100, 'Captain\'s log.');
      cue.color = 'green';
      cue.backgroundColor = 'rgba(255, 0, 0, 0.5)';
      cue.fontFamily = 'Arial';
      cue.textShadow = 'red 1px 1px';
      return cue;
    }

    it('keeps the style of the subtitle by default', async () => {
      const textContainer = await render([createStyledCue()]);
      const cueElement = textContainer.querySelector('div');
      const textElement = textContainer.querySelector('span');

      expect(cueElement.style.color).toBe(normalizeColor('green'));
      expect(cueElement.style.fontFamily).toBe('Arial');
      expect(cueElement.style.textShadow).toContain('1px 1px');
      expect(textElement.style.backgroundColor)
          .toBe(normalizeColor('rgba(255, 0, 0, 0.5)'));
    });

    it('keeps the default background by default', async () => {
      const textContainer =
          await render([new shaka.text.Cue(0, 100, 'Captain\'s log.')]);
      const textElement = textContainer.querySelector('span');
      expect(textElement.style.backgroundColor)
          .toBe(normalizeColor('rgba(0, 0, 0, 0.8)'));
    });

    it('overrides the font color', async () => {
      config.fontColor = '#ff0';
      const cue = createStyledCue();
      const nestedCue = new shaka.text.Cue(0, 100, 'Nested');
      nestedCue.color = 'cyan';
      cue.nestedCues = [nestedCue];
      const textContainer = await render([cue]);

      expect(textContainer.querySelector('div').style.color)
          .toBe(normalizeColor('#ff0'));
      const nestedElement =
          textContainer.querySelector('span:not(.shaka-text-wrapper)');
      expect(nestedElement.style.color).toBe(normalizeColor('#ff0'));
    });

    it('applies the font opacity to the font color of the subtitle',
        async () => {
          config.fontOpacity = 0.5;
          const textContainer = await render([createStyledCue()]);
          expect(textContainer.querySelector('div').style.color)
              .toBe(normalizeColor('rgba(0, 128, 0, 0.5)'));
        });

    it('applies the font opacity to the font color of the container',
        async () => {
          config.fontOpacity = 0.25;
          const textContainer =
              await render([new shaka.text.Cue(0, 100, 'Captain\'s log.')]);
          const containerColor = getComputedStyle(textContainer).color;
          const expected = shaka.text.Utils.setColorOpacity(
              containerColor, 0.25);
          expect(textContainer.querySelector('div').style.color)
              .toBe(normalizeColor(/** @type {string} */(expected)));
        });

    it('applies the font opacity to the configured font color', async () => {
      config.fontColor = '#f00';
      config.fontOpacity = 0.75;
      const textContainer = await render([createStyledCue()]);
      expect(textContainer.querySelector('div').style.color)
          .toBe(normalizeColor('rgba(255, 0, 0, 0.75)'));
    });

    it('overrides the background color', async () => {
      config.backgroundColor = '#00f';
      const textContainer = await render([createStyledCue()]);
      expect(textContainer.querySelector('span').style.backgroundColor)
          .toBe(normalizeColor('#00f'));
    });

    it('applies the background opacity to the background of the subtitle',
        async () => {
          config.backgroundOpacity = 1;
          const textContainer = await render([createStyledCue()]);
          expect(textContainer.querySelector('span').style.backgroundColor)
              .toBe(normalizeColor('rgb(255, 0, 0)'));
        });

    it('applies the background opacity to the default background',
        async () => {
          config.backgroundOpacity = 0.25;
          const textContainer =
              await render([new shaka.text.Cue(0, 100, 'Captain\'s log.')]);
          expect(textContainer.querySelector('span').style.backgroundColor)
              .toBe(normalizeColor('rgba(0, 0, 0, 0.25)'));
        });

    it('paints a customized background only behind the text', async () => {
      config.backgroundColor = '#080808';
      config.backgroundOpacity = 0.5;
      const cue = new shaka.text.Cue(0, 100, '');
      cue.backgroundColor = 'black';
      const nestedCue = new shaka.text.Cue(0, 100, 'Nested');
      cue.nestedCues = [nestedCue];
      const textContainer = await render([cue]);

      const wrapper = textContainer.querySelector('.shaka-text-wrapper');
      expect(wrapper.style.backgroundColor).toBe('');
      // Only the element with the text has a background.
      const nestedElement = wrapper.querySelector('span');
      const textElement = nestedElement.querySelector('span');
      expect(nestedElement.style.backgroundColor).toBe('');
      expect(textElement.textContent).toBe('Nested');
      expect(textElement.style.backgroundColor)
          .toBe(normalizeColor('rgba(8, 8, 8, 0.5)'));
    });

    it('does not paint a window by default', async () => {
      const textContainer = await render([createStyledCue()]);
      expect(textContainer.querySelector('.shaka-text-window')).toBe(null);
    });

    it('paints the window behind the text of a cue', async () => {
      config.windowColor = '#00f';
      const textContainer = await render([createStyledCue()]);

      const cueElement = textContainer.querySelector('div');
      const windowElement = cueElement.querySelector('.shaka-text-window');
      expect(windowElement.parentElement).toBe(cueElement);
      expect(windowElement.style.backgroundColor).toBe(normalizeColor('#00f'));
      // The background of the text is painted over the window.
      const textElement = windowElement.querySelector('span');
      expect(textElement.textContent).toBe('Captain\'s log.');
      expect(textElement.style.backgroundColor)
          .toBe(normalizeColor('rgba(255, 0, 0, 0.5)'));
    });

    it('applies the window opacity to the configured window color',
        async () => {
          config.windowColor = '#ff0';
          config.windowOpacity = 0.75;
          const textContainer = await render([createStyledCue()]);
          const windowElement =
              textContainer.querySelector('.shaka-text-window');
          expect(windowElement.style.backgroundColor)
              .toBe(normalizeColor('rgba(255, 255, 0, 0.75)'));
        });

    it('paints a black window if only the window opacity is configured',
        async () => {
          config.windowOpacity = 0.5;
          const textContainer = await render([createStyledCue()]);
          const windowElement =
              textContainer.querySelector('.shaka-text-window');
          expect(windowElement.style.backgroundColor)
              .toBe(normalizeColor('rgba(0, 0, 0, 0.5)'));
        });

    it('paints the window behind all the lines of nested cues', async () => {
      config.windowColor = '#0f0';
      const cue = new shaka.text.Cue(0, 100, '');
      cue.backgroundColor = 'black';
      const firstLine = new shaka.text.Cue(0, 100, 'First');
      const lineBreak = new shaka.text.Cue(0, 100, '');
      lineBreak.lineBreak = true;
      const secondLine = new shaka.text.Cue(0, 100, 'Second');
      cue.nestedCues = [firstLine, lineBreak, secondLine];
      const textContainer = await render([cue]);

      // The wrapper of the lines is the window.
      const wrapper = textContainer.querySelector('.shaka-text-wrapper');
      expect(wrapper.style.backgroundColor).toBe(normalizeColor('#0f0'));
      expect(textContainer.querySelector('.shaka-text-window')).toBe(null);
      const textElements = Array.from(
          wrapper.querySelectorAll(':scope > span > span'));
      expect(textElements.map((e) => e.textContent))
          .toEqual(['First', 'Second']);
      for (const textElement of textElements) {
        expect(textElement.style.backgroundColor)
            .toBe(normalizeColor('black'));
      }
    });

    it('paints the window behind the blocks of a container', async () => {
      config.windowColor = '#f0f';
      const container = new shaka.text.Cue(0, 100, '');
      container.isContainer = true;
      const paragraph = new shaka.text.Cue(0, 100, '');
      const span = new shaka.text.Cue(0, 100, 'Paragraph');
      paragraph.nestedCues = [span];
      container.nestedCues = [paragraph];
      const textContainer = await render([container]);

      const wrapper = textContainer.querySelector('.shaka-text-wrapper');
      expect(wrapper.style.backgroundColor).not.toBe(normalizeColor('#f0f'));
      const paragraphElement = wrapper.querySelector('span');
      expect(paragraphElement.style.backgroundColor)
          .toBe(normalizeColor('#f0f'));
      expect(paragraphElement.textContent).toBe('Paragraph');
    });

    it('overrides the font family', async () => {
      config.fontFamily = shaka.config.FontFamily.MONOSPACED_SERIF;
      const textContainer = await render([createStyledCue()]);
      const fontFamily = textContainer.querySelector('div').style.fontFamily;
      expect(fontFamily).toContain('Courier New');
      expect(fontFamily).toContain('monospace');
    });

    it('overrides the font family with any CSS font family', async () => {
      config.fontFamily = 'OpenDyslexic, sans-serif';
      const textContainer = await render([createStyledCue()]);
      const fontFamily = textContainer.querySelector('div').style.fontFamily;
      expect(fontFamily).toBe('OpenDyslexic, sans-serif');
    });

    it('overrides the font variant', async () => {
      config.fontVariant = 'small-caps';
      const cue = new shaka.text.Cue(0, 100, '');
      const nestedCue = new shaka.text.Cue(0, 100, 'Nested');
      cue.nestedCues = [nestedCue];
      const textContainer = await render([cue]);
      expect(textContainer.querySelector('div').style.fontVariant)
          .toBe('small-caps');
      const textElement = textContainer.querySelector(
          '.shaka-text-wrapper span span');
      expect(textElement.textContent).toBe('Nested');
      expect(getComputedStyle(textElement).fontVariant).toBe('small-caps');
    });

    it('removes the edges of the characters', async () => {
      config.characterEdgeStyle = shaka.config.CharacterEdgeStyle.NONE;
      const cue = createStyledCue();
      cue.textStrokeColor = 'black';
      cue.textStrokeWidth = '2px';
      const textContainer = await render([cue]);
      const cueElement = textContainer.querySelector('div');
      expect(cueElement.style.textShadow).toBe('none');
      expect(cueElement.style.webkitTextStrokeWidth).toBe('0px');
    });

    for (const edgeStyle of [
      'DROP_SHADOW', 'RAISED', 'DEPRESSED', 'OUTLINE',
    ]) {
      it(`draws the ${edgeStyle} character edge style`, async () => {
        config.characterEdgeStyle =
            shaka.config.CharacterEdgeStyle[edgeStyle];
        const textContainer = await render([createStyledCue()]);
        const textShadow = textContainer.querySelector('div').style.textShadow;
        expect(textShadow).toContain('em');
        expect(textShadow).not.toContain('1px 1px');
      });
    }

    it('previews the style without changing the configuration', async () => {
      const textContainer = await render([createStyledCue()]);

      const previewConfig =
      /** @type {!shaka.extern.TextDisplayerConfiguration} */(
          Object.assign({}, config, {
            'fontColor': '#0ff',
            'backgroundColor': '#f0f',
          }));
      textDisplayer.setTextStylePreview(previewConfig, 'Subtitles example');
      expect(textContainer.querySelector('div').style.color)
          .toBe(normalizeColor('#0ff'));
      expect(textContainer.querySelector('span').style.backgroundColor)
          .toBe(normalizeColor('#f0f'));

      textDisplayer.clearTextStylePreview();
      expect(textContainer.querySelector('div').style.color)
          .toBe(normalizeColor('green'));
    });
  });
});
