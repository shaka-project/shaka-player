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

    // TODO(modmaker): Fix comparisons of different types.
    xit('compares different types', () => {
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
});
