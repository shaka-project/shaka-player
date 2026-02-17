/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.SpeechToText');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Lazy');
goog.require('shaka.util.Timer');
goog.requireType('shaka.Player');


/**
 * @implements {shaka.util.IReleasable}
 */
shaka.text.SpeechToText = class {
  /**
   * @param {shaka.Player} player
   */
  constructor(player) {
    /** @private {?shaka.Player} */
    this.player_ = player;

    /** @private {?shaka.extern.SpeechToTextConfiguration} */
    this.config_ = null;

    /** @private {!shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {boolean} */
    this.supported_ =
        shaka.text.SpeechToText.isMediaStreamTrackSupported.value();

    /** @type {HTMLElement} */
    this.textContainer_ = null;

    /** @private {boolean} */
    this.enabled_ = false;

    /** @private {!shaka.text.SpeechTranslatorController} */
    this.translatorController_ =
        new shaka.text.SpeechTranslatorController();

    /** @private {shaka.util.Timer} */
    this.recognitionTimer_ = new shaka.util.Timer(() => {
      this.initRecognition_();
    });

    /** @private {number} */
    this.nextTextTrackId_ = 1e15;

    /** @private {shaka.extern.TextTrack} */
    this.basicTextTrack_ = this.createTextTrack_();

    /** @private {!Array<shaka.extern.TextTrack>} */
    this.textTracks_ = [
      this.basicTextTrack_,
    ];

    /** @private {?number} */
    this.activeTrackId_ = null;

    /** @private {?shaka.text.SpeechRenderer} */
    this.renderer_ = null;

    /** @private {?string} */
    this.lastSourceLanguage_ = null;

    /** @private {?string} */
    this.lastTargetLanguage_ = null;

    /** @private {!shaka.text.SpeechRecognitionController} */
    this.recognitionController_ =
        new shaka.text.SpeechRecognitionController(
            this.translatorController_,
            this.recognitionTimer_,
            (text) => {
              if (!this.enabled_ || !this.textContainer_) {
                return;
              }
              const finalText =
                  this.truncateLastWords_(text, this.config_.maxTextLength);
              this.renderer_?.render(finalText);
            },
            () => {
              this.renderer_?.clear();
            });
  }

  /**
   * @param {shaka.extern.SpeechToTextConfiguration} config
   */
  configure(config) {
    this.config_ = config;
    this.checkTextTrackChanges_();
  }

  /**
   * @override
   */
  release() {
    this.activeTrackId_ = null;
    this.eventManager_.removeAll();
    this.stopRecognition_();
    this.player_ = null;
    this.eventManager_.release();
    this.renderer_?.release();

    // Remove the text container element from the UI.
    if (this.textContainer_ && this.textContainer_.parentElement) {
      this.textContainer_.remove();
      this.textContainer_ = null;
    }
  }

  /**
   * Enable speech to text.
   *
   * @param {!shaka.extern.TextTrack} track
   */
  enable(track) {
    if (!this.supported_) {
      return;
    }
    if (!this.textContainer_) {
      this.textContainer_ = this.getTextContainer_();
    }
    if (!this.textContainer_) {
      return;
    }
    if (!this.renderer_) {
      this.renderer_ = new shaka.text.SpeechRenderer(this.textContainer_);
    }
    if (this.enabled_ && track.id == this.activeTrackId_) {
      return;
    }

    this.enabled_ = true;
    this.activeTrackId_ = track.id;

    this.eventManager_.listen(this.player_, 'audiotrackschanged', () => {
      this.initRecognition_();
    });

    const mediaElement = this.player_.getMediaElement();

    this.eventManager_.listen(mediaElement, 'seeking', () => {
      this.initRecognition_();
    });

    this.eventManager_.listen(mediaElement, 'pause', () => {
      this.stopRecognition_(/* clearRendered= */ false);
    });

    this.eventManager_.listen(mediaElement, 'play', () => {
      this.initRecognition_();
    });

    if (!mediaElement.paused) {
      this.initRecognition_();
    }
  }


  /**
   * Disable speech to text.
   */
  disable() {
    if (!this.enabled_) {
      return;
    }
    this.enabled_ = false;
    this.activeTrackId_ = null;
    this.eventManager_.removeAll();
    this.stopRecognition_();
    this.renderer_?.release();
    this.renderer_ = null;
    this.translatorController_.release();
    this.recognitionController_.release();
  }

  /**
   * @return {boolean}
   */
  isEnabled() {
    return this.enabled_;
  }

  /**
   * @return {boolean}
   */
  isSupported() {
    if (!this.supported_) {
      return false;
    }
    if (!this.textContainer_) {
      this.textContainer_ = this.getTextContainer_();
    }
    if (!this.textContainer_) {
      return false;
    }
    return true;
  }

  /**
   * @return {!Array<shaka.extern.TextTrack>}
   */
  getTextTracks() {
    if (!this.isSupported()) {
      return [];
    }
    for (const textTrack of this.textTracks_) {
      textTrack.active = textTrack.id == this.activeTrackId_;
    }
    return this.textTracks_;
  }

  /**
   * @private
   */
  async initRecognition_() {
    goog.asserts.assert(this.config_, 'Config must not be null!');

    this.renderer_?.clear();

    const audioTracks = this.player_.getAudioTracks();
    if (!audioTracks.length) {
      return;
    }

    const mediaStreamTrack = this.getAudioTrackFromMediaElement_();
    if (!mediaStreamTrack) {
      return;
    }

    const activeAudioTrack = audioTracks.find((t) => t.active);
    let sourceLanguage = 'en';
    if (activeAudioTrack && activeAudioTrack.language &&
        activeAudioTrack.language != 'und') {
      sourceLanguage = activeAudioTrack.language;
    }

    const activeTextTrack =
        this.textTracks_.find((t) => t.id == this.activeTrackId_);
    let targetLanguage = '';
    if (activeTextTrack && activeTextTrack.language &&
        activeTextTrack.language != 'und') {
      targetLanguage = activeTextTrack.language;
    }

    if (this.recognitionController_.isActive() &&
        this.lastSourceLanguage_ === sourceLanguage &&
        this.lastTargetLanguage_ !== targetLanguage) {
      this.lastTargetLanguage_ = targetLanguage;
      await this.translatorController_.setup(sourceLanguage, targetLanguage);
      return;
    }

    this.stopRecognition_();

    try {
      await this.translatorController_.setup(sourceLanguage, targetLanguage);
    } catch (err) {
      if (err.name == 'NotSupportedError') {
        return;
      }
    }

    await this.recognitionController_.start(
        mediaStreamTrack,
        sourceLanguage,
        this.config_.processLocally);

    this.lastSourceLanguage_ = sourceLanguage;
    this.lastTargetLanguage_ = targetLanguage;
  }

  /**
   * @param {boolean=} clearRendered
   * @private
   */
  stopRecognition_(clearRendered = true) {
    this.recognitionController_.stop(clearRendered);
  }

  /**
   * Truncates a string to the last `limit` characters, ensuring that only
   * complete words are included. If a word is cut at the limit, it is included
   * in full. Adds '...' at the start if truncation occurs.
   *
   * @param {string} text - The input string to truncate.
   * @param {number} limit - The maximum number of characters to consider from
   *                         the end of the string.
   * @return {string} The truncated string, starting at the first complete word
   *                  within the limit, and prefixed with '...' if truncation
   *                  was applied.
   * @private
   */
  truncateLastWords_(text, limit) {
    if (text.length <= limit) {
      return text;
    }

    // Start from the position where the last `limit` characters begin
    let start = text.length - limit;

    // Move backwards to the start of the word if we are in the middle of one
    while (start > 0 && text[start - 1] !== ' ') {
      start--;
    }

    // Take the substring from the found position to the end
    const result = text.slice(start).trimStart();

    // Add '...' at the start to indicate truncation
    return '...' + result;
  }

  /**
   * @return {?MediaStreamTrack}
   * @private
   */
  getAudioTrackFromMediaElement_() {
    const mediaElement = this.player_.getMediaElement();
    if (!mediaElement) {
      return null;
    }
    const audioObject =
        shaka.text.SpeechToText.audioObjectMap_.getOrInsertComputed(
            mediaElement,
            () => {
              const AudioContext =
                  window.AudioContext || window.webkitAudioContext;
              const audioContext = new AudioContext();
              goog.asserts.assert(mediaElement, 'MediaElement should be null');
              const sourceNode =
                  audioContext.createMediaElementSource(mediaElement);
              const destinationNode =
                  audioContext.createMediaStreamDestination();
              sourceNode.connect(destinationNode);
              sourceNode.connect(audioContext.destination);
              const audioTrack = destinationNode.stream.getAudioTracks()[0];
              return {
                audioContext,
                sourceNode,
                destinationNode,
                audioTrack,
              };
            });
    return audioObject.audioTrack;
  }

  /**
   * @return {?HTMLElement}
   * @private
   */
  getTextContainer_() {
    const videoContainer = this.player_.getVideoContainer();
    if (!videoContainer) {
      return null;
    }

    /** @type {HTMLElement} */
    const textContainer = shaka.util.Dom.createHTMLElement('div');
    textContainer.classList.add('shaka-speech-to-text-container');

    // Set the subtitles text-centered by default.
    textContainer.style.textAlign = 'center';

    // Set the captions in the middle horizontally by default.
    textContainer.style.display = 'flex';
    textContainer.style.flexDirection = 'column';
    textContainer.style.alignItems = 'center';

    // Set the captions at the bottom by default.
    textContainer.style.justifyContent = 'flex-end';

    videoContainer.appendChild(textContainer);

    return textContainer;
  }

  /** @private */
  checkTextTrackChanges_() {
    goog.asserts.assert(this.config_, 'Config must not be null!');

    const existingTrackLanguages =
        this.textTracks_.map((t) => t.language).filter((t) => t);
    const languageChanges = !shaka.util.ArrayUtils.hasSameElements(
        this.config_.languagesToTranslate, existingTrackLanguages);

    if (languageChanges && 'Translator' in window) {
      this.textTracks_ = this.textTracks_.filter((t) => {
        if (t.id == this.basicTextTrack_.id) {
          return true;
        }
        if (this.config_.languagesToTranslate.includes(t.language)) {
          return true;
        }
        if (t.id == this.activeTrackId_) {
          this.disable();
        }
        return false;
      });
      for (const language of this.config_.languagesToTranslate) {
        let track = this.textTracks_.find((t) => t.language == language);
        if (!track) {
          track = this.createTextTrack_();
          track.language = language;
          this.textTracks_.push(track);
        }
      }

      const event = new shaka.util.FakeEvent(
          shaka.util.FakeEvent.EventName.TextChanged);
      this.player_.dispatchEvent(event);
    }
  }

  /**
   * @return {shaka.extern.TextTrack}
   * @private
   */
  createTextTrack_() {
    return {
      id: this.nextTextTrackId_++,
      active: false,
      type: shaka.util.ManifestParserUtils.ContentType.TEXT,
      bandwidth: 0,
      language: '',
      label: null,
      kind: null,
      mimeType: null,
      codecs: null,
      primary: false,
      roles: [],
      accessibilityPurpose: null,
      forced: false,
      originalTextId: null,
      originalLanguage: 'speech-to-text',
    };
  }
};

