/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SpeechToText', () => {
  /** @type {!shaka.Player} */
  let player;

  /** @type {shaka.extern.SpeechToTextConfiguration} */
  let config;

  /** @type {shaka.text.SpeechToText} */
  let speechToText;

  const originalSpeechRecognition = window.SpeechRecognition;

  beforeEach(() => {
    shaka.text.SpeechToText.isMediaStreamTrackSupported.reset();

    player = new shaka.Player();

    const defaultConfig = shaka.util.PlayerConfiguration.createDefault();

    config = defaultConfig.streaming.speechToText;
  });

  afterEach(async () => {
    window.SpeechRecognition = originalSpeechRecognition;
    if (speechToText) {
      speechToText.release();
    }
    await player.destroy();
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
});
