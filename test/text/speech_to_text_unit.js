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
  /** @type {shaka.text.SpeechToText} */
  let speechToText;

  const originalSpeechRecognition = window.SpeechRecognition;
  const originalTranslator = window.Translator;

  // eslint-disable-next-line no-restricted-syntax
  const originalAppendChild = Node.prototype.appendChild;

  beforeAll(() => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
  });

  beforeEach(async () => {
    shaka.text.SpeechToText.isMediaStreamTrackSupported.reset();

    player = new shaka.Player();
    await player.attach(video);

    const defaultConfig = shaka.util.PlayerConfiguration.createDefault();

    config = defaultConfig.streaming.speechToText;
  });

  afterEach(async () => {
    window.SpeechRecognition = originalSpeechRecognition;
    window.Translator = originalTranslator;
    // eslint-disable-next-line no-restricted-syntax
    Node.prototype.appendChild = originalAppendChild;
    if (speechToText) {
      speechToText.release();
    }
    await player.unload();
    await player.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  describe('when no SpeechRecognition support', () => {
    beforeEach(() => {
      delete window.SpeechRecognition;
    });

    it('isSupported returns false', () => {
      speechToText = new shaka.text.SpeechToText(player);
      expect(speechToText.isSupported()).toBe(false);
    });

    it('isEnabled returns false', () => {
      speechToText = new shaka.text.SpeechToText(player);
      expect(speechToText.isEnabled()).toBe(false);
    });

    it('getTextTracks returns empty', () => {
      speechToText = new shaka.text.SpeechToText(player);
      expect(speechToText.getTextTracks()).toEqual([]);
    });

    it('disable do nothing', () => {
      speechToText = new shaka.text.SpeechToText(player);
      speechToText.disable();
    });

    it('configure works', () => {
      speechToText = new shaka.text.SpeechToText(player);
      speechToText.configure(config);
    });
  });

  describe('when SpeechRecognition support', () => {
    /** @type {!HTMLElement} */
    let container;

    beforeEach(() => {
      container = /** @type {!HTMLElement} */(document.createElement('div'));
      player.setVideoContainer(container);

      /** @type {(typeof SpeechRecognition)} */
      const mock = /** @type {?} */ (MockSpeechRecognition);

      window.SpeechRecognition = mock;

      // eslint-disable-next-line no-restricted-syntax
      Node.prototype.appendChild = function(child) {
        // eslint-disable-next-line no-restricted-syntax
        const result = originalAppendChild.call(this, child);
        if (child instanceof HTMLIFrameElement) {
          const iframe = /** @type {!HTMLIFrameElement} */ (child);
          const contentWindow = iframe.contentWindow;
          if (contentWindow) {
            contentWindow.SpeechRecognition = mock;
          }
        }
        return result;
      };
    });

    it('isSupported returns true', () => {
      speechToText = new shaka.text.SpeechToText(player);
      expect(speechToText.isSupported()).toBe(true);
    });

    it('isSupported returns false if not videoContainer', () => {
      player.setVideoContainer(null);
      speechToText = new shaka.text.SpeechToText(player);
      expect(speechToText.isSupported()).toBe(false);
    });

    it('getTextTracks returns the correct result', () => {
      speechToText = new shaka.text.SpeechToText(player);
      const tracks = speechToText.getTextTracks();
      expect(tracks.length).toBe(1);
    });

    it('getTextTracks returns the correct result with Translator API', () => {
      /** @type {(typeof Translator)} */
      window.Translator = /** @type {?} */ (MockTranslator);

      speechToText = new shaka.text.SpeechToText(player);
      config.languagesToTranslate = ['en', 'es'];
      speechToText.configure(config);
      const tracks = speechToText.getTextTracks();
      expect(tracks.length).toBe(3);
    });

    // eslint-disable-next-line @stylistic/max-len
    it('getTextTracks returns the correct result without Translator API', () => {
      delete window.Translator;

      speechToText = new shaka.text.SpeechToText(player);
      config.languagesToTranslate = ['en', 'es'];
      speechToText.configure(config);
      const tracks = speechToText.getTextTracks();
      expect(tracks.length).toBe(1);
    });

    it('create shaka-speech-to-text-container', () => {
      speechToText = new shaka.text.SpeechToText(player);
      const elements =
          container.getElementsByClassName('shaka-speech-to-text-container');
      expect(elements.length).toBe(1);
    });

    it('release remove shaka-speech-to-text-container', () => {
      speechToText = new shaka.text.SpeechToText(player);
      let elements =
          container.getElementsByClassName('shaka-speech-to-text-container');
      expect(elements.length).toBe(1);
      speechToText.release();
      elements =
          container.getElementsByClassName('shaka-speech-to-text-container');
      expect(elements.length).toBe(0);
    });

    it('enable and disable work', () => {
      speechToText = new shaka.text.SpeechToText(player);
      let tracks = speechToText.getTextTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].active).toBe(false);
      speechToText.enable(tracks[0]);
      expect(speechToText.isEnabled()).toBe(true);
      tracks = speechToText.getTextTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].active).toBe(true);
      speechToText.disable();
      expect(speechToText.isEnabled()).toBe(false);
    });
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
    if (mediaStreamTrack !== null && typeof mediaStreamTrack !== 'object') {
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
   * @param {boolean=} isFinal
   */
  simulateResult(transcript, isFinal = true) {
    const event = /** @type {!SpeechRecognitionEvent} */ ({
      resultIndex: 0,
      results: [
        {transcript, confidence: 0.95},
      ],
      isFinal,
    });

    if (this.onresult) {
      this.onresult(event);
    }
    this.eventTarget_.dispatchEvent(new CustomEvent('result', {detail: event}));
  }

  /**
   * @param {string} errorType
   */
  simulateError(errorType) {
    const event = /** @type {!SpeechRecognitionError} */ ({
      error: errorType,
    });

    if (this.onerror) {
      this.onerror(event);
    }
    this.eventTarget_.dispatchEvent(new CustomEvent('error', {detail: event}));
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

