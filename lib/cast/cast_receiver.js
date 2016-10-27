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
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');



/**
 * A receiver to communicate between the Chromecast-hosted player and the
 * sender application.
 *
 * @constructor
 * @struct
 * @param {!HTMLMediaElement} video The local video element associated with the
 *   local Player instance.
 * @param {!shaka.Player} player A local Player instance.
 * @param {function(Object)=} opt_appDataCallback A callback to handle
 *   application-specific data passed from the sender.
 * @implements {shaka.util.IDestroyable}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.cast.CastReceiver = function(video, player, opt_appDataCallback) {
  shaka.util.FakeEventTarget.call(this);

  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /** @private {shaka.Player} */
  this.player_ = player;

  /** @private {Object} */
  this.targets_ = {
    'video': video,
    'player': player
  };

  /** @private {?function(Object)} */
  this.appDataCallback_ = opt_appDataCallback || function() {};

  /** @private {boolean} */
  this.isConnected_ = false;

  /** @private {boolean} */
  this.isIdle_ = true;

  /** @private {cast.receiver.CastMessageBus} */
  this.bus_ = null;

  /** @private {?number} */
  this.pollTimerId_ = null;

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
shaka.cast.CastReceiver.prototype.destroy = function() {
  var p = this.player_ ? this.player_.destroy() : Promise.resolve();

  if (this.pollTimerId_ != null) {
    window.clearTimeout(this.pollTimerId_);
  }

  this.video_ = null;
  this.player_ = null;
  this.targets_ = null;
  this.appDataCallback_ = null;
  this.isConnected_ = false;
  this.isIdle_ = true;
  this.bus_ = null;
  this.pollTimerId_ = null;

  return p.then(function() {
    var manager = cast.receiver.CastReceiverManager.getInstance();
    manager.stop();
  });
};


/** @private */
shaka.cast.CastReceiver.prototype.init_ = function() {
  var manager = cast.receiver.CastReceiverManager.getInstance();
  manager.onSenderConnected = this.onSendersChanged_.bind(this);
  manager.onSenderDisconnected = this.onSendersChanged_.bind(this);
  manager.onSystemVolumeChanged = this.fakeVolumeChangeEvent_.bind(this);

  this.bus_ = manager.getCastMessageBus(shaka.cast.CastUtils.MESSAGE_NAMESPACE);
  this.bus_.onMessage = this.onMessage_.bind(this);

  if (!COMPILED) {
    // Sometimes it is useful to load the receiver app in Chrome to work on the
    // UI.  To avoid log spam caused by the SDK trying to connect to web sockets
    // that don't exist, in uncompiled mode we check if the hosting browser is a
    // Chromecast before starting the receiver manager.  We wouldn't do browser
    // detection except for debugging, so only do this in uncompiled mode.
    var isChromecast = navigator.userAgent.indexOf('CrKey') >= 0;
    if (isChromecast) {
      manager.start();
    }
  } else {
    manager.start();
  }

  shaka.cast.CastUtils.VideoEvents.forEach(function(name) {
    this.video_.addEventListener(name, this.proxyEvent_.bind(this, 'video'));
  }.bind(this));

  shaka.cast.CastUtils.PlayerEvents.forEach(function(name) {
    this.player_.addEventListener(name, this.proxyEvent_.bind(this, 'player'));
  }.bind(this));

  // Limit streams to 1080p.  In our tests, the original Chromecast seems to
  // have trouble decoding above this limit.  It would be a waste to select a
  // higher res anyway, given that the device only outputs 1080p to begin with.
  this.player_.setMaxHardwareResolution(1920, 1080);

  // Maintain idle state.
  this.player_.addEventListener('loading', function() {
    // No longer idle once loading.  This allows us to show the spinner during
    // the initial buffering phase.
    this.isIdle_ = false;
    this.onCastStatusChanged_();
  }.bind(this));
  this.video_.addEventListener('playing', function() {
    // No longer idle once playing.  This allows us to replay a video without
    // reloading.
    this.isIdle_ = false;
    this.onCastStatusChanged_();
  }.bind(this));
  this.player_.addEventListener('unloading', function() {
    // Go idle when unloading content.
    this.isIdle_ = true;
    this.onCastStatusChanged_();
  }.bind(this));
  this.video_.addEventListener('ended', function() {
    // Go idle 5 seconds after 'ended', assuming we haven't started again or
    // been destroyed.
    window.setTimeout(function() {
      if (this.video_ && this.video_.ended) {
        this.isIdle_ = true;
        this.onCastStatusChanged_();
      }
    }.bind(this), 5000);
  }.bind(this));

  // Do not start polling until after the sender's 'init' message is handled.
};


