/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('BufferUtils', () => {
  const BufferUtils = shaka.util.BufferUtils;

  describe('equal', () => {
    it('allows null', () => {
      const buffer = new Uint8Array([0]);
      expect(BufferUtils.equal(buffer, null)).toBe(false);
      expect(BufferUtils.equal(null, buffer)).toBe(false);
      expect(BufferUtils.equal(null, null)).toBe(true);
    });

    it('checks length', () => {
      const a = new Uint8Array([0]);
      const b = new Uint8Array([0, 1]);
      expect(BufferUtils.equal(a, b)).toBe(false);
    });

    it('compares values', () => {
      const a = new Uint8Array([0, 1]);
      const b = new Uint8Array([0, 1]);
      const c = new Uint8Array([0, 2]);
      expect(a).not.toBe(b);
      expect(a.buffer).not.toBe(b.buffer);
      expect(BufferUtils.equal(a, a)).toBe(true);
      expect(BufferUtils.equal(a, b)).toBe(true);
      expect(BufferUtils.equal(a, c)).toBe(false);
    });

    it('compares different types', () => {
      const a = new Uint8Array([0, 1, 2, 3]);
      const b = new DataView(new ArrayBuffer(4));
      b.setUint16(0, 0x0001, false);
      b.setUint16(2, 0x0203, false);
      expect(BufferUtils.equal(a, b)).toBe(true);
    });

    it('compares with same buffer', () => {
      const a = new Uint8Array([0, 1, 2, 3]);
      const b = new Uint16Array(a.buffer);
      expect(BufferUtils.equal(a, b)).toBe(true);
    });

    it('compares different views', () => {
      const top = new Uint8Array([0, 1, 2, 3, 0, 1, 2, 3]);
      const a = new Uint8Array(top.buffer, 0, 4);
      const b = new Uint8Array(top.buffer, 2, 4);
      const c = new Uint8Array(top.buffer, 4, 4);
      const d = new Uint16Array(top.buffer, 0, 2);
      const e = new DataView(top.buffer, 0, 4);
      expect(BufferUtils.equal(top, a)).toBe(false);
      expect(BufferUtils.equal(top, b)).toBe(false);
      expect(BufferUtils.equal(top, c)).toBe(false);
      expect(BufferUtils.equal(a, b)).toBe(false);
      expect(BufferUtils.equal(a, c)).toBe(true);
      expect(BufferUtils.equal(a, d)).toBe(true);
      expect(BufferUtils.equal(a, e)).toBe(true);
      expect(BufferUtils.equal(a, e)).toBe(true);
    });

    it('compares ArrayBuffers', () => {
      const a = new Uint8Array([0, 1, 2, 3]);
      const b = new Uint8Array([0, 1, 2, 3]);
      const c = new Uint8Array([0, 1, 2, 4]);
      const d = new Uint8Array([0, 1, 2]);
      expect(BufferUtils.equal(a.buffer, a.buffer)).toBe(true);
      expect(BufferUtils.equal(a.buffer, b.buffer)).toBe(true);
      expect(BufferUtils.equal(a.buffer, c.buffer)).toBe(false);
      expect(BufferUtils.equal(a.buffer, d.buffer)).toBe(false);
    });
  });

  describe('toUint8', () => {
    it('allows passing ArrayBuffer', () => {
      const buffer = new ArrayBuffer(10);
      const value = BufferUtils.toUint8(buffer);
      expect(value.buffer).toBe(buffer);
      expect(value.byteOffset).toBe(0);
      expect(value.byteLength).toBe(buffer.byteLength);
    });

    it('allows passing Uint8Array', () => {
      const buffer = new Uint8Array(10);
      const value = BufferUtils.toUint8(buffer);
      expect(value).not.toBe(buffer);
      expect(value.buffer).toBe(buffer.buffer);
      expect(value.byteOffset).toBe(0);
      expect(value.byteLength).toBe(buffer.byteLength);
    });

    it('allows passing partial Uint8Array', () => {
      const buffer = new ArrayBuffer(10);
      const view = new Uint8Array(buffer, 4, 4);
      const value = BufferUtils.toUint8(view);
      expect(value).not.toBe(view);
      expect(value.buffer).toBe(buffer);
      expect(value.byteOffset).toBe(4);
      expect(value.byteLength).toBe(4);
    });

    it('allows setting offset/length with ArrayBuffer', () => {
      const buffer = new ArrayBuffer(10);
      const value = BufferUtils.toUint8(buffer, 3, 5);
      expect(value.buffer).toBe(buffer);
      expect(value.byteOffset).toBe(3);
      expect(value.byteLength).toBe(5);
    });

    it('allows setting offset/length with Uint8Array', () => {
      const buffer = new Uint8Array(10);
      const value = BufferUtils.toUint8(buffer, 3, 5);
      expect(value).not.toBe(buffer);
      expect(value.buffer).toBe(buffer.buffer);
      expect(value.byteOffset).toBe(3);
      expect(value.byteLength).toBe(5);
    });

    it('allows setting offset/length with partial Uint8Array', () => {
      const buffer = new ArrayBuffer(20);
      const view = new Uint8Array(buffer, 5, 10);
      const value = BufferUtils.toUint8(view, 3, 5);
      expect(value).not.toBe(view);
      expect(value.buffer).toBe(buffer);
      expect(value.byteOffset).toBe(8);
      expect(value.byteLength).toBe(5);
    });

    it('allows a negative offset', () => {
      const buffer = new ArrayBuffer(10);
      const view = new Uint8Array(buffer, 5, 5);
      const value = BufferUtils.toUint8(view, -5);
      expect(value.buffer).toBe(buffer);
      expect(value.byteOffset).toBe(0);
      expect(value.byteLength).toBe(10);
    });

    it('clamps offset to buffer', () => {
      const buffer = new ArrayBuffer(10);
      const value = BufferUtils.toUint8(buffer, 12);
      expect(value.buffer).toBe(buffer);
      expect(value.byteOffset).toBe(10);
      expect(value.byteLength).toBe(0);
    });

    it('clamps negative offset to buffer', () => {
      const buffer = new ArrayBuffer(10);
      const value = BufferUtils.toUint8(buffer, -5);
      expect(value.buffer).toBe(buffer);
      expect(value.byteOffset).toBe(0);
      expect(value.byteLength).toBe(10);
    });

    it('clamps offset to view', () => {
      const buffer = new ArrayBuffer(20);
      const view = new Uint8Array(buffer, 5, 10);
      const value = BufferUtils.toUint8(view, 12);
      expect(value.buffer).toBe(buffer);
      expect(value.byteOffset).toBe(15);
      expect(value.byteLength).toBe(0);
    });

    it('clamps offset to view when added to offset', () => {
      const buffer = new ArrayBuffer(20);
      const view = new Uint8Array(buffer, 5, 15);
      const value = BufferUtils.toUint8(view, 25);
      expect(value.buffer).toBe(buffer);
      expect(value.byteOffset).toBe(20);
      expect(value.byteLength).toBe(0);
    });

    it('clamps length to view', () => {
      const buffer = new ArrayBuffer(20);
      const view = new Uint8Array(buffer, 5, 10);
      const value = BufferUtils.toUint8(view, 4, 20);
      expect(value.buffer).toBe(buffer);
      expect(value.byteOffset).toBe(9);
      expect(value.byteLength).toBe(6);
    });
  });
});