/**
 * @typedef {{
 *   audioContext: AudioContext,
 *   sourceNode: MediaElementAudioSourceNode,
 *   destinationNode: MediaStreamAudioDestinationNode,
 *   audioTrack: MediaStreamTrack,
 * }}
 */
shaka.text.SpeechToText.AudioObject;

/**
 * For now, we never clean this up because if we close the context and
 * disconnect from the source, the audio from the video element never
 * works again.
 *
 * @const {!Map<!HTMLMediaElement, shaka.text.SpeechToText.AudioObject>}
 * @private
 */
shaka.text.SpeechToText.audioObjectMap_ = new Map();

/**
 * @const {!shaka.util.Lazy.<boolean>}
 */
shaka.text.SpeechToText.isMediaStreamTrackSupported =
    new shaka.util.Lazy(() => {
      // To avoid a permission prompt, we do this test in a temporary iframe.
      // Lazy() will make sure it only happens once, and only on demand.
      /** @type {HTMLIFrameElement} */
      const frame = shaka.util.Dom.asHTMLIFrameElement(
          document.body.appendChild(document.createElement('iframe')));
      const contentWindow = frame.contentWindow;
      const SpeechRecognition = contentWindow.SpeechRecognition ||
          contentWindow.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        frame.remove();
        return false;
      }

      // Run this with the iframe detached from the DOM.
      const recognition = /** @type {ChromeSpeechRecognition} */(
        new SpeechRecognition());
      frame.remove();

      try {
        // If the new parameter is not used, this start() call succeeds,
        // because the 0 gets ignored.  If this were running in the main
        // window, we would get a microphone permission prompt, but the iframe
        // keeps this silent by denying permission immediately.
        recognition.start(/** @type {MediaStreamTrack} */(/** @type {?} */(0)));
        recognition.stop();
        return false;
      } catch (error) {
        // If the new parameter is checked, we get a TypeError because 0 isn't
        // a MediaStreamTrack.
        return error.name == 'TypeError';
      }
    });


