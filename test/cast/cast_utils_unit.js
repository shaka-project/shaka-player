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

describe('CastUtils', function() {
  var CastUtils;
  var FakeEvent;

  beforeAll(function() {
    CastUtils = shaka.cast.CastUtils;
    FakeEvent = shaka.util.FakeEvent;
  });

  describe('serialize/deserialize', function() {
    it('transfers infinite values and NaN', function() {
      var orig = {
        'nan': NaN,
        'positive_infinity': Infinity,
        'negative_infinity': -Infinity,
        'null': null,
        'true': true,
        'false': false,
        'one': 1,
        'string': 'a string'
      };

      var serialized = CastUtils.serialize(orig);
      // The object is turned into a string.
      expect(typeof serialized).toBe('string');

      // The deserialized object matches the original.
      var deserialized = CastUtils.deserialize(serialized);
      for (var k in orig) {
        expect(deserialized[k]).toEqual(orig[k]);
      }
    });

    it('transfers real Events', function() {
      // new Event() is not usable on IE11:
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('myEventType', false, false, null);

      // Properties that can definitely be transferred.
      var nativeProperties = [
        'bubbles',
        'type',
        'cancelable',
        'defaultPrevented'
      ];
      var extraProperties = {
        'key': 'value',
        'true': true,
        'one': 1
      };

      for (var k in extraProperties) {
        event[k] = extraProperties[k];
      }

      // The event is turned into a string.
      var serialized = CastUtils.serialize(event);
      expect(typeof serialized).toBe('string');

      // The string is turned back into an object.
      var deserialized = CastUtils.deserialize(serialized);
      expect(typeof deserialized).toBe('object');

      // The object can be used to construct a FakeEvent.
      var fakeEvent = new FakeEvent(deserialized['type'], deserialized);

      // The fake event has the same type and properties as the original.
      nativeProperties.forEach(function(k) {
        expect(fakeEvent[k]).toEqual(event[k]);
      });
      for (var k in extraProperties) {
        expect(fakeEvent[k]).toEqual(event[k]);
      }
    });

    it('transfers dispatched FakeEvents', function(done) {
      var event = new FakeEvent('custom');

      // Properties that can definitely be transferred.
      var nativeProperties = [
        'bubbles',
        'type',
        'cancelable',
        'defaultPrevented'
      ];
      var extraProperties = {
        'key': 'value',
        'true': true,
        'one': 1
      };

      for (var k in extraProperties) {
        event[k] = extraProperties[k];
      }

      var target = new shaka.util.FakeEventTarget();
      target.addEventListener(event.type, function() {
        try {
          // The event is turned into a string.
          var serialized = CastUtils.serialize(event);
          expect(typeof serialized).toBe('string');

          // The string is turned back into an object.
          var deserialized = CastUtils.deserialize(serialized);
          expect(typeof deserialized).toBe('object');

          // The deserialized event has the same type and properties as the
          // original.
          nativeProperties.forEach(function(k) {
            expect(deserialized[k]).toEqual(event[k]);
          });
          for (var k in extraProperties) {
            expect(deserialized[k]).toEqual(event[k]);
          }
        } catch (exception) {
          fail(exception);
        }
        done();
      });
      target.dispatchEvent(event);
    });

    describe('TimeRanges', function() {
      var video;
      var eventManager;
      var mediaSourceEngine;

      beforeAll(function(done) {
        // The TimeRanges constructor cannot be used directly, so we load a clip
        // to get ranges to use.
        video = /** @type {HTMLMediaElement} */(
            document.createElement('video'));
        document.body.appendChild(video);

        var mediaSource = new MediaSource();
        var mimeType = 'video/mp4; codecs="avc1.42c01e"';
        var initSegmentUrl = '/base/test/test/assets/sintel-video-init.mp4';
        var videoSegmentUrl = '/base/test/test/assets/sintel-video-segment.mp4';

        // Wait for the media source to be open.
        eventManager = new shaka.util.EventManager();
        video.src = window.URL.createObjectURL(mediaSource);
        eventManager.listen(video, 'error', onError);
        eventManager.listen(mediaSource, 'sourceopen', onSourceOpen);

        function onError() {
          fail('Error code ' + (video.error ? video.error.code : 0));
        }

        function onSourceOpen() {
          mediaSourceEngine = new shaka.media.MediaSourceEngine(
              video, mediaSource, /* TextTrack */ null);

          mediaSourceEngine.init({'video': mimeType}, false);
          shaka.test.Util.fetch(initSegmentUrl).then(function(data) {
            return mediaSourceEngine.appendBuffer('video', data, null, null);
          }).then(function() {
            return shaka.test.Util.fetch(videoSegmentUrl);
          }).then(function(data) {
            return mediaSourceEngine.appendBuffer('video', data, null, null);
          }).catch(fail).then(done);
        }
      });

      afterAll(function() {
        eventManager.destroy();
        if (mediaSourceEngine) mediaSourceEngine.destroy();
      });

      it('deserialize into equivalent objects', function() {
        var buffered = video.buffered;

        // The test is less interesting if the ranges are empty.
        expect(buffered.length).toBeGreaterThan(0);

        // The TimeRanges object is turned into a string.
        var serialized = CastUtils.serialize(buffered);
        expect(typeof serialized).toBe('string');

        // Expect the deserialized version to look like the original.
        var deserialized = CastUtils.deserialize(serialized);
        expect(deserialized.length).toEqual(buffered.length);
        expect(deserialized.start).toEqual(jasmine.any(Function));
        expect(deserialized.end).toEqual(jasmine.any(Function));

        for (var i = 0; i < deserialized.length; ++i) {
          // Not exact because of the possibility of rounding errors.
          expect(deserialized.start(i)).toBeCloseTo(buffered.start(i));
          expect(deserialized.end(i)).toBeCloseTo(buffered.end(i));
        }
      });
    });
  });
});
