/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SpeechToText', () => {
  /** @type {!shaka.Player} */
  let player;

  beforeEach(() => {
    shaka.text.SpeechToText.isMediaStreamTrackSupported.reset();

    player = new shaka.Player();
  });

  afterEach(async () => {
    await player.destroy();
  });

  it('isSupported return false when no SpeechRecognition support', () => {
    const orig = window.SpeechRecognition;
    delete window.SpeechRecognition;
    const speechToText = new shaka.text.SpeechToText(player);
    expect(speechToText.isSupported()).toBe(false);
    window.SpeechRecognition = orig;
  });
});
