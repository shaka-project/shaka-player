/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Test DRM-related parsing.
describe('DashParser ContentProtection', () => {
  const Dash = shaka.test.Dash;
  const ContentProtection = shaka.dash.ContentProtection;
  const strToXml = (str) => {
    const parser = new DOMParser();
    return parser.parseFromString(str, 'application/xml').documentElement;
  };

  /**
   * Tests that the parser produces the correct results.
   *
   * @param {string} manifestText
   * @param {Object} expected A Manifest-like object.  The parser output is
   *   expected to match this.
   * @param {boolean=} ignoreDrmInfo
   * @return {!Promise}
   */
  async function testDashParser(manifestText, expected, ignoreDrmInfo = false) {
    const netEngine = new shaka.test.FakeNetworkingEngine();
    netEngine.setDefaultText(manifestText);
    const dashParser = new shaka.dash.DashParser();

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.dash.ignoreDrmInfo = ignoreDrmInfo || false;
    dashParser.configure(config);

    const playerInterface = {
      networkingEngine: netEngine,
      modifyManifestRequest: (request, manifestInfo) => {},
      modifySegmentRequest: (request, segmentInfo) => {},
      filter: (manifest) => Promise.resolve(),
      makeTextStreamsForClosedCaptions: (manifest) => {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: fail,
      onError: fail,
      isLowLatencyMode: () => false,
      isAutoLowLatencyMode: () => false,
      enableLowLatencyMode: () => {},
      updateDuration: () => {},
      newDrmInfo: (stream) => {},
      onManifestUpdated: () => {},
      getBandwidthEstimate: () => 1e6,
    };

    const actual = await dashParser.start(
        'http://example.com', playerInterface);
    expect(actual).toEqual(expected);
    // When the above expectation fails, it is far too hard to read the output
    // and debug the test failure.  So we also do these more targetted
    // comparisons below, which will be easier to read and debug.  The full
    // comparison above remains to catch anything we haven't written a more
    // targetted expectation for below.

    for (let i = 0; i < actual.variants.length; ++i) {
      // NOTE: ['sample'] is how we get access to the partial object given to
      // jasmine.objectContaining().

      const actualVariant = actual.variants[i];
      const expectedVariant = expected['sample'].variants[i];

      const actualVideo = actualVariant.video;
      const expectedVideo = expectedVariant['sample'].video;

      const actualDrmInfos = actualVideo.drmInfos;
      const expectedDrmInfos = expectedVideo['sample'].drmInfos;
      expect(actualDrmInfos).withContext(`video drmInfos, i=${i}`)
          .toEqual(expectedDrmInfos);

      const actualKeyIds = actualVideo.keyIds;
      const expectedKeyIds = expectedVideo['sample'].keyIds;
      expect(actualKeyIds).withContext(`video keyIds, i=${i}`)
          .toEqual(expectedKeyIds);
    }
  }

  /**
   * Build a simple manifest with ContentProtection lines inserted into the
   * AdaptationSet and each Representation.
   *
   * @param {!Array.<string>} adaptationSetLines
   * @param {!Array.<string>} representation1Lines
   * @param {!Array.<string>} representation2Lines
   * @return {string}
   */
  function buildManifestText(
      adaptationSetLines, representation1Lines, representation2Lines) {
    const template = [
      '<MPD xmlns="urn:mpeg:DASH:schema:MPD:2011"',
      '    xmlns:cenc="urn:mpeg:cenc:2013"',
      '    xmlns:mspr="urn:microsoft:playready">',
      '  <Period duration="PT30S">',
      '    <SegmentTemplate media="s.mp4" duration="2" />',
      '    <AdaptationSet mimeType="video/mp4" codecs="avc1.4d401f">',
      '%(adaptationSetLines)s',
      '      <Representation bandwidth="50" width="576" height="432">',
      '%(representation1Lines)s',
      '      </Representation>',
      '      <Representation bandwidth="100" width="576" height="432">',
      '%(representation2Lines)s',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    return sprintf(template, {
      adaptationSetLines: adaptationSetLines.join('\n'),
      representation1Lines: representation1Lines.join('\n'),
      representation2Lines: representation2Lines.join('\n'),
    });
  }

  /**
   * Build an expected manifest which checks DRM-related fields.
   *
   * @param {!Array.<!Object>} drmInfos A list of DrmInfo-like objects.
   * @param {!Array.<string>=} keyIds The key IDs to attach to each variant.
   *   Will default to the keyIds from the first drmInfo object.
   * @return {Object} A Manifest-like object.
   */
  function buildExpectedManifest(drmInfos, keyIds) {
    if (!keyIds) {
      if (drmInfos.length) {
        // NOTE: ['sample'] is how we get access to the partial object given to
        // jasmine.objectContaining().
        keyIds = Array.from(drmInfos[0]['sample'].keyIds);
      } else {
        keyIds = [];
      }
    }

    const variants = [];
    const numVariants = 2;
    for (let i = 0; i < numVariants; i++) {
      const variant = jasmine.objectContaining({
        video: jasmine.objectContaining({
          keyIds: new Set(keyIds[i] ? [keyIds[i]] : []),
          drmInfos,
        }),
      });
      variants.push(variant);
    }

    return jasmine.objectContaining({
      variants: variants,
      textStreams: [],
    });
  }

  /**
   * Build an expected DrmInfo based on a key system and optional key IDs and
   * init data.
   *
   * @param {string} keySystem
   * @param {!Array.<string>=} keyIds
   * @param {!Array.<shaka.extern.InitDataOverride>=} initData
   * @return {Object} A DrmInfo-like object.
   */
  function buildDrmInfo(keySystem, keyIds = [], initData = []) {
    return jasmine.objectContaining({
      keySystem,
      keyIds: new Set(keyIds),
      initData,
    });
  }

  /**
   * Build an expected InitDataOverride based on base-64-encoded PSSHs and
   * optional key IDs.
   *
   * @param {!Array.<string>} base64Psshs
   * @param {!Array.<string>=} keyIds
   * @return {!Array.<shaka.extern.InitDataOverride>}
   */
  function buildInitData(base64Psshs, keyIds = []) {
    return base64Psshs.map((base64, index) => {
      /** @type {shaka.extern.InitDataOverride} */
      const initData = {
        initDataType: 'cenc',
        initData: shaka.util.Uint8ArrayUtils.fromBase64(base64),
        keyId: keyIds[index] || null,
      };
      return initData;
    });
  }

  it('handles clear content', async () => {
    const source = buildManifestText([], [], []);
    const expected = buildExpectedManifest([]);
    await testDashParser(source, expected);
  });

  describe('maps standard scheme IDs', () => {
    /**
     * @param {string} name A name for the test
     * @param {!Array.<string>} uuids DRM scheme UUIDs
     * @param {!Array.<string>} keySystems expected key system IDs
     */
    function testKeySystemMappings(name, uuids, keySystems) {
      it(name, async () => {
        const adaptationSetLines = uuids.map((uri) => {
          return sprintf('<ContentProtection schemeIdUri="urn:uuid:%s" />',
              uri);
        });
        const source = buildManifestText(adaptationSetLines, [], []);
        const drmInfos = keySystems.map((keySystem) => {
          return buildDrmInfo(keySystem);
        });
        const expected = buildExpectedManifest(drmInfos);
        await testDashParser(source, expected);
      });
    }

    testKeySystemMappings('for Widevine',
        ['edef8ba9-79d6-4ace-a3c8-27dcd51d21ed'], ['com.widevine.alpha']);
    testKeySystemMappings('for PlayReady',
        ['9a04f079-9840-4286-ab92-e65be0885f95'], ['com.microsoft.playready']);
    testKeySystemMappings('for old PlayReady',
        ['79f0049a-4098-8642-ab92-e65be0885f95'], ['com.microsoft.playready']);
    testKeySystemMappings('for Adobe Primetime',
        ['f239e769-efa3-4850-9c16-a903c6932efb'], ['com.adobe.primetime']);

    testKeySystemMappings('for multiple DRMs in the specified order',
        [
          'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed',
          '9a04f079-9840-4286-ab92-e65be0885f95',
        ], [
          'com.widevine.alpha',
          'com.microsoft.playready',
        ]);

    testKeySystemMappings('in a case-insensitive way',
        [
          'EDEF8BA9-79D6-4ACE-A3C8-27DCD51D21ED',
          '9A04F079-9840-4286-AB92-E65BE0885F95',
          'F239E769-EFA3-4850-9C16-A903C6932EFB',
        ], [
          'com.widevine.alpha',
          'com.microsoft.playready',
          'com.adobe.primetime',
        ]);
  });

  it('inherits key IDs from AdaptationSet to Representation', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
    ], [], []);
    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha', [
        // Representation 1 & 2 key ID deduplicated in DrmInfo
        'deadbeeffeedbaadf00d000008675309',
      ]),
    ],
    [
      // Representation 1 key ID
      'deadbeeffeedbaadf00d000008675309',
      // Representation 2 key ID
      'deadbeeffeedbaadf00d000008675309',
    ]);
    await testDashParser(source, expected);
  });

  it('sets key IDs for the init data', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
    ], [
      // Representation 1 lines
      '<ContentProtection',
      '    schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
      '    value="cenc"',
      '    cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309">',
      '  <cenc:pssh>bm8gaHVtYW4gY2FuIHJlYWQgYmFzZTY0IGRpcmVjdGx5</cenc:pssh>',
      '</ContentProtection>',
    ], []);

    const initData = buildInitData(
        ['bm8gaHVtYW4gY2FuIHJlYWQgYmFzZTY0IGRpcmVjdGx5'], // PSSHs
        ['deadbeeffeedbaadf00d000008675309']); // key ID for init data
    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha',
          ['deadbeeffeedbaadf00d000008675309'], // key ID
          initData),
    ]);
    await testDashParser(source, expected);
  });

  it('lets Representations override key IDs', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
    ], [
      // Representation 1 lines
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"',
      '  cenc:default_KID="BAADF00D-FEED-DEAF-BEEF-000004390116" />',
    ], [
      // Representation 2 lines
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"',
      '  cenc:default_KID="BAADF00D-FEED-DEAF-BEEF-018006492568" />',
    ]);
    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha', [
        // Representation 1 key ID
        'baadf00dfeeddeafbeef000004390116',
        // Representation 2 key ID
        'baadf00dfeeddeafbeef018006492568',
      ]),
    ]);
    await testDashParser(source, expected);
  });

  it('extracts embedded PSSHs', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">',
      '  <cenc:pssh>ZmFrZSBXaWRldmluZSBQU1NI</cenc:pssh>',
      '</ContentProtection>',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95">',
      '  <cenc:pssh>bm8gaHVtYW4gY2FuIHJlYWQgYmFzZTY0IGRpcmVjdGx5</cenc:pssh>',
      '</ContentProtection>',
    ], [], []);
    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha',
          [], // key IDs
          buildInitData(['ZmFrZSBXaWRldmluZSBQU1NI'])),
      buildDrmInfo('com.microsoft.playready',
          [], // key IDs
          buildInitData(['bm8gaHVtYW4gY2FuIHJlYWQgYmFzZTY0IGRpcmVjdGx5'])),
    ]);
    await testDashParser(source, expected);
  });

  it('extracts embedded PSSHs with mspr:pro', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95">',
      '  <mspr:pro>UGxheXJlYWR5</mspr:pro>',
      '</ContentProtection>',
    ], [], []);
    const expected = buildExpectedManifest([
      buildDrmInfo('com.microsoft.playready',
          [], // key IDs
          buildInitData([
            'AAAAKXBzc2gAAAAAmgTweZhAQoarkuZb4IhflQAAAAlQbGF5cmVhZHk=',
          ])),
    ]);
    await testDashParser(source, expected);
  });

  it('extracts embedded PSSHs and prefer cenc:pssh over mspr:pro', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95">',
      '  <cenc:pssh>bm8gaHVtYW4gY2FuIHJlYWQgYmFzZTY0IGRpcmVjdGx5</cenc:pssh>',
      '  <mspr:pro>ZmFrZSBQbGF5cmVhZHkgUFJP</mspr:pro>',
      '</ContentProtection>',
    ], [], []);
    const expected = buildExpectedManifest([
      buildDrmInfo('com.microsoft.playready',
          [], // key IDs
          buildInitData(['bm8gaHVtYW4gY2FuIHJlYWQgYmFzZTY0IGRpcmVjdGx5'])),
    ]);
    await testDashParser(source, expected);
  });

  it('assumes all known key systems for generic CENC', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" />',
    ], [], []);
    // The order does not matter here, so use arrayContaining.
    // NOTE: the buildDrmInfo calls here specify no init data
    const drmInfos = jasmine.arrayContaining([
      buildDrmInfo('com.widevine.alpha'),
      buildDrmInfo('com.microsoft.playready'),
      buildDrmInfo('com.adobe.primetime'),
    ]);
    const expected = buildExpectedManifest(
        /** @type {!Array.<shaka.extern.DrmInfo>} */(drmInfos),
        [],  // key IDs
    );
    await testDashParser(source, expected);
  });

  it('assumes all known key systems when ignoreDrmInfo is set', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">',
      '  <cenc:pssh>ZmFrZSBXaWRldmluZSBQU1NI</cenc:pssh>',
      '</ContentProtection>',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95">',
      '  <cenc:pssh>bm8gaHVtYW4gY2FuIHJlYWQgYmFzZTY0IGRpcm</cenc:pssh>',
      '</ContentProtection>',
    ], [], []);

    // The order does not matter here, so use arrayContaining.
    // NOTE: the buildDrmInfo calls here specify no init data
    const drmInfos = jasmine.arrayContaining([
      buildDrmInfo('com.widevine.alpha'),
      buildDrmInfo('com.microsoft.playready'),
      buildDrmInfo('com.adobe.primetime'),
    ]);
    const expected = buildExpectedManifest(
        /** @type {!Array.<shaka.extern.DrmInfo>} */(drmInfos),
        []);  // key IDs
    await testDashParser(source, expected, /* ignoreDrmInfo= */ true);
  });

  it('parses key IDs when ignoreDrmInfo flag is set', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
    ], [], []);
    const keyIds = [
      // Representation 1 & 2 key ID deduplicated in DrmInfo
      'deadbeeffeedbaadf00d000008675309',
    ];
    const variantKeyIds = [
      // Representation 1 key ID
      'deadbeeffeedbaadf00d000008675309',
      // Representation 2 key ID
      'deadbeeffeedbaadf00d000008675309',
    ];

    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha', keyIds),
      // PlayReady has two associated UUIDs, so it appears twice.
      buildDrmInfo('com.microsoft.playready', keyIds),
      buildDrmInfo('com.microsoft.playready', keyIds),
      buildDrmInfo('com.adobe.primetime', keyIds),
    ], variantKeyIds);
    await testDashParser(source, expected, /* ignoreDrmInfo= */ true);
  });

  it('inherits PSSH from generic CENC into all key systems', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc">',
      '  <cenc:pssh>b25lIGhlYWRlciB0byBydWxlIHRoZW0gYWxs</cenc:pssh>',
      '</ContentProtection>',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95" />',
    ], [], []);
    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha',
          [], // key IDs
          buildInitData(['b25lIGhlYWRlciB0byBydWxlIHRoZW0gYWxs'])),
      buildDrmInfo('com.microsoft.playready',
          [], // key IDs
          buildInitData(['b25lIGhlYWRlciB0byBydWxlIHRoZW0gYWxs'])),
    ]);
    await testDashParser(source, expected);
  });

  it('lets key systems override generic PSSH', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc">',
      '  <cenc:pssh>b25lIGhlYWRlciB0byBydWxlIHRoZW0gYWxs</cenc:pssh>',
      '</ContentProtection>',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">',
      '  <cenc:pssh>',
      '    VGltZSBpcyBhbiBpbGx1c2lvbi4gTHVuY2h0aW1lIGRvdWJseSBzby4=',
      '  </cenc:pssh>',
      '</ContentProtection>',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95" />',
    ], [], []);
    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha',
          [], // key IDs
          buildInitData(
              ['VGltZSBpcyBhbiBpbGx1c2lvbi4gTHVuY2h0aW1lIGRvdWJseSBzby4='])),
      buildDrmInfo('com.microsoft.playready',
          [], // key IDs
          buildInitData(['b25lIGhlYWRlciB0byBydWxlIHRoZW0gYWxs'])),
    ]);
    await testDashParser(source, expected);
  });

  it('ignores custom or unknown schemes', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:feedbaad-f00d-2bee-baad-d00d00000000" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
      '<ContentProtection',
      '  schemeIdUri="http://example.com/drm" />',
    ], [], []);
    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha'),
    ]);
    await testDashParser(source, expected);
  });

  it('inserts a placeholder for unrecognized schemes', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:feedbaad-f00d-2bee-baad-d00d00000000" />',
      '<ContentProtection',
      '  schemeIdUri="http://example.com/drm" />',
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
    ], [], []);
    const expected = buildExpectedManifest([
      // placeholder: only unrecognized schemes found
      buildDrmInfo('', [
        // Representation 1 & 2 key ID deduplicated in DrmInfo
        'deadbeeffeedbaadf00d000008675309',
      ]),
    ],
    [
      // Representation 1 key ID
      'deadbeeffeedbaadf00d000008675309',
      // Representation 2 key ID
      'deadbeeffeedbaadf00d000008675309',
    ]);
    await testDashParser(source, expected);
  });

  it('can specify ContentProtection in Representation only', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
    ], [
      // Representation 1 lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
    ], [
      // Representation 2 lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
    ]);
    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha'),
    ]);
    await testDashParser(source, expected);
  });

  it('still keeps per-Representation key IDs when merging', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
    ], [
      // Representation 1 lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
    ], [
      // Representation 2 lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"',
      '  cenc:default_KID="BAADF00D-FEED-DEAF-BEEF-000004390116" />',
    ]);
    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha', [
        // Representation 1 key ID
        'deadbeeffeedbaadf00d000008675309',
        // Representation 2 key ID
        'baadf00dfeeddeafbeef000004390116',
      ]),
    ]);
    await testDashParser(source, expected);
  });

  it('parses key IDs from non-cenc in Representation', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
    ], [
      // Representation 1 lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
    ], [
      // Representation 2 lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"',
      '  cenc:default_KID="BAADF00D-FEED-DEAF-BEEF-000004390116" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
      '  cenc:default_KID="BAADF00D-FEED-DEAF-BEEF-000004390116" />',
    ]);
    const keyIds = [
      // Representation 1 key ID
      'deadbeeffeedbaadf00d000008675309',
      // Representation 2 key ID
      'baadf00dfeeddeafbeef000004390116',
    ];
    const expected = buildExpectedManifest([
      buildDrmInfo('com.microsoft.playready', keyIds),
      buildDrmInfo('com.widevine.alpha', keyIds),
    ]);
    await testDashParser(source, expected);
  });

  it('parses key IDs from non-cenc in AdaptationSet', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
    ], [], []);
    const keyIds = [
      // Representation 1 & 2 key ID deduplicated in DrmInfo
      'deadbeeffeedbaadf00d000008675309',
    ];
    const variantKeyIds = [
      // Representation 1 key ID
      'deadbeeffeedbaadf00d000008675309',
      // Representation 2 key ID
      'deadbeeffeedbaadf00d000008675309',
    ];
    const expected = buildExpectedManifest([
      buildDrmInfo('com.microsoft.playready', keyIds),
      buildDrmInfo('com.widevine.alpha', keyIds),
    ], variantKeyIds);
    await testDashParser(source, expected);
  });

  it('ignores elements missing @schemeIdUri', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
    ], [], []);
    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha'),
    ]);
    await testDashParser(source, expected);
  });

  it('handles non-default namespace names', async () => {
    const source = [
      '<MPD xmlns="urn:mpeg:DASH:schema:MPD:2011"',
      '    xmlns:foo="urn:mpeg:cenc:2013">',
      '  <Period duration="PT30S">',
      '    <SegmentTemplate media="s.mp4" duration="2" />',
      '    <AdaptationSet mimeType="video/mp4" codecs="avc1.4d401f">',
      '      <ContentProtection',
      '          schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">',
      '        <foo:pssh>b25lIGhlYWRlciB0byBydWxlIHRoZW0gYWxs</foo:pssh>',
      '      </ContentProtection>',
      '      <Representation bandwidth="50" width="576" height="432" />',
      '      <Representation bandwidth="100" width="576" height="432" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    const expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha',
          [], // key IDs
          buildInitData(['b25lIGhlYWRlciB0byBydWxlIHRoZW0gYWxs'])),
    ]);
    await testDashParser(source, expected);
  });

  it('fails for no schemes common', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
    ], [
      // Representation 1 lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95" />',
    ], [
      // Representation 2 lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
    ]);
    const expected = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_NO_COMMON_KEY_SYSTEM);
    await Dash.testFails(source, expected);
  });

  it('fails for invalid PSSH encoding', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">',
      '  <cenc:pssh>foobar!</cenc:pssh>',
      '</ContentProtection>',
    ], [], []);
    const expected = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_PSSH_BAD_ENCODING);
    await Dash.testFails(source, expected);
  });

  it('fails for conflicting default key IDs', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
      '  cenc:default_KID="BAADF00D-FEED-DEAF-BEEF-000004390116" />',
    ], [], []);
    const expected = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_CONFLICTING_KEY_IDS);
    await Dash.testFails(source, expected);
  });

  it('fails for multiple key IDs', async () => {
    const source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"',
      '  cenc:default_KID="BAADF00D-FEED-DEAF-BEEF-000004390116 foobar" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
    ], [], []);
    const expected = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_MULTIPLE_KEY_IDS_NOT_SUPPORTED);
    await Dash.testFails(source, expected);
  });

  describe('getWidevineLicenseUrl', () => {
    it('valid ms:laurl node', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml([
          '<test xmlns:ms="urn:microsoft">',
          '  <ms:laurl licenseUrl="www.example.com"></ms:laurl>',
          '</test>',
        ].join('\n')),
      };
      const actual = ContentProtection.getWidevineLicenseUrl(input);
      expect(actual).toBe('www.example.com');
    });

    it('ms:laurl without license url', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml([
          '<test xmlns:ms="urn:microsoft">',
          '  <ms:laurl></ms:laurl>',
          '</test>',
        ].join('\n')),
      };
      const actual = ContentProtection.getWidevineLicenseUrl(input);
      expect(actual).toBe('');
    });

    it('valid dashif:Laurl node', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml([
          '<test xmlns:dashif="https://dashif.org/CPS">',
          '  <dashif:Laurl>www.example.com</dashif:Laurl>',
          '</test>',
        ].join('\n')),
      };
      const actual = ContentProtection.getWidevineLicenseUrl(input);
      expect(actual).toBe('www.example.com');
    });

    it('dashif:Laurl without license url', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml([
          '<test xmlns:dashif="https://dashif.org/CPS">',
          '  <dashif:Laurl></dashif:Laurl>',
          '</test>',
        ].join('\n')),
      };
      const actual = ContentProtection.getWidevineLicenseUrl(input);
      expect(actual).toBe('');
    });

    it('no ms:laurl node or dashif:Laurl node', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml('<test></test>'),
      };
      const actual = ContentProtection.getWidevineLicenseUrl(input);
      expect(actual).toBe('');
    });
  });

  describe('getClearKeyLicenseUrl', () => {
    it('valid clearkey:Laurl node', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml([
          '<test xmlns:clearkey="http://dashif.org/guidelines/clearKey">',
          '  <clearkey:Laurl ',
          '     Lic_type="EME-1.0">www.example.com</clearkey:Laurl>',
          '</test>',
        ].join('\n')),
      };
      const actual = ContentProtection.getClearKeyLicenseUrl(input);
      expect(actual).toBe('www.example.com');
    });

    it('clearkey:Laurl without license url', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml([
          '<test xmlns:clearkey="http://dashif.org/guidelines/clearKey">',
          '  <clearkey:Laurl Lic_type="EME-1.0"></clearkey:Laurl>',
          '</test>',
        ].join('\n')),
      };
      const actual = ContentProtection.getClearKeyLicenseUrl(input);
      expect(actual).toBe('');
    });

    it('valid dashif:Laurl node', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml([
          '<test xmlns:dashif="https://dashif.org/CPS">',
          '  <dashif:Laurl>www.example.com</dashif:Laurl>',
          '</test>',
        ].join('\n')),
      };
      const actual = ContentProtection.getClearKeyLicenseUrl(input);
      expect(actual).toBe('www.example.com');
    });

    it('dashif:Laurl without license url', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml([
          '<test xmlns:dashif="https://dashif.org/CPS">',
          '  <dashif:Laurl></dashif:Laurl>',
          '</test>',
        ].join('\n')),
      };
      const actual = ContentProtection.getClearKeyLicenseUrl(input);
      expect(actual).toBe('');
    });

    it('no clearkey:Laurl or dashif:Laurl node', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml('<test></test>'),
      };
      const actual = ContentProtection.getClearKeyLicenseUrl(input);
      expect(actual).toBe('');
    });
  });

  describe('getPlayReadyLicenseURL', () => {
    it('mspro', () => {
      const laurl = [
        '<WRMHEADER>',
        '  <DATA>',
        '    <LA_URL>www.example.com</LA_URL>',
        '  </DATA>',
        '</WRMHEADER>',
      ].join('\n');
      const laurlCodes = laurl.split('').map((c) => {
        return c.charCodeAt();
      });
      const prBytes = new Uint16Array([
        // pr object size (in num bytes).
        // + 10 for PRO size, count, and type
        laurl.length * 2 + 10, 0,
        // record count
        1,
        // type
        ContentProtection.PLAYREADY_RECORD_TYPES.RIGHTS_MANAGEMENT,
        // record size (in num bytes)
        laurl.length * 2,
        // value
      ].concat(laurlCodes));

      const encodedPrObject = shaka.util.Uint8ArrayUtils.toBase64(prBytes);
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node:
        strToXml([
          '<test xmlns:mspr="urn:microsoft:playready">',
          '  <mspr:pro>' + encodedPrObject + '</mspr:pro>',
          '</test>',
        ].join('\n')),
      };
      const actual = ContentProtection.getPlayReadyLicenseUrl(input);
      expect(actual).toBe('www.example.com');
    });

    it('valid dashif:Laurl node', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml([
          '<test xmlns:dashif="https://dashif.org/CPS">',
          '  <dashif:Laurl>www.example.com</dashif:Laurl>',
          '</test>',
        ].join('\n')),
      };
      const actual = ContentProtection.getPlayReadyLicenseUrl(input);
      expect(actual).toBe('www.example.com');
    });

    it('dashif:Laurl without license url', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml([
          '<test xmlns:dashif="https://dashif.org/CPS">',
          '  <dashif:Laurl></dashif:Laurl>',
          '</test>',
        ].join('\n')),
      };
      const actual = ContentProtection.getPlayReadyLicenseUrl(input);
      expect(actual).toBe('');
    });

    it('no mspro or dashif:Laurl node', () => {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml('<test></test>'),
      };
      const actual = ContentProtection.getPlayReadyLicenseUrl(input);
      expect(actual).toBe('');
    });
  });
});
