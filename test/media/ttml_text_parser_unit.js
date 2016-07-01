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

describe('TtmlTextParser', function() {
  var mockCue = false;

  beforeAll(function() {
    // Mock out VTTCue if not supported.  These tests don't actually need
    // VTTCue to do anything, this simply verifies the value of its members.
    if (!window.VTTCue) {
      mockCue = true;
      window.VTTCue = function(start, end, text) {
        this.startTime = start;
        this.endTime = end;
        this.text = text;
      };
    }
  });

  afterAll(function() {
    // Delete our mock.
    if (mockCue) {
      delete window.VTTCue;
    }
  });

  it('supports no cues', function() {
    verifyHelper([], '<tt></tt>');
  });

  it('rejects invalid ttml', function() {
    errorHelper(shaka.util.Error.Code.INVALID_TTML, '<test></test>');
    errorHelper(shaka.util.Error.Code.INVALID_TTML, '');
  });

  it('rejects invalid time format', function() {
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                '<tt><body><p begin="test" end="test"></p></body></tt>');
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                '<tt><body><p begin="3.45" end="1a"></p></body></tt>');
  });

  it('supports colon formatted time', function() {
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test'}
        ],
        '<tt><body><p begin="01:02.05" ' +
        'end="01:02:03.200">Test</p></body></tt>');
  });

  it('supports time in 0.00h 0.00m 0.00s format', function() {
    verifyHelper(
        [
          {start: 3567, end: 5402.3, text: 'Test'}
        ],
        '<tt><body><p begin="59.45m" ' +
        'end="1.5h2.3s">Test</p></body></tt>');
  });

  it('supports time with frame rate', function() {
    verifyHelper(
        [
          {start: 615.05, end: 662.103, text: 'Test'}
        ],
        '<tt xmlns:ttp="ttml#parameter" ' +
        'ttp:frameRate="10"> ' +
        '<body>' +
        '<p begin="00:10:15:05" end="00:11:02:10.3">Test</p>' +
        '</body>' +
        '</tt>');
  });

  it('error on no time frame provided for frame-formatted time', function() {
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
        '<tt><body><p begin="00:10:15:05" end="00:11:02:10.3">Test</p>' +
        '</body></tt>');
  });

  it('parses alignment from textAlign attribute of a region', function() {
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test', lineAlign: 'start'}
        ],
        '<tt xmlns:tts="ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:textAlign="start" />' +
        '</layout>' +
        '<body region="subtitleArea">' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</body>' +
        '</tt>');
  });

  it('parses alignment from <style> block', function() {
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test', lineAlign: 'end'}
        ],
        '<tt xmlns:tts="ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:textAlign="end"/>' +
        '</styling>' +
        '<layout xmlns:tts="ttml#styling">' +
        '<region xml:id="subtitleArea" style="s1" />' +
        '</layout>' +
        '<body region="subtitleArea">' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</body>' +
        '</tt>');
  });


  function verifyHelper(cues, string) {
    var data = shaka.util.StringUtils.toUTF8(string);
    var result = shaka.media.TtmlTextParser(data);
    expect(result).toBeTruthy();
    expect(result.length).toBe(cues.length);
    for (var i = 0; i < cues.length; i++) {
      expect(result[i].startTime).toBe(cues[i].start);
      expect(result[i].endTime).toBe(cues[i].end);
      expect(result[i].text).toBe(cues[i].text);

      if (cues[i].lineAlign)
        expect(result[i].lineAlign).toBe(cues[i].lineAlign);
    }
  }

  function errorHelper(code, string) {
    var error = new shaka.util.Error(shaka.util.Error.Category.TEXT, code);
    var data = shaka.util.StringUtils.toUTF8(string);
    try {
      shaka.media.TtmlTextParser(data);
      fail('Invalid TTML file supported');
    } catch (e) {
      shaka.test.Util.expectToEqualError(e, error);
    }
  }
});
