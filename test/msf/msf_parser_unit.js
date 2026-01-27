describe('shaka.msf.MSFParser', () => {
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

    config = shaka.util.PlayerConfiguration.createDefault().manifest;
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
    };

    parser = new shaka.msf.MSFParser();
    parser.configure(config);
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
