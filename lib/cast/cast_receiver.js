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

goog.provide('shaka.cast.CastReceiver');

goog.require('goog.asserts');
goog.require('shaka.cast.CastUtils');
goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Platform');
goog.require('shaka.util.Timer');


/**
 * A receiver to communicate between the Chromecast-hosted player and the
 * sender application.
 *
 * @constructor
 * @struct
 * @param {!HTMLMediaElement} video The local video element associated with the
 *   local Player instance.
 * @param {!shaka.Player} player A local Player instance.
 * @param {function(Object)=} appDataCallback A callback to handle
 *   application-specific data passed from the sender.  This can come either
 *   from a Shaka-based sender through CastProxy.setAppData, or from a
 *   sender using the customData field of the LOAD message of the standard
 *   Cast message namespace.  It can also be null if no such data is sent.
  * @param {function(string):string=} contentIdCallback A callback to
 *   retrieve manifest URI from the provided content id.
 * @implements {shaka.util.IDestroyable}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.cast.CastReceiver =
    function(video, player, appDataCallback, contentIdCallback) {
  shaka.util.FakeEventTarget.call(this);

  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /** @private {shaka.Player} */
  this.player_ = player;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {Object} */
  this.targets_ = {
    'video': video,
    'player': player,
  };

  /** @private {?function(Object)} */
  this.appDataCallback_ = appDataCallback || function() {};

  /** @private {?function(string):string} */
  this.contentIdCallback_ = contentIdCallback ||
                            /** @param {string} contentId
                                @return {string} */
                            function(contentId) { return contentId; };

  /** @private {boolean} */
  this.isConnected_ = false;

  /** @private {boolean} */
  this.isIdle_ = true;

  /** @private {number} */
  this.updateNumber_ = 0;

  /** @private {boolean} */
  this.startUpdatingUpdateNumber_ = false;

  /** @private {boolean} */
  this.initialStatusUpdatePending_ = true;

  /** @private {cast.receiver.CastMessageBus} */
  this.shakaBus_ = null;

  /** @private {cast.receiver.CastMessageBus} */
  this.genericBus_ = null;

  /** @private {shaka.util.Timer} */
  this.pollTimer_ = new shaka.util.Timer(() => {
    this.pollAttributes_();
  });

  this.init_();
};
goog.inherits(shaka.cast.CastReceiver, shaka.util.FakeEventTarget);


/**
 * @return {boolean} True if the cast API is available and there are receivers.
 * @export
 */
shaka.cast.CastReceiver.prototype.isConnected = function() {
  return this.isConnected_;
};


/**
 * @return {boolean} True if the receiver is not currently doing loading or
 *   playing anything.
 * @export
 */
shaka.cast.CastReceiver.prototype.isIdle = function() {
  return this.isIdle_;
};


/**
 * Destroys the underlying Player, then terminates the cast receiver app.
 *
 * @override
 * @export
 */
shaka.cast.CastReceiver.prototype.destroy = async function() {
  if (this.eventManager_) {
    this.eventManager_.release();
    this.eventManager_ = null;
  }

  const waitFor = [];
  if (this.player_) {
    waitFor.push(this.player_.destroy());
    this.player_ = null;
  }

  if (this.pollTimer_) {
    this.pollTimer_.stop();
    this.pollTimer_ = null;
  }

  this.video_ = null;
  this.targets_ = null;
  this.appDataCallback_ = null;
  this.isConnected_ = false;
  this.isIdle_ = true;
  this.shakaBus_ = null;
  this.genericBus_ = null;

  await Promise.all(waitFor);

  const manager = cast.receiver.CastReceiverManager.getInstance();
  manager.stop();
};


