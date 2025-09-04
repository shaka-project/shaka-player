# Configuration

The goal of this tutorial is to introduce Shaka's configuration system and the
concepts on which it is built.  More detail can be found in the API docs.

Shaka's `Player` object has a hierarchical configuration.  The overall player
config contains sub-configs for various parts of the system, such as manifests,
streaming, and DRM.

To see the current config, you can use `player.getConfiguration()`.  If you run
this without setting anything first, you get the default configuration.

`Player` also has a `configure()` method that takes it's argument(s) in one of two
forms:

1. A plain, anonymous object.  Any fields you leave out of the config object
will retain their existing values, and any fields you explicitly set as
`undefined` will be reverted to their default value.  For example:

```js
player.configure({
  streaming: {
    bufferingGoal: 120
  }
});
```

2. For setting a single field, a name (full path) of the field can be provided
as the first argument (a string) and value of the field as the second. For
example:

```js
player.configure('streaming.bufferingGoal', 120);
```

You can use the code from {@tutorial basic-usage} and try these examples in
the JS console:

```js
player.getConfiguration();

=> Object
     abr: Object
       bandwidthDowngradeTarget: 0.95
       bandwidthUpgradeTarget: 0.85
       defaultBandwidthEstimate: 500000
       enabled: true
       restrictions: Object
       switchInterval: 8
     abrFactory: Function
     drm: Object
       advanced: Object
       clearKeys: Object
       retryParameters: Object
         backoffFactor: 2
         baseDelay: 1000
         fuzzFactor: 0.5
         maxAttempts: 2
         timeout: 0
       servers: Object
     manifest: Object
       dash: Object
       retryParameters: Object
     playRangeEnd: Infinity
     playRangeStart: 0
     preferredAudioLanguage: ""
     preferredAudioLabel: ""
     preferredVideoLabel: ""
     preferredTextLanguage: ""
     restrictions: Object
     streaming: Object
       bufferBehind: 30
       bufferingGoal: 10
       durationBackoff: 1
       failureCallback: Function
       ignoreTextStreamFailures: false
       rebufferingGoal: 0
       retryParameters: Object
       startAtSegmentBoundary: false
       safeSeekOffset: 5
       segmentPrefetchLimit: 0
     textDisplayFactory: Function


// Example configurations, all of which are arbitrary:

// set audio language preference to Canadian French:
player.configure('preferredAudioLanguage', 'fr-CA');
// NOTE: language preferences affect the next call to load()

// set text language preference to Greek and buffering goal to 2 minutes:
player.configure({
  preferredTextLanguage: 'el',
  streaming: {
    bufferingGoal: 120
  }
});

// check audio language preference, which is still Canadian French:
player.getConfiguration().preferredAudioLanguage

// check buffering goal, which is 2 minutes:
player.getConfiguration().streaming.bufferingGoal

// check rebuffering goal, which is still the default of 0 seconds:
player.getConfiguration().streaming.rebufferingGoal

// set the rebuffering goal to 15 seconds and revert buffering goal to default:
player.configure({
  streaming: {
    bufferingGoal: undefined,
    rebufferingGoal: 15
  }
});
```

Some of these fields have immediate effects (such as networking settings and
buffering settings) while some will not have any effect until the next call to
`load()` (such as DRM settings, manifest settings, and language settings).


#### Low latency streaming

With `.streaming.lowLatencyMode` set to true and the manifest is Low Latency,
Shaka uses a Low Latency config:
`.streaming.inaccurateManifestTolerance` is set to 0 by default,
`.streaming.segmentPrefetchLimit` is set to 2 by default,
`.streaming.updateIntervalSeconds` is set to 0.1 by default,
`.streaming.maxDisabledTime` is set to 1 by default,
`.streaming.retryParameters.baseDelay` is set to 100 by default,
`.manifest.dash.autoCorrectDrift` is set to false by default,
`.manifest.retryParameters.baseDelay` is set to 100 by default, and
`.drm.retryParameters.baseDelay` is set to 100 by default.

To customize the values of inaccurateManifestTolerance, rebufferingGoal,
segmentPrefetchLimit, updateIntervalSeconds and baseDelay with low latency
mode, you can set the fields in the call to configurationForLowLatency().
```js
player.configurationForLowLatency({
  streaming: {
    inaccurateManifestTolerance: 0,
    segmentPrefetchLimit: 2,
    updateIntervalSeconds: 0.1,
    maxDisabledTime: 1,
    retryParameters: {
      baseDelay: 100,
    },
  },
  manifest: {
    dash: {
      autoCorrectDrift: true,
    },
    retryParameters: {
      baseDelay: 100,
    },
  },
  drm: {
    retryParameters: {
      baseDelay: 100,
    },
  },
});

```


#### Detailed API Docs

For more detail on individual configuration options, please see the API docs for
{@link shaka.extern.PlayerConfiguration} and {@link shaka.Player#configure}.
