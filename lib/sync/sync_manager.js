/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 * This module provides real-time playback synchronization across multiple
 * clients using PubNub. It allows multiple viewers to watch video content
 * together with synchronized play, pause, and seek actions.
 *
 * Usage:
 *   const syncManager = new shaka.sync.SyncManager(player, {
 *     publishKey: 'your-pubnub-publish-key',
 *     subscribeKey: 'your-pubnub-subscribe-key'
 *   });
 *   await syncManager.connect('room-123');
 */

goog.provide('shaka.sync.SyncManager');

goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');


/**
 * SyncManager enables real-time playback synchronization between multiple
 * clients using PubNub as the messaging layer. One client acts as the
 * "master" (controlling playback) while others are "followers" (receiving
 * sync commands).
 *
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.sync.SyncManager = class extends shaka.util.FakeEventTarget {
  /**
   * Creates a new SyncManager instance.
   *
   * @param {!shaka.Player} player
   *   The Shaka Player instance to synchronize.
   * @param {shaka.sync.SyncManager.Config} config
   *   Configuration object containing PubNub credentials.
   */
  constructor(player, config) {
    super();

    /**
     * Reference to the Shaka Player instance we're synchronizing.
     * @private {!shaka.Player}
     */
    this.player_ = player;

    /**
     * Reference to the HTML video element from the player.
     * @private {HTMLMediaElement}
     */
    this.video_ = player.getMediaElement();

    /**
     * PubNub configuration provided by the user.
     * @private {shaka.sync.SyncManager.Config}
     */
    this.config_ = config;

    /**
     * The PubNub client instance. Will be initialized when connect() is called.
     * Note: PubNub must be loaded separately (via script tag or npm).
     * @private {?Object}
     */
    this.pubnub_ = null;

    /**
     * The PubNub subscription object for the current room.
     * @private {?Object}
     */
    this.subscription_ = null;

    /**
     * The name of the PubNub channel (sync room) we're connected to.
     * @private {string}
     */
    this.channelName_ = '';

    /**
     * Unique identifier for this client instance.
     * Generated automatically if not provided in config.
     * @private {string}
     */
    this.userId_ = config.userId || this.generateUserId_();

    /**
     * The role of this client in the sync session.
     * 'master' = controls playback for everyone
     * 'follower' = receives and applies sync commands
     * @private {string}
     */
    this.role_ = 'follower';

    /**
     * Flag to prevent infinite loops when applying remote commands.
     * When true, local video events won't trigger broadcasts.
     * @private {boolean}
     */
    this.isProcessingRemoteCommand_ = false;

    /**
     * Flag indicating if we're currently connected to a sync room.
     * @private {boolean}
     */
    this.isConnected_ = false;

    /**
     * Interval ID for periodic sync pulses (keeps clients aligned).
     * @private {?number}
     */
    this.syncIntervalId_ = null;

    /**
     * Maximum allowed drift (in seconds) before forcing a time correction.
     * Clients within this threshold won't be adjusted to avoid jitter.
     * @private {number}
     */
    this.maxDriftThreshold_ = config.maxDriftThreshold || 0.5;

    /**
     * How often (in ms) to send sync pulses when master is playing.
     * @private {number}
     */
    this.syncIntervalMs_ = config.syncIntervalMs || 5000;

    /**
     * Bound event handler references for easy removal during cleanup.
     * @private {Object<string, Function>}
     */
    this.boundHandlers_ = {
      onPlay: () => this.onLocalPlay_(),
      onPause: () => this.onLocalPause_(),
      onSeeked: () => this.onLocalSeeked_(),
      onRateChange: () => this.onLocalRateChange_(),
    };

    shaka.log.info('SyncManager created with userId:', this.userId_);
  }


  /**
   * Connects to a sync room and begins listening for sync commands.
   * Also attaches event listeners to the local video element.
   *
   * @param {string} roomId
   *   Unique identifier for the sync room. All clients with the same
   *   roomId will be synchronized together.
   * @export
   */
  connect(roomId) {
    // Validate that PubNub is available globally
    if (typeof PubNub === 'undefined') {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.SYNC_PUBNUB_NOT_LOADED,
          'PubNub SDK not found. Include it via script tag or npm.');
    }

    // Validate configuration
    if (!this.config_.publishKey || !this.config_.subscribeKey) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.SYNC_INVALID_CONFIG,
          'PubNub publishKey and subscribeKey are required.');
    }

    // Validate video element exists
    if (!this.video_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.SYNC_NO_VIDEO_ELEMENT,
          'No video element attached to player.');
    }

    this.channelName_ = roomId;

    shaka.log.info('Connecting to sync room:', this.channelName_);

    // Initialize PubNub client
    this.pubnub_ = new PubNub({
      publishKey: this.config_.publishKey,
      subscribeKey: this.config_.subscribeKey,
      userId: this.userId_,
      // Enable the event engine for better connection management
      enableEventEngine: true,
    });

    // Set up PubNub status listener for connection events
    this.pubnub_.addListener({
      status: (statusEvent) => this.onPubNubStatus_(statusEvent),
    });

    // Create subscription for the sync room channel
    const channel = this.pubnub_.channel(this.channelName_);
    this.subscription_ = channel.subscription({
      receivePresenceEvents: true,  // Know when users join/leave
    });

    // Set up message handler for incoming sync commands
    this.subscription_.onMessage = (event) => this.onPubNubMessage_(event);

    // Set up presence handler for user join/leave events
    this.subscription_.onPresence = (event) => this.onPubNubPresence_(event);

    // Subscribe to the channel
    this.subscription_.subscribe();

    // Attach local video event listeners
    this.attachVideoListeners_();

    this.isConnected_ = true;

    shaka.log.info('Successfully connected to sync room:', roomId);
  }


  /**
   * Disconnects from the current sync room and cleans up resources.
   *
   * @export
   */
  disconnect() {
    shaka.log.info('Disconnecting from sync room:', this.channelName_);

    // Stop the sync interval if running
    if (this.syncIntervalId_) {
      clearInterval(this.syncIntervalId_);
      this.syncIntervalId_ = null;
    }

    // Remove video event listeners
    this.detachVideoListeners_();

    // Unsubscribe from PubNub channel
    if (this.subscription_) {
      this.subscription_.unsubscribe();
      this.subscription_ = null;
    }

    // Clean up PubNub client
    if (this.pubnub_) {
      this.pubnub_.removeAllListeners();
      this.pubnub_.destroy();
      this.pubnub_ = null;
    }

    this.isConnected_ = false;
    this.role_ = 'follower';
    this.channelName_ = '';

    shaka.log.info('Disconnected from sync room');
  }


  /**
   * Makes this client the master controller.
   * The master's playback actions will be broadcast to all followers.
   * Only one client should be master at a time.
   *
   * @export
   */
  becomeMaster() {
    shaka.log.info('This client is now the MASTER controller');
    this.role_ = 'master';

    // Broadcast our current state to sync all followers immediately
    this.broadcastFullState_();

    // Start periodic sync pulses to keep followers aligned
    this.startSyncInterval_();
  }


  /**
   * Makes this client a follower.
   * Followers receive and apply sync commands from the master.
   *
   * @export
   */
  becomeFollower() {
    shaka.log.info('This client is now a FOLLOWER');
    this.role_ = 'follower';

    // Stop sync interval (only masters send sync pulses)
    if (this.syncIntervalId_) {
      clearInterval(this.syncIntervalId_);
      this.syncIntervalId_ = null;
    }
  }


  /**
   * Returns the current role of this client.
   *
   * @return {string} Either 'master' or 'follower'
   * @export
   */
  getRole() {
    return this.role_;
  }


  /**
   * Returns whether we're currently connected to a sync room.
   *
   * @return {boolean}
   * @export
   */
  isConnected() {
    return this.isConnected_;
  }


  /**
   * Returns the current room/channel name.
   *
   * @return {string}
   * @export
   */
  getRoomId() {
    // Remove the 'shaka-sync-' prefix to return just the room ID
    return this.channelName_.replace('shaka-sync-', '');
  }


  /**
   * Returns this client's user ID.
   *
   * @return {string}
   * @export
   */
  getUserId() {
    return this.userId_;
  }


  /**
   * Destroys the SyncManager and releases all resources.
   * Required by IDestroyable interface.
   *
   * @override
   * @export
   */
  async destroy() {
    await this.disconnect();
    this.player_ = null;
    this.video_ = null;
    this.config_ = null;
    this.boundHandlers_ = null;
  }


  // =========================================================================
  // PRIVATE METHODS - Video Event Handlers
  // =========================================================================


  /**
   * Attaches event listeners to the video element.
   * These listeners capture local playback actions to broadcast.
   *
   * @private
   */
  attachVideoListeners_() {
    if (!this.video_) {
      return;
    }

    this.video_.addEventListener('play', this.boundHandlers_.onPlay);
    this.video_.addEventListener('pause', this.boundHandlers_.onPause);
    this.video_.addEventListener('seeked', this.boundHandlers_.onSeeked);
    this.video_.addEventListener(
        'ratechange', this.boundHandlers_.onRateChange);

    shaka.log.debug('Video event listeners attached');
  }


  /**
   * Removes event listeners from the video element.
   *
   * @private
   */
  detachVideoListeners_() {
    if (!this.video_) {
      return;
    }

    this.video_.removeEventListener('play', this.boundHandlers_.onPlay);
    this.video_.removeEventListener('pause', this.boundHandlers_.onPause);
    this.video_.removeEventListener('seeked', this.boundHandlers_.onSeeked);
    this.video_.removeEventListener(
        'ratechange', this.boundHandlers_.onRateChange);

    shaka.log.debug('Video event listeners detached');
  }


  /**
   * Called when the local video starts playing.
   * If we're the master, broadcast play command to followers.
   *
   * @private
   */
  onLocalPlay_() {
    // Don't broadcast if we're processing a remote command (prevents loops)
    if (this.isProcessingRemoteCommand_) {
      return;
    }

    // Only masters broadcast commands
    if (this.role_ !== 'master') {
      return;
    }

    shaka.log.debug('Local PLAY detected, broadcasting to followers');
    this.broadcastCommand_('play', {
      currentTime: this.video_.currentTime,
    });
  }


  /**
   * Called when the local video is paused.
   * If we're the master, broadcast pause command to followers.
   *
   * @private
   */
  onLocalPause_() {
    if (this.isProcessingRemoteCommand_) {
      return;
    }

    if (this.role_ !== 'master') {
      return;
    }

    shaka.log.debug('Local PAUSE detected, broadcasting to followers');
    this.broadcastCommand_('pause', {
      currentTime: this.video_.currentTime,
    });
  }


  /**
   * Called when the local video seek completes.
   * If we're the master, broadcast seek command to followers.
   *
   * @private
   */
  onLocalSeeked_() {
    if (this.isProcessingRemoteCommand_) {
      return;
    }

    if (this.role_ !== 'master') {
      return;
    }

    shaka.log.debug('Local SEEK detected, broadcasting to followers');
    this.broadcastCommand_('seek', {
      currentTime: this.video_.currentTime,
    });
  }


  /**
   * Called when the local video playback rate changes.
   * If we're the master, broadcast rate change to followers.
   *
   * @private
   */
  onLocalRateChange_() {
    if (this.isProcessingRemoteCommand_) {
      return;
    }

    if (this.role_ !== 'master') {
      return;
    }

    shaka.log.debug('Local RATE CHANGE detected, broadcasting to followers');
    this.broadcastCommand_('ratechange', {
      playbackRate: this.video_.playbackRate,
    });
  }


  // =========================================================================
  // PRIVATE METHODS - PubNub Communication
  // =========================================================================


  /**
   * Broadcasts a sync command to all clients in the room.
   *
   * @param {string} command
   *   The command type: 'play', 'pause', 'seek', 'sync', 'ratechange'
   * @param {Object} payload
   *   Command-specific data (currentTime, playbackRate, etc.)
   * @private
   */
  async broadcastCommand_(command, payload) {
    if (!this.pubnub_ || !this.isConnected_) {
      shaka.log.warning('Cannot broadcast: not connected');
      return;
    }

    const message = {
      type: 'SYNC_COMMAND',
      command: command,
      payload: Object.assign({}, payload, {
        timestamp: Date.now(),
        senderId: this.userId_,
        isPaused: this.video_.paused,
      }),
    };

    try {
      await this.pubnub_.publish({
        channel: this.channelName_,
        message: message,
      });
      shaka.log.debug('Broadcast command:', command, payload);
    } catch (error) {
      shaka.log.error('Failed to broadcast command:', error);
    }
  }


  /**
   * Broadcasts the full current state (time, paused, rate).
   * Used when becoming master to immediately sync all followers.
   *
   * @private
   */
  broadcastFullState_() {
    this.broadcastCommand_('sync', {
      currentTime: this.video_.currentTime,
      playbackRate: this.video_.playbackRate,
      isPaused: this.video_.paused,
    });
  }


  /**
   * Starts the periodic sync interval.
   * While playing, master sends sync pulses to keep followers aligned.
   *
   * @private
   */
  startSyncInterval_() {
    // Clear any existing interval
    if (this.syncIntervalId_) {
      clearInterval(this.syncIntervalId_);
    }

    this.syncIntervalId_ = setInterval(() => {
      // Only send sync pulses if we're master and video is playing
      if (this.role_ === 'master' && !this.video_.paused) {
        this.broadcastFullState_();
      }
    }, this.syncIntervalMs_);

    shaka.log.debug('Sync interval started:', this.syncIntervalMs_, 'ms');
  }


  /**
   * Handles incoming PubNub messages (sync commands from master).
   *
   * @param {Object} event
   *   The PubNub message event.
   * @private
   */
  onPubNubMessage_(event) {
    const message = event.message;

    // Ignore our own messages
    if (message.payload && message.payload.senderId === this.userId_) {
      return;
    }

    // Ignore non-sync messages
    if (message.type !== 'SYNC_COMMAND') {
      return;
    }

    // Only followers process sync commands
    if (this.role_ !== 'follower') {
      return;
    }

    shaka.log.debug('Received sync command:', message.command);
    this.applyRemoteCommand_(message.command, message.payload);
  }


  /**
   * Applies a sync command received from the master.
   *
   * @param {string} command
   *   The command type.
   * @param {Object} payload
   *   The command payload.
   * @private
   */
  applyRemoteCommand_(command, payload) {
    // Set flag to prevent our local events from re-broadcasting
    this.isProcessingRemoteCommand_ = true;

    // Calculate network latency for time compensation
    const latencyMs = Date.now() - payload.timestamp;
    const latencySec = latencyMs / 1000;

    shaka.log.debug('Applying remote command:', command,
        'latency:', latencyMs, 'ms');

    switch (command) {
      case 'play':
        // Adjust time for latency and start playing
        this.video_.currentTime = payload.currentTime + latencySec;
        this.video_.play().catch((e) => {
          shaka.log.warning('Play failed (may need user interaction):', e);
        });
        break;

      case 'pause':
        // Pause and sync to exact time
        this.video_.pause();
        this.video_.currentTime = payload.currentTime;
        break;

      case 'seek':
        // Seek to the specified time (adjusted for latency)
        this.video_.currentTime = payload.currentTime + latencySec;
        break;

      case 'ratechange':
        // Change playback speed
        this.video_.playbackRate = payload.playbackRate;
        break;

      case 'sync':
        // Periodic sync pulse - only correct if drift exceeds threshold
        this.handleSyncPulse_(payload, latencySec);
        break;

      default:
        shaka.log.warning('Unknown sync command:', command);
    }

    // Re-enable local event broadcasting after a short delay
    // This prevents the events triggered by our changes from being broadcast
    setTimeout(() => {
      this.isProcessingRemoteCommand_ = false;
    }, 100);
  }


  /**
   * Handles a periodic sync pulse from the master.
   * Only adjusts time if the drift exceeds the threshold.
   *
   * @param {Object} payload
   *   The sync payload containing currentTime, playbackRate, isPaused.
   * @param {number} latencySec
   *   The calculated network latency in seconds.
   * @private
   */
  handleSyncPulse_(payload, latencySec) {
    // Calculate expected time (master time + latency compensation)
    const expectedTime = payload.currentTime + latencySec;

    // Calculate how far we've drifted from master
    const drift = Math.abs(this.video_.currentTime - expectedTime);

    shaka.log.v2('Sync pulse - drift:', drift.toFixed(3), 'sec');

    // Only adjust if drift exceeds threshold (prevents jitter)
    if (drift > this.maxDriftThreshold_) {
      shaka.log.debug('Drift exceeded threshold, correcting time');
      this.video_.currentTime = expectedTime;
    }

    // Sync playback rate if different
    if (this.video_.playbackRate !== payload.playbackRate) {
      this.video_.playbackRate = payload.playbackRate;
    }

    // Sync play/pause state
    if (payload.isPaused && !this.video_.paused) {
      this.video_.pause();
    } else if (!payload.isPaused && this.video_.paused) {
      this.video_.play().catch((e) => {
        shaka.log.warning('Play failed during sync:', e);
      });
    }
  }


  /**
   * Handles PubNub connection status events.
   *
   * @param {Object} statusEvent
   *   The PubNub status event.
   * @private
   */
  onPubNubStatus_(statusEvent) {
    shaka.log.debug('PubNub status:', statusEvent.category);

    if (statusEvent.category === 'PNConnectedCategory') {
      shaka.log.info('PubNub connected successfully');
    } else if (statusEvent.category === 'PNNetworkIssuesCategory') {
      shaka.log.warning('PubNub network issues detected');
    } else if (statusEvent.category === 'PNReconnectedCategory') {
      shaka.log.info('PubNub reconnected');
    }
  }


  /**
   * Handles PubNub presence events (users joining/leaving).
   *
   * @param {Object} presenceEvent
   *   The PubNub presence event.
   * @private
   */
  onPubNubPresence_(presenceEvent) {
    shaka.log.debug('Presence event:', presenceEvent.action,
        presenceEvent.uuid);

    // You could emit events here for UI updates
    // e.g., this.dispatchEvent(new shaka.util.FakeEvent('userjoined', ...))
  }


  // =========================================================================
  // PRIVATE METHODS - Utilities
  // =========================================================================


  /**
   * Generates a unique user ID for this client.
   *
   * @return {string}
   * @private
   */
  generateUserId_() {
    return 'shaka-user-' + Math.random().toString(36).substr(2, 9);
  }
};


