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

describe('FakeEventTarget', function() {
  var target;
  var logErrorSpy;
  var originalLogError;

  beforeAll(function() {
    originalLogError = shaka.log.error;
    logErrorSpy = jasmine.createSpy('shaka.log.error');
    shaka.log.error = logErrorSpy;
  });

  afterAll(function() {
    shaka.log.error = originalLogError;
  });

  beforeEach(function() {
    target = new shaka.util.FakeEventTarget();
    logErrorSpy.calls.reset();
    logErrorSpy.and.callFake(fail);
  });

  it('sets target on dispatched events', function(done) {
    target.addEventListener('event', function(event) {
      expect(event.target).toBe(target);
      expect(event.currentTarget).toBe(target);
      done();
    });

    target.dispatchEvent(new shaka.util.FakeEvent('event'));
  });

  it('calls all event listeners', function(done) {
    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    target.addEventListener('event', listener1);
    target.addEventListener('event', listener2);

    target.dispatchEvent(new shaka.util.FakeEvent('event'));

    shaka.test.Util.delay(0.1).then(function() {
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      done();
    });
  });

  it('stops processing on stopImmediatePropagation', function(done) {
    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    target.addEventListener('event', listener1);
    target.addEventListener('event', listener2);

    listener1.and.callFake(function(event) {
      event.stopImmediatePropagation();
    });

    target.dispatchEvent(new shaka.util.FakeEvent('event'));

    shaka.test.Util.delay(0.1).then(function() {
      expect(listener1).toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
      done();
    });
  });

  it('catches exceptions thrown from listeners', function(done) {
    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    target.addEventListener('event', listener1);
    target.addEventListener('event', listener2);

    listener1.and.throwError('whoops');
    logErrorSpy.and.stub();

    target.dispatchEvent(new shaka.util.FakeEvent('event'));

    shaka.test.Util.delay(0.1).then(function() {
      expect(listener1).toHaveBeenCalled();
      expect(logErrorSpy).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      done();
    });
  });

  it('allows events to be re-dispatched', function(done) {
    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    target.addEventListener('event', listener1);
    target.addEventListener('event', listener2);

    var target2 = new shaka.util.FakeEventTarget();
    var target2Listener = jasmine.createSpy('target2Listener');

    target2.addEventListener('event', target2Listener);

    listener1.and.callFake(function(event) {
      expect(event.target).toBe(target);
      target2.dispatchEvent(event);
    });

    target2Listener.and.callFake(function(event) {
      expect(event.target).toBe(target2);
    });

    listener2.and.callFake(function(event) {
      expect(event.target).toBe(target);
    });

    target.dispatchEvent(new shaka.util.FakeEvent('event'));

    shaka.test.Util.delay(0.1).then(function() {
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(target2Listener).toHaveBeenCalled();
      done();
    });
  });
});
