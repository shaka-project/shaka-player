/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Test DRM-related parsing.
describe('DashParser ContentProtection', function() {
  const Dash = shaka.test.Dash;

  /**
   * Tests that the parser produces the correct results.
   *
   * @param {string} manifestText
   * @param {Object} expected A Manifest-like object.  The parser output is
   *   expected to match this.
   * @param {shaka.extern.DashContentProtectionCallback=} callback
   * @param {boolean=} ignoreDrmInfo
   * @return {!Promise}
   */
  function testDashParser(manifestText, expected, callback,
      ignoreDrmInfo = false) {
    let netEngine = new shaka.test.FakeNetworkingEngine();
    netEngine.setDefaultText(manifestText);
    let dashParser = new shaka.dash.DashParser();

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.dash.ignoreDrmInfo = ignoreDrmInfo;
    if (callback) {
      config.dash.customScheme = callback;
    }
    dashParser.configure(config);

    let playerEvents = {
      networkingEngine: netEngine,
      filterNewPeriod: function() {},
      filterAllPeriods: function() {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: fail,
      onError: fail,
    };

    return dashParser.start('http://example.com', playerEvents)
        .then(function(actual) { expect(actual).toEqual(expected); });
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
    let template = [
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
   * @param {number=} numVariants The number of variants, default 2.
   * @return {Object} A Manifest-like object.
   */
  function buildExpectedManifest(drmInfos, numVariants = 2) {
    let keyIds = [];
    if (drmInfos.length > 0) {
      keyIds = drmInfos[0].sample.keyIds;
    }

    let variants = [];
    for (let i = 0; i < numVariants; i++) {
      let variant = jasmine.objectContaining({
        drmInfos: drmInfos,
        video: jasmine.objectContaining({
          keyId: keyIds[i] || null,
        }),
      });
      variants.push(variant);
    }

    return jasmine.objectContaining({
      periods: [
        jasmine.objectContaining({
          variants: variants,
          textStreams: [],
        }),
      ],  // periods
    });
  }

  /**
   * Build an expected DrmInfo based on a key system and optional PSSHs.
   *
   * @param {string} keySystem
   * @param {Array.<string>=} keyIds
   * @param {Array.<string>=} base64Psshs
   * @param {Array.<string>=} initDataKeyIds
   * @return {Object} A DrmInfo-like object.
   */
  function buildDrmInfo(keySystem, keyIds = [],
      base64Psshs = [], initDataKeyIds) {
    let initData = base64Psshs.map(function(base64, index) {
      /** @type {shaka.extern.InitDataOverride} */
      let initData = {
        initDataType: 'cenc',
        initData: shaka.util.Uint8ArrayUtils.fromBase64(base64),
        keyId: initDataKeyIds ? initDataKeyIds[index] : null,
      };
      return initData;
    });
    let containing = {keySystem: keySystem, initData: initData, keyIds: keyIds};
    return jasmine.objectContaining(containing);
  }

  it('handles clear content', async () => {
    let source = buildManifestText([], [], []);
    let expected = buildExpectedManifest([]);
    await testDashParser(source, expected);
  });

  describe('maps standard scheme IDs', function() {
    /**
     * @param {string} name A name for the test
     * @param {!Array.<string>} uuids DRM scheme UUIDs
     * @param {!Array.<string>} keySystems expected key system IDs
     */
    function testKeySystemMappings(name, uuids, keySystems) {
      it(name, async () => {
        let adaptationSetLines = uuids.map(function(uri) {
          return sprintf('<ContentProtection schemeIdUri="urn:uuid:%s" />',
                         uri);
        });
        let source = buildManifestText(adaptationSetLines, [], []);
        let drmInfos = keySystems.map(function(keySystem) {
          return buildDrmInfo(keySystem);
        });
        let expected = buildExpectedManifest(drmInfos);
        await testDashParser(source, expected);
      });
    }

    testKeySystemMappings('for Widevine',
        ['edef8ba9-79d6-4ace-a3c8-27dcd51d21ed'], ['com.widevine.alpha']);
    testKeySystemMappings('for PlayReady',
        ['9a04f079-9840-4286-ab92-e65be0885f95'], ['com.microsoft.playready']);
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
    let source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
    ], [], []);
    let expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha', [
        // Representation 1 key ID
        'deadbeeffeedbaadf00d000008675309',
        // Representation 2 key ID
        'deadbeeffeedbaadf00d000008675309',
      ]),
    ]);
    await testDashParser(source, expected);
  });

  it('sets key IDs for the init data', async () => {
    let source = buildManifestText([
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

    let expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha',
          ['deadbeeffeedbaadf00d000008675309'], // key Id
          ['bm8gaHVtYW4gY2FuIHJlYWQgYmFzZTY0IGRpcmVjdGx5'], // initData
          ['deadbeeffeedbaadf00d000008675309']), // key Id for initData
    ]);
    await testDashParser(source, expected);
  });

  it('lets Representations override key IDs', async () => {
    let source = buildManifestText([
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
    let expected = buildExpectedManifest([
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
    let source = buildManifestText([
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
    let expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha', [], [
        'ZmFrZSBXaWRldmluZSBQU1NI',
      ]),
      buildDrmInfo('com.microsoft.playready', [], [
        'bm8gaHVtYW4gY2FuIHJlYWQgYmFzZTY0IGRpcmVjdGx5',
      ]),
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
      buildDrmInfo('com.microsoft.playready', [], [
        'AAAAKXBzc2gAAAAAmgTweZhAQoarkuZb4IhflQAAAAlQbGF5cmVhZHk=',
      ]),
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
      buildDrmInfo('com.microsoft.playready', [], [
        'bm8gaHVtYW4gY2FuIHJlYWQgYmFzZTY0IGRpcmVjdGx5',
      ]),
    ]);
    await testDashParser(source, expected);
  });

  it('assumes all known key systems for generic CENC', async () => {
    let source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" />',
    ], [], []);
    let expected = buildExpectedManifest(
        // The order does not matter here, so use arrayContaining.
        /** @type {!Array.<!Object>} */(jasmine.arrayContaining([
          buildDrmInfo('com.widevine.alpha'),
          buildDrmInfo('com.microsoft.playready'),
          buildDrmInfo('com.adobe.primetime'),
        ])));
    await testDashParser(source, expected);
  });

  it('assumes all known key systems when ignoreDrmInfo is set', async () => {
    let source = buildManifestText([
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


    let expected = buildExpectedManifest(
        // The order does not matter here, so use arrayContaining.
        // NOTE: the buildDrmInfo calls here specify no init data
        /** @type {!Array.<!Object>} */(jasmine.arrayContaining([
          buildDrmInfo('com.widevine.alpha'),
          buildDrmInfo('com.microsoft.playready'),
          buildDrmInfo('com.adobe.primetime'),
        ])));
    await testDashParser(source, expected, /* callback */ undefined,
                         /* ignoreDrmInfo */ true);
  });

  it('parses key IDs when ignoreDrmInfo flag is set', async () => {
    let source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
    ], [], []);
    let keyIds = [
      // Representation 1 key ID
      'deadbeeffeedbaadf00d000008675309',
      // Representation 2 key ID
      'deadbeeffeedbaadf00d000008675309',
    ];

    let expected = buildExpectedManifest(
        [
          buildDrmInfo('com.widevine.alpha', keyIds),
          buildDrmInfo('com.microsoft.playready', keyIds),
          buildDrmInfo('com.adobe.primetime', keyIds),
        ]);
    await testDashParser(source, expected, /* callback */ undefined,
                         /* ignoreDrmInfo */ true);
  });

  it('inherits PSSH from generic CENC into all key systems', async () => {
    let source = buildManifestText([
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
    let expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha', [], [
        'b25lIGhlYWRlciB0byBydWxlIHRoZW0gYWxs',
      ]),
      buildDrmInfo('com.microsoft.playready', [], [
        'b25lIGhlYWRlciB0byBydWxlIHRoZW0gYWxs',
      ]),
    ]);
    await testDashParser(source, expected);
  });

  it('lets key systems override generic PSSH', async () => {
    let source = buildManifestText([
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
    let expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha', [], [
        'VGltZSBpcyBhbiBpbGx1c2lvbi4gTHVuY2h0aW1lIGRvdWJseSBzby4=',
      ]),
      buildDrmInfo('com.microsoft.playready', [], [
        'b25lIGhlYWRlciB0byBydWxlIHRoZW0gYWxs',
      ]),
    ]);
    await testDashParser(source, expected);
  });

  it('ignores custom or unknown schemes', async () => {
    let source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:feedbaad-f00d-2bee-baad-d00d00000000" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
      '<ContentProtection',
      '  schemeIdUri="http://example.com/drm" />',
    ], [], []);
    let expected = buildExpectedManifest([
      buildDrmInfo('com.widevine.alpha'),
    ]);
    await testDashParser(source, expected);
  });

  it('invokes a callback for unknown schemes', async () => {
    let source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:feedbaad-f00d-2bee-baad-d00d00000000" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
      '<ContentProtection',
      '  schemeIdUri="http://example.com/drm" />',
    ], [], []);

    /**
     * @param {!Element} contentProtection
     * @return {Array.<shaka.extern.DrmInfo>}
     */
    let callback = function(contentProtection) {
      let schemeIdUri = contentProtection.getAttribute('schemeIdUri');
      if (schemeIdUri == 'urn:uuid:feedbaad-f00d-2bee-baad-d00d00000000') {
        return [{
          keySystem: 'com.custom.baadd00d',
          licenseServerUri: '',
          distinctiveIdentifierRequired: false,
          persistentStateRequired: false,
          videoRobustness: '',
          audioRobustness: '',
          serverCertificate: null,
          initData: [],
          keyIds: [],
        }];
      } else if (schemeIdUri == 'http://example.com/drm') {
        return [{
          keySystem: 'com.example.drm',
          licenseServerUri: '',
          distinctiveIdentifierRequired: false,
          persistentStateRequired: false,
          videoRobustness: '',
          audioRobustness: '',
          serverCertificate: null,
          initData: [],
          keyIds: [],
        }];
      } else {
        return null;
      }
    };

    let expected = buildExpectedManifest([
      buildDrmInfo('com.custom.baadd00d'),
      buildDrmInfo('com.widevine.alpha'),
      buildDrmInfo('com.example.drm'),
    ]);

    await testDashParser(source, expected, callback);
  });

  it('inserts a placeholder for unrecognized schemes', async () => {
    let source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:feedbaad-f00d-2bee-baad-d00d00000000" />',
      '<ContentProtection',
      '  schemeIdUri="http://example.com/drm" />',
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
    ], [], []);
    let expected = buildExpectedManifest([
      buildDrmInfo('', // placeholder: only unrecognized schemes found
        [
          // Representation 1 key ID
          'deadbeeffeedbaadf00d000008675309',
          // Representation 2 key ID
          'deadbeeffeedbaadf00d000008675309',
        ]),
    ]);
    await testDashParser(source, expected);
  });

  it('can specify ContentProtection in Representation only', async () => {
    let source = buildManifestText([
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
    let expected = buildExpectedManifest(
        [buildDrmInfo('com.widevine.alpha')]);
    await testDashParser(source, expected);
  });

  it('only keeps key systems common to all Representations', async () => {
    let source = buildManifestText([
      // AdaptationSet lines
    ], [
      // Representation 1 lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
    ], [
      // Representation 2 lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
    ]);
    let expected = buildExpectedManifest(
        [buildDrmInfo('com.widevine.alpha')]);
    await testDashParser(source, expected);
  });

  it('still keeps per-Representation key IDs when merging', async () => {
    let source = buildManifestText([
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
    let expected = buildExpectedManifest([
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
    let source = buildManifestText([
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
    let keyIds = [
      // Representation 1 key ID
      'deadbeeffeedbaadf00d000008675309',
      // Representation 2 key ID
      'baadf00dfeeddeafbeef000004390116',
    ];
    let expected = buildExpectedManifest(
        [
          buildDrmInfo('com.microsoft.playready', keyIds),
          buildDrmInfo('com.widevine.alpha', keyIds),
        ]);
    await testDashParser(source, expected);
  });

  it('parses key IDs from non-cenc in AdaptationSet', async () => {
    let source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
    ], [], []);
    let keyIds = [
      // Representation 1 key ID
      'deadbeeffeedbaadf00d000008675309',
      // Representation 2 key ID
      'deadbeeffeedbaadf00d000008675309',
    ];
    let expected = buildExpectedManifest(
        [
          buildDrmInfo('com.microsoft.playready', keyIds),
          buildDrmInfo('com.widevine.alpha', keyIds),
        ]);
    await testDashParser(source, expected);
  });

  it('ignores elements missing @schemeIdUri', async () => {
    let source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
    ], [], []);
    let expected = buildExpectedManifest(
        [buildDrmInfo('com.widevine.alpha')]);
    await testDashParser(source, expected);
  });

  it('handles non-default namespace names', async () => {
    let source = [
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
    let expected = buildExpectedManifest([buildDrmInfo(
        'com.widevine.alpha', [], ['b25lIGhlYWRlciB0byBydWxlIHRoZW0gYWxs'])]);
    await testDashParser(source, expected);
  });

  it('fails for no schemes common', async () => {
    let source = buildManifestText([
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
    let expected = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_NO_COMMON_KEY_SYSTEM);
    await Dash.testFails(source, expected);
  });

  it('fails for invalid PSSH encoding', async () => {
    let source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">',
      '  <cenc:pssh>foobar!</cenc:pssh>',
      '</ContentProtection>',
    ], [], []);
    let expected = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_PSSH_BAD_ENCODING);
    await Dash.testFails(source, expected);
  });

  it('fails for conflicting default key IDs', async () => {
    let source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"',
      '  cenc:default_KID="DEADBEEF-FEED-BAAD-F00D-000008675309" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
      '  cenc:default_KID="BAADF00D-FEED-DEAF-BEEF-000004390116" />',
    ], [], []);
    let expected = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_CONFLICTING_KEY_IDS);
    await Dash.testFails(source, expected);
  });

  it('fails for multiple key IDs', async () => {
    let source = buildManifestText([
      // AdaptationSet lines
      '<ContentProtection',
      '  schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"',
      '  cenc:default_KID="BAADF00D-FEED-DEAF-BEEF-000004390116 foobar" />',
      '<ContentProtection',
      '  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
    ], [], []);
    let expected = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.DASH_MULTIPLE_KEY_IDS_NOT_SUPPORTED);
    await Dash.testFails(source, expected);
  });
});

