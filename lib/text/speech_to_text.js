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
    this.textContainer_ = this.getTextContainer_();

    /** @private {boolean} */
    this.enabled_ = false;

    /** @private {?ChromeSpeechRecognition} */
    this.recognition_ = null;

    /** @private {?AbortController} */
    this.translatorAbortController_ = null;

    /** @private {!shaka.util.EventManager} */
    this.recognitionEventManager_ = new shaka.util.EventManager();

    /** @private {shaka.util.Timer} */
    this.recognitionTimer_ = new shaka.util.Timer(() => {
      this.stopRecognition_();
      this.onAudioTrackChange_();
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
  }

  /**
   * @param {shaka.extern.SpeechToTextConfiguration} config
   */
  configure(config) {
    this.config_ = config;
    this.checkTexTrackChanges_();
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
    if (this.enabled_) {
      if (track.id == this.activeTrackId_) {
        return;
      }
      this.disable();
    }

    this.enabled_ = true;
    this.activeTrackId_ = track.id;

    this.eventManager_.listen(this.player_, 'audiotrackschanged', () => {
      this.onAudioTrackChange_();
    });

    const mediaElement = this.player_.getMediaElement();

    this.eventManager_.listen(mediaElement, 'seeking', () => {
      this.stopRecognition_();
      this.onAudioTrackChange_();
    });

    this.eventManager_.listen(mediaElement, 'pause', () => {
      this.stopRecognition_(/* removeRendered= */ false);
    });

    this.eventManager_.listen(mediaElement, 'play', () => {
      this.onAudioTrackChange_();
    });

    if (!mediaElement.paused) {
      this.onAudioTrackChange_();
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
  onAudioTrackChange_() {
    this.removeRenderedText_();
    const audioTracks = this.player_.getAudioTracks();
    if (audioTracks.length) {
      const mediaStreamTrack = this.getAudioTrackFromMediaElement_();
      if (!mediaStreamTrack) {
        return;
      }
      const activeAudioTrack = audioTracks.find((t) => t.active);
      let sourceLanguage = 'en';
      if (activeAudioTrack && activeAudioTrack.language) {
        sourceLanguage = activeAudioTrack.language;
      }
      const activeTextTrack =
          this.textTracks_.find((t) => t.id == this.activeTrackId_);
      let targetLanguage = '';
      if (activeTextTrack && activeTextTrack.language) {
        targetLanguage = activeTextTrack.language;
      }
      this.initRecognition_(mediaStreamTrack, sourceLanguage, targetLanguage);
    }
  }

  /**
   * @param {!MediaStreamTrack} mediaStreamTrack
   * @param {string} sourceLanguage
   * @param {string} targetLanguage
   * @private
   */
  async initRecognition_(mediaStreamTrack, sourceLanguage, targetLanguage) {
    goog.asserts.assert(this.config_, 'Config must not be null!');

    this.stopRecognition_();

    /** @type {?Translator} */
    let translator;
    if (targetLanguage && sourceLanguage != targetLanguage &&
        'Translator' in window) {
      this.translatorAbortController_ = new AbortController();
      const signal = this.translatorAbortController_.signal;
      try {
        translator = await window.Translator.create({
          sourceLanguage: sourceLanguage,
          targetLanguage: targetLanguage,
          signal: signal,
        });
      } catch (err) {
        if (!err.name || err.name !== 'AbortError') {
          shaka.log.error('Error creating Translator', err);
        }
        return;
      }
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    this.recognition_ = /** @type {ChromeSpeechRecognition} */(
      new SpeechRecognition());

    this.recognition_.lang = sourceLanguage;
    this.recognition_.continuous = true;
    this.recognition_.interimResults = true;
    this.recognition_.processLocally = this.config_.processLocally;

    this.recognitionEventManager_.listen(this.recognition_, 'start', () => {
      shaka.log.debug('Speech to text: start', sourceLanguage);
      this.recognitionTimer_.tickAfter(5);
    });
    this.recognitionEventManager_.listen(this.recognition_, 'result',
        async (e) => {
          goog.asserts.assert(this.config_, 'Config must not be null!');
          const event = /** @type {SpeechRecognitionEvent} */(e);
          let text = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            // The Web Speech API adds appropriate leading/trailing
            // whitespace.
            text += event.results[i][0].transcript;
          }
          if (translator) {
            try {
              text = await translator.translate(text);
            } catch (e) {
              return;
            }
          }
          if (this.textContainer_) {
            this.removeRenderedText_();
            const elem = shaka.util.Dom.createHTMLElement('span');
            elem.setAttribute('translate', 'no');
            elem.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            elem.style.padding = '0px 5px';
            elem.style.margin = '2.5% 5%';
            elem.textContent =
                this.truncateLastWords_(text, this.config_.maxTextLength);
            this.textContainer_.appendChild(elem);
          }
          this.recognitionTimer_.tickAfter(1.5);
        });
    this.recognitionEventManager_.listen(this.recognition_, 'error', (e) => {
      this.removeRenderedText_();
      shaka.log.debug('Speech to text: error', e);
    });
    this.recognitionEventManager_.listen(this.recognition_, 'end', () => {
      shaka.log.debug('Speech to text: end', sourceLanguage);
      this.initRecognition_(mediaStreamTrack, sourceLanguage, targetLanguage);
    });
    this.recognition_.start(mediaStreamTrack);
  }

  /**
   * @param {boolean=} removeRendered
   * @private
   */
  stopRecognition_(removeRendered = true) {
    this.recognitionEventManager_.removeAll();
    this.recognitionTimer_.stop();
    if (this.translatorAbortController_) {
      this.translatorAbortController_.abort();
      this.translatorAbortController_ = null;
    }
    if (this.recognition_) {
      this.recognition_.stop();
      this.recognition_ = null;
    }
    if (removeRendered) {
      this.removeRenderedText_();
    }
  }

  /**
   * @private
   */
  removeRenderedText_() {
    if (this.textContainer_) {
      shaka.util.Dom.removeAllChildren(this.textContainer_);
    }
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
    if (!shaka.text.SpeechToText.audioObjectMap_.has(mediaElement)) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      const sourceNode = audioContext.createMediaElementSource(mediaElement);
      const destinationNode = audioContext.createMediaStreamDestination();
      sourceNode.connect(destinationNode);
      sourceNode.connect(audioContext.destination);
      const audioTrack = destinationNode.stream.getAudioTracks()[0];
      shaka.text.SpeechToText.audioObjectMap_.set(mediaElement, {
        audioContext,
        sourceNode,
        destinationNode,
        audioTrack,
      });
    }
    const audioObject =
        shaka.text.SpeechToText.audioObjectMap_.get(mediaElement);
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
  checkTexTrackChanges_() {
    goog.asserts.assert(this.config_, 'Config must not be null!');

    const languagesToTranslate =
        this.textTracks_.map((t) => t.language).filter((t) => t);
    const languageChanges = !shaka.util.ArrayUtils.hasSameElements(
        this.config_.languagesToTranslate, languagesToTranslate);

    if (languageChanges && 'Translator' in window) {
      const activeTextTrack =
          this.textTracks_.find((t) => t.id == this.activeTrackId_);
      if (activeTextTrack && activeTextTrack.id != this.basicTextTrack_.id) {
        this.disable();
      }
      this.textTracks_ =
          this.textTracks_.filter((t) => t == this.basicTextTrack_);
      for (const language of this.config_.languagesToTranslate) {
        const track = this.createTextTrack_();
        track.language = language;
        this.textTracks_.push(track);
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
