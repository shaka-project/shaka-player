/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.util.CmcdManager');
goog.require('shaka.util.ObjectUtils');

describe('CmcdManager', () => {
  const CmcdManager = shaka.util.CmcdManager;
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

  describe('UUID generation', () => {
    const regex =
      /^[A-F\d]{8}-[A-F\d]{4}-4[A-F\d]{3}-[89AB][A-F\d]{3}-[A-F\d]{12}$/i;
    const id = CmcdManager.uuid();

    it('is formatted correctly', () => {
      expect(regex.test(id)).toBe(true);
    });

    it('produces unique results', () => {
      expect(CmcdManager.uuid() == id).toBe(false);
    });
  });

  describe('Query serialization', () => {
    it('produces correctly serialized data', () => {
      const query = CmcdManager.toQuery(data);
      const result = 'CMCD=br%3D52317%2Cbs%2Ccid%3D%22xyz%22%2C' +
                     'com.test-exists%2Ccom.test-hello%3D%22world%22%2C' +
                     'com.test-testing%3D1234%2Ccom.test-token%3Ds%2C' +
                     'd%3D6067%2Cmtp%3D10000%2C' +
                     'nor%3D%22..%252Ftesting%252F3.m4v%22%2C' +
                     'nrr%3D%220-99%22%2C' +
                     'sid%3D%22c936730c-031e-4a73-976f-92bc34039c60%22';
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

  describe('CmcdManager instance', () => {
    const ObjectUtils = shaka.util.ObjectUtils;

    const playerInterface = {
      isLive: () => false,
      getPlaybackRate: () => 1,
      getBandwidthEstimate: () => 10000000,
      getVariantTracks: () => [
        {bandwidth: 50000},
        {bandwidth: 5000000},
      ],
      getBufferedInfo: () => ({
        video: [{start: 0, end: 30}],
      }),
    };

    const cmcdManager = new CmcdManager(playerInterface);

    const config = {
      enabled: false,
      sessionId: '2ed2d1cd-970b-48f2-bfb3-50a79e87cfa3',
      contentId: 'testing',
      useHeaders: false,
    };

    cmcdManager.configure(config);

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
      streamDataCallback: null,
    };

    const manifestInfo = {
      format: 'dash',
    };

    const segmentInfo = {
      init: false,
      stream: /** @type {shaka.extern.Stream} */({
        type: 'video',
        bandwidth: 5234167,
        mimeType: 'application/mp4',
      }),
      duration: 3.33,
    };

    it('does not modify requests when disabled', () => {
      const r = ObjectUtils.cloneObject(request);

      cmcdManager.applyManifestData(r, manifestInfo);
      expect(r.uris[0]).toBe(request.uris[0]);

      cmcdManager.applySegmentData(r, segmentInfo);
      expect(r.uris[0]).toBe(request.uris[0]);
    });

    describe('query mode', () => {
      beforeAll(() => {
        config.enabled = true;
        cmcdManager.configure(config);
      });

      it('modifies manifest request uris', () => {
        const r = ObjectUtils.cloneObject(request);
        cmcdManager.applyManifestData(r, manifestInfo);
        const uri = 'https://test.com/test.mpd?CMCD=cid%3D%22testing%22%2C' +
          'mtp%3D10000%2Cot%3Dm%2Csf%3Dd%2C' +
          'sid%3D%222ed2d1cd-970b-48f2-bfb3-50a79e87cfa3%22%2Ctb%3D5000';
        expect(r.uris[0]).toBe(uri);
      });

      it('modifies segment request uris', () => {
        const r = ObjectUtils.cloneObject(request);
        cmcdManager.applySegmentData(r, segmentInfo);
        const uri = 'https://test.com/test.mpd?CMCD=bl%3D30000%2Cbr%3D5234%2Ccid%3D%22' +
          'testing%22%2Cd%3D3330%2Cmtp%3D10000%2Cot%3Dv%2Csf%3Dd%2C' +
          'sid%3D%222ed2d1cd-970b-48f2-bfb3-50a79e87cfa3%22%2Cst%3Dv%2C' +
          'tb%3D5000';
        expect(r.uris[0]).toBe(uri);
      });
    });

    describe('header mode', () => {
      beforeAll(() => {
        config.useHeaders = true;
        cmcdManager.configure(config);
      });

      it('modifies manifest request headers', () => {
        const r = ObjectUtils.cloneObject(request);
        cmcdManager.applyManifestData(r, manifestInfo);
        expect(r.headers).toEqual({
          'testing': '1234',
          'CMCD-Object': 'ot=m,tb=5000',
          'CMCD-Request': 'mtp=10000',
          'CMCD-Session': 'cid="testing",sf=d,' +
                          'sid="2ed2d1cd-970b-48f2-bfb3-50a79e87cfa3"',
        });
      });

      it('modifies segment request headers', () => {
        const r = ObjectUtils.cloneObject(request);
        cmcdManager.applySegmentData(r, segmentInfo);
        expect(r.headers).toEqual({
          'testing': '1234',
          'CMCD-Object': 'br=5234,d=3330,ot=v,tb=5000',
          'CMCD-Request': 'bl=30000,mtp=10000',
          'CMCD-Session': 'cid="testing",sf=d,' +
                          'sid="2ed2d1cd-970b-48f2-bfb3-50a79e87cfa3",st=v',
        });
      });
    });
  });
});
