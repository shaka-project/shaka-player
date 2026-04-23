/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Test basic manifest parsing functionality.
describe('DashJsonParser Manifest', () => {
  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.dash.DashJsonParser} */
  let parser;
  /** @type {!jasmine.Spy} */
  let onEventSpy;
  /** @type {!jasmine.Spy} */
  let addFontSpy;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;

  beforeEach(() => {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = new shaka.dash.DashJsonParser();
    const config = shaka.util.PlayerConfiguration.createDefault();
    parser.configure(config.manifest);
    onEventSpy = jasmine.createSpy('onEvent');
    addFontSpy = jasmine.createSpy('addFont');
    playerInterface = {
      networkingEngine: fakeNetEngine,
      modifyManifestRequest: (request, manifestInfo) => {},
      modifySegmentRequest: (request, segmentInfo) => {},
      filter: (manifest) => Promise.resolve(),
      makeTextStreamsForClosedCaptions: (manifest) => {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: shaka.test.Util.spyFunc(onEventSpy),
      onError: fail,
      isLowLatencyMode: () => false,
      updateDuration: () => {},
      newDrmInfo: (stream) => {},
      onManifestUpdated: () => {},
      getBandwidthEstimate: () => 1e6,
      onMetadata: () => {},
      disableStream: (stream) => {},
      addFont: shaka.test.Util.spyFunc(addFontSpy),
      getStreamingRetryParameters: () => config.streaming.retryParameters,
      onSegmentReceived: (deltaTimeMs, numBytes) => {},
    };
  });

  afterEach(() => {
    // DashJson parser stop is synchronous.
    parser.stop();
  });

  it('supports application/dash+json', async () => {
    const source = JSON.stringify({
      profiles: 'urn:mpeg:dash:profile:isoff-on-demand:2011',
      minBufferTime: 'PT2.00S',
      mediaPresentationDuration: 'PT0H00M04.000S',
      type: 'static',
      Period: [
        {
          id: '0',
          duration: 'PT0H00M04.000S',
          SupplementalProperty: [
            {
              schemeIdUri: 'urn:mpeg:dash:urlparam:2014',
              up: {
                UrlQueryInfo: {
                  queryTemplate: '$querypart$',
                  useMPDUrlQuery: 'true',
                },
              },
            },
          ],
          AdaptationSet: [
            {
              mimeType: 'video/mp4',
              segmentAlignment: true,
              startWithSAP: 1,
              maxWidth: 854,
              maxHeight: 480,
              subsegmentAlignment: true,
              subsegmentStartsWithSAP: 1,
              SupplementalProperty: [
                {
                  schemeIdUri: 'urn:mpeg:mpegB:cicp:MatrixCoefficients',
                  value: '9',
                },
                {
                  schemeIdUri: 'urn:mpeg:mpegB:cicp:ColourPrimaries',
                  value: '9',
                },
                {
                  schemeIdUri: 'urn:mpeg:mpegB:cicp:TransferCharacteristics',
                  value: '16',
                },
              ],
              SegmentTemplate: {
                timescale: 24,
                media: 'media-video-av01-dav1-db1p-1-$Number%04d$.m4s',
                startNumber: 1,
                duration: 96,
                initialization: 'media-video-av01-dav1-db1p-1-init.mp4',
              },
              Representation: [
                {
                  id: 'video-av01-dav1-db1p-1',
                  codecs: 'av01.0.31M.10.0.111.09.16.09.0',
                  width: 854,
                  height: 480,
                  scanType: 'progressive',
                  frameRate: '25',
                  bandwidth: 1362913,
                  ns1: {
                    supplementalCodecs: 'dav1.10.01',
                    supplementalProfiles: 'db1p',
                  },
                },
              ],
            },
          ],
        },
      ],
      $ns: {
        'urn:scte:dash:scte214-extensions': {
          prefix: 'ns1',
          attributes: [
            'supplementalCodecs',
            'supplementalProfiles',
          ],
        },
        'urn:mpeg:dash:schema:urlparam:2014': {
          prefix: 'up',
          attributes: [
            'queryTemplate',
            'useMPDUrlQuery',
          ],
        },
      },
    });

    fakeNetEngine.setResponseText('dummy://foo?a=1', source);
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo?a=1', playerInterface);
    expect(manifest.variants.length).toBe(2);

    const variant1 = manifest.variants[0];

    const video1 = variant1.video;
    expect(video1.hdr).toBe('PQ');
    expect(video1.colorGamut).toBe('rec2020');

    await video1.createSegmentIndex();
    goog.asserts.assert(video1.segmentIndex, 'Null segmentIndex!');

    const variant1Ref = Array.from(video1.segmentIndex)[0];

    expect(variant1Ref.getUris())
        .toEqual(['dummy://foo/media-video-av01-dav1-db1p-1-0001.m4s?a=1']);
    expect(variant1Ref.initSegmentReference.getUris())
        .toEqual(['dummy://foo/media-video-av01-dav1-db1p-1-init.mp4?a=1']);
  });
});
