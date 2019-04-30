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

describe('EventManager', function() {
  const Util = shaka.test.Util;

  /** @type {!shaka.util.EventManager} */
  let eventManager;
  /** @type {!Event} */
  let event1;
  /** @type {!Event} */
  let event2;
  /** @type {!EventTarget} */
  let target1;
  /** @type {!EventTarget} */
  let target2;

  beforeEach(function() {
    eventManager = new shaka.util.EventManager();
    target1 = document.createElement('div');
    target2 = document.createElement('div');

    // new Event() is current, but document.createEvent() works back to IE11.
    event1 = /** @type {!Event} */ (document.createEvent('Event'));
    event1.initEvent('eventtype1', false, false);
    event2 = /** @type {!Event} */ (document.createEvent('Event'));
    event2.initEvent('eventtype2', false, false);
  });

  afterEach(() => {
    eventManager.release();
  });

  describe('listen', () => {
    it('listens for an event', function() {
      let listener = jasmine.createSpy('listener');

      eventManager.listen(target1, 'eventtype1', Util.spyFunc(listener));
      target1.dispatchEvent(event1);

      expect(listener).toHaveBeenCalled();
    });

    it('listens for an event from mutiple targets', function() {
      let listener1 = jasmine.createSpy('listener1');
      let listener2 = jasmine.createSpy('listener2');

      eventManager.listen(target1, 'eventtype1', Util.spyFunc(listener1));
      eventManager.listen(target2, 'eventtype1', Util.spyFunc(listener2));

      target1.dispatchEvent(event1);
      target2.dispatchEvent(event1);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('listens for multiple events', function() {
      let listener1 = jasmine.createSpy('listener1');
      let listener2 = jasmine.createSpy('listener2');

      eventManager.listen(target1, 'eventtype1', Util.spyFunc(listener1));
      eventManager.listen(target1, 'eventtype2', Util.spyFunc(listener2));

      target1.dispatchEvent(event1);
      target1.dispatchEvent(event2);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('listens for multiple events from mutiple targets', function() {
      let listener1 = jasmine.createSpy('listener1');
      let listener2 = jasmine.createSpy('listener2');

      eventManager.listen(target1, 'eventtype1', Util.spyFunc(listener1));
      eventManager.listen(target2, 'eventtype2', Util.spyFunc(listener2));

      target1.dispatchEvent(event1);
      target2.dispatchEvent(event2);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('listens for an event with multiple listeners', function() {
      let listener1 = jasmine.createSpy('listener1');
      let listener2 = jasmine.createSpy('listener2');

      eventManager.listen(target1, 'eventtype1', Util.spyFunc(listener1));
      eventManager.listen(target1, 'eventtype1', Util.spyFunc(listener2));

      target1.dispatchEvent(event1);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('listenOnce', () => {
    it('listens to an event only once', () => {
      const listener1 = jasmine.createSpy('listener1');

      eventManager.listenOnce(target1, 'eventtype1', Util.spyFunc(listener1));

      target1.dispatchEvent(event1);
      expect(listener1).toHaveBeenCalled();
      listener1.calls.reset();

      target1.dispatchEvent(event1);
      expect(listener1).not.toHaveBeenCalled();
    });

    it('listens to an event with multiple listeners', () => {
      const listener1 = jasmine.createSpy('listener1');
      const listener2 = jasmine.createSpy('listener2');

      eventManager.listenOnce(target1, 'eventtype1', Util.spyFunc(listener1));
      eventManager.listenOnce(target1, 'eventtype1', Util.spyFunc(listener2));

      target1.dispatchEvent(event1);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('unlisten', () => {
    it('stops listening to an event', function() {
      let listener = jasmine.createSpy('listener');

      eventManager.listen(target1, 'eventtype1', Util.spyFunc(listener));
      eventManager.unlisten(target1, 'eventtype1');

      target1.dispatchEvent(event1);

      expect(listener).not.toHaveBeenCalled();
    });

    it('ignores other targets when removing listeners', function() {
      let listener1 = jasmine.createSpy('listener1');
      let listener2 = jasmine.createSpy('listener2');

      eventManager.listen(target1, 'eventtype1', Util.spyFunc(listener1));
      eventManager.listen(target2, 'eventtype1', Util.spyFunc(listener2));
      eventManager.unlisten(target2, 'eventtype1');

      target1.dispatchEvent(event1);

      expect(listener1).toHaveBeenCalled();
    });
  });

  describe('removeAll', () => {
    it('stops listening to multiple events', function() {
      let listener1 = jasmine.createSpy('listener1');
      let listener2 = jasmine.createSpy('listener2');

      eventManager.listen(target1, 'eventtype1', Util.spyFunc(listener1));
      eventManager.listen(target1, 'eventtype2', Util.spyFunc(listener2));

      eventManager.removeAll();

      target1.dispatchEvent(event1);
      target1.dispatchEvent(event2);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('stops listening for an event with multiple listeners', function() {
      let listener1 = jasmine.createSpy('listener1');
      let listener2 = jasmine.createSpy('listener2');

      eventManager.listen(target1, 'eventtype1', Util.spyFunc(listener1));
      eventManager.listen(target1, 'eventtype1', Util.spyFunc(listener2));

      eventManager.removeAll();

      target1.dispatchEvent(event1);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });
});
