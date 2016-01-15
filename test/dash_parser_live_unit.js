/**
 * @license
 * Copyright 2015 Google Inc.
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
  var errorCallback;
  var fakeNetEngine;
  var newPeriod;
  var oldNow;
  var parser;
  var realTimeout;
  var Uint8ArrayUtils;
  var updateTime = 5;

  beforeAll(function() {
    Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    realTimeout = window.setTimeout;
    jasmine.clock().install();

    oldNow = Date.now;
  });

  beforeEach(function() {
    fakeNetEngine = { request: jasmine.createSpy('request') };
    newPeriod = jasmine.createSpy('newPeriod');
    errorCallback = jasmine.createSpy('error callback');
    parser = new shaka.dash.DashParser(
        fakeNetEngine, {}, newPeriod, errorCallback);
  });

  afterAll(function() {
    jasmine.clock().uninstall();
    Date.now = oldNow;
  });

  /**
   * Sets the return value of the fake networking engine.
   *
   * @param {!ArrayBuffer} data
   */
  function setNetEngineReturnValue(data) {
    fakeNetEngine.request.and.returnValue(Promise.resolve({data: data}));
  }

  /**
   * Returns a promise that waits until manifest updates.
   *
   * @return {!Promise}
   */
  function waitForManifestUpdate() {
    // Tick the virtual clock to trigger an update.
    jasmine.clock().tick(updateTime * 1000);
    // Further delay since updates use Promises.
    return delay(0.1, realTimeout);
  }

  /**
   * Makes a simple live manifest with the given representation contents.
   *
   * @param {!Array.<string>} lines
   * @param {number} updatePeriod
   * @param {number=} opt_duration
   * @return {!ArrayBuffer}
   */
  function makeSimpleLiveManifestText(lines, updatePeriod, opt_duration) {
    var attr = opt_duration ? 'duration="PT' + opt_duration + 'S"' : '';
    var template = [
      '<MPD type="dynamic" minimumUpdatePeriod="PT%(updatePeriod)dS">',
      '  <Period id="1" %(attr)s>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
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
      updatePeriod: updatePeriod
    });
    return Uint8ArrayUtils.fromString(text).buffer;
  }

  /**
   * Creates tests that test the behavior common between SegmentList and
   * SegmentTemplate.
   *
   * @param {!Array.<string>} basicLines
   * @param {!Array.<!shaka.media.SegmentReference} basicRefs
   * @param {!Array.<string>} updateLines
   * @param {!Array.<!shaka.media.SegmentReference} updateRefs
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
     * @param {!Array.<!shaka.media.SegmentReference} firstReferences The media
     *   references for the first parse.
     * @param {!Array.<string>} secondLines The Representation contents for the
     *   updated manifest.
     * @param {!Array.<!shaka.media.SegmentReference} secondReferences The media
     *   references for the updated manifest.
     */
    function testBasicUpdate(
        done, firstLines, firstReferences, secondLines, secondReferences) {
      var firstManifest = makeSimpleLiveManifestText(firstLines, updateTime);
      var secondManifest = makeSimpleLiveManifestText(secondLines, updateTime);

      setNetEngineReturnValue(firstManifest);
      parser.start('')
          .then(function(manifest) {
            verifySegmentIndex(manifest, firstReferences);

            setNetEngineReturnValue(secondManifest);
            return waitForManifestUpdate().then(function() {
              verifySegmentIndex(manifest, secondReferences);
            });
          })
          .catch(fail)
          .then(done);
    }

    it('basic support', function(done) {
      testBasicUpdate(done, basicLines, basicRefs, updateLines, updateRefs);
    });

    it('new manifests don\'t need to include old references', function(done) {
      testBasicUpdate(
          done, basicLines, basicRefs, partialUpdateLines, updateRefs);
    });

    it('evicts old references', function(done) {
      var template = [
        '<MPD type="dynamic" minimumUpdatePeriod="PT%(updateTime)dS"',
        '    timeShiftBufferDepth="PT1S"',
        '    availabilityStartTime="1970-01-01T00:00:00Z">',
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
      var text = sprintf(
          template, {updateTime: updateTime, contents: basicLines.join('\n')});
      var manifest = Uint8ArrayUtils.fromString(text).buffer;

      setNetEngineReturnValue(manifest);
      Date.now = function() { return 0; };
      parser.start('')
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            var stream = manifest.periods[0].streamSets[0].streams[0];
            expect(stream).toBeTruthy();

            expect(stream.findSegmentPosition).toBeTruthy();
            expect(stream.findSegmentPosition(0)).not.toBe(null);
            verifySegmentIndex(manifest, basicRefs);

            // 15 seconds for @timeShiftBufferDepth and the first segment
            // duration.
            Date.now = function() { return 15 * 1000; };
            return waitForManifestUpdate().then(function() {
              // The first reference should have been evicted.
              expect(stream.findSegmentPosition(0)).toBe(null);
              verifySegmentIndex(manifest, basicRefs.slice(1));
            });
          })
          .catch(fail)
          .then(done);
    });
  }

  it('can add Periods', function(done) {
    var lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />'
    ];
    var template = [
      '<MPD type="dynamic" minimumUpdatePeriod="PT%(updateTime)dS">',
      '  <Period id="4">',
      '    <AdaptationSet id="5" mimeType="video/mp4">',
      '      <Representation id="6" bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '%(contents)s',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'
    ].join('\n');
    var text =
        sprintf(template, {updateTime: updateTime, contents: lines.join('\n')});
    var firstManifest = makeSimpleLiveManifestText(lines, updateTime);
    var secondManifest = Uint8ArrayUtils.fromString(text).buffer;

    setNetEngineReturnValue(firstManifest);
    parser.start('')
        .then(function(manifest) {
          expect(manifest.periods.length).toBe(1);
          expect(newPeriod.calls.count()).toBe(1);

          setNetEngineReturnValue(secondManifest);
          return waitForManifestUpdate().then(function() {
            // Should update the same manifest object.
            expect(manifest.periods.length).toBe(2);
            expect(newPeriod.calls.count()).toBe(2);
          });
        })
        .catch(fail)
        .then(done);
  });

  it('uses redirect URL for manifest BaseURL', function(done) {
    var template = [
      '<MPD type="dynamic" minimumUpdatePeriod="PT%(updatePeriod)dS">',
      '  <Period id="1" duration="PT10S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
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
    var manifestText = sprintf(template, {updatePeriod: updateTime});
    var manifestData = Uint8ArrayUtils.fromString(manifestText).buffer;
    var originalUri = 'http://example.com/';
    var redirectedUri = 'http://redirected.com/';

    // The initial manifest request will be redirected.
    fakeNetEngine.request.and.returnValue(
        Promise.resolve({uri: redirectedUri, data: manifestData}));

    parser.start(originalUri)
        .then(function(manifest) {
          // The manifest request was made to the original URL.
          expect(fakeNetEngine.request.calls.count()).toBe(1);
          var netRequest = fakeNetEngine.request.calls.argsFor(0)[1];
          expect(netRequest.uris).toEqual([originalUri]);

          // Since the manifest request was redirected, the segment refers to
          // the redirected base.
          var stream = manifest.periods[0].streamSets[0].streams[0];
          var segmentUri = stream.getSegmentReference(1).uris[0];
          expect(segmentUri).toBe(redirectedUri + 's1.mp4');

          // The update request will not redirect.
          fakeNetEngine.request.and.returnValue(
              Promise.resolve({uri: originalUri, data: manifestData}));
          fakeNetEngine.request.calls.reset();
          return waitForManifestUpdate().then(function() {
            // The update request was made to the original URL.
            expect(fakeNetEngine.request.calls.count()).toBe(1);
            var netRequest = fakeNetEngine.request.calls.argsFor(0)[1];
            expect(netRequest.uris).toEqual([originalUri]);

            // Since the update was not redirected, the segment refers to
            // the original base again.
            var stream = manifest.periods[0].streamSets[0].streams[0];
            var segmentUri = stream.getSegmentReference(1).uris[0];
            expect(segmentUri).toBe(originalUri + 's1.mp4');
            // NOTE: the bases of segment references are never updated for
            // SegmentTemplate+duration.
          });
        })
        .catch(fail)
        .then(done);
  });

  it('failures in update call error callback', function(done) {
    var lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />'
    ];
    var manifest = makeSimpleLiveManifestText(lines, updateTime);

    setNetEngineReturnValue(manifest);
    parser.start('')
        .then(function(manifest) {
          expect(fakeNetEngine.request.calls.count()).toBe(1);

          var error = new shaka.util.Error(
              shaka.util.Error.Category.NETWORK,
              shaka.util.Error.Code.BAD_HTTP_STATUS);
          var promise = Promise.reject(error);
          fakeNetEngine.request.and.returnValue(promise);

          return waitForManifestUpdate().then(function() {
            expect(errorCallback.calls.count()).toBe(1);
          });
        })
        .catch(fail)
        .then(done);
  });

  it('stop method stops updates', function(done) {
    var lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />'
    ];
    var manifest = makeSimpleLiveManifestText(lines, updateTime);

    setNetEngineReturnValue(manifest);
    parser.start('')
        .then(function(manifest) {
          expect(fakeNetEngine.request.calls.count()).toBe(1);

          parser.stop();
          return waitForManifestUpdate().then(function() {
            expect(fakeNetEngine.request.calls.count()).toBe(1);
          });
        })
        .catch(fail)
        .then(done);
  });

  it('uses @minimumUpdatePeriod', function(done) {
    var lines = [
      '<SegmentTemplate startNumber="1" media="s$Number$.mp4" duration="2" />'
    ];
    // updateTime parameter sets @minimumUpdatePeriod in the manifest.
    var manifest = makeSimpleLiveManifestText(lines, updateTime);

    setNetEngineReturnValue(manifest);
    parser.start('')
        .then(function(manifest) {
          expect(fakeNetEngine.request.calls.count()).toBe(1);
          expect(manifest).toBeTruthy();

          var partialTime = updateTime * 1000 * 3 / 4;
          var remainingTime = updateTime * 1000 - partialTime;
          jasmine.clock().tick(partialTime);
          return delay(0.01, realTimeout)
              .then(function() {
                // Update period has not passed yet.
                expect(fakeNetEngine.request.calls.count()).toBe(1);
                jasmine.clock().tick(remainingTime);
                return delay(0.01, realTimeout);
              })
              .then(function() {
                // Update period has passed.
                expect(fakeNetEngine.request.calls.count()).toBe(2);
              });
        })
        .catch(fail)
        .then(done);
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
      makeReference('s1.mp4', 1, 0, 10),
      makeReference('s2.mp4', 2, 10, 15),
      makeReference('s3.mp4', 3, 15, 30)
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
      makeReference('s1.mp4', 1, 0, 10),
      makeReference('s2.mp4', 2, 10, 15),
      makeReference('s3.mp4', 3, 15, 30),
      makeReference('s4.mp4', 4, 30, 40)
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
      makeReference('s1.mp4', 1, 0, 10),
      makeReference('s2.mp4', 2, 10, 15),
      makeReference('s3.mp4', 3, 15, 30)
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
      makeReference('s1.mp4', 1, 0, 10),
      makeReference('s2.mp4', 2, 10, 15),
      makeReference('s3.mp4', 3, 15, 30),
      makeReference('s4.mp4', 4, 30, 40)
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
      makeReference('s1.mp4', 1, 0, 10),
      makeReference('s2.mp4', 2, 10, 20),
      makeReference('s3.mp4', 3, 20, 30)
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
      makeReference('s1.mp4', 1, 0, 10),
      makeReference('s2.mp4', 2, 10, 20),
      makeReference('s3.mp4', 3, 20, 30),
      makeReference('s4.mp4', 4, 30, 40)
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

