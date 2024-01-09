/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('tXml', () => {

    const TXml = shaka.util.TXml;
    const XmlUtils = shaka.util.XmlUtils;

    describe('findChild', () => {
        it('finds a child node', () => {
            const xmlString = [
                '<?xml version="1.0"?>',
                '<Root>',
                '  <Child></Child>',
                '</Root>',
            ].join('\n');
            const root = TXml.parseXmlString(xmlString, 'Root');
            goog.asserts.assert(root, 'parseFromString should succeed');

            expect(TXml.findChild(root, 'Child')).toBeTruthy();
            expect(TXml.findChild(root, 'DoesNotExist')).toBeNull();
        });

        it('handles duplicate child nodes', () => {
            const xmlString = [
                '<?xml version="1.0"?>',
                '<Root>',
                '  <Child></Child>',
                '  <Child></Child>',
                '</Root>',
            ].join('\n');
            const root = TXml.parseXmlString(xmlString, 'Root');
            goog.asserts.assert(root, 'parseFromString should succeed');

            expect(TXml.findChild(root, 'Child')).toBeNull();
        });
    });

    it('findChildren', () => {
        const xmlString = [
            '<?xml version="1.0"?>',
            '<Root>',
            '  <Child></Child>',
            '  <Child></Child>',
            '</Root>',
        ].join('\n');
        const root = TXml.parseXmlString(xmlString, 'Root');
        goog.asserts.assert(root, 'parseFromString should succeed');

        expect(root).toBeTruthy();

        let children = TXml.findChildren(root, 'Child');
        expect(children.length).toBe(2);

        children = TXml.findChildren(root, 'DoesNotExist');
        expect(children.length).toBe(0);
    });

    describe('getContents', () => {
        it('returns node contents', () => {
            const xmlString = [
                '<?xml version="1.0"?>',
                '<Root>',
                '  foo bar',
                '</Root>',
            ].join('\n');
            const root = TXml.parseXmlString(xmlString, 'Root');
            goog.asserts.assert(root, 'parseFromString should succeed');

            expect(TXml.getContents(root)).toBe('foo bar');
        });

        it('handles empty node contents', () => {
            const xmlString = [
                '<?xml version="1.0"?>',
                '<Root>',
                '</Root>',
            ].join('\n');
            const root = TXml.parseXmlString(xmlString, 'Root');
            goog.asserts.assert(root, 'parseFromString should succeed');

            expect(TXml.getContents(root)).toBeNull();
        });

        it('handles null node contents', () => {
            const xmlString = [
                '<?xml version="1.0"?>',
                '<Root>',
                '</Root>',
            ].join('\n');
            const xml = TXml.parseXmlString(xmlString, 'Root');
            goog.asserts.assert(xml, 'parseFromString should succeed');

            expect(TXml.getContents(xml)).toBeNull();
        });

        it('handles CDATA sections', () => {
            const xmlString = [
                '<?xml version="1.0"?>',
                '<Root>',
                '<![CDATA[<Foo> Bar]]>',
                '</Root>',
            ].join('\n');
            const root = TXml.parseXmlString(xmlString, 'Root');
            goog.asserts.assert(root, 'parseFromString should succeed');

            expect(TXml.getContents(root)).toBe('<Foo> Bar');
        });
    });

    describe('parseAttr', () => {
        /** @type {!Document} */
        let xml;

        beforeEach(() => {
            const xmlString = [
                '<?xml version="1.0"?>',
                '<Root a="2-7" b="-5" c="">',
                '</Root>',
            ].join('\n');
            xml = /** @type {!Document} */ (
                TXml.parseXmlString(xmlString, 'Root'));
        });

        it('delegates to parser function', () => {
            const root = xml;
            expect(TXml.parseAttr(root, 'a', XmlUtils.parseRange)).toEqual(
                {start: 2, end: 7});
            expect(TXml.parseAttr(root, 'b', XmlUtils.parseInt)).toBe(-5);
            expect(TXml.parseAttr(root, 'c', XmlUtils.parseInt)).toBe(0);
            expect(TXml.parseAttr(root, 'd', XmlUtils.parseInt)).toBeNull();
        });

        it('supports default values', () => {
            const root = xml;
            goog.asserts.assert(root, 'findChild should find element');
            expect(TXml.parseAttr(root, 'd', XmlUtils.parseInt, 9)).toBe(9);
        });
    });

    describe('parseXmlString', () => {
        it('parses a simple XML document', () => {
            const xmlString = [
                '<?xml version="1.0"?>',
                '<Root>',
                '  <Child></Child>',
                '</Root>',
            ].join('\n');
            const root = TXml.parseXmlString(xmlString, 'Root');
            goog.asserts.assert(root, 'parseFromString should succeed');

            expect(root.tagName).toBe('Root');
        });

        it('returns null on an empty XML document', () => {
            const xmlString = '';
            const doc = TXml.parseXmlString(xmlString, 'Root');
            expect(doc).toBeNull();
        });

        it('returns null on root element mismatch', () => {
            const xmlString = [
                '<?xml version="1.0"?>',
                '<Root>',
                '  <Child></Child>',
                '</Root>',
            ].join('\n');
            const doc = TXml.parseXmlString(xmlString, 'Document');
            expect(doc).toBeNull();
        });
    });
});
