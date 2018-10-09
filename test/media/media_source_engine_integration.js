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

describe('MediaSourceEngine', function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const presentationDuration = 840;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!MediaSource} */
  let mediaSource;
  /** @type {!shaka.media.MediaSourceEngine} */
  let mediaSourceEngine;
  let generators;
  let metadata;
  // TODO: add text streams to MSE integration tests

  beforeAll(function() {
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);
  });

  beforeEach(function(done) {
    metadata = shaka.test.TestScheme.DATA['sintel'];
    generators = shaka.test.TestScheme.GENERATORS['sintel'];

    mediaSourceEngine = new shaka.media.MediaSourceEngine(video);
    mediaSource = /** @type {?} */(mediaSourceEngine)['mediaSource_'];
    expect(video.src).toBeTruthy();
    mediaSourceEngine.init({}, false).then(done);
  });

  afterEach(function(done) {
    mediaSourceEngine.destroy().catch(fail).then(done);
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  function appendInit(type) {
    let segment = generators[type].getInitSegment(Date.now() / 1000);
    return mediaSourceEngine.appendBuffer(type, segment, null, null);
  }

  function append(type, segmentNumber) {
    let segment = generators[type].
        getSegment(segmentNumber, 0, Date.now() / 1000);
    return mediaSourceEngine.appendBuffer(type, segment, null, null);
  }

  function buffered(type, time) {
    return mediaSourceEngine.bufferedAheadOf(type, time);
  }

  function bufferStart(type) {
    return mediaSourceEngine.bufferStart(type);
  }

  function remove(type, segmentNumber) {
    let start = (segmentNumber - 1) * metadata[type].segmentDuration;
    let end = segmentNumber * metadata[type].segmentDuration;
    return mediaSourceEngine.remove(type, start, end);
  }

  function getFakeStream(streamMetadata) {
    return {
      mimeType: streamMetadata.mimeType,
      codecs: streamMetadata.codecs
    };
  }

  it('buffers MP4 video', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    mediaSourceEngine.init(initObject, false).then(() => {
      return mediaSourceEngine.setDuration(presentationDuration);
    }).then(() => {
      return appendInit(ContentType.VIDEO);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBe(0);
      return append(ContentType.VIDEO, 1);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(10);
      return append(ContentType.VIDEO, 2);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20);
      return append(ContentType.VIDEO, 3);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
    }).catch(fail).then(done);
  });

  it('removes segments', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    mediaSourceEngine.init(initObject, false).then(() => {
      return mediaSourceEngine.setDuration(presentationDuration);
    }).then(() => {
      return appendInit(ContentType.VIDEO);
    }).then(() => {
      return Promise.all([
        append(ContentType.VIDEO, 1),
        append(ContentType.VIDEO, 2),
        append(ContentType.VIDEO, 3)
      ]);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
      return remove(ContentType.VIDEO, 1);
    }).then(() => {
      expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(10);
      expect(buffered(ContentType.VIDEO, 10)).toBeCloseTo(20);
      return remove(ContentType.VIDEO, 2);
    }).then(() => {
      expect(bufferStart(ContentType.VIDEO)).toBe(20);
      expect(buffered(ContentType.VIDEO, 20)).toBeCloseTo(10);
      return remove(ContentType.VIDEO, 3);
    }).then(() => {
      expect(bufferStart(ContentType.VIDEO)).toBe(null);
    }).catch(fail).then(done);
  });

  it('extends the duration', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    mediaSourceEngine.init(initObject, false).then(() => {
      return mediaSourceEngine.setDuration(0);
    }).then(() => {
      return appendInit(ContentType.VIDEO);
    }).then(() => {
      return mediaSourceEngine.setDuration(20);
    }).then(() => {
      expect(mediaSource.duration).toBeCloseTo(20);
      return append(ContentType.VIDEO, 1);
    }).then(() => {
      expect(mediaSource.duration).toBeCloseTo(20);
      return mediaSourceEngine.setDuration(35);
    }).then(() => {
      expect(mediaSource.duration).toBeCloseTo(35);
      return Promise.all([
        append(ContentType.VIDEO, 2),
        append(ContentType.VIDEO, 3),
        append(ContentType.VIDEO, 4)
      ]);
    }).then(() => {
      expect(mediaSource.duration).toBeCloseTo(40);
      return mediaSourceEngine.setDuration(60);
    }).then(() => {
      expect(mediaSource.duration).toBeCloseTo(60);
    }).catch(fail).then(done);
  });

  it('ends the stream, truncating the duration', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    mediaSourceEngine.init(initObject, false).then(() => {
      return mediaSourceEngine.setDuration(presentationDuration);
    }).then(() => {
      return appendInit(ContentType.VIDEO);
    }).then(() => {
      return append(ContentType.VIDEO, 1);
    }).then(() => {
      return append(ContentType.VIDEO, 2);
    }).then(() => {
      return append(ContentType.VIDEO, 3);
    }).then(() => {
      return mediaSourceEngine.endOfStream();
    }).then(() => {
      expect(mediaSource.duration).toBeCloseTo(30);
    }).catch(fail).then(done);
  });

  it('queues operations', function(done) {
    let resolutionOrder = [];
    let requests = [];

    function checkOrder(p) {
      let nextIndex = requests.length;
      requests.push(p);
      p.then(function() { resolutionOrder.push(nextIndex); });
    }

    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    mediaSourceEngine.init(initObject, false).then(() => {
      checkOrder(mediaSourceEngine.setDuration(presentationDuration));
      checkOrder(appendInit(ContentType.VIDEO));
      checkOrder(append(ContentType.VIDEO, 1));
      checkOrder(append(ContentType.VIDEO, 2));
      checkOrder(append(ContentType.VIDEO, 3));
      checkOrder(mediaSourceEngine.endOfStream());

      return Promise.all(requests);
    }).then(() => {
      expect(resolutionOrder).toEqual([0, 1, 2, 3, 4, 5]);
    }).catch(fail).then(done);
  });

  it('buffers MP4 audio', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.AUDIO] = getFakeStream(metadata.audio);
    mediaSourceEngine.init(initObject, false).then(() => {
      return mediaSourceEngine.setDuration(presentationDuration);
    }).then(() => {
      // NOTE: For some reason, this appendInit never resolves on my Windows VM.
      // The test operates correctly on real hardware.
      return appendInit(ContentType.AUDIO);
    }).then(() => {
      expect(buffered(ContentType.AUDIO, 0)).toBe(0);
      return append(ContentType.AUDIO, 1);
    }).then(() => {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(10, 1);
      return append(ContentType.AUDIO, 2);
    }).then(() => {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(20, 1);
      return append(ContentType.AUDIO, 3);
    }).then(() => {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(30, 1);
    }).catch(fail).then(done);
  });

  it('buffers MP4 video and audio', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.AUDIO] = getFakeStream(metadata.audio);
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);

    mediaSourceEngine.init(initObject, false).then(() => {
      return mediaSourceEngine.setDuration(presentationDuration);
    }).then(() => {
      let audioStreaming = appendInit(ContentType.AUDIO).then(() => {
        return append(ContentType.AUDIO, 1);
      }).then(() => {
        expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(10, 1);
        return append(ContentType.AUDIO, 2);
      }).then(() => {
        expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(20, 1);
        return append(ContentType.AUDIO, 3);
      }).then(() => {
        expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(30, 1);
        return append(ContentType.AUDIO, 4);
      }).then(() => {
        expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(40, 1);
        return append(ContentType.AUDIO, 5);
      }).then(() => {
        expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(50, 1);
        return append(ContentType.AUDIO, 6);
      }).then(() => {
        expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(60, 1);
      }).catch(fail);

      let videoStreaming = appendInit(ContentType.VIDEO).then(() => {
        return append(ContentType.VIDEO, 1);
      }).then(() => {
        expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(10);
        return append(ContentType.VIDEO, 2);
      }).then(() => {
        expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20);
        return append(ContentType.VIDEO, 3);
      }).then(() => {
        expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
        return append(ContentType.VIDEO, 4);
      }).then(() => {
        expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(40);
        return append(ContentType.VIDEO, 5);
      }).then(() => {
        expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(50);
        return append(ContentType.VIDEO, 6);
      }).then(() => {
        expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(60);
      }).catch(fail);

      return Promise.all([audioStreaming, videoStreaming]);
    }).then(() => {
      return mediaSourceEngine.endOfStream();
    }).then(() => {
      expect(mediaSource.duration).toBeCloseTo(60, 1);
    }).catch(fail).then(done);
  });

  it('trims content at the append window', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    mediaSourceEngine.init(initObject, false).then(() => {
      return mediaSourceEngine.setDuration(presentationDuration);
    }).then(() => {
      return appendInit(ContentType.VIDEO);
    }).then(() => {
      return mediaSourceEngine.setStreamProperties(ContentType.VIDEO,
                                                   /* timestampOffset */ 0,
                                                   /* appendWindowStart */ 5,
                                                   /* appendWindowEnd */ 18);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBe(0);
      return append(ContentType.VIDEO, 1);
    }).then(() => {
      expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(5, 1);
      expect(buffered(ContentType.VIDEO, 5)).toBeCloseTo(5, 1);
      return append(ContentType.VIDEO, 2);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 5)).toBeCloseTo(13, 1);
    }).catch(fail).then(done);
  });

  it('does not remove when overlap is outside append window', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    mediaSourceEngine.init(initObject, false).then(() => {
      return mediaSourceEngine.setDuration(presentationDuration);
    }).then(() => {
      return appendInit(ContentType.VIDEO);
    }).then(() => {
      // Simulate period 1, with 20 seconds of content, no timestamp offset
      return mediaSourceEngine.setStreamProperties(ContentType.VIDEO,
                                                   /* timestampOffset */ 0,
                                                   /* appendWindowStart */ 0,
                                                   /* appendWindowEnd */ 20);
    }).then(() => {
      return append(ContentType.VIDEO, 1);
    }).then(() => {
      return append(ContentType.VIDEO, 2);
    }).then(() => {
      expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(0, 1);
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20, 1);

      // Simulate period 2, with 20 seconds of content offset back by 5 seconds.
      // The 5 seconds of overlap should be trimmed off, and we should still
      // have a continuous stream with 35 seconds of content.
      return mediaSourceEngine.setStreamProperties(ContentType.VIDEO,
                                                   /* timestampOffset */ 15,
                                                   /* appendWindowStart */ 20,
                                                   /* appendWindowEnd */ 35);
    }).then(() => {
      return append(ContentType.VIDEO, 1);
    }).then(() => {
      return append(ContentType.VIDEO, 2);
    }).then(() => {
      expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(0, 1);
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(35, 1);
    }).catch(fail).then(done);
  });

  it('extracts CEA-708 captions', function(done) {
    // Load TS files with CEA-708 captions.
    metadata = shaka.test.TestScheme.DATA['cea-708_ts'];
    generators = shaka.test.TestScheme.GENERATORS['cea-708_ts'];

    // Create a mock text displayer, to intercept text cues.
    let cues = [];
    let mockTextDisplayer = /** @type {shakaExtern.TextDisplayer} */ ({
      append: (newCues) => { cues = cues.concat(newCues); }
    });
    mediaSourceEngine.setTextDisplayer(mockTextDisplayer);

    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    mediaSourceEngine.setUseEmbeddedText(true);
    // Call with forceTransmuxTS = true, so that it will transmux even on
    // platforms with native TS support.
    mediaSourceEngine.init(initObject, /** forceTransmuxTS */ true).then(() => {
      return append(ContentType.VIDEO, 0);
    }).then(() => {
      expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(1, 0);
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20, 1);
      expect(cues.length).toBe(3);
    }).catch(fail).then(done);
  });
});
