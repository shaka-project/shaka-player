/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SegmentUtils', () => {
  const videoInitSegmentUri = '/base/test/test/assets/sintel-video-init.mp4';
  const audioInitSegmentUri = '/base/test/test/assets/sintel-audio-init.mp4';

  const audioInitSegmentXheAacUri = '/base/test/test/assets/audio-xhe-aac.mp4';
  const audioInitSegmentAC4Uri = '/base/test/test/assets/audio-ac-4.mp4';

  const multidrmVideoInitSegmentUri =
      '/base/test/test/assets/multidrm-video-init.mp4';

  const ceaInitSegmentUri = '/base/test/test/assets/cea-init.mp4';
  const ceaSegmentUri = '/base/test/test/assets/cea-segment.mp4';

  const h265CeaInitSegmentUri = '/base/test/test/assets/h265-cea-init.mp4';
  const h265CeaSegmentUri = '/base/test/test/assets/h265-cea-segment.mp4';

  const tsVideoUri = '/base/test/test/assets/video.ts';
  const tsAudioUri = '/base/test/test/assets/audio.ts';
  const tsCaptionsUri = '/base/test/test/assets/captions-test.ts';

  /** @type {!ArrayBuffer} */
  let videoInitSegment;
  /** @type {!ArrayBuffer} */
  let audioInitSegment;
  /** @type {!ArrayBuffer} */
  let audioInitSegmentXheAac;
  /** @type {!ArrayBuffer} */
  let audioInitSegmentAC4;
  /** @type {!ArrayBuffer} */
  let multidrmVideoInitSegment;
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

  beforeAll(async () => {
    const responses = await Promise.all([
      shaka.test.Util.fetch(videoInitSegmentUri),
      shaka.test.Util.fetch(audioInitSegmentUri),
      shaka.test.Util.fetch(audioInitSegmentXheAacUri),
      shaka.test.Util.fetch(audioInitSegmentAC4Uri),
      shaka.test.Util.fetch(multidrmVideoInitSegmentUri),
      shaka.test.Util.fetch(ceaInitSegmentUri),
      shaka.test.Util.fetch(ceaSegmentUri),
      shaka.test.Util.fetch(h265CeaInitSegmentUri),
      shaka.test.Util.fetch(h265CeaSegmentUri),
      shaka.test.Util.fetch(tsVideoUri),
      shaka.test.Util.fetch(tsAudioUri),
      shaka.test.Util.fetch(tsCaptionsUri),
    ]);
    videoInitSegment = responses[0];
    audioInitSegment = responses[1];
    audioInitSegmentXheAac = responses[2];
    audioInitSegmentAC4 = responses[3];
    multidrmVideoInitSegment = responses[4];
    ceaInitSegment = responses[5];
    ceaSegment = responses[6];
    h265CeaInitSegment = responses[7];
    h265CeaSegment = responses[8];
    tsVideo = responses[9];
    tsAudio = responses[10];
    tsCaptions = responses[11];
  });

  it('getBasicInfoFromMp4', async () => {
    let basicInfo = await shaka.media.SegmentUtils.getBasicInfoFromMp4(
        videoInitSegment, videoInitSegment, false);
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
        audioInitSegment, audioInitSegment, false);
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
        audioInitSegmentXheAac, audioInitSegmentXheAac, false);
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
        audioInitSegmentAC4, audioInitSegmentAC4, false);
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
        multidrmVideoInitSegment, multidrmVideoInitSegment, false);
    expected = {
      type: 'video',
      mimeType: 'video/mp4',
      codecs: 'avc1.42E01E',
      language: 'und',
      height: null,
      width: null,
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
      frameRate: null,
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
      frameRate: null,
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
      height: null,
      width: null,
      channelCount: null,
      sampleRate: null,
      closedCaptions: (new Map()).set('CC1', 'CC1').set('svc1', 'svc1'),
      videoRange: null,
      colorGamut: null,
      frameRate: null,
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
      ],
    };
    expect(basicInfo).toEqual(expected);
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
      frameRate: '24',
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
      frameRate: jasmine.any(String),
      timescale: null,
      drmInfos: [],
    };
    expect(basicInfo).toEqual(expected);
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
  });
});
