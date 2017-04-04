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
  var video;
  var mediaSource;
  var mediaSourceEngine;
  var generators;
  var metadata;
  var presentationDuration = 840;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  // TODO: add text streams to MSE integration tests

  beforeAll(function() {
    video = /** @type {HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    document.body.appendChild(video);

    metadata = shaka.test.TestScheme.DATA['sintel'];
    generators = shaka.test.TestScheme.GENERATORS['sintel'];
  });

  beforeEach(function(done) {
    mediaSource = new MediaSource();
    video.src = window.URL.createObjectURL(mediaSource);

    var onMediaSourceOpen = function() {
      mediaSource.removeEventListener('sourceopen', onMediaSourceOpen);
      mediaSourceEngine = new shaka.media.MediaSourceEngine(
          video, mediaSource, null);
      done();
    };
    mediaSource.addEventListener('sourceopen', onMediaSourceOpen);
  });

  afterEach(function(done) {
    mediaSourceEngine.destroy().then(function() {
      video.removeAttribute('src');
      video.load();
      done();
    });
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  function appendInit(type) {
    var segment = generators[type].getInitSegment(Date.now() / 1000);
    return mediaSourceEngine.appendBuffer(type, segment, null, null);
  }

  function append(type, segmentNumber) {
    var segment = generators[type].
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
    var start = (segmentNumber - 1) * metadata[type].segmentDuration;
    var end = segmentNumber * metadata[type].segmentDuration;
    return mediaSourceEngine.remove(type, start, end);
  }

  function getFullMimeType(streamMetadata) {
    var fullMimeType = streamMetadata.mimeType;
    if (streamMetadata.codecs)
      fullMimeType += '; codecs="' + streamMetadata.codecs + '"';
    return fullMimeType;
  }

  it('buffers MP4 video', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    var initObject = {};
    initObject[ContentType.VIDEO] = getFullMimeType(metadata.video);
    mediaSourceEngine.init(initObject);
    mediaSourceEngine.setDuration(presentationDuration).then(function() {
      return appendInit(ContentType.VIDEO);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBe(0);
      return append(ContentType.VIDEO, 1);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(10);
      return append(ContentType.VIDEO, 2);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20);
      return append(ContentType.VIDEO, 3);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
    }).catch(fail).then(done);
  });

  it('removes segments', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    var initObject = {};
    initObject[ContentType.VIDEO] = getFullMimeType(metadata.video);
    mediaSourceEngine.init(initObject);
    mediaSourceEngine.setDuration(presentationDuration).then(function() {
      return appendInit(ContentType.VIDEO);
    }).then(function() {
      return Promise.all([
        append(ContentType.VIDEO, 1),
        append(ContentType.VIDEO, 2),
        append(ContentType.VIDEO, 3)
      ]);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
      return remove(ContentType.VIDEO, 1);
    }).then(function() {
      expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(10);
      expect(buffered(ContentType.VIDEO, 10)).toBeCloseTo(20);
      return remove(ContentType.VIDEO, 2);
    }).then(function() {
      expect(bufferStart(ContentType.VIDEO)).toBe(20);
      expect(buffered(ContentType.VIDEO, 20)).toBeCloseTo(10);
      return remove(ContentType.VIDEO, 3);
    }).then(function() {
      expect(bufferStart(ContentType.VIDEO)).toBe(null);
    }).catch(fail).then(done);
  });

  it('extends the duration', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    var initObject = {};
    initObject[ContentType.VIDEO] = getFullMimeType(metadata.video);
    mediaSourceEngine.init(initObject);
    mediaSourceEngine.setDuration(0).then(function() {
      return appendInit(ContentType.VIDEO);
    }).then(function() {
      return mediaSourceEngine.setDuration(20);
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(20);
      return append(ContentType.VIDEO, 1);
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(20);
      return mediaSourceEngine.setDuration(35);
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(35);
      return Promise.all([
        append(ContentType.VIDEO, 2),
        append(ContentType.VIDEO, 3),
        append(ContentType.VIDEO, 4)
      ]);
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(40);
      return mediaSourceEngine.setDuration(60);
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(60);
    }).catch(fail).then(done);
  });

  it('ends the stream, truncating the duration', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    var initObject = {};
    initObject[ContentType.VIDEO] = getFullMimeType(metadata.video);
    mediaSourceEngine.init(initObject);
    mediaSourceEngine.setDuration(presentationDuration).then(function() {
      return appendInit(ContentType.VIDEO);
    }).then(function() {
      return append(ContentType.VIDEO, 1);
    }).then(function() {
      return append(ContentType.VIDEO, 2);
    }).then(function() {
      return append(ContentType.VIDEO, 3);
    }).then(function() {
      return mediaSourceEngine.endOfStream();
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(30);
    }).catch(fail).then(done);
  });

  it('queues operations', function(done) {
    var resolutionOrder = [];
    var requests = [];

    function checkOrder(p) {
      var nextIndex = requests.length;
      requests.push(p);
      p.then(function() { resolutionOrder.push(nextIndex); });
    }

    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    var initObject = {};
    initObject[ContentType.VIDEO] = getFullMimeType(metadata.video);
    mediaSourceEngine.init(initObject);
    checkOrder(mediaSourceEngine.setDuration(presentationDuration));
    checkOrder(appendInit(ContentType.VIDEO));
    checkOrder(append(ContentType.VIDEO, 1));
    checkOrder(append(ContentType.VIDEO, 2));
    checkOrder(append(ContentType.VIDEO, 3));
    checkOrder(mediaSourceEngine.endOfStream());

    Promise.all(requests).then(function() {
      expect(resolutionOrder).toEqual([0, 1, 2, 3, 4, 5]);
    }).catch(fail).then(done);
  });

  it('buffers MP4 audio', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    var initObject = {};
    initObject[ContentType.AUDIO] = getFullMimeType(metadata.audio);
    mediaSourceEngine.init(initObject);
    mediaSourceEngine.setDuration(presentationDuration).then(function() {
      // NOTE: For some reason, this appendInit never resolves on my Windows VM.
      // The test operates correctly on real hardware.
      return appendInit(ContentType.AUDIO);
    }).then(function() {
      expect(buffered(ContentType.AUDIO, 0)).toBe(0);
      return append(ContentType.AUDIO, 1);
    }).then(function() {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(10, 1);
      return append(ContentType.AUDIO, 2);
    }).then(function() {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(20, 1);
      return append(ContentType.AUDIO, 3);
    }).then(function() {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(30, 1);
    }).catch(fail).then(done);
  });

  it('buffers MP4 video and audio', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    var initObject = {};
    initObject[ContentType.AUDIO] = getFullMimeType(metadata.audio);
    initObject[ContentType.VIDEO] = getFullMimeType(metadata.video);
    mediaSourceEngine.init(initObject);

    mediaSourceEngine.setDuration(presentationDuration).catch(fail);

    var audioStreaming = appendInit(ContentType.AUDIO).then(function() {
      return append(ContentType.AUDIO, 1);
    }).then(function() {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(10, 1);
      return append(ContentType.AUDIO, 2);
    }).then(function() {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(20, 1);
      return append(ContentType.AUDIO, 3);
    }).then(function() {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(30, 1);
      return append(ContentType.AUDIO, 4);
    }).then(function() {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(40, 1);
      return append(ContentType.AUDIO, 5);
    }).then(function() {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(50, 1);
      return append(ContentType.AUDIO, 6);
    }).then(function() {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(60, 1);
    }).catch(fail);

    var videoStreaming = appendInit(ContentType.VIDEO).then(function() {
      return append(ContentType.VIDEO, 1);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(10);
      return append(ContentType.VIDEO, 2);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20);
      return append(ContentType.VIDEO, 3);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
      return append(ContentType.VIDEO, 4);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(40);
      return append(ContentType.VIDEO, 5);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(50);
      return append(ContentType.VIDEO, 6);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(60);
    }).catch(fail);

    Promise.all([audioStreaming, videoStreaming]).then(function() {
      return mediaSourceEngine.endOfStream();
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(60, 1);
    }).catch(fail).then(done);
  });

  it('trims content at appendWindowEnd', function(done) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    var initObject = {};
    initObject[ContentType.VIDEO] = getFullMimeType(metadata.video);
    mediaSourceEngine.init(initObject);
    mediaSourceEngine.setDuration(presentationDuration).then(function() {
      return appendInit(ContentType.VIDEO);
    }).then(function() {
      return mediaSourceEngine.setStreamProperties(ContentType.VIDEO,
                                                   /* timestampOffset */ 0,
                                                   /* appendWindowEnd */ 18);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBe(0);
      return append(ContentType.VIDEO, 1);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(10);
      return append(ContentType.VIDEO, 2);
    }).then(function() {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(18, 1);
    }).catch(fail).then(done);
  });
});