/** @private */
shaka.cast.CastReceiver.prototype.init_ = function() {
  let manager = cast.receiver.CastReceiverManager.getInstance();
  manager.onSenderConnected = this.onSendersChanged_.bind(this);
  manager.onSenderDisconnected = this.onSendersChanged_.bind(this);
  manager.onSystemVolumeChanged = this.fakeVolumeChangeEvent_.bind(this);

  this.genericBus_ = manager.getCastMessageBus(
      shaka.cast.CastUtils.GENERIC_MESSAGE_NAMESPACE);
  this.genericBus_.onMessage = this.onGenericMessage_.bind(this);

  this.shakaBus_ = manager.getCastMessageBus(
      shaka.cast.CastUtils.SHAKA_MESSAGE_NAMESPACE);
  this.shakaBus_.onMessage = this.onShakaMessage_.bind(this);

  if (goog.DEBUG) {
    // Sometimes it is useful to load the receiver app in Chrome to work on the
    // UI.  To avoid log spam caused by the SDK trying to connect to web sockets
    // that don't exist, in uncompiled mode we check if the hosting browser is a
    // Chromecast before starting the receiver manager.  We wouldn't do browser
    // detection except for debugging, so only do this in uncompiled mode.
    if (shaka.util.Platform.isChromecast()) {
      manager.start();
    }
  } else {
    manager.start();
  }

  shaka.cast.CastUtils.VideoEvents.forEach(function(name) {
    this.eventManager_.listen(
        this.video_, name, this.proxyEvent_.bind(this, 'video'));
  }.bind(this));

  shaka.cast.CastUtils.PlayerEvents.forEach(function(name) {
    this.eventManager_.listen(
        this.player_, name, this.proxyEvent_.bind(this, 'player'));
  }.bind(this));

  // In our tests, the original Chromecast seems to have trouble decoding above
  // 1080p.  It would be a waste to select a higher res anyway, given that the
  // device only outputs 1080p to begin with.

  // Chromecast has an extension to query the device/display's resolution.
  if (cast.__platform__ && cast.__platform__.canDisplayType(
      'video/mp4; codecs="avc1.640028"; width=3840; height=2160')) {
    // The device and display can both do 4k.  Assume a 4k limit.
    this.player_.setMaxHardwareResolution(3840, 2160);
  } else {
    // Chromecast has always been able to do 1080p.  Assume a 1080p limit.
    this.player_.setMaxHardwareResolution(1920, 1080);
  }

  // Do not start excluding values from update messages until the video is
  // fully loaded.
  this.eventManager_.listen(this.video_, 'loadeddata', function() {
    this.startUpdatingUpdateNumber_ = true;
  }.bind(this));

  // Maintain idle state.
  this.eventManager_.listen(this.player_, 'loading', function() {
    // No longer idle once loading.  This allows us to show the spinner during
    // the initial buffering phase.
    this.isIdle_ = false;
    this.onCastStatusChanged_();
  }.bind(this));
  this.eventManager_.listen(this.video_, 'playing', function() {
    // No longer idle once playing.  This allows us to replay a video without
    // reloading.
    this.isIdle_ = false;
    this.onCastStatusChanged_();
  }.bind(this));
  this.eventManager_.listen(this.video_, 'pause', function() {
    this.onCastStatusChanged_();
  }.bind(this));
  this.eventManager_.listen(this.player_, 'unloading', function() {
    // Go idle when unloading content.
    this.isIdle_ = true;
    this.onCastStatusChanged_();
  }.bind(this));
  this.eventManager_.listen(this.video_, 'ended', function() {
    // Go idle 5 seconds after 'ended', assuming we haven't started again or
    // been destroyed.
    const timer = new shaka.util.Timer(() => {
      if (this.video_ && this.video_.ended) {
        this.isIdle_ = true;
        this.onCastStatusChanged_();
      }
    });

    timer.tickAfter(/* seconds= */ 5);
  }.bind(this));

  // Do not start polling until after the sender's 'init' message is handled.
};


/** @private */
shaka.cast.CastReceiver.prototype.onSendersChanged_ = function() {
  // Reset update message frequency values, to make sure whomever joined
  // will get a full update message.
  this.updateNumber_ = 0;
  // Don't reset startUpdatingUpdateNumber_, because this operation does not
  // result in new data being loaded.
  this.initialStatusUpdatePending_ = true;

  let manager = cast.receiver.CastReceiverManager.getInstance();
  this.isConnected_ = manager.getSenders().length != 0;
  this.onCastStatusChanged_();
};


/**
 * Dispatch an event to notify the receiver app that the status has changed.
 * @private
 */
