/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TtmlTextParser', () => {
  const Cue = shaka.text.Cue;
  const CueRegion = shaka.text.CueRegion;
  const Util = shaka.test.Util;
  const anyString = jasmine.any(String);

  it('supports no cues', () => {
    verifyHelper([],
        '<tt></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {});
  });

  it('supports empty text string', () => {
    verifyHelper([],
        '',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {});
  });

  it('supports div with no cues but whitespace', () => {
    verifyHelper(
        [],
        '<tt><body><div>  \r\n </div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {});
  });

  it('supports xml:space', () => {
    const ttBody =
        '<body><div>\n' +
        '  <p begin="01:02.03" end="01:02.05">\n' +
        '    <span> A    B   C  </span>\n' +
        '  </p>\n' +
        '</div></body>\n';

    // When xml:space="default", ignore whitespace outside tags.
    verifyHelper(
        [
          {
            startTime: 62.03,
            endTime: 62.05,
            nestedCues: [{
              payload: 'A B C',
              startTime: 62.03,
              endTime: 62.05,
            }],
            payload: '',
          },
        ],
        '<tt xml:space="default">' + ttBody + '</tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 70, vttOffset: 0},
        {startTime: 62.03, endTime: 62.05});
    // When xml:space="preserve", take them into account.
    verifyHelper(
        [
          {
            startTime: 62.03,
            endTime: 62.05,
            nestedCues: [{
              // anonymous span
              payload: '\n    ',
              startTime: 62.03,
              endTime: 62.05,
            }, {
              payload: ' A    B   C  ',
              startTime: 62.03,
              endTime: 62.05,
            }, {
              // anonymous span
              payload: '\n  ',
              startTime: 62.03,
              endTime: 62.05,
            }],
          },
        ],
        '<tt xml:space="preserve">' + ttBody + '</tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 70, vttOffset: 0},
        {startTime: 62.03, endTime: 62.05});
    // The default value for xml:space is "default".
    verifyHelper(
        [
          {
            startTime: 62.03,
            endTime: 62.05,
            nestedCues: [{
              payload: 'A B C',
              startTime: 62.03,
              endTime: 62.05,
            }],
          },
        ],
        '<tt>' + ttBody + '</tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 70, vttOffset: 0},
        {startTime: 62.03, endTime: 62.05});

    // Any other value is rejected as an error.
    errorHelper(shaka.util.Error.Code.INVALID_XML,
        '<tt xml:space="invalid">' + ttBody + '</tt>',
        jasmine.any(String));
  });

  it('supports xml:space overriding default at span level', () => {
    const ttBody = '\n' +
        '  <body><div>\n' +
        '    <p begin="01:02.03" end="01:02.05">\n' +
        '      <span xml:space="preserve"> A    B   C  </span>\n' +
        '    </p>\n' +
        '  </div></body>\n';

    // When xml:space="preserve", take them into account.
    verifyHelper(
        [
          {
            startTime: 62.03,
            endTime: 62.05,
            nestedCues: [{
              payload: ' A    B   C  ',
              startTime: 62.03,
              endTime: 62.05,
            }],
          },
        ],
        '<tt>' + ttBody + '</tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 70, vttOffset: 0},
        {startTime: 62.03, endTime: 62.05});
  });

  it('rejects invalid ttml', () => {
    errorHelper(shaka.util.Error.Code.INVALID_XML, '<test></test>', anyString);
  });

  it('rejects ttml with body>p instead of body>div', () => {
    errorHelper(
        shaka.util.Error.Code.INVALID_TEXT_CUE,
        '<tt><body><p></p></body></tt>',
        anyString);
  });

  it('rejects ttml with div>span instead of div>p', () => {
    errorHelper(
        shaka.util.Error.Code.INVALID_TEXT_CUE,
        '<tt><body><div><span></span></div></body></tt>',
        anyString);
  });

  it('rejects invalid time format', () => {
    const wrap = (ttmlCue) => {
      return `<tt><body><div>${ttmlCue}</div></body></tt>`;
    };

    errorHelper(
        shaka.util.Error.Code.INVALID_TEXT_CUE,
        wrap('<p begin="test" end="test">My very own cue</p>'),
        anyString);

    errorHelper(
        shaka.util.Error.Code.INVALID_TEXT_CUE,
        wrap('<p begin="3.45" end="1a">An invalid cue</p>'),
        anyString);
  });

  it('supports spans as nestedCues of paragraphs', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: '',
            nestedCues: [
              {
                payload: 'First cue',
                startTime: 62.05,
                endTime: 3723.2,
              },
              {
                payload: '',
                lineBreak: true,
                startTime: 62.05,
                endTime: 3723.2,
              },
              {
                payload: 'Second cue',
                startTime: 62.05,
                endTime: 3723.2,
              },
            ],
          },
        ],
        '<tt><body><div>' +
        '<p begin="01:02.05" end="01:02:03.200">' +
        '<span>First cue</span><br /><span>Second cue</span>' +
        '</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('supports anonymous spans as nestedCues of paragraphs', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: '',
            nestedCues: [
              {
                payload: 'First cue',
                startTime: 62.05,
                endTime: 3723.2,
              },
              {
                payload: '',
                lineBreak: true,
                startTime: 62.05,
                endTime: 3723.2,
              },
              {
                payload: 'Second cue',
                startTime: 62.05,
                endTime: 3723.2,
              },
            ],
          },
        ],
        '<tt><body><div>' +
        '<p begin="01:02.05" end="01:02:03.200">' +
        'First cue<br />Second cue' +
        '</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('supports multiple levels of nestedCues', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: '',
            color: 'black',
            // cues in p container.
            nestedCues: [
              // anonymous span in p container.
              {
                payload: 'First cue',
                startTime: 62.05,
                endTime: 3723.2,
              },
              // container for Second cue and Third cue.
              {
                payload: '',
                startTime: 62.05,
                endTime: 3723.2,
                color: 'blue',
                nestedCues: [
                  {
                    payload: 'Second cue',
                    startTime: 62.05,
                    endTime: 3723.2,
                    color: '',
                  },
                  {
                    payload: 'Third cue',
                    startTime: 62.05,
                    endTime: 3723.2,
                    color: 'green',
                  },
                ],
              },
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="black" tts:color="black" />' +
        '<style xml:id="blue" tts:color="blue" />' +
        '<style xml:id="green" tts:color="green" />' +
        '</styling>' +

        '<body><div>' +
        '<p begin="01:02.05" end="01:02:03.200" style="black">' +
        'First cue' +
        '<span style="blue">Second cue' +
        '<span style="green">Third cue</span>' +
        '</span>' +
        '</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('inherits timing information of nested cues if unprovided', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            nestedCues: [
              {startTime: 62.05, endTime: 3723.2, payload: 'Test'},
            ],
          },
        ],
        '<tt><body>' +
        '<div><p begin="01:02.05" end="01:02:03.200">' +
        '<span>Test</span></p></div>' +
        '</body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('does not discard cues with image subcues', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            nestedCues: [
              {
                startTime: 62.05,
                endTime: 3723.2,
                payload: '',
                backgroundImage: 'data:image/png;base64,base64EncodedImage',
              },
            ],
          },
        ],
        '<tt ' +
        'xmlns:ttm="http://www.w3.org/ns/ttml#metadata" ' +
        'xmlns:smpte="http://www.smpte-ra.org/schemas/2052-1/2010/smpte-tt">' +
        '<metadata>' +
        '<smpte:image imageType="PNG" encoding="Base64" xml:id="img_0">' +
        'base64EncodedImage</smpte:image>' +
        '</metadata><body><div>' +
        '<p><div begin="01:02.05" end="01:02:03.200" ' +
        'smpte:backgroundImage="#img_0"></div></p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('supports colon formatted time', () => {
    verifyHelper(
        [
          {startTime: 62.05, endTime: 3723.2, payload: 'Test'},
        ],
        '<tt><body><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('accounts for offset', () => {
    verifyHelper(
        [
          {startTime: 69.05, endTime: 3730.2, payload: 'Test'},
        ],
        '<tt><body><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 7, segmentStart: 60, segmentEnd: 3740, vttOffset: 0},
        {startTime: 69.05, endTime: 3730.2});
  });

  it('supports nested cues with an offset', () => {
    verifyHelper(
        [
          {
            startTime: 69.05,
            endTime: 3730.2,
            payload: '',
            nestedCues: [
              {
                payload: 'Nested cue',
                startTime: 69.05,
                endTime: 3730.2,
              },
            ],
          },
        ],
        '<tt><body><div>' +
        '<p begin="01:02.05" end="01:02:03.200"><span>Nested cue</span></p>' +
        '</div></body></tt>',
        {periodStart: 7, segmentStart: 60, segmentEnd: 3740, vttOffset: 0},
        {startTime: 69.05, endTime: 3730.2});
  });

  it('supports time in 0.00h 0.00m 0.00s format', () => {
    verifyHelper(
        [
          {startTime: 3567.03, endTime: 5402.3, payload: 'Test'},
        ],
        '<tt><body><div>' +
        '<p begin="59.45m30ms" end="1.5h2.3s">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 3560, segmentEnd: 5410, vttOffset: 0},
        {startTime: 3567.03, endTime: 5402.3});
  });

  it('supports time with frame rate', () => {
    verifyHelper(
        [
          {startTime: 615.5, endTime: 663, payload: 'Test'},
        ],
        '<tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ' +
        'ttp:frameRate="30"> ' +
        '<body><div>' +
        '<p begin="00:10:15:15" end="00:11:02:30">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 610, segmentEnd: 670, vttOffset: 0},
        {startTime: 615.5, endTime: 663});
  });

  it('supports time with frame rate multiplier', () => {
    verifyHelper(
        [
          {startTime: 615.5, endTime: 663, payload: 'Test'},
        ],
        '<tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ' +
        'ttp:frameRate="60" ttp:frameRateMultiplier="1 2"> ' +
        '<body><div>' +
        '<p begin="00:10:15:15" end="00:11:02:30">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 610, segmentEnd: 670, vttOffset: 0},
        {startTime: 615.5, endTime: 663});
  });

  it('supports time with subframes', () => {
    verifyHelper(
        [
          {
            startTime: Util.closeTo(615.5 + 1 / 60),
            endTime: 663,
            payload: 'Test',
          },
        ],
        '<tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ' +
        'ttp:frameRate="30" ttp:subFrameRate="2"> ' +
        '<body><div>' +
        '<p begin="00:10:15:15.1" end="00:11:02:29.2">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 610, segmentEnd: 670, vttOffset: 0},
        {startTime: Util.closeTo(615.5 + 1 / 60), endTime: 663});
  });

  it('supports time in frame format', () => {
    verifyHelper(
        [
          {startTime: 2.5, endTime: Util.closeTo(10.01), payload: 'Test'},
        ],
        '<tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ' +
        'ttp:frameRate="60" ttp:frameRateMultiplier="1 2">' +
        '<body><div>' +
        '<p begin="75f" end="300.3f">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 20, vttOffset: 0},
        {startTime: 2.5, endTime: Util.closeTo(10.01)});
  });

  it('supports time in tick format', () => {
    verifyHelper(
        [
          {startTime: 5, endTime: Util.closeTo(6.02), payload: 'Test'},
        ],
        '<tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ' +
        'ttp:frameRate="60" ttp:tickRate="10">' +
        '<body><div>' +
        '<p begin="50t" end="60.2t">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {startTime: 5, endTime: Util.closeTo(6.02)});
  });

  it('supports time with duration', () => {
    verifyHelper(
        [
          {startTime: 62.05, endTime: 67.05, payload: 'Test'},
        ],
        '<tt><body><div>' +
        '<p begin="01:02.05" dur="5s">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 70, vttOffset: 0},
        {startTime: 62.05, endTime: 67.05});
  });

  it('supports comments in the body', () => {
    verifyHelper(
        [],
        '<tt><body><div>' +
        '<!-- text-based TTML -->' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {});
  });

  it('does not inherit regions', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('parses alignment from textAlign attribute of a region', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            lineAlign: Cue.textAlign.START,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:textAlign="start" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('allows non-standard namespace names', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            lineAlign: Cue.textAlign.START,
          },
        ],
        '<tt xmlns:p1="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" p1:textAlign="start" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('parses alignment from <style> block with id on region', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            lineAlign: Cue.textAlign.END,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:textAlign="end"/>' +
        '</styling>' +
        '<layout>' +
        '<region xml:id="subtitleArea" style="s1" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('parses alignment from <style> block with id on p', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            lineAlign: Cue.textAlign.END,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:textAlign="end"/>' +
        '</styling>' +
        '<layout>' +
        '<region xml:id="subtitleArea" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200" style="s1">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('supports region settings for horizontal text', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:origin="50% 16%"/>' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 100,
            height: 100,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:origin="50% 16%" ' +
        'tts:writingMode="lrtb" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 100,
            height: 100,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:origin="50% 16%" ' +
        'tts:writingMode="lr" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 100,
            height: 100,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});
  });

  it('supports region settings in pixels (origin)', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:origin="50px 16px"/>' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            regionAnchorX: 0,
            regionAnchorY: 0,
            width: 100,
            height: 100,
            heightUnits: CueRegion.units.PERCENTAGE,
            widthUnits: CueRegion.units.PERCENTAGE,
            viewportAnchorUnits: CueRegion.units.PX,
            scroll: CueRegion.scrollMode.NONE,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});
  });

  it('supports region settings in pixels (extent)', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:extent="50px 16px"/>' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 0,
            viewportAnchorY: 0,
            regionAnchorX: 0,
            regionAnchorY: 0,
            width: 50,
            height: 16,
            heightUnits: CueRegion.units.PX,
            widthUnits: CueRegion.units.PX,
            viewportAnchorUnits: CueRegion.units.PERCENTAGE,
            scroll: CueRegion.scrollMode.NONE,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});
  });

  it('supports region settings in pixels: origin (with global extent)', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling" tts:extent="1920px 1080px">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:origin="192px 108px"/>' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 10,
            viewportAnchorY: 10,
            regionAnchorX: 0,
            regionAnchorY: 0,
            width: 100,
            height: 100,
            heightUnits: CueRegion.units.PERCENTAGE,
            widthUnits: CueRegion.units.PERCENTAGE,
            viewportAnchorUnits: CueRegion.units.PERCENTAGE,
            scroll: CueRegion.scrollMode.NONE,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});
  });

  it('supports region settings in pixels: extent (with global extent)', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling" tts:extent="1920px 1080px">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:extent="576px 324px" ' +
        'tts:writingMode="lrtb" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 0,
            viewportAnchorY: 0,
            regionAnchorX: 0,
            regionAnchorY: 0,
            width: 30,
            height: 30,
            heightUnits: CueRegion.units.PERCENTAGE,
            widthUnits: CueRegion.units.PERCENTAGE,
            viewportAnchorUnits: CueRegion.units.PERCENTAGE,
            scroll: CueRegion.scrollMode.NONE,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});
  });

  it('supports region settings in percentage (origin)', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling" ' +
        'tts:extent="1920px 1080px">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:origin="50% 16%"/>' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            regionAnchorX: 0,
            regionAnchorY: 0,
            width: 100,
            height: 100,
            heightUnits: CueRegion.units.PERCENTAGE,
            widthUnits: CueRegion.units.PERCENTAGE,
            viewportAnchorUnits: CueRegion.units.PERCENTAGE,
            scroll: CueRegion.scrollMode.NONE,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});
  });

  it('supports region settings in percentage (extent)', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling" ' +
        'tts:extent="1920px 1080px">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:extent="50% 16%" ' +
        'tts:writingMode="lrtb" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 0,
            viewportAnchorY: 0,
            regionAnchorX: 0,
            regionAnchorY: 0,
            width: 50,
            height: 16,
            heightUnits: CueRegion.units.PERCENTAGE,
            widthUnits: CueRegion.units.PERCENTAGE,
            viewportAnchorUnits: CueRegion.units.PERCENTAGE,
            scroll: CueRegion.scrollMode.NONE,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});
  });

  it('supports region settings for vertical text', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:origin="50% 16%" ' +
        'tts:writingMode="tb" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 100,
            height: 100,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:origin="50% 16%" ' +
        'tts:writingMode="tblr" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 100,
            height: 100,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:origin="50% 16%" ' +
        'tts:writingMode="tbrl" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 100,
            height: 100,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});
  });

  it('supports percentages containing decimals', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" tts:origin="12.2% 50.005%" ' +
        'tts:writingMode="tb" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 12.2,
            viewportAnchorY: 50.005,
            width: 100,
            height: 100,
          },
          startTime: 62.05,
          endTime: 3723.2,
        }, {startTime: 62.05, endTime: 3723.2});
  });

  it('supports writingMode setting', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" ' +
        'tts:writingMode="tb" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            writingMode: Cue.writingMode.VERTICAL_RIGHT_TO_LEFT,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" ' +
        'tts:writingMode="tbrl" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" ' +
        'tts:writingMode="tblr" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            direction: Cue.direction.HORIZONTAL_RIGHT_TO_LEFT,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" ' +
        'tts:direction="rtl" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            direction: Cue.direction.HORIZONTAL_LEFT_TO_RIGHT,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" ' +
        'tts:direction="rtl" tts:writingMode="lrtb"/>' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('supports textCombine setting', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            textCombineUpright: 'all',
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<layout>' +
        '<region xml:id="subtitleArea" ' +
        'tts:writingMode="tb" ' +
        'tts:textCombine="all"/>' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('disregards empty divs and ps', () => {
    verifyHelper(
        [
          {startTime: 62.05, endTime: 3723.2, payload: 'Test'},
        ],
        '<tt>' +
        '<body>' +
        '<div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div>' +
        '<div></div>' +
        '</body>' +
        '</tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [
          {startTime: 62.05, endTime: 3723.2, payload: 'Test'},
        ],
        '<tt>' +
        '<body>' +
        '<div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '<p></p>' +
        '</div>' +
        '</body>' +
        '</tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [],
        '<tt>' +
        '<body>' +
        '<div>' +
        '<p></p>' +
        '</div>' +
        '<div></div>' +
        '</body>' +
        '</tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {});
  });

  it('should let empty paragraphs with begin or end attributes through', () => {
    verifyHelper(
        [
          {startTime: 62.05, endTime: 3723.2, payload: ''},
        ],
        '<tt>' +
        '<body>' +
        '<div>' +
        '<p begin="01:02.05" end="01:02:03.200" />' +
        '<p></p>' +
        '</div>' +
        '</body>' +
        '</tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('supports smpte:backgroundImage attribute', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: '',
          },
        ],
        '<tt ' +
        'xmlns:ttm="http://www.w3.org/ns/ttml#metadata" ' +
        'xmlns:smpte="http://www.smpte-ra.org/schemas/2052-1/2010/smpte-tt">' +
        '<metadata>' +
        '<smpte:image imageType="PNG" encoding="Base64" xml:id="img_0">' +
        'base64EncodedImage</smpte:image>' +
        '</metadata>' +
        '<body><div smpte:backgroundImage="#img_0">' +
        '<p begin="01:02.05" end="01:02:03.200"></p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2},
        {
          startTime: 62.05,
          endTime: 3723.2,
          backgroundImage: 'data:image/png;base64,base64EncodedImage',
          isContainer: false,
        });
  });

  it('supports smpte:backgroundImage attribute with url', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: '',
          },
        ],
        '<tt ' +
        'xmlns:ttm="http://www.w3.org/ns/ttml#metadata" ' +
        'xmlns:smpte="http://www.smpte-ra.org/schemas/2052-1/2010/smpte-tt">' +
        '<metadata>' +
        '<smpte:image imageType="PNG" encoding="Base64" xml:id="img_0">' +
        'base64EncodedImage</smpte:image>' +
        '</metadata>' +
        '<body><div smpte:backgroundImage="img_0.png">' +
        '<p begin="01:02.05" end="01:02:03.200"></p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2},
        {
          startTime: 62.05,
          endTime: 3723.2,
          backgroundImage: 'foo://bar/img_0.png',
          isContainer: false,
        });
  });

  it('supports smpte:backgroundImage attribute in div element', () => {
    verifyHelper(
        [],
        '<tt ' +
        'xmlns:ttm="http://www.w3.org/ns/ttml#metadata" ' +
        'xmlns:smpte="http://www.smpte-ra.org/schemas/2052-1/2010/smpte-tt">' +
        '<metadata>' +
        '<smpte:image imageType="PNG" encoding="Base64" xml:id="img_0">' +
        'base64EncodedImage</smpte:image>' +
        '</metadata>' +
        '<body><div begin="00:00.00" end="01:02.05" '+
        'smpte:backgroundImage="#img_0"></div>' +
        '</body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 70, vttOffset: 0},
        {startTime: 0, endTime: 62.05},
        {
          startTime: 0,
          endTime: 62.05,
          backgroundImage: 'data:image/png;base64,base64EncodedImage',
          isContainer: false,
        });
  });

  it('supports smpte:backgroundImage attribute alt namespace', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: '',
            backgroundImage: 'data:image/png;base64,base64EncodedImage',
          },
        ],
        '<tt ' +
        'xmlns:ttm="http://www.w3.org/ns/ttml#metadata" ' +
        'xmlns:smpte="http://www.smpte-ra.org/schemas/2052-1/2013/smpte-tt">' +
        '<metadata>' +
        '<smpte:image imageType="PNG" encoding="Base64" xml:id="img_0">' +
        'base64EncodedImage</smpte:image>' +
        '</metadata>' +
        '<body><div>' +
        '<p begin="01:02.05" end="01:02:03.200" ' +
        'smpte:backgroundImage="#img_0" />' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('supports tts:ruby', () => {
    verifyHelper(
        [{
          startTime: 62.05,
          endTime: 3723.2,
          payload: '',
          nestedCues: [{
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Line1',
          }, {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Line2',
            rubyTag: 'rt',
          }],
          rubyTag: 'ruby',
        }],
        // With anonymous spans
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling"><body><div>' +
        '<p begin="01:02.05" end="01:02:03.200" tts:ruby="container">' +
        '<span tts:ruby="base">Line1</span><span tts:ruby="text">Line2' +
        '</span></p></div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('inserts line breaks for <br> tags', () => {
    verifyHelper(
        [{
          startTime: 62.05,
          endTime: 3723.2,
          payload: '',
          nestedCues: [{
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Line1',
          }, {
            startTime: 62.05,
            endTime: 3723.2,
            payload: '',
            lineBreak: true,
          }, {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Line2',
          }],
        }],
        // With anonymous spans
        '<tt><body><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Line1<br/>Line2</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [{
          startTime: 62.05,
          endTime: 3723.2,
          payload: '',
          nestedCues: [{
            startTime: 62.05,
            endTime: 3723.2,
            payload: '',
            nestedCues: [{
              startTime: 62.05,
              endTime: 3723.2,
              payload: 'Line1',
            }, {
              startTime: 62.05,
              endTime: 3723.2,
              payload: '',
              lineBreak: true,
            }, {
              startTime: 62.05,
              endTime: 3723.2,
              payload: 'Line2',
            }],
          }],
        }],
        // With explicit spans
        '<tt><body><div>' +
        '<p begin="01:02.05" end="01:02:03.200">' +
        '<span>Line1<br/>Line2</span>' +
        '</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('allows old-standard namespace', () => {
    verifyHelper(
        [
          {
            startTime: 1,
            endTime: 2,
            payload: 'Test',
            cellResolution: {
              columns: 60,
              rows: 20,
            },
            fontSize: '67%',
          },
        ],
        '<tt ' +
        'xmlns:ttp="http://www.w3.org/2006/10/ttaf1#parameter" ' +
        'xmlns:tts="http://www.w3.org/2006/10/ttaf1#styling" ' +
        'ttp:cellResolution="60 20">' +
        '<styling>' +
        '<style xml:id="s1" tts:fontSize="67%"/>' +
        '</styling>' +
        '<body><div>' +
        '<p begin="00:01.00" end="00:02.00" style="s1">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {startTime: 1, endTime: 2});
  });

  it('parses cue alignment from textAlign attribute', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            lineAlign: Cue.lineAlign.START,
            textAlign: Cue.textAlign.LEFT,
            positionAlign: Cue.positionAlign.LEFT,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:textAlign="left"/>' +
        '</styling>' +
        '<layout>' +
        '<region xml:id="subtitleArea" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200" style="s1">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('parses text style information', () => {
    verifyHelper(
        [
          {
            startTime: 1,
            endTime: 2,
            payload: 'Test',
            color: 'red',
            backgroundColor: 'blue',
            fontWeight: Cue.fontWeight.BOLD,
            fontFamily: 'Times New Roman',
            fontStyle: Cue.fontStyle.ITALIC,
            lineHeight: '20px',
            fontSize: '10em',
            textStrokeColor: 'blue',
            textStrokeWidth: '3px',
          },
          {
            startTime: 2,
            endTime: 4,
            payload: 'Test 2',
            fontSize: '0.80c',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:color="red" ' +
        'tts:textOutline="blue 3px" ' +
        'tts:backgroundColor="blue" ' +
        'tts:fontWeight="bold" ' +
        'tts:fontFamily="Times New Roman" ' +
        'tts:fontStyle="italic" ' +
        'tts:lineHeight="20px" ' +
        'tts:fontSize="10em"/>' +
        '<style xml:id="s2" tts:fontSize="0.80c" />' +
        '</styling>' +
        '<layout>' +
        '<region xml:id="subtitleArea" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="00:01.00" end="00:02.00" style="s1">Test</p>' +
        '<p begin="00:02.00" end="00:04.00" style="s2">Test 2</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {startTime: 1, endTime: 4, region: {id: 'subtitleArea'}},
        {startTime: 1, endTime: 4});
  });

  it('uses text color if tts:textOutline does not specify color', () => {
    verifyHelper(
        [
          {
            startTime: 1,
            endTime: 2,
            payload: 'Test',
            color: 'red',
            textStrokeColor: 'red',
            textStrokeWidth: '3px',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:color="red" ' +
        'tts:textOutline="3px" />' +
        '</styling>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="00:01.00" end="00:02.00" style="s1">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {startTime: 1, endTime: 2});
  });

  it('does not add an outline if tts:textOutline only contains color', () => {
    verifyHelper(
        [
          {
            startTime: 1,
            endTime: 2,
            payload: 'Test',
            color: 'red',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:color="red" ' +
        'tts:textOutline="blue" />' +
        '</styling>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="00:01.00" end="00:02.00" style="s1">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {startTime: 1, endTime: 2});
  });

  // Regression test for #2623
  it('does not apply background colors to containers', () => {
    verifyHelper(
        [
          {
            startTime: 1,
            endTime: 2,
            payload: '',
            // background color should not be set on the p container.
            backgroundColor: '',

            nestedCues: [{
              payload: 'Test',
              color: 'red',
              backgroundColor: 'blue',
            }],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head>' +
        '<styling>' +
        '<style xml:id="s1" tts:color="red" ' +
        'tts:backgroundColor="blue" />' +
        '</styling>' +
        '<layout>' +
        '<region xml:id="r1" />' +
        '</layout>' +
        '</head>' +
        '<body><div>' +
        '<p begin="00:01.00" end="00:02.00" region="r1">' +
        '<span style="s1">Test</span>' +
        '</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {startTime: 1, endTime: 2});
  });

  // Regression test for #4468
  it('defaults the body background to transparent', () => {
    verifyHelper(
        // One cue, don't care about the details
        [{}],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head>' +
        '<styling>' +
        '<style xml:id="s1" tts:backgroundColor="black" />' +
        '</styling>' +
        '</head>' +
        '<body><div>' +
        '<p begin="00:01.00" end="00:02.00">' +
        '<span style="s1">Test</span>' +
        '</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        // The body must have these properties:
        {backgroundColor: 'transparent'},
        // The div must have these properties:
        {});  // don't care
  });

  // Regression test for #4468
  it('allows the body background color to be set', () => {
    verifyHelper(
        // One cue, don't care about the details
        [{}],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head>' +
        '<styling>' +
        '<style xml:id="s1" tts:backgroundColor="black" />' +
        '</styling>' +
        '</head>' +
        '<body style="s1"><div>' +
        '<p begin="00:01.00" end="00:02.00">' +
        '<span>Test</span>' +
        '</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        // The body must have these properties:
        {backgroundColor: 'black'},
        // The div must have these properties:
        {});  // don't care
  });

  it('parses wrapping option', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            wrapLine: false,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:wrapOption="noWrap"/>' +
        '</styling>' +
        '<layout xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<region xml:id="subtitleArea" />' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200" style="s1">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('parses text decoration', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            textDecoration: [Cue.textDecoration.UNDERLINE,
              Cue.textDecoration.OVERLINE],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:textDecoration="underline ' +
        'overline lineThrough"/>' +
        '<style xml:id="s2" tts:textDecoration="noLineThrough"/>' +
        '</styling>' +
        '<layout>' +
        '<region xml:id="subtitleArea" style="s1"/>' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200" style="s2">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('cues should have default cellResolution', () => {
    verifyHelper(
        [
          {
            startTime: 1,
            endTime: 2,
            cellResolution: {
              columns: 32,
              rows: 15,
            },
            fontSize: '0.45c',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:fontSize="0.45c"/>' +
        '</styling>' +
        '<body><div>' +
        '<p begin="00:01.00" end="00:02.00" style="s1">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {startTime: 1, endTime: 2});
  });

  it('parses cellResolution', () => {
    verifyHelper(
        [
          {
            startTime: 1,
            endTime: 2,
            payload: 'Test',
            cellResolution: {
              columns: 60,
              rows: 20,
            },
            fontSize: '67%',
          },
        ],
        '<tt ' +
        'xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ' +
        'xmlns:tts="http://www.w3.org/ns/ttml#styling" ' +
        'ttp:cellResolution="60 20">' +
        '<styling>' +
        '<style xml:id="s1" tts:fontSize="67%"/>' +
        '</styling>' +
        '<body><div>' +
        '<p begin="00:01.00" end="00:02.00" style="s1">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {startTime: 1, endTime: 2});
  });

  it('parses line padding', () => {
    verifyHelper(
        [
          {
            startTime: 1,
            endTime: 2,
            payload: 'Test',
            cellResolution: {
              columns: 60,
              rows: 20,
            },
            linePadding: '0.5c',
          },
        ],
        '<tt ' +
        'xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ' +
        'xmlns:tts="http://www.w3.org/ns/ttml#styling" ' +
        'xmlns:ebutts="urn:ebu:tt:style" ' +
        'ttp:cellResolution="60 20">' +
        '<styling>' +
        '<style xml:id="s1" ebutts:linePadding="0.5c"/>' +
        '</styling>' +
        '<body><div>' +
        '<p begin="00:01.00" end="00:02.00" style="s1">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {startTime: 1, endTime: 2});
  });

  it('chooses style on element over style on region', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            color: 'blue',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:color="red"/>' +
        '<style xml:id="s2" tts:color="blue"/>' +
        '</styling>' +
        '<layout>' +
        '<region xml:id="subtitleArea" style="s1"/>' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200" style="s2">Test</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('can parse multiple cues', () => {
    verifyHelper(
        [
          {startTime: 1, endTime: 2, payload: 'First cue'},
          {startTime: 3, endTime: 4, payload: 'Second cue'},
        ],
        '<tt><body><div>' +
        '<p begin="00:01.00" end="00:02.00">First cue</p>' +
        '<p begin="00:03.00" end="00:04.00">Second cue</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        {startTime: 1, endTime: 4});
  });

  // Regression test for https://github.com/shaka-project/shaka-player/issues/2478
  it('supports nested cues with only non-ASCII characters', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: '',
            nestedCues: [
              {
                payload: 'äöü',
                startTime: 62.05,
                endTime: 3723.2,
              },
            ],
          },
        ],
        '<tt><body><div>' +
        '<p begin="01:02.05" end="01:02:03.200"><span>äöü</span></p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 60, segmentEnd: 3730, vttOffset: 0},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('supports timing on multiple levels', () => {
    // Both start and end times are relative to the parent start time.

    verifyHelper(
        [
          {startTime: 6, endTime: 7, payload: 'First cue'},
          {startTime: 7, endTime: 8, payload: 'Second cue'},
        ],
        '<tt><body begin="1s">' +
        '<div begin="2s">' +
        '<p begin="3s" end="4s">First cue</p>' +
        '<p begin="4s" end="5s">Second cue</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
        // Capped to segment end time.
        {startTime: 1, endTime: 10},
        {startTime: 3, endTime: 10});

    verifyHelper(
        [{
          startTime: 6,
          payload: '',
          nestedCues: [{
            startTime: 10,
            endTime: 11,
            payload: 'First cue',
          }, {
            startTime: 11,
            endTime: 12,
            payload: 'Second cue',
          }],
        }],
        '<tt><body begin="1s">' +
        '<div begin="2s">' +
        '<p begin="3s">' +
        '<span begin="4s" end="5s">First cue</span>' +
        '<span begin="5s" end="6s">Second cue</span>' +
        '</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 20, vttOffset: 0},
        // Capped to segment end time.
        {startTime: 1, endTime: 20},
        {startTime: 3, endTime: 20});
  });

  it('gets end time from parent directly if missing', () => {
    verifyHelper(
        [
          {startTime: 6, endTime: 7, payload: 'First cue'},
          {startTime: 7, endTime: 30, payload: 'Second cue'},
        ],
        '<tt><body begin="1s" end="30s">' +
        '<div begin="2s">' +
        '<p begin="3s" end="4s">First cue</p>' +
        '<p begin="4s">Second cue</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 30, vttOffset: 0},
        {startTime: 1, endTime: 30},
        {startTime: 3, endTime: 30});
  });

  it('supports never-ending cues', () => {
    verifyHelper(
        [
          // Capped to segment end time.
          {startTime: 1, endTime: 9000, payload: 'First cue'},
          {startTime: 2, endTime: 9000, payload: 'Second cue'},
        ],
        '<tt><body><div>' +
        '<p begin="1s">First cue</p>' +
        '<p begin="2s">Second cue</p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 9000, vttOffset: 0},
        // Capped to segment end time.
        {startTime: 1, endTime: 9000});
  });

  // Regression test for b/159050711
  it('inherits styles from other styles on both element and region', () => {
    verifyHelper(
        [
          {
            // p element
            startTime: 0,
            endTime: 60,
            payload: '',
            fontSize: '15px',
            backgroundColor: 'transparent',
            color: 'blue',
            displayAlign: Cue.displayAlign.CENTER,
            textAlign: Cue.textAlign.CENTER,

            nestedCues: [
              {
                startTime: 0,
                endTime: 60,
                payload: 'Test with regionStyle',
                // Style inherited from regionStyle.
                backgroundColor: 'transparent',
                color: 'blue',
                displayAlign: Cue.displayAlign.CENTER,
                fontSize: '15px',
                textAlign: Cue.textAlign.CENTER,
              },
              {
                startTime: 0,
                endTime: 60,
                payload: 'Test with spanStyle',
                // Style from spanStyle, overrides regionStyle
                backgroundColor: 'white',
                // Style inherited from regionStyle via spanStyle
                color: 'blue',
                // Styles inherited from backgroundStyle via regionStyle via
                // spanStyle
                displayAlign: Cue.displayAlign.CENTER,
                textAlign: Cue.textAlign.END,
              },
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head>' +
        '  <layout>' +
        '    <region xml:id="r1" style="regionStyle" />' +
        '  </layout>' +
        '  <styling>' +
        // spanStyle inherits attributes from regionStyle
        '    <style xml:id="pStyle" tts:fontSize="15px" />' +
        '    <style xml:id="spanStyle" style="regionStyle" ' +
        '           tts:backgroundColor="white" tts:textAlign="end" />' +
        // regionStyle inherits attributes from backgroundStyle
        '    <style xml:id="regionStyle" style="backgroundStyle" ' +
        '           tts:backgroundColor="transparent" tts:color="blue" />' +
        '    <style xml:id="backgroundStyle" ' +
        '           tts:displayAlign="center" tts:textAlign="center" ' +
        '           tts:fontSize="18px" />' +
        '  </styling>' +
        '</head>' +
        '<body><div>' +
        '  <p begin="00:00" end="01:00" region="r1" style="pStyle">' +
        '    <span>Test with regionStyle</span>' +
        '    <span style="spanStyle">Test with spanStyle</span>' +
        '  </p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 60, vttOffset: 0},
        {startTime: 0, endTime: 60});
  });

  it('inherits alignment from parent regions', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 60,
            payload: '',
            fontSize: '',
            textAlign: Cue.textAlign.END,
            displayAlign: Cue.displayAlign.CENTER,
            nestedCues: [
              {
                startTime: 0,
                endTime: 60,
                payload: 'Hello!',
                textAlign: Cue.textAlign.END,
                displayAlign: Cue.displayAlign.CENTER,
              },
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head><layout>' +
        '<region xml:id="r1" tts:textAlign="end" tts:displayAlign="center" />' +
        '</layout></head>' +
        '<body><div><p begin="00:00" end="01:00" region="r1">' +
        '<span>Hello!</span>' +
        '</p></div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 60, vttOffset: 0},
        {startTime: 0, endTime: 60},
    );
  });

  // Regression test for https://github.com/shaka-project/shaka-player/issues/3743
  it('inherits styles from other styles on nestedCues', () => {
    verifyHelper(
        [
          {
            // p element
            startTime: 0,
            endTime: 60,
            payload: '',
            fontSize: '16px',
            nestedCues: [
              {
                startTime: 0,
                endTime: 60,
                payload: 'A',
                fontSize: '16px',
              },
              {
                startTime: 0,
                endTime: 60,
                payload: '',
                fontSize: '',
              },
              {
                startTime: 0,
                endTime: 60,
                payload: 'B',
                fontSize: '16px',
              },
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head>' +
        '  <styling>' +
        '   <style tts:backgroundColor="rgba(0,0,0,100)" ' +
        '          tts:displayAlign="center" ' +
        '          tts:extent="80% 10%" ' +
        '          tts:fontFamily="proportionalSansSerif" ' +
        '          tts:fontSize="16px" ' +
        '          tts:origin="10% 85%" ' +
        '          tts:textAlign="center" ' +
        '          xml:id="backgroundStyle"/>' +
        '   <style style="backgroundStyle" ' +
        '          tts:backgroundColor="transparent" ' +
        '          tts:color="white" ' +
        '          xml:id="speakerStyle"/>' +
        '  </styling>' +
        '  <layout>' +
        '    <region style="speakerStyle" tts:zIndex="1" xml:id="speaker"/>' +
        '  </layout>' +
        '</head>' +
        '<body><div>' +
        '  <p begin="00:00" end="01:00" region="speaker">' +
        '    A<br/>B' +
        '  </p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 60, vttOffset: 0},
        {startTime: 0, endTime: 60});
  });

  // Test for https://github.com/shaka-project/shaka-player/issues/4631
  it('trims cues to segment boundaries', () => {
    verifyHelper(
        [
          // Capped to segment end time.
          {startTime: 168, endTime: 170},
        ],
        '<tt><body><div>' +
        '  <p begin="00:02:48.00" end="00:02:50.92" xml:id="sub22">' +
        '    <span style="s1">Emo look.<br/>I mean listen.</span>' +
        '  </p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 160, segmentEnd: 170, vttOffset: 0},
        {});

    verifyHelper(
        [
          // Capped to segment start time.
          {startTime: 170, endTime: Util.closeTo(170.92)},
        ],
        '<tt><body><div>' +
        '  <p begin="00:02:48.00" end="00:02:50.92" xml:id="sub22">' +
        '    <span style="s1">Emo look.<br/>I mean listen.</span>' +
        '  </p>' +
        '</div></body></tt>',
        {periodStart: 0, segmentStart: 170, segmentEnd: 180, vttOffset: 0},
        {});
  });

  /**
   * @param {!Array} cues
   * @param {string} text
   * @param {shaka.extern.TextParser.TimeContext} time
   * @param {!Object} bodyProperties
   * @param {Object=} divProperties
   */
  function verifyHelper(cues, text, time, bodyProperties, divProperties) {
    const data =
        shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(text));
    const result = new shaka.text.TtmlTextParser()
        .parseMedia(data, time, 'foo://bar');
    shaka.test.TtmlUtils.verifyHelper(
        cues, result, bodyProperties, divProperties);
  }


  /**
   * @param {shaka.util.Error.Code} code
   * @param {string} text
   * @param {*=} errorData
   */
  function errorHelper(code, text, errorData = undefined) {
    let shakaError;
    if (errorData) {
      shakaError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.TEXT,
          code, errorData);
    } else {
      shakaError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.TEXT,
          code);
    }
    const error = shaka.test.Util.jasmineError(shakaError);
    const data = shaka.util.StringUtils.toUTF8(text);
    expect(() => {
      new shaka.text.TtmlTextParser().parseMedia(
          shaka.util.BufferUtils.toUint8(data),
          {periodStart: 0, segmentStart: 0, segmentEnd: 10, vttOffset: 0},
          'foo://bar');
    }).toThrow(error);
  }
});
