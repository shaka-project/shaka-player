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
    expect(registered).toContain(shaka.config.MsfVersion.DRAFT_18);
    expect(registered).toContain(shaka.config.MsfVersion.DRAFT_20);
    expect(registered).toContain(shaka.config.MsfVersion.DRAFT_21);
    expect(registered).toContain(shaka.config.MsfVersion.DRAFT_22);
  });

  it('should offer every shipped draft newest first for AUTO', () => {
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(offered.map((d) => d.getName())).toEqual([
      shaka.config.MsfVersion.DRAFT_22,
      shaka.config.MsfVersion.DRAFT_21,
      shaka.config.MsfVersion.DRAFT_20,
      shaka.config.MsfVersion.DRAFT_18,
    ]);
    expect(offered.map((d) => d.getSubprotocol())).toEqual(
        ['moqt-22', 'moqt-21', 'moqt-20', 'moqt-18']);
  });

  it('should serve draft-20 and draft-21 from one implementation', () => {
    // Draft-21 is draft-20 with editorial changes only, so the two are the
    // same dialect class under different names and subprotocols. Registering
    // them separately is what lets a relay pick either one.
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    const draft20 = offered.find(
        (d) => d.getName() == shaka.config.MsfVersion.DRAFT_20);
    const draft21 = offered.find(
        (d) => d.getName() == shaka.config.MsfVersion.DRAFT_21);

    expect(draft20 instanceof shaka.msf.draft20.Dialect).toBe(true);
    expect(draft21 instanceof shaka.msf.draft20.Dialect).toBe(true);
    expect(draft20.getDraftNumber()).toBe(20);
    expect(draft21.getDraftNumber()).toBe(21);
  });

  it('should serve draft-22 from its own message writer', () => {
    // Draft-22 changed how LOCATION_FILTER is written and nothing else, so it
    // is a draft-20 dialect with a different writer.
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    const draft22 = offered.find(
        (d) => d.getName() == shaka.config.MsfVersion.DRAFT_22);

    expect(draft22 instanceof shaka.msf.draft22.Dialect).toBe(true);
    expect(draft22 instanceof shaka.msf.draft20.Dialect).toBe(true);
    expect(draft22.getDraftNumber()).toBe(22);
    expect(draft22.getSubprotocol()).toBe('moqt-22');
  });

  it('should select draft-22 when the server echoes moqt-22', () => {
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(shaka.msf.DialectRegistry.select(offered, 'moqt-22').getName())
        .toBe(shaka.config.MsfVersion.DRAFT_22);
  });

  it('should select draft-21 when the server echoes moqt-21', () => {
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(shaka.msf.DialectRegistry.select(offered, 'moqt-21').getName())
        .toBe(shaka.config.MsfVersion.DRAFT_21);
  });

  it('should select draft-18 when the server echoes moqt-18', () => {
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(shaka.msf.DialectRegistry.select(offered, 'moqt-18').getName())
        .toBe(shaka.config.MsfVersion.DRAFT_18);
  });

  it('should not offer the removed drafts', () => {
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    const subprotocols = offered.map((d) => d.getSubprotocol());
    expect(subprotocols).not.toContain('moqt-16');
    expect(subprotocols).not.toContain('moq-00');
  });

  it('should not guess a draft when no subprotocol is echoed', () => {
    // Relays are inconsistent about echoing the subprotocol they accepted, and
    // the newest draft we offered is the wrong guess for every relay that is
    // not on it. The transport asks again, one draft at a time, instead.
    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(shaka.msf.DialectRegistry.select(offered, '')).toBeNull();
  });

  it('should offer every registered dialect for AUTO', () => {
    shaka.msf.DialectRegistry.registerDialect(
        'draft-99', () => fakeDialect('draft-99', 99));

    const offered = shaka.msf.DialectRegistry.getForVersion(
        shaka.config.MsfVersion.AUTO);
    expect(offered.map((d) => d.getName())).toContain('draft-99');
    expect(offered.map((d) => d.getName()))
        .toContain(shaka.config.MsfVersion.DRAFT_18);
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
        shaka.config.MsfVersion.DRAFT_18);
    expect(offered.length).toBe(1);
    expect(offered[0].getName()).toBe(shaka.config.MsfVersion.DRAFT_18);
  });

  it('should throw for an unregistered version', () => {
    expect(() => shaka.msf.DialectRegistry.getForVersion(
        /** @type {shaka.config.MsfVersion} */ ('draft-nope'))).toThrow();
  });

  it('should stop offering an unregistered dialect', () => {
    shaka.msf.DialectRegistry.unregisterDialect(
        shaka.config.MsfVersion.DRAFT_18);
    expect(shaka.msf.DialectRegistry.getRegisteredDialects())
        .not.toContain(shaka.config.MsfVersion.DRAFT_18);
  });

  describe('select', () => {
    it('should honor the subprotocol echoed by the server', () => {
      const offered = [
        fakeDialect('draft-99', 99),
        fakeDialect('draft-18', 18),
      ];
      expect(shaka.msf.DialectRegistry.select(offered, 'moqt-18').getName())
          .toBe('draft-18');
    });

    it('should report an ambiguous choice when nothing is echoed', () => {
      const offered = [
        fakeDialect('draft-99', 99),
        fakeDialect('draft-18', 18),
      ];
      expect(shaka.msf.DialectRegistry.select(offered, '')).toBeNull();
    });

    it('should take a lone offer that the server did not echo', () => {
      // A server that did not speak it would have rejected the handshake, so
      // there is nothing to be ambiguous about.
      const offered = [fakeDialect('draft-18', 18)];
      expect(shaka.msf.DialectRegistry.select(offered, '').getName())
          .toBe('draft-18');
    });

    it('should fall back when the server echoes something unoffered', () => {
      const offered = [fakeDialect('draft-18', 18)];
      expect(shaka.msf.DialectRegistry.select(offered, 'moqt-42').getName())
          .toBe('draft-18');
    });
  });
});
