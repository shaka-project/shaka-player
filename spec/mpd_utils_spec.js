/**
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
 *
 * @fileoverview mpd_utils.js unit tests.
 */

goog.require('shaka.dash.MpdUtils');
goog.require('shaka.dash.mpd');

describe('MpdUtils', function() {
  // Alias.
  var MpdUtils = shaka.dash.MpdUtils;

  beforeAll(function() {
    // Hijack assertions and convert failed assertions into failed tests.
    assertsToFailures.install();
  });

  afterAll(function() {
    assertsToFailures.uninstall();
  });

  describe('fillUrlTemplate', function() {
    it('handles a single RepresentationID identifier', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID$.mp4',
              100, null, null, null).toString()).toBe('/example/100.mp4');

      // RepresentationID cannot use a width specifier.
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID%01d$.mp4',
              100, null, null, null).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$RepresentationID$.mp4');
    });

    it('handles a single Number identifier', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Number$.mp4',
              null, 100, null, null).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Number%05d$.mp4',
              null, 100, null, null).toString()).toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Number$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Number$.mp4');
    });

    it('handles a single Bandwidth identifier', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Bandwidth$.mp4',
              null, null, 100, null).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Bandwidth%05d$.mp4',
              null, null, 100, null).toString()).toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Bandwidth$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Bandwidth$.mp4');
    });

    it('handles a single Time identifier', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Time$.mp4',
              null, null, null, 100).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Time%05d$.mp4',
              null, null, null, 100).toString()).toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Time$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Time$.mp4');
    });

    it('handles multiple identifiers', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID$_$Number$_$Bandwidth$_$Time$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/1_2_3_4.mp4');

      // No spaces.
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID$$Number$$Bandwidth$$Time$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/1234.mp4');

      // Different order.
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Bandwidth$_$Time$_$RepresentationID$_$Number$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/3_4_1_2.mp4');

      // Single width.
      expect(
          MpdUtils.fillUrlTemplate(
              '$RepresentationID$_$Number%01d$_$Bandwidth%01d$_$Time%01d$',
              1, 2, 3, 400).toString()).toBe('1_2_3_400');

      // Different widths.
      expect(
          MpdUtils.fillUrlTemplate(
              '$RepresentationID$_$Number%02d$_$Bandwidth%02d$_$Time%02d$',
              1, 2, 3, 4).toString()).toBe('1_02_03_04');

      // Double $$.
      expect(
          MpdUtils.fillUrlTemplate(
              '$$/$RepresentationID$$$$Number$$$$Bandwidth$$$$Time$$$.$$',
              1, 2, 3, 4).toString()).toBe('$/1$2$3$4$.$');
    });

    it('handles invalid identifiers', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Garbage$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/$Garbage$.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID%$',
              1, 2, 3, 4)).toBeNull();
    });

    it('handles partial identifiers', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Time.mp4',
              1, 2, 3, 4).toString()).toBe('/example/$Time.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Time%.mp4',
              1, 2, 3, 4)).toBeNull();
    });
  });
});

