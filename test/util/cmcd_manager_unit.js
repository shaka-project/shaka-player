/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('CmcdManager', () => {
  const CmcdManager = shaka.util.CmcdManager;
  const uuidRegex =
    '[A-F\\d]{8}-[A-F\\d]{4}-4[A-F\\d]{3}-[89AB][A-F\\d]{3}-[A-F\\d]{12}';
  const data = {
    'sid': 'c936730c-031e-4a73-976f-92bc34039c60',
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

  describe('Query serialization', () => {
    it('produces correctly serialized data', () => {
      const query = CmcdManager.toQuery(data);
      const result = 'br=52317,bs,cid="xyz",com.test-exists,' +
                     'com.test-hello="world",com.test-testing=1234,' +
                     'com.test-token=s,d=6067,mtp=10000,' +
                     'nor="..%2Ftesting%2F3.m4v",nrr="0-99",' +
                     'sid="c936730c-031e-4a73-976f-92bc34039c60"';
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
                        'nor="..%2Ftesting%2F3.m4v",nrr="0-99"',
        'CMCD-Session': 'cid="xyz",sid="c936730c-031e-4a73-976f-92bc34039c60"',
        'CMCD-Status': 'bs',
      });
    });

    it('ignores empty shards', () => {
      expect(CmcdManager.toHeaders({br: 200})).toEqual({
        'CMCD-Object': 'br=200',
      });
    });
  });

  const NetworkingEngine = shaka.net.NetworkingEngine;
  const RequestType = NetworkingEngine.RequestType;

  function createNetworkingEngine(cmcd) {
    const resolveScheme = jasmine.createSpy('cmcd').and.callFake(
        () => shaka.util.AbortableOperation.completed(
            {uri: '', data: new ArrayBuffer(5), headers: {}},
        ));

    NetworkingEngine.registerScheme(
        'cmcd', shaka.test.Util.spyFunc(resolveScheme),
        NetworkingEngine.PluginPriority.FALLBACK);


    /** @type {shaka.net.NetworkingEngine.OnRequest} */
    function onRequest(type, request, context) {
      cmcd.applyData(type, request, context);
    }

    return new NetworkingEngine(undefined, undefined, undefined,
        onRequest);
  }

  describe('CmcdManager instance', () => {
    const ObjectUtils = shaka.util.ObjectUtils;
    const playerInterface = {
      isLive: () => false,
      getBandwidthEstimate: () => 10000000,
      getBufferedInfo: () => ({
        video: [
          {start: 0, end: 5},
          {start: 6, end: 31.234},
          {start: 35, end: 40},
        ],
      }),
      getCurrentTime: () => 10,
      getPlaybackRate: () => 1,
      getVariantTracks: () => /** @type {Array.<shaka.extern.Track>} */([
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

    const sid = '2ed2d1cd-970b-48f2-bfb3-50a79e87cfa3';
    const config = {
      enabled: false,
      sessionId: '',
      contentId: 'testing',
      useHeaders: false,
    };

    /** @type shaka.util.CmcdManager */
    let cmcdManager = new CmcdManager(playerInterface, config);

    const request = {
      uris: ['https://test.com/test.mpd'],
      method: 'GET',
      body: null,
      headers: {
        testing: '1234',
      },
      allowCrossSiteCredentials: false,
      retryParameters: /** @type {shaka.extern.RetryParameters} */({}),
      licenseRequestType: null,
      sessionId: null,
      drmInfo: null,
      initData: null,
      initDataType: null,
      streamDataCallback: null,
    };

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
        const r = ObjectUtils.cloneObject(request);

        cmcdManager.applyManifestData(r, manifestInfo);
        expect(r.uris[0]).toBe(request.uris[0]);

        cmcdManager.applySegmentData(r, segmentInfo);
        expect(r.uris[0]).toBe(request.uris[0]);
      });

      it('generates a session id if not provided', () => {
        config.enabled = true;
        cmcdManager = new CmcdManager(playerInterface, config);

        const r = ObjectUtils.cloneObject(request);

        cmcdManager.applyManifestData(r, manifestInfo);
        const regex = new RegExp(`sid%3D%22${uuidRegex}%22`, 'i');
        expect(regex.test(r.uris[0])).toBe(true);
      });
    });

    describe('query mode', () => {
      beforeAll(() => {
        config.sessionId = sid;
        cmcdManager = new CmcdManager(playerInterface, config);
      });

      it('modifies manifest request uris', () => {
        const r = ObjectUtils.cloneObject(request);
        cmcdManager.applyManifestData(r, manifestInfo);
        const uri = 'https://test.com/test.mpd?CMCD=cid%3D%22testing%22%2C' +
          'mtp%3D10000%2Cot%3Dm%2Csf%3Dd%2C' +
          'sid%3D%222ed2d1cd-970b-48f2-bfb3-50a79e87cfa3%22%2Csu';
        expect(r.uris[0]).toBe(uri);
      });

      it('modifies segment request uris', () => {
        const r = ObjectUtils.cloneObject(request);
        cmcdManager.applySegmentData(r, segmentInfo);
        const uri = 'https://test.com/test.mpd?CMCD=bl%3D21200%2Cbr%3D5234%2Ccid%3D%22' +
          'testing%22%2Cd%3D3330%2Cmtp%3D10000%2Cot%3Dv%2Csf%3Dd%2C' +
          'sid%3D%222ed2d1cd-970b-48f2-bfb3-50a79e87cfa3%22%2Cst%3Dv%2Csu%2C' +
          'tb%3D4000';
        expect(r.uris[0]).toBe(uri);
      });

      it('modifies text request uris', () => {
        const r = ObjectUtils.cloneObject(request);
        cmcdManager.applyTextData(r);
        const uri = 'https://test.com/test.mpd?CMCD=cid%3D%22' +
          'testing%22%2Cmtp%3D10000%2Cot%3Dc%2Csf%3Dd%2C' +
          'sid%3D%222ed2d1cd-970b-48f2-bfb3-50a79e87cfa3%22%2Csu';
        expect(r.uris[0]).toBe(uri);
      });
    });

    describe('header mode', () => {
      beforeAll(() => {
        config.useHeaders = true;
        cmcdManager = new CmcdManager(playerInterface, config);
      });

      it('modifies manifest request headers', () => {
        const r = ObjectUtils.cloneObject(request);
        cmcdManager.applyManifestData(r, manifestInfo);
        expect(r.headers).toEqual({
          'testing': '1234',
          'CMCD-Object': 'ot=m',
          'CMCD-Request': 'mtp=10000,su',
          'CMCD-Session': 'cid="testing",sf=d,' +
                          'sid="2ed2d1cd-970b-48f2-bfb3-50a79e87cfa3"',
        });
      });

      it('modifies segment request headers', () => {
        const r = ObjectUtils.cloneObject(request);
        cmcdManager.applySegmentData(r, segmentInfo);
        expect(r.headers).toEqual({
          'testing': '1234',
          'CMCD-Object': 'br=5234,d=3330,ot=v,tb=4000',
          'CMCD-Request': 'bl=21200,mtp=10000,su',
          'CMCD-Session': 'cid="testing",sf=d,' +
                          'sid="2ed2d1cd-970b-48f2-bfb3-50a79e87cfa3",st=v',
        });
      });
    });

    describe('src= mode', () => {
      it('modifies media stream uris', () => {
        const r = cmcdManager
            .appendSrcData('https://test.com/test.mp4', 'video/mp4');
        const uri = 'https://test.com/test.mp4?CMCD=cid%3D%22testing%22%2C' +
                    'mtp%3D10000%2Cot%3Dav%2Csf%3Dd%2C' +
                    'sid%3D%222ed2d1cd-970b-48f2-bfb3-50a79e87cfa3%22%2Csu';
        expect(r).toBe(uri);
      });

      it('modifies manifest stream uris', () => {
        const r = cmcdManager
            .appendSrcData('https://test.com/test.m3u8', 'application/x-mpegurl');
        const uri = 'https://test.com/test.m3u8?CMCD=cid%3D%22testing%22%2C' +
                    'mtp%3D10000%2Cot%3Dm%2Csf%3Dd%2C' +
                    'sid%3D%222ed2d1cd-970b-48f2-bfb3-50a79e87cfa3%22%2Csu';
        expect(r).toBe(uri);
      });

      it('modifies text track uris', () => {
        const r = cmcdManager.appendTextTrackData('https://test.com/test.vtt');
        const uri = 'https://test.com/test.vtt?CMCD=cid%3D%22testing%22%2C' +
                    'mtp%3D10000%2Cot%3Dc%2Csf%3Dd%2C' +
                    'sid%3D%222ed2d1cd-970b-48f2-bfb3-50a79e87cfa3%22%2Csu';
        expect(r).toBe(uri);
      });
    });

    describe('adheres to the spec', () => {
      beforeAll(() => {
        cmcdManager.setBuffering(false);
        cmcdManager.setBuffering(true);
      });

      it('sends bs only once', () => {
        let r = ObjectUtils.cloneObject(request);
        cmcdManager.applySegmentData(r, segmentInfo);
        expect(r.headers['CMCD-Status']).toContain('bs');

        r = ObjectUtils.cloneObject(request);
        cmcdManager.applySegmentData(r, segmentInfo);
        expect(r.headers['CMCD-Status']).not.toContain('bs');
      });

      it('sends su until buffering is complete', () => {
        let r = ObjectUtils.cloneObject(request);
        cmcdManager.applySegmentData(r, segmentInfo);
        expect(r.headers['CMCD-Request']).toContain(',su');

        r = ObjectUtils.cloneObject(request);
        cmcdManager.applySegmentData(r, segmentInfo);
        expect(r.headers['CMCD-Request']).toContain(',su');

        cmcdManager.setBuffering(false);
        r = ObjectUtils.cloneObject(request);
        cmcdManager.applySegmentData(r, segmentInfo);
        expect(r.headers['CMCD-Request']).not.toContain(',su');
      });

      describe('applies core CMCD params to networking engine requests', () => {
        let networkingEngine;
        const uri = 'cmcd://foo';
        const retry = NetworkingEngine.defaultRetryParameters();

        beforeAll(() => {
          config.useHeaders = false;
          cmcdManager = new CmcdManager(playerInterface, config);
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
          await networkingEngine.request(RequestType.SEGMENT, request,
              {
                type: AdvancedRequestType.MEDIA_SEGMENT,
                stream: {
                  type: 'video',
                },
              });

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
          config.enabled = false;
          cmcdManager = new CmcdManager(playerInterface, config);
          const request = NetworkingEngine.makeRequest([uri], retry);
          await networkingEngine.request(RequestType.TIMING, request);

          const result = request.uris[0];
          expect(result).not.toContain('?CMCD=');
        });
      });
    });
  });
});
