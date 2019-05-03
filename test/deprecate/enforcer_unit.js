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

describe('Enforcer', () => {
  const Enforcer = shaka.deprecate.Enforcer;
  const Version = shaka.deprecate.Version;

  /** @type {!jasmine.Spy} */
  let onPendingSpy;

  /** @type {!jasmine.Spy} */
  let onExpiredSpy;

  beforeEach(() => {
    onPendingSpy = jasmine.createSpy('onPending');
    onExpiredSpy = jasmine.createSpy('onExpired');
  });

  it('calls onExpired when feature has expired', () => {
    // The library is currently at version 2.4 and the feature should have been
    // removed in 2.1.
    const currentVersion = new Version(2, 4);
    const expiresAt = new Version(2, 1);

    const enforcer = createEnforcerFor(currentVersion);

    enforcer.enforce(expiresAt, 'my-feature-name', 'my-feature-description');

    // Make sure that only the expired response was invoked.
    expect(onExpiredSpy).toHaveBeenCalled();
    expect(onPendingSpy).not.toHaveBeenCalled();
  });

  it('calls onPending when feature has not expired', () => {
    // The library is currently at version 2.1 and the feature goes away in 2.4.
    const currentVersion = new Version(2, 1);
    const expiresAt = new Version(2, 4);

    const enforcer = createEnforcerFor(currentVersion);

    enforcer.enforce(expiresAt, 'my-feature-name', 'my-feature-description');

    // Make sure that only the expired response was invoked.
    expect(onExpiredSpy).not.toHaveBeenCalled();
    expect(onPendingSpy).toHaveBeenCalled();
  });

  it('treats same version as expired', () => {
    // The library is at version 2.4 and the feature expires at 2.4.
    const currentVersion = new Version(2, 4);
    const expiresAt = new Version(2, 4);

    const enforcer = createEnforcerFor(currentVersion);

    enforcer.enforce(expiresAt, 'my-feature-name', 'my-feature-description');

    // We should see an error when we are on the expired feature.
    expect(onExpiredSpy).toHaveBeenCalled();
  });

  /**
   * @param {!shaka.deprecate.Version} currentVersion
   * @return {!shaka.deprecate.Enforcer}
   */
  function createEnforcerFor(currentVersion) {
    const Util = shaka.test.Util;

    return new Enforcer(
        currentVersion, Util.spyFunc(onPendingSpy), Util.spyFunc(onExpiredSpy));
  }
});
