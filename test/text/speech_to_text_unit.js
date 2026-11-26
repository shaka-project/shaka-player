/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SpeechToText', () => {
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.Player} */
  let player;
  /** @type {shaka.extern.SpeechToTextConfiguration} */
  let config;
  /** @type {!shaka.text.SpeechToText} */
  let speechToText;

  /** @type {!shaka.text.UITextDisplayer} */
  let displayer;
  /** @type {!HTMLElement} */
  let container;
  const originalSpeechRecognition = window.SpeechRecognition;
  const originalTranslator = window.Translator;

  beforeEach(async () => {
    container = shaka.util.Dom.createHTMLElement('div');
    video = shaka.test.UiUtils.createVideoElement();
    container.appendChild(video);
    document.body.appendChild(container);
    player = new shaka.Player();
    await player.attach(video, /* initializeMediaSource= */ false);
    player.setVideoContainer(container);
    displayer = new shaka.text.UITextDisplayer(player);
    const defaults = shaka.util.PlayerConfiguration.createDefault();
    defaults.textDisplayer.suspendRenderingWhenHidden = false;
    displayer.configure(defaults.textDisplayer);
    displayer.setTextVisibility(true);
    config = defaults.accessibility.speechToText;
    speechToText = new shaka.text.SpeechToText(player);
    speechToText.setTextDisplayer(displayer);
    speechToText.configure(config);
    window.SpeechRecognition = /** @type {?} */ (MockSpeechRecognition);
  });

  afterEach(async () => {
    speechToText.release();
    await displayer.destroy();
    await player.destroy();
    container.remove();
    window.SpeechRecognition = originalSpeechRecognition;
    window.Translator = originalTranslator;
  });

  it('offers translation tracks when the Translator API is available', () => {
    window.Translator = /** @type {?} */ (MockTranslator);
    config.languagesToTranslate = ['en', 'es'];
    speechToText.configure(config);
    expect(speechToText.getTextTracks().map((t) => t.language))
        .toEqual(['', 'en', 'es']);
  });

  it('offers only the transcription without the Translator API', () => {
    delete window.Translator;
    config.languagesToTranslate = ['en', 'es'];
    speechToText.configure(config);
    expect(speechToText.getTextTracks().map((t) => t.language)).toEqual(['']);
  });

  /** @return {!MockSpeechRecognition} */
  function mockRecognition() {
    spyOn(player, 'getAudioTracks').and.returnValue([]);
    spyOn(Object.getPrototypeOf(speechToText), 'getAudioTrackFromMediaElement_')
        .and.returnValue(/** @type {?} */ ({}));
    const recognition = new MockSpeechRecognition();
    spyOn(window, 'SpeechRecognition').and.returnValue(recognition);
    return recognition;
  }

  it('keeps live cues on their own native track across displayer changes',
      async () => {
        spyOn(shaka.text.SpeechToText.isMediaStreamTrackSupported, 'value')
            .and.returnValue(true);
        player.configure({
          accessibility: {speechToText: {enabled: true}},
          textDisplayFactory: (p) => new shaka.text.NativeTextDisplayer(p),
        });
        await player.load('/base/test/test/assets/hls-raw-mp3/' +
            'media_w905519204_0.mp3', 0, 'audio/mpeg');
        // load() resolves with metadata, but Safari only adds the audio track
        // with the first data. Its 'audiotrackschanged' would then restart
        // recognition and, since the element never plays, stop it.
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await new Promise((resolve) => {
            const eventManager = new shaka.util.EventManager();
            eventManager.listenOnce(video, 'loadeddata', () => {
              eventManager.release();
              resolve();
            });
          });
          // Let the delayed 'audiotrackschanged' be dispatched first.
          await shaka.test.Util.shortDelay();
        }
        const ordinary = video.addTextTrack('subtitles', 'English', 'en');
        ordinary.mode = 'showing';
        const original = new VTTCue(0, 10, 'Original');
        ordinary.addCue(original);
        const tracks = player.getTextTracks();
        const speech = tracks.find(
            (t) => t.originalLanguage == 'speech-to-text');
        const authored = tracks.find((t) => t.label == 'English');
        const recognition = mockRecognition();

        player.selectTextTrack(authored);
        player.selectTextTrack(speech);
        video.dispatchEvent(new Event('play'));
        await shaka.test.Util.shortDelay();
        recognition.simulateResult('Good');
        await shaka.test.Util.shortDelay();
        const selected = () => Array.from(video.textTracks).find(
            (t) => t.mode == 'showing');
        const cueText = () => Array.from(selected()?.cues || [], (c) => c.text);
        expect(cueText()).withContext('first result').toEqual(['Good']);
        recognition.simulateResult('Good morning');
        await shaka.test.Util.shortDelay();
        expect(cueText()).withContext('interim result')
            .toEqual(['Good morning']);

        const custom = new shaka.test.FakeTextDisplayer();
        player.configure('textDisplayFactory', () => custom);
        expect(custom.appendSpy).toHaveBeenCalledWith([
          jasmine.objectContaining({payload: 'Good morning'}),
        ]);
        recognition.simulateResult('Good morning everyone');
        await shaka.test.Util.shortDelay();
        expect(custom.removeSpy).toHaveBeenCalled();
        expect(custom.appendSpy.calls.mostRecent().args[0][0].payload)
            .toBe('Good morning everyone');

        player.configure('textDisplayFactory',
            (p) => new shaka.text.UITextDisplayer(p));
        expect(container.textContent).toBe('Good morning everyone');
        player.configure('textDisplayFactory',
            (p) => new shaka.text.NativeTextDisplayer(p));
        expect(cueText()).withContext('restored cue')
            .toEqual(['Good morning everyone']);
        expect(player.getTextTracks().length).toBe(2);

        // Simulate switching back through the browser's subtitle menu.
        // The displayer reacts to the async 'change' event and then debounces
        // with a zero-delay timer, so a fixed delay is too short on slow
        // devices. Wait for the event, then let the debounce timer run first.
        // 'trackschanged' is not usable here: the configure() above already
        // queued one, which would resolve before the browser fires 'change'.
        const changed = new Promise((resolve) => {
          const eventManager = new shaka.util.EventManager();
          eventManager.listenOnce(video.textTracks, 'change', () => {
            eventManager.release();
            resolve();
          });
        });
        selected().mode = 'disabled';
        ordinary.mode = 'showing';
        await changed;
        await shaka.test.Util.shortDelay();
        expect(player.getTextTracks().filter((t) => t.active).map((t) => t.id))
            .toEqual([authored.id]);
        expect(Array.from(ordinary.cues || [])).toEqual([original]);
        await player.unload();
        expect(Array.from(video.textTracks).some(
            (t) => t.label == 'Auto-generated')).toBe(false);
      });

  it('stops pending recognition when the track is released', async () => {
    const recognition = mockRecognition();
    const start = spyOn(recognition, 'start');
    speechToText.enable(speechToText.getTextTracks()[0]);
    video.dispatchEvent(new Event('play'));
    speechToText.release();
    await shaka.test.Util.shortDelay();
    expect(start).not.toHaveBeenCalled();
  });

  it('replaces interim cues and clears the last one on disable', async () => {
    const recognition = mockRecognition();
    const append = spyOn(displayer, 'append').and.callThrough();
    const track = speechToText.getTextTracks()[0];
    speechToText.enable(track);
    video.dispatchEvent(new Event('play'));
    await shaka.test.Util.shortDelay();

    recognition.simulateResult('Good');
    await shaka.test.Util.shortDelay();
    const firstCue = append.calls.mostRecent().args[0][0];
    expect(firstCue).toEqual(jasmine.any(shaka.text.Cue));
    expect(firstCue.region).toEqual(jasmine.objectContaining({
      id: 'shaka-speech-to-text',
      width: 90,
      height: 3,
      heightUnits: shaka.text.CueRegion.units.LINES,
      viewportAnchorX: 5,
      viewportAnchorY: 95,
      regionAnchorY: 100,
    }));
    expect(container.textContent).toBe('Good');

    recognition.simulateResult('Good morning');
    await shaka.test.Util.shortDelay();
    expect(append.calls.mostRecent().args[0][0].region).toBe(firstCue.region);
    expect(container.textContent).toBe('Good morning');
    video.dispatchEvent(new Event('pause'));
    expect(container.textContent).toBe('Good morning');

    speechToText.disable();
    expect(container.textContent).toBe('');
    expect(speechToText.getTextTracks()[0].active).toBe(false);
  });
});