/** @private */
shaka.cast.CastReceiver.prototype.onSendersChanged_ = function() {
  var manager = cast.receiver.CastReceiverManager.getInstance();
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
    var event = new shaka.util.FakeEvent('caststatuschanged');
    this.dispatchEvent(event);
  }.bind(this));
};


/**
 * Take on initial state from the sender.
 * @param {shaka.cast.CastUtils.InitStateType} initState
 * @param {Object} appData
 * @private
 * @suppress {unnecessaryCasts}
 */
shaka.cast.CastReceiver.prototype.initState_ = function(initState, appData) {
  // Take on player state first.
  for (var k in initState['player']) {
    var v = initState['player'][k];
    // All player state vars are setters to be called.
    /** @type {Object} */(this.player_)[k](v);
  }

  // Now process custom app data, which may add additional player configs:
  this.appDataCallback_(appData);

  var manifestReady = Promise.resolve();
  var autoplay = this.video_.autoplay;

  // Now load the manifest, if present.
  if (initState['manifest']) {
    // Don't autoplay the content until we finish setting up initial state.
    this.video_.autoplay = false;
    manifestReady = this.player_.load(
        initState['manifest'], initState['startTime']);
    // Pass any errors through to the app.
    manifestReady.catch(function(error) {
      goog.asserts.assert(error instanceof shaka.util.Error,
                          'Wrong error type!');
      var event = new shaka.util.FakeEvent('error', { 'detail': error });
      this.player_.dispatchEvent(event);
    }.bind(this));
  }

  // Finally, take on video state and player's "after load" state.
  manifestReady.then(function() {
    for (var k in initState['video']) {
      var v = initState['video'][k];
      this.video_[k] = v;
    }

    for (var k in initState['playerAfterLoad']) {
      var v = initState['playerAfterLoad'][k];
      // All player state vars are setters to be called.
      /** @type {Object} */(this.player_)[k](v);
    }

    // Restore original autoplay setting.
    this.video_.autoplay = autoplay;
    if (initState['manifest']) {
      // Resume playback with transferred state.
      this.video_.play();
    }
  }.bind(this));
};


/**
 * @param {string} targetName
 * @param {!Event} event
 * @private
 */
shaka.cast.CastReceiver.prototype.proxyEvent_ = function(targetName, event) {
  // Poll and send an update right before we send the event.  Some events
  // indicate an attribute change, so that change should be visible when the
  // event is handled.
  this.pollAttributes_();

  this.sendMessage_({
    'type': 'event',
    'targetName': targetName,
    'event': event
  });
};


/**
 * @private
 * @suppress {unnecessaryCasts}
 */
