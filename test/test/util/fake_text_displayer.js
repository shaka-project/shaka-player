/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @implements {shaka.extern.TextDisplayer}
 * @final
 */
shaka.test.FakeTextDisplayer = class {
  constructor() {
    let isVisible = false;

    /** @type {!jasmine.Spy} */
    this.destroySpy = jasmine.createSpy('destroy');
    /** @type {!jasmine.Spy} */
    this.appendSpy = jasmine.createSpy('append');
    /** @type {!jasmine.Spy} */
    this.removeSpy = jasmine.createSpy('remove');
    /** @type {!jasmine.Spy} */
    this.isTextVisibleSpy =
        jasmine.createSpy('isTextVisible').and.callFake(() => isVisible);
    /** @type {!jasmine.Spy} */
    this.setTextVisibilitySpy =
        jasmine.createSpy('setTextVisibility').and.callFake((on) => {
          isVisible = on;
        });
    /** @type {!jasmine.Spy} */
    this.setTextLanguageSpy = jasmine.createSpy('setTextLanguage');
  }

  /** @override */
  destroy() {
    const func = shaka.test.Util.spyFunc(this.destroySpy);
    return func();
  }

  /** @override */
  configure(config) {}

  /** @override */
  append(cues) {
    const func = shaka.test.Util.spyFunc(this.appendSpy);
    return func(cues);
  }

  /** @override */
  remove(startTime, endTime) {
    const func = shaka.test.Util.spyFunc(this.removeSpy);
    return func(startTime, endTime);
  }

  /** @override */
  isTextVisible() {
    const func = shaka.test.Util.spyFunc(this.isTextVisibleSpy);
    return func();
  }

  /** @override */
  setTextVisibility(on) {
    const func = shaka.test.Util.spyFunc(this.setTextVisibilitySpy);
    return func(on);
  }

  /** @override */
  setTextLanguage(language) {
    const func = shaka.test.Util.spyFunc(this.setTextLanguageSpy);
    return func(language);
  }
};