/**
 * @implements {EventTarget}
 */
class MockSpeechRecognition {
  constructor() {
    /** @type {string} */
    this.lang = 'en-US';
    /** @type {boolean} */
    this.continuous = false;
    /** @type {boolean} */
    this.interimResults = false;
    /** @type {boolean} */
    this.processLocally = false;

    /** @type {?function()} */
    this.onstart = null;
    /** @type {?function(!SpeechRecognitionEvent)} */
    this.onresult = null;
    /** @type {?function(!SpeechRecognitionError)} */
    this.onerror = null;
    /** @type {?function():void} */
    this.onend = null;

    /** @private {!EventTarget} */
    this.eventTarget_ = document.createDocumentFragment(); // Safe EventTarget
  }

  /**
   * @param {!MediaStreamTrack=} mediaStreamTrack
   */
  start(mediaStreamTrack) {
    if (mediaStreamTrack !== undefined &&
        typeof mediaStreamTrack !== 'object') {
      throw new TypeError();
    }
    if (this.onstart) {
      this.onstart();
    }
    this.eventTarget_.dispatchEvent(new Event('start'));
  }

  stop() {
    if (this.onend) {
      this.onend();
    }
    this.eventTarget_.dispatchEvent(new Event('end'));
  }

  /**
   * @param {string} transcript
   */
  simulateResult(transcript) {
    const event = new Event('result');
    Object.assign(event, {
      resultIndex: 0,
      results: [[{transcript, confidence: 0.95}]],
    });
    this.dispatchEvent(event);
  }

