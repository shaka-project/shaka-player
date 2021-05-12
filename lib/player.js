/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.Player');

goog.require('goog.asserts');
goog.require('shaka.Deprecate');
goog.require('shaka.log');
goog.require('shaka.media.AdaptationSetCriteria');
goog.require('shaka.media.BufferingObserver');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.ExampleBasedCriteria');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.media.MediaSourcePlayhead');
goog.require('shaka.media.MetaSegmentIndex');
goog.require('shaka.media.ClosedCaptionParser');
goog.require('shaka.media.PlayRateController');
goog.require('shaka.media.Playhead');
goog.require('shaka.media.PlayheadObserverManager');
goog.require('shaka.media.PreferenceBasedCriteria');
goog.require('shaka.media.RegionObserver');
goog.require('shaka.media.RegionTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SrcEqualsPlayhead');
goog.require('shaka.media.StreamingEngine');
goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.routing.Walker');
goog.require('shaka.text.SimpleTextDisplayer');
goog.require('shaka.text.TextEngine');
goog.require('shaka.text.UITextDisplayer');
goog.require('shaka.text.WebVttGenerator');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MediaReadyState');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.ObjectUtils');
goog.require('shaka.util.Platform');
goog.require('shaka.util.PlayerConfiguration');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Stats');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.Timer');
goog.requireType('shaka.media.IClosedCaptionParser');
goog.requireType('shaka.media.PresentationTimeline');
goog.requireType('shaka.routing.Node');
goog.requireType('shaka.routing.Payload');


/**
 * @event shaka.Player.ErrorEvent
 * @description Fired when a playback error occurs.
 * @property {string} type
 *   'error'
 * @property {!shaka.util.Error} detail
 *   An object which contains details on the error.  The error's
 *   <code>category</code> and <code>code</code> properties will identify the
 *   specific error that occurred.  In an uncompiled build, you can also use the
 *   <code>message</code> and <code>stack</code> properties to debug.
 * @exportDoc
 */

/**
 * @event shaka.Player.StateChangeEvent
 * @description Fired when the player changes load states.
 * @property {string} type
 *    'onstatechange'
 * @property {string} state
 *    The name of the state that the player just entered.
 * @exportDoc
 */

/**
 * @event shaka.Player.StateIdleEvent
 * @description Fired when the player has stopped changing states and will
 *    remain idle until a new state change request (e.g. <code>load</code>,
 *    <code>attach</code>, etc.) is made.
 * @property {string} type
 *    'onstateidle'
 * @property {string} state
 *    The name of the state that the player stopped in.
 * @exportDoc
 */

/**
 * @event shaka.Player.EmsgEvent
 * @description Fired when a non-typical emsg is found in a segment.
 * @property {string} type
 *   'emsg'
 * @property {shaka.extern.EmsgInfo} detail
 *   An object which contains the content of the emsg box.
 * @exportDoc
 */


/**
 * @event shaka.Player.DrmSessionUpdateEvent
 * @description Fired when the CDM has accepted the license response.
 * @property {string} type
 *   'drmsessionupdate'
 * @exportDoc
 */


/**
 * @event shaka.Player.TimelineRegionAddedEvent
 * @description Fired when a media timeline region is added.
 * @property {string} type
 *   'timelineregionadded'
 * @property {shaka.extern.TimelineRegionInfo} detail
 *   An object which contains a description of the region.
 * @exportDoc
 */


/**
 * @event shaka.Player.TimelineRegionEnterEvent
 * @description Fired when the playhead enters a timeline region.
 * @property {string} type
 *   'timelineregionenter'
 * @property {shaka.extern.TimelineRegionInfo} detail
 *   An object which contains a description of the region.
 * @exportDoc
 */


/**
 * @event shaka.Player.TimelineRegionExitEvent
 * @description Fired when the playhead exits a timeline region.
 * @property {string} type
 *   'timelineregionexit'
 * @property {shaka.extern.TimelineRegionInfo} detail
 *   An object which contains a description of the region.
 * @exportDoc
 */


/**
 * @event shaka.Player.BufferingEvent
 * @description Fired when the player's buffering state changes.
 * @property {string} type
 *   'buffering'
 * @property {boolean} buffering
 *   True when the Player enters the buffering state.
 *   False when the Player leaves the buffering state.
 * @exportDoc
 */


/**
 * @event shaka.Player.LoadingEvent
 * @description Fired when the player begins loading. The start of loading is
 *   defined as when the user has communicated intent to load content (i.e.
 *   <code>Player.load</code> has been called).
 * @property {string} type
 *   'loading'
 * @exportDoc
 */


/**
 * @event shaka.Player.LoadedEvent
 * @description Fired when the player ends the load.
 * @property {string} type
 *   'loaded'
 * @exportDoc
 */


/**
 * @event shaka.Player.UnloadingEvent
 * @description Fired when the player unloads or fails to load.
 *   Used by the Cast receiver to determine idle state.
 * @property {string} type
 *   'unloading'
 * @exportDoc
 */


/**
 * @event shaka.Player.TextTrackVisibilityEvent
 * @description Fired when text track visibility changes.
 * @property {string} type
 *   'texttrackvisibility'
 * @exportDoc
 */


/**
 * @event shaka.Player.TracksChangedEvent
 * @description Fired when the list of tracks changes.  For example, this will
 *   happen when new tracks are added/removed or when track restrictions change.
 * @property {string} type
 *   'trackschanged'
 * @exportDoc
 */


/**
 * @event shaka.Player.AdaptationEvent
 * @description Fired when an automatic adaptation causes the active tracks
 *   to change.  Does not fire when the application calls
 *   <code>selectVariantTrack()</code>, <code>selectTextTrack()</code>,
 *   <code>selectAudioLanguage()</code>, or <code>selectTextLanguage()</code>.
 * @property {string} type
 *   'adaptation'
 * @exportDoc
 */


/**
 * @event shaka.Player.VariantChangedEvent
 * @description Fired when a call from the application caused a variant change.
 *  Can be triggered by calls to <code>selectVariantTrack()</code> or
 *  <code>selectAudioLanguage()</code>. Does not fire when an automatic
 *  adaptation causes a variant change.
 * @property {string} type
 *   'variantchanged'
 * @property {shaka.extern.Track} oldTrack
 * @property {shaka.extern.Track} newTrack
 * @exportDoc
 */


/**
 * @event shaka.Player.TextChangedEvent
 * @description Fired when a call from the application caused a text stream
 *  change. Can be triggered by calls to <code>selectTextTrack()</code> or
 *  <code>selectTextLanguage()</code>.
 * @property {string} type
 *   'textchanged'
 * @exportDoc
 */


/**
 * @event shaka.Player.ExpirationUpdatedEvent
 * @description Fired when there is a change in the expiration times of an
 *   EME session.
 * @property {string} type
 *   'expirationupdated'
 * @exportDoc
 */


/**
 * @event shaka.Player.LargeGapEvent
 * @description Fired when the playhead enters a large gap.  If the
 *   <code>streaming.jumpLargeGaps</code> configuration is set, the default
 *   action of this event is to jump the gap; this can be prevented by calling
 *   <code>preventDefault()</code> on the event object.
 * @property {string} type
 *   'largegap'
 * @property {number} currentTime
 *   The current time of the playhead.
 * @property {number} gapSize
 *   The size of the gap, in seconds.
 * @exportDoc
 */


/**
 * @event shaka.Player.ManifestParsedEvent
 * @description Fired after the manifest has been parsed, but before anything
 *   else happens. The manifest may contain streams that will be filtered out,
 *   at this stage of the loading process.
 * @property {string} type
 *   'manifestparsed'
 * @exportDoc
 */


/**
 * @event shaka.Player.MetadataEvent
 * @description Triggers after metadata associated with the stream is found.
 *   Usually they are metadata of type ID3.
 * @property {string} type
 *   'metadata'
 * @property {number} startTime
 *   The time that describes the beginning of the range of the metadata to
 *   which the cue applies.
 * @property {?number} endTime
 *   The time that describes the end of the range of the metadata to which
 *   the cue applies.
 * @property {string} metadataType
 *   Type of metadata. Eg: org.id3 or org.mp4ra
 * @property {shaka.extern.ID3Metadata} payload
 *   The metadata itself
 * @exportDoc
 */


/**
 * @event shaka.Player.StreamingEvent
 * @description Fired after the manifest has been parsed and track information
 *   is available, but before streams have been chosen and before any segments
 *   have been fetched.  You may use this event to configure the player based on
 *   information found in the manifest.
 * @property {string} type
 *   'streaming'
 * @exportDoc
 */


/**
 * @event shaka.Player.AbrStatusChangedEvent
 * @description Fired when the state of abr has been changed.
 *    (Enabled or disabled).
 * @property {string} type
 *   'abrstatuschanged'
 * @property {boolean} newStatus
 *  The new status of the application. True for 'is enabled' and
 *  false otherwise.
 * @exportDoc
 */


/**
 * @event shaka.Player.RateChangeEvent
 * @description Fired when the video's playback rate changes.
 *    This allows the PlayRateController to update it's internal rate field,
 *    before the UI updates playback button with the newest playback rate.
 * @property {string} type
 *    'ratechange'
 * @exportDoc
 */


/**
 * @event shaka.Player.SessionDataEvent
 * @description Fired when the manifest parser find info about session data.
 *    Specification: https://tools.ietf.org/html/rfc8216#section-4.3.4.4
 * @property {string} type
 *   'sessiondata'
 * @property {string} id
 *   The id of the session data.
 * @property {string} uri
 *   The uri with the session data info.
 * @property {string} language
 *   The language of the session data.
 * @property {string} value
 *   The value of the session data.
 * @exportDoc
 */


