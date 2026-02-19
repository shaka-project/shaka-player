/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SegmentUtils', () => {
  const videoInitSegmentUri = '/base/test/test/assets/sintel-video-init.mp4';
  const videoSegmentUri = '/base/test/test/assets/sintel-video-segment.mp4';
  const audioInitSegmentUri = '/base/test/test/assets/sintel-audio-init.mp4';
  const audioSegmentUri = '/base/test/test/assets/sintel-audio-segment.mp4';

  const audioInitSegmentXheAacUri = '/base/test/test/assets/audio-xhe-aac.mp4';
  const audioInitSegmentAC4Uri = '/base/test/test/assets/audio-ac-4.mp4';

  const multidrmVideoInitSegmentUri =
      '/base/test/test/assets/multidrm-video-init.mp4';

  const multidrmAudioInitSegmentUri =
      '/base/test/test/assets/multidrm-audio-init.mp4';

  const ceaInitSegmentUri = '/base/test/test/assets/cea-init.mp4';
  const ceaSegmentUri = '/base/test/test/assets/cea-segment.mp4';

  const h265CeaInitSegmentUri = '/base/test/test/assets/h265-cea-init.mp4';
  const h265CeaSegmentUri = '/base/test/test/assets/h265-cea-segment.mp4';

  const tsVideoUri = '/base/test/test/assets/video.ts';
  const tsAudioUri = '/base/test/test/assets/audio.ts';
  const tsCaptionsUri = '/base/test/test/assets/captions-test.ts';

  const ttmlMp4Uri = '/base/test/test/assets/ttml-init.mp4';
  const webvttMp4Uri = '/base/test/test/assets/vtt-init.mp4';

  const initFairPlayUri = '/base/test/test/assets/init-fairplay.mp4';

  const cea608TrackInitSegmentUri =
      '/base/test/test/assets/cea608-track-init.mp4';
  const cea608TrackSegmentUri =
      '/base/test/test/assets/cea608-track-segment.mp4';

  /** @type {!ArrayBuffer} */
  let videoInitSegment;
  /** @type {!ArrayBuffer} */
  let videoSegment;
  /** @type {!ArrayBuffer} */
  let audioInitSegment;
  /** @type {!ArrayBuffer} */
  let audioSegment;
  /** @type {!ArrayBuffer} */
  let audioInitSegmentXheAac;
  /** @type {!ArrayBuffer} */
  let audioInitSegmentAC4;
  /** @type {!ArrayBuffer} */
  let multidrmVideoInitSegment;
  /** @type {!ArrayBuffer} */
  let multidrmAudioInitSegment;
  /** @type {!ArrayBuffer} */
  let ceaInitSegment;
  /** @type {!ArrayBuffer} */
  let ceaSegment;
  /** @type {!ArrayBuffer} */
  let h265CeaInitSegment;
  /** @type {!ArrayBuffer} */
  let h265CeaSegment;
  /** @type {!ArrayBuffer} */
  let tsVideo;
  /** @type {!ArrayBuffer} */
  let tsAudio;
  /** @type {!ArrayBuffer} */
  let tsCaptions;
  /** @type {!ArrayBuffer} */
  let ttml;
  /** @type {!ArrayBuffer} */
  let webvtt;
  /** @type {!ArrayBuffer} */
  let initFairPlay;
  /** @type {!ArrayBuffer} */
  let cea608TrackInitSegment;
  /** @type {!ArrayBuffer} */
  let cea608TrackSegment;

  beforeAll(async () => {
    [
      videoInitSegment,
      videoSegment,
      audioInitSegment,
      audioSegment,
      audioInitSegmentXheAac,
      audioInitSegmentAC4,
      multidrmVideoInitSegment,
      multidrmAudioInitSegment,
      ceaInitSegment,
      ceaSegment,
      h265CeaInitSegment,
      h265CeaSegment,
      tsVideo,
      tsAudio,
      tsCaptions,
      ttml,
      webvtt,
      initFairPlay,
      cea608TrackInitSegment,
      cea608TrackSegment,
    ] = await Promise.all([
      shaka.test.Util.fetch(videoInitSegmentUri),
      shaka.test.Util.fetch(videoSegmentUri),
      shaka.test.Util.fetch(audioInitSegmentUri),
      shaka.test.Util.fetch(audioSegmentUri),
      shaka.test.Util.fetch(audioInitSegmentXheAacUri),
      shaka.test.Util.fetch(audioInitSegmentAC4Uri),
      shaka.test.Util.fetch(multidrmVideoInitSegmentUri),
      shaka.test.Util.fetch(multidrmAudioInitSegmentUri),
      shaka.test.Util.fetch(ceaInitSegmentUri),
      shaka.test.Util.fetch(ceaSegmentUri),
      shaka.test.Util.fetch(h265CeaInitSegmentUri),
      shaka.test.Util.fetch(h265CeaSegmentUri),
      shaka.test.Util.fetch(tsVideoUri),
      shaka.test.Util.fetch(tsAudioUri),
      shaka.test.Util.fetch(tsCaptionsUri),
      shaka.test.Util.fetch(ttmlMp4Uri),
      shaka.test.Util.fetch(webvttMp4Uri),
      shaka.test.Util.fetch(initFairPlayUri),
      shaka.test.Util.fetch(cea608TrackInitSegmentUri),
      shaka.test.Util.fetch(cea608TrackSegmentUri),
    ]);
  });

  it('getBasicInfoFromMp4', async () => {
    let basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        videoInitSegment, null, false);
    let expected = {
      type: 'video',
      mimeType: 'video/mp4',
      codecs: 'avc1.42C01E',
      language: 'eng',
      height: '110',
      width: '256',
      channelCount: null,
      sampleRate: null,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: null,
      timescale: 12288,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        audioInitSegment, null, false);
    expected = {
      type: 'audio',
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
      language: 'eng',
      height: null,
      width: null,
      channelCount: 2,
      sampleRate: 48000,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: null,
      timescale: 48000,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        audioInitSegmentXheAac, null, false);
    expected = {
      type: 'audio',
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.42',
      language: 'und',
      height: null,
      width: null,
      channelCount: 2,
      sampleRate: 48000,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: null,
      timescale: 48000,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        audioInitSegmentAC4, null, false);
    expected = {
      type: 'audio',
      mimeType: 'audio/mp4',
      codecs: 'ac-4',
      language: 'und',
      height: null,
      width: null,
      channelCount: 10,
      sampleRate: 48000,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: null,
      timescale: 48000,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        multidrmVideoInitSegment, null, false);
    expected = {
      type: 'video',
      mimeType: 'video/mp4',
      codecs: 'avc1.42E01E',
      language: 'und',
      height: '288',
      width: '512',
      channelCount: null,
      sampleRate: null,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: null,
      timescale: 24,
      drmInfos: [
        {
          keySystem: 'com.microsoft.playready',
          encryptionScheme: 'cenc',
          licenseServerUri: '',
          distinctiveIdentifierRequired: false,
          persistentStateRequired: false,
          audioRobustness: '',
          videoRobustness: '',
          serverCertificate: null,
          serverCertificateUri: '',
          sessionType: '',
          initData: [
            {
              initDataType: 'cenc',
              initData: jasmine.any(Uint8Array),
            },
          ],
          mediaTypes: undefined,
          keyIds: (new Set()).add('4060a865887842679cbf91ae5bae1e72'),
        },
        {
          keySystem: 'com.widevine.alpha',
          encryptionScheme: 'cenc',
          licenseServerUri: '',
          distinctiveIdentifierRequired: false,
          persistentStateRequired: false,
          audioRobustness: '',
          videoRobustness: '',
          serverCertificate: null,
          serverCertificateUri: '',
          sessionType: '',
          initData: [
            {
              initDataType: 'cenc',
              initData: jasmine.any(Uint8Array),
            },
          ],
          mediaTypes: undefined,
          keyIds: (new Set()).add('4060a865887842679cbf91ae5bae1e72'),
        },
      ],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        multidrmAudioInitSegment, null, false);
    expected = {
      type: 'audio',
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
      language: 'eng',
      height: null,
      width: null,
      channelCount: 2,
      sampleRate: 44100,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: null,
      timescale: 44100,
      drmInfos: [
        {
          keySystem: 'com.microsoft.playready',
          encryptionScheme: 'cenc',
          licenseServerUri: '',
          distinctiveIdentifierRequired: false,
          persistentStateRequired: false,
          audioRobustness: '',
          videoRobustness: '',
          serverCertificate: null,
          serverCertificateUri: '',
          sessionType: '',
          initData: [
            {
              initDataType: 'cenc',
              initData: jasmine.any(Uint8Array),
            },
          ],
          mediaTypes: undefined,
          keyIds: (new Set()).add('4060a865887842679cbf91ae5bae1e72'),
        },
        {
          keySystem: 'com.widevine.alpha',
          encryptionScheme: 'cenc',
          licenseServerUri: '',
          distinctiveIdentifierRequired: false,
          persistentStateRequired: false,
          audioRobustness: '',
          videoRobustness: '',
          serverCertificate: null,
          serverCertificateUri: '',
          sessionType: '',
          initData: [
            {
              initDataType: 'cenc',
              initData: jasmine.any(Uint8Array),
            },
          ],
          mediaTypes: undefined,
          keyIds: (new Set()).add('4060a865887842679cbf91ae5bae1e72'),
        },
      ],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        ceaInitSegment, ceaSegment, false);
    expected = {
      type: 'video',
      mimeType: 'video/mp4',
      codecs: 'avc1.64001E',
      language: '```',
      height: '360',
      width: '640',
      channelCount: null,
      sampleRate: null,
      closedCaptions: (new Map()).set('CC1', 'CC1').set('CC3', 'CC3'),
      videoRange: null,
      colorGamut: null,
      frameRate: 30,
      timescale: 90000,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        ceaInitSegment, ceaSegment, true);
    expected = {
      type: 'video',
      mimeType: 'video/mp4',
      codecs: 'avc1.64001E',
      language: '```',
      height: '360',
      width: '640',
      channelCount: null,
      sampleRate: null,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: 30,
      timescale: 90000,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        h265CeaInitSegment, h265CeaSegment, false);
    expected = {
      type: 'video',
      mimeType: 'video/mp4',
      codecs: 'hvc1.1.6.L93.90',
      language: 'und',
      height: '180',
      width: '320',
      channelCount: null,
      sampleRate: null,
      closedCaptions: (new Map()).set('CC1', 'CC1').set('svc1', 'svc1'),
      videoRange: null,
      colorGamut: null,
      frameRate: jasmine.any(Number),
      timescale: 60000,
      drmInfos: [
        {
          keySystem: 'com.widevine.alpha',
          encryptionScheme: 'cenc',
          licenseServerUri: '',
          distinctiveIdentifierRequired: false,
          persistentStateRequired: false,
          audioRobustness: '',
          videoRobustness: '',
          serverCertificate: null,
          serverCertificateUri: '',
          sessionType: '',
          initData: [
            {
              initDataType: 'cenc',
              initData: jasmine.any(Uint8Array),
            },
          ],
          mediaTypes: undefined,
          keyIds: (new Set()).add('22948c3bdd675d3fa4695dacab59e819'),
        },
        {
          keySystem: 'com.microsoft.playready',
          encryptionScheme: 'cenc',
          licenseServerUri: 'https://twc.live.ott.irdeto.com/playready/rightsmanager.asmx?CrmId=twc&AccountId=twc&contentId=329',
          distinctiveIdentifierRequired: false,
          persistentStateRequired: false,
          audioRobustness: '',
          videoRobustness: '',
          serverCertificate: null,
          serverCertificateUri: '',
          sessionType: '',
          initData: [
            {
              initDataType: 'cenc',
              initData: jasmine.any(Uint8Array),
            },
          ],
          mediaTypes: undefined,
          keyIds: (new Set()).add('22948c3bdd675d3fa4695dacab59e819'),
        },
      ],
    };
    expect(basicInfo).toEqual(expected);
    expect(basicInfo.frameRate).toBeCloseTo(29.97, 2);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        ttml, null, true);
    expected = {
      type: 'text',
      mimeType: 'application/mp4',
      codecs: 'stpp',
      language: 'eng',
      height: null,
      width: null,
      channelCount: null,
      sampleRate: null,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: null,
      timescale: 1000,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        webvtt, null, true);
    expected = {
      type: 'text',
      mimeType: 'application/mp4',
      codecs: 'wvtt',
      language: 'eng',
      height: null,
      width: null,
      channelCount: null,
      sampleRate: null,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: null,
      timescale: 1000,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        initFairPlay, null, false);
    expected = {
      type: 'video',
      mimeType: 'video/mp4',
      codecs: 'avc1.42E01E',
      language: 'und',
      height: '720',
      width: '1280',
      channelCount: null,
      sampleRate: null,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: null,
      timescale: 90000,
      drmInfos: [
        {
          keySystem: 'com.apple.fps',
          encryptionScheme: 'cbcs',
          licenseServerUri: '',
          distinctiveIdentifierRequired: false,
          persistentStateRequired: false,
          audioRobustness: '',
          videoRobustness: '',
          serverCertificate: null,
          serverCertificateUri: '',
          sessionType: '',
          initData: [
            {
              initDataType: 'sinf',
              initData: jasmine.any(Uint8Array),
              keyId: null,
            },
          ],
          mediaTypes: undefined,
          keyIds: (new Set()).add('b99ed9e5c64149d1bfa843692b686ddb'),
        },
      ],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        cea608TrackInitSegment, cea608TrackSegment, false);
    expected = {
      type: 'video',
      mimeType: 'video/mp4',
      codecs: 'avc1.64001F',
      language: 'eng',
      height: '306',
      width: '544',
      channelCount: null,
      sampleRate: null,
      closedCaptions: (new Map()).set('CC1', 'CC1'),
      videoRange: null,
      colorGamut: null,
      frameRate: jasmine.any(Number),
      timescale: 24000,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);
    expect(basicInfo.frameRate).toBeCloseTo(23.976, 2);
  });

  it('getBasicInfoFromTs', () => {
    let basicInfo = shaka.media.SegmentUtils.getBasicInfoFromTs(
        tsVideo, false, false, false);
    let expected = {
      type: 'video',
      mimeType: 'video/mp2t',
      codecs: 'avc1.42C01E',
      language: null,
      height: '110',
      width: '256',
      channelCount: null,
      sampleRate: null,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: 24,
      timescale: null,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = shaka.media.SegmentUtils.getBasicInfoFromTs(
        tsAudio, false, false, false);
    expected = {
      type: 'audio',
      mimeType: 'video/mp2t',
      codecs: 'mp4a.40.2',
      language: null,
      height: null,
      width: null,
      channelCount: null,
      sampleRate: null,
      closedCaptions: new Map(),
      videoRange: null,
      colorGamut: null,
      frameRate: null,
      timescale: null,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);

    basicInfo = shaka.media.SegmentUtils.getBasicInfoFromTs(
        tsCaptions, false, false, false);
    expected = {
      type: 'video',
      mimeType: 'video/mp2t',
      codecs: 'avc1.640028',
      language: null,
      height: '1080',
      width: '1920',
      channelCount: null,
      sampleRate: null,
      closedCaptions: (new Map()).set('CC1', 'CC1').set('svc1', 'svc1'),
      videoRange: null,
      colorGamut: null,
      frameRate: jasmine.any(Number),
      timescale: null,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);
    expect(basicInfo.frameRate).toBeCloseTo(7.49, 2);
  });

  it('getDefaultKID', () => {
    let defaultKID =
        shaka.media.SegmentUtils.getDefaultKID(h265CeaInitSegment);
    expect(defaultKID).toBe('22948c3bdd675d3fa4695dacab59e819');
    defaultKID = shaka.media.SegmentUtils.getDefaultKID(videoInitSegment);
    expect(defaultKID).toBeNull();
    defaultKID =
        shaka.media.SegmentUtils.getDefaultKID(multidrmVideoInitSegment);
    expect(defaultKID).toBe('4060a865887842679cbf91ae5bae1e72');
    defaultKID =
        shaka.media.SegmentUtils.getDefaultKID(initFairPlay);
    expect(defaultKID).toBe('b99ed9e5c64149d1bfa843692b686ddb');
  });

  it('getStartTimeAndDurationFromMp4', () => {
    let result = shaka.media.SegmentUtils.getStartTimeAndDurationFromMp4(
        videoSegment, 12288);
    expect(result.startTime).toBeCloseTo(40, 0);
    expect(result.duration).toBeCloseTo(10, 0);

    result = shaka.media.SegmentUtils.getStartTimeAndDurationFromMp4(
        audioSegment, 48000);
    expect(result.startTime).toBeCloseTo(40.021, 0);
    expect(result.duration).toBeCloseTo(10.005, 0);

    result = shaka.media.SegmentUtils.getStartTimeAndDurationFromMp4(
        ceaSegment, 90000);
    expect(result.startTime).toBeCloseTo(0, 0);
    expect(result.duration).toBeCloseTo(2, 0);

    result = shaka.media.SegmentUtils.getStartTimeAndDurationFromMp4(
        h265CeaSegment, 60000);
    expect(result.startTime).toBeCloseTo(1685548363.50405, 0);
    expect(result.duration).toBeCloseTo(2.002, 0);
  });

  describe('AES decryption for different key types', () => {
    const SegmentUtils = shaka.media.SegmentUtils;
    const plaintext = shaka.util.StringUtils.toUTF8('Shaka AES test segment');

    const aes128Key = shaka.util.BufferUtils.toUint8(
        new Uint8Array([...Array(16).keys()]));
    const aes256Key = shaka.util.BufferUtils.toUint8(
        new Uint8Array([...Array(32).keys()]));

    const iv16 = new Uint8Array(16).map((_, i) => i);

    async function encryptSegmentCBC(keyBuffer, iv) {
      const cryptoKey = await window.crypto.subtle.importKey(
          'raw', keyBuffer, {name: 'AES-CBC'}, false, ['encrypt']);
      return window.crypto.subtle.encrypt(
          {name: 'AES-CBC', iv}, cryptoKey, plaintext);
    }

    async function encryptSegmentCTR(keyBuffer, counter) {
      const cryptoKey = await window.crypto.subtle.importKey(
          'raw', keyBuffer, {name: 'AES-CTR'}, false, ['encrypt']);
      return window.crypto.subtle.encrypt(
          {name: 'AES-CTR', counter, length: 64}, cryptoKey, plaintext);
    }

    async function encryptSegmentGCM(keyBuffer, iv) {
      const cryptoKey = await window.crypto.subtle.importKey(
          'raw', keyBuffer, {name: 'AES-GCM'}, false, ['encrypt']);
      const ciphertext = await window.crypto.subtle.encrypt(
          {name: 'AES-GCM', iv, tagLength: 128}, cryptoKey, plaintext);

      // Concatenate IV + ciphertext (ciphertext includes tag)
      return shaka.util.Uint8ArrayUtils.concat(
          iv, shaka.util.BufferUtils.toUint8(ciphertext));
    }

    function runCBCDecryptTest(name, keyBuffer, iv) {
      it(`decrypts ${name} segments correctly`, async () => {
        const cryptoKey = await window.crypto.subtle.importKey(
            'raw', keyBuffer, {name: 'AES-CBC'}, false, ['decrypt']);
        const ciphertext = await encryptSegmentCBC(keyBuffer, iv);
        const aesKey = {
          bitsKey: keyBuffer.byteLength * 8,
          blockCipherMode: 'CBC',
          cryptoKey,
          iv,
          firstMediaSequenceNumber: 0,
        };
        const decrypted = await SegmentUtils.aesDecrypt(ciphertext, aesKey, 0);
        expect(shaka.util.StringUtils.fromUTF8(decrypted))
            .toBe('Shaka AES test segment');
      });
    }

    function runCTRDecryptTest(name, keyBuffer, counter) {
      it(`decrypts ${name} segments correctly`, async () => {
        const cryptoKey = await window.crypto.subtle.importKey(
            'raw', keyBuffer, {name: 'AES-CTR'}, false, ['decrypt']);
        const ciphertext = await encryptSegmentCTR(keyBuffer, counter);
        const aesKey = {
          bitsKey: keyBuffer.byteLength * 8,
          blockCipherMode: 'CTR',
          cryptoKey,
          iv: counter,
          firstMediaSequenceNumber: 0,
        };
        const decrypted = await SegmentUtils.aesDecrypt(ciphertext, aesKey, 0);
        expect(shaka.util.StringUtils.fromUTF8(decrypted))
            .toBe('Shaka AES test segment');
      });
    }

    function runGCMDecryptTest(name, keyBuffer) {
      it(`decrypts ${name} segments correctly`, async () => {
        const iv = iv16;
        const cryptoKey = await window.crypto.subtle.importKey(
            'raw', keyBuffer, {name: 'AES-GCM'}, false, ['decrypt']);
        const ciphertext = await encryptSegmentGCM(keyBuffer, iv);
        const aesKey = {
          bitsKey: keyBuffer.byteLength * 8,
          blockCipherMode: 'GCM',
          cryptoKey,
          iv: undefined,
          firstMediaSequenceNumber: 0,
        };
        const decrypted = await SegmentUtils.aesDecrypt(ciphertext, aesKey, 0);
        expect(shaka.util.StringUtils.fromUTF8(decrypted))
            .toBe('Shaka AES test segment');
      });
    }

    runCBCDecryptTest('AES-128-CBC', aes128Key, iv16);
    runCBCDecryptTest('AES-256-CBC', aes256Key, iv16);
    runCTRDecryptTest('AES-256-CTR', aes256Key, iv16);
    runGCMDecryptTest('AES-256-GCM', aes256Key);

    it('throws HLS_INVALID_GCM_SEGMENT if GCM segment too short', async () => {
      const aesKey = {
        bitsKey: 256,
        blockCipherMode: 'GCM',
        cryptoKey: await window.crypto.subtle.importKey(
            'raw', aes256Key, {name: 'AES-GCM'}, false, ['decrypt']),
        iv: undefined,
        firstMediaSequenceNumber: 0,
      };
      const shortBuffer = shaka.util.BufferUtils.toUint8(new Uint8Array(10));
      await expectAsync(SegmentUtils.aesDecrypt(shortBuffer, aesKey, 0))
          .toBeRejectedWith(jasmine.objectContaining({
            severity: shaka.util.Error.Severity.CRITICAL,
            category: shaka.util.Error.Category.MANIFEST,
            code: shaka.util.Error.Code.HLS_INVALID_GCM_SEGMENT,
          }));
    });

    it('calls fetchKey if cryptoKey is missing', async () => {
      const aesKey = {
        bitsKey: 256,
        blockCipherMode: 'GCM',
        fetchKey: async () => {
          aesKey.cryptoKey = await window.crypto.subtle.importKey(
              'raw', aes256Key, {name: 'AES-GCM'}, false, ['decrypt']);
        },
        iv: undefined,
        firstMediaSequenceNumber: 0,
      };
      const ciphertext = await encryptSegmentGCM(aes256Key, iv16);
      const decrypted = await SegmentUtils.aesDecrypt(ciphertext, aesKey, 0);
      expect(shaka.util.StringUtils.fromUTF8(decrypted))
          .toBe('Shaka AES test segment');
    });
  });
});
