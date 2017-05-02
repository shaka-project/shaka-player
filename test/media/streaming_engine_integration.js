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

describe('StreamingEngine', function() {
  var metadata;
  var generators;

  var eventManager;
  var video;
  var timeline;

  var playhead;
  var config;
  var onBuffering;

  var mediaSource;
  var mediaSourceEngine;

  var netEngine;

  var audioStream1;
  var videoStream1;
  var audioStream2;
  var videoStream2;

  var manifest;

  var onChooseStreams;
  var onCanSwitch;
  var onError;
  var onEvent;
  var onInitialStreamsSetup;
  var onStartupComplete;
  var streamingEngine;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  beforeAll(function() {
    video = /** @type {HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);

    metadata = shaka.test.TestScheme.DATA['sintel'];
    generators = {};
  });

  beforeEach(function(done) {
    // shakaExtern.StreamingConfiguration
    config = {
      rebufferingGoal: 2,
      bufferingGoal: 5,
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      bufferBehind: 15,
      ignoreTextStreamFailures: false,
      useRelativeCueTimestamps: false,
      startAtSegmentBoundary: false,
      smallGapLimit: 0.5,
      jumpLargeGaps: false
    };

    onChooseStreams = jasmine.createSpy('onChooseStreams');
    onCanSwitch = jasmine.createSpy('onCanSwitch');
    onInitialStreamsSetup = jasmine.createSpy('onInitialStreamsSetup');
    onStartupComplete = jasmine.createSpy('onStartupComplete');
    onError = jasmine.createSpy('onError');
    onError.and.callFake(fail);
    onEvent = jasmine.createSpy('onEvent');


    eventManager = new shaka.util.EventManager();
    setupMediaSource().catch(fail).then(done);
  });

  afterEach(function(done) {
    streamingEngine.destroy().then(function() {
      video.removeAttribute('src');
      video.load();
      return Promise.all([
        mediaSourceEngine.destroy(),
        playhead.destroy(),
        eventManager.destroy()
      ]);
    }).catch(fail).then(done);
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  // Setup MediaSource and MediaSourceEngine.
  function setupMediaSource() {
    mediaSource = new MediaSource();
    video.src = window.URL.createObjectURL(mediaSource);

    var p = new shaka.util.PublicPromise();
    var onMediaSourceOpen = function() {
      eventManager.unlisten(mediaSource, 'sourceopen');
      mediaSource.duration = 0;
      mediaSourceEngine = new shaka.media.MediaSourceEngine(
          video, mediaSource, null);
      p.resolve();
    };
    eventManager.listen(mediaSource, 'sourceopen', onMediaSourceOpen);

    return p;
  }

  function setupVod() {
    return Promise.all([
      createVodStreamGenerator(metadata.audio, ContentType.AUDIO),
      createVodStreamGenerator(metadata.video, ContentType.VIDEO)
    ]).then(function() {
      timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
          0 /* segmentAvailabilityStart */,
          60 /* segmentAvailabilityEnd */,
          60 /* presentationDuration */);

      setupNetworkingEngine(
          0 /* firstPeriodStartTime */,
          30 /* secondPeriodStartTime */,
          60 /* presentationDuration */,
          { audio: metadata.audio.segmentDuration,
            video: metadata.video.segmentDuration });

      setupManifest(
          0 /* firstPeriodStartTime */,
          30 /* secondPeriodStartTime */,
          60 /* presentationDuration */);
      setupPlayhead();

      createStreamingEngine();
    });
  }

  function setupLive() {
    return Promise.all([
      createLiveStreamGenerator(
          metadata.audio, ContentType.AUDIO,
          20 /* timeShiftBufferDepth */),
      createLiveStreamGenerator(
          metadata.video, ContentType.VIDEO,
          20 /* timeShiftBufferDepth */)
    ]).then(function() {
      // The generator's AST is set to 295 seconds in the past, so the live-edge
      // is at 295 - 10 seconds.
      // -10 to account for maxSegmentDuration.
      timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
          275 - 10 /* segmentAvailabilityStart */,
          295 - 10 /* segmentAvailabilityEnd */,
          Infinity /* presentationDuration */);

      setupNetworkingEngine(
          0 /* firstPeriodStartTime */,
          300 /* secondPeriodStartTime */,
          Infinity /* presentationDuration */,
          { audio: metadata.audio.segmentDuration,
            video: metadata.video.segmentDuration });

      setupManifest(
          0 /* firstPeriodStartTime */,
          300 /* secondPeriodStartTime */,
          Infinity /* presentationDuration */);
      setupPlayhead();

      createStreamingEngine();
    });
  }

  function createVodStreamGenerator(metadata, type) {
    var generator = new shaka.test.DashVodStreamGenerator(
        metadata.initSegmentUri,
        metadata.mvhdOffset,
        metadata.segmentUri,
        metadata.tfdtOffset,
        metadata.segmentDuration,
        metadata.presentationTimeOffset);
    generators[type] = generator;
    return generator.init();
  }

  function createLiveStreamGenerator(metadata, type, timeShiftBufferDepth) {
    // Set the generator's AST to 295 seconds in the past so the
    // StreamingEngine begins streaming close to the end of the first Period.
    var now = Date.now() / 1000;
    var generator = new shaka.test.DashLiveStreamGenerator(
        metadata.initSegmentUri,
        metadata.mvhdOffset,
        metadata.segmentUri,
        metadata.tfdtOffset,
        metadata.segmentDuration,
        metadata.presentationTimeOffset,
        now - 295 /* broadcastStartTime */,
        now - 295 /* availabilityStartTime */,
        timeShiftBufferDepth);
    generators[type] = generator;
    return generator.init();
  }

  function setupNetworkingEngine(firstPeriodStartTime, secondPeriodStartTime,
                                 presentationDuration, segmentDurations) {
    var periodStartTimes = [firstPeriodStartTime, secondPeriodStartTime];

    var boundsCheckPosition =
        shaka.test.StreamingEngineUtil.boundsCheckPosition.bind(
            null, periodStartTimes, presentationDuration, segmentDurations);

    var getNumSegments =
        shaka.test.StreamingEngineUtil.getNumSegments.bind(
            null, periodStartTimes, presentationDuration, segmentDurations);

    // Create the fake NetworkingEngine. Note: the StreamingEngine should never
    // request a segment that does not exist.
    netEngine = shaka.test.StreamingEngineUtil.createFakeNetworkingEngine(
        // Init segment generator:
        function(type, periodNumber) {
          expect(periodNumber).toBeLessThan(periodStartTimes.length + 1);
          var wallClockTime = Date.now() / 1000;
          var segment = generators[type].getInitSegment(wallClockTime);
          expect(segment).not.toBeNull();
          return segment;
        },
        // Media segment generator:
        function(type, periodNumber, position) {
          expect(boundsCheckPosition(type, periodNumber, position))
              .not.toBeNull();

          // Compute the total number of segments in all Periods before the
          // |periodNumber|'th one.
          var numPriorSegments = 0;
          for (var n = 1; n < periodNumber; ++n)
            numPriorSegments += getNumSegments(type, n);

          var wallClockTime = Date.now() / 1000;

          var segment = generators[type].getSegment(
              position, numPriorSegments, wallClockTime);
          expect(segment).not.toBeNull();
          return segment;
        });
  }

  function setupPlayhead() {
    onBuffering = jasmine.createSpy('onBuffering');
    var onSeek = function() { streamingEngine.seeked(); };
    playhead = new shaka.media.Playhead(
        /** @type {!HTMLVideoElement} */(video),
        /** @type {shakaExtern.Manifest} */ (manifest),
        config,
        null /* startTime */,
        onSeek,
        onEvent);
  }

  function setupManifest(
      firstPeriodStartTime, secondPeriodStartTime, presentationDuration) {
    manifest = shaka.test.StreamingEngineUtil.createManifest(
        [firstPeriodStartTime, secondPeriodStartTime], presentationDuration,
        { audio: metadata.audio.segmentDuration,
          video: metadata.video.segmentDuration });

    manifest.presentationTimeline = timeline;
    manifest.minBufferTime = 2;

    // Create InitSegmentReferences.
    function makeUris(uri) { return function() { return [uri]; }; }
    manifest.periods[0].variants[0].audio.initSegmentReference =
        new shaka.media.InitSegmentReference(makeUris('1_audio_init'), 0, null);
    manifest.periods[0].variants[0].video.initSegmentReference =
        new shaka.media.InitSegmentReference(makeUris('1_video_init'), 0, null);
    manifest.periods[1].variants[0].audio.initSegmentReference =
        new shaka.media.InitSegmentReference(makeUris('2_audio_init'), 0, null);
    manifest.periods[1].variants[0].video.initSegmentReference =
        new shaka.media.InitSegmentReference(makeUris('2_video_init'), 0, null);

    audioStream1 = manifest.periods[0].variants[0].audio;
    videoStream1 = manifest.periods[0].variants[0].video;
    audioStream2 = manifest.periods[1].variants[0].audio;
    videoStream2 = manifest.periods[1].variants[0].video;
  }

  function createStreamingEngine() {
    var playerInterface = {
      playhead: playhead,
      mediaSourceEngine: mediaSourceEngine,
      netEngine: /** @type {!shaka.net.NetworkingEngine} */(netEngine),
      onChooseStreams: onChooseStreams,
      onCanSwitch: onCanSwitch,
      onError: onError,
      onEvent: onEvent,
      onManifestUpdate: function() {},
      onSegmentAppended: playhead.onSegmentAppended.bind(playhead),
      onInitialStreamsSetup: onInitialStreamsSetup,
      onStartupComplete: onStartupComplete
    };
    streamingEngine = new shaka.media.StreamingEngine(
        /** @type {shakaExtern.Manifest} */(manifest), playerInterface);
    streamingEngine.configure(config);
  }

  describe('VOD', function() {
    beforeEach(function(done) {
      setupVod().catch(fail).then(done);
    });

    it('plays', function(done) {
      onStartupComplete.and.callFake(function() {
        video.play();
      });

      var onEnded = function() {
        // Some browsers may not end at exactly 60 seconds.
        expect(Math.round(video.currentTime)).toBe(60);
        done();
      };
      eventManager.listen(video, 'ended', onEnded);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });

    it('plays at high playback rates', function(done) {
      var startupComplete = false;

      onStartupComplete.and.callFake(function() {
        startupComplete = true;
        video.play();
      });

      onBuffering.and.callFake(function(buffering) {
        if (!buffering) {
          expect(startupComplete).toBeTruthy();
          video.playbackRate = 10;
        }
      });

      var onEnded = function() {
        // Some browsers may not end at exactly 60 seconds.
        expect(Math.round(video.currentTime)).toBe(60);
        done();
      };
      eventManager.listen(video, 'ended', onEnded);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });

    it('can handle buffered seeks', function(done) {
      onStartupComplete.and.callFake(function() {
        video.play();
      });

      // After 35 seconds seek back 10 seconds into the first Period.
      var onTimeUpdate = function() {
        if (video.currentTime >= 35) {
          eventManager.unlisten(video, 'timeupdate');
          video.currentTime = 25;
        }
      };
      eventManager.listen(video, 'timeupdate', onTimeUpdate);

      var onEnded = function() {
        // Some browsers may not end at exactly 60 seconds.
        expect(Math.round(video.currentTime)).toBe(60);
        done();
      };
      eventManager.listen(video, 'ended', onEnded);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });

    it('can handle unbuffered seeks', function(done) {
      onStartupComplete.and.callFake(function() {
        video.play();
      });

      // After 20 seconds seek 10 seconds into the second Period.
      var onTimeUpdate = function() {
        if (video.currentTime >= 20) {
          eventManager.unlisten(video, 'timeupdate');
          video.currentTime = 40;
        }
      };
      eventManager.listen(video, 'timeupdate', onTimeUpdate);

      var onEnded = function() {
        // Some browsers may not end at exactly 60 seconds.
        expect(Math.round(video.currentTime)).toBe(60);
        done();
      };
      eventManager.listen(video, 'ended', onEnded);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });
  });

  describe('Live', function() {
    var slideSegmentAvailabilityWindow;

    beforeEach(function(done) {
      setupLive().then(function() {
        slideSegmentAvailabilityWindow = window.setInterval(function() {
          timeline.segmentAvailabilityStart++;
          timeline.segmentAvailabilityEnd++;
        }, 1000);
      }).catch(fail).then(done);
    });

    afterEach(function() {
      window.clearInterval(slideSegmentAvailabilityWindow);
    });

    it('plays through Period transition', function(done) {
      onStartupComplete.and.callFake(function() {
        // firstSegmentNumber =
        //   [(segmentAvailabilityEnd - rebufferingGoal) / segmentDuration] + 1
        // Then -1 to account for drift safe buffering.
        var segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
        netEngine.expectRequest('1_video_28', segmentType);
        netEngine.expectRequest('1_audio_28', segmentType);
        video.play();
      });

      var onTimeUpdate = function() {
        if (video.currentTime >= 305) {
          // We've played through the Period transition!
          eventManager.unlisten(video, 'timeupdate');
          done();
        }
      };
      eventManager.listen(video, 'timeupdate', onTimeUpdate);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });

    it('can handle seeks ahead of availability window',
        function(done) {
          onStartupComplete.and.callFake(function() {
            video.play();

            // Use setTimeout to ensure the playhead has performed it's initial
            // seeking.
            setTimeout(function() {
              // Seek outside the availability window right away. The playhead
              // should adjust the video's current time.
              video.currentTime = timeline.segmentAvailabilityEnd + 120;

              // Wait until the repositioning is complete so we don't
              // immediately hit this case.
              setTimeout(function() {
                var onTimeUpdate = function() {
                  if (video.currentTime >= 305) {
                    // We've played through the Period transition!
                    eventManager.unlisten(video, 'timeupdate');
                    done();
                  }
                };
                eventManager.listen(video, 'timeupdate', onTimeUpdate);
              }, 1000);
            }, 50);
          });

          // Let's go!
          onChooseStreams.and.callFake(defaultOnChooseStreams);
          streamingEngine.init();
        });

    it('can handle seeks behind availability window', function(done) {
      onStartupComplete.and.callFake(function() {
        video.play();

        // Use setTimeout to ensure the playhead has performed it's initial
        // seeking.
        setTimeout(function() {
          // Seek outside the availability window right away. The playhead
          // should adjust the video's current time.
          video.currentTime = timeline.segmentAvailabilityStart - 120;
          expect(video.currentTime).toBeGreaterThan(0);
        }, 50);
      });

      var seekCount = 0;
      eventManager.listen(video, 'seeking', function() {
        seekCount++;
      });

      var onTimeUpdate = function() {
        if (video.currentTime >= 305) {
          // We've played through the Period transition!
          eventManager.unlisten(video, 'timeupdate');

          // We are playing close to the beginning of the availability window.
          // We should be playing smoothly and not seeking repeatedly as we fall
          // outside the window.
          //
          // We seek once above, then Playhead seeks once to adjust, plus a
          // couple extra.
          expect(seekCount).toBeLessThan(6);

          done();
        }
      };
      eventManager.listen(video, 'timeupdate', onTimeUpdate);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });
  });

  // This tests gaps created by missing segments.
  // TODO: Consider also adding tests for missing frames.
  describe('gap jumping', function() {
    it('jumps small gaps at the beginning', function(done) {
      config.smallGapLimit = 5;
      setupGappyContent(/* gapAtStart */ 1, /* dropSegment */ false)
          .then(function() {
            onStartupComplete.and.callFake(function() {
              expect(video.buffered.length).toBeGreaterThan(0);
              expect(video.buffered.start(0)).toBeCloseTo(1);

              video.play();
            });

            // Let's go!
            onChooseStreams.and.callFake(defaultOnChooseStreams);
            streamingEngine.init();

            return waitForTime(5);
          })
          .catch(fail)
          .then(done);
    });

    it('jumps large gaps at the beginning', function(done) {
      config.smallGapLimit = 1;
      config.jumpLargeGaps = true;
      setupGappyContent(/* gapAtStart */ 5, /* dropSegment */ false)
          .then(function() {
            onStartupComplete.and.callFake(function() {
              expect(video.buffered.length).toBeGreaterThan(0);
              expect(video.buffered.start(0)).toBeCloseTo(5);

              video.play();
            });

            // Let's go!
            onChooseStreams.and.callFake(defaultOnChooseStreams);
            streamingEngine.init();

            return waitForTime(8);
          })
          .catch(fail)
          .then(done);
    });

    it('jumps small gaps in the middle', function(done) {
      config.smallGapLimit = 20;
      setupGappyContent(/* gapAtStart */ 0, /* dropSegment */ true)
          .then(function() {
            onStartupComplete.and.callFake(function() {
              video.currentTime = 8;
              video.play();
            });

            // Let's go!
            onChooseStreams.and.callFake(defaultOnChooseStreams);
            streamingEngine.init();

            return waitForTime(23);
          })
          .then(function() {
            // Should be close enough to still have the gap buffered.
            expect(video.buffered.length).toBe(2);
            expect(onEvent).not.toHaveBeenCalled();
          })
          .catch(fail)
          .then(done);
    });

    it('jumps large gaps in the middle', function(done) {
      config.jumpLargeGaps = true;
      setupGappyContent(/* gapAtStart */ 0, /* dropSegment */ true)
          .then(function() {
            onStartupComplete.and.callFake(function() {
              video.currentTime = 8;
              video.play();
            });

            // Let's go!
            onChooseStreams.and.callFake(defaultOnChooseStreams);
            streamingEngine.init();

            return waitForTime(23);
          })
          .then(function() {
            // Should be close enough to still have the gap buffered.
            expect(video.buffered.length).toBe(2);
            expect(onEvent).toHaveBeenCalled();
          })
          .catch(fail)
          .then(done);
    });

    it('won\'t jump large gaps with preventDefault()', function(done) {
      config.jumpLargeGaps = true;
      setupGappyContent(/* gapAtStart */ 0, /* dropSegment */ true)
          .then(function() {
            onStartupComplete.and.callFake(function() {
              video.currentTime = 8;
              video.play();
            });

            onEvent.and.callFake(function(event) {
              event.preventDefault();
              shaka.test.Util.delay(5).then(function() {
                // IE/Edge somehow plays inside the gap.  Just make sure we
                // don't jump the gap.
                expect(video.currentTime).toBeLessThan(20);
                done();
              })
              .catch(done.fail);
            });

            // Let's go!
            onChooseStreams.and.callFake(defaultOnChooseStreams);
            streamingEngine.init();
          })
          .catch(done.fail);
    });


    /**
     * @param {number} gapAtStart The gap to introduce before start, in seconds.
     * @param {boolean} dropSegment Whether to drop a segment in the middle.
     * @return {!Promise}
     */
    function setupGappyContent(gapAtStart, dropSegment) {
      // This uses "normal" stream generators and networking engine.  The only
      // difference is the segments are removed from the manifest.  The segments
      // should not be downloaded.
      return Promise.all([
        createVodStreamGenerator(metadata.audio, ContentType.AUDIO),
        createVodStreamGenerator(metadata.video, ContentType.VIDEO)
      ]).then(function() {
        timeline =
            shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
                0 /* segmentAvailabilityStart */,
                30 /* segmentAvailabilityEnd */,
                30 /* presentationDuration */);

        setupNetworkingEngine(
            0 /* firstPeriodStartTime */,
            30 /* secondPeriodStartTime */,
            30 /* presentationDuration */,
            { audio: metadata.audio.segmentDuration,
              video: metadata.video.segmentDuration });

        manifest = setupGappyManifest(gapAtStart, dropSegment);
        audioStream1 = manifest.periods[0].variants[0].audio;
        videoStream1 = manifest.periods[0].variants[0].video;

        setupPlayhead();
        createStreamingEngine();
      });
    }

    /**
     * TODO: Consolidate with StreamingEngineUtils.createManifest?
     * @param {number} gapAtStart
     * @param {boolean} dropSegment
     * @return {shakaExtern.Manifest}
     */
    function setupGappyManifest(gapAtStart, dropSegment) {
      /**
       * @param {string} type
       * @return {!shaka.media.SegmentIndex}
       */
      function createIndex(type) {
        var d = metadata[type].segmentDuration;
        var refs = [];
        var i = 1;
        var time = gapAtStart;
        while (time < 30) {
          var end = time + d;
          // Make segment 1 longer to make the manifest continuous, despite the
          // dropped segment.
          if (i == 1 && dropSegment)
            end += d;

          var getUris = (function(i) {
            // The times in the media are based on the URL; so to drop a
            // segment, we change the URL.
            if (i >= 2 && dropSegment) i++;
            return ['1_' + type + '_' + i];
          }.bind(null, i));
          refs.push(
              new shaka.media.SegmentReference(i, time, end, getUris, 0, null));

          i++;
          time = end;
        }
        return new shaka.media.SegmentIndex(refs);
      }

      function createInit(type) {
        var getUris = function() {
          return ['1_' + type + '_init'];
        };
        return new shaka.media.InitSegmentReference(getUris, 0, null);
      }

      var videoIndex = createIndex('video');
      var audioIndex = createIndex('audio');
      return {
        presentationTimeline: timeline,
        offlineSessionIds: [],
        minBufferTime: 2,
        periods: [{
          startTime: 0,
          textStreams: [],
          variants: [{
            id: 1,
            video: {
              id: 2,
              createSegmentIndex: Promise.resolve.bind(Promise),
              findSegmentPosition: videoIndex.find.bind(videoIndex),
              getSegmentReference: videoIndex.get.bind(videoIndex),
              initSegmentReference: createInit('video'),
              // Normally PTO adjusts the segment time backwards; so to make the
              // segment appear in the future, use a negative.
              presentationTimeOffset: -gapAtStart,
              mimeType: 'video/mp4',
              codecs: 'avc1.42c01e',
              bandwidth: 5000000,
              width: 600,
              height: 400,
              type: shaka.util.ManifestParserUtils.ContentType.VIDEO
            },
            audio: {
              id: 3,
              createSegmentIndex: Promise.resolve.bind(Promise),
              findSegmentPosition: audioIndex.find.bind(audioIndex),
              getSegmentReference: audioIndex.get.bind(audioIndex),
              initSegmentReference: createInit('audio'),
              presentationTimeOffset: -gapAtStart,
              mimeType: 'audio/mp4',
              codecs: 'mp4a.40.2',
              bandwidth: 192000,
              type: shaka.util.ManifestParserUtils.ContentType.AUDIO
            }
          }]
        }]
      };
    }

    /**
     * @param {number} time
     * @return {!Promise}
     */
    function waitForTime(time) {
      var p = new shaka.util.PublicPromise();
      var onTimeUpdate = function() {
        if (video.currentTime >= time) {
          p.resolve();
        }
      };
      eventManager.listen(video, 'timeupdate', onTimeUpdate);
      var timeout = shaka.test.Util.delay(30).then(function() {
        throw 'Timeout waiting for time';
      });
      return Promise.race([p, timeout]);
    }
  });

  /**
   * Choose streams for the given period.
   *
   * @param {shakaExtern.Period} period
   * @return {!Object.<string, !shakaExtern.Stream>}
   */
  function defaultOnChooseStreams(period) {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    var ret = {};
    if (period == manifest.periods[0]) {
      ret[ContentType.AUDIO] = audioStream1;
      ret[ContentType.VIDEO] = videoStream1;
      return ret;
    } else if (period == manifest.periods[1]) {
      ret[ContentType.AUDIO] = audioStream2;
      ret[ContentType.VIDEO] = videoStream2;
      return ret;
    } else {
      throw new Error();
    }
  }
});
