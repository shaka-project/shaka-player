/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('VTT tag rendering', () => {
  /**
   * Generates a rendered HTMLElement from a single cue text.
   *
   * @param {string} cueText
   * @return {!Promise<HTMLElement>}
   * @private
   */
  const renderCue = async (cueText) => {
    const container = /** @type {!HTMLElement} */(
      document.createElement('div'));
    const video = new shaka.test.FakeVideo(0);
    const displayer = new shaka.text.UITextDisplayer(video, container);
    displayer.setTextVisibility(true);

    displayer.append([new shaka.text.Cue(0, 100, cueText)]);
    await shaka.test.Util.delay(0.5);

    const elements = /** @type {NodeList<Node>} */(
      container.childNodes)[0];
    return /** @type {!HTMLElement} */(
      /** @type {NodeList<Node>} */(
        elements.childNodes)[0]);
  };

  it('text is rendered into a single span', async () => {
    const cueText = 'Hello, world!';
    const container = await renderCue(cueText);
    expect(container.textContent).toBe(cueText);
  });

  it('renders a complex input into nested elements', async () => {
    const cueText = [
      '<u>',
      '<b>Hello, </b>',
      '<i>world! </i>',
      '<a href="https://www.google.com">This is a </a>',
      '<i>complex</i> element.',
      '</u>',
    ].join('');
    const container = await renderCue(cueText);

    /**
     * Should look like:
     * <u>
     *   <b>
     *     <span>Hello, </span>
     *   </b>
     *   <i>
     *     <span>world! </span>
     *   </i>
     *   <span>This is a </span>
     *   <i>
     *     <span>complex</span>
     *   </i>
     *   <span> element.</span>
     * </u>
     */

    expect(container.childNodes[0].nodeName).toBe('U');

    const innerNodes = container.childNodes[0];
    expect(innerNodes.childNodes.length).toBe(5);

    const first = innerNodes.childNodes[0];
    expect(first.nodeName).toBe('B');
    expect(first.childNodes[0].nodeName).toBe('SPAN');
    expect(first.childNodes[0].textContent).toBe('Hello, ');

    const second = innerNodes.childNodes[1];
    expect(second.nodeName).toBe('I');
    expect(second.childNodes[0].nodeName).toBe('SPAN');
    expect(second.childNodes[0].textContent).toBe('world! ');

    const third = innerNodes.childNodes[2];
    expect(third.nodeName).toBe('SPAN');
    expect(third.textContent).toBe('This is a ');

    const fourth = innerNodes.childNodes[3];
    expect(fourth.nodeName).toBe('I');
    expect(fourth.childNodes[0].nodeName).toBe('SPAN');
    expect(fourth.childNodes[0].textContent).toBe('complex');

    const fifth = innerNodes.childNodes[4];
    expect(fifth.nodeName).toBe('SPAN');
    expect(fifth.textContent).toBe(' element.');
  });

  it('malicious tags are not rendered', async () => {
    let cueText = '<SCRIPT SRC=https://badplace.test>Test</SCRIPT>';
    cueText += '<IMG SRC="javascript:alert(\'XSS\');">';
    const container = await renderCue(cueText);

    expect(container.childNodes.length).toBe(1);
    expect(container.childNodes[0].nodeName).toBe('SPAN');
    expect(container.childNodes[0].textContent).toBe('Test');
  });
});
