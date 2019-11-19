/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('FakeEventTarget', () => {
  const Util = shaka.test.Util;
  const originalLogError = shaka.log.error;

  /** @type {!shaka.util.FakeEventTarget} */
  let target;
  /** @type {!jasmine.Spy} */
  let logErrorSpy;

  beforeEach(() => {
    logErrorSpy = jasmine.createSpy('shaka.log.error');
    logErrorSpy.and.callFake(fail);
    shaka.log.error = Util.spyFunc(logErrorSpy);

    target = new shaka.util.FakeEventTarget();
  });

  afterEach(() => {
    shaka.log.error = originalLogError;
  });

  it('sets target on dispatched events', () => {
    return new Promise((resolve) => {
      target.addEventListener('event', (event) => {
        expect(event.target).toBe(target);
        expect(event.currentTarget).toBe(target);
        resolve();
      });

      target.dispatchEvent(new shaka.util.FakeEvent('event'));
    });
  });

  it('calls all event listeners', async () => {
    const listener1 = jasmine.createSpy('listener1');
    const listener2 = jasmine.createSpy('listener2');

    target.addEventListener('event', Util.spyFunc(listener1));
    target.addEventListener('event', Util.spyFunc(listener2));

    target.dispatchEvent(new shaka.util.FakeEvent('event'));

    await shaka.test.Util.shortDelay();
    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('stops processing on stopImmediatePropagation', async () => {
    const listener1 = jasmine.createSpy('listener1');
    const listener2 = jasmine.createSpy('listener2');

    target.addEventListener('event', Util.spyFunc(listener1));
    target.addEventListener('event', Util.spyFunc(listener2));

    listener1.and.callFake((event) => {
      event.stopImmediatePropagation();
    });

    target.dispatchEvent(new shaka.util.FakeEvent('event'));

    await shaka.test.Util.shortDelay();
    expect(listener1).toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('catches exceptions thrown from listeners', async () => {
    const listener1 = jasmine.createSpy('listener1');
    const listener2 = jasmine.createSpy('listener2');

    target.addEventListener('event', Util.spyFunc(listener1));
    target.addEventListener('event', Util.spyFunc(listener2));

    listener1.and.throwError('whoops');
    logErrorSpy.and.stub();

    target.dispatchEvent(new shaka.util.FakeEvent('event'));

    await shaka.test.Util.shortDelay();
    expect(listener1).toHaveBeenCalled();
    expect(logErrorSpy).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('allows events to be re-dispatched', async () => {
    const listener1 = jasmine.createSpy('listener1');
    const listener2 = jasmine.createSpy('listener2');

    target.addEventListener('event', Util.spyFunc(listener1));
    target.addEventListener('event', Util.spyFunc(listener2));

    /** @type {!shaka.util.FakeEventTarget} */
    const target2 = new shaka.util.FakeEventTarget();
    const target2Listener = jasmine.createSpy('target2Listener');

    target2.addEventListener('event', Util.spyFunc(target2Listener));

    listener1.and.callFake((event) => {
      expect(event.target).toBe(target);
      target2.dispatchEvent(event);
    });

    target2Listener.and.callFake((event) => {
      expect(event.target).toBe(target2);
    });

    listener2.and.callFake((event) => {
      expect(event.target).toBe(target);
    });

    target.dispatchEvent(new shaka.util.FakeEvent('event'));

    await shaka.test.Util.shortDelay();
    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
    expect(target2Listener).toHaveBeenCalled();
  });
});