shaka.cast.CastReceiver.prototype.onCastStatusChanged_ = function() {
  // Do this asynchronously so that synchronous changes to idle state (such as
  // Player calling unload() as part of load()) are coalesced before the event
  // goes out.
  Promise.resolve().then(function() {
    if (!this.player_) {
      // We've already been destroyed.
      return;
    }

    let event = new shaka.util.FakeEvent('caststatuschanged');
    this.dispatchEvent(event);
    // Send a media status message, with a media info message if appropriate.
    if (!this.maybeSendMediaInfoMessage_()) {
      this.sendMediaStatus_(0);
    }
  }.bind(this));
};


/**
 * Take on initial state from the sender.
 * @param {shaka.cast.CastUtils.InitStateType} initState
 * @param {Object} appData
 * @private
 */
shaka.cast.CastReceiver.prototype.initState_ = function(initState, appData) {
  // Take on player state first.
  for (let k in initState['player']) {
    let v = initState['player'][k];
    // All player state vars are setters to be called.
    /** @type {Object} */(this.player_)[k](v);
  }

  // Now process custom app data, which may add additional player configs:
  this.appDataCallback_(appData);

  let manifestReady = Promise.resolve();
  let autoplay = this.video_.autoplay;

  // Now load the manifest, if present.
  if (initState['manifest']) {
    // Don't autoplay the content until we finish setting up initial state.
    this.video_.autoplay = false;
    manifestReady = this.player_.load(
        initState['manifest'], initState['startTime']);
  }

  // Finally, take on video state and player's "after load" state.
  manifestReady.then(() => {
    if (!this.player_) {
      // We've already been destroyed.
      return;
    }

    for (let k in initState['video']) {
      let v = initState['video'][k];
      this.video_[k] = v;
    }

    for (let k in initState['playerAfterLoad']) {
      let v = initState['playerAfterLoad'][k];
      // All player state vars are setters to be called.
      /** @type {Object} */(this.player_)[k](v);
    }

    // Restore original autoplay setting.
    this.video_.autoplay = autoplay;
    if (initState['manifest']) {
      // Resume playback with transferred state.
      this.video_.play();
      // Notify generic controllers of the state change.
      this.sendMediaStatus_(0);
    }
  }, (error) => {
    // Pass any errors through to the app.
    goog.asserts.assert(error instanceof shaka.util.Error,
                        'Wrong error type!');
    let event = new shaka.util.FakeEvent('error', {'detail': error});
    this.player_.dispatchEvent(event);
  });
};


/**
 * @param {string} targetName
 * @param {!Event} event
 * @private
 */
shaka.cast.CastReceiver.prototype.proxyEvent_ = function(targetName, event) {
  if (!this.player_) {
    // The receiver is destroyed, so it should ignore further events.
    return;
  }

  // Poll and send an update right before we send the event.  Some events
  // indicate an attribute change, so that change should be visible when the
  // event is handled.
  this.pollAttributes_();

  this.sendMessage_({
    'type': 'event',
    'targetName': targetName,
    'event': event,
  }, this.shakaBus_);
};


/** @private */
shaka.cast.CastReceiver.prototype.pollAttributes_ = function() {
  // The poll timer may have been pre-empted by an event (e.g. timeupdate).
  // Calling |start| will cancel any pending calls and therefore will avoid us
  // polling too often.
  this.pollTimer_.tickAfter(/* seconds= */ 0.5);

  let update = {
    'video': {},
    'player': {},
  };

  shaka.cast.CastUtils.VideoAttributes.forEach(function(name) {
    update['video'][name] = this.video_[name];
  }.bind(this));

  // TODO: Instead of this variable frequency update system, instead cache the
  // previous player state and only send over changed values, with complete
  // updates every ~20 updates to account for dropped messages.

  if (this.player_.isLive()) {
    for (let name in shaka.cast.CastUtils.PlayerGetterMethodsThatRequireLive) {
      let frequency =
          shaka.cast.CastUtils.PlayerGetterMethodsThatRequireLive[name];
      if (this.updateNumber_ % frequency == 0) {
        update['player'][name] = /** @type {Object} */ (this.player_)[name]();
      }
    }
  }
  for (let name in shaka.cast.CastUtils.PlayerGetterMethods) {
    let frequency = shaka.cast.CastUtils.PlayerGetterMethods[name];
    if (this.updateNumber_ % frequency == 0) {
      update['player'][name] = /** @type {Object} */ (this.player_)[name]();
    }
  }

  // Volume attributes are tied to the system volume.
  let manager = cast.receiver.CastReceiverManager.getInstance();
  let systemVolume = manager.getSystemVolume();
  if (systemVolume) {
    update['video']['volume'] = systemVolume.level;
    update['video']['muted'] = systemVolume.muted;
  }

  // Only start progressing the update number once data is loaded,
  // just in case any of the "rarely changing" properties with less frequent
  // update messages changes significantly during the loading process.
  if (this.startUpdatingUpdateNumber_) {
    this.updateNumber_ += 1;
  }

  this.sendMessage_({
    'type': 'update',
    'update': update,
  }, this.shakaBus_);

  this.maybeSendMediaInfoMessage_();
};


