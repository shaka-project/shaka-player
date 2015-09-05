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
  var event1;
  var event2;
  var target1;
  var target2;

  beforeEach(function() {
    eventManager = new shaka.util.EventManager();
    target1 = document.createElement('div');
    target2 = document.createElement('div');
    event1 = new Event('eventtype1');
    event2 = new Event('eventtype2');
  });

  afterEach(function() {
    eventManager.destroy();
  });

  it('listens for an event', function() {
    var listener = jasmine.createSpy('listener');

    eventManager.listen(target1, 'eventtype1', listener);
    target1.dispatchEvent(event1);

    expect(listener).toHaveBeenCalled();
  });

  it('listens for an event from mutiple targets', function() {
    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target1, 'eventtype1', listener1);
    eventManager.listen(target2, 'eventtype1', listener2);

    target1.dispatchEvent(event1);
    target2.dispatchEvent(event1);

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('listens for multiple events', function() {
    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target1, 'eventtype1', listener1);
    eventManager.listen(target1, 'eventtype2', listener2);

    target1.dispatchEvent(event1);
    target1.dispatchEvent(event2);

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('listens for multiple events from mutiple targets', function() {
    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target1, 'eventtype1', listener1);
    eventManager.listen(target2, 'eventtype2', listener2);

    target1.dispatchEvent(event1);
    target2.dispatchEvent(event2);

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('listens for an event with multiple listeners', function() {
    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target1, 'eventtype1', listener1);
    eventManager.listen(target1, 'eventtype1', listener2);

    target1.dispatchEvent(event1);

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('stops listening to an event', function() {
    var listener = jasmine.createSpy('listener');

    eventManager.listen(target1, 'eventtype1', listener);
    eventManager.unlisten(target1, 'eventtype1');

    target1.dispatchEvent(event1);

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops listening to multiple events', function() {
    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target1, 'eventtype1', listener1);
    eventManager.listen(target1, 'eventtype2', listener2);

    eventManager.removeAll(target1);

    target1.dispatchEvent(event1);
    target1.dispatchEvent(event2);

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('stops listening for an event with multiple listeners', function() {
    var listener1 = jasmine.createSpy('listener1');
    var listener2 = jasmine.createSpy('listener2');

    eventManager.listen(target1, 'eventtype1', listener1);
    eventManager.listen(target1, 'eventtype1', listener2);

    eventManager.removeAll(target1);

    target1.dispatchEvent(event1);

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });
});

