/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('JsonUtils', () => {
  describe('jsonToMpd', () => {
    /**
     * Parse XML into TXml node.
     * @param {string} s
     * @return {!shaka.extern.xml.Node}
     */
    function parse(s) {
      return /** @type {!shaka.extern.xml.Node} */ (
        shaka.util.TXml.parseXmlString(s));
    }

    it('serializes minimal MPD correctly', () => {
      const json = {
        profiles: 'urn:test',
        type: 'static',
      };

      const xml = parse(shaka.dash.JsonUtils.jsonToMpd(json));

      expect(xml.tagName).toBe('MPD');

      expect(xml.attributes['profiles']).toBe('urn:test');
      expect(xml.attributes['type']).toBe('static');

      expect(xml.attributes['xmlns'])
          .toBe('urn:mpeg:dash:schema:mpd:2011');
    });

    it('includes declared namespaces', () => {
      const json = {
        $ns: {
          'http://www.w3.org/1999/xlink': {
            prefix: 'xlink',
            attributes: ['href', 'actuate'],
          },
        },
        Period: [{}],
      };

      const xml = parse(shaka.dash.JsonUtils.jsonToMpd(json));

      expect(xml.attributes['xmlns:xlink'])
          .toBe('http://www.w3.org/1999/xlink');

      const periods = shaka.util.TXml.findChildren(xml, 'Period');
      expect(periods.length).toBe(1);
    });

    it('writes namespaced attributes', () => {
      const json = {
        $ns: {
          'http://www.w3.org/1999/xlink': {
            prefix: 'xlink',
            attributes: ['href', 'actuate'],
          },
        },
        Period: [{
          xlink: {
            href: 'https://example.com/period.xml',
            actuate: 'onLoad',
          },
        }],
      };

      const xml = parse(shaka.dash.JsonUtils.jsonToMpd(json));
      const period = shaka.util.TXml.findChild(xml, 'Period');

      expect(period).not.toBeNull();
      const p = /** @type {!shaka.extern.xml.Node} */ (period);

      expect(shaka.util.TXml.getAttributeNS(
          p, 'http://www.w3.org/1999/xlink', 'href'))
          .toBe('https://example.com/period.xml');

      expect(shaka.util.TXml.getAttributeNS(
          p, 'http://www.w3.org/1999/xlink', 'actuate'))
          .toBe('onLoad');
    });

    it('writes $value text and attributes for BaseURL', () => {
      const json = {
        BaseURL: [{
          $value: 'https://example.com/video/',
          availabilityTimeOffset: 7,
        }],
      };

      const xml = parse(shaka.dash.JsonUtils.jsonToMpd(json));
      const bu = shaka.util.TXml.findChild(xml, 'BaseURL');

      expect(bu).not.toBeNull();
      const b = /** @type {!shaka.extern.xml.Node} */ (bu);

      expect(b.attributes['availabilityTimeOffset']).toBe('7');
      expect(shaka.util.TXml.getContents(b))
          .toBe('https://example.com/video/');
    });

    it('writes repeated children for arrays', () => {
      const json = {
        Period: [{id: 'p1'}, {id: 'p2'}],
      };

      const xml = parse(shaka.dash.JsonUtils.jsonToMpd(json));
      const periods = shaka.util.TXml.findChildren(xml, 'Period');

      expect(periods.length).toBe(2);
      expect(periods[0].attributes['id']).toBe('p1');
      expect(periods[1].attributes['id']).toBe('p2');
    });

    it('XML-escapes text content to prevent XML injection', () => {
      // A malicious JSON value containing XML metacharacters must not be
      // interpreted as markup by the XML parser.
      const json = {
        BaseURL: [{
          $value: '</BaseURL><BaseURL>http://attacker.com/segments/',
        }],
      };

      const xml = parse(shaka.dash.JsonUtils.jsonToMpd(json));

      // Must have exactly one BaseURL element — not two.
      const baseUrls = shaka.util.TXml.findChildren(xml, 'BaseURL');
      expect(baseUrls.length).toBe(1);

      // The text content must be the literal string, not parsed as markup.
      expect(shaka.util.TXml.getContents(baseUrls[0]))
          .toBe('</BaseURL><BaseURL>http://attacker.com/segments/');
    });

    it('XML-escapes attribute values to prevent injection', () => {
      const json = {
        Period: [{
          id: 'p1" injected="yes',
        }],
      };

      const mpd = shaka.dash.JsonUtils.jsonToMpd(json);

      // The double quote must be escaped so it cannot terminate the
      // attribute value and inject a new attribute.
      expect(mpd).toContain('id="p1&quot; injected=&quot;yes"');
      expect(mpd).not.toContain('injected="yes"');

      const xml = parse(mpd);
      const period = shaka.util.TXml.findChild(xml, 'Period');
      expect(period).not.toBeNull();

      // No spurious 'injected' attribute must exist after parsing.
      expect(period.attributes['injected']).toBeUndefined();
    });

    it('writes namespaced child elements (prefix:Element)', () => {
      const json = {
        $ns: {
          'urn:custom:ext': {
            prefix: 'ext',
            attributes: ['attr1'],
          },
        },
        ext: {
          CustomElement: [{
            attr1: '123',
            $value: 'HELLO',
          }],
        },
      };

      const xml = parse(shaka.dash.JsonUtils.jsonToMpd(json));

      const el = shaka.util.TXml.findChildNS(
          xml, 'urn:custom:ext', 'CustomElement');

      expect(el).not.toBeNull();
      const ce = /** @type {!shaka.extern.xml.Node} */ (el);

      expect(ce.attributes['attr1']).toBe('123');

      expect(shaka.util.TXml.getContents(ce)).toBe('HELLO');
    });
  });
});
