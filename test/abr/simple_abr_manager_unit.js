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

describe('SimpleAbrManager', function() {
  var switchCallback;
  var abrManager;
  var manifest;
  var variants;
  var textStreams;
  var sufficientBWMultiplier = 1.06;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;


  beforeAll(function() {
    jasmine.clock().install();
    jasmine.clock().mockDate();
    // This polyfill is required for fakeEventLoop.
    shaka.polyfill.Promise.install(/* force */ true);
  });

  beforeEach(function() {
    switchCallback = jasmine.createSpy('switchCallback');

    // Keep unsorted.
    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addVariant(0).bandwidth(4e5)  // 400 kbps
          .addAudio(0)
          .addVideo(1)
        .addVariant(1).bandwidth(1e6)  // 1000 kbps
          .addAudio(2)
          .addVideo(3)
        .addVariant(2).bandwidth(5e5)  // 500 kbps
          .addAudio(12)
          .addVideo(4)
        .addVariant(3).bandwidth(2e6)
          .addAudio(5)
          .addVideo(6)
        .addVariant(4).bandwidth(2e6)  // Identical on purpose.
          .addAudio(7)
          .addVideo(6)
        .addVariant(5).bandwidth(6e5)
          .addAudio(8)
          .addVideo(9)
        .addTextStream(10)
        .addTextStream(11)
      .build();

    variants = manifest.periods[0].variants;
    textStreams = manifest.periods[0].textStreams;

    abrManager = new shaka.abr.SimpleAbrManager();
    abrManager.init(switchCallback);
    abrManager.setVariants(variants);
    abrManager.setTextStreams(textStreams);
  });

  afterEach(function() {
    abrManager.stop();
  });

  afterAll(function() {
    shaka.polyfill.Promise.uninstall();
    jasmine.clock().uninstall();
  });

  it('can choose audio and video Streams right away', function() {
    var chosen = abrManager.chooseStreams([ContentType.AUDIO,
                                           ContentType.VIDEO]);
    expect(chosen[ContentType.AUDIO]).toBeTruthy();
    expect(chosen[ContentType.VIDEO]).toBeTruthy();
  });

  it('uses custom default estimate', function() {
    abrManager.setDefaultEstimate(3e6);
    var chosen = abrManager.chooseStreams([ContentType.AUDIO,
                                           ContentType.VIDEO]);
    expect(chosen[ContentType.VIDEO].id).toBe(6);
  });

  it('can handle empty variants', function() {
    var ContentType = shaka.util.ManifestParserUtils.ContentType;
    abrManager.setVariants([]);
    abrManager.setTextStreams([]);
    var chosen = abrManager.chooseStreams([ContentType.AUDIO,
                                           ContentType.VIDEO]);
    expect(Object.keys(chosen).length).toBe(0);
  });

  it('can choose from audio only variants', function() {
    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addVariant(0).bandwidth(4e5)
          .addAudio(0)
        .addVariant(1).bandwidth(1e6)
          .addAudio(2)
      .build();

    abrManager.setVariants(manifest.periods[0].variants);
    var chosen = abrManager.chooseStreams([ContentType.AUDIO]);

    expect(chosen[ContentType.AUDIO]).toBeTruthy();
    expect(chosen[ContentType.VIDEO]).toBeFalsy();
  });

  it('can choose from video only variants', function() {
    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addVariant(0).bandwidth(4e5)
          .addVideo(0)
        .addVariant(1).bandwidth(1e6)
          .addVideo(2)
      .build();

    abrManager.setVariants(manifest.periods[0].variants);
    var chosen = abrManager.chooseStreams([ContentType.VIDEO]);

    expect(chosen[ContentType.VIDEO]).toBeTruthy();
    expect(chosen[ContentType.AUDIO]).toBeFalsy();
  });

  [5e5, 6e5].forEach(function(bandwidth) {
    // Simulate some segments being downloaded just above the desired
    // bandwidth.
    var bytesPerSecond =
        sufficientBWMultiplier * bandwidth / 8.0;

    var bandwidthKbps = bandwidth / 1000.0;
    var description =
        'picks correct Variant at ' + bandwidthKbps + ' kbps';

    it(description, function() {
      abrManager.setVariants(variants);
      abrManager.chooseStreams([ContentType.AUDIO, ContentType.VIDEO]);

      abrManager.segmentDownloaded(1000, bytesPerSecond);
      abrManager.segmentDownloaded(1000, bytesPerSecond);

      abrManager.enable();

      // Make another call to segmentDownloaded() so switchCallback() is
      // called.
      abrManager.segmentDownloaded(1000, bytesPerSecond);

      // Expect variants 2 to be chosen for bandwidth = 5e5
      // and variant 5 - for bandwidth = 6e5
      var audioStream = variants[2].audio;
      var videoStream = variants[2].video;

      if (bandwidth == 6e5) {
        audioStream = variants[5].audio;
        videoStream = variants[5].video;
      }

      expect(switchCallback).toHaveBeenCalled();
      // Create empty object first and initialize the fields through
      // [] to allow field names to be expressions.
      var expectedObject = {};
      expectedObject[ContentType.AUDIO] = audioStream;
      expectedObject[ContentType.VIDEO] = videoStream;
      expect(switchCallback.calls.argsFor(0)[0]).toEqual(expectedObject);
    });
  });

  it('can handle 0 duration segments', function() {
    // Makes sure bandwidth estimate doesn't get set to NaN
    // when a 0 duration segment is encountered.
    // https://github.com/google/shaka-player/issues/582
    var bandwidth = 5e5;
    var bytesPerSecond =
        sufficientBWMultiplier * bandwidth / 8.0;

    abrManager.setVariants(variants);
    abrManager.chooseStreams([ContentType.AUDIO, ContentType.VIDEO]);

    // 0 duration segment shouldn't cause us to get stuck on the lowest variant
    abrManager.segmentDownloaded(0, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);

    abrManager.enable();

    abrManager.segmentDownloaded(1000, bytesPerSecond);

    expect(abrManager.getBandwidthEstimate()).toBeTruthy();
  });

  it('picks lowest variant when there is insufficient bandwidth',
      function() {
        var bandwidth = 2e6;

        abrManager.setVariants(variants);
        abrManager.chooseStreams([ContentType.AUDIO, ContentType.VIDEO]);

        // Simulate some segments being downloaded just above the desired
        // bandwidth.
        var bytesPerSecond =
            sufficientBWMultiplier * bandwidth / 8.0;

        abrManager.segmentDownloaded(1000, bytesPerSecond);
        abrManager.segmentDownloaded(1000, bytesPerSecond);

        abrManager.enable();

        // Make another call to segmentDownloaded() so switchCallback() is
        // called.
        abrManager.segmentDownloaded(1000, bytesPerSecond);

        // Expect variants 4 to be chosen
        var videoStream = variants[4].video;
        var audioStream = variants[4].audio;

        expect(switchCallback).toHaveBeenCalled();
        // Create empty object first and initialize the fields through
        // [] to allow field names to be expressions.
        var expectedObject = {};
        expectedObject[ContentType.AUDIO] = audioStream;
        expectedObject[ContentType.VIDEO] = videoStream;
        expect(switchCallback.calls.argsFor(0)[0]).toEqual(expectedObject);
      });

  it('does not call switchCallback() if not enabled', function() {
    var bandwidth = 5e5;
    var bytesPerSecond =
        sufficientBWMultiplier * bandwidth / 8.0;

    abrManager.setVariants(variants);
    abrManager.chooseStreams([ContentType.AUDIO, ContentType.VIDEO]);

    // Don't enable AbrManager.
    abrManager.segmentDownloaded(1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);
    expect(switchCallback).not.toHaveBeenCalled();
  });

  it('does not call switchCallback() in switch interval', function() {
    var bandwidth = 5e5;
    var bytesPerSecond =
        sufficientBWMultiplier * bandwidth / 8.0;

    abrManager.setVariants(variants);
    abrManager.chooseStreams([ContentType.AUDIO, ContentType.VIDEO]);

    abrManager.segmentDownloaded(1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);

    abrManager.enable();

    abrManager.segmentDownloaded(1000, bytesPerSecond);
    expect(switchCallback).toHaveBeenCalled();
    switchCallback.calls.reset();

    // Simulate drop in bandwidth.
    bandwidth = 2e6;
    bytesPerSecond =
        sufficientBWMultiplier * bandwidth / 8.0;

    abrManager.segmentDownloaded(1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);

    // Stay inside switch interval.
    shaka.test.Util.fakeEventLoop(
        (shaka.abr.SimpleAbrManager.SWITCH_INTERVAL_MS / 1000.0) - 2);
    abrManager.segmentDownloaded(1000, bytesPerSecond);

    expect(switchCallback).not.toHaveBeenCalled();

    // Move outside switch interval.
    shaka.test.Util.fakeEventLoop(3);
    abrManager.segmentDownloaded(1000, bytesPerSecond);

    expect(switchCallback).toHaveBeenCalled();
  });

  it('does not clear the buffer on upgrade', function() {
    // Simulate some segments being downloaded at a high rate, to trigger an
    // upgrade.
    var bandwidth = 5e5;
    var bytesPerSecond =
        sufficientBWMultiplier * bandwidth / 8.0;

    abrManager.setVariants(variants);
    abrManager.chooseStreams([ContentType.AUDIO, ContentType.VIDEO]);

    abrManager.segmentDownloaded(1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);

    abrManager.enable();

    // Make another call to segmentDownloaded(). switchCallback() will be
    // called to upgrade.
    abrManager.segmentDownloaded(1000, bytesPerSecond);

    // The second parameter is missing to indicate that the buffer should not be
    // cleared.
    expect(switchCallback).toHaveBeenCalledWith(jasmine.any(Object));
  });

  it('does not clear the buffer on downgrade', function() {
    // Simulate some segments being downloaded at a low rate, to trigger a
    // downgrade.
    var bandwidth = 5e5;
    var bytesPerSecond =
        sufficientBWMultiplier * bandwidth / 8.0;

    // Set the default high so that the initial choice will be high-quality.
    abrManager.setDefaultEstimate(4e6);

    abrManager.setVariants(variants);
    abrManager.chooseStreams([ContentType.AUDIO, ContentType.VIDEO]);

    abrManager.segmentDownloaded(1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, bytesPerSecond);

    abrManager.enable();

    // Make another call to segmentDownloaded(). switchCallback() will be
    // called to downgrade.
    abrManager.segmentDownloaded(1000, bytesPerSecond);

    // The second parameter is missing to indicate that the buffer should not be
    // cleared.
    expect(switchCallback).toHaveBeenCalledWith(jasmine.any(Object));
  });

  it('will respect restrictions', function() {
    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addVariant(0).bandwidth(1e5)
          .addVideo(0).size(50, 50)
        .addVariant(1).bandwidth(2e5)
          .addVideo(2).size(200, 200)
      .build();

    abrManager.setVariants(manifest.periods[0].variants);
    var chosen = abrManager.chooseStreams([ContentType.VIDEO]);
    expect(chosen[ContentType.VIDEO].id).toBe(2);

    abrManager.setRestrictions({maxWidth: 100});
    chosen = abrManager.chooseStreams([ContentType.VIDEO]);
    expect(chosen[ContentType.VIDEO].id).toBe(0);
  });
});
