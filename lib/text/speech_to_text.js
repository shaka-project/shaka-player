/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.SpeechToText');

goog.require('shaka.log');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Lazy');
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

    /** @private {!shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {boolean} */
    this.supported_ =
        shaka.text.SpeechToText.isMediaStreamTrackSupported.value();

    /** @type {HTMLElement} */
    this.textContainer_ = this.getTextContainer_();

    /** @private {boolean} */
    this.enabled_ = false;

    /** @private {!Map<!HTMLMediaElement, MediaStreamTrack>} */
    this.audioTrackMap_ = new Map();

    /** @private {?SpeechRecognition} */
    this.recognition_ = null;
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
      if (this.recognition_) {
        this.recognition_.stop();
        this.recognition_ = null;
      }
    });

    this.eventManager_.listen(mediaElement, 'play', () => {
      this.onAudioTrackChange_();
    });

    this.onAudioTrackChange_();
  }


  /**
   * Disable speech to text.
   */
  disable() {
    this.enabled_ = false;
    this.eventManager_.removeAll();
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
   * @suppress {checkTypes}
   * @private
   */
  onAudioTrackChange_() {
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
        this.recognition_.stop();
      }
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition_ = new SpeechRecognition();

      this.recognition_.lang = language;
      this.recognition_.continuous = true;
      this.recognition_.interimResults = true;

      this.recognition_.onstart = () => {
        shaka.log.debug('Speech to text: start', language);
      };
      this.recognition_.onresult = (event) => {
        if (this.textContainer_) {
          shaka.util.Dom.removeAllChildren(this.textContainer_);
        }
        if (this.enabled_) {
          let text = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
          }
          if (text.length > 150) {
            const parts = text.split(' ');
            if (parts.length > 30) {
              text = parts.slice(-20).join(' ');
            }
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
        }
      };
      this.recognition_.onerror = (error) => {
        if (this.textContainer_) {
          shaka.util.Dom.removeAllChildren(this.textContainer_);
        }
        shaka.log.debug('Speech to text: error', error);
      };
      this.recognition_.onend = () => {
        shaka.log.debug('Speech to text: end', language);
        if (this.enabled_ && !this.player_.getMediaElement().paused) {
          this.onAudioTrackChange_();
        }
      };
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
    if (!this.audioTrackMap_.has(mediaElement)) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      const sourceNode = audioContext.createMediaElementSource(mediaElement);
      const destinationNode = audioContext.createMediaStreamDestination();
      sourceNode.connect(destinationNode);
      sourceNode.connect(audioContext.destination);
      const audioTrack = destinationNode.stream.getAudioTracks()[0];
      this.audioTrackMap_.set(mediaElement, audioTrack);
    }
    return this.audioTrackMap_.get(mediaElement);
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