shaka.cast.CastReceiver.prototype.pollAttributes_ = function() {
  // The poll timer may have been pre-empted by an event.
  // To avoid polling too often, we clear it here.
  if (this.pollTimerId_ != null) {
    window.clearTimeout(this.pollTimerId_);
  }
  // Since we know the timer has been cleared, start a new one now.
  // This will be preempted by events, including 'timeupdate'.
  this.pollTimerId_ = window.setTimeout(this.pollAttributes_.bind(this), 500);

  var update = {
    'video': {},
    'player': {}
  };

  shaka.cast.CastUtils.VideoAttributes.forEach(function(name) {
    update['video'][name] = this.video_[name];
  }.bind(this));

  shaka.cast.CastUtils.PlayerGetterMethods.forEach(function(name) {
    update['player'][name] = /** @type {Object} */(this.player_)[name]();
  }.bind(this));

  // Volume attributes are tied to the system volume.
  var manager = cast.receiver.CastReceiverManager.getInstance();
  var systemVolume = manager.getSystemVolume();
  if (systemVolume) {
    update['video']['volume'] = systemVolume.level;
    update['video']['muted'] = systemVolume.muted;
  }

  this.sendMessage_({
    'type': 'update',
    'update': update
  });
};


/**
 * Dispatch a fake 'volumechange' event to mimic the video element, since volume
 * changes are routed to the system volume on the receiver.
 * @private
 */
shaka.cast.CastReceiver.prototype.fakeVolumeChangeEvent_ = function() {
  // Volume attributes are tied to the system volume.
  var manager = cast.receiver.CastReceiverManager.getInstance();
  var systemVolume = manager.getSystemVolume();
  goog.asserts.assert(systemVolume, 'System volume should not be null!');

  if (systemVolume) {
    // Send an update message with just the latest volume level and muted state.
    this.sendMessage_({
      'type': 'update',
      'update': {
        'video': {
          'volume': systemVolume.level,
          'muted': systemVolume.muted
        }
      }
    });
  }

  // Send another message with a 'volumechange' event to update the sender's UI.
  this.sendMessage_({
    'type': 'event',
    'targetName': 'video',
    'event': {'type': 'volumechange'}
  });
};


/**
 * Since this method is in the compiled library, make sure all messages are
 * read with quoted properties.
 * @param {cast.receiver.CastMessageBus.Event} event
 * @private
 */
shaka.cast.CastReceiver.prototype.onMessage_ = function(event) {
  var message = shaka.cast.CastUtils.deserialize(event.data);
  shaka.log.debug('CastReceiver: message', message);

  switch (message['type']) {
    case 'init':
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
    case 'set':
      var targetName = message['targetName'];
      var property = message['property'];
      var value = message['value'];

      if (targetName == 'video') {
        // Volume attributes must be rerouted to the system.
        var manager = cast.receiver.CastReceiverManager.getInstance();
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
    case 'call':
      var targetName = message['targetName'];
      var methodName = message['methodName'];
      var args = message['args'];
      var target = this.targets_[targetName];
      target[methodName].apply(target, args);
      break;
    case 'asyncCall':
      var targetName = message['targetName'];
      var methodName = message['methodName'];
      var args = message['args'];
      var id = message['id'];
      var senderId = event.senderId;
      var target = this.targets_[targetName];
      var p = target[methodName].apply(target, args);
      // Replies must go back to the specific sender who initiated, so that we
      // don't have to deal with conflicting IDs between senders.
      p.then(this.sendAsyncComplete_.bind(this, senderId, id, /* error */ null),
             this.sendAsyncComplete_.bind(this, senderId, id));
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
  this.sendMessage_({
    'type': 'asyncComplete',
    'id': id,
    'error': error
  }, senderId);
};


/**
 * Since this method is in the compiled library, make sure all messages passed
 * in here were created with quoted property names.
 * @param {!Object} message
 * @param {string=} opt_senderId
 * @private
 */
shaka.cast.CastReceiver.prototype.sendMessage_ =
    function(message, opt_senderId) {
  // Cuts log spam when debugging the receiver UI in Chrome.
  if (!this.isConnected_) return;

  var serialized = shaka.cast.CastUtils.serialize(message);
  if (opt_senderId) {
    this.bus_.getCastChannel(opt_senderId).send(serialized);
  } else {
    this.bus_.broadcast(serialized);
  }
};
