/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('DashParser Live', function() {
  const Util = shaka.test.Util;
  const ManifestParser = shaka.test.ManifestParser;

  const realTimeout = window.setTimeout;
  const oldNow = Date.now;
  const updateTime = 5;
  const originalUri = 'http://example.com/';


  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.dash.DashParser} */
  let parser;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;

  beforeEach(function() {
    // First, fake the clock so we can control timers.
    // This does not mock Date.now, which must be done separately.
    jasmine.clock().install();
    // This Promise mock is required for fakeEventLoop.
    PromiseMock.install();

    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = new shaka.dash.DashParser();
    parser.configure(shaka.util.PlayerConfiguration.createDefault().manifest);
    playerInterface = {
      networkingEngine: fakeNetEngine,
      filterNewPeriod: function() {},
      filterAllPeriods: function() {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: fail,
      onError: fail,
    };
  });

  afterEach(function() {
    // Dash parser stop is synchronous.
    parser.stop();

    // Uninstall the clock() first.  This also undoes mockDate(), and should be
    // done afterEach, not afterAll.  Otherwise, we get conflicts when some
    // tests use mockDate() and others directly overwrite Date.now.
    jasmine.clock().uninstall();
    // Replace Date.now with the browser built-in.  This must come AFTER we
    // uninstall the clock() module, or else mockDate() doesn't get cleaned up
    // correctly.
    Date.now = oldNow;
    // Finally, uninstall the Promise mock.
    PromiseMock.uninstall();
    // TODO: Clean up this suite so that everyone uses mockDate().
  });

  /**
   * Simulate time to trigger a manifest update.
   */
  function delayForUpdatePeriod() {
    // Tick the virtual clock to trigger an update and resolve all Promises.
    Util.fakeEventLoop(updateTime);
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
    let updateAttr = updateTime != null ?
        'minimumUpdatePeriod="PT' + updateTime + 'S"' : '';
    let durationAttr = duration != undefined ?
        'duration="PT' + duration + 'S"' : '';
    let template = [
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
    let text = sprintf(template, {
      updateAttr: updateAttr,
      durationAttr: durationAttr,
      contents: lines.join('\n'),
      updateTime: updateTime,
    });
    return text;
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
     * @param {function()} done
     * @param {!Array.<string>} firstLines The Representation contents for the
     *   first manifest.
     * @param {!Array.<!shaka.media.SegmentReference>} firstReferences The media
     *   references for the first parse.
     * @param {!Array.<string>} secondLines The Representation contents for the
     *   updated manifest.
     * @param {!Array.<!shaka.media.SegmentReference>} secondReferences The
     *   media references for the updated manifest.
     */
    function testBasicUpdate(
        done, firstLines, firstReferences, secondLines, secondReferences) {
      let firstManifest = makeSimpleLiveManifestText(firstLines, updateTime);
      let secondManifest = makeSimpleLiveManifestText(secondLines, updateTime);

      fakeNetEngine.setResponseText('dummy://foo', firstManifest);
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            let stream = manifest.periods[0].variants[0].video;
            ManifestParser.verifySegmentIndex(stream, firstReferences);
            expect(manifest.periods.length).toBe(1);

            fakeNetEngine.setResponseText('dummy://foo', secondManifest);
            delayForUpdatePeriod();
            ManifestParser.verifySegmentIndex(stream, secondReferences);
            // In https://github.com/google/shaka-player/issues/963, we
            // duplicated periods during the first update.  This check covers
            // this case.
            expect(manifest.periods.length).toBe(1);
          }).catch(fail).then(done);
      PromiseMock.flush();
    }

    it('basic support', function(done) {
      testBasicUpdate(done, basicLines, basicRefs, updateLines, updateRefs);
    });

    it('new manifests don\'t need to include old references', function(done) {
      testBasicUpdate(
          done, basicLines, basicRefs, partialUpdateLines, updateRefs);
    });

    it('evicts old references for single-period live stream', function(done) {
      let template = [
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
      let text = sprintf(
          template, {updateTime: updateTime, contents: basicLines.join('\n')});

      fakeNetEngine.setResponseText('dummy://foo', text);
      Date.now = function() { return 0; };
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            let stream = manifest.periods[0].variants[0].video;
            expect(stream).toBeTruthy();

            expect(stream.findSegmentPosition).toBeTruthy();
            expect(stream.findSegmentPosition(0)).toBe(1);
            ManifestParser.verifySegmentIndex(stream, basicRefs);

            // The 30 second availability window is initially full in all cases
            // (SegmentTemplate+Timeline, etc.)  The first segment is always 10
            // seconds long in all of these cases.  So 11 seconds after the
            // manifest was parsed, the first segment should have fallen out of
            // the availability window.
            Date.now = function() { return 11 * 1000; };
            delayForUpdatePeriod();
            // The first reference should have been evicted.
            expect(stream.findSegmentPosition(0)).toBe(2);
            ManifestParser.verifySegmentIndex(stream, basicRefs.slice(1));
          }).catch(fail).then(done);
      PromiseMock.flush();
    });

    it('evicts old references for multi-period live stream', function(done) {
      let template = [
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
      let durs = basicRefs.map(function(r) { return r.endTime - r.startTime; });
      let pStart = durs.reduce(function(p, d) { return p + d; }, 0);
      let args = {
        updateTime: updateTime,
        pStart: pStart,
        contents: basicLines.join('\n'),
      };
      let text = sprintf(template, args);

      fakeNetEngine.setResponseText('dummy://foo', text);
      Date.now = function() { return 0; };
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            let stream1 = manifest.periods[0].variants[0].video;
            let stream2 = manifest.periods[1].variants[0].video;
            ManifestParser.verifySegmentIndex(stream1, basicRefs);
            ManifestParser.verifySegmentIndex(stream2, basicRefs);

            // The 60 second availability window is initially full in all cases
            // (SegmentTemplate+Timeline, etc.)  The first segment is always 10
            // seconds long in all of these cases.  So 11 seconds after the
            // manifest was parsed, the first segment should have fallen out of
            // the availability window.
            Date.now = function() { return 11 * 1000; };
            delayForUpdatePeriod();
            // The first reference should have been evicted.
            ManifestParser.verifySegmentIndex(stream1, basicRefs.slice(1));
            ManifestParser.verifySegmentIndex(stream2, basicRefs);

            // Same as above, but 1 period length later
            Date.now = function() { return (11 + pStart) * 1000; };
            delayForUpdatePeriod();
            ManifestParser.verifySegmentIndex(stream1, []);
            ManifestParser.verifySegmentIndex(stream2, basicRefs.slice(1));
          }).catch(fail).then(done);
      PromiseMock.flush();
    });

    it('sets infinite duration for single-period live streams', function(done) {
      let template = [
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
      let text = sprintf(
          template, {updateTime: updateTime, contents: basicLines.join('\n')});

      fakeNetEngine.setResponseText('dummy://foo', text);
      Date.now = function() { return 0; };
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest.periods.length).toBe(1);
            let timeline = manifest.presentationTimeline;
            expect(timeline.getDuration()).toBe(Infinity);
          }).catch(fail).then(done);
      PromiseMock.flush();
    });

    it('sets infinite duration for multi-period live streams', function(done) {
      let template = [
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
      let text = sprintf(
          template, {updateTime: updateTime, contents: basicLines.join('\n')});

      fakeNetEngine.setResponseText('dummy://foo', text);
      Date.now = function() { return 0; };
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest.periods.length).toBe(2);
            expect(manifest.periods[1].startTime).toBe(60);
            let timeline = manifest.presentationTimeline;
            expect(timeline.getDuration()).toBe(Infinity);
          }).catch(fail).then(done);
      PromiseMock.flush();
    });
  }

  it('can add Periods', function(done) {
    let lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];
    let template = [
      '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"',
      '    suggestedPresentationDelay="PT5S"',
      '    minimumUpdatePeriod="PT%(updateTime)dS">',
      '  <Period id="4">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="6" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '%(contents)s',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    let secondManifest =
        sprintf(template, {updateTime: updateTime, contents: lines.join('\n')});
    let firstManifest = makeSimpleLiveManifestText(lines, updateTime);

    let filterNewPeriod = jasmine.createSpy('filterNewPeriod');
    playerInterface.filterNewPeriod = Util.spyFunc(filterNewPeriod);

    let filterAllPeriods = jasmine.createSpy('filterAllPeriods');
    playerInterface.filterAllPeriods = Util.spyFunc(filterAllPeriods);

    fakeNetEngine.setResponseText('dummy://foo', firstManifest);
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest.periods.length).toBe(1);
          // Should call filterAllPeriods for parsing the first manifest
          expect(filterNewPeriod.calls.count()).toBe(0);
          expect(filterAllPeriods.calls.count()).toBe(1);

          fakeNetEngine.setResponseText('dummy://foo', secondManifest);
          delayForUpdatePeriod();

          // Should update the same manifest object.
          expect(manifest.periods.length).toBe(2);
          // Should call filterNewPeriod for parsing the new manifest
          expect(filterAllPeriods.calls.count()).toBe(1);
          expect(filterNewPeriod.calls.count()).toBe(1);
        }).catch(fail).then(done);
    PromiseMock.flush();
  });

  it('uses redirect URL for manifest BaseURL and updates', function(done) {
    let template = [
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
    let manifestText = sprintf(template, {updateTime: updateTime});
    let manifestData = shaka.util.StringUtils.toUTF8(manifestText);
    let redirectedUri = 'http://redirected.com/';

    // The initial manifest request will be redirected.
    fakeNetEngine.request.and.returnValue(
        shaka.util.AbortableOperation.completed({
          uri: redirectedUri,
          data: manifestData,
        }));

    parser.start(originalUri, playerInterface)
        .then(function(manifest) {
          // The manifest request was made to the original URL.
          // But includes a redirect
          expect(fakeNetEngine.request.calls.count()).toBe(1);
          let netRequest = fakeNetEngine.request.calls.argsFor(0)[1];
          expect(netRequest.uris).toEqual([redirectedUri, originalUri]);

          // Since the manifest request was redirected, the segment refers to
          // the redirected base.
          let stream = manifest.periods[0].variants[0].video;
          let segmentUri = stream.getSegmentReference(1).getUris()[0];
          expect(segmentUri).toBe(redirectedUri + 's1.mp4');
        }).catch(fail).then(done);
    PromiseMock.flush();
  });

  it('calls the error callback if an update fails', function(done) {
    let lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];
    let manifest = makeSimpleLiveManifestText(lines, updateTime);
    let onError = jasmine.createSpy('onError');
    playerInterface.onError = Util.spyFunc(onError);

    fakeNetEngine.setResponseText('dummy://foo', manifest);
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(fakeNetEngine.request.calls.count()).toBe(1);

          let error = new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.NETWORK,
              shaka.util.Error.Code.BAD_HTTP_STATUS);
          let operation = shaka.util.AbortableOperation.failed(error);
          fakeNetEngine.request.and.returnValue(operation);

          delayForUpdatePeriod();
          expect(onError.calls.count()).toBe(1);
        }).catch(fail).then(done);
    PromiseMock.flush();
  });

  it('uses @minimumUpdatePeriod', function(done) {
    let lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];
    // updateTime parameter sets @minimumUpdatePeriod in the manifest.
    let manifest = makeSimpleLiveManifestText(lines, updateTime);

    fakeNetEngine.setResponseText('dummy://foo', manifest);
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(fakeNetEngine.request.calls.count()).toBe(1);
          expect(manifest).toBeTruthy();

          let partialTime = updateTime * 1000 * 3 / 4;
          let remainingTime = updateTime * 1000 - partialTime;
          jasmine.clock().tick(partialTime);
          PromiseMock.flush();

          // Update period has not passed yet.
          expect(fakeNetEngine.request.calls.count()).toBe(1);
          jasmine.clock().tick(remainingTime);
          PromiseMock.flush();

          // Update period has passed.
          expect(fakeNetEngine.request.calls.count()).toBe(2);
        }).catch(fail).then(done);
    PromiseMock.flush();
  });

  it('still updates when @minimumUpdatePeriod is zero', function(done) {
    let lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];
    // updateTime parameter sets @minimumUpdatePeriod in the manifest.
    let manifest = makeSimpleLiveManifestText(lines, /* updateTime */ 0);

    fakeNetEngine.setResponseText('dummy://foo', manifest);
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest).toBeTruthy();
          fakeNetEngine.request.calls.reset();

          let waitTimeMs = shaka.dash.DashParser['MIN_UPDATE_PERIOD_'] * 1000;
          jasmine.clock().tick(waitTimeMs);
          PromiseMock.flush();

          // Update period has passed.
          expect(fakeNetEngine.request).toHaveBeenCalled();
        }).catch(fail).then(done);
    PromiseMock.flush();
  });

  it('does not update when @minimumUpdatePeriod is missing', function(done) {
    let lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];
    // updateTime parameter sets @minimumUpdatePeriod in the manifest.
    let manifest = makeSimpleLiveManifestText(lines, /* updateTime */ null);

    fakeNetEngine.setResponseText('dummy://foo', manifest);
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest).toBeTruthy();
          fakeNetEngine.request.calls.reset();

          let waitTimeMs = shaka.dash.DashParser['MIN_UPDATE_PERIOD_'] * 1000;
          jasmine.clock().tick(waitTimeMs * 2);
          PromiseMock.flush();

          // Even though we have waited longer than the minimum update period,
          // the missing attribute means "do not update".  So no update should
          // have happened.
          expect(fakeNetEngine.request).not.toHaveBeenCalled();
        }).catch(fail).then(done);
    PromiseMock.flush();
  });

  it('delays subsequent updates when an update is slow', function(done) {
    // For this test, we want Date.now() to follow the ticks of the fake clock.
    jasmine.clock().mockDate();

    const lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];
    const idealUpdateTime = shaka.dash.DashParser['MIN_UPDATE_PERIOD_'];
    const manifestText = makeSimpleLiveManifestText(lines, idealUpdateTime);

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    parser.start('dummy://foo', playerInterface).then((manifest) => {
      fakeNetEngine.request.calls.reset();

      // Make the first update take a long time.
      const delay = fakeNetEngine.delayNextRequest();

      // Wait for the update to start.
      jasmine.clock().tick(idealUpdateTime * 1000);
      PromiseMock.flush();

      // Update period has passed, so an update has been requested.
      expect(fakeNetEngine.request).toHaveBeenCalled();
      fakeNetEngine.request.calls.reset();

      // Make the update take an extra 15 seconds, then end the delay.
      const extraWaitTimeMs = 15.0;
      jasmine.clock().tick(extraWaitTimeMs * 1000);
      delay.resolve();
      PromiseMock.flush();
      // No new calls, since we are still working on the same one.
      expect(fakeNetEngine.request).not.toHaveBeenCalled();
      fakeNetEngine.request.calls.reset();

      // From now on, the updates should be farther apart.
      jasmine.clock().tick(idealUpdateTime * 1000);
      PromiseMock.flush();
      // The update should not have happened yet.
      expect(fakeNetEngine.request).not.toHaveBeenCalled();
      fakeNetEngine.request.calls.reset();

      // After waiting the extra time, the update request should fire.
      jasmine.clock().tick(extraWaitTimeMs * 1000);
      PromiseMock.flush();
      expect(fakeNetEngine.request).toHaveBeenCalled();
    }).catch(fail).then(done);
    PromiseMock.flush();
  });

  it('uses Mpd.Location', function(done) {
    let manifestText = [
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
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(fakeNetEngine.request.calls.count()).toBe(1);
          fakeNetEngine.expectRequest('dummy://foo', manifestRequest);
          fakeNetEngine.request.calls.reset();

          // Create a mock so we can verify it gives two URIs.
          // The third location is a relative url, and should be resolved as an
          // absolute url.
          fakeNetEngine.request.and.callFake(function(type, request) {
            expect(type).toBe(manifestRequest);
            expect(request.uris).toEqual(
              ['http://foobar', 'http://foobar2', 'dummy://foo/foobar3']);
            let data = shaka.util.StringUtils.toUTF8(manifestText);
            return shaka.util.AbortableOperation.completed(
                {uri: request.uris[0], data: data, headers: {}});
          });

          delayForUpdatePeriod();
          expect(fakeNetEngine.request.calls.count()).toBe(1);
        }).catch(fail).then(done);
    PromiseMock.flush();
  });

  it('uses @suggestedPresentationDelay', function(done) {
    let manifest = [
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
    fakeNetEngine.setResponseText('dummy://foo', manifest);

    Date.now = function() { return 600000; /* 10 minutes */ };
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest).toBeTruthy();
          let timeline = manifest.presentationTimeline;
          expect(timeline).toBeTruthy();

          //  We are 5 minutes into the presentation, with a
          //  @timeShiftBufferDepth of 120 seconds and a @maxSegmentDuration of
          //  10 seconds, the start will be 2:50.
          expect(timeline.getSegmentAvailabilityStart()).toBe(170);
          // Normally the end should be 4:50; but with a 60 second
          // @suggestedPresentationDelay it will be 3:50 minutes.
          expect(timeline.getSegmentAvailabilityEnd()).toBe(290);
          expect(timeline.getSeekRangeEnd()).toBe(230);
        }).catch(fail).then(done);
    PromiseMock.flush();
  });

  describe('availabilityWindowOverride', function() {
    it('overrides @timeShiftBufferDepth', function(done) {
      let manifest = [
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
      fakeNetEngine.setResponseText('dummy://foo', manifest);

      const config = shaka.util.PlayerConfiguration.createDefault().manifest;
      config.availabilityWindowOverride = 4 * 60;
      parser.configure(config);

      Date.now = function() { return 600000; /* 10 minutes */ };
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            let timeline = manifest.presentationTimeline;
            expect(timeline).toBeTruthy();

            // The parser was configured to have a manifest availability window
            // of 4 minutes.
            let end = timeline.getSegmentAvailabilityEnd();
            let start = timeline.getSegmentAvailabilityStart();
            expect(end - start).toEqual(4 * 60);
          }).catch(fail).then(done);
      PromiseMock.flush();
    });
  });

  describe('maxSegmentDuration', function() {
    it('uses @maxSegmentDuration', function(done) {
      let manifest = [
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
      fakeNetEngine.setResponseText('dummy://foo', manifest);

      Date.now = function() { return 600000; /* 10 minutes */ };
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            let timeline = manifest.presentationTimeline;
            expect(timeline).toBeTruthy();
            expect(timeline.getMaxSegmentDuration()).toBe(15);
          }).catch(fail).then(done);
      PromiseMock.flush();
    });

    it('derived from SegmentTemplate w/ SegmentTimeline', function(done) {
      let lines = [
        '<SegmentTemplate media="s$Number$.mp4">',
        '  <SegmentTimeline>',
        '    <S t="0" d="7" />',
        '    <S d="8" />',
        '    <S d="6" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>',
      ];
      testDerived(lines, done);
    });

    it('derived from SegmentTemplate w/ @duration', function(done) {
      let lines = [
        '<SegmentTemplate media="s$Number$.mp4" duration="8" />',
      ];
      testDerived(lines, done);
    });

    it('derived from SegmentList', function(done) {
      let lines = [
        '<SegmentList duration="8">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '</SegmentList>',
      ];
      testDerived(lines, done);
    });

    it('derived from SegmentList w/ SegmentTimeline', function(done) {
      let lines = [
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
      testDerived(lines, done);
    });

    function testDerived(lines, done) {
      let template = [
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
      let manifest = sprintf(template, {contents: lines.join('\n')});

      fakeNetEngine.setResponseText('dummy://foo', manifest);
      Date.now = function() { return 600000; /* 10 minutes */ };
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            let timeline = manifest.presentationTimeline;
            expect(timeline).toBeTruthy();

            // NOTE: the largest segment is 8 seconds long in each test.
            expect(timeline.getMaxSegmentDuration()).toBe(8);
          }).catch(fail).then(done);
      PromiseMock.flush();
    }
  });  // describe('maxSegmentDuration')

  describe('stop', function() {
    const manifestRequestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
    const dateRequestType = shaka.net.NetworkingEngine.RequestType.TIMING;
    const manifestUri = 'dummy://foo';
    const dateUri = 'http://foo.bar/date';

    beforeEach(function() {
      let manifest = [
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

    it('stops updates', function(done) {
      parser.start(manifestUri, playerInterface)
          .then(function(manifest) {
            fakeNetEngine.expectRequest(manifestUri, manifestRequestType);
            fakeNetEngine.request.calls.reset();

            parser.stop();
            delayForUpdatePeriod();
            expect(fakeNetEngine.request).not.toHaveBeenCalled();
          }).catch(fail).then(done);
      PromiseMock.flush();
    });

    it('stops initial parsing', function(done) {
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest).toBe(null);
            fakeNetEngine.expectRequest(manifestUri, manifestRequestType);
            fakeNetEngine.request.calls.reset();
            delayForUpdatePeriod();
            // An update should not occur.
            expect(fakeNetEngine.request).not.toHaveBeenCalled();
          }).catch(() => {}).then(done);

      // start will only begin the network request, calling stop here will be
      // after the request has started but before any parsing has been done.
      expect(fakeNetEngine.request.calls.count()).toBe(1);
      parser.stop();
      PromiseMock.flush();
    });

    it('interrupts manifest updates', function(done) {
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            fakeNetEngine.expectRequest(manifestUri, manifestRequestType);
            fakeNetEngine.request.calls.reset();
            let delay = fakeNetEngine.delayNextRequest();

            delayForUpdatePeriod();
            // The request was made but should not be resolved yet.
            expect(fakeNetEngine.request.calls.count()).toBe(1);
            fakeNetEngine.expectRequest(manifestUri, manifestRequestType);
            fakeNetEngine.request.calls.reset();
            parser.stop();
            delay.resolve();
            PromiseMock.flush();

            // Wait for another update period.
            delayForUpdatePeriod();
            // A second update should not occur.
            expect(fakeNetEngine.request).not.toHaveBeenCalled();
          }).catch(fail).then(done);
      PromiseMock.flush();
    });

    it('interrupts UTCTiming requests', function(done) {
      /** @type {!shaka.util.PublicPromise} */
      let delay = fakeNetEngine.delayNextRequest();

      Util.delay(0.2, realTimeout).then(function() {
        // This is the initial manifest request.
        expect(fakeNetEngine.request.calls.count()).toBe(1);
        fakeNetEngine.expectRequest(manifestUri, manifestRequestType);
        fakeNetEngine.request.calls.reset();
        // Resolve the manifest request and wait on the UTCTiming request.
        delay.resolve();
        delay = fakeNetEngine.delayNextRequest();
        return Util.delay(0.2, realTimeout);
      }).then(function() {
        // This is the first UTCTiming request.
        expect(fakeNetEngine.request.calls.count()).toBe(1);
        fakeNetEngine.expectRequest(dateUri, dateRequestType);
        fakeNetEngine.request.calls.reset();
        // Interrupt the parser, then fail the request.
        parser.stop();
        delay.reject();
        return Util.delay(0.1, realTimeout);
      }).then(function() {
        // Wait for another update period.
        delayForUpdatePeriod();

        // No more updates should occur.
        expect(fakeNetEngine.request).not.toHaveBeenCalled();
      }).catch(fail).then(done);

      parser.start('dummy://foo', playerInterface).catch(() => {});
      PromiseMock.flush();
    });
  });

  describe('SegmentTemplate w/ SegmentTimeline', function() {
    let basicLines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4">',
      '  <SegmentTimeline>',
      '    <S d="10" t="0" />',
      '    <S d="5" />',
      '    <S d="15" />',
      '  </SegmentTimeline>',
      '</SegmentTemplate>',
    ];
    let basicRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 1, 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 2, 10, 15, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 3, 15, 30, originalUri),
    ];
    let updateLines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4">',
      '  <SegmentTimeline>',
      '    <S d="10" t="0" />',
      '    <S d="5" />',
      '    <S d="15" />',
      '    <S d="10" />',
      '  </SegmentTimeline>',
      '</SegmentTemplate>',
    ];
    let updateRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 1, 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 2, 10, 15, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 3, 15, 30, originalUri),
      shaka.test.ManifestParser.makeReference('s4.mp4', 4, 30, 40, originalUri),
    ];
    let partialUpdateLines = [
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

  describe('SegmentList w/ SegmentTimeline', function() {
    let basicLines = [
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
    let basicRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 1, 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 2, 10, 15, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 3, 15, 30, originalUri),
    ];
    let updateLines = [
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
    let updateRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 1, 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 2, 10, 15, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 3, 15, 30, originalUri),
      shaka.test.ManifestParser.makeReference('s4.mp4', 4, 30, 40, originalUri),
    ];
    let partialUpdateLines = [
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

  describe('SegmentList w/ @duration', function() {
    let basicLines = [
      '<SegmentList duration="10">',
      '  <SegmentURL media="s1.mp4" />',
      '  <SegmentURL media="s2.mp4" />',
      '  <SegmentURL media="s3.mp4" />',
      '</SegmentList>',
    ];
    let basicRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 1, 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 2, 10, 20, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 3, 20, 30, originalUri),
    ];
    let updateLines = [
      '<SegmentList duration="10">',
      '  <SegmentURL media="s1.mp4" />',
      '  <SegmentURL media="s2.mp4" />',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentURL media="s4.mp4" />',
      '</SegmentList>',
    ];
    let updateRefs = [
      shaka.test.ManifestParser.makeReference('s1.mp4', 1, 0, 10, originalUri),
      shaka.test.ManifestParser.makeReference('s2.mp4', 2, 10, 20, originalUri),
      shaka.test.ManifestParser.makeReference('s3.mp4', 3, 20, 30, originalUri),
      shaka.test.ManifestParser.makeReference('s4.mp4', 4, 30, 40, originalUri),
    ];
    let partialUpdateLines = [
      '<SegmentList startNumber="3" duration="10">',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentURL media="s4.mp4" />',
      '</SegmentList>',
    ];

    testCommonBehaviors(
        basicLines, basicRefs, updateLines, updateRefs, partialUpdateLines);
  });

  describe('SegmentTemplate w/ duration', function() {
    let templateLines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
    ];

    it('produces sane references without assertions', function(done) {
      let manifest = makeSimpleLiveManifestText(templateLines, updateTime);

      fakeNetEngine.setResponseText('dummy://foo', manifest);
      parser.start('dummy://foo', playerInterface).then(function(manifest) {
        expect(manifest.periods.length).toBe(1);
        let stream = manifest.periods[0].variants[0].video;

        // In https://github.com/google/shaka-player/issues/1204, this
        // failed an assertion and returned endTime == 0.
        let ref = stream.getSegmentReference(1);
        expect(ref.endTime).toBeGreaterThan(0);
      }).catch(fail).then(done);
      PromiseMock.flush();
    });
  });

  describe('EventStream', function() {
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
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    /** @type {!jasmine.Spy} */
    let onTimelineRegionAddedSpy;

    beforeEach(function() {
      onTimelineRegionAddedSpy = jasmine.createSpy('onTimelineRegionAdded');
      playerInterface.onTimelineRegionAdded =
          shaka.test.Util.spyFunc(onTimelineRegionAddedSpy);
    });

    it('will parse EventStream nodes', function(done) {
      fakeNetEngine.setResponseText('dummy://foo', originalManifest);
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
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
          })
          .catch(fail)
          .then(done);
      PromiseMock.flush();
    });

    it('will add timeline regions on manifest update', function(done) {
      let newManifest = [
        '<MPD type="dynamic" minimumUpdatePeriod="PT' + updateTime + 'S"',
        '    availabilityStartTime="1970-01-01T00:00:00Z">',
        '  <Period id="1" duration="PT30S">',
        '    <EventStream schemeIdUri="http://example.com" timescale="100">',
        '      <Event id="100" />',
        '    </EventStream>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="100-200" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', originalManifest);
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(onTimelineRegionAddedSpy).toHaveBeenCalledTimes(2);
            onTimelineRegionAddedSpy.calls.reset();

            fakeNetEngine.setResponseText('dummy://foo', newManifest);
            delayForUpdatePeriod();

            expect(onTimelineRegionAddedSpy).toHaveBeenCalledTimes(1);
          })
          .catch(fail)
          .then(done);
      PromiseMock.flush();
    });

    it('will not let an event exceed the Period duration', function(done) {
      let newManifest = [
        '<MPD>',
        '  <Period id="1" duration="PT30S">',
        '    <EventStream schemeIdUri="http://example.com" timescale="1">',
        '      <Event presentationTime="10" duration="15"/>',
        '      <Event presentationTime="25" duration="50"/>',
        '      <Event presentationTime="50" duration="10"/>',
        '    </EventStream>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="100-200" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', newManifest);
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
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
          })
          .catch(fail)
          .then(done);
      PromiseMock.flush();
    });

    it('will parse multiple events at same offset', () => {
      const newManifest = [
        '<MPD>',
        '  <Period id="1" duration="PT30S">',
        '    <EventStream schemeIdUri="http://example.com" timescale="1">',
        '      <Event id="1" presentationTime="10" duration="15"/>',
        '      <Event id="2" presentationTime="10" duration="15"/>',
        '    </EventStream>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="100-200" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', newManifest);
      parser.start('dummy://foo', playerInterface).catch(fail);
      PromiseMock.flush();

      expect(onTimelineRegionAddedSpy).toHaveBeenCalledTimes(2);
      expect(onTimelineRegionAddedSpy)
          .toHaveBeenCalledWith(
              jasmine.objectContaining({id: '1', startTime: 10, endTime: 25}));
      expect(onTimelineRegionAddedSpy)
          .toHaveBeenCalledWith(
              jasmine.objectContaining({id: '2', startTime: 10, endTime: 25}));
    });
  });

  it('honors clockSyncUri for in-progress recordings', (done) => {
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

    parser.start('dummy://foo', playerInterface).then((manifest) => {
      // Make sure we're testing what we think we're testing.
      // This should be seen as in-progress.
      expect(manifest.presentationTimeline.isInProgress()).toBe(true);

      // Now make sure we made the time sync request.
      const timingRequest = shaka.net.NetworkingEngine.RequestType.TIMING;
      fakeNetEngine.expectRequest('dummy://time', timingRequest);
    }).catch(fail).then(done);
    PromiseMock.flush();
  });
});
