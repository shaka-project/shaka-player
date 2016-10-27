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

describe('DashParser.SegmentBase', function() {
  var Dash;
  var fakeNetEngine;
  var parser;
  var filterPeriod = function() {};

  beforeAll(function() {
    Dash = shaka.test.Dash;
  });

  beforeEach(function() {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = shaka.test.Dash.makeDashParser();
  });

  it('requests init data for WebM', function(done) {
    var source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <AdaptationSet mimeType="video/webm">',
      '      <Representation>',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentBase indexRange="100-200" timescale="9000">',
      '          <Initialization sourceURL="init.webm" range="201-300" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com': '',
      'http://example.com/init.webm': ''
    });
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
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
    var source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentBase indexRange="100-200" timescale="9000">',
      '      <Initialization sourceURL="init.mp4" range="201-300" />',
      '    </SegmentBase>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com': ''
    });
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
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
    var source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <BaseURL>http://example.com</BaseURL>',
      '      <SegmentBase indexRange="100-200" timescale="9000">',
      '        <Initialization sourceURL="init.mp4" range="201-300" />',
      '      </SegmentBase>',
      '      <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com': ''
    });
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
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
    var source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation>',
      '        <BaseURL>http://example.com/stream.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" timescale="9000">',
      '          <Initialization range="201-300" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com/stream.mp4': ''
    });
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
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
    var source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentBase timescale="9000">',
      '      <Initialization sourceURL="init.mp4" range="201-300" />',
      '    </SegmentBase>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <SegmentBase presentationTimeOffset="10">',
      '        <Initialization sourceURL="init.mp4" range="201-300" />',
      '      </SegmentBase>',
      '      <Representation>',
      '        <SegmentBase>',
      '          <RepresentationIndex sourceURL="index.mp4" range="5-2000" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com/index.mp4': ''
    });
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
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
    var source = [
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
      '      <Representation>',
      '        <SegmentBase indexRange="30-900" presentationTimeOffset="20" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    fakeNetEngine.setResponseMapAsText({
      'dummy://foo': source,
      'http://example.com': ''
    });
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
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

  describe('fails for', function() {
    it('unsupported container', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/cat">',
        '      <Representation>',
        '        <SegmentBase indexRange="30-900" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_UNSUPPORTED_CONTAINER);
      Dash.testFails(done, source, error);
    });

    it('missing init segment for WebM', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation>',
        '        <SegmentBase indexRange="30-900" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_WEBM_MISSING_INIT);
      Dash.testFails(done, source, error);
    });

    it('no @indexRange nor RepresentationIndex', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation>',
        '        <SegmentBase>',
        '          <Initialization sourceURL="test.webm" />',
        '        </SegmentBase>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      Dash.testFails(done, source, error);
    });
  });
});
