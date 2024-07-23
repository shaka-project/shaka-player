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
        3, stream, Util.spyFunc(fetchDispatcher), /* reverse= */ false);
  });

  describe('prefetchSegmentsByTime', () => {
    it('should prefetch next 3 segments', async () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      await expectSegmentsPrefetched(0);
      const op = segmentPrefetch.getPrefetchedSegment(references[3]);
      expect(op).toBeNull();
      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
    });

    it('prefetch last segment if position is at the end', async () => {
      segmentPrefetch.prefetchSegmentsByTime(references[3].startTime);
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
      segmentPrefetch.prefetchSegmentsByTime(references[1].startTime);
      // since 2 was alreay pre-fetched when prefetch 1, expect
      // no extra fetch is made.
      segmentPrefetch.prefetchSegmentsByTime(references[2].startTime);

      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
      await expectSegmentsPrefetched(1);
    });

    it('does prefetch init segment', async () => {
      const references = [
        makeReference(uri('0.10'), 0, 10),
        makeReference(uri('10.20'), 10, 20),
        makeReference(uri('20.30'), 20, 30),
        makeReference(uri('30.40'), 30, 40),
      ];
      references[0].initSegmentReference =
          new shaka.media.InitSegmentReference(() => ['init-0.mp4'], 0, 500);
      references[1].initSegmentReference =
          new shaka.media.InitSegmentReference(() => ['init-1.mp4'], 0, 500);
      references[2].initSegmentReference =
          new shaka.media.InitSegmentReference(() => ['init-2.mp4'], 0, 500);
      references[3].initSegmentReference =
          new shaka.media.InitSegmentReference(() => ['init-3.mp4'], 0, 500);

      stream = createStream();
      stream.segmentIndex = new shaka.media.SegmentIndex(references);
      segmentPrefetch.switchStream(stream);

      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);

      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).not.toBeNull();
        /* eslint-disable-next-line no-await-in-loop */
        const response = await op.promise;
        const startTime = (i * 10);
        expect(response.uri).toBe(uri(startTime + '.' + (startTime + 10)));
      }

      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(
            references[i].initSegmentReference);
        expect(op).not.toBeNull();
      }
      // this is 6 to account for the init segments,
      // which is not part of the prefetch limit
      expect(fetchDispatcher).toHaveBeenCalledTimes(6);
    });

    it('changes fetch direction', async () => {
      segmentPrefetch.setReverse(true);
      segmentPrefetch.prefetchSegmentsByTime(references[3].startTime);
      const op = segmentPrefetch.getPrefetchedSegment(references[0]);
      expect(op).toBeNull();
      await expectSegmentsPrefetched(1);
    });

    it('properly iterates on subsequent prefetchSegments calls', async () => {
      segmentPrefetch.resetLimit(1);
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      let op = segmentPrefetch.getPrefetchedSegment(references[1]);
      expect(op).toBeNull();
      await expectSegmentsPrefetched(0, 1);

      // Evict our only one prefetched segment.
      segmentPrefetch.evict(references[1].endTime);
      op = segmentPrefetch.getPrefetchedSegment(references[0]);
      expect(op).toBeNull();

      // Underlying iterator should traverse to next element, regardless
      // of specified time.
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      op = segmentPrefetch.getPrefetchedSegment(references[0]);
      expect(op).toBeNull();
      await expectSegmentsPrefetched(1, 1);
    });
  });

  describe('clearAll', () => {
    it('clears all prefetched segments', () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      segmentPrefetch.clearAll();
      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }
      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
    });

    it('resets time pos so prefetch can happen again', () => {
      segmentPrefetch.prefetchSegmentsByTime(references[3].startTime);
      segmentPrefetch.clearAll();
      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }

      segmentPrefetch.prefetchSegmentsByTime(references[3].startTime);
      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }
      expect(segmentPrefetch.getPrefetchedSegment(references[3])).toBeDefined();
      expect(fetchDispatcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('evict', () => {
    it('does not evict a segment that straddles the given time', async () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      segmentPrefetch.evict(5);
      await expectSegmentsPrefetched(0);
      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeDefined();
        // eslint-disable-next-line no-await-in-loop
        const response = await op.promise;
        const startTime = (i * 10);
        expect(response.uri).toBe(uri(startTime + '.' + (startTime + 10)));
      }

      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
    });

    it('segments that end before the provided time', async () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      segmentPrefetch.evict(21);
      for (let i = 0; i < 2; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }
      await expectSegmentsPrefetched(2, 1);
      const op = segmentPrefetch.getPrefetchedSegment(references[2]);
      expect(op).toBeDefined();
      const response = await op.promise;
      const startTime = (2 * 10);
      expect(response.uri).toBe(uri(startTime + '.' + (startTime + 10)));
      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
    });

    it('all prefetched segments, if all before given time', () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      segmentPrefetch.evict(40);
      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }
      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
    });
  });

  describe('switchStream', () => {
    it('clears all prefetched segments', () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      segmentPrefetch.switchStream(createStream());
      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }
      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
    });

    it('do nothing if its same stream', async () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      segmentPrefetch.switchStream(stream);
      await expectSegmentsPrefetched(0);
    });
  });

  describe('resetLimit', () => {
    it('do nothing if the new limit is larger', async () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      segmentPrefetch.resetLimit(4);
      await expectSegmentsPrefetched(0);
    });

    it('do nothing if the new limit is the same', async () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      segmentPrefetch.resetLimit(3);
      await expectSegmentsPrefetched(0);
    });

    it('clears all prefetched segments beyond new limit', async () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      segmentPrefetch.resetLimit(1);
      // expecting prefetched reference 0 is kept
      await expectSegmentsPrefetched(0, 1);
      // expecting prefetched references 1 and 2 are removed
      for (let i = 1; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }

      // clear all to test the new limit by re-fetching.
      segmentPrefetch.clearAll();
      // prefetch again.
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
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
        /* aesKey= */ null);
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
