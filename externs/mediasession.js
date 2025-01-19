/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @fileoverview Externs for MediaSession based on
 * {@link https://bit.ly/2Id3dGD Editor's Draft, 12 January 2017}
 *
 * @externs
 */


const MediaMetadata = class {
  constructor(options) {
    /** @type {string} */
    this.title;

    /** @type {string} */
    this.artist;

    /** @type {!Object} */
    this.artwork;
  }
};


const MediaSession = class {
  constructor() {
    /** @type {?MediaMetadata} */
    this.metadata;
  }

  setActionHandler(type, callback) {
    /** @type {string} */
    this.type = type;

    /**
     * @type {!function(!{action: string, seekOffset: ?number,
     *                   seekTime: ?number})}
     */
    this.callback = callback;
  }

  /**
   * @param {?{duration: ?number, playbackRate: ?number,
   *         position: ?number}=} stateDict
   */
  setPositionState(stateDict) {}
};


/** @type {MediaSession} */
Navigator.prototype.mediaSession;
