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

    it('logs the catalog itself when no preprocessor is configured',
        async () => {
          // With nothing to mutate it, copying would be waste: a silenced
          // shaka.log.info still evaluates its arguments.
          const logged = [];
          spyOn(shaka.log, 'info').and.callFake((...args) => {
            logged.push(args);
          });

          givenAStartedParser();
          const catalog = catalogWithTwoTracks();
          await processCatalog(catalog);

          const before = logged.find((args) => args[0] == 'MSF Catalog:');
          expect(before).toBeDefined();
          expect(before[1]).toBe(catalog);
          expect(logged.some(
              (args) => args[0] == 'MSF Catalog after preprocessor:'))
              .toBe(false);
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
