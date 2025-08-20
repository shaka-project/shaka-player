/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */


/**
 * An object which selects Streams from a set of possible choices.  This also
 * watches for system changes to automatically adapt for the current streaming
 * requirements.  For example, when the network slows down, this class is in
 * charge of telling the Player which streams to switch to in order to reduce
 * the required bandwidth.
 *
 * This class is given a set of streams to choose from when the Player starts
 * up.  This class should store these and use them to make future decisions
 * about ABR.  It is up to this class how those decisions are made.  All the
 * Player will do is tell this class what streams to choose from.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.AbrManager = class {
  constructor() {}

  /**
   * Initializes the AbrManager.
   *
   * @param {shaka.extern.AbrManager.SwitchCallback} switchCallback
   * @exportDoc
   */
  init(switchCallback) {}

  /**
   * Stops any background timers and frees any objects held by this instance.
   * This will only be called after a call to init.
   *
   * @exportDoc
   */
  stop() {}

  /**
   * Request that this object release all internal references.
   * @exportDoc
   */
  release() {}

  /**
   * Updates manager's variants collection.
   * Returns true if the variants are updated. Returns false if the variants
   * are equal.
   *
   * @param {!Array<!shaka.extern.Variant>} variants
   * @return {boolean}
   * @exportDoc
   */
  setVariants(variants) {}

  /**
   * Chooses one variant to switch to.  Called by the Player.
   *
   * @param {boolean=} preferFastSwitching If not provided meant "avoid fast
   * switching if possible".
   * @return {shaka.extern.Variant}
   * @exportDoc
   */
  chooseVariant(preferFastSwitching) {}

  /**
   * Enables automatic Variant choices from the last ones passed to setVariants.
   * After this, the AbrManager may call switchCallback() at any time.
   *
   * @exportDoc
   */
  enable() {}

  /**
   * Disables automatic Stream suggestions. After this, the AbrManager may not
   * call switchCallback().
   *
   * @exportDoc
   */
  disable() {}

  /**
   * Notifies the AbrManager that a segment has been downloaded (includes MP4
   * SIDX data, WebM Cues data, initialization segments, and media segments).
   *
   * @param {number} deltaTimeMs The duration, in milliseconds, that the request
   *     took to complete.
   * @param {number} numBytes The total number of bytes transferred.
   * @param {boolean} allowSwitch Indicate if the segment is allowed to switch
   *     to another stream.
   * @param {shaka.extern.Request=} request
   *     A reference to the request
   * @param {shaka.extern.RequestContext=} context
   *     A reference to the request context
   * @exportDoc
   */
  segmentDownloaded(deltaTimeMs, numBytes, allowSwitch, request, context) {}

  /**
   * Notifies the ABR that it is a time to suggest new streams. This is used by
   * the Player when it finishes adding the last partial segment of a fast
   * switching stream.
   *
   * @exportDoc
   */
  trySuggestStreams() {}

  /**
   * Gets an estimate of the current bandwidth in bit/sec.  This is used by the
   * Player to generate stats.
   *
   * @return {number}
   * @exportDoc
   */
  getBandwidthEstimate() {}

  /**
   * Updates manager playback rate.
   *
   * @param {number} rate
   * @exportDoc
   */
  playbackRateChanged(rate) {}

  /**
   * Set media element.
   *
   * @param {HTMLMediaElement} mediaElement
   * @exportDoc
   */
  setMediaElement(mediaElement) {}

  /**
   * Set CMSD manager.
   *
   * @param {shaka.util.CmsdManager} cmsdManager
   * @exportDoc
   */
  setCmsdManager(cmsdManager) {}

  /**
   * Sets the ABR configuration.
   *
   * It is the responsibility of the AbrManager implementation to implement the
   * restrictions behavior described in shaka.extern.AbrConfiguration.
   *
   * @param {shaka.extern.AbrConfiguration} config
   * @exportDoc
   */
  configure(config) {}
};


/**
 * A callback into the Player that should be called when the AbrManager decides
 * it's time to change to a different variant.
 *
 * The first argument is a variant to switch to.
 *
 * The second argument is an optional boolean. If true, all data will be removed
 * from the buffer, which will result in a buffering event. Unless a third
 * argument is passed.
 *
 * The third argument in an optional number that specifies how much data (in
 * seconds) should be retained when clearing the buffer. This can help achieve
 * a fast switch that doesn't involve a buffering event. A minimum of two video
 * segments should always be kept buffered to avoid temporary hiccups.
 *
 * @typedef {function(shaka.extern.Variant, boolean=, number=)}
 * @exportDoc
 */
shaka.extern.AbrManager.SwitchCallback;


/**
 * A factory for creating the abr manager.
 *
 * @typedef {function():!shaka.extern.AbrManager}
 * @exportDoc
 */
shaka.extern.AbrManager.Factory;
