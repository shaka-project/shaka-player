filterDescribe('shaka.msf.MSFParser', isMSFSupported, () => {
  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.msf.MSFParser} */
  let parser;
  /** @type {!jasmine.Spy} */
  let onEventSpy;
  /** @type {!jasmine.Spy} */
  let newDrmInfoSpy;
  /** @type {!jasmine.Spy} */
  let onMetadataSpy;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;
  /** @type {shaka.extern.ManifestConfiguration} */
  let config;

  afterEach(() => {
    parser.stop();
  });

  beforeEach(() => {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();

    const dConfig = shaka.util.PlayerConfiguration.createDefault();
    config = dConfig.manifest;
    onEventSpy = jasmine.createSpy('onEvent');
    newDrmInfoSpy = jasmine.createSpy('newDrmInfo');
    onMetadataSpy = jasmine.createSpy('onMetadata');
    playerInterface = {
      modifyManifestRequest: (request, manifestInfo) => {},
      modifySegmentRequest: (request, segmentInfo) => {},
      filter: () => Promise.resolve(),
      makeTextStreamsForClosedCaptions: (manifest) => {},
      networkingEngine: fakeNetEngine,
      onError: fail,
      onEvent: shaka.test.Util.spyFunc(onEventSpy),
      onTimelineRegionAdded: fail,
      isLowLatencyMode: () => false,
      updateDuration: () => {},
      newDrmInfo: shaka.test.Util.spyFunc(newDrmInfoSpy),
      onManifestUpdated: () => {},
      getBandwidthEstimate: () => 1e6,
      onMetadata: shaka.test.Util.spyFunc(onMetadataSpy),
      disableStream: (stream) => {},
      addFont: (name, url) => {},
      getStreamingRetryParameters: () => dConfig.streaming.retryParameters,
      onSegmentReceived: (deltaTimeMs, numBytes) => {},
    };

    parser = new shaka.msf.MSFParser();
    parser.configure(config);
  });

  describe('accessibility descriptors', () => {
    /**
     * @param {!Array<!Object>} accessibility
     * @return {msfCatalog.Track}
     */
    function videoTrack(accessibility) {
      return /** @type {msfCatalog.Track} */ ({
        name: 'video0',
        packaging: 'loc',
        codec: 'avc3.4d401f',
        role: 'video',
        framerate: 25,
        width: 1280,
        height: 720,
        isLive: true,
        accessibility,
      });
    }

    /**
     * @param {msfCatalog.Track} track
     * @return {Map<string, string>}
     * @suppress {visibility}
     */
    function closedCaptionsOf(track) {
      parser.processTrack_(track, new Map(), new Map());
      const streams = parser.videoStreams_;
      return streams.length ? streams[0].closedCaptions : null;
    }

    it('reads CEA-608 captions from the scheme field', () => {
      // draft-ietf-moq-msf-01 5.2.44 names the field 'scheme'.  Reading the
      // DASH spelling 'schemeIdUri'/'schemeId' instead left this map empty
      // for every conforming catalog, so embedded captions were advertised
      // by the publisher and never exposed by the player.
      const captions = closedCaptionsOf(videoTrack([{
        scheme: 'urn:scte:dash:cc:cea-608:2015',
        value: 'CC1=eng',
      }]));

      expect(captions).not.toBeNull();
      expect(captions.get('CC1')).toBe('en');
    });

    it('reads CEA-708 captions from the scheme field', () => {
      const captions = closedCaptionsOf(videoTrack([{
        scheme: 'urn:scte:dash:cc:cea-708:2015',
        value: '1=lang:eng',
      }]));

      expect(captions).not.toBeNull();
      expect(captions.size).toBe(1);
    });

    it('ignores an unknown scheme', () => {
      const captions = closedCaptionsOf(videoTrack([{
        scheme: 'urn:example:something-else',
        value: 'CC1=eng',
      }]));

      expect(captions).not.toBeNull();
      expect(captions.size).toBe(0);
    });

    it('tolerates a track with no accessibility at all', () => {
      const track = videoTrack([]);
      delete track['accessibility'];

      const captions = closedCaptionsOf(track);
      expect(captions).not.toBeNull();
      expect(captions.size).toBe(0);
    });
  });

  describe('segment index lifecycle', () => {
    const PACKAGING = 'fake-for-test';

    /** @type {!Array<!shaka.extern.MsfSegment>} */
    let nextSegments;
    /** @type {!Array<{resolve: function(bigint)}>} */
    let pendingSubscribes;
    /** @type {!Array<shaka.extern.MsfObjectCallback>} */
    let objectCallbacks;
    /** @type {!jasmine.Spy} */
    let unsubscribeSpy;

    /**
     * @return {!shaka.extern.MsfSegment}
     */
    function fakeSegment() {
      return {
        startTime: 0,
        duration: 1,
        data: new Uint8Array([0x01]),
        timestampOffset: 0,
        discontinuitySequence: 0,
      };
    }

    /**
     * @param {number} group
     * @return {!shaka.extern.MsfObject}
     */
    function fakeObject(group) {
      return /** @type {!shaka.extern.MsfObject} */ (/** @type {?} */ ({
        trackAlias: BigInt(7),
        location: {group: BigInt(group), object: BigInt(0), subgroup: null},
        data: new Uint8Array([0x01, 0x02]),
        payloadReadStartMs: 0,
        receiveTimestampMs: 10,
      }));
    }

    /**
     * Creates the one stream of a catalog holding a single video track.
     *
     * @return {!shaka.extern.Stream}
     * @suppress {visibility}
     */
    function makeStream() {
      parser.playerInterface_ = playerInterface;
      parser.presentationTimeline_ = new shaka.msf.MSFPresentationTimeline();
      parser.msfTransport_ = /** @type {!shaka.msf.MSFTransport} */ (
        /** @type {?} */ ({
          getCodec: () => null,
          subscribeTrack: (namespace, trackName, callback) => {
            objectCallbacks.push(callback);
            return new Promise((resolve) => {
              pendingSubscribes.push({resolve});
            });
          },
          unsubscribeTrack: shaka.test.Util.spyFunc(unsubscribeSpy),
          release: () => {},
        }));

      parser.processTrack_(/** @type {msfCatalog.Track} */ ({
        name: 'video0',
        packaging: PACKAGING,
        codec: 'avc3.4d401f',
        role: 'video',
        framerate: 25,
        width: 1280,
        height: 720,
        isLive: true,
      }), new Map(), new Map());

      expect(parser.videoStreams_.length).toBe(1);
      return parser.videoStreams_[0];
    }

    beforeEach(() => {
      nextSegments = [];
      pendingSubscribes = [];
      objectCallbacks = [];
      unsubscribeSpy = jasmine.createSpy('unsubscribeTrack')
          .and.returnValue(Promise.resolve());

      shaka.msf.PackagingRegistry.registerPackaging(PACKAGING, () => {
        return /** @type {!shaka.extern.MsfPackaging} */ (/** @type {?} */ ({
          describeTrack: () => ({
            basicInfo: /** @type {?} */ ({
              mimeType: 'video/mp4',
              codecs: 'avc1.4d401f',
            }),
            initSegmentReference: null,
          }),
          createSegmenter: () => ({push: () => nextSegments}),
        }));
      });
    });

    afterEach(() => {
      shaka.msf.PackagingRegistry.unregisterPackaging(PACKAGING);
    });

    it('stops adding segments when the index closes mid-object', () => {
      // Reporting a completed group to ABR can pick a new variant and switch
      // to it synchronously, and StreamingEngine closes the outgoing stream's
      // segment index on its way through. That lands in the middle of this
      // object's segments, so the index has to be re-checked for each one.
      const stream = makeStream();
      stream.createSegmentIndex();
      const callback = objectCallbacks[0];

      playerInterface.onSegmentReceived = () => {
        stream.closeSegmentIndex();
      };

      nextSegments = [fakeSegment(), fakeSegment()];
      // The first object opens a group; the second closes it, which is what
      // reports to ABR.
      callback(fakeObject(0));
      expect(() => callback(fakeObject(1))).not.toThrow();
      expect(stream.segmentIndex).toBeNull();
    });

    it('withdraws a subscription that closed before SUBSCRIBE_OK', async () => {
      // Until the SUBSCRIBE_OK lands there is no Track Alias, so there is
      // nothing to unsubscribe with. A track closed in that window used to be
      // left subscribed for the rest of the session, with the publisher
      // sending objects nobody listened to.
      const stream = makeStream();
      stream.createSegmentIndex();
      stream.closeSegmentIndex();

      expect(unsubscribeSpy).not.toHaveBeenCalled();

      pendingSubscribes[0].resolve(BigInt(7));
      await shaka.test.Util.shortDelay();

      expect(unsubscribeSpy).toHaveBeenCalledWith(BigInt(7));
    });

    it('keeps a subscription that is still open when SUBSCRIBE_OK lands',
        async () => {
          const stream = makeStream();
          stream.createSegmentIndex();

          pendingSubscribes[0].resolve(BigInt(7));
          await shaka.test.Util.shortDelay();

          expect(unsubscribeSpy).not.toHaveBeenCalled();

          stream.closeSegmentIndex();
          expect(unsubscribeSpy).toHaveBeenCalledWith(BigInt(7));
        });
  });

  it('fails when WebTransport is not available', async () => {
    let originalWebTransport = null;
    try {
      originalWebTransport = window.WebTransport;
      if (originalWebTransport) {
        Object.defineProperty(window, 'WebTransport', {
          configurable: true,
          value: null,
        });
      }

      const expectedError = shaka.test.Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.WEBTRANSPORT_NOT_AVAILABLE));
      await expectAsync(parser.start('test:/msf', playerInterface))
          .toBeRejectedWith(expectedError);
    } finally {
      if (originalWebTransport) {
        Object.defineProperty(window, 'WebTransport', {
          configurable: true,
          value: originalWebTransport,
        });
      }
    }
  });
});