/**
 * @summary The main player object for Shaka Player.
 *
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.Player = class extends shaka.util.FakeEventTarget {
  /**
   * @param {HTMLMediaElement=} mediaElement
   *    When provided, the player will attach to <code>mediaElement</code>,
   *    similar to calling <code>attach</code>. When not provided, the player
   *    will remain detached.
   * @param {function(shaka.Player)=} dependencyInjector Optional callback
   *   which is called to inject mocks into the Player.  Used for testing.
   */
  constructor(mediaElement, dependencyInjector) {
    super();

    /** @private {shaka.Player.LoadMode} */
    this.loadMode_ = shaka.Player.LoadMode.NOT_LOADED;

    /** @private {HTMLMediaElement} */
    this.video_ = null;

    /** @private {HTMLElement} */
    this.videoContainer_ = null;

    /**
     * Since we may not always have a text displayer created (e.g. before |load|
     * is called), we need to track what text visibility SHOULD be so that we
     * can ensure that when we create the text displayer. When we create our
     * text displayer, we will use this to show (or not show) text as per the
     * user's requests.
     *
     * @private {boolean}
     */
    this.isTextVisible_ = false;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {shaka.net.NetworkingEngine} */
    this.networkingEngine_ = null;

    /** @private {shaka.media.DrmEngine} */
    this.drmEngine_ = null;

    /** @private {shaka.media.MediaSourceEngine} */
    this.mediaSourceEngine_ = null;

    /** @private {shaka.media.Playhead} */
    this.playhead_ = null;

    /**
     * The playhead observers are used to monitor the position of the playhead
     * and some other source of data (e.g. buffered content), and raise events.
     *
     * @private {shaka.media.PlayheadObserverManager}
     */
    this.playheadObservers_ = null;

    /**
     * This is our control over the playback rate of the media element. This
     * provides the missing functionality that we need to provide trick play,
     * for example a negative playback rate.
     *
     * @private {shaka.media.PlayRateController}
     */
    this.playRateController_ = null;

    // We use the buffering observer and timer to track when we move from having
    // enough buffered content to not enough. They only exist when content has
    // been loaded and are not re-used between loads.
    /** @private {shaka.util.Timer} */
    this.bufferPoller_ = null;

    /** @private {shaka.media.BufferingObserver} */
    this.bufferObserver_ = null;

    /** @private {shaka.media.RegionTimeline} */
    this.regionTimeline_ = null;

    /** @private {shaka.media.StreamingEngine} */
    this.streamingEngine_ = null;

    /** @private {shaka.extern.ManifestParser} */
    this.parser_ = null;

    /** @private {?shaka.extern.ManifestParser.Factory} */
    this.parserFactory_ = null;

    /** @private {?shaka.extern.Manifest} */
    this.manifest_ = null;

    /** @private {?string} */
    this.assetUri_ = null;

    /** @private {shaka.extern.AbrManager} */
    this.abrManager_ = null;

    /**
     * The factory that was used to create the abrManager_ instance.
     * @private {?shaka.extern.AbrManager.Factory}
     */
    this.abrManagerFactory_ = null;

    /**
     * Contains an ID for use with creating streams.  The manifest parser should
     * start with small IDs, so this starts with a large one.
     * @private {number}
     */
    this.nextExternalStreamId_ = 1e9;

    /** @private {?shaka.extern.PlayerConfiguration} */
    this.config_ = this.defaultConfig_();

    /**
     * The TextDisplayerFactory that was last used to make a text displayer.
     * Stored so that we can tell if a new type of text displayer is desired.
     * @private {?shaka.extern.TextDisplayer.Factory}
     */
    this.lastTextFactory_;

    /** @private {{width: number, height: number}} */
    this.maxHwRes_ = {width: Infinity, height: Infinity};

    /** @private {shaka.util.Stats} */
    this.stats_ = null;

    /** @private {!shaka.media.AdaptationSetCriteria} */
    this.currentAdaptationSetCriteria_ =
        new shaka.media.PreferenceBasedCriteria(
            this.config_.preferredAudioLanguage,
            this.config_.preferredVariantRole,
            this.config_.preferredAudioChannelCount);

    /** @private {string} */
    this.currentTextLanguage_ = this.config_.preferredTextLanguage;

    /** @private {string} */
    this.currentTextRole_ = this.config_.preferredTextRole;

    /** @private {boolean} */
    this.currentTextForced_ = this.config_.preferForcedSubs;

    /** @private {!Array.<function():(!Promise|undefined)>} */
    this.cleanupOnUnload_ = [];

    if (dependencyInjector) {
      dependencyInjector(this);
    }

    this.networkingEngine_ = this.createNetworkingEngine();
    this.networkingEngine_.setForceHTTPS(this.config_.streaming.forceHTTPS);

    /** @private {shaka.extern.IAdManager} */
    this.adManager_ = null;

    if (shaka.Player.adManagerFactory_) {
      this.adManager_ =
          shaka.util.Functional.callFactory(shaka.Player.adManagerFactory_);
    }

    // If the browser comes back online after being offline, then try to play
    // again.
    this.eventManager_.listen(window, 'online', () => {
      this.retryStreaming();
    });

    /** @private {shaka.routing.Node} */
    this.detachNode_ = {name: 'detach'};
    /** @private {shaka.routing.Node} */
    this.attachNode_ = {name: 'attach'};
    /** @private {shaka.routing.Node} */
    this.unloadNode_ = {name: 'unload'};
    /** @private {shaka.routing.Node} */
    this.parserNode_ = {name: 'manifest-parser'};
    /** @private {shaka.routing.Node} */
    this.manifestNode_ = {name: 'manifest'};
    /** @private {shaka.routing.Node} */
    this.mediaSourceNode_ = {name: 'media-source'};
    /** @private {shaka.routing.Node} */
    this.drmNode_ = {name: 'drm-engine'};
    /** @private {shaka.routing.Node} */
    this.loadNode_ = {name: 'load'};
    /** @private {shaka.routing.Node} */
    this.srcEqualsDrmNode_ = {name: 'src-equals-drm-engine'};
    /** @private {shaka.routing.Node} */
    this.srcEqualsNode_ = {name: 'src-equals'};

    const AbortableOperation = shaka.util.AbortableOperation;

    const actions = new Map();
    actions.set(this.attachNode_, (has, wants) => {
      return AbortableOperation.notAbortable(this.onAttach_(has, wants));
    });
    actions.set(this.detachNode_, (has, wants) => {
      return AbortableOperation.notAbortable(this.onDetach_(has, wants));
    });
    actions.set(this.unloadNode_, (has, wants) => {
      return AbortableOperation.notAbortable(this.onUnload_(has, wants));
    });
    actions.set(this.mediaSourceNode_, (has, wants) => {
      const p = this.onInitializeMediaSourceEngine_(has, wants);
      return AbortableOperation.notAbortable(p);
    });
    actions.set(this.parserNode_, (has, wants) => {
      const p = this.onInitializeParser_(has, wants);
      return AbortableOperation.notAbortable(p);
    });
    actions.set(this.manifestNode_, (has, wants) => {
      // This action is actually abortable, so unlike the other callbacks, this
      // one will return an abortable operation.
      return this.onParseManifest_(has, wants);
    });
    actions.set(this.drmNode_, (has, wants) => {
      const p = this.onInitializeDrm_(has, wants);
      return AbortableOperation.notAbortable(p);
    });
    actions.set(this.loadNode_, (has, wants) => {
      return AbortableOperation.notAbortable(this.onLoad_(has, wants));
    });

    actions.set(this.srcEqualsDrmNode_, (has, wants) => {
      const p = this.onInitializeSrcEqualsDrm_(has, wants);
      return AbortableOperation.notAbortable(p);
    });
    actions.set(this.srcEqualsNode_, (has, wants) => {
      return this.onSrcEquals_(has, wants);
    });

    /** @private {shaka.routing.Walker.Implementation} */
    const walkerImplementation = {
      getNext: (at, has, goingTo, wants) => {
        return this.getNextStep_(at, has, goingTo, wants);
      },
      enterNode: (node, has, wants) => {
        this.dispatchEvent(this.makeEvent_(
            /* name= */ shaka.Player.EventName.OnStateChange,
            /* data= */ {'state': node.name}));

        const action = actions.get(node);
        return action(has, wants);
      },
      handleError: async (has, error) => {
        shaka.log.warning('The walker saw an error:');
        if (error instanceof shaka.util.Error) {
          shaka.log.warning('Error Code:', error.code);
        } else {
          shaka.log.warning('Error Message:', error.message);
          shaka.log.warning('Error Stack:', error.stack);
        }

        // Regardless of what state we were in, if there is an error, we unload.
        // This ensures that any initialized system will be torn-down and we
        // will go back to a safe foundation. We assume that the media element
        // is always safe to use after an error.
        await this.onUnload_(has, shaka.Player.createEmptyPayload_());

        // There are only two nodes that come before we start loading content,
        // attach and detach. If we have a media element, it means we were
        // attached to the element, and we can safely return to the attach state
        // (we assume that the video element is always re-usable). We favor
        // returning to the attach node since it means that the app won't need
        // to re-attach if it saw an error.
        return has.mediaElement ? this.attachNode_ : this.detachNode_;
      },
      onIdle: (node) => {
        this.dispatchEvent(this.makeEvent_(
            /* name= */ shaka.Player.EventName.OnStateIdle,
            /* data= */ {'state': node.name}));
      },
    };

    /** @private {shaka.routing.Walker} */
    this.walker_ = new shaka.routing.Walker(
        this.detachNode_,
        shaka.Player.createEmptyPayload_(),
        walkerImplementation);

    // Even though |attach| will start in later interpreter cycles, it should be
    // the LAST thing we do in the constructor because conceptually it relies on
    // player having been initialized.
    if (mediaElement) {
      this.attach(mediaElement, /* initializeMediaSource= */ true);
    }
  }

  /**
   * @param {!shaka.Player.EventName} name
   * @param {Object=} data
   * @return {!shaka.util.FakeEvent}
   * @private
   */
  makeEvent_(name, data) {
    return new shaka.util.FakeEvent(name, data);
  }

  /**
   * After destruction, a Player object cannot be used again.
   *
   * @override
   * @export
   */
  async destroy() {
    // Make sure we only execute the destroy logic once.
    if (this.loadMode_ == shaka.Player.LoadMode.DESTROYED) {
      return;
    }

    // Mark as "dead". This should stop external-facing calls from changing our
    // internal state any more. This will stop calls to |attach|, |detach|, etc.
    // from interrupting our final move to the detached state.
    this.loadMode_ = shaka.Player.LoadMode.DESTROYED;

    // Because we have set |loadMode_| to |DESTROYED| we can't call |detach|. We
    // must talk to |this.walker_| directly.
    const events = this.walker_.startNewRoute((currentPayload) => {
      return {
        node: this.detachNode_,
        payload: shaka.Player.createEmptyPayload_(),
        interruptible: false,
      };
    });

    // Wait until the detach has finished so that we don't interrupt it by
    // calling |destroy| on |this.walker_|. To avoid failing here, we always
    // resolve the promise.
    await new Promise((resolve) => {
      events.onStart = () => {
        shaka.log.info('Preparing to destroy walker...');
      };
      events.onEnd = () => {
        resolve();
      };
      events.onCancel = () => {
        goog.asserts.assert(false,
            'Our final detach call should never be cancelled.');
        resolve();
      };
      events.onError = () => {
        goog.asserts.assert(false,
            'Our final detach call should never see an error');
        resolve();
      };
      events.onSkip = () => {
        goog.asserts.assert(false,
            'Our final detach call should never be skipped');
        resolve();
      };
    });
    await this.walker_.destroy();

    // Tear-down the event manager to ensure messages stop moving around.
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }

    this.abrManagerFactory_ = null;
    this.abrManager_ = null;
    this.config_ = null;
    this.stats_ = null;
    this.videoContainer_ = null;

    if (this.networkingEngine_) {
      await this.networkingEngine_.destroy();
      this.networkingEngine_ = null;
    }
  }

  /**
   * Registers a plugin callback that will be called with
   * <code>support()</code>.  The callback will return the value that will be
   * stored in the return value from <code>support()</code>.
   *
   * @param {string} name
   * @param {function():*} callback
   * @export
   */
  static registerSupportPlugin(name, callback) {
    shaka.Player.supportPlugins_[name] = callback;
  }

  /**
   * Set a factory to create an ad manager during player construction time.
   * This method needs to be called bafore instantiating the Player class.
   *
   * @param {!shaka.extern.IAdManager.Factory} factory
   * @export
   */
  static setAdManagerFactory(factory) {
    shaka.Player.adManagerFactory_ = factory;
  }

  /**
   * Return whether the browser provides basic support.  If this returns false,
   * Shaka Player cannot be used at all.  In this case, do not construct a
   * Player instance and do not use the library.
   *
   * @return {boolean}
   * @export
   */
  static isBrowserSupported() {
    if (!window.Promise) {
      shaka.log.alwaysWarn('A Promise implementation or polyfill is required');
    }
    if (!window.TextDecoder || !window.TextEncoder) {
      shaka.log.alwaysWarn(
          'A TextDecoder/TextEncoder implementation or polyfill is required');
    }

    // Basic features needed for the library to be usable.
    const basicSupport = !!window.Promise && !!window.Uint8Array &&
                         !!window.TextDecoder && !!window.TextEncoder &&
                         // eslint-disable-next-line no-restricted-syntax
                         !!Array.prototype.forEach;
    if (!basicSupport) {
      return false;
    }

    // We do not support IE
    if (shaka.util.Platform.isIE()) {
      return false;
    }

    // We do not support iOS 9, 10, or 11, nor those same versions of desktop
    // Safari.
    const safariVersion = shaka.util.Platform.safariVersion();
    if (safariVersion && safariVersion < 12) {
      return false;
    }

    // DRM support is not strictly necessary, but the APIs at least need to be
    // there.  Our no-op DRM polyfill should handle that.
    // TODO(#1017): Consider making even DrmEngine optional.
    const drmSupport = shaka.media.DrmEngine.isBrowserSupported();
    if (!drmSupport) {
      return false;
    }

    // If we have MediaSource (MSE) support, we should be able to use Shaka.
    if (shaka.util.Platform.supportsMediaSource()) {
      return true;
    }

    // If we don't have MSE, we _may_ be able to use Shaka.  Look for native HLS
    // support, and call this platform usable if we have it.
    return shaka.util.Platform.supportsMediaType('application/x-mpegurl');
  }

  /**
   * Probes the browser to determine what features are supported.  This makes a
   * number of requests to EME/MSE/etc which may result in user prompts.  This
   * should only be used for diagnostics.
   *
   * <p>
   * NOTE: This may show a request to the user for permission.
   *
   * @see https://bit.ly/2ywccmH
   * @param {boolean=} promptsOkay
   * @return {!Promise.<shaka.extern.SupportType>}
   * @export
   */
  static async probeSupport(promptsOkay=true) {
    goog.asserts.assert(shaka.Player.isBrowserSupported(),
        'Must have basic support');
    let drm = {};
    if (promptsOkay) {
      drm = await shaka.media.DrmEngine.probeSupport();
    }
    const manifest = shaka.media.ManifestParser.probeSupport();
    const media = shaka.media.MediaSourceEngine.probeSupport();
    const ret = {
      manifest: manifest,
      media: media,
      drm: drm,
    };

    const plugins = shaka.Player.supportPlugins_;
    for (const name in plugins) {
      ret[name] = plugins[name]();
    }

    return ret;
  }

  /**
   * Tell the player to use <code>mediaElement</code> for all <code>load</code>
   * requests until <code>detach</code> or <code>destroy</code> are called.
   *
   * <p>
   * Calling <code>attach</code> with <code>initializedMediaSource=true</code>
   * will tell the player to take the initial load step and initialize media
   * source.
   *
   * <p>
   * Calls to <code>attach</code> will interrupt any in-progress calls to
   * <code>load</code> but cannot interrupt calls to <code>attach</code>,
   * <code>detach</code>, or <code>unload</code>.
   *
   * @param {!HTMLMediaElement} mediaElement
   * @param {boolean=} initializeMediaSource
   * @return {!Promise}
   * @export
   */
  attach(mediaElement, initializeMediaSource = true) {
    // Do not allow the player to be used after |destroy| is called.
    if (this.loadMode_ == shaka.Player.LoadMode.DESTROYED) {
      return Promise.reject(this.createAbortLoadError_());
    }

    const payload = shaka.Player.createEmptyPayload_();
    payload.mediaElement = mediaElement;

    // If the platform does not support media source, we will never want to
    // initialize media source.
    if (!shaka.util.Platform.supportsMediaSource()) {
      initializeMediaSource = false;
    }

    const destination = initializeMediaSource ?
                        this.mediaSourceNode_ :
                        this.attachNode_;

    // Do not allow this route to be interrupted because calls after this attach
    // call will depend on the media element being attached.
    const events = this.walker_.startNewRoute((currentPayload) => {
      return {
        node: destination,
        payload: payload,
        interruptible: false,
      };
    });

    // List to the events that can occur with our request.
    events.onStart = () => shaka.log.info('Starting attach...');
    return this.wrapWalkerListenersWithPromise_(events);
  }

  /**
   * Tell the player to stop using its current media element. If the player is:
   * <ul>
   *  <li>detached, this will do nothing,
   *  <li>attached, this will release the media element,
   *  <li>loading, this will abort loading, unload, and release the media
   *      element,
   *  <li>playing content, this will stop playback, unload, and release the
   *      media element.
   * </ul>
   *
   * <p>
   * Calls to <code>detach</code> will interrupt any in-progress calls to
   * <code>load</code> but cannot interrupt calls to <code>attach</code>,
   * <code>detach</code>, or <code>unload</code>.
   *
   * @return {!Promise}
   * @export
   */
  detach() {
    // Do not allow the player to be used after |destroy| is called.
    if (this.loadMode_ == shaka.Player.LoadMode.DESTROYED) {
      return Promise.reject(this.createAbortLoadError_());
    }

    // Tell the walker to go "detached", but do not allow it to be interrupted.
    // If it could be interrupted it means that our media element could fall out
    // of sync.
    const events = this.walker_.startNewRoute((currentPayload) => {
      return {
        node: this.detachNode_,
        payload: shaka.Player.createEmptyPayload_(),
        interruptible: false,
      };
    });

    events.onStart = () => shaka.log.info('Starting detach...');
    return this.wrapWalkerListenersWithPromise_(events);
  }

  /**
   * Tell the player to either return to:
   * <ul>
   *   <li>detached (when it does not have a media element),
   *   <li>attached (when it has a media element and
   *     <code>initializedMediaSource=false</code>)
   *   <li>media source initialized (when it has a media element and
   *     <code>initializedMediaSource=true</code>)
   * </ul>
   *
   * <p>
   * Calls to <code>unload</code> will interrupt any in-progress calls to
   * <code>load</code> but cannot interrupt calls to <code>attach</code>,
   * <code>detach</code>, or <code>unload</code>.
   *
   * @param {boolean=} initializeMediaSource
   * @return {!Promise}
   * @export
   */
  unload(initializeMediaSource = true) {
    // Do not allow the player to be used after |destroy| is called.
    if (this.loadMode_ == shaka.Player.LoadMode.DESTROYED) {
      return Promise.reject(this.createAbortLoadError_());
    }

    // If the platform does not support media source, we will never want to
    // initialize media source.
    if (!shaka.util.Platform.supportsMediaSource()) {
      initializeMediaSource = false;
    }

    // Since we are going either to attached or detached (through unloaded), we
    // can't allow it to be interrupted or else we could lose track of what
    // media element we are suppose to use.
    //
    // Using the current payload, we can determine which node we want to go to.
    // If we have a media element, we want to go back to attached. If we have no
    // media element, we want to go back to detached.
    const payload = shaka.Player.createEmptyPayload_();

    const events = this.walker_.startNewRoute((currentPayload) => {
      // When someone calls |unload| we can either be before attached or
      // detached (there is nothing stopping someone from calling |detach| when
      // we are already detached).
      //
      // If we are attached to the correct element, we can tear down the
      // previous playback components and go to the attached media source node
      // depending on whether or not the caller wants to pre-init media source.
      //
      // If we don't have a media element, we assume that we are already at the
      // detached node - but only the walker knows that. To ensure we are
      // actually there, we tell the walker to go to detach. While this is
      // technically unnecessary, it ensures that we are in the state we want
      // to be in and ready for the next request.
      let destination = null;

      if (currentPayload.mediaElement && initializeMediaSource) {
        destination = this.mediaSourceNode_;
      } else if (currentPayload.mediaElement) {
        destination = this.attachNode_;
      } else {
        destination = this.detachNode_;
      }

      goog.asserts.assert(destination, 'We should have picked a destination.');

      // Copy over the media element because we want to keep using the same
      // element - the other values don't matter.
      payload.mediaElement = currentPayload.mediaElement;

      return {
        node: destination,
        payload: payload,
        interruptible: false,
      };
    });

    events.onStart = () => shaka.log.info('Starting unload...');
    return this.wrapWalkerListenersWithPromise_(events);
  }

  /**
   * Tell the player to load the content at <code>assetUri</code> and start
   * playback at <code>startTime</code>. Before calling <code>load</code>,
   * a call to <code>attach</code> must have succeeded.
   *
   * <p>
   * Calls to <code>load</code> will interrupt any in-progress calls to
   * <code>load</code> but cannot interrupt calls to <code>attach</code>,
   * <code>detach</code>, or <code>unload</code>.
   *
   * @param {string} assetUri
   * @param {?number=} startTime
   *    When <code>startTime</code> is <code>null</code> or
   *    <code>undefined</code>, playback will start at the default start time (0
   *    for VOD and liveEdge for LIVE).
   * @param {string=} mimeType
   * @return {!Promise}
   * @export
   */
  load(assetUri, startTime, mimeType) {
    // Do not allow the player to be used after |destroy| is called.
    if (this.loadMode_ == shaka.Player.LoadMode.DESTROYED) {
      return Promise.reject(this.createAbortLoadError_());
    }

    // We dispatch the loading event when someone calls |load| because we want
    // to surface the user intent.
    this.dispatchEvent(this.makeEvent_(shaka.Player.EventName.Loading));

    // Right away we know what the asset uri and start-of-load time are. We will
    // fill-in the rest of the information later.
    const payload = shaka.Player.createEmptyPayload_();
    payload.uri = assetUri;
    payload.startTimeOfLoad = Date.now() / 1000;
    if (mimeType) {
      payload.mimeType = mimeType;
    }

    // Because we allow |startTime| to be optional, it means that it will be
    // |undefined| when not provided. This means that we need to re-map
    // |undefined| to |null| while preserving |0| as a meaningful value.
    if (startTime !== undefined) {
      payload.startTime = startTime;
    }

    // TODO: Refactor to determine whether it's a manifest or not, and whether
    // or not we can play it.  Then we could return a better error than
    // UNABLE_TO_GUESS_MANIFEST_TYPE for WebM in Safari.
    const useSrcEquals = this.shouldUseSrcEquals_(payload);
    const destination = useSrcEquals ? this.srcEqualsNode_ : this.loadNode_;

    // Allow this request to be interrupted, this will allow other requests to
    // cancel a load and quickly start a new load.
    const events = this.walker_.startNewRoute((currentPayload) => {
      if (currentPayload.mediaElement == null) {
        // Because we return null, this "new route" will not be used.
        return null;
      }

      // Keep using whatever media element we have right now.
      payload.mediaElement = currentPayload.mediaElement;

      return {
        node: destination,
        payload: payload,
        interruptible: true,
      };
    });

    // Stats are for a single playback/load session. Stats must be initialized
    // before we allow calls to |updateStateHistory|.
    this.stats_ = new shaka.util.Stats();

    // Load's request is a little different, so we can't use our normal
    // listeners-to-promise method. It is the only request where we may skip the
    // request, so we need to set the on skip callback to reject with a specific
    // error.
    events.onStart =
        () => shaka.log.info('Starting load of ' + assetUri + '...');
    return new Promise((resolve, reject) => {
      events.onSkip = () => reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.NO_VIDEO_ELEMENT));

      events.onEnd = () => {
        resolve();
        // We dispatch the loaded event when the load promise is resolved
        this.dispatchEvent(this.makeEvent_(shaka.Player.EventName.Loaded));
      };
      events.onCancel = () => reject(this.createAbortLoadError_());
      events.onError = (e) => reject(e);
    });
  }

  /**
   * Check if src= should be used to load the asset at |uri|. Assume that media
   * source is the default option, and that src= is for special cases.
   *
   * @param {shaka.routing.Payload} payload
   * @return {boolean}
   *    |true| if the content should be loaded with src=, |false| if the content
   *    should be loaded with MediaSource.
   * @private
   */
  shouldUseSrcEquals_(payload) {
    const Platform = shaka.util.Platform;

    // If we are using a platform that does not support media source, we will
    // fall back to src= to handle all playback.
    if (!Platform.supportsMediaSource()) {
      return true;
    }

    // The most accurate way to tell the player how to load the content is via
    // MIME type.  We can fall back to features of the URI if needed.
    let mimeType = payload.mimeType;
    const uri = payload.uri || '';

    // If we don't have a MIME type, try to guess based on the file extension.
    // TODO: Too generic to belong to ManifestParser now.  Refactor.
    if (!mimeType) {
      // Try using the uri extension.
      const extension = shaka.media.ManifestParser.getExtension(uri);
      mimeType = shaka.Player.SRC_EQUAL_EXTENSIONS_TO_MIME_TYPES_[extension];
    }

    // TODO: The load graph system has a design limitation that requires routing
    // destination to be chosen synchronously.  This means we can only make the
    // right choice about src= consistently if we have a well-known file
    // extension or API-provided MIME type.  Detection of MIME type from a HEAD
    // request (as is done for manifest types) can't be done yet.

    if (mimeType) {
      // If we have a MIME type, check if the browser can play it natively.
      // This will cover both single files and native HLS.
      const mediaElement = payload.mediaElement || Platform.anyMediaElement();
      const canPlayNatively = mediaElement.canPlayType(mimeType) != '';

      // If we can't play natively, then src= isn't an option.
      if (!canPlayNatively) {
        return false;
      }

      const canPlayMediaSource =
          shaka.media.ManifestParser.isSupported(uri, mimeType);

      // If MediaSource isn't an option, the native option is our only chance.
      if (!canPlayMediaSource) {
        return true;
      }

      // If we land here, both are feasible.
      goog.asserts.assert(canPlayNatively && canPlayMediaSource,
          'Both native and MSE playback should be possible!');

      // We would prefer MediaSource in some cases, and src= in others.  For
      // example, Android has native HLS, but we'd prefer our own MediaSource
      // version there.

      // Native HLS can be preferred on any platform via this flag:
      if (this.config_.streaming.preferNativeHls) {
        return true;
      }

      // For Safari, we have an older flag which only applies to this one
      // browser:
      if (Platform.isApple()) {
        return this.config_.streaming.useNativeHlsOnSafari;
      }

      // In all other cases, we prefer MediaSource.
      return false;
    }

    // Unless there are good reasons to use src= (single-file playback or native
    // HLS), we prefer MediaSource.  So the final return value for choosing src=
    // is false.
    return false;
  }

  /**
   * This should only be called by the load graph when it is time to attach to
   * a media element. The only times this may be called are when we are being
   * asked to re-attach to the current media element, or attach to a new media
   * element while not attached to a media element.
   *
   * This method assumes that it is safe for it to execute, the load-graph is
   * responsible for ensuring all assumptions are true.
   *
   * Attaching to a media element is defined as:
   *  - Registering error listeners to the media element.
   *  - Caching the video element for use outside of the load graph.
   *
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @return {!Promise}
   * @private
   */
  onAttach_(has, wants) {
    // If we don't have a media element yet, it means we are entering
    // "attach" from another node.
    //
    // If we have a media element, it should match |wants.mediaElement|
    // because it means we are going from "attach" to "attach".
    //
    // These constraints should be maintained and guaranteed by the routing
    // logic in |getNextStep_|.
    goog.asserts.assert(
        has.mediaElement == null || has.mediaElement == wants.mediaElement,
        'The routing logic failed. MediaElement requirement failed.');

    if (has.mediaElement == null) {
      has.mediaElement = wants.mediaElement;

      const onError = (error) => this.onVideoError_(error);
      this.eventManager_.listen(has.mediaElement, 'error', onError);
    }

    this.video_ = has.mediaElement;

    return Promise.resolve();
  }

  /**
   * This should only be called by the load graph when it is time to detach from
   * a media element. The only times this may be called are when we are being
   * asked to detach from the current media element, or detach when we are
   * already detached.
   *
   * This method assumes that it is safe for it to execute, the load-graph is
   * responsible for ensuring all assumptions are true.
   *
   * Detaching from a media element is defined as:
   *  - Removing error listeners from the media element.
   *  - Dropping the cached reference to the video element.
   *
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @return {!Promise}
   * @private
   */
  onDetach_(has, wants) {
    // If we are going from "detached" to "detached" we wouldn't have
    // a media element to detach from.
    if (has.mediaElement) {
      this.eventManager_.unlisten(has.mediaElement, 'error');
      has.mediaElement = null;
    }

    // Clear our cached copy of the media element.
    this.video_ = null;

    return Promise.resolve();
  }

  /**
   * This should only be called by the load graph when it is time to unload all
   * currently initialized playback components. Unlike the other load actions,
   * this action is built to be more general. We need to do this because we
   * don't know what state the player will be in before unloading (including
   * after an error occurred in the middle of a transition).
   *
   * This method assumes that any component could be |null| and should be safe
   * to call from any point in the load graph.
   *
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @return {!Promise}
   * @private
   */
  async onUnload_(has, wants) {
    // Set the load mode to unload right away so that all the public methods
    // will stop using the internal components. We need to make sure that we
    // are not overriding the destroyed state because we will unload when we are
    // destroying the player.
    if (this.loadMode_ != shaka.Player.LoadMode.DESTROYED) {
      this.loadMode_ = shaka.Player.LoadMode.NOT_LOADED;
    }

    // Run any general cleanup tasks now.  This should be here at the top, right
    // after setting loadMode_, so that internal components still exist as they
    // did when the cleanup tasks were registered in the array.
    const cleanupTasks = this.cleanupOnUnload_.map((cb) => cb());
    this.cleanupOnUnload_ = [];
    await Promise.all(cleanupTasks);

    // Dispatch the unloading event.
    this.dispatchEvent(this.makeEvent_(shaka.Player.EventName.Unloading));

    // Remove everything that has to do with loading content from our payload
    // since we are releasing everything that depended on it.
    has.mimeType = null;
    has.startTime = null;
    has.uri = null;

    // In most cases we should have a media element. The one exception would
    // be if there was an error and we, by chance, did not have a media element.
    if (has.mediaElement) {
      this.eventManager_.unlisten(has.mediaElement, 'loadedmetadata');
      this.eventManager_.unlisten(has.mediaElement, 'playing');
      this.eventManager_.unlisten(has.mediaElement, 'pause');
      this.eventManager_.unlisten(has.mediaElement, 'ended');
      this.eventManager_.unlisten(has.mediaElement, 'ratechange');
    }

    // Some observers use some playback components, shutting down the observers
    // first ensures that they don't try to use the playback components
    // mid-destroy.
    if (this.playheadObservers_) {
      this.playheadObservers_.release();
      this.playheadObservers_ = null;
    }

    if (this.bufferPoller_) {
      this.bufferPoller_.stop();
      this.bufferPoller_ = null;
    }

    // Stop the parser early. Since it is at the start of the pipeline, it
    // should be start early to avoid is pushing new data downstream.
    if (this.parser_) {
      await this.parser_.stop();
      this.parser_ = null;
      this.parserFactory_ = null;
    }

    // Abr Manager will tell streaming engine what to do, so we need to stop
    // it before we destroy streaming engine. Unlike with the other components,
    // we do not release the instance, we will reuse it in later loads.
    if (this.abrManager_) {
      await this.abrManager_.stop();
    }

    // Streaming engine will push new data to media source engine, so we need
    // to shut it down before destroy media source engine.
    if (this.streamingEngine_) {
      await this.streamingEngine_.destroy();
      this.streamingEngine_ = null;
    }

    if (this.playRateController_) {
      this.playRateController_.release();
      this.playRateController_ = null;
    }

    // Playhead is used by StreamingEngine, so we can't destroy this until after
    // StreamingEngine has stopped.
    if (this.playhead_) {
      this.playhead_.release();
      this.playhead_ = null;
    }

    // Media source engine holds onto the media element, and in order to detach
    // the media keys (with drm engine), we need to break the connection between
    // media source engine and the media element.
    if (this.mediaSourceEngine_) {
      await this.mediaSourceEngine_.destroy();
      this.mediaSourceEngine_ = null;
    }

    if (this.adManager_) {
      this.adManager_.onAssetUnload();
    }

    // In order to unload a media element, we need to remove the src attribute
    // and then load again. When we destroy media source engine, this will be
    // done for us, but for src=, we need to do it here.
    //
    // DrmEngine requires this to be done before we destroy DrmEngine itself.
    if (has.mediaElement && has.mediaElement.src) {
      // TODO: Investigate this more.  Only reproduces on Firefox 69.
      // Introduce a delay before detaching the video source.  We are seeing
      // spurious Promise rejections involving an AbortError in our tests
      // otherwise.
      await new Promise(
          (resolve) => new shaka.util.Timer(resolve).tickAfter(0.1));

      has.mediaElement.removeAttribute('src');
      has.mediaElement.load();
      // Remove all track nodes
      while (has.mediaElement.lastChild) {
        has.mediaElement.removeChild(has.mediaElement.firstChild);
      }
    }

    if (this.drmEngine_) {
      await this.drmEngine_.destroy();
      this.drmEngine_ = null;
    }

    this.assetUri_ = null;
    this.bufferObserver_ = null;

    if (this.manifest_) {
      for (const variant of this.manifest_.variants) {
        for (const stream of [variant.audio, variant.video]) {
          if (stream && stream.segmentIndex) {
            stream.segmentIndex.release();
          }
        }
      }
      for (const stream of this.manifest_.textStreams) {
        if (stream.segmentIndex) {
          stream.segmentIndex.release();
        }
      }
    }

    this.manifest_ = null;
    this.stats_ = new shaka.util.Stats(); // Replace with a clean stats object.
    this.lastTextFactory_ = null;

    // Make sure that the app knows of the new buffering state.
    this.updateBufferState_();
  }

  /**
   * This should only be called by the load graph when it is time to initialize
   * media source engine. The only time this may be called is when we are
   * attached to the same media element as in the request.
   *
   * This method assumes that it is safe for it to execute. The load-graph is
   * responsible for ensuring all assumptions are true.
   *
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   *
   * @return {!Promise}
   * @private
   */
  async onInitializeMediaSourceEngine_(has, wants) {
    goog.asserts.assert(
        shaka.util.Platform.supportsMediaSource(),
        'We should not be initializing media source on a platform that does ' +
            'not support media source.');
    goog.asserts.assert(
        has.mediaElement,
        'We should have a media element when initializing media source.');
    goog.asserts.assert(
        has.mediaElement == wants.mediaElement,
        '|has| and |wants| should have the same media element when ' +
            'initializing media source.');

    goog.asserts.assert(
        this.mediaSourceEngine_ == null,
        'We should not have a media source engine yet.');

    const closedCaptionsParser = new shaka.media.ClosedCaptionParser();

    // When changing text visibility we need to update both the text displayer
    // and streaming engine because we don't always stream text. To ensure that
    // text displayer and streaming engine are always in sync, wait until they
    // are both initialized before setting the initial value.
    const textDisplayerFactory = this.config_.textDisplayFactory;
    const textDisplayer =
        shaka.util.Functional.callFactory(textDisplayerFactory);
    this.lastTextFactory_ = textDisplayerFactory;

    const mediaSourceEngine = this.createMediaSourceEngine(
        has.mediaElement,
        closedCaptionsParser,
        textDisplayer,
        (metadata, offset, endTime) => {
          this.processTimedMetadataMediaSrc_(metadata, offset, endTime);
        });

    // Wait for media source engine to finish opening. This promise should
    // NEVER be rejected as per the media source engine implementation.
    await mediaSourceEngine.open();

    // Wait until it is ready to actually store the reference.
    this.mediaSourceEngine_ = mediaSourceEngine;
  }

  /**
   * Create the parser for the asset located at |wants.uri|. This should only be
   * called as part of the load graph.
   *
   * This method assumes that it is safe for it to execute, the load-graph is
   * responsible for ensuring all assumptions are true.
   *
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @return {!Promise}
   * @private
   */
  async onInitializeParser_(has, wants) {
    goog.asserts.assert(
        has.mediaElement,
        'We should have a media element when initializing the parser.');
    goog.asserts.assert(
        has.mediaElement == wants.mediaElement,
        '|has| and |wants| should have the same media element when ' +
            'initializing the parser.');

    goog.asserts.assert(
        this.networkingEngine_,
        'Need networking engine when initializing the parser.');
    goog.asserts.assert(
        this.config_,
        'Need player config when initializing the parser.');

    // We are going to "lock-in" the mime type and uri since they are
    // what we are going to use to create our parser and parse the manifest.
    has.mimeType = wants.mimeType;
    has.uri = wants.uri;

    goog.asserts.assert(
        has.uri,
        'We should have an asset uri when initializing the parsing.');

    // Store references to things we asserted so that we don't need to reassert
    // them again later.
    const assetUri = has.uri;
    const networkingEngine = this.networkingEngine_;

    // Save the uri so that it can be used outside of the load-graph.
    this.assetUri_ = assetUri;

    // Create the parser that we will use to parse the manifest.
    this.parserFactory_ = await shaka.media.ManifestParser.getFactory(
        assetUri,
        networkingEngine,
        this.config_.manifest.retryParameters,
        has.mimeType);
    goog.asserts.assert(this.parserFactory_, 'Must have manifest parser');
    this.parser_ = shaka.util.Functional.callFactory(this.parserFactory_);

    const manifestConfig =
        shaka.util.ObjectUtils.cloneObject(this.config_.manifest);
    // Don't read video segments if the player is attached to an audio element
    if (wants.mediaElement && wants.mediaElement.nodeName === 'AUDIO') {
      manifestConfig.disableVideo = true;
    }

    this.parser_.configure(manifestConfig);
  }

  /**
   * Parse the manifest at |has.uri| using the parser that should have already
   * been created. This should only be called as part of the load graph.
   *
   * This method assumes that it is safe for it to execute, the load-graph is
   * responsible for ensuring all assumptions are true.
   *
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @return {!shaka.util.AbortableOperation}
   * @private
   */
  onParseManifest_(has, wants) {
    goog.asserts.assert(
        has.mimeType == wants.mimeType,
        '|has| and |wants| should have the same mime type when parsing.');
    goog.asserts.assert(
        has.uri == wants.uri,
        '|has| and |wants| should have the same uri when parsing.');

    goog.asserts.assert(
        has.uri,
        '|has| should have a valid uri when parsing.');
    goog.asserts.assert(
        has.uri == this.assetUri_,
        '|has.uri| should match the cached asset uri.');

    goog.asserts.assert(
        this.networkingEngine_,
        'Need networking engine to parse manifest.');
    goog.asserts.assert(
        this.config_,
        'Need player config to parse manifest.');

    goog.asserts.assert(
        this.parser_,
        '|this.parser_| should have been set in an earlier step.');

    // Store references to things we asserted so that we don't need to reassert
    // them again later.
    const assetUri = has.uri;
    const networkingEngine = this.networkingEngine_;

    // This will be needed by the parser once it starts parsing, so we will
    // initialize it now even through it appears a little out-of-place.
    this.regionTimeline_ =
        new shaka.media.RegionTimeline(() => this.seekRange());
    this.regionTimeline_.setListeners(/* onRegionAdded= */ (region) => {
      this.onRegionEvent_(shaka.Player.EventName.TimelineRegionAdded, region);
      if (this.adManager_) {
        this.adManager_.onDashTimedMetadata(region);
      }
    });

    // TODO (#1391): Once filterManifest_ is async, remove this eslint disable.
    /* eslint-disable require-await */
    const playerInterface = {
      networkingEngine: networkingEngine,
      filter: async (manifest) => this.filterManifest_(manifest),
      makeTextStreamsForClosedCaptions: (manifest) => {
        return this.makeTextStreamsForClosedCaptions_(manifest);
      },

      // Called when the parser finds a timeline region. This can be called
      // before we start playback or during playback (live/in-progress
      // manifest).
      onTimelineRegionAdded: (region) => this.regionTimeline_.addRegion(region),

      onEvent: (event) => this.dispatchEvent(event),
      onError: (error) => this.onError_(error),
      isLowLatencyMode: () => this.isLowLatencyMode_(),
      isAutoLowLatencyMode: () => this.isAutoLowLatencyMode_(),
      enableLowLatencyMode: () => {
        this.configure('streaming.lowLatencyMode', true);
      },
    };
    /* eslint-enable require-await */

    const startTime = Date.now() / 1000;

    return new shaka.util.AbortableOperation(/* promise= */ (async () => {
      this.manifest_ = await this.parser_.start(assetUri, playerInterface);

      // This event is fired after the manifest is parsed, but before any
      // filtering takes place.
      const event = this.makeEvent_(shaka.Player.EventName.ManifestParsed);
      this.dispatchEvent(event);

      // We require all manifests to have at least one variant.
      if (this.manifest_.variants.length == 0) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.NO_VARIANTS);
      }

      // Make sure that all variants are either: audio-only, video-only, or
      // audio-video.
      shaka.Player.filterForAVVariants_(this.manifest_);

      const now = Date.now() / 1000;
      const delta = now - startTime;
      this.stats_.setManifestTime(delta);
    })(), /* onAbort= */ () => {
      shaka.log.info('Aborting parser step...');
      return this.parser_.stop();
    });
  }

  /**
   * This should only be called by the load graph when it is time to initialize
   * drmEngine. The only time this may be called is when we are attached a
   * media element and have parsed a manifest.
   *
   * The load-graph is responsible for ensuring all assumptions made by this
   * method are valid before executing it.
   *
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @return {!Promise}
   * @private
   */
  async onInitializeDrm_(has, wants) {
    goog.asserts.assert(
        has.mimeType == wants.mimeType,
        'The load graph should have ensured the mime types matched.');
    goog.asserts.assert(
        has.uri == wants.uri,
        'The load graph should have ensured the uris matched');

    goog.asserts.assert(
        this.networkingEngine_,
        '|onInitializeDrm_| should never be called after |destroy|');
    goog.asserts.assert(
        this.config_,
        '|onInitializeDrm_| should never be called after |destroy|');
    goog.asserts.assert(
        this.manifest_,
        '|this.manifest_| should have been set in an earlier step.');
    goog.asserts.assert(
        has.mediaElement,
        'We should have a media element when initializing the DRM Engine.');

    const startTime = Date.now() / 1000;
    let firstEvent = true;

    this.drmEngine_ = this.createDrmEngine({
      netEngine: this.networkingEngine_,
      onError: (e) => {
        this.onError_(e);
      },
      onKeyStatus: (map) => {
        this.onKeyStatus_(map);
      },
      onExpirationUpdated: (id, expiration) => {
        this.onExpirationUpdated_(id, expiration);
      },
      onEvent: (e) => {
        this.dispatchEvent(e);
        if (e.type == shaka.Player.EventName.DrmSessionUpdate && firstEvent) {
          firstEvent = false;
          const now = Date.now() / 1000;
          const delta = now - startTime;
          this.stats_.setDrmTime(delta);
        }
      },
    });

    // TODO: remove once MediaCap implementation is complete.
    if (!this.config_.useMediaCapabilities) {
      shaka.util.StreamUtils.filterManifestByMediaSource(this.manifest_);
    }

    this.drmEngine_.configure(this.config_.drm);

    await this.drmEngine_.initForPlayback(
        this.manifest_.variants,
        this.manifest_.offlineSessionIds,
        this.config_.useMediaCapabilities);

    await this.drmEngine_.attach(has.mediaElement);

    // Now that we have drm information, filter the manifest (again) so that we
    // can ensure we only use variants with the selected key system.
    await this.filterManifest_(this.manifest_);
  }

  /**
   * This should only be called by the load graph when it is time to load all
   * playback components needed for playback. The only times this may be called
   * is when we are attached to the same media element as in the request.
   *
   * This method assumes that it is safe for it to execute, the load-graph is
   * responsible for ensuring all assumptions are true.
   *
   * Loading is defined as:
   *  - Attaching all playback-related listeners to the media element
   *  - Initializing playback and observers
   *  - Initializing ABR Manager
   *  - Initializing Streaming Engine
   *  - Starting playback at |wants.startTime|
   *
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @private
   */
  async onLoad_(has, wants) {
    goog.asserts.assert(
        has.mimeType == wants.mimeType,
        '|has| and |wants| should have the same mime type when loading.');
    goog.asserts.assert(
        has.uri == wants.uri,
        '|has| and |wants| should have the same uri when loading.');

    goog.asserts.assert(
        has.mediaElement,
        'We should have a media element when loading.');
    goog.asserts.assert(
        !isNaN(wants.startTimeOfLoad),
        '|wants| should tell us when the load was originally requested');

    // Since we are about to start playback, we will lock in the start time as
    // something we are now depending on.
    has.startTime = wants.startTime;

    // Store a reference to values in |has| after asserting so that closure will
    // know that they will still be non-null between calls to await.
    const mediaElement = has.mediaElement;
    const assetUri = has.uri;

    // Save the uri so that it can be used outside of the load-graph.
    this.assetUri_ = assetUri;

    this.playRateController_ = new shaka.media.PlayRateController({
      getRate: () => has.mediaElement.playbackRate,
      getDefaultRate: () => has.mediaElement.defaultPlaybackRate,
      setRate: (rate) => { has.mediaElement.playbackRate = rate; },
      movePlayhead: (delta) => { has.mediaElement.currentTime += delta; },
    });

    const updateStateHistory = () => this.updateStateHistory_();
    const onRateChange = () => this.onRateChange_();
    this.eventManager_.listen(mediaElement, 'playing', updateStateHistory);
    this.eventManager_.listen(mediaElement, 'pause', updateStateHistory);
    this.eventManager_.listen(mediaElement, 'ended', updateStateHistory);
    this.eventManager_.listen(mediaElement, 'ratechange', onRateChange);

    const abrFactory = this.config_.abrFactory;
    if (!this.abrManager_ || this.abrManagerFactory_ != abrFactory) {
      this.abrManagerFactory_ = abrFactory;
      this.abrManager_ = shaka.util.Functional.callFactory(abrFactory);
      if (typeof this.abrManager_.playbackRateChanged != 'function') {
        shaka.Deprecate.deprecateFeature(4,
            'AbrManager',
            'Please use an AbrManager with playbackRateChanged function.');
        this.abrManager_.playbackRateChanged = (rate) => {};
      }
      this.abrManager_.configure(this.config_.abr);
    }

    // Copy preferred languages from the config again, in case the config was
    // changed between construction and playback.
    this.currentAdaptationSetCriteria_ =
        new shaka.media.PreferenceBasedCriteria(
            this.config_.preferredAudioLanguage,
            this.config_.preferredVariantRole,
            this.config_.preferredAudioChannelCount);

    this.currentTextLanguage_ = this.config_.preferredTextLanguage;

    shaka.Player.applyPlayRange_(this.manifest_.presentationTimeline,
        this.config_.playRangeStart,
        this.config_.playRangeEnd);

    this.abrManager_.init((variant, clearBuffer, safeMargin) => {
      return this.switch_(variant, clearBuffer, safeMargin);
    });

    this.playhead_ = this.createPlayhead(has.startTime);
    this.playheadObservers_ = this.createPlayheadObserversForMSE_();

    // We need to start the buffer management code near the end because it will
    // set the initial buffering state and that depends on other components
    // being initialized.
    const rebufferThreshold = Math.max(
        this.manifest_.minBufferTime, this.config_.streaming.rebufferingGoal);
    this.startBufferManagement_(rebufferThreshold);

    // If the content is multi-codec and the browser can play more than one of
    // them, choose codecs now before we initialize streaming.
    shaka.util.StreamUtils.chooseCodecsAndFilterManifest(
        this.manifest_, this.config_.preferredAudioChannelCount);

    this.streamingEngine_ = this.createStreamingEngine();
    this.streamingEngine_.configure(this.config_.streaming);

    // Set the load mode to "loaded with media source" as late as possible so
    // that public methods won't try to access internal components until
    // they're all initialized. We MUST switch to loaded before calling
    // "streaming" so that they can access internal information.
    this.loadMode_ = shaka.Player.LoadMode.MEDIA_SOURCE;

    // The event must be fired after we filter by restrictions but before the
    // active stream is picked to allow those listening for the "streaming"
    // event to make changes before streaming starts.
    this.dispatchEvent(this.makeEvent_(shaka.Player.EventName.Streaming));

    // Pick the initial streams to play.
    const initialVariant = this.chooseVariant_();
    goog.asserts.assert(initialVariant, 'Must choose an initial variant!');
    this.addVariantToSwitchHistory_(
        initialVariant, /* fromAdaptation= */ true);
    this.streamingEngine_.switchVariant(
        initialVariant, /* clearBuffer= */ false, /* safeMargin= */ 0);

    // Decide if text should be shown automatically.
    const initialTextStream = this.chooseTextStream_();
    if (initialTextStream) {
      this.addTextStreamToSwitchHistory_(
          initialTextStream, /* fromAdaptation= */ true);
    }

    this.setInitialTextState_(initialVariant, initialTextStream);
    // Don't initialize with a text stream unless we should be streaming text.
    if (initialTextStream && this.shouldStreamText_()) {
      this.streamingEngine_.switchTextStream(initialTextStream);
    }

    // Now that we have initial streams, we may adjust the start time to align
    // to a segment boundary.
    if (this.config_.streaming.startAtSegmentBoundary) {
      const startTime = this.playhead_.getTime();
      const adjustedTime =
          await this.adjustStartTime_(initialVariant, startTime);

      this.playhead_.setStartTime(adjustedTime);
    }

    // Start streaming content. This will start the flow of content down to
    // media source.
    await this.streamingEngine_.start();

    if (this.config_.abr.enabled) {
      this.abrManager_.enable();
      this.onAbrStatusChanged_();
    }

    // Re-filter the manifest after streams have been chosen.
    this.filterManifestByCurrentVariant_();
    // Dispatch a 'trackschanged' event now that all initial filtering is done.
    this.onTracksChanged_();
    // Since the first streams just became active, send an adaptation event.
    this.onAdaptation_();

    // Now that we've filtered out variants that aren't compatible with the
    // active one, update abr manager with filtered variants.
    // NOTE: This may be unnecessary.  We've already chosen one codec in
    // chooseCodecsAndFilterManifest_ before we started streaming.  But it
    // doesn't hurt, and this will all change when we start using
    // MediaCapabilities and codec switching.
    // TODO(#1391): Re-evaluate with MediaCapabilities and codec switching.
    this.updateAbrManagerVariants_();

    const hasPrimary = this.manifest_.variants.some((v) => v.primary);
    if (!this.config_.preferredAudioLanguage && !hasPrimary) {
      shaka.log.warning('No preferred audio language set.  We have chosen an ' +
                        'arbitrary language initially');
    }

    // Wait for the 'loadedmetadata' event to measure load() latency.
    this.eventManager_.listenOnce(mediaElement, 'loadedmetadata', () => {
      const now = Date.now() / 1000;
      const delta = now - wants.startTimeOfLoad;
      this.stats_.setLoadLatency(delta);
    });
  }

  /**
   * This should only be called by the load graph when it is time to initialize
   * drmEngine for src= playbacks.
   *
   * The load-graph is responsible for ensuring all assumptions made by this
   * method are valid before executing it.
   *
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @return {!Promise}
   * @private
   */
  async onInitializeSrcEqualsDrm_(has, wants) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    goog.asserts.assert(
        this.networkingEngine_,
        '|onInitializeSrcEqualsDrm_| should never be called after |destroy|');
    goog.asserts.assert(
        this.config_,
        '|onInitializeSrcEqualsDrm_| should never be called after |destroy|');

    const startTime = Date.now() / 1000;
    let firstEvent = true;

    this.drmEngine_ = this.createDrmEngine({
      netEngine: this.networkingEngine_,
      onError: (e) => {
        this.onError_(e);
      },
      onKeyStatus: (map) => {
        this.onKeyStatus_(map);
      },
      onExpirationUpdated: (id, expiration) => {
        this.onExpirationUpdated_(id, expiration);
      },
      onEvent: (e) => {
        this.dispatchEvent(e);
        if (e.type == shaka.Player.EventName.DrmSessionUpdate && firstEvent) {
          firstEvent = false;
          const now = Date.now() / 1000;
          const delta = now - startTime;
          this.stats_.setDrmTime(delta);
        }
      },
    });

    this.drmEngine_.configure(this.config_.drm);

    const uri = has.uri || '';
    const extension = shaka.media.ManifestParser.getExtension(uri);
    let mimeType = shaka.Player.SRC_EQUAL_EXTENSIONS_TO_MIME_TYPES_[extension];
    if (mimeType == 'application/x-mpegurl' && shaka.util.Platform.isApple()) {
      mimeType = 'application/vnd.apple.mpegurl';
    }
    if (!mimeType) {
      mimeType = 'video/mp4';
    }

    // TODO: Instead of feeding DrmEngine with Variants, we should refactor
    // DrmEngine so that it takes a minimal config derived from Variants.  In
    // cases like this one or in removal of stored content, the details are
    // largely unimportant.  We should have a saner way to initialize DrmEngine.
    // That would also insulate DrmEngine from manifest changes in the future.
    // For now, that is time-consuming and this synthetic Variant is easy, so
    // I'm putting it off.  Since this is only expected to be used for native
    // HLS in Safari, this should be safe. -JCP
    /** @type {shaka.extern.Variant} */
    const variant = {
      id: 0,
      language: 'und',
      primary: false,
      audio: null,
      video: {
        id: 0,
        originalId: null,
        createSegmentIndex: () => Promise.resolve(),
        segmentIndex: null,
        mimeType: wants.mimeType ?
            shaka.util.MimeUtils.getBasicType(wants.mimeType) : mimeType,
        codecs: wants.mimeType ?
            shaka.util.MimeUtils.getCodecs(wants.mimeType) : '',
        encrypted: true,
        drmInfos: [],  // Filled in by DrmEngine config.
        keyIds: new Set(),
        language: 'und',
        label: null,
        type: ContentType.VIDEO,
        primary: false,
        trickModeVideo: null,
        emsgSchemeIdUris: null,
        roles: [],
        forced: false,
        channelsCount: null,
        audioSamplingRate: null,
        spatialAudio: false,
        closedCaptions: null,
      },
      bandwidth: 100,
      allowedByApplication: true,
      allowedByKeySystem: true,
      decodingInfos: [],
    };

    await this.drmEngine_.initForPlayback(
        [variant], /* offlineSessionIds= */ []);
    await this.drmEngine_.attach(has.mediaElement);
  }

  /**
   * This should only be called by the load graph when it is time to set-up the
   * media element to play content using src=. The only times this may be called
   * is when we are attached to the same media element as in the request.
   *
   * This method assumes that it is safe for it to execute, the load-graph is
   * responsible for ensuring all assumptions are true.
   *
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @return {!shaka.util.AbortableOperation}
   *
   * @private
   */
  onSrcEquals_(has, wants) {
    goog.asserts.assert(
        has.mediaElement,
        'We should have a media element when loading.');
    goog.asserts.assert(
        wants.uri,
        '|has| should have a valid uri when loading.');
    goog.asserts.assert(
        !isNaN(wants.startTimeOfLoad),
        '|wants| should tell us when the load was originally requested');
    goog.asserts.assert(
        this.video_ == has.mediaElement,
        'The video element should match our media element');

    // Lock-in the values that we are using so that the routing logic knows what
    // we have.
    has.uri = wants.uri;
    has.startTime = wants.startTime;

    // Save the uri so that it can be used outside of the load-graph.
    this.assetUri_ = has.uri;

    this.playhead_ = new shaka.media.SrcEqualsPlayhead(has.mediaElement);

    if (has.startTime != null) {
      this.playhead_.setStartTime(has.startTime);
    }

    this.playRateController_ = new shaka.media.PlayRateController({
      getRate: () => has.mediaElement.playbackRate,
      getDefaultRate: () => has.mediaElement.defaultPlaybackRate,
      setRate: (rate) => { has.mediaElement.playbackRate = rate; },
      movePlayhead: (delta) => { has.mediaElement.currentTime += delta; },
    });

    // We need to start the buffer management code near the end because it will
    // set the initial buffering state and that depends on other components
    // being initialized.
    const rebufferThreshold = this.config_.streaming.rebufferingGoal;
    this.startBufferManagement_(rebufferThreshold);

    // Add all media element listeners.
    const updateStateHistory = () => this.updateStateHistory_();
    const onRateChange = () => this.onRateChange_();
    this.eventManager_.listen(has.mediaElement, 'playing', updateStateHistory);
    this.eventManager_.listen(has.mediaElement, 'pause', updateStateHistory);
    this.eventManager_.listen(has.mediaElement, 'ended', updateStateHistory);
    this.eventManager_.listen(has.mediaElement, 'ratechange', onRateChange);

    // Wait for the 'loadedmetadata' event to measure load() latency, but only
    // if preload is set in a way that would result in this event firing
    // automatically.  See https://github.com/google/shaka-player/issues/2483
    if (this.video_.preload != 'none') {
      this.eventManager_.listenOnce(this.video_, 'loadedmetadata', () => {
        const now = Date.now() / 1000;
        const delta = now - wants.startTimeOfLoad;
        this.stats_.setLoadLatency(delta);
      });
    }

    // The audio tracks are only available on Safari at the moment, but this
    // drives the tracks API for Safari's native HLS. So when they change,
    // fire the corresponding Shaka Player event.
    if (this.video_.audioTracks) {
      this.eventManager_.listen(
          this.video_.audioTracks, 'addtrack', () => this.onTracksChanged_());
      this.eventManager_.listen(
          this.video_.audioTracks, 'removetrack',
          () => this.onTracksChanged_());
      this.eventManager_.listen(
          this.video_.audioTracks, 'change', () => this.onTracksChanged_());
    }
    if (this.video_.textTracks) {
      this.eventManager_.listen(this.video_.textTracks, 'addtrack', (e) => {
        this.onTracksChanged_();
        this.processTimedMetadataSrcEqls_(/** @type {!TrackEvent} */(e));
      });
      this.eventManager_.listen(
          this.video_.textTracks, 'removetrack', () => this.onTracksChanged_());
      this.eventManager_.listen(
          this.video_.textTracks, 'change', () => this.onTracksChanged_());
    }

    // By setting |src| we are done "loading" with src=. We don't need to set
    // the current time because |playhead| will do that for us.
    has.mediaElement.src = has.uri;

    // Tizen 3 / WebOS won't load anything unless you call load() explicitly,
    // no matter the value of the preload attribute.  This is harmful on some
    // other platforms by triggering unbounded loading of media data, but is
    // necessary here.
    if (shaka.util.Platform.isTizen() || shaka.util.Platform.isWebOS()) {
      has.mediaElement.load();
    }

    // Set the load mode last so that we know that all our components are
    // initialized.
    this.loadMode_ = shaka.Player.LoadMode.SRC_EQUALS;

    // The event doesn't mean as much for src= playback, since we don't control
    // streaming.  But we should fire it in this path anyway since some
    // applications may be expecting it as a life-cycle event.
    this.dispatchEvent(this.makeEvent_(shaka.Player.EventName.Streaming));

    // The "load" Promise is resolved when we have loaded the metadata.  If we
    // wait for the full data, that won't happen on Safari until the play button
    // is hit.
    const fullyLoaded = new shaka.util.PublicPromise();
    shaka.util.MediaReadyState.waitForReadyState(this.video_,
        HTMLMediaElement.HAVE_METADATA,
        this.eventManager_,
        () => {
          fullyLoaded.resolve();
        });

    // This flag is used below in the language preference setup to check if this
    // load was canceled before the necessary events fire.
    let unloaded = false;
    this.cleanupOnUnload_.push(() => {
      unloaded = true;
    });

    // We can't switch to preferred languages, though, until the data is loaded.
    shaka.util.MediaReadyState.waitForReadyState(this.video_,
        HTMLMediaElement.HAVE_CURRENT_DATA,
        this.eventManager_,
        async () => {
          // If we have moved on to another piece of content while waiting for
          // the above event, we should not change tracks here.
          if (unloaded) {
            return;
          }

          this.setupPreferredAudioOnSrc_();

          // Applying the text preference too soon can result in it being
          // reverted.  Wait for native HLS to pick something first.
          const textTracks = this.getFilteredTextTracks_();
          if (!textTracks.find((t) => t.mode != 'disabled')) {
            await new Promise((resolve) => {
              this.eventManager_.listenOnce(
                  this.video_.textTracks, 'change', resolve);
              // We expect the event to fire because it does on Safari.
              // But in case it doesn't on some other platform or future
              // version, move on in 1 second no matter what.  This keeps the
              // language settings from being completely ignored if something
              // goes wrong.
              new shaka.util.Timer(resolve).tickAfter(1);
            });
          }

          // If we have moved on to another piece of content while waiting for
          // the above event/timer, we should not change tracks here.
          if (unloaded) {
            return;
          }

          this.setupPreferredTextOnSrc_();
        });

    if (this.video_.error) {
      // Already failed!
      fullyLoaded.reject(this.videoErrorToShakaError_());
    } else if (this.video_.preload == 'none') {
      shaka.log.alwaysWarn(
          'With <video preload="none">, the browser will not load anything ' +
          'until play() is called. We are unable to measure load latency in ' +
          'a meaningful way, and we cannot provide track info yet. Please do ' +
          'not use preload="none" with Shaka Player.');
      // We can't wait for an event load loadedmetadata, since that will be
      // blocked until a user interaction.  So resolve the Promise now.
      fullyLoaded.resolve();
    }

    this.eventManager_.listenOnce(this.video_, 'error', () => {
      fullyLoaded.reject(this.videoErrorToShakaError_());
    });

    return new shaka.util.AbortableOperation(fullyLoaded, /* onAbort= */ () => {
      const abortedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
      fullyLoaded.reject(abortedError);
      return Promise.resolve();  // Abort complete.
    });
  }

  /**
   * This method setup the preferred audio using src=..
   *
   * @private
   */
  setupPreferredAudioOnSrc_() {
    const preferredAudioLanguage = this.config_.preferredAudioLanguage;

    // If the user has not selected a preference, the browser preference is
    // left.
    if (preferredAudioLanguage == '') {
      return;
    }

    this.selectAudioLanguage(preferredAudioLanguage);

    const preferredVariantRole = this.config_.preferredVariantRole;

    // If the user has not selected a role preference, the previous match is
    // selected.
    if (preferredVariantRole == '') {
      return;
    }

    this.selectAudioLanguage(preferredAudioLanguage, preferredVariantRole);
  }

  /**
   * This method setup the preferred text using src=.
   *
   * @private
   */
  setupPreferredTextOnSrc_() {
    const preferredTextLanguage = this.config_.preferredTextLanguage;
    const preferForcedSubs = this.config_.preferForcedSubs;

    // If the user has not selected a preference, the browser preference is
    // left.
    if (preferredTextLanguage == '') {
      return;
    }

    this.selectTextLanguage(preferredTextLanguage, '', preferForcedSubs);

    const preferredTextRole = this.config_.preferredTextRole;

    // If the user has not selected a role preference, the previous match is
    // selected.
    if (preferredTextRole == '') {
      return;
    }

    this.selectTextLanguage(preferredTextLanguage, preferredTextRole,
        preferForcedSubs);
  }

  /**
   * We're looking for metadata tracks to process id3 tags. One of the uses is
   * for ad info on LIVE streams
   *
   * @param {!TrackEvent} event
   * @private
   */
  processTimedMetadataSrcEqls_(event) {
    const track = event.track;
    goog.asserts.assert(track instanceof TextTrack, 'Wrong track type!');

    if (track.kind != 'metadata') {
      return;
    }

    // Hidden mode is required for the cuechange event to launch correctly
    track.mode = 'hidden';
    this.eventManager_.listen(track, 'cuechange', () => {
      if (!track.activeCues) {
        return;
      }

      for (const cue of track.activeCues) {
        this.dispatchMetadataEvent_(cue.startTime, cue.endTime,
            cue.type, cue.value);

        if (this.adManager_) {
          this.adManager_.onCueMetadataChange(cue.value);
        }
      }
    });

    // In Safari the initial assignment does not always work, so we schedule
    // this process to be repeated several times to ensure that it has been put
    // in the correct mode.
    new shaka.util.Timer(() => {
      const textTracks = this.getMetadataTracks_();
      for (const textTrack of textTracks) {
        textTrack.mode = 'hidden';
      }
    }).tickNow().tickAfter(/* seconds= */ 0.5);
  }


  /**
   * @param {!Array.<shaka.extern.ID3Metadata>} metadata
   * @param {number} offset
   * @param {?number} segmentEndTime
   * @private
   */
  processTimedMetadataMediaSrc_(metadata, offset, segmentEndTime) {
    for (const sample of metadata) {
      if (sample['data'] && sample['cueTime'] && sample['frames']) {
        const start = sample['cueTime'] + offset;
        const end = segmentEndTime;
        const metadataType = 'ID3';
        for (const frame of sample['frames']) {
          const payload = frame;
          this.dispatchMetadataEvent_(start, end, metadataType, payload);
        }

        if (this.adManager_) {
          this.adManager_.onHlsTimedMetadata(sample, start);
        }
      }
    }
  }


  /**
   * Construct and fire a Player.Metadata event
   *
   * @param {number} startTime
   * @param {?number} endTime
   * @param {string} metadataType
   * @param {shaka.extern.ID3Metadata} payload
   * @private
   */
  dispatchMetadataEvent_(startTime, endTime, metadataType, payload) {
    goog.asserts.assert(!endTime || startTime <= endTime,
        'Metadata start time should be less or equal to the end time!');
    const eventName = shaka.Player.EventName.Metadata;
    const data = {
      startTime: startTime,
      endTime: endTime,
      metadataType: metadataType,
      payload: payload,
    };
    this.dispatchEvent(this.makeEvent_(eventName, data));
  }

  /**
   * Take a series of variants and ensure that they only contain one type of
   * variant. The different options are:
   *  1. Audio-Video
   *  2. Audio-Only
   *  3. Video-Only
   *
   * A manifest can only contain a single type because once we initialize media
   * source to expect specific streams, it must always have content for those
   * streams. If we were to start with audio+video and switch to an audio-only
   * variant, media source would block waiting for video content.
   *
   * @param {shaka.extern.Manifest} manifest
   * @private
   */
  static filterForAVVariants_(manifest) {
    const isAVVariant = (variant) => {
      // Audio-video variants may include both streams separately or may be
      // single multiplexed streams with multiple codecs.
      return (variant.video && variant.audio) ||
             (variant.video && variant.video.codecs.includes(','));
    };
    if (manifest.variants.some(isAVVariant)) {
      shaka.log.debug('Found variant with audio and video content, ' +
          'so filtering out audio-only content.');
      manifest.variants = manifest.variants.filter(isAVVariant);
    }
  }

  /**
   * Create a new DrmEngine instance. This may be replaced by tests to create
   * fake instances. Configuration and initialization will be handled after
   * |createDrmEngine|.
   *
   * @param {shaka.media.DrmEngine.PlayerInterface} playerInterface
   * @return {!shaka.media.DrmEngine}
   */
  createDrmEngine(playerInterface) {
    const updateExpirationTime = this.config_.drm.updateExpirationTime;
    return new shaka.media.DrmEngine(playerInterface, updateExpirationTime);
  }

  /**
   * Creates a new instance of NetworkingEngine.  This can be replaced by tests
   * to create fake instances instead.
   *
   * @return {!shaka.net.NetworkingEngine}
   */
  createNetworkingEngine() {
    /** @type {function(number, number)} */
    const onProgressUpdated_ = (deltaTimeMs, bytesDownloaded) => {
      // In some situations, such as during offline storage, the abr manager
      // might not yet exist. Therefore, we need to check if abr manager has
      // been initialized before using it.
      if (this.abrManager_) {
        this.abrManager_.segmentDownloaded(deltaTimeMs, bytesDownloaded);
      }
    };

    return new shaka.net.NetworkingEngine(onProgressUpdated_);
  }

  /**
   * Creates a new instance of Playhead.  This can be replaced by tests to
   * create fake instances instead.
   *
   * @param {?number} startTime
   * @return {!shaka.media.Playhead}
   */
  createPlayhead(startTime) {
    goog.asserts.assert(this.manifest_, 'Must have manifest');
    goog.asserts.assert(this.video_, 'Must have video');
    return new shaka.media.MediaSourcePlayhead(
        this.video_,
        this.manifest_,
        this.config_.streaming,
        startTime,
        () => this.onSeek_(),
        (event) => this.dispatchEvent(event));
  }

  /**
   * Create the observers for MSE playback. These observers are responsible for
   * notifying the app and player of specific events during MSE playback.
   *
   * @return {!shaka.media.PlayheadObserverManager}
   * @private
   */
  createPlayheadObserversForMSE_() {
    goog.asserts.assert(this.manifest_, 'Must have manifest');
    goog.asserts.assert(this.regionTimeline_, 'Must have region timeline');
    goog.asserts.assert(this.video_, 'Must have video element');

    // Create the region observer. This will allow us to notify the app when we
    // move in and out of timeline regions.
    const regionObserver = new shaka.media.RegionObserver(this.regionTimeline_);
    const onEnterRegion = (region, seeking) => {
      this.onRegionEvent_(shaka.Player.EventName.TimelineRegionEnter, region);
    };
    const onExitRegion = (region, seeking) => {
      this.onRegionEvent_(shaka.Player.EventName.TimelineRegionExit, region);
    };
    const onSkipRegion = (region, seeking) => {
      // If we are seeking, we don't want to surface the enter/exit events since
      // they didn't play through them.
      if (!seeking) {
        this.onRegionEvent_(shaka.Player.EventName.TimelineRegionEnter, region);
        this.onRegionEvent_(shaka.Player.EventName.TimelineRegionExit, region);
      }
    };
    regionObserver.setListeners(onEnterRegion, onExitRegion, onSkipRegion);

    // Now that we have all our observers, create a manager for them.
    const manager = new shaka.media.PlayheadObserverManager(this.video_);
    manager.manage(regionObserver);

    return manager;
  }

  /**
   * Initialize and start the buffering system (observer and timer) so that we
   * can monitor our buffer lead during playback.
   *
   * @param {number} rebufferingGoal
   * @private
   */
  startBufferManagement_(rebufferingGoal) {
    goog.asserts.assert(
        !this.bufferObserver_,
        'No buffering observer should exist before initialization.');

    goog.asserts.assert(
        !this.bufferPoller_,
        'No buffer timer should exist before initialization.');

    // Give dummy values, will be updated below.
    this.bufferObserver_ = new shaka.media.BufferingObserver(1, 2);

    // Force us back to a buffering state. This ensure everything is starting in
    // the same state.
    this.bufferObserver_.setState(shaka.media.BufferingObserver.State.STARVING);
    this.updateBufferingSettings_(rebufferingGoal);
    this.updateBufferState_();

    // TODO: We should take some time to look into the effects of our
    //       quarter-second refresh practice. We often use a quarter-second
    //       but we have no documentation about why.
    this.bufferPoller_ = new shaka.util.Timer(() => {
      this.pollBufferState_();
    }).tickEvery(/* seconds= */ 0.25);
  }

  /**
   * Updates the buffering thresholds based on the new rebuffering goal.
   *
   * @param {number} rebufferingGoal
   * @private
   */
  updateBufferingSettings_(rebufferingGoal) {
    // The threshold to transition back to satisfied when starving.
    const starvingThreshold = rebufferingGoal;
    // The threshold to transition into starving when satisfied.
    // We use a "typical" threshold, unless the rebufferingGoal is unusually
    // low.
    // Then we force the value down to half the rebufferingGoal, since
    // starvingThreshold must be strictly larger than satisfiedThreshold for the
    // logic in BufferingObserver to work correctly.
    const satisfiedThreshold = Math.min(
        shaka.Player.TYPICAL_BUFFERING_THRESHOLD_, rebufferingGoal / 2);

    this.bufferObserver_.setThresholds(starvingThreshold, satisfiedThreshold);
  }

  /**
   * This method is called periodically to check what the buffering observer
   * says so that we can update the rest of the buffering behaviours.
   *
   * @private
   */
  pollBufferState_() {
    goog.asserts.assert(
        this.video_,
        'Need a media element to update the buffering observer');

    goog.asserts.assert(
        this.bufferObserver_,
        'Need a buffering observer to update');

    let bufferedToEnd;
    switch (this.loadMode_) {
      case shaka.Player.LoadMode.SRC_EQUALS:
        bufferedToEnd = this.isBufferedToEndSrc_();
        break;
      case shaka.Player.LoadMode.MEDIA_SOURCE:
        bufferedToEnd = this.isBufferedToEndMS_();
        break;
      default:
        bufferedToEnd = false;
        break;
    }

    const bufferLead = shaka.media.TimeRangesUtils.bufferedAheadOf(
        this.video_.buffered,
        this.video_.currentTime);

    const stateChanged = this.bufferObserver_.update(bufferLead, bufferedToEnd);

    // If the state changed, we need to surface the event.
    if (stateChanged) {
      this.updateBufferState_();
    }
  }

  /**
   * Create a new media source engine. This will ONLY be replaced by tests as a
   * way to inject fake media source engine instances.
   *
   * @param {!HTMLMediaElement} mediaElement
   * @param {!shaka.media.IClosedCaptionParser} closedCaptionsParser
   * @param {!shaka.extern.TextDisplayer} textDisplayer
   * @param {!function(!Array.<shaka.extern.ID3Metadata>, number, ?number)}
   *  onMetadata
   *
   * @return {!shaka.media.MediaSourceEngine}
   */
  createMediaSourceEngine(mediaElement, closedCaptionsParser, textDisplayer,
      onMetadata) {
    return new shaka.media.MediaSourceEngine(
        mediaElement, closedCaptionsParser, textDisplayer, onMetadata);
  }

  /**
   * Creates a new instance of StreamingEngine.  This can be replaced by tests
   * to create fake instances instead.
   *
   * @return {!shaka.media.StreamingEngine}
   */
  createStreamingEngine() {
    goog.asserts.assert(
        this.playhead_ && this.abrManager_ && this.mediaSourceEngine_ &&
        this.manifest_,
        'Must not be destroyed');

    /** @type {shaka.media.StreamingEngine.PlayerInterface} */
    const playerInterface = {
      getPresentationTime: () => this.playhead_.getTime(),
      getBandwidthEstimate: () => this.abrManager_.getBandwidthEstimate(),
      mediaSourceEngine: this.mediaSourceEngine_,
      netEngine: this.networkingEngine_,
      onError: (error) => this.onError_(error),
      onEvent: (event) => this.dispatchEvent(event),
      onManifestUpdate: () => this.onManifestUpdate_(),
      onSegmentAppended: () => this.onSegmentAppended_(),
    };

    return new shaka.media.StreamingEngine(this.manifest_, playerInterface);
  }

  /**
   * Changes configuration settings on the Player.  This checks the names of
   * keys and the types of values to avoid coding errors.  If there are errors,
   * this logs them to the console and returns false.  Correct fields are still
   * applied even if there are other errors.  You can pass an explicit
   * <code>undefined</code> value to restore the default value.  This has two
   * modes of operation:
   *
   * <p>
   * First, this can be passed a single "plain" object.  This object should
   * follow the {@link shaka.extern.PlayerConfiguration} object.  Not all fields
   * need to be set; unset fields retain their old values.
   *
   * <p>
   * Second, this can be passed two arguments.  The first is the name of the key
   * to set.  This should be a '.' separated path to the key.  For example,
   * <code>'streaming.alwaysStreamText'</code>.  The second argument is the
   * value to set.
   *
   * @param {string|!Object} config This should either be a field name or an
   *   object.
   * @param {*=} value In the second mode, this is the value to set.
   * @return {boolean} True if the passed config object was valid, false if
   *   there were invalid entries.
   * @export
   */
  configure(config, value) {
    goog.asserts.assert(this.config_, 'Config must not be null!');
    goog.asserts.assert(typeof(config) == 'object' || arguments.length == 2,
        'String configs should have values!');

    // ('fieldName', value) format
    if (arguments.length == 2 && typeof(config) == 'string') {
      config = shaka.util.ConfigUtils.convertToConfigObject(config, value);
    }

    goog.asserts.assert(typeof(config) == 'object', 'Should be an object!');

    // Deprecate 'manifest.dash.defaultPresentationDelay' configuration.
    if (config['manifest'] && config['manifest']['dash'] &&
          'defaultPresentationDelay' in config['manifest']['dash']) {
      shaka.Deprecate.deprecateFeature(4,
          'manifest.dash.defaultPresentationDelay configuration',
          'Please Use manifest.defaultPresentationDelay instead.');
      config['manifest']['defaultPresentationDelay'] =
          config['manifest']['dash']['defaultPresentationDelay'];
      delete config['manifest']['dash']['defaultPresentationDelay'];
    }

    // If lowLatencyMode is enabled, and inaccurateManifestTolerance and
    // rebufferingGoal are not specified, set inaccurateManifestTolerance to 0
    // and rebufferingGoal to 0.01 by default for low latency streaming.
    if (config['streaming'] && config['streaming']['lowLatencyMode']) {
      if (config['streaming']['inaccurateManifestTolerance'] == undefined) {
        config['streaming']['inaccurateManifestTolerance'] = 0;
      }
      if (config['streaming']['rebufferingGoal'] == undefined) {
        config['streaming']['rebufferingGoal'] = 0.01;
      }
    }
    const ret = shaka.util.PlayerConfiguration.mergeConfigObjects(
        this.config_, config, this.defaultConfig_());

    this.applyConfig_();
    return ret;
  }

  /**
   * Apply config changes.
   * @private
   */
  applyConfig_() {
    if (this.parser_) {
      const manifestConfig =
          shaka.util.ObjectUtils.cloneObject(this.config_.manifest);
      // Don't read video segments if the player is attached to an audio element
      if (this.video_ && this.video_.nodeName === 'AUDIO') {
        manifestConfig.disableVideo = true;
      }
      this.parser_.configure(manifestConfig);
    }
    if (this.drmEngine_) {
      this.drmEngine_.configure(this.config_.drm);
    }
    if (this.streamingEngine_) {
      this.streamingEngine_.configure(this.config_.streaming);

      // Need to apply the restrictions.
      try {
        // this.filterManifestWithRestrictions_() may throw.
        this.filterManifestWithRestrictions_(this.manifest_);
      } catch (error) {
        this.onError_(error);
      }

      if (this.abrManager_) {
        // Update AbrManager variants to match these new settings.
        this.updateAbrManagerVariants_();
      }

      // If the streams we are playing are restricted, we need to switch.
      const activeVariant = this.streamingEngine_.getCurrentVariant();
      if (activeVariant) {
        if (!activeVariant.allowedByApplication ||
            !activeVariant.allowedByKeySystem) {
          shaka.log.debug('Choosing new variant after changing configuration');
          this.chooseVariantAndSwitch_();
        }
      }
    }
    if (this.networkingEngine_) {
      this.networkingEngine_.setForceHTTPS(this.config_.streaming.forceHTTPS);
    }

    if (this.mediaSourceEngine_) {
      const textDisplayerFactory = this.config_.textDisplayFactory;
      if (this.lastTextFactory_ != textDisplayerFactory) {
        const displayer =
            shaka.util.Functional.callFactory(textDisplayerFactory);
        this.mediaSourceEngine_.setTextDisplayer(displayer);
        this.lastTextFactory_ = textDisplayerFactory;

        if (this.streamingEngine_) {
          // Reload the text stream, so the cues will load again.
          this.streamingEngine_.reloadTextStream();
        }
      }
    }
    if (this.abrManager_) {
      this.abrManager_.configure(this.config_.abr);
      // Simply enable/disable ABR with each call, since multiple calls to these
      // methods have no effect.
      if (this.config_.abr.enabled) {
        this.abrManager_.enable();
      } else {
        this.abrManager_.disable();
      }

      this.onAbrStatusChanged_();
    }
    if (this.bufferObserver_) {
      let rebufferThreshold = this.config_.streaming.rebufferingGoal;
      if (this.manifest_) {
        rebufferThreshold =
            Math.max(rebufferThreshold, this.manifest_.minBufferTime);
      }
      this.updateBufferingSettings_(rebufferThreshold);
    }

    if (this.manifest_) {
      shaka.Player.applyPlayRange_(this.manifest_.presentationTimeline,
          this.config_.playRangeStart,
          this.config_.playRangeEnd);
    }
  }

  /**
   * Return a copy of the current configuration.  Modifications of the returned
   * value will not affect the Player's active configuration.  You must call
   * <code>player.configure()</code> to make changes.
   *
   * @return {shaka.extern.PlayerConfiguration}
   * @export
   */
  getConfiguration() {
    goog.asserts.assert(this.config_, 'Config must not be null!');

    const ret = this.defaultConfig_();
    shaka.util.PlayerConfiguration.mergeConfigObjects(
        ret, this.config_, this.defaultConfig_());
    return ret;
  }

  /**
   * Return a reference to the current configuration. Modifications to the
   * returned value will affect the Player's active configuration. This method
   * is not exported as sharing configuration with external objects is not
   * supported.
   *
   * @return {shaka.extern.PlayerConfiguration}
   */
  getSharedConfiguration() {
    goog.asserts.assert(
        this.config_, 'Cannot call getSharedConfiguration after call destroy!');
    return this.config_;
  }

  /**
   * Returns the ratio of video length buffered compared to buffering Goal
   * @return {number}
   * @export
   */
  getBufferFullness() {
    const bufferedLength = this.video_ ?
        this.video_.buffered.length : 0;
    const bufferedEnd =
        bufferedLength ? this.video_.buffered.end(bufferedLength - 1) : 0;
    const bufferingGoal = this.getConfiguration().streaming.bufferingGoal;
    const lengthToBeBuffered = this.video_ ? Math.min(this.video_.currentTime +
        bufferingGoal, this.seekRange().end) : 0;

    if (this.video_) {
      if (bufferedEnd >= lengthToBeBuffered) {
        return 1;
      } else if (bufferedEnd <= this.video_.currentTime) {
        return 0;
      } else if (bufferedEnd < lengthToBeBuffered) {
        return ((bufferedEnd - this.video_.currentTime) / bufferingGoal);
      }
    }
    return 0;
  }

  /**
   * Reset configuration to default.
   * @export
   */
  resetConfiguration() {
    goog.asserts.assert(this.config_, 'Cannot be destroyed');
    // Remove the old keys so we remove open-ended dictionaries like drm.servers
    // but keeps the same object reference.
    for (const key in this.config_) {
      delete this.config_[key];
    }

    shaka.util.PlayerConfiguration.mergeConfigObjects(
        this.config_, this.defaultConfig_(), this.defaultConfig_());
    this.applyConfig_();
  }

  /**
   * Get the current load mode.
   *
   * @return {shaka.Player.LoadMode}
   * @export
   */
  getLoadMode() {
    return this.loadMode_;
  }

  /**
   * Get the media element that the player is currently using to play loaded
   * content. If the player has not loaded content, this will return
   * <code>null</code>.
   *
   * @return {HTMLMediaElement}
   * @export
   */
  getMediaElement() {
    return this.video_;
  }

  /**
   * @return {shaka.net.NetworkingEngine} A reference to the Player's networking
   *     engine.  Applications may use this to make requests through Shaka's
   *     networking plugins.
   * @export
   */
  getNetworkingEngine() {
    return this.networkingEngine_;
  }

  /**
   * Get the uri to the asset that the player has loaded. If the player has not
   * loaded content, this will return <code>null</code>.
   *
   * @return {?string}
   * @export
   */
  getAssetUri() {
    return this.assetUri_;
  }

  /**
   * Returns a shaka.ads.AdManager instance, responsible for Dynamic
   * Ad Insertion functionality.
   *
   * @return {shaka.extern.IAdManager}
   * @export
   */
  getAdManager() {
    // NOTE: this clause is redundant, but it keeps the compiler from
    // inlining this function. Inlining leads to setting the adManager
    // not taking effect in the compiled build.
    // Closure has a @noinline flag, but apparently not all cases are
    // supported by it, and ours isn't.
    // If they expand support, we might be able to get rid of this
    // clause.
    if (!this.adManager_) {
      return null;
    }

    return this.adManager_;
  }

  /**
   * Get if the player is playing live content. If the player has not loaded
   * content, this will return <code>false</code>.
   *
   * @return {boolean}
   * @export
   */
  isLive() {
    if (this.manifest_) {
      return this.manifest_.presentationTimeline.isLive();
    }

    // For native HLS, the duration for live streams seems to be Infinity.
    if (this.video_ && this.video_.src) {
      return this.video_.duration == Infinity;
    }

    return false;
  }

  /**
   * Get if the player is playing in-progress content. If the player has not
   * loaded content, this will return <code>false</code>.
   *
   * @return {boolean}
   * @export
   */
  isInProgress() {
    return this.manifest_ ?
           this.manifest_.presentationTimeline.isInProgress() :
           false;
  }

  /**
   * Check if the manifest contains only audio-only content. If the player has
   * not loaded content, this will return <code>false</code>.
   *
   * <p>
   * The player does not support content that contain more than one type of
   * variants (i.e. mixing audio-only, video-only, audio-video). Content will be
   * filtered to only contain one type of variant.
   *
   * @return {boolean}
   * @export
   */
  isAudioOnly() {
    if (this.manifest_) {
      const variants = this.manifest_.variants;
      if (!variants.length) {
        return false;
      }

      // Note that if there are some audio-only variants and some audio-video
      // variants, the audio-only variants are removed during filtering.
      // Therefore if the first variant has no video, that's sufficient to say
      // it is audio-only content.
      return !variants[0].video;
    } else if (this.video_ && this.video_.src) {
      // If we have video track info, use that.  It will be the least
      // error-prone way with native HLS.  In contrast, videoHeight might be
      // unset until the first frame is loaded.  Since isAudioOnly is queried
      // by the UI on the 'trackschanged' event, the videoTracks info should be
      // up-to-date.
      if (this.video_.videoTracks) {
        return this.video_.videoTracks.length == 0;
      }

      // We cast to the more specific HTMLVideoElement to access videoHeight.
      // This might be an audio element, though, in which case videoHeight will
      // be undefined at runtime.  For audio elements, this will always return
      // true.
      const video = /** @type {HTMLVideoElement} */(this.video_);
      return video.videoHeight == 0;
    } else {
      return false;
    }
  }

  /**
   * Return the value of lowLatencyMode configuration.
   * @return {boolean}
   * @private
   */
  isLowLatencyMode_() {
    return this.config_.streaming.lowLatencyMode;
  }

  /**
   * Return the value of autoLowLatencyMode configuration.
   * @return {boolean}
   * @private
   */
  isAutoLowLatencyMode_() {
    return this.config_.streaming.autoLowLatencyMode;
  }

  /**
   * Get the range of time (in seconds) that seeking is allowed. If the player
   * has not loaded content, this will return a range from 0 to 0.
   *
   * @return {{start: number, end: number}}
   * @export
   */
  seekRange() {
    if (this.manifest_) {
      const timeline = this.manifest_.presentationTimeline;

      return {
        'start': timeline.getSeekRangeStart(),
        'end': timeline.getSeekRangeEnd(),
      };
    }

    // If we have loaded content with src=, we ask the video element for its
    // seekable range.  This covers both plain mp4s and native HLS playbacks.
    if (this.video_ && this.video_.src) {
      const seekable = this.video_.seekable;
      if (seekable.length) {
        return {
          'start': seekable.start(0),
          'end': seekable.end(seekable.length - 1),
        };
      }
    }

    return {'start': 0, 'end': 0};
  }

  /**
   * Get the key system currently used by EME. If EME is not being used, this
   * will return an empty string. If the player has not loaded content, this
   * will return an empty string.
   *
   * @return {string}
   * @export
   */
  keySystem() {
    return shaka.media.DrmEngine.keySystem(this.drmInfo());
  }

  /**
   * Get the drm info used to initialize EME. If EME is not being used, this
   * will return <code>null</code>. If the player is idle or has not initialized
   * EME yet, this will return <code>null</code>.
   *
   * @return {?shaka.extern.DrmInfo}
   * @export
   */
  drmInfo() {
    return this.drmEngine_ ? this.drmEngine_.getDrmInfo() : null;
  }

  /**
   * Get the next known expiration time for any EME session. If the session
   * never expires, this will return <code>Infinity</code>. If there are no EME
   * sessions, this will return <code>Infinity</code>. If the player has not
   * loaded content, this will return <code>Infinity</code>.
   *
   * @return {number}
   * @export
   */
  getExpiration() {
    return this.drmEngine_ ? this.drmEngine_.getExpiration() : Infinity;
  }

  /**
   * Gets a map of EME key ID to the current key status.
   *
   * @return {!Object<string, string>}
   * @export
   */
  getKeyStatuses() {
    return this.drmEngine_ ? this.drmEngine_.getKeyStatuses() : {};
  }

  /**
   * Check if the player is currently in a buffering state (has too little
   * content to play smoothly). If the player has not loaded content, this will
   * return <code>false</code>.
   *
   * @return {boolean}
   * @export
   */
  isBuffering() {
    const State = shaka.media.BufferingObserver.State;
    return this.bufferObserver_ ?
           this.bufferObserver_.getState() == State.STARVING :
           false;
  }

  /**
   * Get the playback rate of what is playing right now. If we are using trick
   * play, this will return the trick play rate.
   * If no content is playing, this will return 0.
   * If content is buffering, this will return the expected playback rate once
   * the video starts playing.
   *
   * <p>
   * If the player has not loaded content, this will return a playback rate of
   * 0.
   *
   * @return {number}
   * @export
   */
  getPlaybackRate() {
    if (!this.video_) {
      return 0;
    }
    return this.playRateController_ ?
           this.playRateController_.getRealRate() :
           1;
  }

  /**
   * Enable trick play to skip through content without playing by repeatedly
   * seeking. For example, a rate of 2.5 would result in 2.5 seconds of content
   * being skipped every second. A negative rate will result in moving
   * backwards.
   *
   * <p>
   * If the player has not loaded content or is still loading content this will
   * be a no-op. Wait until <code>load</code> has completed before calling.
   *
   * <p>
   * Trick play will be canceled automatically if the playhead hits the
   * beginning or end of the seekable range for the content.
   *
   * @param {number} rate
   * @export
   */
  trickPlay(rate) {
    // A playbackRate of 0 is used internally when we are in a buffering state,
    // and doesn't make sense for trick play.  If you set a rate of 0 for trick
    // play, we will reject it and issue a warning.  If it happens during a
    // test, we will fail the test through this assertion.
    goog.asserts.assert(rate != 0, 'Should never set a trick play rate of 0!');
    if (rate == 0) {
      shaka.log.alwaysWarn('A trick play rate of 0 is unsupported!');
      return;
    }

    if (this.video_.paused) {
      // Our fast forward is implemented with playbackRate and needs the video
      // to be playing (to not be paused) to take immediate effect.
      // If the video is paused, "unpause" it.
      this.video_.play();
    }
    this.playRateController_.set(rate);

    if (this.loadMode_ == shaka.Player.LoadMode.MEDIA_SOURCE) {
      this.abrManager_.playbackRateChanged(rate);
      this.streamingEngine_.setTrickPlay(Math.abs(rate) > 1);
    }
  }

  /**
   * Cancel trick-play. If the player has not loaded content or is still loading
   * content this will be a no-op.
   *
   * @export
   */
  cancelTrickPlay() {
    const defaultPlaybackRate = this.playRateController_.getDefaultRate();
    if (this.loadMode_ == shaka.Player.LoadMode.SRC_EQUALS) {
      this.playRateController_.set(defaultPlaybackRate);
    }

    if (this.loadMode_ == shaka.Player.LoadMode.MEDIA_SOURCE) {
      this.playRateController_.set(defaultPlaybackRate);
      this.abrManager_.playbackRateChanged(defaultPlaybackRate);
      this.streamingEngine_.setTrickPlay(false);
    }
  }

  /**
   * Return a list of variant tracks that can be switched to.
   *
   * <p>
   * If the player has not loaded content, this will return an empty list.
   *
   * @return {!Array.<shaka.extern.Track>}
   * @export
   */
  getVariantTracks() {
    if (this.manifest_) {
      const currentVariant = this.streamingEngine_ ?
          this.streamingEngine_.getCurrentVariant() : null;

      const tracks = [];

      // Convert each variant to a track.
      for (const variant of this.manifest_.variants) {
        if (!shaka.util.StreamUtils.isPlayable(variant)) {
          continue;
        }

        const track = shaka.util.StreamUtils.variantToTrack(variant);
        track.active = variant == currentVariant;

        tracks.push(track);
      }

      return tracks;
    } else if (this.video_ && this.video_.audioTracks) {
      // Safari's native HLS always shows a single element in videoTracks.
      // You can't use that API to change resolutions.  But we can use
      // audioTracks to generate a variant list that is usable for changing
      // languages.
      const audioTracks = Array.from(this.video_.audioTracks);
      return audioTracks.map((audio) =>
        shaka.util.StreamUtils.html5AudioTrackToTrack(audio));
    } else {
      return [];
    }
  }

  /**
   * Return a list of text tracks that can be switched to.
   *
   * <p>
   * If the player has not loaded content, this will return an empty list.
   *
   * @return {!Array.<shaka.extern.Track>}
   * @export
   */
  getTextTracks() {
    if (this.manifest_) {
      const currentTextStream = this.streamingEngine_ ?
          this.streamingEngine_.getCurrentTextStream() : null;
      const tracks = [];

      // Convert all selectable text streams to tracks.
      for (const text of this.manifest_.textStreams) {
        const track = shaka.util.StreamUtils.textStreamToTrack(text);
        track.active = text == currentTextStream;

        tracks.push(track);
      }

      return tracks;
    } else if (this.video_ && this.video_.src && this.video_.textTracks) {
      const textTracks = this.getFilteredTextTracks_();
      const StreamUtils = shaka.util.StreamUtils;
      return textTracks.map((text) => StreamUtils.html5TextTrackToTrack(text));
    } else {
      return [];
    }
  }

  /**
   * Return a list of image tracks that can be switched to.
   *
   * If the player has not loaded content, this will return an empty list.
   *
   * @return {!Array.<shaka.extern.Track>}
   * @export
   */
  getImageTracks() {
    if (this.manifest_) {
      const imageStreams = this.manifest_.imageStreams;
      const StreamUtils = shaka.util.StreamUtils;
      return imageStreams.map((image) => StreamUtils.imageStreamToTrack(image));
    } else {
      return [];
    }
  }

  /**
   * Return a Thumbnail object from a image track Id and time.
   *
   * If the player has not loaded content, this will return a null.
   *
   * @param {number} trackId
   * @param {number} time
   * @return {!Promise.<?shaka.extern.Thumbnail>}
   * @export
   */
  async getThumbnails(trackId, time) {
    if (this.manifest_) {
      const imageStream = this.manifest_.imageStreams.find(
          (stream) => stream.id == trackId);
      if (!imageStream) {
        return null;
      }
      if (!imageStream.segmentIndex) {
        await imageStream.createSegmentIndex();
      }
      const referencePosition = imageStream.segmentIndex.find(time);
      if (referencePosition == null) {
        return null;
      }
      const reference = imageStream.segmentIndex.get(referencePosition);
      // This expression is used to detect one or more numbers (0-9) followed
      // by an x and after one or more numbers (0-9)
      const match = /(\d+)x(\d+)/.exec(imageStream.tilesLayout);
      if (!match) {
        shaka.log.warning('Tiles layout does not contain a valid format ' +
            ' (columns x rows)');
        return null;
      }
      const fullImageWidth = imageStream.width || 0;
      const fullImageHeight = imageStream.height || 0;
      const columns = parseInt(match[1], 10);
      const rows = parseInt(match[2], 10);
      const width = fullImageWidth / columns;
      const height = fullImageHeight / rows;
      let positionX = 0;
      let positionY = 0;
      const totalImages = columns * rows;
      // If the number of images in the segment is greater than 1, we have to
      // find the correct image. For that we will return to the app the
      // coordinates of the position of the correct image.
      // Image search is always from left to right and top to bottom.
      // Note: The time between images within the segment is always
      // equidistant.
      //
      // Eg: Total images 5, tileLayout 5x1, segmentTime 5, thumbnailTime 2
      // positionX = 0.4 * fullImageWidth
      // positionY = 0
      if (totalImages > 1) {
        const thumbnailTime = time - reference.startTime;
        const segmentTime = reference.endTime - reference.startTime;
        const thumbnailPosition =
            Math.floor(thumbnailTime * totalImages / segmentTime);
        positionX = (thumbnailPosition % columns) / columns * fullImageWidth;
        positionY = (thumbnailPosition % rows) / rows * fullImageHeight;
      }
      return {
        height: height,
        positionX: positionX,
        positionY: positionY,
        uris: reference.getUris(),
        width: width,
      };
    }
    return null;
  }

  /**
   * Select a specific text track. <code>track</code> should come from a call to
   * <code>getTextTracks</code>. If the track is not found, this will be a
   * no-op. If the player has not loaded content, this will be a no-op.
   *
   * <p>
   * Note that <code>AdaptationEvents</code> are not fired for manual track
   * selections.
   *
   * @param {shaka.extern.Track} track
   * @export
   */
  selectTextTrack(track) {
    if (this.manifest_ && this.streamingEngine_) {
      const stream = this.manifest_.textStreams.find(
          (stream) => stream.id == track.id);

      if (!stream) {
        shaka.log.error('No stream with id', track.id);
        return;
      }

      if (stream == this.streamingEngine_.getCurrentTextStream()) {
        shaka.log.debug('Text track already selected.');
        return;
      }

      // Add entries to the history.
      this.addTextStreamToSwitchHistory_(stream, /* fromAdaptation= */ false);
      this.streamingEngine_.switchTextStream(stream);
      this.onTextChanged_();

      // Workaround for https://github.com/google/shaka-player/issues/1299
      // When track is selected, back-propagate the language to
      // currentTextLanguage_.
      this.currentTextLanguage_ = stream.language;
    } else if (this.video_ && this.video_.src && this.video_.textTracks) {
      const textTracks = this.getFilteredTextTracks_();
      for (const textTrack of textTracks) {
        if (shaka.util.StreamUtils.html5TrackId(textTrack) == track.id) {
          // Leave the track in 'hidden' if it's selected but not showing.
          textTrack.mode = this.isTextVisible_ ? 'showing' : 'hidden';
        } else {
          // Safari allows multiple text tracks to have mode == 'showing', so be
          // explicit in resetting the others.
          textTrack.mode = 'disabled';
        }
      }
      this.onTextChanged_();
    }
  }

  /**
   * Select a specific variant track to play.  <code>track</code> should come
   * from a call to <code>getVariantTracks</code>. If <code>track</code> cannot
   * be found, this will be a no-op. If the player has not loaded content, this
   * will be a no-op.
   *
   * <p>
   * Changing variants will take effect once the currently buffered content has
   * been played. To force the change to happen sooner, use
   * <code>clearBuffer</code> with <code>safeMargin</code>. Setting
   * <code>clearBuffer</code> to <code>true</code> will clear all buffered
   * content after <code>safeMargin</code>, allowing the new variant to start
   * playing sooner.
   *
   * <p>
   * Note that <code>AdaptationEvents</code> are not fired for manual track
   * selections.
   *
   * @param {shaka.extern.Track} track
   * @param {boolean=} clearBuffer
   * @param {number=} safeMargin Optional amount of buffer (in seconds) to
   *   retain when clearing the buffer. Useful for switching variant quickly
   *   without causing a buffering event. Defaults to 0 if not provided. Ignored
   *   if clearBuffer is false. Can cause hiccups on some browsers if chosen too
   *   small, e.g. The amount of two segments is a fair minimum to consider as
   *   safeMargin value.
   * @export
   */
  selectVariantTrack(track, clearBuffer = false, safeMargin = 0) {
    if (this.manifest_ && this.streamingEngine_) {
      if (this.config_.abr.enabled) {
        shaka.log.alwaysWarn('Changing tracks while abr manager is enabled ' +
                             'will likely result in the selected track ' +
                             'being overriden. Consider disabling abr before ' +
                             'calling selectVariantTrack().');
      }

      const variant = this.manifest_.variants.find(
          (variant) => variant.id == track.id);
      if (!variant) {
        shaka.log.error('No variant with id', track.id);
        return;
      }

      // Double check that the track is allowed to be played. The track list
      // should only contain playable variants, but if restrictions change and
      // |selectVariantTrack| is called before the track list is updated, we
      // could get a now-restricted variant.
      if (!shaka.util.StreamUtils.isPlayable(variant)) {
        shaka.log.error('Unable to switch to restricted track', track.id);
        return;
      }

      this.switchVariant_(variant, /* fromAdaptation= */ false, clearBuffer,
          safeMargin);

      // Workaround for https://github.com/google/shaka-player/issues/1299
      // When track is selected, back-propagate the language to
      // currentAudioLanguage_.
      this.currentAdaptationSetCriteria_ = new shaka.media.ExampleBasedCriteria(
          variant);

      // Update AbrManager variants to match these new settings.
      this.updateAbrManagerVariants_();
    } else if (this.video_ && this.video_.audioTracks) {
      // Safari's native HLS won't let you choose an explicit variant, though
      // you can choose audio languages this way.
      const audioTracks = Array.from(this.video_.audioTracks);
      for (const audioTrack of audioTracks) {
        if (shaka.util.StreamUtils.html5TrackId(audioTrack) == track.id) {
          // This will reset the "enabled" of other tracks to false.
          this.switchHtml5Track_(audioTrack);
          return;
        }
      }
    }
  }

  /**
   * Return a list of audio language-role combinations available.  If the
   * player has not loaded any content, this will return an empty list.
   *
   * @return {!Array.<shaka.extern.LanguageRole>}
   * @export
   */
  getAudioLanguagesAndRoles() {
    return shaka.Player.getLanguageAndRolesFrom_(this.getVariantTracks());
  }

  /**
   * Return a list of text language-role combinations available.  If the player
   * has not loaded any content, this will be return an empty list.
   *
   * @return {!Array.<shaka.extern.LanguageRole>}
   * @export
   */
  getTextLanguagesAndRoles() {
    return shaka.Player.getLanguageAndRolesFrom_(this.getTextTracks());
  }

  /**
   * Return a list of audio languages available. If the player has not loaded
   * any content, this will return an empty list.
   *
   * @return {!Array.<string>}
   * @export
   */
  getAudioLanguages() {
    return Array.from(shaka.Player.getLanguagesFrom_(this.getVariantTracks()));
  }

  /**
   * Return a list of text languages available. If the player has not loaded
   * any content, this will return an empty list.
   *
   * @return {!Array.<string>}
   * @export
   */
  getTextLanguages() {
    return Array.from(shaka.Player.getLanguagesFrom_(this.getTextTracks()));
  }

  /**
   * Sets the current audio language and current variant role to the selected
   * language and role, and chooses a new variant if need be. If the player has
   * not loaded any content, this will be a no-op.
   *
   * @param {string} language
   * @param {string=} role
   * @export
   */
  selectAudioLanguage(language, role) {
    const LanguageUtils = shaka.util.LanguageUtils;

    if (this.manifest_ && this.playhead_) {
      this.currentAdaptationSetCriteria_ =
          new shaka.media.PreferenceBasedCriteria(language, role || '',
          /* channelCount= */ 0, /* label= */ '');

      if (!this.config_.abr.enabled) {
        const diff = (a, b) => {
          if (!a.video && !b.video) {
            return 0;
          } else if (!a.video || !b.video) {
            return Infinity;
          } else {
            return Math.abs((a.video.height || 0) - (b.video.height || 0)) +
                Math.abs((a.video.width || 0) - (b.video.width || 0));
          }
        };
        // Find the variant whose size is closest to the active variant.  This
        // ensures we stay at about the same resolution when just changing the
        // language/role.
        const active = this.streamingEngine_.getCurrentVariant();
        const set =
            this.currentAdaptationSetCriteria_.create(this.manifest_.variants);
        let bestVariant = null;
        for (const curVariant of set.values()) {
          if (!bestVariant ||
              diff(bestVariant, active) > diff(curVariant, active)) {
            bestVariant = curVariant;
          }
        }
        if (bestVariant) {
          const track = shaka.util.StreamUtils.variantToTrack(bestVariant);
          this.selectVariantTrack(track, /* clearBuffer= */ true);
          return;
        }
      }

      // If we haven't switched yet, just use ABR to find a new track.
      this.chooseVariantAndSwitch_();
    } else if (this.video_ && this.video_.audioTracks) {
      const audioTracks = Array.from(this.video_.audioTracks);
      const selectedLanguage = LanguageUtils.normalize(language);

      let languageMatch = null;
      let languageAndRoleMatch = null;

      for (const audioTrack of audioTracks) {
        const track = shaka.util.StreamUtils.html5AudioTrackToTrack(audioTrack);

        if (LanguageUtils.normalize(track.language) == selectedLanguage) {
          languageMatch = audioTrack;

          if (role) {
            if (track.roles.includes(role)) {
              languageAndRoleMatch = audioTrack;
            }
          } else {  // no role
            if (track.roles.length == 0) {
              languageAndRoleMatch = audioTrack;
            }
          }
        }
      }
      if (languageAndRoleMatch) {
        this.switchHtml5Track_(languageAndRoleMatch);
      } else if (languageMatch) {
        this.switchHtml5Track_(languageMatch);
      }
    }
  }

  /**
   * Sets the current text language and current text role to the selected
   * language and role, and chooses a new variant if need be. If the player has
   * not loaded any content, this will be a no-op.
   *
   * @param {string} language
   * @param {string=} role
   * @param {boolean=} forced
   * @export
   */
  selectTextLanguage(language, role, forced = false) {
    const LanguageUtils = shaka.util.LanguageUtils;

    if (this.manifest_ && this.playhead_) {
      this.currentTextLanguage_ = language;
      this.currentTextRole_ = role || '';
      this.currentTextForced_ = forced;

      const chosenText = this.chooseTextStream_();
      if (chosenText) {
        if (chosenText == this.streamingEngine_.getCurrentTextStream()) {
          shaka.log.debug('Text track already selected.');
          return;
        }

        this.addTextStreamToSwitchHistory_(
            chosenText, /* fromAdaptation= */ false);
        if (this.shouldStreamText_()) {
          this.streamingEngine_.switchTextStream(chosenText);
          this.onTextChanged_();
        }
      }
    } else {
      const selectedLanguage = LanguageUtils.normalize(language);

      const track = this.getTextTracks().find((t) => {
        return LanguageUtils.normalize(t.language) == selectedLanguage &&
          (!role || t.roles.includes(role)) && t.forced == forced;
      });

      if (track) {
        this.selectTextTrack(track);
      }
    }
  }

  /**
   * Select variant tracks that have a given label. This assumes the
   * label uniquely identifies an audio stream, so all the variants
   * are expected to have the same variant.audio.
   *
   * @param {string} label
   * @export
   */
  selectVariantsByLabel(label) {
    if (this.manifest_ && this.playhead_) {
      let firstVariantWithLabel = null;
      for (const variant of this.manifest_.variants) {
        if (variant.audio.label == label) {
          firstVariantWithLabel = variant;
          break;
        }
      }

      if (firstVariantWithLabel == null) {
        shaka.log.warning('No variants were found with label: ' +
            label + '. Ignoring the request to switch.');

        return;
      }

      // Label is a unique identifier of a variant's audio stream.
      // Because of that we assume that all the variants with the same
      // label have the same language.
      this.currentAdaptationSetCriteria_ =
          new shaka.media.PreferenceBasedCriteria(
              firstVariantWithLabel.language, '', 0, label);

      this.chooseVariantAndSwitch_();
    }
  }

  /**
   * Check if the text displayer is enabled.
   *
   * @return {boolean}
   * @export
   */
  isTextTrackVisible() {
    const expected = this.isTextVisible_;

    if (this.mediaSourceEngine_) {
      // Make sure our values are still in-sync.
      const actual = this.mediaSourceEngine_.getTextDisplayer().isTextVisible();
      goog.asserts.assert(
          actual == expected, 'text visibility has fallen out of sync');

      // Always return the actual value so that the app has the most accurate
      // information (in the case that the values come out of sync in prod).
      return actual;
    } else if (this.video_ && this.video_.src && this.video_.textTracks) {
      const textTracks = this.getFilteredTextTracks_();
      return textTracks.some((t) => t.mode == 'showing');
    }

    return expected;
  }

  /**
   * Ignore the TextTracks with the 'metadata' or 'chapters' kind, or the one
   * generated by the SimpleTextDisplayer.
   *
   * @return {!Array.<TextTrack>}
   * @private
   */
  getFilteredTextTracks_() {
    goog.asserts.assert(this.video_.textTracks,
        'TextTracks should be valid.');
    return Array.from(this.video_.textTracks)
        .filter((t) => t.kind != 'metadata' && t.kind != 'chapters' &&
                       t.label != shaka.Player.TextTrackLabel);
  }

  /**
   * Get the TextTracks with the 'metadata' kind.
   *
   * @return {!Array.<TextTrack>}
   * @private
   */
  getMetadataTracks_() {
    goog.asserts.assert(this.video_.textTracks,
        'TextTracks should be valid.');
    return Array.from(this.video_.textTracks)
        .filter((t) => t.kind == 'metadata');
  }

  /**
   * Enable or disable the text displayer.  If the player is in an unloaded
   * state, the request will be applied next time content is loaded.
   *
   * @param {boolean} isVisible
   * @export
   */
  setTextTrackVisibility(isVisible) {
    const oldVisibilty = this.isTextVisible_;
    // Convert to boolean in case apps pass 0/1 instead false/true.
    const newVisibility = !!isVisible;

    if (oldVisibilty == newVisibility) {
      return;
    }

    this.isTextVisible_ = newVisibility;

    // Hold of on setting the text visibility until we have all the components
    // we need. This ensures that they stay in-sync.
    if (this.loadMode_ == shaka.Player.LoadMode.MEDIA_SOURCE) {
      this.mediaSourceEngine_.getTextDisplayer()
          .setTextVisibility(newVisibility);

      // When the user wants to see captions, we stream captions. When the user
      // doesn't want to see captions, we don't stream captions. This is to
      // avoid bandwidth consumption by an unused resource. The app developer
      // can override this and configure us to always stream captions.
      if (!this.config_.streaming.alwaysStreamText) {
        if (newVisibility) {
          if (this.streamingEngine_.getCurrentTextStream()) {
            // We already have a selected text stream.
          } else {
            // Find the text stream that best matches the user's preferences.
            const streams =
                shaka.util.StreamUtils.filterStreamsByLanguageAndRole(
                    this.manifest_.textStreams,
                    this.currentTextLanguage_,
                    this.currentTextRole_,
                    this.currentTextForced_);

            // It is possible that there are no streams to play.
            if (streams.length > 0) {
              this.streamingEngine_.switchTextStream(streams[0]);
              this.onTextChanged_();
            }
          }
        } else {
          this.streamingEngine_.unloadTextStream();
        }
      }
    } else if (this.video_ && this.video_.src && this.video_.textTracks) {
      const textTracks = this.getFilteredTextTracks_();
      // Find the active track by looking for one which is not disabled.  This
      // is the only way to identify the track which is currently displayed.
      // Set it to 'showing' or 'hidden' based on newVisibility.
      for (const textTrack of textTracks) {
        if (textTrack.mode != 'disabled') {
          textTrack.mode = newVisibility ? 'showing' : 'hidden';
        }
      }
    }

    // We need to fire the event after we have updated everything so that
    // everything will be in a stable state when the app responds to the
    // event.
    this.onTextTrackVisibility_();
  }

  /**
   * Get the current playhead position as a date. This should only be called
   * when the player has loaded a live stream. If the player has not loaded a
   * live stream, this will return <code>null</code>.
   *
   * @return {Date}
   * @export
   */
  getPlayheadTimeAsDate() {
    if (!this.isLive()) {
      shaka.log.warning('getPlayheadTimeAsDate is for live streams!');
      return null;
    }

    const walkerPayload = this.walker_.getCurrentPayload();

    let presentationTime = 0;
    if (this.playhead_) {
      presentationTime = this.playhead_.getTime();
    } else if (walkerPayload) {
      if (walkerPayload.startTime == null) {
        // A live stream with no requested start time and no playhead yet.  We
        // would start at the live edge, but we don't have that yet, so return
        // the current date & time.
        return new Date();
      } else {
        // A specific start time has been requested.  This is what Playhead will
        // use once it is created.
        presentationTime = walkerPayload.startTime;
      }
    }

    if (this.manifest_) {
      const timeline = this.manifest_.presentationTimeline;
      const startTime = timeline.getPresentationStartTime();
      return new Date(/* ms= */ (startTime + presentationTime) * 1000);
    } else if (this.video_ && this.video_.getStartDate) {
      // Apple's native HLS gives us getStartDate(), which is only available if
      // EXT-X-PROGRAM-DATETIME is in the playlist.
      const startDate = this.video_.getStartDate();
      if (isNaN(startDate.getTime())) {
        shaka.log.warning(
            'EXT-X-PROGRAM-DATETIME required to get playhead time as Date!');
        return null;
      }
      return new Date(startDate.getTime() + (presentationTime * 1000));
    } else {
      shaka.log.warning('No way to get playhead time as Date!');
      return null;
    }
  }

  /**
   * Get the presentation start time as a date. This should only be called when
   * the player has loaded a live stream. If the player has not loaded a live
   * stream, this will return <code>null</code>.
   *
   * @return {Date}
   * @export
   */
  getPresentationStartTimeAsDate() {
    if (!this.isLive()) {
      shaka.log.warning('getPresentationStartTimeAsDate is for live streams!');
      return null;
    }

    if (this.manifest_) {
      const timeline = this.manifest_.presentationTimeline;
      const startTime = timeline.getPresentationStartTime();
      goog.asserts.assert(startTime != null,
          'Presentation start time should not be null!');
      return new Date(/* ms= */ startTime * 1000);
    } else if (this.video_ && this.video_.getStartDate) {
      // Apple's native HLS gives us getStartDate(), which is only available if
      // EXT-X-PROGRAM-DATETIME is in the playlist.
      const startDate = this.video_.getStartDate();
      if (isNaN(startDate.getTime())) {
        shaka.log.warning(
            'EXT-X-PROGRAM-DATETIME required to get presentation start time ' +
            'as Date!');
        return null;
      }
      return startDate;
    } else {
      shaka.log.warning('No way to get presentation start time as Date!');
      return null;
    }
  }

  /**
   * Get information about what the player has buffered. If the player has not
   * loaded content or is currently loading content, the buffered content will
   * be empty.
   *
   * @return {shaka.extern.BufferedInfo}
   * @export
   */
  getBufferedInfo() {
    if (this.loadMode_ == shaka.Player.LoadMode.MEDIA_SOURCE) {
      return this.mediaSourceEngine_.getBufferedInfo();
    }

    const info = {
      total: [],
      audio: [],
      video: [],
      text: [],
    };

    if (this.loadMode_ == shaka.Player.LoadMode.SRC_EQUALS) {
      const TimeRangesUtils = shaka.media.TimeRangesUtils;
      info.total = TimeRangesUtils.getBufferedInfo(this.video_.buffered);
    }

    return info;
  }

  /**
   * Get statistics for the current playback session. If the player is not
   * playing content, this will return an empty stats object.
   *
   * @return {shaka.extern.Stats}
   * @export
   */
  getStats() {
    // If the Player is not in a fully-loaded state, then return an empty stats
    // blob so that this call will never fail.
    const loaded = this.loadMode_ == shaka.Player.LoadMode.MEDIA_SOURCE ||
                   this.loadMode_ == shaka.Player.LoadMode.SRC_EQUALS;
    if (!loaded) {
      return shaka.util.Stats.getEmptyBlob();
    }

    this.updateStateHistory_();

    goog.asserts.assert(this.video_, 'If we have stats, we should have video_');
    const element = /** @type {!HTMLVideoElement} */ (this.video_);

    const completionRatio = element.currentTime / element.duration;
    if (!isNaN(completionRatio)) {
      this.stats_.setCompletionPercent(Math.round(100 * completionRatio));
    }

    if (element.getVideoPlaybackQuality) {
      const info = element.getVideoPlaybackQuality();

      this.stats_.setDroppedFrames(
          Number(info.droppedVideoFrames),
          Number(info.totalVideoFrames));
      this.stats_.setCorruptedFrames(Number(info.corruptedVideoFrames));
    }

    const licenseSeconds =
        this.drmEngine_ ? this.drmEngine_.getLicenseTime() : NaN;
    this.stats_.setLicenseTime(licenseSeconds);

    if (this.loadMode_ == shaka.Player.LoadMode.MEDIA_SOURCE) {
      // Event through we are loaded, it is still possible that we don't have a
      // variant yet because we set the load mode before we select the first
      // variant to stream.
      const variant = this.streamingEngine_.getCurrentVariant();

      if (variant) {
        const rate = this.playRateController_ ?
           this.playRateController_.getRealRate() : 1;
        const variantBandwidth = rate * variant.bandwidth;
        // TODO: Should include text bandwidth if it enabled.
        const currentStreamBandwidth = variantBandwidth;
        this.stats_.setCurrentStreamBandwidth(currentStreamBandwidth);
      }

      if (variant && variant.video) {
        this.stats_.setResolution(
            /* width= */ variant.video.width || NaN,
            /* height= */ variant.video.height || NaN);
      }

      if (this.isLive()) {
        const now = this.getPresentationStartTimeAsDate().valueOf() +
            this.seekRange().end * 1000;
        const latency = (Date.now() - now) / 1000;
        this.stats_.setLiveLatency(latency);
      }

      if (this.manifest_ && this.manifest_.presentationTimeline) {
        const maxSegmentDuration =
            this.manifest_.presentationTimeline.getMaxSegmentDuration();
        this.stats_.setMaxSegmentDuration(maxSegmentDuration);
      }

      const estimate = this.abrManager_.getBandwidthEstimate();
      this.stats_.setBandwidthEstimate(estimate);
    }

    return this.stats_.getBlob();
  }

  /**
   * Adds the given text track to the loaded manifest.  <code>load()</code> must
   * resolve before calling.  The presentation must have a duration.
   *
   * This returns the created track, which can immediately be selected by the
   * application.  The track will not be automatically selected.
   *
   * @param {string} uri
   * @param {string} language
   * @param {string} kind
   * @param {string=} mimeType
   * @param {string=} codec
   * @param {string=} label
   * @param {boolean=} forced
   * @return {shaka.extern.Track}
   * @export
   */
  addTextTrack(uri, language, kind, mimeType, codec, label, forced = false) {
    shaka.Deprecate.deprecateFeature(4,
        'addTextTrack',
        'Please use an addTextTrackAsync.');
    if (this.loadMode_ != shaka.Player.LoadMode.MEDIA_SOURCE &&
        this.loadMode_ != shaka.Player.LoadMode.SRC_EQUALS) {
      shaka.log.error(
          'Must call load() and wait for it to resolve before adding text ' +
          'tracks.');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.CONTENT_NOT_LOADED);
    }

    if (!mimeType) {
      // Try using the uri extension.
      const extension = shaka.media.ManifestParser.getExtension(uri);
      mimeType = {
        'sbv': 'text/x-subviewer',
        'srt': 'text/srt',
        'vtt': 'text/vtt',
        'webvtt': 'text/vtt',
        'ttml': 'application/ttml+xml',
        'lrc': 'application/x-subtitle-lrc',
        'ssa': 'text/x-ssa',
        'ass': 'text/x-ssa',
      }[extension];

      if (!mimeType) {
        shaka.log.error(
            'The mimeType has not been provided and it could not be deduced ' +
            'from its extension.');
        throw new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.TEXT,
            shaka.util.Error.Code.TEXT_COULD_NOT_GUESS_MIME_TYPE,
            extension);
      }
    }

    if (this.loadMode_ == shaka.Player.LoadMode.SRC_EQUALS) {
      if (mimeType != 'text/vtt') {
        shaka.log.error('Only WebVTT is supported when using src=');
        throw new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.TEXT,
            shaka.util.Error.Code.TEXT_ONLY_WEBVTT_SRC_EQUALS,
            mimeType);
      }
      if (forced) {
        // See: https://github.com/whatwg/html/issues/4472
        kind = 'forced';
      }
      const trackElement =
        /** @type {!HTMLTrackElement} */(document.createElement('track'));
      trackElement.src = uri;
      trackElement.label = label || '';
      trackElement.kind = kind;
      trackElement.srclang = language;
      // Because we're pulling in the text track file via Javascript, the
      // same-origin policy applies. If you'd like to have a player served
      // from one domain, but the text track served from another, you'll
      // need to enable CORS in order to do so. In addition to enabling CORS
      // on the server serving the text tracks, you will need to add the
      // crossorigin attribute to the video element itself.
      if (!this.video_.getAttribute('crossorigin')) {
        this.video_.setAttribute('crossorigin', 'anonymous');
      }
      this.video_.appendChild(trackElement);
      const textTracks = this.getTextTracks();
      const srcTrack = textTracks.find((t) => {
        return t.language == language &&
            t.label == (label || '') &&
            t.kind == kind;
      });
      if (srcTrack) {
        this.onTracksChanged_();
        return srcTrack;
      }
      // This should not happen, but there are browser implementations that may
      // not support the Track element.
      shaka.log.error('Cannot add this text when loaded with src=');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.CANNOT_ADD_EXTERNAL_TEXT_TO_SRC_EQUALS);
    }

    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const duration = this.manifest_.presentationTimeline.getDuration();
    if (duration == Infinity) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.CANNOT_ADD_EXTERNAL_TEXT_TO_LIVE_STREAM);
    }

    /** @type {shaka.extern.Stream} */
    const stream = {
      id: this.nextExternalStreamId_++,
      originalId: null,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex: shaka.media.SegmentIndex.forSingleSegment(
          /* startTime= */ 0,
          /* duration= */ duration,
          /* uris= */ [uri]),
      mimeType: mimeType || '',
      codecs: codec || '',
      kind: kind,
      encrypted: false,
      drmInfos: [],
      keyIds: new Set(),
      language: language,
      label: label || null,
      type: ContentType.TEXT,
      primary: false,
      trickModeVideo: null,
      emsgSchemeIdUris: null,
      roles: [],
      forced: !!forced,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
    };

    const fullMimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, stream.codecs);
    const supported = shaka.text.TextEngine.isTypeSupported(fullMimeType);
    if (!supported) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.MISSING_TEXT_PLUGIN,
          mimeType);
    }

    this.manifest_.textStreams.push(stream);
    this.onTracksChanged_();
    return shaka.util.StreamUtils.textStreamToTrack(stream);
  }

  /**
   * Adds the given text track to the loaded manifest.  <code>load()</code> must
   * resolve before calling.  The presentation must have a duration.
   *
   * This returns the created track, which can immediately be selected by the
   * application.  The track will not be automatically selected.
   *
   * @param {string} uri
   * @param {string} language
   * @param {string} kind
   * @param {string=} mimeType
   * @param {string=} codec
   * @param {string=} label
   * @param {boolean=} forced
   * @return {!Promise.<shaka.extern.Track>}
   * @export
   */
  async addTextTrackAsync(uri, language, kind, mimeType, codec, label,
      forced = false) {
    if (this.loadMode_ != shaka.Player.LoadMode.MEDIA_SOURCE &&
        this.loadMode_ != shaka.Player.LoadMode.SRC_EQUALS) {
      shaka.log.error(
          'Must call load() and wait for it to resolve before adding text ' +
          'tracks.');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.CONTENT_NOT_LOADED);
    }

    if (!mimeType) {
      // Try using the uri extension.
      const extension = shaka.media.ManifestParser.getExtension(uri);
      mimeType = {
        'sbv': 'text/x-subviewer',
        'srt': 'text/srt',
        'vtt': 'text/vtt',
        'webvtt': 'text/vtt',
        'ttml': 'application/ttml+xml',
        'lrc': 'application/x-subtitle-lrc',
        'ssa': 'text/x-ssa',
        'ass': 'text/x-ssa',
      }[extension];

      if (!mimeType) {
        try {
          goog.asserts.assert(
              this.networkingEngine_, 'Need networking engine.');
          // eslint-disable-next-line require-atomic-updates
          mimeType = await shaka.media.ManifestParser.getMimeType(uri,
              this.networkingEngine_,
              this.config_.streaming.retryParameters);
        } catch (error) {}
      }

      if (!mimeType) {
        shaka.log.error(
            'The mimeType has not been provided and it could not be deduced ' +
            'from its extension.');
        throw new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.TEXT,
            shaka.util.Error.Code.TEXT_COULD_NOT_GUESS_MIME_TYPE,
            extension);
      }
    }

    if (this.loadMode_ == shaka.Player.LoadMode.SRC_EQUALS) {
      if (mimeType != 'text/vtt') {
        goog.asserts.assert(
            this.networkingEngine_, 'Need networking engine.');
        const data = await this.getTextData_(uri,
            this.networkingEngine_,
            this.config_.streaming.retryParameters);
        const vvtText = this.convertToWebVTT_(data, mimeType);
        const blob = new Blob([vvtText], {type: 'text/vtt'});
        uri = shaka.media.MediaSourceEngine.createObjectURL(blob);
        mimeType = 'text/vtt';
      }
      if (forced) {
        // See: https://github.com/whatwg/html/issues/4472
        kind = 'forced';
      }
      const trackElement =
        /** @type {!HTMLTrackElement} */(document.createElement('track'));
      trackElement.src = uri;
      trackElement.label = label || '';
      trackElement.kind = kind;
      trackElement.srclang = language;
      // Because we're pulling in the text track file via Javascript, the
      // same-origin policy applies. If you'd like to have a player served
      // from one domain, but the text track served from another, you'll
      // need to enable CORS in order to do so. In addition to enabling CORS
      // on the server serving the text tracks, you will need to add the
      // crossorigin attribute to the video element itself.
      if (!this.video_.getAttribute('crossorigin')) {
        this.video_.setAttribute('crossorigin', 'anonymous');
      }
      this.video_.appendChild(trackElement);
      const textTracks = this.getTextTracks();
      const srcTrack = textTracks.find((t) => {
        return t.language == language &&
            t.label == (label || '') &&
            t.kind == kind;
      });
      if (srcTrack) {
        this.onTracksChanged_();
        return srcTrack;
      }
      // This should not happen, but there are browser implementations that may
      // not support the Track element.
      shaka.log.error('Cannot add this text when loaded with src=');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.CANNOT_ADD_EXTERNAL_TEXT_TO_SRC_EQUALS);
    }

    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const duration = this.manifest_.presentationTimeline.getDuration();
    if (duration == Infinity) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.CANNOT_ADD_EXTERNAL_TEXT_TO_LIVE_STREAM);
    }

    /** @type {shaka.extern.Stream} */
    const stream = {
      id: this.nextExternalStreamId_++,
      originalId: null,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex: shaka.media.SegmentIndex.forSingleSegment(
          /* startTime= */ 0,
          /* duration= */ duration,
          /* uris= */ [uri]),
      mimeType: mimeType || '',
      codecs: codec || '',
      kind: kind,
      encrypted: false,
      drmInfos: [],
      keyIds: new Set(),
      language: language,
      label: label || null,
      type: ContentType.TEXT,
      primary: false,
      trickModeVideo: null,
      emsgSchemeIdUris: null,
      roles: [],
      forced: !!forced,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
    };

    const fullMimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, stream.codecs);
    const supported = shaka.text.TextEngine.isTypeSupported(fullMimeType);
    if (!supported) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.MISSING_TEXT_PLUGIN,
          mimeType);
    }

    this.manifest_.textStreams.push(stream);
    this.onTracksChanged_();
    return shaka.util.StreamUtils.textStreamToTrack(stream);
  }

  /**
   * @param {string} uri
   * @param {!shaka.net.NetworkingEngine} netEngine
   * @param {shaka.extern.RetryParameters} retryParams
   * @return {!Promise.<BufferSource>}
   * @private
   */
  async getTextData_(uri, netEngine, retryParams) {
    const type = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    const request = shaka.net.NetworkingEngine.makeRequest([uri], retryParams);
    request.method = 'GET';

    const response = await netEngine.request(type, request).promise;

    return response.data;
  }


  /**
   * Converts an input string to a WebVTT format string.
   *
   * @param {BufferSource} buffer
   * @param {string} mimeType
   * @return {string}
   * @private
   */
  convertToWebVTT_(buffer, mimeType) {
    const factory = shaka.text.TextEngine.findParser(mimeType);
    if (factory) {
      const obj = factory();
      const time = {
        periodStart: 0,
        segmentStart: 0,
        segmentEnd: this.video_.duration,
      };
      const data = shaka.util.BufferUtils.toUint8(buffer);
      const cues = obj.parseMedia(data, time);
      return shaka.text.WebVttGenerator.convert(cues);
    }
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.MISSING_TEXT_PLUGIN,
        mimeType);
  }

  /**
   * Set the maximum resolution that the platform's hardware can handle.
   * This will be called automatically by <code>shaka.cast.CastReceiver</code>
   * to enforce limitations of the Chromecast hardware.
   *
   * @param {number} width
   * @param {number} height
   * @export
   */
  setMaxHardwareResolution(width, height) {
    this.maxHwRes_.width = width;
    this.maxHwRes_.height = height;
  }

  /**
   * Retry streaming after a streaming failure has occurred. When the player has
   * not loaded content or is loading content, this will be a no-op and will
   * return <code>false</code>.
   *
   * <p>
   * If the player has loaded content, and streaming has not seen an error, this
   * will return <code>false</code>.
   *
   * <p>
   * If the player has loaded content, and streaming seen an error, but the
   * could not resume streaming, this will return <code>false</code>.
   *
   * @return {boolean}
   * @export
   */
  retryStreaming() {
    return this.loadMode_ == shaka.Player.LoadMode.MEDIA_SOURCE ?
           this.streamingEngine_.retry() :
           false;
  }

  /**
   * Get the manifest that the player has loaded. If the player has not loaded
   * any content, this will return <code>null</code>.
   *
   * NOTE: This structure is NOT covered by semantic versioning compatibility
   * guarantees.  It may change at any time!
   *
   * This is marked as deprecated to warn Closure Compiler users at compile-time
   * to avoid using this method.
   *
   * @return {?shaka.extern.Manifest}
   * @export
   * @deprecated
   */
  getManifest() {
    shaka.log.alwaysWarn(
        'Shaka Player\'s internal Manifest structure is NOT covered by ' +
        'semantic versioning compatibility guarantees.  It may change at any ' +
        'time!  Please consider filing a feature request for whatever you ' +
        'use getManifest() for.');
    return this.manifest_;
  }

  /**
   * Get the type of manifest parser that the player is using. If the player has
   * not loaded any content, this will return <code>null</code>.
   *
   * @return {?shaka.extern.ManifestParser.Factory}
   * @export
   */
  getManifestParserFactory() {
    return this.parserFactory_;
  }

  /**
   * @param {shaka.extern.Variant} variant
   * @param {boolean} fromAdaptation
   * @private
   */
  addVariantToSwitchHistory_(variant, fromAdaptation) {
    const switchHistory = this.stats_.getSwitchHistory();
    switchHistory.updateCurrentVariant(variant, fromAdaptation);
  }

  /**
   * @param {shaka.extern.Stream} textStream
   * @param {boolean} fromAdaptation
   * @private
   */
  addTextStreamToSwitchHistory_(textStream, fromAdaptation) {
    const switchHistory = this.stats_.getSwitchHistory();
    switchHistory.updateCurrentText(textStream, fromAdaptation);
  }

  /**
   * @return {shaka.extern.PlayerConfiguration}
   * @private
   */
  defaultConfig_() {
    const config = shaka.util.PlayerConfiguration.createDefault();

    config.streaming.failureCallback = (error) => {
      this.defaultStreamingFailureCallback_(error);
    };

    // Because this.video_ may not be set when the config is built, the default
    // TextDisplay factory must capture a reference to "this".
    config.textDisplayFactory = () => {
      if (this.videoContainer_) {
        return new shaka.text.UITextDisplayer(
            this.video_, this.videoContainer_);
      } else {
        return new shaka.text.SimpleTextDisplayer(this.video_);
      }
    };
    return config;
  }

  /**
   * Set the videoContainer to construct UITextDisplayer.
   * @param {HTMLElement} videoContainer
   * @export
   */
  setVideoContainer(videoContainer) {
    this.videoContainer_ = videoContainer;
  }

  /**
   * @param {!shaka.util.Error} error
   * @private
   */
  defaultStreamingFailureCallback_(error) {
    const retryErrorCodes = [
      shaka.util.Error.Code.BAD_HTTP_STATUS,
      shaka.util.Error.Code.HTTP_ERROR,
      shaka.util.Error.Code.TIMEOUT,
    ];

    if (this.isLive() && retryErrorCodes.includes(error.code)) {
      error.severity = shaka.util.Error.Severity.RECOVERABLE;

      shaka.log.warning('Live streaming error.  Retrying automatically...');
      this.retryStreaming();
    }
  }

  /**
   * For CEA closed captions embedded in the video streams, create dummy text
   * stream.  This can be safely called again on existing manifests, for
   * manifest updates.
   * @param {!shaka.extern.Manifest} manifest
   * @private
   */
  makeTextStreamsForClosedCaptions_(manifest) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const TextStreamKind = shaka.util.ManifestParserUtils.TextStreamKind;
    const CEA608_MIME = shaka.util.MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE;
    const CEA708_MIME = shaka.util.MimeUtils.CEA708_CLOSED_CAPTION_MIMETYPE;

    // A set, to make sure we don't create two text streams for the same video.
    const closedCaptionsSet = new Set();
    for (const textStream of manifest.textStreams) {
      if (textStream.mimeType == CEA608_MIME ||
          textStream.mimeType == CEA708_MIME) {
        // This function might be called on a manifest update, so don't make a
        // new text stream for closed caption streams we have seen before.
        closedCaptionsSet.add(textStream.originalId);
      }
    }
    for (const variant of manifest.variants) {
      const video = variant.video;
      if (video && video.closedCaptions) {
        for (const id of video.closedCaptions.keys()) {
          if (!closedCaptionsSet.has(id)) {
            const mimeType = id.startsWith('CC') ? CEA608_MIME : CEA708_MIME;

            // Add an empty segmentIndex, for the benefit of the period combiner
            // in our builtin DASH parser.
            const segmentIndex = new shaka.media.MetaSegmentIndex();
            const textStream = {
              id: this.nextExternalStreamId_++,  // A globally unique ID.
              originalId: id, // The CC ID string, like 'CC1', 'CC3', etc.
              createSegmentIndex: () => Promise.resolve(),
              segmentIndex,
              mimeType,
              codecs: '',
              kind: TextStreamKind.CLOSED_CAPTION,
              encrypted: false,
              drmInfos: [],
              keyIds: new Set(),
              language: video.closedCaptions.get(id),
              label: null,
              type: ContentType.TEXT,
              primary: false,
              trickModeVideo: null,
              emsgSchemeIdUris: null,
              roles: video.roles,
              forced: false,
              channelsCount: null,
              audioSamplingRate: null,
              spatialAudio: false,
              closedCaptions: null,
            };
            manifest.textStreams.push(textStream);
            closedCaptionsSet.add(id);
          }
        }
      }
    }
  }

  /**
   * Filters a manifest, removing unplayable streams/variants.
   *
   * @param {?shaka.extern.Manifest} manifest
   * @private
   */
  async filterManifest_(manifest) {
    await this.filterManifestWithStreamUtils_(manifest);
    this.filterManifestWithRestrictions_(manifest);
  }

  /**
   * Filters a manifest, removing unplayable streams/variants.
   *
   * @param {?shaka.extern.Manifest} manifest
   * @private
   */
  async filterManifestWithStreamUtils_(manifest) {
    goog.asserts.assert(manifest, 'Manifest should exist!');
    goog.asserts.assert(this.video_, 'Must not be destroyed');

    /** @type {?shaka.extern.Variant} */
    const currentVariant = this.streamingEngine_ ?
        this.streamingEngine_.getCurrentVariant() : null;

    await shaka.util.StreamUtils.filterManifest(
        this.drmEngine_, currentVariant, manifest,
        this.config_.useMediaCapabilities);
    this.checkPlayableVariants_(manifest);
  }


  /**
   * Apply the restrictions configuration to the manifest, and check if there's
   * a variant that meets the restrictions.
   *
   * @param {?shaka.extern.Manifest} manifest
   * @private
   */
  filterManifestWithRestrictions_(manifest) {
    // Return if |destroy| is called.
    if (this.loadMode_ == shaka.Player.LoadMode.DESTROYED) {
      return;
    }
    const tracksChanged = shaka.util.StreamUtils.applyRestrictions(
        manifest.variants, this.config_.restrictions, this.maxHwRes_);
    if (tracksChanged && this.streamingEngine_) {
      this.onTracksChanged_();
    }

    // We may need to create new sessions for any new init data.
    const curDrmInfo = this.drmEngine_ ? this.drmEngine_.getDrmInfo() : null;
    // DrmEngine.newInitData() requires mediaKeys to be available.
    if (curDrmInfo && this.drmEngine_.getMediaKeys()) {
      for (const variant of manifest.variants) {
        const videoDrmInfos = variant.video ? variant.video.drmInfos : [];
        const audioDrmInfos = variant.audio ? variant.audio.drmInfos : [];
        const drmInfos = videoDrmInfos.concat(audioDrmInfos);
        for (const drmInfo of drmInfos) {
          // Ignore any data for different key systems.
          if (drmInfo.keySystem == curDrmInfo.keySystem) {
            for (const initData of (drmInfo.initData || [])) {
              this.drmEngine_.newInitData(
                  initData.initDataType, initData.initData);
            }
          }
        }
      }
    }

    this.checkRestrictedVariants_(manifest);
  }

  /**
   * @private
   */
  filterManifestByCurrentVariant_() {
    goog.asserts.assert(this.manifest_, 'Manifest should be valid');
    goog.asserts.assert(this.streamingEngine_,
        'StreamingEngine should be valid');

    const currentVariant = this.streamingEngine_ ?
        this.streamingEngine_.getCurrentVariant() : null;
    shaka.util.StreamUtils.filterManifestByCurrentVariant(currentVariant,
        this.manifest_);
    this.checkPlayableVariants_(this.manifest_);
  }

  /**
   * @param {shaka.extern.Variant} initialVariant
   * @param {number} time
   * @return {!Promise.<number>}
   * @private
   */
  async adjustStartTime_(initialVariant, time) {
    /** @type {?shaka.extern.Stream} */
    const activeAudio = initialVariant.audio;
    /** @type {?shaka.extern.Stream} */
    const activeVideo = initialVariant.video;

    /**
     * @param {?shaka.extern.Stream} stream
     * @param {number} time
     * @return {!Promise.<?number>}
     */
    const getAdjustedTime = async (stream, time) => {
      if (!stream) {
        return null;
      }

      await stream.createSegmentIndex();
      const ref = stream.segmentIndex[Symbol.iterator]().seek(time);
      if (!ref) {
        return null;
      }

      const refTime = ref.startTime;
      goog.asserts.assert(refTime <= time,
          'Segment should start before target time!');
      return refTime;
    };

    const audioStartTime = await getAdjustedTime(activeAudio, time);
    const videoStartTime = await getAdjustedTime(activeVideo, time);

    // If we have both video and audio times, pick the larger one.  If we picked
    // the smaller one, that one will download an entire segment to buffer the
    // difference.
    if (videoStartTime != null && audioStartTime != null) {
      return Math.max(videoStartTime, audioStartTime);
    } else if (videoStartTime != null) {
      return videoStartTime;
    } else if (audioStartTime != null) {
      return audioStartTime;
    } else {
      return time;
    }
  }

  /**
   * Update the buffering state to be either "we are buffering" or "we are not
   * buffering", firing events to the app as needed.
   *
   * @private
   */
  updateBufferState_() {
    const isBuffering = this.isBuffering();
    shaka.log.v2('Player changing buffering state to', isBuffering);

    // Make sure we have all the components we need before we consider ourselves
    // as being loaded.
    // TODO: Make the check for "loaded" simpler.
    const loaded = this.stats_ && this.bufferObserver_ && this.playhead_;

    if (loaded) {
      this.playRateController_.setBuffering(isBuffering);
      this.updateStateHistory_();
    }

    // Surface the buffering event so that the app knows if/when we are
    // buffering.
    const eventName = shaka.Player.EventName.Buffering;
    this.dispatchEvent(this.makeEvent_(eventName, {'buffering': isBuffering}));
  }

  /**
   * A callback for when the playback rate changes. We need to watch the
   * playback rate so that if the playback rate on the media element changes
   * (that was not caused by our play rate controller) we can notify the
   * controller so that it can stay in-sync with the change.
   *
   * @private
   */
  onRateChange_() {
    /** @type {number} */
    const newRate = this.video_.playbackRate;

    // On Edge, when someone seeks using the native controls, it will set the
    // playback rate to zero until they finish seeking, after which it will
    // return the playback rate.
    //
    // If the playback rate changes while seeking, Edge will cache the playback
    // rate and use it after seeking.
    //
    // https://github.com/google/shaka-player/issues/951
    if (newRate == 0) {
      return;
    }

    if (this.playRateController_) {
      // The playback rate has changed. This could be us or someone else.
      // If this was us, setting the rate again will be a no-op.
      this.playRateController_.set(newRate);
    }

    const event = this.makeEvent_(shaka.Player.EventName.RateChange);
    this.dispatchEvent(event);
  }

  /**
   * Try updating the state history. If the player has not finished
   * initializing, this will be a no-op.
   *
   * @private
   */
  updateStateHistory_() {
    // If we have not finish initializing, this will be a no-op.
    if (!this.stats_) {
      return;
    }
    if (!this.bufferObserver_) {
      return;
    }

    const State = shaka.media.BufferingObserver.State;

    const history = this.stats_.getStateHistory();

    if (this.bufferObserver_.getState() == State.STARVING) {
      history.update('buffering');
    } else if (this.video_.paused) {
      history.update('paused');
    } else if (this.video_.ended) {
      history.update('ended');
    } else {
      history.update('playing');
    }
  }

  /**
   * Callback from Playhead.
   *
   * @private
   */
  onSeek_() {
    if (this.playheadObservers_) {
      this.playheadObservers_.notifyOfSeek();
    }
    if (this.streamingEngine_) {
      this.streamingEngine_.seeked();
    }
    if (this.bufferObserver_) {
      // If we seek into an unbuffered range, we should fire a 'buffering' event
      // immediately.  If StreamingEngine can buffer fast enough, we may not
      // update our buffering tracking otherwise.
      this.pollBufferState_();
    }
  }

  /**
   * Update AbrManager with variants while taking into account restrictions,
   * preferences, and ABR.
   *
   * On error, this dispatches an error event and returns false.
   *
   * @return {boolean} True if successful.
   * @private
   */
  updateAbrManagerVariants_() {
    try {
      goog.asserts.assert(this.manifest_, 'Manifest should exist by now!');
      this.checkRestrictedVariants_(this.manifest_);
    } catch (e) {
      this.onError_(e);
      return false;
    }

    const playableVariants = this.manifest_.variants.filter((variant) => {
      return shaka.util.StreamUtils.isPlayable(variant);
    });

    // Update the abr manager with newly filtered variants.
    const adaptationSet = this.currentAdaptationSetCriteria_.create(
        playableVariants);
    this.abrManager_.setVariants(Array.from(adaptationSet.values()));
    return true;
  }

  /**
   * Chooses a variant from all possible variants while taking into account
   * restrictions, preferences, and ABR.
   *
   * On error, this dispatches an error event and returns null.
   *
   * @return {?shaka.extern.Variant}
   * @private
   */
  chooseVariant_() {
    if (this.updateAbrManagerVariants_()) {
      return this.abrManager_.chooseVariant();
    } else {
      return null;
    }
  }

  /**
   * Choose a text stream from all possible text streams while taking into
   * account user preference.
   *
   * @return {?shaka.extern.Stream}
   * @private
   */
  chooseTextStream_() {
    const subset = shaka.util.StreamUtils.filterStreamsByLanguageAndRole(
        this.manifest_.textStreams,
        this.currentTextLanguage_,
        this.currentTextRole_,
        this.currentTextForced_);
    return subset[0] || null;
  }

  /**
   * Chooses a new Variant.  If the new variant differs from the old one, it
   * adds the new one to the switch history and switches to it.
   *
   * Called after a config change, a key status event, or an explicit language
   * change.
   *
   * @private
   */
  chooseVariantAndSwitch_() {
    goog.asserts.assert(this.config_, 'Must not be destroyed');

    // Because we're running this after a config change (manual language
    // change) or a key status event, it is always okay to clear the buffer
    // here.
    const chosenVariant = this.chooseVariant_();
    if (chosenVariant) {
      this.switchVariant_(chosenVariant, /* fromAdaptation= */ true,
          /* clearBuffers= */ true, /* safeMargin= */ 0);
      // Send an adaptation event so that the UI can show the new
      // language/tracks.
      this.onAdaptation_();
    }
  }

  /**
   * @param {shaka.extern.Variant} variant
   * @param {boolean} fromAdaptation
   * @param {boolean} clearBuffer
   * @param {number} safeMargin
   * @private
   */
  switchVariant_(variant, fromAdaptation, clearBuffer, safeMargin) {
    const currentVariant = this.streamingEngine_.getCurrentVariant();
    if (variant == currentVariant) {
      shaka.log.debug('Variant already selected.');
      return;
    }

    // Add entries to the history.
    this.addVariantToSwitchHistory_(variant, fromAdaptation);
    this.streamingEngine_.switchVariant(variant, clearBuffer, safeMargin);
    let oldTrack = null;
    if (currentVariant) {
      oldTrack = shaka.util.StreamUtils.variantToTrack(currentVariant);
    }
    const newTrack = shaka.util.StreamUtils.variantToTrack(variant);
    // Dispatch a 'variantchanged' event
    this.onVariantChanged_(oldTrack, newTrack);
  }

  /**
   * @param {AudioTrack} track
   * @private
   */
  switchHtml5Track_(track) {
    goog.asserts.assert(this.video_ && this.video_.audioTracks,
        'Video and video.audioTracks should not be null!');
    const audioTracks = Array.from(this.video_.audioTracks);
    const currentTrack = audioTracks.find((t) => t.enabled);

    // This will reset the "enabled" of other tracks to false.
    track.enabled = true;

    const oldTrack =
      shaka.util.StreamUtils.html5AudioTrackToTrack(currentTrack);
    const newTrack =
      shaka.util.StreamUtils.html5AudioTrackToTrack(track);
    this.onVariantChanged_(oldTrack, newTrack);
  }

  /**
   * Decide during startup if text should be streamed/shown.
   * @private
   */
  setInitialTextState_(initialVariant, initialTextStream) {
    // Check if we should show text (based on difference between audio and text
    // languages).
    if (initialTextStream) {
      if (initialVariant.audio && this.shouldInitiallyShowText_(
          initialVariant.audio, initialTextStream)) {
        this.isTextVisible_ = true;
      }
      if (this.isTextVisible_) {
        // If the cached value says to show text, then update the text displayer
        // since it defaults to not shown.
        this.mediaSourceEngine_.getTextDisplayer().setTextVisibility(true);
        goog.asserts.assert(this.shouldStreamText_(),
            'Should be streaming text');
      }
      this.onTextTrackVisibility_();
    } else {
      this.isTextVisible_ = false;
    }
  }

  /**
   * Check if we should show text on screen automatically.
   *
   * The text should automatically be shown if the text is language-compatible
   * with the user's text language preference, but not compatible with the
   * audio.
   *
   * For example:
   *   preferred | chosen | chosen |
   *   text      | text   | audio  | show
   *   -----------------------------------
   *   en-CA     | en     | jp     | true
   *   en        | en-US  | fr     | true
   *   fr-CA     | en-US  | jp     | false
   *   en-CA     | en-US  | en-US  | false
   *
   * @param {shaka.extern.Stream} audioStream
   * @param {shaka.extern.Stream} textStream
   * @return {boolean}
   * @private
   */
  shouldInitiallyShowText_(audioStream, textStream) {
    const LanguageUtils = shaka.util.LanguageUtils;

    /** @type {string} */
    const preferredTextLocale =
        LanguageUtils.normalize(this.config_.preferredTextLanguage);
    /** @type {string} */
    const audioLocale = LanguageUtils.normalize(audioStream.language);
    /** @type {string} */
    const textLocale = LanguageUtils.normalize(textStream.language);

    return (
      LanguageUtils.areLanguageCompatible(textLocale, preferredTextLocale) &&
      !LanguageUtils.areLanguageCompatible(audioLocale, textLocale));
  }

  /**
   * Callback from StreamingEngine.
   *
   * @private
   */
  onManifestUpdate_() {
    if (this.parser_ && this.parser_.update) {
      this.parser_.update();
    }
  }

  /**
   * Callback from StreamingEngine.
   *
   * @private
   */
  onSegmentAppended_() {
    // When we append a segment to media source (via streaming engine) we are
    // changing what data we have buffered, so notify the playhead of the
    // change.
    if (this.playhead_) {
      this.playhead_.notifyOfBufferingChange();
    }
    this.pollBufferState_();
  }

  /**
   * Callback from AbrManager.
   *
   * @param {shaka.extern.Variant} variant
   * @param {boolean=} clearBuffer
   * @param {number=} safeMargin Optional amount of buffer (in seconds) to
   *   retain when clearing the buffer.
   *   Defaults to 0 if not provided. Ignored if clearBuffer is false.
   * @private
   */
  switch_(variant, clearBuffer = false, safeMargin = 0) {
    shaka.log.debug('switch_');
    goog.asserts.assert(this.config_.abr.enabled,
        'AbrManager should not call switch while disabled!');
    goog.asserts.assert(this.manifest_, 'We need a manifest to switch ' +
                                        'variants.');

    if (!this.streamingEngine_) {
      // There's no way to change it.
      return;
    }

    if (variant == this.streamingEngine_.getCurrentVariant()) {
      // This isn't a change.
      return;
    }

    this.addVariantToSwitchHistory_(variant, /* fromAdaptation= */ true);
    this.streamingEngine_.switchVariant(variant, clearBuffer, safeMargin);
    this.onAdaptation_();
  }

  /**
   * Dispatches an 'adaptation' event.
   * @private
   */
  onAdaptation_() {
    // Delay the 'adaptation' event so that StreamingEngine has time to absorb
    // the changes before the user tries to query it.
    const event = this.makeEvent_(shaka.Player.EventName.Adaptation);
    this.delayDispatchEvent_(event);
  }

  /**
   * Dispatches a 'trackschanged' event.
   * @private
   */
  onTracksChanged_() {
    // Delay the 'trackschanged' event so StreamingEngine has time to absorb the
    // changes before the user tries to query it.
    const event = this.makeEvent_(shaka.Player.EventName.TracksChanged);
    this.delayDispatchEvent_(event);
  }

  /**
   * Dispatches a 'variantchanged' event.
   * @param {?shaka.extern.Track} from
   * @param {shaka.extern.Track} to
   * @private
   */
  onVariantChanged_(from, to) {
    // Delay the 'variantchanged' event so StreamingEngine has time to absorb
    // the changes before the user tries to query it.
    const event = this.makeEvent_(shaka.Player.EventName.VariantChanged, {
      oldTrack: from,
      newTrack: to,
    });
    this.delayDispatchEvent_(event);
  }

  /**
   * Dispatches a 'textchanged' event.
   * @private
   */
  onTextChanged_() {
    // Delay the 'textchanged' event so StreamingEngine time to absorb the
    // changes before the user tries to query it.
    const event = this.makeEvent_(shaka.Player.EventName.TextChanged);
    this.delayDispatchEvent_(event);
  }

  /** @private */
  onTextTrackVisibility_() {
    const event = this.makeEvent_(shaka.Player.EventName.TextTrackVisibility);
    this.delayDispatchEvent_(event);
  }

  /** @private */
  onAbrStatusChanged_() {
    const event = this.makeEvent_(shaka.Player.EventName.AbrStatusChanged, {
      newStatus: this.config_.abr.enabled,
    });
    this.delayDispatchEvent_(event);
  }

  /**
   * @param {!shaka.util.Error} error
   * @private
   */
  onError_(error) {
    goog.asserts.assert(error instanceof shaka.util.Error, 'Wrong error type!');

    // Errors dispatched after |destroy| is called are not meaningful and should
    // be safe to ignore.
    if (this.loadMode_ == shaka.Player.LoadMode.DESTROYED) {
      return;
    }

    const eventName = shaka.Player.EventName.Error;
    const event = this.makeEvent_(eventName, {'detail': error});
    this.dispatchEvent(event);
    if (event.defaultPrevented) {
      error.handled = true;
    }
  }

  /**
   * When we fire region events, we need to copy the information out of the
   * region to break the connection with the player's internal data. We do the
   * copy here because this is the transition point between the player and the
   * app.
   *
   * @param {!shaka.Player.EventName} eventName
   * @param {shaka.extern.TimelineRegionInfo} region
   *
   * @private
   */
  onRegionEvent_(eventName, region) {
    // Always make a copy to avoid exposing our internal data to the app.
    const clone = {
      schemeIdUri: region.schemeIdUri,
      value: region.value,
      startTime: region.startTime,
      endTime: region.endTime,
      id: region.id,
      eventElement: region.eventElement,
    };

    this.dispatchEvent(this.makeEvent_(eventName, {detail: clone}));
  }

  /**
   * Turn the media element's error object into a Shaka Player error object.
   *
   * @return {shaka.util.Error}
   * @private
   */
  videoErrorToShakaError_() {
    goog.asserts.assert(this.video_.error,
        'Video error expected, but missing!');
    if (!this.video_.error) {
      return null;
    }

    const code = this.video_.error.code;
    if (code == 1 /* MEDIA_ERR_ABORTED */) {
      // Ignore this error code, which should only occur when navigating away or
      // deliberately stopping playback of HTTP content.
      return null;
    }

    // Extra error information from MS Edge:
    let extended = this.video_.error.msExtendedCode;
    if (extended) {
      // Convert to unsigned:
      if (extended < 0) {
        extended += Math.pow(2, 32);
      }
      // Format as hex:
      extended = extended.toString(16);
    }

    // Extra error information from Chrome:
    const message = this.video_.error.message;

    return new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.VIDEO_ERROR,
        code, extended, message);
  }

  /**
   * @param {!Event} event
   * @private
   */
  onVideoError_(event) {
    const error = this.videoErrorToShakaError_();
    if (!error) {
      return;
    }
    this.onError_(error);
  }

  /**
   * @param {!Object.<string, string>} keyStatusMap A map of hex key IDs to
   *   statuses.
   * @private
   */
  onKeyStatus_(keyStatusMap) {
    if (!this.streamingEngine_) {
      // We can't use this info to manage restrictions in src= mode, so ignore
      // it.
      return;
    }

    const keyIds = Object.keys(keyStatusMap);
    if (keyIds.length == 0) {
      shaka.log.warning(
          'Got a key status event without any key statuses, so we don\'t ' +
          'know the real key statuses. If we don\'t have all the keys, ' +
          'you\'ll need to set restrictions so we don\'t select those tracks.');
    }

    // If EME is using a synthetic key ID, the only key ID is '00' (a single 0
    // byte).  In this case, it is only used to report global success/failure.
    // See note about old platforms in: https://bit.ly/2tpez5Z
    const isGlobalStatus = keyIds.length == 1 && keyIds[0] == '00';
    if (isGlobalStatus) {
      shaka.log.warning(
          'Got a synthetic key status event, so we don\'t know the real key ' +
          'statuses. If we don\'t have all the keys, you\'ll need to set ' +
          'restrictions so we don\'t select those tracks.');
    }

    const restrictedStatuses = shaka.Player.restrictedStatuses_;
    let tracksChanged = false;

    // Only filter tracks for keys if we have some key statuses to look at.
    if (keyIds.length) {
      for (const variant of this.manifest_.variants) {
        const streams = shaka.util.StreamUtils.getVariantStreams(variant);

        for (const stream of streams) {
          const originalAllowed = variant.allowedByKeySystem;

          // Only update if we have key IDs for the stream.  If the keys aren't
          // all present, then the track should be restricted.
          if (stream.keyIds.size) {
            variant.allowedByKeySystem = true;

            for (const keyId of stream.keyIds) {
              const keyStatus = keyStatusMap[isGlobalStatus ? '00' : keyId];
              variant.allowedByKeySystem = variant.allowedByKeySystem &&
                  !!keyStatus && !restrictedStatuses.includes(keyStatus);
            }
          }

          if (originalAllowed != variant.allowedByKeySystem) {
            tracksChanged = true;
          }
        }  // for (const stream of streams)
      }  // for (const variant of this.manifest_.variants)
    }  // if (keyIds.size)

    if (tracksChanged) {
      this.updateAbrManagerVariants_();
    }

    const currentVariant = this.streamingEngine_.getCurrentVariant();
    if (currentVariant && !currentVariant.allowedByKeySystem) {
      shaka.log.debug('Choosing new streams after key status changed');
      this.chooseVariantAndSwitch_();
    }

    if (tracksChanged) {
      this.onTracksChanged_();
    }
  }

  /**
   * Callback from DrmEngine
   * @param {string} keyId
   * @param {number} expiration
   * @private
   */
  onExpirationUpdated_(keyId, expiration) {
    if (this.parser_ && this.parser_.onExpirationUpdated) {
      this.parser_.onExpirationUpdated(keyId, expiration);
    }

    const event = this.makeEvent_(shaka.Player.EventName.ExpirationUpdated);
    this.dispatchEvent(event);
  }

  /**
   * @return {boolean} true if we should stream text right now.
   * @private
   */
  shouldStreamText_() {
    return this.config_.streaming.alwaysStreamText || this.isTextTrackVisible();
  }

  /**
   * Applies playRangeStart and playRangeEnd to the given timeline. This will
   * only affect non-live content.
   *
   * @param {shaka.media.PresentationTimeline} timeline
   * @param {number} playRangeStart
   * @param {number} playRangeEnd
   *
   * @private
   */
  static applyPlayRange_(timeline, playRangeStart, playRangeEnd) {
    if (playRangeStart > 0) {
      if (timeline.isLive()) {
        shaka.log.warning(
            '|playRangeStart| has been configured for live content. ' +
            'Ignoring the setting.');
      } else {
        timeline.setUserSeekStart(playRangeStart);
      }
    }

    // If the playback has been configured to end before the end of the
    // presentation, update the duration unless it's live content.
    const fullDuration = timeline.getDuration();
    if (playRangeEnd < fullDuration) {
      if (timeline.isLive()) {
        shaka.log.warning(
            '|playRangeEnd| has been configured for live content. ' +
            'Ignoring the setting.');
      } else {
        timeline.setDuration(playRangeEnd);
      }
    }
  }

  /**
   * Checks if the variants are all restricted, and throw an appropriate
   * exception if so.
   *
   * @param {shaka.extern.Manifest} manifest
   *
   * @private
   */
  checkRestrictedVariants_(manifest) {
    const restrictedStatuses = shaka.Player.restrictedStatuses_;
    const keyStatusMap =
        this.drmEngine_ ? this.drmEngine_.getKeyStatuses() : {};
    const keyIds = Object.keys(keyStatusMap);
    const isGlobalStatus = keyIds.length && keyIds[0] == '00';

    let hasPlayable = false;
    let hasAppRestrictions = false;

    /** @type {!Set.<string>} */
    const missingKeys = new Set();

    /** @type {!Set.<string>} */
    const badKeyStatuses = new Set();

    for (const variant of manifest.variants) {
      // TODO: Combine with onKeyStatus_.
      const streams = [];
      if (variant.audio) {
        streams.push(variant.audio);
      }
      if (variant.video) {
        streams.push(variant.video);
      }

      for (const stream of streams) {
        if (stream.keyIds.size) {
          for (const keyId of stream.keyIds) {
            const keyStatus = keyStatusMap[isGlobalStatus ? '00' : keyId];
            if (!keyStatus) {
              missingKeys.add(keyId);
            } else if (restrictedStatuses.includes(keyStatus)) {
              badKeyStatuses.add(keyStatus);
            }
          }
        }  // if (stream.keyIds.size)
      }

      if (!variant.allowedByApplication) {
        hasAppRestrictions = true;
      } else if (variant.allowedByKeySystem) {
        hasPlayable = true;
      }
    }

    if (!hasPlayable) {
      /** @type {shaka.extern.RestrictionInfo} */
      const data = {
        hasAppRestrictions,
        missingKeys: Array.from(missingKeys),
        restrictedKeyStatuses: Array.from(badKeyStatuses),
      };
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.RESTRICTIONS_CANNOT_BE_MET,
          data);
    }
  }

  /**
   * Confirm some variants are playable. Otherwise, throw an exception.
   * @param {!shaka.extern.Manifest} manifest
   * @private
   */
  checkPlayableVariants_(manifest) {
    const valid = manifest.variants.some(shaka.util.StreamUtils.isPlayable);

    // If none of the variants are playable, throw
    // CONTENT_UNSUPPORTED_BY_BROWSER.
    if (!valid) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.CONTENT_UNSUPPORTED_BY_BROWSER);
    }
  }

  /**
   * Fire an event, but wait a little bit so that the immediate execution can
   * complete before the event is handled.
   *
   * @param {!shaka.util.FakeEvent} event
   * @private
   */
  async delayDispatchEvent_(event) {
    // Wait until the next interpreter cycle.
    await Promise.resolve();

    // Only dispatch the event if we are still alive.
    if (this.loadMode_ != shaka.Player.LoadMode.DESTROYED) {
      this.dispatchEvent(event);
    }
  }

  /**
   * Get the normalized languages for a group of tracks.
   *
   * @param {!Array.<?shaka.extern.Track>} tracks
   * @return {!Set.<string>}
   * @private
   */
  static getLanguagesFrom_(tracks) {
    const languages = new Set();

    for (const track of tracks) {
      if (track.language) {
        languages.add(shaka.util.LanguageUtils.normalize(track.language));
      } else {
        languages.add('und');
      }
    }

    return languages;
  }

  /**
   * Get all permutations of normalized languages and role for a group of
   * tracks.
   *
   * @param {!Array.<?shaka.extern.Track>} tracks
   * @return {!Array.<shaka.extern.LanguageRole>}
   * @private
   */
  static getLanguageAndRolesFrom_(tracks) {
    /** @type {!Map.<string, !Set>} */
    const languageToRoles = new Map();
    /** @type {!Map.<string, !Map.<string, string>>} */
    const languageRoleToLabel = new Map();

    for (const track of tracks) {
      let language = 'und';
      let roles = [];

      if (track.language) {
        language = shaka.util.LanguageUtils.normalize(track.language);
      }

      if (track.type == 'variant') {
        roles = track.audioRoles;
      } else {
        roles = track.roles;
      }

      if (!roles || !roles.length) {
        // We must have an empty role so that we will still get a language-role
        // entry from our Map.
        roles = [''];
      }

      if (!languageToRoles.has(language)) {
        languageToRoles.set(language, new Set());
      }

      for (const role of roles) {
        languageToRoles.get(language).add(role);
        if (track.label) {
          if (!languageRoleToLabel.has(language)) {
            languageRoleToLabel.set(language, new Map());
          }
          languageRoleToLabel.get(language).set(role, track.label);
        }
      }
    }

    // Flatten our map to an array of language-role pairs.
    const pairings = [];
    languageToRoles.forEach((roles, language) => {
      for (const role of roles) {
        let label = null;
        if (languageRoleToLabel.has(language) &&
            languageRoleToLabel.get(language).has(role)) {
          label = languageRoleToLabel.get(language).get(role);
        }
        pairings.push({language, role, label});
      }
    });
    return pairings;
  }

  /**
   * Assuming the player is playing content with media source, check if the
   * player has buffered enough content to make it to the end of the
   * presentation.
   *
   * @return {boolean}
   * @private
   */
  isBufferedToEndMS_() {
    goog.asserts.assert(
        this.video_,
        'We need a video element to get buffering information');
    goog.asserts.assert(
        this.mediaSourceEngine_,
        'We need a media source engine to get buffering information');
    goog.asserts.assert(
        this.manifest_,
        'We need a manifest to get buffering information');

    // This is a strong guarantee that we are buffered to the end, because it
    // means the playhead is already at that end.
    if (this.video_.ended) {
      return true;
    }

    // This means that MediaSource has buffered the final segment in all
    // SourceBuffers and is no longer accepting additional segments.
    if (this.mediaSourceEngine_.ended()) {
      return true;
    }

    // Live streams are "buffered to the end" when they have buffered to the
    // live edge or beyond (into the region covered by the presentation delay).
    if (this.manifest_.presentationTimeline.isLive()) {
      const liveEdge =
          this.manifest_.presentationTimeline.getSegmentAvailabilityEnd();
      const bufferEnd =
          shaka.media.TimeRangesUtils.bufferEnd(this.video_.buffered);

      if (bufferEnd != null && bufferEnd >= liveEdge) {
        return true;
      }
    }

    return false;
  }

  /**
   * Assuming the player is playing content with src=, check if the player has
   * buffered enough content to make it to the end of the presentation.
   *
   * @return {boolean}
   * @private
   */
  isBufferedToEndSrc_() {
    goog.asserts.assert(
        this.video_,
        'We need a video element to get buffering information');

    // This is a strong guarantee that we are buffered to the end, because it
    // means the playhead is already at that end.
    if (this.video_.ended) {
      return true;
    }

    // If we have buffered to the duration of the content, it means we will have
    // enough content to buffer to the end of the presentation.
    const bufferEnd =
        shaka.media.TimeRangesUtils.bufferEnd(this.video_.buffered);

    // Because Safari's native HLS reports slightly inaccurate values for
    // bufferEnd here, we use a fudge factor.  Without this, we can end up in a
    // buffering state at the end of the stream.  See issue #2117.
    // TODO: Try to remove the fudge here once we no longer manage buffering
    // state above the browser with playbackRate=0.
    const fudge = 1;  // 1000 ms
    return bufferEnd != null && bufferEnd >= this.video_.duration - fudge;
  }

  /**
   * Create an error for when we purposely interrupt a load operation.
   *
   * @return {!shaka.util.Error}
   * @private
   */
  createAbortLoadError_() {
    return new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.PLAYER,
        shaka.util.Error.Code.LOAD_INTERRUPTED);
  }

  /**
   * Key
   * ----------------------
   * D   : Detach Node
   * A   : Attach Node
   * MS  : Media Source Node
   * P   : Manifest Parser Node
   * M   : Manifest Node
   * DRM : Drm Engine Node
   * L   : Load Node
   * U   : Unloading Node
   * SRC : Src Equals Node
   *
   * Graph Topology
   * ----------------------
   *
   *        [SRC]-----+
   *         ^        |
   *         |        v
   * [D]<-->[A]<-----[U]
   *         |        ^
   *         v        |
   *        [MS]------+
   *         |        |
   *         v        |
   *        [P]-------+
   *         |        |
   *         v        |
   *        [M]-------+
   *         |        |
   *         v        |
   *        [DRM]-----+
   *         |        |
   *         v        |
   *        [L]-------+
   *
   * @param {!shaka.routing.Node} currentlyAt
   * @param {shaka.routing.Payload} currentlyWith
   * @param {!shaka.routing.Node} wantsToBeAt
   * @param {shaka.routing.Payload} wantsToHave
   * @return {?shaka.routing.Node}
   * @private
   */
  getNextStep_(currentlyAt, currentlyWith, wantsToBeAt, wantsToHave) {
    let next = null;

    // Detach is very simple, either stay in detach (because |detach| was called
    // while in detached) or go somewhere that requires us to attach to an
    // element.
    if (currentlyAt == this.detachNode_) {
      next = wantsToBeAt == this.detachNode_ ?
             this.detachNode_ :
             this.attachNode_;
    }

    if (currentlyAt == this.attachNode_) {
      next = this.getNextAfterAttach_(wantsToBeAt, currentlyWith, wantsToHave);
    }

    if (currentlyAt == this.mediaSourceNode_) {
      next = this.getNextAfterMediaSource_(
          wantsToBeAt, currentlyWith, wantsToHave);
    }

    if (currentlyAt == this.parserNode_) {
      next = this.getNextMatchingAllDependencies_(
          /* destination= */ this.loadNode_,
          /* next= */ this.manifestNode_,
          /* reset= */ this.unloadNode_,
          /* goingTo= */ wantsToBeAt,
          /* has= */ currentlyWith,
          /* wants= */ wantsToHave);
    }

    if (currentlyAt == this.manifestNode_) {
      next = this.getNextMatchingAllDependencies_(
          /* destination= */ this.loadNode_,
          /* next= */ this.drmNode_,
          /* reset= */ this.unloadNode_,
          /* goingTo= */ wantsToBeAt,
          /* has= */ currentlyWith,
          /* wants= */ wantsToHave);
    }

    // For DRM, we have two options "load" or "unload". If all our constraints
    // are met, we can go to "load". If anything is off, we must go back to
    // "unload" to reset.
    if (currentlyAt == this.drmNode_) {
      next = this.getNextMatchingAllDependencies_(
          /* destination= */ this.loadNode_,
          /* next= */ this.loadNode_,
          /* reset= */ this.unloadNode_,
          /* goingTo= */ wantsToBeAt,
          /* has= */ currentlyWith,
          /* wants= */ wantsToHave);
    }

    // For DRM w/ src= playback, we only care about destination and media
    // element.
    if (currentlyAt == this.srcEqualsDrmNode_) {
      if (wantsToBeAt == this.srcEqualsNode_ &&
          currentlyWith.mediaElement == wantsToHave.mediaElement) {
        next = this.srcEqualsNode_;
      } else {
        next = this.unloadNode_;
      }
    }

    // After we load content, always go through unload because we can't safely
    // use components after we have started playback.
    if (currentlyAt == this.loadNode_ || currentlyAt == this.srcEqualsNode_) {
      next = this.unloadNode_;
    }

    if (currentlyAt == this.unloadNode_) {
      next = this.getNextAfterUnload_(wantsToBeAt, currentlyWith, wantsToHave);
    }

    goog.asserts.assert(next, 'Missing next step!');
    return next;
  }

  /**
   * @param {!shaka.routing.Node} goingTo
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @return {?shaka.routing.Node}
   * @private
   */
  getNextAfterAttach_(goingTo, has, wants) {
    // Attach and detach are the only two nodes that we can directly go
    // back-and-forth between.
    if (goingTo == this.detachNode_) {
      return this.detachNode_;
    }

    // If we are going anywhere other than detach, then we need the media
    // element to match, if they don't match, we need to go through detach
    // first.
    if (has.mediaElement != wants.mediaElement) {
      return this.detachNode_;
    }

    // If we are already in attached, and someone calls |attach| again (to the
    // same video element), we can handle the redundant request by re-entering
    // our current state.
    if (goingTo == this.attachNode_) {
      return this.attachNode_;
    }

    // The next step from attached to loaded is through media source.
    if (goingTo == this.mediaSourceNode_ || goingTo == this.loadNode_) {
      return this.mediaSourceNode_;
    }

    // If we are going to src=, then we should set up DRM first.  This will
    // support cases like FairPlay HLS on Safari.
    if (goingTo == this.srcEqualsNode_) {
      return this.srcEqualsDrmNode_;
    }

    // We are missing a rule, the null will get caught by a common check in
    // the routing system.
    return null;
  }

  /**
   * @param {!shaka.routing.Node} goingTo
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @return {?shaka.routing.Node}
   * @private
   */
  getNextAfterMediaSource_(goingTo, has, wants) {
    // We can only go to parse manifest or unload. If we want to go to load and
    // we have the right media element, we can go to parse manifest. If we
    // don't, no matter where we want to go, we must go through unload.
    if (goingTo == this.loadNode_ && has.mediaElement == wants.mediaElement) {
      return this.parserNode_;
    }

    // Right now the unload node is responsible for tearing down all playback
    // components (including media source). So since we have created media
    // source, we need to unload since our dependencies are not compatible.
    //
    // TODO: We are structured this way to maintain a historic structure. Going
    //       forward, there is no reason to restrict ourselves to this. Going
    //       forward we should explore breaking apart |onUnload| and develop
    //       more meaningful terminology around tearing down playback resources.
    return this.unloadNode_;
  }

  /**
   * After unload there are only two options, attached or detached. This choice
   * is based on whether or not we have a media element. If we have a media
   * element, then we go to attach. If we don't have a media element, we go to
   * detach.
   *
   * @param {!shaka.routing.Node} goingTo
   * @param {shaka.routing.Payload} has
   * @param {shaka.routing.Payload} wants
   * @return {?shaka.routing.Node}
   * @private
   */
  getNextAfterUnload_(goingTo, has, wants) {
    // If we don't want a media element, detach.
    // If we have the wrong media element, detach.
    // Otherwise it means we want to attach to a media element and it is safe to
    // do so.
    return !wants.mediaElement || has.mediaElement != wants.mediaElement ?
           this.detachNode_ :
           this.attachNode_;
  }

  /**
   * A general method used to handle routing when we can either than one step
   * toward our destination (while all our dependencies match) or go to a node
   * that will reset us so we can try again.
   *
   * @param {!shaka.routing.Node} destinationNode
   *   What |goingTo| must be for us to step toward |nextNode|. Otherwise we
   *   will go to |resetNode|.
   * @param {!shaka.routing.Node} nextNode
   *   The node we will go to next if |goingTo == destinationNode| and all
   *   dependencies match.
   * @param {!shaka.routing.Node} resetNode
   *   The node we will go to next if |goingTo != destinationNode| or any
   *   dependency does not match.
   * @param {!shaka.routing.Node} goingTo
   *   The node that the walker is trying to go to.
   * @param {shaka.routing.Payload} has
   *   The payload that the walker currently has.
   * @param {shaka.routing.Payload} wants
   *   The payload that the walker wants to have when iy gets to |goingTo|.
   * @return {shaka.routing.Node}
   * @private
   */
  getNextMatchingAllDependencies_(destinationNode, nextNode, resetNode, goingTo,
      has, wants) {
    if (goingTo == destinationNode &&
        has.mediaElement == wants.mediaElement &&
        has.uri == wants.uri &&
        has.mimeType == wants.mimeType) {
      return nextNode;
    }

    return resetNode;
  }

  /**
   * @return {shaka.routing.Payload}
   * @private
   */
  static createEmptyPayload_() {
    return {
      mediaElement: null,
      mimeType: null,
      startTime: null,
      startTimeOfLoad: NaN,
      uri: null,
    };
  }

  /**
   * Using a promise, wrap the listeners returned by |Walker.startNewRoute|.
   * This will work for most usages in |Player| but should not be used for
   * special cases.
   *
   * This will connect |onCancel|, |onEnd|, |onError|, and |onSkip| with
   * |resolve| and |reject| but will leave |onStart| unset.
   *
   * @param {shaka.routing.Walker.Listeners} listeners
   * @return {!Promise}
   * @private
   */
  wrapWalkerListenersWithPromise_(listeners) {
    return new Promise((resolve, reject) => {
      listeners.onCancel = () => reject(this.createAbortLoadError_());
      listeners.onEnd = () => resolve();
      listeners.onError = (e) => reject(e);
      listeners.onSkip = () => reject(this.createAbortLoadError_());
    });
  }
};

