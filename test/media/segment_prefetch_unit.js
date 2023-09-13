/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


describe('SegmentPrefetch', () => {
  const Util = shaka.test.Util;
  /** @type {shaka.media.SegmentPrefetch} */
  let segmentPrefetch;

  /** @type {!jasmine.Spy} */
  let fetchDispatcher;

  /** @type {jasmine.Spy} */
  let pendingRequestAbort;

  /** @type {shaka.extern.Stream} */
  let stream;

  const references = [
    makeReference(uri('0.10'), 0, 10),
    makeReference(uri('10.20'), 10, 20),
    makeReference(uri('20.30'), 20, 30),
    makeReference(uri('30.40'), 30, 40),
  ];

  beforeEach(() => {
    pendingRequestAbort =
      jasmine.createSpy('abort').and.returnValue(Promise.resolve());
    const pendingRequestAbortFunc = Util.spyFunc(pendingRequestAbort);
    const bytes = new shaka.net.NetworkingEngine.NumBytesRemainingClass();
    bytes.setBytes(200);
    stream = createStream();
    stream.segmentIndex = new shaka.media.SegmentIndex(references);
    fetchDispatcher = jasmine.createSpy('appendBuffer')
        .and.callFake((ref, stream) =>
          new shaka.net.NetworkingEngine.PendingRequest(
              Promise.resolve({
                uri: ref.getUris()[0],
                data: new ArrayBuffer(0),
                headers: {},
              }),
              pendingRequestAbortFunc,
              bytes,
          ),
        );
    segmentPrefetch = new shaka.media.SegmentPrefetch(
        3, stream, Util.spyFunc(fetchDispatcher),
    );
  });

  describe('prefetchSegments', () => {
    it('should prefetch next 3 segments', async () => {
      segmentPrefetch.prefetchSegments(references[0]);
      await expectSegmentsPrefetched(0);
      const op = segmentPrefetch.getPrefetchedSegment(references[3]);
      expect(op).toBeNull();
      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
    });

    it('prefetch last segment if position is at the end', async () => {
      segmentPrefetch.prefetchSegments(references[3]);
      const op = segmentPrefetch.getPrefetchedSegment(references[3]);
      expect(op).toBeDefined();
      const response = await op.promise;
      const startTime = (3 * 10);
      expect(response.uri).toBe(uri(startTime + '.' + (startTime + 10)));

      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }
      expect(fetchDispatcher).toHaveBeenCalledTimes(1);
    });

    it('do not prefetch already fetched segment', async () => {
      segmentPrefetch.prefetchSegments(references[1]);
      // since 2 was alreay pre-fetched when prefetch 1, expect
      // no extra fetch is made.
      segmentPrefetch.prefetchSegments(references[2]);

      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
      await expectSegmentsPrefetched(1);
    });
  });

  describe('clearAll', () => {
    it('clears all prefetched segments', () => {
      segmentPrefetch.prefetchSegments(references[0]);
      segmentPrefetch.clearAll();
      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }
      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
    });

    it('resets time pos so prefetch can happen again', () => {
      segmentPrefetch.prefetchSegments(references[3]);
      segmentPrefetch.clearAll();
      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }

      segmentPrefetch.prefetchSegments(references[3]);
      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }
      expect(segmentPrefetch.getPrefetchedSegment(references[3])).toBeDefined();
      expect(fetchDispatcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('switchStream', () => {
    it('clears all prefetched segments', () => {
      segmentPrefetch.prefetchSegments(references[0]);
      segmentPrefetch.switchStream(createStream());
      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }
      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
    });

    it('do nothing if its same stream', async () => {
      segmentPrefetch.prefetchSegments(references[0]);
      segmentPrefetch.switchStream(stream);
      await expectSegmentsPrefetched(0);
    });
  });

  describe('resetLimit', () => {
    it('do nothing if the new limit is larger', async () => {
      segmentPrefetch.prefetchSegments(references[0]);
      segmentPrefetch.resetLimit(4);
      await expectSegmentsPrefetched(0);
    });

    it('do nothing if the new limit is the same', async () => {
      segmentPrefetch.prefetchSegments(references[0]);
      segmentPrefetch.resetLimit(3);
      await expectSegmentsPrefetched(0);
    });

    it('clears all prefetched segments beyond new limit', async () => {
      segmentPrefetch.prefetchSegments(references[0]);
      segmentPrefetch.resetLimit(1);
      // expecting prefetched reference 0 is kept
      expectSegmentsPrefetched(0, 1);
      // expecting prefetched references 1 and 2 are removd
      for (let i = 1; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }

      // clear all to test the new limit by re-fetching.
      segmentPrefetch.clearAll();
      // prefetch again.
      segmentPrefetch.prefetchSegments(references[0]);
      // expect only one is prefetched
      await expectSegmentsPrefetched(0, 1);
      // only dispatched fetch one more time.
      expect(fetchDispatcher).toHaveBeenCalledTimes(3 + 1);
    });
  });
  /**
   * Creates a URI string.
   *
   * @param {string} x
   * @return {string}
   */
  function uri(x) {
    return 'http://example.com/video_' + x + '.m4s';
  }

  /**
   * Creates a real SegmentReference.
   *
   * @param {string} uri
   * @param {number} startTime
   * @param {number} endTime
   * @return {shaka.media.SegmentReference}
   */
  function makeReference(uri, startTime, endTime) {
    return new shaka.media.SegmentReference(
        startTime,
        endTime,
        /* getUris= */ () => [uri],
        /* startByte= */ 0,
        /* endByte= */ null,
        /* initSegmentReference= */ null,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity,
        /* partialReferences= */ [],
        /* tilesLayout= */ undefined,
        /* tileDuration= */ undefined,
        /* syncTime= */ undefined,
        /* status= */ undefined,
        /* aes128Key= */ null);
  }

  /**
   * Creates a stream.
   * @return {shaka.extern.Stream}
   */
  function createStream() {
    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.presentationTimeline.setDuration(60);
      manifest.addVariant(0, (variant) => {
        variant.addVideo(11, (stream) => {
          stream.useSegmentTemplate('video-11-%d.mp4', 10);
        });
      });
    });

    const videoStream = manifest.variants[0].video;
    if (!videoStream) {
      throw new Error('unexpected stream setup - variant.video is null');
    }
    return videoStream;
  }

  /**
   * Expects segments have been prefetched within given range.
   * @param {number} startPos
   * @param {number} limit
   */
  async function expectSegmentsPrefetched(startPos, limit = 3) {
    for (let i = startPos; i < startPos + limit; i++) {
      const op = segmentPrefetch.getPrefetchedSegment(references[i]);
      expect(op).not.toBeNull();
      /* eslint-disable-next-line no-await-in-loop */
      const response = await op.promise;
      const startTime = (i * 10);
      expect(response.uri).toBe(uri(startTime + '.' + (startTime + 10)));
    }
  }
});
