/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MediaSourceEngine', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const Cue = shaka.text.Cue;
  const Util = shaka.test.Util;
  const presentationDuration = 840;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!MediaSource} */
  let mediaSource;
  /** @type {!shaka.media.MediaSourceEngine} */
  let mediaSourceEngine;
  let generators;
  let metadata;

  /** @type {shaka.extern.Stream} */
  const fakeStream = shaka.test.StreamingEngineUtil.createMockVideoStream(1);
  const fakeTsStream =
      shaka.test.StreamingEngineUtil.createMockVideoStream(1, 'video/mp2t');
  // TODO: add text streams to MSE integration tests

  const mp4CeaCue0 = jasmine.objectContaining({
    startTime: Util.closeTo(0.067, 0.001),
    endTime: Util.closeTo(1, 0.001),
    textAlign: Cue.textAlign.CENTER,
    nestedCues: [
      jasmine.objectContaining({
        startTime: Util.closeTo(0.067, 0.001),
        endTime: Util.closeTo(1, 0.001),
        payload: 'eng:⠀00:00:00:00',
        textAlign: Cue.textAlign.CENTER,
      }),
    ],
  });

  const tsCeaCue0 = jasmine.objectContaining({
    startTime: Util.closeTo(0.767, 0.001),
    endTime: Util.closeTo(4.972, 0.001),
    textAlign: Cue.textAlign.CENTER,
    nestedCues: [
      jasmine.objectContaining({
        payload: 'These are 608 captions',
        textAlign: Cue.textAlign.CENTER,
      }),
      jasmine.objectContaining({lineBreak: true}),
      jasmine.objectContaining({
        payload: '(top left)',
        textAlign: Cue.textAlign.CENTER,
      }),
    ],
  });

  const tsCeaCue1 = jasmine.objectContaining({
    startTime: Util.closeTo(5.305, 0.001),
    endTime: Util.closeTo(11.979, 0.001),
    textAlign: Cue.textAlign.CENTER,
    nestedCues: [
      jasmine.objectContaining({
        payload: 'These are 608 captions',
        textAlign: Cue.textAlign.CENTER,
      }),
      jasmine.objectContaining({lineBreak: true}),
      jasmine.objectContaining({
        payload: '(middle)',
        textAlign: Cue.textAlign.CENTER,
      }),
    ],
  });

  const tsCeaCue2 = jasmine.objectContaining({
    startTime: Util.closeTo(12.312, 0.001),
    endTime: Util.closeTo(19.319, 0.001),
    textAlign: Cue.textAlign.CENTER,
    nestedCues: [
      jasmine.objectContaining({
        payload: 'These are 608 captions',
        textAlign: Cue.textAlign.CENTER,
      }),
      jasmine.objectContaining({lineBreak: true}),
      jasmine.objectContaining({
        payload: '(bottom left)',
        textAlign: Cue.textAlign.CENTER,
      }),
    ],
  });

  // The same segments as above, but offset by 40 seconds (yes, 40), which is
  // also 2 segments.
  const tsCeaCue3 = jasmine.objectContaining({
    startTime: Util.closeTo(40.767, 0.001),
    endTime: Util.closeTo(44.972, 0.001),
    textAlign: Cue.textAlign.CENTER,
    nestedCues: [
      jasmine.objectContaining({
        payload: 'These are 608 captions',
        textAlign: Cue.textAlign.CENTER,
      }),
      jasmine.objectContaining({lineBreak: true}),
      jasmine.objectContaining({
        payload: '(top left)',
        textAlign: Cue.textAlign.CENTER,
      }),
    ],
  });

  const tsCeaCue4 = jasmine.objectContaining({
    startTime: Util.closeTo(45.305, 0.001),
    endTime: Util.closeTo(51.979, 0.001),
    textAlign: Cue.textAlign.CENTER,
    nestedCues: [
      jasmine.objectContaining({
        payload: 'These are 608 captions',
        textAlign: Cue.textAlign.CENTER,
      }),
      jasmine.objectContaining({lineBreak: true}),
      jasmine.objectContaining({
        payload: '(middle)',
        textAlign: Cue.textAlign.CENTER,
      }),
    ],
  });

  const tsCeaCue5 = jasmine.objectContaining({
    startTime: Util.closeTo(52.312, 0.001),
    endTime: Util.closeTo(59.319, 0.001),
    textAlign: Cue.textAlign.CENTER,
    nestedCues: [
      jasmine.objectContaining({
        payload: 'These are 608 captions',
        textAlign: Cue.textAlign.CENTER,
      }),
      jasmine.objectContaining({lineBreak: true}),
      jasmine.objectContaining({
        payload: '(bottom left)',
        textAlign: Cue.textAlign.CENTER,
      }),
    ],
  });

  /**
   * We use a fake text displayer so that we can check if CEA text is being
   * passed through the system correctly.
   *
   * @type {!shaka.test.FakeTextDisplayer}
   */
  let textDisplayer;

  /** @type {!jasmine.Spy} */
  let onMetadata;

  beforeAll(() => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
  });

  beforeEach(async () => {
    metadata = shaka.test.TestScheme.DATA['sintel'];
    generators = shaka.test.TestScheme.GENERATORS['sintel'];

    textDisplayer = new shaka.test.FakeTextDisplayer();

    onMetadata = jasmine.createSpy('onMetadata');

    mediaSourceEngine = new shaka.media.MediaSourceEngine(
        video,
        textDisplayer,
        shaka.test.Util.spyFunc(onMetadata));
    const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
    mediaSourceEngine.configure(config);

    mediaSource = /** @type {?} */(mediaSourceEngine)['mediaSource_'];
    expect(video.src).toBeTruthy();
    await mediaSourceEngine.init(new Map(), false);
  });

  afterEach(async () => {
    await mediaSourceEngine.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  function appendInit(type) {
    const segment = generators[type].getInitSegment(Date.now() / 1000);
    const reference = null;
    return mediaSourceEngine.appendBuffer(
        type, segment, reference, fakeStream, /* hasClosedCaptions= */ false);
  }

  function append(type, segmentNumber) {
    const segment = generators[type]
        .getSegment(segmentNumber, Date.now() / 1000);
    const reference = dummyReference(type, segmentNumber);
    return mediaSourceEngine.appendBuffer(
        type, segment, reference, fakeStream, /* hasClosedCaptions= */ false);
  }

  function appendWithSeekAndClosedCaptions(type, segmentNumber) {
    const segment = generators[type]
        .getSegment(segmentNumber, Date.now() / 1000);
    const reference = dummyReference(type, segmentNumber);
    return mediaSourceEngine.appendBuffer(
        type,
        segment,
        reference,
        fakeStream,
        /* hasClosedCaptions= */ true,
        /* seeked= */ true);
  }

  function appendInitWithClosedCaptions(type) {
    const segment = generators[type].getInitSegment(Date.now() / 1000);
    const reference = null;
    return mediaSourceEngine.appendBuffer(
        type, segment, reference, fakeStream, /* hasClosedCaptions= */ true);
  }

  function appendWithClosedCaptions(type, segmentNumber) {
    const segment = generators[type]
        .getSegment(segmentNumber, Date.now() / 1000);
    const reference = dummyReference(type, segmentNumber);
    return mediaSourceEngine.appendBuffer(
        type, segment, reference, fakeStream, /* hasClosedCaptions= */ true);
  }

  function buffered(type, time) {
    return mediaSourceEngine.bufferedAheadOf(type, time);
  }

  function bufferStart(type) {
    return mediaSourceEngine.bufferStart(type);
  }

  function dummyReference(type, segmentNumber) {
    const start = segmentNumber * metadata[type].segmentDuration;
    const end = (segmentNumber + 1) * metadata[type].segmentDuration;
    return new shaka.media.SegmentReference(
        start, end,
        /* uris= */ () => ['foo://bar'],
        /* startByte= */ 0,
        /* endByte= */ null,
        /* initSegmentReference= */ null,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity);
  }

  function remove(type, segmentNumber) {
    const start = segmentNumber * metadata[type].segmentDuration;
    const end = (segmentNumber + 1) * metadata[type].segmentDuration;
    return mediaSourceEngine.remove(type, start, end);
  }

  function getFakeStream(streamMetadata) {
    return {
      mimeType: streamMetadata.mimeType,
      codecs: streamMetadata.codecs,
      drmInfos: [],
    };
  }

  it('buffers MP4 video', async () => {
    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    expect(buffered(ContentType.VIDEO, 0)).toBe(0);
    await append(ContentType.VIDEO, 0);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(10);
    await append(ContentType.VIDEO, 1);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20);
    await append(ContentType.VIDEO, 2);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
  });

  it('removes segments', async () => {
    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    await Promise.all([
      append(ContentType.VIDEO, 0),
      append(ContentType.VIDEO, 1),
      append(ContentType.VIDEO, 2),
    ]);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
    await remove(ContentType.VIDEO, 0);
    expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(10);
    expect(buffered(ContentType.VIDEO, 10)).toBeCloseTo(20);
    await remove(ContentType.VIDEO, 1);
    expect(bufferStart(ContentType.VIDEO)).toBe(20);
    expect(buffered(ContentType.VIDEO, 20)).toBeCloseTo(10);
    await remove(ContentType.VIDEO, 2);
    expect(bufferStart(ContentType.VIDEO)).toBe(null);
  });

  it('extends the duration', async () => {
    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(0);
    await appendInit(ContentType.VIDEO);
    await mediaSourceEngine.setDuration(20);
    expect(mediaSource.duration).toBeCloseTo(20);
    await append(ContentType.VIDEO, 0);
    expect(mediaSource.duration).toBeCloseTo(20);
    await mediaSourceEngine.setDuration(35);
    expect(mediaSource.duration).toBeCloseTo(35);
    await Promise.all([
      append(ContentType.VIDEO, 1),
      append(ContentType.VIDEO, 2),
      append(ContentType.VIDEO, 3),
    ]);
    expect(mediaSource.duration).toBeCloseTo(40);
    await mediaSourceEngine.setDuration(60);
    expect(mediaSource.duration).toBeCloseTo(60);
  });

  it('ends the stream, truncating the duration', async () => {
    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    await append(ContentType.VIDEO, 0);
    await append(ContentType.VIDEO, 1);
    await append(ContentType.VIDEO, 2);
    await mediaSourceEngine.endOfStream();
    expect(mediaSource.duration).toBeCloseTo(30);
  });

  it('does not throw if endOfStrem called more than once', async () => {
    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    await append(ContentType.VIDEO, 0);
    // Call endOfStream twice. There should be no exception.
    await mediaSourceEngine.endOfStream();
    await mediaSourceEngine.endOfStream();
  });

  it('queues operations', async () => {
    /** @type {!Array.<number>} */
    const resolutionOrder = [];
    /** @type {!Array.<!Promise>} */
    const requests = [];

    function checkOrder(p) {
      const nextIndex = requests.length;
      requests.push(p.then(() => {
        resolutionOrder.push(nextIndex);
      }));
    }

    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));
    await mediaSourceEngine.init(initObject, false);
    checkOrder(mediaSourceEngine.setDuration(presentationDuration));
    checkOrder(appendInit(ContentType.VIDEO));
    checkOrder(append(ContentType.VIDEO, 0));
    checkOrder(append(ContentType.VIDEO, 1));
    checkOrder(append(ContentType.VIDEO, 2));
    checkOrder(mediaSourceEngine.endOfStream());

    await Promise.all(requests);
    expect(resolutionOrder).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('buffers MP4 audio', async () => {
    const initObject = new Map();
    initObject.set(ContentType.AUDIO, getFakeStream(metadata.audio));
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    // NOTE: For some reason, this appendInit never resolves on my Windows VM.
    // The test operates correctly on real hardware.
    await appendInit(ContentType.AUDIO);
    expect(buffered(ContentType.AUDIO, 0)).toBe(0);
    await append(ContentType.AUDIO, 0);
    expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(10, 1);
    await append(ContentType.AUDIO, 1);
    expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(20, 1);
    await append(ContentType.AUDIO, 2);
    expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(30, 1);
  });

  it('buffers MP4 video and audio', async () => {
    const initObject = new Map();
    initObject.set(ContentType.AUDIO, getFakeStream(metadata.audio));
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));

    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);

    const audioStreaming = async () => {
      await appendInit(ContentType.AUDIO);
      await append(ContentType.AUDIO, 0);
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(10, 1);
      await append(ContentType.AUDIO, 1);
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(20, 1);
      await append(ContentType.AUDIO, 2);
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(30, 1);
      await append(ContentType.AUDIO, 3);
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(40, 1);
      await append(ContentType.AUDIO, 4);
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(50, 1);
      await append(ContentType.AUDIO, 5);
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(60, 1);
    };

    const videoStreaming = async () => {
      await appendInit(ContentType.VIDEO);
      await append(ContentType.VIDEO, 0);
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(10);
      await append(ContentType.VIDEO, 1);
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20);
      await append(ContentType.VIDEO, 2);
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
      await append(ContentType.VIDEO, 3);
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(40);
      await append(ContentType.VIDEO, 4);
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(50);
      await append(ContentType.VIDEO, 5);
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(60);
    };

    await Promise.all([audioStreaming(), videoStreaming()]);
    await mediaSourceEngine.endOfStream();
    expect(mediaSource.duration).toBeCloseTo(60, 1);
  });

  it('trims content at the append window', async () => {
    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    await mediaSourceEngine.setStreamProperties(ContentType.VIDEO,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 5,
        /* appendWindowEnd= */ 18,
        /* sequenceMode= */ false,
        fakeStream,
        /* streamsByType= */ new Map());
    expect(buffered(ContentType.VIDEO, 0)).toBe(0);
    await append(ContentType.VIDEO, 0);
    expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(5, 1);
    expect(buffered(ContentType.VIDEO, 5)).toBeCloseTo(5, 1);
    await append(ContentType.VIDEO, 1);
    expect(buffered(ContentType.VIDEO, 5)).toBeCloseTo(13, 1);
  });

  it('does not initialize timestamp offset in sequence mode', async () => {
    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    await mediaSourceEngine.setStreamProperties(ContentType.VIDEO,
        /* timestampOffset= */ 100,
        /* appendWindowStart= */ 5,
        /* appendWindowEnd= */ 18,
        /* sequenceMode= */ true,
        fakeStream,
        /* streamsByType= */ new Map());
    expect(buffered(ContentType.VIDEO, 0)).toBe(0);
    await append(ContentType.VIDEO, 0);
    expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(5, 1);
    expect(buffered(ContentType.VIDEO, 5)).toBeCloseTo(5, 1);
    await append(ContentType.VIDEO, 1);
    expect(buffered(ContentType.VIDEO, 5)).toBeCloseTo(13, 1);
  });

  it('does not remove when overlap is outside append window', async () => {
    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    // Simulate period 1, with 20 seconds of content, no timestamp offset
    await mediaSourceEngine.setStreamProperties(ContentType.VIDEO,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ 20,
        /* sequenceMode= */ false,
        fakeStream,
        /* streamsByType= */ new Map());
    await append(ContentType.VIDEO, 0);
    await append(ContentType.VIDEO, 1);
    expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(0, 1);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20, 1);

    // Simulate period 2, with 20 seconds of content offset back by 5 seconds.
    // The 5 seconds of overlap should be trimmed off, and we should still
    // have a continuous stream with 35 seconds of content.
    await mediaSourceEngine.setStreamProperties(ContentType.VIDEO,
        /* timestampOffset= */ 15,
        /* appendWindowStart= */ 20,
        /* appendWindowEnd= */ 35,
        /* sequenceMode= */ false,
        fakeStream,
        /* streamsByType= */ new Map());
    await append(ContentType.VIDEO, 0);
    await append(ContentType.VIDEO, 1);
    expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(0, 1);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(35, 1);
  });

  it('extracts CEA-708 captions from hls', async () => {
    // Load TS file with CEA-708 captions.
    metadata = shaka.test.TestScheme.DATA['cea-708_ts'];
    generators = shaka.test.TestScheme.GENERATORS['cea-708_ts'];

    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));
    initObject.set(ContentType.TEXT, getFakeStream(metadata.text));
    const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
    config.forceTransmux = true;
    mediaSourceEngine.configure(config);
    await mediaSourceEngine.init(initObject);
    mediaSourceEngine.setSelectedClosedCaptionId('CC1');

    await appendWithClosedCaptions(ContentType.VIDEO, 0);

    expect(textDisplayer.appendSpy).toHaveBeenCalledTimes(3);
    expect(textDisplayer.appendSpy).toHaveBeenCalledWith([tsCeaCue0]);
    expect(textDisplayer.appendSpy).toHaveBeenCalledWith([tsCeaCue1]);
    expect(textDisplayer.appendSpy).toHaveBeenCalledWith([tsCeaCue2]);
  });

  it('extracts CEA-708 captions from previous segment from hls', async () => {
    // Load TS file with CEA-708 captions.
    metadata = shaka.test.TestScheme.DATA['cea-708_ts'];
    generators = shaka.test.TestScheme.GENERATORS['cea-708_ts'];

    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));
    initObject.set(ContentType.TEXT, getFakeStream(metadata.text));
    const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
    config.forceTransmux = true;
    mediaSourceEngine.configure(config);
    await mediaSourceEngine.init(initObject);
    mediaSourceEngine.setSelectedClosedCaptionId('CC1');

    await appendWithClosedCaptions(ContentType.VIDEO, 2);

    expect(textDisplayer.appendSpy).toHaveBeenCalledTimes(3);
    expect(textDisplayer.appendSpy).toHaveBeenCalledWith([tsCeaCue3]);
    expect(textDisplayer.appendSpy).toHaveBeenCalledWith([tsCeaCue4]);
    expect(textDisplayer.appendSpy).toHaveBeenCalledWith([tsCeaCue5]);

    textDisplayer.appendSpy.calls.reset();
    await appendWithSeekAndClosedCaptions(ContentType.VIDEO, 0);

    expect(textDisplayer.appendSpy).toHaveBeenCalledTimes(3);
    expect(textDisplayer.appendSpy).toHaveBeenCalledWith([tsCeaCue0]);
    expect(textDisplayer.appendSpy).toHaveBeenCalledWith([tsCeaCue1]);
    expect(textDisplayer.appendSpy).toHaveBeenCalledWith([tsCeaCue2]);
  });

  it('buffers partial TS video segments in sequence mode', async () => {
    metadata = shaka.test.TestScheme.DATA['cea-708_ts'];
    generators = shaka.test.TestScheme.GENERATORS['cea-708_ts'];

    const videoType = ContentType.VIDEO;
    const initObject = new Map();
    initObject.set(videoType, getFakeStream(metadata.video));

    await mediaSourceEngine.init(initObject, /* sequenceMode= */ true);
    await mediaSourceEngine.setDuration(presentationDuration);
    await mediaSourceEngine.setStreamProperties(
        videoType,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity,
        /* sequenceMode= */ true,
        fakeTsStream,
        /* streamsByType= */ new Map());

    const segment = generators[videoType].getSegment(0, Date.now() / 1000);
    const partialSegmentLength = Math.floor(segment.byteLength / 3);

    let partialSegment = shaka.util.BufferUtils.toUint8(
        segment, /* offset= */ 0, /* length= */ partialSegmentLength);
    let reference = dummyReference(videoType, 0);
    await mediaSourceEngine.appendBuffer(
        videoType, partialSegment, reference, fakeStream,
        /* hasClosedCaptions= */ false);

    partialSegment = shaka.util.BufferUtils.toUint8(
        segment,
        /* offset= */ partialSegmentLength);
    reference = dummyReference(videoType, 1);
    await mediaSourceEngine.appendBuffer(
        videoType, partialSegment, reference, fakeStream,
        /* hasClosedCaptions= */ false, /* seeked= */ true);
  });

  it('extracts CEA-708 captions from dash', async () => {
    // Load MP4 file with CEA-708 closed captions.
    metadata = shaka.test.TestScheme.DATA['cea-708_mp4'];
    generators = shaka.test.TestScheme.GENERATORS['cea-708_mp4'];

    const initObject = new Map();
    initObject.set(ContentType.VIDEO, getFakeStream(metadata.video));

    await mediaSourceEngine.init(initObject);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInitWithClosedCaptions(ContentType.VIDEO);
    mediaSourceEngine.setSelectedClosedCaptionId('CC1');
    await appendWithClosedCaptions(ContentType.VIDEO, 0);

    expect(textDisplayer.appendSpy).toHaveBeenCalledTimes(1);
    expect(textDisplayer.appendSpy).toHaveBeenCalledWith([mp4CeaCue0]);
  });

  it('extracts ID3 metadata from TS', async () => {
    metadata = shaka.test.TestScheme.DATA['id3-metadata_ts'];
    generators = shaka.test.TestScheme.GENERATORS['id3-metadata_ts'];

    const audioType = ContentType.AUDIO;
    const initObject = new Map();
    initObject.set(audioType, getFakeStream(metadata.audio));
    await mediaSourceEngine.init(initObject);
    await append(ContentType.AUDIO, 0);

    expect(onMetadata).toHaveBeenCalled();
  });

  it('extracts ID3 metadata from TS when transmuxing', async () => {
    metadata = shaka.test.TestScheme.DATA['id3-metadata_ts'];
    generators = shaka.test.TestScheme.GENERATORS['id3-metadata_ts'];

    const audioType = ContentType.AUDIO;
    const initObject = new Map();
    initObject.set(audioType, getFakeStream(metadata.audio));
    const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
    config.forceTransmux = true;
    mediaSourceEngine.configure(config);
    await mediaSourceEngine.init(initObject);
    await append(ContentType.AUDIO, 0);

    expect(onMetadata).toHaveBeenCalled();
  });

  it('extracts ID3 metadata from AAC', async () => {
    if (!MediaSource.isTypeSupported('audio/aac') ||
        !shaka.util.Platform.supportsSequenceMode()) {
      pending('Raw AAC codec is not supported by the platform.');
    }
    metadata = shaka.test.TestScheme.DATA['id3-metadata_aac'];
    generators = shaka.test.TestScheme.GENERATORS['id3-metadata_aac'];

    const audioType = ContentType.AUDIO;
    const initObject = new Map();
    initObject.set(audioType, getFakeStream(metadata.audio));
    await mediaSourceEngine.init(initObject, /* sequenceMode= */ true);
    await append(ContentType.AUDIO, 0);

    expect(onMetadata).toHaveBeenCalled();
  });

  it('extracts ID3 metadata from AAC when transmuxing', async () => {
    if (!MediaSource.isTypeSupported('audio/aac')) {
      pending('Raw AAC codec is not supported by the platform.');
    }
    metadata = shaka.test.TestScheme.DATA['id3-metadata_aac'];
    generators = shaka.test.TestScheme.GENERATORS['id3-metadata_aac'];

    const audioType = ContentType.AUDIO;
    const initObject = new Map();
    initObject.set(audioType, getFakeStream(metadata.audio));
    const config = shaka.util.PlayerConfiguration.createDefault().mediaSource;
    config.forceTransmux = true;
    mediaSourceEngine.configure(config);
    await mediaSourceEngine.init(initObject);
    await append(ContentType.AUDIO, 0);

    expect(onMetadata).toHaveBeenCalled();
  });
});
