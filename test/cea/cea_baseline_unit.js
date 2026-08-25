/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression baseline for the CEA decoder.
 *
 * Task 1 of the cea-608-708-captions spec asks us to (a) record the current
 * behavior of the known conformance-gap areas before any fixes land, and
 * (b) provide deterministic raw-byte test helpers (a CEA-608 byte-pair builder
 * and a CEA-708 DTVCC service-block builder) for later tasks.
 *
 * These tests intentionally assert the CURRENT (pre-fix) behavior so that the
 * later tasks can flip them as the gaps are closed:
 *   - CEA-608 Text Mode emits nothing (gap 608-1).
 *   - CEA-608 Delete-to-End-of-Row (DER) is a no-op (gap 608-2).
 *   - CEA-708 Delay (0x8d) now consumes its operand byte so the service-block
 *     byte counter stays aligned (gap 708-3, fixed).
 * They also exercise the new builders to prove they frame bytes the decoder
 * accepts.
 */
describe('CeaDecoder regression baseline', () => {
  const CeaUtils = shaka.test.CeaUtils;

  /** @type {!shaka.cea.CeaDecoder} */
  let decoder;

  beforeEach(() => {
    decoder = new shaka.cea.CeaDecoder();
  });

  describe('raw-byte test helpers', () => {
    it('withOddParity produces odd parity bytes', () => {
      // 0x00 has zero ones -> parity bit set.
      expect(CeaUtils.withOddParity(0x00)).toBe(0x80);
      // 0x01 has one (odd) bit -> parity bit stays clear.
      expect(CeaUtils.withOddParity(0x01)).toBe(0x01);
      // 't' = 0x74 has four ones (even) -> parity bit set -> 0xf4.
      expect(CeaUtils.withOddParity(0x74)).toBe(0xf4);
      // 'e' = 0x65 has four ones (even) -> parity bit set -> 0xe5.
      expect(CeaUtils.withOddParity(0x65)).toBe(0xe5);
    });

    it('cea608Pair frames a field-1 byte pair like the decoder expects', () => {
      // Field 1 -> cc_type 0 -> cc-info byte 0xfc.
      const triple = CeaUtils.cea608Pair(1, 0x94, 0x20);
      expect(triple).toEqual([0xfc, 0x94, 0x20]);

      // Field 2 -> cc_type 1 -> cc-info byte 0xfd.
      const triple2 = CeaUtils.cea608Pair(2, 0x15, 0x20);
      expect(triple2).toEqual([0xfd, 0x15, 0x20]);
    });

    it('buildCea608Sei produces a decodable pop-on caption', () => {
      // Pop-on "te" on CC1 via the builder, then flush with EOC + EDM.
      // applyParity lets us pass logical 7-bit codes; the builder applies the
      // odd-parity bit the decoder requires (e.g. 0x14 -> 0x94).
      const popon = CeaUtils.buildCea608Sei([
        {field: 1, b1: 0x14, b2: 0x20, applyParity: true}, // RCL (pop-on).
        {field: 1, b1: 0x74, b2: 0x65, applyParity: true}, // t, e.
        {field: 1, b1: 0x14, b2: 0x2f, applyParity: true}, // EOC (flip).
      ]);
      const edm = CeaUtils.buildCea608Sei([
        {field: 1, b1: 0x14, b2: 0x2c, applyParity: true}, // EDM.
      ]);

      decoder.extract(popon, 1);
      decoder.extract(edm, 2);
      const captions = decoder.decode();

      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('CC1');
    });

    it('dtvccServiceBlock frames the service header correctly', () => {
      // Service 1, 3 data bytes -> header (1 << 5) | 3 = 0x23.
      const block = CeaUtils.dtvccServiceBlock(1, [0x41, 0x42, 0x43]);
      expect(block).toEqual([0x23, 0x41, 0x42, 0x43]);

      // Service >= 7 uses the extended-header form.
      const extended = CeaUtils.dtvccServiceBlock(10, [0x41]);
      expect(extended[0]).toBe((0x07 << 5) | 0x01); // standard header.
      expect(extended[1]).toBe(0x0a); // extended service number.
      expect(extended.slice(2)).toEqual([0x41]);
    });

    it('buildDtvccSei produces a decodable DTVCC caption', () => {
      // Define a visible window #0 (10x10) and write "test" into service #1.
      const data = [
        0x98, 0x38, // DefineWindow #0, visible.
        0x00, 0x00,
        0x0a, 0x0a,
        0x00,
        0x74, 0x65, 0x73, 0x74, // t, e, s, t (G0 text).
      ];
      const packet = CeaUtils.buildDtvccSei([
        CeaUtils.dtvccServiceBlock(1, data),
      ]);

      // Hide windows to flush the caption out.
      const hide = CeaUtils.buildDtvccSei([
        CeaUtils.dtvccServiceBlock(1, [0x8a, 0xff]),
      ]);

      decoder.extract(packet, 1);
      decoder.extract(hide, 2);
      const captions = decoder.decode();

      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('svc1');
    });
  });

  describe('current gap-area behavior (to be fixed by later tasks)', () => {
    it('CEA-608 Text Mode emits a cue on Carriage Return (gap 608-1)', () => {
      // Enter text mode (TR = Text Restart, 0x14 0x2a) and type "te".
      const textMode = CeaUtils.buildCea608Sei([
        {field: 1, b1: 0x14, b2: 0x2a, applyParity: true}, // TR -> text mode.
        {field: 1, b1: 0x74, b2: 0x65, applyParity: true}, // t, e.
      ]);
      // A later Carriage Return flushes the buffered text line.
      const carriageReturn = CeaUtils.buildCea608Sei([
        {field: 1, b1: 0x14, b2: 0x2d, applyParity: true}, // CR.
      ]);

      decoder.extract(textMode, 1);
      decoder.extract(carriageReturn, 2);
      const captions = decoder.decode();

      // Text mode now emits a cue when a CR follows non-empty text.
      expect(captions.length).toBe(1);
    });

    it('CEA-608 DER erases from the cursor to the end of the row (gap 608-2)',
        () => {
          // Pop-on "test", then issue DER (0x14 0x24). DER now erases from the
          // cursor to the end of the active row, clearing the buffered word
          // before the EOC flip, so no caption is emitted on flush.
          const popon = CeaUtils.buildCea608Sei([
            {field: 1, b1: 0x14, b2: 0x20, applyParity: true}, // RCL (pop-on).
            {field: 1, b1: 0x74, b2: 0x65, applyParity: true}, // t, e.
            {field: 1, b1: 0x73, b2: 0x74, applyParity: true}, // s, t.
            {field: 1, b1: 0x14, b2: 0x24, applyParity: true}, // DER.
            {field: 1, b1: 0x14, b2: 0x2f, applyParity: true}, // EOC (flip).
          ]);
          const edm = CeaUtils.buildCea608Sei([
            {field: 1, b1: 0x14, b2: 0x2c, applyParity: true}, // EDM.
          ]);

          decoder.extract(popon, 1);
          decoder.extract(edm, 2);
          const captions = decoder.decode();

          // DER cleared the row, so the flipped buffer is empty: no caption.
          expect(captions.length).toBe(0);
        });

    it('CEA-708 Delay (0x8d) consumes its operand byte (gap 708-3 fixed)',
        () => {
          // Define a window, then a Delay (0x8d) whose 1-byte operand is the
          // printable char 'A' (0x41), then "est". Now that the decoder
          // consumes the Delay operand, the 'A' is correctly read as the delay
          // operand (and discarded), so the rendered text is just "est".
          const data = [
            0x98, 0x38, // DefineWindow #0, visible -> becomes current window.
            0x00, 0x00,
            0x0a, 0x0a,
            0x00,
            0x8d, 0x41, // Delay + operand 'A' (operand now consumed).
            0x65, 0x73, 0x74, // e, s, t.
          ];
          const packet = CeaUtils.buildDtvccSei([
            CeaUtils.dtvccServiceBlock(1, data),
          ]);
          const hide = CeaUtils.buildDtvccSei([
            CeaUtils.dtvccServiceBlock(1, [0x8a, 0xff]),
          ]);

          decoder.extract(packet, 1);
          decoder.extract(hide, 2);
          const captions = decoder.decode();

          expect(captions.length).toBe(1);
          expect(captions[0].stream).toBe('svc1');
          const text = captions[0].cue.nestedCues
              .map((c) => c.payload).join('');
          // Corrected behavior: the operand is consumed, so it no longer leaks.
          expect(text).toBe('est');
        });
  });
});
