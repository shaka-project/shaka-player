/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.SpeechToText');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
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

    /** @private {!shaka.util.EventManager} */
    this.recognitionEventManager_ = new shaka.util.EventManager();

    /** @private {shaka.util.Timer} */
    this.recognitionTimer_ = new shaka.util.Timer(() => {
      this.recognitionEventManager_.removeAll();
      if (this.recognition_) {
        this.recognition_.stop();
        this.recognition_ = null;
      }
      if (this.textContainer_) {
        shaka.util.Dom.removeAllChildren(this.textContainer_);
      }
      this.onAudioTrackChange_();
    });

    /** @private {number} */
    this.nextTextTrackId_ = 1e15;

    /** @private {!Array<shaka.extern.TextTrack>} */
    this.textTracks_ = [
      {
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
      },
    ];

    /** @private {?number} */
    this.currentTrackId_ = null;
  }

  /**
   * @param {shaka.extern.SpeechToTextConfiguration} config
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * @override
   */
  release() {
    this.currentTrackId_ = null;
    this.eventManager_.removeAll();
    this.recognitionEventManager_.removeAll();
    this.recognitionTimer_.stop();
    if (this.recognition_) {
      this.recognition_.stop();
      this.recognition_ = null;
    }
    if (this.textContainer_) {
      shaka.util.Dom.removeAllChildren(this.textContainer_);
    }
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
      if (track.id == this.currentTrackId_) {
        return;
      }
      this.disable();
    }

    this.enabled_ = true;
    this.currentTrackId_ = track.id;

    this.eventManager_.listen(this.player_, 'audiotrackschanged', () => {
      this.onAudioTrackChange_();
    });

    const mediaElement = this.player_.getMediaElement();

    this.eventManager_.listen(mediaElement, 'seeking', () => {
      this.recognitionEventManager_.removeAll();
      this.recognitionTimer_.stop();
      if (this.recognition_) {
        this.recognition_.stop();
        this.recognition_ = null;
      }
      if (this.textContainer_) {
        shaka.util.Dom.removeAllChildren(this.textContainer_);
      }
      this.onAudioTrackChange_();
    });

    this.eventManager_.listen(mediaElement, 'pause', () => {
      this.recognitionEventManager_.removeAll();
      this.recognitionTimer_.stop();
      if (this.recognition_) {
        this.recognition_.stop();
        this.recognition_ = null;
      }
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
    this.currentTrackId_ = null;
    this.eventManager_.removeAll();
    this.recognitionEventManager_.removeAll();
    this.recognitionTimer_.stop();
    if (this.recognition_) {
      this.recognition_.stop();
      this.recognition_ = null;
    }
    if (this.textContainer_) {
      shaka.util.Dom.removeAllChildren(this.textContainer_);
    }
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
      textTrack.active = textTrack.id == this.currentTrackId_;
    }
    return this.textTracks_;
  }

  /**
   * @private
   */
  onAudioTrackChange_() {
    goog.asserts.assert(this.config_, 'Config must not be null!');
    if (this.textContainer_) {
      shaka.util.Dom.removeAllChildren(this.textContainer_);
    }
    const audioTracks = this.player_.getAudioTracks();
    if (audioTracks.length) {
      const mediaStreamTrack = this.getAudioTrackFromMediaElement_();
      if (!mediaStreamTrack) {
        return;
      }
      const currentTrack = audioTracks.find((t) => t.active);
      let language = 'en';
      if (currentTrack && currentTrack.language) {
        language = currentTrack.language;
      }
      if (this.recognition_) {
        if (this.recognition_.lang == language) {
          return;
        }
        this.recognitionEventManager_.removeAll();
        this.recognitionTimer_.stop();
        this.recognition_.stop();
      }
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition_ = /** @type {ChromeSpeechRecognition} */(
        new SpeechRecognition());

      this.recognition_.lang = language;
      this.recognition_.continuous = true;
      this.recognition_.interimResults = true;
      this.recognition_.processLocally = this.config_.processLocally;

      this.recognitionEventManager_.listen(this.recognition_, 'start', () => {
        shaka.log.debug('Speech to text: start', language);
        this.recognitionTimer_.tickAfter(5);
      });
      this.recognitionEventManager_.listen(this.recognition_, 'result',
          (e) => {
            goog.asserts.assert(this.config_, 'Config must not be null!');
            const event = /** @type {SpeechRecognitionEvent} */(e);
            let text = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              // The Web Speech API adds appropriate leading/trailing
              // whitespace.
              text += event.results[i][0].transcript;
            }
            if (this.textContainer_) {
              shaka.util.Dom.removeAllChildren(this.textContainer_);
            }
            const elem = shaka.util.Dom.createHTMLElement('span');
            elem.setAttribute('translate', 'no');
            elem.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            elem.style.padding = '0px 5px';
            elem.style.margin = '2.5% 5%';
            elem.textContent =
                this.truncateLastWords_(text, this.config_.maxTextLength);
            if (this.textContainer_) {
              this.textContainer_.appendChild(elem);
            }
            this.recognitionTimer_.tickAfter(1.5);
          });
      this.recognitionEventManager_.listen(this.recognition_, 'error', (e) => {
        if (this.textContainer_) {
          shaka.util.Dom.removeAllChildren(this.textContainer_);
        }
        shaka.log.debug('Speech to text: error', e);
      });
      this.recognitionEventManager_.listen(this.recognition_, 'end', () => {
        shaka.log.debug('Speech to text: end', language);
        this.onAudioTrackChange_();
      });
      this.recognition_.start(mediaStreamTrack);
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
