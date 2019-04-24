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

goog.provide('shaka.test.FakeTextDisplayer');


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
  }

  /** @override */
  destroy() {
    const func = shaka.test.Util.spyFunc(this.destroySpy);
    return func();
  }

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
};