/**
 * An internal enum that contains the string values of all of the player events.
 * This exists primarily to act as an implicit list of events, for tests.
 *
 * @enum {string}
 */
shaka.Player.EventName = {
  AbrStatusChanged: 'abrstatuschanged',
  Adaptation: 'adaptation',
  Buffering: 'buffering',
  DrmSessionUpdate: 'drmsessionupdate',
  Emsg: 'emsg',
  Error: 'error',
  ExpirationUpdated: 'expirationupdated',
  LargeGap: 'largegap',
  Loaded: 'loaded',
  Loading: 'loading',
  ManifestParsed: 'manifestparsed',
  Metadata: 'metadata',
  OnStateChange: 'onstatechange',
  OnStateIdle: 'onstateidle',
  RateChange: 'ratechange',
  SessionDataEvent: 'sessiondata',
  Streaming: 'streaming',
  TextChanged: 'textchanged',
  TextTrackVisibility: 'texttrackvisibility',
  TimelineRegionAdded: 'timelineregionadded',
  TimelineRegionEnter: 'timelineregionenter',
  TimelineRegionExit: 'timelineregionexit',
  TracksChanged: 'trackschanged',
  Unloading: 'unloading',
  VariantChanged: 'variantchanged',
};


/**
 * In order to know what method of loading the player used for some content, we
 * have this enum. It lets us know if content has not been loaded, loaded with
 * media source, or loaded with src equals.
 *
 * This enum has a low resolution, because it is only meant to express the
 * outer limits of the various states that the player is in. For example, when
 * someone calls a public method on player, it should not matter if they have
 * initialized drm engine, it should only matter if they finished loading
 * content.
 *
 * @enum {number}
 * @export
 */
