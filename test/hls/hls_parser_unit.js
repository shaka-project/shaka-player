/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('goog.asserts');
goog.require('shaka.hls.HlsParser');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.test.FakeNetworkingEngine');
goog.require('shaka.test.ManifestGenerator');
goog.require('shaka.test.ManifestParser');
goog.require('shaka.test.Util');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.PlayerConfiguration');
goog.require('shaka.util.Uint8ArrayUtils');

describe('HlsParser', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const ManifestParser = shaka.test.ManifestParser;
  const TextStreamKind = shaka.util.ManifestParserUtils.TextStreamKind;
  const Util = shaka.test.Util;
  const originalAlwaysWarn = shaka.log.alwaysWarn;

  const vttText = [
    'WEBVTT\n',
    '\n',
    '00:03.837 --> 00:07.297\n',
    'Hello, world!\n',
  ].join('');

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.hls.HlsParser} */
  let parser;
  /** @type {!jasmine.Spy} */
  let onEventSpy;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;
  /** @type {shaka.extern.ManifestConfiguration} */
  let config;
  /** @type {!Uint8Array} */
  let initSegmentData;
  /** @type {!Uint8Array} */
  let segmentData;
  /** @type {!Uint8Array} */
  let selfInitializingSegmentData;

  afterEach(() => {
    shaka.log.alwaysWarn = originalAlwaysWarn;
  });

  beforeEach(() => {
    // TODO: use StreamGenerator?
    initSegmentData = new Uint8Array([
      0x00, 0x00, 0x00, 0x30, // size (48)
      0x6D, 0x6F, 0x6F, 0x76, // type (moov)
      0x00, 0x00, 0x00, 0x28, // trak size (40)
      0x74, 0x72, 0x61, 0x6B, // type (trak)
      0x00, 0x00, 0x00, 0x20, // mdia size (32)
      0x6D, 0x64, 0x69, 0x61, // type (mdia)

      0x00, 0x00, 0x00, 0x18, // mdhd size (24)
      0x6D, 0x64, 0x68, 0x64, // type (mdhd)
      0x00, 0x00, 0x00, 0x00, // version and flags

      0x00, 0x00, 0x00, 0x00, // creation time (0)
      0x00, 0x00, 0x00, 0x00, // modification time (0)
      0x00, 0x00, 0x03, 0xe8, // timescale (1000)
    ]);

    segmentData = new Uint8Array([
      0x00, 0x00, 0x00, 0x24, // size (36)
      0x6D, 0x6F, 0x6F, 0x66, // type (moof)
      0x00, 0x00, 0x00, 0x1C, // traf size (28)
      0x74, 0x72, 0x61, 0x66, // type (traf)

      0x00, 0x00, 0x00, 0x14, // tfdt size (20)
      0x74, 0x66, 0x64, 0x74, // type (tfdt)
      0x01, 0x00, 0x00, 0x00, // version and flags

      0x00, 0x00, 0x00, 0x00, // baseMediaDecodeTime first 4 bytes (0)
      0x00, 0x00, 0x00, 0x00,  // baseMediaDecodeTime last 4 bytes (0)
    ]);
    // segment starts at 0s.

    selfInitializingSegmentData =
        shaka.util.Uint8ArrayUtils.concat(initSegmentData, segmentData);

    fakeNetEngine = new shaka.test.FakeNetworkingEngine();

    config = shaka.util.PlayerConfiguration.createDefault().manifest;
    onEventSpy = jasmine.createSpy('onEvent');
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
      isAutoLowLatencyMode: () => false,
      enableLowLatencyMode: () => {},
    };

    parser = new shaka.hls.HlsParser();
    parser.configure(config);
  });

  /**
   * @param {string} master
   * @param {string} media
   * @param {shaka.extern.Manifest} manifest
   * @return {!Promise.<shaka.extern.Manifest>}
   */
  async function testHlsParser(master, media, manifest) {
    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/audio2', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/video2', media)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/init2.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData)
        .setResponseValue('test:/main2.mp4', segmentData)
        .setResponseValue('test:/main.test', segmentData)
        .setResponseValue('test:/selfInit.mp4', selfInitializingSegmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
    return actual;
  }

  it('parses manifest attributes', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'CHANNELS="16/JOC",URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub2",LANGUAGE="es",',
      'URI="text2"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const textMedia = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.vtt',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.language = 'en';
        variant.bandwidth = 200;
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.frameRate = 60;
          stream.mime('video/mp4', 'avc1');
          stream.size(960, 540);
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'en';
          stream.channelsCount = 16;
          stream.spatialAudio = true;
          stream.mime('audio/mp4', 'mp4a');
        });
      });
      manifest.addPartialTextStream((stream) => {
        stream.language = 'en';
        stream.kind = TextStreamKind.SUBTITLE;
        stream.mime('text/vtt', '');
      });
      manifest.addPartialTextStream((stream) => {
        stream.language = 'es';
        stream.kind = TextStreamKind.SUBTITLE;
        stream.mime('text/vtt', '');
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/text', textMedia)
        .setResponseText('test:/text2', textMedia)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
  });

  it('prioritize AVERAGE-BANDWIDTH to BANDWIDTH', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60,',
      'AVERAGE-BANDWIDTH=100\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.bandwidth = 100;
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.frameRate = 60;
          stream.mime('video/mp4', 'avc1');
          stream.size(960, 540);
        });
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
  });

  it('ignores duplicate CODECS', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1.4d001e,avc1.42000d",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1.4d001e');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses video-only variant', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('guesses video-only variant by codecs', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1"\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('guesses video-only variant when text codecs are present', async () => {
    const master = [
      // NOTE: This manifest is technically invalid. It has text codecs, but
      // no text stream. We're tesing text stream parsing elswhere, so this
      // only has the stream we're interested in (video) for simplicity.
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,stpp.ttml.im1t"\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses audio-only variant', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="mp4a"\n',
      'audio',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', 'mp4a');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses audio+video variant', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'CHANNELS="2",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', 'mp4a');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses audio+video variant with legacy codecs', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'CHANNELS="2",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a.40.34",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', '');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses audio+video variant with closed captions', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",CHANNELS="2",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cap1",LANGUAGE="eng",',
      'INSTREAM-ID="CC1"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,CLOSED-CAPTIONS="cap1",AUDIO="aud1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const closedCaptions = new Map([['CC1', 'en']]);
    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.closedCaptions = closedCaptions;
          stream.mime('video/mp4', 'avc1');
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', 'mp4a');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses audio+video variant with no closed captions', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",CHANNELS="2",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cap1",LANGUAGE="eng",',
      'INSTREAM-ID="CC1"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,CLOSED-CAPTIONS="NONE",AUDIO="aud1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', 'mp4a');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('handles audio tags on audio streams', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="mp4a",AUDIO="aud1"\n',
      'audio\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="audio"\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', 'mp4a');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('sets seek range correctly for non-zero start', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MEDIA-SEQUENCE:131\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    segmentData = new Uint8Array([
      0x00, 0x00, 0x00, 0x24, // size (36)
      0x6D, 0x6F, 0x6F, 0x66, // type (moof)
      0x00, 0x00, 0x00, 0x1C, // traf size (28)
      0x74, 0x72, 0x61, 0x66, // type (traf)

      0x00, 0x00, 0x00, 0x14, // tfdt size (20)
      0x74, 0x66, 0x64, 0x74, // type (tfdt)
      0x01, 0x00, 0x00, 0x00, // version and flags

      0x00, 0x00, 0x00, 0x00, // baseMediaDecodeTime first 4 bytes (0)
      0x00, 0x0A, 0x00, 0x00,  // baseMediaDecodeTime last 4 bytes (655360)
    ]);

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const manifest = await parser.start('test:/master', playerInterface);
    const presentationTimeline = manifest.presentationTimeline;
    const stream = manifest.variants[0].video;
    await stream.createSegmentIndex();
    goog.asserts.assert(stream.segmentIndex != null, 'Null segmentIndex!');

    const ref = Array.from(stream.segmentIndex)[0];
    expect(ref).not.toBe(null);
    if (ref) {
      expect(ref.startTime).toBe(0);
      // baseMediaDecodeTime (655360) / timescale (1000)
      expect(ref.timestampOffset).toBe(-655.36);
    }
    expect(presentationTimeline.getSeekRangeStart()).toBe(0);
    expect(presentationTimeline.getSeekRangeEnd()).toBe(5);
  });

  it('parses multiplexed variant', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1,mp4a');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses multiplexed variant without codecs', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', /** @type {?} */ (jasmine.any(String)));
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses audio+video variant without codecs', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="audio"\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', /** @type {?} */ (jasmine.any(String)));
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', /** @type {?} */ (jasmine.any(String)));
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses audio variant without URI', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",NAME="audio"\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', /** @type {?} */ (jasmine.any(String)));
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });


  it('parses video variant without URI', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="mp4a",VIDEO="vid1"\n',
      'audio\n',
      '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid1",NAME="video"\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', /** @type {?} */ (jasmine.any(String)));
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses multiple variants', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=300,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=120,AUDIO="aud2"\n',
      'video2\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud2",LANGUAGE="fr",',
      'URI="audio2"\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.bandwidth = 200;
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(960, 540);
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'en';
        });
      });
      manifest.addPartialVariant((variant) => {
        variant.bandwidth = 300;
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(960, 540);
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'fr';
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses multiple streams with the same group id', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="en",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="fr",',
      'URI="audio2"\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.language = 'en';
        variant.addPartialStream(ContentType.VIDEO);
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'en';
        });
      });
      manifest.addPartialVariant((variant) => {
        variant.language = 'fr';
        variant.addPartialStream(ContentType.VIDEO);
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'fr';
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses characteristics from audio tags', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="en",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="en",',
      'CHARACTERISTICS="public.accessibility.describes-video,',
      'public.accessibility.describes-music-and-sound",URI="audio2"\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.language = 'en';
        variant.addPartialStream(ContentType.VIDEO);
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'en';
        });
      });
      manifest.addPartialVariant((variant) => {
        variant.language = 'en';
        variant.addPartialStream(ContentType.VIDEO);
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'en';
          stream.roles = [
            'public.accessibility.describes-video',
            'public.accessibility.describes-music-and-sound',
          ];
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('fetch the start time for one audio/video stream and reuse for the others',
      async () => {
        const SEGMENT = shaka.net.NetworkingEngine.RequestType.SEGMENT;
        const master = [
          '#EXTM3U\n',
          '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
          'CHANNELS="2",URI="audio"\n',
          '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
          'URI="text"\n',
          '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
          'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
          'video\n',
        ].join('');

        const media = [
          '#EXTM3U\n',
          '#EXT-X-PLAYLIST-TYPE:VOD\n',
          '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
          '#EXTINF:5,\n',
          '#EXT-X-BYTERANGE:121090@616\n',
          'main.mp4',
        ].join('');

        const textMedia = [
          '#EXTM3U\n',
          '#EXT-X-PLAYLIST-TYPE:VOD\n',
          '#EXTINF:5,\n',
          '#EXT-X-BYTERANGE:121090@616\n',
          'main.vtt',
        ].join('');

        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/audio', media)
            .setResponseText('test:/video', media)
            .setResponseText('test:/text', textMedia)
            .setResponseText('test:/main.vtt', vttText)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData);

        await parser.start('test:/master', playerInterface);
        // The start time of audio should be fetched first, and then video and
        // text streams should reuse the start time from audio.
        // Thus, there should be 2 segment requests, for fetching audio init
        // and main segments, and not for video and text segments.
        expect(fakeNetEngine.request.calls.allArgs().filter((args) => {
          return args[0] == SEGMENT;
        }).length).toBe(2);
        fakeNetEngine.expectRequest('test:/init.mp4', SEGMENT);
        fakeNetEngine.expectRequest('test:/main.mp4', SEGMENT);
      });

  it('gets mime type from header request', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.test',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
        });
      });
    });

    // The extra parameters should be stripped by the parser.
    fakeNetEngine.setHeaders(
        'test:/main.test', {
          'content-type': 'video/mp4; foo=bar',
        });

    await testHlsParser(master, media, manifest);
  });

  it('parses manifest with HDR metadata', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'FORCED=YES,URI="text"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",VIDEO-RANGE=PQ,',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1",SUBTITLES="sub1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const textMedia = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.vtt',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
          stream.hdr = 'PQ';
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', 'mp4a');
        });
      });
      manifest.addPartialTextStream((stream) => {
        stream.language = 'en';
        stream.forced = true;
        stream.kind = TextStreamKind.SUBTITLE;
        stream.mime('text/vtt', '');
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/text', textMedia)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
  });

  it('parses manifest with SUBTITLES', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub2",LANGUAGE="es",',
      'URI="text2"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1",SUBTITLES="sub1"\n',
      'video\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1",SUBTITLES="sub2"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const textMedia = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.vtt',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', 'mp4a');
        });
      });
      manifest.addPartialTextStream((stream) => {
        stream.language = 'en';
        stream.kind = TextStreamKind.SUBTITLE;
        stream.mime('text/vtt', '');
      });
      manifest.addPartialTextStream((stream) => {
        stream.language = 'es';
        stream.kind = TextStreamKind.SUBTITLE;
        stream.mime('text/vtt', '');
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/text', textMedia)
        .setResponseText('test:/text2', textMedia)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
  });

  it('parses manifest with FORCED SUBTITLES', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'FORCED=YES,URI="text"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1",SUBTITLES="sub1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const textMedia = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.vtt',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', 'mp4a');
        });
      });
      manifest.addPartialTextStream((stream) => {
        stream.language = 'en';
        stream.forced = true;
        stream.kind = TextStreamKind.SUBTITLE;
        stream.mime('text/vtt', '');
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/text', textMedia)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
  });

  it('parses manifest with text streams without SUBTITLES', async () => {
    // The variant tag doesn't contain a 'SUBTITLES' attribute.
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub2",LANGUAGE="es",',
      'URI="text2"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const textMedia = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.vtt',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO);
        variant.addPartialStream(ContentType.AUDIO);
      });
      manifest.addPartialTextStream((stream) => {
        stream.kind = TextStreamKind.SUBTITLE;
        stream.mime('text/vtt', '');
      });
      manifest.addPartialTextStream((stream) => {
        stream.kind = TextStreamKind.SUBTITLE;
        stream.mime('text/vtt', '');
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/text', textMedia)
        .setResponseText('test:/text2', textMedia)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
  });

  it('calculates duration from stream lengths', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'CHANNELS="2",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1",SUBTITLES="sub1"\n',
      'video\n',
    ].join('');

    const video = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const audio = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const text = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.vtt',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', audio)
        .setResponseText('test:/video', video)
        .setResponseText('test:/text', text)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    // Duration should be the minimum of the streams, but ignore the text
    // stream.
    const timeline = actual.presentationTimeline;
    expect(timeline.getDuration()).toBe(10);

    expect(actual.textStreams.length).toBe(1);
    expect(actual.variants.length).toBe(1);
    expect(actual.variants[0].audio).toBeTruthy();
    expect(actual.variants[0].video).toBeTruthy();
  });

  it('parse image streams', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'CHANNELS="2",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1",SUBTITLES="sub1"\n',
      'video\n',
      '#EXT-X-IMAGE-STREAM-INF:RESOLUTION=240×135,CODECS="jpeg",',
      'URI="image"\n',
    ].join('');

    const video = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const audio = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const text = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.vtt',
    ].join('');

    const image = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
      '#EXTINF:5,\n',
      '#EXT-X-TILES:RESOLUTION=640x360,LAYOUT=5x2,DURATION=6.006\n',
      'image.jpg\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', audio)
        .setResponseText('test:/video', video)
        .setResponseText('test:/text', text)
        .setResponseText('test:/image', image)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);

    expect(actual.imageStreams.length).toBe(1);
    expect(actual.textStreams.length).toBe(1);
    expect(actual.variants.length).toBe(1);

    const thumbnails = actual.imageStreams[0];

    await thumbnails.createSegmentIndex();
    goog.asserts.assert(thumbnails.segmentIndex != null, 'Null segmentIndex!');

    const firstThumbnailReference = thumbnails.segmentIndex.get(0);
    const secondThumbnailReference = thumbnails.segmentIndex.get(1);
    const thirdThumbnailReference = thumbnails.segmentIndex.get(2);

    expect(firstThumbnailReference).not.toBe(null);
    expect(secondThumbnailReference).not.toBe(null);
    expect(thirdThumbnailReference).not.toBe(null);
    if (firstThumbnailReference) {
      expect(firstThumbnailReference.getTilesLayout()).toBe('1x1');
    }
    if (secondThumbnailReference) {
      expect(secondThumbnailReference.getTilesLayout()).toBe('5x2');
    }
    if (thirdThumbnailReference) {
      expect(thirdThumbnailReference.getTilesLayout()).toBe('1x1');
    }
  });

  it('Disable audio does not create audio streams', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'CHANNELS="2",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1",SUBTITLES="sub1"\n',
      'video\n',
      '#EXT-X-IMAGE-STREAM-INF:RESOLUTION=240×135,CODECS="jpeg",',
      'URI="image"\n',
    ].join('');

    const video = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const audio = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const text = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.vtt',
    ].join('');

    const image = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', audio)
        .setResponseText('test:/video', video)
        .setResponseText('test:/text', text)
        .setResponseText('test:/image', image)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.disableAudio = true;
    parser.configure(config);

    const actual = await parser.start('test:/master', playerInterface);
    const variant = actual.variants[0];
    expect(variant.audio).toBe(null);
    expect(variant.video).toBeTruthy();
  });

  it('Disable video does not create video streams', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'CHANNELS="2",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1",SUBTITLES="sub1"\n',
      'video\n',
      '#EXT-X-IMAGE-STREAM-INF:RESOLUTION=240×135,CODECS="jpeg",',
      'URI="image"\n',
    ].join('');

    const video = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const audio = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const text = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.vtt',
    ].join('');

    const image = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', audio)
        .setResponseText('test:/video', video)
        .setResponseText('test:/text', text)
        .setResponseText('test:/image', image)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.disableVideo = true;
    parser.configure(config);

    const actual = await parser.start('test:/master', playerInterface);
    const variant = actual.variants[0];
    expect(variant.audio).toBeTruthy();
    expect(variant.video).toBe(null);
  });

  it('Disable text does not create text streams', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'CHANNELS="2",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1",SUBTITLES="sub1"\n',
      'video\n',
      '#EXT-X-IMAGE-STREAM-INF:RESOLUTION=240×135,CODECS="jpeg",',
      'URI="image"\n',
    ].join('');

    const video = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const audio = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const text = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.vtt',
    ].join('');

    const image = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', audio)
        .setResponseText('test:/video', video)
        .setResponseText('test:/text', text)
        .setResponseText('test:/image', image)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.disableText = true;
    parser.configure(config);

    const actual = await parser.start('test:/master', playerInterface);
    const stream = actual.textStreams[0];
    expect(stream).toBeUndefined();
  });

  it('Disable thumbnails does not create image streams', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'CHANNELS="2",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1",SUBTITLES="sub1"\n',
      'video\n',
      '#EXT-X-IMAGE-STREAM-INF:RESOLUTION=240×135,CODECS="jpeg",',
      'URI="image"\n',
    ].join('');

    const video = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const audio = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    const text = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.vtt',
    ].join('');

    const image = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
      '#EXTINF:5,\n',
      'image.jpg\n',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', audio)
        .setResponseText('test:/video', video)
        .setResponseText('test:/text', text)
        .setResponseText('test:/image', image)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.disableThumbnails = true;
    parser.configure(config);

    const actual = await parser.start('test:/master', playerInterface);
    const stream = actual.imageStreams[0];
    expect(stream).toBeUndefined();
  });

  it('parses manifest with MP4+TTML streams', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,stpp.ttml.im1t",',
      'RESOLUTION=960x540,FRAME-RATE=60,SUBTITLES="sub1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO);
      });
      manifest.addPartialTextStream((stream) => {
        stream.language = 'en';
        stream.mime('application/mp4', 'stpp.ttml.im1t');
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/text', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
  });

  it('detects VTT streams by codec', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,vtt",',
      'RESOLUTION=960x540,FRAME-RATE=60,SUBTITLES="sub1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const textMedia = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.foo',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO);
      });
      manifest.addPartialTextStream((stream) => {
        stream.mime('text/vtt', 'vtt');
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/text', textMedia)
        .setResponseText('test:/main.foo', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
  });

  it('allows init segments in text streams', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,wvtt",',
      'RESOLUTION=960x540,FRAME-RATE=60,SUBTITLES="sub1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO);
      });
      manifest.addPartialTextStream((stream) => {
        stream.kind = TextStreamKind.SUBTITLE;
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/text', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
  });

  it('drops failed text streams when configured to', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,vtt",',
      'RESOLUTION=960x540,FRAME-RATE=60,SUBTITLES="sub1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO);
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    config.hls.ignoreTextStreamFailures = true;
    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
  });

  it('drops failed image streams when configured to', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video\n',
      '#EXT-X-IMAGE-STREAM-INF:RESOLUTION=240×135,CODECS="jpeg"\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO);
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    config.hls.ignoreImageStreamFailures = true;
    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
  });

  it('parses video described by a media tag', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
      'audio\n',
      '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="video"',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.frameRate = 60;
          stream.mime('video/mp4', 'avc1');
          stream.size(960, 540);
        });
        variant.addPartialStream(ContentType.AUDIO);
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('constructs relative URIs', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
      'audio/audio.m3u8\n',
      '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="video/video.m3u8"',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4"\n',
      '#EXTINF:5,\n',
      'segment.mp4',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/host/master.m3u8', master)
        .setResponseText('test:/host/audio/audio.m3u8', media)
        .setResponseText('test:/host/video/video.m3u8', media)
        .setResponseValue('test:/host/audio/init.mp4', initSegmentData)
        .setResponseValue('test:/host/audio/segment.mp4', segmentData)
        .setResponseValue('test:/host/video/init.mp4', initSegmentData)
        .setResponseValue('test:/host/video/segment.mp4', segmentData);

    const actual =
        await parser.start('test:/host/master.m3u8', playerInterface);
    const video = actual.variants[0].video;
    const audio = actual.variants[0].audio;

    await video.createSegmentIndex();
    await audio.createSegmentIndex();
    goog.asserts.assert(video.segmentIndex != null, 'Null segmentIndex!');
    goog.asserts.assert(audio.segmentIndex != null, 'Null segmentIndex!');

    const videoReference = Array.from(video.segmentIndex)[0];
    const audioReference = Array.from(audio.segmentIndex)[0];

    expect(videoReference).not.toBe(null);
    expect(audioReference).not.toBe(null);
    if (videoReference) {
      expect(videoReference.getUris())
          .toEqual(['test:/host/video/segment.mp4']);
    }
    if (audioReference) {
      expect(audioReference.getUris())
          .toEqual(['test:/host/audio/segment.mp4']);
    }
  });

  it('allows streams with no init segment', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
      'audio\n',
      '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="video"',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:6\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'selfInit.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', 'mp4a');
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('allows multiple init segments', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
      'audio\n',
      '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="video"',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXT-X-MAP:URI="init2.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main2.mp4',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/init2.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData)
        .setResponseValue('test:/main2.mp4', segmentData);

    const actualManifest = await parser.start('test:/master', playerInterface);
    const actualVideo = actualManifest.variants[0].video;
    await actualVideo.createSegmentIndex();
    goog.asserts.assert(actualVideo.segmentIndex != null, 'Null segmentIndex!');

    // Verify that the stream contains two segment references, each of the
    // SegmentReference object contains the InitSegmentReference with expected
    // uri.
    const initSegments = Array.from(actualVideo.segmentIndex).map(
        (seg) => seg.initSegmentReference);
    expect(initSegments[0].getUris()[0]).toBe('test:/init.mp4');
    expect(initSegments[1].getUris()[0]).toBe('test:/init2.mp4');
  });

  it('drops variants encrypted with AES-128', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=300,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=120,AUDIO="aud2"\n',
      'video2\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud2",LANGUAGE="fr",',
      'URI="audio2"\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const mediaWithAesEncryption = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-KEY:METHOD=AES-128,',
      'URI="800k.key\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.bandwidth = 200;
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(960, 540);
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'en';
        });
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/audio2', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/video2', mediaWithAesEncryption)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData)
        .setResponseValue('test:/main.test', segmentData)
        .setResponseValue('test:/selfInit.mp4', selfInitializingSegmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
    return actual;
  });

  it('constructs DrmInfo for Widevine', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video\n',
    ].join('');

    const initDataBase64 =
        'dGhpcyBpbml0IGRhdGEgY29udGFpbnMgaGlkZGVuIHNlY3JldHMhISE=';

    const keyId = 'abc123';

    const media = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:6\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,',
      'KEYID=0X' + keyId + ',',
      'KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed",',
      'URI="data:text/plain;base64,',
      initDataBase64, '",\n',
      '#EXT-X-MAP:URI="init.mp4"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.encrypted = true;
          stream.addDrmInfo('com.widevine.alpha', (drmInfo) => {
            drmInfo.addCencInitData(initDataBase64);
            drmInfo.keyIds.add(keyId);
          });
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('constructs DrmInfo for PlayReady', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video\n',
    ].join('');

    const initDataBase64 =
        'AAAAKXBzc2gAAAAAmgTweZhAQoarkuZb4IhflQAAAAlQbGF5cmVhZHk=';

    const media = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:6\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,',
      'KEYFORMAT="com.microsoft.playready",',
      'URI="data:text/plain;base64,UGxheXJlYWR5",\n',
      '#EXT-X-MAP:URI="init.mp4"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.encrypted = true;
          stream.addDrmInfo('com.microsoft.playready', (drmInfo) => {
            drmInfo.addCencInitData(initDataBase64);
          });
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('falls back to mp4 if HEAD request fails', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
      'audio\n',
      '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="video"',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.test',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', 'mp4a');
        });
      });
    });

    fakeNetEngine.setHeaders(
        'test:/main.test', {
          'content-type': '',
        });

    await testHlsParser(master, media, manifest);
  });

  describe('Errors out', () => {
    const Code = shaka.util.Error.Code;

    /**
     * @param {string} master
     * @param {string} media
     * @param {!shaka.util.Error} error
     */
    async function verifyError(master, media, error) {
      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/audio', media)
          .setResponseText('test:/video', media)
          .setResponseValue('test:/main.exe', segmentData)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData);

      await expectAsync(parser.start('test:/master', playerInterface))
          .toBeRejectedWith(Util.jasmineError(error));
    }

    it('if unable to guess codecs', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="aaa,bbb",',
        'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
        'audio\n',
        '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",',
        'URI="video"',
      ].join('');

      const media = [
        '#EXTM3U\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXTINF:5,\n',
        '#EXT-X-BYTERANGE:121090@616\n',
        'main.mp4',
      ].join('');

      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          Code.HLS_COULD_NOT_GUESS_CODECS,
          ['aaa', 'bbb']);

      await verifyError(master, media, error);
    });

    it('if all variants are encrypted with AES-128', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
        'RESOLUTION=960x540,FRAME-RATE=60\n',
        'video\n',
      ].join('');

      const media = [
        '#EXTM3U\n',
        '#EXT-X-TARGETDURATION:6\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-KEY:METHOD=AES-128,',
        'URI="data:text/plain;base64\n',
        '#EXT-X-MAP:URI="init.mp4"\n',
        '#EXTINF:5,\n',
        '#EXT-X-BYTERANGE:121090@616\n',
        'main.mp4',
      ].join('');

      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          Code.HLS_AES_128_ENCRYPTION_NOT_SUPPORTED);

      await verifyError(master, media, error);
    });

    describe('if required attributes are missing', () => {
      /**
       * @param {string} master
       * @param {string} media
       * @param {string} attributeName
       */
      async function verifyMissingAttribute(master, media, attributeName) {
        const error = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            Code.HLS_REQUIRED_ATTRIBUTE_MISSING,
            attributeName);

        await verifyError(master, media, error);
      }

      it('bandwidth', async () => {
        const master = [
          '#EXTM3U\n',
          '#EXT-X-STREAM-INF:CODECS="avc1,mp4a",',
          'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
          'audio\n',
          '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="video"',
        ].join('');

        const media = [
          '#EXTM3U\n',
          '#EXT-X-PLAYLIST-TYPE:VOD\n',
          '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
          '#EXTINF:5,\n',
          '#EXT-X-BYTERANGE:121090@616\n',
          'main.mp4',
        ].join('');

        await verifyMissingAttribute(master, media, 'BANDWIDTH');
      });

      it('uri', async () => {
        const master = [
          '#EXTM3U\n',
          '#EXT-X-STREAM-INF:CODECS="avc1,mp4a",BANDWIDTH=200,',
          'RESOLUTION=960x540,FRAME-RATE=60,SUBTITLES="sub1"\n',
          'audio\n',
          '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1"',
        ].join('');

        const media = [
          '#EXTM3U\n',
          '#EXT-X-PLAYLIST-TYPE:VOD\n',
          '#EXT-X-MAP:URI="init.mp4"\n',
          '#EXTINF:5,\n',
          '#EXT-X-BYTERANGE:121090@616\n',
          'main.mp4',
        ].join('');

        await verifyMissingAttribute(master, media, 'URI');
      });

      it('text uri if not ignoring text stream failure', async () => {
        const master = [
          '#EXTM3U\n',
          '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng"\n',
          '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,vtt",',
          'RESOLUTION=960x540,FRAME-RATE=60,SUBTITLES="sub1"\n',
          'video\n',
        ].join('');

        const media = [
          '#EXTM3U\n',
          '#EXT-X-PLAYLIST-TYPE:VOD\n',
          '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
          '#EXTINF:5,\n',
          '#EXT-X-BYTERANGE:121090@616\n',
          'main.mp4',
        ].join('');

        config.hls.ignoreTextStreamFailures = false;
        await verifyMissingAttribute(master, media, 'URI');
      });
    });

    describe('if required tags are missing', () => {
      /**
       * @param {string} master
       * @param {string} media
       * @param {string} tagName
       */
      async function verifyMissingTag(master, media, tagName) {
        const error = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            Code.HLS_REQUIRED_TAG_MISSING,
            tagName);

        await verifyError(master, media, error);
      }

      it('EXTINF', async () => {
        const master = [
          '#EXTM3U\n',
          '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
          'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
          'audio\n',
          '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="video"',
        ].join('');

        const media = [
          '#EXTM3U\n',
          '#EXT-X-PLAYLIST-TYPE:VOD\n',
          '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
          '#EXT-X-BYTERANGE:121090@616\n',
          'main.mp4',
        ].join('');

        await verifyMissingTag(master, media, 'EXTINF');
      });
    });
  });  // Errors out

  describe('getStartTime_', () => {
    /** @type {number} */
    let segmentDataStartTime;
    /** @type {!Uint8Array} */
    let tsSegmentData;
    /** @type {!Uint8Array} */
    let nullTsPacketData;

    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    // TODO: Add separate tests to cover correct handling of BYTERANGE in
    // constructing references.  Here it is covered incidentally.
    const expectedStartByte = 616;
    const expectedEndByte = 121705;
    // Nit: this value is an implementation detail of the fix for #1106
    const partialEndByte = expectedStartByte + 2048 - 1;

    beforeEach(() => {
      // TODO: use StreamGenerator?
      segmentData = new Uint8Array([
        0x00, 0x00, 0x00, 0x24, // size (36)
        0x6D, 0x6F, 0x6F, 0x66, // type (moof)
        0x00, 0x00, 0x00, 0x1C, // traf size (28)
        0x74, 0x72, 0x61, 0x66, // type (traf)
        0x00, 0x00, 0x00, 0x14, // tfdt size (20)
        0x74, 0x66, 0x64, 0x74, // type (tfdt)
        0x01, 0x00, 0x00, 0x00, // version and flags

        0x00, 0x00, 0x00, 0x00, // baseMediaDecodeTime first 4 bytes
        0x00, 0x00, 0x07, 0xd0,  // baseMediaDecodeTime last 4 bytes (2000)
      ]);
      tsSegmentData = new Uint8Array([
        0x47, // TS sync byte (fixed value)
        0x41, 0x01, // not corrupt, payload follows, packet ID 257
        0x10, // not scrambled, no adaptation field, payload only, seq #0
        0x00, 0x00, 0x01, // PES start code (fixed value)
        0xe0, // stream ID (video stream 0)
        0x00, 0x00, // PES packet length (doesn't matter)
        0x80, // marker bits (fixed value), not scrambled, not priority
        0x80, // PTS only, no DTS, other flags 0 (don't matter)
        0x05, // remaining PES header length == 5 (one timestamp)
        0x21, 0x00, 0x0b, 0x7e, 0x41, // PTS = 180000, encoded into 5 bytes
      ]);
      // 180000 (TS PTS) divided by fixed TS timescale (90000) = 2s.
      // 2000 (MP4 PTS) divided by parsed MP4 timescale (1000) = 2s.
      segmentDataStartTime = 2;
      nullTsPacketData = new Uint8Array([
        0x47, // TS sync byte (fixed value)
        0x1f, 0xff, // null packet (packet ID 8191)
      ]);
    });

    it('parses start time from mp4 segment', async () => {
      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', media)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData);

      const expectedRef = ManifestParser.makeReference(
          /* uri= */ 'test:/main.mp4',
          /* startTime= */ 0,
          /* endTime= */ 5,
          /* baseUri= */ '',
          expectedStartByte,
          expectedEndByte);
      // In VOD content, we set the timestampOffset to align the
      // content to presentation time 0.
      expectedRef.timestampOffset = -segmentDataStartTime;

      const manifest = await parser.start('test:/master', playerInterface);
      const video = manifest.variants[0].video;
      await video.createSegmentIndex();
      ManifestParser.verifySegmentIndex(video, [expectedRef]);

      // Make sure the segment data was fetched with the correct byte
      // range.
      fakeNetEngine.expectRangeRequest(
          'test:/main.mp4',
          expectedStartByte,
          partialEndByte);
    });

    it('parses start time from ts segments', async () => {
      const tsMediaPlaylist = media.replace(/\.mp4/g, '.ts');

      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', tsMediaPlaylist)
          .setResponseValue('test:/main.ts', tsSegmentData);

      const expectedRef = ManifestParser.makeReference(
          /* uri= */ 'test:/main.ts',
          /* startTime= */ 0,
          /* endTime= */ 5,
          /* baseUri= */ '',
          expectedStartByte,
          expectedEndByte);
      // In VOD content, we set the timestampOffset to align the
      // content to presentation time 0.
      expectedRef.timestampOffset = -segmentDataStartTime;

      const manifest = await parser.start('test:/master', playerInterface);
      const video = manifest.variants[0].video;
      await video.createSegmentIndex();
      ManifestParser.verifySegmentIndex(video, [expectedRef]);

      // Make sure the segment data was fetched with the correct byte
      // range.
      fakeNetEngine.expectRangeRequest(
          'test:/main.ts',
          expectedStartByte,
          partialEndByte);
    });

    it('parses start time from ts segments with null packets', async () => {
      const tsMediaPlaylist = media.replace(/\.mp4/g, '.ts');

      // Each packet is 188 bytes, so allocate space for 3.
      const tsSegmentWithNullPackets = new Uint8Array(188 * 3);
      // The first two are "null" packets.
      tsSegmentWithNullPackets.set(nullTsPacketData, /* offset= */ 0);
      tsSegmentWithNullPackets.set(nullTsPacketData, /* offset= */ 188);
      // The third has a timestamp.
      tsSegmentWithNullPackets.set(tsSegmentData, /* offset= */ 188 * 2);

      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', tsMediaPlaylist)
          .setResponseValue('test:/main.ts', tsSegmentWithNullPackets);

      const expectedRef = ManifestParser.makeReference(
          /* uri= */ 'test:/main.ts',
          /* startTime= */ 0,
          /* endTime= */ 5,
          /* baseUri= */ '',
          expectedStartByte,
          expectedEndByte);
      // In VOD content, we set the timestampOffset to align the
      // content to presentation time 0.
      expectedRef.timestampOffset = -segmentDataStartTime;

      const manifest = await parser.start('test:/master', playerInterface);
      const video = manifest.variants[0].video;
      await video.createSegmentIndex();
      ManifestParser.verifySegmentIndex(video, [expectedRef]);

      // Make sure the segment data was fetched with the correct byte
      // range.
      fakeNetEngine.expectRangeRequest(
          'test:/main.ts',
          expectedStartByte,
          partialEndByte);
    });

    // We want to make sure that we can interrupt the parser while it is getting
    // the start time. This is a regression test for Issue #1788 where
    // interrupting the partial network request would be misinterpreted as the
    // server not supporting range requests.
    it('can be interrupted', async () => {
      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', media)
          .setResponseValue('test:/init.mp4', initSegmentData);

      // We are assuming that the time will be pulled out of the main mp4
      // segment, so if we see a request that has a range header, we will stop
      // the parser.
      /** @type {!Map.<string, !BufferSource>} */
      const responses = new Map();
      responses.set('test:/main.mp4', segmentData);
      responses.set('test:/init.mp4', initSegmentData);

      responses.forEach((data, uri) => {
        fakeNetEngine.setResponse(uri, () => {
          // Now that we are stopping the parser, we don't want to see any more
          // requests. So if there is another request, fail the test.
          responses.forEach((data, uri) => {
            fakeNetEngine.setResponse(uri, fail);
          });

          // Stop the parser, but don't wait on it or else we will hit deadlock.
          parser.stop();

          return Promise.resolve(data);
        });
      });

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED));
      await expectAsync(parser.start('test:/master', playerInterface))
          .toBeRejectedWith(expected);
    });

    it('sets duration with respect to presentation offset', async () => {
      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', media)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData);

      const manifest = await parser.start('test:/master', playerInterface);
      const presentationTimeline = manifest.presentationTimeline;

      const video = manifest.variants[0].video;
      await video.createSegmentIndex();
      goog.asserts.assert(video.segmentIndex != null, 'Null segmentIndex!');

      const refs = Array.from(video.segmentIndex);
      expect(refs.length).toBe(1);

      expect(refs[0].timestampOffset).toBe(-segmentDataStartTime);
      // The duration should be set to the sum of the segment durations (5),
      // even though the endTime of the segment is larger.
      expect(refs[0].endTime - refs[0].startTime).toBe(5);
      expect(presentationTimeline.getDuration()).toBe(5);
    });

    it('forces full segment request', async () => {
      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', media)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData);

      const config = shaka.util.PlayerConfiguration.createDefault().manifest;
      config.hls.useFullSegmentsForStartTime = true;
      parser.configure(config);
      await parser.start('test:/master', playerInterface);

      // Make sure the segment data was fetched with the correct byte
      // range.
      fakeNetEngine.expectRangeRequest(
          'test:/main.mp4',
          expectedStartByte,
          expectedEndByte);
    });
  });

  it('correctly detects VOD streams as non-live', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4"\n',
      '#EXTINF:5,\n',
      'main.mp4',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const manifest = await parser.start('test:/master', playerInterface);
    expect(manifest.presentationTimeline.isLive()).toBe(false);
  });

  it('correctly detects streams with ENDLIST as non-live', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXT-X-ENDLIST',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const manifest = await parser.start('test:/master', playerInterface);
    expect(manifest.presentationTimeline.isLive()).toBe(false);
  });

  it('guesses MIME types for known extensions', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXT-X-ENDLIST',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const manifest = await parser.start('test:/master', playerInterface);
    const video = manifest.variants[0].video;
    expect(video.mimeType).toBe('video/mp4');
  });

  it('guesses MIME types for known extensions with parameters', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60\n',
      'video',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4"\n',
      '#EXTINF:5,\n',
      'main.mp4?foo=bar\n',
      '#EXT-X-ENDLIST',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4?foo=bar', segmentData);

    const manifest = await parser.start('test:/master', playerInterface);
    const video = manifest.variants[0].video;
    expect(video.mimeType).toBe('video/mp4');
  });

  it('does not produce multiple Streams for one playlist', async () => {
    // Regression test for a bug in our initial HLS live implementation
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=400,CODECS="avc1,mp4a",',
      'RESOLUTION=1280x720,AUDIO="audio"\n',
      'video0\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=768x432,AUDIO="audio"\n',
      'video1\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/video0', media)
        .setResponseText('test:/video1', media)
        .setResponseText('test:/audio', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const manifest = await parser.start('test:/master', playerInterface);
    expect(manifest.variants.length).toBe(2);
    const audio0 = manifest.variants[0].audio;
    const audio1 = manifest.variants[1].audio;
    // These should be the exact same memory address, not merely equal.
    // Otherwise, the parser will only be replacing one of the SegmentIndexes
    // on update, which will lead to live streaming issues.
    expect(audio0).toBe(audio1);
  });

  // https://github.com/google/shaka-player/issues/1664
  it('correctly resolves relative playlist URIs', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=400,CODECS="avc1,mp4a",',
      'RESOLUTION=1280x720,AUDIO="audio"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    fakeNetEngine
        .setResponseText('media/master', master)  // Relative master URI
        .setResponseText('http://foo/media/audio', media)
        .setResponseText('http://foo/media/video', media)
        .setResponseValue('http://foo/media/init.mp4', initSegmentData)
        .setResponseValue('http://foo/media/main.mp4', segmentData);

    fakeNetEngine.setResponseFilter((type, response) => {
      // Simulate support for relative URIs in the browser by setting the
      // absolute URI in response.uri.
      if (response.uri == 'media/master') {
        response.uri = 'http://foo/media/master';
      }
    });

    // When this test fails, parser.start() fails. The relative playlist URI was
    // being resolved to a bogus location ('media/media/audio'), which resulted
    // in a failed request.  Even if that bogus location were made absolute, it
    // would still be wrong.
    const manifest =
        await parser.start('media/master', playerInterface);
    expect(manifest.variants.length).toBe(1);
  });

  // https://github.com/google/shaka-player/issues/1908
  it('correctly pairs variants with multiple video and audio', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="en",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="fr",',
      'URI="audio2"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=1280x720,FRAME-RATE=30,AUDIO="aud1"\n',
      'video\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=400,CODECS="avc1,mp4a",',
      'RESOLUTION=1920x1080,FRAME-RATE=30,AUDIO="aud1"\n',
      'video2\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.language = 'en';
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(1280, 720);
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'en';
        });
      });
      manifest.addPartialVariant((variant) => {
        variant.language = 'fr';
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(1280, 720);
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'fr';
        });
      });
      manifest.addPartialVariant((variant) => {
        variant.language = 'en';
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(1920, 1080);
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'en';
        });
      });
      manifest.addPartialVariant((variant) => {
        variant.language = 'fr';
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(1920, 1080);
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'fr';
        });
      });
    });

    await testHlsParser(master, media, manifest);
  });

  it('skips raw audio formats', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio1"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio2"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio3"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio4"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=400,CODECS="avc1,mp4a",',
      'RESOLUTION=1280x720,AUDIO="audio"\n',
      'video\n',
    ].join('');

    const videoMedia = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="v-init.mp4"\n',
      '#EXTINF:5,\n',
      'v1.mp4',
    ].join('');

    const audioMedia1 = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      'a1.mp3',
    ].join('');

    const audioMedia2 = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      'a1.aac',
    ].join('');

    const audioMedia3 = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      'a1.ac3',
    ].join('');

    const audioMedia4 = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      'a1.ec3',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/video', videoMedia)
        .setResponseText('test:/audio1', audioMedia1)
        .setResponseText('test:/audio2', audioMedia2)
        .setResponseText('test:/audio3', audioMedia3)
        .setResponseText('test:/audio4', audioMedia4)
        .setResponseValue('test:/v-init.mp4', initSegmentData)
        .setResponseValue('test:/v1.mp4', segmentData);

    const alwaysWarnSpy = jasmine.createSpy('shaka.log.alwaysWarn');
    shaka.log.alwaysWarn = shaka.test.Util.spyFunc(alwaysWarnSpy);

    const manifest = await parser.start('test:/master', playerInterface);
    expect(manifest.variants.length).toBe(1);
    expect(manifest.variants[0].audio).toBe(null);

    // We should log a warning when this happens.
    expect(alwaysWarnSpy).toHaveBeenCalled();
  });

  // Issue #1875
  it('ignores audio groups on audio-only content', async () => {
    // NOTE: To reproduce the original issue accurately, the two audio playlist
    // URIs must differ.  When the issue occurred, the audio-only variant would
    // be detected as a video stream and combined with the audio group, leading
    // the player to buffer "video" that was really audio, resulting in
    // audio-only playback to the exclusion of any other streams.  Since the
    // root cause of that was the mis-detection, this repro case does not need
    // to include any audio+video variants.
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",LANG="en",URI="audio1"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",LANG="eo",URI="audio2"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="mp4a",AUDIO="aud"\n',
      'audio3\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.bandwidth = 200;
        variant.language = 'und';
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mp4', 'mp4a');
        });
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio1', media)
        .setResponseText('test:/audio2', media)
        .setResponseText('test:/audio3', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    expect(actual.variants.length).toBe(1);
    expect(actual).toEqual(manifest);
  });

  describe('Variable substitution', () => {
    it('parse variables master playlist', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-DEFINE:NAME="auth",VALUE="?token=1"\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
        'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
        'audio.m3u8{$auth}\n',
        '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="video.m3u8{$auth}"',
      ].join('');

      const media = [
        '#EXTM3U\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-MAP:URI="init.mp4"\n',
        '#EXTINF:5,\n',
        'segment.mp4',
      ].join('');

      fakeNetEngine
          .setResponseText('test:/host/master.m3u8', master)
          .setResponseText('test:/host/audio.m3u8?token=1', media)
          .setResponseText('test:/host/video.m3u8?token=1', media)
          .setResponseValue('test:/host/init.mp4', initSegmentData)
          .setResponseValue('test:/host/segment.mp4', segmentData);

      const actual =
          await parser.start('test:/host/master.m3u8', playerInterface);
      const video = actual.variants[0].video;
      const audio = actual.variants[0].audio;

      await video.createSegmentIndex();
      await audio.createSegmentIndex();
      goog.asserts.assert(video.segmentIndex != null, 'Null segmentIndex!');
      goog.asserts.assert(audio.segmentIndex != null, 'Null segmentIndex!');

      // We check that the references are correct to check that the entire
      // flow has gone well.
      const videoReference = Array.from(video.segmentIndex)[0];
      expect(videoReference.getUris())
          .toEqual(['test:/host/segment.mp4']);

      const audioReference = Array.from(audio.segmentIndex)[0];
      expect(audioReference.getUris())
          .toEqual(['test:/host/segment.mp4']);
    });

    it('parse variables in media playlist', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
        'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
        'audio.m3u8\n',
        '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="video.m3u8"',
      ].join('');

      const media = [
        '#EXTM3U\n',
        '#EXT-X-DEFINE:NAME="auth",VALUE="?token=1"\n',
        '#EXT-X-DEFINE:NAME="path",VALUE="test/"\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-MAP:URI="{$path}init.mp4"\n',
        '#EXTINF:5,\n',
        '{$path}segment.mp4{$auth}',
      ].join('');

      fakeNetEngine
          .setResponseText('test:/host/master.m3u8', master)
          .setResponseText('test:/host/audio.m3u8', media)
          .setResponseText('test:/host/video.m3u8', media)
          .setResponseValue('test:/host/test/init.mp4', initSegmentData)
          .setResponseValue('test:/host/test/segment.mp4?token=1', segmentData);

      const actual =
          await parser.start('test:/host/master.m3u8', playerInterface);
      const video = actual.variants[0].video;
      const audio = actual.variants[0].audio;

      await video.createSegmentIndex();
      await audio.createSegmentIndex();
      goog.asserts.assert(video.segmentIndex != null, 'Null segmentIndex!');
      goog.asserts.assert(audio.segmentIndex != null, 'Null segmentIndex!');

      // We check that the references are correct to check that the entire
      // flow has gone well.
      const videoReference = Array.from(video.segmentIndex)[0];
      expect(videoReference.getUris())
          .toEqual(['test:/host/test/segment.mp4?token=1']);

      const audioReference = Array.from(audio.segmentIndex)[0];
      expect(audioReference.getUris())
          .toEqual(['test:/host/test/segment.mp4?token=1']);
    });

    it('import variables in media from master playlist', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-DEFINE:NAME="auth",VALUE="?token=1"\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
        'RESOLUTION=960x540,FRAME-RATE=60,VIDEO="vid"\n',
        'audio.m3u8{$auth}\n',
        '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="vid",URI="video.m3u8{$auth}"',
      ].join('');

      const media = [
        '#EXTM3U\n',
        '#EXT-X-DEFINE:IMPORT="auth"\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-MAP:URI="init.mp4{$auth}"\n',
        '#EXTINF:5,\n',
        'segment.mp4{$auth}',
      ].join('');

      fakeNetEngine
          .setResponseText('test:/host/master.m3u8', master)
          .setResponseText('test:/host/audio.m3u8?token=1', media)
          .setResponseText('test:/host/video.m3u8?token=1', media)
          .setResponseValue('test:/host/init.mp4?token=1', initSegmentData)
          .setResponseValue('test:/host/segment.mp4?token=1', segmentData);

      const actual =
          await parser.start('test:/host/master.m3u8', playerInterface);
      const video = actual.variants[0].video;
      const audio = actual.variants[0].audio;

      await video.createSegmentIndex();
      await audio.createSegmentIndex();
      goog.asserts.assert(video.segmentIndex != null, 'Null segmentIndex!');
      goog.asserts.assert(audio.segmentIndex != null, 'Null segmentIndex!');

      // We check that the references are correct to check that the entire
      // flow has gone well.
      const videoReference = Array.from(video.segmentIndex)[0];
      expect(videoReference.getUris())
          .toEqual(['test:/host/segment.mp4?token=1']);

      const audioReference = Array.from(audio.segmentIndex)[0];
      expect(audioReference.getUris())
          .toEqual(['test:/host/segment.mp4?token=1']);
    });
  });

  describe('EXT-X-SESSION-DATA', () => {
    it('parses value data', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-SESSION-DATA:DATA-ID="fooId",VALUE="fooValue"\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="mp4a"\n',
        'audio',
      ].join('');

      const media = [
        '#EXTM3U\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXTINF:5,\n',
        '#EXT-X-BYTERANGE:121090@616\n',
        'main.mp4',
      ].join('');

      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.anyTimeline();
        manifest.addPartialVariant((variant) => {
          variant.addPartialStream(ContentType.AUDIO, (stream) => {
            stream.mime('audio/mp4', 'mp4a');
          });
        });
      });

      await testHlsParser(master, media, manifest);

      const eventValue = {
        type: 'sessiondata',
        id: 'fooId',
        value: 'fooValue',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue));
    });

    it('parses value data with language', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-SESSION-DATA:DATA-ID="fooId",LANGUAGE="en",VALUE="fooValue"\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="mp4a"\n',
        'audio',
      ].join('');

      const media = [
        '#EXTM3U\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXTINF:5,\n',
        '#EXT-X-BYTERANGE:121090@616\n',
        'main.mp4',
      ].join('');

      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.anyTimeline();
        manifest.addPartialVariant((variant) => {
          variant.addPartialStream(ContentType.AUDIO, (stream) => {
            stream.mime('audio/mp4', 'mp4a');
          });
        });
      });

      await testHlsParser(master, media, manifest);

      const eventValue = {
        type: 'sessiondata',
        id: 'fooId',
        language: 'en',
        value: 'fooValue',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue));
    });

    it('parses uri data', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-SESSION-DATA:DATA-ID="fooId",URI="foo.json"\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="mp4a"\n',
        'audio',
      ].join('');

      const media = [
        '#EXTM3U\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXTINF:5,\n',
        '#EXT-X-BYTERANGE:121090@616\n',
        'main.mp4',
      ].join('');

      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.anyTimeline();
        manifest.addPartialVariant((variant) => {
          variant.addPartialStream(ContentType.AUDIO, (stream) => {
            stream.mime('audio/mp4', 'mp4a');
          });
        });
      });

      await testHlsParser(master, media, manifest);

      const eventValue = {
        type: 'sessiondata',
        id: 'fooId',
        uri: 'test:/foo.json',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue));
    });

    it('parses mutiple data', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-SESSION-DATA:DATA-ID="fooId",LANGUAGE="en",VALUE="fooValue"\n',
        '#EXT-X-SESSION-DATA:DATA-ID="fooId",LANGUAGE="es",VALUE="fooValue"\n',
        '#EXT-X-SESSION-DATA:DATA-ID="fooId",URI="foo.json"\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="mp4a"\n',
        'audio',
      ].join('');

      const media = [
        '#EXTM3U\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXTINF:5,\n',
        '#EXT-X-BYTERANGE:121090@616\n',
        'main.mp4',
      ].join('');

      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.anyTimeline();
        manifest.addPartialVariant((variant) => {
          variant.addPartialStream(ContentType.AUDIO, (stream) => {
            stream.mime('audio/mp4', 'mp4a');
          });
        });
      });

      await testHlsParser(master, media, manifest);

      expect(onEventSpy).toHaveBeenCalledTimes(3);
      const eventValue1 = {
        type: 'sessiondata',
        id: 'fooId',
        language: 'en',
        value: 'fooValue',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
      const eventValue2 = {
        type: 'sessiondata',
        id: 'fooId',
        language: 'es',
        value: 'fooValue',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue2));
      const eventValue3 = {
        type: 'sessiondata',
        id: 'fooId',
        uri: 'test:/foo.json',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue3));
    });
  });
});