/**
 * @implements {shaka.util.IReleasable}
 */
shaka.text.SpeechRenderer = class {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    /** @type {HTMLElement} */
    this.container_ = container;

    /** @type {HTMLElement} */
    this.span_ = null;
  }

  /**
   * @param {string} text
   */
  render(text) {
    if (!this.container_) {
      return;
    }

    if (!this.span_) {
      this.span_ = shaka.util.Dom.createHTMLElement('span');
      this.span_.setAttribute('translate', 'no');
      this.span_.style.backgroundColor = 'rgba(0,0,0,0.8)';
      this.span_.style.padding = '0px 5px';
      this.span_.style.margin = '2.5% 5%';
      this.container_.appendChild(this.span_);
    }

    this.span_.textContent = text;
  }

  /**
   * Remove current content
   */
  clear() {
    if (this.span_) {
      this.span_.textContent = '';
    }
  }

  /**
   * @override
   */
  release() {
    if (this.container_) {
      shaka.util.Dom.removeAllChildren(this.container_);
    }
    this.span_ = null;
  }
};


/**
 * @implements {shaka.util.IReleasable}
 */
shaka.text.SpeechRecognitionController = class {
  /**
   * @param {!shaka.text.SpeechTranslatorController} translatorController
   * @param {!shaka.util.Timer} timer
   * @param {function(string)} onText
   * @param {function()} onClear
   */
  constructor(translatorController, timer, onText, onClear) {
    /** @private {!shaka.text.SpeechTranslatorController} */
    this.translatorController_ = translatorController;

    /** @private {!shaka.util.Timer} */
    this.timer_ = timer;

    /** @private {function(string)} */
    this.onText_ = onText;

    /** @private {function()} */
    this.onClear_ = onClear;

    /** @private {!shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {?ChromeSpeechRecognition} */
    this.recognition_ = null;

    /** @private {number} */
    this.version_ = 0;

    /** @private {boolean} */
    this.active_ = false;
  }

  /**
   * @param {!MediaStreamTrack} mediaStreamTrack
   * @param {string} sourceLanguage
   * @param {boolean} processLocally
   * @return {!Promise}
   */
  async start(mediaStreamTrack, sourceLanguage, processLocally) {
    this.stop();

    this.version_++;
    const currentVersion = this.version_;
    this.active_ = true;

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    const recognition =
    /** @type {ChromeSpeechRecognition} */(new SpeechRecognition());
    this.recognition_ = recognition;

    recognition.lang = sourceLanguage;
    recognition.continuous = true;
    recognition.interimResults = true;

    if (processLocally &&
        'install' in SpeechRecognition && 'available' in SpeechRecognition) {
      try {
        const status = await SpeechRecognition.available({
          langs: [sourceLanguage],
          processLocally: true,
        });
        switch (status) {
          case 'available':
            recognition.processLocally = true;
            break;
          case 'downloading':
          case 'downloadable':
            await SpeechRecognition.install({
              langs: [sourceLanguage],
              processLocally: true,
            });
            recognition.processLocally = true;
            break;
          case 'unavailable':
          default:
            return;
        }
      } catch (e) {
        shaka.log.error('SpeechRecognition processLocally error', e);
      }
    }

    if (currentVersion !== this.version_) {
      return;
    }

    let recognitionError = false;

    this.eventManager_.listen(recognition, 'start', () => {
      if (currentVersion !== this.version_) {
        return;
      }
      this.timer_.tickAfter(5);
    });

    this.eventManager_.listen(recognition, 'result', async (e) => {
      if (currentVersion !== this.version_) {
        return;
      }

      const event = /** @type {SpeechRecognitionEvent} */(e);
      let text = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }

      const translated = await this.translatorController_.translate(text);

      if (translated === null || currentVersion !== this.version_) {
        return;
      }

      this.onText_(translated);
      this.timer_.tickAfter(0.75);
    });

    this.eventManager_.listen(recognition, 'error', (e) => {
      if (currentVersion !== this.version_) {
        return;
      }

      recognitionError = true;
      this.onClear_();

      const event = /** @type {SpeechRecognitionError} */(e);
      if (event.error == 'network') {
        this.timer_.tickAfter(30);
      }
    });

    this.eventManager_.listen(recognition, 'end', () => {
      if (!this.active_ || currentVersion !== this.version_) {
        return;
      }

      if (!recognitionError) {
        this.start(mediaStreamTrack, sourceLanguage, processLocally);
      }
    });

    recognition.start(mediaStreamTrack);
  }

  /**
   * @param {boolean=} clear
   */
  stop(clear = true) {
    this.version_++;
    this.active_ = false;

    this.eventManager_.removeAll();
    this.timer_.stop();

    if (this.recognition_) {
      this.recognition_.stop();
      this.recognition_ = null;
    }

    if (clear) {
      this.onClear_();
    }
  }

  /**
   * @override
   */
  release() {
    this.stop();
    this.translatorController_.release();
  }

  /**
   * @return {boolean}
   */
  isActive() {
    return this.active_;
  }
};


