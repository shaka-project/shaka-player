/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ContentSteeringManager', () => {
  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;

  /** @type {!shaka.util.ContentSteeringManager} */
  let manager;

  /** @type {number} */
  let bandwidthEstimate;

  beforeEach(() => {
    bandwidthEstimate = 1e6;
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    const config = shaka.util.PlayerConfiguration.createDefault();
    const playerInterface = {
      networkingEngine: fakeNetEngine,
      modifyManifestRequest: fail,
      modifySegmentRequest: fail,
      filter: fail,
      makeTextStreamsForClosedCaptions: fail,
      onTimelineRegionAdded: fail,
      onEvent: fail,
      onError: fail,
      isLowLatencyMode: fail,
      updateDuration: fail,
      newDrmInfo: fail,
      onManifestUpdated: fail,
      getBandwidthEstimate: () => bandwidthEstimate,
      onMetadata: () => {},
      disableStream: (stream) => {},
      addFont: (name, url) => {},
      getStreamingRetryParameters: () => config.streaming.retryParameters,
      onSegmentReceived: (deltaTimeMs, numBytes) => {},
    };
    manager = new shaka.util.ContentSteeringManager(playerInterface);
    manager.configure(config.manifest);
    manager.setBaseUris([
      'http://default',
    ]);
    manager.addLocation('foo', 'cdn-a', 'http://cdn-a');
    manager.addLocation('foo', 'cdn-b', 'http://cdn-b');
    manager.addLocation('foo', 'cdn-c', 'http://cdn-c');
  });

  afterEach(async () => {
    await manager.destroy();
  });

  describe('defaultPathwayId', () => {
    it('allows no value', () => {
      manager.setDefaultPathwayId(null);

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(3);
      expect(locations[0]).toBe('http://cdn-a/');
      expect(locations[1]).toBe('http://cdn-b/');
      expect(locations[2]).toBe('http://cdn-c/');
    });

    it('allows one value', () => {
      manager.setDefaultPathwayId('cdn-b');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(1);
      expect(locations[0]).toBe('http://cdn-b/');
    });

    it('allows multiple values', () => {
      manager.setDefaultPathwayId('cdn-b,cdn-a,cdn-c');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(3);
      expect(locations[0]).toBe('http://cdn-b/');
      expect(locations[1]).toBe('http://cdn-a/');
      expect(locations[2]).toBe('http://cdn-c/');
    });
  });

  describe('queryParams', () => {
    it('send the correct value for DASH', async () => {
      manager.setManifestType(shaka.media.ManifestParser.DASH);
      const manifest = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
          'cdn-a',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/manifest', manifest);

      await manager.requestInfo('http://foo.bar/manifest');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(2);
      expect(locations[0]).toBe('http://cdn-b/');
      expect(locations[1]).toBe('http://cdn-a/');

      const manifestUpdate = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
        ],
      });
      const updateUrl = 'http://foo.bar/update?_DASH_pathway=cdn-b&_DASH_throughput=1000000';
      fakeNetEngine.setResponseText(updateUrl, manifestUpdate);

      await shaka.test.Util.delay(1);

      const newLocations = manager.getLocations('foo');
      expect(newLocations.length).toBe(1);
      expect(newLocations[0]).toBe('http://cdn-b/');
    });

    it('send the correct value for HLS', async () => {
      manager.setManifestType(shaka.media.ManifestParser.HLS);
      const manifest = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
          'cdn-a',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/manifest', manifest);

      await manager.requestInfo('http://foo.bar/manifest');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(2);
      expect(locations[0]).toBe('http://cdn-b/');
      expect(locations[1]).toBe('http://cdn-a/');

      const manifestUpdate = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
        ],
      });
      const updateUrl = 'http://foo.bar/update?_HLS_pathway=cdn-b&_HLS_throughput=1000000';
      fakeNetEngine.setResponseText(updateUrl, manifestUpdate);

      await shaka.test.Util.delay(1);

      const newLocations = manager.getLocations('foo');
      expect(newLocations.length).toBe(1);
      expect(newLocations[0]).toBe('http://cdn-b/');
    });

    // A preload started before the first load() has no bandwidth estimate yet.
    // See #10824.
    for (const [type, prefix] of [
      [shaka.media.ManifestParser.DASH, '_DASH'],
      [shaka.media.ManifestParser.HLS, '_HLS'],
    ]) {
      it(`omits throughput without an estimate for ${type}`, async () => {
        bandwidthEstimate = NaN;
        manager.setManifestType(type);
        const manifest = JSON.stringify({
          'VERSION': 1,
          'TTL': 1,
          'RELOAD-URI': 'http://foo.bar/update',
          'PATHWAY-PRIORITY': [
            'cdn-b',
            'cdn-a',
          ],
        });
        fakeNetEngine.setResponseText('http://foo.bar/manifest', manifest);

        await manager.requestInfo('http://foo.bar/manifest');

        const manifestUpdate = JSON.stringify({
          'VERSION': 1,
          'TTL': 1,
          'RELOAD-URI': 'http://foo.bar/update',
          'PATHWAY-PRIORITY': [
            'cdn-b',
          ],
        });
        const updateUrl = `http://foo.bar/update?${prefix}_pathway=cdn-b`;
        fakeNetEngine.setResponseText(updateUrl, manifestUpdate);

        await shaka.test.Util.delay(1);

        const newLocations = manager.getLocations('foo');
        expect(newLocations.length).toBe(1);
        expect(newLocations[0]).toBe('http://cdn-b/');
      });
    }

    it('not send value for unknown manifest', async () => {
      const manifest = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
          'cdn-a',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/manifest', manifest);

      await manager.requestInfo('http://foo.bar/manifest');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(2);
      expect(locations[0]).toBe('http://cdn-b/');
      expect(locations[1]).toBe('http://cdn-a/');

      const manifestUpdate = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/update', manifestUpdate);

      await shaka.test.Util.delay(1);

      const newLocations = manager.getLocations('foo');
      expect(newLocations.length).toBe(1);
      expect(newLocations[0]).toBe('http://cdn-b/');
    });
  });

  describe('steeringManifest', () => {
    it('ignores manifest with a version different than 1', async () => {
      const manifest = JSON.stringify({
        'VERSION': 35,
        'TTL': 10,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
          'cdn-a',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/manifest', manifest);

      await manager.requestInfo('http://foo.bar/manifest');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(3);
      expect(locations[0]).toBe('http://cdn-a/');
      expect(locations[1]).toBe('http://cdn-b/');
      expect(locations[2]).toBe('http://cdn-c/');
    });

    it('honors RELOAD-URI', async () => {
      const manifest = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
          'cdn-a',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/manifest', manifest);

      await manager.requestInfo('http://foo.bar/manifest');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(2);
      expect(locations[0]).toBe('http://cdn-b/');
      expect(locations[1]).toBe('http://cdn-a/');

      const manifestUpdate = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/update', manifestUpdate);

      await shaka.test.Util.delay(1);

      const newLocations = manager.getLocations('foo');
      expect(newLocations.length).toBe(1);
      expect(newLocations[0]).toBe('http://cdn-b/');
    });

    it('fallback for no RELOAD-URI', async () => {
      const manifest = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'PATHWAY-PRIORITY': [
          'cdn-b',
          'cdn-a',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/manifest', manifest);

      await manager.requestInfo('http://foo.bar/manifest');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(2);
      expect(locations[0]).toBe('http://cdn-b/');
      expect(locations[1]).toBe('http://cdn-a/');

      const manifestUpdate = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'PATHWAY-PRIORITY': [
          'cdn-b',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/manifest', manifestUpdate);

      await shaka.test.Util.delay(1);

      const newLocations = manager.getLocations('foo');
      expect(newLocations.length).toBe(1);
      expect(newLocations[0]).toBe('http://cdn-b/');
    });

    it('honors TTL', async () => {
      const manifest = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
          'cdn-a',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/manifest', manifest);

      await manager.requestInfo('http://foo.bar/manifest');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(2);
      expect(locations[0]).toBe('http://cdn-b/');
      expect(locations[1]).toBe('http://cdn-a/');

      const manifestUpdate = JSON.stringify({
        'VERSION': 1,
        'TTL': 2,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/update', manifestUpdate);

      await shaka.test.Util.delay(2);

      const newLocations = manager.getLocations('foo');
      expect(newLocations.length).toBe(1);
      expect(newLocations[0]).toBe('http://cdn-b/');
    });
  });

  describe('get correct locations', () => {
    it('with PATHWAY-PRIORITY', async () => {
      const manifest = JSON.stringify({
        'VERSION': 1,
        'TTL': 10,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
          'cdn-a',
          'cdn-c',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/manifest', manifest);

      await manager.requestInfo('http://foo.bar/manifest');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(3);
      expect(locations[0]).toBe('http://cdn-b/');
      expect(locations[1]).toBe('http://cdn-a/');
      expect(locations[2]).toBe('http://cdn-c/');
    });

    it('with PATHWAY-PRIORITY and PATHWAY-CLONES', async () => {
      const manifest = JSON.stringify({
        'VERSION': 1,
        'TTL': 10,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-d',
          'cdn-b',
          'cdn-a',
          'cdn-c',
        ],
        'PATHWAY-CLONES': [
          {
            'BASE-ID': 'cdn-c',
            'ID': 'cdn-d',
            'URI-REPLACEMENT': {
              'HOST': 'cdn-d',
            },
          },
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/manifest', manifest);

      await manager.requestInfo('http://foo.bar/manifest');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(4);
      expect(locations[0]).toBe('http://cdn-d/');
      expect(locations[1]).toBe('http://cdn-b/');
      expect(locations[2]).toBe('http://cdn-a/');
      expect(locations[3]).toBe('http://cdn-c/');
    });

    it('without PATHWAY-PRIORITY but with defaultPathwayId', () => {
      manager.setDefaultPathwayId('cdn-b,cdn-a,cdn-c');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(3);
      expect(locations[0]).toBe('http://cdn-b/');
      expect(locations[1]).toBe('http://cdn-a/');
      expect(locations[2]).toBe('http://cdn-c/');
    });

    it('without PATHWAY-PRIORITY neither defaultPathwayId', () => {
      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(3);
      expect(locations[0]).toBe('http://cdn-a/');
      expect(locations[1]).toBe('http://cdn-b/');
      expect(locations[2]).toBe('http://cdn-c/');
    });

    it('use base uris if no locations', () => {
      manager.clearPreviousLocations();
      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(1);
      expect(locations[0]).toBe('http://default');
    });
  });

  describe('allow ban locations', () => {
    it('with PATHWAY-PRIORITY', async () => {
      const manifest = JSON.stringify({
        'VERSION': 1,
        'TTL': 10,
        'RELOAD-URI': 'http://foo.bar/update',
        'PATHWAY-PRIORITY': [
          'cdn-b',
          'cdn-a',
          'cdn-c',
        ],
      });
      fakeNetEngine.setResponseText('http://foo.bar/manifest', manifest);

      await manager.requestInfo('http://foo.bar/manifest');

      manager.banLocation('http://cdn-b');

      const locations = manager.getLocations('foo');
      expect(locations.length).toBe(2);
      expect(locations[0]).toBe('http://cdn-a/');
      expect(locations[1]).toBe('http://cdn-c/');
    });
  });
});
