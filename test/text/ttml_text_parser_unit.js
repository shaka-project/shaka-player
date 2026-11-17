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

  describe('element namespaces', () => {
    const namespace = 'http://www.w3.org/ns/ttml';
    const text =
        `<tt xmlns="${namespace}" ` +
        'xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head><styling><style xml:id="s" tts:color="red"/></styling>' +
        '<layout><region xml:id="r" tts:origin="10% 20%"/></layout></head>' +
        '<body region="r"><div begin="1s" end="3s">' +
        '<p style="s">First<br/><span>Second</span></p>' +
        '</div></body></tt>';

    /**
     * @param {string} documentText
     * @return {!Array<!shaka.text.Cue>}
     */
    function parse(documentText) {
      return new shaka.text.TtmlTextParser().parseMedia(
          shaka.util.BufferUtils.toUint8(
              shaka.util.StringUtils.toUTF8(documentText)),
          {
            periodStart: 0,
            segmentStart: 0,
            segmentEnd: 10,
            vttOffset: 0,
            isMpegTs: false,
          },
          'https://bar', /* images= */ []);
    }

    it('accepts a prefixed root after an XML declaration', () => {
      const prefixed = text.replace('<tt ', `<t:tt xmlns:t="${namespace}" `)
          .replace('</tt>', '</t:tt>');
      expect(parse('<?xml version="1.0"?>' + prefixed)).toEqual(parse(text));
    });

    it('accepts prefixes on all TTML elements', () => {
      const prefixed = text.replace('xmlns=', 'xmlns:t=')
          .replace(/<(\/?)(\w+)/g, '<$1t:$2');
      expect(parse(prefixed)).toEqual(parse(text));
    });

    it('resolves aliases declared on nested elements', () => {
      const prefixed = text
          .replace('<body ', `<a:body xmlns:a="${namespace}" `)
          .replace('</body>', '</a:body>')
          .replace('<p ', `<b:p xmlns:b="${namespace}" `)
          .replace('</p>', '</b:p>')
          .replace('<br/>', '<b:br/>');
      expect(parse(prefixed)).toEqual(parse(text));
    });

    it('resolves prefixes within their scope', () => {
      const prefixed = text
          .replace('<tt ', `<tt xmlns:t="${namespace}" `)
          .replace('<head>',
              '<head xmlns:t="urn:foreign"><t:region xml:id="foreign"/>')
          .replace('<body ', '<t:body ')
          .replace('</body>', '</t:body>');
      expect(parse(prefixed)).toEqual(parse(text));
    });

    it('ignores foreign elements in a default namespace', () => {
      const foreign = text.replace('<head>',
          '<head><metadata xmlns="urn:foreign">' +
          '<region xml:id="foreign"/><style xml:id="s"/>' +
          '<body/></metadata>');
      expect(parse(foreign)).toEqual(parse(text));
    });

    it('supports a prefix declared below an unqualified root', () => {
      const prefixed = text.replace('<body ',
          `<t:body xmlns:t="${namespace}" `)
          .replace('</body>', '</t:body>')
          .replace('<div ', '<t:div ')
          .replace('</div>', '</t:div>')
          .replace('<p ', '<t:p ')
          .replace('</p>', '</t:p>');
      expect(parse(prefixed)).toEqual(parse(text));
    });

    it('supports clearing the default namespace for compatibility', () => {
      const unqualified = text.replace('<body ', '<body xmlns="" ');
      expect(parse(unqualified)).toEqual(parse(text));
    });

    it('supports the legacy TTML element namespace', () => {
      const prefixed = text.replace('xmlns=', 'xmlns:t=')
          .replace(namespace + '"', 'http://www.w3.org/2006/10/ttaf1"')
          .replace(/<(\/?)(\w+)/g, '<$1t:$2');
      expect(parse(prefixed)).toEqual(parse(text));
    });

    it('preserves whitespace with a prefixed root', () => {
      const preserved = `<tt xmlns="${namespace}" xml:space="preserve">` +
          '<body><div><p begin="0s" end="1s">\n  <span>A</span>\n  ' +
          '</p></div></body></tt>';
      const prefixed = preserved.replace('xmlns=', 'xmlns:t=')
          .replace(/<(\/?)(\w+)/g, '<$1t:$2');
      const expected = parse(preserved);
      expect(expected[0].nestedCues[0].nestedCues[0].nestedCues[0].payload)
          .toBe('\n  ');
      expect(parse(prefixed)).toEqual(expected);
    });

    it('rejects foreign or undeclared root namespaces', () => {
      for (const root of [
        'This is not XML',
        '<t:tt xmlns:t="urn:foreign"/>',
        '<tt xmlns="urn:foreign"/>',
        '<t:tt/>',
      ]) {
        errorHelper(shaka.util.Error.Code.INVALID_XML, root, anyString);
      }
    });

    it('validates the structure of prefixed elements', () => {
      errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
          `<t:tt xmlns:t="${namespace}">` +
          '<t:body><t:p/></t:body></t:tt>', anyString);
      errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
          `<t:tt xmlns:t="${namespace}">` +
          '<t:body><t:div><t:span/></t:div></t:body></t:tt>', anyString);
    });
  });

  describe('regions', () => {
    /**
     * @param {string} head The content of the head element.
     * @param {string} body The body element.
     * @param {string=} ttAttributes More attributes of the tt element.
     * @return {!shaka.text.Cue} The cue of the body.
     */
    function parse(head, body, ttAttributes = '') {
      const cues = new shaka.text.TtmlTextParser().parseMedia(
          shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(
              '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling" ' +
              'xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ' +
              `${ttAttributes}><head>${head}</head>${body}</tt>`)),
          {
            periodStart: 0,
            segmentStart: 0,
            segmentEnd: 10,
            vttOffset: 0,
            isMpegTs: false,
          },
          'https://bar', /* images= */ []);
      expect(cues.length).toBe(1);
      return cues[0];
    }

    it('parses the styles of regions', () => {
      const body = parse(
          '<layout><region xml:id="r1" tts:origin="10% 20%" ' +
          'tts:extent="50% 40%" tts:backgroundColor="red" tts:opacity="0.5" ' +
          'tts:padding="10% 1c 20px" tts:overflow="hidden" tts:zIndex="2" ' +
          'tts:showBackground="whenActive"/></layout>',
          '<body region="r1"><div>' +
          '<p begin="0s" end="1s">Test</p>' +
          '</div></body>');
      expect(body.region).toEqual(jasmine.objectContaining({
        id: 'r1',
        backgroundColor: 'red',
        opacity: 0.5,
        // The before, end, after and start lengths, from the top.  A cell is
        // 1/32 of the width of the root container, so 1/16 of the region.
        padding: '10% 6.25% 20px 6.25%',
        overflow: 'hidden',
        zIndex: 2,
      }));
      // The background and the opacity of the region are not applied to its
      // content.
      const p = body.nestedCues[0].nestedCues[0];
      expect(p.backgroundColor).toBe('');
      expect(p.opacity).toBe(1);
    });

    it('hides the content which overflows a region by default', () => {
      /**
       * @param {string} overflow
       * @return {string}
       */
      const getOverflow = (overflow) => parse(
          `<layout><region xml:id="r1" ${overflow}/></layout>`,
          '<body region="r1"><div>' +
          '<p begin="0s" end="1s">Test</p>' +
          '</div></body>').region.overflow;
      expect(getOverflow('')).toBe('hidden');
      expect(getOverflow('tts:overflow="hidden"')).toBe('hidden');
      expect(getOverflow('tts:overflow="visible"')).toBe('');
    });

    it('resolves the padding in em with the font size of the region', () => {
      /**
       * @param {string} fontSize
       * @return {string}
       */
      const getPadding = (fontSize) => parse(
          '<layout><region xml:id="r1" tts:extent="50% 40%" ' +
          `${fontSize} tts:padding="0% 1em"/></layout>`,
          '<body region="r1"><div>' +
          '<p begin="0s" end="1s">Test</p>' +
          '</div></body>').region.padding;
      // A cell is 1/32 of the width of the root container, so 1/16 of the
      // region.
      expect(getPadding('')).toBe('0% 6.25% 0% 6.25%');
      expect(getPadding('tts:fontSize="2c"')).toBe('0% 12.5% 0% 12.5%');
      expect(getPadding('tts:fontSize="200%"')).toBe('0% 12.5% 0% 12.5%');
      expect(getPadding('tts:fontSize="2em"')).toBe('0% 12.5% 0% 12.5%');
    });

    it('applies the padding relative to the writing mode', () => {
      const body = parse(
          '<layout><region xml:id="r1" tts:writingMode="tbrl" ' +
          'tts:padding="1% 2% 3% 4%"/></layout>',
          '<body region="r1"><div>' +
          '<p begin="0s" end="1s">Test</p>' +
          '</div></body>');
      // The before edge is on the right, and the start edge is on the top.
      expect(body.region.padding).toBe('4% 1% 2% 3%');
    });

    it('shows the background of the regions without content', () => {
      const body = parse(
          '<layout>' +
          '<region xml:id="r1" tts:backgroundColor="red" begin="2s" ' +
          'end="8s"/>' +
          '<region xml:id="r2" tts:backgroundColor="blue" ' +
          'tts:showBackground="whenActive"/>' +
          '<region xml:id="r3" tts:backgroundColor="transparent"/>' +
          '</layout>',
          '<body><div>' +
          '<p begin="3s" end="4s" region="r2">Test</p>' +
          '</div></body>');
      // Only the background of r1 is shown without content, below it, while
      // the region is active.
      expect(body.nestedCues.length).toBe(2);
      const background = body.nestedCues[0];
      expect(background.region.id).toBe('r1');
      expect(background.startTime).toBe(2);
      expect(background.endTime).toBe(8);
      expect(background.payload).toBe('');
      expect(background.nestedCues).toEqual([]);
      expect(body.startTime).toBe(2);
      expect(body.endTime).toBe(8);
    });

    it('presents region backgrounds when body is animated', () => {
      const cues = new shaka.text.TtmlTextParser().parseMedia(
          shaka.util.BufferUtils.toUint8(
              shaka.util.StringUtils.toUTF8(
                  '<tt xmlns="http://www.w3.org/ns/ttml" ' +
                  'xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
                  '<head><layout>' +
                  '<region xml:id="r1" tts:backgroundColor="red" ' +
                  'begin="0s" end="6s"/>' +
                  '</layout></head>' +
                  '<body region="r1">' +
                  '<set begin="2s" end="4s" tts:color="yellow"/>' +
                  '<div><p begin="0s" end="6s">Test</p></div>' +
                  '</body></tt>')),
          {
            periodStart: 0,
            segmentStart: 0,
            segmentEnd: 10,
            vttOffset: 0,
            isMpegTs: false,
          },
          'https://bar', /* images= */ []);
      expect(cues.length).toBe(3);
      for (const cue of cues) {
        expect(cue.nestedCues.some((c) => c.region && c.region.id == 'r1' &&
            c.region.backgroundColor == 'red')).toBe(true);
      }
    });

    it('does not overlap region backgrounds when body is split', () => {
      const cues = new shaka.text.TtmlTextParser().parseMedia(
          shaka.util.BufferUtils.toUint8(
              shaka.util.StringUtils.toUTF8(
                  '<tt xmlns="http://www.w3.org/ns/ttml" ' +
                  'xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
                  '<head><layout>' +
                  '<region xml:id="r1" tts:backgroundColor="red"/>' +
                  '</layout></head>' +
                  '<body region="r1">' +
                  '<set begin="2s" end="4s" tts:color="yellow"/>' +
                  '<div><p begin="0s" end="6s">Test</p></div>' +
                  '</body></tt>')),
          {
            periodStart: 0,
            segmentStart: 0,
            segmentEnd: 10,
            vttOffset: 0,
            isMpegTs: false,
          },
          'https://bar', /* images= */ []);
      expect(cues.length).toBe(3);
      const backgrounds = cues.map((cue) => cue.nestedCues.find((c) =>
        c.isContainer && c.region && c.region.backgroundColor == 'red'));
      expect(backgrounds.map((c) => [c.startTime, c.endTime])).toEqual(
          [[0, 2], [2, 4], [4, 10]]);
    });

    it('presents region backgrounds without any content', () => {
      /**
       * @param {string} body
       * @return {!Array<!shaka.text.Cue>}
       */
      const parseBody = (body) => new shaka.text.TtmlTextParser().parseMedia(
          shaka.util.BufferUtils.toUint8(
              shaka.util.StringUtils.toUTF8(
                  '<tt xmlns="http://www.w3.org/ns/ttml" ' +
                  'xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
                  '<head><layout>' +
                  '<region xml:id="r1" tts:backgroundColor="red"/>' +
                  `</layout></head>${body}</tt>`)),
          {
            periodStart: 0,
            segmentStart: 0,
            segmentEnd: 10,
            vttOffset: 0,
            isMpegTs: false,
          },
          'https://bar', /* images= */ []);

      for (const body of [
        '<body/>',
        '<body><div><p begin="1s" end="2s" tts:display="none">A</p></div>' +
            '</body>',
      ]) {
        const cues = parseBody(body);
        expect(cues.length).toBe(1);
        expect(cues[0].nestedCues.length).toBe(1);
        expect(cues[0].nestedCues[0]).toEqual(jasmine.objectContaining({
          startTime: 0,
          endTime: 10,
          isContainer: true,
        }));
        expect(cues[0].nestedCues[0].region.backgroundColor).toBe('red');
      }

      // A timed body only shows them during its interval.
      const timed = parseBody('<body begin="2s" end="4s"/>');
      expect(timed.length).toBe(1);
      expect(timed[0].startTime).toBe(2);
      expect(timed[0].endTime).toBe(4);
    });

    it('presents the content only while its region is active', () => {
      const body = parse(
          '<layout><region xml:id="r1" begin="2s" end="5s"/></layout>',
          '<body region="r1"><div>' +
          '<p begin="1s" end="3s">Clipped</p>' +
          '<p begin="6s" end="7s">Hidden</p>' +
          '</div></body>');
      const cues = body.nestedCues[0].nestedCues;
      expect(cues.length).toBe(1);
      expect(cues[0].payload).toBe('Clipped');
      expect(cues[0].startTime).toBe(2);
      expect(cues[0].endTime).toBe(3);
    });

    it('does not present the text which is not in any region', () => {
      const body = parse(
          '<layout><region xml:id="r1"/><region xml:id="r2"/></layout>',
          '<body><div>' +
          '<p begin="0s" end="1s">Hidden <span region="r1">Shown</span></p>' +
          '<p begin="0s" end="1s">Hidden</p>' +
          '<p begin="0s" end="1s" region="r2">Shown</p>' +
          '</div></body>');
      const cues = body.nestedCues[0].nestedCues;
      expect(cues.length).toBe(2);
      expect(cues[0].nestedCues.length).toBe(1);
      expect(cues[0].nestedCues[0].payload).toBe('Shown');
      expect(cues[1].payload).toBe('Shown');
    });

    it('supports lengths relative to the root container', () => {
      const body = parse(
          '<layout><region xml:id="r1" tts:origin="10rw 20rh" ' +
          'tts:extent="50rw 40rh"/></layout>',
          '<body region="r1"><div>' +
          '<p begin="0s" end="1s">Test</p>' +
          '</div></body>');
      expect(body.region).toEqual(jasmine.objectContaining({
        viewportAnchorX: 10,
        viewportAnchorY: 20,
        width: 50,
        height: 40,
      }));

      const bodyAbove100 = parse(
          '<layout><region xml:id="r1" tts:origin="10rw 20rh" ' +
          'tts:extent="120rw 80rh"/></layout>',
          '<body region="r1"><div>' +
          '<p begin="0s" end="1s">Test</p>' +
          '</div></body>');
      expect(bodyAbove100.region).toEqual(jasmine.objectContaining({
        width: 120,
        height: 80,
      }));
    });

    describe('origin and extent', () => {
      const root1080p = 'tts:extent="1920px 1080px"';

      /**
       * @param {string} regionAttributes
       * @param {string=} ttAttributes
       * @return {shaka.text.CueRegion}
       */
      function parseRegion(regionAttributes, ttAttributes = '') {
        return parse(
            `<layout><region xml:id="r1" ${regionAttributes}/></layout>`,
            '<body region="r1"><div>' +
            '<p begin="0s" end="1s">Test</p>' +
            '</div></body>',
            ttAttributes).region;
      }

      it('resolves cells with the default cell resolution', () => {
        // The default cell resolution is 32 columns by 15 rows.
        const region = parseRegion('tts:origin="4c 3c" tts:extent="16c 6c"');
        expect(region).toEqual(jasmine.objectContaining({
          viewportAnchorX: 12.5,
          viewportAnchorY: 20,
          viewportAnchorUnits: CueRegion.units.PERCENTAGE,
          width: 50,
          height: 40,
          widthUnits: CueRegion.units.PERCENTAGE,
          heightUnits: CueRegion.units.PERCENTAGE,
        }));
      });

      it('resolves cells against columns and rows respectively', () => {
        // With a grid which is not square, swapping the axes would give
        // different results.
        const region = parseRegion(
            'tts:origin="4c 3c" tts:extent="20c 10c"',
            'ttp:cellResolution="40 20"');
        expect(region).toEqual(jasmine.objectContaining({
          viewportAnchorX: 10,
          viewportAnchorY: 15,
          viewportAnchorUnits: CueRegion.units.PERCENTAGE,
          width: 50,
          height: 50,
          widthUnits: CueRegion.units.PERCENTAGE,
          heightUnits: CueRegion.units.PERCENTAGE,
        }));
      });

      it('extends a region with an origin in cells to the edges', () => {
        const region = parseRegion('tts:origin="8c 3c"');
        expect(region).toEqual(jasmine.objectContaining({
          viewportAnchorX: 25,
          viewportAnchorY: 20,
          width: 75,
          height: 80,
          widthUnits: CueRegion.units.PERCENTAGE,
          heightUnits: CueRegion.units.PERCENTAGE,
        }));
      });

      it('supports lengths with different units', () => {
        const region = parseRegion(
            'tts:origin="10% 108px" tts:extent="960px 3c"', root1080p);
        expect(region).toEqual(jasmine.objectContaining({
          viewportAnchorX: 10,
          viewportAnchorY: 10,
          viewportAnchorUnits: CueRegion.units.PERCENTAGE,
          width: 50,
          height: 20,
          widthUnits: CueRegion.units.PERCENTAGE,
          heightUnits: CueRegion.units.PERCENTAGE,
        }));
      });

      it('supports lengths in pixels which are not integers', () => {
        const region = parseRegion(
            'tts:origin="10.5px 20.25px" tts:extent="100.5px 50.75px"');
        expect(region).toEqual(jasmine.objectContaining({
          viewportAnchorX: 10.5,
          viewportAnchorY: 20.25,
          viewportAnchorUnits: CueRegion.units.PX,
          width: 100.5,
          height: 50.75,
          widthUnits: CueRegion.units.PX,
          heightUnits: CueRegion.units.PX,
        }));
      });

      it('supports a negative origin', () => {
        const region = parseRegion(
            'tts:origin="-10% -3c" tts:extent="50% 3c"');
        expect(region).toEqual(jasmine.objectContaining({
          viewportAnchorX: -10,
          viewportAnchorY: -20,
          viewportAnchorUnits: CueRegion.units.PERCENTAGE,
          width: 50,
          height: 20,
        }));
      });

      it('ignores a negative extent', () => {
        const warnOnce = spyOn(shaka.log, 'warnOnce');
        const region = parseRegion('tts:extent="-50% 40%"');
        expect(region).toEqual(jasmine.objectContaining({
          width: 100,
          height: 100,
          widthUnits: CueRegion.units.PERCENTAGE,
          heightUnits: CueRegion.units.PERCENTAGE,
        }));
        expect(warnOnce).toHaveBeenCalledWith(
            anyString, jasmine.stringMatching('-50% 40%'));
      });

      it('ignores an origin which mixes pixels and other units', () => {
        // Without the size of the root container, pixels cannot be converted
        // to the percentage the other coordinate is in.
        const warnOnce = spyOn(shaka.log, 'warnOnce');
        const region = parseRegion('tts:origin="10% 72px"');
        expect(region).toEqual(jasmine.objectContaining({
          viewportAnchorX: 0,
          viewportAnchorY: 0,
          viewportAnchorUnits: CueRegion.units.PERCENTAGE,
        }));
        expect(warnOnce).toHaveBeenCalledWith(
            anyString, jasmine.stringMatching('10% 72px'));
      });

      it('resolves em with the aspect ratio of the root container', () => {
        const warnOnce = spyOn(shaka.log, 'warnOnce');
        // The default font size is one cell, and a cell is 1/15 of the height
        // of the root container.  A horizontal em is as long as a vertical
        // one, which is 1080 / 15 = 72px, or 3.75% of 1920px.
        const region = parseRegion('tts:extent="10em 3em"', root1080p);
        expect(region.width).toBeCloseTo(37.5);
        expect(region.height).toBeCloseTo(20);
        expect(region.widthUnits).toBe(CueRegion.units.PERCENTAGE);
        expect(region.heightUnits).toBe(CueRegion.units.PERCENTAGE);
        expect(warnOnce).not.toHaveBeenCalled();
      });

      it('approximates horizontal em without a root extent', () => {
        const warnOnce = spyOn(shaka.log, 'warnOnce');
        // Without the aspect ratio of the root container, a horizontal em is
        // measured along the width of a cell, 1/32 of the root container.
        const region = parseRegion('tts:extent="10em 3em"');
        expect(region.width).toBeCloseTo(31.25);
        expect(region.height).toBeCloseTo(20);
        expect(warnOnce).toHaveBeenCalledWith(
            'ttml-horizontal-em', jasmine.stringMatching('10em'));
      });

      it('resolves em with a font size of two lengths', () => {
        const warnOnce = spyOn(shaka.log, 'warnOnce');
        // The first length is the width of an em, and the second its height,
        // so no aspect ratio is needed.
        const region = parseRegion(
            'tts:fontSize="2c 1c" tts:extent="4em 3em"');
        expect(region.width).toBeCloseTo(25);
        expect(region.height).toBeCloseTo(20);
        expect(warnOnce).not.toHaveBeenCalled();
      });
    });

    it('does not use a percentage root extent as pixels', () => {
      const cues = new shaka.text.TtmlTextParser().parseMedia(
          shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(
              '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling" ' +
              'tts:extent="100% 100%"><head><layout>' +
              '<region xml:id="r1" tts:extent="640px 480px"/>' +
              '</layout></head><body region="r1"><div>' +
              '<p begin="0s" end="1s">Test</p></div></body></tt>')),
          {
            periodStart: 0,
            segmentStart: 0,
            segmentEnd: 10,
            vttOffset: 0,
            isMpegTs: false,
          },
          'https://bar', /* images= */ []);
      expect(cues[0].region).toEqual(jasmine.objectContaining({
        width: 640,
        height: 480,
        widthUnits: shaka.text.CueRegion.units.PX,
        heightUnits: shaka.text.CueRegion.units.PX,
      }));
    });

    it('supports the position of regions', () => {
      /**
       * @param {string} position
       * @return {{x: number, y: number}}
       */
      const getAnchor = (position) => {
        const body = parse(
            '<layout><region xml:id="r1" tts:extent="60% 20%" ' +
            `tts:position="${position}"/></layout>`,
            '<body region="r1"><div>' +
            '<p begin="0s" end="1s">Test</p>' +
            '</div></body>');
        return {x: body.region.viewportAnchorX, y: body.region.viewportAnchorY};
      };
      expect(getAnchor('center')).toEqual({x: 20, y: 40});
      expect(getAnchor('left')).toEqual({x: 0, y: 40});
      expect(getAnchor('bottom')).toEqual({x: 20, y: 80});
      // A percentage is relative to the space left by the region.
      expect(getAnchor('25% 50%')).toEqual({x: 10, y: 40});
      expect(getAnchor('right 10rw bottom 5rh')).toEqual({x: 30, y: 75});
      expect(getAnchor('center 10% bottom')).toEqual({x: 24, y: 80});
      expect(getAnchor('center 10% center 20%')).toEqual({x: 24, y: 56});
      expect(getAnchor('10% center')).toEqual({x: 4, y: 40});
      expect(getAnchor('center left')).toEqual({x: 0, y: 40});
    });

    it('ignores the position of regions with an origin', () => {
      const body = parse(
          '<layout><region xml:id="r1" tts:origin="5% 5%" ' +
          'tts:extent="60% 20%" tts:position="center"/></layout>',
          '<body region="r1"><div>' +
          '<p begin="0s" end="1s">Test</p>' +
          '</div></body>');
      expect(body.region.viewportAnchorX).toBe(5);
      expect(body.region.viewportAnchorY).toBe(5);
    });

    it('presents the content of documents which do not use regions', () => {
      const body = parse(
          '<layout><region xml:id="r1"/></layout>',
          '<body><div>' +
          '<p begin="0s" end="1s">Shown</p>' +
          '</div></body>');
      expect(body.nestedCues[0].nestedCues[0].payload).toBe('Shown');
    });
  });

  it('supports no cues', () => {
    verifyHelper([],
        '<tt></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {});
  });

  it('supports empty text string', () => {
    verifyHelper([],
        '',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {});
  });

  it('supports div with no cues but whitespace', () => {
    verifyHelper(
        [],
        '<tt><body><div>  \r\n </div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
              // The spaces at the start and at the end of a line are removed.
              payload: 'A B C',
              startTime: 62.03,
              endTime: 62.05,
            }],
            payload: '',
          },
        ],
        '<tt xml:space="default">' + ttBody + '</tt>',
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 70,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 70,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 70,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 70,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 62.05, endTime: 3723.2});
  });

  it('supports colon formatted time with 0 or 1 dp', () => {
    verifyHelper(
        [
          {startTime: 62, endTime: 3723.2, payload: 'Test'},
        ],
        '<tt><body><div>' +
        '<p begin="01:02" end="01:02:03.2">Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 62, endTime: 3723.2});
  });

  it('accounts for offset', () => {
    verifyHelper(
        [
          {startTime: 69.05, endTime: 3730.2, payload: 'Test'},
        ],
        '<tt><body><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 7,
          segmentStart: 60,
          segmentEnd: 3740,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 7,
          segmentStart: 60,
          segmentEnd: 3740,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 3560,
          segmentEnd: 5410,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 3567.03, endTime: 5402.3});
  });

  it('supports time in milliseconds', () => {
    verifyHelper(
        [
          {startTime: 0.5, endTime: 1.25, payload: 'Test'},
        ],
        '<tt><body><div>' +
        '<p begin="500ms" end="1250ms">Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0.5, endTime: 1.25});
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
        {
          periodStart: 0,
          segmentStart: 610,
          segmentEnd: 670,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 610,
          segmentEnd: 670,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 610,
          segmentEnd: 670,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 20,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 70,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 62.05, endTime: 67.05});
  });

  it('supports comments in the body', () => {
    verifyHelper(
        [],
        '<tt><body><div>' +
        '<!-- text-based TTML -->' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 50,
            height: 84,
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {
          region: {
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 50,
            height: 84,
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {
          region: {
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 50,
            height: 84,
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            regionAnchorX: 0,
            regionAnchorY: 0,
            width: 50,
            height: 84,
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 50,
            height: 84,
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {
          region: {
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 50,
            height: 84,
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {
          region: {
            viewportAnchorX: 50,
            viewportAnchorY: 16,
            width: 50,
            height: 84,
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {
          region: {
            id: 'subtitleArea',
            viewportAnchorX: 12.2,
            viewportAnchorY: 50.005,
            width: 87.8,
            height: 49.995,
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
            // "tb" is the same as "tbrl".
            writingMode: Cue.writingMode.VERTICAL_RIGHT_TO_LEFT,
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});

    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            // The direction of the content overrides the one of the writing
            // mode.
            direction: Cue.direction.HORIZONTAL_RIGHT_TO_LEFT,
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('supports unicodeBidi and the direction of the content', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: '',
            // The direction of the content overrides the one of the writing
            // mode of the region.
            direction: Cue.direction.HORIZONTAL_RIGHT_TO_LEFT,
            unicodeBidi: 'bidi-override',
            nestedCues: [
              // The direction is inherited, unlike unicodeBidi.
              {
                payload: 'A \u200b',
                direction: Cue.direction.HORIZONTAL_RIGHT_TO_LEFT,
                unicodeBidi: '',
              },
              {
                payload: 'B',
                direction: Cue.direction.HORIZONTAL_LEFT_TO_RIGHT,
                unicodeBidi: 'embed',
              },
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head><layout>' +
        '<region xml:id="r1" tts:writingMode="lrtb" tts:unicodeBidi="embed"/>' +
        '</layout></head>' +
        '<body><div>' +
        '<p begin="0s" end="1s" region="r1" tts:direction="rtl" ' +
        'tts:unicodeBidi="bidiOverride">' +
        'A <span tts:direction="ltr" tts:unicodeBidi="embed">B</span></p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1});
  });

  it('supports textCombine setting', () => {
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            textCombineUpright: 'all',
            writingMode: Cue.writingMode.VERTICAL_RIGHT_TO_LEFT,
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 62.05, endTime: 3723.2},
        {
          startTime: 62.05,
          endTime: 3723.2,
          backgroundImage: 'https://bar/img_0.png',
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 70,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 62.05, endTime: 3723.2});
  });

  it('supports the alignment, position and delimiters of ruby', () => {
    verifyHelper(
        [{
          startTime: 1,
          endTime: 2,
          payload: '',
          nestedCues: [{
            rubyTag: 'ruby',
            // The initial value of tts:rubyAlign.
            rubyAlign: 'center',
            nestedCues: [
              {payload: 'Base', rubyTag: null},
              {payload: '(', rubyTag: 'rp'},
              {
                payload: 'Text',
                rubyTag: 'rt',
                rubyAlign: 'center',
                // The initial value of tts:rubyPosition.
                rubyPosition: Cue.rubyPosition.OUTSIDE,
              },
              {payload: ')', rubyTag: 'rp'},
            ],
          }, {
            rubyTag: 'ruby',
            rubyAlign: 'space-around',
            nestedCues: [
              {payload: 'Base'},
              {
                payload: 'Text',
                rubyTag: 'rt',
                rubyAlign: 'space-around',
                rubyPosition: Cue.rubyPosition.AFTER,
              },
            ],
          }],
        }],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling"><body><div>' +
        '<p begin="00:01.00" end="00:02.00">' +
        '<span tts:ruby="container"><span tts:ruby="base">Base</span>' +
        '<span tts:ruby="delimiter">(</span>' +
        '<span tts:ruby="text">Text</span>' +
        '<span tts:ruby="delimiter">)</span></span>' +
        '<span tts:ruby="container" tts:rubyAlign="spaceAround">' +
        '<span tts:ruby="base">Base</span>' +
        '<span tts:ruby="text" tts:rubyPosition="after">Text</span>' +
        '</span></p></div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 1, endTime: 2});
  });

  it('rearranges ruby containers into one ruby per base', () => {
    verifyHelper(
        [{
          startTime: 1,
          endTime: 2,
          payload: '',
          nestedCues: [{
            // The ruby container only holds the rubies.
            rubyTag: null,
            nestedCues: [{
              rubyTag: 'ruby',
              nestedCues: [{
                // The annotations of the second text container are nested.
                rubyTag: 'ruby',
                nestedCues: [
                  {payload: 'B1'},
                  {
                    payload: 'A1',
                    rubyTag: 'rt',
                    rubyPosition: Cue.rubyPosition.AFTER,
                  },
                ],
              }, {
                payload: 'T1',
                rubyTag: 'rt',
                rubyPosition: Cue.rubyPosition.BEFORE,
                // It is kept from its text container.
                fontSize: '0.5c',
              }],
            }, {
              rubyTag: 'ruby',
              nestedCues: [{
                rubyTag: 'ruby',
                nestedCues: [
                  {payload: 'B2'},
                  {payload: 'A2', rubyTag: 'rt'},
                ],
              }, {
                payload: 'T2',
                rubyTag: 'rt',
                fontSize: '0.5c',
              }],
            }],
          }],
        }],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling"><body><div>' +
        '<p begin="00:01.00" end="00:02.00">' +
        '<span tts:ruby="container">' +
        '<span tts:ruby="baseContainer">' +
        '<span tts:ruby="base">B1</span><span tts:ruby="base">B2</span>' +
        '</span>' +
        '<span tts:ruby="textContainer" tts:rubyPosition="before" ' +
        'tts:fontSize="0.5c">' +
        '<span tts:ruby="text">T1</span><span tts:ruby="text">T2</span>' +
        '</span>' +
        '<span tts:ruby="textContainer" tts:rubyPosition="after">' +
        '<span tts:ruby="text">A1</span><span tts:ruby="text">A2</span>' +
        '</span>' +
        '</span></p></div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 1, endTime: 2});
  });

  it('supports tts:rubyReserve', () => {
    verifyHelper(
        [
          // The annotations are half the font size by default.
          {
            startTime: 1,
            endTime: 2,
            payload: 'Test',
            rubyReserve: 'both 0.5em',
          },
          // A percentage is relative to the font size.
          {startTime: 2, endTime: 3, payload: 'Test', rubyReserve: 'after 1em'},
          {
            startTime: 3,
            endTime: 4,
            payload: 'Test',
            rubyReserve: 'outside 1c',
          },
          {startTime: 4, endTime: 5, payload: 'Test', rubyReserve: ''},
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling"><body><div>' +
        '<p begin="00:01.00" end="00:02.00" tts:rubyReserve="both">Test</p>' +
        '<p begin="00:02.00" end="00:03.00" tts:rubyReserve="after 100%">' +
        'Test</p>' +
        '<p begin="00:03.00" end="00:04.00" tts:rubyReserve="outside 1c">' +
        'Test</p>' +
        '<p begin="00:04.00" end="00:05.00" tts:rubyReserve="none">Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 1, endTime: 5});
  });

  it('defaults the font size to one cell and the font family', () => {
    const time = {
      periodStart: 0,
      segmentStart: 0,
      segmentEnd: 10,
      vttOffset: 0,
      isMpegTs: false,
    };
    verifyHelper(
        [{startTime: 1, endTime: 2, payload: 'Test', fontSize: ''}],
        '<tt><body><div>' +
        '<p begin="00:01.00" end="00:02.00">Test</p>' +
        '</div></body></tt>',
        time,
        // The content inherits them from the body.
        {
          startTime: 1,
          endTime: 2,
          fontSize: '1c',
          fontFamily: 'Courier New,Liberation Mono,Courier,monospace',
        },
        {startTime: 1, endTime: 2, fontSize: ''});
    verifyHelper(
        [{startTime: 1, endTime: 2, payload: 'Test'}],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<body tts:fontSize="2c" tts:fontFamily="sansSerif"><div>' +
        '<p begin="00:01.00" end="00:02.00">Test</p>' +
        '</div></body></tt>',
        time,
        {startTime: 1, endTime: 2, fontSize: '2c', fontFamily: 'sans-serif'},
        {startTime: 1, endTime: 2, fontSize: ''});
  });

  it('supports font sizes and line heights relative to the root container',
      () => {
        verifyHelper(
            [{
              startTime: 1,
              endTime: 2,
              payload: 'Test',
              fontSize: '6.667rh',
              lineHeight: '7rh',
            }, {
              startTime: 2,
              endTime: 3,
              payload: 'Test',
              fontSize: '5rw',
            }],
            '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling"><body><div>' +
            '<p begin="00:01.00" end="00:02.00" tts:fontSize="6.667rh" ' +
            'tts:lineHeight="7rh">Test</p>' +
            '<p begin="00:02.00" end="00:03.00" tts:fontSize="5rw">Test</p>' +
            '</div></body></tt>',
            {
              periodStart: 0,
              segmentStart: 0,
              segmentEnd: 10,
              vttOffset: 0,
              isMpegTs: false,
            },
            {startTime: 1, endTime: 3});
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 1, endTime: 2});
  });

  it('uses inherited text color if span tts:textOutline omits color', () => {
    verifyHelper(
        [
          {
            startTime: 1,
            endTime: 2,
            payload: '',
            nestedCues: [
              {
                payload: 'Test',
                textStrokeColor: 'red',
                textStrokeWidth: '3px',
              },
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<body region="subtitleArea"><div>' +
        '<p begin="00:01.00" end="00:02.00" tts:color="red">' +
        '<span tts:textOutline="3px">Test</span></p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 1, endTime: 2});
  });

  it('translates alpha level between TTML rgba() and HTML rgba()', () => {
    verifyHelper(
        [
          {
            startTime: 1,
            endTime: 2,
            backgroundColor: '',
            nestedCues: [{
              payload: 'alpha value',
              color: 'rgba(255,255,255,1)',
              backgroundColor: 'rgba(0,128,128,0.4)',
              textStrokeColor: 'rgba(0,0,0,0.8)',
              textStrokeWidth: '3px',
            }],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head><styling>' +
        '<style xml:id="style_1" tts:color="rgba(255,255,255,255)" ' +
        'tts:textOutline="rgba(0,0,0,204) 3px" ' +
        'tts:backgroundColor="rgba(0,128,128,102) "' +
        '/></styling>' +
        '</head><body><div>' +
        '<p tts:textAlign="center" begin="00:01.00" end="00:02.00">' +
        '<span style="style_1">alpha value</span></p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 62.05, endTime: 3723.2, region: {id: 'subtitleArea'}},
        {startTime: 62.05, endTime: 3723.2});
  });

  it('parses lineThrough text decoration', () => {
    // Regression test: ensure tts:textDecoration="lineThrough" produces a cue
    // whose textDecoration array contains the LINE_THROUGH enum value.  The
    // existing 'parses text decoration' test combined lineThrough with
    // noLineThrough to test removal, so it never asserted the positive case.
    verifyHelper(
        [
          {
            startTime: 62.05,
            endTime: 3723.2,
            payload: 'Test',
            textDecoration: [Cue.textDecoration.LINE_THROUGH],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<styling>' +
        '<style xml:id="s1" tts:textDecoration="lineThrough"/>' +
        '</styling>' +
        '<layout>' +
        '<region xml:id="subtitleArea" style="s1"/>' +
        '</layout>' +
        '<body region="subtitleArea"><div>' +
        '<p begin="01:02.05" end="01:02:03.200">Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 60,
          segmentEnd: 3730,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        // Without an end, the body and the div end with their children.
        {startTime: 1, endTime: 8},
        {startTime: 3, endTime: 8});

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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 20,
          vttOffset: 0,
          isMpegTs: false,
        },
        // Without an end, the body and the div end with their children.
        {startTime: 1, endTime: 12},
        {startTime: 3, endTime: 12});
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 30,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 9000,
          vttOffset: 0,
          isMpegTs: false,
        },
        // Capped to segment end time.
        {startTime: 1, endTime: 9000});
  });

  it('supports sequential time containers', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'First cue'},
          // Begins 1 second after the end of the previous cue.
          {startTime: 3, endTime: 5, payload: 'Second cue'},
        ],
        '<tt><body><div timeContainer="seq">' +
        '<p dur="2s">First cue</p>' +
        '<p begin="1s" dur="2s">Second cue</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 5});
  });

  it('gives no duration to anonymous spans in sequential containers', () => {
    verifyHelper(
        [
          {
            startTime: 1,
            endTime: 6,
            payload: '',
            nestedCues: [
              // The text before the span is not shown, and does not delay it.
              {startTime: 1, endTime: 3, payload: 'Shown'},
            ],
          },
        ],
        '<tt><body><div>' +
        '<p begin="1s" dur="5s" timeContainer="seq">' +
        'Hidden<span dur="2s">Shown</span>' +
        '</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 1, endTime: 6});
  });

  it('supports namespace aliases in animations', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test', color: 'white'},
          {startTime: 2, endTime: 4, payload: 'Test', color: 'red'},
          {startTime: 4, endTime: 6, payload: 'Test', color: 'blue'},
        ],
        '<tt xmlns:s="http://www.w3.org/ns/ttml#styling">' +
        '<head><styling>' +
        '<style xml:id="blue" s:color="blue"/>' +
        '</styling></head>' +
        '<body><div>' +
        '<p begin="0s" end="6s" s:color="white">' +
        '<set begin="2s" end="4s" s:color="red"/>' +
        '<set begin="4s" end="6s" style="blue"/>Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 6});
  });

  it('does not let animations advance sequential time containers', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: '',
            color: 'red',
            nestedCues: [
              {startTime: 0, endTime: 1, payload: 'A'},
            ],
          },
          {
            startTime: 1,
            endTime: 2,
            payload: '',
            nestedCues: [
              {startTime: 1, endTime: 2, payload: 'B'},
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<body><div>' +
        '<p timeContainer="seq">' +
        '<span dur="1s">A</span>' +
        '<set begin="0s" end="1s" tts:color="red"/>' +
        '<span dur="1s">B</span>' +
        '</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 2});
  });

  it('clips the times of an element to the times of its parent', () => {
    verifyHelper(
        [
          // Ends with its parent.
          {startTime: 2, endTime: 5, payload: 'Truncated'},
          // A cue which begins after the end of its parent is not shown.
        ],
        '<tt><body><div begin="1s" end="5s">' +
        '<p begin="1s" end="10s">Truncated</p>' +
        '<p begin="5s" end="6s">Hidden</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 1, endTime: 5});
  });

  it('ends at the earliest of the end and the duration', () => {
    verifyHelper(
        [
          {startTime: 1, endTime: 3, payload: 'End first'},
          {startTime: 1, endTime: 3, payload: 'Duration first'},
        ],
        '<tt><body><div>' +
        '<p begin="1s" end="3s" dur="5s">End first</p>' +
        '<p begin="1s" end="5s" dur="2s">Duration first</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 1, endTime: 3});
  });

  it('does not present elements which are not content', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 1, payload: 'Text'},
        ],
        '<tt xmlns="http://www.w3.org/ns/ttml" ' +
        'xmlns:ttm="http://www.w3.org/ns/ttml#metadata" ' +
        'xmlns:tts="http://www.w3.org/ns/ttml#styling" ' +
        'xmlns:foo="urn:foo">' +
        '<body><div>' +
        '<metadata><ttm:desc>Description</ttm:desc></metadata>' +
        '<p begin="0s" end="1s">Text<foo:bar>Foreign</foo:bar>' +
        '<set begin="0s" dur="1s" tts:color="red"/></p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1});
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
            // The background of the region is painted on the region.
            backgroundColor: '',
            region: {id: 'r1', backgroundColor: 'transparent'},
            color: 'blue',
            displayAlign: Cue.displayAlign.CENTER,
            textAlign: Cue.textAlign.CENTER,

            nestedCues: [
              {
                startTime: 0,
                endTime: 60,
                payload: 'Test with regionStyle',
                // Style inherited from regionStyle.
                backgroundColor: '',
                color: 'blue',
                displayAlign: Cue.displayAlign.CENTER,
                fontSize: '15px',
                textAlign: Cue.textAlign.CENTER,
              },
              {
                startTime: 0,
                endTime: 60,
                // The space between the spans, which can be broken.
                payload: ' \u200b',
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 60,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 60,
          vttOffset: 0,
          isMpegTs: false,
        },
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
                // The spaces at the start and at the end of a line are
                // removed.
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
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 60,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 60});
  });

  it('inherits the font style and weight of the ancestors', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: '',
            fontStyle: Cue.fontStyle.ITALIC,
            fontWeight: Cue.fontWeight.BOLD,
            nestedCues: [
              {
                payload: 'Anonymous \u200b',
                fontStyle: Cue.fontStyle.ITALIC,
                fontWeight: Cue.fontWeight.BOLD,
              },
              {
                payload: 'Styled',
                color: 'red',
                fontStyle: Cue.fontStyle.ITALIC,
                fontWeight: Cue.fontWeight.BOLD,
              },
              {
                payload: 'Normal',
                fontStyle: Cue.fontStyle.NORMAL,
                fontWeight: Cue.fontWeight.NORMAL,
              },
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head><styling>' +
        '<style xml:id="italic" tts:fontStyle="italic"/>' +
        '<style xml:id="red" tts:color="red"/>' +
        '</styling></head>' +
        '<body style="italic"><div>' +
        '<p begin="0s" end="1s" tts:fontWeight="bold">' +
        'Anonymous <span style="red">Styled</span>' +
        '<span tts:fontStyle="normal" tts:fontWeight="normal">Normal</span>' +
        '</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1});
  });

  it('lets an element remove the text decoration of its ancestors', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: '',
            // The decoration is applied to the text only.
            textDecoration: [],
            nestedCues: [
              {
                payload: 'Underlined \u200b',
                textDecoration: [
                  Cue.textDecoration.OVERLINE,
                  Cue.textDecoration.UNDERLINE,
                ],
              },
              {
                payload: 'Overlined',
                textDecoration: [Cue.textDecoration.OVERLINE],
              },
              {
                payload: 'None',
                textDecoration: [],
              },
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<body><div tts:textDecoration="overline">' +
        '<p begin="0s" end="1s" tts:textDecoration="underline">' +
        'Underlined ' +
        '<span tts:textDecoration="noUnderline">Overlined</span>' +
        '<span tts:textDecoration="none">None</span>' +
        '</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1},
        {startTime: 0, endTime: 1, textDecoration: []});
  });

  it('lets an element remove the outline of its parent', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: '',
            textStrokeColor: 'red',
            textStrokeWidth: '2px',
            nestedCues: [
              {payload: 'Outlined \u200b'},
              {payload: 'Not outlined', textStrokeWidth: '0'},
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<body><div>' +
        '<p begin="0s" end="1s" tts:textOutline="red 2px">' +
        'Outlined <span tts:textOutline="none">Not outlined</span>' +
        '</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1});
  });

  it('parses text shadows and outlines relative to the font size', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: 'Test',
            textStrokeColor: 'red',
            textStrokeWidth: '0.05em',
            textShadow: '0.1em -0.2em 0.05em lime, 1px 1px rgba(0,0,0,0.5)',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<body><div>' +
        '<p begin="0s" end="1s" tts:textOutline="red 5%" ' +
        'tts:textShadow="10% -20% 5% lime, 1px 1px rgba(0, 0, 0, 127.5)">' +
        'Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1});
  });

  it('splits the cues of animated elements', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test', color: 'white'},
          {startTime: 2, endTime: 4, payload: 'Test', color: 'yellow'},
          {startTime: 4, endTime: 6, payload: 'Test', color: 'white'},
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<body><div>' +
        '<p begin="0s" end="6s" tts:color="white">' +
        '<set begin="2s" end="4s" tts:color="yellow"/>Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 6});
  });

  it('preserves element styling when animated with a style reference', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 2,
            payload: 'Test',
            color: 'white',
            fontSize: '20px',
          },
          {
            startTime: 2,
            endTime: 4,
            payload: 'Test',
            color: 'yellow',
            fontSize: '20px',
          },
          {
            startTime: 4,
            endTime: 6,
            payload: 'Test',
            color: 'white',
            fontSize: '20px',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head><styling>' +
        '<style xml:id="base" tts:fontSize="20px" tts:color="white"/>' +
        '<style xml:id="highlight" tts:color="yellow"/>' +
        '</styling></head>' +
        '<body><div>' +
        '<p begin="0s" end="6s" style="base">' +
        '<set begin="2s" end="4s" style="highlight"/>Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 6});
  });

  it('does not present elements which are not displayed', () => {
    verifyHelper(
        [
          // Only displayed after 2 seconds.
          {
            startTime: 2,
            endTime: 6,
            payload: '',
            nestedCues: [{startTime: 2, endTime: 6, payload: 'Shown'}],
          },
          // The paragraph without its hidden span.
          {startTime: 0, endTime: 6, payload: '', nestedCues: []},
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<body><div>' +
        '<p begin="0s" end="6s" tts:display="none">' +
        '<set begin="2s" tts:display="auto"/><span>Shown</span></p>' +
        '<p begin="0s" end="6s"><span tts:display="none">Hidden</span></p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 6});
  });

  it('parses the visibility', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: '',
            visibility: 'hidden',
            nestedCues: [
              // The visibility of the parent is inherited by the displayer.
              {payload: 'Hidden \u200b', visibility: ''},
              {payload: 'Visible', visibility: 'visible'},
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<body><div>' +
        '<p begin="0s" end="1s" tts:visibility="hidden">' +
        'Hidden <span tts:visibility="visible">Visible</span></p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1});
  });

  it('presents the spaces between texts while both are presented', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 2,
            payload: '',
            nestedCues: [
              // The space at the end of a text is presented with the next
              // text, like the words of a roll-up caption.
              {payload: 'One', startTime: 0, endTime: 2},
              {payload: ' \u200b', startTime: 1, endTime: 2},
              {payload: 'two', startTime: 1, endTime: 2},
            ],
          },
          {
            startTime: 2,
            endTime: 4,
            payload: '',
            nestedCues: [
              // The white space between two elements is presented while both
              // are.
              {payload: 'three', startTime: 2, endTime: 3},
              {payload: ' \u200b', startTime: 2, endTime: 3},
              {payload: 'four', startTime: 2, endTime: 4},
            ],
          },
        ],
        '<tt>' +
        '<body><div>' +
        '<p begin="0s" end="2s">\n' +
        '  <span>One </span><span begin="1s">two</span>\n' +
        '</p>' +
        '<p begin="2s" end="4s">\n' +
        '  <span end="1s">three</span>\n' +
        '  <span>four</span>\n' +
        '</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 4});
  });

  it('animates regions', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 1, payload: 'Test', region: {opacity: 0}},
          {startTime: 1, endTime: 2, payload: 'Test', region: {opacity: 0.5}},
          {startTime: 2, endTime: 3, payload: 'Test', region: {opacity: 0}},
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head><layout>' +
        '<region xml:id="r1" tts:opacity="0">' +
        '<set begin="1s" end="2s" tts:opacity="0.5"/>' +
        '</region>' +
        '</layout></head>' +
        '<body><div>' +
        '<p begin="0s" end="3s" region="r1">Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 3});
  });

  for (const target of ['element', 'region']) {
    it(`preserves overlapping ${target} animations with an offset`, () => {
      const sets =
          '<set begin="1s" end="4s" tts:opacity="0.5"/>' +
          '<set begin="2s" end="3s" tts:opacity="0.75"/>' +
          '<set begin="6s" tts:opacity="0.25"/>';
      const region = target == 'region';
      verifyHelper(
          [
            [10, 11, 1],
            [11, 12, 0.5],
            [12, 13, 0.75],
            [13, 14, 0.5],
            [14, 16, 1],
            [16, 18, 0.25],
          ].map(([startTime, endTime, opacity]) => Object.assign(
              {startTime, endTime, payload: 'Test'},
              region ? {region: {opacity}} : {opacity})),
          '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
          '<head><layout><region xml:id="r1">' +
          (region ? sets : '') + '</region></layout></head>' +
          '<body><div><p begin="0s" end="8s" region="r1">' +
          (region ? '' : sets) + 'Test</p></div></body></tt>',
          {
            periodStart: 10,
            segmentStart: 10,
            segmentEnd: 18,
            vttOffset: 0,
            isMpegTs: false,
          },
          {startTime: 10, endTime: 18});
    });
  }

  it('presents the initial font in the regions of nested content', () => {
    verifyHelper(
        [{startTime: 0, endTime: 1, payload: 'Test'}],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head><layout><region xml:id="r1"/></layout></head>' +
        '<body><div region="r1">' +
        '<p begin="0s" end="1s">Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1, fontSize: '1c'},
        {
          startTime: 0,
          endTime: 1,
          region: {id: 'r1'},
          fontSize: '1c',
          fontFamily: 'Courier New,Liberation Mono,Courier,monospace',
        });
  });

  it('supports multiRowAlign', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: 'Test',
            // The block is at the end, and its lines are aligned to its start.
            positionAlign: Cue.positionAlign.RIGHT,
            textAlign: Cue.textAlign.START,
          },
          {
            startTime: 1,
            endTime: 2,
            payload: 'Test',
            // The start of right to left text is on the right.
            positionAlign: Cue.positionAlign.RIGHT,
            textAlign: Cue.textAlign.END,
          },
          {
            startTime: 2,
            endTime: 3,
            payload: 'Test',
            positionAlign: Cue.positionAlign.CENTER,
            textAlign: Cue.textAlign.CENTER,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling" ' +
        'xmlns:ebutts="urn:ebu:tt:style">' +
        '<head><styling>' +
        '<style xml:id="s1" tts:textAlign="end" ' +
        'ebutts:multiRowAlign="start"/>' +
        '<style xml:id="s2" ebutts:multiRowAlign="end"/>' +
        '<style xml:id="s3" ebutts:multiRowAlign="auto"/>' +
        '</styling></head>' +
        '<body><div>' +
        '<p begin="0s" end="1s" style="s1">Test</p>' +
        '<p begin="1s" end="2s" style="s2" tts:direction="rtl" ' +
        'tts:textAlign="start">Test</p>' +
        '<p begin="2s" end="3s" style="s3" tts:textAlign="center">Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 3});
  });

  it('scales lengths in pixels with the extent of the root container', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: 'Test',
            fontSize: '5rh',
            lineHeight: '7.5rh',
            textStrokeWidth: '0.5rh',
            letterSpacing: '5rw',
            textShadow: '5rw -5rh 0.5rh red, -5rw 5rh blue',
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling" ' +
        'tts:extent="640px 480px">' +
        '<body><div>' +
        '<p begin="0s" end="1s" tts:fontSize="24px" tts:lineHeight="36px" ' +
        'tts:textOutline="red 2.4px" tts:letterSpacing="32px" ' +
        'tts:textShadow="32px -24px 2.4px red, -32px 24px blue">Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1});
  });

  it('supports styles nested in regions', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: 'Test',
            color: 'red',
            displayAlign: Cue.displayAlign.CENTER,
            // The attribute of the region takes precedence.
            textAlign: Cue.textAlign.END,
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head><layout>' +
        '<region xml:id="r1" tts:textAlign="end">' +
        '<style tts:color="blue" tts:origin="10% 20%"/>' +
        '<style tts:color="red" tts:extent="50% 30%" ' +
        'tts:textAlign="start"/>' +
        '<style tts:displayAlign="center"/>' +
        '</region>' +
        '</layout></head>' +
        '<body region="r1"><div>' +
        '<p begin="0s" end="1s">Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {
          startTime: 0,
          endTime: 1,
          region: {
            id: 'r1',
            viewportAnchorX: 10,
            viewportAnchorY: 20,
            width: 50,
            height: 30,
          },
        },
        {startTime: 0, endTime: 1});
  });

  it('parses line height in percentage on paragraphs only', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 1, payload: 'Test', lineHeight: '125%'},
          {
            startTime: 1,
            endTime: 2,
            payload: '',
            // The initial line height is "normal".
            lineHeight: 'normal',
            nestedCues: [
              // The line height does not apply to spans.
              {payload: 'Span', lineHeight: ''},
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<body><div>' +
        '<p begin="0s" end="1s" tts:lineHeight="125%">Test</p>' +
        '<p begin="1s" end="2s">' +
        '<span tts:lineHeight="200%">Span</span>' +
        '</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 2});
  });

  it('inherits the wrap option of the ancestors', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: '',
            wrapLine: false,
            nestedCues: [
              {payload: 'Anonymous \u200b', wrapLine: false},
              {payload: 'Span', wrapLine: false},
              {payload: 'Wrapped', wrapLine: true},
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<body><div>' +
        '<p begin="0s" end="1s" tts:wrapOption="noWrap">' +
        'Anonymous <span>Span</span>' +
        '<span tts:wrapOption="wrap">Wrapped</span>' +
        '</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1});
  });

  it('resolves font size percentages relative to the parent', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: '',
            // 150% of the 50% of the region.
            fontSize: '75%',
            nestedCues: [
              {payload: 'Inherited \u200b', fontSize: '75%'},
              // 200% of the 75% of the paragraph.
              {payload: 'Relative', fontSize: '150%'},
              {
                payload: '',
                fontSize: '20px',
                nestedCues: [
                  // 50% of the 20px of the parent.
                  {payload: 'Pixels', fontSize: '10px'},
                ],
              },
            ],
          },
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head>' +
        '<styling><style xml:id="s1" tts:fontSize="20px"/></styling>' +
        '<layout><region xml:id="r1" tts:fontSize="50%"/></layout>' +
        '</head>' +
        '<body region="r1"><div>' +
        '<p begin="0s" end="1s" tts:fontSize="150%">' +
        'Inherited <span tts:fontSize="200%">Relative</span>' +
        '<span style="s1"><span tts:fontSize="50%">Pixels</span></span>' +
        '</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1, region: {id: 'r1'}},
        {startTime: 0, endTime: 1});
  });

  it('does not inherit the background color of the ancestors', () => {
    verifyHelper(
        [
          // The background of the div is painted behind it.
          {startTime: 0, endTime: 1, payload: 'Test', backgroundColor: ''},
        ],
        '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling">' +
        '<head><styling>' +
        '<style xml:id="s1" tts:backgroundColor="green"/>' +
        '</styling></head>' +
        '<body><div style="s1" tts:backgroundColor="blue">' +
        '<p begin="0s" end="1s">Test</p>' +
        '</div></body></tt>',
        {
          periodStart: 0,
          segmentStart: 0,
          segmentEnd: 10,
          vttOffset: 0,
          isMpegTs: false,
        },
        {startTime: 0, endTime: 1},
        // The inline style takes precedence over the referenced style.
        {startTime: 0, endTime: 1, backgroundColor: 'blue'});
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
        {
          periodStart: 0,
          segmentStart: 160,
          segmentEnd: 170,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        {
          periodStart: 0,
          segmentStart: 170,
          segmentEnd: 180,
          vttOffset: 0,
          isMpegTs: false,
        },
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
        .parseMedia(data, time, 'https://bar', /* images= */ []);
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
          {
            periodStart: 0,
            segmentStart: 0,
            segmentEnd: 10,
            vttOffset: 0,
            isMpegTs: false,
          },
          'https://bar', /* images= */ []);
    }).toThrow(error);
  }
});
