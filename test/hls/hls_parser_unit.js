/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('HlsParser', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const TextStreamKind = shaka.util.ManifestParserUtils.TextStreamKind;
  const Util = shaka.test.Util;
  const originalAlwaysWarn = shaka.log.alwaysWarn;

  const videoInitSegmentUri = '/base/test/test/assets/sintel-video-init.mp4';
  const videoSegmentUri = '/base/test/test/assets/sintel-video-segment.mp4';
  const videoTsSegmentUri = '/base/test/test/assets/video.ts';

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
  /** @type {!jasmine.Spy} */
  let newDrmInfoSpy;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;
  /** @type {shaka.extern.ManifestConfiguration} */
  let config;
  /** @type {!Uint8Array} */
  let initSegmentData;
  /** @type {!Uint8Array} */
  let segmentData;
  /** @type {!Uint8Array} */
  let tsSegmentData;
  /** @type {!Uint8Array} */
  let selfInitializingSegmentData;
  /** @type {!Uint8Array} */
  let aes128Key;
  /** @type {!boolean} */
  let sequenceMode;

  afterEach(() => {
    shaka.log.alwaysWarn = originalAlwaysWarn;
    parser.stop();
  });

  beforeEach(async () => {
    const responses = await Promise.all([
      shaka.test.Util.fetch(videoInitSegmentUri),
      shaka.test.Util.fetch(videoSegmentUri),
      shaka.test.Util.fetch(videoTsSegmentUri),
    ]);
    initSegmentData = responses[0];
    segmentData = responses[1];

    selfInitializingSegmentData =
        shaka.util.Uint8ArrayUtils.concat(initSegmentData, segmentData);

    tsSegmentData = responses[2];

    aes128Key = new Uint8Array([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
      0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    ]);

    fakeNetEngine = new shaka.test.FakeNetworkingEngine();

    config = shaka.util.PlayerConfiguration.createDefault().manifest;
    sequenceMode = config.hls.sequenceMode;
    onEventSpy = jasmine.createSpy('onEvent');
    newDrmInfoSpy = jasmine.createSpy('newDrmInfo');
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
      updateDuration: () => {},
      newDrmInfo: shaka.test.Util.spyFunc(newDrmInfoSpy),
    };

    parser = new shaka.hls.HlsParser();
    parser.configure(config);
  });

  /**
   * @param {string} master
   * @param {string} media
   * @param {shaka.extern.Manifest} manifest
   * @param {string=} media2
   * @return {!Promise.<shaka.extern.Manifest>}
   */
  async function testHlsParser(master, media, manifest, media2) {
    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/audio2', media2 || media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/video2', media2 || media)
        .setResponseText('test:/text', media)
        .setResponseText('test:/text2', media2 || media)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/init2.mp4', initSegmentData)
        .setResponseValue('test:/init.test', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData)
        .setResponseValue('test:/main2.mp4', segmentData)
        .setResponseValue('test:/main.test', segmentData)
        .setResponseValue('test:/selfInit.mp4', selfInitializingSegmentData);

    const actual = await parser.start('test:/master', playerInterface);
    await loadAllStreamsFor(actual);
    expect(actual).toEqual(manifest);
    return actual;
  }

  /** @param {!shaka.extern.Manifest} manifest */
  async function loadAllStreamsFor(manifest) {
    const promises = [];
    for (const variant of manifest.variants) {
      for (const stream of [variant.video, variant.audio]) {
        if (stream) {
          promises.push(stream.createSegmentIndex());
        }
      }
    }
    for (const text of manifest.textStreams) {
      promises.push(text.createSegmentIndex());
    }
    for (const image of manifest.imageStreams) {
      promises.push(image.createSegmentIndex());
    }
    await Promise.all(promises);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
    await loadAllStreamsFor(actual);
    expect(actual).toEqual(manifest);
  });

  it('parses manifest attributes with space', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO, GROUP-ID="aud1", LANGUAGE="eng", ',
      'CHANNELS="16/JOC", URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES, GROUP-ID="sub1", LANGUAGE="eng", ',
      'URI="text"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES, GROUP-ID="sub2", LANGUAGE="es", ',
      'URI="text2"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200, CODECS="avc1,mp4a", ',
      'RESOLUTION=960x540, FRAME-RATE=60, AUDIO="aud1"\n',
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
    await loadAllStreamsFor(actual);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    await loadAllStreamsFor(actual);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
  });

  it('accepts containerless streams', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=41457,CODECS="mp4a.40.2"\n',
      'audio\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.aac',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/aac', '');
        });
      });
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
  });

  it('accepts mp4a.40.34 codec as audio/mpeg', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=63701,CODECS="mp4a.40.34"\n',
      'audio\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5,\n',
      'main.mp3',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mpeg', '');
        });
      });
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      'DEFAULT=YES,URI="audio"\n',
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
        variant.primary = true;
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(960, 540);
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'en';
        });
      });
      manifest.addPartialVariant((variant) => {
        variant.bandwidth = 300;
        variant.primary = false;
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(960, 540);
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'fr';
        });
      });
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses discontinuity tags', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=2000000,CODECS="avc1"\n',
      'video\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-VERSION:3\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MEDIA-SEQUENCE:0\n',
      '#EXTINF:3,\n',
      'clip0-video-0.ts\n',
      '#EXTINF:1,\n',
      'clip0-video-1.ts\n',
      '#EXT-X-DISCONTINUITY\n',
      '#EXTINF:2,\n',
      'clip1-video-1.ts\n',
      '#EXTINF:3,\n',
      'clip1-video-2.ts\n',
      '#EXT-X-DISCONTINUITY\n',
      '#EXTINF:1,\n',
      'media-clip2-video-0.ts\n',
      '#EXTINF:1,\n',
      'media-clip2-video-1.ts\n',
      '#EXT-X-DISCONTINUITY\n',
      '#EXTINF:4,\n',
      'media-clip3-video-1.ts\n',
      '#EXT-X-ENDLIST\n',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/video', media);

    const manifest = await parser.start('test:/master', playerInterface);
    await manifest.variants[0].video.createSegmentIndex();

    const segmentIndex = manifest.variants[0].video.segmentIndex;
    const references = [];

    for (let i = 0; i < 7; i++) {
      references.push(segmentIndex.get(i));
    }

    expect(references[0].discontinuitySequence).toBe(0);
    expect(references[1].discontinuitySequence).toBe(0);
    expect(references[2].discontinuitySequence).toBe(1);
    expect(references[3].discontinuitySequence).toBe(1);
    expect(references[4].discontinuitySequence).toBe(2);
    expect(references[5].discontinuitySequence).toBe(2);
    expect(references[6].discontinuitySequence).toBe(3);
  });

  it('sets reference timetampOffset based on discontinuity start time',
      async () => {
        const master = [
          '#EXTM3U\n',
          '#EXT-X-STREAM-INF:BANDWIDTH=2000000,CODECS="avc1"\n',
          'video\n',
        ].join('');

        const media = [
          '#EXTM3U\n',
          '#EXT-X-VERSION:3\n',
          '#EXT-X-TARGETDURATION:5\n',
          '#EXT-X-MEDIA-SEQUENCE:0\n',
          '#EXTINF:3,\n',
          'clip0-video-0.ts\n',
          '#EXTINF:1,\n',
          'clip0-video-1.ts\n',
          '#EXT-X-DISCONTINUITY\n',
          '#EXTINF:2,\n',
          'clip1-video-1.ts\n',
          '#EXTINF:3,\n',
          'clip1-video-2.ts\n',
          '#EXT-X-DISCONTINUITY\n',
          '#EXTINF:1,\n',
          'media-clip2-video-0.ts\n',
          '#EXTINF:1,\n',
          'media-clip2-video-1.ts\n',
          '#EXT-X-DISCONTINUITY\n',
          '#EXTINF:4,\n',
          'media-clip3-video-1.ts\n',
          '#EXT-X-ENDLIST\n',
        ].join('');

        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', media);

        const manifest = await parser.start('test:/master', playerInterface);
        await manifest.variants[0].video.createSegmentIndex();

        const segmentIndex = manifest.variants[0].video.segmentIndex;
        const references = [];

        for (let i = 0; i < 7; i++) {
          references.push(segmentIndex.get(i));
        }

        expect(references[0].timestampOffset).toBe(0);
        expect(references[1].timestampOffset).toBe(0);
        expect(references[2].timestampOffset).toBe(4);
        expect(references[3].timestampOffset).toBe(4);
        expect(references[4].timestampOffset).toBe(9);
        expect(references[5].timestampOffset).toBe(9);
        expect(references[6].timestampOffset).toBe(11);
      },
  );

  it('parses characteristics from audio tags', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',

      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="en",',
      'NAME="English",URI="audio"\n',

      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="en",',
      'CHARACTERISTICS="public.accessibility.describes-video,',
      'public.accessibility.describes-music-and-sound",',
      'NAME="English (describes-video)",URI="audio2"\n',
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
  });

  it('parses characteristics from text tags', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60,SUBTITLES="sub1"\n',
      'video\n',

      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="en",',
      'NAME="English (caption)",DEFAULT=YES,AUTOSELECT=YES,',
      'URI="text"\n',

      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="en",',
      'NAME="English (caption)",DEFAULT=YES,AUTOSELECT=YES,',
      'CHARACTERISTICS="public.accessibility.describes-spoken-dialog,',
      'public.accessibility.describes-music-and-sound",',
      'URI="text2"\n',
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
        stream.kind = TextStreamKind.SUBTITLE;
        stream.mime('application/mp4', '');
      });
      manifest.addPartialTextStream((stream) => {
        stream.language = 'en';
        stream.kind = TextStreamKind.SUBTITLE;
        stream.mime('application/mp4', '');
        stream.roles = [
          'public.accessibility.describes-spoken-dialog',
          'public.accessibility.describes-music-and-sound',
        ];
      });
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
  });

  // https://github.com/shaka-project/shaka-player/issues/4759
  it('makes roles available without loading tracks', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1",SUBTITLES="sub1"\n',
      'video\n',

      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="en",',
      'NAME="English",URI="audio"\n',

      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="en",',
      'CHARACTERISTICS="public.accessibility.describes-video,',
      'public.accessibility.describes-music-and-sound",',
      'NAME="English (describes-video)",URI="audio2"\n',

      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="en",',
      'NAME="English (caption)",DEFAULT=YES,AUTOSELECT=YES,',
      'URI="text"\n',

      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="en",',
      'NAME="English (caption)",DEFAULT=YES,AUTOSELECT=YES,',
      'CHARACTERISTICS="public.accessibility.describes-spoken-dialog,',
      'public.accessibility.describes-music-and-sound",',
      'URI="text2"\n',
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
      manifest.addPartialTextStream((stream) => {
        stream.language = 'en';
        stream.kind = TextStreamKind.SUBTITLE;
      });
      manifest.addPartialTextStream((stream) => {
        stream.language = 'en';
        stream.kind = TextStreamKind.SUBTITLE;
        stream.roles = [
          'public.accessibility.describes-spoken-dialog',
          'public.accessibility.describes-music-and-sound',
        ];
      });
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    fakeNetEngine.setResponseText('test:/master', master);

    // NOTE: Not using testHlsParser here because that unconditionally loads all
    // streams.  We need to test the behavior specifically when streams are
    // _not_ loaded.
    const actual = await parser.start('test:/master', playerInterface);
    expect(actual).toEqual(manifest);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
    await loadAllStreamsFor(actual);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
    await loadAllStreamsFor(actual);
    expect(actual).toEqual(manifest);
  });

  it('gets mime type of SUBTITLES from header request', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub1",LANGUAGE="eng",',
      'URI="text"\n',
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
      'main.subs',
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
        stream.mime('application/mp4', '');
      });
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/text', textMedia)
        .setResponseText('test:/main.subs', vttText)
        .setHeaders('test:/main.subs', {
          'content-type': 'application/mp4; foo=bar',
        })
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    await loadAllStreamsFor(actual);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
    await loadAllStreamsFor(actual);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
    await loadAllStreamsFor(actual);
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
    await loadAllStreamsFor(actual);
    // Duration should be the minimum of the streams, but ignore the text
    // stream.
    const timeline = actual.presentationTimeline;
    expect(timeline.getDuration()).toBe(10);
    expect(timeline.getSeekRangeStart()).toBe(0);
    expect(timeline.getSeekRangeEnd()).toBe(10);

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
    await loadAllStreamsFor(actual);

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

  it('parse EXT-X-GAP', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'CHANNELS="2",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
    ].join('');

    const video = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      '#EXT-X-GAP\n',
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
      '#EXT-X-GAP\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      'main.mp4\n',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', audio)
        .setResponseText('test:/video', video)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    await loadAllStreamsFor(actual);

    expect(actual.variants.length).toBe(1);

    const variant = actual.variants[0];
    expect(variant.video).toBeTruthy();
    expect(variant.audio).toBeTruthy();

    const available = shaka.media.SegmentReference.Status.AVAILABLE;
    const missing = shaka.media.SegmentReference.Status.MISSING;

    await variant.video.createSegmentIndex();
    goog.asserts.assert(variant.video.segmentIndex != null,
        'Null segmentIndex!');

    const firstVideoReference = variant.video.segmentIndex.get(0);
    const secondVideoReference = variant.video.segmentIndex.get(1);
    const thirdVideoReference = variant.video.segmentIndex.get(2);

    expect(firstVideoReference).not.toBe(null);
    expect(secondVideoReference).not.toBe(null);
    expect(thirdVideoReference).not.toBe(null);

    if (firstVideoReference) {
      expect(firstVideoReference.getStatus()).toBe(available);
    }
    if (secondVideoReference) {
      expect(secondVideoReference.getStatus()).toBe(missing);
    }
    if (thirdVideoReference) {
      expect(thirdVideoReference.getStatus()).toBe(available);
    }

    await variant.audio.createSegmentIndex();
    goog.asserts.assert(variant.audio.segmentIndex != null,
        'Null segmentIndex!');

    const firstAudioReference = variant.audio.segmentIndex.get(0);
    const secondAudioReference = variant.audio.segmentIndex.get(1);
    const thirdAudioReference = variant.audio.segmentIndex.get(2);

    expect(firstAudioReference).not.toBe(null);
    expect(secondAudioReference).not.toBe(null);
    expect(thirdAudioReference).not.toBe(null);

    if (firstAudioReference) {
      expect(firstAudioReference.getStatus()).toBe(available);
    }
    if (secondAudioReference) {
      expect(secondAudioReference.getStatus()).toBe(missing);
    }
    if (thirdAudioReference) {
      expect(thirdAudioReference.getStatus()).toBe(available);
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
    await loadAllStreamsFor(actual);
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
    await loadAllStreamsFor(actual);
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
    await loadAllStreamsFor(actual);
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
    await loadAllStreamsFor(actual);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/text', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    await loadAllStreamsFor(actual);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
    await loadAllStreamsFor(actual);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/text', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    await loadAllStreamsFor(actual);
    expect(actual).toEqual(manifest);
  });

  describe('produces syncTime', () => {
    // Corresponds to "2000-01-01T00:00:00.00Z".
    // All the PROGRAM-DATE-TIME values in the tests below are at or after this.
    const syncTimeBase = 946684800;

    /**
     * @param {number} startTime
     * @param {number} endTime
     * @param {number} syncTime
     * @return {!shaka.media.SegmentReference}
     */
    function makeReference(startTime, endTime, syncTime) {
      const initUris = () => ['test:/init.mp4'];
      const init = new shaka.media.InitSegmentReference(initUris, 0, 615);
      const uris = () => ['test:/main.mp4'];
      return new shaka.media.SegmentReference(
          startTime, endTime, uris, 0, null, init, 0, 0, Infinity,
          [], undefined, undefined, syncTime);
    }

    /**
     * @param {string} media
     * @param {!Array.<number>} startTimes
     * @param {number} syncTimeOffset
     * @param {(function(!shaka.media.SegmentReference))=} modifyFn
     */
    async function test(media, startTimes, syncTimeOffset, modifyFn) {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,vtt",',
        'RESOLUTION=960x540,FRAME-RATE=60\n',
        'video\n',
      ].join('');

      const segments = [];
      for (let i = 0; i < startTimes.length - 1; i++) {
        const startTime = startTimes[i];
        const endTime = startTimes[i + 1];
        const reference = makeReference(
            startTime, endTime, syncTimeOffset + startTime);
        if (modifyFn) {
          modifyFn(reference);
        }
        segments.push(reference);
      }

      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.anyTimeline();
        manifest.addPartialVariant((variant) => {
          variant.addPartialStream(ContentType.VIDEO, (stream) => {
            stream.segmentIndex = new shaka.media.SegmentIndex(segments);
          });
        });
        manifest.sequenceMode = sequenceMode;
        manifest.type = shaka.media.ManifestParser.HLS;
      });

      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', media)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData);

      const actual = await parser.start('test:/master', playerInterface);
      await loadAllStreamsFor(actual);
      expect(actual).toEqual(manifest);
    }

    it('from EXT-X-PROGRAM-DATE-TIME', async () => {
      await test([
        '#EXTM3U\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:05.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:10.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:15.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:20.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:25.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4',
      ].join(''), [0, 5, 10, 15, 20, 25], syncTimeBase + 5);
    });

    it('when some EXT-X-PROGRAM-DATE-TIME values are missing', async () => {
      await test([
        '#EXTM3U\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXTINF:2,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:10.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:25.00Z\n',
        '#EXTINF:2,\n',
        'main.mp4\n',
        '#EXTINF:4,\n',
        'main.mp4',
      ].join(''), [0, 2, 7, 12, 17, 19, 23], syncTimeBase + 8);
    });

    it('except when ignoreManifestProgramDateTime is set', async () => {
      const config = shaka.util.PlayerConfiguration.createDefault().manifest;
      config.hls.ignoreManifestProgramDateTime = true;
      parser.configure(config);
      await test([
        '#EXTM3U\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:05.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:10.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:15.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:20.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:25.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4',
      ].join(''), [0, 5, 10, 15, 20, 25], syncTimeBase + 5, (reference) => {
        reference.syncTime = null;
      });
    });

    it('when there are partial segments', async () => {
      playerInterface.isLowLatencyMode = () => true;
      await test([
        '#EXTM3U\n',
        '#EXT-X-PLAYLIST-TYPE:VOD\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:05.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:10.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:15.00Z\n',
        '#EXT-X-PART:DURATION=2.5,URI="main.mp4"\n',
        '#EXT-X-PART:DURATION=2.5,URI="main.mp4"\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:20.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4\n',
        '#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:00:25.00Z\n',
        '#EXTINF:5,\n',
        'main.mp4',
      ].join(''), [0, 5, 10, 15, 20, 25], syncTimeBase + 5, (reference) => {
        if (reference.startTime == 10) {
          reference.partialReferences = [
            makeReference(10, 12.5, syncTimeBase + 15),
            makeReference(12.5, 15, syncTimeBase + 17.5),
          ];
        }
      });
    });
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    config.hls.ignoreTextStreamFailures = true;
    const actual = await parser.start('test:/master', playerInterface);
    await loadAllStreamsFor(actual);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/video', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    config.hls.ignoreImageStreamFailures = true;
    const actual = await parser.start('test:/master', playerInterface);
    await loadAllStreamsFor(actual);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
    await loadAllStreamsFor(actual);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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

  it('parses variants encrypted with AES-128', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=300,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=120,AUDIO="aud2"\n',
      'video2\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=300,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=120,AUDIO="aud3"\n',
      'video3\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud2",LANGUAGE="fr",',
      'URI="audio2"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud3",LANGUAGE="de",',
      'URI="audio3"\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const mediaWithMp4AesEncryption = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-KEY:METHOD=AES-128,',
      'URI="800k.key"\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      '#EXT-X-KEY:METHOD=NONE\n',
      'main.mp4',
    ].join('');

    const mediaWithTSAesEncryption = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-KEY:METHOD=AES-128,',
      'URI="800k.key"\n',
      '#EXTINF:5,\n',
      'main.ts\n',
      '#EXTINF:5,\n',
      '#EXT-X-KEY:METHOD=NONE\n',
      'main.ts',
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
      manifest.addPartialVariant((variant) => {
        variant.bandwidth = 300;
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(960, 540);
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'de';
        });
      });
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', media)
        .setResponseText('test:/audio2', media)
        .setResponseText('test:/audio3', media)
        .setResponseText('test:/video', media)
        .setResponseText('test:/video2', mediaWithMp4AesEncryption)
        .setResponseText('test:/video3', mediaWithTSAesEncryption)
        .setResponseText('test:/main.vtt', vttText)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData)
        .setResponseValue('test:/main.test', segmentData)
        .setResponseValue('test:/800k.key', aes128Key)
        .setResponseValue('test:/selfInit.mp4', selfInitializingSegmentData);

    const actual = await parser.start('test:/master', playerInterface);
    await loadAllStreamsFor(actual);
    expect(actual).toEqual(manifest);

    const mp4AesEncryptionVideo = actual.variants[1].video;
    await mp4AesEncryptionVideo.createSegmentIndex();
    goog.asserts.assert(mp4AesEncryptionVideo.segmentIndex != null,
        'Null segmentIndex!');

    const firstMp4Segment = mp4AesEncryptionVideo.segmentIndex.get(0);
    expect(firstMp4Segment.hlsAes128Key).toBeDefined();
    const secondMp4Segment = mp4AesEncryptionVideo.segmentIndex.get(1);
    expect(secondMp4Segment.hlsAes128Key).toBeNull();

    const tsAesEncryptionVideo = actual.variants[2].video;
    await tsAesEncryptionVideo.createSegmentIndex();
    goog.asserts.assert(tsAesEncryptionVideo.segmentIndex != null,
        'Null segmentIndex!');

    const firstTsSegment = tsAesEncryptionVideo.segmentIndex.get(0);
    expect(firstTsSegment.hlsAes128Key).toBeDefined();
    const secondTsSegment = tsAesEncryptionVideo.segmentIndex.get(1);
    expect(secondTsSegment.hlsAes128Key).toBeNull();
  });

  it('fails on AES-128 if WebCrypto APIs are not available', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
      'URI="audio"\n',
    ].join('');

    const mediaWithMp4AesEncryption = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-KEY:METHOD=AES-128,',
      'URI="800k.key"\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', mediaWithMp4AesEncryption)
        .setResponseText('test:/video', mediaWithMp4AesEncryption)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData)
        .setResponseValue('test:/800k.key', aes128Key);

    let originalWebCrypto = null;
    try {
      originalWebCrypto = window.crypto;
      Object.defineProperty(window, 'crypto', {
        configurable: true,
        value: null,
      });

      const expectedError = shaka.test.Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.NO_WEB_CRYPTO_API));
      const actual = await parser.start('test:/master', playerInterface);
      await expectAsync(loadAllStreamsFor(actual))
          .toBeRejectedWith(expectedError);
    } finally {
      Object.defineProperty(window, 'crypto', {
        configurable: true,
        value: originalWebCrypto,
      });
    }
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
    expect(newDrmInfoSpy).toHaveBeenCalled();
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
    expect(newDrmInfoSpy).toHaveBeenCalled();
  });

  it('constructs DrmInfo for FairPlay', async () => {
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
      '#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,',
      'KEYFORMAT="com.apple.streamingkeydelivery",',
      'URI="skd://f93d4e700d7ddde90529a27735d9e7cb",\n',
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
          stream.addDrmInfo('com.apple.fps', (drmInfo) => {
            drmInfo.addInitData('sinf', new Uint8Array(0));
          });
        });
      });
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
    expect(newDrmInfoSpy).toHaveBeenCalled();
  });

  it('constructs DrmInfo for ClearKey with explicit KEYFORMAT', async () => {
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
      '#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,',
      'KEYFORMAT="identity",',
      'URI="key.bin",\n',
      '#EXT-X-MAP:URI="init.mp4"\n',
      '#EXTINF:5,\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.encrypted = true;
          stream.addDrmInfo('org.w3.clearkey');
        });
      });
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
    expect(newDrmInfoSpy).toHaveBeenCalled();
  });

  it('constructs DrmInfo for ClearKey without explicit KEYFORMAT', async () => {
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
      '#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,',
      'URI="key.bin",\n',
      '#EXT-X-MAP:URI="init.mp4"\n',
      '#EXTINF:5,\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.encrypted = true;
          stream.addDrmInfo('org.w3.clearkey');
        });
      });
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
    expect(newDrmInfoSpy).toHaveBeenCalled();
  });

  describe('constructs DrmInfo with EXT-X-SESSION-KEY', () => {
    it('for Widevine', async () => {
      const initDataBase64 =
          'dGhpcyBpbml0IGRhdGEgY29udGFpbnMgaGlkZGVuIHNlY3JldHMhISE=';

      const keyId = 'abc123';

      const master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
        'RESOLUTION=960x540,FRAME-RATE=60\n',
        'video\n',
        '#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES-CTR,',
        'KEYID=0X' + keyId + ',',
        'KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed",',
        'URI="data:text/plain;base64,',
        initDataBase64, '",\n',
      ].join('');

      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.anyTimeline();
        manifest.addPartialVariant((variant) => {
          variant.addPartialStream(ContentType.VIDEO, (stream) => {
            stream.addDrmInfo('com.widevine.alpha', (drmInfo) => {
              drmInfo.addCencInitData(initDataBase64);
              drmInfo.keyIds.add(keyId);
            });
          });
        });
        manifest.sequenceMode = sequenceMode;
        manifest.type = shaka.media.ManifestParser.HLS;
      });

      fakeNetEngine.setResponseText('test:/master', master);

      const actual = await parser.start('test:/master', playerInterface);
      expect(actual).toEqual(manifest);
    });

    it('for PlayReady', async () => {
      const initDataBase64 =
          'AAAAKXBzc2gAAAAAmgTweZhAQoarkuZb4IhflQAAAAlQbGF5cmVhZHk=';

      const master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
        'RESOLUTION=960x540,FRAME-RATE=60\n',
        'video\n',
        '#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES-CTR,',
        'KEYFORMAT="com.microsoft.playready",',
        'URI="data:text/plain;base64,UGxheXJlYWR5",\n',
      ].join('');

      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.anyTimeline();
        manifest.addPartialVariant((variant) => {
          variant.addPartialStream(ContentType.VIDEO, (stream) => {
            stream.addDrmInfo('com.microsoft.playready', (drmInfo) => {
              drmInfo.addCencInitData(initDataBase64);
            });
          });
        });
        manifest.sequenceMode = sequenceMode;
        manifest.type = shaka.media.ManifestParser.HLS;
      });

      fakeNetEngine.setResponseText('test:/master', master);

      const actual = await parser.start('test:/master', playerInterface);
      expect(actual).toEqual(manifest);
    });

    it('for FairPlay', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
        'RESOLUTION=960x540,FRAME-RATE=60\n',
        'video\n',
        '#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES-CTR,',
        'KEYFORMAT="com.apple.streamingkeydelivery",',
        'URI="skd://f93d4e700d7ddde90529a27735d9e7cb",\n',
      ].join('');

      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.anyTimeline();
        manifest.addPartialVariant((variant) => {
          variant.addPartialStream(ContentType.VIDEO, (stream) => {
            stream.addDrmInfo('com.apple.fps', (drmInfo) => {
              drmInfo.addInitData('sinf', new Uint8Array(0));
            });
          });
        });
        manifest.sequenceMode = sequenceMode;
        manifest.type = shaka.media.ManifestParser.HLS;
      });

      fakeNetEngine.setResponseText('test:/master', master);

      const actual = await parser.start('test:/master', playerInterface);
      expect(actual).toEqual(manifest);
    });

    it('for ClearKey with explicit KEYFORMAT', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
        'RESOLUTION=960x540,FRAME-RATE=60\n',
        'video\n',
        '#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES-CTR,',
        'KEYFORMAT="identity",',
        'URI="key.bin",\n',
      ].join('');

      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.anyTimeline();
        manifest.addPartialVariant((variant) => {
          variant.addPartialStream(ContentType.VIDEO, (stream) => {
            stream.addDrmInfo('org.w3.clearkey');
          });
        });
        manifest.sequenceMode = sequenceMode;
        manifest.type = shaka.media.ManifestParser.HLS;
      });

      fakeNetEngine.setResponseText('test:/master', master);

      const actual = await parser.start('test:/master', playerInterface);
      expect(actual).toEqual(manifest);
    });

    it('for ClearKey without explicit KEYFORMAT', async () => {
      const master = [
        '#EXTM3U\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
        'RESOLUTION=960x540,FRAME-RATE=60\n',
        'video\n',
        '#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES-CTR,',
        'URI="key.bin",\n',
      ].join('');

      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.anyTimeline();
        manifest.addPartialVariant((variant) => {
          variant.addPartialStream(ContentType.VIDEO, (stream) => {
            stream.addDrmInfo('org.w3.clearkey');
          });
        });
        manifest.sequenceMode = sequenceMode;
        manifest.type = shaka.media.ManifestParser.HLS;
      });

      fakeNetEngine.setResponseText('test:/master', master);

      const actual = await parser.start('test:/master', playerInterface);
      expect(actual).toEqual(manifest);
    });
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
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
     * @param {boolean=} onCreateSegmentIndex
     */
    async function verifyError(master, media, error, onCreateSegmentIndex) {
      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/audio', media)
          .setResponseText('test:/video', media)
          .setResponseValue('test:/main.exe', segmentData)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData)
          .setResponseValue('data:text/plain;base64,AAECAwQFBgcICQoLDA0ODw==',
              aes128Key);

      if (onCreateSegmentIndex) {
        const actual = await parser.start('test:/master', playerInterface);
        await expectAsync(loadAllStreamsFor(actual))
            .toBeRejectedWith(Util.jasmineError(error));
      } else {
        await expectAsync(parser.start('test:/master', playerInterface))
            .toBeRejectedWith(Util.jasmineError(error));
      }
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

    it('if FairPlay encryption with MSE and mp2t content', async () => {
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
        '#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,',
        'KEYFORMAT="com.apple.streamingkeydelivery",',
        'URI="skd://f93d4e700d7ddde90529a27735d9e7cb",\n',
        '#EXTINF:5,\n',
        '#EXT-X-BYTERANGE:121090@616\n',
        'main.ts',
      ].join('');

      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          Code.HLS_MSE_ENCRYPTED_MP2T_NOT_SUPPORTED);

      await verifyError(master, media, error, /* onCreateSegmentIndex= */ true);
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

        await verifyError(
            master, media, error, /* onCreateSegmentIndex= */ true);
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

  // https://github.com/shaka-project/shaka-player/issues/1664
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

  // https://github.com/shaka-project/shaka-player/issues/1908
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    await testHlsParser(master, media, manifest);
  });

  // https://github.com/shaka-project/shaka-player/issues/4308
  it('handles unaligned streams', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
      'RESOLUTION=1280x720,FRAME-RATE=30\n',
      'video\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=400,CODECS="avc1",',
      'RESOLUTION=1920x1080,FRAME-RATE=30\n',
      'video2\n',
    ].join('');

    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:5\n',
      'main.mp4\n',
      '#EXTINF:5\n',
      'main.mp4',
    ].join('');

    const media2 = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXTINF:4\n',
      'main.mp4\n',
      '#EXTINF:5\n',
      'main.mp4\n',
      '#EXTINF:1\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(1280, 720);
        });
      });
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.size(1920, 1080);
        });
      });
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    const actual = await testHlsParser(master, media, manifest, media2);

    const videoSegments =
          Array.from(actual.variants[0].video.segmentIndex || '');
    expect(videoSegments[0].endTime).toBe(5);
    expect(videoSegments[1].endTime).toBe(10);

    const videoSegments2 =
        Array.from(actual.variants[1].video.segmentIndex || '');
    expect(videoSegments2[0].endTime).toBe(4);
    expect(videoSegments2[1].endTime).toBe(9);
    expect(videoSegments2[2].endTime).toBe(10);
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
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio1', media)
        .setResponseText('test:/audio2', media)
        .setResponseText('test:/audio3', media)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData);

    const actual = await parser.start('test:/master', playerInterface);
    await loadAllStreamsFor(actual);
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
      await loadAllStreamsFor(actual);
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
      await loadAllStreamsFor(actual);
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
      await loadAllStreamsFor(actual);
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
        manifest.sequenceMode = sequenceMode;
        manifest.type = shaka.media.ManifestParser.HLS;
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
        manifest.sequenceMode = sequenceMode;
        manifest.type = shaka.media.ManifestParser.HLS;
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
        manifest.sequenceMode = sequenceMode;
        manifest.type = shaka.media.ManifestParser.HLS;
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
        manifest.sequenceMode = sequenceMode;
        manifest.type = shaka.media.ManifestParser.HLS;
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

  it('parses media playlists directly', async () => {
    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp4',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1.42E01E');
        });
      });
    });

    const actualManifest = await testHlsParser(media, '', manifest);

    expect(actualManifest.presentationTimeline.getDuration()).toBe(5);
  });

  it('honors hls.mediaPlaylistFullMimeType', async () => {
    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.test",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.test',
    ].join('');

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.hls.mediaPlaylistFullMimeType = 'audio/webm; codecs="vorbis"';
    parser.configure(config);

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/webm', 'vorbis');
        });
      });
    });

    await testHlsParser(media, '', manifest);
  });

  it('honors hls.mediaPlaylistFullMimeType but detects AAC', async () => {
    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.aac',
    ].join('');

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    parser.configure(config);

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/aac');
        });
      });
    });

    await testHlsParser(media, '', manifest);
  });

  it('honors hls.mediaPlaylistFullMimeType but detects MPEG', async () => {
    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:VOD\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:5,\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      'main.mp3',
    ].join('');

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    parser.configure(config);

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.mime('audio/mpeg');
        });
      });
    });

    await testHlsParser(media, '', manifest);
  });

  it('syncs on sequence with ignoreManifestProgramDateTime', async () => {
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.hls.ignoreManifestProgramDateTime = true;
    parser.configure(config);

    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
    ].join('');

    const video = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:1\n',
      '#EXTINF:5,\n',
      'video1.mp4\n',
      '#EXTINF:5,\n',
      'video2.mp4\n',
      '#EXTINF:5,\n',
      'video3.mp4\n',
    ].join('');

    const audio = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:3\n',
      '#EXTINF:5,\n',
      'audio3.mp4\n',
      '#EXTINF:5,\n',
      'audio4.mp4\n',
    ].join('');

    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.sequenceMode = sequenceMode;
      manifest.type = shaka.media.ManifestParser.HLS;
      manifest.anyTimeline();
      manifest.addPartialVariant((variant) => {
        variant.language = 'en';
        variant.bandwidth = 200;
        variant.addPartialStream(ContentType.VIDEO, (stream) => {
          stream.mime('video/mp4', 'avc1');
          stream.size(960, 540);
          stream.frameRate = 60;
        });
        variant.addPartialStream(ContentType.AUDIO, (stream) => {
          stream.language = 'en';
          stream.mime('audio/mp4', 'mp4a');
        });
      });
    });

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', audio)
        .setResponseText('test:/video', video)
        .setResponseValue('test:/init.mp4', initSegmentData);

    const actualManifest = await parser.start('test:/master', playerInterface);
    expect(actualManifest).toEqual(manifest);

    const actualVideo = actualManifest.variants[0].video;
    await actualVideo.createSegmentIndex();
    goog.asserts.assert(actualVideo.segmentIndex != null, 'Null segmentIndex!');

    const actualAudio = actualManifest.variants[0].audio;
    await actualAudio.createSegmentIndex();
    goog.asserts.assert(actualAudio.segmentIndex != null, 'Null segmentIndex!');

    // Verify that the references are aligned on sequence number.
    const videoSegments = Array.from(actualVideo.segmentIndex);
    const audioSegments = Array.from(actualAudio.segmentIndex);

    // The first two were dropped to align with the audio.
    expect(videoSegments.map((ref) => ref.getUris()[0])).toEqual([
      'test:/video3.mp4',
    ]);
    // Audio has a 4th segment that video doesn't, but that doesn't get clipped
    // or used as the base.  Alignment is truly based on media sequence number.
    expect(audioSegments.map((ref) => ref.getUris()[0])).toEqual([
      'test:/audio3.mp4',
      'test:/audio4.mp4',
    ]);
  });

  it('lazy-loads TS content without filtering it out', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",URI="audio"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=120,AUDIO="aud1"\n',
      'video2\n',
    ].join('');

    const video = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:1\n',
      '#EXTINF:5,\n',
      'video1.ts\n',
      '#EXTINF:5,\n',
      'video2.ts\n',
    ].join('');

    const audio = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:3\n',
      '#EXTINF:5,\n',
      'audio1.ts\n',
      '#EXTINF:5,\n',
      'audio2.ts\n',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', audio)
        .setResponseText('test:/video', video)
        .setResponseText('test:/video2', video)
        .setResponseValue('test:/init.mp4', initSegmentData);

    const actualManifest = await parser.start('test:/master', playerInterface);
    expect(actualManifest.variants.length).toBe(2);

    const actualVideo0 = actualManifest.variants[0].video;
    const actualVideo1 = actualManifest.variants[1].video;

    // Before loading, all MIME types agree, and are defaulted to video/mp4.
    expect(actualVideo0.mimeType).toBe('video/mp4');
    expect(actualVideo1.mimeType).toBe('video/mp4');

    await actualVideo0.createSegmentIndex();

    // After loading just ONE stream, all MIME types agree again, and have been
    // updated to reflect the TS content found inside the loaded playlist.
    // This is how we avoid having the unloaded tracks filtered out during
    // startup.
    expect(actualVideo0.mimeType).toBe('video/mp2t');
    expect(actualVideo1.mimeType).toBe('video/mp2t');
  });

  it('lazy-loads AAC content without filtering it out', async () => {
    const master = [
      '#EXTM3U\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",URI="audio"\n',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="spa",URI="audio2"\n',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",',
      'RESOLUTION=960x540,FRAME-RATE=60,AUDIO="aud1"\n',
      'video\n',
    ].join('');

    const video = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:1\n',
      '#EXTINF:5,\n',
      'video1.ts\n',
      '#EXTINF:5,\n',
      'video2.ts\n',
    ].join('');

    const audio = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MEDIA-SEQUENCE:3\n',
      '#EXTINF:5,\n',
      'audio1.aac\n',
      '#EXTINF:5,\n',
      'audio2.aac\n',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/audio', audio)
        .setResponseText('test:/audio2', audio)
        .setResponseText('test:/video', video)
        .setResponseValue('test:/init.mp4', initSegmentData);

    const actualManifest = await parser.start('test:/master', playerInterface);
    expect(actualManifest.variants.length).toBe(2);

    const actualAudio0 = actualManifest.variants[0].audio;
    const actualAudio1 = actualManifest.variants[1].audio;

    // Before loading, all MIME types agree, and are defaulted to audio/mp4.
    expect(actualAudio0.mimeType).toBe('audio/mp4');
    expect(actualAudio1.mimeType).toBe('audio/mp4');

    await actualAudio0.createSegmentIndex();

    // After loading just ONE stream, all MIME types agree again, and have been
    // updated to reflect the AAC content found inside the loaded playlist.
    // This is how we avoid having the unloaded tracks filtered out during
    // startup.
    expect(actualAudio0.mimeType).toBe('audio/aac');
    expect(actualAudio0.codecs).toBe('');
    expect(actualAudio1.mimeType).toBe('audio/aac');
    expect(actualAudio1.codecs).toBe('');
  });

  it('parses media playlists directly', async () => {
    const mediaPlaylist = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXTINF:5,\n',
      'video1.ts\n',
    ].join('');

    fakeNetEngine
        .setResponseText('test:/master', mediaPlaylist)
        .setResponseValue('test:/video1.ts', tsSegmentData);

    const actualManifest = await parser.start('test:/master', playerInterface);
    expect(actualManifest.variants.length).toBe(1);

    const video = actualManifest.variants[0].video;

    expect(video.width).toBe(256);
    expect(video.height).toBe(110);
  });
});
