/**
 * @license
 * Copyright 2015 Google Inc.
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


/**
 * Chromecast sender functionality.
 * @class
 */
var sender = function() {};


/**
 * Custom message namespace for shaka cast app.
 * @const {string}
 **/
sender.MESSAGE_NAMESPACE = 'urn:x-cast:com.shaka.cast.messages';


/**
 * The registered ID of the shaka receiver app.
 * @const {string}
 */
sender.RECEIVER_APP_ID = '2CE0930D';


/**
 * Current session object.
 * @type {chrome.cast.Session}
 */
sender.session = null;


/**
 * The casted video's seconds buffered ahead the current time.
 * @type {string}
 */
sender.bufferedAheadDebug = '0 seconds';


/**
 * The casted video's seconds buffered behind the current time.
 * @type {string}
 */
sender.bufferedBehindDebug = '0 seconds';


/**
 * The casted video's resolution.
 * @type {string}
 */
sender.videoResDebug = '0 x 0';


/**
 * The states of the cast connection.
 * @enum {number}
 */
sender.states = {
  CAST_UNAVAILABLE: 0,
  CAST_AVAILABLE: 1,
  CAST_CONNECTED: 2
};


/**
 * The current state of the cast connection.
 * @type {number}
 */
sender.state = sender.states.CAST_UNAVAILABLE;


/** @type {number} */
sender.currentMediaTime = 0;


/** @type {number} */
sender.currentMediaDuration = 0;


/**
 * @typedef {{
 *    length: number,
 *    start: number,
 *    end: number
 *  }}
 */
sender.MediaBuffered;


/** @type {sender.MediaBuffered} */
sender.currentMediaBuffered = {'start': 0, 'end': 0, 'length': 0};


/** @type {boolean} */
sender.currentMediaMuted = false;


/** @type {number} */
sender.currentMediaVolume = 1;


/**
 * Called when Google Cast API is available.
 * @param {boolean} loaded
 * @param {string} errorInfo
 */
window.__onGCastApiAvailable = function(loaded, errorInfo) {
  if (loaded) {
    sender.initialize();
  } else {
    sender.onError(errorInfo);
  }
};


/**
 * Initializes the sender
 */
sender.initialize = function() {
  var sessionRequest = new chrome.cast.SessionRequest(sender.RECEIVER_APP_ID);
  var apiConfig = new chrome.cast.ApiConfig(
      sessionRequest,
      sender.onSessionConnection_,
      // On receiver connection callback not needed at this time.
      function() {});

  chrome.cast.initialize(
      apiConfig,
      sender.onInitSuccess_,
      sender.onError.bind(null, 'Chromecast sender initialization error.'));
};


/**
 * On successful initialization update app state.
 * @private
 */
sender.onInitSuccess_ = function() {
  sender.onSuccess('Chromecast sender initialization success.');
  sender.state = sender.states.CAST_AVAILABLE;
  playerControls.displayCastConnection(false);
};


/**
 * Launches a casting session.
 */
sender.launch = function() {
  chrome.cast.requestSession(
      sender.onSessionConnection_, sender.onError.bind(null, 'Launch Error'));
};


/**
 * Updates the app state on session connection.
 * @param {chrome.cast.Session} newSession The current cast session.
 * @private
 */
sender.onSessionConnection_ = function(newSession) {
  sender.session = newSession;
  sender.state = sender.states.CAST_CONNECTED;
  app.switchStreamToCast();
  app.enableStreamOptions(false);
  playerControls.displayCastConnection(true);
  sender.session.addUpdateListener(sender.onSessionUpdate_);
  sender.session.addMessageListener(
      sender.MESSAGE_NAMESPACE, sender.onReceiverMessage_);
};


/**
 * Handles updates to the current session.
 * @param {boolean} status True if the session is still alive.
 * @private
 */
sender.onSessionUpdate_ = function(status) {
  if (!status) {
    sender.onAppStopped_();
  }
};


/**
 * Stops casting.
 */
sender.stop = function() {
  if (!sender.session) return;
  sender.session.stop(
      sender.onSuccess.bind(null, 'Stopping Cast'),
      sender.onError.bind(null, 'Error stopping app'));
};


/**
 * Updates app state when casting stopped.
 * @private
 */
sender.onAppStopped_ = function() {
  sender.session = null;
  sender.state = sender.states.CAST_AVAILABLE;
  app.enableStreamOptions(true);
  playerControls.displayCastConnection(false);
};


/**
 * Loads the given stream into the cast receiver.
 * @param {Object} value The type of stream and list of arguments.
 */
sender.loadStream = function(value) {
  sender.sendMessage({'type': 'loadStream', 'value': value});
};


/**
 * Sends a play command to the cast receiver.
 */
sender.play = function() {
  sender.sendMessage({'type': 'play'});
};


/**
 * Sends a pause command to the cast receiver.
 */
sender.pause = function() {
  sender.sendMessage({'type': 'pause'});
};


/**
 * Sends a play command to change the current video time to cast receiver.
 * @param {number} time The new current time.
 */
sender.setCurrentTime = function(time) {
  sender.sendMessage({'type': 'setCurrentTime', 'value': time});
};


/**
 * Sends a mute/un-mute command to the cast receiver.
 * @param {boolean} mute True to mute, false to un-mute.
 */
sender.mute = function(mute) {
  sender.sendMessage({'type': 'mute', 'value': mute});
};


/**
 * Sends a command to change the video volume to the cast receiver.
 * @param {number} volume The new volume.
 */
sender.setVolume = function(volume) {
  sender.sendMessage({'type': 'setVolume', 'value': volume});
};


/**
 * Handles messages from the receiver application.
 * @param {string} namespace The message namespace.
 * @param {string} message A message string.
 * @private
 */
sender.onReceiverMessage_ = function(namespace, message) {
  var info = JSON.parse(message);
  switch (info['type']) {
    case 'currentTime' :
      sender.currentMediaTime = info['value'];
      playerControls.updateTimeAndSeekRange();
      break;
    case'playing' :
      sender.currentMediaDuration = info['value'];
      playerControls.displayPlayButton(false);
      break;
    case 'paused' :
      playerControls.displayPlayButton(true);
      break;
    case 'buffered' :
      sender.currentMediaBuffered = info['value'];
      break;
    case 'volume' :
      sender.currentMediaVolume = info['value'].volume;
      sender.currentMediaMuted = info['value'].muted;
      playerControls.onVolumeChange();
      break;
    case 'debugInfo':
      var debugInfo = info['value'];
      sender.bufferedAheadDebug = debugInfo['bufferedAheadDebug'];
      sender.bufferedBehindDebug = debugInfo['bufferedBehindDebug'];
      sender.videoResDebug = debugInfo['videoResDebug'];
      break;
    case 'error' :
      sender.onError(info['value']);
      break;
  }
};


/**
 * Sends a message to the current session, if one is open.
 * @param {!Object|string} message A message object
 */
sender.sendMessage = function(message) {
  if (sender.session) {
    sender.session.sendMessage(
        sender.MESSAGE_NAMESPACE,
        message,
        sender.onSuccess.bind(null, 'Message sent: ' + JSON.stringify(message)),
        sender.onError.bind(
            null, 'Error sending message: ' + JSON.stringify(message)));
  }
};


/**
 * Error callback
 * @param {string} message An error message.
 */
sender.onError = function(message) {
  console.error(message);
};


/**
 * Success callback
 * @param {string} message A success message.
 */
sender.onSuccess = function(message) {
  console.debug(message);
};
