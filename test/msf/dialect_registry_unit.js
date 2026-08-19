/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.DialectRegistry', isMSFSupported, () => {
  /** @type {!Map<string, shaka.extern.MsfDialect.Factory>} */
  let original;

  beforeEach(() => {
    // Registration is global, so snapshot it and restore afterwards rather
    // than leaking a fake dialect into other suites.
    original = /** @type {!Map<string, shaka.extern.MsfDialect.Factory>} */ (
      new Map(shaka.msf.DialectRegistry.dialectsByName));
  });

  afterEach(() => {
    shaka.msf.DialectRegistry.dialectsByName = original;
  });

  /**
   * @param {string} name
   * @param {number} draftNumber
   * @return {!shaka.extern.MsfDialect}
   */
  function fakeDialect(name, draftNumber) {
    return /** @type {!shaka.extern.MsfDialect} */ ({
      getSubprotocol: () => `moqt-${draftNumber}`,
      getName: () => name,
      getDraftNumber: () => draftNumber,
      getCodec: () => null,
      connect: () => Promise.resolve(null),
    });
  }

  it('should have every shipped draft registered by default', () => {
    const registered = shaka.msf.DialectRegistry.getRegisteredDialects();
    expect(registered).toContain(shaka.config.MsfVersion.DRAFT_14);
    expect(registered).toContain(shaka.config.MsfVersion.DRAFT_16);
    expect(registered).toContain(shaka.config.MsfVersion.DRAFT_18);
  });

  it('should offer every shipped draft newest first for AUTO', () => {
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(offered.map((d) => d.getName())).toEqual([
      shaka.config.MsfVersion.DRAFT_18,
      shaka.config.MsfVersion.DRAFT_16,
      shaka.config.MsfVersion.DRAFT_14,
    ]);
    // Draft-14 predates the moqt- ALPN scheme and uses moq-00.
    expect(offered.map((d) => d.getSubprotocol()))
        .toEqual(['moqt-18', 'moqt-16', 'moq-00']);
  });

  it('should select draft-14 only when the server echoes moq-00', () => {
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(shaka.msf.DialectRegistry.select(offered, 'moq-00').getName())
        .toBe(shaka.config.MsfVersion.DRAFT_14);
  });

  it('should select draft-16 when the server echoes moqt-16', () => {
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(shaka.msf.DialectRegistry.select(offered, 'moqt-16').getName())
        .toBe(shaka.config.MsfVersion.DRAFT_16);
  });

  it('should fall back to draft-18 when no subprotocol is echoed', () => {
    // Relays that accept the offered subprotocol without echoing it must not
    // be downgraded; we keep our newest offer.
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(shaka.msf.DialectRegistry.select(offered, '').getName())
        .toBe(shaka.config.MsfVersion.DRAFT_18);
  });

  it('should offer every registered dialect for AUTO', () => {
    shaka.msf.DialectRegistry.registerDialect(
        'draft-99', () => fakeDialect('draft-99', 99));

    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(offered.map((d) => d.getName())).toContain('draft-99');
    expect(offered.map((d) => d.getName()))
        .toContain(shaka.config.MsfVersion.DRAFT_16);
  });

  it('should order dialects by draft number, newest first', () => {
    // Registered oldest-first to prove the ordering does not depend on
    // registration order.
    shaka.msf.DialectRegistry.dialectsByName = new Map();
    shaka.msf.DialectRegistry.registerDialect(
        'draft-05', () => fakeDialect('draft-05', 5));
    shaka.msf.DialectRegistry.registerDialect(
        'draft-99', () => fakeDialect('draft-99', 99));
    shaka.msf.DialectRegistry.registerDialect(
        'draft-42', () => fakeDialect('draft-42', 42));

    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(offered.map((d) => d.getDraftNumber())).toEqual([99, 42, 5]);
  });

  it('should offer only the requested dialect for an explicit version', () => {
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.DRAFT_16);
    expect(offered.length).toBe(1);
    expect(offered[0].getName()).toBe(shaka.config.MsfVersion.DRAFT_16);
  });

  it('should throw for an unregistered version', () => {
    expect(() => shaka.msf.DialectRegistry.getForVersion(
        /** @type {shaka.config.MsfVersion} */ ('draft-nope'))).toThrow();
  });

  it('should stop offering an unregistered dialect', () => {
    shaka.msf.DialectRegistry.unregisterDialect(
        shaka.config.MsfVersion.DRAFT_16);
    expect(shaka.msf.DialectRegistry.getRegisteredDialects())
        .not.toContain(shaka.config.MsfVersion.DRAFT_16);
  });

  describe('select', () => {
    it('should honor the subprotocol echoed by the server', () => {
      const offered = [
        fakeDialect('draft-99', 99),
        fakeDialect('draft-16', 16),
      ];
      expect(shaka.msf.DialectRegistry.select(offered, 'moqt-16').getName())
          .toBe('draft-16');
    });

    it('should fall back to the newest offered when nothing is echoed', () => {
      // Relays are inconsistent about echoing the subprotocol, and treating an
      // empty echo as a failure would break otherwise working connections.
      const offered = [
        fakeDialect('draft-99', 99),
        fakeDialect('draft-16', 16),
      ];
      expect(shaka.msf.DialectRegistry.select(offered, '').getName())
          .toBe('draft-99');
    });

    it('should fall back when the server echoes something unoffered', () => {
      const offered = [fakeDialect('draft-16', 16)];
      expect(shaka.msf.DialectRegistry.select(offered, 'moqt-42').getName())
          .toBe('draft-16');
    });
  });
});
