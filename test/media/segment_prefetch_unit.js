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
      // since 2 was already pre-fetched when prefetch 1, expect
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

      // When an evict is made and there are no segments, the init segment
      // must be kept.
      segmentPrefetch.evict(1000);

      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(references[i]);
        expect(op).toBeNull();
      }

      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(
            references[i].initSegmentReference);
        expect(op).not.toBeNull();
      }
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

    it('does not reuse failed prefetches', async () => {
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.BAD_HTTP_STATUS);
      fetchDispatcher.and.callFake(() => {
        return new shaka.net.NetworkingEngine.PendingRequest(
            Promise.reject(error), () => Promise.resolve(),
            new shaka.net.NetworkingEngine.NumBytesRemainingClass());
      });

      const reference = makeReference(uri('0.10'), 0, 10);
      const initReference =
          new shaka.media.InitSegmentReference(() => ['init.mp4'], 0, 500);
      reference.initSegmentReference = initReference;
      stream = createStream();
      stream.segmentIndex = new shaka.media.SegmentIndex([reference]);
      segmentPrefetch.switchStream(stream);

      await expectAsync(
          segmentPrefetch.prefetchSegmentsByTime(reference.startTime))
          .toBeRejectedWith(error);

      // They are fetched again when they are needed, instead of reusing the
      // failures.
      expect(segmentPrefetch.getPrefetchedSegment(reference)).toBeNull();
      expect(segmentPrefetch.getPrefetchedSegment(initReference)).toBeNull();
    });

    // https://github.com/shaka-project/shaka-player/issues/11067
    it('does not prefetch a segment again with a new reference', () => {
      stream.segmentIndex =
          new shaka.media.SegmentIndex([references[0], references[1]]);
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      expect(fetchDispatcher).toHaveBeenCalledTimes(2);

      // A manifest update creates new references for the same segments.
      const updated = [
        makeReference(uri('0.10'), 0, 10),
        makeReference(uri('10.20'), 10, 20),
        references[2],
      ];
      stream.segmentIndex = new shaka.media.SegmentIndex(updated);
      segmentPrefetch.resetPosition();
      segmentPrefetch.prefetchSegmentsByTime(updated[0].startTime);

      // Only the new segment is fetched.
      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
      expect(fetchDispatcher.calls.mostRecent().args[0]).toBe(references[2]);
      for (const reference of updated) {
        expect(segmentPrefetch.getPrefetchedSegment(reference)).not.toBeNull();
      }
      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
    });

    it('reuses a prefetch for a new reference of the segment', async () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      const op = segmentPrefetch.getPrefetchedSegment(references[1]);
      expect(op).not.toBeNull();

      const newReference = makeReference(uri('10.20'), 10, 20);
      expect(segmentPrefetch.getPrefetchedSegment(newReference)).toBe(op);
      // The prefetch now belongs to the new reference.
      expect(segmentPrefetch.getPrefetchedSegment(references[1])).toBe(op);
      expect(fetchDispatcher).toHaveBeenCalledTimes(3);
      await expectSegmentsPrefetched(0);
    });

    it('does not reuse a prefetch of another byte range', () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);

      const otherRange = new shaka.media.SegmentReference(
          10, 20, () => [uri('10.20')],
          /* startByte= */ 100, /* endByte= */ 199,
          /* initSegmentReference= */ null,
          /* timestampOffset= */ 0,
          /* appendWindowStart= */ 0,
          /* appendWindowEnd= */ Infinity);
      expect(segmentPrefetch.getPrefetchedSegment(otherRange)).toBeNull();
    });

    it('does not reuse a prefetch of the same URI at another time', () => {
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      const op = segmentPrefetch.getPrefetchedSegment(references[1]);

      const sameUriLater = makeReference(uri('10.20'), 50, 60);
      expect(segmentPrefetch.getPrefetchedSegment(sameUriLater)).toBeNull();
      // The original reference keeps its prefetch.
      expect(segmentPrefetch.getPrefetchedSegment(references[1])).toBe(op);
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

    it('keeps init segments when clearInitSegments is false', async () => {
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

      await segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      // 3 media segments + 3 init segments.
      expect(fetchDispatcher).toHaveBeenCalledTimes(6);

      segmentPrefetch.clearAll(/* clearInitSegments= */ false);

      for (let i = 0; i < 3; i++) {
        // Verify media segments are gone.
        expect(segmentPrefetch.getPrefetchedSegment(references[i])).toBeNull();
      }
      // Verify init segments are kept.
      for (let i = 0; i < 3; i++) {
        const op = segmentPrefetch.getPrefetchedSegment(
            references[i].initSegmentReference);
        expect(op).not.toBeNull();
      }

      await segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);

      expect(fetchDispatcher).toHaveBeenCalledTimes(9);
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

  describe('with a limit of 1 and overlapping segments', () => {
    // A period boundary where the last segment of a period ends a few ms after
    // the next one starts (seen with AAC audio at ad boundaries): 10-20.004
    // overlaps 20-30 by 4 ms.
    const overlapping = [
      makeReference(uri('0.10'), 0, 10),
      makeReference(uri('10.20'), 10, 20.004),
      makeReference(uri('20.30'), 20, 30),
      makeReference(uri('30.40'), 30, 40),
      makeReference(uri('40.50'), 40, 50),
      makeReference(uri('50.60'), 50, 60),
    ];
    const aligned = [
      makeReference(uri('0.10'), 0, 10),
      makeReference(uri('10.20'), 10, 20),
      makeReference(uri('20.30'), 20, 30),
      makeReference(uri('30.40'), 30, 40),
      makeReference(uri('40.50'), 40, 50),
      makeReference(uri('50.60'), 50, 60),
    ];

    /**
     * Plays the references one by one as StreamingEngine.fetchAndAppend_ does:
     * evict(start + 0.001), prefetchSegmentsByTime(start), then take the
     * segment from the prefetch map, or fetch it directly on a miss.
     *
     * @param {!Array<!shaka.media.SegmentReference>} refs
     * @return {{downloads: !Array<string>, misses: !Array<string>}}
     */
    function playLikeStreamingEngine(refs) {
      stream.segmentIndex = new shaka.media.SegmentIndex(refs);
      segmentPrefetch = new shaka.media.SegmentPrefetch(
          1, stream, Util.spyFunc(fetchDispatcher), /* reverse= */ false);
      const misses = [];
      for (const ref of refs) {
        const fudgeTime = 0.001;
        segmentPrefetch.evict(ref.startTime + fudgeTime);
        segmentPrefetch.prefetchSegmentsByTime(ref.startTime);
        if (!segmentPrefetch.getPrefetchedSegment(ref)) {
          misses.push(ref.getUris()[0]);  // StreamingEngine fetches it itself
        }
      }
      const prefetched = fetchDispatcher.calls.allArgs()
          .map((args) => args[0].getUris()[0]);
      return {downloads: prefetched.concat(misses), misses};
    }

    /**
     * @param {!Array<string>} downloads
     * @return {!Array<string>} the URIs downloaded more than once
     */
    function twice(downloads) {
      const seen = new Set();
      return downloads.filter((u) => {
        if (seen.has(u)) {
          return true;
        }
        seen.add(u);
        return false;
      });
    }

    it('uses every prefetched segment when segments are aligned', () => {
      const {downloads, misses} = playLikeStreamingEngine(aligned);
      expect(misses).toEqual([]);
      expect(twice(downloads)).toEqual([]);
      expect(downloads.length).toBe(aligned.length);
    });

    it('downloads each segment once across an overlapping boundary', () => {
      const {downloads} = playLikeStreamingEngine(overlapping);
      expect(twice(downloads)).toEqual([]);
      expect(downloads.length).toBe(overlapping.length);
    });

    it('re-syncs with StreamingEngine after an overlapping boundary', () => {
      const {misses} = playLikeStreamingEngine(overlapping);
      expect(misses).not.toContain(uri('30.40'));
      expect(misses).not.toContain(uri('40.50'));
      expect(misses).not.toContain(uri('50.60'));
      expect(misses.length).toBeLessThanOrEqual(1);
    });
  });  // with a limit of 1 and overlapping segments

  describe('stream data', () => {
    /** @type {?function(BufferSource):!Promise} */
    let dispatchedCallback;
    /** @type {function(shaka.extern.Response)} */
    let resolveResponse;
    /** @type {!jasmine.Spy} */
    let streamDataCallback;

    beforeEach(() => {
      dispatchedCallback = null;
      streamDataCallback =
          jasmine.createSpy('streamDataCallback').and.resolveTo();
      fetchDispatcher.and.callFake((ref, stream, callback) => {
        dispatchedCallback = callback || null;
        const response = new Promise((resolve) => {
          resolveResponse = resolve;
        });
        return new shaka.net.NetworkingEngine.PendingRequest(
            response, () => Promise.resolve(),
            new shaka.net.NetworkingEngine.NumBytesRemainingClass());
      });
      segmentPrefetch = new shaka.media.SegmentPrefetch(
          1, stream, Util.spyFunc(fetchDispatcher), /* reverse= */ false);
      segmentPrefetch.prefetchSegmentsByTime(references[0].startTime);
      expect(dispatchedCallback).not.toBeNull();
    });

    it('passes chunks buffered before the callback was set', async () => {
      await dispatchedCallback(new Uint8Array([1, 2]));
      segmentPrefetch.getPrefetchedSegment(
          references[0], Util.spyFunc(streamDataCallback));
      await dispatchedCallback(new Uint8Array([3]));

      expect(streamDataCallback).toHaveBeenCalledOnceWith(
          new Uint8Array([1, 2, 3]));
    });

    it('drops buffered chunks once the request is done', async () => {
      await dispatchedCallback(new Uint8Array([1, 2]));
      resolveResponse(/** @type {shaka.extern.Response} */ ({
        uri: references[0].getUris()[0],
        data: new Uint8Array([1, 2]),
        headers: {},
      }));
      await shaka.test.Util.shortDelay();

      // The full response is used instead of the stream data, so the chunks
      // are never passed on.
      const op = segmentPrefetch.getPrefetchedSegment(
          references[0], Util.spyFunc(streamDataCallback));
      const result = await op.promise;
      expect(result.data).toEqual(new Uint8Array([1, 2]));
      expect(streamDataCallback).not.toHaveBeenCalled();
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
   * @return {!shaka.media.SegmentReference}
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
