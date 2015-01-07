/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview event_manager.js unit tests.
 */

goog.require('shaka.util.EventManager');

describe('EventManager', function() {
  var eventManager;

  beforeEach(function() {
    eventManager = new shaka.util.EventManager();
  });

  afterEach(function() {
    eventManager.destroy();
  });

  it('listens for an event', function() {
    var target = new FakeEventTarget();
    var listener = jasmine.createSpy('listener');

    eventManager.listen(target, 'event', listener);
    target.dispatchEvent('event');

    expect(listener).toHaveBeenCalled();
  });

  it('listens for an event from mutiple targets', function() {
    var target1 = new FakeEventTarget();
    var target2 = new FakeEventTarget();

    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target1, 'event', listener1);
    eventManager.listen(target2, 'event', listener2);

    target1.dispatchEvent('event');
    target2.dispatchEvent('event');

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('listens for multiple events', function() {
    var target = new FakeEventTarget();

    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target, 'event1', listener1);
    eventManager.listen(target, 'event2', listener2);

    target.dispatchEvent('event1');
    target.dispatchEvent('event2');

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('listens for multiple events from mutiple targets', function() {
    var target1 = new FakeEventTarget();
    var target2 = new FakeEventTarget();

    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target1, 'event1', listener1);
    eventManager.listen(target2, 'event2', listener2);

    target1.dispatchEvent('event1');
    target2.dispatchEvent('event2');

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('listens for an event with multiple listeners', function() {
    var target = new FakeEventTarget();

    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target, 'event', listener1);
    eventManager.listen(target, 'event', listener2);

    target.dispatchEvent('event');
    target.dispatchEvent('event');

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('stops listening to an event', function() {
    var target = new FakeEventTarget();
    var listener = jasmine.createSpy('listener');

    eventManager.listen(target, 'event', listener);
    eventManager.unlisten(target, 'event');

    target.dispatchEvent('event');

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops listening to multiple events', function() {
    var target = new FakeEventTarget();

    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target, 'event1', listener1);
    eventManager.listen(target, 'event2', listener2);

    eventManager.removeAll(target);

    target.dispatchEvent('event1');
    target.dispatchEvent('event2');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('stops listening for an event with multiple listeners', function() {
    var target = new FakeEventTarget();

    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target, 'event', listener1);
    eventManager.listen(target, 'event', listener2);

    eventManager.removeAll(target);

    target.dispatchEvent('event');
    target.dispatchEvent('event');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });
});

