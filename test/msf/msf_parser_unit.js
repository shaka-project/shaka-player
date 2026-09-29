filterDescribe('shaka.msf.MSFParser', isMSFSupported, () => {
  // '{"version":1,"tracks":[]}', gzipped.
  const GZIPPED_CATALOG = new Uint8Array([
    0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xff, 0xab, 0x56,
    0x2a, 0x4b, 0x2d, 0x2a, 0xce, 0xcc, 0xcf, 0x53, 0xb2, 0x32, 0xd4, 0x51,
    0x2a, 0x29, 0x4a, 0x4c, 0xce, 0x2e, 0x56, 0xb2, 0x8a, 0x8e, 0xad, 0x05,
    0x00, 0x05, 0xdf, 0x04, 0x44, 0x19, 0x00, 0x00, 0x00,
  ]);

  // '[[0,[0,0],0],[2002,[1,0],0]]', a media timeline, gzipped.
  const GZIPPED_TIMELINE = new Uint8Array([
    0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xff, 0x8b, 0x8e,
    0x36, 0xd0, 0x01, 0x22, 0x83, 0x58, 0x10, 0x8a, 0x36, 0x32, 0x30, 0x30,
    0xd2, 0x89, 0x36, 0x84, 0x70, 0x63, 0x01, 0x7c, 0x5b, 0xc8, 0xe4, 0x1c,
    0x00, 0x00, 0x00,
  ]);

  /**
   * An MSF_COMPRESSION property block. 0x78 and every value used here fit in
   * one byte in the draft-18 var int encoding.
   *
   * @param {number} algorithm
   * @return {!Uint8Array}
   */
  function compressionProperty(algorithm) {
    return new Uint8Array([0x78, algorithm]);
  }

  /**
   * @param {function():boolean} condition
   * @return {!Promise}
   */
  async function waitFor(condition) {
    for (let i = 0; i < 100 && !condition(); i++) {
      // eslint-disable-next-line no-await-in-loop
      await shaka.test.Util.shortDelay();
    }
    expect(condition()).toBe(true);
  }

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.msf.MSFParser} */
  let parser;
  /** @type {!jasmine.Spy} */
  let onEventSpy;
  /** @type {!jasmine.Spy} */
  let newDrmInfoSpy;
  /** @type {!jasmine.Spy} */
  let onMetadataSpy;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;
  /** @type {shaka.extern.ManifestConfiguration} */
  let config;

  afterEach(() => {
    parser.stop();
  });

  beforeEach(() => {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();

    const dConfig = shaka.util.PlayerConfiguration.createDefault();
    config = dConfig.manifest;
    onEventSpy = jasmine.createSpy('onEvent');
    newDrmInfoSpy = jasmine.createSpy('newDrmInfo');
    onMetadataSpy = jasmine.createSpy('onMetadata');
    playerInterface = {
      modifyManifestRequest: (request, manifestInfo) => {},
      modifySegmentRequest: (request, segmentInfo) => {},
      filter: () => Promise.resolve(),
      makeTextStreamsForClosedCaptions: (manifest) => {},
      networkingEngine: fakeNetEngine,
      onError: fail,
      onEvent: shaka.test.Util.spyFunc(onEventSpy),
      onTimelineRegionAdded: fail,
      onScte35Event: fail,
      isLowLatencyMode: () => false,
      updateDuration: () => {},
      newDrmInfo: shaka.test.Util.spyFunc(newDrmInfoSpy),
      onManifestUpdated: () => {},
      getBandwidthEstimate: () => 1e6,
      onMetadata: shaka.test.Util.spyFunc(onMetadataSpy),
      disableStream: (stream) => {},
      addFont: (name, url) => {},
      getStreamingRetryParameters: () => dConfig.streaming.retryParameters,
      onSegmentReceived: (deltaTimeMs, numBytes) => {},
    };

    parser = new shaka.msf.MSFParser();
    parser.configure(config);
  });

  describe('a session the server hangs up on', () => {
    /** @type {?} */
    let realTransport;

    beforeEach(() => {
      // A namespace in the configuration is what sends the parser straight to
      // the catalog subscription instead of waiting for an announcement.
      config.msf.namespaces = ['msf', 'clear'];
      parser.configure(config);
      realTransport = shaka.msf['MSFTransport'];
    });

    afterEach(() => {
      shaka.msf['MSFTransport'] = realTransport;
    });

    /**
     * A transport whose session ends with the given reason while the catalog
     * subscription is still waiting for an answer, which is what a server
     * that rejects something the client sent looks like from here.
     *
     * @param {string} reason
     */
    function transportThatEnds(reason) {
      shaka.msf['MSFTransport'] = class {
        /** @return {!Promise} */
        connect() {
          return Promise.resolve({});
        }

        /**
         * The subscription dies with the session, but its WebTransport error
         * says nothing about why; the session's reason does.
         *
         * @return {!Promise}
         */
        subscribeTrack() {
          return new Promise(() => {});
        }

        /** @return {!Promise<string>} */
        waitForSessionEnd() {
          return Promise.resolve(reason);
        }

        /** */
        configure() {}

        /** */
        release() {}
      };
    }

    it('reports why the session ended instead of a catalog timeout',
        async () => {
          const reason = 'WebTransportError: Connection lost.';
          transportThatEnds(reason);

          const expected = shaka.test.Util.jasmineError(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.MSF_CONNECTION_CLOSED,
              reason));

          await expectAsync(parser.start('moqt://relay.example/live',
              playerInterface)).toBeRejectedWith(expected);
        });
  });

  describe('accessibility descriptors', () => {
    /**
     * @param {!Array<!Object>} accessibility
     * @return {msfCatalog.Track}
     */
    function videoTrack(accessibility) {
      return /** @type {msfCatalog.Track} */ ({
        name: 'video0',
        packaging: 'loc',
        codec: 'avc3.4d401f',
        role: 'video',
        framerate: 25,
        width: 1280,
        height: 720,
        isLive: true,
        accessibility,
      });
    }

    /**
     * @param {msfCatalog.Track} track
     * @return {Map<string, string>}
     * @suppress {visibility}
     */
    function closedCaptionsOf(track) {
      parser.processTrack_(track, new Map(), new Map());
      const streams = parser.videoStreams_;
      return streams.length ? streams[0].closedCaptions : null;
    }

    it('reads CEA-608 captions from the scheme field', () => {
      // draft-ietf-moq-msf-01 5.2.44 names the field 'scheme'.  Reading the
      // DASH spelling 'schemeIdUri'/'schemeId' instead left this map empty
      // for every conforming catalog, so embedded captions were advertised
      // by the publisher and never exposed by the player.
      const captions = closedCaptionsOf(videoTrack([{
        scheme: 'urn:scte:dash:cc:cea-608:2015',
        value: 'CC1=eng',
      }]));

      expect(captions).not.toBeNull();
      expect(captions.get('CC1')).toBe('en');
    });

    it('reads CEA-708 captions from the scheme field', () => {
      const captions = closedCaptionsOf(videoTrack([{
        scheme: 'urn:scte:dash:cc:cea-708:2015',
        value: '1=lang:eng',
      }]));

      expect(captions).not.toBeNull();
      expect(captions.size).toBe(1);
    });

    it('ignores an unknown scheme', () => {
      const captions = closedCaptionsOf(videoTrack([{
        scheme: 'urn:example:something-else',
        value: 'CC1=eng',
      }]));

      expect(captions).not.toBeNull();
      expect(captions.size).toBe(0);
    });

    it('tolerates a track with no accessibility at all', () => {
      const track = videoTrack([]);
      delete track['accessibility'];

      const captions = closedCaptionsOf(track);
      expect(captions).not.toBeNull();
      expect(captions.size).toBe(0);
    });
  });

  describe('catalog logging', () => {
    /**
     * processCatalog_ writes the presentation timeline, which start() would
     * normally have created.
     * @suppress {visibility}
     */
    function givenAStartedParser() {
      parser.presentationTimeline_ = new shaka.msf.MSFPresentationTimeline();
    }

    /**
     * @param {msfCatalog.Catalog} catalog
     * @return {!Promise}
     * @suppress {visibility}
     */
    function processCatalog(catalog) {
      return parser.processCatalog_(catalog);
    }

    /**
     * @return {msfCatalog.Catalog}
     */
    function catalogWithTwoTracks() {
      return /** @type {msfCatalog.Catalog} */ ({
        version: 1,
        tracks: [
          {name: 'video_cmaf', packaging: 'cmaf', codec: 'avc3.4d401f',
            isLive: true},
          {name: 'video_locmaf', packaging: 'locmaf', codec: 'avc3.4d401f',
            locmafVersion: '0.3', isLive: true},
        ],
      });
    }

    it('logs the catalog as it arrived, not as the preprocessor left it',
        async () => {
          // A console keeps a logged object by reference and renders it when
          // it is expanded, so logging the catalog before and after an
          // in-place preprocessor used to show the processed one twice. What
          // reproduces that is inspecting the logged value afterwards, which
          // is what expanding it in a console does.
          const logged = [];
          spyOn(shaka.log, 'info').and.callFake((...args) => {
            logged.push(args);
          });

          config.msf.catalogPreprocessor = (catalog) => {
            catalog.tracks = catalog.tracks.filter(
                (track) => track.packaging == 'locmaf');
          };
          parser.configure(config);

          givenAStartedParser();
          const catalog = catalogWithTwoTracks();
          await processCatalog(catalog);

          const before = logged.find((args) => args[0] == 'MSF Catalog:');
          const after = logged.find(
              (args) => args[0] == 'MSF Catalog after preprocessor:');
          expect(before).toBeDefined();
          expect(after).toBeDefined();

          expect(before[1].tracks.length).toBe(2);
          expect(before[1].tracks.map((t) => t.name))
              .toEqual(['video_cmaf', 'video_locmaf']);
          expect(after[1].tracks.length).toBe(1);
          // The two lines must not be the same object, or the first would
          // change under the reader's feet.
          expect(before[1]).not.toBe(after[1]);
          expect(after[1]).toBe(catalog);
        });

    it('logs only the arrived catalog when no preprocessor is configured',
        async () => {
          const logged = [];
          spyOn(shaka.log, 'info').and.callFake((...args) => {
            logged.push(args);
          });

          givenAStartedParser();
          const catalog = catalogWithTwoTracks();
          await processCatalog(catalog);

          const before = logged.find((args) => args[0] == 'MSF Catalog:');
          expect(before).toBeDefined();
          expect(before[1]).toEqual(catalog);
          expect(logged.some(
              (args) => args[0] == 'MSF Catalog after preprocessor:'))
              .toBe(false);
        });
  });

  describe('catalog compression', () => {
    /** @type {number} */
    let draftNumber;

    beforeEach(() => {
      draftNumber = 18;
    });

    /**
     * @return {shaka.extern.MsfObjectCallback}
     * @suppress {visibility}
     */
    function catalogCallback() {
      const codec = new shaka.msf.draft18.Codec();
      parser.msfTransport_ = /** @type {!shaka.msf.MSFTransport} */ (
        /** @type {?} */ ({
          getCodec: () => codec,
          getDraftNumber: () => draftNumber,
          release: () => {},
        }));
      return parser.createCatalogCallback_();
    }

    /**
     * @return {!Promise<msfCatalog.Catalog>}
     * @suppress {visibility}
     */
    function catalog() {
      return parser.catalogPromise_.promise;
    }

    /**
     * @param {!Uint8Array} data
     * @param {?Uint8Array} extensions
     * @param {?Uint8Array=} trackProperties
     * @return {!shaka.extern.MsfObject}
     */
    function catalogObject(data, extensions, trackProperties = null) {
      return {
        trackAlias: BigInt(1),
        location: {group: BigInt(0), object: BigInt(0), subgroup: null},
        data,
        extensions,
        trackProperties,
        status: null,
        payloadReadStartMs: 0,
        receiveTimestampMs: 0,
      };
    }

    /**
     * @return {!Uint8Array}
     */
    function plainCatalog() {
      return shaka.util.BufferUtils.toUint8(
          shaka.util.StringUtils.toUTF8('{"version":1,"tracks":[]}'));
    }

    filterDescribe('with GZIP', isDecompressionStreamSupported, () => {
      it('reads a catalog compressed by Track Property', async () => {
        catalogCallback()(catalogObject(
            GZIPPED_CATALOG, null, compressionProperty(1)));
        expect(await catalog()).toEqual(
            /** @type {msfCatalog.Catalog} */ ({version: 1, tracks: []}));
      });

      it('reads a catalog compressed by Object Property', async () => {
        catalogCallback()(catalogObject(
            GZIPPED_CATALOG, compressionProperty(1)));
        expect(await catalog()).toEqual(
            /** @type {msfCatalog.Catalog} */ ({version: 1, tracks: []}));
      });
    });

    it('fails on a compression it does not support', async () => {
      catalogCallback()(catalogObject(plainCatalog(), compressionProperty(2)));
      const expected = shaka.test.Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSF_UNSUPPORTED_COMPRESSION,
          2));
      await expectAsync(catalog()).toBeRejectedWith(expected);
    });

    it('reads an uncompressed catalog', async () => {
      catalogCallback()(catalogObject(plainCatalog(), compressionProperty(0)));
      expect(await catalog()).toEqual(
          /** @type {msfCatalog.Catalog} */ ({version: 1, tracks: []}));
    });

    it('leaves the deprecated drafts as they were', async () => {
      // Only draft-18 and later are read for MSF_COMPRESSION.
      draftNumber = 16;
      catalogCallback()(catalogObject(plainCatalog(), compressionProperty(2)));
      expect(await catalog()).toEqual(
          /** @type {msfCatalog.Catalog} */ ({version: 1, tracks: []}));
    });
  });

  describe('segment index lifecycle', () => {
    const PACKAGING = 'fake-for-test';

    /** @type {!Array<!shaka.extern.MsfSegment>} */
    let nextSegments;
    /** @type {!Array<{resolve: function(bigint), reject: function(*)}>} */
    let pendingSubscribes;
    /** @type {!Array<shaka.extern.MsfObjectCallback>} */
    let objectCallbacks;
    /** @type {!jasmine.Spy} */
    let unsubscribeSpy;

    /**
     * @return {!shaka.extern.MsfSegment}
     */
    function fakeSegment() {
      return {
        startTime: 0,
        duration: 1,
        data: new Uint8Array([0x01]),
        timestampOffset: 0,
        discontinuitySequence: 0,
      };
    }

    /**
     * @param {number} group
     * @return {!shaka.extern.MsfObject}
     */
    function fakeObject(group) {
      return /** @type {!shaka.extern.MsfObject} */ (/** @type {?} */ ({
        trackAlias: BigInt(7),
        location: {group: BigInt(group), object: BigInt(0), subgroup: null},
        data: new Uint8Array([0x01, 0x02]),
        payloadReadStartMs: 0,
        receiveTimestampMs: 10,
      }));
    }

    /**
     * Creates the one stream of a catalog holding a single video track.
     *
     * @return {!shaka.extern.Stream}
     * @suppress {visibility}
     */
    function makeStream() {
      parser.playerInterface_ = playerInterface;
      parser.presentationTimeline_ = new shaka.msf.MSFPresentationTimeline();
      parser.msfTransport_ = /** @type {!shaka.msf.MSFTransport} */ (
        /** @type {?} */ ({
          getCodec: () => null,
          subscribeTrack: (namespace, trackName, callback) => {
            objectCallbacks.push(callback);
            return new Promise((resolve, reject) => {
              pendingSubscribes.push({resolve, reject});
            });
          },
          unsubscribeTrack: shaka.test.Util.spyFunc(unsubscribeSpy),
          supportsAbsoluteStart: () => false,
          release: () => {},
        }));

      parser.processTrack_(/** @type {msfCatalog.Track} */ ({
        name: 'video0',
        packaging: PACKAGING,
        codec: 'avc3.4d401f',
        role: 'video',
        framerate: 25,
        width: 1280,
        height: 720,
        isLive: true,
      }), new Map(), new Map());

      expect(parser.videoStreams_.length).toBe(1);
      return parser.videoStreams_[0];
    }

    beforeEach(() => {
      nextSegments = [];
      pendingSubscribes = [];
      objectCallbacks = [];
      unsubscribeSpy = jasmine.createSpy('unsubscribeTrack')
          .and.returnValue(Promise.resolve());

      shaka.msf.PackagingRegistry.registerPackaging(PACKAGING, () => {
        return /** @type {!shaka.extern.MsfPackaging} */ (/** @type {?} */ ({
          describeTrack: () => ({
            basicInfo: /** @type {?} */ ({
              mimeType: 'video/mp4',
              codecs: 'avc1.4d401f',
            }),
            initSegmentReference: null,
          }),
          createSegmenter: () => ({push: () => nextSegments}),
        }));
      });
    });

    afterEach(() => {
      shaka.msf.PackagingRegistry.unregisterPackaging(PACKAGING);
    });

    it('stops adding segments when the index closes mid-object', () => {
      // Reporting a completed group to ABR can pick a new variant and switch
      // to it synchronously, and StreamingEngine closes the outgoing stream's
      // segment index on its way through. That lands in the middle of this
      // object's segments, so the index has to be re-checked for each one.
      const stream = makeStream();
      stream.createSegmentIndex();
      const callback = objectCallbacks[0];

      playerInterface.onSegmentReceived = () => {
        stream.closeSegmentIndex();
      };

      nextSegments = [fakeSegment(), fakeSegment()];
      // The first object opens a group; the second closes it, which is what
      // reports to ABR.
      callback(fakeObject(0));
      expect(() => callback(fakeObject(1))).not.toThrow();
      expect(stream.segmentIndex).toBeNull();
    });

    it('withdraws a subscription that closed before SUBSCRIBE_OK', async () => {
      // Until the SUBSCRIBE_OK lands there is no Track Alias, so there is
      // nothing to unsubscribe with. A track closed in that window used to be
      // left subscribed for the rest of the session, with the publisher
      // sending objects nobody listened to.
      const stream = makeStream();
      stream.createSegmentIndex();
      stream.closeSegmentIndex();

      expect(unsubscribeSpy).not.toHaveBeenCalled();

      pendingSubscribes[0].resolve(BigInt(7));
      await shaka.test.Util.shortDelay();

      expect(unsubscribeSpy).toHaveBeenCalledWith(BigInt(7));
    });

    it('keeps a subscription that is still open when SUBSCRIBE_OK lands',
        async () => {
          const stream = makeStream();
          stream.createSegmentIndex();

          pendingSubscribes[0].resolve(BigInt(7));
          await shaka.test.Util.shortDelay();

          expect(unsubscribeSpy).not.toHaveBeenCalled();

          stream.closeSegmentIndex();
          expect(unsubscribeSpy).toHaveBeenCalledWith(BigInt(7));
        });

    it('fails when the publisher refuses the track', async () => {
      // Nothing else is coming for this stream. Waiting for its first
      // segment used to leave the load buffering forever.
      const stream = makeStream();
      const indexCreated = stream.createSegmentIndex();

      pendingSubscribes[0].reject(new Error(
          'subscribe cmsf/clear:video0 failed: code 16, reason ""'));

      await expectAsync(indexCreated).toBeRejectedWith(
          shaka.test.Util.jasmineError(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.MSF_SUBSCRIBE_FAILED,
              'video0',
              'subscribe cmsf/clear:video0 failed: code 16, reason ""')));
    });

    it('does not fail a track closed before it was refused', async () => {
      const onErrorSpy = jasmine.createSpy('onError');
      playerInterface.onError = shaka.test.Util.spyFunc(onErrorSpy);
      const stream = makeStream();
      const indexCreated = stream.createSegmentIndex();
      stream.closeSegmentIndex();

      pendingSubscribes[0].reject(new Error('refused'));
      await shaka.test.Util.shortDelay();

      expect(onErrorSpy).not.toHaveBeenCalled();
      let settled = false;
      const settle = () => {
        settled = true;
      };
      indexCreated.then(settle, settle);
      await shaka.test.Util.shortDelay();
      expect(settled).toBe(false);
    });

    it('reports a refused re-subscription to the player', async () => {
      // A re-subscription after a seek, or the fallback to the live edge when
      // the publisher refuses the seek, has nobody waiting on it, so the
      // player has to be told directly.
      const onErrorSpy = jasmine.createSpy('onError');
      playerInterface.onError = shaka.test.Util.spyFunc(onErrorSpy);
      const stream = makeStream();
      stream.createSegmentIndex();
      pendingSubscribes[0].resolve(BigInt(7));
      nextSegments = [fakeSegment()];
      objectCallbacks[0](fakeObject(0));
      await shaka.test.Util.shortDelay();

      /** @type {?} */
      const p = parser;
      p.resubscribe_(p.activeStreams_.get('/video0'), null);
      pendingSubscribes[1].reject(new Error('refused'));
      await shaka.test.Util.shortDelay();

      expect(onErrorSpy).toHaveBeenCalledWith(
          shaka.test.Util.jasmineError(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.MSF_SUBSCRIBE_FAILED,
              'video0',
              'refused')));
    });
  });

  describe('media timeline', () => {
    const PACKAGING = 'fake-timeline-test';

    /** @type {!Array<!shaka.extern.MsfSegment>} */
    let nextSegments;
    /**
     * @type {!Array<{
     *   trackName: string,
     *   startLocation: ?Object,
     *   callback: shaka.extern.MsfObjectCallback,
     * }>}
     */
    let subscribes;
    /** @type {!jasmine.Spy} */
    let unsubscribeSpy;
    /** @type {boolean} */
    let refuseAbsoluteStart;
    /** @type {?shaka.extern.MsfCodec} */
    let codec;
    /** @type {number} */
    let draftNumber;

    beforeEach(() => {
      nextSegments = [];
      subscribes = [];
      refuseAbsoluteStart = false;
      codec = null;
      draftNumber = 0;
      unsubscribeSpy = jasmine.createSpy('unsubscribeTrack')
          .and.returnValue(Promise.resolve());

      shaka.msf.PackagingRegistry.registerPackaging(PACKAGING, () => {
        return /** @type {!shaka.extern.MsfPackaging} */ (/** @type {?} */ ({
          describeTrack: () => ({
            basicInfo: /** @type {?} */ ({
              mimeType: 'video/mp4',
              codecs: 'avc1.4d401f',
            }),
            initSegmentReference: null,
          }),
          createSegmenter: () => ({push: () => nextSegments}),
        }));
      });
    });

    afterEach(() => {
      shaka.msf.PackagingRegistry.unregisterPackaging(PACKAGING);
    });

    /**
     * @suppress {visibility}
     */
    function givenAStartedParser() {
      parser.playerInterface_ = playerInterface;
      parser.presentationTimeline_ = new shaka.msf.MSFPresentationTimeline();
      parser.msfTransport_ = /** @type {!shaka.msf.MSFTransport} */ (
        /** @type {?} */ ({
          getCodec: () => codec,
          getDraftNumber: () => draftNumber,
          subscribeTrack: (namespace, trackName, callback, startLocation) => {
            subscribes.push({
              trackName,
              startLocation: startLocation || null,
              callback,
            });
            if (startLocation && refuseAbsoluteStart) {
              // What a publisher answers when the Group asked for is older
              // than anything it still holds.
              return Promise.reject(new Error('INVALID_RANGE'));
            }
            return Promise.resolve(BigInt(subscribes.length));
          },
          unsubscribeTrack: shaka.test.Util.spyFunc(unsubscribeSpy),
          release: () => {},
        }));
    }

    /**
     * @param {!Array<msfCatalog.Track>} tracks
     * @return {!Promise}
     * @suppress {visibility}
     */
    function processCatalog(tracks) {
      return parser.processCatalog_(/** @type {msfCatalog.Catalog} */ ({
        version: 1,
        tracks,
      }));
    }

    /**
     * @param {!Object=} extra
     * @return {msfCatalog.Track}
     */
    function videoTrack(extra) {
      return /** @type {msfCatalog.Track} */ (Object.assign({
        name: 'video0',
        packaging: PACKAGING,
        codec: 'avc3.4d401f',
        role: 'video',
        framerate: 25,
        width: 1280,
        height: 720,
        isLive: true,
      }, extra || {}));
    }

    /**
     * @return {msfCatalog.Track}
     */
    function timelineTrack() {
      return /** @type {msfCatalog.Track} */ ({
        name: 'history',
        packaging: 'mediatimeline',
        mimeType: 'application/json',
        depends: ['video0'],
      });
    }

    /**
     * @param {string} trackName
     * @return {?{startLocation: ?Object,
     *            callback: shaka.extern.MsfObjectCallback}}
     */
    function lastSubscribeTo(trackName) {
      const matching = subscribes.filter((s) => s.trackName == trackName);
      return matching.length ? matching[matching.length - 1] : null;
    }

    /**
     * @param {*} document
     * @param {number=} object
     * @param {?Uint8Array=} extensions
     * @return {!shaka.extern.MsfObject}
     */
    function timelineObject(document, object = 0, extensions = null) {
      const data = ArrayBuffer.isView(document) ?
          /** @type {!Uint8Array} */ (document) :
          shaka.util.BufferUtils.toUint8(
              shaka.util.StringUtils.toUTF8(JSON.stringify(document)));
      return /** @type {!shaka.extern.MsfObject} */ (/** @type {?} */ ({
        trackAlias: BigInt(1),
        location: {group: BigInt(0), object: BigInt(object), subgroup: null},
        data,
        extensions,
        payloadReadStartMs: 0,
        receiveTimestampMs: 1,
      }));
    }

    /**
     * @param {number} group
     * @return {!shaka.extern.MsfObject}
     */
    function mediaObject(group) {
      return /** @type {!shaka.extern.MsfObject} */ (/** @type {?} */ ({
        trackAlias: BigInt(2),
        location: {group: BigInt(group), object: BigInt(0), subgroup: null},
        data: new Uint8Array([0x01, 0x02]),
        payloadReadStartMs: 0,
        receiveTimestampMs: 10,
      }));
    }

    /**
     * @param {number} startTime
     * @return {!shaka.extern.MsfSegment}
     */
    function fakeSegment(startTime) {
      return {
        startTime,
        duration: 2,
        data: new Uint8Array([0x01]),
        timestampOffset: 0,
        discontinuitySequence: 0,
      };
    }

    /**
     * @return {!shaka.extern.Stream}
     * @suppress {visibility}
     */
    function videoStream() {
      expect(parser.videoStreams_.length).toBe(1);
      return parser.videoStreams_[0];
    }

    /**
     * @param {string} trackName
     * @return {shaka.msf.MediaTimeline}
     * @suppress {visibility}
     */
    function timelineOf(trackName) {
      return parser.mediaTimelines_.get(trackName) || null;
    }

    /**
     * @return {!shaka.media.PresentationTimeline}
     * @suppress {visibility}
     */
    function presentationTimeline() {
      const timeline = parser.presentationTimeline_;
      goog.asserts.assert(timeline, 'The parser should have a timeline!');
      return timeline;
    }

    /**
     * Plays out a stretch of the presentation: subscribes the stream and
     * feeds it one segment per group, so the index and the live edge are
     * where a player joined at the live edge would have them.
     *
     * @param {!shaka.extern.Stream} stream
     * @param {!Array<number>} startTimes
     */
    function deliverSegments(stream, startTimes) {
      const subscription = lastSubscribeTo('video0');
      expect(subscription).not.toBeNull();
      for (const startTime of startTimes) {
        nextSegments = [fakeSegment(startTime)];
        subscription.callback(mediaObject(startTime));
      }
      nextSegments = [];
    }

    it('feeds the tracks a timeline track declares it describes',
        async () => {
          givenAStartedParser();
          await processCatalog([videoTrack(), timelineTrack()]);

          const subscription = lastSubscribeTo('history');
          expect(subscription).not.toBeNull();
          subscription.callback(timelineObject([
            [0, [0, 0], 0],
            [2002, [1, 0], 0],
            [4004, [2, 0], 0],
          ]));

          const timeline = timelineOf('video0');
          expect(timeline).not.toBeNull();
          expect(timeline.getStartTime()).toBe(0);
          expect(timeline.locationForTime(3)).toEqual(
              {group: BigInt(1), object: BigInt(0), subgroup: null});
        });

    it('treats the first object of a group as the whole timeline',
        async () => {
          givenAStartedParser();
          await processCatalog([videoTrack(), timelineTrack()]);
          const subscription = lastSubscribeTo('history');

          subscription.callback(timelineObject(
              [[0, [0, 0], 0], [2002, [1, 0], 0]], /* object= */ 0));
          subscription.callback(timelineObject(
              [[4004, [2, 0], 0]], /* object= */ 1));

          let timeline = timelineOf('video0');
          expect(timeline.getStartTime()).toBe(0);
          expect(timeline.getEndTime()).toBe(4.004);

          // A new group: everything still accessible arrives again, and what
          // is missing from it has aged out.
          subscription.callback(timelineObject(
              [[2002, [1, 0], 0], [4004, [2, 0], 0]], /* object= */ 0));

          timeline = timelineOf('video0');
          expect(timeline.getStartTime()).toBe(2.002);
        });

    describe('compression', () => {
      beforeEach(() => {
        codec = new shaka.msf.draft18.Codec();
        draftNumber = 18;
      });

      filterDescribe('with GZIP', isDecompressionStreamSupported, () => {
        it('keeps the order of a compressed Object and the ones after it',
            async () => {
              // The complete timeline is compressed and the update after it
              // is not, so the update is ready first. Applied first, the
              // complete timeline would then replace it.
              givenAStartedParser();
              await processCatalog([videoTrack(), timelineTrack()]);
              const subscription = lastSubscribeTo('history');
              const addObject =
                  spyOn(timelineOf('video0'), 'addObject').and.callThrough();

              subscription.callback(timelineObject(
                  GZIPPED_TIMELINE, /* object= */ 0, compressionProperty(1)));
              subscription.callback(timelineObject(
                  [[4004, [2, 0], 0]], /* object= */ 1));
              await waitFor(() => addObject.calls.count() == 2);

              const timeline = timelineOf('video0');
              expect(timeline.getStartTime()).toBe(0);
              expect(timeline.getEndTime()).toBe(4.004);
            });
      });

      it('unsubscribes from a track compressed in a way it cannot undo',
          async () => {
            givenAStartedParser();
            await processCatalog([videoTrack(), timelineTrack()]);
            const subscription = lastSubscribeTo('history');

            subscription.callback(timelineObject(
                [[0, [0, 0], 0]], /* object= */ 0, compressionProperty(2)));

            expect(unsubscribeSpy).toHaveBeenCalled();
            expect(timelineOf('video0').getStartTime()).toBeNull();
          });

      it('leaves the deprecated drafts as they were', async () => {
        draftNumber = 16;
        givenAStartedParser();
        await processCatalog([videoTrack(), timelineTrack()]);
        const subscription = lastSubscribeTo('history');

        // Not read for MSF_COMPRESSION, so the unsupported value does not
        // stop an uncompressed document from being used.
        subscription.callback(timelineObject(
            [[0, [0, 0], 0], [2002, [1, 0], 0]], /* object= */ 0,
            compressionProperty(2)));

        expect(unsubscribeSpy).not.toHaveBeenCalled();
        expect(timelineOf('video0').getEndTime()).toBe(2.002);
      });
    });

    it('reads a template off the media track itself', async () => {
      givenAStartedParser();
      await processCatalog(
          [videoTrack({template: [0, 2002, [0, 0], [1, 0], 0, 0]})]);

      const timeline = timelineOf('video0');
      expect(timeline).not.toBeNull();
      expect(timeline.locationForTime(4.1)).toEqual(
          {group: BigInt(2), object: BigInt(0), subgroup: null});
    });

    it('does not let a timeline track decide the presentation is VOD',
        async () => {
          // A publisher is not required to mark a metadata track live, and
          // the track carries no media, so it has no business saying whether
          // new media is coming.
          givenAStartedParser();
          await processCatalog(
              [videoTrack(), Object.assign(timelineTrack(), {isLive: false})]);

          expect(presentationTimeline().isDynamic()).toBe(true);
        });

    it('ignores a timeline track that declares no dependencies',
        async () => {
          givenAStartedParser();
          const track = timelineTrack();
          delete track['depends'];
          await processCatalog([videoTrack(), track]);

          expect(lastSubscribeTo('history')).toBeNull();
          expect(timelineOf('video0')).toBeNull();
        });

    it('widens the seek range to what the timeline covers', async () => {
      givenAStartedParser();
      await processCatalog([videoTrack(), timelineTrack()]);

      const stream = videoStream();
      stream.createSegmentIndex();
      deliverSegments(stream, [100, 102]);

      // Without a timeline the window is the floor around the live edge.
      expect(presentationTimeline().getSegmentAvailabilityStart())
          .toBeGreaterThan(90);

      lastSubscribeTo('history').callback(timelineObject([
        [40000, [20, 0], 0],
        [100000, [50, 0], 0],
        [102000, [51, 0], 0],
      ]));

      expect(presentationTimeline().getSegmentAvailabilityStart()).toBe(40);
      expect(presentationTimeline().getSegmentAvailabilityEnd()).toBe(104);
    });

    describe('seeking', () => {
      /** @type {!shaka.test.FakeVideo} */
      let video;

      /**
       * @param {number} time
       */
      function seekTo(time) {
        video.currentTime = time;
        video.on['seeking']();
      }

      /**
       * @return {!Promise<!shaka.extern.Stream>}
       */
      async function givenALiveStreamWithTimeline() {
        givenAStartedParser();
        await processCatalog([videoTrack(), timelineTrack()]);

        const stream = videoStream();
        stream.createSegmentIndex();
        await shaka.test.Util.shortDelay();
        deliverSegments(stream, [100, 102]);

        lastSubscribeTo('history').callback(timelineObject([
          [40000, [20, 0], 0],
          [60000, [30, 0], 0],
          [100000, [50, 0], 0],
          [102000, [51, 0], 0],
        ]));

        video = new shaka.test.FakeVideo();
        parser.setMediaElement(
            /** @type {!HTMLMediaElement} */ (/** @type {?} */ (video)));
        return stream;
      }

      it('re-subscribes from the location the timeline gives', async () => {
        const stream = await givenALiveStreamWithTimeline();
        const before = subscribes.length;

        seekTo(61);
        await shaka.test.Util.shortDelay();

        expect(subscribes.length).toBe(before + 1);
        expect(lastSubscribeTo('video0').startLocation).toEqual(
            {group: BigInt(30), object: BigInt(0), subgroup: null});
        // The old subscription is withdrawn: it delivers from where the
        // player no longer is.
        expect(unsubscribeSpy).toHaveBeenCalled();
        // The index starts over from the seek point.
        expect(stream.segmentIndex.getNumReferences()).toBe(0);
      });

      it('leaves a seek inside the index alone', async () => {
        await givenALiveStreamWithTimeline();
        const before = subscribes.length;

        seekTo(101);
        await shaka.test.Util.shortDelay();

        expect(subscribes.length).toBe(before);
        expect(unsubscribeSpy).not.toHaveBeenCalled();
      });

      it('does not ask again for a location it is already waiting on',
          async () => {
            await givenALiveStreamWithTimeline();

            seekTo(61);
            await shaka.test.Util.shortDelay();
            const after = subscribes.length;

            // Same group, and nothing has arrived yet: asking again would
            // drop the Objects that are on their way.
            seekTo(62);
            await shaka.test.Util.shortDelay();

            expect(subscribes.length).toBe(after);
          });

      it('goes back to the live edge on a seek to live', async () => {
        const stream = await givenALiveStreamWithTimeline();

        seekTo(61);
        await shaka.test.Util.shortDelay();
        expect(lastSubscribeTo('video0').startLocation).not.toBeNull();

        seekTo(104);
        await shaka.test.Util.shortDelay();

        // No Location: the subscription follows the live edge again, which is
        // what it would take minutes of delivery to reach otherwise.
        expect(lastSubscribeTo('video0').startLocation).toBeNull();
        expect(stream.segmentIndex.getNumReferences()).toBe(0);
      });

      it('returns to the live edge when the publisher refuses the location',
          async () => {
            // A media timeline says what the publisher offered when it was
            // written. Asking anyway and playing from the live edge when the
            // answer is no beats waiting for content that is not coming.
            await givenALiveStreamWithTimeline();
            refuseAbsoluteStart = true;

            seekTo(61);
            await shaka.test.Util.shortDelay();

            expect(lastSubscribeTo('video0').startLocation).toBeNull();
          });

      it('drops objects still in flight from the old subscription',
          async () => {
            const stream = await givenALiveStreamWithTimeline();
            const oldSubscription = lastSubscribeTo('video0');

            seekTo(61);
            await shaka.test.Util.shortDelay();

            // The publisher has not stopped yet, and what it is still sending
            // is from where the player no longer is.
            nextSegments = [fakeSegment(104)];
            oldSubscription.callback(mediaObject(104));
            nextSegments = [];

            expect(stream.segmentIndex.getNumReferences()).toBe(0);
          });
    });
  });

  it('fails when WebTransport is not available', async () => {
    let originalWebTransport = null;
    try {
      originalWebTransport = window.WebTransport;
      if (originalWebTransport) {
        Object.defineProperty(window, 'WebTransport', {
          configurable: true,
          value: null,
        });
      }

      const expectedError = shaka.test.Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.WEBTRANSPORT_NOT_AVAILABLE));
      await expectAsync(parser.start('test:/msf', playerInterface))
          .toBeRejectedWith(expectedError);
    } finally {
      if (originalWebTransport) {
        Object.defineProperty(window, 'WebTransport', {
          configurable: true,
          value: originalWebTransport,
        });
      }
    }
  });

  describe('namespaceTuple', () => {
    const namespaceTuple = shaka.msf.MSFParser.namespaceTuple;

    it('splits a catalog namespace into its fields', () => {
      // moqlivemock announces ("mlm", "cmsf", "clear") and writes it in the
      // catalog as "mlm/cmsf/clear". Sent as one field it does not exist.
      expect(namespaceTuple('mlm/cmsf/clear', []))
          .toEqual(['mlm', 'cmsf', 'clear']);
      expect(namespaceTuple('mlm/cmsf/clear', ['other']))
          .toEqual(['mlm', 'cmsf', 'clear']);
    });

    it('drops empty fields', () => {
      expect(namespaceTuple('/cmsf//clear/', [])).toEqual(['cmsf', 'clear']);
    });

    it('keeps the session tuple when the catalog names it', () => {
      // A publisher that announces one field containing a slash writes the
      // same string in its catalog.
      expect(namespaceTuple('cmsf/clear', ['cmsf/clear']))
          .toEqual(['cmsf/clear']);
      expect(namespaceTuple('mlm/cmsf/clear', ['mlm', 'cmsf', 'clear']))
          .toEqual(['mlm', 'cmsf', 'clear']);
    });
  });
});