/**
 * @implements {shaka.util.IReleasable}
 */
shaka.text.SpeechTranslatorController = class {
  constructor() {
    /** @private {?Translator} */
    this.translator_ = null;

    /** @private {?AbortController} */
    this.abortController_ = null;

    /** @private {number} */
    this.setupVersion_ = 0;

    /** @private {number} */
    this.translationVersion_ = 0;

    /** @private {?string} */
    this.lastSource_ = null;

    /** @private {?string} */
    this.lastTarget_ = null;
  }

  /**
   * @param {string} sourceLanguage
   * @param {string} targetLanguage
   * @return {!Promise}
   */
  async setup(sourceLanguage, targetLanguage) {
    if (this.lastSource_ === sourceLanguage &&
        this.lastTarget_ === targetLanguage &&
        this.translator_) {
      return;
    }

    this.release();
    this.setupVersion_++;
    const currentSetup = this.setupVersion_;

    if (!targetLanguage || sourceLanguage == targetLanguage ||
        !('Translator' in window)) {
      return;
    }

    this.abortController_ = new AbortController();

    try {
      const translator = await Translator.create({
        sourceLanguage,
        targetLanguage,
        signal: this.abortController_.signal,
      });

      if (currentSetup !== this.setupVersion_) {
        translator.destroy();
        return;
      }

      this.translator_ = translator;
      this.lastSource_ = sourceLanguage;
      this.lastTarget_ = targetLanguage;
    } catch (err) {
      if (err.name == 'NotSupportedError') {
        throw err;
      }
    }
  }

  /**
   * @param {string} text
   * @return {!Promise<?string>}
   */
  async translate(text) {
    if (!this.translator_) {
      return text;
    }

    this.translationVersion_++;
    const currentVersion = this.translationVersion_;

    try {
      const result = await this.translator_.translate(text);
      if (currentVersion !== this.translationVersion_) {
        return null;
      }
      return result;
    } catch (e) {
      return null;
    }
  }

  /**
   * @override
   */
  release() {
    this.abortController_?.abort();
    this.abortController_ = null;
    this.translator_?.destroy();
    this.translator_ = null;
    this.lastSource_ = null;
    this.lastTarget_ = null;
  }
};
