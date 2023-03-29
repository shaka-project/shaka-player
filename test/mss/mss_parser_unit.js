/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Test basic manifest parsing functionality.
describe('MssParser Manifest', () => {
  // const ManifestParser = shaka.test.ManifestParser;
  const Mss = shaka.test.Mss;

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.mss.MssParser} */
  let parser;
  /** @type {!jasmine.Spy} */
  let onEventSpy;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;

  const h264CodecPrivateData = '000000016764001FAC2CA5014016EFFC100010014808' +
      '080A000007D200017700C100005A648000B4C9FE31C6080002D3240005A64FF18E1DA' +
      '12251600000000168E9093525';

  const aacCodecPrivateData = '1210';

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
    await Promise.all(promises);
  }

  beforeEach(() => {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = Mss.makeMssParser();
    onEventSpy = jasmine.createSpy('onEvent');
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
      isAutoLowLatencyMode: () => false,
      enableLowLatencyMode: () => {},
      updateDuration: () => {},
      newDrmInfo: (stream) => {},
    };
  });

  describe('fails for', () => {
    it('invalid XML', async () => {
      const source = '<not XML';
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSS_INVALID_XML,
          'dummy://foo');
      await Mss.testFails(source, error);
    });

    it('XML with inner errors', async () => {
      const source = [
        '<SmoothStreamingMedia Duration="1209510000">',
        '  <StreamIndex Name="audio" Type="audio" Url="uri">',
        '    <QualityLevel Bitrate="128000" Channels="2" CodecPrivateData="',
        aacCodecPrivateData,
        '" FourCC="AACL"/>',
        '    <c d="20201360"/>',
        '  </StreamIndex', // Missing a close bracket.
        '</SmoothStreamingMedia>',
      ].join('\n');
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSS_INVALID_XML,
          'dummy://foo');
      await Mss.testFails(source, error);
    });

    it('failed network requests', async () => {
      const expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      fakeNetEngine.request.and.returnValue(
          shaka.util.AbortableOperation.failed(expectedError));
      await expectAsync(parser.start('', playerInterface))
          .toBeRejectedWith(shaka.test.Util.jasmineError(expectedError));
    });

    it('missing SmoothStreamingMedia element', async () => {
      const source = '<XML></XML>';
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSS_INVALID_XML,
          'dummy://foo');
      await Mss.testFails(source, error);
    });

    it('ive content ', async () => {
      const source = [
        '<SmoothStreamingMedia Duration="1209510000" IsLive="true">',
        '  <StreamIndex Name="audio" Type="audio" Url="uri">',
        '    <QualityLevel Bitrate="128000" Channels="2" CodecPrivateData="',
        aacCodecPrivateData,
        '" FourCC="AACL"/>',
        '    <c d="20201360"/>',
        '  </StreamIndex>',
        '</SmoothStreamingMedia>',
      ].join('\n');
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSS_LIVE_CONTENT_NOT_SUPPORTED);
      await Mss.testFails(source, error);
    });
  });

  it('Disable audio does not create audio streams', async () => {
    const manifestText = [
      '<SmoothStreamingMedia Duration="1209510000">',
      '  <StreamIndex Type="video" Url="uri">',
      '    <QualityLevel Bitrate="2962000" CodecPrivateData="',
      h264CodecPrivateData,
      '" FourCC="H264" MaxHeight="720" MaxWidth="1280"/>',
      '    <c d="20020000"/>',
      '  </StreamIndex>',
      '  <StreamIndex Name="audio" Type="audio" Url="uri">',
      '    <QualityLevel Bitrate="128000" Channels="2" CodecPrivateData="',
      aacCodecPrivateData,
      '" FourCC="AACL"/>',
      '    <c d="20201360"/>',
      '  </StreamIndex>',
      '</SmoothStreamingMedia>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.disableAudio = true;
    parser.configure(config);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    expect(variant.audio).toBe(null);
    expect(variant.video).toBeTruthy();
  });

  it('Disable video does not create video streams', async () => {
    const manifestText = [
      '<SmoothStreamingMedia Duration="1209510000">',
      '  <StreamIndex Type="video" Url="uri">',
      '    <QualityLevel Bitrate="2962000" CodecPrivateData="',
      h264CodecPrivateData,
      '" FourCC="H264" MaxHeight="720" MaxWidth="1280"/>',
      '    <c d="20020000"/>',
      '  </StreamIndex>',
      '  <StreamIndex Name="audio" Type="audio" Url="uri">',
      '    <QualityLevel Bitrate="128000" Channels="2" CodecPrivateData="',
      aacCodecPrivateData,
      '" FourCC="AACL"/>',
      '    <c d="20201360"/>',
      '  </StreamIndex>',
      '</SmoothStreamingMedia>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.disableVideo = true;
    parser.configure(config);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    expect(variant.audio).toBeTruthy();
    expect(variant.video).toBe(null);
  });

  it('Disable text does not create text streams', async () => {
    const manifestText = [
      '<SmoothStreamingMedia Duration="1209510000">',
      '  <StreamIndex Type="video" Url="uri">',
      '    <QualityLevel Bitrate="2962000" CodecPrivateData="',
      h264CodecPrivateData,
      '" FourCC="H264" MaxHeight="720" MaxWidth="1280"/>',
      '    <c d="20020000"/>',
      '  </StreamIndex>',
      '  <StreamIndex Name="audio" Type="audio" Url="uri">',
      '    <QualityLevel Bitrate="128000" Channels="2" CodecPrivateData="',
      aacCodecPrivateData,
      '" FourCC="AACL"/>',
      '    <c d="20201360"/>',
      '  </StreamIndex>',
      '  <StreamIndex Name="text" Type="text" Url="uri">',
      '    <QualityLevel Bitrate="1000" FourCC="TTML"/>',
      '    <c d="20201360"/>',
      '  </StreamIndex>',
      '</SmoothStreamingMedia>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.disableText = true;
    parser.configure(config);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.textStreams[0];
    expect(stream).toBeUndefined();
  });

  it('Invokes manifestPreprocessor in config', async () => {
    const manifestText = [
      '<SmoothStreamingMedia Duration="1209510000">',
      '  <StreamIndex Type="video" Url="uri">',
      '    <QualityLevel Bitrate="2962000" CodecPrivateData="',
      h264CodecPrivateData,
      '" FourCC="H264" MaxHeight="720" MaxWidth="1280"/>',
      '    <c d="20020000"/>',
      '  </StreamIndex>',
      '  <StreamIndex Name="audio" Type="audio" Url="uri">',
      '    <QualityLevel Bitrate="128000" Channels="2" CodecPrivateData="',
      aacCodecPrivateData,
      '" FourCC="AACL"/>',
      '    <c d="20201360"/>',
      '  </StreamIndex>',
      '  <StreamIndex Name="text" Type="text" Url="uri">',
      '    <QualityLevel Bitrate="1000" FourCC="TTML"/>',
      '    <c d="20201360"/>',
      '  </StreamIndex>',
      '</SmoothStreamingMedia>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.mss.manifestPreprocessor = (mss) => {
      const selector = 'StreamIndex[Name="text"';
      const vttElements = mss.querySelectorAll(selector);
      for (const element of vttElements) {
        element.parentNode.removeChild(element);
      }
    };
    parser.configure(config);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.textStreams[0];
    expect(stream).toBeUndefined();
  });

  it('generate a fake init segment', async () => {
    const manifestText = [
      '<SmoothStreamingMedia Duration="3600000000">',
      '  <StreamIndex Name="audio" Type="audio" Url="{bitrate}/{start time}">',
      '    <QualityLevel Bitrate="128000" Channels="2" CodecPrivateData="',
      aacCodecPrivateData,
      '" FourCC="AACL"/>',
      '    <c t="0" d="30000000" r="12"/>',
      '  </StreamIndex>',
      '</SmoothStreamingMedia>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const segmentReference =
        await Mss.getFirstAudioSegmentReference(manifest);
    const initSegmentReference = segmentReference.initSegmentReference;
    expect(initSegmentReference.getUris()).toEqual([]);
    expect(initSegmentReference.getStartByte()).toBe(0);
    expect(initSegmentReference.getEndByte()).toBe(null);
    expect(initSegmentReference.getSegmentData()).toBeDefined();
  });

  it('skip video stream without CodecPrivateData', async () => {
    const manifestText = [
      '<SmoothStreamingMedia Duration="1209510000">',
      '  <StreamIndex Type="video" Url="uri">',
      '    <QualityLevel Bitrate="2962000" FourCC="H264" MaxHeight="720" ',
      '    MaxWidth="1280"/>',
      '    <c d="20020000"/>',
      '  </StreamIndex>',
      '  <StreamIndex Name="audio" Type="audio" Url="uri">',
      '    <QualityLevel Bitrate="128000" Channels="2" CodecPrivateData="',
      aacCodecPrivateData,
      '" FourCC="AACL"/>',
      '    <c d="20201360"/>',
      '  </StreamIndex>',
      '</SmoothStreamingMedia>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    expect(variant.audio).toBeTruthy();
    expect(variant.video).toBe(null);
  });

  it('skip video stream without FourCC', async () => {
    const manifestText = [
      '<SmoothStreamingMedia Duration="1209510000">',
      '  <StreamIndex Type="video" Url="uri">',
      '    <QualityLevel Bitrate="2962000" CodecPrivateData="',
      h264CodecPrivateData,
      '" MaxHeight="720" MaxWidth="1280"/>',
      '    <c d="20020000"/>',
      '  </StreamIndex>',
      '  <StreamIndex Name="audio" Type="audio" Url="uri">',
      '    <QualityLevel Bitrate="128000" Channels="2" CodecPrivateData="',
      aacCodecPrivateData,
      '" FourCC="AACL"/>',
      '    <c d="20201360"/>',
      '  </StreamIndex>',
      '</SmoothStreamingMedia>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    expect(variant.audio).toBeTruthy();
    expect(variant.video).toBe(null);
  });

  it('supports audio stream without FourCC', async () => {
    const manifestText = [
      '<SmoothStreamingMedia Duration="1209510000">',
      '  <StreamIndex Type="video" Url="uri">',
      '    <QualityLevel Bitrate="2962000" CodecPrivateData="',
      h264CodecPrivateData,
      '" FourCC="H264" MaxHeight="720" MaxWidth="1280"/>',
      '    <c d="20020000"/>',
      '  </StreamIndex>',
      '  <StreamIndex Name="audio" Type="audio" Url="uri">',
      '    <QualityLevel Bitrate="128000" Channels="2" CodecPrivateData="',
      aacCodecPrivateData,
      '"/>',
      '    <c d="20201360"/>',
      '  </StreamIndex>',
      '</SmoothStreamingMedia>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    expect(variant.audio).toBeTruthy();
    expect(variant.video).toBeTruthy();
  });

  it('supports AACL stream without CodecPrivateData', async () => {
    const manifestText = [
      '<SmoothStreamingMedia Duration="1209510000">',
      '  <StreamIndex Type="video" Url="uri">',
      '    <QualityLevel Bitrate="2962000" CodecPrivateData="',
      h264CodecPrivateData,
      '" FourCC="H264" MaxHeight="720" MaxWidth="1280"/>',
      '    <c d="20020000"/>',
      '  </StreamIndex>',
      '  <StreamIndex Name="audio" Type="audio" Url="uri">',
      '    <QualityLevel Bitrate="128000" Channels="2" FourCC="AACL"/>',
      '    <c d="20201360"/>',
      '  </StreamIndex>',
      '</SmoothStreamingMedia>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    expect(variant.audio).toBeTruthy();
    expect(variant.video).toBeTruthy();
  });

  it('supports AACH stream without CodecPrivateData', async () => {
    const manifestText = [
      '<SmoothStreamingMedia Duration="1209510000">',
      '  <StreamIndex Type="video" Url="uri">',
      '    <QualityLevel Bitrate="2962000" CodecPrivateData="',
      h264CodecPrivateData,
      '" FourCC="H264" MaxHeight="720" MaxWidth="1280"/>',
      '    <c d="20020000"/>',
      '  </StreamIndex>',
      '  <StreamIndex Name="audio" Type="audio" Url="uri">',
      '    <QualityLevel Bitrate="128000" Channels="2" FourCC="AACH"/>',
      '    <c d="20201360"/>',
      '  </StreamIndex>',
      '</SmoothStreamingMedia>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    expect(variant.audio).toBeTruthy();
    expect(variant.video).toBeTruthy();
  });
});
