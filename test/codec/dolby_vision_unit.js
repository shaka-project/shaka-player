/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DolbyVision', () => {
  const DolbyVision = shaka.codec.DolbyVision;

  /**
   * @param {!Uint8Array} record
   * @return {shaka.codec.DolbyVision.Config}
   */
  const parse = (record) => {
    return /** @type {shaka.codec.DolbyVision.Config} */(
      DolbyVision.parseConfig(record));
  };

  /**
   * A DOVIDecoderConfigurationRecord.
   *
   * @param {number} profile
   * @param {number} level
   * @param {number} compatibility
   * @param {{rpu: boolean, el: boolean, bl: boolean}=} layers
   * @return {!Uint8Array}
   */
  const makeRecord = (profile, level, compatibility,
      layers = {rpu: true, el: false, bl: true}) => {
    const record = new Uint8Array(24);
    // Version 1.0.
    record[0] = 1;
    record[2] = (profile << 1) | (level >> 5);
    record[3] = ((level & 0x1f) << 3) | (layers.rpu ? 4 : 0) |
        (layers.el ? 2 : 0) | (layers.bl ? 1 : 0);
    record[4] = compatibility << 4;
    return record;
  };

  describe('parseConfig', () => {
    it('reads the profile, the level and the layers', () => {
      expect(parse(makeRecord(8, 3, 1))).toEqual({
        profile: 8,
        level: 3,
        rpuPresent: true,
        elPresent: false,
        blPresent: true,
        blSignalCompatibilityId: 1,
      });
    });

    it('reads a level of more than 5 bits', () => {
      expect(parse(makeRecord(5, 33, 0)).level).toBe(33);
    });

    it('reads an enhancement layer', () => {
      const config = parse(makeRecord(
          7, 6, 6, {rpu: true, el: true, bl: true}));
      expect(config.elPresent).toBe(true);
      expect(config.profile).toBe(7);
      expect(config.blSignalCompatibilityId).toBe(6);
    });

    it('rejects a record that is too short', () => {
      expect(DolbyVision.parseConfig(new Uint8Array(3))).toBe(null);
    });
  });

  describe('getBoxName', () => {
    it('is dvcC up to profile 7 and dvvC after it', () => {
      const name = (profile) => {
        return DolbyVision.getBoxName(
            parse(makeRecord(profile, 1, 1)));
      };
      expect(name(5)).toBe('dvcC');
      expect(name(7)).toBe('dvcC');
      expect(name(8)).toBe('dvvC');
      expect(name(10)).toBe('dvvC');
    });
  });

  describe('getCodecs', () => {
    it('writes the profile and level with two digits', () => {
      const config = parse(makeRecord(8, 3, 1));
      expect(DolbyVision.getCodecs('dvh1', config)).toBe('dvh1.08.03');
      expect(DolbyVision.getCodecs('dav1', config)).toBe('dav1.08.03');
      const large = parse(makeRecord(10, 12, 1));
      expect(DolbyVision.getCodecs('dvh1', large)).toBe('dvh1.10.12');
    });
  });

  describe('hasCompatibleBase', () => {
    it('is false only where the base layer means nothing without it', () => {
      const has = (compatibility) => {
        return DolbyVision.hasCompatibleBase(
            parse(makeRecord(8, 3, compatibility)));
      };
      // Profile 5.
      expect(has(0)).toBe(false);
      // HDR10, SDR and HLG.
      expect(has(1)).toBe(true);
      expect(has(2)).toBe(true);
      expect(has(4)).toBe(true);
    });
  });

  describe('getEntryName', () => {
    it('recognizes the codec strings of Dolby Vision', () => {
      expect(DolbyVision.getEntryName('dvh1.08.03')).toBe('dvh1');
      expect(DolbyVision.getEntryName('DVA1.09.01')).toBe('dva1');
      expect(DolbyVision.getEntryName('dav1.10.04')).toBe('dav1');
    });

    it('is null for the rest', () => {
      expect(DolbyVision.getEntryName('hvc1.2.4.L120.90')).toBe(null);
      expect(DolbyVision.getEntryName('avc1.64001f')).toBe(null);
      expect(DolbyVision.getEntryName('')).toBe(null);
    });
  });
});