  /**
   * @override
   */
  addEventListener(type, listener) {
    this.eventTarget_.addEventListener(type, listener);
  }

  /**
   * @override
   */
  removeEventListener(type, listener) {
    this.eventTarget_.removeEventListener(type, listener);
  }

  /**
   * @override
   */
  dispatchEvent(event) {
    return this.eventTarget_.dispatchEvent(event);
  }
}

class MockTranslator {
  /**
   * @param {{
   *   sourceLanguage: string,
   *   targetLanguage: string,
   *   signal: (!AbortSignal|undefined)
   * }} options
   */
  constructor(options) {
    this.sourceLanguage = options.sourceLanguage;
    this.targetLanguage = options.targetLanguage;
    this.signal = options.signal || new AbortController().signal;
    this.inputQuota = 100000;
    this.destroyed = false;
  }

  /**
   * @param {string} text
   * @return {!Promise<string>}
   */
  translate(text) {
    if (this.destroyed || this.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return Promise.resolve(`[${this.targetLanguage}] ${text}`);
  }

  /**
   * @param {string} text
   * @return {!ReadableStream<string>}
   */
  translateStreaming(text) {
    const chunks = [`[${this.targetLanguage}]`, ...text.split(' ')];
    let index = 0;
    return new ReadableStream({
      // eslint-disable-next-line no-restricted-syntax
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index++] + ' ');
        } else {
          controller.close();
        }
      },
    });
  }

  /**
   * @param {string} text
   * @return {!Promise<number>}
   */
  measureInputUsage(text) {
    return Promise.resolve(text.length);
  }

  /**
   * @return {void}
   */
  destroy() {
    this.destroyed = true;
  }

  /**
   * @param {Object|null=} options
   * @return {!Promise<string>}
   */
  static availability(options) {
    return Promise.resolve('available');
  }

  /**
   * @param {{
   *   sourceLanguage: string,
   *   targetLanguage: string,
   *   signal: (!AbortSignal|undefined)
   * }} options
   * @return {!Promise<!MockTranslator>}
   */
  static create(options) {
    if (options.signal && options.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return Promise.resolve(new MockTranslator(options));
  }
}

