/**
 * Copyright 2015 Google Inc.
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
 * @fileoverview FakeEvent and FakeEventTarget unit tests.
 */

goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');

describe('FakeEventTarget', function() {
  it('sets target on dispatched events', function(done) {
    var target = new shaka.util.FakeEventTarget(null);

    target.addEventListener('event', function(event) {
      expect(event.target).toBe(target);
      done();
    });

    target.dispatchEvent(shaka.util.FakeEvent.create({
      'type': 'event',
      'bubbles': false
    }));
  });

  it('sets currentTarget on dispatched events', function(done) {
    var targetHigh = new shaka.util.FakeEventTarget(null);
    var targetLow = new shaka.util.FakeEventTarget(targetHigh);

    targetHigh.addEventListener('event', function(event) {
      expect(event.target).toBe(targetLow);
      expect(event.currentTarget).toBe(targetHigh);
      done();
    });

    targetLow.dispatchEvent(shaka.util.FakeEvent.create({
      'type': 'event',
      'bubbles': true
    }));
  });

  it('allows events to be re-dispatched', function(done) {
    var targetHigh = new shaka.util.FakeEventTarget(null);
    var targetLow = new shaka.util.FakeEventTarget(targetHigh);

    targetLow.addEventListener('event', function(event) {
      expect(event.target).toBe(targetLow);
      targetHigh.dispatchEvent(event);
    });

    targetHigh.addEventListener('event', function(event) {
      expect(event.target).toBe(targetHigh);
      done();
    });

    targetLow.dispatchEvent(shaka.util.FakeEvent.create({
      'type': 'event',
      'bubbles': false
    }));
  });
});

