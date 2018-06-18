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

describe('DashParser SegmentBase', function() {
  const Dash = shaka.test.Dash;

  const indexSegmentUri = '/base/test/test/assets/index-segment.mp4';

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.dash.DashParser} */
  let parser;
  /** @type {shakaExtern.ManifestParser.PlayerInterface} */
  let playerInterface;
  /** @type {ArrayBuffer} */
  let indexSegment;

  beforeAll(function(done) {
    shaka.test.Util.fetch(indexSegmentUri).then(function(data) {
      indexSegment = data;
    }).catch(fail).then(done);
  });

  beforeEach(function() {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = shaka.test.Dash.makeDashParser();

    playerInterface = {
      networkingEngine: fakeNetEngine,
      filterNewPeriod: function() {},
      filterAllPeriods: function() {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: fail,
      onError: fail
    };
  });

  it('requests init data for WebM', function(done) {
    let source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <AdaptationSet mimeType="video/webm">',
      '      <Representation bandwidth="1">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentBase indexRange="100-200" timescale="9000">',
      '          <Initialization sourceURL="init.webm" range="201-300" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com': '',
      'http://example.com/init.webm': ''
    });
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest).toEqual(
              Dash.makeManifestFromInit('init.webm', 201, 300));
          return Dash.callCreateSegmentIndex(manifest);
        })
        .then(function() {
          expect(fakeNetEngine.request.calls.count()).toBe(3);
          fakeNetEngine.expectRangeRequest('http://example.com', 100, 200);
          fakeNetEngine.expectRangeRequest(
              'http://example.com/init.webm', 201, 300);
        })
        .catch(fail)
        .then(done);
  });

  it('inherits from Period', function(done) {
    let source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentBase indexRange="100-200" timescale="9000">',
      '      <Initialization sourceURL="init.mp4" range="201-300" />',
      '    </SegmentBase>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com': ''
    });
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest).toEqual(
              Dash.makeManifestFromInit('init.mp4', 201, 300));
          return Dash.callCreateSegmentIndex(manifest);
        })
        .then(function() {
          expect(fakeNetEngine.request.calls.count()).toBe(2);
          fakeNetEngine.expectRangeRequest('http://example.com', 100, 200);
        })
        .catch(fail)
        .then(done);
  });

  it('inherits from AdaptationSet', function(done) {
    let source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <BaseURL>http://example.com</BaseURL>',
      '      <SegmentBase indexRange="100-200" timescale="9000">',
      '        <Initialization sourceURL="init.mp4" range="201-300" />',
      '      </SegmentBase>',
      '      <Representation bandwidth="1" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com': ''
    });
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest).toEqual(
              Dash.makeManifestFromInit('init.mp4', 201, 300));
          return Dash.callCreateSegmentIndex(manifest);
        })
        .then(function() {
          expect(fakeNetEngine.request.calls.count()).toBe(2);
          fakeNetEngine.expectRangeRequest('http://example.com', 100, 200);
        })
        .catch(fail)
        .then(done);
  });

  it('does not require sourceURL in Initialization', function(done) {
    let source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <BaseURL>http://example.com/stream.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" timescale="9000">',
      '          <Initialization range="201-300" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com/stream.mp4': ''
    });
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest).toEqual(
              Dash.makeManifestFromInit('stream.mp4', 201, 300));
          return Dash.callCreateSegmentIndex(manifest);
        })
        .then(function() {
          expect(fakeNetEngine.request.calls.count()).toBe(2);
          fakeNetEngine.expectRangeRequest(
              'http://example.com/stream.mp4', 100, 200);
        })
        .catch(fail)
        .then(done);
  });

  it('merges across levels', function(done) {
    let source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentBase timescale="9000">',
      '      <Initialization sourceURL="init.mp4" range="201-300" />',
      '    </SegmentBase>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <SegmentBase presentationTimeOffset="90000">',
      '        <Initialization sourceURL="init.mp4" range="201-300" />',
      '      </SegmentBase>',
      '      <Representation bandwidth="1">',
      '        <SegmentBase>',
      '          <RepresentationIndex sourceURL="index.mp4" range="5-2000" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com/index.mp4': ''
    });
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest).toEqual(
              Dash.makeManifestFromInit('init.mp4', 201, 300, 10));
          return Dash.callCreateSegmentIndex(manifest);
        })
        .then(function() {
          expect(fakeNetEngine.request.calls.count()).toBe(2);
          fakeNetEngine.expectRangeRequest(
              'http://example.com/index.mp4', 5, 2000);
        })
        .catch(fail)
        .then(done);
  });

  it('merges and overrides across levels', function(done) {
    let source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentBase indexRange="0-10" timescale="9000">',
      '      <Initialization sourceURL="init.mp4" range="201-300" />',
      '    </SegmentBase>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <SegmentBase timescale="10" presentationTimeOffset="10">',
      '        <Initialization sourceURL="special.mp4" />',
      '      </SegmentBase>',
      '      <Representation bandwidth="1">',
      '        <SegmentBase indexRange="30-900" ',
      '                     presentationTimeOffset="200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com': ''
    });
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest).toEqual(
              Dash.makeManifestFromInit('special.mp4', 0, null, 20));
          return Dash.callCreateSegmentIndex(manifest);
        })
        .then(function() {
          expect(fakeNetEngine.request.calls.count()).toBe(2);
          fakeNetEngine.expectRangeRequest('http://example.com', 30, 900);
        })
        .catch(fail)
        .then(done);
  });

  it('does not assume the same timescale as media', async () => {
    let source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <BaseURL>http://example.com/index.mp4</BaseURL>',
      '        <SegmentBase indexRange="30-900" ',
      '                     timescale="1000"',
      '                     presentationTimeOffset="2000" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseMap({
      'dummy://foo': shaka.util.StringUtils.toUTF8(source),
      'http://example.com/index.mp4': indexSegment
    });

    let manifest = await parser.start('dummy://foo', playerInterface);
    let video = manifest.periods[0].variants[0].video;
    await video.createSegmentIndex();  // real data, should succeed

    let reference = video.getSegmentReference(0);
    expect(reference.startTime).toEqual(-2);
    expect(reference.endTime).toEqual(10);  // would be 12 without PTO
  });

  describe('fails for', function() {
    it('unsupported container', function(done) {
      let source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/cat">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="30-900" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_UNSUPPORTED_CONTAINER);
      Dash.testFails(done, source, error);
    });

    it('missing init segment for WebM', function(done) {
      let source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="30-900" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_WEBM_MISSING_INIT);
      Dash.testFails(done, source, error);
    });

    it('no @indexRange nor RepresentationIndex', function(done) {
      let source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase>',
        '          <Initialization sourceURL="test.webm" />',
        '        </SegmentBase>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      Dash.testFails(done, source, error);
    });
  });
});