/**
 * Configuration object for SyncManager.
 *
 * @typedef {{
 *   publishKey: string,
 *   subscribeKey: string,
 *   userId: (string|undefined),
 *   maxDriftThreshold: (number|undefined),
 *   syncIntervalMs: (number|undefined)
 * }}
 *
 * @property {string} publishKey
 *   Your PubNub publish key from the PubNub Admin Dashboard.
 * @property {string} subscribeKey
 *   Your PubNub subscribe key from the PubNub Admin Dashboard.
 * @property {string|undefined} userId
 *   Optional unique identifier for this client. If not provided,
 *   a random ID will be generated.
 * @property {number|undefined} maxDriftThreshold
 *   Maximum allowed time drift (in seconds) before forcing correction.
 *   Default is 0.5 seconds.
 * @property {number|undefined} syncIntervalMs
 *   How often (in milliseconds) to send sync pulses. Default is 5000ms.
 * @exportDoc
 */
shaka.sync.SyncManager.Config;


// Register custom error codes for sync-related errors
// These should be added to shaka.util.Error.Code enum
// For now, we use high numbers to avoid conflicts
shaka.sync.SyncManager.ErrorCode = {
  SYNC_PUBNUB_NOT_LOADED: 9001,
  SYNC_INVALID_CONFIG: 9002,
  SYNC_NO_VIDEO_ELEMENT: 9003,
};