/**
 * Composes and sends a mediaStatus message if appropriate.
 * @return {boolean}
 * @private
 */
shaka.cast.CastReceiver.prototype.maybeSendMediaInfoMessage_ = function() {
  if (this.initialStatusUpdatePending_ &&
      (this.video_.duration || this.player_.isLive())) {
    // Send over a media status message to set the duration of the cast
    // dialogue.
    this.sendMediaInfoMessage_();
    this.initialStatusUpdatePending_ = false;
    return true;
  }
  return false;
};


/**
 * Composes and sends a mediaStatus message with a mediaInfo component.
 * @private
 */
shaka.cast.CastReceiver.prototype.sendMediaInfoMessage_ = function() {
  let media = {
    'contentId': this.player_.getAssetUri(),
    'streamType': this.player_.isLive() ? 'LIVE' : 'BUFFERED',
    'duration': this.video_.duration,
    // TODO: Is there a use case when this would be required?
    // Sending an empty string for now since it's a mandatory
    // field.
    'contentType': '',
  };
  this.sendMediaStatus_(0, media);
};


/**
 * Dispatch a fake 'volumechange' event to mimic the video element, since volume
 * changes are routed to the system volume on the receiver.
 * @private
 */
shaka.cast.CastReceiver.prototype.fakeVolumeChangeEvent_ = function() {
  // Volume attributes are tied to the system volume.
  let manager = cast.receiver.CastReceiverManager.getInstance();
  let systemVolume = manager.getSystemVolume();
  goog.asserts.assert(systemVolume, 'System volume should not be null!');

  if (systemVolume) {
    // Send an update message with just the latest volume level and muted state.
    this.sendMessage_({
      'type': 'update',
      'update': {
        'video': {
          'volume': systemVolume.level,
          'muted': systemVolume.muted,
        },
      },
    }, this.shakaBus_);
  }

  // Send another message with a 'volumechange' event to update the sender's UI.
  this.sendMessage_({
    'type': 'event',
    'targetName': 'video',
    'event': {'type': 'volumechange'},
  }, this.shakaBus_);
};


/**
 * Since this method is in the compiled library, make sure all messages are
 * read with quoted properties.
 * @param {!cast.receiver.CastMessageBus.Event} event
 * @private
 */
shaka.cast.CastReceiver.prototype.onShakaMessage_ = function(event) {
  let message = shaka.cast.CastUtils.deserialize(event.data);
  shaka.log.debug('CastReceiver: message', message);

  switch (message['type']) {
    case 'init':
      // Reset update message frequency values after initialization.
      this.updateNumber_ = 0;
      this.startUpdatingUpdateNumber_ = false;
      this.initialStatusUpdatePending_ = true;

      this.initState_(message['initState'], message['appData']);
      // The sender is supposed to reflect the cast system volume after
      // connecting.  Using fakeVolumeChangeEvent_() would create a race on the
      // sender side, since it would have volume properties, but no others.
      // This would lead to hasRemoteProperties() being true, even though a
      // complete set had never been sent.
      // Now that we have init state, this is a good time for the first update
      // message anyway.
      this.pollAttributes_();
      break;
    case 'appData':
      this.appDataCallback_(message['appData']);
      break;
    case 'set': {
      let targetName = message['targetName'];
      let property = message['property'];
      let value = message['value'];

      if (targetName == 'video') {
        // Volume attributes must be rerouted to the system.
        let manager = cast.receiver.CastReceiverManager.getInstance();
        if (property == 'volume') {
          manager.setSystemVolumeLevel(value);
          break;
        } else if (property == 'muted') {
          manager.setSystemVolumeMuted(value);
          break;
        }
      }

      this.targets_[targetName][property] = value;
      break;
    }
    case 'call': {
      let targetName = message['targetName'];
      let methodName = message['methodName'];
      let args = message['args'];
      let target = this.targets_[targetName];
      target[methodName].apply(target, args);
      break;
    }
    case 'asyncCall': {
      let targetName = message['targetName'];
      let methodName = message['methodName'];
      if (targetName == 'player' && methodName == 'load') {
        // Reset update message frequency values after a load.
        this.updateNumber_ = 0;
        this.startUpdatingUpdateNumber_ = false;
      }
      let args = message['args'];
      let id = message['id'];
      let senderId = event.senderId;
      let target = this.targets_[targetName];
      let p = target[methodName].apply(target, args);
      if (targetName == 'player' && methodName == 'load') {
        // Wait until the manifest has actually loaded to send another media
        // info message, so on a new load it doesn't send the old info over.
        p = p.then(function() {
          this.initialStatusUpdatePending_ = true;
        }.bind(this));
      }
      // Replies must go back to the specific sender who initiated, so that we
      // don't have to deal with conflicting IDs between senders.
      p.then(this.sendAsyncComplete_.bind(this, senderId, id, /* error */ null),
             this.sendAsyncComplete_.bind(this, senderId, id));
      break;
    }
  }
};


