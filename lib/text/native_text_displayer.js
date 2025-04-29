/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 */

goog.provide('shaka.text.NativeTextDisplayer');

goog.require('mozilla.LanguageMapping');
goog.require('shaka.text.Utils');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.Platform');
goog.requireType('shaka.Player');

/**
 * A text displayer plugin using the browser's native VTTCue interface.
 *
 * @implements {shaka.extern.TextDisplayer}
 * @export
 */
shaka.text.NativeTextDisplayer = class {
	/**
	 * @param {shaka.Player} player
	 */
	constructor(player) {
		/** @private {?shaka.Player} */
		this.player_ = player;

		/** @private {?HTMLMediaElement} */
		this.video_ = null;

		/** @private {!Map<number, !HTMLTrackElement>} */
		this.trackNodes_ = new Map();

		/** @private {number} */
		this.trackId_ = -1;

		/** @private {boolean} */
		this.visible_ = false;

		/** @private {boolean} */
		this.hasMicroTask_ = false;

		/** @private */
		this.onLoaded_ = () => {
			// shaka.Player.LoadMode.MEDIA_SOURCE
			if (this.player_.getLoadMode() === 2) {
				this.video_ = this.player_.getMediaElement();
				this.player_.addEventListener(
					shaka.util.FakeEvent.EventName.Unloading, this.onUnloading_);
				this.player_.addEventListener(
					shaka.util.FakeEvent.EventName.TextChanged, this.onTextChanged_);
				this.video_.textTracks.addEventListener('change', this.onChange_);
				this.onTextChanged_();
			}
		};

		/** @private */
		this.onUnloading_ = () => {
			this.player_.removeEventListener(
				shaka.util.FakeEvent.EventName.Unloading, this.onUnloading_);
			this.player_.removeEventListener(
				shaka.util.FakeEvent.EventName.TextChanged, this.onTextChanged_);
			this.video_.textTracks.removeEventListener('change', this.onChange_);
			for (const trackNode of this.trackNodes_.values()) {
				trackNode.remove();
			}
			this.trackNodes_.clear();
			this.trackId_ = -1;
			this.video_ = null;
		};

		/** @private */
		this.onTextChanged_ = () => {
			/** @type {!Map<number, !HTMLTrackElement>} */
			const newTrackNodes = new Map();
			const tracks = this.player_.getTextTracks();
			for (const track of tracks) {
				let trackNode;
				if (this.trackNodes_.has(track.id)) {
					trackNode = this.trackNodes_.get(track.id);
					if (!track.active && trackNode.track.mode !== 'disabled') {
						trackNode.track.mode = 'disabled';
					}
					this.trackNodes_.delete(track.id);
				} else {
					trackNode = /** @type {!HTMLTrackElement} */
						(this.video_.ownerDocument.createElement('track'));
					trackNode.kind = shaka.text.NativeTextDisplayer.getTrackKind_(track);
					trackNode.label =
						shaka.text.NativeTextDisplayer.getTrackLabel_(track);
					if (track.language in mozilla.LanguageMapping) {
						trackNode.srclang = track.language;
					}
					if (shaka.util.Platform.isChrome()) {
						// The built-in captions menu in Chrome may refuse to list invalid
						// subtitles. The data URL is just to avoid this.
						trackNode.src = 'data:,WEBVTT';
					}
					trackNode.track.mode = 'disabled';
					this.video_.appendChild(trackNode);
				}
				newTrackNodes.set(track.id, trackNode);
				if (track.active) {
					this.trackId_ = track.id;
				}
			}
			// Remove all tracks that are not in the new list.
			for (const trackNode of this.trackNodes_.values()) {
				trackNode.remove();
			}
			if (this.trackId_ > -1) {
				if (newTrackNodes.has(this.trackId_)) {
					// enable current track after everything else is settled
					const mode = this.visible_ ? 'showing' : 'hidden';
					const track = newTrackNodes.get(this.trackId_).track;
					if (track.mode !== mode) {
						track.mode = mode;
					}
				} else {
					this.trackId_ = -1;
				}
			}
			this.trackNodes_ = newTrackNodes;
		};

		/** @private */
		this.onChange_ = () => {
			if (this.hasMicroTask_) {
				return;
			}
			this.hasMicroTask_ = true;
			Promise.resolve(this.video_).then((video) => {
				this.hasMicroTask_ = false;
				if (this.video_ !== video) {
					return;
				}
				let trackId = -1;
				// Prefer previously selected track.
				if (this.trackId_ > -1) {
					const trackNode = this.trackNodes_.get(this.trackId_);
					if (trackNode.track.mode === 'showing') {
						trackId = this.trackId_;
					} else if (trackNode.track.mode === 'hidden') {
						for (const [
              /** @type {number} */id,
              /** @type {HTMLTrackElement} */trackNode,
						] of /** @type {!Map} */(this.trackNodes_)) {
							if (id !== this.trackId_ && trackNode.track.mode === 'showing') {
								trackId = id;
								break;
							}
						}
						if (trackId < 0) {
							trackId = this.trackId_;
						}
					}
				}
				if (trackId < 0) {
					for (const [
            /** @type {number} */id,
            /** @type {HTMLTrackElement} */trackNode,
					] of /** @type {!Map} */(this.trackNodes_)) {
						if (trackNode.track.mode === 'showing') {
							trackId = id;
							break;
						} else if (trackId === -1 && trackNode.track.mode === 'hidden') {
							trackId = id;
						}
					}
				}
				for (const [
          /** @type {number} */id,
          /** @type {HTMLTrackElement} */trackNode,
				] of /** @type {!Map} */(this.trackNodes_)) {
					const mode = id === trackId
						? this.visible_ ? 'showing' : 'hidden'
						: 'disabled';
					if (trackNode.track.mode != mode) {
						trackNode.track.mode = mode;
					}
				}
				if (this.trackId_ !== trackId) {
					this.trackId_ = trackId;
					this.player_.selectTextTrack(
              /** @type {!shaka.extern.TextTrack} */({ id: trackId }));
				}
			});
		};

		player.addEventListener(
			shaka.util.FakeEvent.EventName.Loaded, this.onLoaded_);
	}

	/**
	 * @override
	 * @export
	 */
	configure(config) {
		// unused
	}

	/**
	 * @override
	 * @export
	 */
	remove(start, end) {
		if (!this.video_ || this.trackId_ < 0) {
			return false;
		}

		shaka.text.Utils.removeCuesFromTextTrack(
			this.trackNodes_.get(this.trackId_).track,
			(cue) => cue.startTime < end && cue.endTime > start);

		return true;
	}

	/**
	 * @override
	 * @export
	 */
	append(cues) {
		if (!this.video_ || this.trackId_ < 0) {
			return;
		}

		shaka.text.Utils.appendCuesToTextTrack(
			this.trackNodes_.get(this.trackId_).track, cues);
	}

	/**
	 * @override
	 * @export
	 */
	destroy() {
		if (this.player_) {
			if (this.video_) {
				this.onUnloading_();
			}
			this.player_.removeEventListener(
				shaka.util.FakeEvent.EventName.Loaded, this.onLoaded_);
			this.player_ = null;
		}
		return Promise.resolve();
	}

	/**
	 * @override
	 * @export
	 */
	isTextVisible() {
		return this.visible_;
	}

	/**
	 * @override
	 * @export
	 */
	setTextVisibility(on) {
		this.visible_ = on;
		if (this.trackId_ > -1) {
			const trackNode = this.trackNodes_.get(this.trackId_);
			if (trackNode) {
				const mode = on ? 'showing' : 'hidden';
				if (trackNode.track.mode !== mode) {
					trackNode.track.mode = mode;
				}
			}
		}
	}

	/**
	 * @override
	 * @export
	 */
	setTextLanguage(language) {
		// unused
	}

	/**
	 * @override
	 * @export
	 */
	enableTextDisplayer() {
		// unused
	}

	/**
	 * @param {!shaka.extern.TextTrack} track
	 * @return {string}
	 * @private
	 */
	static getTrackKind_(track) {
		if (track.forced && shaka.util.Platform.isApple()) {
			return 'forced';
		} else if (
			track.kind === 'caption' || (
				track.roles &&
				track.roles.some(
					(role) => role.includes('transcribes-spoken-dialog')) &&
				track.roles.some(
					(role) => role.includes('describes-music-and-sound'))
			)
		) {
			return 'captions';
		}

		return 'subtitles';
	}

	/**
	 * @param {!shaka.extern.TextTrack} track
	 * @return {string}
	 * @private
	 */
	static getTrackLabel_(track) {
		let label;
		if (track.label) {
			label = track.label;
		} else if (track.language) {
			if (track.language in mozilla.LanguageMapping) {
				label = mozilla.LanguageMapping[track.language];
			} else {
				const language = shaka.util.LanguageUtils.getBase(track.language);
				if (language in mozilla.LanguageMapping) {
					label =
						`${mozilla.LanguageMapping[language]} (${track.language})`;
				}
			}
		}
		if (!label) {
			label = track.originalTextId;
			if (track.language && track.language !== track.originalTextId) {
				label += ` (${track.language})`;
			}
		}

		return label;
	}
};
