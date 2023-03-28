/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DashParser Live', () => {
  const Util = shaka.test.Util;
  const ManifestParser = shaka.test.ManifestParser;

  const oldNow = Date.now;
  const updateTime = 5;
  const originalUri = 'http://example.com/';


  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.dash.DashParser} */
  let parser;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;

  beforeEach(() => {
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
      isAutoLowLatencyMode: () => false,
      enableLowLatencyMode: () => {},
      updateDuration: () => {},
      newDrmInfo: (stream) => {},
    };
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

  /**
   * Makes a simple live manifest with the given representation contents.
   *
   * @param {!Array.<string>} lines
   * @param {number?} updateTime
   * @param {number=} duration
   * @return {string}
   */
  function makeSimpleLiveManifestText(lines, updateTime, duration) {
    const updateAttr = updateTime != null ?
        'minimumUpdatePeriod="PT' + updateTime + 'S"' : '';
    const durationAttr = duration != undefined ?
        'duration="PT' + duration + 'S"' : '';
    const template = [
      '<MPD type="dynamic" %(updateAttr)s',
      '    availabilityStartTime="1970-01-01T00:00:00Z">',
      '  <Period id="1" %(durationAttr)s>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="3" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '%(contents)s',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    const text = sprintf(template, {
      updateAttr: updateAttr,
      durationAttr: durationAttr,
      contents: lines.join('\n'),
      updateTime: updateTime,
    });
    return text;
  }

  /**
   * Make clones of a list of references so that they can be modified without
   * affecting the originals.
   *
   * @param {!Array.<!shaka.media.SegmentReference>} references
   * @return {!Array.<!shaka.media.SegmentReference>}
   */
  function cloneRefs(references) {
    return references.map((ref) => {
      return new shaka.media.SegmentReference(
          ref.startTime,
          ref.endTime,
          ref.getUrisInner,
          ref.startByte,
          ref.endByte,
          ref.initSegmentReference,
          ref.timestampOffset,
          ref.appendWindowStart,
          ref.appendWindowEnd);
    });
  }

  /**
   * Creates tests that test the behavior common between SegmentList and
   * SegmentTemplate.
   *
   * @param {!Array.<string>} basicLines
   * @param {!Array.<!shaka.media.SegmentReference>} basicRefs
   * @param {!Array.<string>} updateLines
   * @param {!Array.<!shaka.media.SegmentReference>} updateRefs
   * @param {!Array.<string>} partialUpdateLines
   */
  function testCommonBehaviors(
      basicLines, basicRefs, updateLines, updateRefs, partialUpdateLines) {
    /**
     * Tests that an update will show the given references.
     *
     * @param {!Array.<string>} firstLines The Representation contents for the
     *   first manifest.
     * @param {!Array.<!shaka.media.SegmentReference>} firstReferences The media
     *   references for the first parse.
     * @param {!Array.<string>} secondLines The Representation contents for the
     *   updated manifest.
     * @param {!Array.<!shaka.media.SegmentReference>} secondReferences The
     *   media references for the updated manifest.
     */
    async function testBasicUpdate(
        firstLines, firstReferences, secondLines, secondReferences) {
      const firstManifest = makeSimpleLiveManifestText(firstLines, updateTime);
      const secondManifest =
          makeSimpleLiveManifestText(secondLines, updateTime);

      fakeNetEngine.setResponseText('dummy://foo', firstManifest);
      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      await stream.createSegmentIndex();
      ManifestParser.verifySegmentIndex(stream, firstReferences);

      fakeNetEngine.setResponseText('dummy://foo', secondManifest);
      await updateManifest();
      ManifestParser.verifySegmentIndex(stream, secondReferences);
    }

    it('basic support', async () => {
      await testBasicUpdate(basicLines, basicRefs, updateLines, updateRefs);
    });

    it('new manifests don\'t need to include old references', async () => {
      await testBasicUpdate(
          basicLines, basicRefs, partialUpdateLines, updateRefs);
    });

    it('evicts old references for single-period live stream', async () => {
      const template = [
        '<MPD type="dynamic" minimumUpdatePeriod="PT%(updateTime)dS"',
        '    timeShiftBufferDepth="PT30S"',
        '    suggestedPresentationDelay="PT5S"',
        '    availabilityStartTime="1970-01-01T00:00:00Z">',
        '  <Period id="1">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="3" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '%(contents)s',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const text = sprintf(
          template, {updateTime: updateTime, contents: basicLines.join('\n')});

      fakeNetEngine.setResponseText('dummy://foo', text);
      const baseTime = new Date(2015, 11, 30);
      Date.now = () => baseTime.getTime();
      const manifest = await parser.start('dummy://foo', playerInterface);

      expect(manifest).toBeTruthy();
      const stream = manifest.variants[0].video;
      expect(stream).toBeTruthy();

      await stream.createSegmentIndex();
      expect(stream.segmentIndex).toBeTruthy();
      const firstPosition = stream.segmentIndex.find(0);
      ManifestParser.verifySegmentIndex(stream, basicRefs);

      // The 30 second availability window is initially full in all cases
      // (SegmentTemplate+Timeline, etc.)  The first segment is always 10
      // seconds long in all of these cases.  So 11 seconds after the
      // manifest was parsed, the first segment should have fallen out of
      // the availability window.
      Date.now = () => baseTime.getTime() + (11 * 1000);
      await updateManifest();
      // The first reference should have been evicted.
      expect(stream.segmentIndex.find(0)).toBe(firstPosition + 1);
      ManifestParser.verifySegmentIndex(stream, basicRefs.slice(1));
    });

    it('evicts old references for multi-period live stream', async () => {
      const template = [
        '<MPD type="dynamic" minimumUpdatePeriod="PT%(updateTime)dS"',
        '    timeShiftBufferDepth="PT60S"',
        '    suggestedPresentationDelay="PT5S"',
        '    availabilityStartTime="1970-01-01T00:00:00Z">',
        '  <Period id="1">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="3" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '%(contents)s',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '  <Period id="2" start="PT%(pStart)dS">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="4" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '%(contents)s',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      // Set the period start to the sum of the durations of the references
      // in the previous period.
      const durs = basicRefs.map((r) => {
        return r.endTime - r.startTime;
      });
      const pStart = durs.reduce((p, d) => p + d, 0);
      const args = {
        updateTime: updateTime,
        pStart: pStart,
        contents: basicLines.join('\n'),
      };
      const text = sprintf(template, args);

      fakeNetEngine.setResponseText('dummy://foo', text);
      Date.now = () => 0;
      const manifest = await parser.start('dummy://foo', playerInterface);

      /** @const {!Array.<!shaka.media.SegmentReference>} */
      const period1Refs = cloneRefs(basicRefs);
      /** @const {!Array.<!shaka.media.SegmentReference>} */
      const period2Refs = cloneRefs(basicRefs);
      for (const ref of period2Refs) {
        ref.timestampOffset = pStart;
        ref.startTime += pStart;
        ref.endTime += pStart;
        ref.trueEndTime += pStart;
      }
      /** @const {!Array.<!shaka.media.SegmentReference>} */
      const allRefs = period1Refs.concat(period2Refs);

      const stream1 = manifest.variants[0].video;
      await stream1.createSegmentIndex();
      ManifestParser.verifySegmentIndex(stream1, allRefs);

      // The 60 second availability window is initially full in all cases
      // (SegmentTemplate+Timeline, etc.)  The first segment is always 10
      // seconds long in all of these cases.  So 11 seconds after the
      // manifest was parsed, the first segment should have fallen out of
      // the availability window.
      Date.now = () => 11 * 1000;
      await updateManifest();
      // The first reference should have been evicted.
      ManifestParser.verifySegmentIndex(stream1, allRefs.slice(1));

      // Same as above, but 1 period length later
      Date.now = () => (11 + pStart) * 1000;
      await updateManifest();
      ManifestParser.verifySegmentIndex(stream1, period2Refs.slice(1));
    });

    it('sets infinite duration for single-period live streams', async () => {
      const template = [
        '<MPD type="dynamic" minimumUpdatePeriod="PT%(updateTime)dS"',
        '    timeShiftBufferDepth="PT1S"',
        '    suggestedPresentationDelay="PT5S"',
        '    availabilityStartTime="1970-01-01T00:00:00Z">',
        '  <Period id="1">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="3" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '%(contents)s',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const text = sprintf(
          template, {updateTime: updateTime, contents: basicLines.join('\n')});

      fakeNetEngine.setResponseText('dummy://foo', text);
      Date.now = () => 0;
      const manifest = await parser.start('dummy://foo', playerInterface);

      const timeline = manifest.presentationTimeline;
      expect(timeline.getDuration()).toBe(Infinity);
    });

    it('sets infinite duration for multi-period live streams', async () => {
      const template = [
        '<MPD type="dynamic" minimumUpdatePeriod="PT%(updateTime)dS"',
        '    timeShiftBufferDepth="PT1S"',
        '    suggestedPresentationDelay="PT5S"',
        '    availabilityStartTime="1970-01-01T00:00:00Z">',
        '  <Period id="1">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="3" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '%(contents)s',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '  <Period id="2" start="PT60S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="4" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '%(contents)s',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const text = sprintf(
          template, {updateTime: updateTime, contents: basicLines.join('\n')});

      fakeNetEngine.setResponseText('dummy://foo', text);
      Date.now = () => 0;
      const manifest = await parser.start('dummy://foo', playerInterface);

      const timeline = manifest.presentationTimeline;
      expect(timeline.getDuration()).toBe(Infinity);
    });
  }

  it('can add Periods with SegmentTemplate', async () => {
    const template1 = [
      '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"',
      '    suggestedPresentationDelay="PT5S"',
      '    minimumUpdatePeriod="PT%(updateTime)dS">',
      '  <Period id="1">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="1" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentTemplate media="s$Number$.mp4">',
      '          <SegmentTimeline>',
      '            <S t="0" d="2" r="1" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    const template2 = [
      '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"',
      '    suggestedPresentationDelay="PT5S"',
      '    minimumUpdatePeriod="PT%(updateTime)dS">',
      '  <Period id="1" duration="PT10S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="1" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentTemplate media="s$Number$.mp4">',
      '          <SegmentTimeline>',
      '            <S t="0" d="2" r="4" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period id="2">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="2" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentTemplate media="s$Number$.mp4">',
      '          <SegmentTimeline>',
      '            <S t="0" d="2" r="1" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    const firstManifest = sprintf(template1, {updateTime: updateTime});
    const secondManifest = sprintf(template2, {updateTime: updateTime});

    fakeNetEngine.setResponseText('dummy://foo', firstManifest);
    // First two segments should exist
    Date.now = () => 5;

    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    const stream = variant.video;
    await stream.createSegmentIndex();

    // First two segments exist, but not the third.
    expect(stream.segmentIndex.find(3)).not.toBe(null);
    expect(stream.segmentIndex.find(5)).toBe(null);

    fakeNetEngine.setResponseText('dummy://foo', secondManifest);
    // First period (10s) is complete, plus first two segments of next period
    Date.now = () => 15;

    await updateManifest();

    // The update should have affected the same variant object we captured
    // before.  Now the entire first period should exist (0-10s), plus the next
    // two segments (10-14s).
    expect(stream.segmentIndex.find(9)).not.toBe(null);
    expect(stream.segmentIndex.find(13)).not.toBe(null);

    stream.closeSegmentIndex();
    await stream.createSegmentIndex();

    expect(stream.segmentIndex.find(9)).not.toBe(null);
    expect(stream.segmentIndex.find(13)).not.toBe(null);
  });

  it('can add Periods with SegmentList', async () => {
    const list1 = [
      '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"',
      '    suggestedPresentationDelay="PT5S"',
      '    minimumUpdatePeriod="PT%(updateTime)dS">',
      '  <Period id="1">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="1" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentList>',
      '          <SegmentURL media="s1.mp4" />',
      '          <SegmentURL media="s2.mp4" />',
      '          <SegmentURL media="s3.mp4" />',
      '          <SegmentTimeline>',
      '            <S d="10" t="0" r="2"/>',
      '          </SegmentTimeline>',
      '        </SegmentList>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    const list2 = [
      '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"',
      '    suggestedPresentationDelay="PT5S"',
      '    minimumUpdatePeriod="PT%(updateTime)dS">',
      '  <Period id="1" duration="PT40S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="1" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentList>',
      '          <SegmentURL media="s1.mp4" />',
      '          <SegmentURL media="s2.mp4" />',
      '          <SegmentURL media="s3.mp4" />',
      '          <SegmentURL media="s4.mp4" />',
      '          <SegmentTimeline>',
      '            <S d="10" t="0" r="3"/>',
      '          </SegmentTimeline>',
      '        </SegmentList>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period id="2">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="2" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentList>',
      '          <SegmentURL media="s1.mp4" />',
      '          <SegmentURL media="s2.mp4" />',
      '          <SegmentTimeline>',
      '            <S d="10" t="0" r="1"/>',
      '          </SegmentTimeline>',
      '        </SegmentList>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    const firstManifest = sprintf(list1, {updateTime: updateTime});
    const secondManifest = sprintf(list2, {updateTime: updateTime});

    fakeNetEngine.setResponseText('dummy://foo', firstManifest);
    // First three segments should exist.
    Date.now = () => 5;

    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    const stream = variant.video;
    await stream.createSegmentIndex();

    // First three segments exist, but not the fourth.
    expect(stream.segmentIndex.find(25)).not.toBe(null);
    expect(stream.segmentIndex.find(45)).toBe(null);

    fakeNetEngine.setResponseText('dummy://foo', secondManifest);
    Date.now = () => 25;

    await updateManifest();

    // The update should have affected the same variant object we captured
    // before.  Now the entire first period should exist (0-40s), plus the next
    // two segments of the second period(40-60s).
    expect(stream.segmentIndex.find(25)).not.toBe(null);
    expect(stream.segmentIndex.find(45)).not.toBe(null);

    stream.closeSegmentIndex();
    await stream.createSegmentIndex();

    expect(stream.segmentIndex.find(25)).not.toBe(null);
    expect(stream.segmentIndex.find(45)).not.toBe(null);
  });

  it('uses redirect URL for manifest BaseURL and updates', async () => {
    const template = [
      '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"',
      '    suggestedPresentationDelay="PT5S"',
      '    minimumUpdatePeriod="PT%(updateTime)dS">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="3" bandwidth="500">',
      '        <SegmentTemplate startNumber="1" media="s$Number$.mp4">',
      '          <SegmentTimeline>',
      '            <S d="10" t="0" />',
      '            <S d="5" />',
      '            <S d="15" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    const manifestText = sprintf(template, {updateTime: updateTime});
    const manifestData = shaka.util.StringUtils.toUTF8(manifestText);
    const redirectedUri = 'http://redirected.com/';

    // The initial manifest request will be redirected.
    fakeNetEngine.request.and.returnValue(
        shaka.util.AbortableOperation.completed({
          uri: redirectedUri,
          data: manifestData,
        }));

    const manifest = await parser.start(originalUri, playerInterface);

    // The manifest request was made to the original URL.
    // But includes a redirect
    expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
    const netRequest = fakeNetEngine.request.calls.argsFor(0)[1];
    expect(netRequest.uris).toEqual([redirectedUri, originalUri]);

    // Since the manifest request was redirected, the segment refers to
    // the redirected base.
    const stream = manifest.variants[0].video;
    await stream.createSegmentIndex();
    goog.asserts.assert(stream.segmentIndex != null, 'Null segmentIndex!');

    const ref = Array.from(stream.segmentIndex)[0];
    const segmentUri = ref.getUris()[0];
    expect(segmentUri).toBe(redirectedUri + 's1.mp4');
  });

  it('calls the error callback if an update fails', async () => {
    const lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];
    const manifestText = makeSimpleLiveManifestText(lines, updateTime);
    /** @type {!jasmine.Spy} */
    const onError = jasmine.createSpy('onError');
    playerInterface.onError = Util.spyFunc(onError);

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    await parser.start('dummy://foo', playerInterface);

    expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);

    const error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.BAD_HTTP_STATUS);
    const operation = shaka.util.AbortableOperation.failed(error);
    fakeNetEngine.request.and.returnValue(operation);

    await updateManifest();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('uses @minimumUpdatePeriod', async () => {
    const lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];
    // updateTime parameter sets @minimumUpdatePeriod in the manifest.
    const manifestText = makeSimpleLiveManifestText(lines, updateTime);

    /** @type {!jasmine.Spy} */
    const tickAfter = updateTickSpy();
    Date.now = () => 0;

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    await parser.start('dummy://foo', playerInterface);

    expect(tickAfter).toHaveBeenCalledTimes(1);
    const delay = tickAfter.calls.mostRecent().args[0];
    expect(delay).toBe(updateTime);
  });

  it('still updates when @minimumUpdatePeriod is zero', async () => {
    const lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];
    // updateTime parameter sets @minimumUpdatePeriod in the manifest.
    const manifestText = makeSimpleLiveManifestText(lines, /* updateTime= */ 0);

    /** @type {!jasmine.Spy} */
    const tickAfter = updateTickSpy();
    Date.now = () => 0;

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    await parser.start('dummy://foo', playerInterface);

    const waitTime = shaka.dash.DashParser['MIN_UPDATE_PERIOD_'];
    expect(tickAfter).toHaveBeenCalledTimes(1);
    const delay = tickAfter.calls.mostRecent().args[0];
    expect(delay).toBe(waitTime);
  });

  it('does not update when @minimumUpdatePeriod is missing', async () => {
    const lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];
    // updateTime parameter sets @minimumUpdatePeriod in the manifest.
    const manifestText =
        makeSimpleLiveManifestText(lines, /* updateTime= */ null);

    /** @type {!jasmine.Spy} */
    const tickAfter = updateTickSpy();

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    await parser.start('dummy://foo', playerInterface);

    expect(tickAfter).not.toHaveBeenCalled();
  });

  it('delays subsequent updates when an update is slow', async () => {
    const lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];
    const extraWaitTime = 15.0;
    const idealUpdateTime = shaka.dash.DashParser['MIN_UPDATE_PERIOD_'];
    const manifestText = makeSimpleLiveManifestText(lines, idealUpdateTime);

    let now = 0;
    Date.now = () => now;
    /** @type {!jasmine.Spy} */
    const tickAfter = updateTickSpy();

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    /** @type {!shaka.util.PublicPromise} */
    const delay = fakeNetEngine.delayNextRequest();
    const p = parser.start('dummy://foo', playerInterface);
    now += extraWaitTime * 1000;  // Make the update appear to take longer.
    delay.resolve();
    await p;

    // Check the last update was scheduled close to how long the update took.
    const realDelay = tickAfter.calls.mostRecent().args[0];
    expect(realDelay).toBeCloseTo(extraWaitTime, 0);
  });

  it('uses Mpd.Location', async () => {
    const manifestText = [
      '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"',
      '    suggestedPresentationDelay="PT5S"',
      '    minimumUpdatePeriod="PT' + updateTime + 'S">',
      '  <Location>http://foobar</Location>',
      '  <Location>http://foobar2</Location>',
      '  <Location>foobar3</Location>',
      '  <Period id="1" duration="PT10S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="3" bandwidth="500">',
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    const manifestRequest = shaka.net.NetworkingEngine.RequestType.MANIFEST;
    const manifestContext = {
      type: shaka.net.NetworkingEngine.AdvancedRequestType.MPD,
    };
    await parser.start('dummy://foo', playerInterface);

    expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
    fakeNetEngine.expectRequest('dummy://foo', manifestRequest, manifestContext);
    fakeNetEngine.request.calls.reset();

    // Create a mock so we can verify it gives two URIs.
    // The third location is a relative url, and should be resolved as an
    // absolute url.
    fakeNetEngine.request.and.callFake((type, request, context) => {
      expect(type).toBe(manifestRequest);
      expect(context).toEqual(manifestContext);
      expect(request.uris).toEqual(
          ['http://foobar', 'http://foobar2', 'dummy://foo/foobar3']);
      const data = shaka.util.StringUtils.toUTF8(manifestText);
      return shaka.util.AbortableOperation.completed(
          {uri: request.uris[0], data: data, headers: {}});
    });

    await updateManifest();
    expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
  });

  it('uses @suggestedPresentationDelay', async () => {
    const manifestText = [
      '<MPD type="dynamic" suggestedPresentationDelay="PT60S"',
      '    minimumUpdatePeriod="PT5S"',
      '    timeShiftBufferDepth="PT2M"',
      '    maxSegmentDuration="PT10S"',
      '    availabilityStartTime="1970-01-01T00:05:00Z">',
      '  <Period id="1">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="3" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    Date.now = () => 600000; /* 10 minutes */
    const manifest = await parser.start('dummy://foo', playerInterface);

    expect(manifest).toBeTruthy();
    const timeline = manifest.presentationTimeline;
    expect(timeline).toBeTruthy();

    //  We are 5 minutes into the presentation, with a
    //  @timeShiftBufferDepth of 120 seconds and a @maxSegmentDuration of
    //  10 seconds, the start will be 2:50.
    expect(timeline.getSegmentAvailabilityStart()).toBe(170);
    // Normally the end should be 4:50; but with a 60 second
    // @suggestedPresentationDelay it will be 3:50 minutes.
    expect(timeline.getSegmentAvailabilityEnd()).toBe(290);
    expect(timeline.getSeekRangeEnd()).toBe(230);
  });

  it('parses availabilityTimeOffset', async () => {
    const manifestText = [
      '<MPD type="dynamic" suggestedPresentationDelay="PT0S"',
      '    minimumUpdatePeriod="PT5S"',
      '    timeShiftBufferDepth="PT2M"',
      '    maxSegmentDuration="PT10S"',
      '    availabilityStartTime="1970-01-01T00:05:00Z">',
      '  <Period id="1">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="3" bandwidth="500">',
      '         <BaseURL availabilityTimeOffset="6">http://example.com',
      '         </BaseURL>',
      '         <SegmentTemplate availabilityTimeOffset="6.00" ',
      '          startNumber="1" media="s$Number$.mp4" duration="2" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    playerInterface.isLowLatencyMode = () => true;

    Date.now = () => 600000; /* 10 minutes */
    const manifest = await parser.start('dummy://foo', playerInterface);

    expect(manifest).toBeTruthy();
    const timeline = manifest.presentationTimeline;
    expect(timeline).toBeTruthy();

    //  We are 5 minutes into the presentation, with a @timeShiftBufferDepth of
    //  120 seconds and a @maxSegmentDuration of 10 seconds, the start will be
    //  2:50. With the availabilityTimeOffset of 6+6 seconds, it will be 3:02.
    expect(timeline.getSegmentAvailabilityStart()).toBe(182);
    // Normally the end should be 4:50; with the availabilityTimeOffset of
    // 12 seconds, it will be 5:02.
    expect(timeline.getSegmentAvailabilityEnd()).toBe(302);
    expect(timeline.getSeekRangeEnd()).toBe(302);
  });

  describe('availabilityWindowOverride', () => {
    it('overrides @timeShiftBufferDepth', async () => {
      const manifestText = [
        '<MPD type="dynamic" suggestedPresentationDelay="PT60S"',
        '    minimumUpdatePeriod="PT5S"',
        '    timeShiftBufferDepth="PT2M"',
        '    maxSegmentDuration="PT10S"',
        '    availabilityStartTime="1970-01-01T00:05:00Z">',
        '  <Period id="1">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="3" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '        <SegmentTemplate media="s$Number$.mp4" duration="2" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://foo', manifestText);

      const config = shaka.util.PlayerConfiguration.createDefault().manifest;
      config.availabilityWindowOverride = 4 * 60;
      parser.configure(config);

      Date.now = () => 600000; /* 10 minutes */
      const manifest = await parser.start('dummy://foo', playerInterface);

      expect(manifest).toBeTruthy();
      const timeline = manifest.presentationTimeline;
      expect(timeline).toBeTruthy();

      // The parser was configured to have a manifest availability window
      // of 4 minutes.
      const end = timeline.getSegmentAvailabilityEnd();
      const start = timeline.getSegmentAvailabilityStart();
      expect(end - start).toBe(4 * 60);
    });
  });

  describe('maxSegmentDuration', () => {
    it('uses @maxSegmentDuration', async () => {
      const manifestText = [
        '<MPD type="dynamic" suggestedPresentationDelay="PT0S"',
        '    minimumUpdatePeriod="PT5S"',
        '    timeShiftBufferDepth="PT2M"',
        '    maxSegmentDuration="PT15S"',
        '    availabilityStartTime="1970-01-01T00:05:00Z">',
        '  <Period id="1">',
        '    <AdaptationSet id="2" mimeType="video/mp4">',
        '      <Representation id="3" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '<SegmentTemplate media="s$Number$.mp4" duration="2" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://foo', manifestText);

      Date.now = () => 600000; /* 10 minutes */
      const manifest = await parser.start('dummy://foo', playerInterface);

      expect(manifest).toBeTruthy();
      const timeline = manifest.presentationTimeline;
      expect(timeline).toBeTruthy();
      expect(timeline.getMaxSegmentDuration()).toBe(15);
    });

    it('derived from SegmentTemplate w/ SegmentTimeline', async () => {
      const lines = [
        '<SegmentTemplate media="s$Number$.mp4">',
        '  <SegmentTimeline>',
        '    <S t="0" d="7" />',
        '    <S d="8" />',
        '    <S d="6" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>',
      ];
      await testDerived(lines);
    });

    it('derived from SegmentTemplate w/ @duration', async () => {
      const lines = [
        '<SegmentTemplate media="s$Number$.mp4" duration="8" />',
      ];
      await testDerived(lines);
    });

    it('derived from SegmentList', async () => {
      const lines = [
        '<SegmentList duration="8">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '</SegmentList>',
      ];
      await testDerived(lines);
    });

    it('derived from SegmentList w/ SegmentTimeline', async () => {
      const lines = [
        '<SegmentList duration="8">',
        '  <SegmentTimeline>',
        '    <S t="0" d="5" />',
        '    <S d="4" />',
        '    <S d="8" />',
        '  </SegmentTimeline>',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '</SegmentList>',
      ];
      await testDerived(lines);
    });

    async function testDerived(lines) {
      const template = [
        '<MPD type="dynamic" suggestedPresentationDelay="PT0S"',
        '    minimumUpdatePeriod="PT5S"',
        '    timeShiftBufferDepth="PT2M"',
        '    availabilityStartTime="1970-01-01T00:05:00Z">',
        '  <Period id="1">',
        '    <AdaptationSet id="2" mimeType="video/mp4">',
        '      <Representation id="3" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '%(contents)s',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const manifestText = sprintf(template, {contents: lines.join('\n')});

      fakeNetEngine.setResponseText('dummy://foo', manifestText);
      Date.now = () => 600000; /* 10 minutes */
      const manifest = await parser.start('dummy://foo', playerInterface);

      expect(manifest).toBeTruthy();
      const timeline = manifest.presentationTimeline;
      expect(timeline).toBeTruthy();

      // NOTE: the largest segment is 8 seconds long in each test.
      expect(timeline.getMaxSegmentDuration()).toBe(8);
    }
  });  // describe('maxSegmentDuration')

  describe('stop', () => {
    const manifestRequestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
    const manifestContext = {
      type: shaka.net.NetworkingEngine.AdvancedRequestType.MPD,
    };
    const dateRequestType = shaka.net.NetworkingEngine.RequestType.TIMING;
    const manifestUri = 'dummy://foo';
    const dateUri = 'http://foo.bar/date';

    beforeEach(() => {
      const manifest = [
        '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"',
        '    minimumUpdatePeriod="PT' + updateTime + 'S">',
        '  <UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-xsdate:2014"',
        '      value="http://foo.bar/date" />',
        '  <UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-xsdate:2014"',
        '      value="http://foo.bar/date" />',
        '  <Period id="1">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="3" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '        <SegmentTemplate startNumber="1" media="s$Number$.mp4"',
        '            duration="2" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      fakeNetEngine
          .setResponseText('http://foo.bar/date', '1970-01-01T00:00:30Z')
          .setResponseText('dummy://foo', manifest);
    });

    it('stops updates', async () => {
      await parser.start(manifestUri, playerInterface);

      fakeNetEngine.expectRequest(
          manifestUri, manifestRequestType, manifestContext);
      fakeNetEngine.request.calls.reset();

      parser.stop();
      await updateManifest();
      expect(fakeNetEngine.request).not.toHaveBeenCalled();
    });

    it('stops initial parsing', async () => {
      const expectation =
          expectAsync(parser.start('dummy://foo', playerInterface))
              .toBeRejected();
      // start will only begin the network request, calling stop here will be
      // after the request has started but before any parsing has been done.
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      parser.stop();
      await expectation;

      fakeNetEngine.expectRequest(
          manifestUri, manifestRequestType, manifestContext);
      fakeNetEngine.request.calls.reset();
      await updateManifest();
      // An update should not occur.
      expect(fakeNetEngine.request).not.toHaveBeenCalled();
    });

    it('interrupts manifest updates', async () => {
      const manifest = await parser.start('dummy://foo', playerInterface);

      expect(manifest).toBeTruthy();
      fakeNetEngine.expectRequest(
          manifestUri, manifestRequestType, manifestContext);
      fakeNetEngine.request.calls.reset();
      /** @type {!shaka.util.PublicPromise} */
      const delay = fakeNetEngine.delayNextRequest();

      await updateManifest();
      // The request was made but should not be resolved yet.
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest(
          manifestUri, manifestRequestType, manifestContext);
      fakeNetEngine.request.calls.reset();
      parser.stop();
      delay.resolve();

      // Wait for another update period.
      await updateManifest();
      // A second update should not occur.
      expect(fakeNetEngine.request).not.toHaveBeenCalled();
    });

    it('interrupts UTCTiming requests', async () => {
      /** @type {!shaka.util.PublicPromise} */
      let delay = fakeNetEngine.delayNextRequest();
      const expectation =
          expectAsync(parser.start('dummy://foo', playerInterface))
              .toBeRejected();

      await Util.shortDelay();
      // This is the initial manifest request.
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest(
          manifestUri, manifestRequestType, manifestContext);
      fakeNetEngine.request.calls.reset();
      // Resolve the manifest request and wait on the UTCTiming request.
      delay.resolve();
      delay = fakeNetEngine.delayNextRequest();
      await Util.shortDelay();

      // This is the first UTCTiming request.
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      fakeNetEngine.expectRequest(dateUri, dateRequestType);
      fakeNetEngine.request.calls.reset();
      // Interrupt the parser, then fail the request.
      parser.stop();
      delay.reject();
      await expectation;

      // Wait for another update period.
      await updateManifest();

      // No more updates should occur.
      expect(fakeNetEngine.request).not.toHaveBeenCalled();
    });
  });

  describe('SegmentTemplate w/ SegmentTimeline', () => {
    const basicLines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4">',
      '  <SegmentTimeline>',
      '    <S d="10" t="0" />',
      '    <S d="5" />',
      '    <S d="15" />',
      '  </SegmentTimeline>',
      '</SegmentTemplate>',
    ];
    const basicRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 10, 15, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 15, 30, originalUri),
    ];
    const updateLines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4">',
      '  <SegmentTimeline>',
      '    <S d="10" t="0" />',
      '    <S d="5" />',
      '    <S d="15" />',
      '    <S d="10" />',
      '  </SegmentTimeline>',
      '</SegmentTemplate>',
    ];
    const updateRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 10, 15, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 15, 30, originalUri),
      shaka.test.ManifestParser.makeReference('s4.mp4', 30, 40, originalUri),
    ];
    const partialUpdateLines = [
      '<SegmentTemplate startNumber="3" media="s$Number$.mp4">',
      '  <SegmentTimeline>',
      '    <S d="15" t="15" />',
      '    <S d="10" />',
      '  </SegmentTimeline>',
      '</SegmentTemplate>',
    ];

    testCommonBehaviors(
        basicLines, basicRefs, updateLines, updateRefs, partialUpdateLines);
  });

  describe('SegmentList w/ SegmentTimeline', () => {
    const basicLines = [
      '<SegmentList>',
      '  <SegmentURL media="s1.mp4" />',
      '  <SegmentURL media="s2.mp4" />',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentTimeline>',
      '    <S d="10" t="0" />',
      '    <S d="5" />',
      '    <S d="15" />',
      '  </SegmentTimeline>',
      '</SegmentList>',
    ];
    const basicRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 10, 15, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 15, 30, originalUri),
    ];
    const updateLines = [
      '<SegmentList>',
      '  <SegmentURL media="s1.mp4" />',
      '  <SegmentURL media="s2.mp4" />',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentURL media="s4.mp4" />',
      '  <SegmentTimeline>',
      '    <S d="10" t="0" />',
      '    <S d="5" />',
      '    <S d="15" />',
      '    <S d="10" />',
      '  </SegmentTimeline>',
      '</SegmentList>',
    ];
    const updateRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 10, 15, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 15, 30, originalUri),
      shaka.test.ManifestParser.makeReference('s4.mp4', 30, 40, originalUri),
    ];
    const partialUpdateLines = [
      '<SegmentList startNumber="3">',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentURL media="s4.mp4" />',
      '  <SegmentTimeline>',
      '    <S d="15" t="15" />',
      '    <S d="10" />',
      '  </SegmentTimeline>',
      '</SegmentList>',
    ];

    testCommonBehaviors(
        basicLines, basicRefs, updateLines, updateRefs, partialUpdateLines);
  });

  describe('SegmentList w/ @duration', () => {
    const basicLines = [
      '<SegmentList duration="10">',
      '  <SegmentURL media="s1.mp4" />',
      '  <SegmentURL media="s2.mp4" />',
      '  <SegmentURL media="s3.mp4" />',
      '</SegmentList>',
    ];
    const basicRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 10, 20, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 20, 30, originalUri),
    ];
    const updateLines = [
      '<SegmentList duration="10">',
      '  <SegmentURL media="s1.mp4" />',
      '  <SegmentURL media="s2.mp4" />',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentURL media="s4.mp4" />',
      '</SegmentList>',
    ];
    const updateRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 10, 20, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 20, 30, originalUri),
      shaka.test.ManifestParser.makeReference('s4.mp4', 30, 40, originalUri),
    ];
    const partialUpdateLines = [
      '<SegmentList startNumber="3" duration="10">',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentURL media="s4.mp4" />',
      '</SegmentList>',
    ];

    testCommonBehaviors(
        basicLines, basicRefs, updateLines, updateRefs, partialUpdateLines);
  });

  describe('SegmentTemplate w/ duration', () => {
    const templateLines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];

    it('produces sane references without assertions', async () => {
      const manifestText =
          makeSimpleLiveManifestText(templateLines, updateTime);

      fakeNetEngine.setResponseText('dummy://foo', manifestText);
      const manifest = await parser.start('dummy://foo', playerInterface);

      const stream = manifest.variants[0].video;
      await stream.createSegmentIndex();

      const liveEdge =
          manifest.presentationTimeline.getSegmentAvailabilityEnd();

      // In https://github.com/shaka-project/shaka-player/issues/1204, a get on
      // the final segment failed an assertion and returned endTime == 0.
      // Find the last segment by looking just before the live edge.  Looking
      // right on the live edge creates test flake, and the segments are 2
      // seconds in duration.
      const idx = stream.segmentIndex.find(liveEdge - 0.5);
      goog.asserts.assert(idx != null, 'Live edge not found!');

      // This should not throw an assertion.
      const ref = stream.segmentIndex.get(idx);
      // The segment's endTime should definitely not be 0.
      expect(ref.endTime).toBeGreaterThan(0);
    });
  });

  describe('EventStream', () => {
    const originalManifest = [
      '<MPD type="dynamic" minimumUpdatePeriod="PT' + updateTime + 'S"',
      '    availabilityStartTime="1970-01-01T00:00:00Z">',
      '  <Period id="1" duration="PT60S" start="PT10S">',
      '    <EventStream schemeIdUri="http://example.com" value="foobar"',
      '        timescale="100">',
      '      <Event duration="5000" />',
      '      <Event id="abc" presentationTime="300" duration="1000" />',
      '    </EventStream>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <SegmentTemplate startNumber="1" media="s$Number$.mp4"',
      '                         duration="2" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    /** @type {!jasmine.Spy} */
    let onTimelineRegionAddedSpy;

    beforeEach(() => {
      onTimelineRegionAddedSpy = jasmine.createSpy('onTimelineRegionAdded');
      playerInterface.onTimelineRegionAdded =
          shaka.test.Util.spyFunc(onTimelineRegionAddedSpy);
    });

    it('will parse EventStream nodes', async () => {
      fakeNetEngine.setResponseText('dummy://foo', originalManifest);
      await parser.start('dummy://foo', playerInterface);

      expect(onTimelineRegionAddedSpy).toHaveBeenCalledTimes(2);

      expect(onTimelineRegionAddedSpy).toHaveBeenCalledWith({
        schemeIdUri: 'http://example.com',
        value: 'foobar',
        startTime: 10,
        endTime: 60,
        id: '',
        eventElement: jasmine.any(Element),
      });
      expect(onTimelineRegionAddedSpy).toHaveBeenCalledWith({
        schemeIdUri: 'http://example.com',
        value: 'foobar',
        startTime: 13,
        endTime: 23,
        id: 'abc',
        eventElement: jasmine.any(Element),
      });
    });

    it('will add timeline regions on manifest update', async () => {
      const newManifest = [
        '<MPD type="dynamic" minimumUpdatePeriod="PT' + updateTime + 'S"',
        '    availabilityStartTime="1970-01-01T00:00:00Z">',
        '  <Period id="1" duration="PT30S">',
        '    <EventStream schemeIdUri="http://example.com" timescale="100">',
        '      <Event id="100" />',
        '    </EventStream>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentTemplate startNumber="1" media="s$Number$.mp4"',
        '                         duration="2" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', originalManifest);
      await parser.start('dummy://foo', playerInterface);

      expect(onTimelineRegionAddedSpy).toHaveBeenCalledTimes(2);
      onTimelineRegionAddedSpy.calls.reset();

      fakeNetEngine.setResponseText('dummy://foo', newManifest);
      await updateManifest();

      expect(onTimelineRegionAddedSpy).toHaveBeenCalledTimes(1);
    });

    it('will not let an event exceed the Period duration', async () => {
      const newManifest = [
        '<MPD>',
        '  <Period id="1" duration="PT30S">',
        '    <EventStream schemeIdUri="http://example.com" timescale="1">',
        '      <Event presentationTime="10" duration="15"/>',
        '      <Event presentationTime="25" duration="50"/>',
        '      <Event presentationTime="50" duration="10"/>',
        '    </EventStream>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentTemplate startNumber="1" media="s$Number$.mp4"',
        '                         duration="2" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', newManifest);
      await parser.start('dummy://foo', playerInterface);

      expect(onTimelineRegionAddedSpy).toHaveBeenCalledTimes(3);
      expect(onTimelineRegionAddedSpy)
          .toHaveBeenCalledWith(
              jasmine.objectContaining({startTime: 10, endTime: 25}));
      expect(onTimelineRegionAddedSpy)
          .toHaveBeenCalledWith(
              jasmine.objectContaining({startTime: 25, endTime: 30}));
      expect(onTimelineRegionAddedSpy)
          .toHaveBeenCalledWith(
              jasmine.objectContaining({startTime: 30, endTime: 30}));
    });

    it('will parse multiple events at same offset', async () => {
      const newManifest = [
        '<MPD>',
        '  <Period id="1" duration="PT30S">',
        '    <EventStream schemeIdUri="http://example.com" timescale="1">',
        '      <Event id="1" presentationTime="10" duration="15"/>',
        '      <Event id="2" presentationTime="10" duration="15"/>',
        '    </EventStream>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentTemplate startNumber="1" media="s$Number$.mp4"',
        '                         duration="2" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', newManifest);
      await parser.start('dummy://foo', playerInterface);

      expect(onTimelineRegionAddedSpy).toHaveBeenCalledTimes(2);
      expect(onTimelineRegionAddedSpy)
          .toHaveBeenCalledWith(
              jasmine.objectContaining({id: '1', startTime: 10, endTime: 25}));
      expect(onTimelineRegionAddedSpy)
          .toHaveBeenCalledWith(
              jasmine.objectContaining({id: '2', startTime: 10, endTime: 25}));
    });

    it('will not add timeline regions outside the DVR window', async () => {
      const manifest = [
        '<MPD type="dynamic" minimumUpdatePeriod="PT' + updateTime + 'S"',
        '    availabilityStartTime="1970-01-01T00:00:00Z"',
        '    suggestedPresentationDelay="PT0S"',
        '    timeShiftBufferDepth="PT30S">',
        '  <Period id="1">',
        '    <EventStream schemeIdUri="http://example.com" timescale="1">',
        '      <Event id="0" presentationTime="0" duration="10"/>',
        '      <Event id="1" presentationTime="10" duration="10"/>',
        '      <Event id="2" presentationTime="20" duration="10"/>',
        '      <Event id="3" presentationTime="30" duration="10"/>',
        '      <Event id="4" presentationTime="40" duration="10"/>',
        '    </EventStream>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentTemplate startNumber="1" media="s$Number$.mp4"',
        '                         duration="2" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      // 45 seconds after the epoch, which is also 45 seconds after the
      // presentation started.  Only the last 30 seconds are available, from
      // time 15 to 45.
      Date.now = () => 45 * 1000;

      fakeNetEngine.setResponseText('dummy://foo', manifest);
      await parser.start('dummy://foo', playerInterface);

      expect(onTimelineRegionAddedSpy).toHaveBeenCalledTimes(4);
      expect(onTimelineRegionAddedSpy).toHaveBeenCalledWith(
          jasmine.objectContaining({id: '1'}));
      expect(onTimelineRegionAddedSpy).toHaveBeenCalledWith(
          jasmine.objectContaining({id: '2'}));
      expect(onTimelineRegionAddedSpy).toHaveBeenCalledWith(
          jasmine.objectContaining({id: '3'}));
      expect(onTimelineRegionAddedSpy).toHaveBeenCalledWith(
          jasmine.objectContaining({id: '4'}));
    });
  });

  it('honors clockSyncUri for in-progress recordings', async () => {
    const manifestText = [
      '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:05:00Z"',
      '      mediaPresentationDuration="PT3600S">',
      '  <Period id="1">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="3" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentTemplate media="s$Number$.mp4" duration="2" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    // Simulate a realistic clock sync URI.
    fakeNetEngine.setResponseText('dummy://time', '');
    fakeNetEngine.setHeaders('dummy://time', {
      'date': (new Date()).toUTCString(),
    });

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.dash.clockSyncUri = 'dummy://time';
    parser.configure(config);

    const manifest = await parser.start('dummy://foo', playerInterface);

    // Make sure we're testing what we think we're testing.
    // This should be seen as in-progress.
    expect(manifest.presentationTimeline.isInProgress()).toBe(true);

    // Now make sure we made the time sync request.
    const timingRequest = shaka.net.NetworkingEngine.RequestType.TIMING;
    fakeNetEngine.expectRequest('dummy://time', timingRequest);
  });

  it('adds segments to in-progress recordings', async () => {
    const manifestText = [
      '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"',
      '      mediaPresentationDuration="PT10S">',
      '  <Period id="1">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="3" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentTemplate media="s$Number$.mp4" duration="2" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    // The presentation started just over 4 seconds ago.  There should be 2
    // segments so far.
    Date.now = () => 4.1 * 1000;
    const manifest = await parser.start('dummy://foo', playerInterface);

    // Make sure we're testing what we think we're testing.
    // This should be seen as in-progress.
    expect(manifest.presentationTimeline.isInProgress()).toBe(true);

    const stream = manifest.variants[0].video;
    expect(stream).toBeTruthy();

    await stream.createSegmentIndex();
    expect(stream.segmentIndex).toBeTruthy();

    // Check for the 2 initial segments we're expecting.
    ManifestParser.verifySegmentIndex(stream, [
      shaka.test.ManifestParser.makeReference('s1.mp4', 0, 2, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 2, 4, originalUri),
    ]);

    // Just over 10 seconds after the presentation started, we should now have
    // all 5 segments.  In order to trick the system into updating, we must both
    // fake the current time and wait long enough for the timer to fire and
    // update the references.
    Date.now = () => 10.1 * 1000;
    await shaka.test.Util.delay(2.1);  // A little longer than the segments are.

    ManifestParser.verifySegmentIndex(stream, [
      shaka.test.ManifestParser.makeReference('s1.mp4', 0, 2, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 2, 4, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 4, 6, originalUri),
      shaka.test.ManifestParser.makeReference('s4.mp4', 6, 8, originalUri),
      shaka.test.ManifestParser.makeReference('s5.mp4', 8, 10, originalUri),
    ]);
  });
});