/**
 * @param {!cast.receiver.CastMessageBus.Event} event
 * @private
 */
shaka.cast.CastReceiver.prototype.onGenericMessage_ = function(event) {
  let message = shaka.cast.CastUtils.deserialize(event.data);
  shaka.log.debug('CastReceiver: message', message);
  // TODO(ismena): error message on duplicate request id from the same sender
  switch (message['type']) {
    case 'PLAY':
      this.video_.play();
      // Notify generic controllers that the player state changed.
      // requestId=0 (the parameter) means that the message was not
      // triggered by a GET_STATUS request.
      this.sendMediaStatus_(0);
      break;
    case 'PAUSE':
      this.video_.pause();
      this.sendMediaStatus_(0);
      break;
    case 'SEEK': {
      let currentTime = message['currentTime'];
      let resumeState = message['resumeState'];
      if (currentTime != null) {
        this.video_.currentTime = Number(currentTime);
      }
      if (resumeState && resumeState == 'PLAYBACK_START') {
        this.video_.play();
        this.sendMediaStatus_(0);
      } else if (resumeState && resumeState == 'PLAYBACK_PAUSE') {
        this.video_.pause();
        this.sendMediaStatus_(0);
      }
      break;
    }
    case 'STOP':
      this.player_.unload().then(function() {
        if (!this.player_) {
          // We've already been destroyed.
          return;
        }

        this.sendMediaStatus_(0);
      }.bind(this));
      break;
    case 'GET_STATUS':
      // TODO(ismena): According to the SDK this is supposed to be a
      // unicast message to the sender that requested the status,
      // but it doesn't appear to be working.
      // Look into what's going on there and change this to be a
      // unicast.
      this.sendMediaStatus_(Number(message['requestId']));
      break;
    case 'VOLUME': {
      let volumeObject = message['volume'];
      let level = volumeObject['level'];
      let muted = volumeObject['muted'];
      let oldVolumeLevel = this.video_.volume;
      let oldVolumeMuted = this.video_.muted;
      if (level != null) {
        this.video_.volume = Number(level);
      }
      if (muted != null) {
        this.video_.muted = muted;
      }
      // Notify generic controllers if the volume changed.
      if (oldVolumeLevel != this.video_.volume ||
          oldVolumeMuted != this.video_.muted) {
        this.sendMediaStatus_(0);
      }
      break;
    }
    case 'LOAD': {
      // Reset update message frequency values after a load.
      this.updateNumber_ = 0;
      this.startUpdatingUpdateNumber_ = false;
      this.initialStatusUpdatePending_ = false; // This already sends an update.

      let mediaInfo = message['media'];
      let contentId = mediaInfo['contentId'];
      let currentTime = message['currentTime'];
      let assetUri = this.contentIdCallback_(contentId);
      let autoplay = message['autoplay'] || true;
      let customData = mediaInfo['customData'];

      this.appDataCallback_(customData);

      if (autoplay) {
        this.video_.autoplay = true;
      }
      this.player_.load(assetUri, currentTime).then(function() {
        if (!this.player_) {
          // We've already been destroyed.
          return;
        }

        // Notify generic controllers that the media has changed.
        this.sendMediaInfoMessage_();
      }.bind(this)).catch(function(error) {
        // Load failed.  Dispatch the error message to the sender.
        let type = 'LOAD_FAILED';
        if (error.category == shaka.util.Error.Category.PLAYER &&
            error.code == shaka.util.Error.Code.LOAD_INTERRUPTED) {
          type = 'LOAD_CANCELLED';
        }

        this.sendMessage_({
          'requestId': Number(message['requestId']),
          'type': type,
        }, this.genericBus_);
      }.bind(this));
      break;
    }
    default:
      shaka.log.warning(
          'Unrecognized message type from the generic Chromecast controller!',
          message['type']);
      // Dispatch an error to the sender.
      this.sendMessage_({
        'requestId': Number(message['requestId']),
        'type': 'INVALID_REQUEST',
        'reason': 'INVALID_COMMAND',
      }, this.genericBus_);
      break;
  }
};


