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
  var originalCueConstructor;

  beforeAll(function() {
    originalCueConstructor = shaka.media.TextEngine.CueConstructor;
  });

  afterAll(function() {
    shaka.media.TextEngine.CueConstructor = originalCueConstructor;
  });

  beforeEach(function() {
    shaka.media.TextEngine.CueConstructor = function(start, end, text) {
      this.startTime = start;
      this.endTime = end;
      this.text = text;
    };
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

  it('accounts for offset', function() {
    verifyHelper(
        [
          {start: 69.05, end: 3730.2, text: 'Test'}
        ],
        '<tt><body><p begin="01:02.05" ' +
        'end="01:02:03.200">Test</p></body></tt>',
        /* offset */ 7);
  });

  it('supports time in 0.00h 0.00m 0.00s format', function() {
    verifyHelper(
        [
          {start: 3567.03, end: 5402.3, text: 'Test'}
        ],
        '<tt><body><p begin="59.45m30ms" ' +
        'end="1.5h2.3s">Test</p></body></tt>');
  });

  it('supports time with frame rate', function() {
    verifyHelper(
        [
          {start: 615.5, end: 663, text: 'Test'}
        ],
        '<tt xmlns:ttp="ttml#parameter" ' +
        'ttp:frameRate="30"> ' +
        '<body>' +
        '<p begin="00:10:15:15" end="00:11:02:30">Test</p>' +
        '</body>' +
        '</tt>');
  });

  it('supports time with frame rate multiplier', function() {
    verifyHelper(
        [
          {start: 615.5, end: 663, text: 'Test'}
        ],
        '<tt xmlns:ttp="ttml#parameter" ' +
        'ttp:frameRate="60" ' +
        'ttp:frameRateMultiplier="1 2"> ' +
        '<body>' +
        '<p begin="00:10:15:15" end="00:11:02:30">Test</p>' +
        '</body>' +
        '</tt>');
  });

  it('supports time with subframes', function() {
    verifyHelper(
        [
          {start: 615.517, end: 663, text: 'Test'}
        ],
        '<tt xmlns:ttp="ttml#parameter" ' +
        'ttp:frameRate="30" ' +
        'ttp:subFrameRate="2"> ' +
        '<body>' +
        '<p begin="00:10:15:15.1" end="00:11:02:29.2">Test</p>' +
        '</body>' +
        '</tt>');
  });

  it('supports time in frame format', function() {
    verifyHelper(
        [
          {start: 2.5, end: 10.01, text: 'Test'}
        ],
        '<tt xmlns:ttp="ttml#parameter" ' +
        'ttp:frameRate="60" ' +
        'ttp:frameRateMultiplier="1 2">' +
        '<body>' +
        '<p begin="75f" end="300.3f">Test</p>' +
        '</body>' +
        '</tt>');
  });

  it('supports time in tick format', function() {
    verifyHelper(
        [
          {start: 5, end: 6.02, text: 'Test'}
        ],
        '<tt xmlns:ttp="ttml#parameter" ' +
        'ttp:frameRate="60" ' +
        'ttp:tickRate="10">' +
        '<body>' +
        '<p begin="50t" end="60.2t">Test</p>' +
        '</body>' +
        '</tt>');
  });

  it('supports time with duration', function() {
    verifyHelper(
        [
          {start: 62.05, end: 67.05, text: 'Test'}
        ],
        '<tt><body><p begin="01:02.05" ' +
        'dur="5s">Test</p></body></tt>');
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

  it('parses alignment from <style> block with id on region', function() {
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

  it('parses alignment from <style> block with id on p', function() {
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test', lineAlign: 'end'}
        ],
        '<tt xmlns:tts="ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:textAlign="end"/>' +
        '</styling>' +
        '<layout xmlns:tts="ttml#styling">' +
        '<region xml:id="subtitleArea" />' +
        '</layout>' +
        '<body region="subtitleArea">' +
        '<p begin="01:02.05" end="01:02:03.200" style="s1">Test</p>' +
        '</body>' +
        '</tt>');
  });

  it('supports size setting', function() {
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test', size: 50}
        ],
        '<tt xmlns:tts="ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:extent="50% 16%" />' +
        '</layout>' +
        '<body region="subtitleArea">' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</body>' +
        '</tt>');
  });

  it('supports line and position settings for horizontal text',
     function() {
       verifyHelper(
           [
             {start: 62.05, end: 3723.2, text: 'Test', position: 50, line: 16}
           ],
           '<tt xmlns:tts="ttml#styling">' +
           '<layout>' +
           '<region xml:id="subtitleArea" tts:origin="50% 16%"/>' +
           '</layout>' +
           '<body region="subtitleArea">' +
           '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
           '</body>' +
           '</tt>');
       verifyHelper(
           [
             {start: 62.05, end: 3723.2, text: 'Test', position: 50, line: 16}
           ],
           '<tt xmlns:tts="ttml#styling">' +
           '<layout>' +
           '<region xml:id="subtitleArea" tts:origin="50% 16%" ' +
           'tts:writingMode="lrtb" />' +
           '</layout>' +
           '<body region="subtitleArea">' +
           '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
           '</body>' +
           '</tt>');
       verifyHelper(
           [
             {start: 62.05, end: 3723.2, text: 'Test', position: 50, line: 16}
           ],
           '<tt xmlns:tts="ttml#styling">' +
           '<layout>' +
           '<region xml:id="subtitleArea" tts:origin="50% 16%" ' +
           'tts:writingMode="lr" />' +
           '</layout>' +
           '<body region="subtitleArea">' +
           '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
           '</body>' +
           '</tt>');
      });

  it('supports line and position settings for vertical text',
     function() {
       verifyHelper(
           [
             {start: 62.05, end: 3723.2, text: 'Test', position: 16, line: 50}
           ],
           '<tt xmlns:tts="ttml#styling">' +
           '<layout>' +
           '<region xml:id="subtitleArea" tts:origin="50% 16%" ' +
           'tts:writingMode="tb" />' +
           '</layout>' +
           '<body region="subtitleArea">' +
           '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
           '</body>' +
           '</tt>');
       verifyHelper(
           [
             {start: 62.05, end: 3723.2, text: 'Test', position: 16, line: 50}
           ],
           '<tt xmlns:tts="ttml#styling">' +
           '<layout>' +
           '<region xml:id="subtitleArea" tts:origin="50% 16%" ' +
           'tts:writingMode="tblr" />' +
           '</layout>' +
           '<body region="subtitleArea">' +
           '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
           '</body>' +
           '</tt>');
       verifyHelper(
           [
             {start: 62.05, end: 3723.2, text: 'Test', position: 16, line: 50}
           ],
           '<tt xmlns:tts="ttml#styling">' +
           '<layout>' +
           '<region xml:id="subtitleArea" tts:origin="50% 16%" ' +
           'tts:writingMode="tbrl" />' +
           '</layout>' +
           '<body region="subtitleArea">' +
           '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
           '</body>' +
           '</tt>');
      });

  it('supports vertical setting', function() {
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test', vertical: 'lr'}
        ],
        '<tt xmlns:tts="ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" ' +
        'tts:writingMode="tb" />' +
        '</layout>' +
        '<body region="subtitleArea">' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</body>' +
        '</tt>');
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test', vertical: 'rl'}
        ],
        '<tt xmlns:tts="ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" ' +
        'tts:writingMode="tbrl" />' +
        '</layout>' +
        '<body region="subtitleArea">' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</body>' +
        '</tt>');
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test', vertical: 'lr'}
        ],
        '<tt xmlns:tts="ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" ' +
        'tts:writingMode="tblr" />' +
        '</layout>' +
        '<body region="subtitleArea">' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</body>' +
        '</tt>');
  });

  it('disregards empty divs and ps', function() {
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test'}
        ],
        '<tt>' +
        '<body>' +
        '<div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div>' +
        '<div></div>' +
        '</body>' +
        '</tt>');
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test'}
        ],
        '<tt>' +
        '<body>' +
        '<div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '<p></p>' +
        '</div>' +
        '</body>' +
        '</tt>');
    verifyHelper(
        [],
        '<tt>' +
        '<body>' +
        '<div>' +
        '<p></p>' +
        '</div>' +
        '<div></div>' +
        '</body>' +
        '</tt>');
  });

  it('inserts newline characters into <br> tags', function() {
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Line1\nLine2'}
        ],
        '<tt><body><p begin="01:02.05" ' +
        'end="01:02:03.200">Line1<br/>Line2</p></body></tt>');
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Line1\nLine2'}
        ],
        '<tt><body><p begin="01:02.05" ' +
        'end="01:02:03.200"><span>Line1<br/>Line2</span></p></body></tt>');
  });

  it('parses cue alignment from textAlign attribute', function() {
    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test', lineAlign: 'start',
            align: 'left', positionAlign: 'line-left'}
        ],
        '<tt xmlns:tts="ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:textAlign="left"/>' +
        '</styling>' +
        '<layout xmlns:tts="ttml#styling">' +
        '<region xml:id="subtitleArea" />' +
        '</layout>' +
        '<body region="subtitleArea">' +
        '<p begin="01:02.05" end="01:02:03.200" style="s1">Test</p>' +
        '</body>' +
        '</tt>');
  });


  it('uses a workaround for browsers not supporting align=center', function() {

    shaka.media.TextEngine.CueConstructor = function(start, end, text) {
      var align = 'middle';
      Object.defineProperty(this, 'align', {
        get: function() { return align; },
        set: function(newValue) { if (newValue != 'center') align = newValue; }
      });
      this.startTime = start;
      this.endTime = end;
      this.text = text;
    };


    verifyHelper(
        [
          {start: 62.05, end: 3723.2, text: 'Test', lineAlign: 'center',
            align: 'middle', position: 'auto', positionAlign: 'center'}
        ],
        '<tt xmlns:tts="ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:textAlign="center"/>' +
        '</styling>' +
        '<layout xmlns:tts="ttml#styling">' +
        '<region xml:id="subtitleArea" />' +
        '</layout>' +
        '<body region="subtitleArea">' +
        '<p begin="01:02.05" end="01:02:03.200" style="s1">Test</p>' +
        '</body>' +
        '</tt>');
  });


  /**
   * @param {!Array} cues
   * @param {string} text
   * @param {number=} opt_offset
   */
  function verifyHelper(cues, text, opt_offset) {
    var data = shaka.util.StringUtils.toUTF8(text);
    // Last two parameters are only used by mp4 vtt parser.
    var result =
        shaka.media.TtmlTextParser(data, opt_offset || 0, null, null, false);
    expect(result).toBeTruthy();
    expect(result.length).toBe(cues.length);
    for (var i = 0; i < cues.length; i++) {
      expect(result[i].startTime).toBeCloseTo(cues[i].start, 3);
      expect(result[i].endTime).toBeCloseTo(cues[i].end, 3);
      expect(result[i].text).toBe(cues[i].text);

      if (cues[i].align)
        expect(result[i].align).toBe(cues[i].align);
      if (cues[i].lineAlign)
        expect(result[i].lineAlign).toBe(cues[i].lineAlign);
      if (cues[i].positionAlign)
        expect(result[i].positionAlign).toBe(cues[i].positionAlign);
      if (cues[i].size)
        expect(result[i].size).toBe(cues[i].size);
      if (cues[i].line)
        expect(result[i].line).toBe(cues[i].line);
      if (cues[i].position)
        expect(result[i].position).toBe(cues[i].position);
      if (cues[i].vertical)
        expect(result[i].vertical).toBe(cues[i].vertical);
    }
  }

  /**
   * @param {shaka.util.Error.Code} code
   * @param {string} text
   */
  function errorHelper(code, text) {
    var error = new shaka.util.Error(shaka.util.Error.Category.TEXT, code);
    var data = shaka.util.StringUtils.toUTF8(text);
    try {
      shaka.media.TtmlTextParser(data, 0, null, null, false);
      fail('Invalid TTML file supported');
    } catch (e) {
      shaka.test.Util.expectToEqualError(e, error);
    }
  }
});