shaka.Player.LoadMode = {
  'DESTROYED': 0,
  'NOT_LOADED': 1,
  'MEDIA_SOURCE': 2,
  'SRC_EQUALS': 3,
};

/**
 * The typical buffering threshold.  When we have less than this buffered (in
 * seconds), we enter a buffering state.  This specific value is based on manual
 * testing and evaluation across a variety of platforms.
 *
 * To make the buffering logic work in all cases, this "typical" threshold will
 * be overridden if the rebufferingGoal configuration is too low.
 *
 * @const {number}
 * @private
 */
shaka.Player.TYPICAL_BUFFERING_THRESHOLD_ = 0.5;

/**
 * @define {string} A version number taken from git at compile time.
 * @export
 */
shaka.Player.version = 'v3.2.0-pre-uncompiled';

// Initialize the deprecation system using the version string we just set
// on the player.
shaka.Deprecate.init(shaka.Player.version);


/**
 * These are the EME key statuses that represent restricted playback.
 * 'usable', 'released', 'output-downscaled', 'status-pending' are statuses
 * of the usable keys.  'expired' status is being handled separately in
 * DrmEngine.
 *
 * @const {!Array.<string>}
 * @private
 */
shaka.Player.restrictedStatuses_ = ['output-restricted', 'internal-error'];


/** @private {!Object.<string, function():*>} */
shaka.Player.supportPlugins_ = {};


/** @private {?shaka.extern.IAdManager.Factory} */
shaka.Player.adManagerFactory_ = null;


/**
 * @const {!Object.<string, string>}
 * @private
 */
shaka.Player.SRC_EQUAL_EXTENSIONS_TO_MIME_TYPES_ = {
  'mp4': 'video/mp4',
  'm4v': 'video/mp4',
  'm4a': 'audio/mp4',
  'webm': 'video/webm',
  'weba': 'audio/webm',
  'mkv': 'video/webm', // Chromium browsers supports it.
  'ts': 'video/mp2t',
  'ogv': 'video/ogg',
  'ogg': 'audio/ogg',
  'mpg': 'video/mpeg',
  'mpeg': 'video/mpeg',
  'm3u8': 'application/x-mpegurl',
  'mp3': 'audio/mpeg',
  'aac': 'audio/aac',
  'flac': 'audio/flac',
  'wav': 'audio/wav',
};


/**
 * @const {string}
 */
shaka.Player.TextTrackLabel = 'Shaka Player TextTrack';
