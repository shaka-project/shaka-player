/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('CastUtils', () => {
  const CastUtils = shaka.cast.CastUtils;
  const FakeEvent = shaka.util.FakeEvent;

  /** @type {shaka.extern.Stream} */
  const fakeStream = shaka.test.StreamingEngineUtil.createMockVideoStream(1);

  it('includes every Player member', () => {
    const ignoredMembers = [
      'constructor',  // JavaScript added field
      'getAdManager',  // Handled specially
      'getSharedConfiguration',  // Handled specially
      'getNetworkingEngine',  // Handled specially
      'getDrmEngine',  // Handled specially
      'getMediaElement',  // Handled specially
      'setMaxHardwareResolution',
      'destroy',  // Should use CastProxy.destroy instead
      'drmInfo',  // Too large to proxy
      'getManifest', // Too large to proxy
      'getManifestParserFactory',  // Would not serialize.
      'setVideoContainer',

      // Test helper methods (not @export'd)
      'createDrmEngine',
      'createNetworkingEngine',
      'createPlayhead',
      'createMediaSourceEngine',
      'createStreamingEngine',
    ];

    const castMembers = CastUtils.PlayerVoidMethods
        .concat(CastUtils.PlayerPromiseMethods)
        .concat(Object.keys(CastUtils.PlayerGetterMethods))
        .concat(Object.keys(CastUtils.LargePlayerGetterMethods))
        .concat(Object.keys(CastUtils.PlayerGetterMethodsThatRequireLive));
    // eslint-disable-next-line no-restricted-syntax
    const allPlayerMembers = Object.getOwnPropertyNames(shaka.Player.prototype);
    expect(
        ignoredMembers.filter((member) => !allPlayerMembers.includes(member)))
        .toEqual([]);
    const playerMembers = allPlayerMembers.filter((name) => {
      // Private members end with _.
      return !ignoredMembers.includes(name) && !name.endsWith('_');
    });

    // To make debugging easier, don't check that they are equal; instead check
    // that neither has any extra entries.
    expect(castMembers.filter((name) => !playerMembers.includes(name)))
        .toEqual([]);
    expect(playerMembers.filter((name) => !castMembers.includes(name)))
        .toEqual([]);
  });

  describe('serialize/deserialize', () => {
    it('transfers infinite values and NaN', () => {
      const orig = {
        'nan': NaN,
        'positive_infinity': Infinity,
        'negative_infinity': -Infinity,
        'null': null,
        'true': true,
        'false': false,
        'one': 1,
        'string': 'a string',
      };

      const serialized = CastUtils.serialize(orig);
      // The object is turned into a string.
      expect(typeof serialized).toBe('string');

      // The deserialized object matches the original.
      const deserialized = CastUtils.deserialize(serialized);
      for (const k in orig) {
        if (typeof orig[k] == 'number' && isNaN(orig[k])) {
          expect(deserialized[k]).toBeNaN();
        } else {
          expect(deserialized[k]).toBe(orig[k]);
        }
      }
    });

    it('transfers real Events', () => {
      const event = new CustomEvent('myEventType');

      // Properties that can definitely be transferred.
      const nativeProperties = [
        'bubbles',
        'type',
        'cancelable',
        'defaultPrevented',
      ];
      const extraProperties = {
        'key': 'value',
        'true': true,
        'one': 1,
      };

      for (const k in extraProperties) {
        event[k] = extraProperties[k];
      }

      // The event is turned into a string.
      const serialized = CastUtils.serialize(event);
      expect(typeof serialized).toBe('string');

      // The string is turned back into an object.
      const deserialized = CastUtils.deserialize(serialized);
      expect(typeof deserialized).toBe('object');

      // The object can be used to construct a FakeEvent.
      const fakeEvent = FakeEvent.fromRealEvent(deserialized);

      // The fake event has the same type and properties as the original.
      const asObj = /** @type {!Object} */ (fakeEvent);
      for (const k of nativeProperties) {
        expect(asObj[k]).toBe(event[k]);
      }
      for (const k in extraProperties) {
        expect(asObj[k]).toBe(event[k]);
      }
    });

    it('transfers dispatched FakeEvents', async () => {
      /** @type {!FakeEvent} */
      const event = new FakeEvent('custom');

      // Properties that can definitely be transferred.
      const nativeProperties = [
        'bubbles',
        'type',
        'cancelable',
        'defaultPrevented',
      ];
      const extraProperties = {
        'key': 'value',
        'true': true,
        'one': 1,
      };

      const asObj = /** @type {!Object} */ (event);
      for (const k in extraProperties) {
        asObj[k] = extraProperties[k];
      }

      /** @type {!shaka.util.FakeEventTarget} */
      const target = new shaka.util.FakeEventTarget();
      const p = new Promise((resolve) => {
        target.addEventListener(event.type, resolve);
      });
      target.dispatchEvent(event);
      await p;

      // The event is turned into a string.
      const serialized = CastUtils.serialize(event);
      expect(typeof serialized).toBe('string');

      // The string is turned back into an object.
      const deserialized = CastUtils.deserialize(serialized);
      expect(typeof deserialized).toBe('object');

      // The deserialized event has the same type and properties as the
      // original.
      for (const k of nativeProperties) {
        expect(deserialized[k]).toBe(asObj[k]);
      }
      for (const k in extraProperties) {
        expect(deserialized[k]).toBe(asObj[k]);
      }
    });

    describe('TimeRanges', () => {
      /** @type {!HTMLVideoElement} */
      let video;
      /** @type {!shaka.util.EventManager} */
      let eventManager;
      /** @type {!shaka.media.MediaSourceEngine} */
      let mediaSourceEngine;

      beforeAll(() => {
        video = shaka.test.UiUtils.createVideoElement();
        document.body.appendChild(video);
      });

      beforeEach(async () => {
        // The TimeRanges constructor cannot be used directly, so we load a clip
        // to get ranges to use.
        const fakeVideoStream = {
          mimeType: 'video/mp4',
          codecs: 'avc1.42c01e',
          drmInfos: [],
        };
        const initSegmentUrl = '/base/test/test/assets/sintel-video-init.mp4';
        const videoSegmentUrl =
            '/base/test/test/assets/sintel-video-segment.mp4';

        // Wait for the media source to be open.
        eventManager = new shaka.util.EventManager();
        eventManager.listen(video, 'error', onError);

        function onError() {
          fail('Error code ' + (video.error ? video.error.code : 0));
        }

        mediaSourceEngine = new shaka.media.MediaSourceEngine(
            video,
            new shaka.test.FakeTextDisplayer());
        const config =
            shaka.util.PlayerConfiguration.createDefault().mediaSource;
        mediaSourceEngine.configure(config);

        const ContentType = shaka.util.ManifestParserUtils.ContentType;
        const initObject = new Map();
        initObject.set(ContentType.VIDEO, fakeVideoStream);

        await mediaSourceEngine.init(initObject, false);
        const data = await shaka.test.Util.fetch(initSegmentUrl);
        await mediaSourceEngine.appendBuffer(
            ContentType.VIDEO, data, null, fakeStream,
            /* hasClosedCaptions= */ false);
        const data2 = await shaka.test.Util.fetch(videoSegmentUrl);
        await mediaSourceEngine.appendBuffer(
            ContentType.VIDEO, data2, null, fakeStream,
            /* hasClosedCaptions= */ false);
      });

      afterEach(async () => {
        eventManager.release();

        if (mediaSourceEngine) {
          await mediaSourceEngine.destroy();
        }

        // "unload" the video element.
        video.removeAttribute('src');
        video.load();
      });

      afterAll(() => {
        document.body.removeChild(video);
      });

      it('deserialize into equivalent objects', () => {
        const buffered = video.buffered;

        // The test is less interesting if the ranges are empty.
        expect(buffered.length).toBeGreaterThan(0);

        // The TimeRanges object is turned into a string.
        const serialized = CastUtils.serialize(buffered);
        expect(typeof serialized).toBe('string');

        // Expect the deserialized version to look like the original.
        const deserialized = CastUtils.deserialize(serialized);
        expect(deserialized.length).toBe(buffered.length);
        expect(deserialized.start).toEqual(jasmine.any(Function));
        expect(deserialized.end).toEqual(jasmine.any(Function));

        const TimeRangesUtils = shaka.media.TimeRangesUtils;
        expect(TimeRangesUtils.getBufferedInfo(deserialized))
            .toEqual(TimeRangesUtils.getBufferedInfo(buffered));
      });
    });  // describe('TimeRanges')

    it('transfers real Errors', () => {
      let realError;
      try {
        // Cast undefined to "?" to convince the compiler to let us dereference
        // it.
        const foo = /** @type {?} */(undefined);

        // Now this will generate a TypeError.
        foo.bar = 'baz';

        // We need to catch a real Error in this test, so we disable eslint on
        // the next line.
        // eslint-disable-next-line no-restricted-syntax
      } catch (error) {
        realError = error;
      }

      // The event is turned into a string.
      const serialized = CastUtils.serialize(realError);
      expect(typeof serialized).toBe('string');

      // The string is turned back into an object.
      const deserialized = CastUtils.deserialize(serialized);
      expect(typeof deserialized).toBe('object');

      // And that object should be an Error type.
      expect(deserialized).toEqual(jasmine.any(Error));

      // At least these basic properties should match.
      expect(deserialized.type).toBe(realError.type);
      expect(deserialized.message).toBe(realError.message);
      expect(deserialized.stack).toBe(realError.stack);
    });
  });  // describe('serialize/deserialize')
});  // describe('CastUtils')
