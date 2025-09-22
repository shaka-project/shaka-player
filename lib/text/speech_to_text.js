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

    /** @private {?SpeechRecognition} */
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

    this.textTrack_ = {
      id: 1e15,
      active: false,
      type: shaka.util.ManifestParserUtils.ContentType.TEXT,
      bandwidth: 0,
      language: 'speech-to-text',
      label: 'Speech to text',
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
    this.disable();
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
   */
  enable() {
    if (!this.supported_ || this.enabled_) {
      return;
    }
    if (!this.textContainer_) {
      this.textContainer_ = this.getTextContainer_();
    }
    if (!this.textContainer_) {
      return;
    }

    this.enabled_ = true;

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

    if (!this.player_.getMediaElement().paused) {
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
   * @return {?shaka.extern.TextTrack}
   */
  getTextTrack() {
    if (!this.isSupported()) {
      return null;
    }
    this.textTrack_.active = this.isEnabled();
    return this.textTrack_;
  }

  /**
   * @suppress {checkTypes}
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
      this.recognition_ = new SpeechRecognition();

      this.recognition_.lang = language;
      this.recognition_.continuous = true;
      this.recognition_.interimResults = true;
      this.recognition_.processLocally = this.config_.processLocally;

      this.recognitionEventManager_.listen(this.recognition_, 'start', () => {
        shaka.log.debug('Speech to text: start', language);
        this.recognitionTimer_.tickAfter(5);
      });
      const maxNumberOfWordsAfterTruncate =
          this.config_.maxNumberOfWordsAfterTruncate;
      const maxNumberOfWordsBeforeTruncate =
          this.config_.maxNumberOfWordsBeforeTruncate;
      this.recognitionEventManager_.listen(this.recognition_, 'result',
          (e) => {
            const event = /** @type {SpeechRecognitionEvent} */(e);
            if (this.textContainer_) {
              shaka.util.Dom.removeAllChildren(this.textContainer_);
            }
            let text = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              text += event.results[i][0].transcript;
            }
            const parts = text.split(' ');
            if (parts.length > maxNumberOfWordsBeforeTruncate) {
              text = parts.slice(-maxNumberOfWordsAfterTruncate).join(' ');
            }
            const elem = shaka.util.Dom.createHTMLElement('span');
            elem.setAttribute('translate', 'no');
            elem.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            elem.style.padding = '0px 5px';
            elem.style.margin = '2.5% 5%';
            elem.textContent = text;
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
   * @return {?MediaStreamTrack}
   * @private
   */
  getAudioTrackFromMediaElement_() {
    const mediaElement = this.player_.getMediaElement();
    if (!mediaElement) {
      return null;
    }
    if (!shaka.text.SpeechToText.audioTrackMap_.has(mediaElement)) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      const sourceNode = audioContext.createMediaElementSource(mediaElement);
      const destinationNode = audioContext.createMediaStreamDestination();
      sourceNode.connect(destinationNode);
      sourceNode.connect(audioContext.destination);
      const audioTrack = destinationNode.stream.getAudioTracks()[0];
      shaka.text.SpeechToText.audioTrackMap_.set(mediaElement, audioTrack);
    }
    return shaka.text.SpeechToText.audioTrackMap_.get(mediaElement);
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
 * @const {!Map<!HTMLMediaElement, MediaStreamTrack>}
 * @private
 */
shaka.text.SpeechToText.audioTrackMap_ = new Map();

/**
 * @suppress {checkTypes}
 * @const {!shaka.util.Lazy.<boolean>}
 */
shaka.text.SpeechToText.isMediaStreamTrackSupported =
    new shaka.util.Lazy(() => {
      /** @type {HTMLIFrameElement} */
      const frame = shaka.util.Dom.asHTMLIFrameElement(
          document.body.appendChild(document.createElement('iframe')));
      const contentWindow = frame.contentWindow;
      const SpeechRecognition = contentWindow.SpeechRecognition ||
          contentWindow.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        return false;
      }
      const recognition = new SpeechRecognition();
      frame.remove();

      try {
        recognition.start(0);
        recognition.stop();
        return false;
      } catch (error) {
        return error.name == 'TypeError';
      }
    });
