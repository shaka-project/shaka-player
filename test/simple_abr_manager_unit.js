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
  var originalTimeout;
  var originalSetTimeout;
  var startupInterval;
  var switchCallback;
  var abrManager;
  var audioStreamSet;
  var videoStreamSet;
  var streamSetsByType;

  beforeAll(function() {
    originalSetTimeout = window.setTimeout;
    startupInterval = shaka.abr.SimpleAbrManager.STARTUP_INTERVAL_MS / 1000.0;

    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;  // ms
  });

  beforeEach(function() {
    jasmine.clock().mockDate();
    jasmine.clock().install();

    switchCallback = jasmine.createSpy('switchCallback');

    // Keep unsorted.
    audioStreamSet = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addStreamSet('audio')
          .addStream(0).bandwidth(4e5)  // 400 kbps
          .addStream(1).bandwidth(6e5)
          .addStream(2).bandwidth(5e5)
      .build()
      .periods[0].streamSets[0];

    // Keep unsorted.
    videoStreamSet = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addStreamSet('video')
          .addStream(1).bandwidth(5e5)  // 500 kbps, initial selection
          .addStream(2).bandwidth(1e6)  // 1000 kbps
          .addStream(3).bandwidth(3e6)
          .addStream(4).bandwidth(2e6)
          .addStream(5).bandwidth(2e6)  // Identical on purpose.
      .build()
      .periods[0].streamSets[0];

    streamSetsByType = {
      'audio': audioStreamSet,
      'video': videoStreamSet
    };

    abrManager = new shaka.abr.SimpleAbrManager();
    abrManager.init(switchCallback);
  });

  afterEach(function() {
    abrManager.stop();
    jasmine.clock().uninstall();
  });

  afterAll(function() {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
  });

  it('can choose audio and video Streams right away', function() {
    var streamsByType = abrManager.chooseStreams(streamSetsByType);
    expect(streamsByType['audio']).toBeTruthy();
    expect(streamsByType['video']).toBeTruthy();
  });

  it('uses custom default estimate', function() {
    abrManager.setDefaultEstimate(3e6);
    var streamsByType = abrManager.chooseStreams(streamSetsByType);
    expect(streamsByType['video'].bandwidth).toBe(2e6);
  });

  it('can choose just an audio Stream right away', function() {
    delete streamSetsByType['video'];
    var streamsByType = abrManager.chooseStreams(streamSetsByType);
    expect(streamsByType['audio']).toBeTruthy();
    expect(streamsByType['video']).toBeFalsy();
  });

  it('can choose just a video Stream right away', function() {
    delete streamSetsByType['audio'];
    var streamsByType = abrManager.chooseStreams(streamSetsByType);
    expect(streamsByType['audio']).toBeFalsy();
    expect(streamsByType['video']).toBeTruthy();
  });

  it('won\'t choose restricted streams', function() {
    // No available audio streams.
    audioStreamSet.streams[0].allowedByKeySystem = false;
    audioStreamSet.streams[1].allowedByApplication = false;
    audioStreamSet.streams[2].allowedByApplication = false;
    // Disallow the initial guess.
    videoStreamSet.streams[0].allowedByApplication = false;

    var streamsByType = abrManager.chooseStreams(streamSetsByType);
    expect(streamsByType['audio']).toBeFalsy();
    expect(streamsByType['video']).toBeTruthy();
    expect(streamsByType['video'].bandwidth).toBe(1e6);
  });

  it('can handle empty StreamSets', function() {
    var streamsByType = abrManager.chooseStreams({});
    expect(Object.keys(streamsByType).length).toBe(0);
  });

  [1e6, 2e6, 3e6].forEach(function(videoBandwidth) {
    var audioBandwidth = 5e5;  // This corresponds to the middle audio Stream.

    // Simulate some segments being downloaded just above the desired
    // bandwidth.
    var bytesPerSecond = 1.1 * (audioBandwidth + videoBandwidth) / 8.0;

    var bandwidthKbps = (audioBandwidth + videoBandwidth) / 1000.0;
    var description = 'picks correct Stream at ' + bandwidthKbps + ' kbps';

    it(description, function(done) {
      abrManager.chooseStreams(streamSetsByType);

      abrManager.segmentDownloaded(0, 1000, bytesPerSecond);
      abrManager.segmentDownloaded(1000, 2000, bytesPerSecond);

      abrManager.enable();

      // Move outside the startup interval.
      var delay = shaka.test.Util.fakeEventLoop(
          startupInterval + 1, originalSetTimeout);
      delay.then(function() {
        // Make another call to segmentDownloaded() so switchCallback() is
        // called.
        abrManager.segmentDownloaded(3000, 4000, bytesPerSecond);

        expect(switchCallback).toHaveBeenCalledWith({
          'audio': jasmine.objectContaining({bandwidth: audioBandwidth}),
          'video': jasmine.objectContaining({bandwidth: videoBandwidth})
        });
      }).catch(fail).then(done);
    });
  });

  it('does not call switchCallback() if not enabled', function(done) {
    var audioBandwidth = 5e5;
    var videoBandwidth = 2e6;
    var bytesPerSecond = 1.1 * (audioBandwidth + videoBandwidth) / 8.0;

    abrManager.chooseStreams(streamSetsByType);

    abrManager.segmentDownloaded(0, 1000, bytesPerSecond);
    abrManager.segmentDownloaded(2000, 3000, bytesPerSecond);

    // Don't enable AbrManager.

    // Move outside the startup interval.
    var delay = shaka.test.Util.fakeEventLoop(
        startupInterval + 1, originalSetTimeout);
    delay.then(function() {
      abrManager.segmentDownloaded(4000, 5000, bytesPerSecond);
      expect(switchCallback).not.toHaveBeenCalled();
    }).catch(fail).then(done);
  });

  it('does not call switchCallback() until startup', function(done) {
    var audioBandwidth = 5e5;
    var videoBandwidth = 2e6;
    var bytesPerSecond = 1.1 * (audioBandwidth + videoBandwidth) / 8.0;

    abrManager.chooseStreams(streamSetsByType);

    abrManager.segmentDownloaded(0, 1000, bytesPerSecond);
    abrManager.segmentDownloaded(2000, 3000, bytesPerSecond);

    abrManager.enable();

    // Stay inside startup interval
    var delay = shaka.test.Util.fakeEventLoop(
        startupInterval - 2, originalSetTimeout);
    delay.then(function() {
      abrManager.segmentDownloaded(4000, 5000, bytesPerSecond);
      expect(switchCallback).not.toHaveBeenCalled();

      // Move outside startup interval.
      return shaka.test.Util.fakeEventLoop(3, originalSetTimeout);
    }).then(function() {
      abrManager.segmentDownloaded(6000, 7000, bytesPerSecond);

      expect(switchCallback).toHaveBeenCalledWith({
        'audio': jasmine.objectContaining({bandwidth: audioBandwidth}),
        'video': jasmine.objectContaining({bandwidth: videoBandwidth})
      });
    }).catch(fail).then(done);
  });

  it('does not call switchCallback() in switch interval', function(done) {
    var audioBandwidth = 5e5;
    var videoBandwidth = 3e6;
    var bytesPerSecond = 1.1 * (audioBandwidth + videoBandwidth) / 8.0;

    abrManager.chooseStreams(streamSetsByType);

    abrManager.segmentDownloaded(0, 1000, bytesPerSecond);
    abrManager.segmentDownloaded(2000, 3000, bytesPerSecond);

    abrManager.enable();

    // Move outside the startup interval.
    var delay = shaka.test.Util.fakeEventLoop(
        startupInterval + 1, originalSetTimeout);
    delay.then(function() {
      abrManager.segmentDownloaded(3000, 4000, bytesPerSecond);

      expect(switchCallback).toHaveBeenCalled();
      switchCallback.calls.reset();

      // Simulate drop in bandwidth.
      audioBandwidth = 5e5;
      videoBandwidth = 1e6;
      bytesPerSecond = 0.9 * (audioBandwidth + videoBandwidth) / 8.0;

      abrManager.segmentDownloaded(5000, 6000, bytesPerSecond);
      abrManager.segmentDownloaded(7000, 8000, bytesPerSecond);

      // Stay inside switch interval.
      return shaka.test.Util.fakeEventLoop(
          (shaka.abr.SimpleAbrManager.SWITCH_INTERVAL_MS / 1000.0) - 2,
          originalSetTimeout);
    }).then(function() {
      abrManager.segmentDownloaded(10000, 11000, bytesPerSecond);

      expect(switchCallback).not.toHaveBeenCalled();

      // Move outside switch interval.
      return shaka.test.Util.fakeEventLoop(3, originalSetTimeout);
    }).then(function() {
      abrManager.segmentDownloaded(12000, 13000, bytesPerSecond);

      expect(switchCallback).toHaveBeenCalledWith({
        'audio': jasmine.objectContaining({bandwidth: audioBandwidth}),
        'video': jasmine.objectContaining({bandwidth: videoBandwidth})
      });
    }).catch(fail).then(done);
  });

  it('does not call switchCallback() if no changes are needed', function(done) {
    // Simulate some segments being downloaded just above the needed bandwidth
    // for the least stream.
    var audioBandwidth = 5e5;
    var videoBandwidth = 5e5;
    var bytesPerSecond = 1.1 * (audioBandwidth + videoBandwidth) / 8.0;

    abrManager.chooseStreams(streamSetsByType);

    abrManager.segmentDownloaded(0, 1000, bytesPerSecond);
    abrManager.segmentDownloaded(1000, 2000, bytesPerSecond);

    abrManager.enable();

    // Move outside the startup interval.
    var delay = shaka.test.Util.fakeEventLoop(
        startupInterval + 1, originalSetTimeout);
    delay.then(function() {
      // Make another call to segmentDownloaded(). switchCallback() will not be
      // called because the best streams for the available bandwidth are already
      // active.
      abrManager.segmentDownloaded(3000, 4000, bytesPerSecond);

      expect(switchCallback).not.toHaveBeenCalled();
    }).catch(fail).then(done);
  });
});
