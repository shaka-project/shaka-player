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

describe('DashParser.Live', function() {
  var Dash;
  var errorCallback;
  var fakeNetEngine;
  var newPeriod;
  var oldNow;
  var parser;
  var realTimeout;
  var updateTime = 5;
  var Util;

  beforeAll(function() {
    Dash = shaka.test.Dash;
    Util = shaka.test.Util;
    realTimeout = window.setTimeout;
    oldNow = Date.now;
    jasmine.clock().install();
    // This polyfill is required for fakeEventLoop.
    shaka.polyfill.Promise.install(/* force */ true);
  });

  beforeEach(function() {
    var retry = shaka.net.NetworkingEngine.defaultRetryParameters();
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    newPeriod = jasmine.createSpy('newPeriod');
    errorCallback = jasmine.createSpy('error callback');
    parser = new shaka.dash.DashParser();
    parser.configure({
      retryParameters: retry,
      dash: { clockSyncUri: '', customScheme: function(node) { return null; } }
    });
  });

  afterEach(function() {
    // Dash parser stop is synchronous.
    parser.stop();
  });

  afterAll(function() {
    Date.now = oldNow;
    jasmine.clock().uninstall();
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
   * @param {number} updateTime
   * @param {number=} opt_duration
   * @return {string}
   */
  function makeSimpleLiveManifestText(lines, updateTime, opt_duration) {
    var attr = opt_duration ? 'duration="PT' + opt_duration + 'S"' : '';
    var template = [
      '<MPD type="dynamic" minimumUpdatePeriod="PT%(updateTime)dS"',
      '    availabilityStartTime="1970-01-01T00:00:00Z">',
      '  <Period id="1" %(attr)s>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="3" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '%(contents)s',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'
    ].join('\n');
    var text = sprintf(template, {
      attr: attr,
      contents: lines.join('\n'),
      updateTime: updateTime
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
      var firstManifest = makeSimpleLiveManifestText(firstLines, updateTime);
      var secondManifest = makeSimpleLiveManifestText(secondLines, updateTime);

      fakeNetEngine.setResponseMapAsText({'dummy://foo': firstManifest});
      parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
          .then(function(manifest) {
            Dash.verifySegmentIndex(manifest, firstReferences, 0);

            fakeNetEngine.setResponseMapAsText({'dummy://foo': secondManifest});
            delayForUpdatePeriod();
            Dash.verifySegmentIndex(manifest, secondReferences, 0);
          }).catch(fail).then(done);
      shaka.polyfill.Promise.flush();
    }

    it('basic support', function(done) {
      testBasicUpdate(done, basicLines, basicRefs, updateLines, updateRefs);
    });

    it('new manifests don\'t need to include old references', function(done) {
      testBasicUpdate(
          done, basicLines, basicRefs, partialUpdateLines, updateRefs);
    });

    it('evicts old references for single-period live stream', function(done) {
      var template = [
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
        '</MPD>'
      ].join('\n');
      var text = sprintf(
          template, {updateTime: updateTime, contents: basicLines.join('\n')});

      fakeNetEngine.setResponseMapAsText({'dummy://foo': text});
      Date.now = function() { return 0; };
      parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            var stream = manifest.periods[0].streamSets[0].streams[0];
            expect(stream).toBeTruthy();

            expect(stream.findSegmentPosition).toBeTruthy();
            expect(stream.findSegmentPosition(0)).not.toBe(null);
            Dash.verifySegmentIndex(manifest, basicRefs, 0);

            // 15 seconds for @timeShiftBufferDepth, the first segment duration,
            // and the @suggestedPresentationDelay.
            Date.now = function() { return (2 * 15 + 5) * 1000; };
            delayForUpdatePeriod();
            // The first reference should have been evicted.
            expect(stream.findSegmentPosition(0)).toBe(null);
            Dash.verifySegmentIndex(manifest, basicRefs.slice(1), 0);
          }).catch(fail).then(done);
      shaka.polyfill.Promise.flush();
    });

    it('evicts old references for multi-period live stream', function(done) {
      var template = [
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
        '  <Period id="2" start="PT%(pStart)dS">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="4" bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '%(contents)s',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');
      // Set the period start to the sum of the durations of the references
      // in the previous period.
      var durs = basicRefs.map(function(r) { return r.endTime - r.startTime; });
      var pStart = durs.reduce(function(p, d) { return p + d; }, 0);
      var args = {
        updateTime: updateTime,
        pStart: pStart,
        contents: basicLines.join('\n')
      };
      var text = sprintf(template, args);

      fakeNetEngine.setResponseMapAsText({'dummy://foo': text});
      Date.now = function() { return 0; };
      parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
          .then(function(manifest) {
            Dash.verifySegmentIndex(manifest, basicRefs, 0);
            Dash.verifySegmentIndex(manifest, basicRefs, 1);

            // 15 seconds for @timeShiftBufferDepth, the first segment duration,
            // and the @suggestedPresentationDelay.
            Date.now = function() { return (2 * 15 + 5) * 1000; };
            delayForUpdatePeriod();
            // The first reference should have been evicted.
            Dash.verifySegmentIndex(manifest, basicRefs.slice(1), 0);
            Dash.verifySegmentIndex(manifest, basicRefs, 1);

            // Same as above, but 1 period length later
            Date.now = function() { return (2 * 15 + 5 + pStart) * 1000; };
            delayForUpdatePeriod();
            Dash.verifySegmentIndex(manifest, [], 0);
            Dash.verifySegmentIndex(manifest, basicRefs.slice(1), 1);
          }).catch(fail).then(done);
      shaka.polyfill.Promise.flush();
    });

    it('sets infinite duration for single-period live streams', function(done) {
      var template = [
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
        '</MPD>'
      ].join('\n');
      var text = sprintf(
          template, {updateTime: updateTime, contents: basicLines.join('\n')});

      fakeNetEngine.setResponseMapAsText({'dummy://foo': text});
      Date.now = function() { return 0; };
      parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
          .then(function(manifest) {
            expect(manifest.periods.length).toBe(1);
            var timeline = manifest.presentationTimeline;
            expect(timeline.getDuration()).toBe(Infinity);
          }).catch(fail).then(done);
      shaka.polyfill.Promise.flush();
    });

    it('sets infinite duration for multi-period live streams', function(done) {
      var template = [
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
        '</MPD>'
      ].join('\n');
      var text = sprintf(
          template, {updateTime: updateTime, contents: basicLines.join('\n')});

      fakeNetEngine.setResponseMapAsText({'dummy://foo': text});
      Date.now = function() { return 0; };
      parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
          .then(function(manifest) {
            expect(manifest.periods.length).toBe(2);
            expect(manifest.periods[1].startTime).toBe(60);
            var timeline = manifest.presentationTimeline;
            expect(timeline.getDuration()).toBe(Infinity);
          }).catch(fail).then(done);
      shaka.polyfill.Promise.flush();
    });
  }

  it('can add Periods', function(done) {
    var lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />'
    ];
    var template = [
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
      '</MPD>'
    ].join('\n');
    var secondManifest =
        sprintf(template, {updateTime: updateTime, contents: lines.join('\n')});
    var firstManifest = makeSimpleLiveManifestText(lines, updateTime);

    fakeNetEngine.setResponseMapAsText({'dummy://foo': firstManifest});
    parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
        .then(function(manifest) {
          expect(manifest.periods.length).toBe(1);
          expect(newPeriod.calls.count()).toBe(1);

          fakeNetEngine.setResponseMapAsText({'dummy://foo': secondManifest});
          delayForUpdatePeriod();

          // Should update the same manifest object.
          expect(manifest.periods.length).toBe(2);
          expect(newPeriod.calls.count()).toBe(2);
        }).catch(fail).then(done);
    shaka.polyfill.Promise.flush();
  });

  it('uses redirect URL for manifest BaseURL', function(done) {
    var template = [
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
      '</MPD>'
    ].join('\n');
    var manifestText = sprintf(template, {updateTime: updateTime});
    var manifestData = shaka.util.StringUtils.toUTF8(manifestText);
    var originalUri = 'http://example.com/';
    var redirectedUri = 'http://redirected.com/';

    // The initial manifest request will be redirected.
    fakeNetEngine.request.and.returnValue(
        Promise.resolve({uri: redirectedUri, data: manifestData}));

    parser.start(originalUri, fakeNetEngine, newPeriod, errorCallback)
        .then(function(manifest) {
          // The manifest request was made to the original URL.
          expect(fakeNetEngine.request.calls.count()).toBe(1);
          var netRequest = fakeNetEngine.request.calls.argsFor(0)[1];
          expect(netRequest.uris).toEqual([originalUri]);

          // Since the manifest request was redirected, the segment refers to
          // the redirected base.
          var stream = manifest.periods[0].streamSets[0].streams[0];
          var segmentUri = stream.getSegmentReference(1).getUris()[0];
          expect(segmentUri).toBe(redirectedUri + 's1.mp4');
        }).catch(fail).then(done);
    shaka.polyfill.Promise.flush();
  });

  it('failures in update call error callback', function(done) {
    var lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />'
    ];
    var manifest = makeSimpleLiveManifestText(lines, updateTime);

    fakeNetEngine.setResponseMapAsText({'dummy://foo': manifest});
    parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
        .then(function(manifest) {
          expect(fakeNetEngine.request.calls.count()).toBe(1);

          var error = new shaka.util.Error(
              shaka.util.Error.Category.NETWORK,
              shaka.util.Error.Code.BAD_HTTP_STATUS);
          var promise = Promise.reject(error);
          fakeNetEngine.request.and.returnValue(promise);

          delayForUpdatePeriod();
          expect(errorCallback.calls.count()).toBe(1);
        }).catch(fail).then(done);
    shaka.polyfill.Promise.flush();
  });

  it('uses @minimumUpdatePeriod', function(done) {
    var lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />'
    ];
    // updateTime parameter sets @minimumUpdatePeriod in the manifest.
    var manifest = makeSimpleLiveManifestText(lines, updateTime);

    fakeNetEngine.setResponseMapAsText({'dummy://foo': manifest});
    parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
        .then(function(manifest) {
          expect(fakeNetEngine.request.calls.count()).toBe(1);
          expect(manifest).toBeTruthy();

          var partialTime = updateTime * 1000 * 3 / 4;
          var remainingTime = updateTime * 1000 - partialTime;
          jasmine.clock().tick(partialTime);
          shaka.polyfill.Promise.flush();

          // Update period has not passed yet.
          expect(fakeNetEngine.request.calls.count()).toBe(1);
          jasmine.clock().tick(remainingTime);
          shaka.polyfill.Promise.flush();

          // Update period has passed.
          expect(fakeNetEngine.request.calls.count()).toBe(2);
        }).catch(fail).then(done);
    shaka.polyfill.Promise.flush();
  });

  it('uses Mpd.Location', function(done) {
    var manifest = [
      '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"',
      '    suggestedPresentationDelay="PT5S"',
      '    minimumUpdatePeriod="PT' + updateTime + 'S">',
      '  <Location>http://foobar</Location>',
      '  <Location>http://foobar2</Location>',
      '  <Period id="1" duration="PT10S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="3" bandwidth="500">',
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'
    ].join('\n');
    fakeNetEngine.setResponseMapAsText({'dummy://foo': manifest});

    var manifestRequest = shaka.net.NetworkingEngine.RequestType.MANIFEST;
    parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
        .then(function(manifest) {
          expect(fakeNetEngine.request.calls.count()).toBe(1);
          fakeNetEngine.expectRequest('dummy://foo', manifestRequest);
          fakeNetEngine.request.calls.reset();

          // Create a mock so we can verify it gives two URIs.
          fakeNetEngine.request.and.callFake(function(type, request) {
            expect(type).toBe(manifestRequest);
            expect(request.uris).toEqual(['http://foobar', 'http://foobar2']);
            var data = shaka.util.StringUtils.toUTF8(manifest);
            return Promise.resolve(
                {uri: request.uris[0], data: data, headers: {}});
          });

          delayForUpdatePeriod();
          expect(fakeNetEngine.request.calls.count()).toBe(1);
        }).catch(fail).then(done);
    shaka.polyfill.Promise.flush();
  });

  it('uses @suggestedPresentationDelay', function(done) {
    var manifest = [
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
      '</MPD>'
    ].join('\n');
    fakeNetEngine.setResponseMapAsText({'dummy://foo': manifest});

    Date.now = function() { return 600000; /* 10 minutes */ };
    parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
        .then(function(manifest) {
          expect(manifest).toBeTruthy();
          var timeline = manifest.presentationTimeline;
          expect(timeline).toBeTruthy();

          //  We are 5 minutes into the presentation, with a
          //  @timeShiftBufferDepth of 120 seconds and a @maxSegmentDuration of
          //  10 seconds, the normal start will be 2:50; but with a 60
          //  @suggestedPresentationDelay it should be 1:50.
          expect(timeline.getSegmentAvailabilityStart()).toBe(110);
          // Similarly, normally the end should be 4:50; but with the delay
          // it will be 3:50 minutes.
          expect(timeline.getSegmentAvailabilityEnd()).toBe(290);
          expect(timeline.getSeekRangeEnd()).toBe(230);
        }).catch(fail).then(done);
    shaka.polyfill.Promise.flush();
  });

  describe('maxSegmentDuration', function() {
    it('uses @maxSegmentDuration', function(done) {
      var manifest = [
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
        '</MPD>'
      ].join('\n');
      fakeNetEngine.setResponseMapAsText({'dummy://foo': manifest});

      Date.now = function() { return 600000; /* 10 minutes */ };
      parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            var timeline = manifest.presentationTimeline;
            expect(timeline).toBeTruthy();
            expect(timeline.getSegmentAvailabilityStart()).toBe(165);
            expect(timeline.getSegmentAvailabilityEnd()).toBe(285);
          }).catch(fail).then(done);
      shaka.polyfill.Promise.flush();
    });

    it('derived from SegmentTemplate w/ SegmentTimeline', function(done) {
      var lines = [
        '<SegmentTemplate media="s$Number$.mp4">',
        '  <SegmentTimeline>',
        '    <S t="0" d="7" />',
        '    <S d="8" />',
        '    <S d="6" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>'
      ];
      testDerived(lines, done);
    });

    it('derived from SegmentTemplate w/ @duration', function(done) {
      var lines = [
        '<SegmentTemplate media="s$Number$.mp4" duration="8" />'
      ];
      testDerived(lines, done);
    });

    it('derived from SegmentList', function(done) {
      var lines = [
        '<SegmentList duration="8">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '</SegmentList>'
      ];
      testDerived(lines, done);
    });

    it('derived from SegmentList w/ SegmentTimeline', function(done) {
      var lines = [
        '<SegmentList duration="8">',
        '  <SegmentTimeline>',
        '    <S t="0" d="5" />',
        '    <S d="4" />',
        '    <S d="8" />',
        '  </SegmentTimeline>',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '</SegmentList>'
      ];
      testDerived(lines, done);
    });

    function testDerived(lines, done) {
      var template = [
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
        '</MPD>'
      ].join('\n');
      var manifest = sprintf(template, { contents: lines.join('\n') });

      fakeNetEngine.setResponseMapAsText({'dummy://foo': manifest});
      Date.now = function() { return 600000; /* 10 minutes */ };
      parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            var timeline = manifest.presentationTimeline;
            expect(timeline).toBeTruthy();

            // NOTE: the largest segment is 8 seconds long in each test.
            expect(timeline.getSegmentAvailabilityStart()).toBe(172);
            expect(timeline.getSegmentAvailabilityEnd()).toBe(292);
          }).catch(fail).then(done);
      shaka.polyfill.Promise.flush();
    }
  });

  describe('stop', function() {
    var manifestUri;
    var dateUri;
    var manifestRequestType;
    var dateRequestType;

    beforeAll(function() {
      manifestUri = 'dummy://foo';
      dateUri = 'http://foo.bar/date';
      manifestRequestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
      dateRequestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
    });

    beforeEach(function() {
      var manifest = [
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
        '</MPD>'
      ].join('\n');
      fakeNetEngine.setResponseMapAsText({
        'http://foo.bar/date': '1970-01-01T00:00:30Z',
        'dummy://foo': manifest
      });
    });

    it('stops updates', function(done) {
      parser.start(manifestUri, fakeNetEngine, newPeriod, errorCallback)
          .then(function(manifest) {
            fakeNetEngine.expectRequest(manifestUri, manifestRequestType);
            fakeNetEngine.request.calls.reset();

            parser.stop();
            delayForUpdatePeriod();
            expect(fakeNetEngine.request).not.toHaveBeenCalled();
          }).catch(fail).then(done);
      shaka.polyfill.Promise.flush();
    });

    it('stops initial parsing', function(done) {
      parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
          .then(function(manifest) {
            expect(manifest).toBe(null);
            fakeNetEngine.expectRequest(manifestUri, manifestRequestType);
            fakeNetEngine.request.calls.reset();
            delayForUpdatePeriod();
            // An update should not occur.
            expect(fakeNetEngine.request).not.toHaveBeenCalled();
          }).catch(fail).then(done);

      // start will only begin the network request, calling stop here will be
      // after the request has started but before any parsing has been done.
      expect(fakeNetEngine.request.calls.count()).toBe(1);
      parser.stop();
      shaka.polyfill.Promise.flush();
    });

    it('interrupts manifest updates', function(done) {
      parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            fakeNetEngine.expectRequest(manifestUri, manifestRequestType);
            fakeNetEngine.request.calls.reset();
            var delay = fakeNetEngine.delayNextRequest();

            delayForUpdatePeriod();
            // The request was made but should not be resolved yet.
            expect(fakeNetEngine.request.calls.count()).toBe(1);
            fakeNetEngine.expectRequest(manifestUri, manifestRequestType);
            fakeNetEngine.request.calls.reset();
            parser.stop();
            delay.resolve();
            shaka.polyfill.Promise.flush();

            // Wait for another update period.
            delayForUpdatePeriod();
            // A second update should not occur.
            expect(fakeNetEngine.request).not.toHaveBeenCalled();
          }).catch(fail).then(done);
      shaka.polyfill.Promise.flush();
    });

    it('interrupts UTCTiming requests', function(done) {
      var delay = fakeNetEngine.delayNextRequest();
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

      parser.start('dummy://foo', fakeNetEngine, newPeriod, errorCallback)
          .catch(fail);
      shaka.polyfill.Promise.flush();
    });
  });

  describe('SegmentTemplate w/ SegmentTimeline', function() {
    var basicLines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4">',
      '  <SegmentTimeline>',
      '    <S d="10" t="0" />',
      '    <S d="5" />',
      '    <S d="15" />',
      '  </SegmentTimeline>',
      '</SegmentTemplate>'
    ];
    var basicRefs = [
      shaka.test.Dash.makeReference('s1.mp4', 1, 0, 10),
      shaka.test.Dash.makeReference('s2.mp4', 2, 10, 15),
      shaka.test.Dash.makeReference('s3.mp4', 3, 15, 30)
    ];
    var updateLines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4">',
      '  <SegmentTimeline>',
      '    <S d="10" t="0" />',
      '    <S d="5" />',
      '    <S d="15" />',
      '    <S d="10" />',
      '  </SegmentTimeline>',
      '</SegmentTemplate>'
    ];
    var updateRefs = [
      shaka.test.Dash.makeReference('s1.mp4', 1, 0, 10),
      shaka.test.Dash.makeReference('s2.mp4', 2, 10, 15),
      shaka.test.Dash.makeReference('s3.mp4', 3, 15, 30),
      shaka.test.Dash.makeReference('s4.mp4', 4, 30, 40)
    ];
    var partialUpdateLines = [
      '<SegmentTemplate startNumber="3" media="s$Number$.mp4">',
      '  <SegmentTimeline>',
      '    <S d="15" t="15" />',
      '    <S d="10" />',
      '  </SegmentTimeline>',
      '</SegmentTemplate>'
    ];

    testCommonBehaviors(
        basicLines, basicRefs, updateLines, updateRefs, partialUpdateLines);
  });

  describe('SegmentList w/ SegmentTimeline', function() {
    var basicLines = [
      '<SegmentList>',
      '  <SegmentURL media="s1.mp4" />',
      '  <SegmentURL media="s2.mp4" />',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentTimeline>',
      '    <S d="10" t="0" />',
      '    <S d="5" />',
      '    <S d="15" />',
      '  </SegmentTimeline>',
      '</SegmentList>'
    ];
    var basicRefs = [
      shaka.test.Dash.makeReference('s1.mp4', 1, 0, 10),
      shaka.test.Dash.makeReference('s2.mp4', 2, 10, 15),
      shaka.test.Dash.makeReference('s3.mp4', 3, 15, 30)
    ];
    var updateLines = [
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
      '</SegmentList>'
    ];
    var updateRefs = [
      shaka.test.Dash.makeReference('s1.mp4', 1, 0, 10),
      shaka.test.Dash.makeReference('s2.mp4', 2, 10, 15),
      shaka.test.Dash.makeReference('s3.mp4', 3, 15, 30),
      shaka.test.Dash.makeReference('s4.mp4', 4, 30, 40)
    ];
    var partialUpdateLines = [
      '<SegmentList startNumber="3">',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentURL media="s4.mp4" />',
      '  <SegmentTimeline>',
      '    <S d="15" t="15" />',
      '    <S d="10" />',
      '  </SegmentTimeline>',
      '</SegmentList>'
    ];

    testCommonBehaviors(
        basicLines, basicRefs, updateLines, updateRefs, partialUpdateLines);
  });

  describe('SegmentList w/ @duration', function() {
    var basicLines = [
      '<SegmentList duration="10">',
      '  <SegmentURL media="s1.mp4" />',
      '  <SegmentURL media="s2.mp4" />',
      '  <SegmentURL media="s3.mp4" />',
      '</SegmentList>'
    ];
    var basicRefs = [
      shaka.test.Dash.makeReference('s1.mp4', 1, 0, 10),
      shaka.test.Dash.makeReference('s2.mp4', 2, 10, 20),
      shaka.test.Dash.makeReference('s3.mp4', 3, 20, 30)
    ];
    var updateLines = [
      '<SegmentList duration="10">',
      '  <SegmentURL media="s1.mp4" />',
      '  <SegmentURL media="s2.mp4" />',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentURL media="s4.mp4" />',
      '</SegmentList>'
    ];
    var updateRefs = [
      shaka.test.Dash.makeReference('s1.mp4', 1, 0, 10),
      shaka.test.Dash.makeReference('s2.mp4', 2, 10, 20),
      shaka.test.Dash.makeReference('s3.mp4', 3, 20, 30),
      shaka.test.Dash.makeReference('s4.mp4', 4, 30, 40)
    ];
    var partialUpdateLines = [
      '<SegmentList startNumber="3" duration="10">',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentURL media="s4.mp4" />',
      '</SegmentList>'
    ];

    testCommonBehaviors(
        basicLines, basicRefs, updateLines, updateRefs, partialUpdateLines);
  });
});

