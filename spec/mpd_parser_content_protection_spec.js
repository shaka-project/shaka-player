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

goog.require('shaka.dash.mpd');

describe('mpd.ContentProtection', function() {
  it('inherits ContentProtection from AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <AdaptationSet>',
      '     <ContentProtection schemeIdUri="http://example.com" />',
      '     <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkContentProtection(source, 'http://example.com');
  });

  it('overrides ContentProtection from AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <AdaptationSet>',
      '      <ContentProtection schemeIdUri="http://example.com" />',
      '      <Representation>',
      '        <ContentProtection schemeIdUri="http://google.com" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkContentProtection(source, 'http://google.com');
  });

  it('ignores ContentProtection from Period', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <ContentProtection schemeIdUri="http://example.com" />',
      '    <AdaptationSet>',
      '     <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    var mpd = shaka.dash.mpd.parseMpd(source, createFailover('').urls);
    var period = mpd.periods[0];
    var adaptationSet = period.adaptationSets[0];
    var representation = adaptationSet.representations[0];
    expect(representation.contentProtections.length).toBe(0);
  });

  /**
   * Checks that the first Representation in |source| contains a
   * ContentProtection with the given |schemeIdUri|.
   * @param {string} source
   * @param {string} schemeIdUri
   */
  var checkContentProtection = function(source, schemeIdUri) {
    var mpd = shaka.dash.mpd.parseMpd(source, createFailover('').urls);
    expect(mpd).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var period = mpd.periods[0];
    expect(period).toBeTruthy();
    expect(period.adaptationSets.length).toBe(1);

    var adaptationSet = period.adaptationSets[0];
    expect(adaptationSet).toBeTruthy();
    expect(adaptationSet.representations.length).toBe(1);

    var representation = adaptationSet.representations[0];
    expect(representation).toBeTruthy();
    expect(representation.contentProtections.length).toBeTruthy();

    var foundMatch = false;
    for (var i = 0; i < representation.contentProtections.length; ++i) {
      var contentProtection = representation.contentProtections[i];
      expect(contentProtection).toBeTruthy();
      if (contentProtection.schemeIdUri == schemeIdUri) {
        foundMatch = true;
      }
    }
    expect(foundMatch).toBeTruthy();
  };

  it('parses cenc:default_KID attribute', function() {
    var source = [
      '<MPD xmlns:cenc="urn:mpeg:cenc:2013">',
      '  <Period>',
      '    <AdaptationSet>',
      '      <ContentProtection',
      '          schemeIdUri="http://example.com"',
      '          cenc:default_KID="21EC2020-3AEA-4069-A2DD-08002B30309D" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    var mpd = shaka.dash.mpd.parseMpd(source, createFailover('').urls);
    var period = mpd.periods[0];
    var adaptationSet = period.adaptationSets[0];
    expect(adaptationSet.contentProtections[0].defaultKeyId).toBe(
        '21EC20203AEA4069A2DD08002B30309D');
  });
});