/**
 * Tell the sender that the async operation is complete.
 * @param {string} senderId
 * @param {string} id
 * @param {shaka.util.Error} error
 * @private
 */
shaka.cast.CastReceiver.prototype.sendAsyncComplete_ =
    function(senderId, id, error) {
  if (!this.player_) {
    // We've already been destroyed.
    return;
  }

  this.sendMessage_({
    'type': 'asyncComplete',
    'id': id,
    'error': error,
  }, this.shakaBus_, senderId);
};


/**
 * Since this method is in the compiled library, make sure all messages passed
 * in here were created with quoted property names.
 * @param {!Object} message
 * @param {cast.receiver.CastMessageBus} bus
 * @param {string=} senderId
 * @private
 */
shaka.cast.CastReceiver.prototype.sendMessage_ =
    function(message, bus, senderId) {
  // Cuts log spam when debugging the receiver UI in Chrome.
  if (!this.isConnected_) return;

  let serialized = shaka.cast.CastUtils.serialize(message);
  if (senderId) {
    bus.getCastChannel(senderId).send(serialized);
  } else {
    bus.broadcast(serialized);
  }
};


/**
 * @return {string}
 * @private
 */
shaka.cast.CastReceiver.prototype.getPlayState_ = function() {
  let playState = shaka.cast.CastReceiver.PLAY_STATE;
  if (this.isIdle_) {
    return playState.IDLE;
  } else if (this.player_.isBuffering()) {
    return playState.BUFFERING;
  } else if (this.video_.paused) {
    return playState.PAUSED;
  } else {
    return playState.PLAYING;
  }
};


/**
 * @param {number} requestId
 * @param {Object=} media
 * @private
 */
shaka.cast.CastReceiver.prototype.sendMediaStatus_ =
    function(requestId, media) {
  let mediaStatus = {
    // mediaSessionId is a unique ID for the playback of this specific session.
    // It's used to identify a specific instance of a playback.
    // We don't support multiple playbacks, so just return 0.
    'mediaSessionId': 0,
    'playbackRate': this.video_.playbackRate,
    'playerState': this.getPlayState_(),
    'currentTime': this.video_.currentTime,
    // supportedMediaCommands is a sum of all the flags of commands that the
    // player supports.
    // The list of comands with respective flags is:
    // 1 - Pause
    // 2 - Seek
    // 4 - Stream volume
    // 8 - Stream mute
    // 16 - Skip forward
    // 32 - Skip backward
    // We support pause, seek, volume and mute which gives a value of
    // 1+2+4+8=15
    'supportedMediaCommands': 15,
    'volume': {
      'level': this.video_.volume,
      'muted': this.video_.muted,
    },
  };

  if (media) {
    mediaStatus['media'] = media;
  }

  let ret = {
    'requestId': requestId,
    'type': 'MEDIA_STATUS',
    'status': [mediaStatus],
  };

  this.sendMessage_(ret, this.genericBus_);
};


/**
 * @enum {string}
 */
shaka.cast.CastReceiver.PLAY_STATE = {
  IDLE: 'IDLE',
  PLAYING: 'PLAYING',
  BUFFERING: 'BUFFERING',
  PAUSED: 'PAUSED',
};
