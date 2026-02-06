/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('HashUtils', () => {
  const HashUtils = shaka.util.HashUtils;

  it('computes FNV-1a with default seed', () => {
    expect(HashUtils.fnv1a('a')).toBe(-468965076);
    expect(HashUtils.fnv1a('abc')).toBe(440920331);
  });

  it('honors custom seeds', () => {
    expect(HashUtils.fnv1a('a', 123)).toBe(436218094);
  });

  it('hashes TXml nodes deterministically', () => {
    const node = {
      tagName: 'Period',
      attributes: {id: 'p1', start: 'PT0S'},
      children: [{tagName: 'BaseURL', attributes: {},
        children: ['http://example.com']}],
    };
    expect(HashUtils.hashTXml(node)).toBe(1039464709);
  });

  it('ignores attribute ordering', () => {
    const ordered = {
      tagName: 'Period',
      attributes: {id: 'p1', start: 'PT0S'},
      children: [{tagName: 'BaseURL', attributes: {},
        children: ['http://example.com']}],
    };
    const shuffled = {
      tagName: 'Period',
      attributes: {start: 'PT0S', id: 'p1'},
      children: [{tagName: 'BaseURL', attributes: {},
        children: ['http://example.com']}],
    };

    expect(HashUtils.hashTXml(ordered)).toBe(1039464709);
    expect(HashUtils.hashTXml(shuffled)).toBe(1039464709);
  });

  it('produces distinct hashes when content changes', () => {
    const baseNode = {
      tagName: 'Period',
      attributes: {id: 'p1', start: 'PT0S'},
      children: [{tagName: 'BaseURL', attributes: {},
        children: ['http://example.com']}],
    };
    const modifiedNode = {
      tagName: 'Period',
      attributes: {id: 'p1', start: 'PT0S'},
      children: [{tagName: 'BaseURL', attributes: {},
        children: ['http://example.org']}],
    };

    expect(HashUtils.hashTXml(baseNode)).toBe(1039464709);
    expect(HashUtils.hashTXml(modifiedNode)).toBe(-1105918422);
  });
});
