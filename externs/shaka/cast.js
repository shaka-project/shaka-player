
shaka.extern = {};
/**
 * @interface
 * @extends {EventTarget}
 */
shaka.extern.CastProxy = function() {};
/**
 * Get a proxy for the video element that delegates to local and remote video
 * elements as appropriate.
 * @suppress {invalidCasts} to cast proxy Objects to unrelated types
 * @return {!HTMLMediaElement}
 */
shaka.extern.CastProxy.prototype.getVideo = function() {};
/**
 * Get a proxy for the Player that delegates to local and remote Player objects
 * as appropriate.
 * @suppress {invalidCasts} to cast proxy Objects to unrelated types
 * @return {!shaka.Player}
 */
shaka.extern.CastProxy.prototype.getPlayer = function() {};
/**
 * @return {boolean} True if the cast API is available and there are receivers.
 */
shaka.extern.CastProxy.prototype.canCast = function() {};
/**
 * @return {boolean} True if we are currently casting.
 */
shaka.extern.CastProxy.prototype.isCasting = function() {};
/**
 * @return {string} The name of the Cast receiver device, if isCasting().
 */
shaka.extern.CastProxy.prototype.receiverName = function() {};
/**
 * @return {!Promise} Resolved when connected to a receiver.  Rejected if the
 *   connection fails or is canceled by the user.
 */
shaka.extern.CastProxy.prototype.cast = function() {};
/**
 * Set application-specific data.
 * @param {Object} appData Application-specific data to relay to the receiver.
 */
shaka.extern.CastProxy.prototype.setAppData = function(appData) {};
/**
 * Show a dialog where user can choose to disconnect from the cast connection.
 */
shaka.extern.CastProxy.prototype.suggestDisconnect = function() {};
/**
 * @param {string} newAppId
 * @return {!Promise}
 */
shaka.extern.CastProxy.prototype.changeReceiverId = function(newAppId) {};
/**
 * Force the receiver app to shut down by disconnecting.
 */
shaka.extern.CastProxy.prototype.forceDisconnect = function() {};

