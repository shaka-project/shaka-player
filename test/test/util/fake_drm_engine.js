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

goog.provide('shaka.test.FakeDrmEngine');


/**
 * A fake DrmEngine.
 *
 * @extends {shaka.media.DrmEngine}
 */
shaka.test.FakeDrmEngine = class {
  constructor() {
    /** @private {!Array.<number>} */
    this.offlineSessions_ = [];
    /** @private {?shaka.extern.DrmInfo} */
    this.drmInfo_ = null;

    const resolved = Promise.resolve();

    /** @type {!jasmine.Spy} */
    this.attach = jasmine.createSpy('attach');
    this.attach.and.returnValue(resolved);

    /** @type {!jasmine.Spy} */
    this.configure = jasmine.createSpy('configure');

    // Because of the |IDestroyable| interface, we need to cast destroy to be
    // a function so that closure will understand that FakeDrmEngine still meets
    // the interface requirements.
    /** @type {!jasmine.Spy} */
    const destroySpy = jasmine.createSpy('destroy');
    destroySpy.and.returnValue(resolved);
    this.destroy = shaka.test.Util.spyFunc(destroySpy);

    /** @type {!jasmine.Spy} */
    this.getDrmInfo = jasmine.createSpy('getDrmInfo');
    // We use |callFake| to ensure that updated values of |this.drmInfo_| will
    // be returned.
    this.getDrmInfo.and.callFake(() => this.drmInfo_);

    /** @type {!jasmine.Spy} */
    this.getExpiration = jasmine.createSpy('getExpiration');
    this.getExpiration.and.returnValue(Infinity);

    /** @type {!jasmine.Spy} */
    this.getLicenseTime = jasmine.createSpy('getLicenseTime');
    this.getLicenseTime.and.returnValue(NaN);

    /** @type {!jasmine.Spy} */
    this.getKeyStatuses = jasmine.createSpy('getKeyStatuses');
    this.getKeyStatuses.and.returnValue({});

    /** @type {!jasmine.Spy} */
    this.getSessionIds = jasmine.createSpy('getSessionIds');
    this.getSessionIds.and.callFake(() => this.offlineSessions_);

    /** @type {!jasmine.Spy} */
    this.initForPlayback = jasmine.createSpy('initForPlayback');
    this.initForPlayback.and.returnValue(resolved);

    /** @type {!jasmine.Spy} */
    this.initForStorage = jasmine.createSpy('initForStorage');
    this.initForStorage.and.returnValue(resolved);

    /** @type {!jasmine.Spy} */
    this.initialized = jasmine.createSpy('initialized');
    this.initialized.and.returnValue(true);

    /** @type {!jasmine.Spy} */
    this.keySystem = jasmine.createSpy('keySystem');
    this.keySystem.and.returnValue('com.example.fake');

    /** @type {!jasmine.Spy} */
    this.supportsVariant = jasmine.createSpy('supportsVariant');
    this.supportsVariant.and.returnValue(true);
  }

  /**
   * @param {shaka.extern.DrmInfo} info
   */
  setDrmInfo(info) {
    this.drmInfo_ = info;
  }

  /**
   * @param {!Array.<number>} sessions
   */
  setSessionIds(sessions) {
    // Copy the values to break the reference to the input value.
    this.offlineSessions_ = sessions.map((s) => s);
  }
};
