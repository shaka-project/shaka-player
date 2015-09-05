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
 * Chromecast receiver functionality.
 * @class
 */
var receiver = function() {};


/**
 * @const {string}
 * @private
 */
receiver.MESSAGE_NAMESPACE_ = 'urn:x-cast:com.shaka.cast.messages';


/**
 * @type {cast.receiver.CastReceiverManager}
 * @private
 */
receiver.castReceiverManager_ = null;


/**
 * @type {cast.receiver.CastMessageBus}
 * @private
 */
receiver.messageBus_ = null;  // custom message bus


/**
 * @const {number} The ms to remain idle before killing the receiver app.
 * @private
 */
receiver.IDLE_TIMEOUT_ = 1000 * 60 * 5; // 5 minutes


/**
 * @type {?number} Id of the idle timer.
 * @private
 */
receiver.idleTimer_ = null;


/**
 * Initializes the receiver.
 */
receiver.initialize = function() {

  receiver.castReceiverManager_ =
      cast.receiver.CastReceiverManager.getInstance();

  receiver.castReceiverManager_.onSenderDisconnected = function(event) {
    if (receiver.castReceiverManager_.getSenders().length == 0) {
      if (event.reason ==
          cast.receiver.system.DisconnectReason.REQUESTED_BY_SENDER) {
        window.close();
      }
    }
  };

  receiver.messageBus_ = receiver.castReceiverManager_.getCastMessageBus(
      receiver.MESSAGE_NAMESPACE_);
  /**
   * Handles messages from the sender. event.data will be objects with a
   * type and value.
   * @param {Event} event The message event.
   */
  receiver.messageBus_.onMessage = function(event) {
    var message = JSON.parse(event['data']);
    switch (message['type']) {
      case 'loadStream':
        receiverApp.loadDashStream(message['value']);
        break;
      case 'play':
        receiverApp.play();
        break;
      case 'pause':
        receiverApp.pause();
        break;
      case 'setCurrentTime':
        receiverApp.setCurrentTime(message['value']);
        break;
      case 'mute':
        receiverApp.mute(message['value']);
        break;
      case 'setVolume':
        receiverApp.setVolume(message['value']);
    }
  };

  receiver.castReceiverManager_.start();
  receiver.setIdleTimeout(receiver.IDLE_TIMEOUT_);
};


/**
 * Sets an idle timeout.
 * @param {number} timeout Time in milliseconds before the idle player
 *    terminates.
 */
receiver.setIdleTimeout = function(timeout) {
  // If starts playing before timeout, the timer will be cancelled.
  if (receiver.idleTimer) {
    window.clearTimeout(receiver.idleTimer);
  }
  receiver.idleTimer = window.setTimeout(function() {
    window.close();
  }, timeout);
};


/**
 * Cancels idle timeout.
 */
receiver.cancelIdleTimeout = function() {
  if (receiver.idleTimer) {
    window.clearTimeout(receiver.idleTimer);
  }
  receiver.IdleTimeout = null;
};


/**
 * Broadcast message to all senders via custom message channel.
 * @param {string} type The type of message.
 * @param {*} value The value of the message.
 */
receiver.broadcast = function(type, value) {
  receiver.messageBus_.broadcast(
      JSON.stringify({'type': type, 'value': value}));
};
