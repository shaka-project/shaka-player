/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DashParser Patch', () => {
  const Util = shaka.test.Util;
  const ManifestParser = shaka.test.ManifestParser;

  const oldNow = Date.now;
  const mpdId = 'foo';
  const updateTime = 5;
  const ttl = 60;
  const originalUri = 'http://example.com/';
  const manifestRequest = shaka.net.NetworkingEngine.RequestType.MANIFEST;
  const manifestContext = {
    type: shaka.net.NetworkingEngine.AdvancedRequestType.MPD,
  };
  const patchContext = {
    type: shaka.net.NetworkingEngine.AdvancedRequestType.MPD_PATCH,
  };

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.dash.DashParser} */
  let parser;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;
  /** @type {!Date} */
  let publishTime;

  beforeEach(() => {
    publishTime = new Date(2024, 0, 1);
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = new shaka.dash.DashParser();
    parser.configure(shaka.util.PlayerConfiguration.createDefault().manifest);
    playerInterface = {
      networkingEngine: fakeNetEngine,
      filter: (manifest) => Promise.resolve(),
      makeTextStreamsForClosedCaptions: (manifest) => {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: fail,
      onError: fail,
      isLowLatencyMode: () => false,
      updateDuration: () => {},
      newDrmInfo: (stream) => {},
      onManifestUpdated: () => {},
      getBandwidthEstimate: () => 1e6,
      onMetadata: () => {},
      disableStream: (stream) => {},
      addFont: (name, url) => {},
    };
    Date.now = () => publishTime.getTime() + 10;

    const manifestText = [
      `<MPD id="${mpdId}" type="dynamic"`,
      '    availabilityStartTime="1970-01-01T00:00:00Z"',
      `    publishTime="${publishTime.toUTCString()}"`,
      '    suggestedPresentationDelay="PT5S"',
      `    minimumUpdatePeriod="PT${updateTime}S">`,
      `  <PatchLocation ttl="${ttl}">dummy://bar</PatchLocation>`,
      '  <Period id="1">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation id="3" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentTemplate media="s$Number$.mp4">',
      '          <SegmentTimeline>',
      '            <S d="1" t="0" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    fakeNetEngine.setResponseText('dummy://foo', manifestText);
  });

  afterEach(() => {
    // Dash parser stop is synchronous.
    parser.stop();
    Date.now = oldNow;
  });

  /**
   * Trigger a manifest update.
   * @suppress {accessControls}
   */
  async function updateManifest() {
    if (parser.updateTimer_) {
      parser.updateTimer_.tickNow();
    }
    await Util.shortDelay();  // Allow update to complete.
  }

  /**
   * Gets a spy on the function that sets the update period.
   * @return {!jasmine.Spy}
   * @suppress {accessControls}
   */
  function updateTickSpy() {
    return spyOn(parser.updateTimer_, 'tickAfter');
  }

  describe('MPD', () => {
    it('rolls back to regular update if id mismatches', async () => {
      const patchText = [
        '<Patch mpdId="bar"',
        `    originalPublishTime="${publishTime.toUTCString()}"`,
        '/>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://bar', patchText);

      /** @type {!jasmine.Spy} */
      const onError = jasmine.createSpy('onError');
      playerInterface.onError = Util.spyFunc(onError);

      await parser.start('dummy://foo', playerInterface);

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://foo', manifestRequest, manifestContext);
      fakeNetEngine.request.calls.reset();

      await updateManifest();
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://bar', manifestRequest, patchContext);
      expect(onError).toHaveBeenCalledWith(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_PATCH));

      fakeNetEngine.request.calls.reset();

      await updateManifest();
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://foo', manifestRequest, manifestContext);
    });

    it('rolls back to regular update if publishTime mismatches', async () => {
      const publishTime = new Date(1992, 5, 2);
      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}"`,
        '/>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://bar', patchText);

      /** @type {!jasmine.Spy} */
      const onError = jasmine.createSpy('onError');
      playerInterface.onError = Util.spyFunc(onError);

      await parser.start('dummy://foo', playerInterface);

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://foo', manifestRequest, manifestContext);
      fakeNetEngine.request.calls.reset();

      await updateManifest();
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://bar', manifestRequest, patchContext);
      expect(onError).toHaveBeenCalledWith(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_PATCH));

      fakeNetEngine.request.calls.reset();

      await updateManifest();
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://foo', manifestRequest, manifestContext);
    });

    it('transforms from dynamic to static', async () => {
      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        '  <replace sel="/MPD/@type">',
        '    static',
        '  </replace>',
        '  <add sel="/MPD/@mediaPresentationDuration">',
        '    PT28462.033599998S',
        '  </add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://bar', patchText);

      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.presentationTimeline.isLive()).toBe(true);
      expect(manifest.presentationTimeline.getDuration()).toBe(Infinity);

      /** @type {!jasmine.Spy} */
      const tickAfter = updateTickSpy();
      await updateManifest();
      expect(manifest.presentationTimeline.isLive()).toBe(false);
      expect(manifest.presentationTimeline.getDuration()).not.toBe(Infinity);
      // should stop updates after transition to static
      expect(tickAfter).not.toHaveBeenCalled();
    });
  });

  describe('PatchLocation', () => {
    beforeEach(() => {
      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}"`,
        '/>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://bar', patchText);
    });

    it('uses PatchLocation', async () => {
      await parser.start('dummy://foo', playerInterface);

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://foo', manifestRequest, manifestContext);
      fakeNetEngine.request.calls.reset();

      await updateManifest();
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://bar', manifestRequest, patchContext);
    });

    it('does not use PatchLocation if publishTime is not defined', async () => {
      const manifestText = [
        `<MPD id="${mpdId}" type="dynamic"`,
        '    availabilityStartTime="1970-01-01T00:00:00Z"',
        '    suggestedPresentationDelay="PT5S"',
        `    minimumUpdatePeriod="PT${updateTime}S">`,
        `  <PatchLocation ttl="${ttl}">dummy://bar</PatchLocation>`,
        '  <Period id="1">',
        '    <AdaptationSet id="1" mimeType="video/mp4">',
        '      <Representation id="3" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '        <SegmentTemplate media="s$Number$.mp4">',
        '          <SegmentTimeline>',
        '            <S d="1" t="0" />',
        '          </SegmentTimeline>',
        '        </SegmentTemplate>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://foo', manifestText);

      await parser.start('dummy://foo', playerInterface);

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://foo', manifestRequest, manifestContext);
      fakeNetEngine.request.calls.reset();

      await updateManifest();
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://foo', manifestRequest, manifestContext);
      fakeNetEngine.expectNoRequest('dummy://bar', manifestRequest, patchContext);
    });

    it('does not use PatchLocation if it expired', async () => {
      await parser.start('dummy://foo', playerInterface);

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://foo', manifestRequest, manifestContext);
      fakeNetEngine.request.calls.reset();

      // Make current time exceed Patch's TTL.
      Date.now = () => publishTime.getTime() + (ttl * 2) * 1000;
      await updateManifest();
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://foo', manifestRequest, manifestContext);
      fakeNetEngine.expectNoRequest('dummy://bar', manifestRequest, patchContext);
    });

    it('replaces PatchLocation with new URL', async () => {
      await parser.start('dummy://foo', playerInterface);

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://foo', manifestRequest, manifestContext);
      fakeNetEngine.request.calls.reset();

      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        '  <replace sel="/MPD/PatchLocation[1]">',
        `    <PatchLocation ttl="${ttl}">dummy://bar2</PatchLocation>`,
        '  </replace>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://bar', patchText);

      await updateManifest();
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://bar', manifestRequest, patchContext);
      fakeNetEngine.request.calls.reset();

      fakeNetEngine.setResponseText('dummy://bar2', patchText);
      // Another request should be made to new URI.
      await updateManifest();
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest('dummy://bar2', manifestRequest, patchContext);
    });
  });

  describe('Period', () => {
    it('adds new period as an MPD child', async () => {
      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.periodCount).toBe(1);
      const stream = manifest.variants[0].video;
      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        '  <add sel="/MPD">',
        '    <Period id="2" duration="PT10S">',
        '      <AdaptationSet id="2" mimeType="video/mp4">',
        '        <Representation id="3" bandwidth="500">',
        '          <SegmentTemplate media="s$Number$.mp4" duration="2" />',
        '        </Representation>',
        '      </AdaptationSet>',
        '    </Period>',
        '  </add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://bar', patchText);

      await stream.createSegmentIndex();

      expect(stream.matchedStreams.length).toBe(1);

      await updateManifest();
      expect(manifest.periodCount).toBe(2);
      await stream.createSegmentIndex();

      expect(stream.matchedStreams.length).toBe(2);
    });

    it('adds new period as a Period successor', async () => {
      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.periodCount).toBe(1);
      const stream = manifest.variants[0].video;
      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        '  <add sel="/MPD/Period[@id=\'1\']" pos="after">',
        '    <Period id="2" duration="PT10S">',
        '      <AdaptationSet id="2" mimeType="video/mp4">',
        '        <Representation id="3" bandwidth="500">',
        '          <SegmentTemplate media="s$Number$.mp4" duration="2" />',
        '        </Representation>',
        '      </AdaptationSet>',
        '    </Period>',
        '  </add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://bar', patchText);

      await stream.createSegmentIndex();

      expect(stream.matchedStreams.length).toBe(1);

      await updateManifest();
      expect(manifest.periodCount).toBe(2);
      await stream.createSegmentIndex();

      expect(stream.matchedStreams.length).toBe(2);
    });
  });

  describe('SegmentTimeline', () => {
    it('adds new S elements as SegmentTimeline children', async () => {
      const xPath = '/' + [
        'MPD',
        'Period[@id=\'1\']',
        'AdaptationSet[@id=\'1\']',
        'Representation[@id=\'3\']',
        'SegmentTemplate',
        'SegmentTimeline',
      ].join('/');
      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        `  <add sel="${xPath}">`,
        '    <S d="1" t="1" />',
        '  </add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://bar', patchText);

      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      expect(stream).toBeTruthy();
      await stream.createSegmentIndex();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
      ]);

      await updateManifest();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
        ManifestParser.makeReference('s2.mp4', 1, 2, originalUri),
      ]);
    });

    it('adds new S elements as S successor', async () => {
      const xPath = '/' + [
        'MPD',
        'Period[@id=\'1\']',
        'AdaptationSet[@id=\'1\']',
        'Representation[@id=\'3\']',
        'SegmentTemplate',
        'SegmentTimeline',
        'S',
      ].join('/');
      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        `  <add sel="${xPath}" pos="after">`,
        '    <S d="1" t="1" />',
        '  </add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://bar', patchText);

      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      expect(stream).toBeTruthy();
      await stream.createSegmentIndex();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
      ]);

      await updateManifest();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
        ManifestParser.makeReference('s2.mp4', 1, 2, originalUri),
      ]);
    });

    it('modify @r attribute of an S element', async () => {
      const xPath = '/' + [
        'MPD',
        'Period[@id=\'1\']',
        'AdaptationSet[@id=\'1\']',
        'Representation[@id=\'3\']',
        'SegmentTemplate',
        'SegmentTimeline',
        'S[1]/@r',
      ].join('/');
      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        `  <add sel="${xPath}">`,
        '    2',
        '  </add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://bar', patchText);

      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      expect(stream).toBeTruthy();
      await stream.createSegmentIndex();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
      ]);

      await updateManifest();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
        ManifestParser.makeReference('s2.mp4', 1, 2, originalUri),
        ManifestParser.makeReference('s3.mp4', 2, 3, originalUri),
      ]);
    });

    it('modify @r attribute of an S element with @t=', async () => {
      const xPath = '/' + [
        'MPD',
        'Period[@id=\'1\']',
        'AdaptationSet[@id=\'1\']',
        'Representation[@id=\'3\']',
        'SegmentTemplate',
        'SegmentTimeline',
        'S',
      ].join('/');
      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        `  <add sel="${xPath}" pos="after">`,
        '    <S d="3" t="1" />',
        '  </add>',
        '</Patch>',
      ].join('\n');

      const xPath2 = '/' + [
        'MPD',
        'Period[@id=\'1\']',
        'AdaptationSet[@id=\'1\']',
        'Representation[@id=\'3\']',
        'SegmentTemplate',
        'SegmentTimeline',
        'S',
      ].join('/');
      const patchText2 = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        `  <add sel="${xPath2}" pos="after">`,
        '    <S d="3" t="4" />',
        '  </add>',
        '</Patch>',
      ].join('\n');

      const xPath3 = '/' + [
        'MPD',
        'Period[@id=&#39;1&#39;]',
        'AdaptationSet[@id=&#39;1&#39;]',
        'Representation[@id=&#39;3&#39;]',
        'SegmentTemplate',
        'SegmentTimeline',
        'S[@t=&#39;4&#39;]/@r',
      ].join('/');
      const patchText3 = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        `  <replace sel="${xPath3}">`,
        '    1',
        '  </replace>',
        '</Patch>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://bar', patchText);

      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      expect(stream).toBeTruthy();
      await stream.createSegmentIndex();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
      ]);

      await updateManifest();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
        ManifestParser.makeReference('s2.mp4', 1, 4, originalUri),
      ]);

      fakeNetEngine.setResponseText('dummy://bar', patchText2);
      await updateManifest();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
        ManifestParser.makeReference('s2.mp4', 1, 4, originalUri),
        ManifestParser.makeReference('s3.mp4', 4, 7, originalUri),
      ]);

      fakeNetEngine.setResponseText('dummy://bar', patchText3);
      await updateManifest();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
        ManifestParser.makeReference('s2.mp4', 1, 4, originalUri),
        ManifestParser.makeReference('s3.mp4', 4, 7, originalUri),
        ManifestParser.makeReference('s4.mp4', 7, 10, originalUri),
      ]);
    });
    it('modify @r attribute of an S element with @n=', async () => {
      const xPath = '/' + [
        'MPD',
        'Period[@id=\'1\']',
        'AdaptationSet[@id=\'1\']',
        'Representation[@id=\'3\']',
        'SegmentTemplate',
        'SegmentTimeline',
        'S',
      ].join('/');
      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        `  <add sel="${xPath}" pos="after">`,
        '    <S d="3" t="1" />',
        '  </add>',
        '</Patch>',
      ].join('\n');

      const xPath2 = '/' + [
        'MPD',
        'Period[@id=\'1\']',
        'AdaptationSet[@id=\'1\']',
        'Representation[@id=\'3\']',
        'SegmentTemplate',
        'SegmentTimeline',
        'S',
      ].join('/');
      const patchText2 = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        `  <add sel="${xPath2}" pos="after">`,
        '    <S d="3" t="4" n="3" />',
        '  </add>',
        '</Patch>',
      ].join('\n');

      const xPath3 = '/' + [
        'MPD',
        'Period[@id=&#39;1&#39;]',
        'AdaptationSet[@id=&#39;1&#39;]',
        'Representation[@id=&#39;3&#39;]',
        'SegmentTemplate',
        'SegmentTimeline',
        'S[@n=&#39;3&#39;]/@r',
      ].join('/');
      const patchText3 = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        `  <replace sel="${xPath3}">`,
        '    1',
        '  </replace>',
        '</Patch>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://bar', patchText);

      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      expect(stream).toBeTruthy();
      await stream.createSegmentIndex();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
      ]);

      await updateManifest();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
        ManifestParser.makeReference('s2.mp4', 1, 4, originalUri),
      ]);

      fakeNetEngine.setResponseText('dummy://bar', patchText2);
      await updateManifest();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
        ManifestParser.makeReference('s2.mp4', 1, 4, originalUri),
        ManifestParser.makeReference('s3.mp4', 4, 7, originalUri),
      ]);

      fakeNetEngine.setResponseText('dummy://bar', patchText3);
      await updateManifest();
      ManifestParser.verifySegmentIndex(stream, [
        ManifestParser.makeReference('s1.mp4', 0, 1, originalUri),
        ManifestParser.makeReference('s2.mp4', 1, 4, originalUri),
        ManifestParser.makeReference('s3.mp4', 4, 7, originalUri),
        ManifestParser.makeReference('s4.mp4', 7, 10, originalUri),
      ]);
    });

    it('extends shared timeline between representations', async () => {
      const manifestText = [
        `<MPD id="${mpdId}" type="dynamic"`,
        '    availabilityStartTime="1970-01-01T00:00:00Z"',
        `    publishTime="${publishTime.toUTCString()}"`,
        '    suggestedPresentationDelay="PT5S"',
        `    minimumUpdatePeriod="PT${updateTime}S">`,
        `  <PatchLocation ttl="${ttl}">dummy://bar</PatchLocation>`,
        '  <Period id="1">',
        '    <AdaptationSet id="1" mimeType="video/mp4">',
        '      <SegmentTemplate media="s$Number$.mp4">',
        '        <SegmentTimeline>',
        '          <S d="1" t="0" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="3" bandwidth="500">',
        '        <BaseURL>http://example.com/v3/</BaseURL>',
        '      </Representation>',
        '      <Representation id="4" bandwidth="1000">',
        '        <BaseURL>http://example.com/v4/</BaseURL>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const xPath = '/' + [
        'MPD',
        'Period[@id=\'1\']',
        'AdaptationSet[@id=\'1\']',
        'SegmentTemplate',
        'SegmentTimeline',
        'S',
      ].join('/');
      const patchText = [
        `<Patch mpdId="${mpdId}"`,
        `    originalPublishTime="${publishTime.toUTCString()}">`,
        `  <add sel="${xPath}" pos="after">`,
        '    <S d="1" t="1" />',
        '  </add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://foo', manifestText);
      fakeNetEngine.setResponseText('dummy://bar', patchText);

      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.variants.length).toBe(2);
      for (const variant of manifest.variants) {
        const stream = variant.video;
        expect(stream).toBeTruthy();
        // eslint-disable-next-line no-await-in-loop
        await stream.createSegmentIndex();
        ManifestParser.verifySegmentIndex(stream, [
          ManifestParser.makeReference('s1.mp4', 0, 1,
              `${originalUri}v${stream.originalId}/`),
        ]);
      }

      await updateManifest();
      for (const variant of manifest.variants) {
        const stream = variant.video;
        ManifestParser.verifySegmentIndex(stream, [
          ManifestParser.makeReference('s1.mp4', 0, 1,
              `${originalUri}v${stream.originalId}/`),
          ManifestParser.makeReference('s2.mp4', 1, 2,
              `${originalUri}v${stream.originalId}/`),
        ]);
      }
    });
  });
});
