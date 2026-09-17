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

  describe('a session the server hangs up on', () => {
    /** @type {?} */
    let realTransport;

    beforeEach(() => {
      // A namespace in the configuration is what sends the parser straight to
      // the catalog subscription instead of waiting for an announcement.
      config.msf.namespaces = ['msf', 'clear'];
      parser.configure(config);
      realTransport = shaka.msf['MSFTransport'];
    });

    afterEach(() => {
      shaka.msf['MSFTransport'] = realTransport;
    });

    /**
     * A transport whose session ends with the given reason while the catalog
     * subscription is still waiting for an answer, which is what a server
     * that rejects something the client sent looks like from here.
     *
     * @param {string} reason
     */
    function transportThatEnds(reason) {
      shaka.msf['MSFTransport'] = class {
        /** @return {!Promise} */
        connect() {
          return Promise.resolve({});
        }

        /**
         * The subscription dies with the session, but its WebTransport error
         * says nothing about why; the session's reason does.
         *
         * @return {!Promise}
         */
        subscribeTrack() {
          return new Promise(() => {});
        }

        /** @return {!Promise<string>} */
        waitForSessionEnd() {
          return Promise.resolve(reason);
        }

        /** */
        configure() {}

        /** */
        release() {}
      };
    }

    it('reports why the session ended instead of a catalog timeout',
        async () => {
          const reason = 'WebTransportError: Connection lost.';
          transportThatEnds(reason);

          const expected = shaka.test.Util.jasmineError(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.MSF_CONNECTION_CLOSED,
              reason));

          await expectAsync(parser.start('moqt://relay.example/live',
              playerInterface)).toBeRejectedWith(expected);
        });
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

  describe('catalog logging', () => {
    /**
     * processCatalog_ writes the presentation timeline, which start() would
     * normally have created.
     * @suppress {visibility}
     */
    function givenAStartedParser() {
      parser.presentationTimeline_ = new shaka.msf.MSFPresentationTimeline();
    }

    /**
     * @param {msfCatalog.Catalog} catalog
     * @return {!Promise}
     * @suppress {visibility}
     */
    function processCatalog(catalog) {
      return parser.processCatalog_(catalog);
    }

    /**
     * @return {msfCatalog.Catalog}
     */
    function catalogWithTwoTracks() {
      return /** @type {msfCatalog.Catalog} */ ({
        version: 1,
        tracks: [
          {name: 'video_cmaf', packaging: 'cmaf', codec: 'avc3.4d401f',
            isLive: true},
          {name: 'video_locmaf', packaging: 'locmaf', codec: 'avc3.4d401f',
            locmafVersion: '0.3', isLive: true},
        ],
      });
    }

    it('logs the catalog as it arrived, not as the preprocessor left it',
        async () => {
          // A console keeps a logged object by reference and renders it when
          // it is expanded, so logging the catalog before and after an
          // in-place preprocessor used to show the processed one twice. What
          // reproduces that is inspecting the logged value afterwards, which
          // is what expanding it in a console does.
          const logged = [];
          spyOn(shaka.log, 'info').and.callFake((...args) => {
            logged.push(args);
          });

          config.msf.catalogPreprocessor = (catalog) => {
            catalog.tracks = catalog.tracks.filter(
                (track) => track.packaging == 'locmaf');
          };
          parser.configure(config);

          givenAStartedParser();
          const catalog = catalogWithTwoTracks();
          await processCatalog(catalog);

          const before = logged.find((args) => args[0] == 'MSF Catalog:');
          const after = logged.find(
              (args) => args[0] == 'MSF Catalog after preprocessor:');
          expect(before).toBeDefined();
          expect(after).toBeDefined();

          expect(before[1].tracks.length).toBe(2);
          expect(before[1].tracks.map((t) => t.name))
              .toEqual(['video_cmaf', 'video_locmaf']);
          expect(after[1].tracks.length).toBe(1);
          // The two lines must not be the same object, or the first would
          // change under the reader's feet.
          expect(before[1]).not.toBe(after[1]);
          expect(after[1]).toBe(catalog);
        });

    it('logs only the arrived catalog when no preprocessor is configured',
        async () => {
          const logged = [];
          spyOn(shaka.log, 'info').and.callFake((...args) => {
            logged.push(args);
          });

          givenAStartedParser();
          const catalog = catalogWithTwoTracks();
          await processCatalog(catalog);

          const before = logged.find((args) => args[0] == 'MSF Catalog:');
          expect(before).toBeDefined();
          expect(before[1]).toEqual(catalog);
          expect(logged.some(
              (args) => args[0] == 'MSF Catalog after preprocessor:'))
              .toBe(false);
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
