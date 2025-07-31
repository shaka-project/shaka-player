/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// region CMCD Manager Setup
describe('CmcdManager Setup', () => {
  const createSegmentContextWithIndex = (segmentIndex) => {
    const baseContext = createSegmentContext();
    return Object.assign({}, baseContext, {
      stream: Object.assign({}, baseContext.stream, {segmentIndex}),
    });
  };

  const createSegmentContext = () => ({
    type: shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT,
    stream: {
      bandwidth: 8000000,
      codecs: 'avc1.42001e',
      mimeType: 'video/mp4',
      type: 'video',
      segmentIndex: 0,
    },

    segment: {startTime: 10, endTime: 12, getUris: () => ['https://test.com/v2seg.mp4']},
  });

  const createMockSegmentIndex = () => {
    const mockNextSegment = {
      getUris: () => ['https://test.com/next-seg.m4v'],
      startByte: 1000,
      endByte: 1999,
    };
    const mockIterator = {
      next: jasmine.createSpy('next')
          .and.returnValue({value: mockNextSegment, done: false}),
    };
    return {
      getIteratorForTime: jasmine.createSpy('getIteratorForTime')
          .and.returnValue(mockIterator),
    };
  };

  const createMockNextSegment = (withByteRange) => {
    const mockNextSegment = {
      getUris: () => ['https://test.com/next-seg.m4v'],
    };

    if (withByteRange) {
      mockNextSegment.startByte = 1000;
      mockNextSegment.endByte = 1999;
    }

    const mockIterator = {
      next: jasmine.createSpy('next')
          .and.returnValue({value: mockNextSegment, done: false}),
    };
    return {
      getIteratorForTime: jasmine.createSpy('getIteratorForTime')
          .and.returnValue(mockIterator),
    };
  };

  beforeEach(() => {
    const resolveScheme = jasmine.createSpy('cmcd').and.callFake(() =>
      shaka.util.AbortableOperation.completed(
          {uri: '', data: new ArrayBuffer(5), headers: {}}));

    shaka.net.NetworkingEngine.registerScheme('cmcd',
        shaka.test.Util.spyFunc(resolveScheme),
        shaka.net.NetworkingEngine.PluginPriority.FALLBACK);
  });

  /**
   * Creates a mock NetworkingEngine configured for CMCD testing.
   * This single function supports both v1 and v2 test suites.
   * @param {shaka.util.CmcdManager} cmcd
   * @return {shaka.net.NetworkingEngine}
   */
  function createNetworkingEngine(cmcd) {
    /** @type {shaka.net.NetworkingEngine} */
    const networkingEngine = new shaka.net.NetworkingEngine(
        /* onStart= */ undefined,
        /* onProgress= */ undefined,
        /* onEnd= */ undefined,
        /* onResponse= */ undefined,
        /* onRequest= */ (type, request, context) => {
          cmcd.applyRequestData(type, request, context);
        },
    );

    networkingEngine.configure(
        shaka.util.PlayerConfiguration.createDefault().networking);

    return networkingEngine;
  }

  // region CMCD V1
  describe('CmcdManager CMCD V1', () => {
    const CmcdManager = shaka.util.CmcdManager;
    const uuidRegex =
      '[A-F\\d]{8}-[A-F\\d]{4}-4[A-F\\d]{3}-[89AB][A-F\\d]{3}-[A-F\\d]{12}';
    const sidRegex = new RegExp(`sid%3D%22${uuidRegex}%22`, 'i');
    const sessionId = '2ed2d1cd-970b-48f2-bfb3-50a79e87cfa3';
    const data = {
      'sid': sessionId,
      'cid': 'xyz',
      'su': false,
      'nor': '../testing/3.m4v',
      'nrr': '0-99',
      'd': 6066.66,
      'mtp': 10049,
      'bs': true,
      'br': 52317,
      'v': 1,
      'pr': 1,
      'com.test-hello': 'world',
      'com.test-testing': 1234,
      'com.test-exists': true,
      'com.test-notExists': false,
      'com.test-token': Symbol('s'),
    };

    const playerInterface = {
      isLive: () => false,
      getLiveLatency: () => 0,
      getBandwidthEstimate: () => 10000000,
      getBufferedInfo: () => ({
        video: [
          {start: 0, end: 5},
          {start: 6, end: 31.234},
          {start: 35, end: 40},
        ],
      }),
      getNetworkingEngine: () => createNetworkingEngine(
          createCmcdManager(playerInterface, createCmcdConfig()),
      ),
      getCurrentTime: () => 10,
      getPlaybackRate: () => 1,
      getVariantTracks: () => /** @type {Array<shaka.extern.Track>} */ ([
        {
          type: 'variant',
          bandwidth: 50000,
          videoBandwidth: 40000,
          audioBandWidth: 10000,
        },
        {
          type: 'variant',
          bandwidth: 5000000,
          videoBandwidth: 4000000,
          audioBandWidth: 1000000,
        },
      ]),
    };

    const config = {
      enabled: true,
      sessionId,
      contentId: 'testing',
      rtpSafetyFactor: 5,
      useHeaders: false,
      includeKeys: [],
      version: 1,
    };

    function createCmcdConfig(cfg = {}) {
      return Object.assign({}, config, cfg);
    }

    function createCmcdManager(player, cfg = {}) {
      return new CmcdManager(player, createCmcdConfig(cfg));
    }

    function createRequest() {
      return {
        uris: ['https://test.com/test.mpd'],
        method: 'GET',
        body: null,
        headers: {
          testing: '1234',
        },
        allowCrossSiteCredentials: false,
        retryParameters: /** @type {shaka.extern.RetryParameters} */ ({}),
        licenseRequestType: null,
        sessionId: null,
        drmInfo: null,
        initData: null,
        initDataType: null,
        streamDataCallback: null,
      };
    }

    const request = createRequest();

    const NetworkingEngine = shaka.net.NetworkingEngine;
    const RequestType = NetworkingEngine.RequestType;

    describe('Query serialization', () => {
      it('produces correctly serialized data', () => {
        const query = CmcdManager.toQuery(data);
        const result =
          // cspell: disable
          'br=52317,bs,cid="xyz",com.test-exists,' +
          'com.test-hello="world",com.test-testing=1234,' +
          'com.test-token=s,d=6067,mtp=10000,' +
          'nor="..%2Ftesting%2F3.m4v",nrr="0-99",' +
          `sid="${sessionId}"`;
          // cspell: enable
        expect(query).toBe(result);
      });

      it('escapes reserve character in string values', () => {
        const query = CmcdManager.toQuery({
          'com.test-escape': 'Double "Quotes"',
        });
        const result = 'com.test-escape="Double \\"Quotes\\""';
        expect(query).toBe(result);
      });
    });

    describe('Header serialization', () => {
      it('produces all header shards', () => {
        const header = CmcdManager.toHeaders(data);
        expect(header).toEqual({
          'CMCD-Object': 'br=52317,d=6067',
          'CMCD-Request': 'com.test-exists,com.test-hello="world",' +
                          'com.test-testing=1234,com.test-token=s,mtp=10000,' +
                          // cspell: disable-next-line
                          'nor="..%2Ftesting%2F3.m4v",nrr="0-99"',
          'CMCD-Session': `cid="xyz",sid="${sessionId}"`,
          'CMCD-Status': 'bs',
        });
      });

      it('ignores empty shards', () => {
        expect(CmcdManager.toHeaders({br: 200})).toEqual({
          'CMCD-Object': 'br=200',
        });
      });
    });

    describe('CmcdManager instance', () => {
      const ObjectUtils = shaka.util.ObjectUtils;

      /** @type shaka.util.CmcdManager */
      let cmcdManager = createCmcdManager(playerInterface);

      const createContext = (type) => {
        return {
          type: type,
          stream: /** @type {shaka.extern.Stream} */ ({
            bandwidth: 5234167,
            codecs: 'avc1.42001e',
            mimeType: 'application/mp4',
            type: 'video',
          }),
          segment: /** @type {shaka.media.SegmentReference} */ ({
            startTime: 0,
            endTime: 3.33,
          }),
        };
      };

      const AdvancedRequestType = NetworkingEngine.AdvancedRequestType;
      const manifestInfo = createContext(AdvancedRequestType.MPD);
      const segmentInfo = createContext(AdvancedRequestType.MEDIA_SEGMENT);

      describe('configuration', () => {
        it('does not modify requests when disabled', () => {
          cmcdManager = createCmcdManager(
              playerInterface,
              {
                enabled: false,
              },
          );

          const r = createRequest();
          cmcdManager.applyManifestData(r, manifestInfo);
          expect(r.uris[0]).toBe(request.uris[0]);

          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.uris[0]).toBe(request.uris[0]);
        });

        it('generates a session id if not provided', () => {
          cmcdManager = createCmcdManager(
              playerInterface,
              {
                sessionId: '',
              },
          );

          const r = ObjectUtils.cloneObject(request);

          cmcdManager.applyManifestData(r, manifestInfo);

          expect(sidRegex.test(r.uris[0])).toBe(true);
        });

        it('generates a session id via configure', () => {
          cmcdManager = createCmcdManager(playerInterface);

          const r = createRequest();
          cmcdManager.applyManifestData(r, manifestInfo);
          expect(r.uris[0].includes(sessionId)).toBe(true);

          const sid = 'c936730c-031e-4a73-976f-92bc34039c60';
          cmcdManager.configure(createCmcdConfig({
            sessionId: sid,
          }));
          cmcdManager.applyManifestData(r, manifestInfo);
          expect(r.uris[0].includes(sessionId)).toBe(false);
          expect(r.uris[0].includes(sid)).toBe(true);

          cmcdManager.configure(createCmcdConfig({
            sessionId: '',
          }));
          cmcdManager.applyManifestData(r, manifestInfo);
          expect(r.uris[0].includes(sessionId)).toBe(false);
          expect(r.uris[0].includes(sid)).toBe(false);
          expect(sidRegex.test(r.uris[0])).toBe(true);
        });

        it('filters keys if includeKeys is provided', () => {
          cmcdManager = createCmcdManager(
              playerInterface,
              {
                includeKeys: ['sid', 'cid'],
              },
          );

          const r = createRequest();
          cmcdManager.applyManifestData(r, manifestInfo);

          const uri = `https://test.com/test.mpd?CMCD=cid%3D%22testing%22%2Csid%3D%22${sessionId}%22`;
          expect(r.uris[0]).toBe(uri);
        });
      });

      describe('query mode', () => {
        it('modifies all request uris', () => {
          // modifies manifest request uris
          cmcdManager = createCmcdManager(playerInterface);

          let r = createRequest();
          cmcdManager.applyManifestData(r, manifestInfo);
          let uri = 'https://test.com/test.mpd?CMCD=cid%3D%22testing%22%2C' +
            'mtp%3D10000%2Cot%3Dm%2Csf%3Dd%2C' +
            `sid%3D%22${sessionId}%22%2Csu`;
          expect(r.uris[0]).toBe(uri);

          // modifies segment request uris
          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          uri =
            `https://test.com/test.mpd?CMCD=bl%3D21200%2Cbr%3D5234%2Ccid%3D%22testing%22%2Cd%3D3330%2Cdl%3D21200%2Cmtp%3D10000%2Cot%3Dv%2Csf%3Dd%2Csid%3D%22${sessionId}%22%2Cst%3Dv%2Csu%2Ctb%3D4000`;
          expect(r.uris[0]).toBe(uri);

          // modifies text request uris
          r = createRequest();
          cmcdManager.applyTextData(r);
          uri =
            `https://test.com/test.mpd?CMCD=cid%3D%22testing%22%2Cmtp%3D10000%2Cot%3Dc%2Csf%3Dd%2Csid%3D%22${sessionId}%22%2Csu`;
          expect(r.uris[0]).toBe(uri);
        });
      });

      describe('header mode', () => {
        it('modifies all request headers', () => {
          cmcdManager = createCmcdManager(
              playerInterface,
              {
                useHeaders: true,
              },
          );

          // modifies manifest request headers
          let r = createRequest();
          cmcdManager.applyManifestData(r, manifestInfo);
          expect(r.headers).toEqual({
            'testing': '1234',
            'CMCD-Object': 'ot=m',
            'CMCD-Request': 'mtp=10000,su',
            'CMCD-Session': 'cid="testing",sf=d,' +
                            `sid="${sessionId}"`,
          });

          // modifies segment request headers
          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers).toEqual({
            'testing': '1234',
            'CMCD-Object': 'br=5234,d=3330,ot=v,tb=4000',
            'CMCD-Request': 'bl=21200,dl=21200,mtp=10000,su',
            'CMCD-Session': 'cid="testing",sf=d,' +
                            `sid="${sessionId}",st=v`,
          });

          // modifies segment request headers
          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers).toEqual({
            'testing': '1234',
            'CMCD-Object': 'br=5234,d=3330,ot=v,tb=4000',
            'CMCD-Request': 'bl=21200,dl=21200,mtp=10000,su',
            'CMCD-Session': 'cid="testing",sf=d,' +
                            `sid="${sessionId}",st=v`,
          });
        });
      });

      describe('src= mode', () => {
        beforeEach(() => {
          cmcdManager = createCmcdManager(playerInterface);
        });

        it('modifies media stream uris', () => {
          const r = cmcdManager
              .appendSrcData('https://test.com/test.mp4', 'video/mp4');
          const uri = 'https://test.com/test.mp4?CMCD=cid%3D%22testing%22%2C' +
                      'mtp%3D10000%2Cot%3Dav%2C' +
                      `sid%3D%22${sessionId}%22%2Csu`;
          expect(r).toBe(uri);
        });

        it('modifies manifest stream uris', () => {
          const r = cmcdManager
              .appendSrcData('https://test.com/test.m3u8', 'application/x-mpegurl');
          const uri = 'https://test.com/test.m3u8?CMCD=cid%3D%22testing%22%2C' +
                      'mtp%3D10000%2Cot%3Dm%2C' +
                      `sid%3D%22${sessionId}%22%2Csu`;
          expect(r).toBe(uri);
        });

        it('modifies text track uris', () => {
          const r = cmcdManager.appendTextTrackData('https://test.com/test.vtt');
          const uri = 'https://test.com/test.vtt?CMCD=cid%3D%22testing%22%2C' +
                      'mtp%3D10000%2Cot%3Dc%2C' +
                      `sid%3D%22${sessionId}%22%2Csu`;
          expect(r).toBe(uri);
        });
      });

      describe('adheres to the spec', () => {
        beforeEach(() => {
          cmcdManager = createCmcdManager(
              playerInterface,
              {
                useHeaders: true,
              },
          );
          cmcdManager.setBuffering(false);
          cmcdManager.setBuffering(true);
        });

        it('sends bs only once', () => {
          let r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers['CMCD-Status']).toContain('bs');

          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers['CMCD-Status']).not.toContain('bs');
        });

        it('sends su until buffering is complete', () => {
          let r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers['CMCD-Request']).toContain(',su');

          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers['CMCD-Request']).toContain(',su');

          cmcdManager.setBuffering(false);
          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers['CMCD-Request']).not.toContain(',su');
        });

        describe('applies core CMCD params to net engine requests', () => {
          /** @type {shaka.net.NetworkingEngine} */
          let networkingEngine;
          const uri = 'cmcd://foo';
          const retry = NetworkingEngine.defaultRetryParameters();

          beforeEach(() => {
            cmcdManager = createCmcdManager(playerInterface);
            networkingEngine = createNetworkingEngine(cmcdManager);
          });

          it('HEAD requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            request.method = 'HEAD';
            await networkingEngine.request(RequestType.MANIFEST, request);

            const result = request.uris[0];
            expect(result).toContain('?CMCD=');
            expect(result).toContain(encodeURIComponent('sid="'));
            expect(result).toContain(encodeURIComponent('cid="testing"'));
            expect(result).not.toContain(encodeURIComponent('sf='));
          });

          it('dash manifest requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.MANIFEST, request,
                {type: AdvancedRequestType.MPD});

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=m'));
            expect(result).toContain(encodeURIComponent('sf=d'));
          });

          it('hls manifest requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.MANIFEST, request,
                {type: AdvancedRequestType.MASTER_PLAYLIST});

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=m'));
            expect(result).toContain(encodeURIComponent('sf=h'));
          });

          it('hls playlist requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.MANIFEST, request,
                {type: AdvancedRequestType.MEDIA_PLAYLIST});

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=m'));
            expect(result).toContain(encodeURIComponent('sf=h'));
          });

          it('init segment requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.SEGMENT, request,
                {type: AdvancedRequestType.INIT_SEGMENT});

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=i'));
          });

          it('media segment requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(
                RequestType.SEGMENT,
                request,
                manifestInfo,
            );

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=v'));
          });

          it('key requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.KEY, request);

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=k'));
          });

          it('license requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.LICENSE, request);

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=k'));
          });

          it('cert requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.SERVER_CERTIFICATE,
                request);

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=k'));
          });

          it('timing requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.TIMING, request);

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=o'));
          });

          it('not when enabled is false', async () => {
            cmcdManager = createCmcdManager(
                playerInterface,
                {
                  enabled: false,
                },
            );
            networkingEngine = createNetworkingEngine(cmcdManager);

            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.TIMING, request);

            const result = request.uris[0];
            expect(result).not.toContain('?CMCD=');
          });

          it('returns cmcd v2 data in query if version is 2', async () => {
            // Set live to true to enable ltc
            playerInterface.isLive = () => true;
            cmcdManager = createCmcdManager(
                playerInterface,
                {
                  version: 2,
                  includeKeys: ['ltc', 'msd', 'v'],
                },
            );
            networkingEngine = createNetworkingEngine(cmcdManager);

            // Trigger Play and Playing events
            cmcdManager.onPlaybackPlay_();
            cmcdManager.onPlaybackPlaying_();
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.MANIFEST, request,
                {type: AdvancedRequestType.MPD});
            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('v=2'));
            expect(result).toContain(encodeURIComponent('ltc'));
            expect(result).toContain(encodeURIComponent('msd'));
          });

          it('doesn\'t return cmcd v2 data in query if version is not 2',
              async () => {
                // Set live to true to enable ltc
                playerInterface.isLive = () => true;

                const cmcdManagerTmp = createCmcdManager(
                    playerInterface,
                    {
                      version: 1,
                      includeKeys: ['ltc', 'msd'],
                    },
                );
                networkingEngine = createNetworkingEngine(cmcdManagerTmp);

                // Trigger Play and Playing events
                cmcdManagerTmp.onPlaybackPlay_();
                cmcdManagerTmp.onPlaybackPlaying_();

                const request = NetworkingEngine.makeRequest([uri], retry);
                await networkingEngine.request(RequestType.MANIFEST, request,
                    {type: AdvancedRequestType.MPD});
                const result = request.uris[0];
                expect(result).not.toContain(encodeURIComponent('ltc'));
                expect(result).not.toContain(encodeURIComponent('msd'));
              });

          it('returns cmcd v2 data in header if version is 2', async () => {
            playerInterface.isLive = () => true;
            cmcdManager = createCmcdManager(
                playerInterface,
                {
                  version: 2,
                  includeKeys: ['ltc', 'msd'],
                  useHeaders: true,
                },
            );
            networkingEngine = createNetworkingEngine(cmcdManager);

            // Trigger Play and Playing events
            cmcdManager.onPlaybackPlay_();
            cmcdManager.onPlaybackPlaying_();
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.MANIFEST, request,
                {type: AdvancedRequestType.MPD});
            expect(request.headers['CMCD-Request']).toContain('ltc');
            expect(request.headers['CMCD-Session']).toContain('msd');
          });

          it('doesn\'t return cmcd v2 data in headers if version is not 2',
              async () => {
                playerInterface.isLive = () => true;
                cmcdManager = createCmcdManager(
                    playerInterface,
                    {
                      version: 1,
                      includeKeys: ['ltc', 'msd'],
                      useHeaders: true,
                    },
                );
                networkingEngine = createNetworkingEngine(cmcdManager);
                cmcdManager.onPlaybackPlay_();
                cmcdManager.onPlaybackPlaying_();
                const request = NetworkingEngine.makeRequest([uri], retry);
                await networkingEngine.request(RequestType.MANIFEST, request,
                    {type: AdvancedRequestType.MPD});
                expect(request.headers['CMCD-Request']).not.toContain('ltc');
                expect(request.headers['CMCD-Session']).not.toContain('msd');
              },
          );

          it('generates `nrr` for CMCD V1 segment requests', () => {
            cmcdManager = createCmcdManager(
                playerInterface,
                {
                  version: 1,
                  includeKeys: ['ltc', 'msd', 'nrr'],
                  useHeaders: false,
                },
            );

            const request = createRequest();
            const context = createSegmentContextWithIndex(
                createMockSegmentIndex(),
            );

            cmcdManager.applyRequestSegmentData(request, context);
            const decodedUri = decodeURIComponent(request.uris[0]);

            expect(decodedUri).toContain('nrr="1000-1999"');
          });

          it('generates `nor` for URL-based segment requests', () => {
            const cmcdManager = createCmcdManager(
                playerInterface,
            );
            const request = createRequest();

            const context =
                createSegmentContextWithIndex(createMockNextSegment(false));

            cmcdManager.applyRequestSegmentData(request, context);
            const decodedUri = decodeURIComponent(request.uris[0]);

            expect(decodedUri).toContain('nor="next-seg.m4v"');
            expect(decodedUri).not.toContain('nrr=');
          });

          it('generates `nrr` for byte-range segment requests', () => {
            const cmcdManager = createCmcdManager(
                playerInterface,
            );
            const request = createRequest();
            // Create a context where the next segment HAS a byte range
            const context =
                createSegmentContextWithIndex(createMockNextSegment(true));

            cmcdManager.applyRequestSegmentData(request, context);
            const decodedUri = decodeURIComponent(request.uris[0]);

            expect(decodedUri).toContain('nrr="1000-1999"');
            expect(decodedUri).toContain('nor=');
          });
        });
      });
    });
  });

  // region CMCD V2
  describe('CmcdManager CMCD v2', () => {
    const CmcdManager = shaka.util.CmcdManager;
    const sessionId = 'e98d4f72-cc6d-4c60-96a2-44c7bfc2ddee';

    // Mock data and interfaces
    const mockPlayerData = {
      'v': 2,
      'sid': sessionId,
      'cid': 'xyz',
      'su': false,
      'nor': '../testing/3.m4v',
      'nrr': '0-99',
      'd': 6066.66,
      'mtp': 10049,
      'bs': true,
      'br': 52317,
      'pr': 1.5,
      'msd': 700,
      'ltc': 3100,
      'ab': 3500,
      'bl': 4500,
      'tbl': 6000,
      'dl': 8000,
      'rtp': 30000,
      'com.test-hello': 'world',
      'com.test-testing': 1234,
      'com.test-exists': true,
      'com.test-notExists': false,
      'com.test-token': Symbol('s'),
    };

    const playerInterface = {
      isLive: () => true,
      getLiveLatency: () => 3100,
      getBandwidthEstimate: () => 10000000,
      getNetworkingEngine: () => createNetworkingEngine(
          createCmcdManager(playerInterface, createCmcdConfig()),
      ),
      getBufferedInfo: () => ({
        video: [
          {start: 0, end: 15},
          {start: 6, end: 31.234},
          {start: 35, end: 40},
        ],
      }),
      getCurrentTime: () => 5,
      getPlaybackRate: () => 1.25,
      getVariantTracks: () => [
        {
          type: 'variant',
          bandwidth: 50000,
          videoBandwidth: 40000,
          audioBandwidth: 10000,
        },
        {
          type: 'variant',
          bandwidth: 5000000,
          videoBandwidth: 4000000,
          audioBandwidth: 1000000,
        },
      ],
    };

    const baseConfig = {
      enabled: true,
      sessionId,
      contentId: 'v2content',
      rtpSafetyFactor: 5,
      useHeaders: false,
      includeKeys: [],
      version: 2,
      targets: [{
        mode: 'response',
        enabled: true,
        url: 'https://example.com/cmcd-collector',
        useHeaders: false,
      }],
    };

    const createCmcdConfig = (cfg = {}) => Object.assign({}, baseConfig, cfg);
    const createCmcdManager = (player, cfg = {}) => new CmcdManager(
        player, createCmcdConfig(cfg),
    );

    const createRequest = () => ({
      uris: ['https://test.com/v2test.mpd'],
      method: 'GET',
      body: null,
      headers: {testing: '1234'},
      allowCrossSiteCredentials: false,
      retryParameters: {},
    });

    const createResponse = () => ({
      uri: 'https://test.com/v2seg.mp4',
      headers: {},
      data: new ArrayBuffer(8),
    });

    describe('Serialization', () => {
      it('serializes data to a query string', () => {
        const query = CmcdManager.toQuery({v: 2, msd: 250});
        expect(query).toContain('v=2');
        expect(query).toContain('msd=250');
      });

      it('serializes data to headers', () => {
        const headers = CmcdManager.toHeaders(mockPlayerData);
        expect(headers['CMCD-Session']).toContain(`sid="${sessionId}"`);
        expect(headers['CMCD-Session']).toContain('v=2');
      });
    });

    describe('Configuration and Mode Handling', () => {
      it('filters CMCD response mode keys correctly', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [{
                mode: 'response',
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['sid', 'cid', 'com.test-hello'],
                useHeaders: false,
              }],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();
        const response = createResponse();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        const cmcdParam = response.uri.split('CMCD=')[1];
        const decoded = decodeURIComponent(cmcdParam);

        expect(decoded).toContain('sid=');
        expect(decoded).toContain('cid=');

        expect(decoded).not.toContain('v=2');
        expect(decoded).not.toContain('msd=');
        expect(decoded).not.toContain('ltc=');
        expect(decoded).not.toContain('com.test-hello=');
      });

      it('applies CMCD data to request URL in query mode', () => {
        const cmcdManager = createCmcdManager(playerInterface);
        const request = createRequest();
        cmcdManager.applyManifestData(request, {});

        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('CMCD=');
        expect(decodedUri).toContain('v=2');
      });

      it('applies CMCD data to request headers in header mode', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {useHeaders: true},
        );

        const request = createRequest();
        cmcdManager.applyManifestData(request, {});
        expect(request.headers['CMCD-Session']).toContain(`sid="${sessionId}"`);
        expect(request.headers['CMCD-Session']).toContain('v=2');
      });

      it('applies CMCD data to response URL in query mode', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              version: 2,
              targets: [{
                mode: 'response',
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['sid', 'cid', 'v'],
                useHeaders: false,
              }],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response = createRequest();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        const decodedUri = decodeURIComponent(response.uri);
        expect(decodedUri).toContain('CMCD=');
        expect(decodedUri).toContain('v=2');
        expect(decodedUri).toContain('sid=');
        expect(decodedUri).toContain('cid=');
      });

      it('applies CMCD data to response headers in header mode', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              version: 2,
              targets: [{
                mode: 'response',
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['sid', 'v'],
                useHeaders: true,
              }],
            },
        );

        const response = createResponse();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        expect(response.headers['CMCD-Session'])
            .toContain(`sid="${sessionId}"`);

        expect(response.headers['CMCD-Session'])
            .toContain('v=2');
      });

      it('applies v2 keys to response uri in response mode', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [{
                mode: 'response',
                enabled: true,
                url: 'https://example.com/cmcd-collector',
                includeKeys: ['sid', 'cid', 'msd', 'ltc', 'v'],
                useHeaders: false,
              }],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();
        const response = createResponse();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        const cmcdParam = response.uri.split('CMCD=')[1];
        const decoded = decodeURIComponent(cmcdParam);

        expect(decoded).toContain('sid=');
        expect(decoded).toContain('cid=');
        expect(decoded).toContain('msd=');
        expect(decoded).toContain('ltc=');
        expect(decoded).toContain('v=2');

        expect(decoded).not.toContain('br=');
        expect(decoded).not.toContain('mtp=');
      });

      it('filters keys in response mode based on includeKeys', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd'],
              })],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        const decodedUri = decodeURIComponent(response.uri);
        expect(decodedUri).toContain('sid=');
        expect(decodedUri).toContain('msd=');
        expect(decodedUri).not.toContain('v=2');
      });

      it('filters keys in request mode based on includeKeys', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd'],
              })],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        const decodedUri = decodeURIComponent(response.uri);
        expect(decodedUri).toContain('sid=');
        expect(decodedUri).toContain('msd=');
        expect(decodedUri).not.toContain('v=2');
      });
    });

    describe('CMCD v2 Key Generation', () => {
      it('includes ltc for live content request mode', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd'],
              })],
            },
        );

        const request = createRequest();
        cmcdManager.applyManifestData(request, {});
        expect(decodeURIComponent(request.uris[0])).toContain('ltc=');
      });

      it('includes ltc for live content response mode', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd', 'ltc'],
              })],
            },
        );

        const response = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        expect(decodeURIComponent(response.uri)).toContain('ltc=');
      });

      it('sends `msd` only on the first request', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd'],
              })],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const request1 = createRequest();
        cmcdManager.applyManifestData(request1, {});
        expect(decodeURIComponent(request1.uris[0])).toContain('msd=');

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const request2 = createRequest();
        cmcdManager.applyManifestData(request2, {});
        expect(decodeURIComponent(request2.uris[0])).not.toContain('msd=');
      });

      it('sends `msd` only on the first response', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd'],
              })],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response1 = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response1,
            createSegmentContext(),
        );

        expect(decodeURIComponent(response1.uri)).toContain('msd=');

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response2 = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response2,
            createSegmentContext(),
        );

        expect(decodeURIComponent(response2.uri)).not.toContain('msd=');
      });

      it('should generate "sf" for manifest requests', () => {
        const cmcdManager = createCmcdManager(playerInterface);
        const r = createRequest();

        const context = {
          type: shaka.net.NetworkingEngine.AdvancedRequestType.MPD,
        };

        cmcdManager.applyManifestData(r, context);
        const decoded = decodeURIComponent(r.uris[0]);

        expect(decoded).toContain('sf=d');
      });

      it('should generate "sf" for segment responses', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sf'],
              })],
            },
        );

        const manifestContext = {
          type: shaka.net.NetworkingEngine.AdvancedRequestType.MPD,
        };

        cmcdManager.applyManifestData(createRequest(), manifestContext);

        const response = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );
        const decoded = decodeURIComponent(response.uri);

        expect(decoded).toContain('sf=d');
      });

      it('should generate "bs" after a rebuffering event request', () => {
        const cmcdManager = createCmcdManager(playerInterface);
        const context = createSegmentContextWithIndex(createMockSegmentIndex());

        cmcdManager.setBuffering(false);
        cmcdManager.setBuffering(true);

        const r1 = createRequest();
        cmcdManager.applyRequestSegmentData(r1, context);
        const decoded1 = decodeURIComponent(r1.uris[0]);

        expect(decoded1).toContain('bs');

        const r2 = createRequest();
        cmcdManager.applyRequestSegmentData(r2, context);
        const decoded2 = decodeURIComponent(r2.uris[0]);

        expect(decoded2).not.toContain('bs');
      });

      it('should generate "bs" after a rebuffering event response mode', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['bs', 'ot'],
              })],
            },
        );
        const context = createSegmentContext();
        const response = createResponse();

        cmcdManager.setBuffering(false);
        cmcdManager.setBuffering(true);

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            context,
        );

        const decodedUri1 = decodeURIComponent(response.uri);

        expect(decodedUri1).toContain('bs');

        const response2 = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response2,
            context,
        );
        const decodedUri2 = decodeURIComponent(response2.uri);

        expect(decodedUri2).not.toContain('bs');
      });

      it('generates `rtp` for segment requests', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd', 'rtp'],
              })],
            },
        );

        const request = createRequest();
        const context = createSegmentContextWithIndex(createMockSegmentIndex());
        cmcdManager.applyRequestSegmentData(request, context);
        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('rtp=');
      });

      it('request excludes `nrr` key for v2, even if requested', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              includeKeys: ['nrr', 'rtp'],
            },
        );
        const request = createRequest();
        const context = createSegmentContextWithIndex(createMockSegmentIndex());

        cmcdManager.applyRequestSegmentData(request, context);
        const decodedUri = decodeURIComponent(request.uris[0]);

        expect(decodedUri).not.toContain('nrr=');
        expect(decodedUri).toContain('rtp=');
      });

      it('generates `nor` for URL-based segment requests', () => {
        const cmcdManager = createCmcdManager(playerInterface);
        const request = createRequest();
        const context =
            createSegmentContextWithIndex(createMockNextSegment(false));

        cmcdManager.applyRequestSegmentData(request, context);
        const decodedUri = decodeURIComponent(request.uris[0]);

        expect(decodedUri).toContain('nor="next-seg.m4v"');
        expect(decodedUri).not.toContain('nrr=');
      });

      it('generates `rtp` for segment responses', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd', 'rtp', 'nor'],
              })],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response = createResponse();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContextWithIndex(createMockSegmentIndex()),
        );

        const decodedUri = decodeURIComponent(response.uri);
        expect(decodedUri).toContain('rtp=');
      });

      it('generates `nor` for URL-based segment responses', () => {
        const cmcdManager = createCmcdManager(playerInterface);
        const response = createResponse();
        const context =
            createSegmentContextWithIndex(createMockNextSegment(false));

        cmcdManager.applyResponseSegmentData(response, context);
        const decodedUri = decodeURIComponent(response.uri);

        expect(decodedUri).toContain('nor="next-seg.m4v"');
        expect(decodedUri).not.toContain('nrr=');
      });

      it('response excludes `nrr` key for v2, even if requested', () => {
        const cmcdManager = createCmcdManager(
            playerInterface,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd', 'rtp', 'nor', 'nrr'],
              })],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response = createResponse();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContextWithIndex(createMockSegmentIndex()),
        );

        const decodedUri = decodeURIComponent(response.uri);
        expect(decodedUri).toContain('rtp=');
        expect(decodedUri).not.toContain('nrr=');
      });

      it('request does not include v2 keys if version is not 2', () => {
        const nonV2Manager = createCmcdManager(
            playerInterface,
            {version: 1, includeKeys: ['msd', 'ltc']},
        );
        const request = createRequest();
        nonV2Manager.applyManifestData(request, {});
        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).not.toContain('msd=');
        expect(decodedUri).not.toContain('ltc=');
      });

      it('response does not include v2 keys if version is not 2', () => {
        const nonV2Manager = createCmcdManager(
            playerInterface,
            {version: 1, includeKeys: ['msd', 'ltc']},
        );
        const response = createResponse();
        nonV2Manager.applyResponseData(response, {});

        const decodedUri = decodeURIComponent(response.uri);
        expect(decodedUri).not.toContain('msd=');
        expect(decodedUri).not.toContain('ltc=');
      });
    });

    // region CMCD V2 Event mode
    describe('Event Mode', () => {
      /**
       * A mock media element that extends FakeEventTarget and adds properties
       * for testing CMCD event mode.
       * @extends {shaka.util.FakeEventTarget}
       */
      class MockMediaElement extends shaka.util.FakeEventTarget {
        constructor() {
          super();
          /** @type {boolean} */
          this.muted = false;
        }
      }

      let networkingEngine;
      let requestSpy;

      beforeEach(() => {
        requestSpy = jasmine.createSpy('request');
        networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
      });

      it('sends player state change events', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'v'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(
            playerInterfaceWithNE,
            config,
        );
        cmcdManager.setMediaElement(eventTarget);
        cmcdManager.configure(config);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        let decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="s"');
        expect(decodedUri).toContain('v=2');

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('playing'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="p"');
        expect(decodedUri).toContain('v=2');

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('pause'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="a"');

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('waiting'));
        request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="w"');

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('seeking'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="k"');

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('ended'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="e"');
      });

      it('sends mute and unmute events', () => {
        const mockMediaElement = /** @type {!MockMediaElement} */ (
          new MockMediaElement());

        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'v'],
            events: ['m', 'um'],
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(mockMediaElement);

        // Mute
        mockMediaElement.muted = true;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'),
        );

        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        let decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="m"');
        expect(decodedUri).toContain('v=2');

        // Unmute
        mockMediaElement.muted = false;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'),
        );

        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="um"');
      });

      it('sends time interval events', () => {
        jasmine.clock().install();
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            timeInterval: 1,
            includeKeys: ['e', 'v'],
          }],
        };

        const cmcdManager = createCmcdManager(
            playerInterfaceWithNE,
            config,
        );
        cmcdManager.setMediaElement(eventTarget);
        cmcdManager.configure(config);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));

        jasmine.clock().tick(1001);
        const request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="t"');
        expect(decodedUri).toContain('v=2');
        jasmine.clock().uninstall();
      });

      it('sends `msd` only on the first event', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            playerInterfaceWithNE,
            {
              targets: [{
                mode: 'event',
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['msd', 'e', 'sta'],
              }],
            },
        );
        cmcdManager.setMediaElement(eventTarget);
        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        expect(requestSpy).toHaveBeenCalled();

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('playing'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        expect(requestSpy).toHaveBeenCalled();

        let decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('msd=');

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('pause'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        expect(requestSpy).toHaveBeenCalled();

        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).not.toContain('msd=');

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        expect(requestSpy).toHaveBeenCalled();

        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).not.toContain('msd=');
      });

      it('filters events based on the target configuration', () => {
        const mockMediaElement = /** @type {!MockMediaElement} */ (
          new MockMediaElement());

        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta'],
            events: ['m'],
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(mockMediaElement);

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).not.toHaveBeenCalled();

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('pause'));
        // Should not have been called again for 'pause'
        expect(requestSpy).not.toHaveBeenCalled();

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('seeking'));
        // Should not have been called again for 'seeking'
        expect(requestSpy).not.toHaveBeenCalled();

        // Mute
        /** @type boolean */
        mockMediaElement.muted = true;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'),
        );

        const request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="m"');
        expect(decodedUri).not.toContain('e="ps"');
        expect(decodedUri).not.toContain('sta="p"');
        expect(decodedUri).not.toContain('sta="a"');
        expect(decodedUri).not.toContain('sta="k"');

        // Should not have been called again for 'seeking'
        expect(requestSpy).toHaveBeenCalledTimes(1);
      });

      it('includes other CMCD data with event requests', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          sessionId: sessionId,
          contentId: 'v2-event-content',
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'bl', 'mtp', 'cid'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(eventTarget);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        let decodedUri = decodeURIComponent(request.uris[0]);

        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="s"');
        expect(decodedUri).toContain('mtp=');
        expect(decodedUri).toContain('cid="v2-event-content"');

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('playing'));

        expect(requestSpy).toHaveBeenCalled();
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);

        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="p"');
        expect(decodedUri).toContain('mtp=');
        expect(decodedUri).toContain('cid="v2-event-content"');
      });

      it('does not send events if the target is disabled', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: false, // Target is disabled
            url: 'https://example.com/cmcd',
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(eventTarget);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).not.toHaveBeenCalled();
      });

      it('does not send events if CMCD version is 1', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 1, // CMCD v1
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(eventTarget);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).not.toHaveBeenCalled();
      });

      it('filters out keys that are not valid for event mode', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            // d and rtp are not valid for event mode
            includeKeys: ['e', 'sta', 'bl', 'd', 'rtp'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(eventTarget);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).toHaveBeenCalled();
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        let decodedUri = decodeURIComponent(request.uris[0]);

        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="s"');
        expect(decodedUri).not.toContain('d=');
        expect(decodedUri).not.toContain('rtp=');

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('playing'));

        expect(requestSpy).toHaveBeenCalled();
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);

        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="p"');
        expect(decodedUri).not.toContain('d=');
        expect(decodedUri).not.toContain('rtp=');
      });

      it('sends events to multiple targets', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
          Object.assign({}, playerInterface, {
            getNetworkingEngine: () => networkingEngine,
          });

        const config = {
          version: 2,
          enabled: true,
          targets: [
            {
              mode: 'event',
              enabled: true,
              url: 'https://example.com/cmcd1',
              includeKeys: ['e', 'sta'],
              events: ['ps'],
            },
            {
              mode: 'event',
              enabled: true,
              url: 'https://example.com/cmcd2',
              includeKeys: ['e', 'sta', 'v'],
              events: ['ps'],
            },
          ],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(eventTarget);
        cmcdManager.configure(config);

        // Dispatch 'play' event
        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));

        // After 'play', two requests should have been sent
        expect(requestSpy).toHaveBeenCalledTimes(2);

        const playCalls = /** @type {!jasmine.Spy} */
            (requestSpy).calls.all().map((call) => call.args[1]);
        const playCall1 = playCalls.find((req) => req.uris[0].startsWith('https://example.com/cmcd1'));
        const playCall2 = playCalls.find((req) => req.uris[0].startsWith('https://example.com/cmcd2'));

        // Assertions for the 'play' event
        const decodedUri1 = decodeURIComponent(playCall1.uris[0]);
        expect(decodedUri1).toContain('e="ps"');
        expect(decodedUri1).toContain('sta="s"');
        expect(decodedUri1).not.toContain('v=2');

        const decodedUri2 = decodeURIComponent(playCall2.uris[0]);
        expect(decodedUri2).toContain('e="ps"');
        expect(decodedUri2).toContain('sta="s"');
        expect(decodedUri2).toContain('v=2');

        // Reset the spy before the next event to have clean calls
        /** @type {!jasmine.Spy} */ (requestSpy).calls.reset();

        // Dispatch 'playing' event
        eventTarget.dispatchEvent(new shaka.util.FakeEvent('playing'));

        // After 'playing', two more requests should have been sent
        expect(requestSpy).toHaveBeenCalledTimes(2);

        const playingCalls = /** @type {!jasmine.Spy} */
          (requestSpy).calls.all().map((call) => call.args[1]);
        const playingCall1 = playingCalls.find((req) => req.uris[0].startsWith('https://example.com/cmcd1'));
        const playingCall2 = playingCalls.find((req) => req.uris[0].startsWith('https://example.com/cmcd2'));

        // Assertions for the 'playing' event
        const decodedUri3 = decodeURIComponent(playingCall1.uris[0]);
        expect(decodedUri3).toContain('e="ps"');
        expect(decodedUri3).toContain('sta="p"');
        expect(decodedUri3).not.toContain('v=2');

        const decodedUri4 = decodeURIComponent(playingCall2.uris[0]);
        expect(decodedUri4).toContain('e="ps"');
        expect(decodedUri4).toContain('sta="p"');
        expect(decodedUri4).toContain('v=2');
      });

      it('sends events using headers', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          sessionId: sessionId,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'v', 'sid'],
            events: ['ps'],
            useHeaders: true,
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(eventTarget);
        cmcdManager.configure(config);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        expect(request.uris[0]).toBe('https://example.com/cmcd');
        expect(request.headers['CMCD-Request']).toContain('e="ps"');
        expect(request.headers['CMCD-Request']).toContain('sta="s"');
        expect(request.headers['CMCD-Request']).toContain('ts=');

        expect(request.headers['CMCD-Session']).toContain('v=2');
        expect(request.headers['CMCD-Session']).toContain(`sid="${sessionId}"`);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('playing'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        expect(request.uris[0]).toBe('https://example.com/cmcd');
        expect(request.headers['CMCD-Request']).toContain('e="ps"');
        expect(request.headers['CMCD-Request']).toContain('sta="p"');
        expect(request.headers['CMCD-Request']).toContain('ts=');
        expect(request.headers['CMCD-Session']).toContain('v=2');
        expect(request.headers['CMCD-Session']).toContain(`sid="${sessionId}"`);
      });

      it('includes timestamp (ts) in event reports', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'ts'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(eventTarget);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).toHaveBeenCalled();
        const request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toMatch(/ts=\d+/);
      });

      it('always includes timestamp (ts) in event reports', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta'], // ts is omitted
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(eventTarget);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).toHaveBeenCalled();
        const request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toMatch(/ts=\d+/);
      });

      it('sends all allowed keys when includeKeys is empty', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
            Object.assign({}, playerInterface, {
              getNetworkingEngine: () => networkingEngine,
            });

        const config = {
          version: 2,
          enabled: true,
          sessionId: sessionId,
          contentId: 'v2-event-content',
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: [],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(eventTarget);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).toHaveBeenCalled();
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        let decodedUri = decodeURIComponent(request.uris[0]);

        // Check for essential event keys
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="s"');

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('playing'));

        expect(requestSpy).toHaveBeenCalled();
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);

        // Check for essential event keys
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="p"');

        // Check for other common keys that should be included by default
        expect(decodedUri).toContain(`sid="${sessionId}"`);
        expect(decodedUri).toContain('cid="v2-event-content"');
        expect(decodedUri).toContain('v=2');
        expect(decodedUri).toContain('mtp=');
        expect(decodedUri).toMatch(/ts=\d+/);
      });

      it('sends all event types when events array is empty', () => {
        const mockMediaElement = new MockMediaElement();
        const playerInterfaceWithNE =
            Object.assign({}, playerInterface, {
              getNetworkingEngine: () => networkingEngine,
            });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta'],
            events: [],
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(mockMediaElement);

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('play'));
        expect(requestSpy).toHaveBeenCalledTimes(1);
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        let decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="s"');

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('playing'));
        expect(requestSpy).toHaveBeenCalledTimes(2);
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="p"');

        mockMediaElement.muted = true;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'));
        expect(requestSpy).toHaveBeenCalledTimes(3);
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="m"');

        mockMediaElement.muted = false;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'));
        expect(requestSpy).toHaveBeenCalledTimes(4);
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="um"');
      });

      it('sends all keys for all events when both arrays are empty', () => {
        const mockMediaElement = new MockMediaElement();
        const playerInterfaceWithNE =
            Object.assign({}, playerInterface, {
              getNetworkingEngine: () => networkingEngine,
            });

        const config = {
          version: 2,
          enabled: true,
          sessionId: sessionId,
          contentId: 'v2-event-content-all',
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: [],
            events: [],
          }],
        };

        const cmcdManager = createCmcdManager(playerInterfaceWithNE, config);
        cmcdManager.setMediaElement(mockMediaElement);

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('play'));
        expect(requestSpy).toHaveBeenCalledTimes(1);
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        let decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="s"');
        expect(decodedUri).toContain(`sid="${sessionId}"`);
        expect(decodedUri).toContain(`cid="v2-event-content-all"`);
        expect(decodedUri).toContain('v=2');
        expect(decodedUri).toMatch(/ts=\d+/);

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('playing'));
        expect(requestSpy).toHaveBeenCalledTimes(2);
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="p"');
        expect(decodedUri).toContain(`sid="${sessionId}"`);
        expect(decodedUri).toContain(`cid="v2-event-content-all"`);
        expect(decodedUri).toContain('v=2');
        expect(decodedUri).toMatch(/ts=\d+/);

        mockMediaElement.muted = true;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'));
        expect(requestSpy).toHaveBeenCalledTimes(3);
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="m"');
        expect(decodedUri).toContain(`sid="${sessionId}"`);
        expect(decodedUri).toContain(`cid="v2-event-content-all"`);
        expect(decodedUri).toContain('v=2');
      });

      it('does not send time interval events when timeInterval is 0', () => {
        jasmine.clock().install();
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            timeInterval: 0,
          }],
        };

        const cmcdManager = createCmcdManager(
            playerInterfaceWithNE,
            config,
        );
        cmcdManager.setMediaElement(eventTarget);
        cmcdManager.configure(config);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));
        expect(requestSpy).toHaveBeenCalledTimes(1);

        jasmine.clock().tick(20000);

        expect(requestSpy).toHaveBeenCalledTimes(1);

        jasmine.clock().uninstall();
      });

      it('uses default time interval when not specified', () => {
        jasmine.clock().install();
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            // timeInterval is not defined, should default to 10s.
            includeKeys: ['e', 'v'],
          }],
        };

        const cmcdManager = createCmcdManager(
            playerInterfaceWithNE,
            config,
        );
        cmcdManager.setMediaElement(eventTarget);
        cmcdManager.configure(config);

        eventTarget.dispatchEvent(new shaka.util.FakeEvent('play'));
        expect(requestSpy).not.toHaveBeenCalled();

        // Default time interval is 10 seconds.
        jasmine.clock().tick(10001);

        expect(requestSpy).toHaveBeenCalledTimes(1);
        const request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="t"');
        expect(decodedUri).toContain('v=2');

        jasmine.clock().uninstall();
      });

      it('sends rebuffering play state change event', () => {
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'v'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(
            playerInterfaceWithNE,
            config,
        );
        cmcdManager.setMediaElement(new shaka.util.FakeEventTarget());
        cmcdManager.configure(config);

        // Simulate playback start
        cmcdManager.setBuffering(false);
        (/** @type {!jasmine.Spy} */ (requestSpy)).calls.reset();

        // Simulate rebuffering
        cmcdManager.setBuffering(true);

        expect(requestSpy).toHaveBeenCalledTimes(1);
        const request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];
        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="r"');
        expect(decodedUri).toContain('v=2');
      });

      it('sends preloading event', () => {
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(
            playerInterfaceWithNE,
            config,
        );
        cmcdManager.setMediaElement(new shaka.util.FakeEventTarget());
        cmcdManager.configure(config);

        cmcdManager.setStartTimeOfLoad(Date.now());

        expect(requestSpy).toHaveBeenCalledTimes(1);
        const request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];
        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="ps"');
        expect(decodedUri).toContain('sta="d"');
      });

      it('sends player expand and collapse events', () => {
        const eventTarget = new shaka.util.FakeEventTarget();
        const playerInterfaceWithNE =
        Object.assign({}, playerInterface, {
          getNetworkingEngine: () => networkingEngine,
        });

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            mode: 'event',
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e'],
            events: ['pe', 'pc'],
          }],
        };

        const cmcdManager = createCmcdManager(
            playerInterfaceWithNE,
            config,
        );
        cmcdManager.setMediaElement(eventTarget);
        cmcdManager.configure(config);

        // Mock fullscreenElement to simulate entering fullscreen
        Object.defineProperty(document, 'fullscreenElement', {
          value: eventTarget,
          writable: true,
        });
        eventTarget.dispatchEvent(new shaka.util.FakeEvent('fullscreenchange'));

        expect(requestSpy).toHaveBeenCalledTimes(1);
        let request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];
        let decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="pe"');

        // Mock fullscreenElement to simulate exiting fullscreen
        Object.defineProperty(document, 'fullscreenElement', {
          value: null,
          writable: true,
        });
        eventTarget.dispatchEvent(new shaka.util.FakeEvent('fullscreenchange'));

        expect(requestSpy).toHaveBeenCalledTimes(2);
        request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];
        decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('e="pc"');

        // Restore original property
        Object.defineProperty(document, 'fullscreenElement', {
          value: null,
          writable: false,
        });
      });
    });
  });
});
