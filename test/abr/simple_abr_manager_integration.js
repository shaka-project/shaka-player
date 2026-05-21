/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SimpleAbrManager (integration)', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const Util = shaka.test.Util;
  const TEST_SCHEME = 'abrtest';

  const VARIANT_BANDWIDTHS = [200e3, 800e3, 2e6, 5e6];

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.util.EventManager} */
  let eventManager;
  /** @type {!shaka.test.Waiter} */
  let waiter;

  /** @type {!shaka.net.NetworkingEngine} */
  let netEngine;
  /** @type {!shaka.media.MediaSourceEngine} */
  let mediaSourceEngine;
  /** @type {!shaka.media.StreamingEngine} */
  let streamingEngine;
  /** @type {!shaka.abr.SimpleAbrManager} */
  let abrManager;
  /** @type {!shaka.media.MediaSourcePlayhead} */
  let playhead;
  /** @type {shaka.extern.Manifest} */
  let manifest;

  /** @type {!Object<string, !shaka.test.Mp4VodStreamGenerator>} */
  let generators;
  /** @type {number} */
  let currentTargetBps;
  let metadata;

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);

    metadata = shaka.test.TestScheme.DATA['sintel'];

    generators = {};
    generators[ContentType.AUDIO] = new shaka.test.Mp4VodStreamGenerator(
        metadata.audio.initSegmentUri, metadata.audio.mdhdOffset,
        metadata.audio.segmentUri, metadata.audio.tfdtOffset,
        metadata.audio.segmentDuration);
    generators[ContentType.VIDEO] = new shaka.test.Mp4VodStreamGenerator(
        metadata.video.initSegmentUri, metadata.video.mdhdOffset,
        metadata.video.segmentUri, metadata.video.tfdtOffset,
        metadata.video.segmentDuration);
    await Promise.all([
      generators[ContentType.AUDIO].init(),
      generators[ContentType.VIDEO].init(),
    ]);

    shaka.net.NetworkingEngine.registerScheme(TEST_SCHEME, schemePlugin);
  });

  afterAll(() => {
    shaka.net.NetworkingEngine.unregisterScheme(TEST_SCHEME);
    document.body.removeChild(video);
  });

  beforeEach(() => {
    currentTargetBps = 1e6;

    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);

    abrManager = new shaka.abr.SimpleAbrManager();

    netEngine = new shaka.net.NetworkingEngine(
        (deltaTimeMs, bytes, allowSwitch, request, context) => {
          abrManager.segmentDownloaded(
              deltaTimeMs, bytes, allowSwitch, request, context);
        });
    netEngine.configure(
        shaka.util.PlayerConfiguration.createDefault().networking);
    netEngine.registerResponseFilter(throughputSimulator);

    const mediaSourceConfig =
        shaka.util.PlayerConfiguration.createDefault().mediaSource;
    mediaSourceEngine = new shaka.media.MediaSourceEngine(
        video,
        new shaka.test.FakeTextDisplayer(),
        {
          getKeySystem: () => null,
          onMetadata: () => {},
          onEmsg: () => {},
          onEvent: () => {},
          onManifestUpdate: () => {},
        },
        mediaSourceConfig);
    waiter.setMediaSourceEngine(mediaSourceEngine);
  });

  afterEach(async () => {
    eventManager.release();
    if (streamingEngine) {
      await streamingEngine.destroy();
    }
    if (mediaSourceEngine) {
      await mediaSourceEngine.destroy();
    }
    if (playhead) {
      playhead.release();
    }
    if (abrManager) {
      abrManager.stop();
      abrManager.release();
    }
    if (netEngine) {
      await netEngine.destroy();
    }
  });

  /**
   * Scheme plugin that serves segments from in-memory generators.
   * URIs:
   *   abrtest:audio/init    abrtest:video/init
   *   abrtest:audio/<n>     abrtest:video/<n>
   *
   * @param {string} uri
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.RequestType=} requestType
   * @return {!shaka.extern.IAbortableOperation<shaka.extern.Response>}
   */
  function schemePlugin(uri, request, requestType) {
    const re = /^abrtest:(audio|video)\/(init|\d+)$/;
    const match = re.exec(uri);
    if (!match) {
      return shaka.util.AbortableOperation.failed(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_TEST_URI));
    }

    const type = match[1];
    const ident = match[2];
    let data;
    if (ident === 'init') {
      data = generators[type].getInitSegment(0);
    } else {
      data = generators[type].getSegment(Number(ident), 0);
    }

    return shaka.util.AbortableOperation.completed({
      uri,
      originalUri: uri,
      data,
      headers: {},
      originalRequest: request,
    });
  }

  /**
   * Response filter that sleeps so the apparent throughput matches
   * `currentTargetBps`.
   *
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.Response} response
   * @param {shaka.extern.RequestContext=} context
   * @return {!Promise}
   */
  async function throughputSimulator(type, response, context) {
    if (!response.data || !response.data.byteLength) {
      return;
    }
    const transferMs =
        (response.data.byteLength * 8 * 1000) / currentTargetBps;
    await new Promise((resolve) => setTimeout(resolve, transferMs));
  }

  /**
   * Builds a multi-bitrate manifest where every variant points to the same
   * in-memory media but advertises a different `bandwidth` so the ABR can
   * differentiate them.
   *
   * @param {number} duration Presentation duration in seconds.
   * @return {shaka.extern.Manifest}
   */
  function createMultiBitrateManifest(duration) {
    return shaka.test.ManifestGenerator.generate((m) => {
      m.presentationTimeline.setDuration(duration);
      m.sequenceMode = false;

      let nextStreamId = 100;
      VARIANT_BANDWIDTHS.forEach((bw, i) => {
        m.addVariant(i, (variant) => {
          variant.bandwidth = bw;
          variant.addVideo(nextStreamId++, (s) => {
            s.bandwidth = bw - 64e3;
            s.mimeType = metadata.video.mimeType;
            s.codecs = metadata.video.codecs;
            s.size(640, 360);
            s.setInitSegmentReference(['abrtest:video/init'], 0, null);
            s.useSegmentTemplate(
                'abrtest:video/%d', metadata.video.segmentDuration);
          });
          variant.addAudio(nextStreamId++, (s) => {
            s.bandwidth = 64e3;
            s.mimeType = metadata.audio.mimeType;
            s.codecs = metadata.audio.codecs;
            s.setInitSegmentReference(['abrtest:audio/init'], 0, null);
            s.useSegmentTemplate(
                'abrtest:audio/%d', metadata.audio.segmentDuration);
          });
        });
      });
    });
  }

  /**
   * Wires up StreamingEngine + SimpleAbrManager + Playhead for VOD playback.
   *
   * @param {number} defaultBandwidthEstimate
   * @return {!Promise}
   */
  async function setupPlayback(defaultBandwidthEstimate) {
    // Long enough that segments keep flowing through the EWMA estimator for
    // the full duration of the dynamic-throughput scenarios, but not so long
    // that the underlying media has to loop many times.
    const presentationDuration = 60;
    manifest = createMultiBitrateManifest(presentationDuration);

    const streamingConfig =
        shaka.util.PlayerConfiguration.createDefault().streaming;
    streamingConfig.stallEnabled = false;

    const abrConfig = shaka.util.PlayerConfiguration.createDefault().abr;
    abrConfig.defaultBandwidthEstimate = defaultBandwidthEstimate;
    abrConfig.useNetworkInformation = false;
    abrConfig.minTimeToSwitch = 0;
    // Integration tests cannot mock Date.now to fast-forward switchInterval
    // the way the unit tests do, so shorten it instead.
    abrConfig.switchInterval = 1;
    // EWMA half-lives default to 2s/5s, which is tuned to converge across
    // many segments in production. The dynamic-throughput scenarios below
    // need the estimator to react within a single test, so shorten them.
    abrConfig.advanced.fastHalfLife = 1;
    abrConfig.advanced.slowHalfLife = 2;

    abrManager.init(
        (variant, clearBuffer, safeMargin) => {
          streamingEngine.switchVariant(
              variant, clearBuffer || false, safeMargin || 0);
        },
        () => {});
    abrManager.configure(abrConfig);
    abrManager.setVariants(manifest.variants, false);

    const initialVariant = abrManager.chooseVariant();

    playhead = new shaka.media.MediaSourcePlayhead(
        video, manifest, streamingConfig,
        /* startTime= */ null,
        () => streamingEngine.seeked(),
        () => {});

    const onError = jasmine.createSpy('onError').and.callFake(fail);
    streamingEngine = new shaka.media.StreamingEngine(manifest, {
      getPresentationTime: () => playhead.getTime(),
      getBandwidthEstimate: () => abrManager.getBandwidthEstimate(),
      getPlaybackRate: () => video.playbackRate,
      video,
      mediaSourceEngine,
      netEngine,
      onError: Util.spyFunc(onError),
      onEvent: () => {},
      onSegmentAppended: () => playhead.notifyOfBufferingChange(),
      onInitSegmentAppended: () => {},
      beforeAppendSegment: () => Promise.resolve(),
      disableStream: () => false,
      shouldPrefetchNextSegment: () => true,
      getKeySystem: () => '',
    });
    streamingEngine.configure(streamingConfig);

    streamingEngine.switchVariant(initialVariant);
    await streamingEngine.start();
    abrManager.enable();
  }

  it('settles on the lowest variant when throughput is low', async () => {
    currentTargetBps = 400e3;
    await setupPlayback(/* defaultBandwidthEstimate= */ 400e3);

    await video.play();
    await waiter.timeoutAfter(20).waitForMovement(video);
    // Allow the EWMA estimator to stabilise and a buffer to accumulate so
    // any startup readiness 'waiting' is excluded from the assertion.
    await Util.delay(8);

    const onWaiting = jasmine.createSpy('onWaiting');
    eventManager.listen(video, 'waiting', Util.spyFunc(onWaiting));
    await Util.delay(5);

    const chosen = abrManager.chooseVariant();
    expect(chosen.bandwidth).toBe(VARIANT_BANDWIDTHS[0]);
    expect(onWaiting).not.toHaveBeenCalled();
  });

  it('settles on a high-bandwidth variant when throughput is high',
      async () => {
        currentTargetBps = 5.5e6;
        await setupPlayback(/* defaultBandwidthEstimate= */ 5.5e6);

        await video.play();
        await waiter.timeoutAfter(20).waitForMovement(video);
        // Allow a buffer to accumulate so any startup readiness 'waiting' is
        // excluded from the assertion.
        await Util.delay(8);

        const onWaiting = jasmine.createSpy('onWaiting');
        eventManager.listen(video, 'waiting', Util.spyFunc(onWaiting));
        await Util.delay(5);

        // Browsers vary in how aggressively the EWMA reaches the very top
        // tier; what matters for the issue is that a high-throughput network
        // results in a high-bandwidth choice (top or one below it).
        const chosen = abrManager.chooseVariant();
        expect(chosen.bandwidth)
            .toBeGreaterThanOrEqual(VARIANT_BANDWIDTHS[2]);
        expect(onWaiting).not.toHaveBeenCalled();
      });

  it('down-switches when throughput drops', async () => {
    currentTargetBps = 5.5e6;
    await setupPlayback(/* defaultBandwidthEstimate= */ 5.5e6);

    await video.play();
    await waiter.timeoutAfter(20).waitForMovement(video);
    await Util.delay(3);
    const initialBandwidth = abrManager.chooseVariant().bandwidth;
    expect(initialBandwidth).toBeGreaterThanOrEqual(VARIANT_BANDWIDTHS[2]);

    currentTargetBps = 250e3;
    await Util.delay(15);

    expect(abrManager.chooseVariant().bandwidth).toBeLessThan(initialBandwidth);
  });
});
