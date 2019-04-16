/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('Player Src Equals', () => {
  // This asset needs to be (1) long and (2) high bitrate so that we can
  // invoke unbuffered seeks.
  const LARGE_MP4_CONTENT_URI = [
      'https://storage.googleapis.com',
      'shaka-demo-assets',
      'sintel-mp4-only',
      'v-2160p-17000k-libx264.mp4',
  ].join('/');

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.Player} */
  let player;

  beforeAll(() => {
    video = shaka.util.Dom.createVideoElement();
    document.body.appendChild(video);
  });

  beforeEach(() => {
    player = new shaka.Player();
    player.addEventListener('error', fail);
  });

  afterEach(async () => {
    await player.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  // Buffering is tracked using the media element, so the buffering state should
  // be the same as if we were using |MediaSource|.
  it('reports buffering state', async () => {
    /** @type {function():number} */
    const getBufferEnd = () => {
      const buffered = player.getBufferedInfo().total;
      return buffered.length ? buffered[0].end : 0;
    };

    await loadWithSrcEquals(LARGE_MP4_CONTENT_URI);

    // Wait until we have more than enough data buffered.
    for (let buffer = getBufferEnd(); buffer < 2; buffer = getBufferEnd()) {
      // eslint does not like await-in-loop because it could mean that you are
      // not using parallelism to its fullest. However we are not after
      // parallelism here, therefore we disable it.
      //
      // eslint-disable-next-line no-await-in-loop
      await shaka.test.Util.delay(0.25);
    }

    // Wait to make sure we are done buffering. This avoid the race condition
    // between buffering enough and the event being fired.
    if (player.isBuffering()) {
      await new Promise((resolve) => {
        player.addEventListener('buffering', resolve);
      });
    }

    expect(player.isBuffering()).toBeFalsy();

    // Wrap the event listener so that once we do the seek, we'll be notified of
    // the buffering event.
    const bufferingEvent = new Promise((resolve) => {
      player.addEventListener('buffering', resolve);
    });

    // Perform an unbuffered seek. We assume the content is so large that we
    // won't be able to buffer quick enough.
    video.currentTime = video.duration - 10;

    // After we see the buffering event, we should see the player report that we
    // are in a buffering state.
    await bufferingEvent;
    expect(player.isBuffering()).toBeTruthy();
  });

  /**
   * @param {string} contentUri
   * @return {!Promise}
   */
  async function loadWithSrcEquals(contentUri) {
    /** @type {!shaka.util.EventManager} */
    const eventManager = new shaka.util.EventManager();

    const ready = new Promise((resolve) => {
      eventManager.listenOnce(video, 'loadedmetadata', resolve);
    });

    await player.attach(video, /* initMediaSource= */ false);
    await player.load(contentUri);

    // Wait until the media element is ready with content. Waiting until this
    // point ensures it is safe to interact with the media element.
    await ready;

    eventManager.release();
  }
});