describe('In-manifest PlayReady and Widevine', function() {
  const ContentProtection = shaka.dash.ContentProtection;
  const strToXml = function(str) {
    const parser = new DOMParser();
    return parser.parseFromString(str, 'application/xml').documentElement;
  };

  describe('getWidevineLicenseUrl', function() {
    it('valid ms:laurl node', function() {
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
      const expected = 'www.example.com';
      expect(actual).toEqual(expected);
    });

     it('ms:laurl without license url', function() {
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
      const expected = '';
      expect(actual).toEqual(expected);
    });

     it('no ms:laurl node', function() {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml('<test></test>'),
      };
      const actual = ContentProtection.getWidevineLicenseUrl(input);
      const expected = '';
      expect(actual).toEqual(expected);
    });
  });

  describe('getPlayReadyLicenseURL', function() {
    it('mspro', function() {
      const laurl = [
        '<WRMHEADER>',
        '  <DATA>',
        '    <LA_URL>www.example.com</LA_URL>',
        '  </DATA>',
        '</WRMHEADER>',
      ].join('\n');
      const laurlCodes = laurl.split('').map(function(c) {
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

      const encodedPrObject =
        shaka.util.Uint8ArrayUtils.toBase64(new Uint8Array(prBytes.buffer));
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
      const expected = 'www.example.com';
      expect(actual).toEqual(expected);
    });

    it('no mspro', function() {
      const input = {
        init: null,
        keyId: null,
        schemeUri: '',
        node: strToXml('<test></test>'),
      };
      const actual = ContentProtection.getPlayReadyLicenseUrl(input);
      const expected = '';
      expect(actual).toEqual(expected);
    });
  });
});
