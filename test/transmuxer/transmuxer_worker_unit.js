/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// TransmuxerWorker is a worker-only entry point, not part of the main app
// dependency graph, so require it explicitly to load it in the test bundle.
goog.require('shaka.transmuxer.TransmuxerWorker');

describe('TransmuxerWorker', () => {
  const Util = shaka.test.Util;

  /** @type {!shaka.transmuxer.TransmuxerWorker} */
  let worker;

  /** @type {!Array<{message: ?, transfer: ?}>} */
  let posted;

  /** @type {?} */
  let originalPostMessage;

  beforeEach(() => {
    posted = [];
    // The worker replies via self.postMessage(). In a browser (not a real
    // Worker) self === window and window.postMessage has a different
    // signature, so capture the calls instead of dispatching them.
    originalPostMessage = self.postMessage;
    self.postMessage = (message, transfer) => {
      posted.push({message: message, transfer: transfer});
    };
    worker = new shaka.transmuxer.TransmuxerWorker();
  });

  afterEach(() => {
    self.postMessage = originalPostMessage;
  });

  /**
   * @param {number} id
   * @param {string} mimeType
   * @suppress {visibility}
   */
  function init(id, mimeType) {
    worker.onInit_({'id': id, 'mimeType': mimeType});
  }

  /**
   * @param {!Object} msg
   * @return {!Promise}
   * @suppress {visibility}
   */
  function transmux(msg) {
    return worker.onTransmux_(msg);
  }

  /**
   * @param {number} id
   * @param {!ArrayBuffer} data
   * @param {string} contentType
   * @return {!Object}
   */
  function transmuxMessage(id, data, contentType) {
    return {
      'id': id,
      'reqId': 0,
      'data': data,
      'streamProps': {
        'id': 1,
        'codecs': 'mp4a.40.2',
        'channelsCount': null,
        'audioSamplingRate': null,
        'height': null,
        'width': null,
        'language': 'en',
      },
      'refProps': {
        'discontinuitySequence': 0,
        'startTime': 0,
        'endTime': 6,
        'uris': ['test.aac'],
      },
      'duration': 6,
      'contentType': contentType,
    };
  }

  // Regression test for issue #10347: raw AAC segments carry an Apple
  // `com.apple.streaming.transportStreamTimestamp` ID3 frame. Parsing it goes
  // through StringUtils.fromUTF8, which calls DeviceFactory.getDevice(). If the
  // worker bundle has no device registered, getDevice() returns undefined and
  // this throws. This drives that exact path with a real fixture.
  it('handles raw AAC that carries an ID3 timestamp frame', async () => {
    const data = await Util.fetch(
        '/base/test/test/assets/hls-raw-aac/fileSequence0.aac');

    init(1, 'audio/aac');
    await transmux(transmuxMessage(1, data, 'audio'));

    expect(posted.length).toBe(1);
    expect(posted[0].message['cmd']).toBe('transmuxed');
    expect(posted[0].message['reqId']).toBe(0);
  });

  it('posts an error when transmuxing before init', async () => {
    await transmux(transmuxMessage(1, new ArrayBuffer(4), 'audio'));

    expect(posted.length).toBe(1);
    expect(posted[0].message['cmd']).toBe('error');
    expect(posted[0].message['error']['code'])
        .toBe(shaka.util.Error.Code.TRANSMUXING_FAILED);
  });
});
